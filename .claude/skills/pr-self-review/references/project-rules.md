# Lane `project-rules`

Built-in lane: reviews **every** changed file (including deleted and binary ones) against the
project's written rules, not a skill. The rules change over time, so read them from the source
instead of relying on this summary.

## Sources (read first)

1. Root `CLAUDE.md`: "Non-default conventions", "Gotchas", "Do not touch".
2. The `CLAUDE.md` of every module that has changed files: `client/`, `server/`,
   `reviewer-core/`, `e2e/`, `server/src/modules/repo-intel/` ("Conventions", "Do not touch").

## How to work

1. **Triage by path first.** Many files (docs, skill references, evals) cannot break a rule;
   skim their names and move on. Open diffs only for files that can touch a rule below.
2. For each rule, decide from the diff whether the change breaks it. Report a broken rule with
   the source in `rule` (for example `server/CLAUDE.md › Do not touch`).
3. Do not repeat what skill lanes cover (ring placement, React patterns, Zod API use).

## Checklist

| Rule | Look at | Typical severity |
|---|---|---|
| Applied migrations and `meta/` snapshots are never edited or deleted; new ones come from `pnpm db:generate` | `server/src/db/migrations/**` (status M or D on an existing file) | critical |
| Schema change has a matching new migration | `server/src/db/schema*.ts` changed, no new `migrations/*.sql` | critical |
| `@devdigest/shared` changed in both copies | one of `server/src/vendor/shared/**`, `client/src/vendor/shared/**` changed without the other | critical when a contract shape differs; major when the client copy already drifted (see client/CLAUDE.md Gotchas) |
| Secrets only through `SecretsProvider`; no keys from `process.env`, AppConfig or the DB | new `process.env.*KEY*`, `apiKey:` literals, `.env` committed | critical |
| Runtime data and secrets are not committed | `server/clones/**`, `.env`, `~/.devdigest/**`, `*.log` | critical |
| No package becomes an npm dependency of another (no workspace) | `package.json` dependencies pointing at `../server`, `../reviewer-core`, `file:` or `workspace:` | critical |
| `reviewer-core`: `INJECTION_GUARD`, `<untrusted>` wrapping, `groundFindings`, `SEVERITY_PENALTY`, prompt section order | `reviewer-core/src/**` | critical without a spec in `specs/` or `reviewer-core/specs/` |
| Seed fixtures (`acme/payments-api`, PR #482, built-in agents), `DEFAULT_WORKSPACE_NAME`, `SYSTEM_USER_EMAIL` | `server/src/db/seed.ts` | critical |
| `INDEXER_VERSION`, reserved repo-intel facade methods | `server/src/modules/repo-intel/**` | critical |
| Client `SEV`/`CAT` tokens, `NEXT_PUBLIC_API_BASE` default, `ApiError` shape | `client/src/vendor/ui/primitives/tokens.ts`, `client/src/lib/**` | critical |
| Empty tables in the DB schema are not dropped | `server/src/db/schema*.ts` | critical |
| New entries in onion baselines (`server/.dependency-cruiser-known-violations.json`, `server/.onion-conventions-known.json`, `server/.shared-parity-known.json`) | those files gained entries | critical unless the user agreed (then major, say so) |
| DB-backed tests are named `*.it.test.ts`; other tests stay hermetic | new tests that import `test/helpers/pg.ts` or testcontainers without the suffix | major |
| e2e flows stay read-only, deterministic locators, no AI `chat` command | `e2e/**` | major |
| Client: data through hooks in `lib/hooks`, strings through `useTranslations`, UI from `@devdigest/ui`, new UI component added to `src/components/showcase` | `client/src/**` | major |
| Server: routes use the Zod type provider, `getContext` + `workspaceId` scoping, `AppError` subclasses, SQL only in repositories | `server/src/modules/**` | major (critical if a workspace scope is missing on workspace data) |
| A feature has a spec in `specs/` or `<module>/specs/` | new module, route or page without a spec | minor |
| Lessons recorded: a touched module's `INSIGHTS.md` updated for non-trivial work | `client/`, `server/`, `reviewer-core/`, `e2e/` changes without an `INSIGHTS.md` change | nit |
| Commit messages (if commits exist): commitlint config-conventional, header ≤ 100 chars | `git log --format=%s <base>..HEAD` (base SHA from your prompt) | minor |
