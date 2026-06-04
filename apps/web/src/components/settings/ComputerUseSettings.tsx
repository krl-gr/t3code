import {
  MonitorCogIcon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  StethoscopeIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ComputerUseDoctorResult, ComputerUseSnapshot } from "@t3tools/contracts";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { ensureLocalApi } from "../../localApi";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function parseLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatDoctor(result: ComputerUseDoctorResult | undefined): string {
  if (!result) {
    return "";
  }
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

export function ComputerUseSettingsPanel() {
  const settings = useSettings((state) => state.computerUse);
  const { updateSettings } = useUpdateSettings();
  const [snapshot, setSnapshot] = useState<ComputerUseSnapshot | null>(null);
  const [binaryPath, setBinaryPath] = useState(settings.binaryPath);
  const [argsDraft, setArgsDraft] = useState(settings.mcpArgs.join("\n"));
  const [allowedAppsDraft, setAllowedAppsDraft] = useState(settings.allowedApps.join("\n"));
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const updateComputerUseSettings = useCallback(
    (patch: Partial<typeof settings>) => {
      updateSettings({
        computerUse: {
          ...settings,
          ...patch,
        },
      });
    },
    [settings, updateSettings],
  );

  useEffect(() => {
    setBinaryPath(settings.binaryPath);
    setArgsDraft(settings.mcpArgs.join("\n"));
    setAllowedAppsDraft(settings.allowedApps.join("\n"));
  }, [settings.allowedApps, settings.binaryPath, settings.mcpArgs]);

  const refreshSnapshot = useCallback(async () => {
    const api = ensureLocalApi().server;
    if (!api.getComputerUseSnapshot) {
      return;
    }
    setSnapshot(await api.getComputerUseSnapshot());
  }, []);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const runComputerUseAction = useCallback(
    async (action: string, fn: () => Promise<ComputerUseSnapshot | ComputerUseDoctorResult>) => {
      setBusyAction(action);
      try {
        const result = await fn();
        if ("settings" in result) {
          setSnapshot(result);
        } else {
          setSnapshot((current) =>
            current
              ? {
                  ...current,
                  doctor: result,
                }
              : current,
          );
        }
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Computer Use action failed",
          description:
            error instanceof Error ? error.message : "Unable to update Computer Use status.",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const statusText = useMemo(() => {
    if (!snapshot) {
      return "Loading status";
    }
    const missing = snapshot.missingRequiredTools.length;
    return `${snapshot.status}${missing > 0 ? ` - ${missing} missing required tool${missing === 1 ? "" : "s"}` : ""}`;
  }, [snapshot]);

  const saveCommandSettings = useCallback(() => {
    updateComputerUseSettings({
      binaryPath,
      mcpArgs: parseLines(argsDraft),
    });
  }, [argsDraft, binaryPath, updateComputerUseSettings]);

  const saveAllowedApps = useCallback(() => {
    updateComputerUseSettings({
      allowedApps: parseLines(allowedAppsDraft),
    });
  }, [allowedAppsDraft, updateComputerUseSettings]);

  const doctorOutput = formatDoctor(snapshot?.doctor);

  return (
    <SettingsPageContainer>
      <SettingsSection title="Computer Use" icon={<MonitorCogIcon className="size-3.5" />}>
        <SettingsRow
          title="Access"
          description="Expose desktop inspection and control tools to supported providers."
          status={statusText}
          control={
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                updateComputerUseSettings({
                  enabled: Boolean(checked),
                })
              }
              aria-label="Enable Computer Use"
            />
          }
        />

        <SettingsRow
          title="Mode"
          description="Observe mode only reads desktop state. Control mode permits clicks, typing, keys, scroll, and drag."
          control={
            <div className="grid grid-cols-2 overflow-hidden rounded-md border">
              {(["observe", "control"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium",
                    settings.mode === mode
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() =>
                    updateComputerUseSettings({
                      mode,
                    })
                  }
                >
                  {mode === "observe" ? "Observe" : "Control"}
                </button>
              ))}
            </div>
          }
        />

        <SettingsRow
          title="Backend command"
          description="External MCP backend command and one argument per line."
          status={
            <span className="break-all">
              {snapshot?.command ?? settings.binaryPath} {(snapshot?.args ?? settings.mcpArgs).join(" ")}
            </span>
          }
        >
          <div className="mt-3 space-y-3 pb-4">
            <Input
              value={binaryPath}
              onChange={(event) => setBinaryPath(event.currentTarget.value)}
              placeholder="open-codex-computer-use"
              className="font-mono text-xs"
            />
            <Textarea
              value={argsDraft}
              onChange={(event) => setArgsDraft(event.currentTarget.value)}
              placeholder="mcp"
              className="min-h-20 resize-y font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={saveCommandSettings}>
                Save command
              </Button>
            </div>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Control approvals"
          description="Require user approval before desktop control actions run."
          control={
            <Switch
              checked={settings.requireActionApproval}
              onCheckedChange={(checked) =>
                updateComputerUseSettings({
                  requireActionApproval: Boolean(checked),
                })
              }
              aria-label="Require Computer Use approvals"
            />
          }
        />

        <SettingsRow
          title="Coordinate fallback"
          description="Allow x/y coordinate targeting when an element index is unavailable."
          control={
            <Switch
              checked={settings.allowCoordinateFallback}
              onCheckedChange={(checked) =>
                updateComputerUseSettings({
                  allowCoordinateFallback: Boolean(checked),
                })
              }
              aria-label="Allow coordinate fallback"
            />
          }
        />

        <SettingsRow
          title="Allowed apps"
          description="Optional exact app-name allowlist. Leave empty to allow visible apps except sensitive credential surfaces."
        >
          <div className="mt-3 space-y-3 pb-4">
            <Textarea
              value={allowedAppsDraft}
              onChange={(event) => setAllowedAppsDraft(event.currentTarget.value)}
              placeholder={"Xcode\nSimulator\nGoogle Chrome"}
              className="min-h-28 resize-y font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={saveAllowedApps}>
                Save apps
              </Button>
            </div>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Backend controls"
          description="Refresh tool discovery, run permission checks, or restart the MCP backend."
          status={
            snapshot?.lastError ? (
              <span className="break-all text-destructive">{snapshot.lastError}</span>
            ) : null
          }
          control={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busyAction !== null}
                aria-label="Refresh Computer Use status"
                onClick={() => void refreshSnapshot()}
              >
                <RotateCcwIcon className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  runComputerUseAction(
                    "tools",
                    () =>
                      ensureLocalApi().server.refreshComputerUseTools?.() ??
                      Promise.reject(new Error("Computer Use API is unavailable.")),
                  )
                }
              >
                <PlayIcon className="size-4" />
                Refresh tools
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  runComputerUseAction(
                    "doctor",
                    () =>
                      ensureLocalApi().server.runComputerUseDoctor?.() ??
                      Promise.reject(new Error("Computer Use API is unavailable.")),
                  )
                }
              >
                <StethoscopeIcon className="size-4" />
                Doctor
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  runComputerUseAction(
                    "restart",
                    () =>
                      ensureLocalApi().server.restartComputerUse?.() ??
                      Promise.reject(new Error("Computer Use API is unavailable.")),
                  )
                }
              >
                <RotateCcwIcon className="size-4" />
                Restart
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  runComputerUseAction(
                    "stop",
                    () =>
                      ensureLocalApi().server.stopComputerUse?.() ??
                      Promise.reject(new Error("Computer Use API is unavailable.")),
                  )
                }
              >
                <SquareIcon className="size-4" />
                Stop
              </Button>
            </div>
          }
        >
          {doctorOutput ? (
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs">
              {doctorOutput}
            </pre>
          ) : null}
        </SettingsRow>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
