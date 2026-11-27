import type { Skill, SkillType } from "@devdigest/shared";

/** Editable fields of a skill form. */
export interface SkillFormValue {
  name: string;
  description: string;
  type: SkillType;
  body: string;
}

/** Empty form for a new skill. */
export const EMPTY_SKILL_FORM: SkillFormValue = { name: "", description: "", type: "rubric", body: "" };

/** Kebab-case, as the API's `SkillName` requires. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * @param skill A stored skill or an import preview.
 * @returns Its editable fields.
 */
export function toFormValue(skill: Pick<Skill, "name" | "description" | "type" | "body">): SkillFormValue {
  return { name: skill.name, description: skill.description, type: skill.type, body: skill.body };
}

/**
 * Whether the form can be saved: the API requires every field and a kebab-case name.
 * @param value The form.
 * @returns True when name, description and body are present and the name is kebab-case.
 */
export function isFormComplete(value: SkillFormValue): boolean {
  return (
    SKILL_NAME_PATTERN.test(value.name.trim()) &&
    value.description.trim().length > 0 &&
    value.body.trim().length > 0
  );
}
