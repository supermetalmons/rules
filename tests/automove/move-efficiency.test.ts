import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  Color,
  Consumable,
  MonKind,
  createMon,
  monWithConsumableItem,
  monWithManaItem,
  regularMana,
  type Input,
} from "../../src/engine/domain.js";
import { GameVariant } from "../../src/engine/config.js";
import { MonsGame } from "../../src/engine/game.js";
import { exactSearchStateHash } from "../../src/automove/exact.js";
import {
  clearMoveEfficiencyCache,
  moveEfficiencyDeltaFromBeforeSnapshot,
  moveEfficiencySnapshotUncachedWithHash,
  moveEfficiencySnapshotWithHash,
} from "../../src/automove/move-efficiency.js";
import { applyInputsForSearchWithEvents } from "../../src/automove/transitions.js";

const OPENING_MOVE: readonly Input[] = [
  { kind: "location", location: { i: 10, j: 5 } },
  { kind: "location", location: { i: 9, j: 4 } },
];

describe("move-efficiency snapshots", () => {
  beforeEach(() => {
    clearMoveEfficiencyCache();
  });

  afterEach(() => {
    clearMoveEfficiencyCache();
  });

  it("characterizes cache identity, cache tags, and uncached snapshots", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const hash = exactSearchStateHash(game);

    const approximate = moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      false,
      false,
      hash,
    );
    expect(
      moveEfficiencySnapshotWithHash(game, Color.White, false, false, hash),
    ).toBe(approximate);

    const exact = moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      true,
      true,
      hash,
    );
    const opponent = moveEfficiencySnapshotWithHash(
      game,
      Color.Black,
      false,
      false,
      hash,
    );
    const uncached = moveEfficiencySnapshotUncachedWithHash(
      game,
      Color.White,
      false,
      false,
      hash,
    );

    expect(approximate).toEqual({
      myBestCarrierSteps: 15,
      opponentBestCarrierSteps: 15,
      myBestDrainerToManaSteps: 2,
      opponentBestDrainerToManaSteps: 2,
      myCarrierCount: 0,
      opponentCarrierCount: 0,
      mySpiritOnBase: true,
      opponentSpiritOnBase: true,
      mySpiritActionTargets: 0,
      opponentSpiritActionTargets: 0,
      mySameTurnScoreValue: 0,
      opponentSameTurnScoreValue: 0,
      mySameTurnOpponentManaScoreValue: 0,
      opponentSameTurnOpponentManaScoreValue: 0,
      mySafeSupermanaProgress: false,
      opponentSafeSupermanaProgress: false,
      mySafeOpponentManaProgress: false,
      opponentSafeOpponentManaProgress: false,
      mySafeSupermanaProgressSteps: 15,
      opponentSafeSupermanaProgressSteps: 15,
      mySafeOpponentManaProgressSteps: 15,
      opponentSafeOpponentManaProgressSteps: 15,
    });
    expect(exact).toEqual({
      ...approximate,
      myBestDrainerToManaSteps: 3,
      opponentBestDrainerToManaSteps: 3,
      opponentSpiritActionTargets: 6,
    });
    expect(opponent).toEqual(approximate);
    expect(exact).not.toBe(approximate);
    expect(opponent).not.toBe(approximate);
    expect(uncached).not.toBe(approximate);
    expect(uncached).toEqual(approximate);

    clearMoveEfficiencyCache();
    const rebuilt = moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      false,
      false,
      hash,
    );
    expect(rebuilt).not.toBe(approximate);
    expect(rebuilt).toEqual(approximate);
  });

  it("observes live carriers and consumed spirits without counting fainted carriers", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const whiteSpirit = createMon(MonKind.Spirit, Color.White, 0);
    const whiteSpiritBase = game.board.base(whiteSpirit);
    const whiteSpiritAway = { i: 5, j: 5 };
    const whiteCarrierNear = { i: 2, j: 2 };
    const whiteCarrierFar = { i: 4, j: 4 };
    const blackCarrier = { i: 8, j: 8 };
    const faintedWhiteCarrier = { i: 1, j: 1 };

    for (const location of [
      whiteSpiritAway,
      whiteCarrierNear,
      whiteCarrierFar,
      blackCarrier,
      faintedWhiteCarrier,
    ]) {
      game.board.removeItem(location);
    }
    game.board.removeItem(whiteSpiritBase);
    game.board.put(
      monWithConsumableItem(whiteSpirit, Consumable.Bomb),
      whiteSpiritAway,
    );
    game.board.put(
      monWithManaItem(
        createMon(MonKind.Drainer, Color.White, 0),
        regularMana(Color.White),
      ),
      whiteCarrierNear,
    );
    game.board.put(
      monWithManaItem(
        createMon(MonKind.Angel, Color.White, 0),
        regularMana(Color.Black),
      ),
      whiteCarrierFar,
    );
    game.board.put(
      monWithManaItem(
        createMon(MonKind.Mystic, Color.Black, 0),
        regularMana(Color.Black),
      ),
      blackCarrier,
    );
    game.board.put(
      monWithManaItem(
        createMon(MonKind.Demon, Color.White, 2),
        regularMana(Color.White),
      ),
      faintedWhiteCarrier,
    );

    const snapshot = moveEfficiencySnapshotUncachedWithHash(
      game,
      Color.White,
      false,
      false,
      exactSearchStateHash(game),
    );

    expect(snapshot.myCarrierCount).toBe(2);
    expect(snapshot.opponentCarrierCount).toBe(1);
    expect(snapshot.myBestCarrierSteps).toBe(2);
    expect(snapshot.opponentBestCarrierSteps).toBe(2);
    expect(snapshot.mySpiritOnBase).toBe(false);
    expect(snapshot.opponentSpiritOnBase).toBe(true);
  });

  it("characterizes the weighted delta for a real transition", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const applied = applyInputsForSearchWithEvents(game, OPENING_MOVE);
    expect(applied).toBeDefined();
    if (applied === undefined) return;

    const before = moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      true,
      true,
      exactSearchStateHash(game),
    );
    const delta = moveEfficiencyDeltaFromBeforeSnapshot(
      game,
      applied.game,
      Color.White,
      applied.events,
      before,
      exactSearchStateHash(applied.game),
      {
        isRoot: true,
        applyBacktrackPenalty: true,
        applyRootManaHandoffGuard: true,
        rootBacktrackPenalty: 120,
        rootManaHandoffPenalty: 80,
        includeTacticalExact: true,
        includeStrategicExact: true,
      },
    );

    expect(delta).toBe(34);
    expect(game.fen()).toBe(new MonsGame(false, GameVariant.Classic).fen());
  });
});
