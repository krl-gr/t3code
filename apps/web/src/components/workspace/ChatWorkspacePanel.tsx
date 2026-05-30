import type { ScopedThreadRef } from "@t3tools/contracts";
import { Suspense, lazy, memo, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";

import ChatView from "../ChatView";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../DiffPanelShell";
import { NoActiveThreadContent } from "../NoActiveThreadState";
import type { DiffRouteSearchUpdater } from "../../diffRouteSearch";
import type {
  ChatWorkspaceChatPanelState,
  ChatWorkspacePanelId,
  ChatWorkspacePanelState,
} from "../../workspace/workspacePanelIds";

const DiffPanel = lazy(() => import("../DiffPanel"));

const DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY = "chat_diff_sidebar_width";
const DIFF_INLINE_DEFAULT_WIDTH = "clamp(24rem,34vw,36rem)";
const DIFF_INLINE_SIDEBAR_MIN_WIDTH = 22 * 16;
const DIFF_INLINE_SIDEBAR_MAX_WIDTH = 256 * 16;
const COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX = 208;

function clampDiffSidebarWidth(width: number): number {
  return Math.max(DIFF_INLINE_SIDEBAR_MIN_WIDTH, Math.min(DIFF_INLINE_SIDEBAR_MAX_WIDTH, width));
}

function readStoredDiffSidebarWidth(): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY);
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(parsed) ? clampDiffSidebarWidth(parsed) : null;
}

const DiffLoadingFallback = (props: { mode: DiffPanelMode }) => {
  return (
    <DiffPanelShell mode={props.mode} header={<DiffPanelHeaderSkeleton />}>
      <DiffPanelLoadingState label="Loading diff viewer..." />
    </DiffPanelShell>
  );
};

const LazyDiffPanel = (props: {
  diffSearch: ChatWorkspaceChatPanelState["diffSearch"];
  mode: DiffPanelMode;
  onDiffSearchChange: (next: DiffRouteSearchUpdater) => void;
  threadRef: ScopedThreadRef;
}) => {
  return (
    <DiffWorkerPoolProvider>
      <Suspense fallback={<DiffLoadingFallback mode={props.mode} />}>
        <DiffPanel
          diffSearch={props.diffSearch}
          mode={props.mode}
          onDiffSearchChange={props.onDiffSearchChange}
          threadRef={props.threadRef}
        />
      </Suspense>
    </DiffWorkerPoolProvider>
  );
};

const DiffPanelInlineSidebar = (props: {
  diffOpen: boolean;
  diffSearch: ChatWorkspaceChatPanelState["diffSearch"];
  onDiffSearchChange: (next: DiffRouteSearchUpdater) => void;
  renderDiffContent: boolean;
  rootRef: RefObject<HTMLElement | null>;
  threadRef: ScopedThreadRef;
}) => {
  const { diffOpen, diffSearch, onDiffSearchChange, renderDiffContent, rootRef, threadRef } = props;
  const sidebarRef = useRef<HTMLElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(readStoredDiffSidebarWidth);
  const sidebarWidthRef = useRef(sidebarWidth);

  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const shouldAcceptInlineSidebarWidth = useCallback(
    ({ nextWidth, wrapper }: { nextWidth: number; wrapper: HTMLElement }) => {
      const root = rootRef.current;
      const composerForm = root?.querySelector<HTMLElement>("[data-chat-composer-form='true']");
      if (!composerForm) return true;
      const composerViewport = composerForm.parentElement;
      if (!composerViewport) return true;
      const previousSidebarWidth = wrapper.style.width;
      wrapper.style.width = `${nextWidth}px`;

      const viewportStyle = window.getComputedStyle(composerViewport);
      const viewportPaddingLeft = Number.parseFloat(viewportStyle.paddingLeft) || 0;
      const viewportPaddingRight = Number.parseFloat(viewportStyle.paddingRight) || 0;
      const viewportContentWidth = Math.max(
        0,
        composerViewport.clientWidth - viewportPaddingLeft - viewportPaddingRight,
      );
      const formRect = composerForm.getBoundingClientRect();
      const composerFooter = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-footer='true']",
      );
      const composerRightActions = composerForm.querySelector<HTMLElement>(
        "[data-chat-composer-actions='right']",
      );
      const composerRightActionsWidth = composerRightActions?.getBoundingClientRect().width ?? 0;
      const composerFooterGap = composerFooter
        ? Number.parseFloat(window.getComputedStyle(composerFooter).columnGap) ||
          Number.parseFloat(window.getComputedStyle(composerFooter).gap) ||
          0
        : 0;
      const minimumComposerWidth =
        COMPOSER_COMPACT_MIN_LEFT_CONTROLS_WIDTH_PX + composerRightActionsWidth + composerFooterGap;
      const hasComposerOverflow = composerForm.scrollWidth > composerForm.clientWidth + 0.5;
      const overflowsViewport = formRect.width > viewportContentWidth + 0.5;
      const violatesMinimumComposerWidth = composerForm.clientWidth + 0.5 < minimumComposerWidth;

      wrapper.style.width = previousSidebarWidth;

      return !hasComposerOverflow && !overflowsViewport && !violatesMinimumComposerWidth;
    },
    [rootRef],
  );
  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const sidebar = sidebarRef.current;
      if (!sidebar) {
        return;
      }
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebar.getBoundingClientRect().width;

      const onPointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = clampDiffSidebarWidth(startWidth + startX - moveEvent.clientX);
        if (!shouldAcceptInlineSidebarWidth({ nextWidth, wrapper: sidebar })) {
          return;
        }
        sidebarWidthRef.current = nextWidth;
        setSidebarWidth(nextWidth);
      };

      const onPointerUp = () => {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        const finalWidth = sidebarWidthRef.current;
        if (finalWidth !== null) {
          window.localStorage.setItem(DIFF_INLINE_SIDEBAR_WIDTH_STORAGE_KEY, String(finalWidth));
        }
      };

      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    },
    [shouldAcceptInlineSidebarWidth],
  );

  if (!diffOpen) {
    return null;
  }

  return (
    <aside
      ref={sidebarRef}
      className="relative flex h-full min-h-0 shrink-0 flex-col border-l border-border bg-card text-foreground"
      style={
        {
          width: sidebarWidth === null ? DIFF_INLINE_DEFAULT_WIDTH : `${sidebarWidth}px`,
        } satisfies CSSProperties
      }
    >
      <div
        aria-label="Resize diff sidebar"
        aria-orientation="vertical"
        className="absolute inset-y-0 left-0 z-20 w-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-border"
        onPointerDown={onResizePointerDown}
        role="separator"
      />
      {renderDiffContent ? (
        <LazyDiffPanel
          diffSearch={diffSearch}
          mode="sidebar"
          onDiffSearchChange={onDiffSearchChange}
          threadRef={threadRef}
        />
      ) : null}
    </aside>
  );
};

