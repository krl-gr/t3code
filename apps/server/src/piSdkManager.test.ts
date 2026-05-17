import { ProviderDriverKind, ThreadId, type ProviderSession } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { PiSdkManager } from "./piSdkManager.ts";
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

  it("creates Pi browser tools and keeps them active in full and plan mode lists", () => {
    const manager = new PiSdkManager({
      stateDir: "C:/tmp/t3code-pi-test",
      browserAutomation: makeBrowserStub(),
    });
    const tools = (
      manager as unknown as {
        createWrappedTools(input: {
          cwd: string;
          contextRef: { current?: unknown };
        }): ReadonlyArray<{ readonly name: string }>;
      }
    ).createWrappedTools({
      cwd: "C:/tmp/t3code-pi-test",
      contextRef: {},
    });

    for (const toolName of PI_BROWSER_TOOL_NAMES) {
      expect(tools.map((tool) => tool.name)).toContain(toolName);
      expect(PI_FULL_TOOL_NAMES).toContain(toolName);
      expect(PI_PLAN_TOOL_NAMES).toContain(toolName);
    }
  });
});
