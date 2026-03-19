import { GitPullRequestIcon, MessageCircleIcon, PlusIcon } from "lucide-react";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

interface SidebarNewMenuProps {
  onNewThought: () => void;
  onReviewPR: () => void;
}

export function SidebarNewMenu({ onNewThought, onReviewPR }: SidebarNewMenuProps) {
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <button
                  type="button"
                  aria-label="New item"
                  className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                />
              }
            />
          }
        >
          <PlusIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">New item</TooltipPopup>
      </Tooltip>
      <MenuPopup side="bottom" align="end" sideOffset={4}>
        <MenuItem onClick={onNewThought}>
          <MessageCircleIcon className="size-3.5 text-teal-500" />
          New Thought
        </MenuItem>
        <MenuItem onClick={onReviewPR}>
          <GitPullRequestIcon className="size-3.5 text-blue-500" />
          Review a PR
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
