"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { AppShell } from "../../../../components/app-shell";
import { useSkills, useSkillStatsSummary, useUpdateSkill } from "../../../../lib/hooks/skills";
import { AddSkillMenu, SkillDialogs, type AddSkillMode } from "../AddSkill";
import { SkillCard } from "../SkillCard";
import { SkillPreviewDrawer } from "./_components/SkillPreviewDrawer";
import { filterSkills } from "../../_lib/filter-skills";
import { indexStatsBySkill } from "../../_lib/skill-stats";
import { s } from "./styles";

/**
 * /skills — the Skills Lab list: a grid of skill cards with search and the workspace-wide
 * enabled switch. A click opens the side preview; "Add skill" creates or imports one.
 * @returns The page body inside the app shell.
 */
export function SkillsListView() {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: statsSummary } = useSkillStatsSummary();
  const update = useUpdateSkill();
  const [search, setSearch] = React.useState("");
  const [dialog, setDialog] = React.useState<AddSkillMode | null>(null);
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const all = skills ?? [];
  const list = filterSkills(all, search);
  const previewed = all.find((sk) => sk.id === previewId) ?? null;
  const statsById = indexStatsBySkill(statsSummary);
  const toggle = (id: string, enabled: boolean) => update.mutate({ id, patch: { enabled } });

  return (
    <AppShell crumb={[{ label: t("page.crumbLab") }, { label: t("page.crumbSkills") }]}>
      <SkillDialogs mode={dialog} onClose={() => setDialog(null)} />
      {previewed && (
        <SkillPreviewDrawer
          skill={previewed}
          onClose={() => setPreviewId(null)}
          onEdit={() => router.push(`/skills/${previewed.id}?tab=config`)}
          onToggle={(enabled) => toggle(previewed.id, enabled)}
        />
      )}
      <div style={s.page}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h1 style={s.h1}>{t("page.title")}</h1>
            <p style={s.subtitle}>{t("page.subtitle")}</p>
          </div>
          <div style={s.search}>
            <Icon.Search size={13} style={s.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("page.searchPlaceholder")}
              aria-label={t("page.searchPlaceholder")}
              style={s.searchInput}
            />
          </div>
          <AddSkillMenu onSelect={setDialog} />
        </div>

        {isLoading && (
          <div style={s.grid}>
            <Skeleton height={140} />
            <Skeleton height={140} />
            <Skeleton height={140} />
          </div>
        )}
        {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
        {!isLoading && !isError && all.length === 0 && (
          <EmptyState
            icon="Sparkles"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={t("page.empty.cta")}
            onCta={() => setDialog("create")}
          />
        )}
        {all.length > 0 && list.length === 0 && <div style={s.noMatch}>{t("page.noMatch", { q: search })}</div>}
        {list.length > 0 && (
          <div style={s.grid}>
            {list.map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                stats={statsById.get(sk.id)}
                active={sk.id === previewId}
                onClick={() => setPreviewId(sk.id)}
                onToggle={(enabled) => toggle(sk.id, enabled)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
