import { describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_CONTEXT_QUICK_ACTION_IDS,
  contextOpenEditorActionId,
  editorIdFromContextQuickActionId,
  isContextQuickActionId,
  sanitizeContextQuickActionIds,
  setContextQuickActionPinned,
} from "./contextQuickActions";

describe("context quick actions", () => {
  it("uses the UpComputer context-bar defaults", () => {
    expect(sanitizeContextQuickActionIds(undefined)).toEqual(DEFAULT_CONTEXT_QUICK_ACTION_IDS);
  });

  it("keeps valid actions in user order and removes duplicates", () => {
    expect(
      sanitizeContextQuickActionIds([
        "rightPanel.toggle",
        "git.push",
        "rightPanel.toggle",
        "unknown",
        "open.cursor",
      ]),
    ).toEqual(["rightPanel.toggle", "git.push", "open.cursor"]);
  });

  it("recognizes editor actions without accepting arbitrary open actions", () => {
    const cursorAction = contextOpenEditorActionId("cursor");
    expect(isContextQuickActionId(cursorAction)).toBe(true);
    expect(editorIdFromContextQuickActionId(cursorAction)).toBe("cursor");
    expect(isContextQuickActionId("open.not-an-editor")).toBe(false);
  });

  it("pins idempotently and unpins without reordering other actions", () => {
    const initial = sanitizeContextQuickActionIds(["git.quick", "terminal.toggle"]);
    expect(setContextQuickActionPinned(initial, "git.push", true)).toEqual([
      "git.quick",
      "terminal.toggle",
      "git.push",
    ]);
    expect(setContextQuickActionPinned(initial, "git.quick", true)).toEqual(initial);
    expect(setContextQuickActionPinned(initial, "git.quick", false)).toEqual(["terminal.toggle"]);
  });
});
