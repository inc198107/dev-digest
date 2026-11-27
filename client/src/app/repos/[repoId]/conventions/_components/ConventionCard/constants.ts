/** Constants of ConventionCard. */

/** Confidence (0–1) from which the bar is drawn in the "ok" colour instead of "warn". */
export const HIGH_CONFIDENCE = 0.85;

/** Rows of the rule editor. */
export const RULE_EDITOR_ROWS = 3;

/**
 * Longest rule the API accepts (`MAX_CONVENTION_RULE_CHARS` of `@devdigest/shared`; restated
 * because client code imports only types from the shared package).
 */
export const MAX_CONVENTION_RULE_CHARS = 300;
