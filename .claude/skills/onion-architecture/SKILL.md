---
name: onion-architecture
description: Onion Architecture (ports and adapters) for TypeScript backends on Fastify 5, Drizzle ORM, Zod 3, Postgres + pgvector, Vitest and LLM SDKs — decides which ring backend code belongs to and which way dependencies point. Covers domain rules and value objects, use cases (services), ports, Drizzle repositories and row mapping, transactions and unit of work, thin Fastify routes with Zod request/response schemas, error mapping, the composition root and DI, LLM/GitHub/git/filesystem adapters, background jobs, cross-module access, tests per ring, and enforcing boundaries with dependency-cruiser. Use whenever creating, moving, splitting or reviewing backend code (server/, reviewer-core/) — a new module, route, service, repository, adapter, port, table-backed feature or LLM call — or when asking where backend code should go, even if "onion" or "architecture" is not mentioned. Not for Fastify, Drizzle or Zod API details (fastify-best-practices, drizzle-orm-patterns, zod) or table design (postgresql-table-design).
metadata:
  version: "1.0.0"
---

# Onion Architecture for the backend

Decides **which ring backend code belongs to and which way its imports point** on a Fastify 5 +
Drizzle 0.38 + Zod 3 + Postgres/pgvector + Vitest stack with LLM adapters. The goal: business
rules and use cases compile, run and test without Fastify, Postgres, the network or the disk.

This skill is about *placement and dependency direction*. For framework APIs use
`fastify-best-practices`, `drizzle-orm-patterns`, `zod`; for tables and indexes
`postgresql-table-design`; for type-level questions `typescript-expert`.

## 1. Overrides of other skills

Where another skill's advice conflicts with the rings, this skill wins:

| Advice elsewhere | Do this instead |
|---|---|
| `fastify-best-practices`: inject services and repositories with `fastify.decorate(...)`; repositories as plugins | The only decorator is `container`. Routes plugins build the use case from container-provided dependencies (§7). |
| `fastify-best-practices`: SQL inside plugins, decorators or handlers | SQL lives only in repositories (infrastructure). |
| `fastify-best-practices`: `@fastify/autoload` folder layout | Static registry in `src/modules/index.ts`. |
| `drizzle-orm-patterns`: services call `class XRepository { constructor(db: typeof db) }` directly | The service sees a port interface; the repository implements it and is built in the composition root. |
| Any source: open a transaction in the controller or the repository | The use case owns the transaction through a unit-of-work port (§8). |

## 2. Precedence

1. **The module's own docs win.** Read `<module>/CLAUDE.md` and `INSIGHTS.md` (`server/`,
   `reviewer-core/`, `server/src/modules/repo-intel/`). They already encode these rings; where
   they are more specific (the repo-intel facade "degrades instead of throwing"), follow them.
2. **Then the reference module, not the nearest neighbour.** `server/src/modules/agents/` is
   the pilot that follows every rule here (narrow deps, `domain.ts`, `ports.ts`, unit of work,
   response schemas, fake-based tests). Most other modules are known debt listed in
   [devdigest-map.md](references/devdigest-map.md): don't copy their service-locator
   constructors, inline SQL or schema-less routes.
3. **Then this skill.**

Legacy code is not restructured unless the user asks. When a change lands in a legacy file, put
the *new* logic in the right ring, leave the rest, and list the remaining debt as a follow-up.
A new narrow-deps use case inside a legacy module goes next to the legacy class in that module's
`service.ts` (or `application/<name>.ts` once it has ring folders): a free-named file escapes the
checks.
The boundary check (§11) only fails on new violations, so "don't make it worse" is enforced.

## 3. The rings

```
composition root ─ platform/container.ts · app.ts · server.ts · modules/index.ts  (wires everything)
 ├─ http (driving adapters) ─ routes.ts · schemas.ts · central error handler
 ├─ infrastructure (driven adapters) ─ repository.ts · src/adapters/* · src/db/* · jobs/sse/resilience
 │
 └──▶ application ─ service.ts (use cases) · ports.ts · vendor/shared/adapters.ts
        └──▶ domain ─ domain.ts · constants.ts · @devdigest/shared contracts · reviewer-core engine
```

