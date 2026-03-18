// Suppress unhandled rejections from @pierre/diffs WorkerPoolManager.
// In the browser test environment (vitest-browser + Playwright), web workers
// from the Vite ?worker transform fail to load because the worker script URL
// is not served by the test server. The WorkerPoolManager throws an async
// error when initialization fails. This handler prevents vitest from treating
// it as a test failure.
//
// We patch the global Promise to intercept rejections before Vite's HMR
// client or vitest's error handler can capture them.
const OriginalPromise = window.Promise;
const origThen = OriginalPromise.prototype.then;

// Use a capturing event listener (fires before other listeners)
window.addEventListener(
  "unhandledrejection",
  (event) => {
    if (event.reason instanceof Error && event.reason.message.includes("WorkerPoolManager")) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  },
  true,
);
