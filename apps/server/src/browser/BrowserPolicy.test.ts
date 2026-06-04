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
          allowAllHttpsOrigins: false,
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
        allowAllHttpsOrigins: false,
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
        allowAllHttpsOrigins: false,
      }),
    ).toMatchObject({
      allowed: false,
      origin: "https://example.com",
    });
  });

  it("allows HTTPS and loopback HTTP targets in HTTPS-wide mode", () => {
    for (const url of [
      "https://example.com/path",
      "http://localhost:3000/path",
      "http://127.0.0.1:5173/path",
      "http://127.12.34.56/path",
      "http://[::1]:5173/path",
    ]) {
      expect(
        evaluateBrowserPolicy({
          action: "navigate",
          url,
          allowedOrigins: [],
          allowAllHttpsOrigins: true,
        }).allowed,
      ).toBe(true);
    }
  });

  it("rejects non-loopback HTTP and non-web schemes in HTTPS-wide mode", () => {
    for (const url of ["http://example.com/path", "file:///tmp/a.html", "chrome://settings"]) {
      const decision = evaluateBrowserPolicy({
        action: "navigate",
        url,
        allowedOrigins: [],
        allowAllHttpsOrigins: true,
      });
      expect(decision.allowed).toBe(false);
    }
  });

  it("still blocks mutating or sensitive click targets in HTTPS-wide mode", () => {
    const decision = evaluateBrowserPolicy({
      action: "click",
      currentUrl: "https://example.com/home",
      text: "Send message",
      allowedOrigins: [],
      allowAllHttpsOrigins: true,
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("mutating");
  });
});
