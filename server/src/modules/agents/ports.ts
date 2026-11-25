import type {
  Agent,
  AgentCreateBody,
  AgentSkillLink,
  AgentUpdateBody,
  AgentVersion,
  ModelInfo,
  Provider,
} from '@devdigest/shared';

/**
 * Ports of the agents use cases. Declared here, in the core's vocabulary
 * (contract shapes, no Drizzle types); implemented in ./repository.ts and wired
 * by the composition root.
 */

/** A new agent plus who created it. */
export interface NewAgent extends AgentCreateBody {
  createdBy: string | null;
}

/** Persistence of agents, their config snapshots and their skill links. */
export interface AgentsStore {
  /**
   * @param workspaceId Tenant scope.
   * @returns Every agent in the workspace.
   */
  list(workspaceId: string): Promise<Agent[]>;
  /**
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns The agent, or undefined when it is not in this workspace.
   */
  get(workspaceId: string, id: string): Promise<Agent | undefined>;
  /**
   * Read the agent and lock its row until the surrounding unit of work ends, so concurrent
   * read-then-write updates run one after another. Use it only inside `AgentsUnitOfWork.run`.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns The agent, or undefined when it is not in this workspace.
   */
  getForUpdate(workspaceId: string, id: string): Promise<Agent | undefined>;
  /**
   * @param workspaceId Tenant scope.
   * @param input The new agent.
   * @param version The version to store on the agent.
   * @returns The stored agent.
   */
  insert(workspaceId: string, input: NewAgent, version: number): Promise<Agent>;
  /**
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @param patch Fields to change.
   * @param version The new version when the config changed; omit it to keep the stored one.
   * @returns The updated agent, or undefined when it is not in this workspace.
   */
  update(
    workspaceId: string,
    id: string,
    patch: AgentUpdateBody,
    version?: number,
  ): Promise<Agent | undefined>;
  /**
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns False when no such agent existed in the workspace.
   */
  delete(workspaceId: string, id: string): Promise<boolean>;
  /**
   * Record the agent's current config and linked skills as an immutable snapshot. Idempotent
   * per version; does nothing when the agent is not in this workspace.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @param version Version number of the snapshot.
   * @returns Resolves when stored.
   */
  snapshotVersion(workspaceId: string, agentId: string, version: number): Promise<void>;
  /**
   * @param agentId Agent id.
   * @returns Config snapshots, newest first.
   */
  listVersions(agentId: string): Promise<AgentVersion[]>;
  /**
   * @param agentId Agent id.
   * @param version Version number.
   * @returns The snapshot, or undefined when that version was never recorded.
   */
  getVersion(agentId: string, version: number): Promise<AgentVersion | undefined>;
  /**
   * @param agentId Agent id.
   * @returns Linked skills in ascending order.
   */
  skillLinks(agentId: string): Promise<AgentSkillLink[]>;
  /**
   * Replace the whole ordered set of linked skills. Two statements: call it only inside
   * `AgentsUnitOfWork.run`, which owns the transaction.
   * @param agentId Agent id.
   * @param skillIds Skill ids in their new order.
   * @returns Resolves when stored.
   */
  replaceSkills(agentId: string, skillIds: string[]): Promise<void>;
  /**
   * @param workspaceId Tenant scope.
   * @param skillIds Requested skill ids.
   * @returns The ids among `skillIds` that are skills of this workspace (lower case).
   */
  knownSkillIds(workspaceId: string, skillIds: string[]): Promise<string[]>;
  /**
   * Link one skill at a position (upsert).
   * @param agentId Agent id.
   * @param skillId Skill id.
   * @param order Position in the list.
   * @returns Resolves when stored.
   */
  linkSkill(agentId: string, skillId: string, order: number): Promise<void>;
}

/** Runs several store operations atomically. */
export interface AgentsUnitOfWork {
  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What `work` returns, after the transaction commits.
   */
  run<T>(work: (store: AgentsStore) => Promise<T>): Promise<T>;
}

/**
 * Lists the models a provider offers.
 * @param provider Provider id.
 * @returns Its models; may reject when the provider key is missing.
 */
export type ListModels = (provider: Provider) => Promise<ModelInfo[]>;
