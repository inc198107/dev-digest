import type { FindingRecord, ReviewRecord } from "@devdigest/shared";
import { visibleFindings } from "../FindingsPanel/helpers";

/**
 * Index the already-loaded findings by the agent run that produced them, so a timeline
 * run card can show its severity counts without another request.
 * @param reviews - the PR's reviews (`GET /pulls/:id/reviews`)
 * @returns run id → that run's findings, most severe first; reviews without a run are skipped
 */
export function findingsByRun(reviews: ReviewRecord[]): Record<string, FindingRecord[]> {
  const out: Record<string, FindingRecord[]> = {};
  for (const review of reviews) {
    if (!review.run_id) continue;
    out[review.run_id] = visibleFindings(review.findings, false);
  }
  return out;
}
