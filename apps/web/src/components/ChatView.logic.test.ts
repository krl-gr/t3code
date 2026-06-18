import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime";
import {
  EnvironmentId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type EnvironmentState, useStore } from "../store";
import { type Thread } from "../types";

import {
  MAX_HIDDEN_MOUNTED_TERMINAL_THREADS,
  buildProviderStatusDismissalKey,
  buildExpiredTerminalContextToastCopy,
  buildThreadAlerts,
  createLocalDispatchSnapshot,
  deriveComposerSendState,
  hasServerAcknowledgedLocalDispatch,
  isThreadAlertDismissalKeyForThread,
  pruneDismissedThreadAlertKeys,
  rearmDismissedSessionThreadAlertForRetry,
  reconcileMountedTerminalThreadIds,
  resolveDiffPanelSearchToggle,
  resolveTurnDiffSearchToggle,
  resolveSendEnvMode,
  selectVisibleThreadAlert,
  suppressSessionThreadAlertForRetry,
  waitForStartedServerThread,
} from "./ChatView.logic";

const localEnvironmentId = EnvironmentId.make("environment-local");

describe("deriveComposerSendState", () => {
  it("treats expired terminal pills as non-sendable content", () => {
    const state = deriveComposerSendState({
      prompt: "\uFFFC",
      imageCount: 0,
      terminalContexts: [
        {
          id: "ctx-expired",
          threadId: ThreadId.make("thread-1"),
          terminalId: "default",
          terminalLabel: "Terminal 1",
          lineStart: 4,
          lineEnd: 4,
          text: "",
          createdAt: "2026-03-17T12:52:29.000Z",
        },
      ],
    });

    expect(state.trimmedPrompt).toBe("");
    expect(state.sendableTerminalContexts).toEqual([]);
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(false);
  });

  it("keeps text sendable while excluding expired terminal pills", () => {
    const state = deriveComposerSendState({
      prompt: `yoo \uFFFC waddup`,
      imageCount: 0,
      terminalContexts: [
        {
          id: "ctx-expired",
          threadId: ThreadId.make("thread-1"),
          terminalId: "default",
          terminalLabel: "Terminal 1",
          lineStart: 4,
          lineEnd: 4,
          text: "",
          createdAt: "2026-03-17T12:52:29.000Z",
        },
      ],
    });

    expect(state.trimmedPrompt).toBe("yoo  waddup");
    expect(state.expiredTerminalContextCount).toBe(1);
    expect(state.hasSendableContent).toBe(true);
  });
});

describe("buildExpiredTerminalContextToastCopy", () => {
  it("formats clear empty-state guidance", () => {
    expect(buildExpiredTerminalContextToastCopy(1, "empty")).toEqual({
      title: "Expired terminal context won't be sent",
      description: "Remove it or re-add it to include terminal output.",
    });
  });

  it("formats omission guidance for sent messages", () => {
    expect(buildExpiredTerminalContextToastCopy(2, "omitted")).toEqual({
      title: "Expired terminal contexts omitted from message",
      description: "Re-add it if you want that terminal output included.",
    });
  });
});

