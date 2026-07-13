#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { performance } = require("node:perf_hooks");

const packagePath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "pkg/node/mons-rust.js",
);
const mode = process.argv[3] ?? "pro";
assert(["fast", "normal", "pro"].includes(mode), `unsupported automove mode: ${mode}`);

const discriminatingFen =
  "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n02E0xn01A0xD0xS0xY0xn03";
const currentBoundedTacticalInputs = "l10,5;l9,4";
const baselineSelectorInputs = "l10,6;l9,6";
const shippingFallbackInputs = "l10,6;l9,6";

async function loadWasmPackage() {
  if (path.basename(packagePath) === "mons-web.js") {
    const wasmPackage = await import(pathToFileURL(packagePath).href);
    const wasmBytes = fs.readFileSync(path.join(path.dirname(packagePath), "mons-web_bg.wasm"));
    await wasmPackage.default(wasmBytes);
    return wasmPackage;
  }
  return require(packagePath);
}

async function main() {
  const wasmPackage = await loadWasmPackage();
  const model = wasmPackage.MonsGameModel.from_fen(discriminatingFen);
  const replay = wasmPackage.MonsGameModel.from_fen(discriminatingFen);
  assert(model && replay, "failed to load the release-route fixture");

  let output;
  let replayOutput;
  try {
    const startedAt = performance.now();
    output = model.smartAutomove(mode);
    const elapsedMs = performance.now() - startedAt;
    const actualInputs = output.input_fen();

    assert(actualInputs.length > 0, `${mode} returned empty inputs`);
    assert(elapsedMs < 700, `${mode} generated-Wasm call took ${elapsedMs.toFixed(3)}ms`);

    replayOutput = replay.process_input_fen(actualInputs);
    assert.equal(
      replayOutput.kind,
      wasmPackage.OutputModelKind.Events,
      `${mode} generated-Wasm inputs did not replay to events`,
    );

    if (mode === "pro") {
      assert.notEqual(
        currentBoundedTacticalInputs,
        baselineSelectorInputs,
        "release-route fixture no longer discriminates current Pro from the baseline selector",
      );
      assert.notEqual(
        currentBoundedTacticalInputs,
        shippingFallbackInputs,
        "release-route fixture no longer discriminates current Pro from the shipping fallback",
      );
      assert.equal(
        actualInputs,
        currentBoundedTacticalInputs,
        `generated package public Pro route returned ${actualInputs}`,
      );
    }

    console.log(
      `generated package ${mode} route passed: inputs=${actualInputs} elapsed_ms=${elapsedMs.toFixed(3)}`,
    );
  } finally {
    replayOutput?.free();
    output?.free();
    replay.free();
    model.free();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
