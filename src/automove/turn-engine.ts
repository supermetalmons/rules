import { Board } from "../engine/board.js";
import { MONS_MOVES_PER_TURN, TARGET_SCORE } from "../engine/config.js";
import {
  Color,
  Consumable,
  MonKind,
  cloneInput,
  inputChainKey,
  isMonFainted,
  isSpiritTargetAllowed,
  itemConsumable,
  itemMana,
  itemMon,
  manaEquals,
  manaScore,
  otherColor,
  type Event,
  type Input,
  type Item,
  type Mana,
} from "../engine/domain.js";
import { MonsGame, FOR_AUTOMOVE_START_INPUT_OPTIONS } from "../engine/game.js";
import {
  BOARD_SIZE,
  bombReachableLocations,
  demonReachableLocations,
  locationBetween,
  locationDistance,
  locationEquals,
  locationIndex,
  mysticReachableLocations,
  nearbyLocations,
  spiritReachableLocations,
  type Location,
} from "../engine/geometry.js";
import {
  I32_MAX,
  I32_MIN,
  saturatingAddI32,
  saturatingMulI32,
  saturatingSubI32,
} from "../engine/numerics.js";
import { cacheWriteAllowed, cancelled, checkpoint } from "./deadline.js";
import {
  Hash64Set,
  Hash64Table,
  hash64,
  hash64FromU32,
  hash64Mul,
  hash64RotateLeft,
  hash64Xor,
  type Hash64,
} from "./hash64.js";
import {
  EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS,
  EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
  EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL,
  EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE,
  EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS,
  defaultColorSummary,
  defaultOpportunityContext,
  exactBestScoreStepsOnBoard,
  exactBoardHash,
  exactOpportunityContextWithSearchHash,
  exactOwnDrainerSafetyScoreWithHash,
  exactSameTurnScoreWindowWithSearchHash,
  exactSearchStateHash,
  exactSecureSpecificManaPathFrom,
  exactStrategicAnalysisWithSearchHash,
  exactTurnTacticalProjectionWithSearchHash,
  isDrainerExactlySafeNextTurnOnBoard,
  type ExactColorSummary,
  type ExactOpportunityBudget,
  type ExactOpportunityContext,
  type ExactTurnTacticalProjection,
} from "./exact.js";
import {
  evaluatePreferabilityWithWeightsAndExactPolicy,
  type ScoringWeights,
} from "./scoring.js";
import {
  applyInputsForSearch,
  applyInputsForSearchWithEvents,
  compareInputChains,
  enumerateLegalTransitionsWithPriority,
  type LegalInputTransition,
} from "./transitions.js";

const TURN_ENGINE_CACHE_MAX_ENTRIES = 4_096;
const TURN_ENGINE_COMPILE_LIMIT_MAX = 256;
const LOCAL_HASH_COLLECTION_CAPACITY = Number.MAX_SAFE_INTEGER;
const FNV_OFFSET_BASIS = hash64(0x1465_0fb0, 0x739d_0383);
const FNV_PRIME = hash64(0x0000_0100, 0x0000_01b3);
const U64_MASK = hash64(0xffff_ffff, 0xffff_ffff);
const U64_MASK_MINUS_ONE = hash64(0xffff_ffff, 0xffff_fffe);

export enum TurnEngineMode {
  ProV1 = 0,
  CurrentPro = 1,
}

Object.freeze(TurnEngineMode);

export type TurnEngineConfig = {
  readonly mode: TurnEngineMode;
  readonly ownSeedCap: number;
  readonly ownBeam: number;
  readonly perNodeFamilyCap: number;
  readonly stepCap: number;
  readonly opponentSeedCap: number;
  readonly opponentBeam: number;
  readonly replySeedCap: number;
  readonly replyBeam: number;
  readonly expansionCap: number;
  readonly enableSpiritFamily: boolean;
  readonly scoringWeights: ScoringWeights;
  readonly enableLazyOracleScoreWindowProjection: boolean;
};

export type TurnSnapshot = {
  readonly stateHash: Hash64;
};

export type TurnAction =
  | { readonly kind: "walk"; readonly actor: Location; readonly to: Location }
  | {
      readonly kind: "attack";
      readonly actor: Location;
      readonly target: Location;
    }
  | {
      readonly kind: "spirit-shift";
      readonly actor: Location;
      readonly target: Location;
      readonly destination: Location;
    }
  | {
      readonly kind: "bomb";
      readonly actor: Location;
      readonly target: Location;
    }
  | {
      readonly kind: "move-mana";
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "score-carry";
      readonly actor: Location;
      readonly wanted: Mana;
      readonly step: Location;
    }
  | {
      readonly kind: "safety-retreat";
      readonly actor: Location;
      readonly to: Location;
    };

export enum TurnPlanFamily {
  ImmediateScore = 0,
  DenyOpponentWindow = 1,
  DrainerKill = 2,
  SafeSupermanaProgress = 3,
  SafeOpponentManaProgress = 4,
  DrainerSafetyRecovery = 5,
  SpiritImpact = 6,
  ManaTempo = 7,
}

Object.freeze(TurnPlanFamily);

export type TurnEngineUtilityValues = {
  readonly winState?: number;
  readonly avoidImmediateLoss?: number;
  readonly scoreDelta?: number;
  readonly denyGain?: number;
  readonly drainerAttack?: number;
  readonly drainerSafety?: number;
  readonly evalScore?: number;
};

/** Lexicographically ordered utility tuple used by the turn engine. */
export class TurnEngineUtility {
  public readonly winState: number;
  public readonly avoidImmediateLoss: number;
  public readonly scoreDelta: number;
  public readonly denyGain: number;
  public readonly drainerAttack: number;
  public readonly drainerSafety: number;
  public readonly evalScore: number;

  public constructor(values: TurnEngineUtilityValues = {}) {
    this.winState = values.winState ?? 0;
    this.avoidImmediateLoss = values.avoidImmediateLoss ?? 0;
    this.scoreDelta = values.scoreDelta ?? 0;
    this.denyGain = values.denyGain ?? 0;
    this.drainerAttack = values.drainerAttack ?? 0;
    this.drainerSafety = values.drainerSafety ?? 0;
    this.evalScore = values.evalScore ?? 0;
  }

  public hasNonnegativeDenyGain(): boolean {
    return this.denyGain >= 0;
  }

  public supportsTemporaryRiskRecovery(): boolean {
    return this.drainerSafety > 0 || this.avoidImmediateLoss > 0;
  }

  public strictlyDominatesOverrideAxes(other: TurnEngineUtility): boolean {
    const notWorse =
      this.winState >= other.winState &&
      this.avoidImmediateLoss >= other.avoidImmediateLoss &&
      this.scoreDelta >= other.scoreDelta &&
      this.denyGain >= other.denyGain &&
      this.drainerAttack >= other.drainerAttack &&
      this.drainerSafety >= other.drainerSafety;
    const strictlyBetter =
      this.winState > other.winState ||
      this.avoidImmediateLoss > other.avoidImmediateLoss ||
      this.scoreDelta > other.scoreDelta ||
      this.denyGain > other.denyGain ||
      this.drainerAttack > other.drainerAttack ||
      this.drainerSafety > other.drainerSafety;
    return notWorse && strictlyBetter;
  }

  public passesOverrideGuard(other: TurnEngineUtility): boolean {
    if (!this.strictlyDominatesOverrideAxes(other)) return false;
    const strategicAxisGain =
      this.winState > other.winState ||
      this.avoidImmediateLoss > other.avoidImmediateLoss ||
      this.denyGain > other.denyGain ||
      this.drainerAttack > other.drainerAttack ||
      this.drainerSafety > other.drainerSafety;
    const scoreDeltaForce = this.scoreDelta >= other.scoreDelta + 220;
    return (
      this.evalScore + 192 >= other.evalScore ||
      strategicAxisGain ||
      scoreDeltaForce
    );
  }

  public supportsFamilyFallback(other: TurnEngineUtility): boolean {
    return (
      compareTurnEngineUtilities(this, other) >= 0 &&
      this.evalScore + 192 >= other.evalScore
    );
  }

  public improvesNonScoreOverrideAxes(other: TurnEngineUtility): boolean {
    return (
      this.winState > other.winState ||
      this.avoidImmediateLoss > other.avoidImmediateLoss ||
      this.denyGain > other.denyGain ||
      this.drainerAttack > other.drainerAttack ||
      this.drainerSafety > other.drainerSafety
    );
  }

  public hasScoreDeltaForce(
    other: TurnEngineUtility,
    minGain: number,
  ): boolean {
    return this.scoreDelta >= other.scoreDelta + minGain;
  }

  public supportsPrimaryAxesEvalTolerance(
    other: TurnEngineUtility,
    evalDropMax: number,
  ): boolean {
    return (
      compareUtilityPrimaryAxes(this, other) >= 0 &&
      this.evalScore + evalDropMax >= other.evalScore
    );
  }
}

export type TurnPackageMeta = {
  readonly scoreGain: number;
  readonly denyGain: number;
  readonly drainerSafetyDelta: number;
  readonly spiritOnlySetup: boolean;
  readonly endsNonnegativeDrainerSafety: boolean;
  readonly opponentImmediateWindowAfter: number;
};

export type TurnPlan = {
  readonly actions: readonly TurnAction[];
  readonly compiledChunks: readonly (readonly Input[])[];
  readonly endGame: MonsGame;
  utility: TurnEngineUtility;
  readonly headUtility: TurnEngineUtility;
  readonly headFamily: TurnPlanFamily;
  readonly goalFamily: TurnPlanFamily;
  readonly packageMeta: TurnPackageMeta;
};

export enum OpportunityKind {
  ImmediateScore = 0,
  TacticalDeny = 1,
  DrainerKill = 2,
  SafeSupermanaProgress = 3,
  SafeOpponentManaProgress = 4,
  DrainerSafetyRecovery = 5,
  SpiritImpact = 6,
  ManaTempo = 7,
}

Object.freeze(OpportunityKind);

export type OpportunityBudget = {
  readonly monMovesNeeded: number;
  readonly needsAction: boolean;
  readonly needsManaMove: boolean;
};

export type OpportunityDelta = {
  readonly sameTurnScoreWindowGain: number;
  readonly spiritGain: number;
  readonly opponentWindowDenyGain: number;
  readonly drainerAttack: boolean;
  readonly drainerSafetyDelta: number;
  readonly supermanaProgressGain: number;
  readonly opponentManaProgressGain: number;
};

export type TurnOpportunity = {
  readonly kind: OpportunityKind;
  readonly family: TurnPlanFamily;
  readonly action: TurnAction;
  readonly priority: number;
  readonly budget: OpportunityBudget;
  readonly delta: OpportunityDelta;
};

type ActionSeed = {
  readonly family: TurnPlanFamily;
  readonly action: TurnAction;
  readonly priority: number;
};

type PlanNode = {
  readonly game: MonsGame;
  readonly actions: readonly TurnAction[];
  readonly compiledChunks: readonly (readonly Input[])[];
  readonly headUtility: TurnEngineUtility;
  readonly headFamily: TurnPlanFamily;
  readonly goalFamily: TurnPlanFamily;
};

type MacroOpportunity = {
  readonly headFamily: TurnPlanFamily;
  readonly goalFamily: TurnPlanFamily;
  readonly priority: number;
  readonly delta: OpportunityDelta;
  readonly actions: readonly TurnAction[];
  readonly compiledChunks: readonly (readonly Input[])[];
  readonly endGame: MonsGame;
  readonly endSnapshot: TurnSnapshot;
  readonly headUtility: TurnEngineUtility;
  readonly signature: Hash64;
};

type MacroPlanNode = PlanNode & {
  readonly signature: Hash64;
};

enum PlanBuildStatus {
  NoPlan = "no-plan",
  BudgetExceeded = "budget-exceeded",
}

type PlanGenerationResult =
  | { readonly status: "ok"; readonly plans: TurnPlan[] }
  | { readonly status: PlanBuildStatus };

type PlanBuildResult =
  | { readonly status: "ok"; readonly plan: TurnPlan }
  | { readonly status: PlanBuildStatus };

type TurnOracleContext = {
  readonly opportunity: ExactOpportunityContext;
  readonly strategic: ExactColorSummary;
  readonly opponentImmediateWindow: number;
};

const EMPTY_PACKAGE_META: TurnPackageMeta = Object.freeze({
  scoreGain: 0,
  denyGain: 0,
  drainerSafetyDelta: 0,
  spiritOnlySetup: false,
  endsNonnegativeDrainerSafety: false,
  opponentImmediateWindowAfter: 0,
});

const continuationCache = new Hash64Table<readonly Input[]>(
  TURN_ENGINE_CACHE_MAX_ENTRIES,
);
const oracleCache = new Hash64Table<TurnOracleContext>(
  TURN_ENGINE_CACHE_MAX_ENTRIES,
);
const utilityCache = new Hash64Table<TurnEngineUtility>(
  TURN_ENGINE_CACHE_MAX_ENTRIES,
);
const bestPlanCache = new Hash64Table<TurnPlan>(TURN_ENGINE_CACHE_MAX_ENTRIES);
const noPlanCache = new Hash64Set(TURN_ENGINE_CACHE_MAX_ENTRIES);
const weightIdentity = new WeakMap<object, number>();
let nextWeightIdentity = 1;

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTuples(
  left: readonly number[],
  right: readonly number[],
): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const order = compareNumber(left[index] ?? 0, right[index] ?? 0);
    if (order !== 0) return order;
  }
  return compareNumber(left.length, right.length);
}

function cloneAction(action: TurnAction): TurnAction {
  switch (action.kind) {
    case "walk":
    case "safety-retreat":
      return {
        kind: action.kind,
        actor: { ...action.actor },
        to: { ...action.to },
      };
    case "attack":
    case "bomb":
      return {
        kind: action.kind,
        actor: { ...action.actor },
        target: { ...action.target },
      };
    case "spirit-shift":
      return {
        kind: action.kind,
        actor: { ...action.actor },
        target: { ...action.target },
        destination: { ...action.destination },
      };
    case "move-mana":
      return {
        kind: action.kind,
        from: { ...action.from },
        to: { ...action.to },
      };
    case "score-carry":
      return {
        kind: action.kind,
        actor: { ...action.actor },
        wanted:
          action.wanted.kind === "supermana"
            ? { kind: "supermana" }
            : { kind: "regular", color: action.wanted.color },
        step: { ...action.step },
      };
  }
}

function clonePlan(plan: TurnPlan): TurnPlan {
  return {
    actions: plan.actions.map(cloneAction),
    compiledChunks: plan.compiledChunks.map((chunk) => chunk.map(cloneInput)),
    endGame: plan.endGame.cloneForSimulation(),
    utility: new TurnEngineUtility(plan.utility),
    headUtility: new TurnEngineUtility(plan.headUtility),
    headFamily: plan.headFamily,
    goalFamily: plan.goalFamily,
    packageMeta: { ...plan.packageMeta },
  };
}

function compareChunks(
  left: readonly (readonly Input[])[],
  right: readonly (readonly Input[])[],
): number {
  const lengthOrder = compareNumber(left.length, right.length);
  if (lengthOrder !== 0) return lengthOrder;
  for (let index = 0; index < left.length; index += 1) {
    const order = compareInputChains(left[index] ?? [], right[index] ?? []);
    if (order !== 0) return order;
  }
  return 0;
}

function actionKeyTuple(
  action: TurnAction,
): readonly [number, Location, Location | undefined, Location | undefined] {
  switch (action.kind) {
    case "walk":
      return [0, action.actor, action.to, undefined];
    case "attack":
      return [1, action.actor, action.target, undefined];
    case "spirit-shift":
      return [2, action.actor, action.target, action.destination];
    case "bomb":
      return [3, action.actor, action.target, undefined];
    case "move-mana":
      return [4, action.from, action.to, undefined];
    case "score-carry":
      return [5, action.actor, action.step, undefined];
    case "safety-retreat":
      return [6, action.actor, action.to, undefined];
  }
}

function actionKey(action: TurnAction): string {
  const [tag, first, second, third] = actionKeyTuple(action);
  return `${tag}:${locationIndex(first)}:${second === undefined ? -1 : locationIndex(second)}:${
    third === undefined ? -2 : locationIndex(third)
  }`;
}

function compareLocations(left: Location, right: Location): number {
  const rowOrder = compareNumber(left.i, right.i);
  return rowOrder !== 0 ? rowOrder : compareNumber(left.j, right.j);
}

function compareOptionalLocations(
  left: Location | undefined,
  right: Location | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : -1;
  return right === undefined ? 1 : compareLocations(left, right);
}

function hash64FromNonnegativeInteger(value: number): Hash64 {
  const normalized = Math.max(0, Math.trunc(value));
  if (!Number.isFinite(normalized)) {
    throw new RangeError("turn engine config values must be finite");
  }
  const high = Math.floor(normalized / 0x1_0000_0000);
  const low = normalized - high * 0x1_0000_0000;
  return hash64(high, low);
}

function compareActionKeys(left: TurnAction, right: TurnAction): number {
  const leftKey = actionKeyTuple(left);
  const rightKey = actionKeyTuple(right);
  return (
    compareNumber(leftKey[0], rightKey[0]) ||
    compareLocations(leftKey[1], rightKey[1]) ||
    compareOptionalLocations(leftKey[2], rightKey[2]) ||
    compareOptionalLocations(leftKey[3], rightKey[3])
  );
}

function configFingerprint(config: TurnEngineConfig): Hash64 {
  let identity = weightIdentity.get(config.scoringWeights);
  if (identity === undefined) {
    identity = nextWeightIdentity;
    nextWeightIdentity += 1;
    weightIdentity.set(config.scoringWeights, identity);
  }
  let hash = FNV_OFFSET_BASIS;
  const values = [
    config.ownSeedCap,
    config.ownBeam,
    config.perNodeFamilyCap,
    config.stepCap,
    config.opponentSeedCap,
    config.opponentBeam,
    config.replySeedCap,
    config.replyBeam,
    config.expansionCap,
    Number(config.enableSpiritFamily),
    config.mode === TurnEngineMode.ProV1 ? 1 : 2,
    identity,
  ];
  for (const value of values) {
    hash = hash64Mul(
      hash64Xor(hash, hash64FromNonnegativeInteger(value)),
      FNV_PRIME,
    );
  }
  return hash;
}

type TurnCacheKey = {
  readonly stateHash: Hash64;
  readonly mode: TurnEngineMode;
  readonly configFingerprint: Hash64;
};

function cacheKeyForMode(
  game: MonsGame,
  mode: TurnEngineMode,
  config: TurnEngineConfig,
): TurnCacheKey {
  return {
    stateHash: exactSearchStateHash(game),
    mode,
    configFingerprint: configFingerprint(config),
  };
}

function cacheKey(game: MonsGame, config: TurnEngineConfig): TurnCacheKey {
  return cacheKeyForMode(game, config.mode, config);
}

type UtilityCacheKey = {
  readonly stateHash: Hash64;
  readonly configFingerprint: Hash64;
  readonly startTag: number;
  readonly startLow: number;
};

