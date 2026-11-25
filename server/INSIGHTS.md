# server — Insights

> Lessons for this module, written via `/engineering-insights`. Read before working here.
> One entry = one actionable fact a cold reader can apply: `YYYY-MM-DD · area · what to do — why`.
> If it is obvious to anyone reading the code, do not write it. Add new entries; rewrite or delete
> an existing one only after verifying in the session that it is obsolete, and note the evidence.

## What Works
<!-- Approaches and solutions that worked here. -->

## What Doesn't Work
<!-- Dead ends and anti-patterns. The most skipped section and the most valuable one. -->
- 2026-11-21 · src/platform/resilience.ts `withTimeout`, src/platform/jobs.ts JobRunner · Do not treat `withTimeout` as cancellation; if work must really stop, pass an `AbortSignal` into the handler — it is only `Promise.race`, so after `TimeoutError` the work keeps running (repro: 200 ms task under a 50 ms timeout still completed), JobRunner marks the job `failed` and frees the queue slot while the handler continues, and `withRetry` never retries it (`TimeoutError` has no `status`/`code`).

## Codebase Patterns
<!-- Conventions and architectural decisions not stated in CLAUDE.md or README.md. -->
- 2026-11-25 · src/modules/reviews/run-executor.ts:243-248, src/db/schema/runs.ts:33 · Treat run cost as persisted: `completeAgentRun` writes reviewer-core's `ReviewOutcome.costUsd` to `agent_runs.cost_usd` (re-added on `feat/run-cost`, see Session Notes); the L01 removal in `d45ab0d` is history only. (replaces 2026-11-21: "missing run cost is intentional" — verified this session: run-executor.ts:248 passes `costUsd`, schema/runs.ts:33 declares `cost_usd`)
- 2026-11-21 · src/modules/reviews/repository.ts · When adding a field to `createAgentRun` / `completeAgentRun`, edit the inline `values` type in both the facade `repository.ts` and `repository/run.repo.ts` — the facade re-declares the type instead of deriving it from runRepo.

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->
- 2026-11-25 · server/ with pnpm v11 · Call binaries as `./node_modules/.bin/<tool>` when you pipe their output — `pnpm exec` first prints "Already up to date / Done in 27ms using pnpm v11.22.0" to stdout, so `pnpm exec depcruise --output-type json | node -e 'JSON.parse(…)'` failed with `Unexpected token 'A', "Already up"…`.
- 2026-11-25 · fastify-type-provider-zod 4.0.x `serializerCompiler` (dist/src/core.js:89) · Before adding a `response` schema to an existing route, check that every returned value satisfies it (enums like `provider`, `.int()` numbers, nullish fields) — the serializer safeParses the payload and throws `ResponseSerializationError`, which `app.ts` turns into a 500, so a schema stricter than the data breaks a working route; fields not in the schema are dropped silently.

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->
- 2026-11-22 · src/modules/reviews/diff-loader.ts `loadDiff`, src/modules/pulls/routes.ts `GET /pulls/:id` · Call `GET /pulls/:id` (or open the PR page) before `POST /pulls/:id/review` on a freshly polled PR — polling does not fill `pr_files`, only the detail route does, and the clone lacks the PR head SHA, so the run reviews an empty diff (trace "Diff ready — 0 changed file(s)", ~7k tokens in) and the agent approves with score 100; after one GET the same run sent 58k tokens.
- 2026-11-21 · `pnpm dev` (tsx watch) · Do not `git stash` in this tree while the dev API runs, or `touch src/server.ts` afterwards — `tsx watch` restarted on the stashed (old) sources and did not restart again after `stash pop`, so the API silently served old code (symptom: responses lacked the new `cost_usd` field); after pulling a schema change also run `pnpm db:migrate`, or the reloaded API fails on the missing columns.
- 2026-11-25 · test/indexer-pipeline.test.ts · On Windows expect 6 failures — 5 in `runIncremental` plus `runFullIndex > walks, parses, persists…` — with `ENOENT … repo-intel-{inc,full}-*\src\*.ts` and do not chase them as a regression — they reproduce with every change stashed; the `writeFileAt` helper finds the parent dir via `lastIndexOf('/')`, so `mkdir` is skipped for backslash paths. (replaces 2026-11-21: "6 failures in `runIncremental`" — two runs this session listed `runFullIndex` among the 6, with `ENOENT … repo-intel-full-*\src\util.ts`)

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->
- 2026-11-21 · run cost (M1) · Implemented on branch `feat/run-cost` (spec `specs/run-cost.md`): `agent_runs.cost_usd` + `batch_id` (migration `0010_handy_morg`), PR-list Cost = sum of the latest review batch via `modules/pulls/cost.ts` + `modules/pulls/repository.ts`; reserved `multi_agent_runs` belongs to N4 Multi-Agent and is not reused. (replaces 2026-11-21: "Plan drafted, not yet approved" — plan approved and implemented this session)

- 2026-11-25 · onion-architecture skill · Added `.claude/skills/onion-architecture` with local checks only (no CI, user decision): dependency-cruiser (`.dependency-cruiser.cjs`, rings in `.onion-rings.cjs`), ast-grep conventions, shared-copy parity, and a PostToolUse hook in `.claude/settings.json`; recorded baselines of 60 / 57 / 4 known violations; refactored `modules/agents` as the reference module (narrow deps, `domain.ts`, `ports.ts`, `DrizzleAgentsUnitOfWork`, response schemas, request bodies moved to `@devdigest/shared`).

## Open Questions
<!-- What is still unclear. -->
- 2026-11-21 · src/modules/reviews/routes.ts `GET /runs/:id/trace` · Should the trace lookup be workspace-scoped? The handler calls `getContext` but discards it, and `getRunTrace(runId)` selects by run id only, unlike `listRunsForPull` / `deleteAgentRun` — harmless under the single-workspace no-auth provider, a cross-workspace read once auth exists.
