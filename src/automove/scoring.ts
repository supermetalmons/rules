import { Board } from "../engine/board.js";
import {
  Color,
  Consumable,
  MonKind,
  isMonFainted,
  itemMon,
  manaScore,
  otherColor,
  type Item,
  type Mana,
  type Mon,
} from "../engine/domain.js";
import {
  BOARD_CENTER_INDEX,
  BOARD_CELLS,
  BOARD_SIZE,
  MAX_LOCATION_INDEX,
  locationDistance,
  locationEquals,
  locationIndex,
  spiritReachableLocations,
  type Location,
} from "../engine/geometry.js";
import {
  MON_BASE_LOCATIONS,
  MONS_MOVES_PER_TURN,
  TARGET_SCORE,
} from "../engine/config.js";
import { MonsGame } from "../engine/game.js";
import {
  addI32,
  divI32,
  mulI32,
  saturatingAddI32,
  saturatingMulI32,
  subI32,
  toI32,
} from "../engine/numerics.js";
import {
  AttackReachSummary,
  attackReachSummaryForTargetsWithHash,
  attackReachSummaryTargetLocations,
  attackReachSummaryWithHash,
  canAttackTargetOnBoardWithHash,
  drainerImmediateThreats,
  drainerImmediateThreatsWithHash,
  exactBoardHash,
  exactStrategicAnalysis,
  isDrainerUnderImmediateThreat,
  isDrainerUnderWalkThreatWithHash,
  type ExactColorSummary,
  type ExactSpiritSummary,
  type ExactStrategicAnalysis,
} from "./exact.js";
import type { Hash64 } from "./hash64.js";

const PROTECTED_HIGH_VALUE_CARRIER_SUPERMANA_SCALE_BP = 2_500;
const PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_MANA_SCALE_BP = 2_500;
const PROTECTED_HIGH_VALUE_CARRIER_VIRTUAL_SCORE_BP_MAX = 9_200;
const PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_SCORE_MARGIN = 2;
const MON_BASE_INDICES = new Set(MON_BASE_LOCATIONS.map(locationIndex));

type ScoringDangerSource = {
  readonly location: Location;
  readonly heuristicThreat: boolean;
  readonly exactActionThreat: boolean;
  readonly exactBombThreat: boolean;
};

type ScoringManaEntry = {
  readonly location: Location;
  readonly mana: Mana;
};

type ScoringManaCarrierEntry = ScoringManaEntry;

type ScoringBoardSummary = {
  readonly manaEntries: ScoringManaEntry[];
  readonly liveManaCarriers: readonly [
    ScoringManaCarrierEntry[],
    ScoringManaCarrierEntry[],
  ];
  readonly liveMonLocations: readonly [Location[], Location[]];
  readonly liveDrainerLocations: readonly [Location[], Location[]];
  readonly liveAngelLocations: readonly [Location[], Location[]];
  readonly dangerSources: readonly [
    ScoringDangerSource[],
    ScoringDangerSource[],
  ];
  readonly looseConsumableLocations: Location[];
  readonly regularManaMoveScores: [number, number];
  readonly regularManaScorePathSteps: [number | undefined, number | undefined];
};

type DrainerSafetySnapshot = {
  readonly riskDanger: number;
  readonly minMana: number;
  readonly angelNearby: boolean;
  readonly exactDangerThreat: boolean;
  readonly walkThreat: boolean;
};

function scoringDangerSourceFlags(
  item: Item,
  mon: Mon,
): readonly [boolean, boolean, boolean] {
  const heuristicThreat =
    item.kind !== "mon-with-mana" &&
    (mon.kind === MonKind.Mystic ||
      mon.kind === MonKind.Demon ||
      item.kind === "mon-with-consumable");
  const exactActionThreat =
    mon.kind === MonKind.Mystic || mon.kind === MonKind.Demon;
  const exactBombThreat =
    item.kind === "mon-with-consumable" && item.consumable === Consumable.Bomb;
  return [heuristicThreat, exactActionThreat, exactBombThreat];
}

function scoringBoardSummary(board: Board): ScoringBoardSummary {
  const summary: ScoringBoardSummary = {
    manaEntries: [],
    liveManaCarriers: [[], []],
    liveMonLocations: [[], []],
    liveDrainerLocations: [[], []],
    liveAngelLocations: [[], []],
    dangerSources: [[], []],
    looseConsumableLocations: [],
    regularManaMoveScores: [0, 0],
    regularManaScorePathSteps: [undefined, undefined],
  };

  for (const [location, item] of board.occupied()) {
    switch (item.kind) {
      case "mana": {
        const scoreSteps = distance(location, { kind: "any-closest-pool" }) - 1;
        summary.manaEntries.push({ location, mana: item.mana });
        if (item.mana.kind === "regular") {
          const slot = colorSlot(item.mana.color);
          const candidateSteps = scoreSteps + 1;
          const current = summary.regularManaScorePathSteps[slot];
          summary.regularManaScorePathSteps[slot] =
            current === undefined
              ? candidateSteps
              : Math.min(current, candidateSteps);
          if (scoreSteps <= 1) {
            summary.regularManaMoveScores[slot] = manaScore(
              item.mana,
              item.mana.color,
            );
          }
        }
        break;
      }
      case "mon":
      case "mon-with-mana":
      case "mon-with-consumable": {
        const mon = item.mon;
        if (isMonFainted(mon)) {
          break;
        }
        const slot = colorSlot(mon.color);
        if (item.kind === "mon-with-mana") {
          summary.liveManaCarriers[slot].push({ location, mana: item.mana });
        }
        summary.liveMonLocations[slot].push(location);
        if (mon.kind === MonKind.Drainer) {
          summary.liveDrainerLocations[slot].push(location);
        }
        if (mon.kind === MonKind.Angel) {
          summary.liveAngelLocations[slot].push(location);
        }
        const [heuristicThreat, exactActionThreat, exactBombThreat] =
          scoringDangerSourceFlags(item, mon);
        if (heuristicThreat || exactActionThreat || exactBombThreat) {
          summary.dangerSources[slot].push({
            location,
            heuristicThreat,
            exactActionThreat,
            exactBombThreat,
          });
        }
        break;
      }
      case "consumable":
        summary.looseConsumableLocations.push(location);
        break;
    }
  }
  return summary;
}

function exactSafe(snapshot: DrainerSafetySnapshot): boolean {
  return !snapshot.exactDangerThreat && !snapshot.walkThreat;
}

function guardedAgainstExactAttack(snapshot: DrainerSafetySnapshot): boolean {
  return snapshot.angelNearby && !snapshot.exactDangerThreat;
}

