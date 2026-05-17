import { Type } from "@sinclair/typebox";

import type {
  BrowserAutomationServiceShape,
  BrowserToolResult,
} from "./BrowserAutomationService.ts";

export const PI_BROWSER_TOOL_NAMES = [
  "browser_navigate",
  "browser_search",
  "browser_click",
  "browser_scroll",
  "browser_extract_text",
  "browser_screenshot",
] as const;

type PiToolResultContent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly data: string; readonly mimeType: string };

function summarizeResult(result: BrowserToolResult): string {
  if (result.blocked) {
    return result.reason ?? "Browser action blocked.";
  }

  const lines = [
    `Browser action completed: ${result.action}`,
    result.title ? `Title: ${result.title}` : null,
    result.url ? `URL: ${result.url}` : null,
    result.origin ? `Origin: ${result.origin}` : null,
    result.text ? `Text:\n${result.text}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function toToolResult(result: BrowserToolResult) {
  const content: PiToolResultContent[] = [{ type: "text", text: summarizeResult(result) }];
  if (result.screenshotBase64 && result.mimeType) {
    content.push({
      type: "image",
      data: result.screenshotBase64,
      mimeType: result.mimeType,
    });
  }
  return {
    content,
    details: result,
    isError: false,
  };
}

export function createPiBrowserTools(browser: BrowserAutomationServiceShape) {
  return [
    {
      name: "browser_navigate",
      label: "Open browser page",
      description: "Open an allowlisted URL in the persistent T3 browser profile.",
      parameters: Type.Object({
        url: Type.String({ minLength: 1 }),
      }),
      execute: async (_toolCallId: string, params: { readonly url: string }) =>
        toToolResult(await browser.navigate({ url: params.url })),
    },
    {
      name: "browser_search",
      label: "Search browser",
      description:
        "Search within the current allowlisted site, or open an allowlisted search URL first.",
      parameters: Type.Object({
        query: Type.String({ minLength: 1 }),
        url: Type.Optional(Type.String()),
      }),
      execute: async (
        _toolCallId: string,
        params: { readonly query: string; readonly url?: string },
      ) => toToolResult(await browser.search(params)),
    },
    {
      name: "browser_click",
      label: "Click browser page",
      description: "Click a link or inert control on the current allowlisted browser page.",
      parameters: Type.Object({
        selector: Type.Optional(Type.String()),
        text: Type.Optional(Type.String()),
      }),
      execute: async (
        _toolCallId: string,
        params: { readonly selector?: string; readonly text?: string },
      ) => toToolResult(await browser.click(params)),
    },
    {
      name: "browser_scroll",
      label: "Scroll browser page",
      description: "Scroll the current allowlisted browser page.",
      parameters: Type.Object({
        direction: Type.Optional(Type.Union([Type.Literal("up"), Type.Literal("down")])),
        amount: Type.Optional(Type.Number()),
      }),
      execute: async (
        _toolCallId: string,
        params?: { readonly direction?: "up" | "down"; readonly amount?: number },
      ) => toToolResult(await browser.scroll(params)),
    },
    {
      name: "browser_extract_text",
      label: "Read browser page",
      description: "Extract visible text from the current allowlisted browser page.",
      parameters: Type.Object({
        maxChars: Type.Optional(Type.Number()),
      }),
      execute: async (_toolCallId: string, params?: { readonly maxChars?: number }) =>
        toToolResult(await browser.extractText(params)),
    },
    {
      name: "browser_screenshot",
      label: "Capture browser screenshot",
      description: "Capture the current viewport of the allowlisted browser page.",
      parameters: Type.Object({}),
      execute: async () => toToolResult(await browser.screenshot()),
    },
  ];
}
