#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const esbuild = require("esbuild");

const REPO_ROOT = path.resolve(__dirname, "..");
const packageDir = path.resolve(process.argv[2] ?? "");
const target = process.argv[3];

assert(["web", "node"].includes(target), "target must be web or node");
assert(
  fs.statSync(packageDir).isDirectory(),
  `package directory missing: ${packageDir}`,
);

const packageBase = target === "web" ? "mons-web" : "mons-rust";
const expectedFiles =
  target === "web"
    ? ["LICENSE", "README.md", "mons-web.d.ts", "mons-web.js", "package.json"]
    : [
        "LICENSE",
        "README.md",
        "mons-rust-internal.cjs",
        "mons-rust.d.ts",
        "mons-rust.js",
        "package.json",
      ];
const expectedPublicExports = [
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
const expectedSemanticTypeHash =
  "68e0712dd6eff91e02a6a8ab0ea1e0437b4198d4ab1f48836af491a047d43b86";
const expectedClassContract = JSON.parse(
  fs.readFileSync(
    path.join(REPO_ROOT, "contracts/legacy/runtime-contract.json"),
    "utf8",
  ),
).classes;
const rootManifest = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"),
);
const sourceManifest = JSON.parse(
  fs.readFileSync(path.join(packageDir, "package.json"), "utf8"),
);

if (target === "web") {
  assert.doesNotMatch(
    rootManifest.version,
    /^0\.1\./,
    "removing the mons-web initializers requires a release outside the 0.1.x line",
  );
}

assert.equal(
  sourceManifest.name,
  packageBase,
  `${target} package name changed`,
);
assert.equal(
  sourceManifest.version,
  rootManifest.version,
  `${target} package version differs from root package.json`,
);
assert.equal(sourceManifest.main, `${packageBase}.js`);
assert.equal(sourceManifest.types, `${packageBase}.d.ts`);
assert.equal(sourceManifest.description, "super metal mons");
assert.equal(sourceManifest.license, "CC0-1.0");
assert.deepEqual(sourceManifest.repository, {
  type: "git",
  url: "https://github.com/supermetalmons/mons-rust",
});
assert.deepEqual(
  sourceManifest.files,
  target === "web"
    ? ["mons-web.js", "mons-web.d.ts", "LICENSE", "README.md"]
    : [
        "mons-rust.js",
        "mons-rust-internal.cjs",
        "mons-rust.d.ts",
        "LICENSE",
        "README.md",
      ],
  `${target} package files metadata changed`,
);
assert.equal(
  sourceManifest.dependencies,
  undefined,
  "runtime dependencies are forbidden",
);
assert.equal(
  sourceManifest.exports,
  undefined,
  "an exports map would restrict compatibility",
);
assert.equal(
  sourceManifest.engines,
  undefined,
  "published packages retain no engines field",
);
for (const field of [
  "bundledDependencies",
  "browser",
  "devDependencies",
  "module",
  "optionalDependencies",
  "peerDependencies",
  "private",
  "scripts",
  "sideEffects",
]) {
  assert.equal(
    sourceManifest[field],
    undefined,
    `published packages retain no ${field} field`,
  );
}
assert.equal(sourceManifest.type, target === "web" ? "module" : undefined);

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

