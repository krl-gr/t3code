import * as Equal from "effect/Equal";
import { type TimelineEntry, type WorkLogEntry } from "../../session-logic";
import { type ChatMessage, type ProposedPlan, type TurnDiffSummary } from "../../types";
import { type MessageId, type TurnId } from "@t3tools/contracts";

export interface TimelineDurationMessage {
  id: string;
  role: "user" | "assistant" | "system";
  createdAt: string;
  completedAt?: string | undefined;
}

export type WorkTimelineRow = {
  kind: "work";
  id: string;
  createdAt: string;
  groupedEntries: WorkLogEntry[];
};

export type MessageTimelineRow = {
  kind: "message";
  id: string;
  createdAt: string;
  message: ChatMessage;
  durationStart: string;
  showCompletionDivider: boolean;
  completionSummary: string | null;
  showAssistantCopyButton: boolean;
  assistantCopyStreaming: boolean;
  assistantTurnDiffSummary?: TurnDiffSummary | undefined;
  revertTurnCount?: number | undefined;
};

export type ProposedPlanTimelineRow = {
  kind: "proposed-plan";
  id: string;
  createdAt: string;
  proposedPlan: ProposedPlan;
};

export type WorkingTimelineRow = { kind: "working"; id: string; createdAt: string | null };

export type BaseMessagesTimelineRow =
  | WorkTimelineRow
  | MessageTimelineRow
  | ProposedPlanTimelineRow
  | WorkingTimelineRow;

export type ProcessTimelineChildRow = WorkTimelineRow | MessageTimelineRow | WorkingTimelineRow;

export type ProcessTimelineRow = {
  kind: "process";
  id: string;
  createdAt: string;
  turnId: TurnId | null;
  children: ProcessTimelineChildRow[];
  startedAt: string | null;
  completedAt: string | null;
  completionSummary: string | null;
  isActive: boolean;
  hasErrorEntries: boolean;
};

export type MessagesTimelineRow = BaseMessagesTimelineRow | ProcessTimelineRow;

export interface StableMessagesTimelineRowsState {
  byId: Map<string, MessagesTimelineRow>;
  result: MessagesTimelineRow[];
}

export function computeMessageDurationStart(
  messages: ReadonlyArray<TimelineDurationMessage>,
): Map<string, string> {
  const result = new Map<string, string>();
  let lastBoundary: string | null = null;

  for (const message of messages) {
    if (message.role === "user") {
      lastBoundary = message.createdAt;
    }
    result.set(message.id, lastBoundary ?? message.createdAt);
    if (message.role === "assistant" && message.completedAt) {
      lastBoundary = message.completedAt;
    }
  }

  return result;
}

export function normalizeCompactToolLabel(value: string): string {
  return value.replace(/\s+(?:complete|completed)\s*$/i, "").trim();
}

export function resolveAssistantMessageCopyState({
  text,
  showCopyButton,
  streaming,
}: {
  text: string | null;
  showCopyButton: boolean;
  streaming: boolean;
}) {
  const hasText = text !== null && text.trim().length > 0;
  return {
    text: hasText ? text : null,
    visible: showCopyButton && hasText && !streaming,
  };
}

function deriveTerminalAssistantMessageIds(timelineEntries: ReadonlyArray<TimelineEntry>) {
  const lastAssistantMessageIdByResponseKey = new Map<string, string>();
  let nullTurnResponseIndex = 0;

  for (const timelineEntry of timelineEntries) {
    if (timelineEntry.kind !== "message") {
      continue;
    }
    const { message } = timelineEntry;
    if (message.role === "user") {
      nullTurnResponseIndex += 1;
      continue;
    }
    if (message.role !== "assistant") {
      continue;
    }

    const responseKey = message.turnId
      ? `turn:${message.turnId}`
      : `unkeyed:${nullTurnResponseIndex}`;
    lastAssistantMessageIdByResponseKey.set(responseKey, message.id);
  }

  return new Set(lastAssistantMessageIdByResponseKey.values());
}

