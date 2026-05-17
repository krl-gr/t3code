// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
// @effect-diagnostics globalTimers:off
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import path from "node:path";

import type { Browser, BrowserContext, Page } from "playwright-core";
import { chromium } from "playwright-core";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ServerConfig, type ServerConfigShape } from "../config.ts";
import {
  evaluateBrowserPolicy,
  normalizeBrowserOrigin,
  normalizeBrowserUrl,
  type BrowserActionKind,
} from "./BrowserPolicy.ts";
import { resolveBrowserProfilePaths } from "./BrowserProfiles.ts";

export type BrowserName = "chrome" | "msedge";

export interface BrowserProcessHandle {
  readonly browserName: BrowserName;
  readonly executablePath: string;
  readonly debuggingPort: number;
  readonly userDataDir: string;
  readonly dispose: () => Promise<void>;
}

export interface BrowserExecutableCandidate {
  readonly browserName: BrowserName;
  readonly executablePath: string;
}

export interface LaunchedCdpBrowser {
  readonly browserProcess: BrowserProcessHandle;
  readonly browser: Browser;
  readonly context: BrowserContext;
}

export interface BrowserAutomationServiceDependencies {
  readonly launchCdpBrowser?: (input: {
    readonly userDataDir: string;
    readonly initialUrl?: string;
  }) => Promise<LaunchedCdpBrowser>;
  readonly readFile?: (path: string) => Promise<string>;
  readonly makeDirectory?: (path: string) => Promise<void>;
  readonly removeDirectory?: (path: string) => Promise<void>;
}

export interface BrowserProfileSnapshot {
  readonly profileId: "default";
  readonly profilePath: string;
  readonly status: "closed" | "open";
  readonly launchMode?: "cdp-attached";
  readonly browserName?: BrowserName;
  readonly debuggingPort?: number;
  readonly currentUrl?: string;
  readonly currentTitle?: string;
  readonly allowedOrigins: ReadonlyArray<string>;
}

export interface BrowserToolResult {
  readonly action: BrowserActionKind;
  readonly blocked: boolean;
  readonly reason?: string;
  readonly url?: string;
  readonly title?: string;
  readonly origin?: string;
  readonly text?: string;
  readonly screenshotBase64?: string;
  readonly mimeType?: string;
}

export interface BrowserAutomationServiceShape {
  readonly snapshot: () => Promise<BrowserProfileSnapshot>;
  readonly openLoginWindow: (input?: { readonly url?: string }) => Promise<BrowserProfileSnapshot>;
  readonly closeBrowser: () => Promise<BrowserProfileSnapshot>;
  readonly clearProfileData: () => Promise<BrowserProfileSnapshot>;
  readonly navigate: (input: { readonly url: string }) => Promise<BrowserToolResult>;
  readonly search: (input: {
    readonly query: string;
    readonly url?: string;
  }) => Promise<BrowserToolResult>;
  readonly click: (input: {
    readonly selector?: string;
    readonly text?: string;
  }) => Promise<BrowserToolResult>;
  readonly scroll: (input?: {
    readonly direction?: "up" | "down";
    readonly amount?: number;
  }) => Promise<BrowserToolResult>;
  readonly extractText: (input?: { readonly maxChars?: number }) => Promise<BrowserToolResult>;
  readonly screenshot: () => Promise<BrowserToolResult>;
}

export class BrowserAutomationService extends Context.Service<
  BrowserAutomationService,
  BrowserAutomationServiceShape
>()("t3/browser/BrowserAutomationService") {}

function blockedResult(input: {
  readonly action: BrowserActionKind;
  readonly reason: string;
  readonly url?: string;
  readonly origin?: string;
}): BrowserToolResult {
  return {
    action: input.action,
    blocked: true,
    reason: input.reason,
    ...(input.url ? { url: input.url } : {}),
    ...(input.origin ? { origin: input.origin } : {}),
  };
}

