#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageName = "mons-rules";
const packageEntry = "./dist/mons-rules.js";
const typesEntry = "./mons-rules.d.ts";
const expectedFiles = [
  "LICENSE",
  "README.md",
  "dist/mons-rules.js",
  "mons-rules.d.ts",
  "package.json",
];
const expectedExports = [
  "AvailableMoveKind",
  "Color",
  "Consumable",
  "EventModel",
  "EventModelKind",
  "GameVariant",
  "ItemModel",
  "ItemModelKind",
  "Location",
  "ManaKind",
  "ManaModel",
  "Modifier",
  "Mon",
  "MonKind",
  "MonsGameModel",
  "NextInputKind",
  "NextInputModel",
  "OutputModel",
  "OutputModelKind",
  "SquareModel",
  "SquareModelKind",
  "VerboseTrackingEntityModel",
  "winner",
].sort();
const expectedDeclarationHash =
  "68e0712dd6eff91e02a6a8ab0ea1e0437b4198d4ab1f48836af491a047d43b86";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

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
      if (depth === 0) break;
      members.push(member);
    }
    assert.equal(depth, 0, `unbalanced declaration block: ${header}`);
    declarations.push(`${header}\n${members.sort().join("\n")}\n}`);
  }

  return `${declarations.sort().join("\n---\n")}\n`;
}

function declarationHash(filePath) {
  const canonical = canonicalizeDeclarations(fs.readFileSync(filePath, "utf8"));
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed:\n${result.stdout}${result.stderr}`,
  );
  return result.stdout;
}

const manifest = readJson(path.join(repoRoot, "package.json"));
assert.equal(manifest.name, packageName, "package name changed");
assert.equal(manifest.type, "module", "package must remain ESM");
assert.equal(manifest.main, packageEntry, "main entry changed");
assert.equal(manifest.module, packageEntry, "module entry changed");
assert.equal(manifest.browser, packageEntry, "browser entry changed");
assert.equal(manifest.types, typesEntry, "types entry changed");
assert.deepEqual(
  manifest.exports,
  {
    ".": {
      types: typesEntry,
      import: packageEntry,
      require: packageEntry,
      default: packageEntry,
    },
  },
  "package exports changed",
);
for (const field of [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "peerDependenciesMeta",
  "bundleDependencies",
  "bundledDependencies",
]) {
  assert.equal(manifest[field], undefined, `${field} must not be published`);
}
assert.equal(
  declarationHash(path.join(repoRoot, "mons-rules.d.ts")),
  expectedDeclarationHash,
  "public declarations changed",
);

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "mons-rules-package-check-"),
);

try {
  const packDirectory = path.join(temporaryRoot, "pack");
  fs.mkdirSync(packDirectory);
  const reports = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", packDirectory], {
      cwd: repoRoot,
    }),
  );
  assert.equal(reports.length, 1, "npm pack must produce exactly one archive");

  const report = reports[0];
  assert.equal(report.name, packageName, "packed package name changed");
  assert.equal(report.version, manifest.version, "packed version changed");
  assert.deepEqual(
    report.files.map(({ path: filePath }) => filePath).sort(),
    expectedFiles,
    "npm tar surface changed",
  );
  assert(report.size <= 150_000, `packed size ${report.size} exceeds 150000`);
  assert(
    report.unpackedSize <= 500_000,
    `unpacked size ${report.unpackedSize} exceeds 500000`,
  );

  const archivePath = path.join(packDirectory, report.filename);
  const consumerDirectory = path.join(temporaryRoot, "consumer");
  fs.mkdirSync(consumerDirectory);
  fs.writeFileSync(
    path.join(consumerDirectory, "package.json"),
    `${JSON.stringify({ name: "package-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      archivePath,
    ],
    { cwd: consumerDirectory },
  );

  const installedPackage = path.join(
    consumerDirectory,
    "node_modules",
    packageName,
  );
  assert.equal(
    declarationHash(path.join(installedPackage, "mons-rules.d.ts")),
    expectedDeclarationHash,
    "packed declarations changed",
  );

  const runtimeSource = `
    import assert from "node:assert/strict";
    import { createRequire } from "node:module";
    import * as importedApi from ${JSON.stringify(packageName)};

    const requiredApi = createRequire(import.meta.url)(${JSON.stringify(packageName)});
    assert.strictEqual(requiredApi, importedApi, "import and require returned different namespaces");
    assert.deepEqual(Object.keys(importedApi).sort(), ${JSON.stringify(expectedExports)});

    const game = importedApi.MonsGameModel.new(importedApi.GameVariant.Classic);
    const openingFen = game.fen();
    const output = game.process_input_fen("l10,5;l9,4");
    assert.equal(output.kind, importedApi.OutputModelKind.Events);
    assert(output.events().length > 0, "representative move emitted no events");
    assert.notEqual(game.fen(), openingFen, "representative move did not update the game");
    assert.equal(importedApi.MonsGameModel.from_fen(game.fen())?.fen(), game.fen());
  `;
  fs.writeFileSync(path.join(consumerDirectory, "runtime.mjs"), runtimeSource);
  run(process.execPath, ["runtime.mjs"], { cwd: consumerDirectory });

  fs.writeFileSync(
    path.join(consumerDirectory, "consumer.ts"),
    `
      import { Color, GameVariant, Location, MonsGameModel, winner } from ${JSON.stringify(packageName)};
      const game: MonsGameModel = MonsGameModel.new(GameVariant.Classic);
      const color: Color = game.active_color();
      game.square(new Location(0, 0));
      winner(game.fen(), game.fen(), "", "");
      void color;
    `,
  );
  fs.writeFileSync(
    path.join(consumerDirectory, "commonjs-consumer.cts"),
    `
      import api = require(${JSON.stringify(packageName)});
      const game: api.MonsGameModel = api.MonsGameModel.new(api.GameVariant.Classic);
      const color: api.Color = game.active_color();
      game.square(new api.Location(0, 0));
      api.winner(game.fen(), game.fen(), "", "");
      void color;
    `,
  );
  fs.writeFileSync(
    path.join(consumerDirectory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          strict: true,
          target: "ES2023",
        },
        files: ["consumer.ts", "commonjs-consumer.cts"],
      },
      null,
      2,
    )}\n`,
  );
  run(
    process.execPath,
    [
      path.join(repoRoot, "node_modules", "typescript", "bin", "tsc"),
      "-p",
      "tsconfig.json",
    ],
    { cwd: consumerDirectory },
  );

  fs.writeFileSync(
    path.join(consumerDirectory, "browser.ts"),
    `
      import { GameVariant, MonsGameModel } from ${JSON.stringify(packageName)};
      export const openingFen = MonsGameModel.new(GameVariant.Classic).fen();
    `,
  );
  fs.writeFileSync(
    path.join(consumerDirectory, "worker.ts"),
    `
      import { GameVariant, MonsGameModel } from ${JSON.stringify(packageName)};
      self.onmessage = () => postMessage(MonsGameModel.new(GameVariant.Classic).fen());
    `,
  );
  for (const entryPoint of ["browser.ts", "worker.ts"]) {
    await build({
      absWorkingDir: consumerDirectory,
      entryPoints: [entryPoint],
      bundle: true,
      format: "esm",
      logLevel: "silent",
      platform: "browser",
      target: "es2020",
      write: false,
    });
  }

  console.log(
    `mons-rules package passed: packed=${report.size} unpacked=${report.unpackedSize}`,
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