export class ScoringEvalContext {
  readonly #boardHash: Hash64;
  readonly #allowExactStrategic: boolean;
  readonly #enableAttackReachSummary: boolean;
  readonly #enableAttackReachTargetNarrowing: boolean;
  readonly #enableAttackReachDrainerTargetNarrowing: boolean;
  #boardSummary: ScoringBoardSummary | undefined;
  #manaPathSnapshot: ManaPathSnapshot | undefined;
  #exactAnalysis: ExactStrategicAnalysis | undefined;
  #attackReachTargets: readonly [Location[], Location[]] | undefined;
  #drainerAttackTargets: readonly [Location[], Location[]] | undefined;
  readonly #drainerImmediateThreatMemo: (
    readonly [number, number] | undefined
  )[];
  readonly #attackReachSummaryMemo = new Map<number, AttackReachSummary>();

  public constructor(
    game: MonsGame,
    allowExactStrategic: boolean,
    enableAttackReachSummary = false,
    enableAttackReachTargetNarrowing = false,
    enableAttackReachDrainerTargetNarrowing = false,
  ) {
    this.#boardHash = exactBoardHash(game.board);
    this.#allowExactStrategic = allowExactStrategic;
    this.#enableAttackReachSummary = enableAttackReachSummary;
    this.#enableAttackReachTargetNarrowing = enableAttackReachTargetNarrowing;
    this.#enableAttackReachDrainerTargetNarrowing =
      enableAttackReachDrainerTargetNarrowing;
    this.#drainerImmediateThreatMemo = Array.from(
      { length: BOARD_CELLS * 2 },
      () => undefined,
    );
  }

  public static newWithFlags(
    game: MonsGame,
    allowExactStrategic: boolean,
    enableAttackReachSummary: boolean,
    enableAttackReachTargetNarrowing: boolean,
    enableAttackReachDrainerTargetNarrowing: boolean,
  ): ScoringEvalContext {
    return new ScoringEvalContext(
      game,
      allowExactStrategic,
      enableAttackReachSummary,
      enableAttackReachTargetNarrowing,
      enableAttackReachDrainerTargetNarrowing,
    );
  }

  public boardHash(): Hash64 {
    return this.#boardHash;
  }

  public boardSummary(board: Board): ScoringBoardSummary {
    this.#boardSummary ??= scoringBoardSummary(board);
    return this.#boardSummary;
  }

  public manaPathSnapshot(board: Board): ManaPathSnapshot {
    this.#manaPathSnapshot ??= manaPathSnapshot(this.boardSummary(board));
    return this.#manaPathSnapshot;
  }

  public exactAnalysis(game: MonsGame): ExactStrategicAnalysis | undefined {
    if (!this.#allowExactStrategic) {
      return undefined;
    }
    this.#exactAnalysis ??= exactStrategicAnalysis(game);
    return this.#exactAnalysis;
  }

  #targets(board: Board, targetColor: Color): readonly Location[] {
    this.#attackReachTargets ??= [
      attackReachSummaryTargetLocations(board, Color.White),
      attackReachSummaryTargetLocations(board, Color.Black),
    ];
    return this.#attackReachTargets[colorSlot(targetColor)];
  }

  #drainerTargets(board: Board, targetColor: Color): readonly Location[] {
    if (this.#drainerAttackTargets === undefined) {
      const white: Location[] = [];
      const black: Location[] = [];
      for (const [location, item] of board.occupied()) {
        const mon = itemMon(item);
        if (mon?.kind === MonKind.Drainer) {
          (mon.color === Color.White ? white : black).push(location);
        }
      }
      this.#drainerAttackTargets = [white, black];
    }
    return this.#drainerAttackTargets[colorSlot(targetColor)];
  }

  #attackReachSummary(
    board: Board,
    attackerColor: Color,
    targetColor: Color,
    remainingMoves: number,
    canUseAction: boolean,
    drainerTargetsOnly: boolean,
  ): AttackReachSummary {
    const tag =
      Number.isInteger(remainingMoves) &&
      remainingMoves >= 0 &&
      remainingMoves <= 0xffff
        ? remainingMoves * 16 +
          attackerColor +
          targetColor * 2 +
          Number(canUseAction) * 4 +
          Number(drainerTargetsOnly) * 8
        : undefined;
    if (tag !== undefined) {
      const cached = this.#attackReachSummaryMemo.get(tag);
      if (cached !== undefined) {
        return cached;
      }
    }
    let summary: AttackReachSummary;
    if (drainerTargetsOnly) {
      summary = attackReachSummaryForTargetsWithHash(
        board,
        this.#boardHash,
        attackerColor,
        remainingMoves,
        canUseAction,
        this.#drainerTargets(board, targetColor),
      );
    } else if (this.#enableAttackReachTargetNarrowing) {
      summary = attackReachSummaryForTargetsWithHash(
        board,
        this.#boardHash,
        attackerColor,
        remainingMoves,
        canUseAction,
        this.#targets(board, targetColor),
      );
    } else {
      summary = attackReachSummaryWithHash(
        board,
        this.#boardHash,
        attackerColor,
        targetColor,
        remainingMoves,
        canUseAction,
      );
    }
    if (tag !== undefined) this.#attackReachSummaryMemo.set(tag, summary);
    return summary;
  }

  public drainerImmediateThreats(
    board: Board,
    color: Color,
    location: Location,
  ): readonly [number, number] {
    if (this.#enableAttackReachSummary) {
      return this.#attackReachSummary(
        board,
        otherColor(color),
        color,
        0,
        true,
        this.#enableAttackReachDrainerTargetNarrowing,
      ).immediateThreats(location);
    }
    const memoIndex =
      locationIndex(location) + (color === Color.Black ? BOARD_CELLS : 0);
    const cached = this.#drainerImmediateThreatMemo[memoIndex];
    if (cached !== undefined) {
      return cached;
    }
    const threats = drainerImmediateThreatsWithHash(
      board,
      color,
      location,
      this.#boardHash,
    );
    this.#drainerImmediateThreatMemo[memoIndex] = threats;
    return threats;
  }

  public canAttackTargetOnBoard(
    board: Board,
    attackerColor: Color,
    targetColor: Color,
    target: Location,
    remainingMoves: number,
    canUseAction: boolean,
  ): boolean {
    if (this.#enableAttackReachSummary) {
      const targetItem = board.item(target);
      const targetMon =
        targetItem === undefined ? undefined : itemMon(targetItem);
      const drainerOnly =
        this.#enableAttackReachDrainerTargetNarrowing &&
        targetMon?.color === targetColor &&
        targetMon.kind === MonKind.Drainer;
      if (drainerOnly) {
        return this.#attackReachSummary(
          board,
          attackerColor,
          targetColor,
          remainingMoves,
          canUseAction,
          true,
        ).canAttackTarget(target);
      }
      if (!this.#enableAttackReachDrainerTargetNarrowing) {
        return this.#attackReachSummary(
          board,
          attackerColor,
          targetColor,
          remainingMoves,
          canUseAction,
          false,
        ).canAttackTarget(target);
      }
    }
    return canAttackTargetOnBoardWithHash(
      board,
      this.#boardHash,
      attackerColor,
      targetColor,
      target,
      remainingMoves,
      canUseAction,
    );
  }
}

export type ScoringWeights = {
  readonly useHeuristicFormula: boolean;
  readonly includeRegularManaMoveWindows: boolean;
  readonly includeMatchPointWindow: boolean;
  readonly nextTurnWindowScaleBp: number;
  readonly doubleConfirmedScore: boolean;
  readonly confirmedScore: number;
  readonly faintedMon: number;
  readonly faintedDrainer: number;
  readonly faintedCooldownStep: number;
  readonly drainerAtRisk: number;
  readonly manaCloseToSamePool: number;
  readonly monWithManaCloseToAnyPool: number;
  readonly extraForSupermana: number;
  readonly extraForOpponentsMana: number;
  readonly drainerCloseToMana: number;
  readonly drainerHoldingMana: number;
  readonly drainerCloseToOwnPool: number;
  readonly drainerCloseToSupermana: number;
  readonly monCloseToCenter: number;
  readonly spiritCloseToEnemy: number;
  readonly spiritOnOwnBasePenalty: number;
  readonly angelGuardingDrainer: number;
  readonly angelCloseToFriendlyDrainer: number;
  readonly hasConsumable: number;
  readonly activeMon: number;
  readonly regularManaToOwnerPool: number;
  readonly regularManaDrainerControl: number;
  readonly supermanaDrainerControl: number;
  readonly supermanaRaceControl: number;
  readonly opponentManaDenial: number;
  readonly manaCarrierAtRisk: number;
  readonly manaCarrierGuarded: number;
  readonly manaCarrierOneStepFromPool: number;
  readonly supermanaCarrierOneStepFromPoolExtra: number;
  readonly immediateWinningCarrier: number;
  readonly drainerBestManaPath: number;
  readonly drainerPickupScoreThisTurn: number;
  readonly manaCarrierScoreThisTurn: number;
  readonly drainerImmediateThreat: number;
  readonly scoreRacePathProgress: number;
  readonly opponentScoreRacePathProgress: number;
  readonly scoreRaceMultiPath: number;
  readonly opponentScoreRaceMultiPath: number;
  readonly immediateScoreWindow: number;
  readonly opponentImmediateScoreWindow: number;
  readonly immediateScoreMultiWindow: number;
  readonly opponentImmediateScoreMultiWindow: number;
  readonly spiritActionUtility: number;
  readonly drainerDangerBoolean: number;
  readonly manaCarrierDangerBoolean: number;
  readonly drainerWalkThreatBoolean: number;
  readonly manaCarrierWalkThreatBoolean: number;
  readonly opponentDrainerAttackBonus: number;
  readonly attackerCloseToOpponentDrainer: number;
};

function freezeWeights(weights: ScoringWeights): ScoringWeights {
  return Object.freeze(weights);
}

