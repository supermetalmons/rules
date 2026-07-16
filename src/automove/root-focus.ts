import { BOARD_SIZE, MONS_MOVES_PER_TURN } from "../engine/config.js";
import { inputChainsEqual, type Input } from "../engine/domain.js";
import {
  I32_MIN,
  addI32,
  divI32,
  mulI32,
  saturatingAddI32,
  saturatingSubI32,
  subI32,
  toI32,
} from "../engine/numerics.js";

export const ROOT_FOCUS_CONSTANTS = Object.freeze({
  scoutDepth: 2,
  scoutMinNodes: 96,
  focusCount: 3,
  focusBudgetShareBp: 7_000,
  focusScoreMargin: 2_000,
  narrowSpreadFallback: 700,
  volatilityMargin: 600,
  volatilityKeep: 2,
});

export type RootFocusMoveClassFlags = {
  readonly immediateScore: boolean;
  readonly drainerAttack: boolean;
  readonly drainerSafetyRecover: boolean;
  readonly carrierProgress: boolean;
  readonly material: boolean;
  readonly quiet: boolean;
};

/** Structural subset of `ScoredRootMove` used by root focusing. */
export type RootFocusCandidate = {
  readonly inputs: readonly Input[];
  readonly game: { readonly activeColor: number };
  readonly heuristic: number;
  readonly efficiency: number;
  readonly winsImmediately: boolean;
  readonly attacksOpponentDrainer: boolean;
  readonly ownDrainerVulnerable: boolean;
  readonly ownDrainerWalkVulnerable: boolean;
  readonly spiritDevelopment: boolean;
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
  readonly spiritSameTurnScoreSetupNow: boolean;
  readonly spiritOwnManaSetupNow: boolean;
  readonly supermanaProgress: boolean;
  readonly opponentManaProgress: boolean;
  readonly classes: RootFocusMoveClassFlags;
};

/** Structural subset of `AutomoveSearchConfig` used by the two-pass allocator. */
export type RootFocusConfig = {
  readonly depth: number;
  readonly maxVisitedNodes: number;
  readonly enableTwoPassRootAllocation: boolean;
  readonly enableSelectiveExtensions: boolean;
  readonly enableQuietReductions: boolean;
  readonly enableTwoPassVolatilityFocus: boolean;
  readonly enableTurnEngineSelector: boolean;
  readonly turnEngineMode: number;
};

export type RootFocusScoutContext<
  Candidate extends RootFocusCandidate,
  Config extends RootFocusConfig,
> = {
  readonly candidate: Candidate;
  readonly candidateIndex: number;
  readonly perspective: number;
  readonly depth: number;
  readonly alpha: number;
  readonly visitedNodes: number;
  readonly config: Config;
  readonly useTranspositionTable: boolean;
};

export type RootFocusScoutEvaluation = {
  readonly score: number;
  /** Absolute cumulative count, including the root node already charged. */
  readonly visitedNodes: number;
};

export type RootFocusOptions<
  Candidate extends RootFocusCandidate,
  Config extends RootFocusConfig,
> = {
  readonly rootMoves: readonly Candidate[];
  readonly perspective: number;
  readonly config: Config;
  readonly useTranspositionTable: boolean;
  readonly priorityInputs?: readonly (readonly Input[])[];
  readonly forcedInputs?: readonly Input[];
  readonly evaluateDeeperScout: (
    context: RootFocusScoutContext<Candidate, Config>,
  ) => RootFocusScoutEvaluation;
  /** Mirrors the CurrentPro SpiritImpact plan plus nonnegative deny-gain gate. */
  readonly qualifiesPlainSpiritPlan?: (candidate: Candidate) => boolean;
  /** Mirrors the CurrentPro DrainerSafetyRecovery plan-family gate. */
  readonly qualifiesDrainerSafetyRecoveryPlan?: (
    candidate: Candidate,
  ) => boolean;
  readonly checkpoint?: () => boolean;
  readonly cancelled?: () => boolean;
};

