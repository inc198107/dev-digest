# <Feature name>

> Copy this file to `specs/<feature>.md` (cross-module) or `<module>/specs/<feature>.md`
> (module-local). Write it before implementation; keep it updated until the feature ships.

**Status:** draft | approved | in progress | done
**Milestone:** M<n>
**Modules touched:** server · client · reviewer-core · e2e

## Goal
One or two sentences: what the user gets and why.

## Scope
- In: …
- Out: …

## Contract changes
Zod contracts in `@devdigest/shared` (remember both copies), DB schema / migrations,
new or changed routes.

## Behaviour
Key flows and edge cases (empty data, failures, stale state).

## Acceptance criteria
- [ ] …
- [ ] Tests: which suites cover it (client / server-unit / server-integration / reviewer-core / e2e)

## Open questions
- …
