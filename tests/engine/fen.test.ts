import { describe, expect, it } from "vitest";

import { Board } from "../../src/engine/board.js";
import {
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
  type Event,
  type Item,
  type Mon,
} from "../../src/engine/domain.js";
import { GameVariant } from "../../src/engine/config.js";
import {
  boardFen,
  eventArrayFen,
  eventFen,
  gameFen,
  inputArrayFen,
  itemFen,
  nextInputFen,
  outputFen,
  parseBoardFen,
  parseGameFen,
  parseI32,
  parseInputArrayFen,
  parseInputFen,
  parseItemFen,
  parseLocationFen,
  parseMonFen,
} from "../../src/engine/fen.js";

const INITIAL_FENS = [
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n03xxmn01xxmn01xxmn03/n04xxmn01xxmn04/xxQn04xxUn04xxQ/n04xxMn01xxMn04/n03xxMn01xxMn01xxMn03/n11/n11/n03E0xA0xD0xS0xY0xn03 1",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n02xxmn02xxmn02xxmn02/xxQn04xxUn04xxQ/n02xxMn02xxMn02xxMn02/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03 2",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n05xxmn05/n02xxmn01xxmn01xxmn01xxmn02/xxQn04xxUn04xxQ/n02xxMn01xxMn01xxMn01xxMn02/n05xxMn05/n11/n11/n03E0xA0xD0xS0xY0xn03 3",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n11/n01xxmn01xxmn01xxmn01xxmn01xxmn01/xxQn04xxUn04xxQ/n01xxMn01xxMn01xxMn01xxMn01xxMn01/n11/n11/n11/n03E0xA0xD0xS0xY0xn03 4",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n04xxmxxmxxmn04/xxQn04xxUn04xxQ/n04xxMxxMxxMn04/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03 5",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmxxmxxmn04/n03xxmn03xxmn03/xxQn04xxUn04xxQ/n03xxMn03xxMn03/n04xxMxxMxxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03 6",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n05xxmn05/n04xxmxxmxxmn04/xxQn02xxmn01xxUn01xxMn02xxQ/n04xxMxxMxxMn04/n05xxMn05/n11/n11/n03E0xA0xD0xS0xY0xn03 7",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n11/xxmxxmn07xxmxxm/xxQxxmn03xxUn03xxMxxQ/xxMxxMn07xxMxxM/n11/n11/n11/n03E0xA0xD0xS0xY0xn03 8",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n02xxmxxmn07/xxQn01xxmn02xxUn02xxMn01xxQ/n07xxMxxMn02/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03 9",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn05/xxQn03xxmxxUxxMn03xxQ/n05xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03 10",
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n05xxmxxmn04/n06xxmxxmn03/xxQn02xxMn01xxUn01xxmn02xxQ/n03xxMxxMn06/n04xxMxxMn05/n11/n11/n03E0xA0xD0xS0xY0xn03 11",
] as const;

function initialGame(variant: GameVariant) {
  return {
    board: new Board(variant),
    whiteScore: 0,
    blackScore: 0,
    activeColor: Color.White,
    actionsUsedCount: 0,
    manaMovesCount: 0,
    monsMovesCount: 0,
    whitePotionsCount: 0,
    blackPotionsCount: 0,
    turnNumber: 1,
  };
}

