import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { WorktreeSession } from "./types";

const WORKTREES_FILENAME = "worktrees.json";

export class WorktreeStore {
  static async load(configDir: string): Promise<WorktreeSession[]> {
    const filePath = path.join(configDir, WORKTREES_FILENAME);
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed as WorktreeSession[];
    } catch (err: unknown) {
      if (isNodeError(err) && err.code === "ENOENT") return [];
      throw err;
    }
  }

  static async save(configDir: string, sessions: WorktreeSession[]): Promise<void> {
    await mkdir(configDir, { recursive: true });
    const filePath = path.join(configDir, WORKTREES_FILENAME);
    await writeFile(filePath, JSON.stringify(sessions, null, 2), "utf-8");
  }

  static async add(configDir: string, session: WorktreeSession): Promise<WorktreeSession[]> {
    const sessions = await WorktreeStore.load(configDir);
    sessions.push(session);
    await WorktreeStore.save(configDir, sessions);
    return sessions;
  }

  static async remove(configDir: string, sessionId: string): Promise<WorktreeSession[]> {
    const sessions = await WorktreeStore.load(configDir);
    const updated = sessions.filter((s) => s.id !== sessionId);
    await WorktreeStore.save(configDir, updated);
    return updated;
  }

  static async updateLastActive(configDir: string, sessionId: string): Promise<void> {
    const sessions = await WorktreeStore.load(configDir);
    const session = sessions.find((s) => s.id === sessionId);
    if (session) {
      session.lastActive = new Date().toISOString();
      await WorktreeStore.save(configDir, sessions);
    }
  }

  static findByPR(
    sessions: WorktreeSession[],
    owner: string,
    repo: string,
    prNumber: number,
  ): WorktreeSession | undefined {
    const slug = `${owner}/${repo}`.toLowerCase();
    return sessions.find(
      (s) => s.repoSlug.toLowerCase() === slug && s.prNumber === prNumber,
    );
  }
}

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && "code" in err;
}
