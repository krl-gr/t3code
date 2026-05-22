import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import * as DesktopConfig from "./DesktopConfig.ts";

const defaultInput = {
  dirname: "/repo/apps/desktop/dist-electron",
  homeDirectory: "/Users/alice",
  platform: "darwin",
  processArch: "arm64",
  appVersion: "0.0.22",
  appPath: "/Applications/T3 Code.app/Contents/Resources/app.asar",
  isPackaged: false,
  resourcesPath: "/Applications/T3 Code.app/Contents/Resources",
  runningUnderArm64Translation: false,
} satisfies DesktopEnvironment.MakeDesktopEnvironmentInput;

const makeEnvironmentLayer = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  DesktopEnvironment.layer({
    ...defaultInput,
    ...overrides,
  }).pipe(Layer.provide(Layer.mergeAll(NodeServices.layer, DesktopConfig.layerTest(env))));

const makeEnvironment = (
  overrides: Partial<DesktopEnvironment.MakeDesktopEnvironmentInput> = {},
  env: Record<string, string | undefined> = {},
) =>
  Effect.gen(function* () {
    return yield* DesktopEnvironment.DesktopEnvironment;
  }).pipe(Effect.provide(makeEnvironmentLayer(overrides, env)));

const normalizePath = (value: string) =>
  value.replaceAll("\\", "/").replace(/^[A-Za-z]:(?=\/)/, "");
const normalizePathOption = (value: Option.Option<string>) => Option.map(value, normalizePath);

describe("DesktopEnvironment", () => {
  it.effect("derives state paths and development identity inside Effect", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_HOME: " /tmp/t3 ",
          T3CODE_COMMIT_HASH: " 0123456789abcdef ",
          T3CODE_PORT: "4949",
          VITE_DEV_SERVER_URL: "http://localhost:5173",
          T3CODE_DEV_REMOTE_T3_SERVER_ENTRY_PATH: " /remote/server.mjs ",
          T3CODE_OTLP_TRACES_URL: " http://127.0.0.1:4318/v1/traces ",
          T3CODE_OTLP_EXPORT_INTERVAL_MS: "2500",
        },
      );

      assert.equal(environment.isDevelopment, true);
      assert.equal(
        normalizePath(environment.appDataDirectory),
        "/Users/alice/Library/Application Support",
      );
      assert.equal(normalizePath(environment.baseDir), "/tmp/t3");
      assert.equal(normalizePath(environment.stateDir), "/tmp/t3/dev");
      assert.equal(
        normalizePath(environment.desktopSettingsPath),
        "/tmp/t3/dev/desktop-settings.json",
      );
      assert.equal(
        normalizePath(environment.clientSettingsPath),
        "/tmp/t3/dev/client-settings.json",
      );
      assert.equal(
        normalizePath(environment.savedEnvironmentRegistryPath),
        "/tmp/t3/dev/saved-environments.json",
      );
      assert.equal(normalizePath(environment.serverSettingsPath), "/tmp/t3/dev/settings.json");
      assert.equal(normalizePath(environment.logDir), "/tmp/t3/dev/logs");
      assert.equal(normalizePath(environment.rootDir), "/repo");
      assert.equal(normalizePath(environment.appRoot), "/repo");
      assert.equal(normalizePath(environment.backendEntryPath), "/repo/apps/server/dist/bin.mjs");
      assert.equal(normalizePath(environment.backendCwd), "/repo");
      assert.equal(environment.appUserModelId, "com.t3tools.t3code.dev");
      assert.equal(environment.linuxWmClass, "t3code-dev");
      assert.deepEqual(
        Option.map(environment.devServerUrl, (url) => url.href),
        Option.some("http://localhost:5173/"),
      );
      assert.deepEqual(
        normalizePathOption(environment.devRemoteT3ServerEntryPath),
        Option.some("/remote/server.mjs"),
      );
      assert.deepEqual(environment.configuredBackendPort, Option.some(4949));
      assert.deepEqual(environment.commitHashOverride, Option.some("0123456789abcdef"));
      assert.deepEqual(environment.otlpTracesUrl, Option.some("http://127.0.0.1:4318/v1/traces"));
      assert.equal(environment.otlpExportIntervalMs, 2500);
    }),
  );

  it.effect("derives production state paths under userdata", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        {},
        {
          T3CODE_HOME: "/tmp/t3",
        },
      );

      assert.equal(environment.isDevelopment, false);
      assert.equal(normalizePath(environment.stateDir), "/tmp/t3/userdata");
      assert.equal(normalizePath(environment.logDir), "/tmp/t3/userdata/logs");
      assert.equal(normalizePath(environment.serverSettingsPath), "/tmp/t3/userdata/settings.json");
    }),
  );

  it.effect("derives local desktop identity separately from production", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment(
        { appVersion: "0.0.22-local" },
        {
          T3CODE_HOME: "/tmp/t3",
        },
      );

      assert.equal(environment.displayName, "Up.computer (Local)");
      assert.equal(environment.branding.stageLabel, "Local");
      assert.equal(normalizePath(environment.stateDir), "/tmp/t3/local");
      assert.equal(environment.userDataDirName, "t3code-local");
      assert.equal(environment.legacyUserDataDirName, "T3 Code (Local)");
      assert.equal(environment.appUserModelId, "com.t3tools.t3code.local");
      assert.equal(environment.linuxDesktopEntryName, "t3code-local.desktop");
      assert.equal(environment.linuxWmClass, "t3code-local");
    }),
  );

  it.effect("resolves picker defaults without nullish sentinels", () =>
    Effect.gen(function* () {
      const environment = yield* makeEnvironment();

      assert.deepEqual(environment.resolvePickFolderDefaultPath(null), Option.none());
      assert.deepEqual(
        environment.resolvePickFolderDefaultPath({ initialPath: " " }),
        Option.none(),
      );
      assert.deepEqual(
        normalizePathOption(environment.resolvePickFolderDefaultPath({ initialPath: "~" })),
        Option.some("/Users/alice"),
      );
      assert.deepEqual(
        normalizePathOption(environment.resolvePickFolderDefaultPath({ initialPath: "~/project" })),
        Option.some("/Users/alice/project"),
      );
    }),
  );
});
