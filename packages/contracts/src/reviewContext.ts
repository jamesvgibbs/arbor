import { Schema } from "effect";

// ── Detect ─────────────────────────────────────────────────────────

export const ReviewContextDetectInput = Schema.Struct({
  worktreePath: Schema.String,
});
export type ReviewContextDetectInput = typeof ReviewContextDetectInput.Type;

export const ReviewContextDetectResult = Schema.Struct({
  exists: Schema.Boolean,
  path: Schema.NullOr(Schema.String),
});
export type ReviewContextDetectResult = typeof ReviewContextDetectResult.Type;

// ── Init ───────────────────────────────────────────────────────────

export const ReviewContextInitInput = Schema.Struct({
  worktreePath: Schema.String,
  prNumber: Schema.Number,
  prTitle: Schema.String,
  prAuthor: Schema.String,
  headBranch: Schema.String,
  baseBranch: Schema.String,
  diffStat: Schema.String,
  skipInit: Schema.optional(Schema.Boolean),
});
export type ReviewContextInitInput = typeof ReviewContextInitInput.Type;

export const ReviewContextInitResult = Schema.Struct({
  claudeMdPath: Schema.String,
  existedAlready: Schema.Boolean,
  ranInit: Schema.Boolean,
});
export type ReviewContextInitResult = typeof ReviewContextInitResult.Type;

// ── WS Method names ────────────────────────────────────────────────

export const REVIEW_CONTEXT_WS_METHODS = {
  detect: "reviewContext.detect",
  init: "reviewContext.init",
} as const;
