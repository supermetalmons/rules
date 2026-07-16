import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fallbackProbe = vi.hoisted(() => ({
  opportunityCalls: new Map<string, number>(),
}));

vi.mock("../../src/automove/exact.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/automove/exact.js")>();
  return {
    ...actual,
    exactOpportunityContextWithSearchHash: (
      _game: Parameters<typeof actual.exactOpportunityContextWithSearchHash>[0],
      perspective: Parameters<
        typeof actual.exactOpportunityContextWithSearchHash
      >[1],
      stateHash: Parameters<
        typeof actual.exactOpportunityContextWithSearchHash
      >[2],
    ) => {
      const key = `${perspective}:${stateHash.hi}:${stateHash.lo}`;
      fallbackProbe.opportunityCalls.set(
        key,
        (fallbackProbe.opportunityCalls.get(key) ?? 0) + 1,
      );
      return {
        budget: {
          remainingMonMoves: 0,
          canUseAction: false,
          canMoveMana: false,
        },
        turn: {
          safeSupermanaProgress: false,
          safeSupermanaProgressSteps: undefined,
          safeOpponentManaProgress: false,
          safeOpponentManaProgressSteps: undefined,
          spiritAssistedScore: false,
          spiritAssistedScoreValue: 0,
          spiritAssistedDenial: false,
          spiritAssistedDenialValue: 0,
          sameTurnScoreWindowValue: 0,
        },
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
      } satisfies ReturnType<
        typeof actual.exactOpportunityContextWithSearchHash
      >;
    },
  };
});

import { clearExactStateAnalysisCache } from "../../src/automove/exact.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import { DEFAULT_SCORING_WEIGHTS } from "../../src/automove/scoring.js";
import { applyInputsForSearch } from "../../src/automove/transitions.js";
import {
  TurnEngineMode,
  clearTurnEnginePlanCache,
  turnEngineCandidatePlan,
  type TurnEngineConfig,
} from "../../src/automove/turn-engine.js";
import { MONS_MOVES_PER_TURN } from "../../src/engine/config.js";
import { Color } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";

const CONFIG: TurnEngineConfig = Object.freeze({
  mode: TurnEngineMode.CurrentPro,
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
});

beforeEach(() => {
  fallbackProbe.opportunityCalls.clear();
  resetDeadlineStateForTesting();
  clearExactStateAnalysisCache();
  clearTurnEnginePlanCache();
});

afterEach(() => {
  resetDeadlineStateForTesting();
  clearExactStateAnalysisCache();
  clearTurnEnginePlanCache();
});

describe("turn-engine general fallback", () => {
  it("evaluates each fallback reply state once and returns a legal plan", () => {
    const game = new MonsGame();
    game.turnNumber = 3;
    game.actionsUsedCount = 1;
    game.manaMovesCount = 1;
    game.monsMovesCount = MONS_MOVES_PER_TURN - 1;
    const fenBefore = game.fen();

    const plan = withAutomoveClock({ now: () => 1_000 }, () =>
      withDeadlineIfAbsent(10_000, () =>
        turnEngineCandidatePlan(game, Color.White, CONFIG),
      ),
    );

    expect(plan?.compiledChunks).toHaveLength(1);
    const firstChunk = plan?.compiledChunks[0];
    expect(firstChunk).toBeDefined();
    const replay =
      firstChunk === undefined
        ? undefined
        : applyInputsForSearch(game, firstChunk);
    expect(replay?.fen()).toBe(plan?.endGame.fen());
    expect(game.fen()).toBe(fenBefore);

    const blackReplyCounts = [...fallbackProbe.opportunityCalls]
      .filter(([key]) => key.startsWith(`${Color.Black}:`))
      .map(([, count]) => count);
    expect(blackReplyCounts.length).toBeGreaterThan(0);
    expect(new Set(blackReplyCounts)).toEqual(new Set([1]));
  });
});
