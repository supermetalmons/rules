#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

if [ "$#" -gt 1 ] || [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'USAGE'
Usage: ./scripts/bump.sh [patch|minor|major|X.Y.Z]

Updates the package version in Cargo.toml and Cargo.lock.
The default bump is patch.
USAGE
  if [ "$#" -gt 1 ]; then
    exit 2
  fi
  exit 0
fi

if ! git diff --quiet -- Cargo.toml Cargo.lock || \
  ! git diff --cached --quiet -- Cargo.toml Cargo.lock; then
  echo "Cargo.toml or Cargo.lock has uncommitted changes; refusing to overwrite them." >&2
  exit 1
fi

node - "${1:-patch}" <<'NODE'
"use strict";

const fs = require("node:fs");

const bump = process.argv[2];
const manifestPath = "Cargo.toml";
const lockPath = "Cargo.lock";
const stableVersionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function packageSection(source) {
  const match = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(source);
  if (match === null) {
    fail("Cargo.toml has no [package] section");
  }
  return match;
}

function packageField(section, field) {
  const match = new RegExp(`^${field} = "([^"]+)"$`, "m").exec(section[0]);
  if (match === null) {
    fail(`Cargo.toml [package] has no ${field} field`);
  }
  return match[1];
}

function nextVersion(currentVersion, requestedBump) {
  const currentMatch = stableVersionPattern.exec(currentVersion);
  if (currentMatch === null) {
    fail(`current version is not a stable X.Y.Z version: ${currentVersion}`);
  }

  const current = currentMatch.slice(1).map(Number);
  let next;
  switch (requestedBump) {
    case "major":
      next = [current[0] + 1, 0, 0];
      break;
    case "minor":
      next = [current[0], current[1] + 1, 0];
      break;
    case "patch":
      next = [current[0], current[1], current[2] + 1];
      break;
    default: {
      const requestedMatch = stableVersionPattern.exec(requestedBump);
      if (requestedMatch === null) {
        fail(`invalid bump '${requestedBump}'; expected patch, minor, major, or X.Y.Z`);
      }
      next = requestedMatch.slice(1).map(Number);
      break;
    }
  }

  if (next.some((part) => !Number.isSafeInteger(part))) {
    fail("version component exceeds JavaScript's safe integer range");
  }

  for (let index = 0; index < current.length; index += 1) {
    if (next[index] > current[index]) {
      return next.join(".");
    }
    if (next[index] < current[index]) {
      break;
    }
  }

  fail(`new version must be greater than ${currentVersion}`);
}

const manifest = fs.readFileSync(manifestPath, "utf8");
const section = packageSection(manifest);
const packageName = packageField(section, "name");
const currentVersion = packageField(section, "version");
const newVersion = nextVersion(currentVersion, bump);

const lock = fs.readFileSync(lockPath, "utf8");
const packageBlocks = [
  ...lock.matchAll(/^\[\[package\]\]\n[\s\S]*?(?=^\[\[package\]\]|(?![\s\S]))/gm),
];
const rootBlocks = packageBlocks.filter((match) => {
  const name = /^name = "([^"]+)"$/m.exec(match[0]);
  return name !== null && name[1] === packageName;
});
if (rootBlocks.length !== 1) {
  fail(`expected exactly one ${packageName} package in Cargo.lock, found ${rootBlocks.length}`);
}

const lockedVersion = /^version = "([^"]+)"$/m.exec(rootBlocks[0][0]);
if (lockedVersion === null || lockedVersion[1] !== currentVersion) {
  fail(
    `Cargo.lock version ${lockedVersion?.[1] ?? "<missing>"} does not match Cargo.toml ${currentVersion}`,
  );
}

const updatedSection = section[0].replace(
  /^version = "[^"]+"$/m,
  `version = "${newVersion}"`,
);
const updatedManifest =
  manifest.slice(0, section.index) +
  updatedSection +
  manifest.slice(section.index + section[0].length);
const updatedRootBlock = rootBlocks[0][0].replace(
  /^version = "[^"]+"$/m,
  `version = "${newVersion}"`,
);
const updatedLock =
  lock.slice(0, rootBlocks[0].index) +
  updatedRootBlock +
  lock.slice(rootBlocks[0].index + rootBlocks[0][0].length);

fs.writeFileSync(manifestPath, updatedManifest);
fs.writeFileSync(lockPath, updatedLock);
console.log(`Bumped ${packageName} from ${currentVersion} to ${newVersion}`);
NODE
