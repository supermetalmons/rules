#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");

const packagePath = path.resolve(
  process.cwd(),
  process.argv[2] ?? "pkg/node/mons-rust.js",
);
const wasmPackage = require(packagePath);

const discriminatingFen =
  "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n02E0xn01A0xD0xS0xY0xn03";
const boundedTacticalInputs = "l10,5;l9,4";
const previousGuardedInputs = "l10,6;l9,6";
const shippingBaselineInputs = "l10,6;l9,6";

const model = wasmPackage.MonsGameModel.from_fen(discriminatingFen);
assert(model, "failed to load the release-route fixture");

let output;
try {
  output = model.smartAutomove("pro");
  const actualInputs = output.input_fen();

  assert.notEqual(
    boundedTacticalInputs,
    previousGuardedInputs,
    "release-route fixture no longer discriminates v10 from retained v2",
  );
  assert.notEqual(
    boundedTacticalInputs,
    shippingBaselineInputs,
    "release-route fixture no longer discriminates v10 from shipping search",
  );
  assert.equal(
    actualInputs,
    boundedTacticalInputs,
    `generated package public Pro route returned ${actualInputs}`,
  );
  assert.notEqual(
    actualInputs,
    previousGuardedInputs,
    "generated package public Pro route fell back to frontier_pro_v2_guarded",
  );
  assert.notEqual(
    actualInputs,
    shippingBaselineInputs,
    "generated package public Pro route fell back to shipping_pro_search",
  );

  console.log(`generated package public Pro route passed: ${actualInputs}`);
} finally {
  output?.free();
  model.free();
}
