import React from "react";

/** Placeholder for an unknown cost (never rendered as "$0"). */
export const NO_COST = "—";

/**
 * Format a USD amount for review-run costs, which are usually fractions of a cent.
 * Precision grows as the amount shrinks so small runs stay distinguishable.
 * @param usd - amount in USD; `null`/`undefined` means unknown
 * @returns `"—"` when unknown, `"$0.00"` for a known zero (free model),
 *   2 significant digits below $0.01 (`$0.000057`, `$0.0013`), 3 decimals below $1
 *   (`$0.014`), otherwise 2 (`$1.23`); amounts under $0.000001 read `"<$0.000001"`
 */
export function formatUsd(usd: number | null | undefined): string {
  if (usd == null || !Number.isFinite(usd)) return NO_COST;
  if (usd === 0) return "$0.00";
  /** Below 1e-6 `Number#toString` switches to exponent notation. */
  if (usd < 0.000001) return "<$0.000001";
  if (usd < 0.01) return `$${String(Number(usd.toPrecision(2)))}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Compact spend display for a review run, a review or a PR.
 * @param props.usd - cost in USD; `null`/`undefined` renders a muted "—"
 * @param props.title - tooltip (pass a translated string)
 */
export function CostBadge({ usd, title }: { usd: number | null | undefined; title?: string }) {
  const known = usd != null && Number.isFinite(usd);
  return (
    <span
      className="mono tnum"
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: known ? 11.5 : 12,
        fontWeight: known ? 500 : 400,
        color: known ? "var(--text-secondary)" : "var(--text-muted)",
      }}
    >
      {formatUsd(usd)}
    </span>
  );
}
