import { useNavigate, useRouter } from "@tanstack/react-router";
import { EllipsisIcon, PlusIcon, XIcon } from "lucide-react";
import {
  DockviewReact,
  type DockviewApi,
  type IDockviewHeaderActionsProps,
  type IDockviewPanelHeaderProps,
  type DockviewReadyEvent,
  type IDockviewPanelProps,
  type IWatermarkPanelProps,
  type SerializedDockview,
} from "dockview";
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { finalizePromotedDraftThreadByRef, useComposerDraftStore } from "../../composerDraftStore";
import {
  type DiffRouteSearch,
  type DiffRouteSearchUpdater,
  diffRouteSearchForNavigation,
  parseDiffRouteSearch,
} from "../../diffRouteSearch";
import { selectEnvironmentState, selectThreadExistsByRef, useStore } from "../../store";
import { createThreadSelectorByRef } from "../../storeSelectors";
import { buildDraftThreadRouteParams, buildThreadRouteParams } from "../../threadRoutes";
import { isElectron } from "../../env";
import { useHandleNewThread } from "../../hooks/useHandleNewThread";
import { useSettings } from "../../hooks/useSettings";
import { shortcutLabelForCommand } from "../../keybindings";
import {
  buildContextualThreadOptions,
  resolveThreadActionProjectRef,
} from "../../lib/chatThreadActions";
import { cn, isMacPlatform } from "../../lib/utils";
import { useServerKeybindings } from "../../rpc/serverState";
import {
  EMPTY_CHAT_WORKSPACE_STATE,
  readPersistedChatWorkspaceState,
  writePersistedChatWorkspaceState,
  type PersistedChatWorkspaceStateV1,
} from "../../workspace/workspacePersistence";
import {
  resolveWorkspacePanelIdForOpenRequest,
  useChatWorkspaceControllerStore,
  type ChatWorkspaceDraftThreadRequest,
  type ChatWorkspaceOpenRequest,
} from "../../workspace/chatWorkspaceController";
import {
  createChatWorkspacePanelId,
  getChatWorkspaceRouteTargetKey,
  isChatWorkspacePanelId,
  type ChatWorkspacePanelId,
  type ChatWorkspacePanelState,
  type ChatWorkspacePanelTarget,
} from "../../workspace/workspacePanelIds";
import { threadHasStarted } from "../ChatView.logic";
import { NoActiveThreadContent } from "../NoActiveThreadState";
import { resolveSidebarNewThreadEnvMode } from "../Sidebar.logic";
import { SIDEBAR_LABEL_TEXT_CLASS } from "../sidebar/sidebarTextStyles";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { SidebarInset, SidebarTrigger, useSidebar } from "../ui/sidebar";
import { ChatWorkspacePanel } from "./ChatWorkspacePanel";

const CHAT_PANEL_COMPONENT_ID = "chatContainer";
const WORKSPACE_PERSIST_DEBOUNCE_MS = 250;
const TOP_RIGHT_HEADER_EDGE_TOLERANCE_PX = 2;
const WORKSPACE_TAB_MIN_WIDTH_PX = 96;
const WORKSPACE_TAB_HORIZONTAL_PADDING_PX = 16;
const WORKSPACE_TAB_ITEM_GAP_PX = 4;
const WORKSPACE_TAB_CONTAINER_GAP_PX = 2;
const WORKSPACE_TAB_SIZING_TOLERANCE_PX = 1;

type WorkspaceRestorePhase = "pending" | "restoring" | "settled";
type StartupRoutePolicy = "restore-saved-active";

const STARTUP_ROUTE_POLICY: StartupRoutePolicy = "restore-saved-active";

export interface ChatWorkspaceRouteTarget {
  target: ChatWorkspacePanelTarget;
  diffSearch: DiffRouteSearch;
}

interface ChatWorkspaceContextValue {
  activePanelId: ChatWorkspacePanelId | null;
  newThreadShortcutLabel: string | null;
  onCreateDraftPanel: (referenceGroupId?: string) => void;
  onDiffSearchChange: (panelId: ChatWorkspacePanelId, next: DiffRouteSearchUpdater) => void;
  panelsById: Record<ChatWorkspacePanelId, ChatWorkspacePanelState>;
}

const ChatWorkspaceContext = createContext<ChatWorkspaceContextValue | null>(null);

function useChatWorkspaceContext(): ChatWorkspaceContextValue {
  const context = useContext(ChatWorkspaceContext);
  if (!context) {
    throw new Error("ChatWorkspace panels must render inside ChatWorkspace.");
  }
  return context;
}

function normalizePanelId(id: string): ChatWorkspacePanelId | null {
  return isChatWorkspacePanelId(id) ? id : null;
}

function fallbackPanelTitle(state: ChatWorkspacePanelState): string {
  if (state.kind === "empty") {
    return "New tab";
  }
  return state.target.kind === "draft" ? "New thread" : "Thread";
}

function sameDiffSearch(left: DiffRouteSearch, right: DiffRouteSearch): boolean {
  return (
    left.diff === right.diff &&
    left.diffTurnId === right.diffTurnId &&
    left.diffFilePath === right.diffFilePath
  );
}

function samePanelTarget(left: ChatWorkspacePanelTarget, right: ChatWorkspacePanelTarget): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (
    left.ref.environmentId !== right.ref.environmentId ||
    left.ref.threadId !== right.ref.threadId
  ) {
    return false;
  }
  if (left.kind === "draft" && right.kind === "draft") {
    return left.draftId === right.draftId;
  }
  return true;
}

function samePanelState(left: ChatWorkspacePanelState, right: ChatWorkspacePanelState): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "empty" || right.kind === "empty") {
    return true;
  }
  return (
    samePanelTarget(left.target, right.target) && sameDiffSearch(left.diffSearch, right.diffSearch)
  );
}

