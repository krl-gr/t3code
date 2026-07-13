import { createFileRoute, redirect } from "@tanstack/react-router";

import { WebFeatureRouteResolver } from "../components/product/WebFeatureRoute";

export const Route = createFileRoute("/$")({
  beforeLoad: ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: WebFeatureRouteResolver,
});
