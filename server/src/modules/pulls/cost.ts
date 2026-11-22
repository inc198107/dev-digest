/**
 * PR-list Cost rollup (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * Every `POST /pulls/:id/review` stamps its agent runs with one `batch_id`. The
 * PR list shows the cost of the LATEST batch that has at least one finished
 * (`done`) run: the sum of that batch's `done` runs with a known cost. A batch
 * whose runs are all still running / failed is skipped, so a fresh review
 * that is still in flight keeps showing the previous batch until a run lands.
 * The Findings column reads the same batch through {@link latestBatchRunIdsByPr}.
 */

export interface RunCostRow {
  prId: string | null;
  /** Null on runs created before migration 0010 — ignored. */
  batchId: string | null;
  ranAt: Date;
  status: string | null;
  costUsd: number | null;
}

/** A batched run that also carries its own id (input of {@link latestBatchRunIdsByPr}). */
export interface BatchRunRow extends RunCostRow {
  /** `agent_runs.id` — what `reviews.run_id` points at. */
  runId: string;
}

interface BatchAcc<T> {
  latestRanAt: number;
  /** The batch's `done` runs, in input order. */
  done: T[];
}

/**
 * The batch rule shared by the PR-list Cost and Findings columns: per PR, the latest batch
 * that has at least one `done` run. Row order does not matter.
 * @param rows - agent runs of the listed PRs; rows without a PR or batch id are ignored
 * @returns PR id → that batch's `done` runs. PRs without such a batch are absent.
 */
function latestBatchDoneRuns<T extends RunCostRow>(rows: T[]): Map<string, T[]> {
  const batchesByPr = new Map<string, Map<string, BatchAcc<T>>>();
  for (const r of rows) {
    if (!r.prId || !r.batchId) continue;
    let batches = batchesByPr.get(r.prId);
    if (!batches) {
      batches = new Map();
      batchesByPr.set(r.prId, batches);
    }
    const acc = batches.get(r.batchId) ?? { latestRanAt: 0, done: [] };
    acc.latestRanAt = Math.max(acc.latestRanAt, r.ranAt.getTime());
    if (r.status === 'done') acc.done.push(r);
    batches.set(r.batchId, acc);
  }

  const out = new Map<string, T[]>();
  for (const [prId, batches] of batchesByPr) {
    let latest: BatchAcc<T> | undefined;
    for (const acc of batches.values()) {
      if (acc.done.length === 0) continue;
      if (!latest || acc.latestRanAt > latest.latestRanAt) latest = acc;
    }
    if (latest) out.set(prId, latest.done);
  }
  return out;
}

/**
 * Pick the latest review batch per PR and sum its finished runs' cost.
 * Row order does not matter.
 * @param rows - agent runs of the listed PRs (see {@link RunCostRow})
 * @returns PR id → latest-batch USD cost, or null when that batch has no known
 *   cost. PRs without a batch that has a `done` run are absent from the map.
 */
export function latestBatchCostByPr(rows: RunCostRow[]): Map<string, number | null> {
  const out = new Map<string, number | null>();
  for (const [prId, done] of latestBatchDoneRuns(rows)) {
    let cost: number | null = null;
    for (const r of done) if (r.costUsd != null) cost = (cost ?? 0) + r.costUsd;
    out.set(prId, cost);
  }
  return out;
}

/**
 * Ids of the finished runs of each PR's latest review batch (same batch as the Cost column).
 * @param rows - batched agent runs of the listed PRs, with their ids
 * @returns PR id → `done` run ids of its latest batch; PRs without such a batch are absent.
 */
export function latestBatchRunIdsByPr(rows: BatchRunRow[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [prId, done] of latestBatchDoneRuns(rows)) out.set(prId, done.map((r) => r.runId));
  return out;
}
