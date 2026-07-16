import {
  Color,
  cloneInputs,
  inputChainsEqual,
  inputEquals,
  type Event,
  type Input,
} from "../engine/domain.js";
import { MonsGame } from "../engine/game.js";
import {
  I32_MIN,
  addI32,
  saturatingAddI32,
  saturatingSubI32,
} from "../engine/numerics.js";
import { checkpoint } from "./deadline.js";
import { exactOpportunityContext } from "./exact.js";
import { hasRoundtripMonMove, manaHandoffPenalty } from "./move-efficiency.js";
import {
  canTurnEngineProjectReplyRiskRoot as canProjectRoot,
  replyRiskAdvisorPolicy,
  replyRiskGuardShortlistIndices,
  pickRootWithReplyRiskGuard,
  rootReplyRiskSnapshot,
  type ReplyRiskSearchConfig,
} from "./reply-risk.js";
import { isOwnDrainerVulnerable } from "./root-candidates.js";
import {
  compareRankedRootIndices,
  compareTacticalRootCandidates,
} from "./root-focus.js";
import { rootFamily as advisorRootFamily } from "./root-family.js";
import {
  compareRankedRootEvaluationIndices,
  filteredRootCandidateIndices,
  pickBaselineRootIndexFromCandidateIndices,
  type CurrentProCompetitionKind,
  type CurrentProRootPolicyCallbacks,
  type RootSelectionContext,
} from "./root-selector.js";
import {
  AUTOMOVE_TURN_ENGINE_MODE,
  currentProEnabled,
  hasConcreteScoreSurface,
  hasProgressSurface,
  isPlainSpiritDevelopmentRoot,
  rootIsUnsafe as advisorRootIsUnsafe,
  type AutomoveSearchConfig,
  type AutomoveSearchExecutionConfig,
  type MoveClassFlags,
  type RootEvaluation,
  type ScoredRootMove,
} from "./selector-types.js";
import {
  applyInputsForSearchWithEvents,
  compareInputChains,
} from "./transitions.js";
import {
  TurnPlanFamily,
  compareTurnEngineUtilities,
  compareUtilityPrimaryAxes,
  type TurnPlan,
} from "./turn-engine.js";

export enum CurrentProRootAdvisorReasonCode {
  RankedRoot = 0,
  ReplyRiskShortlist = 1,
  PreserveSpiritRepresentative = 2,
  PreserveSafeProgressRepresentative = 3,
  PreserveManaTempoRepresentative = 4,
  OmittedRootReentry = 5,
  AdmitInjectedMacroRoot = 6,
  RejectInjectedMacroRoot = 7,
  ApprovedReplyRiskGuard = 8,
  ApprovedBaselineSelector = 9,
  ApprovedFamilyCompetition = 10,
}

Object.freeze(CurrentProRootAdvisorReasonCode);

export type AdvisorMoveClassFlags = MoveClassFlags;
export type AdvisorRootCandidate = ScoredRootMove;
export type AdvisorRootEvaluation = RootEvaluation;
export type AdvisorSearchConfigSource = AutomoveSearchExecutionConfig;
export type AdvisorSearchConfig = ReplyRiskSearchConfig & {
  readonly advisorRepresentativeHeuristicMargin?: number;
};

export const CURRENT_PRO_ROOT_ADVISOR_DEFAULTS = Object.freeze({
  currentPro: true,
  turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro,
  advisorRepresentativeHeuristicMargin: 520,
});

/** The advisor consumes the exact shipping selector object by reference. */
export function advisorConfigForSearch(
  config: AdvisorSearchConfigSource,
): AdvisorSearchConfigSource {
  return config;
}

export type CurrentProRootAdvisorEntry = {
  readonly inputs: readonly Input[];
  readonly family: TurnPlanFamily;
  readonly rootRank: number;
  readonly reason: CurrentProRootAdvisorReasonCode;
};

export type CurrentProInjectedRootAdvisorDecision = {
  readonly inputs: readonly Input[];
  readonly family: TurnPlanFamily;
  readonly admitted: boolean;
  readonly reason: CurrentProRootAdvisorReasonCode;
};

export type CurrentProRootAdvisorDecision = {
  readonly orderedShortlist: readonly CurrentProRootAdvisorEntry[];
  readonly preservedFamilyRepresentatives: readonly CurrentProRootAdvisorEntry[];
  readonly approvedRoot: CurrentProRootAdvisorEntry | undefined;
  readonly injectedRoot: CurrentProInjectedRootAdvisorDecision | undefined;
};

export type CurrentProAdvisorOptions = {
  /** Builds the exact scored first-chunk root when the turn-engine head was not enumerated. */
  readonly buildInjectedRootCandidate?: (
    game: MonsGame,
    perspective: Color,
    config: AdvisorSearchConfig,
    inputs: readonly Input[],
    plan: TurnPlan,
  ) => AdvisorRootCandidate | undefined;
};

export type CurrentProRootAdvisorPostsearchResult = {
  readonly index: number;
  readonly decision: CurrentProRootAdvisorDecision;
};

export { advisorRootFamily, advisorRootIsUnsafe };

function sameFirstInput(
  left: readonly Input[],
  right: readonly Input[],
): boolean {
  const leftFirst = left[0];
  const rightFirst = right[0];
  return (
    leftFirst !== undefined &&
    rightFirst !== undefined &&
    inputEquals(leftFirst, rightFirst)
  );
}

function sameInputAt(
  left: readonly Input[],
  right: readonly Input[],
  index: number,
): boolean {
  const leftInput = left[index];
  const rightInput = right[index];
  return (
    leftInput !== undefined &&
    rightInput !== undefined &&
    inputEquals(leftInput, rightInput)
  );
}

function advisorRootIsSafe(
  root: AdvisorRootCandidate | AdvisorRootEvaluation,
): boolean {
  return !advisorRootIsUnsafe(root) && !root.hasRoundtrip;
}

function rootMoveAsEvaluation(root: AdvisorRootCandidate): RootEvaluation {
  return root as unknown as RootEvaluation;
}

function rootUtility(
  game: MonsGame,
  root: AdvisorRootCandidate | AdvisorRootEvaluation,
  perspective: Color,
  config: AdvisorSearchConfig,
) {
  return replyRiskAdvisorPolicy.turnEngineRootUtility(
    game,
    root as RootEvaluation,
    perspective,
    config,
    advisorRootFamily(root),
  );
}

function rootMoveUtility(
  game: MonsGame,
  root: AdvisorRootCandidate,
  perspective: Color,
  config: AdvisorSearchConfig,
) {
  return replyRiskAdvisorPolicy.turnEngineRootPlanUtility(
    game,
    rootMoveAsEvaluation(root),
    perspective,
    config,
    advisorRootFamily(root),
  );
}

function utilityCompetes(
  candidate: ReturnType<typeof rootUtility>,
  incumbent: ReturnType<typeof rootUtility>,
): boolean {
  return (
    compareUtilityPrimaryAxes(candidate, incumbent) >= 0 ||
    candidate.supportsFamilyFallback(incumbent)
  );
}

function utilitiesEqual(
  left: ReturnType<typeof rootUtility>,
  right: ReturnType<typeof rootUtility>,
): boolean {
  return (
    left.winState === right.winState &&
    left.avoidImmediateLoss === right.avoidImmediateLoss &&
    left.scoreDelta === right.scoreDelta &&
    left.denyGain === right.denyGain &&
    left.drainerAttack === right.drainerAttack &&
    left.drainerSafety === right.drainerSafety &&
    left.evalScore === right.evalScore
  );
}

function entry(
  root: AdvisorRootCandidate | AdvisorRootEvaluation,
  reason: CurrentProRootAdvisorReasonCode,
): CurrentProRootAdvisorEntry {
  return {
    inputs: cloneInputs(root.inputs),
    family: advisorRootFamily(root),
    rootRank: root.rootRank,
    reason,
  };
}

function pushUnique(
  entries: CurrentProRootAdvisorEntry[],
  value: CurrentProRootAdvisorEntry,
): void {
  if (
    !entries.some((existing) => inputChainsEqual(existing.inputs, value.inputs))
  ) {
    entries.push(value);
  }
}

function compareRankedRootMoveIndices(
  roots: readonly AdvisorRootCandidate[],
  left: number,
  right: number,
): number {
  return compareRankedRootIndices(roots, [left, 0], [right, 0]);
}

function compareRootMoveSearchPriority(
  left: AdvisorRootCandidate,
  right: AdvisorRootCandidate,
): number {
  if (left.heuristic !== right.heuristic) {
    return left.heuristic > right.heuristic ? -1 : 1;
  }
  return (
    compareTacticalRootCandidates(left, right) ||
    compareInputChains(left.inputs, right.inputs)
  );
}

function findRootMoveRepresentative(
  game: MonsGame,
  roots: readonly AdvisorRootCandidate[],
  perspective: Color,
  config: AdvisorSearchConfig,
  predicate: (root: AdvisorRootCandidate) => boolean,
): number | undefined {
  const anchor = roots[0];
  if (anchor === undefined) return undefined;
  if (predicate(anchor) && advisorRootIsSafe(anchor)) return undefined;
  const anchorUtility = rootMoveUtility(game, anchor, perspective, config);
  return roots
    .map((_root, index) => index)
    .filter((index) => {
      const candidate = roots[index];
      return (
        candidate !== undefined &&
        predicate(candidate) &&
        advisorRootIsSafe(candidate) &&
        utilityCompetes(
          rootMoveUtility(game, candidate, perspective, config),
          anchorUtility,
        )
      );
    })
    .sort((left, right) => compareRankedRootMoveIndices(roots, left, right))[0];
}

function sameOpeningSetupRepresentative(
  roots: readonly AdvisorRootCandidate[],
  config: AdvisorSearchConfig,
): number | undefined {
  const anchor = roots[0];
  if (
    anchor === undefined ||
    !currentProEnabled(config) ||
    !isPlainSpiritDevelopmentRoot(rootMoveAsEvaluation(anchor)) ||
    !advisorRootIsSafe(anchor)
  ) {
    return undefined;
  }
  return roots
    .map((_root, index) => index)
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        advisorRootFamily(root) === TurnPlanFamily.SpiritImpact &&
        !isPlainSpiritDevelopmentRoot(rootMoveAsEvaluation(root)) &&
        sameFirstInput(root.inputs, anchor.inputs) &&
        root.efficiency === anchor.efficiency &&
        advisorRootIsSafe(root) &&
        !root.winsImmediately &&
        !root.attacksOpponentDrainer &&
        !root.scoresSupermanaThisTurn &&
        !root.scoresOpponentManaThisTurn &&
        !root.safeSupermanaPickupNow &&
        !root.safeOpponentManaPickupNow &&
        root.sameTurnScoreWindowValue === 0
      );
    })
    .sort((left, right) => compareRankedRootMoveIndices(roots, left, right))[0];
}

function isBlackTurnSixPlainSpiritSetupPair(
  game: MonsGame,
  plain: AdvisorRootCandidate,
  setup: AdvisorRootCandidate,
  config: AdvisorSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    game.activeColor === Color.Black &&
    game.turnNumber === 6 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    advisorRootFamily(plain) === TurnPlanFamily.SpiritImpact &&
    advisorRootFamily(setup) === TurnPlanFamily.SpiritImpact &&
    isPlainSpiritDevelopmentRoot(rootMoveAsEvaluation(plain)) &&
    setup.spiritOwnManaSetupNow &&
    !setup.spiritSameTurnScoreSetupNow &&
    sameFirstInput(plain.inputs, setup.inputs) &&
    plain.ownDrainerVulnerable === setup.ownDrainerVulnerable &&
    plain.ownDrainerWalkVulnerable === setup.ownDrainerWalkVulnerable &&
    !plain.manaHandoffToOpponent &&
    !setup.manaHandoffToOpponent &&
    !plain.hasRoundtrip &&
    !setup.hasRoundtrip &&
    !hasConcreteScoreSurface(plain) &&
    !hasConcreteScoreSurface(setup) &&
    !plain.attacksOpponentDrainer &&
    !setup.attacksOpponentDrainer &&
    plain.sameTurnScoreWindowValue === 0 &&
    setup.sameTurnScoreWindowValue === 0 &&
    !plain.supermanaProgress &&
    !setup.supermanaProgress &&
    !plain.opponentManaProgress &&
    !setup.opponentManaProgress
  );
}

function projectedPlanState(
  game: MonsGame,
  plan: TurnPlan,
): { readonly game: MonsGame; readonly events: readonly Event[] } | undefined {
  let state = game.cloneForSimulation();
  const events: Event[] = [];
  for (const chunk of plan.compiledChunks) {
    const applied = applyInputsForSearchWithEvents(state, chunk);
    if (applied === undefined) return undefined;
    state = applied.game;
    events.push(...applied.events);
  }
  return { game: state, events };
}

function injectedCandidatePassesRootGate(
  game: MonsGame,
  roots: readonly AdvisorRootCandidate[],
  candidate: AdvisorRootCandidate,
  candidateWasEnumerated: boolean,
  perspective: Color,
  config: AdvisorSearchConfig,
  plan: TurnPlan,
): boolean {
  const top = roots[0];
  if (
    top === undefined ||
    (top.winsImmediately && !candidate.winsImmediately)
  ) {
    return false;
  }
  const topUnsafe = advisorRootIsUnsafe(top);
  const candidateUnsafe = advisorRootIsUnsafe(candidate);
  const topUtility = rootMoveUtility(game, top, perspective, config);
  const projected = projectedPlanState(game, plan);
  const projectedFinished =
    projected !== undefined &&
    (projected.game.winnerColor() !== undefined ||
      projected.game.activeColor !== perspective ||
      (!projected.game.playerCanMoveMon() &&
        !projected.game.playerCanUseAction() &&
        !projected.game.playerCanMoveMana()));
  const projectedNearCompletion =
    projected !== undefined &&
    (projectedFinished ||
      plan.compiledChunks.length >= 4 ||
      !projected.game.playerCanMoveMon() ||
      (!projected.game.playerCanUseAction() &&
        !projected.game.playerCanMoveMana()));
  const projectedHandoff =
    projected !== undefined &&
    manaHandoffPenalty(
      projected.events,
      perspective,
      Math.max(config.rootManaHandoffPenalty ?? 1, 1),
    ) > 0;
  const projectedRoundtrip =
    projected !== undefined && hasRoundtripMonMove(projected.events);
  const projectedVulnerable =
    projected !== undefined &&
    projected.game.winnerColor() !== perspective &&
    isOwnDrainerVulnerable(projected.game, perspective);
  let completedPlanOverride =
    projectedNearCompletion &&
    !projectedHandoff &&
    !projectedRoundtrip &&
    !projectedVulnerable &&
    plan.compiledChunks.length > 1 &&
    plan.goalFamily !== TurnPlanFamily.ManaTempo &&
    (compareUtilityPrimaryAxes(plan.utility, topUtility) >= 0 ||
      plan.utility.passesOverrideGuard(topUtility) ||
      plan.utility.supportsPrimaryAxesEvalTolerance(topUtility, 160) ||
      (plan.goalFamily === TurnPlanFamily.ImmediateScore &&
        plan.utility.improvesNonScoreOverrideAxes(topUtility)));
  const progressHead =
    plan.headFamily === TurnPlanFamily.SafeSupermanaProgress ||
    plan.headFamily === TurnPlanFamily.SafeOpponentManaProgress;
  const progressToScore =
    progressHead &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    plan.compiledChunks.length > 1;
  const regressesTopSurface =
    !candidateWasEnumerated &&
    progressToScore &&
    !candidateUnsafe &&
    roots.slice(0, 3).some((root) => {
      const surface =
        root.spiritDevelopment ||
        root.spiritSameTurnScoreSetupNow ||
        root.spiritOwnManaSetupNow ||
        root.safeSupermanaPickupNow ||
        root.safeOpponentManaPickupNow ||
        root.winsImmediately ||
        root.scoresSupermanaThisTurn ||
        root.scoresOpponentManaThisTurn;
      return (
        !advisorRootIsUnsafe(root) &&
        surface &&
        compareUtilityPrimaryAxes(
          plan.headUtility,
          rootMoveUtility(game, root, perspective, config),
        ) < 0
      );
    });
  const blocksConcreteSpirit =
    !candidateWasEnumerated &&
    progressToScore &&
    roots
      .slice(0, 3)
      .some(
        (root) =>
          root.spiritSameTurnScoreSetupNow ||
          root.spiritOwnManaSetupNow ||
          root.sameTurnScoreWindowValue > 0,
      );
  const duplicatesSafeProgress =
    !candidateWasEnumerated &&
    progressToScore &&
    roots
      .slice(0, 3)
      .some((root) => !advisorRootIsUnsafe(root) && hasProgressSurface(root));
  const blocksSafeNonProgressTop =
    !candidateWasEnumerated &&
    progressToScore &&
    !topUnsafe &&
    !hasConcreteScoreSurface(top) &&
    !top.attacksOpponentDrainer &&
    !top.spiritDevelopment &&
    !top.spiritSameTurnScoreSetupNow &&
    !top.spiritOwnManaSetupNow &&
    !hasProgressSurface(top);
  const replacesProgressClusterWithWindow =
    !candidateWasEnumerated &&
    progressToScore &&
    !candidate.winsImmediately &&
    !candidate.attacksOpponentDrainer &&
    !candidate.safeSupermanaPickupNow &&
    !candidate.safeOpponentManaPickupNow &&
    !candidate.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    candidate.sameTurnScoreWindowValue > 0 &&
    !candidate.supermanaProgress &&
    !candidate.opponentManaProgress &&
    roots
      .slice(0, 6)
      .filter(
        (root) =>
          hasProgressSurface(root) &&
          root.sameTurnScoreWindowValue === 0 &&
          !root.spiritSameTurnScoreSetupNow &&
          !root.spiritOwnManaSetupNow,
      ).length >= 3;
  const regressesPlainSpiritCluster =
    candidateWasEnumerated &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    plan.goalFamily === TurnPlanFamily.ImmediateScore &&
    isPlainSpiritDevelopmentRoot(rootMoveAsEvaluation(candidate)) &&
    !candidate.attacksOpponentDrainer &&
    !hasConcreteScoreSurface(candidate) &&
    roots.slice(0, 3).some((root) => {
      if (
        inputChainsEqual(root.inputs, candidate.inputs) ||
        !isPlainSpiritDevelopmentRoot(rootMoveAsEvaluation(root)) ||
        root.attacksOpponentDrainer ||
        hasConcreteScoreSurface(root)
      ) {
        return false;
      }
      return (
        root.spiritSetupGain >= candidate.spiritSetupGain &&
        root.safeSupermanaProgressSteps <=
          candidate.safeSupermanaProgressSteps &&
        root.safeOpponentManaProgressSteps <=
          candidate.safeOpponentManaProgressSteps &&
        compareUtilityPrimaryAxes(
          rootMoveUtility(game, root, perspective, config),
          plan.headUtility,
        ) >= 0
      );
    });
  completedPlanOverride =
    completedPlanOverride &&
    !regressesTopSurface &&
    !blocksConcreteSpirit &&
    !duplicatesSafeProgress &&
    !blocksSafeNonProgressTop;
  const utilityOverride =
    roots.slice(0, 3).every((root) => {
      const utility = rootMoveUtility(game, root, perspective, config);
      return (
        plan.utility.passesOverrideGuard(utility) &&
        (!candidateUnsafe || advisorRootIsUnsafe(root))
      );
    }) || completedPlanOverride;
  const candidateSpiritTactical =
    candidate.spiritSameTurnScoreSetupNow ||
    candidate.sameTurnScoreWindowValue > 0 ||
    candidate.attacksOpponentDrainer ||
    hasConcreteScoreSurface(candidate);
  const allowBlackTurnSixPlainSpirit =
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    roots
      .slice(0, 4)
      .filter((root) =>
        isBlackTurnSixPlainSpiritSetupPair(game, candidate, root, config),
      ).length >= 2;
  if (replacesProgressClusterWithWindow || regressesPlainSpiritCluster) {
    return false;
  }
  if (
    plan.headFamily === TurnPlanFamily.DrainerKill &&
    !candidate.attacksOpponentDrainer
  ) {
    return false;
  }
  if (
    progressHead &&
    !hasProgressSurface(candidate) &&
    !completedPlanOverride
  ) {
    return false;
  }
  if (
    !utilityOverride &&
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !candidateSpiritTactical &&
    !candidate.spiritOwnManaSetupNow &&
    !allowBlackTurnSixPlainSpirit
  ) {
    return false;
  }
  const topSpiritSurface = roots
    .slice(0, 3)
    .some(
      (root) =>
        root.spiritDevelopment ||
        root.spiritSameTurnScoreSetupNow ||
        root.spiritOwnManaSetupNow,
    );
  if (
    plan.headFamily === TurnPlanFamily.SpiritImpact &&
    !topSpiritSurface &&
    !candidateSpiritTactical &&
    !candidate.spiritOwnManaSetupNow &&
    !utilityOverride &&
    !allowBlackTurnSixPlainSpirit
  ) {
    return false;
  }
  return !candidateUnsafe || topUnsafe || utilityOverride;
}

