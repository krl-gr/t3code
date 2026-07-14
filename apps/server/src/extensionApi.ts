/**
 * Experimental public build-time server product API.
 *
 * This B3 boundary exposes product composition, server CLI assembly, feature
 * runtime layers, feature migrations, feature interaction modes, and selected
 * service tags needed by first-party private products. HTTP routes and dynamic
 * tools are intentionally deferred.
 */
export * from "./product/FeatureMigrations.ts";
export * from "./product/InteractionModeRegistryService.ts";
export * from "./product/ProviderRuntimeEvents.ts";
export * from "./product/RpcContribution.ts";
export * from "./product/ServerProductComposition.ts";
export * from "./product/ServerProductEntry.ts";
export * from "./product/ProductServerCli.ts";
export { CORE_SERVER_PRODUCT_ENTRY } from "./product/defaultProductEntry.ts";
export { OrchestrationEngineService } from "./orchestration/Services/OrchestrationEngine.ts";
export { ProjectionSnapshotQuery } from "./orchestration/Services/ProjectionSnapshotQuery.ts";
export { ProviderRegistry } from "./provider/Services/ProviderRegistry.ts";
export { ServerSettingsService } from "./serverSettings.ts";
export {
  makeRoutesLayerForProduct,
  makeServerLayerForProduct,
  runServerForProduct,
} from "./server.ts";
