#!/usr/bin/env node
/**
 * Point git at the versioned hooks folder (`.githooks/`), which holds the pr-self-review
 * pre-push gate. Changes nothing when `core.hooksPath` is already set to another folder: then
 * it prints what to add there instead.
 *
 * Usage: node .claude/skills/pr-self-review/scripts/install-hooks.mjs
 */
import { chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { configGet, git, repoRoot } from './lib/git.mjs';

const HOOKS_DIR = '.githooks';

const root = repoRoot(process.cwd());
const hook = join(root, HOOKS_DIR, 'pre-push');
if (!existsSync(hook)) {
  process.stderr.write(`missing ${hook}; restore it from the repository first\n`);
  process.exit(2);
}

const current = configGet(root, 'core.hooksPath');
if (current && current !== HOOKS_DIR) {
  process.stderr.write(
    `core.hooksPath is already "${current}"; not changing it.\n` +
      `Add this line to ${current}/pre-push instead:\n` +
      '  node "$(git rev-parse --show-toplevel)/.claude/skills/pr-self-review/scripts/gate.mjs" --pre-push "$@" || exit 1\n',
  );
  process.exit(1);
}

if (process.platform !== 'win32') chmodSync(hook, 0o755);
git(root, ['config', 'core.hooksPath', HOOKS_DIR]);
process.stdout.write(`core.hooksPath = ${HOOKS_DIR}: pushes now pass the pr-self-review gate (bypass: git push --no-verify)\n`);
