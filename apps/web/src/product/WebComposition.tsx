import { createContext, useContext, type PropsWithChildren } from "react";

import {
  defineExperimentalWebFeature,
  WebFeatureInvariantError,
  type ExperimentalWebFeatureContribution,
  type ExperimentalWebNavigationContribution,
  type ExperimentalWebNavigationSlot,
  type ExperimentalWebRouteContribution,
} from "./WebFeature";

export interface ExperimentalWebProductComposition {
  readonly features: ReadonlyArray<ExperimentalWebFeatureContribution>;
}

export function createExperimentalWebProductComposition(input: {
  readonly features?: ReadonlyArray<ExperimentalWebFeatureContribution>;
}): ExperimentalWebProductComposition {
  const featureIds = new Set<string>();
  const routeIds = new Set<string>();
  const routePaths = new Set<string>();
  const navigationIds = new Set<string>();
  const features = [...(input.features ?? [])]
    .map((feature) => defineExperimentalWebFeature(feature))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const feature of features) {
    if (featureIds.has(feature.id)) {
      throw new WebFeatureInvariantError(
        "duplicate-feature",
        `Web feature '${feature.id}' is registered more than once.`,
      );
    }
    featureIds.add(feature.id);

    for (const route of feature.routes ?? []) {
      if (routeIds.has(route.id) || routePaths.has(route.path)) {
        throw new WebFeatureInvariantError(
          "duplicate-route",
          `Web route '${route.id}' at '${route.path}' conflicts with another contribution.`,
        );
      }
      routeIds.add(route.id);
      routePaths.add(route.path);
    }

    for (const item of feature.navigation ?? []) {
      if (navigationIds.has(item.id)) {
        throw new WebFeatureInvariantError(
          "duplicate-navigation",
          `Web navigation item '${item.id}' is registered more than once.`,
        );
      }
      navigationIds.add(item.id);
    }
  }

  return Object.freeze({
    features: Object.freeze(features),
  });
}

export const CORE_WEB_PRODUCT_COMPOSITION = createExperimentalWebProductComposition({});

export function listExperimentalWebRoutes(
  composition: ExperimentalWebProductComposition,
): ReadonlyArray<{
  readonly feature: ExperimentalWebFeatureContribution;
  readonly route: ExperimentalWebRouteContribution;
}> {
  return composition.features
    .flatMap((feature) => (feature.routes ?? []).map((route) => ({ feature, route })))
    .sort((left, right) =>
      left.route.path === right.route.path
        ? left.route.id.localeCompare(right.route.id)
        : left.route.path.localeCompare(right.route.path),
    );
}

export function listExperimentalWebNavigation(
  composition: ExperimentalWebProductComposition,
  slot: ExperimentalWebNavigationSlot,
): ReadonlyArray<{
  readonly feature: ExperimentalWebFeatureContribution;
  readonly item: ExperimentalWebNavigationContribution;
}> {
  return composition.features
    .flatMap((feature) => (feature.navigation ?? []).map((item) => ({ feature, item })))
    .filter(({ item }) => item.slot === slot)
    .sort((left, right) => {
      const order = (left.item.order ?? 0) - (right.item.order ?? 0);
      return order !== 0 ? order : left.item.id.localeCompare(right.item.id);
    });
}

const WebProductCompositionContext = createContext<ExperimentalWebProductComposition>(
  CORE_WEB_PRODUCT_COMPOSITION,
);

export function WebProductCompositionProvider({
  composition,
  children,
}: PropsWithChildren<{ readonly composition: ExperimentalWebProductComposition }>) {
  return (
    <WebProductCompositionContext.Provider value={composition}>
      {children}
    </WebProductCompositionContext.Provider>
  );
}

export function useWebProductComposition(): ExperimentalWebProductComposition {
  return useContext(WebProductCompositionContext);
}
