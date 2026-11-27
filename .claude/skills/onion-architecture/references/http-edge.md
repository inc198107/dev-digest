# The HTTP edge: Fastify 5, Zod 3 and errors

Routes are **driving adapters**: they translate HTTP into a use-case call and the result back into
HTTP. Nothing below them knows that HTTP exists.

## Contents

- [1. Shape of a routes plugin](#1-shape-of-a-routes-plugin)
- [2. Plugins, encapsulation and registration](#2-plugins-encapsulation-and-registration)
- [3. Schemas: params, body, querystring and response](#3-schemas-params-body-querystring-and-response)
- [4. Request context and workspace scoping](#4-request-context-and-workspace-scoping)
- [5. Errors](#5-errors)
- [6. Decorators and hooks](#6-decorators-and-hooks)
- [7. Job handlers and SSE are driving adapters too](#7-job-handlers-and-sse-are-driving-adapters-too)
- [8. Legacy routes](#8-legacy-routes)

## 1. Shape of a routes plugin

```ts
// src/modules/labels/routes.ts — http ring
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CreateLabelInput, Label, LabelList } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { LabelsService } from './service.js';

/**
 * Labels routes: HTTP ⇄ use-case translation only.
 * @param appBase Encapsulated Fastify instance for this module.
 * @returns Resolves when the routes are registered.
 */
export default async function labelsRoutes(appBase: FastifyInstance): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const labels = new LabelsService({
    store: container.labelsRepo,
    uow: container.labelsUow,
    llm: () => container.llm('openrouter'),
  });

  app.get('/labels', { schema: { response: { 200: LabelList } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return labels.list(workspaceId);
  });

  app.post(
    '/labels',
    { schema: { body: CreateLabelInput, response: { 201: Label } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      reply.code(201);
      return labels.create(workspaceId, req.body);
    },
  );
}
```

A handler does four things: resolve the context, pass parsed input to **one** use-case method,
set a success status if it is not 200, and return the result. Business decisions, loops over
records, Drizzle calls and calls to external systems don't belong here.

## 2. Plugins, encapsulation and registration

- "By default, `register` creates a new scope" and "parent contexts cannot access entities within
  their descendant contexts" (Fastify Encapsulation). Each module's routes plugin is a plain
  async function registered by the static registry in `src/modules/index.ts`; don't wrap module
  plugins in `fastify-plugin`, which would leak their hooks and decorators to siblings.
- `@fastify/autoload` is installed but intentionally unused: the registry is explicit, so adding
  a module is one line in `modules/index.ts`.
- Type providers "don't propagate globally": call `appBase.withTypeProvider<ZodTypeProvider>()`
  inside every plugin, or handler types fall back to `unknown`.
- Shared infrastructure (CORS, helmet, rate limit, SSE plugin) is registered once in `app.ts`
  before the modules.
- Expensive routes get a per-route `config: { rateLimit: { max, timeWindow } }`.

## 3. Schemas: params, body, querystring and response

- **Contracts first.** Shapes the client reads (bodies, responses) are Zod schemas in
  `@devdigest/shared` and change in **both** copies (`server/src/vendor/shared`,
  `client/src/vendor/shared`). Route-only plumbing such as `IdParams` lives in
  `modules/_shared/schemas.ts` or the module's `schemas.ts`.
- **Version trap.** The project runs Zod 3 with `fastify-type-provider-zod` 4.x (turkerdev):
  versions ≤ 4.x support Zod 3, 5.x–6.x need Zod 4, and the Fastify-org fork
  `@fastify/type-provider-zod` "only works with Zod v4.2 or later". Don't "upgrade" to it
  without upgrading Zod.
- `app.ts` sets `setValidatorCompiler(validatorCompiler)` and
  `setSerializerCompiler(serializerCompiler)` once. With a schema declared, invalid input becomes
  422 before the handler runs; don't re-parse `req.body` by hand (`Schema.parse(req.body)` in a
  handler is a legacy pattern).
- **Always declare `response`.** A response schema serializes faster and "prevents accidental
  disclosure of sensitive information" (Fastify docs): fields not in the schema are dropped, so a
  raw row can't leak columns. A route without `response` is a red flag in new code.
- Querystrings: declare `querystring` with coercion (`z.coerce.number()`) instead of parsing
  strings in the handler.
- Don't call `.parse` again in the use case on data the route already validated
  (zod: avoid double validation). The use case accepts the `z.infer` type.

## 4. Request context and workspace scoping

- Every handler calls `getContext(container, req)` (`modules/_shared/context.ts`) and passes
  `workspaceId` (and `userId` when needed) to the use case as plain values.
- The use case passes `workspaceId` to every repository call; the repository puts it in every
  `where`. Lookups by id alone (`getRunTrace(runId)`) are a cross-workspace read waiting to happen.
- Never pass `req`, `reply`, headers or the Fastify logger into the core. If the core needs a
  logger, inject a narrow `Logger` interface.

## 5. Errors

- Domain functions return decisions (`{ ok: false, reason }`) or throw plain domain errors; use
  cases throw `AppError` subclasses from `platform/errors.ts`: `NotFoundError` (404),
  `ValidationError` (422), `ConfigError` (500), `ExternalServiceError` (502).
- One central `setErrorHandler` in `app.ts` builds the envelope `{ error: { code, message,
  details? } }`. It also maps Zod type-provider errors to 422 and matches `ZodError` by shape,
  because two Zod instances exist (shared vs api). Handlers don't `try/catch` to format errors.
- Don't `reply.code(404).send(...)` for a business outcome: throw `NotFoundError`. Route-level
  `reply.code()` is for success statuses (201, 202, 204).
- Child-scope error handlers take precedence over the root one ("Error handlers are fully
  encapsulated"); avoid them unless a module truly needs a different envelope.
- Known debt: `AppError` carries `statusCode`, so the application ring knows HTTP numbers. Keep
  using this taxonomy (one beats two): when a new kind of outcome appears, add a subclass in
  `platform/errors.ts` (e.g. `ConflictError`, code `conflict`, 409) and throw it from the use case.
  That file is the only place a status code is attached; don't add HTTP knowledge anywhere else.

## 6. Decorators and hooks

- The only instance decorator is `container` (typed through `declare module 'fastify'` in
  `app.ts`). Don't decorate services, repositories or clients onto the instance: that is a
  second, implicit container and hides dependencies.
- `decorate` is synchronous and checked at boot; `decorateRequest` with a reference type is an
  error — set per-request values in an `onRequest` hook instead.
- `onClose` is "the safe place for plugins to release resources such as database connection
  pools"; the DB handle is closed there by the root.
- Auth/tenancy is resolved per handler through `getContext`, not through hooks, in this codebase.

## 7. Job handlers and SSE are driving adapters too

- **JobRunner** (`platform/jobs.ts`) handlers are registered inside the module's routes plugin
  (like `RepoService.registerCloneJobHandler()`), next to the routes that enqueue them. A handler
  parses its payload (Zod), calls one use-case method and returns; retry/timeout policy belongs to
  JobRunner. Remember `withTimeout` does not cancel work (see `server/INSIGHTS.md`): pass an
  `AbortSignal` if the work must stop.
- **SSE** is an HTTP concern: the route turns a RunBus subscription into an async generator for
  `reply.sse()`. The use case doesn't import `runBus`; it reports progress through an injected
  callback (the `onEvent` pattern of `reviewPullRequest`), and the composition side connects that
  callback to RunBus.

## 8. Legacy routes

`modules/pulls/routes.ts`, `polling/routes.ts`, `settings/routes.ts` and `workspace/routes.ts`
keep Drizzle queries inline (`server/CLAUDE.md` marks pulls and polling as legacy). They are in
the dependency-cruiser baseline. Don't copy them; when you change one, put new queries in the
module's repository and new rules in `domain.ts`. Full list: [devdigest-map.md](devdigest-map.md).
