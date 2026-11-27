# Enforcing boundaries

These setups turn the import rules from SKILL.md §7 into lint errors. Pick one tool; don't stack
all of them.

## Contents

- [1. The policy](#1-the-policy)
- [2. `import/no-restricted-paths` (eslint-plugin-import)](#2-importno-restricted-paths-eslint-plugin-import)
- [3. eslint-plugin-boundaries v7](#3-eslint-plugin-boundaries-v7)
- [4. dependency-cruiser](#4-dependency-cruiser)
- [5. Steiger for Feature-Sliced Design](#5-steiger-for-feature-sliced-design)
- [6. Rolling it out](#6-rolling-it-out)

## 1. The policy

- `app` may import anything.
- `features/<a>` may import shared code and itself, never `app` or another feature.
- Shared folders (`components`, `hooks`, `lib`, `config`, `types`, `utils`) import only shared
  code.
- No import cycles.
- Route-colocated codebases add one more rule: shared folders never import from `app/`, and a
  route's `_components/` are not imported by unrelated routes. The second rule is hard to lint,
  so check it in review.

Adjust folder names to the project. If it has no `features/`, keep only the shared → app rule
and the cycle check.

## 2. `import/no-restricted-paths` (eslint-plugin-import)

This is the Bulletproof React setup. Zones are matched against resolved paths, so path aliases
work once the TypeScript resolver is configured.

```js
import importPlugin from "eslint-plugin-import";

export default [
  {
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      "import/no-cycle": "error",
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            /** features never import the app layer */
            { target: "./src/features", from: "./src/app" },
            /** shared code never imports features or the app layer */
            {
              target: ["./src/components", "./src/hooks", "./src/lib", "./src/config", "./src/types", "./src/utils"],
              from: ["./src/features", "./src/app"],
            },
            /** no cross-feature imports: one zone per feature */
            { target: "./src/features/billing", from: "./src/features", except: ["./billing"] },
            { target: "./src/features/projects", from: "./src/features", except: ["./projects"] },
          ],
        },
      ],
    },
  },
];
```

- `except` paths are relative to `from`.
- The resolver needs the `eslint-import-resolver-typescript` package.
- `import/no-cycle` is expensive on large graphs. Run it in CI if local lint gets slow.

## 3. eslint-plugin-boundaries v7

In v7 the canonical rule is `boundaries/dependencies`; v7 removed `boundaries/element-types`.
Element patterns match folders, captured values are referenced with
`{{ from.element.captured.<name> }}`, and the last matching policy wins. The config below is
assembled from the documented v7 syntax and has not been run. Check it against the docs for the
version you install.

```js
import boundaries from "eslint-plugin-boundaries";

export default [
  {
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "src/app", partialMatch: false },
        { type: "feature", pattern: "src/features/*", partialMatch: false, capture: ["featureName"] },
        {
          type: "shared",
          pattern: ["src/components", "src/hooks", "src/lib", "src/config", "src/types"],
          partialMatch: false,
        },
      ],
      "import/resolver": { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      "boundaries/dependencies": [
        2,
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "app" } },
              allow: { to: { element: { type: ["app", "feature", "shared"] } } },
            },
            {
              from: { element: { type: "feature" } },
              allow: { to: { element: { type: "shared" } } },
            },
            {
              from: { element: { type: "feature" } },
              allow: {
                to: {
                  element: {
                    type: "feature",
                    captured: { featureName: "{{ from.element.captured.featureName }}" },
                  },
                },
              },
            },
            {
              from: { element: { type: "shared" } },
              allow: { to: { element: { type: "shared" } } },
            },
          ],
        },
      ],
    },
  },
];
```

With `default: "disallow"`, a feature importing another feature matches no policy and is
reported.

## 4. dependency-cruiser

dependency-cruiser validates and visualizes the whole graph. It doesn't depend on ESLint and works
well as a CI step. `npx depcruise --init` generates a config with `no-circular` and `no-orphans`.
Add the architecture rules to `forbidden`:

```js
module.exports = {
  forbidden: [
    {
      name: "no-cross-feature",
      severity: "error",
      from: { path: "^src/features/([^/]+)/" },
      to: { path: "^src/features/", pathNot: "^src/features/$1/" },
    },
    {
      name: "shared-stays-shared",
      severity: "error",
      from: { path: "^src/(components|hooks|lib|config|types|utils)/" },
      to: { path: "^src/(features|app)/" },
    },
  ],
};
```

`$1` in `to` refers to the group captured in `from.path`. The tool can also render the graph
(dot, mermaid, html), which is useful when proposing a restructure.

## 5. Steiger for Feature-Sliced Design

If the project uses FSD, use its linter instead of hand-written zones:
`npm i -D steiger @feature-sliced/steiger-plugin`. Its rules include `fsd/forbidden-imports`,
`fsd/no-public-api-sidestep`, `fsd/public-api`, `fsd/excessive-slicing` and
`fsd/insignificant-slice`.

## 6. Rolling it out

1. Agree on the policy (§1) and write it into the module's `CLAUDE.md`, so humans and agents
   read the same rule.
2. Add the rule as `warn` and list the current violations.
3. Fix the cheap ones. For the rest, add a targeted disable comment that names a follow-up, so
   new violations still fail.
4. Switch the rule to `error` and run it in CI.
5. When you move modules to satisfy a rule, update the import specifiers in test mocks too
   (`vi.mock("…")`). A mock still pointing at the old path silently stops mocking.
