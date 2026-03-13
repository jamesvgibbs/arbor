import { execFile } from "node:child_process";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const INIT_TIMEOUT_MS = 60_000; // 1 min for claude /init

export interface PRHeaderDetails {
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  headBranch: string;
  baseBranch: string;
  diffStat: string;
}

/**
 * Low-level operations for CLAUDE.md detection, generation, and PR header scaffolding.
 */
export class ReviewContextService {
  /**
   * Check whether a CLAUDE.md file exists in the worktree root.
   */
  static async detect(
    worktreePath: string,
  ): Promise<{ exists: boolean; path: string | null }> {
    const filePath = path.join(worktreePath, "CLAUDE.md");
    try {
      await access(filePath);
      return { exists: true, path: filePath };
    } catch {
      return { exists: false, path: null };
    }
  }

  /**
   * Run `claude /init` in the given worktree directory to generate a
   * repo-aware CLAUDE.md.
   *
   * @returns The absolute path to the generated CLAUDE.md.
   */
  static async runInit(worktreePath: string): Promise<string> {
    await execFileAsync("claude", ["/init"], {
      cwd: worktreePath,
      timeout: INIT_TIMEOUT_MS,
    });
    return path.join(worktreePath, "CLAUDE.md");
  }

  /**
   * Read an existing CLAUDE.md and prepend the PR-specific header block
   * at the top of the file.
   */
  static async prependPRHeader(
    filePath: string,
    details: PRHeaderDetails,
  ): Promise<void> {
    const existing = await readFile(filePath, "utf-8");
    const header = ReviewContextService.buildPRHeader(details);
    await writeFile(filePath, header + "\n" + existing, "utf-8");
  }

  /**
   * Write a minimal CLAUDE.md containing only the PR header block.
   * Used when `claude /init` is skipped.
   */
  static async writePRHeaderOnly(
    worktreePath: string,
    details: PRHeaderDetails,
  ): Promise<string> {
    const filePath = path.join(worktreePath, "CLAUDE.md");
    const header = ReviewContextService.buildPRHeader(details);
    await writeFile(filePath, header + "\n", "utf-8");
    return filePath;
  }

  /**
   * Build the PR header markdown block.
   */
  static buildPRHeader(details: PRHeaderDetails): string {
    const date = new Date().toISOString().split("T")[0];
    return [
      "<!-- Arbor Review Context — do not commit -->",
      `# PR Review Session: #${details.prNumber} — ${details.prTitle}`,
      `**Author**: ${details.prAuthor} | **Branch**: ${details.headBranch} → ${details.baseBranch} | **Review started**: ${date}`,
      "",
      "## What Changed",
      details.diffStat,
      "---",
    ].join("\n");
  }
}
