import { describe, expect, it } from "vitest";

import {
  getPiToolTitle,
  mapPiToolNameToItemType,
  mapPiToolNameToRequestType,
  PI_BROWSER_TOOL_NAMES,
  PI_FULL_TOOL_NAMES,
  PI_PLAN_TOOL_NAMES,
  summarizePiToolArgs,
} from "./piHarness.ts";

describe("piHarness browser tool mapping", () => {
  it("includes browser tools in full and plan modes", () => {
    for (const toolName of PI_BROWSER_TOOL_NAMES) {
      expect(PI_FULL_TOOL_NAMES).toContain(toolName);
      expect(PI_PLAN_TOOL_NAMES).toContain(toolName);
    }
  });

  it("maps browser tools to dynamic tool item/request types", () => {
    for (const toolName of PI_BROWSER_TOOL_NAMES) {
      expect(mapPiToolNameToItemType(toolName)).toBe("dynamic_tool_call");
      expect(mapPiToolNameToRequestType(toolName)).toBe("dynamic_tool_call");
    }
  });

  it("provides readable browser tool titles and details", () => {
    expect(getPiToolTitle("browser_navigate")).toBe("Opened browser page");
    expect(getPiToolTitle("browser_search")).toBe("Searched browser");
    expect(getPiToolTitle("browser_click")).toBe("Clicked browser page");
    expect(getPiToolTitle("browser_extract_text")).toBe("Read browser page");
    expect(getPiToolTitle("browser_screenshot")).toBe("Captured screenshot");
    expect(summarizePiToolArgs("browser_navigate", { url: "https://x.com" })).toBe("https://x.com");
    expect(summarizePiToolArgs("browser_search", { query: "pi harness" })).toBe("pi harness");
  });
});
