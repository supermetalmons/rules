import { describe, expect, it } from "vitest";

import { moveToInputs, tryLoadPosition } from "../../src/automove/bridge.js";
import { WIN_VALUE } from "../../src/automove/evaluation.js";
import { FastSearcher } from "../../src/automove/search.js";
import { MAX_PLY } from "../../src/automove/search-tuning.js";
import {
  PACKED_SELECTION_PROFILES,
  type AutomovePreference,
} from "../../src/automove/selector.js";
import { inputArrayFen, parseInputArrayFen } from "../../src/engine/codec/input.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";

const TERMINAL_SCOUT_FEN =
  "4 4 b 0 0 0 0 0 10 n03y1xn07/n07e0xn03/n07xxmn01xxmn01/n03xxmxxmn02a0xn03/n05xxmd0xn01s0xn02/n06xxUn04/n03xxMn02D0xn04/n04xxMxxMn01xxMn01xxMn01/n07Y0xn01S0xn01/n11/n03E0xA0xn06";
const SELECTIVE_SCOUT_FEN =
  "4 4 w 0 0 0 1 1 11 n11/n03xxmn07/n05a0xn01xxmn03/n02xxmn01d0Mn03xxmn02/n01E0xn02s0xxxmn05/n10e0x/n02y0xn08/n04xxMn01S0xn01xxMn02/n03xxMxxUA0xY0xxxMn03/n11/n05D0xn05";
const HALF_POINT_SCOUT_FEN =
  "0 3 w 0 0 0 0 0 7 n07e0xn02d0x/n04s0xn06/n11/n01y0xn02xxmn01xxma0xn03/n05xxmn05/xxQn03E0xn01Y0xn01xxmn01xxQ/n05xxMn01xxMS0xn02/n04xxMn01xxMn04/n01xxMn03D0xn05/n11/n04A0xn06";
const WIDENING_FEN =
  "2 0 b 0 0 0 0 0 6 n03y0xn01d1xn01e0xn03/n04s0xn06/n01xxmn04a0xn04/n04xxmn01xxmxxMn03/n05xxmn01xxmn03/xxQn09Y0x/n03xxMn03xxMn03/n04xxMn06/n11/n05S0xn05/D0xn02E0xA0xn04xxMn01";
const CHALLENGER_FEN =
  "0 0 w 0 0 0 1 0 7 n01xxmn01y0xn01d1xn01e0xn03/n11/n07Y0xn03/n03xxUn02xxmn04/n03xxma0xxxmn01xxmn03/n11/n03xxMs0xxxMn05/n06xxMn01xxMn02/n03xxMD0xA0xn05/n06S0xn04/n03E0xn07";
const TIMED_CERTIFICATE_FEN =
  "4 4 w 0 0 0 1 0 7 n07e0xn03/n11/n03d0mn01a0xn01xxmn03/n02xxmxxUn01s0xn05/n05xxmn01xxmn03/y0xn09Y0x/n03xxMn01xxMn05/n04xxMn01D0MA0xn03/n07S0xn03/n11/n03E0xn07";
const OMITTED_MANA_DEFENSE_FEN =
  "4 0 w 1 0 5 0 0 3 y0xn01xxMn08/D0MxxmxxMn08/n11/n11/n11/n05xxMn05/n11/n11/n11/n11/n11";

function loaded(fen: string) {
  const game = MonsGame.fromFen(fen, false);
  if (game === undefined) throw new Error("certificate fixture must parse");
  const searcher = new FastSearcher();
  if (!tryLoadPosition(searcher.root, game, 40)) {
    throw new Error("certificate fixture must load");
  }
  return { game, searcher };
}

function search(fen: string, mode: AutomovePreference, maxNodes: number) {
  const { game, searcher } = loaded(fen);
  const profile = PACKED_SELECTION_PROFILES[mode];
  const outcome = searcher.search(
    { ...profile.limits, maxNodes },
    () => false,
    profile.weights,
  );
  expect(outcome.supported).toBe(true);
  expect(game.fork().processInput(moveToInputs(outcome.move), false, false).kind).toBe(
    "events",
  );
  expect(game.fen()).toBe(fen);
  return outcome;
}

