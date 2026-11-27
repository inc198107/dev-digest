import { MAX_CONVENTION_RULE_CHARS } from "./constants";

/** Why a reworded rule cannot be saved. */
export type RuleProblem = { kind: "empty" } | { kind: "tooLong"; max: number };

/**
 * Mirror of the API's `ConventionUpdateBody.rule` check (trimmed, 1–300 characters).
 * @param rule The edited rule.
 * @returns The problem, or null when it can be saved.
 */
export function ruleProblem(rule: string): RuleProblem | null {
  const text = rule.trim();
  if (text.length === 0) return { kind: "empty" };
  if (text.length > MAX_CONVENTION_RULE_CHARS) return { kind: "tooLong", max: MAX_CONVENTION_RULE_CHARS };
  return null;
}
