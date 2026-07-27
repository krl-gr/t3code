import { isMacPlatform } from "../../lib/utils";

const MACOS_DESKTOP_HEADER_CLASS = "drag-region h-[52px] flex-row items-center px-4 py-0 pl-[90px]";
const WINDOW_CONTROLS_OVERLAY_HEADER_CLASS =
  "drag-region h-[52px] flex-row items-center gap-2 px-4 py-0 pl-[90px] wco:h-[env(titlebar-area-height)] wco:pl-[calc(env(titlebar-area-x)+1em)]";
const WEB_HEADER_CLASS = "gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3";

export interface SidebarChromeHeaderLayout {
  readonly className: string;
  readonly hideBrand: boolean;
}

export function resolveSidebarChromeHeaderLayout(input: {
  readonly isElectron: boolean;
  readonly platform: string;
}): SidebarChromeHeaderLayout {
  if (!input.isElectron) {
    return { className: WEB_HEADER_CLASS, hideBrand: false };
  }

  if (isMacPlatform(input.platform)) {
    return { className: MACOS_DESKTOP_HEADER_CLASS, hideBrand: true };
  }

  return { className: WINDOW_CONTROLS_OVERLAY_HEADER_CLASS, hideBrand: false };
}
