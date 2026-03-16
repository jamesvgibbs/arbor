import type {
  PRCard,
  PRDetails,
  GitHubRateLimitInfo,
} from "./types";

const GITHUB_API_BASE = "https://api.github.com";

export class GitHubApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimit: GitHubRateLimitInfo | null,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

export class GitHubService {
  private readonly headers: Record<string, string>;

  constructor(token: string) {
    this.headers = {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * List open pull requests for a repository, sorted by most recently updated.
   */
  async listOpenPRs(owner: string, repo: string): Promise<PRCard[]> {
    const prsData = await this.get<GitHubPullResponse[]>(
      `/repos/${owner}/${repo}/pulls?state=open&sort=updated&direction=desc`,
    );

    if (prsData.length === 0) {
      return [];
    }

    // Batch-fetch CI statuses for all head SHAs in parallel
    const headShas = prsData.map((pr) => pr.head.sha);
    const uniqueShas = [...new Set(headShas)];
    const statusMap = new Map<string, CIStatus>();

    const statusPromises = uniqueShas.map(async (sha) => {
      try {
        const combined = await this.get<CombinedStatusResponse>(
          `/repos/${owner}/${repo}/commits/${sha}/status`,
        );
        statusMap.set(sha, mapCIState(combined.state));
      } catch {
        statusMap.set(sha, "unknown");
      }
    });

    // Fetch reviews for all PRs in parallel
    const reviewMap = new Map<number, ReviewStatus>();

    const reviewPromises = prsData.map(async (pr) => {
      try {
        const reviews = await this.get<GitHubReviewResponse[]>(
          `/repos/${owner}/${repo}/pulls/${pr.number}/reviews`,
        );
        reviewMap.set(pr.number, deriveReviewStatus(reviews, pr));
      } catch {
        reviewMap.set(pr.number, "unknown");
      }
    });

    await Promise.all([...statusPromises, ...reviewPromises]);

    return prsData.map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      authorAvatarUrl: pr.user.avatar_url,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      ciStatus: statusMap.get(pr.head.sha) ?? "unknown",
      reviewStatus: reviewMap.get(pr.number) ?? "unknown",
      isDraft: pr.draft,
    }));
  }

  /**
   * Get full details for a single pull request including diff statistics.
   */
  async getPRDetails(
    owner: string,
    repo: string,
    number: number,
  ): Promise<PRDetails> {
    const [pr, reviews] = await Promise.all([
      this.get<GitHubPullResponse>(
        `/repos/${owner}/${repo}/pulls/${number}`,
      ),
      this.get<GitHubReviewResponse[]>(
        `/repos/${owner}/${repo}/pulls/${number}/reviews`,
      ),
    ]);

    // Fetch combined status now that we have the head SHA
    let ciStatus: CIStatus = "unknown";
    try {
      const status = await this.get<CombinedStatusResponse>(
        `/repos/${owner}/${repo}/commits/${pr.head.sha}/status`,
      );
      ciStatus = mapCIState(status.state);
    } catch {
      // leave as unknown
    }

    const additions = pr.additions ?? 0;
    const deletions = pr.deletions ?? 0;
    const changedFiles = pr.changed_files ?? 0;

    return {
      number: pr.number,
      title: pr.title,
      author: pr.user.login,
      authorAvatarUrl: pr.user.avatar_url,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      ciStatus,
      reviewStatus: deriveReviewStatus(reviews, pr),
      isDraft: pr.draft,
      body: pr.body ?? "",
      diffStat: `+${additions} -${deletions} in ${changedFiles} files`,
      additions,
      deletions,
      changedFiles,
    };
  }

  /**
   * List files changed in a pull request, handling pagination.
   */
  async listPRFiles(
    owner: string,
    repo: string,
    prNumber: number,
  ): Promise<GitHubPRFileResponse[]> {
    const perPage = 100;
    let page = 1;
    const allFiles: GitHubPRFileResponse[] = [];

    while (true) {
      const batch = await this.get<GitHubPRFileResponse[]>(
        `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=${perPage}&page=${page}`,
      );

      allFiles.push(...batch);

      if (batch.length < perPage) break;
      page++;
    }

    return allFiles;
  }

  /**
   * Submit a review on a pull request, optionally with inline comments.
   */
  async submitReview(
    owner: string,
    repo: string,
    prNumber: number,
    body: string,
    event: "APPROVE" | "COMMENT" | "REQUEST_CHANGES",
    comments?: Array<{
      path: string;
      body: string;
      line: number;
      side: "LEFT" | "RIGHT";
      start_line?: number;
      start_side?: "LEFT" | "RIGHT";
    }>,
  ): Promise<void> {
    const payload: Record<string, unknown> = { body, event };
    if (comments && comments.length > 0) {
      payload.comments = comments;
    }
    await this.post(
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      payload,
    );
  }

  /**
   * Perform a GET request against the GitHub API.
   */
  private async get<T>(path: string): Promise<T> {
    const url = `${GITHUB_API_BASE}${path}`;
    const res = await fetch(url, { headers: this.headers });

    const rateLimit = extractRateLimit(res);

    if (!res.ok) {
      const text = await res.text();
      throw new GitHubApiError(
        `GitHub API error: ${res.status} ${res.statusText} - ${text}`,
        res.status,
        rateLimit,
      );
    }

    return (await res.json()) as T;
  }

  /**
   * Perform a POST request against the GitHub API.
   */
  private async post<T = unknown>(path: string, data: unknown): Promise<T> {
    const url = `${GITHUB_API_BASE}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const rateLimit = extractRateLimit(res);

    if (!res.ok) {
      const text = await res.text();
      throw new GitHubApiError(
        `GitHub API error: ${res.status} ${res.statusText} - ${text}`,
        res.status,
        rateLimit,
      );
    }

    return (await res.json()) as T;
  }
}

// ---------------------------------------------------------------------------
// Internal types for GitHub API responses
// ---------------------------------------------------------------------------

type CIStatus = PRCard["ciStatus"];
type ReviewStatus = PRCard["reviewStatus"];

export interface GitHubPRFileResponse {
  sha: string;
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previous_filename?: string;
}

interface GitHubPullResponse {
  number: number;
  title: string;
  body: string | null;
  draft: boolean;
  state: string;
  created_at: string;
  updated_at: string;
  additions?: number;
  deletions?: number;
  changed_files?: number;
  requested_reviewers: { login: string }[];
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
  };
}

interface CombinedStatusResponse {
  state: "success" | "failure" | "pending";
  total_count: number;
}

interface GitHubReviewResponse {
  state: string;
  user: { login: string };
  submitted_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapCIState(state: CombinedStatusResponse["state"]): CIStatus {
  switch (state) {
    case "success":
      return "success";
    case "failure":
      return "failure";
    case "pending":
      return "pending";
    default:
      return "unknown";
  }
}

/**
 * Derive the overall review status from the list of reviews.
 * Takes the most recent review from each reviewer and determines the aggregate.
 */
function deriveReviewStatus(
  reviews: GitHubReviewResponse[],
  pr: GitHubPullResponse,
): ReviewStatus {
  if (reviews.length === 0) {
    return pr.requested_reviewers.length > 0 ? "review_required" : "unknown";
  }

  // Get the latest review per reviewer
  const latestByReviewer = new Map<string, GitHubReviewResponse>();
  for (const review of reviews) {
    const existing = latestByReviewer.get(review.user.login);
    if (
      !existing ||
      new Date(review.submitted_at) > new Date(existing.submitted_at)
    ) {
      latestByReviewer.set(review.user.login, review);
    }
  }

  const states = [...latestByReviewer.values()].map((r) => r.state);

  if (states.some((s) => s === "CHANGES_REQUESTED")) {
    return "changes_requested";
  }

  if (states.some((s) => s === "APPROVED")) {
    return "approved";
  }

  if (pr.requested_reviewers.length > 0) {
    return "review_required";
  }

  return "unknown";
}

function extractRateLimit(res: Response): GitHubRateLimitInfo | null {
  const remaining = res.headers.get("x-ratelimit-remaining");
  const limit = res.headers.get("x-ratelimit-limit");
  const reset = res.headers.get("x-ratelimit-reset");

  if (remaining === null || limit === null || reset === null) {
    return null;
  }

  return {
    remaining: parseInt(remaining, 10),
    limit: parseInt(limit, 10),
    resetAt: new Date(parseInt(reset, 10) * 1000).toISOString(),
  };
}
