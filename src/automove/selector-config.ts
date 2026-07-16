import { TARGET_SCORE } from "../engine/config.js";
import { Color } from "../engine/domain.js";
import type { MonsGame } from "../engine/game.js";
import { toI32 } from "../engine/numerics.js";
import {
  BALANCED_DISTANCE_SCORING_WEIGHTS,
  DEFAULT_SCORING_WEIGHTS,
  FINISHER_BALANCED_SOFT_AGGRESSIVE_SCORING_WEIGHTS,
  FINISHER_BALANCED_SOFT_SCORING_WEIGHTS,
  MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
  RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
  RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS_POTION_PREF,
  RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS,
  RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF,
  TACTICAL_BALANCED_AGGRESSIVE_SCORING_WEIGHTS,
  TACTICAL_BALANCED_SCORING_WEIGHTS,
  type ScoringWeights,
} from "./scoring.js";
import {
  AUTOMOVE_TURN_ENGINE_MODE,
  type AutomoveSearchConfig,
  type AutomoveSearchExecutionConfig,
  type SmartAutomovePreference,
} from "./selector-types.js";

const MIN_SEARCH_DEPTH = 1;
const MAX_SEARCH_DEPTH = 5;
const MIN_MAX_VISITED_NODES = 32;
const MAX_MAX_VISITED_NODES = 180_000;
const FAST_DEPTH = 2;
const FAST_MAX_VISITED_NODES = 480;
const NORMAL_DEPTH = 3;
const NORMAL_MAX_VISITED_NODES = 3_800;
const PRO_DEPTH = 4;
const PRO_MAX_VISITED_NODES = Math.trunc(
  (NORMAL_MAX_VISITED_NODES * 369) / 100,
);

const ROOT_REPLY_RISK_SCORE_MARGIN = 140;
const ROOT_REPLY_RISK_SHORTLIST_FAST = 3;
const ROOT_REPLY_RISK_REPLY_LIMIT_FAST = 8;
const ROOT_REPLY_RISK_NODE_SHARE_BP_FAST = 600;
const ROOT_ANTI_HELP_SCORE_MARGIN = 180;
const ROOT_ANTI_HELP_REPLY_LIMIT_FAST = 6;
const ROOT_DRAINER_SAFETY_SCORE_MARGIN = 2_200;
const ROOT_MANA_HANDOFF_PENALTY = 220;
const ROOT_BACKTRACK_PENALTY = 140;
const ROOT_EFFICIENCY_SCORE_MARGIN = 2_500;
const POTION_SPEND_PENALTY_FAST = 340;
const POTION_SPEND_PENALTY_NORMAL = 260;
const SOFT_SUPERMANA_PROGRESS_BONUS = 240;
const SOFT_SUPERMANA_SCORE_BONUS = 420;
const SOFT_OPPONENT_MANA_PROGRESS_BONUS = 210;
const SOFT_OPPONENT_MANA_SCORE_BONUS = 360;
const SOFT_MANA_HANDOFF_PENALTY = 220;
const SOFT_ROUNDTRIP_PENALTY = 140;

export const AUTOMOVE_SEARCH_EXECUTION_CONSTANTS = Object.freeze({
  maxExtensionsPerPath: 1,
  extensionNodeShareBp: 1_500,
  quiescenceNodeBudget: 120,
  quiescenceEnumLimit: 12,
  futilityMargin: 2_300,
  transpositionCapacity: 12_000,
  preferabilityCacheCapacity: 32_768,
});

export const AUTOMOVE_SEARCH_BUDGETS = Object.freeze({
  fast: Object.freeze({
    depth: FAST_DEPTH,
    maxVisitedNodes: FAST_MAX_VISITED_NODES,
  }),
  normal: Object.freeze({
    depth: NORMAL_DEPTH,
    maxVisitedNodes: NORMAL_MAX_VISITED_NODES,
  }),
  pro: Object.freeze({
    depth: PRO_DEPTH,
    maxVisitedNodes: PRO_MAX_VISITED_NODES,
  }),
});

function freezeWeights(weights: ScoringWeights): ScoringWeights {
  return Object.freeze(weights);
}

export const RUNTIME_NORMAL_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS =
  freezeWeights({
    ...BALANCED_DISTANCE_SCORING_WEIGHTS,
    useHeuristicFormula: false,
    confirmedScore: 900,
    spiritOnOwnBasePenalty: 260,
    scoreRacePathProgress: 86,
    opponentScoreRacePathProgress: 184,
    immediateScoreWindow: 96,
    opponentImmediateScoreWindow: 245,
    angelGuardingDrainer: 120,
    supermanaRaceControl: 30,
    opponentManaDenial: 24,
    drainerHoldingMana: 470,
    drainerImmediateThreat: -55,
    drainerBestManaPath: 58,
    drainerPickupScoreThisTurn: 90,
    manaCarrierScoreThisTurn: 150,
    drainerCloseToMana: 360,
    spiritActionUtility: 86,
  });

