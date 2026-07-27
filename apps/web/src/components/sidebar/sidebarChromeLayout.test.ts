import { describe, expect, it } from "vite-plus/test";

import { resolveSidebarChromeHeaderLayout } from "./sidebarChromeLayout";

describe("resolveSidebarChromeHeaderLayout", () => {
  it("reserves the 52px macOS traffic-light header and hides the brand", () => {
    const layout = resolveSidebarChromeHeaderLayout({
      isElectron: true,
      platform: "MacIntel",
    });

    expect(layout.hideBrand).toBe(true);
    expect(layout.className).toContain("h-[52px]");
    expect(layout.className).toContain("pl-[90px]");
    expect(layout.className).not.toContain("wco:");
  });

  it("uses the native 40px window-controls overlay geometry on Windows", () => {
    const layout = resolveSidebarChromeHeaderLayout({
      isElectron: true,
      platform: "Win32",
    });

    expect(layout.hideBrand).toBe(false);
    expect(layout.className).toContain("h-[52px]");
    expect(layout.className).toContain("wco:h-[env(titlebar-area-height)]");
    expect(layout.className).toContain("wco:pl-[calc(env(titlebar-area-x)+1em)]");
  });

  it("keeps the web header independent of the host platform", () => {
    const layout = resolveSidebarChromeHeaderLayout({
      isElectron: false,
      platform: "MacIntel",
    });

    expect(layout.hideBrand).toBe(false);
    expect(layout.className).toBe("gap-3 px-3 py-2 sm:gap-2.5 sm:px-4 sm:py-3");
  });
});
