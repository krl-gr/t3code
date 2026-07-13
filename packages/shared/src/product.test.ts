import { describe, expect, it } from "vite-plus/test";

import {
  createCoreProductManifest,
  createExperimentalProductManifest,
  findProductCapability,
  ProductManifestInvariantError,
  supportsProductCapability,
} from "./product.ts";

describe("product manifest helpers", () => {
  it("advertises the minimal public core product capability", () => {
    const manifest = createCoreProductManifest("1.2.3");

    expect(manifest).toMatchObject({
      id: "upcomputer",
      displayName: "Upcomputer",
      version: "1.2.3",
      extensionApiVersion: 1,
      experimental: true,
      extensions: [],
    });
    expect(manifest.capabilities).toEqual([
      {
        id: "product.manifest",
        version: 1,
        ownerId: "upcomputer.core",
      },
    ]);
    expect(supportsProductCapability(manifest, "product.manifest")).toBe(true);
    expect(supportsProductCapability(manifest, "server.extension-api")).toBe(false);
  });

  it("rejects ambiguous duplicate extension and capability registrations", () => {
    expect(() =>
      createExperimentalProductManifest({
        id: "upcomputer",
        displayName: "Upcomputer",
        version: "1.0.0",
        extensions: [
          {
            id: "official.tasks",
            displayName: "Tasks",
            description: "Task orchestration",
            version: "1.0.0",
            source: "official",
            availability: "paid",
          },
          {
            id: "official.tasks",
            displayName: "Tasks duplicate",
            description: "Task orchestration duplicate",
            version: "1.0.0",
            source: "official",
            availability: "paid",
          },
        ],
      }),
    ).toThrow(ProductManifestInvariantError);

    expect(() =>
      createExperimentalProductManifest({
        id: "upcomputer",
        displayName: "Upcomputer",
        version: "1.0.0",
        coreCapabilities: [{ id: "shared.capability", version: 1 }],
        extensions: [
          {
            id: "official.tasks",
            displayName: "Tasks",
            description: "Task orchestration",
            version: "1.0.0",
            source: "official",
            availability: "paid",
            capabilities: [{ id: "shared.capability", version: 1 }],
          },
        ],
      }),
    ).toThrow(ProductManifestInvariantError);
  });

  it("fails capability checks closed on missing or duplicate advertised metadata", () => {
    const manifest = createCoreProductManifest("1.2.3");
    const ambiguous = {
      ...manifest,
      capabilities: [
        ...manifest.capabilities,
        {
          id: "product.manifest",
          version: 1,
          ownerId: "other.core",
        },
      ],
    };

    expect(findProductCapability(undefined, "product.manifest")).toBeUndefined();
    expect(findProductCapability(ambiguous, "product.manifest")).toBeUndefined();
    expect(supportsProductCapability(ambiguous, "product.manifest")).toBe(false);
    expect(
      supportsProductCapability(manifest, "product.manifest", {
        minimum: 2,
      }),
    ).toBe(false);
    expect(
      supportsProductCapability(manifest, "product.manifest", {
        ownerId: "upcomputer.core",
        minimum: 1,
        maximum: 1,
      }),
    ).toBe(true);
  });
});
