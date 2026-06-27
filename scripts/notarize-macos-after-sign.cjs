"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const DEFAULT_TIMEOUT_MINUTES = 75;
const POLL_INTERVAL_MS = 30_000;
const STATUS_LOG_INTERVAL_MS = 120_000;

function readPositiveIntegerEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function redactNotaryText(text) {
  const keyPath = process.env.APPLE_API_KEY;
  return keyPath ? text.replaceAll(keyPath, "<APPLE_API_KEY_PATH>") : text;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: options.timeoutMs ?? 120_000,
  });
  const stdout = result.stdout ? redactNotaryText(result.stdout.trim()) : "";
  const stderr = result.stderr ? redactNotaryText(result.stderr.trim()) : "";

  if (result.error) {
    const message =
      result.error.code === "ETIMEDOUT"
        ? `${command} timed out after ${options.timeoutMs}ms`
        : result.error.message;
    throw new Error([message, stdout, stderr].filter(Boolean).join("\n"));
  }

  if (result.status !== 0) {
    throw new Error(
      [
        `${command} exited with status ${result.status}`,
        stdout && `stdout:\n${stdout}`,
        stderr && `stderr:\n${stderr}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return stdout;
}

function runJson(command, args, options) {
  const output = run(command, args, options);
  try {
    return JSON.parse(output);
  } catch (cause) {
    throw new Error(`Could not parse JSON output from ${command}: ${output}`, { cause });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findAppBundle(appOutDir) {
  const appBundles = fs
    .readdirSync(appOutDir)
    .filter((entry) => entry.endsWith(".app"))
    .map((entry) => path.join(appOutDir, entry));

  if (appBundles.length !== 1) {
    throw new Error(
      `Expected exactly one .app bundle in ${appOutDir}, found ${appBundles.length}: ${appBundles.join(", ")}`,
    );
  }

  return appBundles[0];
}

function createAppZip(appPath) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "t3code-notary-"));
  const zipPath = path.join(tempDir, `${path.basename(appPath, ".app")}.zip`);
  console.log(`[notary] Creating upload archive ${zipPath}`);
  run("ditto", ["-c", "-k", "--keepParent", appPath, zipPath], { timeoutMs: 10 * 60_000 });
  return zipPath;
}

function getCredentials() {
  const key = process.env.APPLE_API_KEY;
  const keyId = process.env.APPLE_API_KEY_ID;
  const issuer = process.env.APPLE_API_ISSUER;

  if (!key || !keyId || !issuer) {
    throw new Error("Missing APPLE_API_KEY, APPLE_API_KEY_ID, or APPLE_API_ISSUER for notarization.");
  }

  return ["--key", key, "--key-id", keyId, "--issuer", issuer];
}

function fetchNotaryLog(submissionId, credentials) {
  try {
    const log = run("xcrun", ["notarytool", "log", submissionId, ...credentials], {
      timeoutMs: 120_000,
    });
    if (log) {
      console.log(`[notary] Apple log for ${submissionId}:\n${log}`);
    }
  } catch (error) {
    console.log(`[notary] Could not fetch Apple log for ${submissionId}: ${error.message}`);
  }
}

async function waitForNotaryResult(submissionId, credentials) {
  const timeoutMinutes = readPositiveIntegerEnv(
    "T3CODE_NOTARY_TIMEOUT_MINUTES",
    DEFAULT_TIMEOUT_MINUTES,
  );
  const deadline = Date.now() + timeoutMinutes * 60_000;
  let lastLoggedAt = 0;
  let lastStatus = "";

  while (Date.now() < deadline) {
    const info = runJson(
      "xcrun",
      ["notarytool", "info", submissionId, ...credentials, "--output-format", "json"],
      { timeoutMs: 120_000 },
    );
    const status = String(info.status ?? "");
    const now = Date.now();

    if (status !== lastStatus || now - lastLoggedAt >= STATUS_LOG_INTERVAL_MS) {
      console.log(`[notary] ${submissionId} status: ${status || "unknown"}`);
      lastStatus = status;
      lastLoggedAt = now;
    }

    if (status === "Accepted") {
      return;
    }

    if (status === "Invalid" || status === "Rejected") {
      fetchNotaryLog(submissionId, credentials);
      throw new Error(`Apple notarization ${submissionId} finished with status ${status}.`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  fetchNotaryLog(submissionId, credentials);
  throw new Error(
    `Apple notarization ${submissionId} did not finish within ${timeoutMinutes} minutes.`,
  );
}

async function notarizeMacAfterSign(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = findAppBundle(context.appOutDir);
  const zipPath = createAppZip(appPath);
  const credentials = getCredentials();

  console.log(`[notary] Submitting ${path.basename(appPath)} to Apple notary service.`);
  const submission = runJson(
    "xcrun",
    ["notarytool", "submit", zipPath, ...credentials, "--output-format", "json"],
    { timeoutMs: 10 * 60_000 },
  );
  const submissionId = submission.id;
  if (!submissionId) {
    throw new Error(`Apple notarization submission did not return an id: ${JSON.stringify(submission)}`);
  }

  console.log(`[notary] Apple submission id: ${submissionId}`);
  if (submission.status) {
    console.log(`[notary] Initial status: ${submission.status}`);
  }

  await waitForNotaryResult(submissionId, credentials);

  console.log(`[notary] Stapling notarization ticket to ${appPath}`);
  run("xcrun", ["stapler", "staple", appPath], { timeoutMs: 5 * 60_000 });
  run("xcrun", ["stapler", "validate", appPath], { timeoutMs: 5 * 60_000 });
  console.log(`[notary] Stapled and validated ${path.basename(appPath)}.`);
}

module.exports = notarizeMacAfterSign;
module.exports.default = notarizeMacAfterSign;
