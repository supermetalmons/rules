#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const packageDir = path.resolve(process.argv[2] ?? "");
const target = process.argv[3];

assert(["web", "node"].includes(target), "target must be web or node");
assert(fs.statSync(packageDir).isDirectory(), `package directory missing: ${packageDir}`);

const packageBase = target === "web" ? "mons-web" : "mons-rust";
const expectedTopLevelFiles = [
  "LICENSE",
  "README.md",
  `${packageBase}.d.ts`,
  `${packageBase}.js`,
  `${packageBase}_bg.wasm`,
  "package.json",
];
const generatedSnippetPattern = /^snippets\/[^/]+\/inline\d+\.js$/;
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

const packDir = fs.mkdtempSync(path.join(os.tmpdir(), `mons-${target}-npm-pack-`));
let report;

try {
  const packed = spawnSync(
    "npm",
    ["pack", "--json", "--pack-destination", packDir],
    { cwd: packageDir, encoding: "utf8" },
  );
  assert.equal(
    packed.status,
    0,
    `npm pack failed:\n${packed.stdout}${packed.stderr}`,
  );

  const reports = JSON.parse(packed.stdout);
  assert.equal(reports.length, 1, "npm pack must return exactly one package report");
  report = reports[0];

  const archivePath = path.join(packDir, report.filename);
  assert(fs.statSync(archivePath).isFile(), `npm tarball missing: ${archivePath}`);

  const unpackDir = path.join(packDir, "unpacked");
  fs.mkdirSync(unpackDir);
  const unpacked = spawnSync("tar", ["-xzf", archivePath, "-C", unpackDir], {
    encoding: "utf8",
  });
  assert.equal(
    unpacked.status,
    0,
    `could not unpack npm tarball:\n${unpacked.stdout}${unpacked.stderr}`,
  );

  const packedPackageDir = path.join(unpackDir, "package");
  const packedEntry = path.join(packedPackageDir, `${packageBase}.js`);
  const loadScript =
    target === "web"
      ? `await import(${JSON.stringify(pathToFileURL(packedEntry).href)})`
      : `require(${JSON.stringify(packedEntry)})`;
  const loaded = spawnSync(
    process.execPath,
    target === "web"
      ? ["--input-type=module", "--eval", loadScript]
      : ["--eval", loadScript],
    { encoding: "utf8" },
  );
  assert.equal(
    loaded.status,
    0,
    `${target} entry could not load from its npm tarball:\n${loaded.stdout}${loaded.stderr}`,
  );
} finally {
  fs.rmSync(packDir, { recursive: true, force: true });
}

const actualFiles = report.files.map(({ path: file }) => file).sort();
const missingFiles = expectedTopLevelFiles.filter((file) => !actualFiles.includes(file));
assert.deepEqual(missingFiles, [], `${target} npm tar is missing required files`);
const unexpectedFiles = actualFiles.filter(
  (file) =>
    !expectedTopLevelFiles.includes(file) && !generatedSnippetPattern.test(file),
);
assert.deepEqual(unexpectedFiles, [], `${target} npm tar surface changed`);
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
