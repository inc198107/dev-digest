# DevDigest — project map for Claude

Local-first AI pull-request review. Course starter: one end-to-end flow (import PR → agent
review); milestones M1–M8 add features back (see `README.md#roadmap`).

## Before you start
- Read `<module>/CLAUDE.md` and `<module>/INSIGHTS.md` for every module you will touch.
  Treat INSIGHTS as high-confidence guidance unless the user says otherwise.
- Module rules live only in the module's `CLAUDE.md`; this file holds what is shared.

## Stack
- Node ≥ 22 · TypeScript 5.7 strict (`noUncheckedIndexedAccess`) · ESM everywhere
- server: Fastify 5 · Drizzle ORM 0.38 · Postgres 16 + pgvector (Docker) · Zod 3 · Vitest 2
- client: Next.js 15 (App Router) · React 19 · TanStack Query 5 · next-intl · Vitest + RTL
- reviewer-core: pure TS review engine; LLM via OpenRouter (openai SDK, custom baseURL)
- e2e: agent-browser CLI driven by JSON flow specs

## Map
| Path | What | Package manager |
|---|---|---|
| `server/` | Fastify API :3001, DB schema, repo-intel (`src/modules/repo-intel/`) | pnpm |
| `client/` | Next.js studio :3000 | pnpm |
| `reviewer-core/` | review engine, imported by server as TS source | npm |
| `e2e/` | deterministic browser flows | npm |
| `docs/` | cross-module docs (`docs/agent-prompts/`) | — |
| `specs/` | cross-module feature specs (`specs/_TEMPLATE.md`) | — |

Every module has: `CLAUDE.md` (rules) · `README.md` (reference) · `docs/` (deep dives) ·
`specs/` (module-local feature specs) · `INSIGHTS.md` (lessons, append-only).

## Commands
```sh
./scripts/dev.sh                     # Postgres + migrate + seed + API + web (Git Bash on Windows)
docker compose up -d                 # Postgres only
cd server && pnpm db:migrate && pnpm db:seed
cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, hermetic
cd server && pnpm exec vitest run .it.test                      # integration, needs Docker
cd client && pnpm test && pnpm typecheck
cd reviewer-core && npm test && npm run typecheck
./scripts/e2e.sh                     # hermetic e2e stack on ports 5433/3101/3100
```

## Non-default conventions
- No workspace: packages share code via tsconfig `paths` (source imports, no build step).
  Never add one package as an npm dependency of another.
- `@devdigest/shared` exists twice: `server/src/vendor/shared` (canonical; reviewer-core reads it)
  and `client/src/vendor/shared`. Changing a contract means changing both copies.
- Zod contracts drive route validation, response serialization, client types and the LLM
  JSON Schema. Change the contract first, then the code.
- Secrets only through `SecretsProvider`; `~/.devdigest/secrets.json` overrides `.env`.
  Never read API keys from `process.env` or store them in AppConfig or the DB.
- DB-backed tests must be named `*.it.test.ts`; everything else must stay hermetic.
- Commit messages follow commitlint `@commitlint/config-conventional`:
  `type(scope?): subject`, lowercase type, no trailing period, header ≤ 100 chars.

## Gotchas
- The server does NOT migrate on boot. `pnpm db:seed` is mandatory, not optional: the
  no-auth provider resolves the seeded user and workspace on every request.
- `reviewer-core` needs its own `npm ci`, otherwise the API crashes with ERR_MODULE_NOT_FOUND.
- Seeded agents use provider `openrouter`; reviews fail without `OPENROUTER_API_KEY`.
- Review run state (RunBus) and the job queue live in API memory: one API instance per DB,
  and a restart orphans running runs (reaped on next boot).
- Windows: run `scripts/*.sh` from Git Bash, not PowerShell.

## Do not touch
- Applied migrations in `server/src/db/migrations/`; generate new ones with `pnpm db:generate`.
- Grounding gate, score formula and `INJECTION_GUARD` in `reviewer-core/` without a spec.
- Seed fixtures `acme/payments-api` PR #482: e2e flows depend on them.
- Empty tables in the DB schema: reserved for later milestones, do not drop.
- `server/clones/`, `.env`, `~/.devdigest/`: runtime data and secrets.

## Read when
- You need architecture or the request flow → `README.md#architecture`, `server/README.md`
- You add or change an API route → `server/README.md` (API map, error envelope)
- You touch the review prompt or its output → `docs/agent-prompts/README.md`
- You use repo-intel data → `server/src/modules/repo-intel/README.md`
- You write tests or touch CI → `TESTING.md`
- You start a feature → its spec in `specs/` (cross-module) or `<module>/specs/`;
  if none exists, write one from `specs/_TEMPLATE.md` first

## After you finish
- Append lessons to the `INSIGHTS.md` of every module you touched (append-only, fixed
  sections). Do not skip this step.
