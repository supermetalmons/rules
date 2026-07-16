import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GameVariant } from "../engine/config.js";
import { MonsGame } from "../engine/game.js";
import { parseInputArrayFen } from "../engine/fen.js";
import { forEachByteLine } from "./byte-lines.js";
import {
  errorMessage,
  isRecord,
  terminalEventMembershipError,
  type TerminalEventKind,
} from "./regression-support.js";

const EXPECTED_BYTES = 2_273_026;
const EXPECTED_SHA256 =
  "5bc194f15516a9c275807415910c95b2e62ce63df9e575ac93e1dd93013197eb";
const EXPECTED_GAME_COUNT = 1_527;
const EXPECTED_TURN_COUNT = 25_185;
const EXPECTED_INPUT_COUNT = 169_480;
const PROGRESS_INTERVAL = 250;
const LOCATION_TOKEN = /^l(?:[0-9]|10),(?:[0-9]|10)$/u;
const MODIFIER_TOKEN = /^m(?:p|b|c)$/u;

const VARIANT_BY_NAME = Object.freeze({
  Classic: GameVariant.Classic,
  SwappedManaRows: GameVariant.SwappedManaRows,
  OffsetArcManaRows: GameVariant.OffsetArcManaRows,
  CenterSpokeManaRows: GameVariant.CenterSpokeManaRows,
  AlternatingManaRows: GameVariant.AlternatingManaRows,
  InnerWedgeManaRows: GameVariant.InnerWedgeManaRows,
  OuterWedgeManaRows: GameVariant.OuterWedgeManaRows,
  BentCenterManaRows: GameVariant.BentCenterManaRows,
  OuterEdgeManaRows: GameVariant.OuterEdgeManaRows,
  SplitFlankManaRows: GameVariant.SplitFlankManaRows,
  ForwardBridgeManaRows: GameVariant.ForwardBridgeManaRows,
  CornerChainManaRows: GameVariant.CornerChainManaRows,
});

type VariantName = keyof typeof VARIANT_BY_NAME;

const EXPECTED_VARIANT_COUNTS: Readonly<Record<VariantName, number>> =
  Object.freeze({
    Classic: 1_486,
    SwappedManaRows: 2,
    OffsetArcManaRows: 4,
    CenterSpokeManaRows: 3,
    AlternatingManaRows: 6,
    InnerWedgeManaRows: 3,
    OuterWedgeManaRows: 2,
    BentCenterManaRows: 6,
    OuterEdgeManaRows: 2,
    SplitFlankManaRows: 4,
    ForwardBridgeManaRows: 6,
    CornerChainManaRows: 3,
  });

type CompleteGameRecord = {
  readonly gameVariant: VariantName;
  readonly turns: readonly (readonly string[])[];
};

function fail(message: string): never {
  throw new Error(message);
}

function isVariantName(value: string): value is VariantName {
  return Object.hasOwn(VARIANT_BY_NAME, value);
}

function isCanonicalInputFen(inputFen: string): boolean {
  if (inputFen === "z") {
    return true;
  }
  return inputFen
    .split(";")
    .every((token) => LOCATION_TOKEN.test(token) || MODIFIER_TOKEN.test(token));
}

function parseRecord(raw: string, line: number): CompleteGameRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    fail(`line ${line} is not valid JSON: ${errorMessage(error)}`);
  }
  if (!isRecord(parsed)) {
    fail(`line ${line} must be a JSON object`);
  }
  const keys = Object.keys(parsed);
  if (keys.length !== 2 || keys[0] !== "gameVariant" || keys[1] !== "turns") {
    fail(
      `line ${line} keys must be ["gameVariant","turns"], got ${JSON.stringify(keys)}`,
    );
  }
  if (JSON.stringify(parsed) !== raw) {
    fail(`line ${line} is not canonical compact JSON`);
  }

  const variantValue = parsed["gameVariant"];
  const turnsValue = parsed["turns"];
  if (typeof variantValue !== "string" || !isVariantName(variantValue)) {
    fail(
      `line ${line} has unknown gameVariant ${JSON.stringify(variantValue)}`,
    );
  }
  if (!Array.isArray(turnsValue) || turnsValue.length === 0) {
    fail(`line ${line} turns must be a non-empty array`);
  }

  const turns: string[][] = [];
  for (const [turnIndex, turnValue] of turnsValue.entries()) {
    if (!Array.isArray(turnValue) || turnValue.length === 0) {
      fail(`line ${line} turn ${turnIndex + 1} must be a non-empty array`);
    }
    const turn: string[] = [];
    for (const [inputIndex, inputValue] of turnValue.entries()) {
      if (
        typeof inputValue !== "string" ||
        inputValue.length === 0 ||
        !isCanonicalInputFen(inputValue)
      ) {
        fail(
          `line ${line} turn ${turnIndex + 1} input ${inputIndex + 1} is not canonical input FEN: ${JSON.stringify(inputValue)}`,
        );
      }
      turn.push(inputValue);
    }
    turns.push(turn);
  }
  return { gameVariant: variantValue, turns };
}

