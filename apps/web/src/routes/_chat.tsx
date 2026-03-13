import { type ResolvedKeybindingsConfig } from "@arbortools/contracts";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Outlet, createFileRoute, useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import { DiffWorkerPoolProvider } from "../components/DiffWorkerPoolProvider";
import { HealthCheckStrip } from "../components/HealthCheckStrip";
import ThreadSidebar from "../components/Sidebar";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import { isTerminalFocused } from "../lib/terminalFocus";
import { serverConfigQueryOptions } from "../lib/serverReactQuery";
import { githubReposQueryOptions } from "../lib/githubReactQuery";
import {
  worktreeListQueryOptions,
  worktreeCheckLifecycleMutationOptions,
  worktreeRemoveMutationOptions,
  arborSettingsQueryOptions,
} from "../lib/worktreeReactQuery";
import { resolveShortcutCommand } from "../keybindings";
import { selectThreadTerminalState, useTerminalStateStore } from "../terminalStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { Sidebar, SidebarProvider } from "~/components/ui/sidebar";

const EMPTY_KEYBINDINGS: ResolvedKeybindingsConfig = [];

function ChatRouteGlobalShortcuts() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadIdsSize = useThreadSelectionStore((state) => state.selectedThreadIds.size);
  const { activeDraftThread, activeThread, handleNewThread, projects, routeThreadId } =
    useHandleNewThread();
  const serverConfigQuery = useQuery(serverConfigQueryOptions());
  const keybindings = serverConfigQuery.data?.keybindings ?? EMPTY_KEYBINDINGS;
  const terminalOpen = useTerminalStateStore((state) =>
    routeThreadId
      ? selectThreadTerminalState(state.terminalStateByThreadId, routeThreadId).terminalOpen
      : false,
  );

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;

      if (event.key === "Escape" && selectedThreadIdsSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      const projectId = activeThread?.projectId ?? activeDraftThread?.projectId ?? projects[0]?.id;
      if (!projectId) return;

      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void handleNewThread(projectId);
        return;
      }

      if (command !== "chat.new") return;
      event.preventDefault();
      event.stopPropagation();
      void handleNewThread(projectId, {
        branch: activeThread?.branch ?? activeDraftThread?.branch ?? null,
        worktreePath: activeThread?.worktreePath ?? activeDraftThread?.worktreePath ?? null,
        envMode: activeDraftThread?.envMode ?? (activeThread?.worktreePath ? "worktree" : "local"),
      });
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    clearSelection,
    handleNewThread,
    keybindings,
    projects,
    selectedThreadIdsSize,
    terminalOpen,
  ]);

  return null;
}

/**
 * Lifecycle cleanup toast shown when a PR is approved.
 */
function ApprovalToast({
  prNumber,
  repoSlug,
  sessionId,
  onAccept,
  onLater,
}: {
  prNumber: number;
  repoSlug: string;
  sessionId: string;
  onAccept: (sessionId: string) => void;
  onLater: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-lg">
      <p className="text-xs text-foreground">
        PR #{prNumber} ({repoSlug}) was approved — clean up worktree?
      </p>
      <button
        type="button"
        onClick={() => onAccept(sessionId)}
        className="rounded bg-primary px-2 py-1 text-[10px] font-medium text-primary-foreground hover:bg-primary/90"
      >
        Accept
      </button>
      <button
        type="button"
        onClick={onLater}
        className="rounded border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground hover:bg-accent"
      >
        Later
      </button>
    </div>
  );
}

/**
 * Hooks into the PR refresh cycle to perform lifecycle cleanup.
 * On every refresh, checks PR statuses for active worktrees and auto-cleans
 * merged/closed PRs, offers cleanup for approved PRs.
 */
