import { TARGET_SCORE } from "../engine/config.js";
import { Color, inputKey } from "../engine/domain.js";
import { MonsGame } from "../engine/game.js";
import { BOARD_SIZE } from "../engine/geometry.js";
import {
  I32_MAX,
  I32_MIN,
  saturatingAddI32,
  saturatingSubI32,
} from "../engine/numerics.js";
import {
  BALANCED_DISTANCE_SCORING_WEIGHTS,
  evaluatePreferabilityWithWeightsAndExactPolicy,
} from "./scoring.js";
import { cacheWriteAllowed, cancelled, checkpoint } from "./deadline.js";
import { exactSearchStateHash } from "./exact.js";
import {
  Hash64Table,
  hash64,
  type Hash64,
  type Hash64Qualifier,
} from "./hash64.js";
import { rootFamily } from "./root-family.js";
import { evaluateSearchScore } from "./search.js";
import { enumerateLegalTransitions } from "./transitions.js";
import {
  TurnEngineMode,
  TurnPlanFamily,
  TurnEngineUtility,
  compareTurnEngineUtilities,
  compareUtilityPrimaryAxes,
  turnEngineCandidatePlan,
  turnEngineComparePlans,
  turnEngineEvaluatePlanWithReplies,
  turnEngineEvaluateStateUtility,
  type TurnEngineConfig,
  type TurnPlan,
} from "./turn-engine.js";
import {
  AUTOMOVE_TURN_ENGINE_MODE,
  currentProEnabled,
  hasProgressSurface,
  isPlainSpiritDevelopmentRoot,
  rootIsUnsafe as isUnsafe,
  type AutomoveSearchExecutionConfig,
  type MoveClassFlags,
  type RootEvaluation,
} from "./selector-types.js";
import {
  applyEarlyWhiteTurnEngineLimits,
  applyTurnEngineRerankLimits,
  currentProIsEarlyWhiteTurnStart,
} from "./turn-engine-config.js";

const SMART_TERMINAL_SCORE = Math.trunc(I32_MAX / 8);
const SMART_ROOT_REPLY_RISK_WINNER_SPREAD_SKIP = 700;
const REPLY_RISK_SNAPSHOT_CACHE_MAX_ENTRIES = 4_096;

export type ReplyRiskMoveClassFlags = MoveClassFlags;
export type ReplyRiskRootEvaluation = RootEvaluation;
export type ReplyRiskSearchConfigSource = AutomoveSearchExecutionConfig;

export type TurnEngineRootProjection = {
  readonly plan: TurnPlan;
};

export type ReplyRiskSearchConfig = Partial<AutomoveSearchExecutionConfig> & {
  readonly currentPro?: boolean;
  readonly allowExactStrategic?: boolean;
  readonly evaluationCacheKey?: string | number | bigint;
  readonly evaluateGame?: (game: MonsGame, perspective: Color) => number;
  readonly evaluateTurnEngineRootUtility?: (
    game: MonsGame,
    evaluation: ReplyRiskRootEvaluation,
    perspective: Color,
    family: TurnPlanFamily,
  ) => TurnEngineUtility;
  readonly spiritFollowupFloorScore?: (
    game: MonsGame,
    perspective: Color,
  ) => number;
  readonly normalRootSafetyDeepFloorScore?: (
    game: MonsGame,
    perspective: Color,
    replyLimit: number,
  ) => number;
  readonly buildTurnEnginePlanForReplyRisk?: (
    evaluation: ReplyRiskRootEvaluation,
    index: number,
    perspective: Color,
    engineConfig: TurnEngineConfig,
  ) => TurnPlan | undefined;
  readonly projectedGameForReplyRisk?: (
    evaluation: ReplyRiskRootEvaluation,
    index: number,
    perspective: Color,
  ) => MonsGame | undefined;
};

const FAST_REPLY_RISK_DEFAULTS = Object.freeze({
  currentPro: false,
  allowExactStrategic: false,
  turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.ProV1,
  enableRootReplyRiskGuard: true,
  rootReplyRiskScoreMargin: 125,
  rootReplyRiskShortlistMax: 4,
  rootReplyRiskReplyLimit: 10,
  rootReplyRiskNodeShareBp: 650,
  preferCleanReplyRiskRoots: false,
  enableInterviewDeterministicTiebreak: false,
});

const NORMAL_REPLY_RISK_DEFAULTS = Object.freeze({
  currentPro: false,
  allowExactStrategic: false,
  turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.ProV1,
  enableRootReplyRiskGuard: true,
  rootReplyRiskScoreMargin: 145,
  rootReplyRiskShortlistMax: 7,
  rootReplyRiskReplyLimit: 16,
  rootReplyRiskNodeShareBp: 1_350,
  preferCleanReplyRiskRoots: true,
  enableInterviewDeterministicTiebreak: false,
});

export const CURRENT_PRO_REPLY_RISK_DEFAULTS = Object.freeze({
  currentPro: true,
  allowExactStrategic: false,
  turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro,
  enableRootReplyRiskGuard: false,
  rootReplyRiskScoreMargin: 165,
  rootReplyRiskShortlistMax: 9,
  rootReplyRiskReplyLimit: 24,
  rootReplyRiskNodeShareBp: 2_000,
  preferCleanReplyRiskRoots: true,
  enableInterviewDeterministicTiebreak: true,
});

export const REPLY_RISK_DEFAULTS_BY_PREFERENCE = Object.freeze({
  fast: FAST_REPLY_RISK_DEFAULTS,
  normal: NORMAL_REPLY_RISK_DEFAULTS,
  pro: CURRENT_PRO_REPLY_RISK_DEFAULTS,
});

/** Bridges P5A's SearchConfig without making it carry reply-risk-only knobs. */
export function replyRiskConfigForSearch(
  config: ReplyRiskSearchConfigSource,
): ReplyRiskSearchConfig {
  const defaults = REPLY_RISK_DEFAULTS_BY_PREFERENCE[config.preference];
  return Object.freeze({
    ...defaults,
    ...config,
    currentPro: config.turnEngineMode === AUTOMOVE_TURN_ENGINE_MODE.CurrentPro,
    evaluationCacheKey: config.scoringKey,
  });
}

export type RootReplyRiskSnapshot = {
  readonly allowsImmediateOpponentWin: boolean;
  readonly opponentReachesMatchPoint: boolean;
  readonly worstReplyScore: number;
};

const replyRiskSnapshotCache = new Hash64Table<RootReplyRiskSnapshot>(
  REPLY_RISK_SNAPSHOT_CACHE_MAX_ENTRIES,
);
const spiritFollowupFloorCache = new Hash64Table<number>(
  REPLY_RISK_SNAPSHOT_CACHE_MAX_ENTRIES,
);
const selectedOverrideUtilityCache = new Hash64Table<TurnEngineUtility>(
  REPLY_RISK_SNAPSHOT_CACHE_MAX_ENTRIES,
);
const scoringWeightCacheIds = new WeakMap<object, number>();
let nextScoringWeightCacheId = 1;

type ReplyRiskCacheKey = {
  readonly hash: Hash64;
  readonly tag: number;
  readonly qualifier: Hash64Qualifier;
  readonly secondary?: Hash64;
};

function cacheGet<V>(
  cache: Hash64Table<V>,
  key: ReplyRiskCacheKey,
): V | undefined {
  return cache.get(key.hash, key.tag, key.secondary, key.qualifier);
}

function cacheSet<V>(
  cache: Hash64Table<V>,
  key: ReplyRiskCacheKey,
  value: V,
): void {
  cache.set(key.hash, value, key.tag, key.secondary, key.qualifier);
}

function conservativeSnapshot(): RootReplyRiskSnapshot {
  return {
    allowsImmediateOpponentWin: true,
    opponentReachesMatchPoint: true,
    worstReplyScore: -Math.trunc(SMART_TERMINAL_SCORE / 2),
  };
}

function evaluateGame(
  game: MonsGame,
  perspective: Color,
  config: ReplyRiskSearchConfig,
): number {
  return config.evaluateGame === undefined
    ? evaluatePreferabilityWithWeightsAndExactPolicy(
        game,
        perspective,
        config.scoringWeights ?? BALANCED_DISTANCE_SCORING_WEIGHTS,
        config.allowExactStrategic ?? false,
      )
    : config.evaluateGame(game, perspective);
}

function snapshotCacheKey(
  game: MonsGame,
  perspective: Color,
  replyLimit: number,
  config: ReplyRiskSearchConfig,
): ReplyRiskCacheKey | undefined {
  const weights = config.scoringWeights ?? BALANCED_DISTANCE_SCORING_WEIGHTS;
  let weightsId = scoringWeightCacheIds.get(weights);
  if (weightsId === undefined) {
    weightsId = nextScoringWeightCacheId;
    nextScoringWeightCacheId += 1;
    scoringWeightCacheIds.set(weights, weightsId);
  }
  // The packed fields occupy 38 of JavaScript's 53 exact integer bits:
  // reply limit [0, 65535], weight identity [1, 1_048_575], color, exact flag.
  // Bypass the cache if an injected configuration exceeds those bounds.
  if (
    !Number.isInteger(replyLimit) ||
    replyLimit < 0 ||
    replyLimit > 0xffff ||
    weightsId < 1 ||
    weightsId > 0x0f_ffff
  ) {
    return undefined;
  }
  const tag =
    replyLimit +
    weightsId * 0x1_0000 +
    perspective * 0x10_0000_0000 +
    Number(config.allowExactStrategic ?? false) * 0x20_0000_0000;
  return {
    hash: exactSearchStateHash(game),
    tag,
    qualifier: config.evaluationCacheKey,
  };
}

function selectedOverrideConfigKey(
  config: TurnEngineConfig,
  enableSelectedFollowupProjection: boolean,
): Hash64 | undefined {
  const fields: readonly (readonly [number, number])[] = [
    [config.ownSeedCap, 0xf],
    [config.ownBeam, 0x7],
    [config.perNodeFamilyCap, 0x7],
    [config.stepCap, 0x7],
    [config.opponentSeedCap, 0x7],
    [config.opponentBeam, 0x3],
    [config.replySeedCap, 0x3],
    [config.replyBeam, 0x3],
    [config.expansionCap, 0xff],
  ];
  if (
    fields.some(
      ([value, maximum]) =>
        !Number.isInteger(value) || value < 0 || value > maximum,
    )
  ) {
    return undefined;
  }
  const low =
    config.ownSeedCap |
    (config.ownBeam << 4) |
    (config.perNodeFamilyCap << 7) |
    (config.stepCap << 10) |
    (config.opponentSeedCap << 13) |
    (config.opponentBeam << 16) |
    (config.replySeedCap << 18) |
    (config.replyBeam << 20);
  const high =
    config.expansionCap |
    (Number(config.enableSpiritFamily) << 8) |
    (Number(enableSelectedFollowupProjection) << 9);
  return hash64(high, low);
}

export function clearReplyRiskCache(): void {
  replyRiskSnapshotCache.clear();
  clearReplyRiskAdvisorCaches();
}

/** Per-selector-call caches; reply-risk snapshots intentionally survive this seam. */
export function clearReplyRiskAdvisorCaches(): void {
  spiritFollowupFloorCache.clear();
  selectedOverrideUtilityCache.clear();
}

export function rootReplyRiskSnapshot(
  stateAfterMove: MonsGame,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  replyLimit: number,
): RootReplyRiskSnapshot {
  if (checkpoint()) return conservativeSnapshot();
  const normalizedReplyLimit = Math.max(1, Math.trunc(replyLimit));
  const cacheable = config.evaluateGame === undefined;
  const key = cacheable
    ? snapshotCacheKey(
        stateAfterMove,
        perspective,
        normalizedReplyLimit,
        config,
      )
    : undefined;
  if (key !== undefined) {
    const cached = cacheGet(replyRiskSnapshotCache, key);
    if (cached !== undefined) return cached;
  }

  const winner = stateAfterMove.winnerColor();
  let snapshot: RootReplyRiskSnapshot;
  if (winner !== undefined) {
    const perspectiveWon = winner === perspective;
    snapshot = {
      allowsImmediateOpponentWin: !perspectiveWon,
      opponentReachesMatchPoint: !perspectiveWon,
      worstReplyScore: perspectiveWon
        ? Math.trunc(SMART_TERMINAL_SCORE / 2)
        : -Math.trunc(SMART_TERMINAL_SCORE / 2),
    };
  } else if (stateAfterMove.activeColor === perspective) {
    snapshot = {
      allowsImmediateOpponentWin: false,
      opponentReachesMatchPoint: false,
      worstReplyScore: evaluateGame(stateAfterMove, perspective, config),
    };
  } else {
    const replies = enumerateLegalTransitions(
      stateAfterMove,
      normalizedReplyLimit,
    );
    if (checkpoint()) return conservativeSnapshot();
    if (replies.length === 0) {
      snapshot = {
        allowsImmediateOpponentWin: false,
        opponentReachesMatchPoint: false,
        worstReplyScore: Math.trunc(SMART_TERMINAL_SCORE / 4),
      };
    } else {
      let allowsImmediateOpponentWin = false;
      let opponentReachesMatchPoint = false;
      let worstReplyScore = I32_MAX;
      let evaluatedReply = false;
      for (const reply of replies) {
        if (checkpoint()) return conservativeSnapshot();
        const afterReply = reply.game;
        evaluatedReply = true;
        const opponentScoreAfter =
          perspective === Color.White
            ? afterReply.blackScore
            : afterReply.whiteScore;
        if (TARGET_SCORE - opponentScoreAfter <= 1) {
          opponentReachesMatchPoint = true;
        }
        const replyWinner = afterReply.winnerColor();
        let replyScore: number;
        if (replyWinner === perspective) {
          replyScore = Math.trunc(SMART_TERMINAL_SCORE / 2);
        } else if (replyWinner !== undefined) {
          allowsImmediateOpponentWin = true;
          opponentReachesMatchPoint = true;
          replyScore = -Math.trunc(SMART_TERMINAL_SCORE / 2);
        } else {
          replyScore = evaluateGame(afterReply, perspective, config);
        }
        worstReplyScore = Math.min(worstReplyScore, replyScore);
        if (allowsImmediateOpponentWin) break;
      }
      if (!evaluatedReply || worstReplyScore === I32_MAX) {
        worstReplyScore = evaluateGame(stateAfterMove, perspective, config);
      }
      snapshot = {
        allowsImmediateOpponentWin,
        opponentReachesMatchPoint,
        worstReplyScore,
      };
    }
  }

  if (cacheWriteAllowed() && key !== undefined) {
    cacheSet(replyRiskSnapshotCache, key, snapshot);
  }
  return snapshot;
}

function boolOrder(preferred: boolean, other: boolean): number {
  return preferred === other ? 0 : preferred ? -1 : 1;
}

function progressStepsBetter(candidate: number, incumbent: number): boolean {
  const unknownSteps = 15;
  const candidateKnown = candidate < unknownSteps;
  const incumbentKnown = incumbent < unknownSteps;
  return candidateKnown && (!incumbentKnown || candidate < incumbent);
}

function scorePathStepsBetter(candidate: number, incumbent: number): boolean {
  const unknownSteps = 33;
  const candidateKnown = candidate < unknownSteps;
  const incumbentKnown = incumbent < unknownSteps;
  return candidateKnown && (!incumbentKnown || candidate < incumbent);
}

function compareTacticalRoots(
  candidate: ReplyRiskRootEvaluation,
  incumbent: ReplyRiskRootEvaluation,
): number {
  const booleanAxes: readonly (readonly [boolean, boolean, boolean])[] = [
    [candidate.winsImmediately, incumbent.winsImmediately, true],
    [candidate.attacksOpponentDrainer, incumbent.attacksOpponentDrainer, true],
    [candidate.ownDrainerVulnerable, incumbent.ownDrainerVulnerable, false],
    [candidate.classes.immediateScore, incumbent.classes.immediateScore, true],
    [
      candidate.scoresSupermanaThisTurn,
      incumbent.scoresSupermanaThisTurn,
      true,
    ],
    [
      candidate.scoresOpponentManaThisTurn,
      incumbent.scoresOpponentManaThisTurn,
      true,
    ],
    [candidate.safeSupermanaPickupNow, incumbent.safeSupermanaPickupNow, true],
    [
      candidate.safeOpponentManaPickupNow,
      incumbent.safeOpponentManaPickupNow,
      true,
    ],
  ];
  for (const [candidateValue, incumbentValue, preferTrue] of booleanAxes) {
    const order = preferTrue
      ? boolOrder(candidateValue, incumbentValue)
      : boolOrder(!candidateValue, !incumbentValue);
    if (order !== 0) return order;
  }
  if (
    candidate.sameTurnScoreWindowValue !== incumbent.sameTurnScoreWindowValue
  ) {
    return (
      incumbent.sameTurnScoreWindowValue - candidate.sameTurnScoreWindowValue
    );
  }
  for (const [candidateValue, incumbentValue] of [
    [
      candidate.spiritSameTurnScoreSetupNow,
      incumbent.spiritSameTurnScoreSetupNow,
    ],
    [candidate.spiritOwnManaSetupNow, incumbent.spiritOwnManaSetupNow],
  ] as const) {
    const order = boolOrder(candidateValue, incumbentValue);
    if (order !== 0) return order;
  }
  if (
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.supermanaProgress &&
    incumbent.supermanaProgress &&
    candidate.safeSupermanaProgressSteps !==
      incumbent.safeSupermanaProgressSteps
  ) {
    return progressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      incumbent.safeSupermanaProgressSteps,
    )
      ? -1
      : 1;
  }
  if (
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.opponentManaProgress &&
    incumbent.opponentManaProgress &&
    candidate.safeOpponentManaProgressSteps !==
      incumbent.safeOpponentManaProgressSteps
  ) {
    return progressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      incumbent.safeOpponentManaProgressSteps,
    )
      ? -1
      : 1;
  }
  if (
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.scorePathBestSteps !== incumbent.scorePathBestSteps
  ) {
    return scorePathStepsBetter(
      candidate.scorePathBestSteps,
      incumbent.scorePathBestSteps,
    )
      ? -1
      : 1;
  }
  let order = boolOrder(
    candidate.supermanaProgress,
    incumbent.supermanaProgress,
  );
  if (order !== 0) return order;
  if (
    candidate.supermanaProgress &&
    incumbent.supermanaProgress &&
    candidate.safeSupermanaProgressSteps !==
      incumbent.safeSupermanaProgressSteps
  ) {
    return progressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      incumbent.safeSupermanaProgressSteps,
    )
      ? -1
      : 1;
  }
  order = boolOrder(
    candidate.opponentManaProgress,
    incumbent.opponentManaProgress,
  );
  if (order !== 0) return order;
  if (
    candidate.opponentManaProgress &&
    incumbent.opponentManaProgress &&
    candidate.safeOpponentManaProgressSteps !==
      incumbent.safeOpponentManaProgressSteps
  ) {
    return progressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      incumbent.safeOpponentManaProgressSteps,
    )
      ? -1
      : 1;
  }
  for (const [candidateValue, incumbentValue, preferTrue] of [
    [candidate.manaHandoffToOpponent, incumbent.manaHandoffToOpponent, false],
    [candidate.hasRoundtrip, incumbent.hasRoundtrip, false],
    [candidate.spiritDevelopment, incumbent.spiritDevelopment, true],
  ] as const) {
    order = preferTrue
      ? boolOrder(candidateValue, incumbentValue)
      : boolOrder(!candidateValue, !incumbentValue);
    if (order !== 0) return order;
  }
  if (candidate.interviewSoftPriority !== incumbent.interviewSoftPriority) {
    return incumbent.interviewSoftPriority - candidate.interviewSoftPriority;
  }
  return incumbent.efficiency - candidate.efficiency;
}

