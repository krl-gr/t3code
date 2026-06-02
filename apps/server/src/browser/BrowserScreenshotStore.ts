import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import {
  COMPUTER_USE_NAMESPACE,
  COMPUTER_USE_TOOL_PREFIX,
} from "../computerUse/ComputerUseToolDefinitions.ts";

const BROWSER_SCREENSHOTS_DIRNAME = "browser-screenshots";
const COMPUTER_SCREENSHOTS_DIRNAME = "computer-screenshots";
const DEFAULT_THREAD_TITLE = "untitled";
const DEFAULT_ORIGIN = "unknown-origin";
const TITLE_SEGMENT_MAX_LENGTH = 80;
const ORIGIN_SEGMENT_MAX_LENGTH = 80;

interface BrowserScreenshotPayload {
  readonly screenshotBase64: string;
  readonly mimeType: "image/png";
  readonly kind?: "browser" | "computer";
  readonly origin?: string;
  readonly url?: string;
  readonly app?: string;
}

export interface PersistBrowserScreenshotInput extends BrowserScreenshotPayload {
  readonly stateDir: string;
  readonly threadId: string;
  readonly threadTitle?: string;
  readonly createdAt: string;
}

export interface PersistedBrowserScreenshot {
  readonly filePath: string;
  readonly directoryPath: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function trimHyphens(value: string): string {
  return value.replace(/^-+|-+$/g, "");
}

export function slugifyBrowserScreenshotSegment(
  value: string | null | undefined,
  fallback: string,
  maxLength = TITLE_SEGMENT_MAX_LENGTH,
): string {
  const slug = trimHyphens(
    (value ?? "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-"),
  );
  const normalizedFallback = trimHyphens(fallback.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  const truncated = trimHyphens(slug.slice(0, maxLength));
  return truncated.length > 0 ? truncated : normalizedFallback;
}

function safePathSegment(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/i.test(value);
}

function browserScreenshotTimestamp(createdAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/.exec(createdAt);
  if (!match) {
    return slugifyBrowserScreenshotSegment(createdAt, "timestamp");
  }

  const [, date, hour, minute, second, milliseconds] = match;
  const suffix = milliseconds ? `-${milliseconds.padEnd(3, "0")}` : "";
  return `${date}_${hour}-${minute}-${second}${suffix}`;
}

function parsePngDataUrl(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const match = /^data:image\/png;base64,([a-z0-9+/=]+)$/i.exec(value.trim());
  return match?.[1];
}

function computerUseAppNameFromArgs(args: unknown): string | undefined {
  if (!isRecord(args)) {
    return undefined;
  }
  const app = typeof args.app === "string" ? args.app.trim() : "";
  return app.length > 0 ? app : undefined;
}

function isCompletedCodexComputerUseDynamicToolItem(
  item: unknown,
): item is Record<string, unknown> {
  if (!isRecord(item)) {
    return false;
  }
  if (
    item.type !== "dynamicToolCall" ||
    item.namespace !== COMPUTER_USE_NAMESPACE ||
    typeof item.tool !== "string" ||
    !item.tool.startsWith(COMPUTER_USE_TOOL_PREFIX)
  ) {
    return false;
  }
  return item.success !== false && item.status !== "failed";
}

function redactCodexComputerUseContentItems(item: Record<string, unknown>): Record<string, unknown> {
  const contentItems = Array.isArray(item.contentItems) ? item.contentItems : undefined;
  if (!contentItems) {
    return item;
  }
  return {
    ...item,
    contentItems: contentItems.map((entry) =>
      isRecord(entry) && entry.type === "inputImage" && typeof entry.imageUrl === "string"
        ? { ...entry, imageUrl: "[screenshot persisted]" }
        : entry,
    ),
  };
}

function extractCodexComputerScreenshotPayload(
  value: Record<string, unknown>,
): BrowserScreenshotPayload | null {
  const item = isRecord(value.item) ? value.item : undefined;
  if (!isCompletedCodexComputerUseDynamicToolItem(item)) {
    return null;
  }

  const contentItems = Array.isArray(item.contentItems) ? item.contentItems : [];
  const imageItem = contentItems.find(
    (entry): entry is { readonly type: "inputImage"; readonly imageUrl: string } =>
      isRecord(entry) && entry.type === "inputImage" && typeof entry.imageUrl === "string",
  );
  const screenshotBase64 = parsePngDataUrl(imageItem?.imageUrl);
  if (!screenshotBase64) {
    return null;
  }

  const app = computerUseAppNameFromArgs(item.arguments);
  return {
    screenshotBase64,
    mimeType: "image/png",
    kind: "computer",
    ...(app ? { app } : {}),
  };
}

export function browserScreenshotOriginSlug(input: {
  readonly origin?: string;
  readonly url?: string;
  readonly app?: string;
}): string {
  const candidate = input.origin ?? input.url ?? input.app;
  if (!candidate) {
    return DEFAULT_ORIGIN;
  }

  try {
    const hostname = new URL(candidate).hostname.replace(/^www\./i, "");
    return slugifyBrowserScreenshotSegment(hostname, DEFAULT_ORIGIN, ORIGIN_SEGMENT_MAX_LENGTH);
  } catch {
    return slugifyBrowserScreenshotSegment(candidate, DEFAULT_ORIGIN, ORIGIN_SEGMENT_MAX_LENGTH);
  }
}

export function browserScreenshotDirectoryName(input: {
  readonly threadTitle?: string;
  readonly threadId: string;
}): string {
  const titleSegment = slugifyBrowserScreenshotSegment(input.threadTitle, DEFAULT_THREAD_TITLE);
  const threadSegment = slugifyBrowserScreenshotSegment(input.threadId, "thread", 120);
  return `${titleSegment}--${threadSegment}`;
}

export function browserScreenshotFileName(input: {
  readonly createdAt: string;
  readonly origin?: string;
  readonly url?: string;
  readonly app?: string;
}): string {
  return `${browserScreenshotTimestamp(input.createdAt)}_${browserScreenshotOriginSlug(input)}.png`;
}

export function extractBrowserScreenshotPayload(value: unknown): BrowserScreenshotPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const codexComputerScreenshot = extractCodexComputerScreenshotPayload(value);
  if (codexComputerScreenshot) {
    return codexComputerScreenshot;
  }

  const persistenceScreenshot = isRecord(value.persistenceScreenshot)
    ? value.persistenceScreenshot
    : undefined;
  const details = isRecord(value.details) ? value.details : undefined;
  const kind = details?.kind === "computerUse" ? "computer" : "browser";
  if (
    typeof persistenceScreenshot?.data === "string" &&
    persistenceScreenshot.data.trim().length > 0 &&
    typeof persistenceScreenshot.mimeType === "string" &&
    persistenceScreenshot.mimeType.toLowerCase() === "image/png"
  ) {
    return {
      screenshotBase64: persistenceScreenshot.data,
      mimeType: "image/png",
      kind,
      ...(typeof persistenceScreenshot.origin === "string"
        ? { origin: persistenceScreenshot.origin }
        : {}),
      ...(typeof persistenceScreenshot.url === "string" ? { url: persistenceScreenshot.url } : {}),
      ...(typeof persistenceScreenshot.app === "string" ? { app: persistenceScreenshot.app } : {}),
    };
  }

  if (details?.kind !== "computerUse" && details?.action !== "screenshot") {
    return null;
  }
  if (details.blocked === true) {
    return null;
  }

  const content = Array.isArray(value.content) ? value.content : [];
  const imageContent = content.find(
    (
      entry,
    ): entry is { readonly type: "image"; readonly data: string; readonly mimeType: string } =>
      isRecord(entry) &&
      entry.type === "image" &&
      typeof entry.data === "string" &&
      typeof entry.mimeType === "string",
  );

  const mimeType =
    imageContent?.mimeType.toLowerCase() ??
    (typeof details.mimeType === "string" ? details.mimeType.toLowerCase() : undefined);
  if (mimeType !== "image/png") {
    return null;
  }

  const screenshotBase64 =
    imageContent?.data ??
    (typeof details.screenshotBase64 === "string" ? details.screenshotBase64 : undefined);
  if (!screenshotBase64 || screenshotBase64.trim().length === 0) {
    return null;
  }

  return {
    screenshotBase64,
    mimeType: "image/png",
    kind,
    ...(typeof details.origin === "string" ? { origin: details.origin } : {}),
    ...(typeof details.url === "string" ? { url: details.url } : {}),
    ...(typeof details.app === "string" ? { app: details.app } : {}),
  };
}

export function stripBrowserScreenshotPersistence(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  if (isCompletedCodexComputerUseDynamicToolItem(value.item)) {
    return {
      ...value,
      item: redactCodexComputerUseContentItems(value.item),
    };
  }

  if (!("persistenceScreenshot" in value)) {
    return value;
  }

  const { persistenceScreenshot: _persistenceScreenshot, ...rest } = value;
  return rest;
}

function existingThreadDirectoryName(
  entries: ReadonlyArray<string>,
  expectedThreadSuffix: string,
): string | undefined {
  return entries.find((entry) => safePathSegment(entry) && entry.endsWith(expectedThreadSuffix));
}

function availableFilePath(input: {
  readonly fileSystem: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly directoryPath: string;
  readonly fileName: string;
}) {
  return Effect.gen(function* () {
    const extension = ".png";
    const stem = input.fileName.endsWith(extension)
      ? input.fileName.slice(0, -extension.length)
      : input.fileName;

    for (let index = 0; index < 1000; index += 1) {
      const candidateFileName =
        index === 0 ? input.fileName : `${stem}-${String(index + 1)}${extension}`;
      const candidatePath = input.path.join(input.directoryPath, candidateFileName);
      const exists = yield* input.fileSystem
        .exists(candidatePath)
        .pipe(Effect.catch(() => Effect.succeed(false)));
      if (!exists) {
        return candidatePath;
      }
    }

    return input.path.join(input.directoryPath, `${stem}-1001${extension}`);
  });
}

function persistScreenshot(input: PersistBrowserScreenshotInput) {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const bytes = Buffer.from(input.screenshotBase64, "base64");
    if (bytes.byteLength === 0) {
      return null;
    }

    const rootDirectory = path.join(
      input.stateDir,
      input.kind === "computer" ? COMPUTER_SCREENSHOTS_DIRNAME : BROWSER_SCREENSHOTS_DIRNAME,
    );
    const threadSegment = slugifyBrowserScreenshotSegment(input.threadId, "thread", 120);
    const expectedThreadSuffix = `--${threadSegment}`;
    const rootEntries = yield* fileSystem
      .readDirectory(rootDirectory, { recursive: false })
      .pipe(Effect.catch(() => Effect.succeed([] as string[])));
    const directoryName =
      existingThreadDirectoryName(rootEntries, expectedThreadSuffix) ??
      browserScreenshotDirectoryName({
        threadId: input.threadId,
        ...(input.threadTitle !== undefined ? { threadTitle: input.threadTitle } : {}),
      });
    const directoryPath = path.join(rootDirectory, directoryName);
    const filePath = yield* availableFilePath({
      fileSystem,
      path,
      directoryPath,
      fileName: browserScreenshotFileName(input),
    });

    yield* fileSystem.makeDirectory(directoryPath, { recursive: true });
    yield* fileSystem.writeFile(filePath, bytes);

    return {
      filePath,
      directoryPath,
    } satisfies PersistedBrowserScreenshot;
  });
}

export function persistBrowserScreenshot(input: PersistBrowserScreenshotInput) {
  return persistScreenshot(input);
}
