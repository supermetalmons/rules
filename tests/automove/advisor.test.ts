import { afterEach, describe, expect, it } from "vitest";

import { TARGET_SCORE } from "../../src/engine/config.js";
import { Color, type Input } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  CURRENT_PRO_ROOT_ADVISOR_DEFAULTS,
  CurrentProRootAdvisorReasonCode,
  advisorConfigForSearch,
  advisorRootFamily,
  currentProRootAdvisorPostsearch,
  currentProRootAdvisorPresearch,
  currentProRootAdvisorPriorityInputs,
  currentProRootPolicyCallbacks,
  currentProRootAdvisorTacticalOverride,
  type AdvisorRootCandidate,
} from "../../src/automove/advisor.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import { searchConfigForPreference } from "../../src/automove/root-candidates.js";
import { applyShippingProConfig } from "../../src/automove/selector-config.js";
import type {
  AutomoveSearchConfig,
  RootEvaluation,
} from "../../src/automove/selector-types.js";
import {
  TurnEngineUtility,
  TurnPlanFamily,
  clearTurnEnginePlanCache,
  type TurnPlan,
} from "../../src/automove/turn-engine.js";

function input(id: number): Input[] {
  return [{ kind: "location", location: { i: id, j: 0 } }];
}

function inputChain(...ids: number[]): Input[] {
  return ids.map((id) => ({
    kind: "location" as const,
    location: { i: id, j: 0 },
  }));
}

function root(
  id: number,
  overrides: Partial<AdvisorRootCandidate> = {},
): AdvisorRootCandidate {
  return {
    rootRank: id,
    inputs: input(id),
    game: new MonsGame(),
    heuristic: 1_000 - id * 10,
    efficiency: 10 - id,
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
    ...overrides,
  };
}

function evaluation(
  id: number,
  score: number,
  overrides: Partial<RootEvaluation> = {},
): RootEvaluation {
  return {
    ...root(id),
    score,
    ...overrides,
  };
}

function plan(
  id: number,
  family: TurnPlanFamily,
  utility = new TurnEngineUtility(),
): TurnPlan {
  const game = new MonsGame();
  return {
    actions: [],
    compiledChunks: [input(id)],
    endGame: game,
    utility,
    headUtility: utility,
    headFamily: family,
    goalFamily: family,
    packageMeta: {
      scoreGain: 0,
      denyGain: 0,
      drainerSafetyDelta: 0,
      spiritOnlySetup: false,
      endsNonnegativeDrainerSafety: true,
      opponentImmediateWindowAfter: 0,
    },
  };
}

type TestCurrentProConfig = AutomoveSearchConfig & {
  readonly allowExactStrategic: false;
  readonly evaluateGame: () => number;
  readonly evaluateTurnEngineRootUtility: () => TurnEngineUtility;
};

function currentProConfig(
  game: MonsGame,
  overrides: Partial<AutomoveSearchConfig> = {},
): TestCurrentProConfig {
  return Object.freeze({
    ...applyShippingProConfig(searchConfigForPreference(game, "pro")),
    ...overrides,
    allowExactStrategic: false as const,
    evaluateGame: () => 0,
    evaluateTurnEngineRootUtility: () => new TurnEngineUtility(),
  });
}

afterEach(() => {
  resetDeadlineStateForTesting();
  clearTurnEnginePlanCache();
});

