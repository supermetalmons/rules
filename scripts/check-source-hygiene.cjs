#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const sourceRoot = path.join(repoRoot, "src");

function collectRustSources(directory) {
  const sources = [];

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      sources.push(...collectRustSources(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".rs")) {
      sources.push(entryPath);
    }
  }

  return sources.sort();
}

function relativePath(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function failOnMatch(files, pattern, message) {
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    const match = pattern.exec(source);
    if (match === null) {
      continue;
    }

    const lineNumber = source.slice(0, match.index).split("\n").length;
    const line = source.split(/\r?\n/)[lineNumber - 1].trim();
    console.error(`${relativePath(file)}:${lineNumber}:${line}`);
    console.error(message);
    process.exit(1);
  }
}

const sourceFiles = collectRustSources(sourceRoot);

failOnMatch(
  sourceFiles,
  /automove_experiments|smart_automove_pool_tests/,
  "retired experiment harness reference remains",
);
failOnMatch(
  sourceFiles,
  /#\[\s*(?:allow|cfg_attr)\s*\([^\]]*\bdead_code\b[^\]]*\)\s*\]/,
  "dead-code suppression remains",
);

const modelSourceFiles = sourceFiles.filter(
  (file) => !relativePath(file).startsWith("src/bin/"),
);
failOnMatch(
  modelSourceFiles,
  /std::env|env::(?:var|var_os)\s*\(|option_env!\s*\(/,
  "automove runtime environment switch remains",
);
