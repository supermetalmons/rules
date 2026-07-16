import { describe, expect, it } from "vitest";

import { GameVariant } from "../../src/engine/config.js";
import {
  Color,
  Consumable,
  Modifier,
  MonKind,
  createMon,
  manaItem,
  monItem,
  monWithConsumableItem,
  regularMana,
  type Input,
  type Item,
  type Output,
} from "../../src/engine/domain.js";
import {
  inputArrayFen,
  outputFen,
  parseInputArrayFen,
} from "../../src/engine/fen.js";
import {
  DEFAULT_SUGGESTED_START_INPUT_OPTIONS,
  MonsGame,
} from "../../src/engine/game.js";
import { location, type Location } from "../../src/engine/geometry.js";

function replaceItems(
  game: MonsGame,
  items: readonly (readonly [Location, Item])[],
): void {
  game.replaceBoardItems(items);
}

function firstChainFromState(game: MonsGame): Input[] | undefined {
  const starts = game.cloneForSimulation().processInput([], true, false);
  if (starts.kind !== "locations-to-start-from") {
    return undefined;
  }
  const start = starts.locations[0];
  if (start === undefined) {
    return undefined;
  }
  const prefix: Input[] = [{ kind: "location", location: start }];
  const secondOutput = game
    .cloneForSimulation()
    .processInput(prefix, true, false);
  if (secondOutput.kind !== "next-input-options") {
    return undefined;
  }
  const second = secondOutput.nextInputs[0]?.input;
  if (second === undefined) {
    return undefined;
  }
  const pair = [...prefix, second];
  const result = game.cloneForSimulation().processInput(pair, true, false);
  if (result.kind === "events") {
    return pair;
  }
  if (result.kind !== "next-input-options") {
    return undefined;
  }
  const third = result.nextInputs[0]?.input;
  return third === undefined ? undefined : [...pair, third];
}

function potionActionOnlyTurnGame(): MonsGame {
  const game = new MonsGame(false, GameVariant.Classic);
  replaceItems(game, [
    [location(9, 6), monItem(createMon(MonKind.Spirit, Color.White, 0))],
    [location(7, 6), manaItem(regularMana(Color.White))],
    [location(6, 5), manaItem(regularMana(Color.White))],
    [location(0, 5), monItem(createMon(MonKind.Drainer, Color.Black, 0))],
  ]);
  game.actionsUsedCount = 1;
  game.monsMovesCount = 5;
  game.whitePotionsCount = 1;
  game.turnNumber = 2;
  return game;
}

