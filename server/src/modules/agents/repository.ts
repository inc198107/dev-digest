import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  Agent,
  AgentSkillLink,
  AgentUpdateBody,
  AgentVersion,
  CiFailOn,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { AgentVersionConfig } from '@devdigest/shared';
import type { Db, DbExecutor } from '../../db/client.js';
import type { AgentRow, AgentVersionRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import { DEFAULT_AGENT_DESCRIPTION } from './constants.js';
import type { AgentsStore, AgentsUnitOfWork, NewAgent } from './ports.js';

/**
 * Agents persistence (infrastructure ring). Owns `agents`, `agent_versions` and
 * the agent side of `agent_skills`. Implements the AgentsStore port: every
 * method returns contract shapes, so Drizzle rows never leave this file.
 * Workspace-scoped wherever the caller passes a workspace.
 */

/**
 * Map a persisted agent row to the public `Agent` contract.
 * @param row Drizzle row from `agents`.
 * @returns The contract shape.
 */
function toAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provider: row.provider as Provider,
    model: row.model,
    system_prompt: row.systemPrompt,
    output_schema: row.outputSchema ?? null,
    enabled: row.enabled,
    version: row.version,
    strategy: row.strategy as ReviewStrategy,
    ci_fail_on: row.ciFailOn as CiFailOn,
    repo_intel: row.repoIntel,
  };
}

/**
 * Map an `agent_versions` row to the public `AgentVersion` contract. `config_json`
 * is untyped jsonb (an older snapshot could drift), so it is parsed here: a
 * malformed snapshot throws instead of leaking an unvalidated blob. The error is a
 * plain Error, so the central handler answers 500 (server data is wrong), not the
 * 422 it gives a ZodError (client input is wrong).
 * @param row Drizzle row from `agent_versions`.
 * @returns The contract shape.
 * @throws Error when the stored config does not match `AgentVersionConfig`.
 */
function toAgentVersion(row: AgentVersionRow): AgentVersion {
  const config = AgentVersionConfig.safeParse(row.configJson);
  if (!config.success) {
    throw new Error(`agent_versions: snapshot v${row.version} of agent ${row.agentId} has an invalid config`);
  }
  return {
    agent_id: row.agentId,
    version: row.version,
    config: config.data,
    created_at: row.createdAt.toISOString(),
  };
}

export class AgentsRepository implements AgentsStore {
  /**
   * @param db The shared client, or a transaction when built by the unit of work.
   */
  constructor(private readonly db: DbExecutor) {}

  /**
   * @param workspaceId Tenant scope.
   * @returns Every agent in the workspace.
   */
  async list(workspaceId: string): Promise<Agent[]> {
    const rows = await this.db.select().from(t.agents).where(eq(t.agents.workspaceId, workspaceId));
    return rows.map(toAgent);
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns The agent, or undefined when it is not in this workspace.
   */
  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const row = await this.getById(workspaceId, id);
    return row ? toAgent(row) : undefined;
  }

