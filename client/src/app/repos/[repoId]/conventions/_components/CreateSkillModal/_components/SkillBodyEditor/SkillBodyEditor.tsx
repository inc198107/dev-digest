"use client";

import React from "react";
import { Badge, Icon } from "@devdigest/ui";
import { s } from "./styles";

/**
 * Markdown editor of a skill body as in the design: a file header (name, "unsaved" badge, token
 * count) and a monospace text area with line numbers. The text area grows with its content, so
 * one scroll box moves the numbers and the text together.
 * @param props.fileName File name shown in the header (`<skill>.md`).
 * @param props.value The body.
 * @param props.onChange Receives the edited body.
 * @param props.unsavedLabel Text of the badge.
 * @param props.tokensLabel Token count text.
 * @param props.label Accessible name of the text area.
 * @returns The editor.
 */
export function SkillBodyEditor({
  fileName,
  value,
  onChange,
  unsavedLabel,
  tokensLabel,
  label,
}: {
  fileName: string;
  value: string;
  onChange: (value: string) => void;
  unsavedLabel: string;
  tokensLabel: string;
  label: string;
}) {
  const lineCount = Math.max(1, value.split("\n").length);
  return (
    <div style={s.frame}>
      <div style={s.header}>
        <Icon.FileText size={14} />
        <span className="mono" style={s.fileName}>
          {fileName}
        </span>
        <Badge mono>{unsavedLabel}</Badge>
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
          rows={lineCount}
          wrap="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          style={s.textarea}
        />
      </div>
    </div>
  );
}
