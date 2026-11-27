# Agents module as the onion reference

**Status:** done
**Milestone:** — (architecture refactor, lab L02; no user-facing feature)
**Modules touched:** server · client (`@devdigest/shared` copy only)

## Goal
Make `server/src/modules/agents/` the reference module of the onion architecture (skill
`onion-architecture`): rules in the domain ring, use cases on narrow ports, persistence behind a
repository and a unit of work, routes that only parse, call one use case and serialize. Other
modules copy it, so its behaviour is pinned here.

## Scope
- In: `domain.ts`, `ports.ts`, `service.ts`, `repository.ts`, `routes.ts`, `schemas.ts`; the
  composition root wiring (`platform/container.ts`: `agentsRepo`, `agentsUow`); request bodies
  in `@devdigest/shared`; tests per ring.
- Out: the reviews module still reads agents through `container.agentsRepo.getById/listEnabled`
  (row-level, known debt); no UI change.

## Contract changes
- New in both copies of `contracts/knowledge.ts`: `AgentCreateBody`, `AgentUpdateBody`
  (`AgentCreateBody.partial()`), `AgentSkillsSetBody`, `AgentSkillLinkBody` and
  `AgentSkillsBody` (union of the two strict bodies).
- `POST /agents/:id/skills` accepts exactly one of `{ skill_ids: uuid[] }` (unique ids, case
  insensitive) or `{ skill_id: uuid, order?: 0 … 2³¹−1 }`. A body that mixes them, repeats an id
  or sends an order out of range is rejected with 422.
- Every agents route declares a `response` schema (`AgentList`, `Agent`, `AgentVersionList`,
  `AgentVersion`, `AgentSkillLinkList`, `ModelInfoList`, `Ok`); fields outside the contract are
  dropped, a value that does not fit the schema becomes a 500.
- No DB schema change, no migration.

## Behaviour
- `POST /agents` inserts the agent and its version-1 snapshot in one transaction.
- `PUT /agents/:id` locks the agent row (`SELECT … FOR NO KEY UPDATE`) for the whole transaction. A
  config change (anything but `enabled`) bumps the version and snapshots the new config; an
  `enabled`-only change keeps the stored version. Concurrent edits get consecutive versions and
  every snapshot matches the config it records.
- Snapshots are workspace-scoped and idempotent per `(agent_id, version)`.
- `POST /agents/:id/skills` with `skill_ids` replaces the ordered set atomically; with
  `skill_id` it upserts one link, appended unless `order` is given. Both run in one unit of work
  with the agent row locked (concurrent appends get distinct positions), and every skill must
  belong to the agent's workspace: another tenant's or an unknown id is a 422 and links nothing.
- A stored snapshot that no longer matches `AgentVersionConfig` is a 500 (server data), never
  a 422 (client input).
- `GET /agents/:id/models` lists the models of the agent's provider (`[]` when the provider key
  is missing); 404 for an agent of another workspace.

## Acceptance criteria
- [x] Use cases run against fakes of their own ports: `test/agents-service.test.ts`.
- [x] Domain rules are pure: `test/agents-domain.test.ts`.
- [x] The fake and the Drizzle repository pass the same `agentsStoreContract`
  (`test/helpers/agents-store-contract.ts`).
- [x] Postgres: versions, workspace scoping, unit-of-work rollback, concurrent edits and every
  route with a response schema: `test/agents-versions.it.test.ts`.
- [x] `bash ../.claude/skills/onion-architecture/scripts/check-boundaries.sh` passes.

## Open questions
- Move the reviews module to a facade that returns contract shapes instead of rows (removes the
  last row-level methods of `AgentsRepository`).
