import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import type {
  Skill,
  SkillListItem,
  SkillSource,
  SkillType,
  SkillUpdateBody,
  SkillUsage,
  SkillVersion,
} from '@devdigest/shared';
import type { Db, DbExecutor } from '../../db/client.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import { ConflictError } from '../../platform/errors.js';
import type { AgentSkillsReader, NewSkill, SkillsStore, SkillsUnitOfWork } from './ports.js';

/**
 * Skills persistence (infrastructure ring). Owns `skills` and `skill_versions` and reads the
 * skill side of `agent_skills` ("used by", the skills of an agent's prompt). Implements the
 * SkillsStore and AgentSkillsReader ports: every method returns contract shapes, so Drizzle
 * rows never leave this file. Workspace-scoped wherever the caller passes a workspace.
 */

/** Name of the unique index on `skills (workspace_id, name)`. */
const UNIQUE_NAME_INDEX = 'skills_workspace_name_uq';

/**
 * Map a persisted skill row to the public `Skill` contract.
 * @param row Drizzle row from `skills`.
 * @returns The contract shape.
 */
function toSkill(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as SkillSource,
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

/**
 * @param row Drizzle row from `skill_versions`.
 * @returns The contract shape.
 */
function toSkillVersion(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * Recognize Postgres' unique violation on the skill name. postgres-js throws its error as is;
 * a wrapped error carries it as `cause`.
 * @param err What the query threw.
 * @returns True when the name is already taken in the workspace.
 */
function isDuplicateName(err: unknown): boolean {
  type PgError = { code?: string; constraint_name?: string; cause?: unknown };
  const outer = err as PgError | undefined;
  const pg = (outer?.code ? outer : (outer?.cause as PgError | undefined)) ?? {};
  return pg.code === '23505' && (pg.constraint_name ?? UNIQUE_NAME_INDEX) === UNIQUE_NAME_INDEX;
}

/**
 * Run a write and turn a duplicate-name violation into a 409.
 * @param name The name being written.
 * @param write The insert or update.
 * @returns What the write returns.
 * @throws ConflictError when the name is taken in the workspace.
 */
async function guardName<T>(name: string | undefined, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isDuplicateName(err)) {
      throw new ConflictError(`A skill named "${name ?? ''}" already exists in this workspace`, { name });
    }
    throw err;
  }
}

export class SkillsRepository implements SkillsStore, AgentSkillsReader {
  /**
   * @param db The shared client, or a transaction when built by the unit of work.
   */
  constructor(private readonly db: DbExecutor) {}

  /**
   * @param workspaceId Tenant scope.
   * @returns Every skill of the workspace with the agents that link it, by name.
   */
  async list(workspaceId: string): Promise<SkillListItem[]> {
    const rows = await this.db
      .select()
      .from(t.skills)
      .where(eq(t.skills.workspaceId, workspaceId))
      .orderBy(asc(t.skills.name));
    const usage = await this.usedBy(workspaceId, rows.map((r) => r.id));
    return rows.map((r) => ({ ...toSkill(r), used_by: usage.get(r.id) ?? [] }));
  }

