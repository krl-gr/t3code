import * as NodeURL from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineProject, type TestProjectInlineConfiguration } from "vite-plus/test/config";
import "vite-plus/test/config";
import { defineConfig, type ViteUserConfig } from "vite-plus";
import pkg from "./package.json" with { type: "json" };

import { loadRepoEnv } from "../../scripts/lib/public-config";

const repoEnv = loadRepoEnv();
Object.assign(process.env, repoEnv);

const publicWebRoot = NodeURL.fileURLToPath(new URL(".", import.meta.url));
const publicRepositoryRoot = NodeURL.fileURLToPath(new URL("../..", import.meta.url));
const publicWebNodeModules = NodeURL.fileURLToPath(new URL("./node_modules", import.meta.url));
const publicRoutesDirectory = NodeURL.fileURLToPath(new URL("./src/routes", import.meta.url));
const publicRouteTree = NodeURL.fileURLToPath(new URL("./src/routeTree.gen.ts", import.meta.url));
const port = Number(process.env.PORT ?? 5733);
const host = process.env.HOST?.trim() || "localhost";
const configuredWsUrl = process.env.VITE_WS_URL?.trim();
const configuredRelayUrl = repoEnv.VITE_T3CODE_RELAY_URL?.trim() || "";
const configuredClerkPublishableKey = repoEnv.VITE_CLERK_PUBLISHABLE_KEY?.trim() || "";
const configuredClerkJwtTemplate = repoEnv.VITE_CLERK_JWT_TEMPLATE?.trim() || "";
const configuredRelayTracingUrl = repoEnv.VITE_RELAY_OTLP_TRACES_URL?.trim() || "";
const configuredRelayTracingDataset = repoEnv.VITE_RELAY_OTLP_TRACES_DATASET?.trim() || "";
const configuredRelayTracingToken = repoEnv.VITE_RELAY_OTLP_TRACES_TOKEN?.trim() || "";
const configuredHostedAppChannel = process.env.VITE_HOSTED_APP_CHANNEL?.trim() || "";
const configuredAppVersion = process.env.APP_VERSION?.trim() || pkg.version;
const configuredHostedAppUrl = (() => {
  const explicitHostedAppUrl = process.env.VITE_HOSTED_APP_URL?.trim();
  if (explicitHostedAppUrl) {
    return explicitHostedAppUrl;
  }
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return undefined;
})();
const sourcemapEnv = process.env.T3CODE_WEB_SOURCEMAP?.trim().toLowerCase();

// Vite 8.1's experimental bundled dev mode: serves rolldown-bundled chunks in
// dev for much faster startup/reload on large module graphs, with HMR served
// as hot patches. Opt-in while experimental: T3CODE_BUNDLED_DEV=1 pnpm dev:web
const bundledDevEnv = process.env.T3CODE_BUNDLED_DEV?.trim().toLowerCase();
const bundledDev = bundledDevEnv === "1" || bundledDevEnv === "true";

const buildSourcemap: boolean | "hidden" =
  sourcemapEnv === "0" || sourcemapEnv === "false"
    ? false
    : sourcemapEnv === "hidden"
      ? "hidden"
      : true;

const unitTestProject = {
  extends: true,
  test: {
    name: "unit",
    include: ["src/**/*.test.{ts,tsx}"],
    // The web runtime suite exercises auth bootstrap, saved environments,
    // and websocket subscription lifecycles. Under the full monorepo test
    // run, those async tests can exceed Vitest's default 5s budget.
    hookTimeout: 15_000,
    testTimeout: 15_000,
  },
} satisfies TestProjectInlineConfiguration;

