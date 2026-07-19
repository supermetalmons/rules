import { describe, expect, it } from "vitest";

import { GameVariant } from "../../src/engine/config.js";
import { Color, type Input } from "../../src/engine/domain.js";
import { inputArrayFen } from "../../src/engine/fen.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  clearSearchCaches,
  compareRankedChildren,
  enforceTacticalChildTop2,
  flattenRootEvaluations,
  isPriorityChild,
  isQuietReductionCandidate,
  isSelectiveExtensionCandidate,
  searchRootCandidates,
  truncateChildrenWithCoverage,
  type RankedChild,
  type SearchResult,
} from "../../src/automove/search.js";
import { hash64 } from "../../src/automove/hash64.js";
import {
  rankRootCandidates,
  type MoveClassFlags,
} from "../../src/automove/root-candidates.js";
import { searchExecutionConfigForGame } from "../../src/automove/selector-config.js";

const QUIET_CLASSES: MoveClassFlags = Object.freeze({
  immediateScore: false,
  drainerAttack: false,
  drainerSafetyRecover: false,
  carrierProgress: false,
  material: false,
  quiet: true,
});

type ChildOverrides = Partial<
  Omit<RankedChild, "game" | "hash" | "classes">
> & {
  readonly classes?: Partial<MoveClassFlags>;
};

function child(id: number, overrides: ChildOverrides = {}): RankedChild {
  const { classes: classOverrides, ...childOverrides } = overrides;
  return {
    game: {} as MonsGame,
    hash: hash64(0, id),
    heuristic: 0,
    orderingEfficiency: 0,
    tacticalExtensionTrigger: false,
    quietReductionCandidate: true,
    classes: { ...QUIET_CLASSES, ...classOverrides },
    ...childOverrides,
  };
}

function selectedInput(result: SearchResult): string | undefined {
  return result.best === undefined
    ? undefined
    : inputArrayFen(result.best.candidate.inputs);
}

function observations(result: SearchResult): readonly object[] {
  return result.evaluations.map((evaluation) => ({
    inputs: inputArrayFen(evaluation.candidate.inputs),
    score: evaluation.score,
    nodesAfter: evaluation.nodesAfter,
  }));
}

describe("ranked search children", () => {
  it("orders heuristic by side, then efficiency, class, and descending hash", () => {
    const lower = child(1, { heuristic: 10 });
    const higher = child(2, { heuristic: 20 });
    expect(compareRankedChildren(higher, lower, true)).toBeLessThan(0);
    expect(compareRankedChildren(lower, higher, false)).toBeLessThan(0);

    const efficient = child(1, { orderingEfficiency: 10 });
    expect(compareRankedChildren(efficient, child(2), true)).toBeLessThan(0);

    const tactical = child(1, {
      classes: { drainerSafetyRecover: true, quiet: false },
    });
    expect(compareRankedChildren(tactical, child(2), true)).toBeLessThan(0);

    expect(compareRankedChildren(child(2), child(1), true)).toBeLessThan(0);
    expect(compareRankedChildren(child(1), child(1), true) === 0).toBe(true);
  });

  it("preserves the first tactical child beyond a strict branch limit", () => {
    const children = [
      child(1, { heuristic: 100 }),
      child(2, { heuristic: 90 }),
      child(3, {
        heuristic: 10,
        classes: { immediateScore: true, quiet: false },
      }),
      child(4),
    ];

    expect(
      truncateChildrenWithCoverage(children, 2, true).map(
        ({ hash }) => hash.lo,
      ),
    ).toEqual([1, 3]);
    expect(truncateChildrenWithCoverage(children, 0, true)).toEqual(children);
  });

  it("moves a tactical child into the top two without re-sorting", () => {
    const children = [
      child(1, { heuristic: 100 }),
      child(2, { heuristic: 90 }),
      child(3, {
        heuristic: 10,
        classes: { carrierProgress: true, quiet: false },
      }),
      child(4),
    ];

    enforceTacticalChildTop2(children, true);
    expect(children.map(({ hash }) => hash.lo)).toEqual([1, 3, 2, 4]);
    const promoted = children[1];
    expect(promoted === undefined ? false : isPriorityChild(promoted)).toBe(
      true,
    );
  });

  it("keeps reduction and extension predicates mutually explicit", () => {
    expect(isQuietReductionCandidate(0, false, QUIET_CLASSES)).toBe(true);
    expect(isQuietReductionCandidate(1, false, QUIET_CLASSES)).toBe(false);
    expect(isSelectiveExtensionCandidate(true, 0, QUIET_CLASSES)).toBe(true);
    expect(
      isSelectiveExtensionCandidate(false, 1, {
        ...QUIET_CLASSES,
        quiet: false,
      }),
    ).toBe(true);
  });
});

