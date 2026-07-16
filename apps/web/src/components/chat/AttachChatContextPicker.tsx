import type { ProjectId, ThreadId } from "@t3tools/contracts";
import { GitBranchIcon } from "lucide-react";
import { useEffect, useRef, type KeyboardEvent } from "react";

import type { Project, ThreadShell } from "../../types";
import { cn } from "~/lib/utils";
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { COMPOSER_CONTROL_ICON_TRIGGER_CLASS } from "./composerControlStyles";

interface AttachChatContextPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidates: ReadonlyArray<ThreadShell>;
  projectById: ReadonlyMap<ProjectId, Project>;
  search: string;
  onSearchChange: (search: string) => void;
  highlightedSourceId: ThreadId | null;
  onHighlightedSourceIdChange: (sourceId: ThreadId | null) => void;
  attachingSourceId: ThreadId | null;
  onSelectSource: (sourceId: ThreadId) => void | Promise<void>;
}

const TRIGGER_LABEL = "Attach chat context";

export function AttachChatContextPicker({
  open,
  onOpenChange,
  candidates,
  projectById,
  search,
  onSearchChange,
  highlightedSourceId,
  onHighlightedSourceIdChange,
  attachingSourceId,
  onSelectSource,
}: AttachChatContextPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!highlightedSourceId || !listRef.current) return;
    listRef.current
      .querySelector<HTMLElement>(`[data-thread-id="${CSS.escape(highlightedSourceId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightedSourceId]);

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (highlightedSourceId) void onSelectSource(highlightedSourceId);
      return;
    }
    if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || candidates.length === 0) {
      return;
    }
    event.preventDefault();
    const currentIndex = candidates.findIndex((thread) => thread.id === highlightedSourceId);
    const delta = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex =
      currentIndex < 0
        ? event.key === "ArrowDown"
          ? 0
          : candidates.length - 1
        : (currentIndex + delta + candidates.length) % candidates.length;
    onHighlightedSourceIdChange(candidates[nextIndex]?.id ?? null);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Tooltip open={open ? false : undefined}>
        <PopoverTrigger
          render={
            <TooltipTrigger
              render={
                <button
                  type="button"
                  aria-label={TRIGGER_LABEL}
                  className={COMPOSER_CONTROL_ICON_TRIGGER_CLASS}
                />
              }
            />
          }
        >
          <GitBranchIcon className="size-4" />
        </PopoverTrigger>
        <TooltipPopup side="top">{TRIGGER_LABEL}</TooltipPopup>
      </Tooltip>

      <PopoverPopup
        side="top"
        align="start"
        sideOffset={8}
        className="w-[min(calc(100vw-2rem),28rem)] gap-0 overflow-hidden p-0 before:hidden [--viewport-inline-padding:0] *:data-[slot=popover-viewport]:p-0"
      >
        <div className="border-border/60 border-b px-3.5 py-3">
          <div className="text-sm font-medium">Attach chat snapshot</div>
          <div className="mt-0.5 text-muted-foreground text-xs">
            A bounded copy of the selected conversation will be sent with future turns.
          </div>
        </div>

        <div className="border-border/60 border-b px-3.5">
          <Input
            unstyled
            autoFocus
            value={search}
            placeholder="Search chats, projects, paths"
            className="h-10 w-full bg-transparent text-sm"
            onChange={(event) => onSearchChange(event.currentTarget.value)}
            onKeyDown={handleSearchKeyDown}
          />
        </div>

        <div
          ref={listRef}
          className="max-h-72 overflow-y-auto p-1.5 [scrollbar-gutter:stable_both-edges]"
        >
          {candidates.length === 0 ? (
            <div className="px-3 py-8 text-center text-muted-foreground/70 text-sm">
              No chats available to attach.
            </div>
          ) : (
            candidates.map((thread) => {
              const project = projectById.get(thread.projectId);
              const highlighted = highlightedSourceId === thread.id;
              const attaching = attachingSourceId === thread.id;
              return (
                <button
                  key={thread.id}
                  type="button"
                  data-thread-id={thread.id}
                  aria-current={highlighted ? "true" : undefined}
                  disabled={attachingSourceId !== null}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors disabled:pointer-events-none disabled:opacity-64",
                    highlighted ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                  )}
                  onMouseMove={() => {
                    if (!highlighted) onHighlightedSourceIdChange(thread.id);
                  }}
                  onClick={() => void onSelectSource(thread.id)}
                >
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-sm">{thread.title}</span>
                    <span className="truncate text-muted-foreground/70 text-xs">
                      {project ? `${project.title} · ${project.workspaceRoot}` : "Unknown project"}
                    </span>
                  </span>
                  {attaching ? (
                    <span className="shrink-0 text-muted-foreground/60 text-xs">Attaching</span>
                  ) : thread.archivedAt ? (
                    <span className="shrink-0 text-muted-foreground/60 text-xs">Archived</span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
