import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  CommunitySkillQuery,
  CommunitySkillSearchResult,
  Skill,
  SkillCreateBody,
  SkillImportFileBody,
  SkillImportPreview,
  SkillImportUrlBody,
  SkillListItem,
  SkillStats,
  SkillUpdateBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { Ok, SkillList, SkillStatsList, SkillVersionList, SkillVersionParams } from './schemas.js';
import { CommunitySkillsService, SkillStatsService, SkillsService } from './service.js';

/** Request body cap of the file import: a 1 MiB file as base64 plus the JSON around it. */
const IMPORT_FILE_BODY_LIMIT = 2 * 1024 * 1024;

/**
 * Skills routes (http ring): parse → one use-case call → typed response.
 *   GET    /skills                                → list with "used by" (workspace-scoped)
 *   POST   /skills                                → create (snapshots v1)
 *   GET    /skills/:id                            → one skill with "used by"
 *   PUT    /skills/:id                            → update (model-visible change → new version)
 *   DELETE /skills/:id                            → delete (unlinks it from every agent)
 *   GET    /skills/:id/versions                   → body snapshots, newest first
 *   POST   /skills/:id/versions/:version/restore  → restore a snapshot as a new version
 *   POST   /skills/import/file                    → preview a .md / .zip / .skill upload
 *   POST   /skills/import/url                     → preview a file fetched over https
 *   GET    /skills/stats                          → card stats of every skill (last 30 days)
 *   GET    /skills/:id/stats                      → one skill's stats (last 30 days)
 *   GET    /skills/community?q=                   → SKILL.md files in public GitHub repos
 * The import routes only preview: the client saves with POST /skills after the user confirms.
 * `/skills/stats` and `/skills/community` are static paths, so they win over `/skills/:id`.
 *
 * @param appBase Encapsulated Fastify instance for this module.
 * @returns Resolves when the routes are registered.
 */
export default async function skillsRoutes(appBase: FastifyInstance): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SkillsService({
    store: container.skillsRepo,
    uow: container.skillsUow,
    archive: container.skillArchive,
    fetcher: container.skillFetcher,
    tokens: container.tokenizer,
  });
  const stats = new SkillStatsService({ stats: container.skillsRepo });
  const community = new CommunitySkillsService({ search: container.communitySkills });

  app.get('/skills', { schema: { response: { 200: SkillList } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.post(
    '/skills',
    { schema: { body: SkillCreateBody, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.create(workspaceId, req.body);
      reply.code(201);
      return skill;
    },
  );

  app.get(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: SkillListItem } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.get(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: SkillUpdateBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.update(workspaceId, req.params.id, req.body);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Skill not found');
      return { ok: true as const };
    },
  );

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: SkillVersionList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.post(
    '/skills/:id/versions/:version/restore',
    { schema: { params: SkillVersionParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.restore(workspaceId, req.params.id, req.params.version);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.post(
    '/skills/import/file',
    {
      bodyLimit: IMPORT_FILE_BODY_LIMIT,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: { body: SkillImportFileBody, response: { 200: SkillImportPreview } },
    },
    async (req) => {
      await getContext(container, req);
      return service.previewFile(req.body.filename, req.body.content_base64);
    },
  );

  app.post(
    '/skills/import/url',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { body: SkillImportUrlBody, response: { 200: SkillImportPreview } },
    },
    async (req) => {
      await getContext(container, req);
      return service.previewUrl(req.body.url);
    },
  );

  app.get('/skills/stats', { schema: { response: { 200: SkillStatsList } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return stats.summary(workspaceId);
  });

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const result = await stats.forSkill(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Skill not found');
      return result;
    },
  );

  app.get(
    '/skills/community',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      schema: { querystring: CommunitySkillQuery, response: { 200: CommunitySkillSearchResult } },
    },
    async (req) => {
      await getContext(container, req);
      return community.search(req.query.q);
    },
  );
}
