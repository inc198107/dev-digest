import type { CommunitySkillHit } from "@devdigest/shared";

/**
 * Add a quick tag to the search text, unless it is already one of its words.
 * @param query The current search text.
 * @param tag The tag.
 * @returns The new search text (the tag alone for an empty one).
 */
export function appendTag(query: string, tag: string): string {
  const text = query.trim();
  if (!text) return tag;
  const words = text.toLowerCase().split(/\s+/);
  return words.includes(tag.toLowerCase()) ? text : `${text} ${tag}`;
}

/**
 * @param items Search results.
 * @returns The distinct repository languages among them, alphabetically.
 */
export function languagesOf(items: CommunitySkillHit[]): string[] {
  const languages = new Set<string>();
  for (const item of items) if (item.language) languages.add(item.language);
  return [...languages].sort((a, b) => a.localeCompare(b));
}

/**
 * @param items Search results.
 * @param language The selected language; null for all.
 * @returns The results in that language.
 */
export function filterByLanguage(items: CommunitySkillHit[], language: string | null): CommunitySkillHit[] {
  return language === null ? items : items.filter((item) => item.language === language);
}