describe("current-Pro root advisor", () => {
  it("preserves reason ordinals and classifies every representative family", () => {
    expect(Object.isFrozen(CurrentProRootAdvisorReasonCode)).toBe(true);
    expect([
      CurrentProRootAdvisorReasonCode.RankedRoot,
      CurrentProRootAdvisorReasonCode.ReplyRiskShortlist,
      CurrentProRootAdvisorReasonCode.PreserveSpiritRepresentative,
      CurrentProRootAdvisorReasonCode.PreserveSafeProgressRepresentative,
      CurrentProRootAdvisorReasonCode.PreserveManaTempoRepresentative,
      CurrentProRootAdvisorReasonCode.OmittedRootReentry,
      CurrentProRootAdvisorReasonCode.AdmitInjectedMacroRoot,
      CurrentProRootAdvisorReasonCode.RejectInjectedMacroRoot,
      CurrentProRootAdvisorReasonCode.ApprovedReplyRiskGuard,
      CurrentProRootAdvisorReasonCode.ApprovedBaselineSelector,
      CurrentProRootAdvisorReasonCode.ApprovedFamilyCompetition,
    ]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    expect(advisorRootFamily(root(0, { winsImmediately: true }))).toBe(
      TurnPlanFamily.ImmediateScore,
    );
    expect(advisorRootFamily(root(0, { attacksOpponentDrainer: true }))).toBe(
      TurnPlanFamily.DrainerKill,
    );
    expect(
      advisorRootFamily(
        root(0, {
          classes: {
            ...root(0).classes,
            drainerSafetyRecover: true,
          },
        }),
      ),
    ).toBe(TurnPlanFamily.DrainerSafetyRecovery);
    expect(advisorRootFamily(root(0, { spiritDevelopment: true }))).toBe(
      TurnPlanFamily.SpiritImpact,
    );
    expect(advisorRootFamily(root(0, { supermanaProgress: true }))).toBe(
      TurnPlanFamily.SafeSupermanaProgress,
    );
    expect(advisorRootFamily(root(0, { opponentManaProgress: true }))).toBe(
      TurnPlanFamily.SafeOpponentManaProgress,
    );
    expect(advisorRootFamily(root(0))).toBe(TurnPlanFamily.ManaTempo);
  });

  it("keeps the ranked root and deterministic family representatives", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const roots = [
      root(0),
      root(1, { spiritSameTurnScoreSetupNow: true }),
      root(2, { spiritDevelopment: true }),
      root(3, { supermanaProgress: true }),
      root(4, { opponentManaProgress: true }),
    ];
    const sourceFen = game.fen();
    const rootFens = roots.map((candidate) => candidate.game.fen());

    const decision = currentProRootAdvisorPresearch(
      game,
      Color.White,
      CURRENT_PRO_ROOT_ADVISOR_DEFAULTS,
      roots,
    );

    expect(decision?.orderedShortlist.map((entry) => entry.rootRank)).toEqual([
      0, 1, 2, 3, 4,
    ]);
    expect(
      decision?.preservedFamilyRepresentatives.map((entry) => entry.family),
    ).toEqual([
      TurnPlanFamily.SpiritImpact,
      TurnPlanFamily.SpiritImpact,
      TurnPlanFamily.SafeSupermanaProgress,
      TurnPlanFamily.SafeOpponentManaProgress,
    ]);
    expect(decision).toBeDefined();
    if (decision === undefined) throw new Error("advisor decision missing");
    const priorities = currentProRootAdvisorPriorityInputs(decision);
    expect(priorities).toEqual([input(1), input(2), input(3), input(4)]);
    const firstPriority = priorities[0];
    if (firstPriority === undefined) throw new Error("priority missing");
    firstPriority[0] = { kind: "takeback" };
    expect(decision.preservedFamilyRepresentatives[0]?.inputs).toEqual(
      input(1),
    );
    expect(game.fen()).toBe(sourceFen);
    expect(roots.map((candidate) => candidate.game.fen())).toEqual(rootFens);
  });

  it("skips the captured black turn-two opening and cooperatively cancels", () => {
    const opening = new MonsGame();
    opening.activeColor = Color.Black;
    opening.turnNumber = 2;
    opening.monsMovesCount = 0;
    expect(
      currentProRootAdvisorPresearch(
        opening,
        Color.Black,
        CURRENT_PRO_ROOT_ADVISOR_DEFAULTS,
        [root(0), root(1, { spiritDevelopment: true })],
      ),
    ).toBeUndefined();

    const cancelled = withAutomoveClock({ now: () => 100 }, () =>
      withDeadlineIfAbsent(0, () =>
        currentProRootAdvisorPresearch(
          new MonsGame(),
          Color.White,
          CURRENT_PRO_ROOT_ADVISOR_DEFAULTS,
          [root(0)],
        ),
      ),
    );
    expect(cancelled).toBeUndefined();
  });

  it("uses the stable SearchConfig adapter and prefers safe tactical overrides", () => {
    const pro = searchConfigForPreference(new MonsGame(), "pro");
    expect(advisorConfigForSearch(pro)).toBe(pro);
    const fast = searchConfigForPreference(new MonsGame(), "fast");
    expect(advisorConfigForSearch(fast)).toBe(fast);

    const selected = currentProRootAdvisorTacticalOverride([
      root(0, { ownDrainerVulnerable: true }),
      root(1, { attacksOpponentDrainer: true }),
      root(2, { winsImmediately: true }),
    ]);
    expect(selected).toMatchObject({
      rootRank: 2,
      family: TurnPlanFamily.ImmediateScore,
      reason: CurrentProRootAdvisorReasonCode.ApprovedFamilyCompetition,
    });
  });

  it("admits a dominating injected macro root and records it after representatives", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const config = currentProConfig(game);
    const roots = [root(0)];
    const injected = root(5, {
      heuristic: 2_000,
      winsImmediately: true,
      classes: { ...root(5).classes, immediateScore: true },
    });
    const decision = currentProRootAdvisorPresearch(
      game,
      Color.White,
      config,
      roots,
      plan(
        5,
        TurnPlanFamily.ImmediateScore,
        new TurnEngineUtility({ winState: 1, scoreDelta: 10 }),
      ),
      {
        buildInjectedRootCandidate: (
          source,
          perspective,
          receivedConfig,
          inputs,
        ) => {
          expect(source).toBe(game);
          expect(perspective).toBe(Color.White);
          expect(receivedConfig).toBe(config);
          expect(inputs).toEqual(input(5));
          return injected;
        },
      },
    );

    expect(decision?.injectedRoot).toEqual({
      inputs: input(5),
      family: TurnPlanFamily.ImmediateScore,
      admitted: true,
      reason: CurrentProRootAdvisorReasonCode.AdmitInjectedMacroRoot,
    });
    expect(roots.map((candidate) => candidate.inputs)).toContainEqual(input(5));
    expect(
      decision?.orderedShortlist.some(
        (entry) =>
          entry.rootRank === 5 &&
          entry.reason ===
            CurrentProRootAdvisorReasonCode.AdmitInjectedMacroRoot,
      ),
    ).toBe(true);
  });

  it("admits only safe own-mana Spirit progress injections without a tactical surface", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const config = currentProConfig(game);
    const enginePlan = plan(5, TurnPlanFamily.SpiritImpact);
    const decide = (candidate: AdvisorRootCandidate) => {
      const roots = [root(0)];
      const decision = currentProRootAdvisorPresearch(
        game,
        Color.White,
        config,
        roots,
        enginePlan,
        { buildInjectedRootCandidate: () => candidate },
      );
      return { decision, roots };
    };

    const ownManaProgress = decide(
      root(5, {
        spiritOwnManaSetupNow: true,
        supermanaProgress: true,
        safeSupermanaProgressSteps: 2,
      }),
    );
    expect(ownManaProgress.decision?.injectedRoot).toEqual({
      inputs: input(5),
      family: TurnPlanFamily.SpiritImpact,
      admitted: true,
      reason: CurrentProRootAdvisorReasonCode.AdmitInjectedMacroRoot,
    });
    expect(ownManaProgress.roots).toHaveLength(2);

    const plainProgress = decide(
      root(5, {
        supermanaProgress: true,
        safeSupermanaProgressSteps: 2,
      }),
    );
    expect(plainProgress.decision?.injectedRoot).toEqual({
      inputs: input(5),
      family: TurnPlanFamily.SpiritImpact,
      admitted: false,
      reason: CurrentProRootAdvisorReasonCode.RejectInjectedMacroRoot,
    });
    expect(plainProgress.roots).toHaveLength(1);

    const unsafeOwnManaProgress = decide(
      root(5, {
        ownDrainerVulnerable: true,
        spiritOwnManaSetupNow: true,
        supermanaProgress: true,
        safeSupermanaProgressSteps: 2,
      }),
    );
    expect(unsafeOwnManaProgress.decision?.injectedRoot).toEqual({
      inputs: input(5),
      family: TurnPlanFamily.SpiritImpact,
      admitted: false,
      reason: CurrentProRootAdvisorReasonCode.RejectInjectedMacroRoot,
    });
    expect(unsafeOwnManaProgress.roots).toHaveLength(1);
  });

  it("rejects an invalid macro root without mutating the game or root list", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const config = currentProConfig(game);
    const roots = [root(0), root(1, { supermanaProgress: true })];
    const sourceFen = game.fen();
    const rootReferences = [...roots];

    const decision = currentProRootAdvisorPresearch(
      game,
      Color.White,
      config,
      roots,
      plan(
        6,
        TurnPlanFamily.DrainerKill,
        new TurnEngineUtility({ drainerAttack: 1 }),
      ),
      {
        buildInjectedRootCandidate: () => root(6, { heuristic: 3_000 }),
      },
    );

    expect(decision?.injectedRoot).toEqual({
      inputs: input(6),
      family: TurnPlanFamily.DrainerKill,
      admitted: false,
      reason: CurrentProRootAdvisorReasonCode.RejectInjectedMacroRoot,
    });
    expect(game.fen()).toBe(sourceFen);
    expect(roots).toEqual(rootReferences);
    expect(roots[0]).toBe(rootReferences[0]);
    expect(roots[1]).toBe(rootReferences[1]);
  });

  it("reports baseline, reply-risk, and family-competition approvals", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const baselineConfig = currentProConfig(game);
    const baseline = currentProRootAdvisorPostsearch(
      game,
      [evaluation(0, 100)],
      Color.White,
      baselineConfig,
    );
    expect(baseline).toMatchObject({
      index: 0,
      decision: {
        approvedRoot: {
          reason: CurrentProRootAdvisorReasonCode.ApprovedBaselineSelector,
        },
      },
    });

    const replyRiskConfig = currentProConfig(game, {
      enableRootReplyRiskGuard: true,
      enableTurnEngineSelector: false,
      maxVisitedNodes: 1,
      rootReplyRiskReplyLimit: 1,
      rootReplyRiskShortlistMax: 1,
    });
    const replyRisk = currentProRootAdvisorPostsearch(
      game,
      [evaluation(0, 100)],
      Color.White,
      replyRiskConfig,
    );
    expect(replyRisk).toMatchObject({
      index: 0,
      decision: {
        approvedRoot: {
          reason: CurrentProRootAdvisorReasonCode.ApprovedReplyRiskGuard,
        },
      },
    });

    const familyGame = new MonsGame();
    familyGame.activeColor = Color.Black;
    familyGame.turnNumber = 2;
    const familyConfig = currentProConfig(familyGame);
    const familyCompetition = currentProRootAdvisorPostsearch(
      familyGame,
      [
        evaluation(0, 95, {
          inputs: inputChain(4, 5, 6),
          rootRank: 0,
          efficiency: 10,
          spiritDevelopment: true,
          spiritOwnManaSetupNow: true,
          spiritSetupGain: 64,
        }),
        evaluation(1, 100, {
          inputs: inputChain(4, 5, 7),
          rootRank: 2,
          efficiency: 10,
          spiritDevelopment: true,
          spiritOwnManaSetupNow: true,
          spiritSetupGain: 64,
        }),
      ],
      Color.Black,
      familyConfig,
    );
    expect(familyCompetition).toMatchObject({
      index: 0,
      decision: {
        approvedRoot: {
          reason: CurrentProRootAdvisorReasonCode.ApprovedFamilyCompetition,
        },
      },
    });
  });

  it("retains a safe roundtrip when the only clean near-best root loses immediately", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const losing = game.cloneForSimulation();
    losing.blackScore = TARGET_SCORE;
    const safe = game.cloneForSimulation();
    const sourceFen = game.fen();
    const result = currentProRootAdvisorPostsearch(
      game,
      [
        evaluation(0, 1_000, { game: losing }),
        evaluation(1, 950, { game: safe, hasRoundtrip: true }),
      ],
      Color.White,
      currentProConfig(game, {
        enableRootReplyRiskGuard: false,
        rootAntiHelpScoreMargin: 100,
      }),
    );

    expect(
      result?.decision.orderedShortlist.map((entry) => entry.rootRank),
    ).toEqual([0, 1]);
    expect(game.fen()).toBe(sourceFen);
  });

  it("applies later same-lane precedence after an opening setup override", () => {
    const game = new MonsGame();
    game.activeColor = Color.Black;
    game.turnNumber = 2;
    const config = currentProConfig(game);
    const result = currentProRootAdvisorPostsearch(
      game,
      [
        evaluation(0, 90, {
          inputs: inputChain(4, 5, 6),
          rootRank: 0,
          efficiency: 10,
          spiritDevelopment: true,
          spiritOwnManaSetupNow: true,
          spiritSetupGain: 64,
        }),
        evaluation(1, 100, {
          inputs: inputChain(4, 5, 7),
          rootRank: 2,
          efficiency: 10,
          spiritDevelopment: true,
          spiritOwnManaSetupNow: true,
          spiritSetupGain: 64,
        }),
      ],
      Color.Black,
      config,
    );

    expect(result).toMatchObject({
      index: 1,
      decision: {
        approvedRoot: {
          reason: CurrentProRootAdvisorReasonCode.ApprovedFamilyCompetition,
        },
      },
    });
  });

  it("escapes a vulnerable black turn-four progress root through safe mana", () => {
    const game = new MonsGame();
    game.activeColor = Color.Black;
    game.turnNumber = 4;
    game.monsMovesCount = 1;
    game.actionsUsedCount = 1;
    game.manaMovesCount = 0;
    const config = currentProConfig(game);
    const result = currentProRootAdvisorPostsearch(
      game,
      [
        evaluation(0, 100, {
          ownDrainerVulnerable: true,
          supermanaProgress: true,
          safeSupermanaProgressSteps: 2,
        }),
        evaluation(1, -5_000, {
          rootRank: 1,
        }),
      ],
      Color.Black,
      config,
    );

    expect(result?.index).toBe(1);
    expect(result?.decision.approvedRoot?.family).toBe(
      TurnPlanFamily.ManaTempo,
    );
  });

  it("preserves a late white same-head spirit followup over mana tempo", () => {
    const game = new MonsGame();
    game.activeColor = Color.White;
    game.turnNumber = 8;
    game.monsMovesCount = 0;
    game.actionsUsedCount = 0;
    game.manaMovesCount = 0;
    const config = currentProConfig(game, {
      enableRootSpiritDevelopmentPref: false,
      enableTurnEngineSecondaryAnalysis: false,
    });
    const roots = [
      evaluation(0, 90, {
        inputs: inputChain(4, 5, 6),
        rootRank: 0,
        efficiency: 0,
        spiritDevelopment: true,
      }),
      evaluation(1, 100, {
        inputs: inputChain(4, 5, 7),
        rootRank: 5,
        efficiency: 10,
      }),
    ];
    const control = game.cloneForSimulation();
    control.turnNumber = 7;
    const controlResult = currentProRootAdvisorPostsearch(
      control,
      roots,
      Color.White,
      currentProConfig(control, {
        enableRootSpiritDevelopmentPref: false,
        enableTurnEngineSecondaryAnalysis: false,
      }),
    );
    const result = currentProRootAdvisorPostsearch(
      game,
      roots,
      Color.White,
      config,
    );

    expect(controlResult?.index).toBe(1);
    expect(result?.index).toBe(0);
    expect(result?.decision.approvedRoot?.family).toBe(
      TurnPlanFamily.SpiritImpact,
    );
  });

  it("wires every root-policy callback to the CurrentPro advisor policy", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const config = currentProConfig(game, {
      enableTurnEngineSelector: false,
      enableTurnEngineSecondaryAnalysis: false,
    });
    const callbacks = currentProRootPolicyCallbacks(config);
    expect(callbacks).toMatchObject({
      pickRootIndex: expect.any(Function),
      competition: expect.any(Function),
      safetyReentryIndices: expect.any(Function),
      finalReentryIndices: expect.any(Function),
      spiritSetupCompetesWithBest: expect.any(Function),
      spiritProjectionChallengeOrder: expect.any(Function),
      spiritProjectionOrder: expect.any(Function),
      spiritFollowupFloorOrder: expect.any(Function),
    });

    const roots = [
      evaluation(0, 100, {
        ownDrainerVulnerable: true,
        spiritDevelopment: true,
        efficiency: 10,
      }),
      evaluation(1, 90, {
        supermanaProgress: true,
        safeSupermanaProgressSteps: 2,
        efficiency: 10,
        interviewSoftPriority: 1,
      }),
    ];
    const context = {
      game,
      roots,
      candidateIndices: [0, 1],
      perspective: Color.White,
      config,
    };
    expect(callbacks.competition?.("safe-progress", context)).toBe(true);
    expect(
      callbacks.pickRootIndex?.({ ...context, candidateIndices: [1] }),
    ).toBe(1);
  });

  it("orders a projected Spirit root ahead of a missing projection", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const config = Object.freeze({
      ...currentProConfig(game),
      buildTurnEnginePlanForReplyRisk: (
        _root: RootEvaluation,
        index: number,
      ) => (index === 0 ? plan(0, TurnPlanFamily.SpiritImpact) : undefined),
    });
    const callbacks = currentProRootPolicyCallbacks(config);
    const context = {
      game,
      roots: [
        evaluation(0, 100, { spiritDevelopment: true, efficiency: 10 }),
        evaluation(1, 100, { spiritDevelopment: true, efficiency: 10 }),
      ],
      candidateIndices: [0, 1],
      perspective: Color.White,
      config,
    };

    expect(callbacks.spiritProjectionOrder?.(context, 0, 1)).toBe(1);
    expect(callbacks.spiritProjectionOrder?.(context, 1, 0)).toBe(-1);
  });

  it("does not treat close positive scores as concrete spirit competition", () => {
    const game = new MonsGame();
    game.turnNumber = 2;
    const config = currentProConfig(game);
    const callbacks = currentProRootPolicyCallbacks(config);
    const plainSpirit = evaluation(0, 100, {
      spiritDevelopment: true,
      efficiency: 90,
    });
    const quietCloseScore = evaluation(1, 120, {
      efficiency: 34,
      supermanaProgress: true,
    });
    const context = {
      game,
      roots: [plainSpirit, quietCloseScore],
      candidateIndices: [0, 1],
      perspective: Color.White,
      config,
    };

    expect(callbacks.competition?.("score", context)).toBe(false);
    expect(
      callbacks.competition?.("score", {
        ...context,
        roots: [
          plainSpirit,
          evaluation(1, 140, {
            safeOpponentManaPickupNow: true,
          }),
        ],
      }),
    ).toBe(true);
  });
});
