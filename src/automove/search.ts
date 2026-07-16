import { Color, MonKind, type Input } from "../engine/domain.js";
import { MonsGame } from "../engine/game.js";
import { saturatingAddI32, saturatingSubI32 } from "../engine/numerics.js";
import { cacheWriteAllowed, cancelled, checkpoint } from "./deadline.js";
import { clearExactStateAnalysisCache, exactSearchStateHash } from "./exact.js";
import {
  HASH64_ZERO,
  Hash64Table,
  hash64CompareUnsigned,
  hash64Equals,
  hash64IsZero,
  type Hash64,
} from "./hash64.js";
import {
  classifyTransition,
  compareRootCandidates,
  hasProTacticalPotential,
  isOwnDrainerVulnerable,
  orderingEventBonus,
  rankRootCandidates,
  searchConfigForPreference,
  terminalSearchScore,
  type MoveClassFlags,
  type RootCandidate,
  type SearchConfig,
  type SearchPreference,
} from "./root-candidates.js";
import {
  clearMoveEfficiencyCache,
  moveEfficiencyDeltaFromBeforeSnapshot,
  moveEfficiencySnapshotWithHash,
} from "./move-efficiency.js";
import { focusedRootCandidates } from "./root-focus.js";
import { evaluatePreferabilityWithWeightsAndExactPolicy } from "./scoring.js";
import type { RootEvaluation as SelectorRootEvaluation } from "./selector-types.js";
import {
  enumerateLegalTransitions,
  isQuiescenceTacticalTransition,
} from "./transitions.js";

const TT_BEST_CHILD_BONUS = 2_400;
const CHILD_CLASS_SCORE_MARGIN = 110;

type TranspositionBound = "exact" | "lower" | "upper";

type TranspositionEntry = {
  readonly depth: number;
  readonly score: number;
  readonly bound: TranspositionBound;
  readonly bestChildHash: Hash64;
};

export type RankedChild = {
  readonly game: MonsGame;
  readonly hash: Hash64;
  readonly heuristic: number;
  readonly orderingEfficiency: number;
  readonly tacticalExtensionTrigger: boolean;
  readonly quietReductionCandidate: boolean;
  readonly classes: MoveClassFlags;
};

type SearchStats = {
  visitedNodes: number;
  cacheHits: number;
  quiescenceNodes: number;
  extensionNodes: number;
};

type SearchContext = {
  readonly perspective: Color;
  readonly config: SearchConfig;
  readonly transposition: Hash64Table<TranspositionEntry>;
  readonly extensionNodeBudget: number;
  readonly stats: SearchStats;
};

export type RootEvaluation = {
  readonly candidate: RootCandidate;
  readonly score: number;
  readonly nodesAfter: number;
};

/**
 * Flat, lossless selector view of a bounded-search result. The shared fields
 * are directly consumable by advisor/reply-risk code while the compatibility
 * aliases and search-only observations remain available to existing callers.
 */
export type FlatRootEvaluation = SelectorRootEvaluation &
  RootCandidate & {
    readonly score: number;
    readonly nodesAfter: number;
  };

export type SearchRootOptions = {
  /** Advisor-selected roots, computed before the two-pass focus allocation. */
  readonly priorityInputs?: readonly (readonly Input[])[];
  /** A single prepass-selected input chain that must survive root focusing. */
  readonly forcedInputs?: readonly Input[];
  /** CurrentPro SpiritImpact/nonnegative-deny plan-family qualification. */
  readonly qualifiesPlainSpiritPlan?: (candidate: RootCandidate) => boolean;
  /** CurrentPro DrainerSafetyRecovery plan-family qualification. */
  readonly qualifiesDrainerSafetyRecoveryPlan?: (
    candidate: RootCandidate,
  ) => boolean;
};

export type SearchResult = {
  readonly best: RootEvaluation | undefined;
  readonly evaluations: readonly RootEvaluation[];
  readonly visitedNodes: number;
  readonly cacheHits: number;
  readonly timedOut: boolean;
};

export type FocusedSearchRoots = {
  readonly candidates: readonly RootCandidate[];
  readonly scoutVisitedNodes: number;
};

export function flattenRootEvaluation(
  evaluation: RootEvaluation,
): FlatRootEvaluation {
  return {
    ...evaluation.candidate,
    score: evaluation.score,
    nodesAfter: evaluation.nodesAfter,
  };
}

