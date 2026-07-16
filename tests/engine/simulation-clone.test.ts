import { describe, expect, it } from "vitest";

import { GameVariant } from "../../src/engine/config.js";
import { Color, MonKind, createMon, monItem } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import { location, type Location } from "../../src/engine/geometry.js";

function monCooldown(game: MonsGame, at: Location): number | undefined {
  const item = game.board.item(at);
  return item?.kind === "mon" ? item.mon.cooldown : undefined;
}

describe("simulation board cloning", () => {
  it("isolates move, faint, and awake mutations between shallow clones", () => {
    const source = new MonsGame(false, GameVariant.Classic);
    const sourceFen = source.fen();
    const moving = source.cloneForSimulation();
    const fainting = source.cloneForSimulation();
    const awakening = source.cloneForSimulation();

    const movingFrom = location(10, 3);
    const movingTo = location(9, 3);
    const movingItem = moving.board.item(movingFrom);
    if (movingItem?.kind !== "mon") {
      throw new Error("expected the initial white demon");
    }
    moving.applyAndAddResultingEvents([
      { kind: "mon-move", item: movingItem, from: movingFrom, to: movingTo },
    ]);

    expect(moving.board.item(movingFrom)).toBeUndefined();
    expect(moving.board.item(movingTo)).toEqual(movingItem);
    expect(source.board.item(movingFrom)).toEqual(movingItem);
    expect(source.board.item(movingTo)).toBeUndefined();
    expect(fainting.board.item(movingFrom)).toEqual(movingItem);

    const blackMysticAt = location(0, 3);
    const blackMystic = createMon(MonKind.Mystic, Color.Black, 0);
    fainting.applyAndAddResultingEvents([
      {
        kind: "mon-fainted",
        mon: blackMystic,
        from: blackMysticAt,
        to: blackMysticAt,
      },
    ]);

    expect(monCooldown(fainting, blackMysticAt)).toBe(2);
    expect(monCooldown(source, blackMysticAt)).toBe(0);
    expect(monCooldown(moving, blackMysticAt)).toBe(0);

    awakening.board.put(
      monItem(createMon(MonKind.Mystic, Color.Black, 1)),
      blackMysticAt,
    );
    awakening.turnNumber = 2;
    awakening.actionsUsedCount = 1;
    awakening.manaMovesCount = 5;
    awakening.monsMovesCount = 5;
    const awakeEvents = awakening.applyAndAddResultingEvents([]);

    expect(awakeEvents).toContainEqual({
      kind: "mon-awake",
      mon: createMon(MonKind.Mystic, Color.Black, 0),
      at: blackMysticAt,
    });
    expect(monCooldown(awakening, blackMysticAt)).toBe(0);
    expect(monCooldown(fainting, blackMysticAt)).toBe(2);
    expect(source.fen()).toBe(sourceFen);
  });
});
