import { describe, it, expect, beforeEach } from 'vitest';
import type { Agent, AgentSkillLink, AgentUpdateBody, AgentVersion } from '@devdigest/shared';
import { AgentsService } from '../src/modules/agents/service.js';
import type { AgentsStore, AgentsUnitOfWork, NewAgent } from '../src/modules/agents/ports.js';

/**
 * Agents use cases against an in-memory fake of their own ports: no Postgres,
 * no Container, no vi.mock. The real store is covered by agents-versions.it.test.ts.
 */

/** In-memory AgentsStore; records snapshots so tests can assert on versioning. */
class FakeAgentsStore implements AgentsStore {
  agents = new Map<string, Agent & { workspaceId: string }>();
  versions: AgentVersion[] = [];
  links: AgentSkillLink[] = [];
  private seq = 0;

  async list(workspaceId: string): Promise<Agent[]> {
    return [...this.agents.values()].filter((a) => a.workspaceId === workspaceId).map(strip);
  }
  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const a = this.agents.get(id);
    return a && a.workspaceId === workspaceId ? strip(a) : undefined;
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
    version: number,
  ): Promise<Agent | undefined> {
    const a = this.agents.get(id);
    if (!a || a.workspaceId !== workspaceId) return undefined;
    const next = { ...a, ...definedOnly(patch), version };
    this.agents.set(id, next);
    return strip(next);
  }
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const a = this.agents.get(id);
    if (!a || a.workspaceId !== workspaceId) return false;
    return this.agents.delete(id);
  }
  async snapshotVersion(agentId: string, version: number): Promise<void> {
    const a = this.agents.get(agentId)!;
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

describe('AgentsService', () => {
  let store: FakeAgentsStore;
  let uow: ReturnType<typeof fakeUow>;
  let service: AgentsService;

  beforeEach(() => {
    store = new FakeAgentsStore();
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
