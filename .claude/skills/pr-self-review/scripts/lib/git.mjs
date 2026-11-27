/**
 * Thin, synchronous wrappers around the git CLI used by the plan, record and gate scripts.
 * Every function takes the repository root explicitly so tests can point them at a temp repo.
 */
import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

/** SHA that git uses for "no object" (branch deletion in pre-push, missing side in diffs). */
export const ZERO_SHA = '0000000000000000000000000000000000000000';

/** Default refs tried, in order, when no base is given. */
export const DEFAULT_BASE_REFS = ['origin/main', 'main'];

/**
 * Run git and return its output.
 * @param {string} root Working directory (repository root).
 * @param {string[]} args Git arguments.
 * @param {{ input?: string, allowFail?: boolean }} [opts] Stdin and failure handling.
 * @returns {{ ok: boolean, out: string, err: string }} Exit status and raw output.
 */
export function git(root, args, opts = {}) {
  const res = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    input: opts.input,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) throw res.error;
  const ok = res.status === 0;
  if (!ok && !opts.allowFail) {
    throw new Error(`git ${args.join(' ')} failed (${res.status}): ${(res.stderr ?? '').trim()}`);
  }
  return { ok, out: res.stdout ?? '', err: res.stderr ?? '' };
}

/**
 * Resolve the top-level directory of the repository that contains `cwd`.
 * @param {string} cwd Any directory inside the repository.
 * @returns {string} Absolute repository root.
 */
export function repoRoot(cwd) {
  return git(cwd, ['rev-parse', '--show-toplevel']).out.trim();
}

/**
 * Resolve a revision to a full commit SHA.
 * @param {string} root Repository root.
 * @param {string} rev Any revision (`HEAD`, a branch, a SHA).
 * @returns {string | null} Commit SHA, or null when the revision does not exist.
 */
export function revParse(root, rev) {
  const res = git(root, ['rev-parse', '--verify', '--quiet', `${rev}^{commit}`], { allowFail: true });
  return res.ok ? res.out.trim() : null;
}

/**
 * Name of the checked-out branch.
 * @param {string} root Repository root.
 * @returns {string} Short branch name, or `HEAD` when detached.
 */
export function currentBranch(root) {
  const res = git(root, ['symbolic-ref', '--short', '-q', 'HEAD'], { allowFail: true });
  return res.ok ? res.out.trim() : 'HEAD';
}

/**
 * Find the base the branch is compared with: the merge-base of `commit` and the first base ref
 * that exists.
 * @param {string} root Repository root.
 * @param {string} commit Commit whose base is wanted (usually `HEAD`).
 * @param {string[]} refs Candidate base refs, tried in order.
 * @returns {{ ref: string, sha: string }} The chosen ref and the merge-base SHA.
 */
export function resolveBase(root, commit, refs = DEFAULT_BASE_REFS) {
  for (const ref of refs) {
    if (!revParse(root, ref)) continue;
    const mb = git(root, ['merge-base', commit, ref], { allowFail: true });
    if (mb.ok) return { ref, sha: mb.out.trim() };
  }
  throw new Error(`no base found: none of ${refs.join(', ')} shares history with ${commit}`);
}

/**
 * @typedef {object} ChangedFile
 * @property {string} path Repo-relative POSIX path (the new path for renames).
 * @property {'A'|'M'|'D'|'R'|'C'|'T'|'U'} status Git status letter; `U` = untracked.
 * @property {string} [oldPath] Previous path of a rename or copy.
 */

/**
 * Parse `git diff --name-status -z` output.
 * @param {string} out Raw NUL-separated output.
 * @returns {ChangedFile[]} Parsed entries.
 */
