import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const LOG_DIR = path.join(os.homedir(), "Library", "Logs", "Arbor");
const LOG_FILE = "cleanup.log";

export async function logCleanup(
  action: "auto_removed" | "approved_offered",
  repoSlug: string,
  prNumber: number,
  reason: string,
): Promise<void> {
  try {
    await mkdir(LOG_DIR, { recursive: true });
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] ${action} | ${repoSlug}#${prNumber} | ${reason}\n`;
    await appendFile(path.join(LOG_DIR, LOG_FILE), line, "utf-8");
  } catch {
    // Best-effort logging — never block the main flow
  }
}
