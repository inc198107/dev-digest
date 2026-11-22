import type { FindingRecord, Severity } from "@devdigest/shared";
import { COUNTER_SEVERITIES } from "../SeverityCounters/constants";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/**
 * Filter findings for display and sort them by severity.
 * @param findings - every finding of one review run.
 * @param hideLow - drop findings below `LOW_CONFIDENCE_THRESHOLD`.
 * @param severity - keep only this level; `null` keeps all levels.
 * @returns a new array, most severe first; the input is not mutated.
 */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Count findings per contract severity level.
 * @param findings - the findings to count (already narrowed by any other filters).
 * @returns a count for every level, `0` when a level has none; values outside the
 *   contract (the DB column is plain text) are ignored.
 */
export function countBySeverity(findings: FindingRecord[]): Record<Severity, number> {
  const counts = Object.fromEntries(COUNTER_SEVERITIES.map((sev) => [sev, 0])) as Record<
    Severity,
    number
  >;
  for (const f of findings) {
    if (Object.hasOwn(counts, f.severity)) counts[f.severity] += 1;
  }
  return counts;
}
