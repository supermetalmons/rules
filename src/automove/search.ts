import { BOARD_CELLS } from "../engine/board/geometry.js";
import { COLOR_COUNT, at, i32 } from "./board.js";
import { WIN_VALUE, evaluateWithTables } from "./evaluation.js";
import {
  DEFAULT_EVAL_TABLES,
  DEFAULT_WEIGHTS,
  NORMAL_WEIGHTS,
  memoizedEvalTables,
  memoizedNormalizedEvalWeights,
  type EvalTables,
  type EvalWeights,
} from "./evaluation-weights.js";
import { MAX_MOVES, generateMoves } from "./moves.js";
import {
  FastPosition,
  FAST_MOVE_UNREPRESENTABLE,
  MOVE_MON,
  applyFastMove,
  moveFrom,
  moveTo,
  moveType,
  positionWinner,
  sameSquares,
} from "./state.js";
import {
  DEFAULT_TUNING,
  MAX_NONTERMINAL_SCORE,
  MAX_PLY,
  memoizedSearchLimits,
  type NormalizedSearchTuning,
  type SearchLimits,
} from "./search-tuning.js";
import { TranspositionTable, scalarIndex, stateKeyLo, stateKeyHi } from "./transposition.js";

const EVAL_CACHE_BITS = 16;
const EVAL_CACHE_ENTRIES = 1 << EVAL_CACHE_BITS;
const EVAL_CACHE_MASK = EVAL_CACHE_ENTRIES - 1;
const EVAL_CACHE_EPOCH_LIMIT = 1 << 30;
const FLAG_EXACT = 0;
const FLAG_LOWER = 1;
const FLAG_UPPER = 2;
const FLAG_MOVE_ONLY = 3;
const FUTILITY_UPPER_TAG = 1 << 30;
const TABLE_GENERATION_MASK = 0x3f_ffff;
const TIMEOUT_CHECK_MASK = 2_047;
const TACTICAL_THRESHOLD = 1 << 15;
const KEY_TT = 1 << 28;
const KEY_KILLER_A = 1 << 24;
const KEY_KILLER_B = 1 << 23;
const INFINITY_SCORE = WIN_VALUE * 2;
const NO_TIMEOUT = (): boolean => false;
type SearchOutcome = {
  readonly move: number;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
  readonly supported: boolean;
};

type RootSearchOutcome = {
  readonly move: number;
  readonly score: number;
  readonly selective: boolean;
  readonly verifiedChallenger?: boolean;
  readonly provenWin?: boolean;
};

