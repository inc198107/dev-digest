import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { skillsStoreContract } from './helpers/skills-store-contract.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed, TEST_QUALITY_REVIEWER } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import { DrizzleSkillsUnitOfWork, SkillsRepository } from '../src/modules/skills/repository.js';
import { SkillsService } from '../src/modules/skills/service.js';
import type { TextFetcher } from '../src/modules/skills/ports.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills module on Postgres: the repository against the shared store contract, every route with
 * its response schema, versioning, restore, "used by", the cascade on delete, the seeded Test
 * Quality Reviewer skills and the import previews (which must store nothing).
 */
d('skills module (Postgres)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let otherWorkspaceId: string;
  const fetched: string[] = [];
  const fetcher: TextFetcher = {
    fetch: async (url) => {
      fetched.push(url);
      return {
        url,
        bytes: new TextEncoder().encode('---\nname: remote-skill\ndescription: Flag remote things.\n---\n# Remote'),
      };
    },
  };

  beforeAll(async () => {
    pg = await startPg();
    ({ workspaceId } = await seed(pg.handle.db));
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: 'other-skills' }).returning();
    otherWorkspaceId = other!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /**
   * @returns The API wired to the test database, with a fake URL fetcher.
   */
  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient(), skillFetcher: fetcher },
    });
  }

  /**
   * @param name Skill name.
   * @returns A valid create body.
   */
  const createBody = (name: string) => ({
    name,
    description: 'Flag something specific.',
    type: 'rubric',
    body: '# Rule\n- check it',
  });

  skillsStoreContract('SkillsRepository', async () => ({
    store: new SkillsRepository(pg.handle.db),
    workspaceId,
    otherWorkspaceId,
  }));

  it('seeds the Test Quality Reviewer with its three skills linked in order', async () => {
    const app = await makeApp();
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json() as Array<{
      id: string;
      name: string;
      version: number;
      used_by: { name: string }[];
    }>;
    const seeded = ['untested-branches', 'boundary-cases', 'mocking-discipline'].map((n) =>
      skills.find((s) => s.name === n),
    );
    for (const s of seeded) expect(s).toMatchObject({ version: 1, used_by: [{ name: TEST_QUALITY_REVIEWER }] });

    const [agent] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, TEST_QUALITY_REVIEWER)));
    const links = (await app.inject({ method: 'GET', url: `/agents/${agent!.id}/skills` })).json();
    expect(links.map((l: { skill_id: string }) => l.skill_id)).toEqual(seeded.map((s) => s!.id));

    const versions = (await app.inject({ method: 'GET', url: `/skills/${seeded[0]!.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('a second seed run changes nothing', async () => {
    const before = await pg.handle.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    await seed(pg.handle.db);
    const after = await pg.handle.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
    expect(after).toHaveLength(before.length);
  });

  it('concurrent edits get consecutive versions and keep every body snapshot', async () => {
    const db = pg.handle.db;
    const service = new SkillsService({
      store: new SkillsRepository(db),
      uow: new DrizzleSkillsUnitOfWork(db),
      archive: { list: () => [], read: () => new Uint8Array() },
      fetcher,
      tokens: { count: (text) => text.length },
    });
    const skill = await service.create(workspaceId, { name: 'it-concurrent', description: 'Flag races.', type: 'rubric', body: 'v1' });
    await Promise.all([
      service.update(workspaceId, skill.id, { body: 'body A' }),
      service.update(workspaceId, skill.id, { body: 'body B' }),
      service.update(workspaceId, skill.id, { enabled: false }),
    ]);
    const final = await service.get(workspaceId, skill.id);
    const versions = await service.listVersions(workspaceId, skill.id);
    expect(final).toMatchObject({ version: 3, enabled: false });
    expect(versions?.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions?.[0]?.body).toBe(final?.body);
  });

  it('a failure inside the unit of work leaves no partial writes', async () => {
    const db = pg.handle.db;
    await expect(
      new DrizzleSkillsUnitOfWork(db).run(async (store) => {
        await store.insert(workspaceId, { name: 'it-rollback', description: 'd', type: 'custom', body: 'b', source: 'manual' }, 1);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const names = (await new SkillsRepository(db).list(workspaceId)).map((s) => s.name);
    expect(names).not.toContain('it-rollback');
  });

  it('creates, versions, restores and lists a skill', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody('it-crud') });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill).toMatchObject({ name: 'it-crud', source: 'manual', enabled: true, version: 1 });

    const edited = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { body: '# Rule v2' } });
    expect(edited.json()).toMatchObject({ body: '# Rule v2', version: 2 });
    const retyped = await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { type: 'security' } });
    expect(retyped.json()).toMatchObject({ type: 'security', version: 2 });

    const versions = (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number; body: string }) => [v.version, v.body])).toEqual([
      [2, '# Rule v2'],
      [1, '# Rule\n- check it'],
    ]);

    const restored = await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/1/restore` });
    expect(restored.json()).toMatchObject({ body: '# Rule\n- check it', version: 3 });
    expect((await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/9/restore` })).statusCode).toBe(404);

    const one = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(one).toMatchObject({ id: skill.id, version: 3, used_by: [] });
    await app.close();
  });

  it('rejects a duplicate name with 409 and an invalid body with 422', async () => {
    const app = await makeApp();
    await app.inject({ method: 'POST', url: '/skills', payload: createBody('it-dup') });
    const dup = await app.inject({ method: 'POST', url: '/skills', payload: createBody('it-dup') });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('conflict');

    for (const payload of [
      { ...createBody('Not Kebab') },
      { ...createBody('it-empty'), description: '' },
      { ...createBody('it-empty-body'), body: '   ' },
      { ...createBody('it-extra'), evil: true },
    ]) {
      expect((await app.inject({ method: 'POST', url: '/skills', payload })).statusCode).toBe(422);
    }
    expect((await app.inject({ method: 'PUT', url: `/skills/${crypto.randomUUID()}`, payload: {} })).statusCode).toBe(422);
    expect((await app.inject({ method: 'GET', url: `/skills/${crypto.randomUUID()}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/skills/not-a-uuid' })).statusCode).toBe(422);
    await app.close();
  });

  it('shows who uses a skill and unlinks it from every agent on delete', async () => {
    const app = await makeApp();
    const skill = (await app.inject({ method: 'POST', url: '/skills', payload: createBody('it-used') })).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'It Skills Agent', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [skill.id] } });

    const used = (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).json();
    expect(used.used_by).toEqual([{ agent_id: agent.id, name: 'It Skills Agent' }]);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).json()).toEqual({ ok: true });
    expect((await app.inject({ method: 'GET', url: `/agents/${agent.id}/skills` })).json()).toEqual([]);
    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('lists an agent\'s enabled skills in link order, never another workspace\'s', async () => {
    const app = await makeApp();
    const [a, b, off] = await Promise.all(
      ['it-order-a', 'it-order-b', 'it-order-off'].map(async (n) =>
        (await app.inject({ method: 'POST', url: '/skills', payload: createBody(n) })).json(),
      ),
    );
    await app.inject({ method: 'PUT', url: `/skills/${off.id}`, payload: { enabled: false } });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'It Order Agent', provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
      })
    ).json();
    await app.inject({ method: 'POST', url: `/agents/${agent.id}/skills`, payload: { skill_ids: [b.id, off.id, a.id] } });

    const repo = new SkillsRepository(pg.handle.db);
    expect((await repo.enabledForAgent(workspaceId, agent.id)).map((s) => s.name)).toEqual(['it-order-b', 'it-order-a']);
    expect(await repo.enabledForAgent(otherWorkspaceId, agent.id)).toEqual([]);
    await app.close();
  });

  it('previews imports without storing anything', async () => {
    const app = await makeApp();
    const countSkills = async () =>
      (await pg.handle.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId))).length;
    const before = await countSkills();

    const zipPath = fileURLToPath(new URL('../../docs/examples/skills/flaky-test-patterns.zip', import.meta.url));
    const file = await app.inject({
      method: 'POST',
      url: '/skills/import/file',
      payload: { filename: 'flaky-test-patterns.zip', content_base64: readFileSync(zipPath).toString('base64') },
    });
    expect(file.statusCode).toBe(200);
    expect(file.json()).toMatchObject({
      name: 'flaky-test-patterns',
      source: 'imported_file',
      skill_file: 'flaky-test-patterns/SKILL.md',
      ignored_files: expect.arrayContaining([{ path: 'flaky-test-patterns/scripts/detect-flaky.sh', reason: 'executable' }]),
    });

    const url = await app.inject({
      method: 'POST',
      url: '/skills/import/url',
      payload: { url: 'https://github.com/acme/skills/blob/main/remote/SKILL.md' },
    });
    expect(url.json()).toMatchObject({ name: 'remote-skill', source: 'imported_url' });
    expect(fetched).toEqual(['https://raw.githubusercontent.com/acme/skills/main/remote/SKILL.md']);

    const plain = await app.inject({ method: 'POST', url: '/skills/import/url', payload: { url: 'http://example.com/a.md' } });
    expect(plain.statusCode).toBe(422);
    const notSkill = await app.inject({
      method: 'POST',
      url: '/skills/import/file',
      payload: { filename: 'run.sh', content_base64: Buffer.from('echo hi').toString('base64') },
    });
    expect(notSkill.statusCode).toBe(422);

    expect(await countSkills()).toBe(before);

    const saved = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...createBody('flaky-test-patterns'), body: file.json().body, source: 'imported_file' },
    });
    expect(saved.json()).toMatchObject({ source: 'imported_file', version: 1 });
    await app.close();
  });
});
