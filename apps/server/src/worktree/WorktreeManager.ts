import { randomUUID } from "node:crypto";
import path from "node:path";
import { WorktreeService } from "./WorktreeService";
import { WorktreeStore } from "./WorktreeStore";
import type {
  WorktreeSession,
  WorktreeCreateInput,
  WorktreeCreateResult,
  WorktreeListResult,
  WorktreeRemoveResult,
} from "./types";

const DEFAULT_BASE_PATH = path.join(
  process.env.HOME ?? process.env.USERPROFILE ?? "/tmp",
  "Code",
);

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
    const existing = WorktreeStore.findByPR(
      sessions,
      input.owner,
      input.repo,
      input.prNumber,
    );

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
    const bareDir = await WorktreeService.ensureBareClone(
      this.basePath,
      repoName,
      input.repoUrl,
    );

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
      const valid = sessions.filter(
        (s) => !missing.some((m) => m.id === s.id),
      );
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
}
