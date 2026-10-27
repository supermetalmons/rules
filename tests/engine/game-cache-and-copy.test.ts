import { describe, expect, it, vi } from "vitest";

import { MutableBoard } from "../../src/engine/board/storage.js";
import { GameVariant } from "../../src/engine/board/config.js";
import {
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
  consumableItem,
  createMon,
  inputEquals,
  manaItem,
  monItem,
  monWithManaItem,
  regularMana,
  type Event,
  type Input,
  type Item,
  type NextInput,
  type Output,
} from "../../src/engine/model/domain.js";
import {
  gameFen,
  parseGameFen,
  type GameFenState,
} from "../../src/engine/codec/game-board.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";
import {
  BOARD_CELLS,
  location,
  locationIndex,
  type Location,
} from "../../src/engine/board/geometry.js";
import {
  CACHE_MISS,
  RulesQueryCache,
  type InputStageResult,
} from "../../src/engine/game/query-cache.js";
import { gameWith } from "../helpers/game.js";

function withFenState(
  game: MonsGame,
  replacement: Partial<Omit<GameFenState, "board">>,
): MonsGame {
  const state = parseGameFen(game.fen());
  if (state === undefined) {
    throw new Error("test game must have a parseable FEN");
  }
  const restored = MonsGame.fromFen(gameFen({ ...state, ...replacement }));
  if (restored === undefined) throw new Error("test game FEN must parse");
  return restored.fork();
}

function demonAdditionalStepGame(destinationItem?: Item): {
  readonly game: MonsGame;
  readonly pair: readonly Input[];
  readonly chain: readonly Input[];
} {
  const start = location(5, 3);
  const target = location(5, 5);
  const destination = location(5, 6);
  const demon = createMon(MonKind.Demon, Color.White, 0);
  const defender = createMon(MonKind.Mystic, Color.Black, 0);
  const items: (readonly [Location, Item])[] = [
    [start, monItem(demon)],
    [target, monWithManaItem(defender, regularMana(Color.Black))],
  ];
  if (destinationItem !== undefined) items.push([destination, destinationItem]);
  const game = gameWith(items).fork();

  const pair: readonly Input[] = [
    { kind: "location", location: start },
    { kind: "location", location: target },
  ];
  return {
    game,
    pair,
    chain: [...pair, { kind: "location", location: destination }],
  };
}

function demonConsumableSelectionGame(): {
  readonly game: MonsGame;
  readonly chain: readonly Input[];
} {
  return demonAdditionalStepGame(consumableItem(Consumable.BombOrPotion));
}

function expectSameQueryResult(
  warm: MonsGame,
  coldSource: MonsGame,
  input: readonly Input[],
): Output {
  const warmOutput = warm.processInput(input, true, false);
  const cold = coldSource.fork();
  cold.invalidateProcessInputCache();
  const coldOutput = cold.processInput(input, true, false);
  expect(warmOutput).toEqual(coldOutput);
  expect(warm.fen()).toBe(cold.fen());
  return warmOutput;
}

function mutableNextInputs(output: Output, stage: string): NextInput[] {
  expect(output.kind).toBe("next-input-options");
  if (output.kind !== "next-input-options") {
    throw new Error(`${stage} must produce next-input options`);
  }
  if (output.nextInputs.length === 0) {
    throw new Error(`${stage} must produce at least one next-input option`);
  }
  return output.nextInputs as NextInput[];
}

function mutableEvents(output: Output, stage: string): Event[] {
  expect(output.kind).toBe("events");
  if (output.kind !== "events") {
    throw new Error(`${stage} must produce events`);
  }
  if (output.events.length === 0) {
    throw new Error(`${stage} must produce at least one event`);
  }
  return output.events as Event[];
}

function boardCacheSnapshot(board: MutableBoard): {
  readonly occupiedEntries: unknown;
  readonly categoryDerived: unknown;
} {
  const storage = (
    board as unknown as {
      readonly storage: {
        readonly occupiedEntries: unknown;
        readonly categoryDerived: unknown;
      };
    }
  ).storage;
  return {
    occupiedEntries: storage.occupiedEntries,
    categoryDerived: storage.categoryDerived,
  };
}

