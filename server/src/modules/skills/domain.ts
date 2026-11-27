import type {
  Skill,
  SkillCategoryCount,
  SkillIgnoredFile,
  SkillIgnoredReason,
  SkillStats,
  SkillStatsSummary,
  SkillUpdateBody,
} from '@devdigest/shared';
import {
  MAX_SKILL_BODY_CHARS,
  MAX_SKILL_DESCRIPTION_CHARS,
  MAX_SKILL_NAME_CHARS,
  MAX_SKILL_NOTE_CHARS,
  SkillType,
} from '@devdigest/shared';
import {
  ARCHIVE_EXTENSIONS,
  BINARY_EXTENSIONS,
  EXECUTABLE_EXTENSIONS,
  EXECUTABLE_FOLDERS,
  FALLBACK_SKILL_NAME,
  MARKDOWN_EXTENSIONS,
  SKILL_CORE_FILE,
} from './constants.js';

/**
 * Skills domain rules (domain ring): pure functions, no I/O, no clock. Versioning, the prompt
 * block a skill becomes, and every decision of the import (what the skill core is, what is
 * ignored, how frontmatter maps to fields). Bytes come in from adapters; nothing here reads a
 * disk, a network or runs anything.
 */

/** The skill fields the model sees; a change to any of them is a new version. */
export type SkillModelFields = Pick<Skill, 'name' | 'description' | 'body'>;

/**
 * Decide whether a patch changes what the model receives (name, description or body).
 * `type` and `enabled` are metadata and keep the version.
 * @param existing The skill's current model-visible fields.
 * @param patch The requested update.
 * @returns True when the patch changes at least one model-visible field.
 */
export function isModelVisibleChange(existing: SkillModelFields, patch: SkillUpdateBody): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.body !== undefined && patch.body !== existing.body)
  );
}

/** What an update does to the skill's version. */
export interface SkillVersionPlan {
  /** True when a new version must be recorded. */
  bump: boolean;
  /** The version the skill has after the update. */
  version: number;
}

/**
 * Plan the version change for an update.
 * @param existing The skill's current model-visible fields and version.
 * @param patch The requested update.
 * @returns Whether to bump, and the resulting version number.
 */
export function planSkillVersion(
  existing: SkillModelFields & Pick<Skill, 'version'>,
  patch: SkillUpdateBody,
): SkillVersionPlan {
  const bump = isModelVisibleChange(existing, patch);
  return { bump, version: bump ? existing.version + 1 : existing.version };
}

/**
 * Clean the "what changed" note of a version: invisible characters removed, whitespace runs
 * collapsed to one space, capped at the contract limit. The note is metadata: it never reaches
 * the prompt and never decides whether a version is created.
 * @param raw The note as sent, if any.
 * @returns The note to store, or null when none was sent or nothing visible remains.
 */
export function cleanVersionNote(raw: string | null | undefined): string | null {
  if (raw === undefined || raw === null) return null;
  const note = stripHiddenCharacters(raw).text.replace(/\s+/g, ' ').trim().slice(0, MAX_SKILL_NOTE_CHARS).trim();
  return note === '' ? null : note;
}

/**
 * @param version The version whose body a restore copies.
 * @returns The note stored with the version the restore creates.
 */
export function restoreNote(version: number): string {
  return `Restored from v${version}`;
}

/** A skill of the workspace with the number of agents that link it now. */
export interface SkillLinkCount {
  skillId: string;
  /** Agents that link the skill now. */
  usedBy: number;
}

/** What the review runs of the stats window recorded for one skill. */
export interface SkillRunCounts {
  skillId: string;
  /** Finished runs in the window whose prompt loaded the skill. */
  skillRuns: number;
  /** Findings of those runs. */
  findings: number;
  /** Of those findings, accepted ones. */
  accepted: number;
  /** Of those findings, dismissed ones. */
  dismissed: number;
}

