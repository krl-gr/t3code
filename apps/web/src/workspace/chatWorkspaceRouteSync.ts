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
