import { EnvironmentId, ThreadId, ThreadPromptDraftSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import * as DesktopThreadPromptDrafts from "../../settings/DesktopThreadPromptDrafts.ts";
import * as IpcChannels from "../channels.ts";
import { makeIpcMethod } from "../DesktopIpc.ts";

const ThreadPromptDraftThreadInput = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
});

const SetThreadPromptDraftsInput = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
  drafts: Schema.Array(ThreadPromptDraftSchema),
});

export const getThreadPromptDrafts = makeIpcMethod({
  channel: IpcChannels.GET_THREAD_PROMPT_DRAFTS_CHANNEL,
  payload: ThreadPromptDraftThreadInput,
  result: Schema.Array(ThreadPromptDraftSchema),
  handler: Effect.fn("desktop.ipc.threadPromptDrafts.get")(function* ({
    environmentId,
    threadId,
  }) {
    const threadPromptDrafts = yield* DesktopThreadPromptDrafts.DesktopThreadPromptDrafts;
    return yield* threadPromptDrafts.getThreadDrafts(environmentId, threadId);
  }),
});

export const setThreadPromptDrafts = makeIpcMethod({
  channel: IpcChannels.SET_THREAD_PROMPT_DRAFTS_CHANNEL,
  payload: SetThreadPromptDraftsInput,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.threadPromptDrafts.set")(function* ({
    environmentId,
    threadId,
    drafts,
  }) {
    const threadPromptDrafts = yield* DesktopThreadPromptDrafts.DesktopThreadPromptDrafts;
    yield* threadPromptDrafts.setThreadDrafts(environmentId, threadId, drafts);
  }),
});
