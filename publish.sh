#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

if ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; then
    echo "Publish requires a clean worktree. Commit or remove all changes first."
    exit 1
fi

# Run tests first
echo "Running tests..."
if ! cargo test; then
    echo "Tests failed. Aborting publish."
    exit 1
fi

echo "Running release mixed runtime speed gate..."
if ! cargo test --release --lib smart_automove_release_mixed_runtime_speed_gate -- --ignored --nocapture; then
    echo "Release mixed runtime speed gate failed. Aborting publish."
    exit 1
fi

echo "Confirming optimized public Pro route..."
cargo test --release --lib \
    smart_automove_pro_matches_frontier_guarded_selector_on_discriminating_fixture

echo "Running release hygiene checks..."
./scripts/check-automove-hygiene.sh

RELEASE_VERSION=$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -n 1)
echo "Publishing committed version ${RELEASE_VERSION}"

# Never let stale generated files enter either package.
rm -rf pkg
trap 'rm -rf "${script_dir}/pkg"' EXIT

# Build for web
echo "Building web Wasm package..."
wasm-pack build --target web --out-dir pkg/web --out-name mons-web

# Build for nodejs 
echo "Building node Wasm package..."
wasm-pack build --target nodejs --out-dir pkg/node --out-name mons-rust

# Modify package.json to use mons-web as the name
sed -i '' 's/"name": "mons-rust"/"name": "mons-web"/' pkg/web/package.json
# Verify the change was made
if grep -q '"name": "mons-web"' pkg/web/package.json; then
    echo "Package name successfully changed to mons-web"
else
    echo "Failed to change package name to mons-web"
    exit 1
fi

echo "Checking release package surface..."
./scripts/assert-release-package-surface.sh pkg/web pkg/node

echo "Confirming generated Node/Wasm public Pro route..."
node ./scripts/assert-release-automove-route.cjs pkg/node/mons-rust.js

echo "Checking both npm package manifests before publishing..."
for package_dir in pkg/web pkg/node; do
    (
        cd "${package_dir}"
        npm pack --dry-run --json >/dev/null
    )
done

# Publish web package
cd pkg/web
npm publish --access public

# Publish nodejs package
cd ../node
# Ensure the package.json has the correct name for nodejs (should already be mons-rust)
npm publish --access public

# Return to project root
cd ../..
