import { describe, expect, it } from "vitest";

import { evaluateBrowserPolicy, isBrowserOriginAllowed } from "./BrowserPolicy.ts";

const allowedOrigins = ["https://x.com", "https://www.linkedin.com"];

describe("BrowserPolicy", () => {
  it("allows search/read/scroll/screenshot on allowlisted origins", () => {
    for (const action of ["search", "extract_text", "scroll", "screenshot"] as const) {
      expect(
        evaluateBrowserPolicy({
          action,
          currentUrl: "https://x.com/home",
          allowedOrigins,
        }).allowed,
      ).toBe(true);
    }
  });

  it("blocks mutating or sensitive click targets", () => {
    for (const text of [
      "Post",
      "Like",
      "Follow",
      "Send message",
      "Upload file",
      "Password",
      "Payment card",
    ]) {
      const decision = evaluateBrowserPolicy({
        action: "click",
        currentUrl: "https://x.com/home",
        text,
        allowedOrigins,
      });
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("mutating");
    }
  });

  it("blocks non-allowlisted origins", () => {
    expect(isBrowserOriginAllowed("https://example.com", allowedOrigins)).toBe(false);
    expect(
      evaluateBrowserPolicy({
        action: "navigate",
        url: "https://example.com",
        allowedOrigins,
      }),
    ).toMatchObject({
      allowed: false,
      origin: "https://example.com",
    });
  });
});
