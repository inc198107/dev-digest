import type {
  Agent,
  AgentCreateBody,
  AgentSkillLink,
  AgentUpdateBody,
  AgentVersion,
  ModelInfo,
  Provider,
} from '@devdigest/shared';
import { INITIAL_AGENT_VERSION } from './constants.js';
import { nextSkillOrder, planVersion } from './domain.js';
import type { AgentsStore, AgentsUnitOfWork, ListModels } from './ports.js';

/**
 * Agents use cases (application ring) for the Agents tab and the Agent Editor.
 * An agent = provider + model + system prompt + linked skills + output schema +
 * enabled flag; config changes are versioned as immutable snapshots.
 */

/** What the agents use cases need from the outside, injected by the routes plugin. */
export interface AgentsServiceDeps {
  /** Non-transactional reads and single-statement writes. */
  store: AgentsStore;
  /** Atomic multi-statement writes. */
  uow: AgentsUnitOfWork;
  /** Model catalogue of a provider. */
  listModels: ListModels;
}

export class AgentsService {
  /**
   * @param deps Ports this service depends on.
   */
  constructor(private readonly deps: AgentsServiceDeps) {}

  /**
   * @param workspaceId Tenant scope.
   * @returns Every agent in the workspace.
   */
  list(workspaceId: string): Promise<Agent[]> {
    return this.deps.store.list(workspaceId);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns The agent, or undefined (route → 404).
   */
  get(workspaceId: string, id: string): Promise<Agent | undefined> {
    return this.deps.store.get(workspaceId, id);
  }

  /**
   * Delete an agent; its versions and skill links cascade.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns False when no such agent existed.
   */
  delete(workspaceId: string, id: string): Promise<boolean> {
    return this.deps.store.delete(workspaceId, id);
  }

  /**
   * Create an agent and record its first config snapshot in one transaction.
   * @param workspaceId Tenant scope.
   * @param input The new agent.
   * @param userId Creator, when known.
   * @returns The created agent.
   */
  create(workspaceId: string, input: AgentCreateBody, userId?: string): Promise<Agent> {
    return this.deps.uow.run(async (store) => {
      const agent = await store.insert(
        workspaceId,
        { ...input, createdBy: userId ?? null },
        INITIAL_AGENT_VERSION,
      );
      await store.snapshotVersion(agent.id, INITIAL_AGENT_VERSION);
      return agent;
    });
  }

  /**
   * Update an agent. A config change (anything but `enabled`) bumps the version
   * and snapshots the new config; the decision is the pure `planVersion` rule.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @param patch Fields to change.
   * @returns The updated agent, or undefined (route → 404).
   */
  update(workspaceId: string, id: string, patch: AgentUpdateBody): Promise<Agent | undefined> {
    return this.deps.uow.run(async (store) => {
      const existing = await store.get(workspaceId, id);
      if (!existing) return undefined;
      const plan = planVersion(existing, patch);
      const updated = await store.update(workspaceId, id, patch, plan.version);
      if (updated && plan.bump) await store.snapshotVersion(id, plan.version);
      return updated;
    });
  }

  /**
   * Config history, newest first. Workspace-scoped so snapshots can't be read
   * across tenants.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @returns The versions, or undefined when the agent is not in this workspace.
   */
  async listVersions(workspaceId: string, agentId: string): Promise<AgentVersion[] | undefined> {
    if (!(await this.deps.store.get(workspaceId, agentId))) return undefined;
    return this.deps.store.listVersions(agentId);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @param version Version number.
   * @returns The snapshot, or undefined when the agent or version is unknown.
   */
  async getVersion(
    workspaceId: string,
    agentId: string,
    version: number,
  ): Promise<AgentVersion | undefined> {
    if (!(await this.deps.store.get(workspaceId, agentId))) return undefined;
    return this.deps.store.getVersion(agentId, version);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @returns Linked skills in order, or undefined when the agent is not in this workspace.
   */
  async skillLinks(workspaceId: string, agentId: string): Promise<AgentSkillLink[] | undefined> {
    if (!(await this.deps.store.get(workspaceId, agentId))) return undefined;
    return this.deps.store.skillLinks(agentId);
  }

  /**
   * Replace the agent's linked skills with `skillIds`, in that order.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @param skillIds Skill ids in their new order.
   * @returns The resulting links, or undefined when the agent is not in this workspace.
   */
  async setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    if (!(await this.deps.store.get(workspaceId, agentId))) return undefined;
    await this.deps.uow.run((store) => store.replaceSkills(agentId, skillIds));
    return this.deps.store.skillLinks(agentId);
  }

  /**
   * Link one skill (appended unless an order is given); additive to existing links.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @param skillId Skill id.
   * @param order Requested position.
   * @returns The resulting links, or undefined when the agent is not in this workspace.
   */
  async linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    if (!(await this.deps.store.get(workspaceId, agentId))) return undefined;
    const linked = await this.deps.store.skillLinks(agentId);
    await this.deps.store.linkSkill(agentId, skillId, nextSkillOrder(linked.length, order));
    return this.deps.store.skillLinks(agentId);
  }

  /**
   * Dynamic model list of a provider. Degrades to [] when the provider key is not
   * configured, so the editor still renders.
   * @param provider Provider id.
   * @returns Its models, or [].
   */
  async listModels(provider: Provider): Promise<ModelInfo[]> {
    try {
      return await this.deps.listModels(provider);
    } catch {
      return [];
    }
  }
}