| Ring | Holds | May import | Never imports |
|---|---|---|---|
| **Domain** (center) | Pure rules, value objects, branded ids, Zod data contracts, literals, prompt builders | domain, `zod`, pure exports of `@devdigest/reviewer-core` (e.g. `wrapUntrusted`) | Anything else; no I/O, no clock, no `process.env` |
| **Application** | Use cases (one public method per user intent), ports (interfaces in domain vocabulary), application errors | domain, application, `platform/errors.ts` | Repositories, adapters, `db/`, `drizzle-orm`, `fastify`, SDKs, `node:fs`, the container |
| **Infrastructure** | Drizzle repositories, row ↔ domain mapping, unit of work, adapters for LLM, GitHub, git, fs, ast-grep, tokenizer, secrets | everything inner + SDKs | http, other modules' internals |
| **HTTP** | Fastify routes plugins, Zod params/body/response, request context, job handlers | application, domain, `fastify` | Repositories, adapters, `db/`, `drizzle-orm` |
| **Composition root** | Builds adapters, repositories and use cases; registers modules | anything | — (nothing imports it except types) |

Two consequences matter most:

- **The core owns the ports.** An interface is declared where it is *used* (application or
  `@devdigest/shared`) in the core's vocabulary, and implemented outside. Port signatures never
  mention Drizzle, Fastify or SDK types.
- **Only the composition root says `new` to an adapter or repository.** Everyone else receives
  what they need.

## 4. Workflow

Copy this checklist and track it:

- [ ] Read `<module>/CLAUDE.md` and `INSIGHTS.md`; open `modules/agents/` as the analog.
- [ ] New module? Scaffold it: `node .claude/skills/onion-architecture/scripts/new-module.mjs <name>`
      (ring files + fake-based tests; it prints the wiring steps).
- [ ] Classify every piece with the table in §6 before writing code.
- [ ] **Contract first:** request/response shapes the client sees are Zod schemas in
      `@devdigest/shared`, changed in **both** copies (`server/src/vendor/shared`,
      `client/src/vendor/shared`).
- [ ] Write the domain rule as a pure function and its unit test.
- [ ] Write the use case against ports; add a port only for an external dependency or a
      second implementation (a test fake counts).
- [ ] Implement the port in infrastructure (repository or adapter) and wire it in the
      composition root.
