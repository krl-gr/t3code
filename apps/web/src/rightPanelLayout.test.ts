import { describe, expect, it } from "vite-plus/test";

import {
  RIGHT_PANEL_CHAT_MIN_WIDTH_PX,
  RIGHT_PANEL_LOCAL_OVERLAY_ENTER_WIDTH_PX,
  RIGHT_PANEL_LOCAL_OVERLAY_EXIT_WIDTH_PX,
  RIGHT_PANEL_MAX_WIDTH_PX,
  RIGHT_PANEL_MIN_WIDTH_PX,
  resolveInlineRightPanelMaxWidth,
  resolveRightPanelLayoutMode,
} from "./rightPanelLayout";

describe("right panel layout", () => {
  it("uses the global sheet only for a narrow viewport", () => {
    expect(
      resolveRightPanelLayoutMode({
        containerWidth: 1_200,
        previousMode: "inline",
        viewportUsesSheet: true,
      }),
    ).toBe("sheet");
  });

  it("uses a local overlay when only the owning chat container is narrow", () => {
    expect(
      resolveRightPanelLayoutMode({
        containerWidth: RIGHT_PANEL_LOCAL_OVERLAY_ENTER_WIDTH_PX - 1,
        previousMode: "inline",
        viewportUsesSheet: false,
      }),
    ).toBe("local-overlay");
  });

  it("keeps inline layout at the local overlay boundary", () => {
    expect(
      resolveRightPanelLayoutMode({
        containerWidth: RIGHT_PANEL_LOCAL_OVERLAY_ENTER_WIDTH_PX,
        previousMode: "inline",
        viewportUsesSheet: false,
      }),
    ).toBe("inline");
  });

  it("uses hysteresis before restoring an overlaid panel inline", () => {
    expect(
      resolveRightPanelLayoutMode({
        containerWidth: RIGHT_PANEL_LOCAL_OVERLAY_EXIT_WIDTH_PX,
        previousMode: "local-overlay",
        viewportUsesSheet: false,
      }),
    ).toBe("local-overlay");
    expect(
      resolveRightPanelLayoutMode({
        containerWidth: RIGHT_PANEL_LOCAL_OVERLAY_EXIT_WIDTH_PX + 1,
        previousMode: "local-overlay",
        viewportUsesSheet: false,
      }),
    ).toBe("inline");
  });

  it("reserves the minimum chat width inside an inline split container", () => {
    const containerWidth = 1_000;
    const panelMaxWidth = resolveInlineRightPanelMaxWidth(containerWidth);

    expect(containerWidth - panelMaxWidth).toBeGreaterThanOrEqual(RIGHT_PANEL_CHAT_MIN_WIDTH_PX);
  });

  it("limits an inline panel to seventy percent of its container", () => {
    expect(resolveInlineRightPanelMaxWidth(1_200)).toBe(840);
  });

  it("keeps the inline panel within its absolute bounds", () => {
    expect(resolveInlineRightPanelMaxWidth(500)).toBe(RIGHT_PANEL_MIN_WIDTH_PX);
    expect(resolveInlineRightPanelMaxWidth(4_000)).toBe(RIGHT_PANEL_MAX_WIDTH_PX);
  });
});
