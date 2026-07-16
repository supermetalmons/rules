import { describe, expect, it } from "vitest";

import { GameVariant } from "../../src/engine/config.js";
import { Color } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  AUTOMOVE_SEARCH_BUDGETS,
  RUNTIME_NORMAL_ATTACKER_PROXIMITY_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
  RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS,
  RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS,
  RUNTIME_NORMAL_WALK_THREAT_MEDIUM_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
  applyShippingProConfig,
  runtimePhaseAdaptiveAttackerProximityScoringProfile,
  runtimePhaseAdaptiveWalkThreatMediumScoringProfile,
  scoringWeightsKey,
  searchConfigForRuntime,
  searchConfigFromBudget,
  searchConfigFromPreference,
  searchExecutionConfigForGame,
  shippingSearchConfigForGame,
  withFastWideRootShape,
  withNormalDeeperShape,
} from "../../src/automove/selector-config.js";
import { AUTOMOVE_TURN_ENGINE_MODE } from "../../src/automove/selector-types.js";
import {
  BALANCED_DISTANCE_SCORING_WEIGHTS,
  DEFAULT_SCORING_WEIGHTS,
  MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
  RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS_POTION_PREF,
  RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF,
} from "../../src/automove/scoring.js";

function gameAtScores(
  whiteScore: number,
  blackScore: number,
  activeColor = Color.White,
): MonsGame {
  const game = new MonsGame(false, GameVariant.Classic);
  game.whiteScore = whiteScore;
  game.blackScore = blackScore;
  game.activeColor = activeColor;
  return game;
}

