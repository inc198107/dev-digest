#!/usr/bin/env node
/**
 * Step 2 of pr-self-review: run the deterministic checks the plan selected (onion boundaries,
 * typecheck and hermetic unit tests of the touched packages) and write `checks.json` into the
 * run folder. A failed check becomes a critical finding in record.mjs; a check whose
 * dependencies are not installed is skipped and becomes a major finding.
 *
 * Usage: node .claude/skills/pr-self-review/scripts/run-checks.mjs [<runDir|runId>]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { git, repoRoot } from './lib/git.mjs';
import { readRunFile, resolveRunDir } from './lib/runs.mjs';

/** Per-check timeout. */
const TIMEOUT_MS = 10 * 60 * 1000;

/** Lines of output kept per check. */
const TAIL_LINES = 80;

/**
 * Find Git Bash. On Windows a plain `bash` may resolve to WSL, so derive the path from git.
 * @param {string} root Repository root.
 * @returns {string} Bash executable.
 */
function resolveBash(root) {
  if (process.platform !== 'win32') return 'bash';
  const exec = git(root, ['--exec-path']).out.trim();
  const gitHome = resolve(exec, '..', '..', '..');
  for (const candidate of [join(gitHome, 'bin', 'bash.exe'), join(gitHome, 'usr', 'bin', 'bash.exe')]) {
    if (existsSync(candidate)) return candidate;
  }
  return 'bash';
}

/**
 * Keep the last lines of a check's output, without colour codes.
 * @param {string} text Combined stdout and stderr.
 * @returns {string} Tail of the output.
 */
function tail(text) {
  const clean = text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trimEnd();
  return clean.split(/\r?\n/).slice(-TAIL_LINES).join('\n');
}

const root = repoRoot(process.cwd());
const runDir = resolveRunDir(root, process.argv[2]);
const plan = readRunFile(runDir, 'plan.json');
/** @type {import('./lib/routing.mjs').CheckRule[]} */
const checks = plan.checks;
const bash = resolveBash(root);

const results = [];
for (const check of checks) {
  const missing = (check.requires ?? []).filter((p) => !existsSync(join(root, p)));
  if (missing.length > 0) {
    results.push({ id: check.id, label: check.label, status: 'skipped', reason: `missing ${missing.join(', ')} (install dependencies)` });
    process.stdout.write(`- ${check.id}: skipped (missing ${missing.join(', ')})\n`);
    continue;
  }
  const cwd = join(root, check.cwd);
  const started = Date.now();
  const env = { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' };
  const res = check.bash
    ? spawnSync(bash, [join(root, check.bash)], { cwd, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, env, windowsHide: true })
    : spawnSync(/** @type {string} */ (check.command), { cwd, shell: true, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024, env, windowsHide: true });
  const durationMs = Date.now() - started;
  const output = `${res.stdout ?? ''}${res.stderr ?? ''}${res.error ? `\n${res.error.message}` : ''}`;
  const timedOut = res.error?.message.includes('ETIMEDOUT') || res.signal === 'SIGTERM';
  const status = res.status === 0 ? 'pass' : 'fail';
  results.push({
    id: check.id,
    label: check.label,
    status,
    exitCode: res.status,
    durationMs,
    ...(timedOut ? { reason: `timed out after ${TIMEOUT_MS / 60000} min` } : {}),
    tail: tail(output),
  });
  process.stdout.write(`- ${check.id}: ${status} (${Math.round(durationMs / 1000)} s)\n`);
}

writeFileSync(join(runDir, 'checks.json'), `${JSON.stringify(results, null, 2)}\n`);
const failed = results.filter((r) => r.status === 'fail').length;
const skipped = results.filter((r) => r.status === 'skipped').length;
process.stdout.write(`checks: ${results.length} run, ${failed} failed, ${skipped} skipped → ${join(runDir, 'checks.json')}\n`);