function evaluateInjectedRoot(
  game: MonsGame,
  perspective: Color,
  config: AdvisorSearchConfig,
  roots: AdvisorRootCandidate[],
  plan: TurnPlan,
  options: CurrentProAdvisorOptions,
): CurrentProInjectedRootAdvisorDecision | undefined {
  const firstChunk = plan.compiledChunks[0];
  if (firstChunk === undefined) return undefined;
  const candidateInputs = cloneInputs(firstChunk);
  const existing = roots.find((root) =>
    inputChainsEqual(root.inputs, candidateInputs),
  );
  const candidate =
    existing ??
    options.buildInjectedRootCandidate?.(
      game,
      perspective,
      config,
      candidateInputs,
      plan,
    );
  const rejected = (): CurrentProInjectedRootAdvisorDecision => ({
    inputs: candidateInputs,
    family: plan.headFamily,
    admitted: false,
    reason: CurrentProRootAdvisorReasonCode.RejectInjectedMacroRoot,
  });
  if (
    candidate === undefined ||
    !injectedCandidatePassesRootGate(
      game,
      roots,
      candidate,
      existing !== undefined,
      perspective,
      config,
      plan,
    )
  ) {
    return rejected();
  }
  const simulated = existing === undefined ? [...roots, candidate] : [...roots];
  if (existing === undefined) simulated.sort(compareRootMoveSearchPriority);
  const top = roots[0];
  const candidateIndex = simulated.findIndex((root) =>
    inputChainsEqual(root.inputs, candidateInputs),
  );
  const simulatedCandidate = simulated[candidateIndex];
  if (top === undefined || simulatedCandidate === undefined) return rejected();
  let admitted = inputChainsEqual(simulatedCandidate.inputs, top.inputs);
  if (!admitted) {
    const incumbentUtility = rootMoveUtility(game, top, perspective, config);
    const candidateUtility = rootMoveUtility(
      game,
      simulatedCandidate,
      perspective,
      config,
    );
    const strictPrimaryWin =
      compareUtilityPrimaryAxes(plan.utility, incumbentUtility) > 0 ||
      compareUtilityPrimaryAxes(plan.headUtility, incumbentUtility) > 0 ||
      compareUtilityPrimaryAxes(candidateUtility, incumbentUtility) > 0 ||
      plan.utility.strictlyDominatesOverrideAxes(incumbentUtility) ||
      candidateUtility.strictlyDominatesOverrideAxes(incumbentUtility);
    const resolvesSurface =
      (simulatedCandidate.winsImmediately && !top.winsImmediately) ||
      (simulatedCandidate.attacksOpponentDrainer &&
        !top.attacksOpponentDrainer) ||
      ((simulatedCandidate.scoresSupermanaThisTurn ||
        simulatedCandidate.scoresOpponentManaThisTurn) &&
        !(top.scoresSupermanaThisTurn || top.scoresOpponentManaThisTurn)) ||
      (simulatedCandidate.sameTurnScoreWindowValue >
        top.sameTurnScoreWindowValue &&
        simulatedCandidate.sameTurnScoreWindowValue > 0) ||
      (!advisorRootIsUnsafe(simulatedCandidate) && advisorRootIsUnsafe(top)) ||
      (simulatedCandidate.classes.drainerSafetyRecover &&
        top.ownDrainerVulnerable &&
        !top.classes.drainerSafetyRecover) ||
      (hasProgressSurface(simulatedCandidate) &&
        !hasProgressSurface(top) &&
        !advisorRootIsUnsafe(simulatedCandidate));
    const sameOpeningFollowup =
      plan.headFamily === TurnPlanFamily.SpiritImpact &&
      plan.goalFamily === TurnPlanFamily.SpiritImpact &&
      roots
        .slice(0, 4)
        .filter((root) =>
          isBlackTurnSixPlainSpiritSetupPair(
            game,
            simulatedCandidate,
            root,
            config,
          ),
        ).length >= 2 &&
      compareUtilityPrimaryAxes(candidateUtility, incumbentUtility) >= 0 &&
      saturatingSubI32(top.heuristic, simulatedCandidate.heuristic) <= 8;
    admitted = strictPrimaryWin || resolvesSurface || sameOpeningFollowup;
  }
  if (admitted && existing === undefined) {
    roots.splice(0, roots.length, ...simulated);
  }
  return {
    inputs: candidateInputs,
    family: advisorRootFamily(simulatedCandidate),
    admitted,
    reason: admitted
      ? CurrentProRootAdvisorReasonCode.AdmitInjectedMacroRoot
      : CurrentProRootAdvisorReasonCode.RejectInjectedMacroRoot,
  };
}

export function currentProRootAdvisorPresearch(
  game: MonsGame,
  perspective: Color,
  config: AdvisorSearchConfig,
  roots: AdvisorRootCandidate[],
  engineHeadPlan?: TurnPlan,
  options: CurrentProAdvisorOptions = {},
): CurrentProRootAdvisorDecision | undefined {
  if (!currentProEnabled(config) || roots.length === 0 || checkpoint()) {
    return undefined;
  }
  if (
    game.activeColor === Color.Black &&
    game.turnNumber === 2 &&
    game.monsMovesCount <= 1 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana()
  ) {
    return undefined;
  }
  const orderedShortlist: CurrentProRootAdvisorEntry[] = [];
  const preservedFamilyRepresentatives: CurrentProRootAdvisorEntry[] = [];
  const anchor = roots[0];
  if (anchor === undefined) return undefined;
  pushUnique(
    orderedShortlist,
    entry(anchor, CurrentProRootAdvisorReasonCode.RankedRoot),
  );
  const specs: readonly (readonly [
    CurrentProRootAdvisorReasonCode,
    (root: AdvisorRootCandidate) => boolean,
  ])[] = [
    [
      CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative,
      (root) => root.spiritSameTurnScoreSetupNow || root.spiritOwnManaSetupNow,
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative,
      (root) => isPlainSpiritDevelopmentRoot(rootMoveAsEvaluation(root)),
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveSafeProgressRepresentative,
      (root) =>
        advisorRootFamily(root) === TurnPlanFamily.SafeSupermanaProgress,
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveSafeProgressRepresentative,
      (root) =>
        advisorRootFamily(root) === TurnPlanFamily.SafeOpponentManaProgress,
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveManaTempoRepresentative,
      (root) => advisorRootFamily(root) === TurnPlanFamily.ManaTempo,
    ],
  ];
  for (const [reason, predicate] of specs) {
    if (checkpoint()) return undefined;
    const index = findRootMoveRepresentative(
      game,
      roots,
      perspective,
      config,
      predicate,
    );
    const root = index === undefined ? undefined : roots[index];
    if (root === undefined) continue;
    const representative = entry(root, reason);
    pushUnique(preservedFamilyRepresentatives, representative);
    pushUnique(orderedShortlist, representative);
  }
  const setupIndex = sameOpeningSetupRepresentative(roots, config);
  const setup = setupIndex === undefined ? undefined : roots[setupIndex];
  if (setup !== undefined) {
    const representative = entry(
      setup,
      CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative,
    );
    pushUnique(preservedFamilyRepresentatives, representative);
    pushUnique(orderedShortlist, representative);
  }
  const injectedRoot =
    engineHeadPlan === undefined
      ? undefined
      : evaluateInjectedRoot(
          game,
          perspective,
          config,
          roots,
          engineHeadPlan,
          options,
        );
  if (injectedRoot?.admitted) {
    const injected = roots.find((root) =>
      inputChainsEqual(root.inputs, injectedRoot.inputs),
    );
    if (injected !== undefined) {
      pushUnique(
        orderedShortlist,
        entry(injected, CurrentProRootAdvisorReasonCode.AdmitInjectedMacroRoot),
      );
    }
  }
  return checkpoint()
    ? undefined
    : {
        orderedShortlist,
        preservedFamilyRepresentatives,
        approvedRoot: undefined,
        injectedRoot,
      };
}

export function currentProRootAdvisorPriorityInputs(
  decision: CurrentProRootAdvisorDecision,
): Input[][] {
  const result: Input[][] = [];
  if (decision.injectedRoot?.admitted) {
    result.push(cloneInputs(decision.injectedRoot.inputs));
  }
  for (const representative of decision.preservedFamilyRepresentatives) {
    if (
      !result.some((inputs) => inputChainsEqual(inputs, representative.inputs))
    ) {
      result.push(cloneInputs(representative.inputs));
    }
  }
  return result;
}

function selectorTurnEngineModeView(
  config: AutomoveSearchConfig,
  turnEngineMode: AutomoveSearchConfig["turnEngineMode"],
): AutomoveSearchConfig {
  const view = Object.create(config) as AutomoveSearchConfig;
  Object.defineProperty(view, "turnEngineMode", { value: turnEngineMode });
  return view;
}

function selectorConfigView(
  config: AutomoveSearchConfig,
  turnEngineMode: AutomoveSearchConfig["turnEngineMode"],
): AutomoveSearchConfig {
  const view = selectorTurnEngineModeView(config, turnEngineMode);
  Object.defineProperties(view, {
    enableRootReplyRiskGuard: { value: false },
  });
  return view;
}

function findScoredRepresentative(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  orderedShortlist: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
  predicate: (root: RootEvaluation) => boolean,
): number | undefined {
  const anchorIndex = orderedShortlist[0];
  if (anchorIndex === undefined) return undefined;
  if (
    orderedShortlist.some((index) => {
      const root = roots[index];
      return root !== undefined && predicate(root) && advisorRootIsSafe(root);
    })
  ) {
    return undefined;
  }
  const anchor = roots[anchorIndex];
  if (anchor === undefined) return undefined;
  const anchorUtility = rootUtility(game, anchor, perspective, config);
  return roots
    .map((_root, index) => index)
    .filter((index) => {
      const candidate = roots[index];
      return (
        candidate !== undefined &&
        predicate(candidate) &&
        advisorRootIsSafe(candidate) &&
        utilityCompetes(
          rootUtility(game, candidate, perspective, config),
          anchorUtility,
        )
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(roots, left, right),
    )[0];
}

function whiteFollowupRepresentative(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  shortlist: readonly number[],
  config: AutomoveSearchConfig,
): number | undefined {
  if (shortlist.length === 0) return undefined;
  return roots
    .map((_root, index) => index)
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        !shortlist.includes(index) &&
        root.spiritOwnManaSetupNow &&
        root.opponentManaProgress &&
        !isPlainSpiritDevelopmentRoot(root) &&
        advisorRootIsSafe(root) &&
        shortlist.some((shortlistIndex) =>
          replyRiskAdvisorPolicy.whiteSpiritFollowupSetupCompetition(
            game,
            roots,
            [index, shortlistIndex],
            config,
          ),
        )
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(roots, left, right),
    )[0];
}

function plainSpiritClusterProgressReentry(
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    !config.enableTurnEngineSelector ||
    !config.enableTurnEngineSecondaryAnalysis ||
    candidateIndices.length < 2 ||
    !candidateIndices.every((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        isPlainSpiritDevelopmentRoot(root) &&
        advisorRootIsSafe(root)
      );
    })
  ) {
    return undefined;
  }
  const candidateRoots = candidateIndices
    .map((index) => roots[index])
    .filter((root): root is RootEvaluation => root !== undefined);
  const bestScore = Math.max(...candidateRoots.map((root) => root.score));
  const bestRank = Math.min(...candidateRoots.map((root) => root.rootRank));
  const followups = new Map<number, number>();
  const followup = (index: number): number => {
    const cached = followups.get(index);
    if (cached !== undefined) return cached;
    const root = roots[index];
    const value =
      root === undefined
        ? I32_MIN
        : replyRiskAdvisorPolicy.spiritFollowupFloorScore(
            root.game,
            perspective,
            config,
          );
    followups.set(index, value);
    return value;
  };
  const bestFollowup = Math.max(...candidateIndices.map(followup));
  const omitted = roots
    .map((_root, index) => index)
    .filter((index) => !candidateIndices.includes(index));
  const followupReentry = omitted
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        advisorRootIsSafe(root) &&
        !root.ownDrainerVulnerable &&
        !root.ownDrainerWalkVulnerable &&
        !root.spiritDevelopment &&
        !root.spiritSameTurnScoreSetupNow &&
        !root.spiritOwnManaSetupNow &&
        saturatingAddI32(root.score, 32) >= bestScore &&
        followup(index) >= saturatingAddI32(bestFollowup, 32)
      );
    })
    .sort((left, right) => {
      const followupOrder = followup(right) - followup(left);
      return (
        followupOrder || compareRankedRootEvaluationIndices(roots, left, right)
      );
    })[0];
  if (followupReentry !== undefined) return followupReentry;
  return omitted
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        advisorRootIsSafe(root) &&
        !root.ownDrainerVulnerable &&
        !root.ownDrainerWalkVulnerable &&
        !root.spiritDevelopment &&
        !root.spiritSameTurnScoreSetupNow &&
        !root.spiritOwnManaSetupNow &&
        hasProgressSurface(root) &&
        root.interviewSoftPriority > 0 &&
        root.score >= bestScore &&
        root.rootRank + 2 <= bestRank
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(roots, left, right),
    )[0];
}

function riskyRecoveryReentry(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (!currentProEnabled(config) || !config.enableTurnEngineSelector) {
    return undefined;
  }
  const anchorIndex = candidateIndices.find((index) => {
    const root = roots[index];
    return (
      root !== undefined &&
      advisorRootIsSafe(root) &&
      hasProgressSurface(root) &&
      root.interviewSoftPriority > 0
    );
  });
  const anchor = anchorIndex === undefined ? undefined : roots[anchorIndex];
  if (anchor === undefined) return undefined;
  let bestIndex: number | undefined;
  let bestUtility: ReturnType<typeof rootUtility> | undefined;
  roots.forEach((root, index) => {
    if (
      candidateIndices.includes(index) ||
      !advisorRootIsUnsafe(root) ||
      root.ownDrainerWalkVulnerable ||
      root.manaHandoffToOpponent ||
      root.hasRoundtrip ||
      !replyRiskAdvisorPolicy.sameNonTacticalProgressLane(root, anchor) ||
      addI32(root.score, 32) < anchor.score ||
      root.game.activeColor !== perspective ||
      root.game.winnerColor() !== undefined
    ) {
      return;
    }
    const utility = rootUtility(game, root, perspective, config);
    if (!utility.supportsTemporaryRiskRecovery()) return;
    if (
      bestUtility === undefined ||
      compareUtilityPrimaryAxes(utility, bestUtility) > 0 ||
      (utilitiesEqual(utility, bestUtility) &&
        bestIndex !== undefined &&
        compareRankedRootEvaluationIndices(roots, index, bestIndex) < 0)
    ) {
      bestIndex = index;
      bestUtility = utility;
    }
  });
  return bestIndex;
}

function blackTurnSixSpiritReentry(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  shortlist: readonly number[],
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 6 ||
    !game.playerCanMoveMana() ||
    shortlist.length === 0 ||
    !shortlist.every((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        advisorRootFamily(root) === TurnPlanFamily.ManaTempo &&
        advisorRootIsUnsafe(root) &&
        !root.winsImmediately &&
        !root.attacksOpponentDrainer &&
        !hasConcreteScoreSurface(root) &&
        root.sameTurnScoreWindowValue === 0 &&
        !root.manaHandoffToOpponent &&
        !root.hasRoundtrip
      );
    })
  ) {
    return undefined;
  }
  const bestRank = Math.min(
    ...shortlist.map(
      (index) => roots[index]?.rootRank ?? Number.MAX_SAFE_INTEGER,
    ),
  );
  const bestScore = Math.max(
    ...shortlist.map((index) => roots[index]?.score ?? I32_MIN),
  );
  return roots
    .map((_root, index) => index)
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        !shortlist.includes(index) &&
        advisorRootFamily(root) === TurnPlanFamily.SpiritImpact &&
        isPlainSpiritDevelopmentRoot(root) &&
        !hasConcreteScoreSurface(root) &&
        !root.attacksOpponentDrainer &&
        root.sameTurnScoreWindowValue === 0 &&
        !root.manaHandoffToOpponent &&
        !root.hasRoundtrip &&
        root.rootRank + 4 <= bestRank &&
        saturatingSubI32(bestScore, root.score) <= 1_024
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(roots, left, right),
    )[0];
}

function safeProgressSiblingReentry(
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  shortlist: readonly number[],
  config: AutomoveSearchConfig,
): number | undefined {
  if (!currentProEnabled(config)) return undefined;
  const anchorIndex = shortlist[0];
  const anchor = anchorIndex === undefined ? undefined : roots[anchorIndex];
  if (
    anchor === undefined ||
    !advisorRootIsUnsafe(anchor) ||
    !hasProgressSurface(anchor)
  ) {
    return undefined;
  }
  return candidateIndices
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        !shortlist.includes(index) &&
        advisorRootIsSafe(root) &&
        replyRiskAdvisorPolicy.sameNonTacticalProgressLane(root, anchor) &&
        saturatingSubI32(anchor.score, root.score) <= 320
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(roots, left, right),
    )[0];
}

function blackNoActionSafeProgressReentry(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  shortlist: readonly number[],
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 6 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    shortlist.length === 0
  ) {
    return undefined;
  }
  const delta = exactOpportunityContext(game, game.activeColor).delta;
  if (
    delta.sameTurnScoreWindowValue > 1 ||
    delta.opponentWindowDenyGain > 1 ||
    (delta.sameTurnScoreWindowValue === 0 &&
      delta.opponentWindowDenyGain === 0) ||
    shortlist.some((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        (advisorRootFamily(root) === TurnPlanFamily.SafeSupermanaProgress ||
          advisorRootFamily(root) ===
            TurnPlanFamily.SafeOpponentManaProgress) &&
        advisorRootIsSafe(root)
      );
    })
  ) {
    return undefined;
  }
  return roots
    .map((_root, index) => index)
    .filter((index) => {
      const root = roots[index];
      const family = root === undefined ? undefined : advisorRootFamily(root);
      return (
        root !== undefined &&
        !shortlist.includes(index) &&
        (family === TurnPlanFamily.SafeSupermanaProgress ||
          family === TurnPlanFamily.SafeOpponentManaProgress) &&
        !root.manaHandoffToOpponent &&
        !root.hasRoundtrip &&
        !root.winsImmediately &&
        !root.attacksOpponentDrainer &&
        !hasConcreteScoreSurface(root) &&
        root.sameTurnScoreWindowValue === 0 &&
        root.score >= 0
      );
    })
    .sort((left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot?.score !== rightRoot?.score) {
        return (rightRoot?.score ?? I32_MIN) - (leftRoot?.score ?? I32_MIN);
      }
      return compareRankedRootEvaluationIndices(roots, left, right);
    })[0];
}

