# Logic and data

Where business logic, hooks, data access and state live.

## Contents

- [1. Layers of a UI feature](#1-layers-of-a-ui-feature)
- [2. Render, event handler or effect](#2-render-event-handler-or-effect)
- [3. Custom hooks](#3-custom-hooks)
- [4. Client data layer (TanStack Query)](#4-client-data-layer-tanstack-query)
- [5. Next.js server side](#5-nextjs-server-side)
- [6. State placement](#6-state-placement)

## 1. Layers of a UI feature

Juntao Qiu (martinfowler.com) describes how a React feature matures: one component → several
components → state moved into hooks → domain models emerge → presentation, domain and data
layers. "React … is a library (not a framework)". Squeezing everything into components or hooks
is what makes the code hard to follow.

| Layer | Contains | Knows about |
|---|---|---|
| View | components, JSX, styles | hooks, domain types |
| Wiring | custom hooks: state, effects, queries, mutations | domain + data layers |
| Domain | pure functions and types: rules, calculations, mappers | nothing outside itself |
| Data / gateway | API client, fetchers, schemas, DTO mapping | the network, the domain types it returns |

- Dependencies point inward: view → wiring → domain, and wiring → data → domain. The domain
  imports nothing from React, Next.js, TanStack or `fetch`. It is the part that "won't change if
  we move from React to Angular" (Bespoyasov).
- The gateway is an anti-corruption layer. When the API shape changes, only it changes.
- Replace scattered `if (country === …)` branches with a strategy object in the domain.
- **Don't scaffold full Clean Architecture** (ports, adapters, DI containers) up front.
  Bespoyasov calls it overkill for small projects. The non-negotiable minimum is a pure domain
  plus one-way dependencies.
- In small apps, fetching inside components is acceptable (Fowler, "Data Fetching Patterns in
  SPA"). Separate fetching from rendering once more than one component needs the data. In
  practice that means as soon as you adopt TanStack Query.

## 2. Render, event handler or effect

From react.dev ("You Might Not Need an Effect", "Keeping Components Pure"):

- **Derivable from props or state?** Calculate it during render. "When something can be
  calculated from the existing props or state, don't put it in state." Use `useMemo` only if
  the calculation is measurably expensive.
- **Caused by an interaction?** Put it in the event handler. "If this logic is caused by a
  particular interaction, keep it in the event handler."
- **Caused by the component being on screen?** Then an Effect. Effects are the last resort, used
  to synchronize with external systems.
- **Two handlers share logic?** Extract a plain function and call it from both.
- **State must reset when an entity changes?** Use the `key` prop, not an effect.

```tsx
function InvoiceSummary({ invoice }: { invoice: Invoice }) {
  const total = invoiceTotal(invoice.lines, invoice.discount);
  const createPayment = useCreatePayment();

  function handlePay() {
    createPayment.mutate({ invoiceId: invoice.id, amount: total });
  }

  return <PayButton amount={total} onPay={handlePay} />;
}
```

`invoiceTotal` is a domain function in `model/invoice-total.ts`, tested without rendering.

## 3. Custom hooks

- **Extract** when stateful logic (state, effects, context, queries) repeats, or to hide messy
  effect details behind an intention-revealing name. "Whenever you write an Effect, consider
  whether it would be clearer to also wrap it in a custom Hook." But "you don't need to
  extract a custom Hook for every little duplicated bit of code."
- **Name the concrete use case:** `useOnlineStatus`, `useChatRoom`, `useCheckoutTotals`. Avoid
  lifecycle hooks such as `useMount`, `useEffectOnce` or `useUpdateEffect`. If no good name
  comes, the logic is not ready to be extracted.
- **A function that calls no hooks is not a hook.** "If your function doesn't call any Hooks,
  avoid the `use` prefix": `getSorted`, not `useSorted`.
- **Hooks share logic, not state.** To share state itself, lift it up or put it in context or
  the query cache.
- **Placement:** next to the component that uses the hook (`<Name>/useX.ts` or a feature
  `hooks/` folder). Move it to shared `hooks/` only when 2+ features use it.
- **Headless hooks** carry the logic and state for several visual variants of one interaction.
  Use them only when the variants really exist, and prefer a mature headless library to a
  home-grown one. They add indirection.

## 4. Client data layer (TanStack Query)

### 4.1 One API client

There is a single configured client in `lib/` (base URL, headers, auth, error normalization).
Components and hooks never call `fetch` or axios directly: "Rather than declaring API requests on
the fly… define and export them separately" (Bulletproof React).

### 4.2 Fetchers parse, they don't assert

A return-only generic such as `get<Project>()` or `useQuery<Project>()` is a type assertion,
not a type. TkDodo calls these generics "a lie". Parse the JSON with Zod in the fetcher. A
failing `parse` throws, which puts the query into its error state.

### 4.3 `queryOptions` factory per feature

Keep keys and query functions together, colocated with the feature. "Separating QueryKey from
QueryFunction was a mistake" (TkDodo, 2024). Don't create one global `queryKeys.ts`.

```ts
import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { apiClient } from "@/lib/api-client";

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["active", "archived"]),
});
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectFilters = { status?: Project["status"]; page: number };

async function fetchProjects(filters: ProjectFilters): Promise<Project[]> {
  return z.array(ProjectSchema).parse(await apiClient.get("/projects", { params: filters }));
}

async function fetchProject(id: string): Promise<Project> {
  return ProjectSchema.parse(await apiClient.get(`/projects/${id}`));
}

export const projectQueries = {
  all: () => ["projects"] as const,
  lists: () => [...projectQueries.all(), "list"] as const,
  list: (filters: ProjectFilters) =>
    queryOptions({
      queryKey: [...projectQueries.lists(), filters],
      queryFn: () => fetchProjects(filters),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: [...projectQueries.all(), "detail", id],
      queryFn: () => fetchProject(id),
    }),
};
```

- Keys are arrays ordered from generic to specific, and include every variable the `queryFn`
  uses.
- The same options object works with `useQuery`, `useSuspenseQuery`, `useQueries`,
  `prefetchQuery` and `get/setQueryData`. That is why `queryOptions`, not a custom hook, is the
  primary abstraction. Hooks can't run on the server or in prefetching.
- Add a `useX` hook only when it adds logic. Never write a generic wrapper that takes
  `Partial<UseQueryOptions>`: it widens `data` to `unknown`. Spread call-site overrides instead:
  `useQuery({ ...projectQueries.detail(id), select: toCard })`.
- **If the project mandates hook files per resource** (for example "every data hook lives in
  `lib/hooks`"), keep the factory inside those files and export the hooks. Both approaches agree
  on the essential rule: keys live with their queries, and nobody else writes key literals.
  Code that invalidates should reuse the factory's key builders (`projectQueries.lists()`)
  instead of retyping `["projects", "list"]`.

### 4.4 Mutations

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProject } from "./create-project";
import { projectQueries } from "./project-queries";

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createProject,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: projectQueries.lists() }),
  });
}
```

- The hook owns cache logic: invalidation, optimistic updates. Prefer invalidation to manual
  `setQueryData`.
- UI effects (toast, redirect, closing a modal) go in `mutate(input, { onSuccess })` at the call
  site. Those callbacks "might not fire at all if the component unmounts", which is what you want
  for UI-only effects.

### 4.5 Mapping DTOs

Order of preference (TkDodo, "React Query Data Transformations"):

1. Transform in the backend.
2. Transform with `select`. Raw data stays in the cache, each component subscribes to its own
   slice, and `select` runs only when data exists.
3. Transform in the fetcher (`queryFn`) when the whole app should only ever see the mapped
   shape. This makes the fetcher an anti-corruption layer.

Never transform in render.

Mappers are pure functions in `api/` or `model/`.

### 4.6 Never copy server state

Copying query data into `useState`, context or Zustand opts you out of background updates.
"Resist the urge to sync server data to a different state manager." Wherever the data is needed,
read it again with the same `queryOptions`. Set `staleTime` deliberately.

## 5. Next.js server side

### 5.1 Pick one data model

From "How to Think About Security in Next.js" (Vercel):

| Model | When | Notes |
|---|---|---|
| HTTP API | existing large projects, separate backend | Next.js is a client of the backend; zero trust on both sides |
| Data Access Layer | new projects where Next.js reads the DB or SDKs | all access goes through one `server-only` layer |
| Component-level access | prototypes only | queries inside components |

"Stick to one approach and don't mix and match too much."

### 5.2 Data Access Layer

```ts
import "server-only";
import { cache } from "react";

export const verifySession = cache(async () => {
  /** read and verify the session cookie; redirect or throw when missing */
});

export async function getProjectDTO(id: string) {
  const session = await verifySession();
  const project = await db.project.findById(id);
  if (!project || !canViewProject(session.user, project)) return null;
  return { id: project.id, name: project.name };
}
```

- `import "server-only"` makes the build fail if a client module imports the file.
- Check authorization close to the data, not in layouts: layouts don't re-render on navigation.
  A proxy (formerly middleware) handles only optimistic checks.
- Return minimal DTOs that are "safe to be transferred to the client as is". Pass client
  components only the fields they render.
- "Only the data access layer should access `process.env`" for secrets. DB and SDK packages are
  imported only there.

### 5.3 Server Actions

- Define them in `'use server'` files (`features/<domain>/actions.ts`). Client components can't
  define them, only import them.
- Keep them thin: parse arguments or `FormData` with Zod (`safeParse`) → re-check auth and
  authorization → call the DAL → return a minimal serializable result → revalidate.
- Arguments "must always be treated as hostile". Every action is reachable by a direct POST.
- A schema shared by the client form and the action lives in a module marked neither
  `'use client'` nor `server-only`.

### 5.4 TanStack Query with the App Router

- `lib/query-client.ts` exports `getQueryClient()`. `app/providers.tsx` (`'use client'`) renders
  `QueryClientProvider`.
- A Server Component page prefetches with the feature's `queryOptions` and wraps the client tree
  in `HydrationBoundary`. "Treat Server Components as a place to prefetch data, nothing more."
- The client component calls `useQuery(projectQueries.list(filters))` with the same options
  object, so keys can't drift.

## 6. State placement

Classify state before placing it:

| Kind | Examples | Home |
|---|---|---|
| Server state | lists, entities, counts | TanStack Query cache (or RSC + DAL) |
| URL state | filters, sort, page, selected tab, search query | search params via one typed parser (nuqs, or `useSearchParams` + Zod), validated on the server too |
| Form state | field values, errors, pending | `useActionState` or a form library + the shared Zod schema |
| Local UI state | open/closed, hover, draft text | `useState` in the lowest component that needs it |
| Shared UI state | selection used by two siblings | closest common parent |
| Distant client state | theme, current user, command palette | context + reducer, or a small store |

- **Colocate first.** "Keep state as local as possible and use context only when prop drilling
  really becomes a problem" (Kent C. Dodds). State lifted too high re-renders the whole tree on
  every update.
- **Before context,** pass props or compose with `children`. Context fits theme, the current
  account, locale and complex distant state. Put each provider in its own `'use client'` file
  that exports `useX` hooks, and render it as deep as possible.
- **Stores:** use several small stores, export only hooks, use atomic selectors, and model
  actions as events ("keep your business logic inside your store, and not in your components").
  TkDodo's reminder: "Most of the state in apps is either server or url state."
- **Shape:** no redundant, duplicated or contradictory state. Use one `status` union instead of
  several booleans, and keep state flat. Mirror a prop into state only as `initialX`.
- **URL state is real state.** "Search params have been historically treated like second-class
  state" (Tanner Linsley). URL params make a view shareable, bookmarkable and readable on the
  server.