function resolveDevProxyTarget(wsUrl: string | undefined): string | undefined {
  if (!wsUrl) {
    return undefined;
  }

  try {
    const url = new URL(wsUrl);
    if (url.protocol === "ws:") {
      url.protocol = "http:";
    } else if (url.protocol === "wss:") {
      url.protocol = "https:";
    }
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

const devProxyTarget = resolveDevProxyTarget(configuredWsUrl);
const defaultProductEntry = NodeURL.fileURLToPath(
  new URL("./src/product/defaultProductEntry.ts", import.meta.url),
);

const HOST_RUNTIME_PACKAGES = ["react", "react-dom", "@tanstack/react-router", "zustand"] as const;

export interface WebViteConfigOptions {
  readonly productEntry?: string;
  readonly outDir?: string;
  readonly sourcemap?: boolean | "inline" | "hidden";
  readonly aliases?: Readonly<Record<string, string>>;
  readonly additionalFsAllow?: ReadonlyArray<string>;
}

export function createWebViteConfig(options: WebViteConfigOptions = {}): ViteUserConfig {
  return {
    root: publicWebRoot,
    plugins: [
      tanstackRouter({
        target: "react",
        routesDirectory: publicRoutesDirectory,
        generatedRouteTree: publicRouteTree,
      }),
      react(),
      babel({
        // We need to be explicit about the parser options after moving to @vitejs/plugin-react v6.0.0
        // This is because the babel plugin only automatically parses typescript and jsx based on relative paths (e.g. "**/*.ts")
        // whereas the previous version of the plugin parsed all files with a .ts extension.
        // This is causing our packages/ directory to fail to parse, as they are not relative to the CWD.
        parserOpts: { plugins: ["typescript", "jsx"] },
        presets: [reactCompilerPreset()],
      }),
      tailwindcss(),
    ],
    optimizeDeps: {
      include: [
        "@clerk/clerk-js",
        "@clerk/react/internal",
        "@pierre/diffs",
        "@pierre/diffs/editor",
        "@pierre/diffs/react",
        "@pierre/diffs/worker/worker.js",
        "effect/Array",
        "effect/Order",
        "react-dom/client",
      ],
    },
    define: {
      // In dev mode, tell the web app where the WebSocket server lives
      "import.meta.env.VITE_WS_URL": JSON.stringify(configuredWsUrl ?? ""),
      "import.meta.env.VITE_T3CODE_RELAY_URL": JSON.stringify(configuredRelayUrl),
      "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(configuredClerkPublishableKey),
      "import.meta.env.VITE_CLERK_JWT_TEMPLATE": JSON.stringify(configuredClerkJwtTemplate),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_URL": JSON.stringify(configuredRelayTracingUrl),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_DATASET": JSON.stringify(
        configuredRelayTracingDataset,
      ),
      "import.meta.env.VITE_RELAY_OTLP_TRACES_TOKEN": JSON.stringify(configuredRelayTracingToken),
      "import.meta.env.VITE_HOSTED_APP_URL": JSON.stringify(configuredHostedAppUrl ?? ""),
      "import.meta.env.VITE_HOSTED_APP_CHANNEL": JSON.stringify(configuredHostedAppChannel),
      "import.meta.env.APP_VERSION": JSON.stringify(configuredAppVersion),
    },
    resolve: {
      alias: {
        "@upcomputer/web-product-entry": options.productEntry ?? defaultProductEntry,
        ...options.aliases,
        react: `${publicWebNodeModules}/react`,
        "react-dom": `${publicWebNodeModules}/react-dom`,
        "@tanstack/react-router": `${publicWebNodeModules}/@tanstack/react-router`,
        zustand: `${publicWebNodeModules}/zustand`,
      },
      tsconfigPaths: true,
      dedupe: [...HOST_RUNTIME_PACKAGES],
    },
    experimental: {
      bundledDev,
    },
    server: {
      host,
      port,
      strictPort: true,
      fs: {
        allow: [publicRepositoryRoot, ...(options.additionalFsAllow ?? [])],
      },
      watch: {
        ignored: [
          "**/.git/**",
          "**/.turbo/**",
          "**/.astro/**",
          "**/coverage/**",
          "**/dist/**",
          "**/dist-electron/**",
          "**/node_modules/**",
          "**/tsconfig.tsbuildinfo",
        ],
      },
      ...(devProxyTarget
        ? {
            proxy: {
              "/.well-known": {
                target: devProxyTarget,
                changeOrigin: true,
              },
              "/api": {
                target: devProxyTarget,
                changeOrigin: true,
              },
              "/attachments": {
                target: devProxyTarget,
                changeOrigin: true,
              },
            },
          }
        : {}),
      hmr: {
        // Explicit config so Vite's HMR WebSocket connects reliably
        // inside Electron's BrowserWindow. Vite 8 uses console.debug for
        // connection logs — enable "Verbose" in DevTools to see them.
        protocol: "ws",
        host,
        clientPort: port,
      },
    },
    build: {
      outDir: options.outDir ?? "dist",
      emptyOutDir: true,
      sourcemap: options.sourcemap ?? buildSourcemap,
    },
    test: {
      projects: [defineProject(unitTestProject)],
    },
  };
}

export default defineConfig(() => createWebViteConfig());
