import * as Layer from "effect/Layer";

import {
  createExperimentalFeatureMigrationPlan,
  type ExperimentalFeatureMigrationContribution,
} from "./FeatureMigrations.ts";
import { createRpcContributionPlan, type AnyNamespacedRpcContribution } from "./RpcContribution.ts";

const STABLE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const RESERVED_CORE_FEATURE_ID = "upcomputer.core";

export type ExperimentalOpaqueServerLayer = Layer.Layer<never, Error, never>;

/**
 * Closes a feature-owned runtime layer at the public product boundary.
 * Feature packages keep their service graph typed locally; core composes only
 * the startup side effect and does not expose private service tags.
 */
export function eraseExperimentalServerLayer<A, E, R>(
  layer: Layer.Layer<A, E, R>,
): ExperimentalOpaqueServerLayer {
  return layer as unknown as ExperimentalOpaqueServerLayer;
}

export interface ExperimentalServerLayerContribution {
  readonly id: string;
  readonly ownerId: string;
  readonly version: number;
  readonly layer: ExperimentalOpaqueServerLayer;
}

export interface ExperimentalServerFeatureContribution<
  RpcContributions extends ReadonlyArray<AnyNamespacedRpcContribution> =
    ReadonlyArray<AnyNamespacedRpcContribution>,
> {
  readonly id: string;
  readonly version: number;
  readonly layers?: ReadonlyArray<ExperimentalServerLayerContribution>;
  readonly migrations?: ReadonlyArray<ExperimentalFeatureMigrationContribution<Error>>;
  readonly rpc?: RpcContributions;
}

export type RpcContributionsOfFeature<Feature> = Feature extends {
  readonly rpc?: infer RpcContributions;
}
  ? RpcContributions extends ReadonlyArray<AnyNamespacedRpcContribution>
    ? RpcContributions[number]
    : never
  : never;

export type RpcContributionsOfFeatures<
  Features extends ReadonlyArray<ExperimentalServerFeatureContribution>,
> = RpcContributionsOfFeature<Features[number]>;

export interface ExperimentalServerFeatureDiagnostic {
  readonly id: string;
  readonly version: number;
  readonly layers: number;
  readonly migrationNamespaces: number;
  readonly rpcNamespaces: number;
}

export interface ExperimentalServerProductComposition<
  Features extends ReadonlyArray<ExperimentalServerFeatureContribution> =
    ReadonlyArray<ExperimentalServerFeatureContribution>,
> {
  readonly features: ReadonlyArray<Features[number]>;
  readonly diagnostics: ReadonlyArray<ExperimentalServerFeatureDiagnostic>;
  readonly featureLayer: ExperimentalOpaqueServerLayer;
  readonly migrations: ReadonlyArray<ExperimentalFeatureMigrationContribution<Error>>;
  readonly rpc: ReadonlyArray<RpcContributionsOfFeatures<Features>>;
}

export class ServerProductCompositionInvariantError extends Error {
  override readonly name = "ServerProductCompositionInvariantError";
  readonly code:
    | "invalid-feature-id"
    | "invalid-feature-version"
    | "reserved-feature-id"
    | "duplicate-feature"
    | "invalid-layer-id"
    | "invalid-layer-version"
    | "duplicate-layer"
    | "owner-mismatch";

