#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const packageDir = path.resolve(process.argv[2] ?? "");
const target = process.argv[3];

assert(["web", "node"].includes(target), "target must be web or node");
assert(fs.statSync(packageDir).isDirectory(), `package directory missing: ${packageDir}`);

const packageBase = target === "web" ? "mons-web" : "mons-rust";
const expectedFiles = [
  "LICENSE",
  "README.md",
  `${packageBase}.d.ts`,
  `${packageBase}.js`,
  `${packageBase}_bg.wasm`,
  "package.json",
].sort();
const expectedSemanticTypeHash =
  target === "web"
    ? "5054fa85d4b2efaf964b40b318ebd13ce928c5ba79c0316aea8b5cc1e7f5086d"
    : "68e0712dd6eff91e02a6a8ab0ea1e0437b4198d4ab1f48836af491a047d43b86";

function canonicalizeDeclarations(source) {
  const lines = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const declarations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index].replace(/\s+/g, " ");
    if (!header.endsWith("{")) {
      declarations.push(header);
      continue;
    }

    let depth = 1;
    const members = [];
    for (index += 1; index < lines.length; index += 1) {
      const member = lines[index].replace(/\s+/g, " ");
      depth += (member.match(/\{/g) ?? []).length;
      depth -= (member.match(/\}/g) ?? []).length;
      if (depth === 0) {
        break;
      }
      members.push(member);
    }
    assert.equal(depth, 0, `unbalanced declaration block: ${header}`);
    declarations.push(`${header}\n${members.sort().join("\n")}\n}`);
  }

  return `${declarations.sort().join("\n---\n")}\n`;
}

function semanticDeclarationHash(file) {
  const canonical = canonicalizeDeclarations(fs.readFileSync(file, "utf8"));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

const packed = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: packageDir,
  encoding: "utf8",
});
if (packed.status !== 0) {
  process.stderr.write(packed.stdout);
  process.stderr.write(packed.stderr);
  process.exit(packed.status ?? 1);
}

const reports = JSON.parse(packed.stdout);
assert.equal(reports.length, 1, "npm dry-run must return exactly one package report");
const report = reports[0];
const actualFiles = report.files.map(({ path: file }) => file).sort();
assert.deepEqual(actualFiles, expectedFiles, `${target} npm tar surface changed`);
assert(
  report.size <= 325_000,
  `${target} packed size ${report.size} exceeds 325000 bytes`,
);
assert(
  report.unpackedSize <= 925_000,
  `${target} unpacked size ${report.unpackedSize} exceeds 925000 bytes`,
);

const wasmFile = report.files.find(({ path: file }) => file.endsWith("_bg.wasm"));
assert(wasmFile, `${target} npm tar has no Wasm artifact`);
assert(
  wasmFile.size <= 850_000,
  `${target} Wasm size ${wasmFile.size} exceeds 850000 bytes`,
);

assert.equal(
  semanticDeclarationHash(path.join(packageDir, `${packageBase}.d.ts`)),
  expectedSemanticTypeHash,
  `${target} public TypeScript declaration surface changed`,
);

console.log(
  `${target} npm package passed: packed=${report.size} unpacked=${report.unpackedSize} wasm=${wasmFile.size}`,
);
