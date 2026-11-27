import type { SkillUpdateBody } from "@devdigest/shared";
import type { SkillFormValue } from "../../../../../_components/SkillFields";

/**
 * The fields that differ from the stored skill.
 * @param original The stored skill's fields.
 * @param value The edited form.
 * @returns A patch holding only changed fields (empty when nothing changed).
 */
export function changedFields(original: SkillFormValue, value: SkillFormValue): SkillUpdateBody {
  const patch: SkillUpdateBody = {};
  if (value.name.trim() !== original.name) patch.name = value.name.trim();
  if (value.description.trim() !== original.description) patch.description = value.description.trim();
  if (value.type !== original.type) patch.type = value.type;
  if (value.body !== original.body) patch.body = value.body;
  return patch;
}

/**
 * Exact equality of two forms, without the trimming `changedFields` applies to user input: used
 * to compare stored values, where trimming could report a difference that never goes away.
 * @param a One form.
 * @param b The other form.
 * @returns True when every field is identical.
 */
export function sameForm(a: SkillFormValue, b: SkillFormValue): boolean {
  return a.name === b.name && a.description === b.description && a.type === b.type && a.body === b.body;
}

/** The editable fields, in form order. */
const FORM_FIELDS = ["name", "description", "type", "body"] as const satisfies readonly (keyof SkillFormValue)[];

/**
 * The form after the stored skill changed: a field the user edited since the last sync keeps
 * the draft, every other field takes the stored value. Exact comparison, so whitespace in a
 * stored value never counts as an edit.
 * @param synced The stored fields the form was last synced to.
 * @param stored The stored fields now.
 * @param value The form as the user left it.
 * @returns The merged form.
 */
export function mergeStored(synced: SkillFormValue, stored: SkillFormValue, value: SkillFormValue): SkillFormValue {
  const merged = { ...stored };
  for (const field of FORM_FIELDS) {
    if (value[field] !== synced[field]) Object.assign(merged, { [field]: value[field] });
  }
  return merged;
}

/**
 * Whether a patch changes what the model sees and so creates a new version (the server rule:
 * name, description or body).
 * @param patch The changed fields.
 * @returns True when saving bumps the version.
 */
export function bumpsVersion(patch: SkillUpdateBody): boolean {
  return patch.name !== undefined || patch.description !== undefined || patch.body !== undefined;
}

/**
 * Attach the "what changed" note to a patch that creates a version. A metadata-only patch (type)
 * creates none, so the note is dropped there, as is a blank note.
 * @param patch The changed fields.
 * @param note The note as typed.
 * @returns The patch, with the trimmed note when it labels a new version.
 */
export function withNote(patch: SkillUpdateBody, note: string): SkillUpdateBody {
  const trimmed = note.trim();
  return bumpsVersion(patch) && trimmed.length > 0 ? { ...patch, note: trimmed } : patch;
}
