import { describe, it, expect, beforeEach } from 'vitest';
import type { Agent, AgentSkillLink, AgentUpdateBody, AgentVersion } from '@devdigest/shared';
import { AgentsService } from '../src/modules/agents/service.js';
import type { AgentsStore, AgentsUnitOfWork, NewAgent } from '../src/modules/agents/ports.js';
import { agentsStoreContract } from './helpers/agents-store-contract.js';

/**
 * Agents use cases against an in-memory fake of their own ports: no Postgres,
 * no Container, no vi.mock. The fake and the real store share agentsStoreContract;
 * the real store is covered by agents-versions.it.test.ts.
 */

/** In-memory AgentsStore; records snapshots so tests can assert on versioning. */
class FakeAgentsStore implements AgentsStore {
  agents = new Map<string, Agent & { workspaceId: string }>();
  versions: AgentVersion[] = [];
  links: AgentSkillLink[] = [];
  /** Ids passed to getForUpdate, so tests can check that updates lock the row. */
  locked: string[] = [];
  /** The version each update call wrote (undefined = kept). */
  updates: { id: string; version: number | undefined }[] = [];
  /** Existing skills: id → workspace. */
  skills = new Map<string, string>();
  private seq = 0;

  async list(workspaceId: string): Promise<Agent[]> {
    return [...this.agents.values()].filter((a) => a.workspaceId === workspaceId).map(strip);
  }
  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const a = this.agents.get(id);
    return a && a.workspaceId === workspaceId ? strip(a) : undefined;
  }
  async getForUpdate(workspaceId: string, id: string): Promise<Agent | undefined> {
    this.locked.push(id);
    return this.get(workspaceId, id);
  }
  async insert(workspaceId: string, input: NewAgent, version: number): Promise<Agent> {
    const id = `agent-${++this.seq}`;
    const agent = {
      id,
      workspaceId,
      name: input.name,
      description: input.description ?? '',
      provider: input.provider,
      model: input.model,
      system_prompt: input.system_prompt,
      output_schema: input.output_schema ?? null,
      enabled: input.enabled ?? true,
      version,
      strategy: input.strategy ?? 'single-pass',
      ci_fail_on: input.ci_fail_on ?? 'critical',
      repo_intel: input.repo_intel ?? true,
    } satisfies Agent & { workspaceId: string };
    this.agents.set(id, agent);
    return strip(agent);
  }
  async update(
    workspaceId: string,
    id: string,
    patch: AgentUpdateBody,
    version?: number,
  ): Promise<Agent | undefined> {
    this.updates.push({ id, version });
    const a = this.agents.get(id);
    if (!a || a.workspaceId !== workspaceId) return undefined;
    const next = { ...a, ...definedOnly(patch), ...(version !== undefined ? { version } : {}) };
    this.agents.set(id, next);
    return strip(next);
  }
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const a = this.agents.get(id);
    if (!a || a.workspaceId !== workspaceId) return false;
    return this.agents.delete(id);
  }
  async snapshotVersion(workspaceId: string, agentId: string, version: number): Promise<void> {
    const a = this.agents.get(agentId);
    if (!a || a.workspaceId !== workspaceId) return;
    if (this.versions.some((v) => v.agent_id === agentId && v.version === version)) return;
    this.versions.push({
      agent_id: agentId,
      version,
      config: {
        provider: a.provider,
        model: a.model,
        system_prompt: a.system_prompt,
        output_schema: a.output_schema,
        strategy: a.strategy,
        ci_fail_on: a.ci_fail_on,
        repo_intel: a.repo_intel,
        skills: this.links.filter((l) => l.agent_id === agentId).map((l) => l.skill_id),
      },
      created_at: new Date(0).toISOString(),
    });
  }
  async listVersions(agentId: string): Promise<AgentVersion[]> {
    return this.versions.filter((v) => v.agent_id === agentId).sort((x, y) => y.version - x.version);
  }
  async getVersion(agentId: string, version: number): Promise<AgentVersion | undefined> {
    return this.versions.find((v) => v.agent_id === agentId && v.version === version);
  }
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    return this.links.filter((l) => l.agent_id === agentId).sort((x, y) => x.order - y.order);
  }
  async replaceSkills(agentId: string, skillIds: string[]): Promise<void> {
    this.links = this.links.filter((l) => l.agent_id !== agentId);
    skillIds.forEach((skill_id, order) => this.links.push({ agent_id: agentId, skill_id, order }));
  }
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    this.links = this.links.filter((l) => !(l.agent_id === agentId && l.skill_id === skillId));
    this.links.push({ agent_id: agentId, skill_id: skillId, order });
  }
  async knownSkillIds(workspaceId: string, skillIds: string[]): Promise<string[]> {
    return skillIds.filter((id) => this.skills.get(id) === workspaceId);
  }
}

/**
 * Drop the fake's tenant column so results match the contract shape.
 * @param a Stored agent.
 * @returns The contract shape.
 */
function strip(a: Agent & { workspaceId: string }): Agent {
  const { workspaceId: _ws, ...agent } = a;
  return agent;
}

/**
 * Keep only the keys a patch actually sets.
 * @param patch Partial update.
 * @returns The same patch without undefined values.
 */
function definedOnly(patch: AgentUpdateBody): Partial<Agent> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<Agent>;
}

/** A unit of work that runs the callback on the same fake store and counts calls. */
function fakeUow(store: AgentsStore): AgentsUnitOfWork & { runs: number } {
  return {
    runs: 0,
    run(work) {
      this.runs += 1;
      return work(store);
    },
  };
}

