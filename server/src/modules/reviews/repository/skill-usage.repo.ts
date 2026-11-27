import { sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../../db/client.js';

/**
 * Skill usage of review runs (read by the Skills Lab stats through a port the composition root
 * wires to these functions). The reviews module owns the runs, their traces (`run_traces.trace`,
 * written by `run-executor.ts`: `prompt_assembly.skill_blocks[].id`) and the findings, so the
 * queries that read them live here.
 */

/** `agent_runs.status` of a run that finished normally; failed and cancelled runs never count. */
const FINISHED_RUN_STATUS = 'done';

/** What the runs of the window recorded for one skill. */
export interface SkillRunCountsRow {
  skillId: string;
  /** Finished runs in the window whose trace recorded the skill's prompt block. */
  skillRuns: number;
  /** Findings of those runs. */
  findings: number;
  /** Of those findings, accepted ones. */
  accepted: number;
  /** Of those findings, dismissed ones. */
  dismissed: number;
}

/** The finished runs of a workspace's window and the counts of the requested skills. */
export interface SkillRunUsageResult {
  /** Finished review runs of the workspace in the window. */
  runs: number;
  /** One entry per requested skill. */
  skills: SkillRunCountsRow[];
}

/** Findings of a skill's runs in one category. */
export type SkillFindingCategoryRow = {
  category: string;
  count: number;
};

/** One row of the usage query (postgres-js returns the `::int` casts as numbers). */
type UsageRow = {
  skill_id: string;
  runs: number;
  skill_runs: number;
  findings: number;
  accepted: number;
  dismissed: number;
};

/**
 * The finished runs of a workspace inside the window, each with the skill blocks its trace
 * recorded (null for a run without a trace or with an older trace). The window is measured with
 * the database clock.
 * @param workspaceId Tenant scope.
 * @param windowDays Days to look back.
 * @returns A SELECT of `id`, `blocks` to use as a CTE body.
 */
function windowRunsSql(workspaceId: string, windowDays: number): SQL {
  return sql`
    SELECT ar.id, rt.trace #> '{prompt_assembly,skill_blocks}' AS blocks
    FROM agent_runs ar
    LEFT JOIN run_traces rt ON rt.run_id = ar.id
    WHERE ar.workspace_id = ${workspaceId}
      AND ar.status = ${FINISHED_RUN_STATUS}
      AND ar.ran_at >= now() - make_interval(days => ${windowDays}::int)`;
}

/**
 * jsonb value that a skill-blocks array contains (`@>`) when it holds the skill's block.
 * @param skillId SQL expression yielding the skill id as text.
 * @returns `[{"id": <skill id>}]` as jsonb.
 */
function skillBlockPattern(skillId: SQL): SQL {
  return sql`jsonb_build_array(jsonb_build_object('id', ${skillId}))`;
}

/**
 * Usage of the given skills by the workspace's finished runs of the window, in one statement:
 * the window's runs are read once (each trace detoasted once) and matched to every skill with
 * jsonb containment; findings are those of the reviews each run produced (`reviews.run_id`).
 * @param db Database handle.
 * @param workspaceId Tenant scope.
 * @param skillIds Skills to count.
 * @param windowDays Days to look back.
 * @returns The run count and one entry per requested skill.
 */
export async function skillRunUsage(
  db: Db,
  workspaceId: string,
  skillIds: string[],
  windowDays: number,
): Promise<SkillRunUsageResult> {
  if (skillIds.length === 0) return { runs: 0, skills: [] };
  const wanted = sql.join(
    skillIds.map((id) => sql`(${id}::text)`),
    sql`, `,
  );
  const rows = await db.execute<UsageRow>(sql`
    WITH window_runs AS MATERIALIZED (${windowRunsSql(workspaceId, windowDays)}),
    wanted(skill_id) AS (VALUES ${wanted}),
    skill_runs AS (
      SELECT w.skill_id, wr.id AS run_id
      FROM wanted w
      JOIN window_runs wr ON wr.blocks @> ${skillBlockPattern(sql`w.skill_id`)}
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
    )
    SELECT w.skill_id,
           (SELECT count(*)::int FROM window_runs) AS runs,
           coalesce(rc.n, 0) AS skill_runs,
           coalesce(fc.findings, 0) AS findings,
           coalesce(fc.accepted, 0) AS accepted,
           coalesce(fc.dismissed, 0) AS dismissed
    FROM wanted w
    LEFT JOIN run_counts rc ON rc.skill_id = w.skill_id
    LEFT JOIN finding_counts fc ON fc.skill_id = w.skill_id`);
  const list = [...rows];
  return {
    runs: list[0]?.runs ?? 0,
    skills: list.map((r) => ({
      skillId: r.skill_id,
      skillRuns: r.skill_runs,
      findings: r.findings,
      accepted: r.accepted,
      dismissed: r.dismissed,
    })),
  };
}

/**
 * @param db Database handle.
 * @param workspaceId Tenant scope.
 * @param skillId Skill id.
 * @param windowDays Days to look back.
 * @returns Findings of the skill's runs in the window per category, most frequent first (ties by
 *   category name).
 */
export async function skillFindingsByCategory(
  db: Db,
  workspaceId: string,
  skillId: string,
  windowDays: number,
): Promise<SkillFindingCategoryRow[]> {
  const rows = await db.execute<SkillFindingCategoryRow>(sql`
    WITH window_runs AS MATERIALIZED (${windowRunsSql(workspaceId, windowDays)})
    SELECT f.category, count(*)::int AS count
    FROM window_runs wr
    JOIN reviews rv ON rv.run_id = wr.id AND rv.workspace_id = ${workspaceId}
    JOIN findings f ON f.review_id = rv.id
    WHERE wr.blocks @> ${skillBlockPattern(sql`${skillId}::text`)}
    GROUP BY f.category
    ORDER BY count DESC, f.category`);
  return [...rows].map((r) => ({ category: r.category, count: r.count }));
}
