export const AUTOMOVE_SELECTOR_BUDGET_MS = 650;

type ActiveDeadline = {
  endMs: number;
  timedOut: boolean;
  nesting: number;
};

let activeDeadline: ActiveDeadline | undefined;
let lastOuterDeadlineTimedOut = false;

function now(): number {
  return globalThis.performance.now();
}

function nonnegativeDuration(durationMs: number): number {
  return Math.max(durationMs, 0);
}

function enterDeadline(budgetMs: number): void {
  if (activeDeadline === undefined) {
    activeDeadline = {
      endMs: now() + nonnegativeDuration(budgetMs),
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

function runWithStandaloneSubdeadline<T>(
  budgetMs: number,
  operation: () => T,
): T | undefined {
  let completed: T | undefined;
  withDeadlineIfAbsent(budgetMs, () => {
    if (checkpoint()) return;
    const result = operation();
    if (!checkpoint()) completed = result;
  });
  return completed;
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

function runWithNestedSubdeadline<T>(
  outerDeadline: ActiveDeadline,
  budgetMs: number,
  operation: () => T,
): T | undefined {
  if (checkpoint()) return undefined;

  const outer = { ...outerDeadline };
  outerDeadline.endMs = Math.min(
    outerDeadline.endMs,
    now() + nonnegativeDuration(budgetMs),
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

/** Run under a shorter child deadline and restore the outer deadline afterward. */
export function withCooperativeSubdeadline<T>(
  budgetMs: number,
  operation: () => T,
): T | undefined {
  const outerDeadline = activeDeadline;
  return outerDeadline === undefined
    ? runWithStandaloneSubdeadline(budgetMs, operation)
    : runWithNestedSubdeadline(outerDeadline, budgetMs, operation);
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
  if (now() + nonnegativeDuration(reserveMs) >= activeDeadline.endMs) {
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
