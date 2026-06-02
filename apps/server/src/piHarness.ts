// @effect-diagnostics nodeBuiltinImport:off
import path from "node:path";

import {
  AuthStorage,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SettingsManager,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import {
  PI_DEFAULT_MODEL,
  type CanonicalItemType,
  type CanonicalRequestType,
} from "@t3tools/contracts";
import { PRODUCT_BASE_NAME } from "@t3tools/shared/branding";
import {
  COMPUTER_USE_ACTION_TOOL_NAMES,
  COMPUTER_USE_OBSERVE_TOOL_NAMES,
  COMPUTER_USE_TOOL_NAMES,
  computerUseToolTitle,
  summarizeComputerUseArgs,
} from "./computerUse/ComputerUseToolDefinitions.ts";

export const PI_PROVIDER = "pi" as const;

export const PI_BROWSER_TOOL_NAMES = [
  "browser_navigate",
  "browser_search",
  "browser_click",
  "browser_scroll",
  "browser_extract_text",
  "browser_screenshot",
] as const;

export const PI_COMPUTER_OBSERVE_TOOL_NAMES = COMPUTER_USE_OBSERVE_TOOL_NAMES;
export const PI_COMPUTER_ACTION_TOOL_NAMES = COMPUTER_USE_ACTION_TOOL_NAMES;
export const PI_COMPUTER_TOOL_NAMES = COMPUTER_USE_TOOL_NAMES;

export const PI_FULL_TOOL_NAMES = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
  ...PI_BROWSER_TOOL_NAMES,
] as const;

export const PI_PLAN_TOOL_NAMES = [
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  ...PI_BROWSER_TOOL_NAMES,
] as const;

export const PI_PROVIDER_SETUP_MESSAGE = `${PRODUCT_BASE_NAME} embeds Pi through the Pi Node SDK. Authenticate Pi outside ${PRODUCT_BASE_NAME} through the Pi CLI (\`pi\` or \`bunx pi\`) and \`/login\`, or populate ~/.pi/agent/auth.json / provider env vars. ${PRODUCT_BASE_NAME} intentionally disables Pi packages, extensions, prompt templates, skills, themes, AGENTS, and custom system-prompt discovery so ${PRODUCT_BASE_NAME} remains the only source of workspace instructions here.`;

export const PI_PLAN_MODE_PROMPT_PREFIX = `<collaboration_mode name="plan">
You are in ${PRODUCT_BASE_NAME} plan mode.

- Focus on exploration, clarification, and producing a detailed implementation plan.
- Do not edit or write files in this mode.
- You may inspect the repo and run non-mutating commands when they improve the plan.
- If the user asks to implement immediately while still in plan mode, respond with a detailed plan instead of making repo-tracked changes.
- When you present the finalized plan, wrap it in <proposed_plan>...</proposed_plan> so ${PRODUCT_BASE_NAME} can render it specially.
</collaboration_mode>`;

export const PI_DEFAULT_MODE_PROMPT_PREFIX = `<collaboration_mode name="default">
You are now in ${PRODUCT_BASE_NAME} build mode.

- Previous Ask or Plan mode instructions only applied to earlier turns.
- Treat this turn as an implementation request unless the user clearly asks only for explanation.
- You may inspect files, run commands, edit files, and use tools according to the current runtime permissions.
</collaboration_mode>`;

export interface PiCatalogModelOption {
  readonly slug: string;
  readonly name: string;
  readonly provider: string;
  readonly modelId: string;
  readonly reasoning: boolean;
  readonly supportsImageInput: boolean;
  readonly contextWindowTokens?: number;
}

export interface PiHarnessCatalogSnapshot {
  readonly agentDir: string;
  readonly configuredModels: ReadonlyArray<PiCatalogModelOption>;
  readonly availableModels: ReadonlyArray<PiCatalogModelOption>;
  readonly authProviders: ReadonlyArray<string>;
  readonly modelRegistryError?: string;
  readonly authErrors: ReadonlyArray<string>;
}

function normalizeString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

