import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { agentsStoreContract } from './helpers/agents-store-contract.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { AgentsService } from '../src/modules/agents/service.js';
import { AgentsRepository, DrizzleAgentsUnitOfWork } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-versions] Docker not available — skipping integration tests.');
}

/**
 * Agent version history — the read path over `agent_versions` snapshots that
 * `POST/PUT /agents` already write. Covers: a fresh agent has v1, a config edit
 * appends v2 (newest-first), single-version fetch, and the 404s (unknown agent,
 * unknown version, cross-workspace).
 */
d('agents module (Postgres)', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'Versioned Agent',
    provider: 'openai' as const,
    model: 'gpt-4o-mini',
    system_prompt: 'Review the diff.',
  };

  it('a new agent has exactly one version (v1) capturing its config', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/agents', payload: createBody });
    expect(created.statusCode).toBe(201);
    const agentId = created.json().id as string;

    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` });
    expect(res.statusCode).toBe(200);
    const versions = res.json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({
      agent_id: agentId,
      version: 1,
      config: { provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review the diff.' },
    });
    expect(typeof versions[0].created_at).toBe('string');
    await app.close();
  });

  it('a config edit appends a new version; list is newest-first', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    // A config-affecting change (model) bumps the version → snapshot v2.
    const updated = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}`,
      payload: { model: 'gpt-4o' },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[0].config.model).toBe('gpt-4o');
    expect(versions[1].config.model).toBe('gpt-4o-mini');
    await app.close();
  });

  it('toggling enabled does NOT create a new version', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;

    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { enabled: false } });

    const versions = (
      await app.inject({ method: 'GET', url: `/agents/${agentId}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('GET /agents/:id/versions/:version returns one snapshot', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;
    await app.inject({ method: 'PUT', url: `/agents/${agentId}`, payload: { model: 'gpt-4o' } });

    const v1 = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/1` });
    expect(v1.statusCode).toBe(200);
    expect(v1.json()).toMatchObject({ version: 1, config: { model: 'gpt-4o-mini' } });
    await app.close();
  });

  it('404s for an unknown agent and an unknown version', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect(
      (await app.inject({ method: 'GET', url: `/agents/${ghost}/versions` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${ghost}/versions/1` })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/99` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('a non-numeric :version is rejected at the edge (422, not 404)', async () => {
    const app = await makeApp();
    const agentId = (
      await app.inject({ method: 'POST', url: '/agents', payload: createBody })
    ).json().id as string;
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/abc` });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it('versions are workspace-scoped: another tenant cannot read them', async () => {
    const { db } = pg.handle;
    // An agent that lives in a DIFFERENT workspace than the request context.
    const [otherWs] = await db.insert(t.workspaces).values({ name: 'other' }).returning();
    // The real adapters, wired by hand the way the routes plugin does.
    const service = new AgentsService({
      store: new AgentsRepository(db),
      uow: new DrizzleAgentsUnitOfWork(db),
      listModels: async () => [],
    });
    const foreign = await service.create(otherWs!.id, {
      name: 'Foreign',
      provider: 'openai',
      model: 'gpt-4o-mini',
      system_prompt: 'x',
    });

    const [{ id: defaultWs }] = await db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));

    // Owner can read; a different workspace is denied (undefined → 404 at route).
    expect(await service.listVersions(otherWs!.id, foreign.id)).toHaveLength(1);
    expect(await service.listVersions(defaultWs!, foreign.id)).toBeUndefined();
    expect(await service.getVersion(defaultWs!, foreign.id, 1)).toBeUndefined();
  });

  /**
   * Create a workspace with a unique name.
   * @returns Its id.
   */
  async function newWorkspace(): Promise<string> {
    const [ws] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `agents-it-${randomUUID()}` })
      .returning();
    return ws!.id;
  }

  /**
   * Create a skill that agents can link to. Names are unique per workspace (index
   * `skills_workspace_name_uq`), so each call gets its own.
   * @param workspaceId Owner workspace.
   * @returns Its id.
   */
  async function newSkill(workspaceId: string): Promise<string> {
    const name = `skill-${randomUUID()}`;
    const [skill] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name, description: 'skill', type: 'custom', source: 'manual', body: 'x' })
      .returning();
    return skill!.id;
  }

  /**
   * The default (seeded) workspace that requests resolve to.
   * @returns Its id.
   */
  async function defaultWorkspace(): Promise<string> {
    const [ws] = await pg.handle.db
      .select({ id: t.workspaces.id })
      .from(t.workspaces)
      .where(eq(t.workspaces.name, 'default'));
    return ws!.id;
  }

  agentsStoreContract('AgentsRepository (Postgres)', async () => {
    const workspaceId = await newWorkspace();
    const otherWorkspaceId = await newWorkspace();
    return {
      store: new AgentsRepository(pg.handle.db),
      workspaceId,
      otherWorkspaceId,
      skillIds: [await newSkill(workspaceId), await newSkill(workspaceId)],
      foreignSkillId: await newSkill(otherWorkspaceId),
    };
  });

  it('concurrent skill appends get distinct positions', async () => {
    const { db } = pg.handle;
    const workspaceId = await newWorkspace();
    const service = new AgentsService({
      store: new AgentsRepository(db),
      uow: new DrizzleAgentsUnitOfWork(db),
      listModels: async () => [],
    });
    const agent = await service.create(workspaceId, createBody);
    const skills = [await newSkill(workspaceId), await newSkill(workspaceId), await newSkill(workspaceId)];
    await Promise.all(skills.map((id) => service.linkSkill(workspaceId, agent.id, id)));
    const links = (await service.skillLinks(workspaceId, agent.id))!;
    expect(links.map((l) => l.order).sort()).toEqual([0, 1, 2]);
  });

  it('a corrupt stored snapshot is a 500, not a request validation error', async () => {
    const app = await makeApp();
    const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: createBody })).json().id;
    await pg.handle.db.insert(t.agentVersions).values({ agentId, version: 2, configJson: { model: 42 } });
    const res = await app.inject({ method: 'GET', url: `/agents/${agentId}/versions/2` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });

  it('a failure inside the unit of work leaves no partial writes', async () => {
    const { db } = pg.handle;
    const workspaceId = await newWorkspace();
    const uow = new DrizzleAgentsUnitOfWork(db);
    await expect(
      uow.run(async (store) => {
        await store.insert(workspaceId, { ...createBody, createdBy: null }, 1);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await new AgentsRepository(db).list(workspaceId)).toEqual([]);
  });

  it('concurrent config edits get consecutive versions and keep every snapshot', async () => {
    const { db } = pg.handle;
    const workspaceId = await newWorkspace();
    const service = new AgentsService({
      store: new AgentsRepository(db),
      uow: new DrizzleAgentsUnitOfWork(db),
      listModels: async () => [],
    });
    const agent = await service.create(workspaceId, createBody);
    await Promise.all([
      service.update(workspaceId, agent.id, { system_prompt: 'A' }),
      service.update(workspaceId, agent.id, { system_prompt: 'B' }),
      service.update(workspaceId, agent.id, { enabled: false }),
    ]);
    const final = await service.get(workspaceId, agent.id);
    const versions = (await service.listVersions(workspaceId, agent.id))!;
    expect(final).toMatchObject({ version: 3, enabled: false });
    expect(versions.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions[0]!.config.system_prompt).toBe(final!.system_prompt);
  });

  describe('routes with response schemas', () => {
    const models = [{ id: 'gpt-4.1', provider: 'openai' as const, label: 'GPT-4.1', created: 1700000000 }];

    function makeAppWithLlm() {
      const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
      return buildApp({
        config,
        db: pg.handle.db,
        overrides: {
          git: new MockGitClient(),
          github: new MockGitHubClient(),
          llm: { openai: new MockLLMProvider('openai', { models }) },
        },
      });
    }

    it('DELETE /agents/:id returns { ok: true }, then 404', async () => {
      const app = await makeAppWithLlm();
      const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: createBody })).json().id;
      const first = await app.inject({ method: 'DELETE', url: `/agents/${agentId}` });
      expect(first.statusCode).toBe(200);
      expect(first.json()).toEqual({ ok: true });
      expect((await app.inject({ method: 'DELETE', url: `/agents/${agentId}` })).statusCode).toBe(404);
      await app.close();
    });

    it('POST/GET /agents/:id/skills set, append and list linked skills', async () => {
      const app = await makeAppWithLlm();
      const ws = await defaultWorkspace();
      const [a, b, c] = [await newSkill(ws), await newSkill(ws), await newSkill(ws)];
      const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: createBody })).json().id;
      const url = `/agents/${agentId}/skills`;

      const set = await app.inject({ method: 'POST', url, payload: { skill_ids: [b, a] } });
      expect(set.statusCode).toBe(200);
      expect(set.json()).toEqual([
        { agent_id: agentId, skill_id: b, order: 0 },
        { agent_id: agentId, skill_id: a, order: 1 },
      ]);
      const linked = await app.inject({ method: 'POST', url, payload: { skill_id: c } });
      expect(linked.statusCode).toBe(200);
      expect(linked.json().map((l: { skill_id: string }) => l.skill_id)).toEqual([b, a, c]);
      const listed = await app.inject({ method: 'GET', url });
      expect(listed.statusCode).toBe(200);
      expect(listed.json()).toEqual(linked.json());
      await app.close();
    });

    it('POST /agents/:id/skills rejects mixed, duplicate and negative-order bodies with 422', async () => {
      const app = await makeAppWithLlm();
      const ws = await defaultWorkspace();
      const a = await newSkill(ws);
      const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: createBody })).json().id;
      const url = `/agents/${agentId}/skills`;
      for (const payload of [
        { skill_ids: [a], skill_id: a },
        { skill_ids: [a, a] },
        { skill_ids: [a, a.toUpperCase()] },
        { skill_id: a, order: -1 },
        { skill_id: a, order: 2 ** 31 },
        {},
      ]) {
        expect((await app.inject({ method: 'POST', url, payload })).statusCode).toBe(422);
      }
      await app.close();
    });

    it('POST /agents/:id/skills rejects skills of another workspace and unknown ids with 422', async () => {
      const app = await makeAppWithLlm();
      const foreign = await newSkill(await newWorkspace());
      const unknown = '00000000-0000-4000-8000-000000000000';
      const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: createBody })).json().id;
      const url = `/agents/${agentId}/skills`;
      for (const payload of [{ skill_ids: [foreign] }, { skill_id: unknown }]) {
        const res = await app.inject({ method: 'POST', url, payload });
        expect(res.statusCode).toBe(422);
        expect(res.json().error.code).toBe('validation_error');
      }
      expect((await app.inject({ method: 'GET', url })).json()).toEqual([]);
      await app.close();
    });

    it('GET /agents/:id/models and /providers/:id/models return the provider models', async () => {
      const app = await makeAppWithLlm();
      const agentId = (await app.inject({ method: 'POST', url: '/agents', payload: createBody })).json().id;
      const byAgent = await app.inject({ method: 'GET', url: `/agents/${agentId}/models` });
      expect(byAgent.statusCode).toBe(200);
      expect(byAgent.json()).toEqual(models);
      const byProvider = await app.inject({ method: 'GET', url: '/providers/openai/models' });
      expect(byProvider.statusCode).toBe(200);
      expect(byProvider.json()).toEqual(models);
      const ghost = '00000000-0000-0000-0000-000000000000';
      expect((await app.inject({ method: 'GET', url: `/agents/${ghost}/models` })).statusCode).toBe(404);
      await app.close();
    });
  });
});
