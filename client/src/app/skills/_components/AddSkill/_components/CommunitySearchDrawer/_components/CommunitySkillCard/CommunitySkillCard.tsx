"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CommunitySkillHit } from "@devdigest/shared";
import { s } from "./styles";

/**
 * @param url A URL from the search result.
 * @returns True for an https URL (anything else is not rendered as a link).
 */
function isHttpsUrl(url: string): boolean {
  return /^https:\/\//i.test(url);
}

/**
 * One community search result, as in the design: the skill name and the repository's stars, its
 * description, the repository (a link to the SKILL.md on GitHub), its language and "Import".
 * @param props.hit The search result.
 * @param props.onImport Start the import of this skill.
 * @returns The card.
 */
export function CommunitySkillCard({
  hit,
  onImport,
}: {
  hit: CommunitySkillHit;
  onImport: (hit: CommunitySkillHit) => void;
}) {
  const t = useTranslations("skills");
  return (
    <li style={s.card}>
      <div style={s.top}>
        <span className="mono" style={s.name} title={hit.path}>
          {hit.name}
        </span>
        <span className="tnum" style={s.stars} title={t("community.stars", { count: hit.stars })}>
          <Icon.Star size={12} />
          {hit.stars.toLocaleString("en-US")}
        </span>
      </div>
      {hit.description && <div style={s.description}>{hit.description}</div>}
      <div style={s.bottom}>
        {isHttpsUrl(hit.url) ? (
          <a href={hit.url} target="_blank" rel="noopener noreferrer" className="mono" style={s.repo} title={hit.path}>
            {hit.repo}
          </a>
        ) : (
          <span className="mono" style={s.repo}>
            {hit.repo}
          </span>
        )}
        {hit.language && <Badge color="var(--text-muted)">{hit.language}</Badge>}
        <div style={s.action}>
          <Button
            kind="secondary"
            size="sm"
            icon="Plus"
            onClick={() => onImport(hit)}
            aria-label={t("community.importLabel", { name: hit.name, repo: hit.repo })}
          >
            {t("community.import")}
          </Button>
        </div>
      </div>
    </li>
  );
}