function utilityCacheKey(
  game: MonsGame,
  start: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): UtilityCacheKey {
  const startHash = exactSearchStateHash(start);
  return {
    stateHash: exactSearchStateHash(game),
    configFingerprint: configFingerprint(config),
    startTag: startHash.hi * 2 + perspective,
    startLow: startHash.lo,
  };
}

function turnCacheGet<V>(
  table: Hash64Table<V>,
  key: TurnCacheKey,
): V | undefined {
  return table.get(key.stateHash, key.mode, key.configFingerprint);
}

function turnCacheHas(table: Hash64Set, key: TurnCacheKey): boolean {
  return table.has(key.stateHash, key.mode, key.configFingerprint);
}

function turnCacheSet<V>(
  table: Hash64Table<V>,
  key: TurnCacheKey,
  value: V,
): void {
  table.set(key.stateHash, value, key.mode, key.configFingerprint);
}

function turnCacheAdd(table: Hash64Set, key: TurnCacheKey): void {
  table.add(key.stateHash, key.mode, key.configFingerprint);
}

function turnCacheDelete<V>(table: Hash64Table<V>, key: TurnCacheKey): void {
  table.delete(key.stateHash, key.mode, key.configFingerprint);
}

export function clearTurnEnginePlanCache(): void {
  continuationCache.clear();
  oracleCache.clear();
  utilityCache.clear();
  bestPlanCache.clear();
  noPlanCache.clear();
}

export function turnSnapshotFromGame(game: MonsGame): TurnSnapshot {
  return { stateHash: exactSearchStateHash(game) };
}

export function compareTurnEngineUtilities(
  left: TurnEngineUtility,
  right: TurnEngineUtility,
): number {
  return compareTuples(
    [
      left.winState,
      left.avoidImmediateLoss,
      left.scoreDelta,
      left.denyGain,
      left.drainerAttack,
      left.drainerSafety,
      left.evalScore,
    ],
    [
      right.winState,
      right.avoidImmediateLoss,
      right.scoreDelta,
      right.denyGain,
      right.drainerAttack,
      right.drainerSafety,
      right.evalScore,
    ],
  );
}

export function compareUtilityPrimaryAxes(
  left: TurnEngineUtility,
  right: TurnEngineUtility,
): number {
  return compareTuples(
    [
      left.winState,
      left.avoidImmediateLoss,
      left.scoreDelta,
      left.denyGain,
      left.drainerAttack,
      left.drainerSafety,
    ],
    [
      right.winState,
      right.avoidImmediateLoss,
      right.scoreDelta,
      right.denyGain,
      right.drainerAttack,
      right.drainerSafety,
    ],
  );
}

function familyRank(family: TurnPlanFamily): number {
  switch (family) {
    case TurnPlanFamily.ImmediateScore:
      return 0;
    case TurnPlanFamily.DenyOpponentWindow:
      return 1;
    case TurnPlanFamily.DrainerKill:
      return 2;
    case TurnPlanFamily.DrainerSafetyRecovery:
      return 3;
    case TurnPlanFamily.SpiritImpact:
      return 4;
    case TurnPlanFamily.SafeSupermanaProgress:
      return 5;
    case TurnPlanFamily.SafeOpponentManaProgress:
      return 6;
    case TurnPlanFamily.ManaTempo:
      return 7;
  }
}

function headOpeningRiskClass(utility: TurnEngineUtility): number {
  if (utility.avoidImmediateLoss < 0) return 0;
  if (utility.drainerSafety < 0 || utility.scoreDelta < 0) return 1;
  return 2;
}

function shouldCompareHeadOpeningUtility(
  family: TurnPlanFamily,
  left: TurnEngineUtility,
  right: TurnEngineUtility,
): boolean {
  return (
    (family === TurnPlanFamily.SafeSupermanaProgress ||
      family === TurnPlanFamily.SafeOpponentManaProgress) &&
    headOpeningRiskClass(left) !== headOpeningRiskClass(right)
  );
}

function comparePlanRank(
  leftUtility: TurnEngineUtility,
  leftHeadUtility: TurnEngineUtility,
  leftHeadFamily: TurnPlanFamily,
  rightUtility: TurnEngineUtility,
  rightHeadUtility: TurnEngineUtility,
  rightHeadFamily: TurnPlanFamily,
): number {
  let order = compareUtilityPrimaryAxes(leftUtility, rightUtility);
  if (order !== 0) return order;
  if (
    leftHeadFamily === rightHeadFamily &&
    shouldCompareHeadOpeningUtility(
      leftHeadFamily,
      leftHeadUtility,
      rightHeadUtility,
    )
  ) {
    order = compareUtilityPrimaryAxes(leftHeadUtility, rightHeadUtility);
    if (order !== 0) return order;
    order = compareNumber(
      leftHeadUtility.evalScore,
      rightHeadUtility.evalScore,
    );
    if (order !== 0) return order;
  }
  return compareNumber(leftUtility.evalScore, rightUtility.evalScore);
}

function comparePackageMeta(
  left: TurnPackageMeta,
  right: TurnPackageMeta,
): number {
  return compareTuples(
    [
      Number(left.scoreGain > 0),
      left.scoreGain,
      Number(left.denyGain > 0),
      left.denyGain,
      Number(left.drainerSafetyDelta > 0),
      left.drainerSafetyDelta,
      Number(left.endsNonnegativeDrainerSafety),
      Number(!left.spiritOnlySetup),
      -left.opponentImmediateWindowAfter,
    ],
    [
      Number(right.scoreGain > 0),
      right.scoreGain,
      Number(right.denyGain > 0),
      right.denyGain,
      Number(right.drainerSafetyDelta > 0),
      right.drainerSafetyDelta,
      Number(right.endsNonnegativeDrainerSafety),
      Number(!right.spiritOnlySetup),
      -right.opponentImmediateWindowAfter,
    ],
  );
}

export function turnEngineComparePlans(
  left: TurnPlan,
  right: TurnPlan,
): number {
  let order = comparePlanRank(
    left.utility,
    left.headUtility,
    left.headFamily,
    right.utility,
    right.headUtility,
    right.headFamily,
  );
  if (order !== 0) return order;
  order = comparePackageMeta(left.packageMeta, right.packageMeta);
  if (order !== 0) return order;
  order = compareNumber(
    familyRank(right.goalFamily),
    familyRank(left.goalFamily),
  );
  if (order !== 0) return order;
  order = compareNumber(
    familyRank(right.headFamily),
    familyRank(left.headFamily),
  );
  if (order !== 0) return order;
  order = compareNumber(right.actions.length, left.actions.length);
  return order !== 0
    ? order
    : compareChunks(left.compiledChunks, right.compiledChunks);
}

function cachedBestPlanIfLegal(
  game: MonsGame,
  key: TurnCacheKey,
): TurnPlan | undefined {
  if (checkpoint()) return undefined;
  const cached = turnCacheGet(bestPlanCache, key);
  if (cached === undefined) return undefined;
  const first = cached.compiledChunks[0];
  const legal =
    first !== undefined && applyInputsForSearch(game, first) !== undefined;
  if (checkpoint()) return undefined;
  if (!legal) {
    if (cacheWriteAllowed()) turnCacheDelete(bestPlanCache, key);
    return undefined;
  }
  return clonePlan(cached);
}

function cachedStepIfLegal(
  game: MonsGame,
  config: TurnEngineConfig,
): Input[] | undefined {
  if (checkpoint()) return undefined;
  const key = cacheKey(game, config);
  const cached = turnCacheGet(continuationCache, key);
  if (cached === undefined) return undefined;
  const legal = applyInputsForSearch(game, cached) !== undefined;
  if (checkpoint()) return undefined;
  if (!legal) {
    if (cacheWriteAllowed()) turnCacheDelete(continuationCache, key);
    return undefined;
  }
  return cached.map(cloneInput);
}

export function turnEngineCachedStep(
  game: MonsGame,
  config: TurnEngineConfig,
): Input[] | undefined {
  if (checkpoint()) return undefined;
  const result = cachedStepIfLegal(game, config);
  return checkpoint() ? undefined : result;
}

export function turnEngineStoreCachedStep(
  game: MonsGame,
  mode: TurnEngineMode,
  config: TurnEngineConfig,
  inputs: readonly Input[],
): void {
  if (checkpoint() || !cacheWriteAllowed()) return;
  turnCacheSet(
    continuationCache,
    cacheKeyForMode(game, mode, config),
    inputs.map(cloneInput),
  );
}

export function turnEngineCandidatePlan(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): TurnPlan | undefined {
  if (checkpoint() || game.activeColor !== perspective) return undefined;
  const key = cacheKey(game, config);
  if (turnCacheHas(noPlanCache, key)) return undefined;
  const cached = cachedBestPlanIfLegal(game, key);
  if (cached !== undefined) return checkpoint() ? undefined : cached;

  const result = buildBestPlan(game, perspective, config);
  if (checkpoint()) return undefined;
  switch (result.status) {
    case PlanBuildStatus.NoPlan:
      if (cacheWriteAllowed()) turnCacheAdd(noPlanCache, key);
      return undefined;
    case PlanBuildStatus.BudgetExceeded:
      return undefined;
    case "ok": {
      if (!cacheWriteAllowed()) return undefined;
      turnCacheSet(bestPlanCache, key, clonePlan(result.plan));
      return result.plan;
    }
  }
}

export function turnEngineCandidatePlanLive(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): TurnPlan | undefined {
  if (checkpoint() || game.activeColor !== perspective) return undefined;
  const result = buildBestPlan(game, perspective, config);
  return checkpoint() || result.status !== "ok" ? undefined : result.plan;
}

function allowedRankMap(
  allowedFirstSteps: readonly (readonly Input[])[],
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  allowedFirstSteps.forEach((inputs, rank) => {
    const key = inputChainKey(inputs);
    if (!result.has(key)) result.set(key, rank);
  });
  return result;
}

type AllowedHeadSelectionMeta = {
  readonly rank: number;
  readonly allowedLength: number;
  readonly firstStepOpponentImmediateLoss: boolean;
  readonly firstStepDrainerSafety: number;
};

function allowedHeadSelectionMeta(
  root: MonsGame,
  plan: TurnPlan,
  perspective: Color,
  rank: number,
  allowedLength: number,
): AllowedHeadSelectionMeta {
  const first = plan.compiledChunks[0];
  const after =
    first === undefined ? undefined : applyInputsForSearch(root, first);
  return {
    rank,
    allowedLength,
    firstStepOpponentImmediateLoss:
      after !== undefined && opponentCanWinImmediately(after, perspective),
    firstStepDrainerSafety:
      after === undefined
        ? Math.trunc(I32_MIN / 4)
        : ownDrainerSafetyScore(after.board, perspective),
  };
}

function allowedHeadRankAdjustedEval(
  utility: TurnEngineUtility,
  meta: AllowedHeadSelectionMeta,
): number {
  return saturatingAddI32(
    utility.evalScore,
    saturatingMulI32(
      Math.min(Math.max(meta.allowedLength - meta.rank, 0), 96),
      12,
    ),
  );
}

function compareAllowedHeadPlans(
  left: TurnPlan,
  leftMeta: AllowedHeadSelectionMeta,
  right: TurnPlan,
  rightMeta: AllowedHeadSelectionMeta,
): number {
  let order = compareUtilityPrimaryAxes(left.utility, right.utility);
  if (order !== 0) return order;
  order = compareTuples(
    [
      Number(!leftMeta.firstStepOpponentImmediateLoss),
      leftMeta.firstStepDrainerSafety,
    ],
    [
      Number(!rightMeta.firstStepOpponentImmediateLoss),
      rightMeta.firstStepDrainerSafety,
    ],
  );
  if (order !== 0) return order;
  order = compareNumber(
    allowedHeadRankAdjustedEval(left.utility, leftMeta),
    allowedHeadRankAdjustedEval(right.utility, rightMeta),
  );
  if (order !== 0) return order;
  order = turnEngineComparePlans(left, right);
  return order !== 0 ? order : compareNumber(rightMeta.rank, leftMeta.rank);
}

function bestPlanFromAllowedHeads(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  plans: readonly TurnPlan[],
  allowedFirstSteps: readonly (readonly Input[])[],
): TurnPlan | undefined {
  const ranks = allowedRankMap(allowedFirstSteps);
  let best: { plan: TurnPlan; meta: AllowedHeadSelectionMeta } | undefined;
  for (const plan of plans) {
    if (checkpoint()) return undefined;
    const first = plan.compiledChunks[0];
    if (first === undefined) continue;
    const rank = ranks.get(inputChainKey(first));
    if (rank === undefined) continue;
    plan.utility = evaluatePlanWithReplies(game, plan, perspective, config);
    if (cancelled()) return undefined;
    const meta = allowedHeadSelectionMeta(
      game,
      plan,
      perspective,
      rank,
      allowedFirstSteps.length,
    );
    if (
      best === undefined ||
      compareAllowedHeadPlans(plan, meta, best.plan, best.meta) > 0
    ) {
      best = { plan, meta };
    }
  }
  return best?.plan;
}

function buildBestPlanFromAllowedHeads(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  allowedFirstSteps: readonly (readonly Input[])[],
): PlanBuildResult {
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  const generated = generatePlansForMode(
    game,
    perspective,
    config,
    Math.max(config.ownSeedCap, 1),
    Math.max(config.ownBeam, 1),
    Math.max(config.stepCap, 1),
    Math.max(config.expansionCap, 1),
  );
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  if (generated.status === PlanBuildStatus.BudgetExceeded) return generated;

  if (generated.status === "ok") {
    const selected = bestPlanFromAllowedHeads(
      game,
      perspective,
      config,
      generated.plans,
      allowedFirstSteps,
    );
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    if (selected !== undefined) return { status: "ok", plan: selected };
  }

  const fallback = fallbackSingleActionPlanFromAllowedHeads(
    game,
    perspective,
    config,
    allowedFirstSteps,
  );
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  return fallback === undefined
    ? { status: PlanBuildStatus.NoPlan }
    : { status: "ok", plan: fallback };
}

export function turnEngineCandidatePlanFromAllowedHeads(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  allowedFirstSteps: readonly (readonly Input[])[],
): TurnPlan | undefined {
  if (
    checkpoint() ||
    game.activeColor !== perspective ||
    allowedFirstSteps.length === 0
  ) {
    return undefined;
  }
  const ranks = allowedRankMap(allowedFirstSteps);
  const cached = cachedBestPlanIfLegal(game, cacheKey(game, config));
  const cachedFirst = cached?.compiledChunks[0];
  if (cachedFirst !== undefined && ranks.has(inputChainKey(cachedFirst))) {
    return cached;
  }
  const result = buildBestPlanFromAllowedHeads(
    game,
    perspective,
    config,
    allowedFirstSteps,
  );
  return checkpoint() || result.status !== "ok" ? undefined : result.plan;
}

export function turnEngineNextInputsFromAllowedHeads(
  game: MonsGame,
  perspective: Color,
  mode: TurnEngineMode,
  config: TurnEngineConfig,
  allowedFirstSteps: readonly (readonly Input[])[],
): Input[] | undefined {
  if (
    checkpoint() ||
    game.activeColor !== perspective ||
    allowedFirstSteps.length === 0
  ) {
    return undefined;
  }
  const allowed = new Set(allowedFirstSteps.map(inputChainKey));
  const cached = turnEngineCachedStep(game, config);
  if (cached !== undefined && allowed.has(inputChainKey(cached))) return cached;
  const plan = turnEngineCandidatePlanFromAllowedHeads(
    game,
    perspective,
    config,
    allowedFirstSteps,
  );
  if (plan === undefined || checkpoint()) return undefined;
  registerPlanContinuations(game, perspective, mode, plan, config);
  if (cancelled()) return undefined;
  return plan.compiledChunks[0]?.map(cloneInput);
}

export function turnEngineCommitPlan(
  game: MonsGame,
  perspective: Color,
  mode: TurnEngineMode,
  plan: TurnPlan,
  config: TurnEngineConfig,
): void {
  if (!checkpoint())
    registerPlanContinuations(game, perspective, mode, plan, config);
}

function registerPlanContinuations(
  game: MonsGame,
  perspective: Color,
  mode: TurnEngineMode,
  plan: TurnPlan,
  config: TurnEngineConfig,
): void {
  if (checkpoint() || plan.compiledChunks.length === 0) return;
  let state = game.cloneForSimulation();
  const startColor = game.activeColor;
  for (let index = 0; index < plan.compiledChunks.length; index += 1) {
    if (checkpoint()) return;
    const chunk = plan.compiledChunks[index];
    if (chunk === undefined) continue;
    if (index > 0 && mode === TurnEngineMode.CurrentPro) {
      const fresh = turnEngineCandidatePlan(state, perspective, config);
      if (fresh?.compiledChunks[0] === undefined || checkpoint()) break;
      if (compareInputChains(fresh.compiledChunks[0], chunk) !== 0) break;
    }
    if (!cacheWriteAllowed()) return;
    turnCacheSet(
      continuationCache,
      cacheKeyForMode(state, mode, config),
      chunk.map(cloneInput),
    );
    const next = applyInputsForSearch(state, chunk);
    if (next?.activeColor !== startColor) break;
    state = next;
  }
}

export function turnEngineEvaluateStateUtility(
  game: MonsGame,
  start: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): TurnEngineUtility {
  if (checkpoint()) return new TurnEngineUtility();
  const utility = evaluateStateUtility(game, start, perspective, config);
  return checkpoint() ? new TurnEngineUtility() : utility;
}

export function turnEngineEvaluatePlanWithReplies(
  root: MonsGame,
  plan: TurnPlan,
  perspective: Color,
  config: TurnEngineConfig,
): TurnEngineUtility {
  if (checkpoint()) return new TurnEngineUtility();
  const utility = evaluatePlanWithReplies(root, plan, perspective, config);
  return checkpoint() ? new TurnEngineUtility() : utility;
}

function turnOracleContext(
  game: MonsGame,
  perspective: Color,
): TurnOracleContext {
  if (checkpoint()) return emptyOracleContext();
  const stateHash = exactSearchStateHash(game);
  const cached = oracleCache.get(stateHash, perspective);
  if (cached !== undefined) return checkpoint() ? emptyOracleContext() : cached;
  const analysis = exactStrategicAnalysisWithSearchHash(game, stateHash);
  if (checkpoint()) return emptyOracleContext();
  const opportunity = exactOpportunityContextWithSearchHash(
    game,
    perspective,
    stateHash,
  );
  if (checkpoint()) return emptyOracleContext();
  const built: TurnOracleContext = {
    opportunity,
    strategic: analysis.colorSummary(perspective),
    opponentImmediateWindow: analysis.colorSummary(otherColor(perspective))
      .immediateWindow.bestScore,
  };
  if (cacheWriteAllowed()) oracleCache.set(stateHash, built, perspective);
  return built;
}

function emptyOracleContext(): TurnOracleContext {
  return {
    opportunity: defaultOpportunityContext(),
    strategic: defaultColorSummary(),
    opponentImmediateWindow: 0,
  };
}

function activeTurnScoreWindowWithSearchHash(
  game: MonsGame,
  color: Color,
  stateHash: Hash64,
): number {
  if (checkpoint()) return 0;
  const value = exactSameTurnScoreWindowWithSearchHash(game, color, stateHash);
  return checkpoint() ? 0 : value;
}

