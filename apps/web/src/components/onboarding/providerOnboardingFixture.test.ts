import { describe, expect, it } from "vite-plus/test";

import {
  devOnboardingInitialAgents,
  devOnboardingInitialOutcome,
} from "./providerOnboardingFixture";

describe("provider onboarding fixture presets", () => {
  it("creates a mixed machine without a ready agent", () => {
    expect(devOnboardingInitialAgents("mixed")).toEqual({
      codex: "installed",
      claudeAgent: "not-installed",
      opencode: "installed",
    });
  });

  it("creates a ready-agent negative control", () => {
    expect(devOnboardingInitialAgents("already-ready").codex).toBe("ready");
  });

  it("defaults the failure preset to a failed next action", () => {
    expect(devOnboardingInitialOutcome("failures")).toBe("fail");
    expect(devOnboardingInitialOutcome("up-connect")).toBe("success");
  });
});
