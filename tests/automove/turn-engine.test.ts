import { describe, expect, it } from "vitest";

import { Color } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import { DEFAULT_SCORING_WEIGHTS } from "../../src/automove/scoring.js";
import {
  applyInputsForSearch,
  compareInputChains,
  enumerateLegalTransitions,
} from "../../src/automove/transitions.js";
import {
  OpportunityKind,
  TurnEngineMode,
  TurnEngineUtility,
  TurnPlanFamily,
  clearTurnEnginePlanCache,
  compareTurnEngineUtilities,
  compareUtilityPrimaryAxes,
  turnEngineCacheSizesForTesting,
  turnEngineCachedStep,
  turnEngineCandidatePlan,
  turnEngineCandidatePlanFromAllowedHeads,
  turnEngineCommitPlan,
  turnEngineComparePlans,
  turnEngineNextInputsFromAllowedHeads,
  turnEngineStoreCachedStep,
  type TurnEngineConfig,
  type TurnPlan,
} from "../../src/automove/turn-engine.js";

const TEST_CONFIG: TurnEngineConfig = Object.freeze({
  mode: TurnEngineMode.ProV1,
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

const CURRENT_PRO_CONFIG: TurnEngineConfig = Object.freeze({
  ...TEST_CONFIG,
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
});

function fixedClock<T>(operation: () => T): T {
  return withAutomoveClock({ now: () => 1_000 }, () =>
    withDeadlineIfAbsent(10_000, operation),
  );
}

function tinyPlan(overrides: Partial<TurnPlan> = {}): TurnPlan {
  const game = new MonsGame();
  const utility = new TurnEngineUtility();
  return {
    actions: [],
    compiledChunks: [],
    endGame: game,
    utility,
    headUtility: utility,
    headFamily: TurnPlanFamily.ManaTempo,
    goalFamily: TurnPlanFamily.ManaTempo,
    packageMeta: {
      scoreGain: 0,
      denyGain: 0,
      drainerSafetyDelta: 0,
      spiritOnlySetup: false,
      endsNonnegativeDrainerSafety: false,
      opponentImmediateWindowAfter: 0,
    },
    ...overrides,
  };
}

describe("turn-engine value contract", () => {
  it("keeps Rust declaration ordinals for modes, families, and opportunities", () => {
    expect([TurnEngineMode.ProV1, TurnEngineMode.CurrentPro]).toEqual([0, 1]);
    expect([
      TurnPlanFamily.ImmediateScore,
      TurnPlanFamily.DenyOpponentWindow,
      TurnPlanFamily.DrainerKill,
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
      TurnPlanFamily.DrainerSafetyRecovery,
      TurnPlanFamily.SpiritImpact,
      TurnPlanFamily.ManaTempo,
    ]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect([
      OpportunityKind.ImmediateScore,
      OpportunityKind.TacticalDeny,
      OpportunityKind.DrainerKill,
      OpportunityKind.SafeSupermanaProgress,
      OpportunityKind.SafeOpponentManaProgress,
      OpportunityKind.DrainerSafetyRecovery,
      OpportunityKind.SpiritImpact,
      OpportunityKind.ManaTempo,
    ]).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(Object.isFrozen(TurnEngineMode)).toBe(true);
    expect(Object.isFrozen(TurnPlanFamily)).toBe(true);
  });

  it("orders utilities by the exact Rust tuple", () => {
    const baseline = new TurnEngineUtility({
      winState: 1,
      avoidImmediateLoss: 1,
      scoreDelta: 100,
      denyGain: 20,
      drainerAttack: 0,
      drainerSafety: 2,
      evalScore: 400,
    });
    const sharedValues = {
      winState: 1,
      avoidImmediateLoss: 1,
      scoreDelta: 100,
      denyGain: 20,
      drainerAttack: 0,
      drainerSafety: 2,
      evalScore: 400,
    };
    const betterPrimary = new TurnEngineUtility({
      ...sharedValues,
      drainerSafety: 3,
    });
    const betterEvalOnly = new TurnEngineUtility({
      ...sharedValues,
      evalScore: 401,
    });

    expect(compareTurnEngineUtilities(betterPrimary, baseline)).toBe(1);
    expect(compareUtilityPrimaryAxes(betterEvalOnly, baseline)).toBe(0);
    expect(compareTurnEngineUtilities(betterEvalOnly, baseline)).toBe(1);
    expect(betterPrimary.strictlyDominatesOverrideAxes(baseline)).toBe(true);
    expect(betterPrimary.passesOverrideGuard(baseline)).toBe(true);
    expect(betterEvalOnly.strictlyDominatesOverrideAxes(baseline)).toBe(false);
  });

  it("uses goal family, action length, then Rust input ordering as final ties", () => {
    const inputA = [
      { kind: "location" as const, location: { i: 1, j: 2 } },
      { kind: "location" as const, location: { i: 2, j: 2 } },
    ];
    const inputB = [
      { kind: "location" as const, location: { i: 1, j: 3 } },
      { kind: "location" as const, location: { i: 2, j: 3 } },
    ];
    const left = tinyPlan({ compiledChunks: [inputA] });
    const right = tinyPlan({ compiledChunks: [inputB] });
    expect(turnEngineComparePlans(left, right)).toBeLessThan(0);

    const tactical = tinyPlan({ goalFamily: TurnPlanFamily.ImmediateScore });
    expect(turnEngineComparePlans(tactical, left)).toBeGreaterThan(0);
  });
});

describe("turn-engine planning", () => {
  it("selects deterministically, preserves the source, and replays every chunk legally", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const before = game.fen();

    const first = fixedClock(() =>
      turnEngineCandidatePlan(game, Color.White, TEST_CONFIG),
    );
    expect(first).toBeDefined();
    expect(game.fen()).toBe(before);

    let replay = game;
    for (const chunk of first?.compiledChunks ?? []) {
      const next = applyInputsForSearch(replay, chunk);
      expect(next).toBeDefined();
      if (next === undefined) break;
      replay = next;
    }
    expect(replay.fen()).toBe(first?.endGame.fen());

    const second = fixedClock(() =>
      turnEngineCandidatePlan(game, Color.White, TEST_CONFIG),
    );
    expect(second?.compiledChunks).toEqual(first?.compiledChunks);
    expect(second?.endGame).not.toBe(first?.endGame);
  });

  it("stores legal continuations and honors an allowed-head route", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const plan = fixedClock(() =>
      turnEngineCandidatePlan(game, Color.White, TEST_CONFIG),
    );
    expect(plan?.compiledChunks[0]).toBeDefined();
    if (plan?.compiledChunks[0] === undefined) return;

    fixedClock(() =>
      turnEngineCommitPlan(
        game,
        Color.White,
        TurnEngineMode.ProV1,
        plan,
        TEST_CONFIG,
      ),
    );
    expect(turnEngineCachedStep(game, TEST_CONFIG)).toEqual(
      plan.compiledChunks[0],
    );

    const allowed = [plan.compiledChunks[0]];
    const restricted = fixedClock(() =>
      turnEngineCandidatePlanFromAllowedHeads(
        game,
        Color.White,
        TEST_CONFIG,
        allowed,
      ),
    );
    expect(restricted?.compiledChunks[0]).toEqual(plan.compiledChunks[0]);
    expect(
      fixedClock(() =>
        turnEngineNextInputsFromAllowedHeads(
          game,
          Color.White,
          TurnEngineMode.ProV1,
          TEST_CONFIG,
          allowed,
        ),
      ),
    ).toEqual(plan.compiledChunks[0]);
  });

  it("uses the targeted single-action fallback when generated plans omit an allowed head", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const narrowConfig: TurnEngineConfig = {
      ...TEST_CONFIG,
      ownSeedCap: 1,
      ownBeam: 1,
      stepCap: 1,
      expansionCap: 64,
    };
    const unrestricted = fixedClock(() =>
      turnEngineCandidatePlan(game, Color.White, narrowConfig),
    );
    const generatedHead = unrestricted?.compiledChunks[0];
    expect(generatedHead).toBeDefined();
    if (generatedHead === undefined) return;

    const alternativeHeads = enumerateLegalTransitions(game, 256)
      .map((transition) => transition.inputs)
      .filter((inputs) => compareInputChains(inputs, generatedHead) !== 0);
    expect(alternativeHeads.length).toBeGreaterThan(0);

    const restricted = fixedClock(() =>
      turnEngineCandidatePlanFromAllowedHeads(
        game,
        Color.White,
        narrowConfig,
        alternativeHeads,
      ),
    );
    const selectedHead = restricted?.compiledChunks[0];
    expect(selectedHead).toBeDefined();
    expect(compareInputChains(selectedHead ?? [], generatedHead)).not.toBe(0);
    expect(
      alternativeHeads.some(
        (inputs) => compareInputChains(inputs, selectedHead ?? []) === 0,
      ),
    ).toBe(true);
  });

  it("does not fall back or poison the no-plan cache after expansion exhaustion", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const exhaustedConfig: TurnEngineConfig = {
      ...TEST_CONFIG,
      expansionCap: 1,
    };

    expect(
      fixedClock(() =>
        turnEngineCandidatePlan(game, Color.White, exhaustedConfig),
      ),
    ).toBeUndefined();
    expect(turnEngineCacheSizesForTesting().noPlans).toBe(0);
    expect(
      fixedClock(() =>
        turnEngineCandidatePlan(game, Color.White, exhaustedConfig),
      ),
    ).toBeUndefined();
    expect(turnEngineCacheSizesForTesting().noPlans).toBe(0);

    expect(
      fixedClock(() => turnEngineCandidatePlan(game, Color.White, TEST_CONFIG)),
    ).toBeDefined();
  });

  it("keeps the explicit continuation mode separate from the config fingerprint", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const inputs = enumerateLegalTransitions(game, 1)[0]?.inputs;
    expect(inputs).toBeDefined();
    if (inputs === undefined) return;

    fixedClock(() =>
      turnEngineStoreCachedStep(
        game,
        TurnEngineMode.CurrentPro,
        TEST_CONFIG,
        inputs,
      ),
    );
    const currentProConfig: TurnEngineConfig = {
      ...TEST_CONFIG,
      mode: TurnEngineMode.CurrentPro,
    };
    expect(turnEngineCachedStep(game, currentProConfig)).toBeUndefined();

    clearTurnEnginePlanCache();
    fixedClock(() =>
      turnEngineStoreCachedStep(
        game,
        TurnEngineMode.CurrentPro,
        currentProConfig,
        inputs,
      ),
    );
    expect(turnEngineCachedStep(game, currentProConfig)).toEqual(inputs);
  });

  it("clears continuation, oracle, utility, best-plan, and no-plan caches", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const plan = fixedClock(() =>
      turnEngineCandidatePlan(game, Color.White, TEST_CONFIG),
    );
    expect(plan).toBeDefined();
    if (plan === undefined) return;
    fixedClock(() =>
      turnEngineCommitPlan(
        game,
        Color.White,
        TurnEngineMode.ProV1,
        plan,
        TEST_CONFIG,
      ),
    );

    const terminal = new MonsGame();
    terminal.whiteScore = 5;
    expect(
      fixedClock(() =>
        turnEngineCandidatePlan(terminal, Color.White, TEST_CONFIG),
      ),
    ).toBeUndefined();
    const populated = turnEngineCacheSizesForTesting();
    expect(populated.continuations).toBeGreaterThan(0);
    expect(populated.oracles).toBeGreaterThan(0);
    expect(populated.utilities).toBeGreaterThan(0);
    expect(populated.bestPlans).toBeGreaterThan(0);
    expect(populated.noPlans).toBeGreaterThan(0);

    clearTurnEnginePlanCache();
    expect(turnEngineCacheSizesForTesting()).toEqual({
      continuations: 0,
      oracles: 0,
      utilities: 0,
      bestPlans: 0,
      noPlans: 0,
    });
  });

  it("unwinds immediately when the cooperative deadline is already exhausted", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const result = withAutomoveClock({ now: () => 42 }, () =>
      withDeadlineIfAbsent(0, () =>
        turnEngineCandidatePlan(game, Color.White, TEST_CONFIG),
      ),
    );
    expect(result).toBeUndefined();
  });

  it("returns a legal plan under a deterministic cooperative deadline", () => {
    clearTurnEnginePlanCache();
    resetDeadlineStateForTesting();
    const game = new MonsGame();
    const before = game.fen();
    const plan = withAutomoveClock({ now: () => 1_000 }, () =>
      withDeadlineIfAbsent(650, () =>
        turnEngineCandidatePlan(game, Color.White, CURRENT_PRO_CONFIG),
      ),
    );

    expect(plan).toBeDefined();
    expect(game.fen()).toBe(before);
    if (plan === undefined) return;
    const first = plan.compiledChunks[0];
    expect(first).toBeDefined();
    if (first === undefined) return;

    const simulation = game.cloneForSimulation();
    expect(applyInputsForSearch(simulation, first)).toBeDefined();
    expect(game.fen()).toBe(before);
  }, 30_000);
});