export function parseNameStatus(out) {
  const parts = out.split('\0').filter((p) => p.length > 0);
  /** @type {ChangedFile[]} */
  const files = [];
  for (let i = 0; i < parts.length; ) {
    const code = /** @type {string} */ (parts[i]);
    const letter = /** @type {ChangedFile['status']} */ (code[0]);
    if (letter === 'R' || letter === 'C') {
      files.push({ status: letter, oldPath: parts[i + 1], path: /** @type {string} */ (parts[i + 2]) });
      i += 3;
    } else {
      files.push({ status: letter, path: /** @type {string} */ (parts[i + 1]) });
      i += 2;
    }
  }
  return files;
}

/**
 * Every change between the base and the working tree: commits on the branch, staged, unstaged
 * and untracked (not ignored) files.
 * @param {string} root Repository root.
 * @param {string} baseSha Merge-base commit.
 * @returns {ChangedFile[]} Changed files sorted by path.
 */
export function worktreeChanges(root, baseSha) {
  const tracked = parseNameStatus(git(root, ['diff', '--name-status', '-z', '-M', baseSha]).out);
  const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .out.split('\0')
    .filter((p) => p.length > 0)
    .map((path) => /** @type {ChangedFile} */ ({ path, status: 'U' }));
  return [...tracked, ...untracked].sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Paths that are binary between the base and the working tree (tracked files only).
 * @param {string} root Repository root.
 * @param {string} baseSha Merge-base commit.
 * @returns {Set<string>} Binary paths.
 */
export function binaryPaths(root, baseSha) {
  const out = git(root, ['diff', '--numstat', '-z', '--no-renames', baseSha]).out;
  const set = new Set();
  for (const rec of out.split('\0')) {
    const m = /^-\t-\t(.+)$/.exec(rec);
    if (m?.[1]) set.add(m[1]);
  }
  return set;
}

/**
 * Hash working-tree files the way git would store them (clean filters and line-ending
 * conversion applied), so the result equals the blob a later commit of the same content gets.
 * @param {string} root Repository root.
 * @param {string[]} paths Existing repo-relative files.
 * @returns {Map<string, string>} Path → blob SHA.
 */
export function hashWorktreeFiles(root, paths) {
  const map = new Map();
  if (paths.length === 0) return map;
  const out = git(root, ['hash-object', '--stdin-paths'], { input: `${paths.join('\n')}\n` }).out;
  const shas = out.split(/\r?\n/).filter((s) => s.length > 0);
  paths.forEach((p, i) => map.set(p, shas[i]));
  return map;
}

/**
 * Blob of every file that differs between two commits, without rename detection, so a rename
 * appears as a deletion plus an addition.
 * @param {string} root Repository root.
 * @param {string} fromSha Base commit.
 * @param {string} toSha Commit that is pushed or proposed.
 * @returns {Map<string, string>} Path → blob SHA, or `deleted`.
 */
export function commitDiffBlobs(root, fromSha, toSha) {
  const out = git(root, ['diff', '--raw', '-z', '--no-abbrev', '--no-renames', fromSha, toSha]).out;
  const parts = out.split('\0').filter((p) => p.length > 0);
  const map = new Map();
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const meta = /** @type {string} */ (parts[i]).split(' ');
    const status = meta[4] ?? '';
    const dst = meta[3] ?? ZERO_SHA;
    map.set(parts[i + 1], status.startsWith('D') ? 'deleted' : dst);
  }
  return map;
}

/**
 * Absolute path of a file inside the git directory (worktree-aware).
 * @param {string} root Repository root.
 * @param {string} name Path below the git directory.
 * @returns {string} Absolute path.
 */
export function gitPath(root, name) {
  const p = git(root, ['rev-parse', '--git-path', name]).out.trim();
  return isAbsolute(p) ? p : resolve(root, p);
}

/**
 * Read one git config value.
 * @param {string} root Repository root.
 * @param {string} key Config key.
 * @returns {string | null} The value, or null when unset.
 */
export function configGet(root, key) {
  const res = git(root, ['config', '--get', key], { allowFail: true });
  return res.ok ? res.out.trim() : null;
}
