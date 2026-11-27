import type { CSSProperties } from "react";

/** Line height shared by the gutter and the text area, so numbers stay on their lines. */
const LINE_HEIGHT = "20px";

/** Styles of SkillBodyEditor. */
export const s = {
  frame: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--code-bg)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "7px 12px",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  fileName: { fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 11.5, color: "var(--text-muted)" } satisfies CSSProperties,
  scroll: { display: "flex", maxHeight: 340, overflow: "auto" } satisfies CSSProperties,
  gutter: {
    flexShrink: 0,
    padding: "10px 10px 10px 12px",
    textAlign: "right",
    fontSize: 12,
    lineHeight: LINE_HEIGHT,
    color: "var(--text-muted)",
    userSelect: "none",
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    padding: "10px 12px",
    fontSize: 12,
    lineHeight: LINE_HEIGHT,
    border: "none",
    outline: "none",
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre",
    background: "transparent",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
};
