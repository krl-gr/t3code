import { describe, expect, it, vi } from "vitest";

import type { BrowserAutomationServiceShape } from "./BrowserAutomationService.ts";
import { createPiBrowserTools, PI_BROWSER_TOOL_NAMES } from "./PiBrowserTools.ts";

function makeBrowserStub(): BrowserAutomationServiceShape {
  return {
    snapshot: vi.fn(),
    openLoginWindow: vi.fn(),
    closeBrowser: vi.fn(),
    clearProfileData: vi.fn(),
    navigate: vi.fn(async ({ url }) => ({
      action: "navigate" as const,
      blocked: false,
      url,
      title: "Example",
      origin: "https://x.com",
    })),
    search: vi.fn(async () => ({
      action: "search" as const,
      blocked: false,
      url: "https://x.com",
    })),
    click: vi.fn(async () => ({
      action: "click" as const,
      blocked: true,
      reason: "Blocked browser action.",
      url: "https://x.com",
    })),
    scroll: vi.fn(async () => ({
      action: "scroll" as const,
      blocked: false,
      url: "https://x.com",
    })),
    extractText: vi.fn(async () => ({
      action: "extract_text" as const,
      blocked: false,
      url: "https://x.com",
      text: "Visible page text",
    })),
    screenshot: vi.fn(async () => ({
      action: "screenshot" as const,
      blocked: false,
      url: "https://x.com",
      screenshotBase64: "abc",
      mimeType: "image/png",
    })),
  };
}

describe("PiBrowserTools", () => {
  it("declares the expected tool names and schemas", () => {
    const tools = createPiBrowserTools(makeBrowserStub());
    expect(tools.map((tool) => tool.name)).toEqual([...PI_BROWSER_TOOL_NAMES]);
    expect(tools.every((tool) => tool.parameters.type === "object")).toBe(true);
    expect(tools.every((tool) => typeof tool.promptSnippet === "string")).toBe(true);
    expect(tools.every((tool) => (tool.promptGuidelines?.length ?? 0) > 0)).toBe(true);
  });

  it("formats blocked actions as tool results instead of throwing", async () => {
    const clickTool = createPiBrowserTools(makeBrowserStub()).find(
      (tool) => tool.name === "browser_click",
    );
    expect(clickTool).toBeTruthy();

    const result = await (
      clickTool as unknown as {
        execute: (
          toolCallId: string,
          params: unknown,
          signal: AbortSignal | undefined,
          onUpdate: undefined,
          ctx: never,
        ) => Promise<{
          readonly isError: boolean;
          readonly details: unknown;
          readonly content: ReadonlyArray<unknown>;
        }>;
      }
    ).execute("tool-call", { text: "Follow" }, undefined, undefined, {} as never);
    expect(result.isError).toBe(false);
    expect(result).toEqual({
      content: [
        {
          type: "text",
          text: "Blocked browser action.",
        },
      ],
      details: {
        action: "click",
        blocked: true,
        reason: "Blocked browser action.",
        url: "https://x.com",
      },
      isError: false,
    });
    expect(result.details).toMatchObject({ blocked: true });
    expect(result.content[0]).toMatchObject({
      type: "text",
      text: "Blocked browser action.",
    });
  });

  it("returns screenshot image content when available", async () => {
    const screenshotTool = createPiBrowserTools(makeBrowserStub()).find(
      (tool) => tool.name === "browser_screenshot",
    );
    const result = await (
      screenshotTool as unknown as {
        execute: (
          toolCallId: string,
          params: unknown,
          signal: AbortSignal | undefined,
          onUpdate: undefined,
          ctx: never,
        ) => Promise<{ readonly content: ReadonlyArray<unknown> }>;
      }
    ).execute("tool-call", {}, undefined, undefined, {} as never);
    expect(result.content).toContainEqual({
      type: "image",
      data: "abc",
      mimeType: "image/png",
    });
  });

  it("keeps automatic persistence screenshots out of model-visible content", async () => {
    const browser = makeBrowserStub();
    vi.mocked(browser.search).mockResolvedValueOnce({
      action: "search",
      blocked: false,
      url: "https://x.com",
      origin: "https://x.com",
      persistenceScreenshotBase64: "abc",
      persistenceScreenshotMimeType: "image/png",
    });
    const searchTool = createPiBrowserTools(browser).find((tool) => tool.name === "browser_search");
    const result = await (
      searchTool as unknown as {
        execute: (
          toolCallId: string,
          params: unknown,
          signal: AbortSignal | undefined,
          onUpdate: undefined,
          ctx: never,
        ) => Promise<{
          readonly content: ReadonlyArray<unknown>;
          readonly details: unknown;
          readonly persistenceScreenshot?: unknown;
        }>;
      }
    ).execute("tool-call", { query: "ferrari" }, undefined, undefined, {} as never);

    expect(result.content).toEqual([
      {
        type: "text",
        text: [
          "Browser action completed: search",
          "URL: https://x.com",
          "Origin: https://x.com",
        ].join("\n"),
      },
    ]);
    expect(result.details).toEqual({
      action: "search",
      blocked: false,
      url: "https://x.com",
      origin: "https://x.com",
    });
    expect(result.persistenceScreenshot).toEqual({
      data: "abc",
      mimeType: "image/png",
      origin: "https://x.com",
      url: "https://x.com",
    });
  });
});
