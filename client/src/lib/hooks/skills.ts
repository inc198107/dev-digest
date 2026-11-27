/**
 * hooks/skills.ts — React Query hooks for the Skills Lab (skill CRUD, versions, usage stats,
 * import preview, community search) and an agent's linked skills (Agent editor → Skills tab).
 */
"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AgentSkillLink,
  CommunitySkillSearchResult,
  Skill,
  SkillCreateBody,
  SkillImportPreview,
  SkillListItem,
  SkillStats,
  SkillStatsSummary,
  SkillUpdateBody,
  SkillVersion,
} from "@devdigest/shared";
import { api } from "../api";

/** Query keys of the skills hooks (one place, so invalidation cannot drift). */
const SKILLS_ROOT = ["skills"] as const;
const AGENT_SKILLS_ROOT = ["agent-skills"] as const;
/** Community search lives outside the skills root: a skill edit must not re-query GitHub. */
const COMMUNITY_ROOT = ["skill-community"] as const;

/** Shortest community search text the API accepts (`CommunitySkillQuery`). */
const MIN_COMMUNITY_QUERY_CHARS = 2;

/** How long a community search result stays fresh (ms); the API caches GitHub answers too. */
const COMMUNITY_STALE_MS = 10 * 60_000;

/**
 * Query keys of the skills hooks, nested under one root, so invalidating `all` also refreshes
 * every list, detail, version history and usage stats (for example a detail's `used_by` or the
 * card numbers after a link changes).
 */
export const skillKeys = {
  all: SKILLS_ROOT,
  list: () => [...SKILLS_ROOT, "list"] as const,
  one: (id: string | null | undefined) => [...SKILLS_ROOT, "detail", id] as const,
  versions: (id: string | null | undefined) => [...SKILLS_ROOT, "versions", id] as const,
  stats: (id: string | null | undefined) => [...SKILLS_ROOT, "stats", id] as const,
  statsSummary: () => [...SKILLS_ROOT, "stats-summary"] as const,
  community: (q: string) => [...COMMUNITY_ROOT, q] as const,
  agentLinksAll: AGENT_SKILLS_ROOT,
  agentLinks: (agentId: string | null | undefined) => [...AGENT_SKILLS_ROOT, agentId] as const,
};

/**
 * @returns Every skill of the workspace, with the agents that link it.
 */
export function useSkills() {
  return useQuery({ queryKey: skillKeys.list(), queryFn: () => api.get<SkillListItem[]>("/skills") });
}

/**
 * @param id Skill id.
 * @returns One skill with its "used by" list.
 */
export function useSkill(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.one(id),
    queryFn: () => api.get<SkillListItem>(`/skills/${id}`),
    enabled: !!id,
  });
}

/**
 * @param id Skill id.
 * @returns The skill's body snapshots, newest first.
 */
export function useSkillVersions(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.versions(id),
    queryFn: () => api.get<SkillVersion[]>(`/skills/${id}/versions`),
    enabled: !!id,
  });
}

/**
 * @param id Skill id.
 * @returns How the skill was used in the last 30 days (runs that loaded it, their findings).
 */
export function useSkillStats(id: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.stats(id),
    queryFn: () => api.get<SkillStats>(`/skills/${id}/stats`),
    enabled: !!id,
  });
}

/**
 * @returns The card numbers (users, pull frequency, accept rate) of every skill of the workspace.
 */
export function useSkillStatsSummary() {
  return useQuery({
    queryKey: skillKeys.statsSummary(),
    queryFn: () => api.get<SkillStatsSummary[]>("/skills/stats"),
  });
}

/**
 * Search public GitHub repositories for `SKILL.md` files. Runs only for a text of at least
 * `MIN_COMMUNITY_QUERY_CHARS` characters and keeps the previous result while the next one loads,
 * so the list does not flash empty while the user types.
 * @param query The search text (debounced by the caller).
 * @returns The search query; `data.configured` is false when no GitHub token is set.
 */
