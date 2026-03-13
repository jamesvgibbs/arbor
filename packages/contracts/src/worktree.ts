import { Schema } from "effect";

// ── Worktree Session ────────────────────────────────────────────────

export const WorktreeSessionSchema = Schema.Struct({
  id: Schema.String,
  repoSlug: Schema.String,
  prNumber: Schema.Number,
  prTitle: Schema.String,
  branchName: Schema.String,
  baseBranch: Schema.String,
  worktreePath: Schema.String,
  createdAt: Schema.String,
  lastActive: Schema.String,
});
export type WorktreeSessionSchema = typeof WorktreeSessionSchema.Type;

// ── Create ──────────────────────────────────────────────────────────

export const WorktreeCreateInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  prNumber: Schema.Number,
  prTitle: Schema.String,
  branchName: Schema.String,
  baseBranch: Schema.String,
  repoUrl: Schema.String,
});
export type WorktreeCreateInput = typeof WorktreeCreateInput.Type;

export const WorktreeCreateResult = Schema.Struct({
  session: WorktreeSessionSchema,
  alreadyExisted: Schema.Boolean,
});
export type WorktreeCreateResult = typeof WorktreeCreateResult.Type;

// ── List ────────────────────────────────────────────────────────────

export const WorktreeSessionWithSize = Schema.Struct({
  ...WorktreeSessionSchema.fields,
  diskSizeMB: Schema.Number,
});
export type WorktreeSessionWithSize = typeof WorktreeSessionWithSize.Type;

export const WorktreeListResult = Schema.Struct({
  sessions: Schema.Array(WorktreeSessionWithSize),
});
export type WorktreeListResult = typeof WorktreeListResult.Type;

// ── Remove ──────────────────────────────────────────────────────────

export const WorktreeRemoveInput = Schema.Struct({
  sessionId: Schema.String,
});
export type WorktreeRemoveInput = typeof WorktreeRemoveInput.Type;

export const WorktreeRemoveResult = Schema.Struct({
  removed: Schema.Boolean,
  id: Schema.String,
});
export type WorktreeRemoveResult = typeof WorktreeRemoveResult.Type;

// ── Disk Size ───────────────────────────────────────────────────────

export const WorktreeGetDiskSizeInput = Schema.Struct({
  sessionId: Schema.String,
});
export type WorktreeGetDiskSizeInput = typeof WorktreeGetDiskSizeInput.Type;

// ── Settings ────────────────────────────────────────────────────────

export const WorktreeSettingsResult = Schema.Struct({
  basePath: Schema.String,
});
export type WorktreeSettingsResult = typeof WorktreeSettingsResult.Type;

export const WorktreeUpdateSettingsInput = Schema.Struct({
  basePath: Schema.String,
});
export type WorktreeUpdateSettingsInput = typeof WorktreeUpdateSettingsInput.Type;

// ── WS Method names ─────────────────────────────────────────────────

export const WORKTREE_WS_METHODS = {
  create: "worktree.create",
  list: "worktree.list",
  remove: "worktree.remove",
  getDiskSize: "worktree.getDiskSize",
  getSettings: "worktree.getSettings",
  updateSettings: "worktree.updateSettings",
} as const;
