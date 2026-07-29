import { describe, expect, it } from "vite-plus/test";
import {
  captureTimelineScrollSnapshot,
  resolveTimelineRestoreOffset,
} from "./timelineScrollPersistence";

function state(rows: Array<{ id: string; top: number; size: number }>, scroll: number) {
  return {
    data: rows.map(({ id }) => ({ id })),
    scroll,
    positionAtIndex: (index: number) => rows[index]?.top,
    sizeAtIndex: (index: number) => rows[index]?.size,
  };
}

describe("timeline scroll persistence", () => {
  it("captures the first visible row and its local offset", () => {
    const snapshot = captureTimelineScrollSnapshot(
      state(
        [
          { id: "row-a", top: 0, size: 100 },
          { id: "row-b", top: 100, size: 200 },
        ],
        145,
      ),
      false,
    );

    expect(snapshot).toEqual({
      anchorRowId: "row-b",
      anchorOffset: 45,
      fallbackOffset: 145,
      isAtEnd: false,
    });
  });

  it("restores against the anchor's new position when preceding rows resize", () => {
    const snapshot = {
      anchorRowId: "row-b",
      anchorOffset: 45,
      fallbackOffset: 145,
      isAtEnd: false,
    } as const;

    expect(
      resolveTimelineRestoreOffset(
        state(
          [
            { id: "row-a", top: 0, size: 180 },
            { id: "row-b", top: 180, size: 200 },
          ],
          0,
        ),
        snapshot,
      ),
    ).toBe(225);
  });

  it("falls back to the absolute offset when the anchor row disappeared", () => {
    const snapshot = {
      anchorRowId: "missing",
      anchorOffset: 20,
      fallbackOffset: 320,
      isAtEnd: false,
    } as const;

    expect(
      resolveTimelineRestoreOffset(state([{ id: "row-a", top: 0, size: 100 }], 0), snapshot),
    ).toBe(320);
  });

  it("leaves end-pinned snapshots to initialScrollAtEnd", () => {
    const snapshot = captureTimelineScrollSnapshot(
      state([{ id: "row-a", top: 0, size: 100 }], 0),
      true,
    );
    expect(snapshot?.isAtEnd).toBe(true);
    expect(
      resolveTimelineRestoreOffset(state([{ id: "row-a", top: 0, size: 100 }], 0), snapshot!),
    ).toBeNull();
  });
});
