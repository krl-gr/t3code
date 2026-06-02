import { createFileRoute } from "@tanstack/react-router";

import { ComputerUseSettingsPanel } from "../components/settings/ComputerUseSettings";

function SettingsComputerUseRoute() {
  return <ComputerUseSettingsPanel />;
}

export const Route = createFileRoute("/settings/computer-use")({
  component: SettingsComputerUseRoute,
});
