import { z } from 'zod';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { MAX_CONVENTION_RULE_CHARS, type ConventionCandidate } from '@devdigest/shared';
import {
  EXTRACTION_SYSTEM_PROMPT,
  FILE_SELECTION_SYSTEM_PROMPT,
  MAX_CANDIDATES,
  MAX_FILE_CHARS,
  MAX_FILE_LINES,
  MAX_SELECTED_FILES,
  MAX_SNIPPET_LINES,
  MIN_SELECTED_FILES,
} from './constants.js';

/**
 * Conventions rules (domain ring): the model's answer shapes, the prompts, which files a scan
 * reads, and grounding — every stored convention cites real lines of a file the model saw.
 * Pure: no I/O, no clock.
 */

/** Answer of the file-selection step. */
export const ConventionFileSelection = z.object({
  files: z.array(z.string()),
});
export type ConventionFileSelection = z.infer<typeof ConventionFileSelection>;

/** One convention as the model reports it, before grounding. */
export const ExtractedConvention = z.object({
  rule: z.string(),
  evidence_path: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  confidence: z.number(),
});
export type ExtractedConvention = z.infer<typeof ExtractedConvention>;

/** Answer of the extraction step. */
export const ConventionExtraction = z.object({
  conventions: z.array(ExtractedConvention),
});
export type ConventionExtraction = z.infer<typeof ConventionExtraction>;

/** A grounded convention ready to store (the store assigns `id`; it starts not accepted). */
export type ConventionDraft = Omit<ConventionCandidate, 'id' | 'accepted'>;

/** A repo file as the model sees it: the head of the file, split into lines. */
export interface SourceFile {
  path: string;
  /** Line `n` of the file is `lines[n - 1]`. */
  lines: string[];
}

/** A cited line range, 1-based and inclusive. */
export interface LineRange {
  start: number;
  end: number;
}

/** System and user text of one model call. */
export interface PromptText {
  system: string;
  user: string;
}

/**
 * @param line One line of a file.
 * @returns True when it holds only whitespace.
 */
function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim().length === 0;
}

/**
 * Normalise a repo path the model wrote: trims, turns `\` into `/`, drops a leading `./` and a
 * trailing `:line` or `:start-end` suffix.
 * @param raw Path as the model wrote it.
 * @returns The bare repo-relative path.
 */
export function cleanPath(raw: string): string {
  return raw
    .trim()
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/:\d+(-\d+)?$/, '');
}

/**
 * Choose the files to read: the model's picks that are in the sample, in its order, without
 * repeats. A path outside the sample is never read. Fewer than `min` valid picks (or a failed
 * selection step, `selected = []`) are topped up with the highest-ranked samples.
 * @param selected Paths the model picked.
 * @param pool The ranked sample, most central first.
 * @param max Most files to read.
 * @param min Fewest valid picks accepted without topping up.
 * @returns Paths to read, all from `pool`.
 */
export function pickFiles(
  selected: string[],
  pool: string[],
  max = MAX_SELECTED_FILES,
  min = MIN_SELECTED_FILES,
): string[] {
  const inPool = new Set(pool);
  const picked: string[] = [];
  for (const raw of selected) {
    if (picked.length >= max) break;
    const path = cleanPath(raw);
    if (inPool.has(path) && !picked.includes(path)) picked.push(path);
  }
  if (picked.length < min) {
    for (const path of pool) {
      if (picked.length >= max) break;
      if (!picked.includes(path)) picked.push(path);
    }
  }
  return picked;
}

/**
 * Cut a file to what the model is shown: at most `maxLines` lines and `maxChars` characters from
 * the top, so line numbers stay those of the real file.
 * @param path Repo-relative path.
 * @param content File text.
 * @param maxLines Most lines kept.
 * @param maxChars Most characters kept (whole lines only).
 * @returns The shown part, or null for a binary or blank file.
 */
