import type { SkillStatsSummary } from "@devdigest/shared";

/** Shown instead of a rate that has no data (no runs, or no decided findings). */
export const NO_RATE = "—";

/**
 * @param rate A share between 0 and 1, or null when there is no data.
 * @returns The rounded percentage ("71%"), or an em dash for null.
 */
export function formatRate(rate: number | null | undefined): string {
  return rate == null ? NO_RATE : `${Math.round(rate * 100)}%`;
}

/**
 * @param rate A share between 0 and 1.
 * @returns The rounded percentage as a number (0–100), for a circular score.
 */
export function ratePercent(rate: number): number {
  return Math.round(rate * 100);
}

/**
 * @param summary The card numbers of every skill (GET /skills/stats), or nothing while loading.
 * @returns The numbers keyed by skill id.
 */
export function indexStatsBySkill(summary: SkillStatsSummary[] | undefined): Map<string, SkillStatsSummary> {
  return new Map((summary ?? []).map((row) => [row.skill_id, row]));
}
