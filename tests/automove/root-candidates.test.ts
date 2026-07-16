import { afterEach, describe, expect, it } from "vitest";

import {
  buildRootCandidateForInputs,
  compareRootCandidates,
  hasProTacticalPotential,
  isOwnDrainerVulnerable,
  isOwnDrainerWalkVulnerable,
  rankRootCandidates,
  searchConfigForPreference,
} from "../../src/automove/root-candidates.js";
import {
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import {
  applyInputsForSearch,
  enumerateLegalTransitions,
} from "../../src/automove/transitions.js";
import {
  BOARD_SIZE,
  GameVariant,
  MONS_MOVES_PER_TURN,
} from "../../src/engine/config.js";
import {
  Color,
  MonKind,
  createMon,
  manaItem,
  monItem,
  regularMana,
} from "../../src/engine/domain.js";
import { inputArrayFen, parseInputArrayFen } from "../../src/engine/fen.js";
import { MonsGame } from "../../src/engine/game.js";
import { location } from "../../src/engine/geometry.js";

const RELEASE_FIXTURE_FEN =
  "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n02E0xn01A0xD0xS0xY0xn03";

const TACTICAL_FIXTURE_FEN =
  "0 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n04y0xn04/n05E0xn05/n06D0xn04/n11/n11/n11/n11";

const TARGETED_PICKUP_FEN =
  "0 0 w 0 0 0 0 0 2 E0xn10/n11/n11/n11/n11/n05D0xxxUn04/n11/n11/n11/n11/n11";

const TARGETED_ATTACK_FEN =
  "0 0 w 0 0 0 0 0 2 A0xn10/n11/n11/n11/n05d0xn05/n05E0xn05/n11/n11/n11/n11/n11";

const GENERIC_FALLBACK_FEN =
  "0 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n11/n05E0xn05/n11/n11/n11/n11/n11";

const FIRST_TURN_WALK_THREAT_WITH_BYSTANDER_FEN =
  "0 0 w 0 0 0 0 0 1 n11/n11/n02y0xn08/n11/n11/n05D0xn05/n11/n11/n11/n11/E0xn10";

function gameFromFen(fen: string): MonsGame {
  const game = MonsGame.fromFen(fen);
  if (game === undefined) throw new Error(`invalid automove fixture: ${fen}`);
  return game;
}

function fixedClock<T>(operation: () => T): T {
  return withAutomoveClock({ now: () => 1_000 }, () =>
    withDeadlineIfAbsent(10_000, operation),
  );
}

afterEach(() => {
  resetDeadlineStateForTesting();
});

describe("root candidate Rust parity", () => {
  it("retains the shipping search budgets", () => {
    const game = new MonsGame(false, GameVariant.Classic);

    expect(
      (["fast", "normal", "pro"] as const).map((preference) => {
        const config = searchConfigForPreference(game, preference);
        return [
          config.depth,
          config.maxVisitedNodes,
          config.rootEnumLimit,
          config.rootBranchLimit,
          config.nodeEnumLimit,
          config.nodeBranchLimit,
          config.quietReductionDepthThreshold,
        ];
      }),
    ).toEqual([
      [2, 480, 168, 28, 40, 10, 3],
      [3, 9_958, 240, 40, 40, 10, 3],
      [4, 15_774, 204, 16, 72, 11, 2],
    ]);
  });

  it("matches the opening Fast root ordering and heuristics", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const before = game.fen();
    const candidates = fixedClock(() =>
      rankRootCandidates(
        game,
        game.activeColor,
        searchConfigForPreference(game, "fast"),
      ),
    );

    expect(
      candidates
        .slice(0, 12)
        .map((candidate) => [
          inputArrayFen(candidate.inputs),
          candidate.heuristic,
          candidate.efficiency,
        ]),
    ).toEqual([
      ["l10,5;l9,4", 1_381, 34],
      ["l10,5;l9,5", 1_298, 34],
      ["l10,6;l9,5", 1_127, 90],
      ["l10,6;l9,6", 1_055, 90],
      ["l10,6;l9,7", 983, 90],
      ["l10,5;l9,6", 824, 34],
      ["l10,3;l9,4", 807, -40],
      ["l10,7;l9,8", 807, -40],
      ["l10,7;l10,8", 803, -40],
      ["l10,3;l9,2", 735, -40],
      ["l10,3;l9,3", 735, -40],
      ["l10,7;l9,6", 735, -40],
    ]);
    expect(game.fen()).toBe(before);
    for (const candidate of candidates) {
      expect(candidate.rootRank).toBe(candidate.rank);
      expect(candidate.interviewSoftPriority).toBe(candidate.softPriority);
      expect(applyInputsForSearch(game, candidate.inputs)?.fen()).toBe(
        candidate.game.fen(),
      );
    }
  });

  it("preserves release ties and tactical class candidates", () => {
    const release = gameFromFen(RELEASE_FIXTURE_FEN);
    const tactical = gameFromFen(TACTICAL_FIXTURE_FEN);

    const releaseCandidates = fixedClock(() =>
      rankRootCandidates(
        release,
        release.activeColor,
        searchConfigForPreference(release, "fast"),
      ),
    );
    const tacticalCandidates = fixedClock(() =>
      rankRootCandidates(
        tactical,
        tactical.activeColor,
        searchConfigForPreference(tactical, "fast"),
      ),
    );

    expect(
      releaseCandidates
        .slice(0, 4)
        .map((candidate) => [
          inputArrayFen(candidate.inputs),
          candidate.heuristic,
          candidate.efficiency,
        ]),
    ).toEqual([
      ["l10,6;l9,5", 1_100, 90],
      ["l10,6;l9,6", 1_100, 90],
      ["l10,5;l9,4", 1_098, 34],
      ["l10,6;l9,7", 1_028, 90],
    ]);
    expect(
      tacticalCandidates
        .slice(0, 9)
        .map((candidate) => [
          inputArrayFen(candidate.inputs),
          candidate.heuristic,
          candidate.ownDrainerVulnerable,
        ]),
    ).toEqual([
      ["l6,6;l7,7", 83, true],
      ["l6,6;l6,7", 67, true],
      ["l6,6;l7,6", 67, true],
      ["l6,6;l5,7", 56, true],
      ["l6,6;l7,5", 56, true],
      ["l6,6;l5,6", 20, true],
      ["l6,6;l6,5", 20, true],
      ["l5,5;l4,5", -589, true],
      ["l5,5;l4,6", -589, true],
    ]);
  });

  it("keeps tactical axes ahead of the Spirit score-path tie-break", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const [base] = fixedClock(() =>
      rankRootCandidates(
        game,
        game.activeColor,
        searchConfigForPreference(game, "fast"),
      ),
    );
    if (base === undefined) throw new Error("opening has no root candidate");

    const shorterPath = {
      ...base,
      spiritOwnManaSetupNow: true,
      scorePathBestSteps: 2,
      attacksOpponentDrainer: false,
    };
    const longerPath = {
      ...base,
      spiritOwnManaSetupNow: true,
      scorePathBestSteps: 3,
      attacksOpponentDrainer: false,
    };
    expect(compareRootCandidates(shorterPath, longerPath)).toBeLessThan(0);

    const tacticalLongerPath = {
      ...longerPath,
      attacksOpponentDrainer: true,
    };
    expect(
      compareRootCandidates(shorterPath, tacticalLongerPath),
    ).toBeGreaterThan(0);
  });

  it("mirrors Drainer vulnerability and Pro tactical-potential gates", () => {
    const tactical = gameFromFen(TACTICAL_FIXTURE_FEN);
    const tacticalPotential = gameFromFen(
      TACTICAL_FIXTURE_FEN.replace("n04y0xn04", "n04y0xd0xn05"),
    );
    const firstTurn = gameFromFen(
      TACTICAL_FIXTURE_FEN.replace("0 0 w 0 0 0 0 0 2 ", "0 0 w 0 0 0 0 0 1 "),
    );
    const exhausted = gameFromFen(
      TACTICAL_FIXTURE_FEN.replace("0 0 w 0 0 0 0 0 2 ", "0 0 w 0 0 5 0 0 2 "),
    );

    expect(isOwnDrainerVulnerable(tactical, tactical.activeColor)).toBe(true);
    expect(isOwnDrainerVulnerable(firstTurn, firstTurn.activeColor)).toBe(
      false,
    );
    expect(hasProTacticalPotential(tacticalPotential)).toBe(true);
    expect(hasProTacticalPotential(exhausted)).toBe(false);
  });

  it("retains first-turn walk-only Drainer threats while actions are disabled", () => {
    const firstTurnWalkThreat = gameFromFen(
      "0 0 w 0 0 0 0 0 1 n11/n11/n02y0xn08/n11/n11/n05D0xn05/n11/n11/n11/n11/n11",
    );

    expect(
      isOwnDrainerVulnerable(
        firstTurnWalkThreat,
        firstTurnWalkThreat.activeColor,
      ),
    ).toBe(false);
    expect(
      isOwnDrainerWalkVulnerable(
        firstTurnWalkThreat,
        firstTurnWalkThreat.activeColor,
      ),
    ).toBe(true);
  });

  it("keeps root candidate walk snapshots disabled while the exact helper remains live", () => {
    const game = gameFromFen(FIRST_TURN_WALK_THREAT_WITH_BYSTANDER_FEN);
    const candidate = fixedClock(() =>
      buildRootCandidateForInputs(
        game,
        game.activeColor,
        searchConfigForPreference(game, "fast"),
        parseInputArrayFen("l10,0;l9,0"),
      ),
    );

    expect(candidate).toBeDefined();
    if (candidate === undefined) return;
    expect(isOwnDrainerWalkVulnerable(candidate.game, game.activeColor)).toBe(
      true,
    );
    expect(candidate.ownDrainerWalkVulnerable).toBe(false);
  });

  it("uses the Rust default turn summary after a move ends the turn", () => {
    const pickup = gameFromFen(TARGETED_PICKUP_FEN);
    pickup.turnNumber = 2;
    pickup.monsMovesCount = MONS_MOVES_PER_TURN - 1;
    pickup.actionsUsedCount = 1;
    pickup.manaMovesCount = 1;
    pickup.whitePotionsCount = 0;
    const pickupCandidate = fixedClock(() =>
      buildRootCandidateForInputs(
        pickup,
        pickup.activeColor,
        searchConfigForPreference(pickup, "fast"),
        parseInputArrayFen("l5,5;l5,6"),
      ),
    );
    expect(pickupCandidate).toBeDefined();
    if (pickupCandidate === undefined) return;
    expect(pickupCandidate.game.activeColor).not.toBe(pickup.activeColor);
    expect(pickupCandidate.safeSupermanaPickupNow).toBe(true);
    expect(pickupCandidate.safeSupermanaProgressSteps).toBe(BOARD_SIZE + 4);
    expect(pickupCandidate.sameTurnScoreWindowValue).toBe(0);

    const spirit = new MonsGame(false, GameVariant.Classic);
    spirit.turnNumber = 3;
    spirit.monsMovesCount = MONS_MOVES_PER_TURN - 1;
    spirit.actionsUsedCount = 1;
    spirit.manaMovesCount = 1;
    const spiritCandidate = fixedClock(() =>
      buildRootCandidateForInputs(
        spirit,
        spirit.activeColor,
        searchConfigForPreference(spirit, "fast"),
        parseInputArrayFen("l10,6;l9,6"),
      ),
    );
    expect(spiritCandidate?.game.activeColor).not.toBe(spirit.activeColor);
    expect(spiritCandidate?.spiritDevelopment).toBe(true);
    expect(spiritCandidate?.spiritSetupGain).toBe(24);
  });

  it("clamps negative soft and potion policy values instead of inverting them", () => {
    const pickup = gameFromFen(TARGETED_PICKUP_FEN);
    const base = searchConfigForPreference(pickup, "fast");
    const inputs = parseInputArrayFen("l5,5;l5,6");
    const zeroPolicy = {
      ...base,
      softSupermanaProgressBonus: 0,
      softSupermanaScoreBonus: 0,
      softOpponentManaProgressBonus: 0,
      softOpponentManaScoreBonus: 0,
      softManaHandoffPenalty: 0,
      softRoundtripPenalty: 0,
      rootManaHandoffPenalty: 0,
      potionSpendPenalty: 0,
    };
    const negativePolicy = {
      ...zeroPolicy,
      softSupermanaProgressBonus: -500,
      softSupermanaScoreBonus: -500,
      softOpponentManaProgressBonus: -500,
      softOpponentManaScoreBonus: -500,
      softManaHandoffPenalty: -500,
      softRoundtripPenalty: -500,
      rootManaHandoffPenalty: -500,
      potionSpendPenalty: -500,
    };
    const zero = fixedClock(() =>
      buildRootCandidateForInputs(
        pickup,
        pickup.activeColor,
        zeroPolicy,
        inputs,
      ),
    );
    const negative = fixedClock(() =>
      buildRootCandidateForInputs(
        pickup,
        pickup.activeColor,
        negativePolicy,
        inputs,
      ),
    );
    expect(negative?.softPriority).toBe(zero?.softPriority);
    expect(negative?.heuristic).toBe(zero?.heuristic);

    const potion = new MonsGame(false, GameVariant.Classic);
    potion.replaceBoardItems([
      [location(9, 6), monItem(createMon(MonKind.Spirit, Color.White, 0))],
      [location(7, 6), manaItem(regularMana(Color.Black))],
      [location(6, 5), manaItem(regularMana(Color.Black))],
      [location(0, 5), monItem(createMon(MonKind.Drainer, Color.Black, 0))],
    ]);
    potion.turnNumber = 2;
    potion.monsMovesCount = MONS_MOVES_PER_TURN;
    potion.actionsUsedCount = 1;
    potion.whitePotionsCount = 1;
    const potionTransitions = fixedClock(() =>
      enumerateLegalTransitions(potion, 512).filter((transition) =>
        transition.events.some((event) => event.kind === "use-potion"),
      ),
    );
    const potionTransition = potionTransitions[0];
    expect(potionTransition).toBeDefined();
    if (potionTransition === undefined) return;
    const zeroPotion = fixedClock(() =>
      buildRootCandidateForInputs(
        potion,
        potion.activeColor,
        zeroPolicy,
        potionTransition.inputs,
      ),
    );
    const negativePotion = fixedClock(() =>
      buildRootCandidateForInputs(
        potion,
        potion.activeColor,
        negativePolicy,
        potionTransition.inputs,
      ),
    );
    const positivePotion = fixedClock(() =>
      buildRootCandidateForInputs(
        potion,
        potion.activeColor,
        { ...zeroPolicy, potionSpendPenalty: 777 },
        potionTransition.inputs,
      ),
    );
    expect(negativePotion?.heuristic).toBe(zeroPotion?.heuristic);
    expect(positivePotion?.heuristic).toBe((zeroPotion?.heuristic ?? 0) - 777);

    const compensatedTransition = potionTransitions.find(
      (transition) => inputArrayFen(transition.inputs) === "l9,6;l7,6;l7,7",
    );
    expect(compensatedTransition).toBeDefined();
    if (compensatedTransition === undefined) return;
    const zeroCompensated = fixedClock(() =>
      buildRootCandidateForInputs(
        potion,
        potion.activeColor,
        zeroPolicy,
        compensatedTransition.inputs,
      ),
    );
    const positiveCompensated = fixedClock(() =>
      buildRootCandidateForInputs(
        potion,
        potion.activeColor,
        { ...zeroPolicy, potionSpendPenalty: 777 },
        compensatedTransition.inputs,
      ),
    );
    expect(zeroCompensated?.opponentManaProgress).toBe(true);
    expect(positiveCompensated?.heuristic).toBe(zeroCompensated?.heuristic);
  });

  it("admits a targeted safe pickup beyond the base enum cutoff", () => {
    const game = gameFromFen(TARGETED_PICKUP_FEN);
    const config = {
      ...searchConfigForPreference(game, "fast"),
      rootEnumLimit: 1,
    };
    const targetInputs = "l5,5;l5,6";
    const baseTransitions = fixedClock(() =>
      enumerateLegalTransitions(game, config.rootEnumLimit),
    );
    expect(
      baseTransitions.map((entry) => inputArrayFen(entry.inputs)),
    ).not.toContain(targetInputs);

    const candidates = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, config),
    );
    const targeted = candidates.find(
      (candidate) => inputArrayFen(candidate.inputs) === targetInputs,
    );
    expect(targeted?.safeSupermanaPickupNow).toBe(true);
    expect(targeted?.supermanaProgress).toBe(true);
    expect(game.fen()).toBe(TARGETED_PICKUP_FEN);
  });

  it("retains a targeted opponent-Drainer attack beyond the cutoff", () => {
    const game = gameFromFen(TARGETED_ATTACK_FEN);
    const config = {
      ...searchConfigForPreference(game, "fast"),
      rootEnumLimit: 1,
      enableTargetedDrainerAttackFallback: true,
    };
    const baseTransitions = fixedClock(() =>
      enumerateLegalTransitions(game, config.rootEnumLimit),
    );
    expect(
      baseTransitions.some((transition) =>
        transition.events.some(
          (event) =>
            event.kind === "mon-fainted" && event.mon.kind === MonKind.Drainer,
        ),
      ),
    ).toBe(false);

    const candidates = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, config),
    );
    expect(candidates.length).toBeGreaterThan(0);
    const baseKeys = new Set(
      baseTransitions.map((transition) => inputArrayFen(transition.inputs)),
    );
    expect(
      candidates.some(
        (candidate) =>
          inputArrayFen(candidate.inputs).startsWith("l5,5;") &&
          !baseKeys.has(inputArrayFen(candidate.inputs)),
      ),
    ).toBe(true);
    expect(
      candidates.every((candidate) =>
        inputArrayFen(candidate.inputs).startsWith("l5,5;"),
      ),
    ).toBe(true);
  });

  it("uses the generic fallback while keeping a true no-move state empty", () => {
    const game = gameFromFen(GENERIC_FALLBACK_FEN);
    const config = {
      ...searchConfigForPreference(game, "fast"),
      rootEnumLimit: 0,
    };
    expect(enumerateLegalTransitions(game, 0)).toEqual([]);
    const fallback = fixedClock(() =>
      rankRootCandidates(game, game.activeColor, config),
    );
    expect(fallback.length).toBeGreaterThan(0);
    expect(fallback.length).toBeLessThanOrEqual(config.rootBranchLimit);

    const terminal = gameFromFen(
      GENERIC_FALLBACK_FEN.replace("0 0 w", "5 0 w"),
    );
    const terminalBefore = terminal.fen();
    expect(
      fixedClock(() =>
        rankRootCandidates(terminal, terminal.activeColor, config),
      ),
    ).toEqual([]);
    expect(terminal.fen()).toBe(terminalBefore);
  });
});
