# onion-architecture

**Version:** 1.0.0 (`metadata.version` in [SKILL.md](SKILL.md)) · **Updated:** 2026-11-25

A skill that makes the agent build and review **backend code as an Onion (ports and adapters)**
on this stack: Fastify 5, Drizzle ORM 0.38, Zod 3, Postgres 16 + pgvector, Vitest 2, and LLM
adapters (openai SDK / OpenRouter). It decides which ring a piece of code belongs to, which way
imports may point, and how each tool fits its ring. Three checks and a Claude Code hook enforce
it mechanically.

## Scope

| Covered here | Covered elsewhere |
|---|---|
| Rings, dependency direction, ports, composition root, DI | Fastify API details (hooks, plugins, serialization) → `fastify-best-practices` |
| Where domain rules, use cases, repositories, adapters and routes live | Drizzle query syntax, relations, migrations → `drizzle-orm-patterns` |
| Transactions / unit of work, row mapping, workspace scoping | Tables, indexes, constraints → `postgresql-table-design` |
| Error mapping, response schemas, request context | Zod API → `zod`; types and tsconfig → `typescript-expert` |
| Tests per ring, fakes vs mocks | Frontend placement → `frontend-ui-architecture` |
| Boundary enforcement (dependency-cruiser, ast-grep, contract parity, hook, scaffold) | |

Where `fastify-best-practices` (decorator DI, autoload, SQL in plugins) or `drizzle-orm-patterns`
(repositories on a concrete `db` used directly) conflict with the rings, this skill wins; see
SKILL.md §1. Those skills are installed from `skills-lock.json` and are not edited.

**Precedence:** module `CLAUDE.md`/`INSIGHTS.md` → the reference module
(`server/src/modules/agents/`) → this skill. Legacy code is not restructured unless asked; the
checks only fail on *new* violations.

## Files

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | Overrides, precedence, rings, workflow, principles, "where does it go?", module layout and wiring, tool bindings, pragmatism, red flags, enforcement |
| [references/rings-and-rules.md](references/rings-and-rules.md) | The canon: Palermo's tenets, dependency rule, port ownership, composition root and Pure DI, use cases, functional core, aggregates and transactions, critiques |
| [references/http-edge.md](references/http-edge.md) | Fastify plugins and encapsulation, Zod type provider (version trap), response schemas, context, errors, decorators, job handlers, SSE |
| [references/persistence.md](references/persistence.md) | Repositories, row mapping, unit of work with Drizzle, workspace scoping, schema/migrations, pgvector, cross-module data, debt recipes |
| [references/adapters.md](references/adapters.md) | Gateways, port locations, LLM adapters, GitHub/git/fs, secrets, clock/ids, reviewer-core as the core, adding an external system |
| [references/testing.md](references/testing.md) | Tests per ring, fakes vs mocks, contract tests for fakes, Testcontainers, `app.inject` |
| [references/enforcement.md](references/enforcement.md) | Every rule of the three checks, baselines, the hook, the scaffold, adding a rule, gotchas, alternatives |
| [references/devdigest-map.md](references/devdigest-map.md) | Ring map of server/ and reviewer-core/, the agents reference module, known-debt registry, repayment order, shared-copy drift |
| [references/examples.md](references/examples.md) | Before/after refactors in a neutral domain |
| [scripts/check-boundaries.sh](scripts/check-boundaries.sh) | Runs the three checks (`--all` lists known debt) |
| [scripts/check-conventions.mjs](scripts/check-conventions.mjs) | ast-grep convention rules + baseline |
| [scripts/check-shared-parity.mjs](scripts/check-shared-parity.mjs) | Compares the two `@devdigest/shared` copies + baseline |
| [scripts/hook-post-edit.mjs](scripts/hook-post-edit.mjs) | PostToolUse hook entry point |
| [scripts/new-module.mjs](scripts/new-module.mjs) | Scaffolds a module by rings with fake-based tests |
| [evals/](evals/) | Four cases in the `claude plugin eval` layout |

Files outside the skill that belong to it:

- `server/.onion-rings.cjs`: ring definitions (single source of truth).
- `server/.dependency-cruiser.cjs`: dependency rules.
- `server/.dependency-cruiser-known-violations.json`, `server/.onion-conventions-known.json`,
  `server/.shared-parity-known.json`: baselines of known debt.
- `.claude/settings.json`: the PostToolUse hook.

## Usage

