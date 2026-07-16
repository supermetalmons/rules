import { afterEach, describe, expect, it } from "vitest";

import {
  Color,
  Modifier,
  MonKind,
  NextInputKind,
} from "../../src/engine/domain.js";
import { GameVariant } from "../../src/engine/config.js";
import {
  MonsGameModel,
  setMonsGameAutomoveDelegate,
} from "../../src/api/mons-game-model.js";
import {
  EventModelKind,
  ItemModelKind,
  Location,
  ManaKind,
  OutputModelKind,
  SquareModelKind,
} from "../../src/api/models.js";

const CLASSIC_FEN =
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";

const TAKEBACK_FEN =
  "0 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n11/n03D0xn07/n11/n11/n11/n11/n11";

function coordinates(locations: readonly Location[]): readonly number[][] {
  return locations.map(({ i, j }) => [i, j]);
}

afterEach(() => {
  setMonsGameAutomoveDelegate(undefined);
});

describe("MonsGameModel factories and state access", () => {
  it("retains the legacy class method surface and ordering", () => {
    expect(
      Object.getOwnPropertyNames(MonsGameModel).filter(
        (key) => !["length", "name", "prototype"].includes(key),
      ),
    ).toEqual(["newForSimulation", "fromFenForSimulation", "new", "from_fen"]);
    expect(
      Object.getOwnPropertyNames(MonsGameModel.prototype).filter(
        (key) => key !== "constructor",
      ),
    ).toEqual([
      "free",
      "black_score",
      "remove_item",
      "turn_number",
      "white_score",
      "active_color",
      "can_takeback",
      "verify_moves",
      "winner_color",
      "is_later_than",
      "process_input",
      "takeback_fens",
      "clearTracking",
      "smartAutomove",
      "is_moves_verified",
      "process_input_fen",
      "without_last_turn",
      "available_move_kinds",
      "setVerboseTracking",
      "locations_with_content",
      "verbose_tracking_entities",
      "inactive_player_items_counters",
      "fen",
      "item",
      "square",
      "automove",
      "takeback",
    ]);
    expect(MonsGameModel.length).toBe(0);
    expect(MonsGameModel.prototype.process_input.length).toBe(2);
  });

  it("constructs, parses, and normalizes the stable FEN contract", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    expect(game.fen()).toBe(CLASSIC_FEN);
    expect(game.active_color()).toBe(Color.White);
    expect(game.turn_number()).toBe(1);
    expect(game.white_score()).toBe(0);
    expect(game.black_score()).toBe(0);
    expect(game.winner_color()).toBeUndefined();
    expect(game.is_moves_verified()).toBe(true);

    const parsed = MonsGameModel.from_fen(` \n ${CLASSIC_FEN} 0 \t`);
    expect(parsed?.fen()).toBe(CLASSIC_FEN);
    expect(parsed?.is_moves_verified()).toBe(false);
    expect(MonsGameModel.from_fen("bad")).toBeUndefined();

    const nelFen = CLASSIC_FEN.replaceAll(" ", "\u0085");
    const bomFen = CLASSIC_FEN.replaceAll(" ", "\ufeff");
    expect(MonsGameModel.from_fen(nelFen)?.fen()).toBe(CLASSIC_FEN);
    expect(MonsGameModel.fromFenForSimulation(nelFen)?.fen()).toBe(CLASSIC_FEN);
    expect(MonsGameModel.from_fen(bomFen)).toBeUndefined();
    expect(MonsGameModel.fromFenForSimulation(bomFen)).toBeUndefined();

    const simulation = MonsGameModel.newForSimulation(GameVariant.Classic);
    expect(simulation.fen()).toBe(CLASSIC_FEN);
    expect(simulation.can_takeback(Color.White)).toBe(false);
    expect(MonsGameModel.fromFenForSimulation(CLASSIC_FEN)?.fen()).toBe(
      CLASSIC_FEN,
    );
  });

  it("uses Wasm i32 coercion and rejects invalid enum discriminants", () => {
    expect(
      MonsGameModel.new(1.9 as GameVariant)
        .fen()
        .endsWith(" 1"),
    ).toBe(true);
    expect(
      MonsGameModel.new(4_294_967_297 as GameVariant)
        .fen()
        .endsWith(" 1"),
    ).toBe(true);
    expect(MonsGameModel.new(Number.NaN).fen()).toBe(CLASSIC_FEN);
    expect(() => MonsGameModel.new(-1 as GameVariant)).toThrow(
      "invalid enum value passed",
    );
    expect(() => MonsGameModel.new(12 as GameVariant)).toThrow(
      "invalid enum value passed",
    );
    expect(() =>
      MonsGameModel.new(GameVariant.Classic).can_takeback(-1 as Color),
    ).toThrow("invalid enum value passed");
  });

  it("returns fresh item and square value wrappers", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    const first = game.item(new Location(10, 3));
    const second = game.item(new Location(10, 3));
    expect(first).not.toBe(second);
    expect(first?.kind).toBe(ItemModelKind.Mon);
    expect(first?.mon?.kind).toBe(MonKind.Demon);
    expect(first?.mon?.color).toBe(Color.White);
    if (first?.mon !== undefined) {
      first.mon.cooldown = 9;
    }
    expect(game.item(new Location(10, 3))?.mon?.cooldown).toBe(0);

    const supermana = game.item(new Location(5, 5));
    expect(supermana?.kind).toBe(ItemModelKind.Mana);
    expect(supermana?.mana?.kind).toBe(ManaKind.Supermana);
    expect(supermana?.mana?.color).toBe(Color.White);

    const monBase = game.square(new Location(10, 3));
    expect(monBase.kind).toBe(SquareModelKind.MonBase);
    expect(monBase.color).toBe(Color.White);
    expect(monBase.mon_kind).toBe(MonKind.Demon);
    expect(game.square(new Location(-1, 99)).kind).toBe(
      SquareModelKind.Regular,
    );
  });

  it("removes content while retaining every mon base in content locations", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    expect(game.locations_with_content()).toHaveLength(23);
    game.remove_item(new Location(10, 3));
    expect(game.item(new Location(10, 3))).toBeUndefined();
    expect(coordinates(game.locations_with_content())).toContainEqual([10, 3]);

    game.remove_item(new Location(3, 4));
    expect(coordinates(game.locations_with_content())).not.toContainEqual([
      3, 4,
    ]);
  });

  it("returns fresh Int32Array counters in the legacy order", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    const first = game.available_move_kinds();
    expect(first).toBeInstanceOf(Int32Array);
    expect([...first]).toEqual([5, 0, 0, 0]);
    first[0] = 99;
    expect([...game.available_move_kinds()]).toEqual([5, 0, 0, 0]);

    const fields = CLASSIC_FEN.split(" ");
    fields[6] = "3";
    fields[7] = "4";
    fields[8] = "2";
    const later = MonsGameModel.from_fen(fields.join(" "));
    expect(later).toBeDefined();
    expect([...(later?.available_move_kinds() ?? [])]).toEqual([5, 1, 1, 3]);
    expect([...(later?.inactive_player_items_counters() ?? [])]).toEqual([
      0, 0, 0, 4,
    ]);
  });

  it("free is an idempotent no-op", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    game.free();
    game.free();
    expect(game.fen()).toBe(CLASSIC_FEN);
  });

  it("shares game state through transparent proxies", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    const proxy = new Proxy(game, {});

    expect(proxy.fen()).toBe(CLASSIC_FEN);
    proxy.remove_item(new Location(10, 3));
    expect(game.item(new Location(10, 3))).toBeUndefined();

    game.remove_item(new Location(10, 4));
    expect(proxy.item(new Location(10, 4))).toBeUndefined();
    expect(proxy.fen()).toBe(game.fen());

    const stateKey = Object.getOwnPropertySymbols(game)[0];
    expect(stateKey).toBeDefined();
    if (stateKey === undefined) throw new Error("missing model state key");
    const accessor = Reflect.get(game, stateKey);
    expect(accessor).toBeTypeOf("function");
    expect((accessor as () => unknown)()).toBeUndefined();
    expect((accessor as (token: symbol) => unknown)(Symbol())).toBeUndefined();

    let interceptedSymbolReads = 0;
    const interceptingProxy = new Proxy(game, {
      get(target, property, receiver) {
        if (typeof property === "symbol") interceptedSymbolReads += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(interceptingProxy.fen()).toBe(game.fen());
    expect(interceptedSymbolReads).toBe(0);

    const frozenGame = Object.freeze(new MonsGameModel());
    const frozenProxy = new Proxy(frozenGame, {});
    frozenProxy.remove_item(new Location(10, 3));
    expect(frozenGame.item(new Location(10, 3))).toBeUndefined();
    frozenGame.remove_item(new Location(10, 4));
    expect(frozenProxy.item(new Location(10, 4))).toBeUndefined();
  });
});