function blackNoActionManaSiblingReentry(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  shortlist: readonly number[],
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 6 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana()
  ) {
    return undefined;
  }
  const anchorIndex = [...shortlist]
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        advisorRootFamily(root) === TurnPlanFamily.ManaTempo &&
        advisorRootIsSafe(root) &&
        !root.winsImmediately &&
        !root.attacksOpponentDrainer &&
        !hasConcreteScoreSurface(root)
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(roots, left, right),
    )[0];
  const anchor = anchorIndex === undefined ? undefined : roots[anchorIndex];
  if (anchor === undefined) return undefined;
  const sameWindowLane =
    anchor.sameTurnScoreWindowValue > 0 &&
    !anchor.ownDrainerVulnerable &&
    !anchor.ownDrainerWalkVulnerable;
  if (anchor.rootRank < 6 && !sameWindowLane) return undefined;
  return roots
    .map((_root, index) => index)
    .filter((index) => {
      const root = roots[index];
      if (
        root === undefined ||
        shortlist.includes(index) ||
        advisorRootFamily(root) !== TurnPlanFamily.ManaTempo ||
        root.manaHandoffToOpponent ||
        root.hasRoundtrip ||
        root.winsImmediately ||
        root.attacksOpponentDrainer ||
        hasConcreteScoreSurface(root) ||
        !(
          root.rootRank + 4 <= anchor.rootRank ||
          (sameWindowLane && root.rootRank < anchor.rootRank)
        ) ||
        root.sameTurnScoreWindowValue > anchor.sameTurnScoreWindowValue
      ) {
        return false;
      }
      if (anchor.score >= 0) return root.score >= 0;
      if (
        sameWindowLane &&
        root.sameTurnScoreWindowValue === anchor.sameTurnScoreWindowValue &&
        root.safeSupermanaProgressSteps === anchor.safeSupermanaProgressSteps &&
        root.safeOpponentManaProgressSteps ===
          anchor.safeOpponentManaProgressSteps &&
        root.ownDrainerVulnerable === anchor.ownDrainerVulnerable &&
        root.ownDrainerWalkVulnerable === anchor.ownDrainerWalkVulnerable
      ) {
        return true;
      }
      return saturatingSubI32(anchor.score, root.score) <= 192;
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(roots, left, right),
    )[0];
}

function collectAdvisorReentries(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  shortlist: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
): number[] {
  const result: number[] = [];
  const add = (index: number | undefined): void => {
    if (index !== undefined && !result.includes(index)) result.push(index);
  };
  add(
    plainSpiritClusterProgressReentry(
      roots,
      candidateIndices,
      perspective,
      config,
    ),
  );
  add(riskyRecoveryReentry(game, roots, candidateIndices, perspective, config));
  add(blackTurnSixSpiritReentry(game, roots, shortlist, config));
  add(safeProgressSiblingReentry(roots, candidateIndices, shortlist, config));
  add(blackNoActionSafeProgressReentry(game, roots, shortlist, config));
  add(blackNoActionManaSiblingReentry(game, roots, shortlist, config));
  add(
    replyRiskAdvisorPolicy.currentProWhiteTurnFourManaSiblingReentry(
      game,
      roots,
      shortlist,
      perspective,
      config,
    ),
  );
  return result;
}

function spiritSetupCompetes(
  game: MonsGame,
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
  perspective: Color,
  config: AutomoveSearchConfig,
): boolean {
  if (
    incumbent.spiritDevelopment ||
    !(candidate.spiritOwnManaSetupNow || candidate.spiritSameTurnScoreSetupNow)
  ) {
    return true;
  }
  if (
    candidate.sameTurnScoreWindowValue > incumbent.sameTurnScoreWindowValue ||
    candidate.score >= incumbent.score
  ) {
    return true;
  }
  if (
    game.activeColor === Color.Black &&
    game.turnNumber <= 2 &&
    candidate.spiritOwnManaSetupNow &&
    !candidate.spiritSameTurnScoreSetupNow &&
    advisorRootFamily(incumbent) === TurnPlanFamily.ManaTempo &&
    !hasConcreteScoreSurface(candidate) &&
    !hasConcreteScoreSurface(incumbent) &&
    !candidate.attacksOpponentDrainer &&
    !incumbent.attacksOpponentDrainer &&
    advisorRootIsSafe(candidate) &&
    advisorRootIsSafe(incumbent) &&
    saturatingAddI32(candidate.score, 64) >= incumbent.score &&
    candidate.spiritSetupGain >=
      saturatingAddI32(incumbent.spiritSetupGain, 48) &&
    candidate.rootRank <= incumbent.rootRank
  ) {
    return true;
  }
  return (
    compareUtilityPrimaryAxes(
      rootUtility(game, candidate, perspective, config),
      rootUtility(game, incumbent, perspective, config),
    ) >= 0
  );
}

function spiritSetupCompetesWithRoot(
  context: RootSelectionContext,
  candidateIndex: number,
  incumbentIndex: number,
): boolean {
  const candidate = context.roots[candidateIndex];
  const incumbent = context.roots[incumbentIndex];
  return (
    candidate !== undefined &&
    incumbent !== undefined &&
    spiritSetupCompetes(
      context.game,
      candidate,
      incumbent,
      context.perspective,
      context.config,
    )
  );
}

function riskyScoreCompetition(context: RootSelectionContext): boolean {
  const spiritScores = context.candidateIndices
    .map((index) => context.roots[index])
    .filter(
      (root): root is RootEvaluation =>
        root !== undefined &&
        (root.spiritDevelopment ||
          root.spiritSameTurnScoreSetupNow ||
          root.spiritOwnManaSetupNow),
    )
    .map((root) => root.score);
  if (spiritScores.length === 0) return false;
  const bestSpiritScore = Math.max(...spiritScores);
  return context.candidateIndices.some((index) => {
    const root = context.roots[index];
    return (
      root !== undefined &&
      !root.spiritDevelopment &&
      !root.spiritSameTurnScoreSetupNow &&
      !root.spiritOwnManaSetupNow &&
      root.ownDrainerVulnerable &&
      !root.ownDrainerWalkVulnerable &&
      !root.manaHandoffToOpponent &&
      !root.hasRoundtrip &&
      (hasConcreteScoreSurface(root) ||
        root.attacksOpponentDrainer ||
        root.sameTurnScoreWindowValue > 0) &&
      root.score >= bestSpiritScore
    );
  });
}

function currentProSecondaryAnalysisLive(
  config: AutomoveSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    config.enableTurnEngineSelector &&
    config.enableTurnEngineSecondaryAnalysis
  );
}

function canChallengeSpiritPreferenceRoot(
  root: RootEvaluation,
  perspective: Color,
): boolean {
  return (
    canProjectRoot(root, perspective) &&
    !isPlainSpiritDevelopmentRoot(root) &&
    !root.spiritSameTurnScoreSetupNow &&
    !root.spiritOwnManaSetupNow &&
    !advisorRootIsUnsafe(root) &&
    !root.hasRoundtrip
  );
}

function canChallengeSpiritPreferenceRootWithRecovery(
  root: RootEvaluation,
  perspective: Color,
): boolean {
  return (
    canProjectRoot(root, perspective) &&
    !isPlainSpiritDevelopmentRoot(root) &&
    !root.spiritSameTurnScoreSetupNow &&
    !root.spiritOwnManaSetupNow &&
    !root.manaHandoffToOpponent &&
    !root.hasRoundtrip
  );
}

function projectedRiskyRecoveryUtility(
  game: MonsGame,
  root: RootEvaluation,
  perspective: Color,
  config: AutomoveSearchConfig,
): ReturnType<typeof rootUtility> | undefined {
  if (
    !config.enableTurnEngineSelector ||
    !currentProEnabled(config) ||
    !root.ownDrainerVulnerable ||
    !canChallengeSpiritPreferenceRootWithRecovery(root, perspective)
  ) {
    return undefined;
  }
  const utility = rootUtility(game, root, perspective, config);
  return utility.supportsTemporaryRiskRecovery() ? utility : undefined;
}

function projectedRecoveryUtilityCompetes(
  candidate: ReturnType<typeof rootUtility>,
  incumbent: ReturnType<typeof rootUtility>,
): boolean {
  return (
    candidate.supportsTemporaryRiskRecovery() &&
    compareUtilityPrimaryAxes(candidate, incumbent) >= 0 &&
    candidate.supportsFamilyFallback(incumbent)
  );
}

function safeProgressCompetition(context: RootSelectionContext): boolean {
  if (!currentProEnabled(context.config)) return false;
  const spiritEfficiencies = context.candidateIndices
    .map((index) => context.roots[index])
    .filter(
      (root): root is RootEvaluation =>
        root !== undefined &&
        root.spiritDevelopment &&
        !root.manaHandoffToOpponent,
    )
    .map((root) => root.efficiency);
  if (spiritEfficiencies.length === 0) return false;
  const bestSpiritEfficiency = Math.max(...spiritEfficiencies);
  return context.candidateIndices.some((index) => {
    const root = context.roots[index];
    return (
      root !== undefined &&
      !root.ownDrainerVulnerable &&
      !root.manaHandoffToOpponent &&
      !root.hasRoundtrip &&
      (root.supermanaProgress || root.opponentManaProgress) &&
      root.interviewSoftPriority > 0 &&
      root.efficiency >= bestSpiritEfficiency
    );
  });
}

