import { RouterProvider } from "@tanstack/react-router";

import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { PreviewAutomationHosts } from "./components/preview/PreviewAutomationHosts";
import {
  CORE_WEB_PRODUCT_COMPOSITION,
  installWebProductComposition,
  WebProductCompositionProvider,
  type ExperimentalWebProductComposition,
} from "./product/WebComposition";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

/**
 * Owns renderer-wide providers. The Electron browser host intentionally sits
 * outside the router so its webviews survive route transitions, but it must
 * share the same atom registry as routed UI.
 */
export function AppRoot({
  router,
  composition = CORE_WEB_PRODUCT_COMPOSITION,
}: {
  readonly router: AppRouter;
  readonly composition?: ExperimentalWebProductComposition;
}) {
  installWebProductComposition(composition);

  return (
    <AppAtomRegistryProvider>
      <WebProductCompositionProvider composition={composition}>
        <RouterProvider router={router} />
        <PreviewAutomationHosts />
        <ElectronBrowserHost />
      </WebProductCompositionProvider>
    </AppAtomRegistryProvider>
  );
}
