import { describe, expect, it } from "vitest";

import { deriveThreadActivityPresentation } from "./threadActivityPresentation.ts";

describe("threadActivityPresentation", () => {
  it("uses runtime warning summary messages as the label", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "runtime.warning",
        summary: "MCP server disconnected",
        tone: "info",
        payload: {
          message: "MCP server disconnected",
        },
      }),
    ).toEqual({
      label: "MCP server disconnected",
      severity: "warning",
    });
  });

  it("uses runtime warning payload message as detail when summary is generic", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "runtime.warning",
        summary: "Runtime warning",
        tone: "info",
        payload: {
          message: "MCP server disconnected",
        },
      }),
    ).toEqual({
      label: "Runtime warning",
      detail: "MCP server disconnected",
      severity: "warning",
    });
  });

  it("prefers runtime warning detail over message", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "runtime.warning",
        summary: "Runtime warning",
        tone: "info",
        payload: {
          message: "MCP server disconnected",
          detail: "Reconnect failed after 3 attempts",
        },
      }),
    ).toEqual({
      label: "Runtime warning",
      detail: "Reconnect failed after 3 attempts",
      severity: "warning",
    });
  });

  it("uses runtime error message as detail", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "runtime.error",
        summary: "Runtime error",
        tone: "error",
        payload: {
          message: "Failed to start Codex app-server",
        },
      }),
    ).toEqual({
      label: "Runtime error",
      detail: "Failed to start Codex app-server",
    });
  });

  it("labels approval requests by request kind", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "approval.requested",
        summary: "Approval requested",
        tone: "approval",
        payload: {
          requestKind: "file-change",
          detail: "Patch apps/web/src/session-logic.ts",
        },
      }),
    ).toEqual({
      label: "File change approval requested",
      detail: "Patch apps/web/src/session-logic.ts",
      requestKind: "file-change",
    });
  });

  it("labels permission approval requests", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "approval.requested",
        summary: "Approval requested",
        tone: "approval",
        payload: {
          requestType: "permissions_approval",
          detail: "Allow network access",
        },
      }),
    ).toEqual({
      label: "Permission approval requested",
      detail: "Allow network access",
      requestKind: "permissions",
    });
  });

  it("labels approval resolutions by decision", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "approval.resolved",
        summary: "Approval resolved",
        tone: "approval",
        payload: {
          requestKind: "command",
          decision: "acceptForSession",
        },
      }),
    ).toEqual({
      label: "Approval accepted for session",
      detail: "command",
      requestKind: "command",
    });
  });

  it("summarizes user input request and response payloads", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "user-input.requested",
        summary: "User input requested",
        tone: "info",
        payload: {
          questions: [
            {
              id: "sandbox",
              header: "Sandbox",
              question: "Which sandbox should be used?",
            },
          ],
        },
      }),
    ).toEqual({
      label: "User input requested",
      detail: "Sandbox",
    });

    expect(
      deriveThreadActivityPresentation({
        kind: "user-input.resolved",
        summary: "User input submitted",
        tone: "info",
        payload: {
          answers: {
            sandbox: "workspace-write",
            approval: "on-request",
          },
        },
      }),
    ).toEqual({
      label: "User input submitted",
      detail: "2 answers",
    });
  });

  it("keeps provider failure labels and exposes detail", () => {
    expect(
      deriveThreadActivityPresentation({
        kind: "provider.approval.respond.failed",
        summary: "Provider approval response failed",
        tone: "error",
        payload: {
          detail: "No active provider session is bound to this thread.",
        },
      }),
    ).toEqual({
      label: "Provider approval response failed",
      detail: "No active provider session is bound to this thread.",
    });
  });
});