export type FocusedRootCandidatesResult<Candidate> = {
  readonly candidates: readonly Candidate[];
  readonly scoutVisitedNodes: number;
};

function rootProgressStepSoftBonus(
  steps: number,
  perStepBonus: number,
): number {
  const unknownSteps = BOARD_SIZE + 4;
  if (steps >= unknownSteps || perStepBonus <= 0) return 0;
  const clampedSteps = Math.min(MONS_MOVES_PER_TURN, Math.max(0, toI32(steps)));
  return mulI32(MONS_MOVES_PER_TURN - clampedSteps, toI32(perStepBonus));
}

export function rootScoutProgressBonus(candidate: RootFocusCandidate): number {
  let bonus = 0;
  if (
    candidate.supermanaProgress &&
    !candidate.scoresSupermanaThisTurn &&
    !candidate.safeSupermanaPickupNow &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow
  ) {
    bonus = saturatingAddI32(
      saturatingAddI32(bonus, 520),
      rootProgressStepSoftBonus(candidate.safeSupermanaProgressSteps, 48),
    );
  }
  if (
    candidate.opponentManaProgress &&
    !candidate.scoresOpponentManaThisTurn &&
    !candidate.safeOpponentManaPickupNow &&
    !candidate.spiritSameTurnScoreSetupNow &&
    !candidate.spiritOwnManaSetupNow
  ) {
    bonus = saturatingAddI32(
      saturatingAddI32(bonus, 480),
      rootProgressStepSoftBonus(candidate.safeOpponentManaProgressSteps, 40),
    );
  }
  return bonus;
}

export function rootFocusScoutScore(candidate: RootFocusCandidate): number {
  return saturatingAddI32(
    saturatingAddI32(
      toI32(candidate.heuristic),
      divI32(toI32(candidate.efficiency), 2),
    ),
    rootScoutProgressBonus(candidate),
  );
}

export function rootVolatilityScore(candidate: RootFocusCandidate): number {
  let score = 0;
  if (candidate.winsImmediately) score = addI32(score, 5_000);
  if (candidate.attacksOpponentDrainer || candidate.classes.drainerAttack) {
    score = addI32(score, 2_800);
  }
  if (candidate.ownDrainerVulnerable) score = addI32(score, 2_200);
  if (candidate.classes.immediateScore) score = addI32(score, 1_700);
  if (candidate.classes.drainerSafetyRecover) {
    score = addI32(score, 1_500);
  }
  if (candidate.manaHandoffToOpponent) score = addI32(score, 900);
  if (candidate.hasRoundtrip) score = addI32(score, 700);
  if (candidate.classes.material) score = addI32(score, 240);
  if (candidate.efficiency < 0) {
    score = addI32(
      score,
      Math.min(subI32(0, toI32(candidate.efficiency)), 400),
    );
  }
  return score;
}

export function rootProgressStepsBetter(
  candidateSteps: number,
  incumbentSteps: number,
): boolean {
  const unknownSteps = BOARD_SIZE + 4;
  const candidateKnown = candidateSteps < unknownSteps;
  const incumbentKnown = incumbentSteps < unknownSteps;
  return candidateKnown
    ? !incumbentKnown || candidateSteps < incumbentSteps
    : false;
}

export function rootScorePathStepsBetter(
  candidateSteps: number,
  incumbentSteps: number,
): boolean {
  const unknownSteps = BOARD_SIZE * 3;
  const candidateKnown = candidateSteps < unknownSteps;
  const incumbentKnown = incumbentSteps < unknownSteps;
  return candidateKnown
    ? !incumbentKnown || candidateSteps < incumbentSteps
    : false;
}

