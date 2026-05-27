// @effect-diagnostics nodeBuiltinImport:off
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";

import {
  browserScreenshotDirectoryName,
  browserScreenshotFileName,
  extractBrowserScreenshotPayload,
  persistBrowserScreenshot,
  stripBrowserScreenshotPersistence,
} from "./BrowserScreenshotStore.ts";

describe("BrowserScreenshotStore", () => {
  it("builds Finder-friendly per-thread paths", () => {
    expect(
      browserScreenshotDirectoryName({
        threadTitle: "Check X profile latest post!",
        threadId: "thread.folder/unsafe space",
      }),
    ).toBe("check-x-profile-latest-post--thread-folder-unsafe-space");
    expect(
      browserScreenshotFileName({
        createdAt: "2026-05-26T14:22:10.382Z",
        origin: "https://www.x.com",
      }),
    ).toBe("2026-05-26_14-22-10-382_x-com.png");
  });

  it("extracts Pi browser screenshot tool payloads", () => {
    const payload = extractBrowserScreenshotPayload({
      content: [
        { type: "text", text: "Browser action completed: screenshot" },
        { type: "image", data: "YWJj", mimeType: "image/png" },
      ],
      details: {
        action: "screenshot",
        blocked: false,
        url: "https://x.com/krl_grn",
        origin: "https://x.com",
        screenshotBase64: "ignored",
        mimeType: "image/png",
      },
      isError: false,
    });

    expect(payload).toEqual({
      screenshotBase64: "YWJj",
      mimeType: "image/png",
      origin: "https://x.com",
      url: "https://x.com/krl_grn",
    });
  });

  it("extracts persistence-only browser action screenshots", () => {
    const payload = extractBrowserScreenshotPayload({
      content: [{ type: "text", text: "Browser action completed: search" }],
      details: {
        action: "search",
        blocked: false,
        url: "https://x.com/krl_grn",
        origin: "https://x.com",
      },
      persistenceScreenshot: {
        data: "YWJj",
        mimeType: "image/png",
        origin: "https://x.com",
        url: "https://x.com/krl_grn",
      },
      isError: false,
    });

    expect(payload).toEqual({
      screenshotBase64: "YWJj",
      mimeType: "image/png",
      origin: "https://x.com",
      url: "https://x.com/krl_grn",
    });
  });

  it("strips persistence-only screenshots from activity payload data", () => {
    expect(
      stripBrowserScreenshotPersistence({
        content: [{ type: "text", text: "Browser action completed: search" }],
        details: { action: "search", blocked: false },
        persistenceScreenshot: { data: "YWJj", mimeType: "image/png" },
        isError: false,
      }),
    ).toEqual({
      content: [{ type: "text", text: "Browser action completed: search" }],
      details: { action: "search", blocked: false },
      isError: false,
    });
  });

  it("persists screenshots and reuses the existing thread folder after title changes", async () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3-browser-screenshots-"));
    try {
      const first = await Effect.runPromise(
        persistBrowserScreenshot({
          stateDir,
          threadTitle: "Initial Title",
          threadId: "thread-1",
          createdAt: "2026-05-26T14:22:10.382Z",
          origin: "https://x.com",
          screenshotBase64: Buffer.from("first").toString("base64"),
          mimeType: "image/png",
        }).pipe(Effect.provide(NodeServices.layer)),
      );
      const second = await Effect.runPromise(
        persistBrowserScreenshot({
          stateDir,
          threadTitle: "Renamed Later",
          threadId: "thread-1",
          createdAt: "2026-05-26T14:23:10.382Z",
          origin: "https://example.com",
          screenshotBase64: Buffer.from("second").toString("base64"),
          mimeType: "image/png",
        }).pipe(Effect.provide(NodeServices.layer)),
      );

      expect(first?.directoryPath).toBe(second?.directoryPath);
      expect(first?.directoryPath).toBe(
        path.join(stateDir, "browser-screenshots", "initial-title--thread-1"),
      );
      expect(fs.readFileSync(first!.filePath, "utf8")).toBe("first");
      expect(fs.readFileSync(second!.filePath, "utf8")).toBe("second");
    } finally {
      fs.rmSync(stateDir, { recursive: true, force: true });
    }
  });
});
