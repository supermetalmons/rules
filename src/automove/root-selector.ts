import { ACTIONS_PER_TURN, BOARD_SIZE } from "../engine/config.js";
import { Color, cloneInputs, type Input } from "../engine/domain.js";
import type { MonsGame } from "../engine/game.js";
import {
  I32_MIN,
  absI32,
  addI32,
  saturatingAddI32,
  saturatingSubI32,
  subI32,
} from "../engine/numerics.js";
import {
  rootProgressStepsBetter,
  rootScorePathStepsBetter,
} from "./root-focus.js";
import {
  AUTOMOVE_TURN_ENGINE_MODE,
  isPlainSpiritDevelopmentRoot,
  rootIsUnsafe as isUnsafe,
  shouldPreferSpiritDevelopment,
  type AutomoveSearchConfig,
  type RootEvaluation,
} from "./selector-types.js";

const ROOT_SPIRIT_DEVELOPMENT_SCORE_MARGIN = 700;
const ROOT_POTION_HOLD_SCORE_MARGIN = 180;
const INTERVIEW_SOFT_PRIORITY_SCORE_MARGIN = 80;
const SPIRIT_SCORE_CHALLENGE_MARGIN = 40;

export {
  isPlainSpiritDevelopmentRoot,
  rootProgressStepsBetter,
  rootScorePathStepsBetter,
  shouldPreferSpiritDevelopment,
};

export type RootReplyRiskSnapshot = {
  readonly allowsImmediateOpponentWin: boolean;
};

export type RootSelectionContext = {
  readonly game: MonsGame;
  readonly roots: readonly RootEvaluation[];
  readonly candidateIndices: readonly number[];
  readonly perspective: Color;
  readonly config: AutomoveSearchConfig;
};

export type CurrentProCompetitionKind =
  | "safe-progress"
  | "followup-progress"
  | "risky-score"
  | "negative-deny"
  | "score"
  | "projection"
  | "risky-recovery";

/**
 * Projection-heavy seams intentionally supplied by P7 integration. Every
 * callback defaults to no competition/reentry while the ProV1 policy remains
 * exact and self-contained.
 */
export type CurrentProRootPolicyCallbacks = {
  readonly pickRootIndex?: (
    context: RootSelectionContext,
  ) => number | undefined;
  readonly competition?: (
    kind: CurrentProCompetitionKind,
    context: RootSelectionContext,
  ) => boolean;
  readonly safetyReentryIndices?: (
    context: RootSelectionContext,
    saferIndices: readonly number[],
  ) => readonly number[];
  readonly finalReentryIndices?: (
    context: RootSelectionContext,
  ) => readonly number[];
  readonly spiritSetupCompetesWithBest?: (
    context: RootSelectionContext,
    candidateIndex: number,
    incumbentIndex: number,
  ) => boolean;
  /** Positive means candidate wins, negative means incumbent wins. */
  readonly spiritProjectionChallengeOrder?: (
    context: RootSelectionContext,
    candidateIndex: number,
    incumbentIndex: number,
  ) => number | undefined;
  /** Positive means candidate wins, negative means incumbent wins. */
  readonly spiritProjectionOrder?: (
    context: RootSelectionContext,
    candidateIndex: number,
    incumbentIndex: number,
  ) => number | undefined;
  /** Positive means candidate wins, negative means incumbent wins. */
  readonly spiritFollowupFloorOrder?: (
    context: RootSelectionContext,
    candidateIndex: number,
    incumbentIndex: number,
  ) => number | undefined;
};

export type RootSelectorOptions = {
  readonly rootReplyRiskSnapshot?: (
    stateAfterMove: MonsGame,
    perspective: Color,
    config: AutomoveSearchConfig,
    replyLimit: number,
    rootIndex: number,
  ) => RootReplyRiskSnapshot;
  readonly pickReplyRiskGuardedIndex?: (
    context: RootSelectionContext,
  ) => number | undefined;
  readonly currentPro?: CurrentProRootPolicyCallbacks;
  readonly checkpoint?: () => boolean;
  readonly cancelled?: () => boolean;
};

function valueAt<Value>(values: readonly Value[], index: number): Value {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`root selector index ${index} is out of bounds`);
  }
  return value;
}

function assertRootIndex(
  roots: readonly RootEvaluation[],
  index: number,
  source: string,
): void {
  if (!Number.isInteger(index) || index < 0 || index >= roots.length) {
    throw new RangeError(`${source} selected an invalid root`);
  }
}

function maxValue(values: readonly number[], fallback: number): number {
  let best = fallback;
  for (const value of values) best = Math.max(best, value);
  return best;
}

function minValue(values: readonly number[]): number | undefined {
  let best: number | undefined;
  for (const value of values)
    best = best === undefined ? value : Math.min(best, value);
  return best;
}

function scoreForColor(game: MonsGame, color: Color): number {
  return color === Color.White ? game.whiteScore : game.blackScore;
}

function potionsForColor(game: MonsGame, color: Color): number {
  return color === Color.White
    ? game.whitePotionsCount
    : game.blackPotionsCount;
}

function shouldPreferPotionTakebackLines(
  game: MonsGame,
  perspective: Color,
): boolean {
  return (
    game.activeColor === perspective &&
    !game.isFirstTurn() &&
    !game.playerCanMoveMon() &&
    game.actionsUsedCount >= ACTIONS_PER_TURN &&
    game.playerCanMoveMana() &&
    potionsForColor(game, perspective) > 0
  );
}

