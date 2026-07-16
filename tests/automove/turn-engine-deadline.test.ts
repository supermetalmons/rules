import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DeadlineProbe = {
  expiredAfterFirstFamily: boolean;
  postExpirySearchHashCalls: number;
  opportunityContextOverride: unknown;
};

const deadlineProbe: DeadlineProbe = vi.hoisted(() => ({
  expiredAfterFirstFamily: false,
  postExpirySearchHashCalls: 0,
  opportunityContextOverride: undefined,
}));

vi.mock("../../src/automove/exact.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/automove/exact.js")>();
  return {
    ...actual,
    exactSearchStateHash: (
      ...args: Parameters<typeof actual.exactSearchStateHash>
    ) => {
      if (deadlineProbe.expiredAfterFirstFamily) {
        deadlineProbe.postExpirySearchHashCalls += 1;
      }
      return actual.exactSearchStateHash(...args);
    },
    exactOpportunityContextWithSearchHash: (
      ...args: Parameters<typeof actual.exactOpportunityContextWithSearchHash>
    ) =>
      deadlineProbe.opportunityContextOverride === undefined
        ? actual.exactOpportunityContextWithSearchHash(...args)
        : (deadlineProbe.opportunityContextOverride as ReturnType<
            typeof actual.exactOpportunityContextWithSearchHash
          >),
  };
});

import {
  resetDeadlineStateForTesting,
  takePreviousTimeout,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import type { ExactOpportunityContext } from "../../src/automove/exact.js";
import { DEFAULT_SCORING_WEIGHTS } from "../../src/automove/scoring.js";
import {
  TurnEngineMode,
  clearTurnEnginePlanCache,
  turnEngineCacheSizesForTesting,
  turnEngineCandidatePlan,
  type TurnEngineConfig,
} from "../../src/automove/turn-engine.js";
import { Color } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";

const CURRENT_PRO_CONTEXT: ExactOpportunityContext = Object.freeze({
  budget: Object.freeze({
    remainingMonMoves: 3,
    canUseAction: true,
    canMoveMana: true,
  }),
  turn: Object.freeze({
    safeSupermanaProgress: false,
    safeSupermanaProgressSteps: undefined,
    safeOpponentManaProgress: false,
    safeOpponentManaProgressSteps: undefined,
    spiritAssistedScore: false,
    spiritAssistedScoreValue: 0,
    spiritAssistedDenial: false,
    spiritAssistedDenialValue: 0,
    sameTurnScoreWindowValue: 0,
  }),
  delta: Object.freeze({
    sameTurnScoreWindowValue: 0,
    spiritGain: 0,
    opponentWindowDenyGain: 0,
    drainerAttackAvailable: false,
    drainerSafety: 0,
    safeSupermanaProgressSteps: undefined,
    safeOpponentManaProgressSteps: undefined,
  }),
  opponentCanWinImmediately: false,
});

function config(mode: TurnEngineMode): TurnEngineConfig {
  return {
    mode,
    ownSeedCap: 4,
    ownBeam: 2,
    perNodeFamilyCap: 2,
    stepCap: 2,
    opponentSeedCap: 1,
    opponentBeam: 1,
    replySeedCap: 0,
    replyBeam: 0,
    expansionCap: 24,
    enableSpiritFamily: true,
    scoringWeights: DEFAULT_SCORING_WEIGHTS,
    enableLazyOracleScoreWindowProjection: false,
  };
}

function expireAfterFirstImmediateScoreScan(game: MonsGame): {
  readonly now: () => number;
  readonly occupiedSpy: ReturnType<typeof vi.spyOn>;
} {
  const occupied = game.board.occupied.bind(game.board);
  let currentTime = 0;
  let firstScan = true;
  const occupiedSpy = vi
    .spyOn(game.board, "occupied")
    .mockImplementation(function* () {
      yield* occupied();
      if (firstScan) {
        firstScan = false;
        deadlineProbe.expiredAfterFirstFamily = true;
        currentTime = 10;
      }
    });
  return { now: () => currentTime, occupiedSpy };
}

function expectFirstFamilyDeadline(mode: TurnEngineMode): void {
  const game = new MonsGame();
  const before = game.fen();
  const clock = expireAfterFirstImmediateScoreScan(game);
  if (mode === TurnEngineMode.CurrentPro) {
    deadlineProbe.opportunityContextOverride = CURRENT_PRO_CONTEXT;
  }

  const plan = withAutomoveClock(clock, () =>
    withDeadlineIfAbsent(10, () =>
      turnEngineCandidatePlan(game, Color.White, config(mode)),
    ),
  );

  expect(plan).toBeUndefined();
  expect(takePreviousTimeout()).toBe(true);
  expect(clock.occupiedSpy).toHaveBeenCalledTimes(1);
  expect(deadlineProbe.postExpirySearchHashCalls).toBe(0);
  expect(turnEngineCacheSizesForTesting().noPlans).toBe(0);
  expect(game.fen()).toBe(before);
}

beforeEach(() => {
  resetDeadlineStateForTesting();
  clearTurnEnginePlanCache();
  deadlineProbe.expiredAfterFirstFamily = false;
  deadlineProbe.postExpirySearchHashCalls = 0;
  deadlineProbe.opportunityContextOverride = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  resetDeadlineStateForTesting();
  clearTurnEnginePlanCache();
});

describe("turn-engine seed-generation deadlines", () => {
  it("unwinds CurrentPro after the first seed-family scan without caching no-plan", () => {
    expectFirstFamilyDeadline(TurnEngineMode.CurrentPro);
  });

  it("unwinds ProV1 after the first seed-family scan without caching no-plan", () => {
    expectFirstFamilyDeadline(TurnEngineMode.ProV1);
  });
});