- **Automatic:** Claude loads the skill when a task matches its description: creating, moving or
  reviewing backend code, a new module/route/service/repository/adapter/LLM call, or "where should
  this go?". The skill intentionally has no `paths` frontmatter: in Claude Code `paths` restricts
  activation to matching files, which would stop it from helping while planning or reviewing a
  snippet.
- **Manual:** `/onion-architecture`.
- **Checks:** `bash .claude/skills/onion-architecture/scripts/check-boundaries.sh` from the repo
  root (Git Bash on Windows). The hook runs them after every agent edit in scope.
- **New module:** `node .claude/skills/onion-architecture/scripts/new-module.mjs <name>`.
- **Eval:** each folder in `evals/` has `prompt.md`, `case.yaml` and `graders/`. With Claude Code
  v2.1.269+ run `claude plugin eval . --allow-tools Read,Glob,Grep,Skill` from this folder. These
  are real, billed model runs.

## Versioning

SemVer in `metadata.version` (the Agent Skills spec has no top-level `version`).

- **MAJOR:** a rule changes meaning or is removed, or a check starts failing code it accepted.
- **MINOR:** a new rule, check, section, reference file, script or eval.
- **PATCH:** wording, examples, links, baseline refreshes after debt removal.

Every change bumps the version and adds a changelog entry.

## Changelog

### 1.0.0 — 2026-11-25

- Initial version, built from the sources below (checked 2026-11-25 unless noted).
- Mechanical enforcement: dependency-cruiser rings (13 rules), ast-grep conventions (5 rules),
  contract parity of the two `@devdigest/shared` copies, a PostToolUse hook, and baselines with
  60 + 57 + 4 known entries.
- Reference implementation: `server/src/modules/agents/` refactored as the pilot (narrow deps,
  `domain.ts`, `ports.ts`, `DrizzleAgentsUnitOfWork`, response schemas, request bodies moved to
  `@devdigest/shared`, fake-based unit tests); hermetic and integration tests pass.
- Scaffold script for new modules; it passes all three checks out of the box.
- Version traps documented: `fastify-type-provider-zod` 4.x for Zod 3; Drizzle 0.38 `relations()`
  vs v1 `defineRelations`; Vitest 2 docs at v2.vitest.dev.
- Checked against the four `evals/` cases with one run that used the skill and no baseline run:
  29 of 29 assertions passed. The run's feedback led to guidance on new `AppError` subclasses,
  reading another module's data without a facade, new use cases inside legacy modules, prompt
  builders and model ids for module LLM features, reading PR files at the head SHA, route tests for
  DB-backed modules, baseline matching by text, and dropping the scaffold's unit of work for
  single-statement writes.

## Sources

Section markers point to SKILL.md (§) or a reference file.

### Onion, Hexagonal, Clean