function isBetterTacticalRootCandidate(
  candidate: RootFocusCandidate,
  incumbent: RootFocusCandidate,
): boolean {
  if (candidate.winsImmediately !== incumbent.winsImmediately) {
    return candidate.winsImmediately;
  }
  if (candidate.attacksOpponentDrainer !== incumbent.attacksOpponentDrainer) {
    return candidate.attacksOpponentDrainer;
  }
  if (candidate.ownDrainerVulnerable !== incumbent.ownDrainerVulnerable) {
    return !candidate.ownDrainerVulnerable;
  }
  if (candidate.classes.immediateScore !== incumbent.classes.immediateScore) {
    return candidate.classes.immediateScore;
  }
  if (candidate.scoresSupermanaThisTurn !== incumbent.scoresSupermanaThisTurn) {
    return candidate.scoresSupermanaThisTurn;
  }
  if (
    candidate.scoresOpponentManaThisTurn !==
    incumbent.scoresOpponentManaThisTurn
  ) {
    return candidate.scoresOpponentManaThisTurn;
  }
  if (candidate.safeSupermanaPickupNow !== incumbent.safeSupermanaPickupNow) {
    return candidate.safeSupermanaPickupNow;
  }
  if (
    candidate.safeOpponentManaPickupNow !== incumbent.safeOpponentManaPickupNow
  ) {
    return candidate.safeOpponentManaPickupNow;
  }
  if (
    candidate.sameTurnScoreWindowValue !== incumbent.sameTurnScoreWindowValue
  ) {
    return (
      candidate.sameTurnScoreWindowValue > incumbent.sameTurnScoreWindowValue
    );
  }
  if (
    candidate.spiritSameTurnScoreSetupNow !==
    incumbent.spiritSameTurnScoreSetupNow
  ) {
    return candidate.spiritSameTurnScoreSetupNow;
  }
  if (candidate.spiritOwnManaSetupNow !== incumbent.spiritOwnManaSetupNow) {
    return candidate.spiritOwnManaSetupNow;
  }
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
  if (
    candidate.spiritOwnManaSetupNow &&
    incumbent.spiritOwnManaSetupNow &&
    candidate.scorePathBestSteps !== incumbent.scorePathBestSteps
  ) {
    return rootScorePathStepsBetter(
      candidate.scorePathBestSteps,
      incumbent.scorePathBestSteps,
    );
  }
  if (candidate.supermanaProgress !== incumbent.supermanaProgress) {
    return candidate.supermanaProgress;
  }
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
  if (candidate.opponentManaProgress !== incumbent.opponentManaProgress) {
    return candidate.opponentManaProgress;
  }
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
  if (candidate.manaHandoffToOpponent !== incumbent.manaHandoffToOpponent) {
    return !candidate.manaHandoffToOpponent;
  }
  if (candidate.hasRoundtrip !== incumbent.hasRoundtrip) {
    return !candidate.hasRoundtrip;
  }
  if (candidate.spiritDevelopment !== incumbent.spiritDevelopment) {
    return candidate.spiritDevelopment;
  }
  if (candidate.efficiency !== incumbent.efficiency) {
    return candidate.efficiency > incumbent.efficiency;
  }
  if (candidate.heuristic !== incumbent.heuristic) {
    return candidate.heuristic > incumbent.heuristic;
  }
  return false;
}

export function compareTacticalRootCandidates(
  candidate: RootFocusCandidate,
  incumbent: RootFocusCandidate,
): number {
  if (isBetterTacticalRootCandidate(candidate, incumbent)) return -1;
  if (isBetterTacticalRootCandidate(incumbent, candidate)) return 1;
  return 0;
}

function compareScoresDescending(left: number, right: number): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function valueAt<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`root focus index ${index} is out of bounds`);
  }
  return value;
}

export function compareRankedRootIndices(
  rootMoves: readonly RootFocusCandidate[],
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return (
    compareScoresDescending(left[1], right[1]) ||
    compareTacticalRootCandidates(
      valueAt(rootMoves, left[0]),
      valueAt(rootMoves, right[0]),
    ) ||
    left[0] - right[0]
  );
}

