/**
 * End-to-end flow on a throwaway git repository: plan → checks → record → gate. Hermetic: it
 * needs only git and node, and never touches the real repository.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
/** @type {string} */
let repo;

/**
 * Run git in the temp repo.
 * @param {...string} args Git arguments.
 * @returns {string} Trimmed stdout.
 */
function git(...args) {
  const res = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

/**
 * Run one of the skill's scripts in the temp repo.
 * @param {string} script Script file name.
 * @param {string[]} [args] Arguments.
 * @param {string} [input] Stdin.
 * @returns {{ status: number | null, stdout: string, stderr: string }} Result.
 */
function run(script, args = [], input = '') {
  const res = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: repo, encoding: 'utf8', input });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

/**
 * Write a file in the temp repo.
 * @param {string} path Repo-relative path.
 * @param {string} content Content.
 * @returns {void}
 */
function write(path, content) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

/**
 * Plan, check and record a review with the given findings.
 * @param {unknown[]} findings Findings to record.
 * @param {string[]} [planArgs] Extra plan.mjs arguments.
 * @returns {{ status: number | null, runDir: string, plan: any, stdout: string, stderr: string }} Record result.
 */
function review(findings, planArgs = []) {
  const planned = run('plan.mjs', planArgs);
  assert.equal(planned.status, 0, planned.stderr);
  const plan = JSON.parse(planned.stdout);
  const checks = run('run-checks.mjs', [plan.runDir]);
  assert.equal(checks.status, 0, checks.stderr);
  writeFileSync(join(plan.runDir, 'findings.json'), JSON.stringify(findings));
  const rec = run('record.mjs', [plan.runDir]);
  return { ...rec, runDir: plan.runDir, plan };
}

/**
 * Ask the pre-push hook about the current HEAD.
 * @returns {{ status: number | null, stderr: string }} Hook result.
 */
function prePush() {
  const sha = git('rev-parse', 'HEAD');
  return run('gate.mjs', ['--pre-push', 'origin', 'x'], `refs/heads/feat ${sha} refs/heads/feat ${'0'.repeat(40)}\n`);
}

/**
 * Ask the Claude Code hook about a command.
 * @param {string} command Command line.
 * @returns {{ status: number | null, stderr: string }} Hook result.
 */
function claudeHook(command) {
  return run('gate.mjs', ['--claude-hook'], JSON.stringify({ tool_input: { command }, cwd: repo }));
}

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'pr-self-review-'));
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'Test');
  git('config', 'core.autocrlf', 'false');
  write('server/src/app.ts', 'export const app = 1;\n');
  write('README.md', '# temp\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'chore: init');
  git('checkout', '-q', '-b', 'feat');
});

after(() => {
  if (repo) rmSync(repo, { recursive: true, force: true });
});

test('a branch with no changes passes without a review', () => {
  assert.equal(prePush().status, 0);
  assert.equal(claudeHook('gh pr create --fill').status, 0);
});

test('changes without a review are blocked', () => {
  write('server/src/app.ts', 'export const app = 2;\n');
  git('commit', '-qam', 'feat: two');
  const push = prePush();
  assert.equal(push.status, 1);
  assert.match(push.stderr, /No self-review is recorded/);
  const hook = claudeHook('gh pr create --fill');
  assert.equal(hook.status, 2);
  assert.match(hook.stderr, /pr-self-review/);
  assert.equal(claudeHook('git status').status, 0);
});

test('a clean review passes and covers committed plus uncommitted work', () => {
  write('server/src/new.ts', 'export const added = true;\n');
  const rec = review([]);
  assert.equal(rec.status, 0, rec.stderr);
  assert.match(rec.stdout, /^PASS/);
  assert.equal(rec.plan.counts.files, 2);
  git('add', '-A');
  git('commit', '-qm', 'feat: add new');
  assert.equal(prePush().status, 0);
  assert.equal(claudeHook('gh pr create --fill').status, 0);
});

test('a file changed after the review makes it stale', () => {
  write('server/src/new.ts', 'export const added = false;\n');
  git('commit', '-qam', 'fix: flip');
  const push = prePush();
  assert.equal(push.status, 1);
  assert.match(push.stderr, /stale[\s\S]*server\/src\/new\.ts/);
});