- [The Onion Architecture, part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/), [part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/), [part 3](https://jeffreypalermo.com/2008/08/the-onion-architecture-part-3/), [part 4: after four years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) (Jeffrey Palermo): coupling toward the center, inner layers define interfaces, the core runs without infrastructure, no IoC container needed. §3, §5, rings-and-rules §1, §4
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) (Alistair Cockburn, 2005): driving vs driven adapters, test in isolation from devices and databases. §3, adapters §1
- [The Clean Architecture](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) (Robert C. Martin, 2012): dependencies point inward; don't pass entities or database rows across boundaries. §5, rings-and-rules §2, §8
- [Explicit Architecture](https://herbertograca.com/2017/11/16/explicit-architecture-01-ddd-hexagonal-onion-clean-cqrs-how-i-put-it-all-together/) (Herberto Graça): ports belong inside, adapters outside; ports fit the core's needs; components own their data. rings-and-rules §3, §9
- [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) (Martin Fowler): domain-oriented modules layered internally. rings-and-rules §9
- [Anemic Domain Model](https://martinfowler.com/bliki/AnemicDomainModel.html) (Fowler): the service layer coordinates, rules live in the domain. rings-and-rules §5
- [Repository](https://martinfowler.com/eaaCatalog/repository.html) and [Service Layer](https://martinfowler.com/eaaCatalog/serviceLayer.html) (P of EAA): collection-like persistence; the service layer controls transactions. persistence §1, §4
- [Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html) (Fowler, 2004): constructor injection; configuration separate from use. rings-and-rules §4
- [Value Object](https://martinfowler.com/bliki/ValueObject.html) and [DDD Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html) (Fowler): immutable values; transactions don't cross aggregates. rings-and-rules §6–7
- [Common web application architectures](https://learn.microsoft.com/en-us/dotnet/architecture/modern-web-apps-azure/common-web-application-architectures) (Steve Smith / Microsoft): interfaces in the core, implementations in infrastructure, references limited to the composition root. §3
- [Composition Root](https://blog.ploeh.dk/2011/07/28/CompositionRoot/), [Pure DI](https://blog.ploeh.dk/2014/06/10/pure-di/), [Layers, Onions, Ports, Adapters: it's all the same](https://blog.ploeh.dk/2013/12/03/layers-onions-ports-adapters-its-all-the-same/) (Mark Seemann). §5, rings-and-rules §1, §4
- [Effective Aggregate Design](https://www.dddcommunity.org/library/vernon_2011/) (Vaughn Vernon, 2011): aggregate rules of thumb (landing page verified; PDF text not extractable). rings-and-rules §7
- [DDD Reference](https://www.domainlanguage.com/ddd/reference/) (Eric Evans, CC BY 4.0): pattern glossary. rings-and-rules §11

### Critiques and pragmatism

- [Vertical Slice Architecture](https://www.jimmybogard.com/vertical-slice-architecture/) (Jimmy Bogard): mock-heavy layering; start with transaction scripts. §9, rings-and-rules §10
- [Functional Core, Imperative Shell](https://www.destroyallsoftware.com/screencasts/catalog/functional-core-imperative-shell) and [Boundaries](https://www.destroyallsoftware.com/talks/boundaries) (Gary Bernhardt): pure core, imperative shell, values at boundaries. §5, rings-and-rules §6, §8
- [Functional architecture is Ports and Adapters](https://blog.ploeh.dk/2016/03/18/functional-architecture-is-ports-and-adapters/), [Dependency rejection](https://blog.ploeh.dk/2017/02/02/dependency-rejection/), [Interfaces are not abstractions](https://blog.ploeh.dk/2010/12/02/Interfacesarenotabstractions/) (Seemann): impureim sandwich; single-implementation interfaces are a smell. §9, rings-and-rules §3, §6
- [Yagni](https://martinfowler.com/bliki/Yagni.html) (Fowler). §9
- [The Clean Architecture Trap](https://dev.to/marcolenzo/the-clean-architecture-trap-241k) (Marco Lenzo, 2025): just-in-time architecture. §9
- Khalil Stemmler: [Organizing App Logic](https://khalilstemmler.com/articles/software-design-architecture/organizing-app-logic/), [When CRUD & MVC isn't enough](https://khalilstemmler.com/articles/enterprise-typescript-nodejs/when-crud-mvc-isnt-enough/), [DTOs, Mappers & the Repository Pattern](https://khalilstemmler.com/articles/typescript-domain-driven-design/repository-dto-mapper/), [Value Objects](https://khalilstemmler.com/articles/typescript-value-object/). §9, persistence §1, §3

### Node and TypeScript practice

- [nodebestpractices](https://github.com/goldbergyoni/nodebestpractices) §1.1–1.2, [layer your app](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/createlayers.md), [centralized error handling](https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/errorhandling/centralizedhandling.md) (Yoni Goldberg et al.). §5, http-edge §5, rings-and-rules §9
- [Practica.js](https://github.com/practicajs/practica) and [Coding with Practica](https://github.com/practicajs/practica/blob/main/docs/docs/the-basics/coding-with-practica.md): Fastify default, no DI container, thin controllers (practica.dev itself refused connections). rings-and-rules §4
- [domain-driven-hexagon](https://github.com/Sairyss/domain-driven-hexagon) (Sairyss): ports around domain needs, dependency-cruiser layer rules, YAGNI. enforcement
- [nodejs-clean-architecture-app](https://github.com/jbuget/nodejs-clean-architecture-app) (Jérémy Buget): one responsibility per use case.
- [Tao of Node](https://alexkondov.com/tao-of-node/) (Alex Kondov): transport-only handlers, factory DI, central errors.
- [fastify-boilerplate](https://github.com/marcoturi/fastify-boilerplate) (Marco Turi): Fastify 5 with ports per module and dependency-cruiser in hooks/CI. enforcement
- [nodejs-integration-tests-best-practices](https://github.com/testjavascript/nodejs-integration-tests-best-practices) (Goldberg, Salomon, Gluskin): component tests, real DB in Docker. testing §1, §4

### Fastify

- Reference: [Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/), [Plugins](https://fastify.dev/docs/latest/Reference/Plugins/), [Plugins Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/), [Decorators](https://fastify.dev/docs/latest/Reference/Decorators/), [Hooks](https://fastify.dev/docs/latest/Reference/Hooks/), [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/), [TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/), [Errors](https://fastify.dev/docs/latest/Reference/Errors/), [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/), [Testing](https://fastify.dev/docs/latest/Guides/Testing/). http-edge, testing §5
- [turkerdev/fastify-type-provider-zod](https://github.com/turkerdev/fastify-type-provider-zod) (≤ 4.x = Zod 3) and [fastify/fastify-type-provider-zod](https://github.com/fastify/fastify-type-provider-zod) (Zod ≥ 4.2). §8, http-edge §3
- [Fastify Fundamentals: plugins and encapsulation](https://blog.platformatic.dev/fastify-fundamentals-a-quick-guide-to-plugins-and-encapsulation-with-platformatic) (Platformatic). http-edge §2

### Drizzle and Postgres

- Drizzle docs: [schema declaration](https://orm.drizzle.team/docs/sql-schema-declaration), [transactions](https://orm.drizzle.team/docs/transactions), [type API](https://orm.drizzle.team/docs/goodies), [relational queries](https://orm.drizzle.team/docs/rqb), [relations v1 → v2](https://orm.drizzle.team/docs/relations-v1-v2), [v0 → v1 changes](https://orm.drizzle.team/docs/v0-v1-changes), [pgvector guide](https://orm.drizzle.team/docs/guides/vector-similarity-search). §8, persistence
- [Atomic Repositories in Clean Architecture and TypeScript](https://blog.sentry.io/atomic-repositories-in-clean-architecture-and-typescript) (Lazar Nikolov, Sentry, 2024). persistence §4

### Zod and parsing

- [Parse, don't validate](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/) (Alexis King, 2019). §5, adapters §1
- [Zod v3.24.4 README](https://raw.githubusercontent.com/colinhacks/zod/v3.24.4/README.md) (v3.zod.dev renders client-side and could not be fetched) and [branded types](https://zod.dev/api). rings-and-rules §6

### Testing

- [Vitest v2: Mocking](https://v2.vitest.dev/guide/mocking). testing §2
- [Mocks Aren't Stubs](https://martinfowler.com/articles/mocksArentStubs.html) (Fowler) and [The Practical Test Pyramid](https://martinfowler.com/articles/practical-test-pyramid.html) (Ham Vocke). testing §2, §4
- [Don't Mock What You Don't Own in 5 Minutes](https://hynek.me/articles/what-to-mock-in-5-mins/) (Hynek Schlawack), [Don't mock what you don't own](https://github.com/testdouble/contributing-tests/wiki/Don't-mock-what-you-don't-own) (Test Double), [TotT: Don't Mock Types You Don't Own](https://testing.googleblog.com/2020/07/testing-on-toilet-dont-mock-types-you.html) (Google, partly verified). *Growing Object-Oriented Software*, ch. 8 (Freeman & Pryce) is cited through these (paywalled). testing §2
- [Testcontainers: PostgreSQL](https://node.testcontainers.org/modules/postgresql/). testing §4

### Boundary enforcement

- dependency-cruiser [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md) and [tutorial](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md). enforcement §3
- [eslint-plugin-boundaries](https://www.jsboundaries.dev/) ([GitHub](https://github.com/javierbrea/eslint-plugin-boundaries)), [import/no-restricted-paths](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md), [ArchUnitTS](https://github.com/LukasNiessen/ArchUnitTS), [ts-arch](https://github.com/ts-arch/ts-arch), [TS project references](https://www.typescriptlang.org/docs/handbook/project-references.html). enforcement §11

### LLM as infrastructure

- [Gateway](https://martinfowler.com/articles/gateway-pattern.html) (Fowler, 2021). adapters §1
- [openai-node](https://github.com/openai/openai-node): defaults of 2 retries and a 10-minute timeout, typed errors. adapters §3
- [OpenRouter quickstart](https://openrouter.ai/docs/quickstart): base URL and `X-OpenRouter-Title`. adapters §3
- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) (Anthropic, 2024). adapters §3
- [Ports and Adapters for Agents](https://tianpan.co/blog/2026-07-02-ports-and-adapters-for-agents) (Tian Pan, 2026; personal blog). adapters §1

### Skill authoring

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices), [Claude Code skills](https://code.claude.com/docs/en/skills), [Agent Skills specification](https://agentskills.io/specification).
