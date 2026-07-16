import { afterEach, describe, expect, it } from "vitest";

import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import {
  CurrentProRootAdvisorReasonCode,
  currentProRootAdvisorPresearch,
} from "../../src/automove/advisor.js";
import {
  acceptTurnEngineCachedStep,
  classifyTurnEngineRerankOverride,
  clearShippingSelectorCaches,
  focusedCandidateRankForRuntimeInputs,
  forcedLowBudgetTurnEnginePrepassChoice,
  forcedTacticalPrepassChoice,
  focusedScoredRootsForRuntime,
  smartSearchBestInputs,
  turnEngineConfigForGame,
} from "../../src/automove/shipping-selector.js";
import {
  applyShippingProConfig,
  scoringWeightsKey,
  searchExecutionConfigForGame,
} from "../../src/automove/selector-config.js";
import {
  type AutomoveSearchExecutionConfig,
  type ScoredRootMove,
} from "../../src/automove/selector-types.js";
import {
  buildRootCandidateForInputs,
  rankRootCandidates,
} from "../../src/automove/root-candidates.js";
import {
  TurnEngineMode,
  TurnEngineUtility,
  TurnPlanFamily,
  type TurnPlan,
} from "../../src/automove/turn-engine.js";
import { GameVariant } from "../../src/engine/config.js";
import { type Input } from "../../src/engine/domain.js";
import { inputArrayFen } from "../../src/engine/fen.js";
import { MonsGame } from "../../src/engine/game.js";

type RootOverrides = Omit<Partial<ScoredRootMove>, "classes"> & {
  readonly classes?: Partial<ScoredRootMove["classes"]>;
};

function inputs(id: number): Input[] {
  return [{ kind: "location", location: { i: id, j: 0 } }];
}

function root(id: number, overrides: RootOverrides = {}): ScoredRootMove {
  const base: ScoredRootMove = {
    rootRank: id,
    inputs: inputs(id),
    game: new MonsGame(false, GameVariant.Classic),
    heuristic: 1_000 - id * 10,
    efficiency: 0,
    winsImmediately: false,
    attacksOpponentDrainer: false,
    ownDrainerVulnerable: false,
    ownDrainerWalkVulnerable: false,
    spiritDevelopment: false,
    keepsAwakeSpiritOnBase: false,
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
    spiritSetupGain: 0,
    spiritSameTurnScoreSetupNow: false,
    spiritOwnManaSetupNow: false,
    supermanaProgress: false,
    opponentManaProgress: false,
    interviewSoftPriority: 0,
    classes: {
      immediateScore: false,
      drainerAttack: false,
      drainerSafetyRecover: false,
      carrierProgress: false,
      material: false,
      quiet: true,
    },
  };
  return {
    ...base,
    ...overrides,
    classes: { ...base.classes, ...overrides.classes },
  };
}

function fixedClock<Value>(operation: () => Value): Value {
  return withAutomoveClock({ now: () => 1_000 }, () =>
    withDeadlineIfAbsent(10_000, operation),
  );
}

function currentProConfig(game: MonsGame): AutomoveSearchExecutionConfig {
  const execution = searchExecutionConfigForGame(game, "pro");
  const shipping = applyShippingProConfig(execution);
  return {
    ...execution,
    ...shipping,
    scoringKey: scoringWeightsKey(shipping.scoringWeights),
  };
}

afterEach(() => {
  clearShippingSelectorCaches();
  resetDeadlineStateForTesting();
});