export function compareRankedReplyRiskEvaluations(
  evaluations: readonly ReplyRiskRootEvaluation[],
  leftIndex: number,
  rightIndex: number,
): number {
  const left = evaluations[leftIndex];
  const right = evaluations[rightIndex];
  if (left === undefined || right === undefined) return leftIndex - rightIndex;
  return (
    right.score - left.score ||
    compareTacticalRoots(left, right) ||
    leftIndex - rightIndex
  );
}

function rootProgressOrSetupBetter(
  candidate: ReplyRiskRootEvaluation,
  incumbent: ReplyRiskRootEvaluation,
): boolean {
  return (
    progressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      incumbent.safeSupermanaProgressSteps,
    ) ||
    progressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      incumbent.safeOpponentManaProgressSteps,
    ) ||
    candidate.spiritSetupGain > incumbent.spiritSetupGain
  );
}

function isTacticalPriorityRoot(root: ReplyRiskRootEvaluation): boolean {
  return (
    root.classes.immediateScore ||
    root.classes.drainerAttack ||
    root.classes.drainerSafetyRecover
  );
}

function rankedRootOrder(
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndex: number,
  incumbentIndex: number,
): number {
  const candidate = evaluations[candidateIndex];
  const incumbent = evaluations[incumbentIndex];
  if (candidate === undefined || incumbent === undefined) {
    return incumbentIndex - candidateIndex;
  }
  if (candidate.score !== incumbent.score) {
    return candidate.score > incumbent.score ? 1 : -1;
  }
  const tactical = compareTacticalRoots(candidate, incumbent);
  if (tactical !== 0) return tactical < 0 ? 1 : -1;
  return candidateIndex === incumbentIndex
    ? 0
    : candidateIndex < incumbentIndex
      ? 1
      : -1;
}

function sameNonTacticalProgressLane(
  candidate: ReplyRiskRootEvaluation,
  anchor: ReplyRiskRootEvaluation,
): boolean {
  const sameProgressSteps =
    candidate.safeSupermanaProgressSteps ===
      anchor.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      anchor.safeOpponentManaProgressSteps;
  const meaningfulProgressRoute =
    sameProgressSteps &&
    (candidate.safeSupermanaProgressSteps < BOARD_SIZE + 4 ||
      candidate.safeOpponentManaProgressSteps < BOARD_SIZE + 4);
  return (
    meaningfulProgressRoute &&
    candidate.safeSupermanaPickupNow === anchor.safeSupermanaPickupNow &&
    candidate.safeOpponentManaPickupNow === anchor.safeOpponentManaPickupNow &&
    candidate.supermanaProgress === anchor.supermanaProgress &&
    candidate.opponentManaProgress === anchor.opponentManaProgress &&
    !candidate.classes.immediateScore &&
    !candidate.classes.drainerAttack &&
    !candidate.classes.drainerSafetyRecover &&
    !anchor.classes.immediateScore &&
    !anchor.classes.drainerAttack &&
    !anchor.classes.drainerSafetyRecover &&
    !candidate.spiritDevelopment &&
    !anchor.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !anchor.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !anchor.spiritOwnManaSetupNow &&
    candidate.sameTurnScoreWindowValue === 0 &&
    anchor.sameTurnScoreWindowValue === 0 &&
    !candidate.manaHandoffToOpponent &&
    !anchor.manaHandoffToOpponent &&
    !candidate.hasRoundtrip &&
    !anchor.hasRoundtrip
  );
}

export function replyRiskGuardShortlistIndices(
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndices: readonly number[],
  config: ReplyRiskSearchConfig,
): number[] {
  if (candidateIndices.length === 0 || checkpoint()) return [];
  let bestScore = I32_MIN;
  let worstScore = I32_MAX;
  let hasWinningCandidate = false;
  for (const index of candidateIndices) {
    const root = evaluations[index];
    if (root === undefined) continue;
    bestScore = Math.max(bestScore, root.score);
    worstScore = Math.min(worstScore, root.score);
    hasWinningCandidate ||= root.winsImmediately;
  }
  if (
    hasWinningCandidate &&
    saturatingSubI32(bestScore, worstScore) >
      SMART_ROOT_REPLY_RISK_WINNER_SPREAD_SKIP
  ) {
    return [];
  }
  const scoreMargin = Math.max(0, config.rootReplyRiskScoreMargin ?? 165);
  let shortlist = candidateIndices.filter((index) => {
    const root = evaluations[index];
    return (
      root !== undefined &&
      saturatingAddI32(root.score, scoreMargin) >= bestScore
    );
  });
  shortlist.sort((left, right) =>
    compareRankedReplyRiskEvaluations(evaluations, left, right),
  );
  if (shortlist.length === 0) return shortlist;
  const shortlistLimit = Math.max(1, config.rootReplyRiskShortlistMax ?? 9);
  if (shortlist.length > shortlistLimit) {
    if (currentProEnabled(config)) {
      const retained = shortlist.slice(0, shortlistLimit);
      const retainedHasSpirit = retained.some((index) => {
        const root = evaluations[index];
        return (
          root !== undefined &&
          (root.spiritDevelopment ||
            root.spiritSameTurnScoreSetupNow ||
            root.spiritOwnManaSetupNow)
        );
      });
      const bestShortlistScore =
        evaluations[shortlist[0] ?? -1]?.score ?? bestScore;
      const extras: number[] = [];
      if (!retainedHasSpirit) {
        const spirit = shortlist.slice(shortlistLimit).find((index) => {
          const root = evaluations[index];
          return (
            root !== undefined &&
            saturatingSubI32(bestShortlistScore, root.score) <= 64 &&
            (root.spiritDevelopment ||
              root.spiritSameTurnScoreSetupNow ||
              root.spiritOwnManaSetupNow)
          );
        });
        if (spirit !== undefined) extras.push(spirit);
      }
      const hasPlainSpiritAnchor = [...retained, ...extras].some((index) => {
        const root = evaluations[index];
        return root !== undefined && isPlainSpiritDevelopmentRoot(root);
      });
      if (hasPlainSpiritAnchor) {
        let siblingsAdded = 0;
        for (const index of shortlist.slice(shortlistLimit)) {
          const root = evaluations[index];
          if (
            root !== undefined &&
            isPlainSpiritDevelopmentRoot(root) &&
            saturatingSubI32(bestShortlistScore, root.score) <= 64 &&
            !extras.includes(index)
          ) {
            extras.push(index);
            siblingsAdded += 1;
            if (siblingsAdded >= 2) break;
          }
        }
      }
      shortlist = [...retained, ...extras];
    } else {
      shortlist = shortlist.slice(0, shortlistLimit);
    }
  }

  const anchorIndex = shortlist[0];
  const anchor =
    anchorIndex === undefined ? undefined : evaluations[anchorIndex];
  if (
    currentProEnabled(config) &&
    anchor !== undefined &&
    isUnsafe(anchor) &&
    hasProgressSurface(anchor)
  ) {
    const extension = candidateIndices
      .filter((index) => !shortlist.includes(index))
      .filter((index) => {
        const root = evaluations[index];
        return (
          root !== undefined &&
          !isUnsafe(root) &&
          sameNonTacticalProgressLane(root, anchor) &&
          saturatingSubI32(anchor.score, root.score) <= 320
        );
      })
      .sort((left, right) =>
        compareRankedReplyRiskEvaluations(evaluations, left, right),
      )[0];
    if (extension !== undefined) shortlist.push(extension);
  }
  shortlist.sort((left, right) =>
    compareRankedReplyRiskEvaluations(evaluations, left, right),
  );
  return shortlist;
}

function currentProSecondaryAnalysisLive(
  config: ReplyRiskSearchConfig,
): boolean {
  return (
    config.enableTurnEngineSelector === true &&
    currentProEnabled(config) &&
    config.enableTurnEngineSecondaryAnalysis === true
  );
}

export function canTurnEngineProjectReplyRiskRoot(
  root: ReplyRiskRootEvaluation,
  perspective: Color,
): boolean {
  return (
    root.game.activeColor === perspective &&
    root.game.winnerColor() === undefined
  );
}

function isTacticalTurnEngineFamily(family: TurnPlanFamily): boolean {
  return (
    family === TurnPlanFamily.ImmediateScore ||
    family === TurnPlanFamily.DenyOpponentWindow ||
    family === TurnPlanFamily.DrainerKill
  );
}

function isInformativeReplyRiskProjectionFamily(
  family: TurnPlanFamily,
): boolean {
  return (
    isTacticalTurnEngineFamily(family) ||
    family === TurnPlanFamily.SpiritImpact ||
    family === TurnPlanFamily.DrainerSafetyRecovery
  );
}

export function shouldUseReplyRiskProjectionForRoot(
  root: ReplyRiskRootEvaluation,
  projection: TurnEngineRootProjection,
  perspective: Color,
  config: ReplyRiskSearchConfig,
): boolean {
  if (
    config.enableTurnEngineSelector !== true ||
    !currentProEnabled(config) ||
    !canTurnEngineProjectReplyRiskRoot(root, perspective) ||
    isPlainSpiritDevelopmentRoot(root)
  ) {
    return false;
  }

  if (
    projection.plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !root.spiritDevelopment &&
    root.ownDrainerVulnerable
  ) {
    return false;
  }

  if (isInformativeReplyRiskProjectionFamily(projection.plan.headFamily)) {
    return true;
  }

  return (
    (projection.plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      projection.plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    hasProgressSurface(root)
  );
}

export function rootReplyRiskSnapshotWithProjection(
  root: ReplyRiskRootEvaluation,
  projection: TurnEngineRootProjection | undefined,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  replyLimit: number,
): RootReplyRiskSnapshot {
  const state =
    projection !== undefined &&
    shouldUseReplyRiskProjectionForRoot(root, projection, perspective, config)
      ? projection.plan.endGame
      : root.game;
  return rootReplyRiskSnapshot(state, perspective, config, replyLimit);
}

function normalizedTurnEngineMode(
  config: ReplyRiskSearchConfig,
): TurnEngineMode {
  return currentProEnabled(config)
    ? TurnEngineMode.CurrentPro
    : TurnEngineMode.ProV1;
}

function positiveCap(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.trunc(value ?? fallback));
}

function fullTurnEngineConfig(config: ReplyRiskSearchConfig): TurnEngineConfig {
  return {
    mode: normalizedTurnEngineMode(config),
    ownSeedCap: positiveCap(config.turnEngineSeedCap, 14),
    ownBeam: positiveCap(config.turnEngineBeamWidth, 5),
    perNodeFamilyCap: positiveCap(config.turnEnginePerNodeFamilyCap, 4),
    stepCap: positiveCap(config.turnEngineStepCap, 6),
    opponentSeedCap: positiveCap(config.turnEngineOpponentSeedCap, 6),
    opponentBeam: positiveCap(config.turnEngineOpponentBeamWidth, 2),
    replySeedCap: positiveCap(config.turnEngineReplySeedCap, 3),
    replyBeam: positiveCap(config.turnEngineReplyBeamWidth, 1),
    expansionCap: positiveCap(config.turnEngineExpansionCap, 176),
    enableSpiritFamily: config.turnEngineEnableSpiritFamily ?? true,
    scoringWeights: config.scoringWeights ?? BALANCED_DISTANCE_SCORING_WEIGHTS,
    enableLazyOracleScoreWindowProjection: false,
  };
}

function rerankTurnEngineConfig(
  config: ReplyRiskSearchConfig,
): TurnEngineConfig {
  return applyTurnEngineRerankLimits(fullTurnEngineConfig(config));
}

function projectionTurnEngineConfig(
  game: MonsGame,
  config: ReplyRiskSearchConfig,
): TurnEngineConfig {
  let engine = fullTurnEngineConfig(config);
  if (
    engine.mode === TurnEngineMode.CurrentPro &&
    config.enableTurnEngineLowBudgetGuard === true &&
    currentProIsEarlyWhiteTurnStart(game)
  ) {
    engine = applyEarlyWhiteTurnEngineLimits(engine);
  }
  const currentPro = engine.mode === TurnEngineMode.CurrentPro;
  return {
    ...engine,
    ownSeedCap: Math.min(engine.ownSeedCap, currentPro ? 8 : 6),
    ownBeam: Math.min(engine.ownBeam, currentPro ? 3 : 2),
    perNodeFamilyCap: Math.min(engine.perNodeFamilyCap, currentPro ? 3 : 2),
    stepCap: Math.min(engine.stepCap, 4),
    opponentSeedCap: Math.min(engine.opponentSeedCap, currentPro ? 2 : 1),
    opponentBeam: 1,
    replySeedCap: 1,
    replyBeam: 1,
    expansionCap: Math.min(engine.expansionCap, currentPro ? 64 : 48),
  };
}

function maxTurnEngineUtility(
  left: TurnEngineUtility,
  right: TurnEngineUtility,
): TurnEngineUtility {
  return compareTurnEngineUtilities(left, right) >= 0 ? left : right;
}

function turnEngineRootPlanUtilityWithConfig(
  game: MonsGame,
  evaluation: ReplyRiskRootEvaluation,
  perspective: Color,
  engineConfig: TurnEngineConfig,
  family: TurnPlanFamily,
): TurnEngineUtility {
  const headUtility = turnEngineEvaluateStateUtility(
    evaluation.game,
    game,
    perspective,
    engineConfig,
  );
  const plan: TurnPlan = {
    actions: [],
    compiledChunks: [evaluation.inputs],
    endGame: evaluation.game.cloneForSimulation(),
    utility: headUtility,
    headUtility,
    headFamily: family,
    goalFamily: family,
    packageMeta: {
      scoreGain: 0,
      denyGain: 0,
      drainerSafetyDelta: 0,
      spiritOnlySetup: false,
      endsNonnegativeDrainerSafety: true,
      opponentImmediateWindowAfter: 0,
    },
  };
  return turnEngineEvaluatePlanWithReplies(
    game,
    plan,
    perspective,
    engineConfig,
  );
}

function turnEngineRootPlanUtility(
  game: MonsGame,
  evaluation: ReplyRiskRootEvaluation,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  family: TurnPlanFamily,
): TurnEngineUtility {
  const injected = config.evaluateTurnEngineRootUtility?.(
    game,
    evaluation,
    perspective,
    family,
  );
  return (
    injected ??
    turnEngineRootPlanUtilityWithConfig(
      game,
      evaluation,
      perspective,
      fullTurnEngineConfig(config),
      family,
    )
  );
}

