import {
  Component,
  lazy,
  Suspense,
  type ComponentType,
  type ErrorInfo,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import { Link, useLocation } from "@tanstack/react-router";

import { listExperimentalWebRoutes, useWebProductComposition } from "../../product/WebComposition";
import type {
  ExperimentalWebFeatureContribution,
  ExperimentalWebRouteContribution,
} from "../../product/WebFeature";
import { useConnectedWebFeatureAvailability } from "../../product/environmentProduct";
import { Button } from "../ui/button";

type RouteComponent = ComponentType | LazyExoticComponent<ComponentType>;

const lazyRouteComponents = new WeakMap<object, RouteComponent>();

function lazyRouteComponent(route: ExperimentalWebRouteContribution): RouteComponent {
  const existing = lazyRouteComponents.get(route.load);
  if (existing) return existing;
  const component = lazy(route.load);
  lazyRouteComponents.set(route.load, component);
  return component;
}

function availabilityMessage(status: string): string {
  switch (status) {
    case "loading":
      return "Waiting for authoritative extension metadata from the connected server.";
    case "disabled":
      return "This extension is included in the application but is currently disabled.";
    case "entitlement-required":
      return "This extension requires activation before its interface can be opened.";
    case "incompatible":
      return "The connected server does not advertise a compatible capability version.";
    case "failed":
      return "The extension could not start safely.";
    default:
      return "This feature is not available in the current application and server composition.";
  }
}

export function WebFeatureUnavailable({
  title = "Feature unavailable",
  description,
}: {
  readonly title?: string;
  readonly description: string;
}) {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center p-6 text-foreground">
      <section className="w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-5">
          <Button render={<Link to="/" />} size="sm">
            Return to chat
          </Button>
        </div>
      </section>
    </main>
  );
}

export function WebRouteNotFound() {
  return (
    <WebFeatureUnavailable
      title="Page unavailable"
      description="This route is not part of the current Upcomputer build. It may belong to an extension that is absent, disabled, or incompatible with the connected server."
    />
  );
}

class WebFeatureRouteErrorBoundary extends Component<
  {
    readonly children: ReactNode;
    readonly featureId: string;
    readonly routeId: string;
  },
  { readonly failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[WEB_FEATURE:${this.props.featureId}:${this.props.routeId}] route render failed`,
      error,
      info.componentStack,
    );
  }

  override render() {
    return this.state.failed ? (
      <WebFeatureUnavailable
        title="Extension route failed"
        description={`The '${this.props.routeId}' interface from '${this.props.featureId}' could not be rendered. Ordinary Upcomputer chat remains available.`}
      />
    ) : (
      this.props.children
    );
  }
}

export function WebFeatureRouteGate({
  feature,
  route,
  component: FeatureComponent,
}: {
  readonly feature: ExperimentalWebFeatureContribution;
  readonly route: ExperimentalWebRouteContribution;
  readonly component: RouteComponent;
}) {
  const availability = useConnectedWebFeatureAvailability(feature, route.capabilities);
  if (!availability.canLoad) {
    return <WebFeatureUnavailable description={availabilityMessage(availability.status)} />;
  }

  return (
    <WebFeatureRouteErrorBoundary featureId={feature.id} routeId={route.id}>
      <Suspense
        fallback={
          <main className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
            Loading extension...
          </main>
        }
      >
        <FeatureComponent />
      </Suspense>
    </WebFeatureRouteErrorBoundary>
  );
}

/** Resolves a statically hosted catch-all path against the trusted build composition. */
export function WebFeatureRouteResolver() {
  const pathname = useLocation({ select: (location) => location.pathname });
  const composition = useWebProductComposition();
  const match = listExperimentalWebRoutes(composition).find(({ route }) => route.path === pathname);
  if (!match) return <WebRouteNotFound />;
  const FeatureComponent = lazyRouteComponent(match.route);
  return (
    <WebFeatureRouteGate
      key={match.route.id}
      feature={match.feature}
      route={match.route}
      component={FeatureComponent}
    />
  );
}
