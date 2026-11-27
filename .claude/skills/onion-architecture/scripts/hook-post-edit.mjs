#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook (Edit|Write|MultiEdit): after an edit to backend code or a
 * @devdigest/shared copy, run the onion-architecture checks and feed new violations back to
 * the agent (exit 2 + stderr). Silent and exit 0 when the file is out of scope, the checks
 * pass, or server/ dependencies are not installed. Pure Node: no bash or jq needed.
 *
 * Wired in .claude/settings.json:
 *   node "$CLAUDE_PROJECT_DIR/.claude/skills/onion-architecture/scripts/hook-post-edit.mjs"
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS, '../../../..');
const SERVER = join(ROOT, 'server');
const DEPCRUISE = join(SERVER, 'node_modules/dependency-cruiser/bin/dependency-cruise.mjs');

/** Paths (relative to the repo root) whose edits can break a ring or a contract copy. */
const IN_SCOPE =
  /^(server\/(src|test)\/.+\.ts|reviewer-core\/(src|test)\/.+\.ts|client\/src\/vendor\/shared\/.+\.ts|server\/\.(onion-rings|dependency-cruiser)\.cjs)$/;

/**
 * Read the hook payload from stdin.
 * @returns {{ tool_input?: { file_path?: string }, tool_response?: { filePath?: string } }} Payload.
 */
function readPayload() {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

/**
 * Run one check with the current Node binary.
 * @param {string} label Section title shown to the agent.
 * @param {string[]} argv Script path and arguments.
 * @param {string} cwd Working directory.
 * @returns {string | null} Output of a failed check, or null when it passed.
 */
function run(label, argv, cwd) {
  const res = spawnSync(process.execPath, argv, { cwd, encoding: 'utf8' });
  if (res.status === 0) return null;
  return `── ${label}\n${`${res.stdout ?? ''}${res.stderr ?? ''}`.trim()}`;
}

const payload = readPayload();
const file = payload.tool_input?.file_path ?? payload.tool_response?.filePath;
if (!file) process.exit(0);
const rel = relative(ROOT, resolve(ROOT, file)).split(sep).join('/');
if (!IN_SCOPE.test(rel) || !existsSync(DEPCRUISE)) process.exit(0);

const failures = [
  run(
    'dependency rings (dependency-cruiser)',
    [
      DEPCRUISE,
      'src',
      '../reviewer-core/src',
      '../reviewer-core/test',
      '--config',
      '.dependency-cruiser.cjs',
      '--ignore-known',
      '--output-type',
      'err-long',
    ],
    SERVER,
  ),
  run('conventions (ast-grep)', [join(SCRIPTS, 'check-conventions.mjs')], ROOT),
  run('@devdigest/shared copies', [join(SCRIPTS, 'check-shared-parity.mjs')], ROOT),
].filter(Boolean);

if (failures.length === 0) process.exit(0);
process.stderr.write(
  `onion-architecture: your edit to ${rel} left new architecture violations. Fix them before ` +
    'moving on (rules: .claude/skills/onion-architecture/SKILL.md §10–11). Do not add them to a ' +
    `baseline unless the user agrees.\n\n${failures.join('\n\n')}\n`,
);
process.exit(2);
