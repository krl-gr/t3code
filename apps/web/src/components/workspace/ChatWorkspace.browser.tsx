import "../../index.css";

import { scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  retainSearchParams,
  stripSearchParams,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import {
  type DiffRouteSearch,
  type DiffRouteSearchUpdater,
  parseDiffRouteSearch,
} from "../../diffRouteSearch";
import { DraftId } from "../../composerDraftStore";
import {
  CHAT_WORKSPACE_STORAGE_KEY,
  readPersistedChatWorkspaceState,
} from "../../workspace/workspacePersistence";
import { SidebarProvider } from "../ui/sidebar";
import { ChatWorkspace } from "./ChatWorkspace";

const handleNewThreadMock = vi.hoisted(() => vi.fn(async () => {}));
const createDraftThreadMock = vi.hoisted(() =>
  vi.fn(() => ({
    draftId: "draft-one",
    ref: {
      environmentId: "environment-local",
      threadId: "thread-draft-one",
    },
  })),
);

vi.mock("../../hooks/useHandleNewThread", () => ({
  useHandleNewThread: () => ({
    activeDraftThread: null,
    activeThread: undefined,
    createDraftThread: createDraftThreadMock,
    defaultProjectRef: {
      environmentId: "environment-local",
      projectId: "project-one",
    },
    handleNewThread: handleNewThreadMock,
  }),
}));

vi.mock("./ChatWorkspacePanel", () => ({
  ChatWorkspacePanel: (props: {
    active: boolean;
    onDiffSearchChange?: (panelId: string, next: DiffRouteSearchUpdater) => void;
    panelId: string;
    panelState?:
      | { kind: "empty" }
      | { kind: "chat"; diffSearch: DiffRouteSearch; target: { ref: { threadId: string } } };
  }) => (
    <section
      data-active={props.active ? "true" : "false"}
      data-testid={`workspace-panel-${props.panelId}`}
    >
      {props.panelState?.kind === "chat" ? props.panelState.target.ref.threadId : "empty"}
      {props.panelState?.kind === "chat" ? (
        <>
          <span data-testid="workspace-diff-state">
            {props.panelState.diffSearch.diff === "1" ? "open" : "closed"}
          </span>
          <button
            aria-label="Toggle mock diff"
            onClick={() => {
              props.onDiffSearchChange?.(props.panelId, (previous) =>
                previous.diff === "1" ? {} : { diff: "1" },
              );
            }}
            type="button"
          >
            Toggle mock diff
          </button>
        </>
      ) : null}
    </section>
  ),
}));

const environmentId = EnvironmentId.make("environment-local");
const threadOneId = ThreadId.make("thread-one");
const threadTwoId = ThreadId.make("thread-two");
const draftOneId = DraftId.make("draft-one");
const draftOneThreadId = ThreadId.make("thread-draft-one");

function readPersistedPanelThreadIds(): string[] {
  return Object.values(readPersistedChatWorkspaceState().panelsById).flatMap((panelState) =>
    panelState.kind === "chat" ? [String(panelState.target.ref.threadId)] : [],
  );
}

function WorkspaceRouteShell() {
  const params = useParams({ strict: false }) as Partial<
    Record<"environmentId" | "threadId" | "draftId", string>
  >;
  const search = useSearch({
    strict: false,
    select: (value) => parseDiffRouteSearch(value),
  });

  const routeTarget =
    params.environmentId && params.threadId
      ? {
          target: {
            kind: "thread" as const,
            ref: scopeThreadRef(params.environmentId as EnvironmentId, params.threadId as ThreadId),
          },
          diffSearch: search,
        }
      : params.draftId
        ? {
            target: {
              kind: "draft" as const,
              draftId: DraftId.make(params.draftId),
              ref: scopeThreadRef(environmentId, draftOneThreadId),
            },
            diffSearch: {},
          }
        : null;

  return (
    <ChatWorkspace routeTarget={routeTarget}>
      <Outlet />
    </ChatWorkspace>
  );
}

function createWorkspaceRouter(initialEntry: string) {
  const rootRoute = createRootRoute({
    component: WorkspaceRouteShell,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const threadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$environmentId/$threadId",
    validateSearch: (search) => parseDiffRouteSearch(search),
    search: {
      middlewares: [
        retainSearchParams<DiffRouteSearch>(["diff", "diffTurnId", "diffFilePath"]),
        stripSearchParams<DiffRouteSearch>({
          diff: undefined,
          diffTurnId: undefined,
          diffFilePath: undefined,
        }),
      ],
    },
    component: () => null,
  });
  const draftRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "draft/$draftId",
    component: () => null,
  });
  const routeTree = rootRoute.addChildren([indexRoute, threadRoute, draftRoute]);
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initialEntry] }),
  });
}

