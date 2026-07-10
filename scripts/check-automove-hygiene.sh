#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

run_step() {
  printf '\n== %s ==\n' "$*"
}

run_step "cargo check"
cargo check --release --all-targets

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
    -path ./rules-tests -prune -o \
    -path ./rules-tests-chunks -prune -o \
    -type f -name '*.sh' -print \
    | sed 's#^\./##' \
    | LC_ALL=C sort
)
for script in "${shell_scripts[@]}"; do
  bash -n "${script}"
done

run_step "python syntax"
python_scripts=()
while IFS= read -r script; do
  python_scripts+=("${script}")
done < <(
  find scripts -type f -name '*.py' -print | LC_ALL=C sort
)
if [ "${#python_scripts[@]}" -gt 0 ]; then
  python3 - "${python_scripts[@]}" <<'PY'
import pathlib
import sys

failed = False
for raw_path in sys.argv[1:]:
    path = pathlib.Path(raw_path)
    try:
        source = path.read_text(encoding="utf-8")
        compile(source, str(path), "exec")
    except Exception as exc:
        print(f"{path}: {exc}", file=sys.stderr)
        failed = True

if failed:
    raise SystemExit(1)
PY
fi

run_step "node syntax"
node --check scripts/assert-release-automove-route.cjs

run_step "cargo package surface"
package_list="$(cargo package --list --allow-dirty)"
printf '%s\n' "${package_list}" | awk '
  /^(rules-tests|rules-tests-chunks|target|pkg)\// ||
  $0 == ".DS_Store" ||
  $0 == "src/.DS_Store" ||
  $0 == "nohup.out" {
    print "forbidden package artifact: " $0 > "/dev/stderr"
    found = 1
  }
  END { exit found ? 1 : 0 }
'

run_step "automove scratch cleanup dry-run"
./scripts/cleanup-automove-iteration-artifacts.sh --dry-run

run_step "automove target cleanup dry-run"
./scripts/clean-experiment-artifacts.sh --dry-run

printf '\nautomove hygiene checks passed\n'