function activeTurnScoreWindow(game: MonsGame, color: Color): number {
  return activeTurnScoreWindowWithSearchHash(
    game,
    color,
    exactSearchStateHash(game),
  );
}

function scoreForColor(game: MonsGame, color: Color): number {
  return color === Color.White ? game.whiteScore : game.blackScore;
}

function winnerState(game: MonsGame, perspective: Color): number {
  const winner = game.winnerColor();
  return winner === undefined ? 0 : winner === perspective ? 2 : -2;
}

function opponentCanWinImmediately(
  game: MonsGame,
  perspective: Color,
): boolean {
  const opponent = otherColor(perspective);
  if (game.winnerColor() !== undefined || game.activeColor !== opponent)
    return false;
  const needed = saturatingSubI32(TARGET_SCORE, scoreForColor(game, opponent));
  return needed <= 0 || activeTurnScoreWindow(game, opponent) >= needed;
}

function ownDrainerSafetyScore(board: Board, color: Color): number {
  return exactOwnDrainerSafetyScoreWithHash(
    board,
    exactBoardHash(board),
    color,
  );
}

function findAwakeDrainerLocation(
  board: Board,
  color: Color,
): Location | undefined {
  for (const [at, item] of board.occupied()) {
    const mon = itemMon(item);
    if (
      mon?.color === color &&
      mon.kind === MonKind.Drainer &&
      !isMonFainted(mon)
    )
      return at;
  }
  return undefined;
}

function ownDrainerCarriesSafeMana(
  board: Board,
  color: Color,
  wanted: Mana,
): boolean {
  const at = findAwakeDrainerLocation(board, color);
  if (at === undefined) return false;
  const item = board.item(at);
  return (
    item?.kind === "mon-with-mana" &&
    manaEquals(item.mana, wanted) &&
    isDrainerExactlySafeNextTurnOnBoard(board, color, at)
  );
}

function evaluateStateUtility(
  game: MonsGame,
  start: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): TurnEngineUtility {
  if (checkpoint()) return new TurnEngineUtility();
  const key = utilityCacheKey(game, start, perspective, config);
  const cached = utilityCache.get(
    key.stateHash,
    key.startTag,
    key.configFingerprint,
    key.startLow,
  );
  if (cached !== undefined)
    return checkpoint() ? new TurnEngineUtility() : cached;

  const myScore = scoreForColor(game, perspective);
  const startScore = scoreForColor(start, perspective);
  const scoreDelta = saturatingSubI32(myScore, startScore);
  const oracle = turnOracleContext(game, perspective);
  if (cancelled()) return new TurnEngineUtility();
  const bestSteps = oracle.strategic.scorePathWindow.bestSteps;
  const pathBonus =
    bestSteps === undefined
      ? 0
      : saturatingMulI32(Math.max(BOARD_SIZE * 3 - bestSteps, 0), 22);
  const immediateBonus = saturatingAddI32(
    saturatingMulI32(oracle.strategic.immediateWindow.bestScore, 110),
    saturatingMulI32(oracle.strategic.immediateWindow.multiPressure, 18),
  );
  const supermana: Mana = { kind: "supermana" };
  const opponentMana: Mana = {
    kind: "regular",
    color: otherColor(perspective),
  };
  const safeSupermanaBonus = ownDrainerCarriesSafeMana(
    game.board,
    perspective,
    supermana,
  )
    ? 380
    : 0;
  const safeOpponentManaBonus = ownDrainerCarriesSafeMana(
    game.board,
    perspective,
    opponentMana,
  )
    ? 300
    : 0;
  const opponent = otherColor(perspective);
  const opponentWindowBefore = activeTurnScoreWindow(start, opponent);
  if (cancelled()) return new TurnEngineUtility();
  const opponentWindowAfter =
    game.activeColor === opponent
      ? activeTurnScoreWindow(game, opponent)
      : oracle.opponentImmediateWindow;
  if (cancelled()) return new TurnEngineUtility();
  const denyGain = saturatingSubI32(opponentWindowBefore, opponentWindowAfter);
  const drainerSafety = ownDrainerSafetyScore(game.board, perspective);
  const unsafeProgressPenalty =
    drainerSafety < 0
      ? saturatingMulI32(Math.min(Math.abs(drainerSafety), I32_MAX), 900)
      : 0;
  const opponentNeededBefore = saturatingSubI32(
    TARGET_SCORE,
    scoreForColor(start, opponent),
  );
  const opponentNeededAfter = saturatingSubI32(
    TARGET_SCORE,
    scoreForColor(game, opponent),
  );
  const deniedImmediateWindow =
    opponentNeededBefore > 0 &&
    opponentWindowBefore >= opponentNeededBefore &&
    (opponentNeededAfter <= 0 || opponentWindowAfter < opponentNeededAfter);
  const evalScore = evaluatePreferabilityWithWeightsAndExactPolicy(
    game,
    perspective,
    config.scoringWeights,
    false,
  );
  if (checkpoint()) return new TurnEngineUtility();
  const utility = new TurnEngineUtility({
    winState: winnerState(game, perspective),
    avoidImmediateLoss: opponentCanWinImmediately(game, perspective) ? -1 : 1,
    scoreDelta: saturatingSubI32(
      saturatingAddI32(
        saturatingAddI32(
          saturatingAddI32(
            saturatingAddI32(saturatingMulI32(scoreDelta, 2_400), pathBonus),
            immediateBonus,
          ),
          safeSupermanaBonus,
        ),
        safeOpponentManaBonus,
      ),
      unsafeProgressPenalty,
    ),
    denyGain: saturatingAddI32(
      saturatingMulI32(denyGain, 220),
      deniedImmediateWindow ? 1_500 : 0,
    ),
    drainerAttack:
      findAwakeDrainerLocation(game.board, otherColor(perspective)) ===
      undefined
        ? 1
        : 0,
    drainerSafety,
    evalScore,
  });
  if (cacheWriteAllowed()) {
    utilityCache.set(
      key.stateHash,
      utility,
      key.startTag,
      key.configFingerprint,
      key.startLow,
    );
  }
  return utility;
}

function quickOrderScore(
  root: MonsGame,
  game: MonsGame,
  perspective: Color,
  family: TurnPlanFamily,
  stepLength: number,
  config: TurnEngineConfig,
): number {
  const utility = evaluateStateUtility(game, root, perspective, config);
  const familyBonus = (() => {
    switch (family) {
      case TurnPlanFamily.ImmediateScore:
        return 1_000;
      case TurnPlanFamily.DenyOpponentWindow:
        return 960;
      case TurnPlanFamily.DrainerKill:
        return 920;
      case TurnPlanFamily.DrainerSafetyRecovery:
        return 860;
      case TurnPlanFamily.SpiritImpact:
        return 820;
      case TurnPlanFamily.SafeSupermanaProgress:
        return 760;
      case TurnPlanFamily.SafeOpponentManaProgress:
        return 720;
      case TurnPlanFamily.ManaTempo:
        return 560;
    }
  })();
  return (
    utility.winState * 10_000_000 +
    utility.avoidImmediateLoss * 5_000_000 +
    utility.scoreDelta +
    utility.denyGain +
    utility.drainerAttack * 3_500 +
    utility.drainerSafety * 2_200 +
    Math.trunc(utility.evalScore / 8) +
    familyBonus * 2_000 -
    stepLength * 350
  );
}

function buildBestPlan(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): PlanBuildResult {
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  const generated = generatePlansForMode(
    game,
    perspective,
    config,
    Math.max(config.ownSeedCap, 1),
    Math.max(config.ownBeam, 1),
    Math.max(config.stepCap, 1),
    Math.max(config.expansionCap, 1),
  );
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  if (generated.status === PlanBuildStatus.BudgetExceeded) return generated;

  let plans: TurnPlan[];
  if (generated.status === "ok") {
    plans = generated.plans;
  } else {
    const fallback = fallbackSingleActionPlan(game, perspective, config);
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    return fallback === undefined
      ? { status: PlanBuildStatus.NoPlan }
      : { status: "ok", plan: fallback };
  }

  if (config.mode === TurnEngineMode.CurrentPro && plans.length > 1) {
    plans.sort((left, right) => -turnEngineComparePlans(left, right));
    const shortlistLength = Math.min(
      plans.length,
      Math.min(Math.max(Math.max(config.ownBeam, 1) * 2, 6), 12),
    );
    const perSignatureCap = config.ownBeam >= 4 ? 2 : 1;
    const signatures = new Map<string, number>();
    const shortlisted: TurnPlan[] = [];
    for (const plan of plans) {
      const signature = `${inputChainKey(plan.compiledChunks[0] ?? [])}:${plan.headFamily}:${
        plan.goalFamily
      }`;
      const count = signatures.get(signature) ?? 0;
      if (count >= perSignatureCap) continue;
      signatures.set(signature, count + 1);
      shortlisted.push(plan);
      if (shortlisted.length >= shortlistLength) break;
    }
    plans = shortlisted;
  }

  let best: TurnPlan | undefined;
  for (const plan of plans) {
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    plan.utility = evaluatePlanWithReplies(game, plan, perspective, config);
    if (cancelled()) return { status: PlanBuildStatus.BudgetExceeded };
    if (best === undefined || turnEngineComparePlans(plan, best) > 0)
      best = plan;
  }
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  return best === undefined
    ? { status: PlanBuildStatus.NoPlan }
    : { status: "ok", plan: best };
}

function generatePlansForMode(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  seedCap: number,
  beamWidth: number,
  stepCap: number,
  expansionCap: number,
): PlanGenerationResult {
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  const result =
    config.mode === TurnEngineMode.CurrentPro
      ? generateMacroPlans(
          game,
          perspective,
          config,
          seedCap,
          beamWidth,
          Math.min(stepCap, bundlePlanCapForConfig(config)),
          expansionCap,
        )
      : generateTurnPlans(
          game,
          perspective,
          config,
          seedCap,
          beamWidth,
          stepCap,
          expansionCap,
        );
  return checkpoint() ? { status: PlanBuildStatus.BudgetExceeded } : result;
}

function bundleChunkCapForConfig(config: TurnEngineConfig): number {
  return Math.min(Math.max(config.stepCap, 1), 6);
}

function bundlePlanCapForConfig(config: TurnEngineConfig): number {
  return Math.min(Math.max(config.stepCap, 1), 4);
}

function mergePlanFamily(
  current: TurnPlanFamily,
  next: TurnPlanFamily,
): TurnPlanFamily {
  return familyRank(next) < familyRank(current) ? next : current;
}

function macroFollowupFamilyAllowed(
  head: TurnPlanFamily,
  goal: TurnPlanFamily,
  candidate: TurnPlanFamily,
): boolean {
  if (candidate === goal || candidate === head) return true;
  switch (head) {
    case TurnPlanFamily.ImmediateScore:
      return (
        candidate === TurnPlanFamily.ImmediateScore ||
        candidate === TurnPlanFamily.DrainerSafetyRecovery ||
        candidate === TurnPlanFamily.SafeSupermanaProgress ||
        candidate === TurnPlanFamily.SafeOpponentManaProgress
      );
    case TurnPlanFamily.DenyOpponentWindow:
    case TurnPlanFamily.DrainerKill:
      return (
        candidate === TurnPlanFamily.ImmediateScore ||
        candidate === TurnPlanFamily.DenyOpponentWindow ||
        candidate === TurnPlanFamily.DrainerKill ||
        candidate === TurnPlanFamily.DrainerSafetyRecovery ||
        candidate === TurnPlanFamily.SafeSupermanaProgress ||
        candidate === TurnPlanFamily.SafeOpponentManaProgress
      );
    case TurnPlanFamily.DrainerSafetyRecovery:
      return (
        candidate === TurnPlanFamily.ImmediateScore ||
        candidate === TurnPlanFamily.DrainerSafetyRecovery ||
        candidate === TurnPlanFamily.SafeSupermanaProgress ||
        candidate === TurnPlanFamily.SafeOpponentManaProgress ||
        candidate === TurnPlanFamily.ManaTempo
      );
    case TurnPlanFamily.SpiritImpact:
      return (
        candidate === TurnPlanFamily.ImmediateScore ||
        candidate === TurnPlanFamily.DenyOpponentWindow ||
        candidate === TurnPlanFamily.SpiritImpact ||
        candidate === TurnPlanFamily.SafeSupermanaProgress ||
        candidate === TurnPlanFamily.SafeOpponentManaProgress ||
        candidate === TurnPlanFamily.DrainerSafetyRecovery
      );
    case TurnPlanFamily.SafeSupermanaProgress:
    case TurnPlanFamily.SafeOpponentManaProgress:
      return (
        candidate === TurnPlanFamily.ImmediateScore ||
        candidate === TurnPlanFamily.DrainerSafetyRecovery ||
        candidate === TurnPlanFamily.SafeSupermanaProgress ||
        candidate === TurnPlanFamily.SafeOpponentManaProgress ||
        candidate === TurnPlanFamily.DenyOpponentWindow ||
        candidate === TurnPlanFamily.SpiritImpact
      );
    case TurnPlanFamily.ManaTempo:
      return (
        candidate === TurnPlanFamily.ImmediateScore ||
        candidate === TurnPlanFamily.DrainerSafetyRecovery ||
        candidate === TurnPlanFamily.SafeSupermanaProgress ||
        candidate === TurnPlanFamily.SafeOpponentManaProgress ||
        candidate === TurnPlanFamily.SpiritImpact ||
        candidate === TurnPlanFamily.ManaTempo
      );
  }
}

function macroFollowupFamilyBonus(
  head: TurnPlanFamily,
  goal: TurnPlanFamily,
  candidate: TurnPlanFamily,
): number {
  let bonus = 0;
  if (candidate === goal) bonus += 420;
  if (candidate === head) bonus += 220;
  if (candidate === TurnPlanFamily.ImmediateScore) bonus += 640;
  if (
    head === TurnPlanFamily.SpiritImpact &&
    (candidate === TurnPlanFamily.SpiritImpact ||
      candidate === TurnPlanFamily.ImmediateScore ||
      candidate === TurnPlanFamily.SafeSupermanaProgress ||
      candidate === TurnPlanFamily.SafeOpponentManaProgress)
  ) {
    bonus += 180;
  }
  if (
    (head === TurnPlanFamily.SafeSupermanaProgress ||
      head === TurnPlanFamily.SafeOpponentManaProgress) &&
    (candidate === TurnPlanFamily.SafeSupermanaProgress ||
      candidate === TurnPlanFamily.SafeOpponentManaProgress ||
      candidate === TurnPlanFamily.ImmediateScore)
  ) {
    bonus += 180;
  }
  if (
    head === TurnPlanFamily.DrainerSafetyRecovery &&
    (candidate === TurnPlanFamily.DrainerSafetyRecovery ||
      candidate === TurnPlanFamily.SafeSupermanaProgress ||
      candidate === TurnPlanFamily.SafeOpponentManaProgress ||
      candidate === TurnPlanFamily.ImmediateScore)
  ) {
    bonus += 160;
  }
  return bonus;
}

function macroFollowupFamilies(
  head: TurnPlanFamily,
  goal: TurnPlanFamily,
): TurnPlanFamily[] {
  return [
    TurnPlanFamily.ImmediateScore,
    TurnPlanFamily.DenyOpponentWindow,
    TurnPlanFamily.DrainerKill,
    TurnPlanFamily.DrainerSafetyRecovery,
    TurnPlanFamily.SpiritImpact,
    TurnPlanFamily.SafeSupermanaProgress,
    TurnPlanFamily.SafeOpponentManaProgress,
    TurnPlanFamily.ManaTempo,
  ].filter((candidate) => macroFollowupFamilyAllowed(head, goal, candidate));
}

function macroFollowupSeedCandidates(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  head: TurnPlanFamily,
  goal: TurnPlanFamily,
  usedActions: readonly TurnAction[],
): TurnOpportunity[] {
  const oracle = turnOracleContext(game, perspective);
  const emergency =
    oracle.opportunity.opponentCanWinImmediately ||
    oracle.opportunity.delta.drainerSafety < 0;
  const used = new Set(usedActions.map(actionIdentity));
  const candidates = discoverTurnOpportunities(
    game,
    perspective,
    config,
    Math.max(Math.max(config.ownSeedCap, config.perNodeFamilyCap * 3), 8),
    macroFollowupFamilies(head, goal),
  ).filter((opportunity) => !used.has(actionIdentity(opportunity.action)));
  candidates.sort((left, right) => {
    const scoreOrder = compareNumber(
      opportunityScore(right, emergency) +
        macroFollowupFamilyBonus(head, goal, right.family),
      opportunityScore(left, emergency) +
        macroFollowupFamilyBonus(head, goal, left.family),
    );
    return scoreOrder !== 0
      ? scoreOrder
      : compareActionKeys(left.action, right.action);
  });
  return candidates.slice(
    0,
    Math.max(Math.max(config.perNodeFamilyCap, 1) * 2, 4),
  );
}

function progressStepGain(
  before: number | undefined,
  after: number | undefined,
): number {
  const unknown = BOARD_SIZE * 3;
  return Math.max((before ?? unknown) - (after ?? unknown), 0);
}

function macroOpportunityDelta(
  game: MonsGame,
  endGame: MonsGame,
  perspective: Color,
  startOracle: TurnOracleContext,
): OpportunityDelta {
  if (checkpoint()) return emptyOpportunityDelta();
  const endOracle = turnOracleContext(endGame, perspective);
  if (cancelled()) return emptyOpportunityDelta();
  return {
    sameTurnScoreWindowGain: Math.max(
      endOracle.strategic.immediateWindow.bestScore -
        startOracle.strategic.immediateWindow.bestScore,
      0,
    ),
    spiritGain: Math.max(
      endOracle.strategic.spirit.nextTurnSetupGain -
        startOracle.strategic.spirit.nextTurnSetupGain,
      endOracle.strategic.spirit.utility - startOracle.strategic.spirit.utility,
      0,
    ),
    opponentWindowDenyGain: Math.max(
      startOracle.opponentImmediateWindow - endOracle.opponentImmediateWindow,
      0,
    ),
    drainerAttack: endOracle.opportunity.delta.drainerAttackAvailable,
    drainerSafetyDelta:
      ownDrainerSafetyScore(endGame.board, perspective) -
      ownDrainerSafetyScore(game.board, perspective),
    supermanaProgressGain: progressStepGain(
      startOracle.opportunity.delta.safeSupermanaProgressSteps,
      endOracle.opportunity.delta.safeSupermanaProgressSteps,
    ),
    opponentManaProgressGain: progressStepGain(
      startOracle.opportunity.delta.safeOpponentManaProgressSteps,
      endOracle.opportunity.delta.safeOpponentManaProgressSteps,
    ),
  };
}

function emptyOpportunityDelta(): OpportunityDelta {
  return {
    sameTurnScoreWindowGain: 0,
    spiritGain: 0,
    opponentWindowDenyGain: 0,
    drainerAttack: false,
    drainerSafetyDelta: 0,
    supermanaProgressGain: 0,
    opponentManaProgressGain: 0,
  };
}

