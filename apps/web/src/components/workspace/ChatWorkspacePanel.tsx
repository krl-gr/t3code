import { memo } from "react";

import ChatView from "../ChatView";
import { NoActiveThreadContent } from "../NoActiveThreadState";
import type { ChatWorkspacePanelState } from "../../workspace/workspacePanelIds";

export const ChatWorkspacePanel = memo(function ChatWorkspacePanel(props: {
  panelState: ChatWorkspacePanelState | undefined;
  isActive: boolean;
}) {
  if (!props.panelState || props.panelState.kind === "empty") {
    return <NoActiveThreadContent />;
  }

  const { target } = props.panelState;
  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 overflow-hidden text-foreground">
      {target.kind === "thread" ? (
        <ChatView
          environmentId={target.ref.environmentId}
          threadId={target.ref.threadId}
          routeKind="server"
          showHeaderControls={false}
          isWorkspacePanelActive={props.isActive}
        />
      ) : (
        <ChatView
          draftId={target.draftId}
          environmentId={target.ref.environmentId}
          threadId={target.ref.threadId}
          routeKind="draft"
          showHeaderControls={false}
          isWorkspacePanelActive={props.isActive}
        />
      )}
    </div>
  );
});
