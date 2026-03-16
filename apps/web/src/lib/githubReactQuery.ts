import type { GitHubPRListResult, GitHubRepoConfig, GitHubAuthStatus } from "@arbortools/contracts";
import { queryOptions, mutationOptions, type QueryClient } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

const GITHUB_PR_STALE_TIME_MS = 60_000;
const GITHUB_PR_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

export const githubQueryKeys = {
  all: ["github"] as const,
  authStatus: () => ["github", "authStatus"] as const,
  repos: () => ["github", "repos"] as const,
  prs: (owner: string, repo: string) => ["github", "prs", owner, repo] as const,
};

export function invalidateGitHubQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: githubQueryKeys.all });
}

export function githubAuthStatusQueryOptions() {
  return queryOptions({
    queryKey: githubQueryKeys.authStatus(),
    queryFn: async (): Promise<GitHubAuthStatus> => {
      const api = ensureNativeApi();
      return api.github.getAuthStatus();
    },
    staleTime: 30_000,
  });
}

export function githubReposQueryOptions() {
  return queryOptions({
    queryKey: githubQueryKeys.repos(),
    queryFn: async (): Promise<GitHubRepoConfig[]> => {
      const api = ensureNativeApi();
      return api.github.listRepos();
    },
    staleTime: Infinity,
  });
}

export function githubPRsQueryOptions(owner: string | null, repo: string | null) {
  return queryOptions({
    queryKey: githubQueryKeys.prs(owner ?? "", repo ?? ""),
    queryFn: async (): Promise<GitHubPRListResult> => {
      const api = ensureNativeApi();
      if (!owner || !repo) throw new Error("Repository not selected");
      return api.github.listPRs({ owner, repo });
    },
    enabled: owner !== null && repo !== null,
    staleTime: GITHUB_PR_STALE_TIME_MS,
    refetchInterval: GITHUB_PR_REFETCH_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
}

export function githubStartAuthMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["github", "startAuth"] as const,
    mutationFn: async () => {
      const api = ensureNativeApi();
      return api.github.startAuth();
    },
  });
}

export function githubPollAuthMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["github", "pollAuth"] as const,
    mutationFn: async (params: { deviceCode: string; interval: number }) => {
      const api = ensureNativeApi();
      return api.github.pollAuth(params);
    },
    onSuccess: async () => {
      await invalidateGitHubQueries(input.queryClient);
    },
  });
}

export function githubLogoutMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["github", "logout"] as const,
    mutationFn: async () => {
      const api = ensureNativeApi();
      return api.github.logout();
    },
    onSuccess: async () => {
      await invalidateGitHubQueries(input.queryClient);
    },
  });
}

export function githubAddRepoMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["github", "addRepo"] as const,
    mutationFn: async (params: { owner: string; repo: string }) => {
      const api = ensureNativeApi();
      return api.github.addRepo(params);
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: githubQueryKeys.repos() });
    },
  });
}

export function githubRemoveRepoMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["github", "removeRepo"] as const,
    mutationFn: async (params: { owner: string; repo: string }) => {
      const api = ensureNativeApi();
      return api.github.removeRepo(params);
    },
    onSuccess: async () => {
      await input.queryClient.invalidateQueries({ queryKey: githubQueryKeys.repos() });
    },
  });
}

export function githubRefreshPRsMutationOptions(input: { queryClient: QueryClient }) {
  return mutationOptions({
    mutationKey: ["github", "refreshPRs"] as const,
    mutationFn: async (params: { owner: string; repo: string }) => {
      const api = ensureNativeApi();
      return api.github.refreshPRs(params);
    },
    onSuccess: async (_data, variables) => {
      await input.queryClient.invalidateQueries({
        queryKey: githubQueryKeys.prs(variables.owner, variables.repo),
      });
    },
  });
}

export function githubSubmitReviewMutationOptions() {
  return mutationOptions({
    mutationKey: ["github", "submitReview"] as const,
    mutationFn: async (params: {
      owner: string;
      repo: string;
      prNumber: number;
      body: string;
      event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES";
      comments?: Array<{
        path: string;
        body: string;
        line: number;
        side: "LEFT" | "RIGHT";
        startLine?: number;
        startSide?: "LEFT" | "RIGHT";
      }>;
    }) => {
      const api = ensureNativeApi();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return api.github.submitReview(params as any);
    },
  });
}
