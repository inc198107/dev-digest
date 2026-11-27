import { z } from 'zod';
import { ConventionCandidate } from './knowledge.js';

/**
 * Conventions Extractor API contracts. The extractor proposes house rules of a repo, each backed
 * by a code fragment from a file it read; the user accepts, rejects or rewords them and merges
 * the accepted ones into a `convention` skill. The `ConventionCandidate` entity itself is in
 * ./knowledge.
 */

/** Longest convention rule (characters). */
export const MAX_CONVENTION_RULE_CHARS = 300;

/** PUT /conventions/:id: reword the rule and/or accept it, at least one field. */
export const ConventionUpdateBody = z
  .object({
    rule: z.string().trim().min(1).max(MAX_CONVENTION_RULE_CHARS).optional(),
    accepted: z.boolean().optional(),
  })
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, { message: 'Provide rule or accepted' });
export type ConventionUpdateBody = z.infer<typeof ConventionUpdateBody>;

/** PUT /repos/:id/conventions/accepted: accept every convention of the repo, or none. */
export const ConventionsAcceptAllBody = z.object({ accepted: z.boolean() }).strict();
export type ConventionsAcceptAllBody = z.infer<typeof ConventionsAcceptAllBody>;

/** A repo's conventions, most confident first, and when they were last scanned. */
export const ConventionList = z.object({
  candidates: z.array(ConventionCandidate),
  /** ISO time of the newest stored convention; null before the first scan. */
  last_scan_at: z.string().nullable(),
});
export type ConventionList = z.infer<typeof ConventionList>;

/** POST /repos/:id/conventions/extract: the list after the scan and the files it read. */
export const ConventionScanResult = ConventionList.extend({
  /** Repo paths whose content the model saw in this scan. */
  analyzed_files: z.array(z.string()),
});
export type ConventionScanResult = z.infer<typeof ConventionScanResult>;