describe("resolveDiffPanelSearchToggle", () => {
  it("opens the diff panel from the latest closed state", () => {
    expect(resolveDiffPanelSearchToggle({})).toEqual({ diff: "1" });
  });

  it("closes the diff panel from the latest open state", () => {
    expect(resolveDiffPanelSearchToggle({ diff: "1" })).toEqual({
      diff: undefined,
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
  });
});

describe("resolveTurnDiffSearchToggle", () => {
  it("opens the requested turn diff when the diff panel is closed", () => {
    const turnId = TurnId.make("turn-one");

    expect(
      resolveTurnDiffSearchToggle({
        current: {},
        turnId,
        filePath: "src/App.tsx",
      }),
    ).toEqual({
      diff: "1",
      diffTurnId: turnId,
      diffFilePath: "src/App.tsx",
    });
  });

  it("closes the diff panel when the requested turn and file are already selected", () => {
    const turnId = TurnId.make("turn-one");

    expect(
      resolveTurnDiffSearchToggle({
        current: {
          diff: "1",
          diffTurnId: turnId,
          diffFilePath: "src/App.tsx",
        },
        turnId,
        filePath: "src/App.tsx",
      }),
    ).toEqual({
      diff: undefined,
      diffTurnId: undefined,
      diffFilePath: undefined,
    });
  });

  it("switches files instead of closing when a different file is requested", () => {
    const turnId = TurnId.make("turn-one");

    expect(
      resolveTurnDiffSearchToggle({
        current: {
          diff: "1",
          diffTurnId: turnId,
          diffFilePath: "src/App.tsx",
        },
        turnId,
        filePath: "src/Other.tsx",
      }),
    ).toEqual({
      diff: "1",
      diffTurnId: turnId,
      diffFilePath: "src/Other.tsx",
    });
  });
});

describe("resolveSendEnvMode", () => {
  it("keeps worktree mode for git repositories", () => {
    expect(resolveSendEnvMode({ requestedEnvMode: "worktree", isGitRepo: true })).toBe("worktree");
  });

  it("forces local mode for non-git repositories", () => {
    expect(resolveSendEnvMode({ requestedEnvMode: "worktree", isGitRepo: false })).toBe("local");
    expect(resolveSendEnvMode({ requestedEnvMode: "local", isGitRepo: false })).toBe("local");
  });
});

describe("reconcileMountedTerminalThreadIds", () => {
  it("keeps previously mounted open threads and adds the active open thread", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [ThreadId.make("thread-hidden"), ThreadId.make("thread-stale")],
        openThreadIds: [ThreadId.make("thread-hidden"), ThreadId.make("thread-active")],
        activeThreadId: ThreadId.make("thread-active"),
        activeThreadTerminalOpen: true,
      }),
    ).toEqual([ThreadId.make("thread-hidden"), ThreadId.make("thread-active")]);
  });

  it("drops mounted threads once their terminal drawer is no longer open", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [ThreadId.make("thread-closed")],
        openThreadIds: [],
        activeThreadId: ThreadId.make("thread-closed"),
        activeThreadTerminalOpen: false,
      }),
    ).toEqual([]);
  });

  it("keeps only the most recently active hidden terminal threads", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [
          ThreadId.make("thread-1"),
          ThreadId.make("thread-2"),
          ThreadId.make("thread-3"),
        ],
        openThreadIds: [
          ThreadId.make("thread-1"),
          ThreadId.make("thread-2"),
          ThreadId.make("thread-3"),
          ThreadId.make("thread-4"),
        ],
        activeThreadId: ThreadId.make("thread-4"),
        activeThreadTerminalOpen: true,
        maxHiddenThreadCount: 2,
      }),
    ).toEqual([ThreadId.make("thread-2"), ThreadId.make("thread-3"), ThreadId.make("thread-4")]);
  });

  it("moves the active thread to the end so it is treated as most recently used", () => {
    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds: [
          ThreadId.make("thread-a"),
          ThreadId.make("thread-b"),
          ThreadId.make("thread-c"),
        ],
        openThreadIds: [
          ThreadId.make("thread-a"),
          ThreadId.make("thread-b"),
          ThreadId.make("thread-c"),
        ],
        activeThreadId: ThreadId.make("thread-a"),
        activeThreadTerminalOpen: true,
        maxHiddenThreadCount: 2,
      }),
    ).toEqual([ThreadId.make("thread-b"), ThreadId.make("thread-c"), ThreadId.make("thread-a")]);
  });

  it("defaults to the hidden mounted terminal cap", () => {
    const currentThreadIds = Array.from(
      { length: MAX_HIDDEN_MOUNTED_TERMINAL_THREADS + 2 },
      (_, index) => ThreadId.make(`thread-${index + 1}`),
    );

    expect(
      reconcileMountedTerminalThreadIds({
        currentThreadIds,
        openThreadIds: currentThreadIds,
        activeThreadId: null,
        activeThreadTerminalOpen: false,
      }),
    ).toEqual(currentThreadIds.slice(-MAX_HIDDEN_MOUNTED_TERMINAL_THREADS));
  });
});

