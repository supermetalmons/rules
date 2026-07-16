import { afterEach, describe, expect, it, vi } from "vitest";

import { Board } from "../../src/engine/board.js";
import {
  ALL_GAME_VARIANTS,
  GameVariant,
  MONS_MOVES_PER_TURN,
  TARGET_SCORE,
} from "../../src/engine/config.js";
import {
  Color,
  MonKind,
  createMon,
  manaItem,
  monItem,
} from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  BOARD_CELLS,
  location,
  nearbyLocations,
} from "../../src/engine/geometry.js";
import {
  EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS,
  EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
  EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL,
  EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE,
  EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS,
  canAttackTargetOnBoard,
  clearExactStateAnalysisCache,
  drainerImmediateThreats,
  exactBoardHash,
  exactFnv1a64,
  exactSearchStateHash,
  exactSecureSpecificManaPathFrom,
  exactSecureSpecificManaStepsOnBoard,
  exactStrategicAnalysis,
  exactTurnSummary,
  exactTurnTacticalProjectionWithSearchHash,
} from "../../src/automove/exact.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import {
  hash64Equals,
  hash64ToBigIntForTesting,
  type Hash64,
} from "../../src/automove/hash64.js";

const BOARD_HASHES = [
  0x3a65_8e92_097a_e0e9n,
  0x20d2_3924_4b39_c065n,
  0x5d43_8698_71e4_be05n,
  0x1daf_15fb_8b89_2efdn,
  0xfaca_03e0_2be9_35a4n,
  0x7e00_0938_54a5_27c4n,
  0x3107_367b_74d6_a02an,
  0xc06c_6d0d_b2dc_5180n,
  0xc0c0_511e_d227_c14dn,
  0x41d0_f392_438d_aaecn,
  0xc498_17af_ed93_ad8dn,
  0x509d_e517_dbc0_6bf8n,
] as const;

const SEARCH_HASHES = [
  0xf20a_270f_67c2_e29cn,
  0x4af4_4591_32d3_3761n,
  0xd4a7_b350_deef_be56n,
  0xecef_d13d_b7c5_e175n,
  0x3444_e94a_1d24_0851n,
  0x2bf5_e09d_0ccb_28ccn,
  0x9f35_eebc_fc9f_0712n,
  0x6db4_42cd_4b38_a0b2n,
  0x5276_2fa3_d360_0f91n,
  0x08be_9af0_52c7_e4d4n,
  0xd643_7b2d_dd3a_0817n,
  0x307c_cbdd_aeda_3998n,
] as const;

function sparseSpiritGame(spiritAt = location(7, 0)): MonsGame {
  const game = MonsGame.new(false, GameVariant.Classic);
  game.replaceBoardItems([
    [spiritAt, monItem(createMon(MonKind.Spirit, Color.White, 0))],
    [location(9, 0), manaItem({ kind: "supermana" })],
    [location(9, 1), manaItem({ kind: "regular", color: Color.Black })],
  ]);
  game.turnNumber = 2;
  return game;
}

afterEach(() => {
  vi.restoreAllMocks();
  resetDeadlineStateForTesting();
  clearExactStateAnalysisCache();
});