export function prioritizeRootInputs<Candidate extends RootFocusCandidate>(
  rootMoves: readonly Candidate[],
  priorityInputs?: readonly (readonly Input[])[],
  forcedInputs?: readonly Input[],
): Candidate[] {
  const orderedInputs: (readonly Input[])[] = [];
  if (forcedInputs !== undefined) orderedInputs.push(forcedInputs);
  if (priorityInputs !== undefined) {
    for (const inputs of priorityInputs) {
      if (
        !orderedInputs.some((existing) => inputChainsEqual(existing, inputs))
      ) {
        orderedInputs.push(inputs);
      }
    }
  }
  const orderedRoots = [...rootMoves];
  let insertAt = 0;
  for (const inputs of orderedInputs) {
    const index = orderedRoots.findIndex((candidate) =>
      inputChainsEqual(candidate.inputs, inputs),
    );
    if (index < 0) continue;
    if (index === insertAt) {
      insertAt += 1;
      continue;
    }
    const [prioritized] = orderedRoots.splice(index, 1);
    if (prioritized !== undefined) {
      orderedRoots.splice(insertAt, 0, prioritized);
      insertAt += 1;
    }
  }
  return orderedRoots;
}

function nonnegativeInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : fallback;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) {
    throw new RangeError("root scout budget has invalid clamp bounds");
  }
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

function isCurrentPro(config: RootFocusConfig): boolean {
  return config.turnEngineMode === 1 && config.enableTurnEngineSelector;
}

export function focusedRootCandidates<
  Candidate extends RootFocusCandidate,
  Config extends RootFocusConfig,
