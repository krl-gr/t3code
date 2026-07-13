import { createCoreProductManifest } from "@t3tools/shared/product";

import packageJson from "../package.json" with { type: "json" };

export const PRODUCT_MANIFEST = createCoreProductManifest(packageJson.version);
