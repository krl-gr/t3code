#!/usr/bin/env node
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalConsole:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

const repoRoot = NodePath.resolve(import.meta.dirname, "..");
const self = "scripts/check-public-boundary.ts";
const textExtensions = new Set([
  "",
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mjs",
  ".toml",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml",
  ".zsh",
]);
const forbidden = [
  ["@upcomputer", "-pro/"].join(""),
  ["upcomputer", "-pro.git"].join(""),
  ["github.com/", "krl-gr/", "upcomputer", "-pro"].join(""),
];

const tracked = NodeChildProcess.spawnSync("git", ["ls-files", "-z"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (tracked.status !== 0) throw new Error("Could not enumerate tracked public files.");

const findings: string[] = [];
for (const relativePath of tracked.stdout.split("\0").filter(Boolean)) {
  if (relativePath === self || !textExtensions.has(NodePath.extname(relativePath))) continue;
  let text: string;
  try {
    text = NodeFS.readFileSync(NodePath.resolve(repoRoot, relativePath), "utf8");
  } catch {
    continue;
  }
  for (const pattern of forbidden) {
    if (text.includes(pattern)) findings.push(`${relativePath}: contains '${pattern}'`);
  }
}

const remotes = NodeChildProcess.spawnSync("git", ["remote", "-v"], {
  cwd: repoRoot,
  encoding: "utf8",
});
if (remotes.status !== 0) throw new Error("Could not inspect public Git remotes.");
for (const pattern of forbidden.slice(1)) {
  if (remotes.stdout.includes(pattern)) findings.push(`git remote: contains '${pattern}'`);
}

if (findings.length > 0) {
  console.error("Public/private boundary check failed:\n" + findings.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Public/private boundary check passed.");
}
