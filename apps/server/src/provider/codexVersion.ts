export function codexVersionFromUserAgent(userAgent: string): string | undefined {
  // Codex app-server reports values such as `codex_cli_rs/0.141.0`.
  // Keep this parser shared by provider health probes and live sessions so
  // capability gates always describe the binary that is currently running.
  return userAgent.match(/\/([^\s]+)/)?.[1];
}
