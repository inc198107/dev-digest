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
- 2026-11-21 · [number]/_components/RunHistory/RunHistory.tsx, RunTraceDrawer/TraceBody · The "{tok} tok · $cost" timeline line (commit `58c6ac7`) and the COST trace stat (`d45ab0d`) were removed on purpose for the L01 lab — not regressions; `git show` those commits to see the removed markup.

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->
- 2026-11-21 · DevDigest Design (standalone).html · Decode the bundler manifest instead of grepping the HTML — screen code is gzip+base64 in `<script type="__bundler/manifest">` (grep "Duration" → 0 hits); in Python `gzip.decompress(base64.b64decode(entry['data']))`, plus `sys.stdout.reconfigure(encoding='utf-8')` since the console is cp1251 and `py -I` ignores PYTHONIOENCODING. Key files: screen_dashboard.jsx, prdetail_runs.jsx, screen_trace.jsx, primitives.jsx (CostBadge).

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->
- 2026-11-21 · run cost (M1) planning · Decided with user: cost on PR list (latest batch sum), on both the Agent runs Timeline and Review-runs accordion, and as a COST stat in the run drawer; reference-solution branches deliberately not consulted.

## Open Questions
<!-- What is still unclear. -->
