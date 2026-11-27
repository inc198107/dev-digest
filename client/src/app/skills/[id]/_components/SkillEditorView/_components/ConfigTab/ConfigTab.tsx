"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Modal, TextInput, Toggle } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { useDeleteSkill, useUpdateSkill } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { isFormComplete, SkillFields, toFormValue, type SkillFormValue } from "../../../../../_components/SkillFields";
import { MAX_NOTE_CHARS } from "./constants";
import { bumpsVersion, changedFields, mergeStored, sameForm, withNote } from "./helpers";
import { s } from "./styles";

/**
 * Config tab of the skill editor: name, directive description, type and body, the
 * workspace-wide enabled switch, save (with the version it will create and an optional "what
 * changed" note that titles that version) and delete. The editor
 * keeps it mounted (keyed by skill id) while other tabs are shown, so a draft survives a look at
 * Preview or Versions. When the stored fields change (a save, including a type-only one, a
 * restore, an edit elsewhere) every field the user did not touch takes the stored value and the
 * touched fields keep the draft, so saving a draft never reverts a newer stored change.
 * @param props.skill The skill being edited.
 * @returns The tab.
 */
export function ConfigTab({ skill }: { skill: SkillListItem }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const update = useUpdateSkill();
  const remove = useDeleteSkill();
  const original = toFormValue(skill);
  const [value, setValue] = React.useState<SkillFormValue>(original);
  const [syncedValue, setSyncedValue] = React.useState<SkillFormValue>(original);
  const [note, setNote] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  /**
   * Adjust the form during render when the stored fields changed (React's prop-change pattern).
   * Compared by content, not version: a type-only save keeps the version but still moves the
   * baseline a draft is measured against.
   */
  if (!sameForm(syncedValue, original)) {
    setSyncedValue(original);
    setValue(mergeStored(syncedValue, original, value));
  }

  const patch = changedFields(original, value);
  const dirty = Object.keys(patch).length > 0;
  const bump = bumpsVersion(patch);

  const save = () =>
    update.mutate(
      { id: skill.id, patch: withNote(patch, note) },
      {
        onSuccess: (saved) => {
          setNote("");
          toast.success(t("config.savedToast", { version: saved.version }));
        },
      },
    );

  const discard = () => {
    setValue(original);
    setNote("");
  };

  const doDelete = () =>
    remove.mutate(skill.id, {
      onSuccess: () => {
        toast.success(t("config.deleted"));
        router.push("/skills");
      },
    });

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("config.title")}</h2>
        <Badge color="var(--text-secondary)" icon="GitCommit" mono>
          v{skill.version}
        </Badge>
        <label style={s.enabledLabel}>
          {t("config.enabled")}
          <Toggle on={skill.enabled} onChange={(enabled) => update.mutate({ id: skill.id, patch: { enabled } })} size={16} />
        </label>
      </div>

      <SkillFields value={value} onChange={(p) => setValue((v) => ({ ...v, ...p }))} unsaved={dirty} />

      {bump && (
        <FormField
          label={t("config.note")}
          hint={t("config.noteHint", { version: skill.version + 1 })}
          right={
            <span className="mono tnum" style={s.noteCount}>
              {note.length}/{MAX_NOTE_CHARS}
            </span>
          }
        >
          <TextInput
            value={note}
            onChange={setNote}
            maxLength={MAX_NOTE_CHARS}
            placeholder={t("config.notePlaceholder")}
            aria-label={t("config.note")}
          />
        </FormField>
      )}

      <div style={s.actions}>
        <Button kind="primary" icon="Check" onClick={save} disabled={!dirty || !isFormComplete(value) || update.isPending}>
          {update.isPending ? t("config.saving") : t("config.save")}
        </Button>
        <Button kind="ghost" onClick={discard} disabled={!dirty}>
          {t("config.cancel")}
        </Button>
        {dirty && (
          <span style={s.versionNote}>
            {bump
              ? t("config.nextVersion", { version: skill.version + 1 })
              : t("config.sameVersion", { version: skill.version })}
          </span>
        )}
      </div>

      <div style={s.danger}>
        <div style={s.dangerText}>
          <div style={s.dangerTitle}>{t("config.deleteTitle")}</div>
          <div style={s.dangerBody}>
            {t("config.deleteBody")}
            {skill.used_by.length > 0 &&
              " " +
                t("config.deleteUsedBy", {
                  count: skill.used_by.length,
                  names: skill.used_by.map((a) => a.name).join(", "),
                })}
          </div>
        </div>
        <Button kind="danger" size="sm" icon="Trash" onClick={() => setConfirmDelete(true)}>
          {t("config.delete")}
        </Button>
      </div>

      {confirmDelete && (
        <Modal
          width={480}
          title={t("config.deleteConfirmTitle", { name: skill.name })}
          onClose={() => setConfirmDelete(false)}
          footer={
            <div style={s.modalFooter}>
              <Button kind="ghost" onClick={() => setConfirmDelete(false)}>
                {t("config.cancel")}
              </Button>
              <Button kind="danger" icon="Trash" onClick={doDelete} disabled={remove.isPending}>
                {t("config.deleteConfirm")}
              </Button>
            </div>
          }
        >
          <div style={s.modalBody}>
            {t("config.deleteBody")}
            {skill.used_by.length > 0 &&
              " " +
                t("config.deleteUsedBy", {
                  count: skill.used_by.length,
                  names: skill.used_by.map((a) => a.name).join(", "),
                })}
          </div>
        </Modal>
      )}
    </div>
  );
}
