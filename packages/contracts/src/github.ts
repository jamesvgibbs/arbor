import { Schema } from "effect";

// ── GitHub Auth ──────────────────────────────────────────────────────

export const GitHubAuthStatus = Schema.Struct({
  authenticated: Schema.Boolean,
  username: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
});
export type GitHubAuthStatus = typeof GitHubAuthStatus.Type;

export const GitHubDeviceFlowInfo = Schema.Struct({
  deviceCode: Schema.String,
  userCode: Schema.String,
  verificationUri: Schema.String,
  expiresIn: Schema.Number,
  interval: Schema.Number,
});
export type GitHubDeviceFlowInfo = typeof GitHubDeviceFlowInfo.Type;

export const GitHubAuthenticateResult = Schema.Union([
  Schema.Struct({
    status: Schema.Literal("device_flow_started"),
    deviceFlow: GitHubDeviceFlowInfo,
  }),
  Schema.Struct({
    status: Schema.Literal("authenticated"),
    username: Schema.String,
    avatarUrl: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    status: Schema.Literal("error"),
    message: Schema.String,
  }),
]);
export type GitHubAuthenticateResult = typeof GitHubAuthenticateResult.Type;

export const GitHubPollAuthInput = Schema.Struct({
  deviceCode: Schema.String,
  interval: Schema.Number,
});
export type GitHubPollAuthInput = typeof GitHubPollAuthInput.Type;

export const GitHubPollAuthResult = Schema.Struct({
  authenticated: Schema.Boolean,
  username: Schema.NullOr(Schema.String),
  avatarUrl: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
});
export type GitHubPollAuthResult = typeof GitHubPollAuthResult.Type;

// ── Repos ────────────────────────────────────────────────────────────

export const GitHubRepoConfig = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  addedAt: Schema.String,
});
export type GitHubRepoConfig = typeof GitHubRepoConfig.Type;

export const GitHubAddRepoInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
});
export type GitHubAddRepoInput = typeof GitHubAddRepoInput.Type;

export const GitHubRemoveRepoInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
});
export type GitHubRemoveRepoInput = typeof GitHubRemoveRepoInput.Type;

// ── PRs ──────────────────────────────────────────────────────────────

export const GitHubPRCard = Schema.Struct({
  number: Schema.Number,
  title: Schema.String,
  author: Schema.String,
  authorAvatarUrl: Schema.String,
  headBranch: Schema.String,
  baseBranch: Schema.String,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  ciStatus: Schema.Literals(["success", "failure", "pending", "unknown"]),
  reviewStatus: Schema.Literals(["approved", "changes_requested", "review_required", "unknown"]),
  isDraft: Schema.Boolean,
});
export type GitHubPRCard = typeof GitHubPRCard.Type;

export const GitHubPRListInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
});
export type GitHubPRListInput = typeof GitHubPRListInput.Type;

export const GitHubPRListResult = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  prs: Schema.Array(GitHubPRCard),
  fetchedAt: Schema.String,
});
export type GitHubPRListResult = typeof GitHubPRListResult.Type;

export const GitHubPRDetailsInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  number: Schema.Number,
});
export type GitHubPRDetailsInput = typeof GitHubPRDetailsInput.Type;

export const GitHubRefreshInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
});
export type GitHubRefreshInput = typeof GitHubRefreshInput.Type;

// ── Submit Review ────────────────────────────────────────────────────

export const GitHubSubmitReviewInput = Schema.Struct({
  owner: Schema.String,
  repo: Schema.String,
  prNumber: Schema.Number,
  body: Schema.String,
  event: Schema.Literal("APPROVE", "COMMENT", "REQUEST_CHANGES"),
});
export type GitHubSubmitReviewInput = typeof GitHubSubmitReviewInput.Type;

// ── WS Method names ──────────────────────────────────────────────────

export const GITHUB_WS_METHODS = {
  getAuthStatus: "github.getAuthStatus",
  startAuth: "github.startAuth",
  pollAuth: "github.pollAuth",
  logout: "github.logout",
  listRepos: "github.listRepos",
  addRepo: "github.addRepo",
  removeRepo: "github.removeRepo",
  listPRs: "github.listPRs",
  getPRDetails: "github.getPRDetails",
  refreshPRs: "github.refreshPRs",
  submitReview: "github.submitReview",
} as const;
