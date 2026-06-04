import { scopeProjectRef } from "@t3tools/client-runtime";
import type { EnvironmentId, ProjectId, ScopedProjectRef } from "@t3tools/contracts";
import type { DraftThreadEnvMode } from "../composerDraftStore";
import {
  createChatWorkspaceDraftThread,
  type ChatWorkspaceOpenDisposition,
} from "../workspace/chatWorkspaceController";

interface ThreadContextLike {
  environmentId: EnvironmentId;
  projectId: ProjectId;
  branch: string | null;
  worktreePath: string | null;
}

interface DraftThreadContextLike extends ThreadContextLike {
  envMode: DraftThreadEnvMode;
}

interface NewThreadHandler {
  (
    projectRef: ScopedProjectRef,
    options?: {
      branch?: string | null;
      worktreePath?: string | null;
      envMode?: DraftThreadEnvMode;
      forceNewDraft?: boolean;
    },
  ): Promise<void>;
}

type NewThreadOptions = NonNullable<Parameters<NewThreadHandler>[1]>;

interface WorkspaceNewThreadHandlerInput {
  readonly handleNewThread: NewThreadHandler;
  readonly options?: NewThreadOptions;
  readonly projectRef: ScopedProjectRef;
}

export interface ChatThreadActionContext {
  readonly activeDraftThread: DraftThreadContextLike | null;
  readonly activeThread: ThreadContextLike | undefined;
  readonly defaultProjectRef: ScopedProjectRef | null;
  readonly defaultThreadEnvMode: DraftThreadEnvMode;
  readonly handleNewThread: NewThreadHandler;
}

export function resolveThreadActionProjectRef(
  context: ChatThreadActionContext,
): ScopedProjectRef | null {
  if (context.activeThread) {
    return scopeProjectRef(context.activeThread.environmentId, context.activeThread.projectId);
  }
  if (context.activeDraftThread) {
    return scopeProjectRef(
      context.activeDraftThread.environmentId,
      context.activeDraftThread.projectId,
    );
  }
  return context.defaultProjectRef;
}

interface StartThreadActionOptions {
  readonly forceNewDraft?: boolean;
}

export function buildContextualThreadOptions(
  context: ChatThreadActionContext,
  options?: StartThreadActionOptions,
): NewThreadOptions {
  return {
    branch: context.activeThread?.branch ?? context.activeDraftThread?.branch ?? null,
    worktreePath:
      context.activeThread?.worktreePath ?? context.activeDraftThread?.worktreePath ?? null,
    envMode:
      context.activeDraftThread?.envMode ??
      (context.activeThread?.worktreePath ? "worktree" : "local"),
    ...(options?.forceNewDraft ? { forceNewDraft: true } : {}),
  };
}

function buildDefaultThreadOptions(context: ChatThreadActionContext): NewThreadOptions {
  return {
    envMode: context.defaultThreadEnvMode,
  };
}

export async function startNewThreadInProjectFromContext(
  context: ChatThreadActionContext,
  projectRef: ScopedProjectRef,
  options?: StartThreadActionOptions,
): Promise<void> {
  await context.handleNewThread(projectRef, buildContextualThreadOptions(context, options));
}

async function startNewThreadWithWorkspaceDisposition(
  input: WorkspaceNewThreadHandlerInput,
  disposition: Extract<ChatWorkspaceOpenDisposition, "active-panel" | "new-panel">,
) {
  const options: NewThreadOptions = {
    ...input.options,
    forceNewDraft: true,
  };
  const createdDraftThread = createChatWorkspaceDraftThread({
    projectRef: input.projectRef,
    options,
    disposition,
  });
  if (createdDraftThread) {
    return true;
  }

  await input.handleNewThread(input.projectRef, options);
  return true;
}

export async function startNewThreadInWorkspacePanel(input: WorkspaceNewThreadHandlerInput) {
  return startNewThreadWithWorkspaceDisposition(input, "new-panel");
}

export async function startNewThreadInActiveWorkspacePanel(input: WorkspaceNewThreadHandlerInput) {
  return startNewThreadWithWorkspaceDisposition(input, "active-panel");
}

export async function startNewThreadInProjectWorkspacePanelFromContext(
  context: ChatThreadActionContext,
  projectRef: ScopedProjectRef,
  options?: StartThreadActionOptions,
): Promise<boolean> {
  return startNewThreadInWorkspacePanel({
    handleNewThread: context.handleNewThread,
    projectRef,
    options: buildContextualThreadOptions(context, { ...options, forceNewDraft: true }),
  });
}

export async function startNewLocalThreadInWorkspacePanelFromContext(
  context: ChatThreadActionContext,
): Promise<boolean> {
  const projectRef = resolveThreadActionProjectRef(context);
  if (!projectRef) {
    return false;
  }

  return startNewThreadInWorkspacePanel({
    handleNewThread: context.handleNewThread,
    projectRef,
    options: buildDefaultThreadOptions(context),
  });
}

export async function startNewThreadInWorkspacePanelFromContext(
  context: ChatThreadActionContext,
  options?: StartThreadActionOptions,
): Promise<boolean> {
  const projectRef = resolveThreadActionProjectRef(context);
  if (!projectRef) {
    return false;
  }

  return startNewThreadInProjectWorkspacePanelFromContext(context, projectRef, options);
}

export async function startNewThreadFromContext(
  context: ChatThreadActionContext,
  options?: StartThreadActionOptions,
): Promise<boolean> {
  const projectRef = resolveThreadActionProjectRef(context);
  if (!projectRef) {
    return false;
  }

  await startNewThreadInProjectFromContext(context, projectRef, options);
  return true;
}

export async function startNewLocalThreadFromContext(
  context: ChatThreadActionContext,
): Promise<boolean> {
  const projectRef = resolveThreadActionProjectRef(context);
  if (!projectRef) {
    return false;
  }

  await context.handleNewThread(projectRef, buildDefaultThreadOptions(context));
  return true;
}