function macroPriorityFromState(
  root: MonsGame,
  endGame: MonsGame,
  perspective: Color,
  family: TurnPlanFamily,
  chunkCount: number,
  priorityHint: number,
  config: TurnEngineConfig,
): number {
  return saturatingAddI32(
    priorityHint,
    Math.max(
      I32_MIN,
      Math.min(
        I32_MAX,
        Math.trunc(
          quickOrderScore(
            root,
            endGame,
            perspective,
            family,
            chunkCount,
            config,
          ) / 1_024,
        ),
      ),
    ),
  );
}

function macroSignatureMix(hash: Hash64, value: Hash64): Hash64 {
  return hash64RotateLeft(hash64Mul(hash64Xor(hash, value), FNV_PRIME), 11);
}

function macroSignatureForActions(actions: readonly TurnAction[]): Hash64 {
  let hash = FNV_OFFSET_BASIS;
  for (const action of actions) {
    const [tag, first, second, third] = actionKeyTuple(action);
    hash = macroSignatureMix(hash, hash64FromU32(tag));
    hash = macroSignatureMix(hash, hash64FromU32(locationIndex(first)));
    hash = macroSignatureMix(
      hash,
      second === undefined ? U64_MASK : hash64FromU32(locationIndex(second)),
    );
    hash = macroSignatureMix(
      hash,
      third === undefined
        ? U64_MASK_MINUS_ONE
        : hash64FromU32(locationIndex(third)),
    );
  }
  return hash;
}

function macroPlanSignature(
  previous: Hash64,
  opportunity: MacroOpportunity,
): Hash64 {
  return macroSignatureMix(
    macroSignatureMix(previous, opportunity.endSnapshot.stateHash),
    opportunity.signature,
  );
}

function buildMacroFromHeadOpportunity(
  root: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  opportunity: TurnOpportunity,
): MacroOpportunity | undefined {
  if (checkpoint()) return undefined;
  const startOracle = turnOracleContext(root, perspective);
  if (cancelled()) return undefined;
  const first = compileAction(root, perspective, opportunity.action, config);
  if (first === undefined || checkpoint()) return undefined;
  let current = first[0];
  const headUtility = evaluateStateUtility(current, root, perspective, config);
  if (cancelled()) return undefined;
  const actions: TurnAction[] = [opportunity.action];
  const compiledChunks: Input[][] = [first[1]];
  let goalFamily = opportunity.family;
  const visitedStates = new Hash64Set(LOCAL_HASH_COLLECTION_CAPACITY);
  visitedStates.add(exactSearchStateHash(root));
  visitedStates.add(exactSearchStateHash(current));

  while (
    current.activeColor === perspective &&
    current.winnerColor() === undefined &&
    compiledChunks.length < bundleChunkCapForConfig(config)
  ) {
    if (checkpoint()) return undefined;
    const currentOracle = turnOracleContext(current, perspective);
    if (cancelled()) return undefined;
    const currentUtility = evaluateStateUtility(
      current,
      root,
      perspective,
      config,
    );
    if (cancelled()) return undefined;
    const riskyTemporaryState =
      currentOracle.opportunity.delta.drainerSafety < 0 ||
      currentUtility.drainerSafety < 0 ||
      ownDrainerSafetyScore(current.board, perspective) < 0;
    let best:
      | {
          readonly score: number;
          readonly opportunity: TurnOpportunity;
          readonly after: MonsGame;
          readonly chunk: Input[];
          readonly goalFamily: TurnPlanFamily;
        }
      | undefined;

    for (const followup of macroFollowupSeedCandidates(
      current,
      perspective,
      config,
      opportunity.family,
      goalFamily,
      actions,
    )) {
      if (checkpoint()) return undefined;
      const compiled = compileAction(
        current,
        perspective,
        followup.action,
        config,
      );
      if (compiled === undefined || checkpoint()) continue;
      const [after, chunk] = compiled;
      const afterHash = exactSearchStateHash(after);
      if (visitedStates.has(afterHash)) continue;
      const delta = macroOpportunityDelta(
        current,
        after,
        perspective,
        currentOracle,
      );
      const nextGoalFamily = mergePlanFamily(goalFamily, followup.family);
      const nextUtility = evaluateStateUtility(
        after,
        root,
        perspective,
        config,
      );
      if (cancelled()) return undefined;
      const improvementSignal =
        delta.sameTurnScoreWindowGain +
        delta.spiritGain +
        delta.opponentWindowDenyGain +
        Math.max(delta.drainerSafetyDelta, 0) +
        delta.supermanaProgressGain +
        delta.opponentManaProgressGain +
        (delta.drainerAttack ? 2 : 0);
      const temporaryRecoveryFollowup =
        riskyTemporaryState &&
        (followup.family === TurnPlanFamily.DrainerSafetyRecovery ||
          followup.family === TurnPlanFamily.ImmediateScore ||
          followup.family === TurnPlanFamily.SafeSupermanaProgress ||
          followup.family === TurnPlanFamily.SafeOpponentManaProgress);
      if (
        improvementSignal <= 0 &&
        compareTurnEngineUtilities(nextUtility, currentUtility) <= 0 &&
        after.activeColor === perspective &&
        !temporaryRecoveryFollowup
      ) {
        continue;
      }
      const riskyBonus = riskyTemporaryState
        ? (() => {
            switch (followup.family) {
              case TurnPlanFamily.DrainerSafetyRecovery:
                return 960;
              case TurnPlanFamily.ImmediateScore:
                return 820;
              case TurnPlanFamily.SafeSupermanaProgress:
              case TurnPlanFamily.SafeOpponentManaProgress:
                return 360;
              case TurnPlanFamily.DenyOpponentWindow:
              case TurnPlanFamily.DrainerKill:
                return 220;
              case TurnPlanFamily.SpiritImpact:
              case TurnPlanFamily.ManaTempo:
                return 0;
            }
          })()
        : 0;
      const score =
        macroPriorityFromState(
          root,
          after,
          perspective,
          nextGoalFamily,
          compiledChunks.length + 1,
          followup.priority +
            macroFollowupFamilyBonus(
              opportunity.family,
              goalFamily,
              followup.family,
            ),
          config,
        ) +
        riskyBonus +
        delta.sameTurnScoreWindowGain * 280 +
        delta.spiritGain * 220 +
        delta.opponentWindowDenyGain * 240 +
        Math.max(delta.drainerSafetyDelta, 0) * 200 +
        delta.supermanaProgressGain * 120 +
        delta.opponentManaProgressGain * 112 +
        (delta.drainerAttack ? 820 : 0);
      if (
        best === undefined ||
        score > best.score ||
        (score === best.score &&
          familyRank(nextGoalFamily) < familyRank(best.goalFamily))
      ) {
        best = {
          score,
          opportunity: followup,
          after,
          chunk,
          goalFamily: nextGoalFamily,
        };
      }
    }
    if (best === undefined) break;
    actions.push(best.opportunity.action);
    compiledChunks.push(best.chunk);
    goalFamily = best.goalFamily;
    current = best.after;
    visitedStates.add(exactSearchStateHash(current));
  }

  if (checkpoint()) return undefined;
  const endSnapshot = turnSnapshotFromGame(current);
  const delta = macroOpportunityDelta(root, current, perspective, startOracle);
  if (cancelled()) return undefined;
  return {
    headFamily: opportunity.family,
    goalFamily,
    priority: macroPriorityFromState(
      root,
      current,
      perspective,
      goalFamily,
      compiledChunks.length,
      opportunity.priority,
      config,
    ),
    delta,
    actions,
    compiledChunks,
    endGame: current.cloneForSimulation(),
    endSnapshot,
    headUtility,
    signature: macroSignatureForActions(actions),
  };
}

function discoverMacroOpportunities(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  opportunityCap: number,
  allowedFamilies?: readonly TurnPlanFamily[],
): MacroOpportunity[] {
  if (checkpoint()) return [];
  const macros: MacroOpportunity[] = [];
  const seen = new Hash64Set(LOCAL_HASH_COLLECTION_CAPACITY);
  const opportunities = discoverTurnOpportunities(
    game,
    perspective,
    config,
    Math.max(Math.max(opportunityCap, config.perNodeFamilyCap * 3), 8),
    allowedFamilies,
  );
  if (checkpoint()) return [];
  for (const opportunity of opportunities) {
    if (checkpoint()) return [];
    const bundle = buildMacroFromHeadOpportunity(
      game,
      perspective,
      config,
      opportunity,
    );
    if (bundle === undefined) {
      if (cancelled()) return [];
      continue;
    }
    if (seen.has(bundle.endSnapshot.stateHash, 0, bundle.signature)) continue;
    seen.add(bundle.endSnapshot.stateHash, 0, bundle.signature);
    macros.push(bundle);
    if (macros.length >= Math.max(opportunityCap, 1)) break;
  }
  macros.sort((left, right) => {
    const score = (value: MacroOpportunity): number =>
      value.priority +
      value.delta.sameTurnScoreWindowGain * 280 +
      value.delta.spiritGain * 220 +
      value.delta.opponentWindowDenyGain * 240 +
      value.delta.drainerSafetyDelta * 220 +
      value.delta.supermanaProgressGain * 120 +
      value.delta.opponentManaProgressGain * 112 +
      (value.delta.drainerAttack ? 820 : 0) +
      (bundleChunkCapForConfig(config) - value.compiledChunks.length) * 8;
    const order = compareNumber(score(right), score(left));
    if (order !== 0) return order;
    const familyOrder = compareNumber(
      familyRank(left.goalFamily),
      familyRank(right.goalFamily),
    );
    return familyOrder !== 0
      ? familyOrder
      : compareChunks(left.compiledChunks, right.compiledChunks);
  });
  return checkpoint() ? [] : macros.slice(0, Math.max(opportunityCap, 1));
}

function macroNodeToPlan(
  root: MonsGame,
  node: MacroPlanNode,
  perspective: Color,
  config: TurnEngineConfig,
): TurnPlan {
  return {
    actions: node.actions,
    compiledChunks: node.compiledChunks,
    endGame: node.game.cloneForSimulation(),
    utility: evaluateStateUtility(node.game, root, perspective, config),
    headUtility: node.headUtility,
    headFamily: node.headFamily,
    goalFamily: node.goalFamily,
    packageMeta: EMPTY_PACKAGE_META,
  };
}

function generateMacroPlans(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  opportunityCap: number,
  beamWidth: number,
  bundleCap: number,
  expansionCap: number,
): PlanGenerationResult {
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  let expansions = 0;
  let budgetExhausted = false;
  const cap = Math.min(Math.max(bundleCap, 1), bundlePlanCapForConfig(config));
  const opportunities = discoverMacroOpportunities(
    game,
    perspective,
    config,
    opportunityCap,
  );
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  if (opportunities.length === 0) return { status: PlanBuildStatus.NoPlan };
  const seen = new Hash64Table<number>(LOCAL_HASH_COLLECTION_CAPACITY);
  let frontier: { readonly order: number; readonly node: MacroPlanNode }[] = [];
  for (const opportunity of opportunities) {
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    expansions += 1;
    if (expansions > expansionCap) {
      budgetExhausted = true;
      break;
    }
    const order = quickOrderScore(
      game,
      opportunity.endGame,
      perspective,
      opportunity.goalFamily,
      opportunity.compiledChunks.length,
      config,
    );
    if (cancelled()) return { status: PlanBuildStatus.BudgetExceeded };
    const existing = seen.get(
      opportunity.endSnapshot.stateHash,
      0,
      opportunity.signature,
    );
    if (existing !== undefined && order <= existing) continue;
    seen.set(
      opportunity.endSnapshot.stateHash,
      order,
      0,
      opportunity.signature,
    );
    frontier.push({
      order,
      node: {
        game: opportunity.endGame,
        actions: opportunity.actions,
        compiledChunks: opportunity.compiledChunks,
        headUtility: opportunity.headUtility,
        headFamily: opportunity.headFamily,
        goalFamily: opportunity.goalFamily,
        signature: opportunity.signature,
      },
    });
  }
  if (frontier.length === 0) {
    return {
      status: budgetExhausted
        ? PlanBuildStatus.BudgetExceeded
        : PlanBuildStatus.NoPlan,
    };
  }
  frontier.sort(compareOrderedMacroNodes);
  frontier = frontier.slice(0, Math.max(beamWidth, 1));
  const terminal: MacroPlanNode[] = [];

  for (let round = 1; round < cap; round += 1) {
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    const candidates: {
      readonly order: number;
      readonly node: MacroPlanNode;
    }[] = [];
    let expandedAny = false;
    let stopExpansion = false;
    for (const current of frontier) {
      const node = current.node;
      if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
      if (
        node.game.winnerColor() !== undefined ||
        node.game.activeColor !== perspective
      ) {
        terminal.push(node);
        continue;
      }
      const followups = discoverMacroOpportunities(
        node.game,
        perspective,
        config,
        opportunityCap,
        macroFollowupFamilies(node.headFamily, node.goalFamily),
      );
      if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
      if (followups.length === 0) {
        terminal.push(node);
        continue;
      }
      let nodeExpanded = false;
      for (const opportunity of followups) {
        if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
        expansions += 1;
        if (expansions > expansionCap) {
          terminal.push(node);
          budgetExhausted = true;
          stopExpansion = true;
          break;
        }
        const actions = [...node.actions, ...opportunity.actions];
        const chunks = [...node.compiledChunks, ...opportunity.compiledChunks];
        const goalFamily = mergePlanFamily(
          node.goalFamily,
          opportunity.goalFamily,
        );
        const signature = macroPlanSignature(node.signature, opportunity);
        const order = quickOrderScore(
          game,
          opportunity.endGame,
          perspective,
          goalFamily,
          chunks.length,
          config,
        );
        if (cancelled()) return { status: PlanBuildStatus.BudgetExceeded };
        const existing = seen.get(
          opportunity.endSnapshot.stateHash,
          0,
          signature,
        );
        if (existing !== undefined && order <= existing) continue;
        seen.set(opportunity.endSnapshot.stateHash, order, 0, signature);
        candidates.push({
          order,
          node: {
            game: opportunity.endGame,
            actions,
            compiledChunks: chunks,
            headUtility: node.headUtility,
            headFamily: node.headFamily,
            goalFamily,
            signature,
          },
        });
        expandedAny = true;
        nodeExpanded = true;
      }
      if (stopExpansion) break;
      if (!nodeExpanded) terminal.push(node);
    }
    if (stopExpansion) {
      candidates.sort(compareOrderedMacroNodes);
      frontier = candidates.slice(0, Math.max(beamWidth, 1));
      break;
    }
    if (!expandedAny || candidates.length === 0) {
      frontier = [];
      break;
    }
    candidates.sort(compareOrderedMacroNodes);
    frontier = candidates.slice(0, Math.max(beamWidth, 1));
  }
  terminal.push(...frontier.map(({ node }) => node));
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  if (terminal.length === 0) {
    return {
      status: budgetExhausted
        ? PlanBuildStatus.BudgetExceeded
        : PlanBuildStatus.NoPlan,
    };
  }
  const plans = terminal.map((node) =>
    macroNodeToPlan(game, node, perspective, config),
  );
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  plans.sort((left, right) => -turnEngineComparePlans(left, right));
  return { status: "ok", plans };
}

function compareOrderedMacroNodes(
  left: { readonly order: number; readonly node: MacroPlanNode },
  right: { readonly order: number; readonly node: MacroPlanNode },
): number {
  const order = compareNumber(right.order, left.order);
  return order !== 0
    ? order
    : compareChunks(left.node.compiledChunks, right.node.compiledChunks);
}

function generateTurnPlans(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  seedCap: number,
  beamWidth: number,
  stepCap: number,
  expansionCap: number,
): PlanGenerationResult {
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  let expansions = 0;
  const seeds = generateActionSeeds(game, perspective, config, seedCap);
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  if (seeds.length === 0) return { status: PlanBuildStatus.NoPlan };
  const compilePool = new TransitionCompilePool(game, seeds, config);
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  const seen = new Hash64Table<number>(LOCAL_HASH_COLLECTION_CAPACITY);
  let frontier: { readonly order: number; readonly node: PlanNode }[] = [];

  for (const seed of seeds) {
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    const compiled = compileActionFromPool(
      game,
      perspective,
      seed.action,
      compilePool,
    );
    if (compiled === undefined) continue;
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    expansions += 1;
    if (expansions > expansionCap) {
      return { status: PlanBuildStatus.BudgetExceeded };
    }
    const [after, chunk] = compiled;
    const order = quickOrderScore(
      game,
      after,
      perspective,
      seed.family,
      1,
      config,
    );
    const hash = exactSearchStateHash(after);
    const existing = seen.get(hash);
    if (existing !== undefined && order <= existing) continue;
    seen.set(hash, order);
    const headUtility = evaluateStateUtility(after, game, perspective, config);
    if (cancelled()) return { status: PlanBuildStatus.BudgetExceeded };
    frontier.push({
      order,
      node: {
        game: after,
        actions: [seed.action],
        compiledChunks: [chunk],
        headUtility,
        headFamily: seed.family,
        goalFamily: seed.family,
      },
    });
  }
  if (frontier.length === 0) return { status: PlanBuildStatus.NoPlan };
  frontier.sort(compareOrderedNodes);
  frontier = frontier.slice(0, Math.max(beamWidth, 1));
  const terminal: PlanNode[] = [];

  for (let step = 1; step < Math.max(stepCap, 1); step += 1) {
    if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
    const candidates: { readonly order: number; readonly node: PlanNode }[] =
      [];
    let expandedAny = false;
    for (const current of frontier) {
      const node = current.node;
      if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
      if (
        node.game.winnerColor() !== undefined ||
        node.game.activeColor !== perspective
      ) {
        terminal.push(node);
        continue;
      }
      const nextSeeds = generateActionSeeds(
        node.game,
        perspective,
        config,
        seedCap,
      );
      if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
      if (nextSeeds.length === 0) {
        terminal.push(node);
        continue;
      }
      const nextPool = new TransitionCompilePool(node.game, nextSeeds, config);
      if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
      let nodeExpanded = false;
      for (const seed of nextSeeds) {
        if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
        const compiled = compileActionFromPool(
          node.game,
          perspective,
          seed.action,
          nextPool,
        );
        if (compiled === undefined) continue;
        if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
        expansions += 1;
        if (expansions > expansionCap) {
          return { status: PlanBuildStatus.BudgetExceeded };
        }
        const [after, chunk] = compiled;
        const actions = [...node.actions, seed.action];
        const chunks = [...node.compiledChunks, chunk];
        const order = quickOrderScore(
          game,
          after,
          perspective,
          node.goalFamily,
          actions.length,
          config,
        );
        if (cancelled()) return { status: PlanBuildStatus.BudgetExceeded };
        const hash = exactSearchStateHash(after);
        const existing = seen.get(hash);
        if (existing !== undefined && order <= existing) continue;
        seen.set(hash, order);
        candidates.push({
          order,
          node: {
            game: after,
            actions,
            compiledChunks: chunks,
            headUtility: node.headUtility,
            headFamily: node.headFamily,
            goalFamily: node.goalFamily,
          },
        });
        expandedAny = true;
        nodeExpanded = true;
      }
      if (!nodeExpanded) terminal.push(node);
    }
    if (!expandedAny || candidates.length === 0) {
      frontier = [];
      break;
    }
    candidates.sort(compareOrderedNodes);
    frontier = candidates.slice(0, Math.max(beamWidth, 1));
  }

  terminal.push(...frontier.map(({ node }) => node));
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  if (terminal.length === 0) return { status: PlanBuildStatus.NoPlan };
  const plans = terminal.map<TurnPlan>((node) => ({
    actions: node.actions.map(cloneAction),
    compiledChunks: node.compiledChunks.map((chunk) => chunk.map(cloneInput)),
    endGame: node.game.cloneForSimulation(),
    utility: evaluateStateUtility(node.game, game, perspective, config),
    headUtility: node.headUtility,
    headFamily: node.headFamily,
    goalFamily: node.goalFamily,
    packageMeta: EMPTY_PACKAGE_META,
  }));
  if (checkpoint()) return { status: PlanBuildStatus.BudgetExceeded };
  plans.sort((left, right) => -turnEngineComparePlans(left, right));
  return { status: "ok", plans };
}