export function orderMoves(
  buffer: Int32Array,
  keys: Int32Array,
  count: number,
  commutingMove: number,
  ttMove: number,
  killerA: number,
  killerB: number,
  history: Int32Array,
  historyBase: number,
): number {
  if (commutingMove === 0) {
    let bestSlot = 0;
    let bestKey = -2147483648;
    let secondSlot = 1;
    let secondKey = -2147483648;
    let firstKey = -2147483648;
    let tailSlot = 1;
    let tailKey = -2147483648;
    for (let index = 0; index < count; index += 1) {
      const move = i32(buffer, index);
      let key = i32(keys, index);
      if (move === ttMove) key += KEY_TT;
      else if (move === killerA) key += KEY_KILLER_A;
      else if (move === killerB) key += KEY_KILLER_B;
      else {
        const historyScore = i32(history, historyBase + moveFrom(move) * BOARD_CELLS + moveTo(move));
        key += historyScore > 8191 ? 8191 : historyScore;
      }
      keys[index] = key;
      const finalKey = i32(keys, index);
      if (index === 0) {
        firstKey = finalKey;
        bestKey = finalKey;
        continue;
      }
      if (finalKey > bestKey) {
        bestKey = finalKey;
        bestSlot = index;
        if (tailKey >= firstKey) {
          secondKey = tailKey;
          secondSlot = tailSlot;
        } else {
          secondKey = firstKey;
          secondSlot = index;
        }
      } else if (index === 1 || finalKey > secondKey) {
        secondKey = finalKey;
        secondSlot = index;
      }
      if (index === 1 || finalKey > tailKey) {
        tailKey = finalKey;
        tailSlot = index;
      }
    }
    if (bestSlot !== 0) {
      const move = i32(buffer, 0);
      buffer[0] = i32(buffer, bestSlot);
      buffer[bestSlot] = move;
      keys[bestSlot] = i32(keys, 0);
      keys[0] = bestKey;
    }
    if (count > 1 && secondSlot !== 1) {
      const move = i32(buffer, 1);
      buffer[1] = i32(buffer, secondSlot);
      buffer[secondSlot] = move;
      keys[secondSlot] = i32(keys, 1);
      keys[1] = secondKey;
    }
    return count;
  }

  const previousFrom = moveFrom(commutingMove);
  const previousTo = moveTo(commutingMove);
  let write = 0;
  let bestSlot = 0;
  let bestKey = -2147483648;
  let secondSlot = 1;
  let secondKey = -2147483648;
  let firstKey = -2147483648;
  let tailSlot = 1;
  let tailKey = -2147483648;
  for (let read = 0; read < count; read += 1) {
    const move = i32(buffer, read);
    if (moveType(move) === MOVE_MON && move < commutingMove) {
      const from = moveFrom(move);
      const to = moveTo(move);
      if (from !== previousFrom && from !== previousTo && to !== previousFrom && to !== previousTo) {
        continue;
      }
    }
    let key = i32(keys, read);
    if (move === ttMove) key += KEY_TT;
    else if (move === killerA) key += KEY_KILLER_A;
    else if (move === killerB) key += KEY_KILLER_B;
    else {
      const historyScore = i32(history, historyBase + moveFrom(move) * BOARD_CELLS + moveTo(move));
      key += historyScore > 8191 ? 8191 : historyScore;
    }
    if (write !== read) buffer[write] = move;
    keys[write] = key;
    const finalKey = i32(keys, write);
    if (write === 0) {
      firstKey = finalKey;
      bestKey = finalKey;
    } else {
      if (finalKey > bestKey) {
        bestKey = finalKey;
        bestSlot = write;
        if (tailKey >= firstKey) {
          secondKey = tailKey;
          secondSlot = tailSlot;
        } else {
          secondKey = firstKey;
          secondSlot = write;
        }
      } else if (write === 1 || finalKey > secondKey) {
        secondKey = finalKey;
        secondSlot = write;
      }
      if (write === 1 || finalKey > tailKey) {
        tailKey = finalKey;
        tailSlot = write;
      }
    }
    write += 1;
  }
  if (write === 0) {
    return orderMoves(buffer, keys, count, 0, ttMove, killerA, killerB, history, historyBase);
  }
  if (bestSlot !== 0) {
    const move = i32(buffer, 0);
    buffer[0] = i32(buffer, bestSlot);
    buffer[bestSlot] = move;
    keys[bestSlot] = i32(keys, 0);
    keys[0] = bestKey;
  }
  if (write > 1 && secondSlot !== 1) {
    const move = i32(buffer, 1);
    buffer[1] = i32(buffer, secondSlot);
    buffer[secondSlot] = move;
    keys[secondSlot] = i32(keys, 1);
    keys[1] = secondKey;
  }
  return write;
}

export class FastSearcher {
  readonly #positions: FastPosition[] = [];
  readonly #moves: Int32Array[] = [];
  readonly #orderKeys: Int32Array[] = [];
  readonly #table: TranspositionTable;
  readonly #killers = new Int32Array(MAX_PLY * 2);
  readonly #history = new Int32Array(COLOR_COUNT * BOARD_CELLS * BOARD_CELLS);
  readonly #moveAtPly = new Int32Array(MAX_PLY + 1);
  readonly #evalCache = new Int32Array(EVAL_CACHE_ENTRIES * 4);
  #evalEpoch = 0;
  #evalCacheWeights: EvalWeights | undefined;
  #evalCacheThreat = 0;
  #evalCacheSquares: ArrayLike<number> | undefined;
  #tables: EvalTables = DEFAULT_EVAL_TABLES;
  #cacheFutilityUpper = false;
  #tuning: NormalizedSearchTuning = DEFAULT_TUNING;
  #windowThreat = 0;
  #nodes = 0;
  #nodeLimit = 0;
  #stopped = false;
  #unsupported = false;
  #selectiveEpoch = 0;
  #turnEpoch = 0;
  #checkTimeout: () => boolean = NO_TIMEOUT;

