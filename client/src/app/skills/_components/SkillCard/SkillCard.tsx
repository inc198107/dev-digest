"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Toggle } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { SkillTypeBadge, SkillTypeIcon } from "../../../../components/skill-meta";
import { SOURCE_ICON } from "./constants";
import { s } from "./styles";

/**
 * A skill in the Skills Lab: name, description, type, source, how many agents use it and the
 * workspace-wide enabled switch.
 * @param props.skill The skill with its users.
 * @param props.active Highlight it as the selected one.
 * @param props.onClick Open it.
 * @param props.onToggle Turn it on or off for every agent; omitted, no switch is shown.
 * @returns The card.
 */
export function SkillCard({
  skill,
  active = false,
  onClick,
  onToggle,
}: {
  skill: SkillListItem;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const SourceIcon = Icon[SOURCE_ICON[skill.source]];
  /**
   * The whole card opens the skill on a mouse click; keyboard and assistive technology use the
   * title button (its click bubbles up to the card). The switch is a sibling of that button, not
   * nested in it, and stops its click from opening the card.
   */
  return (
    <div onClick={onClick} style={s.card(active, skill.enabled)}>
      <div style={s.headerRow}>
        <button type="button" aria-pressed={active} style={s.titleButton}>
          <SkillTypeIcon type={skill.type} />
          <span className="mono" style={s.name} title={skill.name}>
            {skill.name}
          </span>
        </button>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle
              on={skill.enabled}
              onChange={onToggle}
              size={14}
              ariaLabel={t("card.toggle", { name: skill.name })}
            />
          </div>
        )}
      </div>
      <div style={s.description}>{skill.description}</div>
      <div style={s.metaRow}>
        <SkillTypeBadge type={skill.type} />
        <span style={s.source}>
          <SourceIcon size={11} />
          {t(`source.${skill.source}`)}
        </span>
      </div>
      <div style={s.footer}>
        <span className="tnum">{t("card.usedBy", { count: skill.used_by.length })}</span>
        <span className="mono tnum">{t("card.version", { version: skill.version })}</span>
      </div>
    </div>
  );
}
