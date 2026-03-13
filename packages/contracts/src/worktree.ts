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

// ── Lifecycle Cleanup ──────────────────────────────────────────────

export const WorktreeLifecycleAction = Schema.Struct({
  sessionId: Schema.String,
  prNumber: Schema.Number,
  repoSlug: Schema.String,
  action: Schema.Literals(["auto_removed", "approved"]),
});
export type WorktreeLifecycleAction = typeof WorktreeLifecycleAction.Type;

export const WorktreeCheckLifecycleInput = Schema.Struct({
  prStatuses: Schema.Array(
    Schema.Struct({
      repoSlug: Schema.String,
      prNumber: Schema.Number,
      state: Schema.Literals(["open", "merged", "closed"]),
      reviewStatus: Schema.Literals(["approved", "changes_requested", "review_required", "unknown"]),
    }),
  ),
});
export type WorktreeCheckLifecycleInput = typeof WorktreeCheckLifecycleInput.Type;

export const WorktreeCheckLifecycleResult = Schema.Struct({
  actions: Schema.Array(WorktreeLifecycleAction),
});
export type WorktreeCheckLifecycleResult = typeof WorktreeCheckLifecycleResult.Type;

// ── IDE Types ────────────────────────────────────────────────────────

export const IDEKind = Schema.Literals(["cursor", "windsurf", "vscode"]);
export type IDEKind = typeof IDEKind.Type;

export const IDEDetectionResult = Schema.Struct({
  cursor: Schema.Boolean,
  windsurf: Schema.Boolean,
  vscode: Schema.Boolean,
});
export type IDEDetectionResult = typeof IDEDetectionResult.Type;

export const IDESettingsResult = Schema.Struct({
  preferredIDE: Schema.NullOr(IDEKind),
  detectedIDEs: IDEDetectionResult,
});
export type IDESettingsResult = typeof IDESettingsResult.Type;

export const IDEUpdateSettingsInput = Schema.Struct({
  preferredIDE: Schema.NullOr(IDEKind),
});
export type IDEUpdateSettingsInput = typeof IDEUpdateSettingsInput.Type;

export const WorktreeOpenInIDEInput = Schema.Struct({
  worktreePath: Schema.String,
  ide: IDEKind,
});
export type WorktreeOpenInIDEInput = typeof WorktreeOpenInIDEInput.Type;

// ── Health Check ───────────────────────────────────────────────────

export const HealthCheckResult = Schema.Struct({
  git: Schema.Struct({
    status: Schema.Literals(["ok", "missing"]),
    version: Schema.NullOr(Schema.String),
  }),
  claudeCode: Schema.Struct({
    status: Schema.Literals(["ok", "missing"]),
    version: Schema.NullOr(Schema.String),
  }),
  github: Schema.Struct({
    status: Schema.Literals(["ok", "not_configured", "invalid"]),
    username: Schema.NullOr(Schema.String),
  }),
  ide: Schema.Struct({
    status: Schema.Literals(["ok", "not_configured", "missing"]),
    name: Schema.NullOr(Schema.String),
  }),
});
export type HealthCheckResult = typeof HealthCheckResult.Type;

// ── Arbor Settings ─────────────────────────────────────────────────

export const ArborSettingsResult = Schema.Struct({
  basePath: Schema.String,
  cleanupBehavior: Schema.Literals(["prompt", "manual"]),
  refreshIntervalMs: Schema.Number,
});
export type ArborSettingsResult = typeof ArborSettingsResult.Type;

export const ArborUpdateSettingsInput = Schema.Struct({
  basePath: Schema.optional(Schema.String),
  cleanupBehavior: Schema.optional(Schema.Literals(["prompt", "manual"])),
  refreshIntervalMs: Schema.optional(Schema.Number),
});
export type ArborUpdateSettingsInput = typeof ArborUpdateSettingsInput.Type;

// ── WS Method names ─────────────────────────────────────────────────

export const WORKTREE_WS_METHODS = {
  create: "worktree.create",
  list: "worktree.list",
  remove: "worktree.remove",
  getDiskSize: "worktree.getDiskSize",
  getSettings: "worktree.getSettings",
  updateSettings: "worktree.updateSettings",
  checkLifecycle: "worktree.checkLifecycle",
  detectIDEs: "worktree.detectIDEs",
  getIDESettings: "worktree.getIDESettings",
  updateIDESettings: "worktree.updateIDESettings",
  openInIDE: "worktree.openInIDE",
  healthCheck: "worktree.healthCheck",
  getArborSettings: "worktree.getArborSettings",
  updateArborSettings: "worktree.updateArborSettings",
} as const;
