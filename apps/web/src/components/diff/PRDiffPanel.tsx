import { parsePatchFiles } from "@pierre/diffs";
import { FileDiff, Virtualizer } from "@pierre/diffs/react";
import { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme";
import { buildPatchCacheKey, resolveDiffThemeName } from "../../lib/diffRendering";
type DiffThemeType = "light" | "dark";

const DIFF_PANEL_CSS = `
[data-diffs-header],
[data-diff],
[data-file],
[data-error-wrapper],
[data-virtualizer-buffer] {
  --diffs-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-light-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-dark-bg: color-mix(in srgb, var(--card) 90%, var(--background)) !important;
  --diffs-token-light-bg: transparent;
  --diffs-token-dark-bg: transparent;

  --diffs-bg-context-override: color-mix(in srgb, var(--background) 97%, var(--foreground));
  --diffs-bg-hover-override: color-mix(in srgb, var(--background) 94%, var(--foreground));
  --diffs-bg-separator-override: color-mix(in srgb, var(--background) 95%, var(--foreground));
  --diffs-bg-buffer-override: color-mix(in srgb, var(--background) 90%, var(--foreground));

  --diffs-bg-addition-override: color-mix(in srgb, var(--background) 92%, var(--success));
  --diffs-bg-addition-number-override: color-mix(in srgb, var(--background) 88%, var(--success));
  --diffs-bg-addition-hover-override: color-mix(in srgb, var(--background) 85%, var(--success));
  --diffs-bg-addition-emphasis-override: color-mix(in srgb, var(--background) 80%, var(--success));

  --diffs-bg-deletion-override: color-mix(in srgb, var(--background) 92%, var(--destructive));
  --diffs-bg-deletion-number-override: color-mix(in srgb, var(--background) 88%, var(--destructive));
  --diffs-bg-deletion-hover-override: color-mix(in srgb, var(--background) 85%, var(--destructive));
  --diffs-bg-deletion-emphasis-override: color-mix(
    in srgb,
    var(--background) 80%,
    var(--destructive)
  );

  background-color: var(--diffs-bg) !important;
}

[data-file-info] {
  background-color: color-mix(in srgb, var(--card) 94%, var(--foreground)) !important;
  border-block-color: var(--border) !important;
  color: var(--foreground) !important;
}
`;

interface PRDiffPanelProps {
  filename: string | null;
  additions: number;
  deletions: number;
  diff: string | undefined;
  isLoading: boolean;
  error: string | null;
}

export function PRDiffPanel({
  filename,
  additions,
  deletions,
  diff,
  isLoading,
  error,
}: PRDiffPanelProps) {
  const { resolvedTheme } = useTheme();

  const renderableFiles = useMemo(() => {
    if (!diff || diff.trim().length === 0) return [];
    try {
      const parsed = parsePatchFiles(
        diff,
        buildPatchCacheKey(diff, `pr-diff:${resolvedTheme}`),
      );
      return parsed.flatMap((p) => p.files);
    } catch {
      return [];
    }
  }, [diff, resolvedTheme]);

  if (!filename) {
    return (
      <div className="flex h-full flex-1 items-center justify-center px-5 text-center text-xs text-muted-foreground/70">
        Select a file to view its diff.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="min-h-0 flex-1 overflow-hidden">
        {isLoading && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">
            Loading diff...
          </div>
        )}
        {error && !isLoading && (
          <div className="px-4 py-3">
            <p className="text-[11px] text-red-500/80">{error}</p>
          </div>
        )}
        {!isLoading && !error && renderableFiles.length === 0 && diff !== undefined && (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground/70">
            {diff.trim().length === 0
              ? "No changes in this file."
              : "Unable to render diff."}
          </div>
        )}
        {!isLoading && renderableFiles.length > 0 && (
          <Virtualizer
            className="h-full min-h-0 overflow-auto px-2 pb-2"
            config={{ overscrollSize: 600, intersectionObserverMargin: 1200 }}
          >
            {renderableFiles.map((fileDiff) => {
              const key = fileDiff.cacheKey ?? `${fileDiff.prevName ?? "none"}:${fileDiff.name}`;
              return (
                <div key={`${key}:${resolvedTheme}`} className="mb-2 rounded-md first:mt-2 last:mb-0">
                  <FileDiff
                    fileDiff={fileDiff}
                    options={{
                      diffStyle: "unified",
                      lineDiffType: "none",
                      theme: resolveDiffThemeName(resolvedTheme),
                      themeType: resolvedTheme as DiffThemeType,
                      unsafeCSS: DIFF_PANEL_CSS,
                    }}
                  />
                </div>
              );
            })}
          </Virtualizer>
        )}
      </div>
    </div>
  );
}