describe("RulesQueryCache structural copies", () => {
  it("distinguishes stage misses from cached undefined results", () => {
    const cache = new RulesQueryCache();

    expect(cache.lookupSecondStage("second")).toBe(CACHE_MISS);
    expect(cache.lookupThirdStage("third")).toBe(CACHE_MISS);
    cache.setSecondStage("second", undefined);
    cache.setThirdStage("third", undefined);
    expect(cache.lookupSecondStage("second")).toBeUndefined();
    expect(cache.lookupThirdStage("third")).toBeUndefined();
  });

  it("detaches start suggestions on insertion and lookup", () => {
    const cache = new RulesQueryCache();
    const originalLocation = { i: 4, j: 3 };
    const original: Output = {
      kind: "locations-to-start-from",
      locations: [originalLocation],
    };
    const expected: Output = {
      kind: "locations-to-start-from",
      locations: [{ i: 4, j: 3 }],
    };

    cache.setStartSuggestion(0, original);
    originalLocation.i = 99;
    expect(Reflect.set(original, "locations", [])).toBe(true);

    const firstHit = cache.getStartSuggestion(0);
    expect(firstHit).toEqual(expected);
    if (firstHit?.kind !== "locations-to-start-from") {
      throw new Error("start suggestion must contain locations");
    }
    const firstLocation = firstHit.locations[0];
    if (firstLocation === undefined) {
      throw new Error("start suggestion must contain one location");
    }
    expect(Reflect.set(firstLocation, "j", 99)).toBe(true);
    expect(Reflect.set(firstHit, "locations", [])).toBe(true);

    expect(cache.getStartSuggestion(0)).toEqual(expected);
  });

  it("detaches second-input options while preserving optional actor shape", () => {
    const cache = new RulesQueryCache();
    const originalLocation = { i: 5, j: 3 };
    const mutableActorMon = {
      kind: MonKind.Demon,
      color: Color.White,
      cooldown: 0,
    };
    const withActor: NextInput = {
      kind: NextInputKind.DemonAction,
      input: { kind: "location", location: originalLocation },
      actorMonItem: { kind: "mon", mon: mutableActorMon },
    };
    const withoutActor: NextInput = {
      kind: NextInputKind.SelectConsumable,
      input: { kind: "modifier", modifier: Modifier.SelectBomb },
    };
    const expected: readonly NextInput[] = [
      {
        kind: NextInputKind.DemonAction,
        input: { kind: "location", location: { i: 5, j: 3 } },
        actorMonItem: monItem(createMon(MonKind.Demon, Color.White, 0)),
      },
      {
        kind: NextInputKind.SelectConsumable,
        input: { kind: "modifier", modifier: Modifier.SelectBomb },
      },
    ];

    cache.setSecondInputOptions("second-options", [withActor, withoutActor]);
    originalLocation.i = 99;
    mutableActorMon.cooldown = 2;
    expect(Reflect.set(withActor, "input", { kind: "takeback" })).toBe(true);

    const firstHit = cache.getSecondInputOptions("second-options");
    expect(firstHit).toEqual(expected);
    if (firstHit === undefined) {
      throw new Error("second-input cache must contain options");
    }
    const firstOption = firstHit[0];
    const secondOption = firstHit[1];
    if (firstOption?.input.kind !== "location" || secondOption === undefined) {
      throw new Error("second-input cache must contain the expected options");
    }
    expect(Object.isFrozen(firstOption.actorMonItem)).toBe(true);
    expect(
      firstOption.actorMonItem?.kind === "mon" &&
        Object.isFrozen(firstOption.actorMonItem.mon),
    ).toBe(true);
    expect("actorMonItem" in secondOption).toBe(false);
    expect(Reflect.set(firstOption.input.location, "j", 99)).toBe(true);
    expect(Reflect.set(firstOption, "input", { kind: "takeback" })).toBe(true);
    firstHit.length = 0;

    expect(cache.getSecondInputOptions("second-options")).toEqual(expected);
  });

  it("detaches second- and third-stage events and options in both directions", () => {
    const cache = new RulesQueryCache();
    const originalFrom = { i: 4, j: 4 };
    const originalTo = { i: 5, j: 4 };
    const originalOptionLocation = { i: 6, j: 4 };
    const mutableMana = { kind: "regular", color: Color.White } as const;
    const originalEvent: Event = {
      kind: "mana-move",
      mana: mutableMana,
      from: originalFrom,
      to: originalTo,
    };
    const originalOption: NextInput = {
      kind: NextInputKind.ManaMove,
      input: { kind: "location", location: originalOptionLocation },
    };
    const originalResult: Exclude<InputStageResult, undefined> = [
      [originalEvent],
      [originalOption],
    ];
    const expected: Exclude<InputStageResult, undefined> = [
      [
        {
          kind: "mana-move",
          mana: regularMana(Color.White),
          from: { i: 4, j: 4 },
          to: { i: 5, j: 4 },
        },
      ],
      [
        {
          kind: NextInputKind.ManaMove,
          input: { kind: "location", location: { i: 6, j: 4 } },
        },
      ],
    ];

    cache.setSecondStage("second-stage", originalResult);
    cache.setThirdStage("third-stage", originalResult);
    originalFrom.i = 99;
    originalOptionLocation.i = 99;
    expect(Reflect.set(mutableMana, "color", Color.Black)).toBe(true);
    expect(Reflect.set(originalEvent, "to", { i: 99, j: 99 })).toBe(true);
    expect(Reflect.set(originalOption, "input", { kind: "takeback" })).toBe(true);

    const lookups = [
      (): InputStageResult | typeof CACHE_MISS =>
        cache.lookupSecondStage("second-stage"),
      (): InputStageResult | typeof CACHE_MISS => cache.lookupThirdStage("third-stage"),
    ];
    for (const lookup of lookups) {
      const firstHit = lookup();
      expect(firstHit).toEqual(expected);
      if (firstHit === CACHE_MISS || firstHit === undefined) {
        throw new Error("cached stage must be present");
      }
      const event = firstHit[0][0];
      const option = firstHit[1][0];
      if (event?.kind !== "mana-move" || option?.input.kind !== "location") {
        throw new Error("cached stage must contain the expected values");
      }
      expect(Object.isFrozen(event.mana)).toBe(true);
      expect(Reflect.set(event.from, "i", 99)).toBe(true);
      expect(Reflect.set(event, "to", { i: 99, j: 99 })).toBe(true);
      expect(Reflect.set(option.input.location, "i", 99)).toBe(true);
      expect(Reflect.set(option, "input", { kind: "takeback" })).toBe(true);

      expect(lookup()).toEqual(expected);
    }

    cache.setSecondStage("undefined-second", undefined);
    cache.setThirdStage("undefined-third", undefined);
    expect(cache.lookupSecondStage("undefined-second")).toBeUndefined();
    expect(cache.lookupThirdStage("undefined-third")).toBeUndefined();
  });
});

