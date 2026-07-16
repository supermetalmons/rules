export type MonotonicClock = {
  now(): number;
};

export type RandomSource = {
  nextU32(): number;
};

export type AutomovePlatformServices = {
  readonly clock: MonotonicClock;
  readonly randomSource: RandomSource;
};

export {
  AUTOMOVE_TURN_ENGINE_MODE,
  type AutomoveSearchConfig,
  type AutomoveSearchExecutionConfig,
  type AutomoveTurnEngineMode,
  type MoveClassFlags,
  type RootEvaluation,
  type ScoredRootMove,
  type SmartAutomovePreference,
} from "./selector-types.js";

let platformClock: MonotonicClock = Object.freeze({
  now(): number {
    return globalThis.performance.now();
  },
});

let platformRandomSource: RandomSource = Object.freeze({
  nextU32(): number {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] ?? 0;
  },
});

/** Configure production services at a platform entrypoint without changing public APIs. */
export function configureAutomovePlatformServices(
  services: AutomovePlatformServices,
): void {
  platformClock = services.clock;
  platformRandomSource = services.randomSource;
}

/** Stable proxies let already-imported deadline/runtime modules observe platform setup. */
export const PERFORMANCE_CLOCK: MonotonicClock = Object.freeze({
  now(): number {
    return platformClock.now();
  },
});

export const CRYPTO_RANDOM_SOURCE: RandomSource = Object.freeze({
  nextU32(): number {
    return platformRandomSource.nextU32();
  },
});

/** Uniform selection using Uint32 rejection sampling without modulo bias. */
export function randomIndex(
  length: number,
  source: RandomSource = CRYPTO_RANDOM_SOURCE,
): number {
  if (!Number.isSafeInteger(length) || length <= 0 || length > 0x1_0000_0000) {
    throw new RangeError(
      "random index requires a non-empty uint32-sized collection",
    );
  }

  const range = 0x1_0000_0000;
  const unbiasedUpperBound = range - (range % length);
  for (;;) {
    const value = source.nextU32() >>> 0;
    if (value < unbiasedUpperBound) {
      return value % length;
    }
  }
}
