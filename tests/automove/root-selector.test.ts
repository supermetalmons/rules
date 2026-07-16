import { describe, expect, it, vi } from "vitest";

import {
  compareRankedRootEvaluationIndices,
  compareTacticalRootEvaluations,
  filteredRootCandidateIndices,
  isPlainSpiritDevelopmentRoot,
  pickBaselineRootIndex,
  pickBaselineRootIndexFromCandidateIndices,
  pickBaselineRootInputs,
  rootProgressStepsBetter,
  rootScorePathStepsBetter,
  shouldPreferSpiritDevelopment,
  spiritScoreChallengeOrder,
  type RootSelectorOptions,
} from "../../src/automove/root-selector.js";
import { searchConfigFromPreference } from "../../src/automove/selector-config.js";
import {
  AUTOMOVE_TURN_ENGINE_MODE,
  type AutomoveSearchConfig,
  type RootEvaluation,
} from "../../src/automove/selector-types.js";
import { GameVariant, MONS_MOVES_PER_TURN } from "../../src/engine/config.js";
import { Color, type Input } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import { I32_MAX } from "../../src/engine/numerics.js";

type RootOverrides = Omit<Partial<RootEvaluation>, "classes"> & {
  readonly classes?: Partial<RootEvaluation["classes"]>;
};

function input(id: number): Input[] {
  return [{ kind: "location", location: { i: id, j: 0 } }];
}

