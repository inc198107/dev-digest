"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormField, Modal, TextInput } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { isFormComplete, toFormValue, type SkillFormValue } from "../../../SkillFields";
import { ImportPreview } from "./_components/ImportPreview";
import { IMPORT_ACCEPT, IMPORT_MODAL_WIDTH, MAX_IMPORT_BYTES } from "./constants";
import { kilobytes, readFileAsBase64 } from "./helpers";
import { s } from "./styles";

/**
 * Import a skill in two steps: pick a file (or paste a URL) → review the preview the server
 * built and confirm. Nothing is stored before "Save skill"; the server only reads the skill
 * core and never runs anything from a package.
 * @param props.source Import from an uploaded file or from an https URL.
 * @param props.onClose Close the modal.
 * @returns The modal.
 */
export function ImportSkillModal({ source, onClose }: { source: "file" | "url"; onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const previewMutation = useImportSkillPreview();
  const create = useCreateSkill();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [url, setUrl] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [value, setValue] = React.useState<SkillFormValue | null>(null);

  const canPreview = source === "file" ? file !== null : url.trim().length > 0;

  const runPreview = async () => {
    setError(null);
    try {
      let result: SkillImportPreview;
      if (source === "file") {
        if (!file) return;
        if (file.size > MAX_IMPORT_BYTES) {
          setError(t("import.tooLarge"));
          return;
        }
        let content: string;
        try {
          content = await readFileAsBase64(file);
        } catch {
          setError(t("import.readFailed"));
          return;
        }
        result = await previewMutation.mutateAsync({ kind: "file", filename: file.name, content_base64: content });
      } else {
        result = await previewMutation.mutateAsync({ kind: "url", url: url.trim() });
      }
      setPreview(result);
      setValue(toFormValue(result));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("import.readFailed"));
    }
  };

  const save = async () => {
    if (!preview || !value) return;
    try {
      const skill = await create.mutateAsync({
        name: value.name.trim(),
        description: value.description.trim(),
        type: value.type,
        body: value.body,
        source: preview.source,
      });
      toast.success(t("import.saved", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}?tab=config`);
    } catch {
      /** The global mutation handler already shows the API error as a toast. */
    }
  };

  const back = () => {
    setPreview(null);
    setValue(null);
    setError(null);
  };

  const footer =
    preview && value ? (
      <div style={s.footer}>
        <Button kind="ghost" onClick={back}>
          {t("import.back")}
        </Button>
        <Button kind="primary" icon="Check" onClick={save} disabled={!isFormComplete(value) || create.isPending}>
          {create.isPending ? t("import.saving") : t("import.save")}
        </Button>
      </div>
    ) : (
      <div style={s.footer}>
        <Button kind="ghost" onClick={onClose}>
          {t("import.cancel")}
        </Button>
        <Button kind="primary" icon="Eye" onClick={runPreview} disabled={!canPreview || previewMutation.isPending}>
          {previewMutation.isPending ? t("import.previewing") : t("import.preview")}
        </Button>
      </div>
    );

  return (
    <Modal
      width={IMPORT_MODAL_WIDTH}
      title={source === "file" ? t("import.fileTitle") : t("import.urlTitle")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={footer}
    >
      <div style={s.body}>
        {preview && value ? (
          <ImportPreview
            preview={preview}
            value={value}
            onChange={(patch) => setValue((v) => (v ? { ...v, ...patch } : v))}
          />
        ) : source === "file" ? (
          <FormField hint={t("import.fileHint")}>
            <div style={s.fileRow}>
              <input
                ref={fileInput}
                type="file"
                accept={IMPORT_ACCEPT}
                style={s.hiddenInput}
                data-testid="skill-import-file"
                onChange={(e) => {
                  setError(null);
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
              <Button kind="secondary" icon="Upload" onClick={() => fileInput.current?.click()}>
                {t("import.choose")}
              </Button>
              {file && (
                <span className="mono" style={s.chosen}>
                  {t("import.chosen", { name: file.name, size: kilobytes(file.size) })}
                </span>
              )}
            </div>
          </FormField>
        ) : (
          <FormField label={t("import.urlLabel")} hint={t("import.urlHint")}>
            <TextInput
              value={url}
              onChange={setUrl}
              placeholder={t("import.urlPlaceholder")}
              aria-label={t("import.urlLabel")}
              mono
            />
          </FormField>
        )}
        {error && (
          <div style={s.error} role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
