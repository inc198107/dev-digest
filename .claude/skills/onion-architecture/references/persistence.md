# Persistence: Drizzle 0.38, Postgres 16 and pgvector

Repositories are **driven adapters**: they implement a port declared by the core and are the only
code that knows Drizzle, SQL and table shapes.

## Contents

- [1. What a repository is here](#1-what-a-repository-is-here)
- [2. Port first, then the Drizzle implementation](#2-port-first-then-the-drizzle-implementation)
- [3. Rows stay inside: mapping](#3-rows-stay-inside-mapping)
- [4. Unit of work and transactions](#4-unit-of-work-and-transactions)
- [5. Workspace scoping](#5-workspace-scoping)
- [6. Schema, migrations, relational queries](#6-schema-migrations-relational-queries)
- [7. pgvector and raw SQL](#7-pgvector-and-raw-sql)
- [8. Cross-module data](#8-cross-module-data)
- [9. Known debt and how to pay it](#9-known-debt-and-how-to-pay-it)

## 1. What a repository is here

"Mediates between the domain and data mapping layers using a collection-like interface"
(Fowler/P of EAA). Stemmler: "Repositories are Facades to persistence technologies".

- One repository per aggregate or per module's owned tables (`agents`, `agent_versions`, the agent
  side of `agent_skills`). Not one per table, and no generic `BaseRepository<T>`: generic CRUD
  leaks the table model into every use case.
- Methods speak the use case's language (`snapshotVersion`, `replaceSkills`), take plain values,
  return contract/domain shapes.
- No business decisions. "Should this bump the version?" is a domain function; the repository
  writes whatever version the use case passes.

## 2. Port first, then the Drizzle implementation

```ts
// ports.ts (application): contract vocabulary only
export interface AgentsStore {
  get(workspaceId: string, id: string): Promise<Agent | undefined>;
  update(workspaceId: string, id: string, patch: AgentUpdateBody, version: number): Promise<Agent | undefined>;
  snapshotVersion(agentId: string, version: number): Promise<void>;
}

// repository.ts (infrastructure)
export class AgentsRepository implements AgentsStore {
  constructor(private readonly db: DbExecutor) {}   // Db | DbTransaction, from src/db/client.ts
  async get(workspaceId: string, id: string): Promise<Agent | undefined> {
    const [row] = await this.db.select().from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.id, id)));
    return row ? toAgent(row) : undefined;
  }
}
```

`DbExecutor` (`server/src/db/client.ts`) is `Db | DbTransaction`, so the same repository class
runs on the shared client or inside a transaction.

## 3. Rows stay inside: mapping

- Row types (`typeof t.agents.$inferSelect`, `AgentRow` in `src/db/rows.ts`) appear only in
  repositories and `src/db/`. "We don't want to cheat and pass … Database rows" (Martin).
- Map in the repository: `toAgent(row)`, `toAgentVersion(row)`. Parse untyped `jsonb` with the
  contract's Zod schema while mapping (`AgentVersionConfig.parse(row.configJson)`): a malformed
  snapshot fails at the edge instead of leaking.
- Enum-like text columns are cast or parsed into the contract enum in the mapper; the cast lives
  here, not in services.
- Mapping that grows large moves to `infrastructure/mappers.ts` (still infrastructure).

## 4. Unit of work and transactions

The use case owns the transaction; the repository never opens one for a business operation.

```ts
// ports.ts
export interface AgentsUnitOfWork {
  run<T>(work: (store: AgentsStore) => Promise<T>): Promise<T>;
}

// repository.ts
export class DrizzleAgentsUnitOfWork implements AgentsUnitOfWork {
  constructor(private readonly db: Db) {}
  run<T>(work: (store: AgentsStore) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => work(new AgentsRepository(tx)));
  }
}

// service.ts
update(workspaceId: string, id: string, patch: AgentUpdateBody) {
  return this.deps.uow.run(async (store) => {
    const existing = await store.get(workspaceId, id);        // read inside the tx
    if (!existing) return undefined;
    const plan = planVersion(existing, patch);                 // pure decision
    const updated = await store.update(workspaceId, id, patch, plan.version);
    if (updated && plan.bump) await store.snapshotVersion(id, plan.version);
    return updated;
  });
}
```

Rules:

- **When:** two or more writes that must succeed together, or a read-then-write that must not
  race. A single statement doesn't need a unit of work.
- **What Drizzle does:** `db.transaction(async (tx) => …)` commits when the callback resolves
  and rolls back when it throws; `tx.rollback()` throws to abort; a nested `tx.transaction`
  creates a savepoint; Postgres accepts `{ isolationLevel }`.
- **Never** call an HTTP API, the LLM, git or GitHub inside the callback: the transaction holds
  locks and a connection for the whole call, and the external effect can't roll back. Call it
  before (and pass the result in) or after (and make it idempotent).
- The fake unit of work in tests is one line: `{ run: (work) => work(fakeStore) }`.
- Alternative seen in the wild (Sentry, "Atomic Repositories"): an opaque `ITransaction` passed to
  repository methods (`tx ?? db`). It works too; this codebase uses the store-factory form above
  because no Drizzle type has to appear in a port.

## 5. Workspace scoping

- Every method that reads or writes tenant data takes `workspaceId` and puts it in the `where`.
- Child rows reached by a parent id (`agent_versions` by `agentId`) are safe only after the use
  case verified the parent belongs to the workspace (`listVersions` checks `store.get` first).
- `src/db/schema.ts` mentions a "base-repository guard"; it doesn't exist. Scoping is manual, so
  review it.

## 6. Schema, migrations, relational queries

- Tables live in `src/db/schema/<area>.ts`, exported through `src/db/schema.ts` (the drizzle-kit
  entry). After editing: `pnpm db:generate`, review the SQL, `pnpm db:migrate`. Never edit applied
  migrations. Table and index design: `postgresql-table-design`.
- **Version trap:** the Drizzle site documents v1. On 0.38 relational queries use `relations()`
  from `drizzle-orm` and `drizzle(client, { schema })`; v1's `defineRelations` and RQB v2 don't
  exist here. "RQBv1 has been removed" in v1, so keeping every query in repositories also keeps
  the eventual upgrade inside one ring.
- Type helpers: `$inferSelect` / `$inferInsert` (or `InferSelectModel`) for rows; never export
  them from a port.

## 7. pgvector and raw SQL

- `vector('embedding', { dimensions })` columns, HNSW indexes with `vector_cosine_ops`, and
  `cosineDistance(...)` ordering stay inside the repository; the port exposes something like
  `similar(workspaceId, embedding, k): Promise<Chunk[]>`.
- `CREATE EXTENSION vector` belongs to migrations (`db/migrate.ts` already creates it).
- Raw `sql\`…\`` / `db.execute` is fine inside a repository; bind values with the template, never
  string-concatenate.

## 8. Cross-module data

- A module's repository queries only the tables that module owns. To use another module's data,
  depend on that module's facade through the container (`container.repoIntel`), or add a narrow
  read port to *your* `ports.ts` and implement it with the other module's facade.
- The owner has no facade yet (e.g. `pulls`): add the read method to the owner's repository (its
  home for new queries), expose that repository through a container getter, and let it satisfy
  your port structurally (`PullTextSource.get(ws, prId)` ← `PullsRepository.getText`).
- Shared row shapes for cross-cutting reads live in `src/db/rows.ts` so nobody imports another
  module's repository just for a type.

## 9. Known debt and how to pay it

| Debt | Where | Recipe |
|---|---|---|
| SQL inline in routes | `pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts`, `workspace/routes.ts` | Move each query into the module's `repository.ts` behind a port method; the route calls a use case. Do it per endpoint you touch. |
| Multi-writes without a transaction | `pulls/routes.ts:196-230`, `reviews/repository/run.repo.ts:103-110`, `repo-intel/repository.ts` + `pipeline/full.ts`, `settings/routes.ts:52-60` | Add a module unit of work (§4) and move the writes into one `uow.run`. |
| Row types above repositories | `reviews/{service,run-executor,diff-loader,helpers}.ts`, `repos/helpers.ts` | Map in the repository and change signatures to contract shapes, one call site at a time. |
| Repositories reading other modules' tables | `reviews/repository/pull.repo.ts`, `run.repo.ts`, `pulls/repository.ts`, `repo-intel/repository.ts` | Ask the owning module through a facade port. |
| Row-level agents API used by reviews | `AgentsRepository.getById/listEnabled` | Give reviews an agents facade returning `Agent` contracts, then drop the row methods. |

Full registry: [devdigest-map.md](devdigest-map.md).
