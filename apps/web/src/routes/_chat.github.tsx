import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type GitHubRepoConfig,
  type GitHubPRCard,
  type IDEKind,
  type WorktreeSessionWithSize,
} from "@arbortools/contracts";
import {
  GitPullRequestIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  ClockIcon,
  UserIcon,
  AlertCircleIcon,
  LoaderIcon,
  XIcon,
  MoreVerticalIcon,
  MonitorIcon,
} from "lucide-react";

import {
  githubAuthStatusQueryOptions,
  githubReposQueryOptions,
  githubPRsQueryOptions,
  githubRefreshPRsMutationOptions,
} from "~/lib/githubReactQuery";
import {
  worktreeCreateMutationOptions,
  worktreeListQueryOptions,
  worktreeCheckLifecycleMutationOptions,
  worktreeRemoveMutationOptions,
  ideSettingsQueryOptions,
  ideUpdateSettingsMutationOptions,
  ideOpenInIDEMutationOptions,
} from "~/lib/worktreeReactQuery";
import { reviewContextInitMutationOptions } from "~/lib/reviewContextReactQuery";
import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { useAppSettings } from "~/appSettings";
import { ensureNativeApi } from "../nativeApi";
import { newCommandId, newProjectId } from "../lib/utils";
import { isElectron } from "../env";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { SidebarInset } from "~/components/ui/sidebar";
import { toastManager } from "~/components/ui/toast";

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function repoKey(r: GitHubRepoConfig): string {
  return `${r.owner}/${r.repo}`;
}

const CI_STATUS_COLORS: Record<GitHubPRCard["ciStatus"], string> = {
  success: "bg-green-500",
  failure: "bg-red-500",
  pending: "bg-yellow-500",
  unknown: "bg-gray-400",
};

const CI_STATUS_LABELS: Record<GitHubPRCard["ciStatus"], string> = {
  success: "Passing",
  failure: "Failing",
  pending: "Pending",
  unknown: "Unknown",
};

const REVIEW_STATUS_VARIANT: Record<
  GitHubPRCard["reviewStatus"],
  "success" | "error" | "warning" | "outline"
> = {
  approved: "success",
  changes_requested: "error",
  review_required: "warning",
  unknown: "outline",
};

const REVIEW_STATUS_LABELS: Record<GitHubPRCard["reviewStatus"], string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  review_required: "Review required",
  unknown: "No reviews",
};

type ReviewStep = "fetch" | "worktree" | "context" | "session";

const STEP_LABELS: Record<ReviewStep, string> = {
  fetch: "Fetching branch\u2026",
  worktree: "Creating worktree\u2026",
  context: "Initializing Claude context\u2026",
  session: "Starting Claude Code\u2026",
};

interface ReviewProgress {
  prNumber: number;
  step: ReviewStep;
  contextSubLabel: string | null;
  abortController: AbortController | null;
}

const IDE_LABELS: Record<IDEKind, string> = {
  cursor: "Cursor",
  windsurf: "Windsurf",
  vscode: "VS Code",
};