describe("MonsGame staged-input caches", () => {
  it("keeps one option from each generated second-input kind", () => {
    const { game, pair } = demonAdditionalStepGame();
    const prefix = pair.slice(0, 1);
    const expectedAction: NextInput = {
      input: { kind: "location", location: location(5, 5) },
      kind: NextInputKind.DemonAction,
    };
    const expectedLimited: NextInput[] = [
      {
        input: { kind: "location", location: location(4, 2) },
        kind: NextInputKind.MonMove,
      },
      expectedAction,
    ];

    expect(game.processInput(prefix, true, true)).toEqual({
      kind: "next-input-options",
      nextInputs: expectedLimited,
    });

    const full = mutableNextInputs(
      game.processInput(prefix, true, false),
      "full second-input query",
    );
    expect(full.length).toBeGreaterThan(expectedLimited.length);
    expect(full.filter((option) => option.kind === NextInputKind.DemonAction)).toEqual([
      expectedAction,
    ]);
  });

  it("reuses the complete ordered second-input set for target validation", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const start = { kind: "location", location: location(10, 3) } as const;
    const nextInputs = vi.spyOn(game, "nextInputsFromLocations");
    const angelQueries = vi.spyOn(game.board, "findAwakeAngel");

    const options = game.processInput([start], true, false);
    expect(options.kind).toBe("next-input-options");
    if (options.kind !== "next-input-options") return;
    const target = options.nextInputs[0]?.input;
    expect(target?.kind).toBe("location");
    if (target?.kind !== "location") return;
    const generationCalls = nextInputs.mock.calls.length;

    expect(game.processInput([start, target], true, false).kind).toBe("events");
    expect(nextInputs).toHaveBeenCalledTimes(generationCalls);
    expect(angelQueries).not.toHaveBeenCalled();
  });

  it("returns identical values from warm and cold second- and third-stage caches", () => {
    const { game, pair, chain } = demonAdditionalStepGame();
    const warm = game.fork();

    expectSameQueryResult(warm, game, []);
    expectSameQueryResult(warm, game, pair.slice(0, 1));
    expectSameQueryResult(warm, game, pair);
    expectSameQueryResult(warm, game, chain);

    // Repeat the staged queries so both stage caches serve hits.
    expectSameQueryResult(warm, game, pair);
    expectSameQueryResult(warm, game, chain);
  });

  it("applies a move from warmed stage caches identically to a cold state", () => {
    const { game, pair, chain } = demonAdditionalStepGame();
    const warm = game.fork();
    const cold = game.fork();
    cold.invalidateProcessInputCache();

    warm.processInput([], true, false);
    warm.processInput(pair.slice(0, 1), true, false);
    warm.processInput(pair, true, false);
    mutableEvents(warm.processInput(chain, true, false), "warmed third-stage query");

    const warmOutput = warm.processInput(chain, false, false);
    const coldOutput = cold.processInput(chain, false, false);

    expect(warmOutput).toEqual(coldOutput);
    expect(warm.fen()).toBe(cold.fen());
    expect(warm.fen()).not.toBe(game.fen());

    const restored = MonsGame.fromFen(warm.fen());
    if (restored === undefined) throw new Error("updated game FEN must parse");
    for (const input of [[], pair.slice(0, 1), pair, chain]) {
      expectSameQueryResult(warm, restored, input);
    }
  });

  it("returns independent second- and third-stage result arrays", () => {
    const { game, pair, chain } = demonAdditionalStepGame();
    const warm = game.fork();
    const expectedPair = game.fork().processInput(pair, true, false);
    const expectedChain = game.fork().processInput(chain, true, false);

    const pairOutput = warm.processInput(pair, true, false);
    const pairOptions = mutableNextInputs(pairOutput, "second stage");
    pairOptions.length = 0;
    expect(warm.processInput(pair, true, false)).toEqual(expectedPair);

    const chainOutput = warm.processInput(chain, true, false);
    const chainEvents = mutableEvents(chainOutput, "third stage");
    chainEvents.length = 0;
    expect(warm.processInput(chain, true, false)).toEqual(expectedChain);
  });

  it("returns an independent third-stage option array", () => {
    const { game, chain } = demonConsumableSelectionGame();
    const warm = game.fork();
    const expected = game.fork().processInput(chain, true, false);

    const output = warm.processInput(chain, true, false);
    const options = mutableNextInputs(output, "third-stage consumable");
    options.length = 0;

    expect(warm.processInput(chain, true, false)).toEqual(expected);
  });

  it("does not advertise a consumable choice that would overflow potions", () => {
    const scenario = demonConsumableSelectionGame();
    const game = withFenState(scenario.game, {
      whitePotionsCount: Number.MAX_SAFE_INTEGER,
    });

    const output = game.processInput(scenario.chain, true, false);
    expect(output.kind).toBe("next-input-options");
    if (output.kind !== "next-input-options") return;
    expect(output.nextInputs.map((option) => option.input)).toEqual([
      { kind: "modifier", modifier: Modifier.SelectBomb },
    ]);

    const before = game.fen();
    expect(
      game.processInput(
        [...scenario.chain, { kind: "modifier", modifier: Modifier.SelectPotion }],
        false,
        false,
      ),
    ).toEqual({ kind: "invalid-input" });
    expect(game.fen()).toBe(before);
  });
});

