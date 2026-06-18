export const SIDEBAR_OVERLAY_BREAKPOINT = 640;
export const THREAD_MAIN_CONTENT_MIN_WIDTH = 400;
export const THREAD_SIDEBAR_DEFAULT_WIDTH_CSS = "16rem";
export const THREAD_SIDEBAR_MIN_WIDTH = 12 * 16;
export const THREAD_SIDEBAR_MIN_WIDTH_CSS = "12rem";
export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";

const THREAD_MAIN_CONTENT_MIN_WIDTH_CSS = `${THREAD_MAIN_CONTENT_MIN_WIDTH}px`;

export function getResponsiveThreadSidebarWidth(
  maxWidth: number | string = THREAD_SIDEBAR_DEFAULT_WIDTH_CSS,
): string {
  const maxWidthCss = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  return [
    `clamp(${THREAD_SIDEBAR_MIN_WIDTH_CSS}`,
    `calc(100vw - ${THREAD_MAIN_CONTENT_MIN_WIDTH_CSS})`,
    `${maxWidthCss})`,
  ].join(", ");
}
