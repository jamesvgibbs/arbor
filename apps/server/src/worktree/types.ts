export interface WorktreeSession {
  id: string;
  repoSlug: string; // owner/repo
  prNumber: number;
  prTitle: string;
  branchName: string;
  baseBranch: string;
  worktreePath: string;
  createdAt: string; // ISO 8601
  lastActive: string; // ISO 8601
}

export interface WorktreeCreateInput {
  owner: string;
  repo: string;
  prNumber: number;
  prTitle: string;
  branchName: string;
  baseBranch: string;
  repoUrl: string;
}

export interface WorktreeCreateResult {
  session: WorktreeSession;
  alreadyExisted: boolean;
}

export interface WorktreeListResult {
  sessions: Array<WorktreeSession & { diskSizeMB: number }>;
}

export interface WorktreeRemoveResult {
  removed: boolean;
  id: string;
}
