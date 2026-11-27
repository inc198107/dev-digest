import type { SkillType } from "@devdigest/shared";

/** Colour pair (design tokens) of one skill type. */
export interface SkillTypeTone {
  color: string;
  bg: string;
}

/** Skill type → tokens, as in the Skills Lab design (rubric blue, convention green, security red). */
export const SKILL_TYPE_TONE: Record<SkillType, SkillTypeTone> = {
  rubric: { color: "var(--accent)", bg: "var(--accent-bg)" },
  convention: { color: "var(--ok)", bg: "var(--ok-bg)" },
  security: { color: "var(--crit)", bg: "var(--crit-bg)" },
  custom: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
};

/** Every skill type, in display order (typed literal: no value import from @devdigest/shared). */
export const SKILL_TYPES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];
