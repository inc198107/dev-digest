"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Checkbox, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { Agent, SkillListItem } from "@devdigest/shared";
import { useAgentSkills, useSetAgentSkills, useSkills } from "../../../../../../../lib/hooks/skills";
import { SkillTypeBadge } from "../../../../../../../components/skill-meta";
import {
  availableSkills,
  dropPosition,
  linkedIds,
  linkedSkills,
  matchesFilter,
  moveBy,
  moveRelative,
  toggleLink,
  type DropPosition,
} from "./helpers";
import { s } from "./styles";

/** The row a dragged skill hovers, and on which half. */
interface DropTarget {
  id: string;
  position: DropPosition;
}

/**
 * Skills tab of the agent editor. Every workspace skill is listed; ticking one links it at the
 * end of the prompt order, unticking unlinks it. Linked skills are reordered by drag and drop
 * (↑/↓ buttons do the same from the keyboard); the order is the order of their blocks in the
 * prompt. Every change is saved at once.
 * @param props.agent The agent being edited.
 * @returns The tab.
 */
export function SkillsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const router = useRouter();
  const skills = useSkills();
  const links = useAgentSkills(agent.id);
  const setLinks = useSetAgentSkills(agent.id);
  const [filter, setFilter] = React.useState("");
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [drop, setDrop] = React.useState<DropTarget | null>(null);

  if (skills.isLoading || links.isLoading) return <Skeleton height={160} />;
  if (skills.isError || links.isError) {
    return <ErrorState body={t("skills.loadError")} onRetry={() => void (skills.refetch(), links.refetch())} />;
  }

  const all = skills.data ?? [];
  const ids = linkedIds(links.data ?? []);
  const linked = linkedSkills(all, ids);
  const available = availableSkills(all, ids).filter((sk) => matchesFilter(sk, filter));
  const shownLinked = linked.filter((sk) => matchesFilter(sk, filter));
  const save = (next: string[]) => setLinks.mutate(next);

  if (all.length === 0) {
    return (
      <EmptyState
        icon="Sparkles"
        title={t("skills.empty.title")}
        body={t("skills.empty.body")}
        cta={t("skills.empty.cta")}
        onCta={() => router.push("/skills")}
      />
    );
  }

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };

  const onDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const from = dragId ?? e.dataTransfer.getData("text/plain");
    const position = drop?.id === targetId ? drop.position : dropPosition(e.clientY, e.currentTarget.getBoundingClientRect());
    if (from && from !== targetId) save(moveRelative(ids, from, targetId, position));
    endDrag();
  };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("skills.title")}</h2>
        <Badge color="var(--accent-text)" bg="var(--accent-bg)">
          {t("skills.enabledCount", { linked: linked.length, total: all.length })}
        </Badge>
        <div style={s.filter}>
          <Icon.Search size={13} style={s.filterIcon} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("skills.filterPlaceholder")}
            aria-label={t("skills.filterPlaceholder")}
            style={s.filterInput}
          />
        </div>
      </div>
      <p style={s.hint}>{t("skills.orderHint")}</p>

      <h3 style={s.sectionTitle}>{t("skills.linkedSection")}</h3>
      {shownLinked.length === 0 ? (
        <div style={s.none}>{filter ? t("skills.noMatch", { q: filter }) : "—"}</div>
      ) : (
        <ol style={s.list} aria-label={t("skills.linkedSection")}>
          {shownLinked.map((sk) => {
            const index = ids.indexOf(sk.id);
            return (
              <li
                key={sk.id}
                data-testid={`linked-skill-${sk.name}`}
                draggable
                onDragStart={(e) => {
                  setDragId(sk.id);
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", sk.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDrop({ id: sk.id, position: dropPosition(e.clientY, e.currentTarget.getBoundingClientRect()) });
                }}
                onDragLeave={() => setDrop((d) => (d?.id === sk.id ? null : d))}
                onDrop={(e) => onDrop(e, sk.id)}
                onDragEnd={endDrag}
                style={s.row(true, dragId === sk.id, drop?.id === sk.id && dragId !== sk.id ? drop.position : null)}
              >
                <span style={s.grip} title={t("skills.dragHandle", { name: sk.name })} aria-hidden>
                  <Icon.Menu size={14} />
                </span>
                <span className="mono tnum" style={s.order}>
                  {index + 1}
                </span>
                <Checkbox
                  checked
                  ariaLabel={t("skills.link", { name: sk.name })}
                  onChange={() => save(toggleLink(ids, sk.id))}
                />
                <SkillText skill={sk} />
                <button
                  type="button"
                  style={s.moveBtn}
                  aria-label={t("skills.moveUp", { name: sk.name })}
                  disabled={index === 0}
                  onClick={() => save(moveBy(ids, sk.id, -1))}
                >
                  <Icon.ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  style={s.moveBtn}
                  aria-label={t("skills.moveDown", { name: sk.name })}
                  disabled={index === ids.length - 1}
                  onClick={() => save(moveBy(ids, sk.id, 1))}
                >
                  <Icon.ArrowDown size={12} />
                </button>
                <Link href={`/skills/${sk.id}?tab=config`} style={s.open}>
                  {t("skills.open")}
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <h3 style={s.sectionTitle}>{t("skills.availableSection")}</h3>
      {available.length === 0 ? (
        <div style={s.none}>{filter ? t("skills.noMatch", { q: filter }) : "—"}</div>
      ) : (
        <ul style={s.list} aria-label={t("skills.availableSection")}>
          {available.map((sk) => (
            <li key={sk.id} data-testid={`available-skill-${sk.name}`} style={s.row(false, false, null)}>
              <Checkbox
                checked={false}
                ariaLabel={t("skills.link", { name: sk.name })}
                onChange={() => save(toggleLink(ids, sk.id))}
              />
              <SkillText skill={sk} />
              <Link href={`/skills/${sk.id}?tab=config`} style={s.open}>
                {t("skills.open")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Name, type, enabled state and description of a skill row.
 * @param props.skill The skill.
 * @returns The row text.
 */
function SkillText({ skill }: { skill: SkillListItem }) {
  const t = useTranslations("agents");
  return (
    <div style={s.text}>
      <div style={s.titleLine}>
        <span className="mono" style={s.name}>
          {skill.name}
        </span>
        <SkillTypeBadge type={skill.type} />
        {!skill.enabled && <span style={s.disabled}>{t("skills.disabledGlobally")}</span>}
      </div>
      <span style={s.description}>{skill.description}</span>
    </div>
  );
}
