export const RIGHT_PANEL_GLOBAL_SHEET_MAX_VIEWPORT_WIDTH_PX = 480;
export const RIGHT_PANEL_GLOBAL_SHEET_MEDIA_QUERY = `(max-width: ${RIGHT_PANEL_GLOBAL_SHEET_MAX_VIEWPORT_WIDTH_PX}px)`;

export const RIGHT_PANEL_CHAT_MIN_WIDTH_PX = 240;
export const RIGHT_PANEL_MIN_WIDTH_PX = 360;
export const RIGHT_PANEL_DEFAULT_WIDTH_PX = 540;
export const RIGHT_PANEL_MAX_WIDTH_PX = 1400;
export const RIGHT_PANEL_MAX_WIDTH_FRACTION = 0.7;

export const RIGHT_PANEL_LOCAL_OVERLAY_ENTER_WIDTH_PX =
  RIGHT_PANEL_CHAT_MIN_WIDTH_PX + RIGHT_PANEL_MIN_WIDTH_PX;
export const RIGHT_PANEL_LOCAL_OVERLAY_EXIT_WIDTH_PX =
  RIGHT_PANEL_LOCAL_OVERLAY_ENTER_WIDTH_PX + 24;

export type RightPanelLayoutMode = "inline" | "local-overlay" | "sheet";

export function resolveRightPanelLayoutMode(input: {
  containerWidth: number;
  previousMode: RightPanelLayoutMode;
  viewportUsesSheet: boolean;
}): RightPanelLayoutMode {
  if (input.viewportUsesSheet) return "sheet";

  const containerWidth = Math.max(0, input.containerWidth);
  if (input.previousMode === "local-overlay") {
    return containerWidth <= RIGHT_PANEL_LOCAL_OVERLAY_EXIT_WIDTH_PX ? "local-overlay" : "inline";
  }

  return containerWidth < RIGHT_PANEL_LOCAL_OVERLAY_ENTER_WIDTH_PX ? "local-overlay" : "inline";
}

export function resolveInlineRightPanelMaxWidth(containerWidth: number): number {
  const availableWidth = Math.max(0, Math.floor(containerWidth));
  return Math.max(
    RIGHT_PANEL_MIN_WIDTH_PX,
    Math.min(
      RIGHT_PANEL_MAX_WIDTH_PX,
      Math.floor(availableWidth * RIGHT_PANEL_MAX_WIDTH_FRACTION),
      availableWidth - RIGHT_PANEL_CHAT_MIN_WIDTH_PX,
    ),
  );
}

export const RIGHT_PANEL_SHEET_CLASS_NAME =
  "w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0 max-[480px]:w-[min(88vw,24rem)] max-[480px]:min-w-0 wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]";
