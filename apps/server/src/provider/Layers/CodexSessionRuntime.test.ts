import assert from "node:assert/strict";

import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { describe, it } from "vitest";
import { it as effectIt } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { ThreadId, type ProviderApprovalDecision, type ProviderEvent } from "@t3tools/contracts";
import * as CodexErrors from "effect-codex-app-server/errors";
import * as CodexRpc from "effect-codex-app-server/rpc";

import {
  CODEX_ASK_MODE_DEVELOPER_INSTRUCTIONS,
  CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
  CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
} from "../CodexDeveloperInstructions.ts";
import {
  buildTurnStartParams,
  isRecoverableThreadResumeError,
  makeCodexSessionRuntime,
  openCodexThread,
  type CodexSessionRuntimeShape,
} from "./CodexSessionRuntime.ts";
const isCodexAppServerRequestError = Schema.is(CodexErrors.CodexAppServerRequestError);

const permissionsPeerPath = Effect.map(Effect.service(Path.Path), (path) =>
  path.join(import.meta.dirname, "../../../test/fixtures/codex-runtime-permissions-peer.ts"),
);

function makeThreadOpenResponse(
  threadId: string,
): CodexRpc.ClientRequestResponsesByMethod["thread/start"] {
  return {
    cwd: "/tmp/project",
    model: "gpt-5.3-codex",
    modelProvider: "openai",
    approvalPolicy: "never",
    approvalsReviewer: "user",
    sandbox: { type: "danger-full-access" },
    thread: {
      id: threadId,
      createdAt: "2026-04-18T00:00:00.000Z",
      source: { session: "cli" },
      turns: [],
      status: {
        state: "idle",
        activeFlags: [],
      },
    },
  } as unknown as CodexRpc.ClientRequestResponsesByMethod["thread/start"];
}

function isPermissionsRequestEvent(
  event: ProviderEvent,
): event is ProviderEvent & { kind: "request"; requestKind: "permissions" } {
  return event.kind === "request" && event.requestKind === "permissions";
}

function isRelevantPermissionsNotification(event: ProviderEvent): boolean {
  return (
    event.kind === "notification" &&
    (event.method === "item/requestApproval/decision" ||
      event.method === "serverRequest/resolved" ||
      event.method === "item/agentMessage/delta")
  );
}

function permissionsResultFromEvents(events: ReadonlyArray<ProviderEvent>): {
  readonly interrupted: boolean;
  readonly result: unknown;
} {
  const resultEvent = events.find(
    (event) => event.kind === "notification" && event.method === "item/agentMessage/delta",
  );
  if (
    !resultEvent ||
    resultEvent.kind !== "notification" ||
    resultEvent.method !== "item/agentMessage/delta"
  ) {
    assert.fail("Expected permissions result notification");
  }
  return JSON.parse(resultEvent.textDelta ?? "{}") as {
    readonly interrupted: boolean;
    readonly result: unknown;
  };
}

function makePermissionsPeerSpawner(
  realSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  peerPath: string,
  peerCwd: string,
  resolvedRequestIdMode?: "item-id",
) {
  return ChildProcessSpawner.make(() =>
    realSpawner.spawn(
      ChildProcess.make("bun", ["run", peerPath], {
        cwd: peerCwd,
        env: {
          ...process.env,
          ...(resolvedRequestIdMode
            ? { T3_CODEX_TEST_RESOLVED_REQUEST_ID_MODE: resolvedRequestIdMode }
            : {}),
        },
        shell: process.platform === "win32",
      }),
    ),
  );
}

const runWithPermissionsPeer = <A, E, R>(
  test: (runtime: CodexSessionRuntimeShape) => Effect.Effect<A, E, R>,
  options: { readonly resolvedRequestIdMode?: "item-id" } = {},
) =>
  Effect.gen(function* () {
    const realSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const path = yield* Path.Path;
    const peerPath = yield* permissionsPeerPath;
    const peerSpawner = makePermissionsPeerSpawner(
      realSpawner,
      peerPath,
      path.dirname(peerPath),
      options.resolvedRequestIdMode,
    );

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const runtime = yield* makeCodexSessionRuntime({
          threadId: ThreadId.make("thread-permissions"),
          binaryPath: "codex",
          cwd: "/tmp/project",
          runtimeMode: "full-access",
        });
        yield* runtime.start();
        return yield* test(runtime);
      }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, peerSpawner)),
    );
  });