function turnEngineSelectedOverrideUtility(
  game: MonsGame,
  evaluation: ReplyRiskRootEvaluation,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  family: TurnPlanFamily,
): TurnEngineUtility {
  const injected = config.evaluateTurnEngineRootUtility?.(
    game,
    evaluation,
    perspective,
    family,
  );
  if (injected !== undefined) return injected;
  const engineConfig = projectionTurnEngineConfig(evaluation.game, config);
  const baseCacheKey = snapshotCacheKey(
    evaluation.game,
    perspective,
    family + 1,
    config,
  );
  const configKey = selectedOverrideConfigKey(
    engineConfig,
    config.enableTurnEngineSelectedFollowupProjection === true,
  );
  const cacheKey =
    baseCacheKey === undefined || configKey === undefined
      ? undefined
      : { ...baseCacheKey, secondary: configKey };
  if (cacheKey !== undefined) {
    const cached = cacheGet(selectedOverrideUtilityCache, cacheKey);
    if (cached !== undefined) return cached;
  }
  const baseStateUtility = turnEngineEvaluateStateUtility(
    evaluation.game,
    game,
    perspective,
    engineConfig,
  );
  let result: TurnEngineUtility;
  if (!currentProSecondaryAnalysisLive(config)) {
    result = baseStateUtility;
  } else {
    const baseUtility = turnEngineRootPlanUtilityWithConfig(
      game,
      evaluation,
      perspective,
      engineConfig,
      family,
    );
    if (
      config.enableTurnEngineSelectedFollowupProjection !== true ||
      !canTurnEngineProjectReplyRiskRoot(evaluation, perspective)
    ) {
      result = maxTurnEngineUtility(baseUtility, baseStateUtility);
    } else {
      const hasFollowupSurface =
        evaluation.ownDrainerVulnerable ||
        evaluation.spiritDevelopment ||
        evaluation.spiritSameTurnScoreSetupNow ||
        evaluation.spiritOwnManaSetupNow ||
        hasProgressSurface(evaluation);
      const safeBlackManaTempoProjection =
        evaluation.game.activeColor === Color.Black &&
        (family === TurnPlanFamily.ManaTempo ||
          family === TurnPlanFamily.DrainerSafetyRecovery) &&
        !hasFollowupSurface &&
        !isUnsafe(evaluation) &&
        !evaluation.manaHandoffToOpponent &&
        !evaluation.hasRoundtrip &&
        !evaluation.winsImmediately &&
        !evaluation.attacksOpponentDrainer;
      if (!hasFollowupSurface && !safeBlackManaTempoProjection) {
        result = baseUtility;
      } else {
        const projectedPlan = turnEngineCandidatePlan(
          evaluation.game,
          perspective,
          engineConfig,
        );
        result =
          projectedPlan === undefined
            ? baseUtility
            : maxTurnEngineUtility(projectedPlan.utility, baseUtility);
      }
    }
  }
  if (cacheWriteAllowed() && cacheKey !== undefined) {
    cacheSet(selectedOverrideUtilityCache, cacheKey, result);
  }
  return result;
}

function isCurrentProWhiteManaSiblingPair(
  candidate: ReplyRiskRootEvaluation,
  incumbent: ReplyRiskRootEvaluation,
  config: ReplyRiskSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    rootFamily(candidate) === TurnPlanFamily.ManaTempo &&
    rootFamily(incumbent) === TurnPlanFamily.ManaTempo &&
    candidate.efficiency === incumbent.efficiency &&
    !candidate.ownDrainerVulnerable &&
    !incumbent.ownDrainerVulnerable &&
    !candidate.ownDrainerWalkVulnerable &&
    !incumbent.ownDrainerWalkVulnerable &&
    !isUnsafe(candidate) &&
    !isUnsafe(incumbent) &&
    sameNonTacticalProgressLane(candidate, incumbent)
  );
}

export function currentProWhiteTurnFourManaSiblingReentry(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  perspective: Color,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount < 4
  ) {
    return undefined;
  }
  const anchorIndex = [...shortlist]
    .filter((index) => {
      const root = evaluations[index];
      return (
        root !== undefined &&
        rootFamily(root) === TurnPlanFamily.ManaTempo &&
        !root.ownDrainerVulnerable &&
        !root.ownDrainerWalkVulnerable &&
        !isUnsafe(root) &&
        !root.manaHandoffToOpponent &&
        !root.hasRoundtrip &&
        !root.winsImmediately &&
        !root.attacksOpponentDrainer &&
        root.sameTurnScoreWindowValue === 0 &&
        !root.scoresSupermanaThisTurn &&
        !root.scoresOpponentManaThisTurn &&
        !root.safeSupermanaPickupNow &&
        !root.safeOpponentManaPickupNow
      );
    })
    .sort((left, right) => -rankedRootOrder(evaluations, left, right))[0];
  if (anchorIndex === undefined) return undefined;
  const anchor = evaluations[anchorIndex];
  if (anchor === undefined) return undefined;
  const anchorUtility = turnEngineRootPlanUtility(
    game,
    anchor,
    perspective,
    config,
    TurnPlanFamily.ManaTempo,
  );
  let bestIndex: number | undefined;
  let bestUtility: TurnEngineUtility | undefined;
  let bestIsDominance = false;
  evaluations.forEach((candidate, index) => {
    const sameLaneNearBest =
      isCurrentProWhiteManaSiblingPair(candidate, anchor, config) &&
      saturatingSubI32(anchor.score, candidate.score) <= 24 &&
      Math.abs(anchor.rootRank - candidate.rootRank) <= 4 &&
      candidate.rootRank < anchor.rootRank;
    if (
      shortlist.includes(index) ||
      rootFamily(candidate) !== TurnPlanFamily.ManaTempo ||
      candidate.ownDrainerVulnerable ||
      candidate.ownDrainerWalkVulnerable ||
      isUnsafe(candidate) ||
      candidate.manaHandoffToOpponent ||
      candidate.hasRoundtrip ||
      candidate.winsImmediately ||
      candidate.attacksOpponentDrainer ||
      candidate.sameTurnScoreWindowValue > 0 ||
      candidate.scoresSupermanaThisTurn ||
      candidate.scoresOpponentManaThisTurn ||
      candidate.safeSupermanaPickupNow ||
      candidate.safeOpponentManaPickupNow ||
      (!sameLaneNearBest &&
        candidate.score < saturatingSubI32(anchor.score, 96)) ||
      (candidate.rootRank >= anchor.rootRank && !sameLaneNearBest)
    ) {
      return;
    }
    const utility = turnEngineRootPlanUtility(
      game,
      candidate,
      perspective,
      config,
      TurnPlanFamily.ManaTempo,
    );
    const utilityOrder = compareUtilityPrimaryAxes(utility, anchorUtility);
    const dominance =
      utilityOrder > 0 || utility.strictlyDominatesOverrideAxes(anchorUtility);
    if (!dominance && !sameLaneNearBest) return;
    const currentIndex = bestIndex;
    const currentBestUtility = bestUtility;
    let replace =
      currentIndex === undefined || currentBestUtility === undefined;
    if (currentIndex !== undefined && currentBestUtility !== undefined) {
      const current = evaluations[currentIndex];
      if (current === undefined) {
        replace = true;
      } else {
        const currentSameLane =
          isCurrentProWhiteManaSiblingPair(current, anchor, config) &&
          saturatingSubI32(anchor.score, current.score) <= 24 &&
          Math.abs(anchor.rootRank - current.rootRank) <= 4 &&
          current.rootRank < anchor.rootRank;
        if (dominance !== bestIsDominance) {
          replace = dominance;
        } else if (dominance) {
          const currentOrder = compareUtilityPrimaryAxes(
            utility,
            currentBestUtility,
          );
          replace =
            currentOrder > 0 ||
            (currentOrder === 0 &&
              rankedRootOrder(evaluations, index, currentIndex) > 0);
        } else if (sameLaneNearBest && currentSameLane) {
          replace =
            candidate.rootRank < current.rootRank ||
            (candidate.rootRank === current.rootRank &&
              rankedRootOrder(evaluations, index, currentIndex) > 0);
        } else {
          replace = sameLaneNearBest;
        }
      }
    }
    if (replace) {
      bestIndex = index;
      bestUtility = utility;
      bestIsDominance = dominance;
    }
  });
  return bestIndex;
}

function safePlainSpiritCompetition(
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  config: ReplyRiskSearchConfig,
): boolean {
  if (!currentProEnabled(config) || shortlist.length < 2) return false;
  for (let left = 0; left < shortlist.length; left += 1) {
    const candidate = evaluations[shortlist[left] ?? -1];
    if (candidate === undefined) continue;
    for (let right = left + 1; right < shortlist.length; right += 1) {
      const incumbent = evaluations[shortlist[right] ?? -1];
      if (
        incumbent !== undefined &&
        isPlainSpiritDevelopmentRoot(candidate) &&
        isPlainSpiritDevelopmentRoot(incumbent) &&
        !isUnsafe(candidate) &&
        !isUnsafe(incumbent) &&
        !candidate.manaHandoffToOpponent &&
        !incumbent.manaHandoffToOpponent &&
        !candidate.hasRoundtrip &&
        !incumbent.hasRoundtrip &&
        !candidate.winsImmediately &&
        !incumbent.winsImmediately &&
        !candidate.attacksOpponentDrainer &&
        !incumbent.attacksOpponentDrainer &&
        !candidate.scoresSupermanaThisTurn &&
        !incumbent.scoresSupermanaThisTurn &&
        !candidate.scoresOpponentManaThisTurn &&
        !incumbent.scoresOpponentManaThisTurn &&
        !candidate.safeSupermanaPickupNow &&
        !incumbent.safeSupermanaPickupNow &&
        !candidate.safeOpponentManaPickupNow &&
        !incumbent.safeOpponentManaPickupNow &&
        !candidate.supermanaProgress &&
        !incumbent.supermanaProgress &&
        !candidate.opponentManaProgress &&
        !incumbent.opponentManaProgress &&
        candidate.sameTurnScoreWindowValue === 0 &&
        incumbent.sameTurnScoreWindowValue === 0
      ) {
        return true;
      }
    }
  }
  return false;
}

function safeProgressCompetition(
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  config: ReplyRiskSearchConfig,
): boolean {
  if (!currentProEnabled(config) || shortlist.length < 2) return false;
  for (let left = 0; left < shortlist.length; left += 1) {
    const candidate = evaluations[shortlist[left] ?? -1];
    if (candidate === undefined) continue;
    for (let right = left + 1; right < shortlist.length; right += 1) {
      const incumbent = evaluations[shortlist[right] ?? -1];
      if (
        incumbent !== undefined &&
        sameNonTacticalProgressLane(candidate, incumbent) &&
        isUnsafe(candidate) !== isUnsafe(incumbent)
      ) {
        return true;
      }
    }
  }
  return false;
}

function isCurrentProWhiteSpiritFollowupSetupPair(
  game: MonsGame,
  candidate: ReplyRiskRootEvaluation,
  incumbent: ReplyRiskRootEvaluation,
  config: ReplyRiskSearchConfig,
): boolean {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber > 3 ||
    game.monsMovesCount < 1 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana()
  ) {
    return false;
  }
  const candidateSetup =
    candidate.spiritOwnManaSetupNow &&
    candidate.opponentManaProgress &&
    !isPlainSpiritDevelopmentRoot(candidate);
  const incumbentSetup =
    incumbent.spiritOwnManaSetupNow &&
    incumbent.opponentManaProgress &&
    !isPlainSpiritDevelopmentRoot(incumbent);
  if (candidateSetup === incumbentSetup) return false;
  const pair = candidateSetup
    ? ([candidate, incumbent] as const)
    : ([incumbent, candidate] as const);
  const [setup, plain] = pair;
  if (!isPlainSpiritDevelopmentRoot(plain)) return false;
  return (
    sameFirstInput(setup, plain) &&
    setup.efficiency === plain.efficiency &&
    setup.ownDrainerVulnerable === plain.ownDrainerVulnerable &&
    setup.ownDrainerWalkVulnerable === plain.ownDrainerWalkVulnerable &&
    !setup.manaHandoffToOpponent &&
    !plain.manaHandoffToOpponent &&
    !setup.hasRoundtrip &&
    !plain.hasRoundtrip &&
    !setup.winsImmediately &&
    !plain.winsImmediately &&
    !setup.attacksOpponentDrainer &&
    !plain.attacksOpponentDrainer &&
    !setup.scoresSupermanaThisTurn &&
    !plain.scoresSupermanaThisTurn &&
    !setup.scoresOpponentManaThisTurn &&
    !plain.scoresOpponentManaThisTurn &&
    !setup.safeSupermanaPickupNow &&
    !plain.safeSupermanaPickupNow &&
    !setup.safeOpponentManaPickupNow &&
    !plain.safeOpponentManaPickupNow &&
    setup.sameTurnScoreWindowValue === 0 &&
    plain.sameTurnScoreWindowValue === 0 &&
    setup.supermanaProgress === plain.supermanaProgress &&
    setup.safeSupermanaProgressSteps === plain.safeSupermanaProgressSteps &&
    setup.opponentManaProgress === plain.opponentManaProgress &&
    setup.safeOpponentManaProgressSteps === plain.safeOpponentManaProgressSteps
  );
}

