import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedString } from "./baseSchemas.ts";

export const BrowserAllowedOrigin = TrimmedString;
export type BrowserAllowedOrigin = typeof BrowserAllowedOrigin.Type;

export const BrowserSettings = Schema.Struct({
  allowedOrigins: Schema.Array(BrowserAllowedOrigin).pipe(
    Schema.withDecodingDefault(Effect.succeed([])),
  ),
  allowAllHttpsOrigins: Schema.Boolean.pipe(Schema.withDecodingDefault(Effect.succeed(false))),
});
export type BrowserSettings = typeof BrowserSettings.Type;

export const BrowserProfileSnapshot = Schema.Struct({
  profileId: Schema.Literal("default"),
  profilePath: Schema.String,
  status: Schema.Literals(["closed", "open"]),
  launchMode: Schema.optional(Schema.Literal("cdp-attached")),
  browserName: Schema.optional(Schema.Literals(["chrome", "msedge"])),
  debuggingPort: Schema.optional(Schema.Number),
  currentUrl: Schema.optional(Schema.String),
  currentTitle: Schema.optional(Schema.String),
  allowedOrigins: Schema.Array(Schema.String),
  allowAllHttpsOrigins: Schema.Boolean,
});
export type BrowserProfileSnapshot = typeof BrowserProfileSnapshot.Type;

export const BrowserOpenLoginWindowInput = Schema.Struct({
  url: Schema.optional(TrimmedString),
});
export type BrowserOpenLoginWindowInput = typeof BrowserOpenLoginWindowInput.Type;
