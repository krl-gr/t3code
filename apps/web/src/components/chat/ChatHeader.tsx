import type { ReactNode } from "react";
import { memo } from "react";
import { SquarePenIcon } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SidebarTrigger } from "../ui/sidebar";

interface ChatHeaderProps {
  newThreadShortcutLabel: string | null;
  onNewThread: () => void;
  rightAccessory?: ReactNode;
  showNewThreadButton?: boolean;
  showSidebarTrigger?: boolean;
}

export const ChatHeader = memo(function ChatHeader({
  newThreadShortcutLabel,
  onNewThread,
  rightAccessory,
  showNewThreadButton = true,
  showSidebarTrigger = true,
}: ChatHeaderProps) {
  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-between gap-2"
      data-chat-active-header="true"
    >
      {showSidebarTrigger ? (
        <SidebarTrigger className="size-8 shrink-0 rounded-full text-muted-foreground/80 hover:text-foreground" />
      ) : (
        <span className="min-w-0 flex-1" />
      )}
      <div className="flex shrink-0 items-center justify-end gap-1">
        {rightAccessory}
        {showNewThreadButton ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full text-muted-foreground/80 hover:text-foreground"
                  aria-label="New thread"
                  onClick={onNewThread}
                >
                  <SquarePenIcon className="size-4" aria-hidden="true" />
                </Button>
              }
            />
            <TooltipPopup side="bottom" align="end">
              {newThreadShortcutLabel ? `New thread (${newThreadShortcutLabel})` : "New thread"}
            </TooltipPopup>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
});
