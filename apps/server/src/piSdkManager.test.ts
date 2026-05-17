import { ProviderDriverKind, ThreadId, type ProviderSession } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { PiSdkManager } from "./piSdkManager.ts";

describe("PiSdkManager", () => {
  it("lists materialized sessions that are still in the starting map", async () => {
    const manager = new PiSdkManager({ stateDir: "C:/tmp/t3code-pi-test" });
    const threadId = ThreadId.make("pi-starting-thread");
    const sessionRecord: ProviderSession = {
      provider: ProviderDriverKind.make("pi"),
      status: "connecting",
      runtimeMode: "full-access",
      cwd: "C:/tmp/t3code-pi-test",
      model: "pi/default",
      threadId,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const managerInternals = manager as unknown as {
      readonly startingSessions: Map<ThreadId, { readonly sessionRecord: ProviderSession }>;
    };

    managerInternals.startingSessions.set(threadId, { sessionRecord });

    expect(await manager.hasSession(threadId)).toBe(true);
    expect(await manager.listSessions()).toEqual([sessionRecord]);
  });
});
