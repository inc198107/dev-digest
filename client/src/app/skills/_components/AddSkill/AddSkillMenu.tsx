"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Dropdown } from "@devdigest/ui";
import type { AddSkillMode } from "./types";

/**
 * The "Add skill" button: create from scratch, import from a file, import from a URL.
 * @param props.onSelect Receives the chosen way of adding a skill.
 * @param props.compact Smaller label for the editor's side list.
 * @returns The dropdown.
 */
export function AddSkillMenu({ onSelect, compact = false }: { onSelect: (mode: AddSkillMode) => void; compact?: boolean }) {
  const t = useTranslations("skills");
  return (
    <Dropdown
      width={230}
      align="right"
      trigger={
        <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
          {compact ? t("editor.listTitle") : t("page.addSkill")}
        </Button>
      }
      items={[
        { label: t("menu.fromFile"), icon: "Upload", onClick: () => onSelect("file") },
        { label: t("menu.fromUrl"), icon: "Link", onClick: () => onSelect("url") },
        { divider: true },
        { label: t("menu.create"), icon: "Edit", onClick: () => onSelect("create") },
      ]}
    />
  );
}
