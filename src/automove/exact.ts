import {
  cacheWriteAllowed,
  checkpoint,
  checkpointWithReserve,
} from "./deadline.js";
import { Board } from "../engine/board.js";
import {
  Color,
  Consumable,
  MonKind,
  cloneItem,
  cloneMana,
  cloneMon,
  isMonFainted,
  itemConsumable,
  itemMana,
  itemMon,
  manaEquals,
  manaScore,
  monItem,
  monWithManaItem,
  otherColor,
  type Item,
  type Mana,
  type Mon,
  type Square,
} from "../engine/domain.js";
import {
  ACTIONS_PER_TURN,
  MONS_MOVES_PER_TURN,
  TARGET_SCORE,
  type GameVariant,
} from "../engine/config.js";
import { MonsGame } from "../engine/game.js";
import {
  BOARD_CELLS,
  bombReachableLocations,
  cloneLocation,
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
  mulU64,
  saturatingAddI32,
  saturatingSubI32,
  subI32,
  xorU64,
  type U64,
} from "../engine/numerics.js";
import {
  Hash64Set,
  Hash64Table,
  hash64,
  hash64Add,
  hash64FromIntegerNumber,
  hash64FromU32,
  hash64Mul,
  hash64RotateLeft,
  hash64ShiftRight,
  hash64Xor,
  type Hash64,
} from "./hash64.js";

const EXACT_ANALYSIS_CACHE_MAX_ENTRIES = 512;
const EXACT_ATTACK_REACH_CACHE_MAX_ENTRIES = 8_192;
const EXACT_CARRIER_STEPS_CACHE_MAX_ENTRIES = 8_192;
const EXACT_DRAINER_SAFETY_CACHE_MAX_ENTRIES = 8_192;
const EXACT_DRAINER_TO_MANA_CACHE_MAX_ENTRIES = 8_192;
const EXACT_PICKUP_PATH_CACHE_MAX_ENTRIES = 8_192;
const EXACT_WALK_THREAT_CACHE_MAX_ENTRIES = 8_192;
const EXACT_SECURE_MANA_CACHE_MAX_ENTRIES = 4_096;
const EXACT_SPIRIT_REACH_CACHE_MAX_ENTRIES = 4_096;
const EXACT_SPIRIT_SUMMARY_CACHE_MAX_ENTRIES = 2_048;
const EXACT_SPIRIT_UTILITY_CAP = 6;

const SEARCH_SEED = hash64(0x6a09_e667, 0xf3bc_c909);
const GOLDEN_ODD = hash64(0x9e37_79b1, 0x85eb_ca87);
const MIX_ODD = hash64(0x94d0_49bb, 0x1331_11eb);
const SPLITMIX_INCREMENT = hash64(0x9e37_79b9, 0x7f4a_7c15);
const SPLITMIX_FIRST = hash64(0xbf58_476d, 0x1ce4_e5b9);
const SPLITMIX_SECOND = hash64(0x94d0_49bb, 0x1331_11eb);
const FNV_OFFSET = 0xcbf2_9ce4_8422_2325n;
const FNV_PRIME = 0x0000_0100_0000_01b3n;

export type ExactScorePathWindow = {
  readonly bestSteps: number | undefined;
  readonly multiPressure: number;
};

export type ExactImmediateScoreWindow = {
  readonly bestScore: number;
  readonly multiPressure: number;
};

export type ExactDrainerPickupPath = {
  readonly pathSteps: number;
  readonly totalMoves: number;
  readonly manaValue: number;
  readonly mana: Mana;
};

export type ExactSpiritSummary = {
  readonly utility: number;
  readonly sameTurnScore: boolean;
  readonly sameTurnScoreValue: number;
  readonly sameTurnOpponentManaScore: boolean;
  readonly sameTurnOpponentManaScoreValue: number;
  readonly supermanaProgress: boolean;
  readonly opponentManaProgress: boolean;
  readonly nextTurnSetupGain: number;
};

export type ExactColorSummary = {
  readonly scorePathWindow: ExactScorePathWindow;
  readonly immediateWindow: ExactImmediateScoreWindow;
  readonly bestDrainerPickup: ExactDrainerPickupPath | undefined;
  readonly bestCarrierSteps: number | undefined;
  readonly bestDrainerToManaSteps: number | undefined;
  readonly spirit: ExactSpiritSummary;
};

export type ExactTurnSummary = {
  readonly canAttackOpponentDrainer: boolean;
  readonly safeSupermanaProgress: boolean;
  readonly safeSupermanaProgressSteps: number | undefined;
  readonly safeOpponentManaProgress: boolean;
  readonly safeOpponentManaProgressSteps: number | undefined;
  readonly spiritAssistedSupermanaProgress: boolean;
  readonly spiritAssistedOpponentManaProgress: boolean;
  readonly spiritAssistedScore: boolean;
  readonly spiritAssistedDenial: boolean;
  readonly sameTurnScoreWindowValue: number;
  readonly scorePathBestSteps: number | undefined;
};

export type ExactTurnTacticalProjection = {
  readonly safeSupermanaProgress: boolean;
  readonly safeSupermanaProgressSteps: number | undefined;
  readonly safeOpponentManaProgress: boolean;
  readonly safeOpponentManaProgressSteps: number | undefined;
  readonly spiritAssistedScore: boolean;
  readonly spiritAssistedScoreValue: number;
  readonly spiritAssistedDenial: boolean;
  readonly spiritAssistedDenialValue: number;
  readonly sameTurnScoreWindowValue: number;
};

export const EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS = 1 << 0;
export const EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS = 1 << 1;
export const EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE = 1 << 2;
export const EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL = 1 << 3;
export const EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW = 1 << 4;
const EXACT_TURN_TACTICAL_ALL_FLAGS =
  EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS |
  EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS |
  EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE |
  EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL |
  EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW;

export type ExactOpportunityBudget = {
  readonly remainingMonMoves: number;
  readonly canUseAction: boolean;
  readonly canMoveMana: boolean;
};

export type ExactOpportunityDelta = {
  readonly sameTurnScoreWindowValue: number;
  readonly spiritGain: number;
  readonly opponentWindowDenyGain: number;
  readonly drainerAttackAvailable: boolean;
  readonly drainerSafety: number;
  readonly safeSupermanaProgressSteps: number | undefined;
  readonly safeOpponentManaProgressSteps: number | undefined;
};

export type ExactOpportunityContext = {
  readonly budget: ExactOpportunityBudget;
  readonly turn: ExactTurnTacticalProjection;
  readonly delta: ExactOpportunityDelta;
  readonly opponentCanWinImmediately: boolean;
};

function defaultSpiritSummary(): ExactSpiritSummary {
  return {
    utility: 0,
    sameTurnScore: false,
    sameTurnScoreValue: 0,
    sameTurnOpponentManaScore: false,
    sameTurnOpponentManaScoreValue: 0,
    supermanaProgress: false,
    opponentManaProgress: false,
    nextTurnSetupGain: 0,
  };
}

export function defaultColorSummary(): ExactColorSummary {
  return {
    scorePathWindow: { bestSteps: undefined, multiPressure: 0 },
    immediateWindow: { bestScore: 0, multiPressure: 0 },
    bestDrainerPickup: undefined,
    bestCarrierSteps: undefined,
    bestDrainerToManaSteps: undefined,
    spirit: defaultSpiritSummary(),
  };
}

function defaultTurnSummary(): ExactTurnSummary {
  return {
    canAttackOpponentDrainer: false,
    safeSupermanaProgress: false,
    safeSupermanaProgressSteps: undefined,
    safeOpponentManaProgress: false,
    safeOpponentManaProgressSteps: undefined,
    spiritAssistedSupermanaProgress: false,
    spiritAssistedOpponentManaProgress: false,
    spiritAssistedScore: false,
    spiritAssistedDenial: false,
    sameTurnScoreWindowValue: 0,
    scorePathBestSteps: undefined,
  };
}

function defaultTurnTacticalProjection(): ExactTurnTacticalProjection {
  return {
    safeSupermanaProgress: false,
    safeSupermanaProgressSteps: undefined,
    safeOpponentManaProgress: false,
    safeOpponentManaProgressSteps: undefined,
    spiritAssistedScore: false,
    spiritAssistedScoreValue: 0,
    spiritAssistedDenial: false,
    spiritAssistedDenialValue: 0,
    sameTurnScoreWindowValue: 0,
  };
}

export function defaultOpportunityContext(): ExactOpportunityContext {
  return {
    budget: { remainingMonMoves: 0, canUseAction: false, canMoveMana: false },
    turn: defaultTurnTacticalProjection(),
    delta: {
      sameTurnScoreWindowValue: 0,
      spiritGain: 0,
      opponentWindowDenyGain: 0,
      drainerAttackAvailable: false,
      drainerSafety: 0,
      safeSupermanaProgressSteps: undefined,
      safeOpponentManaProgressSteps: undefined,
    },
    opponentCanWinImmediately: false,
  };
}

export class ExactStrategicAnalysis {
  public readonly white: ExactColorSummary;
  public readonly black: ExactColorSummary;

  public constructor(
    white: ExactColorSummary = defaultColorSummary(),
    black: ExactColorSummary = defaultColorSummary(),
  ) {
    this.white = white;
    this.black = black;
  }

  public colorSummary(color: Color): ExactColorSummary {
    return color === Color.White ? this.white : this.black;
  }
}

export class AttackReachSummary {
  readonly #actionThreatCounts: Uint8Array;
  readonly #bombThreatCounts: Uint8Array;
  readonly #guardedTargets: Uint8Array;

  public constructor() {
    this.#actionThreatCounts = new Uint8Array(BOARD_CELLS);
    this.#bombThreatCounts = new Uint8Array(BOARD_CELLS);
    this.#guardedTargets = new Uint8Array(BOARD_CELLS);
  }

