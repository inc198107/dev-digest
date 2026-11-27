# Skills for review agents

**Status:** in progress
**Milestone:** M2
**Modules touched:** server · client · e2e · reviewer-core (none: it already takes `skills: string[]`)

## Goal
Reviewers get reusable, text-only **skills** (rubrics, conventions, security rules) that live in
the database, are edited in the UI, are shared between agents and are appended to an agent's
prompt in a chosen order. Every run shows which skills it loaded and how many tokens they added.
First consumer: a new **Test Quality Reviewer** agent with four skills.

Design: `DevDigest Design (standalone)_skills.html` → "Skills Lab — Skills" (list + per-skill
editor that mirrors the Agent editor), "Agent Editor · Skills", "Run Trace · Prompt assembly".

## Scope
- In:
  - workspace-level skill CRUD, versioned body snapshots, restore;
  - "Used by" (agents linking a skill);
  - import from a Markdown file, a `.zip`/`.skill` archive or an https URL, always through a
    preview and an explicit confirmation;
  - Skills tab in the agent editor: link/unlink, drag-and-drop order;
  - enabled linked skills injected into the review prompt;
  - per-skill blocks with token counts in the run trace and the live log;
  - seeded Test Quality Reviewer, three seeded skills and fixture PR #483;
  - an importable example skill;
  - `pr-self-review` becomes manual-only.
- Out: skill evals, skill extraction from conventions (done separately: `specs/conventions.md`), a per-agent enabled flag on a link (the link itself is the per-agent switch),
  versioning the agent when its links change.

## Contract changes
- `@devdigest/shared` (server + client copies):
  - `knowledge.ts`: `SkillSource` gains `'imported_file'`.
  - new `contracts/skills.ts`:
    - `SkillName`, `MAX_SKILL_BODY_CHARS`;
    - `SkillCreateBody`, `SkillUpdateBody`;
    - `SkillUsage`, `SkillListItem`;
    - `SkillVersion`;
    - `SkillImportFileBody`, `SkillImportUrlBody`, `SkillImportPreview`.
  - `trace.ts`: `SkillBlock {id, name, type, version, tokens, text}`;
    `PromptAssembly.skill_blocks` (nullish: old traces lack it).
- DB (new migration via `pnpm db:generate`):
  - unique index `skills (workspace_id, name)`;
  - index `agent_skills (skill_id)`.
  `type`/`source` are text columns without CHECK, so the new enum value needs no SQL.
- Routes (new module `skills`):

  | Route | What it does |
  |---|---|
  | `GET /skills` | `SkillListItem[]` |
  | `POST /skills` | `201 Skill` |
  | `GET /skills/:id` | `SkillListItem` |
  | `PUT /skills/:id` | `Skill` |
  | `DELETE /skills/:id` | `{ok}` |
  | `GET /skills/:id/versions` | `SkillVersion[]`, newest first |
  | `POST /skills/:id/versions/:version/restore` | `Skill` |
  | `POST /skills/import/file` | `SkillImportPreview`; nothing is stored |
  | `POST /skills/import/url` | `SkillImportPreview`; nothing is stored |

  The existing `GET/POST /agents/:id/skills` keep their shape.

## Behaviour
- **Names.** A name is kebab-case, at most 64 characters, unique per workspace. A duplicate is
  `409 conflict`.
- **Description.** The description is the skill's interface: a directive sentence ("Flag …").
  The UI says so under the field.
- **Versions.** A skill starts at v1 with a snapshot of its body. Changing anything the model
  sees (name, description, body) bumps the version and snapshots the body. `type` and
  `enabled` are metadata and keep the version. Restore copies a snapshot's body into a new
  version.
- **Delete.** Deleting a skill removes it from every agent (FK cascade). The UI warns with the
  "Used by" count.
- **Agent Skills tab.** It lists every workspace skill, linked ones first in their order. The
  checkbox links (appends) or unlinks a skill, and dragging a linked row reorders the set. Every
  change sends `POST /agents/:id/skills {skill_ids}`.
