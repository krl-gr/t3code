import { describe, expect, it } from "vite-plus/test";

import { resolveWorkspaceRouteSyncDecision } from "./chatWorkspaceRouteSync";

describe("resolveWorkspaceRouteSyncDecision", () => {
  it("ignores the previous route while a panel activation is navigating to its target", () => {
    expect(
      resolveWorkspaceRouteSyncDecision({
        incomingRouteKey: "thread:A",
        lastRouteKey: "thread:B",
        pendingOutboundRouteKey: "thread:B",
      }),
    ).toBe("ignore-stale-pending");
  });

  it("acknowledges the route produced by the pending panel activation", () => {
    expect(
      resolveWorkspaceRouteSyncDecision({
        incomingRouteKey: "thread:B",
        lastRouteKey: "thread:B",
        pendingOutboundRouteKey: "thread:B",
      }),
    ).toBe("acknowledge-pending");
  });

  it("applies external navigation when no panel route sync is pending", () => {
    expect(
      resolveWorkspaceRouteSyncDecision({
        incomingRouteKey: "thread:B",
        lastRouteKey: "thread:A",
        pendingOutboundRouteKey: null,
      }),
    ).toBe("apply-route");
  });

  it("ignores a route that is already synchronized", () => {
    expect(
      resolveWorkspaceRouteSyncDecision({
        incomingRouteKey: "thread:A",
        lastRouteKey: "thread:A",
        pendingOutboundRouteKey: null,
      }),
    ).toBe("ignore-current");
  });
});
