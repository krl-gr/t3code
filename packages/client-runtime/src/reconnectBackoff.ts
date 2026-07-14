export interface ReconnectBackoffConfig {
  readonly initialDelayMs: number;
  readonly backoffFactor: number;
  readonly maxDelayMs: number;
  readonly maxRetries: number | null;
}

export const DEFAULT_RECONNECT_BACKOFF: ReconnectBackoffConfig = {
  initialDelayMs: 1_000,
  backoffFactor: 2,
  maxDelayMs: 64_000,
  maxRetries: 7,
};

export function getReconnectDelayMs(
  retryIndex: number,
  config: ReconnectBackoffConfig = DEFAULT_RECONNECT_BACKOFF,
): number | null {
  if (!Number.isInteger(retryIndex) || retryIndex < 0) {
    return null;
  }

  if (config.maxRetries !== null && retryIndex >= config.maxRetries) {
    return null;
  }

  return Math.min(
    Math.round(config.initialDelayMs * config.backoffFactor ** retryIndex),
    config.maxDelayMs,
  );
}
