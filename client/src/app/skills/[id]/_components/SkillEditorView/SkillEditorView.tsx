"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, ErrorState, Icon, Skeleton, Tabs } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { AppShell } from "../../../../../components/app-shell";
import { SkillTypeBadge, SkillTypeIcon } from "../../../../../components/skill-meta";
import { useSkill, useSkills, useSkillStatsSummary, useUpdateSkill } from "../../../../../lib/hooks/skills";
import { AddSkillMenu, SkillDialogs, type AddSkillMode } from "../../../_components/AddSkill";
import { SkillCard } from "../../../_components/SkillCard";
import { filterSkills } from "../../../_lib/filter-skills";
import { indexStatsBySkill } from "../../../_lib/skill-stats";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { SKILL_TABS, type SkillTabKey } from "./constants";
import { parseSkillTab } from "./helpers";
import { s } from "./styles";

/**
 * /skills/:id — the skill editor (mirrors the Agent editor): the skill list on the left, the
 * selected skill's tabs on the right. The tab lives in `?tab=`.
 * @param props.id The skill id from the route.
 * @returns The editor inside the app shell.
 */
export function SkillEditorView({ id }: { id: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skills } = useSkills();
  const { data: skill, isLoading, isError, refetch } = useSkill(id);
  const { data: statsSummary } = useSkillStatsSummary();
  const update = useUpdateSkill();
  const [filter, setFilter] = React.useState("");
  const [dialog, setDialog] = React.useState<AddSkillMode | null>(null);

  const tab = parseSkillTab(search.get("tab"));
  const setTab = (next: string) => router.replace(`/skills/${id}?tab=${next}`);
  const tabs = SKILL_TABS.map((tb) => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }));
  const statsById = indexStatsBySkill(statsSummary);
  const crumb = [
    { label: t("page.crumbLab") },
    { label: t("page.crumbSkills"), href: "/skills" },
    { label: skill?.name ?? t("editor.listTitle"), mono: true },
  ];

  if (isError || (!isLoading && !skill)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState fullScreen title={t("editor.notFoundTitle")} body={t("editor.notFoundBody")} onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <SkillDialogs mode={dialog} onClose={() => setDialog(null)} />
      <div style={s.layout}>
        <aside style={s.list}>
          <div style={s.listHead}>
            <div style={s.listTitleRow}>
              <h1 style={s.listTitle}>{t("editor.listTitle")}</h1>
              <AddSkillMenu onSelect={setDialog} />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                aria-label={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.listBody}>
            {filterSkills(skills ?? [], filter).map((sk) => (
              <SkillCard
                key={sk.id}
                skill={sk}
                stats={statsById.get(sk.id)}
                active={sk.id === id}
                onClick={() => router.push(`/skills/${sk.id}?tab=${tab}`)}
                onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
              />
            ))}
          </div>
        </aside>

        {isLoading || !skill ? (
          <div style={s.loading}>
            <Skeleton height={24} width={240} />
            <Skeleton height={240} />
          </div>
        ) : (
          <div style={s.main}>
            <div style={s.header}>
              <SkillTypeIcon type={skill.type} />
              <h1 className="mono" style={s.name}>
                {skill.name}
              </h1>
              <SkillTypeBadge type={skill.type} />
              <Badge color="var(--text-secondary)" icon="GitCommit" mono>
                v{skill.version}
              </Badge>
              {!skill.enabled && <Badge color="var(--text-muted)">{t("editor.disabled")}</Badge>}
            </div>
            <div style={s.tabsBar}>
              <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 24px" />
            </div>
            <div style={s.body}>
              <EditorTab tab={tab} skill={skill} />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

/**
 * The content of the selected tab. Config stays mounted (hidden) while another tab is shown, so
 * an unsaved draft survives a look at another tab; it is keyed by skill id, so opening
 * another skill starts a fresh form.
 * @param props.tab Selected tab.
 * @param props.skill The skill being edited.
 * @returns The tab body.
 */
function EditorTab({ tab, skill }: { tab: SkillTabKey; skill: SkillListItem }) {
  return (
    <>
      <div hidden={tab !== "config"}>
        <ConfigTab key={skill.id} skill={skill} />
      </div>
      {tab === "preview" && <PreviewTab skill={skill} />}
      {tab === "stats" && <StatsTab skill={skill} />}
      {tab === "versions" && <VersionsTab skill={skill} />}
    </>
  );
}
