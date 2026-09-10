import { describe, expect, it, vi } from "vitest";

import { moveToInputs, tryLoadPosition } from "../../src/automove/bridge.js";
import {
  DEFAULT_WEIGHTS,
  LEARNED_PRO_WEIGHTS,
  NORMAL_WEIGHTS,
} from "../../src/automove/evaluation-weights.js";
import { WIN_VALUE } from "../../src/automove/evaluation.js";
import { FastSearcher, orderMoves } from "../../src/automove/search.js";
import {
  DEFAULT_TUNING,
  MAX_SEARCH_DEPTH,
  memoizedSearchLimits,
  normalizeSearchLimits,
} from "../../src/automove/search-tuning.js";
import {
  AUX_NONE,
  FastPosition,
  MOD_NONE,
  MOVE_MANA,
  MOVE_MON,
  encodeMove,
} from "../../src/automove/state.js";
import {
  FAST_SEARCH_TUNING,
  PACKED_SELECTION_PROFILES,
  PRO_SEARCH_TUNING,
  STRATEGIC_SEARCH_TUNING,
} from "../../src/automove/selector.js";
import { GameVariant } from "../../src/engine/board/config.js";
import { BOARD_CELLS } from "../../src/engine/board/geometry.js";
import { inputArrayFen } from "../../src/engine/codec/input.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";

const BOMB_DEMON_FEN =
  "0 0 b 0 1 5 0 0 2 y0xn10/n11/n02S0xn08/n11/n11/n02A0xE0xn01d0Bn05/n11/n11/n11/n11/n11";
const VERIFIED_CHALLENGER_FEN =
  "0 3 w 0 0 0 0 0 7 n07e0xn02d0x/n04s0xn06/n11/n01y0xn02xxmn01xxma0xn03/n05xxmn05/xxQn03E0xn01Y0xn01xxmn01xxQ/n05xxMn01xxMS0xn02/n04xxMn01xxMn04/n01xxMn03D0xn05/n11/n04A0xn06";

function loadedSearcher(game = new MonsGame(true, GameVariant.Classic)): FastSearcher {
  const searcher = new FastSearcher();
  expect(tryLoadPosition(searcher.root, game, 40)).toBe(true);
  return searcher;
}

