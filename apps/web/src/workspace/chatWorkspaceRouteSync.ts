export type WorkspaceInitialRouteDecision = "apply-route" | "restore-active-panel" | "show-index";

/** An explicit URL is authoritative when the persisted workspace first mounts. */
export function resolveWorkspaceInitialRouteDecision(input: {
  readonly hasRouteTarget: boolean;
  readonly hasRestoredPanels: boolean;
}): WorkspaceInitialRouteDecision {
  if (input.hasRouteTarget) return "apply-route";
  return input.hasRestoredPanels ? "restore-active-panel" : "show-index";
}

export type WorkspaceRouteSyncDecision =
  | "acknowledge-pending"
  | "apply-route"
  | "ignore-current"
  | "ignore-stale-pending";

export function resolveWorkspaceRouteSyncDecision(input: {
  readonly incomingRouteKey: string;
  readonly lastRouteKey: string | null;
  readonly pendingOutboundRouteKey: string | null;
}): WorkspaceRouteSyncDecision {
  if (input.pendingOutboundRouteKey !== null) {
    return input.incomingRouteKey === input.pendingOutboundRouteKey
      ? "acknowledge-pending"
      : "ignore-stale-pending";
  }

  return input.incomingRouteKey === input.lastRouteKey ? "ignore-current" : "apply-route";
}
