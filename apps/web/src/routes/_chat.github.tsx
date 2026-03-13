import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type GitHubRepoConfig,
  type GitHubPRCard,
} from "@arbortools/contracts";
import {
  GitPullRequestIcon,
  CheckCircleIcon,
  RefreshCwIcon,
  ClockIcon,
  UserIcon,
  AlertCircleIcon,
  LoaderIcon,
} from "lucide-react";

import {
  githubAuthStatusQueryOptions,
  githubReposQueryOptions,
  githubPRsQueryOptions,
  githubRefreshPRsMutationOptions,
} from "~/lib/githubReactQuery";
import {
  worktreeCreateMutationOptions,
} from "~/lib/worktreeReactQuery";
import {
  reviewContextInitMutationOptions,
} from "~/lib/reviewContextReactQuery";
import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { useAppSettings } from "../appSettings";
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

type ReviewProgressStep = "worktree" | "context" | "project";

interface ReviewProgress {
  prNumber: number;
  step: ReviewProgressStep;
  contextSubLabel: string | null;
  abortController: AbortController | null;
}

function GitHubRouteView() {
  const queryClient = useQueryClient();
  const authQuery = useQuery(githubAuthStatusQueryOptions());
  const reposQuery = useQuery(githubReposQueryOptions());
  const [selectedRepoKey, setSelectedRepoKey] = useState<string>("");
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const contextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { settings } = useAppSettings();
  const worktreeCreateMutation = useMutation(
    worktreeCreateMutationOptions({ queryClient }),
  );
  const reviewContextInitMutation = useMutation(
    reviewContextInitMutationOptions(),
  );
  const { handleNewThread, projects } = useHandleNewThread();

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

  const refreshMutation = useMutation(
    githubRefreshPRsMutationOptions({ queryClient }),
  );

  const isAuthenticated = authQuery.data?.authenticated === true;
  const prs = prsQuery.data?.prs ?? [];

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
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
            <header className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Pull Requests
              </h1>
              <p className="text-sm text-muted-foreground">
                Review and manage open pull requests from your GitHub repositories.
              </p>
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

                {/* PR list */}
                {prsQuery.isSuccess && prs.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {prs.map((pr) => (
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

                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            <Button
                              variant="default"
                              size="sm"
                              disabled={progress?.prNumber === pr.number}
                              onClick={async () => {
                                if (!activeOwner || !activeRepo) return;
                                const ac = new AbortController();
                                setProgress({
                                  prNumber: pr.number,
                                  step: "worktree",
                                  contextSubLabel: null,
                                  abortController: ac,
                                });
                                try {
                                  // Step 1: Create worktree
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

                                  // Step 2: Scaffold CLAUDE.md review context
                                  if (!result.alreadyExisted) {
                                    setProgress((p) =>
                                      p ? { ...p, step: "context" } : p,
                                    );

                                    // Start 10s sub-label timer
                                    const timer = setTimeout(() => {
                                      setProgress((p) =>
                                        p?.step === "context"
                                          ? {
                                              ...p,
                                              contextSubLabel:
                                                "This may take a moment for large repos\u2026",
                                            }
                                          : p,
                                      );
                                    }, 10_000);
                                    contextTimerRef.current = timer;

                                    const shouldInit =
                                      settings.autoInitReviewContext && !ac.signal.aborted;

                                    try {
                                      const ctxResult =
                                        await reviewContextInitMutation.mutateAsync({
                                          worktreePath,
                                          prNumber: pr.number,
                                          prTitle: pr.title,
                                          prAuthor: pr.author,
                                          headBranch: pr.headBranch,
                                          baseBranch: pr.baseBranch,
                                          diffStat: "",
                                          skipInit: !shouldInit || ac.signal.aborted,
                                        });
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
                                      toastManager.add({
                                        title: "Failed to initialize review context",
                                      });
                                    } finally {
                                      clearTimeout(timer);
                                      contextTimerRef.current = null;
                                    }
                                  }

                                  // Step 3: Create project & thread
                                  setProgress((p) =>
                                    p ? { ...p, step: "project" } : p,
                                  );

                                  const existingProject = projects.find(
                                    (p) => p.cwd === worktreePath,
                                  );
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
                                      createdAt: new Date().toISOString(),
                                    });
                                  }

                                  await handleNewThread(projectId, {
                                    branch: result.session.branchName,
                                    worktreePath,
                                  });
                                } finally {
                                  if (contextTimerRef.current) {
                                    clearTimeout(contextTimerRef.current);
                                    contextTimerRef.current = null;
                                  }
                                  setProgress(null);
                                }
                              }}
                            >
                              {progress?.prNumber === pr.number ? (
                                <>
                                  <LoaderIcon className="size-3.5 animate-spin" />
                                  {progress.step === "worktree" && "Creating worktree\u2026"}
                                  {progress.step === "context" &&
                                    "Initializing Claude context\u2026"}
                                  {progress.step === "project" && "Starting session\u2026"}
                                </>
                              ) : (
                                "Start Review"
                              )}
                            </Button>
                            {progress?.prNumber === pr.number &&
                              progress.step === "context" && (
                                <div className="flex flex-col items-end gap-0.5">
                                  {progress.contextSubLabel && (
                                    <span className="text-[11px] text-muted-foreground">
                                      {progress.contextSubLabel}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    className="text-[11px] text-primary hover:underline"
                                    onClick={() => {
                                      progress.abortController?.abort();
                                      setProgress((p) =>
                                        p
                                          ? {
                                              ...p,
                                              contextSubLabel: "Skipping\u2026",
                                            }
                                          : p,
                                      );
                                    }}
                                  >
                                    Skip context init
                                  </button>
                                </div>
                              )}
                          </div>
                        </div>
                      </section>
                    ))}
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
