/**
 * Findings, verdicts and the freshness check the gate runs. A verdict is stored per branch in
 * `<git-dir>/pr-self-review/verdicts/<branch>.json`; it records the blob of every file the
 * review saw, so any later change to a file that goes into the PR makes the verdict stale.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitDiffBlobs, gitPath, resolveBase } from './git.mjs';

/** Severities, most severe first. */
export const SEVERITIES = /** @type {const} */ (['critical', 'major', 'minor', 'nit']);

/** Folder below the git directory that holds runs and verdicts. */
export const STORE = 'pr-self-review';

/**
 * @typedef {object} Finding
 * @property {string} id Stable id within a run (`F1`, `C1`…).
 * @property {string} skill Skill or lane that reported it (`check:<id>` for checks).
 * @property {'critical'|'major'|'minor'|'nit'} severity Severity from references/severity.md.
 * @property {string} title One-line statement of the defect.
 * @property {string | null} file Repo-relative file, or null for check failures.
 * @property {number | null} line 1-based line in the new version, if known.
 * @property {string} [evidence] Quoted code or check output.
 * @property {string} [scenario] Concrete failure scenario.
 * @property {string} [fix] Suggested fix.
 * @property {string} [rule] Skill section or project rule that backs the finding.
 * @property {string[]} [alsoReportedBy] Other lanes that reported the same defect.
 * @property {{ by: 'user', reason: string }} [waived] Present only when the user waived it.
 * @property {boolean} [carried] True when copied unchanged from an earlier run.
 */

/**
 * @typedef {object} Verdict
 * @property {number} schema Format version.
 * @property {string} branch Branch the review ran on.
 * @property {string} runId Run that produced it.
 * @property {string} createdAt ISO timestamp.
 * @property {{ ref: string, sha: string }} base Base ref and merge-base.
 * @property {string} head HEAD at review time.
 * @property {Record<string, string>} files Path → reviewed blob SHA, or `deleted`.
 * @property {'pass'|'block'} verdict Outcome.
 * @property {Record<string, number>} counts Count per severity plus `waived`.
 * @property {Finding[]} findings Every finding of the run.
 * @property {{ id: string, status: string }[]} checks Deterministic check results.
 */

/**
 * Turn a branch name into a safe file name.
 * @param {string} branch Branch name.
 * @returns {string} File name without extension.
 */
export function branchKey(branch) {
  return branch.replace(/[^A-Za-z0-9._-]/g, '_');
}

/**
 * Absolute path of the store folder (created on demand).
 * @param {string} root Repository root.
 * @param {...string} parts Sub-path.
 * @returns {string} Absolute path.
 */
export function storePath(root, ...parts) {
  return join(gitPath(root, STORE), ...parts);
}

/**
 * Read the verdict of a branch.
 * @param {string} root Repository root.
 * @param {string} branch Branch name.
 * @returns {Verdict | null} The verdict, or null when none was recorded.
 */
export function readVerdict(root, branch) {
  const file = storePath(root, 'verdicts', `${branchKey(branch)}.json`);
  if (!existsSync(file)) return null;
  try {
    const v = JSON.parse(readFileSync(file, 'utf8'));
    return v && v.branch === branch ? v : null;
  } catch {
    return null;
  }
}

/**
 * Write the verdict of a branch.
 * @param {string} root Repository root.
 * @param {Verdict} verdict Verdict to store.
 * @returns {string} Absolute path of the written file.
 */