function whiteSpiritFollowupSetupCompetition(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  config: ReplyRiskSearchConfig,
): boolean {
  for (let left = 0; left < shortlist.length; left += 1) {
    const candidate = evaluations[shortlist[left] ?? -1];
    if (candidate === undefined) continue;
    for (let right = left + 1; right < shortlist.length; right += 1) {
      const incumbent = evaluations[shortlist[right] ?? -1];
      if (
        incumbent !== undefined &&
        isCurrentProWhiteSpiritFollowupSetupPair(
          game,
          candidate,
          incumbent,
          config,
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function nonConcreteManaWindowRoot(root: ReplyRiskRootEvaluation): boolean {
  return (
    rootFamily(root) === TurnPlanFamily.ManaTempo &&
    root.sameTurnScoreWindowValue > 0 &&
    !root.winsImmediately &&
    !root.attacksOpponentDrainer &&
    !root.scoresSupermanaThisTurn &&
    !root.scoresOpponentManaThisTurn &&
    !root.safeSupermanaPickupNow &&
    !root.safeOpponentManaPickupNow &&
    !root.manaHandoffToOpponent &&
    !root.hasRoundtrip
  );
}

function blackManaWindowProgressCompetition(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  config: ReplyRiskSearchConfig,
): boolean {
  if (
    !currentProEnabled(config) ||
    shortlist.length < 2 ||
    game.activeColor !== Color.Black ||
    game.turnNumber > 4
  ) {
    return false;
  }
  for (let left = 0; left < shortlist.length; left += 1) {
    const candidate = evaluations[shortlist[left] ?? -1];
    if (candidate === undefined) continue;
    for (let right = left + 1; right < shortlist.length; right += 1) {
      const incumbent = evaluations[shortlist[right] ?? -1];
      if (incumbent === undefined) continue;
      const candidateWindow = nonConcreteManaWindowRoot(candidate);
      const incumbentWindow = nonConcreteManaWindowRoot(incumbent);
      if (candidateWindow === incumbentWindow) continue;
      const window = candidateWindow ? candidate : incumbent;
      const progress = candidateWindow ? incumbent : candidate;
      if (
        window.sameTurnScoreWindowValue <= 1 &&
        progress.sameTurnScoreWindowValue === 0 &&
        rootFamily(progress) === TurnPlanFamily.ManaTempo &&
        progress.ownDrainerVulnerable === window.ownDrainerVulnerable &&
        progress.ownDrainerWalkVulnerable === window.ownDrainerWalkVulnerable &&
        !progress.manaHandoffToOpponent &&
        !progress.hasRoundtrip &&
        rootProgressOrSetupBetter(progress, window) &&
        saturatingAddI32(progress.score, 192) >= window.score
      ) {
        return true;
      }
    }
  }
  return false;
}

function closePositiveScoreCompetition(
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  config: ReplyRiskSearchConfig,
): boolean {
  if (!currentProEnabled(config) || shortlist.length < 2) return false;
  const scores = shortlist
    .map((index) => evaluations[index]?.score)
    .filter((score): score is number => score !== undefined && score >= 0)
    .sort((left, right) => right - left);
  return (
    scores.length >= 2 && saturatingSubI32(scores[0] ?? 0, scores[1] ?? 0) <= 64
  );
}

export function turnEngineReplyRiskProjections(
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  perspective: Color,
  config: ReplyRiskSearchConfig,
): ReadonlyMap<number, TurnEngineRootProjection> {
  if (!currentProSecondaryAnalysisLive(config) || shortlist.length < 2) {
    return new Map();
  }
  const allowSafePlainSpiritProjection = safePlainSpiritCompetition(
    evaluations,
    shortlist,
    config,
  );
  const first = evaluations[shortlist[0] ?? -1];
  const hasTacticalWindow =
    first !== undefined &&
    (first.winsImmediately ||
      first.attacksOpponentDrainer ||
      first.scoresSupermanaThisTurn ||
      first.scoresOpponentManaThisTurn);
  const hasSpiritDevelopmentWindow = shortlist.some((index) => {
    const root = evaluations[index];
    return (
      root !== undefined &&
      isPlainSpiritDevelopmentRoot(root) &&
      canTurnEngineProjectReplyRiskRoot(root, perspective)
    );
  });
  if (!hasTacticalWindow && !hasSpiritDevelopmentWindow) return new Map();

  let projectionLimit: number;
  if (hasSpiritDevelopmentWindow) {
    projectionLimit = allowSafePlainSpiritProjection
      ? config.enableTurnEngineLowBudgetGuard
        ? Math.min(shortlist.length, 4)
        : shortlist.length
      : Math.min(
          shortlist.length,
          config.enableTurnEngineLowBudgetGuard ? 4 : 8,
        );
  } else {
    projectionLimit = Math.min(
      shortlist.length,
      config.enableTurnEngineLowBudgetGuard ? 3 : 6,
    );
  }

  const rerankConfig = rerankTurnEngineConfig(config);
  const fullConfig = fullTurnEngineConfig(config);
  const projections = new Map<number, TurnEngineRootProjection>();
  for (const index of shortlist.slice(0, projectionLimit)) {
    if (checkpoint()) return new Map();
    const root = evaluations[index];
    if (
      root === undefined ||
      !canTurnEngineProjectReplyRiskRoot(root, perspective)
    ) {
      continue;
    }
    const vulnerableRecoveryProjection =
      currentProEnabled(config) &&
      root.ownDrainerVulnerable &&
      !root.manaHandoffToOpponent &&
      !root.hasRoundtrip;
    const engineConfig = vulnerableRecoveryProjection
      ? fullConfig
      : rerankConfig;
    const plan =
      config.buildTurnEnginePlanForReplyRisk === undefined
        ? turnEngineCandidatePlan(root.game, perspective, engineConfig)
        : config.buildTurnEnginePlanForReplyRisk(
            root,
            index,
            perspective,
            engineConfig,
          );
    if (plan !== undefined) projections.set(index, { plan });
  }

  if (
    hasSpiritDevelopmentWindow &&
    !hasTacticalWindow &&
    !allowSafePlainSpiritProjection &&
    ![...projections.values()].some(({ plan }) =>
      isInformativeReplyRiskProjectionFamily(plan.headFamily),
    )
  ) {
    return new Map();
  }
  return projections;
}

function canChallengeSpiritPreferenceRoot(
  root: ReplyRiskRootEvaluation,
  perspective: Color,
): boolean {
  return (
    canTurnEngineProjectReplyRiskRoot(root, perspective) &&
    !isPlainSpiritDevelopmentRoot(root) &&
    !root.spiritSameTurnScoreSetupNow &&
    !root.spiritOwnManaSetupNow &&
    !isUnsafe(root) &&
    !root.hasRoundtrip
  );
}

function canChallengeSpiritPreferenceRootWithRecoveryProjection(
  root: ReplyRiskRootEvaluation,
  perspective: Color,
): boolean {
  return (
    canTurnEngineProjectReplyRiskRoot(root, perspective) &&
    !isPlainSpiritDevelopmentRoot(root) &&
    !root.spiritSameTurnScoreSetupNow &&
    !root.spiritOwnManaSetupNow &&
    !root.manaHandoffToOpponent &&
    !root.hasRoundtrip
  );
}

/** Exact CurrentPro spirit/challenger projection shortlist used by the advisor. */
export function turnEngineSpiritRootProjections(
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndices: readonly number[],
  perspective: Color,
  config: ReplyRiskSearchConfig,
): ReadonlyMap<number, TurnEngineRootProjection> {
  if (!currentProSecondaryAnalysisLive(config)) return new Map();

  const spiritLimit = config.enableTurnEngineLowBudgetGuard ? 4 : 6;
  const spiritShortlist = candidateIndices
    .filter((index) => {
      const root = evaluations[index];
      return (
        root !== undefined &&
        isPlainSpiritDevelopmentRoot(root) &&
        canTurnEngineProjectReplyRiskRoot(root, perspective)
      );
    })
    .sort((left, right) =>
      compareRankedReplyRiskEvaluations(evaluations, left, right),
    )
    .slice(0, spiritLimit);

  const challengerLimit = config.enableTurnEngineLowBudgetGuard ? 2 : 4;
  const challengerShortlist = candidateIndices
    .filter((index) => {
      const root = evaluations[index];
      return (
        root !== undefined &&
        (canChallengeSpiritPreferenceRoot(root, perspective) ||
          canChallengeSpiritPreferenceRootWithRecoveryProjection(
            root,
            perspective,
          ))
      );
    })
    .sort((left, right) =>
      compareRankedReplyRiskEvaluations(evaluations, left, right),
    )
    .slice(0, challengerLimit);

  const shortlist = [...spiritShortlist];
  for (const index of challengerShortlist) {
    if (!shortlist.includes(index)) shortlist.push(index);
  }
  if (shortlist.length < 2) return new Map();

  const rerankConfig = rerankTurnEngineConfig(config);
  const fullConfig = fullTurnEngineConfig(config);
  const projections = new Map<number, TurnEngineRootProjection>();
  for (const index of shortlist) {
    const root = evaluations[index];
    if (root === undefined) continue;
    const recoveryOnly =
      canChallengeSpiritPreferenceRootWithRecoveryProjection(
        root,
        perspective,
      ) && !canChallengeSpiritPreferenceRoot(root, perspective);
    const engineConfig = recoveryOnly ? fullConfig : rerankConfig;
    const plan =
      config.buildTurnEnginePlanForReplyRisk === undefined
        ? turnEngineCandidatePlan(root.game, perspective, engineConfig)
        : config.buildTurnEnginePlanForReplyRisk(
            root,
            index,
            perspective,
            engineConfig,
          );
    if (plan !== undefined) projections.set(index, { plan });
  }
  return projections;
}

function spiritFollowupFloorScore(
  game: MonsGame,
  perspective: Color,
  config: ReplyRiskSearchConfig,
): number {
  if (checkpoint()) return 0;
  const winner = game.winnerColor();
  if (winner !== undefined) {
    return winner === perspective
      ? Math.trunc(SMART_TERMINAL_SCORE / 2)
      : -Math.trunc(SMART_TERMINAL_SCORE / 2);
  }
  const injected = config.spiritFollowupFloorScore?.(game, perspective);
  if (injected !== undefined) return injected;
  const key =
    config.evaluateGame === undefined
      ? snapshotCacheKey(game, perspective, 1, config)
      : undefined;
  if (key !== undefined) {
    const cached = cacheGet(spiritFollowupFloorCache, key);
    if (cached !== undefined) return cached;
  }
  const score = evaluateGame(game, perspective, config);
  if (cacheWriteAllowed() && key !== undefined) {
    cacheSet(spiritFollowupFloorCache, key, score);
  }
  return score;
}

function spiritFollowupFloorOrder(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndex: number,
  incumbentIndex: number,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  scores: Map<number, number>,
): number | undefined {
  const candidate = evaluations[candidateIndex];
  const incumbent = evaluations[incumbentIndex];
  if (
    !currentProSecondaryAnalysisLive(config) ||
    game.turnNumber > 3 ||
    candidate === undefined ||
    incumbent === undefined ||
    !isPlainSpiritDevelopmentRoot(candidate) ||
    !isPlainSpiritDevelopmentRoot(incumbent) ||
    isUnsafe(candidate) ||
    isUnsafe(incumbent) ||
    candidate.manaHandoffToOpponent ||
    incumbent.manaHandoffToOpponent ||
    candidate.hasRoundtrip ||
    incumbent.hasRoundtrip ||
    candidate.supermanaProgress ||
    candidate.opponentManaProgress ||
    incumbent.supermanaProgress ||
    incumbent.opponentManaProgress ||
    candidate.sameTurnScoreWindowValue > 0 ||
    incumbent.sameTurnScoreWindowValue > 0 ||
    candidate.spiritSameTurnScoreSetupNow ||
    incumbent.spiritSameTurnScoreSetupNow ||
    candidate.spiritOwnManaSetupNow ||
    incumbent.spiritOwnManaSetupNow ||
    Math.abs(candidate.score - incumbent.score) > 224
  ) {
    return undefined;
  }
  const candidateScore =
    scores.get(candidateIndex) ??
    spiritFollowupFloorScore(candidate.game, perspective, config);
  scores.set(candidateIndex, candidateScore);
  const incumbentScore =
    scores.get(incumbentIndex) ??
    spiritFollowupFloorScore(incumbent.game, perspective, config);
  scores.set(incumbentIndex, incumbentScore);
  if (candidateScore >= saturatingAddI32(incumbentScore, 32)) return 1;
  if (incumbentScore >= saturatingAddI32(candidateScore, 32)) return -1;
  return 0;
}

function isCurrentProBlackPlainSpiritFollowupSetupPair(
  game: MonsGame,
  plain: ReplyRiskRootEvaluation,
  setup: ReplyRiskRootEvaluation,
  config: ReplyRiskSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    isPlainSpiritDevelopmentRoot(plain) &&
    setup.spiritOwnManaSetupNow &&
    !setup.spiritSameTurnScoreSetupNow &&
    sameFirstInput(plain, setup) &&
    plain.ownDrainerVulnerable === setup.ownDrainerVulnerable &&
    plain.ownDrainerWalkVulnerable === setup.ownDrainerWalkVulnerable &&
    !plain.manaHandoffToOpponent &&
    !setup.manaHandoffToOpponent &&
    !plain.hasRoundtrip &&
    !setup.hasRoundtrip &&
    !plain.winsImmediately &&
    !setup.winsImmediately &&
    !plain.attacksOpponentDrainer &&
    !setup.attacksOpponentDrainer &&
    !plain.scoresSupermanaThisTurn &&
    !setup.scoresSupermanaThisTurn &&
    !plain.scoresOpponentManaThisTurn &&
    !setup.scoresOpponentManaThisTurn &&
    !plain.safeSupermanaPickupNow &&
    !setup.safeSupermanaPickupNow &&
    !plain.safeOpponentManaPickupNow &&
    !setup.safeOpponentManaPickupNow &&
    plain.sameTurnScoreWindowValue === 0 &&
    setup.sameTurnScoreWindowValue === 0 &&
    !plain.supermanaProgress &&
    !setup.supermanaProgress &&
    !plain.opponentManaProgress &&
    !setup.opponentManaProgress
  );
}

function blackPlainSpiritFollowupReplyOrder(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndex: number,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbentIndex: number,
  incumbentSnapshot: RootReplyRiskSnapshot,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  scores: Map<number, number>,
): number | undefined {
  const candidate = evaluations[candidateIndex];
  const incumbent = evaluations[incumbentIndex];
  if (candidate === undefined || incumbent === undefined) return undefined;
  let plain: ReplyRiskRootEvaluation;
  let plainSnapshot: RootReplyRiskSnapshot;
  let setup: ReplyRiskRootEvaluation;
  let setupSnapshot: RootReplyRiskSnapshot;
  let plainIndex: number;
  let setupIndex: number;
  let candidateIsPlain: boolean;
  if (
    isCurrentProBlackPlainSpiritFollowupSetupPair(
      game,
      candidate,
      incumbent,
      config,
    )
  ) {
    plain = candidate;
    plainSnapshot = candidateSnapshot;
    setup = incumbent;
    setupSnapshot = incumbentSnapshot;
    plainIndex = candidateIndex;
    setupIndex = incumbentIndex;
    candidateIsPlain = true;
  } else if (
    isCurrentProBlackPlainSpiritFollowupSetupPair(
      game,
      incumbent,
      candidate,
      config,
    )
  ) {
    plain = incumbent;
    plainSnapshot = incumbentSnapshot;
    setup = candidate;
    setupSnapshot = candidateSnapshot;
    plainIndex = incumbentIndex;
    setupIndex = candidateIndex;
    candidateIsPlain = false;
  } else {
    return undefined;
  }
  if (
    plainSnapshot.allowsImmediateOpponentWin ||
    setupSnapshot.allowsImmediateOpponentWin ||
    plainSnapshot.opponentReachesMatchPoint ||
    setupSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const plainFollowup =
    scores.get(plainIndex) ??
    spiritFollowupFloorScore(plain.game, perspective, config);
  scores.set(plainIndex, plainFollowup);
  const setupFollowup =
    scores.get(setupIndex) ??
    spiritFollowupFloorScore(setup.game, perspective, config);
  scores.set(setupIndex, setupFollowup);
  const setupHasCloseTopSeed =
    setup.rootRank <= plain.rootRank &&
    saturatingAddI32(setup.score, 64) >= plain.score &&
    setup.spiritSetupGain >= saturatingAddI32(plain.spiritSetupGain, 32) &&
    saturatingAddI32(setupSnapshot.worstReplyScore, 192) >=
      plainSnapshot.worstReplyScore &&
    saturatingAddI32(setupFollowup, 32) >= plainFollowup;
  if (setupHasCloseTopSeed) return candidateIsPlain ? -1 : 1;
  if (
    saturatingAddI32(plainSnapshot.worstReplyScore, 192) <
      setupSnapshot.worstReplyScore ||
    (plainFollowup < saturatingAddI32(setupFollowup, 32) &&
      plain.score < setup.score)
  ) {
    return undefined;
  }
  return candidateIsPlain ? 1 : -1;
}

function earlyBlackPlainSpiritSiblingOrder(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndex: number,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbentIndex: number,
  incumbentSnapshot: RootReplyRiskSnapshot,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  scores: Map<number, number>,
): number | undefined {
  const candidate = evaluations[candidateIndex];
  const incumbent = evaluations[incumbentIndex];
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber > 2 ||
    candidate === undefined ||
    incumbent === undefined ||
    !isPlainSpiritDevelopmentRoot(candidate) ||
    !isPlainSpiritDevelopmentRoot(incumbent) ||
    !sameFirstInput(candidate, incumbent) ||
    candidate.ownDrainerVulnerable !== incumbent.ownDrainerVulnerable ||
    candidate.manaHandoffToOpponent !== incumbent.manaHandoffToOpponent ||
    candidate.hasRoundtrip !== incumbent.hasRoundtrip ||
    candidate.spiritSameTurnScoreSetupNow ||
    incumbent.spiritSameTurnScoreSetupNow ||
    candidate.spiritOwnManaSetupNow ||
    incumbent.spiritOwnManaSetupNow ||
    candidate.winsImmediately ||
    incumbent.winsImmediately ||
    candidate.attacksOpponentDrainer ||
    incumbent.attacksOpponentDrainer ||
    candidateSnapshot.allowsImmediateOpponentWin ||
    incumbentSnapshot.allowsImmediateOpponentWin ||
    candidateSnapshot.opponentReachesMatchPoint ||
    incumbentSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const candidateFollowup =
    scores.get(candidateIndex) ??
    spiritFollowupFloorScore(candidate.game, perspective, config);
  scores.set(candidateIndex, candidateFollowup);
  const incumbentFollowup =
    scores.get(incumbentIndex) ??
    spiritFollowupFloorScore(incumbent.game, perspective, config);
  scores.set(incumbentIndex, incumbentFollowup);
  const candidateBetter =
    candidateSnapshot.worstReplyScore >=
      saturatingAddI32(incumbentSnapshot.worstReplyScore, 96) &&
    saturatingAddI32(candidateFollowup, 32) >= incumbentFollowup &&
    saturatingAddI32(candidate.score, 48) >= incumbent.score;
  const incumbentBetter =
    incumbentSnapshot.worstReplyScore >=
      saturatingAddI32(candidateSnapshot.worstReplyScore, 96) &&
    saturatingAddI32(incumbentFollowup, 32) >= candidateFollowup &&
    saturatingAddI32(incumbent.score, 48) >= candidate.score;
  if (candidateBetter === incumbentBetter) {
    const candidateClose =
      candidateSnapshot.worstReplyScore <
        saturatingAddI32(incumbentSnapshot.worstReplyScore, 96) &&
      candidateFollowup < saturatingAddI32(incumbentFollowup, 96);
    const incumbentClose =
      incumbentSnapshot.worstReplyScore <
        saturatingAddI32(candidateSnapshot.worstReplyScore, 96) &&
      incumbentFollowup < saturatingAddI32(candidateFollowup, 96);
    if (
      candidateClose &&
      incumbentClose &&
      candidate.score !== incumbent.score
    ) {
      return candidate.score > incumbent.score ? 1 : -1;
    }
    return undefined;
  }
  return candidateBetter ? 1 : -1;
}

function earlyBlackManaProgressReplyOrder(
  game: MonsGame,
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber > 4 ||
    candidateSnapshot.allowsImmediateOpponentWin ||
    incumbentSnapshot.allowsImmediateOpponentWin ||
    candidateSnapshot.opponentReachesMatchPoint ||
    incumbentSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const candidateFamily = rootFamily(candidate);
  const incumbentFamily = rootFamily(incumbent);
  const allowed = (family: TurnPlanFamily): boolean =>
    family === TurnPlanFamily.ManaTempo ||
    family === TurnPlanFamily.SafeSupermanaProgress ||
    family === TurnPlanFamily.SafeOpponentManaProgress;
  if (
    !allowed(candidateFamily) ||
    !allowed(incumbentFamily) ||
    Math.abs(candidate.rootRank - incumbent.rootRank) > 8
  ) {
    return undefined;
  }
  const candidateProgressSurface = hasProgressSurface(candidate);
  const incumbentProgressSurface = hasProgressSurface(incumbent);
  const candidateProgressBetter =
    rootProgressOrSetupBetter(candidate, incumbent) ||
    (candidateProgressSurface && !incumbentProgressSurface);
  const incumbentProgressBetter =
    rootProgressOrSetupBetter(incumbent, candidate) ||
    (incumbentProgressSurface && !candidateProgressSurface);
  if (candidateProgressBetter === incumbentProgressBetter) return undefined;

  const candidateWindow = nonConcreteManaWindowRoot(candidate);
  const incumbentWindow = nonConcreteManaWindowRoot(incumbent);
  if (candidateWindow !== incumbentWindow) {
    const window = candidateWindow ? candidate : incumbent;
    const windowSnapshot = candidateWindow
      ? candidateSnapshot
      : incumbentSnapshot;
    const progress = candidateWindow ? incumbent : candidate;
    const progressSnapshot = candidateWindow
      ? incumbentSnapshot
      : candidateSnapshot;
    if (
      window.sameTurnScoreWindowValue <= 1 &&
      progress.sameTurnScoreWindowValue === 0 &&
      rootFamily(progress) === TurnPlanFamily.ManaTempo &&
      progress.ownDrainerVulnerable === window.ownDrainerVulnerable &&
      progress.ownDrainerWalkVulnerable === window.ownDrainerWalkVulnerable &&
      !progress.manaHandoffToOpponent &&
      !progress.hasRoundtrip &&
      rootProgressOrSetupBetter(progress, window) &&
      saturatingAddI32(progressSnapshot.worstReplyScore, 96) >=
        windowSnapshot.worstReplyScore &&
      saturatingAddI32(progress.score, 192) >= window.score
    ) {
      return candidateWindow ? -1 : 1;
    }
  }

  const candidateReplyCompetes =
    saturatingAddI32(candidateSnapshot.worstReplyScore, 240) >=
    incumbentSnapshot.worstReplyScore;
  const incumbentReplyCompetes =
    saturatingAddI32(incumbentSnapshot.worstReplyScore, 240) >=
    candidateSnapshot.worstReplyScore;
  if (
    candidateProgressBetter &&
    candidate.score > incumbent.score &&
    candidateReplyCompetes
  ) {
    return 1;
  }
  if (
    incumbentProgressBetter &&
    incumbent.score > candidate.score &&
    incumbentReplyCompetes
  ) {
    return -1;
  }
  return undefined;
}

function earlyBlackPlainSpiritManaReplyOrder(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndex: number,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbentIndex: number,
  incumbentSnapshot: RootReplyRiskSnapshot,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  scores: Map<number, number>,
): number | undefined {
  const candidate = evaluations[candidateIndex];
  const incumbent = evaluations[incumbentIndex];
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber > 4 ||
    candidate === undefined ||
    incumbent === undefined
  ) {
    return undefined;
  }
  const candidatePlain = isPlainSpiritDevelopmentRoot(candidate);
  const incumbentPlain = isPlainSpiritDevelopmentRoot(incumbent);
  const candidateMana = rootFamily(candidate) === TurnPlanFamily.ManaTempo;
  const incumbentMana = rootFamily(incumbent) === TurnPlanFamily.ManaTempo;
  if (candidatePlain === incumbentPlain || candidateMana === incumbentMana) {
    return undefined;
  }
  const plain = candidatePlain ? candidate : incumbent;
  const plainSnapshot = candidatePlain ? candidateSnapshot : incumbentSnapshot;
  const plainIndex = candidatePlain ? candidateIndex : incumbentIndex;
  const mana = candidatePlain ? incumbent : candidate;
  const manaSnapshot = candidatePlain ? incumbentSnapshot : candidateSnapshot;
  const manaIndex = candidatePlain ? incumbentIndex : candidateIndex;
  if (
    !sameFirstInput(plain, mana) ||
    plain.ownDrainerVulnerable !== mana.ownDrainerVulnerable ||
    plain.ownDrainerWalkVulnerable !== mana.ownDrainerWalkVulnerable ||
    plainSnapshot.allowsImmediateOpponentWin ||
    manaSnapshot.allowsImmediateOpponentWin ||
    plainSnapshot.opponentReachesMatchPoint ||
    manaSnapshot.opponentReachesMatchPoint ||
    plain.manaHandoffToOpponent ||
    mana.manaHandoffToOpponent ||
    plain.hasRoundtrip ||
    mana.hasRoundtrip ||
    plain.winsImmediately ||
    mana.winsImmediately ||
    plain.attacksOpponentDrainer ||
    mana.attacksOpponentDrainer ||
    plain.sameTurnScoreWindowValue > 0 ||
    mana.sameTurnScoreWindowValue > 0 ||
    plain.scoresSupermanaThisTurn ||
    mana.scoresSupermanaThisTurn ||
    plain.scoresOpponentManaThisTurn ||
    mana.scoresOpponentManaThisTurn ||
    plain.safeSupermanaPickupNow ||
    mana.safeSupermanaPickupNow ||
    plain.safeOpponentManaPickupNow ||
    mana.safeOpponentManaPickupNow ||
    plain.spiritSameTurnScoreSetupNow ||
    plain.spiritOwnManaSetupNow ||
    mana.spiritSameTurnScoreSetupNow ||
    mana.spiritOwnManaSetupNow ||
    mana.supermanaProgress ||
    mana.opponentManaProgress ||
    saturatingAddI32(plain.score, 24) < mana.score ||
    saturatingAddI32(plainSnapshot.worstReplyScore, 192) <
      manaSnapshot.worstReplyScore
  ) {
    return undefined;
  }
  const plainFollowup =
    scores.get(plainIndex) ??
    spiritFollowupFloorScore(plain.game, perspective, config);
  scores.set(plainIndex, plainFollowup);
  const manaFollowup =
    scores.get(manaIndex) ??
    spiritFollowupFloorScore(mana.game, perspective, config);
  scores.set(manaIndex, manaFollowup);
  if (saturatingAddI32(plainFollowup, 32) < manaFollowup) {
    return undefined;
  }
  return candidatePlain ? 1 : -1;
}

function safeNonSpiritFollowupOrder(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndex: number,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbentIndex: number,
  incumbentSnapshot: RootReplyRiskSnapshot,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  scores: Map<number, number>,
): number | undefined {
  if (!currentProSecondaryAnalysisLive(config)) return undefined;
  const candidate = evaluations[candidateIndex];
  const incumbent = evaluations[incumbentIndex];
  if (candidate === undefined || incumbent === undefined) return undefined;
  const candidatePlain = isPlainSpiritDevelopmentRoot(candidate);
  const incumbentPlain = isPlainSpiritDevelopmentRoot(incumbent);
  if (candidatePlain === incumbentPlain) return undefined;
  const challenger = candidatePlain ? incumbent : candidate;
  const challengerSnapshot = candidatePlain
    ? incumbentSnapshot
    : candidateSnapshot;
  const challengerIndex = candidatePlain ? incumbentIndex : candidateIndex;
  const spirit = candidatePlain ? candidate : incumbent;
  const spiritSnapshot = candidatePlain ? candidateSnapshot : incumbentSnapshot;
  const spiritIndex = candidatePlain ? candidateIndex : incumbentIndex;
  if (
    isUnsafe(challenger) ||
    isUnsafe(spirit) ||
    challengerSnapshot.allowsImmediateOpponentWin ||
    spiritSnapshot.allowsImmediateOpponentWin ||
    challengerSnapshot.opponentReachesMatchPoint ||
    spiritSnapshot.opponentReachesMatchPoint ||
    challenger.manaHandoffToOpponent ||
    spirit.manaHandoffToOpponent ||
    challenger.hasRoundtrip ||
    spirit.hasRoundtrip ||
    challenger.ownDrainerVulnerable ||
    spirit.ownDrainerVulnerable ||
    challenger.ownDrainerWalkVulnerable ||
    spirit.ownDrainerWalkVulnerable ||
    challenger.spiritSameTurnScoreSetupNow ||
    challenger.spiritOwnManaSetupNow ||
    spirit.spiritSameTurnScoreSetupNow ||
    spirit.spiritOwnManaSetupNow ||
    challenger.winsImmediately ||
    spirit.winsImmediately ||
    challenger.attacksOpponentDrainer ||
    spirit.attacksOpponentDrainer ||
    challenger.sameTurnScoreWindowValue > 0 ||
    spirit.sameTurnScoreWindowValue > 0
  ) {
    return undefined;
  }
  const challengerScore =
    scores.get(challengerIndex) ??
    spiritFollowupFloorScore(challenger.game, perspective, config);
  scores.set(challengerIndex, challengerScore);
  const spiritScore =
    scores.get(spiritIndex) ??
    spiritFollowupFloorScore(spirit.game, perspective, config);
  scores.set(spiritIndex, spiritScore);
  const standardFloorCompetes =
    saturatingAddI32(challengerSnapshot.worstReplyScore, 192) >=
    spiritSnapshot.worstReplyScore;
  const relaxedOpeningTempoCompetes =
    game.turnNumber <= 2 &&
    !challenger.supermanaProgress &&
    !challenger.opponentManaProgress &&
    challenger.score >= saturatingAddI32(spirit.score, 48) &&
    challengerSnapshot.worstReplyScore >= 96 &&
    challengerScore >= spiritScore;
  if (
    saturatingAddI32(challenger.score, 32) < spirit.score ||
    (!standardFloorCompetes && !relaxedOpeningTempoCompetes)
  ) {
    return undefined;
  }
  if (
    challengerScore >= saturatingAddI32(spiritScore, 48) ||
    relaxedOpeningTempoCompetes
  ) {
    return candidatePlain ? -1 : 1;
  }
  return undefined;
}

function whiteSpiritFollowupSetupReplyOrder(
  game: MonsGame,
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (
    !isCurrentProWhiteSpiritFollowupSetupPair(
      game,
      candidate,
      incumbent,
      config,
    )
  ) {
    return undefined;
  }
  const candidateSetup =
    candidate.spiritOwnManaSetupNow &&
    candidate.opponentManaProgress &&
    !isPlainSpiritDevelopmentRoot(candidate);
  const setup = candidateSetup ? candidate : incumbent;
  const setupSnapshot = candidateSetup ? candidateSnapshot : incumbentSnapshot;
  const plain = candidateSetup ? incumbent : candidate;
  const plainSnapshot = candidateSetup ? incumbentSnapshot : candidateSnapshot;
  if (
    !sameFirstInput(setup, plain) ||
    setup.efficiency !== plain.efficiency ||
    setup.ownDrainerVulnerable !== plain.ownDrainerVulnerable ||
    setup.ownDrainerWalkVulnerable !== plain.ownDrainerWalkVulnerable ||
    setup.manaHandoffToOpponent ||
    plain.manaHandoffToOpponent ||
    setup.hasRoundtrip ||
    plain.hasRoundtrip ||
    setup.winsImmediately ||
    plain.winsImmediately ||
    setup.attacksOpponentDrainer ||
    plain.attacksOpponentDrainer ||
    setup.scoresSupermanaThisTurn ||
    plain.scoresSupermanaThisTurn ||
    setup.scoresOpponentManaThisTurn ||
    plain.scoresOpponentManaThisTurn ||
    setup.safeSupermanaPickupNow ||
    plain.safeSupermanaPickupNow ||
    setup.safeOpponentManaPickupNow ||
    plain.safeOpponentManaPickupNow ||
    setup.sameTurnScoreWindowValue > 0 ||
    plain.sameTurnScoreWindowValue > 0 ||
    setup.supermanaProgress ||
    plain.supermanaProgress ||
    setupSnapshot.allowsImmediateOpponentWin ||
    plainSnapshot.allowsImmediateOpponentWin ||
    setupSnapshot.opponentReachesMatchPoint ||
    plainSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const floorMargin =
    game.turnNumber === 3 && game.monsMovesCount === 1 ? 192 : 96;
  if (
    saturatingAddI32(setup.score, 96) < plain.score ||
    saturatingAddI32(setupSnapshot.worstReplyScore, floorMargin) <
      plainSnapshot.worstReplyScore ||
    setup.rootRank > plain.rootRank + 8
  ) {
    return undefined;
  }
  return candidateSetup ? 1 : -1;
}

function isFlatLateManaOnlyReplyRoot(root: ReplyRiskRootEvaluation): boolean {
  return (
    !root.winsImmediately &&
    !root.attacksOpponentDrainer &&
    !isTacticalPriorityRoot(root) &&
    !root.spiritDevelopment &&
    !root.spiritSameTurnScoreSetupNow &&
    !root.spiritOwnManaSetupNow &&
    !root.supermanaProgress &&
    !root.opponentManaProgress &&
    !root.scoresSupermanaThisTurn &&
    !root.scoresOpponentManaThisTurn &&
    !root.safeSupermanaPickupNow &&
    !root.safeOpponentManaPickupNow &&
    root.sameTurnScoreWindowValue <= 0 &&
    !root.manaHandoffToOpponent &&
    !root.hasRoundtrip
  );
}

function lateSafeManaRootOrder(
  game: MonsGame,
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    config.enableTurnEngineLateSafeManaRootPreference !== true ||
    game.activeColor !== Color.White ||
    game.turnNumber < 6 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    candidateSnapshot.allowsImmediateOpponentWin ||
    incumbentSnapshot.allowsImmediateOpponentWin ||
    candidateSnapshot.opponentReachesMatchPoint ||
    incumbentSnapshot.opponentReachesMatchPoint ||
    !isFlatLateManaOnlyReplyRoot(candidate) ||
    !isFlatLateManaOnlyReplyRoot(incumbent)
  ) {
    return undefined;
  }
  let safe: ReplyRiskRootEvaluation;
  let vulnerable: ReplyRiskRootEvaluation;
  let candidateIsSafe: boolean;
  if (!candidate.ownDrainerVulnerable && incumbent.ownDrainerVulnerable) {
    safe = candidate;
    vulnerable = incumbent;
    candidateIsSafe = true;
  } else if (
    candidate.ownDrainerVulnerable &&
    !incumbent.ownDrainerVulnerable
  ) {
    safe = incumbent;
    vulnerable = candidate;
    candidateIsSafe = false;
  } else {
    return undefined;
  }
  if (
    vulnerable.score <= safe.score ||
    saturatingSubI32(vulnerable.score, safe.score) > 16 ||
    Math.abs(vulnerable.rootRank - safe.rootRank) > 4 ||
    vulnerable.efficiency <= safe.efficiency
  ) {
    return undefined;
  }
  return candidateIsSafe ? 1 : -1;
}

type NormalRootSafetySnapshot = {
  readonly allowsImmediateOpponentWin: boolean;
  readonly opponentReachesMatchPoint: boolean;
  readonly opponentMaxScoreGain: number;
  readonly myScoreGain: number;
  readonly worstReplyScore: number;
};

function scoreForColor(game: MonsGame, color: Color): number {
  return color === Color.White ? game.whiteScore : game.blackScore;
}

function normalRootSafetySnapshot(
  stateAfterMove: MonsGame,
  perspective: Color,
  myScoreBefore: number,
  config: ReplyRiskSearchConfig,
  replyLimit: number,
): NormalRootSafetySnapshot {
  const myScoreGain = Math.max(
    0,
    scoreForColor(stateAfterMove, perspective) - myScoreBefore,
  );
  const winner = stateAfterMove.winnerColor();
  if (winner !== undefined) {
    const won = winner === perspective;
    return {
      allowsImmediateOpponentWin: !won,
      opponentReachesMatchPoint: !won,
      opponentMaxScoreGain: won ? 0 : TARGET_SCORE,
      myScoreGain,
      worstReplyScore: won
        ? Math.trunc(SMART_TERMINAL_SCORE / 2)
        : -Math.trunc(SMART_TERMINAL_SCORE / 2),
    };
  }
  if (stateAfterMove.activeColor === perspective) {
    return {
      allowsImmediateOpponentWin: false,
      opponentReachesMatchPoint: false,
      opponentMaxScoreGain: 0,
      myScoreGain,
      worstReplyScore: evaluateGame(stateAfterMove, perspective, config),
    };
  }
  const opponent = perspective === Color.White ? Color.Black : Color.White;
  const opponentScoreBefore = scoreForColor(stateAfterMove, opponent);
  const replies = enumerateLegalTransitions(
    stateAfterMove,
    Math.max(1, Math.trunc(replyLimit)),
  );
  if (replies.length === 0) {
    return {
      allowsImmediateOpponentWin: false,
      opponentReachesMatchPoint: false,
      opponentMaxScoreGain: 0,
      myScoreGain,
      worstReplyScore: Math.trunc(SMART_TERMINAL_SCORE / 4),
    };
  }
  let allowsImmediateOpponentWin = false;
  let opponentReachesMatchPoint = false;
  let opponentMaxScoreGain = 0;
  let worstReplyScore = I32_MAX;
  for (const reply of replies) {
    const afterReply = reply.game;
    const opponentScoreAfter = scoreForColor(afterReply, opponent);
    opponentMaxScoreGain = Math.max(
      opponentMaxScoreGain,
      Math.max(0, opponentScoreAfter - opponentScoreBefore),
    );
    if (TARGET_SCORE - opponentScoreAfter <= 1) {
      opponentReachesMatchPoint = true;
    }
    const replyWinner = afterReply.winnerColor();
    let replyScore: number;
    if (replyWinner === perspective) {
      replyScore = Math.trunc(SMART_TERMINAL_SCORE / 2);
    } else if (replyWinner !== undefined) {
      allowsImmediateOpponentWin = true;
      opponentReachesMatchPoint = true;
      replyScore = -Math.trunc(SMART_TERMINAL_SCORE / 2);
    } else {
      replyScore = evaluateGame(afterReply, perspective, config);
    }
    worstReplyScore = Math.min(worstReplyScore, replyScore);
    if (allowsImmediateOpponentWin) break;
  }
  if (worstReplyScore === I32_MAX) {
    worstReplyScore = evaluateGame(stateAfterMove, perspective, config);
  }
  return {
    allowsImmediateOpponentWin,
    opponentReachesMatchPoint,
    opponentMaxScoreGain,
    myScoreGain,
    worstReplyScore,
  };
}

function betterNormalRootSafetyCandidate(
  candidate: NormalRootSafetySnapshot,
  candidateScore: number,
  incumbent: NormalRootSafetySnapshot,
  incumbentScore: number,
): boolean {
  if (
    candidate.allowsImmediateOpponentWin !==
    incumbent.allowsImmediateOpponentWin
  ) {
    return !candidate.allowsImmediateOpponentWin;
  }
  if (
    candidate.opponentReachesMatchPoint !== incumbent.opponentReachesMatchPoint
  ) {
    return !candidate.opponentReachesMatchPoint;
  }
  if (candidate.opponentMaxScoreGain !== incumbent.opponentMaxScoreGain) {
    return candidate.opponentMaxScoreGain < incumbent.opponentMaxScoreGain;
  }
  if (candidate.myScoreGain !== incumbent.myScoreGain) {
    return candidate.myScoreGain > incumbent.myScoreGain;
  }
  if (candidate.worstReplyScore !== incumbent.worstReplyScore) {
    return candidate.worstReplyScore > incumbent.worstReplyScore;
  }
  return candidateScore > incumbentScore;
}

function quietNonTacticalReplyRiskRoot(root: ReplyRiskRootEvaluation): boolean {
  return (
    !root.winsImmediately &&
    !root.attacksOpponentDrainer &&
    !isTacticalPriorityRoot(root) &&
    !root.scoresSupermanaThisTurn &&
    !root.scoresOpponentManaThisTurn &&
    !root.safeSupermanaPickupNow &&
    !root.safeOpponentManaPickupNow &&
    root.sameTurnScoreWindowValue === 0
  );
}

function completeExecutionConfig(
  config: ReplyRiskSearchConfig,
): config is ReplyRiskSearchConfig & AutomoveSearchExecutionConfig {
  return (
    config.preference !== undefined &&
    config.scoringKey !== undefined &&
    config.useTranspositionTable !== undefined
  );
}

function normalRootSafetyDeepFloorScore(
  stateAfterMove: MonsGame,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  replyLimit: number,
): number {
  if (checkpoint()) return 0;
  const winner = stateAfterMove.winnerColor();
  if (winner !== undefined) {
    return winner === perspective
      ? Math.trunc(SMART_TERMINAL_SCORE / 2)
      : -Math.trunc(SMART_TERMINAL_SCORE / 2);
  }
  if (stateAfterMove.activeColor === perspective) {
    return evaluateGame(stateAfterMove, perspective, config);
  }
  if (!completeExecutionConfig(config)) {
    return rootReplyRiskSnapshot(
      stateAfterMove,
      perspective,
      config,
      replyLimit,
    ).worstReplyScore;
  }

  const clamp = (value: number, minimum: number, maximum: number): number =>
    Math.min(maximum, Math.max(minimum, Math.trunc(value)));
  const rootBranchLimit = clamp(config.nodeBranchLimit, 5, 12);
  const nodeBranchLimit = clamp(Math.max(0, config.nodeBranchLimit - 4), 4, 10);
  const probe: AutomoveSearchExecutionConfig = {
    ...config,
    depth: 1,
    maxVisitedNodes: clamp(config.maxVisitedNodes / 18, 110, 360),
    rootBranchLimit,
    nodeBranchLimit,
    rootEnumLimit: clamp(rootBranchLimit * 3, rootBranchLimit, 48),
    nodeEnumLimit: clamp(nodeBranchLimit * 3, nodeBranchLimit, 36),
  };
  const replies = enumerateLegalTransitions(
    stateAfterMove,
    Math.max(1, Math.trunc(replyLimit)),
  );
  if (cancelled()) return 0;
  if (replies.length === 0) return Math.trunc(SMART_TERMINAL_SCORE / 4);

  let worst = I32_MAX;
  for (const reply of replies) {
    if (checkpoint()) return 0;
    const replyWinner = reply.game.winnerColor();
    const score =
      replyWinner === perspective
        ? Math.trunc(SMART_TERMINAL_SCORE / 2)
        : replyWinner !== undefined
          ? -Math.trunc(SMART_TERMINAL_SCORE / 2)
          : evaluateSearchScore(reply.game, perspective, 1, probe);
    if (cancelled()) return 0;
    worst = Math.min(worst, score);
  }
  return worst === I32_MAX
    ? evaluateGame(stateAfterMove, perspective, config)
    : worst;
}

function normalSafetyReplyOrder(
  game: MonsGame,
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  perspective: Color,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    config.enableNormalRootSafetyRerank !== true ||
    !quietNonTacticalReplyRiskRoot(candidate) ||
    !quietNonTacticalReplyRiskRoot(incumbent) ||
    Math.abs(candidate.rootRank - incumbent.rootRank) > 8 ||
    Math.abs(candidate.score - incumbent.score) > 160 ||
    Math.abs(
      candidateSnapshot.worstReplyScore - incumbentSnapshot.worstReplyScore,
    ) > 320
  ) {
    return undefined;
  }
  const progressOrSetupPair =
    hasProgressSurface(candidate) ||
    hasProgressSurface(incumbent) ||
    candidate.spiritOwnManaSetupNow ||
    incumbent.spiritOwnManaSetupNow ||
    candidate.spiritSameTurnScoreSetupNow ||
    incumbent.spiritSameTurnScoreSetupNow ||
    sameNonTacticalProgressLane(candidate, incumbent) ||
    sameOpeningSafeSetupPair(candidate, incumbent, config);
  if (!progressOrSetupPair) return undefined;
  const replyLimit = Math.min(
    36,
    Math.max(12, Math.trunc(config.nodeEnumLimit ?? 12)),
  );
  const myScoreBefore = scoreForColor(game, perspective);
  const candidateNormal = normalRootSafetySnapshot(
    candidate.game,
    perspective,
    myScoreBefore,
    config,
    replyLimit,
  );
  const incumbentNormal = normalRootSafetySnapshot(
    incumbent.game,
    perspective,
    myScoreBefore,
    config,
    replyLimit,
  );
  const axesDiffer =
    candidateNormal.allowsImmediateOpponentWin !==
      incumbentNormal.allowsImmediateOpponentWin ||
    candidateNormal.opponentReachesMatchPoint !==
      incumbentNormal.opponentReachesMatchPoint ||
    candidateNormal.opponentMaxScoreGain !==
      incumbentNormal.opponentMaxScoreGain ||
    candidateNormal.myScoreGain !== incumbentNormal.myScoreGain ||
    candidateNormal.worstReplyScore !== incumbentNormal.worstReplyScore;
  if (axesDiffer) {
    if (
      betterNormalRootSafetyCandidate(
        candidateNormal,
        candidate.score,
        incumbentNormal,
        incumbent.score,
      )
    ) {
      return 1;
    }
    if (
      betterNormalRootSafetyCandidate(
        incumbentNormal,
        incumbent.score,
        candidateNormal,
        candidate.score,
      )
    ) {
      return -1;
    }
  }
  const mine = TARGET_SCORE - scoreForColor(game, perspective);
  const opponent =
    TARGET_SCORE -
    scoreForColor(
      game,
      perspective === Color.White ? Color.Black : Color.White,
    );
  if (
    config.enableNormalRootSafetyDeepFloor === true &&
    (mine <= 3 || opponent <= 3)
  ) {
    const floor = (state: MonsGame): number =>
      config.normalRootSafetyDeepFloorScore?.(state, perspective, replyLimit) ??
      normalRootSafetyDeepFloorScore(state, perspective, config, replyLimit);
    const candidateFloor = floor(candidate.game);
    const incumbentFloor = floor(incumbent.game);
    if (candidateFloor !== incumbentFloor) {
      return candidateFloor > incumbentFloor ? 1 : -1;
    }
  }
  return undefined;
}

function closeSpiritGoalFamilyPriority(family: TurnPlanFamily): number {
  switch (family) {
    case TurnPlanFamily.ImmediateScore:
      return 7;
    case TurnPlanFamily.DenyOpponentWindow:
      return 6;
    case TurnPlanFamily.DrainerKill:
      return 5;
    case TurnPlanFamily.DrainerSafetyRecovery:
      return 4;
    case TurnPlanFamily.SpiritImpact:
      return 3;
    case TurnPlanFamily.SafeSupermanaProgress:
      return 2;
    case TurnPlanFamily.SafeOpponentManaProgress:
      return 1;
    case TurnPlanFamily.ManaTempo:
      return 0;
  }
}

function compareCloseSpiritGoalFamily(
  candidate: TurnEngineRootProjection,
  incumbent: TurnEngineRootProjection,
): number {
  if (
    candidate.plan.headFamily !== TurnPlanFamily.SpiritImpact ||
    incumbent.plan.headFamily !== TurnPlanFamily.SpiritImpact
  ) {
    return 0;
  }
  return (
    closeSpiritGoalFamilyPriority(candidate.plan.goalFamily) -
    closeSpiritGoalFamilyPriority(incumbent.plan.goalFamily)
  );
}

function compareSpiritProjectionPlans(
  candidate: TurnEngineRootProjection,
  incumbent: TurnEngineRootProjection,
  closeSpiritRoots: boolean,
): number {
  if (closeSpiritRoots) {
    let order = compareUtilityPrimaryAxes(
      candidate.plan.headUtility,
      incumbent.plan.headUtility,
    );
    if (order !== 0) return order;
    order = compareUtilityPrimaryAxes(
      candidate.plan.utility,
      incumbent.plan.utility,
    );
    if (order !== 0) return order;
    const candidateImpact =
      candidate.plan.headFamily === TurnPlanFamily.SpiritImpact;
    const incumbentImpact =
      incumbent.plan.headFamily === TurnPlanFamily.SpiritImpact;
    if (candidateImpact !== incumbentImpact) return candidateImpact ? 1 : -1;
    order = compareCloseSpiritGoalFamily(candidate, incumbent);
    if (order !== 0) return order;
  }
  return turnEngineComparePlans(candidate.plan, incumbent.plan);
}

function mixedPlainSpiritReplyFloorOrder(
  candidateSnapshot: RootReplyRiskSnapshot,
  candidateProjection: TurnEngineRootProjection,
  incumbentSnapshot: RootReplyRiskSnapshot,
  incumbentProjection: TurnEngineRootProjection,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (!currentProEnabled(config)) return undefined;
  const candidateImpact =
    candidateProjection.plan.headFamily === TurnPlanFamily.SpiritImpact;
  const incumbentImpact =
    incumbentProjection.plan.headFamily === TurnPlanFamily.SpiritImpact;
  if (candidateImpact === incumbentImpact) return undefined;
  const nonSpiritSnapshot = candidateImpact
    ? incumbentSnapshot
    : candidateSnapshot;
  const nonSpiritProjection = candidateImpact
    ? incumbentProjection
    : candidateProjection;
  const spiritSnapshot = candidateImpact
    ? candidateSnapshot
    : incumbentSnapshot;
  const spiritProjection = candidateImpact
    ? candidateProjection
    : incumbentProjection;
  const spiritPriority = closeSpiritGoalFamilyPriority(
    spiritProjection.plan.goalFamily,
  );
  const nonSpiritPriority = closeSpiritGoalFamilyPriority(
    nonSpiritProjection.plan.goalFamily,
  );
  if (
    spiritPriority >
      closeSpiritGoalFamilyPriority(TurnPlanFamily.SpiritImpact) ||
    nonSpiritPriority < spiritPriority ||
    nonSpiritSnapshot.worstReplyScore <
      saturatingAddI32(spiritSnapshot.worstReplyScore, 128)
  ) {
    return undefined;
  }
  const utilityOrder = compareUtilityPrimaryAxes(
    nonSpiritProjection.plan.utility,
    spiritProjection.plan.utility,
  );
  if (
    utilityOrder < 0 &&
    !nonSpiritProjection.plan.utility.supportsFamilyFallback(
      spiritProjection.plan.utility,
    )
  ) {
    return undefined;
  }
  return candidateImpact ? -1 : 1;
}

function mixedPlainSpiritProjectionOrder(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  candidateIndex: number,
  candidateProjection: TurnEngineRootProjection,
  incumbentIndex: number,
  incumbentProjection: TurnEngineRootProjection,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  followupScores: Map<number, number>,
): number | undefined {
  if (!currentProSecondaryAnalysisLive(config)) return undefined;
  const candidateImpact =
    candidateProjection.plan.headFamily === TurnPlanFamily.SpiritImpact;
  const incumbentImpact =
    incumbentProjection.plan.headFamily === TurnPlanFamily.SpiritImpact;
  if (candidateImpact === incumbentImpact) return undefined;

  const candidate = evaluations[candidateIndex];
  const incumbent = evaluations[incumbentIndex];
  if (candidate === undefined || incumbent === undefined) return undefined;
  const nonSpiritRoot = candidateImpact ? incumbent : candidate;
  const nonSpiritProjection = candidateImpact
    ? incumbentProjection
    : candidateProjection;
  const spiritRoot = candidateImpact ? candidate : incumbent;
  const spiritProjection = candidateImpact
    ? candidateProjection
    : incumbentProjection;
  const candidateIsNonSpirit = !candidateImpact;
  const followupOrder = spiritFollowupFloorOrder(
    game,
    evaluations,
    candidateIndex,
    incumbentIndex,
    perspective,
    config,
    followupScores,
  );
  const nonSpiritIndex = candidateIsNonSpirit ? candidateIndex : incumbentIndex;
  const spiritIndex = candidateIsNonSpirit ? incumbentIndex : candidateIndex;
  const nonSpiritGoalPriority = closeSpiritGoalFamilyPriority(
    nonSpiritProjection.plan.goalFamily,
  );
  const spiritGoalPriority = closeSpiritGoalFamilyPriority(
    spiritProjection.plan.goalFamily,
  );
  const nonSpiritRootCompetes =
    nonSpiritGoalPriority >= spiritGoalPriority &&
    spiritGoalPriority <=
      closeSpiritGoalFamilyPriority(TurnPlanFamily.SpiritImpact) &&
    nonSpiritRoot.score >= spiritRoot.score &&
    rankedRootOrder(evaluations, nonSpiritIndex, spiritIndex) > 0 &&
    compareUtilityPrimaryAxes(
      nonSpiritProjection.plan.utility,
      spiritProjection.plan.utility,
    ) >= 0;
  if (nonSpiritRootCompetes) return candidateIsNonSpirit ? 1 : -1;

  const spiritGoalCompetes =
    spiritGoalPriority > nonSpiritGoalPriority &&
    compareUtilityPrimaryAxes(
      spiritProjection.plan.utility,
      nonSpiritProjection.plan.utility,
    ) >= 0 &&
    compareUtilityPrimaryAxes(
      spiritProjection.plan.headUtility,
      nonSpiritProjection.plan.headUtility,
    ) >= 0;
  if (spiritGoalCompetes) return candidateIsNonSpirit ? -1 : 1;

  const nonSpiritCompetes =
    (nonSpiritProjection.plan.headFamily ===
      TurnPlanFamily.SafeSupermanaProgress ||
      nonSpiritProjection.plan.headFamily ===
        TurnPlanFamily.SafeOpponentManaProgress ||
      nonSpiritProjection.plan.headFamily ===
        TurnPlanFamily.DrainerSafetyRecovery) &&
    (followupOrder === 0 ||
      nonSpiritProjection.plan.utility.supportsFamilyFallback(
        spiritProjection.plan.utility,
      )) &&
    nonSpiritRoot.score >= spiritRoot.score &&
    turnEngineComparePlans(nonSpiritProjection.plan, spiritProjection.plan) > 0;
  if (nonSpiritCompetes) return candidateIsNonSpirit ? 1 : -1;
  return candidateImpact ? 1 : -1;
}

function plainSpiritReplyRiskPick(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  shortlist: readonly number[],
  snapshots: ReadonlyMap<number, RootReplyRiskSnapshot>,
  projections: ReadonlyMap<number, TurnEngineRootProjection>,
  perspective: Color,
  config: ReplyRiskSearchConfig,
  followupScores: Map<number, number>,
): number | undefined {
  if (!currentProEnabled(config) || shortlist.length < 2) return undefined;
  const spiritShortlist = shortlist.filter((index) => {
    const root = evaluations[index];
    return root !== undefined && isPlainSpiritDevelopmentRoot(root);
  });
  if (
    spiritShortlist.length < 2 ||
    spiritShortlist.some((index) => !projections.has(index))
  ) {
    return undefined;
  }

  let bestIndex = spiritShortlist[0];
  if (bestIndex === undefined) return undefined;
  for (const index of spiritShortlist.slice(1)) {
    const candidate = evaluations[index];
    const incumbent = evaluations[bestIndex];
    const candidateProjection = projections.get(index);
    const incumbentProjection = projections.get(bestIndex);
    const candidateSnapshot = snapshots.get(index);
    const incumbentSnapshot = snapshots.get(bestIndex);
    if (
      candidate === undefined ||
      incumbent === undefined ||
      candidateProjection === undefined ||
      incumbentProjection === undefined ||
      candidateSnapshot === undefined ||
      incumbentSnapshot === undefined
    ) {
      continue;
    }

    let order = earlyBlackPlainSpiritSiblingOrder(
      game,
      evaluations,
      index,
      candidateSnapshot,
      bestIndex,
      incumbentSnapshot,
      perspective,
      config,
      followupScores,
    );
    order ??= mixedPlainSpiritReplyFloorOrder(
      candidateSnapshot,
      candidateProjection,
      incumbentSnapshot,
      incumbentProjection,
      config,
    );
    order ??= mixedPlainSpiritProjectionOrder(
      game,
      evaluations,
      index,
      candidateProjection,
      bestIndex,
      incumbentProjection,
      perspective,
      config,
      followupScores,
    );
    if (order === undefined) {
      const bothSpiritImpact =
        candidateProjection.plan.headFamily === TurnPlanFamily.SpiritImpact &&
        incumbentProjection.plan.headFamily === TurnPlanFamily.SpiritImpact;
      if (bothSpiritImpact) {
        order = compareSpiritProjectionPlans(
          candidateProjection,
          incumbentProjection,
          Math.abs(candidate.score - incumbent.score) <= 192,
        );
      } else {
        order = spiritFollowupFloorOrder(
          game,
          evaluations,
          index,
          bestIndex,
          perspective,
          config,
          followupScores,
        );
        order ??= rankedRootOrder(evaluations, index, bestIndex);
      }
    }
    if (order > 0) bestIndex = index;
  }
  return bestIndex;
}

function spiritProjectionChallengeOrder(
  candidate: ReplyRiskRootEvaluation,
  candidateProjection: TurnEngineRootProjection | undefined,
  incumbent: ReplyRiskRootEvaluation,
  incumbentProjection: TurnEngineRootProjection | undefined,
): number | undefined {
  const candidatePlain = isPlainSpiritDevelopmentRoot(candidate);
  const incumbentPlain = isPlainSpiritDevelopmentRoot(incumbent);
  if (
    candidatePlain === incumbentPlain ||
    candidateProjection === undefined ||
    incumbentProjection === undefined
  ) {
    return undefined;
  }
  const challenger = candidatePlain ? incumbent : candidate;
  const challengerProjection = candidatePlain
    ? incumbentProjection
    : candidateProjection;
  const spirit = candidatePlain ? candidate : incumbent;
  const spiritProjection = candidatePlain
    ? candidateProjection
    : incumbentProjection;
  const challengerUnsafe = isUnsafe(challenger);
  const spiritUnsafe = isUnsafe(spirit);
  const recoveryChallenge =
    challengerUnsafe &&
    !spiritUnsafe &&
    ((challengerProjection.plan.utility.supportsTemporaryRiskRecovery() &&
      compareUtilityPrimaryAxes(
        challengerProjection.plan.utility,
        spiritProjection.plan.utility,
      ) >= 0 &&
      challengerProjection.plan.utility.supportsFamilyFallback(
        spiritProjection.plan.utility,
      )) ||
      (challengerProjection.plan.goalFamily === TurnPlanFamily.ImmediateScore &&
        compareUtilityPrimaryAxes(
          challengerProjection.plan.utility,
          spiritProjection.plan.utility,
        ) >= 0));
  if (challengerUnsafe && !spiritUnsafe && !recoveryChallenge) {
    return undefined;
  }
  if (recoveryChallenge) return candidatePlain ? -1 : 1;
  if (
    challengerProjection.plan.headFamily === TurnPlanFamily.SpiritImpact ||
    !challengerProjection.plan.utility.passesOverrideGuard(
      spiritProjection.plan.utility,
    ) ||
    compareUtilityPrimaryAxes(
      challengerProjection.plan.headUtility,
      spiritProjection.plan.headUtility,
    ) < 0 ||
    compareUtilityPrimaryAxes(
      challengerProjection.plan.utility,
      spiritProjection.plan.utility,
    ) <= 0
  ) {
    return undefined;
  }
  return candidatePlain ? -1 : 1;
}

function spiritScoreChallengeOrder(
  candidate: ReplyRiskRootEvaluation,
  incumbent: ReplyRiskRootEvaluation,
): number | undefined {
  const candidatePlain = isPlainSpiritDevelopmentRoot(candidate);
  const incumbentPlain = isPlainSpiritDevelopmentRoot(incumbent);
  if (candidatePlain === incumbentPlain) return undefined;
  const challenger = candidatePlain ? incumbent : candidate;
  const spirit = candidatePlain ? candidate : incumbent;
  if (
    isUnsafe(challenger) ||
    challenger.hasRoundtrip ||
    challenger.score < saturatingAddI32(spirit.score, 40) ||
    challenger.sameTurnScoreWindowValue < spirit.sameTurnScoreWindowValue
  ) {
    return undefined;
  }
  return candidatePlain ? -1 : 1;
}

function safeProgressSiblingOrder(
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    !sameNonTacticalProgressLane(candidate, incumbent) ||
    candidateSnapshot.allowsImmediateOpponentWin ||
    incumbentSnapshot.allowsImmediateOpponentWin ||
    candidateSnapshot.opponentReachesMatchPoint ||
    incumbentSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const candidateSafe = !isUnsafe(candidate);
  const incumbentSafe = !isUnsafe(incumbent);
  if (candidateSafe === incumbentSafe) return undefined;
  const candidateReplyCompetes =
    saturatingAddI32(candidateSnapshot.worstReplyScore, 240) >=
    incumbentSnapshot.worstReplyScore;
  const incumbentReplyCompetes =
    saturatingAddI32(incumbentSnapshot.worstReplyScore, 240) >=
    candidateSnapshot.worstReplyScore;
  if (candidateSafe && candidateReplyCompetes) return 1;
  if (incumbentSafe && incumbentReplyCompetes) return -1;
  return undefined;
}

function riskyRecoveryProgressSiblingOrder(
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  candidateProjection: TurnEngineRootProjection | undefined,
  incumbentProjection: TurnEngineRootProjection | undefined,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    !sameNonTacticalProgressLane(candidate, incumbent)
  ) {
    return undefined;
  }
  const candidateUnsafe = isUnsafe(candidate);
  const incumbentUnsafe = isUnsafe(incumbent);
  if (
    candidateUnsafe === incumbentUnsafe ||
    candidateProjection === undefined ||
    incumbentProjection === undefined
  ) {
    return undefined;
  }
  const risky = candidateUnsafe ? candidate : incumbent;
  const riskySnapshot = candidateUnsafe ? candidateSnapshot : incumbentSnapshot;
  const riskyProjection = candidateUnsafe
    ? candidateProjection
    : incumbentProjection;
  const safe = candidateUnsafe ? incumbent : candidate;
  const safeSnapshot = candidateUnsafe ? incumbentSnapshot : candidateSnapshot;
  const safeProjection = candidateUnsafe
    ? incumbentProjection
    : candidateProjection;
  if (
    riskySnapshot.allowsImmediateOpponentWin ||
    riskySnapshot.opponentReachesMatchPoint ||
    safeSnapshot.allowsImmediateOpponentWin ||
    safeSnapshot.opponentReachesMatchPoint ||
    riskyProjection.plan.goalFamily !== TurnPlanFamily.ImmediateScore ||
    compareUtilityPrimaryAxes(
      riskyProjection.plan.utility,
      safeProjection.plan.utility,
    ) < 0 ||
    saturatingAddI32(riskySnapshot.worstReplyScore, 160) <
      safeSnapshot.worstReplyScore ||
    saturatingAddI32(risky.score, 32) < safe.score
  ) {
    return undefined;
  }
  return candidateUnsafe ? 1 : -1;
}

function sameFirstInput(
  candidate: ReplyRiskRootEvaluation,
  incumbent: ReplyRiskRootEvaluation,
): boolean {
  const candidateFirst = candidate.inputs[0];
  const incumbentFirst = incumbent.inputs[0];
  return (
    candidateFirst !== undefined &&
    incumbentFirst !== undefined &&
    inputKey(candidateFirst) === inputKey(incumbentFirst)
  );
}

function sameOpeningSafeSetupPair(
  candidate: ReplyRiskRootEvaluation,
  incumbent: ReplyRiskRootEvaluation,
  config: ReplyRiskSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    sameFirstInput(candidate, incumbent) &&
    candidate.efficiency === incumbent.efficiency &&
    Math.abs(candidate.score - incumbent.score) <= 128 &&
    !isUnsafe(candidate) &&
    !isUnsafe(incumbent) &&
    !candidate.manaHandoffToOpponent &&
    !incumbent.manaHandoffToOpponent &&
    !candidate.hasRoundtrip &&
    !incumbent.hasRoundtrip &&
    !candidate.winsImmediately &&
    !incumbent.winsImmediately &&
    !candidate.attacksOpponentDrainer &&
    !incumbent.attacksOpponentDrainer &&
    !candidate.scoresSupermanaThisTurn &&
    !incumbent.scoresSupermanaThisTurn &&
    !candidate.scoresOpponentManaThisTurn &&
    !incumbent.scoresOpponentManaThisTurn &&
    candidate.sameTurnScoreWindowValue === 0 &&
    incumbent.sameTurnScoreWindowValue === 0 &&
    !candidate.supermanaProgress &&
    !incumbent.supermanaProgress &&
    !candidate.opponentManaProgress &&
    !incumbent.opponentManaProgress
  );
}

function omittedSameOpeningSetupCompetes(
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    candidate.spiritOwnManaSetupNow &&
    !incumbent.spiritDevelopment &&
    !incumbent.spiritSameTurnScoreSetupNow &&
    !incumbent.spiritOwnManaSetupNow &&
    sameOpeningSafeSetupPair(candidate, incumbent, config) &&
    candidate.rootRank + 3 <= incumbent.rootRank &&
    saturatingAddI32(candidate.score, 128) >= incumbent.score &&
    saturatingAddI32(candidateSnapshot.worstReplyScore, 160) >=
      incumbentSnapshot.worstReplyScore
  );
}

