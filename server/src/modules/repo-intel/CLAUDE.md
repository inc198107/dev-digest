# repo-intel — codebase indexer (inside server/)

Read first: `INSIGHTS.md` in this folder. Reference: `README.md` in this folder (pipeline,
facade methods, routes). Server-wide rules: `../../../CLAUDE.md`.

## Layout
- `service.ts` — `RepoIntelService`, the facade behind `container.repoIntel`; registers jobs
- `types.ts` — the `RepoIntel` interface and result shapes
- `pipeline/` — `full.ts`, `incremental.ts`, `walk.ts`, `rank.ts`, `repo-map.ts`
- `repository.ts` — Drizzle access to symbols, references, file_edges, file_rank, repo_map_cache,
  repo_index_state
- `constants.ts` — job kinds, limits, budgets

## Conventions
- Consumers read only through the facade (`container.repoIntel.*`), never through
  `pipeline/` or the repository.
- Facade methods degrade instead of throwing: unindexed, partial or disabled → `[]` or an
  object with `degraded: true`. Keep that contract for every new method.
- Indexing is write-once on clone/resync; review-time calls must stay read-only and cheap.
- `pipeline/rank.ts` is pure (no DB, git or clock); keep it that way.

## Gotchas
- Only `.ts .tsx .js .jsx .mjs .cjs` are indexed; other languages get no repo map or callers.
- Full index has a soft budget `INDEX_SOFT_BUDGET_MS` (110 s) under the 120 s JobRunner timeout;
  hitting it ends with status `partial` and skips rank and repo map.
- File rank is PageRank only; `hotness` stays 0 because clones are shallow (`CLONE_DEPTH = 1`).
- Job handlers are registered in `routes.ts` at plugin load; a missing handler makes
  `jobs.enqueue` throw and callers silently skip indexing.
- Header comments in `service.ts` still call the facade a "skeleton"; the code is complete.
- Enabled by `REPO_INTEL_ENABLED` (default true) and per agent by `agents.repo_intel`.

## Do not touch
- `INDEXER_VERSION`: bumping it forces a full rebuild of every indexed repo on the next
  refresh (`incremental.ts` compares versions). Bump only when the stored data shape changes.
- Facade methods not yet called by reviews (`getBlastRadius`, `getUnresolvedReferences`,
  `getCriticalPaths`): reserved for later milestones (M4, M6). `getConventionSamples` is the
  Conventions Extractor's file pool (M2, `modules/conventions`): keep its "no tests, configs,
  migrations" filter, the extractor relies on it.

## Read when
- You change what reviews receive → `../reviews/run-executor.ts` (buildRepoMapDigest,
  buildCallersDigest, buildRankNote)
- You change the tables → `../../db/schema/repo-intel.ts`, then `pnpm db:generate`

## After you finish
Record lessons in `INSIGHTS.md` in this folder with the `engineering-insights` skill (`/engineering-insights`).
