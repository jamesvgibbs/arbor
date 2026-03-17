import type { ProjectId } from "@arbortools/contracts";
import { DEFAULT_MODEL_BY_PROVIDER } from "@arbortools/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { buildThoughtBranchName } from "../components/ChatView.logic";
import { gitCreateWorktreeMutationOptions } from "../lib/gitReactQuery";
import { useHandleNewThread } from "./useHandleNewThread";
import { useStore } from "../store";
import { toastManager } from "../components/ui/toast";
import { ensureNativeApi } from "../nativeApi";
import { newCommandId, newProjectId } from "../lib/utils";

export function useStartThoughtExercise() {
  const projects = useStore((store) => store.projects);
  const queryClient = useQueryClient();
  const createWorktreeMutation = useMutation(gitCreateWorktreeMutationOptions({ queryClient }));
  const { handleNewThread } = useHandleNewThread();

  const startThoughtExercise = useCallback(
    async (projectId: ProjectId, baseBranch: string, repoSlug?: string) => {
      const project = projects.find((p) => p.id === projectId);
      if (!project) return;

      const newBranch = buildThoughtBranchName();

      try {
        const result = await createWorktreeMutation.mutateAsync({
          cwd: project.cwd,
          branch: baseBranch,
          newBranch,
        });

        // Each thought exercise gets its own project (distinct worktree path)
        const api = ensureNativeApi();
        const thoughtProjectId = newProjectId();
        const title = `Thought: ${newBranch.split("/").pop() ?? newBranch}`;
        await api.orchestration.dispatchCommand({
          type: "project.create",
          commandId: newCommandId(),
          projectId: thoughtProjectId,
          title,
          workspaceRoot: result.worktree.path,
          defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
          repoSlug: repoSlug ?? project.repoSlug ?? undefined,
          createdAt: new Date().toISOString(),
        });

        await handleNewThread(thoughtProjectId, {
          branch: result.worktree.branch,
          worktreePath: result.worktree.path,
          envMode: "worktree",
        });
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Failed to create thought exercise.",
          description: error instanceof Error ? error.message : "An error occurred.",
        });
      }
    },
    [projects, createWorktreeMutation, handleNewThread],
  );

  return {
    startThoughtExercise,
    isPending: createWorktreeMutation.isPending,
  };
}
