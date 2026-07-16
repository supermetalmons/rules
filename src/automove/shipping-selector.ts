import { TARGET_SCORE } from "../engine/config.js";
import {
  Color,
  MonKind,
  cloneInputs,
  inputChainsEqual,
  inputKey,
  isMonFainted,
  itemMon,
  type Input,
} from "../engine/domain.js";
import type { MonsGame } from "../engine/game.js";
import { saturatingAddI32, saturatingSubI32 } from "../engine/numerics.js";
import {
  currentProRootAdvisorPresearch,
  currentProRootAdvisorPriorityInputs,
  currentProRootPolicyCallbacks,
} from "./advisor.js";
import { cancelled, checkpoint } from "./deadline.js";
import {
  clearExactStateAnalysisCache,
  exactOpportunityContext,
  isDrainerExactlySafeNextTurnOnBoard,
} from "./exact.js";
import { hasRoundtripMonMove, manaHandoffPenalty } from "./move-efficiency.js";
import {
  clearReplyRiskCache,
  pickRootWithReplyRiskGuard,
  replyRiskAdvisorPolicy,
  replyRiskConfigForSearch,
  rootReplyRiskSnapshot,
} from "./reply-risk.js";
import {
  buildRootCandidateForInputs,
  rankRootCandidates,
  type RootCandidate,
} from "./root-candidates.js";
import { rootFamily } from "./root-family.js";
import {
  pickBaselineRootInputs,
  rootProgressStepsBetter,
  type RootSelectorOptions,
} from "./root-selector.js";
import {
  clearSearchCaches,
  flattenRootEvaluations,
  focusRootCandidatesForSearch,
  searchRootCandidates,
  type FlatRootEvaluation,
  type SearchRootOptions,
} from "./search.js";
import {
  AUTOMOVE_TURN_ENGINE_MODE,
  hasConcreteScoreSurface as rootHasConcreteScoreSurface,
  hasProgressSurface,
  isPlainSpiritDevelopmentRoot,
  rootIsUnsafe,
  type AutomoveSearchExecutionConfig,
  type RootEvaluation,
  type ScoredRootMove,
} from "./selector-types.js";
import {
  applyEarlyWhiteTurnEngineLimits,
  applyTurnEngineRerankLimits,
  currentProIsEarlyWhiteTurnStart,
} from "./turn-engine-config.js";
import {
  TurnEngineMode,
  TurnPlanFamily,
  clearTurnEnginePlanCache,
  compareTurnEngineUtilities,
  compareUtilityPrimaryAxes,
  turnEngineCachedStep,
  turnEngineCandidatePlan,
  turnEngineCandidatePlanFromAllowedHeads,
  turnEngineCandidatePlanLive,
  turnEngineCommitPlan,
  turnEngineNextInputsFromAllowedHeads,
  turnEngineStoreCachedStep,
  type TurnEngineConfig,
  type TurnPlan,
} from "./turn-engine.js";
import {
  applyInputsForSearch,
  applyInputsForSearchWithEvents,
} from "./transitions.js";

export { currentProIsEarlyWhiteTurnStart };

function valueAt<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`shipping selector index ${index} is out of bounds`);
  }
  return value;
}

function firstInputsEqual(
  left: readonly Input[],
  right: readonly Input[],
): boolean {
  const leftFirst = left[0];
  const rightFirst = right[0];
  return (
    leftFirst !== undefined &&
    rightFirst !== undefined &&
    inputKey(leftFirst) === inputKey(rightFirst)
  );
}

function modeFromConfig(config: AutomoveSearchExecutionConfig): TurnEngineMode {
  return config.turnEngineMode === AUTOMOVE_TURN_ENGINE_MODE.CurrentPro
    ? TurnEngineMode.CurrentPro
    : TurnEngineMode.ProV1;
}

function turnEngineModeUsesMacroPlans(mode: TurnEngineMode): boolean {
  return mode === TurnEngineMode.CurrentPro;
}

function positiveCap(value: number): number {
  return Math.max(Math.trunc(value), 1);
}

/** Exact selector-to-turn-engine configuration bridge from the legacy runtime. */
export function turnEngineConfigFromSearchConfig(
  config: AutomoveSearchExecutionConfig,
): TurnEngineConfig {
  return {
    mode: modeFromConfig(config),
    ownSeedCap: positiveCap(config.turnEngineSeedCap),
    ownBeam: positiveCap(config.turnEngineBeamWidth),
    perNodeFamilyCap: positiveCap(config.turnEnginePerNodeFamilyCap),
    stepCap: positiveCap(config.turnEngineStepCap),
    opponentSeedCap: positiveCap(config.turnEngineOpponentSeedCap),
    opponentBeam: positiveCap(config.turnEngineOpponentBeamWidth),
    replySeedCap: positiveCap(config.turnEngineReplySeedCap),
    replyBeam: positiveCap(config.turnEngineReplyBeamWidth),
    expansionCap: positiveCap(config.turnEngineExpansionCap),
    enableSpiritFamily: config.turnEngineEnableSpiritFamily,
    scoringWeights: config.scoringWeights,
    enableLazyOracleScoreWindowProjection: false,
  };
}

function currentProTurnEngineLive(
  config: AutomoveSearchExecutionConfig,
): boolean {
  return (
    config.enableTurnEngineSelector &&
    config.turnEngineMode === AUTOMOVE_TURN_ENGINE_MODE.CurrentPro
  );
}

function currentProLowBudgetGuardLive(
  config: AutomoveSearchExecutionConfig,
): boolean {
  return (
    currentProTurnEngineLive(config) && config.enableTurnEngineLowBudgetGuard
  );
}

function currentProMidTurnTacticalGuardLive(
  config: AutomoveSearchExecutionConfig,
): boolean {
  return (
    currentProTurnEngineLive(config) &&
    config.enableTurnEngineMidTurnTacticalGuard
  );
}

function currentProSecondaryAnalysisLive(
  config: AutomoveSearchExecutionConfig,
): boolean {
  return (
    currentProTurnEngineLive(config) && config.enableTurnEngineSecondaryAnalysis
  );
}

function currentProIsWhiteTurnOneManaOnlyFollowup(game: MonsGame): boolean {
  return (
    game.activeColor === Color.White &&
    game.turnNumber === 1 &&
    game.isFirstTurn() &&
    game.monsMovesCount === 1 &&
    !game.playerCanUseAction() &&
    !game.playerCanMoveMana()
  );
}

function currentProUseFreshLiveHeadPlan(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
): boolean {
  return (
    currentProTurnEngineLive(config) &&
    game.activeColor === Color.White &&
    game.turnNumber >= 3 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana()
  );
}

export function currentProIsSafeEarlyBlackOpeningState(
  game: MonsGame,
): boolean {
  if (
    game.activeColor !== Color.Black ||
    game.turnNumber !== 2 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana()
  ) {
    return false;
  }
  const context = exactOpportunityContext(game, game.activeColor);
  return (
    !context.opponentCanWinImmediately &&
    context.delta.sameTurnScoreWindowValue <= 0 &&
    context.delta.opponentWindowDenyGain <= 0 &&
    !context.delta.drainerAttackAvailable &&
    context.delta.drainerSafety >= 2
  );
}

export function shouldSkipCurrentProLowBudgetState(game: MonsGame): boolean {
  if (currentProIsEarlyWhiteTurnStart(game)) return false;
  if (game.playerCanUseAction() || game.playerCanMoveMana()) return false;
  const context = exactOpportunityContext(game, game.activeColor);
  return (
    !context.opponentCanWinImmediately &&
    context.delta.sameTurnScoreWindowValue <= 0 &&
    context.delta.opponentWindowDenyGain <= 0 &&
    !context.delta.drainerAttackAvailable &&
    context.delta.safeSupermanaProgressSteps === undefined &&
    context.delta.safeOpponentManaProgressSteps === undefined &&
    context.delta.drainerSafety >= 0
  );
}

export function shouldDisableCurrentProMidTurnTacticalEngine(
  game: MonsGame,
): boolean {
  if (
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount === 0 ||
    game.monsMovesCount > 2 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    currentProIsEarlyWhiteTurnStart(game)
  ) {
    return false;
  }
  const context = exactOpportunityContext(game, game.activeColor);
  return (
    !context.opponentCanWinImmediately &&
    context.delta.drainerSafety < 0 &&
    context.delta.sameTurnScoreWindowValue <= 0 &&
    context.delta.safeSupermanaProgressSteps === undefined &&
    context.delta.safeOpponentManaProgressSteps === undefined
  );
}

function applyCurrentProLowBudgetSearchClamp(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
): AutomoveSearchExecutionConfig {
  if (!currentProLowBudgetGuardLive(config)) return config;
  if (
    game.activeColor !== Color.Black ||
    game.turnNumber !== 2 ||
    game.monsMovesCount > 1 ||
    (game.playerCanUseAction() && game.playerCanMoveMana())
  ) {
    return config;
  }
  return {
    ...config,
    maxVisitedNodes: Math.min(config.maxVisitedNodes, 6_000),
    rootBranchLimit: Math.min(Math.max(config.rootBranchLimit, 1), 12),
    rootReplyRiskReplyLimit: Math.min(
      Math.max(config.rootReplyRiskReplyLimit, 1),
      12,
    ),
    rootReplyRiskNodeShareBp: Math.min(config.rootReplyRiskNodeShareBp, 1_200),
  };
}

export function turnEngineConfigForGame(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
): TurnEngineConfig {
  const engine = turnEngineConfigFromSearchConfig(config);
  if (
    !turnEngineModeUsesMacroPlans(engine.mode) ||
    !config.enableTurnEngineLowBudgetGuard ||
    !currentProIsEarlyWhiteTurnStart(game)
  ) {
    return engine;
  }
  return applyEarlyWhiteTurnEngineLimits(engine);
}

export function turnEngineRerankConfig(
  config: AutomoveSearchExecutionConfig,
): TurnEngineConfig {
  return applyTurnEngineRerankLimits(turnEngineConfigFromSearchConfig(config));
}

function hasPickupUpgrade(
  candidate: ScoredRootMove | RootEvaluation,
  selected: ScoredRootMove | RootEvaluation,
): boolean {
  return (
    (candidate.safeSupermanaPickupNow && !selected.safeSupermanaPickupNow) ||
    (candidate.safeOpponentManaPickupNow && !selected.safeOpponentManaPickupNow)
  );
}

function rootHasProgressSurface(
  root: ScoredRootMove | RootEvaluation,
): boolean {
  return (
    hasProgressSurface(root) ||
    root.scoresSupermanaThisTurn ||
    root.scoresOpponentManaThisTurn
  );
}

function isCurrentProNonConcreteManaWindowRoot(root: RootEvaluation): boolean {
  return (
    rootFamily(root) === TurnPlanFamily.ManaTempo &&
    root.sameTurnScoreWindowValue > 0 &&
    root.sameTurnScoreWindowValue <= 1 &&
    !rootHasConcreteScoreSurface(root) &&
    !root.attacksOpponentDrainer &&
    !root.manaHandoffToOpponent &&
    !root.hasRoundtrip
  );
}

