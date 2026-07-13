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
  cargo check --lib --profile wasm-release --target wasm32-unknown-unknown

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
if rg -n '#\[allow\(dead_code\)\]' src; then
  echo "dead-code suppression remains"
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
