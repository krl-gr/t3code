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
import { CHAT_WORKSPACE_STORAGE_KEY } from "../../workspace/workspacePersistence";
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

function createWorkspaceRouter(initialEntry: string) {
  const rootRoute = createRootRoute({
    component: () => <Outlet />,
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ChatWorkspace />,
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
    component: function ThreadWorkspaceRoute() {
      const params = threadRoute.useParams() as unknown as {
        environmentId: string;
        threadId: string;
      };
      const search = threadRoute.useSearch();
      return (
        <ChatWorkspace
          routeTarget={{
            target: {
              kind: "thread",
              ref: scopeThreadRef(
                params.environmentId as EnvironmentId,
                params.threadId as ThreadId,
              ),
            },
            diffSearch: search,
          }}
        />
      );
    },
  });
  const draftRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "draft/$draftId",
    component: function DraftWorkspaceRoute() {
      const params = draftRoute.useParams() as unknown as {
        draftId: string;
      };
      return (
        <ChatWorkspace
          routeTarget={{
            target: {
              kind: "draft",
              draftId: DraftId.make(params.draftId),
              ref: scopeThreadRef(environmentId, draftOneThreadId),
            },
            diffSearch: {},
          }}
        />
      );
    },
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
        const panels = Array.from(
          document.querySelectorAll<HTMLElement>("[data-testid^='workspace-panel-']"),
        );
        expect(panels).toHaveLength(2);
        expect(panels.filter((panel) => panel.textContent?.includes(threadOneId))).toHaveLength(1);
        expect(
          panels.filter((panel) => panel.textContent?.includes(draftOneThreadId)),
        ).toHaveLength(1);
        expect(panels.find((panel) => panel.dataset.active === "true")?.textContent).toContain(
          draftOneThreadId,
        );
      });
      expect(createDraftThreadMock).toHaveBeenCalledTimes(1);
    } finally {
      await mounted.cleanup();
    }
  });

  it("opens a routed new draft inside the reserved new tab", async () => {
    const mounted = await renderWorkspace(`/${environmentId}/${threadOneId}`);

    try {
      await expect.element(page.getByText(threadOneId)).toBeVisible();

      await page.getByRole("button", { name: "New workspace tab" }).click();

      await vi.waitFor(() => {
        const panels = Array.from(
          document.querySelectorAll<HTMLElement>("[data-testid^='workspace-panel-']"),
        );
        expect(panels).toHaveLength(2);
        expect(panels.filter((panel) => panel.textContent?.includes(threadOneId))).toHaveLength(1);
        expect(
          panels.filter((panel) => panel.textContent?.includes(draftOneThreadId)),
        ).toHaveLength(1);
        expect(panels.find((panel) => panel.dataset.active === "true")?.textContent).toContain(
          draftOneThreadId,
        );
      });
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
