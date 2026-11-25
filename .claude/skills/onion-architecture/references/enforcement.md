# Enforcement: the checks, the baselines, the hook

Prose rules decay; checks don't. Sairyss and the marcoturi Fastify boilerplate both enforce layer
boundaries with dependency-cruiser in hooks and CI. Here the checks run locally (no CI, by
decision) and after every agent edit through a Claude Code hook.

## Contents

- [1. Running the checks](#1-running-the-checks)
- [2. Where the rings come from](#2-where-the-rings-come-from)
- [3. Dependency rules (dependency-cruiser)](#3-dependency-rules-dependency-cruiser)
- [4. Convention rules (ast-grep)](#4-convention-rules-ast-grep)
- [5. Contract parity](#5-contract-parity)
- [6. Baselines](#6-baselines)
- [7. The Claude Code hook](#7-the-claude-code-hook)
- [8. The module scaffold](#8-the-module-scaffold)
- [9. Adding or changing a rule](#9-adding-or-changing-a-rule)
- [10. Gotchas](#10-gotchas)
- [11. Alternatives](#11-alternatives)

## 1. Running the checks

```sh
bash .claude/skills/onion-architecture/scripts/check-boundaries.sh        # new violations only
bash .claude/skills/onion-architecture/scripts/check-boundaries.sh --all  # include known debt
```

Exit code is non-zero when any check finds a new violation. Each error names the rule, the
file (and import or line), and the fix. Requires `pnpm install` in `server/` (dependency-cruiser
and `@ast-grep/napi` are server dependencies). Runs in ~1–2 s.

## 2. Where the rings come from

`server/.onion-rings.cjs` defines each ring as path regexes relative to `server/` (reviewer-core
paths start with `../reviewer-core/`). Both the dependency-cruiser config and the convention
script read it, so a new ring folder or file name is added in one place.

## 3. Dependency rules (dependency-cruiser)

Config: `server/.dependency-cruiser.cjs`. Type-only imports count (`tsPreCompilationDeps`), so
`import type { AgentRow }` in a service is a violation. Path aliases resolve through
`server/tsconfig.json`.

| Rule | Forbids | Typical fix |
|---|---|---|
| `domain-not-to-outer-rings` | domain → application, infrastructure, http, root | pass values in; move the importer outward |
| `application-not-to-outer-rings` | use case/port → repository, adapters, `db/`, routes, container | declare a port in `ports.ts`, inject the implementation |
| `core-no-io-libraries` | domain/application → fastify, drizzle, postgres, openai, octokit, simple-git, ast-grep, `fs`, `child_process`, … | put the call behind a port; `zod` is allowed |
| `http-not-to-infrastructure` | routes/schemas → repositories, adapters, `db/`, drizzle | get the use case's deps from the container; move SQL to a repository |
| `infrastructure-not-to-http` | repositories, adapters, `db/` → routes, schemas, `modules/_shared` | return contract shapes from `@devdigest/shared`; the HTTP ring maps them |
| `root-only-as-types` | any `src/` file outside the root → `container.ts`, `app.ts`, `modules/index.ts` (value imports) | `import type { Container }`; receive values through constructor deps |
| `adapters-only-from-composition-root` | anything but `container.ts`/`app.ts`/adapters → `src/adapters/**` | depend on the port, construct in the container |
| `adapters-not-to-modules` | adapters → `src/modules/**`, `db/seed` | move the constant into the port or the adapter's config |
| `no-cross-module-internals` | `modules/a` → `modules/b/*` except `index.ts`/`types.ts` | use b's facade (via the container) |
| `no-test-doubles-in-src` | `src/**` → `adapters/mocks.ts` | inject doubles from tests |
| `reviewer-core-stays-core` | reviewer-core src/test → `server/src` except `vendor/shared` | own fakes in reviewer-core tests |
| `reviewer-core-no-io` | reviewer-core src → drizzle, postgres, fastify, `fs`… | data arrives through `ReviewInput` |
| `reviewer-core-sdk-only-in-llm` | reviewer-core src outside `llm/` → `openai` | talk to the `LLMProvider` port |
| `no-circular` | runtime import cycles (type-only cycles allowed) | extract a port or move the shared piece inward |
| `not-to-unresolvable` | imports that don't resolve | fix the path; unresolved imports hide dependencies |

## 4. Convention rules (ast-grep)

Script: `scripts/check-conventions.mjs` (uses the server's `@ast-grep/napi`).

| Rule | Scope | Catches | Fix |
|---|---|---|---|
| `route-declares-response` | route files | `app.get/post/…('/path', …)` without `schema.response` | add `response: { 200: Contract }` |
| `route-throws-errors` | route files | `reply.code(4xx/5xx)` / `reply.status(4xx/5xx)` | throw `NotFoundError`/`ValidationError`/… |
| `core-no-ambient-io` | domain, application, reviewer-core (not `llm/`) | `process.env`, `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` | inject `now`/`newId`/config; secrets via `SecretsProvider` |
| `service-takes-narrow-deps` | application | a constructor parameter typed with `Container` | `deps` object with the ports it needs |
| `adapter-built-in-root` | everything but the composition root, reviewer-core `llm/` and tests | `new OpenRouterProvider(…)` (any class exported from `reviewer-core/src/llm/`) | depend on `LLMProvider`; construct in `container.ts` |
| `tests-fake-own-ports` | tests | `vi.mock('drizzle-orm' \| 'openai' \| 'postgres' \| 'octokit' \| 'simple-git' \| 'fastify' …)` | fake the port; integration-test the adapter |

Known gap of the import rules: dependency-cruiser checks direct edges only, and the
`@devdigest/reviewer-core` and `@devdigest/shared` barrels (`index.ts`) belong to no ring. An
import through a barrel is therefore judged by the barrel, not by what it re-exports.
`adapter-built-in-root` closes the dangerous case (constructing reviewer-core's LLM adapter
outside the root); for anything else imported through a barrel, review the import by hand.

Deliberate exceptions: a comment on the line above the hit,
`// onion-allow route-declares-response: SSE stream, no JSON body`. Use sparingly and always with
a reason; reviewers should question every allow.

## 5. Contract parity

Script: `scripts/check-shared-parity.mjs`. Compares `server/src/vendor/shared` (canonical) with
`client/src/vendor/shared` line by line per file (order-insensitive). Adding the same lines to
both copies passes even while old drift is recorded; changing one copy fails.

## 6. Baselines

| Check | Baseline in `server/` | Refresh |
|---|---|---|
| dependency rings | `.dependency-cruiser-known-violations.json` | `./node_modules/.bin/depcruise src ../reviewer-core/src ../reviewer-core/test --config .dependency-cruiser.cjs --output-type baseline --output-to .dependency-cruiser-known-violations.json` |
| conventions | `.onion-conventions-known.json` | `node ../.claude/skills/onion-architecture/scripts/check-conventions.mjs --update-baseline` |
| contract parity | `.shared-parity-known.json` | `node ../.claude/skills/onion-architecture/scripts/check-shared-parity.mjs --update-baseline` |

- A baseline is a record of debt, not a permission slip. Refresh it **only** after removing debt
  (the scripts print "no longer occur") or when a dependency upgrade changes a resolved path.
  Adding a new violation to it requires the user's explicit agreement.
- Review baseline diffs in PRs: a growing baseline is a regression.
- Known entries are matched by rule + from → to (dependency rules) or rule + file + source text
  (conventions, parity), never by line number. Editing a baselined line without fixing it turns it
  into a *new* violation: fix it while you are there (e.g. add the missing `response`).

## 7. The Claude Code hook

`.claude/settings.json` registers a `PostToolUse` hook on `Edit|Write|MultiEdit`:

```json
{ "type": "command",
  "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/onion-architecture/scripts/hook-post-edit.mjs\"" }
```

`hook-post-edit.mjs` reads the edited path from the hook payload and runs the three checks only
for `server/{src,test}`, `reviewer-core/{src,test}`, `client/src/vendor/shared` and the ring
configs. On new violations it exits 2 with the report on stderr, which Claude Code feeds back to
the agent; otherwise it is silent. It needs only Node (no bash or jq). Disable or inspect it via
`/hooks`. Without `server/node_modules` it skips silently.

## 8. The module scaffold

`node .claude/skills/onion-architecture/scripts/new-module.mjs <name> [--entity <Name>]` writes
`domain.ts`, `ports.ts`, `service.ts`, `repository.ts` (with `TODO(scaffold)` persistence),
`schemas.ts`, `routes.ts` and two fake-based test files, then prints the wiring steps (contract,
table + migration, container getters, registry). It refuses to overwrite a module and registers
nothing by itself. The generated code passes all three checks.

## 9. Adding or changing a rule

1. Write the rule (dependency-cruiser `forbidden` entry, or a `RULES` entry in
   `check-conventions.mjs`) with a `comment`/`message` that says how to fix it.
2. Run with `--all`; read every hit. False positives mean the rule or the ring patterns are
   wrong. Fix those first.
3. Plant one violation and confirm the check fails; remove it.
4. Record remaining true positives in the baseline, list them in
   [devdigest-map.md](devdigest-map.md), and bump the skill's MINOR version (README changelog).

## 10. Gotchas

- **Don't `exclude` `node_modules` in dependency-cruiser options.** Excluded modules vanish as
  dependency targets, so rules matching `node_modules/drizzle-orm` silently never fire. Use
  `doNotFollow` instead (the config does).
- `enhancedResolveOptions.extensionAlias` is not accepted by dependency-cruiser 17's schema;
  `.js` → `.ts` resolution works through the tsconfig without it.
- `pnpm exec` in this repo prints install chatter to stdout; scripts call
  `./node_modules/.bin/depcruise` directly so JSON output stays parseable.
- Resolved npm paths include the pnpm store hash (`node_modules/.pnpm/drizzle-orm@0.38.4_…`).
  After upgrading such a package, known entries stop matching and reappear as new: refresh the
  baseline in the same change, after checking nothing else moved.
- The repo-intel indexer also uses dependency-cruiser (on cloned repos, through its API with
  explicit options); the `.dependency-cruiser.cjs` in `server/` doesn't affect it.

## 11. Alternatives

- **eslint-plugin-boundaries** v7 (`boundaries/elements` + `boundaries/dependencies` with
  `default: "disallow"`) or **`import/no-restricted-paths`** zones: same rules as lint errors in
  the editor. Worth it if the server gets ESLint.
- **ArchUnitTS** / **ts-arch**: architecture rules as Vitest tests
  (`projectFiles().inFolder('src/domain/**').shouldNot().dependOnFiles()…`).
- **TypeScript project references** separate compilation units but don't by themselves forbid
  imports from unreferenced projects; weaker than the rules above.
