// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalTimers:off
// @effect-diagnostics globalDate:off
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  type AgentSession,
  type AgentSessionEvent,
  AuthStorage,
  createAgentSession,
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
  getAgentDir,
  ModelRegistry,
  SessionManager,
  type SessionMessageEntry,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";
import {
  ApprovalRequestId,
  EventId,
  PI_DEFAULT_MODEL,
  ProviderDriverKind,
  RuntimeItemId,
  RuntimeRequestId,
  ThreadId,
  TurnId,
  type ChatAttachment,
  type PiThinkingLevel,
  type ProviderApprovalDecision,
  type ProviderInteractionMode,
  type ProviderRuntimeEvent,
  type ProviderSession,
  type ProviderTurnStartResult,
} from "@t3tools/contracts";
import { PRODUCT_BASE_NAME } from "@t3tools/shared/branding";

import { resolveAttachmentPath } from "./attachmentStore.ts";
import { applyAskModePromptPrefix } from "./provider/AskModeInstructions.ts";
import { createPiBrowserTools } from "./browser/PiBrowserTools.ts";
import type { BrowserAutomationServiceShape } from "./browser/BrowserAutomationService.ts";
import type {
  ProviderThreadSnapshot,
  ProviderThreadTurnSnapshot,
} from "./provider/Services/ProviderAdapter.ts";
import {
  buildPiModelSlug,
  createLockedPiResourceLoader,
  createLockedPiSettingsManager,
  extractAssistantTextFromPiSessionEvent,
  extractProposedPlanMarkdown,
  getPiToolTitle,
  mapPiToolNameToItemType,
  mapPiToolNameToRequestType,
  PI_BROWSER_TOOL_NAMES,
  PI_DEFAULT_MODE_PROMPT_PREFIX,
  PI_FULL_TOOL_NAMES,
  PI_PLAN_MODE_PROMPT_PREFIX,
  PI_PLAN_TOOL_NAMES,
  PI_PROVIDER,
  parsePiModelSlug,
  summarizePiToolArgs,
} from "./piHarness.ts";

const PI_TURN_START_TIMEOUT_MS = 15_000;
const PI_DRIVER_KIND = ProviderDriverKind.make("pi");

type PiBuiltinTool = NonNullable<
  NonNullable<Parameters<typeof createAgentSession>[0]>["tools"]
>[number];
type PiCustomTool = NonNullable<
  NonNullable<Parameters<typeof createAgentSession>[0]>["customTools"]
>[number];
type PiModelOptions = {
  readonly pi?: {
    readonly thinkingLevel?: PiThinkingLevel;
  };
};

interface PiPendingApprovalRequest {
  readonly requestId: ApprovalRequestId;
  readonly turnId: TurnId;
  readonly requestType: ReturnType<typeof mapPiToolNameToRequestType>;
  readonly detail: string;
  readonly cacheKey: string;
  readonly resolve: (decision: ProviderApprovalDecision) => void;
}

interface PiUsageAggregate {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
  readonly reject: (reason?: unknown) => void;
}

interface PiPendingTurn {
  readonly turnId: TurnId;
  readonly started: Deferred<void>;
  readonly interactionMode: ProviderInteractionMode;
  usage: PiUsageAggregate;
  lastAssistantText: string;
  lastStopReason: string | null;
  interrupted: boolean;
  startedAt: string;
  startedSignalEmitted: boolean;
  completed: boolean;
}

interface PiSessionContext {
  session: AgentSession;
  sessionManager: SessionManager;
  settingsManager: SettingsManager;
  modelRegistry: ModelRegistry;
  authStorage: AuthStorage;
  sessionRecord: ProviderSession;
  pendingApprovals: Map<ApprovalRequestId, PiPendingApprovalRequest>;
  approvalAllowCache: Set<string>;
  currentTurn: PiPendingTurn | null;
  stopping: boolean;
}

interface PiSessionFactoryInput {
  readonly threadId: ThreadId;
  readonly cwd: string;
  readonly agentDir: string;
  readonly sessionDir: string;
  readonly tools: PiBuiltinTool[];
  readonly customTools: PiCustomTool[];
  readonly sessionFile?: string;
  readonly model?: string;
  readonly runtimeMode: ProviderSession["runtimeMode"];
}

interface PiCreatedSession {
  readonly session: AgentSession;
  readonly sessionManager: SessionManager;
  readonly settingsManager: SettingsManager;
  readonly modelRegistry: ModelRegistry;
  readonly authStorage: AuthStorage;
}

export interface PiSdkManagerOptions {
  readonly stateDir: string;
  readonly browserAutomation?: BrowserAutomationServiceShape;
  readonly agentDir?: string;
  readonly sessionDir?: string;
  readonly createSession?: (input: PiSessionFactoryInput) => Promise<PiCreatedSession>;
  readonly now?: () => string;
}

export interface PiSdkManagerEvents {
  event: [event: ProviderRuntimeEvent];
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizePiThinkingLevel(value: unknown): PiThinkingLevel | undefined {
  return value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
    ? value
    : undefined;
}

function toPiModelSlug(model: AgentSession["model"] | undefined): string | undefined {
  if (!model) {
    return undefined;
  }
  return buildPiModelSlug({ provider: model.provider, modelId: model.id });
}

function createEmptyUsageAggregate(): PiUsageAggregate {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    totalCost: 0,
  };
}

