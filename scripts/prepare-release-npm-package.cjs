#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const packageDir = path.resolve(process.argv[2] ?? "");
const packageName = process.argv[3];

assert(packageName, "usage: prepare-release-npm-package.cjs <package-dir> <package-name>");

const manifestPath = path.join(packageDir, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

manifest.name = packageName;

const snippetsDir = path.join(packageDir, "snippets");
if (fs.existsSync(snippetsDir)) {
  // wasm-pack generates this directory for inline_js imports but omits it from
  // the package files allowlist.
  assert(Array.isArray(manifest.files), "generated package.json files must be an array");
  if (!manifest.files.includes("snippets")) {
    manifest.files.push("snippets");
  }
}

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
