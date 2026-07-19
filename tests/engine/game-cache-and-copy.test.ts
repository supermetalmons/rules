import { describe, expect, it } from "vitest";

import { GameVariant } from "../../src/engine/config.js";
import {
  Color,
  Consumable,
  MonKind,
  consumableItem,
  createMon,
  manaItem,
  monItem,
  monWithManaItem,
  regularMana,
  type Event,
  type Input,
  type Item,
  type NextInput,
  type Output,
} from "../../src/engine/domain.js";
import { parseGameFen } from "../../src/engine/fen.js";
import { MonsGame } from "../../src/engine/game.js";
import { location, type Location } from "../../src/engine/geometry.js";

function replaceItems(
  game: MonsGame,
  items: readonly (readonly [Location, Item])[],
): void {
  game.replaceBoardItems(items);
}

function demonAdditionalStepGame(): {
  readonly game: MonsGame;
  readonly pair: readonly Input[];
  readonly chain: readonly Input[];
} {
  const start = location(5, 3);
  const target = location(5, 5);
  const destination = location(5, 6);
  const demon = createMon(MonKind.Demon, Color.White, 0);
  const defender = createMon(MonKind.Mystic, Color.Black, 0);
  const game = new MonsGame(false, GameVariant.Classic);
  replaceItems(game, [
    [start, monItem(demon)],
    [target, monWithManaItem(defender, regularMana(Color.Black))],
  ]);
  game.turnNumber = 2;

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
  const scenario = demonAdditionalStepGame();
  const destination = scenario.chain[2];
  if (destination?.kind !== "location") {
    throw new Error("demon scenario must end at a location");
  }
  scenario.game.board.put(
    consumableItem(Consumable.BombOrPotion),
    destination.location,
  );
  scenario.game.invalidateProcessInputCache();
  return { game: scenario.game, chain: scenario.chain };
}

