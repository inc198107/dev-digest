import type { ConventionCandidate } from "@devdigest/shared";

/**
 * The skill a set of accepted conventions becomes: a name unique in the workspace, a directive
 * description and a Markdown body with one section per rule and the code that shows it. Pure, so
 * the "Create skill" modal only renders and edits it.
 */

/** Longest skill name the API accepts. */
const MAX_NAME_CHARS = 64;

/** Longest section heading slug. */
const MAX_SECTION_CHARS = 40;

/** Most evidence paths stored with a skill (`MAX_SKILL_EVIDENCE_FILES` of the API). */
const MAX_EVIDENCE_FILES = 50;

/** Words that carry no meaning in a heading slug ("Always use X instead of Y" → "x-y"). */
const STOP_WORDS = new Set([
  "a", "all", "always", "an", "and", "are", "be", "by", "every", "for", "from", "go", "goes",
  "in", "instead", "is", "must", "never", "of", "on", "or", "should", "the", "through", "to",
  "use", "uses", "using", "via", "with",
]);

/** Code fence language by file extension. */
const FENCE_LANGUAGE: Record<string, string> = {
  ts: "ts", tsx: "tsx", mts: "ts", cts: "ts", js: "js", jsx: "jsx", mjs: "js", cjs: "js",
  py: "python", go: "go", rs: "rust", java: "java", kt: "kotlin", rb: "ruby", php: "php",
  cs: "csharp", swift: "swift", sql: "sql", sh: "bash", json: "json", yml: "yaml", yaml: "yaml",
  css: "css", scss: "scss", html: "html", md: "markdown", vue: "vue",
};

/** The editable fields of the skill built from conventions. */
export interface ConventionsSkillDraft {
  name: string;
  description: string;
  body: string;
  /** `path:lines` of every accepted convention, stored with the skill. */
  evidenceFiles: string[];
}

/**
 * @param text Any text.
 * @param max Longest result.
 * @param dropStopWords Whether to leave out filler words.
 * @returns The text as kebab-case (lower-case letters, digits, single hyphens), cut at a word.
 */
export function toKebab(text: string, max: number, dropStopWords = false): string {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !(dropStopWords && STOP_WORDS.has(word)));
  let out = "";
  for (const word of words) {
    const next = out ? `${out}-${word}` : word;
    if (next.length > max) break;
    out = next;
  }
  return out || words[0]?.slice(0, max) || "";
}

/**
 * @param base The wanted name.
 * @param taken Names already in use.
 * @param max Longest result.
 * @returns `base`, or `base-2`, `base-3`… — the first one not taken, at most `max` characters.
 */
export function uniqueName(base: string, taken: Iterable<string>, max = MAX_NAME_CHARS): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, max - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * @param evidencePath `path:start-end` as stored.
 * @returns The code fence language of the file, or "" when unknown.
 */
export function fenceLanguage(evidencePath: string): string {
  const path = evidencePath.replace(/:\d+(-\d+)?$/, "");
  const ext = /\.([a-z0-9]+)$/i.exec(path)?.[1]?.toLowerCase() ?? "";
  return FENCE_LANGUAGE[ext] ?? "";
}

/**
 * @param code A code snippet.
 * @returns A backtick fence longer than any backtick run inside the snippet.
 */
function fenceFor(code: string): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

/**
 * @param convention An accepted convention.
 * @param heading Its section slug.
 * @returns The Markdown section: rule, then the evidence path and snippet.
 */
function section(convention: ConventionCandidate, heading: string): string {
  const parts = [`## ${heading}`, convention.rule.trim()];
  if (convention.evidence_snippet.trim()) {
    const fence = fenceFor(convention.evidence_snippet);
    parts.push(
      `Detected in \`${convention.evidence_path}\`:\n${fence}${fenceLanguage(convention.evidence_path)}\n${convention.evidence_snippet}\n${fence}`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Build the skill draft from the accepted conventions, in the order given.
 * @param repoName Short repository name (`payments-api`).
 * @param accepted Accepted conventions.
 * @param takenNames Names of the workspace's skills (the draft name avoids them).
 * @returns Name, description, body and evidence paths.
 */
export function buildSkillDraft(
  repoName: string,
  accepted: ConventionCandidate[],
  takenNames: Iterable<string> = [],
): ConventionsSkillDraft {
  const name = uniqueName(toKebab(`${repoName} conventions`, MAX_NAME_CHARS) || "repo-conventions", takenNames);
  const count = accepted.length;
  const headings: string[] = [];
  const sections = accepted.map((convention, i) => {
    const heading = uniqueName(toKebab(convention.rule, MAX_SECTION_CHARS, true) || `rule-${i + 1}`, headings);
    headings.push(heading);
    return section(convention, heading);
  });
  const body = [
    `# ${name}`,
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
    ...sections,
  ].join("\n\n");
  return {
    name,
    description: `Flag changes that break the ${count} house ${count === 1 ? "convention" : "conventions"} of ${repoName}.`,
    body: `${body}\n`,
    evidenceFiles: [...new Set(accepted.map((c) => c.evidence_path).filter(Boolean))].slice(0, MAX_EVIDENCE_FILES),
  };
}