describe("packed automove search", () => {
  it("keeps the audited budgets, node ceilings, and tuning", () => {
    expect(PACKED_SELECTION_PROFILES).toEqual({
      fast: {
        budgetMs: 50,
        weights: DEFAULT_WEIGHTS,
        limits: {
          maxDepth: 40,
          maxNodes: 39_936,
          tuning: FAST_SEARCH_TUNING,
        },
      },
      normal: {
        budgetMs: 150,
        weights: NORMAL_WEIGHTS,
        limits: {
          maxDepth: 40,
          maxNodes: 184_000,
          tuning: STRATEGIC_SEARCH_TUNING,
        },
      },
      pro: {
        budgetMs: 650,
        weights: LEARNED_PRO_WEIGHTS,
        limits: {
          maxDepth: 40,
          maxNodes: 2_000_000,
          tuning: PRO_SEARCH_TUNING,
        },
      },
    });
    expect(Object.isFrozen(PACKED_SELECTION_PROFILES)).toBe(true);
    expect(
      Object.values(PACKED_SELECTION_PROFILES).every(
        (profile) => Object.isFrozen(profile) && Object.isFrozen(profile.limits),
      ),
    ).toBe(true);
    expect([
      FAST_SEARCH_TUNING.winsNextTurnThreat,
      STRATEGIC_SEARCH_TUNING.winsNextTurnThreat,
      PRO_SEARCH_TUNING.winsNextTurnThreat,
    ]).toEqual([2_500, 0, 0]);
  });

  it("selects a legal root move at each fixed node ceiling", () => {
    for (const preference of ["fast", "normal", "pro"] as const) {
      const game = new MonsGame(true, GameVariant.Classic);
      const searcher = loadedSearcher(game);
      const outcome = searcher.search(
        PACKED_SELECTION_PROFILES[preference].limits,
        () => false,
        PACKED_SELECTION_PROFILES[preference].weights,
      );
      expect(outcome.supported, preference).toBe(true);
      expect(outcome.move, preference).not.toBe(0);
      expect(outcome.nodes, preference).toBe(
        PACKED_SELECTION_PROFILES[preference].limits.maxNodes,
      );
      expect(Number.isSafeInteger(outcome.score * 2), preference).toBe(true);
      expect(Math.abs(outcome.score * 2), preference).toBeLessThanOrEqual(
        WIN_VALUE * 2,
      );
      expect(
        game.fork().processInput(moveToInputs(outcome.move), false, false).kind,
        preference,
      ).toBe("events");
    }
  }, 60_000);

  it("round-trips positive and negative half scores through Int32 TT units", () => {
    const scores = [-999_999.5, -0.5, 0, 0.5, 999_999.5];
    const stored = Int32Array.from(scores, (score) => score * 2);
    expect(Array.from(stored, (score) => score / 2)).toEqual(scores);
    expect(scores.every((score) => Number.isSafeInteger(score * 2))).toBe(true);
    expect(Math.max(...Array.from(stored, Math.abs))).toBeLessThanOrEqual(
      WIN_VALUE * 2,
    );
  });

  it("checks the cooperative timeout every 2,048 nodes", () => {
    const game = new MonsGame(true, GameVariant.Classic);
    const searcher = loadedSearcher(game);
    searcher.search({ maxDepth: 2, maxNodes: 100_000 }, () => false);

    let checks = 0;
    const outcome = searcher.search({ maxDepth: 40, maxNodes: 100_000 }, () => {
      checks += 1;
      return checks === 3;
    });

    expect(checks).toBe(3);
    expect(outcome.nodes).toBe(3 * 2_048);
    expect(outcome.move).not.toBe(0);
    expect(
      game.fork().processInput(moveToInputs(outcome.move), false, false).kind,
    ).toBe("events");
  });

  it("reuses prepared children across PVS and LMR re-searches", () => {
    const searcher = loadedSearcher();
    const copyFrom = vi.spyOn(FastPosition.prototype, "copyFrom");
    try {
      const outcome = searcher.search(
        {
          maxDepth: 4,
          maxNodes: 1_000_000,
          tuning: {
            ...DEFAULT_TUNING,
            aspirationDelta: 0,
            lateMoveReduction: true,
            lateMoveIndex: 1,
            lateMoveDeepIndex: 2,
          },
        },
        () => false,
      );

      expect(outcome).toEqual({
        move: 16_752_536,
        score: 3_188,
        depth: 4,
        nodes: 1_261,
        supported: true,
      });
      expect(copyFrom).toHaveBeenCalledTimes(634);
    } finally {
      copyFrom.mockRestore();
    }
  });

  it("compacts mixed commuting moves without changing retained tie order", () => {
    const previous = encodeMove(MOVE_MON, 8, 9, AUX_NONE, MOD_NONE);
    const discarded = encodeMove(MOVE_MON, 1, 2, AUX_NONE, MOD_NONE);
    const overlapping = encodeMove(MOVE_MON, 8, 3, AUX_NONE, MOD_NONE);
    const mana = encodeMove(MOVE_MANA, 4, 5, AUX_NONE, MOD_NONE);
    const later = encodeMove(MOVE_MON, 10, 11, AUX_NONE, MOD_NONE);
    const buffer = Int32Array.from([discarded, overlapping, mana, later]);
    const keys = Int32Array.from([99, 7, 7, 7]);

    const count = orderMoves(
      buffer,
      keys,
      buffer.length,
      previous,
      0,
      0,
      0,
      new Int32Array(BOARD_CELLS * BOARD_CELLS),
      0,
    );

    expect(count).toBe(3);
    expect([...buffer.subarray(0, count)]).toEqual([overlapping, mana, later]);
    expect([...keys.subarray(0, count)]).toEqual([7, 7, 7]);
  });

  it("preselects the stable top two moves", () => {
    const first = encodeMove(MOVE_MON, 1, 2, AUX_NONE, MOD_NONE);
    const second = encodeMove(MOVE_MON, 3, 4, AUX_NONE, MOD_NONE);
    const third = encodeMove(MOVE_MON, 5, 6, AUX_NONE, MOD_NONE);
    const fourth = encodeMove(MOVE_MON, 7, 8, AUX_NONE, MOD_NONE);
    const buffer = Int32Array.from([first, second, third, fourth]);
    const keys = Int32Array.from([10, 30, 30, 20]);

    const count = orderMoves(
      buffer,
      keys,
      buffer.length,
      0,
      0,
      0,
      0,
      new Int32Array(BOARD_CELLS * BOARD_CELLS),
      0,
    );

    expect(count).toBe(4);
    expect([...buffer]).toEqual([second, third, first, fourth]);
    expect([...keys]).toEqual([30, 30, 10, 20]);
  });

  it("falls back to the full ordered list when every commuting move is filtered", () => {
    const previous = encodeMove(MOVE_MON, 20, 21, AUX_NONE, MOD_NONE);
    const first = encodeMove(MOVE_MON, 1, 2, AUX_NONE, MOD_NONE);
    const second = encodeMove(MOVE_MON, 3, 4, AUX_NONE, MOD_NONE);
    const buffer = Int32Array.from([first, second]);
    const keys = Int32Array.from([5, 5]);
    const history = new Int32Array(BOARD_CELLS * BOARD_CELLS);
    history[1 * BOARD_CELLS + 2] = 11;
    history[3 * BOARD_CELLS + 4] = 22;

    const count = orderMoves(
      buffer,
      keys,
      buffer.length,
      previous,
      0,
      0,
      0,
      history,
      0,
    );

    expect(count).toBe(2);
    expect([...buffer]).toEqual([second, first]);
    expect([...keys]).toEqual([27, 16]);
  });

  it("adopts a fully verified Pro challenger when the next root move hits the cap", () => {
    const game = MonsGame.fromFen(VERIFIED_CHALLENGER_FEN, false);
    expect(game).toBeDefined();
    if (game === undefined) return;

    const profile = PACKED_SELECTION_PROFILES.pro;
    const outcome = loadedSearcher(game).search(
      profile.limits,
      () => false,
      profile.weights,
    );

    expect(outcome).toEqual({
      move: 16_730_856,
      score: -14_631.5,
      depth: 7,
      nodes: 2_000_000,
      supported: true,
    });
    expect(inputArrayFen(moveToInputs(outcome.move))).toBe("l8,5;l7,5");
    expect(
      game.fork().processInput(moveToInputs(outcome.move), false, false).kind,
    ).toBe("events");
  }, 15_000);

  it("keeps bomb-fainted Demon replies representable", () => {
    const game = MonsGame.fromFen(BOMB_DEMON_FEN, false);
    expect(game).toBeDefined();
    if (game === undefined) return;
    const outcome = loadedSearcher(game).search(
      PACKED_SELECTION_PROFILES.pro.limits,
      () => false,
    );

    expect(outcome.supported).toBe(true);
    expect(outcome.move).not.toBe(0);
    expect(outcome.depth).toBeGreaterThan(0);
    expect(inputArrayFen(moveToInputs(outcome.move))).toBe("l0,0;l2,2");
    expect(
      game.fork().processInput(moveToInputs(outcome.move), false, false).kind,
    ).toBe("events");
  }, 15_000);

  it("normalizes limits without changing frozen profiles", () => {
    const limits = PACKED_SELECTION_PROFILES.fast.limits;
    const first = memoizedSearchLimits(limits);
    expect(memoizedSearchLimits(limits)).toBe(first);
    expect(first).toEqual(limits);
    expect(normalizeSearchLimits({ maxDepth: 0, maxNodes: 0 })).toEqual({
      maxDepth: 0,
      maxNodes: 0,
      tuning: DEFAULT_TUNING,
    });
  });

  it.each([
    [null, TypeError],
    [{ maxDepth: -1, maxNodes: 1 }, RangeError],
    [{ maxDepth: MAX_SEARCH_DEPTH + 1, maxNodes: 1 }, RangeError],
    [{ maxDepth: 1, maxNodes: -1 }, RangeError],
    [{ maxDepth: 1, maxNodes: 1, tuning: {} }, TypeError],
  ])("rejects invalid search limits %#", (limits, error) => {
    expect(() => normalizeSearchLimits(limits)).toThrow(error);
  });
});