function rootSpendsPotion(
  gameBefore: MonsGame,
  root: RootEvaluation,
  perspective: Color,
): boolean {
  return (
    potionsForColor(root.game, perspective) <
    potionsForColor(gameBefore, perspective)
  );
}

function rootPotionSpendCompensated(
  gameBefore: MonsGame,
  root: RootEvaluation,
  perspective: Color,
): boolean {
  return (
    root.winsImmediately ||
    root.attacksOpponentDrainer ||
    scoreForColor(root.game, perspective) >=
      saturatingAddI32(scoreForColor(gameBefore, perspective), 2) ||
    root.scoresSupermanaThisTurn ||
    root.scoresOpponentManaThisTurn ||
    (!root.ownDrainerVulnerable &&
      (root.supermanaProgress || root.opponentManaProgress))
  );
}

function immediateOpponentWin(
  root: RootEvaluation,
  rootIndex: number,
  perspective: Color,
  config: AutomoveSearchConfig,
  options: RootSelectorOptions,
): boolean {
  const replyLimit = Math.max(config.rootAntiHelpReplyLimit, 1);
  return (
    options.rootReplyRiskSnapshot?.(
      root.game,
      perspective,
      config,
      replyLimit,
      rootIndex,
    ).allowsImmediateOpponentWin ?? false
  );
}

function isCurrentPro(config: AutomoveSearchConfig): boolean {
  return config.turnEngineMode === AUTOMOVE_TURN_ENGINE_MODE.CurrentPro;
}

function selectionContext(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
): RootSelectionContext {
  return { game, roots, candidateIndices, perspective, config };
}

function currentProCompetition(
  kind: CurrentProCompetitionKind,
  game: MonsGame,
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
  options: RootSelectorOptions,
): boolean {
  return (
    isCurrentPro(config) &&
    (options.currentPro?.competition?.(
      kind,
      selectionContext(game, roots, candidateIndices, perspective, config),
    ) ??
      false)
  );
}

function anyCurrentProCompetition(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
  options: RootSelectorOptions,
  negativeDenyIsOverridden?: () => boolean,
): boolean {
  const kinds: readonly CurrentProCompetitionKind[] = [
    "safe-progress",
    "followup-progress",
    "risky-score",
    "negative-deny",
    "score",
    "projection",
    "risky-recovery",
  ];
  let competes = false;
  for (const kind of kinds) {
    const kindCompetes = currentProCompetition(
      kind,
      game,
      roots,
      candidateIndices,
      perspective,
      config,
      options,
    );
    if (
      kindCompetes &&
      (kind !== "negative-deny" || negativeDenyIsOverridden?.() !== true)
    ) {
      competes = true;
    }
  }
  return competes;
}

function spiritSetupOverridesNegativeDeny(
  context: RootSelectionContext,
  spiritSetupIndices: readonly number[],
  callbacks: CurrentProRootPolicyCallbacks | undefined,
): boolean {
  const setupCompetes = callbacks?.spiritSetupCompetesWithBest;
  if (setupCompetes === undefined) return false;
  const nonSpiritIndices = context.candidateIndices.filter(
    (index) => !valueAt(context.roots, index).spiritDevelopment,
  );
  return spiritSetupIndices.some((spiritIndex) =>
    nonSpiritIndices.every((index) =>
      setupCompetes(context, spiritIndex, index),
    ),
  );
}

function retainBestKnownSteps(
  roots: readonly RootEvaluation[],
  indices: readonly number[],
  steps: (root: RootEvaluation) => number,
  unknown: number,
): number[] {
  const best = minValue(
    indices
      .map((index) => steps(valueAt(roots, index)))
      .filter((value) => value < unknown),
  );
  return best === undefined
    ? [...indices]
    : indices.filter((index) => steps(valueAt(roots, index)) === best);
}

