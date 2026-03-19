import { useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useStore } from "../store";
import { useComposerDraftStore } from "../composerDraftStore";
import { githubReposQueryOptions } from "../lib/githubReactQuery";
import { worktreeListQueryOptions } from "../lib/worktreeReactQuery";
import { isThoughtBranch } from "../components/ChatView.logic";
import { readNativeApi } from "../nativeApi";
import { newCommandId } from "../lib/utils";
import type { Project, Thread } from "../types";
import { DEFAULT_RUNTIME_MODE, DEFAULT_INTERACTION_MODE } from "../types";

export type SidebarItemKind = "thought" | "pr-review";

export interface SidebarItem {
  kind: SidebarItemKind;
  project: Project;
  thread: Thread;
  threads: Thread[];
  prNumber?: number | undefined;
  prTitle?: string | undefined;
  lastActivityAt: string;
  status: string | null;
}

export interface RepoGroup {
  repoSlug: string;
  items: SidebarItem[];
  expanded: boolean;
}

/**
 * Derives repoSlug for a project that doesn't have one set yet.
 * Matches the project's cwd or its threads' worktreePaths against
 * worktree sessions (which carry repoSlug) or tracked GitHub repos.
 */
function deriveRepoSlug(
  project: Project,
  projectThreads: Thread[],
  sessionByPath: Map<string, { repoSlug: string }>,
  trackedRepos: Array<{ owner: string; repo: string }>,
): string | null {
  // 1. Match via worktree session (PR reviews always have a worktree session)
  for (const thread of projectThreads) {
    if (thread.worktreePath) {
      const session = sessionByPath.get(thread.worktreePath);
      if (session?.repoSlug) return session.repoSlug;
    }
  }

  // 2. Match project cwd against tracked repo paths
  //    Repo paths look like owner/repo; project cwd ends with /repo or /repo-name
  const cwdParts = project.cwd.split("/");
  const cwdRepoName = cwdParts.at(-1)?.toLowerCase();
  if (cwdRepoName) {
    for (const repo of trackedRepos) {
      if (repo.repo.toLowerCase() === cwdRepoName) {
        return `${repo.owner}/${repo.repo}`;
      }
    }
  }

  return null;
}

