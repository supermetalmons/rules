#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSync } from "esbuild";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const targetDirectory = path.join(repositoryRoot, "target", "ts-regression");
const outputFile = path.join(targetDirectory, "replay-complete-games.mjs");

mkdirSync(targetDirectory, { recursive: true });
buildSync({
  bundle: true,
  entryPoints: [
    path.join(repositoryRoot, "src", "cli", "replay-complete-games.ts"),
  ],
  format: "esm",
  logLevel: "warning",
  outfile: outputFile,
  platform: "node",
  sourcemap: false,
  target: "node22",
});

const result = spawnSync(
  process.execPath,
  [outputFile, ...process.argv.slice(2)],
  { stdio: "inherit" },
);
if (result.error) {
  throw result.error;
}
if (result.signal !== null) {
  console.error(`complete games replay terminated by ${result.signal}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