function safePickupOrder(
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
): number | undefined {
  if (!currentProEnabled(config)) return undefined;
  const candidatePickup =
    candidate.safeSupermanaPickupNow || candidate.safeOpponentManaPickupNow;
  const incumbentPickup =
    incumbent.safeSupermanaPickupNow || incumbent.safeOpponentManaPickupNow;
  if (candidatePickup === incumbentPickup) return undefined;
  const pickup = candidatePickup ? candidate : incumbent;
  const pickupSnapshot = candidatePickup
    ? candidateSnapshot
    : incumbentSnapshot;
  const other = candidatePickup ? incumbent : candidate;
  const otherSnapshot = candidatePickup ? incumbentSnapshot : candidateSnapshot;
  const otherProgressLike =
    other.supermanaProgress ||
    other.opponentManaProgress ||
    other.spiritOwnManaSetupNow ||
    other.spiritSameTurnScoreSetupNow ||
    other.spiritDevelopment;
  if (
    isUnsafe(pickup) ||
    pickupSnapshot.allowsImmediateOpponentWin ||
    pickupSnapshot.opponentReachesMatchPoint ||
    otherSnapshot.allowsImmediateOpponentWin ||
    otherSnapshot.opponentReachesMatchPoint ||
    pickup.manaHandoffToOpponent ||
    pickup.hasRoundtrip ||
    other.winsImmediately ||
    other.attacksOpponentDrainer ||
    !otherProgressLike ||
    saturatingAddI32(pickup.score, 144) < other.score ||
    saturatingAddI32(pickupSnapshot.worstReplyScore, 192) <
      otherSnapshot.worstReplyScore
  ) {
    return undefined;
  }
  return candidatePickup ? 1 : -1;
}

