import net from "node:net";

import type { ServerConfigShape } from "../config.ts";
import { describe, expect, it, vi } from "vitest";

import {
  buildBrowserLaunchArgs,
  createBrowserAutomationService,
  getInstalledBrowserCandidates,
  waitForCdpEndpointForTests,
  type BrowserProcessHandle,
  type LaunchedCdpBrowser,
} from "./BrowserAutomationService.ts";

function makeServerConfig(): ServerConfigShape {
  return {
    stateDir: "C:/tmp/t3code-state",
    settingsPath: "C:/tmp/t3code-state/settings.json",
  } as ServerConfigShape;
}

function normalizeSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

function makeMetadataPath(): string {
  return "C:/tmp/t3code-state/browser-profiles/default.cdp.json";
}

function makeSettingsPath(): string {
  return "C:/tmp/t3code-state/settings.json";
}

function makeDefaultProfilePath(): string {
  return "C:/tmp/t3code-state/browser-profiles/default";
}

function makeMemoryFileDependencies(input?: {
  readonly files?: Map<string, string>;
  readonly events?: string[];
}) {
  const files = new Map(
    [...(input?.files ?? new Map<string, string>()).entries()].map(([key, value]) => [
      normalizeSeparators(key),
      value,
    ]),
  );
  const events = input?.events;
  return {
    files,
    readFile: async (filePath: string) => {
      const normalizedPath = normalizeSeparators(filePath);
      if (normalizedPath === makeSettingsPath()) {
        return JSON.stringify({ browser: { allowedOrigins: [] } });
      }
      const value = files.get(normalizedPath);
      if (value === undefined) {
        throw new Error(`Missing test file: ${filePath}`);
      }
      return value;
    },
    writeFile: async (filePath: string, content: string) => {
      const normalizedPath = normalizeSeparators(filePath);
      events?.push(`write:${normalizedPath}`);
      files.set(normalizedPath, content);
    },
    renameFile: async (fromPath: string, toPath: string) => {
      const normalizedFromPath = normalizeSeparators(fromPath);
      const normalizedToPath = normalizeSeparators(toPath);
      events?.push(`rename:${normalizedFromPath}:${normalizedToPath}`);
      const value = files.get(normalizedFromPath);
      if (value === undefined) {
        throw new Error(`Missing test file: ${fromPath}`);
      }
      files.delete(normalizedFromPath);
      files.set(normalizedToPath, value);
    },
    removeFile: async (filePath: string) => {
      const normalizedPath = normalizeSeparators(filePath);
      events?.push(`rmfile:${normalizedPath}`);
      files.delete(normalizedPath);
    },
  };
}

function fakeLaunchedBrowser(
  events: string[],
  input?: { readonly port?: number },
): LaunchedCdpBrowser {
  const page = {
    isClosed: () => false,
    url: () => "about:blank",
    title: async () => "",
    bringToFront: async () => undefined,
    waitForLoadState: async () => undefined,
    goto: async () => undefined,
  };
  const browser = {
    on: vi.fn(),
    close: async () => {
      events.push("browser.close");
    },
  };
  const browserProcess: BrowserProcessHandle = {
    browserName: "chrome",
    executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
    debuggingPort: input?.port ?? 49222,
    userDataDir: makeDefaultProfilePath(),
    pid: 1234,
    dispose: async () => {
      events.push("process.dispose");
    },
  };
  return {
    browserProcess,
    browser: browser as never,
    context: {
      pages: () => [page],
      newPage: async () => page,
    } as never,
  };
}

function runtimeMetadata(input?: { readonly port?: number }): string {
  return `${JSON.stringify(
    {
      version: 1,
      profileId: "default",
      userDataDir: makeDefaultProfilePath(),
      browserName: "chrome",
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      debuggingPort: input?.port ?? 49222,
      pid: 1234,
      launchedAt: "2026-05-18T00:00:00.000Z",
    },
    null,
    2,
  )}\n`;
}

async function allocateClosedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof address === "object" && address !== null) {
          resolve(address.port);
          return;
        }
        reject(new Error("Unable to allocate test port."));
      });
    });
  });
}

