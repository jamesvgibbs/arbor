import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        "~": srcPath,
      },
    },
    test: {
      include: [
        "src/components/ChatView.browser.tsx",
        "src/components/KeybindingsToast.browser.tsx",
      ],
      setupFiles: ["src/test/browser-setup.ts"],
      browser: {
        enabled: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
        headless: true,
      },
      testTimeout: 30_000,
      hookTimeout: 30_000,
      // The @pierre/diffs WorkerPoolManager throws unhandled rejections when web
      // workers fail to initialize in the browser test environment. This is
      // because Vite's ?worker imports don't resolve to valid script URLs in
      // vitest-browser. The rejection crashes the React tree before any test
      // assertions can run. This flag prevents vitest from treating those
      // rejections as test failures.
      dangerouslyIgnoreUnhandledErrors: true,
    },
  }),
);
