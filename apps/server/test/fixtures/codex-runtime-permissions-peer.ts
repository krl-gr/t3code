let nextServerRequestId = 10_000;
let pendingPermissionsRequestId: number | string | null = null;
let turnInterruptReceived = false;
const resolvedRequestIdMode = process.env.T3_CODEX_TEST_RESOLVED_REQUEST_ID_MODE;

const PROVIDER_THREAD_ID = "provider-thread-permissions";
const TURN_ID = "turn-permissions";
const PERMISSIONS_ITEM_ID = "item-permissions-request";

const requestedPermissions = {
  fileSystem: {
    read: ["/tmp/project"],
    write: ["/tmp/project/src"],
  },
  network: {
    enabled: true,
  },
};

const writeMessage = (message: unknown) => {
  process.stdout.write(`${JSON.stringify(message)}\n`);
};

const respond = (id: number | string, result: unknown) => {
  writeMessage({ id, result });
};

const respondError = (id: number | string, code: number, message: string) => {
  writeMessage({
    id,
    error: {
      code,
      message,
    },
  });
};

const sendRequest = (method: string, params: unknown) => {
  const id = nextServerRequestId++;
  writeMessage({ id, method, params });
  return id;
};

const sendNotification = (method: string, params: unknown) => {
  writeMessage({ method, params });
};

const threadStartResponse = () => ({
  approvalPolicy: "never",
  approvalsReviewer: "user",
  cwd: "/tmp/project",
  model: "gpt-5.3-codex",
  modelProvider: "openai",
  sandbox: { type: "dangerFullAccess" },
  thread: {
    cliVersion: "0.0.0-test",
    createdAt: 1_778_000_000,
    cwd: "/tmp/project",
    ephemeral: false,
    id: PROVIDER_THREAD_ID,
    modelProvider: "openai",
    preview: "permissions test",
    sessionId: "session-permissions",
    source: "appServer",
    status: { type: "idle" },
    turns: [],
    updatedAt: 1_778_000_000,
  },
});

const sendPermissionsRequest = () => {
  pendingPermissionsRequestId = sendRequest("item/permissions/requestApproval", {
    cwd: "/tmp/project",
    itemId: PERMISSIONS_ITEM_ID,
    permissions: requestedPermissions,
    reason: "Need broader release-test permissions.",
    threadId: PROVIDER_THREAD_ID,
    turnId: TURN_ID,
  });
};

const handleMethod = (message: Record<string, unknown>) => {
  const method = message.method;
  if (typeof method !== "string") {
    return;
  }

  switch (method) {
    case "initialize": {
      respond(message.id as number | string, {
        codexHome: "/tmp/project/.codex",
        platformFamily: process.platform === "win32" ? "windows" : "unix",
        platformOs: process.platform === "darwin" ? "macos" : process.platform,
        userAgent: "mock-codex-runtime-permissions",
      });
      return;
    }
    case "initialized": {
      return;
    }
    case "thread/start": {
      respond(message.id as number | string, threadStartResponse());
      return;
    }
    case "turn/start": {
      respond(message.id as number | string, {
        turn: {
          id: TURN_ID,
          items: [],
          status: "inProgress",
        },
      });
      setTimeout(sendPermissionsRequest, 0);
      return;
    }
    case "turn/interrupt": {
      turnInterruptReceived = true;
      respond(message.id as number | string, {});
      return;
    }
    default: {
      if (message.id !== undefined) {
        respondError(message.id as number | string, -32601, `Unhandled request: ${method}`);
      }
    }
  }
};

const handleResponse = (message: Record<string, unknown>) => {
  if (message.id !== pendingPermissionsRequestId) {
    return;
  }

  const resolvedRequestId =
    resolvedRequestIdMode === "item-id" ? PERMISSIONS_ITEM_ID : pendingPermissionsRequestId;
  if (resolvedRequestId === null) {
    return;
  }
  pendingPermissionsRequestId = null;
  sendNotification("serverRequest/resolved", {
    requestId: resolvedRequestId,
    threadId: PROVIDER_THREAD_ID,
  });
  sendNotification("item/agentMessage/delta", {
    delta: JSON.stringify({
      interrupted: turnInterruptReceived,
      result: message.result,
    }),
    itemId: "item-permissions-result",
    threadId: PROVIDER_THREAD_ID,
    turnId: TURN_ID,
  });
};

let remainder = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  remainder += chunk;
  const lines = remainder.split("\n");
  remainder = lines.pop() ?? "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const message = JSON.parse(trimmed) as Record<string, unknown>;
    if ("method" in message) {
      handleMethod(message);
      continue;
    }
    if ("id" in message) {
      handleResponse(message);
    }
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
