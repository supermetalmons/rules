import { PERFORMANCE_CLOCK, type MonotonicClock } from "./types.js";

export const AUTOMOVE_SELECTOR_BUDGET_MS = 650;

type ActiveDeadline = {
  endMs: number;
  timedOut: boolean;
  nesting: number;
};

let activeDeadline: ActiveDeadline | undefined;
let lastOuterDeadlineTimedOut = false;
let clock: MonotonicClock = PERFORMANCE_CLOCK;

function now(): number {
  return clock.now();
}

function enterDeadline(budgetMs: number): void {
  if (activeDeadline === undefined) {
    activeDeadline = {
      endMs: now() + Math.max(budgetMs, 0),
      timedOut: false,
      nesting: 1,
    };
  } else {
    activeDeadline.nesting = Math.min(
      Number.MAX_SAFE_INTEGER,
      activeDeadline.nesting + 1,
    );
  }
}

function exitDeadline(): void {
  if (activeDeadline === undefined) return;
  if (activeDeadline.nesting <= 1) {
    lastOuterDeadlineTimedOut = activeDeadline.timedOut;
    activeDeadline = undefined;
  } else {
    activeDeadline.nesting -= 1;
  }
}

/** Run under a cooperative deadline, preserving an earlier outer deadline. */
export function withDeadlineIfAbsent<T>(
  budgetMs: number,
  operation: () => T,
): T {
  enterDeadline(budgetMs);
  try {
    return operation();
  } finally {
    exitDeadline();
  }
}

function restoreOuterDeadline(outer: ActiveDeadline): boolean {
  const currentTime = now();
  const childTimedOut =
    activeDeadline === undefined ||
    activeDeadline.timedOut ||
    currentTime >= activeDeadline.endMs;
  if (currentTime >= outer.endMs) outer.timedOut = true;
  activeDeadline = outer;
  return childTimedOut;
}

/** Run under a shorter child deadline and restore the outer deadline afterward. */
export function withCooperativeSubdeadline<T>(
  budgetMs: number,
  operation: () => T,
): T | undefined {
  if (activeDeadline === undefined) {
    let completed: T | undefined;
    withDeadlineIfAbsent(budgetMs, () => {
      if (checkpoint()) return;
      const result = operation();
      if (!checkpoint()) completed = result;
    });
    return completed;
  }
  if (checkpoint()) return undefined;

  const outer = { ...activeDeadline };
  activeDeadline.endMs = Math.min(
    activeDeadline.endMs,
    now() + Math.max(budgetMs, 0),
  );
  if (checkpoint()) {
    restoreOuterDeadline(outer);
    return undefined;
  }

  let restored = false;
  try {
    const result = operation();
    const childTimedOut = restoreOuterDeadline(outer);
    restored = true;
    return childTimedOut ? undefined : result;
  } finally {
    if (!restored) restoreOuterDeadline(outer);
  }
}

/** Poll the active clock. Once reached, cancellation remains sticky. */
export function checkpoint(): boolean {
  if (activeDeadline === undefined) return false;
  if (activeDeadline.timedOut) return true;
  if (now() >= activeDeadline.endMs) {
    activeDeadline.timedOut = true;
    return true;
  }
  return false;
}

/** Stop when only the requested cleanup reserve remains. */
export function checkpointWithReserve(reserveMs: number): boolean {
  if (activeDeadline === undefined) return false;
  if (activeDeadline.timedOut) return true;
  if (now() + Math.max(reserveMs, 0) >= activeDeadline.endMs) {
    activeDeadline.timedOut = true;
    return true;
  }
  return false;
}

export function cancelled(): boolean {
  return activeDeadline?.timedOut ?? false;
}

export function takePreviousTimeout(): boolean {
  if (activeDeadline !== undefined) return false;
  const result = lastOuterDeadlineTimedOut;
  lastOuterDeadlineTimedOut = false;
  return result;
}

export function cacheWriteAllowed(): boolean {
  return !checkpoint();
}

/** Test-only scoped clock injection; state is restored even when the callback throws. */
export function withAutomoveClock<T>(
  testClock: MonotonicClock,
  operation: () => T,
): T {
  const previousClock = clock;
  clock = testClock;
  try {
    return operation();
  } finally {
    clock = previousClock;
  }
}

/** Clear module state between deterministic single-worker tests. */
export function resetDeadlineStateForTesting(): void {
  activeDeadline = undefined;
  lastOuterDeadlineTimedOut = false;
  clock = PERFORMANCE_CLOCK;
}