function routeSyncKeyForPanelTarget(
  target: ChatWorkspacePanelTarget,
  diffSearch: DiffRouteSearch,
): string {
  if (target.kind === "draft") {
    return `draft:${target.draftId}`;
  }

  const normalizedDiffSearch = parseDiffRouteSearch({ ...diffSearch });
  return `thread:${target.ref.environmentId}:${target.ref.threadId}:${normalizedDiffSearch.diff ?? ""}:${normalizedDiffSearch.diffTurnId ?? ""}:${normalizedDiffSearch.diffFilePath ?? ""}`;
}

function routeKeyForWorkspaceRouteTarget(target: ChatWorkspaceRouteTarget | null): string | null {
  return target ? getChatWorkspaceRouteTargetKey(target) : null;
}

function nextDiffSearch(previous: DiffRouteSearch, next: DiffRouteSearchUpdater): DiffRouteSearch {
  const rawNext = typeof next === "function" ? next(previous) : next;
  return parseDiffRouteSearch({ ...rawNext });
}

function removePanelState(
  panelsById: Record<ChatWorkspacePanelId, ChatWorkspacePanelState>,
  panelId: ChatWorkspacePanelId,
): Record<ChatWorkspacePanelId, ChatWorkspacePanelState> {
  if (!(panelId in panelsById)) {
    return panelsById;
  }
  const next = { ...panelsById };
  delete next[panelId];
  return next;
}

function persistedStateWithDockview(
  state: PersistedChatWorkspaceStateV1,
  dockview: unknown,
): PersistedChatWorkspaceStateV1 {
  return {
    ...state,
    dockview: dockview && typeof dockview === "object" ? dockview : null,
  };
}

function DockviewWatermark(_props: IWatermarkPanelProps) {
  return <NoActiveThreadContent />;
}

function DockviewHeaderIconButton(props: {
  "aria-label": string;
  children: ReactNode;
  className?: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={props["aria-label"]}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full text-[#7a7a7a] transition-colors hover:bg-white/[0.05] hover:text-[#bab9ba] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3a3a3a]",
        props.className,
      )}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      title={props.title}
      type="button"
    >
      {props.children}
    </button>
  );
}

function getDockviewHeaderElements(actionsElement: HTMLElement | null): {
  dockviewElement: HTMLElement | null;
  headerElement: HTMLElement | null;
  tabsContainer: HTMLElement | null;
} {
  const headerElement = actionsElement?.closest(".dv-tabs-and-actions-container");
  const tabsContainer = headerElement?.querySelector(".dv-tabs-container");
  const dockviewElement = actionsElement?.closest(".t3code-dockview-theme");

  return {
    dockviewElement: dockviewElement instanceof HTMLElement ? dockviewElement : null,
    headerElement: headerElement instanceof HTMLElement ? headerElement : null,
    tabsContainer: tabsContainer instanceof HTMLElement ? tabsContainer : null,
  };
}

function getWorkspaceTabNaturalWidth(tabElement: HTMLElement): number {
  const titleElement = tabElement.querySelector<HTMLElement>(".t3-workspace-tab-title");
  const closeElement = tabElement.querySelector<HTMLElement>(".t3-workspace-tab-close");
  const closeWidth = closeElement?.offsetWidth ?? 0;
  const closeChromeWidth = closeWidth > 0 ? closeWidth + WORKSPACE_TAB_ITEM_GAP_PX : 0;
  const contentWidth =
    (titleElement?.scrollWidth ?? tabElement.scrollWidth) +
    WORKSPACE_TAB_HORIZONTAL_PADDING_PX +
    closeChromeWidth;

  return Math.max(WORKSPACE_TAB_MIN_WIDTH_PX, Math.ceil(contentWidth));
}

function resolveWorkspaceTabSizing(
  tabsContainer: HTMLElement,
  tabElements: readonly HTMLElement[],
): "fill" | "hug" {
  if (tabElements.length <= 1) {
    return "hug";
  }

  const availableWidth = tabsContainer.clientWidth;
  const naturalTabsWidth =
    tabElements.reduce((total, tabElement) => total + getWorkspaceTabNaturalWidth(tabElement), 0) +
    Math.max(0, tabElements.length - 1) * WORKSPACE_TAB_CONTAINER_GAP_PX;

  return naturalTabsWidth > availableWidth + WORKSPACE_TAB_SIZING_TOLERANCE_PX ? "fill" : "hug";
}

function isTopRightDockviewHeader(actionsElement: HTMLElement | null): boolean {
  const { dockviewElement, headerElement } = getDockviewHeaderElements(actionsElement);
  if (!dockviewElement || !headerElement) {
    return false;
  }

  const dockviewRect = dockviewElement.getBoundingClientRect();
  const headerRect = headerElement.getBoundingClientRect();
  return (
    Math.abs(headerRect.top - dockviewRect.top) <= TOP_RIGHT_HEADER_EDGE_TOLERANCE_PX &&
    Math.abs(headerRect.right - dockviewRect.right) <= TOP_RIGHT_HEADER_EDGE_TOLERANCE_PX
  );
}

function DockviewPrefixHeaderActions(props: IDockviewHeaderActionsProps) {
  const sidebar = useSidebar();
  const isPrimaryGroup = props.containerApi.groups[0]?.id === props.group.id;
  const shouldReserveMacTrafficLights =
    isPrimaryGroup &&
    isElectron &&
    (sidebar.isMobile || !sidebar.open) &&
    isMacPlatform(typeof navigator === "undefined" ? "" : navigator.platform);

  if (!isPrimaryGroup) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex h-full items-start py-0 pl-2 pr-2 pt-2 wco-windows:pt-1",
        shouldReserveMacTrafficLights && "pl-[90px] wco:pl-[calc(env(titlebar-area-x)+1em)]",
      )}
    >
      <SidebarTrigger
        className="size-8 rounded-full !bg-transparent text-muted-foreground hover:!bg-transparent hover:text-foreground focus-visible:!ring-0 focus-visible:ring-offset-0 active:!bg-transparent data-pressed:!bg-transparent dark:text-white/50 dark:hover:text-white/86"
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      />
    </div>
  );
}

