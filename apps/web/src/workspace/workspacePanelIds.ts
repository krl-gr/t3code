import type { ScopedThreadRef } from "@t3tools/contracts";

import type { DraftId } from "../composerDraftStore";
import type { DiffRouteSearch } from "../diffRouteSearch";
import { randomUUID } from "../lib/utils";

export type ChatWorkspacePanelId = `workspace:${string}`;

export type ChatWorkspacePanelTarget =
  | {
      kind: "thread";
      ref: ScopedThreadRef;
    }
  | {
      kind: "draft";
      draftId: DraftId;
      ref: ScopedThreadRef;
    };

export interface ChatWorkspaceEmptyPanelState {
  kind: "empty";
}

export interface ChatWorkspaceChatPanelState {
  kind: "chat";
  target: ChatWorkspacePanelTarget;
  diffSearch: DiffRouteSearch;
}

export type ChatWorkspacePanelState = ChatWorkspaceEmptyPanelState | ChatWorkspaceChatPanelState;

export interface ChatWorkspaceRouteTarget {
  target: ChatWorkspacePanelTarget;
  diffSearch: DiffRouteSearch;
}

export function getChatWorkspaceRouteTargetKey(target: ChatWorkspaceRouteTarget): string {
  return JSON.stringify([
    target.target.kind,
    target.target.ref.environmentId,
    target.target.ref.threadId,
    target.target.kind === "draft" ? target.target.draftId : null,
    target.diffSearch.diff ?? null,
    target.diffSearch.diffTurnId ?? null,
    target.diffSearch.diffFilePath ?? null,
  ]);
}

export function isChatWorkspacePanelId(value: string): value is ChatWorkspacePanelId {
  return value.startsWith("workspace:") && value.length > "workspace:".length;
}

export function createChatWorkspacePanelId(): ChatWorkspacePanelId {
  return `workspace:${randomUUID()}`;
}