describe("shipping selector early gates", () => {
  it("clamps the CurrentPro opening engine before planning replies", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const engine = turnEngineConfigForGame(game, currentProConfig(game));

    expect(engine.mode).toBe(TurnEngineMode.CurrentPro);
    expect(engine.ownSeedCap).toBeLessThanOrEqual(14);
    expect(engine.ownBeam).toBeLessThanOrEqual(5);
    expect(engine.opponentSeedCap).toBe(1);
    expect(engine.opponentBeam).toBe(1);
    expect(engine.replySeedCap).toBe(1);
    expect(engine.replyBeam).toBe(1);
    expect(engine.expansionCap).toBeLessThanOrEqual(48);
  });

  it("keeps the forced-prepass family order ahead of heuristic rank", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const config = searchExecutionConfigForGame(game, "fast");
    const roots = [
      root(0, { attacksOpponentDrainer: true, heuristic: 4_000 }),
      root(1, { scoresSupermanaThisTurn: true, heuristic: 3_000 }),
      root(2, { winsImmediately: true, heuristic: -1_000 }),
    ];

    expect(
      inputArrayFen(
        forcedTacticalPrepassChoice(game, game.activeColor, roots, config) ??
          [],
      ),
    ).toBe("l2,0");
  });

  it("accepts only bounded safe continuation ranks", () => {
    const roots = [
      root(0, { heuristic: 1_000 }),
      root(1, {
        heuristic: 920,
        spiritDevelopment: true,
      }),
      root(2, {
        heuristic: 900,
        ownDrainerVulnerable: true,
        manaHandoffToOpponent: true,
      }),
    ];

    expect(
      acceptTurnEngineCachedStep(
        roots,
        roots[1]?.inputs ?? [],
        TurnEngineMode.ProV1,
      ),
    ).toBe(true);
    expect(
      acceptTurnEngineCachedStep(
        roots,
        roots[2]?.inputs ?? [],
        TurnEngineMode.CurrentPro,
      ),
    ).toBe(false);
  });

  it("rejects unsafe reranks and admits bounded tactical upgrades", () => {
    const tactical = [
      root(0, { heuristic: 1_000 }),
      root(1, {
        heuristic: 700,
        attacksOpponentDrainer: true,
      }),
    ];
    expect(
      classifyTurnEngineRerankOverride(tactical, tactical[1]?.inputs ?? []),
    ).toBe(true);

    const unsafe = [
      root(0, { heuristic: 1_000 }),
      root(1, {
        heuristic: 950,
        sameTurnScoreWindowValue: 2,
        ownDrainerVulnerable: true,
      }),
    ];
    expect(
      classifyTurnEngineRerankOverride(unsafe, unsafe[1]?.inputs ?? []),
    ).toBe(false);
  });

  it("surfaces the safe low-budget macro head before bounded search", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const config = currentProConfig(game);
    const roots = [
      root(0, {
        supermanaProgress: true,
        safeSupermanaProgressSteps: 4,
      }),
      root(1),
    ];
    const utility = new TurnEngineUtility();
    const plan: TurnPlan = {
      actions: [],
      compiledChunks: [roots[0]?.inputs ?? []],
      endGame: roots[0]?.game ?? game,
      utility,
      headUtility: utility,
      headFamily: TurnPlanFamily.SafeSupermanaProgress,
      goalFamily: TurnPlanFamily.SafeSupermanaProgress,
      packageMeta: {
        scoreGain: 0,
        denyGain: 0,
        drainerSafetyDelta: 0,
        spiritOnlySetup: false,
        endsNonnegativeDrainerSafety: true,
        opponentImmediateWindowAfter: 0,
      },
    };

    expect(
      inputArrayFen(
        forcedLowBudgetTurnEnginePrepassChoice(game, roots, plan, config) ?? [],
      ),
    ).toBe("l0,0");
  });

  it("rejects an injected head behind an existing winning root", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const config = currentProConfig(game);
    const enumerated = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, config),
    );
    const top = enumerated[0];
    const missing = enumerated[1];
    if (top === undefined || missing === undefined) {
      throw new Error("opening has too few roots for injection rejection");
    }
    const roots: ScoredRootMove[] = [{ ...top, winsImmediately: true }];
    const utility = new TurnEngineUtility();
    const plan: TurnPlan = {
      actions: [],
      compiledChunks: [missing.inputs],
      endGame: missing.game,
      utility,
      headUtility: utility,
      headFamily: TurnPlanFamily.ManaTempo,
      goalFamily: TurnPlanFamily.ManaTempo,
      packageMeta: {
        scoreGain: 0,
        denyGain: 0,
        drainerSafetyDelta: 0,
        spiritOnlySetup: false,
        endsNonnegativeDrainerSafety: true,
        opponentImmediateWindowAfter: 0,
      },
    };
    let builderCalls = 0;
    const decision = fixedClock(() =>
      currentProRootAdvisorPresearch(
        game,
        game.activeColor,
        config,
        roots,
        plan,
        {
          buildInjectedRootCandidate: (
            candidateGame,
            perspective,
            _candidateConfig,
            candidateInputs,
          ) => {
            builderCalls += 1;
            return buildRootCandidateForInputs(
              candidateGame,
              perspective,
              config,
              candidateInputs,
            );
          },
        },
      ),
    );

    expect(builderCalls).toBe(1);
    expect(decision?.injectedRoot).toMatchObject({
      admitted: false,
      reason: CurrentProRootAdvisorReasonCode.RejectInjectedMacroRoot,
    });
    expect(roots).toHaveLength(1);
  });
});

describe("shipping selector integration", () => {
  it("matches the fixed-clock Fast opening with and without the TT", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const before = game.fen();
    const config = searchExecutionConfigForGame(game, "fast");

    const withTable = fixedClock(() =>
      smartSearchBestInputs(game, config, true),
    );
    const withoutTable = fixedClock(() =>
      smartSearchBestInputs(game, config, false),
    );

    expect(inputArrayFen(withTable)).toBe("l10,5;l9,4");
    expect(inputArrayFen(withoutTable)).toBe("l10,5;l9,4");
    expect(game.fen()).toBe(before);
    expect(withTable).not.toBe(withoutTable);
  });

  it("reports the focused rank without requiring the scored-root loop", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const config = { ...currentProConfig(game), maxVisitedNodes: 0 };
    const firstRanked = fixedClock(
      () => rankRootCandidates(game, game.activeColor, config)[0],
    );
    expect(firstRanked).toBeDefined();
    if (firstRanked === undefined) return;

    const before = game.fen();
    const focusedRank = fixedClock(() =>
      focusedCandidateRankForRuntimeInputs(game, config, firstRanked.inputs),
    );

    expect(focusedRank).toBeTypeOf("number");
    expect(
      fixedClock(() => focusedScoredRootsForRuntime(game, config)),
    ).toEqual([]);
    expect(
      fixedClock(() =>
        focusedCandidateRankForRuntimeInputs(game, config, inputs(99)),
      ),
    ).toBeUndefined();
    expect(game.fen()).toBe(before);
  }, 30_000);
});
