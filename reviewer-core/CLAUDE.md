# reviewer-core/ — @devdigest/reviewer-core

Read first: `reviewer-core/INSIGHTS.md` (lessons). Reference: `reviewer-core/README.md`
(pipeline, public API). Prompt-writing rules: `../docs/agent-prompts/README.md`.

## Commands (run in reviewer-core/)
```sh
npm ci              # required: the server imports this package's source at runtime
npm test            # vitest, stubbed LLMProvider, no keys or network
npm run typecheck   # this is also the "build": the package never emits JS
```

## Layout
- `src/index.ts` — the only public surface
- `src/review/run.ts` — `reviewPullRequest()`: assemble → single-pass or map-reduce → reduce → ground
- `src/review/reduce.ts` — `reduceReviews`, `scoreFromFindings`, `sliceDiff`
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`
- `src/grounding.ts` — citation gate against diff hunks
- `src/llm/` — `openrouter.ts` provider, `structured.ts` (Zod → JSON Schema, parse-with-repair)
- `src/output/to-review.ts` — GitHub review payload for the future CI runner (M6)

## Conventions
- Pure engine: no DB, filesystem, GitHub or `process.env`. The only side effect is the
  injected `LLMProvider`; everything else arrives as arguments.
- Export new API only through `src/index.ts`; the server imports `@devdigest/reviewer-core`.
- Contracts come from `@devdigest/shared`, which resolves to `../server/src/vendor/shared`.
- Untrusted content (diff, PR body, repo-derived text) is always wrapped with `wrapUntrusted`;
  never interpolate it into the system message.
- The output shape is enforced by the JSON Schema in `response_format`, never by prompt text.

## Gotchas
- Any change here type-checks against the server and triggers the `server-unit` CI workflow.
- `tsconfig.json` maps `zod` to this package's own `node_modules`; removing that mapping
  creates duplicate zod types against the server copy.
- `verdict` is passed through from the model while `score` is recomputed; they can disagree.
- Map-reduce kicks in automatically above `DEFAULT_MAP_THRESHOLD_LINES` (400) changed lines
  across more than one file.
- Comments mention `agent-runner` and `@vercel/ncc`: that consumer returns in M6, it does not exist yet.

## Do not touch
- `INJECTION_GUARD` wording and the `<untrusted>` wrapping: only strengthen, with a test.
- `groundFindings` rules and `SEVERITY_PENALTY` (35/12/3): the UI, docs and score badges depend on them.
- Prompt section order in `assemblePrompt`: documented in `docs/agent-prompts/README.md`.

## Read when
- You change prompt assembly or output handling → `../docs/agent-prompts/README.md`
- You change a contract → `../server/src/vendor/shared/contracts/findings.ts` (and the client copy)
- You need a deep dive or a feature spec → `docs/`, `specs/` (template: `../specs/_TEMPLATE.md`)

## After you finish
Record lessons in `reviewer-core/INSIGHTS.md` with the `engineering-insights` skill (`/engineering-insights`).
