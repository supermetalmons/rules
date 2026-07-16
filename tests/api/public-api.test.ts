import { describe, expect, it } from "vitest";

import * as api from "../../src/entrypoints/mons-rules.js";

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

const EXPECTED_ENUMS = {
  AvailableMoveKind: {
    MonMove: 0,
    ManaMove: 1,
    Action: 2,
    Potion: 3,
  },
  Color: { White: 0, Black: 1 },
  Consumable: { Potion: 0, Bomb: 1, BombOrPotion: 2 },
  EventModelKind: {
    MonMove: 0,
    ManaMove: 1,
    ManaScored: 2,
    MysticAction: 3,
    DemonAction: 4,
    DemonAdditionalStep: 5,
    SpiritTargetMove: 6,
    PickupBomb: 7,
    PickupPotion: 8,
    PickupMana: 9,
    MonFainted: 10,
    ManaDropped: 11,
    SupermanaBackToBase: 12,
    BombAttack: 13,
    MonAwake: 14,
    BombExplosion: 15,
    NextTurn: 16,
    GameOver: 17,
    Takeback: 18,
    UsePotion: 19,
  },
  GameVariant: {
    Classic: 0,
    SwappedManaRows: 1,
    OffsetArcManaRows: 2,
    CenterSpokeManaRows: 3,
    AlternatingManaRows: 4,
    InnerWedgeManaRows: 5,
    OuterWedgeManaRows: 6,
    BentCenterManaRows: 7,
    OuterEdgeManaRows: 8,
    SplitFlankManaRows: 9,
    ForwardBridgeManaRows: 10,
    CornerChainManaRows: 11,
  },
  ItemModelKind: {
    Mon: 0,
    Mana: 1,
    MonWithMana: 2,
    MonWithConsumable: 3,
    Consumable: 4,
  },
  ManaKind: { Regular: 0, Supermana: 1 },
  Modifier: { SelectPotion: 0, SelectBomb: 1, Cancel: 2 },
  MonKind: { Demon: 0, Drainer: 1, Angel: 2, Spirit: 3, Mystic: 4 },
  NextInputKind: {
    MonMove: 0,
    ManaMove: 1,
    MysticAction: 2,
    DemonAction: 3,
    DemonAdditionalStep: 4,
    SpiritTargetCapture: 5,
    SpiritTargetMove: 6,
    SelectConsumable: 7,
    BombAttack: 8,
  },
  OutputModelKind: {
    InvalidInput: 0,
    LocationsToStartFrom: 1,
    NextInputOptions: 2,
    Events: 3,
  },
  SquareModelKind: {
    Regular: 0,
    ConsumableBase: 1,
    SupermanaBase: 2,
    ManaBase: 3,
    ManaPool: 4,
    MonBase: 5,
  },
} as const;