  public canAttackTarget(target: Location): boolean {
    const slot = locationIndex(target);
    return (
      (this.#bombThreatCounts[slot] ?? 0) > 0 ||
      ((this.#guardedTargets[slot] ?? 0) === 0 &&
        (this.#actionThreatCounts[slot] ?? 0) > 0)
    );
  }

  public immediateThreats(target: Location): readonly [number, number] {
    const slot = locationIndex(target);
    return [
      this.#actionThreatCounts[slot] ?? 0,
      this.#bombThreatCounts[slot] ?? 0,
    ];
  }

  public markGuarded(target: Location, guarded: boolean): void {
    this.#guardedTargets[locationIndex(target)] = guarded ? 1 : 0;
  }

  public addActionThreat(target: Location): void {
    const slot = locationIndex(target);
    this.#actionThreatCounts[slot] = Math.min(
      0xff,
      (this.#actionThreatCounts[slot] ?? 0) + 1,
    );
  }

  public addBombThreat(target: Location): void {
    const slot = locationIndex(target);
    this.#bombThreatCounts[slot] = Math.min(
      0xff,
      (this.#bombThreatCounts[slot] ?? 0) + 1,
    );
  }
}

/** Rust ExactFastHasher byte order, retained for deterministic cache/hash fixtures. */
export function exactFnv1a64(bytes: Uint8Array, seed: U64 = 0n): U64 {
  let hash = seed === 0n ? FNV_OFFSET : seed;
  for (const byte of bytes) {
    hash = mulU64(xorU64(hash, BigInt(byte)), FNV_PRIME);
  }
  return hash;
}

function exactHashColorBits(color: Color): number {
  return color === Color.White ? 1 : 2;
}

function exactHashMonKindBits(kind: MonKind): number {
  return kind + 1;
}

function exactHashManaBits(mana: Mana): number {
  return mana.kind === "supermana"
    ? 2
    : 1 | (exactHashColorBits(mana.color) << 4);
}

function exactSearchHashManaBits(mana: Mana): number {
  return mana.kind === "supermana"
    ? 0x20
    : 0x10 | exactHashColorBits(mana.color);
}

function exactHashConsumableBits(consumable: Consumable): number {
  switch (consumable) {
    case Consumable.Bomb:
      return 1;
    case Consumable.Potion:
      return 2;
    case Consumable.BombOrPotion:
      return 3;
  }
}

function exactSearchHashConsumableBits(consumable: Consumable): number {
  switch (consumable) {
    case Consumable.Potion:
      return 1;
    case Consumable.Bomb:
      return 2;
    case Consumable.BombOrPotion:
      return 3;
  }
}

function exactHashMonBits(mon: Mon): number {
  return (
    (exactHashMonKindBits(mon.kind) |
      (exactHashColorBits(mon.color) << 4) |
      ((mon.cooldown & 0xff) << 8)) >>>
    0
  );
}

function exactHashItem(item: Item): Hash64 {
  let bits: number;
  switch (item.kind) {
    case "mon":
      bits = 0x100 | exactHashMonBits(item.mon);
      break;
    case "mana":
      bits = 0x200 | exactHashManaBits(item.mana);
      break;
    case "mon-with-mana":
      bits =
        0x300 |
        exactHashMonBits(item.mon) |
        (exactHashManaBits(item.mana) << 16);
      break;
    case "mon-with-consumable":
      bits =
        0x400 |
        exactHashMonBits(item.mon) |
        (exactHashConsumableBits(item.consumable) << 16);
      break;
    case "consumable":
      bits = 0x500 | exactHashConsumableBits(item.consumable);
      break;
  }
  return hash64FromU32(bits >>> 0);
}

function exactSearchHashItem(item: Item): Hash64 {
  let bits: number;
  switch (item.kind) {
    case "mon":
      bits = 0x100 | exactHashMonBits(item.mon);
      break;
    case "mana":
      bits = 0x200 | exactSearchHashManaBits(item.mana);
      break;
    case "mon-with-mana":
      bits =
        0x300 |
        exactHashMonBits(item.mon) |
        (exactSearchHashManaBits(item.mana) << 16);
      break;
    case "mon-with-consumable":
      bits =
        0x400 |
        exactHashMonBits(item.mon) |
        (exactSearchHashConsumableBits(item.consumable) << 16);
      break;
    case "consumable":
      bits = 0x500 | exactSearchHashConsumableBits(item.consumable);
      break;
  }
  return hash64FromU32(bits >>> 0);
}

function exactMixU64(value: Hash64): Hash64 {
  let mixed = value;
  mixed = hash64Xor(mixed, hash64ShiftRight(mixed, 30));
  mixed = hash64Mul(mixed, SPLITMIX_FIRST);
  mixed = hash64Xor(mixed, hash64ShiftRight(mixed, 27));
  mixed = hash64Mul(mixed, SPLITMIX_SECOND);
  return hash64Xor(mixed, hash64ShiftRight(mixed, 31));
}

function exactSearchMixU64(value: Hash64): Hash64 {
  let mixed = hash64Add(value, SPLITMIX_INCREMENT);
  mixed = hash64Mul(
    hash64Xor(mixed, hash64ShiftRight(mixed, 30)),
    SPLITMIX_FIRST,
  );
  mixed = hash64Mul(
    hash64Xor(mixed, hash64ShiftRight(mixed, 27)),
    SPLITMIX_SECOND,
  );
  return hash64Xor(mixed, hash64ShiftRight(mixed, 31));
}

function exactBoardEntryHash(index: number, item: Item): Hash64 {
  return exactMixU64(
    hash64Xor(
      hash64Mul(hash64FromU32(index + 1), GOLDEN_ODD),
      hash64Mul(exactHashItem(item), MIX_ODD),
    ),
  );
}

function exactBoardVariantHash(variant: GameVariant): Hash64 {
  return exactMixU64(
    hash64Add(
      hash64FromIntegerNumber(variant),
      hash64(0x243f_6a88, 0x85a3_08d3),
    ),
  );
}

export function exactBoardHash(board: Board): Hash64 {
  let state = hash64Xor(SEARCH_SEED, exactBoardVariantHash(board.variant()));
  for (const [location, item] of board.occupied()) {
    state = hash64Xor(
      state,
      exactBoardEntryHash(locationIndex(location), item),
    );
  }
  return state;
}

export function exactSearchStateHash(game: MonsGame): Hash64 {
  let state = SEARCH_SEED;
  for (const [location, item] of game.board.occupied()) {
    const entry = hash64Xor(
      hash64Mul(hash64FromU32(locationIndex(location) + 1), GOLDEN_ODD),
      exactSearchHashItem(item),
    );
    state = hash64Xor(state, exactSearchMixU64(entry));
    state = hash64Mul(hash64RotateLeft(state, 17), MIX_ODD);
  }

  const fields: readonly (readonly [Hash64, number])[] = [
    [hash64FromIntegerNumber(game.whiteScore), 0x11],
    [hash64FromIntegerNumber(game.blackScore), 0x23],
    [hash64FromU32(exactHashColorBits(game.activeColor)), 0x35],
    [hash64FromIntegerNumber(game.actionsUsedCount), 0x47],
    [hash64FromIntegerNumber(game.manaMovesCount), 0x59],
    [hash64FromIntegerNumber(game.monsMovesCount), 0x6b],
    [hash64FromIntegerNumber(game.whitePotionsCount), 0x7d],
    [hash64FromIntegerNumber(game.blackPotionsCount), 0x8f],
    [hash64FromIntegerNumber(game.turnNumber), 0xa1],
    [hash64FromIntegerNumber(game.variant()), 0xb3],
  ];
  for (const [value, salt] of fields) {
    state = hash64Xor(
      state,
      exactSearchMixU64(hash64Xor(value, hash64FromU32(salt))),
    );
  }
  return exactSearchMixU64(state);
}

type ExactActorPayload =
  | { readonly kind: "none" }
  | { readonly kind: "mana"; readonly mana: Mana }
  | { readonly kind: "bomb" };

type AttackQueueEntry = {
  readonly location: Location;
  readonly payload: ExactActorPayload;
  readonly steps: number;
};

const NO_PAYLOAD: ExactActorPayload = Object.freeze({ kind: "none" });
const BOMB_PAYLOAD: ExactActorPayload = Object.freeze({ kind: "bomb" });

const exactAttackReachCache = new Hash64Table<boolean>(
  EXACT_ATTACK_REACH_CACHE_MAX_ENTRIES,
);
const exactWalkThreatCache = new Hash64Table<boolean>(
  EXACT_WALK_THREAT_CACHE_MAX_ENTRIES,
);
const exactDrainerSafetyCache = new Hash64Table<number>(
  EXACT_DRAINER_SAFETY_CACHE_MAX_ENTRIES,
);
const exactCarrierStepsCache = new Hash64Table<number | undefined>(
  EXACT_CARRIER_STEPS_CACHE_MAX_ENTRIES,
);
const exactDrainerToManaCache = new Hash64Table<number | undefined>(
  EXACT_DRAINER_TO_MANA_CACHE_MAX_ENTRIES,
);
const exactPickupPathCache = new Hash64Table<
  ExactDrainerPickupPath | undefined
>(EXACT_PICKUP_PATH_CACHE_MAX_ENTRIES);
const exactStrategicAnalysisCache = new Hash64Table<ExactStrategicAnalysis>(
  EXACT_ANALYSIS_CACHE_MAX_ENTRIES,
);
const exactTurnSummaryCache = new Hash64Table<ExactTurnSummary>(
  EXACT_ANALYSIS_CACHE_MAX_ENTRIES,
);
const exactTurnTacticalProjectionCache =
  new Hash64Table<ExactTurnTacticalProjection>(
    EXACT_ANALYSIS_CACHE_MAX_ENTRIES,
  );
const exactSecureManaCache = new Hash64Table<number | undefined>(
  EXACT_SECURE_MANA_CACHE_MAX_ENTRIES,
);
const exactSpiritReachCache = new Hash64Table<
  readonly (readonly [Location, number])[]
>(EXACT_SPIRIT_REACH_CACHE_MAX_ENTRIES);
const exactSpiritTacticalSummaryCache = new Hash64Table<ExactSpiritSummary>(
  EXACT_SPIRIT_SUMMARY_CACHE_MAX_ENTRIES,
);

function colorKey(color: Color): number {
  return color === Color.White ? 0 : 1;
}

/** Pack up to six small signed fields exactly; callers bypass caching on overflow. */
function exactCacheTag(...values: readonly number[]): number | undefined {
  if (values.length > 6) return undefined;
  let tag = 0;
  let multiplier = 1;
  for (const raw of values) {
    if (!Number.isInteger(raw)) return undefined;
    const value = raw;
    if (value < -1 || value > 254) return undefined;
    tag += (value + 1) * multiplier;
    multiplier *= 256;
  }
  return Number.isSafeInteger(tag) ? tag : undefined;
}

function payloadSlot(payload: ExactActorPayload): number {
  switch (payload.kind) {
    case "none":
      return 0;
    case "bomb":
      return 1;
    case "mana":
      return payload.mana.kind === "supermana"
        ? 2
        : payload.mana.color === Color.White
          ? 3
          : 4;
  }
}

function payloadSeenSlot(
  location: Location,
  payload: ExactActorPayload,
): number {
  return locationIndex(location) * 5 + payloadSlot(payload);
}

function exactIsLocationGuardedByAngel(
  board: Board,
  color: Color,
  location: Location,
): boolean {
  const angel = board.findAwakeAngel(color);
  return angel !== undefined && locationDistance(angel, location) === 1;
}

function demonHasLineAttack(
  board: Board,
  source: Location,
  target: Location,
): boolean {
  const deltaI = Math.abs(source.i - target.i);
  const deltaJ = Math.abs(source.j - target.j);
  const middle = locationBetween(source, target);
  const middleSquare = board.square(middle);
  return (
    ((deltaI === 2 && deltaJ === 0) || (deltaI === 0 && deltaJ === 2)) &&
    board.item(middle) === undefined &&
    middleSquare.kind !== "supermana-base" &&
    middleSquare.kind !== "mon-base"
  );
}

function squareAllowsEmptyMon(
  square: Square,
  monKind: MonKind,
  color: Color,
): boolean {
  switch (square.kind) {
    case "regular":
    case "consumable-base":
    case "mana-base":
    case "mana-pool":
      return true;
    case "supermana-base":
      return monKind === MonKind.Drainer;
    case "mon-base":
      return square.monKind === monKind && square.color === color;
  }
}

function squareAllowsManaCarrier(square: Square, mana: Mana): boolean {
  switch (square.kind) {
    case "regular":
    case "consumable-base":
    case "mana-base":
    case "mana-pool":
      return true;
    case "supermana-base":
      return mana.kind === "supermana";
    case "mon-base":
      return false;
  }
}

function actorPayloadAfterMoveCompute(
  board: Board,
  monKind: MonKind,
  color: Color,
  payload: ExactActorPayload,
  destination: Location,
  allowPickBomb: boolean,
): ExactActorPayload | undefined {
  const item = board.item(destination);
  switch (payload.kind) {
    case "none": {
      if (item === undefined) {
        return squareAllowsEmptyMon(board.square(destination), monKind, color)
          ? NO_PAYLOAD
          : undefined;
      }
      switch (item.kind) {
        case "mon":
        case "mon-with-mana":
        case "mon-with-consumable":
          return undefined;
        case "mana":
          return monKind === MonKind.Drainer
            ? { kind: "mana", mana: cloneMana(item.mana) }
            : undefined;
        case "consumable":
          return item.consumable === Consumable.BombOrPotion
            ? allowPickBomb
              ? BOMB_PAYLOAD
              : NO_PAYLOAD
            : undefined;
      }
    }
    // eslint-disable-next-line no-fallthrough -- the nested exhaustive switch always returns.
    case "mana": {
      if (item === undefined) {
        return squareAllowsManaCarrier(board.square(destination), payload.mana)
          ? payload
          : undefined;
      }
      switch (item.kind) {
        case "mon":
        case "mon-with-mana":
        case "mon-with-consumable":
          return undefined;
        case "mana":
          return { kind: "mana", mana: cloneMana(item.mana) };
        case "consumable":
          return item.consumable === Consumable.BombOrPotion
            ? payload
            : undefined;
      }
    }
    // eslint-disable-next-line no-fallthrough -- the nested exhaustive switch always returns.
    case "bomb": {
      if (item === undefined) {
        switch (board.square(destination).kind) {
          case "regular":
          case "consumable-base":
          case "mana-base":
          case "mana-pool":
            return BOMB_PAYLOAD;
          case "supermana-base":
          case "mon-base":
            return undefined;
        }
      }
      if (
        item.kind === "consumable" &&
        item.consumable === Consumable.BombOrPotion
      ) {
        return BOMB_PAYLOAD;
      }
      return undefined;
    }
  }
}

function exactAttackPayloadAfterMove(
  board: Board,
  monKind: MonKind,
  color: Color,
  payload: ExactActorPayload,
  destination: Location,
  allowPickBomb: boolean,
): ExactActorPayload | undefined {
  if (payload.kind === "mana" || board.item(destination)?.kind === "mana") {
    return undefined;
  }
  return actorPayloadAfterMoveCompute(
    board,
    monKind,
    color,
    payload,
    destination,
    allowPickBomb,
  );
}

function exactAttackActionSourceAvailable(
  board: Board,
  currentLocation: Location,
  source: Location,
): boolean {
  return (
    board.square(source).kind !== "mon-base" &&
    (locationEquals(source, currentLocation) ||
      board.item(source) === undefined)
  );
}

function exactAttackActionStepsLowerBound(
  board: Board,
  monKind: MonKind,
  location: Location,
  target: Location,
): number | undefined {
  let sources: readonly Location[];
  switch (monKind) {
    case MonKind.Mystic:
      sources = mysticReachableLocations(target);
      break;
    case MonKind.Demon:
      sources = demonReachableLocations(target);
      break;
    case MonKind.Drainer:
    case MonKind.Angel:
    case MonKind.Spirit:
      return undefined;
  }
  let best: number | undefined;
  for (const source of sources) {
    if (!exactAttackActionSourceAvailable(board, location, source)) continue;
    if (
      monKind === MonKind.Demon &&
      board.item(locationBetween(source, target)) !== undefined
    ) {
      continue;
    }
    const distance = locationDistance(location, source);
    best = best === undefined ? distance : Math.min(best, distance);
  }
  return best;
}

function exactAttackRemainingStepsLowerBound(
  board: Board,
  target: Location,
  targetGuarded: boolean,
  bombPickupLocations: readonly Location[],
  location: Location,
  payload: ExactActorPayload,
  monKind: MonKind,
  allowPickBomb: boolean,
): number | undefined {
  if (payload.kind === "bomb") {
    return Math.max(locationDistance(location, target) - 3, 0);
  }
  if (payload.kind === "mana") return undefined;
  let best = targetGuarded
    ? undefined
    : exactAttackActionStepsLowerBound(board, monKind, location, target);
  if (allowPickBomb) {
    for (const bombLocation of bombPickupLocations) {
      const candidate = saturatingAddI32(
        locationDistance(location, bombLocation),
        Math.max(locationDistance(bombLocation, target) - 3, 0),
      );
      best = best === undefined ? candidate : Math.min(best, candidate);
    }
  }
  return best;
}

function bombPickupLocations(board: Board): Location[] {
  const result: Location[] = [];
  for (const [location, item] of board.occupied()) {
    if (
      item.kind === "consumable" &&
      item.consumable === Consumable.BombOrPotion
    ) {
      result.push(location);
    }
  }
  return result;
}

function exactAttackTargetPlausibleForAttacker(
  board: Board,
  target: Location,
  remainingMoves: number,
  targetGuarded: boolean,
  location: Location,
  item: Item,
  mon: Mon,
  bombs: readonly Location[],
): boolean {
  if (checkpoint()) return false;
  if (
    item.kind === "mon-with-consumable" &&
    item.consumable === Consumable.Bomb &&
    locationDistance(location, target) <= remainingMoves + 3
  ) {
    return true;
  }
  if (!targetGuarded) {
    const distance = exactAttackActionStepsLowerBound(
      board,
      mon.kind,
      location,
      target,
    );
    if (distance !== undefined && distance <= remainingMoves) return true;
  }
  if (item.kind === "mon-with-mana") return false;
  for (const bombLocation of bombs) {
    if (checkpoint()) return false;
    const toBomb = locationDistance(location, bombLocation);
    if (toBomb > remainingMoves) continue;
    if (locationDistance(bombLocation, target) <= remainingMoves - toBomb + 3) {
      return true;
    }
  }
  return false;
}

function exactAttackTargetPlausibleOnBoard(
  board: Board,
  attackerColor: Color,
  targetColor: Color,
  target: Location,
  remainingMoves: number,
  canUseAction: boolean,
): boolean {
  if (
    remainingMoves < 0 ||
    !canUseAction ||
    board.item(target) === undefined ||
    checkpoint()
  ) {
    return false;
  }
  const targetGuarded = exactIsLocationGuardedByAngel(
    board,
    targetColor,
    target,
  );
  const bombs = bombPickupLocations(board);
  for (const [location, item] of board.occupied()) {
    if (checkpoint()) return false;
    const mon = itemMon(item);
    if (mon?.color !== attackerColor || isMonFainted(mon)) {
      continue;
    }
    if (
      exactAttackTargetPlausibleForAttacker(
        board,
        target,
        remainingMoves,
        targetGuarded,
        location,
        item,
        mon,
        bombs,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function attackReachSummaryTargetLocations(
  board: Board,
  targetColor: Color,
): Location[] {
  const targets: Location[] = [];
  for (const [location, item] of board.occupied()) {
    if (itemMon(item)?.color === targetColor) targets.push(location);
  }
  return targets;
}

export function attackReachSummaryForTargetsWithHash(
  board: Board,
  _boardHash: Hash64,
  attackerColor: Color,
  remainingMoves: number,
  canUseAction: boolean,
  targets: readonly Location[],
): AttackReachSummary {
  const summary = new AttackReachSummary();
  if (
    remainingMoves < 0 ||
    !canUseAction ||
    targets.length === 0 ||
    checkpoint()
  ) {
    return summary;
  }
  for (const target of targets) {
    if (checkpoint()) return new AttackReachSummary();
    const targetItem = board.item(target);
    const targetMon =
      targetItem === undefined ? undefined : itemMon(targetItem);
    if (targetMon !== undefined) {
      summary.markGuarded(
        target,
        exactIsLocationGuardedByAngel(board, targetMon.color, target),
      );
    }
  }
  for (const [start, item] of board.occupied()) {
    if (checkpoint()) return new AttackReachSummary();
    const mon = itemMon(item);
    if (mon?.color !== attackerColor || isMonFainted(mon)) {
      continue;
    }
    const allowPickBomb = item.kind !== "mon-with-mana";
    const startPayload =
      item.kind === "mon-with-consumable" && item.consumable === Consumable.Bomb
        ? BOMB_PAYLOAD
        : NO_PAYLOAD;
    const queue: AttackQueueEntry[] = [
      { location: start, payload: startPayload, steps: 0 },
    ];
    const seen = new Uint8Array(BOARD_CELLS * 5);
    seen[payloadSeenSlot(start, startPayload)] = 1;
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      if (current === undefined) break;
      if (checkpoint()) return new AttackReachSummary();
      if (current.steps > remainingMoves) continue;
      if (current.payload.kind === "bomb") {
        for (const target of targets) {
          if (locationDistance(current.location, target) <= 3) {
            summary.addBombThreat(target);
          }
        }
      }
      if (board.square(current.location).kind !== "mon-base") {
        for (const target of targets) {
          if (
            mon.kind === MonKind.Mystic &&
            Math.abs(current.location.i - target.i) === 2 &&
            Math.abs(current.location.j - target.j) === 2
          ) {
            summary.addActionThreat(target);
          } else if (
            mon.kind === MonKind.Demon &&
            demonHasLineAttack(board, current.location, target)
          ) {
            summary.addActionThreat(target);
          }
        }
      }
      if (current.steps === remainingMoves) continue;
      for (const next of nearbyLocations(current.location)) {
        const nextPayload = exactAttackPayloadAfterMove(
          board,
          mon.kind,
          mon.color,
          current.payload,
          next,
          allowPickBomb,
        );
        if (nextPayload === undefined) continue;
        const seenSlot = payloadSeenSlot(next, nextPayload);
        if (seen[seenSlot] !== 0) continue;
        seen[seenSlot] = 1;
        queue.push({
          location: next,
          payload: nextPayload,
          steps: current.steps + 1,
        });
      }
    }
  }
  return checkpoint() ? new AttackReachSummary() : summary;
}

export function attackReachSummaryWithHash(
  board: Board,
  boardHash: Hash64,
  attackerColor: Color,
  targetColor: Color,
  remainingMoves: number,
  canUseAction: boolean,
): AttackReachSummary {
  return attackReachSummaryForTargetsWithHash(
    board,
    boardHash,
    attackerColor,
    remainingMoves,
    canUseAction,
    attackReachSummaryTargetLocations(board, targetColor),
  );
}

function canAttackTargetOnBoardUncached(
  board: Board,
  boardHash: Hash64,
  attackerColor: Color,
  targetColor: Color,
  target: Location,
  remainingMoves: number,
): boolean {
  if (checkpoint()) return false;
  const targetGuarded = exactIsLocationGuardedByAngel(
    board,
    targetColor,
    target,
  );
  const bombs = bombPickupLocations(board);
  for (const [start, item] of board.occupied()) {
    if (checkpoint()) return false;
    const mon = itemMon(item);
    if (
      mon?.color !== attackerColor ||
      isMonFainted(mon) ||
      !exactAttackTargetPlausibleForAttacker(
        board,
        target,
        remainingMoves,
        targetGuarded,
        start,
        item,
        mon,
        bombs,
      )
    ) {
      continue;
    }
    const allowPickBomb = item.kind !== "mon-with-mana";
    const startPayload =
      item.kind === "mon-with-consumable" && item.consumable === Consumable.Bomb
        ? BOMB_PAYLOAD
        : NO_PAYLOAD;
    const queue: AttackQueueEntry[] = [
      { location: start, payload: startPayload, steps: 0 },
    ];
    const seen = new Uint8Array(BOARD_CELLS * 5);
    seen[payloadSeenSlot(start, startPayload)] = 1;
    let cursor = 0;
    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      if (current === undefined || checkpoint()) return false;
      if (current.steps > remainingMoves) continue;
      if (
        current.payload.kind === "bomb" &&
        board.item(target) !== undefined &&
        locationDistance(current.location, target) <= 3
      ) {
        return true;
      }
      if (
        board.square(current.location).kind !== "mon-base" &&
        !targetGuarded
      ) {
        if (
          mon.kind === MonKind.Mystic &&
          Math.abs(current.location.i - target.i) === 2 &&
          Math.abs(current.location.j - target.j) === 2
        ) {
          return true;
        }
        if (
          mon.kind === MonKind.Demon &&
          demonHasLineAttack(board, current.location, target)
        ) {
          return true;
        }
      }
      if (current.steps === remainingMoves) continue;
      const lowerBound = exactAttackRemainingStepsLowerBound(
        board,
        target,
        targetGuarded,
        bombs,
        current.location,
        current.payload,
        mon.kind,
        allowPickBomb,
      );
      if (
        lowerBound !== undefined &&
        saturatingAddI32(current.steps, lowerBound) > remainingMoves
      ) {
        continue;
      }
      for (const next of nearbyLocations(current.location)) {
        const nextPayload = exactAttackPayloadAfterMove(
          board,
          mon.kind,
          mon.color,
          current.payload,
          next,
          allowPickBomb,
        );
        if (nextPayload === undefined) continue;
        const seenSlot = payloadSeenSlot(next, nextPayload);
        if (seen[seenSlot] !== 0) continue;
        seen[seenSlot] = 1;
        queue.push({
          location: next,
          payload: nextPayload,
          steps: current.steps + 1,
        });
      }
    }
  }
  void boardHash;
  return false;
}

export function canAttackTargetOnBoardWithHash(
  board: Board,
  boardHash: Hash64,
  attackerColor: Color,
  targetColor: Color,
  target: Location,
  remainingMoves: number,
  canUseAction: boolean,
): boolean {
  if (
    remainingMoves < 0 ||
    !canUseAction ||
    board.item(target) === undefined ||
    checkpoint()
  ) {
    return false;
  }
  const tag = exactCacheTag(
    colorKey(attackerColor),
    colorKey(targetColor),
    locationIndex(target),
    remainingMoves,
    1,
  );
  const cached =
    tag === undefined ? undefined : exactAttackReachCache.get(boardHash, tag);
  if (cached !== undefined) return cached;
  if (
    !exactAttackTargetPlausibleOnBoard(
      board,
      attackerColor,
      targetColor,
      target,
      remainingMoves,
      canUseAction,
    )
  ) {
    if (cacheWriteAllowed() && tag !== undefined) {
      exactAttackReachCache.set(boardHash, false, tag);
    }
    return false;
  }
  const result = canAttackTargetOnBoardUncached(
    board,
    boardHash,
    attackerColor,
    targetColor,
    target,
    remainingMoves,
  );
  if (!cacheWriteAllowed()) return false;
  if (tag !== undefined) exactAttackReachCache.set(boardHash, result, tag);
  return result;
}

export function canAttackTargetOnBoard(
  board: Board,
  attackerColor: Color,
  targetColor: Color,
  target: Location,
  remainingMoves: number,
  canUseAction: boolean,
): boolean {
  return canAttackTargetOnBoardWithHash(
    board,
    exactBoardHash(board),
    attackerColor,
    targetColor,
    target,
    remainingMoves,
    canUseAction,
  );
}

function shortestPayloadState(
  board: Board,
  start: Location,
  monKind: MonKind,
  color: Color,
  startPayload: ExactActorPayload,
  allowPickBomb: boolean,
  maxSteps: number | undefined,
  goal: (location: Location, payload: ExactActorPayload) => boolean,
): number | undefined {
  if (checkpoint()) return undefined;
  const queue: AttackQueueEntry[] = [
    { location: start, payload: startPayload, steps: 0 },
  ];
  const seen = new Uint8Array(BOARD_CELLS * 5);
  seen[payloadSeenSlot(start, startPayload)] = 1;
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (current === undefined || checkpoint()) return undefined;
    if (goal(current.location, current.payload)) return current.steps;
    if (maxSteps !== undefined && current.steps >= maxSteps) continue;
    for (const next of nearbyLocations(current.location)) {
      const nextPayload = actorPayloadAfterMoveCompute(
        board,
        monKind,
        color,
        current.payload,
        next,
        allowPickBomb,
      );
      if (nextPayload === undefined) continue;
      const slot = payloadSeenSlot(next, nextPayload);
      if (seen[slot] !== 0) continue;
      seen[slot] = 1;
      queue.push({
        location: next,
        payload: nextPayload,
        steps: current.steps + 1,
      });
    }
  }
  return undefined;
}

function exactCarrierStepsToAnyPoolWithHash(
  board: Board,
  start: Location,
  mana: Mana,
  boardHash: Hash64,
  maxSteps?: number,
): number | undefined {
  if (checkpoint() || (maxSteps !== undefined && maxSteps < 0)) {
    return undefined;
  }
  const tag = exactCacheTag(locationIndex(start), exactHashManaBits(mana));
  if (tag !== undefined && exactCarrierStepsCache.has(boardHash, tag)) {
    const cached = exactCarrierStepsCache.get(boardHash, tag);
    return maxSteps === undefined || cached === undefined || cached <= maxSteps
      ? cached
      : undefined;
  }
  const result = shortestPayloadState(
    board,
    start,
    MonKind.Drainer,
    Color.White,
    { kind: "mana", mana },
    false,
    maxSteps,
    (location, payload) =>
      payload.kind === "mana" && board.square(location).kind === "mana-pool",
  );
  if (!cacheWriteAllowed()) return undefined;
  if (tag !== undefined && (maxSteps === undefined || result !== undefined)) {
    exactCarrierStepsCache.set(boardHash, result, tag);
  }
  return result;
}

function exactDrainerToAnyManaSteps(
  board: Board,
  color: Color,
  start: Location,
): number | undefined {
  if (checkpoint()) return undefined;
  const boardHash = exactBoardHash(board);
  const tag = exactCacheTag(colorKey(color), locationIndex(start));
  if (tag !== undefined && exactDrainerToManaCache.has(boardHash, tag)) {
    return exactDrainerToManaCache.get(boardHash, tag);
  }
  const result = shortestPayloadState(
    board,
    start,
    MonKind.Drainer,
    color,
    NO_PAYLOAD,
    false,
    undefined,
    (_location, payload) => payload.kind === "mana",
  );
  if (!cacheWriteAllowed()) return undefined;
  if (tag !== undefined) exactDrainerToManaCache.set(boardHash, result, tag);
  return result;
}

function pickupPathBeats(
  candidate: ExactDrainerPickupPath,
  current: ExactDrainerPickupPath | undefined,
): boolean {
  if (current === undefined) return true;
  const candidateMetric = subI32(candidate.pathSteps * 3, candidate.manaValue);
  const currentMetric = subI32(current.pathSteps * 3, current.manaValue);
  return (
    candidateMetric < currentMetric ||
    (candidateMetric === currentMetric &&
      candidate.manaValue > current.manaValue)
  );
}

function exactBestDrainerPickupPathWithHash(
  board: Board,
  color: Color,
  start: Location,
  maxSteps: number | undefined,
  boardHash: Hash64,
): ExactDrainerPickupPath | undefined {
  if (checkpoint()) return undefined;
  const tag = exactCacheTag(
    colorKey(color),
    locationIndex(start),
    maxSteps ?? -1,
  );
  if (tag !== undefined && exactPickupPathCache.has(boardHash, tag)) {
    return exactPickupPathCache.get(boardHash, tag);
  }
  const queue: AttackQueueEntry[] = [
    { location: start, payload: NO_PAYLOAD, steps: 0 },
  ];
  const seen = new Uint8Array(BOARD_CELLS * 5);
  seen[payloadSeenSlot(start, NO_PAYLOAD)] = 1;
  let best: ExactDrainerPickupPath | undefined;
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (current === undefined || checkpoint()) return undefined;
    if (maxSteps !== undefined && current.steps > maxSteps) continue;
    if (
      current.payload.kind === "mana" &&
      board.square(current.location).kind === "mana-pool"
    ) {
      const candidate: ExactDrainerPickupPath = {
        pathSteps: Math.max(current.steps - 1, 0),
        totalMoves: current.steps,
        manaValue: manaScore(current.payload.mana, color),
        mana: cloneMana(current.payload.mana),
      };
      if (pickupPathBeats(candidate, best)) best = candidate;
    }
    if (maxSteps !== undefined && current.steps >= maxSteps) continue;
    for (const next of nearbyLocations(current.location)) {
      const nextPayload = actorPayloadAfterMoveCompute(
        board,
        MonKind.Drainer,
        color,
        current.payload,
        next,
        false,
      );
      if (nextPayload === undefined || nextPayload.kind === "bomb") continue;
      const slot = payloadSeenSlot(next, nextPayload);
      if (seen[slot] !== 0) continue;
      seen[slot] = 1;
      queue.push({
        location: next,
        payload: nextPayload,
        steps: current.steps + 1,
      });
    }
  }
  if (!cacheWriteAllowed()) return undefined;
  if (tag !== undefined) exactPickupPathCache.set(boardHash, best, tag);
  return best;
}

export function drainerImmediateThreatsWithHash(
  board: Board,
  color: Color,
  location: Location,
  _boardHash: Hash64,
): readonly [number, number] {
  void _boardHash;
  if (checkpoint()) return [1, 1];
  let actionThreats = 0;
  let bombThreats = 0;
  for (const threatLocation of mysticReachableLocations(location)) {
    if (checkpoint()) return [1, 1];
    const item = board.item(threatLocation);
    const mon = item === undefined ? undefined : itemMon(item);
    if (
      mon?.kind === MonKind.Mystic &&
      mon.color !== color &&
      !isMonFainted(mon) &&
      board.square(threatLocation).kind !== "mon-base"
    ) {
      actionThreats += 1;
    }
  }
  for (const threatLocation of demonReachableLocations(location)) {
    if (checkpoint()) return [1, 1];
    const item = board.item(threatLocation);
    const mon = item === undefined ? undefined : itemMon(item);
    if (
      mon?.kind === MonKind.Demon &&
      mon.color !== color &&
      !isMonFainted(mon) &&
      board.square(threatLocation).kind !== "mon-base" &&
      demonHasLineAttack(board, threatLocation, location)
    ) {
      actionThreats += 1;
    }
  }
  for (const threatLocation of bombReachableLocations(location)) {
    if (checkpoint()) return [1, 1];
    const item = board.item(threatLocation);
    if (
      item?.kind === "mon-with-consumable" &&
      item.consumable === Consumable.Bomb &&
      item.mon.color !== color &&
      !isMonFainted(item.mon) &&
      board.square(threatLocation).kind !== "mon-base"
    ) {
      bombThreats += 1;
    }
  }
  return checkpoint() ? [1, 1] : [actionThreats, bombThreats];
}

export function drainerImmediateThreats(
  board: Board,
  color: Color,
  location: Location,
): readonly [number, number] {
  return drainerImmediateThreatsWithHash(
    board,
    color,
    location,
    exactBoardHash(board),
  );
}

export function isDrainerUnderImmediateThreat(
  board: Board,
  color: Color,
  location: Location,
  angelNearby: boolean,
): boolean {
  if (checkpoint()) return true;
  const [actionThreats, bombThreats] = drainerImmediateThreats(
    board,
    color,
    location,
  );
  if (checkpoint()) return true;
  return angelNearby ? bombThreats > 0 : actionThreats + bombThreats > 0;
}

function isDrainerUnderWalkThreatUncached(
  board: Board,
  color: Color,
  location: Location,
  angelNearby: boolean,
): boolean {
  if (checkpoint()) return false;
  if (angelNearby) {
    for (const [threatLocation, item] of board.occupied()) {
      if (
        item.kind === "mon-with-consumable" &&
        item.consumable === Consumable.Bomb &&
        item.mon.color !== color &&
        !isMonFainted(item.mon) &&
        board.square(threatLocation).kind !== "mon-base" &&
        locationDistance(threatLocation, location) <= 4
      ) {
        return true;
      }
    }
    return false;
  }
  for (const [threatLocation, item] of board.occupied()) {
    if (checkpoint()) return false;
    const mon = itemMon(item);
    if (
      mon === undefined ||
      mon.color === color ||
      isMonFainted(mon) ||
      board.square(threatLocation).kind === "mon-base"
    ) {
      continue;
    }
    if (mon.kind === MonKind.Mystic || mon.kind === MonKind.Demon) {
      for (let deltaI = -1; deltaI <= 1; deltaI += 1) {
        for (let deltaJ = -1; deltaJ <= 1; deltaJ += 1) {
          if (deltaI === 0 && deltaJ === 0) continue;
          const neighbor = {
            i: threatLocation.i + deltaI,
            j: threatLocation.j + deltaJ,
          };
          if (
            neighbor.i < 0 ||
            neighbor.i > 10 ||
            neighbor.j < 0 ||
            neighbor.j > 10 ||
            board.item(neighbor) !== undefined
          ) {
            continue;
          }
          const square = board.square(neighbor);
          if (square.kind === "mon-base" || square.kind === "supermana-base") {
            continue;
          }
          if (
            mon.kind === MonKind.Mystic &&
            Math.abs(neighbor.i - location.i) === 2 &&
            Math.abs(neighbor.j - location.j) === 2
          ) {
            return true;
          }
          if (
            mon.kind === MonKind.Demon &&
            demonHasLineAttack(board, neighbor, location)
          ) {
            return true;
          }
        }
      }
    }
    if (
      item.kind === "mon-with-consumable" &&
      item.consumable === Consumable.Bomb &&
      locationDistance(threatLocation, location) <= 4
    ) {
      return true;
    }
  }
  return false;
}

export function isDrainerUnderWalkThreatWithHash(
  board: Board,
  boardHash: Hash64,
  color: Color,
  location: Location,
  angelNearby: boolean,
): boolean {
  if (checkpoint()) return true;
  const tag = exactCacheTag(
    colorKey(color),
    locationIndex(location),
    angelNearby ? 1 : 0,
  );
  const cached =
    tag === undefined ? undefined : exactWalkThreatCache.get(boardHash, tag);
  if (cached !== undefined) return cached || checkpoint();
  const result = isDrainerUnderWalkThreatUncached(
    board,
    color,
    location,
    angelNearby,
  );
  if (!cacheWriteAllowed()) return true;
  if (tag !== undefined) exactWalkThreatCache.set(boardHash, result, tag);
  return result;
}

export function isDrainerExactlySafeNextTurnOnBoardWithHash(
  board: Board,
  boardHash: Hash64,
  color: Color,
  location: Location,
): boolean {
  if (checkpoint()) return false;
  const angelNearby = exactIsLocationGuardedByAngel(board, color, location);
  const canAttack = canAttackTargetOnBoardWithHash(
    board,
    boardHash,
    otherColor(color),
    color,
    location,
    MONS_MOVES_PER_TURN,
    true,
  );
  if (checkpoint()) return false;
  return (
    !canAttack &&
    !isDrainerUnderWalkThreatWithHash(
      board,
      boardHash,
      color,
      location,
      angelNearby,
    ) &&
    !checkpoint()
  );
}

export function isDrainerExactlySafeNextTurnOnBoard(
  board: Board,
  color: Color,
  location: Location,
): boolean {
  return isDrainerExactlySafeNextTurnOnBoardWithHash(
    board,
    exactBoardHash(board),
    color,
    location,
  );
}

function findAwakeDrainer(board: Board, color: Color): Location | undefined {
  for (const [location, item] of board.occupied()) {
    const mon = itemMon(item);
    if (
      mon?.color === color &&
      mon.kind === MonKind.Drainer &&
      !isMonFainted(mon)
    ) {
      return location;
    }
  }
  return undefined;
}

export function exactOwnDrainerSafetyScoreWithHash(
  board: Board,
  boardHash: Hash64,
  color: Color,
): number {
  if (checkpoint()) return 0;
  const tag = exactCacheTag(colorKey(color));
  const cached =
    tag === undefined ? undefined : exactDrainerSafetyCache.get(boardHash, tag);
  if (cached !== undefined) return cached;
  const drainerLocation = findAwakeDrainer(board, color);
  let result = 0;
  if (drainerLocation !== undefined) {
    const angelNearby = exactIsLocationGuardedByAngel(
      board,
      color,
      drainerLocation,
    );
    const [actionThreats, bombThreats] = drainerImmediateThreatsWithHash(
      board,
      color,
      drainerLocation,
      boardHash,
    );
    const immediate = angelNearby
      ? bombThreats > 0
      : actionThreats + bombThreats > 0;
    const walk = isDrainerUnderWalkThreatWithHash(
      board,
      boardHash,
      color,
      drainerLocation,
      angelNearby,
    );
    const exactSafe = isDrainerExactlySafeNextTurnOnBoardWithHash(
      board,
      boardHash,
      color,
      drainerLocation,
    );
    result = exactSafe
      ? immediate || walk
        ? 1
        : 2
      : immediate || walk
        ? -2
        : -1;
  }
  if (!cacheWriteAllowed()) return 0;
  if (tag !== undefined) exactDrainerSafetyCache.set(boardHash, result, tag);
  return result;
}

type SecureManaStateKey = {
  readonly hash: Hash64;
  readonly whiteRegularManaCount: number;
  readonly blackRegularManaCount: number;
};

function secureManaStateKey(game: MonsGame): SecureManaStateKey {
  let whiteRegularManaCount = 0;
  let blackRegularManaCount = 0;
  for (const [, item] of game.board.occupied()) {
    if (item.kind !== "mana" || item.mana.kind !== "regular") continue;
    if (item.mana.color === Color.White) whiteRegularManaCount += 1;
    else blackRegularManaCount += 1;
  }
  return {
    hash: exactSearchStateHash(game),
    whiteRegularManaCount,
    blackRegularManaCount,
  };
}

function exactDistanceToWantedManaStepsLowerBound(
  board: Board,
  wanted: Mana,
  start: Location,
): number | undefined {
  let best: number | undefined;
  for (const [location, item] of board.occupied()) {
    if (item.kind !== "mana" || !manaEquals(item.mana, wanted)) continue;
    const distance = locationDistance(start, location);
    best = best === undefined ? distance : Math.min(best, distance);
  }
  return best;
}

function applySecureDrainerWalk(
  game: MonsGame,
  from: Location,
  to: Location,
):
  | { readonly after: MonsGame; readonly scoredMana: Mana | undefined }
  | undefined {
  if (checkpoint()) return undefined;
  const after = game.cloneForSimulation();
  const output = after.processInput(
    [
      { kind: "location", location: from },
      { kind: "location", location: to },
    ],
    false,
    false,
  );
  if (output.kind !== "events") return undefined;
  const scored = output.events.find((event) => event.kind === "mana-scored");
  return {
    after,
    scoredMana:
      scored?.kind === "mana-scored" ? cloneMana(scored.mana) : undefined,
  };
}

function secureSpecificManaQueryKey(
  game: MonsGame,
  color: Color,
  start: Location,
  wanted: Mana,
): { readonly hash: Hash64; readonly tag: number | undefined } {
  const state = secureManaStateKey(game);
  return {
    hash: state.hash,
    tag: exactCacheTag(
      state.whiteRegularManaCount,
      state.blackRegularManaCount,
      colorKey(color),
      exactHashManaBits(wanted),
      locationIndex(start),
    ),
  };
}

function secureSpecificManaStepsInGameUncached(
  game: MonsGame,
  color: Color,
  start: Location,
  wanted: Mana,
  visiting: Hash64Set,
): number | undefined {
  if (checkpoint()) return undefined;
  const startItem = game.board.item(start);
  const holdingWanted =
    startItem?.kind === "mon-with-mana" && manaEquals(startItem.mana, wanted);
  if (
    holdingWanted &&
    isDrainerExactlySafeNextTurnOnBoard(game.board, color, start)
  ) {
    return 0;
  }
  if (game.activeColor !== color || !game.playerCanMoveMon()) return undefined;
  const remainingMoves = Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0);
  if (!holdingWanted) {
    const lowerBound = exactDistanceToWantedManaStepsLowerBound(
      game.board,
      wanted,
      start,
    );
    if (lowerBound === undefined || lowerBound > remainingMoves) {
      return undefined;
    }
  }
  let best: number | undefined;
  for (const next of nearbyLocations(start)) {
    if (checkpoint()) return undefined;
    if (!holdingWanted) {
      const nextItem = game.board.item(next);
      const nextPicksWanted =
        nextItem?.kind === "mana" && manaEquals(nextItem.mana, wanted);
      if (!nextPicksWanted) {
        const lowerBound = exactDistanceToWantedManaStepsLowerBound(
          game.board,
          wanted,
          next,
        );
        if (lowerBound === undefined || lowerBound > remainingMoves - 1) {
          continue;
        }
      }
    }
    const transition = applySecureDrainerWalk(game, start, next);
    if (checkpoint()) return undefined;
    if (transition === undefined) continue;
    let candidate: number | undefined;
    if (
      transition.scoredMana !== undefined &&
      manaEquals(transition.scoredMana, wanted)
    ) {
      candidate = 1;
    } else {
      const nextStart = findAwakeDrainer(transition.after.board, color);
      if (nextStart === undefined) continue;
      const child = secureSpecificManaStepsInGame(
        transition.after,
        color,
        nextStart,
        wanted,
        visiting,
      );
      if (checkpoint()) return undefined;
      if (child !== undefined) {
        candidate = child + 1;
      }
    }
    if (candidate !== undefined && (best === undefined || candidate < best)) {
      best = candidate;
      if (candidate === 1) break;
    }
  }
  return best;
}

function secureSpecificManaStepsInGame(
  game: MonsGame,
  color: Color,
  start: Location,
  wanted: Mana,
  visiting: Hash64Set,
): number | undefined {
  if (checkpoint()) return undefined;
  const key = secureSpecificManaQueryKey(game, color, start, wanted);
  if (key.tag !== undefined && exactSecureManaCache.has(key.hash, key.tag)) {
    return exactSecureManaCache.get(key.hash, key.tag);
  }
  if (key.tag !== undefined && visiting.has(key.hash, key.tag)) {
    return undefined;
  }
  if (key.tag !== undefined) visiting.add(key.hash, key.tag);
  let result: number | undefined;
  try {
    result = secureSpecificManaStepsInGameUncached(
      game,
      color,
      start,
      wanted,
      visiting,
    );
  } finally {
    if (key.tag !== undefined) visiting.delete(key.hash, key.tag);
  }
  if (!cacheWriteAllowed()) return undefined;
  if (key.tag !== undefined) {
    exactSecureManaCache.set(key.hash, result, key.tag);
  }
  return result;
}

export function exactSecureSpecificManaStepsOnBoard(
  board: Board,
  color: Color,
  wanted: Mana,
  remainingMoves: number,
): number | undefined {
  if (remainingMoves < 0 || checkpoint()) return undefined;
  const drainerLocation = findAwakeDrainer(board, color);
  if (drainerLocation === undefined) return undefined;
  const startItem = board.item(drainerLocation);
  const holdingWanted =
    startItem?.kind === "mon-with-mana" && manaEquals(startItem.mana, wanted);
  if (!holdingWanted) {
    const lowerBound = exactDistanceToWantedManaStepsLowerBound(
      board,
      wanted,
      drainerLocation,
    );
    if (lowerBound === undefined || lowerBound > remainingMoves)
      return undefined;
  }
  const monsMovesCount = Math.max(
    0,
    Math.min(MONS_MOVES_PER_TURN, MONS_MOVES_PER_TURN - remainingMoves),
  );
  const simulation = MonsGame.newSimulationState({
    board: board.clone(),
    whiteScore: 0,
    blackScore: 0,
    activeColor: color,
    actionsUsedCount: ACTIONS_PER_TURN,
    manaMovesCount: 0,
    monsMovesCount,
    whitePotionsCount: 0,
    blackPotionsCount: 0,
    turnNumber: 2,
  });
  return secureSpecificManaStepsInGame(
    simulation,
    color,
    drainerLocation,
    wanted,
    new Hash64Set(EXACT_SECURE_MANA_CACHE_MAX_ENTRIES),
  );
}

export function exactSecureSpecificManaPathFrom(
  game: MonsGame,
  color: Color,
  start: Location,
  wanted: Mana,
): Location[] | undefined {
  if (checkpoint()) return undefined;
  let simulation = game.cloneForSimulation();
  let current = cloneLocation(start);
  let remaining = secureSpecificManaStepsInGame(
    simulation,
    color,
    current,
    wanted,
    new Hash64Set(EXACT_SECURE_MANA_CACHE_MAX_ENTRIES),
  );
  if (remaining === undefined || checkpoint()) return undefined;
  const path: Location[] = [];
  while (remaining > 0) {
    let chosen:
      | {
          readonly next: Location;
          readonly after: MonsGame;
          readonly steps: number;
        }
      | undefined;
    for (const next of nearbyLocations(current)) {
      if (checkpoint()) return undefined;
      const transition = applySecureDrainerWalk(simulation, current, next);
      if (checkpoint()) return undefined;
      if (transition === undefined) continue;
      if (
        remaining === 1 &&
        transition.scoredMana !== undefined &&
        manaEquals(transition.scoredMana, wanted)
      ) {
        chosen = { next, after: transition.after, steps: 0 };
        break;
      }
      const nextStart = findAwakeDrainer(transition.after.board, color);
      if (nextStart === undefined) continue;
      const child = secureSpecificManaStepsInGame(
        transition.after,
        color,
        nextStart,
        wanted,
        new Hash64Set(EXACT_SECURE_MANA_CACHE_MAX_ENTRIES),
      );
      if (checkpoint()) return undefined;
      if (child === remaining - 1) {
        chosen = { next, after: transition.after, steps: child };
        break;
      }
    }
    if (chosen === undefined) return undefined;
    path.push(cloneLocation(chosen.next));
    simulation = chosen.after;
    current = cloneLocation(chosen.next);
    remaining = chosen.steps;
  }
  return path;
}

export function exactBestScoreStepsOnBoard(
  board: Board,
  color: Color,
): number | undefined {
  if (checkpoint()) return undefined;
  const boardHash = exactBoardHash(board);
  let best: number | undefined;
  for (const [location, item] of board.occupied()) {
    if (checkpoint()) return undefined;
    const mon = itemMon(item);
    if (mon?.color !== color || isMonFainted(mon)) continue;
    let steps: number | undefined;
    if (item.kind === "mon-with-mana") {
      steps = exactCarrierStepsToAnyPoolWithHash(
        board,
        location,
        item.mana,
        boardHash,
      );
    } else if (
      (item.kind === "mon" || item.kind === "mon-with-consumable") &&
      mon.kind === MonKind.Drainer
    ) {
      steps = exactBestDrainerPickupPathWithHash(
        board,
        color,
        location,
        undefined,
        boardHash,
      )?.totalMoves;
    }
    if (steps !== undefined)
      best = best === undefined ? steps : Math.min(best, steps);
  }
  return checkpoint() ? undefined : best;
}

function exactBestImmediateScoreOnBoard(
  board: Board,
  color: Color,
  moveBudget: number,
): number {
  if (moveBudget < 0 || checkpoint()) return 0;
  const boardHash = exactBoardHash(board);
  let best = 0;
  for (const [location, item] of board.occupied()) {
    if (checkpoint()) return 0;
    const mon = itemMon(item);
    if (mon?.color !== color || isMonFainted(mon)) continue;
    if (item.kind === "mon-with-mana") {
      if (
        exactCarrierStepsToAnyPoolWithHash(
          board,
          location,
          item.mana,
          boardHash,
          moveBudget,
        ) !== undefined
      ) {
        best = Math.max(best, manaScore(item.mana, color));
      }
    } else if (
      (item.kind === "mon" || item.kind === "mon-with-consumable") &&
      mon.kind === MonKind.Drainer
    ) {
      const pickup = exactBestDrainerPickupPathWithHash(
        board,
        color,
        location,
        moveBudget,
        boardHash,
      );
      if (pickup !== undefined) best = Math.max(best, pickup.manaValue);
    }
    if (best >= 2) return best;
  }
  return best;
}

function reachableSpiritPositions(
  board: Board,
  start: Location,
  color: Color,
  remainingMonMoves: number,
): readonly (readonly [Location, number])[] {
  if (remainingMonMoves < 0 || checkpoint()) return [];
  const boardHash = exactBoardHash(board);
  const tag = exactCacheTag(
    locationIndex(start),
    colorKey(color),
    remainingMonMoves,
  );
  const cached =
    tag === undefined ? undefined : exactSpiritReachCache.get(boardHash, tag);
  if (cached !== undefined) return cached;
  const positions: (readonly [Location, number])[] = [];
  const queue: (readonly [Location, number])[] = [[start, 0]];
  const seen = new Uint8Array(BOARD_CELLS);
  seen[locationIndex(start)] = 1;
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (current === undefined || checkpoint()) return [];
    const [location, steps] = current;
    positions.push([location, steps]);
    if (steps >= remainingMonMoves) continue;
    for (const next of nearbyLocations(location)) {
      if (checkpoint()) return [];
      const index = locationIndex(next);
      if (seen[index] !== 0) continue;
      const item = board.item(next);
      const square = board.square(next);
      let passable = false;
      if (item === undefined) {
        passable =
          square.kind === "regular" ||
          square.kind === "consumable-base" ||
          square.kind === "mana-base" ||
          square.kind === "mana-pool" ||
          (square.kind === "mon-base" &&
            square.monKind === MonKind.Spirit &&
            square.color === color);
      } else {
        passable =
          item.kind === "consumable" &&
          item.consumable === Consumable.BombOrPotion;
      }
      if (!passable) continue;
      seen[index] = 1;
      queue.push([next, steps + 1]);
    }
  }
  if (!cacheWriteAllowed()) return [];
  const result = Object.freeze(
    positions.map(([at, steps]) => Object.freeze([at, steps] as const)),
  );
  if (tag !== undefined) exactSpiritReachCache.set(boardHash, result, tag);
  return result;
}

function spiritTargetAllowed(item: Item): boolean {
  const mon = itemMon(item);
  return mon === undefined || !isMonFainted(mon);
}

function spiritDestinationAllowed(
  board: Board,
  targetItem: Item,
  destination: Location,
): boolean {
  const destinationItem = board.item(destination);
  const targetMon = itemMon(targetItem);
  const targetMana = itemMana(targetItem);
  let validDestination: boolean;
  if (destinationItem === undefined) {
    validDestination = true;
  } else {
    switch (destinationItem.kind) {
      case "mon":
        if (targetItem.kind === "mana") {
          validDestination =
            destinationItem.mon.kind === MonKind.Drainer &&
            !isMonFainted(destinationItem.mon);
        } else if (targetItem.kind === "consumable") {
          validDestination = targetItem.consumable === Consumable.BombOrPotion;
        } else {
          validDestination = false;
        }
        break;
      case "mana":
        validDestination =
          targetMon?.kind === MonKind.Drainer && !isMonFainted(targetMon);
        break;
      case "mon-with-mana":
      case "mon-with-consumable":
        validDestination =
          targetItem.kind === "consumable" &&
          targetItem.consumable === Consumable.BombOrPotion;
        break;
      case "consumable":
        validDestination =
          destinationItem.consumable === Consumable.BombOrPotion &&
          (targetItem.kind === "mon" ||
            targetItem.kind === "mon-with-mana" ||
            targetItem.kind === "mon-with-consumable");
        break;
    }
  }
  if (!validDestination) return false;
  const square = board.square(destination);
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

function exactPassiveSpiritSummary(
  board: Board,
  color: Color,
  remainingMonMoves: number,
  canUseAction: boolean,
): ExactSpiritSummary {
  if (remainingMonMoves < 0 || !canUseAction || checkpoint()) {
    return defaultSpiritSummary();
  }
  let best = defaultSpiritSummary();
  for (const [location, item] of board.occupied()) {
    if (checkpoint()) return defaultSpiritSummary();
    const mon = itemMon(item);
    if (
      mon?.color !== color ||
      mon.kind !== MonKind.Spirit ||
      isMonFainted(mon)
    ) {
      continue;
    }
    for (const [spiritPosition] of reachableSpiritPositions(
      board,
      location,
      color,
      remainingMonMoves,
    )) {
      if (checkpoint()) return defaultSpiritSummary();
      if (board.square(spiritPosition).kind === "mon-base") continue;
      let reachableTargets = 0;
      let setupGain = 0;
      let supermanaProgress = false;
      let opponentManaProgress = false;
      for (const target of spiritReachableLocations(spiritPosition)) {
        const targetItem = board.item(target);
        if (
          targetItem === undefined ||
          !spiritTargetAllowed(targetItem) ||
          !nearbyLocations(target).some((destination) =>
            spiritDestinationAllowed(board, targetItem, destination),
          )
        ) {
          continue;
        }
        reachableTargets += 1;
        if (targetItem.kind === "mana") {
          if (targetItem.mana.kind === "supermana") {
            supermanaProgress = true;
            setupGain = Math.max(setupGain, 2);
          } else if (targetItem.mana.color === otherColor(color)) {
            opponentManaProgress = true;
            setupGain = Math.max(setupGain, 2);
          }
        } else {
          const targetMon = itemMon(targetItem);
          if (
            targetMon?.color === color &&
            targetMon.kind === MonKind.Drainer &&
            !isMonFainted(targetMon)
          ) {
            setupGain = Math.max(setupGain, 2);
          } else if (
            targetMon !== undefined &&
            targetMon.color !== color &&
            !isMonFainted(targetMon)
          ) {
            setupGain = Math.max(setupGain, 1);
          }
        }
      }
      const utility = Math.max(
        Math.min(reachableTargets, EXACT_SPIRIT_UTILITY_CAP),
        Math.min(1 + setupGain, EXACT_SPIRIT_UTILITY_CAP),
      );
      best = {
        ...best,
        utility: Math.max(best.utility, utility),
        nextTurnSetupGain:
          utility > best.utility
            ? setupGain
            : utility === best.utility
              ? Math.max(best.nextTurnSetupGain, setupGain)
              : best.nextTurnSetupGain,
        supermanaProgress: best.supermanaProgress || supermanaProgress,
        opponentManaProgress: best.opponentManaProgress || opponentManaProgress,
      };
    }
  }
  return checkpoint() ? defaultSpiritSummary() : best;
}

type ImmediateTacticalWindow = {
  readonly bestScore: number;
  readonly bestOpponentManaScore: number;
};

function exactDrainerImmediateTacticalWindow(
  board: Board,
  color: Color,
  start: Location,
  moveBudget: number,
  minScore: number,
  needScore: boolean,
  needDenial: boolean,
): ImmediateTacticalWindow {
  if ((!needScore && !needDenial) || checkpoint()) {
    return { bestScore: 0, bestOpponentManaScore: 0 };
  }
  const maxScore = needScore ? manaScore({ kind: "supermana" }, color) : 0;
  const maxOpponentManaScore = needDenial
    ? manaScore({ kind: "regular", color: otherColor(color) }, color)
    : 0;
  const queue: AttackQueueEntry[] = [
    { location: start, payload: NO_PAYLOAD, steps: 0 },
  ];
  const seen = new Uint8Array(BOARD_CELLS * 5);
  seen[payloadSeenSlot(start, NO_PAYLOAD)] = 1;
  let bestScore = 0;
  let bestOpponentManaScore = 0;
  let cursor = 0;
  while (cursor < queue.length) {
    const current = queue[cursor];
    cursor += 1;
    if (current === undefined || checkpoint()) {
      return { bestScore: 0, bestOpponentManaScore: 0 };
    }
    if (
      current.payload.kind === "mana" &&
      board.square(current.location).kind === "mana-pool"
    ) {
      const score = manaScore(current.payload.mana, color);
      if (needScore && score >= minScore) {
        bestScore = Math.max(bestScore, score);
      }
      if (
        needDenial &&
        current.payload.mana.kind === "regular" &&
        current.payload.mana.color === otherColor(color)
      ) {
        bestOpponentManaScore = Math.max(bestOpponentManaScore, score);
      }
      if (
        (!needScore || bestScore >= maxScore) &&
        (!needDenial || bestOpponentManaScore >= maxOpponentManaScore)
      ) {
        return { bestScore, bestOpponentManaScore };
      }
    }
    if (current.steps >= moveBudget) continue;
    for (const next of nearbyLocations(current.location)) {
      if (checkpoint()) {
        return { bestScore: 0, bestOpponentManaScore: 0 };
      }
      const payload = actorPayloadAfterMoveCompute(
        board,
        MonKind.Drainer,
        color,
        current.payload,
        next,
        false,
      );
      if (payload === undefined || payload.kind === "bomb") continue;
      const slot = payloadSeenSlot(next, payload);
      if (seen[slot] !== 0) continue;
      seen[slot] = 1;
      queue.push({ location: next, payload, steps: current.steps + 1 });
    }
  }
  return { bestScore, bestOpponentManaScore };
}

function exactBestImmediateTacticalWindow(
  board: Board,
  color: Color,
  moveBudget: number,
  needScore: boolean,
  needDenial: boolean,
  minScore = 1,
): ImmediateTacticalWindow {
  if (moveBudget < 0 || (!needScore && !needDenial) || checkpoint()) {
    return { bestScore: 0, bestOpponentManaScore: 0 };
  }
  const scoreFloor = needScore ? Math.max(minScore, 1) : 0;
  const opponentMana = { kind: "regular", color: otherColor(color) } as const;
  const maxScore = needScore ? manaScore({ kind: "supermana" }, color) : 0;
  const maxOpponentManaScore = needDenial ? manaScore(opponentMana, color) : 0;
  const boardHash = exactBoardHash(board);
  let bestScore = 0;
  let bestOpponentManaScore = 0;
  for (const [location, item] of board.occupied()) {
    if (checkpoint()) return { bestScore: 0, bestOpponentManaScore: 0 };
    const mon = itemMon(item);
    if (mon?.color !== color || isMonFainted(mon)) continue;
    if (item.kind === "mon-with-mana") {
      const score = manaScore(item.mana, color);
      const relevantForScore = needScore && score >= scoreFloor;
      const relevantForDenial =
        needDenial && manaEquals(item.mana, opponentMana);
      if (!relevantForScore && !relevantForDenial) continue;
      const steps = exactCarrierStepsToAnyPoolWithHash(
        board,
        location,
        item.mana,
        boardHash,
        moveBudget,
      );
      if (checkpoint()) return { bestScore: 0, bestOpponentManaScore: 0 };
      if (steps === undefined) continue;
      if (relevantForScore) bestScore = Math.max(bestScore, score);
      if (relevantForDenial) {
        bestOpponentManaScore = Math.max(bestOpponentManaScore, score);
      }
    } else if (
      mon.kind === MonKind.Drainer &&
      (item.kind === "mon" || item.kind === "mon-with-consumable")
    ) {
      const window = exactDrainerImmediateTacticalWindow(
        board,
        color,
        location,
        moveBudget,
        scoreFloor,
        needScore,
        needDenial,
      );
      if (checkpoint()) return { bestScore: 0, bestOpponentManaScore: 0 };
      if (needScore) bestScore = Math.max(bestScore, window.bestScore);
      if (needDenial) {
        bestOpponentManaScore = Math.max(
          bestOpponentManaScore,
          window.bestOpponentManaScore,
        );
      }
    }
    if (
      (!needScore || bestScore >= maxScore) &&
      (!needDenial || bestOpponentManaScore >= maxOpponentManaScore)
    ) {
      return { bestScore, bestOpponentManaScore };
    }
  }
  return checkpoint()
    ? { bestScore: 0, bestOpponentManaScore: 0 }
    : { bestScore, bestOpponentManaScore };
}

type SpiritPreviewUndo = {
  readonly from: Location;
  readonly fromItem: Item | undefined;
  readonly to: Location;
  readonly toItem: Item | undefined;
};

function applySpiritMovePreviewInPlace(
  board: Board,
  from: Location,
  targetItem: Item,
  to: Location,
  perspective: Color,
): {
  readonly undo: SpiritPreviewUndo;
  readonly scoreDelta: number;
  readonly opponentManaScoreDelta: number;
} {
  const fromItem = board.item(from);
  const destinationItem = board.item(to);
  const undo: SpiritPreviewUndo = {
    from: cloneLocation(from),
    fromItem: fromItem === undefined ? undefined : cloneItem(fromItem),
    to: cloneLocation(to),
    toItem:
      destinationItem === undefined ? undefined : cloneItem(destinationItem),
  };
  const destinationSquare = board.square(to);
  board.removeItem(from);
  let placedItem = cloneItem(targetItem);
  if (targetItem.kind === "mon" && destinationItem?.kind === "mana") {
    placedItem = monWithManaItem(targetItem.mon, destinationItem.mana);
  } else if (targetItem.kind === "mana" && destinationItem?.kind === "mon") {
    placedItem = monWithManaItem(destinationItem.mon, targetItem.mana);
  } else if (
    targetItem.kind === "mon-with-mana" &&
    destinationItem?.kind === "mana"
  ) {
    board.put({ kind: "mana", mana: cloneMana(targetItem.mana) }, from);
    placedItem = monWithManaItem(targetItem.mon, destinationItem.mana);
  } else if (
    targetItem.kind === "consumable" &&
    destinationItem?.kind === "mon"
  ) {
    placedItem = monItem(destinationItem.mon);
  } else if (
    targetItem.kind === "mon" &&
    destinationItem?.kind === "consumable"
  ) {
    placedItem = monItem(targetItem.mon);
  } else if (
    targetItem.kind === "mon-with-mana" &&
    destinationItem?.kind === "consumable"
  ) {
    placedItem = monWithManaItem(targetItem.mon, targetItem.mana);
  } else if (
    targetItem.kind === "mon-with-consumable" &&
    destinationItem?.kind === "consumable"
  ) {
    placedItem = {
      kind: "mon-with-consumable",
      mon: cloneMon(targetItem.mon),
      consumable: Consumable.Bomb,
    };
  }
  let scoreDelta = 0;
  let opponentManaScoreDelta = 0;
  const placedMana = itemMana(placedItem);
  if (destinationSquare.kind === "mana-pool" && placedMana !== undefined) {
    scoreDelta = manaScore(placedMana, perspective);
    if (
      placedMana.kind === "regular" &&
      placedMana.color === otherColor(perspective)
    ) {
      opponentManaScoreDelta = scoreDelta;
    }
    const placedMon = itemMon(placedItem);
    if (placedMon === undefined) {
      board.removeItem(to);
      return { undo, scoreDelta, opponentManaScoreDelta };
    }
    placedItem = monItem(placedMon);
  }
  board.put(placedItem, to);
  return { undo, scoreDelta, opponentManaScoreDelta };
}

function undoSpiritMovePreview(board: Board, undo: SpiritPreviewUndo): void {
  if (undo.fromItem === undefined) board.removeItem(undo.from);
  else board.put(undo.fromItem, undo.from);
  if (undo.toItem === undefined) board.removeItem(undo.to);
  else board.put(undo.toItem, undo.to);
}

const EXACT_TACTICAL_SPIRIT_NEED_SCORE = 1 << 0;
const EXACT_TACTICAL_SPIRIT_NEED_DENIAL = 1 << 1;
const EXACT_TACTICAL_SPIRIT_NEED_PROGRESS = 1 << 2;
const EXACT_TACTICAL_SPIRIT_ALL_FIELDS =
  EXACT_TACTICAL_SPIRIT_NEED_SCORE |
  EXACT_TACTICAL_SPIRIT_NEED_DENIAL |
  EXACT_TACTICAL_SPIRIT_NEED_PROGRESS;

function tacticalSpiritSummaryForFields(
  summary: ExactSpiritSummary,
  fields: number,
): ExactSpiritSummary {
  const needScore = (fields & EXACT_TACTICAL_SPIRIT_NEED_SCORE) !== 0;
  const needDenial = (fields & EXACT_TACTICAL_SPIRIT_NEED_DENIAL) !== 0;
  const needProgress = (fields & EXACT_TACTICAL_SPIRIT_NEED_PROGRESS) !== 0;
  return {
    ...defaultSpiritSummary(),
    sameTurnScore: needScore && summary.sameTurnScore,
    sameTurnScoreValue: needScore ? summary.sameTurnScoreValue : 0,
    sameTurnOpponentManaScore: needDenial && summary.sameTurnOpponentManaScore,
    sameTurnOpponentManaScoreValue: needDenial
      ? summary.sameTurnOpponentManaScoreValue
      : 0,
    supermanaProgress: needProgress && summary.supermanaProgress,
    opponentManaProgress: needProgress && summary.opponentManaProgress,
  };
}

function exactTacticalSpiritSummary(
  board: Board,
  color: Color,
  remainingMonMoves: number,
  canUseAction: boolean,
  fields: number,
): ExactSpiritSummary {
  fields &= EXACT_TACTICAL_SPIRIT_ALL_FIELDS;
  if (remainingMonMoves < 0 || fields === 0 || !canUseAction || checkpoint()) {
    return defaultSpiritSummary();
  }
  const boardHash = exactBoardHash(board);
  const cacheTag = exactCacheTag(
    colorKey(color),
    remainingMonMoves,
    Number(canUseAction),
    fields,
  );
  const cached =
    cacheTag === undefined
      ? undefined
      : exactSpiritTacticalSummaryCache.get(boardHash, cacheTag);
  if (cached !== undefined) return cached;
  for (
    let supersetFields = 1;
    supersetFields <= EXACT_TACTICAL_SPIRIT_ALL_FIELDS;
    supersetFields += 1
  ) {
    if (supersetFields === fields || (supersetFields & fields) !== fields) {
      continue;
    }
    const supersetTag = exactCacheTag(
      colorKey(color),
      remainingMonMoves,
      Number(canUseAction),
      supersetFields,
    );
    const superset =
      supersetTag === undefined
        ? undefined
        : exactSpiritTacticalSummaryCache.get(boardHash, supersetTag);
    if (superset === undefined) continue;
    const derived = tacticalSpiritSummaryForFields(superset, fields);
    if (!cacheWriteAllowed()) return defaultSpiritSummary();
    if (cacheTag !== undefined) {
      exactSpiritTacticalSummaryCache.set(boardHash, derived, cacheTag);
    }
    return derived;
  }
  const result = exactTacticalSpiritSummaryUncached(
    board,
    color,
    remainingMonMoves,
    canUseAction,
    fields,
  );
  if (!cacheWriteAllowed()) return defaultSpiritSummary();
  if (cacheTag !== undefined) {
    exactSpiritTacticalSummaryCache.set(boardHash, result, cacheTag);
  }
  return result;
}

function exactTacticalSpiritSummaryUncached(
  board: Board,
  color: Color,
  remainingMonMoves: number,
  canUseAction: boolean,
  fields: number,
): ExactSpiritSummary {
  if (!canUseAction || checkpoint()) return defaultSpiritSummary();
  const needScore = (fields & EXACT_TACTICAL_SPIRIT_NEED_SCORE) !== 0;
  const needDenial = (fields & EXACT_TACTICAL_SPIRIT_NEED_DENIAL) !== 0;
  const needProgress = (fields & EXACT_TACTICAL_SPIRIT_NEED_PROGRESS) !== 0;
  const before = exactBestImmediateTacticalWindow(
    board,
    color,
    remainingMonMoves,
    needScore,
    needDenial,
  );
  if (checkpoint()) return defaultSpiritSummary();
  const maxSameTurnScore = needScore
    ? manaScore({ kind: "supermana" }, color)
    : 0;
  const maxSameTurnOpponentScore = needDenial
    ? manaScore({ kind: "regular", color: otherColor(color) }, color)
    : 0;
  let best = defaultSpiritSummary();
  const afterWindowCache = new Hash64Table<ImmediateTacticalWindow>(
    EXACT_SPIRIT_SUMMARY_CACHE_MAX_ENTRIES,
  );
  for (const [location, spiritItem] of board.occupied()) {
    if (checkpoint()) return defaultSpiritSummary();
    const spirit = itemMon(spiritItem);
    if (
      spirit?.color !== color ||
      spirit.kind !== MonKind.Spirit ||
      isMonFainted(spirit)
    ) {
      continue;
    }
    for (const [spiritPosition, spiritSteps] of reachableSpiritPositions(
      board,
      location,
      color,
      remainingMonMoves,
    )) {
      if (checkpoint()) return defaultSpiritSummary();
      if (board.square(spiritPosition).kind === "mon-base") continue;
      const actionBoard = board.clone();
      if (!locationEquals(spiritPosition, location)) {
        actionBoard.removeItem(location);
        actionBoard.put(spiritItem, spiritPosition);
      }
      const remainingAfterAction = saturatingSubI32(
        remainingMonMoves,
        spiritSteps,
      );
      for (const target of spiritReachableLocations(spiritPosition)) {
        if (checkpoint()) return defaultSpiritSummary();
        const targetItem = actionBoard.item(target);
        if (targetItem === undefined || !spiritTargetAllowed(targetItem))
          continue;
        for (const destination of nearbyLocations(target)) {
          if (checkpoint()) return defaultSpiritSummary();
          if (!spiritDestinationAllowed(actionBoard, targetItem, destination)) {
            continue;
          }
          const preview = applySpiritMovePreviewInPlace(
            actionBoard,
            target,
            targetItem,
            destination,
            color,
          );
          try {
            if (checkpoint()) return defaultSpiritSummary();
            const scoreFloor = Math.max(
              best.sameTurnScoreValue,
              before.bestScore,
              preview.scoreDelta,
            );
            const denialFloor = Math.max(
              best.sameTurnOpponentManaScoreValue,
              before.bestOpponentManaScore,
              preview.opponentManaScoreDelta,
            );
            const needAfterScore = needScore && scoreFloor < maxSameTurnScore;
            const needAfterDenial =
              needDenial && denialFloor < maxSameTurnOpponentScore;
            let after: ImmediateTacticalWindow = {
              bestScore: 0,
              bestOpponentManaScore: 0,
            };
            if (needAfterScore || needAfterDenial) {
              const minScore = needAfterScore ? scoreFloor + 1 : 1;
              const afterHash = exactBoardHash(actionBoard);
              const afterTag = exactCacheTag(
                colorKey(color),
                remainingAfterAction,
                minScore,
                Number(needAfterScore),
                Number(needAfterDenial),
              );
              const cachedAfter =
                afterTag === undefined
                  ? undefined
                  : afterWindowCache.get(afterHash, afterTag);
              if (cachedAfter !== undefined) {
                after = cachedAfter;
              } else {
                after = exactBestImmediateTacticalWindow(
                  actionBoard,
                  color,
                  remainingAfterAction,
                  needAfterScore,
                  needAfterDenial,
                  minScore,
                );
                if (checkpoint()) return defaultSpiritSummary();
                if (afterTag !== undefined) {
                  afterWindowCache.set(afterHash, after, afterTag);
                }
              }
            }
            if (checkpoint()) return defaultSpiritSummary();
            const afterScore = Math.max(preview.scoreDelta, after.bestScore);
            const afterDenial = Math.max(
              preview.opponentManaScoreDelta,
              after.bestOpponentManaScore,
            );
            if (
              needScore &&
              (preview.scoreDelta > 0 || afterScore > before.bestScore)
            ) {
              best = {
                ...best,
                sameTurnScore: true,
                sameTurnScoreValue: Math.max(
                  best.sameTurnScoreValue,
                  afterScore,
                ),
              };
            }
            if (
              needDenial &&
              (preview.opponentManaScoreDelta > 0 ||
                afterDenial > before.bestOpponentManaScore)
            ) {
              best = {
                ...best,
                sameTurnOpponentManaScore: true,
                sameTurnOpponentManaScoreValue: Math.max(
                  best.sameTurnOpponentManaScoreValue,
                  afterDenial,
                ),
              };
            }
            if (needProgress && !best.supermanaProgress) {
              const movedSupermana =
                targetItem.kind === "mana" &&
                targetItem.mana.kind === "supermana" &&
                preview.scoreDelta > 0;
              let hasSupermanaProgress = movedSupermana;
              if (!hasSupermanaProgress) {
                hasSupermanaProgress =
                  exactSecureSpecificManaStepsOnBoard(
                    actionBoard,
                    color,
                    { kind: "supermana" },
                    remainingAfterAction,
                  ) !== undefined;
                if (checkpoint()) return defaultSpiritSummary();
              }
              if (hasSupermanaProgress) {
                best = { ...best, supermanaProgress: true };
              }
            }
            if (needProgress && !best.opponentManaProgress) {
              let hasOpponentManaProgress = preview.opponentManaScoreDelta > 0;
              if (!hasOpponentManaProgress) {
                hasOpponentManaProgress =
                  exactSecureSpecificManaStepsOnBoard(
                    actionBoard,
                    color,
                    { kind: "regular", color: otherColor(color) },
                    remainingAfterAction,
                  ) !== undefined;
                if (checkpoint()) return defaultSpiritSummary();
              }
              if (hasOpponentManaProgress) {
                best = { ...best, opponentManaProgress: true };
              }
            }
            if (checkpoint()) return defaultSpiritSummary();
            if (
              (!needScore || best.sameTurnScoreValue >= maxSameTurnScore) &&
              (!needDenial ||
                best.sameTurnOpponentManaScoreValue >=
                  maxSameTurnOpponentScore) &&
              (!needProgress ||
                (best.supermanaProgress && best.opponentManaProgress))
            ) {
              return best;
            }
          } finally {
            undoSpiritMovePreview(actionBoard, preview.undo);
          }
        }
      }
    }
  }
  return checkpoint() ? defaultSpiritSummary() : best;
}

function multiPressureFromSteps(steps: readonly number[]): number {
  const second = steps[1];
  const third = steps[2];
  return (
    (second === undefined ? 0 : Math.trunc(70 / Math.max(second, 1))) +
    (third === undefined ? 0 : Math.trunc(40 / Math.max(third, 1)))
  );
}

function multiPressureFromScores(scores: readonly number[]): number {
  return (scores[1] ?? 0) * 70 + (scores[2] ?? 0) * 35;
}

function buildColorSummary(game: MonsGame, color: Color): ExactColorSummary {
  if (checkpointWithReserve(20)) return defaultColorSummary();
  const fullTurnMoves =
    game.activeColor === color
      ? Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0)
      : MONS_MOVES_PER_TURN;
  const canUseAction =
    game.activeColor === color ? game.playerCanUseAction() : true;
  const boardHash = exactBoardHash(game.board);
  const carrierSteps: number[] = [];
  let bestCarrierSteps: number | undefined;
  for (const [location, item] of game.board.occupied()) {
    if (checkpoint()) return defaultColorSummary();
    if (
      item.kind !== "mon-with-mana" ||
      item.mon.color !== color ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    const steps = exactCarrierStepsToAnyPoolWithHash(
      game.board,
      location,
      item.mana,
      boardHash,
    );
    if (steps !== undefined) {
      bestCarrierSteps =
        bestCarrierSteps === undefined
          ? steps
          : Math.min(bestCarrierSteps, steps);
      carrierSteps.push(steps);
    }
  }
  const drainer = findAwakeDrainer(game.board, color);
  const bestDrainerPickup =
    drainer === undefined
      ? undefined
      : exactBestDrainerPickupPathWithHash(
          game.board,
          color,
          drainer,
          undefined,
          boardHash,
        );
  if (checkpointWithReserve(20)) return defaultColorSummary();
  const bestDrainerToManaSteps =
    drainer === undefined
      ? undefined
      : exactDrainerToAnyManaSteps(game.board, color, drainer);
  if (bestDrainerPickup !== undefined) {
    carrierSteps.push(bestDrainerPickup.totalMoves);
  }
  carrierSteps.sort((left, right) => left - right);
  const uniqueCarrierSteps = carrierSteps.filter(
    (value, index) => index === 0 || carrierSteps[index - 1] !== value,
  );
  const immediateScores: number[] = [];
  for (const [location, item] of game.board.occupied()) {
    if (checkpoint()) return defaultColorSummary();
    if (
      item.kind !== "mon-with-mana" ||
      item.mon.color !== color ||
      isMonFainted(item.mon)
    ) {
      continue;
    }
    const steps = exactCarrierStepsToAnyPoolWithHash(
      game.board,
      location,
      item.mana,
      boardHash,
      fullTurnMoves,
    );
    if (steps !== undefined && steps <= fullTurnMoves) {
      immediateScores.push(manaScore(item.mana, color));
    }
  }
  if (
    bestDrainerPickup !== undefined &&
    bestDrainerPickup.totalMoves <= fullTurnMoves
  ) {
    immediateScores.push(bestDrainerPickup.manaValue);
  }
  const spirit = exactPassiveSpiritSummary(
    game.board,
    color,
    fullTurnMoves,
    canUseAction,
  );
  if (checkpointWithReserve(20)) return defaultColorSummary();
  immediateScores.sort((left, right) => right - left);
  return {
    scorePathWindow: {
      bestSteps: uniqueCarrierSteps[0],
      multiPressure: multiPressureFromSteps(uniqueCarrierSteps),
    },
    immediateWindow: {
      bestScore: immediateScores[0] ?? 0,
      multiPressure: multiPressureFromScores(immediateScores),
    },
    bestDrainerPickup,
    bestCarrierSteps,
    bestDrainerToManaSteps,
    spirit,
  };
}

function buildExactStrategicAnalysis(game: MonsGame): ExactStrategicAnalysis {
  if (checkpointWithReserve(20)) return new ExactStrategicAnalysis();
  const white = buildColorSummary(game, Color.White);
  if (checkpointWithReserve(20)) return new ExactStrategicAnalysis();
  const black = buildColorSummary(game, Color.Black);
  return checkpointWithReserve(20)
    ? new ExactStrategicAnalysis()
    : new ExactStrategicAnalysis(white, black);
}

export function exactStrategicAnalysisWithSearchHash(
  game: MonsGame,
  key: Hash64,
): ExactStrategicAnalysis {
  if (checkpointWithReserve(20)) return new ExactStrategicAnalysis();
  const cached = exactStrategicAnalysisCache.get(key);
  if (cached !== undefined) return cached;
  const built = buildExactStrategicAnalysis(game);
  if (!cacheWriteAllowed()) return new ExactStrategicAnalysis();
  exactStrategicAnalysisCache.set(key, built);
  return built;
}

export function exactStrategicAnalysis(game: MonsGame): ExactStrategicAnalysis {
  return exactStrategicAnalysisWithSearchHash(game, exactSearchStateHash(game));
}

export type ExactTurnProjectionFlags = number;

function exactSecureSpecificManaStepsThisTurn(
  game: MonsGame,
  color: Color,
  wanted: Mana,
): number | undefined {
  const remainingMoves =
    game.activeColor === color
      ? Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0)
      : MONS_MOVES_PER_TURN;
  return exactSecureSpecificManaStepsOnBoard(
    game.board,
    color,
    wanted,
    remainingMoves,
  );
}

function canAttackOpponentDrainerExactWithHash(
  game: MonsGame,
  color: Color,
  boardHash: Hash64,
): boolean {
  const target = findAwakeDrainer(game.board, otherColor(color));
  if (target === undefined) return false;
  return canAttackTargetOnBoardWithHash(
    game.board,
    boardHash,
    color,
    otherColor(color),
    target,
    game.activeColor === color
      ? Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0)
      : MONS_MOVES_PER_TURN,
    game.activeColor === color ? game.playerCanUseAction() : true,
  );
}

function turnTacticalProjectionForFlags(
  projection: ExactTurnTacticalProjection,
  flags: number,
): ExactTurnTacticalProjection {
  const needSupermana =
    (flags & EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS) !== 0;
  const needOpponentMana =
    (flags & EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS) !== 0;
  const needSpiritScore = (flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE) !== 0;
  const needSpiritDenial =
    (flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL) !== 0;
  const needScoreWindow = (flags & EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW) !== 0;
  const includeScoreWindowDenial =
    needScoreWindow && (needOpponentMana || needSpiritDenial);
  const includeSpiritScore = needSpiritScore || needScoreWindow;
  const includeSpiritDenial = needSpiritDenial || includeScoreWindowDenial;
  const safeSupermanaProgressSteps = needSupermana
    ? projection.safeSupermanaProgressSteps
    : undefined;
  const safeOpponentManaProgressSteps = needOpponentMana
    ? projection.safeOpponentManaProgressSteps
    : undefined;
  const spiritAssistedDenial =
    includeSpiritDenial && projection.spiritAssistedDenial;
  return {
    safeSupermanaProgress: safeSupermanaProgressSteps !== undefined,
    safeSupermanaProgressSteps,
    safeOpponentManaProgress:
      safeOpponentManaProgressSteps !== undefined || spiritAssistedDenial,
    safeOpponentManaProgressSteps,
    spiritAssistedScore: includeSpiritScore && projection.spiritAssistedScore,
    spiritAssistedScoreValue: includeSpiritScore
      ? projection.spiritAssistedScoreValue
      : 0,
    spiritAssistedDenial,
    spiritAssistedDenialValue: includeSpiritDenial
      ? projection.spiritAssistedDenialValue
      : 0,
    sameTurnScoreWindowValue: needScoreWindow
      ? projection.sameTurnScoreWindowValue
      : 0,
  };
}

function buildExactTurnTacticalProjection(
  game: MonsGame,
  flags: number,
): ExactTurnTacticalProjection {
  if (checkpointWithReserve(20)) return defaultTurnTacticalProjection();
  const color = game.activeColor;
  const remainingMoves = Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0);
  const needSupermana =
    (flags & EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS) !== 0;
  const needOpponentMana =
    (flags & EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS) !== 0;
  const needSpiritScore = (flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE) !== 0;
  const needSpiritDenial =
    (flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL) !== 0;
  const needScoreWindow = (flags & EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW) !== 0;
  const includeScoreWindowDenial =
    needScoreWindow && (needOpponentMana || needSpiritDenial);
  let spiritFields = 0;
  if (needSpiritScore || needScoreWindow) {
    spiritFields |= EXACT_TACTICAL_SPIRIT_NEED_SCORE;
  }
  if (needSpiritDenial || includeScoreWindowDenial) {
    spiritFields |= EXACT_TACTICAL_SPIRIT_NEED_DENIAL;
  }
  const tacticalSpirit =
    spiritFields === 0
      ? defaultSpiritSummary()
      : exactTacticalSpiritSummary(
          game.board,
          color,
          remainingMoves,
          game.playerCanUseAction(),
          spiritFields,
        );
  if (checkpointWithReserve(20)) return defaultTurnTacticalProjection();
  const safeSupermanaProgressSteps = needSupermana
    ? exactSecureSpecificManaStepsThisTurn(game, color, { kind: "supermana" })
    : undefined;
  if (checkpointWithReserve(20)) return defaultTurnTacticalProjection();
  const safeOpponentManaProgressSteps = needOpponentMana
    ? exactSecureSpecificManaStepsThisTurn(game, color, {
        kind: "regular",
        color: otherColor(color),
      })
    : undefined;
  if (checkpointWithReserve(20)) return defaultTurnTacticalProjection();
  const sameTurnScoreWindowValue = needScoreWindow
    ? Math.max(
        exactBestImmediateScoreOnBoard(game.board, color, remainingMoves),
        tacticalSpirit.sameTurnScoreValue,
        includeScoreWindowDenial
          ? tacticalSpirit.sameTurnOpponentManaScoreValue
          : 0,
      )
    : 0;
  return checkpointWithReserve(20)
    ? defaultTurnTacticalProjection()
    : {
        safeSupermanaProgress: safeSupermanaProgressSteps !== undefined,
        safeSupermanaProgressSteps,
        safeOpponentManaProgress:
          safeOpponentManaProgressSteps !== undefined ||
          tacticalSpirit.sameTurnOpponentManaScore,
        safeOpponentManaProgressSteps,
        spiritAssistedScore: tacticalSpirit.sameTurnScore,
        spiritAssistedScoreValue: tacticalSpirit.sameTurnScoreValue,
        spiritAssistedDenial: tacticalSpirit.sameTurnOpponentManaScore,
        spiritAssistedDenialValue:
          tacticalSpirit.sameTurnOpponentManaScoreValue,
        sameTurnScoreWindowValue,
      };
}

