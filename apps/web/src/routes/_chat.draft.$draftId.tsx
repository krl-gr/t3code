import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { ChatWorkspace } from "../components/workspace/ChatWorkspace";
import { threadHasStarted } from "../components/ChatView.logic";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { useStore } from "../store";
import { createThreadSelectorAcrossEnvironments } from "../storeSelectors";
import { buildThreadRouteParams } from "../threadRoutes";

function DraftChatThreadRouteView() {
  const navigate = useNavigate();
  const { draftId: rawDraftId } = Route.useParams();
  const draftId = DraftId.make(rawDraftId);
  const draftSession = useComposerDraftStore((store) => store.getDraftSession(draftId));
  const serverThread = useStore(
    useMemo(
      () => createThreadSelectorAcrossEnvironments(draftSession?.threadId ?? null),
      [draftSession?.threadId],
    ),
  );
  const serverThreadStarted = threadHasStarted(serverThread);
  const canonicalThreadRef = useMemo(
    () =>
      draftSession?.promotedTo
        ? serverThreadStarted
          ? draftSession.promotedTo
          : null
        : serverThread
          ? {
              environmentId: serverThread.environmentId,
              threadId: serverThread.id,
            }
          : null,
    [draftSession?.promotedTo, serverThread, serverThreadStarted],
  );

  useEffect(() => {
    if (!canonicalThreadRef) {
      return;
    }
    void navigate({
      to: "/$environmentId/$threadId",
      params: buildThreadRouteParams(canonicalThreadRef),
      replace: true,
    });
  }, [canonicalThreadRef, navigate]);

  useEffect(() => {
    if (draftSession || canonicalThreadRef) {
      return;
    }
    void navigate({ to: "/", replace: true });
  }, [canonicalThreadRef, draftSession, navigate]);

  if (canonicalThreadRef) {
    return (
      <ChatWorkspace
        routeTarget={{
          target: {
            kind: "thread",
            ref: canonicalThreadRef,
          },
          diffSearch: {},
        }}
      />
    );
  }

  if (!draftSession) {
    return <ChatWorkspace />;
  }

  return (
    <ChatWorkspace
      routeTarget={{
        target: {
          kind: "draft",
          draftId,
          ref: {
            environmentId: draftSession.environmentId,
            threadId: draftSession.threadId,
          },
        },
        diffSearch: {},
      }}
    />
  );
}

export const Route = createFileRoute("/_chat/draft/$draftId")({
  component: DraftChatThreadRouteView,
});
