import {
  Outlet,
  createFileRoute,
  redirect,
  useLocation,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { LinkIcon, PlusIcon } from "lucide-react";
import { useEffect, useMemo } from "react";

import { useCommandPaletteStore } from "../commandPaletteStore";
import {
  ChatWorkspace,
  type ChatWorkspaceRouteTarget,
} from "../components/workspace/ChatWorkspace";
import { Button } from "../components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../components/ui/empty";
import { SidebarInset, SidebarTrigger } from "../components/ui/sidebar";
import { threadHasStarted } from "../components/ChatView.logic";
import { DraftId, useComposerDraftStore } from "../composerDraftStore";
import { parseDiffRouteSearch } from "../diffRouteSearch";
import { useSavedEnvironmentRegistryStore } from "../environments/runtime";
import { useHandleNewThread } from "../hooks/useHandleNewThread";
import {
  startNewLocalThreadInWorkspacePanelFromContext,
  startNewThreadInWorkspacePanelFromContext,
} from "../lib/chatThreadActions";
import { isTerminalFocused } from "../lib/terminalFocus";
import { resolveShortcutCommand } from "../keybindings";
import { selectEnvironmentState, selectThreadExistsByRef, useStore } from "../store";
import { createThreadSelectorAcrossEnvironments } from "../storeSelectors";
import { selectThreadTerminalUiState, useTerminalUiStateStore } from "../terminalUiStateStore";
import { useThreadSelectionStore } from "../threadSelectionStore";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { APP_BASE_NAME, APP_DISPLAY_NAME } from "~/branding";
import { resolveSidebarNewThreadEnvMode } from "~/components/Sidebar.logic";
import { useSettings } from "~/hooks/useSettings";
import { useServerKeybindings } from "~/rpc/serverState";

function ChatRouteGlobalShortcuts() {
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const selectedThreadKeysSize = useThreadSelectionStore((state) => state.selectedThreadKeys.size);
  const { activeDraftThread, activeThread, defaultProjectRef, handleNewThread, routeThreadRef } =
    useHandleNewThread();
  const keybindings = useServerKeybindings();
  const terminalOpen = useTerminalUiStateStore((state) =>
    routeThreadRef
      ? selectThreadTerminalUiState(state.terminalUiStateByThreadKey, routeThreadRef).terminalOpen
      : false,
  );
  const appSettings = useSettings();

  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          terminalOpen,
        },
      });

      if (useCommandPaletteStore.getState().open) {
        return;
      }

      if (event.key === "Escape" && selectedThreadKeysSize > 0) {
        event.preventDefault();
        clearSelection();
        return;
      }

      if (command === "chat.newLocal") {
        event.preventDefault();
        event.stopPropagation();
        void startNewLocalThreadInWorkspacePanelFromContext({
          activeDraftThread,
          activeThread,
          defaultProjectRef,
          defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
          handleNewThread,
        });
        return;
      }

      if (command === "chat.new") {
        event.preventDefault();
        event.stopPropagation();
        void startNewThreadInWorkspacePanelFromContext({
          activeDraftThread,
          activeThread,
          defaultProjectRef,
          defaultThreadEnvMode: resolveSidebarNewThreadEnvMode({
            defaultEnvMode: appSettings.defaultThreadEnvMode,
          }),
          handleNewThread,
        });
      }
    };

    window.addEventListener("keydown", onWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  }, [
    activeDraftThread,
    activeThread,
    clearSelection,
    handleNewThread,
    keybindings,
    defaultProjectRef,
    selectedThreadKeysSize,
    terminalOpen,
    appSettings.defaultThreadEnvMode,
  ]);

  return null;
}

