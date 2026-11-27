import type { CSSProperties } from "react";

/** Co-located styles for the skill Preview tab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700, marginBottom: 4 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginBottom: 16 } satisfies CSSProperties,
} as const;
