import type { CSSProperties } from "react";
import type { DiffLineKind } from "../../line-diff";

/** Background of a diff line per kind (the diff viewer's code tokens). */
const ROW_BG: Record<DiffLineKind, string> = {
  same: "transparent",
  add: "var(--code-add)",
  del: "var(--code-del)",
};

/** Colour of the +/− sign per kind. */
const SIGN_COLOR: Record<DiffLineKind, string> = {
  same: "var(--text-muted)",
  add: "var(--code-add-text)",
  del: "var(--code-del-text)",
};

/** Co-located styles for VersionDiff. */
export const s = {
  panel: {
    marginTop: 10,
    border: "1px solid var(--border)",
    borderRadius: 7,
    overflow: "hidden",
    background: "var(--code-bg)",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "7px 12px",
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-surface)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  added: { color: "var(--code-add-text)", fontWeight: 600 } satisfies CSSProperties,
  removed: { color: "var(--code-del-text)", fontWeight: 600 } satisfies CSSProperties,
  same: { padding: "10px 12px", fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { maxHeight: 360, overflow: "auto", fontSize: 12, lineHeight: "20px", padding: "4px 0" } satisfies CSSProperties,
  row: (kind: DiffLineKind): CSSProperties => ({ display: "flex", background: ROW_BG[kind], minWidth: "fit-content" }),
  lineNo: {
    width: 36,
    flexShrink: 0,
    paddingRight: 8,
    textAlign: "right",
    color: "var(--text-muted)",
    userSelect: "none",
  } satisfies CSSProperties,
  sign: (kind: DiffLineKind): CSSProperties => ({
    width: 18,
    flexShrink: 0,
    textAlign: "center",
    fontWeight: 700,
    color: SIGN_COLOR[kind],
    userSelect: "none",
  }),
  text: { whiteSpace: "pre", paddingRight: 12, color: "var(--text-primary)" } satisfies CSSProperties,
  skip: {
    padding: "2px 12px 2px 98px",
    fontSize: 11.5,
    color: "var(--text-muted)",
    background: "var(--bg-hover)",
  } satisfies CSSProperties,
} as const;