const exercisePermissionsApproval = (
  runtime: CodexSessionRuntimeShape,
  decision: ProviderApprovalDecision,
) =>
  Effect.gen(function* () {
    const requestFiber = yield* Stream.filter(
      runtime.events,
      isPermissionsRequestEvent,
    ).pipe(Stream.runHead, Effect.forkChild);

    yield* runtime.sendTurn({ input: "Need more permissions" });

    const requestOption = yield* Fiber.join(requestFiber);
    assert.equal(requestOption._tag, "Some");
    if (requestOption._tag !== "Some") {
      assert.fail("Expected permissions request event");
    }
    const request = requestOption.value;
    const requestId = request.requestId;
    if (requestId === undefined) {
      assert.fail("Expected permissions request id");
    }

    const notificationsFiber = yield* Stream.filter(
      runtime.events,
      isRelevantPermissionsNotification,
    ).pipe(Stream.take(3), Stream.runCollect, Effect.forkChild);

    yield* runtime.respondToRequest(requestId, decision);

    const notifications = Array.from(yield* Fiber.join(notificationsFiber));
    const decisionEvent = notifications.find(
      (event) => event.kind === "notification" && event.method === "item/requestApproval/decision",
    );
    const resolvedEvent = notifications.find(
      (event) => event.kind === "notification" && event.method === "serverRequest/resolved",
    );

    assert.equal(decisionEvent?.kind, "notification");
    assert.equal(decisionEvent?.requestId, requestId);
    assert.equal(decisionEvent?.requestKind, "permissions");
    assert.deepStrictEqual(decisionEvent?.payload, {
      requestId,
      requestKind: "permissions",
      decision,
    });
    assert.equal(resolvedEvent?.kind, "notification");
    assert.equal(resolvedEvent?.requestId, requestId);
    assert.equal(resolvedEvent?.requestKind, "permissions");

    return permissionsResultFromEvents(notifications);
  });

describe("buildTurnStartParams", () => {
  it("includes plan collaboration mode when requested", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        prompt: "Make a plan",
        model: "gpt-5.3-codex",
        effort: "medium",
        interactionMode: "plan",
      }),
    );

    assert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "never",
      sandboxPolicy: {
        type: "dangerFullAccess",
      },
      input: [
        {
          type: "text",
          text: "Make a plan",
        },
      ],
      model: "gpt-5.3-codex",
      effort: "medium",
      collaborationMode: {
        mode: "plan",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_PLAN_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("includes default collaboration mode and image attachments", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "auto-accept-edits",
        prompt: "Implement it",
        model: "gpt-5.3-codex",
        interactionMode: "default",
        attachments: [
          {
            type: "image",
            url: "data:image/png;base64,abc",
          },
        ],
      }),
    );

    assert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "on-request",
      sandboxPolicy: {
        type: "workspaceWrite",
      },
      input: [
        {
          type: "text",
          text: "Implement it",
        },
        {
          type: "image",
          url: "data:image/png;base64,abc",
        },
      ],
      model: "gpt-5.3-codex",
      collaborationMode: {
        mode: "default",
        settings: {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          developer_instructions: CODEX_DEFAULT_MODE_DEVELOPER_INSTRUCTIONS,
        },
      },
    });
  });

  it("maps ask interaction mode to upstream default collaboration mode", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "full-access",
        prompt: "Why is this failing?",
        model: "gpt-5.3-codex",
        interactionMode: "ask",
      }),
    );

    assert.equal(params.collaborationMode?.mode, "default");
    assert.equal(
      params.collaborationMode?.settings?.developer_instructions,
      CODEX_ASK_MODE_DEVELOPER_INSTRUCTIONS,
    );
    assert.match(
      params.collaborationMode?.settings?.developer_instructions ?? "",
      /Do not output `<proposed_plan>` or `<\/proposed_plan>` tags/,
    );
  });

  it("omits collaboration mode when interaction mode is absent", () => {
    const params = Effect.runSync(
      buildTurnStartParams({
        threadId: "provider-thread-1",
        runtimeMode: "approval-required",
        prompt: "Review",
      }),
    );

    assert.deepStrictEqual(params, {
      threadId: "provider-thread-1",
      approvalPolicy: "untrusted",
      sandboxPolicy: {
        type: "readOnly",
      },
      input: [
        {
          type: "text",
          text: "Review",
        },
      ],
    });
  });
});

describe("isRecoverableThreadResumeError", () => {
  it("matches missing thread errors", () => {
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Thread does not exist",
        }),
      ),
      true,
    );
  });

  it("ignores non-recoverable resume errors", () => {
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Permission denied",
        }),
      ),
      false,
    );
  });

  it("ignores unrelated missing-resource errors that do not mention threads", () => {
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Config file not found",
        }),
      ),
      false,
    );
    assert.equal(
      isRecoverableThreadResumeError(
        new CodexErrors.CodexAppServerRequestError({
          code: -32603,
          errorMessage: "Model does not exist",
        }),
      ),
      false,
    );
  });
});