function safePlainSpiritReplyRiskPair(
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    isPlainSpiritDevelopmentRoot(candidate) &&
    isPlainSpiritDevelopmentRoot(incumbent) &&
    !isUnsafe(candidate) &&
    !isUnsafe(incumbent) &&
    !candidateSnapshot.allowsImmediateOpponentWin &&
    !incumbentSnapshot.allowsImmediateOpponentWin &&
    !candidateSnapshot.opponentReachesMatchPoint &&
    !incumbentSnapshot.opponentReachesMatchPoint &&
    !candidate.manaHandoffToOpponent &&
    !incumbent.manaHandoffToOpponent &&
    !candidate.hasRoundtrip &&
    !incumbent.hasRoundtrip &&
    !candidate.winsImmediately &&
    !incumbent.winsImmediately &&
    !candidate.attacksOpponentDrainer &&
    !incumbent.attacksOpponentDrainer &&
    !candidate.scoresSupermanaThisTurn &&
    !incumbent.scoresSupermanaThisTurn &&
    !candidate.scoresOpponentManaThisTurn &&
    !incumbent.scoresOpponentManaThisTurn &&
    !candidate.safeSupermanaPickupNow &&
    !incumbent.safeSupermanaPickupNow &&
    !candidate.safeOpponentManaPickupNow &&
    !incumbent.safeOpponentManaPickupNow &&
    !candidate.supermanaProgress &&
    !incumbent.supermanaProgress &&
    !candidate.opponentManaProgress &&
    !incumbent.opponentManaProgress &&
    candidate.sameTurnScoreWindowValue === 0 &&
    incumbent.sameTurnScoreWindowValue === 0
  );
}

