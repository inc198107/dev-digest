/**
 * FindingsPeek — per-severity counts that open a findings popover, ported from the design's
 * `RunFindings` + `FindingsTooltip` (prdetail_runs.jsx) and `FindingsCell` (screen_dashboard.jsx).
 * Opens on hover and on keyboard focus (pointer focus does not count, so a mouse click toggles
 * it cleanly), a click pins it (touch), Escape closes it without reaching outer Escape handlers.
 * Clicks inside never bubble, so it is safe inside a clickable row.
 */
"use client";

import React from "react";
import { Icon } from "../icons";
import { SeverityBadge, CategoryTag } from "../primitives/Badge";
import { ConfidenceNum } from "../primitives/ConfidenceNum";
import { SeverityCounts, REVIEW_SEVERITIES } from "../primitives/SeverityCounts";
import type { Category, Severity } from "../primitives/tokens";

/** The finding fields the popover shows (a subset of the review contract's Finding). */
export interface PeekFinding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  file: string;
  start_line: number;
  end_line: number;
  confidence: number;
  rationale: string;
}

/**
 * Plain text for a two-line rationale preview.
 * @param md - the markdown rationale
 * @returns the text without bold / code markers
 */
function stripMd(md: string): string {
  return md.replace(/\*\*|`/g, "");
}

/**
 * Count findings per review level.
 * @param items - the findings
 * @returns a count for every review level
 */
function countItems(items: PeekFinding[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0, INFO: 0 };
  for (const f of items) if (Object.hasOwn(counts, f.severity)) counts[f.severity] += 1;
  return counts;
}

/**
 * Severity counts with a hover / click popover listing the findings behind them.
 * @param props.items - the findings to list (most severe first is the caller's order)
 * @param props.title - popover heading, e.g. "5 findings in this run"
 * @param props.placement - open below (default) or above the counts
 * @param props.width - popover width in px
 * @returns the trigger plus, while open, the popover; null when there is nothing to show
 */
export function FindingsPeek({
  items,
  title,
  placement = "down",
  width = 380,
}: {
  items: PeekFinding[];
  title: string;
  placement?: "down" | "up";
  width?: number;
}) {
  const popoverId = React.useId();
  const [hover, setHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [pinned, setPinned] = React.useState(false);
  const [suppressed, setSuppressed] = React.useState(false);
  /** True between a pointer press and the focus it causes: pointer focus must not open it. */
  const pointerFocus = React.useRef(false);
  const counts = React.useMemo(() => countItems(items), [items]);

  if (!REVIEW_SEVERITIES.some((sev) => counts[sev] > 0)) return null;
  const open = (hover || focused || pinned) && !suppressed;

  return (
    <span
      onMouseEnter={() => {
        setHover(true);
        setSuppressed(false);
      }}
      onMouseLeave={() => {
        setHover(false);
        setPinned(false);
      }}
      onPointerDown={() => {
        pointerFocus.current = true;
      }}
      onFocus={() => {
        if (!pointerFocus.current) {
          setFocused(true);
          setSuppressed(false);
        }
        pointerFocus.current = false;
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setPinned(false);
          setSuppressed(true);
        }
      }}
      style={{ position: "relative", display: "inline-flex", alignItems: "center", width: "fit-content" }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? popoverId : undefined}
        aria-haspopup="true"
        onClick={() => {
          setSuppressed(false);
          setPinned((p) => !p);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "none",
          border: "none",
          padding: 0,
          font: "inherit",
          cursor: "pointer",
        }}
      >
        <SeverityCounts counts={counts} />
      </button>
      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={title}
          style={{
            position: "absolute",
            left: 0,
            ...(placement === "up" ? { bottom: "100%", marginBottom: 8 } : { top: "100%", marginTop: 8 }),
            zIndex: 30,
            width,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-strong)",
            borderRadius: 10,
            boxShadow: "var(--shadow-modal)",
            padding: 12,
            cursor: "default",
            textAlign: "left",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              marginBottom: 9,
            }}
          >
            <Icon.AlertOctagon size={12} aria-hidden="true" />
            {title}
          </div>
          <ul style={{ display: "flex", flexDirection: "column", gap: 9, maxHeight: 300, overflow: "auto", margin: 0, padding: 0, listStyle: "none" }}>
            {items.map((f, i) => {
              const last = i === items.length - 1;
              return (
                <li
                  key={f.id}
                  style={{
                    paddingBottom: last ? 0 : 9,
                    borderBottom: last ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <SeverityBadge severity={f.severity} compact />
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" }}>{f.title}</span>
                    <CategoryTag category={f.category as Category} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5 }}>
                    <span className="mono" style={{ fontSize: 11, color: "var(--accent-text)" }}>
                      {f.file}:{f.start_line === f.end_line ? f.start_line : `${f.start_line}-${f.end_line}`}
                    </span>
                    <ConfidenceNum value={f.confidence} />
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-secondary)",
                      lineHeight: 1.45,
                      marginTop: 5,
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {stripMd(f.rationale)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </span>
  );
}
