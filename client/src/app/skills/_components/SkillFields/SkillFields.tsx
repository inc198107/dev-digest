"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { SkillBodyEditor } from "../../../../components/skill-body-editor";
import { SKILL_TYPES } from "../../../../components/skill-meta";
import { estimateTokens, formatSkillBlock } from "@/lib/skill-block";
import type { SkillFormValue } from "./helpers";

/**
 * The fields of a skill (create, import preview, Config tab): name, directive description,
 * type and the Markdown body in the file-style editor with a live token estimate of the whole
 * block.
 * @param props.value Current values.
 * @param props.onChange Receives the changed fields.
 * @param props.unsaved Mark the body editor "unsaved" (the form differs from what is stored).
 * @param props.bodyRows Minimum height of the body editor in lines.
 * @returns The form fields.
 */
export function SkillFields({
  value,
  onChange,
  unsaved = false,
  bodyRows = 16,
}: {
  value: SkillFormValue;
  onChange: (patch: Partial<SkillFormValue>) => void;
  unsaved?: boolean;
  bodyRows?: number;
}) {
  const t = useTranslations("skills");
  const typeOptions = SKILL_TYPES.map((type) => ({ value: type, label: t(`type.${type}`) }));
  const tokens = estimateTokens(formatSkillBlock(value));
  return (
    <>
      <FormField label={t("fields.name")} hint={t("fields.nameHint")} required>
        <TextInput
          value={value.name}
          onChange={(name) => onChange({ name })}
          placeholder={t("fields.namePlaceholder")}
          aria-label={t("fields.name")}
          mono
        />
      </FormField>
      <FormField label={t("fields.description")} hint={t("fields.descriptionHint")} required>
        <TextInput
          value={value.description}
          onChange={(description) => onChange({ description })}
          placeholder={t("fields.descriptionPlaceholder")}
          aria-label={t("fields.description")}
        />
      </FormField>
      <FormField label={t("fields.type")}>
        <SelectInput
          value={value.type}
          onChange={(type) => onChange({ type: type as SkillType })}
          options={typeOptions}
        />
      </FormField>
      <FormField label={t("fields.body")} hint={t("fields.bodyHint")} required>
        <SkillBodyEditor
          fileName={`${value.name.trim() || t("fields.fileFallback")}.md`}
          value={value.body}
          onChange={(body) => onChange({ body })}
          label={t("fields.body")}
          tokensLabel={t("fields.tokens", { count: tokens })}
          unsaved={unsaved}
          placeholder={t("fields.bodyPlaceholder")}
          minRows={bodyRows}
        />
      </FormField>
    </>
  );
}