interface ChatWorkspacePanelProps {
  active: boolean;
  onDiffSearchChange: (panelId: ChatWorkspacePanelId, next: DiffRouteSearchUpdater) => void;
  panelId: ChatWorkspacePanelId;
  panelState: ChatWorkspacePanelState | undefined;
  visible: boolean;
}

export const ChatWorkspacePanel = memo(function ChatWorkspacePanel({
  active,
  onDiffSearchChange,
  panelId,
  panelState,
  visible,
}: ChatWorkspacePanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const chatState = panelState?.kind === "chat" ? panelState : null;
  const [hasOpenedDiff, setHasOpenedDiff] = useState(() => chatState?.diffSearch.diff === "1");
  const diffOpen = chatState?.diffSearch.diff === "1";
  const isServerTarget = chatState?.target.kind === "thread";

  useEffect(() => {
    if (diffOpen) {
      setHasOpenedDiff(true);
    }
  }, [diffOpen]);

  const updateDiffSearch = useCallback(
    (next: DiffRouteSearchUpdater) => {
      onDiffSearchChange(panelId, next);
    },
    [onDiffSearchChange, panelId],
  );

  const markDiffOpened = useCallback(() => {
    setHasOpenedDiff(true);
  }, []);

  if (!chatState) {
    return <NoActiveThreadContent />;
  }

  const shouldRenderDiffContent = Boolean(diffOpen || hasOpenedDiff);
  const chatView =
    chatState.target.kind === "thread" ? (
      <ChatView
        diffSearch={chatState.diffSearch}
        environmentId={chatState.target.ref.environmentId}
        forceInlineThreadPanels
        isolateTerminalMounting
        onDiffPanelOpen={markDiffOpened}
        onDiffSearchChange={updateDiffSearch}
        reserveTitleBarControlInset={!diffOpen}
        routeKind="server"
        showHeaderControls={false}
        threadId={chatState.target.ref.threadId}
        workspaceActive={active}
        workspaceVisible={visible}
      />
    ) : (
      <ChatView
        diffSearch={{}}
        draftId={chatState.target.draftId}
        environmentId={chatState.target.ref.environmentId}
        forceInlineThreadPanels
        isolateTerminalMounting
        onDiffSearchChange={updateDiffSearch}
        routeKind="draft"
        showHeaderControls={false}
        threadId={chatState.target.ref.threadId}
        workspaceActive={active}
        workspaceVisible={visible}
      />
    );

  return (
    <div
      ref={rootRef}
      className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background text-foreground"
    >
      <div className="flex min-h-0 min-w-0 flex-1">{chatView}</div>
      {isServerTarget ? (
        <DiffPanelInlineSidebar
          diffOpen={Boolean(diffOpen)}
          diffSearch={chatState.diffSearch}
          onDiffSearchChange={updateDiffSearch}
          renderDiffContent={shouldRenderDiffContent}
          rootRef={rootRef}
          threadRef={chatState.target.ref}
        />
      ) : null}
    </div>
  );
});
