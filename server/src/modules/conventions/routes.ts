import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  ConventionCandidate,
  ConventionList,
  ConventionScanResult,
  ConventionsAcceptAllBody,
  ConventionUpdateBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { Ok } from './schemas.js';
import { ConventionsService } from './service.js';

/**
 * Conventions routes (http ring): parse → one use-case call → typed response.
 *   GET    /repos/:id/conventions           → the repo's conventions + last scan time
 *   POST   /repos/:id/conventions/extract   → scan the repo (one model call, rate-limited)
 *   PUT    /repos/:id/conventions/accepted  → accept all / deselect all
 *   PUT    /conventions/:id                 → reword and/or accept one
 *   DELETE /conventions/:id                 → reject one (deleted)
 * The scan runs inside the request on purpose (spec `specs/conventions.md`): the UI needs the
 * result or the error at once, and JobRunner has no status channel the client can read.
 *
 * @param appBase Encapsulated Fastify instance for this module.
 * @returns Resolves when the routes are registered.
 */
export default async function conventionsRoutes(appBase: FastifyInstance): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService({
    store: container.conventionsRepo,
    uow: container.conventionsUow,
    sources: container.conventionSources,
    model: (workspaceId) => container.featureLlm(workspaceId, 'conventions'),
  });

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/conventions/extract',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: { params: IdParams, response: { 200: ConventionScanResult } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.extract(workspaceId, req.params.id);
    },
  );

  app.put(
    '/repos/:id/conventions/accepted',
    { schema: { params: IdParams, body: ConventionsAcceptAllBody, response: { 200: ConventionList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.setAllAccepted(workspaceId, req.params.id, req.body.accepted);
    },
  );

  app.put(
    '/conventions/:id',
    { schema: { params: IdParams, body: ConventionUpdateBody, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const convention = await service.update(workspaceId, req.params.id, req.body);
      if (!convention) throw new NotFoundError('Convention not found');
      return convention;
    },
  );

  app.delete(
    '/conventions/:id',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const ok = await service.reject(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Convention not found');
      return { ok: true as const };
    },
  );
}
