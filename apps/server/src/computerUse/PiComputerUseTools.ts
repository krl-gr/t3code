import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import { PRODUCT_BASE_NAME } from "@t3tools/shared/branding";

import type { ComputerUseServiceShape, ComputerUseToolResult } from "./ComputerUseService.ts";
import { COMPUTER_USE_TOOLS } from "./ComputerUseToolDefinitions.ts";

type PiComputerUseToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

const COMPUTER_USE_PROMPT_GUIDELINES = [
  "Computer tools inspect and control the user's visible desktop through the configured MCP backend.",
  "Prefer element indexes returned by computer_get_app_state. Use coordinates only when explicitly enabled.",
  "Never request, type, expose, or store passwords, payment details, tokens, or private credentials.",
  "Action tools are unavailable unless Computer Use is enabled in control mode.",
] as const;

function toPiToolResult(result: ComputerUseToolResult) {
  const content: PiComputerUseToolContent[] = result.content.map((item) => {
    if (item.type === "image") {
      return {
        type: "image",
        data: item.data,
        mimeType: item.mimeType,
      };
    }
    return {
      type: "text",
      text: item.text,
    };
  });

  return {
    content,
    details: {
      ...result.details,
      ...(result.persistenceScreenshot
        ? { persistenceScreenshot: result.persistenceScreenshot }
        : {}),
      isError: result.isError,
    },
    isError: result.isError,
  };
}

export function createPiComputerUseTools(
  computerUse: ComputerUseServiceShape,
): ToolDefinition[] {
  return COMPUTER_USE_TOOLS.map((tool) => ({
    name: tool.name,
    label: tool.label,
    description: tool.description,
    promptSnippet: `${tool.name} - ${tool.description}`,
    promptGuidelines: [
      ...COMPUTER_USE_PROMPT_GUIDELINES,
      `${PRODUCT_BASE_NAME} may ask the user to approve desktop control actions before they run.`,
    ],
    parameters: Type.Unsafe(tool.inputSchema),
    execute: async (
      _toolCallId: string,
      params?: Record<string, unknown>,
    ) => toPiToolResult(await computerUse.callTool({ toolName: tool.name, args: params ?? {} })),
  }));
}
