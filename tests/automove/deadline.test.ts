import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cacheWriteAllowed,
  cancelled,
  checkpoint,
  checkpointWithReserve,
  takePreviousTimeout,
  withCooperativeSubdeadline,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";

function mockClock(initialTime = 0): { set(time: number): void } {
  let currentTime = initialTime;
  vi.spyOn(globalThis.performance, "now").mockImplementation(() => currentTime);
  return {
    set(time: number): void {
      currentTime = time;
    },
  };
}

describe("cooperative automove deadlines", () => {
  beforeEach(() => {
    takePreviousTimeout();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    takePreviousTimeout();
  });

  it("has no cancellation or cache restriction outside a deadline", () => {
    expect(checkpoint()).toBe(false);
    expect(checkpointWithReserve(1_000)).toBe(false);
    expect(cancelled()).toBe(false);
    expect(cacheWriteAllowed()).toBe(true);
    expect(takePreviousTimeout()).toBe(false);
  });

  it("preserves the earlier outer deadline across ordinary nesting", () => {
    const clock = mockClock();
    const result = withDeadlineIfAbsent(50, () => {
      clock.set(10);
      const nested = withDeadlineIfAbsent(0, () => {
        expect(checkpoint()).toBe(false);
        return "nested";
      });
      expect(nested).toBe("nested");

      clock.set(50);
      expect(checkpoint()).toBe(true);
      clock.set(0);
      expect(checkpoint()).toBe(true);
      expect(cancelled()).toBe(true);
      expect(cacheWriteAllowed()).toBe(false);
      return "outer";
    });

    expect(result).toBe("outer");
    expect(cancelled()).toBe(false);
    expect(takePreviousTimeout()).toBe(true);
    expect(takePreviousTimeout()).toBe(false);
  });

  it("restores a live outer deadline after a child deadline expires", () => {
    const clock = mockClock();
    withDeadlineIfAbsent(100, () => {
      clock.set(10);
      const child = withCooperativeSubdeadline(20, () => {
        clock.set(31);
        return "late";
      });

      expect(child).toBeUndefined();
      expect(cancelled()).toBe(false);
      expect(checkpoint()).toBe(false);
      expect(cacheWriteAllowed()).toBe(true);
    });
    expect(takePreviousTimeout()).toBe(false);
  });

  it("restores a live outer deadline when a nested operation throws", () => {
    const clock = mockClock();
    withDeadlineIfAbsent(100, () => {
      clock.set(10);
      expect(() =>
        withCooperativeSubdeadline(20, () => {
          clock.set(15);
          throw new Error("child failed");
        }),
      ).toThrow("child failed");

      expect(cancelled()).toBe(false);
      expect(cacheWriteAllowed()).toBe(true);
      clock.set(99);
      expect(checkpoint()).toBe(false);
    });
    expect(takePreviousTimeout()).toBe(false);
  });

  it("keeps an outer expiry sticky when it occurs inside a child", () => {
    const clock = mockClock();
    withDeadlineIfAbsent(20, () => {
      clock.set(5);
      const child = withCooperativeSubdeadline(100, () => {
        clock.set(20);
        return "late";
      });

      expect(child).toBeUndefined();
      expect(cancelled()).toBe(true);
      expect(cacheWriteAllowed()).toBe(false);
    });
    expect(takePreviousTimeout()).toBe(true);
  });

  it("restores the outer deadline after a child consumes its reserve", () => {
    const clock = mockClock();
    withDeadlineIfAbsent(100, () => {
      clock.set(10);
      const child = withCooperativeSubdeadline(40, () => {
        clock.set(35);
        expect(checkpointWithReserve(15)).toBe(true);
        return "reserved";
      });

      expect(child).toBeUndefined();
      expect(cancelled()).toBe(false);
      expect(cacheWriteAllowed()).toBe(true);
      clock.set(99);
      expect(checkpoint()).toBe(false);
    });
    expect(takePreviousTimeout()).toBe(false);
  });

  it("runs standalone child deadlines and suppresses late results", () => {
    const clock = mockClock();
    const completed = withCooperativeSubdeadline(10, () => {
      clock.set(9);
      return 7;
    });
    expect(completed).toBe(7);
    expect(takePreviousTimeout()).toBe(false);

    clock.set(20);
    const timedOut = withCooperativeSubdeadline(10, () => {
      clock.set(30);
      return 9;
    });
    expect(timedOut).toBeUndefined();
    expect(takePreviousTimeout()).toBe(true);
  });

  it("marks the deadline sticky when only the cleanup reserve remains", () => {
    const clock = mockClock();
    withDeadlineIfAbsent(10, () => {
      clock.set(4.999);
      expect(checkpointWithReserve(5)).toBe(false);
      clock.set(5);
      expect(checkpointWithReserve(5)).toBe(true);
      clock.set(0);
      expect(checkpointWithReserve(0)).toBe(true);
      expect(cacheWriteAllowed()).toBe(false);
    });
    expect(takePreviousTimeout()).toBe(true);
  });

  it("restores module state when an operation throws", () => {
    mockClock();
    expect(() =>
      withDeadlineIfAbsent(10, () => {
        throw new Error("operation failed");
      }),
    ).toThrow("operation failed");

    expect(checkpoint()).toBe(false);
    expect(cancelled()).toBe(false);
    expect(cacheWriteAllowed()).toBe(true);
    expect(takePreviousTimeout()).toBe(false);
  });
});
