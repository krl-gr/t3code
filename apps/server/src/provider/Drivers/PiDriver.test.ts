import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderInstanceId, TextGenerationError } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { ServerConfig } from "../../config.ts";
import { PiDriver } from "./PiDriver.ts";

it.layer(NodeServices.layer)("PiDriver", (it) => {
  it.effect("fails git text generation with a typed TextGenerationError", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const instance = yield* PiDriver.create({
          instanceId: ProviderInstanceId.make("pi"),
          displayName: undefined,
          environment: [],
          enabled: true,
          config: PiDriver.defaultConfig(),
        });
        const error = yield* instance.textGeneration
          .generateCommitMessage({
            cwd: "C:/tmp/t3code-pi-test",
            branch: "main",
            stagedSummary: "M README.md",
            stagedPatch: "diff --git a/README.md b/README.md",
            modelSelection: {
              instanceId: ProviderInstanceId.make("pi"),
              model: "pi/default",
            },
          })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(TextGenerationError);
        expect(error.detail).toBe("Pi does not support git text generation in this build.");
      }),
    ).pipe(
      Effect.provide(ServerConfig.layerTest("C:/tmp/t3code-pi-test", { prefix: "pi-driver" })),
    ),
  );
});