describe("game and board FEN", () => {
  it("matches all twelve Rust-oracle initial layouts byte for byte", () => {
    for (const [variant, expected] of INITIAL_FENS.entries()) {
      expect(gameFen(initialGame(variant))).toBe(expected);
      const parsed = parseGameFen(expected);
      expect(parsed).toBeDefined();
      expect(parsed === undefined ? undefined : gameFen(parsed)).toBe(expected);
    }
  });

  it("normalizes explicit Classic and surrounding Unicode whitespace", () => {
    const classic = INITIAL_FENS[0];
    const explicit = `\t${classic.replaceAll(" ", "\u0085")}\u00a00\u3000`;
    const parsed = parseGameFen(explicit);
    expect(parsed).toBeDefined();
    expect(parsed === undefined ? undefined : gameFen(parsed)).toBe(classic);
    expect(parseGameFen(classic.replace(" ", "\ufeff"))).toBeUndefined();
  });

  it("uses bounded Rust i32 parsing for every numeric field", () => {
    expect(parseI32("+0001")).toBe(1);
    expect(parseI32("-2147483648")).toBe(-2_147_483_648);
    expect(parseI32("2147483647")).toBe(2_147_483_647);
    for (const invalid of [
      "",
      " ",
      "1.0",
      "1e2",
      "2147483648",
      "-2147483649",
      "１",
    ]) {
      expect(parseI32(invalid)).toBeUndefined();
    }

    expect(parseGameFen(INITIAL_FENS[0].replace(/^0/u, "+01"))).toBeDefined();
    expect(
      parseGameFen(INITIAL_FENS[0].replace(/^0/u, "2147483648")),
    ).toBeUndefined();
    expect(parseGameFen(`${INITIAL_FENS[0]} 99`)).toBeUndefined();
    expect(parseGameFen(`${INITIAL_FENS[0]} 0 0`)).toBeUndefined();
  });

  it("retains the legacy permissive board parser", () => {
    const rows = INITIAL_FENS[0].split(" ")[9]?.split("/");
    expect(rows).toBeDefined();
    if (rows === undefined) {
      return;
    }

    const emptyFirst = rows.with(0, "").join("/");
    const emptyBoard = parseBoardFen(emptyFirst, GameVariant.Classic);
    expect(emptyBoard).toBeDefined();
    expect(emptyBoard === undefined ? undefined : boardFen(emptyBoard)).toBe(
      rows.with(0, "n11").join("/"),
    );

    for (const ignoredFirstRow of ["n00", "n99", "???", "E0", "nxx", "nnn"]) {
      const parsed = parseBoardFen(
        rows.with(0, ignoredFirstRow).join("/"),
        GameVariant.Classic,
      );
      expect(parsed).toBeDefined();
      expect(parsed === undefined ? undefined : boardFen(parsed)).toBe(
        rows.with(0, "n11").join("/"),
      );
    }

    const crossed = parseBoardFen(
      rows.with(0, "n11E0x").join("/"),
      GameVariant.Classic,
    );
    expect(crossed).toBeDefined();
    expect(crossed === undefined ? undefined : boardFen(crossed)).toBe(
      rows.with(0, "n11").with(1, "E0xn10").join("/"),
    );

    expect(parseBoardFen("n11/n11", GameVariant.Classic)).toBeUndefined();

    const aliased = parseBoardFen(
      rows.with(0, "n99E0x").join("/"),
      GameVariant.Classic,
    );
    expect(aliased?.item({ i: 9, j: 0 })).toEqual({
      kind: "mon",
      mon: { kind: MonKind.Demon, color: Color.White, cooldown: 0 },
    });
    expect(() =>
      parseBoardFen(rows.with(2, "n99E0x").join("/"), GameVariant.Classic),
    ).toThrow(new RangeError("board FEN item index is out of bounds"));
  });
});

describe("value and input codecs", () => {
  it("round-trips items and retains the ignored mon suffix", () => {
    const cases: readonly [string, Item][] = [
      [
        "E0x",
        {
          kind: "mon",
          mon: { kind: MonKind.Demon, color: Color.White, cooldown: 0 },
        },
      ],
      ["xxm", { kind: "mana", mana: { kind: "regular", color: Color.Black } }],
      [
        "A2U",
        {
          kind: "mon-with-mana",
          mon: { kind: MonKind.Angel, color: Color.White, cooldown: 2 },
          mana: { kind: "supermana" },
        },
      ],
      [
        "s1B",
        {
          kind: "mon-with-consumable",
          mon: { kind: MonKind.Spirit, color: Color.Black, cooldown: 1 },
          consumable: Consumable.Bomb,
        },
      ],
      ["xxQ", { kind: "consumable", consumable: Consumable.BombOrPotion }],
    ];
    for (const [fen, value] of cases) {
      expect(parseItemFen(fen)).toEqual(value);
      expect(itemFen(value)).toBe(fen);
    }
    expect(parseItemFen("E0?")).toEqual({
      kind: "mon",
      mon: { kind: MonKind.Demon, color: Color.White, cooldown: 0 },
    });
    expect(parseItemFen("xx?")).toBeUndefined();
    expect(parseItemFen("E0")).toBeUndefined();
    expect(parseItemFen("éx")).toBeUndefined();
    expect(parseItemFen("😀")).toBeUndefined();
    expect(parseItemFen("E0é")).toBeUndefined();
    expect(parseItemFen("E0€")).toBeUndefined();
    expect(parseItemFen("E0\ud800")).toBeUndefined();
    expect(() => parseItemFen("eé")).toThrow(
      new RangeError("UTF-8 byte index is not a scalar boundary"),
    );
    expect(() => parseItemFen("€")).toThrow(
      new RangeError("UTF-8 byte index is not a scalar boundary"),
    );
    expect(() => parseItemFen("\ud800")).toThrow(
      new RangeError("UTF-8 byte index is not a scalar boundary"),
    );
    expect(parseMonFen("E9")).toEqual({
      kind: MonKind.Demon,
      color: Color.White,
      cooldown: 9,
    });
    expect(parseMonFen("e-1")).toBeUndefined();
  });

  it("parses locations strictly and silently drops malformed input tokens", () => {
    expect(parseLocationFen("+01,-2")).toEqual({ i: 1, j: -2 });
    expect(parseLocationFen("1,2,3")).toBeUndefined();
    expect(parseLocationFen("1.0,2")).toBeUndefined();
    for (const lineTerminator of ["\n", "\r", "\r\n", "\u2028", "\u2029"]) {
      expect(parseLocationFen(`1,2${lineTerminator}`)).toBeUndefined();
    }

    expect(parseInputFen("zignored-by-legacy-parser")).toEqual({
      kind: "takeback",
    });
    expect(parseInputFen("l1,2")).toEqual({
      kind: "location",
      location: { i: 1, j: 2 },
    });
    expect(parseInputFen("mb")).toEqual({
      kind: "modifier",
      modifier: Modifier.SelectBomb,
    });
    expect(parseInputFen("mp-extra")).toBeUndefined();

    const parsed = parseInputArrayFen("bad;l1,2;;mb;zjunk;l2147483648,0");
    expect(parsed).toEqual([
      { kind: "location", location: { i: 1, j: 2 } },
      { kind: "modifier", modifier: Modifier.SelectBomb },
      { kind: "takeback" },
    ]);
    expect(inputArrayFen(parsed)).toBe("l1,2;mb;z");
    expect(parseInputArrayFen("")).toEqual([]);
  });
});

