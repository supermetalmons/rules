import { describe, expect, it } from "vitest";

import { Board, boardEquals } from "../../src/engine/board.js";
import {
  ALL_GAME_VARIANTS,
  GameVariant,
  MON_BASE_LOCATIONS,
  SUPERMANA_BASE,
  manaBaseLocations,
  parseGameVariant,
} from "../../src/engine/config.js";
import {
  Color,
  Consumable,
  MonKind,
  consumableItem,
  createMon,
  monItem,
} from "../../src/engine/domain.js";
import { ALL_LOCATIONS, location } from "../../src/engine/geometry.js";

const EXPECTED_LAYOUTS = [
  ["3,4 3,6 4,3 4,5 4,7", "7,4 7,6 6,3 6,5 6,7"],
  ["3,3 3,5 3,7 4,4 4,6", "7,3 7,5 7,7 6,4 6,6"],
  ["3,4 3,6 4,2 4,5 4,8", "6,2 6,5 6,8 7,4 7,6"],
  ["3,5 4,2 4,4 4,6 4,8", "6,2 6,4 6,6 6,8 7,5"],
  ["4,1 4,3 4,5 4,7 4,9", "6,1 6,3 6,5 6,7 6,9"],
  ["3,4 3,6 4,4 4,5 4,6", "6,4 6,5 6,6 7,4 7,6"],
  ["3,4 3,5 3,6 4,3 4,7", "6,3 6,7 7,4 7,5 7,6"],
  ["3,5 4,4 4,5 4,6 5,3", "5,7 6,4 6,5 6,6 7,5"],
  ["4,0 4,1 4,9 4,10 5,1", "5,9 6,0 6,1 6,9 6,10"],
  ["3,4 3,6 4,2 4,3 5,2", "5,8 6,7 6,8 7,4 7,6"],
  ["3,4 3,6 4,3 4,5 5,4", "5,6 6,5 6,7 7,4 7,6"],
  ["3,5 3,6 4,6 4,7 5,7", "5,3 6,3 6,4 7,4 7,5"],
] as const;

function encodeLocations(
  values: readonly { readonly i: number; readonly j: number }[],
): string {
  return values.map(({ i, j }) => `${i},${j}`).join(" ");
}

describe("variant configuration", () => {
  it("retains a frozen bidirectional GameVariant enum", () => {
    expect(Object.isFrozen(GameVariant)).toBe(true);
    expect(GameVariant.Classic).toBe(0);
    expect(GameVariant.CornerChainManaRows).toBe(11);
    expect(GameVariant[11]).toBe("CornerChainManaRows");
  });

  it("matches every Rust mana layout in declared order", () => {
    expect(ALL_GAME_VARIANTS).toHaveLength(12);
    for (const variant of ALL_GAME_VARIANTS) {
      const expected = EXPECTED_LAYOUTS[variant];
      expect(encodeLocations(manaBaseLocations(variant, Color.Black))).toBe(
        expected[0],
      );
      expect(encodeLocations(manaBaseLocations(variant, Color.White))).toBe(
        expected[1],
      );
    }
  });

  it("parses strict IDs and rejects unknown variants", () => {
    expect(parseGameVariant("0")).toBe(GameVariant.Classic);
    expect(parseGameVariant("+11")).toBe(GameVariant.CornerChainManaRows);
    expect(parseGameVariant("12")).toBeUndefined();
    expect(parseGameVariant(" 1")).toBeUndefined();
  });
});