function compareOrderedNodes(
  left: { readonly order: number; readonly node: PlanNode },
  right: { readonly order: number; readonly node: PlanNode },
): number {
  const order = compareNumber(right.order, left.order);
  return order !== 0
    ? order
    : compareChunks(left.node.compiledChunks, right.node.compiledChunks);
}

function fallbackSingleActionPlan(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): TurnPlan | undefined {
  if (checkpoint()) return undefined;
  let seeds = generateActionSeeds(
    game,
    perspective,
    config,
    Math.min(Math.max(config.ownSeedCap, 1) * 2, TURN_ENGINE_COMPILE_LIMIT_MAX),
  );
  if (checkpoint()) return undefined;
  if (seeds.length === 0) seeds = fallbackWalkSeeds(game, perspective);
  if (seeds.length === 0 || checkpoint()) return undefined;
  const pool = new TransitionCompilePool(game, seeds, config);
  let best: TurnPlan | undefined;
  for (const seed of seeds) {
    if (checkpoint()) return undefined;
    const compiled = compileActionFromPool(
      game,
      perspective,
      seed.action,
      pool,
    );
    if (compiled === undefined) continue;
    if (checkpoint()) return undefined;
    const [after, chunk] = compiled;
    const stateUtility = evaluateStateUtility(after, game, perspective, config);
    const plan: TurnPlan = {
      actions: [cloneAction(seed.action)],
      compiledChunks: [chunk.map(cloneInput)],
      endGame: after.cloneForSimulation(),
      utility: stateUtility,
      headUtility: stateUtility,
      headFamily: seed.family,
      goalFamily: seed.family,
      packageMeta: EMPTY_PACKAGE_META,
    };
    if (cancelled()) return undefined;
    plan.utility = evaluatePlanWithReplies(game, plan, perspective, config);
    if (cancelled()) return undefined;
    if (best === undefined || turnEngineComparePlans(plan, best) > 0) {
      best = plan;
    }
  }
  return checkpoint() ? undefined : best;
}

function fallbackSingleActionPlanFromAllowedHeads(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  allowedFirstSteps: readonly (readonly Input[])[],
): TurnPlan | undefined {
  if (checkpoint()) return undefined;
  let seeds = generateActionSeeds(
    game,
    perspective,
    config,
    Math.min(Math.max(config.ownSeedCap, 1) * 2, TURN_ENGINE_COMPILE_LIMIT_MAX),
  );
  if (checkpoint()) return undefined;
  if (seeds.length === 0) seeds = fallbackWalkSeeds(game, perspective);
  if (checkpoint() || seeds.length === 0) return undefined;

  const ranks = allowedRankMap(allowedFirstSteps);
  const pool = new TransitionCompilePool(game, seeds, config);
  if (checkpoint()) return undefined;
  let best: { plan: TurnPlan; meta: AllowedHeadSelectionMeta } | undefined;
  for (const seed of seeds) {
    if (checkpoint()) return undefined;
    const compiled = compileActionFromPool(
      game,
      perspective,
      seed.action,
      pool,
    );
    if (compiled === undefined) continue;
    if (checkpoint()) return undefined;
    const [after, chunk] = compiled;
    const rank = ranks.get(inputChainKey(chunk));
    if (rank === undefined) continue;

    const stateUtility = evaluateStateUtility(after, game, perspective, config);
    const plan: TurnPlan = {
      actions: [cloneAction(seed.action)],
      compiledChunks: [chunk.map(cloneInput)],
      endGame: after.cloneForSimulation(),
      utility: stateUtility,
      headUtility: stateUtility,
      headFamily: seed.family,
      goalFamily: seed.family,
      packageMeta: EMPTY_PACKAGE_META,
    };
    if (cancelled()) return undefined;
    plan.utility = evaluatePlanWithReplies(game, plan, perspective, config);
    if (cancelled()) return undefined;
    const meta: AllowedHeadSelectionMeta = {
      rank,
      allowedLength: allowedFirstSteps.length,
      firstStepOpponentImmediateLoss: opponentCanWinImmediately(
        after,
        perspective,
      ),
      firstStepDrainerSafety: ownDrainerSafetyScore(after.board, perspective),
    };
    if (
      best === undefined ||
      compareAllowedHeadPlans(plan, meta, best.plan, best.meta) > 0
    ) {
      best = { plan, meta };
    }
  }

  return checkpoint() ? undefined : best?.plan;
}

function replyShortlistLength(total: number, beam: number): number {
  return Math.min(total, Math.min(Math.max(Math.max(beam, 0) * 2, 4), 8));
}

function evaluatePlanWithReplies(
  root: MonsGame,
  plan: TurnPlan,
  perspective: Color,
  config: TurnEngineConfig,
): TurnEngineUtility {
  if (checkpoint()) return new TurnEngineUtility();
  const after = plan.endGame;
  const opponent = otherColor(perspective);
  if (after.winnerColor() !== undefined || after.activeColor !== opponent) {
    return evaluateStateUtility(after, root, perspective, config);
  }

  const opponentConfig: TurnEngineConfig = {
    ...config,
    ownSeedCap: Math.max(config.opponentSeedCap, 1),
    ownBeam: Math.max(config.opponentBeam, 1),
    perNodeFamilyCap: Math.max(config.perNodeFamilyCap, 1),
    stepCap: Math.min(Math.max(config.stepCap, 1), 4),
    opponentSeedCap: Math.max(config.replySeedCap, 1),
    opponentBeam: Math.max(config.replyBeam, 1),
    replySeedCap: 0,
    replyBeam: 0,
    expansionCap: Math.max(Math.trunc(config.expansionCap / 2), 24),
  };
  const opponentResult = generatePlansForMode(
    after,
    opponent,
    opponentConfig,
    opponentConfig.ownSeedCap,
    opponentConfig.ownBeam,
    opponentConfig.stepCap,
    opponentConfig.expansionCap,
  );
  if (checkpoint()) return new TurnEngineUtility();
  if (opponentResult.status !== "ok")
    return evaluateStateUtility(after, root, perspective, config);
  const opponentPlans = opponentResult.plans;

  const shortlist = replyShortlistLength(
    opponentPlans.length,
    opponentConfig.ownBeam,
  );
  let bestOpponent = opponentPlans[0];
  if (bestOpponent === undefined)
    return evaluateStateUtility(after, root, perspective, config);
  let bestOpponentUtility = evaluateStateUtility(
    bestOpponent.endGame,
    after,
    opponent,
    opponentConfig,
  );
  for (const opponentPlan of opponentPlans.slice(1, shortlist)) {
    if (checkpoint()) return new TurnEngineUtility();
    const utility = evaluateStateUtility(
      opponentPlan.endGame,
      after,
      opponent,
      opponentConfig,
    );
    const utilityOrder = compareTurnEngineUtilities(
      utility,
      bestOpponentUtility,
    );
    if (
      utilityOrder > 0 ||
      (utilityOrder === 0 &&
        compareChunks(
          opponentPlan.compiledChunks,
          bestOpponent.compiledChunks,
        ) < 0)
    ) {
      bestOpponent = opponentPlan;
      bestOpponentUtility = utility;
    }
  }

  const afterOpponent = bestOpponent.endGame;
  if (
    afterOpponent.winnerColor() !== undefined ||
    afterOpponent.activeColor !== perspective ||
    config.replySeedCap === 0
  ) {
    return evaluateStateUtility(afterOpponent, root, perspective, config);
  }

  const replyConfig: TurnEngineConfig = {
    ...config,
    ownSeedCap: Math.max(config.replySeedCap, 1),
    ownBeam: Math.max(config.replyBeam, 1),
    perNodeFamilyCap: Math.max(config.perNodeFamilyCap, 1),
    stepCap: Math.min(Math.max(config.stepCap, 1), 3),
    opponentSeedCap: 0,
    opponentBeam: 0,
    replySeedCap: 0,
    replyBeam: 0,
    expansionCap: Math.max(Math.trunc(config.expansionCap / 3), 16),
  };
  const replyResult = generatePlansForMode(
    afterOpponent,
    perspective,
    replyConfig,
    replyConfig.ownSeedCap,
    replyConfig.ownBeam,
    replyConfig.stepCap,
    replyConfig.expansionCap,
  );
  if (checkpoint()) return new TurnEngineUtility();
  if (replyResult.status !== "ok") {
    return evaluateStateUtility(afterOpponent, root, perspective, config);
  }
  const replyPlans = replyResult.plans;
  let bestReply: TurnEngineUtility | undefined;
  for (const reply of replyPlans.slice(
    0,
    replyShortlistLength(replyPlans.length, replyConfig.ownBeam),
  )) {
    const utility = evaluateStateUtility(
      reply.endGame,
      root,
      perspective,
      config,
    );
    if (
      bestReply === undefined ||
      compareTurnEngineUtilities(utility, bestReply) > 0
    ) {
      bestReply = utility;
    }
  }
  return (
    bestReply ?? evaluateStateUtility(afterOpponent, root, perspective, config)
  );
}

class TransitionCompilePool {
  public transitions: LegalInputTransition[];
  public limit: number;
  public readonly priorityLocations: readonly Location[];

  public constructor(
    game: MonsGame,
    seeds: readonly ActionSeed[],
    config: TurnEngineConfig,
  ) {
    this.limit = compileLimitForConfig(config);
    if (checkpoint()) {
      this.transitions = [];
      this.priorityLocations = [];
      return;
    }
    const seen = new Set<number>();
    const priorityLocations: Location[] = [];
    for (const seed of seeds) {
      for (const at of actionPriorityLocations(seed.action)) {
        const key = locationIndex(at);
        if (!seen.has(key)) {
          seen.add(key);
          priorityLocations.push(at);
        }
      }
    }
    this.priorityLocations = priorityLocations;
    this.transitions = enumerateLegalTransitionsWithPriority(
      game,
      this.limit,
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
      priorityLocations,
    );
    if (checkpoint()) this.transitions = [];
  }

  public expand(game: MonsGame): boolean {
    if (
      checkpoint() ||
      this.transitions.length < this.limit ||
      this.limit >= TURN_ENGINE_COMPILE_LIMIT_MAX
    ) {
      return false;
    }
    const nextLimit = Math.min(this.limit * 2, TURN_ENGINE_COMPILE_LIMIT_MAX);
    if (nextLimit <= this.limit) return false;
    const transitions = enumerateLegalTransitionsWithPriority(
      game,
      nextLimit,
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
      this.priorityLocations,
    );
    if (checkpoint()) return false;
    this.transitions = transitions;
    this.limit = nextLimit;
    return true;
  }
}

function compileLimitForConfig(config: TurnEngineConfig): number {
  return Math.min(
    Math.max(Math.max(config.ownSeedCap, config.opponentSeedCap) * 12, 24),
    96,
  );
}

function directInputsForAction(action: TurnAction): Input[] {
  switch (action.kind) {
    case "walk":
    case "safety-retreat":
      return [
        { kind: "location", location: { ...action.actor } },
        { kind: "location", location: { ...action.to } },
      ];
    case "attack":
    case "bomb":
      return [
        { kind: "location", location: { ...action.actor } },
        { kind: "location", location: { ...action.target } },
      ];
    case "spirit-shift":
      return [
        { kind: "location", location: { ...action.actor } },
        { kind: "location", location: { ...action.target } },
        { kind: "location", location: { ...action.destination } },
      ];
    case "move-mana":
      return [
        { kind: "location", location: { ...action.from } },
        { kind: "location", location: { ...action.to } },
      ];
    case "score-carry":
      return [
        { kind: "location", location: { ...action.actor } },
        { kind: "location", location: { ...action.step } },
      ];
  }
}

function compileActionDirect(
  game: MonsGame,
  perspective: Color,
  action: TurnAction,
): readonly [MonsGame, Input[]] | undefined {
  if (checkpoint()) return undefined;
  const inputs = directInputsForAction(action);
  const result = applyInputsForSearchWithEvents(game, inputs);
  if (result === undefined || checkpoint()) return undefined;
  if (
    !transitionMatchesAction(
      game,
      result.game,
      result.events,
      perspective,
      action,
    )
  ) {
    return undefined;
  }
  return [result.game, inputs];
}

function bestTransitionForAction(
  game: MonsGame,
  perspective: Color,
  action: TurnAction,
  transitions: readonly LegalInputTransition[],
): readonly [number, number] | undefined {
  if (checkpoint()) return undefined;
  let best: readonly [number, number] | undefined;
  for (let index = 0; index < transitions.length; index += 1) {
    if (checkpoint()) return undefined;
    const transition = transitions[index];
    if (
      transition === undefined ||
      !transitionMatchesAction(
        game,
        transition.game,
        transition.events,
        perspective,
        action,
      )
    ) {
      continue;
    }
    const score = transitionScore(
      game,
      transition.game,
      transition.events,
      perspective,
      action,
    );
    const bestTransition =
      best === undefined ? undefined : transitions[best[1]];
    if (
      best === undefined ||
      score > best[0] ||
      (score === best[0] &&
        bestTransition !== undefined &&
        compareInputChains(transition.inputs, bestTransition.inputs) < 0)
    ) {
      best = [score, index];
    }
  }
  return best;
}

function compileActionFromPoolFallback(
  game: MonsGame,
  perspective: Color,
  action: TurnAction,
  pool: TransitionCompilePool,
): readonly [MonsGame, Input[]] | undefined {
  let best = bestTransitionForAction(
    game,
    perspective,
    action,
    pool.transitions,
  );
  if (best === undefined && pool.expand(game)) {
    best = bestTransitionForAction(game, perspective, action, pool.transitions);
  }
  if (best === undefined || checkpoint()) return undefined;
  const transition = pool.transitions[best[1]];
  return transition === undefined
    ? undefined
    : [transition.game.cloneForSimulation(), transition.inputs.map(cloneInput)];
}

function compileActionFromPool(
  game: MonsGame,
  perspective: Color,
  action: TurnAction,
  pool: TransitionCompilePool,
): readonly [MonsGame, Input[]] | undefined {
  const direct = compileActionDirect(game, perspective, action);
  if (direct !== undefined) return direct;
  return cancelled()
    ? undefined
    : compileActionFromPoolFallback(game, perspective, action, pool);
}

function compileAction(
  game: MonsGame,
  perspective: Color,
  action: TurnAction,
  config: TurnEngineConfig,
): readonly [MonsGame, Input[]] | undefined {
  const direct = compileActionDirect(game, perspective, action);
  if (direct !== undefined) return direct;
  if (cancelled()) return undefined;
  const pool = new TransitionCompilePool(
    game,
    [{ family: TurnPlanFamily.ManaTempo, action, priority: 0 }],
    config,
  );
  return compileActionFromPoolFallback(game, perspective, action, pool);
}

function actionPriorityLocations(action: TurnAction): readonly Location[] {
  switch (action.kind) {
    case "walk":
    case "safety-retreat":
      return [action.actor, action.to];
    case "attack":
    case "bomb":
      return [action.actor, action.target];
    case "spirit-shift":
      return [action.actor, action.target, action.destination];
    case "move-mana":
      return [action.from, action.to];
    case "score-carry":
      return [action.actor, action.step];
  }
}

function movedActorTo(
  events: readonly Event[],
  actor: Location,
  to: Location,
): boolean {
  return events.some(
    (event) =>
      (event.kind === "mon-move" || event.kind === "demon-additional-step") &&
      locationEquals(event.from, actor) &&
      locationEquals(event.to, to),
  );
}

function attackEventsMatch(
  events: readonly Event[],
  actor: Location,
  target: Location,
  perspective: Color,
): boolean {
  return events.some((event) => {
    if (event.kind === "mystic-action" || event.kind === "demon-action") {
      return (
        locationEquals(event.from, actor) && locationEquals(event.to, target)
      );
    }
    return (
      event.kind === "mon-fainted" &&
      event.mon.color === otherColor(perspective) &&
      locationEquals(event.to, target)
    );
  });
}

function actorOrSuccessorCarries(
  after: MonsGame,
  perspective: Color,
  wanted: Mana,
): boolean {
  for (const [, item] of after.board.occupied()) {
    if (
      item.kind === "mon-with-mana" &&
      item.mon.color === perspective &&
      !isMonFainted(item.mon) &&
      manaEquals(item.mana, wanted)
    ) {
      return true;
    }
  }
  return false;
}

function transitionMatchesAction(
  before: MonsGame,
  after: MonsGame,
  events: readonly Event[],
  perspective: Color,
  action: TurnAction,
): boolean {
  switch (action.kind) {
    case "walk":
      return (
        movedActorTo(events, action.actor, action.to) &&
        !eventsIncludeNonWalkAction(events)
      );
    case "attack":
      return attackEventsMatch(
        events,
        action.actor,
        action.target,
        perspective,
      );
    case "spirit-shift":
      return events.some(
        (event) =>
          event.kind === "spirit-target-move" &&
          locationEquals(event.by, action.actor) &&
          locationEquals(event.from, action.target) &&
          locationEquals(event.to, action.destination),
      );
    case "bomb":
      return events.some(
        (event) =>
          event.kind === "bomb-attack" &&
          locationEquals(event.from, action.actor) &&
          locationEquals(event.to, action.target),
      );
    case "move-mana":
      return events.some(
        (event) =>
          event.kind === "mana-move" &&
          locationEquals(event.from, action.from) &&
          locationEquals(event.to, action.to),
      );
    case "score-carry":
      return (
        movedActorTo(events, action.actor, action.step) &&
        (events.some(
          (event) =>
            event.kind === "mana-scored" &&
            manaEquals(event.mana, action.wanted),
        ) ||
          actorOrSuccessorCarries(after, perspective, action.wanted))
      );
    case "safety-retreat":
      return (
        movedActorTo(events, action.actor, action.to) &&
        ownDrainerSafetyScore(after.board, perspective) >
          ownDrainerSafetyScore(before.board, perspective)
      );
  }
}

