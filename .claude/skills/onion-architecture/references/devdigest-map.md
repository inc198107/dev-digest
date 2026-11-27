# DevDigest: where the code sits in the rings, and the known debt

Snapshot of 2026-11-25 (skill v1.0.0). The authoritative, always-current list is what the checks
print with `bash .claude/skills/onion-architecture/scripts/check-boundaries.sh --all`; this file
explains it and gives the repayment order.

## Contents

- [1. Ring map](#1-ring-map)
- [2. The reference module: agents](#2-the-reference-module-agents)
- [3. Known debt registry](#3-known-debt-registry)
- [4. Repayment order](#4-repayment-order)
- [5. Contract drift between the two shared copies](#5-contract-drift-between-the-two-shared-copies)

## 1. Ring map

| Ring | server/ | reviewer-core/ |
|---|---|---|
| Domain | `modules/*/domain.ts`, `modules/*/constants.ts`, `vendor/shared/contracts/*`, `pulls/{cost,status,findings}.ts`, `repo-intel/pipeline/rank.ts` | `prompt.ts`, `grounding.ts`, `review/reduce.ts`, `output/to-review.ts` |
| Application | `modules/*/service.ts`, `modules/*/ports.ts`, `vendor/shared/adapters.ts` (ports), `reviews/{run-executor,diff-loader}.ts`, `repo-intel/pipeline/{full,incremental,walk,repo-map}.ts` | `review/run.ts` (`reviewPullRequest`) |
| Infrastructure | `modules/*/repository.ts`, `reviews/repository/*`, `adapters/*`, `db/*`, `platform/{jobs,sse,resilience,price-book,run-logger}.ts` | `llm/openrouter.ts`, `llm/structured.ts` |
| HTTP | `modules/*/routes.ts`, `modules/*/schemas.ts`, `modules/_shared/*`, error handler in `app.ts` | — |
| Composition root | `app.ts`, `server.ts`, `platform/container.ts`, `modules/index.ts` | `index.ts` (public barrel; the server is its root) |

Unclassified on purpose: `modules/*/helpers.ts` (legacy kind-named bucket: pure rules go to
`domain.ts`, row mapping to the repository), `platform/{config,errors}.ts`, the reviewer-core
re-export shims `platform/{prompt,grounding,structured}.ts`, and the unused
`platform/{model-router,trace-builder,prompts}.ts`.

Ring patterns live in `server/.onion-rings.cjs`.

## 2. The reference module: agents

`server/src/modules/agents/` was refactored as the pilot and follows every rule:

| File | Ring | What to copy |
|---|---|---|
| `domain.ts` | domain | `isConfigChange`, `planVersion`, `nextSkillOrder`: pure, take contract shapes |
| `ports.ts` | application | `AgentsStore`, `AgentsUnitOfWork`, `ListModels` in contract vocabulary |
| `service.ts` | application | `AgentsService(deps)`: load → decide → persist; create/update in one `uow.run` |
| `repository.ts` | infrastructure | `AgentsRepository implements AgentsStore` on `DbExecutor`; row mapping; `DrizzleAgentsUnitOfWork` |
| `schemas.ts` | http | path params and list wrappers |
| `routes.ts` | http | builds the service from `container.agentsRepo/agentsUow/llm`; every route declares `response` |
| `platform/container.ts` | root | `agentsRepo`, `agentsUow` getters |
| `test/agents-domain.test.ts`, `test/agents-service.test.ts`, `test/agents-versions.it.test.ts` | tests | domain unit, fakes of own ports, real Postgres |

Request bodies moved to `@devdigest/shared` (`AgentCreateBody`, `AgentUpdateBody`,
`AgentSkillsBody`, both copies). One deliberate leftover: `AgentsRepository.getById` and
`listEnabled` still return rows because `reviews` reads agents through `container.agentsRepo`.

## 3. Known debt registry

Counts are the baseline entries recorded on 2026-11-25.

### Dependency rings (dependency-cruiser, 60)

| Rule | Count | Where |
|---|---|---|
| `application-not-to-outer-rings` | 30 | `reviews/{service,run-executor,diff-loader}.ts` → container, repository, `db/rows`, `db/schema`, `run-logger`, `adapters/git/diff-parser`; `repos/service.ts` → container, repository; `repo-intel/service.ts` and `pipeline/{full,incremental,repo-map}.ts` → container, repository, `resilience`, astgrep/extract/tokenizer adapters |
| `http-not-to-infrastructure` | 9 | `pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts` → `drizzle-orm`, `db/schema`; `pulls/routes.ts` → its repository |
| `adapters-only-from-composition-root` | 9 | repo-intel `service.ts` + `pipeline/*` → astgrep, codeindex extract, tokenizer; `reviews/diff-loader.ts` → `diff-parser`; `reviewer-core/test/run.test.ts` → mocks |
| `core-no-io-libraries` | 5 | repo-intel `service.ts`, `pipeline/{full,incremental,walk}.ts` → `fs`, `fs/promises` |
| `adapters-not-to-modules` | 3 | `adapters/{astgrep,depgraph}` → `modules/repo-intel/constants`; `adapters/auth/local.ts` → `db/seed` |
| `domain-not-to-outer-rings` | 1 | `repo-intel/pipeline/rank.ts` → `repo-intel/repository.ts` (type import) |
| `no-cross-module-internals` | 1 | `repos/service.ts` → `repo-intel/constants.ts` |
| `no-test-doubles-in-src` | 1 | `adapters/index.ts` re-exports `mocks.ts` |
| `reviewer-core-stays-core` | 1 | `reviewer-core/test/run.test.ts` → `server/src/adapters/mocks.ts` |

### Conventions (ast-grep, 57)

| Rule | Count | Where |
|---|---|---|
| `route-declares-response` | 26 | `reviews/routes.ts` ×10, `pulls` ×4, `repos` ×4, `settings` ×4, `repo-intel` ×2, `polling` ×1, `workspace` ×1 |
| `core-no-ambient-io` | 26 | `repo-intel/pipeline/full.ts` ×8, `incremental.ts` ×7, `repo-intel/service.ts` ×3, `reviews/run-executor.ts` ×7, `reviews/service.ts` ×1 (mostly `Date.now()` for timings) |
| `service-takes-narrow-deps` | 5 | `reviews/service.ts`, `reviews/run-executor.ts` ×2, `repos/service.ts`, `repo-intel/service.ts` |

### Not machine-checked

- **No transactions** in multi-write paths: `pulls/routes.ts:196-230`, `reviews/repository/run.repo.ts:103-110`, `repo-intel/repository.ts:246-249` + `pipeline/full.ts:204-247`, `settings/routes.ts:52-60`.
- **Missing workspace scoping:** `reviews/routes.ts` cancel/trace (`getRunTrace(runId)`), `repo-intel/routes.ts` (no ownership check on `repoId`), `reviews/service.ts` `reviewsForPull(prId)`.
- **Duplicated contracts:** `reviews/helpers.ts` `ReviewDto`/`ReviewDtoFinding` vs shared `ReviewRecord`/`FindingRecord`; the facade `reviews/repository.ts` re-declares `run.repo.ts` value types.
- **HTTP knowledge in errors:** `AppError` carries `statusCode`; the mapping should move to the handler's table.
- **Ports declared next to implementations:** `DepGraph` (`adapters/depgraph`), `Tokenizer` (`adapters/tokenizer`); stale path comment in `vendor/shared/adapters.ts` ("apps/api/src/adapters").
- **Services built twice:** `repo-intel/routes.ts:29` creates a second `RepoIntelService` although `container.repoIntel` exists; `container.reviewRepo` is never used (reviews builds its own).

## 4. Repayment order

Pay debt when a task touches the code anyway; each step is small and independently shippable.

1. **Response schemas** on routes you touch (cheap, prevents leaks): add `response` with the shared contract.
2. **Narrow deps for services** (`reviews`, `repos`, `repo-intel`): introduce `ports.ts` + a `deps` object; the routes plugin wires from the container. Copy the agents pilot.
3. **Inline SQL out of legacy routes** (`pulls`, `polling`, `settings`, `workspace`) into repositories + use cases, endpoint by endpoint; add a unit of work where several writes happen.
4. **Adapters out of repo-intel's pipeline**: receive astgrep/extract/tokenizer/fs through ports from the container; move `repo-intel/constants` values needed by adapters into the adapter config.
5. **reviews row types**: give reviews an agents facade returning `Agent`, map runs/reviews in repositories.
6. **Clock injection** in `run-executor` and the repo-intel pipeline (`now` dep) once they have narrow deps.

After removing debt, refresh the baselines (the checks say when entries no longer occur):
`./node_modules/.bin/depcruise … --output-type baseline --output-to .dependency-cruiser-known-violations.json`
in `server/`, and `node …/check-conventions.mjs --update-baseline`.

## 5. Contract drift between the two shared copies

`client/src/vendor/shared` has drifted from the canonical `server/src/vendor/shared` (recorded in
`server/.shared-parity-known.json`; `client/CLAUDE.md` mentions it too):

| File | Drift |
|---|---|
| `adapters.ts` | client lacks `sessionId` on `StructuredRequest`, `'openrouter'` in `LLMProvider.id`, `CommitFile` and other newer interfaces |
| `contracts/knowledge.ts` | client lacks `AgentVersionConfig`/`AgentVersion`; comments differ |
| `contracts/eval-ci.ts` | client lacks `AgentManifest`; `provider` enum without `'openrouter'` |
| `contracts/productionize.ts` | `provider` enum without `'openrouter'` |

Fixing it is a client task (sync the files, run `pnpm typecheck` and tests in `client/`), then
refresh the parity baseline with `node …/check-shared-parity.mjs --update-baseline`.
