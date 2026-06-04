import { describe, expect, it } from "vitest";

import { normalizeComputerUseBackendArgs } from "./ComputerUseBackendArgs.ts";

describe("normalizeComputerUseBackendArgs", () => {
  it("maps element targets to Open Computer Use snake_case arguments", () => {
    expect(
      normalizeComputerUseBackendArgs("click", {
        app: "Notes",
        windowId: "main",
        elementIndex: 18,
        button: "left",
      }),
    ).toEqual({
      app: "Notes",
      window_id: "main",
      element_index: 18,
      button: "left",
    });
  });

  it("maps set_value element targets without redacting the backend value", () => {
    expect(
      normalizeComputerUseBackendArgs("set_value", {
        app: "Notes",
        elementIndex: 18,
        value: "Updated text",
      }),
    ).toEqual({
      app: "Notes",
      element_index: 18,
      value: "Updated text",
    });
  });

  it("maps drag endpoints and duration to snake_case arguments", () => {
    expect(
      normalizeComputerUseBackendArgs("drag", {
        fromElementIndex: 1,
        toElementIndex: 2,
        fromX: 10,
        fromY: 20,
        toX: 30,
        toY: 40,
        durationMs: 250,
      }),
    ).toEqual({
      from_element_index: 1,
      to_element_index: 2,
      from_x: 10,
      from_y: 20,
      to_x: 30,
      to_y: 40,
      duration_ms: 250,
    });
  });

  it("maps screenshot state options to the backend schema", () => {
    expect(
      normalizeComputerUseBackendArgs("get_app_state", {
        app: "Notes",
        windowId: "main",
        includeScreenshot: true,
      }),
    ).toEqual({
      app: "Notes",
      window_id: "main",
      include_screenshot: true,
    });
  });

  it("converts shortcut modifiers into xdotool-style key syntax", () => {
    expect(
      normalizeComputerUseBackendArgs("press_key", {
        key: "a",
        modifiers: ["cmd"],
      }),
    ).toEqual({
      key: "super+a",
    });
    expect(
      normalizeComputerUseBackendArgs("press_key", {
        key: "c",
        modifiers: ["ctrl", "shift"],
      }),
    ).toEqual({
      key: "ctrl+shift+c",
    });
  });

  it("normalizes common JavaScript key names for Open Computer Use", () => {
    expect(normalizeComputerUseBackendArgs("press_key", { key: "ArrowRight" })).toEqual({
      key: "Right",
    });
    expect(normalizeComputerUseBackendArgs("press_key", { key: "Enter" })).toEqual({
      key: "Return",
    });
  });
});
