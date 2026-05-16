import { DEFAULT_SIDEBAR_VIEW_MODE, type SidebarViewMode } from "@t3tools/contracts/settings";

export const productConfig = {
  sidebar: {
    defaultViewMode: DEFAULT_SIDEBAR_VIEW_MODE satisfies SidebarViewMode,
    focusedProjectPreviewCount: 3,
  },
} as const;