function summarizeToolResultText(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }

  const content = isRecord(value) ? value.content : undefined;
  if (!Array.isArray(content)) {
    return undefined;
  }

  const texts = content
    .flatMap((entry) => {
      if (!isRecord(entry)) {
        return [] as string[];
      }
      if (entry.type === "text" && typeof entry.text === "string") {
        return [entry.text.trim()];
      }
      return [] as string[];
    })
    .filter((entry) => entry.length > 0);

  return texts.length > 0 ? texts.join("\n").slice(0, 2_000) : undefined;
}

function addUsage(aggregate: PiUsageAggregate, message: unknown): PiUsageAggregate {
  const usage = isRecord(message) && isRecord(message.usage) ? message.usage : undefined;
  const cost = usage && isRecord(usage.cost) ? usage.cost : undefined;

  const next = { ...aggregate };
  next.input += typeof usage?.input === "number" ? usage.input : 0;
  next.output += typeof usage?.output === "number" ? usage.output : 0;
  next.cacheRead += typeof usage?.cacheRead === "number" ? usage.cacheRead : 0;
  next.cacheWrite += typeof usage?.cacheWrite === "number" ? usage.cacheWrite : 0;
  next.totalTokens += typeof usage?.totalTokens === "number" ? usage.totalTokens : 0;
  next.totalCost += typeof cost?.total === "number" ? cost.total : 0;
  return next;
}

function usageAggregateToPayload(aggregate: PiUsageAggregate):
  | {
      readonly input: number;
      readonly output: number;
      readonly cacheRead: number;
      readonly cacheWrite: number;
      readonly totalTokens: number;
      readonly cost: {
        readonly input: number;
        readonly output: number;
        readonly cacheRead: number;
        readonly cacheWrite: number;
        readonly total: number;
      };
    }
  | undefined {
  if (
    aggregate.input === 0 &&
    aggregate.output === 0 &&
    aggregate.cacheRead === 0 &&
    aggregate.cacheWrite === 0 &&
    aggregate.totalTokens === 0 &&
    aggregate.totalCost === 0
  ) {
    return undefined;
  }

  return {
    input: aggregate.input,
    output: aggregate.output,
    cacheRead: aggregate.cacheRead,
    cacheWrite: aggregate.cacheWrite,
    totalTokens: aggregate.totalTokens,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: aggregate.totalCost,
    },
  };
}

function stateFromPromptError(error: unknown): "failed" | "interrupted" {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("aborted") || message.includes("cancelled") ? "interrupted" : "failed";
}

function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }
  const stringified = String(error).trim();
  return stringified.length > 0 ? stringified : fallback;
}

