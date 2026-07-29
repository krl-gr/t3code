import { describe, expect, it } from "vite-plus/test";

import { resolveAvailableSidebarViewMode } from "./sidebarViewMode";

describe("resolveAvailableSidebarViewMode", () => {
  it("maps a persisted Flat view to Classic while Flat view is parked", () => {
    expect(resolveAvailableSidebarViewMode("v2")).toBe("nested");
  });

  it("preserves shipping modes and allows Flat view when it is re-enabled", () => {
    expect(resolveAvailableSidebarViewMode("nested")).toBe("nested");
    expect(resolveAvailableSidebarViewMode("focused")).toBe("focused");
    expect(resolveAvailableSidebarViewMode("v2", true)).toBe("v2");
  });
});
