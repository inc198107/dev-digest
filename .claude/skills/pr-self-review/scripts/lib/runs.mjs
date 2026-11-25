/**
 * Locating and pruning run folders (`<git-dir>/pr-self-review/runs/<runId>/`).
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { storePath } from './verdict.mjs';

/**
 * Resolve the run folder given on the command line, or the newest one.
 * @param {string} root Repository root.
 * @param {string | undefined} arg Run folder or run id; newest run when missing.
 * @returns {string} Absolute run folder that contains plan.json.
 */
export function resolveRunDir(root, arg) {
  const runs = storePath(root, 'runs');
  let dir;
  if (arg) {
    dir = existsSync(join(runs, arg)) ? join(runs, arg) : resolve(arg);
  } else {
    const ids = existsSync(runs) ? readdirSync(runs).sort() : [];
    const last = ids.at(-1);
    if (!last) throw new Error('no run found: start with plan.mjs');
    dir = join(runs, last);
  }
  if (!existsSync(join(dir, 'plan.json'))) throw new Error(`no plan.json in ${dir}`);
  return dir;
}

/**
 * Read a JSON file from a run folder.
 * @param {string} dir Run folder.
 * @param {string} name File name.
 * @returns {any} Parsed JSON, or undefined when the file does not exist.
 */
export function readRunFile(dir, name) {
  const file = join(dir, name);
  if (!existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * Delete all but the newest run folders.
 * @param {string} root Repository root.
 * @param {number} keep How many runs to keep.
 * @returns {number} How many were deleted.
 */
export function pruneRuns(root, keep) {
  const runs = storePath(root, 'runs');
  if (!existsSync(runs)) return 0;
  const old = readdirSync(runs).sort().slice(0, -keep);
  for (const id of old) rmSync(join(runs, id), { recursive: true, force: true });
  return old.length;
}