export function writeVerdict(root, verdict) {
  const dir = storePath(root, 'verdicts');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${branchKey(verdict.branch)}.json`);
  writeFileSync(file, `${JSON.stringify(verdict, null, 2)}\n`);
  return file;
}

/**
 * True when a finding blocks the PR.
 * @param {Finding} f Finding.
 * @returns {boolean} Critical and not waived.
 */
export function isBlocking(f) {
  return f.severity === 'critical' && !f.waived;
}

/**
 * Count findings per severity.
 * @param {Finding[]} findings Findings.
 * @returns {Record<string, number>} Counts of unwaived findings per severity, plus `waived`.
 */
export function countFindings(findings) {
  /** @type {Record<string, number>} */
  const counts = { critical: 0, major: 0, minor: 0, nit: 0, waived: 0 };
  for (const f of findings) {
    if (f.waived) counts.waived = (counts.waived ?? 0) + 1;
    else counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  }
  return counts;
}

/**
 * Validate the findings array the reviewers produced. Throws with every problem listed.
 * @param {unknown} data Parsed `findings.json`.
 * @returns {Finding[]} Normalised findings with ids.
 */
export function validateFindings(data) {
  if (!Array.isArray(data)) throw new Error('findings.json must be a JSON array');
  /** @type {string[]} */
  const errors = [];
  /** @type {Finding[]} */
  const out = [];
  data.forEach((raw, i) => {
    const where = `finding[${i}]`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${where}: not an object`);
      return;
    }
    const f = /** @type {Record<string, unknown>} */ (raw);
    if (typeof f.skill !== 'string' || !f.skill) errors.push(`${where}: "skill" must be a non-empty string`);
    if (!SEVERITIES.includes(/** @type {never} */ (f.severity))) errors.push(`${where}: "severity" must be one of ${SEVERITIES.join(', ')}`);
    if (typeof f.title !== 'string' || !f.title) errors.push(`${where}: "title" must be a non-empty string`);
    if (typeof f.file !== 'string' || !f.file) errors.push(`${where}: "file" must be a repo-relative path`);
    if (f.line !== undefined && f.line !== null && !(Number.isInteger(f.line) && /** @type {number} */ (f.line) > 0)) {
      errors.push(`${where}: "line" must be a positive integer or null`);
    }
    if (f.severity === 'critical' && (typeof f.scenario !== 'string' || !f.scenario)) {
      errors.push(`${where}: a critical finding needs a "scenario"`);
    }
    if (f.waived !== undefined) errors.push(`${where}: findings cannot waive themselves; the user's waivers go to waivers.json`);
    out.push({
      ...(/** @type {Finding} */ (/** @type {unknown} */ (f))),
      id: typeof f.id === 'string' && f.id ? f.id : `F${i + 1}`,
      line: typeof f.line === 'number' ? f.line : null,
    });
  });
  if (errors.length > 0) throw new Error(`invalid findings.json:\n- ${errors.join('\n- ')}`);
  const ids = new Set();
  for (const f of out) {
    if (ids.has(f.id)) throw new Error(`invalid findings.json: duplicate id ${f.id}`);
    ids.add(f.id);
  }
  return out;
}

/**
 * @typedef {object} Waiver
 * @property {string} [id] Finding id to waive.
 * @property {string} [skill] Lane or check (`check:<id>`) whose findings are waived.
 * @property {'user'} by Always `user`: only the user may waive.
 * @property {string} reason Why the user accepts the finding.
 */

/**
 * Validate `waivers.json`. Throws with every problem listed.
 * @param {unknown} data Parsed file, or undefined when it does not exist.
 * @returns {Waiver[]} Waivers.
 */
export function validateWaivers(data) {
  if (data === undefined) return [];
  if (!Array.isArray(data)) throw new Error('waivers.json must be a JSON array');
  const errors = [];
  for (const [i, w] of data.entries()) {
    if (!w || typeof w !== 'object') errors.push(`waiver[${i}]: not an object`);
    else if (w.by !== 'user') errors.push(`waiver[${i}]: "by" must be "user"`);
    else if (typeof w.reason !== 'string' || !w.reason.trim()) errors.push(`waiver[${i}]: "reason" is required`);
    else if (typeof w.id !== 'string' && typeof w.skill !== 'string') errors.push(`waiver[${i}]: needs "id" or "skill"`);
  }
  if (errors.length > 0) throw new Error(`invalid waivers.json:\n- ${errors.join('\n- ')}`);
  return /** @type {Waiver[]} */ (data);
}

