import type { CSSProperties } from "react";

/** Co-located styles for the skill Versions tab. */
export const s = {
  wrap: { maxWidth: 820 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 4 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  item: (current: boolean): CSSProperties => ({
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid " + (current ? "var(--border-strong)" : "var(--border)"),
    background: "var(--bg-elevated)",
  }),
  row: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  versionTag: (current: boolean): CSSProperties => ({
    fontSize: 12.5,
    fontWeight: 700,
    color: current ? "var(--accent-text)" : "var(--text-secondary)",
    background: current ? "var(--accent-bg)" : "var(--bg-hover)",
    padding: "3px 9px",
    borderRadius: 6,
    flexShrink: 0,
  }),
  rowText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: {
    fontSize: 13,
    color: "var(--text-primary)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  date: { fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  actions: { display: "flex", gap: 6, flexShrink: 0 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  modalBody: { padding: 24 } satisfies CSSProperties,
} as const;
