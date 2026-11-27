"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card, CircularScore, Donut, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { SkillListItem } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../../lib/hooks/skills";
import { formatRate, ratePercent } from "../../../../../_lib/skill-stats";
import { StatCard } from "./_components/StatCard";
import { ACCEPT_RING_SIZE, DONUT_SIZE } from "./constants";
import { categorySegments } from "./helpers";
import { s } from "./styles";

/**
 * Stats tab: how the skill was used in the last 30 days — agents that link it, how often review
 * runs loaded it, the accept rate and findings of those runs, the findings by category — and the
 * agents using it, each with a link to its Skills tab. Without a run that loaded the skill, an
 * empty state replaces the numbers.
 * @param props.skill The skill (its `used_by` lists the agents).
 * @returns The tab.
 */
export function StatsTab({ skill }: { skill: SkillListItem }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);
  const hasRuns = !!stats && stats.skill_runs_30d > 0;
  const segments = stats ? categorySegments(stats.findings_by_category) : [];

  return (
    <div style={s.wrap}>
      <h2 style={s.h2}>{t("stats.title")}</h2>
      <p style={s.subtitle}>{t("stats.subtitle")}</p>

      {isLoading && <Skeleton height={110} />}
      {isError && <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />}
      {stats && !hasRuns && (
        <div style={s.empty}>
          <EmptyState icon="BarChart" title={t("stats.emptyTitle")} body={t("stats.emptyBody")} />
        </div>
      )}
      {stats && hasRuns && (
        <div style={s.cards}>
          <StatCard
            label={t("stats.usedBy")}
            value={stats.used_by}
            suffix={t("stats.agentsSuffix", { count: stats.used_by })}
          />
          <StatCard
            label={t("stats.pullFrequency")}
            value={formatRate(stats.pull_frequency)}
            sub={t("stats.pullSub", { skillRuns: stats.skill_runs_30d, runs: stats.runs_30d })}
          />
          <StatCard
            label={t("stats.acceptRate")}
            value={formatRate(stats.accept_rate)}
            sub={t("stats.acceptSub")}
            aside={
              stats.accept_rate != null && (
                <CircularScore score={ratePercent(stats.accept_rate)} size={ACCEPT_RING_SIZE} stroke={3.5} />
              )
            }
          />
          <StatCard label={t("stats.findings")} value={stats.findings_30d} sub={t("stats.findingsSub")} />
        </div>
      )}

      <div style={s.panels}>
        <Card>
          <SectionLabel icon="Cpu">{t("stats.agentsTitle")}</SectionLabel>
          {skill.used_by.length === 0 ? (
            <div style={s.muted}>{t("stats.agentsEmpty")}</div>
          ) : (
            <ul style={s.agentList} aria-label={t("stats.agentsTitle")}>
              {skill.used_by.map((agent) => (
                <li key={agent.agent_id} style={s.agentRow}>
                  <Icon.Cpu size={14} style={s.agentIcon} />
                  <span style={s.agentName} title={agent.name}>
                    {agent.name}
                  </span>
                  <Link
                    href={`/agents/${agent.agent_id}?tab=skills`}
                    style={s.open}
                    aria-label={t("stats.openAgent", { name: agent.name })}
                  >
                    {t("stats.open")}
                    <Icon.ArrowRight size={12} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        {hasRuns && (
          <Card>
            <SectionLabel icon="Tag">{t("stats.categoriesTitle")}</SectionLabel>
            {segments.length === 0 ? (
              <div style={s.muted}>{t("stats.categoriesEmpty")}</div>
            ) : (
              <div style={s.donut} data-testid="skill-findings-by-category">
                <Donut segments={segments} size={DONUT_SIZE} formatValue={String} />
              </div>
            )}
          </Card>
        )}
      </div>

      {hasRuns && (
        <p style={s.footnote}>
          <Icon.Info size={13} style={s.footnoteIcon} />
          {t("stats.footnote")}
        </p>
      )}
    </div>
  );
}