export function filteredRootCandidateIndices(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  perspective: Color,
  config: AutomoveSearchConfig,
  options: RootSelectorOptions = {},
): number[] {
  if (roots.length === 0) return [];
  let candidates = roots.map((_root, index) => index);
  let forcedAttackApplied = false;

  if (candidates.some((index) => valueAt(roots, index).winsImmediately)) {
    return candidates.filter((index) => valueAt(roots, index).winsImmediately);
  }
  if (
    candidates.some((index) => valueAt(roots, index).attacksOpponentDrainer)
  ) {
    candidates = candidates.filter(
      (index) => valueAt(roots, index).attacksOpponentDrainer,
    );
    forcedAttackApplied = true;
  }

  if (
    !forcedAttackApplied &&
    !candidates.some((index) => valueAt(roots, index).classes.immediateScore)
  ) {
    const bestWindow = maxValue(
      candidates.flatMap((index) => {
        const root = valueAt(roots, index);
        return !root.ownDrainerVulnerable && !root.manaHandoffToOpponent
          ? [root.sameTurnScoreWindowValue]
          : [];
      }),
      0,
    );
    if (bestWindow > 0) {
      const windows = candidates.filter((index) => {
        const root = valueAt(roots, index);
        return (
          root.sameTurnScoreWindowValue === bestWindow &&
          !root.ownDrainerVulnerable &&
          !root.manaHandoffToOpponent
        );
      });
      if (windows.length > 0) candidates = windows;
    }
  }

  if (
    !forcedAttackApplied &&
    candidates.some((index) => valueAt(roots, index).safeSupermanaPickupNow)
  ) {
    candidates = candidates.filter((index) => {
      const root = valueAt(roots, index);
      return root.scoresSupermanaThisTurn || root.safeSupermanaPickupNow;
    });
  } else if (
    !forcedAttackApplied &&
    candidates.some((index) => valueAt(roots, index).safeOpponentManaPickupNow)
  ) {
    candidates = candidates.filter((index) => {
      const root = valueAt(roots, index);
      return root.scoresOpponentManaThisTurn || root.safeOpponentManaPickupNow;
    });
  }

  if (
    !forcedAttackApplied &&
    !candidates.some((index) => valueAt(roots, index).classes.immediateScore)
  ) {
    const bestSpiritWindow = maxValue(
      candidates.flatMap((index) => {
        const root = valueAt(roots, index);
        return root.spiritSameTurnScoreSetupNow &&
          !root.ownDrainerVulnerable &&
          !root.manaHandoffToOpponent
          ? [root.sameTurnScoreWindowValue]
          : [];
      }),
      0,
    );
    const bestNonSpiritWindow = maxValue(
      candidates.flatMap((index) => {
        const root = valueAt(roots, index);
        return !root.spiritSameTurnScoreSetupNow &&
          !root.ownDrainerVulnerable &&
          !root.manaHandoffToOpponent
          ? [root.sameTurnScoreWindowValue]
          : [];
      }),
      0,
    );
    if (bestSpiritWindow > bestNonSpiritWindow) {
      candidates = candidates.filter((index) => {
        const root = valueAt(roots, index);
        return (
          root.spiritSameTurnScoreSetupNow &&
          root.sameTurnScoreWindowValue === bestSpiritWindow &&
          !root.ownDrainerVulnerable &&
          !root.manaHandoffToOpponent
        );
      });
    }
  }

  if (
    !forcedAttackApplied &&
    !candidates.some((index) => valueAt(roots, index).classes.immediateScore) &&
    candidates.some((index) => {
      const root = valueAt(roots, index);
      return (
        root.sameTurnScoreWindowValue > 0 &&
        !root.ownDrainerVulnerable &&
        !root.manaHandoffToOpponent
      );
    })
  ) {
    const bestWindow = maxValue(
      candidates.map((index) => valueAt(roots, index).sameTurnScoreWindowValue),
      0,
    );
    if (bestWindow > 0) {
      const windows = candidates.filter((index) => {
        const root = valueAt(roots, index);
        return (
          root.sameTurnScoreWindowValue === bestWindow &&
          !root.ownDrainerVulnerable &&
          !root.manaHandoffToOpponent
        );
      });
      if (windows.length > 0) candidates = windows;
    }
  }

  if (!forcedAttackApplied) {
    const spiritSetups = candidates.filter((index) => {
      const root = valueAt(roots, index);
      return (
        root.spiritOwnManaSetupNow &&
        !root.ownDrainerVulnerable &&
        !root.manaHandoffToOpponent
      );
    });
    if (
      spiritSetups.length > 0 &&
      !anyCurrentProCompetition(
        game,
        roots,
        candidates,
        perspective,
        config,
        options,
        () =>
          spiritSetupOverridesNegativeDeny(
            selectionContext(game, roots, candidates, perspective, config),
            spiritSetups,
            options.currentPro,
          ),
      )
    ) {
      const supermana = spiritSetups.filter(
        (index) => valueAt(roots, index).supermanaProgress,
      );
      if (supermana.length > 0) {
        candidates = retainBestKnownSteps(
          roots,
          supermana,
          (root) => root.safeSupermanaProgressSteps,
          BOARD_SIZE + 4,
        );
      } else {
        const opponentMana = spiritSetups.filter(
          (index) => valueAt(roots, index).opponentManaProgress,
        );
        candidates =
          opponentMana.length > 0
            ? retainBestKnownSteps(
                roots,
                opponentMana,
                (root) => root.safeOpponentManaProgressSteps,
                BOARD_SIZE + 4,
              )
            : retainBestKnownSteps(
                roots,
                spiritSetups,
                (root) => root.scorePathBestSteps,
                BOARD_SIZE * 3,
              );
      }
    }
  }

  if (
    config.enableInterviewHardSpiritDeploy &&
    !forcedAttackApplied &&
    shouldPreferSpiritDevelopment(game, perspective)
  ) {
    const hasSafeHighValuePickup = candidates.some((index) => {
      const root = valueAt(roots, index);
      return (
        root.scoresSupermanaThisTurn ||
        root.scoresOpponentManaThisTurn ||
        root.safeSupermanaPickupNow ||
        root.safeOpponentManaPickupNow
      );
    });
    if (
      !hasSafeHighValuePickup &&
      !anyCurrentProCompetition(
        game,
        roots,
        candidates,
        perspective,
        config,
        options,
      )
    ) {
      const spiritSetups = candidates.filter((index) => {
        const root = valueAt(roots, index);
        return (
          root.spiritOwnManaSetupNow &&
          !root.ownDrainerVulnerable &&
          !root.manaHandoffToOpponent
        );
      });
      if (spiritSetups.length > 0) {
        candidates = spiritSetups;
      } else {
        const scoreBefore = scoreForColor(game, perspective);
        const spiritReady = candidates.filter(
          (index) => !valueAt(roots, index).keepsAwakeSpiritOnBase,
        );
        if (spiritReady.length > 0) {
          const safeSpiritReady = spiritReady.filter((index) => {
            const root = valueAt(roots, index);
            return !root.ownDrainerVulnerable && !root.manaHandoffToOpponent;
          });
          const preferred =
            safeSpiritReady.length > 0 ? safeSpiritReady : spiritReady;
          const keepsSpiritAndScores = candidates.some((index) => {
            const root = valueAt(roots, index);
            return (
              root.keepsAwakeSpiritOnBase &&
              scoreForColor(root.game, perspective) > scoreBefore
            );
          });
          const spiritLineScores = preferred.some(
            (index) =>
              scoreForColor(valueAt(roots, index).game, perspective) >
              scoreBefore,
          );
          if (!keepsSpiritAndScores || spiritLineScores) candidates = preferred;
        }
      }
    }
  }

  if (!forcedAttackApplied) {
    const preSafety = [...candidates];
    const bestScore = maxValue(
      candidates.map((index) => valueAt(roots, index).score),
      I32_MIN,
    );
    const margin = Math.max(config.rootDrainerSafetyScoreMargin, 0);
    const safer = candidates.filter((index) => {
      const root = valueAt(roots, index);
      return (
        !root.ownDrainerVulnerable && addI32(root.score, margin) >= bestScore
      );
    });
    if (safer.length > 0) {
      candidates = safer;
      if (isCurrentPro(config)) {
        const context = selectionContext(
          game,
          roots,
          preSafety,
          perspective,
          config,
        );
        for (const index of options.currentPro?.safetyReentryIndices?.(
          context,
          safer,
        ) ?? []) {
          assertRootIndex(roots, index, "CurrentPro safety reentry callback");
          if (!preSafety.includes(index)) {
            throw new RangeError(
              "CurrentPro safety reentry callback selected a root outside the prefilter",
            );
          }
          if (!candidates.includes(index)) candidates.push(index);
        }
      }
    }
  }

  if (
    config.enableRootSpiritDevelopmentPref &&
    shouldPreferSpiritDevelopment(game, perspective) &&
    candidates.some((index) => valueAt(roots, index).spiritDevelopment)
  ) {
    const hasSafeHighValuePickup = candidates.some((index) => {
      const root = valueAt(roots, index);
      return (
        root.scoresSupermanaThisTurn ||
        root.scoresOpponentManaThisTurn ||
        root.safeSupermanaPickupNow ||
        root.safeOpponentManaPickupNow
      );
    });
    if (
      !hasSafeHighValuePickup &&
      !anyCurrentProCompetition(
        game,
        roots,
        candidates,
        perspective,
        config,
        options,
      )
    ) {
      const bestScore = maxValue(
        candidates.map((index) => valueAt(roots, index).score),
        I32_MIN,
      );
      const spiritSetups = candidates.filter((index) => {
        const root = valueAt(roots, index);
        return (
          root.spiritOwnManaSetupNow &&
          addI32(root.score, ROOT_SPIRIT_DEVELOPMENT_SCORE_MARGIN) >= bestScore
        );
      });
      if (spiritSetups.length > 0) {
        candidates = spiritSetups;
      } else {
        const spirit = candidates.filter((index) => {
          const root = valueAt(roots, index);
          return (
            root.spiritDevelopment &&
            addI32(root.score, ROOT_SPIRIT_DEVELOPMENT_SCORE_MARGIN) >=
              bestScore
          );
        });
        if (spirit.length > 0) candidates = spirit;
      }
    }
  }

  if (
    !forcedAttackApplied &&
    candidates.length > 1 &&
    shouldPreferPotionTakebackLines(game, perspective)
  ) {
    const bestScore = maxValue(
      candidates.map((index) => valueAt(roots, index).score),
      I32_MIN,
    );
    const nearBest = candidates.filter(
      (index) =>
        addI32(valueAt(roots, index).score, ROOT_POTION_HOLD_SCORE_MARGIN) >=
        bestScore,
    );
    if (nearBest.length > 1) {
      const quickLoss = new Map<number, boolean>();
      const allowsLoss = (index: number): boolean => {
        const cached = quickLoss.get(index);
        if (cached !== undefined) return cached;
        const result = immediateOpponentWin(
          valueAt(roots, index),
          index,
          perspective,
          config,
          options,
        );
        quickLoss.set(index, result);
        return result;
      };
      const hasNonPotionNonLosing = nearBest.some((index) => {
        const root = valueAt(roots, index);
        return !rootSpendsPotion(game, root, perspective) && !allowsLoss(index);
      });
      if (hasNonPotionNonLosing) {
        const nearBestSet = new Set(nearBest);
        const strict = candidates.filter((index) => {
          const root = valueAt(roots, index);
          return (
            root.winsImmediately ||
            !nearBestSet.has(index) ||
            !rootSpendsPotion(game, root, perspective) ||
            rootPotionSpendCompensated(game, root, perspective)
          );
        });
        if (strict.length > 0) candidates = strict;
      }
    }
  }

  if (candidates.length > 1) {
    const bestScore = maxValue(
      candidates.map((index) => valueAt(roots, index).score),
      I32_MIN,
    );
    const margin = Math.max(config.rootAntiHelpScoreMargin, 0);
    const nearBest = candidates.filter(
      (index) => addI32(valueAt(roots, index).score, margin) >= bestScore,
    );
    if (nearBest.length > 1) {
      const quickLoss = new Map<number, boolean>();
      const allowsLoss = (index: number): boolean => {
        const cached = quickLoss.get(index);
        if (cached !== undefined) return cached;
        const result = immediateOpponentWin(
          valueAt(roots, index),
          index,
          perspective,
          config,
          options,
        );
        quickLoss.set(index, result);
        return result;
      };
      const hasCleanNonLosing = nearBest.some((index) => {
        const root = valueAt(roots, index);
        return (
          !root.manaHandoffToOpponent &&
          !root.hasRoundtrip &&
          !allowsLoss(index)
        );
      });
      if (hasCleanNonLosing) {
        const nearBestSet = new Set(nearBest);
        const strict = candidates.filter((index) => {
          const root = valueAt(roots, index);
          return (
            root.winsImmediately ||
            !nearBestSet.has(index) ||
            (!root.manaHandoffToOpponent && !root.hasRoundtrip)
          );
        });
        if (strict.length > 0) candidates = strict;
      }
    }
  }

  if (isCurrentPro(config)) {
    const context = selectionContext(
      game,
      roots,
      candidates,
      perspective,
      config,
    );
    let reentered = false;
    for (const index of options.currentPro?.finalReentryIndices?.(context) ??
      []) {
      assertRootIndex(roots, index, "CurrentPro final reentry callback");
      if (!candidates.includes(index)) {
        candidates.push(index);
        reentered = true;
      }
    }
    if (reentered) {
      candidates.sort((left, right) =>
        compareRankedRootEvaluationIndices(roots, left, right),
      );
    }
  }
  return candidates;
}

