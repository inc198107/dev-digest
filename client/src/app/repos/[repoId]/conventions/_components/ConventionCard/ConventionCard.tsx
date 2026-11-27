"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, IconBtn, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { HIGH_CONFIDENCE, RULE_EDITOR_ROWS } from "./constants";
import { evidenceGithubUrl, ruleProblem, type EvidenceRepo } from "./helpers";
import { s } from "./styles";

/**
 * One extracted convention: the rule (editable in place), the code that shows it, the model's
 * confidence, and Accept / Reject. The evidence path links to the cited lines on GitHub.
 * @param props.convention The convention.
 * @param props.repo The repo it was extracted from; without it the path is plain text.
 * @param props.onToggleAccepted Accept it, or take the acceptance back.
 * @param props.onReject Reject it (the page deletes it).
 * @param props.onSaveRule Store a reworded rule.
 * @param props.onCopy Copy the evidence snippet.
 * @param props.busy Disables the actions while a change of this card is being saved.
 * @returns The card.
 */
export function ConventionCard({
  convention,
  repo,
  onToggleAccepted,
  onReject,
  onSaveRule,
  onCopy,
  busy = false,
}: {
  convention: ConventionCandidate;
  repo?: EvidenceRepo | null;
  onToggleAccepted: () => void;
  onReject: () => void;
  onSaveRule: (rule: string) => void;
  onCopy: () => void;
  busy?: boolean;
}) {
  const t = useTranslations("conventions.card");
  const [draft, setDraft] = React.useState<string | null>(null);
  const problem = draft === null ? null : ruleProblem(draft);
  const pct = Math.round(convention.confidence * 100);
  const evidenceHref = repo ? evidenceGithubUrl(repo, convention.evidence_path) : undefined;

  const save = () => {
    if (draft === null || problem) return;
    const rule = draft.trim();
    if (rule !== convention.rule) onSaveRule(rule);
    setDraft(null);
  };

  return (
    <article style={s.card(convention.accepted)} aria-label={convention.rule}>
      <div style={s.main}>
        {draft === null ? (
          <div style={s.ruleRow}>
            <div style={s.rule}>{convention.rule}</div>
            <IconBtn icon="Edit" size={26} label={t("edit")} onClick={() => setDraft(convention.rule)} />
          </div>
        ) : (
          <div style={s.editor}>
            <label>
              <span className="sr-only">{t("ruleLabel")}</span>
              <Textarea value={draft} onChange={setDraft} rows={RULE_EDITOR_ROWS} />
            </label>
            {problem && (
              <div role="alert" style={s.editorError}>
                {problem.kind === "empty" ? t("ruleEmpty") : t("ruleTooLong", { max: problem.max })}
              </div>
            )}
            <div style={s.editorActions}>
              <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!!problem}>
                {t("save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={() => setDraft(null)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        )}

        <div style={s.evidence}>
          <div style={s.evidenceHeader}>
            {evidenceHref ? (
              <a
                className="mono"
                style={s.evidenceLink}
                href={evidenceHref}
                target="_blank"
                rel="noopener noreferrer"
                title={convention.evidence_path}
                aria-label={t("openOnGithub", { path: convention.evidence_path })}
              >
                {convention.evidence_path}
              </a>
            ) : (
              <span className="mono" style={s.evidencePath} title={convention.evidence_path}>
                {convention.evidence_path}
              </span>
            )}
            <IconBtn icon="Copy" size={24} label={t("copy")} onClick={onCopy} />
          </div>
          <pre className="mono" style={s.snippet}>
            {convention.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar
              value={pct}
              height={5}
              color={convention.confidence >= HIGH_CONFIDENCE ? "var(--ok)" : "var(--warn)"}
            />
          </div>
          <span className="mono tnum" style={s.confidenceValue}>
            {pct}%
          </span>
        </div>
      </div>

      <div style={s.actions}>
        <Button
          kind={convention.accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          full
          aria-pressed={convention.accepted}
          onClick={onToggleAccepted}
          disabled={busy}
        >
          {convention.accepted ? t("accepted") : t("accept")}
        </Button>
        <Button kind="ghost" size="sm" icon="X" full onClick={onReject} disabled={busy}>
          {t("reject")}
        </Button>
      </div>
    </article>
  );
}