function trimText(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function titleOf(page: Page): Promise<string | undefined> {
  return page
    .title()
    .then(trimText)
    .catch(() => undefined);
}

function candidatePath(
  join: (...paths: string[]) => string,
  ...parts: Array<string | undefined>
): string | null {
  if (parts.some((part) => !part)) {
    return null;
  }
  return join(...(parts as string[]));
}

export function getInstalledBrowserCandidates(input?: {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}): ReadonlyArray<BrowserExecutableCandidate> {
  const env = input?.env ?? process.env;
  const platform = input?.platform ?? process.platform;
  if (platform === "win32") {
    const join = path.win32.join;
    const chromeCandidates: BrowserExecutableCandidate[] = [
      candidatePath(join, env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe"),
      candidatePath(
        join,
        env["ProgramFiles(x86)"],
        "Google",
        "Chrome",
        "Application",
        "chrome.exe",
      ),
      candidatePath(join, env.LocalAppData, "Google", "Chrome", "Application", "chrome.exe"),
    ]
      .filter((executablePath): executablePath is string => executablePath !== null)
      .map((executablePath) => ({ browserName: "chrome" as const, executablePath }));
    const edgeCandidates: BrowserExecutableCandidate[] = [
      candidatePath(
        join,
        env["ProgramFiles(x86)"],
        "Microsoft",
        "Edge",
        "Application",
        "msedge.exe",
      ),
      candidatePath(join, env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]
      .filter((executablePath): executablePath is string => executablePath !== null)
      .map((executablePath) => ({ browserName: "msedge" as const, executablePath }));
    return [...chromeCandidates, ...edgeCandidates];
  }

  if (platform === "darwin") {
    return [
      {
        browserName: "chrome",
        executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      },
      {
        browserName: "msedge",
        executablePath: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      },
    ];
  }

  return [
    { browserName: "chrome", executablePath: "/usr/bin/google-chrome" },
    { browserName: "chrome", executablePath: "/usr/bin/google-chrome-stable" },
    { browserName: "msedge", executablePath: "/usr/bin/microsoft-edge" },
    { browserName: "msedge", executablePath: "/usr/bin/microsoft-edge-stable" },
  ];
}

export function buildBrowserLaunchArgs(input: {
  readonly debuggingPort: number;
  readonly userDataDir: string;
  readonly initialUrl?: string;
}): string[] {
  return [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${input.debuggingPort}`,
    `--user-data-dir=${input.userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...(trimText(input.initialUrl) ? [normalizeBrowserUrl(input.initialUrl!)] : []),
  ];
}

async function findAvailableLocalPort(): Promise<number> {
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
        reject(new Error("Unable to allocate a local browser debugging port."));
      });
    });
  });
}

async function resolveInstalledBrowserExecutable(): Promise<BrowserExecutableCandidate> {
  const candidates = getInstalledBrowserCandidates();
  for (const candidate of candidates) {
    if (
      await fs.access(candidate.executablePath).then(
        () => true,
        () => false,
      )
    ) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to find Chrome or Edge for T3 browser automation. Checked: ${candidates
      .map((candidate) => candidate.executablePath)
      .join(", ")}`,
  );
}

function waitForProcessExit(processHandle: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (processHandle.exitCode !== null || processHandle.killed) {
      resolve();
      return;
    }
    processHandle.once("exit", () => resolve());
  });
}

async function waitForCdpEndpoint(port: number, timeoutMs = 15_000): Promise<void> {
  const endpoint = `http://127.0.0.1:${port}/json/version`;
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        return;
      }
      lastError = new Error(`CDP endpoint returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(
    `Chrome/Edge did not expose a local CDP endpoint at ${endpoint}. ${
      lastError instanceof Error ? lastError.message : String(lastError ?? "")
    }`.trim(),
  );
}

async function launchBrowserProcess(input: {
  readonly userDataDir: string;
  readonly initialUrl?: string;
}): Promise<BrowserProcessHandle> {
  const executable = await resolveInstalledBrowserExecutable();
  const debuggingPort = await findAvailableLocalPort();
  const args = buildBrowserLaunchArgs({
    debuggingPort,
    userDataDir: input.userDataDir,
    ...(trimText(input.initialUrl) ? { initialUrl: input.initialUrl } : {}),
  });
  const child = spawn(executable.executablePath, args, {
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();

  let disposed = false;
  return {
    ...executable,
    debuggingPort,
    userDataDir: input.userDataDir,
    dispose: async () => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (child.exitCode !== null || child.killed) {
        return;
      }
      child.kill();
      await Promise.race([
        waitForProcessExit(child),
        new Promise((resolve) => setTimeout(resolve, 2_000)),
      ]);
    },
  };
}

export async function waitForCdpEndpointForTests(port: number, timeoutMs: number): Promise<void> {
  return waitForCdpEndpoint(port, timeoutMs);
}

export async function launchCdpBrowser(input: {
  readonly userDataDir: string;
  readonly initialUrl?: string;
}): Promise<LaunchedCdpBrowser> {
  const browserProcess = await launchBrowserProcess(input);
  try {
    await waitForCdpEndpoint(browserProcess.debuggingPort);
    const browser = await chromium.connectOverCDP(
      `http://127.0.0.1:${browserProcess.debuggingPort}`,
    );
    const context = browser.contexts()[0];
    if (!context) {
      await browser.close().catch(() => undefined);
      throw new Error("Chrome/Edge CDP connection did not expose a browser context.");
    }
    return { browserProcess, browser, context };
  } catch (error) {
    await browserProcess.dispose().catch(() => undefined);
    throw error;
  }
}