export function useCommunitySkillSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: skillKeys.community(q),
    queryFn: () => api.get<CommunitySkillSearchResult>(`/skills/community?q=${encodeURIComponent(q)}`),
    enabled: q.length >= MIN_COMMUNITY_QUERY_CHARS,
    placeholderData: keepPreviousData,
    staleTime: COMMUNITY_STALE_MS,
    retry: false,
  });
}

/**
 * @returns Create a skill (manual or a confirmed import).
 */
export function useCreateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SkillCreateBody) => api.post<Skill>("/skills", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

/** Input of `useUpdateSkill`. */
export interface UpdateSkillInput {
  id: string;
  patch: SkillUpdateBody;
}

/**
 * @returns Update a skill; a change the model sees creates a new version.
 */
export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: UpdateSkillInput) => api.put<Skill>(`/skills/${id}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

/**
 * @returns Delete a skill; it disappears from every agent.
 */
export function useDeleteSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/skills/${id}`),
    onSuccess: (_data, id) => {
      qc.removeQueries({ queryKey: skillKeys.one(id) });
      qc.removeQueries({ queryKey: skillKeys.versions(id) });
      qc.invalidateQueries({ queryKey: skillKeys.all });
      qc.invalidateQueries({ queryKey: skillKeys.agentLinksAll });
    },
  });
}

/** Input of `useRestoreSkillVersion`. */
export interface RestoreSkillInput {
  id: string;
  version: number;
}

/**
 * @returns Restore a snapshot's body as a new version.
 */
export function useRestoreSkillVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: RestoreSkillInput) =>
      api.post<Skill>(`/skills/${id}/versions/${version}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}

/** What to preview: an uploaded file (base64) or an https URL. */
export type ImportSkillSource =
  | { kind: "file"; filename: string; content_base64: string }
  | { kind: "url"; url: string };

/**
 * Preview an import. Stores nothing: the user confirms with `useCreateSkill`.
 * @returns The preview mutation.
 */
export function useImportSkillPreview() {
  return useMutation({
    mutationFn: (source: ImportSkillSource) =>
      source.kind === "file"
        ? api.post<SkillImportPreview>("/skills/import/file", {
            filename: source.filename,
            content_base64: source.content_base64,
          })
        : api.post<SkillImportPreview>("/skills/import/url", { url: source.url }),
  });
}

/**
 * @param agentId Agent id.
 * @returns The agent's linked skills, in prompt order.
 */
export function useAgentSkills(agentId: string | null | undefined) {
  return useQuery({
    queryKey: skillKeys.agentLinks(agentId),
    queryFn: () => api.get<AgentSkillLink[]>(`/agents/${agentId}/skills`),
    enabled: !!agentId,
  });
}

/**
 * Replace the agent's linked skills with an ordered list. Optimistic, so a drag-and-drop
 * reorder shows at once; rolled back when the API refuses it.
 * @param agentId Agent id.
 * @returns The mutation taking the skill ids in their new order.
 */
export function useSetAgentSkills(agentId: string) {
  const qc = useQueryClient();
  const key = skillKeys.agentLinks(agentId);
  return useMutation({
    mutationFn: (skillIds: string[]) =>
      api.post<AgentSkillLink[]>(`/agents/${agentId}/skills`, { skill_ids: skillIds }),
    onMutate: async (skillIds) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<AgentSkillLink[]>(key);
      qc.setQueryData<AgentSkillLink[]>(
        key,
        skillIds.map((skill_id, order) => ({ agent_id: agentId, skill_id, order })),
      );
      return { previous };
    },
    onError: (_err, _ids, ctx) => qc.setQueryData(key, ctx?.previous),
    onSuccess: (links) => qc.setQueryData(key, links),
    onSettled: () => qc.invalidateQueries({ queryKey: skillKeys.all }),
  });
}
