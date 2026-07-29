export interface TimelineScrollSnapshot {
  readonly anchorRowId: string | null;
  readonly anchorOffset: number;
  readonly fallbackOffset: number;
  readonly isAtEnd: boolean;
}

interface TimelinePositionState {
  readonly data: ReadonlyArray<{ readonly id?: unknown }>;
  readonly scroll?: number;
  readonly positionAtIndex?: (index: number) => number | undefined;
  readonly sizeAtIndex?: (index: number) => number | undefined;
}

/**
 * Capture a semantic top-row anchor rather than only scrollTop. Row heights can
 * change while a workspace tab is hidden as markdown, images, and diffs settle.
 */
export function captureTimelineScrollSnapshot(
  state: TimelinePositionState | undefined,
  isAtEnd: boolean,
): TimelineScrollSnapshot | null {
  const scroll = state?.scroll;
  if (!state || typeof scroll !== "number" || !Number.isFinite(scroll)) {
    return null;
  }

  if (isAtEnd) {
    return {
      anchorRowId: null,
      anchorOffset: 0,
      fallbackOffset: scroll,
      isAtEnd: true,
    };
  }

  for (let index = 0; index < state.data.length; index += 1) {
    const top = state.positionAtIndex?.(index);
    const size = state.sizeAtIndex?.(index);
    if (
      typeof top !== "number" ||
      !Number.isFinite(top) ||
      typeof size !== "number" ||
      !Number.isFinite(size)
    ) {
      continue;
    }
    if (top + Math.max(1, size) <= scroll) {
      continue;
    }

    const id = state.data[index]?.id;
    return {
      anchorRowId: typeof id === "string" ? id : null,
      anchorOffset: Math.max(0, scroll - top),
      fallbackOffset: scroll,
      isAtEnd: false,
    };
  }

  return {
    anchorRowId: null,
    anchorOffset: 0,
    fallbackOffset: scroll,
    isAtEnd: false,
  };
}

export function resolveTimelineRestoreOffset(
  state: TimelinePositionState | undefined,
  snapshot: TimelineScrollSnapshot,
): number | null {
  if (!state || snapshot.isAtEnd) {
    return null;
  }

  if (snapshot.anchorRowId !== null) {
    const anchorIndex = state.data.findIndex((row) => row.id === snapshot.anchorRowId);
    if (anchorIndex >= 0) {
      const anchorTop = state.positionAtIndex?.(anchorIndex);
      if (typeof anchorTop === "number" && Number.isFinite(anchorTop)) {
        return Math.max(0, anchorTop + snapshot.anchorOffset);
      }
    }
  }

  return Math.max(0, snapshot.fallbackOffset);
}