export const RUNTIME_NORMAL_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS =
  freezeWeights({
    ...TACTICAL_BALANCED_SCORING_WEIGHTS,
    useHeuristicFormula: false,
    confirmedScore: 900,
    spiritOnOwnBasePenalty: 260,
    scoreRacePathProgress: 94,
    opponentScoreRacePathProgress: 220,
    immediateScoreWindow: 102,
    opponentImmediateScoreWindow: 310,
    angelGuardingDrainer: 180,
    supermanaRaceControl: 34,
    opponentManaDenial: 30,
    drainerHoldingMana: 500,
    drainerImmediateThreat: -90,
    drainerBestManaPath: 84,
    drainerPickupScoreThisTurn: 110,
    manaCarrierScoreThisTurn: 180,
    drainerCloseToMana: 390,
    spiritActionUtility: 90,
  });

export const RUNTIME_NORMAL_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  freezeWeights({
    ...TACTICAL_BALANCED_AGGRESSIVE_SCORING_WEIGHTS,
    useHeuristicFormula: false,
    confirmedScore: 890,
    spiritOnOwnBasePenalty: 260,
    scoreRacePathProgress: 104,
    opponentScoreRacePathProgress: 255,
    immediateScoreWindow: 114,
    opponentImmediateScoreWindow: 360,
    angelGuardingDrainer: 190,
    supermanaRaceControl: 40,
    opponentManaDenial: 34,
    drainerHoldingMana: 520,
    drainerImmediateThreat: -120,
    drainerBestManaPath: 96,
    drainerPickupScoreThisTurn: 130,
    manaCarrierScoreThisTurn: 220,
    drainerCloseToMana: 410,
    spiritActionUtility: 94,
  });

export const RUNTIME_NORMAL_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS =
  freezeWeights({
    ...FINISHER_BALANCED_SOFT_SCORING_WEIGHTS,
    useHeuristicFormula: false,
    confirmedScore: 930,
    spiritOnOwnBasePenalty: 260,
    scoreRacePathProgress: 170,
    opponentScoreRacePathProgress: 170,
    immediateScoreWindow: 275,
    opponentImmediateScoreWindow: 235,
    supermanaRaceControl: 32,
    opponentManaDenial: 28,
    drainerHoldingMana: 500,
    drainerBestManaPath: 72,
    drainerPickupScoreThisTurn: 120,
    manaCarrierScoreThisTurn: 240,
    drainerCloseToMana: 375,
    angelGuardingDrainer: 170,
    spiritActionUtility: 88,
  });

export const RUNTIME_NORMAL_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  freezeWeights({
    ...FINISHER_BALANCED_SOFT_AGGRESSIVE_SCORING_WEIGHTS,
    useHeuristicFormula: false,
    confirmedScore: 940,
    spiritOnOwnBasePenalty: 260,
    scoreRacePathProgress: 195,
    opponentScoreRacePathProgress: 185,
    immediateScoreWindow: 330,
    opponentImmediateScoreWindow: 265,
    supermanaRaceControl: 36,
    opponentManaDenial: 30,
    drainerHoldingMana: 520,
    drainerBestManaPath: 84,
    drainerPickupScoreThisTurn: 140,
    manaCarrierScoreThisTurn: 280,
    drainerCloseToMana: 395,
    angelGuardingDrainer: 180,
    spiritActionUtility: 90,
  });

function withBooleanDrainer(weights: ScoringWeights): ScoringWeights {
  return freezeWeights({
    ...weights,
    drainerDangerBoolean: -1_200,
    manaCarrierDangerBoolean: -800,
  });
}

