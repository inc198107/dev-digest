import { isSkillName } from "@/lib/skill-block";
import { MAX_BODY_CHARS, MAX_DESCRIPTION_CHARS } from "./constants";

/** The fields the user edits before saving. */
export interface SkillForm {
  name: string;
  description: string;
  body: string;
  enabled: boolean;
}

/** What blocks saving, per field (null = fine). */
export interface SkillFormProblems {
  name: "invalid" | "taken" | null;
  description: boolean;
  body: "empty" | "tooLong" | null;
}

/**
 * Check the form against the API's rules and the workspace's skill names.
 * @param form The edited fields.
 * @param takenNames Names already used in the workspace.
 * @returns The problems; see `canSave`.
 */
export function formProblems(form: SkillForm, takenNames: ReadonlySet<string>): SkillFormProblems {
  const name = form.name.trim();
  const description = form.description.trim();
  return {
    name: !isSkillName(name) ? "invalid" : takenNames.has(name) ? "taken" : null,
    description: description.length === 0 || description.length > MAX_DESCRIPTION_CHARS,
    body: form.body.trim().length === 0 ? "empty" : form.body.length > MAX_BODY_CHARS ? "tooLong" : null,
  };
}

/**
 * @param problems Result of `formProblems`.
 * @returns True when nothing blocks saving.
 */
export function canSave(problems: SkillFormProblems): boolean {
  return problems.name === null && !problems.description && problems.body === null;
}