function IDESelectionModal({
  detectedIDEs,
  onSelect,
  onDismiss,
}: {
  detectedIDEs: IDEKind[];
  onSelect: (ide: IDEKind) => void;
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-lg">
        <h2 className="text-lg font-semibold text-foreground">Choose your preferred IDE</h2>
        <p className="mt-1 text-sm text-muted-foreground">Select the IDE for opening worktrees.</p>

        <div className="mt-4 space-y-2">
          {detectedIDEs.map((ide) => (
            <button
              key={ide}
              type="button"
              className="flex w-full items-center gap-3 rounded-lg border border-border bg-background px-4 py-3 text-left transition-colors hover:bg-accent"
              onClick={() => onSelect(ide)}
            >
              <MonitorIcon className="size-5 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground">{IDE_LABELS[ide]}</span>
            </button>
          ))}
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          You can change this any time in Settings.
        </p>
        <button
          type="button"
          className="mt-3 text-xs text-muted-foreground hover:text-foreground"
          onClick={onDismiss}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}

function GitHubRouteView() {
  const queryClient = useQueryClient();
  const authQuery = useQuery(githubAuthStatusQueryOptions());
  const reposQuery = useQuery(githubReposQueryOptions());
  const [selectedRepoKey, setSelectedRepoKey] = useState<string>("");
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const contextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { settings } = useAppSettings();

  // IDE settings
  const ideQuery = useQuery(ideSettingsQueryOptions());
  const ideUpdateMutation = useMutation(ideUpdateSettingsMutationOptions({ queryClient }));
  const openInIDEMutation = useMutation(ideOpenInIDEMutationOptions());
  const [showIDEModal, setShowIDEModal] = useState(false);
  const [ideModalDismissed, setIdeModalDismissed] = useState(false);
  const [autoSetNotice, setAutoSetNotice] = useState<string | null>(null);

  const preferredIDE = ideQuery.data?.preferredIDE ?? null;
  const detectedIDEs = ideQuery.data?.detectedIDEs;
  const detectedIDEList: IDEKind[] = detectedIDEs
    ? (Object.entries(detectedIDEs) as [IDEKind, boolean][]).filter(([, v]) => v).map(([k]) => k)
    : [];

  // First-launch IDE selection
  useEffect(() => {
    if (!ideQuery.isSuccess || ideModalDismissed) return;
    if (preferredIDE !== null) return;
    if (detectedIDEList.length === 0) return;

    if (detectedIDEList.length === 1) {
      // Auto-set the only detected IDE
      const ide = detectedIDEList[0]!;
      ideUpdateMutation.mutate({ preferredIDE: ide });
      setAutoSetNotice(`${IDE_LABELS[ide]} detected and set as your default IDE`);
      setTimeout(() => setAutoSetNotice(null), 5000);
    } else {
      setShowIDEModal(true);
    }
  }, [ideQuery.isSuccess, preferredIDE, detectedIDEList.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIDESelect = useCallback(
    (ide: IDEKind) => {
      ideUpdateMutation.mutate({ preferredIDE: ide });
      setShowIDEModal(false);
      toastManager.add({
        title: `${IDE_LABELS[ide]} set as your default IDE`,
      });
    },
    [ideUpdateMutation],
  );

  const worktreeCreateMutation = useMutation(worktreeCreateMutationOptions({ queryClient }));
  const reviewContextInitMutation = useMutation(reviewContextInitMutationOptions());
  const lifecycleMutation = useMutation(worktreeCheckLifecycleMutationOptions({ queryClient }));
  const removeMutation = useMutation(worktreeRemoveMutationOptions({ queryClient }));
  const { handleNewThread, projects } = useHandleNewThread();

  const handleOpenInIDE = useCallback(
    (worktreePath: string, ide: IDEKind) => {
      openInIDEMutation.mutate({ worktreePath, ide });
    },
    [openInIDEMutation],
  );

  const handleSessionContextMenu = useCallback(
    async (e: React.MouseEvent, session: WorktreeSessionWithSize) => {
      e.preventDefault();
      const api = ensureNativeApi();

      type MenuAction = `open-${IDEKind}` | "copy-path" | "remove";
      const items: Array<{ id: MenuAction; label: string; destructive?: boolean }> = [];

      for (const ide of detectedIDEList) {
        items.push({ id: `open-${ide}` as MenuAction, label: `Open in ${IDE_LABELS[ide]}` });
      }
      items.push({ id: "copy-path", label: "Copy Worktree Path" });
      items.push({ id: "remove", label: "Remove Worktree", destructive: true });

      const result = await api.contextMenu.show(items, { x: e.clientX, y: e.clientY });
      if (!result) return;

      if (result === "copy-path") {
        await navigator.clipboard.writeText(session.worktreePath);
        toastManager.add({ title: "Worktree path copied" });
      } else if (result === "remove") {
        removeMutation.mutate(
          { sessionId: session.id },
          {
            onSuccess: () => {
              toastManager.add({ title: `Worktree removed for PR #${session.prNumber}` });
            },
          },
        );
      } else if (result.startsWith("open-")) {
        const ide = result.replace("open-", "") as IDEKind;
        handleOpenInIDE(session.worktreePath, ide);
      }
    },
    [detectedIDEList, removeMutation, handleOpenInIDE],
  );

  const repos = reposQuery.data ?? [];
  const activeKey = selectedRepoKey || (repos[0] ? repoKey(repos[0]) : "");
  const activeOwner = activeKey.split("/")[0] ?? null;
  const activeRepo = activeKey.split("/")[1] ?? null;

  const prsQuery = useQuery(
    githubPRsQueryOptions(
      authQuery.data?.authenticated ? activeOwner : null,
      authQuery.data?.authenticated ? activeRepo : null,
    ),
  );

  const sessionsQuery = useQuery(worktreeListQueryOptions());

  const refreshMutation = useMutation(githubRefreshPRsMutationOptions({ queryClient }));

  const isAuthenticated = authQuery.data?.authenticated === true;
  const prs = prsQuery.data?.prs ?? [];

  // PR lifecycle cleanup — runs after each PR list refresh
  const checkLifecycle = useCallback(async () => {
    const sessions = sessionsQuery.data?.sessions;
    if (!sessions || sessions.length === 0) return;
    if (!prsQuery.data) return;

    const prStatuses: Array<{
      repoSlug: string;
      prNumber: number;
      state: "open" | "merged" | "closed";
      reviewStatus: "approved" | "changes_requested" | "review_required" | "unknown";
    }> = [];

    for (const session of sessions) {
      if (`${activeOwner}/${activeRepo}` !== session.repoSlug) continue;

      const matchingPR = prs.find((pr) => pr.number === session.prNumber);

      if (matchingPR) {
        prStatuses.push({
          repoSlug: session.repoSlug,
          prNumber: session.prNumber,
          state: "open",
          reviewStatus: matchingPR.reviewStatus,
        });
      } else {
        // PR not in open list — merged or closed
        prStatuses.push({
          repoSlug: session.repoSlug,
          prNumber: session.prNumber,
          state: "merged",
          reviewStatus: "unknown",
        });
      }
    }

    if (prStatuses.length === 0) return;

    try {
      const result = await lifecycleMutation.mutateAsync({ prStatuses });

      // Lifecycle actions (auto_removed, approved) are handled silently —
      // no toast notifications for cleanup prompts.
    } catch {
      // Non-blocking lifecycle check
    }
  }, [
    sessionsQuery.data,
    prsQuery.data,
    prs,
    activeOwner,
    activeRepo,
    lifecycleMutation,
    removeMutation,
  ]);

  // Run lifecycle check when PRs data updates
  const lastPRsFetchedAt = prsQuery.data?.fetchedAt;
  useEffect(() => {
    if (lastPRsFetchedAt) {
      checkLifecycle();
    }
  }, [lastPRsFetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearContextTimer = () => {
    if (contextTimerRef.current) {
      clearTimeout(contextTimerRef.current);
      contextTimerRef.current = null;
    }
  };

  const startReview = async (pr: GitHubPRCard) => {
    if (!activeOwner || !activeRepo) return;

    const ac = new AbortController();
    setProgress({ prNumber: pr.number, step: "fetch", contextSubLabel: null, abortController: ac });

    try {
      // Step 1: Create worktree (includes fetch)
      setProgress((prev) => (prev ? { ...prev, step: "worktree" } : prev));

      const result = await worktreeCreateMutation.mutateAsync({
        owner: activeOwner,
        repo: activeRepo,
        prNumber: pr.number,
        prTitle: pr.title,
        branchName: pr.headBranch,
        baseBranch: pr.baseBranch,
        repoUrl: `https://github.com/${activeOwner}/${activeRepo}.git`,
      });

      const worktreePath = result.session.worktreePath;

      if (result.alreadyExisted) {
        toastManager.add({
          type: "info",
          title: `Resuming existing session for PR #${pr.number}`,
        });
      } else {
        // Step 2: Initialize review context
        setProgress((prev) => (prev ? { ...prev, step: "context" } : prev));

        contextTimerRef.current = setTimeout(() => {
          setProgress((prev) =>
            prev?.step === "context"
              ? { ...prev, contextSubLabel: "This may take a moment for large repos\u2026" }
              : prev,
          );
        }, 10_000);

        try {
          // Fetch PR details for diff stat
          let diffStat = "";
          try {
            const api = ensureNativeApi();
            const details = await api.github.getPRDetails({
              owner: activeOwner,
              repo: activeRepo,
              number: pr.number,
            });
            diffStat = details.diffStat ?? "";
          } catch {
            // Non-blocking — proceed without diff stat
          }

          const skipInit = !settings.autoInitReviewContext || ac.signal.aborted;

          const ctxResult = await reviewContextInitMutation.mutateAsync({
            worktreePath,
            prNumber: pr.number,
            prTitle: pr.title,
            prAuthor: pr.author,
            headBranch: pr.headBranch,
            baseBranch: pr.baseBranch,
            diffStat,
            skipInit,
          });

          clearContextTimer();

          if (ctxResult.existedAlready) {
            toastManager.add({
              title: "Using existing CLAUDE.md found in repo",
            });
          } else {
            toastManager.add({
              title: ctxResult.ranInit
                ? "Review context initialized \u2014 CLAUDE.md ready"
                : "PR review context written to CLAUDE.md",
            });
          }
        } catch {
          clearContextTimer();
          toastManager.add({
            title: "Failed to initialize review context",
          });
        }
      }

      // Step 3: Start session
      setProgress((prev) => (prev ? { ...prev, step: "session", contextSubLabel: null } : prev));

      const existingProject = projects.find((p) => p.cwd === worktreePath);
      let projectId = existingProject?.id;

      if (!projectId) {
        const api = ensureNativeApi();
        projectId = newProjectId();
        const title = `PR #${pr.number}: ${pr.title}`;
        await api.orchestration.dispatchCommand({
          type: "project.create",
          commandId: newCommandId(),
          projectId,
          title,
          workspaceRoot: worktreePath,
          defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
          repoSlug: `${activeOwner}/${activeRepo}`,
          createdAt: new Date().toISOString(),
        });
      }

      await handleNewThread(projectId, {
        branch: result.session.branchName,
        worktreePath,
      });
    } finally {
      clearContextTimer();
      setProgress(null);
    }
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      {/* First-launch IDE selection modal */}
      {showIDEModal && detectedIDEList.length > 1 && (
        <IDESelectionModal
          detectedIDEs={detectedIDEList}
          onSelect={handleIDESelect}
          onDismiss={() => {
            setShowIDEModal(false);
            setIdeModalDismissed(true);
          }}
        />
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              GitHub PRs
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            {/* Auto-set IDE notice */}
            {autoSetNotice && (
              <div className="flex items-center justify-between rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-2.5">
                <span className="text-sm text-green-700 dark:text-green-400">{autoSetNotice}</span>
                <button
                  type="button"
                  className="ml-3 text-green-700/60 hover:text-green-700 dark:text-green-400/60 dark:hover:text-green-400"
                  onClick={() => setAutoSetNotice(null)}
                >
                  <XIcon className="size-4" />
                </button>
              </div>
            )}

            <header className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Pull Requests
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and manage open pull requests from your GitHub repositories.
              </p>
              {/* IDE status strip */}
              {ideQuery.isSuccess && (
                <div className="flex items-center gap-2 pt-1">
                  <span
                    className={`inline-block size-2 rounded-full ${
                      preferredIDE && detectedIDEs?.[preferredIDE]
                        ? "bg-green-500"
                        : preferredIDE && !detectedIDEs?.[preferredIDE]
                          ? "bg-red-500"
                          : "bg-yellow-500"
                    }`}
                  />
                  <span className="text-xs text-muted-foreground">
                    {preferredIDE && detectedIDEs?.[preferredIDE]
                      ? `${IDE_LABELS[preferredIDE]} ready`
                      : preferredIDE && !detectedIDEs?.[preferredIDE]
                        ? `${IDE_LABELS[preferredIDE]} not found in PATH`
                        : "No preferred IDE set"}
                  </span>
                </div>
              )}
            </header>

            {/* Not authenticated state */}
            {authQuery.isSuccess && !isAuthenticated && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <GitPullRequestIcon className="size-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-sm font-medium text-foreground">
                      Connect your GitHub account
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Authenticate with GitHub to view pull requests.
                    </p>
                  </div>
                  <Link to="/settings">
                    <Button variant="default" size="sm">
                      Go to Settings
                    </Button>
                  </Link>
                </div>
              </section>
            )}

            {/* Authenticated but no repos */}
            {isAuthenticated && reposQuery.isSuccess && repos.length === 0 && (
              <section className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <GitPullRequestIcon className="size-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-sm font-medium text-foreground">
                      No repositories configured
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Add a repository in Settings to start reviewing pull requests.
                    </p>
                  </div>
                  <Link to="/settings">
                    <Button variant="outline" size="sm">
                      Add a repository
                    </Button>
                  </Link>
                </div>
              </section>
            )}

            {/* Authenticated with repos */}
            {isAuthenticated && repos.length > 0 && (
              <>
                {/* Repo selector + refresh controls */}
                <section className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <label
                        htmlFor="repo-selector"
                        className="text-sm font-medium text-foreground"
                      >
                        Repository
                      </label>
                      <select
                        id="repo-selector"
                        value={activeKey}
                        onChange={(e) => setSelectedRepoKey(e.target.value)}
                        className="h-8 rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-xs/5 outline-none focus:border-ring focus:ring-2 focus:ring-ring/24"
                      >
                        {repos.map((r) => {
                          const key = repoKey(r);
                          return (
                            <option key={key} value={key}>
                              {key}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="flex items-center gap-3">
                      {prsQuery.dataUpdatedAt > 0 && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ClockIcon className="size-3" />
                          Updated {relativeTime(new Date(prsQuery.dataUpdatedAt).toISOString())}
                        </span>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (activeOwner && activeRepo) {
                            refreshMutation.mutate({ owner: activeOwner, repo: activeRepo });
                          }
                        }}
                        disabled={refreshMutation.isPending || !activeOwner}
                      >
                        <RefreshCwIcon
                          className={`size-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`}
                        />
                        Refresh
                      </Button>
                    </div>
                  </div>
                </section>

                {/* Loading state */}
                {prsQuery.isLoading && (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCwIcon className="size-5 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Error state */}
                {prsQuery.isError && (
                  <section className="rounded-2xl border border-destructive/30 bg-card p-5">
                    <div className="flex items-center gap-3">
                      <AlertCircleIcon className="size-5 text-destructive" />
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Failed to load pull requests
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {prsQuery.error instanceof Error
                            ? prsQuery.error.message
                            : "An unknown error occurred."}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {/* Empty PR list */}
                {prsQuery.isSuccess && prs.length === 0 && (
                  <section className="rounded-2xl border border-dashed border-border bg-card p-5">
                    <div className="flex flex-col items-center gap-2 py-8 text-center">
                      <CheckCircleIcon className="size-8 text-muted-foreground/40" />
                      <p className="text-sm text-muted-foreground">
                        No open pull requests for{" "}
                        <span className="font-medium text-foreground">{activeKey}</span>.
                      </p>
                    </div>
                  </section>
                )}

                {/* Active sessions */}
                {sessionsQuery.isSuccess && sessionsQuery.data.sessions.length > 0 && (
                  <section className="rounded-2xl border border-border bg-card p-5">
                    <div className="mb-4">
                      <h2 className="text-sm font-medium text-foreground">Active Sessions</h2>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Worktrees currently checked out on disk.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {sessionsQuery.data.sessions
                        .filter((s) => `${activeOwner}/${activeRepo}` === s.repoSlug)
                        .map((session) => (
                          <div
                            key={session.id}
                            className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                            onContextMenu={(e) => handleSessionContextMenu(e, session)}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">
                                PR #{session.prNumber}: {session.prTitle}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {session.branchName} &middot; {session.diskSizeMB} MB
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {preferredIDE && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() =>
                                    handleOpenInIDE(session.worktreePath, preferredIDE)
                                  }
                                >
                                  Open in {IDE_LABELS[preferredIDE]}
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="xs"
                                onClick={(e) => handleSessionContextMenu(e, session)}
                                aria-label="Session actions"
                              >
                                <MoreVerticalIcon className="size-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </div>
                  </section>
                )}

                {/* PR list */}
                {prsQuery.isSuccess && prs.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {prs.map((pr) => {
                      const isActive = progress?.prNumber === pr.number;
                      const existingSession = sessionsQuery.data?.sessions.find(
                        (s) =>
                          s.prNumber === pr.number && s.repoSlug === `${activeOwner}/${activeRepo}`,
                      );
                      return (
                        <section
                          key={pr.number}
                          className="rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-card/80"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" size="sm">
                                  #{pr.number}
                                </Badge>
                                <h3 className="min-w-0 truncate text-sm font-medium text-foreground">
                                  {pr.title}
                                </h3>
                                {pr.isDraft && (
                                  <Badge variant="secondary" size="sm">
                                    Draft
                                  </Badge>
                                )}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  {pr.authorAvatarUrl ? (
                                    <img
                                      src={pr.authorAvatarUrl}
                                      alt={pr.author}
                                      className="size-4 rounded-full"
                                    />
                                  ) : (
                                    <UserIcon className="size-3.5" />
                                  )}
                                  {pr.author}
                                </span>

                                <span className="flex items-center gap-1">
                                  <ClockIcon className="size-3" />
                                  {relativeTime(pr.createdAt)}
                                </span>

                                <span className="flex items-center gap-1.5">
                                  <span
                                    className={`inline-block size-2 rounded-full ${CI_STATUS_COLORS[pr.ciStatus]}`}
                                  />
                                  {CI_STATUS_LABELS[pr.ciStatus]}
                                </span>

                                <Badge variant={REVIEW_STATUS_VARIANT[pr.reviewStatus]} size="sm">
                                  {REVIEW_STATUS_LABELS[pr.reviewStatus]}
                                </Badge>

                                <span className="text-muted-foreground/60">
                                  {pr.headBranch} &rarr; {pr.baseBranch}
                                </span>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <div className="flex items-center gap-1.5">
                                {existingSession && preferredIDE && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      handleOpenInIDE(existingSession.worktreePath, preferredIDE)
                                    }
                                  >
                                    Open in {IDE_LABELS[preferredIDE]}
                                  </Button>
                                )}
                                <Button
                                  variant="default"
                                  size="sm"
                                  disabled={isActive}
                                  onClick={() => startReview(pr)}
                                >
                                  {isActive ? (
                                    <>
                                      <LoaderIcon className="size-3.5 animate-spin" />
                                      {STEP_LABELS[progress.step]}
                                    </>
                                  ) : existingSession ? (
                                    "Resume Review"
                                  ) : (
                                    "Start Review"
                                  )}
                                </Button>
                              </div>

                              {/* Sub-label and skip link during context init */}
                              {isActive && progress.step === "context" && (
                                <div className="flex items-center gap-2">
                                  {progress.contextSubLabel && (
                                    <span className="text-[11px] text-muted-foreground">
                                      {progress.contextSubLabel}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                                    onClick={() => progress.abortController?.abort()}
                                  >
                                    <XIcon className="size-3" />
                                    Skip context init
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* Loading auth state */}
            {authQuery.isLoading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCwIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/github")({
  component: GitHubRouteView,
});
