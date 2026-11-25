# Constants, utils and types

Where constants, configuration, user-facing strings, helper functions, types and schemas live.

## Contents

- [1. Constants: scope ladder](#1-constants-scope-ladder)
- [2. Constant naming](#2-constant-naming)
- [3. Closed sets: `as const`, `z.enum`, enums](#3-closed-sets-as-const-zenum-enums)
- [4. Config and environment variables](#4-config-and-environment-variables)
- [5. User-facing strings](#5-user-facing-strings)
- [6. Utils, helpers, lib](#6-utils-helpers-lib)
- [7. Types and schemas](#7-types-and-schemas)

## 1. Constants: scope ladder

Declare a constant in the narrowest place that covers its consumers. Promote it only when a new
consumer appears.

| Scope | Location |
|---|---|
| One function | an inline literal is fine if it is obvious; name it if it is a magic number |
| One module | top of that file, after the imports |
| One component folder | `constants.ts` beside the component |
| One feature | the feature's `constants.ts` / `config.ts` |
| Whole app | `config/` for settings; the design system for visual tokens (colours, spacing, severity styles) |

- Before adding a constant, search for one that already exists: grep its values, not just its
  name. Duplicated maps drift apart silently.
- Name magic numbers with their unit: `POLL_INTERVAL_MS`, `MAX_UPLOAD_MB`.
- `constants.ts` holds values. Types belong next to the code that owns them (or are derived
  with `typeof`), and functions go to `helpers.ts`.
- Static arrays and objects used in JSX belong at module level, not inside the component.
  (react-best-practices covers why: identity and re-renders.)
- Never put secrets in constants. Never put user-facing text in constants (§5).

## 2. Constant naming

| Rule | Source |
|---|---|
| `CONST_CASE` only for module-level, deeply immutable values; anything created per call or per render is `camelCase` | Google TypeScript Style Guide |
| Uppercasing is optional and only for exported `const` values that never change, including nested properties | Airbnb §23.10 |
| `as const` on literal tables so their types are the literal values | TypeScript handbook |

Default: follow Google (module-level immutable → `CONST_CASE`) unless the codebase already does
otherwise. Uppercase only the top-level name of an exported object, not its keys.

```ts
export const SEVERITY_ORDER = ["critical", "warning", "suggestion", "info"] as const;
export const POLL_INTERVAL_MS = 5_000;
```

## 3. Closed sets: `as const`, `z.enum`, enums

```ts
export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const RoleSchema = z.enum(ROLES);
```

- Prefer an `as const` array or object with a derived union type. "In modern TypeScript, you may
  not need an enum when an object with `as const` could suffice" (TypeScript handbook).
- If the values are also validated, `z.enum([...])` is the single source of truth: derive the
  type with `z.infer`, or derive the schema from the `as const` array as above.
- Never use `const enum` (Google bans it). Avoid `enum` in new code: TypeScript 5.8's
  `--erasableSyntaxOnly` rejects it, numeric enums accept arbitrary numbers, and enums are
  nominal. If an enum is unavoidable, use a string enum.
- Labels for these values come from i18n messages (§5), not from a parallel constant.

## 4. Config and environment variables

Split env access by trust level:

```
config/
├── env.server.ts   # import "server-only"; secrets; validated once with Zod
└── env.client.ts   # only NEXT_PUBLIC_ values, read with static property access
```

- Variables without the `NEXT_PUBLIC_` prefix are server-only. `NEXT_PUBLIC_` values are inlined
  at `next build` and "frozen with the value evaluated at build time". Never put a secret behind
  that prefix.
- Use static access (`process.env.NEXT_PUBLIC_API_BASE`). Dynamic lookups such as
  `process.env[name]` are not inlined.
- Only the DAL and other server modules import `env.server.ts`. With a separate backend, the
  browser needs only the public base URL; tokens stay on the server.
- Validating env with a Zod schema at startup is common practice. It fails fast and gives typed
  access.
- If the project already has one env/config module, extend it rather than adding a second.

## 5. User-facing strings

- Text shown to users lives in the i18n message catalog (next-intl: per-locale JSON, nested
  namespaces such as `useTranslations("projects.list")`). It does not belong in constants,
  utils or JSX literals.
- Constants and enums hold keys and IDs. Map an ID to its label at render time, for example
  with ICU `select`: `{status, select, active {Active} archived {Archived} other {Unknown}}`.
- Formatting (dates, numbers, plurals) happens "during the rendering phase" through the i18n
  formatter. next-intl intentionally doesn't support translating outside components.
- Metadata, Server Actions and Route Handlers use the awaitable server API
  (`getTranslations`).
- A new feature area (a new screen, a new domain) adds its own namespace or messages file
  instead of growing a shared one. A block added to an existing screen extends that screen's
  namespace. Reuse existing keys (status names, common actions) rather than copying them.
- Units inside formatted values (`1m 32s`, `12 KB`): in a single-locale app, a pure formatter
  that emits short unit abbreviations is acceptable when the codebase already does so. Once
  more than one locale exists, format through `Intl` (`unit` style) or an ICU message with
  placeholders (`{m}m {s}s`).
- Type message keys from the default locale (next-intl `AppConfig` augmentation) so a missing
  key fails typecheck.

## 6. Utils, helpers, lib

| Term | Definition | Example |
|---|---|---|
| utility | "a generic function that accomplishes an abstract task" — pure, framework-free, no I/O, could ship in a library | `clamp`, `format-bytes` |
| helper | "something specific to a given project" or component | `visibleFindings(findings, filter)` |
| lib | "reusable libraries preconfigured for the application" — wrappers around third-party code | `api-client.ts`, `query-client.ts`, `cn.ts` |
| hook | anything that calls hooks | lives in a hooks file, never in utils |

(Definitions: Josh Comeau for utility and helper, Bulletproof React for lib.)

- **Start local.** A helper used by one component lives in that component's `helpers.ts`.
- **Promote on reuse.** Move it to the feature, then to shared code, once a second real consumer
  appears and the shared shape is obvious. The default shared home is `lib/<purpose>.ts`, one
  folder for wrappers and pure helpers alike. Use `utils/` only if the project already has it,
  and never keep both for the same kind of code. Kent C. Dodds: "prefer
  duplication over the wrong abstraction", wait until "the commonalities will scream at you".
- **Inline back when it rots.** If a shared function keeps gaining parameters and conditionals
  to serve different callers, "the fastest way forward is back" (Sandi Metz): inline it into
  each caller, delete what each one doesn't need, then re-extract. Dan Abramov regretted a
  deduplication that "traded the ability to change requirements for reduced duplication".
- **One purpose per file, named for it:** `format-currency.ts`, `parse-order-filters.ts`,
  `github-urls.ts`. Never an app-level `utils.ts` or `helpers.ts` grab bag. FSD calls
  kind-names like `utils` unhelpful because they say what a file is, not what it does.
- **Domain rules aren't utils.** `calcInvoiceTotal` or `isTrialExpired` belong in the domain
  module of their feature (`model/`), next to the types they operate on.
- **Pure means pure:** no React, no `fetch`, no `Date.now()` hidden inside. Pass time and
  config in as arguments so the function stays testable.

## 7. Types and schemas

- **Colocate types** with the module or schema that owns them. Use a shared `types/` folder (or
  the shared contracts package) only for cross-feature contracts.
- **One source of truth:** define a Zod schema once and derive the type with
  `z.infer<typeof Schema>`. Use `z.input` / `z.output` when transforms change the shape. Never
  hand-write a parallel interface that can drift.
- **Validate at trust boundaries:** API responses (in the fetcher), Server Action arguments and
  `FormData`, route `params` and `searchParams`, and env. Inside those boundaries, trust the
  types. `parse` throws; `safeParse` returns a result for form-style handling.
- **Shared client/server schemas** live in a module that is neither `'use client'` nor
  `server-only`. Next.js examples use `lib/definitions.ts`.
- **Type-only imports** (`import type { X }`) for anything that is only a type, especially from
  shared contract packages. They let bundlers drop the module and avoid pulling runtime code
  across boundaries.
- **Interface vs type alias:** Google prefers `interface` for object types. Zod-derived types
  are aliases, and that's fine. Follow the codebase.
- **Props types** stay next to their component. Export them only when consumers need them.
- **View models:** a UI-only shape (for example a row view combining several contract types)
  lives with the mapper that builds it, not in the contracts package.
