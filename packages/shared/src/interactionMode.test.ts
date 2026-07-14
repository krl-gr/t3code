import type { InteractionModeDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import {
  InteractionModeRegistryError,
  InteractionModeResolutionError,
  applyResolvedInteractionModePrompt,
  createExperimentalInteractionModeRegistry,
} from "./interactionMode.ts";

const makeDescriptor = (
  overrides: Partial<InteractionModeDescriptor> = {},
): InteractionModeDescriptor => ({
  id: "ask",
  ownerId: "upcomputer.core",
  version: 1,
  displayName: "Ask",
  description: "Answer without implementing changes.",
  intent: "answer",
  safety: {
    mutations: "deny",
    sandbox: "inherit-runtime",
    computerUse: "observe-only",
  },
  outputKind: "plain",
  supportedProviders: ["codex", "claudeAgent"],
  unsupportedProviderBehavior: "reject",
  providerBehaviors: [
    {
      providerId: "codex",
      collaborationMode: "default",
      developerInstructions: "Answer only.",
    },
    {
      providerId: "claudeAgent",
      permissionMode: "session-default",
      promptPrefix: "You are in Ask mode.",
      promptInputLabel: "User question:",
    },
  ],
  ...overrides,
});

describe("ExperimentalInteractionModeRegistry", () => {
  it("sorts snapshots deterministically", () => {
    const registry = createExperimentalInteractionModeRegistry([
      { descriptor: makeDescriptor({ id: "plan", displayName: "Plan" }) },
      { descriptor: makeDescriptor({ id: "ask", displayName: "Ask" }) },
    ]);

    expect(registry.snapshot().map((snapshot) => snapshot.id)).toEqual(["ask", "plan"]);
  });

  it.effect("resolves provider behavior", () =>
    Effect.gen(function* () {
      const registry = createExperimentalInteractionModeRegistry([
        { descriptor: makeDescriptor() },
      ]);
      const resolved = yield* registry.resolve("ask", "claudeAgent");

      expect(resolved.id).toBe("ask");
      expect(resolved.provider.providerId).toBe("claudeAgent");
      expect(resolved.provider.permissionMode).toBe("session-default");
      expect(resolved.provider.promptPrefix).toBe("You are in Ask mode.");
      expect(resolved.provider.sandbox).toBe("inherit-runtime");
    }),
  );

  it("applies descriptor prompt prefix and input label", () => {
    const registry = createExperimentalInteractionModeRegistry([{ descriptor: makeDescriptor() }]);
    const resolved = registry.resolveOrThrow("ask", "claudeAgent");

    expect(applyResolvedInteractionModePrompt("What changed?", resolved)).toBe(
      "You are in Ask mode.\n\nUser question:\nWhat changed?",
    );
  });

  it("rejects duplicate mode registrations", () => {
    expect(() =>
      createExperimentalInteractionModeRegistry([
        { descriptor: makeDescriptor() },
        { descriptor: makeDescriptor() },
      ]),
    ).toThrow(InteractionModeRegistryError);
  });

  it("rejects extension read-only modes that keep inherited sandbox", () => {
    expect(() =>
      createExperimentalInteractionModeRegistry([
        {
          descriptor: makeDescriptor({
            id: "orchestrator",
            ownerId: "upcomputer.orchestrator",
            safety: {
              mutations: "deny",
              sandbox: "inherit-runtime",
              computerUse: "observe-only",
            },
          }),
        },
      ]),
    ).toThrow(InteractionModeRegistryError);
  });

  it("rejects unsupported provider resolution", () => {
    const registry = createExperimentalInteractionModeRegistry([{ descriptor: makeDescriptor() }]);

    expect(() => registry.resolveOrThrow("ask", "cursor")).toThrow(InteractionModeResolutionError);
    try {
      registry.resolveOrThrow("ask", "cursor");
    } catch (error) {
      expect(error).toBeInstanceOf(InteractionModeResolutionError);
      if (error instanceof InteractionModeResolutionError) {
        expect(error.code).toBe("unsupported-provider");
      }
    }
  });
});
