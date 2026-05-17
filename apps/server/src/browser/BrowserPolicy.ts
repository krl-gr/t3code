export const DEFAULT_BROWSER_PROFILE_ID = "default" as const;

export type BrowserActionKind =
  | "navigate"
  | "search"
  | "click"
  | "scroll"
  | "extract_text"
  | "screenshot";

export interface BrowserPolicyInput {
  readonly action: BrowserActionKind;
  readonly url?: string | undefined;
  readonly currentUrl?: string | undefined;
  readonly selector?: string | undefined;
  readonly text?: string | undefined;
  readonly allowedOrigins: ReadonlyArray<string>;
}

export interface BrowserPolicyDecision {
  readonly allowed: boolean;
  readonly reason?: string;
  readonly origin?: string;
}

const BLOCKED_ACTION_PATTERNS = [
  /\bpost\b/,
  /\bcomment\b/,
  /\breply\b/,
  /\blike\b/,
  /\brepost\b/,
  /\bshare\b/,
  /\bfollow\b/,
  /\bsubscribe\b/,
  /\bdm\b/,
  /\bmessage\b/,
  /\bsend\b/,
  /\bdelete\b/,
  /\breport\b/,
  /\bblock\b/,
  /\bupload\b/,
  /\bdownload\b/,
  /\bpassword\b/,
  /\bemail\b/,
  /\btoken\b/,
  /\bpayment\b/,
  /\bcard\b/,
  /\bcheckout\b/,
] as const;

export function normalizeBrowserOrigin(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeBrowserUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("URL is required.");
  }
  return trimmed.includes("://") ? trimmed : `https://${trimmed}`;
}

export function isBrowserOriginAllowed(
  value: string | null | undefined,
  allowedOrigins: ReadonlyArray<string>,
): boolean {
  const origin = normalizeBrowserOrigin(value);
  if (!origin) {
    return false;
  }
  return allowedOrigins.some((entry) => normalizeBrowserOrigin(entry) === origin);
}

function inputContainsBlockedAction(input: BrowserPolicyInput): boolean {
  const searchable = [input.selector, input.text].filter(Boolean).join(" ").toLowerCase();
  return BLOCKED_ACTION_PATTERNS.some((pattern) => pattern.test(searchable));
}

function targetOrigin(input: BrowserPolicyInput): string | null {
  if (input.url) {
    return normalizeBrowserOrigin(input.url);
  }
  if (input.currentUrl && input.currentUrl !== "about:blank") {
    return normalizeBrowserOrigin(input.currentUrl);
  }
  return null;
}

export function evaluateBrowserPolicy(input: BrowserPolicyInput): BrowserPolicyDecision {
  if (input.action === "click" && inputContainsBlockedAction(input)) {
    return {
      allowed: false,
      reason: "Blocked browser action: this click looks like a mutating social/account action.",
    };
  }

  const origin = targetOrigin(input);
  if (!origin) {
    return {
      allowed: false,
      reason: "Blocked browser action: target page origin is unknown.",
    };
  }

  if (!isBrowserOriginAllowed(origin, input.allowedOrigins)) {
    return {
      allowed: false,
      origin,
      reason: `Blocked browser action: ${origin} is not in the allowed origins list.`,
    };
  }

  return { allowed: true, origin };
}