export function flattenRootEvaluations(
  evaluations: readonly RootEvaluation[],
): FlatRootEvaluation[] {
  return evaluations.map(flattenRootEvaluation);
}

const preferabilityCache = new Hash64Table<number>(Number.MAX_SAFE_INTEGER);

function cachedPreferability(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
  stats: SearchStats,
  stateHash = exactSearchStateHash(game),
): number {
  const tag = perspective;
  const cached = preferabilityCache.get(
    stateHash,
    tag,
    undefined,
    config.scoringKey,
  );
  if (cached !== undefined) {
    stats.cacheHits += 1;
    return cached;
  }
  const value = evaluatePreferabilityWithWeightsAndExactPolicy(
    game,
    perspective,
    config.scoringWeights,
    false,
  );
  if (cacheWriteAllowed()) {
    if (
      preferabilityCache.size >= config.preferabilityCacheCapacity &&
      !preferabilityCache.has(stateHash, tag, undefined, config.scoringKey)
    ) {
      preferabilityCache.clear();
    }
    preferabilityCache.set(stateHash, value, tag, undefined, config.scoringKey);
  }
  return value;
}

function classPriority(classes: MoveClassFlags): number {
  let score = 0;
  if (classes.immediateScore) score += 1_000;
  if (classes.drainerAttack) score += 700;
  if (classes.drainerSafetyRecover) score += 500;
  if (classes.carrierProgress) score += 220;
  if (classes.material) score += 80;
  return score;
}

function compareHashesDescending(left: Hash64, right: Hash64): number {
  return -hash64CompareUnsigned(left, right);
}

export function compareRankedChildren(
  left: RankedChild,
  right: RankedChild,
  maximizing: boolean,
): number {
  if (left.heuristic !== right.heuristic) {
    return maximizing
      ? right.heuristic - left.heuristic
      : left.heuristic - right.heuristic;
  }
  if (left.orderingEfficiency !== right.orderingEfficiency) {
    return right.orderingEfficiency - left.orderingEfficiency;
  }
  const classOrder = classPriority(right.classes) - classPriority(left.classes);
  return classOrder !== 0
    ? classOrder
    : compareHashesDescending(left.hash, right.hash);
}

function childWithinCoverageMargin(
  score: number,
  cutoff: number,
  maximizing: boolean,
): boolean {
  return maximizing
    ? saturatingAddI32(score, CHILD_CLASS_SCORE_MARGIN) >= cutoff
    : score <= saturatingAddI32(cutoff, CHILD_CLASS_SCORE_MARGIN);
}

export function isPriorityChild(child: RankedChild): boolean {
  return (
    child.classes.immediateScore ||
    child.classes.drainerAttack ||
    child.classes.drainerSafetyRecover ||
    child.classes.carrierProgress ||
    (child.orderingEfficiency > 0 && !child.classes.material)
  );
}

export function truncateChildrenWithCoverage(
  children: readonly RankedChild[],
  limit: number,
  maximizing: boolean,
  strictGuarantees = true,
): RankedChild[] {
  if (children.length <= limit || limit === 0) return [...children];
  const cutoff = children[limit - 1]?.heuristic ?? 0;
  const preserveIndex = children.findIndex(
    (child, index) =>
      index >= limit &&
      isPriorityChild(child) &&
      (strictGuarantees ||
        childWithinCoverageMargin(child.heuristic, cutoff, maximizing)),
  );
  if (preserveIndex < 0) return children.slice(0, limit);
  const selected = new Array<boolean>(children.length).fill(false);
  selected[preserveIndex] = true;
  let selectedCount = 1;
  for (let index = 0; index < selected.length; index += 1) {
    if (selectedCount >= limit) break;
    if (selected[index] === true) continue;
    selected[index] = true;
    selectedCount += 1;
  }
  return children.filter((_child, index) => selected[index] === true);
}

export function enforceTacticalChildTop2(
  children: RankedChild[],
  maximizing: boolean,
  strictGuarantees = true,
): void {
  if (children.length < 3 || children.slice(0, 2).some(isPriorityChild)) {
    return;
  }
  const secondScore = children[1]?.heuristic ?? 0;
  const replacementIndex = children.findIndex((child, index) => {
    if (index < 2 || !isPriorityChild(child)) return false;
    return (
      strictGuarantees ||
      childWithinCoverageMargin(child.heuristic, secondScore, maximizing)
    );
  });
  if (replacementIndex >= 2) {
    const second = children[1];
    const replacement = children[replacementIndex];
    if (second !== undefined && replacement !== undefined) {
      children[1] = replacement;
      children[replacementIndex] = second;
    }
  }
}

