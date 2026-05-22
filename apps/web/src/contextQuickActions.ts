export const DEFAULT_CONTEXT_QUICK_ACTION_IDS = [
  "git.quick",
  "open.preferred",
  "terminal.toggle",
  "diff.toggle",
] as const;

export const CONTEXT_QUICK_ACTION_IDS = [
  ...DEFAULT_CONTEXT_QUICK_ACTION_IDS,
  "git.commit",
  "git.push",
  "git.pr",
] as const;

export type ContextQuickActionId = (typeof CONTEXT_QUICK_ACTION_IDS)[number];

const CONTEXT_QUICK_ACTION_ID_SET = new Set<string>(CONTEXT_QUICK_ACTION_IDS);

export function isContextQuickActionId(value: unknown): value is ContextQuickActionId {
  return typeof value === "string" && CONTEXT_QUICK_ACTION_ID_SET.has(value);
}

export function sanitizeContextQuickActionIds(value: unknown): ContextQuickActionId[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_CONTEXT_QUICK_ACTION_IDS];
  }

  const nextIds: ContextQuickActionId[] = [];
  for (const entry of value) {
    if (!isContextQuickActionId(entry) || nextIds.includes(entry)) {
      continue;
    }
    nextIds.push(entry);
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
