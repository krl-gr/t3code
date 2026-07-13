import * as Schema from "effect/Schema";

import { PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Experimental compile-time extension metadata advertised by an Upcomputer
 * build. These identifiers are intentionally open so newer servers remain
 * decodable by older clients. Consumers must provide honest fallback labels
 * for values they do not recognize; executable hooks live outside contracts.
 */
export const ProductExtensionSource = TrimmedNonEmptyString;
export type ProductExtensionSource = typeof ProductExtensionSource.Type;

export const ProductExtensionAvailability = TrimmedNonEmptyString;
export type ProductExtensionAvailability = typeof ProductExtensionAvailability.Type;

export const ProductExtensionLifecycleState = TrimmedNonEmptyString;
export type ProductExtensionLifecycleState = typeof ProductExtensionLifecycleState.Type;

export const ProductExtensionDiagnosticSeverity = TrimmedNonEmptyString;
export type ProductExtensionDiagnosticSeverity = typeof ProductExtensionDiagnosticSeverity.Type;

export const ProductExtensionDiagnostic = Schema.Struct({
  code: TrimmedNonEmptyString,
  severity: ProductExtensionDiagnosticSeverity,
  message: TrimmedNonEmptyString,
});
export type ProductExtensionDiagnostic = typeof ProductExtensionDiagnostic.Type;

export const ProductCapabilityDescriptor = Schema.Struct({
  id: TrimmedNonEmptyString,
  version: PositiveInt,
  ownerId: TrimmedNonEmptyString,
});
export type ProductCapabilityDescriptor = typeof ProductCapabilityDescriptor.Type;

export const ProductExtensionSnapshot = Schema.Struct({
  id: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  description: TrimmedNonEmptyString,
  version: TrimmedNonEmptyString,
  source: ProductExtensionSource,
  availability: ProductExtensionAvailability,
  present: Schema.Boolean,
  enabled: Schema.Boolean,
  capable: Schema.Boolean,
  entitled: Schema.Boolean,
  state: ProductExtensionLifecycleState,
  capabilities: Schema.Array(TrimmedNonEmptyString),
  diagnostics: Schema.Array(ProductExtensionDiagnostic),
});
export type ProductExtensionSnapshot = typeof ProductExtensionSnapshot.Type;

export const ProductManifestSnapshot = Schema.Struct({
  id: TrimmedNonEmptyString,
  displayName: TrimmedNonEmptyString,
  version: TrimmedNonEmptyString,
  extensionApiVersion: PositiveInt,
  experimental: Schema.Boolean,
  capabilities: Schema.Array(ProductCapabilityDescriptor),
  extensions: Schema.Array(ProductExtensionSnapshot),
});
export type ProductManifestSnapshot = typeof ProductManifestSnapshot.Type;