  /**
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns The skill with its users, or undefined when it is not in this workspace.
   */
  async get(workspaceId: string, id: string): Promise<SkillListItem | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    if (!row) return undefined;
    const usage = await this.usedBy(workspaceId, [row.id]);
    return { ...toSkill(row), used_by: usage.get(row.id) ?? [] };
  }

  /**
   * `SELECT … FOR NO KEY UPDATE`: the row stays locked until the transaction this repository
   * is bound to ends; inserts that reference the skill (links, snapshots) are not blocked.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns The skill, or undefined when it is not in this workspace.
   */
  async getForUpdate(workspaceId: string, id: string): Promise<Skill | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .for('no key update');
    return row ? toSkill(row) : undefined;
  }

  /**
   * @param workspaceId Tenant scope.
   * @param input The new skill.
   * @param version The version to store on the skill.
   * @returns The stored skill.
   * @throws ConflictError when the name is taken in the workspace.
   */
  async insert(workspaceId: string, input: NewSkill, version: number): Promise<Skill> {
    const [row] = await guardName(input.name, () =>
      this.db
        .insert(t.skills)
        .values({
          workspaceId,
          name: input.name,
          description: input.description,
          type: input.type,
          source: input.source,
          body: input.body,
          enabled: input.enabled ?? true,
          version,
        })
        .returning(),
    );
    return toSkill(row!);
  }

  /**
   * Write the patch and, when given, the version the use case decided on. No rules here.
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @param patch Fields to change.
   * @param version The new version; omitted, the stored one is kept.
   * @returns The updated skill, or undefined when it is not in this workspace.
   * @throws ConflictError when the new name is taken in the workspace.
   */
  async update(
    workspaceId: string,
    id: string,
    patch: SkillUpdateBody,
    version?: number,
  ): Promise<Skill | undefined> {
    const values = {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.type !== undefined ? { type: patch.type } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(version !== undefined ? { version } : {}),
    };
    if (Object.keys(values).length === 0) return this.getForUpdate(workspaceId, id);
    const [row] = await guardName(patch.name, () =>
      this.db
        .update(t.skills)
        .set(values)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning(),
    );
    return row ? toSkill(row) : undefined;
  }

  /**
   * Agent links and snapshots cascade (FK `on delete cascade`).
   * @param workspaceId Tenant scope.
   * @param id Skill id.
   * @returns False when no such skill existed in the workspace.
   */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning({ id: t.skills.id });
    return rows.length > 0;
  }

  /**
   * @param skillId Skill id.
   * @param version Version number of the snapshot.
   * @param body The body at that version.
   * @returns Resolves when stored (idempotent per version).
   */
  async snapshotVersion(skillId: string, version: number, body: string): Promise<void> {
    await this.db.insert(t.skillVersions).values({ skillId, version, body }).onConflictDoNothing();
  }

  /**
   * @param skillId Skill id.
   * @returns Body snapshots, newest first.
   */
  async listVersions(skillId: string): Promise<SkillVersion[]> {
    const rows = await this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
    return rows.map(toSkillVersion);
  }

  /**
   * @param skillId Skill id.
   * @param version Version number.
   * @returns The snapshot, or undefined when that version was never recorded.
   */
  async getVersion(skillId: string, version: number): Promise<SkillVersion | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row ? toSkillVersion(row) : undefined;
  }

  /**
   * The skills a review run of this agent puts in its prompt: linked, enabled, same workspace
   * as the agent, in link order.
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @returns The skills, or [] when the agent is not in this workspace or links none.
   */
  async enabledForAgent(workspaceId: string, agentId: string): Promise<Skill[]> {
    const rows = await this.db
      .select({ skill: t.skills })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agents.workspaceId, workspaceId),
          eq(t.skills.workspaceId, workspaceId),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skills.name));
    return rows.map((r) => toSkill(r.skill));
  }

  /**
   * The agents of the workspace that link each of the given skills.
   * @param workspaceId Tenant scope.
   * @param skillIds Skills to look up.
   * @returns Skill id → linking agents, by agent name.
   */
  private async usedBy(workspaceId: string, skillIds: string[]): Promise<Map<string, SkillUsage[]>> {
    const usage = new Map<string, SkillUsage[]>();
    if (skillIds.length === 0) return usage;
    const rows = await this.db
      .select({ skillId: t.agentSkills.skillId, agentId: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(and(eq(t.agents.workspaceId, workspaceId), inArray(t.agentSkills.skillId, skillIds)))
      .orderBy(asc(t.agents.name));
    for (const r of rows) {
      const list = usage.get(r.skillId) ?? [];
      list.push({ agent_id: r.agentId, name: r.name });
      usage.set(r.skillId, list);
    }
    return usage;
  }
}

/** Unit of work over Drizzle: one transaction, a store bound to it. */
export class DrizzleSkillsUnitOfWork implements SkillsUnitOfWork {
  /**
   * @param db The shared client that opens transactions.
   */
  constructor(private readonly db: Db) {}

  /**
   * @param work Operations to run against a transaction-bound store.
   * @returns What `work` returns, after the transaction commits.
   */
  run<T>(work: (store: SkillsStore) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new SkillsRepository(tx)));
  }
}