export function exactTurnTacticalProjectionWithSearchHash(
  game: MonsGame,
  color: Color,
  key: Hash64,
  flags: ExactTurnProjectionFlags,
): ExactTurnTacticalProjection {
  if (flags === 0 || game.activeColor !== color || checkpointWithReserve(20)) {
    return defaultTurnTacticalProjection();
  }
  const remainingMoves = Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0);
  const cacheTag = exactCacheTag(
    colorKey(color),
    remainingMoves,
    game.playerCanUseAction() ? 1 : 0,
    flags,
  );
  const cached =
    cacheTag === undefined
      ? undefined
      : exactTurnTacticalProjectionCache.get(key, cacheTag);
  if (cached !== undefined) return cached;
  for (
    let supersetFlags = 1;
    supersetFlags <= EXACT_TURN_TACTICAL_ALL_FLAGS;
    supersetFlags += 1
  ) {
    if (supersetFlags === flags || (supersetFlags & flags) !== flags) {
      continue;
    }
    const supersetTag = exactCacheTag(
      colorKey(color),
      remainingMoves,
      game.playerCanUseAction() ? 1 : 0,
      supersetFlags,
    );
    const superset =
      supersetTag === undefined
        ? undefined
        : exactTurnTacticalProjectionCache.get(key, supersetTag);
    if (superset !== undefined) {
      const derived = turnTacticalProjectionForFlags(superset, flags);
      if (!cacheWriteAllowed()) return defaultTurnTacticalProjection();
      if (cacheTag !== undefined) {
        exactTurnTacticalProjectionCache.set(key, derived, cacheTag);
      }
      return derived;
    }
  }
  const built = buildExactTurnTacticalProjection(game, flags);
  if (!cacheWriteAllowed()) return defaultTurnTacticalProjection();
  if (cacheTag !== undefined) {
    exactTurnTacticalProjectionCache.set(key, built, cacheTag);
  }
  return built;
}