function DockviewRightHeaderActions(props: IDockviewHeaderActionsProps) {
  const { newThreadShortcutLabel, onCreateDraftPanel } = useChatWorkspaceContext();
  const actionsRef = useRef<HTMLDivElement | null>(null);
  const [reserveWindowControlsInset, setReserveWindowControlsInset] = useState(false);
  const [overflowMenuItems, setOverflowMenuItems] = useState<
    Array<{ id: string; title: string; isActive: boolean }>
  >([]);
  const panelIdsKey = props.panels.map((panel) => panel.id).join("\0");
  const canCloseWorkspaceGroup =
    props.containerApi.groups.length > 1 && props.group.panels.length === 1;

  const updateOverflowMenuItems = useCallback(() => {
    const actionsElement = actionsRef.current;
    const { tabsContainer } = getDockviewHeaderElements(actionsElement);
    if (!tabsContainer) {
      setOverflowMenuItems([]);
      return;
    }

    const tabElements = Array.from(tabsContainer.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement && element.classList.contains("dv-tab"),
    );
    const tabSizing = resolveWorkspaceTabSizing(tabsContainer, tabElements);
    if (tabsContainer.dataset.tabSizing !== tabSizing) {
      tabsContainer.dataset.tabSizing = tabSizing;
    }

    const containerRect = tabsContainer.getBoundingClientRect();
    const groupPanels = props.group.panels.length > 0 ? props.group.panels : props.panels;
    const nextItems: Array<{ id: string; title: string; isActive: boolean }> = [];
    const visibilityTolerancePx = 1;

    for (const [index, tabElement] of tabElements.entries()) {
      const panel = groupPanels[index];
      if (!panel) {
        continue;
      }

      const tabRect = tabElement.getBoundingClientRect();
      const isHidden =
        tabRect.left < containerRect.left - visibilityTolerancePx ||
        tabRect.right > containerRect.right + visibilityTolerancePx;
      if (isHidden) {
        nextItems.push({
          id: panel.id,
          title: panel.title?.trim() || "Thread",
          isActive: panel.api.isActive,
        });
      }
    }

    setOverflowMenuItems((previous) => {
      if (
        previous.length === nextItems.length &&
        previous.every(
          (item, index) =>
            item.id === nextItems[index]?.id &&
            item.title === nextItems[index]?.title &&
            item.isActive === nextItems[index]?.isActive,
        )
      ) {
        return previous;
      }
      return nextItems;
    });
  }, [props.group, props.panels]);

  useLayoutEffect(() => {
    let animationFrameId: number | null = null;
    const scheduleUpdate = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        setReserveWindowControlsInset(isTopRightDockviewHeader(actionsRef.current));
        updateOverflowMenuItems();
      });
    };

    scheduleUpdate();

    const actionsElement = actionsRef.current;
    const { dockviewElement, headerElement, tabsContainer } =
      getDockviewHeaderElements(actionsElement);
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    if (dockviewElement) {
      resizeObserver.observe(dockviewElement);
    }
    if (headerElement) {
      resizeObserver.observe(headerElement);
    }
    if (tabsContainer) {
      resizeObserver.observe(tabsContainer);
    }

    const mutationObserver = new MutationObserver(scheduleUpdate);
    if (tabsContainer) {
      mutationObserver.observe(tabsContainer, {
        attributeFilter: ["class", "style"],
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    const disposables = [
      props.containerApi.onDidLayoutChange(scheduleUpdate),
      props.containerApi.onDidActivePanelChange(scheduleUpdate),
      props.containerApi.onDidAddPanel(scheduleUpdate),
      props.containerApi.onDidRemovePanel(scheduleUpdate),
      ...props.panels.flatMap((panel) => [
        panel.api.onDidActiveChange(scheduleUpdate),
        panel.api.onDidTitleChange(scheduleUpdate),
      ]),
    ];

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      for (const disposable of disposables) {
        disposable.dispose();
      }
    };
  }, [
    panelIdsKey,
    props.containerApi,
    props.panels,
    updateOverflowMenuItems,
  ]);

  return (
    <div
      ref={actionsRef}
      className={cn(
        "flex h-full items-start gap-1 px-2 pt-2 wco-windows:pt-1",
        reserveWindowControlsInset &&
          "wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+8px)]",
      )}
    >
      {overflowMenuItems.length > 0 ? (
        <Menu>
          <MenuTrigger
            render={
              <button
                aria-label="More workspace tabs"
                className="inline-flex size-8 items-center justify-center rounded-full text-[#7a7a7a] transition-colors hover:bg-white/[0.05] hover:text-[#bab9ba] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#3a3a3a]"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                title="More workspace tabs"
                type="button"
              />
            }
          >
            <EllipsisIcon className="size-4" />
          </MenuTrigger>
          <MenuPopup align="end" className="min-w-56 max-w-80" side="bottom">
            {overflowMenuItems.map((item) => (
              <MenuItem
                key={item.id}
                className="max-w-72"
                onClick={() => {
                  props.group.panels.find((panel) => panel.id === item.id)?.api.setActive();
                }}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    item.isActive ? "bg-foreground" : "bg-transparent",
                  )}
                />
                <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                  {item.title}
                </span>
              </MenuItem>
            ))}
          </MenuPopup>
        </Menu>
      ) : null}
      <DockviewHeaderIconButton
        aria-label="New workspace tab"
        className="!bg-transparent !text-muted-foreground hover:!bg-transparent hover:!text-foreground focus-visible:!ring-0 dark:!text-white/50 dark:hover:!text-white/86"
        onClick={() => {
          onCreateDraftPanel(props.group.id);
        }}
        title={
          newThreadShortcutLabel
            ? `New thread in new tab (${newThreadShortcutLabel})`
            : "New thread in new tab"
        }
      >
        <PlusIcon className="size-4" />
      </DockviewHeaderIconButton>
      {canCloseWorkspaceGroup ? (
        <DockviewHeaderIconButton
          aria-label="Close workspace split"
          onClick={() => {
            props.api.close();
          }}
          title="Close workspace split"
        >
          <XIcon className="size-4" />
        </DockviewHeaderIconButton>
      ) : null}
    </div>
  );
}

