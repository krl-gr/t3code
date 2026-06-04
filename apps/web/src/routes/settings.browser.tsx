import { createFileRoute } from "@tanstack/react-router";

import { BrowserSettingsPanel } from "../components/settings/BrowserSettings";

function SettingsBrowserRoute() {
  return <BrowserSettingsPanel />;
}

export const Route = createFileRoute("/settings/browser")({
  component: SettingsBrowserRoute,
});
