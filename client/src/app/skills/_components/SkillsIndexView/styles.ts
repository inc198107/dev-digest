import type { CSSProperties } from "react";

/** Width of the list column in the loading outline (px); matches the editor's list column. */
const LIST_WIDTH = 290;

/** Co-located styles for SkillsIndexView: the editor-shaped loading outline and the empty page. */
export const s = {
  layout: { display: "flex", height: "calc(100vh - 52px)" } satisfies CSSProperties,
  list: {
    width: LIST_WIDTH,
    flexShrink: 0,
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
    padding: "16px 14px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  main: { flex: 1, padding: "16px 28px", display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4, maxWidth: 640 } satisfies CSSProperties,
} as const;