export function exactSameTurnScoreWindowWithSearchHash(
  game: MonsGame,
  color: Color,
  key: Hash64,
): number {
  return exactTurnTacticalProjectionWithSearchHash(
    game,
    color,
    key,
    EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
  ).sameTurnScoreWindowValue;
}

function buildExactTurnSummary(game: MonsGame): ExactTurnSummary {
  if (checkpointWithReserve(20)) return defaultTurnSummary();
  const color = game.activeColor;
  const remainingMoves = Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0);
  const tacticalSpirit = exactTacticalSpiritSummary(
    game.board,
    color,
    remainingMoves,
    game.playerCanUseAction(),
    EXACT_TACTICAL_SPIRIT_NEED_SCORE |
      EXACT_TACTICAL_SPIRIT_NEED_DENIAL |
      EXACT_TACTICAL_SPIRIT_NEED_PROGRESS,
  );
  if (checkpointWithReserve(20)) return defaultTurnSummary();
  const safeSupermanaProgressSteps = exactSecureSpecificManaStepsThisTurn(
    game,
    color,
    { kind: "supermana" },
  );
  if (checkpointWithReserve(20)) return defaultTurnSummary();
  const safeOpponentManaProgressSteps = exactSecureSpecificManaStepsThisTurn(
    game,
    color,
    { kind: "regular", color: otherColor(color) },
  );
  if (checkpointWithReserve(20)) return defaultTurnSummary();
  const sameTurnScoreWindowValue = Math.max(
    exactBestImmediateScoreOnBoard(game.board, color, remainingMoves),
    tacticalSpirit.sameTurnScoreValue,
    tacticalSpirit.sameTurnOpponentManaScoreValue,
  );
  const boardHash = exactBoardHash(game.board);
  const summary: ExactTurnSummary = {
    canAttackOpponentDrainer: canAttackOpponentDrainerExactWithHash(
      game,
      color,
      boardHash,
    ),
    safeSupermanaProgress: safeSupermanaProgressSteps !== undefined,
    safeSupermanaProgressSteps,
    safeOpponentManaProgress:
      safeOpponentManaProgressSteps !== undefined ||
      tacticalSpirit.sameTurnOpponentManaScore,
    safeOpponentManaProgressSteps,
    spiritAssistedSupermanaProgress: tacticalSpirit.supermanaProgress,
    spiritAssistedOpponentManaProgress: tacticalSpirit.opponentManaProgress,
    spiritAssistedScore: tacticalSpirit.sameTurnScore,
    spiritAssistedDenial: tacticalSpirit.sameTurnOpponentManaScore,
    sameTurnScoreWindowValue,
    scorePathBestSteps: exactBestScoreStepsOnBoard(game.board, color),
  };
  return checkpointWithReserve(20) ? defaultTurnSummary() : summary;
}