function transitionScore(
  before: MonsGame,
  after: MonsGame,
  events: readonly Event[],
  perspective: Color,
  action: TurnAction,
): number {
  let score = saturatingMulI32(
    saturatingSubI32(
      scoreForColor(after, perspective),
      scoreForColor(before, perspective),
    ),
    500,
  );
  score = saturatingAddI32(
    score,
    saturatingMulI32(ownDrainerSafetyScore(after.board, perspective), 180),
  );
  if (
    !opponentCanWinImmediately(before, perspective) &&
    opponentCanWinImmediately(after, perspective)
  ) {
    score = saturatingSubI32(score, 2_200);
  }
  switch (action.kind) {
    case "walk":
      score = saturatingAddI32(
        score,
        saturatingMulI32(locationDistance(action.actor, action.to), -20),
      );
      break;
    case "attack":
      if (eventsIncludeOpponentDrainerFaint(events, perspective))
        score = saturatingAddI32(score, 1_600);
      if (eventsIncludeAnyFaint(events, perspective))
        score = saturatingAddI32(score, 800);
      break;
    case "spirit-shift":
      if (events.some((event) => event.kind === "mana-scored"))
        score = saturatingAddI32(score, 1_000);
      if (events.some((event) => event.kind === "spirit-target-move"))
        score = saturatingAddI32(score, 600);
      break;
    case "bomb":
      if (eventsIncludeAnyFaint(events, perspective))
        score = saturatingAddI32(score, 1_000);
      break;
    case "move-mana":
      score = saturatingAddI32(
        score,
        saturatingMulI32(
          saturatingSubI32(
            distanceToNearestPool(action.from, perspective),
            distanceToNearestPool(action.to, perspective),
          ),
          160,
        ),
      );
      break;
    case "score-carry":
      score = saturatingAddI32(
        score,
        saturatingMulI32(manaScore(action.wanted, perspective), 200),
      );
      break;
    case "safety-retreat":
      score = saturatingAddI32(
        score,
        saturatingMulI32(ownDrainerSafetyScore(after.board, perspective), 260),
      );
      break;
  }
  return score;
}

function eventsIncludeNonWalkAction(events: readonly Event[]): boolean {
  return events.some(
    (event) =>
      event.kind === "mystic-action" ||
      event.kind === "demon-action" ||
      event.kind === "bomb-attack" ||
      event.kind === "spirit-target-move",
  );
}

function eventsIncludeAnyFaint(
  events: readonly Event[],
  perspective: Color,
): boolean {
  return events.some(
    (event) =>
      event.kind === "mon-fainted" &&
      event.mon.color === otherColor(perspective),
  );
}

function eventsIncludeOpponentDrainerFaint(
  events: readonly Event[],
  perspective: Color,
): boolean {
  return events.some(
    (event) =>
      event.kind === "mon-fainted" &&
      event.mon.color === otherColor(perspective) &&
      event.mon.kind === MonKind.Drainer,
  );
}

function actorCanAttackFromItem(item: Item): boolean {
  const mon = itemMon(item);
  return (
    mon !== undefined &&
    (mon.kind === MonKind.Mystic || mon.kind === MonKind.Demon)
  );
}

function actorCanBombFromItem(item: Item): boolean {
  const mon = itemMon(item);
  return (
    mon !== undefined &&
    !isMonFainted(mon) &&
    item.kind === "mon-with-consumable" &&
    item.consumable === Consumable.Bomb
  );
}

function locationGuardedByAngel(
  angelLocation: Location | undefined,
  at: Location,
): boolean {
  return (
    angelLocation !== undefined && locationDistance(angelLocation, at) === 1
  );
}

function demonAttackPathClear(
  board: Board,
  from: Location,
  target: Location,
): boolean {
  const middle = locationBetween(from, target);
  const square = board.square(middle);
  return (
    board.item(middle) === undefined &&
    square.kind !== "supermana-base" &&
    square.kind !== "mon-base"
  );
}

function actorCanAttackTargetNow(
  board: Board,
  actor: Location,
  target: Location,
  item: Item,
  perspective: Color,
): boolean {
  if (board.square(actor).kind === "mon-base") return false;
  const targetItem = board.item(target);
  const targetMon = targetItem === undefined ? undefined : itemMon(targetItem);
  if (
    targetMon?.color !== otherColor(perspective) ||
    isMonFainted(targetMon) ||
    locationGuardedByAngel(
      board.findAwakeAngel(otherColor(perspective)),
      target,
    )
  ) {
    return false;
  }
  const mon = itemMon(item);
  if (mon?.kind === MonKind.Mystic) {
    return mysticReachableLocations(actor).some((at) =>
      locationEquals(at, target),
    );
  }
  return (
    mon?.kind === MonKind.Demon &&
    demonReachableLocations(actor).some((at) => locationEquals(at, target)) &&
    demonAttackPathClear(board, actor, target)
  );
}

function actorCanBombTargetNow(
  board: Board,
  actor: Location,
  target: Location,
  item: Item,
  perspective: Color,
): boolean {
  if (!bombReachableLocations(actor).some((at) => locationEquals(at, target)))
    return false;
  if (!actorCanBombFromItem(item) || itemMon(item)?.color !== perspective)
    return false;
  const targetItem = board.item(target);
  const targetMon = targetItem === undefined ? undefined : itemMon(targetItem);
  return (
    targetMon?.color === otherColor(perspective) && !isMonFainted(targetMon)
  );
}

function spiritDestinationAllowed(
  board: Board,
  targetItem: Item,
  destination: Location,
): boolean {
  const destinationItem = board.item(destination);
  const square = board.square(destination);
  const targetMon = itemMon(targetItem);
  const targetMana = itemMana(targetItem);
  let validDestination: boolean;
  if (destinationItem === undefined) {
    validDestination = true;
  } else if (destinationItem.kind === "mon") {
    if (itemMon(targetItem) !== undefined) validDestination = false;
    else if (targetItem.kind === "mana") {
      validDestination =
        destinationItem.mon.kind === MonKind.Drainer &&
        !isMonFainted(destinationItem.mon);
    } else {
      validDestination =
        targetItem.kind === "consumable" &&
        targetItem.consumable === Consumable.BombOrPotion;
    }
  } else if (destinationItem.kind === "mana") {
    validDestination =
      targetMon?.kind === MonKind.Drainer && !isMonFainted(targetMon);
  } else if (
    destinationItem.kind === "mon-with-mana" ||
    destinationItem.kind === "mon-with-consumable"
  ) {
    validDestination =
      targetItem.kind === "consumable" &&
      targetItem.consumable === Consumable.BombOrPotion;
  } else if (destinationItem.consumable === Consumable.BombOrPotion) {
    validDestination = itemMon(targetItem) !== undefined;
  } else {
    validDestination = false;
  }
  if (!validDestination) return false;
  switch (square.kind) {
    case "regular":
    case "consumable-base":
    case "mana-base":
    case "mana-pool":
      return true;
    case "supermana-base":
      return (
        targetMana?.kind === "supermana" ||
        (targetMana === undefined && targetMon?.kind === MonKind.Drainer)
      );
    case "mon-base":
      return (
        targetMon?.kind === square.monKind &&
        targetMon.color === square.color &&
        targetMana === undefined &&
        itemConsumable(targetItem) === undefined
      );
  }
}

function manaMoveDestinationAllowed(
  board: Board,
  destination: Location,
): boolean {
  const item = board.item(destination);
  const square = board.square(destination);
  const ordinarySquare =
    square.kind === "regular" ||
    square.kind === "consumable-base" ||
    square.kind === "mana-base" ||
    square.kind === "mana-pool";
  if (item === undefined) return ordinarySquare;
  return (
    item.kind === "mon" &&
    ordinarySquare &&
    item.mon.kind === MonKind.Drainer &&
    !isMonFainted(item.mon)
  );
}

function nearestWantedManaLocation(
  board: Board,
  wanted: Mana,
): Location | undefined {
  for (const [at, item] of board.occupied()) {
    if (item.kind === "mana" && manaEquals(item.mana, wanted)) return at;
  }
  return undefined;
}

function walkDestinationPlausible(
  board: Board,
  actor: Location,
  destination: Location,
): boolean {
  const actorItem = board.item(actor);
  const actorMon = actorItem === undefined ? undefined : itemMon(actorItem);
  if (actorMon === undefined) return false;
  const destinationItem = board.item(destination);
  if (destinationItem !== undefined && itemMon(destinationItem) !== undefined)
    return false;
  const square = board.square(destination);
  switch (square.kind) {
    case "regular":
    case "consumable-base":
    case "mana-base":
    case "mana-pool":
      return true;
    case "supermana-base":
      return actorMon.kind === MonKind.Drainer;
    case "mon-base":
      return (
        actorMon.kind === square.monKind && actorMon.color === square.color
      );
  }
}

function remainingMovesForColor(game: MonsGame, color: Color): number {
  return game.activeColor === color
    ? Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0)
    : MONS_MOVES_PER_TURN;
}

function distanceToNearestPool(at: Location, color: Color): number {
  const row = color === Color.Black ? 0 : BOARD_SIZE - 1;
  return Math.min(
    locationDistance(at, { i: row, j: 0 }),
    locationDistance(at, { i: row, j: BOARD_SIZE - 1 }),
  );
}

function opponentDrainerKillIsHighValue(
  game: MonsGame,
  perspective: Color,
  target: Location,
): boolean {
  const opponent = otherColor(perspective);
  return (
    ownDrainerSafetyScore(game.board, perspective) < 0 ||
    activeTurnScoreWindow(game, opponent) > 0 ||
    scoreForColor(game, opponent) >= TARGET_SCORE - 2 ||
    game.board.item(target)?.kind === "mon-with-mana" ||
    distanceToNearestPool(target, opponent) <= 3
  );
}

function actionIdentity(action: TurnAction): string {
  if (action.kind !== "score-carry") return actionKey(action);
  return `${actionKey(action)}:${action.wanted.kind}:${
    action.wanted.kind === "regular" ? action.wanted.color : "s"
  }`;
}

function opportunityKindForFamily(family: TurnPlanFamily): OpportunityKind {
  switch (family) {
    case TurnPlanFamily.ImmediateScore:
      return OpportunityKind.ImmediateScore;
    case TurnPlanFamily.DenyOpponentWindow:
      return OpportunityKind.TacticalDeny;
    case TurnPlanFamily.DrainerKill:
      return OpportunityKind.DrainerKill;
    case TurnPlanFamily.SafeSupermanaProgress:
      return OpportunityKind.SafeSupermanaProgress;
    case TurnPlanFamily.SafeOpponentManaProgress:
      return OpportunityKind.SafeOpponentManaProgress;
    case TurnPlanFamily.DrainerSafetyRecovery:
      return OpportunityKind.DrainerSafetyRecovery;
    case TurnPlanFamily.SpiritImpact:
      return OpportunityKind.SpiritImpact;
    case TurnPlanFamily.ManaTempo:
      return OpportunityKind.ManaTempo;
  }
}

function opportunityBudgetForAction(action: TurnAction): OpportunityBudget {
  switch (action.kind) {
    case "walk":
    case "safety-retreat":
    case "score-carry":
      return { monMovesNeeded: 1, needsAction: false, needsManaMove: false };
    case "attack":
    case "bomb":
    case "spirit-shift":
      return { monMovesNeeded: 0, needsAction: true, needsManaMove: false };
    case "move-mana":
      return { monMovesNeeded: 0, needsAction: false, needsManaMove: true };
  }
}

function budgetAllowsOpportunity(
  available: ExactOpportunityBudget,
  required: OpportunityBudget,
): boolean {
  return (
    required.monMovesNeeded <= available.remainingMonMoves &&
    (!required.needsAction || available.canUseAction) &&
    (!required.needsManaMove || available.canMoveMana)
  );
}

function opportunityDeltaForSeed(
  seed: ActionSeed,
  context: ExactOpportunityContext,
): OpportunityDelta {
  const unknown = BOARD_SIZE * 3;
  const supermanaProgressGain =
    seed.family === TurnPlanFamily.SafeSupermanaProgress
      ? Math.max(
          unknown - (context.delta.safeSupermanaProgressSteps ?? unknown),
          0,
        )
      : 0;
  const opponentManaProgressGain =
    seed.family === TurnPlanFamily.SafeOpponentManaProgress
      ? Math.max(
          unknown - (context.delta.safeOpponentManaProgressSteps ?? unknown),
          0,
        )
      : 0;
  return {
    sameTurnScoreWindowGain: context.delta.sameTurnScoreWindowValue,
    spiritGain:
      seed.family === TurnPlanFamily.SpiritImpact
        ? Math.max(context.delta.spiritGain, 1)
        : 0,
    opponentWindowDenyGain:
      seed.family === TurnPlanFamily.DenyOpponentWindow ||
      seed.family === TurnPlanFamily.DrainerKill
        ? Math.max(context.delta.opponentWindowDenyGain, 1)
        : 0,
    drainerAttack:
      (seed.family === TurnPlanFamily.DrainerKill ||
        seed.family === TurnPlanFamily.DenyOpponentWindow) &&
      context.delta.drainerAttackAvailable,
    drainerSafetyDelta:
      seed.family === TurnPlanFamily.DrainerSafetyRecovery
        ? Math.max(-context.delta.drainerSafety, 0)
        : 0,
    supermanaProgressGain,
    opponentManaProgressGain,
  };
}

function turnOpportunityFromSeed(
  seed: ActionSeed,
  context: ExactOpportunityContext,
): TurnOpportunity {
  return {
    kind: opportunityKindForFamily(seed.family),
    family: seed.family,
    action: seed.action,
    priority: seed.priority,
    budget: opportunityBudgetForAction(seed.action),
    delta: opportunityDeltaForSeed(seed, context),
  };
}

function opportunityScore(
  opportunity: TurnOpportunity,
  emergency: boolean,
): number {
  const kindBonus = (() => {
    switch (opportunity.kind) {
      case OpportunityKind.ImmediateScore:
        return 12_000;
      case OpportunityKind.TacticalDeny:
        return 11_400;
      case OpportunityKind.DrainerKill:
        return 11_200;
      case OpportunityKind.DrainerSafetyRecovery:
        return 10_400;
      case OpportunityKind.SpiritImpact:
        return 9_800;
      case OpportunityKind.SafeSupermanaProgress:
        return 9_400;
      case OpportunityKind.SafeOpponentManaProgress:
        return 9_200;
      case OpportunityKind.ManaTempo:
        return 8_000;
    }
  })();
  const urgentKind =
    opportunity.kind === OpportunityKind.ImmediateScore ||
    opportunity.kind === OpportunityKind.TacticalDeny ||
    opportunity.kind === OpportunityKind.DrainerKill ||
    opportunity.kind === OpportunityKind.DrainerSafetyRecovery;
  return (
    opportunity.priority +
    kindBonus +
    (emergency && urgentKind ? 4_000 : 0) +
    opportunity.delta.sameTurnScoreWindowGain * 280 +
    opportunity.delta.spiritGain * 220 +
    opportunity.delta.opponentWindowDenyGain * 260 +
    opportunity.delta.drainerSafetyDelta * 240 +
    opportunity.delta.supermanaProgressGain * 40 +
    opportunity.delta.opponentManaProgressGain * 36 +
    (opportunity.delta.drainerAttack ? 800 : 0) -
    Math.max(opportunity.budget.monMovesNeeded, 0) * 120 -
    (opportunity.budget.needsAction ? 80 : 0) -
    (opportunity.budget.needsManaMove ? 40 : 0)
  );
}

function familyAllowed(
  allowedFamilies: readonly TurnPlanFamily[] | undefined,
  family: TurnPlanFamily,
): boolean {
  return allowedFamilies === undefined || allowedFamilies.includes(family);
}

export function discoverTurnOpportunities(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  opportunityCap: number,
  allowedFamilies?: readonly TurnPlanFamily[],
): TurnOpportunity[] {
  if (checkpoint() || game.activeColor !== perspective) return [];
  const context = exactOpportunityContextWithSearchHash(
    game,
    perspective,
    exactSearchStateHash(game),
  );
  if (checkpoint()) return [];
  const emergency =
    context.opponentCanWinImmediately || context.delta.drainerSafety < 0;
  const seeds: ActionSeed[] = [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.ImmediateScore)) {
    seeds.push(...immediateScoreSeeds(game, perspective));
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.DenyOpponentWindow)) {
    seeds.push(...denyWindowSeeds(game, perspective));
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.DrainerKill)) {
    seeds.push(...drainerKillSeeds(game, perspective));
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.SafeSupermanaProgress)) {
    seeds.push(...safeSupermanaProgressSeeds(game, perspective));
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.SafeOpponentManaProgress)) {
    seeds.push(...safeOpponentManaProgressSeeds(game, perspective));
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.DrainerSafetyRecovery)) {
    seeds.push(...safetyRecoverySeeds(game, perspective));
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.ManaTempo)) {
    seeds.push(...riskyRecoverySetupSeeds(game, perspective, config));
  }
  if (checkpoint()) return [];
  if (
    familyAllowed(allowedFamilies, TurnPlanFamily.SafeSupermanaProgress) ||
    familyAllowed(allowedFamilies, TurnPlanFamily.SafeOpponentManaProgress) ||
    familyAllowed(allowedFamilies, TurnPlanFamily.DrainerSafetyRecovery) ||
    familyAllowed(allowedFamilies, TurnPlanFamily.SpiritImpact)
  ) {
    seeds.push(
      ...oracleWalkSeeds(game, perspective, context, allowedFamilies, config),
    );
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.SpiritImpact)) {
    seeds.push(...spiritImpactSeeds(game, perspective, config));
  }
  if (checkpoint()) return [];
  if (familyAllowed(allowedFamilies, TurnPlanFamily.ManaTempo)) {
    seeds.push(...manaTempoSeeds(game, perspective));
  }
  if (checkpoint()) return [];
  if (
    familyAllowed(allowedFamilies, TurnPlanFamily.ManaTempo) ||
    familyAllowed(allowedFamilies, TurnPlanFamily.DrainerSafetyRecovery)
  ) {
    seeds.push(
      ...fallbackWalkSeeds(game, perspective).filter((seed) =>
        familyAllowed(allowedFamilies, seed.family),
      ),
    );
  }
  if (checkpoint()) return [];

  const perFamily = new Map<TurnPlanFamily, TurnOpportunity[]>();
  for (const seed of seeds) {
    if (checkpoint()) return [];
    const opportunity = turnOpportunityFromSeed(seed, context);
    if (!budgetAllowsOpportunity(context.budget, opportunity.budget)) continue;
    if (
      emergency &&
      opportunity.kind === OpportunityKind.ManaTempo &&
      !opportunity.delta.drainerAttack &&
      opportunity.delta.drainerSafetyDelta <= 0
    ) {
      continue;
    }
    const list = perFamily.get(opportunity.family) ?? [];
    list.push(opportunity);
    perFamily.set(opportunity.family, list);
  }
  for (const opportunities of perFamily.values()) {
    opportunities.sort((left, right) => {
      const scoreOrder = compareNumber(
        opportunityScore(right, emergency),
        opportunityScore(left, emergency),
      );
      return scoreOrder !== 0
        ? scoreOrder
        : compareActionKeys(left.action, right.action);
    });
  }

  const familyOrder = [
    TurnPlanFamily.ImmediateScore,
    TurnPlanFamily.DenyOpponentWindow,
    TurnPlanFamily.DrainerKill,
    TurnPlanFamily.DrainerSafetyRecovery,
    TurnPlanFamily.SpiritImpact,
    TurnPlanFamily.SafeSupermanaProgress,
    TurnPlanFamily.SafeOpponentManaProgress,
    TurnPlanFamily.ManaTempo,
  ];
  const indices = new Map<TurnPlanFamily, number>();
  const seen = new Set<string>();
  const result: TurnOpportunity[] = [];
  for (
    let round = 0;
    round < Math.max(config.perNodeFamilyCap, 1);
    round += 1
  ) {
    if (checkpoint()) return [];
    let addedAny = false;
    for (const family of familyOrder) {
      const familyOpportunities = perFamily.get(family);
      if (familyOpportunities === undefined) continue;
      let index = indices.get(family) ?? 0;
      while (index < familyOpportunities.length) {
        const candidate = familyOpportunities[index];
        index += 1;
        if (
          candidate !== undefined &&
          !seen.has(actionIdentity(candidate.action))
        ) {
          seen.add(actionIdentity(candidate.action));
          result.push(candidate);
          addedAny = true;
          break;
        }
      }
      indices.set(family, index);
      if (result.length >= Math.max(opportunityCap, 1)) return result;
    }
    if (!addedAny) break;
  }
  return result;
}

