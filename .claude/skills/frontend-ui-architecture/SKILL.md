---
name: frontend-ui-architecture
description: Frontend UI architecture and code organization for React and Next.js App Router apps — decides where code lives and how it is split. Covers component placement (route-colocated, feature, shared UI), component folder shape, splitting and promotion, business/domain logic, data-access and TanStack Query layers, constants and config/env, utils vs helpers vs lib, types and Zod schemas, state placement, import boundaries and barrel files. Use when creating, moving, splitting or reviewing frontend files, adding a feature or page, or asking where something should go. Not for hook/render rules (react-best-practices) or Next.js file conventions and RSC details (next-best-practices).
metadata:
  version: "1.0.0"
---

# Frontend UI Architecture

Decides **where frontend code lives and how it is split** in React + Next.js App Router apps
(TypeScript, TanStack Query, Zod): folders, component placement, business logic, data layer,
constants, utils, types, state and import boundaries.

This skill is about *placement*. For *how* to write components and hooks use
`react-best-practices`; for Next.js file conventions, RSC boundaries and data-fetching APIs use
`next-best-practices`; for type-level questions use `typescript-expert`.

## 1. Precedence

1. **The module's documented conventions win.** Read `<module>/CLAUDE.md`, its README and its
   lessons file (e.g. `INSIGHTS.md`) before placing anything. If they fix a location ("every
   data hook lives in `src/lib/hooks`") or forbid a pattern ("type-only imports from the shared
   contracts"), follow them even where this skill's default differs.
2. **Then the dominant pattern in the code.** Find the nearest analog (a sibling component, an
   existing hook file) and copy its shape. One consistent convention beats a mix that includes a
   "better" one.
3. **Then the defaults in this skill.**

Don't restructure existing code to match these defaults unless asked. When you notice a
deviation, report it as a follow-up instead of fixing it in passing: moves churn imports, tests
and mocks far beyond the task.

## 2. Workflow: placing new code

Copy this checklist and track it:

- [ ] Read `<module>/CLAUDE.md` and its lessons file for structure rules and known traps.
- [ ] Search for something that already does this: grep the domain term, the constant's
      values, the helper's verb. A second copy of an existing map, formatter or type is the
      most common placement bug.
- [ ] Classify each piece with the table in §4.
- [ ] Pick the **narrowest scope** that contains every current consumer: route → feature → shared.
- [ ] Check that imports point downward (§7). If you would import a sibling's internals,
      promote the shared piece instead.
- [ ] Name files by purpose; put the test next to the file it tests.
- [ ] Run the module's typecheck, tests and lint (whichever scripts exist).

## 3. Core principles

1. **Colocate.** Code lives next to its only consumer; things that change together stay
   together. Deleting a feature folder should delete its helpers, constants and tests too.
2. **Routes are thin.** `page.tsx` and `layout.tsx` read params, compose components, prefetch
   and set metadata. Domain logic, data wiring and large JSX live in components below the route.
3. **Narrowest scope; promote on the second real consumer.** Until then a little duplication is
   cheaper than the wrong abstraction. When a shared function starts growing flags and branches,
   inline it back into its callers and re-extract.
4. **Dependencies flow one way:** `shared → features → app`; lower layers never import higher
   ones. No feature-to-feature imports and no reaching into a sibling's internal files.
5. **Logic out of JSX.** Business rules are pure TS functions (no React, no I/O); hooks wire
   state, effects and queries; components render. Rules then test without rendering.
6. **One data path.** Component → query options / data hook → API client → network.
   Components never call `fetch` or the API client themselves.
7. **Name by purpose, not by kind.** `format-duration.ts`, `invoice-total.ts` — not an
   app-level `utils.ts`, `helpers.ts` or `misc/`. Kind-named buckets become dumping grounds
   that nobody dares to delete from.
8. **One source of truth for types.** Derive types from Zod schemas and shared contracts
   (`z.infer`). Validate at trust boundaries (API responses, params, forms, env) and trust the
   types inside them.
9. **Server/client is a placement decision.** Secrets and data access live in `server-only`
   modules; `'use client'` goes on interactive leaves.
10. **Consistency over preference.** One file-naming case, one barrel policy and one import
    style per codebase.

## 4. Where does it go?

"Feature" means a domain folder (`features/<domain>/`) or, in a route-colocated codebase, the
route folder that owns the code.

| I have… | Put it in… |
|---|---|
| UI used by one route | `app/<route>/_components/<Name>/` |
| UI used by several routes of one domain | `features/<domain>/components/`, or the `_components/` of the closest common parent route |
| Domain-free UI primitive (button, modal, card) | shared UI: `components/ui/` or the project's design system |
| App chrome (shell, nav, page frame) | `components/layout/` — shared, no domain logic |
| Child component private to one component | `<Name>/_components/<Child>/`, or the same file if tiny and never tested alone |
| Business rule or calculation (pricing, eligibility, status transitions) | pure function in the feature's `model/`, or the component's `helpers.ts` while it has one consumer |
| Value derivable from props or state | computed during render (a pure helper); never `useState` + `useEffect` |
| Logic caused by a click or submit | the event handler, or a plain function it calls |
| Sync with an external system | an Effect inside a named custom hook |
| Reusable stateful logic | `useX` hook file next to its consumer; shared `hooks/` once 2+ features use it |
| Function that calls no hooks | plain `getX` / `formatX` function, never `useX` |
| HTTP client (base URL, headers, error shape) | one module in `lib/` |
| Fetcher + response schema for a resource | the feature's `api/`: the fetcher calls the client and `parse`s the JSON with Zod |
| Query keys + query functions | a per-feature `queryOptions` factory in the feature's data layer; no global `queryKeys.ts` |
| Which component reads server data | the lowest component that needs it calls the query (same options or hook); TanStack dedupes by key, so don't funnel every query through the page |
| Mutation | `useXMutation` in the feature's data layer; it owns invalidation, toasts and redirects stay at the call site |
| DTO → view-model mapping | pure mapper in `api/` or `model/`, applied in `select` or in the fetcher; never in render |
| Server-side data access (Next.js reads DB/SDK directly) | Data Access Layer module with `import 'server-only'` |
| Server Action | thin `'use server'` file (e.g. `features/<domain>/actions.ts`): validate → authorize → call DAL |
| Constant used by one module | top of that file, or `constants.ts` beside it |
| Constant shared inside one feature | the feature's `constants.ts` / `config.ts` |
| App-wide settings | `config/`; visual tokens belong to the design system |
| Closed set of values | `as const` object/array + derived union, or `z.enum` when validated; no `const enum` |
| Secret env value | server-only env module; never `NEXT_PUBLIC_` |
| Backend token the browser must not see | a `server-only` API client variant; browser calls go through Route Handlers (BFF) or Server Actions that add the token |
| Public env value | `NEXT_PUBLIC_X`, read with static `process.env.NEXT_PUBLIC_X` in one config module |
| User-facing text | the i18n message catalog; constants hold keys and IDs, not labels |
| Generic pure helper (format, parse) | local `helpers.ts` first; `lib/<purpose>.ts` once shared (or the project's existing `utils/`) |
| Wrapper around a third-party library | `lib/<library-or-purpose>.ts` |
| Type used by one module | next to that module |
| Data-contract type | `z.infer` from the schema that owns it |
| Schema shared by a client form and a Server Action | a module with neither `'use client'` nor `server-only` |
| UI state (open, hover, draft input) | `useState` in the lowest component that needs it |
| State shared by siblings | their closest common parent |
| Distant client state | context + reducer in a provider file that exports hooks, or a small store |
| Server state | TanStack Query cache (or RSC); never copied into local state or a store |
| Filters, sort, page, tab | URL search params through one typed, validated parser, kept in the feature's `model/` so both the route and the query factory can import it |
| Form state | `useActionState` or a form library + the shared Zod schema |
| Test | next to the file (`Name.test.tsx`); e2e suites at the repo root |
| Styles | next to the component, in the project's styling convention |

Details and trade-offs: [logic-and-data.md](references/logic-and-data.md),
[constants-utils-types.md](references/constants-utils-types.md).

## 5. Default layout (Next.js App Router)

```
src/
├── app/                    # routing only: pages, layouts, loading/error, route handlers
│   ├── layout.tsx          # wraps children in <Providers>
│   ├── providers.tsx       # 'use client': QueryClientProvider, theme, …
│   └── <route>/
│       ├── page.tsx        # thin: params → compose → prefetch
│       └── _components/    # UI used only by this route (private folder, not routable)
│           └── <Name>/
├── features/<domain>/      # code shared by several routes of one domain
│   ├── api/                # fetchers, schemas, queryOptions factories, mutation hooks
│   ├── components/
│   ├── model/              # pure business rules and mappers
│   └── hooks/              # stateful logic of this domain
├── components/             # shared, domain-free: ui/ primitives, layout/ chrome
├── hooks/                  # generic hooks used by 2+ features
├── lib/                    # configured clients, wrappers, shared pure helpers (one purpose per file)
├── config/                 # env access, app-wide settings
└── types/                  # cross-feature types only
```

- Create only the folders you need. Nesting deeper than 3–4 levels usually signals a missing
  boundary.
- **Growth path:** flat `components/` while the app is small → route `_components/` as routes
  appear → `features/<domain>/` when a domain spans several routes. Reach for Feature-Sliced
  Design layers only when that still isn't enough.
- Keeping route-specific UI inside `app/` (`_components`) is a supported Next.js strategy; a
  codebase may have no `features/` at all. Use route groups `(name)` for URL-free sectioning
  and layout scoping, not as a general code-organization tool.

Strategies, FSD mapping and naming trade-offs:
[layout-and-components.md](references/layout-and-components.md).

## 6. Components: folder shape, splitting, promotion

**File or folder?** A component with nothing beside it can be a single file. Once it gets a
test, helpers, styles or children, give it a folder:

```
<Name>/
├── <Name>.tsx          # one exported component per file
├── <Name>.test.tsx     # colocated test
├── constants.ts        # only if needed
├── helpers.ts          # only if needed: pure functions used by this component
├── styles.ts           # or .module.css — per project convention
├── _components/        # private children
└── index.ts            # optional forwarder: explicit named re-exports only
```

**Split when a part has its own responsibility:** its own state or effects, its own data
dependency, it repeats, it is a nested `renderX()` function, or sections need comments to be
understood. Line and prop counts are prompts to look, not rules; the thresholds live in
`react-best-practices`.

**Where the split goes.** A child used only by this component goes to its private
`_components/`. It moves up only when a second consumer appears — the promotion ladder:

`<Name>/_components/` → route `_components/` → `features/<domain>/components/` → shared `components/ui/`

Only domain-free components reach shared UI. A domain-aware component needed by two features
stays in one feature and is composed at the route, or its domain-free part is extracted.

- No `containers/` vs `components/` folders: hooks superseded the container/presentational
  split. Put the logic in a `useX` hook beside the component.
- Atomic Design terms (atoms, molecules) may name design-system layers; never use them as the
  app's top-level folder taxonomy.

## 7. Imports and boundaries

| Importer ↓ / may import → | `app` | `features` | shared (`components`, `hooks`, `lib`, `config`, `types`) |
|---|---|---|---|
| `app` | ✓ | ✓ | ✓ |
| `features/<a>` | ✗ | only `<a>` itself | ✓ |
| shared | ✗ | ✗ | ✓ |

- Siblings don't import each other's internals (`../Sibling/helpers`). When two units need the
  same thing, promote it to their common parent or to shared code.
- **Paths:** relative inside a unit (same component or feature folder); the alias (`@/…`)
  across top-level areas. Prefer the alias over `../` chains deeper than two levels. When you
  move a module, update test mocks (`vi.mock(path)`) to the new specifier too.
- **Barrels:** no catch-all `index.ts` for a whole folder (`components/index.ts`,
  `utils/index.ts`) and no `export *`. A per-component or per-feature `index.ts` with explicit
  named exports is fine as a public API. Never mix server-only and client exports in one index.
  Inside a unit, import files directly, not your own index — that is how cycles start.
- Third-party barrels are Next.js `optimizePackageImports`' job, not yours.
- Enforce what matters with lint (`import/no-restricted-paths`, `eslint-plugin-boundaries`,
  `import/no-cycle`): [boundaries.md](references/boundaries.md).

## 8. Next.js server/client placement

Placement only; RSC rules and APIs are in `next-best-practices`.

- Choose one data model per app: **HTTP API** (a separate backend; Next.js is its client) or a
  **Data Access Layer** (Next.js reaches the DB or SDKs directly). Don't mix them.
- The DAL and anything reading secrets start with `import 'server-only'`, check authorization
  close to the data and return minimal DTOs.
- Server Actions live in `'use server'` files and stay thin: parse with Zod → authorize → call
  the DAL → return a minimal result. Treat each one as a public endpoint.
- `'use client'` goes on interactive leaves. Providers live in one client `providers.tsx`,
  rendered as deep in the tree as practical.
- Env: secrets only in server modules. `NEXT_PUBLIC_` values are inlined at build time, so they
  are public and frozen.
- A backend that needs a secret token can't be called from the browser directly: put a
  `server-only` client next to the public one and route browser calls through Route Handlers
  or Server Actions.

## 9. Red flags

Use as a review checklist:

- A `page.tsx` with domain logic, several queries or hundreds of lines of JSX.
- `fetch` or the API client called from a component; the same query-key literal repeated in
  several files.
- Query data copied into `useState`, context or a store.
- An app-level `utils.ts`, `helpers.ts` or `constants.ts` mixing unrelated domains.
- A second copy of an existing map, formatter or type.
- A secret anywhere a client component can import it; `NEXT_PUBLIC_` on a secret.
- User-facing strings in constants or JSX instead of the message catalog.
- A feature importing another feature or a sibling's internal file; shared code importing a
  feature or a route.
- `export *` barrels, folder-wide index files, or a barrel mixing server and client code.
- A `useX` function that calls no hooks; hooks named after lifecycles (`useMount`).
- Hand-written interfaces duplicating a Zod schema.
- A "reusable" abstraction with one consumer, or a shared helper accumulating boolean flags.
- New code that silently deviates from `<module>/CLAUDE.md`.

## 10. Reference files

Read only what the task needs. Reviewing a structure → `examples.md` + `boundaries.md`; new app
or data layer → `logic-and-data.md` + `constants-utils-types.md`; choosing a folder strategy →
`layout-and-components.md`.

- [references/layout-and-components.md](references/layout-and-components.md) — folder
  strategies (Next.js, Bulletproof React, Feature-Sliced Design), naming, component folder
  shape, barrels and their measured costs.
- [references/logic-and-data.md](references/logic-and-data.md) — business-logic layers, custom
  hooks, the client data layer with TanStack Query, Next.js DAL and Server Actions, state
  placement.
- [references/constants-utils-types.md](references/constants-utils-types.md) — constants and
  their naming, enums vs `as const`, env and config, i18n strings, utils vs helpers vs lib,
  types and Zod schemas.
- [references/boundaries.md](references/boundaries.md) — ESLint and dependency-cruiser setups
  that enforce §7.
- [references/examples.md](references/examples.md) — before/after refactors of common placement
  mistakes.

Sources behind every rule: [README.md](README.md).
