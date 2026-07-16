import { describe, expect, it } from "vitest";

import {
  BALANCED_DISTANCE_SCORING_WEIGHTS,
  DEFAULT_SCORING_WEIGHTS,
  MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
  RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
  RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS,
  ScoringEvalContext,
  distanceToLocation,
  evaluatePreferabilityWithContext,
  evaluatePreferabilityWithWeightsAndExactPolicy,
  scaleByBp,
  scoringDistance,
  type ScoringWeights,
} from "../../src/automove/scoring.js";
import { GameVariant } from "../../src/engine/config.js";
import { Color } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import { location } from "../../src/engine/geometry.js";

const RELEASE_FIXTURE_FEN =
  "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n02E0xn01A0xD0xS0xY0xn03";

const TACTICAL_FIXTURE_FEN =
  "0 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n04y0xn04/n05E0xn05/n06D0xn04/n11/n11/n11/n11";

type ScoringCase = {
  readonly name: string;
  readonly weights: ScoringWeights;
  readonly allowExactStrategic: boolean;
  readonly initial: readonly [number, number];
  readonly release: readonly [number, number];
  readonly tactical: readonly [number, number];
};

const SCORING_CASES: readonly ScoringCase[] = [
  {
    name: "default legacy",
    weights: DEFAULT_SCORING_WEIGHTS,
    allowExactStrategic: false,
    initial: [903, 903],
    release: [953, 853],
    tactical: [-2, 2],
  },
  {
    name: "balanced distance legacy",
    weights: BALANCED_DISTANCE_SCORING_WEIGHTS,
    allowExactStrategic: true,
    initial: [940, 940],
    release: [985, 895],
    tactical: [11, -11],
  },
  {
    name: "mana race D2 legacy",
    weights: MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
    allowExactStrategic: true,
    initial: [686, 686],
    release: [731, 641],
    tactical: [29, -29],
  },
  {
    name: "runtime context forced to legacy",
    weights: RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS,
    allowExactStrategic: false,
    initial: [686, 686],
    release: [731, 641],
    tactical: [-189, 189],
  },
  {
    name: "runtime context exact",
    weights: RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS,
    allowExactStrategic: true,
    initial: [30, 1346],
    release: [75, 1301],
    tactical: [-399, 399],
  },
  {
    name: "runtime boolean forced to legacy",
    weights: RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
    allowExactStrategic: false,
    initial: [686, 686],
    release: [731, 641],
    tactical: [-589, 589],
  },
  {
    name: "runtime boolean exact",
    weights: RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
    allowExactStrategic: true,
    initial: [-60, 1436],
    release: [-15, 1391],
    tactical: [-799, 799],
  },
];

function gameFromFen(fen: string): MonsGame {
  const game = MonsGame.fromFen(fen);
  if (game === undefined) {
    throw new Error(`invalid scoring fixture: ${fen}`);
  }
  return game;
}

function evaluateBothColors(
  game: MonsGame,
  weights: ScoringWeights,
  allowExactStrategic: boolean,
): readonly [number, number] {
  return [
    evaluatePreferabilityWithWeightsAndExactPolicy(
      game,
      Color.White,
      weights,
      allowExactStrategic,
    ),
    evaluatePreferabilityWithWeightsAndExactPolicy(
      game,
      Color.Black,
      weights,
      allowExactStrategic,
    ),
  ];
}

describe("scoring Rust parity", () => {
  for (const scoringCase of SCORING_CASES) {
    it(`matches ${scoringCase.name} oracle goldens`, () => {
      const games = [
        new MonsGame(false, GameVariant.Classic),
        gameFromFen(RELEASE_FIXTURE_FEN),
        gameFromFen(TACTICAL_FIXTURE_FEN),
      ] as const;
      const before = games.map((game) => game.fen());

      expect(
        evaluateBothColors(
          games[0],
          scoringCase.weights,
          scoringCase.allowExactStrategic,
        ),
      ).toEqual(scoringCase.initial);
      expect(
        evaluateBothColors(
          games[1],
          scoringCase.weights,
          scoringCase.allowExactStrategic,
        ),
      ).toEqual(scoringCase.release);
      expect(
        evaluateBothColors(
          games[2],
          scoringCase.weights,
          scoringCase.allowExactStrategic,
        ),
      ).toEqual(scoringCase.tactical);
      expect(games.map((game) => game.fen())).toEqual(before);
    });
  }

  it("reuses one evaluation context without changing results", () => {
    const game = gameFromFen(RELEASE_FIXTURE_FEN);
    const context = new ScoringEvalContext(game, true);
    const weights = RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS;

    expect(
      evaluatePreferabilityWithContext(
        game,
        Color.White,
        weights,
        true,
        context,
      ),
    ).toBe(75);
    expect(
      evaluatePreferabilityWithContext(
        game,
        Color.Black,
        weights,
        true,
        context,
      ),
    ).toBe(1301);
  });

  it("counts a plain mon as active only after it leaves a mon base", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const withoutActiveMon = { ...DEFAULT_SCORING_WEIGHTS, activeMon: 0 };
    const withActiveMon = { ...DEFAULT_SCORING_WEIGHTS, activeMon: 37 };
    const activeMonDelta = (): readonly [number, number] => {
      const inactive = evaluateBothColors(game, withoutActiveMon, false);
      const active = evaluateBothColors(game, withActiveMon, false);
      return [active[0] - inactive[0], active[1] - inactive[1]];
    };

    expect(activeMonDelta()).toEqual([0, 0]);

    const base = location(10, 3);
    const destination = location(9, 3);
    const item = game.board.item(base);
    if (item?.kind !== "mon") {
      throw new Error("synthetic active-mon fixture must start with a mon");
    }
    game.board.removeItem(base);
    game.board.put(item, destination);

    expect(activeMonDelta()).toEqual([37, -37]);
  });
});

describe("scoring primitives", () => {
  it("keeps every shared preset immutable", () => {
    const presets = [
      DEFAULT_SCORING_WEIGHTS,
      BALANCED_DISTANCE_SCORING_WEIGHTS,
      MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
      RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS,
      RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
    ];
    expect(presets.every(Object.isFrozen)).toBe(true);
  });

  it("uses Rust i64 multiplication, truncation, and i32 narrowing", () => {
    expect(scaleByBp(3, 5_000)).toBe(1);
    expect(scaleByBp(-3, 5_000)).toBe(-1);
    expect(scaleByBp(3, -5_000)).toBe(-1);
    expect(scaleByBp(2_147_483_647, 2_147_483_647)).toBe(782_972_538);
    expect(scaleByBp(-2_147_483_648, 2_147_483_647)).toBe(-783_187_286);
  });

  it("matches the Rust scoring distance formulas", () => {
    expect(scoringDistance(location(5, 5), { kind: "center" })).toBe(2);
    expect(scoringDistance(location(0, 0), { kind: "center" })).toBe(6);
    expect(scoringDistance(location(5, 5), { kind: "any-closest-pool" })).toBe(
      6,
    );
    expect(
      scoringDistance(location(9, 5), {
        kind: "closest-pool",
        color: Color.Black,
      }),
    ).toBe(10);
    expect(distanceToLocation(location(0, 0), location(2, 3))).toBe(4);
  });
});