describe("legacy automove selector config", () => {
  it("transliterates budget clamping and derived branch shapes", () => {
    expect(AUTOMOVE_SEARCH_BUDGETS).toEqual({
      fast: { depth: 2, maxVisitedNodes: 480 },
      normal: { depth: 3, maxVisitedNodes: 3_800 },
      pro: { depth: 4, maxVisitedNodes: 14_022 },
    });

    const minimum = searchConfigFromBudget(0, 0);
    expect(minimum).toMatchObject({
      depth: 1,
      maxVisitedNodes: 32,
      rootBranchLimit: 4,
      nodeBranchLimit: 4,
      rootEnumLimit: 20,
      nodeEnumLimit: 12,
      scoringWeights: DEFAULT_SCORING_WEIGHTS,
    });

    const maximum = searchConfigFromBudget(99, 999_999);
    expect(maximum).toMatchObject({
      depth: 5,
      maxVisitedNodes: 180_000,
      rootBranchLimit: 28,
      nodeBranchLimit: 18,
      rootEnumLimit: 140,
      nodeEnumLimit: 54,
    });

    const base = searchConfigFromBudget(3, 3_800);
    expect(base).toMatchObject({
      depth: 3,
      maxVisitedNodes: 3_800,
      rootBranchLimit: 28,
      nodeBranchLimit: 18,
      rootEnumLimit: 140,
      nodeEnumLimit: 54,
      enableForcedTacticalPrepass: true,
      enableTurnEngineSecondaryAnalysis: true,
      enableTurnEngineSelectedFollowupProjection: true,
      turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.ProV1,
      rootReplyRiskScoreMargin: 140,
      rootReplyRiskShortlistMax: 3,
      rootReplyRiskReplyLimit: 8,
      rootReplyRiskNodeShareBp: 600,
      rootAntiHelpScoreMargin: 180,
      rootAntiHelpReplyLimit: 6,
      rootDrainerSafetyScoreMargin: 2_200,
      rootManaHandoffPenalty: 220,
      rootBacktrackPenalty: 140,
      rootEfficiencyScoreMargin: 2_500,
      potionSpendPenaltyFast: 340,
      potionSpendPenaltyNormal: 260,
      interviewSoftSupermanaProgressBonus: 240,
      interviewSoftSupermanaScoreBonus: 420,
      interviewSoftOpponentManaProgressBonus: 210,
      interviewSoftOpponentManaScoreBonus: 360,
      interviewSoftManaHandoffPenalty: 220,
      interviewSoftRoundtripPenalty: 140,
      quietReductionDepthThreshold: 3,
    });
    expect(Object.isFrozen(base)).toBe(true);
  });

  it("preserves forRuntime, fast-wide-root, and normal-deeper transforms", () => {
    const depthTwo = searchConfigForRuntime(searchConfigFromBudget(2, 480));
    expect(depthTwo.scoringWeights).toBe(
      MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
    );
    expect(withFastWideRootShape(depthTwo)).toMatchObject({
      rootBranchLimit: 28,
      nodeBranchLimit: 10,
      rootEnumLimit: 168,
      nodeEnumLimit: 40,
    });

    const depthThree = searchConfigForRuntime(searchConfigFromBudget(3, 3_800));
    expect(depthThree).toMatchObject({
      rootBranchLimit: 36,
      nodeBranchLimit: 7,
      rootEnumLimit: 216,
      nodeEnumLimit: 28,
      scoringWeights: BALANCED_DISTANCE_SCORING_WEIGHTS,
    });
    expect(withNormalDeeperShape(depthThree)).toMatchObject({
      rootBranchLimit: 36,
      nodeBranchLimit: 10,
      rootEnumLimit: 216,
      nodeEnumLimit: 60,
    });
  });

  it("matches exact Fast, Normal, and Pro preference configs", () => {
    const fast = searchConfigFromPreference("fast");
    expect(fast).toMatchObject({
      depth: 2,
      maxVisitedNodes: 480,
      rootBranchLimit: 28,
      nodeBranchLimit: 10,
      rootEnumLimit: 168,
      nodeEnumLimit: 40,
      enableQuietReductions: true,
      enableRootReplyRiskGuard: true,
      rootReplyRiskScoreMargin: 125,
      rootReplyRiskShortlistMax: 4,
      rootReplyRiskReplyLimit: 10,
      rootReplyRiskNodeShareBp: 650,
      rootManaHandoffPenalty: 300,
      rootBacktrackPenalty: 220,
      rootEfficiencyScoreMargin: 1_700,
      potionSpendPenaltyFast: 220,
      interviewSoftSupermanaProgressBonus: 320,
      interviewSoftSupermanaScoreBonus: 600,
      enableSupermanaPrepassException: true,
      scoringWeights: RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF,
    });

    const normal = searchConfigFromPreference("normal");
    expect(normal).toMatchObject({
      depth: 3,
      maxVisitedNodes: 6_384,
      rootBranchLimit: 35,
      nodeBranchLimit: 12,
      rootEnumLimit: 210,
      nodeEnumLimit: 84,
      enableTwoPassRootAllocation: true,
      enableQuietReductions: false,
      enableNormalRootSafetyRerank: true,
      enableNormalRootSafetyDeepFloor: true,
      rootReplyRiskScoreMargin: 145,
      rootReplyRiskShortlistMax: 7,
      rootReplyRiskReplyLimit: 16,
      rootReplyRiskNodeShareBp: 1_350,
      rootDrainerSafetyScoreMargin: 4_200,
      potionSpendPenaltyNormal: 130,
    });

    const pro = searchConfigFromPreference("pro");
    expect(pro).toMatchObject({
      depth: 4,
      maxVisitedNodes: 14_022,
      rootBranchLimit: 34,
      nodeBranchLimit: 10,
      rootEnumLimit: 204,
      nodeEnumLimit: 72,
      enableTwoPassRootAllocation: true,
      enableSelectiveExtensions: true,
      enableQuietReductions: true,
      enableFutilityPruning: true,
      quietReductionDepthThreshold: 2,
      rootReplyRiskScoreMargin: 165,
      rootReplyRiskShortlistMax: 9,
      rootReplyRiskReplyLimit: 24,
      rootReplyRiskNodeShareBp: 2_000,
      rootDrainerSafetyScoreMargin: 4_800,
      interviewSoftOpponentManaProgressBonus: 280,
      interviewSoftOpponentManaScoreBonus: 340,
    });
  });

  it("selects every legacy score-phase profile for either active color", () => {
    const cases = [
      [
        0,
        0,
        RUNTIME_NORMAL_ATTACKER_PROXIMITY_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
      ],
      [
        2,
        3,
        RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS,
      ],
      [
        3,
        0,
        RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS,
      ],
      [
        0,
        4,
        RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
      ],
      [
        4,
        0,
        RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
      ],
    ] as const;

    for (const [mine, opponent, expected] of cases) {
      expect(
        runtimePhaseAdaptiveAttackerProximityScoringProfile(
          gameAtScores(mine, opponent),
          4,
        ).weights,
      ).toBe(expected);
      expect(
        runtimePhaseAdaptiveAttackerProximityScoringProfile(
          gameAtScores(opponent, mine, Color.Black),
          4,
        ).weights,
      ).toBe(expected);
    }

    const walk = runtimePhaseAdaptiveWalkThreatMediumScoringProfile(
      gameAtScores(0, 0),
      3,
    ).weights;
    expect(walk).toBe(
      RUNTIME_NORMAL_WALK_THREAT_MEDIUM_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
    );
    expect(walk).toMatchObject({
      drainerDangerBoolean: -1_200,
      manaCarrierDangerBoolean: -800,
      drainerWalkThreatBoolean: -300,
      manaCarrierWalkThreatBoolean: -150,
      attackerCloseToOpponentDrainer: 0,
    });
    expect(
      RUNTIME_NORMAL_ATTACKER_PROXIMITY_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
    ).toMatchObject({
      drainerDangerBoolean: -1_200,
      manaCarrierDangerBoolean: -800,
      drainerWalkThreatBoolean: 0,
      manaCarrierWalkThreatBoolean: 0,
      attackerCloseToOpponentDrainer: 200,
    });
  });

  it("builds the exact shipping profiles in legacy transformation order", () => {
    const game = gameAtScores(0, 0);
    const fast = shippingSearchConfigForGame(game, "fast");
    expect(fast).toMatchObject({
      maxVisitedNodes: 480,
      rootBranchLimit: 28,
      nodeBranchLimit: 10,
      rootEnumLimit: 168,
      nodeEnumLimit: 40,
      scoringWeights: RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS_POTION_PREF,
      enableExactLiteChecks: false,
    });

    const normal = shippingSearchConfigForGame(game, "normal");
    expect(normal).toMatchObject({
      maxVisitedNodes: 9_958,
      rootBranchLimit: 40,
      nodeBranchLimit: 10,
      rootEnumLimit: 240,
      nodeEnumLimit: 40,
      scoringWeights: RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF,
      enableTwoPassRootAllocation: false,
      enableSelectiveExtensions: false,
      enableQuietReductions: true,
      enableExactLiteChecks: true,
      exactLiteRootCallBudget: 1,
      exactLiteStaticCallBudget: 1,
      rootReplyRiskShortlistMax: 5,
      rootReplyRiskReplyLimit: 12,
      rootReplyRiskNodeShareBp: 900,
    });

    const pro = shippingSearchConfigForGame(game, "pro");
    expect(pro).toMatchObject({
      maxVisitedNodes: 15_774,
      rootBranchLimit: 16,
      nodeBranchLimit: 11,
      rootEnumLimit: 204,
      nodeEnumLimit: 72,
      scoringWeights:
        RUNTIME_NORMAL_ATTACKER_PROXIMITY_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
      enableTurnHeadRerank: true,
      enableInterviewDeterministicTiebreak: true,
      enableQuiescenceSearch: true,
      enableExactLiteChecks: false,
    });
  });

  it("applies the CurrentPro shipping turn-engine block without mutating input", () => {
    const game = gameAtScores(0, 0);
    const primary = shippingSearchConfigForGame(game, "pro");
    const currentPro = applyShippingProConfig(primary);
    expect(primary.enableTurnEngineSelector).toBe(false);
    expect(primary.enableTurnHeadRerank).toBe(true);
    expect(currentPro).toMatchObject({
      enableTurnHeadRerank: false,
      enableTurnEngineSelector: true,
      turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro,
      turnEngineSeedCap: 14,
      turnEngineBeamWidth: 5,
      turnEnginePerNodeFamilyCap: 4,
      turnEngineStepCap: 6,
      turnEngineOpponentSeedCap: 6,
      turnEngineOpponentBeamWidth: 2,
      turnEngineReplySeedCap: 3,
      turnEngineReplyBeamWidth: 1,
      turnEngineExpansionCap: 176,
      turnEngineEnableSpiritFamily: true,
      enableTurnEngineLowBudgetGuard: true,
      enableTurnEngineMidTurnTacticalGuard: true,
      enableTurnEngineLateSafeManaRootPreference: true,
      enableTargetedDrainerAttackFallback: true,
      enableRootReplyRiskGuard: false,
    });
    expect(Object.isFrozen(currentPro)).toBe(true);
  });

  it("exposes a lossless adapter for the existing search layer", () => {
    const execution = searchExecutionConfigForGame(gameAtScores(0, 0), "pro");
    expect(execution).toMatchObject({
      preference: "pro",
      scoringKey: "runtime-normal-attacker-balanced",
      useTranspositionTable: true,
      enableExactRootAnalysis: false,
      maxExtensionsPerPath: 1,
      extensionNodeShareBp: 1_500,
      quiescenceNodeBudget: 120,
      quiescenceEnumLimit: 12,
      futilityMargin: 2_300,
      transpositionCapacity: 12_000,
      preferabilityCacheCapacity: 32_768,
      potionSpendPenalty: 130,
      softSupermanaProgressBonus: 240,
      softSupermanaScoreBonus: 300,
      softOpponentManaProgressBonus: 320,
      softOpponentManaScoreBonus: 400,
      softManaHandoffPenalty: 340,
      softRoundtripPenalty: 260,
    });
    expect(scoringWeightsKey(execution.scoringWeights)).toBe(
      execution.scoringKey,
    );
  });
});
