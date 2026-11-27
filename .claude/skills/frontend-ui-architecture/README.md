# frontend-ui-architecture

**Version:** 1.0.0 (`metadata.version` in [SKILL.md](SKILL.md)) · **Updated:** 2026-11-25

A skill that tells the agent **where frontend code lives and how it is split** in React +
Next.js App Router apps (TypeScript, TanStack Query, Zod). It answers placement questions:
where components go and when to split or promote them, where business logic, the data layer,
constants, config/env, utils/helpers/lib, types and state live, and which imports are allowed.

## Scope

| Covered here | Covered elsewhere |
|---|---|
| Folder layout, route-colocated vs feature vs shared code | Hooks rules, render purity, memoization, effects → `react-best-practices` |
| Component folder shape, splitting and promotion | Next.js file conventions, RSC boundaries, data-fetching APIs → `next-best-practices` |
| Business-logic layers, data layer, state placement | Type-level programming, tsconfig → `typescript-expert` |
| Constants, env/config, i18n strings, utils vs lib | Zod API details → `zod` |
| Import boundaries, barrels, lint enforcement | Component tests → `react-testing-library` |

**Precedence:** a module's own `CLAUDE.md` and the dominant pattern in its code override the
skill's defaults. The skill doesn't ask the agent to restructure existing code unless the user
requests it.

## Files

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | Precedence, workflow checklist, core principles, "where does it go?" table, default layout, component rules, import rules, Next.js placement, red flags |
| [references/layout-and-components.md](references/layout-and-components.md) | Next.js strategies, Bulletproof React, Feature-Sliced Design, naming, component granularity, barrel costs |
| [references/logic-and-data.md](references/logic-and-data.md) | Logic layers, render/handler/effect, custom hooks, TanStack Query data layer, DAL and Server Actions, state placement |
| [references/constants-utils-types.md](references/constants-utils-types.md) | Constants and naming, `as const` vs enums, env/config, i18n strings, utils vs helpers vs lib, types and schemas |
| [references/boundaries.md](references/boundaries.md) | `import/no-restricted-paths`, eslint-plugin-boundaries v7, dependency-cruiser, Steiger, rollout |
| [references/examples.md](references/examples.md) | Before/after refactors |
| [evals/](evals/) | Four test cases in the `claude plugin eval` layout |

## Usage

- **Automatic:** Claude loads the skill when a task matches its description, such as creating,
  moving or reviewing frontend files, adding a page or feature, or asking "where should this go?".
- **Manual:** type `/frontend-ui-architecture` in Claude Code.
- **Eval:** each folder in `evals/` has `prompt.md`, `case.yaml` and `graders/`. With Claude Code
  v2.1.269+ you can run `claude plugin eval . --allow-tools Read,Glob,Grep,Skill` from this
  folder. These are real, billed model runs.

## Versioning

The version follows SemVer and is stored in `metadata.version` in SKILL.md frontmatter. This is
the field the Agent Skills specification provides; there is no top-level `version` field.

- **MAJOR:** a rule changes meaning or is removed. Agents following the old version would place
  code differently.
- **MINOR:** a new rule, section, reference file or eval.
- **PATCH:** wording, examples, links.

Every change bumps the version and adds a changelog entry below.

## Changelog

### 1.0.0 — 2026-11-25

- Initial version. Built from the sources below; all URLs were checked on 2026-11-25 except
  where noted.
- Took over the "Code Organization" rules from `react-best-practices`, which now links here.
- Checked against the four `evals/` cases with one run that used the skill and no baseline run.
  It passed 24 of 24 assertions. That run's feedback led to these changes:
  - the module's lessons file joined the precedence rules;
  - new rows for which component reads data, backend tokens that stay on the server, and where
    the URL-state parser lives;
  - a single default home for shared helpers (`lib/`);
  - guidance on i18n namespaces and formatted units;
  - a routing hint for the reference files;
  - examples moved to a different domain so the evals test generalisation, not recall.

## Sources

Section markers point to the SKILL.md section (§) or reference file each source backs.

### Official documentation: React

