import { memo } from "react";
import { Badge } from "../ui/badge";
import { SidebarTrigger } from "../ui/sidebar";

interface ChatHeaderProps {
  activeThreadTitle: string;
  activeProjectName: string | undefined;
  isGitRepo: boolean;
  reviewMode?: boolean | undefined;
}

export const ChatHeader = memo(function ChatHeader({
  activeThreadTitle,
  activeProjectName,
  isGitRepo,
  reviewMode,
}: ChatHeaderProps) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden sm:gap-3">
        <SidebarTrigger className="size-7 shrink-0 md:hidden" />
        <h2
          className="min-w-0 shrink truncate text-sm font-medium text-foreground"
          title={activeThreadTitle}
        >
          {activeThreadTitle}
        </h2>
        {activeProjectName && !reviewMode && (
          <Badge variant="outline" className="min-w-0 shrink truncate">
            {activeProjectName}
          </Badge>
        )}
        {activeProjectName && !isGitRepo && !reviewMode && (
          <Badge variant="outline" className="shrink-0 text-[10px] text-amber-700">
            No Git
          </Badge>
        )}
      </div>
    </div>
  );
});