/**
 * Join the skills side (who links each skill) with what the review runs recorded. A skill no run
 * loaded gets zero counts.
 * @param links The skills to report, in the order to report them.
 * @param runs Counts per skill from the review runs; skills missing here count as unused.
 * @returns One entry per link, in the links' order.
 */
export function mergeSkillUsage(links: SkillLinkCount[], runs: SkillRunCounts[]): SkillUsageCounts[] {
  const byId = new Map(runs.map((r) => [r.skillId, r]));
  return links.map((link) => {
    const counts = byId.get(link.skillId);
    return {
      skillId: link.skillId,
      usedBy: link.usedBy,
      skillRuns: counts?.skillRuns ?? 0,
      findings: counts?.findings ?? 0,
      accepted: counts?.accepted ?? 0,
      dismissed: counts?.dismissed ?? 0,
    };
  });
}

/** Raw counts of one skill over the stats window: its links plus what the runs recorded. */
export interface SkillUsageCounts {
  skillId: string;
  /** Agents that link the skill now. */
  usedBy: number;
  /** Finished runs in the window whose prompt loaded the skill. */
  skillRuns: number;
  /** Findings of those runs. */
  findings: number;
  /** Of those findings, accepted ones. */
  accepted: number;
  /** Of those findings, dismissed ones. */
  dismissed: number;
}

/**
 * A share in [0, 1].
 * @param part Counted items.
 * @param whole All items.
 * @returns part / whole, clamped to [0, 1]; null when `whole` is 0 (nothing to measure).
 */
export function ratio(part: number, whole: number): number | null {
  if (!(whole > 0)) return null;
  return Math.min(1, Math.max(0, part / whole));
}

/**
 * How often a skill was in the prompt.
 * @param skillRuns Runs in the window that loaded the skill.
 * @param runs All finished runs of the workspace in the window.
 * @returns skillRuns / runs, or null without runs.
 */
export function pullFrequency(skillRuns: number, runs: number): number | null {
  return ratio(skillRuns, runs);
}

/**
 * How many decided findings of a skill's runs were accepted. Undecided findings do not count.
 * @param accepted Accepted findings.
 * @param dismissed Dismissed findings.
 * @returns accepted / (accepted + dismissed), or null when none was decided.
 */
export function acceptRate(accepted: number, dismissed: number): number | null {
  return ratio(accepted, accepted + dismissed);
}

/**
 * @param counts The skill's counts over the window.
 * @param runs Finished runs of the workspace in the window.
 * @returns The card numbers of the skill.
 */
export function toSkillStatsSummary(counts: SkillUsageCounts, runs: number): SkillStatsSummary {
  return {
    skill_id: counts.skillId,
    used_by: counts.usedBy,
    pull_frequency: pullFrequency(counts.skillRuns, runs),
    accept_rate: acceptRate(counts.accepted, counts.dismissed),
  };
}

/**
 * @param counts The skill's counts over the window.
 * @param runs Finished runs of the workspace in the window.
 * @param categories Findings of the skill's runs per category.
 * @returns The skill's stats.
 */
export function toSkillStats(counts: SkillUsageCounts, runs: number, categories: SkillCategoryCount[]): SkillStats {
  return {
    ...toSkillStatsSummary(counts, runs),
    runs_30d: runs,
    skill_runs_30d: counts.skillRuns,
    findings_30d: counts.findings,
    findings_by_category: categories,
  };
}

/**
 * Render a skill as the block appended to an agent's prompt: the name as a heading, the
 * description (the skill's interface) as a quote line, then the body. The client's preview
 * mirrors this format (`client/src/lib/skill-block.ts`).
 * @param skill The model-visible fields.
 * @returns The Markdown block.
 */
export function formatSkillBlock(skill: SkillModelFields): string {
  const description = skill.description.replace(/\s+/g, ' ').trim();
  return `### Skill: ${skill.name}\n> ${description}\n\n${skill.body.trim()}`;
}

/** How an uploaded or fetched file is read. */
export type SkillFileKind = 'markdown' | 'archive' | 'unsupported';

