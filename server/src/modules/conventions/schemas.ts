import { z } from 'zod';

/**
 * Route-only Zod schemas of the conventions module (http ring). Bodies and response shapes the
 * client reads live in @devdigest/shared (`contracts/conventions.ts`); this file holds the
 * acknowledgement wrapper.
 */

/** Acknowledgement returned by DELETE /conventions/:id. */
export const Ok = z.object({ ok: z.literal(true) });
