# Run cost

**Status:** in progress
**Milestone:** M1
**Modules touched:** server · client · e2e (reviewer-core: none — it already returns `costUsd`)

## Goal
Show what each AI review cost in USD — per agent run, per review run, and per PR (latest
review batch) — so users see spend where they launch and inspect reviews.

Design: `DevDigest Design (standalone).html` → "Pull Requests · Run Review + auto-status + Cost",
"PR Detail · Agent runs (timeline + review runs)", "Run Trace · completed".

## Scope
- In: persist per-run cost; review batch id; cost on the PR list, the run timeline, the
  review-run accordion and the run trace Stats.
- Out: backfill of historical runs (they show "—"); cost of failed/cancelled runs (tokens spent
  before a failure are not tracked today); budgets/alerts; agent/CI cost dashboards (M7/M8);
  the reserved `multi_agent_runs` table stays untouched (it belongs to N4 Multi-Agent Review).

## Contract changes
- DB (migration 0010 via `pnpm db:generate`):
  - `agent_runs.cost_usd double precision NULL`
  - `agent_runs.batch_id uuid NULL` (no FK; one id per `POST /pulls/:id/review`)
- `@devdigest/shared` (server + client copies):
  - `RunStats.cost_usd: number | null | undefined` (nullish: old jsonb traces lack it)
  - `RunSummary.cost_usd: number | null`
  - `PrMeta.cost_usd: number | null | undefined` (list endpoint only, like `score`)
  - `ReviewRecord.cost_usd: number | null | undefined`
- Routes (shape only, no new routes): `GET /repos/:id/pulls`, `GET /pulls/:id/runs`,
  `GET /pulls/:id/reviews`, `GET /runs/:id/trace` gain `cost_usd`.

## Behaviour
- Run cost = `ReviewOutcome.costUsd` from reviewer-core (OpenRouter-reported `usage.cost`, else
  the `PriceBook` estimate, else null). Written when the run is `done`; `null` on
  failed / cancelled / pre-work failure.
- PR cost = the latest batch, i.e. the batch of the newest run among batches that have ≥ 1
  `done` run: the sum of that batch's `done` runs with a non-null `cost_usd`. All null → null.
  Runs with `batch_id IS NULL` (pre-migration) are ignored. Computed on read, so deleting a run
  updates the sum. A batch still in progress shows the partial sum of its finished runs.
- Display: `null` → "—" (never "$0"); a known zero (free model) → "$0.00".
  Format: `< $0.01` → 2 significant digits ($0.000057, $0.0013) — real deepseek-v4-flash
  runs cost ~$0.00005, so a fixed 4 dp would hide them; `< $1` → 3 dp ($0.014);
  otherwise 2 dp ($1.23); `0 < usd < $0.000001` → "<$0.000001".
- The timeline shows `{tokens_in + tokens_out} tok · {cost}` only for `done` runs.
- The PR list refreshes after a run settles or is deleted (query invalidation), not only on
  its 60 s poll.

## Acceptance criteria
- [x] A new review run stores `agent_runs.cost_usd` and `batch_id`; trace Stats show COST.
- [x] The PR list has a "Cost" column = latest batch sum; "—" for never-reviewed / unknown.
- [x] A timeline row shows "N tok · $X" under the time; the accordion header shows the cost
      badge (the accordion has no component test — typecheck only).
- [x] Old runs / traces without a cost render "—" and still parse.
- [ ] Tests: server-unit (batch-cost helper, contracts) ✔, server-integration (`reviews.it`) ✔,
      client (`formatUsd`, `CostBadge`, `PRRow`, `RunHistory`, `RunTraceDrawer`) ✔,
      reviewer-core typecheck ✔, e2e PR-list flow — step added to `02-repo-pulls-detail`,
      not yet run (needs the global `agent-browser` CLI).
- [x] Manual check in the running app with a real `OPENROUTER_API_KEY` (2026-11-21, Claude in
      Chrome, acme/payments-api PR #482, 3 agents in one batch: runs $0.000065 / $0.000049 /
      $0.000026, PR list $0.00014, trace COST $0.000026).

## Open questions
- None blocking. Later: track the cost of failed runs (partial usage).