/**
 * @param path A file path or URL path.
 * @returns The lower-case extension with its dot, or '' when there is none.
 */
export function extensionOf(path: string): string {
  const base = baseName(path);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/**
 * @param path A slash- or backslash-separated path.
 * @returns Its last segment.
 */
export function baseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

/**
 * Decide how to read a file: zip by its magic bytes or extension, Markdown by extension.
 * @param filename The file's name (upload name or last URL segment).
 * @param bytes Its content.
 * @returns The kind of file.
 */
export function fileKind(filename: string, bytes: Uint8Array): SkillFileKind {
  const zipMagic = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 3 || bytes[2] === 5);
  const ext = extensionOf(filename);
  if (zipMagic || (ARCHIVE_EXTENSIONS as readonly string[]).includes(ext)) return 'archive';
  if ((MARKDOWN_EXTENSIONS as readonly string[]).includes(ext)) return 'markdown';
  return 'unsupported';
}

/**
 * Decode skill text as strict UTF-8. Text with a NUL character is treated as binary.
 * @param bytes File content.
 * @returns The text, or null when the bytes are not UTF-8 text.
 */
export function decodeSkillText(bytes: Uint8Array): string | null {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.includes('\u0000') ? null : text;
  } catch {
    return null;
  }
}

/** Frontmatter scalars and the Markdown after it. */
export interface SplitMarkdown {
  /** Top-level scalar keys of the frontmatter, lower case. Nested maps are skipped. */
  meta: Record<string, string>;
  /** The Markdown body, with line endings normalized to `\n`. */
  body: string;
}

/**
 * Remove the surrounding quotes of a YAML scalar.
 * @param raw The scalar as written.
 * @returns The unquoted value.
 */
function unquote(raw: string): string {
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    try {
      return String(JSON.parse(raw));
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1).replace(/''/g, "'");
  /** Linear search for a ` #` comment: a backtracking regex here is quadratic on long blank runs. */
  const comment = raw.search(/\s#/);
  return comment === -1 ? raw : raw.slice(0, comment).trimEnd();
}

/**
 * Read the top-level scalars of a flat YAML block: `key: value`, quoted values, `|` and `>`
 * block scalars and indented continuation lines. Not a general YAML parser: anything nested is
 * skipped, and nothing is evaluated.
 * @param block The text between the frontmatter fences.
 * @returns Lower-case keys with their string values.
 */
function parseFrontmatterBlock(block: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const lines = block.split('\n');
  const isIndented = (line: string | undefined): boolean =>
    line !== undefined && (/^[ \t]/.test(line) || line.trim() === '');
  for (let i = 0; i < lines.length; i++) {
    /**
     * `[\s\S]*` to the end of the line, trimmed below: one way to match, so linear. A
     * `[ \t]*(.*)$` pair backtracks quadratically on a long blank run before U+2028/U+2029,
     * which `.` does not match.
     */
    const match = /^([A-Za-z0-9_-]+):([\s\S]*)$/.exec(lines[i] ?? '');
    if (!match) continue;
    const key = (match[1] ?? '').toLowerCase();
    const raw = (match[2] ?? '').trim();
    const parts: string[] = [];
    while (isIndented(lines[i + 1])) {
      i++;
      parts.push((lines[i] ?? '').trim());
    }
    let value: string;
    if (/^[|>][+-]?$/.test(raw)) {
      value = raw.startsWith('>') ? parts.filter(Boolean).join(' ') : parts.join('\n').trim();
    } else if (raw === '') {
      /** A nested map or list: not a scalar the import uses. */
      continue;
    } else {
      value = [unquote(raw), ...parts.filter(Boolean)].join(' ');
    }
    if (value.trim() !== '') meta[key] = value.trim();
  }
  return meta;
}

/**
 * Split Markdown into its frontmatter scalars and body. Strips a BOM and normalizes CRLF.
 * @param text The whole file.
 * @returns Frontmatter scalars (empty when there is none) and the body.
 */
export function splitFrontmatter(text: string): SplitMarkdown {
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const match = /^---[ \t]*\n(?:([\s\S]*?)\n)?---[ \t]*(?:\n|$)/.exec(src);
  if (!match) return { meta: {}, body: src };
  return { meta: parseFrontmatterBlock(match[1] ?? ''), body: src.slice(match[0].length) };
}

/**
 * Turn any text into a skill name: kebab-case ASCII, at most 64 characters.
 * @param raw Name, title or file name.
 * @returns The slug, or `imported-skill` when nothing usable remains.
 */
export function slugifySkillName(raw: string): string {
  const slug = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SKILL_NAME_CHARS)
    .replace(/-+$/, '');
  return slug.length > 0 ? slug : FALLBACK_SKILL_NAME;
}

