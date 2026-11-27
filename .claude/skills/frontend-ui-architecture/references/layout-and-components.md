# Layout and components

Folder strategies, naming, component granularity and barrel files.

## Contents

- [1. Choosing a folder strategy](#1-choosing-a-folder-strategy)
- [2. Route-colocated code in `app/`](#2-route-colocated-code-in-app)
- [3. Feature folders (Bulletproof React)](#3-feature-folders-bulletproof-react)
- [4. Feature-Sliced Design](#4-feature-sliced-design)
- [5. How the three map onto each other](#5-how-the-three-map-onto-each-other)
- [6. Naming](#6-naming)
- [7. Component granularity](#7-component-granularity)
- [8. Barrel files and public APIs](#8-barrel-files-and-public-apis)
- [9. Route groups and private folders](#9-route-groups-and-private-folders)
- [10. Patterns that are out of date](#10-patterns-that-are-out-of-date)

## 1. Choosing a folder strategy

Next.js is explicitly unopinionated: it lists three strategies and asks you to "choose a
strategy that works for you and your team and be consistent across the project".

| Strategy | What lives in `app/` | Fits |
|---|---|---|
| Project files outside `app/` | routing files only; UI in `src/components`, `src/features` | apps with heavy cross-route reuse |
| Top-level folders inside `app/` | routes plus `app/_components`, `app/_lib` | small apps |
| Split by feature or route | each route segment owns its `_components/` | apps where most UI belongs to one route |

How to pick:

1. Follow the module's documented choice. If none exists, follow what most of the code does.
2. A new or small app: start flat (`components/`, `hooks/`, `lib/`) and keep route-only UI in
   `_components`. The React team's old advice still holds: "don't spend more than five minutes"
   on the initial structure; you will rethink it after writing real code.
3. Add `features/<domain>/` once a second domain appears or a domain spans several routes.
   Redux's style guide rates feature folders as "Strongly Recommended" and calls folder-by-type
   (`actions/`, `reducers/`) the legacy approach.
4. Consider Feature-Sliced Design only when cross-feature reuse needs more tiers than
   shared → features → app.

Grouping by function (`components/`, `hooks/`, `helpers/`) is a legitimate choice for small or
single-domain apps (Josh Comeau argues feature boundaries blur and drift). It stops scaling once
several domains share one flat `components/` folder.

## 2. Route-colocated code in `app/`

- Files inside `app/` are "safely colocated": only `page.tsx` and `route.ts` make a segment
  routable.
- A `_folder` opts itself and every subfolder out of routing. Use it for UI and helpers that
  belong to one route: `app/blog/_components/Post.tsx`.
- `_components/` can nest: `app/agents/[id]/_components/AgentEditor/_components/ConfigTab/`.
- A child route may import from its parent route's `_components/`; the code still serves one
  route subtree. When an unrelated route needs it, promote it to `features/` or shared
  `components/`.
- Route-level support files (`constants.ts`, `helpers.ts`) can sit next to `page.tsx` when the
  page itself needs them. Once they grow, the page is probably doing component work: move that
  work into a `_components/<Name>/` folder.

## 3. Feature folders (Bulletproof React)

```
src/
├── app/          # routes, providers, router: composes features
├── components/   # shared components
├── config/       # global configuration, exported env variables
├── features/     # most of the code
│   └── <feature>/
│       ├── api/          # request declarations + api hooks
│       ├── components/
│       ├── hooks/
│       ├── stores/
│       ├── types/
│       └── utils/
├── hooks/  lib/  stores/  testing/  types/  utils/
```

- "Most of the application code should live in features." A feature has only the folders it
  needs.
- Code flows one way: shared → features → app. Bulletproof React enforces this with
  `import/no-restricted-paths` (see [boundaries.md](boundaries.md)).
- "It might not be a good idea to import across the features." Compose features at the app or
  route level instead.
- It reversed its earlier barrel advice: "it is recommended to import the files directly."

## 4. Feature-Sliced Design

Layers, top to bottom: `app` → `pages` → `widgets` → `features` → `entities` → `shared`
(`processes` is deprecated).

- **Import rule:** "a module on a layer can only import other modules from layers strictly
  below". Slices on the same layer cannot import each other. The only exception is `@x`
  cross-imports between entities, and those should stay minimal.
- **Segments** inside a slice are named by purpose: `ui`, `api`, `model`, `lib`, `config`. FSD
  calls `components`, `hooks` and `types` "bad segment names" because they describe what a file
  is, not what it is for.
- **Public API:** each slice exposes an `index.ts` contract; avoid `export *`. Use relative
  imports inside a slice and absolute imports across slices. Each `shared/ui` component gets
  its own index rather than one big barrel.
- **Layer heuristics:** a block is a `feature` when it is reused on several pages. A block that
  is not reused "should not be a widget" — keep it in the page slice.
- **FSD 2.1 favours deferred decomposition:** "Do not create an entity for every piece of
  business logic." The later you move code down to `entities`, the cheaper your refactors.
- **With Next.js:** keep Next's `app/` at the project root and the FSD layers in `src/`. Rename
  FSD's own `app` and `pages` layers to `_app` and `_pages` to avoid the clash, and let
  `app/**/page.tsx` re-export from `src/_pages/*`. Use `index.server.ts` so server-only
  exports don't leak into client bundles.
- **Tooling:** Steiger lints the methodology (`fsd/forbidden-imports`,
  `fsd/no-public-api-sidestep`, `fsd/insignificant-slice` for slices with zero or one
  reference).
- **Costs reported by teams:** a learning curve, hard slice naming, `lib` vs `model`
  confusion, and in Next.js a shared export file that turned server components into client
  components. FSD itself says: "If the current architecture works, maybe it's not worth
  changing."

## 5. How the three map onto each other

| Concern | Route-colocated | Bulletproof React | FSD |
|---|---|---|---|
| Route entry | `app/<route>/page.tsx` | `app/routes/*` | `pages` (`_pages` with Next.js) |
| UI used by one route | `app/<route>/_components/` | `features/<f>/components/` | page slice `ui/` |
| Domain logic and data | route `_components/` + shared `lib/` | `features/<f>/{api,hooks,utils}` | `features`, `entities` slices (`model`, `api`) |
| Composite reused block | promoted to shared `components/` | `components/` | `widgets` |
| Generic UI and helpers | `components/`, `lib/` | `components/`, `lib/`, `utils/` | `shared/{ui,lib,api,config}` |

## 6. Naming

Every source agrees that **consistency matters more than the choice**.

| Option | Who uses it | Notes |
|---|---|---|
| kebab-case files (`project-card.tsx`, `use-debounce.ts`) | Next.js docs examples, shadcn/ui, Robin Wieruch, Profy.dev | matches `page.tsx` and `route.ts`; immune to case-only renames |
| PascalCase component files (`ProjectCard.tsx`) | Airbnb, React docs examples, Josh Comeau, Next's own `_components/Post.tsx` example | file name equals the export |

- Case-sensitivity trap: macOS and Windows file systems ignore case and Linux CI does not.
  Renaming `button.tsx` to `Button.tsx` needs `git mv`, and an import with the wrong case can
  pass locally and fail in CI. Profy.dev switched to kebab-case after exactly this bug.
- Identifiers stay conventional whatever the file case: PascalCase components, `useX` hooks,
  camelCase functions.
- Prefer named exports (Google's TypeScript style guide forbids default exports). Framework
  files that require a default export (`page.tsx`, `layout.tsx`) are the exception.
- Name folders and files after the domain or purpose (`invoice-total.ts`), not the kind
  (`utils.ts`).

## 7. Component granularity

- **One exported component per file**, named after the file (Airbnb). Small private helper
  components in the same file are fine; the React docs keep unexported children next to their
  parent.
- **A compound family can share one file** with named exports (shadcn's `card.tsx` exports
  `Card`, `CardHeader`, `CardTitle`, …).
- **A file of tiny, logic-free view atoms** that are never tested alone is acceptable
  (`atoms.tsx`). Say why in a header comment.
- **Split by responsibility, not by length.** "A component should ideally only be concerned
  with one thing. If it ends up growing, it should be decomposed into smaller subcomponents"
  (react.dev). Alex Kondov: "Lines of code are not an objective measure. Think about
  responsibilities and abstractions instead." Many props (more than about 5) is a review
  trigger.
- "Do not add multiple rendering functions inside your application" (Bulletproof React): a
  `renderHeader()` function is a component waiting to be extracted.
- Wrap third-party UI components once in shared UI so the library can be swapped in one place.
- Promote to shared only after real reuse: "Identify repetitions before creating the components
  to avoid wrong abstractions."

## 8. Barrel files and public APIs

**Measured costs of barrels in application code:**

| Source | Finding |
|---|---|
| TkDodo (2024) | pages loaded over 11k modules taking 5–10 s; removing barrels cut about 68% of modules |
| Marvin Hagemeister (2023) | barrels pull "every single file in your project" into the graph; tests and lint get 60–80% faster without them |
| Atlassian (2025) | 75% fewer build minutes, TypeScript highlighting more than 30% faster, local unit tests about 50% faster, CI unit tests per build down from 1,600 to 200 |
| Vercel (2023) | popular packages take 200–800 ms just to import; `optimizePackageImports` gave 15–70% faster dev boot and about 28% faster builds |

Barrels also create circular imports (often via editor auto-import) and cannot make modules
private.

**Policy:**

- No folder-wide barrels in app code (`components/index.ts`, `utils/index.ts`,
  `hooks/index.ts` re-exporting everything) and no `export *`.
- A per-component `index.ts` forwarder (`export { Card } from "./Card";`) or a per-feature public
  API is acceptable when it re-exports explicit names. Josh Comeau switched from `export *` to
  explicit re-exports after App Router build errors.
- Never mix server-only and client modules in one index. A shared index can drag
  `'use client'` code into server components or server code into client bundles. Split it
  (`index.ts` / `index.server.ts`).
- Inside the unit, import files directly, never through your own index.
- An index doesn't stop deep imports on its own. If the public API matters, enforce it with lint.
- For third-party packages, rely on `optimizePackageImports`; many libraries (lucide-react,
  date-fns, recharts, …) are optimized by default.

## 9. Route groups and private folders

- A route group `(name)` organizes routes "by site section, intent, or team" and scopes
  layouts and `loading.tsx` without adding a URL segment. Don't use it as a general
  code-organization tool.
- A private folder `_name` separates UI logic from routing, groups files in the editor, and
  avoids clashes with future Next.js file conventions.
- Some authors (Robin Wieruch) avoid private folders and keep everything outside `app/` for
  consistency. That is a team choice; follow the codebase.

## 10. Patterns that are out of date

- **Container/presentational folders.** Dan Abramov's 2019 note on his 2015 article says his
  "views have since evolved" and that he no longer suggests this split; hooks took over the
  container role. FSD lists Smart & Dumb components as deprecated.
- **Atomic Design as an app taxonomy.** Brad Frost frames it as "a mental model", not a linear
  process. FSD notes it "does not provide a clear level of responsibility for business logic".
  Use the terms only to name design-system layers.
