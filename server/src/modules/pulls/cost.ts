/**
 * PR-list Cost rollup (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * Every `POST /pulls/:id/review` stamps its agent runs with one `batch_id`. The
 * PR list shows the cost of the LATEST batch that has at least one finished
 * (`done`) run: the sum of that batch's `done` runs with a known cost. A batch
 * whose runs are all still running / failed is skipped, so a fresh review
 * that is still in flight keeps showing the previous batch until a run lands.
 */

export interface RunCostRow {
  prId: string | null;
  /** Null on runs created before migration 0010 — ignored. */
  batchId: string | null;
  ranAt: Date;
  status: string | null;
  costUsd: number | null;
}

interface BatchAcc {
  latestRanAt: number;
  hasDone: boolean;
  /** Sum of known costs of `done` runs; null while none is known. */
  cost: number | null;
}

/**
 * Pick the latest review batch per PR and sum its finished runs' cost.
 * Row order does not matter.
 * @param rows - agent runs of the listed PRs (see {@link RunCostRow})
 * @returns PR id → latest-batch USD cost, or null when that batch has no known
 *   cost. PRs without a batch that has a `done` run are absent from the map.
 */
export function latestBatchCostByPr(rows: RunCostRow[]): Map<string, number | null> {
  const batchesByPr = new Map<string, Map<string, BatchAcc>>();
  for (const r of rows) {
    if (!r.prId || !r.batchId) continue;
    let batches = batchesByPr.get(r.prId);
    if (!batches) {
      batches = new Map();
      batchesByPr.set(r.prId, batches);
    }
    const acc = batches.get(r.batchId) ?? { latestRanAt: 0, hasDone: false, cost: null };
    acc.latestRanAt = Math.max(acc.latestRanAt, r.ranAt.getTime());
    if (r.status === 'done') {
      acc.hasDone = true;
      if (r.costUsd != null) acc.cost = (acc.cost ?? 0) + r.costUsd;
    }
    batches.set(r.batchId, acc);
  }

  const out = new Map<string, number | null>();
  for (const [prId, batches] of batchesByPr) {
    let latest: BatchAcc | undefined;
    for (const acc of batches.values()) {
      if (!acc.hasDone) continue;
      if (!latest || acc.latestRanAt > latest.latestRanAt) latest = acc;
    }
    if (latest) out.set(prId, latest.cost);
  }
  return out;
}
