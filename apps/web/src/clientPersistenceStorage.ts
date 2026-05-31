import {
  ClientSettingsSchema,
  EnvironmentId,
  ThreadPromptDraftSchema,
  type ClientSettings,
  type EnvironmentId as EnvironmentIdValue,
  type PersistedSavedEnvironmentRecord,
  type ThreadId as ThreadIdValue,
  type ThreadPromptDraft,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

import { getLocalStorageItem, setLocalStorageItem } from "./hooks/useLocalStorage";

export const CLIENT_SETTINGS_STORAGE_KEY = "t3code:client-settings:v1";
export const SAVED_ENVIRONMENT_REGISTRY_STORAGE_KEY = "t3code:saved-environment-registry:v1";
export const THREAD_PROMPT_DRAFTS_STORAGE_KEY = "t3code:thread-prompt-drafts:v1";

const BrowserSavedEnvironmentRecordSchema = Schema.Struct({
  environmentId: EnvironmentId,
  label: Schema.String,
  httpBaseUrl: Schema.String,
  wsBaseUrl: Schema.String,
  createdAt: Schema.String,
  lastConnectedAt: Schema.NullOr(Schema.String),
  desktopSsh: Schema.optionalKey(
    Schema.Struct({
      alias: Schema.String,
      hostname: Schema.String,
      username: Schema.NullOr(Schema.String),
      port: Schema.NullOr(Schema.Number),
    }),
  ),
  bearerToken: Schema.optionalKey(Schema.String),
});
type BrowserSavedEnvironmentRecord = typeof BrowserSavedEnvironmentRecordSchema.Type;

const BrowserSavedEnvironmentRegistryDocumentSchema = Schema.Struct({
  version: Schema.optionalKey(Schema.Number),
  records: Schema.optionalKey(Schema.Array(BrowserSavedEnvironmentRecordSchema)),
});
type BrowserSavedEnvironmentRegistryDocument =
  typeof BrowserSavedEnvironmentRegistryDocumentSchema.Type;

const BrowserThreadPromptDraftsDocumentSchema = Schema.Struct({
  version: Schema.optionalKey(Schema.Number),
  drafts: Schema.optionalKey(Schema.Array(ThreadPromptDraftSchema)),
});
type BrowserThreadPromptDraftsDocument = typeof BrowserThreadPromptDraftsDocumentSchema.Type;

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function toPersistedSavedEnvironmentRecord(
  record: PersistedSavedEnvironmentRecord,
): PersistedSavedEnvironmentRecord {
  const nextRecord = {
    environmentId: record.environmentId,
    label: record.label,
    httpBaseUrl: record.httpBaseUrl,
    wsBaseUrl: record.wsBaseUrl,
    createdAt: record.createdAt,
    lastConnectedAt: record.lastConnectedAt,
  };
  return record.desktopSsh ? { ...nextRecord, desktopSsh: record.desktopSsh } : nextRecord;
}

export function readBrowserClientSettings(): ClientSettings | null {
  if (!hasWindow()) {
    return null;
  }

  try {
    return getLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, ClientSettingsSchema);
  } catch {
    return null;
  }
}

export function writeBrowserClientSettings(settings: ClientSettings): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, settings, ClientSettingsSchema);
}

