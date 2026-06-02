const KEY_ALIASES: Readonly<Record<string, string>> = {
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  ArrowUp: "Up",
  Enter: "Return",
  Esc: "Escape",
};

const MODIFIER_ALIASES: Readonly<Record<string, string>> = {
  alt: "alt",
  cmd: "super",
  ctrl: "ctrl",
  shift: "shift",
};

const ARG_NAME_ALIASES: Readonly<Record<string, string>> = {
  durationMs: "duration_ms",
  elementIndex: "element_index",
  fromElementIndex: "from_element_index",
  fromX: "from_x",
  fromY: "from_y",
  includeScreenshot: "include_screenshot",
  toElementIndex: "to_element_index",
  toX: "to_x",
  toY: "to_y",
  windowId: "window_id",
};

function normalizeKey(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  return KEY_ALIASES[value] ?? value;
}

function normalizePressKeyArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized = normalizeCommonArgs(args);
  const key = normalizeKey(normalized.key);
  const modifiers = Array.isArray(args.modifiers)
    ? args.modifiers
        .map((modifier) => (typeof modifier === "string" ? MODIFIER_ALIASES[modifier] : undefined))
        .filter((modifier): modifier is string => Boolean(modifier))
    : [];

  delete normalized.modifiers;
  normalized.key =
    typeof key === "string" && modifiers.length > 0 && !key.includes("+")
      ? [...modifiers, key].join("+")
      : key;
  return normalized;
}

function normalizeCommonArgs(args: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    normalized[ARG_NAME_ALIASES[key] ?? key] = value;
  }
  return normalized;
}

export function normalizeComputerUseBackendArgs(
  backendName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (backendName === "press_key") {
    return normalizePressKeyArgs(args);
  }
  return normalizeCommonArgs(args);
}
