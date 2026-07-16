import { describe, expect, it } from "vitest";

import {
  EventModel,
  EventModelKind,
  ItemModel,
  ItemModelKind,
  Location,
  ManaModel,
  ManaKind,
  Mon,
  NextInputModel,
  OutputModel,
  OutputModelKind,
  SquareModel,
  SquareModelKind,
  eventModelFrom,
  itemModelFrom,
  manaModelFrom,
  nextInputModelFrom,
  outputModelFrom,
  squareModelFrom,
  verboseTrackingEntityModelFrom,
} from "../../src/api/models.js";
import {
  AvailableMoveKind,
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
  createMon,
  monWithManaItem,
  regularMana,
} from "../../src/engine/domain.js";
import { GameVariant } from "../../src/engine/config.js";

function sampleMana(): ManaModel {
  return manaModelFrom(regularMana(Color.White));
}

function sampleItem(): ItemModel {
  return itemModelFrom({
    kind: "mon",
    mon: createMon(MonKind.Demon, Color.White, 0),
  });
}

function sampleNextInput(): NextInputModel {
  return nextInputModelFrom({
    input: { kind: "location", location: { i: 1, j: 2 } },
    kind: NextInputKind.MonMove,
    actorMonItem: {
      kind: "mon",
      mon: createMon(MonKind.Demon, Color.White, 0),
    },
  });
}

function sampleEvent(): EventModel {
  return eventModelFrom({ kind: "takeback" });
}

function sampleOutput(): OutputModel {
  return outputModelFrom({ kind: "invalid-input" }, "");
}

function sampleSquare(): SquareModel {
  return squareModelFrom({ kind: "regular" });
}

function writable(value: object): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

