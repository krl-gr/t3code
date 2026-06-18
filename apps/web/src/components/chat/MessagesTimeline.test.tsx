import { EnvironmentId, MessageId } from "@t3tools/contracts";
import { createRef, type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { LegendListRef } from "@legendapp/list/react";

vi.mock("@legendapp/list/react", async () => {
  const legendListTestId = "legend-list";

  const LegendList = (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ListHeaderComponent?: ReactNode;
    ListFooterComponent?: ReactNode;
    ref?: Ref<LegendListRef>;
  }) => (
    <div data-testid={legendListTestId}>
      {props.ListHeaderComponent}
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
      {props.ListFooterComponent}
    </div>
  );

  return { LegendList };
});

function MockFileDiff(props: {
  fileDiff: { name?: string | null; prevName?: string | null };
  renderCustomHeader?: (fileDiff: {
    name?: string | null;
    prevName?: string | null;
  }) => React.ReactNode;
}) {
  return (
    <div data-testid="file-diff">
      {props.renderCustomHeader?.(props.fileDiff)}
      {props.fileDiff.name ?? props.fileDiff.prevName ?? "diff"}
    </div>
  );
}

vi.mock("@pierre/diffs/react", () => {
  return { FileDiff: MockFileDiff };
});

function matchMedia() {
  return {
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

beforeAll(() => {
  const classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };

  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  });
  vi.stubGlobal("window", {
    matchMedia,
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
    cancelAnimationFrame: () => {},
    desktopBridge: undefined,
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList,
      offsetHeight: 0,
    },
  });
});

const ACTIVE_THREAD_ENVIRONMENT_ID = EnvironmentId.make("environment-local");
const MESSAGE_CREATED_AT = "2026-03-17T19:12:28.000Z";

function buildProps() {
  return {
    isWorking: false,
    activeTurnInProgress: false,
    activeTurnId: null,
    activeTurnStartedAt: null,
    listRef: createRef<LegendListRef | null>(),
    completionDividerBeforeEntryId: null,
    completionSummary: null,
    turnDiffSummaryByAssistantMessageId: new Map(),
    routeThreadKey: "environment-local:thread-1",
    onOpenTurnDiff: () => {},
    revertTurnCountByUserMessageId: new Map(),
    onRevertUserMessage: () => {},
    isRevertingCheckpoint: false,
    onImageExpand: () => {},
    activeThreadEnvironmentId: ACTIVE_THREAD_ENVIRONMENT_ID,
    markdownCwd: undefined,
    resolvedTheme: "light" as const,
    timestampFormat: "locale" as const,
    workspaceRoot: undefined,
    onIsAtEndChange: () => {},
  };
}

function buildLongUserMessageText(tail = "deep hidden detail only after expand") {
  return Array.from({ length: 9 }, (_, index) =>
    index === 8 ? tail : `Line ${index + 1}: ${"verbose prompt content ".repeat(8).trim()}`,
  ).join("\n");
}

function buildUserTimelineEntry(text: string) {
  return {
    id: "entry-1",
    kind: "message" as const,
    createdAt: MESSAGE_CREATED_AT,
    message: {
      id: MessageId.make("message-1"),
      role: "user" as const,
      text,
      createdAt: MESSAGE_CREATED_AT,
      streaming: false,
    },
  };
}

function buildAssistantTimelineEntry(input: {
  id: string;
  entryId?: string;
  text: string;
  createdAt: string;
  completedAt?: string;
  turnId?: string;
}) {
  return {
    id: input.entryId ?? input.id,
    kind: "message" as const,
    createdAt: input.createdAt,
    message: {
      id: MessageId.make(input.id),
      role: "assistant" as const,
      text: input.text,
      turnId: input.turnId ? (input.turnId as never) : null,
      createdAt: input.createdAt,
      completedAt: input.completedAt,
      streaming: false,
    },
  };
}

