import { describe, expect, it } from "vite-plus/test";

import {
  CORE_SERVER_PRODUCT_COMPOSITION,
  ServerProductCompositionInvariantError,
  createExperimentalServerProductComposition,
  defineExperimentalServerFeature,
} from "./ServerProductComposition.ts";
import { CORE_SERVER_PRODUCT_ENTRY } from "./defaultProductEntry.ts";

describe("server product composition", () => {
  it("keeps the public core server composition empty", () => {
    expect(CORE_SERVER_PRODUCT_COMPOSITION.features).toEqual([]);
    expect(CORE_SERVER_PRODUCT_COMPOSITION.diagnostics).toEqual([]);
    expect(CORE_SERVER_PRODUCT_ENTRY.composition).toBe(CORE_SERVER_PRODUCT_COMPOSITION);
    expect(CORE_SERVER_PRODUCT_ENTRY.manifest.id).toBe("upcomputer");
  });

  it("sorts server features deterministically", () => {
    const composition = createExperimentalServerProductComposition({
      features: [
        defineExperimentalServerFeature({ id: "upcomputer.tasks", version: 2 }),
        defineExperimentalServerFeature({ id: "upcomputer.agents", version: 1 }),
      ],
    });

    expect(composition.features.map((feature) => feature.id)).toEqual([
      "upcomputer.agents",
      "upcomputer.tasks",
    ]);
    expect(composition.diagnostics).toEqual([
      { id: "upcomputer.agents", version: 1 },
      { id: "upcomputer.tasks", version: 2 },
    ]);
  });

  it("rejects ambiguous server feature registrations", () => {
    expect(() =>
      createExperimentalServerProductComposition({
        features: [
          { id: "upcomputer.tasks", version: 1 },
          { id: "upcomputer.tasks", version: 2 },
        ],
      }),
    ).toThrow(ServerProductCompositionInvariantError);

    expect(() => defineExperimentalServerFeature({ id: "Upcomputer.Tasks", version: 1 })).toThrow(
      ServerProductCompositionInvariantError,
    );

    expect(() => defineExperimentalServerFeature({ id: "upcomputer.core", version: 1 })).toThrow(
      ServerProductCompositionInvariantError,
    );
  });
});
