import { BOARD_SIZE, MONS_MOVES_PER_TURN } from "../engine/config.js";
import {
  Color,
  Consumable,
  MonKind,
  cloneInputs,
  inputChainKey,
  isMonFainted,
  itemMon,
  manaEquals,
  manaScore,
  otherColor,
  type Event,
  type Input,
  type Mana,
  type Mon,
} from "../engine/domain.js";
import { FOR_AUTOMOVE_START_INPUT_OPTIONS, MonsGame } from "../engine/game.js";
import {
  demonReachableLocations,
  locationDistance,
  locationEquals,
  mysticReachableLocations,
  type Location,
} from "../engine/geometry.js";
import { saturatingAddI32, saturatingSubI32 } from "../engine/numerics.js";
import { cacheWriteAllowed, cancelled, checkpoint } from "./deadline.js";
import {
  canAttackOpponentDrainerThisTurn,
  canAttackTargetOnBoardWithHash,
  exactBoardHash,
  exactSecureSpecificManaPathFrom,
  exactSearchStateHash,
  exactStrategicAnalysis,
  exactTurnSummary,
  isDrainerExactlySafeNextTurnOnBoardWithHash,
  isDrainerUnderWalkThreatWithHash,
  type ExactTurnSummary,
} from "./exact.js";
import { Hash64Set, type Hash64 } from "./hash64.js";
import { evaluatePreferabilityWithWeightsAndExactPolicy } from "./scoring.js";
import { searchExecutionConfigForGame } from "./selector-config.js";
import {
  hasAwakeSpiritOnBase,
  shouldPreferSpiritDevelopment,
  type AutomoveSearchExecutionConfig,
  type MoveClassFlags as SelectorMoveClassFlags,
  type ScoredRootMove as SelectorScoredRootMove,
  type SmartAutomovePreference,
} from "./selector-types.js";
import {
  distanceToAnyPoolStepsForEfficiency as distanceToAnyPoolSteps,
  distanceToColorPoolStepsForEfficiency as distanceToColorPool,
  hasRoundtripMonMove as hasRoundtrip,
  moveEfficiencyDeltaFromBeforeSnapshot,
  moveEfficiencySnapshotWithHash,
  type MoveEfficiencySnapshot,
} from "./move-efficiency.js";
import {
  applyInputsForSearchWithEvents,
  compareInputChains,
  enumerateLegalTransitions,
  enumerateLegalTransitionsLexicographicBounded,
  hasMaterialEvent,
  type LegalInputTransition,
} from "./transitions.js";

const SMART_TERMINAL_SCORE = 0x0fff_ffff;
const UNKNOWN_PROGRESS_STEPS = BOARD_SIZE + 4;
const UNKNOWN_SCORE_PATH_STEPS = BOARD_SIZE * 3;
const FORCED_ATTACK_FAST_CANDIDATES = 4;
const FORCED_ATTACK_NORMAL_CANDIDATES = 6;
const FORCED_ATTACK_FAST_NODE_BUDGET = 600;
const FORCED_ATTACK_NORMAL_NODE_BUDGET = 1_800;
const FORCED_ATTACK_FAST_ENUM_LIMIT = 220;
const FORCED_ATTACK_NORMAL_ENUM_LIMIT = 280;

export type SearchPreference = SmartAutomovePreference;
export type SearchConfig = AutomoveSearchExecutionConfig;
export type MoveClassFlags = SelectorMoveClassFlags;

export type RootCandidate = SelectorScoredRootMove & {
  readonly events: readonly Event[];
  readonly stateHash: Hash64;
};

type RootCandidateDraft = Omit<RootCandidate, "rootRank">;

function scoreForColor(game: MonsGame, color: Color): number {
  return color === Color.White ? game.whiteScore : game.blackScore;
}

export function searchConfigForPreference(
  game: MonsGame,
  preference: SearchPreference,
): SearchConfig {
  return searchExecutionConfigForGame(game, preference);
}