describe("MessagesTimeline", () => {
  it("renders collapse controls for long user messages", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[buildUserTimelineEntry(buildLongUserMessageText())]}
      />,
    );

    expect(markup).toContain("Show full message");
    expect(markup).toContain('data-user-message-collapsed="true"');
    expect(markup).toContain('data-user-message-fade="true"');
    expect(markup).toContain('data-user-message-footer="true"');
  });

  it("does not render collapse controls for short user messages", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[buildUserTimelineEntry("Short prompt.")]}
      />,
    );

    expect(markup).not.toContain("Show full message");
    expect(markup).toContain('data-user-message-collapsible="false"');
  });

  it("renders inline terminal labels with the composer chip UI", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          buildUserTimelineEntry(
            [
              buildLongUserMessageText("yoo what's @terminal-1:1-5 mean"),
              "",
              "<terminal_context>",
              "- Terminal 1 lines 1-5:",
              "  1 | julius@mac effect-http-ws-cli % bun i",
              "  2 | bun install v1.3.9 (cf6cdbbb)",
              "</terminal_context>",
            ].join("\n"),
          ),
        ]}
      />,
    );

    expect(markup).toContain("Terminal 1 lines 1-5");
    expect(markup).toContain("lucide-terminal");
    expect(markup).toContain("yoo what&#x27;s ");
    expect(markup).toContain("Show full message");
  }, 20_000);

  it("keeps the copy button for collapsed long user messages", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[buildUserTimelineEntry(buildLongUserMessageText())]}
      />,
    );

    expect(markup).toContain('aria-label="Copy link"');
    expect(markup).toContain('data-user-message-collapsed="true"');
    expect(markup).toContain('data-user-message-footer="true"');
  });

  it("collapses process-only work log entries behind the parent process trigger", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Context compacted",
              tone: "info",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Work details");
    expect(markup).not.toContain("1 work log entry");
    expect(markup).not.toContain("Context compacted");
    expect(markup).not.toContain("Work log (1)");
  });

  it("keeps error process entries expanded", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Task failed",
              detail: "Failed to apply patch",
              tone: "error",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Work details");
    expect(markup).toContain("1 work log entry");
    expect(markup).toContain("Task failed - Failed to apply patch");
    expect(markup).not.toContain("Work log (1)");
  });

  it("collapses tool-only work groups behind the parent process trigger", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Ran command",
              tone: "tool",
              command: "sed -n 1,5p apps/web/src/store.ts",
            },
          },
          {
            id: "entry-2",
            kind: "work",
            createdAt: "2026-03-17T19:12:29.000Z",
            entry: {
              id: "work-2",
              createdAt: "2026-03-17T19:12:29.000Z",
              label: "Ran command",
              tone: "tool",
              command: "rg -n latest apps/web/src",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Work details");
    expect(markup).not.toContain("2 actions");
    expect(markup).not.toContain("Ran command - rg -n latest apps/web/src");
    expect(markup).not.toContain("sed -n 1,5p apps/web/src/store.ts");
  });

  it("hides a single tool entry behind the parent process trigger", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Read file",
              tone: "tool",
              detail: "apps/web/src/store.ts",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Work details");
    expect(markup).not.toContain("1 action");
    expect(markup).not.toContain("Read file - apps/web/src/store.ts");
  });

  it("keeps the final assistant answer visible while process internals are collapsed", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        activeTurnId={"turn-1" as never}
        completionDividerBeforeEntryId="assistant-final-entry"
        completionSummary="Worked for 1m"
        timelineEntries={[
          {
            ...buildUserTimelineEntry("Please inspect this."),
            id: "user-entry",
          },
          buildAssistantTimelineEntry({
            id: "assistant-interim",
            text: "I am checking the timeline.",
            createdAt: "2026-03-17T19:12:30.000Z",
            completedAt: "2026-03-17T19:12:31.000Z",
            turnId: "turn-1",
          }),
          {
            id: "work-entry",
            kind: "work",
            createdAt: "2026-03-17T19:12:32.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:32.000Z",
              label: "Ran command",
              tone: "tool",
              command: "rg -n hidden apps/web/src",
            },
          },
          buildAssistantTimelineEntry({
            id: "assistant-final",
            entryId: "assistant-final-entry",
            text: "Final answer stays visible.",
            createdAt: "2026-03-17T19:13:00.000Z",
            completedAt: "2026-03-17T19:13:28.000Z",
            turnId: "turn-1",
          }),
        ]}
      />,
    );

    expect(markup).toContain("Worked for 1m");
    expect(markup).toContain("Final answer stays visible.");
    expect(markup).not.toContain("I am checking the timeline.");
    expect(markup).not.toContain("rg -n hidden apps/web/src");
    expect(markup).not.toContain("Response");
  });

  it("keeps proposed plans visible while process internals are collapsed", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        activeTurnId={"turn-plan" as never}
        completionSummary="Worked for 2s"
        timelineEntries={[
          {
            ...buildUserTimelineEntry("Plan this."),
            id: "user-entry",
          },
          {
            id: "work-entry",
            kind: "work",
            createdAt: "2026-03-17T19:12:29.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:29.000Z",
              label: "Ran command",
              tone: "tool",
              command: "rg -n plan apps/web/src",
            },
          },
          {
            id: "plan-1",
            kind: "proposed-plan",
            createdAt: "2026-03-17T19:12:30.000Z",
            proposedPlan: {
              id: "plan-1" as never,
              turnId: "turn-plan" as never,
              planMarkdown: "# Proposed Fix\n\nDo the focused thing.",
              implementedAt: null,
              implementationThreadId: null,
              createdAt: "2026-03-17T19:12:30.000Z",
              updatedAt: "2026-03-17T19:12:31.000Z",
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("Worked for 2s");
    expect(markup).toContain("Proposed Fix");
    expect(markup).not.toContain("rg -n plan apps/web/src");
  });

  it("does not render replayable timeline animation classes", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const assistantMarkup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        completionDividerBeforeEntryId="assistant-final-entry"
        completionSummary="Worked for 1s"
        timelineEntries={[
          buildAssistantTimelineEntry({
            id: "assistant-final",
            entryId: "assistant-final-entry",
            text: "Final answer.",
            createdAt: "2026-03-17T19:13:00.000Z",
            completedAt: "2026-03-17T19:13:01.000Z",
            turnId: "turn-1",
          }),
        ]}
      />,
    );
    const activeWorkMarkup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        isWorking
        activeTurnInProgress
        activeTurnId={"turn-active" as never}
        activeTurnStartedAt="2026-03-17T19:12:27.000Z"
        timelineEntries={[
          {
            id: "work-entry",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Ran command",
              tone: "tool",
              command: "rg -n animation apps/web/src",
            },
          },
        ]}
      />,
    );

    expect(assistantMarkup).toContain("Response");
    expect(activeWorkMarkup).toContain("Working for");
    expect(`${assistantMarkup}${activeWorkMarkup}`).not.toContain("chat-fade-in");
    expect(`${assistantMarkup}${activeWorkMarkup}`).not.toContain("chat-row-enter");
  });

  it("formats changed file paths from the workspace root", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        isWorking
        activeTurnInProgress
        activeTurnStartedAt="2026-03-17T19:12:27.000Z"
        timelineEntries={[
          {
            id: "entry-1",
            kind: "work",
            createdAt: "2026-03-17T19:12:28.000Z",
            entry: {
              id: "work-1",
              createdAt: "2026-03-17T19:12:28.000Z",
              label: "Updated files",
              tone: "error",
              changedFiles: ["C:/Users/mike/dev-stuff/t3code/apps/web/src/session-logic.ts"],
            },
          },
        ]}
        workspaceRoot="C:/Users/mike/dev-stuff/t3code"
      />,
    );

    expect(markup).toContain("t3code/apps/web/src/session-logic.ts");
    expect(markup).not.toContain("C:/Users/mike/dev-stuff/t3code/apps/web/src/session-logic.ts");
  });

  it("renders review comment contexts as structured cards instead of raw tags", async () => {
    const { MessagesTimeline } = await import("./MessagesTimeline");
    const markup = renderToStaticMarkup(
      <MessagesTimeline
        {...buildProps()}
        timelineEntries={[
          {
            id: "entry-1",
            kind: "message",
            createdAt: "2026-03-17T19:12:28.000Z",
            message: {
              id: MessageId.make("message-2"),
              role: "user",
              text: [
                '<review_comment sectionId="turn:2" sectionTitle="Turn 2" filePath="apps/web/src/lib/contextWindow.test.ts" startIndex="3" endIndex="14" rangeLabel="+47 to +58">',
                "Wadduo",
                "```diff",
                "@@ -0,0 +47,2 @@",
                '+  it("keeps valid zero-usage snapshots", () => {',
                "+    expect(snapshot).not.toBeNull();",
                "```",
                "</review_comment>",
              ].join("\n"),
              createdAt: "2026-03-17T19:12:28.000Z",
              streaming: false,
            },
          },
        ]}
      />,
    );

    expect(markup).toContain("contextWindow.test.ts");
    expect(markup).toContain("Wadduo");
    expect(markup).toContain('data-testid="file-diff"');
    expect(markup).not.toContain(">Review comment<");
    expect(markup).not.toContain("&lt;review_comment");
    expect(markup).not.toContain("&lt;/review_comment&gt;");
  });
});
