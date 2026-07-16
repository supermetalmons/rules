import { afterEach, describe, expect, it } from "vitest";

import {
  clearSearchCaches,
  compareRankedChildren,
  enforceTacticalChildTop2,
  evaluateSearchScore,
  flattenRootEvaluation,
  flattenRootEvaluations,
  focusRootCandidatesForSearch,
  isQuietReductionCandidate,
  isSelectiveExtensionCandidate,
  searchRootCandidates,
  selectSearchRoot,
  truncateChildrenWithCoverage,
  type RankedChild,
} from "../../src/automove/search.js";
import { exactSearchStateHash } from "../../src/automove/exact.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import {
  rankRootCandidates,
  searchConfigForPreference,
  type MoveClassFlags,
  type RootCandidate,
} from "../../src/automove/root-candidates.js";
import { evaluatePreferabilityWithWeightsAndExactPolicy } from "../../src/automove/scoring.js";
import {
  hash64,
  hash64Equals,
  hash64FromU32,
} from "../../src/automove/hash64.js";
import {
  applyInputsForSearch,
  enumerateLegalTransitions,
  isQuiescenceTacticalTransition,
} from "../../src/automove/transitions.js";
import { GameVariant, TARGET_SCORE } from "../../src/engine/config.js";
import { inputArrayFen } from "../../src/engine/fen.js";
import { MonsGame } from "../../src/engine/game.js";

const RELEASE_FIXTURE_FEN =
  "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n02E0xn01A0xD0xS0xY0xn03";

const TACTICAL_FIXTURE_FEN =
  "0 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n04y0xn04/n05E0xn05/n06D0xn04/n11/n11/n11/n11";

const QUIESCENCE_SCORE_TO_WIN_FEN =
  "4 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n11/n11/n11/n11/n11/n01D0Mn09/n11";

function gameFromFen(fen: string): MonsGame {
  const game = MonsGame.fromFen(fen);
  if (game === undefined) throw new Error(`invalid automove fixture: ${fen}`);
  return game;
}

function fixedClock<T>(operation: () => T): T {
  return withAutomoveClock({ now: () => 1_000 }, () =>
    withDeadlineIfAbsent(10_000, operation),
  );
}

const QUIET_CLASSES: MoveClassFlags = Object.freeze({
  immediateScore: false,
  drainerAttack: false,
  drainerSafetyRecover: false,
  carrierProgress: false,
  material: false,
  quiet: true,
});

function rankedChild(
  game: MonsGame,
  hash: number,
  heuristic: number,
  overrides: Partial<RankedChild> = {},
): RankedChild {
  return {
    game,
    hash: hash64FromU32(hash),
    heuristic,
    orderingEfficiency: 0,
    tacticalExtensionTrigger: false,
    quietReductionCandidate: true,
    classes: QUIET_CLASSES,
    ...overrides,
  };
}

function neutralFocusedCandidate(
  candidate: RootCandidate,
  game: MonsGame,
): RootCandidate {
  return {
    ...candidate,
    game,
    stateHash: exactSearchStateHash(game),
    heuristic: 0,
    efficiency: 0,
    winsImmediately: game.winnerColor() === candidate.game.activeColor,
    attacksOpponentDrainer: false,
    ownDrainerVulnerable: false,
    ownDrainerWalkVulnerable: false,
    spiritDevelopment: false,
    manaHandoffToOpponent: false,
    hasRoundtrip: false,
    scoresSupermanaThisTurn: false,
    scoresOpponentManaThisTurn: false,
    safeSupermanaPickupNow: false,
    safeOpponentManaPickupNow: false,
    safeSupermanaProgressSteps: 15,
    safeOpponentManaProgressSteps: 15,
    scorePathBestSteps: 33,
    sameTurnScoreWindowValue: 0,
    spiritSameTurnScoreSetupNow: false,
    spiritOwnManaSetupNow: false,
    supermanaProgress: false,
    opponentManaProgress: false,
    classes: QUIET_CLASSES,
  };
}

