import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { BUILT_IN_DRIVERS } from "../builtInDrivers.ts";
import { deriveProviderInstanceConfigMap } from "./ProviderInstanceRegistryHydration.ts";

describe("ProviderInstanceRegistryHydration", () => {
  it("synthesizes the default Pi instance from legacy provider settings", () => {
    const instances = deriveProviderInstanceConfigMap(DEFAULT_SERVER_SETTINGS);
    const piInstance = instances[ProviderInstanceId.make("pi")];

    expect(piInstance).toEqual({
      driver: ProviderDriverKind.make("pi"),
      config: DEFAULT_SERVER_SETTINGS.providers.pi,
    });
  });

  it("registers Pi between Cursor and OpenCode in the built-in driver order", () => {
    expect(BUILT_IN_DRIVERS.map((driver) => driver.driverKind)).toEqual([
      ProviderDriverKind.make("codex"),
      ProviderDriverKind.make("claudeAgent"),
      ProviderDriverKind.make("cursor"),
      ProviderDriverKind.make("pi"),
      ProviderDriverKind.make("opencode"),
    ]);
  });
});
