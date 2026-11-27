import type { CSSProperties } from "react";

/** Co-located styles for CommunitySkillCard (design: "Search community skills" result card). */
export const s = {
  card: {
    listStyle: "none",
    border: "1px solid var(--border)",
    borderRadius: 9,
    background: "var(--bg-elevated)",
    padding: 14,
  } satisfies CSSProperties,
  top: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  stars: {
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 11.5,
    color: "var(--warn)",
    flexShrink: 0,
  } satisfies CSSProperties,
  description: {
    fontSize: 12,
    color: "var(--text-secondary)",
    margin: "6px 0 0",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  bottom: { display: "flex", alignItems: "center", gap: 8, marginTop: 10 } satisfies CSSProperties,
  repo: {
    fontSize: 11,
    color: "var(--text-muted)",
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,
  action: { marginLeft: "auto", flexShrink: 0 } satisfies CSSProperties,
} as const;
