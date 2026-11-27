/**
 * hooks/conventions.ts — React Query hooks for the Conventions Extractor: a repo's conventions,
 * the scan, accept / reword / reject one, accept all / deselect all.
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConventionCandidate,
  ConventionList,
  ConventionScanResult,
  ConventionUpdateBody,
} from "@devdigest/shared";
import { api } from "../api";

/** Query keys of the conventions hooks, nested under one root. */
export const conventionKeys = {
  all: ["conventions"] as const,
  list: (repoId: string | null | undefined) => ["conventions", "list", repoId] as const,
};

/**
 * @param repoId Repository id.
 * @returns The repo's conventions and the time of the last scan.
 */
export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionKeys.list(repoId),
    queryFn: () => api.get<ConventionList>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

/**
 * Scan the repo (two model calls; takes up to a minute). The result replaces the cached list.
 * @param repoId Repository id.
 * @returns The scan mutation.
 */
export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionScanResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: ({ candidates, last_scan_at }) =>
      qc.setQueryData<ConventionList>(conventionKeys.list(repoId), { candidates, last_scan_at }),
  });
}

/** Input of `useUpdateConvention`. */
export interface UpdateConventionInput {
  id: string;
  patch: ConventionUpdateBody;
}

/**
 * Reword and/or accept one convention. Optimistic, so Accept reacts at once; rolled back when the
 * API refuses it.
 * @param repoId Repository id (the list to update).
 * @returns The update mutation.
 */
export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  const key = conventionKeys.list(repoId);
  return useMutation({
    mutationFn: ({ id, patch }: UpdateConventionInput) => api.put<ConventionCandidate>(`/conventions/${id}`, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ConventionList>(key);
      if (previous) {
        qc.setQueryData<ConventionList>(key, {
          ...previous,
          candidates: previous.candidates.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        });
      }
      return { previous };
    },
    onError: (_err, _input, ctx) => qc.setQueryData(key, ctx?.previous),
    onSuccess: (updated) =>
      qc.setQueryData<ConventionList>(key, (list) =>
        list ? { ...list, candidates: list.candidates.map((c) => (c.id === updated.id ? updated : c)) } : list,
      ),
  });
}

/**
 * Reject one convention: it is deleted (a re-scan may propose it again).
 * @param repoId Repository id (the list to update).
 * @returns The reject mutation taking the convention id.
 */
export function useRejectConvention(repoId: string) {
  const qc = useQueryClient();
  const key = conventionKeys.list(repoId);
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/conventions/${id}`),
    onSuccess: (_data, id) =>
      qc.setQueryData<ConventionList>(key, (list) =>
        list ? { ...list, candidates: list.candidates.filter((c) => c.id !== id) } : list,
      ),
  });
}

/**
 * Accept every convention of the repo, or none.
 * @param repoId Repository id.
 * @returns The mutation taking the flag every convention gets.
 */
export function useSetAllConventionsAccepted(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (accepted: boolean) =>
      api.put<ConventionList>(`/repos/${repoId}/conventions/accepted`, { accepted }),
    onSuccess: (list) => qc.setQueryData(conventionKeys.list(repoId), list),
  });
}
