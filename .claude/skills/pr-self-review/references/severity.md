# Severity rubric

One rubric for every lane. **Critical blocks the PR**, so it needs proof: a cited line, quoted
code and a concrete scenario that a realistic input or state triggers. Without that, the
finding is at most `major`.

| Severity | Meaning | Gate |
|---|---|---|
| `critical` | Merging would break something or open a hole: a vulnerability, data loss or corruption, a broken build, typecheck or test, a crash on a main path, or a violation of a rule the project marks as "do not touch" | Blocks PR, merge and push |
| `major` | A real defect or a clear violation of the owning skill's rules that does not break anything yet: wrong ring, missing validation on a non-public path, logic in the wrong layer, missing tests for new logic, wrong error mapping | Reported, does not block |
| `minor` | A local improvement with a concrete benefit: naming that misleads, a missing edge-case test, duplication that the skill says to avoid | Reported |
| `nit` | Taste, wording, formatting | Reported, may be summarised |

## Critical: examples per lane

| Lane | Critical when the change… |
|---|---|
| security | lets untrusted input reach SQL, a shell, a file path or HTML without validation or escaping; skips an auth or workspace check on a route; commits a secret; reads an API key from `process.env` or stores it in AppConfig/DB instead of `SecretsProvider`; interpolates untrusted text into an LLM system message |
| onion-architecture | adds a new boundary violation the onion check reports (domain/application importing infrastructure, Drizzle rows leaving a repository into the contract, a service that `new`s an adapter); puts `openai` or I/O into `reviewer-core` outside `src/llm/` |
| fastify-best-practices | registers a route without request validation where the body reaches the DB; breaks the error envelope `{ error: { code, message } }` the client parses; leaks stack traces or internals to clients |
| drizzle-orm-patterns | writes several rows of one operation without a transaction where a failure leaves inconsistent data; a query without a `workspaceId` filter on workspace data |
| postgresql-table-design | edits an applied migration or a `meta/` snapshot; a migration that drops or rewrites data without a safe path; a schema change with no generated migration |
| zod | changes a `@devdigest/shared` contract in one copy only; makes the server accept input the contract was meant to reject; changes a response shape the client depends on without updating it |
| frontend-ui-architecture, react-best-practices, next-best-practices | a render loop, a conditional hook call, a crash on a main page; a secret or server-only token shipped to the browser (`NEXT_PUBLIC_*` with a secret); `fetch` from a component that bypasses the error UX for a mutation |
| react-testing-library | a test change that makes a failing behaviour pass silently (assertion removed, `skip`/`only` left in) |
| typescript-expert | `strict` or `noUncheckedIndexedAccess` turned off; a type assertion that hides a real runtime mismatch on a main path |
| project-rules | touches anything under "Do not touch" in the root or module `CLAUDE.md` (applied migrations, `INJECTION_GUARD`, grounding rules, `SEVERITY_PENALTY`, seed fixtures `acme/payments-api` PR #482, `DEFAULT_WORKSPACE_NAME`, `INDEXER_VERSION`, `SEV`/`CAT` tokens) without a spec; commits `.env`, `server/clones/` or secrets; adds one package as an npm dependency of another; adds a new violation to an onion baseline file |

## Not critical

- Pre-existing problems the change does not touch or worsen (report nothing).
- A rule violation with no runtime or security impact: `major` (wrong folder, fat route,
  missing response schema on an internal route).
- Missing tests: `major` for new business logic, `minor` otherwise.
- Anything the reviewer could not confirm by reading the code: `major` with the doubt stated.
- Documentation-only changes: at most `minor`, unless they contradict a "Do not touch" rule.

## Checks

`record.mjs` turns deterministic checks into findings itself: a failed onion check, typecheck
or unit-test run is `critical`; a check skipped because dependencies are not installed is
`major`. Reviewers do not repeat these.
