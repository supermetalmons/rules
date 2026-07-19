const RULE_CASE_KEYS = [
  "fenAfter",
  "fenBefore",
  "inputFen",
  "outputFen",
] as const;

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

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

export function fail(message: string): never {
  throw new Error(message);
}

/** Decode one complete UTF-8 record, rejecting malformed byte sequences. */
export function decodeUtf8Strict(bytes: Uint8Array): string {
  return UTF8_DECODER.decode(bytes);
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
 * `mon-awake` is allowed after `next-turn` by the event ordering contract.
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
