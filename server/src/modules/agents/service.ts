import type {
  Agent,
  AgentCreateBody,
  AgentSkillLink,
  AgentUpdateBody,
  AgentVersion,
  ModelInfo,
  Provider,
} from '@devdigest/shared';
import { ValidationError } from '../../platform/errors.js';
import { INITIAL_AGENT_VERSION } from './constants.js';
import { nextSkillOrder, planVersion, unknownSkillIds } from './domain.js';
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
      await store.snapshotVersion(workspaceId, agent.id, INITIAL_AGENT_VERSION);
      return agent;
    });
  }

  /**
   * Update an agent. A config change (anything but `enabled`) bumps the version
   * and snapshots the new config; the decision is the pure `planVersion` rule.
   * The agent row stays locked from the read to the commit, so concurrent updates
   * cannot plan the same version or write back a stale one.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @param patch Fields to change.
   * @returns The updated agent, or undefined (route → 404).
   */
  update(workspaceId: string, id: string, patch: AgentUpdateBody): Promise<Agent | undefined> {
    return this.deps.uow.run(async (store) => {
      const existing = await store.getForUpdate(workspaceId, id);
      if (!existing) return undefined;
      const plan = planVersion(existing, patch);
      if (!plan.bump) return store.update(workspaceId, id, patch);
      const updated = await store.update(workspaceId, id, patch, plan.version);
      if (updated) await store.snapshotVersion(workspaceId, id, plan.version);
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
   * Replace the agent's linked skills with `skillIds`, in that order. Runs in one unit of work
   * with the agent row locked, so concurrent edits of the same agent's skills serialize.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @param skillIds Skill ids in their new order; all must be skills of this workspace.
   * @returns The resulting links, or undefined when the agent is not in this workspace.
   * @throws ValidationError when a skill id is not a skill of this workspace.
   */
  setSkills(
    workspaceId: string,
    agentId: string,
    skillIds: string[],
  ): Promise<AgentSkillLink[] | undefined> {
    return this.deps.uow.run(async (store) => {
      if (!(await store.getForUpdate(workspaceId, agentId))) return undefined;
      await this.assertKnownSkills(store, workspaceId, skillIds);
      await store.replaceSkills(agentId, skillIds);
      return store.skillLinks(agentId);
    });
  }

  /**
   * Link one skill (appended unless an order is given); additive to existing links. Runs in
   * one unit of work with the agent row locked, so concurrent appends get distinct positions.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @param skillId Skill id; must be a skill of this workspace.
   * @param order Requested position.
   * @returns The resulting links, or undefined when the agent is not in this workspace.
   * @throws ValidationError when the skill is not a skill of this workspace.
   */
  linkSkill(
    workspaceId: string,
    agentId: string,
    skillId: string,
    order?: number,
  ): Promise<AgentSkillLink[] | undefined> {
    return this.deps.uow.run(async (store) => {
      if (!(await store.getForUpdate(workspaceId, agentId))) return undefined;
      await this.assertKnownSkills(store, workspaceId, [skillId]);
      const linked = await store.skillLinks(agentId);
      await store.linkSkill(agentId, skillId, nextSkillOrder(linked.length, order));
      return store.skillLinks(agentId);
    });
  }

  /**
   * Reject skill ids that are not skills of the workspace (another tenant's or unknown).
   * @param store Transaction-bound store.
   * @param workspaceId Tenant scope.
   * @param skillIds Requested skill ids.
   * @returns Resolves when every id is known.
   * @throws ValidationError listing the unknown ids.
   */
  private async assertKnownSkills(
    store: AgentsStore,
    workspaceId: string,
    skillIds: string[],
  ): Promise<void> {
    if (skillIds.length === 0) return;
    const unknown = unknownSkillIds(skillIds, await store.knownSkillIds(workspaceId, skillIds));
    if (unknown.length > 0) {
      throw new ValidationError(`Unknown skill id(s): ${unknown.join(', ')}`, { skill_ids: unknown });
    }
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

  /**
   * Model list of the agent's current provider.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @returns Its provider's models (or [] when the provider fails), or undefined when the
   *   agent is not in this workspace.
   */
  async modelsForAgent(workspaceId: string, agentId: string): Promise<ModelInfo[] | undefined> {
    const agent = await this.deps.store.get(workspaceId, agentId);
    if (!agent) return undefined;
    return this.listModels(agent.provider);
  }
}
