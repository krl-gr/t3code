import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime";
import type {
  EditorId,
  EnvironmentId,
  ProjectScript,
  ResolvedKeybindingsConfig,
  ThreadId,
} from "@t3tools/contracts";
import { CloudIcon, FolderGit2Icon, FolderGitIcon, FolderIcon, MonitorIcon } from "lucide-react";
import { Fragment, memo, useCallback, useMemo, useState, type ReactNode } from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import {
  CONTEXT_GIT_QUICK_ACTION_ORDER,
  CONTEXT_OPEN_EDITOR_QUICK_ACTION_ORDER,
  CONTEXT_VIEW_QUICK_ACTION_ORDER,
  editorIdFromContextQuickActionId,
  type ContextQuickActionId,
} from "../contextQuickActions";
import { useIsMobile } from "../hooks/useMediaQuery";
import { usePrimaryEnvironmentId } from "../environments/primary";
import { useStore } from "../store";
import { createProjectSelectorByRef, createThreadSelectorByRef } from "../storeSelectors";
import { useUiStateStore } from "../uiStateStore";
import GitActionsControl from "./GitActionsControl";
import { ContextActionMenuItem } from "./ContextActionMenuItem";
import ProjectScriptsControl, { type NewProjectScriptInput } from "./ProjectScriptsControl";
import {
  type EnvMode,
  type EnvironmentOption,
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
  resolveEffectiveEnvMode,
  resolveLockedWorkspaceLabel,
} from "./BranchToolbar.logic";
import {
  CONTEXT_BAR_ICON_TRIGGER_CLASS,
  CONTEXT_BAR_SEPARATOR_CLASS,
  CONTEXT_BAR_TEXT_TRIGGER_CLASS,
} from "./BranchToolbar.styles";
import {
  ContextBarDiffIcon,
  ContextBarMoreIcon,
  ContextBarTerminalIcon,
} from "./BranchToolbar.icons";
import { BranchToolbarBranchSelector } from "./BranchToolbarBranchSelector";
import { BranchToolbarEnvironmentSelector } from "./BranchToolbarEnvironmentSelector";
import { BranchToolbarEnvModeSelector } from "./BranchToolbarEnvModeSelector";
import { ProjectFavicon } from "./ProjectFavicon";
import { Button } from "./ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { Toggle } from "./ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { OpenInPicker, shouldShowOpenInPicker } from "./chat/OpenInPicker";

interface BranchToolbarProps {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  draftId?: DraftId;
  activeProjectScripts: ProjectScript[] | undefined;
  availableEditors: ReadonlyArray<EditorId>;
  diffOpen: boolean;
  diffToggleShortcutLabel: string | null;
  gitCwd: string | null;
  keybindings: ResolvedKeybindingsConfig;
  openInCwd: string | null;
  preferredScriptId: string | null;
  terminalAvailable: boolean;
  terminalOpen: boolean;
  terminalToggleShortcutLabel: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<void>;
  onDeleteProjectScript: (scriptId: string) => Promise<void>;
  onRunProjectScript: (script: ProjectScript) => void;
  onToggleDiff: () => void;
  onToggleTerminal: () => void;
  onUpdateProjectScript: (scriptId: string, input: NewProjectScriptInput) => Promise<void>;
  effectiveEnvModeOverride?: EnvMode;
  activeThreadBranchOverride?: string | null;
  onActiveThreadBranchOverrideChange?: (branch: string | null) => void;
  envLocked: boolean;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest?: () => void;
  availableEnvironments?: readonly EnvironmentOption[];
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
}

type ContextQuickActionNode = {
  actionId: string;
  node: ReactNode;
};

const EMPTY_PROJECT_QUICK_ACTION_IDS: readonly string[] = [];

function ContextBarSeparator() {
  return <div aria-hidden="true" className={CONTEXT_BAR_SEPARATOR_CLASS} />;
}

