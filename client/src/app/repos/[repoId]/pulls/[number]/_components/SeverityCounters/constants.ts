import type { Severity } from "@devdigest/shared";

/**
 * One key per contract severity level, in display order. Typed as `Record<Severity, …>`
 * so tsc fails if the review contract gains or loses a level. A type-only import on
 * purpose: Next's webpack cannot resolve the `.js` specifiers inside the
 * `@devdigest/shared` barrel, so the client never imports runtime values from it.
 */
const CONTRACT_SEVERITIES: Record<Severity, true> = {
  CRITICAL: true,
  WARNING: true,
  SUGGESTION: true,
};

/** Severity levels shown in the counters row, in display order. */
export const COUNTER_SEVERITIES = Object.keys(CONTRACT_SEVERITIES) as Severity[];

/** Opacity of the other counters while one level is the active filter. */
export const MUTED_OPACITY = 0.55;
