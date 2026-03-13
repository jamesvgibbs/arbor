import type {
  WorktreeCreateInput,
  WorktreeCreateResult,
  WorktreeListResult,
  WorktreeRemoveResult,
  WorktreeSettingsResult,
  WorktreeCheckLifecycleInput,
  WorktreeCheckLifecycleResult,
  IDEDetectionResult,
  IDESettingsResult,
  IDEUpdateSettingsInput,
  WorktreeOpenInIDEInput,
} from "@arbortools/contracts";
import { queryOptions, mutationOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

export const worktreeQueryKeys = {
  all: ["worktree"] as const,
  list: () => ["worktree", "list"] as const,
  settings: () => ["worktree", "settings"] as const,
  ideDetection: () => ["worktree", "ideDetection"] as const,
  ideSettings: () => ["worktree", "ideSettings"] as const,
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

export function worktreeCheckLifecycleMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["worktree", "checkLifecycle"] as const,
    mutationFn: async (params: WorktreeCheckLifecycleInput): Promise<WorktreeCheckLifecycleResult> => {
      const api = ensureNativeApi();
      return api.worktree.checkLifecycle(params);
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.list() });
    },
  });
}

// ── IDE Detection & Settings ───────────────────────────────────────

export function ideDetectionQueryOptions() {
  return queryOptions({
    queryKey: worktreeQueryKeys.ideDetection(),
    queryFn: async (): Promise<IDEDetectionResult> => {
      const api = ensureNativeApi();
      return api.worktree.detectIDEs();
    },
    staleTime: 60_000,
  });
}

export function ideSettingsQueryOptions() {
  return queryOptions({
    queryKey: worktreeQueryKeys.ideSettings(),
    queryFn: async (): Promise<IDESettingsResult> => {
      const api = ensureNativeApi();
      return api.worktree.getIDESettings();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function ideUpdateSettingsMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["worktree", "updateIDESettings"] as const,
    mutationFn: async (params: IDEUpdateSettingsInput): Promise<IDESettingsResult> => {
      const api = ensureNativeApi();
      return api.worktree.updateIDESettings(params);
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: worktreeQueryKeys.ideSettings() });
    },
  });
}

export function ideOpenInIDEMutationOptions() {
  return mutationOptions({
    mutationKey: ["worktree", "openInIDE"] as const,
    mutationFn: async (params: WorktreeOpenInIDEInput): Promise<void> => {
      const api = ensureNativeApi();
      return api.worktree.openInIDE(params);
    },
  });
}
