---
name: pr-self-review
description: Self-reviews every local change of the current branch before a pull request is opened — commits since main plus staged, unstaged and untracked files — by routing each changed file to the project skills that own it (UI skills on client/ files, onion/Fastify/Drizzle/Postgres skills on server/ and reviewer-core/ files, security, zod and the CLAUDE.md rules across both), one subagent per skill, plus onion boundary checks, typecheck and unit tests of the touched packages. Records a PASS/BLOCK verdict; any unwaived critical finding blocks `gh pr create`, `gh pr merge` and `git push` through the gate hooks. Use before opening or updating a PR, when the pr-self-review gate blocks a command, or when the user asks to self-review, pre-review or check changes before a PR ("self review", "review my changes before PR", "перевір зміни перед PR", "проверь изменения перед PR").
argument-hint: "[--base <ref>] [--incremental]"
metadata:
  version: "1.0.0"
---

# PR self-review

Reviews **all local changes of the branch** with the skills that own each file, records a verdict
and lets the gate hooks block the PR while a critical finding is open. The scripts do the
mechanical parts (diff, routing, fingerprint, checks, verdict); you run the reviewers, verify
their critical findings and talk to the user.

```
plan.mjs ──► run-checks.mjs (background) ─────────────┐
   └──► one subagent per lane (parallel) ─► dedupe + verify criticals ─► findings.json ─► record.mjs ─► verdict
gate: gh pr create|merge (PreToolUse hook) · git push (.githooks/pre-push) ─► gate.mjs checks the verdict
```

All paths below are relative to the repo root; scripts live in `.claude/skills/pr-self-review/scripts/`.

## Hard rules

1. **Never lower a severity to get past the gate**, and never edit `verdicts/` or run files by
   hand. The verdict must come from `record.mjs`.
2. **Never bypass the gate** (`--no-verify`, `gh api` tricks, pushing from another clone,
   editing hooks or `core.hooksPath`). Only the user overrides it: by an explicit waiver (§6) or
   by running the command themselves.
3. **Never waive on your own.** A waiver needs the user's explicit words in this conversation
   ("waive F3, it is pre-existing"). "Just open the PR" is not a waiver: explain what blocks it
   and offer to fix it, to waive a specific finding with a reason, or that they push themselves.
4. Reviewers **only read**. Fixes happen after the review, in the main conversation, when the
   user agrees.
5. Review the change, not the codebase: findings must concern changed lines or what the change
   makes worse. Legacy debt outside the diff is not reported.

## 1. Plan

1. If `git config core.hooksPath` is not `.githooks`, tell the user the push gate is not
   installed and offer `node .claude/skills/pr-self-review/scripts/install-hooks.mjs`.
2. Run `node .claude/skills/pr-self-review/scripts/plan.mjs` (add `--base <ref>` if the user
   names another base; add `--incremental` when re-reviewing after fixing findings of the last
   run on this branch). It prints the plan and writes `plan.json` to `runDir`.
3. Read the printed plan:
   - `counts.files` is 0 → write `[]` to `<runDir>/findings.json`, run `record.mjs` (step 4) and
     report PASS: nothing to review.
   - `lanes`: one entry per subagent. `project-rules` is built in; the rest are skills.
   - `unroutedSkills`: skills in `.claude/skills` that `routing.json` does not mention. Read each
     description; if it plausibly applies to some changed files, add an ad-hoc lane for those
     files, and at the end propose a `routing.json` entry to the user (do not edit it silently).
   - `missingSkills`: routed skills whose folder is gone. Mention them in the report.
   - `incremental.refused`: the incremental run fell back to a full review; say why.

## 2. Run the checks and the reviewers

1. Start `node .claude/skills/pr-self-review/scripts/run-checks.mjs <runDir>` with
   `run_in_background` when `plan.checks` is not empty. It writes `checks.json`.
2. In **one message**, start one `general-purpose` subagent per lane (all lanes in parallel).
   Build each prompt from [references/reviewer-prompt.md](references/reviewer-prompt.md),
   filling in the lane's skill, skill file, base SHA and file list. Each returns a JSON array.
