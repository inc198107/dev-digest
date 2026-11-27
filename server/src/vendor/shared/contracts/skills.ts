import { z } from 'zod';
import { Skill, SkillType } from './knowledge.js';

/**
 * Skills API contracts (Skills Lab). A skill is text only: its name, description and body are
 * appended to a linked agent's review prompt; everything else is metadata. Request bodies of
 * POST/PUT /skills, version snapshots, "used by" and the import preview live here; the `Skill`
 * entity itself is in ./knowledge.
 */

/** Longest skill name (characters). */
export const MAX_SKILL_NAME_CHARS = 64;
/** Longest skill description (characters). */
export const MAX_SKILL_DESCRIPTION_CHARS = 500;
/** Longest skill body the API stores (characters). */
export const MAX_SKILL_BODY_CHARS = 20_000;
/** Largest file or archive accepted by the import (bytes). */
export const MAX_SKILL_IMPORT_BYTES = 1_048_576;
/** Base64 length of a MAX_SKILL_IMPORT_BYTES payload. */
const MAX_SKILL_IMPORT_BASE64_CHARS = Math.ceil(MAX_SKILL_IMPORT_BYTES / 3) * 4;

/** Kebab-case skill name, unique per workspace. */
export const SkillName = z
  .string()
  .trim()
  .min(1)
  .max(MAX_SKILL_NAME_CHARS)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use kebab-case: lower-case letters, digits and single hyphens');
export type SkillName = z.infer<typeof SkillName>;

/** Where a skill created through the API came from. */
export const SkillCreateSource = z.enum(['manual', 'imported_file', 'imported_url']);
export type SkillCreateSource = z.infer<typeof SkillCreateSource>;

/** Skill body: Markdown, not blank. */
const SkillBody = z
  .string()
  .max(MAX_SKILL_BODY_CHARS)
  .refine((body) => body.trim().length > 0, { message: 'Skill body must not be empty' });

/** POST /skills. */
export const SkillCreateBody = z
  .object({
    name: SkillName,
    /** The skill's interface for the model: one directive sentence ("Flag …"). */
    description: z.string().trim().min(1).max(MAX_SKILL_DESCRIPTION_CHARS),
    type: SkillType,
    body: SkillBody,
    enabled: z.boolean().optional(),
    source: SkillCreateSource.optional(),
  })
  .strict();
export type SkillCreateBody = z.infer<typeof SkillCreateBody>;

/** PUT /skills/:id: any subset of the editable fields, at least one. */
export const SkillUpdateBody = SkillCreateBody.omit({ source: true })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Provide at least one field to change' });
export type SkillUpdateBody = z.infer<typeof SkillUpdateBody>;

/** An agent that links a skill. */
export const SkillUsage = z.object({
  agent_id: z.string(),
  name: z.string(),
});
export type SkillUsage = z.infer<typeof SkillUsage>;

/** A skill with the agents that link it (list and detail responses). */
export const SkillListItem = Skill.extend({
  used_by: z.array(SkillUsage),
});
export type SkillListItem = z.infer<typeof SkillListItem>;

/** Immutable body snapshot recorded whenever a model-visible field changes. */
export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** POST /skills/import/file: a Markdown file or a zip archive, base64-encoded. */
export const SkillImportFileBody = z
  .object({
    filename: z.string().trim().min(1).max(255),
    content_base64: z.string().min(1).max(MAX_SKILL_IMPORT_BASE64_CHARS),
  })
  .strict();
export type SkillImportFileBody = z.infer<typeof SkillImportFileBody>;

/** POST /skills/import/url: an https link to a Markdown file or a zip archive. */
export const SkillImportUrlBody = z
  .object({
    url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((url) => url.toLowerCase().startsWith('https://'), { message: 'Only https URLs are allowed' }),
  })
  .strict();
export type SkillImportUrlBody = z.infer<typeof SkillImportUrlBody>;

/** Why an archive entry was not taken into the skill. */
export const SkillIgnoredReason = z.enum(['executable', 'binary', 'not_skill_core']);
export type SkillIgnoredReason = z.infer<typeof SkillIgnoredReason>;

export const SkillIgnoredFile = z.object({
  path: z.string(),
  reason: SkillIgnoredReason,
});
export type SkillIgnoredFile = z.infer<typeof SkillIgnoredFile>;

/**
 * What an import would create. Nothing is stored: the user reviews it, may edit the fields and
 * confirms with POST /skills.
 */
export const SkillImportPreview = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  source: z.enum(['imported_file', 'imported_url']),
  /** The uploaded file name or the fetched URL. */
  origin: z.string(),
  /** The file the skill text was taken from (archive path, or the file itself). */
  skill_file: z.string(),
  /** Tokens the skill block would add to a prompt. */
  tokens: z.number().int(),
  ignored_files: z.array(SkillIgnoredFile),
  warnings: z.array(z.string()),
});
export type SkillImportPreview = z.infer<typeof SkillImportPreview>;
