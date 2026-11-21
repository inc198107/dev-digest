# client/ — @devdigest/web

Read first: `client/INSIGHTS.md` (lessons). Reference: `client/README.md` (route map, API
surface per page). Design system: `src/vendor/ui/README.md`.

## Commands (run in client/)
```sh
pnpm dev          # next dev, :3000 (needs the API on :3001)
pnpm test         # vitest + jsdom, fetch mocked, no API needed
pnpm typecheck
```

## Layout
- `src/app/**/page.tsx` — thin pages; feature logic in colocated `_components/<Name>/`
- `src/lib/api.ts` — the only place that calls `fetch` (`apiFetch`, `ApiError`)
- `src/lib/hooks/*` — every data hook (TanStack Query + SSE `useRunEvents`)
- `src/vendor/ui/` — design system, imported as `@devdigest/ui`
- `src/vendor/shared/` — client copy of the Zod contracts (`@devdigest/shared`)
- `messages/en/<namespace>.json` — UI strings (next-intl, single locale)

## Conventions
- Component folder shape: `Name.tsx`, `Name.test.tsx`, `constants.ts`, `helpers.ts`,
  `styles.ts`, `index.ts`. Styles are `CSSProperties` objects in `styles.ts` that use CSS
  variables (`var(--border)`, `var(--accent)`…); no hard-coded colors.
- Data flows component → hook in `lib/hooks` → `api.ts` → API. Never call `fetch` from a
  component; add or extend a hook instead and invalidate the related query keys on mutation.
- Import UI only from the `@devdigest/ui` barrel; a new or changed UI component must be
  added to `src/components/showcase` (the smoke test mounts it).
- User-facing strings go through `useTranslations("<namespace>")`; a new feature adds its own
  `messages/en/<feature>.json`.
- Error UX: queries toast only on network/5xx; mutations always toast (see `src/lib/providers.tsx`).
  Expected 4xx should render inline empty or error states.

## Gotchas
- The client copy of `@devdigest/shared` has drifted from the server copy (e.g. `LLMProvider.id`
  lacks `'openrouter'`). Sync the file from `server/src/vendor/shared` before relying on it.
- Pages are client components or thin wrappers around one; there is no server-side data
  fetching, all data loads in the browser through the hooks.
- SSE stream end is detected through `EventSource.onerror`; run history also polls every 4 s
  while a run is `running`.
- `src/vendor/ui/README.md` mentions a `/showcase` route that does not exist; the gallery is
  used only by `src/test/smoke.test.tsx`.

## Do not touch
- Severity/category semantics in `src/vendor/ui/primitives/tokens.ts` (`SEV`, `CAT`): they
  mirror the review contract enums.
- `NEXT_PUBLIC_API_BASE` default and the `ApiError` shape: hooks and error UX depend on them.

## Read when
- You add a page or call a new endpoint → `README.md` (route map)
- You build or restyle UI → `src/vendor/ui/README.md`
- You write a component test → `../TESTING.md` and existing `*.test.tsx` next to components
- You need a deep dive or a feature spec → `docs/`, `specs/` (template: `../specs/_TEMPLATE.md`)

## After you finish
Record lessons in `client/INSIGHTS.md` with the `engineering-insights` skill (`/engineering-insights`).
