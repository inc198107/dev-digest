import type { CSSProperties } from "react";
import { SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { MUTED_OPACITY } from "./constants";

/** Co-located styles for SeverityCounters. Colours come only from `SEV` / CSS variables. */
export const s = {
  /** The counters row: buttons separated by "·". */
  row: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  /** The "·" between two counters. */
  sep: { color: "var(--text-muted)", fontSize: 13 } satisfies CSSProperties,
  /** The count, bold with tabular digits (`tnum` class on the element). */
  count: { fontWeight: 700 } satisfies CSSProperties,
  /** The level label, upper-cased like `SeverityBadge`. */
  label: {
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  } satisfies CSSProperties,
  /**
   * One counter button. The look depends only on the filter state, never on hover,
   * so the active level is readable from a screenshot.
   * @param sev - the level this button counts.
   * @param active - the level the list is filtered by, or `null` when unfiltered.
   * @returns the button style: `SEV` border + background when active, dimmed when
   *   another level is active, neutral when no filter is on.
   */
  counter: (sev: Severity, active: Severity | null): CSSProperties => {
    const isActive = active === sev;
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      padding: "3px 9px",
      borderRadius: 6,
      borderWidth: 1,
      borderStyle: "solid",
      borderColor: isActive ? SEV[sev].c : "transparent",
      background: isActive ? SEV[sev].bg : "transparent",
      color: isActive ? SEV[sev].c : "var(--text-secondary)",
      opacity: active && !isActive ? MUTED_OPACITY : 1,
      fontSize: 12.5,
      cursor: "pointer",
      transition: "opacity .12s, background .12s, border-color .12s",
    };
  },
} as const;
