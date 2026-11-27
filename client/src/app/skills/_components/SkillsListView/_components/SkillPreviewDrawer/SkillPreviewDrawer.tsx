"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Drawer, Icon, SectionLabel, Toggle } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { SkillTypeBadge, SkillTypeIcon } from "../../../../../../components/skill-meta";
import { SkillBlockPreview } from "../../../SkillBlockPreview";
import { s } from "./styles";

/**
 * Side preview of a skill opened from the Skills grid: what it is, who uses it and the block
 * the agents receive; "Edit skill" opens the editor.
 * @param props.skill The skill to show.
 * @param props.onClose Close the drawer.
 * @param props.onEdit Open the skill in the editor.
 * @param props.onToggle Turn the skill on or off for every agent.
 * @returns The drawer.
 */
export function SkillPreviewDrawer({
  skill,
  onClose,
  onEdit,
  onToggle,
}: {
  skill: SkillListItem;
  onClose: () => void;
  onEdit: () => void;
  onToggle: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  return (
    <Drawer
      width={640}
      onClose={onClose}
      title={
        <span style={s.title}>
          <SkillTypeIcon type={skill.type} />
          <span className="mono" style={s.name}>
            {skill.name}
          </span>
          <SkillTypeBadge type={skill.type} />
        </span>
      }
      subtitle={t("drawer.subtitle", {
        type: t(`type.${skill.type}`),
        source: t(`source.${skill.source}`),
        version: skill.version,
      })}
      footer={
        <div style={s.footer}>
          <label style={s.toggleLabel}>
            <Toggle on={skill.enabled} onChange={onToggle} size={16} />
            {t("config.enabled")}
          </label>
          <Button kind="ghost" onClick={onClose}>
            {t("drawer.close")}
          </Button>
          <Button kind="primary" icon="Edit" onClick={onEdit}>
            {t("drawer.edit")}
          </Button>
        </div>
      }
    >
      <p style={s.description}>{skill.description}</p>
      {!skill.enabled && <div style={s.disabled}>{t("drawer.disabledNote")}</div>}

      <SectionLabel icon="Cpu">{t("drawer.usedBy")}</SectionLabel>
      {skill.used_by.length === 0 ? (
        <div style={s.notUsed}>{t("drawer.notUsed")}</div>
      ) : (
        <div style={s.usedBy}>
          {skill.used_by.map((a) => (
            <Link key={a.agent_id} href={`/agents/${a.agent_id}?tab=skills`} style={s.agentLink}>
              <Icon.Cpu size={12} style={s.agentIcon} />
              {a.name}
            </Link>
          ))}
        </div>
      )}

      <SectionLabel icon="FileText">{t("drawer.asReceived")}</SectionLabel>
      <SkillBlockPreview skill={skill} />
    </Drawer>
  );
}