export const DEFAULT_SCORING_WEIGHTS = freezeWeights({
  useHeuristicFormula: true,
  includeRegularManaMoveWindows: false,
  includeMatchPointWindow: false,
  nextTurnWindowScaleBp: 5_000,
  doubleConfirmedScore: true,
  confirmedScore: 1_000,
  faintedMon: -500,
  faintedDrainer: -800,
  faintedCooldownStep: 0,
  drainerAtRisk: -350,
  manaCloseToSamePool: 500,
  monWithManaCloseToAnyPool: 800,
  extraForSupermana: 120,
  extraForOpponentsMana: 100,
  drainerCloseToMana: 300,
  drainerHoldingMana: 350,
  drainerCloseToOwnPool: 180,
  drainerCloseToSupermana: 120,
  monCloseToCenter: 210,
  spiritCloseToEnemy: 160,
  spiritOnOwnBasePenalty: 180,
  angelGuardingDrainer: 180,
  angelCloseToFriendlyDrainer: 120,
  hasConsumable: 110,
  activeMon: 50,
  regularManaToOwnerPool: 0,
  regularManaDrainerControl: 0,
  supermanaDrainerControl: 0,
  supermanaRaceControl: 0,
  opponentManaDenial: 0,
  manaCarrierAtRisk: 0,
  manaCarrierGuarded: 0,
  manaCarrierOneStepFromPool: 0,
  supermanaCarrierOneStepFromPoolExtra: 0,
  immediateWinningCarrier: 0,
  drainerBestManaPath: 0,
  drainerPickupScoreThisTurn: 0,
  manaCarrierScoreThisTurn: 0,
  drainerImmediateThreat: 0,
  scoreRacePathProgress: 0,
  opponentScoreRacePathProgress: 0,
  scoreRaceMultiPath: 0,
  opponentScoreRaceMultiPath: 0,
  immediateScoreWindow: 0,
  opponentImmediateScoreWindow: 0,
  immediateScoreMultiWindow: 0,
  opponentImmediateScoreMultiWindow: 0,
  spiritActionUtility: 0,
  drainerDangerBoolean: 0,
  manaCarrierDangerBoolean: 0,
  drainerWalkThreatBoolean: 0,
  manaCarrierWalkThreatBoolean: 0,
  opponentDrainerAttackBonus: 0,
  attackerCloseToOpponentDrainer: 0,
});

export const BALANCED_DISTANCE_SCORING_WEIGHTS = freezeWeights({
  ...DEFAULT_SCORING_WEIGHTS,
  faintedMon: -520,
  faintedDrainer: -900,
  faintedCooldownStep: -80,
  drainerAtRisk: -420,
  manaCloseToSamePool: 520,
  monWithManaCloseToAnyPool: 820,
  extraForSupermana: 130,
  extraForOpponentsMana: 120,
  drainerCloseToMana: 330,
  drainerHoldingMana: 370,
  drainerCloseToOwnPool: 280,
  drainerCloseToSupermana: 180,
  monCloseToCenter: 180,
  spiritCloseToEnemy: 220,
  angelGuardingDrainer: 280,
  angelCloseToFriendlyDrainer: 180,
  hasConsumable: 105,
  activeMon: 45,
  manaCarrierOneStepFromPool: 160,
  supermanaCarrierOneStepFromPoolExtra: 80,
});

export const MANA_RACE_LITE_SCORING_WEIGHTS = freezeWeights({
  ...BALANCED_DISTANCE_SCORING_WEIGHTS,
  regularManaToOwnerPool: 150,
  regularManaDrainerControl: 15,
  supermanaDrainerControl: 26,
  manaCarrierAtRisk: -150,
  manaCarrierGuarded: 70,
  drainerCloseToOwnPool: 290,
  drainerCloseToSupermana: 200,
  angelGuardingDrainer: 290,
  manaCloseToSamePool: 420,
  faintedCooldownStep: -70,
  manaCarrierOneStepFromPool: 220,
  supermanaCarrierOneStepFromPoolExtra: 120,
  immediateWinningCarrier: 0,
});

export const FINISHER_BALANCED_SOFT_SCORING_WEIGHTS = freezeWeights({
  ...BALANCED_DISTANCE_SCORING_WEIGHTS,
  manaCarrierOneStepFromPool: 220,
  supermanaCarrierOneStepFromPoolExtra: 110,
  immediateWinningCarrier: 360,
});

export const FINISHER_BALANCED_SOFT_AGGRESSIVE_SCORING_WEIGHTS = freezeWeights({
  ...BALANCED_DISTANCE_SCORING_WEIGHTS,
  manaCarrierOneStepFromPool: 250,
  supermanaCarrierOneStepFromPoolExtra: 130,
  immediateWinningCarrier: 540,
});

export const MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS = freezeWeights({
  ...MANA_RACE_LITE_SCORING_WEIGHTS,
  regularManaToOwnerPool: 170,
  regularManaDrainerControl: 18,
  manaCloseToSamePool: 380,
  drainerCloseToOwnPool: 320,
  manaCarrierAtRisk: -210,
  manaCarrierGuarded: 95,
  manaCarrierOneStepFromPool: 260,
  supermanaCarrierOneStepFromPoolExtra: 150,
  immediateWinningCarrier: 300,
});

export const TACTICAL_BALANCED_SCORING_WEIGHTS = freezeWeights({
  ...BALANCED_DISTANCE_SCORING_WEIGHTS,
  faintedCooldownStep: -120,
  spiritCloseToEnemy: 230,
  angelGuardingDrainer: 300,
  manaCarrierAtRisk: -200,
  manaCarrierGuarded: 110,
  manaCarrierOneStepFromPool: 240,
  supermanaCarrierOneStepFromPoolExtra: 150,
});

export const TACTICAL_BALANCED_AGGRESSIVE_SCORING_WEIGHTS = freezeWeights({
  ...TACTICAL_BALANCED_SCORING_WEIGHTS,
  faintedCooldownStep: -160,
  manaCarrierAtRisk: -260,
  manaCarrierGuarded: 140,
  manaCarrierOneStepFromPool: 320,
  supermanaCarrierOneStepFromPoolExtra: 220,
  spiritCloseToEnemy: 250,
  angelGuardingDrainer: 320,
});

export const RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS = freezeWeights({
  ...MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS,
  useHeuristicFormula: false,
  confirmedScore: 920,
  drainerBestManaPath: 250,
  drainerPickupScoreThisTurn: 210,
  manaCarrierScoreThisTurn: 290,
  drainerImmediateThreat: -220,
  scoreRacePathProgress: 165,
  opponentScoreRacePathProgress: 150,
  scoreRaceMultiPath: 60,
  opponentScoreRaceMultiPath: 90,
  immediateScoreWindow: 240,
  opponentImmediateScoreWindow: 220,
  immediateScoreMultiWindow: 80,
  opponentImmediateScoreMultiWindow: 120,
  spiritActionUtility: 56,
  drainerCloseToMana: 360,
  drainerHoldingMana: 430,
  manaCarrierAtRisk: -285,
  manaCarrierGuarded: 145,
  manaCarrierOneStepFromPool: 320,
  supermanaCarrierOneStepFromPoolExtra: 210,
  immediateWinningCarrier: 520,
});

export const RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF =
  freezeWeights({
    ...RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS,
    hasConsumable: 320,
    spiritActionUtility: 72,
  });

export const RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS = freezeWeights({
  ...RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS,
  drainerDangerBoolean: -400,
  manaCarrierDangerBoolean: -300,
  supermanaRaceControl: 30,
});

export const RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS_POTION_PREF =
  freezeWeights({
    ...RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS,
    hasConsumable: 320,
    spiritActionUtility: 72,
  });

export function evaluatePreferabilityWithWeightsAndExactPolicy(
  game: MonsGame,
  color: Color,
  weights: ScoringWeights,
  allowExactStrategic: boolean,
): number {
  const context = new ScoringEvalContext(game, allowExactStrategic);
  return evaluatePreferabilityWithContext(
    game,
    color,
    weights,
    allowExactStrategic,
    context,
  );
}

