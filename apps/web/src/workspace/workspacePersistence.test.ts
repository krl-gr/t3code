import { TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { sanitizePersistedChatWorkspaceState } from "./workspacePersistence";

describe("workspacePersistence", () => {
  it("accepts valid v1 workspace state", () => {
    const state = sanitizePersistedChatWorkspaceState({
      version: 1,
      dockview: { grid: {}, panels: {} },
      activePanelId: "workspace:slot-1",
      panelsById: {
        "workspace:slot-1": {
          kind: "chat",
          target: {
            kind: "thread",
            ref: {
              environmentId: "environment-local",
              threadId: "thread-1",
            },
          },
          diffSearch: {
            diff: "1",
            diffTurnId: "turn-1",
            diffFilePath: "src/app.ts",
          },
        },
      },
    });

    expect(state.activePanelId).toBe("workspace:slot-1");
    expect(state.panelsById["workspace:slot-1"]).toEqual({
      kind: "chat",
      target: {
        kind: "thread",
        ref: {
          environmentId: "environment-local",
          threadId: "thread-1",
        },
      },
      diffSearch: {
        diff: "1",
        diffTurnId: TurnId.make("turn-1"),
        diffFilePath: "src/app.ts",
      },
    });
  });

  it("drops malformed panel records", () => {
    const state = sanitizePersistedChatWorkspaceState({
      version: 1,
      dockview: null,
      activePanelId: "workspace:slot-1",
      panelsById: {
        "workspace:slot-1": {
          kind: "chat",
          target: {
            kind: "thread",
            ref: {
              environmentId: "environment-local",
            },
          },
          diffSearch: {},
        },
        "workspace:slot-2": {
          kind: "chat",
          target: {
            kind: "thread",
            ref: {
              environmentId: "environment-local",
              threadId: "thread-2",
            },
          },
          diffSearch: {},
        },
      },
    });

    expect(Object.keys(state.panelsById)).toEqual(["workspace:slot-2"]);
    expect(state.activePanelId).toBeNull();
  });

  it("normalizes diff state to recognized diff search keys only", () => {
    const state = sanitizePersistedChatWorkspaceState({
      version: 1,
      dockview: null,
      activePanelId: "workspace:slot-1",
      panelsById: {
        "workspace:slot-1": {
          kind: "chat",
          target: {
            kind: "thread",
            ref: {
              environmentId: "environment-local",
              threadId: "thread-1",
            },
          },
          diffSearch: {
            diff: true,
            diffTurnId: "turn-2",
            diffFilePath: "src/thing.ts",
            ignored: "value",
          },
        },
      },
    });

    const panelState = state.panelsById["workspace:slot-1"];
    expect(panelState?.kind).toBe("chat");
    if (panelState?.kind !== "chat") {
      throw new Error("Expected a chat panel state.");
    }
    expect(panelState.diffSearch).toEqual({
      diff: "1",
      diffTurnId: TurnId.make("turn-2"),
      diffFilePath: "src/thing.ts",
    });
  });

  it("accepts empty workspace tabs", () => {
    const state = sanitizePersistedChatWorkspaceState({
      version: 1,
      dockview: null,
      activePanelId: "workspace:slot-empty",
      panelsById: {
        "workspace:slot-empty": {
          kind: "empty",
        },
      },
    });

    expect(state.activePanelId).toBe("workspace:slot-empty");
    expect(state.panelsById["workspace:slot-empty"]).toEqual({ kind: "empty" });
  });

  it("drops legacy thread-keyed panel ids", () => {
    const state = sanitizePersistedChatWorkspaceState({
      version: 1,
      dockview: null,
      activePanelId: "chat:environment-local:thread-1",
      panelsById: {
        "chat:environment-local:thread-1": {
          target: {
            kind: "thread",
            ref: {
              environmentId: "environment-local",
              threadId: "thread-1",
            },
          },
          diffSearch: {},
        },
      },
    });

    expect(state.panelsById).toEqual({});
    expect(state.activePanelId).toBeNull();
  });
});
