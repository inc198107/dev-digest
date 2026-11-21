import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { RunCostRow } from './cost.js';

/**
 * Pulls data-access for NEW queries. The legacy list/detail SQL still lives
 * inline in `routes.ts`; do not add more there. Every query is scoped by
 * `workspaceId` (tenancy guard).
 */
export class PullsRepository {
  constructor(private db: Db) {}

  /**
   * Batched agent runs of the given PRs, newest first — input of `latestBatchCostByPr`.
   * @param workspaceId - tenancy scope
   * @param prIds - PRs shown on the list
   * @returns runs with a non-null `batch_id` (pre-0010 runs are skipped)
   */
  async runCostRows(workspaceId: string, prIds: string[]): Promise<RunCostRow[]> {
    if (prIds.length === 0) return [];
    return this.db
      .select({
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
}
