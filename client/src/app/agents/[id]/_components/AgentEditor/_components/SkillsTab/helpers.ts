import type { AgentSkillLink, SkillListItem } from "@devdigest/shared";

/** Where a dragged skill lands relative to the row it is dropped on. */
export type DropPosition = "before" | "after";

/**
 * @param links The agent's links.
 * @returns Linked skill ids in prompt order.
 */
export function linkedIds(links: readonly AgentSkillLink[]): string[] {
  return [...links].sort((a, b) => a.order - b.order).map((l) => l.skill_id);
}

/**
 * @param skills Every skill of the workspace.
 * @param ids Linked skill ids in prompt order.
 * @returns The linked skills in that order (ids of deleted skills are skipped).
 */
export function linkedSkills(skills: readonly SkillListItem[], ids: readonly string[]): SkillListItem[] {
  const byId = new Map(skills.map((s) => [s.id, s]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * @param skills Every skill of the workspace.
 * @param ids Linked skill ids.
 * @returns The skills not linked yet, by name.
 */
export function availableSkills(skills: readonly SkillListItem[], ids: readonly string[]): SkillListItem[] {
  const linked = new Set(ids);
  return skills.filter((s) => !linked.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Link a skill at the end of the prompt order, or unlink it.
 * @param ids Linked skill ids in prompt order.
 * @param id The skill to toggle.
 * @returns The new order.
 */
export function toggleLink(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/**
 * Move a linked skill next to another one (drag and drop).
 * @param ids Linked skill ids in prompt order.
 * @param id The dragged skill.
 * @param targetId The skill it was dropped on.
 * @param position Before or after the target.
 * @returns The new order; unchanged when either id is not linked or they are the same.
 */
export function moveRelative(
  ids: readonly string[],
  id: string,
  targetId: string,
  position: DropPosition,
): string[] {
  if (id === targetId || !ids.includes(id) || !ids.includes(targetId)) return [...ids];
  const rest = ids.filter((x) => x !== id);
  const at = rest.indexOf(targetId) + (position === "after" ? 1 : 0);
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * Move a linked skill one step up or down (keyboard alternative to dragging).
 * @param ids Linked skill ids in prompt order.
 * @param id The skill to move.
 * @param delta -1 to move up, +1 to move down.
 * @returns The new order; unchanged at the edges.
 */
export function moveBy(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/**
 * Case-insensitive filter over a skill's name, description and type.
 * @param skill The skill.
 * @param query Filter text.
 * @returns True when the skill matches (always for an empty query).
 */
export function matchesFilter(skill: SkillListItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || `${skill.name} ${skill.description} ${skill.type}`.toLowerCase().includes(q);
}

/**
 * Which half of a row the pointer is over. Without a usable pointer position or row height
 * (no layout, synthetic events) the skill goes before the row it was dropped on.
 * @param clientY Pointer position.
 * @param rect The row's bounding box.
 * @returns "before" over the upper half, else "after".
 */
export function dropPosition(clientY: number | undefined, rect: Pick<DOMRect, "top" | "height">): DropPosition {
  if (typeof clientY !== "number" || !Number.isFinite(clientY) || rect.height <= 0) return "before";
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}