export function toSourceFile(
  path: string,
  content: string,
  maxLines = MAX_FILE_LINES,
  maxChars = MAX_FILE_CHARS,
): SourceFile | null {
  if (content.includes(String.fromCharCode(0))) return null;
  const kept: string[] = [];
  let chars = 0;
  for (const line of content.replace(/\r\n?/g, '\n').split('\n').slice(0, maxLines)) {
    chars += line.length + 1;
    if (chars > maxChars) break;
    kept.push(line);
  }
  while (kept.length > 0 && isBlank(kept[kept.length - 1])) kept.pop();
  return kept.length > 0 ? { path, lines: kept } : null;
}

/**
 * @param file A shown file.
 * @returns Characters it adds to the prompt.
 */
export function sourceSize(file: SourceFile): number {
  return file.lines.reduce((sum, line) => sum + line.length + 1, 0);
}

/**
 * Keep files, in order, while their total size fits the scan budget; a file that does not fit is
 * skipped and smaller ones after it may still fit.
 * @param files Shown files in reading order.
 * @param maxTotalChars Budget of the whole scan.
 * @returns The files that fit.
 */
export function fitToBudget(files: SourceFile[], maxTotalChars: number): SourceFile[] {
  const out: SourceFile[] = [];
  let used = 0;
  for (const file of files) {
    const size = sourceSize(file);
    if (used + size > maxTotalChars) continue;
    used += size;
    out.push(file);
  }
  return out;
}

/**
 * @param file A shown file.
 * @returns Its lines, each prefixed with its right-aligned number and `| `.
 */
export function numberLines(file: SourceFile): string {
  const width = String(file.lines.length).length;
  return file.lines.map((line, i) => `${String(i + 1).padStart(width)}| ${line}`).join('\n');
}

/**
 * @param path A repo path.
 * @returns The path as a safe `source` label of an `<untrusted>` block.
 */
function untrustedLabel(path: string): string {
  return `file:${path.replace(/["<>]/g, '_')}`;
}

/**
 * Prompt of the file-selection step.
 * @param repoName Repository name shown to the model.
 * @param pool The ranked sample, most central first.
 * @returns System and user text.
 */
export function fileSelectionPrompt(repoName: string, pool: string[]): PromptText {
  const list = pool.map((path, i) => `${i + 1}. ${path}`).join('\n');
  return {
    system: FILE_SELECTION_SYSTEM_PROMPT,
    user: [
      `Repository: ${repoName}`,
      'Source files, most central first:',
      wrapUntrusted('file-list', list),
      `Return the paths of at most ${MAX_SELECTED_FILES} files to read.`,
    ].join('\n\n'),
  };
}

/**
 * Prompt of the extraction step: every file numbered and wrapped as untrusted data.
 * @param repoName Repository name shown to the model.
 * @param files The files read for this scan.
 * @returns System and user text.
 */
export function extractionPrompt(repoName: string, files: SourceFile[]): PromptText {
  const blocks = files.map((file) => wrapUntrusted(untrustedLabel(file.path), numberLines(file)));
  return {
    system: EXTRACTION_SYSTEM_PROMPT,
    user: [
      `Repository: ${repoName}`,
      `Files (${files.length}); each line starts with its line number:`,
      ...blocks,
      'Report the house conventions these files follow.',
    ].join('\n\n'),
  };
}

/**
 * Clean a rule for display and storage: single spaces, trimmed, cut to the contract length.
 * @param rule Rule text.
 * @returns The cleaned rule; empty when nothing is left.
 */
export function cleanRule(rule: string): string {
  const text = rule.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_CONVENTION_RULE_CHARS) return text;
  return `${text.slice(0, MAX_CONVENTION_RULE_CHARS - 1).trimEnd()}…`;
}

/**
 * @param rule Rule text.
 * @returns The comparison key of a rule: cleaned, lower case, no closing punctuation.
 */
export function ruleKey(rule: string): string {
  return cleanRule(rule).toLowerCase().replace(/[.!;]+$/, '');
}

/**
 * Map the model's confidence onto [0, 1]; a percentage (1 < x ≤ 100) is read as one.
 * @param value Confidence as reported.
 * @returns The confidence rounded to 2 decimals, or null when it is not a number.
 */