function findDrainer(
  game: MonsGame,
  color: Color,
): { readonly location: Location; readonly mon: Mon } | undefined {
  for (const [location, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (mon?.color === color && mon.kind === MonKind.Drainer) {
      return { location, mon };
    }
  }
  return undefined;
}

export function isOwnDrainerVulnerable(game: MonsGame, color: Color): boolean {
  const found = findDrainer(game, color);
  if (found === undefined) return false;
  if (isMonFainted(found.mon)) return true;
  if (game.isFirstTurn()) return false;
  const hash = exactBoardHash(game.board);
  return canAttackTargetOnBoardWithHash(
    game.board,
    hash,
    otherColor(color),
    color,
    found.location,
    MONS_MOVES_PER_TURN,
    true,
  );
}

function opponentAwakeDrainerLocation(
  game: MonsGame,
  perspective: Color,
): Location | undefined {
  const opponent = otherColor(perspective);
  for (const [location, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (
      mon?.color === opponent &&
      mon.kind === MonKind.Drainer &&
      !isMonFainted(mon)
    ) {
      return location;
    }
  }
  return undefined;
}

function minimumStepsToAttackSource(
  from: Location,
  target: Location,
  kind: MonKind.Mystic | MonKind.Demon,
): number {
  const sources =
    kind === MonKind.Mystic
      ? mysticReachableLocations(target)
      : demonReachableLocations(target);
  let minimum = 0x7fff_ffff;
  for (const source of sources) {
    minimum = Math.min(minimum, locationDistance(from, source));
  }
  return minimum;
}

function potentialDrainerAttackerLocations(
  game: MonsGame,
  perspective: Color,
): Location[] {
  const attackers: Location[] = [];
  const target = opponentAwakeDrainerLocation(game, perspective);
  if (target === undefined) return attackers;
  const remainingMoves = Math.max(0, MONS_MOVES_PER_TURN - game.monsMovesCount);
  if (remainingMoves <= 0) return attackers;
  const opponent = otherColor(perspective);
  const angel = game.board.findAwakeAngel(opponent);
  const guarded = angel !== undefined && locationDistance(angel, target) === 1;
  const bombPickupLocations: Location[] = [];
  for (const [location, item] of game.board.occupied()) {
    if (
      item.kind === "consumable" &&
      item.consumable === Consumable.BombOrPotion
    ) {
      bombPickupLocations.push(location);
    }
  }

  for (const [location, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (mon?.color !== perspective || isMonFainted(mon)) {
      continue;
    }
    const hasBomb =
      item.kind === "mon-with-consumable" &&
      item.consumable === Consumable.Bomb;
    if (hasBomb && locationDistance(location, target) <= remainingMoves + 3) {
      attackers.push(location);
      continue;
    }
    if (
      !guarded &&
      (mon.kind === MonKind.Mystic || mon.kind === MonKind.Demon) &&
      minimumStepsToAttackSource(location, target, mon.kind) <= remainingMoves
    ) {
      attackers.push(location);
      continue;
    }
    for (const bombLocation of bombPickupLocations) {
      const toBomb = locationDistance(location, bombLocation);
      if (toBomb > remainingMoves) continue;
      const movesAfterPickup = remainingMoves - toBomb;
      if (locationDistance(bombLocation, target) <= movesAfterPickup + 3) {
        attackers.push(location);
        break;
      }
    }
  }
  return attackers;
}

function hasPotentialDrainerAttacker(
  game: MonsGame,
  perspective: Color,
): boolean {
  return potentialDrainerAttackerLocations(game, perspective).length > 0;
}

function approximateCanAttackOpponentDrainerThisTurn(
  game: MonsGame,
  color: Color,
): boolean {
  return (
    game.activeColor === color &&
    game.playerCanUseAction() &&
    hasPotentialDrainerAttacker(game, color)
  );
}

export function isOwnDrainerWalkVulnerable(
  game: MonsGame,
  color: Color,
): boolean {
  const found = findDrainer(game, color);
  if (
    found === undefined ||
    isMonFainted(found.mon) ||
    isOwnDrainerVulnerable(game, color)
  ) {
    return false;
  }
  const hash = exactBoardHash(game.board);
  const angel = game.board.findAwakeAngel(color);
  const angelNearby =
    angel !== undefined && locationDistance(angel, found.location) === 1;
  return isDrainerUnderWalkThreatWithHash(
    game.board,
    hash,
    color,
    found.location,
    angelNearby,
  );
}

function carrierSnapshot(
  game: MonsGame,
  color: Color,
): readonly [number, number] {
  let count = 0;
  let bestSteps = UNKNOWN_PROGRESS_STEPS;
  for (const [location, item] of game.board.occupied()) {
    if (
      item.kind !== "mon-with-mana" ||
      item.mon.color !== color ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    count += 1;
    const edgeDistance = Math.max(
      Math.min(location.i, 10 - location.i),
      Math.min(location.j, 10 - location.j),
    );
    bestSteps = Math.min(bestSteps, edgeDistance);
  }
  return [count, bestSteps];
}

function hasCarrierProgress(
  before: MonsGame,
  after: MonsGame,
  color: Color,
): boolean {
  const [beforeCount, beforeSteps] = carrierSnapshot(before, color);
  const [afterCount, afterSteps] = carrierSnapshot(after, color);
  return (
    afterCount > beforeCount ||
    (afterSteps < beforeSteps && afterSteps < UNKNOWN_PROGRESS_STEPS)
  );
}

function spiritBase(game: MonsGame, color: Color): Location {
  return game.board.base({ kind: MonKind.Spirit, color, cooldown: 0 });
}

function hasAwakeSpiritOffBase(game: MonsGame, color: Color): boolean {
  const base = spiritBase(game, color);
  for (const [location, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (
      !locationEquals(location, base) &&
      mon?.kind === MonKind.Spirit &&
      mon.color === color &&
      !isMonFainted(mon)
    ) {
      return true;
    }
  }
  return false;
}

function hasSpiritDevelopment(
  before: MonsGame,
  after: MonsGame,
  color: Color,
  events: readonly Event[],
): boolean {
  return (
    events.some((event) => event.kind === "spirit-target-move") ||
    (hasAwakeSpiritOnBase(before, color) && hasAwakeSpiritOffBase(after, color))
  );
}

function isImmediateScore(
  before: MonsGame,
  after: MonsGame,
  actorColor: Color,
  events: readonly Event[],
): boolean {
  return (
    events.some((event) => event.kind === "mana-scored") ||
    scoreForColor(after, actorColor) > scoreForColor(before, actorColor)
  );
}

function attacksDrainer(events: readonly Event[], actorColor: Color): boolean {
  return events.some(
    (event) =>
      event.kind === "mon-fainted" &&
      event.mon.kind === MonKind.Drainer &&
      event.mon.color === otherColor(actorColor),
  );
}

export function classifyTransition(
  before: MonsGame,
  transition: LegalInputTransition,
  actorColor: Color,
  vulnerableBefore = isOwnDrainerVulnerable(before, actorColor),
  vulnerableAfter = isOwnDrainerVulnerable(transition.game, actorColor),
): MoveClassFlags {
  const immediateScore = isImmediateScore(
    before,
    transition.game,
    actorColor,
    transition.events,
  );
  const drainerAttack = attacksDrainer(transition.events, actorColor);
  const drainerSafetyRecover = vulnerableBefore && !vulnerableAfter;
  const carrierProgress = hasCarrierProgress(
    before,
    transition.game,
    actorColor,
  );
  const material = hasMaterialEvent(transition.events);
  const spiritDevelopment = hasSpiritDevelopment(
    before,
    transition.game,
    actorColor,
    transition.events,
  );
  return {
    immediateScore,
    drainerAttack,
    drainerSafetyRecover,
    carrierProgress,
    material,
    quiet:
      !immediateScore &&
      !drainerAttack &&
      !drainerSafetyRecover &&
      !carrierProgress &&
      !material &&
      !spiritDevelopment,
  };
}

export function orderingEventBonus(
  actorColor: Color,
  perspective: Color,
  events: readonly Event[],
): number {
  let bonus = 0;
  for (const event of events) {
    switch (event.kind) {
      case "mana-scored":
        bonus += actorColor === perspective ? 780 : -780;
        break;
      case "pickup-mana":
        bonus += actorColor === perspective ? 230 : -230;
        break;
      case "mon-fainted":
        bonus += event.mon.color === perspective ? -360 : 360;
        break;
      case "use-potion":
        bonus += actorColor === perspective ? -80 : 80;
        break;
      case "pickup-bomb":
      case "pickup-potion":
        bonus += actorColor === perspective ? 45 : -45;
        break;
      default:
        break;
    }
  }
  return bonus;
}

function scoresMana(
  events: readonly Event[],
  predicate: (mana: Mana) => boolean,
): boolean {
  return events.some(
    (event) => event.kind === "mana-scored" && predicate(event.mana),
  );
}

function picksUpMana(
  events: readonly Event[],
  predicate: (mana: Mana) => boolean,
): boolean {
  return events.some(
    (event) => event.kind === "pickup-mana" && predicate(event.mana),
  );
}

function manaMovedToward(
  events: readonly Event[],
  color: Color,
  predicate: (mana: Mana) => boolean,
): boolean {
  return events.some(
    (event) =>
      event.kind === "mana-move" &&
      predicate(event.mana) &&
      distanceToColorPool(event.to, color) <
        distanceToColorPool(event.from, color),
  );
}

function spiritMovesManaToward(
  events: readonly Event[],
  color: Color,
  predicate: (mana: Mana) => boolean,
): boolean {
  return events.some(
    (event) =>
      event.kind === "spirit-target-move" &&
      event.item.kind === "mana" &&
      predicate(event.item.mana) &&
      distanceToColorPool(event.to, color) <
        distanceToColorPool(event.from, color),
  );
}

function manaHandoffPenalty(
  events: readonly Event[],
  perspective: Color,
  perStepPenalty: number,
): number {
  let penalty = 0;
  const opponent = otherColor(perspective);
  for (const event of events) {
    if (event.kind !== "mana-move") continue;
    const myProgress = Math.max(
      0,
      distanceToColorPool(event.from, perspective) -
        distanceToColorPool(event.to, perspective),
    );
    const opponentProgress = Math.max(
      0,
      distanceToColorPool(event.from, opponent) -
        distanceToColorPool(event.to, opponent),
    );
    if (opponentProgress > myProgress) {
      penalty +=
        (opponentProgress - myProgress) *
        manaScore(event.mana, opponent) *
        perStepPenalty;
    }
  }
  return penalty;
}

function safeCarrierForMana(
  game: MonsGame,
  color: Color,
  desiredMana: Mana,
): boolean {
  const boardHash = exactBoardHash(game.board);
  for (const [location, item] of game.board.occupied()) {
    if (
      item.kind === "mon-with-mana" &&
      item.mon.kind === MonKind.Drainer &&
      item.mon.color === color &&
      !isMonFainted(item.mon) &&
      manaEquals(item.mana, desiredMana)
    ) {
      return isDrainerExactlySafeNextTurnOnBoardWithHash(
        game.board,
        boardHash,
        color,
        location,
      );
    }
  }
  return false;
}

function spiritManaSetup(
  game: MonsGame,
  events: readonly Event[],
  color: Color,
  mana: Mana,
): boolean {
  return (
    spiritMovesManaToward(events, color, (candidate) =>
      manaEquals(candidate, mana),
    ) ||
    (events.some(
      (event) =>
        event.kind === "spirit-target-move" &&
        event.item.kind === "mana" &&
        manaEquals(event.item.mana, mana),
    ) &&
      safeCarrierForMana(game, color, mana))
  );
}

function approximateSpecificManaProgressSteps(
  game: MonsGame,
  color: Color,
  wanted: Mana,
): number | undefined {
  let bestSteps: number | undefined;
  for (const [drainerLocation, item] of game.board.occupied()) {
    if (
      item.kind === "mon-with-mana" &&
      item.mon.color === color &&
      item.mon.kind === MonKind.Drainer &&
      !isMonFainted(item.mon) &&
      manaEquals(item.mana, wanted)
    ) {
      bestSteps = 0;
      continue;
    }
    if (item.kind !== "mon" && item.kind !== "mon-with-consumable") continue;
    if (
      item.mon.color !== color ||
      item.mon.kind !== MonKind.Drainer ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    for (const [manaLocation, manaItem] of game.board.occupied()) {
      if (manaItem.kind !== "mana" || !manaEquals(manaItem.mana, wanted)) {
        continue;
      }
      const steps = locationDistance(drainerLocation, manaLocation);
      bestSteps = bestSteps === undefined ? steps : Math.min(bestSteps, steps);
    }
  }
  return bestSteps;
}

function approximateBestCarrierSteps(
  game: MonsGame,
  color: Color,
): number | undefined {
  let bestSteps: number | undefined;
  for (const [at, item] of game.board.occupied()) {
    if (
      item.kind !== "mon-with-mana" ||
      item.mon.color !== color ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    const steps = Math.max(0, distanceToAnyPoolSteps(at) - 1);
    bestSteps = bestSteps === undefined ? steps : Math.min(bestSteps, steps);
  }
  return bestSteps;
}

function approximateSameTurnScoreWindowValue(
  game: MonsGame,
  color: Color,
): number {
  if (game.activeColor !== color) return 0;
  const remainingMoves = Math.max(0, MONS_MOVES_PER_TURN - game.monsMovesCount);
  let best = 0;
  for (const [at, item] of game.board.occupied()) {
    if (
      item.kind !== "mon-with-mana" ||
      item.mon.color !== color ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    const steps = Math.max(0, distanceToAnyPoolSteps(at) - 1);
    if (steps <= remainingMoves)
      best = Math.max(best, manaScore(item.mana, color));
  }
  return best;
}

function approximateActiveTurnSummary(
  game: MonsGame,
  color: Color,
  allowExactStrategic = false,
): ExactTurnSummary {
  const strategic = allowExactStrategic
    ? exactStrategicAnalysis(game).colorSummary(color)
    : undefined;
  const remainingMoves = Math.max(0, MONS_MOVES_PER_TURN - game.monsMovesCount);
  const safeSupermanaProgressSteps = approximateSpecificManaProgressSteps(
    game,
    color,
    { kind: "supermana" },
  );
  const safeOpponentManaProgressSteps = approximateSpecificManaProgressSteps(
    game,
    color,
    { kind: "regular", color: otherColor(color) },
  );
  return {
    canAttackOpponentDrainer: false,
    safeSupermanaProgress:
      safeSupermanaProgressSteps !== undefined &&
      safeSupermanaProgressSteps <= remainingMoves,
    safeSupermanaProgressSteps,
    safeOpponentManaProgress:
      safeOpponentManaProgressSteps !== undefined &&
      safeOpponentManaProgressSteps <= remainingMoves,
    safeOpponentManaProgressSteps,
    spiritAssistedSupermanaProgress: false,
    spiritAssistedOpponentManaProgress: false,
    spiritAssistedScore: false,
    spiritAssistedDenial: false,
    sameTurnScoreWindowValue:
      strategic?.immediateWindow.bestScore ??
      approximateSameTurnScoreWindowValue(game, color),
    scorePathBestSteps:
      strategic?.scorePathWindow.bestSteps ??
      approximateBestCarrierSteps(game, color),
  };
}

export function hasProTacticalPotential(game: MonsGame): boolean {
  const activeColor = game.activeColor;
  const summary = approximateActiveTurnSummary(game, activeColor);
  return (
    summary.sameTurnScoreWindowValue > 0 ||
    approximateCanAttackOpponentDrainerThisTurn(game, activeColor) ||
    summary.safeSupermanaProgress ||
    summary.safeOpponentManaProgress
  );
}

function rootTurnSummary(
  game: MonsGame,
  color: Color,
  exactRootEnabled: boolean,
  exactStaticEnabled: boolean,
): ExactTurnSummary | undefined {
  if (game.activeColor !== color) return undefined;
  return exactRootEnabled
    ? exactTurnSummary(game, color)
    : approximateActiveTurnSummary(game, color, exactStaticEnabled);
}

function liveSpiritSetupGain(
  summary: ExactTurnSummary | undefined,
  spiritDevelopment: boolean,
  spiritSameTurnScoreSetupNow: boolean,
  spiritOwnManaSetupNow: boolean,
): number {
  let gain = 0;
  if (spiritSameTurnScoreSetupNow) gain += 80;
  if (spiritOwnManaSetupNow) gain += 48;
  if (spiritDevelopment) gain += 24;
  if (summary?.spiritAssistedScore) gain += 72;
  if (summary?.spiritAssistedDenial) gain += 40;
  if (summary?.spiritAssistedSupermanaProgress) gain += 36;
  if (summary?.spiritAssistedOpponentManaProgress) gain += 36;
  gain += Math.max(0, summary?.sameTurnScoreWindowValue ?? 0) * 20;
  if (summary?.safeSupermanaProgressSteps !== undefined) {
    gain +=
      Math.max(0, 12 - Math.min(12, summary.safeSupermanaProgressSteps)) * 4;
  }
  if (summary?.safeOpponentManaProgressSteps !== undefined) {
    gain +=
      Math.max(0, 12 - Math.min(12, summary.safeOpponentManaProgressSteps)) * 4;
  }
  if (summary?.scorePathBestSteps !== undefined) {
    gain += Math.max(0, 8 - Math.min(8, summary.scorePathBestSteps)) * 3;
  }
  return gain;
}

function rootProgressBonus(steps: number, perStep: number): number {
  if (steps >= UNKNOWN_PROGRESS_STEPS || perStep <= 0) return 0;
  const clampedSteps = Math.max(0, Math.min(MONS_MOVES_PER_TURN, steps));
  return (MONS_MOVES_PER_TURN - clampedSteps) * perStep;
}

function rootSoftPriority(
  config: SearchConfig,
  values: {
    readonly supermanaProgress: boolean;
    readonly opponentManaProgress: boolean;
    readonly safeSupermanaProgressSteps: number;
    readonly safeOpponentManaProgressSteps: number;
    readonly scoresSupermanaThisTurn: boolean;
    readonly scoresOpponentManaThisTurn: boolean;
    readonly ownDrainerVulnerable: boolean;
    readonly manaHandoffToOpponent: boolean;
    readonly hasRoundtrip: boolean;
  },
): number {
  let score = 0;
  if (values.scoresSupermanaThisTurn) {
    score = saturatingAddI32(
      score,
      Math.max(0, config.softSupermanaScoreBonus),
    );
  } else if (values.supermanaProgress && !values.ownDrainerVulnerable) {
    score = saturatingAddI32(
      score,
      Math.max(0, config.softSupermanaProgressBonus),
    );
    score = saturatingAddI32(
      score,
      rootProgressBonus(values.safeSupermanaProgressSteps, 8),
    );
  }
  if (values.scoresOpponentManaThisTurn) {
    score = saturatingAddI32(
      score,
      Math.max(0, config.softOpponentManaScoreBonus),
    );
  } else if (values.opponentManaProgress && !values.ownDrainerVulnerable) {
    score = saturatingAddI32(
      score,
      Math.max(0, config.softOpponentManaProgressBonus),
    );
    score = saturatingAddI32(
      score,
      rootProgressBonus(values.safeOpponentManaProgressSteps, 6),
    );
  }
  if (values.manaHandoffToOpponent) {
    score = saturatingSubI32(score, Math.max(0, config.softManaHandoffPenalty));
  }
  if (values.hasRoundtrip) {
    score = saturatingSubI32(score, Math.max(0, config.softRoundtripPenalty));
  }
  return score;
}

type ExactLiteBudget = {
  rootCalls: number;
  staticCalls: number;
};

function rootTransitionRequiresExactLiteProgress(
  events: readonly Event[],
): boolean {
  return events.some((event) =>
    [
      "mana-move",
      "mana-scored",
      "pickup-mana",
      "mana-dropped",
      "supermana-back-to-base",
    ].includes(event.kind),
  );
}

function rootTransitionRequiresExactLiteSpiritWindow(
  events: readonly Event[],
): boolean {
  return events.some(
    (event) =>
      event.kind === "spirit-target-move" ||
      (event.kind === "mon-move" &&
        itemMon(event.item)?.kind === MonKind.Spirit),
  );
}

function transitionRequiresExactLite(events: readonly Event[]): boolean {
  return (
    rootTransitionRequiresExactLiteProgress(events) ||
    rootTransitionRequiresExactLiteSpiritWindow(events)
  );
}

function withExactLiteBudgetedTransitionConfig(
  config: SearchConfig,
  perspective: Color,
  transition: LegalInputTransition,
  budget: ExactLiteBudget,
): SearchConfig {
  let rootCallBudget = config.exactLiteRootCallBudget;
  let staticCallBudget = config.exactLiteStaticCallBudget;
  if (
    config.enableExactLiteChecks &&
    rootCallBudget > 0 &&
    transitionRequiresExactLite(transition.events)
  ) {
    if (budget.rootCalls > 0) budget.rootCalls -= 1;
    else rootCallBudget = 0;
  }
  if (
    config.enableExactLiteChecks &&
    staticCallBudget > 0 &&
    transition.game.activeColor === perspective
  ) {
    if (budget.staticCalls > 0) budget.staticCalls -= 1;
    else staticCallBudget = 0;
  }
  rootCallBudget = Math.min(rootCallBudget, budget.rootCalls);
  staticCallBudget = Math.min(staticCallBudget, budget.staticCalls);
  return {
    ...config,
    exactLiteRootCallBudget: rootCallBudget,
    exactLiteStaticCallBudget: staticCallBudget,
    enableExactRootAnalysis: config.enableExactLiteChecks
      ? rootCallBudget > 0 && transitionRequiresExactLite(transition.events)
      : config.enableExactRootAnalysis,
  };
}

function rootCandidateSourceSnapshot(
  game: MonsGame,
  perspective: Color,
): MoveEfficiencySnapshot {
  const stateHash = exactSearchStateHash(game);
  return moveEfficiencySnapshotWithHash(
    game,
    perspective,
    false,
    false,
    stateHash,
  );
}

function buildRootCandidate(
  before: MonsGame,
  transition: LegalInputTransition,
  perspective: Color,
  config: SearchConfig,
  vulnerableBefore: boolean,
  getSourceSnapshot: () => MoveEfficiencySnapshot,
): RootCandidateDraft | undefined {
  if (checkpoint()) return undefined;
  const after = transition.game;
  const stateHash = exactSearchStateHash(after);
  const efficiency = moveEfficiencyDeltaFromBeforeSnapshot(
    before,
    after,
    perspective,
    transition.events,
    getSourceSnapshot(),
    stateHash,
    {
      isRoot: true,
      applyBacktrackPenalty: true,
      applyRootManaHandoffGuard: true,
      includeTacticalExact: false,
      includeStrategicExact: false,
      rootBacktrackPenalty: config.rootBacktrackPenalty,
      rootManaHandoffPenalty: config.rootManaHandoffPenalty,
    },
  );
  if (checkpoint()) return undefined;
  const ownDrainerVulnerable = isOwnDrainerVulnerable(after, perspective);
  const ownDrainerWalkVulnerable = false;
  const classes = classifyTransition(
    before,
    transition,
    perspective,
    vulnerableBefore,
    ownDrainerVulnerable,
  );
  const scoresSupermanaThisTurn = scoresMana(
    transition.events,
    (mana) => mana.kind === "supermana",
  );
  const scoresOpponentManaThisTurn = scoresMana(
    transition.events,
    (mana) => mana.kind === "regular" && mana.color !== perspective,
  );
  const picksSupermana = picksUpMana(
    transition.events,
    (mana) => mana.kind === "supermana",
  );
  const picksOpponentMana = picksUpMana(
    transition.events,
    (mana) => mana.kind === "regular" && mana.color !== perspective,
  );
  const summary = rootTurnSummary(
    after,
    perspective,
    config.enableExactRootAnalysis,
    config.enableExactLiteChecks && config.exactLiteStaticCallBudget > 0,
  );
  const safeSupermanaPickupNow =
    picksSupermana &&
    safeCarrierForMana(after, perspective, { kind: "supermana" });
  const safeOpponentManaPickupNow =
    picksOpponentMana &&
    safeCarrierForMana(after, perspective, {
      kind: "regular",
      color: otherColor(perspective),
    });
  const spiritSupermanaSetup = spiritManaSetup(
    after,
    transition.events,
    perspective,
    { kind: "supermana" },
  );
  const spiritOpponentManaSetup = spiritManaSetup(
    after,
    transition.events,
    perspective,
    { kind: "regular", color: otherColor(perspective) },
  );
  const supermanaProgress =
    scoresSupermanaThisTurn ||
    picksSupermana ||
    manaMovedToward(
      transition.events,
      perspective,
      (mana) => mana.kind === "supermana",
    ) ||
    spiritSupermanaSetup ||
    (summary?.safeSupermanaProgress ?? false) ||
    (summary?.spiritAssistedSupermanaProgress ?? false);
  const opponentManaProgress =
    scoresOpponentManaThisTurn ||
    picksOpponentMana ||
    manaMovedToward(
      transition.events,
      perspective,
      (mana) => mana.kind === "regular" && mana.color !== perspective,
    ) ||
    spiritOpponentManaSetup ||
    (summary?.safeOpponentManaProgress ?? false) ||
    (summary?.spiritAssistedOpponentManaProgress ?? false) ||
    (summary?.spiritAssistedDenial ?? false);
  const safeSupermanaProgressSteps =
    summary?.safeSupermanaProgressSteps ?? UNKNOWN_PROGRESS_STEPS;
  const safeOpponentManaProgressSteps =
    summary?.safeOpponentManaProgressSteps ?? UNKNOWN_PROGRESS_STEPS;
  const scorePathBestSteps =
    summary?.scorePathBestSteps ?? UNKNOWN_SCORE_PATH_STEPS;
  const sameTurnScoreWindowValue = summary?.sameTurnScoreWindowValue ?? 0;
  const spiritDevelopment = hasSpiritDevelopment(
    before,
    after,
    perspective,
    transition.events,
  );
  const spiritSameTurnScoreSetupNow =
    transition.events.some((event) => event.kind === "spirit-target-move") &&
    after.activeColor === perspective &&
    sameTurnScoreWindowValue > 0;
  const spiritOwnManaSetupNow =
    spiritMovesManaToward(
      transition.events,
      perspective,
      (mana) => mana.kind === "regular" && mana.color === perspective,
    ) ||
    spiritSupermanaSetup ||
    spiritOpponentManaSetup;
  const spiritSetupGain = liveSpiritSetupGain(
    summary,
    spiritDevelopment,
    spiritSameTurnScoreSetupNow,
    spiritOwnManaSetupNow,
  );
  const winsImmediately = after.winnerColor() === perspective;
  const attacksOpponentDrainer = classes.drainerAttack;
  const rootCompensatesHandoff =
    winsImmediately ||
    attacksOpponentDrainer ||
    scoresSupermanaThisTurn ||
    scoresOpponentManaThisTurn ||
    summary?.spiritAssistedScore === true;
  const manaHandoffToOpponent =
    !rootCompensatesHandoff &&
    manaHandoffPenalty(
      transition.events,
      perspective,
      Math.max(0, config.rootManaHandoffPenalty),
    ) > 0;
  const roundtrip = hasRoundtrip(transition.events);
  const interviewSoftPriority = rootSoftPriority(config, {
    supermanaProgress,
    opponentManaProgress,
    safeSupermanaProgressSteps,
    safeOpponentManaProgressSteps,
    scoresSupermanaThisTurn,
    scoresOpponentManaThisTurn,
    ownDrainerVulnerable,
    manaHandoffToOpponent,
    hasRoundtrip: roundtrip,
  });
  let heuristic =
    terminalSearchScore(
      after,
      perspective,
      Math.max(0, config.depth - 1),
      config.depth,
    ) ??
    evaluatePreferabilityWithWeightsAndExactPolicy(
      after,
      perspective,
      config.scoringWeights,
      false,
    );
  heuristic = saturatingAddI32(
    heuristic,
    orderingEventBonus(before.activeColor, perspective, transition.events),
  );
  heuristic = saturatingAddI32(heuristic, interviewSoftPriority);
  const spentPotion = transition.events.some(
    (event) => event.kind === "use-potion",
  );
  const compensatedPotion =
    winsImmediately ||
    attacksOpponentDrainer ||
    scoreForColor(after, perspective) >=
      scoreForColor(before, perspective) + 2 ||
    scoresSupermanaThisTurn ||
    scoresOpponentManaThisTurn ||
    summary?.spiritAssistedScore === true ||
    (!ownDrainerVulnerable && (supermanaProgress || opponentManaProgress));
  if (spentPotion && !compensatedPotion) {
    heuristic = saturatingSubI32(
      heuristic,
      Math.max(0, config.potionSpendPenalty),
    );
  }
  return {
    inputs: transition.inputs,
    game: after,
    events: transition.events,
    stateHash,
    heuristic,
    efficiency,
    winsImmediately,
    attacksOpponentDrainer,
    ownDrainerVulnerable,
    ownDrainerWalkVulnerable,
    spiritDevelopment,
    keepsAwakeSpiritOnBase:
      hasAwakeSpiritOnBase(before, perspective) &&
      hasAwakeSpiritOnBase(after, perspective),
    manaHandoffToOpponent,
    hasRoundtrip: roundtrip,
    scoresSupermanaThisTurn,
    scoresOpponentManaThisTurn,
    safeSupermanaPickupNow,
    safeOpponentManaPickupNow,
    safeSupermanaProgressSteps,
    safeOpponentManaProgressSteps,
    scorePathBestSteps,
    sameTurnScoreWindowValue,
    spiritSetupGain,
    spiritSameTurnScoreSetupNow,
    spiritOwnManaSetupNow,
    supermanaProgress,
    opponentManaProgress,
    interviewSoftPriority,
    classes,
  };
}

/** Build a scored root candidate when the advisor has no engine head. */
export function buildRootCandidateForInputs(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
  inputs: readonly Input[],
): RootCandidate | undefined {
  const copiedInputs = cloneInputs(inputs);
  const applied = applyInputsForSearchWithEvents(game, copiedInputs);
  if (applied === undefined) return undefined;
  const candidate = buildRootCandidate(
    game,
    {
      inputs: copiedInputs,
      game: applied.game,
      events: applied.events,
    },
    perspective,
    config,
    isOwnDrainerVulnerable(game, perspective),
    () => rootCandidateSourceSnapshot(game, perspective),
  );
  return candidate === undefined ? undefined : { ...candidate, rootRank: 0 };
}

function compareBooleanPreferred(left: boolean, right: boolean): number {
  return left === right ? 0 : left ? -1 : 1;
}

function progressStepsOrder(left: number, right: number): number {
  const leftKnown = left < UNKNOWN_PROGRESS_STEPS;
  const rightKnown = right < UNKNOWN_PROGRESS_STEPS;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  return leftKnown ? left - right : 0;
}

function scorePathStepsOrder(left: number, right: number): number {
  const leftKnown = left < UNKNOWN_SCORE_PATH_STEPS;
  const rightKnown = right < UNKNOWN_SCORE_PATH_STEPS;
  if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
  return leftKnown ? left - right : 0;
}

function tacticalRootOrder(left: RootCandidate, right: RootCandidate): number {
  let order = compareBooleanPreferred(
    left.winsImmediately,
    right.winsImmediately,
  );
  if (order !== 0) return order;
  order = compareBooleanPreferred(
    left.attacksOpponentDrainer,
    right.attacksOpponentDrainer,
  );
  if (order !== 0) return order;
  order = compareBooleanPreferred(
    !left.ownDrainerVulnerable,
    !right.ownDrainerVulnerable,
  );
  if (order !== 0) return order;
  order = compareBooleanPreferred(
    left.classes.immediateScore,
    right.classes.immediateScore,
  );
  if (order !== 0) return order;
  for (const pair of [
    [left.scoresSupermanaThisTurn, right.scoresSupermanaThisTurn],
    [left.scoresOpponentManaThisTurn, right.scoresOpponentManaThisTurn],
    [left.safeSupermanaPickupNow, right.safeSupermanaPickupNow],
    [left.safeOpponentManaPickupNow, right.safeOpponentManaPickupNow],
  ] as const) {
    order = compareBooleanPreferred(pair[0], pair[1]);
    if (order !== 0) return order;
  }
  if (left.sameTurnScoreWindowValue !== right.sameTurnScoreWindowValue) {
    return right.sameTurnScoreWindowValue - left.sameTurnScoreWindowValue;
  }
  order = compareBooleanPreferred(
    left.spiritSameTurnScoreSetupNow,
    right.spiritSameTurnScoreSetupNow,
  );
  if (order !== 0) return order;
  order = compareBooleanPreferred(
    left.spiritOwnManaSetupNow,
    right.spiritOwnManaSetupNow,
  );
  if (order !== 0) return order;
  if (
    left.spiritOwnManaSetupNow &&
    right.spiritOwnManaSetupNow &&
    left.supermanaProgress &&
    right.supermanaProgress
  ) {
    order = progressStepsOrder(
      left.safeSupermanaProgressSteps,
      right.safeSupermanaProgressSteps,
    );
    if (order !== 0) return order;
  }
  if (
    left.spiritOwnManaSetupNow &&
    right.spiritOwnManaSetupNow &&
    left.opponentManaProgress &&
    right.opponentManaProgress
  ) {
    order = progressStepsOrder(
      left.safeOpponentManaProgressSteps,
      right.safeOpponentManaProgressSteps,
    );
    if (order !== 0) return order;
  }
  if (left.spiritOwnManaSetupNow && right.spiritOwnManaSetupNow) {
    order = scorePathStepsOrder(
      left.scorePathBestSteps,
      right.scorePathBestSteps,
    );
    if (order !== 0) return order;
  }
  order = compareBooleanPreferred(
    left.supermanaProgress,
    right.supermanaProgress,
  );
  if (order !== 0) return order;
  if (left.supermanaProgress && right.supermanaProgress) {
    order = progressStepsOrder(
      left.safeSupermanaProgressSteps,
      right.safeSupermanaProgressSteps,
    );
    if (order !== 0) return order;
  }
  order = compareBooleanPreferred(
    left.opponentManaProgress,
    right.opponentManaProgress,
  );
  if (order !== 0) return order;
  if (left.opponentManaProgress && right.opponentManaProgress) {
    order = progressStepsOrder(
      left.safeOpponentManaProgressSteps,
      right.safeOpponentManaProgressSteps,
    );
    if (order !== 0) return order;
  }
  order = compareBooleanPreferred(
    !left.manaHandoffToOpponent,
    !right.manaHandoffToOpponent,
  );
  if (order !== 0) return order;
  order = compareBooleanPreferred(!left.hasRoundtrip, !right.hasRoundtrip);
  if (order !== 0) return order;
  order = compareBooleanPreferred(
    left.spiritDevelopment,
    right.spiritDevelopment,
  );
  if (order !== 0) return order;
  if (left.efficiency !== right.efficiency) {
    return right.efficiency - left.efficiency;
  }
  return right.heuristic - left.heuristic;
}

export function compareRootCandidates(
  left: RootCandidate,
  right: RootCandidate,
): number {
  if (left.heuristic !== right.heuristic) {
    return right.heuristic - left.heuristic;
  }
  const tactical = tacticalRootOrder(left, right);
  return tactical !== 0
    ? tactical
    : compareInputChains(left.inputs, right.inputs);
}

function hasPriorityClass(
  candidate: RootCandidate,
  classIndex: number,
): boolean {
  switch (classIndex) {
    case 0:
      return candidate.classes.immediateScore;
    case 1:
      return candidate.classes.drainerAttack;
    default:
      return candidate.classes.drainerSafetyRecover;
  }
}

function truncateWithClassCoverage(
  candidates: readonly RootCandidate[],
  limit: number,
): RootCandidate[] {
  if (candidates.length <= limit) return [...candidates];
  if (limit <= 0) return [];
  const selected = new Set<number>();
  const priorityIndices: number[] = [];
  const markPriority = (index: number): void => {
    selected.add(index);
    if (!priorityIndices.includes(index)) priorityIndices.push(index);
  };
  for (let classIndex = 0; classIndex < 3; classIndex += 1) {
    const index = candidates.findIndex((candidate) =>
      hasPriorityClass(candidate, classIndex),
    );
    if (index >= 0) markPriority(index);
  }
  let scoreWindowIndex = -1;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined || candidate.sameTurnScoreWindowValue <= 0) {
      continue;
    }
    const incumbent = candidates[scoreWindowIndex];
    if (
      incumbent === undefined ||
      tacticalRootOrder(candidate, incumbent) < 0
    ) {
      scoreWindowIndex = index;
    }
  }
  if (scoreWindowIndex >= 0) markPriority(scoreWindowIndex);
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate === undefined) continue;
    const directHighValue =
      candidate.scoresSupermanaThisTurn ||
      candidate.scoresOpponentManaThisTurn ||
      candidate.safeSupermanaPickupNow ||
      candidate.safeOpponentManaPickupNow ||
      candidate.spiritSameTurnScoreSetupNow ||
      candidate.sameTurnScoreWindowValue > 0 ||
      candidate.spiritOwnManaSetupNow;
    const exactProgress =
      (candidate.supermanaProgress &&
        candidate.safeSupermanaProgressSteps < UNKNOWN_PROGRESS_STEPS) ||
      (candidate.opponentManaProgress &&
        candidate.safeOpponentManaProgressSteps < UNKNOWN_PROGRESS_STEPS);
    if (directHighValue || exactProgress) selected.add(index);
  }
  const result: RootCandidate[] = [];
  const appended = new Set<number>();
  const append = (index: number): void => {
    if (result.length >= limit || appended.has(index)) return;
    const candidate = candidates[index];
    if (candidate !== undefined) {
      result.push(candidate);
      appended.add(index);
    }
  };
  for (const index of priorityIndices) append(index);
  for (let index = 0; index < candidates.length; index += 1) {
    if (selected.has(index)) append(index);
  }
  for (let index = 0; index < candidates.length; index += 1) {
    append(index);
  }
  return result;
}

function appendUniqueTransitions(
  target: LegalInputTransition[],
  additions: readonly LegalInputTransition[],
): void {
  const seen = new Set(
    target.map((transition) => inputChainKey(transition.inputs)),
  );
  for (const transition of additions) {
    if (seen.has(inputChainKey(transition.inputs))) continue;
    seen.add(inputChainKey(transition.inputs));
    target.push(transition);
  }
}

function forcedAttackCandidatesLimit(config: SearchConfig): number {
  return config.depth >= 3
    ? FORCED_ATTACK_NORMAL_CANDIDATES
    : FORCED_ATTACK_FAST_CANDIDATES;
}

function forcedAttackNodeBudget(config: SearchConfig): number {
  return config.depth >= 3
    ? FORCED_ATTACK_NORMAL_NODE_BUDGET
    : FORCED_ATTACK_FAST_NODE_BUDGET;
}

function forcedAttackEnumLimit(config: SearchConfig): number {
  return config.depth >= 3
    ? FORCED_ATTACK_NORMAL_ENUM_LIMIT
    : FORCED_ATTACK_FAST_ENUM_LIMIT;
}

function spiritSetupFallbackCandidatesLimit(config: SearchConfig): number {
  return config.depth >= 3 ? 8 : 4;
}

function spiritSetupFallbackEnumLimit(config: SearchConfig): number {
  return config.depth >= 3 ? 256 : 128;
}

function safeDrainerPickupFallbackCandidatesLimit(
  config: SearchConfig,
): number {
  return config.depth >= 3 ? 8 : 4;
}

function drainerSafetyFallbackCandidatesLimit(config: SearchConfig): number {
  return config.depth >= 3 ? 8 : 4;
}

function drainerSafetyFallbackEnumLimit(config: SearchConfig): number {
  return config.depth >= 3 ? 192 : 96;
}

function genericRootFallbackEnumLimit(config: SearchConfig): number {
  return config.depth >= 3 ? 24 : 12;
}

function awakeMonLocations(
  game: MonsGame,
  perspective: Color,
  kind?: MonKind,
): Location[] {
  const locations: Location[] = [];
  for (const [location, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (
      mon?.color === perspective &&
      !isMonFainted(mon) &&
      (kind === undefined || mon.kind === kind)
    ) {
      locations.push(location);
    }
  }
  return locations;
}

function hasSpiritScoringManaSetup(
  after: MonsGame,
  events: readonly Event[],
  perspective: Color,
): boolean {
  return (
    spiritMovesManaToward(
      events,
      perspective,
      (mana) => mana.kind === "regular" && mana.color === perspective,
    ) ||
    spiritManaSetup(after, events, perspective, { kind: "supermana" }) ||
    spiritManaSetup(after, events, perspective, {
      kind: "regular",
      color: otherColor(perspective),
    })
  );
}

function collectTargetedSpiritSetupInputs(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
  maxCandidates: number,
): LegalInputTransition[] {
  if (checkpoint() || !game.playerCanUseAction()) return [];
  const spiritLocations = awakeMonLocations(game, perspective, MonKind.Spirit);
  if (spiritLocations.length === 0) return [];
  const limit = Math.max(1, maxCandidates);
  const collected: LegalInputTransition[] = [];
  for (const spiritLocation of spiritLocations) {
    if (checkpoint()) return [];
    if (collected.length >= limit) break;
    const transitions = enumerateLegalTransitionsLexicographicBounded(
      game,
      spiritSetupFallbackEnumLimit(config),
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
      [spiritLocation],
    );
    if (cancelled()) return [];
    for (const transition of transitions) {
      if (checkpoint()) return [];
      if (collected.length >= limit) break;
      if (
        hasSpiritScoringManaSetup(
          transition.game,
          transition.events,
          perspective,
        )
      ) {
        collected.push(transition);
      }
    }
  }
  return collected;
}

function collectTargetedDrainerSafetyInputs(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
  maxCandidates: number,
): LegalInputTransition[] {
  if (checkpoint()) return [];
  const actorLocations = awakeMonLocations(game, perspective);
  if (actorLocations.length === 0) return [];
  const limit = Math.max(1, maxCandidates);
  const collected: LegalInputTransition[] = [];
  const seen = new Set<string>();
  for (const actorLocation of actorLocations) {
    if (checkpoint()) return [];
    if (collected.length >= limit) break;
    const transitions = enumerateLegalTransitionsLexicographicBounded(
      game,
      drainerSafetyFallbackEnumLimit(config),
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
      [actorLocation],
    );
    if (cancelled()) return [];
    for (const transition of transitions) {
      if (checkpoint()) return [];
      if (collected.length >= limit) break;
      if (isOwnDrainerVulnerable(transition.game, perspective)) continue;
      const key = inputChainKey(transition.inputs);
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(transition);
      }
    }
  }
  collected.sort((left, right) =>
    compareInputChains(left.inputs, right.inputs),
  );
  return collected;
}

function eventsPickupWantedMana(
  events: readonly Event[],
  wanted: Mana,
): boolean {
  return events.some(
    (event) => event.kind === "pickup-mana" && manaEquals(event.mana, wanted),
  );
}

function eventsScoreWantedMana(
  events: readonly Event[],
  wanted: Mana,
): boolean {
  return events.some(
    (event) => event.kind === "mana-scored" && manaEquals(event.mana, wanted),
  );
}

function transitionHasSafeDrainerPickup(
  transition: LegalInputTransition,
  perspective: Color,
  wanted: Mana,
): boolean {
  return (
    eventsPickupWantedMana(transition.events, wanted) &&
    safeCarrierForMana(transition.game, perspective, wanted)
  );
}

function collectTargetedSafeDrainerPickupInputs(
  game: MonsGame,
  perspective: Color,
  maxCandidates: number,
  wanted: Mana,
): LegalInputTransition[] {
  if (checkpoint() || !game.playerCanMoveMon()) return [];
  const drainerLocations = awakeMonLocations(
    game,
    perspective,
    MonKind.Drainer,
  );
  if (drainerLocations.length === 0) return [];
  const limit = Math.max(1, maxCandidates);
  const collected: LegalInputTransition[] = [];
  const seen = new Set<string>();
  for (const drainerLocation of drainerLocations) {
    if (checkpoint()) return [];
    if (collected.length >= limit) break;
    const path = exactSecureSpecificManaPathFrom(
      game,
      perspective,
      drainerLocation,
      wanted,
    );
    if (cancelled()) return [];
    if (path === undefined || path.length === 0) continue;
    const inputs: Input[] = [
      {
        kind: "location",
        location: { i: drainerLocation.i, j: drainerLocation.j },
      },
      ...path.map((location): Input => ({
        kind: "location",
        location: { i: location.i, j: location.j },
      })),
    ];
    const applied = applyInputsForSearchWithEvents(game, inputs);
    if (applied === undefined) continue;
    if (
      eventsPickupWantedMana(applied.events, wanted) &&
      (safeCarrierForMana(applied.game, perspective, wanted) ||
        eventsScoreWantedMana(applied.events, wanted))
    ) {
      const key = inputChainKey(inputs);
      if (!seen.has(key)) {
        seen.add(key);
        collected.push({
          inputs,
          game: applied.game,
          events: applied.events,
        });
      }
    }
  }
  collected.sort((left, right) =>
    compareInputChains(left.inputs, right.inputs),
  );
  return collected;
}

function canAttemptForcedDrainerAttackFallback(
  game: MonsGame,
  perspective: Color,
): boolean {
  return (
    game.playerCanMoveMon() &&
    potentialDrainerAttackerLocations(game, perspective).length > 0
  );
}

function canAttackOpponentDrainerBeforeTurnEnds(
  game: MonsGame,
  perspective: Color,
  budget: { remaining: number },
  memo: Hash64Set,
): boolean {
  if (
    checkpoint() ||
    game.activeColor !== perspective ||
    budget.remaining === 0
  ) {
    return false;
  }
  const stateHash = exactSearchStateHash(game);
  if (memo.has(stateHash)) return true;
  budget.remaining = Math.max(0, budget.remaining - 1);
  const canAttack = canAttackOpponentDrainerThisTurn(game, perspective);
  if (canAttack && cacheWriteAllowed()) memo.add(stateHash);
  return canAttack;
}

function collectDrainerAttackInputs(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
  maxCandidates: number,
  targeted: boolean,
): LegalInputTransition[] {
  if (checkpoint()) return [];
  const attackerLocations = targeted
    ? potentialDrainerAttackerLocations(game, perspective)
    : undefined;
  if (targeted && attackerLocations?.length === 0) return [];
  const multiplier = targeted ? 2 : 1;
  const enumLimit = forcedAttackEnumLimit(config) * multiplier;
  const budget = {
    remaining: forcedAttackNodeBudget(config) * multiplier,
  };
  const memo = new Hash64Set(Math.max(1, budget.remaining));
  const transitions = enumerateLegalTransitionsLexicographicBounded(
    game,
    enumLimit,
    FOR_AUTOMOVE_START_INPUT_OPTIONS,
    attackerLocations,
  );
  if (checkpoint()) return [];
  const limit = Math.max(1, maxCandidates);
  const collected: LegalInputTransition[] = [];
  for (const transition of transitions) {
    if (checkpoint()) return [];
    if (collected.length >= limit) break;
    if (attacksDrainer(transition.events, perspective)) {
      collected.push(transition);
      continue;
    }
    if (
      transition.game.activeColor === perspective &&
      canAttackOpponentDrainerBeforeTurnEnds(
        transition.game,
        perspective,
        budget,
        memo,
      )
    ) {
      collected.push(transition);
    }
  }
  return collected;
}

export function rankRootCandidates(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
): RootCandidate[] {
  if (checkpoint()) return [];
  const sourceFen = game.fen();
  const vulnerableBefore = isOwnDrainerVulnerable(game, perspective);
  const rootTransitions = enumerateLegalTransitions(
    game,
    config.rootEnumLimit,
    FOR_AUTOMOVE_START_INPUT_OPTIONS,
  );
  if (
    vulnerableBefore &&
    !rootTransitions.some(
      (transition) => !isOwnDrainerVulnerable(transition.game, perspective),
    )
  ) {
    appendUniqueTransitions(
      rootTransitions,
      collectTargetedDrainerSafetyInputs(
        game,
        perspective,
        config,
        drainerSafetyFallbackCandidatesLimit(config),
      ),
    );
  }
  if (cancelled()) return [];

  const turnBefore = approximateActiveTurnSummary(game, perspective, false);
  const spiritSetupGainBefore = liveSpiritSetupGain(
    turnBefore,
    false,
    false,
    false,
  );
  if (checkpoint()) return [];
  const supermana: Mana = { kind: "supermana" };
  if (
    turnBefore.safeSupermanaProgress &&
    !rootTransitions.some((transition) =>
      transitionHasSafeDrainerPickup(transition, perspective, supermana),
    )
  ) {
    appendUniqueTransitions(
      rootTransitions,
      collectTargetedSafeDrainerPickupInputs(
        game,
        perspective,
        safeDrainerPickupFallbackCandidatesLimit(config),
        supermana,
      ),
    );
  }
  if (cancelled()) return [];
  const opponentMana: Mana = {
    kind: "regular",
    color: otherColor(perspective),
  };
  if (
    turnBefore.safeOpponentManaProgress &&
    !rootTransitions.some((transition) =>
      transitionHasSafeDrainerPickup(transition, perspective, opponentMana),
    )
  ) {
    appendUniqueTransitions(
      rootTransitions,
      collectTargetedSafeDrainerPickupInputs(
        game,
        perspective,
        safeDrainerPickupFallbackCandidatesLimit(config),
        opponentMana,
      ),
    );
  }
  if (cancelled()) return [];
  if (
    (config.enableInterviewHardSpiritDeploy ||
      config.enableRootSpiritDevelopmentPref) &&
    (shouldPreferSpiritDevelopment(game, perspective) ||
      spiritSetupGainBefore > 0 ||
      turnBefore.spiritAssistedSupermanaProgress ||
      turnBefore.spiritAssistedOpponentManaProgress) &&
    !rootTransitions.some((transition) =>
      hasSpiritScoringManaSetup(
        transition.game,
        transition.events,
        perspective,
      ),
    )
  ) {
    appendUniqueTransitions(
      rootTransitions,
      collectTargetedSpiritSetupInputs(
        game,
        perspective,
        config,
        spiritSetupFallbackCandidatesLimit(config),
      ),
    );
  }
  if (cancelled()) return [];

  const exactLiteBudget: ExactLiteBudget = {
    rootCalls: config.exactLiteRootCallBudget,
    staticCalls: config.exactLiteStaticCallBudget,
  };
  let sourceSnapshot: MoveEfficiencySnapshot | undefined;
  const getSourceSnapshot = (): MoveEfficiencySnapshot => {
    sourceSnapshot ??= rootCandidateSourceSnapshot(game, perspective);
    return sourceSnapshot;
  };
  const drafts: RootCandidateDraft[] = [];
  const appendCandidates = (
    transitions: readonly LegalInputTransition[],
  ): boolean => {
    for (const transition of transitions) {
      if (checkpoint()) return false;
      const transitionConfig = withExactLiteBudgetedTransitionConfig(
        config,
        perspective,
        transition,
        exactLiteBudget,
      );
      const candidate = buildRootCandidate(
        game,
        transition,
        perspective,
        transitionConfig,
        vulnerableBefore,
        getSourceSnapshot,
      );
      if (cancelled()) return false;
      if (candidate !== undefined) drafts.push(candidate);
    }
    return true;
  };
  if (!appendCandidates(rootTransitions)) return [];
  if (drafts.length === 0) {
    const fallbackTransitions = enumerateLegalTransitions(
      game,
      genericRootFallbackEnumLimit(config),
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
    );
    if (cancelled() || !appendCandidates(fallbackTransitions)) return [];
  }
  let ranked = drafts.map((candidate, rank): RootCandidate => ({
    ...candidate,
    rootRank: rank,
  }));
  ranked.sort(compareRootCandidates);

  let hasWinningCandidate = ranked.some(
    (candidate) => candidate.winsImmediately,
  );
  let forcedAttackInputKeys: Set<string> | undefined;
  if (
    !hasWinningCandidate &&
    !ranked.some((candidate) => candidate.attacksOpponentDrainer) &&
    canAttemptForcedDrainerAttackFallback(game, perspective)
  ) {
    const fallbackTransitions = collectDrainerAttackInputs(
      game,
      perspective,
      config,
      forcedAttackCandidatesLimit(config),
      config.enableTargetedDrainerAttackFallback,
    );
    if (cancelled()) return [];
    if (fallbackTransitions.length > 0) {
      forcedAttackInputKeys = new Set(
        fallbackTransitions.map((transition) =>
          inputChainKey(transition.inputs),
        ),
      );
      const seen = new Set(
        ranked.map((candidate) => inputChainKey(candidate.inputs)),
      );
      for (const transition of fallbackTransitions) {
        if (checkpoint()) return [];
        const key = inputChainKey(transition.inputs);
        if (seen.has(key)) continue;
        seen.add(key);
        const transitionConfig = withExactLiteBudgetedTransitionConfig(
          config,
          perspective,
          transition,
          exactLiteBudget,
        );
        const draft = buildRootCandidate(
          game,
          transition,
          perspective,
          transitionConfig,
          vulnerableBefore,
          getSourceSnapshot,
        );
        if (cancelled()) return [];
        if (draft !== undefined) {
          ranked.push({ ...draft, rootRank: 0 });
        }
      }
      ranked.sort(compareRootCandidates);
      hasWinningCandidate = ranked.some(
        (candidate) => candidate.winsImmediately,
      );
    }
  }

  if (
    !hasWinningCandidate &&
    ranked.some((candidate) => candidate.attacksOpponentDrainer)
  ) {
    ranked = ranked.filter((candidate) => candidate.attacksOpponentDrainer);
  } else if (forcedAttackInputKeys !== undefined) {
    ranked = ranked.filter((candidate) =>
      forcedAttackInputKeys.has(inputChainKey(candidate.inputs)),
    );
  }
  ranked = truncateWithClassCoverage(ranked, config.rootBranchLimit);
  ranked = ranked.map((candidate, rank) => ({
    ...candidate,
    rootRank: rank,
  }));
  if (game.fen() !== sourceFen) {
    throw new Error("root candidate enumeration mutated its source game");
  }
  return checkpoint() ? [] : ranked;
}

export function terminalSearchScore(
  game: MonsGame,
  perspective: Color,
  depth: number,
  searchDepth: number,
): number | undefined {
  const winner = game.winnerColor();
  if (winner === undefined) return undefined;
  const ply = Math.max(0, searchDepth - depth);
  return winner === perspective
    ? SMART_TERMINAL_SCORE - ply
    : -SMART_TERMINAL_SCORE + ply;
}
