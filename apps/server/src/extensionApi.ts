/**
 * Experimental public build-time server product API.
 *
 * This narrow B3 boundary exposes product composition and CLI assembly only.
 * Runtime extension seams such as RPC, HTTP routes, dynamic tools, migrations,
 * interaction modes, and internal service exports are intentionally deferred.
 */
export * from "./product/ServerProductComposition.ts";
export * from "./product/ServerProductEntry.ts";
export * from "./product/ProductServerCli.ts";
export { CORE_SERVER_PRODUCT_ENTRY } from "./product/defaultProductEntry.ts";
export {
  makeRoutesLayerForProduct,
  makeServerLayerForProduct,
  runServerForProduct,
} from "./server.ts";
