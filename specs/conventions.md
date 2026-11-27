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
  - per-repo extraction: repo-intel sample → LLM picks files → LLM extracts rules → the server
    grounds every rule against the file lines it read;
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
  2. `repoIntel.getConventionSamples(repoId, 40)`; empty → 409 "not indexed yet".
  3. LLM step `ConventionFileSelection` picks ≤ 8 paths. Only paths from the sample are kept;
     fewer than 3 valid (or a failed step) → topped up with the highest-ranked samples.
  4. The chosen files are read from the clone (≤ 400 lines and 12 000 chars each, 60 000 in
     total). A path from the model is never read unless it is in the sample.
  5. LLM step `ConventionExtraction` gets the files with line numbers, each wrapped in
     `<untrusted>`, and returns `rule`, `evidence_path`, `start_line`, `end_line`,
     `confidence`.
  6. Grounding drops a rule whose file was not read, whose lines are outside the file or empty;
     clamps the range to 15 lines and the confidence to [0, 1]; cuts the snippet from the real
     file; dedupes rules (case and spaces ignored); keeps the 12 most confident. Stored as
     `evidence_path = "path:start-end"`.
  7. One transaction replaces the repo's non-accepted conventions with the new ones; a new rule
     equal to an accepted one is skipped. No LLM call runs inside the transaction.
  A failed LLM call (502) or a missing key leaves the stored list untouched.
  Every scan also re-stamps the accepted rows' `created_at` in the same transaction, so "last
  scan" (the newest `created_at`) moves even when a re-scan stores no new row.
- **Depends on real ranks.** The sample is repo-intel's PageRank order. On Windows the import
  graph used to come back empty (dependency-cruiser read absolute `D:\…` paths as globs), every
  file got the same rank and the sample was simply the first 40 paths alphabetically
  (`client/src/app/agents/**`); `adapters/depgraph` now passes walkClone's files as plain paths from `baseDir`. Files whose path is
  a glob (Next.js `[id]` folders) are left out and get edges only through imports (dev-digest:
  380 edges instead of 514).
- **No output cap.** The model calls send no `maxTokens`: a reasoning model counts its
  reasoning in it, and a 4 000 cap made `deepseek-v4-flash` answer with empty content.
- **Synchronous by decision.** The scan is two model calls (~10–90 s with a reasoning model) inside the request,
  rate-limited to 5 per minute. JobRunner is not used: it has no status or result channel the
  client can read, and the UI needs the result or the error at once.
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
- [x] Accept, reject, reword, accept all and deselect all persist across a reload.
- [x] Re-scan keeps accepted conventions; the page shows "last scan" from `created_at`.
- [x] "Create skill" saves a `convention` / `extracted` skill (v1) with the edited fields; it
      can be linked to an agent and appears in the review prompt.
- [x] Unindexed or uncloned repo, missing key, model failure → a clear error, data unchanged.
- [x] Tests: server-unit (grounding, use case with `MockLLMProvider.structuredBySchema`),
      server-integration (routes on Postgres, extracted skill), client (card, page, modal,
      draft builder), e2e (empty state, read-only).

## Open questions
- none (decisions D1–D7 approved 2026-11-27, plan: `L02-homework-plan.md`).