function ownDrainerVulnerableNextTurn(
  game: MonsGame,
  perspective: Color,
): boolean {
  for (const [location, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (mon?.kind !== MonKind.Drainer || mon.color !== perspective) continue;
    if (isMonFainted(mon)) return true;
    if (game.isFirstTurn()) return false;
    return !isDrainerExactlySafeNextTurnOnBoard(
      game.board,
      perspective,
      location,
    );
  }
  return false;
}

function isBetterTacticalRootCandidate(
  candidate: ScoredRootMove,
  incumbent: ScoredRootMove,
): boolean {
  const preferBoolean = (
    candidateValue: boolean,
    incumbentValue: boolean,
    preferTrue = true,
  ): boolean | undefined =>
    candidateValue === incumbentValue
      ? undefined
      : candidateValue === preferTrue;
  let result = preferBoolean(
    candidate.winsImmediately,
    incumbent.winsImmediately,
  );
  result ??= preferBoolean(
    candidate.attacksOpponentDrainer,
    incumbent.attacksOpponentDrainer,
  );
  result ??= preferBoolean(
    candidate.ownDrainerVulnerable,
    incumbent.ownDrainerVulnerable,
    false,
  );
  result ??= preferBoolean(
    candidate.classes.immediateScore,
    incumbent.classes.immediateScore,
  );
  result ??= preferBoolean(
    candidate.scoresSupermanaThisTurn,
    incumbent.scoresSupermanaThisTurn,
  );
  result ??= preferBoolean(
    candidate.scoresOpponentManaThisTurn,
    incumbent.scoresOpponentManaThisTurn,
  );
  result ??= preferBoolean(
    candidate.safeSupermanaPickupNow,
    incumbent.safeSupermanaPickupNow,
  );
  result ??= preferBoolean(
    candidate.safeOpponentManaPickupNow,
    incumbent.safeOpponentManaPickupNow,
  );
  if (result !== undefined) return result;
  if (
    candidate.sameTurnScoreWindowValue !== incumbent.sameTurnScoreWindowValue
  ) {
    return (
      candidate.sameTurnScoreWindowValue > incumbent.sameTurnScoreWindowValue
    );
  }
  result = preferBoolean(
    candidate.spiritSameTurnScoreSetupNow,
    incumbent.spiritSameTurnScoreSetupNow,
  );
  result ??= preferBoolean(
    candidate.spiritOwnManaSetupNow,
    incumbent.spiritOwnManaSetupNow,
  );
  if (result !== undefined) return result;
  if (
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.supermanaProgress &&
    incumbent.supermanaProgress &&
    candidate.safeSupermanaProgressSteps !==
      incumbent.safeSupermanaProgressSteps
  ) {
    return rootProgressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      incumbent.safeSupermanaProgressSteps,
    );
  }
  if (
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.opponentManaProgress &&
    incumbent.opponentManaProgress &&
    candidate.safeOpponentManaProgressSteps !==
      incumbent.safeOpponentManaProgressSteps
  ) {
    return rootProgressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      incumbent.safeOpponentManaProgressSteps,
    );
  }
  result = preferBoolean(
    candidate.supermanaProgress,
    incumbent.supermanaProgress,
  );
  if (result !== undefined) return result;
  if (
    candidate.supermanaProgress &&
    incumbent.supermanaProgress &&
    candidate.safeSupermanaProgressSteps !==
      incumbent.safeSupermanaProgressSteps
  ) {
    return rootProgressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      incumbent.safeSupermanaProgressSteps,
    );
  }
  result = preferBoolean(
    candidate.opponentManaProgress,
    incumbent.opponentManaProgress,
  );
  if (result !== undefined) return result;
  if (
    candidate.opponentManaProgress &&
    incumbent.opponentManaProgress &&
    candidate.safeOpponentManaProgressSteps !==
      incumbent.safeOpponentManaProgressSteps
  ) {
    return rootProgressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      incumbent.safeOpponentManaProgressSteps,
    );
  }
  result = preferBoolean(
    candidate.manaHandoffToOpponent,
    incumbent.manaHandoffToOpponent,
    false,
  );
  result ??= preferBoolean(
    candidate.hasRoundtrip,
    incumbent.hasRoundtrip,
    false,
  );
  result ??= preferBoolean(
    candidate.spiritDevelopment,
    incumbent.spiritDevelopment,
  );
  if (result !== undefined) return result;
  if (candidate.efficiency !== incumbent.efficiency) {
    return candidate.efficiency > incumbent.efficiency;
  }
  return candidate.heuristic > incumbent.heuristic;
}

function bestTacticalRootIndex(
  roots: readonly ScoredRootMove[],
  predicate: (root: ScoredRootMove) => boolean,
): number | undefined {
  let best: number | undefined;
  roots.forEach((root, index) => {
    if (
      predicate(root) &&
      (best === undefined ||
        isBetterTacticalRootCandidate(root, valueAt(roots, best)))
    ) {
      best = index;
    }
  });
  return best;
}

export function forcedTacticalPrepassChoice(
  game: MonsGame,
  perspective: Color,
  roots: readonly ScoredRootMove[],
  config: AutomoveSearchExecutionConfig,
): Input[] | undefined {
  if (!config.enableForcedTacticalPrepass || roots.length === 0) {
    return undefined;
  }
  const choose = (
    predicate: (root: ScoredRootMove) => boolean,
  ): Input[] | undefined => {
    const index = bestTacticalRootIndex(roots, predicate);
    return index === undefined
      ? undefined
      : cloneInputs(valueAt(roots, index).inputs);
  };
  let choice = choose((root) => root.winsImmediately);
  if (choice !== undefined) return choice;

  const hasSupermanaScoring =
    config.enableSupermanaPrepassException &&
    roots.some((root) => root.scoresSupermanaThisTurn);
  const safeSupermanaPickup = (root: ScoredRootMove): boolean =>
    root.safeSupermanaPickupNow &&
    !root.ownDrainerVulnerable &&
    !root.manaHandoffToOpponent &&
    !root.winsImmediately &&
    !root.attacksOpponentDrainer;
  const hasSafeSupermanaPickup =
    config.enableSupermanaPrepassException && roots.some(safeSupermanaPickup);
  const hasException = hasSupermanaScoring || hasSafeSupermanaPickup;
  if (config.enableSupermanaPrepassException) {
    choice = choose((root) => root.scoresSupermanaThisTurn);
    if (choice !== undefined) return choice;
    choice = choose(safeSupermanaPickup);
    if (choice !== undefined) return choice;
  }
  if (!hasException) {
    choice = choose((root) => root.attacksOpponentDrainer);
    if (choice !== undefined) return choice;
  }
  if (!hasException && ownDrainerVulnerableNextTurn(game, perspective)) {
    choice = choose((root) => !root.ownDrainerVulnerable);
    if (choice !== undefined) return choice;
  }
  const opponentScore =
    perspective === Color.White ? game.blackScore : game.whiteScore;
  if (TARGET_SCORE - opponentScore <= 1) {
    return choose((root) => root.classes.immediateScore);
  }
  return undefined;
}

export function acceptTurnEngineCachedStep(
  roots: readonly ScoredRootMove[],
  cachedInputs: readonly Input[],
  mode: TurnEngineMode,
): boolean {
  const index = roots.findIndex((root) =>
    inputChainsEqual(root.inputs, cachedInputs),
  );
  if (index < 0) return false;
  if (index === 0) return true;
  const top = roots[0];
  if (top === undefined) return false;
  if (top.winsImmediately) return false;
  const candidate = valueAt(roots, index);
  const gap = saturatingSubI32(top.heuristic, candidate.heuristic);
  if (mode === TurnEngineMode.ProV1) {
    return index <= 2 && gap <= 96 && !rootIsUnsafe(candidate);
  }
  const candidateTactical =
    candidate.winsImmediately ||
    candidate.attacksOpponentDrainer ||
    candidate.classes.drainerSafetyRecover ||
    candidate.spiritSameTurnScoreSetupNow ||
    candidate.spiritOwnManaSetupNow ||
    candidate.spiritDevelopment ||
    candidate.scoresSupermanaThisTurn ||
    candidate.scoresOpponentManaThisTurn ||
    candidate.safeSupermanaPickupNow ||
    candidate.safeOpponentManaPickupNow ||
    rootProgressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      top.safeSupermanaProgressSteps,
    ) ||
    rootProgressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      top.safeOpponentManaProgressSteps,
    );
  const candidateUnsafe = rootIsUnsafe(candidate);
  return (
    (!candidateUnsafe && index <= 4 && gap <= 128) ||
    (!candidateUnsafe && candidateTactical && index <= 8 && gap <= 224) ||
    (!candidateUnsafe && rootIsUnsafe(top) && index <= 10 && gap <= 256)
  );
}

function shouldResumeTurnEngineCachedStep(
  roots: readonly ScoredRootMove[],
  cachedInputs: readonly Input[],
  mode: TurnEngineMode,
): boolean {
  return (
    turnEngineModeUsesMacroPlans(mode) &&
    acceptTurnEngineCachedStep(roots, cachedInputs, mode) &&
    inputChainsEqual(roots[0]?.inputs ?? [], cachedInputs)
  );
}

export function shouldSkipCurrentProHeadPlanForRootContext(
  game: MonsGame,
  roots: readonly ScoredRootMove[],
  config: AutomoveSearchExecutionConfig,
): boolean {
  if (
    config.turnEngineMode !== AUTOMOVE_TURN_ENGINE_MODE.CurrentPro ||
    !config.enableTurnEngineLowBudgetGuard ||
    roots.length === 0
  ) {
    return false;
  }
  if (currentProIsEarlyWhiteTurnStart(game)) return false;
  if (
    !game.playerCanUseAction() &&
    !game.playerCanMoveMana() &&
    game.monsMovesCount >= 4
  ) {
    return true;
  }
  return (
    game.activeColor === Color.Black &&
    game.turnNumber === 2 &&
    game.monsMovesCount <= 1
  );
}

export function forcedLowBudgetTurnEnginePrepassChoice(
  game: MonsGame,
  roots: readonly ScoredRootMove[],
  plan: TurnPlan,
  config: AutomoveSearchExecutionConfig,
): Input[] | undefined {
  if (
    config.turnEngineMode !== AUTOMOVE_TURN_ENGINE_MODE.CurrentPro ||
    !config.enableTurnEngineLowBudgetGuard ||
    roots.length === 0
  ) {
    return undefined;
  }
  const lowBudgetOpening =
    currentProIsEarlyWhiteTurnStart(game) ||
    currentProIsSafeEarlyBlackOpeningState(game);
  if (!lowBudgetOpening) return undefined;
  const inputs = plan.compiledChunks[0];
  if (inputs === undefined) return undefined;
  const index = roots.findIndex((root) =>
    inputChainsEqual(root.inputs, inputs),
  );
  if (index < 0) return undefined;
  const candidate = valueAt(roots, index);
  if (rootIsUnsafe(candidate)) return undefined;
  const top = roots[0];
  if (top === undefined) return undefined;
  if (
    top.winsImmediately ||
    top.attacksOpponentDrainer ||
    top.classes.drainerSafetyRecover
  ) {
    return undefined;
  }
  const gap = saturatingSubI32(top.heuristic, candidate.heuristic);
  const progressFamily =
    plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
    plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress ||
    plan.headFamily === TurnPlanFamily.DrainerSafetyRecovery;
  const topPlainSpirit = isPlainSpiritDevelopmentRoot(top);
  const candidateProgress = rootHasProgressSurface(candidate);
  if (index === 0 && progressFamily) return cloneInputs(candidate.inputs);
  if (
    currentProIsEarlyWhiteTurnStart(game) &&
    topPlainSpirit &&
    !rootIsUnsafe(top) &&
    candidateProgress &&
    index <= 2 &&
    gap <= 96
  ) {
    return cloneInputs(candidate.inputs);
  }
  if (
    currentProIsSafeEarlyBlackOpeningState(game) &&
    index <= 1 &&
    gap <= 96 &&
    (candidateProgress || candidate.spiritDevelopment)
  ) {
    return cloneInputs(candidate.inputs);
  }
  return undefined;
}

