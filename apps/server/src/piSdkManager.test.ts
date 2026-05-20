import { ProviderDriverKind, ThreadId, type ProviderSession } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vitest";

import { PiSdkManager, type PiSdkManagerOptions } from "./piSdkManager.ts";
import type { BrowserAutomationServiceShape } from "./browser/BrowserAutomationService.ts";
import { PI_BROWSER_TOOL_NAMES, PI_FULL_TOOL_NAMES, PI_PLAN_TOOL_NAMES } from "./piHarness.ts";

function makeBrowserStub(): BrowserAutomationServiceShape {
  return {
    snapshot: async () => ({
      profileId: "default",
      profilePath: "C:/tmp/t3code-pi-test/browser-profiles/default",
      status: "closed",
      allowedOrigins: [],
    }),
    openLoginWindow: async () => ({
      profileId: "default",
      profilePath: "C:/tmp/t3code-pi-test/browser-profiles/default",
      status: "open",
      allowedOrigins: [],
    }),
    closeBrowser: async () => ({
      profileId: "default",
      profilePath: "C:/tmp/t3code-pi-test/browser-profiles/default",
      status: "closed",
      allowedOrigins: [],
    }),
    clearProfileData: async () => ({
      profileId: "default",
      profilePath: "C:/tmp/t3code-pi-test/browser-profiles/default",
      status: "closed",
      allowedOrigins: [],
    }),
    navigate: async ({ url }) => ({ action: "navigate", blocked: false, url }),
    search: async () => ({ action: "search", blocked: false }),
    click: async () => ({ action: "click", blocked: false }),
    scroll: async () => ({ action: "scroll", blocked: false }),
    extractText: async () => ({ action: "extract_text", blocked: false, text: "text" }),
    screenshot: async () => ({ action: "screenshot", blocked: false }),
  };
}

function createPiSessionFactory(input?: {
  readonly activeToolNames?: ReadonlyArray<string>;
  readonly onSetActiveTools?: (toolNames: string[]) => void;
  readonly onPrompt?: (prompt: string) => void;
}) {
  const activeToolNames = input?.activeToolNames ?? [...PI_FULL_TOOL_NAMES];
  let listener: ((event: unknown) => void) | undefined;
  const session = {
    model: {
      provider: "test",
      id: "model",
      name: "Test Model",
      input: ["text"],
      reasoning: true,
    },
    thinkingLevel: "medium",
    sessionFile: "C:/tmp/t3code-pi-test/pi-session.json",
    sessionId: "pi-session-test",
    setActiveToolsByName: vi.fn((toolNames: string[]) => {
      input?.onSetActiveTools?.(toolNames);
    }),
    getActiveToolNames: vi.fn(() => [...activeToolNames]),
    subscribe: vi.fn((handler: (event: unknown) => void) => {
      listener = handler;
      return () => {
        listener = undefined;
      };
    }),
    prompt: vi.fn(async (prompt: string) => {
      input?.onPrompt?.(prompt);
      listener?.({ type: "agent_start" });
    }),
    abort: vi.fn(async () => undefined),
    dispose: vi.fn(),
    setModel: vi.fn(async () => undefined),
    setThinkingLevel: vi.fn(),
    getAvailableThinkingLevels: vi.fn(() => ["medium"]),
  };
  const createSession: NonNullable<PiSdkManagerOptions["createSession"]> = vi.fn(
    async () =>
      ({
        session,
        sessionManager: {},
        settingsManager: {},
        modelRegistry: {
          getAvailable: () => [session.model],
          find: () => session.model,
        },
        authStorage: {},
      }) as unknown as Awaited<ReturnType<NonNullable<PiSdkManagerOptions["createSession"]>>>,
  );

  return { createSession, session };
}