describe("MonsGameModel input routing and history", () => {
  it("preserves prompt ordering and canonical process_input echoes", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    const starts = game.process_input([]);
    expect(starts.kind).toBe(OutputModelKind.LocationsToStartFrom);
    expect(starts.input_fen()).toBe("");
    expect(coordinates(starts.locations())).toEqual([
      [10, 3],
      [10, 4],
      [10, 5],
      [10, 6],
      [10, 7],
    ]);

    const prompt = game.process_input([new Location(10.9, 3.9)]);
    expect(prompt.kind).toBe(OutputModelKind.NextInputOptions);
    expect(prompt.input_fen()).toBe("l10,3");
    expect(
      prompt.next_inputs().map((next) => ({
        kind: next.kind,
        location:
          next.location === undefined
            ? undefined
            : [next.location.i, next.location.j],
        modifier: next.modifier,
      })),
    ).toEqual([
      { kind: NextInputKind.MonMove, location: [9, 2], modifier: undefined },
      { kind: NextInputKind.MonMove, location: [9, 3], modifier: undefined },
      { kind: NextInputKind.MonMove, location: [9, 4], modifier: undefined },
      { kind: NextInputKind.MonMove, location: [10, 2], modifier: undefined },
    ]);
    expect(game.fen()).toBe(CLASSIC_FEN);
  });

  it("echoes raw process_input_fen while filtering malformed segments", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    const output = game.process_input_fen(";l10,3;bad;;l9,2;");
    expect(output.kind).toBe(OutputModelKind.Events);
    expect(output.input_fen()).toBe(";l10,3;bad;;l9,2;");
    expect(output.events()).toHaveLength(1);
    expect(output.events()[0]?.kind).toBe(EventModelKind.MonMove);
    expect(game.fen()).not.toBe(CLASSIC_FEN);

    const garbageGame = MonsGameModel.new(GameVariant.Classic);
    const garbage = garbageGame.process_input_fen("garbage");
    expect(garbage.kind).toBe(OutputModelKind.LocationsToStartFrom);
    expect(garbage.input_fen()).toBe("garbage");
    expect(garbageGame.fen()).toBe(CLASSIC_FEN);

    const normalized = garbageGame.process_input_fen("z\ud800");
    expect(normalized.input_fen()).toBe("z\ufffd");

    const trailingLineFeedGame = MonsGameModel.new(GameVariant.Classic);
    const trailingLineFeed =
      trailingLineFeedGame.process_input_fen("l10,3;l9,2\n");
    expect(trailingLineFeed.kind).toBe(OutputModelKind.NextInputOptions);
    expect(trailingLineFeed.input_fen()).toBe("l10,3;l9,2\n");
    expect(trailingLineFeedGame.fen()).toBe(CLASSIC_FEN);
  });

  it("matches optional modifier coercion", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    expect(game.process_input([], undefined).kind).toBe(
      OutputModelKind.LocationsToStartFrom,
    );
    expect(
      game.process_input([], null as unknown as Modifier).input_fen(),
    ).toBe("");
    expect(game.process_input([], 3 as Modifier).input_fen()).toBe("");
    expect(game.process_input([], 4_294_967_299 as Modifier).input_fen()).toBe(
      "",
    );
    expect(game.process_input([], Number.NaN).input_fen()).toBe("mp");
    expect(() => game.process_input([], -1 as Modifier)).toThrow(
      "invalid enum value passed",
    );
    expect(() => game.process_input([], 4 as Modifier)).toThrow(
      "invalid enum value passed",
    );
  });

  it("tracks, restores, and takes back an applied move", () => {
    const game = MonsGameModel.from_fen(TAKEBACK_FEN);
    expect(game).toBeDefined();
    if (game === undefined) {
      return;
    }
    const move = game.process_input_fen("l5,3;l5,4");
    expect(move.kind).toBe(OutputModelKind.Events);
    expect(game.takeback_fens()).toHaveLength(2);
    expect(game.can_takeback(Color.White)).toBe(true);

    const tracking = game.verbose_tracking_entities();
    expect(tracking).toHaveLength(2);
    expect(tracking[0]?.fen()).toBe(TAKEBACK_FEN);
    expect(tracking[1]?.events_fen()).toBe("mm D0x 5,3 5,4");
    expect(game.verbose_tracking_entities()[0]).not.toBe(tracking[0]);

    const restored = game.without_last_turn(["external-history\ud800"]);
    expect(restored?.fen()).toBe(TAKEBACK_FEN);
    expect(restored?.takeback_fens()).toEqual(["external-history\ufffd"]);

    const takeback = game.takeback();
    expect(takeback.kind).toBe(OutputModelKind.Events);
    expect(takeback.input_fen()).toBe("z");
    expect(takeback.events()[0]?.kind).toBe(EventModelKind.Takeback);
    expect(game.fen()).toBe(TAKEBACK_FEN);
    expect(game.takeback_fens()).toEqual([TAKEBACK_FEN]);
  });

  it("clears tracking without changing game state", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    game.process_input_fen("l10,3;l9,2");
    const before = game.fen();
    expect(game.verbose_tracking_entities()).toHaveLength(2);
    game.clearTracking();
    expect(game.verbose_tracking_entities()).toEqual([]);
    expect(game.fen()).toBe(before);
  });
});

