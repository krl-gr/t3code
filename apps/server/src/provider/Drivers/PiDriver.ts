import {
  PI_DEFAULT_MODEL,
  PI_THINKING_LEVEL_OPTIONS,
  PiSettings,
  ProviderDriverKind,
  TextGenerationError,
  type ModelCapabilities,
  type PiThinkingLevel,
  type ServerProvider,
  type ServerProviderModel,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

import { createModelCapabilities } from "@t3tools/shared/model";
import { ServerConfig } from "../../config.ts";
import { getBrowserAutomationService } from "../../browser/BrowserAutomationService.ts";
import { PiSdkManager } from "../../piSdkManager.ts";
import { PI_PROVIDER_SETUP_MESSAGE, createPiHarnessCatalogSnapshot } from "../../piHarness.ts";
import {
  ProviderAdapterRequestError,
  ProviderDriverError,
  type ProviderAdapterError,
} from "../Errors.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { makeManualOnlyProviderMaintenanceCapabilities } from "../providerMaintenance.ts";
import { buildServerProvider, type ServerProviderDraft } from "../providerSnapshot.ts";
import type { ProviderAdapterShape } from "../Services/ProviderAdapter.ts";

const DRIVER_KIND = ProviderDriverKind.make("pi");
const decodePiSettings = Schema.decodeSync(PiSettings);
const PI_MAINTENANCE_CAPABILITIES = makeManualOnlyProviderMaintenanceCapabilities({
  provider: DRIVER_KIND,
  packageName: "@mariozechner/pi-coding-agent",
});
const SNAPSHOT_REFRESH_INTERVAL = Duration.minutes(2);
const PI_CAPABILITIES_WITH_THINKING = createModelCapabilities({
  optionDescriptors: [
    {
      id: "thinkingLevel",
      label: "Thinking",
      type: "select",
      currentValue: "medium",
      options: PI_THINKING_LEVEL_OPTIONS.map((level) =>
        level === "medium"
          ? { id: level, label: "Medium", isDefault: true }
          : {
              id: level,
              label: level === "xhigh" ? "Extra High" : level[0]!.toUpperCase() + level.slice(1),
            },
      ),
    },
  ],
});

export type PiDriverEnv = ServerConfig;

const withInstanceIdentity =
  (input: {
    readonly instanceId: ProviderInstance["instanceId"];
    readonly displayName: string | undefined;
    readonly accentColor: string | undefined;
    readonly continuationGroupKey: string;
  }) =>
  (snapshot: ServerProviderDraft): ServerProvider => ({
    ...snapshot,
    instanceId: input.instanceId,
    driver: DRIVER_KIND,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationGroupKey },
  });

function unsupportedTextGeneration(operation: string) {
  return new TextGenerationError({
    operation,
    detail: "Pi does not support git text generation in this build.",
  });
}

function toPiModelOptions(
  selections: ReadonlyArray<{ readonly id: string; readonly value: string | boolean }> | undefined,
) {
  const thinkingLevel = selections?.find((selection) => selection.id === "thinkingLevel")?.value;
  return typeof thinkingLevel === "string"
    ? {
        pi: {
          thinkingLevel: thinkingLevel as PiThinkingLevel,
        },
      }
    : undefined;
}

function normalizeIssueMessages(
  snapshot: ReturnType<typeof createPiHarnessCatalogSnapshot>,
): string[] {
  return [
    ...snapshot.authErrors.map((message) => message.trim()).filter(Boolean),
    ...(snapshot.modelRegistryError ? [snapshot.modelRegistryError.trim()] : []),
  ].filter((message) => message.length > 0);
}

function toPiModelCapabilities(reasoning: boolean): ModelCapabilities | null {
  return reasoning ? PI_CAPABILITIES_WITH_THINKING : null;
}