describe("PiSdkManager", () => {
  it("lists materialized sessions that are still in the starting map", async () => {
    const manager = new PiSdkManager({ stateDir: "C:/tmp/t3code-pi-test" });
    const threadId = ThreadId.make("pi-starting-thread");
    const sessionRecord: ProviderSession = {
      provider: ProviderDriverKind.make("pi"),
      status: "connecting",
      runtimeMode: "full-access",
      cwd: "C:/tmp/t3code-pi-test",
      model: "pi/default",
      threadId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const managerInternals = manager as unknown as {
      readonly startingSessions: Map<ThreadId, { readonly sessionRecord: ProviderSession }>;
    };

    managerInternals.startingSessions.set(threadId, { sessionRecord });

    expect(await manager.hasSession(threadId)).toBe(true);
    expect(await manager.listSessions()).toEqual([sessionRecord]);
  });

  it("passes browser tools as customTools, not built-in tools", async () => {
    const { createSession } = createPiSessionFactory();
    const manager = new PiSdkManager({
      stateDir: "C:/tmp/t3code-pi-test",
      browserAutomation: makeBrowserStub(),
      createSession,
    });

    await manager.startSession({
      threadId: ThreadId.make("pi-browser-tools-thread"),
      cwd: "C:/tmp/t3code-pi-test",
      runtimeMode: "full-access",
    });

    const createSessionInput = vi.mocked(createSession).mock.calls[0]?.[0];
    expect(createSessionInput).toBeTruthy();
    expect(createSessionInput?.tools.map((tool) => tool.name)).toEqual([
      "read",
      "bash",
      "edit",
      "write",
      "grep",
      "find",
      "ls",
    ]);
    expect(createSessionInput?.customTools.map((tool) => tool.name)).toEqual([
      ...PI_BROWSER_TOOL_NAMES,
    ]);
  });

  it("activates browser custom tools in full and plan modes", async () => {
    const activeToolUpdates: string[][] = [];
    const { createSession } = createPiSessionFactory({
      onSetActiveTools: (toolNames) => activeToolUpdates.push(toolNames),
    });
    const manager = new PiSdkManager({
      stateDir: "C:/tmp/t3code-pi-test",
      browserAutomation: makeBrowserStub(),
      createSession,
    });
    const threadId = ThreadId.make("pi-browser-active-tools-thread");

    await manager.startSession({
      threadId,
      cwd: "C:/tmp/t3code-pi-test",
      runtimeMode: "full-access",
    });
    await manager.sendTurn({ threadId, input: "build", interactionMode: "default" });
    await manager.startSession({
      threadId: ThreadId.make("pi-browser-active-tools-plan-thread"),
      cwd: "C:/tmp/t3code-pi-test",
      runtimeMode: "full-access",
    });
    await manager.sendTurn({
      threadId: ThreadId.make("pi-browser-active-tools-plan-thread"),
      input: "plan",
      interactionMode: "plan",
    });

    for (const toolName of PI_BROWSER_TOOL_NAMES) {
      expect(PI_FULL_TOOL_NAMES).toContain(toolName);
      expect(PI_PLAN_TOOL_NAMES).toContain(toolName);
    }
    expect(activeToolUpdates).toContainEqual([...PI_FULL_TOOL_NAMES]);
    expect(activeToolUpdates).toContainEqual([...PI_PLAN_TOOL_NAMES]);
  });

  it("passes ask mode through with ask instructions", async () => {
    const prompts: string[] = [];
    const { createSession } = createPiSessionFactory({
      onPrompt: (prompt) => prompts.push(prompt),
    });
    const manager = new PiSdkManager({
      stateDir: "C:/tmp/t3code-pi-test",
      browserAutomation: makeBrowserStub(),
      createSession,
    });
    const threadId = ThreadId.make("pi-ask-mode-thread");

    await manager.startSession({
      threadId,
      cwd: "C:/tmp/t3code-pi-test",
      runtimeMode: "full-access",
    });
    await manager.sendTurn({ threadId, input: "Why?", interactionMode: "ask" });

    expect(prompts.at(-1)).toContain("You are in Ask mode.");
    expect(prompts.at(-1)).toContain("Why?");
  });

  it("resets prior ask instructions when switching back to default mode", async () => {
    const prompts: string[] = [];
    const { createSession } = createPiSessionFactory({
      onPrompt: (prompt) => prompts.push(prompt),
    });
    const manager = new PiSdkManager({
      stateDir: "C:/tmp/t3code-pi-test",
      browserAutomation: makeBrowserStub(),
      createSession,
    });
    const threadId = ThreadId.make("pi-ask-to-default-mode-thread");

    await manager.startSession({
      threadId,
      cwd: "C:/tmp/t3code-pi-test",
      runtimeMode: "full-access",
    });
    await manager.sendTurn({ threadId, input: "What should we do?", interactionMode: "ask" });
    await manager.sendTurn({
      threadId,
      input: "Update the todo file.",
      interactionMode: "default",
    });

    expect(prompts.at(0)).toContain("You are in Ask mode.");
    expect(prompts.at(1)).toContain("You are now in T3 Code build mode.");
    expect(prompts.at(1)).toContain(
      "Previous Ask or Plan mode instructions only applied to earlier turns.",
    );
    expect(prompts.at(1)).toContain("Update the todo file.");
  });

  it("fails clearly when configured browser tools are missing from the active session", async () => {
    const { createSession } = createPiSessionFactory({
      activeToolNames: ["read", "bash", "grep", "find", "ls"],
    });
    const manager = new PiSdkManager({
      stateDir: "C:/tmp/t3code-pi-test",
      browserAutomation: makeBrowserStub(),
      createSession,
    });
    const threadId = ThreadId.make("pi-browser-missing-tools-thread");

    await manager.startSession({
      threadId,
      cwd: "C:/tmp/t3code-pi-test",
      runtimeMode: "full-access",
    });

    await expect(manager.sendTurn({ threadId, input: "use browser" })).rejects.toThrow(
      "Pi browser tools were not registered in the active session.",
    );
  });
});
