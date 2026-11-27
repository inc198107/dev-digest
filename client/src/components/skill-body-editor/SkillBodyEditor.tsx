"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import { s } from "./styles";

/** Props of SkillBodyEditor. */
export interface SkillBodyEditorProps {
  /** File name shown in the header (`<skill>.md`). */
  fileName: string;
  /** The body. */
  value: string;
  /** Receives the edited body. */
  onChange: (value: string) => void;
  /** Accessible name of the text area. */
  label: string;
  /** Token count text shown on the right of the header. */
  tokensLabel: string;
  /** Show the "unsaved" badge (the body or another field differs from what is stored). */
  unsaved?: boolean;
  /** Placeholder of an empty body. */
  placeholder?: string;
  /** Height of the text area in lines while the body is shorter. */
  minRows?: number;
}

/**
 * Markdown editor of a skill body as in the Skills Lab design: a file header (name, optional
 * "unsaved" badge, token count) and a monospace text area with line numbers. The text area grows
 * with its content, so one scroll box moves the numbers and the text together.
 * @param props See `SkillBodyEditorProps`.
 * @returns The editor.
 */
export function SkillBodyEditor({
  fileName,
  value,
  onChange,
  label,
  tokensLabel,
  unsaved = false,
  placeholder,
  minRows = 1,
}: SkillBodyEditorProps) {
  const t = useTranslations("skills");
  const lineCount = Math.max(1, value.split("\n").length);
  return (
    <div style={s.frame}>
      <div style={s.header}>
        <Icon.FileText size={14} />
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        {unsaved && (
          <Badge color="var(--text-muted)" mono>
            {t("bodyEditor.unsaved")}
          </Badge>
        )}
        <span className="mono tnum" style={s.tokens}>
          {tokensLabel}
        </span>
      </div>
      <div style={s.scroll}>
        <div className="mono" style={s.gutter} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          className="mono"
          aria-label={label}
          value={value}
          rows={Math.max(lineCount, minRows)}
          wrap="off"
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