const makeThread = (input?: {
  id?: ThreadId;
  latestTurn?:
    | ({
        turnId: TurnId;
        state: NonNullable<Thread["latestTurn"]>["state"];
        requestedAt: string;
        startedAt: string | null;
        completedAt: string | null;
      } & Partial<Pick<NonNullable<Thread["latestTurn"]>, "assistantMessageId">>)
    | null;
  session?: Thread["session"];
  error?: string | null;
  updatedAt?: string;
}): Thread => ({
  id: input?.id ?? ThreadId.make("thread-1"),
  environmentId: localEnvironmentId,
  codexThreadId: null,
  projectId: ProjectId.make("project-1"),
  title: "Thread",
  modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
  runtimeMode: "full-access" as const,
  interactionMode: "default" as const,
  session: input?.session ?? null,
  messages: [],
  proposedPlans: [],
  error: input?.error ?? null,
  createdAt: "2026-03-29T00:00:00.000Z",
  archivedAt: null,
  updatedAt: input?.updatedAt ?? "2026-03-29T00:00:00.000Z",
  latestTurn: input?.latestTurn
    ? {
        ...input.latestTurn,
        assistantMessageId: null,
      }
    : null,
  branch: null,
  worktreePath: null,
  turnDiffSummaries: [],
  activities: [],
});

const makeThreadSession = (
  overrides?: Partial<NonNullable<Thread["session"]>>,
): NonNullable<Thread["session"]> => ({
  provider: ProviderDriverKind.make("codex"),
  providerInstanceId: ProviderInstanceId.make("codex"),
  status: "error",
  createdAt: "2026-03-29T00:00:00.000Z",
  updatedAt: "2026-03-29T00:00:10.000Z",
  lastError: "Provider session error",
  orchestrationStatus: "error",
  ...overrides,
});

const makeProviderStatus = (overrides?: Partial<ServerProvider>): ServerProvider => ({
  instanceId: ProviderInstanceId.make("codex"),
  driver: ProviderDriverKind.make("codex"),
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "error",
  auth: { status: "authenticated" },
  checkedAt: "2026-03-29T00:00:00.000Z",
  message: "Provider unavailable",
  models: [],
  slashCommands: [],
  skills: [],
  ...overrides,
});

describe("buildThreadAlerts", () => {
  it("keeps session-level error dismissal stable across unrelated session updates", () => {
    const latestTurn = {
      turnId: TurnId.make("turn-existing"),
      state: "completed" as const,
      requestedAt: "2026-03-29T00:00:00.000Z",
      startedAt: "2026-03-29T00:00:01.000Z",
      completedAt: "2026-03-29T00:00:10.000Z",
    };
    const firstAlert = buildThreadAlerts(
      makeThread({
        latestTurn,
        session: makeThreadSession({
          updatedAt: "2026-03-29T00:00:10.000Z",
        }),
      }),
      null,
    ).find((alert) => alert.source === "session");
    const refreshedAlert = buildThreadAlerts(
      makeThread({
        latestTurn,
        session: makeThreadSession({
          updatedAt: "2026-03-29T00:00:30.000Z",
        }),
      }),
      null,
    ).find((alert) => alert.source === "session");

    expect(refreshedAlert?.dismissalKey).toBe(firstAlert?.dismissalKey);
  });

  it("keys failed turn errors by turn id so same-message retry failures can reappear", () => {
    const firstAlert = buildThreadAlerts(
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-failed-1"),
          state: "error",
          requestedAt: "2026-03-29T00:00:00.000Z",
          startedAt: "2026-03-29T00:00:01.000Z",
          completedAt: "2026-03-29T00:00:10.000Z",
        },
        session: makeThreadSession({
          lastError: "Selected model is at capacity.",
        }),
      }),
      null,
    ).find((alert) => alert.source === "session");
    const retryAlert = buildThreadAlerts(
      makeThread({
        latestTurn: {
          turnId: TurnId.make("turn-failed-2"),
          state: "error",
          requestedAt: "2026-03-29T00:01:00.000Z",
          startedAt: "2026-03-29T00:01:01.000Z",
          completedAt: "2026-03-29T00:01:10.000Z",
        },
        session: makeThreadSession({
          lastError: "Selected model is at capacity.",
        }),
      }),
      null,
    ).find((alert) => alert.source === "session");

    expect(retryAlert?.dismissalKey).not.toBe(firstAlert?.dismissalKey);
  });

  it("keeps local and session alerts separate even when their messages match", () => {
    const alerts = buildThreadAlerts(
      makeThread({
        session: makeThreadSession({ lastError: "Same error" }),
      }),
      "Same error",
    );

    expect(alerts.map((alert) => alert.source)).toEqual(["local", "session"]);
    expect(alerts[0]?.dismissalKey).not.toBe(alerts[1]?.dismissalKey);
  });

  it("recognizes dismissal keys that belong to the active thread", () => {
    const thread = makeThread({
      session: makeThreadSession(),
    });
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    const otherThreadKey = scopedThreadKey(
      scopeThreadRef(thread.environmentId, ThreadId.make("thread-other")),
    );
    const alert = buildThreadAlerts(thread, null)[0];

    expect(alert).toBeDefined();
    expect(isThreadAlertDismissalKeyForThread(alert!.dismissalKey, threadKey)).toBe(true);
    expect(isThreadAlertDismissalKeyForThread(alert!.dismissalKey, otherThreadKey)).toBe(false);
  });
});

