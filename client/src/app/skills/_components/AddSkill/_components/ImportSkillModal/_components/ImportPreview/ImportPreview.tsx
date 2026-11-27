"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { SkillBlockPreview } from "../../../../../SkillBlockPreview";
import { SkillFields, type SkillFormValue } from "../../../../../SkillFields";
import { s } from "../../styles";

/**
 * Preview step of an import: the trust warning, where the text came from, what was left out
 * (executables are flagged as not processed), the editable fields and the rendered block.
 * @param props.preview What the server found in the file or URL.
 * @param props.value The fields as the user edits them.
 * @param props.onChange Receives the changed fields.
 * @returns The preview.
 */
export function ImportPreview({
  preview,
  value,
  onChange,
}: {
  preview: SkillImportPreview;
  value: SkillFormValue;
  onChange: (patch: Partial<SkillFormValue>) => void;
}) {
  const t = useTranslations("skills");
  return (
    <>
      <div style={s.trust} role="note">
        <Icon.AlertTriangle size={16} style={s.trustIcon} />
        <div>
          <div style={s.trustTitle}>{t("import.trustTitle")}</div>
          <div style={s.trustBody}>{t("import.trustBody")}</div>
        </div>
      </div>

      <div style={s.facts}>
        <span style={s.factLabel}>{t("import.origin")}</span>
        <span className="mono" style={s.factValue}>
          {preview.origin}
        </span>
        <span style={s.factLabel}>{t("import.skillFile")}</span>
        <span className="mono" style={s.factValue}>
          {preview.skill_file}
        </span>
        <span style={s.factLabel} />
        <span style={s.factValue}>{t("import.tokens", { count: preview.tokens })}</span>
      </div>

      {preview.warnings.length > 0 && (
        <>
          <h3 style={s.sectionTitle}>{t("import.warnings")}</h3>
          <div style={s.list}>
            {preview.warnings.map((w) => (
              <div key={w} style={s.warning}>
                <Icon.Info size={13} style={s.warningIcon} />
                <span>{w}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 style={s.sectionTitle}>{t("import.ignoredTitle")}</h3>
      {preview.ignored_files.length === 0 ? (
        <div style={s.none}>{t("import.ignoredNone")}</div>
      ) : (
        <ul style={s.list} aria-label={t("import.ignoredTitle")}>
          {preview.ignored_files.map((f) => (
            <li key={f.path} style={s.ignoredRow}>
              <Icon.FileText size={13} />
              <span className="mono" style={s.ignoredPath} title={f.path}>
                {f.path}
              </span>
              <span style={s.reason(f.reason === "executable")}>{t(`import.reason.${f.reason}`)}</span>
            </li>
          ))}
        </ul>
      )}

      <div style={s.columns}>
        <div>
          <SkillFields value={value} onChange={onChange} bodyRows={14} unsaved />
        </div>
        <div>
          <SkillBlockPreview skill={value} />
        </div>
      </div>
    </>
  );
}