const EXPECTED_CLASSES = {
  EventModel: [
    0,
    {},
    {
      free: 0,
      kind: null,
      item: null,
      mon: null,
      mana: null,
      loc1: null,
      loc2: null,
      color: null,
    },
  ],
  ItemModel: [
    0,
    {},
    { free: 0, kind: null, mon: null, mana: null, consumable: null },
  ],
  Location: [2, {}, { free: 0, i: null, j: null }],
  ManaModel: [0, {}, { free: 0, kind: null, color: null }],
  Mon: [
    0,
    { new: 3 },
    {
      free: 0,
      kind: null,
      color: null,
      cooldown: null,
      is_fainted: 0,
      decrease_cooldown: 0,
      faint: 0,
    },
  ],
  MonsGameModel: [
    0,
    { newForSimulation: 1, fromFenForSimulation: 1, new: 1, from_fen: 1 },
    {
      free: 0,
      black_score: 0,
      remove_item: 1,
      turn_number: 0,
      white_score: 0,
      active_color: 0,
      can_takeback: 1,
      verify_moves: 2,
      winner_color: 0,
      is_later_than: 1,
      process_input: 2,
      takeback_fens: 0,
      clearTracking: 0,
      smartAutomove: 1,
      is_moves_verified: 0,
      process_input_fen: 1,
      without_last_turn: 1,
      available_move_kinds: 0,
      setVerboseTracking: 1,
      locations_with_content: 0,
      verbose_tracking_entities: 0,
      inactive_player_items_counters: 0,
      fen: 0,
      item: 1,
      square: 1,
      automove: 0,
      takeback: 0,
    },
  ],
  NextInputModel: [
    0,
    {},
    {
      free: 0,
      location: null,
      modifier: null,
      kind: null,
      actor_mon_item: null,
    },
  ],
  OutputModel: [
    0,
    {},
    {
      free: 0,
      next_inputs: 0,
      events: 0,
      input_fen: 0,
      locations: 0,
      kind: null,
    },
  ],
  SquareModel: [0, {}, { free: 0, kind: null, color: null, mon_kind: null }],
  VerboseTrackingEntityModel: [
    0,
    {},
    { free: 0, events_fen: 0, fen: 0, color: 0, events: 0 },
  ],
} as const;

function namedEnum(value: object): Readonly<Record<string, number>> {
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  );
}

function memberArities(owner: object): Readonly<Record<string, number | null>> {
  return Object.fromEntries(
    Object.getOwnPropertyNames(owner).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(owner, key);
      if (descriptor === undefined) throw new Error(`missing ${key}`);
      return [
        key,
        "value" in descriptor && typeof descriptor.value === "function"
          ? descriptor.value.length
          : null,
      ];
    }),
  );
}

describe("public API", () => {
  it("exposes exactly the supported names and enum values", () => {
    expect(Object.keys(api).sort()).toEqual(EXPECTED_EXPORTS);
    for (const [name, expected] of Object.entries(EXPECTED_ENUMS)) {
      expect(namedEnum(api[name as keyof typeof api] as object), name).toEqual(
        expected,
      );
    }
  });

  it("keeps class names, member order, and function arities", () => {
    for (const [
      name,
      [length, staticMembers, prototypeMembers],
    ] of Object.entries(EXPECTED_CLASSES)) {
      const constructor = api[name as keyof typeof api] as unknown as {
        readonly length: number;
        readonly name: string;
        readonly prototype: object;
      };
      expect(constructor.name, name).toBe(name);
      expect(constructor.length, name).toBe(length);
      expect(
        Object.fromEntries(
          Object.entries(memberArities(constructor)).filter(
            ([key]) => !["length", "name", "prototype"].includes(key),
          ),
        ),
        `${name} static members`,
      ).toEqual(staticMembers);
      expect(
        Object.fromEntries(
          Object.entries(memberArities(constructor.prototype)).filter(
            ([key]) => key !== "constructor",
          ),
        ),
        `${name} prototype members`,
      ).toEqual(prototypeMembers);
    }
  });

  it("keeps winner identity and a basic game flow", () => {
    expect(api.winner.name).toBe("winner");
    expect(api.winner.length).toBe(4);

    const game = api.MonsGameModel.new(api.GameVariant.Classic);
    const initialFen = game.fen();
    const starts = game.process_input([]);
    expect(starts.kind).toBe(api.OutputModelKind.LocationsToStartFrom);
    expect(starts.locations().map(({ i, j }) => [i, j])).toEqual([
      [10, 3],
      [10, 4],
      [10, 5],
      [10, 6],
      [10, 7],
    ]);

    const moved = game.process_input_fen("l10,3;l9,2");
    expect(moved.kind).toBe(api.OutputModelKind.Events);
    expect(moved.input_fen()).toBe("l10,3;l9,2");
    expect(moved.events()[0]?.kind).toBe(api.EventModelKind.MonMove);
    expect(game.fen()).not.toBe(initialFen);
    game.free();
    expect(game.fen()).not.toBe(initialFen);
  });
});
