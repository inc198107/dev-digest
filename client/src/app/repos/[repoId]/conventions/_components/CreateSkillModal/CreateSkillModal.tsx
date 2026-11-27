"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Icon, Modal, TextInput, Toggle } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { SkillBodyEditor } from "@/components/skill-body-editor";
import { useCreateSkill } from "@/lib/hooks/skills";
import { estimateTokens, formatSkillBlock } from "@/lib/skill-block";
import { useToast } from "@/lib/toast";
import { buildSkillDraft } from "../../_lib/build-skill-draft";
import { MAX_BODY_CHARS, MODAL_WIDTH } from "./constants";
import { canSave, formProblems, type SkillForm } from "./helpers";
import { s } from "./styles";

/**
 * "Create skill from conventions": a draft merged from the accepted conventions that the user
 * edits (name, description, enabled, body) and saves as a `convention` skill with source
 * `extracted` and the conventions' evidence paths. Cancel stores nothing; after saving the new
 * skill opens in the Skills Lab editor.
 * @param props.repoName Short repository name (`payments-api`).
 * @param props.accepted The accepted conventions, in page order.
 * @param props.takenNames Names of the workspace's skills.
 * @param props.onClose Close the modal.
 * @returns The modal.
 */
export function CreateSkillModal({
  repoName,
  accepted,
  takenNames,
  onClose,
}: {
  repoName: string;
  accepted: ConventionCandidate[];
  takenNames: string[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions.modal");
  const tSkills = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const create = useCreateSkill();
  const [draft] = React.useState(() => buildSkillDraft(repoName, accepted, takenNames));
  const [form, setForm] = React.useState<SkillForm>({
    name: draft.name,
    description: draft.description,
    body: draft.body,
    enabled: true,
  });
  const taken = React.useMemo(() => new Set(takenNames), [takenNames]);
  const problems = formProblems(form, taken);
  const tokens = estimateTokens(formatSkillBlock(form));
  const set = (patch: Partial<SkillForm>) => setForm((f) => ({ ...f, ...patch }));

  const submit = async () => {
    try {
      const skill = await create.mutateAsync({
        name: form.name.trim(),
        description: form.description.trim(),
        type: "convention",
        body: form.body,
        enabled: form.enabled,
        source: "extracted",
        evidence_files: draft.evidenceFiles,
      });
      toast.success(t("created", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      /** The global mutation handler already shows the API error as a toast. */
    }
  };

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("title")}
      subtitle={<span className="mono">{form.name.trim() || draft.name}</span>}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <span style={s.footerNote}>
            <Icon.GitCommit size={13} />
            {t("footer")}
          </span>
          <Button kind="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            kind="primary"
            icon="Sparkles"
            onClick={submit}
            disabled={!canSave(problems) || create.isPending}
          >
            {create.isPending ? t("creating") : t("create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.banner}>
          <Icon.Sparkles size={15} style={s.bannerIcon} />
          <span>
            {t.rich("banner", {
              count: accepted.length,
              repo: repoName,
              b: (chunks) => <strong style={s.bannerCount}>{chunks}</strong>,
              accent: (chunks) => (
                <span className="mono" style={s.bannerRepo}>
                  {chunks}
                </span>
              ),
            })}
          </span>
        </div>

        <FormField label={t("name")} required>
          <TextInput value={form.name} onChange={(name) => set({ name })} aria-label={t("name")} mono />
          {problems.name && (
            <div role="alert" style={s.error}>
              {problems.name === "taken" ? t("nameTaken") : t("nameInvalid")}
            </div>
          )}
        </FormField>

        <FormField label={t("description")} required>
          <TextInput
            value={form.description}
            onChange={(description) => set({ description })}
            aria-label={t("description")}
          />
        </FormField>

        <div style={s.row}>
          <FormField label={t("type")} hint={t("typeHint")}>
            <TextInput value={tSkills("type.convention")} readOnly aria-label={t("type")} mono />
          </FormField>
          <FormField label={t("enabled")} hint={t("enabledHint")}>
            <div style={s.toggleRow}>
              <Toggle on={form.enabled} onChange={(enabled) => set({ enabled })} ariaLabel={t("enabled")} />
            </div>
          </FormField>
        </div>

        <FormField label={t("body")} required>
          <SkillBodyEditor
            fileName={`${form.name.trim() || draft.name}.md`}
            value={form.body}
            onChange={(body) => set({ body })}
            tokensLabel={t("tokens", { count: tokens })}
            label={t("body")}
            unsaved
          />
          {problems.body === "tooLong" && (
            <div role="alert" style={s.error}>
              {t("bodyTooLong", { max: MAX_BODY_CHARS })}
            </div>
          )}
        </FormField>
      </div>
    </Modal>
  );
}
