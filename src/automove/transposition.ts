import {
  ACTIONS_PER_TURN,
  MANA_MOVES_PER_TURN,
  MONS_MOVES_PER_TURN,
} from "../engine/board/config.js";
import { COLOR_COUNT, Z_SCALAR_HI, Z_SCALAR_LO, i32 } from "./board.js";
import type { FastPosition } from "./state.js";
import { rethrowFastWorkspaceAllocation } from "./allocation.js";

const DEFAULT_TRANSPOSITION_CAPACITY = 1 << 20;
const EMPTY_TT_ARRAY: Int32Array = new Int32Array(0);

function allocateTranspositionPart(length: number): Int32Array {
  try {
    return new Int32Array(length);
  } catch (error) {
    rethrowFastWorkspaceAllocation(error);
  }
}

export class TranspositionTable {
  public keyLo: Int32Array = EMPTY_TT_ARRAY;
  public keyHi: Int32Array = EMPTY_TT_ARRAY;
  public score: Int32Array = EMPTY_TT_ARRAY;
  public info: Int32Array = EMPTY_TT_ARRAY;
  public move: Int32Array = EMPTY_TT_ARRAY;
  public entries = 0;
  public generation = 1;
  public mask = 0;

  public deactivate(): void {
    this.mask = 0;
  }

  public prepare(checkTimeout: () => boolean): boolean {
    if (this.keyLo.length !== 0) {
      this.mask = DEFAULT_TRANSPOSITION_CAPACITY - 1;
      return true;
    }
    if (checkTimeout()) return false;
    const keyLo = allocateTranspositionPart(DEFAULT_TRANSPOSITION_CAPACITY);
    if (checkTimeout()) return false;
    const keyHi = allocateTranspositionPart(DEFAULT_TRANSPOSITION_CAPACITY);
    if (checkTimeout()) return false;
    const score = allocateTranspositionPart(DEFAULT_TRANSPOSITION_CAPACITY);
    if (checkTimeout()) return false;
    const info = allocateTranspositionPart(DEFAULT_TRANSPOSITION_CAPACITY);
    if (checkTimeout()) return false;
    const move = allocateTranspositionPart(DEFAULT_TRANSPOSITION_CAPACITY);
    if (checkTimeout()) return false;
    this.keyLo = keyLo;
    this.keyHi = keyHi;
    this.score = score;
    this.info = info;
    this.move = move;
    this.entries = 0;
    this.generation = 1;
    this.mask = DEFAULT_TRANSPOSITION_CAPACITY - 1;
    return true;
  }

  public clear(): void {
    this.keyLo.fill(0);
    this.keyHi.fill(0);
    this.score.fill(0);
    this.info.fill(0);
    this.move.fill(0);
    this.entries = 0;
    this.generation = 1;
  }
}

const ACTIVE_STATES = COLOR_COUNT;
const MONS_MOVE_STATES = MONS_MOVES_PER_TURN + 1;
const MANA_MOVE_STATES = MANA_MOVES_PER_TURN + 1;
const ACTION_STATES = ACTIONS_PER_TURN + 1;
const FIRST_TURN_STATES = 2;
const POTION_BUCKET_STATES = 4;
const SCALAR_STATE_COUNT =
  ACTIVE_STATES *
  MONS_MOVE_STATES *
  MANA_MOVE_STATES *
  ACTION_STATES *
  FIRST_TURN_STATES *
  POTION_BUCKET_STATES *
  POTION_BUCKET_STATES;

if (
  Z_SCALAR_LO.length !== Z_SCALAR_HI.length ||
  Z_SCALAR_LO.length < SCALAR_STATE_COUNT
) {
  throw new RangeError(
    "fast scalar hash table is too small for the configured state space",
  );
}

export function scalarIndex(position: FastPosition): number {
  const whitePotions = i32(position.potions, 0);
  const blackPotions = i32(position.potions, 1);
  const whitePotionBucket = whitePotions > 2 ? 3 : whitePotions;
  const blackPotionBucket = blackPotions > 2 ? 3 : blackPotions;
  let scalar = blackPotionBucket;
  scalar = whitePotionBucket + POTION_BUCKET_STATES * scalar;
  scalar = (position.firstTurn ? 1 : 0) + FIRST_TURN_STATES * scalar;
  scalar = position.actionsUsed + ACTION_STATES * scalar;
  scalar = position.manaMoves + MANA_MOVE_STATES * scalar;
  scalar = position.monsMoves + MONS_MOVE_STATES * scalar;
  return position.active + ACTIVE_STATES * scalar;
}

export function stateKeyLo(
  position: FastPosition,
  scalar: number,
  commutingMove = 0,
): number {
  return (
    position.hashLo ^
    i32(Z_SCALAR_LO, scalar) ^
    (position.whiteScore * 0x9e3779b1) ^
    (position.blackScore * 0x7f4a7c15) ^
    i32(position.potions, 0) ^
    Math.imul(commutingMove, 0x27d4eb2d)
  );
}

export function stateKeyHi(
  position: FastPosition,
  scalar: number,
  commutingMove = 0,
): number {
  return (
    position.hashHi ^
    i32(Z_SCALAR_HI, scalar) ^
    (position.whiteScore * 0x85ebca6b) ^
    (position.blackScore * 0xc2b2ae35) ^
    i32(position.potions, 1) ^
    Math.imul(commutingMove, 0x165667b1)
  );
}