export function compareTacticalRootEvaluations(
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
): number {
  const preferBoolean = (
    candidateValue: boolean,
    incumbentValue: boolean,
    preferTrue: boolean,
  ): number | undefined => {
    if (candidateValue === incumbentValue) return undefined;
    return candidateValue === preferTrue ? -1 : 1;
  };
  let order = preferBoolean(
    candidate.winsImmediately,
    incumbent.winsImmediately,
    true,
  );
  order ??= preferBoolean(
    candidate.attacksOpponentDrainer,
    incumbent.attacksOpponentDrainer,
    true,
  );
  order ??= preferBoolean(
    candidate.ownDrainerVulnerable,
    incumbent.ownDrainerVulnerable,
    false,
  );
  order ??= preferBoolean(
    candidate.classes.immediateScore,
    incumbent.classes.immediateScore,
    true,
  );
  order ??= preferBoolean(
    candidate.scoresSupermanaThisTurn,
    incumbent.scoresSupermanaThisTurn,
    true,
  );
  order ??= preferBoolean(
    candidate.scoresOpponentManaThisTurn,
    incumbent.scoresOpponentManaThisTurn,
    true,
  );
  order ??= preferBoolean(
    candidate.safeSupermanaPickupNow,
    incumbent.safeSupermanaPickupNow,
    true,
  );
  order ??= preferBoolean(
    candidate.safeOpponentManaPickupNow,
    incumbent.safeOpponentManaPickupNow,
    true,
  );
  if (order !== undefined) return order;
  if (
    candidate.sameTurnScoreWindowValue !== incumbent.sameTurnScoreWindowValue
  ) {
    return candidate.sameTurnScoreWindowValue >
      incumbent.sameTurnScoreWindowValue
      ? -1
      : 1;
  }
  order = preferBoolean(
    candidate.spiritSameTurnScoreSetupNow,
    incumbent.spiritSameTurnScoreSetupNow,
    true,
  );
  order ??= preferBoolean(
    candidate.spiritOwnManaSetupNow,
    incumbent.spiritOwnManaSetupNow,
    true,
  );
  if (order !== undefined) return order;
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
    return rootProgressStepsBetter(
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
    return rootScorePathStepsBetter(
      candidate.scorePathBestSteps,
      incumbent.scorePathBestSteps,
    )
      ? -1
      : 1;
  }
  order = preferBoolean(
    candidate.supermanaProgress,
    incumbent.supermanaProgress,
    true,
  );
  if (order !== undefined) return order;
  if (
    candidate.supermanaProgress &&
    incumbent.supermanaProgress &&
    candidate.safeSupermanaProgressSteps !==
      incumbent.safeSupermanaProgressSteps
  ) {
    return rootProgressStepsBetter(
      candidate.safeSupermanaProgressSteps,
      incumbent.safeSupermanaProgressSteps,
    )
      ? -1
      : 1;
  }
  order = preferBoolean(
    candidate.opponentManaProgress,
    incumbent.opponentManaProgress,
    true,
  );
  if (order !== undefined) return order;
  if (
    candidate.opponentManaProgress &&
    incumbent.opponentManaProgress &&
    candidate.safeOpponentManaProgressSteps !==
      incumbent.safeOpponentManaProgressSteps
  ) {
    return rootProgressStepsBetter(
      candidate.safeOpponentManaProgressSteps,
      incumbent.safeOpponentManaProgressSteps,
    )
      ? -1
      : 1;
  }
  order = preferBoolean(
    candidate.manaHandoffToOpponent,
    incumbent.manaHandoffToOpponent,
    false,
  );
  order ??= preferBoolean(
    candidate.hasRoundtrip,
    incumbent.hasRoundtrip,
    false,
  );
  order ??= preferBoolean(
    candidate.spiritDevelopment,
    incumbent.spiritDevelopment,
    true,
  );
  if (order !== undefined) return order;
  if (candidate.interviewSoftPriority !== incumbent.interviewSoftPriority) {
    return candidate.interviewSoftPriority > incumbent.interviewSoftPriority
      ? -1
      : 1;
  }
  if (candidate.efficiency !== incumbent.efficiency) {
    return candidate.efficiency > incumbent.efficiency ? -1 : 1;
  }
  return 0;
}

