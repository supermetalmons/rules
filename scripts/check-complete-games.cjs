"use strict";

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const runner = path.join(__dirname, "run-complete-games.mjs");
const result = spawnSync(
  process.execPath,
  [runner, "--check-only", ...process.argv.slice(2)],
  { stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}
if (result.signal !== null) {
  console.error(`complete games check terminated by ${result.signal}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
