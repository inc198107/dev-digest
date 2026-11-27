import type { CSSProperties } from "react";

/** Co-located styles for the community drawer's results area. */
export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10, margin: 0, padding: 0 } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", padding: "16px 2px", lineHeight: 1.5 } satisfies CSSProperties,
  status: { fontSize: 12, color: "var(--text-muted)", marginBottom: 8 } satisfies CSSProperties,
  error: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--text-primary)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  errorIcon: { color: "var(--crit)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  notConfigured: {
    display: "flex",
    gap: 8,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  noteIcon: { color: "var(--text-muted)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  link: { color: "var(--accent-text)", textDecoration: "underline" } satisfies CSSProperties,
} as const;
