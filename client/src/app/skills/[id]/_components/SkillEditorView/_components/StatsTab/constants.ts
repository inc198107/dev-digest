/**
 * Donut colour of each finding category (design tokens; the review contract's categories).
 * Labels and counts are shown next to every slice, so colour is never the only cue.
 */
export const CATEGORY_COLOR: Readonly<Record<string, string>> = {
  security: "var(--crit)",
  bug: "var(--warn)",
  perf: "var(--accent)",
  style: "var(--info)",
  test: "var(--ok)",
};

/** Colour of a category the map does not know. */
export const OTHER_CATEGORY_COLOR = "var(--text-muted)";

/** Diameter of the findings-by-category donut (px). */
export const DONUT_SIZE = 120;

/** Diameter of the accept-rate ring in its tile (px). */
export const ACCEPT_RING_SIZE = 32;
