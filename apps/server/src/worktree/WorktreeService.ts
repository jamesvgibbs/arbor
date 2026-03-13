import { execFile } from "node:child_process";
import { stat, access, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 120_000; // 2 min for clone operations

/**
 * Low-level git operations for worktree lifecycle.
 * Uses child_process to invoke git directly (no simple-git dependency).
 */
export class WorktreeService {
  /**
   * Ensure a bare clone exists for the given repo. If not, performs a full
   * bare clone. Shallow clones are explicitly prohibited per PRD.
   *
   * @returns The path to the bare clone directory.
   */
  static async ensureBareClone(
    basePath: string,
    repoName: string,
    repoUrl: string,
  ): Promise<string> {
    const bareDir = path.join(basePath, repoName, "_base");

    try {
      await access(bareDir);
      // Bare clone exists — fetch latest
      await execFileAsync("git", ["fetch", "--all"], {
        cwd: bareDir,
        timeout: GIT_TIMEOUT_MS,
      });
      return bareDir;
    } catch {
      // Directory doesn't exist — clone
      const { mkdirSync } = await import("node:fs");
      mkdirSync(path.dirname(bareDir), { recursive: true });

      await execFileAsync(
        "git",
        ["clone", "--bare", repoUrl, bareDir],
        { timeout: GIT_TIMEOUT_MS },
      );
      return bareDir;
    }
  }

  /**
   * Create a git worktree from a bare clone.
   * Fetches the branch first to ensure it's up-to-date.
   */
  static async createWorktree(
    bareDir: string,
    worktreePath: string,
    branch: string,
  ): Promise<void> {
    // Fetch the specific branch
    await execFileAsync(
      "git",
      ["fetch", "origin", `${branch}:${branch}`],
      { cwd: bareDir, timeout: GIT_TIMEOUT_MS },
    ).catch(() => {
      // Branch may already be up to date or use different ref format
      // Try fetching all as fallback
      return execFileAsync("git", ["fetch", "--all"], {
        cwd: bareDir,
        timeout: GIT_TIMEOUT_MS,
      });
    });

    // Create the worktree
    await execFileAsync(
      "git",
      ["worktree", "add", worktreePath, branch],
      { cwd: bareDir, timeout: 30_000 },
    );
  }

  /**
   * Remove a git worktree and clean it from the bare clone's worktree list.
   */
  static async removeWorktree(
    bareDir: string,
    worktreePath: string,
  ): Promise<void> {
    try {
      await execFileAsync(
        "git",
        ["worktree", "remove", "--force", worktreePath],
        { cwd: bareDir, timeout: 15_000 },
      );
    } catch {
      // Worktree may have already been removed or path may not exist.
      // Try pruning stale worktree entries.
      await execFileAsync(
        "git",
        ["worktree", "prune"],
        { cwd: bareDir, timeout: 15_000 },
      ).catch(() => {});
    }
  }

  /**
   * Get disk size of a worktree directory in MB.
   */
  static async getDiskSize(worktreePath: string): Promise<number> {
    try {
      const { stdout } = await execFileAsync("du", ["-sm", worktreePath], {
        timeout: 10_000,
      });
      const sizeStr = stdout.trim().split("\t")[0];
      return parseInt(sizeStr ?? "0", 10);
    } catch {
      return 0;
    }
  }

  /**
   * Check if a worktree directory exists on disk.
   */
  static async worktreeExists(worktreePath: string): Promise<boolean> {
    try {
      const s = await stat(worktreePath);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Derive the bare clone directory path for a given repo.
   */
  static bareClonePath(basePath: string, repoName: string): string {
    return path.join(basePath, repoName, "_base");
  }

  /**
   * Generate a sanitized worktree path for a PR.
   */
  static worktreePath(
    basePath: string,
    repoName: string,
    prNumber: number,
    branchName: string,
  ): string {
    const slug = branchName
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 50);
    return path.join(basePath, repoName, `pr-${prNumber}-${slug}`);
  }
}