function readBrowserSavedEnvironmentRegistryDocument(): BrowserSavedEnvironmentRegistryDocument {
  if (!hasWindow()) {
    return {};
  }

  try {
    const parsed = getLocalStorageItem(
      SAVED_ENVIRONMENT_REGISTRY_STORAGE_KEY,
      BrowserSavedEnvironmentRegistryDocumentSchema,
    );
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeBrowserSavedEnvironmentRegistryDocument(
  document: BrowserSavedEnvironmentRegistryDocument,
): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(
    SAVED_ENVIRONMENT_REGISTRY_STORAGE_KEY,
    document,
    BrowserSavedEnvironmentRegistryDocumentSchema,
  );
}

function readBrowserSavedEnvironmentRecordsWithSecrets(): ReadonlyArray<BrowserSavedEnvironmentRecord> {
  return readBrowserSavedEnvironmentRegistryDocument().records ?? [];
}

function writeBrowserSavedEnvironmentRecords(
  records: ReadonlyArray<BrowserSavedEnvironmentRecord>,
): void {
  writeBrowserSavedEnvironmentRegistryDocument({
    version: 1,
    records,
  });
}

export function readBrowserSavedEnvironmentRegistry(): ReadonlyArray<PersistedSavedEnvironmentRecord> {
  return readBrowserSavedEnvironmentRecordsWithSecrets().map((record) =>
    toPersistedSavedEnvironmentRecord(record),
  );
}

export function writeBrowserSavedEnvironmentRegistry(
  records: ReadonlyArray<PersistedSavedEnvironmentRecord>,
): void {
  const existing = new Map(
    readBrowserSavedEnvironmentRecordsWithSecrets().map(
      (record) => [record.environmentId, record] as const,
    ),
  );
  writeBrowserSavedEnvironmentRecords(
    records.map((record) => {
      const bearerToken = existing.get(record.environmentId)?.bearerToken;
      return bearerToken
        ? {
            environmentId: record.environmentId,
            label: record.label,
            httpBaseUrl: record.httpBaseUrl,
            wsBaseUrl: record.wsBaseUrl,
            createdAt: record.createdAt,
            lastConnectedAt: record.lastConnectedAt,
            ...(record.desktopSsh ? { desktopSsh: record.desktopSsh } : {}),
            bearerToken,
          }
        : toPersistedSavedEnvironmentRecord(record);
    }),
  );
}

export function readBrowserSavedEnvironmentSecret(
  environmentId: EnvironmentIdValue,
): string | null {
  return (
    readBrowserSavedEnvironmentRecordsWithSecrets().find(
      (record) => record.environmentId === environmentId,
    )?.bearerToken ?? null
  );
}

export function writeBrowserSavedEnvironmentSecret(
  environmentId: EnvironmentIdValue,
  secret: string,
): boolean {
  const document = readBrowserSavedEnvironmentRegistryDocument();
  const records = document.records ?? [];
  let found = false;
  writeBrowserSavedEnvironmentRegistryDocument({
    version: document.version ?? 1,
    records: records.map((record) => {
      if (record.environmentId !== environmentId) {
        return record;
      }
      found = true;
      const nextRecord = {
        environmentId: record.environmentId,
        label: record.label,
        httpBaseUrl: record.httpBaseUrl,
        wsBaseUrl: record.wsBaseUrl,
        createdAt: record.createdAt,
        lastConnectedAt: record.lastConnectedAt,
        bearerToken: secret,
      };
      return record.desktopSsh ? { ...nextRecord, desktopSsh: record.desktopSsh } : nextRecord;
    }),
  });
  return found;
}

export function removeBrowserSavedEnvironmentSecret(environmentId: EnvironmentIdValue): void {
  const document = readBrowserSavedEnvironmentRegistryDocument();
  writeBrowserSavedEnvironmentRegistryDocument({
    version: document.version ?? 1,
    records: (document.records ?? []).map((record) => {
      if (record.environmentId !== environmentId) {
        return record;
      }
      return toPersistedSavedEnvironmentRecord(record);
    }),
  });
}

function readBrowserThreadPromptDraftsDocument(): BrowserThreadPromptDraftsDocument {
  if (!hasWindow()) {
    return {};
  }

  try {
    return (
      getLocalStorageItem(THREAD_PROMPT_DRAFTS_STORAGE_KEY, BrowserThreadPromptDraftsDocumentSchema) ??
      {}
    );
  } catch {
    return {};
  }
}

function writeBrowserThreadPromptDraftsDocument(document: BrowserThreadPromptDraftsDocument): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(
    THREAD_PROMPT_DRAFTS_STORAGE_KEY,
    document,
    BrowserThreadPromptDraftsDocumentSchema,
  );
}

function draftBelongsToThread(
  draft: ThreadPromptDraft,
  environmentId: EnvironmentIdValue,
  threadId: ThreadIdValue,
): boolean {
  return draft.environmentId === environmentId && draft.threadId === threadId;
}

export function readBrowserThreadPromptDrafts(
  environmentId: EnvironmentIdValue,
  threadId: ThreadIdValue,
): readonly ThreadPromptDraft[] {
  return (readBrowserThreadPromptDraftsDocument().drafts ?? []).filter((draft) =>
    draftBelongsToThread(draft, environmentId, threadId),
  );
}

export function writeBrowserThreadPromptDrafts(
  environmentId: EnvironmentIdValue,
  threadId: ThreadIdValue,
  drafts: readonly ThreadPromptDraft[],
): void {
  const document = readBrowserThreadPromptDraftsDocument();
  writeBrowserThreadPromptDraftsDocument({
    version: document.version ?? 1,
    drafts: [
      ...(document.drafts ?? []).filter(
        (draft) => !draftBelongsToThread(draft, environmentId, threadId),
      ),
      ...drafts.map((draft) => ({
        ...draft,
        environmentId,
        threadId,
      })),
    ],
  });
}
