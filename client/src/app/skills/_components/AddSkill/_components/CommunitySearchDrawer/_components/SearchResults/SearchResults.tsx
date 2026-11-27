"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon, Skeleton } from "@devdigest/ui";
import type { CommunitySkillHit } from "@devdigest/shared";
import { useCommunitySkillSearch } from "@/lib/hooks/skills";
import { LOADING_CARDS, MIN_QUERY_CHARS } from "../../constants";
import { filterByLanguage } from "../../helpers";
import { CommunitySkillCard } from "../CommunitySkillCard";
import { s } from "./styles";

/**
 * The body of the community drawer for one search text: a hint for a text that is too short,
 * skeletons while the first answer loads, the "no GitHub token" or error message inline, or the
 * result cards in the selected language (the previous ones stay while the next search runs).
 * @param props.query The settled search text.
 * @param props.language The selected language; null for all.
 * @param props.onImport Start the import of a result.
 * @returns The results area.
 */
export function SearchResults({
  query,
  language,
  onImport,
}: {
  query: string;
  language: string | null;
  onImport: (hit: CommunitySkillHit) => void;
}) {
  const t = useTranslations("skills");
  const q = query.trim();
  const search = useCommunitySkillSearch(q);

  if (q.length < MIN_QUERY_CHARS) return <div style={s.hint}>{t("community.hint")}</div>;

  if (search.isError) {
    return (
      <div role="alert" style={s.error}>
        <Icon.AlertTriangle size={14} style={s.errorIcon} />
        <span>
          {t("community.error")}
          {search.error instanceof Error && search.error.message ? ` ${search.error.message}` : ""}
        </span>
      </div>
    );
  }

  if (!search.data) {
    return (
      <div style={s.list} aria-busy="true" aria-label={t("community.searching")}>
        {Array.from({ length: LOADING_CARDS }, (_, i) => (
          <Skeleton key={i} height={96} />
        ))}
      </div>
    );
  }

  if (!search.data.configured) {
    return (
      <div role="note" style={s.notConfigured}>
        <Icon.Lock size={14} style={s.noteIcon} />
        <span>
          {t.rich("community.notConfigured", {
            link: (chunks) => (
              <Link href="/settings/api-keys" style={s.link}>
                {chunks}
              </Link>
            ),
          })}
        </span>
      </div>
    );
  }

  const items = filterByLanguage(search.data.items, language);
  return (
    <div aria-live="polite" aria-busy={search.isFetching}>
      {search.isFetching && <div style={s.status}>{t("community.searching")}</div>}
      {items.length === 0 ? (
        <div style={s.hint}>{t("community.noResults", { q })}</div>
      ) : (
        <ul style={s.list} aria-label={t("community.resultsLabel")}>
          {items.map((hit) => (
            <CommunitySkillCard key={`${hit.repo}/${hit.path}`} hit={hit} onImport={onImport} />
          ))}
        </ul>
      )}
    </div>
  );
}
