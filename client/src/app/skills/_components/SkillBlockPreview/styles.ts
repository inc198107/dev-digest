import type { CSSProperties } from "react";

/** Co-located styles for SkillBlockPreview. */
export const s = {
  card: {
    padding: "16px 20px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