async function renderWorkspace(initialEntry: string) {
  const router = createWorkspaceRouter(initialEntry);
  const mounted = await render(
    <SidebarProvider defaultOpen={false}>
      <RouterProvider router={router} />
    </SidebarProvider>,
  );
  return {
    router,
    cleanup: async () => {
      await mounted.unmount();
    },
  };
}

afterEach(() => {
  window.localStorage.removeItem(CHAT_WORKSPACE_STORAGE_KEY);
  handleNewThreadMock.mockReset();
  handleNewThreadMock.mockImplementation(async () => {});
  createDraftThreadMock.mockReset();
  createDraftThreadMock.mockImplementation(() => ({
    draftId: draftOneId,
    ref: scopeThreadRef(environmentId, draftOneThreadId),
  }));
});

describe("ChatWorkspace", () => {
  it("shows the no-active-thread state when no panel is active", async () => {
    const mounted = await renderWorkspace("/");
    try {
      await expect.element(page.getByText("Pick a thread to continue")).toBeVisible();
    } finally {
      await mounted.cleanup();
    }
  });

  it("replaces the active tab target when route navigation selects another thread", async () => {
    const mounted = await renderWorkspace(`/${environmentId}/${threadOneId}`);
    try {
      await expect.element(page.getByText(threadOneId)).toBeVisible();
      await vi.waitFor(() => {
        expect(document.querySelectorAll(".dv-tab").length).toBe(1);
      });

      await mounted.router.navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId,
          threadId: threadOneId,
        },
      });
      await vi.waitFor(() => {
        expect(document.querySelectorAll(".dv-tab").length).toBe(1);
      });

      await mounted.router.navigate({
        to: "/$environmentId/$threadId",
        params: {
          environmentId,
          threadId: threadTwoId,
        },
      });

      await expect.element(page.getByText(threadTwoId)).toBeVisible();
      await vi.waitFor(() => {
        expect(document.querySelectorAll(".dv-tab").length).toBe(1);
      });
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps a single far-right plus action for creating a new thread tab", async () => {
    const mounted = await renderWorkspace(`/${environmentId}/${threadOneId}`);
    try {
      await expect.element(page.getByText(threadOneId)).toBeVisible();
      await expect.element(page.getByRole("button", { name: "New workspace tab" })).toBeVisible();
      await expect
        .element(page.getByRole("button", { name: "New thread" }))
        .not.toBeInTheDocument();
    } finally {
      await mounted.cleanup();
    }
  });

  it("does not overwrite the current thread when creating a new thread tab", async () => {
    const mounted = await renderWorkspace(`/${environmentId}/${threadOneId}`);
    try {
      await expect.element(page.getByText(threadOneId)).toBeVisible();

      await page.getByRole("button", { name: "New workspace tab" }).click();

      await vi.waitFor(() => {
        expect(document.querySelectorAll(".dv-tab")).toHaveLength(2);
        expect(readPersistedPanelThreadIds().toSorted()).toEqual(
          [String(threadOneId), String(draftOneThreadId)].toSorted(),
        );
      });
      await expect.element(page.getByText(draftOneThreadId)).toBeVisible();
      expect(createDraftThreadMock).toHaveBeenCalledTimes(1);
    } finally {
      await mounted.cleanup();
    }
  });

  it("keeps the created draft in the new tab after URL sync", async () => {
    const mounted = await renderWorkspace(`/${environmentId}/${threadOneId}`);

    try {
      await expect.element(page.getByText(threadOneId)).toBeVisible();

      await page.getByRole("button", { name: "New workspace tab" }).click();

      await vi.waitFor(() => {
        expect(document.querySelectorAll(".dv-tab")).toHaveLength(2);
        expect(readPersistedPanelThreadIds().toSorted()).toEqual(
          [String(threadOneId), String(draftOneThreadId)].toSorted(),
        );
      });
      await expect.element(page.getByText(draftOneThreadId)).toBeVisible();
      expect(createDraftThreadMock).toHaveBeenCalledTimes(1);
    } finally {
      await mounted.cleanup();
    }
  });

  it("clears retained diff search params when the active panel closes diff", async () => {
    const mounted = await renderWorkspace(`/${environmentId}/${threadOneId}?diff=1`);
    try {
      await expect.element(page.getByTestId("workspace-diff-state")).toHaveTextContent("open");

      await page.getByRole("button", { name: "Toggle mock diff" }).click();

      await expect.element(page.getByTestId("workspace-diff-state")).toHaveTextContent("closed");
      await vi.waitFor(() => {
        expect(mounted.router.state.location.search).toEqual({});
      });
    } finally {
      await mounted.cleanup();
    }
  });
});
