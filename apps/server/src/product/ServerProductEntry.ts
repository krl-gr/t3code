import type { ProductManifestSnapshot } from "@t3tools/contracts";

import type { ExperimentalServerProductComposition } from "./ServerProductComposition.ts";

export interface ExperimentalServerProductEntry {
  readonly manifest: ProductManifestSnapshot;
  readonly composition: ExperimentalServerProductComposition;
  readonly commandName?: string;
  readonly description?: string;
}

export function defineExperimentalServerProductEntry<
  const Entry extends ExperimentalServerProductEntry,
>(entry: Entry): Entry {
  return entry;
}
