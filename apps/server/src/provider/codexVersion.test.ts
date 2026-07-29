import { describe, expect, it } from "vite-plus/test";

import { codexVersionFromUserAgent } from "./codexVersion.ts";

describe("codexVersionFromUserAgent", () => {
  it("reads the version of the running app-server from its user agent", () => {
    expect(codexVersionFromUserAgent("codex_cli_rs/0.145.0")).toBe("0.145.0");
    expect(codexVersionFromUserAgent("codex_cli_rs/0.145.0 platform/macos")).toBe("0.145.0");
  });

  it("returns undefined for a user agent without a version segment", () => {
    expect(codexVersionFromUserAgent("codex_cli_rs")).toBeUndefined();
  });
});