export function evaluatePreferabilityWithContext(
  game: MonsGame,
  color: Color,
  weights: ScoringWeights,
  allowExactStrategic: boolean,
  context: ScoringEvalContext,
): number {
  const useHeuristicFormula = allowExactStrategic
    ? weights.useHeuristicFormula
    : true;
  const includeRegularManaMoveWindows =
    weights.includeRegularManaMoveWindows && !useHeuristicFormula;
  const includeMatchPointWindow =
    weights.includeMatchPointWindow && !useHeuristicFormula;
  const nextTurnWindowScaleBp = Math.min(
    20_000,
    Math.max(0, toI32(weights.nextTurnWindowScaleBp)),
  );
  const supermanaBase = game.board.supermanaBase();
  const remainingMonMovesForActive = Math.max(
    0,
    subI32(MONS_MOVES_PER_TURN, game.monsMovesCount),
  );
  const exactAnalysis = useHeuristicFormula
    ? undefined
    : context.exactAnalysis(game);
  const myExactSummary = exactAnalysis?.colorSummary(color);
  const opponentExactSummary = exactAnalysis?.colorSummary(otherColor(color));
  const myScoreNow = color === Color.White ? game.whiteScore : game.blackScore;
  const opponentScoreNow =
    color === Color.White ? game.blackScore : game.whiteScore;

  const scoreDifference =
    color === Color.White
      ? subI32(game.whiteScore, game.blackScore)
      : subI32(game.blackScore, game.whiteScore);
  const potionDifference =
    color === Color.White
      ? subI32(game.whitePotionsCount, game.blackPotionsCount)
      : subI32(game.blackPotionsCount, game.whitePotionsCount);
  let score = addI32(
    mulI32(scoreDifference, weights.confirmedScore),
    mulI32(potionDifference, weights.hasConsumable),
  );
  if (weights.doubleConfirmedScore) {
    score = mulI32(score, weights.confirmedScore);
  }

  const addScore = (value: number): void => {
    score = addI32(score, value);
  };
  const addSigned = (multiplier: number, value: number): void => {
    addScore(mulI32(multiplier, value));
  };
  const addSignedRatio = (
    multiplier: number,
    value: number,
    divisor: number,
  ): void => {
    addScore(divI32(mulI32(multiplier, value), divisor));
  };

  const evaluateDrainer = (
    mon: Mon,
    location: Location,
    multiplier: number,
    includeHeuristicPickupPath: boolean,
  ): void => {
    const safety = drainerSafetySnapshotWithContext(
      game.board,
      mon.color,
      location,
      useHeuristicFormula,
      weights.drainerWalkThreatBoolean !== 0,
      context,
    );
    addSignedRatio(multiplier, weights.drainerCloseToMana, safety.minMana);
    addSignedRatio(
      multiplier,
      weights.drainerCloseToOwnPool,
      distance(location, { kind: "closest-pool", color: mon.color }),
    );
    addSignedRatio(
      multiplier,
      weights.drainerCloseToSupermana,
      distanceToLocation(location, supermanaBase),
    );
    if (!guardedAgainstExactAttack(safety)) {
      addSignedRatio(multiplier, weights.drainerAtRisk, safety.riskDanger);
    } else {
      addSigned(multiplier, weights.angelGuardingDrainer);
    }

    if (includeHeuristicPickupPath || !useHeuristicFormula) {
      const path = useHeuristicFormula
        ? bestDrainerPickupPathWithSnapshot(
            context.manaPathSnapshot(game.board),
            mon.color,
            location,
          )
        : exactAnalysis?.colorSummary(mon.color).bestDrainerPickup;
      if (path !== undefined) {
        const pathSteps = "pathSteps" in path ? path.pathSteps : path[0];
        const totalMoves =
          "totalMoves" in path ? path.totalMoves : addI32(pathSteps, 1);
        const manaValue = "manaValue" in path ? path.manaValue : path[1];
        addSignedRatio(
          multiplier,
          mulI32(weights.drainerBestManaPath, manaValue),
          addI32(pathSteps, 1),
        );
        if (
          mon.color === game.activeColor &&
          totalMoves <= remainingMonMovesForActive
        ) {
          addSigned(
            multiplier,
            mulI32(weights.drainerPickupScoreThisTurn, manaValue),
          );
        }
      }
    }

    if (weights.drainerImmediateThreat !== 0) {
      const [actionThreats, bombThreats] = drainerImmediateThreatsWithContext(
        game.board,
        mon.color,
        location,
        context,
      );
      const immediateThreats = safety.angelNearby
        ? bombThreats
        : addI32(actionThreats, bombThreats);
      if (immediateThreats > 0) {
        addSigned(
          multiplier,
          mulI32(weights.drainerImmediateThreat, immediateThreats),
        );
      }
    }

    const evaluateDanger =
      weights.drainerDangerBoolean !== 0 ||
      weights.drainerWalkThreatBoolean !== 0;
    const underDangerThreat = evaluateDanger && safety.exactDangerThreat;
    if (weights.drainerDangerBoolean !== 0 && underDangerThreat) {
      addSigned(multiplier, weights.drainerDangerBoolean);
      if (multiplier === -1) {
        addScore(weights.opponentDrainerAttackBonus);
      }
    }
    if (
      weights.drainerWalkThreatBoolean !== 0 &&
      !underDangerThreat &&
      safety.walkThreat
    ) {
      addSigned(multiplier, weights.drainerWalkThreatBoolean);
    }
  };

  const evaluateSpirit = (
    mon: Mon,
    location: Location,
    multiplier: number,
  ): void => {
    const enemyDistance = nearestEnemyMonDistanceWithContext(
      game.board,
      mon.color,
      location,
      context,
    );
    addSignedRatio(multiplier, weights.spiritCloseToEnemy, enemyDistance);
    addSigned(
      -multiplier,
      spiritOnOwnBasePenalty(
        game.board,
        mon,
        location,
        weights.spiritOnOwnBasePenalty,
      ),
    );
    const utilityCap = useHeuristicFormula ? 4 : 6;
    let utility: number;
    let pressureBonus: number;
    if (useHeuristicFormula) {
      utility = spiritActionUtility(game.board, mon.color, location, true);
      pressureBonus = 0;
    } else {
      const spirit = exactSummaryForScoring(
        requireExactSummary(myExactSummary),
        requireExactSummary(opponentExactSummary),
        mon.color,
        color,
      ).spirit;
      utility = spirit.utility;
      pressureBonus = exactSpiritPressureBonus(spirit, weights);
    }
    addSigned(
      multiplier,
      mulI32(weights.spiritActionUtility, Math.min(utility, utilityCap)),
    );
    addSigned(multiplier, pressureBonus);
  };

  for (const [location, item] of game.board.occupied()) {
    switch (item.kind) {
      case "mon": {
        const mon = item.mon;
        const multiplier = mon.color === color ? 1 : -1;
        if (isMonFainted(mon)) {
          addSigned(
            multiplier,
            mon.kind === MonKind.Drainer
              ? weights.faintedDrainer
              : weights.faintedMon,
          );
          addSigned(
            multiplier,
            mulI32(weights.faintedCooldownStep, mon.cooldown),
          );
        } else if (mon.kind === MonKind.Drainer) {
          evaluateDrainer(mon, location, multiplier, true);
        } else if (mon.kind === MonKind.Spirit) {
          evaluateSpirit(mon, location, multiplier);
        } else if (mon.kind === MonKind.Angel) {
          addSignedRatio(
            multiplier,
            weights.angelCloseToFriendlyDrainer,
            nearestFriendlyDrainerDistanceWithContext(
              game.board,
              mon.color,
              location,
              context,
            ),
          );
        } else {
          addSignedRatio(
            multiplier,
            weights.monCloseToCenter,
            distance(location, { kind: "center" }),
          );
        }
        if (
          weights.attackerCloseToOpponentDrainer !== 0 &&
          !isMonFainted(mon) &&
          (mon.kind === MonKind.Demon || mon.kind === MonKind.Mystic)
        ) {
          addSignedRatio(
            multiplier,
            weights.attackerCloseToOpponentDrainer,
            nearestFriendlyDrainerDistanceWithContext(
              game.board,
              otherColor(mon.color),
              location,
              context,
            ),
          );
        }
        if (!MON_BASE_INDICES.has(locationIndex(location))) {
          addSigned(multiplier, weights.activeMon);
        }
        break;
      }
      case "mon-with-consumable": {
        const mon = item.mon;
        const multiplier = mon.color === color ? 1 : -1;
        addSigned(multiplier, weights.hasConsumable);
        if (mon.kind === MonKind.Drainer) {
          evaluateDrainer(mon, location, multiplier, false);
        } else if (mon.kind === MonKind.Spirit) {
          evaluateSpirit(mon, location, multiplier);
        } else if (mon.kind === MonKind.Angel) {
          addSignedRatio(
            multiplier,
            weights.angelCloseToFriendlyDrainer,
            nearestFriendlyDrainerDistanceWithContext(
              game.board,
              mon.color,
              location,
              context,
            ),
          );
        } else {
          addSignedRatio(
            multiplier,
            weights.monCloseToCenter,
            distance(location, { kind: "center" }),
          );
        }
        if (
          weights.attackerCloseToOpponentDrainer !== 0 &&
          !isMonFainted(mon)
        ) {
          const isAttacker =
            mon.kind === MonKind.Demon ||
            mon.kind === MonKind.Mystic ||
            item.consumable === Consumable.Bomb;
          if (isAttacker) {
            addSignedRatio(
              multiplier,
              weights.attackerCloseToOpponentDrainer,
              nearestFriendlyDrainerDistanceWithContext(
                game.board,
                otherColor(mon.color),
                location,
                context,
              ),
            );
          }
        }
        if (
          !useHeuristicFormula &&
          !MON_BASE_INDICES.has(locationIndex(location))
        ) {
          addSigned(multiplier, weights.activeMon);
        }
        break;
      }
      case "mana": {
        addScore(
          divI32(
            weights.manaCloseToSamePool,
            distance(location, { kind: "closest-pool", color }),
          ),
        );
        let manaBonus: number;
        if (item.mana.kind === "regular") {
          const manaColor = item.mana.color;
          const ownerMultiplier = manaColor === color ? 1 : -1;
          const ownerPoolDistance = distance(location, {
            kind: "closest-pool",
            color: manaColor,
          });
          const ownerDrainerDistance =
            nearestFriendlyDrainerDistanceWithContext(
              game.board,
              manaColor,
              location,
              context,
            );
          const enemyDrainerDistance =
            nearestFriendlyDrainerDistanceWithContext(
              game.board,
              otherColor(manaColor),
              location,
              context,
            );
          const drainerControl = Math.min(
            4,
            Math.max(-4, subI32(enemyDrainerDistance, ownerDrainerDistance)),
          );
          manaBonus = mulI32(
            ownerMultiplier,
            addI32(
              divI32(weights.regularManaToOwnerPool, ownerPoolDistance),
              mulI32(weights.regularManaDrainerControl, drainerControl),
            ),
          );
          if (!useHeuristicFormula && manaColor === otherColor(color)) {
            manaBonus = addI32(
              manaBonus,
              mulI32(weights.opponentManaDenial, -drainerControl),
            );
          }
        } else {
          const myDrainerDistance = nearestFriendlyDrainerDistanceWithContext(
            game.board,
            color,
            location,
            context,
          );
          const enemyDrainerDistance =
            nearestFriendlyDrainerDistanceWithContext(
              game.board,
              otherColor(color),
              location,
              context,
            );
          const drainerControl = Math.min(
            4,
            Math.max(-4, subI32(enemyDrainerDistance, myDrainerDistance)),
          );
          manaBonus = addI32(
            mulI32(weights.supermanaDrainerControl, drainerControl),
            useHeuristicFormula
              ? 0
              : mulI32(weights.supermanaRaceControl, drainerControl),
          );
        }
        addScore(manaBonus);
        break;
      }
      case "mon-with-mana": {
        const { mon, mana } = item;
        const multiplier = mon.color === color ? 1 : -1;
        const nearestPoolDistance = distance(location, {
          kind: "any-closest-pool",
        });
        const manaExtra =
          mana.kind === "supermana"
            ? weights.extraForSupermana
            : mana.color === color
              ? 0
              : weights.extraForOpponentsMana;
        addSigned(multiplier, weights.drainerHoldingMana);
        addSignedRatio(
          multiplier,
          addI32(weights.monWithManaCloseToAnyPool, manaExtra),
          nearestPoolDistance,
        );
        if (nearestPoolDistance <= 2) {
          const immediateBonus =
            mana.kind === "supermana"
              ? addI32(
                  weights.manaCarrierOneStepFromPool,
                  weights.supermanaCarrierOneStepFromPoolExtra,
                )
              : weights.manaCarrierOneStepFromPool;
          addSigned(multiplier, immediateBonus);
          const carrierScore =
            mon.color === Color.White ? game.whiteScore : game.blackScore;
          if (
            addI32(carrierScore, manaScore(mana, mon.color)) >= TARGET_SCORE
          ) {
            addSigned(multiplier, weights.immediateWinningCarrier);
          }
        }

        const carriesHighValueMana =
          !useHeuristicFormula &&
          mon.kind === MonKind.Drainer &&
          (mana.kind === "supermana" || mana.color !== mon.color);
        const safety = drainerSafetySnapshotWithContext(
          game.board,
          mon.color,
          location,
          useHeuristicFormula,
          weights.manaCarrierWalkThreatBoolean !== 0 || carriesHighValueMana,
          context,
        );
        addSignedRatio(
          multiplier,
          weights.manaCarrierAtRisk,
          safety.riskDanger,
        );
        if (guardedAgainstExactAttack(safety)) {
          addSigned(multiplier, weights.manaCarrierGuarded);
        }
        if (
          !useHeuristicFormula &&
          mon.kind === MonKind.Drainer &&
          carriesHighValueMana
        ) {
          let virtualScoreBp: number;
          if (mana.kind === "supermana") {
            virtualScoreBp = saturatingMulI32(
              weights.supermanaRaceControl,
              PROTECTED_HIGH_VALUE_CARRIER_SUPERMANA_SCALE_BP,
            );
          } else if (mana.color !== mon.color) {
            virtualScoreBp = saturatingMulI32(
              weights.opponentManaDenial,
              PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_MANA_SCALE_BP,
            );
          } else {
            virtualScoreBp = 0;
          }
          virtualScoreBp = Math.min(
            PROTECTED_HIGH_VALUE_CARRIER_VIRTUAL_SCORE_BP_MAX,
            Math.max(0, virtualScoreBp),
          );
          const opponentScore =
            mon.color === Color.White ? game.blackScore : game.whiteScore;
          const opponentScoreLimit = Math.max(
            0,
            TARGET_SCORE - PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_SCORE_MARGIN,
          );
          if (
            virtualScoreBp > 0 &&
            exactSafe(safety) &&
            opponentScore <= opponentScoreLimit
          ) {
            const virtualTwoPointScore = saturatingMulI32(
              weights.confirmedScore,
              2,
            );
            addSigned(
              multiplier,
              scaleByBp(virtualTwoPointScore, virtualScoreBp),
            );
          }
        }
        if (mon.color === game.activeColor) {
          const poolSteps = nearestPoolDistance - 1;
          if (poolSteps <= remainingMonMovesForActive) {
            addSigned(multiplier, weights.manaCarrierScoreThisTurn);
          }
        }
        if (mon.kind === MonKind.Drainer) {
          addSignedRatio(
            multiplier,
            weights.drainerCloseToOwnPool,
            distance(location, { kind: "closest-pool", color: mon.color }),
          );
          const [actionThreats, bombThreats] =
            drainerImmediateThreatsWithContext(
              game.board,
              mon.color,
              location,
              context,
            );
          const immediateThreats = safety.angelNearby
            ? bombThreats
            : addI32(actionThreats, bombThreats);
          if (immediateThreats > 0) {
            addSigned(
              multiplier,
              mulI32(weights.drainerImmediateThreat, immediateThreats),
            );
          }
          const evaluateDanger =
            weights.manaCarrierDangerBoolean !== 0 ||
            weights.manaCarrierWalkThreatBoolean !== 0;
          const underDangerThreat = evaluateDanger && safety.exactDangerThreat;
          if (weights.manaCarrierDangerBoolean !== 0 && underDangerThreat) {
            addSigned(multiplier, weights.manaCarrierDangerBoolean);
            if (multiplier === -1) {
              addScore(weights.opponentDrainerAttackBonus);
            }
          }
          if (
            weights.manaCarrierWalkThreatBoolean !== 0 &&
            !underDangerThreat &&
            safety.walkThreat
          ) {
            addSigned(multiplier, weights.manaCarrierWalkThreatBoolean);
          }
        } else if (mon.kind === MonKind.Spirit) {
          addSigned(
            -multiplier,
            spiritOnOwnBasePenalty(
              game.board,
              mon,
              location,
              weights.spiritOnOwnBasePenalty,
            ),
          );
          const utilityCap = useHeuristicFormula ? 4 : 6;
          let utility: number;
          let pressureBonus: number;
          if (useHeuristicFormula) {
            utility = spiritActionUtility(
              game.board,
              mon.color,
              location,
              true,
            );
            pressureBonus = 0;
          } else {
            const spirit = exactSummaryForScoring(
              requireExactSummary(myExactSummary),
              requireExactSummary(opponentExactSummary),
              mon.color,
              color,
            ).spirit;
            utility = spirit.utility;
            pressureBonus = exactSpiritPressureBonus(spirit, weights);
          }
          addSigned(
            multiplier,
            mulI32(weights.spiritActionUtility, Math.min(utility, utilityCap)),
          );
          addSigned(multiplier, pressureBonus);
        }
        if (
          !useHeuristicFormula &&
          !MON_BASE_INDICES.has(locationIndex(location))
        ) {
          addSigned(multiplier, weights.activeMon);
        }
        break;
      }
      case "consumable":
        break;
    }
  }

  const myScorePathWindow = useHeuristicFormula
    ? scorePathWindowToAnyPoolForContext(
        game.board,
        context,
        color,
        false,
        includeRegularManaMoveWindows,
      )
    : exactScorePathWindowForContext(
        game.board,
        context,
        color,
        requireExactSummary(myExactSummary),
        includeRegularManaMoveWindows,
      );
  const opponentScorePathWindow = useHeuristicFormula
    ? scorePathWindowToAnyPoolForContext(
        game.board,
        context,
        otherColor(color),
        false,
        includeRegularManaMoveWindows,
      )
    : exactScorePathWindowForContext(
        game.board,
        context,
        otherColor(color),
        requireExactSummary(opponentExactSummary),
        includeRegularManaMoveWindows,
      );
  if (myScorePathWindow.bestSteps !== undefined) {
    addScore(
      scaleByBp(
        divI32(
          weights.scoreRacePathProgress,
          Math.max(1, myScorePathWindow.bestSteps),
        ),
        10_000,
      ),
    );
    if (!useHeuristicFormula) {
      addScore(
        scaleByBp(
          divI32(
            mulI32(weights.scoreRaceMultiPath, myScorePathWindow.multiPressure),
            100,
          ),
          10_000,
        ),
      );
    }
  }
  if (opponentScorePathWindow.bestSteps !== undefined) {
    addScore(
      -scaleByBp(
        divI32(
          weights.opponentScoreRacePathProgress,
          Math.max(1, opponentScorePathWindow.bestSteps),
        ),
        10_000,
      ),
    );
    if (!useHeuristicFormula) {
      addScore(
        -scaleByBp(
          divI32(
            mulI32(
              weights.opponentScoreRaceMultiPath,
              opponentScorePathWindow.multiPressure,
            ),
            100,
          ),
          10_000,
        ),
      );
    }
  }

  if (game.activeColor === color) {
    const immediateWindow = useHeuristicFormula
      ? immediateScoreWindowSummaryForContext(
          game.board,
          context,
          color,
          remainingMonMovesForActive,
          false,
          includeRegularManaMoveWindows,
          includeRegularManaMoveWindows && game.playerCanMoveMana(),
        )
      : exactImmediateScoreWindowForContext(
          game.board,
          context,
          color,
          requireExactSummary(myExactSummary),
          includeRegularManaMoveWindows && game.playerCanMoveMana(),
        );
    addScore(
      scaleByBp(
        mulI32(weights.immediateScoreWindow, immediateWindow.bestScore),
        10_000,
      ),
    );
    if (!useHeuristicFormula) {
      addScore(
        scaleByBp(
          divI32(
            mulI32(
              weights.immediateScoreMultiWindow,
              immediateWindow.multiPressure,
            ),
            100,
          ),
          10_000,
        ),
      );
      const opponentNextTurnWindow = exactImmediateScoreWindowForContext(
        game.board,
        context,
        otherColor(color),
        requireExactSummary(opponentExactSummary),
        includeRegularManaMoveWindows,
      );
      addScore(
        -scaleByBp(
          divI32(
            mulI32(
              mulI32(
                weights.opponentImmediateScoreWindow,
                opponentNextTurnWindow.bestScore,
              ),
              nextTurnWindowScaleBp,
            ),
            10_000,
          ),
          10_000,
        ),
      );
      addScore(
        -scaleByBp(
          divI32(
            mulI32(
              mulI32(
                weights.opponentImmediateScoreMultiWindow,
                opponentNextTurnWindow.multiPressure,
              ),
              nextTurnWindowScaleBp,
            ),
            1_000_000,
          ),
          10_000,
        ),
      );
      if (includeMatchPointWindow) {
        if (addI32(myScoreNow, immediateWindow.bestScore) >= TARGET_SCORE) {
          addScore(weights.immediateWinningCarrier);
        }
        if (
          addI32(opponentScoreNow, opponentNextTurnWindow.bestScore) >=
          TARGET_SCORE
        ) {
          addScore(-weights.immediateWinningCarrier);
        }
      }
    }
  } else {
    const opponentImmediateWindow = useHeuristicFormula
      ? immediateScoreWindowSummaryForContext(
          game.board,
          context,
          otherColor(color),
          remainingMonMovesForActive,
          false,
          includeRegularManaMoveWindows,
          includeRegularManaMoveWindows && game.playerCanMoveMana(),
        )
      : exactImmediateScoreWindowForContext(
          game.board,
          context,
          otherColor(color),
          requireExactSummary(opponentExactSummary),
          includeRegularManaMoveWindows && game.playerCanMoveMana(),
        );
    addScore(
      -scaleByBp(
        mulI32(
          weights.opponentImmediateScoreWindow,
          opponentImmediateWindow.bestScore,
        ),
        10_000,
      ),
    );
    if (!useHeuristicFormula) {
      addScore(
        -scaleByBp(
          divI32(
            mulI32(
              weights.opponentImmediateScoreMultiWindow,
              opponentImmediateWindow.multiPressure,
            ),
            100,
          ),
          10_000,
        ),
      );
      const myNextTurnWindow = exactImmediateScoreWindowForContext(
        game.board,
        context,
        color,
        requireExactSummary(myExactSummary),
        includeRegularManaMoveWindows,
      );
      addScore(
        scaleByBp(
          divI32(
            mulI32(
              mulI32(weights.immediateScoreWindow, myNextTurnWindow.bestScore),
              nextTurnWindowScaleBp,
            ),
            10_000,
          ),
          10_000,
        ),
      );
      addScore(
        scaleByBp(
          divI32(
            mulI32(
              mulI32(
                weights.immediateScoreMultiWindow,
                myNextTurnWindow.multiPressure,
              ),
              nextTurnWindowScaleBp,
            ),
            1_000_000,
          ),
          10_000,
        ),
      );
      if (includeMatchPointWindow) {
        if (
          addI32(opponentScoreNow, opponentImmediateWindow.bestScore) >=
          TARGET_SCORE
        ) {
          addScore(-weights.immediateWinningCarrier);
        }
        if (addI32(myScoreNow, myNextTurnWindow.bestScore) >= TARGET_SCORE) {
          addScore(weights.immediateWinningCarrier);
        }
      }
    }
  }

  return score;
}