  /**
   * `SELECT … FOR NO KEY UPDATE`: the row stays locked until the transaction this repository
   * is bound to ends, which serializes concurrent updaters of the agent without blocking
   * inserts that reference it (agent_runs, agent_skills, agent_versions take KEY SHARE).
   * On the shared client the lock is released right away.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns The agent, or undefined when it is not in this workspace.
   */
  async getForUpdate(workspaceId: string, id: string): Promise<Agent | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .for('no key update');
    return row ? toAgent(row) : undefined;
  }

  /**
   * Row-level read used by the reviews module through `container.agentsRepo`.
   * Known debt: reviews should read agents through a facade returning contract
   * shapes; do not add new row-returning methods.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns The raw row, or undefined.
   */
  async getById(workspaceId: string, id: string): Promise<AgentRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row;
  }

  /**
   * Row-level read used by the reviews module (see `getById`).
   * @param workspaceId Tenant scope.
   * @returns Enabled agents as raw rows.
   */
  async listEnabled(workspaceId: string): Promise<AgentRow[]> {
    return this.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.enabled, true)));
  }

  /**
   * Versions and skill links cascade; agent_runs keep their history with agent_id null.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @returns False when no such agent existed in the workspace.
   */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning({ id: t.agents.id });
    return rows.length > 0;
  }

  /**
   * @param workspaceId Tenant scope.
   * @param input The new agent.
   * @param version The version to store on the agent.
   * @returns The stored agent.
   */
  async insert(workspaceId: string, input: NewAgent, version: number): Promise<Agent> {
    const [row] = await this.db
      .insert(t.agents)
      .values({
        workspaceId,
        name: input.name,
        description: input.description ?? DEFAULT_AGENT_DESCRIPTION,
        provider: input.provider,
        model: input.model,
        systemPrompt: input.system_prompt,
        outputSchema: (input.output_schema as object | undefined) ?? null,
        ...(input.strategy !== undefined ? { strategy: input.strategy } : {}),
        ...(input.ci_fail_on !== undefined ? { ciFailOn: input.ci_fail_on } : {}),
        ...(input.repo_intel !== undefined ? { repoIntel: input.repo_intel } : {}),
        enabled: input.enabled ?? true,
        version,
        createdBy: input.createdBy,
      })
      .returning();
    return toAgent(row!);
  }

  /**
   * Write the patch and, when given, the version the use case decided on. No rules here.
   * @param workspaceId Tenant scope.
   * @param id Agent id.
   * @param patch Fields to change.
   * @param version The new version when the config changed; omitted, the stored one is kept.
   * @returns The updated agent, or undefined when it is not in this workspace.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: AgentUpdateBody,
    version?: number,
  ): Promise<Agent | undefined> {
    const values = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.system_prompt !== undefined ? { systemPrompt: patch.system_prompt } : {}),
      ...(patch.output_schema !== undefined ? { outputSchema: patch.output_schema as object } : {}),
      ...(patch.strategy !== undefined ? { strategy: patch.strategy } : {}),
      ...(patch.ci_fail_on !== undefined ? { ciFailOn: patch.ci_fail_on } : {}),
      ...(patch.repo_intel !== undefined ? { repoIntel: patch.repo_intel } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(version !== undefined ? { version } : {}),
    };
    if (Object.keys(values).length === 0) return this.get(workspaceId, id);
    const [row] = await this.db
      .update(t.agents)
      .set(values)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)))
      .returning();
    return row ? toAgent(row) : undefined;
  }

  /**
   * Snapshot the agent's current config and ordered skill ids (idempotent per version).
   * @param workspaceId Tenant scope: an agent of another workspace is not snapshotted.
   * @param agentId Agent id.
   * @param version Version number of the snapshot.
   * @returns Resolves when stored.
   */
  async snapshotVersion(workspaceId: string, agentId: string, version: number): Promise<void> {
    const row = await this.getById(workspaceId, agentId);
    if (!row) return;
    const skills = (await this.skillLinks(agentId)).map((l) => l.skill_id);
    await this.db
      .insert(t.agentVersions)
      .values({
        agentId,
        version,
        configJson: {
          provider: row.provider,
          model: row.model,
          system_prompt: row.systemPrompt,
          output_schema: row.outputSchema,
          strategy: row.strategy,
          ci_fail_on: row.ciFailOn,
          repo_intel: row.repoIntel,
          skills,
        },
      })
      .onConflictDoNothing();
  }

  /**
   * @param agentId Agent id.
   * @returns Config snapshots, newest first.
   */
  async listVersions(agentId: string): Promise<AgentVersion[]> {
    const rows = await this.db
      .select()
      .from(t.agentVersions)
      .where(eq(t.agentVersions.agentId, agentId))
      .orderBy(desc(t.agentVersions.version));
    return rows.map(toAgentVersion);
  }

  /**
   * @param agentId Agent id.
   * @param version Version number.
   * @returns The snapshot, or undefined when that version was never recorded.
   */
  async getVersion(agentId: string, version: number): Promise<AgentVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.agentVersions)
      .where(and(eq(t.agentVersions.agentId, agentId), eq(t.agentVersions.version, version)));
    return row ? toAgentVersion(row) : undefined;
  }

  /**
   * @param agentId Agent id.
   * @returns Links to existing skills, in ascending order.
   */
  async skillLinks(agentId: string): Promise<AgentSkillLink[]> {
    const rows = await this.db
      .select({ skillId: t.skills.id, order: t.agentSkills.order })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .where(eq(t.agentSkills.agentId, agentId))
      .orderBy(asc(t.agentSkills.order));
    return rows.map((r) => ({ agent_id: agentId, skill_id: r.skillId, order: r.order }));
  }

  /**
   * Replace the full set of linked skills, assigning order = index. Two statements: the use
   * case calls it inside `AgentsUnitOfWork.run`, which owns the transaction.
   * @param agentId Agent id.
   * @param skillIds Skill ids in their new order.
   * @returns Resolves when stored.
   */
  async replaceSkills(agentId: string, skillIds: string[]): Promise<void> {
    await this.db.delete(t.agentSkills).where(eq(t.agentSkills.agentId, agentId));
    if (skillIds.length === 0) return;
    await this.db
      .insert(t.agentSkills)
      .values(skillIds.map((skillId, i) => ({ agentId, skillId, order: i })));
  }

  /**
   * @param workspaceId Tenant scope.
   * @param skillIds Requested skill ids.
   * @returns The ids among `skillIds` that are skills of this workspace (Postgres returns uuids
   *   in lower case).
   */
  async knownSkillIds(workspaceId: string, skillIds: string[]): Promise<string[]> {
    if (skillIds.length === 0) return [];
    const rows = await this.db
      .select({ id: t.skills.id })
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), inArray(t.skills.id, skillIds)));
    return rows.map((r) => r.id);
  }

  /**
   * Link a skill at a given order (idempotent: upserts the order).
   * @param agentId Agent id.
   * @param skillId Skill id.
   * @param order Position in the list.
   * @returns Resolves when stored.
   */
  async linkSkill(agentId: string, skillId: string, order: number): Promise<void> {
    await this.db
      .insert(t.agentSkills)
      .values({ agentId, skillId, order })
      .onConflictDoUpdate({
        target: [t.agentSkills.agentId, t.agentSkills.skillId],
        set: { order },
      });
  }
}

/** Unit of work over Drizzle: one transaction, a store bound to it. */
export class DrizzleAgentsUnitOfWork implements AgentsUnitOfWork {
  /**
   * @param db The shared client that opens transactions.
   */
  constructor(private readonly db: Db) {}

  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What `work` returns, after the transaction commits.
   */
  run<T>(work: (store: AgentsStore) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new AgentsRepository(tx)));
  }
}
