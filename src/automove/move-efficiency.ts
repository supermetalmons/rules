import { boardEquals } from "../engine/board.js";
import { BOARD_SIZE, MONS_MOVES_PER_TURN } from "../engine/config.js";
import {
  Color,
  MonKind,
  isMonFainted,
  itemMon,
  manaScore,
  otherColor,
  type Event,
} from "../engine/domain.js";
import { MonsGame } from "../engine/game.js";
import {
  locationDistance,
  locationEquals,
  type Location,
} from "../engine/geometry.js";
import { addI32, mulI32, subI32 } from "../engine/numerics.js";
import { cacheWriteAllowed } from "./deadline.js";
import {
  EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS,
  EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
  EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL,
  EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE,
  EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS,
  exactStrategicAnalysis,
  exactTurnTacticalProjectionWithSearchHash,
  type ExactTurnTacticalProjection,
} from "./exact.js";
import { Hash64Table, type Hash64 } from "./hash64.js";

const MOVE_EFFICIENCY_SNAPSHOT_CACHE_MAX_ENTRIES = 16_384;
const UNKNOWN_STEPS = BOARD_SIZE + 4;
const NO_EFFECT_ROOT_PENALTY = 120;
const LOW_IMPACT_ROOT_PENALTY = 40;
const SPIRIT_DEPLOY_EFFICIENCY_BONUS = 90;
const SPIRIT_ACTION_TARGET_DELTA_WEIGHT = 22;

/** Value snapshot used by both root and child move ordering. */
export type MoveEfficiencySnapshot = {
  readonly myBestCarrierSteps: number;
  readonly opponentBestCarrierSteps: number;
  readonly myBestDrainerToManaSteps: number;
  readonly opponentBestDrainerToManaSteps: number;
  readonly myCarrierCount: number;
  readonly opponentCarrierCount: number;
  readonly mySpiritOnBase: boolean;
  readonly opponentSpiritOnBase: boolean;
  readonly mySpiritActionTargets: number;
  readonly opponentSpiritActionTargets: number;
  readonly mySameTurnScoreValue: number;
  readonly opponentSameTurnScoreValue: number;
  readonly mySameTurnOpponentManaScoreValue: number;
  readonly opponentSameTurnOpponentManaScoreValue: number;
  readonly mySafeSupermanaProgress: boolean;
  readonly opponentSafeSupermanaProgress: boolean;
  readonly mySafeOpponentManaProgress: boolean;
  readonly opponentSafeOpponentManaProgress: boolean;
  readonly mySafeSupermanaProgressSteps: number;
  readonly opponentSafeSupermanaProgressSteps: number;
  readonly mySafeOpponentManaProgressSteps: number;
  readonly opponentSafeOpponentManaProgressSteps: number;
};

export type MoveEfficiencyDeltaPolicy = {
  readonly isRoot: boolean;
  readonly applyBacktrackPenalty: boolean;
  readonly applyRootManaHandoffGuard: boolean;
  readonly rootBacktrackPenalty: number;
  readonly rootManaHandoffPenalty: number;
};

export type MoveEfficiencyDeltaOptions = MoveEfficiencyDeltaPolicy & {
  readonly includeTacticalExact: boolean;
  readonly includeStrategicExact: boolean;
};

const moveEfficiencySnapshotCache = new Hash64Table<MoveEfficiencySnapshot>(
  MOVE_EFFICIENCY_SNAPSHOT_CACHE_MAX_ENTRIES,
);

function snapshotCacheTag(
  perspective: Color,
  includeTacticalExact: boolean,
  includeStrategicExact: boolean,
): number {
  return (
    perspective |
    (Number(includeTacticalExact) << 1) |
    (Number(includeStrategicExact) << 2)
  );
}

function defaultTacticalProjection(
  sameTurnScoreWindowValue: number,
): ExactTurnTacticalProjection {
  return {
    safeSupermanaProgress: false,
    safeSupermanaProgressSteps: undefined,
    safeOpponentManaProgress: false,
    safeOpponentManaProgressSteps: undefined,
    spiritAssistedScore: false,
    spiritAssistedScoreValue: 0,
    spiritAssistedDenial: false,
    spiritAssistedDenialValue: 0,
    sameTurnScoreWindowValue,
  };
}

