import { describe, expect, it } from "vite-plus/test";

import { buildContextLinkInsertion, workspaceRelativeContextPath } from "./composerAttachmentPaths";

describe("workspaceRelativeContextPath", () => {
  it("returns workspace-relative files and folders", () => {
    expect(workspaceRelativeContextPath("/workspace", "/workspace/src/index.ts")).toBe(
      "src/index.ts",
    );
    expect(workspaceRelativeContextPath("/workspace/", "/workspace/docs/")).toBe("docs");
    expect(workspaceRelativeContextPath("/workspace", "/workspace")).toBe(".");
  });

  it("rejects paths outside the workspace", () => {
    expect(workspaceRelativeContextPath("/workspace", "/workspace-other/file.ts")).toBeNull();
    expect(workspaceRelativeContextPath("/workspace", "/tmp/file.ts")).toBeNull();
  });

  it("normalizes Windows separators and compares drive paths case-insensitively", () => {
    expect(workspaceRelativeContextPath("C:\\Repo", "c:\\repo\\src\\index.ts")).toBe(
      "src/index.ts",
    );
  });
});

describe("buildContextLinkInsertion", () => {
  it("creates composer links and preserves surrounding prompt spacing", () => {
    expect(buildContextLinkInsertion(["src/index.ts", "docs/My File.md"], 5, "check")).toBe(
      " [index.ts](src/index.ts) [My File.md](docs/My%20File.md) ",
    );
    expect(buildContextLinkInsertion(["src"], 0, " explain")).toBe("[src](src)");
  });
});