export function deriveMessagesTimelineRows(input: {
  timelineEntries: ReadonlyArray<TimelineEntry>;
  completionDividerBeforeEntryId: string | null;
  completionSummary?: string | null;
  isWorking: boolean;
  activeTurnInProgress?: boolean;
  activeTurnId?: TurnId | null;
  activeTurnStartedAt: string | null;
  turnDiffSummaryByAssistantMessageId: ReadonlyMap<MessageId, TurnDiffSummary>;
  revertTurnCountByUserMessageId: ReadonlyMap<MessageId, number>;
}): MessagesTimelineRow[] {
  const baseRows: BaseMessagesTimelineRow[] = [];
  const durationStartByMessageId = computeMessageDurationStart(
    input.timelineEntries.flatMap((entry) => (entry.kind === "message" ? [entry.message] : [])),
  );
  const terminalAssistantMessageIds = deriveTerminalAssistantMessageIds(input.timelineEntries);

  for (let index = 0; index < input.timelineEntries.length; index += 1) {
    const timelineEntry = input.timelineEntries[index];
    if (!timelineEntry) {
      continue;
    }

    if (timelineEntry.kind === "work") {
      const groupedEntries = [timelineEntry.entry];
      let cursor = index + 1;
      while (cursor < input.timelineEntries.length) {
        const nextEntry = input.timelineEntries[cursor];
        if (!nextEntry || nextEntry.kind !== "work") break;
        groupedEntries.push(nextEntry.entry);
        cursor += 1;
      }
      baseRows.push({
        kind: "work",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        groupedEntries,
      });
      index = cursor - 1;
      continue;
    }

    if (timelineEntry.kind === "proposed-plan") {
      baseRows.push({
        kind: "proposed-plan",
        id: timelineEntry.id,
        createdAt: timelineEntry.createdAt,
        proposedPlan: timelineEntry.proposedPlan,
      });
      continue;
    }

    const assistantTurnStillInProgress =
      timelineEntry.message.role === "assistant" &&
      input.activeTurnInProgress === true &&
      input.activeTurnId != null &&
      timelineEntry.message.turnId === input.activeTurnId;

    const showCompletionDivider =
      timelineEntry.message.role === "assistant" &&
      input.completionDividerBeforeEntryId === timelineEntry.id;

    baseRows.push({
      kind: "message",
      id: timelineEntry.id,
      createdAt: timelineEntry.createdAt,
      message: timelineEntry.message,
      durationStart:
        durationStartByMessageId.get(timelineEntry.message.id) ?? timelineEntry.message.createdAt,
      showCompletionDivider,
      completionSummary: showCompletionDivider ? (input.completionSummary ?? null) : null,
      showAssistantCopyButton:
        timelineEntry.message.role === "assistant" &&
        terminalAssistantMessageIds.has(timelineEntry.message.id),
      assistantCopyStreaming: timelineEntry.message.streaming || assistantTurnStillInProgress,
      assistantTurnDiffSummary:
        timelineEntry.message.role === "assistant"
          ? input.turnDiffSummaryByAssistantMessageId.get(timelineEntry.message.id)
          : undefined,
      revertTurnCount:
        timelineEntry.message.role === "user"
          ? input.revertTurnCountByUserMessageId.get(timelineEntry.message.id)
          : undefined,
    });
  }

  return deriveProcessTimelineRows(baseRows, input);
}