function root(id: number, overrides: RootOverrides = {}): RootEvaluation {
  const base: RootEvaluation = {
    rootRank: id,
    inputs: input(id),
    game: new MonsGame(false, GameVariant.Classic),
    score: 0,
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

function gameAtTurn(turnNumber = 1): MonsGame {
  const game = new MonsGame(false, GameVariant.Classic);
  game.turnNumber = turnNumber;
  return game;
}

function config(
  overrides: Partial<AutomoveSearchConfig> = {},
): AutomoveSearchConfig {
  return {
    ...searchConfigFromPreference("fast"),
    enableInterviewHardSpiritDeploy: false,
    enableRootSpiritDevelopmentPref: false,
    enableRootReplyRiskGuard: false,
    rootDrainerSafetyScoreMargin: 10_000,
    rootAntiHelpScoreMargin: 0,
    ...overrides,
  };
}

function filtered(
  roots: readonly RootEvaluation[],
  game = gameAtTurn(),
  configOverrides: Partial<AutomoveSearchConfig> = {},
  options: RootSelectorOptions = {},
): number[] {
  return filteredRootCandidateIndices(
    game,
    roots,
    game.activeColor,
    config(configOverrides),
    options,
  );
}

function selected(
  roots: readonly RootEvaluation[],
  game = gameAtTurn(),
  configOverrides: Partial<AutomoveSearchConfig> = {},
  options: RootSelectorOptions = {},
): number | undefined {
  return pickBaselineRootIndexFromCandidateIndices(
    game,
    roots,
    roots.map((_candidate, index) => index),
    game.activeColor,
    config(configOverrides),
    options,
  );
}

function negativeDenySpiritRoots(): RootEvaluation[] {
  return [
    root(0, {
      spiritDevelopment: true,
      spiritOwnManaSetupNow: true,
    }),
    root(1, {
      spiritDevelopment: true,
      spiritOwnManaSetupNow: true,
      supermanaProgress: true,
      safeSupermanaProgressSteps: 2,
    }),
    root(2),
    root(3),
  ];
}

describe("baseline root shortlist", () => {
  it("preserves immediate-win and forced-drainer-attack order", () => {
    expect(
      filtered([
        root(0, { attacksOpponentDrainer: true }),
        root(1, { winsImmediately: true }),
        root(2),
        root(3, { winsImmediately: true }),
      ]),
    ).toEqual([1, 3]);

    expect(
      filtered([
        root(0),
        root(1, { attacksOpponentDrainer: true }),
        root(2),
        root(3, { attacksOpponentDrainer: true }),
      ]),
    ).toEqual([1, 3]);
  });

  it("retains the best safe score window before pickup preferences", () => {
    expect(
      filtered([
        root(0, { sameTurnScoreWindowValue: 1 }),
        root(1, { sameTurnScoreWindowValue: 3 }),
        root(2, {
          sameTurnScoreWindowValue: 4,
          ownDrainerVulnerable: true,
        }),
        root(3, {
          sameTurnScoreWindowValue: 5,
          manaHandoffToOpponent: true,
        }),
      ]),
    ).toEqual([1]);
  });

  it("gives supermana pickup precedence and otherwise retains opponent-mana pickup lines", () => {
    expect(
      filtered([
        root(0, { safeSupermanaPickupNow: true }),
        root(1, { scoresSupermanaThisTurn: true }),
        root(2, { safeOpponentManaPickupNow: true }),
        root(3),
      ]),
    ).toEqual([0, 1]);

    expect(
      filtered([
        root(0, { safeOpponentManaPickupNow: true }),
        root(1, { scoresOpponentManaThisTurn: true }),
        root(2),
      ]),
    ).toEqual([0, 1]);
  });

  it("chooses spirit own-mana setup progress in supermana, opponent, then path order", () => {
    expect(
      filtered([
        root(0, {
          spiritOwnManaSetupNow: true,
          opponentManaProgress: true,
          safeOpponentManaProgressSteps: 1,
        }),
        root(1, {
          spiritOwnManaSetupNow: true,
          supermanaProgress: true,
          safeSupermanaProgressSteps: 4,
        }),
        root(2, {
          spiritOwnManaSetupNow: true,
          supermanaProgress: true,
          safeSupermanaProgressSteps: 2,
        }),
        root(3),
      ]),
    ).toEqual([2]);

    expect(
      filtered([
        root(0, {
          spiritOwnManaSetupNow: true,
          opponentManaProgress: true,
          safeOpponentManaProgressSteps: 4,
        }),
        root(1, {
          spiritOwnManaSetupNow: true,
          opponentManaProgress: true,
          safeOpponentManaProgressSteps: 2,
        }),
        root(2, { spiritOwnManaSetupNow: true }),
      ]),
    ).toEqual([1]);

    expect(
      filtered([
        root(0, { spiritOwnManaSetupNow: true, scorePathBestSteps: 8 }),
        root(1, { spiritOwnManaSetupNow: true, scorePathBestSteps: 5 }),
        root(2),
      ]),
    ).toEqual([1]);
  });

  it("hard-deploys an awake base spirit unless keeping it scores and deploying does not", () => {
    const game = gameAtTurn(2);
    expect(shouldPreferSpiritDevelopment(game, Color.White)).toBe(true);
    const keepsAndScores = game.clone();
    keepsAndScores.whiteScore = 1;
    const deploysWithoutScore = game.clone();
    const deploysAndScores = game.clone();
    deploysAndScores.whiteScore = 1;

    expect(
      filtered(
        [
          root(0, { keepsAwakeSpiritOnBase: true }),
          root(1, { keepsAwakeSpiritOnBase: false }),
        ],
        game,
        { enableInterviewHardSpiritDeploy: true },
      ),
    ).toEqual([1]);
    expect(
      filtered(
        [
          root(0, {
            game: keepsAndScores,
            keepsAwakeSpiritOnBase: true,
          }),
          root(1, {
            game: deploysWithoutScore,
            keepsAwakeSpiritOnBase: false,
          }),
        ],
        game,
        { enableInterviewHardSpiritDeploy: true },
      ),
    ).toEqual([0, 1]);
    expect(
      filtered(
        [
          root(0, {
            game: keepsAndScores,
            keepsAwakeSpiritOnBase: true,
          }),
          root(1, {
            game: deploysAndScores,
            keepsAwakeSpiritOnBase: false,
          }),
        ],
        game,
        { enableInterviewHardSpiritDeploy: true },
      ),
    ).toEqual([1]);
  });

  it("applies the drainer-safety score margin before general spirit preference", () => {
    expect(
      filtered(
        [
          root(0, { score: 1_000, ownDrainerVulnerable: true }),
          root(1, { score: 950 }),
          root(2, { score: 899 }),
        ],
        gameAtTurn(),
        { rootDrainerSafetyScoreMargin: 100 },
      ),
    ).toEqual([1]);
  });

  it("keeps spirit development within the inclusive 700-point window", () => {
    const game = gameAtTurn(2);
    expect(
      filtered(
        [
          root(0, { score: 1_000 }),
          root(1, { score: 300, spiritDevelopment: true }),
        ],
        game,
        { enableRootSpiritDevelopmentPref: true },
      ),
    ).toEqual([1]);
    expect(
      filtered(
        [
          root(0, { score: 1_000 }),
          root(1, { score: 299, spiritDevelopment: true }),
        ],
        game,
        { enableRootSpiritDevelopmentPref: true },
      ),
    ).toEqual([0, 1]);
  });

  it("conserves a potion when a near-best non-spend survives and keeps compensated spends", () => {
    const game = gameAtTurn(2);
    game.actionsUsedCount = 1;
    game.monsMovesCount = MONS_MOVES_PER_TURN;
    game.manaMovesCount = 0;
    game.whitePotionsCount = 1;
    const noSpend = game.clone();
    const spend = game.clone();
    spend.whitePotionsCount = 0;

    const roots = [
      root(0, { game: noSpend, score: 1_000 }),
      root(1, { game: spend, score: 950 }),
      root(2, {
        game: spend,
        score: 940,
        scoresSupermanaThisTurn: true,
      }),
    ];
    expect(filtered(roots, game)).toEqual([0, 2]);
    expect(
      filtered(
        roots,
        game,
        {},
        {
          rootReplyRiskSnapshot: (
            _after,
            _perspective,
            _config,
            _limit,
            index,
          ) => ({
            allowsImmediateOpponentWin: index === 0,
          }),
        },
      ),
    ).toEqual([0, 1, 2]);
  });

  it("removes near-best handoff and roundtrip roots only when a clean non-loser exists", () => {
    const roots = [
      root(0, { score: 1_000 }),
      root(1, { score: 950, manaHandoffToOpponent: true }),
      root(2, { score: 940, hasRoundtrip: true }),
      root(3, { score: 500, manaHandoffToOpponent: true }),
    ];
    expect(
      filtered(roots, gameAtTurn(), { rootAntiHelpScoreMargin: 100 }),
    ).toEqual([0, 3]);
    expect(
      filtered(
        roots,
        gameAtTurn(),
        { rootAntiHelpScoreMargin: 100 },
        {
          rootReplyRiskSnapshot: (_after, _perspective, _config, limit) => ({
            allowsImmediateOpponentWin: limit === 6,
          }),
        },
      ),
    ).toEqual([0, 1, 2, 3]);
  });

  it("exposes CurrentPro competition and reentry seams without changing ProV1", () => {
    const roots = [
      root(0, { score: 1_000, ownDrainerVulnerable: true }),
      root(1, { score: 950, spiritOwnManaSetupNow: true }),
      root(2, { score: 800 }),
    ];
    const kinds: string[] = [];
    expect(
      filtered(
        roots,
        gameAtTurn(),
        {
          turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro,
          rootDrainerSafetyScoreMargin: 100,
        },
        {
          currentPro: {
            competition: (kind) => {
              kinds.push(kind);
              return kind === "safe-progress";
            },
            safetyReentryIndices: () => [0],
            finalReentryIndices: () => [2],
          },
        },
      ),
    ).toEqual([0, 1, 2]);
    expect(new Set(kinds)).toEqual(
      new Set([
        "safe-progress",
        "followup-progress",
        "risky-score",
        "negative-deny",
        "score",
        "projection",
        "risky-recovery",
      ]),
    );
    expect(filtered(roots)).toEqual([1]);
  });

  it("lets a safe own-mana setup override negative-deny competition when it competes with every non-Spirit root", () => {
    const kinds: string[] = [];
    const setupCompetes = vi.fn(
      (_context: unknown, candidateIndex: number, incumbentIndex: number) =>
        candidateIndex === 1 && (incumbentIndex === 2 || incumbentIndex === 3),
    );

    expect(
      filtered(
        negativeDenySpiritRoots(),
        gameAtTurn(),
        { turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro },
        {
          currentPro: {
            competition: (kind) => {
              kinds.push(kind);
              return kind === "negative-deny";
            },
            spiritSetupCompetesWithBest: setupCompetes,
          },
        },
      ),
    ).toEqual([1]);
    expect(setupCompetes).toHaveBeenCalledTimes(3);
    expect(setupCompetes).toHaveBeenNthCalledWith(1, expect.any(Object), 0, 2);
    expect(setupCompetes).toHaveBeenNthCalledWith(2, expect.any(Object), 1, 2);
    expect(setupCompetes).toHaveBeenNthCalledWith(3, expect.any(Object), 1, 3);
    expect(new Set(kinds)).toEqual(
      new Set([
        "safe-progress",
        "followup-progress",
        "risky-score",
        "negative-deny",
        "score",
        "projection",
        "risky-recovery",
      ]),
    );
  });

  it("keeps negative-deny competition when a setup does not compete with every non-Spirit root", () => {
    expect(
      filtered(
        negativeDenySpiritRoots(),
        gameAtTurn(),
        { turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro },
        {
          currentPro: {
            competition: (kind) => kind === "negative-deny",
            spiritSetupCompetesWithBest: (
              _context,
              _candidateIndex,
              incumbentIndex,
            ) => incumbentIndex !== 3,
          },
        },
      ),
    ).toEqual([0, 1, 2, 3]);
  });

  it("keeps another competition kind active when negative-deny is overridden", () => {
    expect(
      filtered(
        negativeDenySpiritRoots(),
        gameAtTurn(),
        { turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro },
        {
          currentPro: {
            competition: (kind) =>
              kind === "negative-deny" || kind === "safe-progress",
            spiritSetupCompetesWithBest: () => true,
          },
        },
      ),
    ).toEqual([0, 1, 2, 3]);
  });

  it("keeps negative-deny competition when the setup comparator is absent", () => {
    expect(
      filtered(
        negativeDenySpiritRoots(),
        gameAtTurn(),
        { turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro },
        {
          currentPro: {
            competition: (kind) => kind === "negative-deny",
          },
        },
      ),
    ).toEqual([0, 1, 2, 3]);
  });
});

describe("baseline root tie-breaking", () => {
  it("shortlists by score margin, then maximizes efficiency and score stably", () => {
    expect(
      selected(
        [
          root(0, { score: 100, efficiency: 1 }),
          root(1, { score: 95, efficiency: 10 }),
          root(2, { score: -1, efficiency: 100 }),
        ],
        gameAtTurn(),
        { rootEfficiencyScoreMargin: 100 },
      ),
    ).toBe(1);
    expect(
      selected([
        root(0, { score: 100, efficiency: 5 }),
        root(1, { score: 99, efficiency: 5 }),
      ]),
    ).toBe(0);
    expect(selected([root(0), root(1)])).toBe(0);
  });

  it("applies soft-priority only outside the inclusive 80-point band", () => {
    expect(
      selected([
        root(0, { efficiency: 100, interviewSoftPriority: 0 }),
        root(1, { efficiency: 0, interviewSoftPriority: 81 }),
      ]),
    ).toBe(1);
    expect(
      selected([
        root(0, { efficiency: 100, interviewSoftPriority: 0 }),
        root(1, { efficiency: 0, interviewSoftPriority: 80 }),
      ]),
    ).toBe(0);
  });

  it("orders score windows, spirit setups, setup gain, progress, and clean roots", () => {
    expect(
      selected([
        root(0, { efficiency: 100 }),
        root(1, { sameTurnScoreWindowValue: 1 }),
      ]),
    ).toBe(1);
    expect(
      selected([
        root(0, { efficiency: 100 }),
        root(1, { spiritSameTurnScoreSetupNow: true }),
      ]),
    ).toBe(1);
    expect(
      selected([
        root(0, { efficiency: 100 }),
        root(1, { spiritOwnManaSetupNow: true }),
      ]),
    ).toBe(1);

    const spiritGame = gameAtTurn(2);
    expect(
      selected(
        [
          root(0, {
            efficiency: 100,
            spiritDevelopment: true,
            spiritSetupGain: 1,
          }),
          root(1, { spiritDevelopment: true, spiritSetupGain: 2 }),
        ],
        spiritGame,
        { enableRootSpiritDevelopmentPref: true },
      ),
    ).toBe(1);
    expect(
      selected([
        root(0, { efficiency: 100, safeSupermanaProgressSteps: 4 }),
        root(1, { safeSupermanaProgressSteps: 2 }),
      ]),
    ).toBe(1);
    expect(
      selected([
        root(0, { efficiency: 100, safeOpponentManaProgressSteps: 4 }),
        root(1, { safeOpponentManaProgressSteps: 2 }),
      ]),
    ).toBe(1);
    expect(
      selected([
        root(0, { efficiency: 100, manaHandoffToOpponent: true }),
        root(1),
      ]),
    ).toBe(1);
    expect(
      selected([root(0, { efficiency: 100, hasRoundtrip: true }), root(1)]),
    ).toBe(1);
  });

  it("uses the exact plain-spirit score challenge in both directions", () => {
    const spirit = root(0, { score: 100, spiritDevelopment: true });
    const challenger = root(1, { score: 140 });
    expect(isPlainSpiritDevelopmentRoot(spirit)).toBe(true);
    expect(spiritScoreChallengeOrder(challenger, spirit)).toBe(1);
    expect(spiritScoreChallengeOrder(spirit, challenger)).toBe(-1);
    expect(
      spiritScoreChallengeOrder(root(2, { score: 139 }), spirit),
    ).toBeUndefined();
    expect(
      spiritScoreChallengeOrder(
        root(2, { score: 200, manaHandoffToOpponent: true }),
        spirit,
      ),
    ).toBeUndefined();
    expect(
      spiritScoreChallengeOrder(
        root(2, { score: 200, hasRoundtrip: true }),
        spirit,
      ),
    ).toBeUndefined();
    expect(
      spiritScoreChallengeOrder(
        root(2, { score: 200, sameTurnScoreWindowValue: 0 }),
        root(3, {
          score: 100,
          spiritDevelopment: true,
          sameTurnScoreWindowValue: 1,
        }),
      ),
    ).toBeUndefined();
    expect(
      spiritScoreChallengeOrder(
        root(2, { score: I32_MAX }),
        root(3, { score: I32_MAX, spiritDevelopment: true }),
      ),
    ).toBe(1);
    expect(
      spiritScoreChallengeOrder(
        root(2, {
          score: 200,
          ownDrainerVulnerable: true,
          safeSupermanaPickupNow: true,
        }),
        spirit,
      ),
    ).toBe(1);

    const game = gameAtTurn(2);
    expect(
      selected([spirit, root(1, { score: 139 })], game, {
        enableRootSpiritDevelopmentPref: true,
      }),
    ).toBe(0);
    expect(
      selected([spirit, challenger], game, {
        enableRootSpiritDevelopmentPref: true,
      }),
    ).toBe(1);
  });

  it("uses CurrentPro projection callbacks only for eligible spirit pairs", () => {
    const projectionOrder = vi.fn(
      (_context: unknown, candidateIndex: number) =>
        candidateIndex === 1 ? 1 : 0,
    );
    const currentPro = {
      turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro,
      enableRootSpiritDevelopmentPref: false,
    };
    expect(
      selected(
        [
          root(0, { spiritDevelopment: true }),
          root(1, { spiritDevelopment: true }),
        ],
        gameAtTurn(),
        currentPro,
        { currentPro: { spiritProjectionOrder: projectionOrder } },
      ),
    ).toBe(1);
    expect(projectionOrder).toHaveBeenCalled();
    projectionOrder.mockClear();
    expect(
      selected(
        [
          root(0, {
            spiritDevelopment: true,
            spiritOwnManaSetupNow: true,
          }),
          root(1, {
            spiritDevelopment: true,
            spiritOwnManaSetupNow: true,
          }),
        ],
        gameAtTurn(),
        currentPro,
        { currentPro: { spiritProjectionOrder: projectionOrder } },
      ),
    ).toBe(0);
    expect(projectionOrder).not.toHaveBeenCalled();
  });

  it("honors reply-risk and CurrentPro root selectors and validates callback indices", () => {
    const roots = [root(0), root(1)];
    const game = gameAtTurn();
    expect(
      selected(
        roots,
        game,
        { enableRootReplyRiskGuard: true },
        {
          pickReplyRiskGuardedIndex: () => 1,
        },
      ),
    ).toBe(1);
    expect(() =>
      selected(
        roots,
        game,
        { enableRootReplyRiskGuard: true },
        {
          pickReplyRiskGuardedIndex: () => 0.5,
        },
      ),
    ).toThrow(RangeError);
    expect(
      pickBaselineRootIndex(
        game,
        roots,
        Color.White,
        config({ turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro }),
        { currentPro: { pickRootIndex: () => 1 } },
      ),
    ).toBe(1);
    expect(() =>
      pickBaselineRootIndex(
        game,
        roots,
        Color.White,
        config({ turnEngineMode: AUTOMOVE_TURN_ENGINE_MODE.CurrentPro }),
        { currentPro: { pickRootIndex: () => Number.NaN } },
      ),
    ).toThrow(RangeError);
  });

  it("returns fresh input values and cooperatively stops", () => {
    const roots = [root(0), root(1, { efficiency: 1 })];
    const game = gameAtTurn();
    const inputs = pickBaselineRootInputs(game, roots, Color.White, config());
    expect(inputs).toEqual(input(1));
    const location = inputs[0];
    if (location?.kind !== "location") throw new Error("location expected");
    const source = roots[1]?.inputs[0];
    if (source?.kind !== "location") throw new Error("source expected");
    expect(inputs).not.toBe(roots[1]?.inputs);
    expect(location).not.toBe(source);
    expect(location.location).not.toBe(source.location);
    expect(
      pickBaselineRootIndex(game, roots, Color.White, config(), {
        checkpoint: () => true,
      }),
    ).toBeUndefined();
  });
});

describe("root selector pure helpers", () => {
  it("uses Rust unknown-step sentinels", () => {
    expect(rootProgressStepsBetter(14, 15)).toBe(true);
    expect(rootProgressStepsBetter(15, 14)).toBe(false);
    expect(rootProgressStepsBetter(4, 4)).toBe(false);
    expect(rootScorePathStepsBetter(32, 33)).toBe(true);
    expect(rootScorePathStepsBetter(33, 32)).toBe(false);
  });

  it("preserves tactical comparator and deterministic ranked-index order", () => {
    const plain = root(0);
    expect(
      compareTacticalRootEvaluations(root(1, { winsImmediately: true }), plain),
    ).toBeLessThan(0);
    expect(
      compareTacticalRootEvaluations(
        plain,
        root(1, { ownDrainerVulnerable: true }),
      ),
    ).toBeLessThan(0);
    expect(
      compareTacticalRootEvaluations(
        root(1, { safeSupermanaPickupNow: true }),
        plain,
      ),
    ).toBeLessThan(0);
    expect(
      compareTacticalRootEvaluations(
        root(1, { supermanaProgress: true }),
        plain,
      ),
    ).toBeLessThan(0);
    expect(
      compareTacticalRootEvaluations(
        plain,
        root(1, { manaHandoffToOpponent: true }),
      ),
    ).toBeLessThan(0);
    expect(compareTacticalRootEvaluations(root(1), root(2))).toBe(0);
    expect(compareRankedRootEvaluationIndices([root(0), root(1)], 0, 1)).toBe(
      -1,
    );
  });

  it("requires a live base spirit and remaining mon movement", () => {
    const game = gameAtTurn();
    expect(shouldPreferSpiritDevelopment(game, Color.White)).toBe(false);
    game.turnNumber = 2;
    expect(shouldPreferSpiritDevelopment(game, Color.White)).toBe(true);
    game.monsMovesCount = MONS_MOVES_PER_TURN;
    expect(shouldPreferSpiritDevelopment(game, Color.White)).toBe(false);
  });
});