describe("pruneDismissedThreadAlertKeys", () => {
  it("removes dismissed keys for known threads after their alerts disappear", () => {
    const thread = makeThread({
      session: makeThreadSession(),
    });
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    const alert = buildThreadAlerts(thread, null)[0];

    expect(alert).toBeDefined();
    const result = pruneDismissedThreadAlertKeys({
      dismissedKeys: new Set([alert!.dismissalKey]),
      currentThreadKeys: new Set([threadKey]),
      currentAlertKeys: new Set(),
    });

    expect([...result]).toEqual([]);
  });

  it("keeps dismissed keys while the same alert is still current", () => {
    const thread = makeThread({
      session: makeThreadSession(),
    });
    const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
    const alert = buildThreadAlerts(thread, null)[0];

    expect(alert).toBeDefined();
    const result = pruneDismissedThreadAlertKeys({
      dismissedKeys: new Set([alert!.dismissalKey]),
      currentThreadKeys: new Set([threadKey]),
      currentAlertKeys: new Set([alert!.dismissalKey]),
    });

    expect([...result]).toEqual([alert!.dismissalKey]);
  });

  it("leaves unknown thread keys alone", () => {
    const thread = makeThread({
      session: makeThreadSession(),
    });
    const alert = buildThreadAlerts(thread, null)[0];

    expect(alert).toBeDefined();
    const result = pruneDismissedThreadAlertKeys({
      dismissedKeys: new Set([alert!.dismissalKey]),
      currentThreadKeys: new Set(),
      currentAlertKeys: new Set(),
    });

    expect([...result]).toEqual([alert!.dismissalKey]);
  });
});

describe("selectVisibleThreadAlert", () => {
  it("hides retry-suppressed session alerts without treating them as dismissed", () => {
    const thread = makeThread({
      session: makeThreadSession({ lastError: "Selected model is at capacity." }),
    });
    const sessionAlert = buildThreadAlerts(thread, null).find(
      (alert) => alert.source === "session",
    );

    expect(sessionAlert).toBeDefined();
    const visibleAlert = selectVisibleThreadAlert({
      alerts: buildThreadAlerts(thread, null),
      dismissedKeys: new Set(),
      suppressedKeys: new Set([sessionAlert!.dismissalKey]),
    });

    expect(visibleAlert).toBeNull();
  });

  it("keeps local send errors visible when an older session alert is suppressed", () => {
    const thread = makeThread({
      session: makeThreadSession({ lastError: "Previous provider failure." }),
    });
    const alerts = buildThreadAlerts(thread, "Failed to send message.");
    const sessionAlert = alerts.find((alert) => alert.source === "session");

    expect(sessionAlert).toBeDefined();
    const visibleAlert = selectVisibleThreadAlert({
      alerts,
      dismissedKeys: new Set(),
      suppressedKeys: new Set([sessionAlert!.dismissalKey]),
    });

    expect(visibleAlert?.source).toBe("local");
    expect(visibleAlert?.message).toBe("Failed to send message.");
  });

  it("lets a dismissed same-message session alert reappear after retry suppression ends", () => {
    const thread = makeThread({
      session: makeThreadSession({ lastError: "Selected model is at capacity." }),
    });
    const alerts = buildThreadAlerts(thread, null);
    const sessionAlert = alerts.find((alert) => alert.source === "session");

    expect(sessionAlert).toBeDefined();
    const dismissedKeys = new Set([sessionAlert!.dismissalKey]);
    expect(
      selectVisibleThreadAlert({
        alerts,
        dismissedKeys,
      }),
    ).toBeNull();

    const rearmedDismissedKeys = rearmDismissedSessionThreadAlertForRetry({
      alerts,
      dismissedKeys,
    });
    const retrySuppressedKeys = suppressSessionThreadAlertForRetry({
      alerts,
      suppressedKeys: new Set(),
    });

    expect([...rearmedDismissedKeys]).toEqual([]);
    expect([...retrySuppressedKeys]).toEqual([sessionAlert!.dismissalKey]);
    expect(
      selectVisibleThreadAlert({
        alerts,
        dismissedKeys: rearmedDismissedKeys,
        suppressedKeys: retrySuppressedKeys,
      }),
    ).toBeNull();
    expect(
      selectVisibleThreadAlert({
        alerts,
        dismissedKeys: rearmedDismissedKeys,
        suppressedKeys: new Set(),
      })?.dismissalKey,
    ).toBe(sessionAlert!.dismissalKey);
  });
});