export function exactTurnSummaryWithSearchHash(
  game: MonsGame,
  color: Color,
  key: Hash64,
): ExactTurnSummary {
  if (game.activeColor !== color || checkpointWithReserve(20)) {
    return defaultTurnSummary();
  }
  const cached = exactTurnSummaryCache.get(key);
  if (cached !== undefined) return cached;
  const built = buildExactTurnSummary(game);
  if (!cacheWriteAllowed()) return defaultTurnSummary();
  exactTurnSummaryCache.set(key, built);
  return built;
}

export function exactTurnSummary(
  game: MonsGame,
  color: Color,
): ExactTurnSummary {
  return exactTurnSummaryWithSearchHash(
    game,
    color,
    exactSearchStateHash(game),
  );
}

export function canAttackOpponentDrainerThisTurn(
  game: MonsGame,
  color: Color,
): boolean {
  return exactTurnSummary(game, color).canAttackOpponentDrainer;
}

export function exactOpportunityContextWithSearchHash(
  game: MonsGame,
  color: Color,
  key: Hash64,
): ExactOpportunityContext {
  if (game.activeColor !== color || checkpointWithReserve(20)) {
    return defaultOpportunityContext();
  }
  const budget: ExactOpportunityBudget = {
    remainingMonMoves: Math.max(MONS_MOVES_PER_TURN - game.monsMovesCount, 0),
    canUseAction: game.playerCanUseAction(),
    canMoveMana: game.playerCanMoveMana(),
  };
  const boardHash = exactBoardHash(game.board);
  const turn = exactTurnTacticalProjectionWithSearchHash(
    game,
    color,
    key,
    EXACT_TURN_TACTICAL_ALL_FLAGS,
  );
  if (checkpointWithReserve(20)) return defaultOpportunityContext();
  const drainerSafety = exactOwnDrainerSafetyScoreWithHash(
    game.board,
    boardHash,
    color,
  );
  if (checkpointWithReserve(20)) return defaultOpportunityContext();
  const opponent = otherColor(color);
  const opponentScore =
    opponent === Color.White ? game.whiteScore : game.blackScore;
  const opponentNeeded = Math.max(TARGET_SCORE - opponentScore, 0);
  const opponentImmediate = exactStrategicAnalysisWithSearchHash(
    game,
    key,
  ).colorSummary(opponent).immediateWindow.bestScore;
  if (checkpointWithReserve(20)) return defaultOpportunityContext();
  const opponentCanWinImmediately =
    opponentNeeded > 0 && opponentImmediate >= opponentNeeded;
  const opponentWindowDenyGain =
    opponentNeeded > 0 && turn.sameTurnScoreWindowValue > 0
      ? Math.min(turn.sameTurnScoreWindowValue, opponentNeeded)
      : 0;
  const context: ExactOpportunityContext = {
    budget,
    turn,
    delta: {
      sameTurnScoreWindowValue: turn.sameTurnScoreWindowValue,
      spiritGain: Math.max(
        turn.spiritAssistedScoreValue,
        turn.spiritAssistedDenialValue,
      ),
      opponentWindowDenyGain,
      drainerAttackAvailable: canAttackOpponentDrainerExactWithHash(
        game,
        color,
        boardHash,
      ),
      drainerSafety,
      safeSupermanaProgressSteps: turn.safeSupermanaProgressSteps,
      safeOpponentManaProgressSteps: turn.safeOpponentManaProgressSteps,
    },
    opponentCanWinImmediately,
  };
  return checkpointWithReserve(20) ? defaultOpportunityContext() : context;
}

export function exactOpportunityContext(
  game: MonsGame,
  color: Color,
): ExactOpportunityContext {
  return exactOpportunityContextWithSearchHash(
    game,
    color,
    exactSearchStateHash(game),
  );
}

export function clearExactStateAnalysisCache(): void {
  exactAttackReachCache.clear();
  exactWalkThreatCache.clear();
  exactDrainerSafetyCache.clear();
  exactCarrierStepsCache.clear();
  exactDrainerToManaCache.clear();
  exactPickupPathCache.clear();
  exactStrategicAnalysisCache.clear();
  exactTurnSummaryCache.clear();
  exactTurnTacticalProjectionCache.clear();
  exactSecureManaCache.clear();
  exactSpiritReachCache.clear();
  exactSpiritTacticalSummaryCache.clear();
}
