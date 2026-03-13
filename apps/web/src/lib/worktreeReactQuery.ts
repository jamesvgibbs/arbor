import type {
  WorktreeCreateInput,
  WorktreeCreateResult,
  WorktreeListResult,
  WorktreeRemoveResult,
  WorktreeSettingsResult,
} from "@arbortools/contracts";
import { queryOptions, mutationOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

export const worktreeQueryKeys = {
  all: ["worktree"] as const,
  list: () => ["worktree", "list"] as const,
  settings: () => ["worktree", "settings"] as const,
};

export function worktreeListQueryOptions() {
  return queryOptions({
    queryKey: worktreeQueryKeys.list(),
    queryFn: async (): Promise<WorktreeListResult> => {
      const api = ensureNativeApi();
      return api.worktree.list();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function worktreeSettingsQueryOptions() {
  return queryOptions({
    queryKey: worktreeQueryKeys.settings(),
    queryFn: async (): Promise<WorktreeSettingsResult> => {
      const api = ensureNativeApi();
      return api.worktree.getSettings();
    },
    staleTime: Infinity,
  });
}

export function worktreeCreateMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["worktree", "create"] as const,
    mutationFn: async (params: WorktreeCreateInput): Promise<WorktreeCreateResult> => {
      const api = ensureNativeApi();
      return api.worktree.create(params);
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.list() });
    },
  });
}

export function worktreeRemoveMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["worktree", "remove"] as const,
    mutationFn: async (params: { sessionId: string }): Promise<WorktreeRemoveResult> => {
      const api = ensureNativeApi();
      return api.worktree.remove(params);
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.list() });
    },
  });
}

export function worktreeUpdateSettingsMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["worktree", "updateSettings"] as const,
    mutationFn: async (params: { basePath: string }): Promise<WorktreeSettingsResult> => {
      const api = ensureNativeApi();
      return api.worktree.updateSettings(params);
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.settings() });
    },
  });
}
