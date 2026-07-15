#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

check_only=false
if [ "${1:-}" = "--check-only" ]; then
    check_only=true
elif [ "$#" -ne 0 ]; then
    echo "usage: $0 [--check-only]"
    exit 2
fi

if [ "${check_only}" = false ] && \
    { ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; }; then
    echo "Publish requires a clean worktree. Commit or remove all changes first."
    exit 1
fi

echo "Running tests..."
cargo test --lib -- --test-threads=1

echo "Running selected rules regression corpus..."
if ! ./scripts/run-rules-tests.sh; then
    echo "Rules regression corpus failed. Aborting publish."
    exit 1
fi

echo "Running all-variant public legality/replay gate..."
if ! cargo test --release --lib smart_automove_public_variant_legality_and_replay_gate \
    -- --ignored --nocapture --test-threads=1; then
    echo "All-variant public legality/replay gate failed. Aborting publish."
    exit 1
fi

echo "Running independently cold public runtime gate..."
if ! cargo test --release --lib smart_automove_public_runtime_budget_gate \
    -- --ignored --nocapture --test-threads=1; then
    echo "Tests failed. Aborting publish."
    exit 1
fi

echo "Running repeated Black turn-eight deadline-tail gate..."
if ! cargo test --release --lib smart_automove_public_black_turn_eight_deadline_tail_gate \
    -- --ignored --nocapture --test-threads=1; then
    echo "Pro selector hard-limit gate failed. Aborting publish."
    exit 1
fi

echo "Confirming optimized public Pro route..."
cargo test --release --lib \
    smart_automove_pro_matches_shipping_pro_selector_on_release_fixture \
    -- --test-threads=1

echo "Running release hygiene checks..."
./scripts/check-automove-hygiene.sh

RELEASE_VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -n 1)
echo "Publishing committed version ${RELEASE_VERSION}"

rm -rf pkg
trap 'rm -rf "${script_dir}/pkg"' EXIT

echo "Building web Wasm package..."
wasm-pack build --profile wasm-release --target web --out-dir pkg/web --out-name mons-web

echo "Building node Wasm package..."
wasm-pack build --profile wasm-release --target nodejs --out-dir pkg/node --out-name mons-rust

node ./scripts/prepare-release-npm-package.cjs pkg/web mons-web
node ./scripts/prepare-release-npm-package.cjs pkg/node mons-rust

echo "Checking release package surface..."
./scripts/assert-release-package-surface.sh pkg/web pkg/node

echo "Checking generated Node and web Wasm routes in cold processes..."
for package_entry in pkg/node/mons-rust.js pkg/web/mons-web.js; do
    for preference in fast normal pro; do
        node ./scripts/assert-release-automove-route.cjs "${package_entry}" "${preference}"
    done
done

if [ "${check_only}" = true ]; then
    echo "Release checks passed; --check-only skipped npm publish."
    exit 0
fi

cd pkg/web
npm publish --access public

cd ../node
npm publish --access public

cd ../..
