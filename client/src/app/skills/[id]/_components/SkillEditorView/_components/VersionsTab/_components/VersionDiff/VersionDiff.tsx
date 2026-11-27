"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { collapseUnchanged, diffCounts, lineDiff, type DiffRow } from "../../line-diff";
import { s } from "./styles";

/** Sign shown in front of a diff line. */
const SIGN: Record<Exclude<DiffRow["kind"], "skip">, string> = { same: " ", add: "+", del: "−" };

/**
 * Line diff of a version's body against the previous version's body: added and removed lines
 * coloured, unchanged runs folded around the changes.
 * @param props.before The previous version's body.
 * @param props.after This version's body.
 * @param props.previousVersion Number of the previous version (for the header).
 * @returns The diff panel.
 */
export function VersionDiff({
  before,
  after,
  previousVersion,
}: {
  before: string;
  after: string;
  previousVersion: number;
}) {
  const t = useTranslations("skills");
  /** The LCS table grows with both bodies, so the diff is computed once per pair. */
  const lines = React.useMemo(() => lineDiff(before, after), [before, after]);
  const { added, removed } = diffCounts(lines);
  const rows = collapseUnchanged(lines);

  return (
    <div style={s.panel} data-testid="version-diff">
      <div style={s.header}>
        <span>{t("versions.diffFrom", { version: previousVersion })}</span>
        <span className="mono tnum" style={s.added}>
          +{added}
        </span>
        <span className="mono tnum" style={s.removed}>
          −{removed}
        </span>
      </div>
      {added + removed === 0 ? (
        <div style={s.same}>{t("versions.diffSame", { version: previousVersion })}</div>
      ) : (
        <div className="mono" style={s.body}>
          {rows.map((row, index) =>
            row.kind === "skip" ? (
              <div key={`skip-${index}`} style={s.skip}>
                {t("versions.diffSkipped", { count: row.count })}
              </div>
            ) : (
              <div key={`${row.kind}-${row.oldNo}-${row.newNo}`} style={s.row(row.kind)} data-kind={row.kind}>
                <span style={s.lineNo}>{row.oldNo ?? ""}</span>
                <span style={s.lineNo}>{row.newNo ?? ""}</span>
                <span style={s.sign(row.kind)} aria-hidden="true">
                  {SIGN[row.kind]}
                </span>
                <span style={s.text}>{row.text || " "}</span>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
