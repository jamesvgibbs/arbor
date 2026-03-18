import type { GitBranch } from "@arbortools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { gitBranchesQueryOptions } from "../lib/gitReactQuery";
import { dedupeRemoteBranchesWithLocalMatches } from "./BranchToolbar.logic";
import { Dialog, DialogPopup, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "./ui/combobox";
import { Button } from "./ui/button";
import { ChevronDownIcon, GitForkIcon } from "lucide-react";

export interface ThoughtRepoOption {
  slug: string;
  projectId: string;
  projectCwd: string;
}

interface ThoughtBranchPickerProps {
  repos: ThoughtRepoOption[];
  initialRepoSlug?: string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (repo: ThoughtRepoOption, baseBranch: string) => void;
}

export function ThoughtBranchPicker({
  repos,
  initialRepoSlug,
  open,
  onOpenChange,
  onConfirm,
}: ThoughtBranchPickerProps) {
  const [selectedRepoSlug, setSelectedRepoSlug] = useState<string | null>(null);
  const [isRepoMenuOpen, setIsRepoMenuOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const deferredBranchQuery = useDeferredValue(branchQuery);
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);

  const activeRepo = repos.find((r) => r.slug === selectedRepoSlug) ?? null;
  const activeProjectCwd = activeRepo?.projectCwd ?? "";

  const branchesQuery = useQuery({
    ...gitBranchesQueryOptions(activeProjectCwd),
    enabled: open && activeProjectCwd.length > 0,
  });
  const branches = useMemo(
    () => dedupeRemoteBranchesWithLocalMatches(branchesQuery.data?.branches ?? []),
    [branchesQuery.data?.branches],
  );
  const branchNames = useMemo(() => branches.map((b) => b.name), [branches]);
  const branchByName = useMemo(
    () => new Map(branches.map((b) => [b.name, b] as const)),
    [branches],
  );

  const normalizedQuery = deferredBranchQuery.trim().toLowerCase();
  const filteredBranchNames = useMemo(
    () =>
      normalizedQuery.length === 0
        ? branchNames
        : branchNames.filter((name) => name.toLowerCase().includes(normalizedQuery)),
    [branchNames, normalizedQuery],
  );

  const shouldVirtualize = filteredBranchNames.length > 40;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer({
    count: filteredBranchNames.length,
    estimateSize: () => 28,
    getScrollElement: () => scrollRef.current,
    overscan: 12,
    enabled: isBranchMenuOpen && shouldVirtualize,
    initialRect: { height: 224, width: 0 },
  });
  const virtualRows = virtualizer.getVirtualItems();
  const setListRef = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = (element?.parentElement as HTMLDivElement | null) ?? null;
      if (element) virtualizer.measure();
    },
    [virtualizer],
  );

  useEffect(() => {
    if (!isBranchMenuOpen || !shouldVirtualize) return;
    queueMicrotask(() => virtualizer.measure());
  }, [virtualizer, filteredBranchNames.length, isBranchMenuOpen, shouldVirtualize]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setSelectedRepoSlug(null);
      setSelectedBranch(null);
      setBranchQuery("");
      return;
    }
    // Pre-select repo if provided
    if (!selectedRepoSlug) {
      if (initialRepoSlug && repos.some((r) => r.slug === initialRepoSlug)) {
        setSelectedRepoSlug(initialRepoSlug);
      } else if (repos.length === 1) {
        setSelectedRepoSlug(repos[0]!.slug);
      }
    }
  }, [open, initialRepoSlug, repos, selectedRepoSlug]);

  // Clear branch when repo changes and auto-select default branch when branches load.
  // Combined into a single effect to avoid a race condition where the "clear" effect
  // runs after the "auto-select" effect, causing the default branch to never be set.
  const prevRepoSlug = useRef(selectedRepoSlug);
  useEffect(() => {
    if (!open || !selectedRepoSlug) return;

    const repoJustChanged = prevRepoSlug.current !== selectedRepoSlug;
    if (repoJustChanged) {
      prevRepoSlug.current = selectedRepoSlug;
      setBranchQuery("");
    }

    // When repo changes, pick the default branch (or clear if branches aren't loaded yet).
    // When branches load later (and no branch is selected), also pick the default.
    if (repoJustChanged || (!selectedBranch && branches.length > 0)) {
      const defaultBranch =
        branches.length > 0
          ? (branches.find((b) => b.isDefault) ??
            branches.find((b) => b.name === "main") ??
            branches.find((b) => b.name === "master") ??
            branches.find((b) => b.current))
          : undefined;
      setSelectedBranch(defaultBranch?.name ?? null);
    }
  }, [open, selectedRepoSlug, branches, selectedBranch]);

  const handleConfirm = () => {
    if (activeRepo && selectedBranch) {
      onConfirm(activeRepo, selectedBranch);
      onOpenChange(false);
    }
  };

  const repoSlugItems = useMemo(() => repos.map((r) => r.slug), [repos]);

  function renderBranchItem(itemValue: string, index: number, style?: React.CSSProperties) {
    const branch = branchByName.get(itemValue);
    if (!branch) return null;
    const badge = branch.current
      ? "current"
      : branch.isRemote
        ? "remote"
        : branch.isDefault
          ? "default"
          : null;
    return (
      <ComboboxItem
        hideIndicator
        key={itemValue}
        index={index}
        value={itemValue}
        className={itemValue === selectedBranch ? "bg-accent text-foreground" : undefined}
        style={style}
        onClick={() => {
          setSelectedBranch(branch.isRemote ? branch.name.replace(/^[^/]+\//, "") : branch.name);
          setIsBranchMenuOpen(false);
        }}
      >
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate">{itemValue}</span>
          {badge && <span className="shrink-0 text-[10px] text-muted-foreground/45">{badge}</span>}
        </div>
      </ComboboxItem>
    );
  }

  function formatRepoLabel(slug: string) {
    const idx = slug.indexOf("/");
    if (idx < 0) return slug;
    return slug;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup showCloseButton>
        <DialogHeader>
          <DialogTitle>New Thought Exercise</DialogTitle>
          <DialogDescription>
            Choose a repository and base branch. A worktree will be created for exploration.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 pb-6">
          {/* Repository picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Repository</label>
            <Combobox
              items={repoSlugItems}
              filteredItems={repoSlugItems}
              onOpenChange={setIsRepoMenuOpen}
              open={isRepoMenuOpen}
              value={selectedRepoSlug}
            >
              <ComboboxTrigger
                render={<Button variant="outline" size="sm" className="w-full justify-between" />}
              >
                <span className="flex items-center gap-2 truncate">
                  <GitForkIcon className="size-3.5 shrink-0 text-muted-foreground/50" />
                  {selectedRepoSlug ? formatRepoLabel(selectedRepoSlug) : "Select repository..."}
                </span>
                <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
              </ComboboxTrigger>
              {repos.length > 0 && (
                <ComboboxPopup align="start" side="bottom" className="w-[var(--anchor-width)]">
                  <ComboboxList className="max-h-56">
                    {repos.map((repo, index) => (
                      <ComboboxItem
                        hideIndicator
                        key={repo.slug}
                        index={index}
                        value={repo.slug}
                        className={
                          repo.slug === selectedRepoSlug ? "bg-accent text-foreground" : undefined
                        }
                        onClick={() => {
                          setSelectedRepoSlug(repo.slug);
                          setIsRepoMenuOpen(false);
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <GitForkIcon className="size-3 shrink-0 text-muted-foreground/50" />
                          <span className="truncate">{formatRepoLabel(repo.slug)}</span>
                        </div>
                      </ComboboxItem>
                    ))}
                  </ComboboxList>
                </ComboboxPopup>
              )}
            </Combobox>
          </div>

          {/* Branch picker */}
          {activeRepo && !activeRepo.projectCwd && (
            <p className="text-xs text-muted-foreground/60">
              This repository hasn't been used yet. Start a PR review first to clone it locally.
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Base branch</label>
            <Combobox
              items={branchNames}
              filteredItems={filteredBranchNames}
              autoHighlight
              virtualized={shouldVirtualize}
              onItemHighlighted={(_value, eventDetails) => {
                if (!isBranchMenuOpen || eventDetails.index < 0) return;
                virtualizer.scrollToIndex(eventDetails.index, { align: "auto" });
              }}
              onOpenChange={setIsBranchMenuOpen}
              open={isBranchMenuOpen}
              value={selectedBranch}
            >
              <ComboboxTrigger
                render={<Button variant="outline" size="sm" className="w-full justify-between" />}
                disabled={!selectedRepoSlug || (branchesQuery.isLoading && branches.length === 0)}
              >
                <span className="truncate">{selectedBranch ?? "Select branch..."}</span>
                <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
              </ComboboxTrigger>
              <ComboboxPopup align="start" side="bottom" className="w-[var(--anchor-width)]">
                <div className="border-b p-1">
                  <ComboboxInput
                    className="[&_input]:font-sans rounded-md"
                    inputClassName="ring-0"
                    placeholder="Search branches..."
                    showTrigger={false}
                    size="sm"
                    value={branchQuery}
                    onChange={(event) => setBranchQuery(event.target.value)}
                  />
                </div>
                <ComboboxEmpty>No branches found.</ComboboxEmpty>
                <ComboboxList ref={setListRef} className="max-h-56">
                  {shouldVirtualize ? (
                    <div className="relative" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                      {virtualRows.map((row) => {
                        const itemValue = filteredBranchNames[row.index];
                        if (!itemValue) return null;
                        return renderBranchItem(itemValue, row.index, {
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${row.start}px)`,
                        });
                      })}
                    </div>
                  ) : (
                    filteredBranchNames.map((name, index) => renderBranchItem(name, index))
                  )}
                </ComboboxList>
              </ComboboxPopup>
            </Combobox>
          </div>

          <div className="flex justify-end">
            <Button size="sm" disabled={!activeRepo || !selectedBranch} onClick={handleConfirm}>
              Start Thought Exercise
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
