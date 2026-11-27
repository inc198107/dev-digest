# Conventions Extractor

**Status:** in progress
**Milestone:** M2
**Modules touched:** server · client · e2e · reviewer-core (none: `wrapUntrusted` is reused as is)

## Goal
A team's rules rarely live in a document; they live in the code. The extractor reads the most
important files of a cloned repo, proposes **conventions** (house rules) each backed by a real
code fragment, lets the user accept, reject or reword them, and merges the accepted ones into a
`convention` skill that agents can load (`## Skills / rules` block of the review prompt).

Design: L02 homework screenshots — "Conventions in payments-api" (cards with Accepted / Reject,
"Deselect all", "3 of 3 accepted", "Create skill") and the "Create skill from conventions" modal.
`DevDigest Design (standalone).html` → `screen_conv_conf.jsx` (N7) is older; only its empty
state and the `ListChecks` icon are reused.

## Scope
- In:
  - per-repo extraction: code picks the input (root ESLint / tsconfig / Prettier configs + the
    top 12 files of repo-intel's sample) → ONE structured LLM call extracts rules → the server
    grounds every rule against the file lines it read and drops the rest without a model call;
  - each card's evidence path links to the cited lines on GitHub;
  - list, accept / un-accept, reject (delete), reword a rule, accept all / deselect all;
  - re-scan that keeps accepted (and reworded) conventions;
  - "Create skill" modal: a draft built from the accepted conventions, editable name,
    description, enabled flag and body; saved through `POST /skills` with type `convention`
    and source `extracted`;
  - Conventions item in the sidebar (SKILLS LAB), page `/repos/:repoId/conventions`.
- Out: scan history, background jobs, auto-linking the skill to agents, updating an existing
  skill on a re-scan, languages repo-intel does not index (samples are TS/JS only).

## Contract changes
- `@devdigest/shared` (server + client copies):
  - new `contracts/conventions.ts`: `MAX_CONVENTION_RULE_CHARS`, `ConventionUpdateBody`
    (`rule?`, `accepted?`, at least one), `ConventionsAcceptAllBody` (`accepted`),
    `ConventionList` (`candidates`, `last_scan_at`), `ConventionScanResult`
    (`candidates`, `last_scan_at`, `analyzed_files`);
  - `contracts/skills.ts`: `SkillCreateSource` gains `'extracted'`; `SkillCreateBody` gains
    optional `evidence_files` (≤ 50 paths); `SkillUpdateBody` omits it.
  - `ConventionCandidate` (`knowledge.ts`) is unchanged.
- DB: `conventions.created_at timestamptz not null default now()` (migration `0012`); "last
  scan" = the newest `created_at` of the repo. Index `(repo_id, workspace_id)` (migration
  `0013`; repo_id leads so the repos ON DELETE CASCADE can use it).
- Routes (new module `conventions`):

  | Route | What it does |
  |---|---|
  | `GET /repos/:id/conventions` | `ConventionList` |
  | `POST /repos/:id/conventions/extract` | runs a scan, `ConventionScanResult`; rate-limited |
  | `PUT /repos/:id/conventions/accepted` | accept all / deselect all → `ConventionList` |
  | `PUT /conventions/:id` | reword and/or accept → `ConventionCandidate` |
  | `DELETE /conventions/:id` | reject → `{ ok: true }` |

## Behaviour
- **Model.** Provider and model come from Settings → Feature models → Conventions
  (`resolveFeatureModel(…, 'conventions')`, registry default unchanged).
- **Scan.**
  1. The repo must be in the workspace (404) and cloned (409 "not cloned yet").
  2. `repoIntel.getConventionSamples(repoId, 12)`: the top 12 files by rank (no tests, configs
     or migrations); empty → 409 "not indexed yet". Config files alone are not enough to scan.
  3. Code builds the whole input, no model involved: the config files from a fixed allowlist
     that exist at the clone root (`.eslintrc`, `.eslintrc.{json,js,cjs,yml,yaml}`,
     `eslint.config.{js,mjs,cjs,ts}`, `tsconfig.json`, `.prettierrc`,
     `.prettierrc.{json,yml,yaml,js,cjs}`, `prettier.config.{js,cjs,mjs}`) and the 12 sampled
     files. Only these paths are ever read. Each file: ≤ 400 lines and 12 000 chars (head of the
     file, so line numbers stay real); configs first, ≤ 15 000 chars together; the sample takes
     the rest of the 60 000-char total, in rank order. No sampled file readable → 409.
  4. ONE structured call `ConventionExtraction` gets the configs (section left out when there
     are none) and the sampled files, every line numbered, each file wrapped in `<untrusted>`,
     and returns `rule`, `evidence_path`, `start_line`, `end_line`, `confidence`.
  5. Grounding (code, no model call) drops a rule whose file was not read, whose lines are
     outside the file or empty; clamps the range to 15 lines and the confidence to [0, 1]; cuts
     the snippet from the real file; dedupes rules (case and spaces ignored); keeps the 12 most
     confident. A config file is valid evidence. Stored as `evidence_path = "path:start-end"`
     (`path:line` for one line).
  6. One transaction replaces the repo's non-accepted conventions with the new ones; a new rule
     equal to an accepted one is skipped. No LLM call runs inside the transaction.
  A failed LLM call (502) or a missing key leaves the stored list untouched.
  Every scan also re-stamps the accepted rows' `created_at` in the same transaction, so "last
  scan" (the newest `created_at`) moves even when a re-scan stores no new row.