describe("board values", () => {
  it("creates all 12 exact initial board families", () => {
    for (const variant of ALL_GAME_VARIANTS) {
      const board = new Board(variant);
      expect([...board.occupied()]).toHaveLength(23);
      expect(board.variant()).toBe(variant);
      expect(board.item(SUPERMANA_BASE)).toEqual({
        kind: "mana",
        mana: { kind: "supermana" },
      });
      for (const at of manaBaseLocations(variant, Color.Black)) {
        expect(board.square(at)).toEqual({
          kind: "mana-base",
          color: Color.Black,
        });
        expect(board.item(at)).toEqual({
          kind: "mana",
          mana: { kind: "regular", color: Color.Black },
        });
      }
      for (const at of manaBaseLocations(variant, Color.White)) {
        expect(board.square(at)).toEqual({
          kind: "mana-base",
          color: Color.White,
        });
        expect(board.item(at)).toEqual({
          kind: "mana",
          mana: { kind: "regular", color: Color.White },
        });
      }
    }
  });

  it("places mon bases and consumables exactly", () => {
    const board = new Board();
    expect(MON_BASE_LOCATIONS).toHaveLength(10);
    expect(board.item(location(0, 3))).toEqual(
      monItem(createMon(MonKind.Mystic, Color.Black, 0)),
    );
    expect(board.item(location(10, 3))).toEqual(
      monItem(createMon(MonKind.Demon, Color.White, 0)),
    );
    expect(board.item(location(5, 0))).toEqual(
      consumableItem(Consumable.BombOrPotion),
    );
    expect(board.item(location(5, 10))).toEqual(
      consumableItem(Consumable.BombOrPotion),
    );
    expect(board.square(location(0, 0))).toEqual({
      kind: "mana-pool",
      color: Color.Black,
    });
    expect(board.item(location(0, 0))).toBeUndefined();
  });

  it("copies board and item values deeply", () => {
    const first = new Board();
    const second = new Board();
    const at = location(10, 3);
    const firstMon = first.item(at);
    if (firstMon?.kind !== "mon") {
      throw new Error("expected mon");
    }
    firstMon.mon.cooldown = 2;
    expect(second.item(at)).toEqual(
      monItem(createMon(MonKind.Demon, Color.White, 0)),
    );

    const copy = first.clone();
    expect(boardEquals(copy, first)).toBe(true);
    const copyMon = copy.item(at);
    if (copyMon?.kind !== "mon") {
      throw new Error("expected mon");
    }
    copyMon.mon.cooldown = 1;
    expect(firstMon.mon.cooldown).toBe(2);
    expect(boardEquals(copy, first)).toBe(false);
  });

  it("keeps occupied queries in row-major order", () => {
    const board = new Board();
    const occupied = [...board.occupied()];
    expect(occupied[0]?.[0]).toEqual(location(0, 3));
    expect(occupied.at(-1)?.[0]).toEqual(location(10, 7));
    expect(board.allMonsLocations(Color.Black)).toEqual([
      location(0, 3),
      location(0, 4),
      location(0, 5),
      location(0, 6),
      location(0, 7),
    ]);
  });

  it("reuses occupied entries until a board mutation invalidates them", () => {
    const board = new Board();
    const first = [...board.occupied()];
    const repeated = [...board.occupied()];

    expect(repeated[0]).toBe(first[0]);
    expect(first[0]?.[0]).toBe(ALL_LOCATIONS[3]);

    const replacement = consumableItem(Consumable.Bomb);
    board.put(replacement, location(0, 3));
    const afterReplacement = [...board.occupied()];
    expect(afterReplacement[0]).not.toBe(first[0]);
    expect(afterReplacement[0]).toEqual([location(0, 3), replacement]);

    board.removeItem(location(-1, 14));
    const afterWrappedRemoval = [...board.occupied()];
    expect(afterWrappedRemoval).toHaveLength(first.length - 1);
    expect(afterWrappedRemoval[0]?.[0]).toEqual(location(0, 4));

    board.put(replacement, location(1, -8));
    const afterWrappedPut = [...board.occupied()];
    expect(afterWrappedPut).toHaveLength(first.length);
    expect(afterWrappedPut[0]).toEqual([location(0, 3), replacement]);
  });

  it("does not expose mutable board storage through items snapshots", () => {
    const board = new Board();
    const initialOccupied = [...board.occupied()];
    const initialItem = board.item(location(0, 3));
    const exposedItems = board.items as (typeof board.items)[number][];

    exposedItems[3] = undefined;
    exposedItems.fill(undefined);

    expect(board.item(location(0, 3))).toBe(initialItem);
    expect([...board.occupied()]).toEqual(initialOccupied);
    expect([...board.occupied()][0]).toBe(initialOccupied[0]);
    expect(board.items).not.toBe(exposedItems);
  });

  it("shares cached values only across simulation board copies", () => {
    const board = new Board();
    const sourceOccupied = [...board.occupied()];
    const simulation = board.cloneForSimulation();
    const simulationOccupied = [...simulation.occupied()];

    expect(simulation.items).not.toBe(board.items);
    expect(simulationOccupied[0]).toBe(sourceOccupied[0]);

    simulation.removeItem(location(0, 3));
    expect(simulation.item(location(0, 3))).toBeUndefined();
    expect(board.item(location(0, 3))).toBeDefined();
    expect([...board.occupied()][0]).toBe(sourceOccupied[0]);

    const deepCopy = board.clone();
    expect([...deepCopy.occupied()][0]).not.toBe(sourceOccupied[0]);
    expect(deepCopy.item(location(0, 3))).not.toBe(board.item(location(0, 3)));
  });

  it("preserves wrapped mutation aliases and clean bounds errors", () => {
    const board = new Board();
    const expected = board.item(location(0, 3));
    expect(expected).toBeDefined();

    board.removeItem(location(-1, 14));
    expect(board.item(location(0, 3))).toBeUndefined();

    if (expected === undefined) {
      throw new Error("expected initial board item");
    }
    board.put(expected, location(1, -8));
    expect(board.item(location(0, 3))).toEqual(expected);

    const before = board.clone();
    expect(() => board.removeItem(location(11, 0))).toThrow(
      new RangeError("location index is out of bounds"),
    );
    expect(boardEquals(board, before)).toBe(true);

    expect(board.item(location(-1, 14))).toBeUndefined();
    expect(board.square(location(-1, 14))).toEqual({ kind: "regular" });
  });
});
