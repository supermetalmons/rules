import { describe, expect, it, vi } from "vitest";

import { GameVariant } from "../../src/engine/config.js";
import { Color, inputChainsEqual } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import type { ReplyRiskSearchConfig } from "../../src/automove/reply-risk.js";
import { rankRootCandidates } from "../../src/automove/root-candidates.js";
import { rootFamily } from "../../src/automove/root-family.js";
import {
  applyShippingProConfig,
  executionConfigFromSearchConfig,
  searchExecutionConfigForGame,
} from "../../src/automove/selector-config.js";
import { acceptTurnEngineHeadAfterSearch } from "../../src/automove/shipping-selector.js";
import type {
  AutomoveSearchExecutionConfig,
  RootEvaluation,
} from "../../src/automove/selector-types.js";
import {
  TurnPlanFamily,
  TurnEngineUtility,
  type TurnPlan,
} from "../../src/automove/turn-engine.js";

type RootPair = {
  readonly candidate: RootEvaluation;
  readonly selected: RootEvaluation;
};

type EvaluateTurnEngineRootUtility = NonNullable<
  ReplyRiskSearchConfig["evaluateTurnEngineRootUtility"]
>;

type TestExecutionConfig = AutomoveSearchExecutionConfig & {
  readonly evaluateTurnEngineRootUtility: EvaluateTurnEngineRootUtility;
};

const ZERO_UTILITY = new TurnEngineUtility();
const DOMINATING_UTILITY = new TurnEngineUtility({ denyGain: 1 });

function currentProConfig(game: MonsGame) {
  const base = searchExecutionConfigForGame(game, "pro");
  const executionConfig = executionConfigFromSearchConfig(
    applyShippingProConfig(base),
    "pro",
    base,
  );
  const evaluateTurnEngineRootUtility = vi.fn<EvaluateTurnEngineRootUtility>(
    () => ZERO_UTILITY,
  );
  const config = Object.freeze({
    ...executionConfig,
    enableTurnEngineSecondaryAnalysis: false,
    enableTurnEngineSelectedFollowupProjection: false,
    evaluateTurnEngineRootUtility,
  }) satisfies TestExecutionConfig;
  return { config, evaluateTurnEngineRootUtility };
}

function rootPair(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
): RootPair {
  const roots = rankRootCandidates(game, game.activeColor, config).slice(0, 2);
  const selectedRoot = roots[0];
  const candidateRoot = roots[1];
  if (selectedRoot === undefined || candidateRoot === undefined) {
    throw new Error("shipping acceptance tests require two legal roots");
  }
  return {
    candidate: { ...candidateRoot, score: candidateRoot.heuristic },
    selected: { ...selectedRoot, score: selectedRoot.heuristic },
  };
}

