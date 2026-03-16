import type { WorktreeSessionWithSize } from "@arbortools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RefreshCwIcon } from "lucide-react";

import { FileTree } from "./FileTree";
import { PRDiffPanel } from "./PRDiffPanel";
import {
  diffChangedFilesQueryOptions,
  diffLocalDiffQueryOptions,
} from "../../lib/diffPrReactQuery";
import type { PendingComment, CommentDraft } from "../../hooks/useInlineComments";

interface PRDiffViewerProps {
  session: WorktreeSessionWithSize;
  pendingComments?: PendingComment[] | undefined;
  activeDraft?: CommentDraft | null | undefined;
  onStartComment?: ((draft: CommentDraft) => void) | undefined;
  onSubmitComment?: ((body: string) => void) | undefined;
  onCancelComment?: (() => void) | undefined;
  onRemoveComment?: ((id: string) => void) | undefined;
  onAskClaude?: ((prompt: string) => void) | undefined;
}

export function PRDiffViewer({
  session,
  pendingComments = [],
  activeDraft = null,
  onStartComment,
  onSubmitComment,
  onCancelComment,
  onRemoveComment,
}: PRDiffViewerProps) {
  const [owner = "", repo = ""] = session.repoSlug.split("/");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const changedFilesQuery = useQuery(
    diffChangedFilesQueryOptions({
      owner,
      repo,
      prNumber: session.prNumber,
    }),
  );

  const files = changedFilesQuery.data?.files ?? [];

  // Auto-select first file on load
  useEffect(() => {
    if (files.length > 0 && selectedFile === null) {
      setSelectedFile(files[0]!.filename);
    }
  }, [files, selectedFile]);

  const selectedFileData = files.find((f) => f.filename === selectedFile);

  const localDiffQuery = useQuery(
    diffLocalDiffQueryOptions(
      selectedFile
        ? {
            worktreePath: session.worktreePath,
            baseBranch: session.baseBranch,
            filename: selectedFile,
          }
        : null,
    ),
  );

  // Filter comments for the currently selected file
  const fileComments = pendingComments.filter((c) => c.path === selectedFile);

  if (changedFilesQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <RefreshCwIcon className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (changedFilesQuery.isError) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center">
        <div className="space-y-2">
          <p className="text-sm text-destructive">Failed to load PR files.</p>
          <p className="text-xs text-muted-foreground">
            {changedFilesQuery.error instanceof Error
              ? changedFilesQuery.error.message
              : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
        No files changed in this PR.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <div className="min-h-0 w-64 shrink-0 self-stretch">
        <FileTree
          files={files}
          selectedFile={selectedFile}
          onSelectFile={setSelectedFile}
          totalAdditions={changedFilesQuery.data?.totalAdditions ?? 0}
          totalDeletions={changedFilesQuery.data?.totalDeletions ?? 0}
        />
      </div>
      <PRDiffPanel
        filename={selectedFile}
        additions={selectedFileData?.additions ?? 0}
        deletions={selectedFileData?.deletions ?? 0}
        diff={localDiffQuery.data?.diff}
        isLoading={localDiffQuery.isLoading}
        error={
          localDiffQuery.error instanceof Error
            ? localDiffQuery.error.message
            : localDiffQuery.error
              ? "Failed to load diff."
              : null
        }
        pendingComments={fileComments}
        activeDraft={activeDraft}
        onStartComment={onStartComment}
        onSubmitComment={onSubmitComment}
        onCancelComment={onCancelComment}
        onRemoveComment={onRemoveComment}
      />
    </div>
  );
}
