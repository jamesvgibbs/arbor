import {
  type ProjectId,
  type ThreadId,
  type WorktreeSessionWithSize,
  DEFAULT_RUNTIME_MODE,
} from "@arbortools/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GitPullRequestIcon,
  CheckIcon,
  MessageSquareIcon,
  Loader2Icon,
  SendIcon,
} from "lucide-react";

import ChatView from "../components/ChatView";
import { PRDiffViewer } from "../components/diff/PRDiffViewer";
import { useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import { worktreeListQueryOptions } from "../lib/worktreeReactQuery";
import { githubSubmitReviewMutationOptions } from "../lib/githubReactQuery";
import { newThreadId } from "../lib/utils";
import { useInlineComments } from "../hooks/useInlineComments";
import { useGitHubComments } from "../hooks/useGitHubComments";
import { SidebarInset, SidebarTrigger } from "~/components/ui/sidebar";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "~/components/ui/resizable";

function ReviewRouteView() {
  const navigate = useNavigate();
  const projectId = Route.useParams({
    select: (params) => params.projectId as ProjectId,
  });

  const projects = useStore((store) => store.projects);
  const threads = useStore((store) => store.threads);
  const project = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  );

  const worktreeListQuery = useQuery(worktreeListQueryOptions());
  const matchingSession: WorktreeSessionWithSize | null = useMemo(() => {
    if (!project || !worktreeListQuery.data) return null;
    return (
      worktreeListQuery.data.sessions.find(
        (s) => s.worktreePath === project.cwd,
      ) ?? null
    );
  }, [project, worktreeListQuery.data]);

  // Redirect if no project or no matching session
  useEffect(() => {
    if (!worktreeListQuery.isLoading && (!project || !matchingSession)) {
      void navigate({ to: "/", replace: true });
    }
  }, [project, matchingSession, worktreeListQuery.isLoading, navigate]);

  // Resolve thread: find most recent thread for this project with matching worktreePath,
  // or create a draft thread
  const [threadId, setThreadId] = useState<ThreadId | null>(null);

  useEffect(() => {
    if (!project || !matchingSession) return;

    // Find existing thread with matching worktreePath
    const existingThread = threads
      .filter(
        (t) =>
          t.projectId === projectId && t.worktreePath === project.cwd,
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0];

    if (existingThread) {
      setThreadId(existingThread.id);
      return;
    }

    // Check for existing draft thread
    const draftStore = useComposerDraftStore.getState();
    const existingDraft = draftStore.getDraftThreadByProjectId(projectId);
    if (existingDraft) {
      setThreadId(existingDraft.threadId);
      return;
    }

    // Create new draft thread
    const newId = newThreadId();
    draftStore.setProjectDraftThreadId(projectId, newId, {
      createdAt: new Date().toISOString(),
      branch: matchingSession.branchName,
      worktreePath: matchingSession.worktreePath,
      envMode: "worktree",
      runtimeMode: DEFAULT_RUNTIME_MODE,
    });
    setThreadId(newId);
  }, [project, matchingSession, threads, projectId]);

  const [owner = "", repo = ""] = (matchingSession?.repoSlug ?? "").split("/");
  const submitReviewMutation = useMutation(githubSubmitReviewMutationOptions());
  const [reviewComment, setReviewComment] = useState("");
  const [showCommentInput, setShowCommentInput] = useState(false);

  const {
    pendingComments,
    activeDraft,
    startComment,
    cancelComment,
    submitComment,
    removeComment,
    clearAll,
    toGitHubComments,
  } = useInlineComments(`${owner}/${repo}#${matchingSession?.prNumber ?? 0}`);

  const {
    comments: githubReviewComments,
    refetch: refetchGitHubComments,
  } = useGitHubComments(owner, repo, matchingSession?.prNumber ?? 0);

  const handleApprove = useCallback(() => {
    if (!matchingSession) return;
    const comments = toGitHubComments();
    const params = {
      owner,
      repo,
      prNumber: matchingSession.prNumber,
      body: reviewComment || "",
      event: "APPROVE" as const,
      ...(comments.length > 0 ? { comments } : {}),
    };
    console.log("[review] submitting approve:", params);
    submitReviewMutation.mutate(params, {
      onSuccess: () => {
        setReviewComment("");
        setShowCommentInput(false);
        clearAll();
        void refetchGitHubComments();
      },
      onError: (err) => {
        console.error("[review] approve failed:", err);
      },
    });
  }, [owner, repo, matchingSession, reviewComment, submitReviewMutation, toGitHubComments, clearAll, refetchGitHubComments]);

  const handleComment = useCallback(() => {
    if (!matchingSession) return;
    const comments = toGitHubComments();
    if (!reviewComment.trim() && comments.length === 0) return;
    const params = {
      owner,
      repo,
      prNumber: matchingSession.prNumber,
      body: reviewComment || "",
      event: "COMMENT" as const,
      ...(comments.length > 0 ? { comments } : {}),
    };
    console.log("[review] submitting comment:", params);
    submitReviewMutation.mutate(params, {
      onSuccess: () => {
        setReviewComment("");
        setShowCommentInput(false);
        clearAll();
        void refetchGitHubComments();
      },
      onError: (err) => {
        console.error("[review] comment failed:", err);
      },
    });
  }, [owner, repo, matchingSession, reviewComment, submitReviewMutation, toGitHubComments, clearAll, refetchGitHubComments]);

  if (!project || !matchingSession || !threadId) {
    return null;
  }

  return (
    <SidebarInset className="h-dvh max-h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal">
        {/* Left pane: PR diff */}
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="flex h-full min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card px-4 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <SidebarTrigger className="size-7 shrink-0" />
                <GitPullRequestIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-sm font-medium">
                  PR #{matchingSession.prNumber}: {matchingSession.prTitle}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {submitReviewMutation.isSuccess && (
                  <span className="text-[11px] text-green-500">Submitted</span>
                )}
                {submitReviewMutation.isError && (
                  <span className="text-[11px] text-destructive">Failed</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowCommentInput((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <MessageSquareIcon className="size-3" />
                  Comment
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={submitReviewMutation.isPending}
                  className="inline-flex items-center gap-1 rounded-md border border-green-600/40 bg-green-600/10 px-2 py-1 text-[11px] font-medium text-green-600 transition-colors hover:bg-green-600/20 disabled:opacity-50"
                >
                  {submitReviewMutation.isPending ? (
                    <Loader2Icon className="size-3 animate-spin" />
                  ) : (
                    <CheckIcon className="size-3" />
                  )}
                  Approve
                </button>
                {pendingComments.length > 0 && (
                  <button
                    type="button"
                    onClick={handleComment}
                    disabled={submitReviewMutation.isPending}
                    className="inline-flex items-center gap-1 rounded-md border border-blue-600/40 bg-blue-600/10 px-2.5 py-1 text-[11px] font-medium text-blue-600 transition-colors hover:bg-blue-600/20 disabled:opacity-50"
                  >
                    {submitReviewMutation.isPending ? (
                      <Loader2Icon className="size-3 animate-spin" />
                    ) : (
                      <SendIcon className="size-3" />
                    )}
                    Submit review ({pendingComments.length})
                  </button>
                )}
              </div>
            </div>
            {showCommentInput && (
              <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2">
                <input
                  type="text"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Leave a review comment..."
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (reviewComment.trim() || pendingComments.length > 0)) {
                      handleComment();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleComment}
                  disabled={(!reviewComment.trim() && pendingComments.length === 0) || submitReviewMutation.isPending}
                  className="rounded-md border border-border px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                >
                  Submit
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-hidden">
              <PRDiffViewer
                session={matchingSession}
                pendingComments={pendingComments}
                activeDraft={activeDraft}
                onStartComment={startComment}
                onSubmitComment={submitComment}
                onCancelComment={cancelComment}
                onRemoveComment={removeComment}
                githubComments={githubReviewComments}
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right pane: Chat */}
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
            <ChatView key={threadId} threadId={threadId} reviewMode />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/review/$projectId")({
  component: ReviewRouteView,
});