function requireExactSummary(
  summary: ExactColorSummary | undefined,
): ExactColorSummary {
  if (summary === undefined) {
    throw new Error("exact strategic analysis should be available");
  }
  return summary;
}

export function scaleByBp(value: number, basisPoints: number): number {
  const scaled = (BigInt(toI32(value)) * BigInt(toI32(basisPoints))) / 10_000n;
  return Number(BigInt.asIntN(32, scaled));
}

function exactSummaryForScoring(
  mySummary: ExactColorSummary,
  opponentSummary: ExactColorSummary,
  actorColor: Color,
  perspective: Color,
): ExactColorSummary {
  return actorColor === perspective ? mySummary : opponentSummary;
}

function spiritOnOwnBasePenalty(
  board: Board,
  mon: Mon,
  location: Location,
  penalty: number,
): number {
  return mon.kind === MonKind.Spirit &&
    !isMonFainted(mon) &&
    locationEquals(location, board.base(mon))
    ? penalty
    : 0;
}

type ScorePathWindow = {
  readonly bestSteps: number | undefined;
  readonly multiPressure: number;
};

type ImmediateScoreWindow = {
  readonly bestScore: number;
  readonly multiPressure: number;
};

type ManaPathCandidate = {
  readonly location: Location;
  readonly scoreSteps: number;
  readonly mana: Mana;
};

