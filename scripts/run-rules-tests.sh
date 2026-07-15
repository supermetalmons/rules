#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
DEFAULT_CORPUS="${REPO_DIR}/test-data/rules-regressions.jsonl.gz"
DEFAULT_MANIFEST="${REPO_DIR}/test-data/rules-regressions.manifest.json"
MAX_COMPRESSED_BYTES=1000000
APPROVED_MANIFEST_SHA256="b3c9227a560f4e03d54cbf06668e64a465b870cf1bab673d906ac1926d251b29"
APPROVED_COMPRESSED_SHA256="4f96c9a638ff81ef1c07bd63f7d528a70676281bd18cabc20eef86b42dbb68dc"
APPROVED_UNCOMPRESSED_SHA256="5c3e3a5034d187ee0daf528bc0fb5bedeb3a27a864d8e7f6ce0aa0880fd02afc"
APPROVED_COMPRESSED_BYTES=654974
APPROVED_UNCOMPRESSED_BYTES=4032569

validate_manifest_contract() {
  node - "${manifest_path}" <<'NODE'
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

assertEqual(manifest.schemaVersion, 1, "schemaVersion");
assertEqual(manifest.selectionVersion, "rules-regressions-v1", "selectionVersion");
assertEqual(manifest.source.caseCount, 699999, "source.caseCount");
assertEqual(manifest.source.uniqueCanonicalTransitions, 699994, "source.uniqueCanonicalTransitions");
assertEqual(manifest.source.archives.length, 7, "source archive count");
assertEqual(manifest.source.baseline.passed, 699999, "source baseline passed");
assertEqual(manifest.source.baseline.failed, 0, "source baseline failed");

const selection = manifest.selection;
assertEqual(selection.selectedCaseCount, 10000, "selectedCaseCount");
assertEqual(selection.uniqueFnv1a64Ids, 10000, "uniqueFnv1a64Ids");
assertEqual(selection.uniqueTransitions, 10000, "uniqueTransitions");
assertEqual(selection.mandatoryCaseCount, 4685, "mandatoryCaseCount");
assertEqual(selection.greedyCoverageAdditions, 18, "greedyCoverageAdditions");
assertEqual(selection.roundRobinAdditions, 5297, "roundRobinAdditions");
assertEqual(selection.rareEventOccurrenceThreshold, 1000, "rareEventOccurrenceThreshold");
assertEqual(selection.rareNextInputOccurrenceThreshold, 500, "rareNextInputOccurrenceThreshold");

const requiredDimensions = {
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
};
const dimensions = manifest.coverage.distinctValueCounts;
assertEqual(
  JSON.stringify(Object.keys(dimensions).sort()),
  JSON.stringify(Object.keys(requiredDimensions).sort()),
  "coverage dimension keys",
);
let observedValues = 0;
for (const [key, expectedCount] of Object.entries(requiredDimensions)) {
  assertEqual(dimensions[key].source, expectedCount, `${key}.source`);
  assertEqual(dimensions[key].selected, dimensions[key].source, `${key} source/selected`);
  observedValues += dimensions[key].source;
}
assertEqual(observedValues, 400, "total observed coverage values");

const requiredGaps = [
  "The source corpus contains only the Classic variant; variants 1 through 11 are covered by focused Rust tests instead.",
  "The source corpus contains no BombExplosion (be) event.",
  "The source corpus contains no takeback input or Takeback (z) event.",
  "The source corpus contains no Cancel (mc) modifier input.",
  "The source corpus contains no turn-number-zero transition; observed turn buckets are 1-2, 3-5, 6-9, and 10+.",
];
assertEqual(JSON.stringify(manifest.knownGaps), JSON.stringify(requiredGaps), "knownGaps");
NODE
}

manifest_number() {
  local key="$1"
  local value
  value="$(
    sed -nE \
      "s/^[[:space:]]*\"${key}\":[[:space:]]*([0-9]+),?$/\\1/p" \
      "${manifest_path}"
  )"
  if [[ -z "${value}" || "${value}" == *$'\n'* ]]; then
    echo "error: manifest must contain exactly one numeric '${key}' field" >&2
    return 1
  fi
  echo "${value}"
}

