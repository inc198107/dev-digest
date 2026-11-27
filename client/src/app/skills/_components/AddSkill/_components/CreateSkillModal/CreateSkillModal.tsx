"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import { useCreateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { EMPTY_SKILL_FORM, isFormComplete, SkillFields, type SkillFormValue } from "../../../SkillFields";
import { s } from "./styles";

/**
 * Create a skill from scratch, then open it in the editor.
 * @param props.onClose Close the modal.
 * @returns The modal.
 */
export function CreateSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const [value, setValue] = React.useState<SkillFormValue>(EMPTY_SKILL_FORM);

  const submit = async () => {
    try {
      const skill = await create.mutateAsync({
        name: value.name.trim(),
        description: value.description.trim(),
        type: value.type,
        body: value.body,
        source: "manual",
      });
      toast.success(t("create.created", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      /** The global mutation handler already shows the API error as a toast. */
    }
  };

  return (
    <Modal
      width={760}
      title={t("create.title")}
      subtitle={t("create.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!isFormComplete(value) || create.isPending}>
            {create.isPending ? t("create.creating") : t("create.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <SkillFields
          value={value}
          onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
          bodyRows={12}
          unsaved
        />
      </div>
    </Modal>
  );
}
