import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { WorktreeService } from "./WorktreeService";
import { WorktreeStore } from "./WorktreeStore";
import { logCleanup } from "./CleanupLogger";
import type {
  WorktreeSession,
  WorktreeCreateInput,
  WorktreeCreateResult,
  WorktreeListResult,
  WorktreeRemoveResult,
} from "./types";

type IDEKind = "cursor" | "windsurf" | "vscode";

interface ArborSettings {
  preferredIDE: IDEKind | null;
  cleanupBehavior: "prompt" | "manual";
  refreshIntervalMs: number;
}

const SETTINGS_FILENAME = "settings.json";

const DEFAULT_BASE_PATH = path.join(process.env.HOME ?? process.env.USERPROFILE ?? "/tmp", "Code");

export class WorktreeManager {
  private configDir: string;
  private basePath: string;

  constructor(configDir: string, basePath?: string) {
    this.configDir = configDir;
    this.basePath = basePath ?? DEFAULT_BASE_PATH;
  }

  setBasePath(basePath: string): void {
    this.basePath = basePath;
  }

  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Create a worktree for a PR, or return the existing session if one already exists.
   */
  async create(input: WorktreeCreateInput): Promise<WorktreeCreateResult> {
    const sessions = await WorktreeStore.load(this.configDir);

    // Check for existing session for this PR
    const existing = WorktreeStore.findByPR(sessions, input.owner, input.repo, input.prNumber);

    if (existing) {
      // Verify the worktree still exists on disk
      const exists = await WorktreeService.worktreeExists(existing.worktreePath);
      if (exists) {
        await WorktreeStore.updateLastActive(this.configDir, existing.id);
        return { session: existing, alreadyExisted: true };
      }
      // Worktree was removed from disk but registry still has it — clean up
      await WorktreeStore.remove(this.configDir, existing.id);
    }

    const repoName = `${input.owner}--${input.repo}`;
    const worktreePath = WorktreeService.worktreePath(
      this.basePath,
      repoName,
      input.prNumber,
      input.branchName,
    );

    // Ensure bare clone exists
    const bareDir = await WorktreeService.ensureBareClone(this.basePath, repoName, input.repoUrl);

    // Create the worktree
    await WorktreeService.createWorktree(bareDir, worktreePath, input.branchName);

    const session: WorktreeSession = {
      id: randomUUID(),
      repoSlug: `${input.owner}/${input.repo}`,
      prNumber: input.prNumber,
      prTitle: input.prTitle,
      branchName: input.branchName,
      baseBranch: input.baseBranch,
      worktreePath,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    };

    await WorktreeStore.add(this.configDir, session);

    return { session, alreadyExisted: false };
  }

  /**
   * List all active worktree sessions with disk sizes.
   */
  async list(): Promise<WorktreeListResult> {
    const sessions = await WorktreeStore.load(this.configDir);

    const sessionsWithSize = await Promise.all(
      sessions.map(async (session) => {
        const exists = await WorktreeService.worktreeExists(session.worktreePath);
        if (!exists) {
          return { ...session, diskSizeMB: 0, _missing: true };
        }
        const diskSizeMB = await WorktreeService.getDiskSize(session.worktreePath);
        return { ...session, diskSizeMB, _missing: false };
      }),
    );

    // Clean up sessions for missing worktrees
    const missing = sessionsWithSize.filter((s) => (s as any)._missing);
    if (missing.length > 0) {
      const valid = sessions.filter((s) => !missing.some((m) => m.id === s.id));
      await WorktreeStore.save(this.configDir, valid);
    }

    return {
      sessions: sessionsWithSize
        .filter((s) => !(s as any)._missing)
        .map(({ _missing, ...rest }) => rest),
    };
  }

  /**
   * Remove a worktree session and delete it from disk.
   */
  async remove(sessionId: string): Promise<WorktreeRemoveResult> {
    const sessions = await WorktreeStore.load(this.configDir);
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      return { removed: false, id: sessionId };
    }

    // Determine bare clone path for git worktree remove
    const [owner, repo] = session.repoSlug.split("/");
    const repoName = `${owner}--${repo}`;
    const bareDir = WorktreeService.bareClonePath(this.basePath, repoName);

    await WorktreeService.removeWorktree(bareDir, session.worktreePath);
    await WorktreeStore.remove(this.configDir, sessionId);

