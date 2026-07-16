import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const checkerSource = readFileSync(
  resolve("scripts/assert-pure-typescript-repository.mjs"),
  "utf8",
);
const temporaryRoots: string[] = [];

function runChecker(files: Readonly<Record<string, string>>) {
  const root = mkdtempSync(join(tmpdir(), "mons-purity-"));
  temporaryRoots.push(root);
  const checker = join(
    root,
    "scripts",
    "assert-pure-typescript-repository.mjs",
  );
  mkdirSync(dirname(checker), { recursive: true });
  writeFileSync(checker, checkerSource);

  for (const [relativePath, contents] of Object.entries(files)) {
    const file = join(root, relativePath);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }

  return spawnSync(process.execPath, [checker], { encoding: "utf8" });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("TypeScript repository purity checker", () => {
  it("ignores generated artifact directories only at the repository root", () => {
    const result = runChecker({
      "target/generated.rs": "ignored root build output",
      "pkg/generated.wasm": "ignored root package output",
      "node_modules/example/native.rs": "ignored root dependency",
      "src/engine.ts": "export const engine = true;\n",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "Repository contains only the TypeScript/JavaScript engine toolchain.",
    );
  });

  it.each([
    "src/target/legacy.rs",
    "src/pkg/legacy.wasm",
    "src/node_modules/legacy.rs",
  ])("rejects a forbidden artifact hidden at %s", (relativePath) => {
    const result = runChecker({ [relativePath]: "not generated output" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(relativePath);
  });
});
