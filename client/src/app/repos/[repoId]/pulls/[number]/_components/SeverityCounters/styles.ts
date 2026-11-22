import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { MUTED_OPACITY } from "./constants";

/** Co-located styles for SeverityCounters. Colours come only from `SEV` / CSS variables. */
export const s = {
  /** The chips row (the design's FindingsPanel filter chips). */
  row: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  /** The count, with tabular digits (`tnum` class on the element). */
  count: { fontWeight: 600 } satisfies CSSProperties,
  /**
   * One counter chip, shaped like the design's `Chip`. The look depends only on the filter
   * state, never on hover, so the active level is readable from a screenshot.
   * @param sev - the level this chip counts.
   * @param active - the level the list is filtered by, or `null` when unfiltered.
   * @returns the chip style: `SEV` border, text and background when active, dimmed when
   *   another level is active, a neutral bordered chip when no filter is on.
   */
  counter: (sev: Severity, active: Severity | null): CSSProperties => {
    const isActive = active === sev;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "4px 10px",
      borderRadius: 6,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: isActive ? SEV[sev].c : "var(--border)",
      background: isActive ? SEV[sev].bg : "transparent",
      color: isActive ? SEV[sev].c : "var(--text-secondary)",
      opacity: active && !isActive ? MUTED_OPACITY : 1,
      fontSize: 12.5,
      fontWeight: 500,
      cursor: "pointer",
      transition: "opacity .12s, background .12s, border-color .12s",
    };
  },
} as const;
