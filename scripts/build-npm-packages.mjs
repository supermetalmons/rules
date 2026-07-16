#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageRoot = path.join(repoRoot, "pkg");
const packageDir = path.join(packageRoot, "mons-rules");
const rootManifest = JSON.parse(
  await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
);

const sharedManifest = {
  description: "super metal mons",
  version: rootManifest.version,
  license: "CC0-1.0",
  repository: {
    type: "git",
    url: "git+https://github.com/supermetalmons/rules.git",
  },
};

await fs.rm(packageRoot, { recursive: true, force: true });
await fs.mkdir(packageDir, { recursive: true });

await build({
  entryPoints: [path.join(repoRoot, "src/entrypoints/mons-rules.ts")],
  outfile: path.join(packageDir, "mons-rules.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  keepNames: true,
  legalComments: "none",
  sourcemap: false,
});

await Promise.all([
  fs.copyFile(path.join(repoRoot, "LICENSE"), path.join(packageDir, "LICENSE")),
  fs.copyFile(
    path.join(repoRoot, "README.md"),
    path.join(packageDir, "README.md"),
  ),
  fs.copyFile(
    path.join(repoRoot, "contracts/legacy/mons-api.d.ts"),
    path.join(packageDir, "mons-rules.d.ts"),
  ),
]);

const packageManifest = {
  name: "mons-rules",
  type: "module",
  ...sharedManifest,
  files: ["mons-rules.js", "mons-rules.d.ts", "LICENSE", "README.md"],
  main: "./mons-rules.js",
  module: "./mons-rules.js",
  browser: "./mons-rules.js",
  types: "./mons-rules.d.ts",
  engines: rootManifest.engines,
  exports: {
    ".": {
      types: "./mons-rules.d.ts",
      import: "./mons-rules.js",
      require: "./mons-rules.js",
      default: "./mons-rules.js",
    },
  },
};

await fs.writeFile(
  path.join(packageDir, "package.json"),
  `${JSON.stringify(packageManifest, null, 2)}\n`,
);

console.log(`Built mons-rules ${rootManifest.version} in ${packageDir}`);
