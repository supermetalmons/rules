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

echo "Checking formatting..."
cargo fmt --check

echo "Checking native Rust targets..."
RUSTFLAGS="-D warnings -D dead-code" cargo check --release --all-targets
cargo clippy --release --all-targets -- -D warnings

echo "Checking the Wasm library..."
RUSTFLAGS="-D warnings -D dead-code" \
    cargo check --profile wasm-release --target wasm32-unknown-unknown --lib
cargo clippy --profile wasm-release --target wasm32-unknown-unknown --lib -- -D warnings

echo "Running Rust tests..."
cargo test --all-targets -- --test-threads=1

echo "Replaying the canonical rules corpus..."
./scripts/run-rules-tests.sh

echo "Checking the complete-games corpus..."
node ./scripts/check-complete-games.cjs

release_version="$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -n 1)"
if [ -z "${release_version}" ]; then
    echo "Could not read the Cargo package version."
    exit 1
fi
echo "Checking npm packages for version ${release_version}..."

rm -rf pkg
trap 'rm -rf "${script_dir}/pkg"' EXIT

echo "Building the web Wasm package..."
wasm-pack build --profile wasm-release --target web --out-dir pkg/web --out-name mons-web

echo "Building the Node.js Wasm package..."
wasm-pack build --profile wasm-release --target nodejs --out-dir pkg/node --out-name mons-rust

node ./scripts/prepare-release-npm-package.cjs pkg/web mons-web
node ./scripts/prepare-release-npm-package.cjs pkg/node mons-rust

node ./scripts/assert-release-npm-package.cjs pkg/web web
node ./scripts/assert-release-npm-package.cjs pkg/node node

if [ "${check_only}" = true ]; then
    echo "Release checks passed; --check-only skipped npm publish."
    exit 0
fi

(
    cd pkg/web
    npm publish --access public
)

(
    cd pkg/node
    npm publish --access public
)