describe("MonsGameModel verification and comparisons", () => {
  it("verifies replayed moves and leaves state unchanged on failure", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    expect(game.verify_moves("", "")).toBe(true);
    game.process_input_fen("l10,3;l9,2");
    expect(game.verify_moves("l10,3;l9,2", "")).toBe(true);
    const before = game.fen();
    expect(game.verify_moves("l10,4;l9,3", "")).toBe(false);
    expect(game.fen()).toBe(before);
    expect(game.is_moves_verified()).toBe(true);
  });

  it("preserves is_later_than invalid, turn, and variant behavior", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    expect(game.is_later_than("invalid")).toBe(true);
    expect(game.is_later_than(CLASSIC_FEN)).toBe(false);
    expect(game.is_later_than(CLASSIC_FEN.replaceAll(" ", "\u0085"))).toBe(
      false,
    );
    expect(game.is_later_than(CLASSIC_FEN.replace(" 1 n03", " 0 n03"))).toBe(
      true,
    );
    expect(
      game.is_later_than(MonsGameModel.new(GameVariant.SwappedManaRows).fen()),
    ).toBe(false);
  });
});

describe("MonsGameModel automove delegation", () => {
  it("delegates random mutation and isolates smart simulation", () => {
    setMonsGameAutomoveDelegate({
      automove(game) {
        const inputs = [
          { kind: "location", location: { i: 10, j: 3 } },
          { kind: "location", location: { i: 9, j: 2 } },
        ] as const;
        return {
          output: game.processInput(inputs, false, false),
          inputFen: "l10,3;l9,2",
        };
      },
      smartAutomove(game, preference) {
        game.board.removeItem({ i: 10, j: 3 });
        return { output: { kind: "invalid-input" }, inputFen: preference };
      },
    });

    const randomGame = MonsGameModel.new(GameVariant.Classic);
    expect(randomGame.automove().input_fen()).toBe("l10,3;l9,2");
    expect(randomGame.fen()).not.toBe(CLASSIC_FEN);

    const smartGame = MonsGameModel.new(GameVariant.Classic);
    expect(smartGame.smartAutomove("  FaSt ").input_fen()).toBe("fast");
    expect(smartGame.smartAutomove("\u0085FaSt\u0085").input_fen()).toBe(
      "fast",
    );
    expect(smartGame.fen()).toBe(CLASSIC_FEN);
  });

  it("throws the exact primitive string for invalid smart preferences", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    let thrown: unknown;
    try {
      game.smartAutomove("turbo");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(
      "invalid smart automove mode; expected 'fast', 'normal', or 'pro'",
    );

    thrown = undefined;
    try {
      game.smartAutomove("\ufefffast\ufeff");
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(
      "invalid smart automove mode; expected 'fast', 'normal', or 'pro'",
    );
  });
});