type PiSettingsSnapshot = ReturnType<SettingsManager["getGlobalSettings"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function mergePiSettings(
  base: PiSettingsSnapshot,
  override: PiSettingsSnapshot,
): PiSettingsSnapshot {
  const next: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) {
      continue;
    }
    const current = next[key];
    next[key] = isRecord(current) && isRecord(value) ? mergePiSettings(current, value) : value;
  }
  return next as PiSettingsSnapshot;
}

export function createLockedPiSettingsManager(input?: {
  readonly cwd?: string;
  readonly agentDir?: string;
}): SettingsManager {
  const fileSettingsManager = SettingsManager.create(input?.cwd, input?.agentDir);
  const mergedSettings = mergePiSettings(
    fileSettingsManager.getGlobalSettings(),
    fileSettingsManager.getProjectSettings(),
  );

  return SettingsManager.inMemory({
    ...mergedSettings,
    packages: [],
    extensions: [],
    skills: [],
    prompts: [],
    themes: [],
    enableSkillCommands: false,
  });
}

export function buildPiModelSlug(input: {
  readonly provider: string;
  readonly modelId: string;
}): string {
  return `${input.provider}/${input.modelId}`;
}

export function parsePiModelSlug(
  model: string | null | undefined,
): { readonly provider: string; readonly modelId: string } | null {
  const normalized = normalizeString(model);
  if (!normalized || normalized === PI_DEFAULT_MODEL) {
    return null;
  }

  const separatorIndex = normalized.indexOf("/");
  if (separatorIndex <= 0 || separatorIndex >= normalized.length - 1) {
    return null;
  }

  const provider = normalizeString(normalized.slice(0, separatorIndex));
  const modelId = normalizeString(normalized.slice(separatorIndex + 1));
  if (!provider || !modelId) {
    return null;
  }

  return { provider, modelId };
}

export function createPiHarnessCatalogSnapshot(input?: {
  readonly agentDir?: string;
  readonly authPath?: string;
  readonly modelsPath?: string;
}): PiHarnessCatalogSnapshot {
  const agentDir = normalizeString(input?.agentDir) ?? getAgentDir();
  const authPath = normalizeString(input?.authPath) ?? path.join(agentDir, "auth.json");
  const modelsPath = normalizeString(input?.modelsPath) ?? path.join(agentDir, "models.json");
  const authStorage = AuthStorage.create(authPath);
  const modelRegistry = new ModelRegistry(authStorage, modelsPath);

  const toCatalogModelOption = (
    model: ReturnType<ModelRegistry["getAll"]>[number],
  ): PiCatalogModelOption => ({
    slug: buildPiModelSlug({ provider: model.provider, modelId: model.id }),
    name: model.name,
    provider: model.provider,
    modelId: model.id,
    reasoning: Boolean(model.reasoning),
    supportsImageInput: model.input.includes("image"),
    ...(typeof model.contextWindow === "number"
      ? { contextWindowTokens: model.contextWindow }
      : {}),
  });

  const authErrors = authStorage
    .drainErrors()
    .map((error) => error.message.trim())
    .filter(Boolean);
  const modelRegistryError = normalizeString(modelRegistry.getError());

  return {
    agentDir,
    configuredModels: modelRegistry.getAll().map(toCatalogModelOption),
    availableModels: modelRegistry.getAvailable().map(toCatalogModelOption),
    authProviders: authStorage.list(),
    ...(modelRegistryError ? { modelRegistryError } : {}),
    authErrors,
  };
}

export async function createLockedPiResourceLoader(input: {
  readonly cwd: string;
  readonly agentDir?: string;
  readonly settingsManager: SettingsManager;
}) {
  const resourceLoader = new DefaultResourceLoader({
    cwd: input.cwd,
    agentDir: normalizeString(input.agentDir) ?? getAgentDir(),
    settingsManager: input.settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    agentsFilesOverride: () => ({ agentsFiles: [] }),
    systemPromptOverride: () => undefined,
    appendSystemPromptOverride: () => [],
  });
  await resourceLoader.reload();
  return resourceLoader;
}

export function mapPiToolNameToItemType(toolName: string): CanonicalItemType {
  if (
    (PI_BROWSER_TOOL_NAMES as readonly string[]).includes(toolName) ||
    (PI_COMPUTER_TOOL_NAMES as readonly string[]).includes(toolName)
  ) {
    return "dynamic_tool_call";
  }

  switch (toolName) {
    case "bash":
      return "command_execution";
    case "edit":
    case "write":
      return "file_change";
    default:
      return "dynamic_tool_call";
  }
}

