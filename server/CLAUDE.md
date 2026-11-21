# server/ — @devdigest/api

Read first: `server/INSIGHTS.md` (lessons). Reference: `server/README.md` (API map, env vars,
review context). Indexer rules: `src/modules/repo-intel/CLAUDE.md`.

## Commands (run in server/)
```sh
pnpm dev                                          # tsx watch, :3001
pnpm typecheck
pnpm db:migrate · pnpm db:seed · pnpm db:generate # generate after editing db/schema/*.ts
pnpm exec vitest run --exclude '**/*.it.test.ts'  # unit, hermetic
pnpm exec vitest run .it.test                     # integration (testcontainers, needs Docker)
```

## Layout
- `src/modules/<name>/` — `routes.ts` (Fastify plugin) → `service.ts` → `repository.ts`,
  plus `constants.ts` / `helpers.ts`
- `src/platform/` — `container.ts` (DI root), `jobs.ts` (JobRunner), `sse.ts` (RunBus),
  `config.ts`, `errors.ts`
- `src/adapters/` — port implementations (github, git, llm, astgrep, secrets…); `mocks.ts` for tests
- `src/db/schema/*.ts` + `src/db/migrations/` (drizzle-kit)
- `src/vendor/shared/` — canonical Zod contracts and adapter interfaces

## Conventions
- New module: create `modules/<name>/routes.ts` and add one entry to `src/modules/index.ts`
  (static registry; `@fastify/autoload` is installed but intentionally unused).
- Routes use `app.withTypeProvider<ZodTypeProvider>()` with params/body schemas from
  `@devdigest/shared`; invalid input becomes 422 before the handler runs.
- Call `getContext(container, req)` in every handler and scope queries by `workspaceId`.
- Take dependencies from `container` (`container.git`, `await container.llm(id)`,
  `container.repoIntel`…); never `new` an adapter inside a service. Tests inject
  replacements via `ContainerOverrides`.
- Throw `AppError` subclasses (`NotFoundError`, `ValidationError`, `ConfigError`,
  `ExternalServiceError`); the global handler builds the `{ error: { code, message } }` envelope.
- SQL belongs in repositories. `modules/pulls` and `modules/polling` keep SQL inline in
  routes: legacy, do not copy that pattern.
- Slow or retryable work (clone, index) goes through JobRunner; register the handler inside
  the module's routes plugin, like `RepoService.registerCloneJobHandler()`.
- Expensive routes get a per-route `config.rateLimit`.

## Gotchas
- Review runs do NOT use JobRunner: `ReviewService.runReview` fires `executeRuns()` without
  await and streams through the in-memory `runBus`; cancel is checked between LLM calls.
- Clones are `--depth 1`, so `loadDiff` usually falls back to GitHub patches from `pr_files`.
- `src/platform/prompt.ts`, `grounding.ts`, `structured.ts` are re-export shims: edit `reviewer-core`.
- `src/platform/model-router.ts`, `trace-builder.ts`, `prompts.ts` are not imported anywhere yet.
- Zod errors are matched by shape in `src/app.ts` because two zod instances exist (shared vs api).

## Do not touch
- Applied files in `src/db/migrations/` and `meta/` snapshots.
- `DEFAULT_WORKSPACE_NAME` / `SYSTEM_USER_EMAIL` in `src/db/seed.ts`: auth resolves by them.
- Seed fixtures (`acme/payments-api`, PR #482, built-in agents): e2e and integration tests rely on them.

## Read when
- You add or change a route → `README.md` (API map, request & DI flow)
- You change review inputs (repo map, callers, PR body) → `README.md#review-context-non-obvious`
- You touch indexing or repo-intel data → `src/modules/repo-intel/README.md`
- You write a test → `../TESTING.md`; DB tests use `test/helpers/pg.ts` and the `.it.test.ts` suffix
- You need a deep dive or a feature spec → `docs/`, `specs/` (template: `../specs/_TEMPLATE.md`)

## After you finish
Record lessons in `server/INSIGHTS.md` with the `engineering-insights` skill (`/engineering-insights`).