export function compareRankedRootEvaluationIndices(
  roots: readonly RootEvaluation[],
  candidateIndex: number,
  incumbentIndex: number,
): number {
  const candidate = valueAt(roots, candidateIndex);
  const incumbent = valueAt(roots, incumbentIndex);
  if (candidate.score !== incumbent.score) {
    return candidate.score > incumbent.score ? -1 : 1;
  }
  return (
    compareTacticalRootEvaluations(candidate, incumbent) ||
    candidateIndex - incumbentIndex
  );
}

function bestScoredRootIndex(
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
): number {
  let bestIndex = candidateIndices[0] ?? 0;
  for (const index of candidateIndices) {
    if (compareRankedRootEvaluationIndices(roots, index, bestIndex) < 0) {
      bestIndex = index;
    }
  }
  return bestIndex;
}

/** Positive means candidate wins the challenge; negative means incumbent wins. */
export function spiritScoreChallengeOrder(
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
): number | undefined {
  const candidatePlainSpirit = isPlainSpiritDevelopmentRoot(candidate);
  const incumbentPlainSpirit = isPlainSpiritDevelopmentRoot(incumbent);
  if (candidatePlainSpirit === incumbentPlainSpirit) return undefined;
  const challenger = candidatePlainSpirit ? incumbent : candidate;
  const spirit = candidatePlainSpirit ? candidate : incumbent;
  const candidateIsChallenger = !candidatePlainSpirit;
  if (
    isUnsafe(challenger) ||
    challenger.hasRoundtrip ||
    challenger.score <
      saturatingAddI32(spirit.score, SPIRIT_SCORE_CHALLENGE_MARGIN) ||
    challenger.sameTurnScoreWindowValue < spirit.sameTurnScoreWindowValue
  ) {
    return undefined;
  }
  return candidateIsChallenger ? 1 : -1;
}