describe("exact Rust-oracle hashes", () => {
  it("matches FNV-1a byte order and all initial variant state hashes", () => {
    expect(exactFnv1a64(new TextEncoder().encode("hello"))).toBe(
      0xa430_d846_80aa_bd0bn,
    );
    expect(ALL_GAME_VARIANTS).toHaveLength(12);
    for (const [index, variant] of ALL_GAME_VARIANTS.entries()) {
      const game = MonsGame.new(false, variant);
      expect(
        hash64ToBigIntForTesting(exactBoardHash(game.board)),
        `board variant ${index}`,
      ).toBe(BOARD_HASHES[index]);
      expect(
        hash64ToBigIntForTesting(exactSearchStateHash(game)),
        `search variant ${index}`,
      ).toBe(SEARCH_HASHES[index]);
    }
  });

  it("includes game counters in search hashes without changing board hashes", () => {
    const game = MonsGame.new(false, GameVariant.Classic);
    const boardHash = exactBoardHash(game.board);
    const stateHash = exactSearchStateHash(game);
    game.whiteScore = -1;
    game.actionsUsedCount = 0x7fff_ffff;
    expect(hash64Equals(exactBoardHash(game.board), boardHash)).toBe(true);
    expect(hash64Equals(exactSearchStateHash(game), stateHash)).toBe(false);
  });

  it("retains legacy Number conversion for unusual game counters", () => {
    const counterFields = [
      "whiteScore",
      "blackScore",
      "actionsUsedCount",
      "manaMovesCount",
      "monsMovesCount",
      "whitePotionsCount",
      "blackPotionsCount",
      "turnNumber",
    ] as const;

    for (const field of counterFields) {
      const game = MonsGame.new(false, GameVariant.Classic);
      game[field] = 0;
      const zeroHash = exactSearchStateHash(game);

      game[field] = 0x1_0000_0000;
      expect(hash64Equals(exactSearchStateHash(game), zeroHash), field).toBe(
        false,
      );

      game[field] = -0x1_0000_0000;
      expect(hash64Equals(exactSearchStateHash(game), zeroHash), field).toBe(
        false,
      );
    }
  });

  it("rejects malformed game counters instead of silently coercing them", () => {
    for (const value of [
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -Infinity,
    ]) {
      const game = MonsGame.new(false, GameVariant.Classic);
      game.whiteScore = value;
      expect(() => exactSearchStateHash(game)).toThrow(RangeError);
    }
  });
});

