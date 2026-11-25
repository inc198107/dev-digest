# pr-self-review

**Version:** 1.0.0 (`metadata.version` in [SKILL.md](SKILL.md)) · **Updated:** 2026-11-25

A skill that reviews **every local change of the branch before a pull request is opened**:
commits since `main` plus staged, unstaged and untracked files. Each changed file goes to the
project skills that own it (UI skills on `client/`, architecture skills on `server/` and
`reviewer-core/`), one subagent per skill, next to deterministic checks. The result is a PASS or
BLOCK verdict; while a critical finding is open, hooks block opening, merging and pushing.

## Scope

| Covered here | Covered elsewhere |
|---|---|
| Collecting the change set and fingerprinting it | The review rules themselves → the routed skills (`onion-architecture`, `frontend-ui-architecture`, `security`, …) |
| Routing files to skills (`routing.json`), detecting skills with no routing | Project rules → root and module `CLAUDE.md` (read by the `project-rules` lane) |
| Running onion checks, typecheck and hermetic unit tests of touched packages | CI (`.github/workflows/`) still runs the full suites, integration and e2e |
| Severity rubric, verification of critical findings, waivers | Watching a PR after it is open → `/steward`, `/ship` |
| Gate: Claude Code PreToolUse hook + git pre-push hook | GitHub branch protection (not configured by this skill) |

## How it works

```
/pr-self-review
  plan.mjs        diff vs merge-base(HEAD, origin/main) + untracked → routing.json → lanes, checks, blob fingerprint
  run-checks.mjs  onion check-boundaries · typecheck · unit tests of touched packages (background)
  subagents       one general-purpose agent per lane, each loads its skill, returns JSON findings
  main agent      dedupe, verify every critical finding against the code
  record.mjs      findings + failed checks → verdict (<git-dir>/pr-self-review/verdicts/<branch>.json) + report.md

gate.mjs --claude-hook   PreToolUse (Bash|PowerShell): gh pr create|new, gh pr merge, gh api pulls[/N/merge];
                         git push only when the git hook is not installed
gate.mjs --pre-push      .githooks/pre-push: every pushed branch commit
```

The gate compares the blob of every file the pushed or proposed commit changes (against the
merge-base) with the blob the review saw. A file edited after the review, or one the review
never saw, makes the verdict stale. Uncommitted leftovers do not matter: only what goes into the
PR is checked. Critical findings in files that are not part of the commit do not block it.

## Files

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | Hard rules, workflow (plan, checks and lanes, merge and verify, record, report, waivers), gate messages |
| [routing.json](routing.json) | Lanes (skill → include/exclude globs, chunk size), ignored skills, excluded files, checks with triggers |
| [references/reviewer-prompt.md](references/reviewer-prompt.md) | Subagent prompt template and the finding schema |
| [references/severity.md](references/severity.md) | Severity rubric; what is critical per lane |
| [references/project-rules.md](references/project-rules.md) | The built-in lane that checks the `CLAUDE.md` rules |
| [scripts/plan.mjs](scripts/plan.mjs) | Change set, fingerprint, lanes, checks; `--base`, `--incremental` |
| [scripts/run-checks.mjs](scripts/run-checks.mjs) | Runs the selected checks into `checks.json` |
| [scripts/record.mjs](scripts/record.mjs) | Validates findings and waivers, refuses if the tree changed, writes verdict and `report.md` |
| [scripts/gate.mjs](scripts/gate.mjs) | Both hook entry points |
| [scripts/install-hooks.mjs](scripts/install-hooks.mjs) | Sets `core.hooksPath` to `.githooks` |
| `scripts/lib/` | glob matcher, git helpers, skill discovery, routing, command detection, verdicts, runs |
| [tests/](tests/) | `node --test`: glob, command detection, routing, and the plan → record → gate flow on a temp repo |
| [evals/](evals/) | Three cases in the `claude plugin eval` layout |

Files outside the skill that belong to it:

- `.githooks/pre-push`: calls `gate.mjs --pre-push`; `.gitattributes` keeps it LF.
- `.claude/settings.json`: the PreToolUse hook.
- Root `CLAUDE.md`: the install command and the gate gotcha.

## Usage

- **Install once per clone:** `node .claude/skills/pr-self-review/scripts/install-hooks.mjs`.
  It refuses to replace another `core.hooksPath` and prints the line to add there instead.
- **Manual:** `/pr-self-review` (optionally `--base <ref>`, `--incremental` after fixes).
- **Automatic:** the gate blocks `gh pr create` / `gh pr merge` / `git push` without a fresh
  PASS and tells Claude to run the skill; the description also triggers on "review my changes
  before the PR".
- **Waive:** only on the user's explicit request, through `waivers.json` in the run folder
  (SKILL.md §6). The user can always bypass the push gate with `git push --no-verify`.
- **New skill:** add it to `routing.json` (`lanes` or `ignore`). A skill with `paths`
  frontmatter is routed by those globs automatically; any other unrouted skill is reported.
- **Tests:** `node --test ".claude/skills/pr-self-review/tests/*.test.mjs"` (hermetic; needs git and Node ≥ 22).
- **Eval:** with Claude Code v2.1.269+ run `claude plugin eval . --allow-tools Read,Glob,Grep,Skill`
  from this folder. These are real, billed model runs.
- Run data: `$(git rev-parse --git-path pr-self-review)` keeps the last 10 runs and one verdict
  per branch. It lives in `.git` and is never committed.

## Limits

- Local gate: a push from another clone without the hook, or a PR opened in the GitHub UI from
  a branch pushed with `--no-verify`, is not checked. Branch protection with a required status
  is the next step if that matters.
- The pre-push hook verifies only branch pushes; tags and deletions pass.
- `gh pr merge` resolves the PR head with `gh pr view`; without network or authentication the
  merge is blocked.
- Unit tests that already fail on `main` block too; waive them with a reason
  (`"skill": "check:<id>"`).

## Versioning

SemVer in `metadata.version`.

- **MAJOR:** the verdict or gate starts blocking something it accepted, or a rule changes meaning.
- **MINOR:** a new lane, check, rule, script option or eval.
- **PATCH:** wording, routing globs that do not change which skill reviews existing files.

Every change bumps the version and adds a changelog entry.

## Changelog

### 1.0.0 — 2026-11-25

- Initial version: change set over merge-base + worktree + untracked; routing of 11 skills and
  the built-in `project-rules` lane; 8 deterministic checks; one subagent per lane; severity
  rubric; verdict per branch with blob fingerprints; incremental re-review; waivers by the user.
- Gate: PreToolUse hook for Bash and PowerShell (`gh pr create|new|merge`, `gh api` pulls) and a
  versioned pre-push hook; quoted text and here-documents are not parsed as commands.
- 25 hermetic tests.

## Sources

- [Claude Code hooks](https://code.claude.com/docs/en/hooks): PreToolUse input (`tool_input.command`, `cwd`), matcher syntax, exit code 2 blocks the call and feeds stderr to Claude.
- [Claude Code skills](https://code.claude.com/docs/en/skills) and [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices): frontmatter, `paths`, progressive disclosure.
- [githooks: pre-push](https://git-scm.com/docs/githooks#_pre_push): stdin format `<local ref> <local sha> <remote ref> <remote sha>`, non-zero exit aborts the push, `--no-verify` skips it.
- [git config core.hooksPath](https://git-scm.com/docs/git-config#Documentation/git-config.txt-corehooksPath), [git hash-object](https://git-scm.com/docs/git-hash-object) (filters applied by path, so the hash equals the committed blob), [git diff --raw](https://git-scm.com/docs/git-diff#_raw_output_format).
- [gh pr create](https://cli.github.com/manual/gh_pr_create), [gh pr merge](https://cli.github.com/manual/gh_pr_merge), [gh pr view](https://cli.github.com/manual/gh_pr_view).
- [Node.js test runner](https://nodejs.org/api/test.html).