type ManaPathSnapshot = {
  readonly candidates: ManaPathCandidate[];
  readonly regularManaMoveScores: readonly [number, number];
};

function manaPathSnapshot(summary: ScoringBoardSummary): ManaPathSnapshot {
  return {
    candidates: summary.manaEntries.map((entry) => ({
      location: entry.location,
      scoreSteps: distance(entry.location, { kind: "any-closest-pool" }) - 1,
      mana: entry.mana,
    })),
    regularManaMoveScores: [
      summary.regularManaMoveScores[0],
      summary.regularManaMoveScores[1],
    ],
  };
}

function exactScorePathWindowForContext(
  board: Board,
  context: ScoringEvalContext,
  color: Color,
  exactSummary: ExactColorSummary,
  includeRegularManaMoveWindows: boolean,
): ScorePathWindow {
  if (!includeRegularManaMoveWindows) {
    return exactSummary.scorePathWindow;
  }
  const summary = context.boardSummary(board);
  const candidateSteps = summary.regularManaScorePathSteps[colorSlot(color)];
  const bestSteps =
    candidateSteps === undefined
      ? exactSummary.scorePathWindow.bestSteps
      : exactSummary.scorePathWindow.bestSteps === undefined
        ? candidateSteps
        : Math.min(candidateSteps, exactSummary.scorePathWindow.bestSteps);
  return {
    bestSteps,
    multiPressure: exactSummary.scorePathWindow.multiPressure,
  };
}