    return { removed: true, id: sessionId };
  }

  /**
   * Get disk size of a specific session's worktree.
   */
  async getDiskSize(sessionId: string): Promise<{ id: string; diskSizeMB: number }> {
    const sessions = await WorktreeStore.load(this.configDir);
    const session = sessions.find((s) => s.id === sessionId);

    if (!session) {
      return { id: sessionId, diskSizeMB: 0 };
    }

    const diskSizeMB = await WorktreeService.getDiskSize(session.worktreePath);
    return { id: sessionId, diskSizeMB };
  }

  /**
   * Update lastActive timestamp for a session.
   */
  async touch(sessionId: string): Promise<void> {
    await WorktreeStore.updateLastActive(this.configDir, sessionId);
  }

  /**
   * Get the worktree base path setting.
   */
  async getSettings(): Promise<{ basePath: string }> {
    return { basePath: this.basePath };
  }

  /**
   * Update the worktree base path setting.
   */
  async updateSettings(settings: { basePath: string }): Promise<{ basePath: string }> {
    this.basePath = settings.basePath;
    return { basePath: this.basePath };
  }

  // ── IDE Settings ──────────────────────────────────────────────────

  private async loadSettings(): Promise<ArborSettings> {
    const filePath = path.join(this.configDir, SETTINGS_FILENAME);
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      return {
        preferredIDE: parsed?.preferredIDE ?? null,
        cleanupBehavior: parsed?.cleanupBehavior ?? "prompt",
        refreshIntervalMs: parsed?.refreshIntervalMs ?? 5 * 60 * 1000,
      };
    } catch {
      return { preferredIDE: null, cleanupBehavior: "prompt", refreshIntervalMs: 5 * 60 * 1000 };
    }
  }

  private async saveSettings(settings: ArborSettings): Promise<void> {
    await mkdir(this.configDir, { recursive: true });
    const filePath = path.join(this.configDir, SETTINGS_FILENAME);
    // Preserve any existing fields in settings.json
    let existing: Record<string, unknown> = {};
    try {
      const raw = await readFile(filePath, "utf-8");
      existing = JSON.parse(raw);
    } catch {
      // File doesn't exist yet
    }
    const merged = {
      ...existing,
      preferredIDE: settings.preferredIDE,
      cleanupBehavior: settings.cleanupBehavior,
      refreshIntervalMs: settings.refreshIntervalMs,
    };
    await writeFile(filePath, JSON.stringify(merged, null, 2), "utf-8");
  }

  async detectIDEs(): Promise<{ cursor: boolean; windsurf: boolean; vscode: boolean }> {
    return WorktreeService.detectIDEs();
  }

  async getIDESettings(): Promise<{
    preferredIDE: IDEKind | null;
    detectedIDEs: { cursor: boolean; windsurf: boolean; vscode: boolean };
  }> {
    const [settings, detectedIDEs] = await Promise.all([this.loadSettings(), this.detectIDEs()]);

    // If preferred IDE was set but is no longer detected, reset it
    if (settings.preferredIDE && !detectedIDEs[settings.preferredIDE]) {
      settings.preferredIDE = null;
      await this.saveSettings(settings);
    }

    return {
      preferredIDE: settings.preferredIDE,
      detectedIDEs,
    };
  }

  async updateIDESettings(input: { preferredIDE: IDEKind | null }): Promise<{
    preferredIDE: IDEKind | null;
    detectedIDEs: { cursor: boolean; windsurf: boolean; vscode: boolean };
  }> {
    const settings = await this.loadSettings();
    settings.preferredIDE = input.preferredIDE;
    await this.saveSettings(settings);
    const detectedIDEs = await this.detectIDEs();
    return { preferredIDE: input.preferredIDE, detectedIDEs };
  }

  async openInIDE(worktreePath: string, ide: IDEKind): Promise<void> {
    return WorktreeService.openInIDE(worktreePath, ide);
  }

  // ── Health Check ───────────────────────────────────────────────────

  async healthCheck(): Promise<{
    git: { status: "ok" | "missing"; version: string | null };
    claudeCode: { status: "ok" | "missing"; version: string | null };
    github: { status: "ok" | "not_configured" | "invalid"; username: string | null };
    ide: { status: "ok" | "not_configured" | "missing"; name: string | null };
  }> {
    const [gitResult, claudeResult, githubResult, ideResult] = await Promise.all([
      this.checkGit(),
      this.checkClaudeCode(),
      this.checkGitHub(),
      this.checkIDE(),
    ]);
    return { git: gitResult, claudeCode: claudeResult, github: githubResult, ide: ideResult };
  }

  private async checkGit(): Promise<{ status: "ok" | "missing"; version: string | null }> {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("git", ["--version"], { timeout: 5000 });
      const version = stdout.trim().replace("git version ", "");
      return { status: "ok", version };
    } catch {
      return { status: "missing", version: null };
    }
  }

  private async checkClaudeCode(): Promise<{ status: "ok" | "missing"; version: string | null }> {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);
      const { stdout } = await execFileAsync("claude", ["--version"], { timeout: 5000 });
      return { status: "ok", version: stdout.trim() };
    } catch {
      return { status: "missing", version: null };
    }
  }

  private async checkGitHub(): Promise<{
    status: "ok" | "not_configured" | "invalid";
    username: string | null;
  }> {
    try {
      const { TokenStore } = await import("../github/TokenStore");
      const token = await TokenStore.loadToken(this.configDir);
      if (!token) return { status: "not_configured", username: null };
      const { GitHubAuthService } = await import("../github/GitHubAuthService");
      const { username } = await GitHubAuthService.validateToken(token);
      return { status: "ok", username };
    } catch {
      return { status: "invalid", username: null };
    }
  }

  private async checkIDE(): Promise<{
    status: "ok" | "not_configured" | "missing";
    name: string | null;
  }> {
    const settings = await this.loadSettings();
    if (!settings.preferredIDE) return { status: "not_configured", name: null };
    const detected = await this.detectIDEs();
    if (detected[settings.preferredIDE]) {
      const labels: Record<IDEKind, string> = {
        cursor: "Cursor",
        windsurf: "Windsurf",
        vscode: "VS Code",
      };
      return { status: "ok", name: labels[settings.preferredIDE] };
    }
    return { status: "missing", name: settings.preferredIDE };
  }

  // ── Arbor Settings ─────────────────────────────────────────────────

  async getArborSettings(): Promise<{
    basePath: string;
    cleanupBehavior: "prompt" | "manual";
    refreshIntervalMs: number;
  }> {
    const settings = await this.loadSettings();
    return {
      basePath: this.basePath,
      cleanupBehavior: settings.cleanupBehavior,
      refreshIntervalMs: settings.refreshIntervalMs,
    };
  }

  async updateArborSettings(input: {
    basePath?: string | undefined;
    cleanupBehavior?: "prompt" | "manual" | undefined;
    refreshIntervalMs?: number | undefined;
  }): Promise<{
    basePath: string;
    cleanupBehavior: "prompt" | "manual";
    refreshIntervalMs: number;
  }> {
    const settings = await this.loadSettings();
    if (input.basePath !== undefined) {
      this.basePath = input.basePath;
    }
    if (input.cleanupBehavior !== undefined) {
      settings.cleanupBehavior = input.cleanupBehavior;
    }
    if (input.refreshIntervalMs !== undefined) {
      settings.refreshIntervalMs = input.refreshIntervalMs;
    }
    await this.saveSettings(settings);
    return {
      basePath: this.basePath,
      cleanupBehavior: settings.cleanupBehavior,
      refreshIntervalMs: settings.refreshIntervalMs,
    };
  }

  /**
   * Check PR lifecycle statuses against active sessions and perform cleanup.
   * - Merged/closed PRs → auto-remove worktree silently
   * - Approved PRs → return notification action (client shows toast)
   */
  async checkLifecycle(
    prStatuses: Array<{
      repoSlug: string;
      prNumber: number;
      state: "open" | "merged" | "closed";
      reviewStatus: "approved" | "changes_requested" | "review_required" | "unknown";
    }>,
  ): Promise<{
    actions: Array<{
      sessionId: string;
      prNumber: number;
      repoSlug: string;
      action: "auto_removed" | "approved";
    }>;
  }> {
    const sessions = await WorktreeStore.load(this.configDir);
    const actions: Array<{
      sessionId: string;
      prNumber: number;
      repoSlug: string;
      action: "auto_removed" | "approved";
    }> = [];

    for (const status of prStatuses) {
      const session = sessions.find(
        (s) =>
          s.repoSlug.toLowerCase() === status.repoSlug.toLowerCase() &&
          s.prNumber === status.prNumber,
      );
      if (!session) continue;

      if (status.state === "merged" || status.state === "closed") {
        try {
          await this.remove(session.id);
          const reason = status.state === "merged" ? "PR merged" : "PR closed without merge";
          await logCleanup("auto_removed", status.repoSlug, status.prNumber, reason);
          actions.push({
            sessionId: session.id,
            prNumber: status.prNumber,
            repoSlug: status.repoSlug,
            action: "auto_removed",
          });
        } catch {
          // Best-effort cleanup
        }
      } else if (status.state === "open" && status.reviewStatus === "approved") {
        await logCleanup(
          "approved_offered",
          status.repoSlug,
          status.prNumber,
          "PR approved — cleanup offered",
        );
        actions.push({
          sessionId: session.id,
          prNumber: status.prNumber,
          repoSlug: status.repoSlug,
          action: "approved",
        });
      }
    }

    return { actions };
  }
}