function deriveProcessTimelineRows(
  baseRows: ReadonlyArray<BaseMessagesTimelineRow>,
  input: {
    completionSummary?: string | null;
    isWorking: boolean;
    activeTurnInProgress?: boolean;
    activeTurnId?: TurnId | null;
    activeTurnStartedAt: string | null;
  },
): MessagesTimelineRow[] {
  const result: MessagesTimelineRow[] = [];
  const workingRow: WorkingTimelineRow | null = input.isWorking && input.activeTurnId != null
    ? {
        kind: "working",
        id: "working-indicator-row",
        createdAt: input.activeTurnStartedAt,
      }
    : null;
  let workingRowConsumed = false;
  let previousBoundaryCreatedAt: string | null = null;
  let pendingChildren: ProcessTimelineChildRow[] = [];
  let pendingStartedAt: string | null = null;

  const appendProcessChild = (row: ProcessTimelineChildRow) => {
    if (pendingChildren.length === 0) {
      pendingStartedAt = resolveProcessStartedAt(row, previousBoundaryCreatedAt, input);
    }
    pendingChildren.push(row);
  };

  const appendWorkingChild = () => {
    if (!workingRow || workingRowConsumed) {
      return;
    }
    appendProcessChild(workingRow);
    workingRowConsumed = true;
  };

  const flushProcess = (
    terminalRow?: MessageTimelineRow | ProposedPlanTimelineRow,
  ): ProcessTimelineRow | null => {
    if (pendingChildren.length === 0) {
      return null;
    }

    const firstChild = pendingChildren[0];
    const turnId = resolveProcessTurnId(pendingChildren, terminalRow, input.activeTurnId ?? null);
    const isActive =
      pendingChildren.some((child) => child.kind === "working") ||
      (input.activeTurnInProgress === true &&
        input.activeTurnId != null &&
        turnId === input.activeTurnId);
    const completedAt = isActive ? null : resolveTerminalCompletedAt(terminalRow);
    const completionSummary =
      !isActive && turnId != null && turnId === input.activeTurnId
        ? (input.completionSummary ?? null)
        : null;
    const processRow: ProcessTimelineRow = {
      kind: "process",
      id: deriveProcessRowId(turnId, firstChild),
      createdAt: firstChild?.createdAt ?? pendingStartedAt ?? terminalRow?.createdAt ?? "",
      turnId,
      children: pendingChildren,
      startedAt: pendingStartedAt,
      completedAt,
      completionSummary,
      isActive,
      hasErrorEntries: pendingChildren.some(hasProcessChildErrorEntry),
    };

    pendingChildren = [];
    pendingStartedAt = null;
    return processRow;
  };

  for (const row of baseRows) {
    if (row.kind === "message" && row.message.role === "user") {
      const processRow = flushProcess();
      if (processRow) {
        result.push(processRow);
      }
      result.push(row);
      previousBoundaryCreatedAt = row.message.createdAt;
      continue;
    }

    if (row.kind === "work") {
      appendProcessChild(row);
      continue;
    }

    if (row.kind === "message" && row.message.role === "assistant") {
      if (isActiveAssistantProcessChild(row, input)) {
        appendProcessChild(suppressCompletionDivider(row));
        continue;
      }

      if (!row.showAssistantCopyButton) {
        appendProcessChild(row);
        continue;
      }

      const processRow = flushProcess(row);
      if (processRow) {
        result.push(processRow);
      }
      result.push(processRow && row.showCompletionDivider ? suppressCompletionDivider(row) : row);
      previousBoundaryCreatedAt = row.message.completedAt ?? row.message.createdAt;
      continue;
    }

    if (row.kind === "proposed-plan") {
      const processRow = flushProcess(row);
      if (processRow) {
        result.push(processRow);
      }
      result.push(row);
      previousBoundaryCreatedAt = row.proposedPlan.updatedAt ?? row.proposedPlan.createdAt;
      continue;
    }

    const processRow = flushProcess();
    if (processRow) {
      result.push(processRow);
    }
    result.push(row);
  }

  appendWorkingChild();
  const finalProcessRow = flushProcess();
  if (finalProcessRow) {
    result.push(finalProcessRow);
  }

  return result;
}

function resolveProcessStartedAt(
  row: ProcessTimelineChildRow,
  previousBoundaryCreatedAt: string | null,
  input: {
    isWorking: boolean;
    activeTurnId?: TurnId | null;
    activeTurnStartedAt: string | null;
  },
): string | null {
  const rowTurnId = resolveProcessChildTurnId(row);
  if (
    input.activeTurnStartedAt &&
    (row.kind === "working" ||
      (input.activeTurnId != null && rowTurnId != null && rowTurnId === input.activeTurnId) ||
      (input.isWorking && row.kind === "message" && rowTurnId == null) ||
      (input.isWorking && row.kind === "work"))
  ) {
    return input.activeTurnStartedAt;
  }
  return previousBoundaryCreatedAt ?? row.createdAt ?? input.activeTurnStartedAt;
}

