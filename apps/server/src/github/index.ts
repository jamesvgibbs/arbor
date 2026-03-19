/**
 * GitHub Integration Module
 *
 * Handles OAuth token lifecycle, repo list management, PR list fetching
 * and caching, and refresh scheduling.
 *
 * @module GitHubContext
 */

export { GitHubManager } from "./GitHubManager";
export { GitHubAuthService } from "./GitHubAuthService";
export { GitHubService } from "./GitHubService";
export { RepoStore } from "./RepoStore";
export { TokenStore } from "./TokenStore";
export { PRCache } from "./PRCache";
export type {
  GitHubAuthStatus,
  DeviceFlowResponse,
  DeviceFlowTokenResponse,
  RepoConfig,
  PRCard,
  PRDetails,
  PRListResult,
  GitHubRateLimitInfo,
} from "./types";
