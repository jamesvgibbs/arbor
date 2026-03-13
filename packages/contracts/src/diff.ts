import { Schema } from "effect";

// ── PR Changed Files ────────────────────────────────────────────────

export const PRChangedFile = Schema.Struct({
  filename: Schema.String,
  status: Schema.Literals(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]),
  additions: Schema.Number,
  deletions: Schema.Number,
  previousFilename: Schema.optional(Schema.String),
});
export type PRChangedFile = typeof PRChangedFile.Type;

// ── Inputs / Results ────────────────────────────────────────────────

export const DiffGetChangedFilesInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  prNumber: Schema.Number,
});
export type DiffGetChangedFilesInput = typeof DiffGetChangedFilesInput.Type;

export const DiffGetChangedFilesResult = Schema.Struct({
  files: Schema.Array(PRChangedFile),
  totalAdditions: Schema.Number,
  totalDeletions: Schema.Number,
});
export type DiffGetChangedFilesResult = typeof DiffGetChangedFilesResult.Type;

export const DiffGetLocalDiffInput = Schema.Struct({
  worktreePath: Schema.String,
  baseBranch: Schema.String,
  filename: Schema.optional(Schema.String),
});
export type DiffGetLocalDiffInput = typeof DiffGetLocalDiffInput.Type;

export const DiffGetLocalDiffResult = Schema.Struct({
  diff: Schema.String,
});
export type DiffGetLocalDiffResult = typeof DiffGetLocalDiffResult.Type;

// ── WS Method names ─────────────────────────────────────────────────

export const DIFF_WS_METHODS = {
  getChangedFiles: "diff.getChangedFiles",
  getLocalDiff: "diff.getLocalDiff",
} as const;
