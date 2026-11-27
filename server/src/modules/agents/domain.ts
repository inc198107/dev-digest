import type { Agent, AgentUpdateBody } from '@devdigest/shared';

/**
 * Agents domain rules (domain ring): pure functions, no I/O, no clock. The use case loads the
 * agent, asks these functions what to do, then persists the result.
 */

/** The agent fields whose change counts as a config change. */
export type AgentConfigFields = Pick<
  Agent,
  | 'name'
  | 'description'
  | 'provider'
  | 'model'
  | 'system_prompt'
  | 'strategy'
  | 'ci_fail_on'
  | 'repo_intel'
>;

/**
 * Decide whether a patch changes the agent's config (anything but `enabled`).
 * A config change bumps the version and snapshots the config for reproducibility.
 * @param existing The agent's current config fields.
 * @param patch The requested update.
 * @returns True when the patch changes at least one config field.
 */
export function isConfigChange(existing: AgentConfigFields, patch: AgentUpdateBody): boolean {
  return (
    (patch.name !== undefined && patch.name !== existing.name) ||
    (patch.description !== undefined && patch.description !== existing.description) ||
    (patch.provider !== undefined && patch.provider !== existing.provider) ||
    (patch.model !== undefined && patch.model !== existing.model) ||
    (patch.system_prompt !== undefined && patch.system_prompt !== existing.system_prompt) ||
    (patch.strategy !== undefined && patch.strategy !== existing.strategy) ||
    (patch.ci_fail_on !== undefined && patch.ci_fail_on !== existing.ci_fail_on) ||
    (patch.repo_intel !== undefined && patch.repo_intel !== existing.repo_intel) ||
    patch.output_schema !== undefined
  );
}

/** What an update does to the agent's version. */
export interface VersionPlan {
  /** True when a new version must be recorded. */
  bump: boolean;
  /** The version the agent has after the update. */
  version: number;
}

/**
 * Plan the version change for an update.
 * @param existing The agent's current config fields and version.
 * @param patch The requested update.
 * @returns Whether to bump, and the resulting version number.
 */
export function planVersion(
  existing: AgentConfigFields & Pick<Agent, 'version'>,
  patch: AgentUpdateBody,
): VersionPlan {
  const bump = isConfigChange(existing, patch);
  return { bump, version: bump ? existing.version + 1 : existing.version };
}

/**
 * Resolve where a newly linked skill goes in the agent's ordered skill list.
 * @param linkedCount How many skills are already linked.
 * @param requested The order the caller asked for, if any.
 * @returns The requested order, or the end of the list.
 */
export function nextSkillOrder(linkedCount: number, requested?: number): number {
  return requested ?? linkedCount;
}

/**
 * Find the requested skills that the workspace does not have. UUIDs compare case-insensitively.
 * @param requested Skill ids the caller wants to link.
 * @param known Skill ids that exist in the agent's workspace.
 * @returns Requested ids that are not known, in request order.
 */
export function unknownSkillIds(requested: readonly string[], known: readonly string[]): string[] {
  const knownSet = new Set(known.map((id) => id.toLowerCase()));
  return requested.filter((id) => !knownSet.has(id.toLowerCase()));
}
