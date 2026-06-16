import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { resolveNextHighlightedChatContextSourceId } from "./AttachChatContextPicker";

const threadOne = ThreadId.make("thread-1");
const threadTwo = ThreadId.make("thread-2");
const threadThree = ThreadId.make("thread-3");
const threadIds = [threadOne, threadTwo, threadThree] as const;
const candidates = threadIds.map((id) => ({ id }));

describe("resolveNextHighlightedChatContextSourceId", () => {
  it("starts at the first candidate when moving down without a current highlight", () => {
    expect(resolveNextHighlightedChatContextSourceId(candidates, null, "next")).toBe(threadIds[0]);
  });

  it("starts at the last candidate when moving up without a current highlight", () => {
    expect(resolveNextHighlightedChatContextSourceId(candidates, null, "previous")).toBe(
      threadIds[2],
    );
  });

  it("wraps keyboard navigation at both ends", () => {
    expect(resolveNextHighlightedChatContextSourceId(candidates, threadIds[2], "next")).toBe(
      threadIds[0],
    );
    expect(resolveNextHighlightedChatContextSourceId(candidates, threadIds[0], "previous")).toBe(
      threadIds[2],
    );
  });

  it("keeps an empty candidate list unhighlighted", () => {
    expect(resolveNextHighlightedChatContextSourceId([], threadIds[0], "next")).toBeNull();
  });
});