describe("exact strategic analysis", () => {
  it("matches initial Rust summaries for every layout", () => {
    const bestSteps = [7, 6, 7, 8, 8, 7, 7, 8, 8, 7, 7, 7] as const;
    const drainerToMana = [3, 3, 3, 3, 4, 3, 3, 3, 4, 3, 3, 3] as const;
    const blackSpiritUtility = [6, 6, 6, 6, 6, 6, 6, 6, 5, 6, 6, 6] as const;
    for (const [index, variant] of ALL_GAME_VARIANTS.entries()) {
      const analysis = exactStrategicAnalysis(MonsGame.new(false, variant));
      expect(analysis.white.scorePathWindow.bestSteps).toBe(bestSteps[index]);
      expect(analysis.black.scorePathWindow.bestSteps).toBe(bestSteps[index]);
      expect(analysis.white.bestDrainerToManaSteps).toBe(drainerToMana[index]);
      expect(analysis.black.bestDrainerToManaSteps).toBe(drainerToMana[index]);
      expect(analysis.white.immediateWindow.bestScore).toBe(0);
      expect(analysis.white.spirit.utility).toBe(0);
      expect(analysis.black.spirit.utility).toBe(blackSpiritUtility[index]);
      expect(analysis.black.spirit.supermanaProgress).toBe(true);
      expect(analysis.black.spirit.opponentManaProgress).toBe(true);
    }
  });

  it("matches initial turn and all-axis projection observations", () => {
    const game = MonsGame.new(false, GameVariant.Classic);
    expect(exactTurnSummary(game, Color.White)).toEqual({
      canAttackOpponentDrainer: false,
      safeSupermanaProgress: false,
      safeSupermanaProgressSteps: undefined,
      safeOpponentManaProgress: false,
      safeOpponentManaProgressSteps: undefined,
      spiritAssistedSupermanaProgress: false,
      spiritAssistedOpponentManaProgress: false,
      spiritAssistedScore: false,
      spiritAssistedDenial: false,
      sameTurnScoreWindowValue: 0,
      scorePathBestSteps: 7,
    });
    const flags =
      EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS |
      EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS |
      EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE |
      EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL |
      EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW;
    expect(
      exactTurnTacticalProjectionWithSearchHash(
        game,
        Color.White,
        exactSearchStateHash(game),
        flags,
      ),
    ).toEqual({
      safeSupermanaProgress: false,
      safeSupermanaProgressSteps: undefined,
      safeOpponentManaProgress: false,
      safeOpponentManaProgressSteps: undefined,
      spiritAssistedScore: false,
      spiritAssistedScoreValue: 0,
      spiritAssistedDenial: false,
      spiritAssistedDenialValue: 0,
      sameTurnScoreWindowValue: 0,
    });
  });

  it("does not poison caches when cooperative cancellation fires", () => {
    const game = MonsGame.new(false, GameVariant.Classic);
    const cancelled = withAutomoveClock({ now: () => 100 }, () =>
      withDeadlineIfAbsent(0, () => exactStrategicAnalysis(game)),
    );
    expect(cancelled).toEqual(
      expect.objectContaining({
        white: expect.objectContaining({
          scorePathWindow: { bestSteps: undefined, multiPressure: 0 },
        }),
      }),
    );
    expect(exactStrategicAnalysis(game).white.scorePathWindow.bestSteps).toBe(
      7,
    );
  });

  it("saturates every tactical Spirit axis without mutating a sparse game", () => {
    const game = sparseSpiritGame();
    game.monsMovesCount = 5;
    const fenBefore = game.fen();

    expect(exactTurnSummary(game, Color.White)).toEqual(
      expect.objectContaining({
        spiritAssistedSupermanaProgress: true,
        spiritAssistedOpponentManaProgress: true,
        spiritAssistedScore: true,
        spiritAssistedDenial: true,
        sameTurnScoreWindowValue: 2,
      }),
    );
    expect(game.fen()).toBe(fenBefore);
  });

  it("reuses one action-board clone for stationary Spirit previews", () => {
    const game = sparseSpiritGame();
    game.monsMovesCount = MONS_MOVES_PER_TURN;
    const fenBefore = game.fen();
    const cloneSpy = vi.spyOn(Board.prototype, "clone");
    const flags =
      EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE |
      EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL;

    expect(
      exactTurnTacticalProjectionWithSearchHash(
        game,
        Color.White,
        exactSearchStateHash(game),
        flags,
      ),
    ).toEqual(
      expect.objectContaining({
        spiritAssistedScore: true,
        spiritAssistedDenial: true,
      }),
    );
    expect(cloneSpy).toHaveBeenCalledTimes(1);
    expect(game.fen()).toBe(fenBefore);
  });

  it("restores an in-place Spirit preview when its deadline expires", () => {
    const game = sparseSpiritGame();
    game.monsMovesCount = MONS_MOVES_PER_TURN;
    const fenBefore = game.fen();
    const captured: { board: Board; hash: Hash64 }[] = [];
    const originalClone = Object.getOwnPropertyDescriptor(
      Board.prototype,
      "clone",
    )?.value as (this: Board) => Board;
    vi.spyOn(Board.prototype, "clone").mockImplementation(function (
      this: Board,
    ) {
      const clone = originalClone.call(this);
      captured.push({ board: clone, hash: exactBoardHash(clone) });
      return clone;
    });
    const flags =
      EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE |
      EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL;

    const cancelled = withAutomoveClock(
      {
        now: () =>
          captured.some(
            ({ board, hash }) => !hash64Equals(exactBoardHash(board), hash),
          )
            ? 100
            : 0,
      },
      () =>
        withDeadlineIfAbsent(50, () =>
          exactTurnTacticalProjectionWithSearchHash(
            game,
            Color.White,
            exactSearchStateHash(game),
            flags,
          ),
        ),
    );

    expect(cancelled.spiritAssistedScore).toBe(false);
    expect(cancelled.spiritAssistedDenial).toBe(false);
    expect(captured).toHaveLength(1);
    expect(
      hash64Equals(
        exactBoardHash(captured[0]?.board ?? game.board),
        captured[0]?.hash ?? exactBoardHash(game.board),
      ),
    ).toBe(true);
    expect(game.fen()).toBe(fenBefore);
  });

  it("derives masked Spirit fields from cache and clears that cache", () => {
    const game = sparseSpiritGame();
    game.monsMovesCount = 5;
    exactTurnSummary(game, Color.White);
    const cloneSpy = vi.spyOn(Board.prototype, "clone");
    const flags = EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE;

    const derived = exactTurnTacticalProjectionWithSearchHash(
      game,
      Color.White,
      exactSearchStateHash(game),
      flags,
    );
    expect(derived).toEqual(
      expect.objectContaining({
        spiritAssistedScore: true,
        spiritAssistedScoreValue: 2,
        spiritAssistedDenial: false,
        spiritAssistedDenialValue: 0,
      }),
    );
    expect(cloneSpy).not.toHaveBeenCalled();

    clearExactStateAnalysisCache();
    cloneSpy.mockClear();
    expect(
      exactTurnTacticalProjectionWithSearchHash(
        game,
        Color.White,
        exactSearchStateHash(game),
        flags,
      ).spiritAssistedScoreValue,
    ).toBe(2);
    expect(cloneSpy).toHaveBeenCalled();
  });

  it("retries tactical Spirit reachability after mid-BFS cancellation", () => {
    const game = sparseSpiritGame(location(5, 3));
    const fenBefore = game.fen();
    let clockReads = 0;
    const cancelled = withAutomoveClock(
      { now: () => (clockReads++ < 15 ? 0 : 100) },
      () => withDeadlineIfAbsent(50, () => exactTurnSummary(game, Color.White)),
    );

    expect(cancelled.spiritAssistedScore).toBe(false);
    expect(cancelled.spiritAssistedDenial).toBe(false);
    expect(exactTurnSummary(game, Color.White)).toEqual(
      expect.objectContaining({
        spiritAssistedSupermanaProgress: true,
        spiritAssistedOpponentManaProgress: true,
        spiritAssistedScore: true,
        spiritAssistedDenial: true,
      }),
    );
    expect(game.fen()).toBe(fenBefore);
  });
});

