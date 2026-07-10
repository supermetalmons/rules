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
  "0 0 b 0 0 2 0 0 2 n03y0xn01d0xa0xn04/n04s0xn01e0xn04/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n04A0xD0xn05/n03E0xn02S0xn02Y0xn01";
const guardedInputs = "l1,4;l3,6;l2,7";
const shippingBaselineInputs = "l1,4;l3,4;l3,3";

const model = wasmPackage.MonsGameModel.from_fen(discriminatingFen);
assert(model, "failed to load the release-route fixture");

let output;
try {
  output = model.smartAutomove("pro");
  const actualInputs = output.input_fen();

  assert.notEqual(
    guardedInputs,
    shippingBaselineInputs,
    "release-route fixture no longer discriminates between selectors",
  );
  assert.equal(
    actualInputs,
    guardedInputs,
    `generated package public Pro route returned ${actualInputs}`,
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