describe("input value equality", () => {
  it("compares discriminants and payload values directly", () => {
    expect(inputEquals({ kind: "takeback" }, { kind: "takeback" })).toBe(true);
    expect(
      inputEquals(
        { kind: "location", location: { i: 4, j: 3 } },
        { kind: "location", location: { i: 4, j: 3 } },
      ),
    ).toBe(true);
    expect(
      inputEquals(
        { kind: "location", location: { i: 4, j: 3 } },
        { kind: "location", location: { i: 3, j: 4 } },
      ),
    ).toBe(false);
    expect(
      inputEquals(
        { kind: "modifier", modifier: Modifier.SelectBomb },
        { kind: "modifier", modifier: Modifier.SelectPotion },
      ),
    ).toBe(false);
    expect(
      inputEquals(
        { kind: "modifier", modifier: Modifier.SelectBomb },
        { kind: "takeback" },
      ),
    ).toBe(false);
  });
});

describe("MonsGame serialized state copying", () => {
  it("keeps board, tracking, and history ownership explicit across copies", () => {
    const initial = new MonsGame(false, GameVariant.OffsetArcManaRows);
    const removedAt = location(0, 3);
    const state = parseGameFen(initial.fen());
    if (state === undefined) {
      throw new Error("initial game must have a parseable FEN");
    }
    const board = state.board.fork();
    board.delete(removedAt);
    const source = MonsGame.fromFen(
      gameFen({
        ...state,
        board,
        whiteScore: 3,
        blackScore: 2,
        activeColor: Color.Black,
        actionsUsedCount: 1,
        manaMovesCount: 1,
        monsMovesCount: 4,
        whitePotionsCount: 2,
        blackPotionsCount: 3,
        turnNumber: 8,
      }),
      true,
    );
    if (source === undefined) {
      throw new Error("custom state must produce a valid game");
    }
    source.replaceHistory({
      takebackFens: ["before", source.fen()],
      movesVerified: true,
      trackingEntries: [
        {
          fen: source.fen(),
          color: source.activeColor,
          events: [
            {
              kind: "mana-move",
              mana: regularMana(Color.Black),
              from: location(3, 4),
              to: location(4, 4),
            },
          ],
        },
      ],
    });
    expect(source.canTakeback(source.activeColor)).toBe(true);
    const sourceFen = source.fen();
    const sourceTakebackFens = source.takebackFens;
    const sourceTracking = source.verboseTrackingEntities;
    const movedFrom = location(0, 5);
    const movedTo = location(1, 5);
    const movedItem = source.board.get(movedFrom);
    const move: readonly Input[] = [
      { kind: "location", location: movedFrom },
      { kind: "location", location: movedTo },
    ];

    const copy = source.copy();
    expect(copy.fen()).toBe(source.fen());
    expect(copy.variant()).toBe(source.variant());
    expect(copy.withVerboseTracking).toBe(true);
    expect(copy.isMovesVerified).toBe(true);
    expect(copy.takebackFens).toEqual(source.takebackFens);
    expect(copy.takebackFens).not.toBe(source.takebackFens);
    expect(copy.verboseTrackingEntities).toEqual(source.verboseTrackingEntities);
    expect(copy.verboseTrackingEntities).not.toBe(source.verboseTrackingEntities);
    expect(copy.verboseTrackingEntities[0]?.events).not.toBe(
      source.verboseTrackingEntities[0]?.events,
    );
    expect(copy.processInput(move, false, false).kind).toBe("events");
    expect(copy.board.get(movedFrom)).toBeUndefined();
    expect(copy.board.get(movedTo)).toEqual(movedItem);
    expect(source.board.get(movedFrom)).toEqual(movedItem);
    expect(source.board.get(movedTo)).toBeUndefined();
    expect(source.fen()).toBe(sourceFen);
    expect(source.takebackFens).toEqual(sourceTakebackFens);
    expect(source.verboseTrackingEntities).toEqual(sourceTracking);

    const simulation = source.fork();
    expect(simulation.fen()).toBe(source.fen());
    expect(simulation.variant()).toBe(source.variant());
    expect(simulation.isMovesVerified).toBe(source.isMovesVerified);
    expect(simulation.withVerboseTracking).toBe(false);
    expect(simulation.takebackFens).toEqual([]);
    expect(simulation.verboseTrackingEntities).toEqual([]);
    expect(simulation.canTakeback(source.activeColor)).toBe(false);
    expect(simulation.processInput(move, false, false).kind).toBe("events");
    expect(simulation.board.get(movedFrom)).toBeUndefined();
    expect(simulation.board.get(movedTo)).toEqual(movedItem);
    expect(simulation.takebackFens).toEqual([]);
    expect(simulation.verboseTrackingEntities).toEqual([]);
    expect(source.board.get(movedFrom)).toEqual(movedItem);
    expect(source.board.get(movedTo)).toBeUndefined();
    expect(source.fen()).toBe(sourceFen);
    expect(source.takebackFens).toEqual(sourceTakebackFens);
    expect(source.verboseTrackingEntities).toEqual(sourceTracking);

    const restored = MonsGame.fromFen(source.fen(), true);
    expect(restored).toBeDefined();
    expect(restored?.fen()).toBe(source.fen());
    expect(restored?.withVerboseTracking).toBe(true);
    expect(restored?.takebackFens).toEqual([]);
    expect(restored?.verboseTrackingEntities).toEqual([]);
    expect(restored?.isMovesVerified).toBe(false);

    const hydratedSimulation = restored?.fork();
    expect(hydratedSimulation?.fen()).toBe(source.fen());
    expect(hydratedSimulation?.canTakeback(source.activeColor)).toBe(false);
    expect(hydratedSimulation?.processInput(move, false, false).kind).toBe("events");
    expect(hydratedSimulation?.takebackFens).toEqual([]);
    expect(hydratedSimulation?.verboseTrackingEntities).toEqual([]);
  });
});

