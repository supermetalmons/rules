#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CORPUS_PATH="${REPO_DIR}/test-data/rules-regressions.jsonl.gz"
MANIFEST_PATH="${REPO_DIR}/test-data/rules-regressions.manifest.json"

APPROVED_MANIFEST_SHA256="cafd0cae451904e2b404d762d1a91c3f8b67329785c8041602401f4b67184266"
APPROVED_COMPRESSED_SHA256="02942e8107a3de160cfa1bf99dc6d1bcc070c94ba4aca650cb0c67530ee2e280"
APPROVED_UNCOMPRESSED_SHA256="4b5b092987eafe9dad6b2f265b194fcb0f95380f120a6a217d3f5795a1f70f81"
APPROVED_COMPRESSED_BYTES=27021978
APPROVED_UNCOMPRESSED_BYTES=274843626
APPROVED_CASE_COUNT=699994

if (($# != 0)); then
  echo "error: run-rules-tests.sh accepts no arguments" >&2
  exit 2
fi

if [[ ! -f "${CORPUS_PATH}" ]]; then
  echo "error: rules corpus '${CORPUS_PATH}' not found" >&2
  exit 1
fi
if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "error: rules manifest '${MANIFEST_PATH}' not found" >&2
  exit 1
fi

actual_manifest_sha="$(shasum -a 256 "${MANIFEST_PATH}" | awk '{print $1}')"
if [[ "${actual_manifest_sha}" != "${APPROVED_MANIFEST_SHA256}" ]]; then
  echo "error: manifest does not match the independently approved SHA-256" >&2
  exit 1
fi

node - \
  "${MANIFEST_PATH}" \
  "${APPROVED_CASE_COUNT}" \
  "${APPROVED_COMPRESSED_BYTES}" \
  "${APPROVED_COMPRESSED_SHA256}" \
  "${APPROVED_UNCOMPRESSED_BYTES}" \
  "${APPROVED_UNCOMPRESSED_SHA256}" <<'NODE'
const fs = require("node:fs");
const [
  manifestPath,
  approvedCaseCountRaw,
  approvedCompressedBytesRaw,
  approvedCompressedSha256,
  approvedUncompressedBytesRaw,
  approvedUncompressedSha256,
] = process.argv.slice(2);
const approvedCaseCount = Number(approvedCaseCountRaw);
const approvedCompressedBytes = Number(approvedCompressedBytesRaw);
const approvedUncompressedBytes = Number(approvedUncompressedBytesRaw);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, label) {
  assertEqual(JSON.stringify(actual), JSON.stringify(expected), label);
}

assertEqual(manifest.schemaVersion, 2, "schemaVersion");
assertEqual(manifest.corpusVersion, "rules-regressions-full-v1", "corpusVersion");
assertEqual(manifest.source.commit, "5c79f22441a83e66b3a9875f0bf7354aee6f98a0", "source.commit");
assertEqual(manifest.source.archives.length, 7, "source archive count");

const archiveHashes = [
  "6b3be00538dccb5e98f6ea0784f3f310a3a9c34795eec458645c50f3461ecb31",
  "3364787cdbbc2334ca7b02105d580c62133a682f3de672ea0c11f01dd7fdbb41",
  "194f590a7eebf1720b7fb80072282e91ecf92fe21db602625e84857a4fab06ee",
  "9528778d416b5c08279f34017f2174124a0c65da14cfbcb6ada12cb6b5dbac42",
  "48191a5684142463b8289cb8973fec92cb8692d8f76e93abf92a6c69942474af",
  "3c6cb6437a1c76aa5df670d251fbfa95da77d77424c5e667cf092bf8b20c381e",
  "daf951a55942bfa36818bd415f0246dbf53e4a34bfa4262ee862a919c6b7a1bf",
];
for (const [index, archive] of manifest.source.archives.entries()) {
  const ordinal = String(index + 1).padStart(5, "0");
  const expectedCount = index === 6 ? 99999 : 100000;
  assertEqual(archive.path, `rules-tests-chunks/chunk-${ordinal}.tar.gz`, `archive ${ordinal} path`);
  assertEqual(archive.sha256, archiveHashes[index], `archive ${ordinal} SHA-256`);
  assertEqual(archive.fixtureCount, expectedCount, `archive ${ordinal} fixtureCount`);
  assertEqual(archive.appleDoubleCount, expectedCount, `archive ${ordinal} appleDoubleCount`);
  assertEqual(archive.paxHeaderCount, expectedCount, `archive ${ordinal} paxHeaderCount`);
}
for (const field of ["fixtureCount", "appleDoubleCount", "paxHeaderCount"]) {
  const count = manifest.source.archives.reduce((sum, archive) => sum + archive[field], 0);
  assertEqual(count, 699999, `source archive ${field} sum`);
}

assertDeepEqual(
  manifest.source.memberAudit,
  {
    fixturePathPattern: "rules-tests/[0-9]+",
    fixtureCount: 699999,
    fixtureJsonBytes: 274372809,
    ignoredAppleDoubleCount: 699999,
    ignoredPaxHeaderCount: 699999,
    unexpectedMemberCount: 0,
  },
  "source.memberAudit",
);

const canonicalization = manifest.canonicalization;
assertEqual(canonicalization.format, "compact UTF-8 JSON Lines", "canonicalization.format");
assertDeepEqual(
  canonicalization.fieldOrder,
  ["fenAfter", "fenBefore", "inputFen", "outputFen"],
  "canonicalization.fieldOrder",
);
assertEqual(canonicalization.lineEnding, "LF", "canonicalization.lineEnding");
assertEqual(
  canonicalization.ordering,
  "strict bytewise ascending (LC_ALL=C)",
  "canonicalization.ordering",
);
assertEqual(
  canonicalization.legacyEscapedSlashRecordsNormalized,
  10000,
  "canonicalization.legacyEscapedSlashRecordsNormalized",
);
assertEqual(canonicalization.rawFixtureCount, 699999, "canonicalization.rawFixtureCount");
assertEqual(
  canonicalization.canonicalTransitionCount,
  699994,
  "canonicalization.canonicalTransitionCount",
);
assertEqual(canonicalization.canonicalDuplicateCount, 5, "canonicalization.canonicalDuplicateCount");
assertDeepEqual(
  canonicalization.duplicateRawIdPairs,
  [
    ["16366646300174623791", "17526557331065902015"],
    ["17514043398572608075", "17945617246001319879"],
    ["17033601397408846118", "4110695395768576788"],
    ["17477011250244622299", "4276189234051357579"],
    ["16928469117946288666", "5196103459120274044"],
  ],
  "canonicalization.duplicateRawIdPairs",
);
assertDeepEqual(
  canonicalization.fnv1a64,
  {
    input: "canonical line bytes excluding LF",
    uniqueIdCount: 699994,
    collisionCount: 0,
  },
  "canonicalization.fnv1a64",
);

const predecessor = manifest.predecessor;
assertEqual(predecessor.corpusVersion, "rules-regressions-v1", "predecessor.corpusVersion");
assertEqual(predecessor.caseCount, 10000, "predecessor.caseCount");
assertDeepEqual(
  predecessor.artifact,
  {
    uncompressedBytes: 4032569,
    uncompressedSha256: "5c3e3a5034d187ee0daf528bc0fb5bedeb3a27a864d8e7f6ce0aa0880fd02afc",
    compressedBytes: 654974,
    compressedSha256: "4f96c9a638ff81ef1c07bd63f7d528a70676281bd18cabc20eef86b42dbb68dc",
  },
  "predecessor.artifact",
);
assertDeepEqual(
  predecessor.subsetProof,
  {
    containedTransitions: 10000,
    directByteMatches: 8923,
    normalizedMatches: 1077,
    missingTransitions: 0,
  },
  "predecessor.subsetProof",
);
assertEqual(
  predecessor.subsetProof.directByteMatches + predecessor.subsetProof.normalizedMatches,
  predecessor.subsetProof.containedTransitions,
  "predecessor subset match sum",
);

assertDeepEqual(
  manifest.artifact,
  {
    path: "test-data/rules-regressions.jsonl.gz",
    caseCount: approvedCaseCount,
    format: "canonical JSON Lines",
    ordering: "strict bytewise ascending",
    compression: "gzip -n -9",
    uncompressedBytes: approvedUncompressedBytes,
    uncompressedSha256: approvedUncompressedSha256,
    compressedBytes: approvedCompressedBytes,
    compressedSha256: approvedCompressedSha256,
  },
  "artifact",
);

assertDeepEqual(
  manifest.baselineResults,
  [
    {
      commit: "5c79f22441a83e66b3a9875f0bf7354aee6f98a0",
      fixtureCount: 699999,
      passed: 699999,
      failed: 0,
    },
    {
      commit: "ad4aaa1ddfd7fdecf53cae60e8aa7a695087db1d",
      fixtureCount: 699994,
      passed: 699994,
      failed: 0,
    },
  ],
  "baselineResults",
);

assertEqual(
  manifest.coverage.basis,
  "699999 raw source fixtures before canonical duplicate removal",
  "coverage.basis",
);
assertDeepEqual(
  manifest.coverage.distinctValueCounts,
  {
    output_kind: 4,
    output_cardinality: 27,
    event_kind: 18,
    next_input_kind: 9,
    input_kind: 3,
    input_length: 5,
    color: 2,
    score_pair: 28,
    item_kind: 5,
    mon_kind: 5,
    mana_kind: 3,
    source_square: 6,
    target_square: 6,
    direction: 9,
    distance: 11,
    geometry: 254,
    turn_bucket: 4,
    variant: 1,
  },
  "coverage.distinctValueCounts",
);

assertDeepEqual(
  manifest.knownGaps,
  [
    "The source corpus contains only the Classic variant; variants 1 through 11 are covered by focused Rust tests instead.",
    "The source corpus contains no BombExplosion (be) event.",
    "The source corpus contains no takeback input or Takeback (z) event.",
    "The source corpus contains no Cancel (mc) modifier input.",
    "The source corpus contains no turn-number-zero transition; observed turn buckets are 1-2, 3-5, 6-9, and 10+.",
  ],
  "knownGaps",
);
NODE

actual_compressed_bytes="$(wc -c <"${CORPUS_PATH}" | tr -d '[:space:]')"
if [[ "${actual_compressed_bytes}" != "${APPROVED_COMPRESSED_BYTES}" ]]; then
  echo "error: compressed byte count mismatch (expected ${APPROVED_COMPRESSED_BYTES}, got ${actual_compressed_bytes})" >&2
  exit 1
fi

actual_compressed_sha="$(shasum -a 256 "${CORPUS_PATH}" | awk '{print $1}')"
if [[ "${actual_compressed_sha}" != "${APPROVED_COMPRESSED_SHA256}" ]]; then
  echo "error: compressed SHA-256 mismatch" >&2
  exit 1
fi

# The raw metrics are pinned above and validated against the manifest. The exact
# gzip hash plus the streamed replay make a separate decompression pass unnecessary.

cd "${REPO_DIR}"
gzip -dc "${CORPUS_PATH}" | cargo run --release --quiet --bin rules_tests
