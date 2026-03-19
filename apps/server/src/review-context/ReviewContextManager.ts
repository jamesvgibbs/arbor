import { ReviewContextService, type PRHeaderDetails } from "./ReviewContextService";

export interface ReviewContextInitInput {
  worktreePath: string;
  prNumber: number;
  prTitle: string;
  prAuthor: string;
  headBranch: string;
  baseBranch: string;
  diffStat: string;
  skipInit?: boolean;
}

export interface ReviewContextInitResult {
  claudeMdPath: string;
  existedAlready: boolean;
  ranInit: boolean;
}

/**
 * Public API for the ReviewContext bounded context.
 * Orchestrates detection, optional `claude /init`, and PR header scaffolding.
 */
export class ReviewContextManager {
  /**
   * Detect whether a CLAUDE.md already exists in a worktree.
   */
  async detect(worktreePath: string): Promise<{ exists: boolean; path: string | null }> {
    return ReviewContextService.detect(worktreePath);
  }

  /**
   * Full init flow:
   * 1. Detect existing CLAUDE.md → if found, return immediately (no modifications).
   * 2. If skipInit is true, write a PR-header-only CLAUDE.md.
   * 3. Otherwise run `claude /init`, then prepend the PR header to the generated file.
   */
  async init(input: ReviewContextInitInput): Promise<ReviewContextInitResult> {
    const detection = await ReviewContextService.detect(input.worktreePath);

    if (detection.exists) {
      return {
        claudeMdPath: detection.path!,
        existedAlready: true,
        ranInit: false,
      };
    }

    const details: PRHeaderDetails = {
      prNumber: input.prNumber,
      prTitle: input.prTitle,
      prAuthor: input.prAuthor,
      headBranch: input.headBranch,
      baseBranch: input.baseBranch,
      diffStat: input.diffStat,
    };

    if (input.skipInit) {
      const filePath = await ReviewContextService.writePRHeaderOnly(input.worktreePath, details);
      return {
        claudeMdPath: filePath,
        existedAlready: false,
        ranInit: false,
      };
    }

    // Run claude /init then prepend PR header
    const filePath = await ReviewContextService.runInit(input.worktreePath);
    await ReviewContextService.prependPRHeader(filePath, details);

    return {
      claudeMdPath: filePath,
      existedAlready: false,
      ranInit: true,
    };
  }
}
