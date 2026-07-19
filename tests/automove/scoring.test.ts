import { describe, expect, it } from "vitest";

import {
  Color,
  Consumable,
  MonKind,
  SUPERMANA,
  consumableItem,
  createMon,
  monItem,
  monWithManaItem,
  monWithConsumableItem,
  type Item,
} from "../../src/engine/domain.js";
import { GameVariant } from "../../src/engine/config.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  BALANCED_DISTANCE_SCORING_WEIGHTS,
  DEFAULT_SCORING_WEIGHTS,
  RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
  ScoringEvalContext,
  evaluatePreferabilityWithContext,
  evaluatePreferabilityWithWeightsAndExactPolicy,
  type ScoringWeights,
} from "../../src/automove/scoring.js";

const SPIRIT_UTILITY_POINTS = 37;
const SPIRIT_UTILITY_WEIGHTS = {
  ...DEFAULT_SCORING_WEIGHTS,
  faintedMon: 0,
  faintedCooldownStep: 0,
  monCloseToCenter: 0,
  spiritCloseToEnemy: 0,
  activeMon: 0,
  spiritActionUtility: SPIRIT_UTILITY_POINTS,
} satisfies ScoringWeights;

function carrierGame(): MonsGame {
  const game = new MonsGame(false, GameVariant.Classic);
  const drainer = {
    kind: MonKind.Drainer,
    color: Color.White,
    cooldown: 0,
  } as const;
  game.board.removeItem(game.board.base(drainer));
  game.board.put(monWithManaItem(drainer, SUPERMANA), { i: 8, j: 5 });
  game.whiteScore = 2;
  game.blackScore = 1;
  game.whitePotionsCount = 1;
  game.activeColor = Color.Black;
  game.monsMovesCount = 2;
  game.turnNumber = 5;
  return game;
}

function emptyClassicGame(): MonsGame {
  const game = new MonsGame(false, GameVariant.Classic);
  for (const [location] of Array.from(game.board.occupied())) {
    game.board.removeItem(location);
  }
  return game;
}

function heuristicSpiritScore(spiritItem: Item, target?: Item): number {
  const game = emptyClassicGame();
  game.board.put(spiritItem, { i: 5, j: 5 });
  if (target !== undefined) {
    game.board.put(target, { i: 3, j: 5 });
  }
  return evaluatePreferabilityWithWeightsAndExactPolicy(
    game,
    Color.White,
    SPIRIT_UTILITY_WEIGHTS,
    false,
  );
}

describe("scoring evaluation", () => {
  it("characterizes heuristic and exact-policy scores", () => {
    const initial = new MonsGame(false, GameVariant.Classic);
    const carrier = carrierGame();
    const observations = [
      evaluatePreferabilityWithWeightsAndExactPolicy(
        initial,
        Color.White,
        BALANCED_DISTANCE_SCORING_WEIGHTS,
        false,
      ),
      evaluatePreferabilityWithWeightsAndExactPolicy(
        initial,
        Color.Black,
        BALANCED_DISTANCE_SCORING_WEIGHTS,
        true,
      ),
      evaluatePreferabilityWithWeightsAndExactPolicy(
        carrier,
        Color.White,
        RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
        false,
      ),
      evaluatePreferabilityWithWeightsAndExactPolicy(
        carrier,
        Color.White,
        RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
        true,
      ),
      evaluatePreferabilityWithWeightsAndExactPolicy(
        carrier,
        Color.Black,
        RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
        true,
      ),
    ];

    expect(observations).toEqual([940, 940, 944_071, 946_013, -944_630]);
  });

  it("reuses context-owned board, path, and exact summaries", () => {
    const game = carrierGame();
    const context = new ScoringEvalContext(game, true);
    expect(context.boardSummary(game.board)).toBe(
      context.boardSummary(game.board),
    );
    expect(context.manaPathSnapshot(game.board)).toBe(
      context.manaPathSnapshot(game.board),
    );
    expect(context.exactAnalysis(game)).toBe(context.exactAnalysis(game));

    const withContext = evaluatePreferabilityWithContext(
      game,
      Color.White,
      RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
      true,
      context,
    );
    expect(withContext).toBe(
      evaluatePreferabilityWithWeightsAndExactPolicy(
        game,
        Color.White,
        RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
        true,
      ),
    );
  });

  it.each([
    ["plain spirit", monItem(createMon(MonKind.Spirit, Color.White, 0))],
    [
      "spirit with a consumable",
      monWithConsumableItem(
        createMon(MonKind.Spirit, Color.White, 0),
        Consumable.Potion,
      ),
    ],
    [
      "spirit with mana",
      monWithManaItem(createMon(MonKind.Spirit, Color.White, 0), SUPERMANA),
    ],
  ])(
    "counts only eligible reachable targets for a %s",
    (_description, spiritItem) => {
      const baseline = heuristicSpiritScore(spiritItem);
      const liveMon = monItem(createMon(MonKind.Demon, Color.Black, 0));
      const faintedMon = monItem(createMon(MonKind.Demon, Color.Black, 2));
      const looseConsumable = consumableItem(Consumable.Bomb);

      expect(heuristicSpiritScore(spiritItem, liveMon) - baseline).toBe(
        SPIRIT_UTILITY_POINTS,
      );
      expect(heuristicSpiritScore(spiritItem, faintedMon) - baseline).toBe(0);
      expect(heuristicSpiritScore(spiritItem, looseConsumable) - baseline).toBe(
        SPIRIT_UTILITY_POINTS,
      );
    },
  );

  it("keeps exported scoring profiles frozen singletons", () => {
    expect(Object.isFrozen(BALANCED_DISTANCE_SCORING_WEIGHTS)).toBe(true);
    expect(Object.isFrozen(RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS)).toBe(
      true,
    );
  });
});
