# e2e/ — @devdigest/e2e

Read first: `e2e/INSIGHTS.md` (lessons). Reference: `e2e/README.md` (flow format, env knobs,
coverage table).

## Commands
```sh
npm i -g agent-browser && agent-browser install   # once: CLI + Chrome for Testing
./scripts/e2e.sh                                   # from repo root: isolated seeded stack, run, tear down
cd e2e && npm install && npm test                  # against an already running stack
cd e2e && npm run typecheck
```

## Layout
- `specs/NN-name.flow.json` — one flow = ordered list of agent-browser commands
- `run.ts` — runner: runs steps in one browser session, screenshots on failure
- `lib/assert.ts` — step types, `{BASE}` substitution, `stdoutIncludes` check
- `agent-browser.json` — CLI config

## Conventions
- Deterministic locators only: `wait --url`, `wait --text`, `find role|text|label`.
  Never use the AI `chat` command; flows must run without an LLM key.
- Flows are read-only and target seeded data (`acme/payments-api`, PR #482, built-in agents).
  Do not submit forms or start reviews.
- `wait --text` / `wait --url` are the assertions: a step fails on non-zero exit.
- Name new flows with the next free number; one main user journey per flow.

## Gotchas
- Flows 02/04/05 follow the root redirect to the FIRST repo, so they fail against a dev DB
  that holds other repos. Prefer `./scripts/e2e.sh` (ports 5433/3101/3100, ephemeral Postgres).
- The hermetic stack runs from Git Bash on Windows, like the other scripts.
- Failure screenshots land in `e2e/test-results/` (git-ignored, uploaded by CI).

## Do not touch
- Never `docker compose down -v` to reset: it deletes the `devdigest_pgdata` volume with every
  imported repo and review.
- Seed fixtures in `server/src/db/seed.ts` that flows rely on: change both together.

## Read when
- You add a flow or a new locator kind → `README.md` (flow format)
- You change UI text or routes used by a flow → grep `specs/*.flow.json` for it first
- You need a deep dive or a feature spec → `docs/`, `specs/` (template: `../specs/_TEMPLATE.md`)

## After you finish
Append lessons to `e2e/INSIGHTS.md` (append-only, fixed sections).
