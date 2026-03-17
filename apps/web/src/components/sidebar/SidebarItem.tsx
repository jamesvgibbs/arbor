import { GitPullRequestIcon, MessageCircleIcon } from "lucide-react";
import type { SidebarItem as SidebarItemType } from "../../hooks/useRepoSidebarModel";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function StatusPill({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string; dotClassName: string }> = {
    active: {
      label: "Active",
      className: "text-sky-600 bg-sky-500/10 dark:text-sky-300/80",
      dotClassName: "bg-sky-500 dark:bg-sky-300/80 animate-pulse",
    },
    "has-changes": {
      label: "Has changes",
      className: "text-teal-600 bg-teal-500/10 dark:text-teal-300/80",
      dotClassName: "bg-teal-500 dark:bg-teal-300/80",
    },
    draft: {
      label: "Draft",
      className: "text-muted-foreground bg-muted/50",
      dotClassName: "bg-muted-foreground/50",
    },
    "needs-review": {
      label: "Needs review",
      className: "text-amber-600 bg-amber-500/10 dark:text-amber-300/80",
      dotClassName: "bg-amber-500 dark:bg-amber-300/80",
    },
    approved: {
      label: "Approved",
      className: "text-emerald-600 bg-emerald-500/10 dark:text-emerald-300/80",
      dotClassName: "bg-emerald-500 dark:bg-emerald-300/80",
    },
    merged: {
      label: "Merged",
      className: "text-violet-600 bg-violet-500/10 dark:text-violet-300/80",
      dotClassName: "bg-violet-500 dark:bg-violet-300/80",
    },
  };

  const c = config[status];
  if (!c) return null;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] font-medium ${c.className}`}>
      <span className={`size-1.5 rounded-full ${c.dotClassName}`} />
      {c.label}
    </span>
  );
}

interface SidebarItemProps {
  item: SidebarItemType;
  isActive: boolean;
  onClick: (event: React.MouseEvent) => void;
  onContextMenu: (event: React.MouseEvent) => void;
}

export function SidebarItem({ item, isActive, onClick, onContextMenu }: SidebarItemProps) {
  const Icon = item.kind === "thought" ? MessageCircleIcon : GitPullRequestIcon;
  const iconColor = item.kind === "thought" ? "text-teal-500" : "text-blue-500";
  const title =
    item.kind === "pr-review" && item.prNumber
      ? `#${item.prNumber} ${item.prTitle ?? item.thread.title}`
      : item.thread.title;

  return (
    <button
      type="button"
      data-thread-item
      className={`group relative flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
        isActive
          ? "bg-accent/85 text-foreground font-medium dark:bg-accent/55"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {isActive && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-primary" />
      )}
      <Icon className={`mt-0.5 size-3.5 shrink-0 ${iconColor}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs leading-tight">{title}</div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="shrink-0 text-[10px] text-muted-foreground/40">
            {formatRelativeTime(item.lastActivityAt)}
          </span>
          {item.status && <StatusPill status={item.status} />}
        </div>
      </div>
    </button>
  );
}
