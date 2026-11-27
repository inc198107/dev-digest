#!/usr/bin/env node
/**
 * Step 1 of pr-self-review: collect every local change of the branch (commits since the base,
 * staged, unstaged and untracked files), fingerprint it, route the files to skill lanes and pick
 * the deterministic checks. Writes `<git-dir>/pr-self-review/runs/<runId>/plan.json` and prints
 * the plan (without blob hashes) as JSON.
 *
 * Usage: node .claude/skills/pr-self-review/scripts/plan.mjs [--base <ref>] [--incremental]
 *
 *   --base <ref>     compare with this ref instead of origin/main (falls back to main)
 *   --incremental    review only files changed since this branch's last verdict and carry the
 *                    earlier findings of unchanged files over (use after fixing findings). A lane
 *                    whose files did not change gets no subagent; it is listed under
 *                    `incremental.skipped` with the number of its carried findings.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectFiles } from './lib/changes.mjs';
import { configGet, currentBranch, repoRoot, resolveBase, revParse } from './lib/git.mjs';
import { buildLanes, selectChecks } from './lib/routing.mjs';
import { discoverSkills } from './lib/skills.mjs';
import { readVerdict, storePath } from './lib/verdict.mjs';

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Parse command-line flags.
 * @param {string[]} argv Arguments after the script path.
 * @returns {{ base: string | null, incremental: boolean }} Options.
 */
function parseArgs(argv) {
  const opts = { base: /** @type {string | null} */ (null), incremental: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') opts.base = argv[++i] ?? null;
    else if (argv[i] === '--incremental') opts.incremental = true;
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  return opts;
}

/**
 * Sortable, unique run id based on the current UTC time.
 * @returns {string} Run id such as `20261125-213001-123`.
 */
function newRunId() {
  const iso = new Date().toISOString();
  return `${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 19).replace(/:/g, '')}-${iso.slice(20, 23)}`;
}

const opts = parseArgs(process.argv.slice(2));
const root = repoRoot(process.cwd());
const head = revParse(root, 'HEAD');
if (!head) throw new Error('the repository has no commits yet');
const branch = currentBranch(root);
const base = resolveBase(root, 'HEAD', opts.base ? [opts.base] : undefined);

/** @type {import('./lib/routing.mjs').Routing} */
const routing = JSON.parse(readFileSync(join(SKILL_DIR, 'routing.json'), 'utf8'));
const files = collectFiles(root, base.sha);

/** @type {Record<string, string>} */
const fingerprint = Object.fromEntries(files.map((f) => [f.path, f.blob]));

let reviewFiles = files;
/** @type {import('./lib/verdict.mjs').Finding[]} */
let carried = [];
/**
 * @type {{ fromRun: string, unchanged: number, skipped?: { skill: string, files: number, carried: number }[] }
 *   | { refused: string } | null}
 */
let incremental = null;
if (opts.incremental) {
  const prev = readVerdict(root, branch);
  if (!prev) incremental = { refused: 'no earlier verdict for this branch; running a full review' };
  else if (prev.base.sha !== base.sha) incremental = { refused: 'the base moved since the last verdict; running a full review' };
  else {
    const unchanged = new Set(files.filter((f) => prev.files[f.path] === f.blob).map((f) => f.path));
    reviewFiles = files.filter((f) => !unchanged.has(f.path));
    carried = prev.findings
      .filter((f) => f.file !== null && !f.skill.startsWith('check:') && unchanged.has(f.file))
      .map((f) => ({ ...f, carried: true }));
    incremental = { fromRun: prev.runId, unchanged: unchanged.size };
  }
}

const skills = discoverSkills(root);
const { lanes, unroutedSkills, missingSkills, uncoveredFiles } = buildLanes(reviewFiles, routing, skills);
if (incremental && 'fromRun' in incremental) {
  /** Lanes the whole change routes to that get no subagent now: none of their files changed. */
  const planned = new Set(lanes.map((l) => l.skill));
  /** @type {Map<string, number>} */
  const skippedFiles = new Map();
  for (const lane of buildLanes(files, routing, skills).lanes) {
    if (!planned.has(lane.skill)) skippedFiles.set(lane.skill, (skippedFiles.get(lane.skill) ?? 0) + lane.files.length);
  }
  incremental.skipped = [...skippedFiles].map(([skill, count]) => ({
    skill,
    files: count,
    carried: carried.filter((f) => f.skill === skill).length,
  }));
}
const checks = selectChecks(files, routing.checks);

const runId = newRunId();
const runDir = storePath(root, 'runs', runId);
mkdirSync(runDir, { recursive: true });

const plan = {
  schema: 1,
  runId,
  runDir,
  repoRoot: root,
  branch,
  head,
  base,
  hooksInstalled: configGet(root, 'core.hooksPath') === '.githooks',
  incremental,
  diffCommand: `git diff ${base.sha} -- <file>`,
  counts: { files: files.length, reviewed: reviewFiles.length, lanes: lanes.length, checks: checks.length, carried: carried.length },
  lanes,
  checks,
  unroutedSkills,
  missingSkills,
  uncoveredFiles,
  carried,
  fingerprint,
  files,
};
writeFileSync(join(runDir, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);

const { fingerprint: _fp, files: _files, carried: _carried, ...summary } = plan;
process.stdout.write(`${JSON.stringify({ ...summary, carried: carried.map((f) => `${f.id} ${f.severity} ${f.file}: ${f.title}`) }, null, 2)}\n`);