function resolveProcessTurnId(
  children: ReadonlyArray<ProcessTimelineChildRow>,
  terminalRow: MessageTimelineRow | ProposedPlanTimelineRow | undefined,
  activeTurnId: TurnId | null,
): TurnId | null {
  const terminalTurnId = resolveTerminalTurnId(terminalRow);
  if (terminalTurnId) {
    return terminalTurnId;
  }

  for (const child of children) {
    const childTurnId = resolveProcessChildTurnId(child);
    if (childTurnId) {
      return childTurnId;
    }
  }

  if (
    activeTurnId &&
    children.some(
      (child) =>
        child.kind === "working" ||
        child.kind === "work" ||
        (child.kind === "message" && child.message.turnId == null),
    )
  ) {
    return activeTurnId;
  }

  return null;
}

function resolveTerminalTurnId(
  row: MessageTimelineRow | ProposedPlanTimelineRow | undefined,
): TurnId | null {
  if (!row) {
    return null;
  }
  if (row.kind === "message") {
    return row.message.turnId ?? null;
  }
  return row.proposedPlan.turnId ?? null;
}

function resolveProcessChildTurnId(row: ProcessTimelineChildRow): TurnId | null {
  if (row.kind !== "message") {
    return null;
  }
  return row.message.turnId ?? null;
}

function resolveTerminalCompletedAt(
  row: MessageTimelineRow | ProposedPlanTimelineRow | undefined,
): string | null {
  if (!row) {
    return null;
  }
  if (row.kind === "message") {
    return row.message.completedAt ?? (row.message.streaming ? null : row.message.createdAt);
  }
  return row.proposedPlan.updatedAt ?? row.proposedPlan.createdAt;
}

function deriveProcessRowId(
  turnId: TurnId | null,
  firstChild: ProcessTimelineChildRow | undefined,
): string {
  return turnId ? `process:turn:${turnId}` : `process:${firstChild?.id ?? "unknown"}`;
}

function isActiveAssistantProcessChild(
  row: MessageTimelineRow,
  input: {
    activeTurnInProgress?: boolean;
    activeTurnId?: TurnId | null;
    activeTurnStartedAt: string | null;
  },
): boolean {
  if (input.activeTurnInProgress !== true) {
    return false;
  }

  if (input.activeTurnId != null && row.message.turnId === input.activeTurnId) {
    return true;
  }

  return (
    row.message.turnId == null &&
    ((input.activeTurnStartedAt != null &&
      isAtOrAfterTimestamp(row.createdAt, input.activeTurnStartedAt)) ||
      row.message.streaming)
  );
}

function isAtOrAfterTimestamp(value: string, boundary: string): boolean {
  const valueMs = Date.parse(value);
  const boundaryMs = Date.parse(boundary);

  if (Number.isFinite(valueMs) && Number.isFinite(boundaryMs)) {
    return valueMs >= boundaryMs;
  }

  return value >= boundary;
}

function suppressCompletionDivider(row: MessageTimelineRow): MessageTimelineRow {
  return {
    ...row,
    showCompletionDivider: false,
    completionSummary: null,
  };
}

function hasProcessChildErrorEntry(row: ProcessTimelineChildRow): boolean {
  return row.kind === "work" && row.groupedEntries.some((entry) => entry.tone === "error");
}

export function computeStableMessagesTimelineRows(
  rows: MessagesTimelineRow[],
  previous: StableMessagesTimelineRowsState,
): StableMessagesTimelineRowsState {
  const next = new Map<string, MessagesTimelineRow>();
  let anyChanged = rows.length !== previous.byId.size;

  const result = rows.map((row, index) => {
    const prevRow = previous.byId.get(row.id);
    const nextRow = prevRow && isRowUnchanged(prevRow, row) ? prevRow : row;
    next.set(row.id, nextRow);
    if (!anyChanged && previous.result[index] !== nextRow) {
      anyChanged = true;
    }
    return nextRow;
  });

  return anyChanged ? { byId: next, result } : previous;
}

