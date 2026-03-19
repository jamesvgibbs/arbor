export interface GitHubAuthStatus {
  authenticated: boolean;
  username: string | null;
  avatarUrl: string | null;
}

export interface DeviceFlowResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export interface DeviceFlowTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface RepoConfig {
  owner: string;
  repo: string;
  addedAt: string;
}

export interface PRCard {
  number: number;
  title: string;
  author: string;
  authorAvatarUrl: string;
  headBranch: string;
  baseBranch: string;
  createdAt: string;
  updatedAt: string;
  ciStatus: "success" | "failure" | "pending" | "unknown";
  reviewStatus: "approved" | "changes_requested" | "review_required" | "unknown";
  isDraft: boolean;
}

export interface PRDetails extends PRCard {
  body: string;
  diffStat: string;
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface PRListResult {
  owner: string;
  repo: string;
  prs: PRCard[];
  fetchedAt: string;
}

export interface GitHubRateLimitInfo {
  remaining: number;
  limit: number;
  resetAt: string;
}
