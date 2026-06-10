import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime";
import type {
  EditorId,
  EnvironmentId,
  ProjectScript,
  ResolvedKeybindingsConfig,
  ThreadId,
} from "@t3tools/contracts";
import {
  Fragment,
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";

import { useComposerDraftStore, type DraftId } from "../composerDraftStore";
import {
  CONTEXT_GIT_QUICK_ACTION_ORDER,
  CONTEXT_OPEN_EDITOR_QUICK_ACTION_ORDER,
  CONTEXT_PREFERRED_OPEN_QUICK_ACTION_ID,
  CONTEXT_VIEW_QUICK_ACTION_ORDER,
  editorIdFromContextQuickActionId,
  type ContextQuickActionId,
} from "../contextQuickActions";
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
  resolveEffectiveEnvMode,
} from "./BranchToolbar.logic";
import {
  CONTEXT_BAR_ICON_TRIGGER_CLASS,
  CONTEXT_BAR_SEPARATOR_CLASS,
  CONTEXT_BAR_TEXT_TRIGGER_CLASS,
} from "./BranchToolbar.styles";
import {
  SIDEBAR_LABEL_TEXT_CLASS,
  SIDEBAR_MUTED_TEXT_CLASS,
} from "./sidebar/sidebarTextStyles";
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
  MenuSeparator,
  MenuTrigger,
} from "./ui/menu";
import { Toggle } from "./ui/toggle";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";
import { OpenInPicker, shouldShowOpenInPicker } from "./chat/OpenInPicker";

function ContextBarDraftsIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <g clipPath="url(#drafts-icon-clip)">
        <path
          d="M6.8916 2.27325C7.6237 2.13157 8.37617 2.13157 9.10827 2.27325"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M9.10827 13.7266C8.37617 13.8682 7.6237 13.8682 6.8916 13.7266"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M11.272 3.16992C11.8912 3.58947 12.4239 4.12418 12.8411 4.74492"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M2.27276 9.10729C2.13108 8.37519 2.13108 7.62272 2.27276 6.89062"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M12.8299 11.2725C12.4103 11.8917 11.8756 12.4244 11.2549 12.8416"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M13.7271 6.89062C13.8687 7.62272 13.8687 8.37519 13.7271 9.10729"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.1709 4.72737C3.59045 4.10818 4.12516 3.57545 4.7459 3.1582"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.59525 13.3189L2.90008 13.8148C2.80398 13.8403 2.70296 13.8408 2.60659 13.8163C2.51023 13.7918 2.42173 13.7431 2.34949 13.6748C2.27726 13.6065 2.22368 13.5208 2.19386 13.426C2.16403 13.3311 2.15894 13.2302 2.17908 13.1329L2.742 11.3945"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="drafts-icon-clip">
          <rect width="14" height="14" fill="white" transform="translate(1 1)" />
        </clipPath>
      </defs>
    </svg>
  );
}

