import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exactSpies = vi.hoisted(() => ({
  opportunityContext: vi.fn(),
  tacticalProjection: vi.fn(),
}));

vi.mock("../../src/automove/exact.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/automove/exact.js")>();
  return {
    ...actual,
    exactOpportunityContextWithSearchHash: (
      ...args: Parameters<typeof actual.exactOpportunityContextWithSearchHash>
    ) => {
      exactSpies.opportunityContext(...args);
      return actual.exactOpportunityContextWithSearchHash(...args);
    },
    exactTurnTacticalProjectionWithSearchHash: (
      ...args: Parameters<
        typeof actual.exactTurnTacticalProjectionWithSearchHash
      >
    ) => exactSpies.tacticalProjection(...args),
  };
});

import {
  EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
  EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS,
  clearExactStateAnalysisCache,
  type ExactTurnTacticalProjection,
} from "../../src/automove/exact.js";
import { resetDeadlineStateForTesting } from "../../src/automove/deadline.js";
import { Color } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import { DEFAULT_SCORING_WEIGHTS } from "../../src/automove/scoring.js";
import {
  TurnEngineMode,
  TurnPlanFamily,
  clearTurnEnginePlanCache,
  discoverTurnOpportunities,
  type TurnEngineConfig,
} from "../../src/automove/turn-engine.js";

const EMPTY_PROJECTION: ExactTurnTacticalProjection = Object.freeze({
  safeSupermanaProgress: false,
  safeSupermanaProgressSteps: undefined,
  safeOpponentManaProgress: false,
  safeOpponentManaProgressSteps: undefined,
  spiritAssistedScore: false,
  spiritAssistedScoreValue: 0,
  spiritAssistedDenial: false,
  spiritAssistedDenialValue: 0,
  sameTurnScoreWindowValue: 0,
});

function config(lazy: boolean): TurnEngineConfig {
  return {
    mode: TurnEngineMode.CurrentPro,
    ownSeedCap: 14,
    ownBeam: 5,
    perNodeFamilyCap: 4,
    stepCap: 6,
    opponentSeedCap: 6,
    opponentBeam: 2,
    replySeedCap: 3,
    replyBeam: 1,
    expansionCap: 176,
    enableSpiritFamily: true,
    scoringWeights: DEFAULT_SCORING_WEIGHTS,
    enableLazyOracleScoreWindowProjection: lazy,
  };
}

function projectionFlags(): number[] {
  return exactSpies.tacticalProjection.mock.calls.map((call) =>
    Number(call[3]),
  );
}

beforeEach(() => {
  resetDeadlineStateForTesting();
  clearExactStateAnalysisCache();
  clearTurnEnginePlanCache();
  exactSpies.opportunityContext.mockClear();
  exactSpies.tacticalProjection.mockReset();
  exactSpies.tacticalProjection.mockReturnValue(EMPTY_PROJECTION);
});

afterEach(() => {
  resetDeadlineStateForTesting();
  clearExactStateAnalysisCache();
  clearTurnEnginePlanCache();
});

describe("turn-engine oracle projection planning", () => {
  it("reuses the opportunity context and skips projections for safety-only walks", () => {
    const game = new MonsGame();
    const opportunities = discoverTurnOpportunities(
      game,
      Color.White,
      config(false),
      16,
      [TurnPlanFamily.DrainerSafetyRecovery],
    );

    expect(exactSpies.opportunityContext).toHaveBeenCalledTimes(1);
    expect(exactSpies.tacticalProjection).not.toHaveBeenCalled();
    expect(
      opportunities.every(
        ({ family }) => family === TurnPlanFamily.DrainerSafetyRecovery,
      ),
    ).toBe(true);
  });

  it("requests only supermana and score-window fields in non-lazy mode", () => {
    discoverTurnOpportunities(new MonsGame(), Color.White, config(false), 16, [
      TurnPlanFamily.SafeSupermanaProgress,
    ]);

    const expectedFlags =
      EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS |
      EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW;
    expect(exactSpies.opportunityContext).toHaveBeenCalledTimes(1);
    expect(projectionFlags().length).toBeGreaterThan(0);
    expect(new Set(projectionFlags())).toEqual(new Set([expectedFlags]));
  });

  it("loads the lazy score-window projection only after progress improves", () => {
    discoverTurnOpportunities(new MonsGame(), Color.White, config(true), 16, [
      TurnPlanFamily.SafeSupermanaProgress,
    ]);

    expect(projectionFlags()).toContain(
      EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS,
    );
    expect(projectionFlags()).not.toContain(
      EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
    );
    expect(projectionFlags()).not.toContain(0b1_1111);

    clearExactStateAnalysisCache();
    exactSpies.opportunityContext.mockClear();
    exactSpies.tacticalProjection.mockReset();
    exactSpies.tacticalProjection.mockImplementation(
      (_game, _color, _hash, flags: number) =>
        flags === EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS
          ? {
              ...EMPTY_PROJECTION,
              safeSupermanaProgress: true,
              safeSupermanaProgressSteps: 0,
            }
          : EMPTY_PROJECTION,
    );

    discoverTurnOpportunities(new MonsGame(), Color.White, config(true), 16, [
      TurnPlanFamily.SafeSupermanaProgress,
    ]);

    expect(exactSpies.opportunityContext).toHaveBeenCalledTimes(1);
    expect(projectionFlags()).toContain(
      EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS,
    );
    expect(projectionFlags()).toContain(EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW);
    expect(projectionFlags()).not.toContain(0b1_1111);
  });
});
