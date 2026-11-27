# repo-intel — Insights

> Lessons for this module, written via `/engineering-insights`. Read before working here.
> One entry = one actionable fact a cold reader can apply: `YYYY-MM-DD · area · what to do — why`.
> If it is obvious to anyone reading the code, do not write it. Add new entries; rewrite or delete
> an existing one only after verifying in the session that it is obsolete, and note the evidence.

## What Works
<!-- Approaches and solutions that worked here. -->

## What Doesn't Work
<!-- Dead ends and anti-patterns. The most skipped section and the most valuable one. -->
- 2026-11-21 · pipeline/full.ts, pipeline/incremental.ts (per-file parse watchdog) · Do not count on `withTimeout(…, MAX_PARSE_MS_PER_FILE)` to stop a slow file; a real limit needs the parse off the main thread (`worker_threads`) — `parseSymbols`/`parseReferences` are synchronous, block the event loop and finish before the timer can fire (repro: 300 ms busy loop under a 50 ms `withTimeout` resolved after 300 ms, no `TimeoutError`).

## Codebase Patterns
<!-- Conventions and architectural decisions not stated in CLAUDE.md or README.md. -->

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->
- 2026-11-27 · `src/adapters/depgraph/index.ts` `buildEdges` · When ranks look flat, check `repo_index_state.stats.edgesWritten` — on Windows dependency-cruiser read the absolute `D:\…` file paths as globs (backslashes are escapes, Next.js `[id]` a character class), threw ENOENT on a mangled path, the adapter swallowed it and every index ended with 0 edges (dev-digest: 1 distinct rank for 312 files, so `getConventionSamples` returned the first 40 paths alphabetically, all `client/src/app/**`); fixed by cruising `'.'` from `baseDir` (forward slashes) and normalising paths to POSIX: 514 edges, 158 ranks after a full re-index (test `depgraph.test.ts`). (replaces 2026-11-27 Open Question on the skewed conventions sample: answered this session)

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->

## Open Questions
<!-- What is still unclear. -->
