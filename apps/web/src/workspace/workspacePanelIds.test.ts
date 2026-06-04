import { describe, expect, it } from "vitest";
import { scopeThreadRef } from "@t3tools/client-runtime";
import { EnvironmentId, ThreadId, TurnId } from "@t3tools/contracts";
import { DraftId } from "../composerDraftStore";

import {
  createChatWorkspacePanelId,
  getChatWorkspaceRouteTargetKey,
  isChatWorkspacePanelId,
} from "./workspacePanelIds";

const environmentId = EnvironmentId.make("environment-local");
const threadId = ThreadId.make("thread-one");

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

  it("builds stable route target keys for equivalent route target objects", () => {
    const first = getChatWorkspaceRouteTargetKey({
      target: {
        kind: "thread",
        ref: scopeThreadRef(environmentId, threadId),
      },
      diffSearch: {
        diff: "1",
        diffTurnId: TurnId.make("turn-one"),
        diffFilePath: "src/App.tsx",
      },
    });
    const second = getChatWorkspaceRouteTargetKey({
      target: {
        kind: "thread",
        ref: scopeThreadRef(environmentId, threadId),
      },
      diffSearch: {
        diff: "1",
        diffTurnId: TurnId.make("turn-one"),
        diffFilePath: "src/App.tsx",
      },
    });

    expect(second).toBe(first);
  });

  it("changes route target keys when diff state changes", () => {
    const ref = scopeThreadRef(environmentId, threadId);

    expect(
      getChatWorkspaceRouteTargetKey({
        target: { kind: "thread", ref },
        diffSearch: {},
      }),
    ).not.toBe(
      getChatWorkspaceRouteTargetKey({
        target: { kind: "thread", ref },
        diffSearch: { diff: "1" },
      }),
    );
  });

  it("separates draft and thread route target keys", () => {
    const ref = scopeThreadRef(environmentId, threadId);

    expect(
      getChatWorkspaceRouteTargetKey({
        target: { kind: "thread", ref },
        diffSearch: {},
      }),
    ).not.toBe(
      getChatWorkspaceRouteTargetKey({
        target: { kind: "draft", draftId: DraftId.make("draft-one"), ref },
        diffSearch: {},
      }),
    );
  });
});
