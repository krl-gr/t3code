import type { ScopedProjectRef, ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";

import type { DraftId, DraftThreadEnvMode } from "../composerDraftStore";
import type { DiffRouteSearch } from "../diffRouteSearch";
import type { CreatedDraftThread } from "../hooks/useHandleNewThread";
import type { ChatWorkspacePanelId } from "./workspacePanelIds";

export type ChatWorkspaceOpenDisposition = "active-panel" | "new-panel" | "reserved-panel";

export type ChatWorkspaceOpenTarget =
  | {
      kind: "thread";
      ref: ScopedThreadRef;
      diffSearch?: DiffRouteSearch;
    }
  | {
      kind: "draft";
      draftId: DraftId;
      ref: ScopedThreadRef;
      diffSearch?: DiffRouteSearch;
    }
  | {
      kind: "empty";
    };

export interface ChatWorkspaceOpenRequest {
  target: ChatWorkspaceOpenTarget;
  disposition: ChatWorkspaceOpenDisposition;
  referenceGroupId?: string;
  panelId?: ChatWorkspacePanelId;
}

export interface ChatWorkspaceNewDraftOptions {
  branch?: string | null;
  worktreePath?: string | null;
  envMode?: DraftThreadEnvMode;
  forceNewDraft?: boolean;
}

export interface ChatWorkspaceDraftThreadRequest {
  projectRef: ScopedProjectRef;
  options?: ChatWorkspaceNewDraftOptions;
  disposition: Extract<ChatWorkspaceOpenDisposition, "active-panel" | "new-panel">;
  referenceGroupId?: string;
}

export interface ChatWorkspaceController {
  openWorkspaceTarget: (request: ChatWorkspaceOpenRequest) => ChatWorkspacePanelId | null;
  createDraftThreadPanel: (request: ChatWorkspaceDraftThreadRequest) => CreatedDraftThread | null;
}

interface ChatWorkspaceControllerState {
  activePanelId: ChatWorkspacePanelId | null;
  controller: ChatWorkspaceController | null;
  registerController: (controller: ChatWorkspaceController) => () => void;
  setActivePanelId: (panelId: ChatWorkspacePanelId | null) => void;
}

export interface ResolveWorkspacePanelIdInput {
  activePanelId: ChatWorkspacePanelId | null;
  createPanelId: () => ChatWorkspacePanelId;
  hasPanel: (panelId: ChatWorkspacePanelId) => boolean;
  request: Pick<ChatWorkspaceOpenRequest, "disposition" | "panelId">;
}

export function resolveWorkspacePanelIdForOpenRequest(
  input: ResolveWorkspacePanelIdInput,
): ChatWorkspacePanelId {
  if (input.request.disposition === "reserved-panel") {
    const reservedPanelId = input.request.panelId;
    if (reservedPanelId && input.hasPanel(reservedPanelId)) {
      return reservedPanelId;
    }
    return input.createPanelId();
  }

  if (input.request.disposition === "active-panel") {
    const activePanelId = input.activePanelId;
    if (activePanelId && input.hasPanel(activePanelId)) {
      return activePanelId;
    }
    return input.createPanelId();
  }

  return input.createPanelId();
}

export const useChatWorkspaceControllerStore = create<ChatWorkspaceControllerState>((set, get) => ({
  activePanelId: null,
  controller: null,
  registerController: (controller) => {
    set({ controller });
    return () => {
      if (get().controller === controller) {
        set({ controller: null, activePanelId: null });
      }
    };
  },
  setActivePanelId: (panelId) => {
    if (get().activePanelId === panelId) {
      return;
    }
    set({ activePanelId: panelId });
  },
}));

export function getChatWorkspaceController(): ChatWorkspaceController | null {
  return useChatWorkspaceControllerStore.getState().controller;
}

export function openChatWorkspaceTarget(
  request: ChatWorkspaceOpenRequest,
): ChatWorkspacePanelId | null {
  return getChatWorkspaceController()?.openWorkspaceTarget(request) ?? null;
}

export function createChatWorkspaceDraftThread(
  request: ChatWorkspaceDraftThreadRequest,
): CreatedDraftThread | null {
  return getChatWorkspaceController()?.createDraftThreadPanel(request) ?? null;
}