test('a critical finding blocks; an unrelated uncommitted file does not count', () => {
  write('scratch.txt', 'local notes\n');
  const rec = review([
    { skill: 'security', severity: 'critical', file: 'server/src/new.ts', line: 1, title: 'Leaks a secret', scenario: 'Anyone reading the bundle gets the key.' },
    { skill: 'security', severity: 'critical', file: 'scratch.txt', line: 1, title: 'Not part of the PR', scenario: 'Local file only.' },
    { skill: 'onion-architecture', severity: 'minor', file: 'server/src/app.ts', line: 1, title: 'Naming' },
  ]);
  assert.equal(rec.status, 1);
  assert.match(rec.stdout, /^BLOCK: critical 2/);
  const push = prePush();
  assert.equal(push.status, 1);
  assert.match(push.stderr, /1 unresolved critical finding/);
  assert.match(push.stderr, /Leaks a secret/);
  assert.doesNotMatch(push.stderr, /Not part of the PR/);

  writeFileSync(join(rec.runDir, 'waivers.json'), JSON.stringify([{ id: 'F1', by: 'user', reason: 'test fixture, not a real key' }]));
  const again = run('record.mjs', [rec.runDir]);
  assert.equal(again.status, 1, 'scratch.txt finding is still critical in the verdict');
  assert.equal(prePush().status, 0, 'the remaining critical concerns a file outside the pushed commit');
});

test('incremental re-review carries findings of unchanged files and reviews only changed ones', () => {
  write('server/src/app.ts', 'export const app = 3;\n');
  git('commit', '-qam', 'feat: three');
  const rec = review([], ['--incremental']);
  assert.equal(rec.plan.incremental.fromRun.length > 0, true);
  assert.deepEqual(rec.plan.lanes.flatMap((/** @type {any} */ l) => l.files.map((/** @type {any} */ f) => f.path)).sort(), ['server/src/app.ts']);
  assert.ok(rec.plan.carried.some((/** @type {string} */ c) => c.includes('Leaks a secret')));
  assert.equal(prePush().status, 0, 'carried critical stays waived');
});

test('incremental re-review skips lanes whose files did not change', () => {
  write('.claude/skills/onion-architecture/SKILL.md', '---\nname: onion-architecture\ndescription: Server rings.\n---\n');
  write('client/src/view.tsx', 'export const View = () => null;\n');
  assert.equal(review([]).status, 0);
  write('client/src/view.tsx', 'export const View = () => 1;\n');
  const rec = review([], ['--incremental']);
  const skipped = rec.plan.incremental.skipped;
  const planned = rec.plan.lanes.map((/** @type {any} */ l) => l.skill);
  const reviewed = rec.plan.lanes.flatMap((/** @type {any} */ l) => l.files.map((/** @type {any} */ f) => f.path));
  assert.deepEqual([...new Set(reviewed)], ['client/src/view.tsx']);
  assert.ok(skipped.some((/** @type {any} */ s) => s.skill === 'onion-architecture' && s.carried === 0), JSON.stringify(skipped));
  for (const s of skipped) assert.ok(!planned.includes(s.skill), `${s.skill} is both skipped and planned`);
});

test('record refuses findings without the required fields and edits made during the review', () => {
  const planned = JSON.parse(run('plan.mjs').stdout);
  run('run-checks.mjs', [planned.runDir]);
  writeFileSync(join(planned.runDir, 'findings.json'), JSON.stringify([{ skill: 'zod', severity: 'critical', file: 'server/src/app.ts', title: 'No scenario' }]));
  const bad = run('record.mjs', [planned.runDir]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /needs a "scenario"/);

  writeFileSync(join(planned.runDir, 'findings.json'), '[]');
  write('server/src/app.ts', 'export const app = 4;\n');
  const drift = run('record.mjs', [planned.runDir]);
  assert.equal(drift.status, 2);
  assert.match(drift.stderr, /files changed while the review ran/);
});

test('deleted and renamed files are fingerprinted', () => {
  git('checkout', '-q', '--', '.');
  mkdirSync(join(repo, 'docs'));
  git('mv', 'README.md', 'docs/README.md');
  const rec = review([]);
  assert.equal(rec.status, 0, rec.stderr);
  git('commit', '-qm', 'docs: move readme');
  assert.equal(prePush().status, 0);
});