function withTimeout<T>(input: {
  readonly promise: Promise<T>;
  readonly timeoutMs: number;
  readonly label: string;
}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${input.label} timed out after ${input.timeoutMs}ms.`));
    }, input.timeoutMs);

    input.promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizePiPromptInput(input: {
  readonly text: string;
  readonly interactionMode?: ProviderInteractionMode;
}): string {
  if (input.interactionMode === "plan") {
    return [PI_PLAN_MODE_PROMPT_PREFIX, "", input.text].join("\n");
  }

  if (input.interactionMode === "ask") {
    return applyAskModePromptPrefix(input.text);
  }

  if (input.interactionMode === "default") {
    return [PI_DEFAULT_MODE_PROMPT_PREFIX, "", input.text].join("\n");
  }

  return input.text;
}

async function createPiSessionWithSdk(input: PiSessionFactoryInput): Promise<PiCreatedSession> {
  const authStorage = AuthStorage.create(path.join(input.agentDir, "auth.json"));
  const modelRegistry = new ModelRegistry(authStorage, path.join(input.agentDir, "models.json"));
  const settingsManager = createLockedPiSettingsManager({
    cwd: input.cwd,
    agentDir: input.agentDir,
  });
  const sessionManager = input.sessionFile
    ? SessionManager.open(input.sessionFile, input.sessionDir)
    : SessionManager.create(input.cwd, input.sessionDir);
  const resourceLoader = await createLockedPiResourceLoader({
    cwd: input.cwd,
    agentDir: input.agentDir,
    settingsManager,
  });

  const parsedModel = parsePiModelSlug(input.model);
  const resolvedModel = parsedModel
    ? modelRegistry.find(parsedModel.provider, parsedModel.modelId)
    : undefined;

  if (parsedModel && !resolvedModel) {
    throw new Error(
      `Pi model '${input.model}' was not found in the authenticated Pi catalog. Use a provider/model id advertised by Pi, or keep '${PI_DEFAULT_MODEL}' to let Pi choose its default model.`,
    );
  }

  const { session } = await createAgentSession({
    cwd: input.cwd,
    agentDir: input.agentDir,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader,
    sessionManager,
    tools: input.tools,
    customTools: input.customTools,
    ...(resolvedModel ? { model: resolvedModel } : {}),
  });

  return {
    session,
    sessionManager,
    settingsManager,
    modelRegistry,
    authStorage,
  };
}

export class PiSdkManager extends EventEmitter<PiSdkManagerEvents> {
  private readonly sessions = new Map<ThreadId, PiSessionContext>();
  private readonly startingSessions = new Map<ThreadId, PiSessionContext>();
  private readonly startingThreadIds = new Set<ThreadId>();
  private readonly now: () => string;
  private readonly stateDir: string;
  private readonly agentDir: string;
  private readonly sessionDir: string;
  private readonly browserAutomation: BrowserAutomationServiceShape | undefined;
  private readonly createSessionFactory: (
    input: PiSessionFactoryInput,
  ) => Promise<PiCreatedSession>;

  constructor(options: PiSdkManagerOptions) {
    super();
    this.now = options.now ?? (() => new Date().toISOString());
    this.stateDir = options.stateDir;
    this.agentDir = normalizeString(options.agentDir) ?? getAgentDir();
    this.sessionDir =
      normalizeString(options.sessionDir) ??
      path.join(options.stateDir, "provider", "pi", "sessions");
    this.browserAutomation = options.browserAutomation;
    this.createSessionFactory = options.createSession ?? createPiSessionWithSdk;
  }

  private emitRuntimeEvent(event: ProviderRuntimeEvent) {
    this.emit("event", event);
  }

  private createEventBase(input: { readonly threadId: ThreadId; readonly turnId?: TurnId }) {
    return {
      eventId: EventId.make(randomUUID()),
      provider: PI_DRIVER_KIND,
      threadId: input.threadId,
      createdAt: this.now(),
      ...(input.turnId ? { turnId: input.turnId } : {}),
    } as const;
  }

  private updateSession(
    context: PiSessionContext,
    patch: Partial<ProviderSession>,
  ): ProviderSession {
    context.sessionRecord = {
      ...context.sessionRecord,
      ...patch,
      updatedAt: this.now(),
    };
    return context.sessionRecord;
  }

  private requireSession(threadId: ThreadId): PiSessionContext {
    const context = this.sessions.get(threadId) ?? this.startingSessions.get(threadId);
    if (context) {
      return context;
    }
    if (this.startingThreadIds.has(threadId)) {
      throw new Error(`Pi thread '${threadId}' is still starting.`);
    }
    throw new Error(`Unknown Pi thread '${threadId}'.`);
  }

  private assertBrowserToolsRegistered(context: PiSessionContext) {
    if (!this.browserAutomation) {
      return;
    }

    const effectiveToolNames = new Set(context.session.getActiveToolNames());
    const missingToolNames = PI_BROWSER_TOOL_NAMES.filter(
      (toolName) => !effectiveToolNames.has(toolName),
    );
    if (missingToolNames.length === 0) {
      return;
    }

    throw new Error(
      `Pi browser tools were not registered in the active session. Missing tools: ${missingToolNames.join(", ")}. Restart the Pi session or rebuild the tool registry.`,
    );
  }

  private buildSessionConfiguredPayload(context: PiSessionContext) {
    const availableModels = context.modelRegistry.getAvailable();
    const currentModelSlug =
      toPiModelSlug(context.session.model) ?? context.sessionRecord.model ?? PI_DEFAULT_MODEL;
    const currentModel = availableModels.find(
      (model) =>
        buildPiModelSlug({ provider: model.provider, modelId: model.id }) === currentModelSlug,
    );
    const currentModelSupportsReasoning = Boolean(currentModel?.reasoning);
    const currentThinkingLevel = currentModelSupportsReasoning
      ? normalizePiThinkingLevel(context.session.thinkingLevel)
      : undefined;
    const availableThinkingLevels = currentModelSupportsReasoning
      ? context.session
          .getAvailableThinkingLevels()
          .map((level) => normalizePiThinkingLevel(level))
          .filter((level): level is PiThinkingLevel => level !== undefined)
      : [];

    const configuredModels = availableModels.map((model) => {
      const configuredModel = {
        modelId: buildPiModelSlug({ provider: model.provider, modelId: model.id }),
        name: model.name,
        provider: model.provider,
        reasoning: Boolean(model.reasoning),
        input: model.input,
      } as {
        modelId: string;
        name: string;
        provider: string;
        reasoning: boolean;
        input: ReadonlyArray<string>;
        contextWindow?: number;
      };
      if (typeof model.contextWindow === "number") {
        configuredModel.contextWindow = model.contextWindow;
      }
      return configuredModel;
    });

    return {
      config: {
        currentModelId: currentModelSlug,
        availableModels: configuredModels,
        ...(currentThinkingLevel ? { currentThinkingLevel } : {}),
        ...(availableThinkingLevels.length > 0 ? { availableThinkingLevels } : {}),
        ...(currentModel && typeof currentModel.contextWindow === "number"
          ? { currentModelContextWindow: currentModel.contextWindow }
          : {}),
      },
    } as const;
  }

  private emitSessionConfigured(context: PiSessionContext) {
    this.emitRuntimeEvent({
      ...this.createEventBase({ threadId: context.sessionRecord.threadId }),
      type: "session.configured",
      payload: this.buildSessionConfiguredPayload(context),
    });
  }

  private applyThinkingLevel(context: PiSessionContext, level: PiThinkingLevel | undefined) {
    const normalizedLevel = normalizePiThinkingLevel(level);
    if (!normalizedLevel) {
      return false;
    }

    const previousThinkingLevel = normalizePiThinkingLevel(context.session.thinkingLevel) ?? "off";
    context.session.setThinkingLevel(normalizedLevel);
    const nextThinkingLevel = normalizePiThinkingLevel(context.session.thinkingLevel) ?? "off";
    return nextThinkingLevel !== previousThinkingLevel;
  }

  private emitSessionStarted(context: PiSessionContext) {
    this.emitRuntimeEvent({
      ...this.createEventBase({ threadId: context.sessionRecord.threadId }),
      type: "session.started",
      payload: {
        message: "Connected to the embedded Pi agent harness.",
        resume: context.sessionRecord.resumeCursor,
      },
    });
    this.emitRuntimeEvent({
      ...this.createEventBase({ threadId: context.sessionRecord.threadId }),
      type: "thread.started",
      payload: {
        providerThreadId: context.session.sessionId,
      },
    });
    this.emitSessionConfigured(context);
  }

  private async materializePiImages(
    attachments: ReadonlyArray<ChatAttachment> | undefined,
  ): Promise<Array<{ type: "image"; data: string; mimeType: string }>> {
    const images: Array<{ type: "image"; data: string; mimeType: string }> = [];
    for (const attachment of attachments ?? []) {
      const attachmentPath = resolveAttachmentPath({
        attachmentsDir: path.join(this.stateDir, "attachments"),
        attachment,
      });
      if (!attachmentPath) {
        throw new Error(`Invalid attachment id '${attachment.id}'.`);
      }
      const bytes = await fs.readFile(attachmentPath);
      images.push({
        type: "image",
        data: Buffer.from(bytes).toString("base64"),
        mimeType: attachment.mimeType,
      });
    }
    return images;
  }

  private buildApprovalCacheKey(input: {
    readonly requestType: ReturnType<typeof mapPiToolNameToRequestType>;
    readonly detail: string;
  }) {
    return `${input.requestType}\u0000${input.detail}`;
  }

  private async awaitApprovalDecision(input: {
    readonly context: PiSessionContext;
    readonly toolName: string;
    readonly turnId: TurnId;
    readonly detail: string;
    readonly signal?: AbortSignal;
  }): Promise<void> {
    if (input.context.sessionRecord.runtimeMode !== "approval-required") {
      return;
    }

    const requestType = mapPiToolNameToRequestType(input.toolName);
    const cacheKey = this.buildApprovalCacheKey({ requestType, detail: input.detail });
    if (input.context.approvalAllowCache.has(cacheKey)) {
      return;
    }

    const requestId = ApprovalRequestId.make(randomUUID());
    const requestDeferred = deferred<ProviderApprovalDecision>();
    const pending: PiPendingApprovalRequest = {
      requestId,
      turnId: input.turnId,
      requestType,
      detail: input.detail,
      cacheKey,
      resolve: requestDeferred.resolve,
    };
    input.context.pendingApprovals.set(requestId, pending);

    this.emitRuntimeEvent({
      ...this.createEventBase({
        threadId: input.context.sessionRecord.threadId,
        turnId: input.turnId,
      }),
      requestId: RuntimeRequestId.make(requestId),
      type: "request.opened",
      payload: {
        requestType,
        detail: input.detail,
      },
    });

    const aborted = deferred<void>();
    const onAbort = () => aborted.resolve();
    input.signal?.addEventListener("abort", onAbort, { once: true });

    let decision: ProviderApprovalDecision;
    try {
      decision = await Promise.race([
        requestDeferred.promise,
        aborted.promise.then(() => "cancel" as const),
      ]);
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
      input.context.pendingApprovals.delete(requestId);
    }

    this.emitRuntimeEvent({
      ...this.createEventBase({
        threadId: input.context.sessionRecord.threadId,
        turnId: input.turnId,
      }),
      requestId: RuntimeRequestId.make(requestId),
      type: "request.resolved",
      payload: {
        requestType,
        decision,
      },
    });

    if (decision === "acceptForSession") {
      input.context.approvalAllowCache.add(cacheKey);
      return;
    }
    if (decision === "accept") {
      return;
    }
    if (decision === "decline") {
      throw new Error(`Pi ${input.toolName} execution was declined by the user.`);
    }
    throw new Error(`Pi ${input.toolName} execution was cancelled before approval.`);
  }

  private createWrappedBuiltinTools(input: {
    readonly cwd: string;
    readonly contextRef: { current?: PiSessionContext };
  }): PiBuiltinTool[] {
    const baseTools = [
      createReadTool(input.cwd),
      createBashTool(input.cwd),
      createEditTool(input.cwd),
      createWriteTool(input.cwd),
      createGrepTool(input.cwd),
      createFindTool(input.cwd),
      createLsTool(input.cwd),
    ];

    return baseTools.map((tool) => {
      const execute: PiBuiltinTool["execute"] = async (
        toolCallId: Parameters<PiBuiltinTool["execute"]>[0],
        params: Parameters<PiBuiltinTool["execute"]>[1],
        signal: Parameters<PiBuiltinTool["execute"]>[2],
        onUpdate: Parameters<PiBuiltinTool["execute"]>[3],
      ) => {
        const context = input.contextRef.current;
        if (!context) {
          throw new Error("Pi session context is unavailable.");
        }
        const currentTurn = context.currentTurn;
        if (!currentTurn) {
          throw new Error(`No Pi turn is active while executing '${tool.name}'.`);
        }

        await this.awaitApprovalDecision({
          context,
          toolName: tool.name,
          turnId: currentTurn.turnId,
          detail: summarizePiToolArgs(tool.name, params as Record<string, unknown>),
          ...(signal !== undefined ? { signal } : {}),
        });

        return tool.execute(toolCallId, params, signal, onUpdate);
      };

      return Object.assign({}, tool, { execute });
    });
  }

  private createWrappedCustomTools(input: {
    readonly contextRef: { current?: PiSessionContext };
  }): PiCustomTool[] {
    const browserTools = this.browserAutomation ? createPiBrowserTools(this.browserAutomation) : [];

    return browserTools.map((tool) => {
      const execute: PiCustomTool["execute"] = async (
        toolCallId: Parameters<PiCustomTool["execute"]>[0],
        params: Parameters<PiCustomTool["execute"]>[1],
        signal: Parameters<PiCustomTool["execute"]>[2],
        onUpdate: Parameters<PiCustomTool["execute"]>[3],
        ctx: Parameters<PiCustomTool["execute"]>[4],
      ) => {
        const context = input.contextRef.current;
        if (!context) {
          throw new Error("Pi session context is unavailable.");
        }
        const currentTurn = context.currentTurn;
        if (!currentTurn) {
          throw new Error(`No Pi turn is active while executing '${tool.name}'.`);
        }

        await this.awaitApprovalDecision({
          context,
          toolName: tool.name,
          turnId: currentTurn.turnId,
          detail: summarizePiToolArgs(tool.name, params as Record<string, unknown>),
          ...(signal !== undefined ? { signal } : {}),
        });

        return tool.execute(toolCallId, params, signal, onUpdate, ctx);
      };

      return Object.assign({}, tool, { execute });
    });
  }

  private bindSessionEvents(context: PiSessionContext) {
    context.session.subscribe((event) => {
      void this.handleSessionEvent(context, event);
    });
  }

  private async handleSessionEvent(context: PiSessionContext, event: AgentSessionEvent) {
    const turn = context.currentTurn;
    switch (event.type) {
      case "agent_start": {
        if (!turn || turn.completed) {
          return;
        }
        if (turn.startedSignalEmitted) {
          return;
        }
        if (!turn.interrupted) {
          this.updateSession(context, {
            status: "running",
            activeTurnId: turn.turnId,
            lastError: undefined,
          });
        }
        turn.startedSignalEmitted = true;
        turn.started.resolve();
        this.emitRuntimeEvent({
          ...this.createEventBase({
            threadId: context.sessionRecord.threadId,
            turnId: turn.turnId,
          }),
          type: "turn.started",
          payload: normalizeString(context.sessionRecord.model)
            ? { model: context.sessionRecord.model }
            : {},
        });
        return;
      }

      case "message_update": {
        if (!turn || turn.completed) {
          return;
        }
        if (event.message?.role !== "assistant") {
          return;
        }

        if (event.assistantMessageEvent.type === "text_delta") {
          this.emitRuntimeEvent({
            ...this.createEventBase({
              threadId: context.sessionRecord.threadId,
              turnId: turn.turnId,
            }),
            type: "content.delta",
            payload: {
              streamKind: "assistant_text",
              delta: event.assistantMessageEvent.delta,
            },
          });
          return;
        }

        if (event.assistantMessageEvent.type === "thinking_delta") {
          this.emitRuntimeEvent({
            ...this.createEventBase({
              threadId: context.sessionRecord.threadId,
              turnId: turn.turnId,
            }),
            type: "content.delta",
            payload: {
              streamKind: "reasoning_text",
              delta: event.assistantMessageEvent.delta,
            },
          });
        }
        return;
      }

      case "tool_execution_start": {
        if (!turn || turn.completed) {
          return;
        }
        this.emitRuntimeEvent({
          ...this.createEventBase({
            threadId: context.sessionRecord.threadId,
            turnId: turn.turnId,
          }),
          itemId: RuntimeItemId.make(event.toolCallId),
          type: "item.started",
          payload: {
            itemType: mapPiToolNameToItemType(event.toolName),
            title: getPiToolTitle(event.toolName),
            detail: summarizePiToolArgs(event.toolName, isRecord(event.args) ? event.args : {}),
            status: "inProgress",
          },
        });
        return;
      }

      case "tool_execution_update": {
        if (!turn || turn.completed) {
          return;
        }
        this.emitRuntimeEvent({
          ...this.createEventBase({
            threadId: context.sessionRecord.threadId,
            turnId: turn.turnId,
          }),
          itemId: RuntimeItemId.make(event.toolCallId),
          type: "item.updated",
          payload: {
            itemType: mapPiToolNameToItemType(event.toolName),
            title: getPiToolTitle(event.toolName),
            ...(summarizeToolResultText(event.partialResult)
              ? { detail: summarizeToolResultText(event.partialResult) }
              : {}),
            status: "inProgress",
            data: event.partialResult,
          },
        });
        return;
      }

      case "tool_execution_end": {
        if (!turn || turn.completed) {
          return;
        }
        this.emitRuntimeEvent({
          ...this.createEventBase({
            threadId: context.sessionRecord.threadId,
            turnId: turn.turnId,
          }),
          itemId: RuntimeItemId.make(event.toolCallId),
          type: "item.completed",
          payload: {
            itemType: mapPiToolNameToItemType(event.toolName),
            title: getPiToolTitle(event.toolName),
            ...(summarizeToolResultText(event.result)
              ? { detail: summarizeToolResultText(event.result) }
              : {}),
            status: event.isError ? "failed" : "completed",
            data: event.result,
          },
        });
        return;
      }

      case "message_end": {
        if (!turn || turn.completed) {
          return;
        }
        if (event.message?.role !== "assistant") {
          return;
        }
        turn.lastAssistantText = extractAssistantTextFromPiSessionEvent(event);
        turn.usage = addUsage(turn.usage, event.message);
        const stopReason =
          isRecord(event.message) && typeof event.message.stopReason === "string"
            ? event.message.stopReason
            : null;
        turn.lastStopReason = stopReason;
        return;
      }

      default:
        return;
    }
  }

  private async completeTurn(
    context: PiSessionContext,
    turn: PiPendingTurn,
    input: {
      readonly state: "completed" | "failed" | "interrupted";
      readonly stopReason: string | null;
      readonly errorMessage?: string;
    },
  ) {
    if (turn.completed) {
      return;
    }
    turn.completed = true;

    const usage = usageAggregateToPayload(turn.usage);
    const planMarkdown =
      turn.interactionMode === "plan" ? extractProposedPlanMarkdown(turn.lastAssistantText) : null;
    if (planMarkdown) {
      this.emitRuntimeEvent({
        ...this.createEventBase({ threadId: context.sessionRecord.threadId, turnId: turn.turnId }),
        type: "turn.proposed.completed",
        payload: {
          planMarkdown,
        },
      });
    }

    this.emitRuntimeEvent({
      ...this.createEventBase({ threadId: context.sessionRecord.threadId, turnId: turn.turnId }),
      type: "turn.completed",
      payload: {
        state: input.state,
        stopReason: input.stopReason,
        ...(usage ? { usage } : {}),
        ...(turn.usage.totalCost > 0 ? { totalCostUsd: turn.usage.totalCost } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
      },
    });

    this.updateSession(context, {
      status: context.stopping ? "closed" : "ready",
      activeTurnId: undefined,
      ...(input.errorMessage ? { lastError: input.errorMessage } : { lastError: undefined }),
    });
    if (context.currentTurn === turn) {
      context.currentTurn = null;
    }
  }

  private async finalizePromptSuccess(context: PiSessionContext, turn: PiPendingTurn) {
    if (context.currentTurn !== turn || turn.completed) {
      return;
    }

    if (!turn.startedSignalEmitted) {
      turn.startedSignalEmitted = true;
      this.updateSession(context, {
        status: "running",
        activeTurnId: turn.turnId,
        lastError: undefined,
      });
      turn.started.resolve();
      this.emitRuntimeEvent({
        ...this.createEventBase({ threadId: context.sessionRecord.threadId, turnId: turn.turnId }),
        type: "turn.started",
        payload: normalizeString(context.sessionRecord.model)
          ? { model: context.sessionRecord.model }
          : {},
      });
    }

    await this.completeTurn(context, turn, {
      state: turn.interrupted || turn.lastStopReason === "aborted" ? "interrupted" : "completed",
      stopReason: turn.lastStopReason,
    });
  }

  private async finalizePromptFailure(
    context: PiSessionContext,
    turn: PiPendingTurn,
    error: unknown,
  ) {
    if (context.currentTurn !== turn) {
      return;
    }

    const message = formatErrorMessage(error, "Pi turn failed.");
    const state = stateFromPromptError(error);

    if (!turn.startedSignalEmitted) {
      context.currentTurn = null;
      this.updateSession(context, {
        status: "ready",
        activeTurnId: undefined,
        lastError: message,
      });
      turn.started.reject(error);
      return;
    }

    this.emitRuntimeEvent({
      ...this.createEventBase({ threadId: context.sessionRecord.threadId, turnId: turn.turnId }),
      type: "runtime.error",
      payload: {
        message,
      },
    });

    await this.completeTurn(context, turn, {
      state,
      stopReason: turn.lastStopReason,
      errorMessage: message,
    });
  }

  private async createContext(
    input: Omit<PiSessionFactoryInput, "tools" | "customTools">,
  ): Promise<PiSessionContext> {
    const contextRef: { current?: PiSessionContext } = {};
    const tools = this.createWrappedBuiltinTools({ cwd: input.cwd, contextRef });
    const customTools = this.createWrappedCustomTools({ contextRef });
    const created = await this.createSessionFactory({
      ...input,
      tools,
      customTools,
    });

    const normalizedModel = toPiModelSlug(created.session.model) ?? input.model ?? PI_DEFAULT_MODEL;
    if (!created.session.model && normalizedModel === PI_DEFAULT_MODEL) {
      created.session.dispose();
      throw new Error(
        `No authenticated Pi models are available. Use the Pi CLI ('pi' or 'bunx pi') and run '/login', or populate ~/.pi/agent/auth.json / provider env vars before starting a Pi session.`,
      );
    }

    const context: PiSessionContext = {
      session: created.session,
      sessionManager: created.sessionManager,
      settingsManager: created.settingsManager,
      modelRegistry: created.modelRegistry,
      authStorage: created.authStorage,
      sessionRecord: {
        provider: PI_DRIVER_KIND,
        status: "ready",
        runtimeMode: input.runtimeMode,
        cwd: input.cwd,
        model: normalizedModel,
        threadId: input.threadId,
        resumeCursor: {
          sessionFile: created.session.sessionFile,
          sessionId: created.session.sessionId,
        },
        createdAt: this.now(),
        updatedAt: this.now(),
      },
      pendingApprovals: new Map(),
      approvalAllowCache: new Set(),
      currentTurn: null,
      stopping: false,
    };
    contextRef.current = context;

    // Ensure the wrapped tool set is the only active tool surface for this embedded runtime.
    context.session.setActiveToolsByName(PI_FULL_TOOL_NAMES as unknown as string[]);
    this.bindSessionEvents(context);
    return context;
  }

  async startSession(input: {
    readonly threadId: ThreadId;
    readonly provider?: "pi";
    readonly cwd?: string;
    readonly model?: string;
    readonly modelOptions?: PiModelOptions;
    readonly resumeCursor?: unknown;
    readonly runtimeMode: ProviderSession["runtimeMode"];
  }): Promise<ProviderSession> {
    if (input.provider !== undefined && input.provider !== PI_PROVIDER) {
      throw new Error(`Expected provider '${PI_PROVIDER}' but received '${input.provider}'.`);
    }

    const resolvedCwd = normalizeString(input.cwd) ?? process.cwd();
    const previousContext = this.sessions.get(input.threadId);
    if (this.startingThreadIds.has(input.threadId)) {
      throw new Error(`Pi already has a session starting for thread '${input.threadId}'.`);
    }
    this.startingThreadIds.add(input.threadId);

    const sessionFile =
      isRecord(input.resumeCursor) && typeof input.resumeCursor.sessionFile === "string"
        ? normalizeString(input.resumeCursor.sessionFile)
        : undefined;

    let context: PiSessionContext | null = null;
    try {
      context = await this.createContext({
        threadId: input.threadId,
        cwd: resolvedCwd,
        agentDir: this.agentDir,
        sessionDir: this.sessionDir,
        ...(sessionFile ? { sessionFile } : {}),
        ...(normalizeString(input.model) && input.model !== PI_DEFAULT_MODEL
          ? { model: input.model }
          : {}),
        runtimeMode: input.runtimeMode,
      });
      this.applyThinkingLevel(context, input.modelOptions?.pi?.thinkingLevel);

      this.startingSessions.set(input.threadId, context);
      this.sessions.set(input.threadId, context);
      this.startingSessions.delete(input.threadId);
      this.emitSessionStarted(context);
      if (previousContext) {
        await this.disposeContext(previousContext, {
          reason: `Pi session replaced by a newer ${PRODUCT_BASE_NAME} session.`,
          emitExit: false,
        });
      }
      return context.sessionRecord;
    } catch (error) {
      this.startingSessions.delete(input.threadId);
      if (context && this.sessions.get(input.threadId) === context) {
        this.sessions.delete(input.threadId);
      }
      if (previousContext && this.sessions.get(input.threadId) === undefined) {
        this.sessions.set(input.threadId, previousContext);
      }
      context?.session.dispose();
      throw error;
    } finally {
      this.startingThreadIds.delete(input.threadId);
    }
  }

  async sendTurn(input: {
    readonly threadId: ThreadId;
    readonly input?: string;
    readonly attachments?: ReadonlyArray<ChatAttachment>;
    readonly model?: string;
    readonly modelOptions?: PiModelOptions;
    readonly interactionMode?: ProviderInteractionMode;
  }): Promise<ProviderTurnStartResult> {
    const context = this.requireSession(input.threadId);
    if (context.currentTurn && !context.currentTurn.completed) {
      throw new Error(`Pi already has a turn running for thread '${input.threadId}'.`);
    }

    let sessionConfiguredChanged = false;
    const requestedModel = normalizeString(input.model);
    if (requestedModel && requestedModel !== PI_DEFAULT_MODEL) {
      const parsedModel = parsePiModelSlug(requestedModel);
      if (!parsedModel) {
        throw new Error(
          `Pi model '${requestedModel}' must use the 'provider/model-id' form, or use '${PI_DEFAULT_MODEL}' to let Pi pick its default model.`,
        );
      }
      const resolvedModel = context.modelRegistry.find(parsedModel.provider, parsedModel.modelId);
      if (!resolvedModel) {
        throw new Error(
          `Pi model '${requestedModel}' is not part of the authenticated Pi catalog for this machine.`,
        );
      }
      const currentModel = toPiModelSlug(context.session.model);
      if (currentModel !== requestedModel) {
        await context.session.setModel(resolvedModel);
        this.updateSession(context, { model: requestedModel });
        sessionConfiguredChanged = true;
      }
    }

    if (this.applyThinkingLevel(context, input.modelOptions?.pi?.thinkingLevel)) {
      sessionConfiguredChanged = true;
    }

    if (sessionConfiguredChanged) {
      this.emitSessionConfigured(context);
    }

    const activeToolNames =
      input.interactionMode === "plan" ? PI_PLAN_TOOL_NAMES : PI_FULL_TOOL_NAMES;
    context.session.setActiveToolsByName(activeToolNames as unknown as string[]);
    this.assertBrowserToolsRegistered(context);

    const images = await this.materializePiImages(input.attachments);
    const turnId = TurnId.make(`pi-turn-${randomUUID()}`);
    const pendingTurn: PiPendingTurn = {
      turnId,
      started: deferred<void>(),
      interactionMode: input.interactionMode ?? "default",
      usage: createEmptyUsageAggregate(),
      lastAssistantText: "",
      lastStopReason: null,
      interrupted: false,
      startedAt: this.now(),
      startedSignalEmitted: false,
      completed: false,
    };
    context.currentTurn = pendingTurn;

    const promptText = normalizePiPromptInput({
      text: input.input ?? "See the attached images and continue the conversation.",
      ...(input.interactionMode !== undefined ? { interactionMode: input.interactionMode } : {}),
    });

    void context.session
      .prompt(promptText, {
        ...(images.length > 0 ? { images } : {}),
        source: "rpc",
      })
      .then(() => this.finalizePromptSuccess(context, pendingTurn))
      .catch((error) => this.finalizePromptFailure(context, pendingTurn, error));

    try {
      await withTimeout({
        promise: pendingTurn.started.promise,
        timeoutMs: PI_TURN_START_TIMEOUT_MS,
        label: "Pi turn start",
      });
    } catch (error) {
      pendingTurn.interrupted = true;
      await context.session.abort().catch(() => undefined);
      throw error;
    }

    return {
      threadId: input.threadId,
      turnId,
      resumeCursor: context.sessionRecord.resumeCursor,
    } satisfies ProviderTurnStartResult;
  }

  async interruptTurn(threadId: ThreadId, turnId?: TurnId): Promise<void> {
    const context = this.requireSession(threadId);
    const currentTurn = context.currentTurn;
    if (!currentTurn) {
      return;
    }
    if (turnId && currentTurn.turnId !== turnId) {
      return;
    }
    currentTurn.interrupted = true;
    await context.session.abort();
  }

  async respondToRequest(
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ): Promise<void> {
    const context = this.requireSession(threadId);
    const pending = context.pendingApprovals.get(requestId);
    if (!pending) {
      throw new Error(
        `Unknown pending approval request '${requestId}' for Pi thread '${threadId}'.`,
      );
    }
    pending.resolve(decision);
  }

  async respondToUserInput(
    _threadId?: ThreadId,
    _requestId?: ApprovalRequestId,
    _answers?: unknown,
  ): Promise<void> {
    throw new Error(
      `Pi user-input requests are not supported by this ${PRODUCT_BASE_NAME} integration.`,
    );
  }

  async stopSession(threadId: ThreadId): Promise<void> {
    const context = this.sessions.get(threadId) ?? this.startingSessions.get(threadId);
    if (!context) {
      return;
    }
    await this.disposeContext(context, {
      reason: "Pi session stopped.",
      emitExit: true,
    });
  }

  private async disposeContext(
    context: PiSessionContext,
    input: { readonly reason: string; readonly emitExit: boolean },
  ) {
    context.stopping = true;
    for (const pending of context.pendingApprovals.values()) {
      this.emitRuntimeEvent({
        ...this.createEventBase({
          threadId: context.sessionRecord.threadId,
          turnId: pending.turnId,
        }),
        requestId: RuntimeRequestId.make(pending.requestId),
        type: "request.resolved",
        payload: {
          requestType: pending.requestType,
          decision: "cancel",
        },
      });
      pending.resolve("cancel");
    }
    context.pendingApprovals.clear();

    if (context.currentTurn && !context.currentTurn.completed) {
      context.currentTurn.interrupted = true;
      try {
        await context.session.abort();
      } catch {
        // Best-effort abort only.
      }
    }

    context.session.dispose();
    this.updateSession(context, {
      status: "closed",
      activeTurnId: undefined,
    });

    if (this.sessions.get(context.sessionRecord.threadId) === context) {
      this.sessions.delete(context.sessionRecord.threadId);
    }
    if (this.startingSessions.get(context.sessionRecord.threadId) === context) {
      this.startingSessions.delete(context.sessionRecord.threadId);
    }

    if (input.emitExit) {
      this.emitRuntimeEvent({
        ...this.createEventBase({ threadId: context.sessionRecord.threadId }),
        type: "session.exited",
        payload: {
          reason: input.reason,
          exitKind: "graceful",
          recoverable: true,
        },
      });
    }
  }

  async listSessions(): Promise<ReadonlyArray<ProviderSession>> {
    const byThreadId = new Map<ThreadId, ProviderSession>();
    for (const [threadId, context] of this.startingSessions) {
      byThreadId.set(threadId, context.sessionRecord);
    }
    for (const [threadId, context] of this.sessions) {
      byThreadId.set(threadId, context.sessionRecord);
    }
    return [...byThreadId.values()];
  }

  async hasSession(threadId: ThreadId): Promise<boolean> {
    return this.sessions.has(threadId) || this.startingSessions.has(threadId);
  }

  async readThread(threadId: ThreadId): Promise<ProviderThreadSnapshot> {
    const context = this.requireSession(threadId);
    const branchEntries = context.sessionManager.getBranch();
    const turns: Array<{ id: TurnId; items: Array<unknown> }> = [];
    let currentTurn: { id: TurnId; items: Array<unknown> } | null = null;

    for (const entry of branchEntries) {
      if (entry.type === "message" && entry.message.role === "user") {
        currentTurn = {
          id: TurnId.make(entry.id),
          items: [entry.message],
        };
        turns.push(currentTurn);
        continue;
      }

      if (!currentTurn) {
        continue;
      }

      if (entry.type === "message") {
        currentTurn.items.push(entry.message);
        continue;
      }

      currentTurn.items.push(entry);
    }

    return {
      threadId,
      turns: turns.map(
        (turn): ProviderThreadTurnSnapshot => ({
          id: turn.id,
          items: [...turn.items],
        }),
      ),
    };
  }

  async rollbackThread(threadId: ThreadId, numTurns: number): Promise<ProviderThreadSnapshot> {
    const context = this.requireSession(threadId);
    if (!Number.isInteger(numTurns) || numTurns < 1) {
      throw new Error("numTurns must be an integer >= 1.");
    }

    if (context.currentTurn && !context.currentTurn.completed) {
      context.currentTurn.interrupted = true;
      await context.session.abort().catch(() => undefined);
    }

    const branchEntries = context.sessionManager.getBranch();
    const userEntries = branchEntries.filter(
      (entry): entry is SessionMessageEntry =>
        entry.type === "message" && entry.message.role === "user",
    );

    const nextLeafId =
      numTurns >= userEntries.length
        ? null
        : (userEntries[userEntries.length - numTurns]?.parentId ?? null);

    if (nextLeafId === null) {
      context.sessionManager.resetLeaf();
    } else {
      context.sessionManager.branch(nextLeafId);
    }

    context.session.agent.replaceMessages(context.sessionManager.buildSessionContext().messages);
    this.updateSession(context, {
      activeTurnId: undefined,
      status: "ready",
    });

    return this.readThread(threadId);
  }

  async stopAll(): Promise<void> {
    const threadIds = [...new Set([...this.sessions.keys(), ...this.startingSessions.keys()])];
    await Promise.all(threadIds.map((threadId) => this.stopSession(threadId)));
  }
}
