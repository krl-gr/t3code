"use client";

import {
  defaultInstanceIdForDriver,
  ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { CheckIcon, CopyIcon, LoaderIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { useWebProductComposition } from "../../product/WebComposition";
import { usePrimaryEnvironment } from "../../state/environments";
import { primaryServerProvidersAtom, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { buildProviderInstanceUpdatePatch } from "../settings/SettingsPanels.logic";
import {
  getProviderClientDefinitions,
  sortProviderClientDefinitionsForOnboarding,
  type DriverOption,
} from "../settings/providerDriverMeta";
import {
  countUsableProviders,
  getProviderOnboardingRowState,
  type ProviderOnboardingRowState,
} from "./providerOnboarding.logic";
import {
  DEV_ONBOARDING_SCENARIOS,
  devOnboardingInitialAgents,
  devOnboardingInitialOutcome,
  readDevOnboardingScenario,
  type DevOnboardingOutcome,
  type DevOnboardingScenario,
} from "./providerOnboardingFixture";

interface ProviderOnboardingProps {
  readonly onFinished: () => void;
  readonly onClose: () => void;
  readonly onSkip: () => void;
}

const UPCOMPUTER_DRIVER = ProviderDriverKind.make("up");
const ROW_GRID =
  "grid-cols-[minmax(0,1fr)_5.5rem_6.5rem] sm:grid-cols-[minmax(0,1fr)_6.5rem_9.5rem]";

interface AgentRow {
  readonly option: DriverOption;
  readonly driver: string;
  readonly instanceId: ProviderInstanceId;
  readonly instance: ProviderInstanceConfig;
  readonly live: ServerProvider | undefined;
  readonly builtIn: boolean;
  readonly installed: boolean;
  readonly state: ProviderOnboardingRowState;
  readonly ready: boolean;
  /** The driver ships an in-app connection flow onboarding can host in a popup. */
  readonly connectable: boolean;
}

/**
 * Sign-in help for an agent that authenticates through its own CLI. These
 * drivers ship no in-app flow, so `Connect` can only hand over the exact
 * command — which is still an action, unlike a bare "not signed in" label.
 */
function SignInPopup({
  label,
  signIn,
  onClose,
}: {
  readonly label: string;
  readonly signIn: NonNullable<DriverOption["signIn"]>;
  readonly onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-border/70 bg-card p-5 shadow-2xl shadow-black/30">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Close"
          className="absolute end-2 top-2"
          onClick={onClose}
        >
          <XIcon className="size-4" />
        </Button>
        <h2 className="pr-8 text-base font-semibold text-foreground">Sign in to {label}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{signIn.instructions}</p>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/70 bg-muted/40 p-2">
          <code className="min-w-0 flex-1 truncate px-1 font-mono text-sm text-foreground">
            {signIn.command}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(signIn.command).then(() => setCopied(true));
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReadyCell({
  row,
  busy,
  onConnect,
  onEnable,
}: {
  readonly row: AgentRow;
  readonly busy: boolean;
  readonly onConnect: () => void;
  readonly onEnable: () => void;
}) {
  if (row.ready) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
        <CheckIcon className="size-4" aria-hidden />
        Ready
      </span>
    );
  }

  switch (row.state) {
    case "checking":
      return (
        <span className="inline-flex items-center gap-2">
          <Skeleton className="h-4 w-16 rounded-full" />
          <span className="sr-only">Checking this agent</span>
        </span>
      );
    case "not-installed":
      return (
        <span className="text-sm text-muted-foreground" title="Install this agent first">
          —
        </span>
      );
    case "disabled":
      return (
        <Button size="sm" variant="outline" disabled={busy} onClick={onEnable}>
          Enable
        </Button>
      );
    case "needs-auth":
    case "needs-models":
      return row.connectable || row.option.signIn ? (
        <Button size="sm" variant="outline" onClick={onConnect}>
          Connect
        </Button>
      ) : (
        <span className="text-sm text-muted-foreground">
          {row.state === "needs-auth" ? "Not signed in" : "No models"}
        </span>
      );
    default:
      return <span className="text-sm text-muted-foreground">Unavailable</span>;
  }
}

function InstallCell({
  row,
  busy,
  onInstall,
}: {
  readonly row: AgentRow;
  readonly busy: boolean;
  readonly onInstall: () => void;
}) {
  if (row.builtIn) return <span className="text-sm text-muted-foreground">Built in</span>;
  if (row.installed) return <span className="text-sm text-muted-foreground">Installed</span>;
  if (!row.live) return <span className="text-sm text-muted-foreground">Unavailable</span>;
  return (
    <Button size="sm" variant="outline" disabled={busy} onClick={onInstall}>
      {busy ? <LoaderIcon className="animate-spin" /> : null}
      {busy ? "Installing…" : "Install"}
    </Button>
  );
}

export function ProviderOnboarding({ onFinished, onClose, onSkip }: ProviderOnboardingProps) {
  const navigate = useNavigate();
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const environment = usePrimaryEnvironment();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const composition = useWebProductComposition();
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const updateProvider = useAtomCommand(serverEnvironment.updateProvider, { reportFailure: false });
  const initialDevScenario = readDevOnboardingScenario();
  const [devScenario, setDevScenario] = useState<DevOnboardingScenario | null>(initialDevScenario);
  const [devOutcome, setDevOutcome] = useState<DevOnboardingOutcome>(() =>
    initialDevScenario ? devOnboardingInitialOutcome(initialDevScenario) : "success",
  );
  const [devAgents, setDevAgents] = useState<
    Record<string, "not-installed" | "installed" | "ready">
  >(() => (initialDevScenario ? devOnboardingInitialAgents(initialDevScenario) : {}));
  const [connectionReady, setConnectionReady] = useState<Record<string, boolean>>({});
  const [connectionDriver, setConnectionDriver] = useState<string>();
  const [signInDriver, setSignInDriver] = useState<string>();
  const [busyDrivers, setBusyDrivers] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fixtureEnabled = devScenario !== null;

  const resetDevScenario = (scenario: DevOnboardingScenario) => {
    setDevScenario(scenario);
    setDevOutcome(devOnboardingInitialOutcome(scenario));
    setDevAgents(devOnboardingInitialAgents(scenario));
    setConnectionReady({});
    setConnectionDriver(undefined);
    setSignInDriver(undefined);
    setBusyDrivers({});
    setErrors({});
    if (scenario === "already-ready") onFinished();
  };

  const options = useMemo(
    () => sortProviderClientDefinitionsForOnboarding(getProviderClientDefinitions(composition)),
    [composition],
  );

  // Every driver the build ships gets a row. Server data drives each row's
  // state — never its visibility — so a clean machine still sees the agents it
  // could install instead of a single built-in card.
  const rows: ReadonlyArray<AgentRow> = options.map((option) => {
    const driver = String(option.value);
    const live = providers.find((provider) => provider.driver === option.value);
    const instanceId = live?.instanceId ?? defaultInstanceIdForDriver(option.value);
    const instance: ProviderInstanceConfig =
      settings.providerInstances?.[instanceId] ??
      ({ driver: option.value, enabled: true } as ProviderInstanceConfig);
    const builtIn = option.value === UPCOMPUTER_DRIVER;
    const connectable = (option.onboardingDetails ?? option.connectionDetails) !== undefined;
    const fixtureStatus = devAgents[driver] ?? (builtIn ? "installed" : "not-installed");
    const state = fixtureEnabled
      ? fixtureStatus === "ready"
        ? "ready"
        : fixtureStatus === "installed"
          ? "needs-auth"
          : "not-installed"
      : getProviderOnboardingRowState(live);
    return {
      option,
      driver,
      instanceId,
      instance,
      live,
      builtIn,
      installed: fixtureEnabled ? fixtureStatus !== "not-installed" : (live?.installed ?? false),
      state,
      ready: state === "ready" || connectionReady[driver] === true,
      connectable,
    };
  });

  const readyCount = fixtureEnabled
    ? rows.filter((row) => row.ready).length
    : countUsableProviders(providers) +
      rows.filter((row) => row.state !== "ready" && connectionReady[row.driver] === true).length;

  const refresh = useCallback(() => {
    if (!environment) return;
    void refreshProviders({ environmentId: environment.environmentId, input: {} });
  }, [environment, refreshProviders]);

  const closeSignIn = useCallback(() => {
    setSignInDriver(undefined);
    // The login happened outside the app, so re-probe on the way out — a
    // successful sign-in should turn the row green without a reload.
    refresh();
  }, [refresh]);

  const closeConnection = useCallback(() => {
    setConnectionDriver(undefined);
    refresh();
  }, [refresh]);

  // Escape closes the active popup first, then the screen.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;
      event.preventDefault();
      if (signInDriver !== undefined) {
        closeSignIn();
        return;
      }
      if (connectionDriver !== undefined) {
        closeConnection();
        return;
      }
      onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeConnection, closeSignIn, connectionDriver, onClose, signInDriver]);

  const setBusy = (driver: string, busy: boolean) =>
    setBusyDrivers((current) => ({ ...current, [driver]: busy }));
  const setError = (driver: string, message?: string) =>
    setErrors((current) => {
      if (message !== undefined) return { ...current, [driver]: message };
      if (current[driver] === undefined) return current;
      const next = { ...current };
      delete next[driver];
      return next;
    });

  const openProviders = () => {
    onFinished();
    void navigate({ to: "/settings/providers" });
  };

  const installAgent = async (row: AgentRow) => {
    if (fixtureEnabled) {
      setBusy(row.driver, true);
      setError(row.driver);
      if (devOutcome === "loading") return;
      window.setTimeout(() => {
        setBusy(row.driver, false);
        if (devOutcome === "fail") {
          setError(row.driver, `Could not install ${row.option.label}.`);
          return;
        }
        if (devOutcome === "cancel") {
          setError(row.driver, `${row.option.label} installation was cancelled.`);
          return;
        }
        setDevAgents((current) => ({ ...current, [row.driver]: "installed" }));
      }, 650);
      return;
    }

    if (!environment || !row.live) {
      setError(row.driver, `${row.option.label} is not available in this environment.`);
      return;
    }
    if (row.live.installed) return;

    setBusy(row.driver, true);
    setError(row.driver);
    const result = await updateProvider({
      environmentId: environment.environmentId,
      input: { provider: row.option.value, instanceId: row.live.instanceId },
    });
    setBusy(row.driver, false);
    if (result._tag === "Failure") {
      setError(row.driver, `Could not install ${row.option.label}.`);
      return;
    }
    refresh();
  };

  // `enabled` never gets a column of its own — a disabled agent that is
  // otherwise ready is one click away, in the same cell that would hold its
  // checkmark.
  const enableAgent = (row: AgentRow) => {
    if (fixtureEnabled) {
      setDevAgents((current) => ({ ...current, [row.driver]: "ready" }));
      return;
    }
    setError(row.driver);
    updateSettings(
      buildProviderInstanceUpdatePatch({
        settings,
        instanceId: row.instanceId,
        instance: { ...row.instance, enabled: true },
        driver: row.option.value,
        isDefault: row.instanceId === defaultInstanceIdForDriver(row.option.value),
      }),
    );
    refresh();
  };

  const primaryAction =
    readyCount > 0
      ? { label: "Done", onClick: onFinished }
      : { label: "Skip for now", onClick: onSkip };

  const signInRow = rows.find((row) => row.driver === signInDriver);
  const connectionRow = rows.find((row) => row.driver === connectionDriver);
  const ConnectionDetails =
    connectionRow?.option.onboardingDetails ?? connectionRow?.option.connectionDetails;

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-background/96 backdrop-blur-md">
      {devScenario ? (
        <aside className="fixed right-3 bottom-3 z-[110] grid w-64 gap-2 rounded-xl border border-warning/40 bg-card/95 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-warning">
              Onboarding fixture
            </p>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Reset fixture"
              onClick={() => resetDevScenario(devScenario)}
            >
              <RotateCcwIcon className="size-3" />
            </Button>
          </div>
          <Select
            value={devScenario}
            onValueChange={(value) => resetDevScenario(value as DevOnboardingScenario)}
          >
            <SelectTrigger size="xs" aria-label="Fixture scenario">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {DEV_ONBOARDING_SCENARIOS.map((scenario) => (
                <SelectItem key={scenario} value={scenario}>
                  {scenario}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          <Select
            value={devOutcome}
            onValueChange={(value) => setDevOutcome(value as DevOnboardingOutcome)}
          >
            <SelectTrigger size="xs" aria-label="Next fixture action">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="success">Next action: success</SelectItem>
              <SelectItem value="fail">Next action: fail</SelectItem>
              <SelectItem value="cancel">Next action: cancel</SelectItem>
              <SelectItem value="loading">Next action: stay loading</SelectItem>
            </SelectPopup>
          </Select>
        </aside>
      ) : null}
      <main className="mx-auto flex min-h-full w-full max-w-3xl items-center px-4 py-10 sm:px-6">
        <section className="w-full rounded-2xl border border-border/70 bg-card p-5 shadow-2xl shadow-black/20 sm:p-8">
          <div className="grid gap-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Set up agents
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                UpComputer includes a built-in agent you can connect to your preferred subscription
                or API key. You can also install other agents and choose the setup that works best
                for you. Add or change providers anytime in Settings.
              </p>
            </div>

            <div>
              <div
                className={`grid gap-2 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:gap-3 ${ROW_GRID}`}
              >
                <span>Agent</span>
                <span className="text-right">Install</span>
                <span className="text-right">Ready</span>
              </div>
              <div className="divide-y divide-border/60 border-t border-border/60">
                {rows.map((row) => {
                  const Icon = row.option.icon;
                  const label = row.builtIn ? "UpComputer Agent" : row.option.label;
                  const busy = busyDrivers[row.driver] === true;
                  const error = errors[row.driver];

                  return (
                    <div key={row.driver} className="py-3">
                      <div className={`grid items-center gap-2 sm:gap-3 ${ROW_GRID}`}>
                        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/70">
                            <Icon className="size-5 text-foreground/80" aria-hidden />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{label}</p>
                            <p className="mt-0.5 hidden text-xs leading-relaxed text-muted-foreground sm:block">
                              {row.option.onboardingDescription ?? "Use this agent in UpComputer."}
                            </p>
                          </div>
                        </div>
                        <div className="justify-self-end">
                          <InstallCell
                            row={row}
                            busy={busy}
                            onInstall={() => void installAgent(row)}
                          />
                        </div>
                        <div className="justify-self-end">
                          <ReadyCell
                            row={row}
                            busy={busy}
                            onConnect={() => {
                              if (row.connectable) {
                                setConnectionDriver(row.driver);
                                return;
                              }
                              setSignInDriver(row.driver);
                            }}
                            onEnable={() => enableAgent(row)}
                          />
                        </div>
                      </div>

                      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button variant="outline" onClick={openProviders}>
                Manage providers in Settings
              </Button>
              <Button className="sm:w-auto" variant="inverse" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </Button>
            </div>
          </div>
        </section>
      </main>
      {connectionRow && ConnectionDetails ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 cursor-default bg-background/70 backdrop-blur-sm"
            onClick={closeConnection}
          />
          <div className="relative flex max-h-[min(85vh,48rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-2xl shadow-black/30">
            <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border/60 px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-foreground">
                Connect {connectionRow.builtIn ? "UpComputer Agent" : connectionRow.option.label}
              </h2>
              <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={closeConnection}>
                <XIcon className="size-4" />
              </Button>
            </div>
            <div className="min-h-0 overflow-y-auto p-5 sm:p-6">
              <ConnectionDetails
                environmentId={environment?.environmentId}
                instanceId={connectionRow.instanceId}
                instance={connectionRow.instance}
                liveProvider={connectionRow.live}
                refreshProviderStatus={refresh}
                onConnectionStateChange={(ready) =>
                  setConnectionReady((current) =>
                    current[connectionRow.driver] === ready
                      ? current
                      : { ...current, [connectionRow.driver]: ready },
                  )
                }
                {...(fixtureEnabled ? { onboardingFixtureOutcome: devOutcome } : {})}
              />
            </div>
          </div>
        </div>
      ) : null}
      {signInRow?.option.signIn ? (
        <SignInPopup
          label={signInRow.builtIn ? "UpComputer Agent" : signInRow.option.label}
          signIn={signInRow.option.signIn}
          onClose={closeSignIn}
        />
      ) : null}
    </div>
  );
}