describe("MonsGame focused Rust parity", () => {
  it("keeps default player-facing potion prompt priority", () => {
    const game = potionActionOnlyTurnGame();
    const output = game.processInput([], true, false);
    expect(output.kind).toBe("locations-to-start-from");
    if (output.kind !== "locations-to-start-from") {
      return;
    }
    expect(output.locations.length).toBeGreaterThan(0);
    expect(
      output.locations.some((at) => {
        const item = game.board.item(at);
        return (
          item !== undefined &&
          item.kind !== "mana" &&
          item.kind !== "consumable"
        );
      }),
    ).toBe(true);
    expect(
      output.locations.every((at) => game.board.item(at)?.kind !== "mana"),
    ).toBe(true);
  });

  it("keeps regular and explicit default start options identical", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const regular = game.cloneForSimulation().processInput([], true, false);
    const explicit = game
      .cloneForSimulation()
      .processInputWithStartOptions(
        [],
        true,
        false,
        DEFAULT_SUGGESTED_START_INPUT_OPTIONS,
      );
    expect(explicit).toEqual(regular);
  });

  it("returns the same values from warm and cold caches", () => {
    const source = new MonsGame(false, GameVariant.Classic);
    const chain = firstChainFromState(source);
    expect(chain).toBeDefined();
    const queries: Input[][] = [[]];
    const prefix: Input[] = [];
    for (const input of chain ?? []) {
      prefix.push(input);
      queries.push([...prefix]);
    }
    const warm = source.cloneForSimulation();
    const cold = source.cloneForSimulation();
    for (const query of queries) {
      const warmOutput = warm.processInput(query, true, false);
      cold.invalidateProcessInputCache();
      const coldOutput = cold.processInput(query, true, false);
      expect(warmOutput).toEqual(coldOutput);
      expect(warm.fen()).toBe(cold.fen());
    }
  });

  it("removes an exploding bomb carrier and faints the target in event order", () => {
    const mysticLocation = location(4, 4);
    const targetLocation = location(6, 6);
    const mystic = createMon(MonKind.Mystic, Color.White, 0);
    const target = createMon(MonKind.Demon, Color.Black, 0);
    const game = new MonsGame(false, GameVariant.Classic);
    replaceItems(game, [
      [mysticLocation, monItem(mystic)],
      [targetLocation, monWithConsumableItem(target, Consumable.Bomb)],
    ]);
    game.turnNumber = 2;

    const output = game.processInput(
      [
        { kind: "location", location: mysticLocation },
        { kind: "location", location: targetLocation },
      ],
      false,
      false,
    );
    expect(output.kind).toBe("events");
    if (output.kind !== "events") {
      return;
    }
    expect(output.events.map((event) => event.kind)).toEqual([
      "mystic-action",
      "mon-fainted",
      "bomb-explosion",
    ]);
    expect(game.board.item(targetLocation)).toBeUndefined();
    expect(game.board.item(mysticLocation)).toEqual(monItem(mystic));
    expect(game.board.item(game.board.base(target))).toEqual(
      monItem(createMon(MonKind.Demon, Color.Black, 2)),
    );
    expect(game.actionsUsedCount).toBe(1);
  });

  it("does not mutate wrapped board aliases for invalid scoring locations", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const aliasedLocation = location(0, 3);
    const aliasedItem = game.board.item(aliasedLocation);
    expect(aliasedItem).toBeDefined();

    game.applyAndAddResultingEvents([
      {
        kind: "mana-scored",
        mana: regularMana(Color.White),
        at: location(-1, 14),
      },
    ]);

    expect(game.whiteScore).toBe(1);
    expect(game.board.item(aliasedLocation)).toEqual(aliasedItem);
  });

  it("restores the previous value state on takeback", () => {
    const source = location(5, 3);
    const destination = location(5, 4);
    const mon = createMon(MonKind.Drainer, Color.White, 0);
    const game = new MonsGame(false, GameVariant.Classic);
    replaceItems(game, [[source, monItem(mon)]]);
    game.turnNumber = 2;
    const before = game.fen();

    expect(
      game.processInput(
        [
          { kind: "location", location: source },
          { kind: "location", location: destination },
        ],
        false,
        false,
      ).kind,
    ).toBe("events");
    expect(game.fen()).not.toBe(before);
    expect(game.takebackFens).toHaveLength(2);
    expect(game.processInput([{ kind: "takeback" }], false, false)).toEqual({
      kind: "events",
      events: [{ kind: "takeback" }],
    });
    expect(game.fen()).toBe(before);
    expect(game.board.item(source)).toEqual(monItem(mon));
    expect(game.board.item(destination)).toBeUndefined();
    expect(game.takebackFens).toEqual([before]);
  });

  it("rejects Cancel without mutating state or tracking", () => {
    const source = location(5, 3);
    const destination = location(5, 4);
    const mon = createMon(MonKind.Drainer, Color.White, 0);
    const game = new MonsGame(false, GameVariant.Classic);
    replaceItems(game, [
      [source, monItem(mon)],
      [
        destination,
        { kind: "consumable", consumable: Consumable.BombOrPotion },
      ],
    ]);
    game.turnNumber = 2;
    const before = game.fen();
    const pair: Input[] = [
      { kind: "location", location: source },
      { kind: "location", location: destination },
    ];
    const prompt = game.processInput(pair, false, false);
    expect(prompt.kind).toBe("next-input-options");
    if (prompt.kind === "next-input-options") {
      expect(prompt.nextInputs.map((option) => option.input)).toEqual([
        { kind: "modifier", modifier: Modifier.SelectBomb },
        { kind: "modifier", modifier: Modifier.SelectPotion },
      ]);
    }
    expect(game.fen()).toBe(before);
    expect(
      game.processInput(
        [...pair, { kind: "modifier", modifier: Modifier.Cancel }],
        false,
        false,
      ),
    ).toEqual({ kind: "invalid-input" });
    expect(game.fen()).toBe(before);
    expect(game.takebackFens).toEqual([]);
  });

  it("rejects cross-variant later-than comparisons", () => {
    const classic = new MonsGame(false, GameVariant.Classic);
    classic.turnNumber = 3;
    classic.actionsUsedCount = 1;
    const swapped = new MonsGame(false, GameVariant.SwappedManaRows);
    expect(classic.isLaterThan(swapped)).toBe(false);
    expect(swapped.isLaterThan(classic)).toBe(false);
  });

  it("does not mutate prompts, invalid inputs, or dry-run events", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const before = game.fen();
    expect(game.processInput([], false, false).kind).toBe(
      "locations-to-start-from",
    );
    expect(game.fen()).toBe(before);
    expect(
      game.processInput(
        [{ kind: "modifier", modifier: Modifier.Cancel }],
        false,
        false,
      ),
    ).toEqual({
      kind: "invalid-input",
    });
    expect(game.fen()).toBe(before);
    const chain = firstChainFromState(game);
    expect(chain).toBeDefined();
    const output = game.processInput(chain ?? [], true, false);
    expect(output.kind).toBe("events");
    expect(game.fen()).toBe(before);
  });

  it("matches the captured permissive turn-zero prompt", () => {
    const fen =
      "0 0 w 0 0 0 0 0 0 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";
    const game = MonsGame.fromFen(fen);
    expect(game).toBeDefined();
    if (game === undefined) {
      return;
    }
    const output = game.processInput([], false, false);
    expect(output).toEqual({
      kind: "locations-to-start-from",
      locations: [
        location(10, 3),
        location(10, 4),
        location(10, 5),
        location(10, 6),
        location(10, 7),
      ],
    });
    expect(game.fen()).toBe(fen);
  });

  it("keeps every variant identity through prompting, cloning, and FEN", () => {
    for (
      let variant = GameVariant.Classic;
      variant <= GameVariant.CornerChainManaRows;
      variant += 1
    ) {
      const game = new MonsGame(false, variant);
      const before = game.fen();
      expect(game.processInput([], false, false).kind).toBe(
        "locations-to-start-from",
      );
      expect(game.fen()).toBe(before);
      expect(game.clone().variant()).toBe(variant);
      expect(MonsGame.fromFen(before)?.variant()).toBe(variant);
    }
  });

  it("tracks applied event order and removes the reverted tracking record", () => {
    const source = location(5, 3);
    const destination = location(5, 4);
    const game = new MonsGame(true, GameVariant.Classic);
    replaceItems(game, [
      [source, monItem(createMon(MonKind.Drainer, Color.White, 0))],
    ]);
    game.turnNumber = 2;
    const before = game.fen();
    const output = game.processInput(
      [
        { kind: "location", location: source },
        { kind: "location", location: destination },
      ],
      false,
      false,
    );
    expect(output.kind).toBe("events");
    expect(game.verboseTrackingEntities).toHaveLength(2);
    expect(game.verboseTrackingEntities[0]).toEqual({
      fen: before,
      color: Color.White,
      events: [],
    });
    expect(
      game.verboseTrackingEntities[1]?.events.map((event) => event.kind),
    ).toEqual(["mon-move"]);
    expect(game.processInput([{ kind: "takeback" }], false, false).kind).toBe(
      "events",
    );
    expect(game.verboseTrackingEntities).toHaveLength(1);
    expect(game.fen()).toBe(before);
  });
});

