import { ChevronRightIcon, GitForkIcon, SquarePenIcon } from "lucide-react";
import type { ProjectId, ThreadId } from "@arbortools/contracts";
import type { RepoGroup as RepoGroupType } from "../../hooks/useRepoSidebarModel";
import { SidebarItem } from "./SidebarItem";

interface RepoGroupProps {
  group: RepoGroupType;
  activeThreadId: ThreadId | null;
  onToggleExpand: (slug: string) => void;
  onItemClick: (event: React.MouseEvent, threadId: ThreadId) => void;
  onItemContextMenu: (event: React.MouseEvent, threadId: ThreadId) => void;
  onNewThread: (projectId: ProjectId) => void;
}

export function RepoGroup({
  group,
  activeThreadId,
  onToggleExpand,
  onItemClick,
  onItemContextMenu,
  onNewThread,
}: RepoGroupProps) {
  const { repoSlug, items, expanded } = group;
  const slashIndex = repoSlug.indexOf("/");
  const owner = slashIndex >= 0 ? repoSlug.slice(0, slashIndex) : "";
  const repo = slashIndex >= 0 ? repoSlug.slice(slashIndex + 1) : repoSlug;
  const primaryProjectId = items[0]?.project.id;

  return (
    <div>
      <div className="group/repo-header relative flex items-center">
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
        {primaryProjectId && (
          <button
            type="button"
            data-testid="new-thread-button"
            aria-label="Create new thread"
            className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/70 opacity-0 hover:bg-secondary hover:text-foreground group-hover/repo-header:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onNewThread(primaryProjectId);
            }}
          >
            <SquarePenIcon className="size-3.5" />
          </button>
        )}
      </div>
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
