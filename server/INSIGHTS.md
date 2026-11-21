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

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->

## Open Questions
<!-- What is still unclear. -->
