import { describe, expect, it } from "vitest";

import { GameVariant } from "../../src/engine/board/config.js";
import {
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
  consumableItem,
  createMon,
  manaItem,
  monItem,
  monWithManaItem,
  regularMana,
  type Input,
  type Item,
  type NextInput,
  type NextInputKind as NextInputKindValue,
} from "../../src/engine/model/domain.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";
import { location, type Location } from "../../src/engine/board/geometry.js";
import { gameWith } from "../helpers/game.js";

function gameAtTurnTwo(items: readonly (readonly [Location, Item])[]): MonsGame {
  return gameWith(items).fork();
}

function locationOption(i: number, j: number, kind: NextInputKindValue): NextInput {
  return {
    input: { kind: "location", location: location(i, j) },
    kind,
  };
}

describe("MonsGame input-resolution contract", () => {
  it("orders movement destinations before ordered action targets", () => {
    const start = location(5, 5);
    const mystic = createMon(MonKind.Mystic, Color.White, 0);
    const firstTarget = createMon(MonKind.Drainer, Color.Black, 0);
    const secondTarget = createMon(MonKind.Demon, Color.Black, 0);
    const game = gameAtTurnTwo([
      [start, monItem(mystic)],
      [location(3, 3), monItem(firstTarget)],
      [location(7, 7), monItem(secondTarget)],
    ]);

    expect(
      game.processInput([{ kind: "location", location: start }], true, false),
    ).toEqual({
      kind: "next-input-options",
      nextInputs: [
        locationOption(4, 4, NextInputKind.MonMove),
        locationOption(4, 5, NextInputKind.MonMove),
        locationOption(4, 6, NextInputKind.MonMove),
        locationOption(5, 4, NextInputKind.MonMove),
        locationOption(5, 6, NextInputKind.MonMove),
        locationOption(6, 4, NextInputKind.MonMove),
        locationOption(6, 5, NextInputKind.MonMove),
        locationOption(6, 6, NextInputKind.MonMove),
        locationOption(3, 3, NextInputKind.MysticAction),
        locationOption(7, 7, NextInputKind.MysticAction),
      ],
    });
  });

  it("preserves demon continuation, consumable, and event order", () => {
    const start = location(5, 3);
    const target = location(5, 5);
    const destination = location(5, 6);
    const demon = createMon(MonKind.Demon, Color.White, 0);
    const defender = createMon(MonKind.Mystic, Color.Black, 0);
    const defenderMana = regularMana(Color.Black);
    const actorItem = monItem(demon);
    const game = gameAtTurnTwo([
      [start, actorItem],
      [target, monWithManaItem(defender, defenderMana)],
      [destination, consumableItem(Consumable.BombOrPotion)],
    ]);
    const pair = [
      { kind: "location", location: start },
      { kind: "location", location: target },
    ] as const satisfies readonly Input[];
    const chain = [
      ...pair,
      { kind: "location", location: destination },
    ] as const satisfies readonly Input[];

    expect(game.processInput(pair, true, false)).toEqual({
      kind: "next-input-options",
      nextInputs: [
        locationOption(4, 4, NextInputKind.DemonAdditionalStep),
        locationOption(4, 5, NextInputKind.DemonAdditionalStep),
        locationOption(4, 6, NextInputKind.DemonAdditionalStep),
        locationOption(5, 4, NextInputKind.DemonAdditionalStep),
        locationOption(5, 6, NextInputKind.DemonAdditionalStep),
        locationOption(6, 4, NextInputKind.DemonAdditionalStep),
        locationOption(6, 5, NextInputKind.DemonAdditionalStep),
        locationOption(6, 6, NextInputKind.DemonAdditionalStep),
      ],
    });
    expect(game.processInput(chain, true, false)).toEqual({
      kind: "next-input-options",
      nextInputs: [
        {
          input: { kind: "modifier", modifier: Modifier.SelectBomb },
          kind: NextInputKind.SelectConsumable,
          actorMonItem: actorItem,
        },
        {
          input: { kind: "modifier", modifier: Modifier.SelectPotion },
          kind: NextInputKind.SelectConsumable,
          actorMonItem: actorItem,
        },
      ],
    });
    expect(
      game.processInput(
        [...chain, { kind: "modifier", modifier: Modifier.SelectPotion }],
        true,
        false,
      ),
    ).toEqual({
      kind: "events",
      events: [
        { kind: "demon-action", demon, from: start, to: target },
        {
          kind: "mon-fainted",
          mon: defender,
          from: target,
          to: location(0, 3),
        },
        { kind: "mana-dropped", mana: defenderMana, at: target },
        {
          kind: "demon-additional-step",
          demon,
          from: target,
          to: destination,
        },
        { kind: "pickup-potion", by: actorItem, at: destination },
      ],
    });
  });

  it("preserves spirit destination and carried-item event order", () => {
    const start = location(5, 3);
    const target = location(3, 3);
    const destination = location(3, 4);
    const spirit = createMon(MonKind.Spirit, Color.White, 0);
    const defender = createMon(MonKind.Drainer, Color.Black, 0);
    const carriedMana = regularMana(Color.Black);
    const destinationMana = regularMana(Color.White);
    const targetItem = monWithManaItem(defender, carriedMana);
    const game = gameAtTurnTwo([
      [start, monItem(spirit)],
      [target, targetItem],
      [destination, manaItem(destinationMana)],
    ]);
    const pair = [
      { kind: "location", location: start },
      { kind: "location", location: target },
    ] as const satisfies readonly Input[];

    expect(game.processInput(pair, true, false)).toEqual({
      kind: "next-input-options",
      nextInputs: [
        locationOption(2, 2, NextInputKind.SpiritTargetMove),
        locationOption(2, 3, NextInputKind.SpiritTargetMove),
        locationOption(2, 4, NextInputKind.SpiritTargetMove),
        locationOption(3, 2, NextInputKind.SpiritTargetMove),
        locationOption(3, 4, NextInputKind.SpiritTargetMove),
        locationOption(4, 2, NextInputKind.SpiritTargetMove),
        locationOption(4, 3, NextInputKind.SpiritTargetMove),
        locationOption(4, 4, NextInputKind.SpiritTargetMove),
      ],
    });
    expect(
      game.processInput(
        [...pair, { kind: "location", location: destination }],
        true,
        false,
      ),
    ).toEqual({
      kind: "events",
      events: [
        {
          kind: "spirit-target-move",
          item: targetItem,
          from: target,
          to: destination,
          by: start,
        },
        { kind: "mana-dropped", mana: carriedMana, at: target },
        {
          kind: "pickup-mana",
          mana: destinationMana,
          by: defender,
          at: destination,
        },
      ],
    });
  });

  it("rejects a suffix after a complete move without changing state or history", () => {
    const game = new MonsGame(true, GameVariant.Classic);
    const completeMove = [
      { kind: "location", location: location(10, 3) },
      { kind: "location", location: location(9, 2) },
    ] as const satisfies readonly Input[];

    expect(game.processInput(completeMove, true, false).kind).toBe("events");
    const before = {
      fen: game.fen(),
      takebackFens: game.takebackFens,
      trackingEntries: game.verboseTrackingEntities,
      movesVerified: game.isMovesVerified,
    };

    expect(
      game.processInput(
        [...completeMove, { kind: "location", location: location(0, 0) }],
        false,
        false,
      ),
    ).toEqual({ kind: "invalid-input" });
    expect({
      fen: game.fen(),
      takebackFens: game.takebackFens,
      trackingEntries: game.verboseTrackingEntities,
      movesVerified: game.isMovesVerified,
    }).toEqual(before);
  });
});
