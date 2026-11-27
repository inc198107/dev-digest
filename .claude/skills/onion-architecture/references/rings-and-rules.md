# Rings and rules: the canon behind the skill

## Contents

- [1. Where Onion comes from](#1-where-onion-comes-from)
- [2. The dependency rule](#2-the-dependency-rule)
- [3. Ports belong to the core](#3-ports-belong-to-the-core)
- [4. Composition root and Pure DI](#4-composition-root-and-pure-di)
- [5. Use cases: what a service is (and is not)](#5-use-cases-what-a-service-is-and-is-not)
- [6. Functional core, imperative shell](#6-functional-core-imperative-shell)
- [7. Aggregates, consistency and transactions](#7-aggregates-consistency-and-transactions)
- [8. What crosses a boundary](#8-what-crosses-a-boundary)
- [9. Modules: package by component, layer inside](#9-modules-package-by-component-layer-inside)
- [10. When not to (and what is never optional)](#10-when-not-to-and-what-is-never-optional)
- [11. Glossary](#11-glossary)

## 1. Where Onion comes from

Jeffrey Palermo named Onion Architecture in 2008 as a reaction to layered designs where the UI
and the business logic depend on the data-access layer. His four tenets (part 3):

1. The application is built around an independent object model.
2. Inner layers define interfaces; outer layers implement them.
3. Direction of coupling is toward the center.
4. All application core code can be compiled and run separately from infrastructure.

"The database is not the center. It is external." UI, infrastructure **and tests** sit on the
outer edge. Hexagonal Architecture (Cockburn, 2005) and Clean Architecture (Martin, 2012) state
the same idea with different words; Seemann shows that applying the Dependency Inversion Principle
to a layered architecture yields Ports and Adapters, so the names are interchangeable for this
skill.

Ring names used here:

| This skill | Palermo | Clean Architecture | Hexagonal |
|---|---|---|---|
| domain | domain model | entities | inside the hexagon |
| application | domain services / application services | use cases | application, ports |
| infrastructure | infrastructure | frameworks & drivers, gateways | driven (secondary) adapters |
| http | UI | interface adapters / controllers | driving (primary) adapters |
| composition root | dependency resolution | main | configurator |

## 2. The dependency rule

"Source code dependencies can only point inwards" (Martin). Nothing in an inner ring knows the
name of anything in an outer ring: no function, class, variable, *type* or library.

Practical reading for TypeScript:

- `import type` counts. A use case whose signature mentions `AgentRow` (a Drizzle row) depends on
  Drizzle even though no runtime code is loaded. The boundary check runs with type imports
  enabled for this reason.
- Libraries count. `zod` is allowed in the core because it is a pure parsing library; `fastify`,
  `drizzle-orm`, `postgres`, `openai`, `octokit`, `simple-git`, `node:fs` are not.
- The clock, randomness and the environment are I/O. `Date.now()`, `Math.random()`,
  `crypto.randomUUID()` and `process.env` make core code non-deterministic and untestable, so
  they enter as parameters.

## 3. Ports belong to the core

A **port** is an interface the core declares for something it needs from the outside: a store of
labels, a unit of work, an LLM, a GitHub client. An **adapter** implements it.

- Declare the port where it is used, in the core's vocabulary ("Ports (Interfaces) belong inside
  the business logic, while the adapters belong outside", Graça). `getLabels(workspaceId)`, not
  `select * from labels`.
- Shape the port for what the core needs, not after a tool's API. A port that mirrors the
  Drizzle query builder or the OpenAI client just moves the coupling.
- Ports shared by several packages live in `@devdigest/shared` (`adapters.ts`: `LLMProvider`,
  `GitHubClient`, `GitClient`, `SecretsProvider`, …). Module-local ports live in the module's
  `ports.ts`.
- **Adapters translate; they don't decide.** Business decisions made inside an adapter (retry
  until a business condition holds, filter by a business rule) belong in the core.
- A port needs a reason. "Having only one implementation of a given interface is a code smell"
  (Seemann, Reused Abstractions Principle) unless the second implementation is a test fake or the
  port isolates an external system. Don't wrap pure functions in interfaces.

## 4. Composition root and Pure DI

"A Composition Root is a (preferably) unique location in an application where modules are
composed together" (Seemann), as close to the entry point as possible.

- In DevDigest the composition root is `app.ts` (`buildApp`), `platform/container.ts`,
  `server.ts` and the module registry `modules/index.ts`. Routes plugins finish the job for
  their module: they take container-built dependencies and construct the use case.
- **Pure DI**: constructor (or function) arguments, no DI container library. Palermo (2013):
  "Onion architecture works just fine without the likes of StructureMap or Castle Windsor";
  Practica: "No DI — it's just simple functions calling other functions".
- **Service locator is the anti-pattern to avoid.** Passing the whole `Container` into a service
  hides what it needs, lets it reach any adapter, and forces tests to fake the whole container or
  patch private fields. Give the service a `deps` object with the 2–4 things it uses.
- The container may cache lazily built adapters and repositories (existing getters `git`,
  `agentsRepo`, `repoIntel`, async `llm(id)`). It is the only code that calls `new` on them.

## 5. Use cases: what a service is (and is not)

The service layer "defines an application's boundary and its set of available operations",
"controlling transactions and coordinating responses" (Stafford, Service Layer). Fowler (Anemic
Domain Model): the application layer "does not contain business rules or knowledge, but only
coordinates tasks".

- One public method per user intent: `create`, `rename`, `suggest`, `refund`. Name methods
  after the intent, not after CRUD verbs on tables.
- Shape of a method: load (through ports) → decide (pure domain function) → persist (through
  ports, inside one unit of work when there are several writes) → return a contract shape.
- Inputs are plain, already-parsed values (`workspaceId`, a `z.infer` type), never `request`.
- Outputs are domain or contract shapes, never rows.
- Throw `AppError` subclasses for outcomes the caller can act on (`NotFoundError`,
  `ValidationError`, `ConfigError`, `ExternalServiceError`); never set HTTP status codes.
- A use case may call another module only through that module's facade.

## 6. Functional core, imperative shell

Bernhardt: a functional core of pure decisions "surrounded by a shell of imperative code"
(database, network, stdin/stdout). Seemann's version is the "impureim sandwich" and dependency
*rejection*: "pure functions must take direct input and produce direct output".

```ts
/** Pure: decides, does no I/O. */
export function isRefundable(order: OrderSnapshot, now: Date): RefundDecision {
  if (order.status !== 'paid') return { ok: false, reason: 'not_paid' };
  if (now.getTime() - order.paidAt.getTime() > REFUND_WINDOW_MS) return { ok: false, reason: 'window_closed' };
  return { ok: true };
}
```

The use case reads the order, calls `isRefundable(order, this.deps.now())`, and writes. The rule
gets exhaustive unit tests with plain objects; the use case gets a few tests with fakes.

Value objects (Fowler, Stemmler) are immutable, compared by value, and validated on creation. In
this stack prefer a Zod schema plus `.brand<'LabelName'>()` and a `parseLabelName` function over
classes with private constructors; branding is compile-time only, so the parse function is what
guarantees the invariant at runtime.

## 7. Aggregates, consistency and transactions

- An aggregate is a cluster of data changed together and loaded/saved as a unit, accessed through
  its root (Fowler, DDD Aggregate). "Transactions should not cross aggregate boundaries."
- In practice: one use-case method = one business operation = at most one transaction. If an
  operation must change two aggregates, prefer changing one and reacting to it (a job, an event)
  over one large transaction.
- The **use case** opens the transaction because only it knows the operation's boundaries
  (Stafford). Repositories accept a transaction-bound executor; they never open their own
  transaction for multi-statement business operations, and routes never open transactions.
- External calls (payment APIs, GitHub, LLMs) cannot be rolled back with the database. Do them
  before or after the transaction, make them idempotent (idempotency keys, recorded intent), and
  keep the transaction short.

How this looks with Drizzle: [persistence.md](persistence.md#4-unit-of-work-and-transactions).

## 8. What crosses a boundary

"We don't want to cheat and pass Entities or Database rows" (Martin). Use simple data
structures: Zod-inferred types, plain objects, primitives. Bernhardt ("Boundaries"): values, not
behaviour-rich objects, are the best interfaces between components.

| Boundary | Crosses as |
|---|---|
| HTTP → use case | `z.infer` of the request schema + `RequestContext` fields (`workspaceId`, `userId`) |
| Use case → HTTP | contract shape from `@devdigest/shared`, serialized by the `response` schema |
| Repository → use case | domain/contract shape, mapped from rows inside the repository |
| Adapter → use case | port return type (e.g. `UnifiedDiff`, `StructuredResult<T>`), never SDK objects |

## 9. Modules: package by component, layer inside

Fowler (PresentationDomainDataLayering): when layers grow, "split your top level into domain
oriented modules which are internally layered". nodebestpractices §1.1–1.2 says the same for
Node: structure by business component, three tiers inside each (entry points, domain, data
access). Graça adds: a component only changes the data it owns.

- One module per business capability (`agents`, `reviews`, `labels`), rings inside it.
- A module's tables are its own. Other modules read them through its facade (`index.ts` /
  `types.ts`, exposed via the container like `container.repoIntel`), not by joining its tables.
- Cross-cutting infrastructure (db client, JobRunner, RunBus, adapters) is shared, built once in
  the composition root.

## 10. When not to (and what is never optional)

The critiques are worth taking seriously:

- Bogard (Vertical Slice Architecture): layered/onion/clean code becomes "mock-heavy, with rigid
  rules around dependency management". Start with a transaction script; refactor toward a domain
  model when the code shows the need.
- Stemmler: for small CRUD apps Clean Architecture "might seem like overkill"; transaction
  scripts are "an excellent choice for CRUD apps with little business logic".
- Lenzo (The Clean Architecture Trap): "Just-in-Time architecture, not Just-in-Case"; "if you
  can't clearly name the benefit, you probably don't need it".
- Fowler (Yagni): speculative abstractions cost to build, delay and carry — but Yagni "is not a
  justification for neglecting the health of your code base".

So this skill scales the *amount* of structure and never the *direction*:

| Optional (add when it pays) | Never optional |
|---|---|
| A rich domain model, value objects | Inward-only dependencies |
| A port for a dependency with no fake or second implementation | Drizzle and SDKs only in infrastructure |
| Ring folders instead of ring files | Adapters built only by the composition root |
| A unit of work for a single-statement write | Rows never leave repositories; routes declare responses |
| Separate domain types when the contract type already fits | Secrets only through `SecretsProvider` |

## 11. Glossary

- **Port** — an interface declared by the core for something it needs or offers.
- **Adapter** — code that implements a port with a specific technology (Drizzle, Octokit, OpenAI)
  or drives the core from a technology (a Fastify route, a job handler).
- **Driving / primary adapter** — calls into the core (routes, job handlers, CLI).
- **Driven / secondary adapter** — called by the core through a port (repositories, gateways).
- **Use case** — one application operation; here a method on a module's service class.
- **Unit of work** — a port that runs several repository operations atomically.
- **Composition root** — the single place that constructs and wires adapters and use cases.
- **Gateway** — "an object that encapsulates access to an external system or resource" (Fowler).