describe("next-input, event, and output codecs", () => {
  const whiteDemon: Mon = {
    kind: MonKind.Demon,
    color: Color.White,
    cooldown: 0,
  };
  const blackMana = { kind: "regular", color: Color.Black } as const;
  const mon: Item = { kind: "mon", mon: whiteDemon };
  const one = { i: 1, j: 2 } as const;
  const two = { i: 3, j: 4 } as const;
  const three = { i: 5, j: 6 } as const;

  it("encodes each event kind with the legacy field order", () => {
    const cases: readonly [Event, string][] = [
      [{ kind: "mon-move", item: mon, from: one, to: two }, "mm E0x 1,2 3,4"],
      [
        { kind: "mana-move", mana: blackMana, from: one, to: two },
        "mma m 1,2 3,4",
      ],
      [{ kind: "mana-scored", mana: blackMana, at: one }, "ms m 1,2"],
      [
        { kind: "mystic-action", mystic: whiteDemon, from: one, to: two },
        "ma E0 1,2 3,4",
      ],
      [
        { kind: "demon-action", demon: whiteDemon, from: one, to: two },
        "da E0 1,2 3,4",
      ],
      [
        {
          kind: "demon-additional-step",
          demon: whiteDemon,
          from: one,
          to: two,
        },
        "das E0 1,2 3,4",
      ],
      [
        {
          kind: "spirit-target-move",
          item: mon,
          from: one,
          to: two,
          by: three,
        },
        "stm E0x 1,2 3,4 5,6",
      ],
      [{ kind: "pickup-bomb", by: whiteDemon, at: one }, "pb E0 1,2"],
      [{ kind: "pickup-potion", by: mon, at: one }, "pp E0x 1,2"],
      [
        { kind: "pickup-mana", mana: blackMana, by: whiteDemon, at: one },
        "pm m E0 1,2",
      ],
      [
        { kind: "mon-fainted", mon: whiteDemon, from: one, to: two },
        "mf E0 1,2 3,4",
      ],
      [{ kind: "mana-dropped", mana: blackMana, at: one }, "md m 1,2"],
      [{ kind: "supermana-back-to-base", from: one, to: two }, "sb 1,2 3,4"],
      [
        { kind: "bomb-attack", by: whiteDemon, from: one, to: two },
        "ba E0 1,2 3,4",
      ],
      [{ kind: "mon-awake", mon: whiteDemon, at: one }, "maw E0 1,2"],
      [{ kind: "bomb-explosion", at: one }, "be 1,2"],
      [{ kind: "next-turn", color: Color.Black }, "nt b"],
      [{ kind: "game-over", winner: Color.White }, "go w"],
      [{ kind: "takeback" }, "z"],
      [{ kind: "use-potion", from: one, to: two }, "up 1,2 3,4"],
    ];
    for (const [event, expected] of cases) {
      expect(eventFen(event)).toBe(expected);
    }
    expect(eventArrayFen(cases.slice(0, 2).map(([event]) => event))).toBe(
      "mm E0x 1,2 3,4 mma m 1,2 3,4",
    );
  });

  it("encodes next inputs and ASCII-sorts output without mutating arrays", () => {
    expect(
      nextInputFen({
        input: { kind: "location", location: one },
        kind: NextInputKind.MonMove,
      }),
    ).toBe("l1,2 mm o");
    expect(
      nextInputFen({
        input: { kind: "modifier", modifier: Modifier.SelectPotion },
        kind: NextInputKind.SelectConsumable,
        actorMonItem: mon,
      }),
    ).toBe("mp sc E0x");

    const locations = [
      { i: 2, j: 0 },
      { i: 10, j: 0 },
      { i: 1, j: 9 },
    ];
    expect(outputFen({ kind: "locations-to-start-from", locations })).toBe(
      "l1,9/10,0/2,0",
    );
    expect(locations).toEqual([
      { i: 2, j: 0 },
      { i: 10, j: 0 },
      { i: 1, j: 9 },
    ]);

    expect(
      outputFen({
        kind: "events",
        events: [
          { kind: "takeback" },
          { kind: "bomb-explosion", at: one },
          { kind: "next-turn", color: Color.White },
        ],
      }),
    ).toBe("ebe 1,2/nt w/z");
    expect(outputFen({ kind: "invalid-input" })).toBe("i");
  });
});