function moveEfficiencyTacticalProjectionFlags(): number {
  return (
    EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS |
    EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS |
    EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE |
    EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL |
    EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW
  );
}

export function distanceToAnyPoolStepsForEfficiency(
  location: Location,
): number {
  const maxIndex = BOARD_SIZE - 1;
  return (
    Math.max(
      Math.min(location.i, maxIndex - location.i),
      Math.min(location.j, maxIndex - location.j),
    ) + 1
  );
}

export function distanceToColorPoolStepsForEfficiency(
  location: Location,
  color: Color,
): number {
  const maxIndex = BOARD_SIZE - 1;
  const poolRow = color === Color.White ? maxIndex : 0;
  return (
    Math.max(
      Math.abs(poolRow - location.i),
      Math.min(location.j, maxIndex - location.j),
    ) + 1
  );
}

function approximateBestDrainerToManaSteps(
  game: MonsGame,
  color: Color,
): number | undefined {
  let bestSteps: number | undefined;
  for (const [drainerLocation, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (
      mon?.color !== color ||
      mon.kind !== MonKind.Drainer ||
      isMonFainted(mon)
    ) {
      continue;
    }

    for (const [manaLocation, manaItem] of game.board.occupied()) {
      if (manaItem.kind !== "mana") continue;
      const candidateSteps = subI32(
        locationDistance(drainerLocation, manaLocation),
        1,
      );
      bestSteps =
        bestSteps === undefined
          ? candidateSteps
          : Math.min(bestSteps, candidateSteps);
    }
  }
  return bestSteps;
}

function approximateSameTurnScoreWindowValue(
  game: MonsGame,
  color: Color,
): number {
  if (game.activeColor !== color) return 0;
  const remainingMoves = Math.max(
    0,
    subI32(MONS_MOVES_PER_TURN, game.monsMovesCount),
  );
  let best = 0;
  for (const [location, item] of game.board.occupied()) {
    if (
      item.kind !== "mon-with-mana" ||
      item.mon.color !== color ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    const poolSteps = subI32(distanceToAnyPoolStepsForEfficiency(location), 1);
    if (poolSteps <= remainingMoves) {
      best = Math.max(best, manaScore(item.mana, color));
    }
  }
  return best;
}

function buildMoveEfficiencySnapshot(
  game: MonsGame,
  perspective: Color,
  includeTacticalExact: boolean,
  includeStrategicExact: boolean,
  stateHash: Hash64,
): MoveEfficiencySnapshot {
  const opponent = otherColor(perspective);
  const strategic = includeStrategicExact
    ? exactStrategicAnalysis(game)
    : undefined;
  const mySummary = strategic?.colorSummary(perspective);
  const opponentSummary = strategic?.colorSummary(opponent);
  const tacticalFlags = moveEfficiencyTacticalProjectionFlags();
  const myTurnSummary =
    includeTacticalExact && game.activeColor === perspective
      ? exactTurnTacticalProjectionWithSearchHash(
          game,
          perspective,
          stateHash,
          tacticalFlags,
        )
      : defaultTacticalProjection(
          mySummary?.immediateWindow.bestScore ??
            approximateSameTurnScoreWindowValue(game, perspective),
        );
  const opponentTurnSummary =
    includeTacticalExact && game.activeColor === opponent
      ? exactTurnTacticalProjectionWithSearchHash(
          game,
          opponent,
          stateHash,
          tacticalFlags,
        )
      : defaultTacticalProjection(
          opponentSummary?.immediateWindow.bestScore ??
            approximateSameTurnScoreWindowValue(game, opponent),
        );

  let myBestCarrierSteps = mySummary?.bestCarrierSteps ?? UNKNOWN_STEPS;
  let opponentBestCarrierSteps =
    opponentSummary?.bestCarrierSteps ?? UNKNOWN_STEPS;
  const myBestDrainerToManaSteps =
    mySummary?.bestDrainerToManaSteps ??
    approximateBestDrainerToManaSteps(game, perspective) ??
    UNKNOWN_STEPS;
  const opponentBestDrainerToManaSteps =
    opponentSummary?.bestDrainerToManaSteps ??
    approximateBestDrainerToManaSteps(game, opponent) ??
    UNKNOWN_STEPS;
  let myCarrierCount = 0;
  let opponentCarrierCount = 0;
  let mySpiritOnBase = false;
  let opponentSpiritOnBase = false;
  const mySpiritBase = game.board.base({
    kind: MonKind.Spirit,
    color: perspective,
    cooldown: 0,
  });
  const opponentSpiritBase = game.board.base({
    kind: MonKind.Spirit,
    color: opponent,
    cooldown: 0,
  });

  for (const [location, item] of game.board.occupied()) {
    if (item.kind === "mon-with-mana") {
      if (isMonFainted(item.mon)) continue;
      const poolSteps = subI32(
        distanceToAnyPoolStepsForEfficiency(location),
        1,
      );
      if (item.mon.color === perspective) {
        myCarrierCount = addI32(myCarrierCount, 1);
        myBestCarrierSteps = Math.min(myBestCarrierSteps, poolSteps);
      } else {
        opponentCarrierCount = addI32(opponentCarrierCount, 1);
        opponentBestCarrierSteps = Math.min(
          opponentBestCarrierSteps,
          poolSteps,
        );
      }
      continue;
    }
    if (item.kind !== "mon" && item.kind !== "mon-with-consumable") {
      continue;
    }
    if (isMonFainted(item.mon) || item.mon.kind !== MonKind.Spirit) continue;
    if (item.mon.color === perspective) {
      mySpiritOnBase = locationEquals(location, mySpiritBase);
    } else {
      opponentSpiritOnBase = locationEquals(location, opponentSpiritBase);
    }
  }

  return {
    myBestCarrierSteps,
    opponentBestCarrierSteps,
    myBestDrainerToManaSteps,
    opponentBestDrainerToManaSteps,
    myCarrierCount,
    opponentCarrierCount,
    mySpiritOnBase,
    opponentSpiritOnBase,
    mySpiritActionTargets: mySummary?.spirit.utility ?? 0,
    opponentSpiritActionTargets: opponentSummary?.spirit.utility ?? 0,
    mySameTurnScoreValue:
      game.activeColor === perspective
        ? includeTacticalExact
          ? myTurnSummary.spiritAssistedScoreValue
          : myTurnSummary.sameTurnScoreWindowValue
        : 0,
    opponentSameTurnScoreValue:
      game.activeColor === opponent
        ? includeTacticalExact
          ? opponentTurnSummary.spiritAssistedScoreValue
          : opponentTurnSummary.sameTurnScoreWindowValue
        : 0,
    mySameTurnOpponentManaScoreValue:
      game.activeColor === perspective && includeTacticalExact
        ? myTurnSummary.spiritAssistedDenialValue
        : 0,
    opponentSameTurnOpponentManaScoreValue:
      game.activeColor === opponent && includeTacticalExact
        ? opponentTurnSummary.spiritAssistedDenialValue
        : 0,
    mySafeSupermanaProgress:
      includeTacticalExact && myTurnSummary.safeSupermanaProgress,
    opponentSafeSupermanaProgress:
      includeTacticalExact && opponentTurnSummary.safeSupermanaProgress,
    mySafeOpponentManaProgress:
      includeTacticalExact && myTurnSummary.safeOpponentManaProgress,
    opponentSafeOpponentManaProgress:
      includeTacticalExact && opponentTurnSummary.safeOpponentManaProgress,
    mySafeSupermanaProgressSteps:
      myTurnSummary.safeSupermanaProgressSteps ?? UNKNOWN_STEPS,
    opponentSafeSupermanaProgressSteps:
      opponentTurnSummary.safeSupermanaProgressSteps ?? UNKNOWN_STEPS,
    mySafeOpponentManaProgressSteps:
      myTurnSummary.safeOpponentManaProgressSteps ?? UNKNOWN_STEPS,
    opponentSafeOpponentManaProgressSteps:
      opponentTurnSummary.safeOpponentManaProgressSteps ?? UNKNOWN_STEPS,
  };
}

/** Cached builder used for the parent/before side of ordering deltas. */
export function moveEfficiencySnapshotWithHash(
  game: MonsGame,
  perspective: Color,
  includeTacticalExact: boolean,
  includeStrategicExact: boolean,
  stateHash: Hash64,
): MoveEfficiencySnapshot {
  const tag = snapshotCacheTag(
    perspective,
    includeTacticalExact,
    includeStrategicExact,
  );
  const cached = moveEfficiencySnapshotCache.get(stateHash, tag);
  if (cached !== undefined) return cached;

  const snapshot = buildMoveEfficiencySnapshot(
    game,
    perspective,
    includeTacticalExact,
    includeStrategicExact,
    stateHash,
  );
  if (cacheWriteAllowed()) {
    moveEfficiencySnapshotCache.set(stateHash, snapshot, tag);
  }
  return snapshot;
}

/** Uncached builder used for the simulated/after side of ordering deltas. */
export function moveEfficiencySnapshotUncachedWithHash(
  game: MonsGame,
  perspective: Color,
  includeTacticalExact: boolean,
  includeStrategicExact: boolean,
  stateHash: Hash64,
): MoveEfficiencySnapshot {
  return buildMoveEfficiencySnapshot(
    game,
    perspective,
    includeTacticalExact,
    includeStrategicExact,
    stateHash,
  );
}

export function clearMoveEfficiencyCache(): void {
  moveEfficiencySnapshotCache.clear();
}

export function stepProgressDelta(
  beforeSteps: number,
  afterSteps: number,
  forwardWeight: number,
  backwardWeight: number,
  unknownSteps = UNKNOWN_STEPS,
): number {
  const beforeKnown = beforeSteps < unknownSteps;
  const afterKnown = afterSteps < unknownSteps;
  if (beforeKnown && afterKnown) {
    const deltaSteps = subI32(beforeSteps, afterSteps);
    if (deltaSteps > 0) return mulI32(deltaSteps, forwardWeight);
    if (deltaSteps < 0) return mulI32(deltaSteps, backwardWeight);
    return 0;
  }
  if (!beforeKnown && afterKnown) return forwardWeight;
  if (beforeKnown && !afterKnown) return subI32(0, backwardWeight);
  return 0;
}

export function hasRoundtripMonMove(events: readonly Event[]): boolean {
  const seenMoves: {
    readonly from: Location;
    readonly to: Location;
    readonly color: Color;
    readonly kind: MonKind;
  }[] = [];
  for (const event of events) {
    if (event.kind !== "mon-move") continue;
    const mon = itemMon(event.item);
    if (mon === undefined) continue;
    if (
      seenMoves.some(
        (move) =>
          locationEquals(move.from, event.to) &&
          locationEquals(move.to, event.from) &&
          move.color === mon.color &&
          move.kind === mon.kind,
      )
    ) {
      return true;
    }
    seenMoves.push({
      from: event.from,
      to: event.to,
      color: mon.color,
      kind: mon.kind,
    });
  }
  return false;
}

function hasMaterialEvent(events: readonly Event[]): boolean {
  return events.some((event) => {
    switch (event.kind) {
      case "mana-scored":
      case "pickup-mana":
      case "mon-fainted":
      case "use-potion":
      case "pickup-bomb":
      case "pickup-potion":
      case "bomb-attack":
      case "bomb-explosion":
        return true;
      default:
        return false;
    }
  });
}

export function isNoEffectTurnTransition(
  game: MonsGame,
  simulatedGame: MonsGame,
  events: readonly Event[],
): boolean {
  return (
    boardEquals(game.board, simulatedGame.board) &&
    game.whiteScore === simulatedGame.whiteScore &&
    game.blackScore === simulatedGame.blackScore &&
    game.whitePotionsCount === simulatedGame.whitePotionsCount &&
    game.blackPotionsCount === simulatedGame.blackPotionsCount &&
    !hasMaterialEvent(events)
  );
}

function eventsIncludeOpponentDrainerFainted(
  events: readonly Event[],
  perspective: Color,
): boolean {
  const opponent = otherColor(perspective);
  return events.some(
    (event) =>
      event.kind === "mon-fainted" &&
      event.mon.kind === MonKind.Drainer &&
      event.mon.color === opponent,
  );
}

export function manaHandoffPenalty(
  events: readonly Event[],
  perspective: Color,
  perStepPenalty: number,
): number {
  if (perStepPenalty <= 0) return 0;
  let penalty = 0;
  const opponent = otherColor(perspective);
  for (const event of events) {
    if (event.kind !== "mana-move") continue;
    const myBefore = distanceToColorPoolStepsForEfficiency(
      event.from,
      perspective,
    );
    const myAfter = distanceToColorPoolStepsForEfficiency(
      event.to,
      perspective,
    );
    const opponentBefore = distanceToColorPoolStepsForEfficiency(
      event.from,
      opponent,
    );
    const opponentAfter = distanceToColorPoolStepsForEfficiency(
      event.to,
      opponent,
    );
    const movedTowardOpponent = Math.max(
      subI32(opponentBefore, opponentAfter),
      0,
    );
    const movedTowardMe = Math.max(subI32(myBefore, myAfter), 0);
    if (movedTowardOpponent > movedTowardMe) {
      const excess = subI32(movedTowardOpponent, movedTowardMe);
      penalty = addI32(
        penalty,
        mulI32(mulI32(excess, manaScore(event.mana, opponent)), perStepPenalty),
      );
    }
  }
  return penalty;
}

/**
 * Complete weighted snapshot delta. Passing a before-snapshot captured for a
 * different perspective intentionally preserves the established child order.
 */
export function moveEfficiencyDeltaFromBeforeSnapshotWithAfterSnapshot(
  game: MonsGame,
  simulatedGame: MonsGame,
  perspective: Color,
  events: readonly Event[],
  before: MoveEfficiencySnapshot,
  after: MoveEfficiencySnapshot,
  policy: MoveEfficiencyDeltaPolicy,
): number {
  const {
    isRoot,
    applyBacktrackPenalty,
    applyRootManaHandoffGuard,
    rootBacktrackPenalty,
    rootManaHandoffPenalty,
  } = policy;
  let delta = 0;
  delta = addI32(
    delta,
    stepProgressDelta(
      before.myBestCarrierSteps,
      after.myBestCarrierSteps,
      90,
      130,
    ),
  );
  delta = subI32(
    delta,
    stepProgressDelta(
      before.opponentBestCarrierSteps,
      after.opponentBestCarrierSteps,
      80,
      120,
    ),
  );
  delta = addI32(
    delta,
    stepProgressDelta(
      before.myBestDrainerToManaSteps,
      after.myBestDrainerToManaSteps,
      34,
      50,
    ),
  );
  delta = subI32(
    delta,
    stepProgressDelta(
      before.opponentBestDrainerToManaSteps,
      after.opponentBestDrainerToManaSteps,
      30,
      44,
    ),
  );
  delta = addI32(
    delta,
    mulI32(subI32(after.myCarrierCount, before.myCarrierCount), 55),
  );
  delta = subI32(
    delta,
    mulI32(subI32(after.opponentCarrierCount, before.opponentCarrierCount), 48),
  );
  if (before.mySpiritOnBase && !after.mySpiritOnBase) {
    delta = addI32(delta, SPIRIT_DEPLOY_EFFICIENCY_BONUS);
  }
  if (!before.opponentSpiritOnBase && after.opponentSpiritOnBase) {
    delta = addI32(delta, Math.trunc(SPIRIT_DEPLOY_EFFICIENCY_BONUS / 3));
  }
  delta = addI32(
    delta,
    mulI32(
      subI32(after.mySpiritActionTargets, before.mySpiritActionTargets),
      SPIRIT_ACTION_TARGET_DELTA_WEIGHT,
    ),
  );
  delta = subI32(
    delta,
    mulI32(
      subI32(
        after.opponentSpiritActionTargets,
        before.opponentSpiritActionTargets,
      ),
      Math.trunc(SPIRIT_ACTION_TARGET_DELTA_WEIGHT / 2),
    ),
  );
  delta = addI32(
    delta,
    mulI32(subI32(after.mySameTurnScoreValue, before.mySameTurnScoreValue), 55),
  );
  delta = subI32(
    delta,
    mulI32(
      subI32(
        after.opponentSameTurnScoreValue,
        before.opponentSameTurnScoreValue,
      ),
      45,
    ),
  );
  delta = addI32(
    delta,
    mulI32(
      subI32(
        after.mySameTurnOpponentManaScoreValue,
        before.mySameTurnOpponentManaScoreValue,
      ),
      90,
    ),
  );
  delta = subI32(
    delta,
    mulI32(
      subI32(
        after.opponentSameTurnOpponentManaScoreValue,
        before.opponentSameTurnOpponentManaScoreValue,
      ),
      75,
    ),
  );
  if (!before.mySafeSupermanaProgress && after.mySafeSupermanaProgress) {
    delta = addI32(delta, 140);
  }
  if (
    !before.opponentSafeSupermanaProgress &&
    after.opponentSafeSupermanaProgress
  ) {
    delta = subI32(delta, 120);
  }
  if (!before.mySafeOpponentManaProgress && after.mySafeOpponentManaProgress) {
    delta = addI32(delta, 120);
  }
  if (
    !before.opponentSafeOpponentManaProgress &&
    after.opponentSafeOpponentManaProgress
  ) {
    delta = subI32(delta, 110);
  }
  delta = addI32(
    delta,
    stepProgressDelta(
      before.mySafeSupermanaProgressSteps,
      after.mySafeSupermanaProgressSteps,
      26,
      40,
    ),
  );
  delta = subI32(
    delta,
    stepProgressDelta(
      before.opponentSafeSupermanaProgressSteps,
      after.opponentSafeSupermanaProgressSteps,
      22,
      36,
    ),
  );
  delta = addI32(
    delta,
    stepProgressDelta(
      before.mySafeOpponentManaProgressSteps,
      after.mySafeOpponentManaProgressSteps,
      22,
      34,
    ),
  );
  delta = subI32(
    delta,
    stepProgressDelta(
      before.opponentSafeOpponentManaProgressSteps,
      after.opponentSafeOpponentManaProgressSteps,
      18,
      30,
    ),
  );

  if (isRoot) {
    const rootCompensatesHandoff =
      events.some((event) => event.kind === "mana-scored") ||
      eventsIncludeOpponentDrainerFainted(events, perspective);
    if (applyRootManaHandoffGuard && !rootCompensatesHandoff) {
      delta = subI32(
        delta,
        manaHandoffPenalty(events, perspective, rootManaHandoffPenalty),
      );
    }
    if (isNoEffectTurnTransition(game, simulatedGame, events)) {
      delta = subI32(delta, NO_EFFECT_ROOT_PENALTY);
    } else if (!hasMaterialEvent(events) && delta <= 0) {
      delta = subI32(delta, LOW_IMPACT_ROOT_PENALTY);
    }
    if (
      applyBacktrackPenalty &&
      rootBacktrackPenalty > 0 &&
      hasRoundtripMonMove(events)
    ) {
      delta = subI32(delta, rootBacktrackPenalty);
    }
  }

  return delta;
}

export function moveEfficiencyDeltaFromBeforeSnapshot(
  game: MonsGame,
  simulatedGame: MonsGame,
  perspective: Color,
  events: readonly Event[],
  before: MoveEfficiencySnapshot,
  simulatedStateHash: Hash64,
  options: MoveEfficiencyDeltaOptions,
): number {
  const after = moveEfficiencySnapshotUncachedWithHash(
    simulatedGame,
    perspective,
    options.includeTacticalExact && simulatedGame.activeColor === perspective,
    options.includeStrategicExact,
    simulatedStateHash,
  );
  return moveEfficiencyDeltaFromBeforeSnapshotWithAfterSnapshot(
    game,
    simulatedGame,
    perspective,
    events,
    before,
    after,
    options,
  );
}