function followupProgressCompetition(context: RootSelectionContext): boolean {
  if (
    !currentProSecondaryAnalysisLive(context.config) ||
    context.candidateIndices.length < 2
  ) {
    return false;
  }
  const spiritIndices = context.candidateIndices
    .filter((index) => {
      const root = context.roots[index];
      return (
        root !== undefined &&
        isPlainSpiritDevelopmentRoot(root) &&
        !advisorRootIsUnsafe(root) &&
        !root.manaHandoffToOpponent &&
        !root.hasRoundtrip
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(context.roots, left, right),
    )
    .slice(0, 3);
  if (spiritIndices.length === 0) return false;
  const bestSpiritRank = Math.min(
    ...spiritIndices.map(
      (index) => context.roots[index]?.rootRank ?? Number.MAX_SAFE_INTEGER,
    ),
  );
  const bestSpiritScore = Math.max(
    ...spiritIndices.map((index) => context.roots[index]?.score ?? I32_MIN),
  );
  const followups = new Map<number, number>();
  const followup = (index: number): number => {
    const cached = followups.get(index);
    if (cached !== undefined) return cached;
    const root = context.roots[index];
    const value =
      root === undefined
        ? I32_MIN
        : replyRiskAdvisorPolicy.spiritFollowupFloorScore(
            root.game,
            context.perspective,
            context.config,
          );
    followups.set(index, value);
    return value;
  };
  const bestSpiritFollowup = Math.max(...spiritIndices.map(followup));
  return context.candidateIndices.some((index) => {
    if (spiritIndices.includes(index)) return false;
    const root = context.roots[index];
    return (
      root !== undefined &&
      !advisorRootIsUnsafe(root) &&
      !root.spiritDevelopment &&
      !root.spiritSameTurnScoreSetupNow &&
      !root.spiritOwnManaSetupNow &&
      !root.ownDrainerVulnerable &&
      !root.manaHandoffToOpponent &&
      !root.hasRoundtrip &&
      root.rootRank <= bestSpiritRank + 2 &&
      saturatingAddI32(root.score, 32) >= bestSpiritScore &&
      root.interviewSoftPriority > 0 &&
      followup(index) >= saturatingAddI32(bestSpiritFollowup, 32)
    );
  });
}

function hasNonSpiritScoreCompetitionSurface(root: RootEvaluation): boolean {
  return (
    root.winsImmediately ||
    root.attacksOpponentDrainer ||
    root.scoresSupermanaThisTurn ||
    root.scoresOpponentManaThisTurn ||
    root.safeSupermanaPickupNow ||
    root.safeOpponentManaPickupNow ||
    root.sameTurnScoreWindowValue > 0
  );
}

function spiritScoreChallengeOrder(
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
): number | undefined {
  const candidatePlain = isPlainSpiritDevelopmentRoot(candidate);
  const incumbentPlain = isPlainSpiritDevelopmentRoot(incumbent);
  if (candidatePlain === incumbentPlain) return undefined;
  const challenger = candidatePlain ? incumbent : candidate;
  const spirit = candidatePlain ? candidate : incumbent;
  if (
    advisorRootIsUnsafe(challenger) ||
    challenger.hasRoundtrip ||
    challenger.score < saturatingAddI32(spirit.score, 40) ||
    challenger.sameTurnScoreWindowValue < spirit.sameTurnScoreWindowValue
  ) {
    return undefined;
  }
  return candidatePlain ? -1 : 1;
}

function scoreCompetition(context: RootSelectionContext): boolean {
  if (!currentProEnabled(context.config)) return false;
  const spiritIndices = context.candidateIndices
    .filter((index) => {
      const root = context.roots[index];
      return root !== undefined && isPlainSpiritDevelopmentRoot(root);
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(context.roots, left, right),
    )
    .slice(0, 3);
  if (spiritIndices.length === 0) return false;
  return context.candidateIndices.some((index) => {
    if (spiritIndices.includes(index)) return false;
    const root = context.roots[index];
    return (
      root !== undefined &&
      hasNonSpiritScoreCompetitionSurface(root) &&
      spiritIndices.every((spiritIndex) => {
        const spirit = context.roots[spiritIndex];
        return (
          spirit !== undefined &&
          (spiritScoreChallengeOrder(root, spirit) ?? 0) > 0
        );
      })
    );
  });
}

type SpiritProjectionMap = ReturnType<
  typeof replyRiskAdvisorPolicy.buildSpiritRootProjections
>;

function projectedSpiritIndices(
  context: RootSelectionContext,
  projections: SpiritProjectionMap,
): number[] {
  return context.candidateIndices
    .filter((index) => {
      const root = context.roots[index];
      return (
        root !== undefined &&
        isPlainSpiritDevelopmentRoot(root) &&
        projections.has(index)
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(context.roots, left, right),
    );
}

function projectionCompetition(
  context: RootSelectionContext,
  projections: SpiritProjectionMap,
): boolean {
  if (
    !context.config.enableTurnEngineSelector ||
    !currentProEnabled(context.config) ||
    projections.size < 2
  ) {
    return false;
  }
  const bestSpiritIndex = projectedSpiritIndices(context, projections)[0];
  const bestSpirit =
    bestSpiritIndex === undefined ? undefined : context.roots[bestSpiritIndex];
  const bestProjection =
    bestSpiritIndex === undefined
      ? undefined
      : projections.get(bestSpiritIndex);
  if (
    bestSpiritIndex === undefined ||
    bestSpirit === undefined ||
    bestProjection === undefined
  ) {
    return false;
  }
  return context.candidateIndices.some((index) => {
    if (index === bestSpiritIndex) return false;
    const root = context.roots[index];
    const projection = projections.get(index);
    if (root === undefined || projection === undefined) return false;
    const safeChallenger = canChallengeSpiritPreferenceRoot(
      root,
      context.perspective,
    );
    const riskyRecoveryChallenger =
      canChallengeSpiritPreferenceRootWithRecovery(root, context.perspective) &&
      projection.plan.headFamily === TurnPlanFamily.DrainerSafetyRecovery;
    return (
      (safeChallenger || riskyRecoveryChallenger) &&
      Math.abs(root.score - bestSpirit.score) <= 320 &&
      (replyRiskAdvisorPolicy.spiritProjectionChallengeOrder(
        root,
        projection,
        bestSpirit,
        bestProjection,
      ) ?? 0) > 0
    );
  });
}

function negativeDenyCompetition(
  context: RootSelectionContext,
  projections: SpiritProjectionMap,
): boolean {
  if (
    !context.config.enableTurnEngineSelector ||
    !currentProEnabled(context.config)
  ) {
    return false;
  }
  const spiritIndices = projectedSpiritIndices(context, projections).slice(
    0,
    3,
  );
  if (
    spiritIndices.length === 0 ||
    spiritIndices.some(
      (index) =>
        projections.get(index)?.plan.utility.hasNonnegativeDenyGain() === true,
    )
  ) {
    return false;
  }
  const bestSpiritScore = Math.max(
    ...spiritIndices.map((index) => context.roots[index]?.score ?? I32_MIN),
  );
  return context.candidateIndices.some((index) => {
    if (spiritIndices.includes(index)) return false;
    const root = context.roots[index];
    return (
      root !== undefined &&
      !root.spiritDevelopment &&
      !root.spiritSameTurnScoreSetupNow &&
      !root.spiritOwnManaSetupNow &&
      !root.ownDrainerVulnerable &&
      !root.manaHandoffToOpponent &&
      !root.hasRoundtrip &&
      root.score >= bestSpiritScore
    );
  });
}

function riskyRecoveryCompetition(context: RootSelectionContext): boolean {
  if (
    !context.config.enableTurnEngineSelector ||
    !currentProEnabled(context.config)
  ) {
    return false;
  }
  const spiritIndices = context.candidateIndices
    .filter((index) => {
      const root = context.roots[index];
      return (
        root !== undefined &&
        (root.spiritDevelopment ||
          root.spiritSameTurnScoreSetupNow ||
          root.spiritOwnManaSetupNow)
      );
    })
    .sort((left, right) =>
      compareRankedRootEvaluationIndices(context.roots, left, right),
    )
    .slice(0, 3);
  if (spiritIndices.length === 0) return false;
  const bestSpiritScore = Math.max(
    ...spiritIndices.map((index) => context.roots[index]?.score ?? I32_MIN),
  );
  const spiritUtilities = spiritIndices
    .map((index) => context.roots[index])
    .filter((root): root is RootEvaluation => root !== undefined)
    .map((root) =>
      rootUtility(context.game, root, context.perspective, context.config),
    );
  if (spiritUtilities.length === 0) return false;
  return context.candidateIndices.some((index) => {
    const root = context.roots[index];
    if (
      root === undefined ||
      root.spiritDevelopment ||
      root.spiritSameTurnScoreSetupNow ||
      root.spiritOwnManaSetupNow ||
      !root.ownDrainerVulnerable ||
      root.manaHandoffToOpponent ||
      root.hasRoundtrip ||
      root.score < bestSpiritScore
    ) {
      return false;
    }
    const utility = projectedRiskyRecoveryUtility(
      context.game,
      root,
      context.perspective,
      context.config,
    );
    return (
      utility !== undefined &&
      spiritUtilities.every((spiritUtility) =>
        projectedRecoveryUtilityCompetes(utility, spiritUtility),
      )
    );
  });
}

function safeProgressReentryAfterSafetyPrefilter(
  context: RootSelectionContext,
  keptIndices: readonly number[],
): number | undefined {
  if (
    !currentProSecondaryAnalysisLive(context.config) ||
    keptIndices.length === 0 ||
    !keptIndices.every((index) => {
      const root = context.roots[index];
      return (
        root !== undefined &&
        isPlainSpiritDevelopmentRoot(root) &&
        !advisorRootIsUnsafe(root) &&
        !root.manaHandoffToOpponent &&
        !root.hasRoundtrip
      );
    })
  ) {
    return undefined;
  }
  const bestKeptRank = Math.min(
    ...keptIndices.map(
      (index) => context.roots[index]?.rootRank ?? Number.MAX_SAFE_INTEGER,
    ),
  );
  const bestKeptScore = Math.max(
    ...keptIndices.map((index) => context.roots[index]?.score ?? I32_MIN),
  );
  const followups = new Map<number, number>();
  const followup = (index: number): number => {
    const cached = followups.get(index);
    if (cached !== undefined) return cached;
    const root = context.roots[index];
    const value =
      root === undefined
        ? I32_MIN
        : replyRiskAdvisorPolicy.spiritFollowupFloorScore(
            root.game,
            context.perspective,
            context.config,
          );
    followups.set(index, value);
    return value;
  };
  const bestKeptFollowup = Math.max(...keptIndices.map(followup));
  return context.candidateIndices
    .filter((index) => !keptIndices.includes(index))
    .filter((index) => {
      const root = context.roots[index];
      return (
        root !== undefined &&
        !advisorRootIsUnsafe(root) &&
        !root.ownDrainerVulnerable &&
        !root.ownDrainerWalkVulnerable &&
        !root.manaHandoffToOpponent &&
        !root.hasRoundtrip &&
        !root.spiritDevelopment &&
        !root.spiritSameTurnScoreSetupNow &&
        !root.spiritOwnManaSetupNow &&
        root.interviewSoftPriority > 0 &&
        root.rootRank <= bestKeptRank + 2 &&
        saturatingAddI32(root.score, 32) >= bestKeptScore &&
        followup(index) >= saturatingAddI32(bestKeptFollowup, 32)
      );
    })
    .sort((left, right) => {
      const leftFollowup = followup(left);
      const rightFollowup = followup(right);
      if (leftFollowup !== rightFollowup) {
        return leftFollowup > rightFollowup ? -1 : 1;
      }
      return compareRankedRootEvaluationIndices(context.roots, left, right);
    })[0];
}

function buildRootPolicyCallbacks(
  config: AutomoveSearchConfig,
  includeRootPicker: boolean,
): CurrentProRootPolicyCallbacks {
  const projectionCache = new Map<string, SpiritProjectionMap>();
  const followupScores = new Map<number, number>();
  const projections = (context: RootSelectionContext) => {
    const key = `${context.perspective}:${context.candidateIndices.join(",")}`;
    const cached = projectionCache.get(key);
    if (cached !== undefined) return cached;
    const built = replyRiskAdvisorPolicy.buildSpiritRootProjections(
      context.roots,
      context.candidateIndices,
      context.perspective,
      context.config,
    );
    projectionCache.set(key, built);
    return built;
  };
  const competition = (
    kind: CurrentProCompetitionKind,
    context: RootSelectionContext,
  ): boolean => {
    switch (kind) {
      case "safe-progress":
        return safeProgressCompetition(context);
      case "followup-progress":
        return followupProgressCompetition(context);
      case "risky-score":
        return riskyScoreCompetition(context);
      case "negative-deny":
        return negativeDenyCompetition(context, projections(context));
      case "score":
        return scoreCompetition(context);
      case "projection":
        return projectionCompetition(context, projections(context));
      case "risky-recovery":
        return riskyRecoveryCompetition(context);
    }
  };
  const callbacks: CurrentProRootPolicyCallbacks = {
    competition,
    safetyReentryIndices(context, saferIndices) {
      const bestScore = Math.max(
        ...context.candidateIndices.map(
          (index) => context.roots[index]?.score ?? I32_MIN,
        ),
      );
      const margin = Math.max(context.config.rootDrainerSafetyScoreMargin, 0);
      const recoverySetupIndices =
        context.config.enableTurnEngineSelector &&
        currentProEnabled(context.config)
          ? context.candidateIndices.filter((index) => {
              const root = context.roots[index];
              return (
                root !== undefined &&
                root.ownDrainerVulnerable &&
                !root.manaHandoffToOpponent &&
                !root.hasRoundtrip &&
                addI32(root.score, margin) >= bestScore &&
                canChallengeSpiritPreferenceRootWithRecovery(
                  root,
                  context.perspective,
                )
              );
            })
          : [];
      const bestSafeUtility =
        currentProEnabled(context.config) &&
        saferIndices.length > 0 &&
        recoverySetupIndices.length > 0
          ? saferIndices
              .map((index) => context.roots[index])
              .filter((root): root is RootEvaluation => root !== undefined)
              .map((root) =>
                rootUtility(
                  context.game,
                  root,
                  context.perspective,
                  context.config,
                ),
              )
              .sort((left, right) => compareTurnEngineUtilities(right, left))[0]
          : undefined;
      const bestSafeScore = Math.max(
        ...saferIndices.map((index) => context.roots[index]?.score ?? I32_MIN),
      );
      const result = [...saferIndices];
      for (const index of recoverySetupIndices) {
        const root = context.roots[index];
        if (root === undefined) continue;
        const recoveryHeadSignal =
          root.attacksOpponentDrainer ||
          root.classes.drainerSafetyRecover ||
          root.sameTurnScoreWindowValue > 0 ||
          root.spiritSameTurnScoreSetupNow ||
          root.spiritOwnManaSetupNow ||
          hasProgressSurface(root);
        const recoveryScoreGap = saturatingSubI32(bestSafeScore, root.score);
        if (recoveryScoreGap > (recoveryHeadSignal ? 48 : 24)) continue;
        const utility = projectedRiskyRecoveryUtility(
          context.game,
          root,
          context.perspective,
          context.config,
        );
        if (
          utility === undefined ||
          (bestSafeUtility !== undefined &&
            !projectedRecoveryUtilityCompetes(utility, bestSafeUtility))
        ) {
          continue;
        }
        if (!result.includes(index)) result.push(index);
      }
      const progress = safeProgressReentryAfterSafetyPrefilter(context, result);
      if (progress !== undefined && !result.includes(progress)) {
        result.push(progress);
        result.sort((left, right) =>
          compareRankedRootEvaluationIndices(context.roots, left, right),
        );
      }
      return result.filter((index) => !saferIndices.includes(index));
    },
    finalReentryIndices(context) {
      const result: number[] = [];
      const progress = plainSpiritClusterProgressReentry(
        context.roots,
        context.candidateIndices,
        context.perspective,
        context.config,
      );
      const recovery = riskyRecoveryReentry(
        context.game,
        context.roots,
        context.candidateIndices,
        context.perspective,
        context.config,
      );
      if (progress !== undefined) result.push(progress);
      if (recovery !== undefined && recovery !== progress)
        result.push(recovery);
      return result;
    },
    spiritSetupCompetesWithBest: spiritSetupCompetesWithRoot,
    spiritProjectionChallengeOrder(context, candidateIndex, incumbentIndex) {
      const candidate = context.roots[candidateIndex];
      const incumbent = context.roots[incumbentIndex];
      if (candidate === undefined || incumbent === undefined) return undefined;
      const projected = projections(context);
      return replyRiskAdvisorPolicy.spiritProjectionChallengeOrder(
        candidate,
        projected.get(candidateIndex),
        incumbent,
        projected.get(incumbentIndex),
      );
    },
    spiritProjectionOrder(context, candidateIndex, incumbentIndex) {
      const projected = projections(context);
      const candidate = projected.get(candidateIndex);
      const incumbent = projected.get(incumbentIndex);
      if (candidate === undefined && incumbent === undefined) return undefined;
      if (candidate === undefined) return -1;
      if (incumbent === undefined) return 1;
      const candidateRoot = context.roots[candidateIndex];
      const incumbentRoot = context.roots[incumbentIndex];
      return replyRiskAdvisorPolicy.compareSpiritProjectionPlans(
        candidate,
        incumbent,
        candidateRoot !== undefined &&
          incumbentRoot !== undefined &&
          Math.abs(candidateRoot.score - incumbentRoot.score) <= 192,
      );
    },
    spiritFollowupFloorOrder(context, candidateIndex, incumbentIndex) {
      return replyRiskAdvisorPolicy.spiritFollowupFloorOrder(
        context.game,
        context.roots,
        candidateIndex,
        incumbentIndex,
        context.perspective,
        context.config,
        followupScores,
      );
    },
  };
  if (!includeRootPicker) return callbacks;
  return {
    ...callbacks,
    pickRootIndex(context) {
      return currentProRootAdvisorPostsearch(
        context.game,
        context.roots,
        context.perspective,
        config,
      )?.index;
    },
  };
}

/** Builds the exact CurrentPro seams consumed by `root-selector`. */
export function currentProRootPolicyCallbacks(
  config: AutomoveSearchConfig,
): CurrentProRootPolicyCallbacks {
  return buildRootPolicyCallbacks(config, true);
}

function blackPlainSpiritRepresentativeCompetes(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  shortlist: readonly number[],
  plainIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
  followupScores: Map<number, number>,
): boolean {
  const plain = roots[plainIndex];
  if (plain === undefined || !isPlainSpiritDevelopmentRoot(plain)) return false;
  const followup = (index: number): number => {
    const cached = followupScores.get(index);
    if (cached !== undefined) return cached;
    const root = roots[index];
    const value =
      root === undefined
        ? I32_MIN
        : replyRiskAdvisorPolicy.spiritFollowupFloorScore(
            root.game,
            perspective,
            config,
          );
    followupScores.set(index, value);
    return value;
  };
  let competes = false;
  for (const index of shortlist) {
    const setup = roots[index];
    if (
      setup === undefined ||
      game.activeColor !== Color.Black ||
      game.turnNumber > 4 ||
      !setup.spiritOwnManaSetupNow ||
      setup.spiritSameTurnScoreSetupNow ||
      !sameFirstInput(plain.inputs, setup.inputs) ||
      plain.ownDrainerVulnerable !== setup.ownDrainerVulnerable ||
      plain.ownDrainerWalkVulnerable !== setup.ownDrainerWalkVulnerable ||
      !advisorRootIsSafe(plain) ||
      !advisorRootIsSafe(setup) ||
      hasConcreteScoreSurface(plain) ||
      hasConcreteScoreSurface(setup) ||
      plain.attacksOpponentDrainer ||
      setup.attacksOpponentDrainer ||
      plain.sameTurnScoreWindowValue !== 0 ||
      setup.sameTurnScoreWindowValue !== 0 ||
      plain.supermanaProgress ||
      setup.supermanaProgress ||
      plain.opponentManaProgress ||
      setup.opponentManaProgress
    ) {
      continue;
    }
    const setupHasCloseTopSeed =
      setup.rootRank <= plain.rootRank &&
      saturatingAddI32(setup.score, 64) >= plain.score &&
      setup.spiritSetupGain >= saturatingAddI32(plain.spiritSetupGain, 32);
    if (setupHasCloseTopSeed) return false;
    const plainFollowup = followup(plainIndex);
    const setupFollowup = followup(index);
    competes ||=
      plainFollowup >= saturatingAddI32(setupFollowup, 32) ||
      (plain.score >= setup.score && plainFollowup >= setupFollowup);
  }
  return competes;
}

function representativeCompetesInApproval(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  shortlist: readonly number[],
  index: number,
  reason: CurrentProRootAdvisorReasonCode,
  perspective: Color,
  config: AutomoveSearchConfig,
  followupScores: Map<number, number>,
): boolean {
  const root = roots[index];
  if (root === undefined) return false;
  if (reason !== CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative) {
    return true;
  }
  return (
    root.spiritSameTurnScoreSetupNow ||
    root.spiritOwnManaSetupNow ||
    blackPlainSpiritRepresentativeCompetes(
      game,
      roots,
      shortlist,
      index,
      perspective,
      config,
      followupScores,
    )
  );
}

function bestOverrideIndex(
  roots: readonly RootEvaluation[],
  indices: readonly number[],
  predicate: (root: RootEvaluation, index: number) => boolean,
  compare: (left: number, right: number) => number,
): number | undefined {
  return indices
    .filter((index) => {
      const root = roots[index];
      return root !== undefined && predicate(root, index);
    })
    .sort(compare)[0];
}

function compareRootRankThenRanked(
  roots: readonly RootEvaluation[],
  left: number,
  right: number,
): number {
  const leftRoot = roots[left];
  const rightRoot = roots[right];
  if (leftRoot === undefined || rightRoot === undefined) return left - right;
  if (leftRoot.rootRank !== rightRoot.rootRank) {
    return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
  }
  return compareRankedRootEvaluationIndices(roots, left, right);
}

function compareRootRankThenScoreThenRanked(
  roots: readonly RootEvaluation[],
  left: number,
  right: number,
): number {
  const leftRoot = roots[left];
  const rightRoot = roots[right];
  if (leftRoot === undefined || rightRoot === undefined) return left - right;
  if (leftRoot.rootRank !== rightRoot.rootRank) {
    return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
  }
  if (leftRoot.score !== rightRoot.score) {
    return leftRoot.score > rightRoot.score ? -1 : 1;
  }
  return compareRankedRootEvaluationIndices(roots, left, right);
}

function exactContextIsQuiet(game: MonsGame): boolean {
  const exact = exactOpportunityContext(game, game.activeColor);
  return (
    exact.delta.sameTurnScoreWindowValue === 0 &&
    exact.delta.opponentWindowDenyGain === 0 &&
    !exact.delta.drainerAttackAvailable
  );
}

function blackOpeningSetupSiblingOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber > 2 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana()
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !approved.spiritOwnManaSetupNow ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    advisorRootIsUnsafe(approved) ||
    approved.inputs.length < 2
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritOwnManaSetupNow &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip &&
      !advisorRootIsUnsafe(challenger) &&
      challenger.inputs.length >= 2 &&
      sameInputAt(challenger.inputs, approved.inputs, 0) &&
      sameInputAt(challenger.inputs, approved.inputs, 1) &&
      challenger.spiritSetupGain === approved.spiritSetupGain &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      challenger.rootRank < approved.rootRank,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function blackEarlySafeManaFollowupOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 2 ||
    game.monsMovesCount < 2 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0 ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    hasProgressSurface(approved) ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
      !challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      !hasProgressSurface(challenger) &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip &&
      !advisorRootIsUnsafe(challenger) &&
      challenger.rootRank < approved.rootRank &&
      challenger.score >= saturatingAddI32(approved.score, 48) &&
      challenger.safeSupermanaProgressSteps <=
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps <=
        approved.safeOpponentManaProgressSteps &&
      challenger.scorePathBestSteps <= approved.scorePathBestSteps &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable === approved.ownDrainerWalkVulnerable,
    (left, right) => compareRootRankThenScoreThenRanked(roots, left, right),
  );
}

function blackEarlyPlainSpiritFollowupOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 2 ||
    game.monsMovesCount > 1 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0 ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    hasProgressSurface(approved) ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      isPlainSpiritDevelopmentRoot(challenger) &&
      !hasProgressSurface(challenger) &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip &&
      !advisorRootIsUnsafe(challenger) &&
      challenger.rootRank > approved.rootRank &&
      challenger.rootRank <= approved.rootRank + 4 &&
      challenger.score >= saturatingSubI32(approved.score, 32) &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 16) &&
      challenger.scorePathBestSteps >= approved.scorePathBestSteps &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable === approved.ownDrainerWalkVulnerable,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.spiritSetupGain !== rightRoot.spiritSetupGain) {
        return leftRoot.spiritSetupGain > rightRoot.spiritSetupGain ? -1 : 1;
      }
      if (leftRoot.rootRank !== rightRoot.rootRank) {
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      }
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function blackTurnFourVulnerableProgressManaOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 4 ||
    game.monsMovesCount === 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0 ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.ManaTempo,
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    !approved.ownDrainerVulnerable ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
      !challenger.ownDrainerVulnerable &&
      !challenger.ownDrainerWalkVulnerable &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      !challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip,
    (left, right) => compareRootRankThenScoreThenRanked(roots, left, right),
  );
}

