import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  DEFAULT_MODEL_BY_PROVIDER,
  type WorktreeSessionWithSize,
} from "@arbortools/contracts";
import {
  FolderIcon,
  TrashIcon,
  ClockIcon,
  HardDriveIcon,
  GitBranchIcon,
  RefreshCwIcon,
  CopyIcon,
  CheckIcon,
  ExternalLinkIcon,
  PlayIcon,
} from "lucide-react";

import {
  worktreeListQueryOptions,
  worktreeRemoveMutationOptions,
} from "~/lib/worktreeReactQuery";
import { useHandleNewThread } from "~/hooks/useHandleNewThread";
import { ensureNativeApi } from "../nativeApi";
import { newCommandId, newProjectId } from "../lib/utils";
import { isElectron } from "../env";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { SidebarInset } from "~/components/ui/sidebar";

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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <CheckIcon className="size-3 text-green-500" />
      ) : (
        <CopyIcon className="size-3" />
      )}
    </button>
  );
}

function SessionsRouteView() {
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery(worktreeListQueryOptions());
  const removeMutation = useMutation(
    worktreeRemoveMutationOptions({ queryClient }),
  );
  const { handleNewThread, projects } = useHandleNewThread();

  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {isElectron && (
          <div className="drag-region flex h-[52px] shrink-0 items-center border-b border-border px-5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Sessions
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <header className="flex items-center justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                  Active Sessions
                </h1>
                <p className="text-sm text-muted-foreground">
                  Manage worktree sessions for PR reviews.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sessionsQuery.refetch()}
                disabled={sessionsQuery.isFetching}
              >
                <RefreshCwIcon
                  className={`size-3.5 ${sessionsQuery.isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </header>

            {/* Loading state */}
            {sessionsQuery.isLoading && (
              <div className="flex items-center justify-center py-12">
                <RefreshCwIcon className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {/* Empty state */}
            {sessionsQuery.isSuccess && sessions.length === 0 && (
              <section className="rounded-2xl border border-dashed border-border bg-card p-5">
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <FolderIcon className="size-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    No active worktree sessions.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Start a review from the Pull Requests page to create a session.
                  </p>
                </div>
              </section>
            )}

            {/* Session list */}
            {sessionsQuery.isSuccess && sessions.length > 0 && (
              <div className="flex flex-col gap-3">
                {sessions.map((session: WorktreeSessionWithSize) => (
                  <section
                    key={session.id}
                    className="rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-card/80"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" size="sm">
                            #{session.prNumber}
                          </Badge>
                          <h3 className="min-w-0 truncate text-sm font-medium text-foreground">
                            {session.prTitle}
                          </h3>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">
                            {session.repoSlug}
                          </span>

                          <span className="flex items-center gap-1">
                            <GitBranchIcon className="size-3" />
                            {session.branchName}
                          </span>

                          <span className="flex items-center gap-1">
                            <ClockIcon className="size-3" />
                            Created {relativeTime(session.createdAt)}
                          </span>

                          <span className="flex items-center gap-1">
                            <HardDriveIcon className="size-3" />
                            {session.diskSizeMB} MB
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <code className="truncate text-[11px] text-muted-foreground/60">
                            {session.worktreePath}
                          </code>
                          <CopyButton text={session.worktreePath} />
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        {confirmingId === session.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-destructive">
                              Delete {session.diskSizeMB}MB?
                            </span>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => {
                                removeMutation.mutate(
                                  { sessionId: session.id },
                                  {
                                    onSettled: () => setConfirmingId(null),
                                  },
                                );
                              }}
                              disabled={removeMutation.isPending}
                            >
                              Confirm
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setConfirmingId(null)}
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={async () => {
                                const existingProject = projects.find(
                                  (p) => p.cwd === session.worktreePath,
                                );
                                let projectId = existingProject?.id;

                                if (!projectId) {
                                  const api = ensureNativeApi();
                                  projectId = newProjectId();
                                  const title = `PR #${session.prNumber}: ${session.prTitle}`;
                                  await api.orchestration.dispatchCommand({
                                    type: "project.create",
                                    commandId: newCommandId(),
                                    projectId,
                                    title,
                                    workspaceRoot: session.worktreePath,
                                    defaultModel: DEFAULT_MODEL_BY_PROVIDER.codex,
                                    createdAt: new Date().toISOString(),
                                  });
                                }

                                await handleNewThread(projectId, {
                                  branch: session.branchName,
                                  worktreePath: session.worktreePath,
                                });
                              }}
                            >
                              <PlayIcon className="size-3.5" />
                              Open Session
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const api = ensureNativeApi();
                                api.shell.openInEditor(session.worktreePath, "windsurf");
                              }}
                            >
                              <ExternalLinkIcon className="size-3.5" />
                              Open in Windsurf
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmingId(session.id)}
                            >
                              <TrashIcon className="size-3.5" />
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            )}

            {/* Error state */}
            {sessionsQuery.isError && (
              <section className="rounded-2xl border border-destructive/30 bg-card p-5">
                <p className="text-sm text-destructive">
                  Failed to load sessions.{" "}
                  {sessionsQuery.error instanceof Error
                    ? sessionsQuery.error.message
                    : "Unknown error."}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    </SidebarInset>
  );
}

export const Route = createFileRoute("/_chat/sessions")({
  component: SessionsRouteView,
});
