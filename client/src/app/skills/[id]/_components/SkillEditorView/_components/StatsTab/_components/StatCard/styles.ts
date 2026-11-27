import type { CSSProperties } from "react";

/** Co-located styles for StatCard (design: the agent Stats tab's stat tiles). */
export const s = {
  card: {
    flex: 1,
    minWidth: 0,
    padding: 15,
    borderRadius: 9,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  head: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 32,
  } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    letterSpacing: "0.03em",
    textTransform: "uppercase",
  } satisfies CSSProperties,
  value: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 6 } satisfies CSSProperties,
  suffix: { fontSize: 15, color: "var(--text-muted)", marginLeft: 4, fontWeight: 600 } satisfies CSSProperties,
  sub: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 4 } satisfies CSSProperties,
} as const;
