import { createFileRoute } from "@tanstack/react-router";

import { WebFeatureSettingsRouteResolver } from "../components/product/WebFeatureSettingsRoute";

export const Route = createFileRoute("/settings/$section")({
  component: WebFeatureSettingsRouteResolver,
});