  constructor(
    code:
      | "invalid-feature-id"
      | "invalid-feature-version"
      | "reserved-feature-id"
      | "duplicate-feature"
      | "invalid-layer-id"
      | "invalid-layer-version"
      | "duplicate-layer"
      | "owner-mismatch",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function assertStableId(
  value: string,
  code: "invalid-feature-id" | "invalid-layer-id",
  field: string,
): void {
  if (!STABLE_ID.test(value)) {
    throw new ServerProductCompositionInvariantError(
      code,
      `${field} '${value}' must be a lowercase dot, dash, or underscore separated id.`,
    );
  }
}

function assertFeatureVersion(feature: ExperimentalServerFeatureContribution): void {
  if (!Number.isSafeInteger(feature.version) || feature.version < 1) {
    throw new ServerProductCompositionInvariantError(
      "invalid-feature-version",
      `Server feature '${feature.id}' must have a positive safe-integer version.`,
    );
  }
}

function assertLayerVersion(featureId: string, layer: ExperimentalServerLayerContribution): void {
  if (!Number.isSafeInteger(layer.version) || layer.version < 1) {
    throw new ServerProductCompositionInvariantError(
      "invalid-layer-version",
      `Server layer '${layer.id}' for feature '${featureId}' must have a positive safe-integer version.`,
    );
  }
}

function assertOwner(featureId: string, ownerId: string, contribution: string): void {
  if (ownerId !== featureId) {
    throw new ServerProductCompositionInvariantError(
      "owner-mismatch",
      `${contribution} owned by '${ownerId}' cannot be registered by feature '${featureId}'.`,
    );
  }
}

function mergeFeatureLayers(
  contributions: ReadonlyArray<ExperimentalServerLayerContribution>,
): ExperimentalOpaqueServerLayer {
  if (contributions.length === 0) return Layer.empty;
  const [first, ...rest] = contributions;
  return Layer.mergeAll(
    first!.layer,
    ...rest.map(({ layer }) => layer),
  ) as ExperimentalOpaqueServerLayer;
}

/**
 * Trusted, build-time server contribution.
 *
 * @experimental This API is intentionally narrow while the server boundary is rebuilt.
 */
export function defineExperimentalServerFeature<
  const Feature extends ExperimentalServerFeatureContribution,
>(feature: Feature): Feature {
  assertStableId(feature.id, "invalid-feature-id", "Server feature id");
  if (feature.id === RESERVED_CORE_FEATURE_ID) {
    throw new ServerProductCompositionInvariantError(
      "reserved-feature-id",
      `Server feature '${feature.id}' is reserved for the built-in core product.`,
    );
  }
  assertFeatureVersion(feature);
  return feature;
}

export function createExperimentalServerProductComposition<
  const Features extends ReadonlyArray<ExperimentalServerFeatureContribution> = readonly [],
>(input: { readonly features?: Features }): ExperimentalServerProductComposition<Features> {
  const featureIds = new Set<string>();
  const layerIds = new Set<string>();
  const layers: ExperimentalServerLayerContribution[] = [];
  const migrations: ExperimentalFeatureMigrationContribution<Error>[] = [];
  const rpc: AnyNamespacedRpcContribution[] = [];
  const features = [...(input.features ?? [])]
    .map((feature) => defineExperimentalServerFeature(feature))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const feature of features) {
    if (featureIds.has(feature.id)) {
      throw new ServerProductCompositionInvariantError(
        "duplicate-feature",
        `Server feature '${feature.id}' is registered more than once.`,
      );
    }
    featureIds.add(feature.id);

    for (const layer of feature.layers ?? []) {
      assertOwner(feature.id, layer.ownerId, "Server layer contribution");
      assertStableId(layer.id, "invalid-layer-id", "Server layer contribution id");
      assertLayerVersion(feature.id, layer);
      const layerKey = `${layer.ownerId}:${layer.id}`;
      if (layerIds.has(layerKey)) {
        throw new ServerProductCompositionInvariantError(
          "duplicate-layer",
          `Server layer contribution '${layerKey}' is registered more than once.`,
        );
      }
      layerIds.add(layerKey);
      layers.push(layer);
    }

    for (const migration of feature.migrations ?? []) {
      assertOwner(feature.id, migration.ownerId, "Feature migration contribution");
      migrations.push(migration);
    }

    for (const contribution of feature.rpc ?? []) {
      assertOwner(feature.id, contribution.ownerId, "RPC contribution");
      rpc.push(contribution);
    }
  }

  const orderedLayers = layers.sort(
    (left, right) => left.ownerId.localeCompare(right.ownerId) || left.id.localeCompare(right.id),
  );
  createExperimentalFeatureMigrationPlan(migrations);
  const orderedRpc = createRpcContributionPlan(
    rpc as unknown as ReadonlyArray<RpcContributionsOfFeatures<Features>>,
  );

  return Object.freeze({
    features: Object.freeze(features),
    diagnostics: Object.freeze(
      features.map(({ id, version, layers, migrations }) => ({
        id,
        version,
        layers: layers?.length ?? 0,
        migrationNamespaces: migrations?.length ?? 0,
        rpcNamespaces: rpc?.length ?? 0,
      })),
    ),
    featureLayer: mergeFeatureLayers(orderedLayers),
    migrations: Object.freeze([...migrations]),
    rpc: Object.freeze([...orderedRpc]),
  });
}

export function composeExperimentalServerFeatures(
  features: ReadonlyArray<ExperimentalServerFeatureContribution>,
): ExperimentalServerProductComposition<ReadonlyArray<ExperimentalServerFeatureContribution>> {
  return createExperimentalServerProductComposition({ features });
}

export const CORE_SERVER_PRODUCT_COMPOSITION = createExperimentalServerProductComposition({});
