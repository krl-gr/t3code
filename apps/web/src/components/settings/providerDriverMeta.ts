import {
  ClaudeSettings,
  CodexSettings,
  CursorSettings,
  GrokSettings,
  OpenCodeSettings,
  ProviderDriverKind,
} from "@t3tools/contracts";
import type * as Schema from "effect/Schema";
import type { ComponentType } from "react";
import {
  listExperimentalWebProviderDrivers,
  type ExperimentalWebProductComposition,
} from "../../product/WebComposition";
import type { ExperimentalWebProviderDriverDetailsProps } from "../../product/WebFeature";
import { ClaudeAI, CursorIcon, GrokIcon, type Icon, OpenAI, OpenCodeIcon } from "../Icons";

type ProviderSettingsSchema = {
  readonly fields: Readonly<Record<string, Schema.Top>>;
} & Schema.Top;

/**
 * Browser-safe provider definition. This is deliberately shaped like the
 * future provider package client export: the core web app gets a schema with
 * field annotations plus provider-level presentation metadata, then renders
 * settings generically.
 */
export interface ProviderClientDefinition {
  readonly value: ProviderDriverKind;
  readonly label: string;
  readonly icon: Icon;
  readonly settingsSchema: ProviderSettingsSchema;
  /**
   * Optional short label rendered as a `variant="warning"` badge next to
   * the instance title. Used to flag drivers that still ship under an
   * early-access or preview gate — the flag is a property of the driver
   * kind (not a specific instance), so every instance of that driver —
   * built-in default or custom — advertises the same marker.
   */
  readonly badgeLabel?: string;
  readonly details?: ComponentType<ExperimentalWebProviderDriverDetailsProps>;
}

export const PROVIDER_CLIENT_DEFINITIONS: readonly ProviderClientDefinition[] = [
  {
    value: ProviderDriverKind.make("codex"),
    label: "Codex",
    icon: OpenAI,
    settingsSchema: CodexSettings,
  },
  {
    value: ProviderDriverKind.make("claudeAgent"),
    label: "Claude",
    icon: ClaudeAI,
    settingsSchema: ClaudeSettings,
  },
  {
    value: ProviderDriverKind.make("cursor"),
    label: "Cursor",
    icon: CursorIcon,
    badgeLabel: "Early Access",
    settingsSchema: CursorSettings,
  },
  {
    value: ProviderDriverKind.make("grok"),
    label: "Grok",
    icon: GrokIcon,
    badgeLabel: "Early Access",
    settingsSchema: GrokSettings,
  },
  {
    value: ProviderDriverKind.make("opencode"),
    label: "OpenCode",
    icon: OpenCodeIcon,
    settingsSchema: OpenCodeSettings,
  },
];

export const PROVIDER_CLIENT_DEFINITION_BY_VALUE: Partial<
  Record<ProviderDriverKind, ProviderClientDefinition>
> = Object.fromEntries(
  PROVIDER_CLIENT_DEFINITIONS.map((definition) => [definition.value, definition]),
);

export const DRIVER_OPTIONS = PROVIDER_CLIENT_DEFINITIONS;
export const DRIVER_OPTION_BY_VALUE = PROVIDER_CLIENT_DEFINITION_BY_VALUE;
export type DriverOption = ProviderClientDefinition;

export function getProviderClientDefinitions(
  composition: ExperimentalWebProductComposition,
): ReadonlyArray<ProviderClientDefinition> {
  return [
    ...PROVIDER_CLIENT_DEFINITIONS,
    ...listExperimentalWebProviderDrivers(composition).map(({ provider }) => ({
      value: provider.driverKind,
      label: provider.label,
      icon: provider.icon,
      settingsSchema: provider.settingsSchema,
      ...(provider.badgeLabel === undefined ? {} : { badgeLabel: provider.badgeLabel }),
      ...(provider.details === undefined ? {} : { details: provider.details }),
    })),
  ];
}

/**
 * Look up the driver metadata for an instance's `driver` field. Accepts
 * Returns `undefined` for fork / unknown drivers so callers can decide how
 * to render them — typically by falling back to a generic card.
 */
export function getDriverOption(
  driver: ProviderDriverKind | undefined,
  composition?: ExperimentalWebProductComposition,
): DriverOption | undefined {
  if (driver === undefined) return undefined;
  return composition === undefined
    ? PROVIDER_CLIENT_DEFINITION_BY_VALUE[driver]
    : getProviderClientDefinitions(composition).find((definition) => definition.value === driver);
}