- [Thinking in React](https://react.dev/learn/thinking-in-react): a component should do one thing, so decompose it when it grows. §6
- [Importing and Exporting Components](https://react.dev/learn/importing-and-exporting-components): no one-component-per-file rule; default vs named exports. layout-and-components §7
- [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks): when to extract a hook; the `use` prefix only for functions that call hooks; no lifecycle hooks. §4, logic-and-data §3
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect): derive during render; logic caused by interactions goes in handlers. §4, logic-and-data §2
- [Keeping Components Pure](https://react.dev/learn/keeping-components-pure): side effects belong in event handlers. logic-and-data §2
- [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure): no redundant, duplicated or contradictory state; `initialX` props. logic-and-data §6
- [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components): lift state to the closest common parent. §4
- [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context): try props and `children` before context. logic-and-data §6
- [Scaling Up with Reducer and Context](https://react.dev/learn/scaling-up-with-reducer-and-context): provider file that exports hooks. §4
- [File Structure FAQ (legacy)](https://legacy.reactjs.org/docs/faq-structure.html): group by feature or by type; "don't spend more than five minutes"; at most 3–4 nesting levels. §5

### Official documentation: Next.js and Vercel

- [Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) ([v15](https://nextjs.org/docs/15/app/getting-started/project-structure)): safe colocation in `app/`, private `_folders`, route groups, three organization strategies. §5, layout-and-components §1–2, §9
- [`src` folder (v15)](https://nextjs.org/docs/15/app/api-reference/file-conventions/src-folder): what stays at the root; middleware inside `src/`. §5
- [Installation: module path aliases](https://nextjs.org/docs/app/getting-started/installation): the `@/*` alias. §7
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components): `'use client'` on leaves, providers deep, `server-only`. §8
- [Mutating Data](https://nextjs.org/docs/app/getting-started/mutating-data): Server Functions in `'use server'` files; verify auth in each one. logic-and-data §5.3
- [Data Security guide](https://nextjs.org/docs/app/guides/data-security): DAL, minimal DTOs, thin actions. §8, logic-and-data §5
- [Authentication guide](https://nextjs.org/docs/app/guides/authentication): `lib/definitions.ts` schemas, `lib/dal.ts` with `server-only`, checks close to the data. logic-and-data §5
- [Environment Variables](https://nextjs.org/docs/app/guides/environment-variables): `NEXT_PUBLIC_` is inlined and frozen at build; static access only. constants-utils-types §4
- [optimizePackageImports](https://nextjs.org/docs/app/api-reference/config/next-config-js/optimizePackageImports): third-party barrel optimization. §7
- [How to Think About Security in Next.js](https://nextjs.org/blog/security-nextjs-server-components-actions) (Sebastian Markbåge, 2023): three data models, DAL, `server-only`, hostile action arguments. §8, logic-and-data §5.1
- [How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js) (Shu Ding, 2023): import costs of 200–800 ms, 15–70% faster dev boot. layout-and-components §8
- [Learn: Adding Search and Pagination](https://nextjs.org/learn/dashboard-app/adding-search-and-pagination): URL search params as state. logic-and-data §6

### Official documentation: TanStack, TypeScript, Zod, next-intl

- [TanStack Query: Query Options](https://tanstack.com/query/latest/docs/framework/react/guides/query-options): one `queryOptions` reused across hooks and the client. §4, logic-and-data §4.3
- [TanStack Query: Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys): array keys that include every variable. logic-and-data §4.3
- [TanStack Query: Advanced Server Rendering](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr): `providers.tsx`, `getQueryClient`, prefetch + `HydrationBoundary`. §5, logic-and-data §5.4
- [Search Params Are State](https://tanstack.com/blog/search-params-are-state) (Tanner Linsley, 2025): URL state is first-class and validated. logic-and-data §6
- [TypeScript Handbook: Enums (Objects vs Enums)](https://www.typescriptlang.org/docs/handbook/enums.html): prefer `as const` objects. constants-utils-types §3
- [TypeScript 5.8 release notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-8.html): `--erasableSyntaxOnly` rejects enums. constants-utils-types §3
- [Zod: Basics](https://zod.dev/basics) and [Zod: API](https://zod.dev/api): `z.infer`, `z.input`/`z.output`, `parse` vs `safeParse`, `z.enum`. §3, constants-utils-types §3, §7
- [next-intl: Messages](https://next-intl.dev/docs/usage/messages), [TypeScript](https://next-intl.dev/docs/workflows/typescript), [Translations outside of React components](https://next-intl.dev/blog/translations-outside-of-react-components): namespaced catalogs, IDs as keys, formatting at render, typed keys. constants-utils-types §5

### Methodologies and reference architectures

- Bulletproof React (Alan Alickovic): [project structure](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md), [components and styling](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md), [API layer](https://github.com/alan2207/bulletproof-react/blob/master/docs/api-layer.md), [state management](https://github.com/alan2207/bulletproof-react/blob/master/docs/state-management.md), [Next.js app example](https://github.com/alan2207/bulletproof-react/tree/master/apps/nextjs-app/src). Covers feature folders, one-way imports, no cross-feature imports, direct imports instead of barrels, a single API client, and the definitions of lib, utils and config. §3–§7, layout-and-components §3, boundaries §2
- Feature-Sliced Design (v2.1): [overview](https://feature-sliced.design/docs/get-started/overview), [layers](https://feature-sliced.design/docs/reference/layers), [slices and segments](https://feature-sliced.design/docs/reference/slices-segments), [public API](https://feature-sliced.design/docs/reference/public-api), [usage with Next.js](https://feature-sliced.design/docs/guides/tech/with-nextjs), [excessive entities](https://feature-sliced.design/docs/guides/issues/excessive-entities), [alternatives](https://feature-sliced.design/docs/about/alternatives). Covers the layer import rule, purpose-named segments, public APIs, `index.server.ts`, and deferred decomposition. layout-and-components §4–5, §8, §10
- [Feature-Sliced Design Review](https://dev.to/algoorgoal/feature-sliced-design-review-22k0) (2024): critique covering the learning curve, `lib` vs `model` confusion, and Next.js client-boundary leaks. layout-and-components §4
- [Atomic Design, chapter 2](https://atomicdesign.bradfrost.com/chapter-2/) (Brad Frost): "a mental model", not a folder taxonomy. §6, layout-and-components §10
- [Clean Architecture on Frontend](https://bespoyasov.me/blog/clean-architecture-on-frontend/) (Alex Bespoyasov, 2021): domain, application and adapters; overkill for small projects. logic-and-data §1

### Expert articles

- Juntao Qiu on martinfowler.com: [Modularizing React Applications with Established UI Patterns](https://martinfowler.com/articles/modularizing-react-apps.html) (2023), [Headless Component](https://martinfowler.com/articles/headless-component.html) (2023), [Data Fetching Patterns in Single-Page Applications](https://martinfowler.com/articles/data-fetch-spa.html) (2024). Covers layer evolution, gateway/anti-corruption layers, headless hooks, and when to separate fetching. §3, logic-and-data §1, §3
- Kent C. Dodds: [Colocation](https://kentcdodds.com/blog/colocation), [State Colocation will make your React app faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster), [Application State Management with React](https://kentcdodds.com/blog/application-state-management-with-react), [Don't Sync State. Derive It!](https://kentcdodds.com/blog/dont-sync-state-derive-it), [AHA Programming](https://kentcdodds.com/blog/aha-programming). Covers colocation, state as local as possible, and avoiding hasty abstractions. §3, logic-and-data §6, constants-utils-types §6
- [The Wrong Abstraction](https://sandimetz.com/blog/2016/1/20/the-wrong-abstraction) (Sandi Metz, 2016): "duplication is far cheaper than the wrong abstraction"; inline it back when an abstraction rots. §3, constants-utils-types §6
- [Goodbye, Clean Code](https://overreacted.io/goodbye-clean-code/) (Dan Abramov, 2020): the cost of premature deduplication. constants-utils-types §6
- [Presentational and Container Components](https://medium.com/@dan_abramov/smart-and-dumb-components-7ca2f9a7c7d0) (Dan Abramov, 2015, 2019 update): the author no longer recommends the split. §6, layout-and-components §10. *Not fetched (HTTP 403); the 2019 note is confirmed through search snippets and secondary sources.*
- TkDodo (Dominik Dorfmeister), TanStack Query maintainer:
  - [Practical React Query](https://tkdodo.eu/blog/practical-react-query)
  - [React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager)
  - [Effective React Query Keys](https://tkdodo.eu/blog/effective-react-query-keys)
  - [Leveraging the Query Function Context](https://tkdodo.eu/blog/leveraging-the-query-function-context)
  - [The Query Options API](https://tkdodo.eu/blog/the-query-options-api)
  - [Creating Query Abstractions](https://tkdodo.eu/blog/creating-query-abstractions)
  - [React Query Data Transformations](https://tkdodo.eu/blog/react-query-data-transformations)
  - [Type-safe React Query](https://tkdodo.eu/blog/type-safe-react-query)
  - [React Query and TypeScript](https://tkdodo.eu/blog/react-query-and-type-script)
  - [Mastering Mutations in React Query](https://tkdodo.eu/blog/mastering-mutations-in-react-query)
  - [Working with Zustand](https://tkdodo.eu/blog/working-with-zustand)
  - [Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files)

  Covers colocated query keys, `queryOptions` as the main abstraction, parsing instead of asserting, mutation-hook responsibilities, never copying server state, small stores, and the cost of barrels. §4, §7, logic-and-data §4, layout-and-components §8
- [Speeding up the JavaScript ecosystem — the barrel file debacle](https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7/) (Marvin Hagemeister, 2023): tests and lint 60–80% faster without barrels. layout-and-components §8
- [How We Achieved 75% Faster Builds by Removing Barrel Files](https://www.atlassian.com/blog/atlassian-engineering/faster-builds-when-removing-barrel-files) (Atlassian, 2025): an industry case study. layout-and-components §8
- [React Folder Structure in 5 Steps](https://www.robinwieruch.de/react-folder-structure/) (Robin Wieruch, updated 2026): incremental growth path, kebab-case, barrels "getting out of fashion". §5, layout-and-components §1, §6
- [Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) (Josh W. Comeau, updated 2025): component folders, the utility vs helper definition, explicit re-exports with the App Router. §6, layout-and-components §1, §8, constants-utils-types §6
- [Tao of React](https://alexkondov.com/tao-of-react/) (Alex Kondov, 2021): group by module, split by responsibility rather than line count, wrap external components. §6, layout-and-components §7
- [Screaming Architecture — Evolution of a React folder structure](https://dev.to/profydev/screaming-architecture-evolution-of-a-react-folder-structure-4g25) (Johannes Kettmann / Profy.dev, 2022): feature folders, the case-sensitivity CI bug. layout-and-components §6. *The canonical profy.dev URL did not resolve (DNS) on 2026-11-25; the dev.to copy was used.*
- [Path to a Clean(er) React Architecture, part 6: Business Logic Separation](https://dev.to/jkettmann/path-to-a-cleaner-react-architecture-part-6-business-logic-separation-221g) (Johannes Kettmann, 2024): use-case functions tested without React. logic-and-data §1
- [Why I Don't Like TypeScript Enums](https://www.totaltypescript.com/why-i-dont-like-typescript-enums) (Matt Pocock): `as const` over enums. constants-utils-types §3

### Style guides

- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html): `CONST_CASE` scope, no `const enum`, named exports. constants-utils-types §2–3, layout-and-components §6
- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) (§23.8, §23.10): naming of exported constants. constants-utils-types §2
- [Airbnb React/JSX Style Guide](https://github.com/airbnb/javascript/tree/master/react): one component per file, PascalCase file names. layout-and-components §6–7
- [Redux Style Guide](https://redux.js.org/style-guide/): feature folders are "Strongly Recommended". layout-and-components §1

### Tools

- [eslint-plugin-boundaries](https://github.com/javierbrea/eslint-plugin-boundaries) and [JS Boundaries docs: dependencies rule](https://www.jsboundaries.dev/docs/rules/dependencies/) (v7). boundaries §3
- [eslint-plugin-import `no-restricted-paths`](https://github.com/import-js/eslint-plugin-import/blob/main/docs/rules/no-restricted-paths.md). boundaries §2
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser). boundaries §4
- [Steiger](https://github.com/feature-sliced/steiger), the FSD linter. boundaries §5
- [nuqs](https://nuqs.dev/): typed URL state. logic-and-data §6
- [shadcn/ui `components.json`](https://ui.shadcn.com/docs/components-json): alias layout for `components`, `ui`, `lib`, `hooks`; compound files. layout-and-components §6–7

### Skill authoring

- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) (Anthropic): concise SKILL.md under 500 lines, third-person description, references one level deep, TOCs for long files, evaluations.
- [Claude Code: skills](https://code.claude.com/docs/en/skills): frontmatter fields, the description listing budget, what survives compaction.
- [Agent Skills specification](https://agentskills.io/specification): `name` matches the folder, `metadata` map; version goes in `metadata.version`.
