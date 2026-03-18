import type { GitHubPRReviewComment } from "@arbortools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { githubReviewCommentsQueryOptions } from "../lib/githubReactQuery";

export function useGitHubComments(owner: string, repo: string, prNumber: number) {
  const query = useQuery(
    githubReviewCommentsQueryOptions(owner && repo && prNumber ? { owner, repo, prNumber } : null),
  );

  const getCommentsForFile = useCallback(
    (path: string): GitHubPRReviewComment[] =>
      query.data?.comments.filter((c) => c.path === path) ?? [],
    [query.data],
  );

  return {
    comments: query.data?.comments ?? [],
    getCommentsForFile,
    refetch: query.refetch,
    isLoading: query.isLoading,
  };
}
