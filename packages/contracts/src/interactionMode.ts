import * as Schema from "effect/Schema";

import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const INTERACTION_MODE_ID_MAX_CHARS = 64;
const INTERACTION_MODE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const PROVIDER_ID_MAX_CHARS = 64;
const PROVIDER_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

/**
 * Open interaction-mode identifier used by core and build-time extensions.
 * Availability is resolved by the runtime registry rather than a closed union.
 */
export const InteractionModeId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(INTERACTION_MODE_ID_MAX_CHARS),
  Schema.isPattern(INTERACTION_MODE_ID_PATTERN),
);
export type InteractionModeId = typeof InteractionModeId.Type;

export const InteractionModeProviderId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(PROVIDER_ID_MAX_CHARS),
  Schema.isPattern(PROVIDER_ID_PATTERN),
);
export type InteractionModeProviderId = typeof InteractionModeProviderId.Type;

export const InteractionModeIntent = Schema.Literals(["execute", "answer", "propose"]);
export type InteractionModeIntent = typeof InteractionModeIntent.Type;

export const InteractionModeMutationPolicy = Schema.Literals(["allow", "deny"]);
export type InteractionModeMutationPolicy = typeof InteractionModeMutationPolicy.Type;

export const InteractionModeSandboxPolicy = Schema.Literals(["inherit-runtime", "read-only"]);
export type InteractionModeSandboxPolicy = typeof InteractionModeSandboxPolicy.Type;

export const InteractionModeComputerUsePolicy = Schema.Literals(["allow", "observe-only", "deny"]);
export type InteractionModeComputerUsePolicy = typeof InteractionModeComputerUsePolicy.Type;

export const InteractionModeOutputKind = Schema.Literals(["plain", "proposed-plan", "structured"]);
export type InteractionModeOutputKind = typeof InteractionModeOutputKind.Type;

export const InteractionModeNativeModeFallback = Schema.Literals([
  "reject",
  "non-plan",
  "unchanged",
]);
export type InteractionModeNativeModeFallback = typeof InteractionModeNativeModeFallback.Type;

export const InteractionModeNativeModePrecedence = Schema.Literals([
  "descriptor-first",
  "user-first",
]);
export type InteractionModeNativeModePrecedence = typeof InteractionModeNativeModePrecedence.Type;

export const InteractionModeSafetyPolicy = Schema.Struct({
  mutations: InteractionModeMutationPolicy,
  sandbox: InteractionModeSandboxPolicy,
  computerUse: InteractionModeComputerUsePolicy,
});
export type InteractionModeSafetyPolicy = typeof InteractionModeSafetyPolicy.Type;

/**
 * Provider-native data interpreted only by the matching provider adapter.
 * Neutral safety and intent remain authoritative when an override is absent.
 */
export const InteractionModeProviderBehavior = Schema.Struct({
  providerId: InteractionModeProviderId,
  nativeMode: Schema.optional(TrimmedNonEmptyString),
  nativeModeFallback: Schema.optional(InteractionModeNativeModeFallback),
  nativeModePrecedence: Schema.optional(InteractionModeNativeModePrecedence),
  collaborationMode: Schema.optional(TrimmedNonEmptyString),
  permissionMode: Schema.optional(TrimmedNonEmptyString),
  sandbox: Schema.optional(InteractionModeSandboxPolicy),
  developerInstructions: Schema.optional(TrimmedNonEmptyString),
  promptPrefix: Schema.optional(TrimmedNonEmptyString),
  promptInputLabel: Schema.optional(TrimmedNonEmptyString),
});
export type InteractionModeProviderBehavior = typeof InteractionModeProviderBehavior.Type;

/**
 * Serializable interaction-mode metadata. Executable final-output parsers are
 * registered beside this descriptor at runtime and are never put on the wire.
 */
export const InteractionModeDescriptor = Schema.Struct({
  id: InteractionModeId,
  ownerId: InteractionModeId,
  version: PositiveInt,
  displayName: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  intent: InteractionModeIntent,
  safety: InteractionModeSafetyPolicy,
  outputKind: InteractionModeOutputKind,
  supportedProviders: Schema.Array(InteractionModeProviderId),
  unsupportedProviderBehavior: Schema.Literal("reject"),
  providerBehaviors: Schema.Array(InteractionModeProviderBehavior),
});
export type InteractionModeDescriptor = typeof InteractionModeDescriptor.Type;

export const InteractionModeDescriptorSnapshot = Schema.Struct({
  id: InteractionModeId,
  ownerId: InteractionModeId,
  version: PositiveInt,
  displayName: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  intent: InteractionModeIntent,
  safety: InteractionModeSafetyPolicy,
  outputKind: InteractionModeOutputKind,
  supportedProviders: Schema.Array(InteractionModeProviderId),
});
export type InteractionModeDescriptorSnapshot = typeof InteractionModeDescriptorSnapshot.Type;
