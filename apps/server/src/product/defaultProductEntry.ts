import { PRODUCT_MANIFEST } from "../productManifest.ts";
import { CORE_SERVER_PRODUCT_COMPOSITION } from "./ServerProductComposition.ts";
import { defineExperimentalServerProductEntry } from "./ServerProductEntry.ts";

/** Default product entry used by the public, core-only Upcomputer server. */
export const CORE_SERVER_PRODUCT_ENTRY = defineExperimentalServerProductEntry({
  manifest: PRODUCT_MANIFEST,
  composition: CORE_SERVER_PRODUCT_COMPOSITION,
});
