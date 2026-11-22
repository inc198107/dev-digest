import React from "react";
import { Icon } from "../icons";
import { SEV, type Severity } from "./tokens";

/** Levels a review can produce, in display order (INFO is not a review level). */
export const REVIEW_SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const satisfies readonly Severity[];

/**
 * Compact per-severity counts ("⬢ 2  ▲ 1") in each level's `SEV` colour, as on the design's
 * timeline run card and PR-list Findings column. Levels with no findings are hidden.
 * @param props.counts - findings per level; missing or zero levels are not shown
 * @param props.iconSize - icon size in px
 * @returns the inline counts, or null when every level is zero
 */
export function SeverityCounts({
  counts,
  iconSize = 12.5,
}: {
  counts: Partial<Record<Severity, number>>;
  iconSize?: number;
}) {
  const shown = REVIEW_SEVERITIES.filter((sev) => (counts[sev] ?? 0) > 0);
  if (shown.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      {shown.map((sev) => {
        const s = SEV[sev];
        const I = Icon[s.icon];
        return (
          <span
            key={sev}
            role="img"
            aria-label={`${counts[sev]} ${s.label}`}
            title={`${counts[sev]} ${s.label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11.5,
              fontWeight: 600,
              color: s.c,
              borderBottom: `1px dotted ${s.c}`,
              paddingBottom: 1,
            }}
          >
            <I size={iconSize} aria-hidden="true" />
            <span className="tnum">{counts[sev]}</span>
          </span>
        );
      })}
    </span>
  );
}