function scorePathWindowToAnyPoolForContext(
  board: Board,
  context: ScoringEvalContext,
  color: Color,
  includeDrainerPickups: boolean,
  includeRegularManaMoveWindows: boolean,
): ScorePathWindow {
  const summary = context.boardSummary(board);
  const topSteps = [0x7fff_ffff, 0x7fff_ffff, 0x7fff_ffff];
  for (const carrier of summary.liveManaCarriers[colorSlot(color)]) {
    insertLowestStep(
      topSteps,
      distance(carrier.location, { kind: "any-closest-pool" }),
    );
  }
  if (includeDrainerPickups) {
    const snapshot = context.manaPathSnapshot(board);
    for (const location of summary.liveDrainerLocations[colorSlot(color)]) {
      const pickup = bestDrainerPickupPathWithSnapshot(
        snapshot,
        color,
        location,
      );
      if (pickup !== undefined) {
        insertLowestStep(topSteps, addI32(pickup[0], 1));
      }
    }
  }
  if (includeRegularManaMoveWindows) {
    const candidate = summary.regularManaScorePathSteps[colorSlot(color)];
    if (candidate !== undefined) {
      insertLowestStep(topSteps, candidate);
    }
  }
  const bestSteps = topSteps[0] === 0x7fff_ffff ? undefined : topSteps[0];
  let multiPressure = 0;
  if (topSteps[1] !== 0x7fff_ffff) {
    multiPressure = addI32(
      multiPressure,
      divI32(70, Math.max(1, topSteps[1] ?? 1)),
    );
  }
  if (topSteps[2] !== 0x7fff_ffff) {
    multiPressure = addI32(
      multiPressure,
      divI32(40, Math.max(1, topSteps[2] ?? 1)),
    );
  }
  return { bestSteps, multiPressure };
}

function exactImmediateScoreWindowForContext(
  board: Board,
  context: ScoringEvalContext,
  color: Color,
  exactSummary: ExactColorSummary,
  allowManaMove: boolean,
): ImmediateScoreWindow {
  if (!allowManaMove) {
    return exactSummary.immediateWindow;
  }
  const regularScore =
    context.boardSummary(board).regularManaMoveScores[colorSlot(color)];
  return {
    bestScore: Math.max(exactSummary.immediateWindow.bestScore, regularScore),
    multiPressure: exactSummary.immediateWindow.multiPressure,
  };
}

function immediateScoreWindowSummaryForContext(
  board: Board,
  context: ScoringEvalContext,
  color: Color,
  remainingMonMoves: number,
  includeDrainerPickups: boolean,
  includeRegularManaMoveWindows: boolean,
  allowManaMove: boolean,
): ImmediateScoreWindow {
  if (remainingMonMoves <= 0) {
    return { bestScore: 0, multiPressure: 0 };
  }
  const summary = context.boardSummary(board);
  const topScores = [0, 0, 0];
  for (const carrier of summary.liveManaCarriers[colorSlot(color)]) {
    const poolSteps =
      distance(carrier.location, { kind: "any-closest-pool" }) - 1;
    if (poolSteps <= remainingMonMoves) {
      insertTopScore(topScores, manaScore(carrier.mana, color));
    }
  }
  if (includeDrainerPickups) {
    const snapshot = context.manaPathSnapshot(board);
    for (const location of summary.liveDrainerLocations[colorSlot(color)]) {
      let bestPickupScore = 0;
      for (const candidate of snapshot.candidates) {
        const pickupSteps = locationDistance(location, candidate.location);
        if (addI32(pickupSteps, candidate.scoreSteps) <= remainingMonMoves) {
          bestPickupScore = Math.max(
            bestPickupScore,
            manaScore(candidate.mana, color),
          );
        }
      }
      if (bestPickupScore > 0) {
        insertTopScore(topScores, bestPickupScore);
      }
    }
  }
  if (includeRegularManaMoveWindows && allowManaMove) {
    const regularScore = summary.regularManaMoveScores[colorSlot(color)];
    if (regularScore > 0) {
      insertTopScore(topScores, regularScore);
    }
  }
  return {
    bestScore: topScores[0] ?? 0,
    multiPressure: addI32(
      mulI32(topScores[1] ?? 0, 70),
      mulI32(topScores[2] ?? 0, 35),
    ),
  };
}

function exactSpiritPressureBonus(
  spirit: ExactSpiritSummary,
  weights: ScoringWeights,
): number {
  const setupGain = Math.min(4, Math.max(0, spirit.nextTurnSetupGain));
  let bonus = 0;
  if (setupGain > 0) {
    bonus = saturatingAddI32(
      bonus,
      divI32(
        saturatingMulI32(Math.max(0, weights.scoreRacePathProgress), setupGain),
        4,
      ),
    );
    bonus = saturatingAddI32(
      bonus,
      divI32(
        saturatingMulI32(
          Math.max(0, weights.opponentScoreRacePathProgress),
          setupGain,
        ),
        6,
      ),
    );
    bonus = saturatingAddI32(
      bonus,
      divI32(
        saturatingMulI32(Math.max(0, weights.scoreRaceMultiPath), setupGain),
        8,
      ),
    );
    bonus = saturatingAddI32(
      bonus,
      divI32(
        saturatingMulI32(
          Math.max(0, weights.opponentScoreRaceMultiPath),
          setupGain,
        ),
        10,
      ),
    );
  }
  if (spirit.supermanaProgress && !spirit.sameTurnScore) {
    bonus = saturatingAddI32(
      saturatingAddI32(
        bonus,
        saturatingMulI32(Math.max(0, weights.supermanaRaceControl), 3),
      ),
      divI32(Math.max(0, weights.drainerBestManaPath), 4),
    );
  }
  if (spirit.opponentManaProgress && !spirit.sameTurnOpponentManaScore) {
    bonus = saturatingAddI32(
      saturatingAddI32(
        saturatingAddI32(
          bonus,
          saturatingMulI32(Math.max(0, weights.opponentManaDenial), 3),
        ),
        divI32(Math.max(0, weights.drainerBestManaPath), 4),
      ),
      divI32(Math.max(0, weights.scoreRacePathProgress), 5),
    );
  }
  return bonus;
}