export function mapPiToolNameToRequestType(toolName: string): CanonicalRequestType {
  if (
    (PI_BROWSER_TOOL_NAMES as readonly string[]).includes(toolName) ||
    (PI_COMPUTER_TOOL_NAMES as readonly string[]).includes(toolName)
  ) {
    return "dynamic_tool_call";
  }

  switch (toolName) {
    case "bash":
      return "command_execution_approval";
    case "edit":
    case "write":
      return "file_change_approval";
    default:
      return "file_read_approval";
  }
}

export function summarizePiToolArgs(toolName: string, args: Record<string, unknown>): string {
  if (toolName.startsWith("browser_")) {
    const url = normalizeString(typeof args.url === "string" ? args.url : undefined);
    const query = normalizeString(typeof args.query === "string" ? args.query : undefined);
    const selector = normalizeString(typeof args.selector === "string" ? args.selector : undefined);
    const text = normalizeString(typeof args.text === "string" ? args.text : undefined);
    const direction = normalizeString(
      typeof args.direction === "string" ? args.direction : undefined,
    );
    return url ?? query ?? selector ?? text ?? direction ?? toolName;
  }

  if (toolName.startsWith("computer_")) {
    return summarizeComputerUseArgs(toolName, args);
  }

  const command = normalizeString(typeof args.command === "string" ? args.command : undefined);
  if (toolName === "bash" && command) {
    return command;
  }

  const toolPath = normalizeString(typeof args.path === "string" ? args.path : undefined);
  if (toolName === "read" && toolPath) {
    return toolPath;
  }
  if ((toolName === "edit" || toolName === "write") && toolPath) {
    return toolPath;
  }
  if ((toolName === "find" || toolName === "grep" || toolName === "ls") && toolPath) {
    return toolPath;
  }

  if (toolName === "find" && typeof args.pattern === "string" && args.pattern.trim().length > 0) {
    return `pattern: ${args.pattern.trim()}`;
  }
  if (toolName === "grep" && typeof args.pattern === "string" && args.pattern.trim().length > 0) {
    return `pattern: ${args.pattern.trim()}`;
  }

  return toolName;
}

export function getPiToolTitle(toolName: string): string {
  if (toolName.startsWith("computer_")) {
    return computerUseToolTitle(toolName);
  }

  switch (toolName) {
    case "bash":
      return "Ran command";
    case "read":
      return "Read file";
    case "edit":
      return "Edited file";
    case "write":
      return "Wrote file";
    case "find":
      return "Found files";
    case "grep":
      return "Searched files";
    case "ls":
      return "Listed files";
    case "browser_navigate":
      return "Opened browser page";
    case "browser_search":
      return "Searched browser";
    case "browser_click":
      return "Clicked browser page";
    case "browser_scroll":
      return "Scrolled browser page";
    case "browser_extract_text":
      return "Read browser page";
    case "browser_screenshot":
      return "Captured screenshot";
    default:
      return toolName;
  }
}

export function extractAssistantTextFromPiSessionEvent(
  event: Extract<AgentSessionEvent, { type: "message_end" | "message_update" | "turn_end" }>,
): string {
  const message = event.message;
  if (
    !message ||
    typeof message !== "object" ||
    !("role" in message) ||
    message.role !== "assistant"
  ) {
    return "";
  }

  const content = "content" in message ? message.content : undefined;
  if (!Array.isArray(content)) {
    return "";
  }

  const textParts: string[] = [];
  for (const entry of content) {
    if (
      entry !== null &&
      typeof entry === "object" &&
      "type" in entry &&
      entry.type === "text" &&
      "text" in entry &&
      typeof entry.text === "string"
    ) {
      textParts.push(entry.text);
    }
  }

  return textParts.join("");
}

export function extractProposedPlanMarkdown(text: string | null | undefined): string | null {
  const normalized = normalizeString(text);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/<proposed_plan>\s*([\s\S]*?)\s*<\/proposed_plan>/i);
  const markdown = normalizeString(match?.[1]);
  return markdown ?? null;
}
