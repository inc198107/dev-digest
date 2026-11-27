import type { CSSProperties } from "react";

/** Styles of CreateSkillModal (design: "Create skill from conventions"). */
export const s = {
  body: { padding: "18px 24px 4px" } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    marginBottom: 20,
    borderRadius: 8,
    background: "var(--accent-bg)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.45,
  } satisfies CSSProperties,
  bannerIcon: { flexShrink: 0, color: "var(--accent-text)" } satisfies CSSProperties,
  bannerCount: { color: "var(--text-primary)", fontWeight: 700 } satisfies CSSProperties,
  bannerRepo: { color: "var(--accent-text)" } satisfies CSSProperties,
  row: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 } satisfies CSSProperties,
  toggleRow: { display: "flex", alignItems: "center", minHeight: 42 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 6 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 8, width: "100%" } satisfies CSSProperties,
  footerNote: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginRight: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
};
