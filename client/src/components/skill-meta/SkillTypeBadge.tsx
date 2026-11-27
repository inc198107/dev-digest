"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SKILL_TYPE_TONE } from "./constants";
import { s } from "./styles";

/**
 * Coloured label of a skill's type (Skills Lab cards, editor header, agent Skills tab).
 * @param props.type The skill type.
 * @returns The badge.
 */
export function SkillTypeBadge({ type }: { type: SkillType }) {
  const t = useTranslations("skills");
  return <span style={s.badge(SKILL_TYPE_TONE[type])}>{t(`type.${type}`)}</span>;
}

/**
 * Square type-coloured icon of a skill.
 * @param props.type The skill type.
 * @param props.size Edge length in pixels.
 * @returns The icon.
 */
export function SkillTypeIcon({ type, size = 26 }: { type: SkillType; size?: number }) {
  return (
    <div style={s.icon(SKILL_TYPE_TONE[type], size)} aria-hidden>
      <Icon.Sparkles size={Math.round(size * 0.55)} />
    </div>
  );
}
