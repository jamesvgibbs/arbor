import { parsePatchFiles, parseDiffFromFile } from "@pierre/diffs";
import type { DiffLineAnnotation, AnnotationSide } from "@pierre/diffs/react";
import { FileDiff, Virtualizer, GutterUtilitySlotStyles } from "@pierre/diffs/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { MessageSquarePlusIcon, Trash2Icon } from "lucide-react";
import type { GitHubPRReviewComment } from "@arbortools/contracts";
import { GitHubCommentDisplay } from "./GitHubCommentDisplay";

interface SelectedLineRange {
  start: number;
  side?: "deletions" | "additions";
  end: number;
  endSide?: "deletions" | "additions";
}
import { useTheme } from "../../hooks/useTheme";
import { buildPatchCacheKey, resolveDiffThemeName } from "../../lib/diffRendering";
import type { PendingComment, CommentDraft } from "../../hooks/useInlineComments";

type DiffThemeType = "light" | "dark";

interface CommentAnnotationMetadata {
  type: "draft" | "pending" | "github";
  comment?: PendingComment | undefined;
  githubComment?: GitHubPRReviewComment | undefined;
  githubReplies?: GitHubPRReviewComment[] | undefined;
}

const DIFF_PANEL_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}
`;

interface PRDiffPanelProps {
  filename: string | null;
  additions: number;
  deletions: number;
  diff: string | undefined;
  isLoading: boolean;
  error: string | null;
  pendingComments?: PendingComment[] | undefined;
  activeDraft?: CommentDraft | null | undefined;
  onStartComment?: ((draft: CommentDraft) => void) | undefined;
  onSubmitComment?: ((body: string) => void) | undefined;
  onCancelComment?: (() => void) | undefined;
  onRemoveComment?: ((id: string) => void) | undefined;
  githubComments?: readonly GitHubPRReviewComment[] | undefined;
  oldFileContent?: string | undefined;
  newFileContent?: string | undefined;
}

export function PRDiffPanel({
  filename,
  additions,
  deletions,
  diff,
  isLoading,
  error,
  pendingComments = [],
  activeDraft = null,
  onStartComment,
  onSubmitComment,
  onCancelComment,
  onRemoveComment,
  githubComments = [],
  oldFileContent,
  newFileContent,
}: PRDiffPanelProps) {
  const { resolvedTheme } = useTheme();

  const renderableFiles = useMemo(() => {
    if (oldFileContent !== undefined && newFileContent !== undefined && filename) {
      try {
        const fileDiff = parseDiffFromFile(
          { name: filename, contents: oldFileContent },
          { name: filename, contents: newFileContent },
        );
        return [fileDiff];
      } catch {
        // Fall through to patch parsing
      }
    }
    if (!diff || diff.trim().length === 0) return [];
    try {
      const parsed = parsePatchFiles(
        diff,
        buildPatchCacheKey(diff, `pr-diff:${resolvedTheme}`),
      );
      return parsed.flatMap((p) => p.files);
    } catch {
      return [];
    }
  }, [diff, oldFileContent, newFileContent, filename, resolvedTheme]);

  // Build line annotations for pending comments, active draft, and GitHub comments
  const lineAnnotations = useMemo(() => {
    const annotations: DiffLineAnnotation<CommentAnnotationMetadata>[] = [];

    // Add pending comments as annotations
    for (const comment of pendingComments) {
      annotations.push({
        side: comment.side === "LEFT" ? "deletions" : "additions",
        lineNumber: comment.line,
        metadata: { type: "pending", comment },
      });
    }

    // Add active draft as annotation
    if (activeDraft && activeDraft.path === filename) {
      annotations.push({
        side: activeDraft.side === "LEFT" ? "deletions" : "additions",
        lineNumber: activeDraft.line,
        metadata: { type: "draft" },
      });
    }

    // Add GitHub review comments as annotations (group threads)
    const topLevelComments = githubComments.filter((c) => !c.inReplyToId);
    const replyMap = new Map<number, GitHubPRReviewComment[]>();
    for (const c of githubComments) {
      if (c.inReplyToId) {
        const existing = replyMap.get(c.inReplyToId) ?? [];
        existing.push(c);
        replyMap.set(c.inReplyToId, existing);
      }
    }

    for (const gc of topLevelComments) {
      annotations.push({
        side: gc.side === "LEFT" ? "deletions" : "additions",
        lineNumber: gc.line,
        metadata: {
          type: "github",
          githubComment: gc,
          githubReplies: replyMap.get(gc.id),
        },
      });
    }

    return annotations;
  }, [pendingComments, activeDraft, filename, githubComments]);

  const handleGutterUtilityClick = useCallback(
    (range: SelectedLineRange) => {
      if (!filename || !onStartComment) return;
      const side: "LEFT" | "RIGHT" = range.side === "deletions" ? "LEFT" : "RIGHT";
      const draft: CommentDraft = {
        path: filename,
        line: range.end,
        side,
      };
      if (range.start !== range.end) {
        draft.startLine = range.start;
        draft.startSide = range.side === "deletions" ? "LEFT" : "RIGHT";
      }
      onStartComment(draft);
    },
    [filename, onStartComment],
  );

  const renderAnnotation = useCallback(
    (annotation: DiffLineAnnotation<CommentAnnotationMetadata>) => {
      if (!annotation.metadata) return null;

      if (annotation.metadata.type === "draft") {
        return (
          <InlineCommentForm
            onSubmit={(body) => onSubmitComment?.(body)}
            onCancel={() => onCancelComment?.()}
          />
        );
      }

      if (annotation.metadata.type === "pending" && annotation.metadata.comment) {
        const comment = annotation.metadata.comment;
        return (
          <PendingCommentDisplay
            comment={comment}
            onRemove={() => onRemoveComment?.(comment.id)}
          />
        );
      }

      if (annotation.metadata.type === "github" && annotation.metadata.githubComment) {
        return (
          <GitHubCommentDisplay
            comment={annotation.metadata.githubComment}
            replies={annotation.metadata.githubReplies}
          />
        );
      }

      return null;
    },
    [onSubmitComment, onCancelComment, onRemoveComment],
  );

  const renderGutterUtility = useCallback(
    (getHoveredLine: () => { lineNumber: number; side: AnnotationSide } | undefined) => {
      const hovered = getHoveredLine();
      if (!hovered) return null;

      return (
        <button
          type="button"
          onClick={() => {
            handleGutterUtilityClick({
              start: hovered.lineNumber,
              end: hovered.lineNumber,
              side: hovered.side === "deletions" ? "deletions" : "additions",
            });
          }}
          style={GutterUtilitySlotStyles}
          className="flex items-center justify-center rounded bg-blue-500 text-white hover:bg-blue-600"
          title="Add comment"
        >
          <MessageSquarePlusIcon className="size-3.5" />
        </button>
      );
    },
    [handleGutterUtilityClick],
  );

  if (!filename) {
    return (
      <div className="flex h-full flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
        Select a file to view its diff.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">
            Loading diff...
          </div>
        )}
        {error && !isLoading && (
          <div className="px-4 py-3">
            <p className="text-[11px] text-red-500/80">{error}</p>
          </div>
        )}
        {!isLoading && !error && renderableFiles.length === 0 && diff !== undefined && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">
            {diff.trim().length === 0
              ? "No changes in this file."
              : "Unable to render diff."}
          </div>
        )}
        {!isLoading && renderableFiles.length > 0 && (
          <Virtualizer
            className="h-full min-h-0 overflow-auto px-2 pb-2"
            config={{ overscrollSize: 600, intersectionObserverMargin: 1200 }}
          >
            {renderableFiles.map((fileDiff) => {
              const key = fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
              return (
                <div key={`${key}:${resolvedTheme}`} className="mb-2 rounded-md first:mt-2 last:mb-0">
                  <FileDiff<CommentAnnotationMetadata>
                    fileDiff={fileDiff}
                    lineAnnotations={lineAnnotations}
                    renderAnnotation={renderAnnotation}
                    renderGutterUtility={renderGutterUtility}
                    options={{
                      diffStyle: "unified",
                      lineDiffType: "none",
                      theme: resolveDiffThemeName(resolvedTheme),
                      themeType: resolvedTheme as DiffThemeType,
                      unsafeCSS: DIFF_PANEL_CSS,
                      enableGutterUtility: true,
                      enableLineSelection: true,
                      onGutterUtilityClick: handleGutterUtilityClick,
                      ...(fileDiff.isPartial === false
                        ? { expansionLineCount: 20 }
                        : {}),
                    }}
                  />
                </div>
              );
            })}
          </Virtualizer>
        )}
      </div>
    </div>
  );
}

function InlineCommentForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (body: string) => void;
  onCancel: () => void;
}) {
  const [body, setBody] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus the textarea
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      if (el) el.focus();
    },
    [],
  );

  return (
    <div className="border-t border-b border-border bg-card px-3 py-2.5">
      <textarea
        ref={setRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) {
            e.preventDefault();
            onSubmit(body);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground/50">
          {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter to submit · Esc to cancel
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => body.trim() && onSubmit(body)}
            disabled={!body.trim()}
            className="rounded-md border border-border bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            Add comment
          </button>
        </div>
      </div>
    </div>
  );
}

function PendingCommentDisplay({
  comment,
  onRemove,
}: {
  comment: PendingComment;
  onRemove: () => void;
}) {
  return (
    <div className="border-t border-b border-blue-500/20 bg-blue-500/5 px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {comment.startLine && (
            <span className="mb-0.5 block text-[10px] text-muted-foreground/50">
              Lines {comment.startLine}–{comment.line}
            </span>
          )}
          <p className="whitespace-pre-wrap text-xs text-foreground">{comment.body}</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-destructive"
          title="Remove comment"
        >
          <Trash2Icon className="size-3" />
        </button>
      </div>
      <span className="mt-1 block text-[10px] text-muted-foreground/40">
        Pending — will be submitted with review
      </span>
    </div>
  );
}
