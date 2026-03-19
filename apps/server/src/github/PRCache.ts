import type { PRCard, PRListResult } from "./types";

export class PRCache {
  private cache = new Map<string, PRListResult>();

  /**
   * Get a cached PR list for the given repo.
   * Returns null if no entry exists.
   */
  get(owner: string, repo: string): PRListResult | null {
    const key = cacheKey(owner, repo);
    return this.cache.get(key) ?? null;
  }

  /**
   * Store a PR list in the cache with the current timestamp.
   */
  set(owner: string, repo: string, prs: PRCard[]): void {
    const key = cacheKey(owner, repo);
    this.cache.set(key, {
      owner,
      repo,
      prs,
      fetchedAt: new Date().toISOString(),
    });
  }

  /**
   * Invalidate the cache entry for a specific repo.
   */
  invalidate(owner: string, repo: string): void {
    const key = cacheKey(owner, repo);
    this.cache.delete(key);
  }

  /**
   * Clear all cached entries.
   */
  invalidateAll(): void {
    this.cache.clear();
  }
}

function cacheKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
}
