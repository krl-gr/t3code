import { describe, expect, it } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Rpc from "effect/unstable/rpc/Rpc";
import * as RpcGroup from "effect/unstable/rpc/RpcGroup";
import * as Schema from "effect/Schema";

import {
  CORE_SERVER_PRODUCT_COMPOSITION,
  ServerProductCompositionInvariantError,
  createExperimentalServerProductComposition,
  defineExperimentalServerFeature,
  eraseExperimentalServerLayer,
} from "./ServerProductComposition.ts";
import { CORE_SERVER_PRODUCT_ENTRY } from "./defaultProductEntry.ts";
import { defineNamespacedRpcContribution } from "./RpcContribution.ts";

const CompositionTestRpc = Rpc.make("upcomputer.tasks.ping", {
  payload: Schema.String,
  success: Schema.String,
});
const CompositionTestRpcGroup = RpcGroup.make(CompositionTestRpc);

describe("server product composition", () => {
  it("keeps the public core server composition empty", () => {
    expect(CORE_SERVER_PRODUCT_COMPOSITION.features).toEqual([]);
    expect(CORE_SERVER_PRODUCT_COMPOSITION.diagnostics).toEqual([]);
    expect(CORE_SERVER_PRODUCT_COMPOSITION.migrations).toEqual([]);
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
      {
        id: "upcomputer.agents",
        version: 1,
        layers: 0,
        migrationNamespaces: 0,
        rpcNamespaces: 0,
      },
      {
        id: "upcomputer.tasks",
        version: 2,
        layers: 0,
        migrationNamespaces: 0,
        rpcNamespaces: 0,
      },
    ]);
  });

  it("collects feature layers, migrations, and RPC contributions", () => {
    const layer = eraseExperimentalServerLayer(Layer.effectDiscard(Effect.void));
    const migration = {
      ownerId: "upcomputer.tasks",
      namespace: "upcomputer.tasks",
      migrations: [
        {
          version: 1,
          name: "CreateTaskStorage",
          run: Effect.void,
        },
      ],
    };
    const rpc = defineNamespacedRpcContribution({
      id: "tasks-rpc-v1",
      ownerId: "upcomputer.tasks",
      version: 1,
      namespace: "upcomputer.tasks",
      group: CompositionTestRpcGroup,
      handlers: () =>
        CompositionTestRpcGroup.toLayer(
          CompositionTestRpcGroup.of({
            "upcomputer.tasks.ping": (input) => Effect.succeed(input),
          }),
        ),
    });

    const composition = createExperimentalServerProductComposition({
      features: [
        {
          id: "upcomputer.tasks",
          version: 1,
          layers: [{ id: "tasks-runtime", ownerId: "upcomputer.tasks", version: 1, layer }],
          migrations: [migration],
          rpc: [rpc],
        },
      ],
    });

    expect(composition.diagnostics).toEqual([
      {
        id: "upcomputer.tasks",
        version: 1,
        layers: 1,
        migrationNamespaces: 1,
        rpcNamespaces: 1,
      },
    ]);
    expect(composition.migrations).toEqual([migration]);
    expect(composition.rpc).toEqual([rpc]);
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

    expect(() =>
      createExperimentalServerProductComposition({
        features: [
          {
            id: "upcomputer.tasks",
            version: 1,
            layers: [
              {
                id: "tasks-runtime",
                ownerId: "upcomputer.other",
                version: 1,
                layer: eraseExperimentalServerLayer(Layer.empty),
              },
            ],
          },
        ],
      }),
    ).toThrow(ServerProductCompositionInvariantError);

    expect(() =>
      createExperimentalServerProductComposition({
        features: [
          {
            id: "upcomputer.tasks",
            version: 1,
            rpc: [
              defineNamespacedRpcContribution({
                id: "tasks-rpc-v1",
                ownerId: "upcomputer.other",
                version: 1,
                namespace: "upcomputer.tasks",
                group: CompositionTestRpcGroup,
                handlers: () => Layer.empty as never,
              }),
            ],
          },
        ],
      }),
    ).toThrow(ServerProductCompositionInvariantError);
  });
});
