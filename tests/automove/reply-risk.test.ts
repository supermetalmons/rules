import { afterEach, describe, expect, it } from "vitest";

import { Color, type Input } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import {
  CURRENT_PRO_REPLY_RISK_DEFAULTS,
  REPLY_RISK_DEFAULTS_BY_PREFERENCE,
  canTurnEngineProjectReplyRiskRoot,
  clearReplyRiskCache,
  compareRankedReplyRiskEvaluations,
  currentProWhiteTurnFourManaSiblingReentry,
  isBetterReplyRiskCandidate,
  pickRootWithReplyRiskGuard,
  replyRiskConfigForSearch,
  replyRiskAdvisorPolicy,
  replyRiskGuardShortlistIndices,
  rootReplyRiskSnapshot,
  rootReplyRiskSnapshotWithProjection,
  shouldUseReplyRiskProjectionForRoot,
  turnEngineReplyRiskProjections,
  turnEngineSpiritRootProjections,
  type ReplyRiskRootEvaluation,
  type RootReplyRiskSnapshot,
  type TurnEngineRootProjection,
} from "../../src/automove/reply-risk.js";
import { searchConfigForPreference } from "../../src/automove/root-candidates.js";
import { applyShippingProConfig } from "../../src/automove/selector-config.js";
import {
  TurnEngineMode,
  TurnEngineUtility,
  TurnPlanFamily,
  type TurnPlan,
} from "../../src/automove/turn-engine.js";

function input(id: number): Input[] {
  return [{ kind: "location", location: { i: id, j: 1 } }];
}

