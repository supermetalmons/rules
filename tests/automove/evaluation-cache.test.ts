import { describe, expect, it, vi } from "vitest";

import { tryLoadPosition } from "../../src/automove/bridge.js";
import * as evaluation from "../../src/automove/evaluation.js";
import {
  DEFAULT_WEIGHTS,
  LEARNED_PRO_WEIGHTS,
  normalizeEvalWeights,
} from "../../src/automove/evaluation-weights.js";
import { FastSearcher } from "../../src/automove/search.js";
import { MAX_NONTERMINAL_SCORE } from "../../src/automove/search-tuning.js";
import { gameFen, parseGameFen } from "../../src/engine/codec/game-board.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";
import { Color } from "../../src/engine/model/domain.js";

const LIMITS = Object.freeze({ maxDepth: 1, maxNodes: 10_000 });
const POTION_WEIGHTS = normalizeEvalWeights({
  ...Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((key) => [key, 0])),
  potion: 1_000_000,
});

function loaded(active: Color, potionOwner: Color): FastSearcher {
  const initial = parseGameFen(new MonsGame(false).fen());
  if (initial === undefined) throw new Error("initial FEN must parse");
  const game = MonsGame.fromFen(
    gameFen({
      ...initial,
      activeColor: active,
      whitePotionsCount: potionOwner === Color.White ? 2_147_483_601 : 0,
      blackPotionsCount: potionOwner === Color.Black ? 2_147_483_601 : 0,
    }),
    false,
  );
  if (game === undefined) throw new Error("large potion count must parse");
  const searcher = new FastSearcher();
  expect(tryLoadPosition(searcher.root, game, 40)).toBe(true);
  return searcher;
}

describe("packed evaluation cache", () => {
  it("preserves Pro half-point scores when reusing cached evaluations", () => {
    const fen =
      "0 3 w 0 0 0 0 0 7 n07e0xn02d0x/n04s0xn06/n11/n01y0xn02xxmn01xxma0xn03/n05xxmn05/xxQn03E0xn01Y0xn01xxmn01xxQ/n05xxMn01xxMS0xn02/n04xxMn01xxMn04/n01xxMn03D0xn05/n11/n04A0xn06";
    const game = MonsGame.fromFen(fen, false);
    if (game === undefined) throw new Error("half-point fixture must parse");
    const searcher = new FastSearcher();
    expect(tryLoadPosition(searcher.root, game, 40)).toBe(true);
    const limits = Object.freeze({ maxDepth: 2, maxNodes: 10_000 });
    const evaluate = vi.spyOn(evaluation, "evaluateWithTables");
    try {
      const first = searcher.search(limits, () => false, LEARNED_PRO_WEIGHTS);
      expect(Number.isInteger(first.score)).toBe(false);
      expect(Number.isInteger(first.score * 2)).toBe(true);
      const misses = evaluate.mock.calls.length;
      expect(misses).toBeGreaterThan(0);
      evaluate.mockClear();

      expect(searcher.search(limits, () => false, LEARNED_PRO_WEIGHTS)).toEqual(first);
      expect(evaluate.mock.calls.length).toBeLessThan(misses);
    } finally {
      evaluate.mockRestore();
    }
  });

  it.each([
    [Color.White, Color.White],
    [Color.White, Color.Black],
    [Color.Black, Color.White],
    [Color.Black, Color.Black],
  ] as const)(
    "preserves saturated scores on cache hits for %s with %s potions",
    (active, owner) => {
      const searcher = loaded(active, owner);
      const evaluate = vi.spyOn(evaluation, "evaluateWithTables");
      try {
        const first = searcher.search(LIMITS, () => false, POTION_WEIGHTS);
        expect(first.supported).toBe(true);
        expect(first.move).not.toBe(0);
        expect(first.score).toBe(
          active === owner ? MAX_NONTERMINAL_SCORE : -MAX_NONTERMINAL_SCORE,
        );
        expect(evaluate).toHaveBeenCalled();
        expect(
          evaluate.mock.results.some(
            (result) =>
              result.type === "return" && Math.abs(result.value) > 0x7fff_ffff,
          ),
        ).toBe(true);
        evaluate.mockClear();

        expect(searcher.search(LIMITS, () => false, POTION_WEIGHTS)).toEqual(first);
        expect(evaluate).not.toHaveBeenCalled();

        const changedWeights = normalizeEvalWeights({
          ...POTION_WEIGHTS,
          potion: -1_000_000,
        });
        const changed = searcher.search(LIMITS, () => false, changedWeights);
        expect(changed.score).toBe(-first.score);
        expect(evaluate).toHaveBeenCalled();
      } finally {
        evaluate.mockRestore();
      }
    },
  );
});