const WS = 'ws-1';
const body = { name: 'Security', provider: 'openai' as const, model: 'gpt-4o-mini', system_prompt: 'x' };

agentsStoreContract('FakeAgentsStore', async () => {
  const store = new FakeAgentsStore();
  store.skills.set('skill-a', WS);
  store.skills.set('skill-b', WS);
  store.skills.set('skill-foreign', 'ws-other');
  return {
    store,
    workspaceId: WS,
    otherWorkspaceId: 'ws-other',
    skillIds: ['skill-a', 'skill-b'],
    foreignSkillId: 'skill-foreign',
  };
});

describe('AgentsService', () => {
  let store: FakeAgentsStore;
  let uow: ReturnType<typeof fakeUow>;
  let service: AgentsService;

  beforeEach(() => {
    store = new FakeAgentsStore();
    for (const id of ['s1', 's2', 's3']) store.skills.set(id, WS);
    store.skills.set('s-foreign', 'ws-other');
    uow = fakeUow(store);
    service = new AgentsService({ store, uow, listModels: async () => [] });
  });

  it('create stores version 1 and its snapshot in one unit of work', async () => {
    const agent = await service.create(WS, body, 'user-1');
    expect(agent.version).toBe(1);
    expect(await store.listVersions(agent.id)).toHaveLength(1);
    expect(uow.runs).toBe(1);
  });

  it('a config change bumps the version and snapshots it', async () => {
    const agent = await service.create(WS, body);
    const updated = await service.update(WS, agent.id, { model: 'gpt-4o' });
    expect(updated?.version).toBe(2);
    expect((await store.listVersions(agent.id)).map((v) => v.version)).toEqual([2, 1]);
  });

  it('toggling enabled keeps the version and records no snapshot', async () => {
    const agent = await service.create(WS, body);
    const updated = await service.update(WS, agent.id, { enabled: false });
    expect(updated).toMatchObject({ enabled: false, version: 1 });
    expect(await store.listVersions(agent.id)).toHaveLength(1);
  });

  it('update reads the agent with a row lock inside the unit of work', async () => {
    const agent = await service.create(WS, body);
    await service.update(WS, agent.id, { enabled: false });
    expect(store.locked).toEqual([agent.id]);
    expect(uow.runs).toBe(2);
  });

  it('only a config change writes a version; an enabled-only update leaves it alone', async () => {
    const agent = await service.create(WS, body);
    await service.update(WS, agent.id, { model: 'gpt-4o' });
    await service.update(WS, agent.id, { enabled: false });
    expect(store.updates).toEqual([
      { id: agent.id, version: 2 },
      { id: agent.id, version: undefined },
    ]);
  });

  it('modelsForAgent lists the models of the agent provider, scoped by workspace', async () => {
    const withModels = new AgentsService({
      store,
      uow,
      listModels: async (provider) => [{ id: `${provider}-model`, provider }],
    });
    const agent = await withModels.create(WS, body);
    expect(await withModels.modelsForAgent(WS, agent.id)).toEqual([
      { id: 'openai-model', provider: 'openai' },
    ]);
    expect(await withModels.modelsForAgent('ws-other', agent.id)).toBeUndefined();
  });

  it('returns undefined for an agent of another workspace', async () => {
    const agent = await service.create('ws-other', body);
    expect(await service.update(WS, agent.id, { model: 'gpt-4o' })).toBeUndefined();
    expect(await service.listVersions(WS, agent.id)).toBeUndefined();
    expect(await service.skillLinks(WS, agent.id)).toBeUndefined();
  });

  it('linkSkill appends by default; setSkills replaces the ordered set', async () => {
    const agent = await service.create(WS, body);
    await service.linkSkill(WS, agent.id, 's1');
    const appended = await service.linkSkill(WS, agent.id, 's2');
    expect(appended?.map((l) => [l.skill_id, l.order])).toEqual([['s1', 0], ['s2', 1]]);
    const replaced = await service.setSkills(WS, agent.id, ['s3', 's1']);
    expect(replaced?.map((l) => l.skill_id)).toEqual(['s3', 's1']);
  });

  it('skill edits lock the agent and run in one unit of work each', async () => {
    const agent = await service.create(WS, body);
    await service.setSkills(WS, agent.id, ['s1']);
    await service.linkSkill(WS, agent.id, 's2');
    expect(store.locked).toEqual([agent.id, agent.id]);
    expect(uow.runs).toBe(3);
  });

  it('rejects skills of another workspace or unknown ids and links nothing', async () => {
    const agent = await service.create(WS, body);
    await expect(service.setSkills(WS, agent.id, ['s1', 's-foreign'])).rejects.toMatchObject({
      statusCode: 422,
      details: { skill_ids: ['s-foreign'] },
    });
    await expect(service.linkSkill(WS, agent.id, 'missing')).rejects.toMatchObject({ statusCode: 422 });
    expect(await store.skillLinks(agent.id)).toEqual([]);
  });

  it('skill edits return undefined for an agent of another workspace', async () => {
    const agent = await service.create('ws-other', body);
    expect(await service.setSkills(WS, agent.id, ['s1'])).toBeUndefined();
    expect(await service.linkSkill(WS, agent.id, 's1')).toBeUndefined();
  });

  it('listModels degrades to [] when the provider fails', async () => {
    const failing = new AgentsService({
      store,
      uow,
      listModels: async () => {
        throw new Error('OPENAI_API_KEY missing');
      },
    });
    expect(await failing.listModels('openai')).toEqual([]);
  });
});
