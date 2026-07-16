import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MonsGameModel } from "../../src/api/mons-game-model.js";
import { ALL_GAME_VARIANTS, GameVariant } from "../../src/engine/config.js";
import { Color, type Input } from "../../src/engine/domain.js";
import { inputArrayFen } from "../../src/engine/fen.js";
import { MonsGame } from "../../src/engine/game.js";
import {
  createMonsGameAutomoveDelegate,
  installAutomoveRuntime,
  randomAutomove,
  smartAutomove,
  type AutomoveRuntimeOptions,
  type AutomoveRuntimeRoute,
} from "../../src/automove/runtime.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import { type ExactOpportunityContext } from "../../src/automove/exact.js";
import {
  rankRootCandidates,
  type RootCandidate,
} from "../../src/automove/root-candidates.js";
import { searchExecutionConfigForGame } from "../../src/automove/selector-config.js";
import { TurnEngineUtility } from "../../src/automove/turn-engine.js";
import { enumerateLegalTransitions } from "../../src/automove/transitions.js";
import { type RandomSource } from "../../src/automove/types.js";
import type { RootEvaluation } from "../../src/automove/selector-types.js";

const RELEASE_FIXTURE_FEN =
  "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n02E0xn01A0xD0xS0xY0xn03";

const SYNTHETIC_TACTICAL_FIXTURE_FEN =
  "0 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n04y0xn04/n05E0xn05/n06D0xn04/n11/n11/n11/n11";

beforeEach(() => {
  resetDeadlineStateForTesting();
  installAutomoveRuntime();
});

afterEach(() => {
  resetDeadlineStateForTesting();
  installAutomoveRuntime();
});

function opportunityContext(
  overrides: Partial<ExactOpportunityContext["delta"]> = {},
): ExactOpportunityContext {
  return {
    budget: {
      remainingMonMoves: 3,
      canUseAction: true,
      canMoveMana: true,
    },
    turn: {} as ExactOpportunityContext["turn"],
    delta: {
      sameTurnScoreWindowValue: 0,
      spiritGain: 0,
      opponentWindowDenyGain: 0,
      drainerAttackAvailable: false,
      drainerSafety: 0,
      safeSupermanaProgressSteps: undefined,
      safeOpponentManaProgressSteps: undefined,
      ...overrides,
    },
    opponentCanWinImmediately: false,
  };
}

function routesFor(game: MonsGame, count = 2): Input[][] {
  const routes = enumerateLegalTransitions(game, 32).map((entry) => [
    ...entry.inputs,
  ]);
  if (routes.length < count) throw new Error("not enough legal test routes");
  return routes.slice(0, count);
}

function rootFor(
  game: MonsGame,
  inputs: readonly Input[],
  overrides: Partial<RootCandidate> = {},
): RootCandidate {
  const config = searchExecutionConfigForGame(game, "pro");
  const seed = rankRootCandidates(game, game.activeColor, config)[0];
  if (seed === undefined) throw new Error("missing root seed");
  return { ...seed, inputs: [...inputs], ...overrides };
}

function evaluationFor(
  game: MonsGame,
  inputs: readonly Input[],
  score: number,
  overrides: Partial<RootEvaluation> = {},
): RootEvaluation {
  return {
    ...rootFor(game, inputs),
    score,
    ...overrides,
  };
}

function selectorOptions(
  select: (route: AutomoveRuntimeRoute, game: MonsGame) => readonly Input[],
  overrides: AutomoveRuntimeOptions = {},
): AutomoveRuntimeOptions {
  return {
    ...overrides,
    selector: (game, _config, route) => select(route, game),
  };
}

function fixedClockSmartInputFen(
  game: MonsGameModel,
  preference: "fast" | "normal" | "pro",
): string {
  return withAutomoveClock({ now: () => 0 }, () =>
    game.smartAutomove(preference).input_fen(),
  );
}

