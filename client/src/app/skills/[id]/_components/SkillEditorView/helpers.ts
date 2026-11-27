import { SKILL_TABS, type SkillTabKey } from "./constants";

/**
 * Read the editor tab from the `?tab=` value, falling back to Config.
 * @param raw The search param.
 * @returns A known tab key.
 */
export function parseSkillTab(raw: string | null): SkillTabKey {
  return SKILL_TABS.find((tab) => tab.key === raw)?.key ?? "config";
}
