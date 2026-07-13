const STABLE_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const RESERVED_CORE_FEATURE_ID = "upcomputer.core";

export interface ExperimentalServerFeatureContribution {
  readonly id: string;
  readonly version: number;
}

export interface ExperimentalServerFeatureDiagnostic {
  readonly id: string;
  readonly version: number;
}

export interface ExperimentalServerProductComposition {
  readonly features: ReadonlyArray<ExperimentalServerFeatureContribution>;
  readonly diagnostics: ReadonlyArray<ExperimentalServerFeatureDiagnostic>;
}

export class ServerProductCompositionInvariantError extends Error {
  override readonly name = "ServerProductCompositionInvariantError";
  readonly code:
    | "invalid-feature-id"
    | "invalid-feature-version"
    | "reserved-feature-id"
    | "duplicate-feature";

  constructor(
    code:
      | "invalid-feature-id"
      | "invalid-feature-version"
      | "reserved-feature-id"
      | "duplicate-feature",
    message: string,
  ) {
    super(message);
    this.code = code;
  }
}

function assertStableId(value: string, field: string): void {
  if (!STABLE_ID.test(value)) {
    throw new ServerProductCompositionInvariantError(
      "invalid-feature-id",
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

/**
 * Trusted, build-time server contribution.
 *
 * @experimental This API is intentionally narrow while the server boundary is rebuilt.
 */
export function defineExperimentalServerFeature<
  const Feature extends ExperimentalServerFeatureContribution,
>(feature: Feature): Feature {
  assertStableId(feature.id, "Server feature id");
  if (feature.id === RESERVED_CORE_FEATURE_ID) {
    throw new ServerProductCompositionInvariantError(
      "reserved-feature-id",
      `Server feature '${feature.id}' is reserved for the built-in core product.`,
    );
  }
  assertFeatureVersion(feature);
  return feature;
}

export function createExperimentalServerProductComposition(input: {
  readonly features?: ReadonlyArray<ExperimentalServerFeatureContribution>;
}): ExperimentalServerProductComposition {
  const featureIds = new Set<string>();
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
  }

  return Object.freeze({
    features: Object.freeze(features),
    diagnostics: Object.freeze(features.map(({ id, version }) => ({ id, version }))),
  });
}

export const CORE_SERVER_PRODUCT_COMPOSITION = createExperimentalServerProductComposition({});
