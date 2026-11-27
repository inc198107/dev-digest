import { z } from 'zod';
import { SkillListItem, SkillVersion } from '@devdigest/shared';

/**
 * Route-only Zod schemas of the skills module (http ring). Bodies and response shapes the
 * client reads live in @devdigest/shared; this file holds path params and the list/ack
 * wrappers used in `response`.
 */

/** `/skills/:id/versions/:version`: id is a uuid, version a positive integer. */
export const SkillVersionParams = z.object({
  id: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

export const SkillList = z.array(SkillListItem);
export const SkillVersionList = z.array(SkillVersion);

/** Acknowledgement returned by DELETE. */
export const Ok = z.object({ ok: z.literal(true) });
