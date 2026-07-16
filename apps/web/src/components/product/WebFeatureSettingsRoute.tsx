import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { useLocation } from "@tanstack/react-router";

import {
  listExperimentalWebSettings,
  useWebProductComposition,
} from "../../product/WebComposition";
import type { ExperimentalWebSettingsPageContribution } from "../../product/WebFeature";
import { WebFeatureRouteErrorBoundary, WebFeatureUnavailable } from "./WebFeatureRoute";

type SettingsComponent = ComponentType | LazyExoticComponent<ComponentType>;

const lazySettingsComponents = new WeakMap<object, SettingsComponent>();

function lazySettingsComponent(page: ExperimentalWebSettingsPageContribution): SettingsComponent {
  const existing = lazySettingsComponents.get(page.load);
  if (existing) return existing;
  const component = lazy(page.load);
  lazySettingsComponents.set(page.load, component);
  return component;
}

/** Resolves a trusted build-time settings contribution inside the host settings shell. */
export function WebFeatureSettingsRouteResolver() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const composition = useWebProductComposition();
  const match = listExperimentalWebSettings(composition).find(({ page }) => page.path === pathname);

  if (!match) {
    return (
      <WebFeatureUnavailable description="This settings page is not included in the current application build." />
    );
  }

  const SettingsComponent = lazySettingsComponent(match.page);
  return (
    <WebFeatureRouteErrorBoundary featureId={match.feature.id} routeId={match.page.id}>
      <Suspense
        fallback={
          <main className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            Loading settings...
          </main>
        }
      >
        <SettingsComponent />
      </Suspense>
    </WebFeatureRouteErrorBoundary>
  );
}