export function isQuietReductionCandidate(
  orderingEfficiency: number,
  tacticalExtensionTrigger: boolean,
  classes: MoveClassFlags,
): boolean {
  return (
    !classes.material &&
    orderingEfficiency <= 0 &&
    !tacticalExtensionTrigger &&
    !classes.immediateScore &&
    !classes.drainerAttack &&
    !classes.drainerSafetyRecover &&
    !classes.carrierProgress
  );
}

export function isSelectiveExtensionCandidate(
  tacticalExtensionTrigger: boolean,
  orderingEfficiency: number,
  classes: MoveClassFlags,
): boolean {
  return (
    tacticalExtensionTrigger ||
    (orderingEfficiency > 0 && !classes.quiet && !classes.material)
  );
}

function rankedChildren(
  game: MonsGame,
  context: SearchContext,
  beforeStateHash: Hash64,
  preferredChildHash: Hash64 | undefined,
): RankedChild[] {
  if (checkpoint()) return [];
  const maximizing = game.activeColor === context.perspective;
  const actorColor = game.activeColor;
  const beforeEfficiencySnapshot = moveEfficiencySnapshotWithHash(
    game,
    context.perspective,
    false,
    false,
    beforeStateHash,
  );
  const ownDrainerVulnerableBefore = isOwnDrainerVulnerable(game, actorColor);
  const children: RankedChild[] = [];
  for (const transition of enumerateLegalTransitions(
    game,
    context.config.nodeEnumLimit,
  )) {
    if (checkpoint()) return [];
    const hash = exactSearchStateHash(transition.game);
    const ownDrainerVulnerableAfter = isOwnDrainerVulnerable(
      transition.game,
      actorColor,
    );
    const classes = classifyTransition(
      game,
      transition,
      actorColor,
      ownDrainerVulnerableBefore,
      ownDrainerVulnerableAfter,
    );
    const orderingEfficiency = moveEfficiencyDeltaFromBeforeSnapshot(
      game,
      transition.game,
      actorColor,
      transition.events,
      beforeEfficiencySnapshot,
      hash,
      {
        isRoot: false,
        applyBacktrackPenalty: false,
        applyRootManaHandoffGuard: false,
        includeTacticalExact: false,
        includeStrategicExact: false,
        rootBacktrackPenalty: context.config.rootBacktrackPenalty,
        rootManaHandoffPenalty: context.config.rootManaHandoffPenalty,
      },
    );
    let heuristic =
      terminalSearchScore(
        transition.game,
        context.perspective,
        0,
        context.config.depth,
      ) ??
      cachedPreferability(
        transition.game,
        context.perspective,
        context.config,
        context.stats,
        hash,
      );
    heuristic = saturatingAddI32(
      heuristic,
      orderingEventBonus(actorColor, context.perspective, transition.events),
    );
    if (
      preferredChildHash !== undefined &&
      hash64Equals(hash, preferredChildHash)
    ) {
      heuristic = saturatingAddI32(heuristic, TT_BEST_CHILD_BONUS);
    }
    const tacticalExtensionTrigger =
      ownDrainerVulnerableBefore !== ownDrainerVulnerableAfter ||
      transition.events.some(
        (event) =>
          event.kind === "mana-scored" ||
          (event.kind === "mon-fainted" && event.mon.kind === MonKind.Drainer),
      );
    children.push({
      game: transition.game,
      hash,
      heuristic,
      orderingEfficiency,
      tacticalExtensionTrigger,
      quietReductionCandidate: isQuietReductionCandidate(
        orderingEfficiency,
        tacticalExtensionTrigger,
        classes,
      ),
      classes,
    });
  }
  children.sort((left, right) =>
    compareRankedChildren(left, right, maximizing),
  );
  enforceTacticalChildTop2(children, maximizing, true);
  return truncateChildrenWithCoverage(
    children,
    context.config.nodeBranchLimit,
    maximizing,
    true,
  );
}

