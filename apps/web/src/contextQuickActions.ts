import { EDITORS, type EditorId } from "@t3tools/contracts";

export type ContextOpenEditorActionId = `open.${EditorId}`;

export function contextOpenEditorActionId(editorId: EditorId): ContextOpenEditorActionId {
  return `open.${editorId}`;
}

const EDITOR_ID_SET = new Set<string>(EDITORS.map((editor) => editor.id));

export const DEFAULT_CONTEXT_QUICK_ACTION_IDS = [
  "git.quick",
  "open.cursor",
  "terminal.toggle",
  "diff.toggle",
] as const;

export const CONTEXT_NON_EDITOR_QUICK_ACTION_IDS = [
  "git.quick",
  "terminal.toggle",
  "diff.toggle",
  "git.commit",
  "git.push",
  "git.pr",
] as const;

export type ContextNonEditorQuickActionId = (typeof CONTEXT_NON_EDITOR_QUICK_ACTION_IDS)[number];
export type ContextQuickActionId = ContextNonEditorQuickActionId | ContextOpenEditorActionId;

export const CONTEXT_GIT_QUICK_ACTION_ORDER = [
  "git.quick",
  "git.commit",
  "git.push",
  "git.pr",
] as const satisfies ReadonlyArray<ContextNonEditorQuickActionId>;

export const CONTEXT_OPEN_EDITOR_QUICK_ACTION_ORDER = EDITORS.map((editor) =>
  contextOpenEditorActionId(editor.id),
);

export const CONTEXT_VIEW_QUICK_ACTION_ORDER = [
  "terminal.toggle",
  "diff.toggle",
] as const satisfies ReadonlyArray<ContextNonEditorQuickActionId>;

const CONTEXT_NON_EDITOR_QUICK_ACTION_ID_SET = new Set<string>(CONTEXT_NON_EDITOR_QUICK_ACTION_IDS);

export function isContextOpenEditorActionId(value: unknown): value is ContextOpenEditorActionId {
  if (typeof value !== "string" || !value.startsWith("open.")) {
    return false;
  }
  return EDITOR_ID_SET.has(value.slice("open.".length));
}

export function editorIdFromContextOpenEditorActionId(value: ContextOpenEditorActionId): EditorId {
  return value.slice("open.".length) as EditorId;
}

export function editorIdFromContextQuickActionId(value: ContextQuickActionId): EditorId | null {
  return isContextOpenEditorActionId(value) ? editorIdFromContextOpenEditorActionId(value) : null;
}

export function isContextQuickActionId(value: unknown): value is ContextQuickActionId {
  return (
    (typeof value === "string" && CONTEXT_NON_EDITOR_QUICK_ACTION_ID_SET.has(value)) ||
    isContextOpenEditorActionId(value)
  );
}

function normalizePersistedContextQuickActionId(value: unknown): ContextQuickActionId | null {
  if (value === "open.preferred") {
    return contextOpenEditorActionId("cursor");
  }
  return isContextQuickActionId(value) ? value : null;
}

export function sanitizeContextQuickActionIds(value: unknown): ContextQuickActionId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_CONTEXT_QUICK_ACTION_IDS];
  }

  const nextIds: ContextQuickActionId[] = [];
  for (const entry of value) {
    const actionId = normalizePersistedContextQuickActionId(entry);
    if (!actionId || nextIds.includes(actionId)) {
      continue;
    }
    nextIds.push(actionId);
  }
  return nextIds;
}

export function setContextQuickActionPinned(
  currentIds: readonly ContextQuickActionId[],
  actionId: ContextQuickActionId,
  pinned: boolean,
): ContextQuickActionId[] {
  const existingIds = currentIds.filter(isContextQuickActionId);
  const existingSet = new Set(existingIds);
  if (pinned) {
    return existingSet.has(actionId) ? existingIds : [...existingIds, actionId];
  }
  return existingIds.filter((id) => id !== actionId);
}