function useChatRouteTarget(): ChatWorkspaceRouteTarget | null {
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const diffSearch = useSearch({
    strict: false,
    select: (search) => parseDiffRouteSearch(search),
  });

  const serverRouteThreadRef = routeTarget?.kind === "server" ? routeTarget.threadRef : null;
  const draftRouteId = routeTarget?.kind === "draft" ? DraftId.make(routeTarget.draftId) : null;
  const serverRouteBootstrapComplete = useStore(
    (store) =>
      selectEnvironmentState(store, serverRouteThreadRef?.environmentId ?? null).bootstrapComplete,
  );
  const serverRouteThreadExists = useStore((store) =>
    selectThreadExistsByRef(store, serverRouteThreadRef),
  );
  const serverRouteDraftThreadExists = useComposerDraftStore((store) =>
    serverRouteThreadRef ? store.getDraftThreadByRef(serverRouteThreadRef) !== null : false,
  );
  const draftSession = useComposerDraftStore((store) =>
    draftRouteId ? store.getDraftSession(draftRouteId) : null,
  );
  const draftServerThread = useStore(
    useMemo(
      () => createThreadSelectorAcrossEnvironments(draftSession?.threadId ?? null),
      [draftSession?.threadId],
    ),
  );
  const draftServerThreadStarted = threadHasStarted(draftServerThread);
  const canonicalDraftThreadRef = useMemo(() => {
    if (!draftSession) {
      return null;
    }
    if (draftSession.promotedTo) {
      return draftServerThreadStarted ? draftSession.promotedTo : null;
    }
    if (!draftServerThread) {
      return null;
    }
    return {
      environmentId: draftServerThread.environmentId,
      threadId: draftServerThread.id,
    };
  }, [draftServerThread, draftServerThreadStarted, draftSession]);

  if (routeTarget?.kind === "server") {
    if (
      !serverRouteThreadRef ||
      !serverRouteBootstrapComplete ||
      (!serverRouteThreadExists && !serverRouteDraftThreadExists)
    ) {
      return null;
    }
    return {
      target: {
        kind: "thread",
        ref: serverRouteThreadRef,
      },
      diffSearch,
    };
  }

  if (routeTarget?.kind === "draft" && draftRouteId) {
    if (canonicalDraftThreadRef) {
      return {
        target: {
          kind: "thread",
          ref: canonicalDraftThreadRef,
        },
        diffSearch: {},
      };
    }
    if (!draftSession) {
      return null;
    }
    return {
      target: {
        kind: "draft",
        draftId: draftRouteId,
        ref: {
          environmentId: draftSession.environmentId,
          threadId: draftSession.threadId,
        },
      },
      diffSearch: {},
    };
  }

  return null;
}

function ChatRouteLayout() {
  const routeTarget = useChatRouteTarget();
  const { authGateState } = Route.useRouteContext();
  const pathname = useLocation({ select: (location) => location.pathname });
  const savedEnvironmentCount = useSavedEnvironmentRegistryStore(
    (state) => Object.keys(state.byId).length,
  );
  const showHostedStaticOnboarding =
    authGateState.status === "hosted-static" && savedEnvironmentCount === 0 && pathname === "/";

  if (showHostedStaticOnboarding) {
    return <HostedStaticOnboardingState />;
  }

  return (
    <>
      <ChatRouteGlobalShortcuts />
      <ChatWorkspace routeTarget={routeTarget}>
        <Outlet />
      </ChatWorkspace>
    </>
  );
}

export const Route = createFileRoute("/_chat")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: ChatRouteLayout,
});

function HostedStaticOnboardingState() {
  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none bg-background text-foreground">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <header className="border-b border-border px-3 py-2 sm:px-5 sm:py-3">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="size-7 shrink-0 md:hidden" />
            <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
              {APP_DISPLAY_NAME}
            </span>
          </div>
        </header>

        <Empty className="flex-1">
          <div className="w-full max-w-xl rounded-3xl border border-border/55 bg-card/20 px-8 py-12 shadow-sm/5">
            <EmptyHeader className="max-w-none">
              <div className="mx-auto mb-5 flex size-11 items-center justify-center rounded-xl border border-border/70 bg-background/70 text-muted-foreground">
                <LinkIcon className="size-5" />
              </div>
              <EmptyTitle className="text-foreground text-xl">
                Connect an environment to get started
              </EmptyTitle>
              <EmptyDescription className="mt-2 text-sm leading-relaxed text-muted-foreground/78">
                Open a pairing link from your {APP_BASE_NAME} desktop app or add a reachable backend
                manually. Your saved environments stay in this browser.
              </EmptyDescription>
              <div className="mt-6 flex justify-center">
                <Button render={<a href="/settings/connections" />} size="sm">
                  <PlusIcon className="size-4" />
                  Add environment
                </Button>
              </div>
            </EmptyHeader>
          </div>
        </Empty>
      </div>
    </SidebarInset>
  );
}