>(
  options: RootFocusOptions<Candidate, Config>,
): FocusedRootCandidatesResult<Candidate> {
  const {
    config,
    perspective,
    priorityInputs,
    forcedInputs,
    useTranspositionTable,
  } = options;
  let rootMoves = [...options.rootMoves];
  if (options.checkpoint?.() === true) {
    return { candidates: [], scoutVisitedNodes: 0 };
  }
  if (
    !config.enableTwoPassRootAllocation ||
    rootMoves.length <= ROOT_FOCUS_CONSTANTS.focusCount ||
    config.depth <= 1
  ) {
    return {
      candidates: prioritizeRootInputs(rootMoves, priorityInputs, forcedInputs),
      scoutVisitedNodes: 0,
    };
  }

  const scoutDepth =
    config.enableTwoPassVolatilityFocus || config.depth <= 3
      ? 1
      : clampInteger(config.depth, 1, ROOT_FOCUS_CONSTANTS.scoutDepth);
  const scoutShareBp = clampInteger(
    10_000 - ROOT_FOCUS_CONSTANTS.focusBudgetShareBp,
    500,
    4_000,
  );
  const scoutBudget =
    scoutDepth <= 1
      ? rootMoves.length
      : clampInteger(
          Math.trunc((config.maxVisitedNodes * scoutShareBp) / 10_000),
          ROOT_FOCUS_CONSTANTS.scoutMinNodes,
          Math.max(0, config.maxVisitedNodes - 1),
        );
  if (scoutBudget < rootMoves.length) {
    return {
      candidates: prioritizeRootInputs(rootMoves, priorityInputs, forcedInputs),
      scoutVisitedNodes: 0,
    };
  }

  const scoutConfig = {
    ...config,
    depth: scoutDepth,
    maxVisitedNodes: scoutBudget,
    enableSelectiveExtensions: false,
    enableQuietReductions: false,
  } as Config;
  let scoutVisitedNodes = 0;
  let scoutAlpha = I32_MIN;
  const scoutScores = Array.from<number>({ length: rootMoves.length }).fill(
    I32_MIN,
  );
  let bestScoutScore = I32_MIN;

  for (const [index, candidate] of rootMoves.entries()) {
    if (options.checkpoint?.() === true) {
      return { candidates: [], scoutVisitedNodes };
    }
    if (scoutDepth > 1 && scoutVisitedNodes >= scoutConfig.maxVisitedNodes) {
      break;
    }
    let score: number;
    if (scoutDepth > 1) {
      scoutVisitedNodes += 1;
      const evaluation = options.evaluateDeeperScout({
        candidate,
        candidateIndex: index,
        perspective,
        depth: scoutDepth - 1,
        alpha: scoutAlpha,
        visitedNodes: scoutVisitedNodes,
        config: scoutConfig,
        useTranspositionTable,
      });
      score = toI32(evaluation.score);
      scoutVisitedNodes = Math.min(
        scoutConfig.maxVisitedNodes,
        Math.max(
          scoutVisitedNodes,
          nonnegativeInteger(evaluation.visitedNodes, scoutVisitedNodes),
        ),
      );
    } else {
      score = rootFocusScoutScore(candidate);
    }
    if (options.cancelled?.() === true) {
      return { candidates: [], scoutVisitedNodes };
    }
    scoutScores[index] = score;
    bestScoutScore = Math.max(bestScoutScore, score);
    scoutAlpha = Math.max(scoutAlpha, score);
  }

  const focusCount = Math.min(
    ROOT_FOCUS_CONSTANTS.focusCount,
    rootMoves.length,
  );
  const rankedIndices: [number, number][] = rootMoves.map(
    (candidate, index) => {
      const scoutScore = valueAt(scoutScores, index);
      return [
        index,
        scoutScore === I32_MIN ? rootFocusScoutScore(candidate) : scoutScore,
      ];
    },
  );
  rankedIndices.sort((left, right) =>
    compareRankedRootIndices(rootMoves, left, right),
  );

  if (rankedIndices.length >= focusCount) {
    const bestScore = rankedIndices[0]?.[1] ?? I32_MIN;
    const kthScore = rankedIndices[focusCount - 1]?.[1] ?? I32_MIN;
    if (
      saturatingSubI32(bestScore, kthScore) <=
      ROOT_FOCUS_CONSTANTS.narrowSpreadFallback
    ) {
      rootMoves = rankedIndices.map(([index]) => valueAt(rootMoves, index));
      return {
        candidates: prioritizeRootInputs(
          rootMoves,
          priorityInputs,
          forcedInputs,
        ),
        scoutVisitedNodes: 0,
      };
    }
  }

  const selected = Array.from<boolean>({ length: rootMoves.length }).fill(
    false,
  );
  for (const [index] of rankedIndices.slice(0, focusCount)) {
    selected[index] = true;
  }

  if (isCurrentPro(config) && focusCount <= 3) {
    const topFocusHasPlainSpirit = rankedIndices
      .slice(0, focusCount)
      .some(([index]) => {
        const root = valueAt(rootMoves, index);
        return (
          root.spiritDevelopment &&
          !root.spiritSameTurnScoreSetupNow &&
          !root.spiritOwnManaSetupNow
        );
      });
    if (!topFocusHasPlainSpirit) {
      const nearFocusPlainSpirit = rankedIndices
        .slice(0, focusCount + 3)
        .map(([index]) => index)
        .filter((index) => {
          const root = valueAt(rootMoves, index);
          return (
            root.spiritDevelopment &&
            !root.spiritSameTurnScoreSetupNow &&
            !root.spiritOwnManaSetupNow &&
            !root.ownDrainerVulnerable &&
            !root.manaHandoffToOpponent &&
            !root.hasRoundtrip &&
            root.game.activeColor === perspective &&
            options.qualifiesPlainSpiritPlan?.(root) === true
          );
        });
      if (nearFocusPlainSpirit.length >= 2) {
        for (const index of nearFocusPlainSpirit) selected[index] = true;
      }
    }
  }

  for (const [index, score] of rankedIndices) {
    if (addI32(score, ROOT_FOCUS_CONSTANTS.focusScoreMargin) < bestScoutScore) {
      continue;
    }
    selected[index] = true;
  }

  for (const [index, candidate] of rootMoves.entries()) {
    if (candidate.attacksOpponentDrainer) selected[index] = true;
    if (
      candidate.scoresSupermanaThisTurn ||
      candidate.scoresOpponentManaThisTurn ||
      candidate.safeSupermanaPickupNow ||
      candidate.safeOpponentManaPickupNow ||
      candidate.spiritSameTurnScoreSetupNow ||
      candidate.sameTurnScoreWindowValue > 0 ||
      candidate.spiritOwnManaSetupNow
    ) {
      selected[index] = true;
    }
    if (
      isCurrentPro(config) &&
      candidate.ownDrainerVulnerable &&
      !candidate.ownDrainerWalkVulnerable &&
      !candidate.manaHandoffToOpponent &&
      !candidate.hasRoundtrip &&
      candidate.game.activeColor === perspective &&
      options.qualifiesDrainerSafetyRecoveryPlan?.(candidate) === true
    ) {
      selected[index] = true;
    }
  }

  if (priorityInputs !== undefined) {
    for (const inputs of priorityInputs) {
      const index = rootMoves.findIndex((candidate) =>
        inputChainsEqual(candidate.inputs, inputs),
      );
      if (index >= 0) selected[index] = true;
    }
  }
  if (forcedInputs !== undefined) {
    const index = rootMoves.findIndex((candidate) =>
      inputChainsEqual(candidate.inputs, forcedInputs),
    );
    if (index >= 0) selected[index] = true;
  }

  if (config.enableTwoPassVolatilityFocus) {
    const volatilityRanked = rootMoves
      .map((candidate, index) => {
        const scoutScore = valueAt(scoutScores, index);
        return {
          index,
          volatility: rootVolatilityScore(candidate),
          scoutScore:
            scoutScore === I32_MIN
              ? rootFocusScoutScore(candidate)
              : scoutScore,
        };
      })
      .filter(({ volatility }) => volatility > 0)
      .sort(
        (left, right) =>
          compareScoresDescending(left.volatility, right.volatility) ||
          compareScoresDescending(left.scoutScore, right.scoutScore) ||
          left.index - right.index,
      );
    for (const { index } of volatilityRanked.slice(
      0,
      Math.max(ROOT_FOCUS_CONSTANTS.volatilityKeep, 1),
    )) {
      selected[index] = true;
    }
    const bestVolatility = volatilityRanked[0]?.volatility;
    if (bestVolatility !== undefined) {
      for (const { index, volatility, scoutScore } of volatilityRanked) {
        if (
          addI32(volatility, ROOT_FOCUS_CONSTANTS.volatilityMargin) <
          bestVolatility
        ) {
          break;
        }
        if (
          addI32(scoutScore, ROOT_FOCUS_CONSTANTS.focusScoreMargin) <
          bestScoutScore
        ) {
          continue;
        }
        selected[index] = true;
      }
    }
  }

  if (!selected.some(Boolean)) {
    return {
      candidates: prioritizeRootInputs(rootMoves, priorityInputs, forcedInputs),
      scoutVisitedNodes: 0,
    };
  }

  const focusedWithScores: [number, number][] = selected.flatMap(
    (isSelected, index) => {
      if (!isSelected) return [];
      const candidate = valueAt(rootMoves, index);
      const scoutScore = valueAt(scoutScores, index);
      return [
        [
          index,
          scoutScore === I32_MIN ? rootFocusScoutScore(candidate) : scoutScore,
        ],
      ];
    },
  );
  focusedWithScores.sort((left, right) =>
    compareRankedRootIndices(rootMoves, left, right),
  );
  const focused = focusedWithScores.map(([index]) => valueAt(rootMoves, index));
  return {
    candidates: prioritizeRootInputs(focused, priorityInputs, forcedInputs),
    scoutVisitedNodes: Math.min(scoutVisitedNodes, config.maxVisitedNodes),
  };
}
