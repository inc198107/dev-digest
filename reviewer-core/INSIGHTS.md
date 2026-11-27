# reviewer-core — Insights

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
- 2026-11-27 · `src/llm/openrouter.ts` `completeStructured` · When it throws "structured output failed schema validation for <schema>", call the OpenAI SDK against OpenRouter with the same request and read `finish_reason` + `usage.completion_tokens_details.reasoning_tokens` — the error drops the raw answer; for the conventions scan the cause was a reasoning model (`deepseek-v4-flash`) that used all of `max_tokens` (4000) on reasoning and returned empty content.

## Recurring Errors & Fixes
<!-- Error message → cause → fix. -->

## Session Notes
<!-- Dated session summaries: what was done, what was learned. -->

## Open Questions
<!-- What is still unclear. -->