function evaluation(
  id: number,
  overrides: Partial<ReplyRiskRootEvaluation> = {},
): ReplyRiskRootEvaluation {
  return {
    rootRank: id,
    score: 1_000 - id * 10,
    efficiency: 10 - id,
    inputs: input(id),
    game: new MonsGame(),
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

function snapshot(worstReplyScore: number): RootReplyRiskSnapshot {
  return {
    allowsImmediateOpponentWin: false,
    opponentReachesMatchPoint: false,
    worstReplyScore,
  };
}

function projection(
  endGame: MonsGame,
  headFamily: TurnPlanFamily,
  options: {
    readonly goalFamily?: TurnPlanFamily;
    readonly utility?: ConstructorParameters<typeof TurnEngineUtility>[0];
  } = {},
): TurnEngineRootProjection {
  const utility = new TurnEngineUtility(options.utility);
  const plan: TurnPlan = {
    actions: [],
    compiledChunks: [],
    endGame,
    utility,
    headUtility: utility,
    headFamily,
    goalFamily: options.goalFamily ?? headFamily,
    packageMeta: {
      scoreGain: 0,
      denyGain: 0,
      drainerSafetyDelta: 0,
      spiritOnlySetup: false,
      endsNonnegativeDrainerSafety: true,
      opponentImmediateWindowAfter: 0,
    },
  };
  return { plan };
}

afterEach(() => {
  clearReplyRiskCache();
  resetDeadlineStateForTesting();
});

describe("reply-risk configuration and shortlisting", () => {
  it("adapts all search preferences to the pinned Rust caps", () => {
    expect(REPLY_RISK_DEFAULTS_BY_PREFERENCE.fast).toMatchObject({
      allowExactStrategic: false,
      enableRootReplyRiskGuard: true,
      rootReplyRiskScoreMargin: 125,
      rootReplyRiskShortlistMax: 4,
      rootReplyRiskReplyLimit: 10,
      rootReplyRiskNodeShareBp: 650,
    });
    expect(REPLY_RISK_DEFAULTS_BY_PREFERENCE.normal).toMatchObject({
      allowExactStrategic: false,
      enableRootReplyRiskGuard: true,
      rootReplyRiskScoreMargin: 145,
      rootReplyRiskShortlistMax: 7,
      rootReplyRiskReplyLimit: 16,
      rootReplyRiskNodeShareBp: 1_350,
    });
    expect(CURRENT_PRO_REPLY_RISK_DEFAULTS).toMatchObject({
      allowExactStrategic: false,
      enableRootReplyRiskGuard: false,
      rootReplyRiskScoreMargin: 165,
      rootReplyRiskShortlistMax: 9,
      rootReplyRiskReplyLimit: 24,
      rootReplyRiskNodeShareBp: 2_000,
    });
    expect(Object.isFrozen(REPLY_RISK_DEFAULTS_BY_PREFERENCE)).toBe(true);

    const base = searchConfigForPreference(new MonsGame(), "fast");
    const shipping = {
      ...base,
      ...applyShippingProConfig(base),
      preference: "pro",
    } as const;
    expect(replyRiskConfigForSearch(shipping)).toMatchObject({
      currentPro: true,
      enableRootReplyRiskGuard: false,
      enableTurnEngineSelector: true,
      turnEngineMode: TurnEngineMode.CurrentPro,
      maxVisitedNodes: shipping.maxVisitedNodes,
      scoringWeights: shipping.scoringWeights,
      evaluationCacheKey: shipping.scoringKey,
    });

    const proV1 = {
      ...base,
      preference: "pro",
      turnEngineMode: TurnEngineMode.ProV1,
      enableTurnEngineSelector: false,
      enableRootReplyRiskGuard: true,
    } as const;
    expect(replyRiskConfigForSearch(proV1)).toMatchObject({
      currentPro: false,
      enableRootReplyRiskGuard: true,
      enableTurnEngineSelector: false,
      turnEngineMode: TurnEngineMode.ProV1,
    });
  });

  it("keeps current-Pro spirit siblings beyond the strict cap", () => {
    const roots = [
      evaluation(0, { score: 1_000 }),
      evaluation(1, { score: 990 }),
      evaluation(2, { score: 950, spiritDevelopment: true }),
      evaluation(3, { score: 945, spiritDevelopment: true }),
    ];
    expect(
      replyRiskGuardShortlistIndices(roots, [0, 1, 2, 3], {
        ...CURRENT_PRO_REPLY_RISK_DEFAULTS,
        rootReplyRiskShortlistMax: 2,
      }),
    ).toEqual([0, 1, 2, 3]);
  });

  it("adds at most two plain-spirit siblings when the retained set has one", () => {
    const roots = [
      evaluation(0, { score: 1_000, spiritDevelopment: true }),
      evaluation(1, { score: 990 }),
      evaluation(2, { score: 980, spiritDevelopment: true }),
      evaluation(3, { score: 970, spiritDevelopment: true }),
      evaluation(4, { score: 960, spiritDevelopment: true }),
    ];
    expect(
      replyRiskGuardShortlistIndices(roots, [0, 1, 2, 3, 4], {
        ...CURRENT_PRO_REPLY_RISK_DEFAULTS,
        rootReplyRiskShortlistMax: 2,
      }),
    ).toEqual([0, 1, 2, 3]);
  });

  it("skips diffuse winning sets and preserves a safe progress sibling", () => {
    expect(
      replyRiskGuardShortlistIndices(
        [
          evaluation(0, { score: 1_000, winsImmediately: true }),
          evaluation(1, { score: 0 }),
        ],
        [0, 1],
        CURRENT_PRO_REPLY_RISK_DEFAULTS,
      ),
    ).toEqual([]);

    const progress = [
      evaluation(0, {
        score: 1_000,
        ownDrainerVulnerable: true,
        supermanaProgress: true,
        safeSupermanaProgressSteps: 3,
      }),
      evaluation(1, {
        score: 800,
        supermanaProgress: true,
        safeSupermanaProgressSteps: 3,
      }),
    ];
    expect(
      replyRiskGuardShortlistIndices(progress, [0, 1], {
        currentPro: true,
        turnEngineMode: TurnEngineMode.CurrentPro,
        rootReplyRiskScoreMargin: 300,
        rootReplyRiskShortlistMax: 1,
      }),
    ).toEqual([0, 1]);
  });

  it("uses deterministic tactical and progress-step tie-breaks", () => {
    const roots = [
      evaluation(0, { score: 500, supermanaProgress: true }),
      evaluation(1, {
        score: 500,
        winsImmediately: true,
        supermanaProgress: true,
      }),
      evaluation(2, {
        score: 500,
        supermanaProgress: true,
        safeSupermanaProgressSteps: 2,
      }),
    ];
    expect(
      [0, 1, 2].sort((left, right) =>
        compareRankedReplyRiskEvaluations(roots, left, right),
      ),
    ).toEqual([1, 2, 0]);
  });
});

describe("reply-risk snapshots and selection", () => {
  it("matches terminal sentinels and evaluates a bounded legal reply", () => {
    const won = new MonsGame();
    won.whiteScore = 5;
    expect(rootReplyRiskSnapshot(won, Color.White, {}, 1)).toEqual({
      allowsImmediateOpponentWin: false,
      opponentReachesMatchPoint: false,
      worstReplyScore: 134_217_727,
    });
    expect(rootReplyRiskSnapshot(won, Color.Black, {}, 1)).toEqual({
      allowsImmediateOpponentWin: true,
      opponentReachesMatchPoint: true,
      worstReplyScore: -134_217_727,
    });

    const game = new MonsGame();
    game.activeColor = Color.Black;
    game.turnNumber = 2;
    const before = game.fen();
    const snapshot = rootReplyRiskSnapshot(
      game,
      Color.White,
      {
        evaluationCacheKey: "one-reply-oracle",
        evaluateGame: () => 1_234,
      },
      1,
    );
    expect(snapshot).toEqual({
      allowsImmediateOpponentWin: false,
      opponentReachesMatchPoint: false,
      worstReplyScore: 1_234,
    });
    expect(game.fen()).toBe(before);
  });

  it("rejects the higher-scored root when it hands the opponent a win", () => {
    const losing = new MonsGame();
    losing.blackScore = 5;
    const safe = new MonsGame();
    const roots = [
      evaluation(0, { score: 1_000, game: losing }),
      evaluation(1, { score: 990, game: safe }),
    ];
    expect(
      pickRootWithReplyRiskGuard(new MonsGame(), roots, [0, 1], Color.White, {
        currentPro: true,
        maxVisitedNodes: 100,
        rootReplyRiskScoreMargin: 100,
        rootReplyRiskShortlistMax: 2,
        rootReplyRiskReplyLimit: 4,
        rootReplyRiskNodeShareBp: 2_000,
        evaluationCacheKey: "root-pick",
        evaluateGame: () => 0,
      }),
    ).toBe(1);
  });

  it("uses the full candidate pool for omitted same-opening setup reentry", () => {
    const sharedOpening = input(7);
    const roots = [
      evaluation(0, {
        score: 990,
        efficiency: 10,
        inputs: sharedOpening,
        spiritOwnManaSetupNow: true,
      }),
      evaluation(1),
      evaluation(2),
      evaluation(5, { score: 900, efficiency: 0 }),
      evaluation(4, {
        score: 1_000,
        efficiency: 10,
        inputs: sharedOpening,
      }),
    ];
    const config = {
      currentPro: true,
      turnEngineMode: TurnEngineMode.CurrentPro,
      enableRootReplyRiskGuard: true,
      maxVisitedNodes: 100,
      rootReplyRiskScoreMargin: 200,
      rootReplyRiskShortlistMax: 2,
      rootReplyRiskReplyLimit: 4,
      rootReplyRiskNodeShareBp: 2_000,
      evaluationCacheKey: "omitted-candidate-pool",
      evaluateGame: () => 0,
    } as const;

    expect(
      pickRootWithReplyRiskGuard(
        new MonsGame(),
        roots,
        [4, 3],
        Color.White,
        config,
      ),
    ).toBe(4);
    expect(
      pickRootWithReplyRiskGuard(
        new MonsGame(),
        roots,
        [4, 3],
        Color.White,
        config,
        [0, 3, 4],
      ),
    ).toBe(0);
  });

  it("returns a conservative timeout without poisoning the cache", () => {
    const game = new MonsGame();
    const timedOut = withAutomoveClock({ now: () => 100 }, () =>
      withDeadlineIfAbsent(0, () =>
        rootReplyRiskSnapshot(
          game,
          Color.White,
          { evaluationCacheKey: "cancel", evaluateGame: () => 42 },
          1,
        ),
      ),
    );
    expect(timedOut).toEqual({
      allowsImmediateOpponentWin: true,
      opponentReachesMatchPoint: true,
      worstReplyScore: -134_217_727,
    });
    resetDeadlineStateForTesting();
    expect(
      rootReplyRiskSnapshot(
        game,
        Color.White,
        { evaluationCacheKey: "cancel", evaluateGame: () => 42 },
        1,
      ).worstReplyScore,
    ).toBe(42);
  });
});

describe("reply-risk projection policy", () => {
  const projectionConfig = {
    currentPro: true,
    turnEngineMode: TurnEngineMode.CurrentPro,
    enableTurnEngineSelector: true,
    enableTurnEngineSecondaryAnalysis: true,
  } as const;

  it("uses only eligible informative projections for snapshots", () => {
    const rootGame = new MonsGame();
    rootGame.turnNumber = 3;
    const projectedGame = new MonsGame();
    projectedGame.turnNumber = 9;
    const root = evaluation(0, { game: rootGame });
    const projected = projection(projectedGame, TurnPlanFamily.ImmediateScore);

    expect(
      shouldUseReplyRiskProjectionForRoot(
        root,
        projected,
        Color.White,
        projectionConfig,
      ),
    ).toBe(true);
    expect(
      rootReplyRiskSnapshotWithProjection(
        root,
        projected,
        Color.White,
        {
          ...projectionConfig,
          evaluateGame: (game) => game.turnNumber,
        },
        1,
      ).worstReplyScore,
    ).toBe(9);

    const progress = evaluation(1, {
      game: rootGame,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 3,
    });
    expect(
      shouldUseReplyRiskProjectionForRoot(
        progress,
        projection(projectedGame, TurnPlanFamily.SafeSupermanaProgress),
        Color.White,
        projectionConfig,
      ),
    ).toBe(true);
    expect(
      shouldUseReplyRiskProjectionForRoot(
        root,
        projection(projectedGame, TurnPlanFamily.SafeSupermanaProgress),
        Color.White,
        projectionConfig,
      ),
    ).toBe(false);
    expect(
      shouldUseReplyRiskProjectionForRoot(
        root,
        projection(projectedGame, TurnPlanFamily.ManaTempo),
        Color.White,
        projectionConfig,
      ),
    ).toBe(false);
  });

  it("rejects terminal, opponent-active, plain-spirit, and unsafe spirit projections", () => {
    const projectedGame = new MonsGame();
    const projected = projection(projectedGame, TurnPlanFamily.SpiritImpact);

    const terminalGame = new MonsGame();
    terminalGame.whiteScore = 5;
    const terminal = evaluation(0, { game: terminalGame });
    expect(canTurnEngineProjectReplyRiskRoot(terminal, Color.White)).toBe(
      false,
    );
    expect(
      shouldUseReplyRiskProjectionForRoot(
        terminal,
        projected,
        Color.White,
        projectionConfig,
      ),
    ).toBe(false);

    const opponentActiveGame = new MonsGame();
    opponentActiveGame.activeColor = Color.Black;
    const opponentActive = evaluation(1, { game: opponentActiveGame });
    expect(canTurnEngineProjectReplyRiskRoot(opponentActive, Color.White)).toBe(
      false,
    );
    expect(
      shouldUseReplyRiskProjectionForRoot(
        opponentActive,
        projected,
        Color.White,
        projectionConfig,
      ),
    ).toBe(false);

    const plainSpirit = evaluation(2, { spiritDevelopment: true });
    expect(
      shouldUseReplyRiskProjectionForRoot(
        plainSpirit,
        projected,
        Color.White,
        projectionConfig,
      ),
    ).toBe(false);
    const unsafeNonSpirit = evaluation(3, {
      ownDrainerVulnerable: true,
    });
    expect(
      shouldUseReplyRiskProjectionForRoot(
        unsafeNonSpirit,
        projected,
        Color.White,
        projectionConfig,
      ),
    ).toBe(false);
  });

  it("uses separate low-budget spirit and challenger caps with full recovery projection", () => {
    const roots = [
      ...Array.from({ length: 6 }, (_value, index) =>
        evaluation(index, { spiritDevelopment: true }),
      ),
      evaluation(6),
      evaluation(7, { ownDrainerVulnerable: true }),
      evaluation(8),
    ];
    const observed = new Map<
      number,
      { expansionCap: number; replyBeam: number }
    >();
    const projected = turnEngineSpiritRootProjections(
      roots,
      [8, 7, 6, 5, 4, 3, 2, 1, 0],
      Color.White,
      {
        currentPro: true,
        turnEngineMode: TurnEngineMode.CurrentPro,
        enableTurnEngineSelector: true,
        enableTurnEngineSecondaryAnalysis: true,
        enableTurnEngineLowBudgetGuard: true,
        turnEngineExpansionCap: 176,
        turnEngineReplyBeamWidth: 1,
        buildTurnEnginePlanForReplyRisk: (
          _root,
          index,
          _perspective,
          engineConfig,
        ) => {
          observed.set(index, {
            expansionCap: engineConfig.expansionCap,
            replyBeam: engineConfig.replyBeam,
          });
          return projection(new MonsGame(), TurnPlanFamily.SpiritImpact).plan;
        },
      },
    );

    expect([...projected.keys()]).toEqual([0, 1, 2, 3, 6, 7]);
    expect(observed.get(0)).toEqual({ expansionCap: 144, replyBeam: 2 });
    expect(observed.get(6)).toEqual({ expansionCap: 144, replyBeam: 2 });
    expect(observed.get(7)).toEqual({ expansionCap: 176, replyBeam: 1 });
    expect(observed.has(4)).toBe(false);
    expect(observed.has(8)).toBe(false);
  });

  it("builds the bounded CurrentPro projection shortlist with rerank caps", () => {
    const roots = [
      evaluation(0, { spiritDevelopment: true }),
      evaluation(1, { spiritDevelopment: true }),
    ];
    const seenCaps: number[] = [];
    const projections = turnEngineReplyRiskProjections(
      roots,
      [0, 1],
      Color.White,
      {
        ...projectionConfig,
        enableTurnEngineLowBudgetGuard: true,
        turnEngineSeedCap: 14,
        turnEngineReplyBeamWidth: 1,
        buildTurnEnginePlanForReplyRisk: (
          root,
          _index,
          _perspective,
          config,
        ) => {
          seenCaps.push(config.ownSeedCap, config.replyBeam);
          return projection(root.game, TurnPlanFamily.SpiritImpact).plan;
        },
      },
    );
    expect([...projections.keys()]).toEqual([0, 1]);
    expect(seenCaps).toEqual([12, 2, 12, 2]);
  });
});

describe("reply-risk comparator parity", () => {
  const currentProConfig = {
    currentPro: true,
    turnEngineMode: TurnEngineMode.CurrentPro,
    enableInterviewDeterministicTiebreak: true,
    preferCleanReplyRiskRoots: true,
  } as const;

  it("keeps the terminal/tactical axes ahead of reply-floor score", () => {
    const immediate = evaluation(0, { winsImmediately: true, score: 0 });
    const quiet = evaluation(1, { score: 10_000 });
    expect(
      isBetterReplyRiskCandidate(
        immediate,
        {
          allowsImmediateOpponentWin: true,
          opponentReachesMatchPoint: true,
          worstReplyScore: -10_000,
        },
        quiet,
        snapshot(10_000),
        currentProConfig,
      ),
    ).toBe(true);
  });

  it("requires both progress routes and pickup flags to match for safe siblings", () => {
    const risky = evaluation(0, {
      score: 1_000,
      ownDrainerVulnerable: true,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 3,
    });
    const safe = evaluation(1, {
      score: 900,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 3,
    });
    expect(
      isBetterReplyRiskCandidate(
        safe,
        snapshot(0),
        risky,
        snapshot(100),
        currentProConfig,
      ),
    ).toBe(true);

    const differentRoute = evaluation(1, {
      score: 900,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 2,
    });
    expect(
      isBetterReplyRiskCandidate(
        differentRoute,
        snapshot(0),
        risky,
        snapshot(100),
        currentProConfig,
      ),
    ).toBe(false);

    const differentPickup = evaluation(0, {
      score: 1_000,
      ownDrainerVulnerable: true,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 3,
      safeSupermanaPickupNow: true,
    });
    expect(
      isBetterReplyRiskCandidate(
        safe,
        snapshot(0),
        differentPickup,
        snapshot(100),
        currentProConfig,
      ),
    ).toBe(false);
  });

  it("allows only an immediate-score recovery projection to retain a risky sibling", () => {
    const risky = evaluation(0, {
      score: 1_000,
      ownDrainerVulnerable: true,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 3,
    });
    const safe = evaluation(1, {
      score: 990,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 3,
    });
    const end = new MonsGame();
    const safeProjection = projection(
      end,
      TurnPlanFamily.SafeSupermanaProgress,
      { utility: { scoreDelta: 0 } },
    );
    const scoringRecovery = projection(
      end,
      TurnPlanFamily.DrainerSafetyRecovery,
      {
        goalFamily: TurnPlanFamily.ImmediateScore,
        utility: { scoreDelta: 1 },
      },
    );
    expect(
      isBetterReplyRiskCandidate(
        risky,
        snapshot(100),
        safe,
        snapshot(0),
        currentProConfig,
        {
          candidateProjection: scoringRecovery,
          incumbentProjection: safeProjection,
        },
      ),
    ).toBe(true);

    const recoveryOnly = projection(end, TurnPlanFamily.DrainerSafetyRecovery, {
      goalFamily: TurnPlanFamily.DrainerSafetyRecovery,
      utility: { scoreDelta: 1 },
    });
    expect(
      isBetterReplyRiskCandidate(
        risky,
        snapshot(100),
        safe,
        snapshot(0),
        currentProConfig,
        {
          candidateProjection: recoveryOnly,
          incumbentProjection: safeProjection,
        },
      ),
    ).toBe(false);
  });

  it("applies deterministic setup and progress-step comparisons before scores", () => {
    const setup = evaluation(0, {
      score: 100,
      spiritOwnManaSetupNow: true,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 2,
    });
    const plain = evaluation(1, { score: 200 });
    expect(
      isBetterReplyRiskCandidate(setup, snapshot(0), plain, snapshot(0), {
        currentPro: false,
        turnEngineMode: TurnEngineMode.ProV1,
        enableInterviewDeterministicTiebreak: true,
      }),
    ).toBe(true);

    const slowerSetup = evaluation(1, {
      score: 200,
      spiritOwnManaSetupNow: true,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 4,
    });
    expect(
      isBetterReplyRiskCandidate(setup, snapshot(0), slowerSetup, snapshot(0), {
        currentPro: false,
        turnEngineMode: TurnEngineMode.ProV1,
        enableInterviewDeterministicTiebreak: true,
      }),
    ).toBe(true);
  });

  it("uses stable root rank for an otherwise equal safe plain-spirit pair", () => {
    const later = evaluation(5, { score: 500, spiritDevelopment: true });
    const earlier = evaluation(1, { score: 500, spiritDevelopment: true });
    expect(
      isBetterReplyRiskCandidate(
        earlier,
        snapshot(0),
        later,
        snapshot(0),
        currentProConfig,
      ),
    ).toBe(true);
  });
});

describe("CurrentPro specialized reply-risk orders", () => {
  const currentProSecondary = {
    currentPro: true,
    turnEngineMode: TurnEngineMode.CurrentPro,
    enableTurnEngineSelector: true,
    enableTurnEngineSecondaryAnalysis: true,
    preferCleanReplyRiskRoots: true,
  } as const;

  it("reenters the earlier white turn-four mana sibling", () => {
    const game = new MonsGame();
    game.turnNumber = 3;
    game.monsMovesCount = 4;
    const sharedInputs = input(4);
    const anchor = evaluation(5, {
      rootRank: 5,
      score: 1_000,
      efficiency: 7,
      inputs: sharedInputs,
      safeSupermanaProgressSteps: 3,
    });
    const sibling = evaluation(2, {
      rootRank: 2,
      score: 990,
      efficiency: 7,
      inputs: sharedInputs,
      safeSupermanaProgressSteps: 3,
    });
    expect(
      currentProWhiteTurnFourManaSiblingReentry(
        game,
        [anchor, sibling],
        [0],
        Color.White,
        {
          ...currentProSecondary,
          evaluateTurnEngineRootUtility: () => new TurnEngineUtility(),
        },
      ),
    ).toBe(1);
  });

  it("keeps early black progress ahead of a weaker mana root", () => {
    const game = new MonsGame();
    game.activeColor = Color.Black;
    game.turnNumber = 3;
    const progress = evaluation(1, {
      score: 501,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 2,
    });
    const mana = evaluation(2, { score: 500 });
    expect(
      replyRiskAdvisorPolicy.earlyBlackManaProgressReplyOrder(
        game,
        progress,
        snapshot(0),
        mana,
        snapshot(0),
        currentProSecondary,
      ),
    ).toBe(1);
  });

  it("orders black setup and safe non-spirit followups by their probe floors", () => {
    const game = new MonsGame();
    game.activeColor = Color.Black;
    game.turnNumber = 2;
    const sharedInputs = input(3);
    const setupGame = new MonsGame();
    setupGame.turnNumber = 20;
    const plainGame = new MonsGame();
    plainGame.turnNumber = 10;
    const setup = evaluation(0, {
      game: setupGame,
      inputs: sharedInputs,
      score: 490,
      spiritOwnManaSetupNow: true,
      spiritSetupGain: 64,
    });
    const plain = evaluation(1, {
      game: plainGame,
      inputs: sharedInputs,
      score: 500,
      spiritDevelopment: true,
    });
    const config = {
      ...currentProSecondary,
      spiritFollowupFloorScore: (state: MonsGame) => state.turnNumber * 10,
    };
    expect(
      replyRiskAdvisorPolicy.blackPlainSpiritFollowupReplyOrder(
        game,
        [setup, plain],
        0,
        snapshot(0),
        1,
        snapshot(0),
        Color.Black,
        config,
        new Map<number, number>(),
      ),
    ).toBe(1);

    const challenger = evaluation(0, {
      game: setupGame,
      score: 520,
    });
    expect(
      replyRiskAdvisorPolicy.safeNonSpiritFollowupOrder(
        game,
        [challenger, plain],
        0,
        snapshot(0),
        1,
        snapshot(0),
        Color.Black,
        config,
        new Map<number, number>(),
      ),
    ).toBe(1);
  });

  it("preserves the early white spirit-followup setup override", () => {
    const game = new MonsGame();
    game.turnNumber = 3;
    game.monsMovesCount = 1;
    const sharedInputs = input(6);
    const setup = evaluation(1, {
      inputs: sharedInputs,
      efficiency: 8,
      spiritOwnManaSetupNow: true,
      opponentManaProgress: true,
    });
    const plain = evaluation(2, {
      inputs: sharedInputs,
      efficiency: 8,
      spiritDevelopment: true,
      opponentManaProgress: true,
    });
    expect(
      replyRiskAdvisorPolicy.whiteSpiritFollowupSetupReplyOrder(
        game,
        setup,
        snapshot(0),
        plain,
        snapshot(0),
        currentProSecondary,
      ),
    ).toBe(1);
  });

  it("runs the Normal deep-safety floor after equal shallow axes", () => {
    const game = new MonsGame();
    game.whiteScore = 2;
    const candidateGame = new MonsGame();
    candidateGame.turnNumber = 2;
    const incumbentGame = new MonsGame();
    incumbentGame.turnNumber = 1;
    const candidate = evaluation(1, {
      game: candidateGame,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 2,
    });
    const incumbent = evaluation(2, { game: incumbentGame });
    expect(
      replyRiskAdvisorPolicy.normalSafetyReplyOrder(
        game,
        candidate,
        snapshot(0),
        incumbent,
        snapshot(0),
        Color.White,
        {
          ...currentProSecondary,
          enableNormalRootSafetyRerank: true,
          enableNormalRootSafetyDeepFloor: true,
          evaluateGame: () => 0,
          normalRootSafetyDeepFloorScore: (state: MonsGame) => state.turnNumber,
        },
      ),
    ).toBe(1);
  });

  it("lets a materially safer non-spirit projection win the mixed floor", () => {
    const end = new MonsGame();
    const nonSpirit = projection(end, TurnPlanFamily.SafeSupermanaProgress, {
      goalFamily: TurnPlanFamily.SpiritImpact,
    });
    const spirit = projection(end, TurnPlanFamily.SpiritImpact);
    expect(
      replyRiskAdvisorPolicy.mixedPlainSpiritReplyFloorOrder(
        snapshot(128),
        nonSpirit,
        snapshot(0),
        spirit,
        currentProSecondary,
      ),
    ).toBe(1);
  });
});

describe("reply-risk routing and cache isolation", () => {
  it("keeps the shipping CurrentPro generic guard disabled", () => {
    const game = new MonsGame();
    const base = searchConfigForPreference(game, "fast");
    const config = replyRiskConfigForSearch({
      ...base,
      ...applyShippingProConfig(base),
      preference: "pro",
    });
    expect(config.enableRootReplyRiskGuard).toBe(false);
    expect(
      pickRootWithReplyRiskGuard(
        game,
        [evaluation(0), evaluation(1)],
        [0, 1],
        Color.White,
        config,
      ),
    ).toBeUndefined();
  });

  it("never reuses a snapshot across injected evaluators", () => {
    const game = new MonsGame();
    expect(
      rootReplyRiskSnapshot(
        game,
        Color.White,
        { evaluationCacheKey: "shared", evaluateGame: () => 11 },
        1,
      ).worstReplyScore,
    ).toBe(11);
    expect(
      rootReplyRiskSnapshot(
        game,
        Color.White,
        { evaluationCacheKey: "shared", evaluateGame: () => 22 },
        1,
      ).worstReplyScore,
    ).toBe(22);
  });

  it("bypasses the selected-override cache for injected utility evaluators", () => {
    const game = new MonsGame();
    const root = evaluation(0);
    let calls = 0;
    const config = {
      currentPro: true,
      turnEngineMode: TurnEngineMode.CurrentPro,
      enableTurnEngineSelector: true,
      enableTurnEngineSecondaryAnalysis: true,
      evaluateTurnEngineRootUtility: () =>
        new TurnEngineUtility({ evalScore: ++calls }),
    } as const;
    expect(
      replyRiskAdvisorPolicy.turnEngineRootUtility(
        game,
        root,
        Color.White,
        config,
        TurnPlanFamily.ManaTempo,
      ).evalScore,
    ).toBe(1);
    expect(
      replyRiskAdvisorPolicy.turnEngineRootUtility(
        game,
        root,
        Color.White,
        config,
        TurnPlanFamily.ManaTempo,
      ).evalScore,
    ).toBe(2);
  });
});
