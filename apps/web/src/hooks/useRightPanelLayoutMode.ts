import { useLayoutEffect, useState } from "react";

import { resolveRightPanelLayoutMode, type RightPanelLayoutMode } from "../rightPanelLayout";

export function useRightPanelLayoutMode(
  element: HTMLElement | null,
  viewportUsesSheet: boolean,
): RightPanelLayoutMode {
  const [mode, setMode] = useState<RightPanelLayoutMode>(() =>
    viewportUsesSheet ? "sheet" : "inline",
  );

  useLayoutEffect(() => {
    if (!element) {
      setMode(viewportUsesSheet ? "sheet" : "inline");
      return;
    }

    const updateMode = (containerWidth: number) => {
      setMode((previousMode) =>
        resolveRightPanelLayoutMode({ containerWidth, previousMode, viewportUsesSheet }),
      );
    };

    updateMode(element.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateMode(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, viewportUsesSheet]);

  return mode;
}