  public constructor() {
    this.#table = new TranspositionTable();
    for (let ply = 0; ply <= MAX_PLY; ply += 1) {
      this.#positions.push(new FastPosition());
      this.#moves.push(new Int32Array(MAX_MOVES));
      this.#orderKeys.push(new Int32Array(MAX_MOVES));
    }
  }

  public get root(): FastPosition {
    return at(this.#positions, 0);
  }

  public get size(): number {
    return this.#table.entries;
  }

  public search(
    limits: SearchLimits,
    checkTimeout: () => boolean,
    weights: EvalWeights = DEFAULT_WEIGHTS,
  ): SearchOutcome {
    const normalizedLimits = memoizedSearchLimits(limits);
    const normalizedWeights = memoizedNormalizedEvalWeights(weights);
    this.#unsupported = false;
    this.#cacheFutilityUpper = false;
    this.#selectiveEpoch = 0;
    this.#turnEpoch = 0;
    if (positionWinner(this.root) !== -1) {
      return {
        move: 0,
        score: 0,
        depth: 0,
        nodes: 0,
        supported: true,
      };
    }

    this.#tables = memoizedEvalTables(normalizedWeights);
    this.#cacheFutilityUpper = normalizedWeights === NORMAL_WEIGHTS;
    const tuning = normalizedLimits.tuning;
    this.#tuning = tuning;
    this.#windowThreat = tuning.winsNextTurnThreat;
    // Cached evaluations stay valid across searches: the cache key covers the whole
    // position, so entries only go stale when the weights, the tuning's evaluation
    // term, or the variant's static square layout change.
    const squaresChanged = !sameSquares(this.#evalCacheSquares, this.root.squares);
    if (
      normalizedWeights !== this.#evalCacheWeights ||
      tuning.winsNextTurnThreat !== this.#evalCacheThreat ||
      squaresChanged
    ) {
      this.#evalCacheWeights = normalizedWeights;
      this.#evalCacheThreat = tuning.winsNextTurnThreat;
      this.#evalCacheSquares = this.root.squares;
      if (this.#evalEpoch >= EVAL_CACHE_EPOCH_LIMIT) {
        this.#evalEpoch = 0;
        this.#evalCache.fill(0);
      }
      this.#evalEpoch += 1;
    }
    this.#nodes = 0;
    this.#nodeLimit = normalizedLimits.maxNodes;
    this.#stopped = false;
    this.#checkTimeout = checkTimeout;
    this.#table.deactivate();
    try {
      this.#killers.fill(0);
      this.#history.fill(0);

      let bestMove = 0;
      let bestScore = 0;
      let completedDepth = 0;
      for (let depth = 1; depth <= normalizedLimits.maxDepth; depth += 1) {
        if (depth === 2) {
          if (this.#nodes >= this.#nodeLimit || !this.#table.prepare(this.#checkTimeout)) {
            this.#stopped = true;
            break;
          }
          this.#advanceTableGeneration();
        }
        let alphaStart = -INFINITY_SCORE;
        let betaStart = INFINITY_SCORE;
        if (tuning.aspirationDelta > 0 && completedDepth > 0 && depth >= tuning.aspirationMinDepth) {
          alphaStart = bestScore - tuning.aspirationDelta;
          betaStart = bestScore + tuning.aspirationDelta;
        }
        let outcome = this.#searchRoot(depth, bestMove, alphaStart, betaStart, bestMove);
        let widenings = 0;
        while (
          !this.#isStopped() &&
          outcome.provenWin !== true &&
          outcome.move !== 0 &&
          (outcome.score <= alphaStart || outcome.score >= betaStart) &&
          (alphaStart > -INFINITY_SCORE || betaStart < INFINITY_SCORE)
        ) {
          widenings += 1;
          const widened = tuning.aspirationDelta * (1 << widenings);
          if (outcome.score <= alphaStart) {
            alphaStart = widenings >= 2 ? -INFINITY_SCORE : outcome.score - widened;
          }
          if (outcome.score >= betaStart) {
            betaStart = widenings >= 2 ? INFINITY_SCORE : outcome.score + widened;
          }
          outcome = this.#searchRoot(depth, outcome.move, alphaStart, betaStart, bestMove);
        }
        if (outcome.move === 0) break;
        if (this.#isStopped()) {
          if (
            completedDepth === 0 ||
            (this.#tables.learnedPro !== undefined &&
              outcome.verifiedChallenger === true &&
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              !this.#unsupported)
          ) {
            bestMove = outcome.move;
            bestScore = outcome.score;
          }
          break;
        }
        bestMove = outcome.move;
        bestScore = outcome.score;
        completedDepth = depth;
        if (!outcome.selective && bestScore >= WIN_VALUE - MAX_PLY) break;
      }
      return {
        move: bestMove,
        score: bestScore,
        depth: completedDepth,
        nodes: this.#nodes,
        supported: !this.#unsupported,
      };
    } finally {
      this.#table.deactivate();
      this.#tables = DEFAULT_EVAL_TABLES;
      this.#cacheFutilityUpper = false;
      this.#tuning = DEFAULT_TUNING;
      this.#windowThreat = 0;
      this.#checkTimeout = NO_TIMEOUT;
    }
  }

  #advanceTableGeneration(): void {
    this.#table.generation += 1;
    if (this.#table.generation > TABLE_GENERATION_MASK) this.#table.clear();
  }

  #searchRoot(
    depth: number,
    previousBest: number,
    alphaStart: number,
    betaStart: number,
    completedIncumbent: number,
  ): RootSearchOutcome {
    const position = at(this.#positions, 0);
    const buffer = at(this.#moves, 0);
    const count = generateMoves(position, buffer, at(this.#orderKeys, 0));
    if (count === 0) {
      return {
        move: 0,
        score: 0,
        selective: false,
      };
    }
    orderMoves(
      buffer,
      at(this.#orderKeys, 0),
      count,
      0,
      previousBest,
      i32(this.#killers, 0),
      i32(this.#killers, 1),
      this.#history,
      position.active * BOARD_CELLS * BOARD_CELLS,
    );
    const rootKeys = at(this.#orderKeys, 0);

    let alpha = alphaStart;
    let bestMove = 0;
    let bestScore = -INFINITY_SCORE;
    let bestSelective = false;
    let bestVerifiedChallenger = false;
    for (let index = 0; index < count; index += 1) {
      if (index >= 2) this.#selectBest(buffer, rootKeys, index, count);
      const move = i32(buffer, index);
      const turnEpoch = this.#turnEpoch;
      const winner = this.#prepareChild(position, move, 0);
      let score: number;
      let selectiveEpoch = this.#selectiveEpoch;
      let selective: boolean;
      let fullWindowCompleted = index === 0;
      if (index === 0) {
        score = this.#searchPreparedChild(position, winner, 0, depth - 1, alpha, betaStart);
        selective = this.#selectiveEpoch !== selectiveEpoch;
      } else {
        score = this.#searchPreparedChild(position, winner, 0, depth - 1, alpha, alpha + 1);
        selective = this.#selectiveEpoch !== selectiveEpoch;
        if (score > alpha && !this.#isStopped()) {
          if (!selective && this.#turnEpoch === turnEpoch && score >= WIN_VALUE - MAX_PLY) {
            return { move, score, selective: false, provenWin: true };
          }
          selectiveEpoch = this.#selectiveEpoch;
          score = this.#searchPreparedChild(position, winner, 0, depth - 1, alpha, betaStart);
          fullWindowCompleted = true;
          selective = this.#selectiveEpoch !== selectiveEpoch;
        }
      }
      if (this.#isStopped()) break;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
        bestSelective = selective;
        bestVerifiedChallenger =
          fullWindowCompleted &&
          score > alpha &&
          completedIncumbent !== 0 &&
          i32(buffer, 0) === completedIncumbent &&
          move !== completedIncumbent;
        if (score > alpha) alpha = score;
      }
      if (alpha >= betaStart) break;
    }
    if (bestMove === 0) {
      bestMove = i32(buffer, 0);
      bestScore = 0;
      bestSelective = true;
    }
    return {
      move: bestMove,
      score: bestScore,
      selective: bestSelective,
      verifiedChallenger: bestVerifiedChallenger,
    };
  }

  #prepareChild(parent: FastPosition, move: number, ply: number): number {
    const child = at(this.#positions, ply + 1);
    child.copyFrom(parent);
    this.#moveAtPly[ply] = move;
    const winner = applyFastMove(child, move);
    if (child.active !== parent.active) this.#turnEpoch += 1;
    if (winner === FAST_MOVE_UNREPRESENTABLE) {
      this.#unsupported = true;
      this.#stopped = true;
    }
    return winner;
  }

  #searchPreparedChild(
    parent: FastPosition,
    winner: number,
    ply: number,
    depth: number,
    alpha: number,
    beta: number,
  ): number {
    const child = at(this.#positions, ply + 1);
    if (winner === FAST_MOVE_UNREPRESENTABLE) return 0;
    if (winner !== -1) {
      return winner === parent.active ? WIN_VALUE - ply : -(WIN_VALUE - ply);
    }
    if (child.active === parent.active) {
      return this.#negamax(depth, ply + 1, alpha, beta);
    }
    return -this.#negamax(depth, ply + 1, -beta, -alpha);
  }

  #negamax(depth: number, ply: number, alphaInput: number, beta: number): number {
    if (!this.#beginWorkUnit()) return 0;
    const position = at(this.#positions, ply);
    if (ply >= MAX_PLY - 2) return this.#staticScore(position);
    if (depth <= 0) return this.#staticScore(position);

    let alpha = alphaInput;
    const commutingMove = this.#commutingMonMoveContext(position, ply);
    const scalar = scalarIndex(position);
    const keyLo = stateKeyLo(position, scalar, commutingMove);
    const keyHi = stateKeyHi(position, scalar, commutingMove);
    const table = this.#table;
    const slot = (keyLo ^ (keyHi * 3)) & table.mask;
    let ttMove = 0;
    const slotInfo = i32(table.info, slot);
    const slotMatches =
      i32(table.keyLo, slot) === keyLo &&
      i32(table.keyHi, slot) === keyHi &&
      ((slotInfo >>> 8) & TABLE_GENERATION_MASK) === table.generation;
    if (slotMatches) {
      ttMove = i32(table.move, slot);
      const storedDepth = (slotInfo >> 2) & 63;
      if (storedDepth >= depth) {
        const score = i32(table.score, slot) / 2;
        const flag = slotInfo & 3;
        if ((slotInfo & FUTILITY_UPPER_TAG) !== 0) {
          if (this.#cacheFutilityUpper && storedDepth === depth && flag === FLAG_UPPER && score <= alpha) {
            this.#selectiveEpoch += 1;
            return score;
          }
        } else if (
          flag === FLAG_EXACT ||
          (flag === FLAG_LOWER && score >= beta) ||
          (flag === FLAG_UPPER && score <= alpha)
        ) {
          return score;
        }
      }
    }

    const tuning = this.#tuning;
    const buffer = at(this.#moves, ply);
    let count = generateMoves(position, buffer, at(this.#orderKeys, ply));
    if (count === 0)
      return this.#staticScore(
        position,
        keyLo ^ Math.imul(commutingMove, 0x27d4eb2d),
        keyHi ^ Math.imul(commutingMove, 0x165667b1),
      );
    const keys = at(this.#orderKeys, ply);
    count = orderMoves(
      buffer,
      keys,
      count,
      commutingMove,
      ttMove,
      i32(this.#killers, ply * 2),
      i32(this.#killers, ply * 2 + 1),
      this.#history,
      position.active * BOARD_CELLS * BOARD_CELLS,
    );

    let moveLimit = count;
    if (tuning.moveCountPruning && depth <= tuning.moveCountDepth) {
      const allowed = tuning.moveCountBase + tuning.moveCountFactor * depth;
      if (allowed < moveLimit) moveLimit = allowed;
    }
    const futilityEnabled = depth <= 2;
    if (futilityEnabled && !this.#beginWorkUnit()) return 0;
    if (this.#isStopped()) return 0;
    let futilityKnown = false;
    let futile = false;
    let futilityEnvelope = 0;
    let usedFutilityPruning = false;

    let bestScore = -INFINITY_SCORE;
    let bestMove = 0;
    const selectiveEpoch = this.#selectiveEpoch;
    for (let index = 0; index < count; index += 1) {
      if (index >= 2) this.#selectBest(buffer, keys, index, count);
      const move = i32(buffer, index);
      const tactical = i32(keys, index) >= TACTICAL_THRESHOLD;
      if (!tactical && bestMove !== 0) {
        let pruned = index >= moveLimit;
        if (!pruned && futilityEnabled) {
          if (!futilityKnown) {
            futilityEnvelope =
              this.#evaluateStatic(
                position,
                keyLo ^ Math.imul(commutingMove, 0x27d4eb2d),
                keyHi ^ Math.imul(commutingMove, 0x165667b1),
              ) +
              tuning.futilityMargin * depth;
            futile = futilityEnvelope <= alphaInput;
            futilityKnown = true;
          }
          pruned = futile;
          if (futile) usedFutilityPruning = true;
        }
        if (pruned) {
          this.#selectiveEpoch += 1;
          break;
        }
      }

      const winner = this.#prepareChild(position, move, ply);
      let score: number;
      if (index === 0) {
        score = this.#searchPreparedChild(position, winner, ply, depth - 1, alpha, beta);
      } else {
        let reduction = 0;
        if (tuning.lateMoveReduction && !tactical && depth >= 3 && index >= tuning.lateMoveIndex) {
          reduction = index >= tuning.lateMoveDeepIndex ? 2 : 1;
          if (reduction >= depth) reduction = depth - 1;
        }
        score = this.#searchPreparedChild(position, winner, ply, depth - 1 - reduction, alpha, alpha + 1);
        if (!this.#isStopped() && score > alpha && (reduction > 0 || score < beta)) {
          score = this.#searchPreparedChild(position, winner, ply, depth - 1, alpha, beta);
        }
      }
      if (this.#isStopped()) return 0;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        this.#recordCutoff(position, move, ply, depth, tactical);
        break;
      }
    }

    if (bestMove === 0) return this.#staticScore(position);

    const subtreeSelective = this.#selectiveEpoch !== selectiveEpoch;
    let flag = subtreeSelective
      ? FLAG_MOVE_ONLY
      : bestScore >= beta
        ? FLAG_LOWER
        : bestScore <= alphaInput
          ? FLAG_UPPER
          : FLAG_EXACT;
    let storedScore = bestScore;
    let futilityTag = 0;
    if (this.#cacheFutilityUpper && usedFutilityPruning && bestScore <= alphaInput) {
      const upper = bestScore > futilityEnvelope ? bestScore : futilityEnvelope;
      if (upper < WIN_VALUE - MAX_PLY && upper > -WIN_VALUE + MAX_PLY) {
        flag = FLAG_UPPER;
        storedScore = upper;
        futilityTag = FUTILITY_UPPER_TAG;
      }
    }
    const entryDepth = depth;
    if (storedScore < WIN_VALUE - MAX_PLY && storedScore > -WIN_VALUE + MAX_PLY) {
      const storedDepth = (slotInfo >> 2) & 63;
      if (!slotMatches || entryDepth >= storedDepth) {
        if (slotInfo === 0 && i32(table.info, slot) === 0) {
          table.entries += 1;
        }
        table.keyLo[slot] = keyLo;
        table.keyHi[slot] = keyHi;
        table.score[slot] = storedScore * 2;
        table.info[slot] = futilityTag | (table.generation << 8) | (entryDepth << 2) | flag;
        table.move[slot] = bestMove;
      }
    }
    return bestScore;
  }

  // Disjoint mon sub-moves commute, so one ascending permutation preserves every reachable move set.
  #commutingMonMoveContext(position: FastPosition, ply: number): number {
    if (ply === 0) return 0;
    const previous = i32(this.#moveAtPly, ply - 1);
    return moveType(previous) === MOVE_MON && at(this.#positions, ply - 1).active === position.active
      ? previous
      : 0;
  }

  #isStopped(): boolean {
    return this.#stopped;
  }

  #beginWorkUnit(): boolean {
    if (this.#stopped) return false;
    if (this.#nodes >= this.#nodeLimit) {
      this.#stopped = true;
      return false;
    }
    this.#nodes += 1;
    if ((this.#nodes & TIMEOUT_CHECK_MASK) === 0 && this.#checkTimeout()) {
      this.#stopped = true;
      return false;
    }
    return true;
  }

  #evaluateStatic(position: FastPosition, precomputedKeyLo?: number, precomputedKeyHi?: number): number {
    let keyLo = precomputedKeyLo;
    let keyHi = precomputedKeyHi;
    if (keyLo === undefined || keyHi === undefined) {
      const scalar = scalarIndex(position);
      keyLo = stateKeyLo(position, scalar);
      keyHi = stateKeyHi(position, scalar);
    }
    const slot = ((keyLo ^ (keyHi * 3)) & EVAL_CACHE_MASK) << 2;
    const cache = this.#evalCache;
    let value: number;
    if (
      i32(cache, slot + 2) === this.#evalEpoch &&
      i32(cache, slot) === keyLo &&
      i32(cache, slot + 1) === keyHi
    ) {
      value = i32(cache, slot + 3) / 2;
    } else {
      value = evaluateWithTables(position, this.#tables, this.#windowThreat);
      if (value > MAX_NONTERMINAL_SCORE) value = MAX_NONTERMINAL_SCORE;
      else if (value < -MAX_NONTERMINAL_SCORE) value = -MAX_NONTERMINAL_SCORE;
      cache[slot] = keyLo;
      cache[slot + 1] = keyHi;
      cache[slot + 2] = this.#evalEpoch;
      cache[slot + 3] = value * 2;
    }
    return position.active === 0 ? value : -value;
  }

  #staticScore(position: FastPosition, precomputedKeyLo?: number, precomputedKeyHi?: number): number {
    if (!this.#beginWorkUnit()) return 0;
    return this.#evaluateStatic(position, precomputedKeyLo, precomputedKeyHi);
  }

  #recordCutoff(position: FastPosition, move: number, ply: number, depth: number, tactical: boolean): void {
    if (tactical) return;
    const killerIndex = ply * 2;
    if (i32(this.#killers, killerIndex) !== move) {
      this.#killers[killerIndex + 1] = i32(this.#killers, killerIndex);
      this.#killers[killerIndex] = move;
    }
    const historyIndex =
      position.active * BOARD_CELLS * BOARD_CELLS + moveFrom(move) * BOARD_CELLS + moveTo(move);
    const updated = i32(this.#history, historyIndex) + depth * depth;
    this.#history[historyIndex] = updated > 1 << 20 ? 1 << 20 : updated;
  }

  #selectBest(buffer: Int32Array, keys: Int32Array, index: number, count: number): void {
    let bestSlot = index;
    let bestKey = i32(keys, index);
    for (let slot = index + 1; slot < count; slot += 1) {
      const key = i32(keys, slot);
      if (key > bestKey) {
        bestKey = key;
        bestSlot = slot;
      }
    }
    if (bestSlot === index) return;
    const move = i32(buffer, index);
    buffer[index] = i32(buffer, bestSlot);
    buffer[bestSlot] = move;
    keys[bestSlot] = i32(keys, index);
    keys[index] = bestKey;
  }
}
