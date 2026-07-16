const FNV_OFFSET_HIGH = 0xcbf29ce4;
const FNV_OFFSET_LOW = 0x84222325;
const FNV_PRIME_HIGH = 0x100;
const FNV_PRIME_LOW = 0x1b3;
const UINT32_RANGE = 0x1_0000_0000;

const RULE_CASE_KEYS = [
  "fenAfter",
  "fenBefore",
  "inputFen",
  "outputFen",
] as const;

export type RuleTestCase = {
  readonly fenAfter: string;
  readonly fenBefore: string;
  readonly inputFen: string;
  readonly outputFen: string;
};

export type TerminalEventKind = "next-turn" | "game-over";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** FNV-1a 64-bit, implemented as two 32-bit limbs to avoid per-byte bigint work. */
export function fnv1a64(bytes: Uint8Array): bigint {
  let high = FNV_OFFSET_HIGH;
  let low = FNV_OFFSET_LOW;

  for (const byte of bytes) {
    low = (low ^ byte) >>> 0;
    const lowProduct = low * FNV_PRIME_LOW;
    const carry = Math.floor(lowProduct / UINT32_RANGE);
    high =
      (Math.imul(high, FNV_PRIME_LOW) +
        Math.imul(low, FNV_PRIME_HIGH) +
        carry) >>>
      0;
    low = lowProduct >>> 0;
  }

  return (BigInt(high) << 32n) | BigInt(low);
}

export function parseCanonicalRuleTestCase(raw: string): RuleTestCase {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new Error(`invalid JSON: ${errorMessage(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("fixture must be a JSON object");
  }
  const keys = Object.keys(parsed);
  if (
    keys.length !== RULE_CASE_KEYS.length ||
    keys.some((key, index) => key !== RULE_CASE_KEYS[index])
  ) {
    throw new Error(
      `fixture keys must be ${JSON.stringify(RULE_CASE_KEYS)}, got ${JSON.stringify(keys)}`,
    );
  }

  const fenAfter = parsed["fenAfter"];
  const fenBefore = parsed["fenBefore"];
  const inputFen = parsed["inputFen"];
  const outputFen = parsed["outputFen"];
  if (
    typeof fenAfter !== "string" ||
    typeof fenBefore !== "string" ||
    typeof inputFen !== "string" ||
    typeof outputFen !== "string"
  ) {
    throw new Error("all fixture fields must be JSON strings");
  }
  if (JSON.stringify(parsed) !== raw) {
    throw new Error("fixture is not canonical minified JSON");
  }

  return { fenAfter, fenBefore, inputFen, outputFen };
}

/**
 * Returns a diagnostic when turn-terminal event membership is wrong. Other
 * events may occur on either side of the terminal event; in particular,
 * `mon-awake` is allowed after `next-turn` to match the legacy event ordering.
 */
export function terminalEventMembershipError(
  events: readonly { readonly kind: string }[],
  expected: TerminalEventKind | undefined,
): string | undefined {
  const nextTurnCount = events.filter(
    (event) => event.kind === "next-turn",
  ).length;
  const gameOverCount = events.filter(
    (event) => event.kind === "game-over",
  ).length;

  if (expected === undefined) {
    return nextTurnCount === 0 && gameOverCount === 0
      ? undefined
      : "a non-final input emitted a turn-terminal event";
  }
  if (expected === "next-turn") {
    return nextTurnCount === 1 && gameOverCount === 0
      ? undefined
      : `expected exactly one next-turn and no game-over; got ${nextTurnCount} next-turn and ${gameOverCount} game-over`;
  }
  return gameOverCount === 1 && nextTurnCount === 0
    ? undefined
    : `expected exactly one game-over and no next-turn; got ${gameOverCount} game-over and ${nextTurnCount} next-turn`;
}