manifest_string() {
  local key="$1"
  local value
  value="$(
    sed -nE \
      "s/^[[:space:]]*\"${key}\":[[:space:]]*\"([^\"]+)\",?$/\\1/p" \
      "${manifest_path}"
  )"
  if [[ -z "${value}" || "${value}" == *$'\n'* ]]; then
    echo "error: manifest must contain exactly one string '${key}' field" >&2
    return 1
  fi
  echo "${value}"
}

if (($# != 0)); then
  echo "error: run-rules-tests.sh accepts no arguments" >&2
  exit 2
fi

corpus_path="${DEFAULT_CORPUS}"
manifest_path="${DEFAULT_MANIFEST}"

if [[ ! -f "${corpus_path}" ]]; then
  echo "error: rules corpus '${corpus_path}' not found" >&2
  exit 1
fi
if [[ ! -f "${manifest_path}" ]]; then
  echo "error: rules manifest '${manifest_path}' not found" >&2
  exit 1
fi

corpus_path="$(realpath -- "${corpus_path}")"
manifest_path="$(realpath -- "${manifest_path}")"

actual_manifest_sha="$(shasum -a 256 "${manifest_path}" | awk '{print $1}')"
if [[ "${actual_manifest_sha}" != "${APPROVED_MANIFEST_SHA256}" ]]; then
  echo "error: manifest does not match the independently approved SHA-256" >&2
  exit 1
fi
validate_manifest_contract

expected_count="$(manifest_number selectedCaseCount)"
expected_compressed_bytes="$(manifest_number compressedBytes)"
expected_uncompressed_bytes="$(manifest_number uncompressedBytes)"
expected_compressed_sha="$(manifest_string compressedSha256)"
expected_uncompressed_sha="$(manifest_string uncompressedSha256)"

if [[ "${expected_count}" != "10000" ]]; then
  echo "error: manifest selectedCaseCount must be exactly 10000 (got ${expected_count})" >&2
  exit 1
fi
if ((expected_compressed_bytes > MAX_COMPRESSED_BYTES)); then
  echo "error: compressed corpus exceeds ${MAX_COMPRESSED_BYTES} bytes" >&2
  exit 1
fi
if [[ "${expected_compressed_bytes}" != "${APPROVED_COMPRESSED_BYTES}" ||
  "${expected_uncompressed_bytes}" != "${APPROVED_UNCOMPRESSED_BYTES}" ]]; then
  echo "error: manifest corpus byte counts do not match the approved contract" >&2
  exit 1
fi
if [[ "${expected_compressed_sha}" != "${APPROVED_COMPRESSED_SHA256}" ||
  "${expected_uncompressed_sha}" != "${APPROVED_UNCOMPRESSED_SHA256}" ]]; then
  echo "error: manifest corpus hashes do not match the approved contract" >&2
  exit 1
fi

gzip -t "${corpus_path}"
actual_compressed_bytes="$(wc -c <"${corpus_path}" | tr -d ' ')"
actual_compressed_sha="$(shasum -a 256 "${corpus_path}" | awk '{print $1}')"
actual_uncompressed_bytes="$(gzip -dc "${corpus_path}" | wc -c | tr -d ' ')"
actual_uncompressed_sha="$(gzip -dc "${corpus_path}" | shasum -a 256 | awk '{print $1}')"

if [[ "${actual_compressed_bytes}" != "${expected_compressed_bytes}" ]]; then
  echo "error: compressed byte count mismatch (manifest ${expected_compressed_bytes}, actual ${actual_compressed_bytes})" >&2
  exit 1
fi
if [[ "${actual_uncompressed_bytes}" != "${expected_uncompressed_bytes}" ]]; then
  echo "error: uncompressed byte count mismatch (manifest ${expected_uncompressed_bytes}, actual ${actual_uncompressed_bytes})" >&2
  exit 1
fi
if [[ "${actual_compressed_sha}" != "${expected_compressed_sha}" ]]; then
  echo "error: compressed SHA-256 mismatch" >&2
  exit 1
fi
if [[ "${actual_uncompressed_sha}" != "${expected_uncompressed_sha}" ]]; then
  echo "error: uncompressed SHA-256 mismatch" >&2
  exit 1
fi

cd "${REPO_DIR}"
gzip -dc "${corpus_path}" | cargo run --quiet --bin rules_tests