interface BranchToolbarProps {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  draftId?: DraftId;
  activeProjectScripts: ProjectScript[] | undefined;
  availableEditors: ReadonlyArray<EditorId>;
  diffOpen: boolean;
  diffToggleShortcutLabel: string | null;
  draftsOpen: boolean;
  gitCwd: string | null;
  isGitRepo: boolean;
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
  onToggleDrafts: () => void;
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
const QUICK_ACCESS_LAYOUT_EPSILON_PX = 1;

function readCssPixelValue(value: string): number {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function ContextBarSeparator() {
  return <div aria-hidden="true" className={CONTEXT_BAR_SEPARATOR_CLASS} />;
}

function ContextBarSlash() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 6 12"
      className="h-[12px] w-[6px] shrink-0 text-foreground/35 dark:text-border"
      fill="none"
    >
      <path d="M5.25 0.5L0.75 11.5" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export const BranchToolbar = memo(function BranchToolbar({
  environmentId,
  threadId,
  draftId,
  activeProjectScripts,
  availableEditors,
  diffOpen,
  diffToggleShortcutLabel,
  draftsOpen,
  gitCwd,
  isGitRepo,
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
  onToggleDrafts,
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
  const [quickAccessHidden, setQuickAccessHidden] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const leftContentRef = useRef<HTMLDivElement>(null);
  const quickAccessRef = useRef<HTMLDivElement>(null);
  const moreActionsRef = useRef<HTMLDivElement>(null);
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
  const envModeLocked =
    envLocked || !isGitRepo || (serverThread !== undefined && activeWorktreePath !== null);
  const hasRenderableToolbar = hasActiveThread && activeProject !== undefined;

  const showEnvironmentPicker = Boolean(
    availableEnvironments && availableEnvironments.length > 1 && onEnvironmentChange,
  );
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
    appendIfPinned(CONTEXT_PREFERRED_OPEN_QUICK_ACTION_ID);
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
  const updateQuickAccessVisibility = useCallback(() => {
    const toolbarElement = toolbarRef.current;
    const leftContentElement = leftContentRef.current;
    const moreActionsElement = moreActionsRef.current;
    const quickAccessElement = quickAccessRef.current;

    if (!toolbarElement || !leftContentElement || !moreActionsElement || !quickAccessElement) {
      setQuickAccessHidden(false);
      return;
    }

    const toolbarStyle = window.getComputedStyle(toolbarElement);
    const toolbarContentWidth =
      toolbarElement.clientWidth -
      readCssPixelValue(toolbarStyle.paddingLeft) -
      readCssPixelValue(toolbarStyle.paddingRight);
    const toolbarGapWidth = readCssPixelValue(toolbarStyle.columnGap);
    const fullQuickAccessWidth = quickAccessElement.scrollWidth;
    const requiredWidthWithQuickAccess =
      leftContentElement.scrollWidth +
      moreActionsElement.offsetWidth +
      toolbarGapWidth +
      fullQuickAccessWidth;
    const shouldHideQuickAccess =
      fullQuickAccessWidth > 0 &&
      requiredWidthWithQuickAccess > toolbarContentWidth + QUICK_ACCESS_LAYOUT_EPSILON_PX;

    setQuickAccessHidden((currentValue) =>
      currentValue === shouldHideQuickAccess ? currentValue : shouldHideQuickAccess,
    );
  }, []);

  useLayoutEffect(() => {
    if (!hasRenderableToolbar) return;
    updateQuickAccessVisibility();
  });

  useLayoutEffect(() => {
    if (!hasRenderableToolbar) return;

    updateQuickAccessVisibility();
    window.addEventListener("resize", updateQuickAccessVisibility);

    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.removeEventListener("resize", updateQuickAccessVisibility);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      updateQuickAccessVisibility();
    });
    const observedElements = [
      toolbarRef.current,
      leftContentRef.current,
      quickAccessRef.current,
      moreActionsRef.current,
    ];

    for (const element of observedElements) {
      if (element) resizeObserver.observe(element);
    }

    return () => {
      window.removeEventListener("resize", updateQuickAccessVisibility);
      resizeObserver.disconnect();
    };
  }, [hasRenderableToolbar, updateQuickAccessVisibility]);

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
      if (actionId === CONTEXT_PREFERRED_OPEN_QUICK_ACTION_ID) {
        if (!showOpenInPicker) return [];
        return [
          {
            actionId,
            node: (
              <OpenInPicker
                presentation="composer-bar"
                keybindings={keybindings}
                availableEditors={availableEditors}
                openInCwd={openInCwd}
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
  const draftsQuickActionNode: ContextQuickActionNode = {
    actionId: "drafts.toggle",
    node: (
      <Tooltip>
        <TooltipTrigger
          render={
            <Toggle
              className={CONTEXT_BAR_ICON_TRIGGER_CLASS}
              pressed={draftsOpen}
              onPressedChange={onToggleDrafts}
              aria-label="Toggle drafts panel"
              variant="outline"
              size="xs"
            />
          }
        >
          <ContextBarDraftsIcon className="size-4" />
        </TooltipTrigger>
        <TooltipPopup side="top">Drafts</TooltipPopup>
      </Tooltip>
    ),
  };
  const quickActionNodesWithDrafts: ContextQuickActionNode[] = [];
  let insertedDraftsQuickAction = false;
  for (const node of quickActionNodes) {
    if (!insertedDraftsQuickAction && node.actionId === "terminal.toggle") {
      quickActionNodesWithDrafts.push(draftsQuickActionNode);
      insertedDraftsQuickAction = true;
    }
    quickActionNodesWithDrafts.push(node);
  }
  if (!insertedDraftsQuickAction) {
    quickActionNodesWithDrafts.push(draftsQuickActionNode);
  }
  const quickAccessNodes = [...projectQuickActionNodes, ...quickActionNodesWithDrafts];

  return (
    <div
      ref={toolbarRef}
      className="mx-auto flex w-full max-w-208 min-w-0 items-center justify-between gap-2 pb-2 pl-3 pr-4 pt-1 dark:drop-shadow-[0_4px_2px_rgba(0,0,0,0.25)]"
      data-chat-context-bar="true"
    >
      <div
        ref={leftContentRef}
        className="flex min-w-0 items-center gap-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {!isGitRepo ? (
          <div
            className="flex h-8 min-w-0 shrink-0 items-center gap-2 px-2 text-left"
            title={activeProject.cwd}
          >
            <ProjectFavicon
              environmentId={activeProject.environmentId}
              cwd={activeProject.cwd}
              label={activeProject.name}
              projectKey={activeProject.id}
              className="size-4 dark:text-white/[0.175]"
            />
            <span
              className={`min-w-0 truncate ${SIDEBAR_MUTED_TEXT_CLASS} ${SIDEBAR_LABEL_TEXT_CLASS}`}
            >
              {activeProject.name}
            </span>
          </div>
        ) : (
          <>
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

            <ContextBarSeparator />
            <BranchToolbarBranchSelector
              className="min-w-0 max-w-40 justify-start"
              environmentId={environmentId}
              threadId={threadId}
              {...(draftId ? { draftId } : {})}
              envLocked={envLocked}
              {...(effectiveEnvModeOverride ? { effectiveEnvModeOverride } : {})}
              {...(activeThreadBranchOverride !== undefined ? { activeThreadBranchOverride } : {})}
              {...(onActiveThreadBranchOverrideChange
                ? { onActiveThreadBranchOverrideChange }
                : {})}
              {...(onCheckoutPullRequestRequest ? { onCheckoutPullRequestRequest } : {})}
              {...(onComposerFocusRequest ? { onComposerFocusRequest } : {})}
            />
          </>
        )}
      </div>

      <div
        className={`relative flex shrink-0 items-center justify-end gap-0 ${SIDEBAR_MUTED_TEXT_CLASS} ${SIDEBAR_LABEL_TEXT_CLASS}`}
      >
        {quickAccessNodes.length > 0 ? (
          <div
            ref={quickAccessRef}
            aria-hidden={quickAccessHidden}
            className={`flex shrink-0 items-center justify-end gap-0 ${
              quickAccessHidden ? "invisible pointer-events-none absolute right-0 top-0" : ""
            }`}
          >
            {quickAccessNodes.map((entry, index) => (
              <Fragment key={entry.actionId}>
                {index > 0 ? <ContextBarSeparator /> : null}
                {entry.node}
              </Fragment>
            ))}
            <ContextBarSeparator />
          </div>
        ) : null}
        <div ref={moreActionsRef} className="flex shrink-0 items-center justify-end">
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
                  icon={<ContextBarDraftsIcon className="size-4" />}
                  onSelect={onToggleDrafts}
                >
                  Drafts
                </ContextActionMenuItem>
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
    </div>
  );
});
