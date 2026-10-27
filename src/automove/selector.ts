import type { Input } from "../engine/model/domain.js";
import type { MonsGame } from "../engine/game/mons-game.js";
import {
  FAST_WORKSPACE_ALLOCATION_FAILED,
  isFastWorkspaceAllocationFailure,
} from "./allocation.js";
import { moveToInputs, tryLoadPosition } from "./bridge.js";
import {
  DEFAULT_WEIGHTS,
  LEARNED_PRO_WEIGHTS,
  NORMAL_WEIGHTS,
} from "./evaluation-weights.js";
import { FastSearcher } from "./search.js";
import {
  DEFAULT_TUNING,
  type SearchLimits,
  type SearchTuning,
} from "./search-tuning.js";
import { FastPosition } from "./state.js";

type WeakFastSearcher = {
  deref(): FastSearcher | undefined;
};

type WeakRefGlobal = {
  readonly WeakRef?: new (target: FastSearcher) => WeakFastSearcher;
};

export type AutomoveClock = () => number;

export type AutomovePreference = "fast" | "normal" | "pro";

export const NORMAL_SEARCH_TUNING = Object.freeze({
  ...DEFAULT_TUNING,
  lateMoveIndex: 2,
  lateMoveDeepIndex: 6,
  moveCountBase: 7,
  moveCountFactor: 7,
  aspirationDelta: 600,
  aspirationMinDepth: 2,
}) satisfies SearchTuning;

export const FAST_SEARCH_TUNING = Object.freeze({
  ...NORMAL_SEARCH_TUNING,
  winsNextTurnThreat: 2500,
}) satisfies SearchTuning;

export const PACKED_SELECTION_PROFILES = Object.freeze({
  fast: Object.freeze({
    budgetMs: 50,
    weights: DEFAULT_WEIGHTS,
    limits: Object.freeze({
      maxDepth: 40,
      maxNodes: 39_936,
      tuning: FAST_SEARCH_TUNING,
    }) satisfies SearchLimits,
  }),
  normal: Object.freeze({
    budgetMs: 150,
    weights: NORMAL_WEIGHTS,
    limits: Object.freeze({
      maxDepth: 40,
      maxNodes: 184_000,
      tuning: NORMAL_SEARCH_TUNING,
    }) satisfies SearchLimits,
  }),
  pro: Object.freeze({
    budgetMs: 650,
    weights: LEARNED_PRO_WEIGHTS,
    limits: Object.freeze({
      maxDepth: 40,
      maxNodes: 2_000_000,
      tuning: DEFAULT_TUNING,
    }) satisfies SearchLimits,
  }),
});

type PackedSelectionResult =
  | { readonly kind: "selected"; readonly inputs: Input[] }
  | { readonly kind: "fallback" };

function systemClock(): number {
  return globalThis.performance.now();
}

function readClock(clock: AutomoveClock): number {
  const now = clock();
  if (!Number.isFinite(now)) {
    throw new RangeError("automove clock must return a finite number");
  }
  return now;
}

function weakRefConstructor(): WeakRefGlobal["WeakRef"] {
  return (globalThis as unknown as WeakRefGlobal).WeakRef;
}

class FastSearcherPool {
  #idle: WeakFastSearcher | undefined;

  public run<Result>(
    operation: (searcher: FastSearcher) => Result,
  ): Result | typeof FAST_WORKSPACE_ALLOCATION_FAILED {
    const WeakRef = weakRefConstructor();
    let searcher = WeakRef === undefined ? undefined : this.#idle?.deref();
    if (searcher === undefined) {
      try {
        searcher = new FastSearcher();
      } catch (error) {
        if (error instanceof RangeError) return FAST_WORKSPACE_ALLOCATION_FAILED;
        throw error;
      }
    }
    this.#idle = undefined;
    try {
      return operation(searcher);
    } catch (error) {
      if (isFastWorkspaceAllocationFailure(error)) {
        return FAST_WORKSPACE_ALLOCATION_FAILED;
      }
      throw error;
    } finally {
      if (WeakRef !== undefined) this.#idle ??= new WeakRef(searcher);
    }
  }
}

const SEARCHERS = new FastSearcherPool();

export function selectPackedInputs(
  game: MonsGame,
  preference: AutomovePreference,
  clock: AutomoveClock = systemClock,
): PackedSelectionResult {
  const profile = PACKED_SELECTION_PROFILES[preference];
  const endMs = readClock(clock) + profile.budgetMs;
  let timedOut = false;
  const deadlineReached = (): boolean => {
    if (timedOut) return true;
    timedOut = readClock(clock) >= endMs;
    return timedOut;
  };

  if (game.winnerColor() !== undefined || deadlineReached()) {
    return { kind: "fallback" };
  }

  let position: FastPosition;
  try {
    position = new FastPosition();
  } catch (error) {
    if (error instanceof RangeError) return { kind: "fallback" };
    throw error;
  }
  if (!tryLoadPosition(position, game, profile.limits.maxDepth) || deadlineReached()) {
    return { kind: "fallback" };
  }

  const outcome = SEARCHERS.run((searcher) => {
    if (deadlineReached()) return undefined;
    searcher.root.copyFrom(position);
    if (deadlineReached()) return undefined;
    return searcher.search(profile.limits, deadlineReached, profile.weights);
  });
  if (
    outcome === undefined ||
    isFastWorkspaceAllocationFailure(outcome) ||
    !outcome.supported ||
    outcome.move === 0
  ) {
    return { kind: "fallback" };
  }
  return { kind: "selected", inputs: moveToInputs(outcome.move) };
}