- [ ] Write the thin route with params/body/**response** schemas.
- [ ] Run the boundary check, fix, repeat (§11). Then typecheck and tests.

## 5. Core principles

1. **Dependencies point inward only.** Inner rings never import outer ones, not even for types. *(Palermo; Martin)*
2. **The core owns its ports;** adapters translate, they don't decide. *(Palermo 3; Graça; Cockburn)*
3. **One composition root, Pure DI.** Constructor arguments, no service locator: a use case gets
   the 2–4 things it needs, never the whole `Container`. *(Seemann; Fowler DI)*
4. **Routes are thin driving adapters:** parsed input → one use case call → mapped result. No
   `request`/`reply` below the route. *(nodebestpractices; Practica)*
5. **Parse at the edge.** Zod validates params, body, env, LLM output and external responses
   once; the core trusts the types. *(King, Parse don't validate)*
6. **Rows never leave the repository.** Repositories return domain/contract shapes; every route
   declares a `response` schema. *(Martin; Stemmler; Fastify serialization)*
7. **The use case owns the transaction;** one transaction per business operation, never across
   an external API call. *(Stafford, Service Layer; Fowler, Aggregate)*
8. **External systems are driven adapters** with explicit timeouts and retries; their errors
   become application errors at the adapter. *(Fowler, Gateway)*
9. **Functional core, imperative shell:** read (I/O) → decide (pure) → write (I/O). Pass time,
   ids and randomness in. *(Bernhardt; Seemann, Dependency rejection)*
10. **Test by ring:** pure tests for the domain, fakes of your own ports for use cases, real
    Postgres for repositories, `app.inject` for routes. Don't mock what you don't own. *(Hynek; Fowler)*
11. **Size to fit, never invert.** A CRUD slice may be a transaction script in the use case; it
    still never reaches outward. *(Bogard; Stemmler; Palermo 4)*

## 6. Where does it go?

| I have… | Put it in… (ring) |
|---|---|
| Business rule, calculation, state transition | pure function in `domain.ts` (domain) |
| Value object, branded id, closed set of values | `domain.ts`: Zod `.brand<>()` / `as const` (domain) |
| Literal used by the module | `constants.ts`: literals only, no imports from outer rings (domain) |
| Request/response shape the client reads | Zod schema in `@devdigest/shared`, both copies (domain) |
| Entity shape no client reads yet | Zod schema in the module's `domain.ts`; move it to shared when the client needs it (domain) |
| HTTP-only plumbing (path params, list wrappers) | `schemas.ts` or `modules/_shared/schemas.ts` (http); ports and services never import it |
| One user intent (create, rename, suggest…) | method on the module's use-case class in `service.ts` (application) |
| What the use case needs from outside | interface in `ports.ts`; cross-package ports in `@devdigest/shared` `adapters.ts` (application) |
| Drizzle query, `sql`, pgvector search | `repository.ts`, every query scoped by `workspaceId` (infrastructure) |
| Row type (`$inferSelect`, `AgentRow`) | `src/db/rows.ts` / repository only; never in a port or service signature (infrastructure) |
| Row → domain/contract mapping | the repository, or a mapper beside it (infrastructure) |
| Several writes that must succeed together | use case calls a unit-of-work port; `db.transaction` lives in infrastructure (§8) |
| New table or column | `src/db/schema/*.ts` + `pnpm db:generate` (infrastructure; design: `postgresql-table-design`) |
| Call to GitHub, git, the filesystem, ast-grep, tokenizer | adapter in `src/adapters/<name>/` behind a port, built in `container.ts` (infrastructure) |
| LLM call | the `LLMProvider` port from `container.llm(id)`, output parsed by a Zod schema (§8); the model id is a dep too (constant or resolved at the root) |
| Prompt for a module's LLM feature | pure builder in the module's `domain.ts`; untrusted text wrapped with reviewer-core's `wrapUntrusted`; caps and dedupe of the output are domain functions, not prompt text |
| Prompt assembly, grounding, scoring | `reviewer-core` (domain/application core; see its CLAUDE.md) |
| Secret (API key, token) | `SecretsProvider` port only; never `process.env` or config (infrastructure) |
| Non-secret config | `platform/config.ts` (Zod-parsed env), passed to adapters by the root |
| Current time, ids, randomness | injected (`now: () => Date`, `newId`) into the use case; passed as values into domain functions |
| Error the user can act on | throw an `AppError` subclass from `platform/errors.ts` in the use case; the handler in `app.ts` maps it. A new kind of outcome (e.g. 409 conflict) gets a new subclass there: the only place a status code is attached |
| Mapping errors to HTTP status | only the central error handler |
| Slow or retryable work | JobRunner job; register the handler in the routes plugin; the handler calls a use case |
| Progress events, SSE | use case emits through a callback/port (`onEvent`); RunBus stays infrastructure |
| Data owned by another module | its facade (`index.ts`/`types.ts`, e.g. `container.repoIntel`). No facade yet: declare a narrow read port in *your* `ports.ts`, add the query to the owner's repository, expose it through a container getter. Never query its tables yourself |
| Test double for a port you own | in-memory fake in the test (or `adapters/mocks.ts` for shared ports) |

## 7. Module layout

Default for new modules — rings live in files; split into folders only when a module grows:

```
src/modules/<name>/
├── routes.ts       # http: Fastify plugin; builds the use case from container deps
├── schemas.ts      # http: route-only Zod (params, list wrappers); contracts live in shared/domain
├── service.ts      # application: use-case class, constructor takes narrow deps
├── ports.ts        # application: interfaces the service needs (repository, unit of work, gateways)
├── domain.ts       # domain: pure rules, value objects, module-local entity schemas
├── constants.ts    # domain: literals
├── repository.ts   # infrastructure: Drizzle, implements the port, maps rows
└── index.ts        # optional public facade for other modules
```

**Growth path:** when one ring holds more than ~3 files, move them into `domain/`, `application/`,
`infrastructure/`, `http/` (the boundary rules already match these folder names). Don't create
empty rings: a module without business rules has no `domain.ts`.

**Wiring pattern** (container builds infrastructure; the routes plugin composes the use case):

```ts
// ports.ts — application: core vocabulary, no Drizzle types
export interface LabelsStore {
  list(workspaceId: string): Promise<Label[]>;
  insert(workspaceId: string, input: NewLabel): Promise<Label>;
}
export interface LabelsUnitOfWork {
  run<T>(work: (store: LabelsStore) => Promise<T>): Promise<T>;
}

// service.ts — application
export interface LabelsServiceDeps {
  store: LabelsStore;
  uow: LabelsUnitOfWork;
  llm: () => Promise<LLMProvider>;
}
export class LabelsService {
  constructor(private readonly deps: LabelsServiceDeps) {}
}

// routes.ts — http
export default async function labelsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new LabelsService({
    store: container.labelsRepo,
    uow: container.labelsUow,
    llm: () => container.llm('openrouter'),
  });
  // handlers: getContext → service.method(...) → return
}
```

Tests construct `new LabelsService({ store: fakeStore, uow: { run: (w) => w(fakeStore) }, … })`:
no `Container`, no monkey-patching private fields. The real thing, end to end:
`modules/agents/{ports,service,repository,routes}.ts`, `platform/container.ts` (`agentsUow`),
`test/agents-service.test.ts` (fakes) and `test/agents-versions.it.test.ts` (real Postgres).

## 8. Tool bindings

Details and code: the reference files in §12.

- **Fastify 5** (http): one encapsulated routes plugin per module, registered in `modules/index.ts`.
  `withTypeProvider<ZodTypeProvider>()` in every plugin; declare `params`, `body`/`querystring`
  **and** `response`. Handlers call `getContext(container, req)`, one use case, return the
  result. Never `reply.code()` for business errors: throw. → [http-edge.md](references/http-edge.md)
- **Zod 3:** contracts in `@devdigest/shared`; `z.infer` for types; `.brand<>()` for ids. The
  Fastify bridge is `fastify-type-provider-zod` **4.x** (Zod 3 line), not
  `@fastify/type-provider-zod` (Zod ≥ 4.2). Branding is compile-time only.
- **Drizzle 0.38** (infrastructure): schema in `src/db/schema/*.ts`; relational queries use
  `relations()` + `drizzle({ schema })` (v1's `defineRelations` is not available). Repositories
  take a `Db` or transaction executor, return mapped shapes, and keep `$inferSelect` inside.
  Keeping Drizzle in one ring also contains the future v1 migration. →
  [persistence.md](references/persistence.md)
- **Transactions:** the use case calls `uow.run(async (store) => …)`; the infrastructure
  implementation does `db.transaction((tx) => work(new XRepository(tx)))`. No external HTTP or
  LLM call inside the callback: call it before or after, and make it idempotent.
- **Postgres + pgvector:** vector columns, HNSW indexes and `cosineDistance` stay in the
  repository; `CREATE EXTENSION` belongs to migrations. Table design → `postgresql-table-design`.
- **LLM (openai SDK / OpenRouter):** the use case depends on the `LLMProvider` port; adapters set
  `timeout` and `maxRetries` explicitly (SDK default timeout is 10 minutes), map SDK errors to
  `ExternalServiceError`, and validate structured output with the request's Zod schema. →
  [adapters.md](references/adapters.md)
- **Vitest 2:** unit tests are hermetic; DB tests are `*.it.test.ts` with Testcontainers
  (`test/helpers/pg.ts`); HTTP tests use `buildApp({ overrides })` + `app.inject`. No
  `vi.mock('drizzle-orm')` / `vi.mock('openai')`. Docs for v2: v2.vitest.dev. →
  [testing.md](references/testing.md)
- **JobRunner / RunBus:** a job handler is a driving adapter like a route: it parses the
  payload and calls a use case. Use cases report progress through an injected callback, not by
  importing `runBus`.

## 9. Pragmatism

- A port needs a reason: a second implementation, a test fake, or an external system. An
  interface mechanically extracted from one class with no fake is a smell. *(Seemann)*
- A thin CRUD use case that only validates and persists is fine; no domain model is required
  until rules appear. Add a ring when you can name its benefit. *(Bogard; Lenzo; Fowler, Yagni)*
- What is never negotiable: dependency direction, rows staying in infrastructure, adapters built
  only by the root.

## 10. Red flags

Use as a review checklist:

- `drizzle-orm`, `db.select`, `sql` or `src/db/*` imported in a route, service or domain file.
- A service constructor taking `Container`, or `new XRepository(...)` / `new XAdapter(...)`
  outside the composition root.
- `$inferSelect` / `*Row` types in a port, service signature or HTTP response.
- A route without a `response` schema, or returning a raw row.
- Two or more writes in one operation without a unit of work; an HTTP or LLM call inside
  `db.transaction`.
- `request`, `reply` or `FastifyInstance` below the routes file; `reply.code()` for a business error.
- A module importing `src/adapters/*`, or an adapter importing `src/modules/*`.
- `node:fs`, `process.env`, `Date.now()` or `Math.random()` inside domain/application code.
- `vi.mock` of a library you don't own instead of a fake of your own port.
- A hand-written type duplicating a shared Zod contract; one copy of `@devdigest/shared` changed.
- A module importing another module's service, repository, helpers or constants.
- A query without `workspaceId` scoping.
- An entry added to a check baseline to silence a new violation.

## 11. Enforcement

Three checks run together (≈1–2 s), from the repo root:

```sh
bash .claude/skills/onion-architecture/scripts/check-boundaries.sh        # --all also lists known debt
```

1. **Dependency rings**: dependency-cruiser, `server/.dependency-cruiser.cjs`. Catches imports
   that point outward, adapters used outside the root, cross-module internals, cycles.
2. **Conventions**: ast-grep, `scripts/check-conventions.mjs`. Catches routes without a
   `response` schema, `reply.code(4xx)` in routes, `process.env`/`Date.now()`/`new Date()`/
   `Math.random()`/`randomUUID()` in the core, `Container` in a use-case constructor,
   `vi.mock` of libraries we don't own.
3. **Contract parity**: `scripts/check-shared-parity.mjs`. Catches a change made to only one
   copy of `@devdigest/shared`.

- A **PostToolUse hook** (`.claude/settings.json`) runs the same checks after every edit in
  `server/`, `reviewer-core/` or a shared copy and returns new violations to you. Treat them as
  failing tests: fix before moving on.
- Rings are defined once, by path, in `server/.onion-rings.cjs`. File names drive the rings, so a
  file named outside the §7 layout escapes the ring rules.
- Existing debt sits in three baselines in `server/` (`.dependency-cruiser-known-violations.json`,
  `.onion-conventions-known.json`, `.shared-parity-known.json`) and is ignored. **Never add to a
  baseline to silence a new violation** unless the user explicitly agrees. Refresh one only after
  debt is *removed* (the checks print when that happened).
- A deliberate exception to a convention gets a comment on the line above:
  `// onion-allow <rule-id>: <reason>`.

Rules, rationale and how to add one: [enforcement.md](references/enforcement.md).

## 12. Reference files

Read only what the task needs: new module or use case → `rings-and-rules.md` + `persistence.md`;
route work → `http-edge.md`; external system or LLM → `adapters.md`; tests → `testing.md`;
review or refactor → `examples.md` + `devdigest-map.md`.

- [references/rings-and-rules.md](references/rings-and-rules.md) — the canon: rings, dependency
  rule, port ownership, composition root and Pure DI, functional core, aggregates, when not to.
- [references/http-edge.md](references/http-edge.md) — Fastify plugins and encapsulation, the
  Zod type provider, response schemas, request context, errors, job handlers, SSE.
- [references/persistence.md](references/persistence.md) — Drizzle repositories, mapping,
  unit of work, workspace scoping, pgvector, migrations.
- [references/adapters.md](references/adapters.md) — LLM, GitHub, git, filesystem and other
  driven adapters; secrets; clock and ids; reviewer-core as the core.
- [references/testing.md](references/testing.md) — tests per ring, fakes vs mocks,
  Testcontainers, `app.inject`.
- [references/enforcement.md](references/enforcement.md) — every rule of the three checks, the
  baselines, the hook, the scaffold script, adding a rule, alternatives.
- [references/devdigest-map.md](references/devdigest-map.md) — where DevDigest's files sit in the
  rings and the registry of known debt.
- [references/examples.md](references/examples.md) — before/after refactors.

Sources behind every rule: [README.md](README.md).
