# e2e — Insights

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

## Tool & Library Notes
<!-- Dependency quirks: versions, flags, platform issues. -->

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->
- 2026-11-21 · scripts/e2e.sh · Check `e2e/node_modules` and a global `agent-browser` BEFORE running the script — it boots Postgres + API + web (~1 min) and only then runs `cd e2e && npm test`, which fails with `"tsx" is not recognized as an internal or external command` (garbled cp866 on a RU-locale console) when e2e deps are missing; fix: `cd e2e && npm install`, plus `npm i -g agent-browser && agent-browser install`.

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->

## Open Questions
<!-- What is still unclear. -->
