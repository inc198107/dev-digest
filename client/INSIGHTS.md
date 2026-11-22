# client — Insights

> Lessons for this module, written via `/engineering-insights`. Read before working here.
> One entry = one actionable fact a cold reader can apply: `YYYY-MM-DD · area · what to do — why`.
> If it is obvious to anyone reading the code, do not write it. Add new entries; rewrite or delete
> an existing one only after verifying in the session that it is obsolete, and note the evidence.

## What Works
<!-- Approaches and solutions that worked here. -->

## What Doesn't Work
<!-- Dead ends and anti-patterns. The most skipped section and the most valuable one. -->

## Codebase Patterns
<!-- Conventions and architectural decisions not stated in CLAUDE.md or README.md. -->
- 2026-11-22 · [number]/_components/SeverityCounters, `SeverityBadge` · Query severity labels in tests by their DOM text ("2 Critical", "Critical") — the upper case ("CRITICAL") is only CSS `textTransform`, so `getByText("CRITICAL")` / `{ name: "2 CRITICAL" }` find nothing.
- 2026-11-21 · [number]/_components/RunHistory/RunHistory.tsx, RunTraceDrawer/TraceBody · The "{tok} tok · $cost" timeline line (commit `58c6ac7`) and the COST trace stat (`d45ab0d`) were removed on purpose for the L01 lab — not regressions; `git show` those commits to see the removed markup.

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->
- 2026-11-21 · DevDigest Design (standalone).html · Decode the bundler manifest instead of grepping the HTML — screen code is gzip+base64 in `<script type="__bundler/manifest">` (grep "Duration" → 0 hits); in Python `gzip.decompress(base64.b64decode(entry['data']))`, plus `sys.stdout.reconfigure(encoding='utf-8')` since the console is cp1251 and `py -I` ignores PYTHONIOENCODING. Key files: screen_dashboard.jsx, prdetail_runs.jsx, screen_trace.jsx, primitives.jsx (CostBadge).

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->
- 2026-11-22 · `@devdigest/shared` runtime imports · Import only types from `@devdigest/shared` in client code (`import type …`); derive value lists with a typed literal such as `Record<Severity, true>` — a value import (`Severity.options`) made the Next dev build fail with "Module not found: Can't resolve './contracts/findings.js'" (the barrel uses `.js` specifiers) while `pnpm test` and `pnpm typecheck` both passed, so open the page in `pnpm dev` after touching shared imports.

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->
- 2026-11-21 · run cost (M1) planning · Decided with user: cost on PR list (latest batch sum), on both the Agent runs Timeline and Review-runs accordion, and as a COST stat in the run drawer; reference-solution branches deliberately not consulted.
- 2026-11-22 · severity counters (L01 homework, spec `client/specs/severity-counters.md`) · Followed the homework criteria over the design's multi-toggle `Chip` row: one active level, highlighted with its own `SEV` colours; counts are taken after "Hide low confidence" so a counter equals the cards it reveals; `origin/feat/findings-by-severity` (reference solution) deliberately not consulted; this skill was run by the agent at wrap-up per CLAUDE.md, it did not fire on its own when the webpack error above was fixed.

## Open Questions
<!-- What is still unclear. -->