describe("captured Rust transition differentials", () => {
  const fixtures = [
    {
      fenBefore:
        "0 0 b 0 0 0 0 0 10 d0xn03s0xn01a0xn04/y0xn08e0xn01/n05xxmn02xxmn02/n11/n03xxmn01xxmn05/xxQn02xxMn01xxUn04xxQ/n04xxMn01xxMxxmn03/n06xxMn01xxMn02/n04A0xD0xE0xn04/n03S0xn05Y0xn01/n11",
      inputFen: "",
      outputFen: "l0,0/0,4/0,6/1,0/1,9",
      fenAfter:
        "0 0 b 0 0 0 0 0 10 d0xn03s0xn01a0xn04/y0xn08e0xn01/n05xxmn02xxmn02/n11/n03xxmn01xxmn05/xxQn02xxMn01xxUn04xxQ/n04xxMn01xxMxxmn03/n06xxMn01xxMn02/n04A0xD0xE0xn04/n03S0xn05Y0xn01/n11",
    },
    {
      fenBefore:
        "0 0 w 1 0 5 0 0 9 d0xn03s0xn01a0xn04/y0xn08e0xn01/n05xxmn02xxmn02/n11/n03xxmn01xxmn05/xxQn02xxMn01xxUn04xxQ/n04xxMxxMn01xxmn03/n06xxMn01xxMn02/n04A0xD0xE0xn04/n03S0xn05Y0xn01/n11",
      inputFen: "l6,5;l6,6",
      outputFen: "emma M 6,5 6,6/nt b",
      fenAfter:
        "0 0 b 0 0 0 0 0 10 d0xn03s0xn01a0xn04/y0xn08e0xn01/n05xxmn02xxmn02/n11/n03xxmn01xxmn05/xxQn02xxMn01xxUn04xxQ/n04xxMn01xxMxxmn03/n06xxMn01xxMn02/n04A0xD0xE0xn04/n03S0xn05Y0xn01/n11",
    },
    {
      fenBefore:
        "0 0 b 0 0 0 0 0 10 n01a0xn09/n03y0xxxms0xn03e0xn01/n11/n02xxmn03xxmn04/n06xxmxxmn03/xxQn04xxUn02d0xn01xxQ/n03xxMD0Mn03xxMn02/n11/n02E0xn02xxMn01xxMn03/n05S0xY0xn04/n01A0xn09",
      inputFen: "",
      outputFen: "l0,1/1,3/1,5/1,9/5,8",
      fenAfter:
        "0 0 b 0 0 0 0 0 10 n01a0xn09/n03y0xxxms0xn03e0xn01/n11/n02xxmn03xxmn04/n06xxmxxmn03/xxQn04xxUn02d0xn01xxQ/n03xxMD0Mn03xxMn02/n11/n02E0xn02xxMn01xxMn03/n05S0xY0xn04/n01A0xn09",
    },
    {
      fenBefore:
        "0 0 w 1 0 5 0 0 9 n01a0xn09/n03y0xxxms0xn03e0xn01/n11/n02xxmn03xxmn04/n06xxmxxmn03/xxQn04xxUn02d0xn01xxQ/n03xxMD0Mn03xxMn02/n11/n02E0xn02xxMxxMn04/n05S0xY0xn04/n01A0xn09",
      inputFen: "l8,6;l8,7",
      outputFen: "emma M 8,6 8,7/nt b",
      fenAfter:
        "0 0 b 0 0 0 0 0 10 n01a0xn09/n03y0xxxms0xn03e0xn01/n11/n02xxmn03xxmn04/n06xxmxxmn03/xxQn04xxUn02d0xn01xxQ/n03xxMD0Mn03xxMn02/n11/n02E0xn02xxMn01xxMn03/n05S0xY0xn04/n01A0xn09",
    },
  ] as const;

  for (const fixture of fixtures) {
    it(`matches ${fixture.inputFen || "empty prompt"} from ${fixture.fenBefore.slice(0, 18)}`, () => {
      const game = MonsGame.fromFen(fixture.fenBefore);
      expect(game).toBeDefined();
      if (game === undefined) {
        return;
      }
      const inputs = parseInputArrayFen(fixture.inputFen);
      expect(inputArrayFen(inputs)).toBe(fixture.inputFen);
      const output: Output = game.processInput(inputs, false, false);
      expect(outputFen(output)).toBe(fixture.outputFen);
      expect(game.fen()).toBe(fixture.fenAfter);
    });
  }
});
