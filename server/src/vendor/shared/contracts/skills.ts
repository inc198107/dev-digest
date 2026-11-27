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

/** Where a skill created through the API came from (`extracted`: merged from conventions). */
export const SkillCreateSource = z.enum(['manual', 'imported_file', 'imported_url', 'extracted']);
export type SkillCreateSource = z.infer<typeof SkillCreateSource>;

/** Most evidence paths stored with a skill. */
export const MAX_SKILL_EVIDENCE_FILES = 50;

/** Longest "what changed" note of a skill version (characters). */
export const MAX_SKILL_NOTE_CHARS = 200;

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
    /** Repo paths the skill was derived from (`path:lines` of extracted conventions). */
    evidence_files: z.array(z.string().trim().min(1).max(512)).max(MAX_SKILL_EVIDENCE_FILES).optional(),
  })
  .strict();
export type SkillCreateBody = z.infer<typeof SkillCreateBody>;

/**
 * PUT /skills/:id: any subset of the editable fields, at least one. `note` ("what changed") is
 * stored with the version the change creates; it is metadata, never sent to the model, and does
 * not count as a change on its own.
 */
export const SkillUpdateBody = SkillCreateBody.omit({ source: true, evidence_files: true })
  .extend({ note: z.string().trim().max(MAX_SKILL_NOTE_CHARS).optional() })
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).some((key) => key !== 'note'), {
    message: 'Provide at least one field to change',
  });
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
  /** What changed in this version, as the author described it; null when no note was given. */
  note: z.string().nullish(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** Findings of one category. */
export const SkillCategoryCount = z.object({
  category: z.string(),
  count: z.number().int(),
});
export type SkillCategoryCount = z.infer<typeof SkillCategoryCount>;

/**
 * GET /skills/:id/stats: how the skill was used in the last 30 days. A review run counts for the
 * skill when its prompt loaded the skill (the run trace's skill blocks); its findings are the
 * run's findings, so they are attributed to every skill that run loaded.
 */
export const SkillStats = z.object({
  skill_id: z.string(),
  /** Agents that link the skill now. */
  used_by: z.number().int(),
  /** Review runs of the workspace in the window. */
  runs_30d: z.number().int(),
  /** Of those, runs whose prompt loaded this skill. */
  skill_runs_30d: z.number().int(),
  /** skill_runs_30d / runs_30d; null without runs. */
  pull_frequency: z.number().min(0).max(1).nullable(),
  /** Accepted / (accepted + dismissed) findings of the skill's runs; null when none was decided. */
  accept_rate: z.number().min(0).max(1).nullable(),
  /** Findings of the skill's runs in the window. */
  findings_30d: z.number().int(),
  findings_by_category: z.array(SkillCategoryCount),
});
export type SkillStats = z.infer<typeof SkillStats>;

/** GET /skills/stats: the card numbers of every skill of the workspace. */
export const SkillStatsSummary = SkillStats.pick({
  skill_id: true,
  used_by: true,
  pull_frequency: true,
  accept_rate: true,
});
export type SkillStatsSummary = z.infer<typeof SkillStatsSummary>;

/** GET /skills/community?q=: search text for community skills on GitHub. */
export const CommunitySkillQuery = z.object({ q: z.string().trim().min(2).max(100) }).strict();
export type CommunitySkillQuery = z.infer<typeof CommunitySkillQuery>;

/** One `SKILL.md` found in a public GitHub repository. */
export const CommunitySkillHit = z.object({
  /** Folder name of the SKILL.md (`owasp-review`), or the repo name for a root file. */
  name: z.string(),
  /** Repository description. */
  description: z.string().nullable(),
  /** `owner/name`. */
  repo: z.string(),
  /** Path of the SKILL.md in the repository. */
  path: z.string(),
  /** github.com URL of the file; the URL import reads it raw. */
  url: z.string(),
  stars: z.number().int(),
  /** Main language of the repository. */
  language: z.string().nullable(),
});
export type CommunitySkillHit = z.infer<typeof CommunitySkillHit>;

/** Result of a community search; `configured` is false when no GitHub token is set. */
export const CommunitySkillSearchResult = z.object({
  configured: z.boolean(),
  items: z.array(CommunitySkillHit),
});
export type CommunitySkillSearchResult = z.infer<typeof CommunitySkillSearchResult>;

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