export function shouldInvokeTurnHeadRerank(
  roots: readonly ScoredRootMove[],
): boolean {
  const tactical = (root: ScoredRootMove): boolean =>
    root.winsImmediately ||
    root.attacksOpponentDrainer ||
    root.sameTurnScoreWindowValue >= 2 ||
    root.scoresSupermanaThisTurn ||
    root.scoresOpponentManaThisTurn ||
    root.safeSupermanaPickupNow ||
    root.safeOpponentManaPickupNow ||
    root.supermanaProgress ||
    root.opponentManaProgress ||
    root.spiritSameTurnScoreSetupNow ||
    root.spiritDevelopment ||
    root.classes.drainerSafetyRecover;
  return (
    roots[0] !== undefined &&
    (tactical(roots[0]) || roots.slice(0, 3).some(tactical))
  );
}

export function classifyTurnEngineRerankOverride(
  roots: readonly ScoredRootMove[],
  overrideInputs: readonly Input[],
): boolean {
  const index = roots.findIndex((root) =>
    inputChainsEqual(root.inputs, overrideInputs),
  );
  const top = roots[0];
  if (index < 0 || top === undefined) return false;
  const topUnsafe = rootIsUnsafe(top);
  if (index === 0) {
    const topTactical =
      top.winsImmediately ||
      top.attacksOpponentDrainer ||
      top.scoresSupermanaThisTurn ||
      top.scoresOpponentManaThisTurn ||
      top.safeSupermanaPickupNow ||
      top.safeOpponentManaPickupNow ||
      top.supermanaProgress ||
      top.opponentManaProgress ||
      top.sameTurnScoreWindowValue > 0 ||
      top.spiritSameTurnScoreSetupNow ||
      top.spiritDevelopment ||
      top.classes.drainerSafetyRecover;
    return topTactical && !topUnsafe;
  }
  const candidate = valueAt(roots, index);
  if (candidate.winsImmediately) return true;
  if (top.winsImmediately || rootIsUnsafe(candidate)) return false;
  const decisive =
    candidate.attacksOpponentDrainer ||
    candidate.scoresSupermanaThisTurn ||
    candidate.scoresOpponentManaThisTurn ||
    candidate.safeSupermanaPickupNow ||
    candidate.safeOpponentManaPickupNow;
  const soft =
    candidate.sameTurnScoreWindowValue > 0 ||
    candidate.spiritSameTurnScoreSetupNow;
  const gap = saturatingSubI32(top.heuristic, candidate.heuristic);
  const materialAdvantage =
    (candidate.attacksOpponentDrainer && !top.attacksOpponentDrainer) ||
    ((candidate.scoresSupermanaThisTurn ||
      candidate.scoresOpponentManaThisTurn) &&
      !(top.scoresSupermanaThisTurn || top.scoresOpponentManaThisTurn)) ||
    ((candidate.safeSupermanaPickupNow ||
      candidate.safeOpponentManaPickupNow) &&
      !(top.safeSupermanaPickupNow || top.safeOpponentManaPickupNow)) ||
    (candidate.classes.drainerSafetyRecover &&
      !top.classes.drainerSafetyRecover &&
      top.ownDrainerVulnerable &&
      !candidate.ownDrainerVulnerable) ||
    candidate.sameTurnScoreWindowValue >
      saturatingAddI32(top.sameTurnScoreWindowValue, 1);
  const progressBetter =
    candidate.safeSupermanaProgressSteps < top.safeSupermanaProgressSteps ||
    candidate.safeOpponentManaProgressSteps < top.safeOpponentManaProgressSteps;
  const safer =
    (!candidate.ownDrainerVulnerable && top.ownDrainerVulnerable) ||
    (!candidate.manaHandoffToOpponent && top.manaHandoffToOpponent);
  const progress =
    candidate.supermanaProgress ||
    candidate.opponentManaProgress ||
    progressBetter;
  const progressOnly =
    progress &&
    !decisive &&
    !soft &&
    !candidate.classes.drainerSafetyRecover &&
    !candidate.spiritSameTurnScoreSetupNow;
  if (progressOnly) {
    return (safer || topUnsafe) && index <= 4 && gap <= 180;
  }
  const safetyProgressFallback =
    safer && progressBetter && index <= 5 && gap <= 220;
  if (decisive || soft || candidate.classes.drainerSafetyRecover || progress) {
    if (
      candidate.ownDrainerVulnerable &&
      !candidate.classes.drainerSafetyRecover
    ) {
      return false;
    }
    const signal =
      materialAdvantage ||
      (progressBetter && (safer || topUnsafe)) ||
      (candidate.classes.drainerSafetyRecover &&
        top.ownDrainerVulnerable &&
        !candidate.ownDrainerVulnerable) ||
      (candidate.spiritSameTurnScoreSetupNow &&
        candidate.sameTurnScoreWindowValue > top.sameTurnScoreWindowValue);
    return (
      (signal && index <= 6 && gap <= 520) ||
      (materialAdvantage && index <= 8 && gap <= 640)
    );
  }
  return safetyProgressFallback;
}

function allowedRerankOverrideCandidate(
  roots: readonly ScoredRootMove[],
  inputs: readonly Input[],
): boolean {
  const root = roots.find((candidate) =>
    inputChainsEqual(candidate.inputs, inputs),
  );
  return (
    root !== undefined &&
    (root.winsImmediately ||
      root.attacksOpponentDrainer ||
      root.scoresSupermanaThisTurn ||
      root.scoresOpponentManaThisTurn ||
      root.safeSupermanaPickupNow ||
      root.safeOpponentManaPickupNow ||
      root.classes.drainerSafetyRecover ||
      root.sameTurnScoreWindowValue > 0 ||
      root.spiritSameTurnScoreSetupNow)
  );
}

function shippingRootAdvisorPresearch(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  roots: ScoredRootMove[],
  plan: TurnPlan | undefined,
) {
  return currentProRootAdvisorPresearch(
    game,
    perspective,
    config,
    roots,
    plan,
    {
      buildInjectedRootCandidate: (
        candidateGame,
        candidatePerspective,
        _candidateConfig,
        inputs,
      ) =>
        buildRootCandidateForInputs(
          candidateGame,
          candidatePerspective,
          config,
          inputs,
        ),
    },
  );
}

function advisorConflictsWithChoice(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  roots: readonly ScoredRootMove[],
  plan: TurnPlan | undefined,
  inputs: readonly Input[],
): boolean {
  const decision = shippingRootAdvisorPresearch(
    game,
    perspective,
    config,
    [...roots],
    plan,
  );
  const approved = decision?.approvedRoot?.inputs;
  return approved !== undefined && !inputChainsEqual(approved, inputs);
}

function seedTurnEngineFollowupCacheIfSafe(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  mode: TurnEngineMode,
  plan: TurnPlan,
): void {
  if (!turnEngineModeUsesMacroPlans(mode) || plan.compiledChunks.length < 2) {
    return;
  }
  const first = plan.compiledChunks[0];
  const second = plan.compiledChunks[1];
  if (first === undefined || second === undefined) return;
  const afterFirst = applyInputsForSearch(game, first);
  if (afterFirst?.activeColor !== perspective) return;
  const afterConfig = turnEngineConfigForGame(afterFirst, config);
  const roots = rankRootCandidates(afterFirst, perspective, config);
  if (!shouldResumeTurnEngineCachedStep(roots, second, mode)) return;
  turnEngineStoreCachedStep(afterFirst, mode, afterConfig, second);
}

function commitPlanAndSeedFollowup(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  mode: TurnEngineMode,
  plan: TurnPlan,
  engineConfig: TurnEngineConfig,
): void {
  turnEngineCommitPlan(game, perspective, mode, plan, engineConfig);
  seedTurnEngineFollowupCacheIfSafe(game, perspective, config, mode, plan);
}