- **Prompt.** At run time the agent's linked skills that are `enabled` are resolved in link
  order. Each one becomes one block:

  ```
  ### Skill: <name>
  > <description>

  <body>
  ```

  The blocks are passed to reviewer-core as `skills`. reviewer-core puts them in the user
  message under `## Skills / rules`, after the PR description, never in the system message.
  A disabled or unlinked skill is absent from the prompt, the trace and the log.
- **Trace and log.**
  - `prompt_assembly.skill_blocks` lists each block with its `tokens` (tiktoken `cl100k_base`).
    `prompt_assembly.skills` keeps the joined text.
  - The live log gets one `Skill loaded: <name> v<n> (+<t> tokens)` line per block plus a
    summary line.
  - The trace drawer shows "Skills loaded" in Configuration and a Skills group in Prompt
    assembly, with one block per skill and the added tokens.
- **Import.** Parsing only; nothing is stored until the user confirms with `POST /skills`.
  - **Markdown file.** Frontmatter `name`, `description`, `type` are read. Missing values fall
    back to the file name, the first paragraph and `custom`.
  - **Archive.** The core is the shallowest `SKILL.md`; without one, the single `.md` file; with
    neither, the import fails with 422. Every other entry is listed as ignored with a reason:
    `executable` for `scripts/**` and script or binary extensions, `binary`, or
    `not_skill_core`. Nothing is written to disk or executed.
  - **Limits.** Archive ≤ 1 MiB, ≤ 200 entries, ≤ 5 MiB unpacked, body ≤ 20 000 characters.
  - **URL.** https only; `github.com/…/blob/…` is rewritten to `raw.githubusercontent.com`.
    Private, loopback, link-local and CGNAT addresses are refused at connect time, so DNS
    rebinding is covered too. At most 3 redirects, each checked again; 10 s timeout; 1 MiB cap.
    The route is rate-limited.
- **Trust.** An imported skill is someone else's instructions inside the agent's prompt. The
  safeguards:
  - the preview shows a trust banner and the full body, and saving needs a confirmation;
  - the source ("Imported") stays visible on the card;
  - only the core text is kept;
  - invisible characters (Unicode default-ignorable and format characters, C0/C1 controls
    except tab and newlines) are removed from name, description and body: on import with a
    warning in the preview, and on every create and update, so the text the user reads is the
    text the model reads;
  - skills sit in the user message, not the system message;
  - the output is still constrained by the JSON Schema and the grounding gate.
  `INJECTION_GUARD` is unchanged.
- **Seed** (idempotent, by name):
  - skills `untested-branches` (rubric), `boundary-cases` (rubric) and `mocking-discipline`
    (convention), each with a v1 snapshot;
  - agent **Test Quality Reviewer**, linked to them in that order;
  - PR #483 "Add partial refunds with fee proration" in `acme/payments-api`: a branching refund
    calculator whose tests all walk the happy path (four partial-refund cases, no throw, no full
    refund, no rounding remainder), its diff taken from `pr_files`. A single happy-path test was
    too obvious: the model flagged it even without skills;
  - PR #482 is untouched.
- **Example import.** `docs/examples/skills/flaky-test-patterns/` (`SKILL.md`,
  `references/`, a harmless `scripts/detect-flaky.sh`) and its packed `.zip`.

## Lab finish (L02)
Plan: `L02-skills-lab-finish-plan.md` (outside the repo). Evals stay out of scope.
- **Navigation as in the design and the reference video.** There is no separate list page:
  `/skills` (the Skills menu item) opens the editor of the first skill (`/skills/<id>`), with the
  skill list on the left and Preview · Config · Stats · Versions on the right; Preview is the
  first and default tab. A workspace without skills gets an empty state with Add skill. The card
  grid and its side preview drawer are gone. Create and import still land on Config.
- **Body editor.** `src/components/skill-body-editor/` (promoted from the conventions modal): file
  header `<name>.md`, an "unsaved" badge, token estimate, line numbers. Used by SkillFields
  (create, import preview, Config) and the conventions modal.
