import { afterEach, describe, expect, it } from "vitest";

import {
  clearMoveEfficiencyCache,
  hasRoundtripMonMove,
  manaHandoffPenalty,
  moveEfficiencyCacheSizeForTesting,
  moveEfficiencyDeltaFromBeforeSnapshot,
  moveEfficiencyDeltaFromBeforeSnapshotWithAfterSnapshot,
  moveEfficiencySnapshotUncachedWithHash,
  moveEfficiencySnapshotWithHash,
  stepProgressDelta,
  type MoveEfficiencySnapshot,
} from "../../src/automove/move-efficiency.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import { exactSearchStateHash } from "../../src/automove/exact.js";
import { hash64FromU32 } from "../../src/automove/hash64.js";
import { GameVariant } from "../../src/engine/config.js";
import {
  Color,
  MonKind,
  SUPERMANA,
  manaItem,
  monItem,
  monWithManaItem,
  type Event,
} from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";

const UNKNOWN_STEPS = 15;

function emptyClassicGame(): MonsGame {
  const game = new MonsGame(false, GameVariant.Classic);
  game.replaceBoardItems([]);
  return game;
}

function neutralSnapshot(
  overrides: Partial<MoveEfficiencySnapshot> = {},
): MoveEfficiencySnapshot {
  return {
    myBestCarrierSteps: UNKNOWN_STEPS,
    opponentBestCarrierSteps: UNKNOWN_STEPS,
    myBestDrainerToManaSteps: UNKNOWN_STEPS,
    opponentBestDrainerToManaSteps: UNKNOWN_STEPS,
    myCarrierCount: 0,
    opponentCarrierCount: 0,
    mySpiritOnBase: false,
    opponentSpiritOnBase: false,
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
    mySafeSupermanaProgressSteps: UNKNOWN_STEPS,
    opponentSafeSupermanaProgressSteps: UNKNOWN_STEPS,
    mySafeOpponentManaProgressSteps: UNKNOWN_STEPS,
    opponentSafeOpponentManaProgressSteps: UNKNOWN_STEPS,
    ...overrides,
  };
}

afterEach(() => {
  clearMoveEfficiencyCache();
  resetDeadlineStateForTesting();
});

describe("move-efficiency snapshots", () => {
  it("builds the complete approximate Rust snapshot", () => {
    const game = emptyClassicGame();
    const carrierAt = { i: 5, j: 5 };
    const freeManaAt = { i: 5, j: 7 };
    const spiritBase = game.board.base({
      kind: MonKind.Spirit,
      color: Color.White,
      cooldown: 0,
    });
    game.board.put(
      monWithManaItem(
        { kind: MonKind.Drainer, color: Color.White, cooldown: 0 },
        SUPERMANA,
      ),
      carrierAt,
    );
    game.board.put(manaItem(SUPERMANA), freeManaAt);
    game.board.put(
      monItem({ kind: MonKind.Spirit, color: Color.White, cooldown: 0 }),
      spiritBase,
    );

    const snapshot = moveEfficiencySnapshotUncachedWithHash(
      game,
      Color.White,
      false,
      false,
      exactSearchStateHash(game),
    );

    expect(snapshot).toEqual({
      myBestCarrierSteps: 5,
      opponentBestCarrierSteps: UNKNOWN_STEPS,
      myBestDrainerToManaSteps: 1,
      opponentBestDrainerToManaSteps: UNKNOWN_STEPS,
      myCarrierCount: 1,
      opponentCarrierCount: 0,
      mySpiritOnBase: true,
      opponentSpiritOnBase: false,
      mySpiritActionTargets: 0,
      opponentSpiritActionTargets: 0,
      mySameTurnScoreValue: 2,
      opponentSameTurnScoreValue: 0,
      mySameTurnOpponentManaScoreValue: 0,
      opponentSameTurnOpponentManaScoreValue: 0,
      mySafeSupermanaProgress: false,
      opponentSafeSupermanaProgress: false,
      mySafeOpponentManaProgress: false,
      opponentSafeOpponentManaProgress: false,
      mySafeSupermanaProgressSteps: UNKNOWN_STEPS,
      opponentSafeSupermanaProgressSteps: UNKNOWN_STEPS,
      mySafeOpponentManaProgressSteps: UNKNOWN_STEPS,
      opponentSafeOpponentManaProgressSteps: UNKNOWN_STEPS,
    });
  });

  it("caches only the cached builder and clears the full table at capacity", () => {
    const game = emptyClassicGame();
    const first = moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      false,
      false,
      hash64FromU32(1),
    );
    expect(first.myCarrierCount).toBe(0);
    expect(moveEfficiencyCacheSizeForTesting()).toBe(1);
    moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      false,
      false,
      hash64FromU32(1),
    );
    expect(moveEfficiencyCacheSizeForTesting()).toBe(1);
    moveEfficiencySnapshotUncachedWithHash(
      game,
      Color.White,
      false,
      false,
      hash64FromU32(1),
    );
    expect(moveEfficiencyCacheSizeForTesting()).toBe(1);

    clearMoveEfficiencyCache();
    for (let index = 0; index < 16_384; index += 1) {
      moveEfficiencySnapshotWithHash(
        game,
        Color.White,
        false,
        false,
        hash64FromU32(index),
      );
    }
    expect(moveEfficiencyCacheSizeForTesting()).toBe(16_384);
    moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      false,
      false,
      hash64FromU32(20_000),
    );
    expect(moveEfficiencyCacheSizeForTesting()).toBe(1);
  });

  it("does not write snapshots after the cooperative deadline expires", () => {
    const game = emptyClassicGame();
    withAutomoveClock({ now: () => 1_000 }, () =>
      withDeadlineIfAbsent(0, () =>
        moveEfficiencySnapshotWithHash(
          game,
          Color.White,
          false,
          false,
          hash64FromU32(7),
        ),
      ),
    );
    expect(moveEfficiencyCacheSizeForTesting()).toBe(0);
  });
});

