import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const KEYCHAIN_SERVICE = "Arbor";
const KEYCHAIN_ACCOUNT = "github-token";

export class TokenStore {
  static async loadToken(_configDir: string): Promise<string | null> {
    if (process.platform === "darwin") {
      return TokenStore.keychainLoad();
    }
    // Fallback for non-macOS: use file-based storage
    return TokenStore.fileLoad(_configDir);
  }

  static async saveToken(_configDir: string, token: string): Promise<void> {
    if (process.platform === "darwin") {
      return TokenStore.keychainSave(token);
    }
    return TokenStore.fileSave(_configDir, token);
  }

  static async deleteToken(_configDir: string): Promise<void> {
    if (process.platform === "darwin") {
      return TokenStore.keychainDelete();
    }
    return TokenStore.fileDelete(_configDir);
  }

  // ── macOS Keychain ──────────────────────────────────────────────────

  private static async keychainLoad(): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
        "-w",
      ]);
      const trimmed = stdout.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      // Item not found returns exit code 44
      return null;
    }
  }

  private static async keychainSave(token: string): Promise<void> {
    // Delete existing entry first (security add-generic-password fails if it exists)
    await TokenStore.keychainDelete();

    await execFileAsync("security", [
      "add-generic-password",
      "-s",
      KEYCHAIN_SERVICE,
      "-a",
      KEYCHAIN_ACCOUNT,
      "-w",
      token,
    ]);
  }

  private static async keychainDelete(): Promise<void> {
    try {
      await execFileAsync("security", [
        "delete-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        KEYCHAIN_ACCOUNT,
      ]);
    } catch {
      // Not found — no-op
    }
  }

  // ── File fallback (Linux / Windows) ─────────────────────────────────

  private static async fileLoad(configDir: string): Promise<string | null> {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    try {
      const raw = await readFile(
        path.join(configDir, "github-token"),
        "utf-8",
      );
      const trimmed = raw.trim();
      return trimmed.length > 0 ? trimmed : null;
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw err;
    }
  }

  private static async fileSave(configDir: string, token: string): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const path = await import("node:path");
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, "github-token"), token, {
      encoding: "utf-8",
      mode: 0o600,
    });
  }

  private static async fileDelete(configDir: string): Promise<void> {
    const { unlink } = await import("node:fs/promises");
    const path = await import("node:path");
    try {
      await unlink(path.join(configDir, "github-token"));
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw err;
    }
  }
}
