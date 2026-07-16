import {
  MonKind,
  isMonFainted,
  itemMon,
  type Color,
  type Input,
} from "../engine/domain.js";
import type { MonsGame } from "../engine/game.js";
import type { ScoringWeights } from "./scoring.js";

export type SmartAutomovePreference = "fast" | "normal" | "pro";

/**
 * Numeric mirror of the legacy Rust `TurnEngineMode` declaration.
 *
 * This value-shaped representation keeps the selector configuration acyclic;
 * the turn-engine module's public enum has the same ordinals.
 */
export const AUTOMOVE_TURN_ENGINE_MODE = Object.freeze({
  ProV1: 0,
  CurrentPro: 1,
} as const);

export type AutomoveTurnEngineMode =
  (typeof AUTOMOVE_TURN_ENGINE_MODE)[keyof typeof AUTOMOVE_TURN_ENGINE_MODE];

/** Exact camelCase mirror of the shipping Rust selector configuration. */
export type AutomoveSearchConfig = {
  readonly depth: number;
  readonly maxVisitedNodes: number;
  readonly rootEnumLimit: number;
  readonly rootBranchLimit: number;
  readonly nodeEnumLimit: number;
  readonly nodeBranchLimit: number;
  readonly scoringWeights: ScoringWeights;
  readonly enableTwoPassRootAllocation: boolean;
  readonly enableSelectiveExtensions: boolean;
  readonly enableQuietReductions: boolean;
  readonly enableTargetedDrainerAttackFallback: boolean;
  readonly enableForcedTacticalPrepass: boolean;
  readonly enableTurnHeadRerank: boolean;
  readonly enableTurnEngineSelector: boolean;
  readonly enableTurnEngineLowBudgetGuard: boolean;
  readonly enableTurnEngineMidTurnTacticalGuard: boolean;
  readonly enableTurnEngineSecondaryAnalysis: boolean;
  readonly enableTurnEngineSelectedFollowupProjection: boolean;
  readonly enableTurnEngineLateSafeManaRootPreference: boolean;
  readonly turnEngineMode: AutomoveTurnEngineMode;
  readonly turnEngineSeedCap: number;
  readonly turnEngineBeamWidth: number;
  readonly turnEnginePerNodeFamilyCap: number;
  readonly turnEngineStepCap: number;
  readonly turnEngineOpponentSeedCap: number;
  readonly turnEngineOpponentBeamWidth: number;
  readonly turnEngineReplySeedCap: number;
  readonly turnEngineReplyBeamWidth: number;
  readonly turnEngineExpansionCap: number;
  readonly turnEngineEnableSpiritFamily: boolean;
  readonly enableExactLiteChecks: boolean;
  readonly exactLiteRootCallBudget: number;
  readonly exactLiteStaticCallBudget: number;
  readonly enableRootSpiritDevelopmentPref: boolean;
  readonly enableRootReplyRiskGuard: boolean;
  readonly rootReplyRiskScoreMargin: number;
  readonly rootReplyRiskShortlistMax: number;
  readonly rootReplyRiskReplyLimit: number;
  readonly rootReplyRiskNodeShareBp: number;
  readonly rootAntiHelpScoreMargin: number;
  readonly rootAntiHelpReplyLimit: number;
  readonly enableTwoPassVolatilityFocus: boolean;
  readonly enableNormalRootSafetyRerank: boolean;
  readonly enableNormalRootSafetyDeepFloor: boolean;
  readonly enableInterviewHardSpiritDeploy: boolean;
  readonly enableInterviewDeterministicTiebreak: boolean;
  readonly preferCleanReplyRiskRoots: boolean;
  readonly rootDrainerSafetyScoreMargin: number;
  readonly rootManaHandoffPenalty: number;
  readonly rootBacktrackPenalty: number;
  readonly rootEfficiencyScoreMargin: number;
  readonly potionSpendPenaltyFast: number;
  readonly potionSpendPenaltyNormal: number;
  readonly interviewSoftSupermanaProgressBonus: number;
  readonly interviewSoftSupermanaScoreBonus: number;
  readonly interviewSoftOpponentManaProgressBonus: number;
  readonly interviewSoftOpponentManaScoreBonus: number;
  readonly interviewSoftManaHandoffPenalty: number;
  readonly interviewSoftRoundtripPenalty: number;
  readonly enableSupermanaPrepassException: boolean;
  readonly enableQuiescenceSearch: boolean;
  readonly quietReductionDepthThreshold: number;
  readonly enableFutilityPruning: boolean;
};

/**
 * A lossless bridge from the legacy selector config to the current search
 * implementation's constant-backed fields and naming.
 */