3. Do not review lanes yourself while they run; wait for them. Do not edit any file in the
   working tree until `record.mjs` has run: an edit makes the run unrecordable.
4. A failed check on files outside the change is often a known failure: look for it in the
   module's `INSIGHTS.md`, tell the user, and ask whether to waive it (§6). Do not waive it
   yourself.

## 3. Merge and verify

1. Parse every lane's JSON. A lane that returned invalid JSON or failed: re-run it once; if it
   fails again, add a `major` finding "lane <id> did not complete" for its first file.
2. Deduplicate: findings on the same file and line range describing the same defect become one
   finding with the highest severity, `skill` = the lane that explained it best, and the other
   lanes in `alsoReportedBy`.
3. **Verify every critical finding yourself** before recording it: open the cited lines, follow
   the scenario through the code. If the evidence does not hold, or the scenario needs an
   unrealistic precondition, downgrade it to `major` and add "(downgraded: <why>)" to the
   title. Check the rubric in [references/severity.md](references/severity.md) again.
4. Write the merged array to `<runDir>/findings.json` (fields in reviewer-prompt.md; `id`s
   `F1`, `F2`… in severity order; no `waived` field).

## 4. Record

1. Wait for the checks to finish (you are notified when the background task ends).
2. Run `node .claude/skills/pr-self-review/scripts/record.mjs <runDir>`. Exit 0 = PASS, 1 = BLOCK,
   2 = error. A failed check is added as a critical finding, a skipped one as major.
3. "Files changed while the review ran" means someone edited the tree; start a new run.

## 5. Report to the user

Reply in the user's chat language (code, paths and ids stay as they are):

- Verdict first: **PASS** or **BLOCK** with the number of critical findings.
- A table: severity · id · file:line · skill · title. Critical and major in full; minor and nit
  may be summarised as counts if there are many.
- The checks line (✔/✘/–) and the path of `report.md`.
- On BLOCK: list what blocks, offer to fix it, and say the gate will stop `gh pr create`,
  `gh pr merge` and `git push` until a re-review passes. After fixes, re-run with
  `--incremental` (unchanged files keep their earlier findings; checks always run again).
- Routing notes: unrouted or missing skills and a proposed `routing.json` change.

## 6. Waivers (only on the user's explicit request)

1. Write `<runDir>/waivers.json` in the **same run**:
   `[{ "id": "F3", "by": "user", "reason": "<the user's reason>" }]`; a failed check is
   waived by `"skill": "check:<id>"` (for example a test that also fails on main).
2. Re-run `record.mjs <runDir>`. It refuses if the working tree changed since the plan.
3. Waived findings stay in the report and the verdict under "Waived".

## 7. When the gate blocks a command

The PreToolUse hook (`gh pr create|merge`) and the git pre-push hook print why:

| Message | Do |
|---|---|
| No self-review is recorded | Run this skill (§1–5), then retry the command. |
| The review is stale | Files changed after the review: run `plan.mjs --incremental` and continue from §2. |
| Unresolved critical findings | Fix them (with the user's agreement) and re-review, or ask whether to waive. |
| Commit not in the local repository | Fetch and check out the PR branch, review it there. |

## Files

| File | Purpose |
|---|---|
| [routing.json](routing.json) | Lanes (skill → globs), ignored skills, excluded files, checks |
| [references/reviewer-prompt.md](references/reviewer-prompt.md) | Subagent prompt template and finding schema |
| [references/severity.md](references/severity.md) | Severity rubric with examples per lane |
| [references/project-rules.md](references/project-rules.md) | Instructions of the built-in `project-rules` lane |
| `scripts/plan.mjs` · `run-checks.mjs` · `record.mjs` | The three steps |
| `scripts/gate.mjs` | Gate for the PreToolUse hook and the pre-push hook |
| `scripts/install-hooks.mjs` | Sets `core.hooksPath` to `.githooks` |

Run data lives in `$(git rev-parse --git-path pr-self-review)` (`runs/<runId>/`,
`verdicts/<branch>.json`): inside `.git`, never committed. Tests:
`node --test ".claude/skills/pr-self-review/tests/*.test.mjs"`.
