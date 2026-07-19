import { describe, expect, it, vi } from "vitest";

import { BOARD_SIZE } from "../../src/engine/config.js";
import type { Input } from "../../src/engine/domain.js";
import { I32_MIN } from "../../src/engine/numerics.js";
import {
  compareRankedRootIndices,
  compareTacticalRootCandidates,
  focusedRootCandidates,
  prioritizeRootInputs,
  rootProgressStepsBetter,
  rootScorePathStepsBetter,
  type RootFocusCandidate,
  type RootFocusConfig,
  type RootFocusMoveClassFlags,
} from "../../src/automove/root-focus.js";

type TestCandidate = RootFocusCandidate & {
  readonly id: string;
};

type CandidateOverrides = Partial<
  Omit<TestCandidate, "id" | "inputs" | "game" | "classes">
> & {
  readonly activeColor?: number;
  readonly classes?: Partial<RootFocusMoveClassFlags>;
};

const DEFAULT_CLASSES: RootFocusMoveClassFlags = Object.freeze({
  immediateScore: false,
  drainerAttack: false,
  drainerSafetyRecover: false,
  carrierProgress: false,
  material: false,
  quiet: true,
});

function candidate(
  id: string,
  inputIndex: number,
  overrides: CandidateOverrides = {},
): TestCandidate {
  const {
    activeColor = 0,
    classes: classOverrides,
    ...candidateOverrides
  } = overrides;
  return {
    id,
    inputs: [
      {
        kind: "location",
        location: { i: inputIndex, j: 0 },
      },
    ],
    game: { activeColor },
    heuristic: 0,
    efficiency: 0,
    winsImmediately: false,
    attacksOpponentDrainer: false,
    ownDrainerVulnerable: false,
    ownDrainerWalkVulnerable: false,
    spiritDevelopment: false,
    manaHandoffToOpponent: false,
    hasRoundtrip: false,
    scoresSupermanaThisTurn: false,
    scoresOpponentManaThisTurn: false,
    safeSupermanaPickupNow: false,
    safeOpponentManaPickupNow: false,
    safeSupermanaProgressSteps: BOARD_SIZE + 4,
    safeOpponentManaProgressSteps: BOARD_SIZE + 4,
    scorePathBestSteps: BOARD_SIZE * 3,
    sameTurnScoreWindowValue: 0,
    spiritSameTurnScoreSetupNow: false,
    spiritOwnManaSetupNow: false,
    supermanaProgress: false,
    opponentManaProgress: false,
    classes: { ...DEFAULT_CLASSES, ...classOverrides },
    ...candidateOverrides,
  };
}

function config(overrides: Partial<RootFocusConfig> = {}): RootFocusConfig {
  return {
    depth: 4,
    maxVisitedNodes: 1_000,
    enableTwoPassRootAllocation: true,
    enableSelectiveExtensions: true,
    enableQuietReductions: true,
    enableTwoPassVolatilityFocus: false,
    enableTurnEngineSelector: false,
    turnEngineMode: 0,
    ...overrides,
  };
}

function ids(candidates: readonly TestCandidate[]): string[] {
  return candidates.map(({ id }) => id);
}

describe("root focus ordering", () => {
  it("preserves the tactical comparator sequence and sign", () => {
    const quiet = candidate("quiet", 0, {
      heuristic: 10_000,
      efficiency: 10_000,
    });
    const immediate = candidate("immediate", 1, {
      heuristic: -10_000,
      classes: { immediateScore: true, quiet: false },
    });
    const winning = candidate("winning", 2, {
      heuristic: -20_000,
      winsImmediately: true,
    });

    expect(compareTacticalRootCandidates(winning, immediate)).toBeLessThan(0);
    expect(compareTacticalRootCandidates(immediate, quiet)).toBeLessThan(0);
    expect(compareTacticalRootCandidates(quiet, quiet)).toBe(0);
  });

  it("uses the original index as the final ranked tie-break", () => {
    const roots = [
      candidate("first", 0),
      candidate("second", 1),
      candidate("third", 2),
    ];
    const ranked: [number, number][] = [
      [2, 100],
      [0, 100],
      [1, 100],
    ];

    ranked.sort((left, right) => compareRankedRootIndices(roots, left, right));
    expect(ranked.map(([index]) => index)).toEqual([0, 1, 2]);
  });

  it("distinguishes known progress and score-path steps", () => {
    expect(rootProgressStepsBetter(2, BOARD_SIZE + 4)).toBe(true);
    expect(rootProgressStepsBetter(2, 3)).toBe(true);
    expect(rootProgressStepsBetter(3, 2)).toBe(false);
    expect(rootProgressStepsBetter(BOARD_SIZE + 4, BOARD_SIZE + 4)).toBe(false);

    expect(rootScorePathStepsBetter(4, BOARD_SIZE * 3)).toBe(true);
    expect(rootScorePathStepsBetter(4, 5)).toBe(true);
    expect(rootScorePathStepsBetter(5, 4)).toBe(false);
  });

  it("promotes forced input first and deduplicated priorities afterward", () => {
    const roots = [
      candidate("a", 0),
      candidate("b", 1),
      candidate("c", 2),
      candidate("d", 3),
    ];
    const input = (index: number): readonly Input[] =>
      roots[index]?.inputs ?? [];

    expect(
      ids(
        prioritizeRootInputs(roots, [input(2), input(1), input(2)], input(3)),
      ),
    ).toEqual(["d", "c", "b", "a"]);
  });
});