describe("buildProviderStatusDismissalKey", () => {
  it("keeps provider dismissal stable across checkedAt-only refreshes", () => {
    const firstKey = buildProviderStatusDismissalKey(
      makeProviderStatus({ checkedAt: "2026-03-29T00:00:00.000Z" }),
    );
    const refreshedKey = buildProviderStatusDismissalKey(
      makeProviderStatus({ checkedAt: "2026-03-29T00:00:30.000Z" }),
    );

    expect(refreshedKey).toBe(firstKey);
  });

  it("changes provider dismissal when the visible status meaning changes", () => {
    const firstKey = buildProviderStatusDismissalKey(
      makeProviderStatus({ message: "Provider unavailable" }),
    );
    const changedKey = buildProviderStatusDismissalKey(
      makeProviderStatus({ message: "Authentication failed" }),
    );

    expect(changedKey).not.toBe(firstKey);
  });

  it("does not build dismissal keys for ready providers", () => {
    expect(buildProviderStatusDismissalKey(makeProviderStatus({ status: "ready" }))).toBeNull();
  });
});

function setStoreThreads(threads: ReadonlyArray<ReturnType<typeof makeThread>>) {
  const projectId = ProjectId.make("project-1");
  const environmentState: EnvironmentState = {
    projectIds: [projectId],
    projectById: {
      [projectId]: {
        id: projectId,
        environmentId: localEnvironmentId,
        name: "Project",
        cwd: "/tmp/project",
        defaultModelSelection: {
          instanceId: ProviderInstanceId.make("codex"),
          model: "gpt-5.4",
        },
        createdAt: "2026-03-29T00:00:00.000Z",
        updatedAt: "2026-03-29T00:00:00.000Z",
        scripts: [],
      },
    },
    threadIds: threads.map((thread) => thread.id),
    threadIdsByProjectId: {
      [projectId]: threads.map((thread) => thread.id),
    },
    threadShellById: Object.fromEntries(
      threads.map((thread) => [
        thread.id,
        {
          id: thread.id,
          environmentId: thread.environmentId,
          codexThreadId: thread.codexThreadId,
          projectId: thread.projectId,
          title: thread.title,
          modelSelection: thread.modelSelection,
          runtimeMode: thread.runtimeMode,
          interactionMode: thread.interactionMode,
          error: thread.error,
          createdAt: thread.createdAt,
          archivedAt: thread.archivedAt,
          updatedAt: thread.updatedAt,
          branch: thread.branch,
          worktreePath: thread.worktreePath,
        },
      ]),
    ),
    threadSessionById: Object.fromEntries(threads.map((thread) => [thread.id, thread.session])),
    threadTurnStateById: Object.fromEntries(
      threads.map((thread) => [
        thread.id,
        {
          latestTurn: thread.latestTurn,
          ...(thread.pendingSourceProposedPlan
            ? { pendingSourceProposedPlan: thread.pendingSourceProposedPlan }
            : {}),
        },
      ]),
    ),
    messageIdsByThreadId: Object.fromEntries(
      threads.map((thread) => [thread.id, thread.messages.map((message) => message.id)]),
    ),
    messageByThreadId: Object.fromEntries(
      threads.map((thread) => [
        thread.id,
        Object.fromEntries(thread.messages.map((message) => [message.id, message])),
      ]),
    ),
    activityIdsByThreadId: Object.fromEntries(
      threads.map((thread) => [thread.id, thread.activities.map((activity) => activity.id)]),
    ),
    activityByThreadId: Object.fromEntries(
      threads.map((thread) => [
        thread.id,
        Object.fromEntries(thread.activities.map((activity) => [activity.id, activity])),
      ]),
    ),
    proposedPlanIdsByThreadId: Object.fromEntries(
      threads.map((thread) => [thread.id, thread.proposedPlans.map((plan) => plan.id)]),
    ),
    proposedPlanByThreadId: Object.fromEntries(
      threads.map((thread) => [
        thread.id,
        Object.fromEntries(thread.proposedPlans.map((plan) => [plan.id, plan])),
      ]),
    ),
    turnDiffIdsByThreadId: Object.fromEntries(
      threads.map((thread) => [
        thread.id,
        thread.turnDiffSummaries.map((summary) => summary.turnId),
      ]),
    ),
    turnDiffSummaryByThreadId: Object.fromEntries(
      threads.map((thread) => [
        thread.id,
        Object.fromEntries(thread.turnDiffSummaries.map((summary) => [summary.turnId, summary])),
      ]),
    ),
    sidebarThreadSummaryById: {},
    bootstrapComplete: true,
  };
  useStore.setState({
    activeEnvironmentId: localEnvironmentId,
    environmentStateById: {
      [localEnvironmentId]: environmentState,
    },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  setStoreThreads([]);
});

describe("waitForStartedServerThread", () => {
  it("resolves immediately when the thread is already started", async () => {
    const threadId = ThreadId.make("thread-started");
    setStoreThreads([
      makeThread({
        id: threadId,
        latestTurn: {
          turnId: TurnId.make("turn-started"),
          state: "running",
          requestedAt: "2026-03-29T00:00:01.000Z",
          startedAt: "2026-03-29T00:00:01.000Z",
          completedAt: null,
        },
      }),
    ]);

    await expect(
      waitForStartedServerThread(scopeThreadRef(localEnvironmentId, threadId)),
    ).resolves.toBe(true);
  });

  it("waits for the thread to start via subscription updates", async () => {
    const threadId = ThreadId.make("thread-wait");
    setStoreThreads([makeThread({ id: threadId })]);

    const promise = waitForStartedServerThread(scopeThreadRef(localEnvironmentId, threadId), 500);

    setStoreThreads([
      makeThread({
        id: threadId,
        latestTurn: {
          turnId: TurnId.make("turn-started"),
          state: "running",
          requestedAt: "2026-03-29T00:00:01.000Z",
          startedAt: "2026-03-29T00:00:01.000Z",
          completedAt: null,
        },
      }),
    ]);

    await expect(promise).resolves.toBe(true);
  });

  it("handles the thread starting between the initial read and subscription setup", async () => {
    const threadId = ThreadId.make("thread-race");
    setStoreThreads([makeThread({ id: threadId })]);

    const originalSubscribe = useStore.subscribe.bind(useStore);
    let raced = false;
    vi.spyOn(useStore, "subscribe").mockImplementation((listener) => {
      if (!raced) {
        raced = true;
        setStoreThreads([
          makeThread({
            id: threadId,
            latestTurn: {
              turnId: TurnId.make("turn-race"),
              state: "running",
              requestedAt: "2026-03-29T00:00:01.000Z",
              startedAt: "2026-03-29T00:00:01.000Z",
              completedAt: null,
            },
          }),
        ]);
      }
      return originalSubscribe(listener);
    });

    await expect(
      waitForStartedServerThread(scopeThreadRef(localEnvironmentId, threadId), 500),
    ).resolves.toBe(true);
  });

  it("returns false after the timeout when the thread never starts", async () => {
    vi.useFakeTimers();

    const threadId = ThreadId.make("thread-timeout");
    setStoreThreads([makeThread({ id: threadId })]);
    const promise = waitForStartedServerThread(scopeThreadRef(localEnvironmentId, threadId), 500);

    await vi.advanceTimersByTimeAsync(500);

    await expect(promise).resolves.toBe(false);
  });
});

describe("hasServerAcknowledgedLocalDispatch", () => {
  const projectId = ProjectId.make("project-1");
  const previousLatestTurn = {
    turnId: TurnId.make("turn-1"),
    state: "completed" as const,
    requestedAt: "2026-03-29T00:00:00.000Z",
    startedAt: "2026-03-29T00:00:01.000Z",
    completedAt: "2026-03-29T00:00:10.000Z",
    assistantMessageId: null,
  };

  const previousSession = {
    provider: ProviderDriverKind.make("codex"),
    status: "ready" as const,
    createdAt: "2026-03-29T00:00:00.000Z",
    updatedAt: "2026-03-29T00:00:10.000Z",
    orchestrationStatus: "idle" as const,
  };

  it("does not clear local dispatch before server state changes", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.make("thread-1"),
      environmentId: localEnvironmentId,
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "ready",
        latestTurn: previousLatestTurn,
        session: previousSession,
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(false);
  });

  it("clears local dispatch when a new turn is already settled", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.make("thread-1"),
      environmentId: localEnvironmentId,
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "ready",
        latestTurn: {
          ...previousLatestTurn,
          turnId: TurnId.make("turn-2"),
          requestedAt: "2026-03-29T00:01:00.000Z",
          startedAt: "2026-03-29T00:01:01.000Z",
          completedAt: "2026-03-29T00:01:30.000Z",
        },
        session: {
          ...previousSession,
          updatedAt: "2026-03-29T00:01:30.000Z",
        },
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(true);
  });

  it("does not clear local dispatch while the session is running a newer turn than latestTurn", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.make("thread-1"),
      environmentId: localEnvironmentId,
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "running",
        latestTurn: previousLatestTurn,
        session: {
          ...previousSession,
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: TurnId.make("turn-2"),
          updatedAt: "2026-03-29T00:01:00.000Z",
        },
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(false);
  });

  it("does not clear local dispatch while the session is running but latestTurn has not advanced yet", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.make("thread-1"),
      environmentId: localEnvironmentId,
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "running",
        latestTurn: previousLatestTurn,
        session: {
          ...previousSession,
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: undefined,
          updatedAt: "2026-03-29T00:01:00.000Z",
        },
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(false);
  });

  it("clears local dispatch once the running latestTurn matches the active session turn", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.make("thread-1"),
      environmentId: localEnvironmentId,
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "running",
        latestTurn: {
          ...previousLatestTurn,
          turnId: TurnId.make("turn-2"),
          state: "running",
          requestedAt: "2026-03-29T00:01:00.000Z",
          startedAt: "2026-03-29T00:01:01.000Z",
          completedAt: null,
        },
        session: {
          ...previousSession,
          status: "running",
          orchestrationStatus: "running",
          activeTurnId: TurnId.make("turn-2"),
          updatedAt: "2026-03-29T00:01:01.000Z",
        },
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(true);
  });

  it("clears local dispatch when the session changes without an observed running phase", () => {
    const localDispatch = createLocalDispatchSnapshot({
      id: ThreadId.make("thread-1"),
      environmentId: localEnvironmentId,
      codexThreadId: null,
      projectId,
      title: "Thread",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      session: previousSession,
      messages: [],
      proposedPlans: [],
      error: null,
      createdAt: "2026-03-29T00:00:00.000Z",
      archivedAt: null,
      updatedAt: "2026-03-29T00:00:10.000Z",
      latestTurn: previousLatestTurn,
      branch: null,
      worktreePath: null,
      turnDiffSummaries: [],
      activities: [],
    });

    expect(
      hasServerAcknowledgedLocalDispatch({
        localDispatch,
        phase: "ready",
        latestTurn: previousLatestTurn,
        session: {
          ...previousSession,
          updatedAt: "2026-03-29T00:00:11.000Z",
        },
        hasPendingApproval: false,
        hasPendingUserInput: false,
        threadError: null,
      }),
    ).toBe(true);
  });
});
