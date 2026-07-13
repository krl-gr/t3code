import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NetService from "@t3tools/shared/Net";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Command } from "effect/unstable/cli";

import { makeCli } from "../bin.ts";
import type { ExperimentalServerProductEntry } from "./ServerProductEntry.ts";

export interface ExperimentalProductServerCliInput extends ExperimentalServerProductEntry {}

const ProductServerCliRuntimeLayer = Layer.mergeAll(NodeServices.layer, NetService.layer);

/** Creates the standard server CLI around one build-time product entry. */
export function makeExperimentalProductServerCli(input: ExperimentalProductServerCliInput) {
  return makeCli({ productEntry: input });
}

/** Runs the standard Node server CLI for one build-time product entry. */
export function runExperimentalProductServerCli(input: ExperimentalProductServerCliInput): void {
  Command.run(makeExperimentalProductServerCli(input), {
    version: input.manifest.version,
  }).pipe(Effect.scoped, Effect.provide(ProductServerCliRuntimeLayer), NodeRuntime.runMain);
}
