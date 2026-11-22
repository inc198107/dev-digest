import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { BatchRunRow } from './cost.js';
import type { PrFindingRow } from './findings.js';

/**
 * Pulls data-access for NEW queries. The legacy list/detail SQL still lives
 * inline in `routes.ts`; do not add more there. Every query is scoped by
 * `workspaceId` (tenancy guard).
 */
export class PullsRepository {
  constructor(private db: Db) {}

  /**
   * Batched agent runs of the given PRs, newest first — input of `latestBatchCostByPr`
   * and `latestBatchRunIdsByPr`.
   * @param workspaceId - tenancy scope
   * @param prIds - PRs shown on the list
   * @returns runs with a non-null `batch_id` (pre-0010 runs are skipped)
   */
  async runCostRows(workspaceId: string, prIds: string[]): Promise<BatchRunRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
        runId: t.agentRuns.id,
        prId: t.agentRuns.prId,
        batchId: t.agentRuns.batchId,
        ranAt: t.agentRuns.ranAt,
        status: t.agentRuns.status,
        costUsd: t.agentRuns.costUsd,
      })
      .from(t.agentRuns)
      .where(
        and(
          eq(t.agentRuns.workspaceId, workspaceId),
          inArray(t.agentRuns.prId, prIds),
          isNotNull(t.agentRuns.batchId),
        ),
      )
      .orderBy(desc(t.agentRuns.ranAt));
  }

  /**
   * Findings produced by the given agent runs (via `reviews.run_id`) — input of
   * `summarizeFindingsByPr`.
   * @param workspaceId - tenancy scope
   * @param runIds - `done` runs of the listed PRs' latest review batches
   * @returns one row per finding, tagged with its PR, in a stable file / line order
   */
  async findingsForRuns(workspaceId: string, runIds: string[]): Promise<PrFindingRow[]> {
    if (runIds.length === 0) return [];
    return this.db
      .select({
        prId: t.reviews.prId,
        id: t.findings.id,
        severity: t.findings.severity,
        category: t.findings.category,
        title: t.findings.title,
        file: t.findings.file,
        startLine: t.findings.startLine,
        endLine: t.findings.endLine,
        confidence: t.findings.confidence,
        rationale: t.findings.rationale,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(
        and(
          eq(t.reviews.workspaceId, workspaceId),
          eq(t.reviews.kind, 'review'),
          inArray(t.reviews.runId, runIds),
        ),
      )
      .orderBy(t.findings.file, t.findings.startLine);
  }
}
