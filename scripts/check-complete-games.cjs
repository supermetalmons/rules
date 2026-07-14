"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const REPO_ROOT = path.resolve(__dirname, "..");
const DEFAULT_CORPUS_ROOT = path.join(
  REPO_ROOT,
  "test-data",
  "complete-games",
  "v1",
);

const APPROVED = Object.freeze({
  bytes: 2273026,
  sha256: "5bc194f15516a9c275807415910c95b2e62ce63df9e575ac93e1dd93013197eb",
  recordCount: 1527,
  turnCount: 25185,
  inputCount: 169480,
  variantGameCounts: Object.freeze({
    Classic: 1486,
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
  }),
});

const LOCATION_TOKEN = /^l(?:[0-9]|10),(?:[0-9]|10)$/;
const MODIFIER_TOKEN = /^m(?:p|b|c)$/;

function fail(message) {
  throw new Error(message);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertExactKeys(value, expectedKeys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }

  const actualKeys = Object.keys(value);
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index])
  ) {
    fail(
      `${label} keys: expected ${JSON.stringify(expectedKeys)}, got ${JSON.stringify(actualKeys)}`,
    );
  }
}

function requireFile(filePath, label) {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      fail(`${label} is missing: ${filePath}`);
    }
    throw error;
  }

  if (!stats.isFile()) {
    fail(`${label} is not a regular file: ${filePath}`);
  }
}

function parseOptions(argv) {
  let corpusRoot = DEFAULT_CORPUS_ROOT;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      index += 1;
      if (index >= argv.length) {
        fail("--root requires a directory path");
      }
      corpusRoot = path.resolve(argv[index]);
    } else if (argument === "--help" || argument === "-h") {
      console.log("usage: node scripts/check-complete-games.cjs [--root <corpus-directory>]");
      process.exit(0);
    } else {
      fail(`unknown argument: ${argument}`);
    }
  }

  return { corpusRoot };
}

function validateManifest(manifest) {
  assertExactKeys(
    manifest,
    [
      "schemaVersion",
      "corpusVersion",
      "description",
      "license",
      "source",
      "format",
      "statistics",
      "artifact",
    ],
    "manifest",
  );
  assertEqual(manifest.schemaVersion, 1, "manifest.schemaVersion");
  assertEqual(manifest.corpusVersion, "complete-games-v1", "manifest.corpusVersion");
  assertEqual(typeof manifest.description, "string", "manifest.description type");
  assertEqual(manifest.license, "CC0-1.0", "manifest.license");

  assertExactKeys(
    manifest.source,
    ["kind", "sourceIdsIncluded", "directIdentifiersIncluded"],
    "manifest.source",
  );
  assertEqual(manifest.source.kind, "real-player-complete-games", "manifest.source.kind");
  assertEqual(manifest.source.sourceIdsIncluded, false, "manifest.source.sourceIdsIncluded");
  assertEqual(
    manifest.source.directIdentifiersIncluded,
    false,
    "manifest.source.directIdentifiersIncluded",
  );

  assertExactKeys(
    manifest.format,
    [
      "kind",
      "encoding",
      "canonicalJson",
      "trailingNewline",
      "lineOrderHasMeaning",
      "duplicateRecordsAllowed",
    ],
    "manifest.format",
  );
  assertEqual(manifest.format.kind, "jsonl", "manifest.format.kind");
  assertEqual(manifest.format.encoding, "UTF-8", "manifest.format.encoding");
  assertEqual(manifest.format.canonicalJson, true, "manifest.format.canonicalJson");
  assertEqual(manifest.format.trailingNewline, true, "manifest.format.trailingNewline");
  assertEqual(manifest.format.lineOrderHasMeaning, false, "manifest.format.lineOrderHasMeaning");
  assertEqual(
    manifest.format.duplicateRecordsAllowed,
    true,
    "manifest.format.duplicateRecordsAllowed",
  );

  assertExactKeys(
    manifest.statistics,
    ["recordCount", "turnCount", "inputCount", "variantGameCounts"],
    "manifest.statistics",
  );
  assertEqual(
    manifest.statistics.recordCount,
    APPROVED.recordCount,
    "manifest.statistics.recordCount",
  );
  assertEqual(
    manifest.statistics.turnCount,
    APPROVED.turnCount,
    "manifest.statistics.turnCount",
  );
  assertEqual(
    manifest.statistics.inputCount,
    APPROVED.inputCount,
    "manifest.statistics.inputCount",
  );
  assertExactKeys(
    manifest.statistics.variantGameCounts,
    Object.keys(APPROVED.variantGameCounts),
    "manifest.statistics.variantGameCounts",
  );
  for (const [variant, expectedCount] of Object.entries(APPROVED.variantGameCounts)) {
    assertEqual(
      manifest.statistics.variantGameCounts[variant],
      expectedCount,
      `manifest.statistics.variantGameCounts.${variant}`,
    );
  }

  assertExactKeys(manifest.artifact, ["path", "bytes", "sha256"], "manifest.artifact");
  assertEqual(
    manifest.artifact.path,
    "test-data/complete-games/v1/complete-games.jsonl",
    "manifest.artifact.path",
  );
  assertEqual(manifest.artifact.bytes, APPROVED.bytes, "manifest.artifact.bytes");
  assertEqual(manifest.artifact.sha256, APPROVED.sha256, "manifest.artifact.sha256");
}