const browserAutomationServices = new Map<string, BrowserAutomationServiceShape>();

export function createBrowserAutomationService(
  serverConfig: ServerConfigShape,
  dependencies: BrowserAutomationServiceDependencies = {},
): BrowserAutomationServiceShape {
  const profilePaths = resolveBrowserProfilePaths(serverConfig.stateDir);
  const launchBrowser = dependencies.launchCdpBrowser ?? launchCdpBrowser;
  const readFile = dependencies.readFile ?? ((filePath: string) => fs.readFile(filePath, "utf8"));
  const makeDirectory =
    dependencies.makeDirectory ??
    ((directoryPath: string) => fs.mkdir(directoryPath, { recursive: true }).then(() => undefined));
  const removeDirectory =
    dependencies.removeDirectory ??
    ((directoryPath: string) =>
      fs.rm(directoryPath, { recursive: true, force: true }).then(() => undefined));
  let browserProcess: BrowserProcessHandle | null = null;
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let activePage: Page | null = null;

  const readAllowedOrigins = async () => {
    const raw = await readFile(serverConfig.settingsPath).catch(() => "");
    if (!raw.trim()) {
      return [] as string[];
    }
    try {
      const parsed = JSON.parse(raw) as {
        readonly browser?: { readonly allowedOrigins?: unknown };
      };
      return Array.isArray(parsed.browser?.allowedOrigins)
        ? parsed.browser.allowedOrigins.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [];
    } catch {
      return [];
    }
  };

  const clearBrowserHandles = () => {
    browserProcess = null;
    browser = null;
    context = null;
    activePage = null;
  };

  const closeBrowserHandles = async () => {
    const previousBrowser = browser;
    const previousProcess = browserProcess;
    clearBrowserHandles();
    await previousBrowser?.close().catch(() => undefined);
    await previousProcess?.dispose().catch(() => undefined);
  };

  const getPage = async (input?: { readonly initialUrl?: string }): Promise<Page> => {
    await makeDirectory(profilePaths.defaultProfileDir);
    if (!context) {
      const initialUrl = trimText(input?.initialUrl);
      const launched = await launchBrowser({
        userDataDir: profilePaths.defaultProfileDir,
        ...(initialUrl ? { initialUrl } : {}),
      });
      browserProcess = launched.browserProcess;
      browser = launched.browser;
      context = launched.context;
      browser.on("disconnected", clearBrowserHandles);
    }

    activePage = activePage && !activePage.isClosed() ? activePage : (context.pages()[0] ?? null);
    if (!activePage || activePage.isClosed()) {
      activePage = await context.newPage();
    }
    return activePage;
  };

  const snapshot = async (): Promise<BrowserProfileSnapshot> => {
    const page = activePage && !activePage.isClosed() ? activePage : null;
    const currentTitle = page ? await titleOf(page) : undefined;
    const currentUrl = page?.url();
    return {
      profileId: "default",
      profilePath: profilePaths.defaultProfileDir,
      status: context ? "open" : "closed",
      allowedOrigins: await readAllowedOrigins(),
      ...(browserProcess
        ? {
            launchMode: "cdp-attached" as const,
            browserName: browserProcess.browserName,
            debuggingPort: browserProcess.debuggingPort,
          }
        : {}),
      ...(currentUrl && currentUrl !== "about:blank" ? { currentUrl } : {}),
      ...(currentTitle ? { currentTitle } : {}),
    };
  };

  const ensureAllowed = async (
    action: BrowserActionKind,
    input: {
      readonly url?: string;
      readonly currentUrl?: string;
      readonly selector?: string;
      readonly text?: string;
    },
  ) => {
    const decision = evaluateBrowserPolicy({
      action,
      ...input,
      allowedOrigins: await readAllowedOrigins(),
    });
    return decision.allowed
      ? { allowed: true as const, origin: decision.origin }
      : {
          allowed: false as const,
          result: blockedResult({
            action,
            reason: decision.reason ?? "Blocked browser action.",
            ...((input.url ?? input.currentUrl) ? { url: input.url ?? input.currentUrl } : {}),
            ...(decision.origin ? { origin: decision.origin } : {}),
          }),
        };
  };

  const summarizePage = async (
    action: BrowserActionKind,
    page: Page,
  ): Promise<BrowserToolResult> => {
    const title = await titleOf(page);
    const url = page.url();
    return {
      action,
      blocked: false,
      url,
      ...(title ? { title } : {}),
      ...(normalizeBrowserOrigin(url) ? { origin: normalizeBrowserOrigin(url)! } : {}),
    };
  };

  return {
    snapshot,
    openLoginWindow: async (input) => {
      const url = trimText(input?.url);
      const page = await getPage(url ? { initialUrl: normalizeBrowserUrl(url) } : {});
      if (url) {
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      }
      await page.bringToFront();
      return snapshot();
    },
    closeBrowser: async () => {
      await closeBrowserHandles();
      return snapshot();
    },
    clearProfileData: async () => {
      await closeBrowserHandles();
      await removeDirectory(profilePaths.defaultProfileDir);
      await makeDirectory(profilePaths.defaultProfileDir);
      return snapshot();
    },
    navigate: async ({ url }) => {
      const targetUrl = normalizeBrowserUrl(url);
      const policy = await ensureAllowed("navigate", { url: targetUrl });
      if (!policy.allowed) {
        return policy.result;
      }
      const page = await getPage();
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      return summarizePage("navigate", page);
    },
    search: async ({ query, url }) => {
      const normalizedQuery = trimText(query);
      if (!normalizedQuery) {
        return blockedResult({
          action: "search",
          reason: "Blocked browser action: query is empty.",
        });
      }

      const page = await getPage();
      if (trimText(url)) {
        const targetUrl = normalizeBrowserUrl(url!);
        const policy = await ensureAllowed("search", { url: targetUrl });
        if (!policy.allowed) {
          return policy.result;
        }
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
      } else {
        const policy = await ensureAllowed("search", { currentUrl: page.url() });
        if (!policy.allowed) {
          return policy.result;
        }
      }

      const searchBox = page
        .locator(
          'input[type="search"], input[name="q"], input[aria-label*="search" i], input[placeholder*="search" i], textarea[aria-label*="search" i]',
        )
        .first();
      await searchBox.fill(normalizedQuery);
      await searchBox.press("Enter");
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      return summarizePage("search", page);
    },
    click: async ({ selector, text }) => {
      const page = await getPage();
      const policy = await ensureAllowed("click", {
        currentUrl: page.url(),
        ...(selector ? { selector } : {}),
        ...(text ? { text } : {}),
      });
      if (!policy.allowed) {
        return policy.result;
      }
      if (trimText(selector)) {
        await page.locator(selector!).first().click();
      } else if (trimText(text)) {
        await page.getByText(text!, { exact: false }).first().click();
      } else {
        return blockedResult({
          action: "click",
          reason: "Blocked browser action: selector or text is required.",
          url: page.url(),
        });
      }
      await page.waitForLoadState("domcontentloaded").catch(() => undefined);
      return summarizePage("click", page);
    },
    scroll: async (input) => {
      const page = await getPage();
      const policy = await ensureAllowed("scroll", { currentUrl: page.url() });
      if (!policy.allowed) {
        return policy.result;
      }
      const amount = Math.max(100, Math.min(3000, input?.amount ?? 750));
      await page.mouse.wheel(0, input?.direction === "up" ? -amount : amount);
      return summarizePage("scroll", page);
    },
    extractText: async (input) => {
      const page = await getPage();
      const policy = await ensureAllowed("extract_text", { currentUrl: page.url() });
      if (!policy.allowed) {
        return policy.result;
      }
      const maxChars = Math.max(500, Math.min(40_000, input?.maxChars ?? 12_000));
      const text = await page
        .locator("body")
        .innerText({ timeout: 5_000 })
        .catch(() => "");
      return {
        ...(await summarizePage("extract_text", page)),
        text: text.slice(0, maxChars),
      };
    },
    screenshot: async () => {
      const page = await getPage();
      const policy = await ensureAllowed("screenshot", { currentUrl: page.url() });
      if (!policy.allowed) {
        return policy.result;
      }
      const bytes = await page.screenshot({ type: "png" });
      return {
        ...(await summarizePage("screenshot", page)),
        screenshotBase64: bytes.toString("base64"),
        mimeType: "image/png",
      };
    },
  } satisfies BrowserAutomationServiceShape;
}

export function getBrowserAutomationService(
  serverConfig: ServerConfigShape,
): BrowserAutomationServiceShape {
  const existing = browserAutomationServices.get(serverConfig.stateDir);
  if (existing) {
    return existing;
  }
  const created = createBrowserAutomationService(serverConfig);
  browserAutomationServices.set(serverConfig.stateDir, created);
  return created;
}

export const makeBrowserAutomationService = Effect.gen(function* () {
  const serverConfig = yield* ServerConfig;
  return getBrowserAutomationService(serverConfig);
});

export const BrowserAutomationServiceLive = Layer.effect(
  BrowserAutomationService,
  makeBrowserAutomationService,
);
