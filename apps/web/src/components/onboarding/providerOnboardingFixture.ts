export const DEV_ONBOARDING_SCENARIOS = [
  "empty",
  "mixed",
  "up-connect",
  "install-agent",
  "failures",
  "already-ready",
] as const;

export type DevOnboardingScenario = (typeof DEV_ONBOARDING_SCENARIOS)[number];
export type DevOnboardingOutcome = "success" | "fail" | "cancel" | "loading";

export function readDevOnboardingScenario(): DevOnboardingScenario | null {
  if (!import.meta.env.DEV) return null;
  const value = import.meta.env.VITE_UPCOMPUTER_DEV_ONBOARDING?.trim();
  return DEV_ONBOARDING_SCENARIOS.find((scenario) => scenario === value) ?? null;
}

export function devOnboardingInitialAgents(
  scenario: DevOnboardingScenario,
): Record<string, "not-installed" | "installed" | "ready"> {
  switch (scenario) {
    case "mixed":
    case "up-connect":
      return { codex: "installed", claudeAgent: "not-installed", opencode: "installed" };
    case "already-ready":
      return { codex: "ready", claudeAgent: "installed", opencode: "installed" };
    default:
      return { codex: "not-installed", claudeAgent: "not-installed", opencode: "not-installed" };
  }
}

export function devOnboardingInitialOutcome(scenario: DevOnboardingScenario): DevOnboardingOutcome {
  return scenario === "failures" ? "fail" : "success";
}
