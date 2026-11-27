import type { CSSProperties } from "react";

/** Co-located styles for CommunitySearchDrawer (design: "Search community skills"). */
export const s = {
  search: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px 6px 12px",
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    marginBottom: 12,
    minHeight: 40,
  } satisfies CSSProperties,
  searchIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    color: "var(--text-primary)",
    background: "transparent",
    border: "none",
    outline: "none",
  } satisfies CSSProperties,
  chips: { display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 16 } satisfies CSSProperties,
} as const;
