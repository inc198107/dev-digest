import type { SkillBlock } from '@devdigest/shared';

/**
 * Public facade of the skills module for other modules (the reviews run executor reads an
 * agent's skills through `container.skillsForAgent`). Import this file, never the module's
 * internals.
 */

export type { SkillBlock };

/** The skill blocks of an agent's review prompt. */
export interface SkillsForAgent {
  /**
   * @param workspaceId Tenant scope.
   * @param agentId Agent id.
   * @returns One block per linked and enabled skill, in link order, with its token count.
   */
  forAgent(workspaceId: string, agentId: string): Promise<SkillBlock[]>;
}
