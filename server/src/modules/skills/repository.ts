import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type {
  Skill,
  SkillCategoryCount,
  SkillListItem,
  SkillSource,
  SkillType,
  SkillUsage,
  SkillVersion,
} from '@devdigest/shared';
import type { Db, DbExecutor } from '../../db/client.js';
import type { SkillRow, SkillVersionRow } from '../../db/rows.js';
import * as t from '../../db/schema.js';
import { ConflictError } from '../../platform/errors.js';
import { SKILL_STATS_RUN_STATUS, SKILL_STATS_WINDOW_DAYS } from './constants.js';
import type {
  AgentSkillsReader,
  NewSkill,
  SkillPatch,
  SkillStatsReader,
  SkillsStore,
  SkillsUnitOfWork,
  SkillUsageWindow,
} from './ports.js';

/**
 * Skills persistence (infrastructure ring). Owns `skills` and `skill_versions` and reads the
 * skill side of `agent_skills` ("used by", the skills of an agent's prompt). Implements the
 * SkillsStore, AgentSkillsReader and SkillStatsReader ports: every method returns contract
 * shapes, so Drizzle rows never leave this file. Workspace-scoped wherever the caller passes a
 * workspace. The stats are a read-only view over the review tables (`agent_runs`,
 * `run_traces`, `reviews`, `findings`): nothing here writes them.
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
    note: row.note ?? null,
    created_at: row.createdAt.toISOString(),
  };
}

/**
 * The finished runs of a workspace inside the stats window, each with the skill blocks its
 * trace recorded (`prompt_assembly.skill_blocks`; null for a run without a trace or with an
 * older trace). The window is measured with the database clock.
 * @param workspaceId Tenant scope.
 * @returns A SELECT of `id`, `blocks` to use as a CTE body.
 */
function windowRunsSql(workspaceId: string): SQL {
  return sql`
    SELECT ar.id, rt.trace #> '{prompt_assembly,skill_blocks}' AS blocks
    FROM agent_runs ar
    LEFT JOIN run_traces rt ON rt.run_id = ar.id
    WHERE ar.workspace_id = ${workspaceId}
      AND ar.status = ${SKILL_STATS_RUN_STATUS}
      AND ar.ran_at >= now() - make_interval(days => ${SKILL_STATS_WINDOW_DAYS}::int)`;
}

/**
 * jsonb value that a skill-blocks array contains (`@>`) when it holds the skill's block.
 * @param skillId SQL expression yielding the skill id as text.
 * @returns `[{"id": <skill id>}]` as jsonb.
 */
function skillBlockPattern(skillId: SQL): SQL {
  return sql`jsonb_build_array(jsonb_build_object('id', ${skillId}))`;
}

/** One row of the usage query (postgres-js returns the `::int` casts as numbers). */
type UsageRow = {
  skill_id: string;
  runs: number;
  skill_runs: number;
  findings: number;
  accepted: number;
  dismissed: number;
  used_by: number;
};

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

export class SkillsRepository implements SkillsStore, AgentSkillsReader, SkillStatsReader {
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
          evidenceFiles: input.evidence_files ?? null,
        })
        .returning(),
    );
    return toSkill(row!);
  }

  /**
   * Write the patch and, when given, the version the use case decided on. No rules here. Only
   * the listed columns are written: anything else on the object (a version note) is ignored.
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
    patch: SkillPatch,
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
   * @param note What changed in this version, or null.
   * @returns Resolves when stored (idempotent per version).
   */
  async snapshotVersion(skillId: string, version: number, body: string, note?: string | null): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId, version, body, note: note ?? null })
      .onConflictDoNothing();
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
   * Usage of the workspace's skills over the stats window in one statement. The finished runs
   * of the window are read once (each trace detoasted once); a run counts for a skill when its
   * skill blocks contain the skill id (jsonb containment); findings are those of the reviews
   * the run produced (`reviews.run_id`).
   * @param workspaceId Tenant scope.
   * @param skillId Only this skill; omitted, every skill of the workspace.
   * @returns The workspace's run count and the counts per skill, by skill name.
   */
  async usage(workspaceId: string, skillId?: string): Promise<SkillUsageWindow> {
    const onlySkill = skillId === undefined ? sql`` : sql`AND s.id = ${skillId}`;
    const rows = await this.db.execute<UsageRow>(sql`
      WITH window_runs AS MATERIALIZED (${windowRunsSql(workspaceId)}),
      ws_skills AS (
        SELECT s.id, s.name FROM skills s WHERE s.workspace_id = ${workspaceId} ${onlySkill}
      ),
      skill_runs AS (
        SELECT s.id AS skill_id, wr.id AS run_id
        FROM ws_skills s
        JOIN window_runs wr ON wr.blocks @> ${skillBlockPattern(sql`s.id::text`)}
      ),
      run_counts AS (
        SELECT skill_id, count(*)::int AS n FROM skill_runs GROUP BY skill_id
      ),
      finding_counts AS (
        SELECT sr.skill_id,
               count(f.id)::int AS findings,
               count(f.accepted_at)::int AS accepted,
               count(f.dismissed_at)::int AS dismissed
        FROM skill_runs sr
        JOIN reviews rv ON rv.run_id = sr.run_id AND rv.workspace_id = ${workspaceId}
        JOIN findings f ON f.review_id = rv.id
        GROUP BY sr.skill_id
      ),
      links AS (
        SELECT ak.skill_id, count(*)::int AS n
        FROM agent_skills ak
        JOIN agents a ON a.id = ak.agent_id
        WHERE a.workspace_id = ${workspaceId}
        GROUP BY ak.skill_id
      )
      SELECT s.id AS skill_id,
             (SELECT count(*)::int FROM window_runs) AS runs,
             coalesce(rc.n, 0) AS skill_runs,
             coalesce(fc.findings, 0) AS findings,
             coalesce(fc.accepted, 0) AS accepted,
             coalesce(fc.dismissed, 0) AS dismissed,
             coalesce(l.n, 0) AS used_by
      FROM ws_skills s
      LEFT JOIN run_counts rc ON rc.skill_id = s.id
      LEFT JOIN finding_counts fc ON fc.skill_id = s.id
      LEFT JOIN links l ON l.skill_id = s.id
      ORDER BY s.name`);
    const list = [...rows];
    return {
      runs: list[0]?.runs ?? 0,
      skills: list.map((r) => ({
        skillId: r.skill_id,
        usedBy: r.used_by,
        skillRuns: r.skill_runs,
        findings: r.findings,
        accepted: r.accepted,
        dismissed: r.dismissed,
      })),
    };
  }

  /**
   * @param workspaceId Tenant scope.
   * @param skillId Skill id.
   * @returns Findings of the skill's runs in the window per category, most frequent first
   *   (ties by category name); [] when the skill is not in this workspace.
   */
  async findingsByCategory(workspaceId: string, skillId: string): Promise<SkillCategoryCount[]> {
    const rows = await this.db.execute<SkillCategoryCount>(sql`
      WITH window_runs AS MATERIALIZED (${windowRunsSql(workspaceId)})
      SELECT f.category, count(*)::int AS count
      FROM window_runs wr
      JOIN skills s ON s.id = ${skillId} AND s.workspace_id = ${workspaceId}
      JOIN reviews rv ON rv.run_id = wr.id AND rv.workspace_id = ${workspaceId}
      JOIN findings f ON f.review_id = rv.id
      WHERE wr.blocks @> ${skillBlockPattern(sql`s.id::text`)}
      GROUP BY f.category
      ORDER BY count DESC, f.category`);
    return [...rows].map((r) => ({ category: r.category, count: r.count }));
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
