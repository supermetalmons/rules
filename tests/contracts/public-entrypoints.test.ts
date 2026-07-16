import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as entrypoint from "../../src/entrypoints/mons-rules.js";

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
  it("exposes exactly the supported 23 named APIs", () => {
    expect(Object.keys(entrypoint).sort()).toEqual(EXPECTED_EXPORTS);
  });

  it("does not retain the removed Wasm initializers", () => {
    expect(entrypoint).not.toHaveProperty("default");
    expect(entrypoint).not.toHaveProperty("initSync");
    expect(ROOT_MANIFEST.version).not.toMatch(/^0\.1\./);
  });

  it("keeps winner named with four declared arguments", () => {
    expect(entrypoint.winner.name).toBe("winner");
    expect(entrypoint.winner.length).toBe(4);
  });
});