afterEach(() => {
  clearSearchCaches();
  resetDeadlineStateForTesting();
});

describe("bounded adversarial search Rust parity", () => {
  it.each([
    ["opening", () => new MonsGame(false, GameVariant.Classic), "l10,5;l9,4"],
    ["release", () => gameFromFen(RELEASE_FIXTURE_FEN), "l10,6;l9,6"],
    ["tactical", () => gameFromFen(TACTICAL_FIXTURE_FEN), "l5,5;l4,6"],
  ] as const)(
    "selects the Fast %s oracle move",
    (_name, makeGame, expected) => {
      const game = makeGame();
      const before = game.fen();
      const result = fixedClock(() => selectSearchRoot(game, "fast"));

      expect(inputArrayFen(result.best?.candidate.inputs ?? [])).toBe(expected);
      expect(result.visitedNodes).toBeLessThanOrEqual(480);
      expect(result.timedOut).toBe(false);
      expect(game.fen()).toBe(before);
      expect(
        applyInputsForSearch(game, result.best?.candidate.inputs ?? []),
      ).toBeDefined();
    },
  );

  it("matches the opening root scores and node accounting", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const result = fixedClock(() =>
      searchRootCandidates(
        game,
        game.activeColor,
        searchConfigForPreference(game, "fast"),
      ),
    );

    expect(
      result.evaluations
        .slice(0, 8)
        .map((evaluation) => [
          inputArrayFen(evaluation.candidate.inputs),
          evaluation.score,
          evaluation.nodesAfter,
        ]),
    ).toEqual([
      ["l10,5;l9,4", 1_424, 11],
      ["l10,5;l9,5", 1_341, 22],
      ["l10,6;l9,5", 1_424, 33],
      ["l10,6;l9,6", 1_424, 44],
      ["l10,6;l9,7", 1_269, 55],
      ["l10,5;l9,6", 970, 66],
      ["l10,3;l9,4", 1_178, 77],
      ["l10,7;l9,8", 1_178, 88],
    ]);
  });

  it("uses ordinary preferability for terminal quiescence children", () => {
    const game = gameFromFen(QUIESCENCE_SCORE_TO_WIN_FEN);
    const before = game.fen();
    const perspective = game.activeColor;
    const config = searchConfigForPreference(game, "pro");
    expect(config.enableQuiescenceSearch).toBe(true);

    const tacticalTransitions = fixedClock(() =>
      enumerateLegalTransitions(
        game,
        Math.min(config.quiescenceEnumLimit, config.nodeEnumLimit),
      ).filter((transition) =>
        isQuiescenceTacticalTransition(transition.events),
      ),
    );
    expect(
      tacticalTransitions.map((transition) => inputArrayFen(transition.inputs)),
    ).toEqual(["l9,1;l10,0"]);

    const winningTransition = tacticalTransitions[0];
    if (winningTransition === undefined) {
      throw new Error("score-to-win fixture has no tactical transition");
    }
    expect(winningTransition.events.map((event) => event.kind)).toEqual([
      "mon-move",
      "mana-scored",
      "game-over",
    ]);
    expect(winningTransition.game.whiteScore).toBe(TARGET_SCORE);

    const standPat = evaluatePreferabilityWithWeightsAndExactPolicy(
      game,
      perspective,
      config.scoringWeights,
      false,
    );
    const expected = evaluatePreferabilityWithWeightsAndExactPolicy(
      winningTransition.game,
      perspective,
      config.scoringWeights,
      false,
    );
    expect(standPat).toBe(3_536_967);
    expect(expected).toBe(4_418_352);
    expect(expected).toBeGreaterThan(standPat);

    const score = fixedClock(() =>
      evaluateSearchScore(game, perspective, 0, config),
    );
    expect(score).toBe(expected);
    expect(score).not.toBe(268_435_451);
    expect(game.fen()).toBe(before);
  });

  it("reuses preferability observations without changing a result", () => {
    const game = gameFromFen(RELEASE_FIXTURE_FEN);
    const config = searchConfigForPreference(game, "fast");
    const first = fixedClock(() =>
      searchRootCandidates(game, game.activeColor, config),
    );
    const second = fixedClock(() =>
      searchRootCandidates(game, game.activeColor, config),
    );

    expect(inputArrayFen(second.best?.candidate.inputs ?? [])).toBe(
      inputArrayFen(first.best?.candidate.inputs ?? []),
    );
    expect(second.best?.score).toBe(first.best?.score);
    expect(second.cacheHits).toBeGreaterThan(first.cacheHits);
  });

  it("preserves the Rust child comparator, top-two, and strict coverage rules", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const low = rankedChild(game, 1, 80);
    const high = rankedChild(game, 2, 100);
    const efficient = rankedChild(game, 3, 100, {
      orderingEfficiency: 1,
    });
    const tactical = rankedChild(game, 4, 100, {
      classes: { ...QUIET_CLASSES, immediateScore: true, quiet: false },
    });
    const higherHash = rankedChild(game, 5, 100);
    const belowSignedBoundary = rankedChild(game, 0, 100, {
      hash: hash64(0x7fff_ffff, 0xffff_ffff),
    });
    const aboveSignedBoundary = rankedChild(game, 0, 100, {
      hash: hash64(0x8000_0000, 0),
    });

    expect(compareRankedChildren(high, low, true)).toBeLessThan(0);
    expect(compareRankedChildren(low, high, false)).toBeLessThan(0);
    expect(compareRankedChildren(efficient, high, true)).toBeLessThan(0);
    expect(compareRankedChildren(tactical, high, true)).toBeLessThan(0);
    expect(compareRankedChildren(higherHash, high, true)).toBeLessThan(0);
    expect(
      compareRankedChildren(aboveSignedBoundary, belowSignedBoundary, true),
    ).toBeLessThan(0);

    const farPriority = rankedChild(game, 9, -1_000, {
      classes: { ...QUIET_CLASSES, carrierProgress: true, quiet: false },
    });
    const ordered = [
      rankedChild(game, 1, 100),
      rankedChild(game, 2, 90),
      rankedChild(game, 3, 80),
      rankedChild(game, 4, 70),
      farPriority,
    ];
    const top2 = [...ordered];
    enforceTacticalChildTop2(top2, true, true);
    expect(top2.slice(0, 2).map((child) => child.hash)).toEqual([
      hash64FromU32(1),
      hash64FromU32(9),
    ]);
    expect(
      truncateChildrenWithCoverage(ordered, 3, true, true).map(
        (child) => child.hash,
      ),
    ).toEqual([hash64FromU32(1), hash64FromU32(2), hash64FromU32(9)]);
    expect(
      truncateChildrenWithCoverage(ordered, 3, true, false).map(
        (child) => child.hash,
      ),
    ).toEqual([hash64FromU32(1), hash64FromU32(2), hash64FromU32(3)]);
    expect(truncateChildrenWithCoverage(ordered, 0, true)).toEqual(ordered);
  });

  it("uses the exact quiet-reduction and selective-extension predicates", () => {
    const spiritOnlyClasses = { ...QUIET_CLASSES, quiet: false };

    expect(isQuietReductionCandidate(0, false, spiritOnlyClasses)).toBe(true);
    expect(isQuietReductionCandidate(1, false, spiritOnlyClasses)).toBe(false);
    expect(isQuietReductionCandidate(0, true, spiritOnlyClasses)).toBe(false);
    expect(
      isQuietReductionCandidate(0, false, {
        ...spiritOnlyClasses,
        material: true,
      }),
    ).toBe(false);
    expect(isSelectiveExtensionCandidate(false, 1, spiritOnlyClasses)).toBe(
      true,
    );
    expect(isSelectiveExtensionCandidate(false, 1, QUIET_CLASSES)).toBe(false);
    expect(isSelectiveExtensionCandidate(true, -1, QUIET_CLASSES)).toBe(true);
  });

  it("flattens shared root evaluations without dropping search observations", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const result = fixedClock(() => selectSearchRoot(game, "fast"));
    const evaluation = result.evaluations[0];
    if (evaluation === undefined) throw new Error("opening search is empty");

    const flat = flattenRootEvaluation(evaluation);
    expect(flat).toMatchObject({
      ...evaluation.candidate,
      score: evaluation.score,
      nodesAfter: evaluation.nodesAfter,
    });
    expect(flat.game).toBe(evaluation.candidate.game);
    expect(flat.events).toBe(evaluation.candidate.events);
    expect(flat.rootRank).toBe(flat.rank);
    expect(flat.interviewSoftPriority).toBe(flat.softPriority);
    expect(flattenRootEvaluations(result.evaluations)).toHaveLength(
      result.evaluations.length,
    );
  });

  it("applies presearch priorities before evaluation", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const config = searchConfigForPreference(game, "fast");
    const candidates = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, config),
    ).slice(0, 4);
    const forced = candidates[3];
    if (forced === undefined) throw new Error("opening has too few roots");

    const result = fixedClock(() =>
      searchRootCandidates(game, game.activeColor, config, candidates, {
        forcedInputs: forced.inputs,
      }),
    );
    expect(result.evaluations[0]?.candidate.inputs).toEqual(forced.inputs);
  });

  it("refreshes a stale hash on a supplied mutable root candidate", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const config = searchConfigForPreference(game, "fast");
    const candidate = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, config),
    )[0];
    if (candidate === undefined) throw new Error("opening has no roots");

    candidate.game.whiteScore += 1;
    const currentHash = exactSearchStateHash(candidate.game);
    expect(hash64Equals(candidate.stateHash, currentHash)).toBe(false);

    const focused = fixedClock(() =>
      focusRootCandidatesForSearch(
        game,
        game.activeColor,
        {
          ...config,
          enableTwoPassRootAllocation: false,
          enableTwoPassVolatilityFocus: false,
        },
        [candidate],
      ),
    );
    const refreshed = focused.candidates[0];
    expect(refreshed).toBeDefined();
    expect(refreshed).not.toBe(candidate);
    expect(refreshed?.game).toBe(candidate.game);
    expect(refreshed?.stateHash).toEqual(currentHash);
  });

  it.each([
    ["NaN while disabled", Number.NaN, false],
    ["NaN", Number.NaN, true],
    ["positive infinity", Number.POSITIVE_INFINITY, true],
    ["negative infinity", Number.NEGATIVE_INFINITY, true],
    ["a fractional threshold", 1.5, true],
  ] as const)(
    "accepts the legacy transposition capacity %s",
    (_name, transpositionCapacity, useTranspositionTable) => {
      const game = gameFromFen(RELEASE_FIXTURE_FEN);
      const baseConfig = searchConfigForPreference(game, "fast");
      const baseline = fixedClock(() =>
        evaluateSearchScore(game, game.activeColor, 2, {
          ...baseConfig,
          useTranspositionTable: false,
        }),
      );

      const score = fixedClock(() =>
        evaluateSearchScore(game, game.activeColor, 2, {
          ...baseConfig,
          transpositionCapacity,
          useTranspositionTable,
        }),
      );
      expect(score).toBe(baseline);
    },
  );

  it("uses the explicit transposition-table policy for two-pass scouting", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const before = game.fen();
    const boardFen = game.fen().split(" ").at(-1);
    if (boardFen === undefined) throw new Error("opening FEN has no board");
    const whiteAhead = gameFromFen(`4 0 w 0 0 0 0 0 2 ${boardFen}`);
    const blackAhead = gameFromFen(`0 4 w 0 0 0 0 0 2 ${boardFen}`);
    const baseConfig = searchConfigForPreference(game, "fast");
    const candidates = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, baseConfig),
    ).slice(0, 4);
    const supplied = candidates.map((candidate, index) =>
      neutralFocusedCandidate(candidate, index < 2 ? whiteAhead : blackAhead),
    );

    const run = (configFlag: boolean, override: boolean) => {
      clearSearchCaches();
      const focused = fixedClock(() =>
        focusRootCandidatesForSearch(
          game,
          game.activeColor,
          {
            ...baseConfig,
            depth: 4,
            maxVisitedNodes: 1_000,
            enableTwoPassRootAllocation: true,
            enableTwoPassVolatilityFocus: false,
            enableTurnEngineSelector: false,
            enableSelectiveExtensions: false,
            enableQuietReductions: false,
            enableQuiescenceSearch: false,
            useTranspositionTable: configFlag,
          },
          supplied,
          {},
          override,
        ),
      );
      return {
        inputs: focused.candidates.map((candidate) =>
          inputArrayFen(candidate.inputs),
        ),
        scoutVisitedNodes: focused.scoutVisitedNodes,
      };
    };

    const enabled = run(true, true);
    const disabled = run(false, false);
    expect(run(false, true)).toEqual(enabled);
    expect(run(true, false)).toEqual(disabled);
    expect(enabled.inputs).toEqual(disabled.inputs);
    expect(enabled.scoutVisitedNodes).toBeLessThan(disabled.scoutVisitedNodes);
    expect(game.fen()).toBe(before);
  });

  it("charges two-pass scout nodes before focused root evaluation", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const parts = game.fen().split(" ");
    const boardFen = parts.at(-1);
    if (boardFen === undefined) throw new Error("opening FEN has no board");
    const whiteWin = gameFromFen(`5 0 w 0 0 0 0 0 2 ${boardFen}`);
    const blackWin = gameFromFen(`0 5 w 0 0 0 0 0 2 ${boardFen}`);
    const baseConfig = searchConfigForPreference(game, "fast");
    const config = {
      ...baseConfig,
      depth: 4,
      maxVisitedNodes: 128,
      enableTwoPassRootAllocation: true,
      enableTwoPassVolatilityFocus: false,
      enableTurnEngineSelector: false,
      enableSelectiveExtensions: false,
      enableQuietReductions: false,
      enableQuiescenceSearch: false,
    };
    const candidates = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, baseConfig),
    ).slice(0, 4);
    const supplied = candidates.map((candidate, index) =>
      neutralFocusedCandidate(candidate, index < 2 ? whiteWin : blackWin),
    );

    const focused = fixedClock(() =>
      focusRootCandidatesForSearch(game, game.activeColor, config, supplied),
    );
    expect(focused.scoutVisitedNodes).toBe(4);
    expect(
      focused.candidates.map((candidate) => inputArrayFen(candidate.inputs)),
    ).toEqual(["l10,5;l9,4", "l10,5;l9,5", "l10,6;l9,5"]);

    clearSearchCaches();
    const result = fixedClock(() =>
      searchRootCandidates(game, game.activeColor, config, supplied),
    );
    expect({
      evaluations: result.evaluations.map((evaluation) => [
        inputArrayFen(evaluation.candidate.inputs),
        evaluation.score,
        evaluation.nodesAfter,
      ]),
      cacheHits: result.cacheHits,
    }).toEqual({
      evaluations: [
        ["l10,5;l9,4", 268_435_454, 5],
        ["l10,5;l9,5", 268_435_454, 6],
        ["l10,6;l9,5", -268_435_454, 7],
      ],
      cacheHits: 0,
    });
    expect(result.evaluations).toHaveLength(3);
    expect(result.evaluations[0]?.nodesAfter).toBe(5);
    expect(result.visitedNodes).toBe(7);
  });
});
