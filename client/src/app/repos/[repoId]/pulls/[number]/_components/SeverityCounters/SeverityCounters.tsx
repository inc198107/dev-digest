/**
 * SeverityCounters — "3 CRITICAL · 5 WARNING · 2 SUGGESTION" above a run's finding cards.
 * Presentational: the parent owns the counts and the active level; a click asks it to toggle.
 */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import { COUNTER_SEVERITIES } from "./constants";
import { s } from "./styles";

/**
 * Row of per-severity counters that double as a single-level filter.
 * @param props.counts - number of findings per level (every level present, `0` allowed).
 * @param props.active - the level the list is filtered by, or `null` for no filter.
 * @param props.onToggle - called with the clicked level; the parent decides whether that
 *   sets the filter, moves it, or clears it.
 * @returns a labelled button group; each button reports its state via `aria-pressed`.
 */
export function SeverityCounters({
  counts,
  active,
  onToggle,
}: {
  counts: Record<Severity, number>;
  active: Severity | null;
  onToggle: (sev: Severity) => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div role="group" aria-label={t("panel.severityFilter")} style={s.row}>
      {COUNTER_SEVERITIES.map((sev, i) => {
        const I = Icon[SEV[sev].icon];
        return (
          <React.Fragment key={sev}>
            {i > 0 && (
              <span aria-hidden="true" style={s.sep}>
                ·
              </span>
            )}
            <button
              type="button"
              aria-pressed={active === sev}
              onClick={() => onToggle(sev)}
              style={s.counter(sev, active)}
            >
              <I size={13} style={{ color: SEV[sev].c }} aria-hidden="true" />
              <span className="tnum" style={s.count}>
                {counts[sev]}
              </span>
              <span style={s.label}>{t(`panel.severity.${sev}`)}</span>
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
