import { describe, expect, it } from "vitest";
import { probe, lifecycle } from "./futility-envelope-harness.js";
const EXACT = 0;
const LOWER = 1;
const UPPER = 2;
const MOVE_ONLY = 3;
const MAX_NONTERMINAL = 999_951;

describe("conditional heuristic futility envelopes", () => {
  it.each(["normal"] as const)(
    "stores the envelope without replacing the current %s result",
    (mode) => {
      const { first } = probe({ mode, staticScore: 0, replies: [{ score: 5 }] });
      expect(first.score).toBe(5);
      expect(first.storedScore).toBe(10);
      expect(first.flag).toBe(UPPER);
      expect(first.tagged).toBe(true);
      expect(first.storedDepth).toBe(1);
      expect(first.selectiveEpoch).toBe(1);
    },
  );

  it.each([1, 2])("uses the actual depth-%i futility margin", (depth) => {
    const { first } = probe({
      depth,
      alpha: 10 * depth,
      beta: 10 * depth + 10,
      staticScore: 0,
      replies: [{ score: 5 }],
    });
    expect(first.tagged).toBe(true);
    expect(first.storedScore).toBe(10 * depth);
    expect(first.storedDepth).toBe(depth);
  });

  it("takes the maximum with the searched best score", () => {
    const { first } = probe({
      alpha: 20,
      beta: 30,
      staticScore: 0,
      replies: [{ score: 15 }],
    });
    expect(first.score).toBe(15);
    expect(first.tagged).toBe(true);
    expect(first.storedScore).toBe(15);
  });

  it("rejects the tempting cheap best-score hit below the old futility threshold", () => {
    const { first, next } = probe({
      staticScore: 0,
      replies: [{ score: 5 }],
      next: { alpha: 9.5, beta: 20 },
    });
    expect(first.storedScore).toBe(10);
    expect(next?.score).toBe(5);
    expect(next?.probes.length).toBeGreaterThan(0);
    expect(next?.tagged).toBe(false);
  });

  it.each([10, 10.5, 20])(
    "reuses at alpha %i only as a selective heuristic result",
    (alpha) => {
      const { first, next } = probe({
        staticScore: 0,
        replies: [{ score: 5 }],
        next: { alpha, beta: alpha + 10 },
      });
      expect(first.score).toBe(5);
      expect(next?.score).toBe(10);
      expect(next?.nodes).toBe(1);
      expect(next?.probes).toHaveLength(0);
      expect(next?.staticCalls).toBe(0);
      expect(next?.addedSelectivity).toBe(1);
      expect(next?.selectiveEpoch).toBe(2);
    },
  );

  it("also rejects alpha below a larger previously searched best score", () => {
    const { next } = probe({
      alpha: 20,
      beta: 30,
      staticScore: 0,
      replies: [{ score: 15 }],
      next: { alpha: 14.5, beta: 25 },
    });
    expect(next?.probes.length).toBeGreaterThan(0);
    expect(next?.score).toBe(15);
  });

  it("does not reuse the heuristic envelope at a shallower depth", () => {
    const { first, next } = probe({
      depth: 2,
      alpha: 20,
      beta: 30,
      staticScore: 0,
      replies: [{ score: 5 }],
      next: { depth: 1, alpha: 20, beta: 30 },
    });
    expect(first.storedDepth).toBe(2);
    expect(next?.score).toBe(5);
    expect(next?.probes.length).toBeGreaterThan(0);
  });

  it("does not reuse the heuristic envelope at a deeper depth", () => {
    const { next } = probe({
      staticScore: 0,
      replies: [{ score: 5 }],
      next: { depth: 2, alpha: 20, beta: 30 },
    });
    expect(next?.score).toBe(5);
    expect(next?.probes.length).toBeGreaterThan(0);
  });

  it("never creates an envelope when move-count pruning caused the break", () => {
    const { first } = probe({
      staticScore: 0,
      replies: [{ score: 5 }],
      tuning: { moveCountPruning: true, moveCountBase: 1, moveCountFactor: 0 },
    });
    expect(first.flag).toBe(MOVE_ONLY);
    expect(first.tagged).toBe(false);
    expect(first.staticCalls).toBe(0);
  });

  it("does not reuse descendant selectivity as evidence of own-node futility", () => {
    const { first } = probe({ staticScore: 20, replies: [{ score: 5, selective: 1 }] });
    expect(first.flag).toBe(MOVE_ONLY);
    expect(first.tagged).toBe(false);
    expect(first.selectiveEpoch).toBe(1);
  });

  it("does not cache an in-window result even when a futile quiet tail is omitted", () => {
    const { first } = probe({ staticScore: 0, replies: [{ score: 15 }] });
    expect(first.score).toBe(15);
    expect(first.flag).toBe(MOVE_ONLY);
    expect(first.tagged).toBe(false);
  });

  it("leaves ordinary beta cutoffs untagged", () => {
    const { first } = probe({ staticScore: 0, replies: [{ score: 25 }] });
    expect(first.flag).toBe(LOWER);
    expect(first.tagged).toBe(false);
    expect(first.staticCalls).toBe(0);
  });

  it("never creates this cache at depth three", () => {
    const { first } = probe({
      depth: 3,
      staticScore: 0,
      replies: [{ score: 5 }],
      tuning: { moveCountPruning: true, moveCountBase: 1, moveCountFactor: 0 },
    });
    expect(first.tagged).toBe(false);
    expect(first.staticCalls).toBe(0);
  });

  it.each(["fast", "pro"] as const)("leaves %s selective flags unchanged", (mode) => {
    const { first } = probe({ mode, staticScore: 0, replies: [{ score: 5 }] });
    expect(first.score).toBe(5);
    expect(first.flag).toBe(MOVE_ONLY);
    expect(first.tagged).toBe(false);
  });

  it.each(["normal", "pro"] as const)(
    "does not enable the %s feature for equal-valued custom weights",
    (mode) => {
      expect(
        probe({ mode, equalCustom: true, staticScore: 0, replies: [{ score: 5 }] })
          .first.tagged,
      ).toBe(false);
    },
  );

  it.each(["fast", "pro"] as const)("does not consume a tagged entry in %s", (mode) => {
    const { first } = probe({
      mode,
      tt: { flag: UPPER, score: 10, depth: 1, tagged: true },
      replies: [{ stop: true }],
    });
    expect(first.stopped).toBe(true);
    expect(first.probes).toHaveLength(1);
    expect(first.addedSelectivity).toBe(0);
  });

  it.each([EXACT, LOWER])(
    "does not interpret a malformed tagged flag %i as an envelope",
    (flag) => {
      const { first } = probe({
        tt: { flag, score: 5, depth: 1, tagged: true },
        replies: [{ stop: true }],
      });
      expect(first.probes).toHaveLength(1);
      expect(first.stopped).toBe(true);
    },
  );

  it.each([
    { flag: EXACT, score: 5 },
    { flag: LOWER, score: 25 },
    { flag: UPPER, score: 5 },
  ])(
    "retains ordinary deeper TT reuse without selective marking %#",
    ({ flag, score }) => {
      const { first } = probe({ tt: { flag, score, depth: 3 } });
      expect(first.score).toBe(score);
      expect(first.probes).toHaveLength(0);
      expect(first.addedSelectivity).toBe(0);
    },
  );

  it("preserves negative half-point thresholds exactly", () => {
    const { first, next } = probe({
      alpha: -10.5,
      beta: 0,
      staticScore: -20.5,
      replies: [{ score: -15.5 }],
      fillScore: -20,
      next: { alpha: -10.5, beta: 0 },
    });
    expect(first.score).toBe(-15.5);
    expect(first.storedScore).toBe(-10.5);
    expect(next?.score).toBe(-10.5);
    expect(next?.addedSelectivity).toBe(1);
  });

  it("accepts the last nonterminal value but falls back to move-only at the terminal band", () => {
    const inside = probe({
      alpha: MAX_NONTERMINAL,
      beta: 1_000_000,
      staticScore: MAX_NONTERMINAL,
      replies: [{ score: 5 }],
      tuning: { futilityMargin: 0 },
    }).first;
    expect(inside.tagged).toBe(true);
    expect(inside.storedScore).toBe(MAX_NONTERMINAL);
    const outside = probe({
      alpha: MAX_NONTERMINAL + 1,
      beta: 1_000_000,
      staticScore: MAX_NONTERMINAL,
      replies: [{ score: 5 }],
      tuning: { futilityMargin: 1 },
    }).first;
    expect(outside.tagged).toBe(false);
    expect(outside.flag).toBe(MOVE_ONLY);
    expect(outside.storedScore).toBe(5);
  });

  it("stores a nonterminal heuristic envelope even when the current fail-low score is terminal-band", () => {
    const { first, next } = probe({
      depth: 2,
      alpha: 20,
      beta: 30,
      staticScore: 0,
      replies: [{ score: -999_999 }],
      next: { depth: 2, alpha: 20, beta: 30 },
    });
    expect(first.score).toBe(-999_999);
    expect(first.tagged).toBe(true);
    expect(first.storedScore).toBe(20);
    expect(next?.score).toBe(20);
    expect(next?.addedSelectivity).toBe(1);
  });

  it.each([0, 1])(
    "keeps the envelope in active-relative score units for color %i",
    (active) => {
      const { first, next } = probe({
        active,
        staticScore: 0,
        replies: [{ score: 5 }],
        next: { alpha: 10, beta: 20 },
      });
      expect(first.tagged).toBe(true);
      expect(next?.score).toBe(10);
      expect(next?.addedSelectivity).toBe(1);
    },
  );

  it("does not alias the opposite active color in the position key", () => {
    const { next } = probe({
      active: 0,
      staticScore: 0,
      replies: [{ score: 5 }],
      next: { active: 1, alpha: 10, beta: 20 },
    });
    expect(next?.probes.length).toBeGreaterThan(0);
    expect(next?.score).toBe(5);
  });

  it.each([{ stop: true }, { unsupported: true }])(
    "does not publish after a stopped or unsupported child %#",
    (reply) => {
      const { first } = probe({ staticScore: 0, replies: [reply] });
      expect(first.stopped).toBe(true);
      expect(first.flag).toBeNull();
      expect(first.tagged).toBe(false);
    },
  );

  it("checks stop and timeout before reading a tagged entry", () => {
    const tt = { flag: UPPER, score: 10, depth: 1, tagged: true };
    const stopped = probe({ tt, stopBefore: true }).first;
    const timed = probe({ tt, startNodes: 2_047, timeout: true }).first;
    for (const result of [stopped, timed]) {
      expect(result.score).toBe(0);
      expect(result.stopped).toBe(true);
      expect(result.addedSelectivity).toBe(0);
    }
  });

  it("matches the canonical symmetric start's actual static score", () => {
    const { first } = probe({ replies: [{ score: 5 }] });
    expect(first.staticCalls).toBe(1);
    expect(first.tagged).toBe(true);
    expect(first.storedScore).toBe(10);
    expect(first.storedGeneration).toBe(1);
  });
});

describe("public search futility-mode lifecycle", () => {
  it.each(["fast", "normal", "pro"] as const)(
    "initializes and resets %s through the real search entry",
    (mode) => {
      expect(lifecycle(mode)).toEqual({
        during: mode === "normal",
        after: false,
        nodes: 0,
      });
    },
  );

  it("keeps equal-valued custom Normal weights outside the feature", () => {
    expect(lifecycle("normal", true)).toEqual({
      during: false,
      after: false,
      nodes: 0,
    });
  });
});
