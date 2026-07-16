import { toI32 } from "../engine/numerics.js";

const INVALID_ENUM_VALUE_MESSAGE = "invalid enum value passed";

type ModelClass<T extends object> = {
  readonly name: string;
  readonly prototype: T;
  [Symbol.hasInstance](value: unknown): boolean;
};

export function isNullish(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** Apply signed 32-bit coercion and reject values outside an enum's range. */
export function coerceEnum<T extends number>(value: T, maximum: T): T {
  const coerced = toI32(value);
  if (coerced < 0 || coerced > maximum) {
    throw new Error(INVALID_ENUM_VALUE_MESSAGE);
  }
  return coerced as T;
}

/** Coerce an optional enum, including its one-past-end sentinel. */
export function coerceOptionalEnum<T extends number>(
  value: T | undefined,
  maximum: T,
): T | undefined {
  if (isNullish(value)) {
    return undefined;
  }

  const coerced = toI32(value);
  if (coerced === maximum + 1) {
    return undefined;
  }
  if (coerced < 0 || coerced > maximum) {
    throw new Error(INVALID_ENUM_VALUE_MESSAGE);
  }
  return coerced as T;
}

/** Validate a public model wrapper while preserving its established error text. */
export function assertModelInstance<T extends object>(
  value: unknown,
  expected: ModelClass<T>,
): asserts value is T {
  if (!(value instanceof expected)) {
    throw new Error(`expected instance of ${expected.name}`);
  }
}
