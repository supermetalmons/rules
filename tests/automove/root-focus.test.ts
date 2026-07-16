import { describe, expect, it, vi } from "vitest";

import { I32_MAX, I32_MIN } from "../../src/engine/numerics.js";
import {
  compareRankedRootIndices,
  focusedRootCandidates,
  rootFocusScoutScore,
  rootScoutProgressBonus,
  rootVolatilityScore,
  type RootFocusCandidate,
  type RootFocusConfig,
  type RootFocusMoveClassFlags,
  type RootFocusScoutContext,
} from "../../src/automove/root-focus.js";

type TestCandidate = RootFocusCandidate & { readonly id: number };

type CandidateOverrides = Partial<Omit<TestCandidate, "classes" | "id">> & {
  readonly classes?: Partial<RootFocusMoveClassFlags>;
};

const EMPTY_CLASSES: RootFocusMoveClassFlags = Object.freeze({
  immediateScore: false,
  drainerAttack: false,
  drainerSafetyRecover: false,
  carrierProgress: false,
  material: false,
  quiet: true,
});

const BASE_CONFIG: RootFocusConfig = Object.freeze({
  depth: 3,
  maxVisitedNodes: 10_000,
  enableTwoPassRootAllocation: true,
  enableSelectiveExtensions: true,
  enableQuietReductions: true,
  enableTwoPassVolatilityFocus: false,
  enableTurnEngineSelector: false,
  turnEngineMode: 0,
});

function candidate(
  id: number,
  heuristic: number,
  overrides: CandidateOverrides = {},
): TestCandidate {
  return {
    id,
    inputs: [
      {
        kind: "location",
        location: { i: Math.trunc(id / 11), j: id % 11 },
      },
    ],
    game: { activeColor: 0 },
    heuristic,
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
    safeSupermanaProgressSteps: 15,
    safeOpponentManaProgressSteps: 15,
    scorePathBestSteps: 33,
    sameTurnScoreWindowValue: 0,
    spiritSameTurnScoreSetupNow: false,
    spiritOwnManaSetupNow: false,
    supermanaProgress: false,
    opponentManaProgress: false,
    ...overrides,
    classes: { ...EMPTY_CLASSES, ...overrides.classes },
  };
}

function ids(candidates: readonly TestCandidate[]): number[] {
  return candidates.map(({ id }) => id);
}

function inputsAt(
  candidates: readonly TestCandidate[],
  index: number,
): readonly TestCandidate["inputs"][number][] {
  const found = candidates[index];
  if (found === undefined) throw new RangeError("missing synthetic root");
  return found.inputs;
}

function unexpectedDeeperScout(): never {
  throw new Error("depth-one scout must not invoke the deeper callback");
}

