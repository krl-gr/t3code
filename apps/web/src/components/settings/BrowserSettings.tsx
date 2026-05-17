import { Globe2Icon, RotateCcwIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { BrowserProfileSnapshot } from "@t3tools/contracts";

import { useSettings, useUpdateSettings } from "../../hooks/useSettings";
import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function parseOrigins(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function BrowserSettingsPanel() {
  const browserSettings = useSettings((settings) => settings.browser);
  const { updateSettings } = useUpdateSettings();
  const [snapshot, setSnapshot] = useState<BrowserProfileSnapshot | null>(null);
  const [originDraft, setOriginDraft] = useState(() => browserSettings.allowedOrigins.join("\n"));
  const [loginUrl, setLoginUrl] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    setOriginDraft(browserSettings.allowedOrigins.join("\n"));
  }, [browserSettings.allowedOrigins]);

  const refreshSnapshot = useCallback(async () => {
    const api = ensureLocalApi().server;
    if (!api.getBrowserProfileSnapshot) {
      return;
    }
    setSnapshot(await api.getBrowserProfileSnapshot());
  }, []);

  useEffect(() => {
    void refreshSnapshot();
  }, [refreshSnapshot]);

  const runBrowserAction = useCallback(
    async (action: string, fn: () => Promise<BrowserProfileSnapshot>) => {
      setBusyAction(action);
      try {
        setSnapshot(await fn());
      } catch (error) {
        toastManager.add({
          type: "error",
          title: "Browser profile action failed",
          description:
            error instanceof Error ? error.message : "Unable to update the browser profile.",
        });
      } finally {
        setBusyAction(null);
      }
    },
    [],
  );

  const status = useMemo(() => {
    if (!snapshot) {
      return "Loading profile status";
    }
    return snapshot.status === "open" ? "Browser open" : "Browser closed";
  }, [snapshot]);

  return (
    <SettingsPageContainer>
      <SettingsSection title="Browser" icon={<Globe2Icon className="size-3.5" />}>
        <SettingsRow
          title="Profile"
          description="T3 Code uses an isolated persistent browser profile for manual logins."
          status={
            <span className="break-all">
              {status}
              {snapshot?.currentUrl ? ` · ${snapshot.currentTitle ?? snapshot.currentUrl}` : ""}
            </span>
          }
          control={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  runBrowserAction(
                    "login",
                    () =>
                      ensureLocalApi().server.openBrowserLoginWindow?.(
                        loginUrl.trim() ? { url: loginUrl.trim() } : {},
                      ) ?? Promise.reject(new Error("Browser API is unavailable.")),
                  )
                }
              >
                <Globe2Icon className="size-4" />
                Open login window
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                disabled={busyAction !== null}
                aria-label="Refresh browser status"
                onClick={() => void refreshSnapshot()}
              >
                <RotateCcwIcon className="size-4" />
              </Button>
            </div>
          }
        >
          <div className="mt-3 pb-4">
            <Textarea
              value={loginUrl}
              onChange={(event) => setLoginUrl(event.currentTarget.value)}
              placeholder="https://x.com"
              className="min-h-10 resize-none text-xs"
            />
          </div>
        </SettingsRow>

        <SettingsRow
          title="Allowed origins"
          description="Agents can navigate, search, read, scroll, click inert controls, and screenshot only these origins."
        >
          <div className="mt-3 space-y-3 pb-4">
            <Textarea
              value={originDraft}
              onChange={(event) => setOriginDraft(event.currentTarget.value)}
              placeholder={"https://x.com\nhttps://www.linkedin.com\nhttps://www.reddit.com"}
              className="min-h-32 resize-y font-mono text-xs"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() =>
                  updateSettings({
                    browser: {
                      allowedOrigins: parseOrigins(originDraft),
                    },
                  })
                }
              >
                Save origins
              </Button>
            </div>
          </div>
        </SettingsRow>

        <SettingsRow
          title="Session controls"
          description="Close the browser or clear the isolated profile data."
          control={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busyAction !== null}
                onClick={() =>
                  runBrowserAction(
                    "close",
                    () =>
                      ensureLocalApi().server.closeBrowserProfile?.() ??
                      Promise.reject(new Error("Browser API is unavailable.")),
                  )
                }
              >
                <SquareIcon className="size-4" />
                Close browser
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={busyAction !== null}
                onClick={() =>
                  runBrowserAction(
                    "clear",
                    () =>
                      ensureLocalApi().server.clearBrowserProfile?.() ??
                      Promise.reject(new Error("Browser API is unavailable.")),
                  )
                }
              >
                <Trash2Icon className="size-4" />
                Clear profile data
              </Button>
            </div>
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}