function expectSameQueryResult(
  warm: MonsGame,
  coldSource: MonsGame,
  input: readonly Input[],
): Output {
  const warmOutput = warm.processInput(input, true, false);
  const cold = coldSource.cloneForSimulation();
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

describe("MonsGame staged-input caches", () => {
  it("returns identical values from warm and cold second- and third-stage caches", () => {
    const { game, pair, chain } = demonAdditionalStepGame();
    const warm = game.cloneForSimulation();

    expectSameQueryResult(warm, game, []);
    expectSameQueryResult(warm, game, pair.slice(0, 1));
    expectSameQueryResult(warm, game, pair);
    expectSameQueryResult(warm, game, chain);

    // Repeat the staged queries so both stage caches serve hits.
    expectSameQueryResult(warm, game, pair);
    expectSameQueryResult(warm, game, chain);
  });

  it("applies a move from warmed stage caches identically to a cold state", () => {
    const { game, chain } = demonAdditionalStepGame();
    const warm = game.cloneForSimulation();
    const cold = game.cloneForSimulation();
    cold.invalidateProcessInputCache();

    mutableEvents(
      warm.processInput(chain, true, false),
      "warmed third-stage query",
    );

    const warmOutput = warm.processInput(chain, false, false);
    const coldOutput = cold.processInput(chain, false, false);

    expect(warmOutput).toEqual(coldOutput);
    expect(warm.fen()).toBe(cold.fen());
    expect(warm.fen()).not.toBe(game.fen());
  });

  it("does not expose mutable second- or third-stage cache snapshots", () => {
    const { game, pair, chain } = demonAdditionalStepGame();
    const warm = game.cloneForSimulation();
    const expectedPair = game
      .cloneForSimulation()
      .processInput(pair, true, false);
    const expectedChain = game
      .cloneForSimulation()
      .processInput(chain, true, false);

    const pairOutput = warm.processInput(pair, true, false);
    const pairOptions = mutableNextInputs(pairOutput, "second stage");
    const firstPairOption = pairOptions[0];
    if (firstPairOption?.input.kind !== "location") {
      throw new Error("second-stage first option must be a location");
    }
    (firstPairOption.input.location as { i: number }).i = 99;
    pairOptions.length = 0;
    expect(warm.processInput(pair, true, false)).toEqual(expectedPair);

    const chainOutput = warm.processInput(chain, true, false);
    const chainEvents = mutableEvents(chainOutput, "third stage");
    const lastChainEvent = chainEvents.at(-1);
    if (lastChainEvent?.kind !== "demon-additional-step") {
      throw new Error(
        "third-stage final event must be a demon additional step",
      );
    }
    (lastChainEvent.to as { i: number }).i = 99;
    chainEvents.length = 0;
    expect(warm.processInput(chain, true, false)).toEqual(expectedChain);
  });

  it("does not expose mutable third-stage option snapshots", () => {
    const { game, chain } = demonConsumableSelectionGame();
    const warm = game.cloneForSimulation();
    const expected = game.cloneForSimulation().processInput(chain, true, false);

    const output = warm.processInput(chain, true, false);
    const options = mutableNextInputs(output, "third-stage consumable");
    const actor = options[0]?.actorMonItem;
    if (actor?.kind !== "mon") {
      throw new Error("third-stage first option must have a mon actor");
    }
    actor.mon.cooldown = 99;
    options.length = 0;

    expect(warm.processInput(chain, true, false)).toEqual(expected);
  });
});

describe("MonsGame serialized state copying", () => {
  it("keeps board, tracking, and history ownership explicit across copies", () => {
    const source = new MonsGame(true, GameVariant.OffsetArcManaRows);
    const removedAt = location(0, 3);
    source.board.removeItem(removedAt);
    source.whiteScore = 3;
    source.blackScore = 2;
    source.activeColor = Color.Black;
    source.actionsUsedCount = 1;
    source.manaMovesCount = 1;
    source.monsMovesCount = 4;
    source.whitePotionsCount = 2;
    source.blackPotionsCount = 3;
    source.turnNumber = 8;
    source.takebackFens = ["before", source.fen()];
    source.isMovesVerified = true;
    source.verboseTrackingEntities = [
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
    ];
    expect(source.canTakeback(source.activeColor)).toBe(true);

    const clone = source.clone();
    expect(clone.fen()).toBe(source.fen());
    expect(clone.variant()).toBe(source.variant());
    expect(clone.withVerboseTracking).toBe(true);
    expect(clone.isMovesVerified).toBe(true);
    expect(clone.takebackFens).toEqual(source.takebackFens);
    expect(clone.takebackFens).not.toBe(source.takebackFens);
    expect(clone.verboseTrackingEntities).toEqual(
      source.verboseTrackingEntities,
    );
    expect(clone.verboseTrackingEntities).not.toBe(
      source.verboseTrackingEntities,
    );
    expect(clone.verboseTrackingEntities[0]?.events).not.toBe(
      source.verboseTrackingEntities[0]?.events,
    );
    clone.board.put(manaItem(regularMana(Color.White)), removedAt);
    expect(source.board.item(removedAt)).toBeUndefined();

    const simulation = source.cloneForSimulation();
    expect(simulation.fen()).toBe(source.fen());
    expect(simulation.variant()).toBe(source.variant());
    expect(simulation.isMovesVerified).toBe(source.isMovesVerified);
    expect(simulation.withVerboseTracking).toBe(false);
    expect(simulation.takebackFens).toEqual([]);
    expect(simulation.verboseTrackingEntities).toEqual([]);
    expect(simulation.canTakeback(source.activeColor)).toBe(false);
    simulation.board.put(manaItem(regularMana(Color.White)), removedAt);
    expect(source.board.item(removedAt)).toBeUndefined();

    const parsedState = parseGameFen(source.fen());
    expect(parsedState).toBeDefined();
    if (parsedState === undefined) {
      return;
    }
    const hydratedSimulation = MonsGame.newSimulationState(parsedState);
    expect(hydratedSimulation.fen()).toBe(source.fen());
    expect(hydratedSimulation.canTakeback(source.activeColor)).toBe(false);

    const restored = MonsGame.fromFen(source.fen(), true);
    expect(restored).toBeDefined();
    expect(restored?.fen()).toBe(source.fen());
    expect(restored?.withVerboseTracking).toBe(true);
    expect(restored?.takebackFens).toEqual([]);
    expect(restored?.verboseTrackingEntities).toEqual([]);
    expect(restored?.isMovesVerified).toBe(false);
  });
});
