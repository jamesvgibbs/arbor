import type {
  DiffGetChangedFilesInput,
  DiffGetChangedFilesResult,
  DiffGetLocalDiffInput,
  DiffGetLocalDiffResult,
} from "@arbortools/contracts";
import { queryOptions } from "@tanstack/react-query";
import { ensureNativeApi } from "../nativeApi";

export const diffQueryKeys = {
  all: ["diff"] as const,
  changedFiles: (owner: string, repo: string, prNumber: number) =>
    ["diff", "changedFiles", owner, repo, prNumber] as const,
  localDiff: (worktreePath: string, baseBranch: string, filename?: string) =>
    ["diff", "localDiff", worktreePath, baseBranch, filename ?? "__all__"] as const,
};

export function diffChangedFilesQueryOptions(
  input: DiffGetChangedFilesInput | null,
) {
  return queryOptions({
    queryKey: diffQueryKeys.changedFiles(
      input?.owner ?? "",
      input?.repo ?? "",
      input?.prNumber ?? 0,
    ),
    queryFn: async (): Promise<DiffGetChangedFilesResult> => {
      if (!input) throw new Error("Missing input");
      const api = ensureNativeApi();
      return api.diff.getChangedFiles(input);
    },
    enabled: input !== null,
    staleTime: 60_000,
  });
}

export function diffLocalDiffQueryOptions(
  input: DiffGetLocalDiffInput | null,
) {
  return queryOptions({
    queryKey: diffQueryKeys.localDiff(
      input?.worktreePath ?? "",
      input?.baseBranch ?? "",
      input?.filename,
    ),
    queryFn: async (): Promise<DiffGetLocalDiffResult> => {
      if (!input) throw new Error("Missing input");
      const api = ensureNativeApi();
      return api.diff.getLocalDiff(input);
    },
    enabled: input !== null,
    staleTime: 30_000,
  });
}
