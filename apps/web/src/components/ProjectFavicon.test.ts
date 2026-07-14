import { describe, expect, it } from "vite-plus/test";

import { isServerProjectFaviconFallbackUrl } from "./ProjectFavicon";

describe("isServerProjectFaviconFallbackUrl", () => {
  it("recognizes the signed server fallback asset", () => {
    expect(
      isServerProjectFaviconFallbackUrl(
        "http://localhost:13773/api/assets/token/__upcomputer_project_favicon_fallback__.svg",
      ),
    ).toBe(true);
  });

  it("keeps real project favicons", () => {
    expect(
      isServerProjectFaviconFallbackUrl("http://localhost:13773/api/assets/token/favicon.svg"),
    ).toBe(false);
    expect(
      isServerProjectFaviconFallbackUrl("http://localhost:13773/api/assets/token/icon.png"),
    ).toBe(false);
  });
});
