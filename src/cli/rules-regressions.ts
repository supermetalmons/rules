import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";

import { MonsGame } from "../engine/game.js";
import { outputFen, parseInputArrayFen } from "../engine/fen.js";
import { forEachByteLine } from "./byte-lines.js";
import {
  errorMessage,
  fnv1a64,
  parseCanonicalRuleTestCase,
  type RuleTestCase,
} from "./regression-support.js";

const EXPECTED_CASE_COUNT = 699_994;
const EXPECTED_UNCOMPRESSED_BYTES = 274_843_626;
const EXPECTED_UNCOMPRESSED_SHA256 =
  "4b5b092987eafe9dad6b2f265b194fcb0f95380f120a6a217d3f5795a1f70f81";
const PROGRESS_INTERVAL = 100_000;
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });

function fail(message: string): never {
  throw new Error(message);
}

function replayCase(line: number, id: bigint, testCase: RuleTestCase): void {
  const game = MonsGame.fromFen(testCase.fenBefore, false);
  if (game === undefined) {
    fail(
      `fixture line ${line} (FNV-1a ID ${id}) has an invalid fenBefore:\n` +
        `fenBefore: ${testCase.fenBefore}\ninputFen:  ${testCase.inputFen}`,
    );
  }

  let actualOutputFen: string;
  try {
    const output = game.processInput(
      parseInputArrayFen(testCase.inputFen),
      false,
      false,
    );
    actualOutputFen = outputFen(output);
  } catch (error) {
    fail(
      `fixture line ${line} (FNV-1a ID ${id}) engine error: ${errorMessage(error)}\n` +
        `fenBefore: ${testCase.fenBefore}\ninputFen:  ${testCase.inputFen}`,
    );
  }
  const actualFenAfter = game.fen();

  if (
    actualOutputFen !== testCase.outputFen ||
    actualFenAfter !== testCase.fenAfter
  ) {
    fail(
      `fixture line ${line} (FNV-1a ID ${id}) rules mismatch:\n` +
        `fenBefore:         ${testCase.fenBefore}\n` +
        `inputFen:          ${testCase.inputFen}\n` +
        `expected output:   ${testCase.outputFen}\n` +
        `actual output:     ${actualOutputFen}\n` +
        `expected fenAfter: ${testCase.fenAfter}\n` +
        `actual fenAfter:   ${actualFenAfter}`,
    );
  }
}

async function run(): Promise<void> {
  const unexpectedArgument = process.argv[2];
  if (unexpectedArgument !== undefined) {
    fail(
      `rules regression runner accepts no arguments (unexpected ${JSON.stringify(unexpectedArgument)})`,
    );
  }
  const corpusPath = process.env["MONS_RULES_CORPUS_PATH"];
  if (corpusPath === undefined || corpusPath === "") {
    fail("MONS_RULES_CORPUS_PATH is not set");
  }

  let previousRaw: Buffer | undefined;
  const seenIds = new Set<bigint>();
  let count = 0;
  const compressed = createReadStream(corpusPath);
  const gunzip = createGunzip();
  compressed.on("error", (error) => gunzip.destroy(error));
  compressed.pipe(gunzip);

  const summary = await forEachByteLine(gunzip, (rawBytes, line) => {
    count = line;
    if (line > EXPECTED_CASE_COUNT) {
      fail(`fixture count exceeds ${EXPECTED_CASE_COUNT} at line ${line}`);
    }
    if (rawBytes.length === 0) {
      fail(`fixture line ${line} is empty`);
    }

    const id = fnv1a64(rawBytes);
    if (previousRaw !== undefined) {
      const ordering = Buffer.compare(rawBytes, previousRaw);
      if (ordering < 0) {
        fail(
          `out-of-order transition at fixture line ${line} (FNV-1a ID ${id}):\n` +
            `previous: ${previousRaw.toString("utf8")}\n` +
            `current:  ${rawBytes.toString("utf8")}`,
        );
      }
      if (ordering === 0) {
        fail(`duplicate transition at fixture line ${line} (FNV-1a ID ${id})`);
      }
    }
    if (seenIds.has(id)) {
      fail(
        `FNV-1a collision at fixture line ${line} (ID ${id}, collision count would exceed zero)`,
      );
    }
    seenIds.add(id);

    let raw: string;
    try {
      raw = UTF8_DECODER.decode(rawBytes);
    } catch (error) {
      fail(
        `fixture line ${line} (FNV-1a ID ${id}) is not valid UTF-8: ${errorMessage(error)}`,
      );
    }
    let testCase: RuleTestCase;
    try {
      testCase = parseCanonicalRuleTestCase(raw);
    } catch (error) {
      fail(
        `invalid fixture JSON at line ${line} (FNV-1a ID ${id}): ${errorMessage(error)}`,
      );
    }
    replayCase(line, id, testCase);
    previousRaw = Buffer.from(rawBytes);

    if (line % PROGRESS_INTERVAL === 0) {
      console.error(
        `progress: ${line}/${EXPECTED_CASE_COUNT} canonical rules transitions passed`,
      );
    }
  });

  if (!summary.endsWithLf) {
    fail("rules corpus must end with an LF");
  }
  if (summary.containsCarriageReturn) {
    fail("rules corpus must use LF line endings without carriage returns");
  }
  if (summary.bytes !== EXPECTED_UNCOMPRESSED_BYTES) {
    fail(
      `uncompressed byte count mismatch: expected ${EXPECTED_UNCOMPRESSED_BYTES}, got ${summary.bytes}`,
    );
  }
  if (summary.sha256 !== EXPECTED_UNCOMPRESSED_SHA256) {
    fail(
      `uncompressed SHA-256 mismatch: expected ${EXPECTED_UNCOMPRESSED_SHA256}, got ${summary.sha256}`,
    );
  }
  if (
    count !== EXPECTED_CASE_COUNT ||
    summary.lineCount !== EXPECTED_CASE_COUNT
  ) {
    fail(
      `fixture count mismatch: expected ${EXPECTED_CASE_COUNT}, read ${summary.lineCount}`,
    );
  }
  if (seenIds.size !== EXPECTED_CASE_COUNT) {
    fail(
      `FNV-1a unique ID count mismatch: expected ${EXPECTED_CASE_COUNT}, got ${seenIds.size}`,
    );
  }

  console.log(`ok: ${EXPECTED_CASE_COUNT} canonical rules transitions passed`);
}

void run().catch((error: unknown) => {
  console.error(`error: ${errorMessage(error)}`);
  process.exitCode = 1;
});