function neutralRoot(root: RootEvaluation): RootEvaluation {
  return {
    ...root,
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
    safeSupermanaProgressSteps: 99,
    safeOpponentManaProgressSteps: 99,
    scorePathBestSteps: 99,
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
}

function neutralRootPair(
  game: MonsGame,
  config: AutomoveSearchExecutionConfig,
): RootPair {
  const pair = rootPair(game, config);
  return {
    candidate: neutralRoot(pair.candidate),
    selected: neutralRoot(pair.selected),
  };
}

function planFor(candidate: RootEvaluation): TurnPlan {
  const family = rootFamily(candidate);
  return {
    actions: [],
    compiledChunks: [candidate.inputs],
    endGame: candidate.game,
    utility: new TurnEngineUtility(),
    headUtility: new TurnEngineUtility(),
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

function spiritPlanFor(candidate: RootEvaluation): TurnPlan {
  return {
    ...planFor(candidate),
    utility: DOMINATING_UTILITY,
    headUtility: DOMINATING_UTILITY,
    headFamily: TurnPlanFamily.SpiritImpact,
    goalFamily: TurnPlanFamily.SpiritImpact,
  };
}

function spiritFixture(
  turnNumber: number,
  options: {
    readonly candidateOwnManaSetup?: boolean;
    readonly selectedSpiritDevelopment?: boolean;
  } = {},
) {
  const game = new MonsGame(false, GameVariant.Classic);
  game.turnNumber = turnNumber;
  const { config, evaluateTurnEngineRootUtility } = currentProConfig(game);
  const pair = neutralRootPair(game, config);
  const candidate: RootEvaluation = {
    ...pair.candidate,
    spiritDevelopment: true,
    spiritOwnManaSetupNow: options.candidateOwnManaSetup ?? false,
  };
  const selected: RootEvaluation = {
    ...pair.selected,
    spiritDevelopment: options.selectedSpiritDevelopment ?? false,
  };
  evaluateTurnEngineRootUtility.mockClear();
  return {
    game,
    config,
    evaluateTurnEngineRootUtility,
    candidate,
    selected,
    plan: spiritPlanFor(candidate),
  };
}

function expectSpiritDecisionWithoutMutation(
  fixture: ReturnType<typeof spiritFixture>,
  expected: boolean,
): void {
  const {
    game,
    config,
    evaluateTurnEngineRootUtility,
    candidate,
    selected,
    plan,
  } = fixture;
  const sourceFen = game.fen();
  const candidateFen = candidate.game.fen();
  const selectedFen = selected.game.fen();

  expect(
    acceptTurnEngineHeadAfterSearch(
      game,
      Color.White,
      config,
      [candidate, selected],
      selected.inputs,
      plan,
    ),
  ).toBe(expected);

  expect(evaluateTurnEngineRootUtility).toHaveBeenCalledTimes(2);
  expect(evaluateTurnEngineRootUtility.mock.calls[0]?.[1]).toBe(selected);
  expect(evaluateTurnEngineRootUtility.mock.calls[1]?.[1]).toBe(candidate);
  expect(game.fen()).toBe(sourceFen);
  expect(candidate.game.fen()).toBe(candidateFen);
  expect(selected.game.fen()).toBe(selectedFen);
}

describe("turn-engine head acceptance", () => {
  it("accepts a plan whose head is already the selected root", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const { config } = currentProConfig(game);
    const { selected } = rootPair(game, config);

    expect(
      acceptTurnEngineHeadAfterSearch(
        game,
        Color.White,
        config,
        [selected],
        selected.inputs,
        planFor(selected),
      ),
    ).toBe(true);
  });

  it("does not replace an immediate win with a non-winning head", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const { config } = currentProConfig(game);
    const pair = rootPair(game, config);
    const candidate = { ...pair.candidate, winsImmediately: false };
    const selected = { ...pair.selected, winsImmediately: true };

    expect(
      acceptTurnEngineHeadAfterSearch(
        game,
        Color.White,
        config,
        [candidate, selected],
        selected.inputs,
        planFor(candidate),
      ),
    ).toBe(false);
  });

  it("rejects a macro head that does not dominate the selected root", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const { config } = currentProConfig(game);
    const pair = rootPair(game, config);
    const sourceFen = game.fen();
    const candidateFens = [pair.candidate.game.fen(), pair.selected.game.fen()];
    expect(inputChainsEqual(pair.candidate.inputs, pair.selected.inputs)).toBe(
      false,
    );

    const accepted = acceptTurnEngineHeadAfterSearch(
      game,
      Color.White,
      config,
      [pair.candidate, pair.selected],
      pair.selected.inputs,
      planFor(pair.candidate),
    );

    expect(accepted).toBe(false);
    expect(game.fen()).toBe(sourceFen);
    expect([pair.candidate.game.fen(), pair.selected.game.fen()]).toEqual(
      candidateFens,
    );
  });

  it("rejects a turn-three spirit setup at the ordered safe-mana guard", () => {
    const fixture = spiritFixture(3, { candidateOwnManaSetup: true });

    expect(fixture.config.enableTurnEngineSecondaryAnalysis).toBe(false);
    expect(fixture.config.enableTurnEngineSelectedFollowupProjection).toBe(
      false,
    );
    expect(fixture.game.playerCanUseAction()).toBe(true);
    expect(fixture.game.playerCanMoveMana()).toBe(true);
    expect(rootFamily(fixture.candidate)).toBe(TurnPlanFamily.SpiritImpact);
    expect(rootFamily(fixture.selected)).toBe(TurnPlanFamily.ManaTempo);

    expectSpiritDecisionWithoutMutation(fixture, false);
  });

  it("accepts a turn-four CurrentPro spirit-development head", () => {
    const fixture = spiritFixture(4);

    expect(rootFamily(fixture.candidate)).toBe(TurnPlanFamily.SpiritImpact);
    expect(rootFamily(fixture.selected)).toBe(TurnPlanFamily.ManaTempo);
    expect(fixture.candidate.game.playerCanMoveMon()).toBe(true);

    expectSpiritDecisionWithoutMutation(fixture, true);
  });

  it("rejects a turn-four spirit head that regresses its plain sibling", () => {
    const fixture = spiritFixture(4, {
      selectedSpiritDevelopment: true,
    });

    expect(rootFamily(fixture.candidate)).toBe(TurnPlanFamily.SpiritImpact);
    expect(rootFamily(fixture.selected)).toBe(TurnPlanFamily.SpiritImpact);
    expect(fixture.candidate.game.playerCanMoveMon()).toBe(true);

    expectSpiritDecisionWithoutMutation(fixture, false);
  });
});