describe("root search orchestration", () => {
  it("is deterministic, cumulative, priority-aware, and source-immutable", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const before = game.fen();
    const base = searchExecutionConfigForGame(game, "fast");
    const config = {
      ...base,
      depth: 1,
      maxVisitedNodes: 64,
      enableTwoPassRootAllocation: false,
    };
    const candidates = rankRootCandidates(game, Color.White, config).slice(
      0,
      6,
    );
    expect(candidates.length).toBeGreaterThan(3);
    const priorityInputs: readonly (readonly Input[])[] = [
      candidates.at(-1)?.inputs ?? [],
    ];

    const first = searchRootCandidates(game, Color.White, config, candidates, {
      priorityInputs,
    });
    const second = searchRootCandidates(game, Color.White, config, candidates, {
      priorityInputs,
    });

    expect(game.fen()).toBe(before);
    expect(observations(second)).toEqual(observations(first));
    expect(selectedInput(second)).toBe(selectedInput(first));
    expect(first.visitedNodes).toBe(first.evaluations.length);
    expect(first.evaluations.map(({ nodesAfter }) => nodesAfter)).toEqual(
      first.evaluations.map((_evaluation, index) => index + 1),
    );
    expect(inputArrayFen(first.evaluations[0]?.candidate.inputs ?? [])).toBe(
      inputArrayFen(priorityInputs[0] ?? []),
    );

    const flattened = flattenRootEvaluations(first.evaluations);
    expect(flattened.map(({ score }) => score)).toEqual(
      first.evaluations.map(({ score }) => score),
    );
    expect(flattened.map(({ nodesAfter }) => nodesAfter)).toEqual(
      first.evaluations.map(({ nodesAfter }) => nodesAfter),
    );
  });

  it("keeps a deeper two-pass search deterministic without mutating any game", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const sourceFen = game.fen();
    const base = searchExecutionConfigForGame(game, "fast");
    const config = {
      ...base,
      depth: 4,
      maxVisitedNodes: 256,
      rootEnumLimit: 24,
      rootBranchLimit: 8,
      nodeEnumLimit: 12,
      nodeBranchLimit: 4,
      enableTwoPassRootAllocation: true,
      enableTwoPassVolatilityFocus: false,
      enableSelectiveExtensions: false,
      enableQuietReductions: false,
      enableQuiescenceSearch: false,
      enableFutilityPruning: false,
      enableTurnEngineSelector: false,
    };
    const candidates = rankRootCandidates(game, Color.White, config).slice(
      0,
      6,
    );
    expect(candidates.length).toBeGreaterThan(3);
    const candidateFens = candidates.map(({ game: candidateGame }) =>
      candidateGame.fen(),
    );

    clearSearchCaches();
    const first = searchRootCandidates(game, Color.White, config, candidates);
    clearSearchCaches();
    const second = searchRootCandidates(game, Color.White, config, candidates);

    expect(game.fen()).toBe(sourceFen);
    expect(
      candidates.map(({ game: candidateGame }) => candidateGame.fen()),
    ).toEqual(candidateFens);
    expect(first.evaluations.length).toBeGreaterThan(0);
    expect(observations(second)).toEqual(observations(first));
    expect(selectedInput(second)).toBe(selectedInput(first));
    expect(first.visitedNodes).toBe(first.evaluations.at(-1)?.nodesAfter ?? 0);
    expect(
      first.evaluations.every(
        ({ nodesAfter }, index, evaluations) =>
          index === 0 || nodesAfter > (evaluations[index - 1]?.nodesAfter ?? 0),
      ),
    ).toBe(true);
  });
});
