# Examples: before → after

Common placement mistakes and their fixes. Folder names follow SKILL.md defaults; where a module's
`CLAUDE.md` fixes other locations (for example "all data hooks in `lib/hooks`"), substitute them.

## Contents

- [1. Fat page → thin route](#1-fat-page--thin-route)
- [2. Utils dumping ground → purpose-named modules](#2-utils-dumping-ground--purpose-named-modules)
- [3. Key literals everywhere → one query factory](#3-key-literals-everywhere--one-query-factory)
- [4. Sibling-internal import → promotion](#4-sibling-internal-import--promotion)
- [5. Mixed barrel → split public API](#5-mixed-barrel--split-public-api)
- [6. Kitchen-sink constants → split by kind](#6-kitchen-sink-constants--split-by-kind)

## 1. Fat page → thin route

Before: the page fetches, filters, sorts and renders.

```tsx
"use client";

export default function PullsPage({ params }: { params: { repoId: string } }) {
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [status, setStatus] = useState<PullStatus>("open");

  useEffect(() => {
    fetch(`/api/repos/${params.repoId}/pulls`).then((r) => r.json()).then(setPulls);
  }, [params.repoId]);

  const visible = pulls.filter((p) => p.status === status).sort(byUpdatedDesc);
  return <div>{/* 200 lines of filters, table and empty states */}</div>;
}
```

After: the route composes, a view component wires things up, the logic is pure and data comes
from the data layer.

```
app/repos/[repoId]/pulls/
├── page.tsx                     # reads params, renders <PullsView repoId={…} />
└── _components/
    └── PullsView/
        ├── PullsView.tsx        # usePulls(repoId) + filter state → <FilterBar/> + <PullList/>
        ├── PullsView.test.tsx
        ├── helpers.ts           # visiblePulls(pulls, filter): pure, unit-tested
        └── index.ts
features/pulls/api/pull-queries.ts   # or the module's hooks file: pullQueries.list(repoId)
```

```tsx
export default async function PullsPage({ params }: { params: Promise<{ repoId: string }> }) {
  const { repoId } = await params;
  return <PullsView repoId={repoId} />;
}
```

If filters must survive reload or be shareable, `status` moves to the URL search params instead
of `useState`.

## 2. Utils dumping ground → purpose-named modules

Before:

```
src/utils/index.ts       # shippingCost, canCancelOrder, formatWeight, slugify,
                         # toOrderRowView, debounce, … (35 functions, 7 domains)
```

After: each function moves to where its reason to change lives.

```
src/features/orders/model/shipping-cost.ts     # shippingCost: pricing rule of the orders domain
src/features/orders/model/cancellation.ts      # canCancelOrder(order, now): status rule, time passed in
src/features/orders/api/order-mappers.ts       # toOrderRowView: DTO → view model, used by select
src/lib/format-weight.ts                       # generic, used by 3 features
src/lib/slugify.ts                             # generic, used by 2 features
src/hooks/use-debounced-value.ts               # it calls hooks, so it is a hook, not a util
```

Functions used by only one component go to that component's `helpers.ts`. Delete functions
that turn out to be unused instead of moving them.

## 3. Key literals everywhere → one query factory

Before: the same key typed in three places, one of them in a page.

```ts
useQuery({ queryKey: ["pr-runs", prId], queryFn: () => api.get(`/pulls/${prId}/runs`) });

queryClient.invalidateQueries({ queryKey: ["pr-runs", prId] });
queryClient.invalidateQueries({ queryKey: ["pr-run", prId] });
```

The last line has a typo, so that invalidation silently does nothing.

After: keys live with their queries, and everyone else uses the builders.

```ts
export const runQueries = {
  all: () => ["runs"] as const,
  byPr: (prId: string) =>
    queryOptions({
      queryKey: [...runQueries.all(), "pr", prId],
      queryFn: () => fetchRuns(prId),
    }),
};

useQuery(runQueries.byPr(prId));
queryClient.invalidateQueries({ queryKey: runQueries.byPr(prId).queryKey });
```

Invalidation that follows a mutation belongs in the mutation hook's `onSuccess`, not in the page.

## 4. Sibling-internal import → promotion

Before: two route components reach into each other's internals.

```
app/orders/_components/OrdersTable/helpers.ts
  import { matchesFilter } from "../OrderFilters/helpers";
app/orders/_components/OrderFilters/helpers.ts
  export function matchesFilter(order, filter) { … }
```

After: the shared function moves to the closest common parent. Both siblings import it from
there, and neither knows about the other.

```
app/orders/_lib/order-filter.ts      # matchesFilter: private to the orders route
```

If a second route starts using it, it moves on to `features/orders/model/` or shared `lib/`.

## 5. Mixed barrel → split public API

Before: one wildcard index pulls server code, client components and queries into every
importer.

```ts
export * from "./api/project-queries";
export * from "./server/get-project-dto";
export * from "./components/ProjectCard";
```

After: explicit names, with server-only code behind its own entry point.

```ts
export { projectQueries } from "./api/project-queries";
export { ProjectCard } from "./components/ProjectCard";
export type { Project } from "./api/project-schema";
```

```ts
import "server-only";
export { getProjectDTO } from "./server/get-project-dto";
```

The first block is `features/projects/index.ts` and the second is
`features/projects/index.server.ts`. Code inside `features/projects/` imports files directly,
never `../index`.

## 6. Kitchen-sink constants → split by kind

Before:

```ts
export const CDN_HOST = "https://cdn.example.com";
export const MAPS_SERVER_KEY = "AIza…";
export enum OrderStatus { Pending, Shipped, Delivered }
export const EMPTY_STATE_TEXT = "No orders yet";
export const STATUS_BADGE_BG = { pending: "#fef3c7", shipped: "#dbeafe" };
export const ORDERS_PAGE_SIZE = 25;
```

After:

| Value | New home | Why |
|---|---|---|
| `MAPS_SERVER_KEY` | `config/env.server.ts` (`import "server-only"`), read from env | a secret must not be importable by client code or committed |
| `CDN_HOST` | `NEXT_PUBLIC_CDN_HOST`, read in `config/env.client.ts` | public, build-time inlined |
| `OrderStatus` | `features/orders/model/order-status.ts`: `ORDER_STATUSES = ["pending", "shipped", "delivered"] as const` + union | no numeric enum; validated with `z.enum(ORDER_STATUSES)` |
| `EMPTY_STATE_TEXT` | i18n messages (`orders.list.empty`) | user-facing text |
| `STATUS_BADGE_BG` | design tokens / CSS variables | one source for visual values |
| `ORDERS_PAGE_SIZE` | `features/orders/constants.ts` | a plain constant, scoped to its feature |