function generateActionSeeds(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
  seedCap: number,
): ActionSeed[] {
  if (checkpoint() || game.activeColor !== perspective) return [];
  if (config.mode === TurnEngineMode.CurrentPro) {
    const seeds = discoverTurnOpportunities(
      game,
      perspective,
      config,
      seedCap,
    ).map(({ family, action, priority }) => ({ family, action, priority }));
    return checkpoint() ? [] : seeds;
  }

  const seeds: ActionSeed[] = [];
  seeds.push(...immediateScoreSeeds(game, perspective));
  if (checkpoint()) return [];
  seeds.push(...denyWindowSeeds(game, perspective));
  if (checkpoint()) return [];
  seeds.push(...drainerKillSeeds(game, perspective));
  if (checkpoint()) return [];
  seeds.push(...safeSupermanaProgressSeeds(game, perspective));
  if (checkpoint()) return [];
  seeds.push(...safeOpponentManaProgressSeeds(game, perspective));
  if (checkpoint()) return [];
  seeds.push(...safetyRecoverySeeds(game, perspective));
  if (checkpoint()) return [];
  seeds.push(
    ...oracleWalkSeeds(
      game,
      perspective,
      exactOpportunityContextWithSearchHash(
        game,
        perspective,
        exactSearchStateHash(game),
      ),
      undefined,
      config,
    ),
  );
  if (checkpoint()) return [];
  seeds.push(...spiritImpactSeeds(game, perspective, config));
  if (checkpoint()) return [];
  seeds.push(...manaTempoSeeds(game, perspective));
  if (checkpoint()) return [];
  const perFamily = new Map<TurnPlanFamily, ActionSeed[]>();
  for (const seed of seeds) {
    if (checkpoint()) return [];
    const list = perFamily.get(seed.family) ?? [];
    list.push(seed);
    perFamily.set(seed.family, list);
  }
  for (const familySeeds of perFamily.values()) {
    familySeeds.sort((left, right) => {
      const order = compareNumber(right.priority, left.priority);
      return order !== 0 ? order : compareActionKeys(left.action, right.action);
    });
  }
  const familyOrder = [
    TurnPlanFamily.ImmediateScore,
    TurnPlanFamily.DenyOpponentWindow,
    TurnPlanFamily.DrainerKill,
    TurnPlanFamily.DrainerSafetyRecovery,
    TurnPlanFamily.SpiritImpact,
    TurnPlanFamily.SafeSupermanaProgress,
    TurnPlanFamily.SafeOpponentManaProgress,
    TurnPlanFamily.ManaTempo,
  ];
  const seen = new Set<string>();
  const indices = new Map<TurnPlanFamily, number>();
  const result: ActionSeed[] = [];
  for (
    let round = 0;
    round < Math.max(config.perNodeFamilyCap, 1);
    round += 1
  ) {
    if (checkpoint()) return [];
    let addedAny = false;
    for (const family of familyOrder) {
      const list = perFamily.get(family);
      if (list === undefined) continue;
      let index = indices.get(family) ?? 0;
      while (index < list.length) {
        const seed = list[index];
        index += 1;
        if (seed !== undefined && !seen.has(actionIdentity(seed.action))) {
          seen.add(actionIdentity(seed.action));
          result.push(seed);
          addedAny = true;
          break;
        }
      }
      indices.set(family, index);
      if (result.length >= Math.max(seedCap, 1)) return result;
    }
    if (!addedAny) break;
  }
  return result;
}

