/**
 * Collects the reviewed change set with a blob fingerprint per file. Shared by plan.mjs (to
 * build the plan) and record.mjs (to prove nothing changed while the review ran).
 */
import { closeSync, openSync, readSync } from 'node:fs';
import { join } from 'node:path';
import { binaryPaths, hashWorktreeFiles, worktreeChanges } from './git.mjs';

/**
 * Detect a binary file by looking for a NUL byte in its first 8 KiB.
 * @param {string} file Absolute path.
 * @returns {boolean} True when the file looks binary.
 */
function looksBinary(file) {
  const buf = Buffer.alloc(8192);
  const fd = openSync(file, 'r');
  try {
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.subarray(0, n).includes(0);
  } finally {
    closeSync(fd);
  }
}

/**
 * Every changed file between the base and the working tree, with its blob. A rename also adds
 * its old path as deleted, because the gate diffs commits without rename detection.
 * @param {string} root Repository root.
 * @param {string} baseSha Merge-base commit.
 * @returns {import('./routing.mjs').PlanFile[]} Files sorted by path.
 */
export function collectFiles(root, baseSha) {
  const changes = worktreeChanges(root, baseSha);
  const binaries = binaryPaths(root, baseSha);
  const blobs = hashWorktreeFiles(
    root,
    changes.filter((c) => c.status !== 'D').map((c) => c.path),
  );
  /** @type {import('./routing.mjs').PlanFile[]} */
  const files = [];
  for (const c of changes) {
    const deleted = c.status === 'D';
    files.push({
      path: c.path,
      status: c.status,
      ...(c.oldPath ? { oldPath: c.oldPath } : {}),
      blob: deleted ? 'deleted' : /** @type {string} */ (blobs.get(c.path)),
      binary: binaries.has(c.path) || (c.status === 'U' && looksBinary(join(root, c.path))),
    });
    if (c.status === 'R' && c.oldPath && !changes.some((o) => o.path === c.oldPath)) {
      files.push({ path: c.oldPath, status: 'D', blob: 'deleted', binary: false });
    }
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Compare two fingerprints.
 * @param {Record<string, string>} expected Fingerprint recorded in the plan.
 * @param {Record<string, string>} actual Fingerprint of the working tree now.
 * @returns {string[]} Paths that differ, were added or disappeared.
 */
export function diffFingerprints(expected, actual) {
  const paths = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  return [...paths].filter((p) => expected[p] !== actual[p]).sort();
}
