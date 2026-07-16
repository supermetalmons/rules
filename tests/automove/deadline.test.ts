import { afterEach, describe, expect, it } from "vitest";

import {
  cacheWriteAllowed,
  cancelled,
  checkpoint,
  checkpointWithReserve,
  resetDeadlineStateForTesting,
  takePreviousTimeout,
  withAutomoveClock,
  withCooperativeSubdeadline,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import { randomIndex, type RandomSource } from "../../src/automove/types.js";

type MutableClock = { time: number; now(): number };

function mutableClock(): MutableClock {
  return {
    time: 0,
    now(): number {
      return this.time;
    },
  };
}

afterEach(resetDeadlineStateForTesting);

describe("cooperative automove deadlines", () => {
  it("makes an observed timeout sticky through the outer operation", () => {
    const clock = mutableClock();
    withAutomoveClock(clock, () => {
      withDeadlineIfAbsent(10, () => {
        expect(checkpoint()).toBe(false);
        clock.time = 10;
        expect(checkpoint()).toBe(true);
        clock.time = 0;
        expect(cancelled()).toBe(true);
        expect(cacheWriteAllowed()).toBe(false);
      });
      expect(takePreviousTimeout()).toBe(true);
      expect(takePreviousTimeout()).toBe(false);
    });
  });

  it("inherits an outer deadline across nested operations", () => {
    const clock = mutableClock();
    withAutomoveClock(clock, () => {
      withDeadlineIfAbsent(10, () => {
        withDeadlineIfAbsent(1_000, () => {
          clock.time = 11;
          expect(checkpoint()).toBe(true);
        });
        expect(cancelled()).toBe(true);
      });
    });
  });

  it("restores an unexpired outer deadline after a child timeout", () => {
    const clock = mutableClock();
    withAutomoveClock(clock, () => {
      withDeadlineIfAbsent(100, () => {
        const result = withCooperativeSubdeadline(10, () => {
          clock.time = 11;
          expect(checkpoint()).toBe(true);
          return "partial";
        });
        expect(result).toBeUndefined();
        expect(cancelled()).toBe(false);
        expect(checkpoint()).toBe(false);
      });
      expect(takePreviousTimeout()).toBe(false);
    });
  });

  it("honors cleanup reserve checkpoints", () => {
    const clock = mutableClock();
    withAutomoveClock(clock, () => {
      withDeadlineIfAbsent(100, () => {
        clock.time = 89;
        expect(checkpointWithReserve(10)).toBe(false);
        clock.time = 90;
        expect(checkpointWithReserve(10)).toBe(true);
      });
    });
  });
});

describe("uniform random index", () => {
  it("rejects the biased uint32 tail", () => {
    const values = [0xffff_ffff, 7];
    const source: RandomSource = {
      nextU32(): number {
        const next = values.shift();
        if (next === undefined) throw new Error("random source exhausted");
        return next;
      },
    };
    expect(randomIndex(10, source)).toBe(7);
    expect(values).toEqual([]);
  });

  it("rejects empty collections", () => {
    expect(() => randomIndex(0)).toThrow(RangeError);
  });
});