function staticScore(
  game: MonsGame,
  stateHash: Hash64,
  context: SearchContext,
): number {
  const terminal = terminalSearchScore(
    game,
    context.perspective,
    0,
    context.config.depth,
  );
  return (
    terminal ??
    cachedPreferability(
      game,
      context.perspective,
      context.config,
      context.stats,
      stateHash,
    )
  );
}

function quiescenceScore(
  game: MonsGame,
  stateHash: Hash64,
  alpha: number,
  beta: number,
  context: SearchContext,
): number {
  const standPat = staticScore(game, stateHash, context);
  const maximizing = game.activeColor === context.perspective;
  if ((maximizing && standPat >= beta) || (!maximizing && standPat <= alpha)) {
    return standPat;
  }
  context.stats.quiescenceNodes += 1;
  let best = standPat;
  let window = maximizing ? Math.max(alpha, best) : Math.min(beta, best);
  for (const transition of enumerateLegalTransitions(
    game,
    Math.min(context.config.quiescenceEnumLimit, context.config.nodeEnumLimit),
  )) {
    if (
      context.stats.visitedNodes >= context.config.maxVisitedNodes ||
      checkpoint()
    ) {
      break;
    }
    if (!isQuiescenceTacticalTransition(transition.events)) continue;
    context.stats.visitedNodes += 1;
    const transitionHash = exactSearchStateHash(transition.game);
    const score = cachedPreferability(
      transition.game,
      context.perspective,
      context.config,
      context.stats,
      transitionHash,
    );
    best = maximizing ? Math.max(best, score) : Math.min(best, score);
    window = maximizing ? Math.max(window, best) : Math.min(window, best);
    if ((maximizing && window >= beta) || (!maximizing && window <= alpha)) {
      break;
    }
  }
  return best;
}

function boundedSearch(
  game: MonsGame,
  stateHash: Hash64,
  depth: number,
  alphaValue: number,
  betaValue: number,
  extensionsRemaining: number,
  context: SearchContext,
): number {
  const terminal = terminalSearchScore(
    game,
    context.perspective,
    depth,
    context.config.depth,
  );
  if (terminal !== undefined) return terminal;
  if (checkpoint()) return 0;
  if (context.stats.visitedNodes >= context.config.maxVisitedNodes) {
    return staticScore(game, stateHash, context);
  }
  if (depth <= 0) {
    if (
      context.config.enableQuiescenceSearch &&
      context.stats.quiescenceNodes < context.config.quiescenceNodeBudget
    ) {
      return quiescenceScore(game, stateHash, alphaValue, betaValue, context);
    }
    return staticScore(game, stateHash, context);
  }

  let alpha = alphaValue;
  let beta = betaValue;
  const alphaBefore = alpha;
  const betaBefore = beta;
  let preferredChildHash: Hash64 | undefined;
  const entry = context.config.useTranspositionTable
    ? context.transposition.get(stateHash)
    : undefined;
  if (entry !== undefined) {
    context.stats.cacheHits += 1;
    if (!hash64IsZero(entry.bestChildHash)) {
      preferredChildHash = entry.bestChildHash;
    }
    if (entry.depth >= depth) {
      if (entry.bound === "exact") return entry.score;
      if (entry.bound === "lower") alpha = Math.max(alpha, entry.score);
      else beta = Math.min(beta, entry.score);
      if (alpha >= beta) return entry.score;
    }
  }

  const maximizing = game.activeColor === context.perspective;
  if (
    context.config.enableFutilityPruning &&
    depth === 1 &&
    !hasProTacticalPotential(game)
  ) {
    const evaluation = staticScore(game, stateHash, context);
    if (
      (maximizing &&
        saturatingAddI32(evaluation, context.config.futilityMargin) < alpha) ||
      (!maximizing &&
        saturatingSubI32(evaluation, context.config.futilityMargin) > beta)
    ) {
      return evaluation;
    }
  }

  const children = rankedChildren(game, context, stateHash, preferredChildHash);
  if (children.length === 0) return staticScore(game, stateHash, context);
  let value = maximizing ? -0x8000_0000 : 0x7fff_ffff;
  let bestChildHash = HASH64_ZERO;
  let stoppedByBudget = false;
  for (const child of children) {
    if (context.stats.visitedNodes >= context.config.maxVisitedNodes) {
      stoppedByBudget = true;
      break;
    }
    let childDepth = Math.max(0, depth - 1);
    let childExtensions = extensionsRemaining;
    if (
      context.config.enableSelectiveExtensions &&
      isSelectiveExtensionCandidate(
        child.tacticalExtensionTrigger,
        child.orderingEfficiency,
        child.classes,
      ) &&
      childExtensions > 0 &&
      (context.extensionNodeBudget === 0 ||
        context.stats.extensionNodes < context.extensionNodeBudget)
    ) {
      childDepth = depth;
      childExtensions -= 1;
      if (context.extensionNodeBudget > 0) {
        context.stats.extensionNodes += 1;
      }
    } else if (
      context.config.enableQuietReductions &&
      child.quietReductionCandidate &&
      depth >= context.config.quietReductionDepthThreshold
    ) {
      childDepth = Math.max(0, depth - 2);
    }
    context.stats.visitedNodes += 1;
    const score = boundedSearch(
      child.game,
      child.hash,
      childDepth,
      alpha,
      beta,
      childExtensions,
      context,
    );
    if ((maximizing && score > value) || (!maximizing && score < value)) {
      value = score;
      bestChildHash = child.hash;
    }
    if (maximizing) alpha = Math.max(alpha, value);
    else beta = Math.min(beta, value);
    if (alpha >= beta || checkpoint()) break;
  }
  if (value === -0x8000_0000 || value === 0x7fff_ffff) {
    value = staticScore(game, stateHash, context);
  }

  if (
    context.config.useTranspositionTable &&
    !stoppedByBudget &&
    cacheWriteAllowed()
  ) {
    const bound: TranspositionBound =
      value <= alphaBefore ? "upper" : value >= betaBefore ? "lower" : "exact";
    if (
      context.transposition.size >= context.config.transpositionCapacity &&
      !context.transposition.has(stateHash)
    ) {
      context.transposition.clear();
    }
    context.transposition.set(stateHash, {
      depth,
      score: value,
      bound,
      bestChildHash,
    });
  }
  return value;
}

