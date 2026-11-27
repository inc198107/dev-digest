import type { SkillListItem } from "@devdigest/shared";

/**
 * Case-insensitive filter over a skill's name, description and type.
 * @param skills The skills to filter.
 * @param search The search text.
 * @returns The matching skills, in their original order.
 */
export function filterSkills(skills: SkillListItem[], search: string): SkillListItem[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description} ${s.type}`.toLowerCase().includes(q));
}