- **Depends on real ranks.** The sample is repo-intel's PageRank order. On Windows the import
  graph used to come back empty (dependency-cruiser read absolute `D:\…` paths as globs), every
  file got the same rank and the sample was simply the first paths alphabetically
  (`client/src/app/agents/**`); `adapters/depgraph` now passes walkClone's files as plain paths from `baseDir`. Files whose path is
  a glob (Next.js `[id]` folders) are left out and get edges only through imports (dev-digest:
  380 edges instead of 514).
- **Code picks the files, by decision (homework criteria).** An earlier version made two model
  calls (`ConventionFileSelection` chose ≤ 8 of 40 sampled files, then `ConventionExtraction`);
  the file-selection call is gone: the input is the config allowlist + the top 12 by rank, and
  the model is called exactly once per scan. Configs only exist at the clone root (a monorepo's
  `server/tsconfig.json` is not read).
- **No output cap.** The model call sends no `maxTokens`: a reasoning model counts its
  reasoning in it, and a 4 000 cap made `deepseek-v4-flash` answer with empty content.
- **Synchronous by decision.** The scan is one model call (~10–90 s with a reasoning model)
  inside the request, rate-limited to 5 per minute. JobRunner is not used: it has no status or
  result channel the client can read, and the UI needs the result or the error at once.
- **Evidence link.** The card's `path:lines` opens
  `https://github.com/<full_name>/blob/<default_branch>/<path>#L<start>-L<end>` (`#L<n>` for one
  line) in a new tab (`rel="noopener noreferrer"`, accessible name "Open `path:lines` on
  GitHub"); the repo comes from the active repo. While the repo is unknown the path is plain
  text. The branch is the default branch the clone tracks, so lines can drift after new commits.
- **Reject** deletes the candidate (a re-scan can bring it back). Un-accept is a separate state.
- **Reword** changes only `rule` (1–300 chars); the evidence stays as extracted.
- **Create skill.** Enabled when ≥ 1 convention is accepted. Draft: name
  `<repo>-conventions` (suffixed `-2`, `-3`… when taken), a directive description, a body with
  one `##` section per accepted rule plus its `Detected in \`path:lines\`` snippet. Type is
  locked to `convention`; the skill is saved as v1 with source `extracted` and
  `evidence_files` = the accepted evidence paths; then the skill editor opens. Cancel stores
  nothing.

## Acceptance criteria
- [x] A scan of an indexed, cloned repo shows grounded candidates; each snippet matches the
      cited lines of the file.
- [x] The scan's input is built by code (root ESLint / tsconfig / Prettier configs that exist +
      the top 12 files of `getConventionSamples`); the model is called exactly once per scan;
      candidates without valid evidence are dropped by code.
- [x] Each card's evidence path links to the file and lines on GitHub (new tab).
- [x] Accept, reject, reword, accept all and deselect all persist across a reload.
- [x] Re-scan keeps accepted conventions; the page shows "last scan" from `created_at`.
- [x] "Create skill" saves a `convention` / `extracted` skill (v1) with the edited fields; it
      can be linked to an agent and appears in the review prompt.
- [x] Unindexed or uncloned repo, missing key, model failure → a clear error, data unchanged.
- [x] Tests: server-unit (grounding, budget split, prompt with / without configs, use case with
      `MockLLMProvider.structuredBySchema`: one call, sample of 12, configs included only when
      present), server-integration (routes on Postgres, a root `tsconfig.json` as evidence,
      extracted skill), client (card incl. GitHub link, page, modal, draft builder, link
      helper), e2e (empty state, read-only).

## Open questions
- none (decisions D1–D7 approved 2026-11-27, plan: `L02-homework-plan.md`).
