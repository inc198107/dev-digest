"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills } from "../../../../lib/hooks/skills";
import { AddSkillMenu, SkillDialogs, type AddSkillMode } from "../AddSkill";
import { s } from "./styles";

/**
 * /skills — the Skills Lab entry. There is no separate list page: the skill editor already shows
 * the list on the left, so this route opens the first skill (`/skills/<id>`, on its default tab).
 * While the list loads it shows the editor's outline; a workspace without skills gets an empty
 * state with "Add skill".
 * @returns The page body inside the app shell.
 */
export function SkillsIndexView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const [dialog, setDialog] = React.useState<AddSkillMode | null>(null);
  const firstId = skills?.[0]?.id;

  React.useEffect(() => {
    if (firstId) router.replace(`/skills/${firstId}`);
  }, [firstId, router]);

  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen body={t("page.loadError")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  if (isLoading || firstId) {
    return (
      <AppShell crumb={crumb}>
        <div style={s.layout} aria-busy="true">
          <div style={s.list}>
            <Skeleton height={28} width={160} />
            <Skeleton height={96} />
            <Skeleton height={96} />
            <Skeleton height={96} />
          </div>
          <div style={s.main}>
            <Skeleton height={24} width={240} />
            <Skeleton height={240} />
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <SkillDialogs mode={dialog} onClose={() => setDialog(null)} />
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <AddSkillMenu onSelect={setDialog} />
        </div>
        <EmptyState
          icon="Sparkles"
          title={t("page.empty.title")}
          body={t("page.empty.body")}
          cta={t("page.empty.cta")}
          onCta={() => setDialog("create")}
        />
      </div>
    </AppShell>
  );
}
