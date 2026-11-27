import type { Skill } from "@devdigest/shared";

/**
 * Skill text helpers shared by the Skills Lab and the Conventions "Create skill" modal: the prompt
 * block format, a token estimate and the name rule of the API.
 */

/** The skill fields the model sees. */
export type SkillBlockFields = Pick<Skill, "name" | "description" | "body">;

/** Kebab-case, as the API's `SkillName` requires. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param name A skill name (trimmed by the caller or not).
 * @returns True when it is kebab-case, as the API requires.
 */
export function isSkillName(name: string): boolean {
  return SKILL_NAME_PATTERN.test(name.trim());
}

/**
 * Render a skill as the block an agent's prompt receives. Mirrors `formatSkillBlock` in
 * `server/src/modules/skills/domain.ts`: keep both in sync.
 * @param skill Name, description and body.
 * @returns The Markdown block.
 */
export function formatSkillBlock(skill: SkillBlockFields): string {
  const description = skill.description.replace(/\s+/g, " ").trim();
  return `### Skill: ${skill.name}\n> ${description}\n\n${skill.body.trim()}`;
}

/**
 * Rough token count of a text (characters / 4), for live feedback while editing. Runs record
 * the exact count (tiktoken) in their trace.
 * @param text Prompt text.
 * @returns The estimate.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