function isCurrentProBlackPlainSpiritFollowupSetupPair(
  game: MonsGame,
  plain: RootEvaluation,
  setup: RootEvaluation,
  config: AutomoveSearchExecutionConfig,
): boolean {
  return (
    config.turnEngineMode === AUTOMOVE_TURN_ENGINE_MODE.CurrentPro &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    isPlainSpiritDevelopmentRoot(plain) &&
    setup.spiritOwnManaSetupNow &&
    !setup.spiritSameTurnScoreSetupNow &&
    firstInputsEqual(plain.inputs, setup.inputs) &&
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

function turnEngineSelectedUtility(
  game: MonsGame,
  root: RootEvaluation,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
) {
  return replyRiskAdvisorPolicy.turnEngineRootUtility(
    game,
    root,
    perspective,
    replyRiskConfigForSearch(config),
    rootFamily(root),
  );
}

function projectedPlanIsSafelyCompleted(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  plan: TurnPlan,
): boolean {
  let projected = game.cloneForSimulation();
  const events = [];
  for (const chunk of plan.compiledChunks) {
    const applied = applyInputsForSearchWithEvents(projected, chunk);
    if (applied === undefined) return false;
    events.push(...applied.events);
    projected = applied.game;
  }
  const turnFinished =
    projected.winnerColor() !== undefined ||
    projected.activeColor !== perspective ||
    (!projected.playerCanMoveMon() &&
      !projected.playerCanUseAction() &&
      !projected.playerCanMoveMana());
  const nearCompletion =
    turnFinished ||
    plan.compiledChunks.length >= 4 ||
    !projected.playerCanMoveMon() ||
    (!projected.playerCanUseAction() && !projected.playerCanMoveMana());
  const handoff =
    manaHandoffPenalty(
      events,
      perspective,
      Math.max(config.rootManaHandoffPenalty, 1),
    ) > 0;
  const vulnerable =
    projected.winnerColor() !== perspective &&
    ownDrainerVulnerableNextTurn(projected, perspective);
  return (
    nearCompletion && !handoff && !hasRoundtripMonMove(events) && !vulnerable
  );
}

/**
 * Conservative post-search macro-plan gate. It preserves the Rust selector's
 * family ordering, safety floor, score-gap caps, and completed-plan escape.
 */
export function acceptTurnEngineHeadAfterSearch(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  roots: readonly RootEvaluation[],
  selectedInputs: readonly Input[],
  plan: TurnPlan,
): boolean {
  const candidateInputs = plan.compiledChunks[0];
  if (candidateInputs === undefined) return false;
  const candidateIndex = roots.findIndex((root) =>
    inputChainsEqual(root.inputs, candidateInputs),
  );
  const selectedIndex = roots.findIndex((root) =>
    inputChainsEqual(root.inputs, selectedInputs),
  );
  if (candidateIndex < 0 || selectedIndex < 0) return false;
  if (candidateIndex === selectedIndex) return true;
  const candidate = valueAt(roots, candidateIndex);
  const selected = valueAt(roots, selectedIndex);
  if (selected.winsImmediately && !candidate.winsImmediately) return false;

  const macroMode = turnEngineModeUsesMacroPlans(modeFromConfig(config));
  const candidateUnsafe = rootIsUnsafe(candidate);
  const selectedUnsafe = rootIsUnsafe(selected);
  const candidateProgress = rootHasProgressSurface(candidate);
  const selectedProgress = rootHasProgressSurface(selected);
  const exactContext = exactOpportunityContext(game, game.activeColor);
  const scoreGap = saturatingSubI32(selected.score, candidate.score);
  const sameTurnWindowBetter =
    candidate.sameTurnScoreWindowValue > selected.sameTurnScoreWindowValue;
  const drainerAttackBetter =
    candidate.attacksOpponentDrainer && !selected.attacksOpponentDrainer;
  const scoresNowBetter =
    (candidate.scoresSupermanaThisTurn ||
      candidate.scoresOpponentManaThisTurn) &&
    !(selected.scoresSupermanaThisTurn || selected.scoresOpponentManaThisTurn);
  const safetyRecoverBetter =
    candidate.classes.drainerSafetyRecover &&
    !selected.classes.drainerSafetyRecover &&
    selected.ownDrainerVulnerable &&
    !candidate.ownDrainerVulnerable;
  const spiritWindowBetter =
    candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    candidate.sameTurnScoreWindowValue >= selected.sameTurnScoreWindowValue;
  const spiritDevelopmentBetter =
    candidate.spiritDevelopment && !selected.spiritDevelopment;
  const candidateSpiritTactical =
    candidate.spiritSameTurnScoreSetupNow ||
    candidate.sameTurnScoreWindowValue > 0 ||
    candidate.attacksOpponentDrainer ||
    candidate.scoresSupermanaThisTurn ||
    candidate.scoresOpponentManaThisTurn ||
    candidate.safeSupermanaPickupNow ||
    candidate.safeOpponentManaPickupNow;
  const progressBetter =
    (rootProgressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      selected.safeSupermanaProgressSteps,
    ) ||
      rootProgressStepsBetter(
        candidate.safeOpponentManaProgressSteps,
        selected.safeOpponentManaProgressSteps,
      )) &&
    !selected.winsImmediately &&
    !selected.attacksOpponentDrainer &&
    !selected.spiritSameTurnScoreSetupNow;
  const selectedSpiritPhase =
    selected.spiritDevelopment ||
    selected.spiritSameTurnScoreSetupNow ||
    selected.spiritOwnManaSetupNow;
  const candidateFamily = rootFamily(candidate);
  const selectedFamily = rootFamily(selected);
  let selectedUtilityCache: ReturnType<
    typeof turnEngineSelectedUtility
  > | null = null;
  const selectedUtilityValue = (): ReturnType<
    typeof turnEngineSelectedUtility
  > => {
    selectedUtilityCache ??= turnEngineSelectedUtility(
      game,
      selected,
      perspective,
      config,
    );
    return selectedUtilityCache;
  };
  let candidateUtilityCache: ReturnType<
    typeof turnEngineSelectedUtility
  > | null = null;
  const candidateUtilityValue = (): ReturnType<
    typeof turnEngineSelectedUtility
  > => {
    candidateUtilityCache ??= turnEngineSelectedUtility(
      game,
      candidate,
      perspective,
      config,
    );
    return candidateUtilityCache;
  };
  const blackSpiritPair =
    macroMode &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    isCurrentProBlackPlainSpiritFollowupSetupPair(
      game,
      candidate,
      selected,
      config,
    ) &&
    candidate.score > selected.score;
  const whiteSpiritSetupGain =
    macroMode &&
    game.activeColor === Color.White &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !selectedUnsafe &&
    !candidateUnsafe &&
    candidate.spiritOwnManaSetupNow &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    selected.spiritDevelopment &&
    candidate.spiritDevelopment &&
    candidate.spiritSetupGain >=
      saturatingAddI32(selected.spiritSetupGain, 32) &&
    candidate.safeSupermanaProgressSteps <=
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps <=
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    scoreGap <= 96;
  const blackTurnSixRouteChangePlainSpirit =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber === 6 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    plan.goalFamily === TurnPlanFamily.SpiritImpact &&
    candidateIndex <= 1 &&
    candidateUnsafe === selectedUnsafe &&
    isPlainSpiritDevelopmentRoot(candidate) &&
    !candidateProgress &&
    !candidateSpiritTactical &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    selectedUnsafe &&
    !selected.spiritDevelopment &&
    !selected.spiritSameTurnScoreSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !selectedProgress &&
    !rootHasConcreteScoreSurface(selected) &&
    selected.sameTurnScoreWindowValue === 0 &&
    !firstInputsEqual(candidate.inputs, selected.inputs) &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    scoreGap <= 1_024 &&
    candidateUtilityValue().supportsPrimaryAxesEvalTolerance(
      selectedUtilityValue(),
      64,
    );

  if (macroMode) {
    const selectedUtility = selectedUtilityValue();
    const candidateUtility = candidateUtilityValue();
    const blackNonConcreteWindowBlocksSpiritProgress =
      game.activeColor === Color.Black &&
      game.turnNumber <= 6 &&
      (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
        plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
      plan.goalFamily === TurnPlanFamily.ImmediateScore &&
      candidateFamily === TurnPlanFamily.ManaTempo &&
      selectedFamily === TurnPlanFamily.SpiritImpact &&
      isCurrentProNonConcreteManaWindowRoot(candidate) &&
      selectedProgress &&
      compareUtilityPrimaryAxes(plan.headUtility, selectedUtility) < 0;
    if (blackNonConcreteWindowBlocksSpiritProgress) return false;
    const planDominates =
      compareUtilityPrimaryAxes(plan.utility, selectedUtility) > 0 &&
      (plan.utility.strictlyDominatesOverrideAxes(selectedUtility) ||
        plan.headUtility.strictlyDominatesOverrideAxes(selectedUtility));
    const candidateDominates =
      compareUtilityPrimaryAxes(candidateUtility, selectedUtility) > 0 &&
      candidateUtility.strictlyDominatesOverrideAxes(selectedUtility);
    if (
      !blackTurnSixRouteChangePlainSpirit &&
      !whiteSpiritSetupGain &&
      !planDominates &&
      !candidateDominates
    ) {
      return false;
    }
  }

  const narrowUnsafeBlackManaScore =
    macroMode &&
    plan.headFamily === TurnPlanFamily.ImmediateScore &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    game.monsMovesCount === 0 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    candidateUnsafe &&
    !selectedUnsafe &&
    !candidate.winsImmediately &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    candidate.sameTurnScoreWindowValue <= selected.sameTurnScoreWindowValue;
  const earlySafeManaBlocksSpirit =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount <= 2 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !selectedUnsafe &&
    !candidateUnsafe &&
    !selected.spiritDevelopment &&
    !selected.spiritSameTurnScoreSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    candidate.spiritDevelopment &&
    candidate.spiritOwnManaSetupNow &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.winsImmediately &&
    !candidate.attacksOpponentDrainer &&
    !rootHasConcreteScoreSurface(candidate) &&
    candidate.sameTurnScoreWindowValue === 0;
  const blackTurnStartSafeManaBlocksPlainSpirit =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber >= 5 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !selectedSpiritPhase &&
    isPlainSpiritDevelopmentRoot(candidate) &&
    !candidateProgress &&
    !candidateSpiritTactical &&
    firstInputsEqual(candidate.inputs, selected.inputs) &&
    candidateUnsafe === selectedUnsafe &&
    candidate.safeSupermanaProgressSteps >=
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps >=
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    scoreGap > 96;
  const whiteTurnStartSafeManaBlocksPlainSpirit =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber >= 5 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !selectedUnsafe &&
    !candidateUnsafe &&
    !selectedSpiritPhase &&
    isPlainSpiritDevelopmentRoot(candidate) &&
    candidateProgress &&
    !candidateSpiritTactical &&
    firstInputsEqual(candidate.inputs, selected.inputs) &&
    candidate.safeSupermanaProgressSteps >=
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps >=
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    candidate.score <= selected.score &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter;
  const whiteLateSafeManaBlocksPlainSpirit =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber >= 5 &&
    game.monsMovesCount >= 1 &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !selectedSpiritPhase &&
    isPlainSpiritDevelopmentRoot(candidate) &&
    !candidateProgress &&
    !candidateSpiritTactical &&
    candidate.sameTurnScoreWindowValue === 0 &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    candidate.score <= selected.score &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter;
  const blackNoActionVulnerableProgressHead =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber >= 6 &&
    game.monsMovesCount === 0 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    (candidateFamily === TurnPlanFamily.SafeSupermanaProgress ||
      candidateFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !selectedSpiritPhase &&
    !candidate.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    candidate.sameTurnScoreWindowValue === 0 &&
    selected.sameTurnScoreWindowValue === 0 &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.ownDrainerVulnerable &&
    !selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter;
  const blackEarlySameWindowManaHead =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    candidate.sameTurnScoreWindowValue > 0 &&
    candidate.sameTurnScoreWindowValue === selected.sameTurnScoreWindowValue &&
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    !scoresNowBetter &&
    !drainerAttackBetter;
  const blackNoActionWindowedVulnerableManaHead =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber >= 6 &&
    game.monsMovesCount === 0 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    candidate.sameTurnScoreWindowValue > 0 &&
    candidate.sameTurnScoreWindowValue === selected.sameTurnScoreWindowValue &&
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable &&
    !selected.ownDrainerVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    !scoresNowBetter &&
    !drainerAttackBetter;
  const blackLateWindowedVulnerableManaHead =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber >= 8 &&
    game.monsMovesCount >= 1 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    firstInputsEqual(candidate.inputs, selected.inputs) &&
    candidate.sameTurnScoreWindowValue > 0 &&
    selected.sameTurnScoreWindowValue === 0 &&
    candidate.ownDrainerVulnerable &&
    !selected.ownDrainerVulnerable &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    saturatingSubI32(candidate.score, selected.score) <= 32 &&
    !scoresNowBetter &&
    !drainerAttackBetter;
  if (earlySafeManaBlocksSpirit) return false;
  if (blackTurnStartSafeManaBlocksPlainSpirit) return false;
  if (whiteTurnStartSafeManaBlocksPlainSpirit) return false;
  if (whiteLateSafeManaBlocksPlainSpirit) return false;
  if (blackNoActionVulnerableProgressHead) return false;
  if (blackEarlySameWindowManaHead) return false;
  if (blackNoActionWindowedVulnerableManaHead) return false;
  if (blackLateWindowedVulnerableManaHead) return false;

  const pickupUpgrade = hasPickupUpgrade(candidate, selected);
  const blackEarlyProgressBlocksMana =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    (selectedFamily === TurnPlanFamily.ManaTempo ||
      selectedFamily === TurnPlanFamily.SafeSupermanaProgress ||
      selectedFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    !candidate.winsImmediately &&
    !candidate.attacksOpponentDrainer &&
    !candidate.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !pickupUpgrade &&
    scoreGap > 0 &&
    (replyRiskAdvisorPolicy.rootProgressOrSetupBetter(selected, candidate) ||
      (selectedProgress && !candidateProgress));
  const blackEarlyProgressBlocksNonConcreteWindow =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    candidate.sameTurnScoreWindowValue > 0 &&
    selected.sameTurnScoreWindowValue === 0 &&
    !candidate.winsImmediately &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !pickupUpgrade &&
    selected.ownDrainerVulnerable === candidate.ownDrainerVulnerable &&
    selected.ownDrainerWalkVulnerable === candidate.ownDrainerWalkVulnerable &&
    selected.manaHandoffToOpponent === candidate.manaHandoffToOpponent &&
    selected.hasRoundtrip === candidate.hasRoundtrip &&
    replyRiskAdvisorPolicy.rootProgressOrSetupBetter(selected, candidate) &&
    scoreGap >= -192 &&
    !plan.utility.improvesNonScoreOverrideAxes(selectedUtilityValue());
  if (blackEarlyProgressBlocksMana) return false;
  if (blackEarlyProgressBlocksNonConcreteWindow) return false;

  const nearTieProgress =
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.efficiency === selected.efficiency &&
    candidate.supermanaProgress === selected.supermanaProgress &&
    candidate.opponentManaProgress === selected.opponentManaProgress;
  const primaryAxesOrder = compareUtilityPrimaryAxes(
    plan.utility,
    selectedUtilityValue(),
  );
  const strategicAxesBetter = plan.utility.improvesNonScoreOverrideAxes(
    selectedUtilityValue(),
  );
  const selectedUtility = selectedUtilityValue();
  const earlyBlackSafeManaBlocksWeakerMana =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    game.monsMovesCount >= 1 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    plan.headFamily === TurnPlanFamily.ManaTempo &&
    plan.goalFamily === TurnPlanFamily.SpiritImpact &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !candidateUnsafe &&
    !selectedUnsafe &&
    !candidate.spiritDevelopment &&
    !selected.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue === selected.sameTurnScoreWindowValue &&
    !candidateProgress &&
    !selectedProgress &&
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    selected.score > saturatingAddI32(candidate.score, 128) &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  const blackQuietManaBlocksLowerScoredMana =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 6 &&
    game.monsMovesCount >= 1 &&
    game.playerCanMoveMana() &&
    (plan.headFamily === TurnPlanFamily.ManaTempo ||
      plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    candidateUnsafe === selectedUnsafe &&
    !candidate.spiritDevelopment &&
    !selected.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue === 0 &&
    selected.sameTurnScoreWindowValue === 0 &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    selected.score > saturatingAddI32(candidate.score, 48) &&
    selected.safeSupermanaProgressSteps <=
      saturatingAddI32(candidate.safeSupermanaProgressSteps, 1) &&
    selected.safeOpponentManaProgressSteps <=
      saturatingAddI32(candidate.safeOpponentManaProgressSteps, 1) &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  const whiteSameWindowManaBlocksLowerScoredMana =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 5 &&
    game.monsMovesCount === 0 &&
    game.playerCanMoveMana() &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    candidateUnsafe === selectedUnsafe &&
    !candidate.spiritDevelopment &&
    !selected.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue > 0 &&
    candidate.sameTurnScoreWindowValue === selected.sameTurnScoreWindowValue &&
    !candidateProgress &&
    !selectedProgress &&
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    firstInputsEqual(candidate.inputs, selected.inputs) &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    selected.score > candidate.score &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  const whiteMidTurnManaBlocksLowerScoredWindowMana =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 5 &&
    game.monsMovesCount >= 1 &&
    game.playerCanMoveMana() &&
    (plan.headFamily === TurnPlanFamily.ImmediateScore ||
      plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    candidateUnsafe === selectedUnsafe &&
    !candidate.spiritDevelopment &&
    !selected.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue > 0 &&
    candidate.sameTurnScoreWindowValue === selected.sameTurnScoreWindowValue &&
    !candidateProgress &&
    !selectedProgress &&
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    selected.scorePathBestSteps >= candidate.scorePathBestSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    selected.score > candidate.score &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  const whiteMidTurnSpiritSetupBlocksWindowMana =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 5 &&
    game.monsMovesCount >= 1 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.SpiritImpact &&
    candidateUnsafe === selectedUnsafe &&
    !candidate.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    selected.spiritDevelopment &&
    selected.spiritSameTurnScoreSetupNow &&
    selected.spiritOwnManaSetupNow &&
    selected.spiritSetupGain >=
      saturatingAddI32(candidate.spiritSetupGain, 64) &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue > 0 &&
    candidate.sameTurnScoreWindowValue === selected.sameTurnScoreWindowValue &&
    !candidateProgress &&
    !selectedProgress &&
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    selected.scorePathBestSteps > candidate.scorePathBestSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    candidate.score <= saturatingAddI32(selected.score, 64) &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  const whiteTurnStartSpiritSetupBlocksWindowMana =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 5 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    exactContext.delta.sameTurnScoreWindowValue <= 1 &&
    exactContext.delta.opponentWindowDenyGain <= 1 &&
    !exactContext.delta.drainerAttackAvailable &&
    (exactContext.delta.sameTurnScoreWindowValue > 0 ||
      exactContext.delta.opponentWindowDenyGain > 0) &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    isCurrentProNonConcreteManaWindowRoot(candidate) &&
    selectedFamily === TurnPlanFamily.SpiritImpact &&
    candidateUnsafe &&
    !selectedUnsafe &&
    !candidate.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    selected.spiritDevelopment &&
    selected.spiritSameTurnScoreSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    selected.spiritSetupGain >=
      saturatingAddI32(candidate.spiritSetupGain, 96) &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue === selected.sameTurnScoreWindowValue &&
    !candidateProgress &&
    !selectedProgress &&
    candidate.safeSupermanaProgressSteps ===
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps ===
      selected.safeOpponentManaProgressSteps &&
    selected.scorePathBestSteps > candidate.scorePathBestSteps &&
    candidate.ownDrainerVulnerable &&
    !selected.ownDrainerVulnerable &&
    candidate.ownDrainerWalkVulnerable === selected.ownDrainerWalkVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  const whiteSafeManaBlocksDeferredRecoveryProgress =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 5 &&
    game.monsMovesCount >= 1 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.DrainerSafetyRecovery &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !candidateUnsafe &&
    !selectedUnsafe &&
    !candidateProgress &&
    !selectedProgress &&
    !candidate.spiritDevelopment &&
    !selected.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue === 0 &&
    selected.sameTurnScoreWindowValue === 0 &&
    candidate.safeSupermanaProgressSteps <=
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps <=
      selected.safeOpponentManaProgressSteps &&
    candidate.scorePathBestSteps === selected.scorePathBestSteps &&
    candidate.spiritSetupGain <=
      saturatingAddI32(selected.spiritSetupGain, 16) &&
    !candidate.ownDrainerVulnerable &&
    !selected.ownDrainerVulnerable &&
    !candidate.ownDrainerWalkVulnerable &&
    !selected.ownDrainerWalkVulnerable &&
    !candidate.manaHandoffToOpponent &&
    !selected.manaHandoffToOpponent &&
    !candidate.hasRoundtrip &&
    !selected.hasRoundtrip &&
    candidate.rootRank >= saturatingAddI32(selected.rootRank, 8) &&
    saturatingSubI32(candidate.score, selected.score) <= 128 &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade &&
    !plan.headUtility.supportsPrimaryAxesEvalTolerance(selectedUtility, 192);
  const blackLateSafeProgressBlocksQuietMana =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber === 6 &&
    game.monsMovesCount === 0 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    exactContext.delta.sameTurnScoreWindowValue <= 1 &&
    exactContext.delta.opponentWindowDenyGain <= 1 &&
    !exactContext.delta.drainerAttackAvailable &&
    (exactContext.delta.sameTurnScoreWindowValue > 0 ||
      exactContext.delta.opponentWindowDenyGain > 0) &&
    plan.headFamily === TurnPlanFamily.ManaTempo &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    (selectedFamily === TurnPlanFamily.SafeSupermanaProgress ||
      selectedFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    !candidateUnsafe &&
    !candidate.spiritDevelopment &&
    !selected.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue === 0 &&
    selected.sameTurnScoreWindowValue === 0 &&
    !candidateProgress &&
    selectedProgress &&
    selected.safeSupermanaProgressSteps <
      candidate.safeSupermanaProgressSteps &&
    selected.safeOpponentManaProgressSteps <
      candidate.safeOpponentManaProgressSteps &&
    selected.scorePathBestSteps === candidate.scorePathBestSteps &&
    selected.ownDrainerVulnerable &&
    !candidate.ownDrainerVulnerable &&
    selected.ownDrainerWalkVulnerable === candidate.ownDrainerWalkVulnerable &&
    selected.manaHandoffToOpponent === candidate.manaHandoffToOpponent &&
    selected.hasRoundtrip === candidate.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  const blackRecoveryRootBlocksNonConcreteWindow =
    macroMode &&
    game.activeColor === Color.Black &&
    game.turnNumber === 4 &&
    game.monsMovesCount >= 1 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    exactContext.delta.sameTurnScoreWindowValue <= 1 &&
    exactContext.delta.opponentWindowDenyGain <= 1 &&
    !exactContext.delta.drainerAttackAvailable &&
    exactContext.delta.drainerSafety < 0 &&
    (exactContext.delta.sameTurnScoreWindowValue > 0 ||
      exactContext.delta.opponentWindowDenyGain > 0) &&
    plan.headFamily === TurnPlanFamily.ImmediateScore &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    isCurrentProNonConcreteManaWindowRoot(candidate) &&
    selectedFamily === TurnPlanFamily.DrainerSafetyRecovery &&
    selected.classes.drainerSafetyRecover &&
    !selectedUnsafe &&
    !selected.ownDrainerVulnerable &&
    !selected.ownDrainerWalkVulnerable &&
    !rootHasConcreteScoreSurface(selected) &&
    !selected.attacksOpponentDrainer &&
    !selectedSpiritPhase &&
    selected.sameTurnScoreWindowValue === 0 &&
    !selected.manaHandoffToOpponent &&
    !selected.hasRoundtrip &&
    firstInputsEqual(candidate.inputs, selected.inputs) &&
    candidate.ownDrainerVulnerable &&
    !candidate.classes.drainerSafetyRecover &&
    selected.safeSupermanaProgressSteps <=
      candidate.safeSupermanaProgressSteps &&
    selected.safeOpponentManaProgressSteps <=
      candidate.safeOpponentManaProgressSteps &&
    selected.scorePathBestSteps > candidate.scorePathBestSteps &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !pickupUpgrade;
  const whiteRecoveryRootBlocksNonConcreteWindow =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount === 0 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    isCurrentProNonConcreteManaWindowRoot(candidate) &&
    selectedFamily === TurnPlanFamily.DrainerSafetyRecovery &&
    selected.classes.drainerSafetyRecover &&
    !selectedUnsafe &&
    !selected.ownDrainerVulnerable &&
    !selected.ownDrainerWalkVulnerable &&
    !rootHasConcreteScoreSurface(selected) &&
    !selected.attacksOpponentDrainer &&
    !selectedSpiritPhase &&
    selected.sameTurnScoreWindowValue === 0 &&
    !selected.manaHandoffToOpponent &&
    !selected.hasRoundtrip &&
    firstInputsEqual(candidate.inputs, selected.inputs) &&
    candidate.ownDrainerVulnerable &&
    !candidate.classes.drainerSafetyRecover &&
    selected.safeSupermanaProgressSteps <=
      candidate.safeSupermanaProgressSteps &&
    selected.safeOpponentManaProgressSteps <=
      candidate.safeOpponentManaProgressSteps &&
    selected.scorePathBestSteps > candidate.scorePathBestSteps &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !pickupUpgrade;
  const vulnerableWhiteManaHead =
    macroMode &&
    game.activeColor === Color.White &&
    game.turnNumber === 3 &&
    game.monsMovesCount >= 1 &&
    game.playerCanMoveMana() &&
    (plan.headFamily === TurnPlanFamily.ManaTempo ||
      plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.DrainerSafetyRecovery &&
    candidateFamily === TurnPlanFamily.ManaTempo &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    candidateUnsafe &&
    !selectedUnsafe &&
    !candidate.spiritDevelopment &&
    !selected.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !rootHasConcreteScoreSurface(candidate) &&
    !rootHasConcreteScoreSurface(selected) &&
    candidate.sameTurnScoreWindowValue === 0 &&
    selected.sameTurnScoreWindowValue === 0 &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade;
  if (earlyBlackSafeManaBlocksWeakerMana) return false;
  if (blackQuietManaBlocksLowerScoredMana) return false;
  if (whiteSameWindowManaBlocksLowerScoredMana) return false;
  if (whiteMidTurnManaBlocksLowerScoredWindowMana) return false;
  if (whiteMidTurnSpiritSetupBlocksWindowMana) return false;
  if (whiteTurnStartSpiritSetupBlocksWindowMana) return false;
  if (whiteSafeManaBlocksDeferredRecoveryProgress) return false;
  if (vulnerableWhiteManaHead) return false;
  if (blackLateSafeProgressBlocksQuietMana) return false;
  if (blackRecoveryRootBlocksNonConcreteWindow) return false;
  if (whiteRecoveryRootBlocksNonConcreteWindow) return false;

  const projectedSafe =
    macroMode &&
    projectedPlanIsSafelyCompleted(game, perspective, config, plan);
  const projectedReplyNotWorse =
    compareUtilityPrimaryAxes(plan.utility, selectedUtility) >= 0;
  const projectedHeadNotWorse =
    compareUtilityPrimaryAxes(plan.headUtility, selectedUtility) >= 0;
  const narrowWhiteManaOnlyProgressTie =
    macroMode &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    game.activeColor === Color.White &&
    game.turnNumber >= 5 &&
    game.monsMovesCount <= 1 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    !candidateUnsafe &&
    !selectedUnsafe &&
    candidateProgress &&
    selectedProgress &&
    !selectedSpiritPhase &&
    nearTieProgress &&
    scoreGap > 48 &&
    primaryAxesOrder === 0 &&
    !pickupUpgrade &&
    !strategicAxesBetter;
  const projectedProgressRegressesSafePickup =
    !selectedUnsafe &&
    (selected.safeSupermanaPickupNow || selected.safeOpponentManaPickupNow) &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    !pickupUpgrade &&
    !projectedHeadNotWorse;
  const projectedDeferredRecoveryWithoutConcreteGain =
    selectedUnsafe &&
    candidateUnsafe &&
    !selectedSpiritPhase &&
    !selectedProgress &&
    candidateProgress &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.DrainerSafetyRecovery &&
    !candidate.classes.drainerSafetyRecover &&
    candidate.ownDrainerVulnerable &&
    !pickupUpgrade &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    scoreGap > 48;
  const safeRootBlocksPlainSpirit =
    game.activeColor === Color.Black &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !selectedUnsafe &&
    !candidateUnsafe &&
    !selectedProgress &&
    !selectedSpiritPhase &&
    !candidateProgress &&
    !candidateSpiritTactical &&
    !candidate.spiritOwnManaSetupNow &&
    scoreGap > 96 &&
    !strategicAxesBetter;
  const safeRootBlocksPlainSpiritProgress =
    game.activeColor === Color.Black &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !selectedUnsafe &&
    !candidateUnsafe &&
    !selectedProgress &&
    !selectedSpiritPhase &&
    isPlainSpiritDevelopmentRoot(candidate) &&
    candidateProgress &&
    !candidateSpiritTactical &&
    !progressBetter &&
    candidate.safeSupermanaProgressSteps >=
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps >=
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    scoreGap > 64 &&
    !strategicAxesBetter;
  const plainSpiritSiblingRegresses =
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !selectedUnsafe &&
    !candidateUnsafe &&
    isPlainSpiritDevelopmentRoot(selected) &&
    isPlainSpiritDevelopmentRoot(candidate) &&
    scoreGap >= 0 &&
    !progressBetter &&
    candidate.spiritSetupGain <= selected.spiritSetupGain &&
    candidate.safeSupermanaProgressSteps >=
      selected.safeSupermanaProgressSteps &&
    candidate.safeOpponentManaProgressSteps >=
      selected.safeOpponentManaProgressSteps &&
    candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
    candidate.manaHandoffToOpponent === selected.manaHandoffToOpponent &&
    candidate.hasRoundtrip === selected.hasRoundtrip &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !candidateSpiritTactical;
  const projectedOverride =
    projectedSafe &&
    !selected.winsImmediately &&
    plan.goalFamily !== TurnPlanFamily.ManaTempo &&
    candidateIndex <= (plan.compiledChunks.length > 1 ? 16 : 10) &&
    projectedReplyNotWorse &&
    (plan.utility.passesOverrideGuard(selectedUtility) ||
      plan.utility.supportsPrimaryAxesEvalTolerance(selectedUtility, 96)) &&
    (candidateUnsafe ||
      plan.compiledChunks.length > 1 ||
      plan.utility.improvesNonScoreOverrideAxes(selectedUtility)) &&
    !safeRootBlocksPlainSpirit &&
    !safeRootBlocksPlainSpiritProgress &&
    !plainSpiritSiblingRegresses &&
    !projectedProgressRegressesSafePickup &&
    !projectedDeferredRecoveryWithoutConcreteGain &&
    !narrowUnsafeBlackManaScore &&
    !narrowWhiteManaOnlyProgressTie;
  if (candidateUnsafe && !selectedUnsafe && !projectedOverride) return false;
  if (
    macroMode &&
    compareUtilityPrimaryAxes(selectedUtility, plan.utility) > 0 &&
    !whiteSpiritSetupGain
  ) {
    return false;
  }
  const allowNonConcreteWhiteProgress =
    macroMode &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    !candidateProgress &&
    currentProIsEarlyWhiteTurnStart(game) &&
    isPlainSpiritDevelopmentRoot(selected) &&
    !selectedUnsafe &&
    (!candidateUnsafe || projectedOverride) &&
    candidateIndex <= 3 &&
    candidate.score >= selected.score &&
    plan.utility.supportsPrimaryAxesEvalTolerance(selectedUtility, 64);
  if (whiteSpiritSetupGain) return true;
  if (
    macroMode &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    !candidateProgress &&
    !projectedOverride &&
    !allowNonConcreteWhiteProgress
  ) {
    return false;
  }
  if (
    macroMode &&
    plan.headFamily === TurnPlanFamily.DrainerKill &&
    !candidate.attacksOpponentDrainer
  ) {
    return false;
  }
  const whiteSetupRecoveryBlocksUtilityOverride =
    macroMode &&
    game.activeColor === Color.White &&
    plan.headFamily === TurnPlanFamily.DrainerSafetyRecovery &&
    selected.spiritOwnManaSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !selectedUnsafe &&
    !candidateUnsafe &&
    selected.sameTurnScoreWindowValue === 0 &&
    candidate.sameTurnScoreWindowValue === 0 &&
    selected.spiritSetupGain >=
      saturatingAddI32(candidate.spiritSetupGain, 48) &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter;
  const whiteVulnerableProgressBlocksImmediateScore =
    macroMode &&
    game.activeColor === Color.White &&
    (plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
      plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress) &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    selectedFamily === TurnPlanFamily.ManaTempo &&
    !selectedProgress &&
    candidateProgress &&
    selected.ownDrainerVulnerable &&
    candidate.ownDrainerVulnerable &&
    selected.ownDrainerWalkVulnerable === candidate.ownDrainerWalkVulnerable &&
    selected.manaHandoffToOpponent === candidate.manaHandoffToOpponent &&
    selected.hasRoundtrip === candidate.hasRoundtrip &&
    !selected.spiritDevelopment &&
    !candidate.spiritDevelopment &&
    !selected.spiritSameTurnScoreSetupNow &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !selected.spiritOwnManaSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    !scoresNowBetter &&
    !drainerAttackBetter &&
    !sameTurnWindowBetter &&
    !pickupUpgrade &&
    !candidate.classes.drainerSafetyRecover &&
    saturatingAddI32(candidate.safeSupermanaProgressSteps, 1) >=
      selected.safeSupermanaProgressSteps &&
    saturatingAddI32(candidate.safeOpponentManaProgressSteps, 1) >=
      selected.safeOpponentManaProgressSteps &&
    candidate.score <= saturatingAddI32(selected.score, 16) &&
    !strategicAxesBetter;
  if (whiteVulnerableProgressBlocksImmediateScore) return false;
  const allowGenericCurrentProOverride =
    plan.headFamily === TurnPlanFamily.ImmediateScore ||
    plan.headFamily === TurnPlanFamily.DenyOpponentWindow ||
    plan.headFamily === TurnPlanFamily.DrainerKill ||
    (plan.headFamily === TurnPlanFamily.DrainerSafetyRecovery &&
      currentProSecondaryAnalysisLive(config));
  if (
    macroMode &&
    !selected.winsImmediately &&
    allowGenericCurrentProOverride &&
    plan.utility.passesOverrideGuard(selectedUtility) &&
    !whiteSetupRecoveryBlocksUtilityOverride &&
    (!candidateUnsafe || selectedUnsafe)
  ) {
    return true;
  }
  if (
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !candidateSpiritTactical &&
    !candidate.spiritDevelopment &&
    !candidate.spiritOwnManaSetupNow &&
    !projectedOverride
  ) {
    return false;
  }
  if (projectedOverride) return true;

  switch (modeFromConfig(config)) {
    case TurnEngineMode.ProV1:
      switch (plan.headFamily) {
        case TurnPlanFamily.ImmediateScore:
          return (
            (candidate.winsImmediately ||
              scoresNowBetter ||
              sameTurnWindowBetter) &&
            scoreGap <= 280
          );
        case TurnPlanFamily.DenyOpponentWindow:
          return (
            sameTurnWindowBetter || safetyRecoverBetter || drainerAttackBetter
          );
        case TurnPlanFamily.DrainerKill:
          return drainerAttackBetter && scoreGap <= 180;
        case TurnPlanFamily.DrainerSafetyRecovery:
          return (
            safetyRecoverBetter &&
            compareTurnEngineUtilities(plan.utility, selectedUtility) >= 0 &&
            scoreGap <= 140
          );
        case TurnPlanFamily.SpiritImpact:
          return (
            candidateIndex <= (plan.compiledChunks.length > 1 ? 12 : 6) &&
            scoreGap <= 120 &&
            (spiritWindowBetter ||
              spiritDevelopmentBetter ||
              (selectedSpiritPhase &&
                compareTurnEngineUtilities(plan.utility, selectedUtility) >= 0))
          );
        case TurnPlanFamily.SafeSupermanaProgress:
        case TurnPlanFamily.SafeOpponentManaProgress:
          return (
            !selectedSpiritPhase &&
            candidateIndex <= (plan.compiledChunks.length > 1 ? 3 : 1) &&
            scoreGap <= 80 &&
            (progressBetter ||
              compareTurnEngineUtilities(plan.utility, selectedUtility) >= 0 ||
              (candidate.safeSupermanaProgressSteps ===
                selected.safeSupermanaProgressSteps &&
                candidate.safeOpponentManaProgressSteps ===
                  selected.safeOpponentManaProgressSteps &&
                candidate.ownDrainerVulnerable ===
                  selected.ownDrainerVulnerable &&
                candidate.efficiency === selected.efficiency &&
                candidate.supermanaProgress === selected.supermanaProgress &&
                candidate.opponentManaProgress ===
                  selected.opponentManaProgress &&
                scoreGap <= 32))
          );
        case TurnPlanFamily.ManaTempo:
          return false;
        default:
          return false;
      }
    case TurnEngineMode.CurrentPro:
      switch (plan.headFamily) {
        case TurnPlanFamily.ImmediateScore:
          return (
            (candidate.winsImmediately ||
              scoresNowBetter ||
              sameTurnWindowBetter ||
              (candidateIndex <= 16 &&
                plan.utility.passesOverrideGuard(selectedUtility) &&
                (!candidateUnsafe || selectedUnsafe))) &&
            scoreGap <= 360
          );
        case TurnPlanFamily.DenyOpponentWindow:
          return (
            sameTurnWindowBetter ||
            safetyRecoverBetter ||
            drainerAttackBetter ||
            (candidateIndex <= 16 &&
              scoreGap <= 220 &&
              !candidateUnsafe &&
              plan.utility.passesOverrideGuard(selectedUtility))
          );
        case TurnPlanFamily.DrainerKill:
          return (
            candidate.attacksOpponentDrainer &&
            candidateIndex <= 16 &&
            scoreGap <= 260 &&
            (drainerAttackBetter ||
              compareTurnEngineUtilities(plan.utility, selectedUtility) >= 0)
          );
        case TurnPlanFamily.DrainerSafetyRecovery:
          return (
            candidate.classes.drainerSafetyRecover &&
            candidateIndex <= 16 &&
            scoreGap <= 240 &&
            (safetyRecoverBetter ||
              (selected.ownDrainerVulnerable &&
                !candidate.ownDrainerVulnerable) ||
              (currentProSecondaryAnalysisLive(config) &&
                plan.utility.supportsFamilyFallback(selectedUtility) &&
                (selectedUnsafe || !candidateUnsafe) &&
                !whiteSetupRecoveryBlocksUtilityOverride))
          );
        case TurnPlanFamily.SpiritImpact: {
          const engineNotWorse =
            plan.utility.supportsFamilyFallback(selectedUtility);
          const engineBetter =
            plan.utility.passesOverrideGuard(selectedUtility);
          if (
            safeRootBlocksPlainSpirit ||
            safeRootBlocksPlainSpiritProgress ||
            plainSpiritSiblingRegresses
          ) {
            return false;
          }
          const selectedConcreteSpiritSetup =
            selected.spiritSameTurnScoreSetupNow ||
            selected.spiritOwnManaSetupNow ||
            selected.sameTurnScoreWindowValue > 0;
          if (
            selectedConcreteSpiritSetup &&
            !blackSpiritPair &&
            !selectedUnsafe &&
            !candidateUnsafe &&
            !candidate.spiritSameTurnScoreSetupNow &&
            !candidate.spiritOwnManaSetupNow &&
            candidate.sameTurnScoreWindowValue <=
              selected.sameTurnScoreWindowValue &&
            candidate.spiritSetupGain <= selected.spiritSetupGain &&
            !scoresNowBetter &&
            !drainerAttackBetter
          ) {
            return false;
          }
          const spiritHeadOverride =
            blackTurnSixRouteChangePlainSpirit ||
            (scoreGap <= 220 &&
              (spiritWindowBetter ||
                spiritDevelopmentBetter ||
                (candidate.spiritOwnManaSetupNow &&
                  !selected.spiritOwnManaSetupNow &&
                  engineNotWorse) ||
                engineBetter ||
                (selectedSpiritPhase && engineNotWorse)));
          return (
            candidateIndex <= (plan.compiledChunks.length > 1 ? 16 : 10) &&
            spiritHeadOverride
          );
        }
        case TurnPlanFamily.SafeSupermanaProgress:
        case TurnPlanFamily.SafeOpponentManaProgress: {
          const primaryAxes = compareUtilityPrimaryAxes(
            plan.utility,
            selectedUtility,
          );
          const engineNotWorse =
            (candidateProgress || selectedUnsafe) &&
            plan.utility.supportsFamilyFallback(selectedUtility);
          const selectedSafeNonProgress =
            !selectedUnsafe && !selectedSpiritPhase && !selectedProgress;
          const selectedSafeProgress = !selectedUnsafe && selectedProgress;
          const selectedProgressFamily =
            selectedFamily === TurnPlanFamily.SafeSupermanaProgress ||
            selectedFamily === TurnPlanFamily.SafeOpponentManaProgress;
          const unsafeProgressHasMaterialOverride =
            strategicAxesBetter ||
            plan.utility.hasScoreDeltaForce(selectedUtility, 220);
          if (
            selectedUnsafe &&
            candidateUnsafe &&
            !selectedSpiritPhase &&
            !selectedProgress &&
            candidateProgress &&
            scoreGap > 0 &&
            !pickupUpgrade &&
            !safetyRecoverBetter &&
            !scoresNowBetter &&
            !drainerAttackBetter &&
            !sameTurnWindowBetter &&
            !unsafeProgressHasMaterialOverride
          ) {
            return false;
          }
          if (projectedDeferredRecoveryWithoutConcreteGain) return false;
          const whitePlainSpiritProgress =
            allowNonConcreteWhiteProgress ||
            (currentProIsEarlyWhiteTurnStart(game) &&
              isPlainSpiritDevelopmentRoot(selected) &&
              !selectedUnsafe &&
              !candidateUnsafe &&
              candidateProgress &&
              candidateIndex <= 2 &&
              scoreGap <= 96 &&
              (primaryAxes > 0 ||
                (primaryAxes >= 0 &&
                  plan.utility.supportsPrimaryAxesEvalTolerance(
                    selectedUtility,
                    64,
                  ))));
          const allowSoftProgress =
            !selectedSpiritPhase || selectedUnsafe || whitePlainSpiritProgress;
          const largeSafeLead =
            scoreGap > 48 && !selectedUnsafe && !candidateUnsafe;
          const searchLeadGuard =
            (!selectedSafeProgress && !selectedSafeNonProgress) ||
            !largeSafeLead ||
            strategicAxesBetter ||
            pickupUpgrade;
          const safeFallback =
            !candidateUnsafe &&
            engineNotWorse &&
            (selectedUnsafe || (!selectedSpiritPhase && !selectedProgress)) &&
            (!selectedSafeNonProgress ||
              scoreGap <= 32 ||
              strategicAxesBetter ||
              pickupUpgrade);
          const engineBetter =
            engineNotWorse &&
            plan.utility.strictlyDominatesOverrideAxes(selectedUtility) &&
            (!selectedSafeNonProgress || strategicAxesBetter);
          const nearTie =
            candidate.safeSupermanaProgressSteps ===
              selected.safeSupermanaProgressSteps &&
            candidate.safeOpponentManaProgressSteps ===
              selected.safeOpponentManaProgressSteps &&
            candidate.ownDrainerVulnerable === selected.ownDrainerVulnerable &&
            candidate.efficiency === selected.efficiency &&
            candidate.supermanaProgress === selected.supermanaProgress &&
            candidate.opponentManaProgress === selected.opponentManaProgress;
          return (
            candidateIndex <= (plan.compiledChunks.length > 1 ? 12 : 6) &&
            scoreGap <= 220 &&
            ((allowSoftProgress && progressBetter && searchLeadGuard) ||
              whitePlainSpiritProgress ||
              pickupUpgrade ||
              (engineBetter &&
                (!largeSafeLead ||
                  strategicAxesBetter ||
                  hasPickupUpgrade(candidate, selected)) &&
                (!selectedSafeProgress ||
                  strategicAxesBetter ||
                  hasPickupUpgrade(candidate, selected) ||
                  (progressBetter && !selectedSpiritPhase))) ||
              safeFallback ||
              (allowSoftProgress &&
                nearTie &&
                scoreGap <= (selectedProgressFamily ? 32 : 64) &&
                searchLeadGuard))
          );
        }
        case TurnPlanFamily.ManaTempo:
          return false;
      }
  }
}

function searchRootOptions(
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  priorityInputs: readonly (readonly Input[])[],
): SearchRootOptions {
  const options: SearchRootOptions =
    priorityInputs.length === 0 ? {} : { priorityInputs };
  if (!currentProTurnEngineLive(config)) return options;
  const spiritConfig = turnEngineRerankConfig(config);
  const recoveryConfig = turnEngineConfigFromSearchConfig(config);
  return {
    ...options,
    qualifiesPlainSpiritPlan: (candidate: RootCandidate): boolean => {
      const plan = turnEngineCandidatePlan(
        candidate.game,
        perspective,
        spiritConfig,
      );
      return (
        plan?.headFamily === TurnPlanFamily.SpiritImpact &&
        plan.utility.hasNonnegativeDenyGain()
      );
    },
    qualifiesDrainerSafetyRecoveryPlan: (candidate: RootCandidate): boolean =>
      turnEngineCandidatePlan(candidate.game, perspective, recoveryConfig)
        ?.headFamily === TurnPlanFamily.DrainerSafetyRecovery,
  };
}

function cloneFlatRootEvaluation(root: FlatRootEvaluation): FlatRootEvaluation {
  return {
    ...root,
    inputs: cloneInputs(root.inputs),
    game: root.game.cloneForSimulation(),
    classes: { ...root.classes },
  };
}

/**
 * Runtime fallback observation seam. This intentionally repeats the shipping
 * advisor-before-focus order instead of exposing bare search results.
 */
export function focusedScoredRootsForRuntime(
  game: MonsGame,
  executionConfig: AutomoveSearchExecutionConfig,
  useTranspositionTable = true,
): FlatRootEvaluation[] {
  const sourceFen = game.fen();
  const config: AutomoveSearchExecutionConfig = {
    ...executionConfig,
    useTranspositionTable,
  };
  const perspective = game.activeColor;
  const roots = rankRootCandidates(game, perspective, config);
  if (cancelled() || roots.length === 0) return [];
  const enginePlan = config.enableTurnEngineSelector
    ? turnEngineCandidatePlan(
        game,
        perspective,
        turnEngineConfigForGame(game, config),
      )
    : undefined;
  const advisor = shippingRootAdvisorPresearch(
    game,
    perspective,
    config,
    roots,
    enginePlan,
  );
  const priority =
    advisor === undefined ? [] : currentProRootAdvisorPriorityInputs(advisor);
  const searched = searchRootCandidates(
    game,
    perspective,
    config,
    roots,
    searchRootOptions(perspective, config, priority),
  );
  if (game.fen() !== sourceFen) {
    throw new Error("runtime root focus mutated its source game");
  }
  return flattenRootEvaluations(searched.evaluations).map(
    cloneFlatRootEvaluation,
  );
}

/**
 * Exact runtime rank seam for the legacy negative-deny fallback. It performs
 * ranking, turn-engine/advisor injection, and the normal scout allocator, then
 * stops before the scored-root loop.
 */
export function focusedCandidateRankForRuntimeInputs(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
  inputs: readonly Input[],
): number | undefined {
  const sourceFen = game.fen();
  const perspective = game.activeColor;
  const roots = rankRootCandidates(game, perspective, config);
  const enginePlan = config.enableTurnEngineSelector
    ? turnEngineCandidatePlan(
        game,
        perspective,
        turnEngineConfigForGame(game, config),
      )
    : undefined;
  const advisor = shippingRootAdvisorPresearch(
    game,
    perspective,
    config,
    roots,
    enginePlan,
  );
  const priority =
    advisor === undefined ? [] : currentProRootAdvisorPriorityInputs(advisor);
  const focused = focusRootCandidatesForSearch(
    game,
    perspective,
    config,
    roots,
    searchRootOptions(perspective, config, priority),
    true,
  );
  if (game.fen() !== sourceFen) {
    throw new Error("runtime root-rank focus mutated its source game");
  }
  const rank = focused.candidates.findIndex((candidate) =>
    inputChainsEqual(candidate.inputs, inputs),
  );
  return rank < 0 ? undefined : rank;
}

export function rootSelectorOptions(
  config: AutomoveSearchExecutionConfig,
): RootSelectorOptions {
  const replyConfig = replyRiskConfigForSearch(config);
  return {
    checkpoint,
    cancelled,
    rootReplyRiskSnapshot: (state, perspective, _config, replyLimit) =>
      rootReplyRiskSnapshot(state, perspective, replyConfig, replyLimit),
    pickReplyRiskGuardedIndex: (context) =>
      pickRootWithReplyRiskGuard(
        context.game,
        context.roots,
        context.candidateIndices,
        context.perspective,
        replyConfig,
      ),
    currentPro: currentProRootPolicyCallbacks(config),
  };
}

function searchAndSelectRoot(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  roots: readonly RootCandidate[],
  priorityInputs: readonly (readonly Input[])[],
): { inputs: Input[]; evaluations: FlatRootEvaluation[] } {
  const result = searchRootCandidates(
    game,
    perspective,
    config,
    roots,
    searchRootOptions(perspective, config, priorityInputs),
  );
  if (cancelled()) return { inputs: [], evaluations: [] };
  const evaluations = flattenRootEvaluations(result.evaluations);
  if (evaluations.length === 0) return { inputs: [], evaluations };
  return {
    inputs: pickBaselineRootInputs(
      game,
      evaluations,
      perspective,
      config,
      rootSelectorOptions(config),
    ),
    evaluations,
  };
}

function tryTurnHeadRerank(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  roots: readonly ScoredRootMove[],
  existingPlan: TurnPlan | undefined,
): TurnPlan | undefined {
  if (
    roots.length <= 1 ||
    !config.enableTurnHeadRerank ||
    !shouldInvokeTurnHeadRerank(roots)
  ) {
    return undefined;
  }
  const allowed = roots.map((root) => root.inputs);
  const existingHead = existingPlan?.compiledChunks[0];
  if (
    existingPlan !== undefined &&
    existingHead !== undefined &&
    allowed.some((inputs) => inputChainsEqual(inputs, existingHead))
  ) {
    return existingPlan;
  }
  return turnEngineCandidatePlanFromAllowedHeads(
    game,
    perspective,
    turnEngineRerankConfig(config),
    allowed,
  );
}

function acceptedRerankInputs(
  game: MonsGame,
  perspective: Color,
  config: AutomoveSearchExecutionConfig,
  roots: readonly ScoredRootMove[],
  plan: TurnPlan | undefined,
  advisorPlan: TurnPlan | undefined,
): Input[] | undefined {
  const inputs = plan?.compiledChunks[0];
  if (
    inputs === undefined ||
    !classifyTurnEngineRerankOverride(roots, inputs) ||
    !allowedRerankOverrideCandidate(roots, inputs) ||
    advisorConflictsWithChoice(
      game,
      perspective,
      config,
      roots,
      advisorPlan,
      inputs,
    )
  ) {
    return undefined;
  }
  return cloneInputs(inputs);
}

function smartSearchBestInputsInternal(
  game: MonsGame,
  initialConfig: AutomoveSearchExecutionConfig,
  useTranspositionTable: boolean,
): Input[] {
  if (checkpoint()) return [];
  clearSearchCaches();
  clearReplyRiskCache();
  let config: AutomoveSearchExecutionConfig = {
    ...initialConfig,
    useTranspositionTable,
  };
  const perspective = game.activeColor;
  const liveEngineConfig = turnEngineConfigForGame(game, config);
  let precheckedCached: Input[] | undefined;
  if (currentProLowBudgetGuardLive(config)) {
    precheckedCached = turnEngineCachedStep(game, liveEngineConfig);
    if (
      precheckedCached === undefined &&
      shouldSkipCurrentProLowBudgetState(game)
    ) {
      config = { ...config, enableTurnEngineSelector: false };
    }
  }
  if (
    currentProMidTurnTacticalGuardLive(config) &&
    shouldDisableCurrentProMidTurnTacticalEngine(game)
  ) {
    precheckedCached = undefined;
    config = { ...config, enableTurnEngineSelector: false };
  }
  if (
    currentProLowBudgetGuardLive(config) &&
    currentProIsSafeEarlyBlackOpeningState(game)
  ) {
    config = {
      ...config,
      enableTurnEngineSecondaryAnalysis: false,
      enableTurnEngineSelectedFollowupProjection: false,
    };
  }
  config = applyCurrentProLowBudgetSearchClamp(game, config);
  if (
    !config.enableTurnEngineSelector &&
    config.turnEngineMode === AUTOMOVE_TURN_ENGINE_MODE.CurrentPro &&
    currentProIsWhiteTurnOneManaOnlyFollowup(game)
  ) {
    return smartSearchBestInputsInternal(
      game,
      { ...config, turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.ProV1 },
      useTranspositionTable,
    );
  }

  const roots = rankRootCandidates(game, perspective, config);
  if (cancelled() || roots.length === 0) return [];
  if (config.enableTurnEngineSelector) {
    const mode = modeFromConfig(config);
    const cachedCandidate =
      precheckedCached ?? turnEngineCachedStep(game, liveEngineConfig);
    const cached =
      cachedCandidate !== undefined &&
      acceptTurnEngineCachedStep(roots, cachedCandidate, mode)
        ? cachedCandidate
        : undefined;
    const engineConfig = turnEngineConfigForGame(game, config);
    const skipHead = shouldSkipCurrentProHeadPlanForRootContext(
      game,
      roots,
      config,
    );
    const headPlan = skipHead
      ? undefined
      : currentProUseFreshLiveHeadPlan(game, config)
        ? turnEngineCandidatePlanLive(game, perspective, engineConfig)
        : turnEngineCandidatePlan(game, perspective, engineConfig);
    if (checkpoint()) return [];

    if (mode === TurnEngineMode.CurrentPro && cached !== undefined) {
      if (shouldResumeTurnEngineCachedStep(roots, cached, mode)) {
        return cloneInputs(cached);
      }
      if (
        headPlan?.compiledChunks[0] !== undefined &&
        inputChainsEqual(headPlan.compiledChunks[0], cached)
      ) {
        commitPlanAndSeedFollowup(
          game,
          perspective,
          config,
          mode,
          headPlan,
          engineConfig,
        );
        return cloneInputs(cached);
      }
    }

    const rerankPlan = tryTurnHeadRerank(
      game,
      perspective,
      config,
      roots,
      headPlan,
    );
    const rerankInputs = acceptedRerankInputs(
      game,
      perspective,
      config,
      roots,
      rerankPlan,
      headPlan,
    );
    if (rerankInputs !== undefined && rerankPlan !== undefined) {
      commitPlanAndSeedFollowup(
        game,
        perspective,
        config,
        mode,
        rerankPlan,
        engineConfig,
      );
      return rerankInputs;
    }

    const forced = forcedTacticalPrepassChoice(
      game,
      perspective,
      roots,
      config,
    );
    if (forced !== undefined) {
      if (
        headPlan?.compiledChunks[0] !== undefined &&
        inputChainsEqual(headPlan.compiledChunks[0], forced)
      ) {
        commitPlanAndSeedFollowup(
          game,
          perspective,
          config,
          mode,
          headPlan,
          engineConfig,
        );
      }
      return forced;
    }
    if (headPlan !== undefined) {
      const lowBudget = forcedLowBudgetTurnEnginePrepassChoice(
        game,
        roots,
        headPlan,
        config,
      );
      if (lowBudget !== undefined) {
        commitPlanAndSeedFollowup(
          game,
          perspective,
          config,
          mode,
          headPlan,
          engineConfig,
        );
        return lowBudget;
      }
    }

    const advisor = shippingRootAdvisorPresearch(
      game,
      perspective,
      config,
      roots,
      headPlan,
    );
    const priority =
      advisor === undefined ? [] : currentProRootAdvisorPriorityInputs(advisor);
    const searched = searchAndSelectRoot(
      game,
      perspective,
      config,
      roots,
      priority,
    );
    if (searched.inputs.length === 0) return [];
    let selected = searched.inputs;
    if (
      headPlan !== undefined &&
      acceptTurnEngineHeadAfterSearch(
        game,
        perspective,
        config,
        searched.evaluations,
        selected,
        headPlan,
      )
    ) {
      selected = cloneInputs(headPlan.compiledChunks[0] ?? selected);
    }
    if (cached !== undefined && inputChainsEqual(cached, selected)) {
      return cloneInputs(selected);
    }
    if (
      headPlan?.compiledChunks[0] !== undefined &&
      inputChainsEqual(headPlan.compiledChunks[0], selected)
    ) {
      commitPlanAndSeedFollowup(
        game,
        perspective,
        config,
        mode,
        headPlan,
        engineConfig,
      );
    }
    return cloneInputs(selected);
  }

  if (
    roots.length > 1 &&
    config.enableTurnHeadRerank &&
    shouldInvokeTurnHeadRerank(roots)
  ) {
    const allowed = roots.map((root) => root.inputs);
    const inputs = turnEngineNextInputsFromAllowedHeads(
      game,
      perspective,
      modeFromConfig(config),
      turnEngineRerankConfig(config),
      allowed,
    );
    if (
      inputs !== undefined &&
      classifyTurnEngineRerankOverride(roots, inputs) &&
      allowedRerankOverrideCandidate(roots, inputs) &&
      !advisorConflictsWithChoice(
        game,
        perspective,
        config,
        roots,
        undefined,
        inputs,
      )
    ) {
      return cloneInputs(inputs);
    }
  }
  const forced = forcedTacticalPrepassChoice(game, perspective, roots, config);
  if (forced !== undefined) return forced;
  const advisor = shippingRootAdvisorPresearch(
    game,
    perspective,
    config,
    roots,
    undefined,
  );
  const priority =
    advisor === undefined ? [] : currentProRootAdvisorPriorityInputs(advisor);
  return searchAndSelectRoot(game, perspective, config, roots, priority).inputs;
}

/** Clear selector-owned state without altering a game or its public wrappers. */
export function clearShippingSelectorCaches(): void {
  clearExactStateAnalysisCache();
  clearSearchCaches();
  clearReplyRiskCache();
  clearTurnEnginePlanCache();
}

/** Shipping Rust-compatible deterministic smart-search selector. */
export function smartSearchBestInputs(
  game: MonsGame,
  executionConfig: AutomoveSearchExecutionConfig,
  useTranspositionTable = true,
): Input[] {
  const sourceFen = game.fen();
  const result = smartSearchBestInputsInternal(
    game,
    executionConfig,
    useTranspositionTable,
  );
  if (game.fen() !== sourceFen) {
    throw new Error("smart search mutated its source game");
  }
  return cloneInputs(result);
}
