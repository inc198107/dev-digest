/**
 * PR-list Findings rollup — the pure rules behind the list's Findings column:
 * which runs count (`latestBatchRunIdsByPr`, the Cost column's batch rule) and how their
 * findings become per-severity counts + popover items (`summarizeFindingsByPr`).
 */
import { describe, it, expect } from 'vitest';
import { latestBatchRunIdsByPr, type BatchRunRow } from '../src/modules/pulls/cost.js';
import { summarizeFindingsByPr, type PrFindingRow } from '../src/modules/pulls/findings.js';

const T0 = Date.UTC(2026, 10, 22, 12, 0, 0);
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

/**
 * Build a batched run row.
 * @param over - fields to override
 * @returns a `done` run of PR `pr1` in batch `b1`
 */
function run(over: Partial<BatchRunRow>): BatchRunRow {
  return {
    runId: 'r1',
    prId: 'pr1',
    batchId: 'b1',
    ranAt: at(0),
    status: 'done',
    costUsd: null,
    ...over,
  };
}

/**
 * Build a finding row.
 * @param id - finding id
 * @param severity - stored severity text
 * @param prId - owning PR
 * @returns a finding row with fixed metadata
 */
function finding(id: string, severity: string, prId = 'pr1'): PrFindingRow {
  return {
    prId,
    id,
    severity,
    category: 'security',
    title: `title ${id}`,
    file: 'src/a.ts',
    startLine: 1,
    endLine: 2,
    confidence: 0.9,
    rationale: 'why',
  };
}

describe('latestBatchRunIdsByPr', () => {
  it('returns the done runs of the latest batch only', () => {
    const ids = latestBatchRunIdsByPr([
      run({ runId: 'old', batchId: 'b-old', ranAt: at(0) }),
      run({ runId: 'new-1', batchId: 'b-new', ranAt: at(10) }),
      run({ runId: 'new-2', batchId: 'b-new', ranAt: at(10) }),
      run({ runId: 'new-failed', batchId: 'b-new', ranAt: at(10), status: 'failed' }),
    ]);
    expect(ids.get('pr1')).toEqual(['new-1', 'new-2']);
  });

  it('keeps the previous batch while the newest has no done run', () => {
    const ids = latestBatchRunIdsByPr([
      run({ runId: 'prev', batchId: 'b-prev', ranAt: at(0) }),
      run({ runId: 'inflight', batchId: 'b-now', ranAt: at(5), status: 'running' }),
    ]);
    expect(ids.get('pr1')).toEqual(['prev']);
  });

  it('skips legacy runs without a batch', () => {
    const ids = latestBatchRunIdsByPr([run({ prId: 'legacy', batchId: null })]);
    expect(ids.has('legacy')).toBe(false);
  });
});

describe('summarizeFindingsByPr', () => {
  it('counts every contract level, zero included, and sorts items most severe first', () => {
    const summary = summarizeFindingsByPr([
      finding('s1', 'SUGGESTION'),
      finding('c1', 'CRITICAL'),
      finding('w1', 'WARNING'),
      finding('c2', 'CRITICAL'),
    ]).get('pr1');
    expect(summary?.counts).toEqual({ CRITICAL: 2, WARNING: 1, SUGGESTION: 1 });
    expect(summary?.items.map((i) => i.id)).toEqual(['c1', 'c2', 'w1', 's1']);
    expect(summary?.items[0]).toMatchObject({ start_line: 1, end_line: 2, category: 'security' });
  });

  it('keeps each PR separate and leaves PRs without findings out', () => {
    const map = summarizeFindingsByPr([finding('a', 'WARNING', 'pr-a'), finding('b', 'CRITICAL', 'pr-b')]);
    expect(map.get('pr-a')?.counts).toEqual({ CRITICAL: 0, WARNING: 1, SUGGESTION: 0 });
    expect(map.get('pr-b')?.counts).toEqual({ CRITICAL: 1, WARNING: 0, SUGGESTION: 0 });
    expect(map.has('pr-none')).toBe(false);
  });

  it('ignores severities outside the contract', () => {
    const map = summarizeFindingsByPr([finding('x', 'INFO'), finding('y', 'constructor')]);
    expect(map.has('pr1')).toBe(false);
  });
});
