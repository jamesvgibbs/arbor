import { WorkerPoolContextProvider, useWorkerPool } from "@pierre/diffs/react";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { Component, useEffect, useMemo, type ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";
import { resolveDiffThemeName, type DiffThemeName } from "../lib/diffRendering";

function DiffWorkerThemeSync({ themeName }: { themeName: DiffThemeName }) {
  const workerPool = useWorkerPool();

  useEffect(() => {
    if (!workerPool) {
      return;
    }

    const current = workerPool.getDiffRenderOptions();
    if (current.theme === themeName) {
      return;
    }

    void workerPool
      .setRenderOptions({
        ...current,
        theme: themeName,
      })
      .catch(() => undefined);
  }, [themeName, workerPool]);

  return null;
}

/**
 * Error boundary that catches WorkerPoolContextProvider failures and renders
 * children without the worker pool. This prevents the React tree from crashing
 * when web workers are unavailable (e.g. in browser test environments where
 * Vite's ?worker transform doesn't produce valid worker script URLs).
 */
class WorkerPoolErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  override componentDidCatch() {
    // Silently degrade — diffs will render without syntax highlighting.
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function DiffWorkerPoolProvider({ children }: { children?: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const diffThemeName = resolveDiffThemeName(resolvedTheme);
  const workerPoolSize = useMemo(() => {
    const cores =
      typeof navigator === "undefined" ? 4 : Math.max(1, navigator.hardwareConcurrency || 4);
    return Math.max(2, Math.min(6, Math.floor(cores / 2)));
  }, []);

  return (
    <WorkerPoolErrorBoundary fallback={<>{children}</>}>
      <WorkerPoolContextProvider
        poolOptions={{
          workerFactory: () => new DiffsWorker(),
          poolSize: workerPoolSize,
          totalASTLRUCacheSize: 240,
        }}
        highlighterOptions={{
          theme: diffThemeName,
          tokenizeMaxLineLength: 1_000,
        }}
      >
        <DiffWorkerThemeSync themeName={diffThemeName} />
        {children}
      </WorkerPoolContextProvider>
    </WorkerPoolErrorBoundary>
  );
}
