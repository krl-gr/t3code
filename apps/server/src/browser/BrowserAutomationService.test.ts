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

function fakeLaunchedBrowser(events: string[]): LaunchedCdpBrowser {
  const page = {
    isClosed: () => false,
    url: () => "about:blank",
    title: async () => "",
    bringToFront: async () => undefined,
    waitForLoadState: async () => undefined,
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
    debuggingPort: 49222,
    userDataDir: "C:/tmp/t3code-state/browser-profiles/default",
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
    const service = createBrowserAutomationService(makeServerConfig(), {
      readFile: async () => JSON.stringify({ browser: { allowedOrigins: [] } }),
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
      "browser.close",
      "process.dispose",
      "rm:C:/tmp/t3code-state/browser-profiles/default",
      "mkdir:C:/tmp/t3code-state/browser-profiles/default",
    ]);
  });

  it("returns a clear error when the CDP endpoint is unavailable", async () => {
    const port = await allocateClosedPort();
    await expect(waitForCdpEndpointForTests(port, 50)).rejects.toThrow(
      `Chrome/Edge did not expose a local CDP endpoint at http://127.0.0.1:${port}/json/version`,
    );
  });
});
