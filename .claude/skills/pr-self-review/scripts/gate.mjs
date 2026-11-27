#!/usr/bin/env node
/**
 * The pr-self-review gate. Blocks opening, merging and pushing a branch whose content was not
 * self-reviewed, changed after the review, or has unwaived critical findings.
 *
 * Modes:
 *   --claude-hook  Claude Code PreToolUse hook for Bash and PowerShell. Reads the hook payload
 *                  from stdin and gates `gh pr create|new`, `gh pr merge` and the `gh api`
 *                  equivalents. `git push` is gated here only when the git hook is not
 *                  installed. Blocks with exit 2 and a message for the agent.
 *   --pre-push     Git pre-push hook (.githooks/pre-push). Reads `<local ref> <local sha>
 *                  <remote ref> <remote sha>` lines from stdin. Blocks with exit 1. The user can
 *                  bypass it with `git push --no-verify`.
 *
 * Wired in .claude/settings.json and .githooks/pre-push.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { detectGatedCommands } from './lib/commands.mjs';
import { ZERO_SHA, configGet, currentBranch, git, repoRoot, revParse } from './lib/git.mjs';
import { verifyCommit } from './lib/verdict.mjs';

/** Text appended to every block message for the agent. */
const AGENT_HINT =
  'Run the pr-self-review skill (/pr-self-review), fix every critical finding and re-run it ' +
  '(--incremental after fixes), then retry. Do not work around this gate: only the user may ' +
  'override it, by waiving a finding explicitly or running the command themselves.';

/**
 * Read all of stdin.
 * @returns {string} Stdin content, or an empty string.
 */
function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Resolve the head commit and branch of a pull request through the GitHub CLI.
 * @param {string} root Repository root.
 * @param {string | null} target PR number, URL or branch; null = PR of the current branch.
 * @param {string | null} repo `--repo` value, if any.
 * @returns {{ sha: string, branch: string } | { error: string }} PR head, or why it is unknown.
 */
function prHead(root, target, repo) {
  const args = ['pr', 'view', ...(target ? [target] : []), ...(repo ? ['--repo', repo] : []), '--json', 'headRefOid,headRefName'];
  const res = spawnSync('gh', args, { cwd: root, encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (res.status !== 0) return { error: `could not resolve the pull request (gh ${args.join(' ')}): ${(res.stderr || res.error?.message || '').trim()}` };
  try {
    const data = JSON.parse(res.stdout);
    return { sha: data.headRefOid, branch: data.headRefName };
  } catch {
    return { error: 'could not parse `gh pr view` output' };
  }
}

/**
 * Verify one commit and format the failure, if any.
 * @param {string} root Repository root.
 * @param {string} sha Commit to verify.
 * @param {string} branch Branch whose verdict applies.
 * @param {string} action What is being done, for the message.
 * @returns {string | null} Block message, or null when allowed.
 */
function check(root, sha, branch, action) {
  try {
    if (git(root, ['cat-file', '-e', `${sha}^{commit}`], { allowFail: true }).ok === false) {
      return `${action}: commit ${sha.slice(0, 8)} of branch "${branch}" is not in the local repository. Fetch and check out the branch, then review it.`;
    }
    const res = verifyCommit(root, sha, branch);
    if (res.ok) return null;
    return `${action} (branch "${branch}", commit ${sha.slice(0, 8)}):\n${res.reasons.map((r) => `- ${r}`).join('\n')}`;
  } catch (err) {
    return `${action}: the gate could not verify branch "${branch}": ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * PreToolUse hook mode.
 * @returns {number} Exit code.
 */
function claudeHook() {
  /** @type {{ tool_input?: { command?: unknown }, cwd?: string }} */
  let payload = {};
  try {
    payload = JSON.parse(readStdin() || '{}');
  } catch {
    return 0;
  }
  const command = payload.tool_input?.command;
  if (typeof command !== 'string') return 0;
  const gated = detectGatedCommands(command);
  if (gated.length === 0) return 0;

  let root;
  try {
    root = repoRoot(payload.cwd || process.cwd());
  } catch {
    return 0;
  }
  const gitHookInstalled = configGet(root, 'core.hooksPath') === '.githooks';
  const problems = [];
  for (const cmd of gated) {
    if (cmd.kind === 'push' && gitHookInstalled) continue;
    if (cmd.kind === 'merge') {
      const pr = prHead(root, cmd.target, cmd.repo);
      if ('error' in pr) problems.push(`Blocked \`${cmd.text}\`: ${pr.error}`);
      else {
        const msg = check(root, pr.sha, pr.branch, `Blocked \`${cmd.text}\``);
        if (msg) problems.push(msg);
      }
      continue;
    }
    const branch = cmd.target ?? currentBranch(root);
    const head = revParse(root, cmd.target ? `refs/heads/${cmd.target}` : 'HEAD');
    if (!head) {
      if (cmd.target) problems.push(`Blocked \`${cmd.text}\`: branch "${cmd.target}" does not exist locally, so its review cannot be verified.`);
      continue;
    }
    const msg = check(root, head, branch, `Blocked \`${cmd.text}\``);
    if (msg) problems.push(msg);
  }
  if (problems.length === 0) return 0;
  process.stderr.write(`pr-self-review gate\n\n${problems.join('\n\n')}\n\n${AGENT_HINT}\n`);
  return 2;
}

/**
 * Git pre-push hook mode.
 * @returns {number} Exit code.
 */
function prePush() {
  const root = repoRoot(process.cwd());
  const problems = [];
  for (const line of readStdin().split(/\r?\n/)) {
    const [localRef, localSha] = line.trim().split(/\s+/);
    if (!localRef || !localSha || localSha === ZERO_SHA || localRef.startsWith('refs/tags/')) continue;
    const branch = localRef.startsWith('refs/heads/') ? localRef.slice('refs/heads/'.length) : currentBranch(root);
    const msg = check(root, localSha, branch, `Push of ${localRef} blocked`);
    if (msg) problems.push(msg);
  }
  if (problems.length === 0) return 0;
  process.stderr.write(
    `\npr-self-review: ${problems.join('\n\n')}\n\n` +
      'Run /pr-self-review in Claude Code and fix the critical findings first.\n' +
      'Emergency bypass (your responsibility): git push --no-verify\n\n',
  );
  return 1;
}

const mode = process.argv[2];
if (mode === '--claude-hook') process.exit(claudeHook());
else if (mode === '--pre-push') process.exit(prePush());
else {
  process.stderr.write('usage: gate.mjs --claude-hook | --pre-push <remote> <url>\n');
  process.exit(2);
}
