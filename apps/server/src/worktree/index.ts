/**
 * Worktree Management Module
 *
 * Handles worktree creation, disk size tracking, cleanup orchestration,
 * and session-to-worktree mapping.
 *
 * @module WorktreeContext
 */

export { WorktreeManager } from "./WorktreeManager";
export { WorktreeService } from "./WorktreeService";
export { WorktreeStore } from "./WorktreeStore";
export type {
  WorktreeSession,
  WorktreeCreateInput,
  WorktreeCreateResult,
  WorktreeListResult,
  WorktreeRemoveResult,
} from "./types";
