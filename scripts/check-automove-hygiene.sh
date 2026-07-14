#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

run_step() {
  printf '\n== %s ==\n' "$*"
}

run_step "cargo fmt"
cargo fmt --check

run_step "cargo check"
cargo check --release --all-targets

run_step "wasm cargo check"
RUSTFLAGS="${RUSTFLAGS:-} -D warnings" \
  cargo check --all-targets --profile wasm-release --target wasm32-unknown-unknown

run_step "cargo clippy"
cargo clippy --release --all-targets -- -D warnings

run_step "shell syntax"
shell_scripts=()
while IFS= read -r script; do
  shell_scripts+=("${script}")
done < <(
  find . \
    -path ./.git -prune -o \
    -path ./target -prune -o \
    -type f -name '*.sh' -print \
    | sed 's#^\./##' \
    | LC_ALL=C sort
)
for script in "${shell_scripts[@]}"; do
  bash -n "${script}"
done

run_step "node syntax"
while IFS= read -r script; do
  node --check "${script}"
done < <(find scripts -type f -name '*.cjs' -print | LC_ALL=C sort)

run_step "source hygiene"
if rg -n 'automove_experiments|smart_automove_pool_tests' src; then
  echo "retired experiment harness reference remains"
  exit 1
fi
if rg -n -U '#\[[[:space:]]*(allow|cfg_attr)[[:space:]]*\([^]]*\bdead_code\b[^]]*\)[[:space:]]*\]' src; then
  echo "dead-code suppression remains"
  exit 1
fi

# Candidate-specific tests are allowed; environment-parameterized model/lib mechanisms are not.
# Command-line binaries are outside the automove mechanism boundary.
model_source_files=()
while IFS= read -r source_file; do
  model_source_files+=("${source_file}")
done < <(
  find src -type f -name '*.rs' ! -path 'src/bin/*' -print | LC_ALL=C sort
)
if [ "${#model_source_files[@]}" -gt 0 ] && \
  rg -n 'std::env|env::(var|var_os)[[:space:]]*\(|option_env![[:space:]]*\(' \
    "${model_source_files[@]}"; then
  echo "automove runtime environment switch remains"
  exit 1
fi

empty_source_dirs="$(find src -type d -empty -print | LC_ALL=C sort)"
if [ -n "${empty_source_dirs}" ]; then
  echo "empty source directories remain:"
  printf '%s\n' "${empty_source_dirs}"
  exit 1
fi

run_step "documentation hygiene"
if [ ! -f AUTOMOVE_IDEAS.md ]; then
  echo "required automove hypothesis file is missing: AUTOMOVE_IDEAS.md"
  exit 1
fi
if [ ! -f docs/automove-knowledge.md ]; then
  echo "required durable automove knowledge file is missing: docs/automove-knowledge.md"
  exit 1
fi

ideas_bytes="$(wc -c <AUTOMOVE_IDEAS.md | tr -d '[:space:]')"
if ((ideas_bytes > 1024)); then
  echo "AUTOMOVE_IDEAS.md exceeds 1024 bytes (${ideas_bytes} bytes)"
  exit 1
fi
ideas_headings="$(awk '/^##[[:space:]]/ { count += 1 } END { print count + 0 }' AUTOMOVE_IDEAS.md)"
if [ "${ideas_headings}" -ne 1 ]; then
  echo "AUTOMOVE_IDEAS.md must contain exactly one level-2 hypothesis heading (found ${ideas_headings})"
  exit 1
fi

knowledge_bytes="$(wc -c <docs/automove-knowledge.md | tr -d '[:space:]')"
if ((knowledge_bytes > 12288)); then
  echo "docs/automove-knowledge.md exceeds 12288 bytes (${knowledge_bytes} bytes)"
  exit 1
fi

run_step "artifact hygiene"
legacy_artifacts=()
# Keep this path-based: candidate and profile terminology remains valid in focused tests.
for retired_root in pkg rules-tests rules-tests-chunks src/models/automove_experiments; do
  if [ -e "${retired_root}" ] || [ -L "${retired_root}" ]; then
    legacy_artifacts+=("${retired_root}")
  fi
done

while IFS= read -r -d '' artifact_path; do
  relative_path="${artifact_path#./}"
  case "${relative_path}" in
    __pycache__|__pycache__/*|*/__pycache__|*/__pycache__/*|\
    *.pyc|nohup.out|*/nohup.out|\
    *automove*.log|*experiment*.log|*receipt*.log|\
    *automove*.sample|*automove*.sample.txt|*experiment*.sample|\
    *experiment*.sample.txt|*process-sample*.txt|\
    docs/*automove*.json*|\
    *automove*result*.json*|*automove*precommit*.json*|\
    *automove*freeze*.json*|*automove*manifest*.json*|\
    *automove*receipt*.json*|*receipt*automove*.json*|\
    *automove*profile*.json*|\
    *automove*receipt*|*receipt*automove*|\
    *automove*.profile|*automove*.profraw|*automove*.profdata|\
    scripts/automove-experiment-common.sh|\
    scripts/run-automove-*|scripts/run-experiment-logged.sh|\
    scripts/summarize-automove-*|scripts/preflight-automove-*|\
    scripts/postprocess-automove-*|scripts/capture-process-sample.sh|\
    scripts/clean-process-samples.sh|scripts/clean-experiment-artifacts.sh|\
    scripts/cleanup-automove-iteration-artifacts.sh|\
    scripts/generate-rules-tests.sh|scripts/pack-rules-tests.sh|repo-clean.sh)
      legacy_artifacts+=("${relative_path}")
      ;;
  esac
done < <(
  find . \
    -path ./.git -prune -o \
    -path ./target -prune -o \
    -path ./pkg -prune -o \
    -path ./rules-tests -prune -o \
    -path ./rules-tests-chunks -prune -o \
    -path ./src/models/automove_experiments -prune -o \
    \( -type f -o -type d -o -type l \) -print0
)

if [ -d target ]; then
  while IFS= read -r -d '' target_path; do
    case "${target_path}" in
      target/*experiment*|target/*.log|target/*automove*.json*|\
      target/*receipt*.json*|target/*result*.json*|target/*precommit*.json*|\
      target/*freeze*.json*|target/*automove*.profile|target/*automove*.profraw|\
      target/*automove*.profdata|target/*process-sample*)
        legacy_artifacts+=("${target_path}")
        ;;
    esac
  done < <(find target -mindepth 1 \( -type f -o -type d -o -type l \) -print0)
fi

if [ "${#legacy_artifacts[@]}" -gt 0 ]; then
  echo "retired or misplaced experiment artifacts remain:"
  printf '  %s\n' "${legacy_artifacts[@]}"
  echo "keep disposable experiment outputs under target/ or /tmp and remove them when the line ends"
  exit 1
fi

run_step "cargo package surface"
package_list="$(cargo package --list --allow-dirty)"
printf '%s\n' "${package_list}" | awk '
  /^(docs|scripts|test-data|target|pkg)\// ||
  $0 == "AGENTS.md" ||
  $0 == "AUTOMOVE_IDEAS.md" ||
  $0 == "HOW_TO_ITERATE_ON_AUTOMOVE.md" ||
  $0 == "publish.sh" ||
  $0 == ".DS_Store" ||
  $0 == "src/.DS_Store" ||
  $0 == "nohup.out" {
    print "forbidden package artifact: " $0 > "/dev/stderr"
    found = 1
  }
  END { exit found ? 1 : 0 }
'

printf '\nautomove hygiene checks passed\n'