function isCanonicalInputFen(inputFen) {
  if (inputFen === "z") {
    return true;
  }

  const tokens = inputFen.split(";");
  return tokens.every(
    (token) => LOCATION_TOKEN.test(token) || MODIFIER_TOKEN.test(token),
  );
}

function validateCorpus(buffer) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch (error) {
    fail(`corpus is not valid UTF-8: ${error.message}`);
  }

  if (text.charCodeAt(0) === 0xfeff) {
    fail("corpus must not start with a UTF-8 BOM");
  }
  if (text.includes("\r")) {
    fail("corpus must use LF line endings without carriage returns");
  }
  if (!text.endsWith("\n")) {
    fail("corpus must end with exactly one trailing newline");
  }

  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0 || lines.some((line) => line.length === 0)) {
    fail("corpus must contain one non-empty JSON object per line");
  }

  const variantGameCounts = Object.fromEntries(
    Object.keys(APPROVED.variantGameCounts).map((variant) => [variant, 0]),
  );
  let turnCount = 0;
  let inputCount = 0;

  for (const [lineIndex, line] of lines.entries()) {
    const lineNumber = lineIndex + 1;
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      fail(`line ${lineNumber} is not valid JSON: ${error.message}`);
    }

    assertExactKeys(record, ["gameVariant", "turns"], `line ${lineNumber} record`);
    if (JSON.stringify(record) !== line) {
      fail(`line ${lineNumber} is not canonical compact JSON`);
    }
    if (typeof record.gameVariant !== "string") {
      fail(`line ${lineNumber} gameVariant must be a string`);
    }
    if (!Object.hasOwn(variantGameCounts, record.gameVariant)) {
      fail(`line ${lineNumber} has unknown gameVariant ${JSON.stringify(record.gameVariant)}`);
    }
    if (!Array.isArray(record.turns) || record.turns.length === 0) {
      fail(`line ${lineNumber} turns must be a non-empty array`);
    }

    variantGameCounts[record.gameVariant] += 1;
    turnCount += record.turns.length;

    for (const [turnIndex, turn] of record.turns.entries()) {
      if (!Array.isArray(turn) || turn.length === 0) {
        fail(`line ${lineNumber} turn ${turnIndex + 1} must be a non-empty array`);
      }
      inputCount += turn.length;

      for (const [inputIndex, inputFen] of turn.entries()) {
        const label = `line ${lineNumber} turn ${turnIndex + 1} input ${inputIndex + 1}`;
        if (typeof inputFen !== "string" || inputFen.length === 0) {
          fail(`${label} must be a non-empty string`);
        }
        if (!isCanonicalInputFen(inputFen)) {
          fail(`${label} is not canonical input FEN: ${JSON.stringify(inputFen)}`);
        }
      }
    }
  }

  assertEqual(lines.length, APPROVED.recordCount, "corpus record count");
  assertEqual(turnCount, APPROVED.turnCount, "corpus turn count");
  assertEqual(inputCount, APPROVED.inputCount, "corpus input count");
  for (const [variant, expectedCount] of Object.entries(APPROVED.variantGameCounts)) {
    assertEqual(variantGameCounts[variant], expectedCount, `corpus ${variant} game count`);
  }
}

function run() {
  const { corpusRoot } = parseOptions(process.argv.slice(2));
  const corpusPath = path.join(corpusRoot, "complete-games.jsonl");
  const manifestPath = path.join(corpusRoot, "manifest.json");
  const readmePath = path.join(corpusRoot, "README.md");

  requireFile(corpusPath, "complete games corpus");
  requireFile(manifestPath, "complete games manifest");
  requireFile(readmePath, "complete games README");

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    fail(`manifest is not valid JSON: ${error.message}`);
  }
  validateManifest(manifest);

  const corpus = fs.readFileSync(corpusPath);
  validateCorpus(corpus);
  assertEqual(corpus.length, APPROVED.bytes, "corpus byte count");

  const actualSha256 = crypto.createHash("sha256").update(corpus).digest("hex");
  assertEqual(actualSha256, APPROVED.sha256, "corpus SHA-256");

  console.log(
    `complete games corpus verified: ${APPROVED.recordCount} games, ` +
      `${APPROVED.turnCount} turns, ${APPROVED.inputCount} inputs, ${APPROVED.sha256}`,
  );
}

try {
  run();
} catch (error) {
  console.error(`complete games corpus check failed: ${error.message}`);
  process.exit(1);
}
