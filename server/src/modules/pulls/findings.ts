/**
 * PR-list Findings rollup (pure — no DB / `this`, so it unit-tests cleanly).
 *
 * The list's Findings column shows the findings of the same latest review batch the Cost
 * column uses (`latestBatchRunIdsByPr` in `./cost.ts`): per-severity counts for the icons and
 * the items themselves for the hover popover.
 */
import type { PrFindingsSummary, Severity } from '@devdigest/shared';

/** One persisted finding of a latest-batch run, tagged with its PR. */
export interface PrFindingRow {
  prId: string;
  id: string;
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

/** Display order and the set of levels that are counted (the review contract's `Severity`). */
const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * Narrow a DB severity (plain text column) to a contract level.
 * @param value - the stored severity
 * @returns true when it is one of the contract's three levels
 */
function isSeverity(value: string): value is Severity {
  return Object.hasOwn(SEVERITY_ORDER, value);
}

/**
 * Group latest-batch findings by PR into counts + items.
 * @param rows - findings of the listed PRs' latest-batch runs, any order
 * @returns PR id → summary; PRs without rows are absent (the route maps that to `null`).
 *   Rows with a severity outside the contract are skipped; items are sorted most severe first.
 */
export function summarizeFindingsByPr(rows: PrFindingRow[]): Map<string, PrFindingsSummary> {
  const out = new Map<string, PrFindingsSummary>();
  for (const r of rows) {
    if (!isSeverity(r.severity)) continue;
    let summary = out.get(r.prId);
    if (!summary) {
      summary = { counts: { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 }, items: [] };
      out.set(r.prId, summary);
    }
    summary.counts[r.severity] += 1;
    summary.items.push({
      id: r.id,
      severity: r.severity,
      category: r.category as PrFindingsSummary['items'][number]['category'],
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      rationale: r.rationale,
    });
  }
  for (const summary of out.values()) {
    summary.items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }
  return out;
}
