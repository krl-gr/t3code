import type { ScopedThreadRef } from "@t3tools/contracts";
import { Suspense, lazy, memo, useCallback, useEffect, useState } from "react";

import ChatView from "../ChatView";
import { DiffWorkerPoolProvider } from "../DiffWorkerPoolProvider";
import {
  DiffPanelHeaderSkeleton,
  DiffPanelLoadingState,
  DiffPanelShell,
  type DiffPanelMode,
} from "../DiffPanelShell";
import { NoActiveThreadContent } from "../NoActiveThreadState";
import { ThreadFloatingPanelShell } from "../ThreadFloatingPanelShell";
import type { DiffRouteSearchUpdater } from "../../diffRouteSearch";
import type {
  ChatWorkspaceChatPanelState,
  ChatWorkspacePanelId,
  ChatWorkspacePanelState,
} from "../../workspace/workspacePanelIds";

const DiffPanel = lazy(() => import("../DiffPanel"));

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

const DiffPanelFloatingPanel = (props: {
  diffOpen: boolean;
  diffSearch: ChatWorkspaceChatPanelState["diffSearch"];
  onDiffSearchChange: (next: DiffRouteSearchUpdater) => void;
  renderDiffContent: boolean;
  threadRef: ScopedThreadRef;
}) => {
  const { diffOpen, diffSearch, onDiffSearchChange, renderDiffContent, threadRef } = props;

  if (!diffOpen) {
    return null;
  }

  return (
    <ThreadFloatingPanelShell
      label="Diff panel"
      onClose={() => onDiffSearchChange({})}
      panelClassName="w-[min(560px,calc(100%-24px))]"
    >
      {renderDiffContent ? (
        <LazyDiffPanel
          diffSearch={diffSearch}
          mode="sheet"
          onDiffSearchChange={onDiffSearchChange}
          threadRef={threadRef}
        />
      ) : null}
    </ThreadFloatingPanelShell>
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
      className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden text-foreground"
    >
      <div className="flex min-h-0 min-w-0 flex-1">{chatView}</div>
      {isServerTarget ? (
        <DiffPanelFloatingPanel
          diffOpen={Boolean(diffOpen)}
          diffSearch={chatState.diffSearch}
          onDiffSearchChange={updateDiffSearch}
          renderDiffContent={shouldRenderDiffContent}
          threadRef={chatState.target.ref}
        />
      ) : null}
    </div>
  );
});
