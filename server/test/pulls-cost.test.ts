/**
 * PR-list Cost rollup (`modules/pulls/cost.ts`) — the pure rule that picks the
 * latest review batch per PR and sums its finished runs' cost, unit-tested
 * independently of the route's query.
 */
import { describe, it, expect } from 'vitest';
import { latestBatchCostByPr, type RunCostRow } from '../src/modules/pulls/cost.js';

const T0 = Date.UTC(2026, 10, 21, 12, 0, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

function run(over: Partial<RunCostRow>): RunCostRow {
  return { prId: 'pr1', batchId: 'b1', ranAt: at(0), status: 'done', costUsd: 0.001, ...over };
}

describe('latestBatchCostByPr', () => {
  it('sums every done run of the latest batch and ignores older batches', () => {
    const cost = latestBatchCostByPr([
      run({ batchId: 'old', ranAt: at(0), costUsd: 0.5 }),
      run({ batchId: 'new', ranAt: at(10), costUsd: 0.0013 }),
      run({ batchId: 'new', ranAt: at(10), costUsd: 0.0014 }),
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.0027, 10);
  });

  it('excludes failed / cancelled / running runs from the sum', () => {
    const cost = latestBatchCostByPr([
      run({ costUsd: 0.002 }),
      run({ status: 'failed', costUsd: 0.9 }),
      run({ status: 'cancelled', costUsd: 0.9 }),
      run({ status: 'running', costUsd: null }),
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.002, 10);
  });

  it('returns null when the latest batch has done runs but no known cost', () => {
    const cost = latestBatchCostByPr([run({ costUsd: null }), run({ costUsd: null })]);
    expect(cost.has('pr1')).toBe(true);
    expect(cost.get('pr1')).toBeNull();
  });

  it('keeps the previous batch while the newest one has no done run yet', () => {
    const cost = latestBatchCostByPr([
      run({ batchId: 'prev', ranAt: at(0), costUsd: 0.004 }),
      run({ batchId: 'inflight', ranAt: at(5), status: 'running', costUsd: null }),
      run({ batchId: 'broken', ranAt: at(6), status: 'failed', costUsd: null }),
    ]);
    expect(cost.get('pr1')).toBeCloseTo(0.004, 10);
  });

  it('ignores legacy runs without a batch id and PRs with no qualifying batch', () => {
    const cost = latestBatchCostByPr([
      run({ prId: 'legacy', batchId: null, costUsd: 0.3 }),
      run({ prId: 'failing', status: 'failed', costUsd: null }),
    ]);
    expect(cost.has('legacy')).toBe(false);
    expect(cost.has('failing')).toBe(false);
  });

  it('computes each PR independently and does not depend on row order', () => {
    const rows = [
      run({ prId: 'a', batchId: 'a1', ranAt: at(0), costUsd: 0.01 }),
      run({ prId: 'b', batchId: 'b1', ranAt: at(1), costUsd: 0.02 }),
      run({ prId: 'a', batchId: 'a2', ranAt: at(2), costUsd: 0.03 }),
    ];
    for (const ordered of [rows, [...rows].reverse()]) {
      const cost = latestBatchCostByPr(ordered);
      expect(cost.get('a')).toBeCloseTo(0.03, 10);
      expect(cost.get('b')).toBeCloseTo(0.02, 10);
    }
  });
});
