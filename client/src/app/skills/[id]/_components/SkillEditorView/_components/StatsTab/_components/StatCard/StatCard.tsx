"use client";

import React from "react";
import { s } from "./styles";

/**
 * One number of the Stats tab, as in the design's stat tiles: an upper-case label (optionally
 * with a small chart on the right), a big value with a muted suffix and a one-line explanation.
 * The kit `MetricCard` has no slot for the accept-rate ring, hence this local tile.
 * @param props.label Label (shown upper case through CSS).
 * @param props.value The number.
 * @param props.suffix Muted text right after the number ("%", " agents").
 * @param props.sub What the number counts.
 * @param props.aside Small chart next to the label (e.g. a `CircularScore`).
 * @returns The tile.
 */
export function StatCard({
  label,
  value,
  suffix,
  sub,
  aside,
}: {
  label: string;
  value: React.ReactNode;
  suffix?: string;
  sub?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div style={s.card} role="group" aria-label={label}>
      <div style={s.head}>
        <span style={s.label}>{label}</span>
        {aside}
      </div>
      <div className="tnum" style={s.value}>
        {value}
        {suffix && <span style={s.suffix}>{suffix}</span>}
      </div>
      {sub && <div style={s.sub}>{sub}</div>}
    </div>
  );
}