function newContext(perspective: Color, config: SearchConfig): SearchContext {
  return {
    perspective,
    config,
    transposition: new Hash64Table<TranspositionEntry>(
      transpositionStorageCapacity(config.transpositionCapacity),
    ),
    extensionNodeBudget: config.enableSelectiveExtensions
      ? Math.max(
          1,
          Math.floor(
            (config.maxVisitedNodes * config.extensionNodeShareBp) / 10_000,
          ),
        )
      : 0,
    stats: {
      visitedNodes: 0,
      cacheHits: 0,
      quiescenceNodes: 0,
      extensionNodes: 0,
    },
  };
}

/**
 * Preserve the old Map-backed table's numeric-threshold behavior while giving
 * Hash64Table the positive safe-integer capacity its storage requires.
 */
function transpositionStorageCapacity(capacity: number): number {
  if (Number.isNaN(capacity) || capacity === Number.POSITIVE_INFINITY) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(capacity)));
}

function candidateWithCurrentStateHash(
  candidate: RootCandidate,
): RootCandidate {
  const stateHash = exactSearchStateHash(candidate.game);
  return hash64Equals(stateHash, candidate.stateHash)
    ? candidate
    : { ...candidate, stateHash };
}

function betterEvaluation(
  candidate: RootEvaluation,
  incumbent: RootEvaluation,
): boolean {
  return (
    candidate.score > incumbent.score ||
    (candidate.score === incumbent.score &&
      compareRootCandidates(candidate.candidate, incumbent.candidate) < 0)
  );
}

export function evaluateSearchScore(
  game: MonsGame,
  perspective: Color,
  depth: number,
  config: SearchConfig,
): number {
  const context = newContext(perspective, config);
  const stateHash = exactSearchStateHash(game);
  return boundedSearch(
    game,
    stateHash,
    Math.max(0, depth),
    -0x8000_0000,
    0x7fff_ffff,
    config.maxExtensionsPerPath,
    context,
  );
}

/**
 * Run only the legacy two-pass root allocator. The scout uses the same shared
 * search context and cumulative node accounting as the full root search, but
 * this seam deliberately stops before the later scored-root loop.
 */
