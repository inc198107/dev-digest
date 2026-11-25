# Driven adapters: LLM, GitHub, git, filesystem and friends

Everything that talks to the outside world (an API, a process, the disk, the clock) sits behind a
port and is constructed only by the composition root.

## Contents

- [1. The pattern](#1-the-pattern)
- [2. Where ports live](#2-where-ports-live)
- [3. LLM adapters (openai SDK, OpenRouter, Anthropic)](#3-llm-adapters-openai-sdk-openrouter-anthropic)
- [4. GitHub, git, filesystem, ast-grep, tokenizer](#4-github-git-filesystem-ast-grep-tokenizer)
- [5. Secrets and configuration](#5-secrets-and-configuration)
- [6. Clock, ids, randomness, logging, progress](#6-clock-ids-randomness-logging-progress)
- [7. reviewer-core is the core](#7-reviewer-core-is-the-core)
- [8. Adding a new external system](#8-adding-a-new-external-system)

## 1. The pattern

A **gateway** is "an object that encapsulates access to an external system or resource"
(Fowler). It translates a convenient, core-shaped API into the foreign one and is easy to stub.

```
use case ──depends on──▶ port (interface, core vocabulary)
                              ▲
              implements ─────┘
adapter (SDK, HTTP, fs) ◀── constructed by ── composition root (platform/container.ts)
```

- Adapters **translate; they don't decide**. Retrying a transient error is translation; choosing
  which agent to run is a decision.
- Adapters convert SDK errors into application errors at the boundary (`ExternalServiceError`,
  `ConfigError`), so the core never catches `OpenAI.APIError` or `RequestError` from Octokit.
- Adapters parse what comes back (Zod) when the shape matters to the core. "Parse, don't
  validate": the core receives typed values or an error, never `any`.
- Don't let a vendor's serialization format "become your internal architecture" (Tian Pan): the
  port returns the core's types (`UnifiedDiff`, `StructuredResult<T>`, `ModelInfo`).

## 2. Where ports live

| Port | Location | Implementations |
|---|---|---|
| `LLMProvider`, `Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`, `AuthProvider`, `SecretsProvider` | `@devdigest/shared` `adapters.ts` (both copies) | `src/adapters/*`, reviewer-core `llm/openrouter.ts`, `adapters/mocks.ts` |
| `RepoIntel` (module facade) | `modules/repo-intel/types.ts` | `RepoIntelService` |
| Module-specific (`AgentsStore`, `AgentsUnitOfWork`) | `modules/<name>/ports.ts` | the module's `repository.ts` |
| `DepGraph`, `Tokenizer` | next to their implementation in `src/adapters/*` (known debt) | `DepCruiseGraph`, `TiktokenTokenizer` |

A port shared by several modules or by reviewer-core goes to `@devdigest/shared`; a port used by
one module stays in its `ports.ts`.

## 3. LLM adapters (openai SDK, OpenRouter, Anthropic)

- The core depends on `LLMProvider` (`listModels`, `complete`, `completeStructured<T>`, `embed`).
  Use cases get it through a dependency such as `llm: () => Promise<LLMProvider>` built from
  `container.llm(id)`, which resolves the key through `SecretsProvider` and caches the client.
- **Structured output:** pass the Zod schema in `completeStructured({ schema, schemaName, … })`.
  The output shape is enforced by the JSON Schema in `response_format`, never by prompt text, and
  the result is validated against the same schema (with repair) before it reaches the core.
- **Timeouts and retries are explicit.** openai-node defaults to 2 retries and a **10-minute**
  timeout; set `timeout`/`maxRetries` on the client or per request (`timeoutMs`, `maxRetries` in
  `StructuredRequest`). `withTimeout` in `platform/resilience.ts` does not cancel work: pass an
  `AbortSignal` when the call must stop.
- **Errors:** `APIError`, `RateLimitError`, `APIConnectionTimeoutError` become
  `ExternalServiceError` in the adapter.
- **OpenRouter** uses the OpenAI SDK with `baseURL: 'https://openrouter.ai/api/v1'`; attribution
  headers are `HTTP-Referer` and `X-OpenRouter-Title` (not the old `X-Title`).
- **Cost** is injected (`estimateCost` from `PriceBook`), so the engine holds no pricing table.
- No agent framework in the core: "start using LLM APIs directly" (Anthropic, Building effective
  agents). Prompt assembly is domain logic and lives in reviewer-core.
- Untrusted text (diff, PR body, repo-derived content) is wrapped with `wrapUntrusted` and never
  interpolated into the system message (reviewer-core rule).

## 4. GitHub, git, filesystem, ast-grep, tokenizer

- GitHub through `GitHubClient` (`container.github()`), git through `GitClient`
  (`container.git`), never `simple-git` or `octokit` in a module.
- **The clone is not the PR.** Clones are `--depth 1` of the default branch and usually lack the
  PR head SHA, so `GitClient.readFile` (working tree) returns base-branch content. Read PR files
  at `pull.headSha` after `fetchPullHead` (a ref-aware port method), or through `GitHubClient`.
- **Filesystem reads are I/O.** A use case that needs file contents asks a port
  (`GitClient`/`CodeIndex` or a new one) and gets strings back. `node:fs` in `modules/**` is a
  violation (today: repo-intel `service.ts` and `pipeline/*`, recorded as debt).
- ast-grep and the tokenizer are adapters too: modules receive them from the container
  (`container.tokenizer`), not by importing `src/adapters/astgrep`.
- Pure parsers (`parseUnifiedDiff`) are not adapters. If the core needs one, move it to the core
  (domain helper or reviewer-core) instead of importing it from `src/adapters/`.

## 5. Secrets and configuration

- Secrets only through `SecretsProvider` (`~/.devdigest/secrets.json` overrides `.env`). Never
  `process.env.X_API_KEY`, never in `AppConfig` or the DB.
- Non-secret configuration is parsed once by `platform/config.ts` (Zod over env) and handed to
  adapters by the root. Use cases receive the specific values they need, not the config object.
- After a key changes, `container.invalidateSecretCaches()` drops cached clients.

## 6. Clock, ids, randomness, logging, progress

- `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()` in the core make tests flaky and
  rules untestable. Inject `now: () => Date` / `newId: () => string` into the use case's deps;
  domain functions take `now: Date` as an argument. The convention check flags these calls.
- Logging: inject a narrow `Logger` interface (`info`, `warn`, `error`) if the core needs one;
  don't pass Fastify's logger or `req.log`.
- Progress and cancellation: callbacks in the input, like reviewer-core's
  `onEvent(kind, message)` and `checkCancelled()`; the server connects them to RunBus.

## 7. reviewer-core is the core

reviewer-core is the domain and application core of reviews:

- No DB, filesystem, GitHub or `process.env`; everything arrives as arguments; the only side
  effect is the injected `LLMProvider` (its CLAUDE.md).
- `src/llm/` is its only infrastructure folder (`openrouter.ts`, and `structured.ts`, which
  imports `openai/helpers/zod`). The boundary check allows `openai` only there.
- New inputs are plain fields on `ReviewInput`; the server's run executor gathers them through
  ports (repo-intel facade, git) and passes values in.
- A new prompt section changes the documented section order (a reviewer-core "do not touch"):
  write a spec first and update `docs/agent-prompts/README.md` in the same change.
- New public API is exported only through `src/index.ts`.
- Tests use their own fakes of `LLMProvider`; `test/run.test.ts` still imports
  `server/src/adapters/mocks.ts` (known debt).

## 8. Adding a new external system

1. Declare the port in the core's vocabulary (shared `adapters.ts` if used by several modules
   or reviewer-core, else the module's `ports.ts`).
2. Implement it in `src/adapters/<system>/` with explicit timeouts, retries and error mapping.
3. Add a fake to `adapters/mocks.ts` (shared ports) or the test file (module ports), and a
   `ContainerOverrides` entry if HTTP tests need to swap it.
4. Construct it in `platform/container.ts` (lazy getter or async factory when it needs a secret).
5. Inject it into the use case through the routes plugin.
6. Run the boundary check.