describe("two-pass root allocation", () => {
  it("owns cumulative scout accounting and retains a forced root", () => {
    const roots = [
      candidate("a", 0, { heuristic: 5_000 }),
      candidate("b", 1, { heuristic: 3_000 }),
      candidate("c", 2, { heuristic: 1_000 }),
      candidate("d", 3, { heuristic: -1_000 }),
      candidate("e", 4, { heuristic: -3_000 }),
    ];
    const visitedAtEntry: number[] = [];
    const alphaAtEntry: number[] = [];
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: config(),
      useTranspositionTable: true,
      forcedInputs: roots[4]?.inputs ?? [],
      evaluateDeeperScout: (context) => {
        visitedAtEntry.push(context.visitedNodes);
        alphaAtEntry.push(context.alpha);
        expect(context.depth).toBe(1);
        expect(context.config.depth).toBe(2);
        expect(context.config.maxVisitedNodes).toBe(300);
        expect(context.config.enableSelectiveExtensions).toBe(false);
        expect(context.config.enableQuietReductions).toBe(false);
        return {
          score: context.candidate.heuristic,
          visitedNodes: context.visitedNodes + 9,
        };
      },
    });

    expect(visitedAtEntry).toEqual([1, 11, 21, 31, 41]);
    expect(alphaAtEntry).toEqual([I32_MIN, 5_000, 5_000, 5_000, 5_000]);
    expect(result.scoutVisitedNodes).toBe(50);
    expect(ids(result.candidates)).toEqual(["e", "a", "b", "c"]);
  });

  it("falls back cleanly when the maximum scout budget is below the minimum", () => {
    const roots = [
      candidate("a", 0),
      candidate("b", 1),
      candidate("c", 2),
      candidate("d", 3),
    ];
    const evaluate = vi.fn();

    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: config({ maxVisitedNodes: 64 }),
      useTranspositionTable: true,
      forcedInputs: roots[3]?.inputs ?? [],
      evaluateDeeperScout: evaluate,
    });

    expect(result).toEqual({
      candidates: [roots[3], roots[0], roots[1], roots[2]],
      scoutVisitedNodes: 0,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("uses the effective ranked best after an incomplete scout", () => {
    const roots = [
      candidate("evaluated", 0),
      candidate("best-fallback", 1, { heuristic: 10_000 }),
      candidate("second-fallback", 2, { heuristic: 9_000 }),
      candidate("third-fallback", 3, { heuristic: 8_000 }),
      candidate("outside-margin", 4, { heuristic: 7_000 }),
    ];
    const evaluate = vi.fn(() => ({
      score: 0,
      visitedNodes: 96,
    }));

    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: config({ maxVisitedNodes: 97 }),
      useTranspositionTable: true,
      evaluateDeeperScout: evaluate,
    });

    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(result.scoutVisitedNodes).toBe(96);
    expect(ids(result.candidates)).toEqual([
      "best-fallback",
      "second-fallback",
      "third-fallback",
    ]);
  });

  it("does not treat a legitimate minimum i32 scout score as unvisited", () => {
    const roots = [
      candidate("minimum", 0, { heuristic: 50_000 }),
      candidate("best", 1),
      candidate("second", 2),
      candidate("third", 3),
    ];
    const scores = [I32_MIN, 10_000, 7_000, 4_000];
    const evaluate = vi.fn((context: { readonly candidateIndex: number }) => ({
      score: scores[context.candidateIndex] ?? 0,
      visitedNodes: context.candidateIndex + 1,
    }));

    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: config(),
      useTranspositionTable: true,
      evaluateDeeperScout: evaluate,
    });

    expect(evaluate).toHaveBeenCalledTimes(4);
    expect(ids(result.candidates)).toEqual(["best", "second", "third"]);
  });

  it("falls back to all ranked roots and releases scout charge for a narrow spread", () => {
    const roots = [
      candidate("a", 0),
      candidate("b", 1),
      candidate("c", 2),
      candidate("d", 3),
    ];
    const scores = [1_000, 900, 800, 700];
    const evaluate = vi.fn((context: { readonly candidateIndex: number }) => ({
      score: scores[context.candidateIndex] ?? 0,
      visitedNodes: (context.candidateIndex + 1) * 10,
    }));
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: config(),
      useTranspositionTable: true,
      evaluateDeeperScout: evaluate,
    });

    expect(evaluate).toHaveBeenCalledTimes(4);
    expect(result.scoutVisitedNodes).toBe(0);
    expect(ids(result.candidates)).toEqual(["a", "b", "c", "d"]);
  });

  it("retains a volatile root outside the default focus count", () => {
    const roots = [
      candidate("a", 0, { heuristic: 6_000 }),
      candidate("b", 1, { heuristic: 4_000 }),
      candidate("c", 2, { heuristic: 2_000 }),
      candidate("volatile", 3, {
        heuristic: -2_000,
        ownDrainerVulnerable: true,
      }),
    ];
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: config({
        depth: 3,
        enableTwoPassVolatilityFocus: true,
      }),
      useTranspositionTable: true,
      evaluateDeeperScout: vi.fn(),
    });

    expect(result.scoutVisitedNodes).toBe(0);
    expect(ids(result.candidates)).toEqual(["a", "b", "c", "volatile"]);
  });

  it("returns no candidates when cancelled before allocation", () => {
    const evaluate = vi.fn();
    const result = focusedRootCandidates({
      rootMoves: [candidate("a", 0), candidate("b", 1)],
      perspective: 0,
      config: config(),
      useTranspositionTable: true,
      evaluateDeeperScout: evaluate,
      checkpoint: () => true,
    });

    expect(result).toEqual({ candidates: [], scoutVisitedNodes: 0 });
    expect(evaluate).not.toHaveBeenCalled();
  });
});
