#!/usr/bin/env node

"use strict";

const path = require("node:path");
const { performance } = require("node:perf_hooks");

const WARMUP_RUNS = 2;
const MEASURED_RUNS = 7;
const TARGET_MS = 550;
const EXPECTED_PRO_ROUTE = "l10,7;l9,8";

const repoRoot = path.resolve(__dirname, "..");
const packageRoot = path.join(repoRoot, "pkg", "node");
const packageManifest = require(path.join(packageRoot, "package.json"));

const originalOwnNow = Object.getOwnPropertyDescriptor(performance, "now");
Object.defineProperty(performance, "now", {
  configurable: true,
  value: () => 0,
  writable: true,
});

const { GameVariant, MonsGameModel, OutputModelKind } = require(packageRoot);

function restorePerformanceClock() {
  if (originalOwnNow === undefined) {
    delete performance.now;
    return;
  }
  Object.defineProperty(performance, "now", originalOwnNow);
}

function elapsedMilliseconds(start) {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function assertLegalRoute(inputFen, label) {
  try {
    const output = MonsGameModel.new(GameVariant.Classic).process_input_fen(
      inputFen,
    );
    if (output.kind !== OutputModelKind.Events) {
      throw new Error(`replay returned output kind ${output.kind}`);
    }
  } catch (error) {
    throw new Error(`${label} produced an illegal route: ${inputFen}`, {
      cause: error,
    });
  }
}

function runProAutomove(label) {
  const game = MonsGameModel.new(GameVariant.Classic);
  const start = process.hrtime.bigint();
  const inputFen = game.smartAutomove("pro").input_fen();
  const elapsedMs = elapsedMilliseconds(start);
  assertLegalRoute(inputFen, label);
  return { elapsedMs, inputFen };
}

function median(sortedValues) {
  return sortedValues[Math.floor(sortedValues.length / 2)];
}

function summary(results) {
  const times = results.map(({ elapsedMs }) => elapsedMs).sort((a, b) => a - b);
  return {
    min: times[0],
    median: median(times),
    max: times[times.length - 1],
  };
}

function milliseconds(value) {
  return `${value.toFixed(2)} ms`;
}

console.log(
  `Runtime: Node ${process.version} (${process.platform}/${process.arch})`,
);
console.log(`Package: ${packageManifest.name}@${packageManifest.version}`);
console.log(`Runs: ${WARMUP_RUNS} warmup, ${MEASURED_RUNS} measured`);

let fixedClockResults;
try {
  for (let index = 0; index < WARMUP_RUNS; index += 1) {
    const result = runProAutomove(`fixed-clock warmup ${index + 1}`);
    if (result.inputFen !== EXPECTED_PRO_ROUTE) {
      throw new Error(
        `fixed-clock warmup ${index + 1} selected ${result.inputFen}; expected ${EXPECTED_PRO_ROUTE}`,
      );
    }
  }

  fixedClockResults = Array.from({ length: MEASURED_RUNS }, (_, index) => {
    const result = runProAutomove(`fixed-clock run ${index + 1}`);
    if (result.inputFen !== EXPECTED_PRO_ROUTE) {
      throw new Error(
        `fixed-clock run ${index + 1} selected ${result.inputFen}; expected ${EXPECTED_PRO_ROUTE}`,
      );
    }
    return result;
  });
} finally {
  restorePerformanceClock();
}

const fixedClockSummary = summary(fixedClockResults);
console.log("\nFixed-clock completed Classic Pro search:");
console.log(`  Route: ${EXPECTED_PRO_ROUTE}`);
console.log(`  Min: ${milliseconds(fixedClockSummary.min)}`);
console.log(`  Median: ${milliseconds(fixedClockSummary.median)}`);
console.log(`  Max: ${milliseconds(fixedClockSummary.max)}`);
console.log(
  `  ${TARGET_MS} ms target: ${fixedClockSummary.median < TARGET_MS ? "met" : "not met"}`,
);

const realDeadlineResults = Array.from({ length: MEASURED_RUNS }, (_, index) =>
  runProAutomove(`real-deadline run ${index + 1}`),
);
const realDeadlineSummary = summary(realDeadlineResults);
const completedProRuns = realDeadlineResults.filter(
  ({ inputFen }) => inputFen === EXPECTED_PRO_ROUTE,
).length;

console.log("\nReal-clock Classic Pro calls (550 ms cooperative deadline):");
console.log(`  Pro route completions: ${completedProRuns}/${MEASURED_RUNS}`);
console.log(`  Min: ${milliseconds(realDeadlineSummary.min)}`);
console.log(`  Median: ${milliseconds(realDeadlineSummary.median)}`);
console.log(`  Max: ${milliseconds(realDeadlineSummary.max)}`);
if (completedProRuns < 5) {
  console.log(
    "  Acceptance target: not met (requires at least 5/7 completions)",
  );
} else {
  console.log("  Acceptance target: met");
}