describe("two-pass root focus", () => {
  it("matches progress, focus-score, saturation, and volatility arithmetic", () => {
    const progress = candidate(0, 100, {
      efficiency: 5,
      supermanaProgress: true,
      opponentManaProgress: true,
      safeSupermanaProgressSteps: 0,
      safeOpponentManaProgressSteps: 1,
    });
    expect(rootScoutProgressBonus(progress)).toBe(1_400);
    expect(rootFocusScoutScore(progress)).toBe(1_502);
    expect(
      rootFocusScoutScore(candidate(1, I32_MAX, { efficiency: 100 })),
    ).toBe(I32_MAX);
    expect(
      rootScoutProgressBonus(
        candidate(2, 0, {
          supermanaProgress: true,
          scoresSupermanaThisTurn: true,
          safeSupermanaProgressSteps: 0,
        }),
      ),
    ).toBe(0);

    const volatile = candidate(3, 0, {
      efficiency: -800,
      winsImmediately: true,
      attacksOpponentDrainer: true,
      ownDrainerVulnerable: true,
      manaHandoffToOpponent: true,
      hasRoundtrip: true,
      classes: {
        immediateScore: true,
        drainerAttack: true,
        drainerSafetyRecover: true,
        material: true,
      },
    });
    expect(rootVolatilityScore(volatile)).toBe(15_440);
  });

  it("bypasses focusing while preserving forced-first priority order", () => {
    const roots = [
      candidate(0, 400),
      candidate(1, 300),
      candidate(2, 200),
      candidate(3, 100),
    ];
    const evaluateDeeperScout = vi.fn(unexpectedDeeperScout);
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: { ...BASE_CONFIG, enableTwoPassRootAllocation: false },
      useTranspositionTable: true,
      forcedInputs: inputsAt(roots, 2),
      priorityInputs: [
        inputsAt(roots, 3),
        inputsAt(roots, 2),
        inputsAt(roots, 1),
      ],
      evaluateDeeperScout,
    });
    expect(ids(result.candidates)).toEqual([2, 3, 1, 0]);
    expect(result.scoutVisitedNodes).toBe(0);
    expect(evaluateDeeperScout).not.toHaveBeenCalled();
  });

  it("returns every ranked root and zero nodes for a narrow scout spread", () => {
    const roots = [0, 1, 2, 3].map((id) => candidate(id, 0));
    const scores = [1_000, 900, 800, 700];
    const evaluateDeeperScout = vi.fn(
      (context: RootFocusScoutContext<TestCandidate, RootFocusConfig>) => ({
        score: scores[context.candidateIndex] ?? I32_MIN,
        visitedNodes: context.visitedNodes + 1,
      }),
    );
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: { ...BASE_CONFIG, depth: 4, maxVisitedNodes: 1_000 },
      useTranspositionTable: true,
      priorityInputs: [inputsAt(roots, 3)],
      evaluateDeeperScout,
    });
    expect(ids(result.candidates)).toEqual([3, 0, 1, 2]);
    expect(result.scoutVisitedNodes).toBe(0);
    expect(evaluateDeeperScout).toHaveBeenCalledTimes(4);
  });

  it("keeps the top three, all roots inside the score margin, and stable ties", () => {
    const roots = [
      candidate(0, 5_000),
      candidate(1, 4_200),
      candidate(2, 4_100),
      candidate(3, 3_500),
      candidate(4, 1_000),
    ];
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: BASE_CONFIG,
      useTranspositionTable: true,
      evaluateDeeperScout: unexpectedDeeperScout,
    });
    expect(ids(result.candidates)).toEqual([0, 1, 2, 3]);
    expect(result.scoutVisitedNodes).toBe(0);

    const tied = [candidate(5, 0), candidate(6, 0)];
    expect(compareRankedRootIndices(tied, [0, 100], [1, 100])).toBeLessThan(0);
    const tactical = [
      candidate(7, 0),
      candidate(8, 0, { attacksOpponentDrainer: true }),
    ];
    expect(
      compareRankedRootIndices(tactical, [0, 100], [1, 100]),
    ).toBeGreaterThan(0);
  });

  it("strictly retains tactical, concrete-progress, priority, and forced roots", () => {
    const roots = [
      candidate(0, 5_000),
      candidate(1, 4_000),
      candidate(2, 3_000),
      candidate(3, 0, { attacksOpponentDrainer: true }),
      candidate(4, -100, { safeSupermanaPickupNow: true }),
      candidate(5, -200),
      candidate(6, -300),
      candidate(7, -400),
    ];
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: BASE_CONFIG,
      useTranspositionTable: true,
      priorityInputs: [inputsAt(roots, 5)],
      forcedInputs: inputsAt(roots, 6),
      evaluateDeeperScout: unexpectedDeeperScout,
    });
    expect(ids(result.candidates)).toEqual([6, 5, 0, 1, 2, 3, 4]);
  });

  it("retains two nearby plain-spirit plans and a safety-recovery plan", () => {
    const roots = [
      candidate(0, 5_000),
      candidate(1, 4_000),
      candidate(2, 3_000),
      candidate(3, 0, { spiritDevelopment: true }),
      candidate(4, -100, { spiritDevelopment: true }),
      candidate(5, -200, { ownDrainerVulnerable: true }),
      candidate(6, -300),
    ];
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: {
        ...BASE_CONFIG,
        enableTurnEngineSelector: true,
        turnEngineMode: 1,
      },
      useTranspositionTable: true,
      evaluateDeeperScout: unexpectedDeeperScout,
      qualifiesPlainSpiritPlan: ({ id }) => id === 3 || id === 4,
      qualifiesDrainerSafetyRecoveryPlan: ({ id }) => id === 5,
    });
    expect(ids(result.candidates)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("retains the two strongest volatility roots even outside scout margin", () => {
    const roots = [
      candidate(0, 5_000),
      candidate(1, 4_000),
      candidate(2, 3_000),
      candidate(3, 0, { ownDrainerVulnerable: true }),
      candidate(4, -100, { classes: { immediateScore: true } }),
      candidate(5, -200, {
        classes: { drainerSafetyRecover: true },
      }),
    ];
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: { ...BASE_CONFIG, enableTwoPassVolatilityFocus: true },
      useTranspositionTable: true,
      evaluateDeeperScout: unexpectedDeeperScout,
    });
    expect(ids(result.candidates)).toEqual([0, 1, 2, 3, 4]);
  });

  it("carries absolute scout-node counts and alpha between deep scouts", () => {
    const roots = [0, 1, 2, 3].map((id) => candidate(id, 0));
    const scores = [5_000, 4_000, 3_000, 0];
    const seenNodes: number[] = [];
    const seenAlphas: number[] = [];
    const evaluateDeeperScout = vi.fn(
      (context: RootFocusScoutContext<TestCandidate, RootFocusConfig>) => {
        seenNodes.push(context.visitedNodes);
        seenAlphas.push(context.alpha);
        expect(context.depth).toBe(1);
        expect(context.config).toMatchObject({
          depth: 2,
          maxVisitedNodes: 300,
          enableSelectiveExtensions: false,
          enableQuietReductions: false,
        });
        return {
          score: scores[context.candidateIndex] ?? I32_MIN,
          visitedNodes: context.visitedNodes + 2,
        };
      },
    );
    const result = focusedRootCandidates({
      rootMoves: roots,
      perspective: 0,
      config: { ...BASE_CONFIG, depth: 4, maxVisitedNodes: 1_000 },
      useTranspositionTable: true,
      evaluateDeeperScout,
    });
    expect(ids(result.candidates)).toEqual([0, 1, 2]);
    expect(result.scoutVisitedNodes).toBe(12);
    expect(seenNodes).toEqual([1, 4, 7, 10]);
    expect(seenAlphas).toEqual([I32_MIN, 5_000, 5_000, 5_000]);
  });
});
