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
- 2026-11-27 · `src/adapters/depgraph/index.ts` `buildEdges` · When ranks look flat, check `repo_index_state.stats.edgesWritten`; give cruise walkClone's files as plain paths relative to a forward-slash `baseDir`, never as globs or `'.'` — absolute `D:\…` paths were read as globs on Windows (ENOENT on a mangled path, swallowed: 0 edges for every repo), cruising `'.'` follows symlinks and ignores walkClone's bounds, and a glob-named path (`app/[id]/page.tsx`, even escaped as `[[]id[]]`) is expanded by a recursive readdir of its prefix that follows links and runs once per file. Glob-named files are left out (`isGlobPath`) and reached only through imports: dev-digest 0 → 380 edges (514 with them). Tests `depgraph.test.ts` (loop junctions under `src/` and the glob prefix `app/`). (replaces 2026-11-27 entries that recommended `'.'` and then literal globs: security re-review findings, both reproduced in this session)

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->

## Open Questions
<!-- What is still unclear. -->
