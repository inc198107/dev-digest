import type { CSSProperties } from "react";
import type { SkillTypeTone } from "./constants";

/** Co-located styles for the skill type badge and icon. */
export const s = {
  badge: (tone: SkillTypeTone): CSSProperties => ({
    fontSize: 11,
    fontWeight: 600,
    color: tone.color,
    background: tone.bg,
    padding: "1px 8px",
    borderRadius: 4,
    whiteSpace: "nowrap",
  }),
  icon: (tone: SkillTypeTone, size: number): CSSProperties => ({
    width: size,
    height: size,
    borderRadius: 7,
    background: tone.bg,
    color: tone.color,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
  }),
} as const;
