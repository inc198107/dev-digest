#!/usr/bin/env node
/**
 * Contract parity check: `@devdigest/shared` exists twice (server/src/vendor/shared is
 * canonical, client/src/vendor/shared is the client copy). A contract change must land in
 * both. This script compares the two trees line by line (order-insensitive per file) and
 * fails on drift that is not recorded in server/.shared-parity-known.json.
 *
 * Adding the same lines to both copies never fails, so additive changes made correctly pass
 * even while older drift is still recorded as known.
 *
 * Usage: node check-shared-parity.mjs [--no-ignore-known] [--update-baseline]
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const SERVER_COPY = join(ROOT, 'server/src/vendor/shared');
const CLIENT_COPY = join(ROOT, 'client/src/vendor/shared');
const BASELINE = join(ROOT, 'server/.shared-parity-known.json');

const args = new Set(process.argv.slice(2));
const ignoreKnown = !args.has('--no-ignore-known');
const updateBaseline = args.has('--update-baseline');

/**
 * List files of a tree as POSIX paths relative to it.
 * @param {string} dir Absolute directory.
 * @param {string} [base] Tree root (defaults to dir).
 * @returns {string[]} Relative file paths.
 */
function listFiles(dir, base = dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).split(sep).join('/'));
  }
  return out;
}

/**
 * Non-empty, right-trimmed lines of a file.
 * @param {string} file Absolute path.
 * @returns {string[]} Lines.
 */
const linesOf = (file) =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '');

/**
 * Multiset difference a − b.
 * @param {string[]} a Lines.
 * @param {string[]} b Lines.
 * @returns {string[]} Lines of a not matched in b (with multiplicity).
 */
function minus(a, b) {
  const counts = new Map();
  for (const l of b) counts.set(l, (counts.get(l) ?? 0) + 1);
  return a.filter((l) => {
    const c = counts.get(l) ?? 0;
    if (c > 0) {
      counts.set(l, c - 1);
      return false;
    }
    return true;
  });
}

/** @type {Record<string, { onlyServer: string[], onlyClient: string[] }>} */
const drift = {};
const files = [...new Set([...listFiles(SERVER_COPY), ...listFiles(CLIENT_COPY)])].sort();
for (const f of files) {
  const s = existsSync(join(SERVER_COPY, f)) ? linesOf(join(SERVER_COPY, f)) : [];
  const c = existsSync(join(CLIENT_COPY, f)) ? linesOf(join(CLIENT_COPY, f)) : [];
  const onlyServer = minus(s, c);
  const onlyClient = minus(c, s);
  if (onlyServer.length || onlyClient.length) drift[f] = { onlyServer, onlyClient };
}

if (updateBaseline) {
  writeFileSync(BASELINE, `${JSON.stringify(drift, null, 2)}\n`);
  console.log(`baseline written: ${Object.keys(drift).length} drifted file(s) → ${relative(ROOT, BASELINE)}`);
  process.exit(0);
}

const known = ignoreKnown && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : {};
let failures = 0;
let knownFiles = 0;
for (const [file, d] of Object.entries(drift)) {
  const k = known[file] ?? { onlyServer: [], onlyClient: [] };
  const newServer = minus(d.onlyServer, k.onlyServer);
  const newClient = minus(d.onlyClient, k.onlyClient);
  if (newServer.length === 0 && newClient.length === 0) {
    knownFiles += 1;
    continue;
  }
  failures += 1;
  console.log(`  error shared-contract-parity: vendor/shared/${file}`);
  for (const l of newServer.slice(0, 8)) console.log(`    only in server copy: ${l.trim()}`);
  for (const l of newClient.slice(0, 8)) console.log(`    only in client copy: ${l.trim()}`);
  const more = newServer.length + newClient.length - Math.min(newServer.length, 8) - Math.min(newClient.length, 8);
  if (more > 0) console.log(`    … ${more} more line(s)`);
  console.log(
    '    Change both copies of @devdigest/shared (server/src/vendor/shared is canonical, then mirror it to client/src/vendor/shared).\n',
  );
}
const summary = failures === 0 ? '✔ shared contract copies are in sync' : `✘ ${failures} file(s) drifted`;
console.log(`${summary} (${files.length} files compared)`);
if (knownFiles > 0) console.log(`‼ ${knownFiles} file(s) with known drift ignored. Run with --no-ignore-known to see them.`);
process.exit(failures === 0 ? 0 : 1);