function blackTurnSixAttackVulnerableProgressManaOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 6 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  if (
    exact.delta.sameTurnScoreWindowValue > 1 ||
    exact.delta.opponentWindowDenyGain > 1 ||
    !exact.delta.drainerAttackAvailable
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    !approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
      !challenger.ownDrainerVulnerable &&
      !challenger.ownDrainerWalkVulnerable &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      !challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip &&
      challenger.safeSupermanaProgressSteps ===
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps ===
        saturatingAddI32(approved.safeOpponentManaProgressSteps, 1) &&
      challenger.scorePathBestSteps === approved.scorePathBestSteps &&
      saturatingSubI32(approved.score, challenger.score) <= 160 &&
      challenger.rootRank <= approved.rootRank + 4,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function blackTurnFourSetupClusterOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 4 ||
    game.monsMovesCount === 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0 ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    approved.spiritOwnManaSetupNow ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritOwnManaSetupNow &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip &&
      sameFirstInput(challenger.inputs, approved.inputs) &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 32) &&
      challenger.rootRank < approved.rootRank,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function earlySameLaneHigherScoreOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  const supportedState =
    (game.activeColor === Color.Black && game.turnNumber === 2) ||
    (game.activeColor === Color.White && game.turnNumber === 3);
  if (
    !currentProEnabled(config) ||
    !game.playerCanMoveMana() ||
    roots.length === 0 ||
    !supportedState ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (approved === undefined) return undefined;
  const approvedFamily = advisorRootFamily(approved);
  if (
    ![TurnPlanFamily.ManaTempo, TurnPlanFamily.SpiritImpact].includes(
      approvedFamily,
    ) ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === approvedFamily &&
      sameFirstInput(challenger.inputs, approved.inputs) &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip &&
      !advisorRootIsUnsafe(challenger) &&
      challenger.spiritDevelopment === approved.spiritDevelopment &&
      challenger.spiritSameTurnScoreSetupNow ===
        approved.spiritSameTurnScoreSetupNow &&
      challenger.spiritOwnManaSetupNow === approved.spiritOwnManaSetupNow &&
      challenger.supermanaProgress === approved.supermanaProgress &&
      challenger.opponentManaProgress === approved.opponentManaProgress &&
      challenger.safeSupermanaProgressSteps ===
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps ===
        approved.safeOpponentManaProgressSteps &&
      challenger.scorePathBestSteps === approved.scorePathBestSteps &&
      challenger.spiritSetupGain === approved.spiritSetupGain &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      challenger.score >= saturatingAddI32(approved.score, 8) &&
      challenger.rootRank <= approved.rootRank + 8,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank > rightRoot.rootRank ? -1 : 1;
      return -compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function whiteTurnFiveWeakWindowSetupOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 5 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  const weakWindow =
    exact.delta.sameTurnScoreWindowValue <= 1 &&
    exact.delta.opponentWindowDenyGain <= 1 &&
    !exact.delta.drainerAttackAvailable &&
    (exact.delta.sameTurnScoreWindowValue > 0 ||
      exact.delta.opponentWindowDenyGain > 0);
  if (!weakWindow) return undefined;
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    advisorRootIsUnsafe(approved) ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritOwnManaSetupNow &&
      !challenger.spiritSameTurnScoreSetupNow &&
      hasProgressSurface(challenger) &&
      !advisorRootIsUnsafe(challenger) &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      challenger.manaHandoffToOpponent === approved.manaHandoffToOpponent &&
      challenger.hasRoundtrip === approved.hasRoundtrip &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      saturatingSubI32(approved.score, challenger.score) <= 96 &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 48) &&
      challenger.safeSupermanaProgressSteps <=
        saturatingAddI32(approved.safeSupermanaProgressSteps, 1) &&
      challenger.safeOpponentManaProgressSteps <=
        saturatingAddI32(approved.safeOpponentManaProgressSteps, 1) &&
      challenger.rootRank <= approved.rootRank + 4,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function replyLimitForRoots(
  shortlistLength: number,
  config: AutomoveSearchConfig,
): number {
  const length = Math.max(shortlistLength, 1);
  const rootNodeBudget = Math.max(
    Math.trunc(
      (config.maxVisitedNodes * Math.max(config.rootReplyRiskNodeShareBp, 0)) /
        10_000,
    ),
    length,
    1,
  );
  return Math.min(
    Math.max(Math.trunc(rootNodeBudget / length), 1),
    Math.max(config.rootReplyRiskReplyLimit, 1),
  );
}

function blackSetupProgressCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 6 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    !hasProgressSurface(approved) ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  const replyLimit = replyLimitForRoots(selectionIndices.length, config);
  const approvedSnapshot = rootReplyRiskSnapshot(
    approved.game,
    perspective,
    config,
    replyLimit,
  );
  if (
    approvedSnapshot.allowsImmediateOpponentWin ||
    approvedSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const utilityCache = new Map<number, ReturnType<typeof rootUtility>>();
  const snapshotCache = new Map([[approvedIndex, approvedSnapshot] as const]);
  const followupCache = new Map<number, number>();
  const utility = (index: number) => {
    const cached = utilityCache.get(index);
    if (cached !== undefined) return cached;
    const root = roots[index];
    const result =
      root === undefined
        ? rootUtility(game, approved, perspective, config)
        : rootUtility(game, root, perspective, config);
    utilityCache.set(index, result);
    return result;
  };
  const snapshot = (index: number) => {
    const cached = snapshotCache.get(index);
    if (cached !== undefined) return cached;
    const root = roots[index];
    const result = rootReplyRiskSnapshot(
      root?.game ?? approved.game,
      perspective,
      config,
      replyLimit,
    );
    snapshotCache.set(index, result);
    return result;
  };
  const followup = (index: number) => {
    const cached = followupCache.get(index);
    if (cached !== undefined) return cached;
    const root = roots[index];
    const result = replyRiskAdvisorPolicy.spiritFollowupFloorScore(
      root?.game ?? approved.game,
      perspective,
      config,
    );
    followupCache.set(index, result);
    return result;
  };
  const approvedUtility = utility(approvedIndex);
  const approvedFollowup = followup(approvedIndex);
  const exact = exactOpportunityContext(game, game.activeColor);
  const weakWindowContext =
    exact.delta.sameTurnScoreWindowValue <= 1 &&
    exact.delta.opponentWindowDenyGain <= 1;
  let bestIndex: number | undefined;
  for (const index of selectionIndices) {
    if (index === approvedIndex) continue;
    const challenger = roots[index];
    if (
      challenger === undefined ||
      advisorRootFamily(challenger) !== TurnPlanFamily.SpiritImpact ||
      !challenger.spiritOwnManaSetupNow ||
      challenger.spiritSameTurnScoreSetupNow ||
      !hasProgressSurface(challenger) ||
      challenger.winsImmediately ||
      challenger.attacksOpponentDrainer ||
      challenger.sameTurnScoreWindowValue > 0 ||
      challenger.scoresSupermanaThisTurn ||
      challenger.scoresOpponentManaThisTurn ||
      challenger.safeSupermanaPickupNow ||
      challenger.safeOpponentManaPickupNow ||
      challenger.manaHandoffToOpponent ||
      challenger.hasRoundtrip ||
      advisorRootIsUnsafe(challenger) ||
      !sameFirstInput(challenger.inputs, approved.inputs) ||
      challenger.supermanaProgress !== approved.supermanaProgress ||
      challenger.opponentManaProgress !== approved.opponentManaProgress ||
      challenger.ownDrainerVulnerable !== approved.ownDrainerVulnerable ||
      challenger.ownDrainerWalkVulnerable !== approved.ownDrainerWalkVulnerable
    ) {
      continue;
    }
    const challengerUtility = utility(index);
    const challengerSnapshot = snapshot(index);
    const challengerFollowup = followup(index);
    const utilityCompetition =
      utilityCompetes(challengerUtility, approvedUtility) ||
      replyRiskAdvisorPolicy.rootProgressOrSetupBetter(challenger, approved);
    const weakContextCompetition =
      weakWindowContext &&
      challenger.spiritSetupGain > approved.spiritSetupGain &&
      challenger.score >= saturatingSubI32(approved.score, 512);
    if (
      (!weakContextCompetition && !utilityCompetition) ||
      challengerSnapshot.allowsImmediateOpponentWin ||
      challengerSnapshot.opponentReachesMatchPoint ||
      (!weakContextCompetition &&
        saturatingAddI32(challengerSnapshot.worstReplyScore, 320) <
          approvedSnapshot.worstReplyScore) ||
      (!weakContextCompetition &&
        saturatingAddI32(challengerFollowup, 32) < approvedFollowup)
    ) {
      continue;
    }
    if (bestIndex === undefined) {
      bestIndex = index;
      continue;
    }
    const current = roots[bestIndex];
    if (current === undefined) {
      bestIndex = index;
      continue;
    }
    let replace: boolean;
    if (weakWindowContext) {
      replace =
        challenger.score > current.score ||
        (challenger.score === current.score &&
          (challenger.spiritSetupGain > current.spiritSetupGain ||
            (challenger.spiritSetupGain === current.spiritSetupGain &&
              compareRankedRootEvaluationIndices(roots, index, bestIndex) <
                0)));
    } else {
      const utilityOrder = compareUtilityPrimaryAxes(
        challengerUtility,
        utility(bestIndex),
      );
      const currentSnapshot = snapshot(bestIndex);
      const currentFollowup = followup(bestIndex);
      if (utilityOrder > 0) replace = true;
      else if (utilityOrder !== 0) replace = false;
      else if (
        challengerSnapshot.worstReplyScore !== currentSnapshot.worstReplyScore
      ) {
        replace =
          challengerSnapshot.worstReplyScore > currentSnapshot.worstReplyScore;
      } else if (challengerFollowup !== currentFollowup) {
        replace = challengerFollowup > currentFollowup;
      } else if (challenger.spiritSetupGain !== current.spiritSetupGain) {
        replace = challenger.spiritSetupGain > current.spiritSetupGain;
      } else if (challenger.score !== current.score) {
        replace = challenger.score > current.score;
      } else {
        replace =
          compareRankedRootEvaluationIndices(roots, index, bestIndex) < 0;
      }
    }
    if (replace) bestIndex = index;
  }
  return bestIndex;
}

function blackPlainSpiritSetupCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 6 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0 ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    hasProgressSurface(approved) ||
    approved.spiritOwnManaSetupNow ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritOwnManaSetupNow &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !hasProgressSurface(challenger) &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      challenger.manaHandoffToOpponent === approved.manaHandoffToOpponent &&
      challenger.hasRoundtrip === approved.hasRoundtrip &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      sameFirstInput(challenger.inputs, approved.inputs) &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 32) &&
      challenger.score >= saturatingSubI32(approved.score, 96) &&
      challenger.rootRank <= approved.rootRank + 4,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.spiritSetupGain !== rightRoot.spiritSetupGain)
        return leftRoot.spiritSetupGain > rightRoot.spiritSetupGain ? -1 : 1;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function blackNoActionProgressOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 6 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana()
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  if (
    exact.delta.sameTurnScoreWindowValue > 1 ||
    exact.delta.opponentWindowDenyGain > 1 ||
    (exact.delta.sameTurnScoreWindowValue === 0 &&
      exact.delta.opponentWindowDenyGain === 0)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    approved.score < 0
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      [
        TurnPlanFamily.SafeSupermanaProgress,
        TurnPlanFamily.SafeOpponentManaProgress,
      ].includes(advisorRootFamily(challenger)) &&
      challenger.score >= 0 &&
      challenger.rootRank < approved.rootRank &&
      !challenger.winsImmediately &&
      !challenger.attacksOpponentDrainer &&
      !challenger.scoresSupermanaThisTurn &&
      !challenger.scoresOpponentManaThisTurn &&
      !challenger.safeSupermanaPickupNow &&
      !challenger.safeOpponentManaPickupNow &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !challenger.manaHandoffToOpponent &&
      !challenger.hasRoundtrip,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function blackNoActionManaSiblingOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 6 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana()
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (approved === undefined) return undefined;
  const allowWindowedSameLane =
    approved.sameTurnScoreWindowValue > 0 &&
    !approved.ownDrainerVulnerable &&
    !approved.ownDrainerWalkVulnerable;
  if (
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    (approved.sameTurnScoreWindowValue > 0 && !allowWindowedSameLane) ||
    (approved.rootRank < 3 && !allowWindowedSameLane)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) => {
      if (
        index === approvedIndex ||
        advisorRootFamily(challenger) !== TurnPlanFamily.ManaTempo ||
        challenger.rootRank >= approved.rootRank ||
        challenger.sameTurnScoreWindowValue >
          approved.sameTurnScoreWindowValue ||
        challenger.winsImmediately ||
        challenger.attacksOpponentDrainer ||
        challenger.scoresSupermanaThisTurn ||
        challenger.scoresOpponentManaThisTurn ||
        challenger.safeSupermanaPickupNow ||
        challenger.safeOpponentManaPickupNow ||
        challenger.manaHandoffToOpponent ||
        challenger.hasRoundtrip
      ) {
        return false;
      }
      if (approved.score >= 0) return challenger.score >= 0;
      if (
        allowWindowedSameLane &&
        challenger.sameTurnScoreWindowValue ===
          approved.sameTurnScoreWindowValue &&
        challenger.safeSupermanaProgressSteps ===
          approved.safeSupermanaProgressSteps &&
        challenger.safeOpponentManaProgressSteps ===
          approved.safeOpponentManaProgressSteps &&
        challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
        challenger.ownDrainerWalkVulnerable ===
          approved.ownDrainerWalkVulnerable &&
        challenger.manaHandoffToOpponent === approved.manaHandoffToOpponent &&
        challenger.hasRoundtrip === approved.hasRoundtrip
      ) {
        return true;
      }
      return saturatingSubI32(approved.score, challenger.score) <= 192;
    },
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function rootIsNonTactical(root: RootEvaluation): boolean {
  return (
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

function blackTurnFourWindowManaSiblingOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 4 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana()
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  if (
    exact.delta.sameTurnScoreWindowValue > 1 ||
    exact.delta.opponentWindowDenyGain > 1 ||
    (exact.delta.sameTurnScoreWindowValue === 0 &&
      exact.delta.opponentWindowDenyGain === 0)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    approved.rootRank !== 0 ||
    !approved.ownDrainerVulnerable ||
    !rootIsNonTactical(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
      challenger.rootRank > approved.rootRank &&
      challenger.rootRank <= approved.rootRank + 2 &&
      challenger.sameTurnScoreWindowValue ===
        approved.sameTurnScoreWindowValue &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      rootIsNonTactical(challenger) &&
      challenger.score >= saturatingSubI32(approved.score, 96) &&
      challenger.scorePathBestSteps > approved.scorePathBestSteps,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function blackBaselineAlignmentOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  baselineIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    approvedIndex === baselineIndex ||
    !selectionIndices.includes(baselineIndex)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  const baseline = roots[baselineIndex];
  if (approved === undefined || baseline === undefined) return undefined;
  const approvedFamily = advisorRootFamily(approved);
  const baselineFamily = advisorRootFamily(baseline);
  const exact = exactOpportunityContext(game, game.activeColor);
  const approvedNonTactical = rootIsNonTactical(approved);
  const baselineNonTactical = rootIsNonTactical(baseline);
  const weakBlackPlainSpiritBaselineMana =
    game.turnNumber >= 6 &&
    game.monsMovesCount >= 2 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    exact.delta.sameTurnScoreWindowValue === 0 &&
    exact.delta.opponentWindowDenyGain === 0 &&
    !exact.delta.drainerAttackAvailable &&
    approvedFamily === TurnPlanFamily.SpiritImpact &&
    baselineFamily === TurnPlanFamily.ManaTempo &&
    isPlainSpiritDevelopmentRoot(approved) &&
    !hasProgressSurface(approved) &&
    approvedNonTactical &&
    baselineNonTactical &&
    approved.ownDrainerVulnerable &&
    baseline.ownDrainerVulnerable &&
    baseline.score >= approved.score;
  if (weakBlackPlainSpiritBaselineMana) return baselineIndex;
  const earlyBlackSetupBranchBaselineSpirit =
    game.turnNumber === 2 &&
    game.monsMovesCount >= 2 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    exact.delta.sameTurnScoreWindowValue === 0 &&
    exact.delta.opponentWindowDenyGain === 0 &&
    !exact.delta.drainerAttackAvailable &&
    approvedFamily === TurnPlanFamily.SpiritImpact &&
    baselineFamily === TurnPlanFamily.SpiritImpact &&
    approvedNonTactical &&
    baselineNonTactical &&
    approved.spiritOwnManaSetupNow &&
    baseline.spiritOwnManaSetupNow &&
    !approved.spiritSameTurnScoreSetupNow &&
    !baseline.spiritSameTurnScoreSetupNow &&
    !advisorRootIsUnsafe(approved) &&
    !advisorRootIsUnsafe(baseline) &&
    sameFirstInput(approved.inputs, baseline.inputs) &&
    approved.spiritSetupGain === baseline.spiritSetupGain &&
    approved.safeSupermanaProgressSteps ===
      baseline.safeSupermanaProgressSteps &&
    approved.safeOpponentManaProgressSteps ===
      baseline.safeOpponentManaProgressSteps &&
    approved.score === baseline.score &&
    baseline.rootRank < approved.rootRank &&
    Math.abs(approved.rootRank - baseline.rootRank) <= 2;
  if (earlyBlackSetupBranchBaselineSpirit) return baselineIndex;
  const weakBlackNoActionWindowBaselineMana =
    game.turnNumber >= 4 &&
    game.monsMovesCount === 0 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    exact.delta.sameTurnScoreWindowValue <= 1 &&
    exact.delta.opponentWindowDenyGain <= 1 &&
    (exact.delta.sameTurnScoreWindowValue > 0 ||
      exact.delta.opponentWindowDenyGain > 0) &&
    approvedFamily === TurnPlanFamily.ManaTempo &&
    baselineFamily === TurnPlanFamily.ManaTempo &&
    approvedNonTactical &&
    baselineNonTactical &&
    approved.sameTurnScoreWindowValue === baseline.sameTurnScoreWindowValue &&
    approved.ownDrainerVulnerable === baseline.ownDrainerVulnerable &&
    approved.rootRank < baseline.rootRank &&
    approved.score >= baseline.score &&
    baseline.scorePathBestSteps > approved.scorePathBestSteps;
  return weakBlackNoActionWindowBaselineMana ? baselineIndex : undefined;
}

function blackTurnStartGuardedBaselineManaOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber !== 6 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    candidateIndices.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (approved === undefined) return undefined;
  const exact = exactOpportunityContext(game, game.activeColor);
  if (
    exact.delta.sameTurnScoreWindowValue !== 0 ||
    exact.delta.opponentWindowDenyGain !== 0 ||
    exact.delta.drainerAttackAvailable ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    hasProgressSurface(approved) ||
    !rootIsNonTactical(approved) ||
    !approved.ownDrainerVulnerable
  ) {
    return undefined;
  }
  const baselineConfig = selectorTurnEngineModeView(
    config,
    AUTOMOVE_TURN_ENGINE_MODE.ProV1,
  );
  let baselineIndex: number | undefined;
  if (baselineConfig.enableRootReplyRiskGuard) {
    baselineIndex = pickRootWithReplyRiskGuard(
      game,
      roots,
      candidateIndices,
      game.activeColor,
      baselineConfig,
    );
  }
  baselineIndex ??= pickBaselineRootIndexFromCandidateIndices(
    game,
    roots,
    candidateIndices,
    game.activeColor,
    baselineConfig,
  );
  if (
    baselineIndex === undefined ||
    baselineIndex === approvedIndex ||
    !candidateIndices.includes(baselineIndex)
  ) {
    return undefined;
  }
  const baseline = roots[baselineIndex];
  if (
    baseline === undefined ||
    advisorRootFamily(baseline) !== TurnPlanFamily.ManaTempo ||
    !rootIsNonTactical(baseline) ||
    !baseline.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable !== baseline.ownDrainerWalkVulnerable ||
    approved.safeSupermanaProgressSteps !==
      baseline.safeSupermanaProgressSteps ||
    approved.safeOpponentManaProgressSteps !==
      baseline.safeOpponentManaProgressSteps ||
    approved.scorePathBestSteps !== baseline.scorePathBestSteps ||
    baseline.score < saturatingAddI32(approved.score, 256)
  ) {
    return undefined;
  }
  const replyLimit = Math.min(Math.max(config.rootReplyRiskReplyLimit, 1), 24);
  const approvedSnapshot = rootReplyRiskSnapshot(
    approved.game,
    game.activeColor,
    config,
    replyLimit,
  );
  const baselineSnapshot = rootReplyRiskSnapshot(
    baseline.game,
    game.activeColor,
    config,
    replyLimit,
  );
  if (
    approvedSnapshot.allowsImmediateOpponentWin ||
    baselineSnapshot.allowsImmediateOpponentWin ||
    approvedSnapshot.opponentReachesMatchPoint ||
    baselineSnapshot.opponentReachesMatchPoint ||
    baselineSnapshot.worstReplyScore <
      saturatingAddI32(approvedSnapshot.worstReplyScore, 32)
  ) {
    return undefined;
  }
  return baselineIndex;
}

function whiteTurnThreeBaselineAlignmentOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  baselineIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    approvedIndex === baselineIndex
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  const baseline = roots[baselineIndex];
  if (approved === undefined || baseline === undefined) return undefined;
  const exact = exactOpportunityContext(game, game.activeColor);
  const aligned =
    game.monsMovesCount >= 3 &&
    !game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    selectionIndices.includes(baselineIndex) &&
    exact.delta.sameTurnScoreWindowValue === 0 &&
    exact.delta.opponentWindowDenyGain === 0 &&
    !exact.delta.drainerAttackAvailable &&
    advisorRootFamily(approved) === TurnPlanFamily.ManaTempo &&
    advisorRootFamily(baseline) === TurnPlanFamily.ManaTempo &&
    rootIsNonTactical(approved) &&
    rootIsNonTactical(baseline) &&
    !approved.spiritDevelopment &&
    !baseline.spiritDevelopment &&
    !approved.spiritSameTurnScoreSetupNow &&
    !baseline.spiritSameTurnScoreSetupNow &&
    !approved.spiritOwnManaSetupNow &&
    !baseline.spiritOwnManaSetupNow &&
    !approved.ownDrainerVulnerable &&
    !baseline.ownDrainerVulnerable &&
    !approved.ownDrainerWalkVulnerable &&
    !baseline.ownDrainerWalkVulnerable &&
    approved.safeSupermanaProgressSteps ===
      baseline.safeSupermanaProgressSteps &&
    approved.safeOpponentManaProgressSteps ===
      baseline.safeOpponentManaProgressSteps &&
    approved.scorePathBestSteps === baseline.scorePathBestSteps &&
    approved.spiritSetupGain === baseline.spiritSetupGain &&
    baseline.score >= saturatingAddI32(approved.score, 16) &&
    baseline.rootRank >= approved.rootRank + 2 &&
    baseline.rootRank <= approved.rootRank + 4;
  return aligned ? baselineIndex : undefined;
}

function whiteTurnThreeAttackBridgeEscape(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    selectionIndices.length !== 1 ||
    selectionIndices[0] !== approvedIndex ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (approved === undefined) return undefined;
  const exact = exactOpportunityContext(game, game.activeColor);
  if (
    !exact.delta.drainerAttackAvailable ||
    exact.delta.sameTurnScoreWindowValue !== 0 ||
    exact.delta.opponentWindowDenyGain !== 0 ||
    game.monsMovesCount < 2 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    !approved.spiritOwnManaSetupNow ||
    !rootIsNonTactical(approved) ||
    advisorRootIsUnsafe(approved) ||
    approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable
  ) {
    return undefined;
  }
  const allIndices = roots.map((_root, index) => index);
  return bestOverrideIndex(
    roots,
    allIndices,
    (root, index) =>
      index !== approvedIndex &&
      !selectionIndices.includes(index) &&
      advisorRootFamily(root) === TurnPlanFamily.ManaTempo &&
      !root.spiritDevelopment &&
      !root.spiritSameTurnScoreSetupNow &&
      !root.spiritOwnManaSetupNow &&
      rootIsNonTactical(root) &&
      !advisorRootIsUnsafe(root) &&
      !root.ownDrainerVulnerable &&
      !root.ownDrainerWalkVulnerable &&
      root.safeSupermanaProgressSteps === approved.safeSupermanaProgressSteps &&
      root.safeOpponentManaProgressSteps ===
        approved.safeOpponentManaProgressSteps &&
      root.scorePathBestSteps === approved.scorePathBestSteps &&
      root.inputs.length >= 3 &&
      root.rootRank <= approved.rootRank + 2,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function isCurrentProWhiteManaSiblingPair(
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
  config: AutomoveSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    advisorRootFamily(candidate) === TurnPlanFamily.ManaTempo &&
    advisorRootFamily(incumbent) === TurnPlanFamily.ManaTempo &&
    candidate.efficiency === incumbent.efficiency &&
    !candidate.ownDrainerVulnerable &&
    !incumbent.ownDrainerVulnerable &&
    !candidate.ownDrainerWalkVulnerable &&
    !incumbent.ownDrainerWalkVulnerable &&
    !advisorRootIsUnsafe(candidate) &&
    !advisorRootIsUnsafe(incumbent) &&
    replyRiskAdvisorPolicy.sameNonTacticalProgressLane(candidate, incumbent)
  );
}

function whiteManaCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount < 3 ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable ||
    approved.manaHandoffToOpponent ||
    approved.hasRoundtrip ||
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    approved.sameTurnScoreWindowValue > 0 ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  const approvedUtility = replyRiskAdvisorPolicy.turnEngineRootPlanUtility(
    game,
    approved,
    perspective,
    config,
    TurnPlanFamily.ManaTempo,
  );
  const utilities = new Map<
    number,
    ReturnType<typeof replyRiskAdvisorPolicy.turnEngineRootPlanUtility>
  >();
  let bestIndex: number | undefined;
  let bestUtility = approvedUtility;
  let bestIsDominance = false;
  for (const index of selectionIndices) {
    if (index === approvedIndex) continue;
    const challenger = roots[index];
    if (challenger === undefined) continue;
    const sameLaneNearBest =
      isCurrentProWhiteManaSiblingPair(challenger, approved, config) &&
      saturatingSubI32(approved.score, challenger.score) <= 24 &&
      Math.abs(approved.rootRank - challenger.rootRank) <= 4 &&
      challenger.rootRank < approved.rootRank;
    if (
      advisorRootFamily(challenger) !== TurnPlanFamily.ManaTempo ||
      challenger.ownDrainerVulnerable ||
      challenger.ownDrainerWalkVulnerable ||
      challenger.manaHandoffToOpponent ||
      challenger.hasRoundtrip ||
      challenger.winsImmediately ||
      challenger.attacksOpponentDrainer ||
      challenger.sameTurnScoreWindowValue > 0 ||
      challenger.scoresSupermanaThisTurn ||
      challenger.scoresOpponentManaThisTurn ||
      challenger.safeSupermanaPickupNow ||
      challenger.safeOpponentManaPickupNow ||
      (!sameLaneNearBest &&
        challenger.score < saturatingSubI32(approved.score, 96)) ||
      advisorRootIsUnsafe(challenger) ||
      (challenger.rootRank >= approved.rootRank && !sameLaneNearBest)
    ) {
      continue;
    }
    let challengerUtility = utilities.get(index);
    if (challengerUtility === undefined) {
      challengerUtility = replyRiskAdvisorPolicy.turnEngineRootPlanUtility(
        game,
        challenger,
        perspective,
        config,
        TurnPlanFamily.ManaTempo,
      );
      utilities.set(index, challengerUtility);
    }
    const utilityOrder = compareUtilityPrimaryAxes(
      challengerUtility,
      approvedUtility,
    );
    const dominance =
      utilityOrder > 0 ||
      challengerUtility.strictlyDominatesOverrideAxes(approvedUtility);
    if (!dominance && !sameLaneNearBest) continue;
    let replace = bestIndex === undefined;
    if (bestIndex !== undefined) {
      const current = roots[bestIndex];
      if (current === undefined) replace = true;
      else {
        const currentSameLane =
          isCurrentProWhiteManaSiblingPair(current, approved, config) &&
          saturatingSubI32(approved.score, current.score) <= 24 &&
          Math.abs(approved.rootRank - current.rootRank) <= 4 &&
          current.rootRank < approved.rootRank;
        if (dominance !== bestIsDominance) replace = dominance;
        else if (dominance) {
          const order = compareUtilityPrimaryAxes(
            challengerUtility,
            bestUtility,
          );
          replace =
            order > 0 ||
            (order === 0 &&
              compareRankedRootEvaluationIndices(roots, index, bestIndex) < 0);
        } else if (sameLaneNearBest && currentSameLane) {
          replace =
            challenger.rootRank < current.rootRank ||
            (challenger.rootRank === current.rootRank &&
              compareRankedRootEvaluationIndices(roots, index, bestIndex) < 0);
        } else replace = sameLaneNearBest;
      }
    }
    if (replace) {
      bestIndex = index;
      bestUtility = challengerUtility;
      bestIsDominance = dominance;
    }
  }
  return bestIndex;
}

function whiteNoActionSafeProgressManaOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber < 5 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    !approved.ownDrainerVulnerable ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
      !advisorRootIsUnsafe(challenger) &&
      !challenger.ownDrainerVulnerable &&
      !challenger.ownDrainerWalkVulnerable &&
      rootIsNonTactical(challenger) &&
      challenger.sameTurnScoreWindowValue === 0 &&
      challenger.safeSupermanaProgressSteps <=
        saturatingAddI32(approved.safeSupermanaProgressSteps, 1) &&
      challenger.safeOpponentManaProgressSteps <=
        saturatingAddI32(approved.safeOpponentManaProgressSteps, 1) &&
      saturatingAddI32(challenger.score, 448) >= approved.score,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function isNonConcreteManaWindowRoot(root: RootEvaluation): boolean {
  return (
    advisorRootFamily(root) === TurnPlanFamily.ManaTempo &&
    root.sameTurnScoreWindowValue > 0 &&
    root.sameTurnScoreWindowValue <= 1 &&
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

function isWhiteSpiritProgressWindowPair(
  game: MonsGame,
  spirit: RootEvaluation,
  mana: RootEvaluation,
  config: AutomoveSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    game.activeColor === Color.White &&
    game.turnNumber >= 5 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    advisorRootFamily(spirit) === TurnPlanFamily.SpiritImpact &&
    !spirit.spiritSameTurnScoreSetupNow &&
    !spirit.spiritOwnManaSetupNow &&
    hasProgressSurface(spirit) &&
    rootIsNonTactical(spirit) &&
    spirit.sameTurnScoreWindowValue === 0 &&
    isNonConcreteManaWindowRoot(mana) &&
    spirit.ownDrainerVulnerable === mana.ownDrainerVulnerable &&
    spirit.ownDrainerWalkVulnerable === mana.ownDrainerWalkVulnerable
  );
}

function whiteWindowProgressCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber < 5 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (approved === undefined || !isNonConcreteManaWindowRoot(approved)) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  const weakWindow =
    exact.delta.sameTurnScoreWindowValue <= 1 &&
    exact.delta.opponentWindowDenyGain <= 1;
  const replyLimit = replyLimitForRoots(selectionIndices.length, config);
  const approvedSnapshot = rootReplyRiskSnapshot(
    approved.game,
    perspective,
    config,
    replyLimit,
  );
  if (
    approvedSnapshot.allowsImmediateOpponentWin ||
    approvedSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const approvedUtility = rootUtility(game, approved, perspective, config);
  const approvedFollowup = replyRiskAdvisorPolicy.spiritFollowupFloorScore(
    approved.game,
    perspective,
    config,
  );
  const snapshots = new Map([[approvedIndex, approvedSnapshot]]);
  const followups = new Map([[approvedIndex, approvedFollowup]]);
  const snapshot = (index: number) => {
    let value = snapshots.get(index);
    const root = roots[index];
    if (value === undefined && root !== undefined) {
      value = rootReplyRiskSnapshot(root.game, perspective, config, replyLimit);
      snapshots.set(index, value);
    }
    return value;
  };
  const followup = (index: number) => {
    let value = followups.get(index);
    const root = roots[index];
    if (value === undefined && root !== undefined) {
      value = replyRiskAdvisorPolicy.spiritFollowupFloorScore(
        root.game,
        perspective,
        config,
      );
      followups.set(index, value);
    }
    return value;
  };
  let bestIndex: number | undefined;
  for (const index of selectionIndices) {
    if (index === approvedIndex) continue;
    const challenger = roots[index];
    if (
      challenger === undefined ||
      !isWhiteSpiritProgressWindowPair(game, challenger, approved, config) ||
      challenger.rootRank > approved.rootRank + 8
    ) {
      continue;
    }
    const challengerSnapshot = snapshot(index);
    const challengerFollowup = followup(index);
    if (challengerSnapshot === undefined || challengerFollowup === undefined)
      continue;
    const progressBetter = replyRiskAdvisorPolicy.rootProgressOrSetupBetter(
      challenger,
      approved,
    );
    const weakCompetition =
      weakWindow &&
      progressBetter &&
      challenger.score >= saturatingSubI32(approved.score, 32);
    const utilityCompetition =
      utilityCompetes(
        rootUtility(game, challenger, perspective, config),
        approvedUtility,
      ) || progressBetter;
    if (
      challengerSnapshot.allowsImmediateOpponentWin ||
      challengerSnapshot.opponentReachesMatchPoint ||
      (!weakCompetition && !utilityCompetition) ||
      (!weakCompetition &&
        saturatingAddI32(challengerSnapshot.worstReplyScore, 192) <
          approvedSnapshot.worstReplyScore) ||
      (!weakCompetition &&
        saturatingAddI32(challengerFollowup, 32) < approvedFollowup)
    ) {
      continue;
    }
    if (bestIndex === undefined) bestIndex = index;
    else {
      const currentSnapshot = snapshot(bestIndex);
      const currentFollowup = followup(bestIndex);
      if (
        currentSnapshot === undefined ||
        currentFollowup === undefined ||
        challengerFollowup > currentFollowup ||
        (challengerFollowup === currentFollowup &&
          challengerSnapshot.worstReplyScore >
            currentSnapshot.worstReplyScore) ||
        (challengerFollowup === currentFollowup &&
          challengerSnapshot.worstReplyScore ===
            currentSnapshot.worstReplyScore &&
          compareRankedRootEvaluationIndices(roots, index, bestIndex) < 0)
      ) {
        bestIndex = index;
      }
    }
  }
  return bestIndex;
}

function whiteActionManaClusterOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber < 5 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    !hasProgressSurface(approved) ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
      !challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      rootIsNonTactical(challenger) &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !advisorRootIsUnsafe(challenger) &&
      sameFirstInput(challenger.inputs, approved.inputs) &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      challenger.safeSupermanaProgressSteps <=
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps <=
        approved.safeOpponentManaProgressSteps &&
      challenger.score >= approved.score,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function whiteFollowupManaOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount < 2 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    selectionIndices.length !== 1 ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !approved.spiritOwnManaSetupNow ||
    approved.spiritSameTurnScoreSetupNow ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  const approvedUtility = rootUtility(game, approved, perspective, config);
  return bestOverrideIndex(
    roots,
    roots.map((_root, index) => index),
    (root, index) => {
      if (
        index === approvedIndex ||
        advisorRootFamily(root) !== TurnPlanFamily.ManaTempo ||
        root.spiritDevelopment ||
        root.spiritSameTurnScoreSetupNow ||
        root.spiritOwnManaSetupNow ||
        root.ownDrainerVulnerable ||
        root.ownDrainerWalkVulnerable ||
        !rootIsNonTactical(root) ||
        root.sameTurnScoreWindowValue !== 0 ||
        advisorRootIsUnsafe(root) ||
        root.rootRank > approved.rootRank + 2 ||
        root.safeSupermanaProgressSteps > approved.safeSupermanaProgressSteps ||
        root.safeOpponentManaProgressSteps >
          approved.safeOpponentManaProgressSteps ||
        root.scorePathBestSteps > approved.scorePathBestSteps
      ) {
        return false;
      }
      return (
        compareUtilityPrimaryAxes(
          rootUtility(game, root, perspective, config),
          approvedUtility,
        ) > 0 || root.score >= saturatingAddI32(approved.score, 512)
      );
    },
    (left, right) => compareRankedRootEvaluationIndices(roots, left, right),
  );
}

function blackLateWindowManaSafetyOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 8 ||
    game.monsMovesCount === 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    !isNonConcreteManaWindowRoot(approved) ||
    !approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable
  ) {
    return undefined;
  }
  const approvedProgress = hasProgressSurface(approved);
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) => {
      const progress = hasProgressSurface(challenger);
      const progressBetter =
        replyRiskAdvisorPolicy.rootProgressOrSetupBetter(
          challenger,
          approved,
        ) ||
        (progress && !approvedProgress);
      return (
        index !== approvedIndex &&
        advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
        sameFirstInput(challenger.inputs, approved.inputs) &&
        challenger.sameTurnScoreWindowValue === 0 &&
        !challenger.ownDrainerVulnerable &&
        !challenger.ownDrainerWalkVulnerable &&
        rootIsNonTactical(challenger) &&
        !advisorRootIsUnsafe(challenger) &&
        (approved.rootRank > 0 || progressBetter) &&
        saturatingSubI32(approved.score, challenger.score) <= 32 &&
        challenger.rootRank <= approved.rootRank + 2
      );
    },
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function blackLateWindowCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 8 ||
    game.monsMovesCount < 3 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  if (
    exact.delta.sameTurnScoreWindowValue === 0 &&
    exact.delta.opponentWindowDenyGain === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    approved.sameTurnScoreWindowValue !== 0 ||
    !rootIsNonTactical(approved) ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    roots.map((_root, index) => index),
    (root, index) =>
      index !== approvedIndex &&
      advisorRootFamily(root) === TurnPlanFamily.ManaTempo &&
      isNonConcreteManaWindowRoot(root) &&
      root.rootRank === 0 &&
      root.ownDrainerVulnerable &&
      !root.ownDrainerWalkVulnerable &&
      saturatingSubI32(approved.score, root.score) <= 256,
    (left, right) => compareRankedRootEvaluationIndices(roots, left, right),
  );
}

function blackLateRecoveryProgressCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    game.turnNumber < 12 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.DrainerSafetyRecovery ||
    !approved.spiritDevelopment ||
    !hasProgressSurface(approved) ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.sameTurnScoreWindowValue > 0 ||
    !rootIsNonTactical(approved) ||
    advisorRootIsUnsafe(approved) ||
    approved.inputs.length < 3
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      hasProgressSurface(challenger) &&
      rootIsNonTactical(challenger) &&
      challenger.sameTurnScoreWindowValue === 0 &&
      challenger.inputs.length >= 3 &&
      sameInputAt(challenger.inputs, approved.inputs, 0) &&
      sameInputAt(challenger.inputs, approved.inputs, 1) &&
      saturatingSubI32(approved.score, challenger.score) <= 1_024 &&
      challenger.rootRank <= approved.rootRank + 2 &&
      replyRiskAdvisorPolicy.rootProgressOrSetupBetter(challenger, approved),
    (left, right) => compareRankedRootEvaluationIndices(roots, left, right),
  );
}

function whiteSetupProgressCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber < 5 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    !hasProgressSurface(approved) ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  const replyLimit = replyLimitForRoots(selectionIndices.length, config);
  const approvedSnapshot = rootReplyRiskSnapshot(
    approved.game,
    perspective,
    config,
    replyLimit,
  );
  if (
    approvedSnapshot.allowsImmediateOpponentWin ||
    approvedSnapshot.opponentReachesMatchPoint
  ) {
    return undefined;
  }
  const utilities = new Map<number, ReturnType<typeof rootUtility>>();
  const snapshots = new Map([[approvedIndex, approvedSnapshot]]);
  const followups = new Map<number, number>();
  const utility = (index: number) => {
    let value = utilities.get(index);
    const root = roots[index];
    if (value === undefined && root !== undefined) {
      value = rootUtility(game, root, perspective, config);
      utilities.set(index, value);
    }
    return value;
  };
  const snapshot = (index: number) => {
    let value = snapshots.get(index);
    const root = roots[index];
    if (value === undefined && root !== undefined) {
      value = rootReplyRiskSnapshot(root.game, perspective, config, replyLimit);
      snapshots.set(index, value);
    }
    return value;
  };
  const followup = (index: number) => {
    let value = followups.get(index);
    const root = roots[index];
    if (value === undefined && root !== undefined) {
      value = replyRiskAdvisorPolicy.spiritFollowupFloorScore(
        root.game,
        perspective,
        config,
      );
      followups.set(index, value);
    }
    return value;
  };
  const approvedUtility = utility(approvedIndex);
  const approvedFollowup = followup(approvedIndex);
  if (approvedUtility === undefined || approvedFollowup === undefined)
    return undefined;
  let bestIndex: number | undefined;
  for (const index of selectionIndices) {
    if (index === approvedIndex) continue;
    const challenger = roots[index];
    if (
      challenger === undefined ||
      advisorRootFamily(challenger) !== TurnPlanFamily.SpiritImpact ||
      !challenger.spiritOwnManaSetupNow ||
      challenger.spiritSameTurnScoreSetupNow ||
      !hasProgressSurface(challenger) ||
      !advisorRootIsSafe(challenger) ||
      !rootIsNonTactical(challenger) ||
      challenger.sameTurnScoreWindowValue > 0 ||
      !sameFirstInput(challenger.inputs, approved.inputs) ||
      challenger.ownDrainerVulnerable !== approved.ownDrainerVulnerable ||
      challenger.ownDrainerWalkVulnerable !== approved.ownDrainerWalkVulnerable
    ) {
      continue;
    }
    const strictCompetition =
      challenger.safeSupermanaProgressSteps ===
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps ===
        approved.safeOpponentManaProgressSteps &&
      challenger.manaHandoffToOpponent === approved.manaHandoffToOpponent &&
      challenger.hasRoundtrip === approved.hasRoundtrip &&
      saturatingSubI32(approved.score, challenger.score) <= 64 &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 32) &&
      challenger.rootRank <= approved.rootRank + 2;
    const challengerUtility = utility(index);
    const challengerSnapshot = snapshot(index);
    const challengerFollowup = followup(index);
    if (
      challengerUtility === undefined ||
      challengerSnapshot === undefined ||
      challengerFollowup === undefined
    ) {
      continue;
    }
    const followupCompetition =
      !challengerSnapshot.allowsImmediateOpponentWin &&
      !challengerSnapshot.opponentReachesMatchPoint &&
      saturatingSubI32(approved.score, challenger.score) <= 128 &&
      saturatingAddI32(challengerSnapshot.worstReplyScore, 320) >=
        approvedSnapshot.worstReplyScore &&
      saturatingAddI32(challengerFollowup, 32) >= approvedFollowup &&
      challenger.rootRank <= approved.rootRank + 4 &&
      (utilityCompetes(challengerUtility, approvedUtility) ||
        replyRiskAdvisorPolicy.rootProgressOrSetupBetter(challenger, approved));
    if (!strictCompetition && !followupCompetition) continue;
    if (bestIndex === undefined) {
      bestIndex = index;
      continue;
    }
    const current = roots[bestIndex];
    const currentUtility = utility(bestIndex);
    const currentSnapshot = snapshot(bestIndex);
    const currentFollowup = followup(bestIndex);
    if (
      current === undefined ||
      currentUtility === undefined ||
      currentSnapshot === undefined ||
      currentFollowup === undefined
    ) {
      bestIndex = index;
      continue;
    }
    const utilityOrder = compareUtilityPrimaryAxes(
      challengerUtility,
      currentUtility,
    );
    const replace =
      utilityOrder > 0 ||
      (utilityOrder >= 0 && challengerFollowup > currentFollowup) ||
      (utilityOrder >= 0 &&
        challengerFollowup === currentFollowup &&
        challengerSnapshot.worstReplyScore > currentSnapshot.worstReplyScore) ||
      (challengerFollowup === currentFollowup &&
        challengerSnapshot.worstReplyScore ===
          currentSnapshot.worstReplyScore &&
        challenger.spiritSetupGain > current.spiritSetupGain) ||
      (challengerFollowup === currentFollowup &&
        challengerSnapshot.worstReplyScore ===
          currentSnapshot.worstReplyScore &&
        challenger.spiritSetupGain === current.spiritSetupGain &&
        compareRankedRootEvaluationIndices(roots, index, bestIndex) < 0);
    if (replace) bestIndex = index;
  }
  return bestIndex;
}

function whiteEarlyFollowupSetupCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount !== 1 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !isPlainSpiritDevelopmentRoot(approved) ||
    !hasProgressSurface(approved) ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritOwnManaSetupNow &&
      !challenger.spiritSameTurnScoreSetupNow &&
      hasProgressSurface(challenger) &&
      rootIsNonTactical(challenger) &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !advisorRootIsUnsafe(challenger) &&
      sameFirstInput(challenger.inputs, approved.inputs) &&
      challenger.supermanaProgress === approved.supermanaProgress &&
      challenger.opponentManaProgress === approved.opponentManaProgress &&
      challenger.safeSupermanaProgressSteps ===
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps ===
        approved.safeOpponentManaProgressSteps &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      saturatingSubI32(approved.score, challenger.score) <= 64 &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 32) &&
      challenger.rootRank <= approved.rootRank + 4,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function whiteEarlySetupSiblingProgressOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount !== 1 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0 ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !approved.spiritOwnManaSetupNow ||
    approved.spiritSameTurnScoreSetupNow ||
    !hasProgressSurface(approved) ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    roots.map((_root, index) => index),
    (challenger, index) => {
      const strictImprovement =
        challenger.safeSupermanaProgressSteps <
          approved.safeSupermanaProgressSteps ||
        challenger.safeOpponentManaProgressSteps <
          approved.safeOpponentManaProgressSteps ||
        challenger.spiritSetupGain > approved.spiritSetupGain;
      return (
        index !== approvedIndex &&
        advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
        challenger.spiritOwnManaSetupNow &&
        !challenger.spiritSameTurnScoreSetupNow &&
        hasProgressSurface(challenger) &&
        rootIsNonTactical(challenger) &&
        challenger.sameTurnScoreWindowValue === 0 &&
        !advisorRootIsUnsafe(challenger) &&
        sameFirstInput(challenger.inputs, approved.inputs) &&
        challenger.supermanaProgress === approved.supermanaProgress &&
        challenger.opponentManaProgress === approved.opponentManaProgress &&
        challenger.safeSupermanaProgressSteps <=
          approved.safeSupermanaProgressSteps &&
        challenger.safeOpponentManaProgressSteps <=
          approved.safeOpponentManaProgressSteps &&
        challenger.scorePathBestSteps <= approved.scorePathBestSteps &&
        challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
        challenger.ownDrainerWalkVulnerable ===
          approved.ownDrainerWalkVulnerable &&
        challenger.score >= saturatingSubI32(approved.score, 64) &&
        challenger.rootRank <= approved.rootRank + 8 &&
        strictImprovement
      );
    },
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      const leftStepDelta = saturatingSubI32(
        approved.safeSupermanaProgressSteps,
        leftRoot.safeSupermanaProgressSteps,
      );
      const rightStepDelta = saturatingSubI32(
        approved.safeSupermanaProgressSteps,
        rightRoot.safeSupermanaProgressSteps,
      );
      if (leftStepDelta !== rightStepDelta)
        return leftStepDelta > rightStepDelta ? -1 : 1;
      const leftSetupDelta = saturatingSubI32(
        approved.spiritSetupGain,
        leftRoot.spiritSetupGain,
      );
      const rightSetupDelta = saturatingSubI32(
        approved.spiritSetupGain,
        rightRoot.spiritSetupGain,
      );
      if (leftSetupDelta !== rightSetupDelta)
        return leftSetupDelta > rightSetupDelta ? -1 : 1;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function whiteEarlyNoActionProgressCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount !== 1 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    !approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable ||
    !rootIsNonTactical(approved) ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.sameTurnScoreWindowValue > 0
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      [
        TurnPlanFamily.SafeSupermanaProgress,
        TurnPlanFamily.SafeOpponentManaProgress,
      ].includes(advisorRootFamily(challenger)) &&
      !challenger.ownDrainerVulnerable &&
      !challenger.ownDrainerWalkVulnerable &&
      rootIsNonTactical(challenger) &&
      !challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      challenger.sameTurnScoreWindowValue === 0 &&
      challenger.supermanaProgress === approved.supermanaProgress &&
      challenger.opponentManaProgress === approved.opponentManaProgress &&
      challenger.safeSupermanaProgressSteps ===
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps ===
        approved.safeOpponentManaProgressSteps &&
      challenger.score >= saturatingSubI32(approved.score, 32),
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function whiteManaOnlyCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber < 5 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    !approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable ||
    !rootIsNonTactical(approved) ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.sameTurnScoreWindowValue > 0
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.ManaTempo &&
      !challenger.ownDrainerVulnerable &&
      !challenger.ownDrainerWalkVulnerable &&
      !challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      challenger.sameTurnScoreWindowValue === 0 &&
      rootIsNonTactical(challenger) &&
      !advisorRootIsUnsafe(challenger) &&
      saturatingSubI32(approved.score, challenger.score) <= 64 &&
      Math.abs(approved.rootRank - challenger.rootRank) <= 6,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function whiteTurnThreeSafeProgressSurfaceOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount !== 0 ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    advisorRootIsUnsafe(approved) ||
    !rootIsNonTactical(approved) ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.sameTurnScoreWindowValue > 0
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      [
        TurnPlanFamily.SafeSupermanaProgress,
        TurnPlanFamily.SafeOpponentManaProgress,
      ].includes(advisorRootFamily(challenger)) &&
      !advisorRootIsUnsafe(challenger) &&
      rootIsNonTactical(challenger) &&
      !challenger.spiritDevelopment &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !challenger.spiritOwnManaSetupNow &&
      challenger.sameTurnScoreWindowValue === 0 &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      challenger.manaHandoffToOpponent === approved.manaHandoffToOpponent &&
      challenger.hasRoundtrip === approved.hasRoundtrip &&
      challenger.rootRank < approved.rootRank &&
      challenger.score >= saturatingSubI32(approved.score, 32) &&
      replyRiskAdvisorPolicy.rootProgressOrSetupBetter(challenger, approved),
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

type NoActionRecoveryPolicy = {
  readonly color: Color;
  readonly turnNumber: number;
  readonly monsMoves:
    | { readonly kind: "exact"; readonly count: number }
    | { readonly kind: "minimum"; readonly count: number };
  readonly rejectDrainerAttack: boolean;
  readonly requireSameProgressSteps: boolean;
};

function noActionRecoveryOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  approvedIndex: number,
  policy: NoActionRecoveryPolicy,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== policy.color ||
    game.turnNumber !== policy.turnNumber ||
    (policy.monsMoves.kind === "exact"
      ? game.monsMovesCount !== policy.monsMoves.count
      : game.monsMovesCount < policy.monsMoves.count) ||
    game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  if (
    exact.delta.sameTurnScoreWindowValue > 1 ||
    exact.delta.opponentWindowDenyGain > 1 ||
    (exact.delta.sameTurnScoreWindowValue === 0 &&
      exact.delta.opponentWindowDenyGain === 0) ||
    (policy.rejectDrainerAttack && exact.delta.drainerAttackAvailable) ||
    exact.delta.drainerSafety >= 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    !isNonConcreteManaWindowRoot(approved) ||
    !approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    roots.map((_root, index) => index),
    (root, index) =>
      index !== approvedIndex &&
      advisorRootFamily(root) === TurnPlanFamily.DrainerSafetyRecovery &&
      root.classes.drainerSafetyRecover &&
      !advisorRootIsUnsafe(root) &&
      !root.ownDrainerVulnerable &&
      !root.ownDrainerWalkVulnerable &&
      !root.spiritDevelopment &&
      !root.spiritSameTurnScoreSetupNow &&
      !root.spiritOwnManaSetupNow &&
      rootIsNonTactical(root) &&
      root.sameTurnScoreWindowValue === 0 &&
      sameFirstInput(root.inputs, approved.inputs) &&
      (!policy.requireSameProgressSteps ||
        (root.safeSupermanaProgressSteps ===
          approved.safeSupermanaProgressSteps &&
          root.safeOpponentManaProgressSteps ===
            approved.safeOpponentManaProgressSteps)) &&
      root.rootRank <= approved.rootRank &&
      root.scorePathBestSteps > approved.scorePathBestSteps,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function whiteTurnThreeNoActionRecoveryOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  return noActionRecoveryOverride(
    game,
    roots,
    approvedIndex,
    {
      color: Color.White,
      turnNumber: 3,
      monsMoves: { kind: "exact", count: 0 },
      rejectDrainerAttack: false,
      requireSameProgressSteps: false,
    },
    config,
  );
}

function blackTurnFourWeakWindowRecoveryOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  return noActionRecoveryOverride(
    game,
    roots,
    approvedIndex,
    {
      color: Color.Black,
      turnNumber: 4,
      monsMoves: { kind: "minimum", count: 1 },
      rejectDrainerAttack: true,
      requireSameProgressSteps: true,
    },
    config,
  );
}

function whiteEarlySafeProgressSetupCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount !== 1 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(advisorRootFamily(approved)) ||
    advisorRootIsUnsafe(approved) ||
    !rootIsNonTactical(approved) ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    approved.sameTurnScoreWindowValue > 0
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) => {
      const rankRescue =
        saturatingSubI32(approved.score, challenger.score) <= 160 &&
        challenger.spiritSetupGain >=
          saturatingAddI32(approved.spiritSetupGain, 64) &&
        challenger.safeSupermanaProgressSteps ===
          approved.safeSupermanaProgressSteps &&
        challenger.safeOpponentManaProgressSteps ===
          approved.safeOpponentManaProgressSteps &&
        challenger.rootRank + 6 <= approved.rootRank;
      return (
        index !== approvedIndex &&
        advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
        challenger.spiritOwnManaSetupNow &&
        !challenger.spiritSameTurnScoreSetupNow &&
        hasProgressSurface(challenger) &&
        !advisorRootIsUnsafe(challenger) &&
        rootIsNonTactical(challenger) &&
        challenger.sameTurnScoreWindowValue === 0 &&
        challenger.manaHandoffToOpponent === approved.manaHandoffToOpponent &&
        challenger.hasRoundtrip === approved.hasRoundtrip &&
        challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
        challenger.ownDrainerWalkVulnerable ===
          approved.ownDrainerWalkVulnerable &&
        (saturatingSubI32(approved.score, challenger.score) <= 32 ||
          rankRescue) &&
        challenger.spiritSetupGain >=
          saturatingAddI32(approved.spiritSetupGain, 64) &&
        challenger.safeSupermanaProgressSteps <=
          approved.safeSupermanaProgressSteps &&
        challenger.safeOpponentManaProgressSteps <=
          approved.safeOpponentManaProgressSteps &&
        challenger.rootRank <= approved.rootRank + 4
      );
    },
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.spiritSetupGain !== rightRoot.spiritSetupGain)
        return leftRoot.spiritSetupGain < rightRoot.spiritSetupGain ? -1 : 1;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function whiteEarlySetupCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber !== 3 ||
    game.monsMovesCount !== 1 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    selectionIndices.length !== 1 ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.SpiritImpact ||
    !approved.spiritOwnManaSetupNow ||
    approved.spiritSameTurnScoreSetupNow ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved)
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  if (exact.delta.sameTurnScoreWindowValue === 0) return undefined;
  return bestOverrideIndex(
    roots,
    roots.map((_root, index) => index),
    (root, index) =>
      index !== approvedIndex &&
      advisorRootFamily(root) === TurnPlanFamily.ManaTempo &&
      !root.ownDrainerVulnerable &&
      !root.ownDrainerWalkVulnerable &&
      !root.spiritDevelopment &&
      !root.spiritSameTurnScoreSetupNow &&
      !root.spiritOwnManaSetupNow &&
      root.sameTurnScoreWindowValue === 0 &&
      rootIsNonTactical(root) &&
      !advisorRootIsUnsafe(root),
    (left, right) => compareRankedRootEvaluationIndices(roots, left, right),
  );
}

function isLateWhiteSpiritFollowupSafeProgressPair(
  game: MonsGame,
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
  config: AutomoveSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    game.activeColor === Color.White &&
    game.turnNumber >= 8 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana() &&
    advisorRootFamily(candidate) === TurnPlanFamily.SpiritImpact &&
    candidate.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    candidate.sameTurnScoreWindowValue === 0 &&
    rootIsNonTactical(candidate) &&
    !advisorRootIsUnsafe(candidate) &&
    [TurnPlanFamily.SafeSupermanaProgress, TurnPlanFamily.ManaTempo].includes(
      advisorRootFamily(incumbent),
    ) &&
    !incumbent.spiritDevelopment &&
    incumbent.sameTurnScoreWindowValue === 0 &&
    rootIsNonTactical(incumbent) &&
    !advisorRootIsUnsafe(incumbent) &&
    sameFirstInput(candidate.inputs, incumbent.inputs)
  );
}

function whiteLateFollowupCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.White ||
    game.turnNumber < 8 ||
    game.monsMovesCount !== 0 ||
    !game.playerCanUseAction() ||
    !game.playerCanMoveMana() ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    ![TurnPlanFamily.SafeSupermanaProgress, TurnPlanFamily.ManaTempo].includes(
      advisorRootFamily(approved),
    )
  ) {
    return undefined;
  }
  const candidates = roots
    .map((_root, index) => index)
    .filter((index) => {
      const challenger = roots[index];
      return (
        index !== approvedIndex &&
        challenger !== undefined &&
        isLateWhiteSpiritFollowupSafeProgressPair(
          game,
          challenger,
          approved,
          config,
        ) &&
        saturatingSubI32(approved.score, challenger.score) <= 512 &&
        Math.abs(approved.rootRank - challenger.rootRank) <= 10
      );
    });
  const hasOwnSetup = candidates.some(
    (index) => roots[index]?.spiritOwnManaSetupNow === true,
  );
  return candidates.sort((left, right) => {
    const leftRoot = roots[left];
    const rightRoot = roots[right];
    if (leftRoot === undefined || rightRoot === undefined) return left - right;
    if (
      hasOwnSetup &&
      leftRoot.spiritOwnManaSetupNow !== rightRoot.spiritOwnManaSetupNow
    ) {
      return leftRoot.spiritOwnManaSetupNow ? -1 : 1;
    }
    if (hasOwnSetup && leftRoot.spiritSetupGain !== rightRoot.spiritSetupGain) {
      return leftRoot.spiritSetupGain > rightRoot.spiritSetupGain ? -1 : 1;
    }
    return compareRootRankThenRanked(roots, left, right);
  })[0];
}

function isLateBlackActionManaTurnStart(game: MonsGame): boolean {
  return (
    game.activeColor === Color.Black &&
    game.turnNumber >= 8 &&
    game.monsMovesCount === 0 &&
    game.playerCanUseAction() &&
    game.playerCanMoveMana()
  );
}

function isLateBlackSpiritFollowupManaPair(
  game: MonsGame,
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
  config: AutomoveSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    isLateBlackActionManaTurnStart(game) &&
    advisorRootFamily(candidate) === TurnPlanFamily.SpiritImpact &&
    candidate.spiritDevelopment &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow &&
    candidate.sameTurnScoreWindowValue === 0 &&
    rootIsNonTactical(candidate) &&
    !advisorRootIsUnsafe(candidate) &&
    advisorRootFamily(incumbent) === TurnPlanFamily.ManaTempo &&
    incumbent.sameTurnScoreWindowValue === 0 &&
    rootIsNonTactical(incumbent) &&
    !advisorRootIsUnsafe(incumbent) &&
    sameFirstInput(candidate.inputs, incumbent.inputs)
  );
}

function blackLateFollowupCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    !isLateBlackActionManaTurnStart(game) ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    selectionIndices,
    (challenger, index) =>
      index !== approvedIndex &&
      isLateBlackSpiritFollowupManaPair(game, challenger, approved, config) &&
      saturatingSubI32(approved.score, challenger.score) <= 512 &&
      challenger.rootRank < approved.rootRank &&
      Math.abs(approved.rootRank - challenger.rootRank) <= 16,
    (left, right) => compareRootRankThenRanked(roots, left, right),
  );
}

function blackLateReplyRiskSetupOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  replyRiskShortlist: readonly number[],
  approvedIndex: number,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    !isLateBlackActionManaTurnStart(game) ||
    replyRiskShortlist.length === 0 ||
    roots.length === 0 ||
    !exactContextIsQuiet(game)
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    hasProgressSurface(approved) ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved) ||
    approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable
  ) {
    return undefined;
  }
  return bestOverrideIndex(
    roots,
    replyRiskShortlist,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritOwnManaSetupNow &&
      !challenger.spiritSameTurnScoreSetupNow &&
      !hasProgressSurface(challenger) &&
      rootIsNonTactical(challenger) &&
      challenger.sameTurnScoreWindowValue === 0 &&
      !advisorRootIsUnsafe(challenger) &&
      !challenger.ownDrainerVulnerable &&
      !challenger.ownDrainerWalkVulnerable &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 64) &&
      saturatingSubI32(approved.score, challenger.score) <= 2_048 &&
      challenger.safeSupermanaProgressSteps ===
        approved.safeSupermanaProgressSteps &&
      challenger.safeOpponentManaProgressSteps ===
        approved.safeOpponentManaProgressSteps &&
      challenger.scorePathBestSteps === approved.scorePathBestSteps &&
      challenger.rootRank < approved.rootRank &&
      Math.abs(approved.rootRank - challenger.rootRank) <= 4,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      if (leftRoot.spiritSetupGain !== rightRoot.spiritSetupGain)
        return leftRoot.spiritSetupGain > rightRoot.spiritSetupGain ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function blackLateWeakWindowSafeProgressSetupOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  replyRiskShortlist: readonly number[],
  approvedIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    !isLateBlackActionManaTurnStart(game) ||
    replyRiskShortlist.length === 0 ||
    roots.length === 0
  ) {
    return undefined;
  }
  const exact = exactOpportunityContext(game, game.activeColor);
  const weakWindow =
    exact.delta.sameTurnScoreWindowValue <= 1 &&
    exact.delta.opponentWindowDenyGain <= 1 &&
    !exact.delta.drainerAttackAvailable &&
    (exact.delta.sameTurnScoreWindowValue > 0 ||
      exact.delta.opponentWindowDenyGain > 0);
  if (!weakWindow) return undefined;
  const approved = roots[approvedIndex];
  if (approved === undefined) return undefined;
  const approvedFamily = advisorRootFamily(approved);
  if (
    ![
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(approvedFamily) ||
    !hasProgressSurface(approved) ||
    approved.spiritDevelopment ||
    approved.spiritSameTurnScoreSetupNow ||
    approved.spiritOwnManaSetupNow ||
    !rootIsNonTactical(approved) ||
    approved.sameTurnScoreWindowValue > 0 ||
    advisorRootIsUnsafe(approved) ||
    approved.ownDrainerVulnerable ||
    approved.ownDrainerWalkVulnerable
  ) {
    return undefined;
  }
  const approvedUtility = rootUtility(game, approved, perspective, config);
  return bestOverrideIndex(
    roots,
    replyRiskShortlist,
    (challenger, index) =>
      index !== approvedIndex &&
      advisorRootFamily(challenger) === TurnPlanFamily.SpiritImpact &&
      challenger.spiritOwnManaSetupNow &&
      !challenger.spiritSameTurnScoreSetupNow &&
      hasProgressSurface(challenger) &&
      rootIsNonTactical(challenger) &&
      challenger.sameTurnScoreWindowValue === 0 &&
      challenger.manaHandoffToOpponent === approved.manaHandoffToOpponent &&
      challenger.hasRoundtrip === approved.hasRoundtrip &&
      !advisorRootIsUnsafe(challenger) &&
      challenger.ownDrainerVulnerable === approved.ownDrainerVulnerable &&
      challenger.ownDrainerWalkVulnerable ===
        approved.ownDrainerWalkVulnerable &&
      challenger.supermanaProgress === approved.supermanaProgress &&
      challenger.opponentManaProgress === approved.opponentManaProgress &&
      utilityCompetes(
        rootUtility(game, challenger, perspective, config),
        approvedUtility,
      ) &&
      saturatingSubI32(approved.score, challenger.score) <= 32 &&
      challenger.spiritSetupGain >=
        saturatingAddI32(approved.spiritSetupGain, 64) &&
      challenger.rootRank <= approved.rootRank + 4,
    (left, right) => {
      const leftRoot = roots[left];
      const rightRoot = roots[right];
      if (leftRoot === undefined || rightRoot === undefined)
        return left - right;
      if (leftRoot.score !== rightRoot.score)
        return leftRoot.score > rightRoot.score ? -1 : 1;
      if (leftRoot.spiritSetupGain !== rightRoot.spiritSetupGain)
        return leftRoot.spiritSetupGain > rightRoot.spiritSetupGain ? -1 : 1;
      if (leftRoot.rootRank !== rightRoot.rootRank)
        return leftRoot.rootRank < rightRoot.rootRank ? -1 : 1;
      return compareRankedRootEvaluationIndices(roots, left, right);
    },
  );
}