describe("MonsGame board ownership", () => {
  it("warms, forks, and invalidates occupied and category caches independently", () => {
    const cold = new MutableBoard(GameVariant.Classic);
    const coldFork = cold.fork();
    expect(boardCacheSnapshot(cold)).toMatchObject({
      occupiedEntries: undefined,
      categoryDerived: undefined,
    });
    expect(boardCacheSnapshot(coldFork)).toMatchObject({
      occupiedEntries: undefined,
      categoryDerived: undefined,
    });

    const entriesFirst = new MutableBoard(GameVariant.Classic);
    expect([...entriesFirst.entries()].length).toBeGreaterThan(0);
    const entriesCache = boardCacheSnapshot(entriesFirst);
    expect(entriesCache.occupiedEntries).toBeDefined();
    expect(entriesCache.categoryDerived).toBeUndefined();

    const entriesFork = entriesFirst.fork();
    const entriesForkCache = boardCacheSnapshot(entriesFork);
    expect(entriesForkCache.occupiedEntries).toBe(entriesCache.occupiedEntries);
    expect(entriesForkCache.categoryDerived).toBeUndefined();

    expect(entriesFirst.allMonsLocations(Color.White).length).toBeGreaterThan(0);
    const fullyWarmCache = boardCacheSnapshot(entriesFirst);
    expect(fullyWarmCache.occupiedEntries).toBe(entriesCache.occupiedEntries);
    expect(fullyWarmCache.categoryDerived).toBeDefined();

    const fullyWarmFork = entriesFirst.fork();
    const fullyWarmForkCache = boardCacheSnapshot(fullyWarmFork);
    expect(fullyWarmForkCache.occupiedEntries).toBe(fullyWarmCache.occupiedEntries);
    expect(fullyWarmForkCache.categoryDerived).toBe(fullyWarmCache.categoryDerived);

    entriesFirst.set(location(5, 5), manaItem(regularMana(Color.White)));
    expect(boardCacheSnapshot(entriesFirst)).toMatchObject({
      occupiedEntries: undefined,
      categoryDerived: undefined,
    });
    expect(boardCacheSnapshot(fullyWarmFork)).toMatchObject({
      occupiedEntries: fullyWarmCache.occupiedEntries,
      categoryDerived: fullyWarmCache.categoryDerived,
    });

    const categoriesFirst = new MutableBoard(GameVariant.Classic);
    expect(categoriesFirst.findMana(Color.White)).toBeDefined();
    const categoryCache = boardCacheSnapshot(categoriesFirst);
    expect(categoryCache.occupiedEntries).toBeUndefined();
    expect(categoryCache.categoryDerived).toBeDefined();
    const categoryFork = categoriesFirst.fork();
    expect(boardCacheSnapshot(categoryFork)).toMatchObject({
      occupiedEntries: undefined,
      categoryDerived: categoryCache.categoryDerived,
    });
    categoryFork.delete(location(5, 5));
    expect(boardCacheSnapshot(categoryFork)).toMatchObject({
      occupiedEntries: undefined,
      categoryDerived: undefined,
    });
    expect(boardCacheSnapshot(categoriesFirst)).toMatchObject({
      occupiedEntries: undefined,
      categoryDerived: categoryCache.categoryDerived,
    });
  });

  it("does not treat invalid runtime colors as Black", () => {
    const invalidColor = "invalid-color" as Color;
    const source = new MutableBoard(
      GameVariant.Classic,
      new Array<Item | undefined>(BOARD_CELLS).fill(undefined),
    );
    source.set(location(1, 1), monItem(createMon(MonKind.Angel, invalidColor, 0)));
    source.set(location(1, 2), monItem(createMon(MonKind.Mystic, invalidColor, 2)));
    source.set(location(1, 3), manaItem(regularMana(invalidColor)));
    source.set(location(2, 1), monItem(createMon(MonKind.Angel, Color.Black, 0)));
    source.set(location(2, 2), monItem(createMon(MonKind.Mystic, Color.Black, 2)));
    source.set(location(2, 3), manaItem(regularMana(Color.Black)));
    const view = source.readonlyView();

    expect(view.allMonsLocations(invalidColor)).toEqual([]);
    expect(view.allFreeRegularManaLocations(invalidColor)).toEqual([]);
    expect(view.faintedMonsLocations(invalidColor)).toEqual([]);
    expect(view.findMana(invalidColor)).toBeUndefined();
    expect(view.findAwakeAngel(invalidColor)).toBeUndefined();

    expect(view.allMonsLocations(Color.Black)).toEqual([
      location(2, 1),
      location(2, 2),
    ]);
    expect(view.allFreeRegularManaLocations(Color.Black)).toEqual([location(2, 3)]);
    expect(view.faintedMonsLocations(Color.Black)).toEqual([location(2, 2)]);
    expect(view.findMana(Color.Black)).toEqual(location(2, 3));
    expect(view.findAwakeAngel(Color.Black)).toEqual(location(2, 1));
  });

  it("returns detached coordinates from cold and warm derived queries", () => {
    const source = new MutableBoard(GameVariant.Classic);
    const view = source.readonlyView();
    source.set(location(10, 3), monItem(createMon(MonKind.Mystic, Color.White, 2)));

    const expectDetachedArray = (query: () => Location[]): void => {
      const cold = query();
      const expected = cold.map((at) => ({ ...at }));
      const warm = query();
      expect(warm).toEqual(expected);
      expect(warm).not.toBe(cold);
      for (let index = 0; index < cold.length; index += 1) {
        expect(warm[index]).not.toBe(cold[index]);
      }
      const first = cold[0];
      expect(first).toBeDefined();
      if (first === undefined) return;
      expect(Reflect.set(first, "i", 99)).toBe(true);
      cold.length = 0;
      expect(query()).toEqual(expected);
    };

    expectDetachedArray(() => view.allMonsLocations(Color.White));
    expectDetachedArray(() => view.allFreeRegularManaLocations(Color.White));
    expectDetachedArray(() => view.faintedMonsLocations(Color.White));

    const expectDetachedSingle = (query: () => Location | undefined): Location => {
      const cold = query();
      const warm = query();
      expect(cold).toBeDefined();
      expect(warm).toEqual(cold);
      expect(warm).not.toBe(cold);
      if (cold === undefined) {
        throw new Error("query must return a location");
      }
      const expected = { ...cold };
      expect(Reflect.set(cold, "j", 99)).toBe(true);
      expect(query()).toEqual(expected);
      return expected;
    };

    const whiteMana = expectDetachedSingle(() => view.findMana(Color.White));
    const whiteAngel = expectDetachedSingle(() => view.findAwakeAngel(Color.White));
    const blackAngel = expectDetachedSingle(() => view.findAwakeAngel(Color.Black));

    const fork = view.fork();
    const forkMana = fork.findMana(Color.White);
    expect(forkMana).toEqual(whiteMana);
    expect(forkMana).not.toBe(view.findMana(Color.White));
    expect(fork.findAwakeAngel(Color.White)).toEqual(whiteAngel);
    source.delete(whiteAngel);
    expect(view.findAwakeAngel(Color.White)).toBeUndefined();
    expect(fork.findAwakeAngel(Color.White)).toEqual(whiteAngel);

    fork.delete(blackAngel);
    expect(fork.findAwakeAngel(Color.Black)).toBeUndefined();
    expect(view.findAwakeAngel(Color.Black)).toEqual(blackAngel);
  });

  it("exposes a live readonly view and independently mutable forks", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const boardView = game.board;
    const removedAt = location(0, 3);

    expect("set" in boardView).toBe(false);
    expect("delete" in boardView).toBe(false);

    const fork = boardView.fork();
    expect(typeof fork.set).toBe("function");
    expect(typeof fork.delete).toBe("function");
    fork.delete(removedAt);

    expect(fork.get(removedAt)).toBeUndefined();
    expect(boardView.get(removedAt)).toBeDefined();
    expect(game.board).toBe(boardView);

    const movedFrom = location(10, 5);
    const movedTo = location(9, 4);
    expect(
      game.processInput(
        [
          { kind: "location", location: movedFrom },
          { kind: "location", location: movedTo },
        ],
        false,
        false,
      ).kind,
    ).toBe("events");
    expect(boardView.get(movedFrom)).toBeUndefined();
    expect(boardView.get(movedTo)).toBeDefined();
    expect(game.board).toBe(boardView);
  });

  it("forks a supplied board before warming any game query caches", () => {
    const supplied = new MutableBoard(GameVariant.Classic);
    const removedAt = location(10, 3);
    const game = new MonsGame(false, GameVariant.Classic, supplied);
    const fenBefore = game.fen();
    const suggestionBefore = game.processInput([], true, false);

    supplied.delete(removedAt);

    expect(game.fen()).toBe(fenBefore);
    expect(game.board.get(removedAt)).toBeDefined();
    expect(game.processInput([], true, false)).toEqual(suggestionBefore);
  });

  it("normalizes supplied item values before sharing them between forks", () => {
    const at = location(10, 5);
    const mutableMon = {
      kind: MonKind.Drainer,
      color: Color.White,
      cooldown: 0,
    };
    const mutableItem: Item = { kind: "mon", mon: mutableMon };
    const slots = Array.from(
      { length: BOARD_CELLS },
      (): Item | undefined => undefined,
    );
    slots[locationIndex(at)] = mutableItem;
    const supplied = MutableBoard.fromItems(slots, GameVariant.Classic);
    const game = new MonsGame(false, GameVariant.Classic, supplied);
    const fenBefore = game.fen();
    const stored = game.board.get(at);

    expect(Object.isFrozen(stored)).toBe(true);
    expect(stored?.kind === "mon" && Object.isFrozen(stored.mon)).toBe(true);
    expect(Reflect.set(mutableMon, "cooldown", 2)).toBe(true);
    expect(stored?.kind === "mon" && Reflect.set(stored.mon, "cooldown", 2)).toBe(
      false,
    );
    expect(game.fen()).toBe(fenBefore);
    expect(game.board.get(at)).toEqual(
      monItem(createMon(MonKind.Drainer, Color.White, 0)),
    );
  });
});