function spiritActionUtility(
  board: Board,
  spiritColor: Color,
  location: Location,
  useHeuristicFormula: boolean,
): number {
  const heuristicUtility = spiritReachableLocations(location).filter(
    (target) => {
      const item = board.item(target);
      if (item === undefined) {
        return false;
      }
      const mon = itemMon(item);
      return mon === undefined || !isMonFainted(mon);
    },
  ).length;
  if (useHeuristicFormula) {
    return heuristicUtility;
  }
  const item = board.item(location);
  const mon = item === undefined ? undefined : itemMon(item);
  if (
    mon?.kind !== MonKind.Spirit ||
    mon.color !== spiritColor ||
    isMonFainted(mon)
  ) {
    return heuristicUtility;
  }
  const game = new MonsGame(false, board.variant());
  game.board = board.clone();
  game.activeColor = spiritColor;
  game.turnNumber = 2;
  return Math.max(
    exactStrategicAnalysis(game).colorSummary(spiritColor).spirit.utility,
    spiritReachableLocations(location).filter(
      (target) => board.item(target) !== undefined,
    ).length,
  );
}

function colorSlot(color: Color): 0 | 1 {
  return color === Color.White ? 0 : 1;
}

function insertLowestStep(topSteps: number[], step: number): void {
  if (step >= (topSteps[2] ?? 0x7fff_ffff)) {
    return;
  }
  if (step < (topSteps[0] ?? 0x7fff_ffff)) {
    topSteps[2] = topSteps[1] ?? 0x7fff_ffff;
    topSteps[1] = topSteps[0] ?? 0x7fff_ffff;
    topSteps[0] = step;
  } else if (step < (topSteps[1] ?? 0x7fff_ffff)) {
    topSteps[2] = topSteps[1] ?? 0x7fff_ffff;
    topSteps[1] = step;
  } else {
    topSteps[2] = step;
  }
}

function insertTopScore(topScores: number[], value: number): void {
  if (value <= (topScores[2] ?? 0)) {
    return;
  }
  if (value > (topScores[0] ?? 0)) {
    topScores[2] = topScores[1] ?? 0;
    topScores[1] = topScores[0] ?? 0;
    topScores[0] = value;
  } else if (value > (topScores[1] ?? 0)) {
    topScores[2] = topScores[1] ?? 0;
    topScores[1] = value;
  } else {
    topScores[2] = value;
  }
}

function bestDrainerPickupPathWithSnapshot(
  snapshot: ManaPathSnapshot,
  color: Color,
  from: Location,
): readonly [number, number] | undefined {
  let best: readonly [number, number] | undefined;
  for (const candidate of snapshot.candidates) {
    const pickupSteps = locationDistance(from, candidate.location);
    const totalSteps = addI32(pickupSteps, candidate.scoreSteps);
    const manaValue = manaScore(candidate.mana, color);
    if (best === undefined) {
      best = [totalSteps, manaValue];
      continue;
    }
    const metric = subI32(mulI32(totalSteps, 3), manaValue);
    const bestMetric = subI32(mulI32(best[0], 3), best[1]);
    if (metric < bestMetric || (metric === bestMetric && manaValue > best[1])) {
      best = [totalSteps, manaValue];
    }
  }
  return best;
}

function drainerDistancesWithContext(
  board: Board,
  color: Color,
  location: Location,
  useHeuristicFormula: boolean,
  context: ScoringEvalContext,
): readonly [number, number, boolean] {
  const summary = context.boardSummary(board);
  let minMana = BOARD_SIZE;
  let minDanger = BOARD_SIZE;
  for (const entry of summary.manaEntries) {
    minMana = Math.min(minMana, locationDistance(entry.location, location));
  }
  for (const danger of summary.dangerSources[colorSlot(otherColor(color))]) {
    if (useHeuristicFormula) {
      if (danger.heuristicThreat) {
        minDanger = Math.min(
          minDanger,
          locationDistance(danger.location, location),
        );
      }
      continue;
    }
    let delta = 0x7fff_ffff;
    if (danger.exactActionThreat) {
      delta = locationDistance(danger.location, location);
    }
    if (danger.exactBombThreat) {
      const bombDelta = Math.max(
        1,
        locationDistance(danger.location, location) - 2,
      );
      delta = Math.min(delta, bombDelta);
    }
    minDanger = Math.min(minDanger, delta);
  }
  if (useHeuristicFormula) {
    for (const consumable of summary.looseConsumableLocations) {
      minDanger = Math.min(minDanger, locationDistance(consumable, location));
    }
  }
  const angelNearby = summary.liveAngelLocations[colorSlot(color)].some(
    (angel) => locationDistance(angel, location) === 1,
  );
  return useHeuristicFormula
    ? [minDanger, minMana, angelNearby]
    : [Math.max(1, minDanger), Math.max(1, minMana), angelNearby];
}

function drainerSafetySnapshotWithContext(
  board: Board,
  color: Color,
  location: Location,
  useHeuristicFormula: boolean,
  includeWalkThreat: boolean,
  context: ScoringEvalContext,
): DrainerSafetySnapshot {
  const [rawDanger, minMana, angelNearby] = drainerDistancesWithContext(
    board,
    color,
    location,
    useHeuristicFormula,
    context,
  );
  const exactDangerThreat = useHeuristicFormula
    ? isDrainerUnderImmediateThreat(board, color, location, angelNearby)
    : context.canAttackTargetOnBoard(
        board,
        otherColor(color),
        color,
        location,
        MONS_MOVES_PER_TURN,
        true,
      );
  const walkThreat =
    includeWalkThreat &&
    !exactDangerThreat &&
    isDrainerUnderWalkThreatWithHash(
      board,
      context.boardHash(),
      color,
      location,
      angelNearby,
    );
  return {
    riskDanger: useHeuristicFormula
      ? Math.max(1, rawDanger)
      : exactDangerThreat
        ? 1
        : Math.max(1, rawDanger),
    minMana,
    angelNearby,
    exactDangerThreat,
    walkThreat,
  };
}

function drainerImmediateThreatsWithContext(
  board: Board,
  color: Color,
  location: Location,
  context: ScoringEvalContext | undefined,
): readonly [number, number] {
  return context === undefined
    ? drainerImmediateThreats(board, color, location)
    : context.drainerImmediateThreats(board, color, location);
}

function nearestEnemyMonDistanceWithContext(
  board: Board,
  color: Color,
  location: Location,
  context: ScoringEvalContext,
): number {
  let best = BOARD_SIZE;
  for (const occupied of context.boardSummary(board).liveMonLocations[
    colorSlot(otherColor(color))
  ]) {
    best = Math.min(best, locationDistance(occupied, location));
  }
  return Math.max(1, best);
}

function nearestFriendlyDrainerDistanceWithContext(
  board: Board,
  color: Color,
  location: Location,
  context: ScoringEvalContext,
): number {
  let best = BOARD_SIZE;
  for (const occupied of context.boardSummary(board).liveDrainerLocations[
    colorSlot(color)
  ]) {
    best = Math.min(best, locationDistance(occupied, location));
  }
  return Math.max(1, best);
}

type Destination =
  | { readonly kind: "center" }
  | { readonly kind: "any-closest-pool" }
  | { readonly kind: "closest-pool"; readonly color: Color };

export function distanceToLocation(
  location: Location,
  destination: Location,
): number {
  return addI32(locationDistance(location, destination), 1);
}

function distance(location: Location, destination: Destination): number {
  let result: number;
  switch (destination.kind) {
    case "center":
      result = Math.max(1, Math.abs(BOARD_CENTER_INDEX - location.i));
      break;
    case "any-closest-pool":
      result = Math.max(
        Math.min(location.i, Math.abs(MAX_LOCATION_INDEX - location.i)),
        Math.min(location.j, Math.abs(MAX_LOCATION_INDEX - location.j)),
      );
      break;
    case "closest-pool": {
      const poolRow =
        destination.color === Color.White ? MAX_LOCATION_INDEX : 0;
      result = Math.max(
        Math.abs(poolRow - location.i),
        Math.min(location.j, Math.abs(MAX_LOCATION_INDEX - location.j)),
      );
      break;
    }
  }
  return addI32(result, 1);
}