export type ReplyRiskComparisonContext = {
  readonly candidateProjection?: TurnEngineRootProjection | undefined;
  readonly incumbentProjection?: TurnEngineRootProjection | undefined;
  readonly game?: MonsGame | undefined;
  readonly evaluations?: readonly ReplyRiskRootEvaluation[] | undefined;
  readonly candidateIndex?: number | undefined;
  readonly incumbentIndex?: number | undefined;
  readonly perspective?: Color | undefined;
  readonly spiritFollowupScores?: Map<number, number> | undefined;
};

export function isBetterReplyRiskCandidate(
  candidate: ReplyRiskRootEvaluation,
  candidateSnapshot: RootReplyRiskSnapshot,
  incumbent: ReplyRiskRootEvaluation,
  incumbentSnapshot: RootReplyRiskSnapshot,
  config: ReplyRiskSearchConfig,
  context: ReplyRiskComparisonContext = {},
): boolean {
  if (candidate.winsImmediately !== incumbent.winsImmediately) {
    return candidate.winsImmediately;
  }
  if (candidate.attacksOpponentDrainer !== incumbent.attacksOpponentDrainer) {
    return candidate.attacksOpponentDrainer;
  }
  if (
    candidateSnapshot.allowsImmediateOpponentWin !==
    incumbentSnapshot.allowsImmediateOpponentWin
  ) {
    return !candidateSnapshot.allowsImmediateOpponentWin;
  }
  if (
    candidateSnapshot.opponentReachesMatchPoint !==
    incumbentSnapshot.opponentReachesMatchPoint
  ) {
    return !candidateSnapshot.opponentReachesMatchPoint;
  }
  const hasFullContext =
    context.game !== undefined &&
    context.evaluations !== undefined &&
    context.candidateIndex !== undefined &&
    context.incumbentIndex !== undefined &&
    context.perspective !== undefined;
  const followupScores =
    context.spiritFollowupScores ?? new Map<number, number>();
  if (context.game !== undefined) {
    const lateManaOrder = lateSafeManaRootOrder(
      context.game,
      candidate,
      candidateSnapshot,
      incumbent,
      incumbentSnapshot,
      config,
    );
    if (lateManaOrder !== undefined) return lateManaOrder > 0;
  }
  const riskyRecoveryOrder = riskyRecoveryProgressSiblingOrder(
    candidate,
    candidateSnapshot,
    incumbent,
    incumbentSnapshot,
    context.candidateProjection,
    context.incumbentProjection,
    config,
  );
  if (riskyRecoveryOrder !== undefined) return riskyRecoveryOrder > 0;
  const safeProgressOrder = safeProgressSiblingOrder(
    candidate,
    candidateSnapshot,
    incumbent,
    incumbentSnapshot,
    config,
  );
  if (safeProgressOrder !== undefined) return safeProgressOrder > 0;
  if (context.game !== undefined) {
    const manaProgressOrder = earlyBlackManaProgressReplyOrder(
      context.game,
      candidate,
      candidateSnapshot,
      incumbent,
      incumbentSnapshot,
      config,
    );
    if (manaProgressOrder !== undefined) return manaProgressOrder > 0;
  }
  if (hasFullContext) {
    const game = context.game;
    const evaluations = context.evaluations;
    const candidateIndex = context.candidateIndex;
    const incumbentIndex = context.incumbentIndex;
    const perspective = context.perspective;
    const spiritManaOrder = earlyBlackPlainSpiritManaReplyOrder(
      game,
      evaluations,
      candidateIndex,
      candidateSnapshot,
      incumbentIndex,
      incumbentSnapshot,
      perspective,
      config,
      followupScores,
    );
    if (spiritManaOrder !== undefined) return spiritManaOrder > 0;
    const nonSpiritOrder = safeNonSpiritFollowupOrder(
      game,
      evaluations,
      candidateIndex,
      candidateSnapshot,
      incumbentIndex,
      incumbentSnapshot,
      perspective,
      config,
      followupScores,
    );
    if (nonSpiritOrder !== undefined) return nonSpiritOrder > 0;
    const blackSetupOrder = blackPlainSpiritFollowupReplyOrder(
      game,
      evaluations,
      candidateIndex,
      candidateSnapshot,
      incumbentIndex,
      incumbentSnapshot,
      perspective,
      config,
      followupScores,
    );
    if (blackSetupOrder !== undefined) return blackSetupOrder > 0;
    const earlySiblingOrder = earlyBlackPlainSpiritSiblingOrder(
      game,
      evaluations,
      candidateIndex,
      candidateSnapshot,
      incumbentIndex,
      incumbentSnapshot,
      perspective,
      config,
      followupScores,
    );
    if (earlySiblingOrder !== undefined) return earlySiblingOrder > 0;
    const whiteSetupOrder = whiteSpiritFollowupSetupReplyOrder(
      game,
      candidate,
      candidateSnapshot,
      incumbent,
      incumbentSnapshot,
      config,
    );
    if (whiteSetupOrder !== undefined) return whiteSetupOrder > 0;
  }
  const pickupOrder = safePickupOrder(
    candidate,
    candidateSnapshot,
    incumbent,
    incumbentSnapshot,
    config,
  );
  if (pickupOrder !== undefined) return pickupOrder > 0;
  if (context.game !== undefined && context.perspective !== undefined) {
    const safetyOrder = normalSafetyReplyOrder(
      context.game,
      candidate,
      candidateSnapshot,
      incumbent,
      incumbentSnapshot,
      context.perspective,
      config,
    );
    if (safetyOrder !== undefined) return safetyOrder > 0;
  }
  const candidateProgressAdvantage =
    candidate.classes.carrierProgress && !incumbent.classes.carrierProgress;
  const incumbentProgressAdvantage =
    incumbent.classes.carrierProgress && !candidate.classes.carrierProgress;
  if (candidateProgressAdvantage || incumbentProgressAdvantage) {
    const noTacticalPriority =
      !candidate.classes.immediateScore &&
      !candidate.classes.drainerAttack &&
      !candidate.classes.drainerSafetyRecover &&
      !incumbent.classes.immediateScore &&
      !incumbent.classes.drainerAttack &&
      !incumbent.classes.drainerSafetyRecover;
    if (
      noTacticalPriority &&
      Math.abs(
        candidateSnapshot.worstReplyScore - incumbentSnapshot.worstReplyScore,
      ) <= 80
    ) {
      return candidateProgressAdvantage;
    }
  }
  if (config.preferCleanReplyRiskRoots ?? true) {
    if (candidate.manaHandoffToOpponent !== incumbent.manaHandoffToOpponent) {
      return !candidate.manaHandoffToOpponent;
    }
    if (candidate.hasRoundtrip !== incumbent.hasRoundtrip) {
      return !candidate.hasRoundtrip;
    }
  }
  if (
    safePlainSpiritReplyRiskPair(
      candidate,
      candidateSnapshot,
      incumbent,
      incumbentSnapshot,
      config,
    )
  ) {
    if (
      context.candidateProjection !== undefined &&
      context.incumbentProjection !== undefined &&
      Math.abs(candidate.score - incumbent.score) <= 16 &&
      candidate.efficiency === incumbent.efficiency
    ) {
      const floorOrder = mixedPlainSpiritReplyFloorOrder(
        candidateSnapshot,
        context.candidateProjection,
        incumbentSnapshot,
        context.incumbentProjection,
        config,
      );
      if (floorOrder !== undefined) return floorOrder > 0;
      if (hasFullContext) {
        const projectionOrder = mixedPlainSpiritProjectionOrder(
          context.game,
          context.evaluations,
          context.candidateIndex,
          context.candidateProjection,
          context.incumbentIndex,
          context.incumbentProjection,
          context.perspective,
          config,
          followupScores,
        );
        if (projectionOrder !== undefined) return projectionOrder > 0;
      }
      const anySpiritImpact =
        context.candidateProjection.plan.headFamily ===
          TurnPlanFamily.SpiritImpact ||
        context.incumbentProjection.plan.headFamily ===
          TurnPlanFamily.SpiritImpact;
      if (anySpiritImpact) {
        const projectionOrder = compareSpiritProjectionPlans(
          context.candidateProjection,
          context.incumbentProjection,
          Math.abs(candidate.score - incumbent.score) <= 192,
        );
        if (projectionOrder !== 0) return projectionOrder > 0;
      }
    }
    if (hasFullContext) {
      const followupOrder = spiritFollowupFloorOrder(
        context.game,
        context.evaluations,
        context.candidateIndex,
        context.incumbentIndex,
        context.perspective,
        config,
        followupScores,
      );
      if (followupOrder !== undefined && followupOrder !== 0) {
        return followupOrder > 0;
      }
      return (
        rankedRootOrder(
          context.evaluations,
          context.candidateIndex,
          context.incumbentIndex,
        ) > 0
      );
    }
    if (candidate.score !== incumbent.score) {
      return candidate.score > incumbent.score;
    }
    const tacticalOrder = compareTacticalRoots(candidate, incumbent);
    return (
      tacticalOrder < 0 ||
      (tacticalOrder === 0 && candidate.rootRank < incumbent.rootRank)
    );
  }
  if (hasFullContext) {
    const followupOrder = spiritFollowupFloorOrder(
      context.game,
      context.evaluations,
      context.candidateIndex,
      context.incumbentIndex,
      context.perspective,
      config,
      followupScores,
    );
    if (followupOrder !== undefined && followupOrder !== 0) {
      return followupOrder > 0;
    }
  }
  if (
    currentProEnabled(config) &&
    Math.abs(
      candidateSnapshot.worstReplyScore - incumbentSnapshot.worstReplyScore,
    ) > 240
  ) {
    return (
      candidateSnapshot.worstReplyScore > incumbentSnapshot.worstReplyScore
    );
  }
  if (
    currentProEnabled(config) &&
    candidate.interviewSoftPriority !== incumbent.interviewSoftPriority &&
    candidate.efficiency >= incumbent.efficiency
  ) {
    return candidate.interviewSoftPriority > incumbent.interviewSoftPriority;
  }
  if (
    config.enableInterviewDeterministicTiebreak &&
    candidate.spiritOwnManaSetupNow !== incumbent.spiritOwnManaSetupNow
  ) {
    const sameOpening = sameOpeningSafeSetupPair(candidate, incumbent, config);
    if (
      !currentProEnabled(config) ||
      sameOpening ||
      Math.abs(
        candidateSnapshot.worstReplyScore - incumbentSnapshot.worstReplyScore,
      ) <= 120
    ) {
      return candidate.spiritOwnManaSetupNow;
    }
  }
  if (
    config.enableInterviewDeterministicTiebreak &&
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.supermanaProgress &&
    incumbent.supermanaProgress &&
    candidate.safeSupermanaProgressSteps !==
      incumbent.safeSupermanaProgressSteps
  ) {
    return progressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      incumbent.safeSupermanaProgressSteps,
    );
  }
  if (
    config.enableInterviewDeterministicTiebreak &&
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.opponentManaProgress &&
    incumbent.opponentManaProgress &&
    candidate.safeOpponentManaProgressSteps !==
      incumbent.safeOpponentManaProgressSteps
  ) {
    return progressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      incumbent.safeOpponentManaProgressSteps,
    );
  }
  if (
    config.enableInterviewDeterministicTiebreak &&
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.scorePathBestSteps !== incumbent.scorePathBestSteps
  ) {
    return scorePathStepsBetter(
      candidate.scorePathBestSteps,
      incumbent.scorePathBestSteps,
    );
  }
  if (
    config.enableInterviewDeterministicTiebreak &&
    candidate.spiritDevelopment !== incumbent.spiritDevelopment
  ) {
    const projectionOrder = spiritProjectionChallengeOrder(
      candidate,
      context.candidateProjection,
      incumbent,
      context.incumbentProjection,
    );
    if (projectionOrder !== undefined) return projectionOrder > 0;
    const scoreOrder = spiritScoreChallengeOrder(candidate, incumbent);
    if (
      scoreOrder !== undefined &&
      (!currentProEnabled(config) ||
        Math.abs(
          candidateSnapshot.worstReplyScore - incumbentSnapshot.worstReplyScore,
        ) <= 120)
    ) {
      return scoreOrder > 0;
    }
    if (
      !currentProEnabled(config) ||
      Math.abs(
        candidateSnapshot.worstReplyScore - incumbentSnapshot.worstReplyScore,
      ) <= 120
    ) {
      return candidate.spiritDevelopment;
    }
  }
  if (
    context.candidateProjection !== undefined &&
    context.incumbentProjection !== undefined
  ) {
    const replyFloorClose =
      Math.abs(
        candidateSnapshot.worstReplyScore - incumbentSnapshot.worstReplyScore,
      ) <= 100;
    const noTerminalRisk =
      !candidateSnapshot.allowsImmediateOpponentWin &&
      !incumbentSnapshot.allowsImmediateOpponentWin &&
      !candidateSnapshot.opponentReachesMatchPoint &&
      !incumbentSnapshot.opponentReachesMatchPoint;
    const tacticalProjection =
      isTacticalTurnEngineFamily(context.candidateProjection.plan.headFamily) ||
      isTacticalTurnEngineFamily(context.incumbentProjection.plan.headFamily);
    const spiritPhase =
      candidate.spiritOwnManaSetupNow ||
      incumbent.spiritOwnManaSetupNow ||
      candidate.spiritSameTurnScoreSetupNow ||
      incumbent.spiritSameTurnScoreSetupNow ||
      candidate.spiritDevelopment ||
      incumbent.spiritDevelopment;
    const plainSpiritProjection =
      currentProEnabled(config) &&
      isPlainSpiritDevelopmentRoot(candidate) &&
      isPlainSpiritDevelopmentRoot(incumbent) &&
      replyFloorClose &&
      context.candidateProjection.plan.utility.hasNonnegativeDenyGain() &&
      context.incumbentProjection.plan.utility.hasNonnegativeDenyGain() &&
      noTerminalRisk;
    if (plainSpiritProjection) {
      const order = compareSpiritProjectionPlans(
        context.candidateProjection,
        context.incumbentProjection,
        Math.abs(candidate.score - incumbent.score) <= 192,
      );
      if (order !== 0) return order > 0;
    }
    const spiritDevelopmentProjection =
      currentProEnabled(config) &&
      candidate.spiritDevelopment &&
      incumbent.spiritDevelopment &&
      !candidate.spiritSameTurnScoreSetupNow &&
      !incumbent.spiritSameTurnScoreSetupNow &&
      !candidate.spiritOwnManaSetupNow &&
      !incumbent.spiritOwnManaSetupNow &&
      replyFloorClose &&
      noTerminalRisk;
    if (spiritDevelopmentProjection) {
      const order = compareSpiritProjectionPlans(
        context.candidateProjection,
        context.incumbentProjection,
        Math.abs(candidate.score - incumbent.score) <= 192,
      );
      if (order !== 0) return order > 0;
    }
    if (
      tacticalProjection &&
      noTerminalRisk &&
      replyFloorClose &&
      !spiritPhase
    ) {
      const order = turnEngineComparePlans(
        context.candidateProjection.plan,
        context.incumbentProjection.plan,
      );
      if (order !== 0) return order > 0;
    }
  }
  if (candidate.interviewSoftPriority !== incumbent.interviewSoftPriority) {
    return candidate.interviewSoftPriority > incumbent.interviewSoftPriority;
  }
  if (candidateSnapshot.worstReplyScore !== incumbentSnapshot.worstReplyScore) {
    return (
      candidateSnapshot.worstReplyScore > incumbentSnapshot.worstReplyScore
    );
  }
  if (candidate.score !== incumbent.score)
    return candidate.score > incumbent.score;
  if (candidate.efficiency !== incumbent.efficiency) {
    return candidate.efficiency > incumbent.efficiency;
  }
  return false;
}

