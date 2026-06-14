export type ThreadActivityRequestKind = "command" | "file-read" | "file-change" | "dynamic-tool";

export interface ThreadActivityPresentationInput {
  readonly kind: string;
  readonly summary: string;
  readonly tone: "info" | "tool" | "approval" | "error";
  readonly payload: unknown;
}

export interface ThreadActivityPresentation {
  readonly label: string;
  readonly detail?: string | undefined;
  readonly requestKind?: ThreadActivityRequestKind | undefined;
  readonly severity?: "warning" | undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asTrimmedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEquivalentValue(value: string | undefined): string | undefined {
  const trimmed = asTrimmedString(value);
  if (!trimmed) {
    return undefined;
  }
  return trimmed
    .replace(/\s+/gu, " ")
    .replace(/\s+(?:complete|completed|started)\s*$/iu, "")
    .trim();
}

function isEquivalent(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeEquivalentValue(left)?.toLowerCase();
  const normalizedRight = normalizeEquivalentValue(right)?.toLowerCase();
  return normalizedLeft !== undefined && normalizedLeft === normalizedRight;
}

function nonDuplicativeDetail(
  detail: string | undefined,
  ...labels: ReadonlyArray<string | undefined>
): string | undefined {
  if (!detail) {
    return undefined;
  }
  return labels.some((label) => isEquivalent(detail, label)) ? undefined : detail;
}

function requestKindFromRequestType(value: unknown): ThreadActivityRequestKind | undefined {
  switch (value) {
    case "command_execution_approval":
    case "exec_command_approval":
      return "command";
    case "file_read_approval":
      return "file-read";
    case "file_change_approval":
    case "apply_patch_approval":
      return "file-change";
    case "dynamic_tool_call":
      return "dynamic-tool";
    default:
      return undefined;
  }
}

function extractRequestKind(payload: Record<string, unknown> | undefined) {
  if (
    payload?.requestKind === "command" ||
    payload?.requestKind === "file-read" ||
    payload?.requestKind === "file-change" ||
    payload?.requestKind === "dynamic-tool"
  ) {
    return payload.requestKind;
  }
  return requestKindFromRequestType(payload?.requestType);
}

function requestKindDetail(value: ThreadActivityRequestKind): string {
  switch (value) {
    case "command":
      return "command";
    case "file-read":
      return "file read";
    case "file-change":
      return "file change";
    case "dynamic-tool":
      return "computer action";
  }
}

function approvalRequestedLabel(requestKind: ThreadActivityRequestKind | undefined): string {
  switch (requestKind) {
    case "command":
      return "Command approval requested";
    case "file-read":
      return "File read approval requested";
    case "file-change":
      return "File change approval requested";
    case "dynamic-tool":
      return "Computer action approval requested";
    default:
      return "Approval requested";
  }
}

function approvalResolvedLabel(decision: unknown): string {
  switch (decision) {
    case "accept":
      return "Approval accepted";
    case "acceptForSession":
      return "Approval accepted for session";
    case "decline":
      return "Approval declined";
    case "cancel":
      return "Approval canceled";
    default:
      return "Approval resolved";
  }
}

function formatCount(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function firstUserInputQuestionDetail(payload: Record<string, unknown> | undefined) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : undefined;
  if (!questions) {
    return undefined;
  }
  const firstQuestion = asRecord(questions[0]);
  const firstQuestionText =
    asTrimmedString(firstQuestion?.header) ??
    asTrimmedString(firstQuestion?.label) ??
    asTrimmedString(firstQuestion?.question);
  return firstQuestionText ?? formatCount(questions.length, "question", "questions");
}

function userInputAnswerCountDetail(payload: Record<string, unknown> | undefined) {
  const answers = asRecord(payload?.answers);
  if (!answers) {
    return undefined;
  }
  return formatCount(Object.keys(answers).length, "answer", "answers");
}

export function deriveThreadActivityPresentation(
  input: ThreadActivityPresentationInput,
): ThreadActivityPresentation {
  const payload = asRecord(input.payload);
  const requestKind = extractRequestKind(payload);

  switch (input.kind) {
    case "runtime.warning": {
      const label = input.summary === "Runtime warning" ? "Runtime warning" : input.summary;
      const detail = nonDuplicativeDetail(
        asTrimmedString(payload?.detail) ?? asTrimmedString(payload?.message),
        label,
        "Runtime warning",
      );
      return {
        label,
        ...(detail ? { detail } : {}),
        severity: "warning",
      };
    }

    case "runtime.error": {
      const detail = nonDuplicativeDetail(
        asTrimmedString(payload?.message) ?? asTrimmedString(payload?.detail),
        "Runtime error",
      );
      return {
        label: "Runtime error",
        ...(detail ? { detail } : {}),
      };
    }

    case "approval.requested": {
      const label = approvalRequestedLabel(requestKind);
      const detail = nonDuplicativeDetail(
        asTrimmedString(payload?.detail) ?? asTrimmedString(payload?.requestType),
        label,
      );
      return {
        label,
        ...(detail ? { detail } : {}),
        ...(requestKind ? { requestKind } : {}),
      };
    }

    case "approval.resolved": {
      const label = approvalResolvedLabel(payload?.decision);
      const detail = nonDuplicativeDetail(
        requestKind ? requestKindDetail(requestKind) : asTrimmedString(payload?.requestType),
        label,
      );
      return {
        label,
        ...(detail ? { detail } : {}),
        ...(requestKind ? { requestKind } : {}),
      };
    }

    case "user-input.requested": {
      const detail = nonDuplicativeDetail(
        firstUserInputQuestionDetail(payload),
        "User input requested",
      );
      return {
        label: "User input requested",
        ...(detail ? { detail } : {}),
      };
    }

    case "user-input.resolved": {
      const detail = nonDuplicativeDetail(
        userInputAnswerCountDetail(payload),
        "User input submitted",
      );
      return {
        label: "User input submitted",
        ...(detail ? { detail } : {}),
      };
    }

    case "turn.plan.updated": {
      const detail = nonDuplicativeDetail(asTrimmedString(payload?.explanation), "Plan updated");
      return {
        label: "Plan updated",
        ...(detail ? { detail } : {}),
      };
    }

    default: {
      const detail = nonDuplicativeDetail(
        asTrimmedString(payload?.detail) ?? asTrimmedString(payload?.message),
        input.summary,
      );
      return {
        label: input.summary,
        ...(detail ? { detail } : {}),
        ...(requestKind ? { requestKind } : {}),
      };
    }
  }
}