describe("BrowserAutomationService", () => {
  it("resolves Windows Chrome and Edge executable candidates in preference order", () => {
    const candidates = getInstalledBrowserCandidates({
      platform: "win32",
      env: {
        ProgramFiles: "C:/Program Files",
        "ProgramFiles(x86)": "C:/Program Files (x86)",
        LocalAppData: "C:/Users/alice/AppData/Local",
      },
    });

    expect(
      candidates.map((candidate) => ({
        browserName: candidate.browserName,
        executablePath: normalizeSeparators(candidate.executablePath),
      })),
    ).toEqual([
      {
        browserName: "chrome",
        executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      },
      {
        browserName: "chrome",
        executablePath: "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      },
      {
        browserName: "chrome",
        executablePath: "C:/Users/alice/AppData/Local/Google/Chrome/Application/chrome.exe",
      },
      {
        browserName: "msedge",
        executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      },
      {
        browserName: "msedge",
        executablePath: "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
      },
    ]);
  });

  it("builds local CDP launch args without automation flags", () => {
    const args = buildBrowserLaunchArgs({
      debuggingPort: 47777,
      userDataDir: "C:/tmp/t3code-state/browser-profiles/default",
      initialUrl: "https://accounts.google.com",
    });

    expect(args).toContain("--remote-debugging-address=127.0.0.1");
    expect(args).toContain("--remote-debugging-port=47777");
    expect(args).toContain("--user-data-dir=C:/tmp/t3code-state/browser-profiles/default");
    expect(args).toContain("--no-first-run");
    expect(args).toContain("--no-default-browser-check");
    expect(args).toContain("https://accounts.google.com");
    expect(args).not.toContain("--enable-automation");
    expect(args).not.toContain("--disable-blink-features=AutomationControlled");
  });

  it("closes the CDP browser and process before clearing profile data", async () => {
    const events: string[] = [];
    const fileDependencies = makeMemoryFileDependencies({ events });
    const service = createBrowserAutomationService(makeServerConfig(), {
      ...fileDependencies,
      makeDirectory: async (directoryPath) => {
        events.push(`mkdir:${directoryPath}`);
      },
      removeDirectory: async (directoryPath) => {
        events.push(`rm:${directoryPath}`);
      },
      launchCdpBrowser: async () => {
        events.push("launch");
        return fakeLaunchedBrowser(events);
      },
    });

    await service.openLoginWindow();
    await service.clearProfileData();

    expect(events.map(normalizeSeparators)).toEqual([
      "mkdir:C:/tmp/t3code-state/browser-profiles/default",
      "launch",
      "mkdir:C:/tmp/t3code-state/browser-profiles",
      "write:C:/tmp/t3code-state/browser-profiles/default.cdp.json.tmp",
      "rename:C:/tmp/t3code-state/browser-profiles/default.cdp.json.tmp:C:/tmp/t3code-state/browser-profiles/default.cdp.json",
      "browser.close",
      "process.dispose",
      "rmfile:C:/tmp/t3code-state/browser-profiles/default.cdp.json",
      "rmfile:C:/tmp/t3code-state/browser-profiles/default.cdp.json.tmp",
      "rm:C:/tmp/t3code-state/browser-profiles/default",
      "mkdir:C:/tmp/t3code-state/browser-profiles/default",
    ]);
  });

  it("writes runtime metadata after a successful launch", async () => {
    const events: string[] = [];
    const fileDependencies = makeMemoryFileDependencies({ events });
    const service = createBrowserAutomationService(makeServerConfig(), {
      ...fileDependencies,
      makeDirectory: async () => undefined,
      launchCdpBrowser: async () => fakeLaunchedBrowser(events, { port: 55123 }),
    });

    await service.openLoginWindow();

    const raw = fileDependencies.files.get(makeMetadataPath());
    expect(raw).toBeDefined();
    expect(JSON.parse(raw!)).toMatchObject({
      version: 1,
      profileId: "default",
      userDataDir: makeDefaultProfilePath(),
      browserName: "chrome",
      debuggingPort: 55123,
      pid: 1234,
    });
  });

  it("reconnects to remembered CDP endpoint before launching a new browser", async () => {
    const events: string[] = [];
    const files = new Map([[makeMetadataPath(), runtimeMetadata({ port: 55124 })]]);
    const fileDependencies = makeMemoryFileDependencies({ files, events });
    const service = createBrowserAutomationService(makeServerConfig(), {
      ...fileDependencies,
      makeDirectory: async () => undefined,
      probeCdpEndpoint: async (port) => {
        events.push(`probe:${port}`);
        return { ok: true };
      },
      connectOverCdp: async (port) => {
        events.push(`connect:${port}`);
        return {
          browser: fakeLaunchedBrowser(events, { port }).browser,
          context: fakeLaunchedBrowser(events, { port }).context,
        };
      },
      launchCdpBrowser: async () => {
        events.push("launch");
        return fakeLaunchedBrowser(events);
      },
    });

    await service.openLoginWindow();

    expect(events).toContain("probe:55124");
    expect(events).toContain("connect:55124");
    expect(events).not.toContain("launch");
  });

  it("ignores stale runtime metadata and launches a new browser", async () => {
    const events: string[] = [];
    const files = new Map([[makeMetadataPath(), runtimeMetadata({ port: 55125 })]]);
    const fileDependencies = makeMemoryFileDependencies({ files, events });
    const service = createBrowserAutomationService(makeServerConfig(), {
      ...fileDependencies,
      makeDirectory: async () => undefined,
      probeCdpEndpoint: async (port) => {
        events.push(`probe:${port}`);
        return { ok: false, error: "refused" };
      },
      launchCdpBrowser: async () => {
        events.push("launch");
        return fakeLaunchedBrowser(events, { port: 55126 });
      },
    });

    await service.openLoginWindow();

    expect(events).toContain("probe:55125");
    expect(events).toContain("launch");
    expect(JSON.parse(fileDependencies.files.get(makeMetadataPath())!)).toMatchObject({
      debuggingPort: 55126,
    });
  });

  it("reports an open snapshot from valid metadata without attaching", async () => {
    const events: string[] = [];
    const files = new Map([[makeMetadataPath(), runtimeMetadata({ port: 55127 })]]);
    const service = createBrowserAutomationService(makeServerConfig(), {
      ...makeMemoryFileDependencies({ files, events }),
      probeCdpEndpoint: async (port) => {
        events.push(`probe:${port}`);
        return { ok: true };
      },
      connectOverCdp: async () => {
        events.push("connect");
        return fakeLaunchedBrowser(events).browser as never;
      },
    });

    await expect(service.snapshot()).resolves.toMatchObject({
      status: "open",
      launchMode: "cdp-attached",
      browserName: "chrome",
      debuggingPort: 55127,
    });
    expect(events).toContain("probe:55127");
    expect(events).not.toContain("connect");
  });

  it("closes a recovered browser and removes runtime metadata", async () => {
    const events: string[] = [];
    const files = new Map([[makeMetadataPath(), runtimeMetadata({ port: 55128 })]]);
    const fileDependencies = makeMemoryFileDependencies({ files, events });
    const recovered = fakeLaunchedBrowser(events, { port: 55128 });
    const service = createBrowserAutomationService(makeServerConfig(), {
      ...fileDependencies,
      probeCdpEndpoint: async () => ({ ok: true }),
      connectOverCdp: async () => ({
        browser: recovered.browser,
        context: recovered.context,
      }),
    });

    await service.closeBrowser();

    expect(events).toContain("browser.close");
    expect(events).toContain(`rmfile:${makeMetadataPath()}`);
    expect(fileDependencies.files.has(makeMetadataPath())).toBe(false);
  });

  it("returns a clear error when the CDP endpoint is unavailable", async () => {
    const port = await allocateClosedPort();
    await expect(waitForCdpEndpointForTests(port, 50)).rejects.toThrow(
      `Chrome/Edge did not expose a local CDP endpoint at http://127.0.0.1:${port}/json/version`,
    );
  });

  it("returns a clear error when the browser process exits before CDP is available", async () => {
    const port = await allocateClosedPort();
    const processHandle: BrowserProcessHandle = {
      browserName: "chrome",
      executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
      debuggingPort: port,
      userDataDir: makeDefaultProfilePath(),
      getExitState: () => ({ exitCode: 0, signalCode: null, killed: false }),
      dispose: async () => undefined,
    };

    await expect(waitForCdpEndpointForTests(port, 50, processHandle)).rejects.toThrow(
      `Up.computer browser process exited before exposing CDP on http://127.0.0.1:${port}/json/version`,
    );
  });
});
