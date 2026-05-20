import type { ProviderInteractionMode } from "@t3tools/contracts";

export const INTERACTION_MODE_ORDER = [
  "default",
  "ask",
  "plan",
] as const satisfies readonly ProviderInteractionMode[];

export const interactionModeConfig: Record<
  ProviderInteractionMode,
  { label: string; description: string }
> = {
  default: {
    label: "Build",
    description: "Execute changes normally.",
  },
  ask: {
    label: "Ask",
    description: "Answer only, no edits, commands, or plans.",
  },
  plan: {
    label: "Plan",
    description: "Produce implementation plans.",
  },
};

export function isProviderInteractionMode(value: unknown): value is ProviderInteractionMode {
  return value === "default" || value === "ask" || value === "plan";
}

export function getInteractionModeLabel(mode: ProviderInteractionMode): string {
  return interactionModeConfig[mode].label;
}

export function nextProviderInteractionMode(
  mode: ProviderInteractionMode,
): ProviderInteractionMode {
  const index = INTERACTION_MODE_ORDER.indexOf(mode);
  return INTERACTION_MODE_ORDER[(index + 1) % INTERACTION_MODE_ORDER.length] ?? "default";
}
