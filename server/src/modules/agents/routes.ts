import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { Agent, AgentCreateBody, AgentSkillsBody, AgentUpdateBody, AgentVersion } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import {
  AgentList,
  AgentSkillLinkList,
  AgentVersionList,
  ModelInfoList,
  Ok,
  ProviderParams,
  VersionParams,
} from './schemas.js';
import { AgentsService } from './service.js';

/**
 * Agents routes (http ring): parse → one use-case call → typed response.
 *   GET    /agents                        → list (workspace-scoped)
 *   GET    /agents/:id                    → one agent
 *   POST   /agents                        → create (records version 1)
 *   PUT    /agents/:id                    → update / toggle enabled (versions config)
 *   DELETE /agents/:id                    → delete
 *   GET    /agents/:id/versions           → config history (newest first)
 *   GET    /agents/:id/versions/:version  → one config snapshot
 *   GET    /agents/:id/skills             → linked skills (ordered)
 *   POST   /agents/:id/skills             → set/reorder linked skills OR link one
 *   GET    /agents/:id/models             → model list for the agent's provider
 *   GET    /providers/:id/models          → model list for a provider (editor)
 *
 * @param appBase Encapsulated Fastify instance for this module.
 * @returns Resolves when the routes are registered.
 */
export default async function agentsRoutes(appBase: FastifyInstance): Promise<void> {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new AgentsService({
    store: container.agentsRepo,
    uow: container.agentsUow,
    listModels: async (provider) => (await container.llm(provider)).listModels(),
  });

  app.get('/agents', { schema: { response: { 200: AgentList } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId);
  });

  app.get(
    '/agents/:id',
    { schema: { params: IdParams, response: { 200: Agent } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const agent = await service.get(workspaceId, req.params.id);
      if (!agent) throw new NotFoundError('Agent not found');
      return agent;
    },
  );

  app.post(
    '/agents',
    { schema: { body: AgentCreateBody, response: { 201: Agent } } },
    async (req, reply) => {
      const { workspaceId, userId } = await getContext(container, req);
      const agent = await service.create(workspaceId, req.body, userId);
      reply.code(201);
      return agent;
    },
  );

  app.put(
    '/agents/:id',
    { schema: { params: IdParams, body: AgentUpdateBody, response: { 200: Agent } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const agent = await service.update(workspaceId, req.params.id, req.body);
      if (!agent) throw new NotFoundError('Agent not found');
      return agent;
    },
  );

  app.delete(
    '/agents/:id',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Agent not found');
      return { ok: true as const };
    },
  );

  app.get(
    '/agents/:id/versions',
    { schema: { params: IdParams, response: { 200: AgentVersionList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Agent not found');
      return versions;
    },
  );

  app.get(
    '/agents/:id/versions/:version',
    { schema: { params: VersionParams, response: { 200: AgentVersion } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const version = await service.getVersion(workspaceId, req.params.id, req.params.version);
      if (!version) throw new NotFoundError('Agent version not found');
      return version;
    },
  );

  app.get(
    '/agents/:id/skills',
    { schema: { params: IdParams, response: { 200: AgentSkillLinkList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const links = await service.skillLinks(workspaceId, req.params.id);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  app.post(
    '/agents/:id/skills',
    { schema: { params: IdParams, body: AgentSkillsBody, response: { 200: AgentSkillLinkList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const body = req.body;
      const links =
        'skill_ids' in body
          ? await service.setSkills(workspaceId, req.params.id, body.skill_ids)
          : await service.linkSkill(workspaceId, req.params.id, body.skill_id, body.order);
      if (!links) throw new NotFoundError('Agent not found');
      return links;
    },
  );

  app.get(
    '/agents/:id/models',
    { schema: { params: IdParams, response: { 200: ModelInfoList } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const models = await service.modelsForAgent(workspaceId, req.params.id);
      if (!models) throw new NotFoundError('Agent not found');
      return models;
    },
  );

  app.get(
    '/providers/:id/models',
    { schema: { params: ProviderParams, response: { 200: ModelInfoList } } },
    async (req) => {
      await getContext(container, req);
      return service.listModels(req.params.id);
    },
  );
}
