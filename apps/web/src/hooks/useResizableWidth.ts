import * as Schema from "effect/Schema";
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";

const WidthSchema = Schema.Finite;

export interface UseResizableWidthOptions {
  /** localStorage key the persisted width is stored under. */
  readonly storageKey: string;
  readonly defaultWidth: number;
  readonly minWidth: number;
  /** May be resolved lazily when the available width is owned by a resizable container. */
  readonly maxWidth: number | (() => number);
  /** Notifies layout owners while live pointer resizing is in progress. */
  readonly onResizeStateChange?: (resizing: boolean) => void;
  /**
   * Which edge of the host element carries the drag handle:
   *   - "left"  → panel grows leftward (right-anchored panels)
   *   - "right" → panel grows rightward (left-anchored panels)
   */
  readonly edge: "left" | "right";
}

export interface ResizableWidthHandlers {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
}

/**
 * Width state for a side-anchored panel resized via a drag handle on the
 * specified edge. Width is read from localStorage on mount and persisted on
 * drag-end (not on every rAF tick — would otherwise be ~60 writes/sec).
 *
 * The hook updates an internal `width` state during drag (so the panel
 * follows the cursor live) and only commits to localStorage when the user
 * lifts the pointer.
 */
export function useResizableWidth(options: UseResizableWidthOptions): {
  /** Width constrained by the currently available maximum. */
  readonly width: number;
  /** User-selected width before a transient container constraint is applied. */
  readonly preferredWidth: number;
  readonly handlers: ResizableWidthHandlers;
} {
  const { storageKey, defaultWidth, minWidth, maxWidth, edge, onResizeStateChange } = options;

  const clamp = useCallback(
    (value: number): number => {
      if (!Number.isFinite(value)) return defaultWidth;
      const resolvedMaxWidth = typeof maxWidth === "function" ? maxWidth() : maxWidth;
      return Math.max(minWidth, Math.min(resolvedMaxWidth, value));
    },
    [defaultWidth, maxWidth, minWidth],
  );

  // No cross-tab subscription: panel width is per-window state.
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === "undefined") return defaultWidth;
    try {
      const stored = getLocalStorageItem(storageKey, WidthSchema);
      return clamp(stored ?? defaultWidth);
    } catch (error) {
      console.error("Could not read persisted panel width.", error);
      return defaultWidth;
    }
  });

  const clampedWidth = clamp(width);

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    pending: number;
    rafId: number | null;
    target: HTMLElement;
  } | null>(null);
  const resizeEndFrameRef = useRef<number | null>(null);

  const scheduleResizeEnd = useCallback(() => {
    if (resizeEndFrameRef.current !== null) {
      cancelAnimationFrame(resizeEndFrameRef.current);
    }
    resizeEndFrameRef.current = requestAnimationFrame(() => {
      resizeEndFrameRef.current = null;
      if (dragStateRef.current === null) {
        onResizeStateChange?.(false);
      }
    });
  }, [onResizeStateChange]);

  const releasePointer = useCallback(
    (pointerId: number) => {
      const state = dragStateRef.current;
      if (!state) return;
      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId);
      }
      try {
        if (state.target.hasPointerCapture(pointerId)) {
          state.target.releasePointerCapture(pointerId);
        }
      } catch {
        // pointer may already be released; harmless.
      }
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      dragStateRef.current = null;
      // Keep resize anchoring active through the final committed width/layout.
      scheduleResizeEnd();
    },
    [scheduleResizeEnd],
  );

  useEffect(
    () => () => {
      const state = dragStateRef.current;
      if (state) {
        releasePointer(state.pointerId);
      }
      if (resizeEndFrameRef.current !== null) {
        cancelAnimationFrame(resizeEndFrameRef.current);
        resizeEndFrameRef.current = null;
      }
      onResizeStateChange?.(false);
    },
    [onResizeStateChange, releasePointer],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      if (resizeEndFrameRef.current !== null) {
        cancelAnimationFrame(resizeEndFrameRef.current);
        resizeEndFrameRef.current = null;
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      dragStateRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: clampedWidth,
        pending: clampedWidth,
        rafId: null,
        target,
      };
      onResizeStateChange?.(true);
    },
    [clampedWidth, onResizeStateChange],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      event.preventDefault();
      const delta = edge === "left" ? state.startX - event.clientX : event.clientX - state.startX;
      state.pending = clamp(state.startWidth + delta);
      if (state.rafId !== null) return;
      state.rafId = requestAnimationFrame(() => {
        const active = dragStateRef.current;
        if (!active) return;
        active.rafId = null;
        setWidth(active.pending);
      });
    },
    [clamp, edge],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      const finalWidth = clamp(state.pending);
      releasePointer(event.pointerId);
      // Commit once at drag-end to avoid 60Hz localStorage writes.
      try {
        setLocalStorageItem(storageKey, finalWidth, WidthSchema);
      } catch (error) {
        console.error("Could not persist panel width.", error);
      }
      setWidth(finalWidth);
    },
    [clamp, releasePointer, storageKey],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const state = dragStateRef.current;
      if (!state || state.pointerId !== event.pointerId) return;
      // Don't persist a cancelled drag; revert to the start width.
      releasePointer(event.pointerId);
      setWidth(state.startWidth);
    },
    [releasePointer],
  );

  return {
    width: clampedWidth,
    preferredWidth: width,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  };
}
