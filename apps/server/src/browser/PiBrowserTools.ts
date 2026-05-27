import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { PRODUCT_BASE_NAME } from "@t3tools/shared/branding";

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

  const { persistenceScreenshotBase64, persistenceScreenshotMimeType, ...details } = result;

  return {
    content,
    details,
    ...(persistenceScreenshotBase64 && persistenceScreenshotMimeType
      ? {
          persistenceScreenshot: {
            data: persistenceScreenshotBase64,
            mimeType: persistenceScreenshotMimeType,
            ...(result.origin ? { origin: result.origin } : {}),
            ...(result.url ? { url: result.url } : {}),
          },
        }
      : {}),
    isError: false,
  };
}

const BROWSER_PROMPT_GUIDELINES = [
  `Browser tools use an isolated persistent ${PRODUCT_BASE_NAME} browser profile.`,
  "Never request or expose cookies, tokens, localStorage, passwords, payment details, or private credentials.",
  "Browser actions are read/search/navigation only; mutating social/account actions are blocked.",
] as const;

export function createPiBrowserTools(browser: BrowserAutomationServiceShape): ToolDefinition[] {
  return [
    {
      name: "browser_navigate",
      label: "Open browser page",
      description: `Open an allowlisted URL in the persistent ${PRODUCT_BASE_NAME} browser profile.`,
      promptSnippet: `browser_navigate - open an allowlisted URL in the persistent ${PRODUCT_BASE_NAME} browser profile`,
      promptGuidelines: [...BROWSER_PROMPT_GUIDELINES],
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
      promptSnippet:
        "browser_search - search within the current allowlisted site or an allowlisted search page",
      promptGuidelines: [...BROWSER_PROMPT_GUIDELINES],
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
      promptSnippet:
        "browser_click - click links or inert controls on the current allowlisted page",
      promptGuidelines: [...BROWSER_PROMPT_GUIDELINES],
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
      promptSnippet: "browser_scroll - scroll the current allowlisted page",
      promptGuidelines: [...BROWSER_PROMPT_GUIDELINES],
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
      promptSnippet: "browser_extract_text - read visible text from the current allowlisted page",
      promptGuidelines: [...BROWSER_PROMPT_GUIDELINES],
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
      promptSnippet: "browser_screenshot - capture the current browser viewport",
      promptGuidelines: [...BROWSER_PROMPT_GUIDELINES],
      parameters: Type.Object({}),
      execute: async () => toToolResult(await browser.screenshot()),
    },
  ];
}
