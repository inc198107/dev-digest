"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Chip, Drawer, Icon, IconBtn } from "@devdigest/ui";
import type { CommunitySkillHit } from "@devdigest/shared";
import { useCommunitySkillSearch } from "@/lib/hooks/skills";
import { SearchResults } from "./_components/SearchResults";
import { DRAWER_WIDTH, QUICK_TAGS, SEARCH_DEBOUNCE_MS } from "./constants";
import { appendTag, languagesOf } from "./helpers";
import { useDebouncedValue } from "./useDebouncedValue";
import { s } from "./styles";

/**
 * "Search community skills": find `SKILL.md` files in public GitHub repositories. The search runs
 * once typing pauses; quick tags add a word to the search text; language chips (built from the
 * results) filter them. "Import" hands the result to the regular URL import, which previews it
 * with the trust warning before anything is saved.
 * @param props.onClose Close the drawer.
 * @param props.onImport Start the import of a result.
 * @returns The drawer.
 */
export function CommunitySearchDrawer({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (hit: CommunitySkillHit) => void;
}) {
  const t = useTranslations("skills");
  const [input, setInput] = React.useState("");
  const [language, setLanguage] = React.useState<string | null>(null);
  const query = useDebouncedValue(input, SEARCH_DEBOUNCE_MS).trim();
  const { data } = useCommunitySkillSearch(query);
  const languages = data?.configured ? languagesOf(data.items) : [];
  /** A language missing from the new results falls back to "All languages". */
  const activeLanguage = language !== null && languages.includes(language) ? language : null;

  return (
    <Drawer width={DRAWER_WIDTH} title={t("community.title")} subtitle={t("community.subtitle")} onClose={onClose}>
      <div style={s.search}>
        <Icon.Search size={15} style={s.searchIcon} />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("community.placeholder")}
          aria-label={t("community.searchLabel")}
          autoFocus
          style={s.searchInput}
        />
        {input && <IconBtn icon="X" label={t("community.clear")} size={24} onClick={() => setInput("")} />}
      </div>

      <div style={s.chips}>
        <Chip active={activeLanguage === null} onClick={() => setLanguage(null)}>
          {t("community.allLanguages")}
        </Chip>
        {languages.map((lang) => (
          <Chip key={lang} active={activeLanguage === lang} onClick={() => setLanguage(lang)}>
            {lang}
          </Chip>
        ))}
        {QUICK_TAGS.map((tag) => (
          <Chip key={tag} icon="Tag" onClick={() => setInput((q) => appendTag(q, tag))}>
            {t(`community.tags.${tag}`)}
          </Chip>
        ))}
      </div>

      <SearchResults query={query} language={activeLanguage} onImport={onImport} />
    </Drawer>
  );
}
