import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it } from "vitest";

import * as nodeEntrypoint from "../../src/entrypoints/mons-rust.js";
import * as webEntrypoint from "../../src/entrypoints/mons-web.js";

const EXPECTED_EXPORTS = [
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
] as const;
const ROOT_MANIFEST = JSON.parse(
  fs.readFileSync(path.resolve("package.json"), "utf8"),
) as { version: string };

describe("public entrypoints", () => {
  it("exposes exactly the supported 23 named APIs in both packages", () => {
    expect(Object.keys(webEntrypoint).sort()).toEqual(EXPECTED_EXPORTS);
    expect(Object.keys(nodeEntrypoint).sort()).toEqual(EXPECTED_EXPORTS);
  });

  it("does not retain the removed browser Wasm initializers", () => {
    expect(webEntrypoint).not.toHaveProperty("default");
    expect(webEntrypoint).not.toHaveProperty("initSync");
    expect(ROOT_MANIFEST.version).not.toMatch(/^0\.1\./);
  });

  it("keeps the CommonJS winner anonymous with four declared arguments", () => {
    const wrapperSource = fs.readFileSync(
      path.resolve("src/entrypoints/mons-rust-wrapper.cjs"),
      "utf8",
    );
    const internalWinner = function internalWinner(
      fenW: unknown,
      fenB: unknown,
      movesW: unknown,
      movesB: unknown,
    ): unknown[] {
      return [fenW, fenB, movesW, movesB];
    };
    const api = new Proxy(
      { winner: internalWinner },
      {
        get(target, property) {
          return Reflect.get(target, property) ?? property;
        },
      },
    );
    const commonJsExports: Record<string, unknown> = {};
    vm.runInNewContext(wrapperSource, {
      exports: commonJsExports,
      require: () => api,
    });

    const commonJsWinner = commonJsExports["winner"];
    expect(commonJsWinner).toBeTypeOf("function");
    if (typeof commonJsWinner !== "function") return;
    expect(commonJsWinner.name).toBe("");
    expect(commonJsWinner.length).toBe(4);
    expect(commonJsWinner("w", "b", "mw", "mb")).toEqual([
      "w",
      "b",
      "mw",
      "mb",
    ]);
  });
});