export function pickRootWithReplyRiskGuard(
  game: MonsGame,
  evaluations: readonly ReplyRiskRootEvaluation[],
  indices: readonly number[],
  perspective: Color,
  config: ReplyRiskSearchConfig,
  candidateIndices: readonly number[] = indices,
): number | undefined {
  if (config.enableRootReplyRiskGuard === false || checkpoint()) {
    return undefined;
  }
  let shortlist = replyRiskGuardShortlistIndices(evaluations, indices, config);
  if (shortlist.length === 0) return undefined;
  const reentry = currentProWhiteTurnFourManaSiblingReentry(
    game,
    evaluations,
    shortlist,
    perspective,
    config,
  );
  if (reentry !== undefined && !shortlist.includes(reentry)) {
    shortlist = [...shortlist, reentry].sort(
      (left, right) => -rankedRootOrder(evaluations, left, right),
    );
  }
  const rootNodeBudget = Math.max(
    shortlist.length,
    1,
    Math.trunc(
      ((config.maxVisitedNodes ?? 1_000) *
        Math.max(0, config.rootReplyRiskNodeShareBp ?? 2_000)) /
        10_000,
    ),
  );
  const perRootReplyLimit = Math.min(
    Math.max(1, config.rootReplyRiskReplyLimit ?? 24),
    Math.max(1, Math.trunc(rootNodeBudget / shortlist.length)),
  );
  const projections = turnEngineReplyRiskProjections(
    evaluations,
    shortlist,
    perspective,
    config,
  );
  const snapshots = new Map<number, RootReplyRiskSnapshot>();
  for (const index of shortlist) {
    if (checkpoint()) return undefined;
    const evaluation = evaluations[index];
    if (evaluation === undefined) continue;
    const projection = projections.get(index);
    if (projection !== undefined) {
      snapshots.set(
        index,
        rootReplyRiskSnapshotWithProjection(
          evaluation,
          projection,
          perspective,
          config,
          perRootReplyLimit,
        ),
      );
      continue;
    }
    const canUseLegacyProjection =
      config.enableTurnEngineSelector === true &&
      currentProEnabled(config) &&
      canTurnEngineProjectReplyRiskRoot(evaluation, perspective) &&
      !isPlainSpiritDevelopmentRoot(evaluation);
    const projected = canUseLegacyProjection
      ? config.projectedGameForReplyRisk?.(evaluation, index, perspective)
      : undefined;
    snapshots.set(
      index,
      rootReplyRiskSnapshot(
        projected ?? evaluation.game,
        perspective,
        config,
        perRootReplyLimit,
      ),
    );
  }
  const spiritFollowupScores = new Map<number, number>();
  const bestPlainSpiritIndex = plainSpiritReplyRiskPick(
    game,
    evaluations,
    shortlist,
    snapshots,
    projections,
    perspective,
    config,
    spiritFollowupScores,
  );
  if (
    shortlist.every((index) => {
      const root = evaluations[index];
      return root !== undefined && isPlainSpiritDevelopmentRoot(root);
    })
  ) {
    return bestPlainSpiritIndex;
  }
  if (
    currentProEnabled(config) &&
    shortlist.every((index) => {
      const value = snapshots.get(index);
      return (
        value !== undefined &&
        !value.allowsImmediateOpponentWin &&
        !value.opponentReachesMatchPoint
      );
    }) &&
    !safePlainSpiritCompetition(evaluations, shortlist, config) &&
    !whiteSpiritFollowupSetupCompetition(
      game,
      evaluations,
      shortlist,
      config,
    ) &&
    !safeProgressCompetition(evaluations, shortlist, config) &&
    !blackManaWindowProgressCompetition(game, evaluations, shortlist, config) &&
    !closePositiveScoreCompetition(evaluations, shortlist, config)
  ) {
    const ordered = [...shortlist].sort((left, right) => {
      const leftFloor = snapshots.get(left)?.worstReplyScore ?? I32_MIN;
      const rightFloor = snapshots.get(right)?.worstReplyScore ?? I32_MIN;
      return (
        rightFloor - leftFloor || -rankedRootOrder(evaluations, left, right)
      );
    });
    const first = ordered[0];
    const second = ordered[1];
    if (
      first !== undefined &&
      (second === undefined ||
        (snapshots.get(first)?.worstReplyScore ?? I32_MIN) >
          (snapshots.get(second)?.worstReplyScore ?? I32_MIN))
    ) {
      return first;
    }
  }
  let bestIndex =
    bestPlainSpiritIndex ?? shortlist.find((index) => snapshots.has(index));
  if (bestIndex === undefined) return undefined;
  for (const index of shortlist) {
    if (index === bestIndex) continue;
    const candidate = evaluations[index];
    const incumbent = evaluations[bestIndex];
    const candidateSnapshot = snapshots.get(index);
    const incumbentSnapshot = snapshots.get(bestIndex);
    if (
      candidate !== undefined &&
      incumbent !== undefined &&
      candidateSnapshot !== undefined &&
      incumbentSnapshot !== undefined &&
      isBetterReplyRiskCandidate(
        candidate,
        candidateSnapshot,
        incumbent,
        incumbentSnapshot,
        config,
        {
          candidateProjection: projections.get(index),
          incumbentProjection: projections.get(bestIndex),
          game,
          evaluations,
          candidateIndex: index,
          incumbentIndex: bestIndex,
          perspective,
          spiritFollowupScores,
        },
      )
    ) {
      bestIndex = index;
    }
  }
  if (
    currentProEnabled(config) &&
    bestPlainSpiritIndex !== undefined &&
    bestPlainSpiritIndex !== bestIndex
  ) {
    const plainSnapshot = snapshots.get(bestPlainSpiritIndex);
    const bestSnapshot = snapshots.get(bestIndex);
    const plainProjection = projections.get(bestPlainSpiritIndex);
    const bestProjection = projections.get(bestIndex);
    if (
      plainSnapshot !== undefined &&
      bestSnapshot !== undefined &&
      plainProjection !== undefined &&
      bestProjection !== undefined &&
      (mixedPlainSpiritReplyFloorOrder(
        plainSnapshot,
        plainProjection,
        bestSnapshot,
        bestProjection,
        config,
      ) ?? -1) > 0
    ) {
      bestIndex = bestPlainSpiritIndex;
    }
  }
  const bestRoot = evaluations[bestIndex];
  if (
    currentProEnabled(config) &&
    bestRoot !== undefined &&
    !bestRoot.spiritDevelopment &&
    !bestRoot.spiritSameTurnScoreSetupNow &&
    !bestRoot.spiritOwnManaSetupNow &&
    bestIndex >= 4
  ) {
    const omitted = candidateIndices
      .filter((index) => !shortlist.includes(index))
      .filter((index) => {
        const root = evaluations[index];
        return (
          root !== undefined &&
          root.spiritOwnManaSetupNow &&
          root.rootRank + 3 <= bestRoot.rootRank &&
          sameOpeningSafeSetupPair(root, bestRoot, config)
        );
      })
      .sort((left, right) => -rankedRootOrder(evaluations, left, right))[0];
    if (omitted !== undefined) {
      const candidate = evaluations[omitted];
      const incumbentSnapshot = snapshots.get(bestIndex);
      if (candidate !== undefined && incumbentSnapshot !== undefined) {
        const candidateSnapshot = rootReplyRiskSnapshotWithProjection(
          candidate,
          undefined,
          perspective,
          config,
          perRootReplyLimit,
        );
        if (
          omittedSameOpeningSetupCompetes(
            candidate,
            candidateSnapshot,
            bestRoot,
            incumbentSnapshot,
            config,
          ) ||
          isBetterReplyRiskCandidate(
            candidate,
            candidateSnapshot,
            bestRoot,
            incumbentSnapshot,
            config,
            {
              incumbentProjection: projections.get(bestIndex),
              game,
              evaluations,
              candidateIndex: omitted,
              incumbentIndex: bestIndex,
              perspective,
              spiritFollowupScores,
            },
          )
        ) {
          bestIndex = omitted;
        }
      }
    }
  }
  return checkpoint() ? undefined : bestIndex;
}

/** Shared CurrentPro seams consumed by the advisor without duplicating policy. */
export const replyRiskAdvisorPolicy = Object.freeze({
  rootFamily,
  rootIsUnsafe: isUnsafe,
  rootHasProgressSurface: hasProgressSurface,
  rootProgressOrSetupBetter,
  sameNonTacticalProgressLane,
  sameOpeningSafeSetupPair,
  safePlainSpiritCompetition,
  safeProgressCompetition,
  whiteSpiritFollowupSetupCompetition,
  blackManaWindowProgressCompetition,
  closePositiveScoreCompetition,
  currentProWhiteTurnFourManaSiblingReentry,
  turnEngineRootUtility: turnEngineSelectedOverrideUtility,
  turnEngineRootPlanUtility,
  turnEngineSpiritRootProjections,
  spiritFollowupFloorScore,
  spiritFollowupFloorOrder,
  lateSafeManaRootOrder,
  riskyRecoveryProgressSiblingOrder,
  safeProgressSiblingOrder,
  earlyBlackManaProgressReplyOrder,
  earlyBlackPlainSpiritManaReplyOrder,
  safeNonSpiritFollowupOrder,
  blackPlainSpiritFollowupReplyOrder,
  earlyBlackPlainSpiritSiblingOrder,
  whiteSpiritFollowupSetupReplyOrder,
  safePickupOrder,
  normalSafetyReplyOrder,
  omittedSameOpeningSetupCompetes,
  mixedPlainSpiritReplyFloorOrder,
  mixedPlainSpiritProjectionOrder,
  plainSpiritReplyRiskPick,
  compareSpiritProjectionPlans,
  spiritProjectionChallengeOrder,
  spiritScoreChallengeOrder,
});