describe("packed search result certificates", () => {
  it("does not certify a cross-turn scout that omits a legal early mana defense", () => {
    const outcome = search(OMITTED_MANA_DEFENSE_FEN, "fast", 12_123);
    expect(outcome.score).toBeLessThan(WIN_VALUE - MAX_PLY);
    expect(outcome.depth).toBe(7);

    const { game } = loaded(OMITTED_MANA_DEFENSE_FEN);
    for (const inputFen of ["l0,2;l1,3", "l1,1;l2,2"]) {
      const input = parseInputArrayFen(inputFen);
      if (input === undefined) throw new Error("defense input must parse");
      expect(game.processInput(input, false, false).kind).toBe("events");
    }
    expect(game.activeColor).toBe("white");
    expect(game.winnerColor()).toBeUndefined();
  });

  it.each(["fast", "normal", "pro"] as const)(
    "retains a same-turn terminal scout only after its proof completes in %s",
    (mode) => {
      const boundary = mode === "pro" ? 200 : 210;
      const before = search(TERMINAL_SCOUT_FEN, mode, boundary - 1);
      expect(before.score).toBeLessThan(WIN_VALUE - MAX_PLY);

      for (const maxNodes of [
        boundary,
        PACKED_SELECTION_PROFILES[mode].limits.maxNodes,
      ]) {
        const outcome = search(TERMINAL_SCOUT_FEN, mode, maxNodes);
        expect(outcome.move).not.toBe(before.move);
        expect(outcome.score).toBeGreaterThanOrEqual(WIN_VALUE - MAX_PLY);
        expect(Number.isInteger(outcome.score)).toBe(true);
        expect(outcome.depth).toBe(2);
        expect(outcome.nodes).toBe(boundary);

        const { game } = loaded(TERMINAL_SCOUT_FEN);
        const winner = game.activeColor;
        expect(game.processInput(moveToInputs(outcome.move), false, false).kind).toBe(
          "events",
        );
        expect(game.activeColor).toBe(winner);
        expect(game.winnerColor()).toBeUndefined();
        const continuation = parseInputArrayFen("l1,9;l0,10");
        if (continuation === undefined) throw new Error("winning reply must parse");
        expect(game.processInput(continuation, false, false).kind).toBe("events");
        expect(game.winnerColor()).toBe(winner);
      }
    },
  );

  it("rejects a terminal scout that skipped replies through selective pruning", () => {
    const outcome = search(SELECTIVE_SCOUT_FEN, "fast", 680);
    expect(inputArrayFen(moveToInputs(outcome.move))).toBe("l7,6;l8,4;l9,4");
    expect(outcome.score).toBeLessThan(WIN_VALUE - MAX_PLY);
    expect(outcome.depth).toBe(2);
  });

  it("keeps the incumbent when a nonterminal half-point scout cannot finish re-search", () => {
    const outcome = search(HALF_POINT_SCOUT_FEN, "pro", 1_344);
    expect(inputArrayFen(moveToInputs(outcome.move))).toBe("l8,5;l7,6");
    expect(outcome.score).toBe(-19_809.5);
    expect(outcome.depth).toBe(2);
  });

  it("keeps the completed incumbent when aspiration widening is interrupted", () => {
    const outcome = search(WIDENING_FEN, "fast", 410);
    expect(inputArrayFen(moveToInputs(outcome.move))).toBe("l1,4;l3,4;l2,3");
    expect(outcome.depth).toBe(1);
  });

  it.each(["fast", "normal"] as const)(
    "keeps the last completed %s iteration when a deeper challenger finishes",
    (mode) => {
      const before = search(CHALLENGER_FEN, mode, 32_629);
      const after = search(CHALLENGER_FEN, mode, 32_630);
      expect(before.move).toBe(16_728_800);
      expect(after.move).toBe(before.move);
      expect(after.score).toBe(before.score);
      expect(after.depth).toBe(before.depth);
    },
  );

  it.each(["fast", "normal"] as const)(
    "retains the last completed %s iteration when the cooperative deadline expires",
    (mode) => {
      const { searcher } = loaded(CHALLENGER_FEN);
      const profile = PACKED_SELECTION_PROFILES[mode];
      searcher.search(
        { ...profile.limits, maxDepth: 2, maxNodes: 10_000 },
        () => false,
        profile.weights,
      );
      let checks = 0;
      const outcome = searcher.search(
        { ...profile.limits, maxNodes: 100_000 },
        () => ++checks === 16,
        profile.weights,
      );
      expect(checks).toBe(16);
      expect(outcome.move).toBe(16_728_800);
      expect(outcome.supported).toBe(true);
      expect(outcome.depth).toBe(4);
    },
  );

  it("honors the deadline before a win certificate and stops before the next check", () => {
    const profile = PACKED_SELECTION_PROFILES.fast;
    const outcomes = [14, 15].map((stopAtCheck) => {
      const { searcher } = loaded(TIMED_CERTIFICATE_FEN);
      searcher.search(
        { ...profile.limits, maxDepth: 2, maxNodes: 10_000 },
        () => false,
        profile.weights,
      );
      let checks = 0;
      const outcome = searcher.search(
        { ...profile.limits, maxNodes: 100_000 },
        () => ++checks === stopAtCheck,
        profile.weights,
      );
      return { outcome, checks };
    });
    const before = outcomes[0];
    const after = outcomes[1];
    if (before === undefined || after === undefined) throw new Error("missing run");
    expect(before.checks).toBe(14);
    expect(before.outcome.score).toBeLessThan(WIN_VALUE - MAX_PLY);
    expect(after.checks).toBe(14);
    expect(after.outcome.score).toBeGreaterThanOrEqual(WIN_VALUE - MAX_PLY);
    expect(after.outcome.depth).toBeGreaterThan(before.outcome.depth);
    expect(after.outcome.nodes).toBeLessThan(15 * 2_048);
  });
});