export function focusRootCandidatesForSearch(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
  suppliedCandidates?: readonly RootCandidate[],
  options: SearchRootOptions = {},
  useTranspositionTable = config.useTranspositionTable,
): FocusedSearchRoots {
  const sourceFen = game.fen();
  const sourceCandidates = suppliedCandidates
    ? suppliedCandidates.map(candidateWithCurrentStateHash)
    : rankRootCandidates(game, perspective, config);
  let scoutContext: SearchContext | undefined;
  const focused = focusedRootCandidates({
    rootMoves: sourceCandidates,
    perspective,
    config,
    useTranspositionTable,
    ...(options.priorityInputs === undefined
      ? {}
      : { priorityInputs: options.priorityInputs }),
    ...(options.forcedInputs === undefined
      ? {}
      : { forcedInputs: options.forcedInputs }),
    ...(options.qualifiesPlainSpiritPlan === undefined
      ? {}
      : { qualifiesPlainSpiritPlan: options.qualifiesPlainSpiritPlan }),
    ...(options.qualifiesDrainerSafetyRecoveryPlan === undefined
      ? {}
      : {
          qualifiesDrainerSafetyRecoveryPlan:
            options.qualifiesDrainerSafetyRecoveryPlan,
        }),
    evaluateDeeperScout: (scout) => {
      scoutContext ??= newContext(perspective, {
        ...scout.config,
        useTranspositionTable: scout.useTranspositionTable,
      });
      scoutContext.stats.visitedNodes = Math.max(
        scoutContext.stats.visitedNodes,
        scout.visitedNodes,
      );
      const score = boundedSearch(
        scout.candidate.game,
        scout.candidate.stateHash,
        scout.depth,
        scout.alpha,
        0x7fff_ffff,
        0,
        scoutContext,
      );
      return {
        score,
        visitedNodes: scoutContext.stats.visitedNodes,
      };
    },
    checkpoint,
    cancelled,
  });
  if (game.fen() !== sourceFen) {
    throw new Error("root focus mutated its source game");
  }
  return {
    candidates: focused.candidates,
    scoutVisitedNodes: focused.scoutVisitedNodes,
  };
}

export function searchRootCandidates(
  game: MonsGame,
  perspective: Color,
  config: SearchConfig,
  suppliedCandidates?: readonly RootCandidate[],
  options: SearchRootOptions = {},
): SearchResult {
  const sourceFen = game.fen();
  const focused = focusRootCandidatesForSearch(
    game,
    perspective,
    config,
    suppliedCandidates,
    options,
  );
  const candidates = focused.candidates;
  const context = newContext(perspective, config);
  context.stats.visitedNodes = focused.scoutVisitedNodes;
  const evaluations: RootEvaluation[] = [];
  let best: RootEvaluation | undefined;
  let alpha = -0x8000_0000;
  for (const candidate of candidates) {
    if (context.stats.visitedNodes >= config.maxVisitedNodes || checkpoint()) {
      break;
    }
    context.stats.visitedNodes += 1;
    const score =
      config.depth <= 1
        ? candidate.heuristic
        : boundedSearch(
            candidate.game,
            candidate.stateHash,
            config.depth - 1,
            alpha,
            0x7fff_ffff,
            config.maxExtensionsPerPath,
            context,
          );
    const evaluation: RootEvaluation = {
      candidate,
      score,
      nodesAfter: context.stats.visitedNodes,
    };
    evaluations.push(evaluation);
    if (best === undefined || betterEvaluation(evaluation, best)) {
      best = evaluation;
    }
    alpha = Math.max(alpha, score);
  }
  if (game.fen() !== sourceFen) {
    throw new Error("bounded search mutated its source game");
  }
  return {
    best,
    evaluations,
    visitedNodes: context.stats.visitedNodes,
    cacheHits: context.stats.cacheHits,
    timedOut: cancelled(),
  };
}

export function selectSearchRoot(
  game: MonsGame,
  preference: SearchPreference,
): SearchResult {
  clearExactStateAnalysisCache();
  return searchRootCandidates(
    game,
    game.activeColor,
    searchConfigForPreference(game, preference),
  );
}

export function selectSearchInputs(
  game: MonsGame,
  preference: SearchPreference,
): readonly Input[] | undefined {
  return selectSearchRoot(game, preference).best?.candidate.inputs;
}

export function clearSearchCaches(): void {
  preferabilityCache.clear();
  clearMoveEfficiencyCache();
  clearExactStateAnalysisCache();
}