export const RUNTIME_NORMAL_BOOLEAN_DRAINER_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS =
  withBooleanDrainer(
    RUNTIME_NORMAL_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_BOOLEAN_DRAINER_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS =
  withBooleanDrainer(
    RUNTIME_NORMAL_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_BOOLEAN_DRAINER_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  withBooleanDrainer(
    RUNTIME_NORMAL_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_BOOLEAN_DRAINER_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS =
  withBooleanDrainer(
    RUNTIME_NORMAL_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_BOOLEAN_DRAINER_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  withBooleanDrainer(
    RUNTIME_NORMAL_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  );

function withMediumWalkThreat(weights: ScoringWeights): ScoringWeights {
  return freezeWeights({
    ...weights,
    drainerWalkThreatBoolean: -300,
    manaCarrierWalkThreatBoolean: -150,
  });
}

export const RUNTIME_NORMAL_WALK_THREAT_MEDIUM_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS =
  withMediumWalkThreat(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_WALK_THREAT_MEDIUM_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS =
  withMediumWalkThreat(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_WALK_THREAT_MEDIUM_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  withMediumWalkThreat(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_WALK_THREAT_MEDIUM_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS =
  withMediumWalkThreat(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_WALK_THREAT_MEDIUM_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  withMediumWalkThreat(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  );

function withAttackerProximity(weights: ScoringWeights): ScoringWeights {
  return freezeWeights({ ...weights, attackerCloseToOpponentDrainer: 200 });
}

export const RUNTIME_NORMAL_ATTACKER_PROXIMITY_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS =
  withAttackerProximity(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS =
  withAttackerProximity(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  withAttackerProximity(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS =
  withAttackerProximity(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS,
  );
export const RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS =
  withAttackerProximity(
    RUNTIME_NORMAL_BOOLEAN_DRAINER_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
  );

type ScoringProfile = {
  readonly weights: ScoringWeights;
  readonly key: string;
};

function phaseProfile(
  game: MonsGame,
  balanced: ScoringProfile,
  tactical: ScoringProfile,
  tacticalAggressive: ScoringProfile,
  finisher: ScoringProfile,
  finisherAggressive: ScoringProfile,
): ScoringProfile {
  const [myScore, opponentScore] =
    game.activeColor === Color.White
      ? [game.whiteScore, game.blackScore]
      : [game.blackScore, game.whiteScore];
  const myDistanceToWin = TARGET_SCORE - myScore;
  const opponentDistanceToWin = TARGET_SCORE - opponentScore;
  const scoreGap = myScore - opponentScore;

  if (myDistanceToWin <= 1) return finisherAggressive;
  if (opponentDistanceToWin <= 1) return tacticalAggressive;
  if (myDistanceToWin <= 2) return finisher;
  if (opponentDistanceToWin <= 2 || scoreGap <= -1) return tactical;
  return balanced;
}

const WALK_PROFILES = Object.freeze({
  balanced: Object.freeze({
    weights:
      RUNTIME_NORMAL_WALK_THREAT_MEDIUM_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-walk-balanced",
  }),
  tactical: Object.freeze({
    weights:
      RUNTIME_NORMAL_WALK_THREAT_MEDIUM_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-walk-tactical",
  }),
  tacticalAggressive: Object.freeze({
    weights:
      RUNTIME_NORMAL_WALK_THREAT_MEDIUM_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-walk-tactical-aggressive",
  }),
  finisher: Object.freeze({
    weights:
      RUNTIME_NORMAL_WALK_THREAT_MEDIUM_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-walk-finisher",
  }),
  finisherAggressive: Object.freeze({
    weights:
      RUNTIME_NORMAL_WALK_THREAT_MEDIUM_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-walk-finisher-aggressive",
  }),
});

const ATTACKER_PROFILES = Object.freeze({
  balanced: Object.freeze({
    weights:
      RUNTIME_NORMAL_ATTACKER_PROXIMITY_BALANCED_DISTANCE_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-attacker-balanced",
  }),
  tactical: Object.freeze({
    weights:
      RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-attacker-tactical",
  }),
  tacticalAggressive: Object.freeze({
    weights:
      RUNTIME_NORMAL_ATTACKER_PROXIMITY_TACTICAL_BALANCED_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-attacker-tactical-aggressive",
  }),
  finisher: Object.freeze({
    weights:
      RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-attacker-finisher",
  }),
  finisherAggressive: Object.freeze({
    weights:
      RUNTIME_NORMAL_ATTACKER_PROXIMITY_FINISHER_BALANCED_SOFT_AGGRESSIVE_SPIRIT_BASE_SCORING_WEIGHTS,
    key: "runtime-normal-attacker-finisher-aggressive",
  }),
});

const KNOWN_SCORING_KEYS = new Map<ScoringWeights, string>([
  [DEFAULT_SCORING_WEIGHTS, "default"],
  [BALANCED_DISTANCE_SCORING_WEIGHTS, "balanced-distance"],
  [MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS, "mana-race-lite-d2"],
  [RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS, "runtime-fast-context"],
  [
    RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF,
    "runtime-fast-context-potion",
  ],
  [RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS, "runtime-fast-boolean"],
  [
    RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS_POTION_PREF,
    "runtime-fast-boolean-potion",
  ],
  ...Object.values(WALK_PROFILES).map(
    ({ weights, key }) => [weights, key] as const,
  ),
  ...Object.values(ATTACKER_PROFILES).map(
    ({ weights, key }) => [weights, key] as const,
  ),
]);

export function scoringWeightsKey(weights: ScoringWeights): string {
  const known = KNOWN_SCORING_KEYS.get(weights);
  if (known !== undefined) return known;
  return `custom:${Object.entries(weights)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(";")}`;
}

export function runtimePhaseAdaptiveWalkThreatMediumScoringProfile(
  game: MonsGame,
  depth: number,
): ScoringProfile {
  if (depth < 3) {
    return Object.freeze({
      weights: RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
      key: "runtime-fast-boolean",
    });
  }
  return phaseProfile(
    game,
    WALK_PROFILES.balanced,
    WALK_PROFILES.tactical,
    WALK_PROFILES.tacticalAggressive,
    WALK_PROFILES.finisher,
    WALK_PROFILES.finisherAggressive,
  );
}

export function runtimePhaseAdaptiveAttackerProximityScoringProfile(
  game: MonsGame,
  depth: number,
): ScoringProfile {
  if (depth < 3) {
    return Object.freeze({
      weights: RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
      key: "runtime-fast-boolean",
    });
  }
  return phaseProfile(
    game,
    ATTACKER_PROFILES.balanced,
    ATTACKER_PROFILES.tactical,
    ATTACKER_PROFILES.tacticalAggressive,
    ATTACKER_PROFILES.finisher,
    ATTACKER_PROFILES.finisherAggressive,
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function subtractSaturating(value: number, amount: number): number {
  return Math.max(0, value - amount);
}

function scaleFloor(
  value: number,
  numerator: number,
  denominator: number,
): number {
  return Math.trunc((value * numerator) / denominator);
}

function freezeConfig(config: AutomoveSearchConfig): AutomoveSearchConfig {
  return Object.freeze(config);
}

export function searchConfigFromBudget(
  requestedDepth: number,
  requestedMaxVisitedNodes: number,
): AutomoveSearchConfig {
  const depth = clamp(
    toI32(requestedDepth),
    MIN_SEARCH_DEPTH,
    MAX_SEARCH_DEPTH,
  );
  const maxVisitedNodes = clamp(
    toI32(requestedMaxVisitedNodes),
    MIN_MAX_VISITED_NODES,
    MAX_MAX_VISITED_NODES,
  );
  const rootBranchLimit = clamp(Math.trunc(maxVisitedNodes / 24), 4, 28);
  const nodeBranchLimit = clamp(Math.trunc(maxVisitedNodes / 40), 4, 18);
  const rootEnumLimit = clamp(rootBranchLimit * 5, rootBranchLimit, 180);
  const nodeEnumLimit = clamp(nodeBranchLimit * 3, nodeBranchLimit, 96);

  return freezeConfig({
    depth,
    maxVisitedNodes,
    rootEnumLimit,
    rootBranchLimit,
    nodeEnumLimit,
    nodeBranchLimit,
    scoringWeights: DEFAULT_SCORING_WEIGHTS,
    enableTwoPassRootAllocation: false,
    enableSelectiveExtensions: false,
    enableQuietReductions: false,
    enableTargetedDrainerAttackFallback: false,
    enableForcedTacticalPrepass: true,
    enableTurnHeadRerank: false,
    enableTurnEngineSelector: false,
    enableTurnEngineLowBudgetGuard: false,
    enableTurnEngineMidTurnTacticalGuard: false,
    enableTurnEngineSecondaryAnalysis: true,
    enableTurnEngineSelectedFollowupProjection: true,
    enableTurnEngineLateSafeManaRootPreference: false,
    turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.ProV1,
    turnEngineSeedCap: 0,
    turnEngineBeamWidth: 0,
    turnEnginePerNodeFamilyCap: 0,
    turnEngineStepCap: 0,
    turnEngineOpponentSeedCap: 0,
    turnEngineOpponentBeamWidth: 0,
    turnEngineReplySeedCap: 0,
    turnEngineReplyBeamWidth: 0,
    turnEngineExpansionCap: 0,
    turnEngineEnableSpiritFamily: false,
    enableExactLiteChecks: false,
    exactLiteRootCallBudget: 0,
    exactLiteStaticCallBudget: 0,
    enableRootSpiritDevelopmentPref: true,
    enableRootReplyRiskGuard: false,
    rootReplyRiskScoreMargin: ROOT_REPLY_RISK_SCORE_MARGIN,
    rootReplyRiskShortlistMax: ROOT_REPLY_RISK_SHORTLIST_FAST,
    rootReplyRiskReplyLimit: ROOT_REPLY_RISK_REPLY_LIMIT_FAST,
    rootReplyRiskNodeShareBp: ROOT_REPLY_RISK_NODE_SHARE_BP_FAST,
    rootAntiHelpScoreMargin: ROOT_ANTI_HELP_SCORE_MARGIN,
    rootAntiHelpReplyLimit: ROOT_ANTI_HELP_REPLY_LIMIT_FAST,
    enableTwoPassVolatilityFocus: false,
    enableNormalRootSafetyRerank: false,
    enableNormalRootSafetyDeepFloor: false,
    enableInterviewHardSpiritDeploy: false,
    enableInterviewDeterministicTiebreak: false,
    preferCleanReplyRiskRoots: false,
    rootDrainerSafetyScoreMargin: ROOT_DRAINER_SAFETY_SCORE_MARGIN,
    rootManaHandoffPenalty: ROOT_MANA_HANDOFF_PENALTY,
    rootBacktrackPenalty: ROOT_BACKTRACK_PENALTY,
    rootEfficiencyScoreMargin: ROOT_EFFICIENCY_SCORE_MARGIN,
    potionSpendPenaltyFast: POTION_SPEND_PENALTY_FAST,
    potionSpendPenaltyNormal: POTION_SPEND_PENALTY_NORMAL,
    interviewSoftSupermanaProgressBonus: SOFT_SUPERMANA_PROGRESS_BONUS,
    interviewSoftSupermanaScoreBonus: SOFT_SUPERMANA_SCORE_BONUS,
    interviewSoftOpponentManaProgressBonus: SOFT_OPPONENT_MANA_PROGRESS_BONUS,
    interviewSoftOpponentManaScoreBonus: SOFT_OPPONENT_MANA_SCORE_BONUS,
    interviewSoftManaHandoffPenalty: SOFT_MANA_HANDOFF_PENALTY,
    interviewSoftRoundtripPenalty: SOFT_ROUNDTRIP_PENALTY,
    enableSupermanaPrepassException: false,
    enableQuiescenceSearch: false,
    quietReductionDepthThreshold: 3,
    enableFutilityPruning: false,
  });
}

export function searchConfigForRuntime(
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  if (config.depth >= 3) {
    const rootBranchLimit = clamp(config.rootBranchLimit + 10, 6, 36);
    const nodeBranchLimit = clamp(
      subtractSaturating(config.nodeBranchLimit, 11),
      6,
      18,
    );
    return freezeConfig({
      ...config,
      rootBranchLimit,
      nodeBranchLimit,
      rootEnumLimit: clamp(rootBranchLimit * 6, rootBranchLimit, 220),
      nodeEnumLimit: clamp(nodeBranchLimit * 4, nodeBranchLimit, 108),
      scoringWeights: BALANCED_DISTANCE_SCORING_WEIGHTS,
    });
  }
  return freezeConfig({
    ...config,
    scoringWeights: MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
  });
}

export function withFastWideRootShape(
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  const rootBranchLimit = clamp(config.rootBranchLimit + 8, 8, 40);
  const nodeBranchLimit = clamp(
    subtractSaturating(config.nodeBranchLimit, 2),
    6,
    18,
  );
  return freezeConfig({
    ...config,
    rootBranchLimit,
    nodeBranchLimit,
    rootEnumLimit: clamp(rootBranchLimit * 6, rootBranchLimit, 240),
    nodeEnumLimit: clamp(nodeBranchLimit * 4, nodeBranchLimit, 108),
  });
}

export function withNormalDeeperShape(
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  const rootBranchLimit = clamp(config.rootBranchLimit, 8, 36);
  const nodeBranchLimit = clamp(config.nodeBranchLimit + 3, 9, 18);
  return freezeConfig({
    ...config,
    rootBranchLimit,
    nodeBranchLimit,
    rootEnumLimit: clamp(rootBranchLimit * 6, rootBranchLimit, 220),
    nodeEnumLimit: clamp(nodeBranchLimit * 6, nodeBranchLimit, 132),
  });
}

export function searchConfigFromPreference(
  preference: SmartAutomovePreference,
): AutomoveSearchConfig {
  const budget = AUTOMOVE_SEARCH_BUDGETS[preference];
  const runtime = searchConfigForRuntime(
    searchConfigFromBudget(budget.depth, budget.maxVisitedNodes),
  );

  if (preference === "fast") {
    return freezeConfig({
      ...withFastWideRootShape(runtime),
      enableTwoPassRootAllocation: false,
      enableSelectiveExtensions: false,
      enableQuietReductions: true,
      enableForcedTacticalPrepass: true,
      enableRootSpiritDevelopmentPref: true,
      enableRootReplyRiskGuard: true,
      rootReplyRiskScoreMargin: 125,
      rootReplyRiskShortlistMax: 4,
      rootReplyRiskReplyLimit: 10,
      rootReplyRiskNodeShareBp: 650,
      rootAntiHelpScoreMargin: 220,
      rootAntiHelpReplyLimit: ROOT_ANTI_HELP_REPLY_LIMIT_FAST,
      enableTwoPassVolatilityFocus: false,
      enableNormalRootSafetyRerank: false,
      enableNormalRootSafetyDeepFloor: false,
      enableInterviewHardSpiritDeploy: false,
      enableInterviewDeterministicTiebreak: false,
      preferCleanReplyRiskRoots: false,
      rootDrainerSafetyScoreMargin: ROOT_DRAINER_SAFETY_SCORE_MARGIN,
      rootManaHandoffPenalty: 300,
      rootBacktrackPenalty: 220,
      rootEfficiencyScoreMargin: 1_700,
      potionSpendPenaltyFast: 220,
      potionSpendPenaltyNormal: POTION_SPEND_PENALTY_NORMAL,
      interviewSoftSupermanaProgressBonus: 320,
      interviewSoftSupermanaScoreBonus: 600,
      interviewSoftOpponentManaProgressBonus: 200,
      interviewSoftOpponentManaScoreBonus: 310,
      interviewSoftManaHandoffPenalty: 280,
      interviewSoftRoundtripPenalty: 220,
      enableSupermanaPrepassException: true,
      scoringWeights: RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF,
    });
  }

  const deeper = withNormalDeeperShape(runtime);
  if (preference === "normal") {
    const firstNodeBudget = clamp(
      scaleFloor(deeper.maxVisitedNodes, 3, 2),
      deeper.maxVisitedNodes,
      MAX_MAX_VISITED_NODES,
    );
    const maxVisitedNodes = clamp(
      scaleFloor(firstNodeBudget, 112, 100),
      firstNodeBudget,
      MAX_MAX_VISITED_NODES,
    );
    const rootBranchLimit = clamp(
      subtractSaturating(deeper.rootBranchLimit, 1),
      12,
      38,
    );
    const nodeBranchLimit = clamp(deeper.nodeBranchLimit + 2, 8, 18);
    return freezeConfig({
      ...deeper,
      maxVisitedNodes,
      rootBranchLimit,
      nodeBranchLimit,
      rootEnumLimit: clamp(rootBranchLimit * 6, rootBranchLimit, 240),
      nodeEnumLimit: clamp((nodeBranchLimit + 2) * 6, nodeBranchLimit, 156),
      enableTwoPassRootAllocation: true,
      enableSelectiveExtensions: false,
      enableQuietReductions: false,
      enableForcedTacticalPrepass: true,
      enableRootSpiritDevelopmentPref: true,
      enableRootReplyRiskGuard: true,
      rootReplyRiskScoreMargin: 145,
      rootReplyRiskShortlistMax: 7,
      rootReplyRiskReplyLimit: 16,
      rootReplyRiskNodeShareBp: 1_350,
      rootAntiHelpScoreMargin: 300,
      rootAntiHelpReplyLimit: 10,
      enableTwoPassVolatilityFocus: true,
      enableNormalRootSafetyRerank: true,
      enableNormalRootSafetyDeepFloor: true,
      enableInterviewHardSpiritDeploy: true,
      enableInterviewDeterministicTiebreak: false,
      preferCleanReplyRiskRoots: true,
      rootDrainerSafetyScoreMargin: 4_200,
      rootManaHandoffPenalty: 340,
      rootBacktrackPenalty: 240,
      rootEfficiencyScoreMargin: 1_400,
      potionSpendPenaltyFast: POTION_SPEND_PENALTY_FAST,
      potionSpendPenaltyNormal: 130,
      interviewSoftSupermanaProgressBonus: 240,
      interviewSoftSupermanaScoreBonus: 300,
      interviewSoftOpponentManaProgressBonus: 220,
      interviewSoftOpponentManaScoreBonus: 280,
      interviewSoftManaHandoffPenalty: 340,
      interviewSoftRoundtripPenalty: 260,
    });
  }

  const rootBranchLimit = clamp(deeper.rootBranchLimit, 14, 34);
  const nodeBranchLimit = clamp(deeper.nodeBranchLimit, 9, 15);
  return freezeConfig({
    ...deeper,
    maxVisitedNodes: PRO_MAX_VISITED_NODES,
    rootBranchLimit,
    nodeBranchLimit,
    rootEnumLimit: clamp(rootBranchLimit * 6, rootBranchLimit, 204),
    nodeEnumLimit: clamp((nodeBranchLimit + 2) * 6, nodeBranchLimit, 132),
    enableTwoPassRootAllocation: true,
    enableSelectiveExtensions: true,
    enableQuietReductions: true,
    enableForcedTacticalPrepass: false,
    enableRootSpiritDevelopmentPref: true,
    enableRootReplyRiskGuard: true,
    rootReplyRiskScoreMargin: 165,
    rootReplyRiskShortlistMax: 9,
    rootReplyRiskReplyLimit: 24,
    rootReplyRiskNodeShareBp: 2_000,
    rootAntiHelpScoreMargin: 300,
    rootAntiHelpReplyLimit: 10,
    enableTwoPassVolatilityFocus: true,
    enableNormalRootSafetyRerank: true,
    enableNormalRootSafetyDeepFloor: true,
    enableInterviewHardSpiritDeploy: true,
    enableInterviewDeterministicTiebreak: false,
    preferCleanReplyRiskRoots: true,
    rootDrainerSafetyScoreMargin: 4_800,
    rootManaHandoffPenalty: 340,
    rootBacktrackPenalty: 240,
    rootEfficiencyScoreMargin: 1_400,
    enableFutilityPruning: true,
    quietReductionDepthThreshold: 2,
    potionSpendPenaltyFast: POTION_SPEND_PENALTY_FAST,
    potionSpendPenaltyNormal: 130,
    interviewSoftSupermanaProgressBonus: 240,
    interviewSoftSupermanaScoreBonus: 300,
    interviewSoftOpponentManaProgressBonus: 280,
    interviewSoftOpponentManaScoreBonus: 340,
    interviewSoftManaHandoffPenalty: 340,
    interviewSoftRoundtripPenalty: 260,
  });
}

export function withRuntimeScoringWeights(
  game: MonsGame,
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  const scoringWeights =
    config.depth < 3
      ? RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS_POTION_PREF
      : runtimePhaseAdaptiveWalkThreatMediumScoringProfile(game, config.depth)
          .weights;
  return freezeConfig({
    ...config,
    scoringWeights,
    maxVisitedNodes:
      config.depth >= 3
        ? scaleFloor(config.maxVisitedNodes, 120, 100)
        : config.maxVisitedNodes,
  });
}

export function applyRuntimeNormalFastPolicyBlock(
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  const rootBranchLimit = clamp(config.rootBranchLimit + 5, 12, 40);
  const nodeBranchLimit = clamp(
    subtractSaturating(config.nodeBranchLimit, 2),
    8,
    18,
  );
  return freezeConfig({
    ...config,
    rootBranchLimit,
    nodeBranchLimit,
    rootEnumLimit: clamp(rootBranchLimit * 6, rootBranchLimit, 240),
    nodeEnumLimit: clamp(nodeBranchLimit * 4, nodeBranchLimit, 108),
    enableTwoPassRootAllocation: false,
    enableSelectiveExtensions: false,
    enableQuietReductions: true,
    rootReplyRiskScoreMargin: 125,
    rootReplyRiskShortlistMax: 4,
    rootReplyRiskReplyLimit: 10,
    rootReplyRiskNodeShareBp: 650,
    rootAntiHelpScoreMargin: 220,
    rootAntiHelpReplyLimit: ROOT_ANTI_HELP_REPLY_LIMIT_FAST,
    enableTwoPassVolatilityFocus: false,
    enableNormalRootSafetyRerank: false,
    enableNormalRootSafetyDeepFloor: false,
    enableInterviewHardSpiritDeploy: false,
    enableInterviewDeterministicTiebreak: false,
    preferCleanReplyRiskRoots: false,
    rootDrainerSafetyScoreMargin: ROOT_DRAINER_SAFETY_SCORE_MARGIN,
    rootManaHandoffPenalty: 300,
    rootBacktrackPenalty: 220,
    rootEfficiencyScoreMargin: 1_700,
    potionSpendPenaltyFast: 220,
    potionSpendPenaltyNormal: POTION_SPEND_PENALTY_NORMAL,
    interviewSoftSupermanaProgressBonus: 320,
    interviewSoftSupermanaScoreBonus: 600,
    interviewSoftOpponentManaProgressBonus: 200,
    interviewSoftOpponentManaScoreBonus: 310,
    interviewSoftManaHandoffPenalty: 280,
    interviewSoftRoundtripPenalty: 220,
    enableSupermanaPrepassException: true,
    scoringWeights: RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF,
  });
}

export function applyRuntimeNormalFastCoreBudgetSpendProfile(
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  const policy = applyRuntimeNormalFastPolicyBlock(config);
  const rootBranchLimit = clamp(policy.rootBranchLimit + 2, 12, 40);
  return freezeConfig({
    ...policy,
    enableExactLiteChecks: true,
    exactLiteRootCallBudget: 1,
    exactLiteStaticCallBudget: 1,
    maxVisitedNodes: scaleFloor(policy.maxVisitedNodes, 130, 100),
    rootBranchLimit,
    rootEnumLimit: clamp(rootBranchLimit * 6, rootBranchLimit, 240),
    rootReplyRiskShortlistMax: Math.max(policy.rootReplyRiskShortlistMax, 5),
    rootReplyRiskReplyLimit: Math.max(policy.rootReplyRiskReplyLimit, 12),
    rootReplyRiskNodeShareBp: Math.max(policy.rootReplyRiskNodeShareBp, 900),
  });
}

export function applyProPrimaryProfile(
  game: MonsGame,
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  const rootBranchLimitBeforeFinalCap = clamp(config.rootBranchLimit, 14, 34);
  const nodeBranchLimitBeforeFinalCap = clamp(config.nodeBranchLimit, 9, 15);
  return freezeConfig({
    ...config,
    maxVisitedNodes: scaleFloor(PRO_MAX_VISITED_NODES, 9, 8),
    enableForcedTacticalPrepass: false,
    rootBranchLimit: Math.min(rootBranchLimitBeforeFinalCap + 1, 16),
    nodeBranchLimit: Math.min(nodeBranchLimitBeforeFinalCap + 1, 12),
    rootEnumLimit: clamp(
      rootBranchLimitBeforeFinalCap * 6,
      rootBranchLimitBeforeFinalCap,
      204,
    ),
    nodeEnumLimit: clamp(
      (nodeBranchLimitBeforeFinalCap + 2) * 6,
      nodeBranchLimitBeforeFinalCap,
      132,
    ),
    enableFutilityPruning: true,
    enableQuietReductions: true,
    quietReductionDepthThreshold: 2,
    enableRootReplyRiskGuard: true,
    rootReplyRiskScoreMargin: 165,
    rootReplyRiskShortlistMax: 9,
    rootReplyRiskReplyLimit: 24,
    rootReplyRiskNodeShareBp: 2_000,
    enableNormalRootSafetyRerank: true,
    enableNormalRootSafetyDeepFloor: true,
    rootDrainerSafetyScoreMargin: 4_800,
    enableSelectiveExtensions: true,
    enableInterviewDeterministicTiebreak: true,
    enableTurnHeadRerank: true,
    scoringWeights: runtimePhaseAdaptiveAttackerProximityScoringProfile(
      game,
      config.depth,
    ).weights,
    interviewSoftOpponentManaProgressBonus: 320,
    interviewSoftOpponentManaScoreBonus: 400,
    enableQuiescenceSearch: true,
  });
}

export function withPreExactRuntimePolicy(
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  return freezeConfig({
    ...config,
    enableExactLiteChecks: false,
    exactLiteRootCallBudget: 0,
    exactLiteStaticCallBudget: 0,
  });
}

export function shippingSearchConfigForGame(
  game: MonsGame,
  preference: SmartAutomovePreference,
): AutomoveSearchConfig {
  let config = withRuntimeScoringWeights(
    game,
    searchConfigFromPreference(preference),
  );
  if (preference === "pro") {
    config = applyProPrimaryProfile(game, config);
  }
  config = withPreExactRuntimePolicy(config);
  if (preference === "normal") {
    config = applyRuntimeNormalFastCoreBudgetSpendProfile(config);
  }
  return config;
}

export function applyShippingProConfig(
  config: AutomoveSearchConfig,
): AutomoveSearchConfig {
  return freezeConfig({
    ...config,
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
}

export function executionConfigFromSearchConfig(
  config: AutomoveSearchConfig,
  preference: SmartAutomovePreference,
  template?: AutomoveSearchExecutionConfig,
): AutomoveSearchExecutionConfig {
  return Object.freeze({
    ...template,
    ...config,
    preference,
    scoringKey: scoringWeightsKey(config.scoringWeights),
    useTranspositionTable: template?.useTranspositionTable ?? true,
    enableExactRootAnalysis: config.enableExactLiteChecks,
    ...AUTOMOVE_SEARCH_EXECUTION_CONSTANTS,
    potionSpendPenalty:
      config.depth >= 3
        ? config.potionSpendPenaltyNormal
        : config.potionSpendPenaltyFast,
    softSupermanaProgressBonus: config.interviewSoftSupermanaProgressBonus,
    softSupermanaScoreBonus: config.interviewSoftSupermanaScoreBonus,
    softOpponentManaProgressBonus:
      config.interviewSoftOpponentManaProgressBonus,
    softOpponentManaScoreBonus: config.interviewSoftOpponentManaScoreBonus,
    softManaHandoffPenalty: config.interviewSoftManaHandoffPenalty,
    softRoundtripPenalty: config.interviewSoftRoundtripPenalty,
  });
}

export function searchExecutionConfigForGame(
  game: MonsGame,
  preference: SmartAutomovePreference,
): AutomoveSearchExecutionConfig {
  const config = shippingSearchConfigForGame(game, preference);
  return executionConfigFromSearchConfig(config, preference);
}

export {
  searchConfigForRuntime as forRuntime,
  searchConfigFromBudget as fromBudget,
  searchConfigFromPreference as fromPreference,
};