/**
 * First prose paragraph of a Markdown body, as plain one-line text.
 * @param body Markdown body.
 * @returns The paragraph capped at the description limit, or '' when there is none.
 */
export function firstParagraph(body: string): string {
  let inFence = false;
  for (const para of body.split(/\n\s*\n/)) {
    const trimmed = para.trim();
    const fences = (trimmed.match(/^```/gm) ?? []).length;
    if (inFence || trimmed.startsWith('```')) {
      if (fences % 2 === 1) inFence = !inFence;
      continue;
    }
    if (trimmed === '' || /^(#|>|\||[-*+] |\d+\. |<)/.test(trimmed)) continue;
    const plain = trimmed.replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
    if (plain === '') continue;
    if (plain.length <= MAX_SKILL_DESCRIPTION_CHARS) return plain;
    const cut = plain.slice(0, MAX_SKILL_DESCRIPTION_CHARS - 1);
    return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 1))}…`;
  }
  return '';
}

/**
 * Characters that render as nothing yet reach the model, so a skill could hide instructions
 * with them: every default-ignorable code point (zero-width, variation selectors, Hangul
 * fillers, tag characters\u2026), every format character (bidi controls, soft hyphen, BOM\u2026) and the
 * C0/C1 controls except tab, line feed and carriage return. Unicode properties instead of a
 * hand-picked list, so new or obscure invisible characters are covered too.
 */
const HIDDEN_CHARACTERS =
  /[\p{Default_Ignorable_Code_Point}\p{Cf}]|[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/gu;

/**
 * Remove characters a reviewer cannot see in the preview but the model would still read.
 * @param text Imported or typed text.
 * @returns The visible text and how many characters were removed.
 */
export function stripHiddenCharacters(text: string): { text: string; removed: number } {
  let removed = 0;
  const visible = text.replace(HIDDEN_CHARACTERS, () => {
    removed += 1;
    return '';
  });
  return { text: visible, removed };
}

/** The skill fields the model reads, as a create body or a patch carries them. */
export interface SkillTextFields {
  name?: string;
  description?: string;
  body?: string;
}

/**
 * Remove invisible characters from the fields the model reads, on every write path (manual
 * create, editor save, a direct API call), not only in the import preview.
 * @param fields A create body or an update patch.
 * @returns A copy with the present text fields stripped; other fields are kept as they are.
 */
export function withoutHiddenCharacters<T extends SkillTextFields>(fields: T): T {
  const out = { ...fields };
  for (const key of ['name', 'description', 'body'] as const) {
    const value = out[key];
    if (typeof value === 'string') out[key] = stripHiddenCharacters(value).text as T[typeof key];
  }
  return out;
}

/**
 * @param fields Stripped text fields of a create body or a patch.
 * @returns A message when a field that was sent is now empty (it held only invisible
 *   characters), or null.
 */
export function hiddenOnlyProblem(fields: SkillTextFields): string | null {
  for (const key of ['name', 'description', 'body'] as const) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim() === '') {
      return `The ${key} holds only invisible characters.`;
    }
  }
  return null;
}

/** Fields an import proposes, before the user reviews them. */
export interface SkillDraft {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  /** Things the user should check in the preview. */
  warnings: string[];
}

/**
 * Build the proposed skill from Markdown: frontmatter `name`, `description`, `type`; missing
 * values fall back to the given name, the first paragraph and `custom`. Invisible characters are
 * removed first, so the preview the user confirms shows everything the model will read.
 * @param text The skill file's text.
 * @param fallbackName Name to use when the frontmatter has none (file or folder name).
 * @returns The draft with warnings for everything that was derived or normalized.
 */
export function draftFromMarkdown(text: string, fallbackName: string): SkillDraft {
  const hidden = stripHiddenCharacters(text.replace(/^\uFEFF/, ''));
  const { meta, body } = splitFrontmatter(hidden.text);
  const warnings: string[] = [];
  if (hidden.removed > 0) {
    warnings.push(
      `Removed ${hidden.removed} invisible character(s) (zero-width, bidi or tag characters): they could hide instructions that this preview would not show.`,
    );
  }

  const rawName = meta.name;
  const name = slugifySkillName(rawName ?? fallbackName);
  if (rawName === undefined) warnings.push(`No name in the frontmatter; derived "${name}" from the file name.`);
  else if (name !== rawName) warnings.push(`Name "${rawName}" was converted to kebab-case "${name}".`);

  let description = (meta.description ?? '').replace(/\s+/g, ' ').trim();
  if (description.length > MAX_SKILL_DESCRIPTION_CHARS) {
    description = `${description.slice(0, MAX_SKILL_DESCRIPTION_CHARS - 1)}…`;
    warnings.push(`The description was cut to ${MAX_SKILL_DESCRIPTION_CHARS} characters.`);
  }
  if (description === '') {
    description = firstParagraph(body);
    warnings.push(
      description === ''
        ? 'No description found: write one before saving. It is the skill\'s interface for the model.'
        : 'No description in the frontmatter; used the first paragraph. Rewrite it as a directive.',
    );
  }

  const parsedType = SkillType.safeParse(meta.type?.toLowerCase());
  if (meta.type !== undefined && !parsedType.success) {
    warnings.push(`Unknown type "${meta.type}"; using "custom".`);
  }
  const type: SkillType = parsedType.success ? parsedType.data : 'custom';

  return { name, description, type, body: body.trim(), warnings };
}

/**
 * Check that a draft's body can be stored.
 * @param draft The proposed skill.
 * @returns A message for the user, or null when the body is fine.
 */
export function draftBodyProblem(draft: Pick<SkillDraft, 'body'>): string | null {
  if (draft.body.trim() === '') return 'The skill file has no body after its frontmatter.';
  if (draft.body.length > MAX_SKILL_BODY_CHARS) {
    return `The skill body is ${draft.body.length} characters; the limit is ${MAX_SKILL_BODY_CHARS}.`;
  }
  return null;
}

/** Outcome of choosing the skill core inside an archive. */
export type CoreSelection =
  | {
      ok: true;
      /** Entry name of the core file, exactly as stored in the archive. */
      core: string;
      /** Name to use when the core's frontmatter has none: its folder, else ''. */
      folderName: string;
      /** Every other entry, with the reason it is not taken. */
      ignored: SkillIgnoredFile[];
    }
  | { ok: false; problem: string };

/**
 * @param path Archive entry name.
 * @returns The name with forward slashes and no leading `./`.
 */
function normalizeEntry(path: string): string {
  return path.replace(/\\/g, '/').replace(/^(\.\/)+/, '');
}

/**
 * @param path Normalized entry name.
 * @returns False for absolute paths and paths that climb out with `..`.
 */
function isSafeEntry(path: string): boolean {
  return !path.startsWith('/') && !/^[a-zA-Z]:/.test(path) && !path.split('/').includes('..');
}

/**
 * @param path Normalized entry name.
 * @returns True for macOS resource-fork leftovers (`__MACOSX/`, `._file`).
 */
function isOsJunk(path: string): boolean {
  return path.startsWith('__MACOSX/') || baseName(path).startsWith('._');
}

/**
 * @param path Normalized entry name.
 * @returns True when the entry lives in a scripts-like folder or has a runnable extension.
 */
function isExecutableEntry(path: string): boolean {
  const folders = path.split('/').slice(0, -1).map((s) => s.toLowerCase());
  return (
    folders.some((f) => (EXECUTABLE_FOLDERS as readonly string[]).includes(f)) ||
    (EXECUTABLE_EXTENSIONS as readonly string[]).includes(extensionOf(path))
  );
}

/**
 * Say why an archive entry is not part of the skill. Decided by name only: ignored entries
 * are never read.
 * @param path Normalized entry name.
 * @returns The reason shown in the preview.
 */
export function ignoredReason(path: string): SkillIgnoredReason {
  if (isExecutableEntry(path)) return 'executable';
  if ((BINARY_EXTENSIONS as readonly string[]).includes(extensionOf(path))) return 'binary';
  return 'not_skill_core';
}

/**
 * Choose the skill core of an archive: the shallowest `SKILL.md` (any case), else the only
 * Markdown file. Entries in scripts folders, unsafe paths and OS junk never qualify.
 * @param entries File entry names as stored in the archive (directories excluded).
 * @returns The core and the ignored entries, or the problem to show the user.
 */
export function selectSkillCore(entries: readonly string[]): CoreSelection {
  const files = entries.map((raw) => ({ raw, path: normalizeEntry(raw) }));
  const eligible = files.filter(
    (f) => isSafeEntry(f.path) && !isOsJunk(f.path) && !isExecutableEntry(f.path),
  );
  const depth = (path: string): number => path.split('/').length;
  const byDepthThenName = (a: { path: string }, b: { path: string }): number =>
    depth(a.path) - depth(b.path) || a.path.localeCompare(b.path);

  const cores = eligible.filter((f) => baseName(f.path).toLowerCase() === SKILL_CORE_FILE).sort(byDepthThenName);
  let core = cores[0];
  if (!core) {
    const markdown = eligible.filter((f) => (MARKDOWN_EXTENSIONS as readonly string[]).includes(extensionOf(f.path)));
    if (markdown.length === 0) return { ok: false, problem: 'The archive holds no SKILL.md or Markdown file.' };
    if (markdown.length > 1) {
      return {
        ok: false,
        problem: 'The archive holds several Markdown files but no SKILL.md: add a SKILL.md with the skill core.',
      };
    }
    core = markdown[0];
  }
  if (!core) return { ok: false, problem: 'The archive holds no SKILL.md or Markdown file.' };

  const folders = core.path.split('/').slice(0, -1);
  return {
    ok: true,
    core: core.raw,
    folderName: folders[folders.length - 1] ?? '',
    ignored: files
      .filter((f) => f.raw !== core.raw)
      .map((f) => ({ path: f.path, reason: ignoredReason(f.path) })),
  };
}

/**
 * File name without its extension, for deriving a skill name.
 * @param filename Upload name or URL segment.
 * @returns The stem.
 */
export function fileStem(filename: string): string {
  const base = baseName(filename);
  const ext = extensionOf(base);
  return ext ? base.slice(0, -ext.length) : base;
}

/**
 * Point a GitHub file page at its raw content (`github.com/o/r/blob/ref/path` →
 * `raw.githubusercontent.com/o/r/ref/path`); other URLs are returned normalized.
 * @param url An absolute URL.
 * @returns The URL to fetch.
 */
export function normalizeSkillUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname === 'github.com') {
    const match = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(parsed.pathname);
    if (match) return `https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[3]}`;
  }
  return parsed.toString();
}

/**
 * @param url An absolute URL.
 * @returns Its last path segment, decoded (the "file name" of a fetched skill).
 */
export function fileNameFromUrl(url: string): string {
  const segment = baseName(new URL(url).pathname);
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