/**
 * Mark findings as waived. Waivers carried from an earlier run are kept.
 * @param {Finding[]} findings Findings.
 * @param {Waiver[]} waivers Waivers from the user.
 * @returns {Finding[]} Findings with `waived` set where a waiver matches.
 */
export function applyWaivers(findings, waivers) {
  return findings.map((f) => {
    const w = waivers.find((x) => (x.id && x.id === f.id) || (x.skill && x.skill === f.skill));
    return w ? { ...f, waived: { by: 'user', reason: w.reason } } : f;
  });
}

/**
 * Convert check results into findings: a failed check is critical, a skipped one is major.
 * @param {{ id: string, label?: string, status: string, reason?: string, tail?: string }[]} checks Check results.
 * @returns {Finding[]} Findings for failed and skipped checks.
 */
export function checkFindings(checks) {
  /** @type {Finding[]} */
  const out = [];
  checks.forEach((c, i) => {
    if (c.status === 'pass') return;
    const failed = c.status === 'fail';
    out.push({
      id: `C${i + 1}`,
      skill: `check:${c.id}`,
      severity: failed ? 'critical' : 'major',
      title: failed ? `${c.label ?? c.id} failed` : `${c.label ?? c.id} was not run: ${c.reason ?? 'skipped'}`,
      file: null,
      line: null,
      evidence: c.tail ?? c.reason ?? '',
      scenario: failed ? 'The branch does not pass a check that CI also runs; the PR would land broken.' : 'This part of the change is not verified.',
      fix: failed ? 'Fix the errors shown in the evidence and re-run the review.' : 'Install the dependencies and re-run the review.',
    });
  });
  return out;
}

/**
 * Decide whether a commit may be pushed or proposed: every file it changes against the base
 * must carry the blob the review saw, and no unwaived critical finding may concern it.
 * @param {string} root Repository root.
 * @param {string} sha Commit about to be pushed, proposed or merged.
 * @param {string} branch Branch whose verdict applies.
 * @returns {{ ok: boolean, reasons: string[], verdict: Verdict | null, changed: number }} Decision.
 */
export function verifyCommit(root, sha, branch) {
  const verdict = readVerdict(root, branch);
  const refs = verdict ? [verdict.base.ref] : undefined;
  let base;
  try {
    base = resolveBase(root, sha, refs);
  } catch {
    base = resolveBase(root, sha);
  }
  const changed = commitDiffBlobs(root, base.sha, sha);
  if (changed.size === 0) return { ok: true, reasons: [], verdict, changed: 0 };
  if (!verdict) {
    return {
      ok: false,
      reasons: [`No self-review is recorded for branch "${branch}" (${changed.size} changed file(s) against ${base.ref}).`],
      verdict,
      changed: changed.size,
    };
  }
  /** @type {string[]} */
  const reasons = [];
  const stale = [...changed].filter(([path, blob]) => verdict.files[path] !== blob).map(([path]) => path);
  if (stale.length > 0) {
    const list = stale.slice(0, 10).map((p) => `  - ${p}`).join('\n');
    const more = stale.length > 10 ? `\n  … and ${stale.length - 10} more` : '';
    reasons.push(`The review is stale: ${stale.length} file(s) changed after it or were not part of it:\n${list}${more}`);
  }
  const blocking = verdict.findings.filter((f) => isBlocking(f) && (f.file === null || changed.has(f.file)));
  if (blocking.length > 0) {
    const list = blocking
      .map((f) => `  - [${f.id}] ${f.skill}: ${f.title}${f.file ? ` (${f.file}${f.line ? `:${f.line}` : ''})` : ''}`)
      .join('\n');
    reasons.push(`The review found ${blocking.length} unresolved critical finding(s):\n${list}`);
  }
  return { ok: reasons.length === 0, reasons, verdict, changed: changed.size };
}
