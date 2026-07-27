import { describe, expect, it } from "vite-plus/test";

import { isServerProjectFaviconFallbackUrl } from "./ProjectFavicon";

describe("isServerProjectFaviconFallbackUrl", () => {
  // The asset route now emits the shared PROJECT_FAVICON_FALLBACK_MARKER rather
  // than a filename-shaped placeholder.
  it("recognizes the signed server fallback asset", () => {
    expect(
      isServerProjectFaviconFallbackUrl(
        "http://localhost:13773/api/assets/token/project-favicon-missing",
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