function DockviewChatTab(props: IDockviewPanelHeaderProps) {
  const [title, setTitle] = useState(
    () => props.api.title ?? fallbackPanelTitle({ kind: "empty" }),
  );
  const [isActive, setIsActive] = useState(() => props.api.isActive);

  useEffect(() => {
    setTitle(props.api.title ?? fallbackPanelTitle({ kind: "empty" }));
    const titleDisposable = props.api.onDidTitleChange((event) => {
      setTitle(event.title);
    });
    const activeDisposable = props.api.onDidActiveChange((event) => {
      setIsActive(event.isActive);
    });
    return () => {
      titleDisposable.dispose();
      activeDisposable.dispose();
    };
  }, [props.api]);

  return (
    <div
      className={cn(
        "t3-workspace-tab flex h-8 w-full items-center gap-1 overflow-hidden rounded-md border border-transparent px-2 py-0 transition-colors",
        SIDEBAR_LABEL_TEXT_CLASS,
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/72 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground dark:text-white/82",
      )}
      title={title}
    >
      <span className="t3-workspace-tab-title min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
        {title}
      </span>
      {isActive ? (
        <button
          aria-label={`Close ${title}`}
          className="t3-workspace-tab-close inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-sidebar-foreground/55 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.api.close();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          type="button"
        >
          <XIcon className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

const DockviewChatPanel = memo(function DockviewChatPanel(
  props: IDockviewPanelProps<{ panelId?: ChatWorkspacePanelId }>,
) {
  const panelId = normalizePanelId(props.params?.panelId ?? props.api.id);
  const { activePanelId, onDiffSearchChange, panelsById } = useChatWorkspaceContext();
  const panelState = panelId ? panelsById[panelId] : undefined;
  const threadRef = panelState?.kind === "chat" ? panelState.target.ref : null;
  const [active, setActive] = useState(() => props.api.isActive);
  const [visible, setVisible] = useState(() => props.api.isVisible);
  const thread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));

  useEffect(() => {
    const title =
      panelState?.kind === "empty"
        ? "New tab"
        : panelState?.target.kind === "draft"
          ? "New thread"
          : thread?.title?.trim() || "Thread";
    props.api.setTitle(title);
  }, [panelState, props.api, thread?.title]);

  useEffect(() => {
    const activeDisposable = props.api.onDidActiveChange((event) => {
      setActive(event.isActive);
    });
    const visibleDisposable = props.api.onDidVisibilityChange((event) => {
      setVisible(event.isVisible);
    });
    return () => {
      activeDisposable.dispose();
      visibleDisposable.dispose();
    };
  }, [props.api]);

  if (!panelId) {
    return <NoActiveThreadContent />;
  }

  return (
    <ChatWorkspacePanel
      active={active && activePanelId === panelId}
      onDiffSearchChange={onDiffSearchChange}
      panelId={panelId}
      panelState={panelState}
      visible={visible}
    />
  );
});

export interface ChatWorkspaceProps {
  routeTarget?: ChatWorkspaceRouteTarget | null;
  children?: ReactNode;
}

export function ChatWorkspace({ children, routeTarget = null }: ChatWorkspaceProps) {
  const navigate = useNavigate();
  const router = useRouter();
  const keybindings = useServerKeybindings();
  const settings = useSettings();
  const { activeDraftThread, activeThread, createDraftThread, defaultProjectRef, handleNewThread } =
    useHandleNewThread();
  const apiRef = useRef<DockviewApi | null>(null);
  const restoredRef = useRef(false);
  const restorePhaseRef = useRef<WorkspaceRestorePhase>("pending");
  const startupRoutePolicyRef = useRef<StartupRoutePolicy>(STARTUP_ROUTE_POLICY);
  const initialRouteTargetKeyRef = useRef<string | null>(
    routeKeyForWorkspaceRouteTarget(routeTarget),
  );
  const hasRestoredPersistedPanelsRef = useRef(false);
  const persistTimerRef = useRef<number | null>(null);
  const routeSyncFrameRef = useRef<number | null>(null);
  const restoreSettleFrameRef = useRef<number | null>(null);
  const lastAppliedRouteTargetKeyRef = useRef<string | null>(null);
  const lastRouteSyncRef = useRef<string | null>(null);
  const ignoredStartupRouteTargetKeyRef = useRef<string | null>(null);
  const pendingRoutePanelIdRef = useRef<ChatWorkspacePanelId | null>(null);
  const pendingActivePanelRouteSyncRef = useRef<ChatWorkspacePanelId | null>(null);
  const routeTargetRef = useRef<ChatWorkspaceRouteTarget | null>(routeTarget);
  const panelsByIdRef = useRef<Record<ChatWorkspacePanelId, ChatWorkspacePanelState>>({});
  const activePanelIdRef = useRef<ChatWorkspacePanelId | null>(null);
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [panelsById, setPanelsById] = useState<
    Record<ChatWorkspacePanelId, ChatWorkspacePanelState>
  >({});
  const [activePanelId, setActivePanelId] = useState<ChatWorkspacePanelId | null>(null);
  const registerWorkspaceController = useChatWorkspaceControllerStore(
    (state) => state.registerController,
  );
  const setWorkspaceControllerActivePanelId = useChatWorkspaceControllerStore(
    (state) => state.setActivePanelId,
  );
  const newThreadShortcutLabel = useMemo(
    () => shortcutLabelForCommand(keybindings, "chat.new"),
    [keybindings],
  );

  useEffect(() => {
    panelsByIdRef.current = panelsById;
  }, [panelsById]);

  useEffect(() => {
    routeTargetRef.current = routeTarget;
  }, [routeTarget]);

  useEffect(() => {
    activePanelIdRef.current = activePanelId;
    setWorkspaceControllerActivePanelId(activePanelId);
  }, [activePanelId, setWorkspaceControllerActivePanelId]);

  const persistNow = useCallback(() => {
    if (!restoredRef.current) {
      return;
    }
    const currentApi = apiRef.current;
    const dockview = currentApi ? currentApi.toJSON() : null;
    writePersistedChatWorkspaceState({
      version: 1,
      dockview,
      panelsById: panelsByIdRef.current,
      activePanelId: activePanelIdRef.current,
    });
  }, []);

  const schedulePersist = useCallback(() => {
    if (!restoredRef.current) {
      return;
    }
    if (persistTimerRef.current) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      persistNow();
    }, WORKSPACE_PERSIST_DEBOUNCE_MS);
  }, [persistNow]);

  useEffect(() => {
    schedulePersist();
  }, [activePanelId, panelsById, schedulePersist]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
      if (routeSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(routeSyncFrameRef.current);
        routeSyncFrameRef.current = null;
      }
      if (restoreSettleFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreSettleFrameRef.current);
        restoreSettleFrameRef.current = null;
      }
      persistNow();
    };
  }, [persistNow]);

  const ensureDockviewPanel = useCallback(
    (
      currentApi: DockviewApi,
      panelId: ChatWorkspacePanelId,
      panelState: ChatWorkspacePanelState,
      referenceGroupId?: string,
    ) => {
      const existingPanel = currentApi.getPanel(panelId);
      if (existingPanel) {
        return existingPanel;
      }

      const panelOptions = {
        id: panelId,
        component: CHAT_PANEL_COMPONENT_ID,
        title: fallbackPanelTitle(panelState),
        params: { panelId },
        renderer: "onlyWhenVisible" as const,
      };

      return referenceGroupId && currentApi.getGroup(referenceGroupId)
        ? currentApi.addPanel({
            ...panelOptions,
            position: {
              referenceGroup: referenceGroupId,
              direction: "within" as const,
            },
          })
        : currentApi.addPanel(panelOptions);
    },
    [],
  );

  const setPanelEmptyTarget = useCallback(
    (panelId: ChatWorkspacePanelId, referenceGroupId?: string): boolean => {
      const currentApi = apiRef.current;
      if (!currentApi) {
        return false;
      }

      const nextState: ChatWorkspacePanelState = { kind: "empty" };
      const previousState = panelsByIdRef.current[panelId];
      if (!previousState || !samePanelState(previousState, nextState)) {
        const nextPanelsById = {
          ...panelsByIdRef.current,
          [panelId]: nextState,
        };
        panelsByIdRef.current = nextPanelsById;
        setPanelsById(nextPanelsById);
      }

      const panel = ensureDockviewPanel(currentApi, panelId, nextState, referenceGroupId);
      if (currentApi.activePanel?.id !== panelId) {
        panel.api.setActive();
      }
      if (activePanelIdRef.current !== panelId) {
        activePanelIdRef.current = panelId;
        setActivePanelId(panelId);
      }
      return true;
    },
    [ensureDockviewPanel],
  );

  const setPanelChatTarget = useCallback(
    (
      panelId: ChatWorkspacePanelId,
      target: ChatWorkspacePanelTarget,
      diffSearch: DiffRouteSearch,
      referenceGroupId?: string,
    ): boolean => {
      const currentApi = apiRef.current;
      if (!currentApi) {
        return false;
      }

      const nextState: ChatWorkspacePanelState = {
        kind: "chat",
        target,
        diffSearch: parseDiffRouteSearch({ ...diffSearch }),
      };
      const previousState = panelsByIdRef.current[panelId];
      if (!previousState || !samePanelState(previousState, nextState)) {
        const nextPanelsById = {
          ...panelsByIdRef.current,
          [panelId]: nextState,
        };
        panelsByIdRef.current = nextPanelsById;
        setPanelsById(nextPanelsById);
      }

      const panel = ensureDockviewPanel(currentApi, panelId, nextState, referenceGroupId);
      if (currentApi.activePanel?.id !== panelId) {
        panel.api.setActive();
      }
      if (activePanelIdRef.current !== panelId) {
        activePanelIdRef.current = panelId;
        setActivePanelId(panelId);
      }
      return true;
    },
    [ensureDockviewPanel],
  );

  const openWorkspaceTarget = useCallback(
    (request: ChatWorkspaceOpenRequest): ChatWorkspacePanelId | null => {
      const currentApi = apiRef.current;
      if (!currentApi) {
        return null;
      }

      const panelId = resolveWorkspacePanelIdForOpenRequest({
        activePanelId: activePanelIdRef.current,
        createPanelId: createChatWorkspacePanelId,
        hasPanel: (candidatePanelId) => currentApi.getPanel(candidatePanelId) !== undefined,
        request,
      });

      const didOpen =
        request.target.kind === "empty"
          ? setPanelEmptyTarget(panelId, request.referenceGroupId)
          : setPanelChatTarget(
              panelId,
              request.target.kind === "thread"
                ? {
                    kind: "thread",
                    ref: request.target.ref,
                  }
                : {
                    kind: "draft",
                    draftId: request.target.draftId,
                    ref: request.target.ref,
                  },
              request.target.diffSearch ?? {},
              request.referenceGroupId,
            );

      return didOpen ? panelId : null;
    },
    [setPanelChatTarget, setPanelEmptyTarget],
  );

  const createDraftPanelForProject = useCallback(
    (request: ChatWorkspaceDraftThreadRequest) => {
      const context = {
        activeDraftThread,
        activeThread,
        defaultProjectRef,
        defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
          defaultEnvMode: settings.defaultThreadEnvMode,
        }),
        handleNewThread,
      };
      const createdDraftThread = createDraftThread(request.projectRef, {
        ...buildContextualThreadOptions(context, { forceNewDraft: true }),
        ...request.options,
        forceNewDraft: true,
      });

      const panelId = openWorkspaceTarget({
        disposition: request.disposition,
        ...(request.referenceGroupId ? { referenceGroupId: request.referenceGroupId } : {}),
        target: {
          kind: "draft",
          draftId: createdDraftThread.draftId,
          ref: createdDraftThread.ref,
        },
      });
      if (!panelId) {
        useComposerDraftStore.getState().clearDraftThread(createdDraftThread.draftId);
        return null;
      }

      persistNow();
      return createdDraftThread;
    },
    [
      activeDraftThread,
      activeThread,
      createDraftThread,
      defaultProjectRef,
      handleNewThread,
      openWorkspaceTarget,
      persistNow,
      settings.defaultThreadEnvMode,
    ],
  );

  const createDraftPanel = useCallback(
    (referenceGroupId?: string) => {
      const context = {
        activeDraftThread,
        activeThread,
        defaultProjectRef,
        defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
          defaultEnvMode: settings.defaultThreadEnvMode,
        }),
        handleNewThread,
      };
      const projectRef = resolveThreadActionProjectRef(context);
      if (!projectRef) {
        return;
      }

      createDraftPanelForProject({
        projectRef,
        disposition: "new-panel",
        ...(referenceGroupId ? { referenceGroupId } : {}),
      });
    },
    [
      activeDraftThread,
      activeThread,
      createDraftPanelForProject,
      defaultProjectRef,
      handleNewThread,
      settings.defaultThreadEnvMode,
    ],
  );

  useEffect(
    () =>
      registerWorkspaceController({
        createDraftThreadPanel: createDraftPanelForProject,
        openWorkspaceTarget,
      }),
    [createDraftPanelForProject, openWorkspaceTarget, registerWorkspaceController],
  );

  const closePanel = useCallback((panelId: ChatWorkspacePanelId) => {
    const currentApi = apiRef.current;
    const panel = currentApi?.getPanel(panelId);
    if (currentApi && panel) {
      currentApi.removePanel(panel);
    }
    setPanelsById((previous) => {
      const next = removePanelState(previous, panelId);
      panelsByIdRef.current = next;
      return next;
    });
    if (activePanelIdRef.current === panelId) {
      const nextPanelId = currentApi?.activePanel
        ? normalizePanelId(currentApi.activePanel.id)
        : null;
      activePanelIdRef.current = nextPanelId;
      setActivePanelId(nextPanelId);
    }
  }, []);

  const syncActivePanelRoute = useCallback(
    (panelId: ChatWorkspacePanelId | null) => {
      if (!restoredRef.current || restorePhaseRef.current !== "settled") {
        return;
      }

      if (!panelId) {
        if (lastRouteSyncRef.current !== "index") {
          lastRouteSyncRef.current = "index";
          void navigate({ to: "/", replace: true });
        }
        return;
      }

      const panelState = panelsByIdRef.current[panelId];
      if (!panelState) {
        return;
      }

      if (panelState.kind === "empty") {
        if (lastRouteSyncRef.current !== "index") {
          lastRouteSyncRef.current = "index";
          void navigate({ to: "/", replace: true });
        }
        return;
      }

      if (panelState.target.kind === "draft") {
        const key = routeSyncKeyForPanelTarget(panelState.target, panelState.diffSearch);
        if (lastRouteSyncRef.current === key) {
          return;
        }
        lastRouteSyncRef.current = key;
        void navigate({
          to: "/draft/$draftId",
          params: buildDraftThreadRouteParams(panelState.target.draftId),
          replace: true,
        });
        return;
      }

      const routeDiffSearch = diffRouteSearchForNavigation(panelState.diffSearch);
      const key = routeSyncKeyForPanelTarget(panelState.target, panelState.diffSearch);
      if (lastRouteSyncRef.current === key) {
        return;
      }
      lastRouteSyncRef.current = key;
      if (routeDiffSearch.diff !== "1") {
        router.history.replace(
          `/${encodeURIComponent(panelState.target.ref.environmentId)}/${encodeURIComponent(
            panelState.target.ref.threadId,
          )}`,
        );
        return;
      }
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(panelState.target.ref),
        search: routeDiffSearch,
        replace: true,
      });
    },
    [navigate, router],
  );

  const scheduleActivePanelRouteSync = useCallback(
    (panelId: ChatWorkspacePanelId | null) => {
      pendingActivePanelRouteSyncRef.current = panelId;

      if (!restoredRef.current || restorePhaseRef.current !== "settled") {
        return;
      }

      if (routeSyncFrameRef.current !== null) {
        window.cancelAnimationFrame(routeSyncFrameRef.current);
      }

      routeSyncFrameRef.current = window.requestAnimationFrame(() => {
        routeSyncFrameRef.current = null;
        if (!restoredRef.current || restorePhaseRef.current !== "settled") {
          return;
        }
        syncActivePanelRoute(pendingActivePanelRouteSyncRef.current);
      });
    },
    [syncActivePanelRoute],
  );

  const applyRouteTargetToActivePanel = useCallback(
    (nextRouteTarget: ChatWorkspaceRouteTarget): ChatWorkspacePanelId | null => {
      const routeTargetKey = getChatWorkspaceRouteTargetKey(nextRouteTarget);
      const panelId = openWorkspaceTarget({
        disposition: "active-panel",
        target:
          nextRouteTarget.target.kind === "thread"
            ? {
                kind: "thread",
                ref: nextRouteTarget.target.ref,
                diffSearch: nextRouteTarget.diffSearch,
              }
            : {
                kind: "draft",
                draftId: nextRouteTarget.target.draftId,
                ref: nextRouteTarget.target.ref,
                diffSearch: nextRouteTarget.diffSearch,
              },
      });
      if (!panelId) {
        return null;
      }

      lastAppliedRouteTargetKeyRef.current = routeTargetKey;
      pendingRoutePanelIdRef.current = panelId;
      lastRouteSyncRef.current = routeSyncKeyForPanelTarget(
        nextRouteTarget.target,
        nextRouteTarget.diffSearch,
      );
      return panelId;
    },
    [openWorkspaceTarget],
  );

  const updatePanelDiffSearch = useCallback(
    (panelId: ChatWorkspacePanelId, next: DiffRouteSearchUpdater) => {
      const panelState = panelsByIdRef.current[panelId];
      if (!panelState || panelState.kind === "empty") {
        return;
      }
      const diffSearch = nextDiffSearch(panelState.diffSearch, next);
      if (sameDiffSearch(panelState.diffSearch, diffSearch)) {
        return;
      }
      const nextPanelsById = {
        ...panelsByIdRef.current,
        [panelId]: {
          ...panelState,
          diffSearch,
        },
      };
      panelsByIdRef.current = nextPanelsById;
      setPanelsById(nextPanelsById);
      lastRouteSyncRef.current = null;
      scheduleActivePanelRouteSync(panelId);
    },
    [scheduleActivePanelRouteSync],
  );

  const cleanupStalePanels = useCallback(() => {
    if (!restoredRef.current || restorePhaseRef.current !== "settled") {
      return;
    }

    const appState = useStore.getState();
    const draftState = useComposerDraftStore.getState();

    for (const [rawPanelId, panelState] of Object.entries(panelsByIdRef.current) as Array<
      [ChatWorkspacePanelId, ChatWorkspacePanelState]
    >) {
      if (panelState.kind === "empty") {
        continue;
      }

      if (panelState.target.kind === "draft") {
        if (!draftState.getDraftSession(panelState.target.draftId)) {
          closePanel(rawPanelId);
        }
        continue;
      }

      const environmentState = selectEnvironmentState(
        appState,
        panelState.target.ref.environmentId,
      );
      if (
        environmentState.bootstrapComplete &&
        !selectThreadExistsByRef(appState, panelState.target.ref)
      ) {
        closePanel(rawPanelId);
      }
    }
  }, [closePanel]);

  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const currentApi = event.api;
      restorePhaseRef.current = "restoring";
      initialRouteTargetKeyRef.current = routeKeyForWorkspaceRouteTarget(routeTargetRef.current);
      apiRef.current = currentApi;
      setApi(currentApi);

      const persisted = readPersistedChatWorkspaceState();
      let restoredState: PersistedChatWorkspaceStateV1 = persisted;
      let restoredSavedPanels = Object.keys(persisted.panelsById).length > 0;

      if (persisted.dockview) {
        try {
          currentApi.fromJSON(persisted.dockview as SerializedDockview);
        } catch {
          currentApi.clear();
          restoredSavedPanels = false;
          const restoredPanelId = routeTarget ? createChatWorkspacePanelId() : null;
          restoredState = routeTarget
            ? {
                ...EMPTY_CHAT_WORKSPACE_STATE,
                panelsById: {
                  [restoredPanelId as ChatWorkspacePanelId]: {
                    kind: "chat",
                    target: routeTarget.target,
                    diffSearch: routeTarget.diffSearch,
                  },
                },
                activePanelId: restoredPanelId,
              }
            : EMPTY_CHAT_WORKSPACE_STATE;
          writePersistedChatWorkspaceState(persistedStateWithDockview(restoredState, null));
        }
      }
      hasRestoredPersistedPanelsRef.current =
        restoredSavedPanels && Object.keys(restoredState.panelsById).length > 0;

      const restoredPanelIds = new Set(Object.keys(restoredState.panelsById));
      const restoredPanels = currentApi.panels.slice();
      for (const panel of restoredPanels) {
        const panelId = normalizePanelId(panel.id);
        if (!panelId || !restoredPanelIds.has(panelId)) {
          currentApi.removePanel(panel);
        }
      }

      for (const [panelId, panelState] of Object.entries(restoredState.panelsById) as Array<
        [ChatWorkspacePanelId, ChatWorkspacePanelState]
      >) {
        if (currentApi.getPanel(panelId)) {
          continue;
        }
        currentApi.addPanel({
          id: panelId,
          component: CHAT_PANEL_COMPONENT_ID,
          title: fallbackPanelTitle(panelState),
          params: { panelId },
          renderer: "onlyWhenVisible",
          inactive: true,
        });
      }

      panelsByIdRef.current = restoredState.panelsById;
      setPanelsById(restoredState.panelsById);
      const persistedActivePanelId =
        restoredState.activePanelId && currentApi.getPanel(restoredState.activePanelId)
          ? restoredState.activePanelId
          : (normalizePanelId(currentApi.activePanel?.id ?? "") ??
            (Object.keys(restoredState.panelsById)[0] as ChatWorkspacePanelId | undefined) ??
            null);
      const nextActivePanelId = persistedActivePanelId;

      if (nextActivePanelId) {
        currentApi.getPanel(nextActivePanelId)?.api.setActive();
      }
      activePanelIdRef.current = nextActivePanelId;
      setActivePanelId(nextActivePanelId);
      restoredRef.current = true;
      schedulePersist();

      if (restoreSettleFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreSettleFrameRef.current);
      }
      restoreSettleFrameRef.current = window.requestAnimationFrame(() => {
        restoreSettleFrameRef.current = window.requestAnimationFrame(() => {
          restoreSettleFrameRef.current = null;
          restorePhaseRef.current = "settled";
          cleanupStalePanels();

          if (
            hasRestoredPersistedPanelsRef.current &&
            startupRoutePolicyRef.current === "restore-saved-active"
          ) {
            scheduleActivePanelRouteSync(activePanelIdRef.current);
            return;
          }

          const currentRouteTarget = routeTargetRef.current;
          if (currentRouteTarget) {
            applyRouteTargetToActivePanel(currentRouteTarget);
            return;
          }

          scheduleActivePanelRouteSync(activePanelIdRef.current);
        });
      });
    },
    [
      applyRouteTargetToActivePanel,
      cleanupStalePanels,
      routeTarget,
      scheduleActivePanelRouteSync,
      schedulePersist,
    ],
  );

  useEffect(() => {
    if (!api) {
      return;
    }
    const activeDisposable = api.onDidActivePanelChange((panel) => {
      const panelId = normalizePanelId(panel?.id ?? "");
      if (activePanelIdRef.current === panelId) {
        return;
      }
      activePanelIdRef.current = panelId;
      setActivePanelId(panelId);
      scheduleActivePanelRouteSync(panelId);
    });
    const removeDisposable = api.onDidRemovePanel((panel) => {
      const panelId = normalizePanelId(panel.id);
      if (!panelId) {
        return;
      }
      setPanelsById((previous) => {
        const next = removePanelState(previous, panelId);
        panelsByIdRef.current = next;
        return next;
      });
      if (activePanelIdRef.current === panelId) {
        const nextPanelId = normalizePanelId(api.activePanel?.id ?? "");
        activePanelIdRef.current = nextPanelId;
        setActivePanelId(nextPanelId);
        scheduleActivePanelRouteSync(nextPanelId);
      }
    });
    const layoutDisposable = api.onDidLayoutChange(schedulePersist);
    return () => {
      activeDisposable.dispose();
      removeDisposable.dispose();
      layoutDisposable.dispose();
    };
  }, [api, scheduleActivePanelRouteSync, schedulePersist]);

  useEffect(() => {
    if (!api || !routeTarget || !restoredRef.current) {
      if (!routeTarget) {
        lastAppliedRouteTargetKeyRef.current = null;
      }
      return;
    }
    if (restorePhaseRef.current !== "settled") {
      return;
    }
    const routeTargetKey = getChatWorkspaceRouteTargetKey(routeTarget);
    const routeSyncKey = routeSyncKeyForPanelTarget(routeTarget.target, routeTarget.diffSearch);
    if (lastRouteSyncRef.current === routeSyncKey) {
      lastAppliedRouteTargetKeyRef.current = routeTargetKey;
      return;
    }
    if (
      hasRestoredPersistedPanelsRef.current &&
      startupRoutePolicyRef.current === "restore-saved-active" &&
      initialRouteTargetKeyRef.current === routeTargetKey &&
      ignoredStartupRouteTargetKeyRef.current !== routeTargetKey
    ) {
      ignoredStartupRouteTargetKeyRef.current = routeTargetKey;
      lastAppliedRouteTargetKeyRef.current = routeTargetKey;
      return;
    }
    if (lastAppliedRouteTargetKeyRef.current === routeTargetKey) {
      return;
    }
    applyRouteTargetToActivePanel(routeTarget);
  }, [api, applyRouteTargetToActivePanel, routeTarget]);

  useEffect(() => {
    if (!api || !restoredRef.current) {
      return;
    }
    if (pendingRoutePanelIdRef.current && activePanelId !== pendingRoutePanelIdRef.current) {
      return;
    }
    if (activePanelId === pendingRoutePanelIdRef.current) {
      pendingRoutePanelIdRef.current = null;
    }
    scheduleActivePanelRouteSync(activePanelId);
  }, [activePanelId, api, panelsById, scheduleActivePanelRouteSync]);

  useEffect(() => {
    const unsubscribeApp = useStore.subscribe(cleanupStalePanels);
    const unsubscribeDrafts = useComposerDraftStore.subscribe(cleanupStalePanels);
    cleanupStalePanels();
    return () => {
      unsubscribeApp();
      unsubscribeDrafts();
    };
  }, [cleanupStalePanels]);

  const contextValue = useMemo<ChatWorkspaceContextValue>(
    () => ({
      activePanelId,
      newThreadShortcutLabel,
      onCreateDraftPanel: createDraftPanel,
      onDiffSearchChange: updatePanelDiffSearch,
      panelsById,
    }),
    [activePanelId, createDraftPanel, newThreadShortcutLabel, panelsById, updatePanelDiffSearch],
  );

  return (
    <ChatWorkspaceContext.Provider value={contextValue}>
      <SidebarInset className="h-svh min-h-0 overflow-hidden overscroll-y-none text-foreground md:h-dvh">
        <DockviewReact
          className="t3code-dockview-theme h-full w-full"
          components={{ [CHAT_PANEL_COMPONENT_ID]: DockviewChatPanel }}
          defaultRenderer="onlyWhenVisible"
          defaultTabComponent={DockviewChatTab}
          disableFloatingGroups
          disableTabsOverflowList
          getTabContextMenuItems={() => ["close", "closeOthers", "closeAll"]}
          onReady={onReady}
          onWillDrop={(event) => {
            const data = event.getData();
            if (data && data.viewId !== event.api.id) {
              event.preventDefault();
            }
          }}
          prefixHeaderActionsComponent={DockviewPrefixHeaderActions}
          rightHeaderActionsComponent={DockviewRightHeaderActions}
          watermarkComponent={DockviewWatermark}
        />
        {children}
      </SidebarInset>
    </ChatWorkspaceContext.Provider>
  );
}

export function useWorkspacePanelPromotionFinalizer(threadRef: ChatWorkspacePanelTarget["ref"]) {
  const draftThread = useComposerDraftStore((store) => store.getDraftThreadByRef(threadRef));
  const serverThread = useStore(useMemo(() => createThreadSelectorByRef(threadRef), [threadRef]));
  const serverThreadStarted = threadHasStarted(serverThread);

  useEffect(() => {
    if (!serverThreadStarted || !draftThread?.promotedTo) {
      return;
    }
    finalizePromotedDraftThreadByRef(threadRef);
  }, [draftThread?.promotedTo, serverThreadStarted, threadRef]);
}
