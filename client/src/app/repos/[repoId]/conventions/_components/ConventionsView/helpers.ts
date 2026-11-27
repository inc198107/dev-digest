import type { ConventionCandidate } from "@devdigest/shared";

/** A relative time as a message key plus its count ("3h ago" → { unit: "hours", count: 3 }). */
export interface Ago {
  unit: "justNow" | "minutes" | "hours" | "days";
  count: number;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * @param iso When something happened.
 * @param now The current time.
 * @returns How long ago, rounded down to the largest whole unit; under a minute is "just now".
 */
export function agoSince(iso: string, now: Date): Ago {
  const elapsed = Math.max(0, now.getTime() - Date.parse(iso));
  if (elapsed >= DAY_MS) return { unit: "days", count: Math.floor(elapsed / DAY_MS) };
  if (elapsed >= HOUR_MS) return { unit: "hours", count: Math.floor(elapsed / HOUR_MS) };
  if (elapsed >= MINUTE_MS) return { unit: "minutes", count: Math.floor(elapsed / MINUTE_MS) };
  return { unit: "justNow", count: 0 };
}

/**
 * @param candidates Conventions with `path:lines` evidence.
 * @returns How many different files back them.
 */
export function evidenceFileCount(candidates: Pick<ConventionCandidate, "evidence_path">[]): number {
  return new Set(candidates.map((c) => c.evidence_path.replace(/:\d+(-\d+)?$/, ""))).size;
}