export function normalizeConfidence(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  const share = value > 1 && value <= 100 ? value / 100 : value;
  return Math.round(Math.min(1, Math.max(0, share)) * 100) / 100;
}

/**
 * Ground a cited line range in a file: it must start inside the file; the end is clamped to the
 * file, blank edge lines are dropped and the range is cut to `maxLines`.
 * @param lines The file's lines.
 * @param start First cited line (1-based).
 * @param end Last cited line (1-based); swapped with `start` when smaller.
 * @param maxLines Longest range kept.
 * @returns The grounded range, or null when no code line is left.
 */
export function groundRange(
  lines: string[],
  start: number,
  end: number,
  maxLines = MAX_SNIPPET_LINES,
): LineRange | null {
  let from = Math.min(start, end);
  let to = Math.min(Math.max(start, end), lines.length);
  if (from < 1 || from > lines.length) return null;
  while (from <= to && isBlank(lines[from - 1])) from += 1;
  to = Math.min(to, from + maxLines - 1);
  while (to >= from && isBlank(lines[to - 1])) to -= 1;
  return from <= to ? { start: from, end: to } : null;
}

/**
 * @param lines Snippet lines.
 * @returns The lines without trailing spaces and without their common indentation.
 */
export function dedent(lines: string[]): string[] {
  const trimmed = lines.map((line) => line.trimEnd());
  const indents = trimmed.filter((line) => line.length > 0).map((line) => /^[ \t]*/.exec(line)![0].length);
  const cut = indents.length > 0 ? Math.min(...indents) : 0;
  return trimmed.map((line) => line.slice(cut));
}

/**
 * @param path Repo-relative path.
 * @param range Grounded range.
 * @returns `path:start-end`, or `path:line` for one line.
 */
export function formatEvidencePath(path: string, range: LineRange): string {
  return range.start === range.end ? `${path}:${range.start}` : `${path}:${range.start}-${range.end}`;
}

/**
 * Keep only what the files prove. A convention is dropped when its file was not read, its lines
 * are outside the file or blank, its rule is empty or its confidence is not a number; repeats of
 * a rule keep the first. The snippet is cut from the real file, never taken from the model.
 * @param extracted Conventions as the model reported them.
 * @param files The files the model was shown.
 * @param maxCandidates Most conventions kept, the most confident ones.
 * @returns Grounded conventions, most confident first.
 */
export function groundConventions(
  extracted: ExtractedConvention[],
  files: SourceFile[],
  maxCandidates = MAX_CANDIDATES,
): ConventionDraft[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const seen = new Set<string>();
  const out: ConventionDraft[] = [];
  for (const item of extracted) {
    const rule = cleanRule(item.rule);
    const key = ruleKey(rule);
    if (!rule || seen.has(key)) continue;
    const file = byPath.get(cleanPath(item.evidence_path));
    if (!file) continue;
    const range = groundRange(file.lines, item.start_line, item.end_line);
    if (!range) continue;
    const confidence = normalizeConfidence(item.confidence);
    if (confidence === null) continue;
    seen.add(key);
    out.push({
      rule,
      evidence_path: formatEvidencePath(file.path, range),
      evidence_snippet: dedent(file.lines.slice(range.start - 1, range.end)).join('\n'),
      confidence,
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence).slice(0, maxCandidates);
}

/**
 * Drop new conventions that repeat an accepted one, so a re-scan does not duplicate the user's
 * kept (and possibly reworded) rules.
 * @param drafts Grounded conventions of the new scan.
 * @param accepted The repo's accepted conventions.
 * @returns The drafts whose rule no accepted convention already states.
 */
export function withoutAccepted(
  drafts: ConventionDraft[],
  accepted: Pick<ConventionCandidate, 'rule'>[],
): ConventionDraft[] {
  const kept = new Set(accepted.map((c) => ruleKey(c.rule)));
  return drafts.filter((draft) => !kept.has(ruleKey(draft.rule)));
}