- **Version notes.** `PUT /skills/:id` takes an optional `note` (≤ 200 chars, `MAX_SKILL_NOTE_CHARS`);
  it is stored in `skill_versions.note` (migration `0014`) only when the change creates a version,
  never written to `skills` and never sent to the model. Restore writes `Restored from v<N>`. A
  note-only patch is a 422. Config shows a "What changed" field when the draft changes the name,
  description or body. Versions titles a row with its note and offers **Diff** against the
  previous version (client LCS line diff, `VersionsTab/line-diff.ts`).
- **Stats.** `GET /skills/:id/stats` (`SkillStats`) and `GET /skills/stats` (`SkillStatsSummary[]`, one
  SQL statement for the cards). Window: finished (`done`) review runs of the workspace in the last
  30 days, by the DB clock. A run counts for a skill when its trace's `prompt_assembly.skill_blocks`
  contains the skill id. `pull_frequency = skill runs / runs`; `accept_rate = accepted / (accepted +
  dismissed)` over the findings of those runs; both null when the denominator is 0. A run's
  findings count for every skill it loaded (the Stats tab says so). Cards show
  "N agents · X% pull · Y% accept"; the Stats tab shows Used by, Pull frequency, Accept rate,
  Findings (30d), the agents using the skill and a findings-by-category donut.
- **Community search.** `GET /skills/community?q=` (2–100 chars, 10/min) searches `SKILL.md` files
  with GitHub code search using the user's `GITHUB_TOKEN` (SecretsProvider), then reads stars and
  language per repo (≤ 10 lookups, 10 s deadline, retries off, 10-minute cache). No token →
  `configured: false` without a network call; GitHub errors → 502. The drawer ("Search community
  skills…" in Add skill) filters by language and offers tag chips; Import opens the URL import
  preview with the hit's URL, so the trust banner and explicit save still apply.
- **Trace race.** `run-executor` saves the run trace before writing the terminal status, so a
  reader that waits for `done` always finds the trace.

## Acceptance criteria
- [x] Skill created and edited in the UI; the version grows; Versions lists the snapshots;
  Restore works (client tests + `skills.it`; editor tabs checked live).
- [x] Test Quality Reviewer has linked skills; order is changed by drag and drop and persists
  (checked live: drag, reload, ↑/↓).
- [x] An enabled linked skill appears in the trace and the live log as its own block with
  tokens; a disabled one does not (`reviews-skills.it`, `TraceBody.test`).
- [x] Import goes through the preview; `scripts/` entries are listed as not processed and never
  run (checked live with the example zip: no marker file, nothing stored before Save).
- [x] Control experiment on PR #483 (Test Quality Reviewer v3 only, `deepseek/deepseek-v4-flash`,
  2 runs each): without skills 0 and 3 findings (SUGGESTION, score 100/91), the rounding remainder
  never found; with the 4 skills 6 and 7 findings (WARNING on production lines: both throws, the
  full-refund branch, the exact-balance and rounding boundaries), score 37/16, the trace shows
  "Skills · 4 skills · +1257 tokens" and one `Skill loaded` log line per skill.
- [x] Lab finish: version notes over PUT and restore (`skills.it`), stats over seeded runs
  (`skills-stats.it`), community search with a fake client and without a token
  (`skills-community-search`, `skills.it`), trace saved before the terminal status (spy test in
  `reviews-skills.it`; three green integration runs); client: SkillBodyEditor, StatsTab,
  VersionsTab + `line-diff`, CommunitySearchDrawer, SkillCard usage line; e2e `08-skills` covers
  the Stats tab and the community drawer.
- [ ] `pr-self-review` has `disable-model-invocation: true` (done); a manual run routes both
  client and server lanes (run by the user).
- [x] Tests:
  - server-unit: `skills-domain`, `skills-service` + store contract, `skills-archive`,
    `skills-text-fetcher`;
  - server-integration: `skills.it`, `reviews-skills.it`;
  - client: SkillCard, SkillsListView, ConfigTab, ImportSkillModal, SkillsTab, TraceBody;
  - e2e: `08-skills.flow.json`.

## Open questions
- Should linking or unlinking skills bump the agent version (today only config changes do)?
- Should skill snapshots also keep name and description (`skill_versions` stores the body only)?