function isBlackPlainSpiritFollowupSetupPair(
  game: MonsGame,
  plain: RootEvaluation,
  setup: RootEvaluation,
  config: AutomoveSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    isPlainSpiritDevelopmentRoot(plain) &&
    setup.spiritOwnManaSetupNow &&
    !setup.spiritSameTurnScoreSetupNow &&
    sameFirstInput(plain.inputs, setup.inputs) &&
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

function isBlackSpiritProgressWindowPair(
  game: MonsGame,
  spirit: RootEvaluation,
  mana: RootEvaluation,
  config: AutomoveSearchConfig,
): boolean {
  return (
    currentProEnabled(config) &&
    game.activeColor === Color.Black &&
    game.turnNumber <= 4 &&
    advisorRootFamily(spirit) === TurnPlanFamily.SpiritImpact &&
    !spirit.spiritSameTurnScoreSetupNow &&
    !spirit.spiritOwnManaSetupNow &&
    hasProgressSurface(spirit) &&
    !spirit.winsImmediately &&
    !spirit.attacksOpponentDrainer &&
    !spirit.scoresSupermanaThisTurn &&
    !spirit.scoresOpponentManaThisTurn &&
    !spirit.safeSupermanaPickupNow &&
    !spirit.safeOpponentManaPickupNow &&
    !spirit.manaHandoffToOpponent &&
    !spirit.hasRoundtrip &&
    isNonConcreteManaWindowRoot(mana) &&
    spirit.ownDrainerVulnerable === mana.ownDrainerVulnerable &&
    spirit.ownDrainerWalkVulnerable === mana.ownDrainerWalkVulnerable
  );
}

function blackFamilyCompetitionOverride(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  replyRiskShortlist: readonly number[],
  selectionIndices: readonly number[],
  approvedIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  if (
    !currentProEnabled(config) ||
    game.activeColor !== Color.Black ||
    roots.length === 0
  ) {
    return undefined;
  }
  const approved = roots[approvedIndex];
  if (
    approved === undefined ||
    advisorRootFamily(approved) !== TurnPlanFamily.ManaTempo ||
    (approvedIndex > 1 &&
      !(
        game.turnNumber <= 2 &&
        game.playerCanUseAction() &&
        game.playerCanMoveMana()
      ))
  ) {
    return undefined;
  }
  const approvedNonConcreteWindow = isNonConcreteManaWindowRoot(approved);
  if (
    approved.winsImmediately ||
    approved.attacksOpponentDrainer ||
    (approved.sameTurnScoreWindowValue > 0 && !approvedNonConcreteWindow) ||
    approved.scoresSupermanaThisTurn ||
    approved.scoresOpponentManaThisTurn ||
    approved.safeSupermanaPickupNow ||
    approved.safeOpponentManaPickupNow
  ) {
    return undefined;
  }
  const approvedUtility = replyRiskAdvisorPolicy.turnEngineRootPlanUtility(
    game,
    approved,
    perspective,
    config,
    TurnPlanFamily.ManaTempo,
  );
  const approvedUnsafe = advisorRootIsUnsafe(approved);
  const approvedProgress = hasProgressSurface(approved);
  const replyLimit = replyLimitForRoots(replyRiskShortlist.length, config);
  const snapshots = new Map<number, ReturnType<typeof rootReplyRiskSnapshot>>();
  const followups = new Map<number, number>();
  const snapshot = (index: number) => {
    let value = snapshots.get(index);
    const root = roots[index];
    if (value === undefined && root !== undefined) {
      value = rootReplyRiskSnapshot(root.game, perspective, config, replyLimit);
      snapshots.set(index, value);
    }
    return value;
  };
  const followup = (index: number) => {
    let value = followups.get(index);
    const root = roots[index];
    if (value === undefined && root !== undefined) {
      value = replyRiskAdvisorPolicy.spiritFollowupFloorScore(
        root.game,
        perspective,
        config,
      );
      followups.set(index, value);
    }
    return value;
  };
  const qualifyingIndices: number[] = [];
  for (const index of selectionIndices) {
    if (index === approvedIndex) continue;
    const candidate = roots[index];
    if (candidate === undefined) continue;
    const family = advisorRootFamily(candidate);
    const concreteSpiritSetup =
      candidate.spiritOwnManaSetupNow || candidate.spiritSameTurnScoreSetupNow;
    const spiritProgressFamily =
      family === TurnPlanFamily.SpiritImpact &&
      !concreteSpiritSetup &&
      hasProgressSurface(candidate);
    const progressFamily = [
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ].includes(family);
    const progressFamilyAllowed = progressFamily && !approvedNonConcreteWindow;
    const concreteSpiritSetupAllowed =
      concreteSpiritSetup && !approvedNonConcreteWindow && game.turnNumber <= 4;
    if (
      !concreteSpiritSetupAllowed &&
      !progressFamilyAllowed &&
      !spiritProgressFamily
    ) {
      continue;
    }
    const candidateUtility = rootUtility(game, candidate, perspective, config);
    const progress = hasProgressSurface(candidate);
    const progressBetter =
      replyRiskAdvisorPolicy.rootProgressOrSetupBetter(candidate, approved) ||
      (progress && !approvedProgress);
    const approvedSafeManaBlocksPlainSpiritProgress =
      family === TurnPlanFamily.SpiritImpact &&
      !approvedUnsafe &&
      !advisorRootIsUnsafe(candidate) &&
      advisorRootFamily(approved) === TurnPlanFamily.ManaTempo &&
      !approvedProgress &&
      !approved.spiritDevelopment &&
      !approved.spiritSameTurnScoreSetupNow &&
      !approved.spiritOwnManaSetupNow &&
      candidate.spiritDevelopment &&
      !candidate.spiritSameTurnScoreSetupNow &&
      !candidate.spiritOwnManaSetupNow &&
      progress &&
      !candidate.winsImmediately &&
      !candidate.attacksOpponentDrainer &&
      !candidate.scoresSupermanaThisTurn &&
      !candidate.scoresOpponentManaThisTurn &&
      !candidate.safeSupermanaPickupNow &&
      !candidate.safeOpponentManaPickupNow &&
      !candidate.manaHandoffToOpponent &&
      !candidate.hasRoundtrip &&
      candidate.sameTurnScoreWindowValue === 0 &&
      candidate.score <= approved.score;
    if (approvedSafeManaBlocksPlainSpiritProgress) continue;
    const earlyBlackProgressScoreOverride =
      progressFamilyAllowed &&
      game.turnNumber <= 6 &&
      approved.score < 0 &&
      candidate.score >= 0 &&
      progressBetter;
    let blackSpiritProgressWindowReplyOverride = false;
    if (
      spiritProgressFamily &&
      approvedNonConcreteWindow &&
      isBlackSpiritProgressWindowPair(game, candidate, approved, config) &&
      candidate.rootRank <= approved.rootRank + 8
    ) {
      const candidateSnapshot = snapshot(index);
      const approvedSnapshot = snapshot(approvedIndex);
      const candidateFollowup = followup(index);
      const approvedFollowup = followup(approvedIndex);
      blackSpiritProgressWindowReplyOverride =
        candidateSnapshot !== undefined &&
        approvedSnapshot !== undefined &&
        candidateFollowup !== undefined &&
        approvedFollowup !== undefined &&
        !candidateSnapshot.allowsImmediateOpponentWin &&
        !approvedSnapshot.allowsImmediateOpponentWin &&
        !candidateSnapshot.opponentReachesMatchPoint &&
        !approvedSnapshot.opponentReachesMatchPoint &&
        replyRiskAdvisorPolicy.rootProgressOrSetupBetter(candidate, approved) &&
        saturatingAddI32(candidateSnapshot.worstReplyScore, 192) >=
          approvedSnapshot.worstReplyScore &&
        saturatingAddI32(candidateFollowup, 32) >= approvedFollowup;
    }
    if (
      !utilityCompetes(candidateUtility, approvedUtility) &&
      !earlyBlackProgressScoreOverride &&
      !blackSpiritProgressWindowReplyOverride
    ) {
      continue;
    }
    const candidateUnsafe = advisorRootIsUnsafe(candidate);
    if (
      candidateUnsafe &&
      !approvedUnsafe &&
      !concreteSpiritSetupAllowed &&
      !earlyBlackProgressScoreOverride &&
      !blackSpiritProgressWindowReplyOverride
    ) {
      continue;
    }
    const setupCompetes =
      concreteSpiritSetupAllowed &&
      spiritSetupCompetes(game, candidate, approved, perspective, config);
    if (
      progressBetter ||
      setupCompetes ||
      blackSpiritProgressWindowReplyOverride
    ) {
      qualifyingIndices.push(index);
    }
  }
  const mapped = qualifyingIndices.map((index) => {
    const candidate = roots[index];
    if (
      candidate === undefined ||
      !candidate.spiritOwnManaSetupNow ||
      candidate.spiritSameTurnScoreSetupNow
    ) {
      return index;
    }
    const candidateSnapshot = snapshot(index);
    if (candidateSnapshot === undefined) return index;
    const plainIndices = replyRiskShortlist.filter((plainIndex) => {
      const plain = roots[plainIndex];
      if (
        plainIndex === index ||
        plain === undefined ||
        !isBlackPlainSpiritFollowupSetupPair(game, plain, candidate, config)
      ) {
        return false;
      }
      const plainSnapshot = snapshot(plainIndex);
      return (
        plainSnapshot !== undefined &&
        (replyRiskAdvisorPolicy.blackPlainSpiritFollowupReplyOrder(
          game,
          roots,
          plainIndex,
          plainSnapshot,
          index,
          candidateSnapshot,
          perspective,
          config,
          followups,
        ) ?? 0) > 0
      );
    });
    return (
      plainIndices.sort((left, right) => {
        const leftRoot = roots[left];
        const rightRoot = roots[right];
        const leftSnapshot = snapshot(left);
        const rightSnapshot = snapshot(right);
        if (
          leftRoot === undefined ||
          rightRoot === undefined ||
          leftSnapshot === undefined ||
          rightSnapshot === undefined
        ) {
          return left - right;
        }
        if (leftSnapshot.worstReplyScore !== rightSnapshot.worstReplyScore) {
          return leftSnapshot.worstReplyScore > rightSnapshot.worstReplyScore
            ? -1
            : 1;
        }
        const leftFollowup = followup(left) ?? I32_MIN;
        const rightFollowup = followup(right) ?? I32_MIN;
        if (leftFollowup !== rightFollowup)
          return leftFollowup > rightFollowup ? -1 : 1;
        if (leftRoot.score !== rightRoot.score)
          return leftRoot.score > rightRoot.score ? -1 : 1;
        return compareRankedRootEvaluationIndices(roots, left, right);
      })[0] ?? index
    );
  });
  return mapped.sort((left, right) =>
    compareRankedRootEvaluationIndices(roots, left, right),
  )[0];
}

function addAdvisorReentry(
  roots: readonly RootEvaluation[],
  decisionEntries: CurrentProRootAdvisorEntry[],
  preserved: CurrentProRootAdvisorEntry[],
  orderedShortlist: number[],
  selectionIndices: number[],
  approvalShortlist: number[],
  index: number,
  reason = CurrentProRootAdvisorReasonCode.OmittedRootReentry,
): void {
  const root = roots[index];
  if (root === undefined) return;
  const value = entry(root, reason);
  pushUnique(preserved, value);
  if (!orderedShortlist.includes(index)) orderedShortlist.push(index);
  if (!selectionIndices.includes(index)) selectionIndices.push(index);
  if (!approvalShortlist.includes(index)) approvalShortlist.push(index);
  pushUnique(decisionEntries, value);
}

export function currentProRootAdvisorPostsearch(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  perspective: Color,
  config: AutomoveSearchConfig,
): CurrentProRootAdvisorPostsearchResult | undefined {
  if (!currentProEnabled(config) || roots.length === 0 || checkpoint()) {
    return undefined;
  }
  const coreCallbacks = buildRootPolicyCallbacks(config, false);
  let candidateIndices = filteredRootCandidateIndices(
    game,
    roots,
    perspective,
    config,
    {
      rootReplyRiskSnapshot: (
        state,
        snapshotPerspective,
        _config,
        replyLimit,
      ) =>
        rootReplyRiskSnapshot(state, snapshotPerspective, config, replyLimit),
      currentPro: coreCallbacks,
    },
  );
  if (candidateIndices.length === 0) {
    candidateIndices = roots.map((_root, index) => index);
  }
  let orderedShortlist = config.enableRootReplyRiskGuard
    ? replyRiskGuardShortlistIndices(roots, candidateIndices, config)
    : [...candidateIndices];
  if (orderedShortlist.length === 0) {
    orderedShortlist = [...candidateIndices];
  }
  const replyRiskShortlist = [...orderedShortlist];
  const approvalShortlist = [...orderedShortlist];
  const selectionIndices = [...candidateIndices];
  const decisionEntries: CurrentProRootAdvisorEntry[] = [];
  const preserved: CurrentProRootAdvisorEntry[] = [];
  for (const index of orderedShortlist) {
    const root = roots[index];
    if (root !== undefined) {
      pushUnique(
        decisionEntries,
        entry(root, CurrentProRootAdvisorReasonCode.ReplyRiskShortlist),
      );
    }
  }
  const followupScores = new Map<number, number>();
  const specs: readonly (readonly [
    CurrentProRootAdvisorReasonCode,
    (root: RootEvaluation) => boolean,
  ])[] = [
    [
      CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative,
      (root) => root.spiritSameTurnScoreSetupNow || root.spiritOwnManaSetupNow,
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative,
      isPlainSpiritDevelopmentRoot,
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveSafeProgressRepresentative,
      (root) =>
        advisorRootFamily(root) === TurnPlanFamily.SafeSupermanaProgress,
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveSafeProgressRepresentative,
      (root) =>
        advisorRootFamily(root) === TurnPlanFamily.SafeOpponentManaProgress,
    ],
    [
      CurrentProRootAdvisorReasonCode.PreserveManaTempoRepresentative,
      (root) => advisorRootFamily(root) === TurnPlanFamily.ManaTempo,
    ],
  ];
  for (const [reason, predicate] of specs) {
    if (checkpoint()) return undefined;
    const index = findScoredRepresentative(
      game,
      roots,
      orderedShortlist,
      perspective,
      config,
      predicate,
    );
    const root = index === undefined ? undefined : roots[index];
    if (index === undefined || root === undefined) continue;
    const value = entry(root, reason);
    pushUnique(preserved, value);
    if (!orderedShortlist.includes(index)) orderedShortlist.push(index);
    if (!selectionIndices.includes(index)) selectionIndices.push(index);
    pushUnique(decisionEntries, value);
    if (
      representativeCompetesInApproval(
        game,
        roots,
        orderedShortlist,
        index,
        reason,
        perspective,
        config,
        followupScores,
      ) &&
      !approvalShortlist.includes(index)
    ) {
      approvalShortlist.push(index);
    }
  }
  const followupRepresentative = whiteFollowupRepresentative(
    game,
    roots,
    orderedShortlist,
    config,
  );
  if (followupRepresentative !== undefined) {
    addAdvisorReentry(
      roots,
      decisionEntries,
      preserved,
      orderedShortlist,
      selectionIndices,
      approvalShortlist,
      followupRepresentative,
      CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative,
    );
  }
  for (const index of collectAdvisorReentries(
    game,
    roots,
    candidateIndices,
    orderedShortlist,
    perspective,
    config,
  )) {
    addAdvisorReentry(
      roots,
      decisionEntries,
      preserved,
      orderedShortlist,
      selectionIndices,
      approvalShortlist,
      index,
    );
  }
  selectionIndices.sort((left, right) =>
    compareRankedRootEvaluationIndices(roots, left, right),
  );
  const baselineConfig = selectorConfigView(
    config,
    AUTOMOVE_TURN_ENGINE_MODE.ProV1,
  );
  const baselineIndex = pickBaselineRootIndexFromCandidateIndices(
    game,
    roots,
    candidateIndices,
    perspective,
    baselineConfig,
  );
  const shortlistConfig = selectorConfigView(config, config.turnEngineMode);
  let approvedIndex: number | undefined;
  let approvedReason: CurrentProRootAdvisorReasonCode;
  if (config.enableRootReplyRiskGuard) {
    approvedIndex = pickRootWithReplyRiskGuard(
      game,
      roots,
      approvalShortlist,
      perspective,
      config,
      selectionIndices,
    );
  }
  if (approvedIndex !== undefined) {
    approvedReason = CurrentProRootAdvisorReasonCode.ApprovedReplyRiskGuard;
  } else {
    approvedIndex = pickBaselineRootIndexFromCandidateIndices(
      game,
      roots,
      selectionIndices,
      perspective,
      shortlistConfig,
      { currentPro: coreCallbacks },
    );
    approvedReason = CurrentProRootAdvisorReasonCode.ApprovedBaselineSelector;
  }
  let chosenIndex =
    approvedIndex ?? orderedShortlist[0] ?? candidateIndices[0] ?? 0;
  const approveFamily = (index: number | undefined): void => {
    if (index === undefined) return;
    chosenIndex = index;
    approvedReason = CurrentProRootAdvisorReasonCode.ApprovedFamilyCompetition;
  };
  const approveBaseline = (index: number | undefined): void => {
    if (index === undefined) return;
    chosenIndex = index;
    approvedReason = CurrentProRootAdvisorReasonCode.ApprovedBaselineSelector;
  };
  approveFamily(
    blackFamilyCompetitionOverride(
      game,
      roots,
      replyRiskShortlist,
      selectionIndices,
      chosenIndex,
      perspective,
      config,
    ),
  );
  approveFamily(
    blackOpeningSetupSiblingOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackEarlySafeManaFollowupOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackEarlyPlainSpiritFollowupOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackTurnFourVulnerableProgressManaOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackTurnSixAttackVulnerableProgressManaOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackTurnFourSetupClusterOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    earlySameLaneHigherScoreOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackSetupProgressCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      perspective,
      config,
    ),
  );
  approveFamily(
    blackPlainSpiritSetupCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackNoActionProgressOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackNoActionManaSiblingOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackTurnFourWindowManaSiblingOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackTurnFourWeakWindowRecoveryOverride(game, roots, chosenIndex, config),
  );
  approveBaseline(
    baselineIndex === undefined
      ? undefined
      : blackBaselineAlignmentOverride(
          game,
          roots,
          selectionIndices,
          chosenIndex,
          baselineIndex,
          config,
        ),
  );
  approveBaseline(
    blackTurnStartGuardedBaselineManaOverride(
      game,
      roots,
      candidateIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackLateWindowManaSafetyOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackLateWindowCompetitionOverride(game, roots, chosenIndex, config),
  );
  approveFamily(
    blackLateRecoveryProgressCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteFollowupManaOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      perspective,
      config,
    ),
  );
  approveFamily(
    whiteManaCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      perspective,
      config,
    ),
  );
  approveFamily(
    whiteNoActionSafeProgressManaOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteWindowProgressCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      perspective,
      config,
    ),
  );
  approveFamily(
    whiteActionManaClusterOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteSetupProgressCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      perspective,
      config,
    ),
  );
  approveFamily(
    whiteEarlyFollowupSetupCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    earlySameLaneHigherScoreOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteEarlySetupSiblingProgressOverride(game, roots, chosenIndex, config),
  );
  approveFamily(
    whiteEarlySafeProgressSetupCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteEarlyNoActionProgressCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteTurnThreeSafeProgressSurfaceOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveBaseline(
    baselineIndex === undefined
      ? undefined
      : whiteTurnThreeBaselineAlignmentOverride(
          game,
          roots,
          selectionIndices,
          chosenIndex,
          baselineIndex,
          config,
        ),
  );
  approveFamily(
    whiteTurnThreeAttackBridgeEscape(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteTurnThreeNoActionRecoveryOverride(game, roots, chosenIndex, config),
  );
  approveFamily(
    whiteManaOnlyCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteTurnFiveWeakWindowSetupOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteEarlySetupCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    whiteLateFollowupCompetitionOverride(game, roots, chosenIndex, config),
  );
  approveFamily(
    blackLateFollowupCompetitionOverride(
      game,
      roots,
      selectionIndices,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackLateReplyRiskSetupOverride(
      game,
      roots,
      replyRiskShortlist,
      chosenIndex,
      config,
    ),
  );
  approveFamily(
    blackLateWeakWindowSafeProgressSetupOverride(
      game,
      roots,
      replyRiskShortlist,
      chosenIndex,
      perspective,
      config,
    ),
  );
  const approvedRoot = roots[chosenIndex];
  if (approvedRoot === undefined || checkpoint()) return undefined;
  const approvedEntry = entry(approvedRoot, approvedReason);
  return {
    index: chosenIndex,
    decision: {
      orderedShortlist: decisionEntries,
      preservedFamilyRepresentatives: preserved,
      approvedRoot: approvedEntry,
      injectedRoot: undefined,
    },
  };
}

export function currentProRootAdvisorSelectIndex(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  perspective: Color,
  config: AutomoveSearchConfig,
): number | undefined {
  return currentProRootAdvisorPostsearch(game, roots, perspective, config)
    ?.index;
}

/** Deterministic tactical override retained for shallow presearch consumers. */
export function currentProRootAdvisorTacticalOverride(
  roots: readonly AdvisorRootCandidate[],
): CurrentProRootAdvisorEntry | undefined {
  if (roots.length === 0 || checkpoint()) return undefined;
  const anchor = roots[0];
  if (anchor === undefined) return undefined;
  const selectedIndex = roots
    .map((_root, index) => index)
    .filter((index) => {
      const root = roots[index];
      return (
        root !== undefined &&
        advisorRootIsSafe(root) &&
        ((root.winsImmediately && !anchor.winsImmediately) ||
          (root.attacksOpponentDrainer && !anchor.attacksOpponentDrainer) ||
          (root.classes.drainerSafetyRecover &&
            anchor.ownDrainerVulnerable &&
            !anchor.classes.drainerSafetyRecover) ||
          (hasConcreteScoreSurface(root) && !hasConcreteScoreSurface(anchor)))
      );
    })
    .sort((left, right) => compareRankedRootMoveIndices(roots, left, right))[0];
  const selected =
    selectedIndex === undefined ? undefined : roots[selectedIndex];
  return selected === undefined
    ? undefined
    : entry(
        selected,
        CurrentProRootAdvisorReasonCode.ApprovedFamilyCompetition,
      );
}