describe("exact reachability and secure paths", () => {
  it("matches guarded and unguarded Mystic attack observations", () => {
    const board = Board.fromItems(
      Array.from({ length: BOARD_CELLS }, () => undefined),
      GameVariant.Classic,
    );
    const target = location(5, 5);
    board.put(monItem(createMon(MonKind.Drainer, Color.Black, 0)), target);
    board.put(
      monItem(createMon(MonKind.Mystic, Color.White, 0)),
      location(3, 3),
    );
    expect(
      canAttackTargetOnBoard(board, Color.White, Color.Black, target, 0, true),
    ).toBe(true);
    expect(drainerImmediateThreats(board, Color.Black, target)).toEqual([1, 0]);
    board.put(
      monItem(createMon(MonKind.Angel, Color.Black, 0)),
      location(5, 4),
    );
    expect(
      canAttackTargetOnBoard(board, Color.White, Color.Black, target, 0, true),
    ).toBe(false);
  });

  it("returns a fresh secure path without mutating its source game", () => {
    const game = MonsGame.new(false, GameVariant.Classic);
    game.replaceBoardItems([
      [location(5, 4), monItem(createMon(MonKind.Drainer, Color.White, 0))],
      [location(5, 5), manaItem({ kind: "supermana" })],
    ]);
    game.turnNumber = 2;
    const fenBefore = game.fen();
    const first = exactSecureSpecificManaPathFrom(
      game,
      Color.White,
      location(5, 4),
      { kind: "supermana" },
    );
    const second = exactSecureSpecificManaPathFrom(
      game,
      Color.White,
      location(5, 4),
      { kind: "supermana" },
    );
    expect(first).toEqual([location(5, 5)]);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(game.fen()).toBe(fenBefore);
  });

  it("memoizes converging secure-mana states and reconstructs one legal shortest path", () => {
    const game = MonsGame.new(false, GameVariant.Classic);
    const start = location(2, 2);
    const wanted = { kind: "supermana" } as const;
    game.replaceBoardItems([
      [start, monItem(createMon(MonKind.Drainer, Color.White, 0))],
      [location(7, 5), manaItem(wanted)],
    ]);
    game.turnNumber = 2;
    game.monsMovesCount = MONS_MOVES_PER_TURN - 5;
    const fenBefore = game.fen();
    const processInputSpy = vi.spyOn(MonsGame.prototype, "processInput");

    expect(
      exactSecureSpecificManaStepsOnBoard(game.board, Color.White, wanted, 5),
    ).toBe(5);
    const callsAfterSearch = processInputSpy.mock.calls.length;
    expect(callsAfterSearch).toBeGreaterThan(0);
    expect(callsAfterSearch).toBeLessThan(80);
    expect(
      exactSecureSpecificManaStepsOnBoard(game.board, Color.White, wanted, 5),
    ).toBe(5);
    expect(processInputSpy).toHaveBeenCalledTimes(callsAfterSearch);

    const path = exactSecureSpecificManaPathFrom(
      game,
      Color.White,
      start,
      wanted,
    );
    expect(path).toEqual([
      location(3, 1),
      location(4, 2),
      location(5, 3),
      location(6, 4),
      location(7, 5),
    ]);
    expect(
      exactSecureSpecificManaPathFrom(game, Color.White, start, wanted),
    ).toEqual(path);
    const replay = game.cloneForSimulation();
    let current = start;
    for (const next of path ?? []) {
      const output = replay.processInput(
        [
          { kind: "location", location: current },
          { kind: "location", location: next },
        ],
        false,
        false,
      );
      expect(output.kind).toBe("events");
      current = next;
    }
    expect(game.fen()).toBe(fenBefore);
  });

  it("memoizes completed no-path states but retries a cancelled search", () => {
    const wanted = { kind: "supermana" } as const;
    const blocked = MonsGame.new(false, GameVariant.Classic);
    const blockedStart = location(5, 5);
    blocked.replaceBoardItems([
      [blockedStart, monItem(createMon(MonKind.Drainer, Color.White, 0))],
      [location(5, 7), manaItem(wanted)],
      ...nearbyLocations(blockedStart).map(
        (neighbor) =>
          [
            neighbor,
            monItem(createMon(MonKind.Angel, Color.White, 0)),
          ] as const,
      ),
    ]);
    blocked.turnNumber = 2;
    const processInputSpy = vi.spyOn(MonsGame.prototype, "processInput");
    expect(
      exactSecureSpecificManaStepsOnBoard(
        blocked.board,
        Color.White,
        wanted,
        2,
      ),
    ).toBeUndefined();
    const noPathCalls = processInputSpy.mock.calls.length;
    expect(noPathCalls).toBeGreaterThan(0);
    expect(
      exactSecureSpecificManaStepsOnBoard(
        blocked.board,
        Color.White,
        wanted,
        2,
      ),
    ).toBeUndefined();
    expect(processInputSpy).toHaveBeenCalledTimes(noPathCalls);

    clearExactStateAnalysisCache();
    processInputSpy.mockClear();
    const branching = MonsGame.new(false, GameVariant.Classic);
    branching.replaceBoardItems([
      [location(2, 2), monItem(createMon(MonKind.Drainer, Color.White, 0))],
      [location(7, 5), manaItem(wanted)],
    ]);
    branching.turnNumber = 2;
    let clockReads = 0;
    const cancelled = withAutomoveClock(
      { now: () => (processInputSpy.mock.calls.length < 10 ? 0 : 100) },
      () =>
        withDeadlineIfAbsent(50, () => {
          clockReads += 1;
          return exactSecureSpecificManaStepsOnBoard(
            branching.board,
            Color.White,
            wanted,
            5,
          );
        }),
    );
    expect(clockReads).toBe(1);
    expect(cancelled).toBeUndefined();
    const cancelledCalls = processInputSpy.mock.calls.length;
    expect(cancelledCalls).toBeGreaterThanOrEqual(10);
    expect(
      exactSecureSpecificManaStepsOnBoard(
        branching.board,
        Color.White,
        wanted,
        5,
      ),
    ).toBe(5);
    expect(processInputSpy.mock.calls.length).toBeGreaterThan(cancelledCalls);
  });

  it("keeps terminal scores isolated in the secure-mana memo in both call orders", () => {
    const start = location(5, 4);
    const wanted = { kind: "supermana" } as const;
    const makeGame = (whiteScore: number): MonsGame => {
      const game = MonsGame.new(false, GameVariant.Classic);
      game.replaceBoardItems([
        [start, monItem(createMon(MonKind.Drainer, Color.White, 0))],
        [location(5, 5), manaItem(wanted)],
      ]);
      game.turnNumber = 2;
      game.whiteScore = whiteScore;
      return game;
    };
    const winning = makeGame(TARGET_SCORE);
    const live = makeGame(0);

    expect(
      exactSecureSpecificManaPathFrom(winning, Color.White, start, wanted),
    ).toBeUndefined();
    expect(
      exactSecureSpecificManaPathFrom(live, Color.White, start, wanted),
    ).toEqual([location(5, 5)]);

    clearExactStateAnalysisCache();
    expect(
      exactSecureSpecificManaPathFrom(live, Color.White, start, wanted),
    ).toEqual([location(5, 5)]);
    expect(
      exactSecureSpecificManaPathFrom(winning, Color.White, start, wanted),
    ).toBeUndefined();
  });
});
