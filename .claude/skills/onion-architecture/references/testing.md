# Testing by ring (Vitest 2)

The payoff of the rings is cheap tests: the inner rings run with no database, network or
container. Palermo's fourth tenet, "all application core code can be compiled and run separately
from infrastructure", is what these tests prove.

## Contents

- [1. What to test where](#1-what-to-test-where)
- [2. Fakes of your own ports, not mocks of libraries](#2-fakes-of-your-own-ports-not-mocks-of-libraries)
- [3. Keep fakes honest: contract tests](#3-keep-fakes-honest-contract-tests)
- [4. Repositories against real Postgres](#4-repositories-against-real-postgres)
- [5. HTTP with app.inject](#5-http-with-appinject)
- [6. Project specifics](#6-project-specifics)

## 1. What to test where

| Ring | Test type | Dependencies | Example |
|---|---|---|---|
| Domain | unit, many cases, `it.each` | none | `test/agents-domain.test.ts` |
| Application | unit, a few per use case | in-memory fakes of the module's ports | `test/agents-service.test.ts` |
| Infrastructure: repository | integration `*.it.test.ts` | real Postgres + pgvector (Testcontainers) | `test/agents-versions.it.test.ts` |
| Infrastructure: external adapter | unit with recorded responses, or a thin contract test | the SDK's HTTP layer stubbed, never the SDK's types in the core | `test/price-book.test.ts` |
| HTTP | `app.inject` through `buildApp` | `ContainerOverrides` + test DB or fakes | `test/routes-smoke.test.ts` |

Most new tests belong in the first two rows. "The first tests to write should be component
tests" (Goldberg) holds for routes, but domain rules deserve their own exhaustive unit tests.

## 2. Fakes of your own ports, not mocks of libraries

- "Don't mock what you don't own" (Freeman & Pryce, via Hynek and Test Double): mocking
  `drizzle-orm`, `openai` or `octokit` couples the test to the library's call shape and passes
  while production breaks. Wrap the library in an adapter and fake the *port*.
- Vitest's own docs call heavy `vi.mock` usage "usually a sign of bad code" and suggest
  dependency injection. The convention check flags `vi.mock` of foreign libraries.
- A fake is a small working implementation (an in-memory `Map`), not a script of expected
  calls: classicist tests that assert on state survive refactors; mockist tests "are more
  coupled to the implementation" (Fowler, Mocks Aren't Stubs).

```ts
class FakeAgentsStore implements AgentsStore {
  agents = new Map<string, Agent & { workspaceId: string }>();
  async get(ws: string, id: string) { const a = this.agents.get(id); return a?.workspaceId === ws ? strip(a) : undefined; }
  // … the rest of the port
}
const uow = { run: (work) => work(store) };            // fake unit of work
const service = new AgentsService({ store, uow, listModels: async () => [] });
```

- Fakes of shared ports (`LLMProvider`, `GitClient`, …) live in `src/adapters/mocks.ts`;
  `MockLLMProvider` validates its fixture against `req.schema`, which catches contract drift.
- Inject fakes through constructor deps (use cases) or `ContainerOverrides` (HTTP tests).
  Patching private fields (`(service as any).repo = …`) is a symptom of a service locator.

## 3. Keep fakes honest: contract tests

A fake that drifts from the real adapter makes unit tests lie. Write the port's behaviour once
and run it against both:

```ts
// test/support/agents-store.contract.ts
export function agentsStoreContract(make: () => Promise<{ store: AgentsStore; ws: string }>) {
  it('get is workspace-scoped', async () => {
    const { store, ws } = await make();
    const a = await store.insert(ws, newAgent, 1);
    expect(await store.get(ws, a.id)).toBeDefined();
    expect(await store.get('other-ws', a.id)).toBeUndefined();
  });
}

// test/agents-store.test.ts         → agentsStoreContract(async () => ({ store: new FakeAgentsStore(), ws: 'ws' }))
// test/agents-store.it.test.ts      → agentsStoreContract(async () => ({ store: new AgentsRepository(db), ws: seededWs }))
```

Add a contract suite when a fake is used by more than one test file or encodes non-trivial
behaviour (ordering, scoping, idempotency).

## 4. Repositories against real Postgres

- In-memory databases differ from production (Vocke, Practical Test Pyramid); Postgres-specific
  behaviour (jsonb, `onConflict`, pgvector, transactions) needs the real engine.
- `test/helpers/pg.ts`: `dockerAvailable()` gate → `startPg()` (testcontainers
  `pgvector/pgvector:pg16` + migrations) → `seed(db)`. Name the file `*.it.test.ts` so the
  hermetic suite excludes it.
- Each test creates the records it needs; don't depend on another test's leftovers.
- Transactions: assert that a failure inside `uow.run` leaves no partial writes.

## 5. HTTP with app.inject

- `buildApp({ config, db?, overrides })` builds the app without listening; `app.inject()` boots
  plugins and sends requests in-process; `await app.close()` afterwards (Fastify Testing guide).
- Assert on the status, the error envelope `{ error: { code, message } }` and the contract shape;
  a declared `response` schema means extra fields are already stripped.
- Without a `secrets` override the real `LocalSecretsProvider` reads `~/.devdigest/secrets.json`
  and `process.env`; pass `MockSecretsProvider` to keep a test hermetic.
- `ContainerOverrides` covers external adapters only; module repositories and units of work
  (`agentsRepo`, `agentsUow`) are not overridable. Route tests for DB-backed modules are therefore
  `*.it.test.ts` against real Postgres; test use-case logic with fakes one ring down instead.

## 6. Project specifics

- Commands (in `server/`): hermetic `pnpm exec vitest run --exclude '**/*.it.test.ts'`;
  integration `pnpm exec vitest run .it.test` (Docker required).
- Tests live flat in `server/test/`; name them `<module>-<subject>.test.ts`.
- Vitest docs for this version: https://v2.vitest.dev (the main site documents a later major).
- On Windows six `runIncremental` tests in `indexer-pipeline.test.ts` fail with `ENOENT` regardless
  of your change (see `server/INSIGHTS.md`).
