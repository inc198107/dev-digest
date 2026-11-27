"use client";

import React from "react";
import { useNow, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useExtractConventions,
  useRejectConvention,
  useSetAllConventionsAccepted,
  useUpdateConvention,
} from "@/lib/hooks/conventions";
import { useSkills } from "@/lib/hooks/skills";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useToast } from "@/lib/toast";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";
import { agoSince, evidenceFileCount } from "./helpers";
import { s } from "./styles";

/** Placeholder cards while the list loads. */
const SKELETON_CARDS = 3;

/** How often the "last scan … ago" text refreshes (ms). */
const NOW_REFRESH_MS = 60_000;

/**
 * Conventions page of a repo: scan, review the candidates (accept, reword, reject, accept all /
 * deselect all) and merge the accepted ones into a skill.
 * @param props.repoId Repository id from the route.
 * @returns The page content inside the app shell.
 */
export function ConventionsView({ repoId }: { repoId: string }) {
  const t = useTranslations("conventions");
  const toast = useToast();
  const now = useNow({ updateInterval: NOW_REFRESH_MS });
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const { data, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);
  const setAll = useSetAllConventionsAccepted(repoId);
  const skills = useSkills();
  const [creating, setCreating] = React.useState(false);

  const repoName = activeRepo?.name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];
  const candidates = data?.candidates ?? [];
  const accepted = candidates.filter((c) => c.accepted);
  const allAccepted = candidates.length > 0 && accepted.length === candidates.length;

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const scan = () =>
    extract.mutate(undefined, {
      onSuccess: (result) =>
        toast.success(t("page.scanDone", { count: result.candidates.length, files: result.analyzed_files.length })),
    });

  const copy = (snippet: string) => {
    void navigator.clipboard?.writeText(snippet).then(() => toast.success(t("card.copied")));
  };

  const subtitle =
    candidates.length > 0 && data?.last_scan_at
      ? (() => {
          const ago = agoSince(data.last_scan_at, now);
          return t("page.summary", {
            count: candidates.length,
            files: evidenceFileCount(candidates),
            ago: t(`page.ago.${ago.unit}`, { count: ago.count }),
          });
        })()
      : t("page.subtitle");

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.title}>
              {t("page.headingPrefix")}
              <span className="mono" style={s.repoName}>
                {repoName}
              </span>
            </h1>
            <p style={s.subtitle}>{subtitle}</p>
          </div>
          {candidates.length > 0 && (
            <Button kind="secondary" size="sm" icon="RefreshCw" onClick={scan} loading={extract.isPending}>
              {extract.isPending ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {extract.isPending && <p style={s.hint}>{t("page.scanningHint")}</p>}
        {extract.isError && !extract.isPending && (
          <div role="alert" style={s.failure}>
            <span style={s.failureTitle}>{t("page.extractionFailed")}</span>{" "}
            {extract.error instanceof Error ? extract.error.message : null}
          </div>
        )}

        {isLoading ? (
          <div style={s.loading}>
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <Skeleton key={i} height={150} />
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={extract.isPending ? t("page.scanning") : t("page.empty.cta")}
            onCta={extract.isPending ? undefined : scan}
            ctaLoading={extract.isPending}
          />
        ) : (
          <>
            <div style={s.toolbar}>
              <Button
                kind="ghost"
                size="sm"
                icon={allAccepted ? "X" : "Check"}
                onClick={() => setAll.mutate(!allAccepted)}
                disabled={setAll.isPending}
              >
                {allAccepted ? t("toolbar.deselectAll") : t("toolbar.acceptAll")}
              </Button>
              <span className="tnum" style={s.count}>
                {t("toolbar.acceptedCount", { accepted: accepted.length, total: candidates.length })}
              </span>
              <span style={s.createSkill}>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Sparkles"
                  onClick={() => setCreating(true)}
                  disabled={accepted.length === 0}
                  title={accepted.length === 0 ? t("toolbar.createSkillHint") : undefined}
                >
                  {t("toolbar.createSkill")}
                </Button>
              </span>
            </div>

            {candidates.map((convention) => (
              <ConventionCard
                key={convention.id}
                convention={convention}
                busy={reject.isPending && reject.variables === convention.id}
                onToggleAccepted={() => update.mutate({ id: convention.id, patch: { accepted: !convention.accepted } })}
                onReject={() => reject.mutate(convention.id)}
                onSaveRule={(rule) => update.mutate({ id: convention.id, patch: { rule } })}
                onCopy={() => copy(convention.evidence_snippet)}
              />
            ))}
          </>
        )}
      </div>

      {creating && (
        <CreateSkillModal
          repoName={repoName}
          accepted={accepted}
          takenNames={(skills.data ?? []).map((skill) => skill.name)}
          onClose={() => setCreating(false)}
        />
      )}
    </AppShell>
  );
}
