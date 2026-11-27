import type { Repo } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { MAX_CONVENTION_RULE_CHARS } from "./constants";

/** Why a reworded rule cannot be saved. */
export type RuleProblem = { kind: "empty" } | { kind: "tooLong"; max: number };

/** What an evidence link needs to know about the repo. */
export type EvidenceRepo = Pick<Repo, "full_name" | "default_branch">;

/** A stored evidence reference split into its file and the cited lines. */
export interface EvidenceRef {
  path: string;
  /** First cited line; absent when the reference names no lines. */
  start?: number;
  /** Last cited line; equals `start` for a single line. */
  end?: number;
}

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

/**
 * @param evidencePath `path:start-end` or `path:line` as the API stores it.
 * @returns The file and its cited lines; the whole text is the path when no lines are given.
 */
export function parseEvidencePath(evidencePath: string): EvidenceRef {
  const match = /^(.+):(\d+)(?:-(\d+))?$/.exec(evidencePath);
  if (!match) return { path: evidencePath };
  const start = Number(match[2]);
  return { path: match[1]!, start, end: match[3] ? Number(match[3]) : start };
}

/**
 * Link to the cited lines on GitHub, on the repo's default branch (the branch the clone tracks).
 * @param repo The repo the convention was extracted from.
 * @param evidencePath `path:start-end` or `path:line` as the API stores it.
 * @returns `https://github.com/<owner>/<repo>/blob/<branch>/<path>#L<start>-L<end>` (`#L<n>` for
 *   one line).
 */
export function evidenceGithubUrl(repo: EvidenceRepo, evidencePath: string): string {
  const { path, start, end } = parseEvidencePath(evidencePath);
  const branch = repo.default_branch.split("/").map(encodeURIComponent).join("/");
  return githubBlobUrl(repo.full_name, branch, path, start, end);
}
