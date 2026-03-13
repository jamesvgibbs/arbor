import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { RepoConfig } from "./types";

const REPOS_FILENAME = "repos.json";

export class RepoStore {
  /**
   * Load the list of configured repos from disk.
   * Returns an empty array if the file does not exist.
   */
  static async loadRepos(configDir: string): Promise<RepoConfig[]> {
    const filePath = path.join(configDir, REPOS_FILENAME);
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as RepoConfig[];
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  /**
   * Persist the repo list to disk, creating the directory if needed.
   */
  static async saveRepos(
    configDir: string,
    repos: RepoConfig[],
  ): Promise<void> {
    await mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, REPOS_FILENAME);
    await writeFile(filePath, JSON.stringify(repos, null, 2), "utf-8");
  }

  /**
   * Add a repo to the list. No-op if the repo already exists.
   * Returns the updated list.
   */
  static async addRepo(
    configDir: string,
    owner: string,
    repo: string,
  ): Promise<RepoConfig[]> {
    const repos = await RepoStore.loadRepos(configDir);

    const exists = repos.some(
      (r) =>
        r.owner.toLowerCase() === owner.toLowerCase() &&
        r.repo.toLowerCase() === repo.toLowerCase(),
    );

    if (exists) {
      return repos;
    }

    const updated = [
      ...repos,
      { owner, repo, addedAt: new Date().toISOString() },
    ];
    await RepoStore.saveRepos(configDir, updated);
    return updated;
  }

  /**
   * Remove a repo from the list.
   * Returns the updated list.
   */
  static async removeRepo(
    configDir: string,
    owner: string,
    repo: string,
  ): Promise<RepoConfig[]> {
    const repos = await RepoStore.loadRepos(configDir);

    const updated = repos.filter(
      (r) =>
        !(
          r.owner.toLowerCase() === owner.toLowerCase() &&
          r.repo.toLowerCase() === repo.toLowerCase()
        ),
    );

    await RepoStore.saveRepos(configDir, updated);
    return updated;
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