function currentProCallbackOrder(
  value: number | undefined,
): number | undefined {
  if (value === undefined) return undefined;
  return value === 0 ? 0 : value > 0 ? 1 : -1;
}

export function pickBaselineRootIndexFromCandidateIndices(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  candidateIndices: readonly number[],
  perspective: Color,
  config: AutomoveSearchConfig,
  options: RootSelectorOptions = {},
): number | undefined {
  if (
    options.checkpoint?.() === true ||
    roots.length === 0 ||
    candidateIndices.length === 0
  ) {
    return undefined;
  }
  const context = selectionContext(
    game,
    roots,
    candidateIndices,
    perspective,
    config,
  );
  if (config.enableRootReplyRiskGuard) {
    const guarded = options.pickReplyRiskGuardedIndex?.(context);
    if (guarded !== undefined) {
      assertRootIndex(roots, guarded, "reply-risk guard");
      if (!candidateIndices.includes(guarded)) {
        throw new RangeError(
          "reply-risk guard selected a root outside its shortlist",
        );
      }
      return options.cancelled?.() === true ? undefined : guarded;
    }
    if (options.cancelled?.() === true) return undefined;
  }

  const bestScore = maxValue(
    candidateIndices.map((index) => valueAt(roots, index).score),
    I32_MIN,
  );
  const scoreMargin = Math.max(config.rootEfficiencyScoreMargin, 0);
  let bestIndex = bestScoredRootIndex(roots, candidateIndices);
  let bestEfficiency = I32_MIN;
  let bestShortlistedScore = I32_MIN;
  const preferSpirit =
    config.enableRootSpiritDevelopmentPref &&
    shouldPreferSpiritDevelopment(game, perspective);
  const currentProPlainSpiritProjectionTiebreak =
    isCurrentPro(config) &&
    candidateIndices.filter((index) =>
      isPlainSpiritDevelopmentRoot(valueAt(roots, index)),
    ).length >= 2;
  let best = valueAt(roots, bestIndex);
  let bestSpiritDevelopment = best.spiritDevelopment;
  let bestSpiritSameTurnSetup = best.spiritSameTurnScoreSetupNow;
  let bestSpiritOwnManaSetup = best.spiritOwnManaSetupNow;
  let bestSupermanaProgress = best.supermanaProgress;
  let bestOpponentManaProgress = best.opponentManaProgress;
  let bestScorePathSteps = best.scorePathBestSteps;
  let bestSupermanaSteps = best.safeSupermanaProgressSteps;
  let bestOpponentSteps = best.safeOpponentManaProgressSteps;
  let bestScoreWindow = best.sameTurnScoreWindowValue;
  let bestSpiritSetupGain = best.spiritSetupGain;
  let bestManaHandoff = best.manaHandoffToOpponent;
  let bestRoundtrip = best.hasRoundtrip;
  let bestSoftPriority = best.interviewSoftPriority;

  for (const index of candidateIndices) {
    if (options.checkpoint?.() === true) return undefined;
    const evaluation = valueAt(roots, index);
    best = valueAt(roots, bestIndex);
    const allowClosePlainSpiritSlack =
      isCurrentPro(config) &&
      game.turnNumber <= 3 &&
      isPlainSpiritDevelopmentRoot(evaluation) &&
      isPlainSpiritDevelopmentRoot(best) &&
      saturatingSubI32(bestScore, evaluation.score) <= 16;
    const spiritSetupCompetes = isCurrentPro(config)
      ? (options.currentPro?.spiritSetupCompetesWithBest?.(
          context,
          index,
          bestIndex,
        ) ?? true)
      : true;
    if (
      addI32(evaluation.score, scoreMargin) < bestScore &&
      !allowClosePlainSpiritSlack
    ) {
      continue;
    }

    let spiritChallengeOrder =
      preferSpirit && evaluation.spiritDevelopment !== bestSpiritDevelopment
        ? spiritScoreChallengeOrder(evaluation, best)
        : undefined;
    if (
      spiritChallengeOrder === undefined &&
      isCurrentPro(config) &&
      preferSpirit &&
      evaluation.spiritDevelopment !== bestSpiritDevelopment &&
      absI32(subI32(evaluation.score, best.score)) <= 320
    ) {
      spiritChallengeOrder = currentProCallbackOrder(
        options.currentPro?.spiritProjectionChallengeOrder?.(
          context,
          index,
          bestIndex,
        ),
      );
    }
    const spiritBetter =
      spiritChallengeOrder === undefined &&
      preferSpirit &&
      evaluation.spiritDevelopment &&
      !bestSpiritDevelopment &&
      spiritSetupCompetes;
    const equalSpiritPreference =
      !preferSpirit ||
      evaluation.spiritDevelopment === bestSpiritDevelopment ||
      spiritChallengeOrder !== undefined ||
      (isCurrentPro(config) &&
        spiritSetupCompetes &&
        (evaluation.spiritOwnManaSetupNow ||
          evaluation.spiritSameTurnScoreSetupNow));
    const spiritSameTurnSetupBetter =
      evaluation.spiritSameTurnScoreSetupNow &&
      !bestSpiritSameTurnSetup &&
      spiritSetupCompetes;
    const equalSpiritSameTurnSetup =
      evaluation.spiritSameTurnScoreSetupNow === bestSpiritSameTurnSetup;
    const spiritSetupBetter =
      evaluation.spiritOwnManaSetupNow &&
      !bestSpiritOwnManaSetup &&
      spiritSetupCompetes;
    const equalSpiritSetup =
      evaluation.spiritOwnManaSetupNow === bestSpiritOwnManaSetup;
    const spiritSetupGainBetter =
      preferSpirit &&
      evaluation.spiritDevelopment &&
      bestSpiritDevelopment &&
      evaluation.spiritSetupGain > bestSpiritSetupGain;
    const equalSpiritSetupGain =
      !preferSpirit ||
      !evaluation.spiritDevelopment ||
      !bestSpiritDevelopment ||
      evaluation.spiritSetupGain === bestSpiritSetupGain;
    const comparePlainSpiritProjection =
      currentProPlainSpiritProjectionTiebreak &&
      isPlainSpiritDevelopmentRoot(evaluation) &&
      isPlainSpiritDevelopmentRoot(best);
    const spiritProjectionOrder =
      isCurrentPro(config) &&
      (preferSpirit || comparePlainSpiritProjection) &&
      evaluation.spiritDevelopment &&
      bestSpiritDevelopment
        ? currentProCallbackOrder(
            options.currentPro?.spiritProjectionOrder?.(
              context,
              index,
              bestIndex,
            ),
          )
        : undefined;
    const spiritFollowupOrder = isCurrentPro(config)
      ? currentProCallbackOrder(
          options.currentPro?.spiritFollowupFloorOrder?.(
            context,
            index,
            bestIndex,
          ),
        )
      : undefined;
    const spiritSetupSupermanaStepsBetter =
      evaluation.spiritOwnManaSetupNow &&
      bestSpiritOwnManaSetup &&
      evaluation.supermanaProgress &&
      bestSupermanaProgress &&
      rootProgressStepsBetter(
        evaluation.safeSupermanaProgressSteps,
        bestSupermanaSteps,
      );
    const equalSpiritSetupSupermanaSteps =
      !evaluation.spiritOwnManaSetupNow ||
      !bestSpiritOwnManaSetup ||
      !evaluation.supermanaProgress ||
      !bestSupermanaProgress ||
      evaluation.safeSupermanaProgressSteps === bestSupermanaSteps;
    const spiritSetupOpponentStepsBetter =
      evaluation.spiritOwnManaSetupNow &&
      bestSpiritOwnManaSetup &&
      evaluation.opponentManaProgress &&
      bestOpponentManaProgress &&
      rootProgressStepsBetter(
        evaluation.safeOpponentManaProgressSteps,
        bestOpponentSteps,
      );
    const equalSpiritSetupOpponentSteps =
      !evaluation.spiritOwnManaSetupNow ||
      !bestSpiritOwnManaSetup ||
      !evaluation.opponentManaProgress ||
      !bestOpponentManaProgress ||
      evaluation.safeOpponentManaProgressSteps === bestOpponentSteps;
    const spiritSetupScorePathBetter =
      evaluation.spiritOwnManaSetupNow &&
      bestSpiritOwnManaSetup &&
      rootScorePathStepsBetter(
        evaluation.scorePathBestSteps,
        bestScorePathSteps,
      );
    const equalSpiritSetupScorePath =
      !evaluation.spiritOwnManaSetupNow ||
      !bestSpiritOwnManaSetup ||
      evaluation.scorePathBestSteps === bestScorePathSteps;
    const supermanaStepsBetter = rootProgressStepsBetter(
      evaluation.safeSupermanaProgressSteps,
      bestSupermanaSteps,
    );
    const equalSupermanaSteps =
      evaluation.safeSupermanaProgressSteps === bestSupermanaSteps;
    const opponentStepsBetter = rootProgressStepsBetter(
      evaluation.safeOpponentManaProgressSteps,
      bestOpponentSteps,
    );
    const equalOpponentSteps =
      evaluation.safeOpponentManaProgressSteps === bestOpponentSteps;
    const scoreWindowBetter =
      evaluation.sameTurnScoreWindowValue > bestScoreWindow;
    const equalScoreWindow =
      evaluation.sameTurnScoreWindowValue === bestScoreWindow;
    const handoffBetter = !evaluation.manaHandoffToOpponent && bestManaHandoff;
    const equalHandoff = evaluation.manaHandoffToOpponent === bestManaHandoff;
    const roundtripBetter = !evaluation.hasRoundtrip && bestRoundtrip;
    const equalRoundtrip = evaluation.hasRoundtrip === bestRoundtrip;
    const softBetter =
      evaluation.interviewSoftPriority >
      saturatingAddI32(bestSoftPriority, INTERVIEW_SOFT_PRIORITY_SCORE_MARGIN);
    const softEqualOrDisabled =
      saturatingAddI32(
        evaluation.interviewSoftPriority,
        INTERVIEW_SOFT_PRIORITY_SCORE_MARGIN,
      ) >= bestSoftPriority;
    const efficiencyOrScoreBetter =
      evaluation.efficiency > bestEfficiency ||
      (evaluation.efficiency === bestEfficiency &&
        evaluation.score > bestShortlistedScore);

    let tieBreakBetter: boolean;
    if ((spiritChallengeOrder ?? 0) > 0) tieBreakBetter = true;
    else if ((spiritChallengeOrder ?? 0) < 0) tieBreakBetter = false;
    else if (softBetter) tieBreakBetter = true;
    else if (!softEqualOrDisabled) tieBreakBetter = false;
    else if (scoreWindowBetter) tieBreakBetter = true;
    else if (!equalScoreWindow) tieBreakBetter = false;
    else if (spiritSameTurnSetupBetter) tieBreakBetter = true;
    else if (!equalSpiritSameTurnSetup) tieBreakBetter = false;
    else if (spiritSetupBetter) tieBreakBetter = true;
    else if (!equalSpiritSetup) tieBreakBetter = false;
    else if (spiritSetupGainBetter) tieBreakBetter = true;
    else if (!equalSpiritSetupGain) tieBreakBetter = false;
    else if ((spiritFollowupOrder ?? 0) > 0) tieBreakBetter = true;
    else if ((spiritFollowupOrder ?? 0) < 0) tieBreakBetter = false;
    else if ((spiritProjectionOrder ?? 0) > 0) tieBreakBetter = true;
    else if ((spiritProjectionOrder ?? 0) < 0) tieBreakBetter = false;
    else if (spiritSetupSupermanaStepsBetter) tieBreakBetter = true;
    else if (!equalSpiritSetupSupermanaSteps) tieBreakBetter = false;
    else if (spiritSetupOpponentStepsBetter) tieBreakBetter = true;
    else if (!equalSpiritSetupOpponentSteps) tieBreakBetter = false;
    else if (spiritSetupScorePathBetter) tieBreakBetter = true;
    else if (!equalSpiritSetupScorePath) tieBreakBetter = false;
    else if (supermanaStepsBetter) tieBreakBetter = true;
    else if (!equalSupermanaSteps) tieBreakBetter = false;
    else if (opponentStepsBetter) tieBreakBetter = true;
    else if (!equalOpponentSteps) tieBreakBetter = false;
    else if (handoffBetter) tieBreakBetter = true;
    else if (!equalHandoff) tieBreakBetter = false;
    else if (roundtripBetter) tieBreakBetter = true;
    else if (!equalRoundtrip) tieBreakBetter = false;
    else tieBreakBetter = efficiencyOrScoreBetter;

    if (spiritBetter || (equalSpiritPreference && tieBreakBetter)) {
      bestIndex = index;
      bestEfficiency = evaluation.efficiency;
      bestShortlistedScore = evaluation.score;
      bestSpiritDevelopment = evaluation.spiritDevelopment;
      bestSpiritSameTurnSetup = evaluation.spiritSameTurnScoreSetupNow;
      bestSpiritOwnManaSetup = evaluation.spiritOwnManaSetupNow;
      bestSupermanaProgress = evaluation.supermanaProgress;
      bestOpponentManaProgress = evaluation.opponentManaProgress;
      bestScorePathSteps = evaluation.scorePathBestSteps;
      bestSupermanaSteps = evaluation.safeSupermanaProgressSteps;
      bestOpponentSteps = evaluation.safeOpponentManaProgressSteps;
      bestScoreWindow = evaluation.sameTurnScoreWindowValue;
      bestSpiritSetupGain = evaluation.spiritSetupGain;
      bestManaHandoff = evaluation.manaHandoffToOpponent;
      bestRoundtrip = evaluation.hasRoundtrip;
      bestSoftPriority = evaluation.interviewSoftPriority;
    }
  }
  return bestIndex;
}