function areMessagesRenderEquivalent(a: ChatMessage, b: ChatMessage): boolean {
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.text === b.text &&
    (a.role === "user" || (a.turnId ?? null) === (b.turnId ?? null)) &&
    a.createdAt === b.createdAt &&
    (a.role !== "assistant" || (a.completedAt ?? null) === (b.completedAt ?? null)) &&
    a.streaming === b.streaming &&
    areAttachmentsRenderEquivalent(a.attachments, b.attachments)
  );
}

function areAttachmentsRenderEquivalent(
  a: ChatMessage["attachments"],
  b: ChatMessage["attachments"],
): boolean {
  if (a === b) return true;
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    const leftAttachment = left[index];
    const rightAttachment = right[index];
    if (!leftAttachment || !rightAttachment) return false;
    if (
      leftAttachment.type !== rightAttachment.type ||
      leftAttachment.id !== rightAttachment.id ||
      leftAttachment.name !== rightAttachment.name ||
      leftAttachment.mimeType !== rightAttachment.mimeType ||
      leftAttachment.sizeBytes !== rightAttachment.sizeBytes ||
      (leftAttachment.previewUrl ?? null) !== (rightAttachment.previewUrl ?? null)
    ) {
      return false;
    }
  }

  return true;
}

function areProcessChildrenUnchanged(
  a: readonly ProcessTimelineChildRow[],
  b: readonly ProcessTimelineChildRow[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (!left || !right || !isProcessChildUnchanged(left, right)) {
      return false;
    }
  }

  return true;
}

function isProcessChildUnchanged(
  a: ProcessTimelineChildRow,
  b: ProcessTimelineChildRow,
): boolean {
  if (a.kind !== b.kind || a.id !== b.id || a.createdAt !== b.createdAt) return false;

  switch (a.kind) {
    case "working":
      return true;
    case "work":
      return Equal.equals(a.groupedEntries, (b as typeof a).groupedEntries);
    case "message": {
      const bm = b as typeof a;
      return (
        areMessagesRenderEquivalent(a.message, bm.message) &&
        a.durationStart === bm.durationStart &&
        a.showCompletionDivider === bm.showCompletionDivider &&
        a.completionSummary === bm.completionSummary &&
        a.showAssistantCopyButton === bm.showAssistantCopyButton &&
        a.assistantCopyStreaming === bm.assistantCopyStreaming &&
        a.assistantTurnDiffSummary === bm.assistantTurnDiffSummary &&
        a.revertTurnCount === bm.revertTurnCount
      );
    }
  }
}

/** Shallow field comparison per row variant — avoids deep equality cost. */
function isRowUnchanged(a: MessagesTimelineRow, b: MessagesTimelineRow): boolean {
  if (a.kind !== b.kind || a.id !== b.id) return false;

  switch (a.kind) {
    case "working":
      return a.createdAt === (b as typeof a).createdAt;

    case "proposed-plan":
      return a.proposedPlan === (b as typeof a).proposedPlan;

    case "work":
      return Equal.equals(a.groupedEntries, (b as typeof a).groupedEntries);

    case "process": {
      const bp = b as typeof a;
      return (
        a.createdAt === bp.createdAt &&
        a.turnId === bp.turnId &&
        a.startedAt === bp.startedAt &&
        a.completedAt === bp.completedAt &&
        a.completionSummary === bp.completionSummary &&
        a.isActive === bp.isActive &&
        a.hasErrorEntries === bp.hasErrorEntries &&
        areProcessChildrenUnchanged(a.children, bp.children)
      );
    }

    case "message": {
      const bm = b as typeof a;
      return (
        a.createdAt === bm.createdAt &&
        areMessagesRenderEquivalent(a.message, bm.message) &&
        a.durationStart === bm.durationStart &&
        a.showCompletionDivider === bm.showCompletionDivider &&
        a.completionSummary === bm.completionSummary &&
        a.showAssistantCopyButton === bm.showAssistantCopyButton &&
        a.assistantCopyStreaming === bm.assistantCopyStreaming &&
        a.assistantTurnDiffSummary === bm.assistantTurnDiffSummary &&
        a.revertTurnCount === bm.revertTurnCount
      );
    }
  }
}