export function useRepoSidebarModel() {
  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const collapsedRepoSlugs = useStore((store) => store.collapsedRepoSlugs);
  const draftThreadsByThreadId = useComposerDraftStore((store) => store.draftThreadsByThreadId);
  const projectDraftThreadIdByProjectId = useComposerDraftStore(
    (store) => store.projectDraftThreadIdByProjectId,
  );
  const githubReposQuery = useQuery(githubReposQueryOptions());
  const worktreeListQuery = useQuery(worktreeListQueryOptions());

  const worktreeSessions = worktreeListQuery.data?.sessions ?? [];
  const trackedRepos = githubReposQuery.data ?? [];

  const model = useMemo(() => {
    // Build worktree session lookup by worktree path
    const sessionByPath = new Map(worktreeSessions.map((s) => [s.worktreePath, s] as const));

    // Group projects by repoSlug (with auto-derivation for legacy projects)
    const groupMap = new Map<string, SidebarItem[]>();
    const uncategorizedItems: SidebarItem[] = [];
    const pendingSlugUpdates: Array<{ projectId: string; repoSlug: string }> = [];

    for (const project of projects) {
      let projectThreads = threads
        .filter((t) => t.projectId === project.id)
        .toSorted((a, b) => {
          const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
          if (byDate !== 0) return byDate;
          return b.id.localeCompare(a.id);
        });

      // Include draft threads for projects that have no real threads yet
      // (e.g. newly created thought exercises before the first message is sent)
      if (projectThreads.length === 0) {
        const draftThreadId = projectDraftThreadIdByProjectId[project.id];
        const draftState =
          draftThreadId != null ? draftThreadsByThreadId[draftThreadId] : undefined;
        if (draftThreadId != null && draftState) {
          const syntheticThread: Thread = {
            id: draftThreadId,
            codexThreadId: null,
            projectId: project.id,
            title: project.name,
            model: "",
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_INTERACTION_MODE,
            session: null,
            messages: [],
            proposedPlans: [],
            error: null,
            createdAt: draftState.createdAt,
            latestTurn: null,
            branch: draftState.branch,
            worktreePath: draftState.worktreePath,
            turnDiffSummaries: [],
            activities: [],
          };
          projectThreads = [syntheticThread];
        }
      }

      if (projectThreads.length === 0) continue;

      const latestThread = projectThreads[0]!;

      // Determine kind
      const kind: SidebarItemKind = isThoughtBranch(latestThread.branch) ? "thought" : "pr-review";

      // Look up worktree session for PR metadata
      const worktreeSession = latestThread.worktreePath
        ? sessionByPath.get(latestThread.worktreePath)
        : undefined;

      // Determine lastActivityAt: latest of thread createdAt, session lastActive, or latest turn
      const candidates = [latestThread.createdAt];
      if (worktreeSession?.lastActive) candidates.push(worktreeSession.lastActive);
      if (latestThread.latestTurn?.completedAt)
        candidates.push(latestThread.latestTurn.completedAt);
      const lastActivityAt = candidates.toSorted().at(-1) ?? latestThread.createdAt;

      // Derive status — all items should have a status pill
      let status: string | null = null;
      if (kind === "pr-review" && worktreeSession) {
        status = "active";
      } else if (latestThread.session?.status === "running") {
        status = "active";
      } else if (latestThread.latestTurn) {
        status = "has-changes";
      } else {
        status = "draft";
      }

      const item: SidebarItem = {
        kind,
        project,
        thread: latestThread,
        threads: projectThreads,
        prNumber: worktreeSession?.prNumber,
        prTitle: worktreeSession?.prTitle,
        lastActivityAt,
        status,
      };

      // Resolve slug: use persisted value or derive from worktree/repo data
      let slug = project.repoSlug;
      if (!slug) {
        slug = deriveRepoSlug(project, projectThreads, sessionByPath, trackedRepos);
        if (slug) {
          pendingSlugUpdates.push({ projectId: project.id, repoSlug: slug });
        }
      }

      if (slug) {
        const existing = groupMap.get(slug);
        if (existing) {
          existing.push(item);
        } else {
          groupMap.set(slug, [item]);
        }
      } else {
        uncategorizedItems.push(item);
      }
    }

    // Build RepoGroup array
    const repoGroups: RepoGroup[] = [];
    for (const [repoSlug, items] of groupMap) {
      items.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
      repoGroups.push({
        repoSlug,
        items,
        expanded: !collapsedRepoSlugs.has(repoSlug),
      });
    }

    // Sort repo groups by most recent item activity
    repoGroups.sort((a, b) => {
      const aLatest = a.items[0]?.lastActivityAt ?? "";
      const bLatest = b.items[0]?.lastActivityAt ?? "";
      return bLatest.localeCompare(aLatest);
    });

    // Sort uncategorized by activity
    uncategorizedItems.sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

    return {
      repoGroups,
      uncategorizedItems,
      trackedRepos,
      hasAnyRepos: trackedRepos.length > 0 || repoGroups.length > 0,
      pendingSlugUpdates,
    };
  }, [
    projects,
    threads,
    worktreeSessions,
    trackedRepos,
    collapsedRepoSlugs,
    draftThreadsByThreadId,
    projectDraftThreadIdByProjectId,
  ]);

  // Persist derived repoSlugs back to the server (one-time migration per project)
  const migratedRef = useRef(new Set<string>());
  useEffect(() => {
    const api = readNativeApi();
    if (!api || model.pendingSlugUpdates.length === 0) return;

    for (const { projectId, repoSlug } of model.pendingSlugUpdates) {
      if (migratedRef.current.has(projectId)) continue;
      migratedRef.current.add(projectId);
      void api.orchestration.dispatchCommand({
        type: "project.meta.update",
        commandId: newCommandId(),
        projectId: projectId as any,
        repoSlug,
      });
    }
  }, [model.pendingSlugUpdates]);

  return model;
}