describe("automove runtime", () => {
  it("routes the pre-search Pro fallbacks in baseline order", () => {
    const cases: readonly {
      readonly label: string;
      readonly game: MonsGame;
      readonly expected: AutomoveRuntimeRoute;
      readonly options?: AutomoveRuntimeOptions;
    }[] = [
      {
        label: "early-white-pro",
        game: new MonsGame(),
        expected: "early-white-pro",
      },
      {
        label: "early-white-fast",
        game: Object.assign(new MonsGame(), {
          turnNumber: 3,
          monsMovesCount: 2,
          actionsUsedCount: 1,
          manaMovesCount: 0,
        }),
        expected: "early-white-fast",
        options: { ownDrainerUnsafe: () => true },
      },
      {
        label: "score-window",
        game: Object.assign(new MonsGame(), {
          turnNumber: 3,
          monsMovesCount: 1,
          actionsUsedCount: 0,
          manaMovesCount: 0,
        }),
        expected: "score-window",
        options: {
          opportunityContext: () =>
            opportunityContext({ sameTurnScoreWindowValue: 1 }),
        },
      },
      {
        label: "black-unconditional",
        game: Object.assign(new MonsGame(), {
          activeColor: Color.Black,
          turnNumber: 2,
          monsMovesCount: 0,
          actionsUsedCount: 0,
          manaMovesCount: 0,
        }),
        expected: "black-unconditional",
      },
      {
        label: "pro-current",
        game: Object.assign(new MonsGame(), {
          turnNumber: 5,
          monsMovesCount: 1,
        }),
        expected: "pro-current",
      },
    ];

    for (const entry of cases) {
      const [route] = routesFor(entry.game, 1);
      if (route === undefined) throw new Error("missing route");
      const seen: AutomoveRuntimeRoute[] = [];
      const result = smartAutomove(
        entry.game,
        "pro",
        selectorOptions((kind) => {
          seen.push(kind);
          return route;
        }, entry.options),
      );
      expect(seen, entry.label).toContain(entry.expected);
      expect(result.inputFen, entry.label).toBe(inputArrayFen(route));
    }
  });

  it("routes the white engine-disabled and deny search-only fallbacks", () => {
    const engineDisabled = Object.assign(new MonsGame(), {
      turnNumber: 5,
      monsMovesCount: 0,
      actionsUsedCount: 0,
      manaMovesCount: 0,
    });
    const [pro, fallback] = routesFor(engineDisabled);
    if (pro === undefined || fallback === undefined)
      throw new Error("missing routes");
    const proRoot = rootFor(engineDisabled, pro, {
      ownDrainerVulnerable: true,
      ownDrainerWalkVulnerable: false,
      sameTurnScoreWindowValue: 1,
      spiritDevelopment: false,
      spiritSameTurnScoreSetupNow: false,
      spiritOwnManaSetupNow: false,
      supermanaProgress: false,
      opponentManaProgress: false,
      scoresSupermanaThisTurn: false,
      scoresOpponentManaThisTurn: false,
      safeSupermanaPickupNow: false,
      safeOpponentManaPickupNow: false,
      winsImmediately: false,
      attacksOpponentDrainer: false,
      manaHandoffToOpponent: false,
      hasRoundtrip: false,
    });
    const fallbackRoot = rootFor(engineDisabled, fallback, {
      ownDrainerVulnerable: true,
      ownDrainerWalkVulnerable: false,
      sameTurnScoreWindowValue: 0,
      spiritDevelopment: true,
      spiritSameTurnScoreSetupNow: false,
      supermanaProgress: true,
      scoresSupermanaThisTurn: false,
      scoresOpponentManaThisTurn: false,
      safeSupermanaPickupNow: false,
      safeOpponentManaPickupNow: false,
      winsImmediately: false,
      attacksOpponentDrainer: false,
      manaHandoffToOpponent: false,
      hasRoundtrip: false,
    });
    const seen: AutomoveRuntimeRoute[] = [];
    const engineResult = smartAutomove(
      engineDisabled,
      "pro",
      selectorOptions(
        (route) => {
          seen.push(route);
          return route === "white-engine-disabled" ? fallback : pro;
        },
        {
          opportunityContext: () =>
            opportunityContext({
              sameTurnScoreWindowValue: 1,
              opponentWindowDenyGain: 1,
              drainerSafety: -1,
            }),
          rankedRoots: () => [proRoot, fallbackRoot],
        },
      ),
    );
    expect(seen).toContain("white-engine-disabled");
    expect(engineResult.inputFen).toBe(inputArrayFen(fallback));

    for (const denyGain of [0, -1]) {
      const game = Object.assign(new MonsGame(), {
        turnNumber: 3,
        monsMovesCount: 1,
        actionsUsedCount: 1,
        manaMovesCount: 0,
      });
      const [selected, searchOnly] = routesFor(game);
      if (selected === undefined || searchOnly === undefined)
        throw new Error("missing deny routes");
      const selectedRoot = rootFor(game, selected);
      const expectedRoute =
        denyGain >= 0 ? "white-nonnegative-deny" : "white-negative-deny";
      const denySeen: AutomoveRuntimeRoute[] = [];
      const result = smartAutomove(
        game,
        "pro",
        selectorOptions(
          (route) => {
            denySeen.push(route);
            return route === expectedRoute ? searchOnly : selected;
          },
          {
            ownDrainerUnsafe: () => false,
            opportunityContext: () =>
              opportunityContext({
                sameTurnScoreWindowValue: 1,
                opponentWindowDenyGain: 1,
                drainerSafety: -1,
              }),
            rankedRoots: () => [selectedRoot],
            focusedRoots: () => {
              throw new Error(
                "negative-deny rank must not score focused roots",
              );
            },
            focusedCandidateRank: () => 0,
            selectedUtility: () => new TurnEngineUtility({ denyGain }),
          },
        ),
      );
      expect(denySeen, String(denyGain)).toContain(expectedRoute);
      expect(result.inputFen, String(denyGain)).toBe(inputArrayFen(searchOnly));
    }
  });

  it("routes both ProV1 confirmations and the late-black fallback", () => {
    for (const better of [false, true]) {
      const game = Object.assign(new MonsGame(), {
        turnNumber: 3,
        monsMovesCount: better ? 3 : 2,
        actionsUsedCount: 1,
        manaMovesCount: 0,
      });
      const [pro, searchOnly] = routesFor(game);
      if (pro === undefined || searchOnly === undefined)
        throw new Error("missing confirmation routes");
      const quietClasses = {
        immediateScore: false,
        drainerAttack: false,
        drainerSafetyRecover: false,
        carrierProgress: false,
        material: false,
        quiet: true,
      } as const;
      const proRoot = evaluationFor(game, pro, 1_000, {
        rootRank: 1,
        classes: quietClasses,
        ownDrainerVulnerable: false,
        ownDrainerWalkVulnerable: false,
        spiritDevelopment: false,
        spiritSameTurnScoreSetupNow: false,
        spiritOwnManaSetupNow: false,
        supermanaProgress: false,
        opponentManaProgress: false,
        scoresSupermanaThisTurn: false,
        scoresOpponentManaThisTurn: false,
        safeSupermanaPickupNow: false,
        safeOpponentManaPickupNow: false,
        winsImmediately: false,
        attacksOpponentDrainer: false,
        manaHandoffToOpponent: false,
        hasRoundtrip: false,
        sameTurnScoreWindowValue: 0,
      });
      const searchRoot = {
        ...proRoot,
        inputs: searchOnly,
        rootRank: 0,
        score: better ? 1_001 : 1_000,
      };
      const expected = better
        ? "white-confirm-better"
        : "white-confirm-tiebreak";
      const seen: AutomoveRuntimeRoute[] = [];
      const result = smartAutomove(
        game,
        "pro",
        selectorOptions(
          (route) => {
            seen.push(route);
            return route === expected ? searchOnly : pro;
          },
          {
            ownDrainerUnsafe: () => false,
            opportunityContext: () => opportunityContext(),
            focusedRoots: () => [proRoot, searchRoot],
          },
        ),
      );
      expect(seen, expected).toContain(expected);
      expect(result.inputFen, expected).toBe(inputArrayFen(searchOnly));
    }

    const black = Object.assign(new MonsGame(), {
      activeColor: Color.Black,
      turnNumber: 4,
      monsMovesCount: 3,
      actionsUsedCount: 0,
      manaMovesCount: 0,
    });
    const [pro, fallback] = routesFor(black);
    if (pro === undefined || fallback === undefined)
      throw new Error("missing black routes");
    const seen: AutomoveRuntimeRoute[] = [];
    const result = smartAutomove(
      black,
      "pro",
      selectorOptions((route) => {
        seen.push(route);
        return route === "black-late" ? fallback : pro;
      }),
    );
    expect(seen).toContain("black-late");
    expect(result.inputFen).toBe(inputArrayFen(fallback));
  });

  it("keeps safe progress in both confirmation competitions against a Spirit setup", () => {
    for (const better of [false, true]) {
      const game = Object.assign(new MonsGame(), {
        turnNumber: 3,
        monsMovesCount: better ? 3 : 2,
        actionsUsedCount: 1,
        manaMovesCount: 0,
      });
      const [pro, searchOnly] = routesFor(game);
      if (pro === undefined || searchOnly === undefined) {
        throw new Error("missing confirmation routes");
      }
      const progress = evaluationFor(game, pro, 1_000, {
        rootRank: 1,
        efficiency: 100,
        interviewSoftPriority: 1,
        ownDrainerVulnerable: false,
        ownDrainerWalkVulnerable: false,
        manaHandoffToOpponent: false,
        hasRoundtrip: false,
        spiritDevelopment: false,
        spiritSameTurnScoreSetupNow: false,
        spiritOwnManaSetupNow: false,
        supermanaProgress: true,
        opponentManaProgress: false,
        safeSupermanaProgressSteps: 2,
        sameTurnScoreWindowValue: 0,
      });
      const spirit = {
        ...progress,
        inputs: searchOnly,
        rootRank: 0,
        score: better ? 1_001 : 1_000,
        efficiency: 90,
        interviewSoftPriority: 0,
        spiritDevelopment: true,
        spiritOwnManaSetupNow: true,
        supermanaProgress: false,
        safeSupermanaProgressSteps: 15,
      };
      const expected = better
        ? "white-confirm-better"
        : "white-confirm-tiebreak";
      const seen: AutomoveRuntimeRoute[] = [];
      const sourceFen = game.fen();

      smartAutomove(
        game,
        "pro",
        selectorOptions(
          (route) => {
            seen.push(route);
            return route === expected ? searchOnly : pro;
          },
          {
            ownDrainerUnsafe: () => false,
            opportunityContext: () => opportunityContext(),
            focusedRoots: () => [progress, spirit],
          },
        ),
      );

      expect(seen, expected).toContain(expected);
      expect(game.fen(), expected).toBe(sourceFen);
    }
  });

  it("honors shared, bank, reserve, and previous-timeout boundaries", () => {
    const game = Object.assign(new MonsGame(), {
      turnNumber: 5,
      monsMovesCount: 1,
    });
    const [fast, pro] = routesFor(game);
    if (fast === undefined || pro === undefined)
      throw new Error("missing deadline routes");
    let now = 0;
    let timeoutClears = 0;
    let freshClears = 0;
    let first = true;
    const options = selectorOptions(
      () => {
        if (first) {
          now += 900;
          first = false;
        }
        return pro;
      },
      {
        clearTimeoutCaches: () => {
          timeoutClears += 1;
        },
      },
    );
    withAutomoveClock({ now: () => now }, () => {
      withDeadlineIfAbsent(800, () => smartAutomove(game, "fast", options));
      expect(timeoutClears).toBe(0);
      smartAutomove(game, "fast", options);
      smartAutomove(game, "fast", options);
    });
    expect(timeoutClears).toBe(1);

    now = 0;
    timeoutClears = 0;
    let exhaustFastBank = true;
    const seen: AutomoveRuntimeRoute[] = [];
    const proOptions = selectorOptions(
      (route) => {
        seen.push(route);
        if (route === "pro-fast-bank" && exhaustFastBank) {
          now += 201;
          return fast;
        }
        return pro;
      },
      {
        clearTimeoutCaches: () => {
          timeoutClears += 1;
        },
        clearFreshProCache: () => {
          freshClears += 1;
        },
      },
    );
    withAutomoveClock({ now: () => now }, () => {
      smartAutomove(game, "pro", proOptions);
    });
    expect(seen).toContain("pro-current");
    expect(timeoutClears).toBe(1);
    expect(freshClears).toBe(1);
    exhaustFastBank = false;
    withAutomoveClock({ now: () => now }, () => {
      smartAutomove(game, "pro", proOptions);
    });
    expect(timeoutClears).toBe(1);
    expect(freshClears).toBe(2);

    now = 0;
    const reserveSeen: AutomoveRuntimeRoute[] = [];
    const reserveResult = withAutomoveClock({ now: () => now }, () =>
      withDeadlineIfAbsent(250, () =>
        smartAutomove(
          game,
          "pro",
          selectorOptions((route) => {
            reserveSeen.push(route);
            if (route === "pro-fast-bank") now += 160;
            return route === "pro-fast-bank" ? fast : pro;
          }),
        ),
      ),
    );
    expect(reserveSeen).toEqual(["pro-fast-bank"]);
    expect(reserveResult.inputFen).toBe(inputArrayFen(fast));

    let reserveClears = 0;
    const afterReserve = selectorOptions(() => pro, {
      clearTimeoutCaches: () => {
        reserveClears += 1;
      },
    });
    withAutomoveClock({ now: () => now }, () => {
      smartAutomove(game, "fast", afterReserve);
      smartAutomove(game, "fast", afterReserve);
    });
    expect(reserveClears).toBe(1);
  });

  it("preserves the retained deterministic smart routes without source mutation", () => {
    installAutomoveRuntime();
    const opening = MonsGameModel.new(GameVariant.Classic);
    const before = opening.fen();
    expect.soft(fixedClockSmartInputFen(opening, "fast")).toBe("l10,5;l9,4");
    expect.soft(fixedClockSmartInputFen(opening, "normal")).toBe("l10,5;l9,4");
    expect.soft(fixedClockSmartInputFen(opening, "pro")).toBe("l10,7;l9,8");
    expect(opening.fen()).toBe(before);

    const fixture = MonsGameModel.from_fen(RELEASE_FIXTURE_FEN);
    if (fixture === undefined) throw new Error("invalid fixture");
    expect.soft(fixedClockSmartInputFen(fixture, "fast")).toBe("l10,6;l9,6");
    expect.soft(fixedClockSmartInputFen(fixture, "normal")).toBe("l10,6;l9,6");
    expect.soft(fixedClockSmartInputFen(fixture, "pro")).toBe("l10,5;l9,4");
    expect(fixture.fen()).toBe(RELEASE_FIXTURE_FEN);

    const tactical = MonsGameModel.from_fen(SYNTHETIC_TACTICAL_FIXTURE_FEN);
    if (tactical === undefined) throw new Error("invalid synthetic fixture");
    const tacticalBefore = tactical.fen();
    expect.soft(fixedClockSmartInputFen(tactical, "fast")).toBe("l5,5;l4,6");
    expect(tactical.fen()).toBe(tacticalBefore);
  }, 120_000);

  it("uses injected random automove when a non-timeout smart search is empty", () => {
    const zeros: RandomSource = { nextU32: () => 0 };
    const game = new MonsGame();
    const before = game.fen();
    const expected = randomAutomove(game.cloneForSimulation(), zeros).inputFen;

    const result = smartAutomove(
      game,
      "fast",
      selectorOptions(() => [], { randomSource: zeros }),
    );

    expect(result.inputFen).toBe(expected);
    expect(result.inputFen).toBe("l10,3;l9,2");
    expect(game.fen()).toBe(before);
  });

  it("uses injected unbiased randomness and mutates random automove games", () => {
    const zeros: RandomSource = { nextU32: () => 0 };
    installAutomoveRuntime({ randomSource: zeros });
    const game = MonsGameModel.new(GameVariant.Classic);
    const before = game.fen();
    expect(game.automove().input_fen()).toBe("l10,3;l9,2");
    expect(game.fen()).not.toBe(before);
  });

  it("exposes a delegate whose general smart result replays legally", () => {
    const delegate = createMonsGameAutomoveDelegate();
    const game = MonsGameModel.new(GameVariant.OffsetArcManaRows);
    const state = game.fen();
    const internal = MonsGameModel.fromFenForSimulation(state);
    if (internal === undefined) throw new Error("invalid state");
    installAutomoveRuntime();
    const result = internal.smartAutomove("normal");
    expect(result.input_fen()).not.toBe("");
    expect(internal.process_input_fen(result.input_fen()).kind).toBe(3);
    expect(delegate).toBeDefined();
  });

  it("keeps every variant and selector legal without source mutation", () => {
    installAutomoveRuntime();
    let checkedRoutes = 0;
    for (const variant of ALL_GAME_VARIANTS) {
      for (const preference of ["fast", "normal", "pro"] as const) {
        const label = `${GameVariant[variant]}/${preference}`;
        const game = MonsGameModel.new(variant);
        const before = game.fen();
        const output = game.smartAutomove(preference);
        checkedRoutes += 1;
        expect.soft(game.fen(), `${label}: source mutation`).toBe(before);
        expect.soft(output.input_fen(), `${label}: empty input`).not.toBe("");

        const replay = MonsGameModel.from_fen(before);
        expect.soft(replay, `${label}: replay parse`).toBeDefined();
        expect
          .soft(
            replay?.process_input_fen(output.input_fen()).kind,
            `${label}: legal replay`,
          )
          .toBe(3);
      }
    }
    expect(checkedRoutes).toBe(ALL_GAME_VARIANTS.length * 3);
  }, 40_000);
});
