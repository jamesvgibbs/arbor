import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_PREFIX = "arbor:review-comments:";

export interface PendingComment {
  id: string;
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
  body: string;
}

export interface CommentDraft {
  path: string;
  line: number;
  side: "LEFT" | "RIGHT";
  startLine?: number;
  startSide?: "LEFT" | "RIGHT";
}

function loadComments(storageKey: string): PendingComment[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveComments(storageKey: string, comments: PendingComment[]) {
  try {
    if (comments.length === 0) {
      localStorage.removeItem(STORAGE_PREFIX + storageKey);
    } else {
      localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(comments));
    }
  } catch {
    /* storage full or unavailable */
  }
}

/**
 * Manages pending inline review comments, persisted to localStorage keyed by PR.
 * @param storageKey Unique key for this review, e.g. "owner/repo#123"
 */
export function useInlineComments(storageKey: string) {
  const [pendingComments, setPendingComments] = useState<PendingComment[]>(() =>
    loadComments(storageKey),
  );
  const [activeDraft, setActiveDraft] = useState<CommentDraft | null>(null);

  // Persist whenever comments change
  const keyRef = useRef(storageKey);
  keyRef.current = storageKey;
  useEffect(() => {
    saveComments(keyRef.current, pendingComments);
  }, [pendingComments]);

  // Reset state if the storage key changes (navigating to a different PR)
  const prevKeyRef = useRef(storageKey);
  useEffect(() => {
    if (prevKeyRef.current !== storageKey) {
      prevKeyRef.current = storageKey;
      setPendingComments(loadComments(storageKey));
      setActiveDraft(null);
    }
  }, [storageKey]);

  const startComment = useCallback((draft: CommentDraft) => {
    setActiveDraft(draft);
  }, []);

  const cancelComment = useCallback(() => {
    setActiveDraft(null);
  }, []);

  const submitComment = useCallback(
    (body: string) => {
      if (!activeDraft || !body.trim()) return;
      const comment: PendingComment = {
        id: `${activeDraft.path}:${activeDraft.side}:${activeDraft.startLine ?? activeDraft.line}-${activeDraft.line}`,
        path: activeDraft.path,
        line: activeDraft.line,
        side: activeDraft.side,
        body: body.trim(),
      };
      if (activeDraft.startLine != null) comment.startLine = activeDraft.startLine;
      if (activeDraft.startSide != null) comment.startSide = activeDraft.startSide;
      setPendingComments((prev) => [...prev, comment]);
      setActiveDraft(null);
    },
    [activeDraft],
  );

  const removeComment = useCallback((id: string) => {
    setPendingComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setPendingComments([]);
    setActiveDraft(null);
  }, []);

  const getCommentsForFile = useCallback(
    (path: string) => pendingComments.filter((c) => c.path === path),
    [pendingComments],
  );

  const toGitHubComments = useCallback(
    () =>
      pendingComments.map((c) => {
        const result: {
          path: string;
          body: string;
          line: number;
          side: "LEFT" | "RIGHT";
          startLine?: number;
          startSide?: "LEFT" | "RIGHT";
        } = {
          path: c.path,
          body: c.body,
          line: c.line,
          side: c.side,
        };
        if (c.startLine != null) result.startLine = c.startLine;
        if (c.startSide != null) result.startSide = c.startSide;
        return result;
      }),
    [pendingComments],
  );

  return {
    pendingComments,
    activeDraft,
    startComment,
    cancelComment,
    submitComment,
    removeComment,
    clearAll,
    getCommentsForFile,
    toGitHubComments,
  };
}
