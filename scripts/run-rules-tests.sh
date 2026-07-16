#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CORPUS_PATH="${REPO_DIR}/test-data/rules-regressions.jsonl.gz"
ESBUILD_BIN="${REPO_DIR}/node_modules/.bin/esbuild"
TARGET_DIR="${REPO_DIR}/target/ts-regression"
RUNNER_PATH="${TARGET_DIR}/rules-regressions.mjs"

if (($# != 0)); then
  echo "error: run-rules-tests.sh accepts no arguments" >&2
  exit 2
fi
if [[ ! -f "${CORPUS_PATH}" ]]; then
  echo "error: rules corpus '${CORPUS_PATH}' not found" >&2
  exit 1
fi
if [[ ! -x "${ESBUILD_BIN}" ]]; then
  echo "error: esbuild is unavailable; run npm ci first" >&2
  exit 1
fi

mkdir -p "${TARGET_DIR}"
"${ESBUILD_BIN}" \
  "${REPO_DIR}/src/cli/rules-regressions.ts" \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node22 \
  --log-level=warning \
  --outfile="${RUNNER_PATH}"

MONS_RULES_CORPUS_PATH="${CORPUS_PATH}" node "${RUNNER_PATH}"
