#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ignoredRootDirectories = new Set([
  ".git",
  "node_modules",
  "pkg",
  "target",
]);
const forbiddenNames = new Set([
  "Cargo.lock",
  "Cargo.toml",
  "rust-toolchain",
  "rust-toolchain.toml",
]);
const forbiddenExtensions = new Set([".map", ".rs", ".wasm", ".wat"]);
const forbiddenDirectories = new Set(["snippets"]);
const sourceLoaderPattern =
  /(?:__wbindgen|wasm_bindgen|wasm-pack|WebAssembly\s*\.|\.wasm(?:\b|["']))/u;
const hardcodedSelectorPattern =
  /\b(?:FIXED_ROUTE_INPUTS|fixedRoute|staticTransitionScore)\b/u;

const forbiddenPaths = [];
const forbiddenSourceReferences = [];
const forbiddenHardcodedSelectors = [];

function inspectDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.relative(repositoryRoot, absolutePath);
    if (entry.isDirectory()) {
      if (ignoredRootDirectories.has(relativePath)) continue;
      if (forbiddenDirectories.has(entry.name)) {
        forbiddenPaths.push(relativePath);
        continue;
      }
      inspectDirectory(absolutePath);
      continue;
    }
    if (
      forbiddenNames.has(entry.name) ||
      forbiddenExtensions.has(path.extname(entry.name).toLowerCase())
    ) {
      forbiddenPaths.push(relativePath);
      continue;
    }
    if (relativePath.startsWith(`src${path.sep}`)) {
      const source = fs.readFileSync(absolutePath, "utf8");
      if (sourceLoaderPattern.test(source)) {
        forbiddenSourceReferences.push(relativePath);
      }
      if (hardcodedSelectorPattern.test(source)) {
        forbiddenHardcodedSelectors.push(relativePath);
      }
    }
  }
}

inspectDirectory(repositoryRoot);

if (
  forbiddenPaths.length > 0 ||
  forbiddenSourceReferences.length > 0 ||
  forbiddenHardcodedSelectors.length > 0
) {
  if (forbiddenPaths.length > 0) {
    console.error(
      `Forbidden native/Wasm repository artifacts:\n${forbiddenPaths
        .sort()
        .map((file) => `  ${file}`)
        .join("\n")}`,
    );
  }
  if (forbiddenSourceReferences.length > 0) {
    console.error(
      `Forbidden Wasm loader references in TypeScript source:\n${forbiddenSourceReferences
        .sort()
        .map((file) => `  ${file}`)
        .join("\n")}`,
    );
  }
  if (forbiddenHardcodedSelectors.length > 0) {
    console.error(
      `Forbidden hardcoded automove selectors in TypeScript source:\n${forbiddenHardcodedSelectors
        .sort()
        .map((file) => `  ${file}`)
        .join("\n")}`,
    );
  }
  process.exit(1);
}

console.log(
  "Repository contains only the TypeScript/JavaScript engine toolchain.",
);
