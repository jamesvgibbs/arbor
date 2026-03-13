import { GitHubAuthService } from "./GitHubAuthService";
import { GitHubService } from "./GitHubService";
import { RepoStore } from "./RepoStore";
import { TokenStore } from "./TokenStore";
import { PRCache } from "./PRCache";
import type { GitHubPRFileResponse } from "./GitHubService";
import type { PRCard, PRDetails, RepoConfig } from "./types";

const GITHUB_CLIENT_ID =
  process.env.ARBOR_GITHUB_CLIENT_ID ??
  process.env.GITHUB_CLIENT_ID ??
  "Ov23liYourClientIdHere";

export class GitHubManager {
  private configDir: string;
  private prCache = new PRCache();
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshIntervalMs = 5 * 60 * 1000; // 5 minutes default

  constructor(configDir: string) {
    this.configDir = configDir;
  }

  // ── Auth ─────────────────────────────────────────────────────────────

  async getAuthStatus(): Promise<{
    authenticated: boolean;
    username: string | null;
    avatarUrl: string | null;
  }> {
    const token = await TokenStore.loadToken(this.configDir);
    if (!token) {
      return { authenticated: false, username: null, avatarUrl: null };
    }

    try {
      const { username, avatarUrl } = await GitHubAuthService.validateToken(token);
      return { authenticated: true, username, avatarUrl };
    } catch {
      // Token is invalid/expired
      return { authenticated: false, username: null, avatarUrl: null };
    }
  }

  async startAuth(): Promise<{
    status: "device_flow_started";
    deviceFlow: {
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      expiresIn: number;
      interval: number;
    };
  }> {
    const flow = await GitHubAuthService.startDeviceFlow(GITHUB_CLIENT_ID);
    return {
      status: "device_flow_started" as const,
      deviceFlow: {
        deviceCode: flow.device_code,
        userCode: flow.user_code,
        verificationUri: flow.verification_uri,
        expiresIn: flow.expires_in,
        interval: flow.interval,
      },
    };
  }

  async pollAuth(
    deviceCode: string,
    interval: number,
  ): Promise<{
    authenticated: boolean;
    username: string | null;
    avatarUrl: string | null;
    error: string | null;
  }> {
    try {
      const tokenResponse = await GitHubAuthService.pollForToken(
        GITHUB_CLIENT_ID,
        deviceCode,
        interval,
      );
      await TokenStore.saveToken(this.configDir, tokenResponse.access_token);
      const { username, avatarUrl } = await GitHubAuthService.validateToken(
        tokenResponse.access_token,
      );

      // Start refresh scheduling after auth
      this.startRefreshScheduler();

      return { authenticated: true, username, avatarUrl, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        authenticated: false,
        username: null,
        avatarUrl: null,
        error: message,
      };
    }
  }

  async logout(): Promise<void> {
    await TokenStore.deleteToken(this.configDir);
    this.prCache.invalidateAll();
    this.stopRefreshScheduler();
  }

  // ── Repos ────────────────────────────────────────────────────────────

  async listRepos(): Promise<RepoConfig[]> {
    return RepoStore.loadRepos(this.configDir);
  }

  async addRepo(
    owner: string,
    repo: string,
  ): Promise<RepoConfig[]> {
    return RepoStore.addRepo(this.configDir, owner, repo);
  }

  async removeRepo(
    owner: string,
    repo: string,
  ): Promise<RepoConfig[]> {
    this.prCache.invalidate(owner, repo);
    return RepoStore.removeRepo(this.configDir, owner, repo);
  }

  // ── PRs ──────────────────────────────────────────────────────────────

  async listPRs(
    owner: string,
    repo: string,
  ): Promise<{
    owner: string;
    repo: string;
    prs: PRCard[];
    fetchedAt: string;
  }> {
    // Return from cache if available
    const cached = this.prCache.get(owner, repo);
    if (cached) {
      return cached;
    }

    return this.fetchAndCachePRs(owner, repo);
  }

  async getPRDetails(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PRDetails> {
    const service = await this.getGitHubService();
    return service.getPRDetails(owner, repo, number);
  }

  async listPRFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubPRFileResponse[]> {
    const service = await this.getGitHubService();
    return service.listPRFiles(owner, repo, prNumber);
  }

  async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES",
  ): Promise<{ ok: true }> {
    const service = await this.getGitHubService();
    await service.submitReview(owner, repo, prNumber, body, event);
    return { ok: true };
  }

  async refreshPRs(
    owner: string,
    repo: string,
  ): Promise<{
    owner: string;
    repo: string;
    prs: PRCard[];
    fetchedAt: string;
  }> {
    this.prCache.invalidate(owner, repo);
    return this.fetchAndCachePRs(owner, repo);
  }

  // ── Refresh scheduling ───────────────────────────────────────────────

  setRefreshInterval(ms: number): void {
    this.refreshIntervalMs = ms;
    if (this.refreshTimer) {
      this.stopRefreshScheduler();
      this.startRefreshScheduler();
    }
  }

  startRefreshScheduler(): void {
    if (this.refreshTimer) return;

    this.refreshTimer = setInterval(async () => {
      try {
        const repos = await RepoStore.loadRepos(this.configDir);
        const token = await TokenStore.loadToken(this.configDir);
        if (!token) return;

        const service = new GitHubService(token);
        for (const repo of repos) {
          try {
            const prs = await service.listOpenPRs(repo.owner, repo.repo);
            this.prCache.set(repo.owner, repo.repo, prs);
          } catch {
            // Skip individual repo errors during background refresh
          }
        }
      } catch {
        // Swallow scheduler errors
      }
    }, this.refreshIntervalMs);
    this.refreshTimer.unref();
  }

  stopRefreshScheduler(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  // ── Internals ────────────────────────────────────────────────────────

  private async fetchAndCachePRs(
    owner: string,
    repo: string,
  ): Promise<{
    owner: string;
    repo: string;
    prs: PRCard[];
    fetchedAt: string;
  }> {
    const service = await this.getGitHubService();
    const prs = await service.listOpenPRs(owner, repo);
    this.prCache.set(owner, repo, prs);
    return this.prCache.get(owner, repo)!;
  }

  private async getGitHubService(): Promise<GitHubService> {
    const token = await TokenStore.loadToken(this.configDir);
    if (!token) {
      throw new Error("Not authenticated with GitHub. Please sign in first.");
    }
    return new GitHubService(token);
  }
}
