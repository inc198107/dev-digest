import type { CSSProperties } from "react";
import { PROMPT_COLORS } from "../../constants";

/** Co-located styles for SkillBlocksGroup. */
export const s = {
  group: { marginBottom: 8 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  dot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    background: PROMPT_COLORS.skills,
    flexShrink: 0,
  } satisfies CSSProperties,
  blocks: {
    marginLeft: 16,
    paddingLeft: 10,
    borderLeft: "2px solid var(--border)",
  } satisfies CSSProperties,
} as const;