function buildPiModels(
  settings: PiSettings,
  snapshot: ReturnType<typeof createPiHarnessCatalogSnapshot>,
): ReadonlyArray<ServerProviderModel> {
  const models = new Map<string, ServerProviderModel>();
  models.set(PI_DEFAULT_MODEL, {
    slug: PI_DEFAULT_MODEL,
    name: "Default",
    isCustom: false,
    capabilities: PI_CAPABILITIES_WITH_THINKING,
  });

  for (const model of snapshot.availableModels) {
    models.set(model.slug, {
      slug: model.slug,
      name: model.name,
      shortName: model.modelId,
      subProvider: model.provider,
      isCustom: false,
      capabilities: toPiModelCapabilities(model.reasoning),
    });
  }

  for (const customModel of settings.customModels) {
    const slug = customModel.trim();
    if (!slug || models.has(slug)) {
      continue;
    }
    models.set(slug, {
      slug,
      name: slug,
      isCustom: true,
      capabilities: PI_CAPABILITIES_WITH_THINKING,
    });
  }

  return [...models.values()];
}

function makePendingPiProvider(settings: PiSettings): ServerProviderDraft {
  return buildServerProvider({
    presentation: {
      displayName: "Pi",
      showInteractionModeToggle: true,
    },
    enabled: settings.enabled,
    checkedAt: DateTime.formatIso(DateTime.nowUnsafe()),
    models: [
      {
        slug: PI_DEFAULT_MODEL,
        name: "Default",
        isCustom: false,
        capabilities: PI_CAPABILITIES_WITH_THINKING,
      },
    ],
    probe: {
      installed: true,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: PI_PROVIDER_SETUP_MESSAGE,
    },
  });
}

function checkPiProviderStatus(settings: PiSettings): Effect.Effect<ServerProviderDraft, never> {
  return Effect.map(DateTime.now, (checkedAt) => {
    const snapshot = createPiHarnessCatalogSnapshot();
    const models = buildPiModels(settings, snapshot);
    const issueMessages = normalizeIssueMessages(snapshot);
    const availableCount = snapshot.availableModels.length;

    return buildServerProvider({
      presentation: {
        displayName: "Pi",
        showInteractionModeToggle: true,
      },
      enabled: settings.enabled,
      checkedAt: DateTime.formatIso(checkedAt),
      models,
      probe:
        availableCount > 0
          ? {
              installed: true,
              version: null,
              status: issueMessages.length > 0 ? "warning" : "ready",
              auth: {
                status: "authenticated",
                type: "Pi",
                label:
                  snapshot.authProviders.length > 0
                    ? `Providers: ${snapshot.authProviders.join(", ")}`
                    : "Authenticated",
              },
              message:
                issueMessages[0] ??
                `Pi is ready with ${availableCount} authenticated model${availableCount === 1 ? "" : "s"}.`,
            }
          : {
              installed: true,
              version: null,
              status: "warning",
              auth: {
                status: "unauthenticated",
              },
              message:
                issueMessages[0] ??
                "No authenticated Pi-backed models are available. Run `pi` and complete `/login` first.",
            },
    });
  });
}

function formatCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function makePiAdapter(
  manager: PiSdkManager,
  events: PubSub.PubSub<ProviderRuntimeEvent>,
): ProviderAdapterShape<ProviderAdapterError> {
  const providerKind = DRIVER_KIND;
  const providerSlug = "pi" as const;
  const toRequestError = (method: string, cause: unknown) =>
    new ProviderAdapterRequestError({
      provider: providerKind,
      method,
      detail: formatCause(cause),
      cause,
    });

  const listener = (event: unknown) => {
    void Effect.runFork(PubSub.publish(events, event as never));
  };
  manager.on("event", listener);

  return {
    provider: providerKind,
    capabilities: {
      sessionModelSwitch: "unsupported",
    },
    startSession: (input) =>
      Effect.tryPromise({
        try: () => {
          const modelOptions = toPiModelOptions(input.modelSelection?.options);
          return manager.startSession({
            threadId: input.threadId,
            provider: providerSlug,
            ...(input.cwd ? { cwd: input.cwd } : {}),
            ...(input.modelSelection?.model ? { model: input.modelSelection.model } : {}),
            ...(modelOptions ? { modelOptions } : {}),
            ...(input.resumeCursor ? { resumeCursor: input.resumeCursor } : {}),
            runtimeMode: input.runtimeMode,
          });
        },
        catch: (cause) => toRequestError("session/start", cause),
      }),
    sendTurn: (input) =>
      Effect.tryPromise({
        try: () => {
          const modelOptions = toPiModelOptions(input.modelSelection?.options);
          return manager.sendTurn({
            threadId: input.threadId,
            ...(input.input ? { input: input.input } : {}),
            ...(input.attachments ? { attachments: input.attachments } : {}),
            ...(input.modelSelection?.model ? { model: input.modelSelection.model } : {}),
            ...(modelOptions ? { modelOptions } : {}),
            ...(input.interactionMode ? { interactionMode: input.interactionMode } : {}),
          });
        },
        catch: (cause) => toRequestError("turn/start", cause),
      }),
    interruptTurn: (threadId, turnId) =>
      Effect.tryPromise({
        try: () => manager.interruptTurn(threadId, turnId),
        catch: (cause) => toRequestError("turn/interrupt", cause),
      }),
    respondToRequest: (threadId, requestId, decision) =>
      Effect.tryPromise({
        try: () => manager.respondToRequest(threadId, requestId, decision),
        catch: (cause) => toRequestError("request/respond", cause),
      }),
    respondToUserInput: (threadId, requestId, answers) =>
      Effect.tryPromise({
        try: () => manager.respondToUserInput(threadId, requestId, answers),
        catch: (cause) => toRequestError("user-input/respond", cause),
      }),
    stopSession: (threadId) =>
      Effect.tryPromise({
        try: () => manager.stopSession(threadId),
        catch: (cause) => toRequestError("session/stop", cause),
      }),
    listSessions: () => Effect.promise(() => manager.listSessions()),
    hasSession: (threadId) => Effect.promise(() => manager.hasSession(threadId)),
    readThread: (threadId) =>
      Effect.tryPromise({
        try: () => manager.readThread(threadId),
        catch: (cause) => toRequestError("thread/read", cause),
      }),
    rollbackThread: (threadId, numTurns) =>
      Effect.tryPromise({
        try: () => manager.rollbackThread(threadId, numTurns),
        catch: (cause) => toRequestError("thread/rollback", cause),
      }),
    stopAll: () =>
      Effect.tryPromise({
        try: () => manager.stopAll(),
        catch: (cause) => toRequestError("provider/stopAll", cause),
      }),
    streamEvents: Stream.fromPubSub(events),
  };
}

export const PiDriver: ProviderDriver<PiSettings, PiDriverEnv> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "Pi",
    supportsMultipleInstances: true,
  },
  configSchema: PiSettings,
  defaultConfig: (): PiSettings => decodePiSettings({}),
  create: ({ instanceId, displayName, accentColor, enabled, config }) =>
    Effect.gen(function* () {
      const serverConfig = yield* ServerConfig;
      const browserAutomation = getBrowserAutomationService(serverConfig);
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: DRIVER_KIND,
        instanceId,
      });
      const stampIdentity = withInstanceIdentity({
        instanceId,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      const effectiveConfig = { ...config, enabled } satisfies PiSettings;
      const manager = new PiSdkManager({
        stateDir: serverConfig.stateDir,
        browserAutomation,
      });
      const events = yield* PubSub.unbounded<ProviderRuntimeEvent>();
      const adapter = makePiAdapter(manager, events);
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Effect.promise(() => manager.stopAll()).pipe(Effect.ignore);
          yield* PubSub.shutdown(events);
        }),
      );

      const textGeneration = {
        generateCommitMessage: () =>
          Effect.fail(unsupportedTextGeneration("generateCommitMessage")),
        generatePrContent: () => Effect.fail(unsupportedTextGeneration("generatePrContent")),
        generateBranchName: () => Effect.fail(unsupportedTextGeneration("generateBranchName")),
        generateThreadTitle: () => Effect.fail(unsupportedTextGeneration("generateThreadTitle")),
      };

      const snapshot = yield* makeManagedServerProvider<PiSettings>({
        maintenanceCapabilities: PI_MAINTENANCE_CAPABILITIES,
        getSettings: Effect.succeed(effectiveConfig),
        streamSettings: Stream.never,
        haveSettingsChanged: () => false,
        initialSnapshot: (settings) =>
          Effect.succeed(stampIdentity(makePendingPiProvider(settings))),
        checkProvider: checkPiProviderStatus(effectiveConfig).pipe(Effect.map(stampIdentity)),
        refreshInterval: SNAPSHOT_REFRESH_INTERVAL,
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: DRIVER_KIND,
              instanceId,
              detail: `Failed to build Pi snapshot: ${cause.message ?? String(cause)}`,
              cause,
            }),
        ),
      );

      return {
        instanceId,
        driverKind: DRIVER_KIND,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        adapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
};
