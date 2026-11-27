import type { CSSProperties } from "react";

/** Co-located styles for the skill Config tab. */
export const s = {
  wrap: { maxWidth: 780 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  enabledLabel: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 4, alignItems: "center" } satisfies CSSProperties,
  versionNote: { marginLeft: "auto", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  danger: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 28,
    paddingTop: 20,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  dangerText: { flex: 1 } satisfies CSSProperties,
  dangerTitle: { fontSize: 13, fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
  dangerBody: { fontSize: 12.5, color: "var(--text-muted)", marginTop: 2 } satisfies CSSProperties,
  modalBody: { padding: 24, fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.55 } satisfies CSSProperties,
  modalFooter: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