function semanticDeclarationHash(file) {
  const canonical = canonicalizeDeclarations(fs.readFileSync(file, "utf8"));
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

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), `mons-${target}-package-check-`),
);
try {
  const packDir = path.join(temporaryRoot, "pack");
  fs.mkdirSync(packDir);
  const packReports = JSON.parse(
    run("npm", ["pack", "--json", "--pack-destination", packDir], {
      cwd: packageDir,
    }),
  );
  assert.equal(packReports.length, 1, "npm pack must report one package");
  const report = packReports[0];
  const actualFiles = report.files.map(({ path: file }) => file).sort();
  assert.deepEqual(
    actualFiles,
    expectedFiles,
    `${target} npm tar surface changed`,
  );
  assert.equal(report.name, packageBase);
  assert.equal(report.version, rootManifest.version);
  assert(
    report.size <= 325_000,
    `${target} packed size ${report.size} exceeds 325000`,
  );
  assert(
    report.unpackedSize <= 925_000,
    `${target} unpacked size ${report.unpackedSize} exceeds 925000`,
  );
  for (const { path: file } of report.files) {
    assert(
      !/(?:^|\/)(?:snippets?|cargo)(?:\/|$)|\.(?:wasm|rs|map)$/iu.test(file),
      `forbidden Rust/Wasm/generated artifact in package: ${file}`,
    );
  }

  const archivePath = path.join(packDir, report.filename);
  const unpackDir = path.join(temporaryRoot, "unpacked");
  fs.mkdirSync(unpackDir);
  run("tar", ["-xzf", archivePath, "-C", unpackDir]);
  const packedPackageDir = path.join(unpackDir, "package");
  assert.equal(
    semanticDeclarationHash(path.join(packedPackageDir, `${packageBase}.d.ts`)),
    expectedSemanticTypeHash,
    `${target} public declarations changed`,
  );

  const installDir = path.join(temporaryRoot, "consumer");
  fs.mkdirSync(installDir);
  fs.writeFileSync(
    path.join(installDir, "package.json"),
    `${JSON.stringify({ name: "mons-package-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  run(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", archivePath],
    { cwd: installDir },
  );

  const esmSmoke = `
    import * as api from ${JSON.stringify(packageBase)};
    const keys = Object.keys(api).filter((key) => key !== "default" && key !== "module.exports").sort();
    if (JSON.stringify(keys) !== ${JSON.stringify(JSON.stringify(expectedPublicExports))}) throw new Error("bad exports: " + keys);
    const expectedClasses = ${JSON.stringify(expectedClassContract)};
    const functionObservation = (value) => typeof value === "function"
      ? { type: "function", name: value.name, length: value.length }
      : undefined;
    const descriptorObservation = (owner, key) => {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (!descriptor) throw new Error("missing descriptor: " + key);
      if ("value" in descriptor) {
        const value = functionObservation(descriptor.value);
        return {
          configurable: descriptor.configurable ?? false,
          enumerable: descriptor.enumerable ?? false,
          kind: "data",
          writable: descriptor.writable ?? false,
          ...(value === undefined ? {} : { value }),
        };
      }
      const get = functionObservation(descriptor.get);
      const set = functionObservation(descriptor.set);
      return {
        configurable: descriptor.configurable ?? false,
        enumerable: descriptor.enumerable ?? false,
        kind: "accessor",
        ...(get === undefined ? {} : { get }),
        ...(set === undefined ? {} : { set }),
      };
    };
    for (const [className, expected] of Object.entries(expectedClasses)) {
      const constructor = api[className];
      if (typeof constructor !== "function") throw new Error("missing class: " + className);
      const staticKeys = Object.getOwnPropertyNames(constructor).filter(
        (key) => !["length", "name", "prototype"].includes(key),
      );
      const prototypeKeys = Object.getOwnPropertyNames(constructor.prototype).filter(
        (key) => key !== "constructor",
      );
      const actual = {
        name: constructor.name,
        length: constructor.length,
        staticKeys,
        staticDescriptors: Object.fromEntries(
          staticKeys.map((key) => [key, descriptorObservation(constructor, key)]),
        ),
        prototypeKeys,
        prototypeDescriptors: Object.fromEntries(
          prototypeKeys.map((key) => [key, descriptorObservation(constructor.prototype, key)]),
        ),
      };
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error("class descriptor drift: " + className);
      }
    }
    for (const enumName of ["AvailableMoveKind", "Color", "Consumable", "EventModelKind", "GameVariant", "ItemModelKind", "ManaKind", "Modifier", "MonKind", "NextInputKind", "OutputModelKind", "SquareModelKind"]) {
      if (!Object.isFrozen(api[enumName])) throw new Error(enumName + " is not frozen");
    }
    const game = api.MonsGameModel.new(api.GameVariant.Classic);
    const openingFen = game.fen();
    const nelFen = openingFen.replaceAll(" ", "\u0085");
    const bomFen = openingFen.replaceAll(" ", "\ufeff");
    if (api.MonsGameModel.from_fen(nelFen)?.fen() !== openingFen) throw new Error("Rust NEL whitespace drift");
    if (api.MonsGameModel.from_fen(bomFen) !== undefined) throw new Error("BOM was treated as Rust whitespace");
    if (api.MonsGameModel.new(4294967297).fen() !== api.MonsGameModel.new(api.GameVariant.SwappedManaRows).fen()) {
      throw new Error("wasm i32 enum wrapping drift");
    }
    let invalidEnumError;
    try { api.MonsGameModel.new(-1); } catch (error) { invalidEnumError = error; }
    if (!(invalidEnumError instanceof Error) || invalidEnumError.message !== "invalid enum value passed") {
      throw new Error("required enum validation drift");
    }
    const normalizedInput = game.process_input_fen("z\ud800");
    if (normalizedInput.input_fen() !== "z\ufffd") throw new Error("unpaired surrogate normalization drift");
    if (game.fen() !== openingFen) throw new Error("invalid normalized input mutated its source");

    const firstItem = game.item(new api.Location(10, 3));
    const secondItem = game.item(new api.Location(10, 3));
    if (!firstItem || !secondItem || firstItem === secondItem || firstItem.mon === secondItem.mon) {
      throw new Error("item getters stopped returning fresh snapshots");
    }
    const firstMon = firstItem.mon;
    if (!firstMon) throw new Error("opening Demon missing");
    firstMon.cooldown = 9;
    if (game.item(new api.Location(10, 3))?.mon?.cooldown !== 0) throw new Error("nested item snapshot leaked a mutation");

    const mana = new api.ManaModel();
    mana.kind = api.ManaKind.Supermana;
    mana.color = api.Color.Black;
    const incoherent = new api.ItemModel();
    incoherent.kind = api.ItemModelKind.Consumable;
    incoherent.mana = mana;
    incoherent.consumable = api.Consumable.Bomb;
    const event = new api.EventModel();
    event.item = incoherent;
    mana.color = api.Color.White;
    incoherent.kind = api.ItemModelKind.Mon;
    incoherent.consumable = api.Consumable.Potion;
    const copied = event.item;
    if (!copied || copied.kind !== api.ItemModelKind.Consumable || copied.mana?.color !== api.Color.Black || copied.consumable !== api.Consumable.Bomb) {
      throw new Error("lossless DTO snapshot drift");
    }
    copied.consumable = api.Consumable.BombOrPotion + 1;
    if (copied.consumable !== undefined) throw new Error("optional enum sentinel drift");
    if (event.item?.consumable !== api.Consumable.Bomb) throw new Error("DTO getter copy leaked a mutation");

    if (api.winner.length !== 4 || api.winner.name !== ${JSON.stringify(target === "web" ? "winner" : "")}) {
      throw new Error("winner function descriptor drift");
    }
    const ownPerformanceNow = Object.getOwnPropertyDescriptor(performance, "now");
    Object.defineProperty(performance, "now", { configurable: true, value: () => 0 });
    try {
      const openingRoutes = { fast: "l10,5;l9,4", normal: "l10,5;l9,4", pro: "l10,7;l9,8" };
      for (const [preference, expected] of Object.entries(openingRoutes)) {
        if (game.smartAutomove(preference).input_fen() !== expected) throw new Error("opening smart route mismatch: " + preference);
        if (game.fen() !== openingFen) throw new Error("smart automove mutated its source");
      }
      const releaseFen = "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n02E0xn01A0xD0xS0xY0xn03";
      const release = api.MonsGameModel.from_fen(releaseFen);
      if (!release) throw new Error("release fixture did not parse");
      const releaseRoutes = { fast: "l10,6;l9,6", normal: "l10,6;l9,6", pro: "l10,5;l9,4" };
      for (const [preference, expected] of Object.entries(releaseRoutes)) {
        if (release.smartAutomove(preference).input_fen() !== expected) throw new Error("release smart route mismatch: " + preference);
        if (release.fen() !== releaseFen) throw new Error("release smart automove mutated its source");
      }
    } finally {
      if (ownPerformanceNow === undefined) delete performance.now;
      else Object.defineProperty(performance, "now", ownPerformanceNow);
    }
    const general = api.MonsGameModel.new(api.GameVariant.OffsetArcManaRows);
    const generalFen = general.fen();
    const startedAt = performance.now();
    const generalOutput = general.smartAutomove("pro");
    const elapsedMs = performance.now() - startedAt;
    if (elapsedMs >= 700) throw new Error("smart automove latency exceeded: " + elapsedMs);
    if (general.fen() !== generalFen) throw new Error("general smart automove mutated its source");
    const generalReplay = api.MonsGameModel.from_fen(generalFen);
    if (!generalReplay || generalReplay.process_input_fen(generalOutput.input_fen()).kind !== api.OutputModelKind.Events) {
      throw new Error("general smart route did not replay legally");
    }
    if (api.winner(game.fen(), game.fen(), "", "") !== "") throw new Error("winner mismatch");
  `;
  run(process.execPath, ["--input-type=module", "--eval", esmSmoke], {
    cwd: installDir,
  });

  if (target === "node") {
    const requireSmoke = `
      Object.defineProperty(globalThis, "crypto", { configurable: true, value: undefined });
      Object.defineProperty(globalThis, "performance", { configurable: true, value: undefined });
      const api = require(${JSON.stringify(packageBase)});
      const keys = Object.keys(api).sort();
      if (JSON.stringify(keys) !== ${JSON.stringify(JSON.stringify(expectedPublicExports))}) throw new Error("bad exports: " + keys);
      if (api.winner.name !== "" || api.winner.length !== 4) throw new Error("CommonJS winner descriptor drift");
      const game = api.MonsGameModel.new(api.GameVariant.Classic);
      if (game.fen().length === 0) throw new Error("empty FEN");
      const sourceFen = game.fen();
      const smart = game.smartAutomove("fast");
      if (smart.kind !== api.OutputModelKind.Events || game.fen() !== sourceFen) {
        throw new Error("Node smart automove depends on browser globals");
      }
      const random = game.automove();
      if (random.kind !== api.OutputModelKind.Events || game.fen() === sourceFen) {
        throw new Error("Node random automove depends on browser globals");
      }
    `;
    run(process.execPath, ["--eval", requireSmoke], { cwd: installDir });
  }

  const consumerSource = `
    import { Color, GameVariant, Location, MonsGameModel, winner } from ${JSON.stringify(packageBase)};
    const game: MonsGameModel = MonsGameModel.new(GameVariant.Classic);
    const color: Color = game.active_color();
    const at: Location = new Location(0, 0);
    game.square(at);
    winner(game.fen(), game.fen(), "", "");
    void color;
  `;
  fs.writeFileSync(path.join(installDir, "consumer.ts"), consumerSource);
  fs.writeFileSync(
    path.join(installDir, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          module: "NodeNext",
          moduleResolution: "NodeNext",
          noEmit: true,
          skipLibCheck: true,
          strict: true,
          target: "ES2022",
        },
        files: ["consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );
  run(
    process.execPath,
    [
      path.join(REPO_ROOT, "node_modules/typescript/bin/tsc"),
      "-p",
      "tsconfig.json",
    ],
    { cwd: installDir },
  );

  if (target === "web") {
    esbuild.buildSync({
      absWorkingDir: installDir,
      entryPoints: ["consumer.ts"],
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2020",
      write: false,
    });
    fs.writeFileSync(
      path.join(installDir, "worker.ts"),
      `import { MonsGameModel, GameVariant } from "mons-web"; self.onmessage = () => postMessage(MonsGameModel.new(GameVariant.Classic).fen());\n`,
    );
    esbuild.buildSync({
      absWorkingDir: installDir,
      entryPoints: ["worker.ts"],
      bundle: true,
      platform: "browser",
      format: "esm",
      target: "es2020",
      write: false,
    });
  }

  const directEntry = path.join(packageDir, `${packageBase}.js`);
  if (target === "web") {
    const source = `
      const api = await import(${JSON.stringify(pathToFileURL(directEntry).href)});
      if ("default" in api || "initSync" in api) throw new Error("removed initializer leaked");
    `;
    run(process.execPath, ["--input-type=module", "--eval", source]);
  }

  console.log(
    `${target} npm package passed: packed=${report.size} unpacked=${report.unpackedSize}`,
  );
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
