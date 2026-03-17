import { ChevronRightIcon, GitForkIcon } from "lucide-react";
import type { RepoGroup as RepoGroupType } from "../../hooks/useRepoSidebarModel";
import { SidebarItem } from "./SidebarItem";
import type { ThreadId } from "@arbortools/contracts";

interface RepoGroupProps {
  group: RepoGroupType;
  activeThreadId: ThreadId | null;
  onToggleExpand: (slug: string) => void;
  onItemClick: (event: React.MouseEvent, threadId: ThreadId) => void;
  onItemContextMenu: (event: React.MouseEvent, threadId: ThreadId) => void;
}

export function RepoGroup({
  group,
  activeThreadId,
  onToggleExpand,
  onItemClick,
  onItemContextMenu,
}: RepoGroupProps) {
  const { repoSlug, items, expanded } = group;
  const slashIndex = repoSlug.indexOf("/");
  const owner = slashIndex >= 0 ? repoSlug.slice(0, slashIndex) : "";
  const repo = slashIndex >= 0 ? repoSlug.slice(slashIndex + 1) : repoSlug;

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-accent"
        onClick={() => onToggleExpand(repoSlug)}
      >
        <ChevronRightIcon
          className={`size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <GitForkIcon className="size-3 shrink-0 text-muted-foreground/50" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground/90">
          {owner ? (
            <>
              <span className="font-normal text-muted-foreground/50">{owner}/</span>
              {repo}
            </>
          ) : (
            repo
          )}
        </span>
        {!expanded && (
          <span className="shrink-0 rounded-full bg-muted/50 px-1.5 py-px text-[10px] font-medium text-muted-foreground/50">
            {items.length}
          </span>
        )}
      </button>
      {expanded && (
        <div className="pb-1">
          {items.map((item) => (
            <div key={item.project.id} className="pl-3">
              <SidebarItem
                item={item}
                isActive={activeThreadId === item.thread.id}
                onClick={(event) => onItemClick(event, item.thread.id)}
                onContextMenu={(event) => onItemContextMenu(event, item.thread.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
