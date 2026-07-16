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
const webDir = path.join(packageRoot, "web");
const nodeDir = path.join(packageRoot, "node");
const rootManifest = JSON.parse(
  await fs.readFile(path.join(repoRoot, "package.json"), "utf8"),
);

const sharedManifest = {
  description: "super metal mons",
  version: rootManifest.version,
  license: "CC0-1.0",
  repository: {
    type: "git",
    url: "https://github.com/supermetalmons/mons-rust",
  },
};

await fs.rm(packageRoot, { recursive: true, force: true });
await Promise.all([
  fs.mkdir(webDir, { recursive: true }),
  fs.mkdir(nodeDir, { recursive: true }),
]);

await Promise.all([
  build({
    entryPoints: [path.join(repoRoot, "src/entrypoints/mons-web.ts")],
    outfile: path.join(webDir, "mons-web.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    minify: true,
    keepNames: true,
    legalComments: "none",
    sourcemap: false,
  }),
  build({
    entryPoints: [path.join(repoRoot, "src/entrypoints/mons-rust.ts")],
    outfile: path.join(nodeDir, "mons-rust-internal.cjs"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: ["es2020"],
    minify: true,
    keepNames: true,
    legalComments: "none",
    sourcemap: false,
  }),
]);

await Promise.all([
  fs.copyFile(
    path.join(repoRoot, "src/entrypoints/mons-rust-wrapper.cjs"),
    path.join(nodeDir, "mons-rust.js"),
  ),
  ...[webDir, nodeDir].flatMap((directory) => [
    fs.copyFile(
      path.join(repoRoot, "LICENSE"),
      path.join(directory, "LICENSE"),
    ),
    fs.copyFile(
      path.join(repoRoot, "README.md"),
      path.join(directory, "README.md"),
    ),
  ]),
  fs.copyFile(
    path.join(repoRoot, "contracts/legacy/mons-api.d.ts"),
    path.join(webDir, "mons-web.d.ts"),
  ),
  fs.copyFile(
    path.join(repoRoot, "contracts/legacy/mons-api.d.ts"),
    path.join(nodeDir, "mons-rust.d.ts"),
  ),
]);

const webManifest = {
  name: "mons-web",
  type: "module",
  ...sharedManifest,
  files: ["mons-web.js", "mons-web.d.ts", "LICENSE", "README.md"],
  main: "mons-web.js",
  types: "mons-web.d.ts",
};
const nodeManifest = {
  name: "mons-rust",
  ...sharedManifest,
  files: [
    "mons-rust.js",
    "mons-rust-internal.cjs",
    "mons-rust.d.ts",
    "LICENSE",
    "README.md",
  ],
  main: "mons-rust.js",
  types: "mons-rust.d.ts",
};

await Promise.all([
  fs.writeFile(
    path.join(webDir, "package.json"),
    `${JSON.stringify(webManifest, null, 2)}\n`,
  ),
  fs.writeFile(
    path.join(nodeDir, "package.json"),
    `${JSON.stringify(nodeManifest, null, 2)}\n`,
  ),
]);

console.log(
  `Built mons-web and mons-rust ${rootManifest.version} in ${packageRoot}`,
);
