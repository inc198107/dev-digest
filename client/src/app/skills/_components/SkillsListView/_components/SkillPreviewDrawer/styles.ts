import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewDrawer. */
export const s = {
  title: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  name: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  description: { fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.55, marginBottom: 18 } satisfies CSSProperties,
  disabled: {
    fontSize: 12.5,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    padding: "8px 12px",
    borderRadius: 7,
    marginBottom: 18,
  } satisfies CSSProperties,
  usedBy: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 } satisfies CSSProperties,
  agentLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12.5,
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  agentIcon: { color: "var(--accent)" } satisfies CSSProperties,
  notUsed: { fontSize: 12.5, color: "var(--text-muted)", marginBottom: 20 } satisfies CSSProperties,
  footer: { display: "flex", gap: 10, alignItems: "center" } satisfies CSSProperties,
  toggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
    marginRight: "auto",
  } satisfies CSSProperties,
} as const;
