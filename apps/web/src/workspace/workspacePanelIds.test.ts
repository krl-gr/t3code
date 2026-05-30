import { describe, expect, it } from "vitest";

import { createChatWorkspacePanelId, isChatWorkspacePanelId } from "./workspacePanelIds";

describe("workspacePanelIds", () => {
  it("creates slot-scoped workspace panel ids", () => {
    const panelId = createChatWorkspacePanelId();

    expect(panelId).toMatch(/^workspace:[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[\da-f]{4}-[\da-f]{12}$/);
    expect(isChatWorkspacePanelId(panelId)).toBe(true);
  });

  it("recognizes only workspace slot panel ids", () => {
    expect(isChatWorkspacePanelId("workspace:slot-1")).toBe(true);
    expect(isChatWorkspacePanelId("workspace:")).toBe(false);
    expect(isChatWorkspacePanelId("chat:environment-local:thread-1")).toBe(false);
  });
});