function replayGame(
  record: CompleteGameRecord,
  line: number,
): {
  readonly inputs: number;
  readonly turns: number;
} {
  const game = new MonsGame(false, VARIANT_BY_NAME[record.gameVariant]);
  let inputCount = 0;

  for (const [turnIndex, turn] of record.turns.entries()) {
    const lastTurn = turnIndex === record.turns.length - 1;
    for (const [inputIndex, inputFen] of turn.entries()) {
      inputCount += 1;
      const lastInput = inputIndex === turn.length - 1;
      const before = game.fen();
      const parsedInputs = parseInputArrayFen(inputFen);
      if (parsedInputs.length !== inputFen.split(";").length) {
        fail(
          `line ${line} turn ${turnIndex + 1} input ${inputIndex + 1} did not parse completely: ${inputFen}`,
        );
      }

      let output;
      try {
        output = game.processInput(parsedInputs, false, false);
      } catch (error) {
        fail(
          `line ${line} turn ${turnIndex + 1} input ${inputIndex + 1} threw: ${errorMessage(error)}\n` +
            `fenBefore: ${before}\ninputFen: ${inputFen}`,
        );
      }
      if (output.kind !== "events" || output.events.length === 0) {
        fail(
          `line ${line} turn ${turnIndex + 1} input ${inputIndex + 1} is not a resolved legal input ` +
            `(output ${output.kind})\nfenBefore: ${before}\ninputFen: ${inputFen}`,
        );
      }

      const expectedTerminal: TerminalEventKind | undefined = lastInput
        ? lastTurn
          ? "game-over"
          : "next-turn"
        : undefined;
      const terminalError = terminalEventMembershipError(
        output.events,
        expectedTerminal,
      );
      if (terminalError !== undefined) {
        fail(
          `line ${line} turn ${turnIndex + 1} input ${inputIndex + 1}: ${terminalError}\n` +
            `fenBefore: ${before}\ninputFen: ${inputFen}\n` +
            `eventKinds: ${output.events.map((event) => event.kind).join(",")}`,
        );
      }
    }
  }

  return { inputs: inputCount, turns: record.turns.length };
}

function parseOptions(argv: readonly string[]): {
  readonly corpusRoot: string;
} {
  const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
  let corpusRoot = path.join(
    repositoryRoot,
    "test-data",
    "complete-games",
    "v1",
  );

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      const value = argv[index + 1];
      if (value === undefined) {
        fail("--root requires a directory path");
      }
      corpusRoot = path.resolve(value);
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      console.log(
        "usage: node scripts/run-complete-games.mjs [--root <corpus-directory>]",
      );
      process.exit(0);
    } else {
      fail(`unknown argument: ${String(argument)}`);
    }
  }
  return { corpusRoot };
}

async function run(): Promise<void> {
  const { corpusRoot } = parseOptions(process.argv.slice(2));
  const corpusPath = path.join(corpusRoot, "complete-games.jsonl");
  const variantCounts = Object.fromEntries(
    Object.keys(VARIANT_BY_NAME).map((name) => [name, 0]),
  ) as Record<VariantName, number>;
  let gameCount = 0;
  let turnCount = 0;
  let inputCount = 0;

  const summary = await forEachByteLine(
    createReadStream(corpusPath),
    (rawBytes, line) => {
      if (rawBytes.length === 0) {
        fail(`line ${line} is empty`);
      }
      let raw: string;
      try {
        raw = new TextDecoder("utf-8", { fatal: true }).decode(rawBytes);
      } catch (error) {
        fail(`line ${line} is not valid UTF-8: ${errorMessage(error)}`);
      }
      const record = parseRecord(raw, line);
      gameCount += 1;
      variantCounts[record.gameVariant] += 1;
      const replayed = replayGame(record, line);
      turnCount += replayed.turns;
      inputCount += replayed.inputs;

      if (gameCount % PROGRESS_INTERVAL === 0) {
        console.error(
          `progress: ${gameCount}/${EXPECTED_GAME_COUNT} complete games replayed`,
        );
      }
    },
  );

  if (!summary.endsWithLf || summary.containsCarriageReturn) {
    fail("complete games corpus must use LF and end with exactly one LF");
  }
  if (summary.bytes !== EXPECTED_BYTES) {
    fail(`corpus byte count: expected ${EXPECTED_BYTES}, got ${summary.bytes}`);
  }
  if (summary.sha256 !== EXPECTED_SHA256) {
    fail(`corpus SHA-256: expected ${EXPECTED_SHA256}, got ${summary.sha256}`);
  }
  if (gameCount !== EXPECTED_GAME_COUNT || summary.lineCount !== gameCount) {
    fail(`game count: expected ${EXPECTED_GAME_COUNT}, got ${gameCount}`);
  }
  if (turnCount !== EXPECTED_TURN_COUNT) {
    fail(`turn count: expected ${EXPECTED_TURN_COUNT}, got ${turnCount}`);
  }
  if (inputCount !== EXPECTED_INPUT_COUNT) {
    fail(`input count: expected ${EXPECTED_INPUT_COUNT}, got ${inputCount}`);
  }
  for (const variant of Object.keys(VARIANT_BY_NAME) as VariantName[]) {
    const actual = variantCounts[variant];
    const expected = EXPECTED_VARIANT_COUNTS[variant];
    if (actual !== expected) {
      fail(`${variant} game count: expected ${expected}, got ${actual}`);
    }
  }

  console.log(
    `complete games replay passed: ${gameCount} games, ${turnCount} turns, ${inputCount} inputs across 12 variants`,
  );
}

void run().catch((error: unknown) => {
  console.error(`complete games replay failed: ${errorMessage(error)}`);
  process.exitCode = 1;
});