describe("public value models", () => {
  it("keeps every numeric enum bidirectional and frozen", () => {
    const enums = [
      AvailableMoveKind,
      Color,
      Consumable,
      EventModelKind,
      GameVariant,
      ItemModelKind,
      ManaKind,
      Modifier,
      MonKind,
      NextInputKind,
      OutputModelKind,
      SquareModelKind,
    ];
    for (const value of enums) {
      expect(Object.isFrozen(value)).toBe(true);
      for (const [name, ordinal] of Object.entries(value)) {
        if (typeof ordinal === "number") {
          expect(value[ordinal]).toBe(name);
        }
      }
    }
  });

  it("uses wasm-compatible i32 coercion and idempotent free methods", () => {
    const location = new Location(2 ** 32 + 1.9, Number.NaN);
    expect([location.i, location.j]).toEqual([1, 0]);
    location.i = -1.9;
    expect(location.i).toBe(-1);
    location.free();
    location.free();
    expect(location.i).toBe(-1);

    const mon = Mon.new(MonKind.Demon, Color.White, 3.9);
    expect(mon.cooldown).toBe(3);
    expect(mon.is_fainted()).toBe(true);
    mon.decrease_cooldown();
    mon.faint();
    expect(mon.cooldown).toBe(2);
  });

  it("shares model state through transparent proxies", () => {
    const location = new Location(1, 2);
    const locationProxy = new Proxy(location, {});
    locationProxy.i = 3;
    expect(location.i).toBe(3);
    location.j = 4;
    expect(locationProxy.j).toBe(4);
    expect(Object.keys(location)).toEqual([]);

    const mon = Mon.new(MonKind.Demon, Color.White, 0);
    const monProxy = new Proxy(mon, {});
    monProxy.cooldown = 2;
    expect(mon.cooldown).toBe(2);
    mon.kind = MonKind.Mystic;
    expect(monProxy.kind).toBe(MonKind.Mystic);

    const mana = sampleMana();
    const manaProxy = new Proxy(mana, {});
    manaProxy.kind = ManaKind.Supermana;
    expect(mana.kind).toBe(ManaKind.Supermana);
    mana.color = Color.Black;
    expect(manaProxy.color).toBe(Color.Black);

    const item = sampleItem();
    const itemProxy = new Proxy(item, {});
    itemProxy.kind = ItemModelKind.Consumable;
    expect(item.kind).toBe(ItemModelKind.Consumable);
    item.consumable = Consumable.Bomb;
    expect(itemProxy.consumable).toBe(Consumable.Bomb);

    const next = sampleNextInput();
    const nextProxy = new Proxy(next, {});
    nextProxy.kind = NextInputKind.SelectConsumable;
    expect(next.kind).toBe(NextInputKind.SelectConsumable);
    next.modifier = Modifier.Cancel;
    expect(nextProxy.modifier).toBe(Modifier.Cancel);

    const event = sampleEvent();
    const eventProxy = new Proxy(event, {});
    eventProxy.kind = EventModelKind.NextTurn;
    expect(event.kind).toBe(EventModelKind.NextTurn);
    event.color = Color.Black;
    expect(eventProxy.color).toBe(Color.Black);

    const square = sampleSquare();
    const squareProxy = new Proxy(square, {});
    squareProxy.kind = SquareModelKind.ManaPool;
    expect(square.kind).toBe(SquareModelKind.ManaPool);
    square.color = Color.White;
    expect(squareProxy.color).toBe(Color.White);

    const output = outputModelFrom(
      { kind: "locations-to-start-from", locations: [{ i: 5, j: 6 }] },
      "l5,6",
    );
    const outputProxy = new Proxy(output, {});
    expect(outputProxy.locations()[0]).toEqual(
      expect.objectContaining({ i: 5, j: 6 }),
    );
    outputProxy.kind = OutputModelKind.Events;
    expect(output.kind).toBe(OutputModelKind.Events);
    output.kind = OutputModelKind.NextInputOptions;
    expect(outputProxy.kind).toBe(OutputModelKind.NextInputOptions);

    const tracking = verboseTrackingEntityModelFrom(
      "state-fen",
      Color.Black,
      [],
      "events-fen",
    );
    const trackingProxy = new Proxy(tracking, {});
    expect(trackingProxy.fen()).toBe("state-fen");
    expect(trackingProxy.color()).toBe(Color.Black);
    expect(trackingProxy.events_fen()).toBe("events-fen");

    const frozenMon = Object.freeze(new Mon()) as Mon;
    const frozenMonProxy = new Proxy(frozenMon, {});
    frozenMon.cooldown = 7;
    expect(frozenMonProxy.cooldown).toBe(7);
    frozenMonProxy.kind = MonKind.Demon;
    expect(frozenMon.kind).toBe(MonKind.Demon);
  });

  it("coerces and validates every required DTO enum before assignment", () => {
    const surfaces: readonly (readonly [
      factory: () => object,
      property: string,
      maximum: number,
    ])[] = [
      [() => Mon.new(MonKind.Demon, Color.White, 0), "kind", MonKind.Mystic],
      [() => Mon.new(MonKind.Demon, Color.White, 0), "color", Color.Black],
      [sampleMana, "kind", ManaKind.Supermana],
      [sampleMana, "color", Color.Black],
      [sampleItem, "kind", ItemModelKind.Consumable],
      [sampleNextInput, "kind", NextInputKind.BombAttack],
      [sampleEvent, "kind", EventModelKind.UsePotion],
      [sampleOutput, "kind", OutputModelKind.Events],
      [sampleSquare, "kind", SquareModelKind.MonBase],
    ];
    const coercions: readonly (readonly [input: unknown, expected: number])[] =
      [
        [undefined, 0],
        [null, 0],
        [Number.NaN, 0],
        ["not-a-number", 0],
        [1.9, 1],
        [2 ** 32, 0],
        [2 ** 32 + 1, 1],
      ];

    for (const [factory, property, maximum] of surfaces) {
      for (const [input, expected] of coercions) {
        const model = writable(factory());
        model[property] = input;
        expect(model[property]).toBe(expected);
      }

      const valid = writable(factory());
      valid[property] = maximum;
      expect(valid[property]).toBe(maximum);

      for (const invalid of [-1, maximum + 1]) {
        const model = writable(factory());
        const before = model[property];
        expect(() => {
          model[property] = invalid;
        }).toThrow("invalid enum value passed");
        expect(model[property]).toBe(before);
      }
    }

    expect(() => Mon.new(MonKind.Mystic + 1, Color.White, 0)).toThrow(
      "invalid enum value passed",
    );
    expect(() => Mon.new(MonKind.Demon, Color.Black + 1, 0)).toThrow(
      "invalid enum value passed",
    );
  });

  it("matches wasm optional-enum null and sentinel semantics", () => {
    const surfaces: readonly (readonly [
      factory: () => object,
      property: string,
      maximum: number,
    ])[] = [
      [sampleItem, "consumable", Consumable.BombOrPotion],
      [sampleNextInput, "modifier", Modifier.Cancel],
      [sampleEvent, "color", Color.Black],
      [sampleSquare, "color", Color.Black],
      [sampleSquare, "mon_kind", MonKind.Mystic],
    ];

    for (const [factory, property, maximum] of surfaces) {
      for (const absentValue of [
        undefined,
        null,
        maximum + 1,
        2 ** 32 + maximum + 1,
      ]) {
        const model = writable(factory());
        model[property] = absentValue;
        expect(model[property]).toBeUndefined();
      }

      const model = writable(factory());
      model[property] = maximum;
      expect(() => {
        model[property] = maximum + 2;
      }).toThrow("invalid enum value passed");
      expect(model[property]).toBe(maximum);
    }
  });

  it("keeps nested DTO fields independent and snapshots assignments deeply", () => {
    const supermana = sampleMana();
    supermana.kind = ManaKind.Supermana;
    supermana.color = Color.Black;

    const incoherent = sampleItem();
    incoherent.kind = ItemModelKind.Consumable;
    incoherent.mana = supermana;
    incoherent.consumable = Consumable.Bomb;

    const event = sampleEvent();
    event.item = incoherent;
    const next = sampleNextInput();
    next.actor_mon_item = incoherent;

    supermana.color = Color.White;
    incoherent.kind = ItemModelKind.Mon;
    incoherent.consumable = Consumable.Potion;

    for (const copied of [event.item, next.actor_mon_item]) {
      expect(copied.kind).toBe(ItemModelKind.Consumable);
      expect(copied.mon).toEqual(
        expect.objectContaining({
          kind: MonKind.Demon,
          color: Color.White,
          cooldown: 0,
        }),
      );
      expect(copied.mana).toEqual(
        expect.objectContaining({
          kind: ManaKind.Supermana,
          color: Color.Black,
        }),
      );
      expect(copied.consumable).toBe(Consumable.Bomb);
    }

    const first = event.item;
    const second = event.item;
    expect(first).not.toBe(second);
    const firstMon = first.mon;
    const secondMon = second.mon;
    const firstMana = first.mana;
    const secondMana = second.mana;
    expect(firstMon).not.toBe(secondMon);
    expect(firstMana).not.toBe(secondMana);
    if (firstMon !== undefined) firstMon.cooldown = 9;
    if (firstMana !== undefined) firstMana.color = Color.White;
    const unchanged = event.item;
    expect(unchanged.mon?.cooldown).toBe(0);
    expect(unchanged.mana?.color).toBe(Color.Black);
  });

  it("treats null wrapper options as absent and rejects wrong classes atomically", () => {
    const item = sampleItem();
    item.mana = sampleMana();
    writable(item)["mon"] = null;
    writable(item)["mana"] = null;
    expect(item.mon).toBeUndefined();
    expect(item.mana).toBeUndefined();

    const next = sampleNextInput();
    writable(next)["location"] = null;
    writable(next)["actor_mon_item"] = null;
    expect(next.location).toBeUndefined();
    expect(next.actor_mon_item).toBeUndefined();

    const event = eventModelFrom({
      kind: "mon-move",
      item: {
        kind: "mon-with-mana",
        mon: createMon(MonKind.Demon, Color.White, 0),
        mana: regularMana(Color.White),
      },
      from: { i: 1, j: 2 },
      to: { i: 2, j: 3 },
    });
    event.mon = Mon.new(MonKind.Demon, Color.White, 0);
    event.mana = sampleMana();
    for (const property of ["item", "mon", "mana", "loc1", "loc2"]) {
      writable(event)[property] = null;
      expect(writable(event)[property]).toBeUndefined();
    }

    const retained = Mon.new(MonKind.Spirit, Color.Black, 1);
    item.mon = retained;
    expect(() => {
      writable(item)["mon"] = new Location(1, 2);
    }).toThrow("expected instance of Mon");
    expect(item.mon).toEqual(
      expect.objectContaining({
        kind: MonKind.Spirit,
        color: Color.Black,
        cooldown: 1,
      }),
    );
    expect(() => {
      writable(item)["mana"] = new Location(1, 2);
    }).toThrow("expected instance of ManaModel");
    expect(() => {
      writable(next)["actor_mon_item"] = new Location(1, 2);
    }).toThrow("expected instance of ItemModel");
    expect(() => {
      writable(event)["item"] = new Location(1, 2);
    }).toThrow("expected instance of ItemModel");
  });

  it("returns fresh nested model copies", () => {
    const internal = monWithManaItem(
      createMon(MonKind.Spirit, Color.Black, 0),
      regularMana(Color.White),
    );
    const model = itemModelFrom(internal);
    const first = model.mon;
    const second = model.mon;
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
    if (first === undefined) throw new Error("expected mon");
    first.cooldown = 9;
    expect(model.mon?.cooldown).toBe(0);
    expect(model.mana?.color).toBe(Color.White);
  });

  it("maps event payloads without exposing Spirit's internal actor location", () => {
    const model = eventModelFrom({
      kind: "spirit-target-move",
      item: { kind: "consumable", consumable: Consumable.Bomb },
      from: { i: 2, j: 3 },
      to: { i: 4, j: 5 },
      by: { i: 6, j: 7 },
    });
    expect(model.kind).toBe(EventModelKind.SpiritTargetMove);
    expect(model.loc1).toEqual(expect.objectContaining({ i: 2, j: 3 }));
    expect(model.loc2).toEqual(expect.objectContaining({ i: 4, j: 5 }));
    expect(model.mon).toBeUndefined();
    expect(model.color).toBeUndefined();
  });

  it("returns fresh output arrays and echoes the original input FEN", () => {
    const output = outputModelFrom(
      {
        kind: "locations-to-start-from",
        locations: [
          { i: 1, j: 2 },
          { i: 3, j: 4 },
        ],
      },
      " raw input ",
    );
    expect(output.kind).toBe(OutputModelKind.LocationsToStartFrom);
    expect(output.input_fen()).toBe(" raw input ");
    expect(output.locations()).not.toBe(output.locations());
    const first = output.locations();
    const firstLocation = first[0];
    if (firstLocation === undefined) throw new Error("expected location");
    firstLocation.i = 9;
    expect(output.locations()[0]?.i).toBe(1);
    expect(output.next_inputs()).toEqual([]);
    expect(output.events()).toEqual([]);
  });
});