function immediateScoreSeeds(game: MonsGame, perspective: Color): ActionSeed[] {
  const result: ActionSeed[] = [];
  for (const [at, item] of game.board.occupied()) {
    if (
      item.kind !== "mon-with-mana" ||
      item.mon.color !== perspective ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    const beforeDistance = distanceToNearestPool(at, perspective);
    for (const next of nearbyLocations(at)) {
      const afterDistance = distanceToNearestPool(next, perspective);
      if (afterDistance > beforeDistance) continue;
      result.push({
        family: TurnPlanFamily.ImmediateScore,
        action: {
          kind: "score-carry",
          actor: at,
          wanted: item.mana,
          step: next,
        },
        priority:
          9_800 +
          Math.max(beforeDistance - afterDistance, 0) * 180 +
          manaScore(item.mana, perspective) * 120,
      });
    }
  }
  return result;
}

function denyWindowSeeds(game: MonsGame, perspective: Color): ActionSeed[] {
  const opponent = otherColor(perspective);
  const pressure = activeTurnScoreWindowWithSearchHash(
    game,
    opponent,
    exactSearchStateHash(game),
  );
  if (pressure <= 0 && !opponentCanWinImmediately(game, perspective)) return [];
  const result = attackFamilySeeds(
    game,
    perspective,
    TurnPlanFamily.DenyOpponentWindow,
    9_400 + pressure * 240,
  );
  const drainer = findAwakeDrainerLocation(game.board, perspective);
  if (drainer === undefined) return result;
  const beforeSafety = ownDrainerSafetyScore(game.board, perspective);
  const beforeDistance = distanceToNearestPool(drainer, perspective);
  for (const next of nearbyLocations(drainer)) {
    if (
      distanceToNearestPool(next, perspective) > beforeDistance + 1 &&
      beforeSafety >= 0
    ) {
      continue;
    }
    result.push({
      family: TurnPlanFamily.DenyOpponentWindow,
      action: { kind: "safety-retreat", actor: drainer, to: next },
      priority: 9_100 + Math.abs(beforeSafety) * 220,
    });
  }
  return result;
}

function drainerKillSeeds(game: MonsGame, perspective: Color): ActionSeed[] {
  const target = findAwakeDrainerLocation(game.board, otherColor(perspective));
  return target === undefined ||
    !opponentDrainerKillIsHighValue(game, perspective, target)
    ? []
    : attackFamilySeeds(game, perspective, TurnPlanFamily.DrainerKill, 9_000);
}

function attackFamilySeeds(
  game: MonsGame,
  perspective: Color,
  family: TurnPlanFamily,
  basePriority: number,
): ActionSeed[] {
  const target = findAwakeDrainerLocation(game.board, otherColor(perspective));
  if (target === undefined) return [];
  const result: ActionSeed[] = [];
  const canUseAction = game.playerCanUseAction();
  const remainingMoves = remainingMovesForColor(game, perspective);
  for (const [at, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (mon?.color !== perspective || isMonFainted(mon)) continue;
    const canAttack = canUseAction && actorCanAttackFromItem(item);
    const canBomb = canUseAction && actorCanBombFromItem(item);
    if (
      canAttack &&
      actorCanAttackTargetNow(game.board, at, target, item, perspective)
    ) {
      result.push({
        family,
        action: { kind: "attack", actor: at, target },
        priority: basePriority,
      });
    }
    if (
      canBomb &&
      actorCanBombTargetNow(game.board, at, target, item, perspective)
    ) {
      result.push({
        family,
        action: { kind: "bomb", actor: at, target },
        priority: basePriority - 80,
      });
    }
    if (remainingMoves <= 0 || (!canAttack && !canBomb)) continue;
    for (const next of nearbyLocations(at)) {
      if (locationDistance(next, target) >= locationDistance(at, target))
        continue;
      if (family === TurnPlanFamily.DrainerKill) {
        const preview = game.board.clone();
        preview.removeItem(at);
        preview.put(item, next);
        const threatensNow =
          (canAttack &&
            actorCanAttackTargetNow(
              preview,
              next,
              target,
              item,
              perspective,
            )) ||
          (canBomb &&
            actorCanBombTargetNow(preview, next, target, item, perspective));
        if (!threatensNow) continue;
      }
      result.push({
        family,
        action: { kind: "walk", actor: at, to: next },
        priority:
          basePriority -
          200 +
          (locationDistance(at, target) - locationDistance(next, target)) * 80,
      });
    }
  }
  return result;
}

function safeSupermanaProgressSeeds(
  game: MonsGame,
  perspective: Color,
): ActionSeed[] {
  return safeProgressSeeds(
    game,
    perspective,
    { kind: "supermana" },
    TurnPlanFamily.SafeSupermanaProgress,
    8_900,
  );
}

function safeOpponentManaProgressSeeds(
  game: MonsGame,
  perspective: Color,
): ActionSeed[] {
  return safeProgressSeeds(
    game,
    perspective,
    { kind: "regular", color: otherColor(perspective) },
    TurnPlanFamily.SafeOpponentManaProgress,
    8_600,
  );
}

type SafeProgressExactSnapshot = {
  readonly progressSteps: number | undefined;
  readonly scorePathBestSteps: number | undefined;
  readonly sameTurnScoreWindowValue: number;
};

function safeProgressExactSnapshot(
  game: MonsGame,
  perspective: Color,
  wanted: Mana,
  stateHash: Hash64,
): SafeProgressExactSnapshot {
  if (checkpoint()) {
    return {
      progressSteps: undefined,
      scorePathBestSteps: undefined,
      sameTurnScoreWindowValue: 0,
    };
  }
  const opponent = otherColor(perspective);
  const flags =
    wanted.kind === "supermana"
      ? EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS |
        EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW
      : wanted.color === opponent
        ? EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS
        : 0;
  const projection = exactTurnTacticalProjectionWithSearchHash(
    game,
    perspective,
    stateHash,
    flags,
  );
  if (checkpoint()) {
    return {
      progressSteps: undefined,
      scorePathBestSteps: undefined,
      sameTurnScoreWindowValue: 0,
    };
  }
  return {
    progressSteps:
      wanted.kind === "supermana"
        ? projection.safeSupermanaProgressSteps
        : wanted.color === opponent
          ? projection.safeOpponentManaProgressSteps
          : undefined,
    scorePathBestSteps: exactBestScoreStepsOnBoard(game.board, perspective),
    sameTurnScoreWindowValue: projection.sameTurnScoreWindowValue,
  };
}

function safeProgressSeeds(
  game: MonsGame,
  perspective: Color,
  wanted: Mana,
  family: TurnPlanFamily,
  basePriority: number,
): ActionSeed[] {
  if (checkpoint()) return [];
  const drainer = findAwakeDrainerLocation(game.board, perspective);
  if (drainer === undefined) return [];
  const result: ActionSeed[] = [];
  const beforeExact = safeProgressExactSnapshot(
    game,
    perspective,
    wanted,
    exactSearchStateHash(game),
  );
  if (cancelled()) return [];
  const beforeSafety = ownDrainerSafetyScore(game.board, perspective);
  const path = exactSecureSpecificManaPathFrom(
    game,
    perspective,
    drainer,
    wanted,
  );
  const pathStep = path?.[0];
  if (pathStep !== undefined) {
    result.push({
      family,
      action: { kind: "score-carry", actor: drainer, wanted, step: pathStep },
      priority:
        basePriority + Math.max(BOARD_SIZE * 2 - (path?.length ?? 0), 0) * 120,
    });
  }
  if (checkpoint()) return [];
  if (remainingMovesForColor(game, perspective) > 0) {
    const target = nearestWantedManaLocation(game.board, wanted);
    if (target !== undefined) {
      const beforeDistance = locationDistance(drainer, target);
      const beforeSteps = beforeExact.progressSteps ?? BOARD_SIZE * 3;
      const beforeScorePath = beforeExact.scorePathBestSteps ?? BOARD_SIZE * 3;
      for (const next of nearbyLocations(drainer)) {
        if (checkpoint()) return [];
        if (!walkDestinationPlausible(game.board, drainer, next)) continue;
        const applied = applyInputsForSearchWithEvents(game, [
          { kind: "location", location: drainer },
          { kind: "location", location: next },
        ]);
        if (
          applied === undefined ||
          opponentCanWinImmediately(applied.game, perspective)
        ) {
          continue;
        }
        const afterExact = safeProgressExactSnapshot(
          applied.game,
          perspective,
          wanted,
          exactSearchStateHash(applied.game),
        );
        if (cancelled()) return [];
        const afterSafety = ownDrainerSafetyScore(
          applied.game.board,
          perspective,
        );
        const afterSteps = afterExact.progressSteps ?? BOARD_SIZE * 3;
        const afterScorePath = afterExact.scorePathBestSteps ?? BOARD_SIZE * 3;
        const exactImproved =
          afterSteps < beforeSteps ||
          (afterSteps <= beforeSteps && afterScorePath < beforeScorePath);
        if (!exactImproved && afterSafety < beforeSafety) continue;
        let priority =
          basePriority -
          180 +
          Math.max(beforeDistance - locationDistance(next, target), 0) * 110 +
          (afterSafety - beforeSafety) * 120;
        if (exactImproved) {
          priority +=
            (beforeSteps - afterSteps) * 220 +
            (beforeScorePath - afterScorePath) * 180;
        }
        if (
          wanted.kind === "supermana" &&
          afterExact.sameTurnScoreWindowValue > 0
        ) {
          priority += afterExact.sameTurnScoreWindowValue * 260;
        }
        result.push({
          family,
          action: { kind: "walk", actor: drainer, to: next },
          priority,
        });
      }
    }
  }
  const drainerItem = game.board.item(drainer);
  if (
    drainerItem?.kind === "mon-with-mana" &&
    manaEquals(drainerItem.mana, wanted)
  ) {
    const beforeDistance = distanceToNearestPool(drainer, perspective);
    for (const next of nearbyLocations(drainer)) {
      const afterDistance = distanceToNearestPool(next, perspective);
      if (afterDistance > beforeDistance) continue;
      result.push({
        family,
        action: { kind: "score-carry", actor: drainer, wanted, step: next },
        priority:
          basePriority + Math.max(beforeDistance - afterDistance, 0) * 150,
      });
    }
  }
  return result;
}

function safetyRecoverySeeds(game: MonsGame, perspective: Color): ActionSeed[] {
  const drainer = findAwakeDrainerLocation(game.board, perspective);
  if (drainer === undefined) return [];
  const beforeSafety = ownDrainerSafetyScore(game.board, perspective);
  const result: ActionSeed[] = [];
  for (const next of nearbyLocations(drainer)) {
    const applied = applyInputsForSearchWithEvents(game, [
      { kind: "location", location: drainer },
      { kind: "location", location: next },
    ]);
    if (applied === undefined) continue;
    const afterSafety = ownDrainerSafetyScore(applied.game.board, perspective);
    if (afterSafety <= beforeSafety) continue;
    result.push({
      family: TurnPlanFamily.DrainerSafetyRecovery,
      action: { kind: "safety-retreat", actor: drainer, to: next },
      priority:
        8_300 +
        Math.abs(beforeSafety) * 220 +
        (afterSafety - beforeSafety) * 260,
    });
  }
  return result;
}

function fallbackWalkSeeds(game: MonsGame, perspective: Color): ActionSeed[] {
  if (remainingMovesForColor(game, perspective) <= 0) return [];
  const result: ActionSeed[] = [];
  const beforeSafety = ownDrainerSafetyScore(game.board, perspective);
  const drainer = findAwakeDrainerLocation(game.board, perspective);
  if (drainer !== undefined) {
    const beforePoolDistance = distanceToNearestPool(drainer, perspective);
    for (const next of nearbyLocations(drainer)) {
      if (!walkDestinationPlausible(game.board, drainer, next)) continue;
      const applied = applyInputsForSearchWithEvents(game, [
        { kind: "location", location: drainer },
        { kind: "location", location: next },
      ]);
      if (
        applied === undefined ||
        opponentCanWinImmediately(applied.game, perspective)
      )
        continue;
      const afterSafety = ownDrainerSafetyScore(
        applied.game.board,
        perspective,
      );
      if (afterSafety < beforeSafety) continue;
      const afterPoolDistance = distanceToNearestPool(next, perspective);
      result.push({
        family:
          afterSafety > beforeSafety
            ? TurnPlanFamily.DrainerSafetyRecovery
            : TurnPlanFamily.ManaTempo,
        action: { kind: "walk", actor: drainer, to: next },
        priority:
          7_200 +
          Math.max(beforePoolDistance - afterPoolDistance, 0) * 140 +
          (afterSafety - beforeSafety) * 240,
      });
    }
  }
  if (result.length !== 0) return result;
  for (const [actor, item] of game.board.occupied()) {
    const mon = itemMon(item);
    if (mon?.color !== perspective || isMonFainted(mon)) continue;
    for (const to of nearbyLocations(actor)) {
      if (!walkDestinationPlausible(game.board, actor, to)) continue;
      const applied = applyInputsForSearchWithEvents(game, [
        { kind: "location", location: actor },
        { kind: "location", location: to },
      ]);
      if (
        applied === undefined ||
        opponentCanWinImmediately(applied.game, perspective)
      )
        continue;
      result.push({
        family: TurnPlanFamily.ManaTempo,
        action: { kind: "walk", actor, to },
        priority: 6_800,
      });
    }
  }
  return result;
}

function bestFollowUpSafetyRecoveryPriority(
  game: MonsGame,
  perspective: Color,
): number | undefined {
  const drainer = findAwakeDrainerLocation(game.board, perspective);
  if (drainer === undefined) return undefined;
  const beforeSafety = ownDrainerSafetyScore(game.board, perspective);
  let best: number | undefined;
  for (const next of nearbyLocations(drainer)) {
    if (!walkDestinationPlausible(game.board, drainer, next)) continue;
    const applied = applyInputsForSearchWithEvents(game, [
      { kind: "location", location: drainer },
      { kind: "location", location: next },
    ]);
    if (applied === undefined) continue;
    const afterSafety = ownDrainerSafetyScore(applied.game.board, perspective);
    if (afterSafety <= beforeSafety) continue;
    const priority =
      8_300 + Math.abs(beforeSafety) * 220 + (afterSafety - beforeSafety) * 260;
    best = best === undefined ? priority : Math.max(best, priority);
  }
  return best;
}

function riskyRecoverySetupSeeds(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): ActionSeed[] {
  if (
    config.mode !== TurnEngineMode.CurrentPro ||
    remainingMovesForColor(game, perspective) <= 0
  ) {
    return [];
  }
  const drainer = findAwakeDrainerLocation(game.board, perspective);
  if (drainer === undefined) return [];
  const beforeSafety = ownDrainerSafetyScore(game.board, perspective);
  const beforePoolDistance = distanceToNearestPool(drainer, perspective);
  const result: ActionSeed[] = [];
  for (const next of nearbyLocations(drainer)) {
    if (!walkDestinationPlausible(game.board, drainer, next)) continue;
    const applied = applyInputsForSearchWithEvents(game, [
      { kind: "location", location: drainer },
      { kind: "location", location: next },
    ]);
    if (
      applied === undefined ||
      opponentCanWinImmediately(applied.game, perspective)
    )
      continue;
    const afterSafety = ownDrainerSafetyScore(applied.game.board, perspective);
    const afterPoolDistance = distanceToNearestPool(next, perspective);
    if (afterSafety >= beforeSafety || afterPoolDistance >= beforePoolDistance)
      continue;
    const recoveryPriority = bestFollowUpSafetyRecoveryPriority(
      applied.game,
      perspective,
    );
    if (recoveryPriority === undefined) continue;
    result.push({
      family: TurnPlanFamily.ManaTempo,
      action: { kind: "walk", actor: drainer, to: next },
      priority:
        8_000 +
        Math.max(beforePoolDistance - afterPoolDistance, 0) * 260 +
        Math.trunc(recoveryPriority / 20) -
        Math.max(beforeSafety - afterSafety, 0) * 120,
    });
  }
  return result;
}

function tacticalProjectionFlags(
  needSupermanaProgress: boolean,
  needOpponentManaProgress: boolean,
  needSpiritScore: boolean,
  needSpiritDenial: boolean,
  needScoreWindow: boolean,
): number {
  let flags = 0;
  if (needSupermanaProgress)
    flags |= EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS;
  if (needOpponentManaProgress)
    flags |= EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS;
  if (needSpiritScore) flags |= EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE;
  if (needSpiritDenial) flags |= EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL;
  if (needScoreWindow) flags |= EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW;
  return flags;
}

type OracleWalkProjectionProfile =
  | "safe-progress-only"
  | "opponent-progress-only"
  | "drainer-opportunity"
  | "spirit-score-only"
  | "spirit-opportunity";

type OracleWalkActorCapabilities = {
  readonly canEmitSupermana: boolean;
  readonly canEmitOpponentMana: boolean;
  readonly canEmitSafety: boolean;
  readonly canEmitSpirit: boolean;
  readonly tacticalFlags: number;
  readonly projectionProfile: OracleWalkProjectionProfile | undefined;
  readonly needsScoreWindow: boolean;
};

function tacticalProjectionProfileFlags(
  profile: OracleWalkProjectionProfile,
): number {
  switch (profile) {
    case "safe-progress-only":
      return tacticalProjectionFlags(true, false, false, false, false);
    case "opponent-progress-only":
      return tacticalProjectionFlags(false, true, false, false, false);
    case "drainer-opportunity":
      return tacticalProjectionFlags(false, true, false, true, false);
    case "spirit-score-only":
      return tacticalProjectionFlags(false, false, true, false, false);
    case "spirit-opportunity":
      return tacticalProjectionFlags(true, false, true, false, false);
  }
}

function oracleWalkActorCapabilities(
  monKind: MonKind,
  allowSupermana: boolean,
  allowOpponentMana: boolean,
  allowSafety: boolean,
  allowSpirit: boolean,
): OracleWalkActorCapabilities {
  const canEmitSupermana = allowSupermana;
  const canEmitOpponentMana = allowOpponentMana && monKind !== MonKind.Spirit;
  const canEmitSafety = allowSafety;
  const canEmitSpirit = allowSpirit && monKind === MonKind.Spirit;
  const projectionProfile: OracleWalkProjectionProfile | undefined =
    canEmitSupermana && canEmitSpirit
      ? "spirit-opportunity"
      : canEmitSupermana
        ? "safe-progress-only"
        : canEmitOpponentMana && allowSpirit
          ? "drainer-opportunity"
          : canEmitOpponentMana
            ? "opponent-progress-only"
            : canEmitSpirit
              ? "spirit-score-only"
              : undefined;
  return {
    canEmitSupermana,
    canEmitOpponentMana,
    canEmitSafety,
    canEmitSpirit,
    tacticalFlags: tacticalProjectionFlags(
      canEmitSupermana,
      canEmitOpponentMana,
      canEmitSpirit,
      allowSpirit && canEmitOpponentMana,
      canEmitSupermana || canEmitSpirit,
    ),
    projectionProfile,
    needsScoreWindow: canEmitSupermana || canEmitSpirit,
  };
}

function strategicSpiritSignalWithSearchHash(
  game: MonsGame,
  perspective: Color,
  stateHash: Hash64,
): readonly [number, number] {
  const spirit = exactStrategicAnalysisWithSearchHash(
    game,
    stateHash,
  ).colorSummary(perspective).spirit;
  return [spirit.nextTurnSetupGain, spirit.utility];
}

function oracleWalkSeeds(
  game: MonsGame,
  perspective: Color,
  context: ExactOpportunityContext,
  allowedFamilies: readonly TurnPlanFamily[] | undefined,
  config: TurnEngineConfig,
): ActionSeed[] {
  if (checkpoint() || remainingMovesForColor(game, perspective) <= 0) return [];

  const allowSupermana = familyAllowed(
    allowedFamilies,
    TurnPlanFamily.SafeSupermanaProgress,
  );
  const allowOpponentMana = familyAllowed(
    allowedFamilies,
    TurnPlanFamily.SafeOpponentManaProgress,
  );
  const allowSafety = familyAllowed(
    allowedFamilies,
    TurnPlanFamily.DrainerSafetyRecovery,
  );
  const allowSpirit = familyAllowed(
    allowedFamilies,
    TurnPlanFamily.SpiritImpact,
  );
  if (!allowSupermana && !allowOpponentMana && !allowSafety && !allowSpirit) {
    return [];
  }

  const before = context.turn;
  let beforeSpirit: readonly [number, number] = [0, 0];
  if (allowSpirit) {
    beforeSpirit = strategicSpiritSignalWithSearchHash(
      game,
      perspective,
      exactSearchStateHash(game),
    );
  }
  if (checkpoint()) return [];
  const beforeSafety =
    allowSupermana || allowSafety
      ? ownDrainerSafetyScore(game.board, perspective)
      : 0;
  const beforeSuperSteps = before.safeSupermanaProgressSteps ?? BOARD_SIZE * 3;
  const beforeOpponentSteps =
    before.safeOpponentManaProgressSteps ?? BOARD_SIZE * 3;
  const ownDrainer = findAwakeDrainerLocation(game.board, perspective);
  const result: ActionSeed[] = [];
  const useLazyScoreWindowProjection =
    config.enableLazyOracleScoreWindowProjection;

  for (const [actor, item] of game.board.occupied()) {
    if (checkpoint()) return [];
    const mon = itemMon(item);
    if (
      mon?.color !== perspective ||
      isMonFainted(mon) ||
      (ownDrainer !== undefined && locationEquals(actor, ownDrainer))
    ) {
      continue;
    }
    const capabilities = oracleWalkActorCapabilities(
      mon.kind,
      allowSupermana,
      allowOpponentMana,
      allowSafety,
      allowSpirit,
    );
    if (
      !capabilities.canEmitSupermana &&
      !capabilities.canEmitOpponentMana &&
      !capabilities.canEmitSafety &&
      !capabilities.canEmitSpirit
    ) {
      continue;
    }
    for (const to of nearbyLocations(actor)) {
      if (checkpoint()) return [];
      if (!walkDestinationPlausible(game.board, actor, to)) continue;
      const applied = applyInputsForSearchWithEvents(game, [
        { kind: "location", location: actor },
        { kind: "location", location: to },
      ]);
      if (
        applied === undefined ||
        opponentCanWinImmediately(applied.game, perspective)
      )
        continue;

      const needAfterSpirit = capabilities.canEmitSpirit;
      const needAfterTurn = useLazyScoreWindowProjection
        ? capabilities.projectionProfile !== undefined
        : capabilities.tacticalFlags !== 0;
      const needAfterScoreWindow =
        useLazyScoreWindowProjection && capabilities.needsScoreWindow;
      const afterHash =
        needAfterTurn || needAfterScoreWindow || needAfterSpirit
          ? exactSearchStateHash(applied.game)
          : undefined;
      let after: ExactTurnTacticalProjection | undefined;
      if (needAfterTurn) {
        if (afterHash === undefined) {
          throw new Error("oracle walk projection requires a state hash");
        }
        let flags = capabilities.tacticalFlags;
        if (useLazyScoreWindowProjection) {
          if (capabilities.projectionProfile === undefined) {
            throw new Error("lazy oracle projection requires a profile");
          }
          flags = tacticalProjectionProfileFlags(
            capabilities.projectionProfile,
          );
        }
        after = exactTurnTacticalProjectionWithSearchHash(
          applied.game,
          perspective,
          afterHash,
          flags,
        );
      }
      if (cancelled()) return [];
      let afterSpirit: readonly [number, number] = [0, 0];
      if (needAfterSpirit) {
        if (afterHash === undefined) {
          throw new Error("oracle Spirit analysis requires a state hash");
        }
        afterSpirit = strategicSpiritSignalWithSearchHash(
          applied.game,
          perspective,
          afterHash,
        );
      }
      const afterSafety =
        capabilities.canEmitSupermana || capabilities.canEmitSafety
          ? ownDrainerSafetyScore(applied.game.board, perspective)
          : beforeSafety;
      const afterSuperSteps =
        after === undefined
          ? beforeSuperSteps
          : (after.safeSupermanaProgressSteps ?? BOARD_SIZE * 3);
      const afterOpponentSteps =
        after === undefined
          ? beforeOpponentSteps
          : (after.safeOpponentManaProgressSteps ?? BOARD_SIZE * 3);
      let afterScoreWindowValue: number | undefined;
      const loadAfterScoreWindow = (): number => {
        if (afterScoreWindowValue !== undefined) return afterScoreWindowValue;
        if (useLazyScoreWindowProjection) {
          if (afterHash === undefined) {
            throw new Error(
              "oracle score-window projection requires a state hash",
            );
          }
          afterScoreWindowValue = exactTurnTacticalProjectionWithSearchHash(
            applied.game,
            perspective,
            afterHash,
            EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
          ).sameTurnScoreWindowValue;
        } else {
          afterScoreWindowValue = after?.sameTurnScoreWindowValue ?? 0;
        }
        return afterScoreWindowValue;
      };

      if (capabilities.canEmitSupermana && afterSuperSteps < beforeSuperSteps) {
        result.push({
          family: TurnPlanFamily.SafeSupermanaProgress,
          action: { kind: "walk", actor, to },
          priority:
            8_250 +
            (beforeSuperSteps - afterSuperSteps) * 240 +
            (afterSafety - beforeSafety) * 100 +
            loadAfterScoreWindow() * 160,
        });
      }

      const opponentProgressImproved =
        capabilities.canEmitOpponentMana &&
        afterOpponentSteps < beforeOpponentSteps;
      const spiritDenialImproved =
        allowSpirit &&
        (capabilities.canEmitSpirit || capabilities.canEmitOpponentMana) &&
        (after?.spiritAssistedDenialValue ?? 0) >
          before.spiritAssistedDenialValue;
      if (opponentProgressImproved || spiritDenialImproved) {
        const family =
          mon.kind === MonKind.Spirit
            ? TurnPlanFamily.SpiritImpact
            : TurnPlanFamily.SafeOpponentManaProgress;
        if (familyAllowed(allowedFamilies, family)) {
          result.push({
            family,
            action: { kind: "walk", actor, to },
            priority:
              8_000 +
              (opponentProgressImproved
                ? Math.max(beforeOpponentSteps - afterOpponentSteps, 0) * 240
                : 0) +
              (spiritDenialImproved
                ? Math.max(
                    (after?.spiritAssistedDenialValue ?? 0) -
                      before.spiritAssistedDenialValue,
                    0,
                  ) * 180
                : 0),
          });
        }
      }

      if (capabilities.canEmitSpirit) {
        const setupDelta = afterSpirit[0] - beforeSpirit[0];
        const utilityDelta = afterSpirit[1] - beforeSpirit[1];
        const spiritSetupImproved = setupDelta > 0 || utilityDelta > 0;
        const spiritScoreBaseImproved =
          (after?.spiritAssistedScoreValue ?? 0) >
          before.spiritAssistedScoreValue;
        const spiritScoreWindowImproved = useLazyScoreWindowProjection
          ? !spiritScoreBaseImproved &&
            !spiritSetupImproved &&
            loadAfterScoreWindow() > before.sameTurnScoreWindowValue
          : (after?.sameTurnScoreWindowValue ?? 0) >
            before.sameTurnScoreWindowValue;
        if (
          spiritScoreBaseImproved ||
          spiritScoreWindowImproved ||
          spiritSetupImproved
        ) {
          const scoreDelta =
            (after?.spiritAssistedScoreValue ?? 0) -
            before.spiritAssistedScoreValue;
          const windowDelta =
            loadAfterScoreWindow() - before.sameTurnScoreWindowValue;
          result.push({
            family: TurnPlanFamily.SpiritImpact,
            action: { kind: "walk", actor, to },
            priority:
              8_100 +
              scoreDelta * 200 +
              windowDelta * 220 +
              setupDelta * 320 +
              utilityDelta * 180,
          });
        }
      }

      if (capabilities.canEmitSafety && afterSafety > beforeSafety) {
        result.push({
          family: TurnPlanFamily.DrainerSafetyRecovery,
          action: { kind: "walk", actor, to },
          priority: 8_050 + (afterSafety - beforeSafety) * 260,
        });
      }
    }
  }
  return result;
}

function progressPriorityBonus(
  before: number | undefined,
  after: number | undefined,
): number {
  const beforeSteps = before ?? BOARD_SIZE * 3;
  const afterSteps = after ?? BOARD_SIZE * 3;
  return afterSteps >= beforeSteps ? 0 : (beforeSteps - afterSteps) * 220;
}

function spiritImpactSeeds(
  game: MonsGame,
  perspective: Color,
  config: TurnEngineConfig,
): ActionSeed[] {
  if (checkpoint() || !config.enableSpiritFamily || !game.playerCanUseAction())
    return [];
  const flags = tacticalProjectionFlags(true, true, true, true, true);
  const before = exactTurnTacticalProjectionWithSearchHash(
    game,
    perspective,
    exactSearchStateHash(game),
    flags,
  );
  if (checkpoint()) return [];
  const beforeSafety = ownDrainerSafetyScore(game.board, perspective);
  const result: ActionSeed[] = [];
  for (const [spirit, item] of game.board.occupied()) {
    if (checkpoint()) return [];
    const mon = itemMon(item);
    if (
      mon?.color !== perspective ||
      mon.kind !== MonKind.Spirit ||
      isMonFainted(mon) ||
      game.board.square(spirit).kind === "mon-base"
    ) {
      continue;
    }
    for (const target of spiritReachableLocations(spirit)) {
      if (checkpoint()) return [];
      const targetItem = game.board.item(target);
      if (targetItem === undefined || !isSpiritTargetAllowed(targetItem))
        continue;
      for (const destination of nearbyLocations(target)) {
        if (checkpoint()) return [];
        if (!spiritDestinationAllowed(game.board, targetItem, destination))
          continue;
        const applied = applyInputsForSearchWithEvents(game, [
          { kind: "location", location: spirit },
          { kind: "location", location: target },
          { kind: "location", location: destination },
        ]);
        if (applied === undefined) continue;
        let priority = 7_600;
        const targetMon = itemMon(targetItem);
        if (targetMon?.color === otherColor(perspective)) priority += 400;
        const targetMana = itemMana(targetItem);
        if (targetMana?.kind === "supermana") priority += 600;
        if (
          targetMana?.kind === "regular" &&
          targetMana.color === otherColor(perspective)
        ) {
          priority += 460;
        }
        const after = exactTurnTacticalProjectionWithSearchHash(
          applied.game,
          perspective,
          exactSearchStateHash(applied.game),
          flags,
        );
        if (checkpoint()) return [];
        if (after.sameTurnScoreWindowValue > before.sameTurnScoreWindowValue) {
          priority +=
            (after.sameTurnScoreWindowValue - before.sameTurnScoreWindowValue) *
            280;
        }
        if (after.spiritAssistedScore) {
          priority += 900 + after.spiritAssistedScoreValue * 120;
        }
        if (after.safeSupermanaProgress) {
          priority +=
            700 +
            progressPriorityBonus(
              before.safeSupermanaProgressSteps,
              after.safeSupermanaProgressSteps,
            );
        }
        if (after.safeOpponentManaProgress) {
          priority +=
            760 +
            progressPriorityBonus(
              before.safeOpponentManaProgressSteps,
              after.safeOpponentManaProgressSteps,
            );
        }
        if (after.spiritAssistedDenial) {
          priority += 820 + after.spiritAssistedDenialValue * 140;
        }
        const afterSafety = ownDrainerSafetyScore(
          applied.game.board,
          perspective,
        );
        if (afterSafety > beforeSafety)
          priority += (afterSafety - beforeSafety) * 160;
        priority +=
          Math.max(BOARD_SIZE - locationDistance(destination, target), 0) * 20;
        result.push({
          family: TurnPlanFamily.SpiritImpact,
          action: {
            kind: "spirit-shift",
            actor: spirit,
            target,
            destination,
          },
          priority,
        });
      }
    }
  }
  result.sort((left, right) => {
    const order = compareNumber(right.priority, left.priority);
    return order !== 0 ? order : compareActionKeys(left.action, right.action);
  });
  return result.slice(0, 12);
}

function manaTempoSeeds(game: MonsGame, perspective: Color): ActionSeed[] {
  if (
    !game.playerCanMoveMana() ||
    findAwakeDrainerLocation(game.board, perspective) !== undefined
  ) {
    return [];
  }
  const result: ActionSeed[] = [];
  for (const [from, item] of game.board.occupied()) {
    if (
      item.kind !== "mana" ||
      item.mana.kind !== "regular" ||
      item.mana.color !== perspective
    ) {
      continue;
    }
    for (const to of nearbyLocations(from)) {
      if (!manaMoveDestinationAllowed(game.board, to)) continue;
      const ownGain =
        distanceToNearestPool(from, perspective) -
        distanceToNearestPool(to, perspective);
      const opponent = otherColor(perspective);
      const opponentGain =
        distanceToNearestPool(from, opponent) -
        distanceToNearestPool(to, opponent);
      if (ownGain <= 0 || opponentGain > 0) continue;
      result.push({
        family: TurnPlanFamily.ManaTempo,
        action: { kind: "move-mana", from, to },
        priority: 6_900 + ownGain * 200 - Math.max(opponentGain, 0) * 200,
      });
    }
  }
  return result;
}
