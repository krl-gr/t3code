import { FolderGit2Icon, FolderGitIcon, FolderIcon } from "lucide-react";
import { type ComponentProps, memo, useMemo } from "react";

import { cn } from "../lib/utils";
import { CONTEXT_BAR_TEXT_TRIGGER_CLASS } from "./BranchToolbar.styles";
import {
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
  resolveLockedWorkspaceLabel,
  type EnvMode,
} from "./BranchToolbar.logic";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

interface BranchToolbarEnvModeSelectorProps {
  envLocked: boolean;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
}

function ContextBarSelectTrigger({ className, ...props }: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn(
        CONTEXT_BAR_TEXT_TRIGGER_CLASS,
        "[&_[data-slot=select-icon]]:hidden",
        className,
      )}
      {...props}
    />
  );
}

export const BranchToolbarEnvModeSelector = memo(function BranchToolbarEnvModeSelector({
  envLocked,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
}: BranchToolbarEnvModeSelectorProps) {
  const envModeItems = useMemo(
    () => [
      { value: "local", label: resolveCurrentWorkspaceLabel(activeWorktreePath) },
      { value: "worktree", label: resolveEnvModeLabel("worktree") },
    ],
    [activeWorktreePath],
  );

  if (envLocked) {
    return (
      <span className={cn(CONTEXT_BAR_TEXT_TRIGGER_CLASS, "inline-flex items-center")}>
        <FolderIcon className="size-3.5 shrink-0" />
        {resolveLockedWorkspaceLabel(activeWorktreePath)}
      </span>
    );
  }

  return (
    <Select
      modal={false}
      value={effectiveEnvMode}
      onValueChange={(value) => onEnvModeChange(value as EnvMode)}
      items={envModeItems}
    >
      <ContextBarSelectTrigger variant="ghost" size="xs" aria-label="Workspace">
        <FolderIcon className="size-3.5 shrink-0" />
        <SelectValue />
      </ContextBarSelectTrigger>
      <SelectPopup>
        <SelectGroup>
          <SelectGroupLabel>Workspace</SelectGroupLabel>
          <SelectItem value="local">
            <span className="inline-flex items-center gap-1.5">
              {activeWorktreePath ? (
                <FolderGitIcon className="size-3" />
              ) : (
                <FolderIcon className="size-3" />
              )}
              {resolveCurrentWorkspaceLabel(activeWorktreePath)}
            </span>
          </SelectItem>
          <SelectItem value="worktree">
            <span className="inline-flex items-center gap-1.5">
              <FolderGit2Icon className="size-3" />
              {resolveEnvModeLabel("worktree")}
            </span>
          </SelectItem>
        </SelectGroup>
      </SelectPopup>
    </Select>
  );
});