export function pickBaselineRootIndex(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  perspective: Color,
  config: AutomoveSearchConfig,
  options: RootSelectorOptions = {},
): number | undefined {
  if (options.checkpoint?.() === true || roots.length === 0) return undefined;
  if (isCurrentPro(config)) {
    const all = roots.map((_root, index) => index);
    const selected = options.currentPro?.pickRootIndex?.(
      selectionContext(game, roots, all, perspective, config),
    );
    if (selected !== undefined) {
      assertRootIndex(roots, selected, "CurrentPro callback");
      return options.cancelled?.() === true ? undefined : selected;
    }
  }
  let candidates = filteredRootCandidateIndices(
    game,
    roots,
    perspective,
    config,
    options,
  );
  if (candidates.length === 0) candidates = roots.map((_root, index) => index);
  return pickBaselineRootIndexFromCandidateIndices(
    game,
    roots,
    candidates,
    perspective,
    config,
    options,
  );
}

export function pickBaselineRootInputs(
  game: MonsGame,
  roots: readonly RootEvaluation[],
  perspective: Color,
  config: AutomoveSearchConfig,
  options: RootSelectorOptions = {},
): Input[] {
  const index = pickBaselineRootIndex(
    game,
    roots,
    perspective,
    config,
    options,
  );
  return index === undefined ? [] : cloneInputs(valueAt(roots, index).inputs);
}
