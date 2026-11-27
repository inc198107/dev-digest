"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { SkillListItem } from "@devdigest/shared";
import { SkillBlockPreview } from "../../../../../_components/SkillBlockPreview";
import { s } from "./styles";

/**
 * Preview tab: the saved skill rendered as the reviewing agent receives it.
 * @param props.skill The skill.
 * @returns The tab.
 */
export function PreviewTab({ skill }: { skill: SkillListItem }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("preview.title")}</h2>
      <p style={s.subtitle}>{t("preview.subtitle")}</p>
      <SkillBlockPreview skill={skill} />
    </div>
  );
}