describe("openCodexThread", () => {
  it("falls back to thread/start when resume fails recoverably", async () => {
    const calls: Array<{ method: "thread/start" | "thread/resume"; payload: unknown }> = [];
    const started = makeThreadOpenResponse("fresh-thread");
    const client = {
      request: <M extends "thread/start" | "thread/resume">(
        method: M,
        payload: CodexRpc.ClientRequestParamsByMethod[M],
      ) => {
        calls.push({ method, payload });
        if (method === "thread/resume") {
          return Effect.fail(
            new CodexErrors.CodexAppServerRequestError({
              code: -32603,
              errorMessage: "thread not found",
            }),
          );
        }
        return Effect.succeed(started as CodexRpc.ClientRequestResponsesByMethod[M]);
      },
    };

    const opened = await Effect.runPromise(
      openCodexThread({
        client,
        threadId: ThreadId.make("thread-1"),
        runtimeMode: "full-access",
        cwd: "/tmp/project",
        requestedModel: "gpt-5.3-codex",
        serviceTier: undefined,
        resumeThreadId: "stale-thread",
      }),
    );

    assert.equal(opened.thread.id, "fresh-thread");
    assert.deepStrictEqual(
      calls.map((call) => call.method),
      ["thread/resume", "thread/start"],
    );
  });

  it("propagates non-recoverable resume failures", async () => {
    const client = {
      request: <M extends "thread/start" | "thread/resume">(
        method: M,
        _payload: CodexRpc.ClientRequestParamsByMethod[M],
      ) => {
        if (method === "thread/resume") {
          return Effect.fail(
            new CodexErrors.CodexAppServerRequestError({
              code: -32603,
              errorMessage: "timed out waiting for server",
            }),
          );
        }
        return Effect.succeed(
          makeThreadOpenResponse("fresh-thread") as CodexRpc.ClientRequestResponsesByMethod[M],
        );
      },
    };

    await assert.rejects(
      Effect.runPromise(
        openCodexThread({
          client,
          threadId: ThreadId.make("thread-1"),
          runtimeMode: "full-access",
          cwd: "/tmp/project",
          requestedModel: "gpt-5.3-codex",
          serviceTier: undefined,
          resumeThreadId: "stale-thread",
        }),
      ),
      (error: unknown) =>
        isCodexAppServerRequestError(error) &&
        error.errorMessage === "timed out waiting for server",
    );
  });
});

effectIt.layer(NodeServices.layer)("CodexSessionRuntime permissions approvals", (it) => {
  it.effect("grants requested permissions for one turn when accepted", () =>
    runWithPermissionsPeer((runtime) =>
      Effect.gen(function* () {
        const result = yield* exercisePermissionsApproval(runtime, "accept");

        assert.deepStrictEqual(result, {
          interrupted: false,
          result: {
            permissions: {
              fileSystem: {
                read: ["/tmp/project"],
                write: ["/tmp/project/src"],
              },
              network: {
                enabled: true,
              },
            },
            scope: "turn",
          },
        });
      }),
    ),
  );

  it.effect("grants requested permissions for the session when accepted for session", () =>
    runWithPermissionsPeer((runtime) =>
      Effect.gen(function* () {
        const result = yield* exercisePermissionsApproval(runtime, "acceptForSession");

        assert.deepStrictEqual(result, {
          interrupted: false,
          result: {
            permissions: {
              fileSystem: {
                read: ["/tmp/project"],
                write: ["/tmp/project/src"],
              },
              network: {
                enabled: true,
              },
            },
            scope: "session",
          },
        });
      }),
    ),
  );

  it.effect("returns an empty turn-scoped grant when declined", () =>
    runWithPermissionsPeer((runtime) =>
      Effect.gen(function* () {
        const result = yield* exercisePermissionsApproval(runtime, "decline");

        assert.deepStrictEqual(result, {
          interrupted: false,
          result: {
            permissions: {},
            scope: "turn",
          },
        });
      }),
    ),
  );

  it.effect("interrupts the active turn before resolving a cancelled permissions approval", () =>
    runWithPermissionsPeer((runtime) =>
      Effect.gen(function* () {
        const result = yield* exercisePermissionsApproval(runtime, "cancel");

        assert.deepStrictEqual(result, {
          interrupted: true,
          result: {
            permissions: {},
            scope: "turn",
          },
        });
      }),
    ),
  );

  it.effect("keeps item-id resolved notifications correlated for legacy app-server builds", () =>
    runWithPermissionsPeer(
      (runtime) =>
        Effect.gen(function* () {
          const result = yield* exercisePermissionsApproval(runtime, "accept");

          assert.deepStrictEqual(result, {
            interrupted: false,
            result: {
              permissions: {
                fileSystem: {
                  read: ["/tmp/project"],
                  write: ["/tmp/project/src"],
                },
                network: {
                  enabled: true,
                },
              },
              scope: "turn",
            },
          });
        }),
      { resolvedRequestIdMode: "item-id" },
    ),
  );
});
