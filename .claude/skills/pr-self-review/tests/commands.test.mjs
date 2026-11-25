import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectGatedCommands, stripHeredocs } from '../scripts/lib/commands.mjs';

/**
 * Kinds and targets of the gated commands in a line.
 * @param {string} line Command line.
 * @returns {string[]} `kind:target` pairs.
 */
function kinds(line) {
  return detectGatedCommands(line).map((c) => `${c.kind}:${c.target ?? ''}`);
}

test('detects gh pr create, new and merge', () => {
  assert.deepEqual(kinds('gh pr create --fill'), ['create:']);
  assert.deepEqual(kinds('gh pr new --title x'), ['create:']);
  assert.deepEqual(kinds('gh pr merge 12 --squash'), ['merge:12']);
  assert.deepEqual(kinds('gh pr merge --squash --subject "x y" 34'), ['merge:34']);
  assert.deepEqual(kinds('gh pr merge'), ['merge:']);
});

test('detects --head of gh pr create', () => {
  assert.deepEqual(kinds('gh pr create --head feat/x --fill'), ['create:feat/x']);
  assert.deepEqual(kinds('gh pr create --head=owner:feat/y'), ['create:feat/y']);
});

test('detects commands after separators, env vars and wrappers', () => {
  assert.deepEqual(kinds('git add -A && git commit -m "x" && git push -u origin HEAD'), ['push:']);
  assert.deepEqual(kinds('cd repo; GH_TOKEN=abc gh pr create --fill'), ['create:']);
  assert.deepEqual(kinds('git -C ../x push'), ['push:']);
  assert.deepEqual(kinds('& "C:\\Program Files\\GitHub CLI\\gh.exe" pr create --fill'), ['create:']);
  assert.deepEqual(kinds('gh -R owner/repo pr merge 5'), ['merge:5']);
});

test('detects gh api calls that open or merge a PR', () => {
  assert.deepEqual(kinds('gh api repos/o/r/pulls -f title=x -f head=b -f base=main'), ['create:']);
  assert.deepEqual(kinds('gh api -X PUT repos/o/r/pulls/7/merge'), ['merge:7']);
  assert.deepEqual(kinds('gh api repos/o/r/pulls'), []);
});

test('ignores quoted mentions, other subcommands and here-documents', () => {
  assert.deepEqual(kinds('git commit -m "docs: explain gh pr create; git push"'), []);
  assert.deepEqual(kinds("echo 'gh pr merge 1'"), []);
  assert.deepEqual(kinds('gh pr view 12 --json state'), []);
  assert.deepEqual(kinds('gh pr list'), []);
  assert.deepEqual(kinds('git status && git log --oneline'), []);
  assert.deepEqual(kinds('cat > notes.md <<\'EOF\'\ngh pr create --fill\ngit push\nEOF\ngit status'), []);
  assert.deepEqual(kinds('git commit -m "say \\"gh pr create\\" now"'), []);
});

test('stripHeredocs keeps the command and drops the body', () => {
  const out = stripHeredocs('cat <<EOF > f\nbody line\nEOF\necho done');
  assert.ok(out.includes('cat <<EOF > f'));
  assert.ok(out.includes('echo done'));
  assert.ok(!out.includes('body line'));
});
