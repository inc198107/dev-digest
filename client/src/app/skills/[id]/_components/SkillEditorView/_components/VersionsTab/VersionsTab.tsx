"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Markdown, Modal, Skeleton } from "@devdigest/ui";
import type { SkillListItem, SkillVersion } from "@devdigest/shared";
import { useRestoreSkillVersion, useSkillVersions } from "../../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../../lib/toast";
import { bodySummary, formatSnapshotDate } from "./helpers";
import { s } from "./styles";

/**
 * Versions tab: the body snapshots of the skill, newest first. A snapshot can be viewed or
 * restored; restoring makes it the body of a new version, history is never rewritten.
 * @param props.skill The skill.
 * @returns The tab.
 */
export function VersionsTab({ skill }: { skill: SkillListItem }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [viewing, setViewing] = React.useState<SkillVersion | null>(null);

  const doRestore = (version: number) =>
    restore.mutate(
      { id: skill.id, version },
      { onSuccess: (saved) => toast.success(t("versions.restored", { from: version, version: saved.version })) },
    );

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("versions.title")}</h2>
        {versions && <Badge color="var(--text-secondary)">{t("versions.count", { count: versions.length })}</Badge>}
      </div>
      <p style={s.subtitle}>{t("versions.subtitle")}</p>

      {isLoading && <Skeleton height={56} />}
      {versions && versions.length === 0 && <div style={s.empty}>{t("versions.empty")}</div>}
      <div style={s.list}>
        {(versions ?? []).map((v) => {
          const current = v.version === skill.version;
          return (
            <div key={v.version} style={s.row(current)}>
              <span className="mono" style={s.versionTag(current)}>
                v{v.version}
              </span>
              <div style={s.rowText}>
                <div style={s.firstLine}>{bodySummary(v.body)}</div>
                <div style={s.date}>{formatSnapshotDate(v.created_at)}</div>
              </div>
              {current && (
                <Badge color="var(--ok)" bg="var(--ok-bg)" dot>
                  {t("versions.current")}
                </Badge>
              )}
              <div style={s.actions}>
                <Button kind="ghost" size="sm" icon="Eye" onClick={() => setViewing(v)}>
                  {t("versions.view")}
                </Button>
                {!current && (
                  <Button
                    kind="secondary"
                    size="sm"
                    icon="History"
                    onClick={() => doRestore(v.version)}
                    disabled={restore.isPending}
                  >
                    {t("versions.restore")}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {viewing && (
        <Modal
          width={760}
          title={t("versions.viewTitle", { name: skill.name, version: viewing.version })}
          subtitle={formatSnapshotDate(viewing.created_at)}
          onClose={() => setViewing(null)}
        >
          <div style={s.modalBody}>
            <Markdown doc>{viewing.body}</Markdown>
          </div>
        </Modal>
      )}
    </div>
  );
}