function ContextBarSlash() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 6 12"
      className="h-[12px] w-[6px] shrink-0 text-[#2b2b2c]"
      fill="none"
    >
      <path d="M5.25 0.5L0.75 11.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

interface MobileRunContextSelectorProps {
  envLocked: boolean;
  envModeLocked: boolean;
  environmentId: EnvironmentId;
  availableEnvironments: readonly EnvironmentOption[] | undefined;
  showEnvironmentPicker: boolean;
  onEnvironmentChange: ((environmentId: EnvironmentId) => void) | undefined;
  effectiveEnvMode: EnvMode;
  activeWorktreePath: string | null;
  onEnvModeChange: (mode: EnvMode) => void;
}

const MobileRunContextSelector = memo(function MobileRunContextSelector({
  envLocked,
  envModeLocked,
  environmentId,
  availableEnvironments,
  showEnvironmentPicker,
  onEnvironmentChange,
  effectiveEnvMode,
  activeWorktreePath,
  onEnvModeChange,
}: MobileRunContextSelectorProps) {
  const activeEnvironment = useMemo(
    () => availableEnvironments?.find((env) => env.environmentId === environmentId) ?? null,
    [availableEnvironments, environmentId],
  );
  const WorkspaceIcon =
    effectiveEnvMode === "worktree"
      ? FolderGit2Icon
      : activeWorktreePath
        ? FolderGitIcon
        : FolderIcon;
  const workspaceLabel = envModeLocked
    ? resolveLockedWorkspaceLabel(activeWorktreePath)
    : effectiveEnvMode === "worktree"
      ? resolveEnvModeLabel("worktree")
      : resolveCurrentWorkspaceLabel(activeWorktreePath);
  const isLocked = envLocked || envModeLocked;
  const EnvironmentIcon = activeEnvironment?.isPrimary ? MonitorIcon : CloudIcon;
  const icon = showEnvironmentPicker ? (
    // Button's base styles apply `-mx-0.5` to descendant SVGs, which eats 4px
    // out of whatever gap we set. mx-0! cancels that so gap-0.5 reads as 2px.
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <EnvironmentIcon className="size-3 shrink-0 mx-0!" />
      <WorkspaceIcon className="size-3 shrink-0 mx-0!" />
    </span>
  ) : (
    <WorkspaceIcon className="size-3 shrink-0" />
  );
  const triggerContent = (
    <>
      {icon}
      <span className="min-w-0 truncate">
        {showEnvironmentPicker ? (activeEnvironment?.label ?? "Run on") : workspaceLabel}
      </span>
    </>
  );

  if (isLocked) {
    return (
      <span className="inline-flex min-w-0 max-w-[48%] flex-1 items-center justify-start gap-1 rounded-md border border-transparent px-[calc(--spacing(2)-1px)] text-sm font-medium text-muted-foreground/70 md:hidden">
        {triggerContent}
      </span>
    );
  }

  return (
    <Menu>
      <MenuTrigger
        render={<Button variant="ghost" size="xs" />}
        className="min-w-0 max-w-[48%] flex-1 justify-start text-muted-foreground/70 hover:text-foreground/80 md:hidden"
      >
        {triggerContent}
      </MenuTrigger>
      <MenuPopup align="start" side="top" className="w-64">
        {showEnvironmentPicker && availableEnvironments && onEnvironmentChange ? (
          <>
            <MenuGroup>
              <MenuGroupLabel>Run on</MenuGroupLabel>
              <MenuRadioGroup
                value={environmentId}
                onValueChange={(value) => onEnvironmentChange(value as EnvironmentId)}
              >
                {availableEnvironments.map((env) => {
                  const Icon = env.isPrimary ? MonitorIcon : CloudIcon;
                  return (
                    <MenuRadioItem
                      key={env.environmentId}
                      disabled={envLocked}
                      value={env.environmentId}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon className="size-3" />
                        <span className="min-w-0 truncate">{env.label}</span>
                      </span>
                    </MenuRadioItem>
                  );
                })}
              </MenuRadioGroup>
            </MenuGroup>
            <MenuSeparator />
          </>
        ) : null}
        <MenuGroup>
          <MenuGroupLabel>Workspace</MenuGroupLabel>
          <MenuRadioGroup
            value={effectiveEnvMode}
            onValueChange={(value) => onEnvModeChange(value as EnvMode)}
          >
            <MenuRadioItem disabled={envModeLocked} value="local">
              <span className="flex min-w-0 items-center gap-1.5">
                {activeWorktreePath ? (
                  <FolderGitIcon className="size-3" />
                ) : (
                  <FolderIcon className="size-3" />
                )}
                <span className="min-w-0 truncate">
                  {resolveCurrentWorkspaceLabel(activeWorktreePath)}
                </span>
              </span>
            </MenuRadioItem>
            <MenuRadioItem disabled={envModeLocked} value="worktree">
              <span className="flex min-w-0 items-center gap-1.5">
                <FolderGit2Icon className="size-3" />
                <span className="min-w-0 truncate">{resolveEnvModeLabel("worktree")}</span>
              </span>
            </MenuRadioItem>
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
});

export const BranchToolbar = memo(function BranchToolbar({
  environmentId,
  threadId,
  draftId,
  activeProjectScripts,
  availableEditors,
  diffOpen,
  diffToggleShortcutLabel,
  gitCwd,
  keybindings,
  openInCwd,
  preferredScriptId,
  terminalAvailable,
  terminalOpen,
  terminalToggleShortcutLabel,
  onEnvModeChange,
  onAddProjectScript,
  onDeleteProjectScript,
  onRunProjectScript,
  onToggleDiff,
  onToggleTerminal,
  onUpdateProjectScript,
  effectiveEnvModeOverride,
  activeThreadBranchOverride,
  onActiveThreadBranchOverrideChange,
  envLocked,
  onCheckoutPullRequestRequest,
  onComposerFocusRequest,
  availableEnvironments,
  onEnvironmentChange,
}: BranchToolbarProps) {
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const threadRef = useMemo(
    () => scopeThreadRef(environmentId, threadId),
    [environmentId, threadId],
  );
  const serverThreadSelector = useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]);
  const serverThread = useStore(serverThreadSelector);
  const draftThread = useComposerDraftStore((store) =>
    draftId ? store.getDraftSession(draftId) : store.getDraftThreadByRef(threadRef),
  );
  const activeProjectRef = serverThread
    ? scopeProjectRef(serverThread.environmentId, serverThread.projectId)
    : draftThread
      ? scopeProjectRef(draftThread.environmentId, draftThread.projectId)
      : null;
  const activeProjectSelector = useMemo(
    () => createProjectSelectorByRef(activeProjectRef),
    [activeProjectRef],
  );
  const activeProject = useStore(activeProjectSelector);
  const hasActiveThread = serverThread !== undefined || draftThread !== null;
  const activeWorktreePath = serverThread?.worktreePath ?? draftThread?.worktreePath ?? null;
  const effectiveEnvMode =
    effectiveEnvModeOverride ??
    resolveEffectiveEnvMode({
      activeWorktreePath,
      hasServerThread: serverThread !== undefined,
      draftThreadEnvMode: draftThread?.envMode,
    });
  const envModeLocked = envLocked || (serverThread !== undefined && activeWorktreePath !== null);

  const showEnvironmentPicker = Boolean(
    availableEnvironments && availableEnvironments.length > 1 && onEnvironmentChange,
  );
  const isMobile = useIsMobile();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const showOpenInPicker = shouldShowOpenInPicker({
    activeProjectName: activeProject?.name,
    activeThreadEnvironmentId: environmentId,
    primaryEnvironmentId,
  });
  const contextQuickActionIds = useUiStateStore((store) => store.contextQuickActionIds);
  const projectQuickActionIdsByProjectKey = useUiStateStore(
    (store) => store.projectQuickActionIdsByProjectKey,
  );
  const setContextQuickActionPinned = useUiStateStore((store) => store.setContextQuickActionPinned);
  const setProjectQuickActionPinned = useUiStateStore((store) => store.setProjectQuickActionPinned);
  const pinnedContextActionIds = useMemo(
    () => new Set(contextQuickActionIds),
    [contextQuickActionIds],
  );
  const orderedContextQuickActionIds = useMemo(() => {
    const orderedIds: ContextQuickActionId[] = [];
    const seenIds = new Set<ContextQuickActionId>();
    const availableEditorIds = new Set(availableEditors);
    const appendIfPinned = (actionId: ContextQuickActionId) => {
      if (!pinnedContextActionIds.has(actionId) || seenIds.has(actionId)) {
        return;
      }
      orderedIds.push(actionId);
      seenIds.add(actionId);
    };

    for (const actionId of CONTEXT_GIT_QUICK_ACTION_ORDER) {
      appendIfPinned(actionId);
    }
    for (const actionId of CONTEXT_OPEN_EDITOR_QUICK_ACTION_ORDER) {
      const editorId = editorIdFromContextQuickActionId(actionId);
      if (editorId !== null && availableEditorIds.has(editorId)) {
        appendIfPinned(actionId);
      }
    }
    for (const actionId of CONTEXT_VIEW_QUICK_ACTION_ORDER) {
      appendIfPinned(actionId);
    }
    for (const actionId of contextQuickActionIds) {
      appendIfPinned(actionId);
    }

    return orderedIds;
  }, [availableEditors, contextQuickActionIds, pinnedContextActionIds]);
  const activeProjectKey = activeProject?.id ?? null;
  const projectQuickActionIds =
    activeProjectKey !== null
      ? (projectQuickActionIdsByProjectKey[activeProjectKey] ?? EMPTY_PROJECT_QUICK_ACTION_IDS)
      : EMPTY_PROJECT_QUICK_ACTION_IDS;
  const pinnedProjectScriptIds = useMemo(
    () => new Set(projectQuickActionIds),
    [projectQuickActionIds],
  );
  const onContextActionPinnedChange = useCallback(
    (actionId: ContextQuickActionId, pinned: boolean) => {
      setContextQuickActionPinned(actionId, pinned);
    },
    [setContextQuickActionPinned],
  );
  const onProjectScriptPinnedChange = useCallback(
    (scriptId: string, pinned: boolean) => {
      if (activeProjectKey === null) return;
      setProjectQuickActionPinned(activeProjectKey, scriptId, pinned);
    },
    [activeProjectKey, setProjectQuickActionPinned],
  );

  if (!hasActiveThread || !activeProject) return null;

  const quickActionNodes = orderedContextQuickActionIds.flatMap<ContextQuickActionNode>(
    (actionId) => {
      if (actionId === "git.quick") {
        return [
          {
            actionId,
            node: (
              <GitActionsControl
                presentation="composer-bar"
                gitCwd={gitCwd}
                activeThreadRef={threadRef}
                {...(draftId ? { draftId } : {})}
              />
            ),
          },
        ];
      }
      if (actionId === "git.commit" || actionId === "git.push" || actionId === "git.pr") {
        return [
          {
            actionId,
            node: (
              <GitActionsControl
                presentation="composer-bar"
                composerActionId={
                  actionId === "git.commit" ? "commit" : actionId === "git.push" ? "push" : "pr"
                }
                gitCwd={gitCwd}
                activeThreadRef={threadRef}
                {...(draftId ? { draftId } : {})}
              />
            ),
          },
        ];
      }
      const editorId = editorIdFromContextQuickActionId(actionId);
      if (editorId !== null) {
        if (!showOpenInPicker || !availableEditors.includes(editorId)) return [];
        return [
          {
            actionId,
            node: (
              <OpenInPicker
                presentation="composer-bar"
                keybindings={keybindings}
                availableEditors={availableEditors}
                openInCwd={openInCwd}
                composerEditorId={editorId}
              />
            ),
          },
        ];
      }
      if (actionId === "terminal.toggle") {
        return [
          {
            actionId,
            node: (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Toggle
                      className={CONTEXT_BAR_ICON_TRIGGER_CLASS}
                      pressed={terminalOpen}
                      onPressedChange={onToggleTerminal}
                      aria-label="Toggle terminal drawer"
                      variant="outline"
                      size="xs"
                      disabled={!terminalAvailable}
                    />
                  }
                >
                  <ContextBarTerminalIcon className="size-4" />
                </TooltipTrigger>
                <TooltipPopup side="top">
                  {!terminalAvailable
                    ? "Terminal is unavailable until this thread has an active project."
                    : terminalToggleShortcutLabel
                      ? `Toggle terminal drawer (${terminalToggleShortcutLabel})`
                      : "Toggle terminal drawer"}
                </TooltipPopup>
              </Tooltip>
            ),
          },
        ];
      }
      if (actionId === "diff.toggle") {
        return [
          {
            actionId,
            node: (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Toggle
                      className={CONTEXT_BAR_ICON_TRIGGER_CLASS}
                      pressed={diffOpen}
                      onPressedChange={onToggleDiff}
                      aria-label="Toggle diff panel"
                      variant="outline"
                      size="xs"
                    />
                  }
                >
                  <ContextBarDiffIcon className="size-4" />
                </TooltipTrigger>
                <TooltipPopup side="top">
                  {diffToggleShortcutLabel
                    ? `Toggle diff panel (${diffToggleShortcutLabel})`
                    : "Toggle diff panel"}
                </TooltipPopup>
              </Tooltip>
            ),
          },
        ];
      }
      return [];
    },
  );
  const projectQuickActionNodes = (activeProjectScripts ?? []).flatMap<ContextQuickActionNode>(
    (script) => {
      if (!pinnedProjectScriptIds.has(script.id)) return [];
      return [
        {
          actionId: `project.${script.id}`,
          node: (
            <Button
              size="xs"
              variant="ghost"
              className={`${CONTEXT_BAR_TEXT_TRIGGER_CLASS} max-w-36`}
              title={`Run ${script.name}`}
              onClick={() => onRunProjectScript(script)}
            >
              <span className="min-w-0 truncate">{script.name}</span>
            </Button>
          ),
        },
      ];
    },
  );
  const quickAccessNodes = [...projectQuickActionNodes, ...quickActionNodes];

  return (
    <div
      className="mx-auto flex w-full max-w-208 min-w-0 items-center justify-between gap-2 pb-3 pl-3 pr-4 pt-1 drop-shadow-[0_4px_2px_rgba(0,0,0,0.25)]"
      data-chat-context-bar="true"
    >
      <div className="flex min-w-0 items-center gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {isMobile ? (
          <MobileRunContextSelector
            envLocked={envLocked}
            envModeLocked={envModeLocked}
            environmentId={environmentId}
            availableEnvironments={availableEnvironments}
            showEnvironmentPicker={showEnvironmentPicker}
            onEnvironmentChange={onEnvironmentChange}
            effectiveEnvMode={effectiveEnvMode}
            activeWorktreePath={activeWorktreePath}
            onEnvModeChange={onEnvModeChange}
          />
        ) : (
          <div className="flex min-w-0 shrink-0 items-center gap-0">
            <span className={CONTEXT_BAR_ICON_TRIGGER_CLASS} aria-hidden="true">
              <ProjectFavicon
                environmentId={activeProject.environmentId}
                cwd={activeProject.cwd}
                label={activeProject.name}
                projectKey={activeProject.id}
                className="size-4"
              />
            </span>
            <ContextBarSlash />
            {showEnvironmentPicker && availableEnvironments && onEnvironmentChange && (
              <>
                <BranchToolbarEnvironmentSelector
                  envLocked={envLocked}
                  environmentId={environmentId}
                  availableEnvironments={availableEnvironments}
                  onEnvironmentChange={onEnvironmentChange}
                />
                <ContextBarSeparator />
              </>
            )}
            <BranchToolbarEnvModeSelector
              envLocked={envModeLocked}
              effectiveEnvMode={effectiveEnvMode}
              activeWorktreePath={activeWorktreePath}
              onEnvModeChange={onEnvModeChange}
            />
          </div>
        )}

        <ContextBarSeparator />
        <BranchToolbarBranchSelector
          className="min-w-0 max-w-40 justify-start"
          environmentId={environmentId}
          threadId={threadId}
          {...(draftId ? { draftId } : {})}
          envLocked={envLocked}
          {...(effectiveEnvModeOverride ? { effectiveEnvModeOverride } : {})}
          {...(activeThreadBranchOverride !== undefined ? { activeThreadBranchOverride } : {})}
          {...(onActiveThreadBranchOverrideChange ? { onActiveThreadBranchOverrideChange } : {})}
          {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
          {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
        />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-0 text-[rgba(186,185,186,0.7)]">
        {quickAccessNodes.map((entry, index) => (
          <Fragment key={entry.actionId}>
            {index > 0 ? <ContextBarSeparator /> : null}
            {entry.node}
          </Fragment>
        ))}
        {quickAccessNodes.length > 0 ? <ContextBarSeparator /> : null}
        <Menu open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <MenuTrigger
            render={
              <Button
                aria-label="More chat actions"
                size="icon-sm"
                variant="ghost"
                className={CONTEXT_BAR_ICON_TRIGGER_CLASS}
              />
            }
          >
            <ContextBarMoreIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end" side="top" className="min-w-64" keepMounted>
            {activeProjectScripts ? (
              <ProjectScriptsControl
                presentation="menu"
                scripts={activeProjectScripts}
                keybindings={keybindings}
                preferredScriptId={preferredScriptId}
                pinnedScriptIds={pinnedProjectScriptIds}
                onRunScript={onRunProjectScript}
                onRequestMenuClose={() => setMoreMenuOpen(false)}
                onScriptPinnedChange={onProjectScriptPinnedChange}
                onAddScript={onAddProjectScript}
                onUpdateScript={onUpdateProjectScript}
                onDeleteScript={onDeleteProjectScript}
              />
            ) : (
              <MenuItem disabled>No project actions</MenuItem>
            )}
            <MenuSeparator />
            <GitActionsControl
              presentation="composer-menu"
              gitCwd={gitCwd}
              activeThreadRef={threadRef}
              pinnedContextActionIds={pinnedContextActionIds}
              onContextActionPinnedChange={onContextActionPinnedChange}
              {...(draftId ? { draftId } : {})}
            />
            {showOpenInPicker ? (
              <>
                <OpenInPicker
                  presentation="composer-menu"
                  keybindings={keybindings}
                  availableEditors={availableEditors}
                  openInCwd={openInCwd}
                  pinnedContextActionIds={pinnedContextActionIds}
                  onContextActionPinnedChange={onContextActionPinnedChange}
                />
                <MenuSeparator />
              </>
            ) : null}
            <MenuGroup>
              <MenuGroupLabel>View</MenuGroupLabel>
              <ContextActionMenuItem
                actionId="terminal.toggle"
                checked={pinnedContextActionIds.has("terminal.toggle")}
                disabled={!terminalAvailable}
                icon={<ContextBarTerminalIcon className="size-4" />}
                shortcutLabel={terminalToggleShortcutLabel}
                onCheckedChange={onContextActionPinnedChange}
                onSelect={onToggleTerminal}
              >
                Terminal
              </ContextActionMenuItem>
              <ContextActionMenuItem
                actionId="diff.toggle"
                checked={pinnedContextActionIds.has("diff.toggle")}
                icon={<ContextBarDiffIcon className="size-4" />}
                shortcutLabel={diffToggleShortcutLabel}
                onCheckedChange={onContextActionPinnedChange}
                onSelect={onToggleDiff}
              >
                Diff
              </ContextActionMenuItem>
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
});