describe("move-efficiency weighted deltas", () => {
  it("matches the full 22-field Rust weight table", () => {
    const game = emptyClassicGame();
    const before = neutralSnapshot({
      myBestCarrierSteps: 10,
      opponentBestCarrierSteps: 10,
      myBestDrainerToManaSteps: 10,
      opponentBestDrainerToManaSteps: 10,
      myCarrierCount: 1,
      opponentCarrierCount: 1,
      mySpiritOnBase: true,
      opponentSpiritOnBase: false,
      mySpiritActionTargets: 2,
      opponentSpiritActionTargets: 3,
      mySameTurnScoreValue: 1,
      opponentSameTurnScoreValue: 1,
      mySameTurnOpponentManaScoreValue: 0,
      opponentSameTurnOpponentManaScoreValue: 1,
      mySafeSupermanaProgressSteps: 10,
      opponentSafeSupermanaProgressSteps: 10,
      mySafeOpponentManaProgressSteps: 10,
      opponentSafeOpponentManaProgressSteps: 10,
    });
    const after = neutralSnapshot({
      myBestCarrierSteps: 8,
      opponentBestCarrierSteps: 9,
      myBestDrainerToManaSteps: 11,
      opponentBestDrainerToManaSteps: 12,
      myCarrierCount: 2,
      opponentCarrierCount: 0,
      mySpiritOnBase: false,
      opponentSpiritOnBase: true,
      mySpiritActionTargets: 4,
      opponentSpiritActionTargets: 1,
      mySameTurnScoreValue: 2,
      opponentSameTurnScoreValue: 3,
      mySameTurnOpponentManaScoreValue: 2,
      opponentSameTurnOpponentManaScoreValue: 0,
      mySafeSupermanaProgress: true,
      opponentSafeSupermanaProgress: true,
      mySafeOpponentManaProgress: true,
      opponentSafeOpponentManaProgress: true,
      mySafeSupermanaProgressSteps: 8,
      opponentSafeSupermanaProgressSteps: 9,
      mySafeOpponentManaProgressSteps: 11,
      opponentSafeOpponentManaProgressSteps: 12,
    });

    expect(
      moveEfficiencyDeltaFromBeforeSnapshotWithAfterSnapshot(
        game,
        game,
        Color.White,
        [],
        before,
        after,
        {
          isRoot: false,
          applyBacktrackPenalty: false,
          applyRootManaHandoffGuard: false,
          rootBacktrackPenalty: 240,
          rootManaHandoffPenalty: 340,
        },
      ),
    ).toBe(733);
  });

  it("preserves known/unknown step transition weights", () => {
    expect(stepProgressDelta(7, 5, 10, 20)).toBe(20);
    expect(stepProgressDelta(5, 7, 10, 20)).toBe(-40);
    expect(stepProgressDelta(UNKNOWN_STEPS, 7, 10, 20)).toBe(10);
    expect(stepProgressDelta(7, UNKNOWN_STEPS, 10, 20)).toBe(-20);
    expect(stepProgressDelta(UNKNOWN_STEPS, UNKNOWN_STEPS, 10, 20)).toBe(0);
  });

  it("applies root no-effect, handoff, low-impact, and backtrack guards", () => {
    const beforeGame = emptyClassicGame();
    const changedGame = beforeGame.clone();
    changedGame.board.put(
      monItem({ kind: MonKind.Angel, color: Color.White, cooldown: 0 }),
      { i: 5, j: 5 },
    );
    const snapshot = neutralSnapshot();
    expect(
      moveEfficiencyDeltaFromBeforeSnapshotWithAfterSnapshot(
        beforeGame,
        beforeGame,
        Color.White,
        [],
        snapshot,
        snapshot,
        {
          isRoot: true,
          applyBacktrackPenalty: true,
          applyRootManaHandoffGuard: true,
          rootBacktrackPenalty: 240,
          rootManaHandoffPenalty: 340,
        },
      ),
    ).toBe(-120);

    const handoff: Event = {
      kind: "mana-move",
      mana: SUPERMANA,
      from: { i: 5, j: 5 },
      to: { i: 4, j: 4 },
    };
    expect(manaHandoffPenalty([handoff], Color.White, 340)).toBe(680);
    expect(manaHandoffPenalty([handoff], Color.White, 0)).toBe(0);
    expect(
      moveEfficiencyDeltaFromBeforeSnapshotWithAfterSnapshot(
        beforeGame,
        changedGame,
        Color.White,
        [handoff],
        snapshot,
        snapshot,
        {
          isRoot: true,
          applyBacktrackPenalty: true,
          applyRootManaHandoffGuard: true,
          rootBacktrackPenalty: 240,
          rootManaHandoffPenalty: 340,
        },
      ),
    ).toBe(-720);

    const mover = monItem({
      kind: MonKind.Angel,
      color: Color.White,
      cooldown: 0,
    });
    const roundtrip: readonly Event[] = [
      {
        kind: "mon-move",
        item: mover,
        from: { i: 5, j: 5 },
        to: { i: 5, j: 6 },
      },
      {
        kind: "mon-move",
        item: mover,
        from: { i: 5, j: 6 },
        to: { i: 5, j: 5 },
      },
    ];
    expect(hasRoundtripMonMove(roundtrip)).toBe(true);
    expect(
      moveEfficiencyDeltaFromBeforeSnapshotWithAfterSnapshot(
        beforeGame,
        changedGame,
        Color.White,
        roundtrip,
        snapshot,
        snapshot,
        {
          isRoot: true,
          applyBacktrackPenalty: true,
          applyRootManaHandoffGuard: false,
          rootBacktrackPenalty: 240,
          rootManaHandoffPenalty: 340,
        },
      ),
    ).toBe(-280);
  });

  it("allows the legacy child before-perspective/after-actor mismatch", () => {
    const game = emptyClassicGame();
    game.activeColor = Color.Black;
    game.board.put(
      monWithManaItem(
        { kind: MonKind.Angel, color: Color.White, cooldown: 0 },
        SUPERMANA,
      ),
      { i: 9, j: 1 },
    );
    const hash = exactSearchStateHash(game);
    const before = moveEfficiencySnapshotWithHash(
      game,
      Color.White,
      false,
      false,
      hash,
    );

    expect(
      moveEfficiencyDeltaFromBeforeSnapshot(
        game,
        game,
        Color.Black,
        [],
        before,
        hash,
        {
          isRoot: false,
          applyBacktrackPenalty: false,
          applyRootManaHandoffGuard: false,
          includeTacticalExact: false,
          includeStrategicExact: false,
          rootBacktrackPenalty: 240,
          rootManaHandoffPenalty: 340,
        },
      ),
    ).toBe(-313);
  });
});