export type AutomoveSearchExecutionConfig = AutomoveSearchConfig & {
  readonly preference: SmartAutomovePreference;
  readonly scoringKey: string;
  /** Rust exposes this as a per-search execution switch. */
  readonly useTranspositionTable: boolean;
  readonly enableExactRootAnalysis: boolean;
  readonly maxExtensionsPerPath: number;
  readonly extensionNodeShareBp: number;
  readonly quiescenceNodeBudget: number;
  readonly quiescenceEnumLimit: number;
  readonly futilityMargin: number;
  readonly transpositionCapacity: number;
  readonly preferabilityCacheCapacity: number;
  readonly potionSpendPenalty: number;
  readonly softSupermanaProgressBonus: number;
  readonly softSupermanaScoreBonus: number;
  readonly softOpponentManaProgressBonus: number;
  readonly softOpponentManaScoreBonus: number;
  readonly softManaHandoffPenalty: number;
  readonly softRoundtripPenalty: number;
};

export type MoveClassFlags = {
  readonly immediateScore: boolean;
  readonly drainerAttack: boolean;
  readonly drainerSafetyRecover: boolean;
  readonly carrierProgress: boolean;
  readonly material: boolean;
  readonly quiet: boolean;
};

type RootObservation = {
  readonly rootRank: number;
  readonly inputs: readonly Input[];
  readonly game: MonsGame;
  readonly efficiency: number;
  readonly winsImmediately: boolean;
  readonly attacksOpponentDrainer: boolean;
  readonly ownDrainerVulnerable: boolean;
  readonly ownDrainerWalkVulnerable: boolean;
  readonly spiritDevelopment: boolean;
  readonly keepsAwakeSpiritOnBase: boolean;
  readonly manaHandoffToOpponent: boolean;
  readonly hasRoundtrip: boolean;
  readonly scoresSupermanaThisTurn: boolean;
  readonly scoresOpponentManaThisTurn: boolean;
  readonly safeSupermanaPickupNow: boolean;
  readonly safeOpponentManaPickupNow: boolean;
  readonly safeSupermanaProgressSteps: number;
  readonly safeOpponentManaProgressSteps: number;
  readonly scorePathBestSteps: number;
  readonly sameTurnScoreWindowValue: number;
  readonly spiritSetupGain: number;
  readonly spiritSameTurnScoreSetupNow: boolean;
  readonly spiritOwnManaSetupNow: boolean;
  readonly supermanaProgress: boolean;
  readonly opponentManaProgress: boolean;
  readonly interviewSoftPriority: number;
  readonly classes: MoveClassFlags;
};

/** Shared camelCase mirror of the legacy `ScoredRootMove`. */
export type ScoredRootMove = RootObservation & {
  readonly heuristic: number;
};

/** Shared camelCase mirror of the legacy `RootEvaluation`. */
export type RootEvaluation = RootObservation & {
  readonly score: number;
};

type CurrentProConfig = {
  readonly currentPro?: boolean;
  readonly turnEngineMode?: AutomoveTurnEngineMode;
};

export function currentProEnabled(config: CurrentProConfig): boolean {
  return (
    config.currentPro ??
    config.turnEngineMode === AUTOMOVE_TURN_ENGINE_MODE.CurrentPro
  );
}

export function hasAwakeSpiritOnBase(
  game: MonsGame,
  perspective: Color,
): boolean {
  const item = game.board.item(
    game.board.base({
      kind: MonKind.Spirit,
      color: perspective,
      cooldown: 0,
    }),
  );
  const mon = item === undefined ? undefined : itemMon(item);
  return (
    mon?.kind === MonKind.Spirit &&
    mon.color === perspective &&
    !isMonFainted(mon)
  );
}

export function shouldPreferSpiritDevelopment(
  game: MonsGame,
  perspective: Color,
): boolean {
  return (
    !game.isFirstTurn() &&
    game.playerCanMoveMon() &&
    hasAwakeSpiritOnBase(game, perspective)
  );
}

export function hasConcreteScoreSurface(
  root: ScoredRootMove | RootEvaluation,
): boolean {
  return (
    root.winsImmediately ||
    root.scoresSupermanaThisTurn ||
    root.scoresOpponentManaThisTurn ||
    root.safeSupermanaPickupNow ||
    root.safeOpponentManaPickupNow
  );
}

export function hasProgressSurface(
  root: ScoredRootMove | RootEvaluation,
): boolean {
  return (
    root.safeSupermanaPickupNow ||
    root.safeOpponentManaPickupNow ||
    root.supermanaProgress ||
    root.opponentManaProgress
  );
}

export function rootIsUnsafe(root: ScoredRootMove | RootEvaluation): boolean {
  return (
    root.manaHandoffToOpponent ||
    (root.ownDrainerVulnerable &&
      !root.classes.drainerSafetyRecover &&
      !root.attacksOpponentDrainer &&
      !hasConcreteScoreSurface(root))
  );
}

export function isPlainSpiritDevelopmentRoot(
  root: ScoredRootMove | RootEvaluation,
): boolean {
  return (
    root.spiritDevelopment &&
    !root.spiritSameTurnScoreSetupNow &&
    !root.spiritOwnManaSetupNow
  );
}
