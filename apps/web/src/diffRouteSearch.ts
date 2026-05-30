import { TurnId } from "@t3tools/contracts";

export interface DiffRouteSearch {
  diff?: "1" | undefined;
  diffTurnId?: TurnId | undefined;
  diffFilePath?: string | undefined;
}

export type DiffRouteSearchUpdater =
  | DiffRouteSearch
  | ((previous: DiffRouteSearch) => DiffRouteSearch);

export function closedDiffRouteSearch(): DiffRouteSearch {
  return {
    diff: undefined,
    diffTurnId: undefined,
    diffFilePath: undefined,
  };
}

function isDiffOpenValue(value: unknown): boolean {
  return value === "1" || value === 1 || value === true;
}

function normalizeSearchString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

export function stripDiffSearchParams<T extends Record<string, unknown>>(
  params: T,
): Omit<T, "diff" | "diffTurnId" | "diffFilePath"> {
  const { diff: _diff, diffTurnId: _diffTurnId, diffFilePath: _diffFilePath, ...rest } = params;
  return rest as Omit<T, "diff" | "diffTurnId" | "diffFilePath">;
}

export function parseDiffRouteSearch(search: Record<string, unknown>): DiffRouteSearch {
  const diff = isDiffOpenValue(search.diff) ? "1" : undefined;
  const diffTurnIdRaw = diff ? normalizeSearchString(search.diffTurnId) : undefined;
  const diffTurnId = diffTurnIdRaw ? TurnId.make(diffTurnIdRaw) : undefined;
  const diffFilePath = diff && diffTurnId ? normalizeSearchString(search.diffFilePath) : undefined;

  return {
    ...(diff ? { diff } : {}),
    ...(diffTurnId ? { diffTurnId } : {}),
    ...(diffFilePath ? { diffFilePath } : {}),
  };
}

export function diffRouteSearchForNavigation(search: DiffRouteSearch): DiffRouteSearch {
  const parsed = parseDiffRouteSearch({ ...search });
  if (parsed.diff !== "1") {
    return closedDiffRouteSearch();
  }
  return {
    diff: "1",
    diffTurnId: parsed.diffTurnId,
    diffFilePath: parsed.diffFilePath,
  };
}
