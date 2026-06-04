import {
  type EnvironmentId,
  ThreadPromptDraftSchema,
  type ThreadId,
  type ThreadPromptDraft,
} from "@t3tools/contracts";
import { fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";

import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";

const ThreadPromptDraftsDocumentSchema = Schema.Struct({
  version: Schema.optionalKey(Schema.Number),
  drafts: Schema.optionalKey(Schema.Array(ThreadPromptDraftSchema)),
});

type ThreadPromptDraftsDocument = typeof ThreadPromptDraftsDocumentSchema.Type;

const ThreadPromptDraftsDocumentJson = fromLenientJson(ThreadPromptDraftsDocumentSchema);
const decodeThreadPromptDraftsDocumentJson = Schema.decodeEffect(ThreadPromptDraftsDocumentJson);
const encodeThreadPromptDraftsDocumentJson = Schema.encodeEffect(ThreadPromptDraftsDocumentJson);

export class DesktopThreadPromptDraftsWriteError extends Data.TaggedError(
  "DesktopThreadPromptDraftsWriteError",
)<{
  readonly cause: PlatformError.PlatformError | Schema.SchemaError;
}> {
  override get message() {
    return `Failed to write thread prompt drafts: ${this.cause.message}`;
  }
}

export interface DesktopThreadPromptDraftsShape {
  readonly getThreadDrafts: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
  ) => Effect.Effect<readonly ThreadPromptDraft[]>;
  readonly setThreadDrafts: (
    environmentId: EnvironmentId,
    threadId: ThreadId,
    drafts: readonly ThreadPromptDraft[],
  ) => Effect.Effect<void, DesktopThreadPromptDraftsWriteError>;
}

export class DesktopThreadPromptDrafts extends Context.Service<
  DesktopThreadPromptDrafts,
  DesktopThreadPromptDraftsShape
>()("@t3tools/desktop/settings/DesktopThreadPromptDrafts") {}

function draftBelongsToThread(
  draft: ThreadPromptDraft,
  environmentId: EnvironmentId,
  threadId: ThreadId,
): boolean {
  return draft.environmentId === environmentId && draft.threadId === threadId;
}

const readDraftsDocument = (
  fileSystem: FileSystem.FileSystem,
  draftsPath: string,
): Effect.Effect<ThreadPromptDraftsDocument> =>
  fileSystem.readFileString(draftsPath).pipe(
    Effect.option,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed({}),
        onSome: (raw) =>
          decodeThreadPromptDraftsDocumentJson(raw).pipe(
            Effect.catch(() => Effect.succeed({})),
          ),
      }),
    ),
  );

const writeDraftsDocument = Effect.fnUntraced(function* (input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly draftsPath: string;
  readonly document: ThreadPromptDraftsDocument;
  readonly suffix: string;
}) {
  const directory = input.path.dirname(input.draftsPath);
  const tempPath = `${input.draftsPath}.${process.pid}.${input.suffix}.tmp`;
  const encoded = yield* encodeThreadPromptDraftsDocumentJson(input.document);
  yield* input.fileSystem.makeDirectory(directory, { recursive: true });
  yield* input.fileSystem.writeFileString(tempPath, `${encoded}\n`);
  yield* input.fileSystem.rename(tempPath, input.draftsPath);
});

export const layer = Layer.effect(
  DesktopThreadPromptDrafts,
  Effect.gen(function* () {
    const environment = yield* DesktopEnvironment.DesktopEnvironment;
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const crypto = yield* Crypto.Crypto;

    const readDocument = () => readDraftsDocument(fileSystem, environment.threadPromptDraftsPath);

    return DesktopThreadPromptDrafts.of({
      getThreadDrafts: (environmentId, threadId) =>
        readDocument().pipe(
          Effect.map((document) =>
            (document.drafts ?? []).filter((draft) =>
              draftBelongsToThread(draft, environmentId, threadId),
            ),
          ),
          Effect.withSpan("desktop.threadPromptDrafts.getThreadDrafts"),
        ),
      setThreadDrafts: (environmentId, threadId, drafts) =>
        Effect.gen(function* () {
          const document = yield* readDocument();
          const nextDrafts = [
            ...(document.drafts ?? []).filter(
              (draft) => !draftBelongsToThread(draft, environmentId, threadId),
            ),
            ...drafts.map((draft) => ({
              ...draft,
              environmentId,
              threadId,
            })),
          ];
          const suffix = (yield* crypto.randomUUIDv4).replace(/-/g, "");
          yield* writeDraftsDocument({
            fileSystem,
            path,
            draftsPath: environment.threadPromptDraftsPath,
            document: {
              version: 1,
              drafts: nextDrafts,
            },
            suffix,
          });
        }).pipe(
          Effect.mapError((cause) => new DesktopThreadPromptDraftsWriteError({ cause })),
          Effect.withSpan("desktop.threadPromptDrafts.setThreadDrafts"),
        ),
    });
  }),
);

export const layerTest = (initialDrafts: readonly ThreadPromptDraft[] = []) =>
  Layer.effect(
    DesktopThreadPromptDrafts,
    Effect.gen(function* () {
      const draftsRef = yield* Ref.make<readonly ThreadPromptDraft[]>(initialDrafts);
      return DesktopThreadPromptDrafts.of({
        getThreadDrafts: (environmentId, threadId) =>
          Ref.get(draftsRef).pipe(
            Effect.map((drafts) =>
              drafts.filter((draft) => draftBelongsToThread(draft, environmentId, threadId)),
            ),
          ),
        setThreadDrafts: (environmentId, threadId, drafts) =>
          Ref.update(draftsRef, (current) => [
            ...current.filter((draft) => !draftBelongsToThread(draft, environmentId, threadId)),
            ...drafts,
          ]),
      });
    }),
  );
