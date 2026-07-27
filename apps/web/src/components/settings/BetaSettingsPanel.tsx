import * as Schema from "effect/Schema";
import { useEffect, useState } from "react";

import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { PROJECT_STATUS_INDICATOR_EXPERIMENT_KEY } from "../sidebar/experiments";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

const AUTO_SETTLE_MIN_DAYS = 1;
const AUTO_SETTLE_MAX_DAYS = 90;
const AUTO_SETTLE_DEFAULT_DAYS = 3;

function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (days: number) => void;
}) {
  // Local draft so the field can be emptied mid-edit; the setting only moves
  // on valid input and snaps back to the persisted value on blur.
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  return (
    <Input
      type="number"
      min={AUTO_SETTLE_MIN_DAYS}
      max={AUTO_SETTLE_MAX_DAYS}
      className="w-full sm:w-24"
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        // Number(), not parseInt: "3.5" must be rejected (not truncated to a
        // committed 3 while the field shows 3.5) — commit only when the
        // persisted value matches the displayed one.
        const parsed = Number(event.target.value);
        if (
          Number.isInteger(parsed) &&
          parsed >= AUTO_SETTLE_MIN_DAYS &&
          parsed <= AUTO_SETTLE_MAX_DAYS
        ) {
          onCommit(parsed);
        }
      }}
      onBlur={() => setDraft(String(value))}
      aria-label="Days of inactivity before auto-settle"
    />
  );
}

export function BetaSettingsPanel() {
  // Upstream's "Sidebar v2" switch is deliberately absent: v2 is one of this
  // fork's three sidebar view modes, chosen from the sidebar's own View menu,
  // so a second entry point here could only disagree with it.
  const sidebarViewMode = useClientSettings((settings) => settings.sidebarViewMode);
  const sidebarAutoSettleAfterDays = useClientSettings(
    (settings) => settings.sidebarAutoSettleAfterDays,
  );
  const updateSettings = useUpdateClientSettings();
  const [projectStatusIndicatorEnabled, setProjectStatusIndicatorEnabled] = useLocalStorage(
    PROJECT_STATUS_INDICATOR_EXPERIMENT_KEY,
    false,
    Schema.Boolean,
  );

  return (
    <SettingsPageContainer>
      <SettingsSection title="Experiments">
        <SettingsRow
          title="Project status dot"
          description="Upstream's treatment of the collapsed project row: a coloured dot for the most urgent thread status in the project, swapping to the chevron on hover, instead of our always-visible trailing chevron. Device-local and temporary — here to compare the two in a running build."
          control={
            <Switch
              checked={projectStatusIndicatorEnabled}
              onCheckedChange={(checked) => setProjectStatusIndicatorEnabled(Boolean(checked))}
              aria-label="Show the project status dot"
            />
          }
        />
      </SettingsSection>
      <SettingsSection title="Beta features">
        {sidebarViewMode === "v2" ? (
          <>
            <SettingsRow
              title="Auto-settle inactive threads"
              description="Threads with no activity for this long settle automatically. Threads on merged or closed PRs always settle."
              control={
                <Switch
                  checked={sidebarAutoSettleAfterDays !== null}
                  onCheckedChange={(checked) =>
                    updateSettings({
                      sidebarAutoSettleAfterDays: checked ? AUTO_SETTLE_DEFAULT_DAYS : null,
                    })
                  }
                  aria-label="Auto-settle inactive threads"
                />
              }
            />
            {sidebarAutoSettleAfterDays !== null ? (
              <SettingsRow
                title="Days of inactivity before auto-settle"
                description="Any new activity un-settles a thread automatically."
                control={
                  <AutoSettleDaysInput
                    value={sidebarAutoSettleAfterDays}
                    onCommit={(days) => updateSettings({ sidebarAutoSettleAfterDays: days })}
                  />
                }
              />
            ) : null}
          </>
        ) : (
          <SettingsRow
            title="Sidebar v2"
            description="One flat thread list in creation order. Temporarily unavailable: the sidebar's view switcher lives inside the classic sidebar, so selecting this mode left no way back. It returns once the switcher moves into the shared sidebar chrome."
          />
        )}
      </SettingsSection>
    </SettingsPageContainer>
  );
}