function LifecycleCleanupWiring() {
  const queryClient = useQueryClient();
  const reposQuery = useQuery(githubReposQueryOptions());
  const worktreeListQuery = useQuery(worktreeListQueryOptions());
  const arborSettingsQuery = useQuery(arborSettingsQueryOptions());
  const checkLifecycleMutation = useMutation(worktreeCheckLifecycleMutationOptions({ queryClient }));
  const removeMutation = useMutation(worktreeRemoveMutationOptions({ queryClient }));

  const [approvalToasts, setApprovalToasts] = useState<
    Array<{ sessionId: string; prNumber: number; repoSlug: string }>
  >([]);
  // Track which PRs we've already shown the approval toast for
  const shownApprovalRef = useRef<Set<string>>(new Set());
  // Track which PRs were auto-removed to show brief notices
  const [autoRemovedNotices, setAutoRemovedNotices] = useState<
    Array<{ prNumber: number; repoSlug: string; id: string }>
  >([]);

  const repos = reposQuery.data ?? [];
  const sessions = worktreeListQuery.data?.sessions ?? [];
  const refreshIntervalMs = arborSettingsQuery.data?.refreshIntervalMs ?? 5 * 60 * 1000;

  // Run lifecycle check on an interval matching the refresh setting
  useEffect(() => {
    if (sessions.length === 0 || repos.length === 0) return;

    const runCheck = async () => {
      // Fetch fresh PR data for repos that have active worktrees
      const activeRepos = new Set(sessions.map((s) => s.repoSlug.toLowerCase()));
      const prStatuses: Array<{
        repoSlug: string;
        prNumber: number;
        state: "open" | "merged" | "closed";
        reviewStatus: "approved" | "changes_requested" | "review_required" | "unknown";
      }> = [];

      for (const repo of repos) {
        const slug = `${repo.owner}/${repo.repo}`;
        if (!activeRepos.has(slug.toLowerCase())) continue;

        try {
          const api = (await import("../nativeApi")).ensureNativeApi();
          const result = await api.github.listPRs({ owner: repo.owner, repo: repo.repo });
          const activeSessions = sessions.filter(
            (s) => s.repoSlug.toLowerCase() === slug.toLowerCase(),
          );

          for (const session of activeSessions) {
            const pr = result.prs.find((p) => p.number === session.prNumber);
            if (pr) {
              // PR is still open — check review status
              prStatuses.push({
                repoSlug: slug,
                prNumber: session.prNumber,
                state: "open",
                reviewStatus: pr.reviewStatus,
              });
            } else {
              // PR not in open list — it was merged or closed
              prStatuses.push({
                repoSlug: slug,
                prNumber: session.prNumber,
                state: "closed",
                reviewStatus: "unknown",
              });
            }
          }
        } catch {
          // Skip repos where API call fails
        }
      }

      if (prStatuses.length === 0) return;

      try {
        const result = await checkLifecycleMutation.mutateAsync({ prStatuses });

        for (const action of result.actions) {
          if (action.action === "auto_removed") {
            const noticeId = `${action.repoSlug}#${action.prNumber}`;
            setAutoRemovedNotices((prev) => [
              ...prev,
              { prNumber: action.prNumber, repoSlug: action.repoSlug, id: noticeId },
            ]);
            // Auto-dismiss after 5 seconds
            setTimeout(() => {
              setAutoRemovedNotices((prev) => prev.filter((n) => n.id !== noticeId));
            }, 5000);
          } else if (action.action === "approved") {
            const key = `${action.repoSlug}#${action.prNumber}`;
            if (!shownApprovalRef.current.has(key)) {
              shownApprovalRef.current.add(key);
              setApprovalToasts((prev) => [
                ...prev,
                {
                  sessionId: action.sessionId,
                  prNumber: action.prNumber,
                  repoSlug: action.repoSlug,
                },
              ]);
            }
          }
        }
      } catch {
        // Best-effort lifecycle check
      }
    };

    // Run once immediately
    void runCheck();

    const timer = setInterval(() => void runCheck(), refreshIntervalMs);
    return () => clearInterval(timer);
  }, [sessions.length, repos.length, refreshIntervalMs]);

  const handleAcceptCleanup = useCallback(
    (sessionId: string) => {
      removeMutation.mutate({ sessionId });
      setApprovalToasts((prev) => prev.filter((t) => t.sessionId !== sessionId));
    },
    [removeMutation],
  );

  const handleLater = useCallback((sessionId: string) => {
    setApprovalToasts((prev) => prev.filter((t) => t.sessionId !== sessionId));
  }, []);

  if (approvalToasts.length === 0 && autoRemovedNotices.length === 0) return null;

  return (
    <div className="fixed bottom-8 right-4 z-50 flex flex-col gap-2">
      {autoRemovedNotices.map((notice) => (
        <div
          key={notice.id}
          className="rounded-lg border border-border bg-card px-4 py-2 text-xs text-muted-foreground shadow-lg"
        >
          Cleaned up worktree for merged PR #{notice.prNumber}
        </div>
      ))}
      {approvalToasts.map((toast) => (
        <ApprovalToast
          key={toast.sessionId}
          prNumber={toast.prNumber}
          repoSlug={toast.repoSlug}
          sessionId={toast.sessionId}
          onAccept={handleAcceptCleanup}
          onLater={() => handleLater(toast.sessionId)}
        />
      ))}
    </div>
  );
}

function ChatRouteLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const isReviewRoute = location.pathname.startsWith("/review/");

  useEffect(() => {
    const onMenuAction = window.desktopBridge?.onMenuAction;
    if (typeof onMenuAction !== "function") {
      return;
    }

    const unsubscribe = onMenuAction((action) => {
      if (action !== "open-settings") return;
      void navigate({ to: "/settings" });
    });

    return () => {
      unsubscribe?.();
    };
  }, [navigate]);

  return (
    <SidebarProvider defaultOpen>
      <ChatRouteGlobalShortcuts />
      {!isReviewRoute && <LifecycleCleanupWiring />}
      <Sidebar
        side="left"
        collapsible="offcanvas"
        className="border-r border-border bg-card text-foreground"
      >
        <ThreadSidebar />
      </Sidebar>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <DiffWorkerPoolProvider>
          <Outlet />
        </DiffWorkerPoolProvider>
        <HealthCheckStrip />
      </div>
    </SidebarProvider>
  );
}

export const Route = createFileRoute("/_chat")({
  component: ChatRouteLayout,
});
