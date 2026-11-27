import { z } from 'zod';
import { Agent, AgentSkillLink, AgentVersion, ModelInfo, Provider } from '@devdigest/shared';

/**
 * Route-only Zod schemas of the agents module (http ring). Bodies and response
 * shapes the client reads live in @devdigest/shared; this file holds path params
 * and the array/ack wrappers used in `response`.
 */

/** `/providers/:id` addresses a provider by name, not a uuid. */
export const ProviderParams = z.object({ id: Provider });

/** `/agents/:id/versions/:version`: id is a uuid, version a positive integer. */
export const VersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

export const AgentList = z.array(Agent);
export const AgentVersionList = z.array(AgentVersion);
export const AgentSkillLinkList = z.array(AgentSkillLink);
export const ModelInfoList = z.array(ModelInfo);

/** Acknowledgement returned by DELETE. */
export const Ok = z.object({ ok: z.literal(true) });
