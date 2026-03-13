import type { GitBranch } from "@arbortools/contracts";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

import { gitBranchesQueryOptions } from "../lib/gitReactQuery";
import { dedupeRemoteBranchesWithLocalMatches } from "./BranchToolbar.logic";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
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
import { ChevronDownIcon } from "lucide-react";

interface ThoughtBranchPickerProps {
  projectCwd: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (baseBranch: string) => void;
}

export function ThoughtBranchPicker({
  projectCwd,
  open,
  onOpenChange,
  onConfirm,
}: ThoughtBranchPickerProps) {
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [branchQuery, setBranchQuery] = useState("");
  const deferredBranchQuery = useDeferredValue(branchQuery);
  const [isBranchMenuOpen, setIsBranchMenuOpen] = useState(false);

  const branchesQuery = useQuery({
    ...gitBranchesQueryOptions(projectCwd),
    enabled: open,
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

  // Default to current branch when dialog opens
  useEffect(() => {
    if (!open) {
      setSelectedBranch(null);
      setBranchQuery("");
      return;
    }
    const current = branches.find((b) => b.current);
    if (current && !selectedBranch) {
      setSelectedBranch(current.name);
    }
  }, [open, branches, selectedBranch]);

  const handleConfirm = () => {
    if (selectedBranch) {
      onConfirm(selectedBranch);
      onOpenChange(false);
    }
  };

  function renderItem(itemValue: string, index: number, style?: React.CSSProperties) {
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup showCloseButton>
        <DialogHeader>
          <DialogTitle>New Thought Exercise</DialogTitle>
          <DialogDescription>
            Choose a base branch. A worktree will be created for exploration.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 px-6 pb-6">
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
              disabled={branchesQuery.isLoading && branches.length === 0}
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
                  <div
                    className="relative"
                    style={{ height: `${virtualizer.getTotalSize()}px` }}
                  >
                    {virtualRows.map((row) => {
                      const itemValue = filteredBranchNames[row.index];
                      if (!itemValue) return null;
                      return renderItem(itemValue, row.index, {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${row.start}px)`,
                      });
                    })}
                  </div>
                ) : (
                  filteredBranchNames.map((name, index) => renderItem(name, index))
                )}
              </ComboboxList>
            </ComboboxPopup>
          </Combobox>
          <div className="flex justify-end">
            <Button size="sm" disabled={!selectedBranch} onClick={handleConfirm}>
              Start Thought Exercise
            </Button>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
