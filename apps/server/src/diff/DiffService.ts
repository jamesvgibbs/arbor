import { exec } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type {
  DiffGetChangedFilesResult,
  DiffGetFileContentResult,
  DiffGetLocalDiffResult,
  PRChangedFile,
} from "@arbortools/contracts";
import type { GitHubManager } from "../github/GitHubManager";

const execAsync = promisify(exec);

export class DiffService {
  constructor(private readonly githubManager: GitHubManager) {}

  async getChangedFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<DiffGetChangedFilesResult> {
    const rawFiles = await this.githubManager.listPRFiles(owner, repo, prNumber);

    let totalAdditions = 0;
    let totalDeletions = 0;
    const files: PRChangedFile[] = [];

    for (const file of rawFiles) {
      totalAdditions += file.additions;
      totalDeletions += file.deletions;
      files.push({
        filename: file.filename,
        status: normalizeFileStatus(file.status),
        additions: file.additions,
        deletions: file.deletions,
        ...(file.previous_filename ? { previousFilename: file.previous_filename } : {}),
      });
    }

    return { files, totalAdditions, totalDeletions };
  }

  async getLocalDiff(
    worktreePath: string,
    baseBranch: string,
    filename?: string,
  ): Promise<DiffGetLocalDiffResult> {
    const mergeBase = await this.getMergeBase(worktreePath, baseBranch);
    const args = ["git", "diff", `${mergeBase}...HEAD`];
    if (filename) {
      args.push("--", filename);
    }

    const { stdout } = await execAsync(args.join(" "), {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024,
    });

    return { diff: stdout };
  }

  async getFileContent(
    worktreePath: string,
    baseBranch: string,
    filename: string,
  ): Promise<DiffGetFileContentResult> {
    const mergeBase = await this.getMergeBase(worktreePath, baseBranch);

    let oldContent = "";
    try {
      const { stdout } = await execAsync(`git show ${mergeBase}:${filename}`, {
        cwd: worktreePath,
        maxBuffer: 10 * 1024 * 1024,
      });
      oldContent = stdout;
    } catch {
      // New file — old content is empty
    }

    let newContent = "";
    try {
      newContent = await readFile(join(worktreePath, filename), "utf-8");
    } catch {
      // Deleted file — new content is empty
    }

    return { oldContent, newContent };
  }

  private async getMergeBase(worktreePath: string, baseBranch: string): Promise<string> {
    try {
      await execAsync("git fetch origin --no-tags --quiet", {
        cwd: worktreePath,
        timeout: 15_000,
      });
    } catch {
      // Best effort - may fail offline or if remote doesn't exist
    }

    // Try origin/<branch> first, fall back to local <branch> if the
    // remote-tracking ref doesn't exist (e.g. bare-clone worktrees).
    for (const ref of [`origin/${baseBranch}`, baseBranch]) {
      try {
        const { stdout } = await execAsync(`git merge-base HEAD ${ref}`, { cwd: worktreePath });
        return stdout.trim();
      } catch {
        continue;
      }
    }

    throw new Error(
      `Could not find merge base: neither origin/${baseBranch} nor ${baseBranch} is reachable from HEAD`,
    );
  }
}

function normalizeFileStatus(status: string): PRChangedFile["status"] {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "removed";
    case "modified":
      return "modified";
    case "renamed":
      return "renamed";
    case "copied":
      return "copied";
    case "changed":
      return "changed";
    default:
      return "unchanged";
  }
}
