import { toI32 } from "../engine/numerics.js";

const INVALID_ENUM_VALUE_MESSAGE = "invalid enum value passed";

type WasmClass<T extends object> = {
  readonly name: string;
  readonly prototype: T;
  [Symbol.hasInstance](value: unknown): boolean;
};

export function isWasmNullish(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** Apply the wasm i32 conversion and reject values outside an enum's range. */
export function coerceWasmEnum<T extends number>(value: T, maximum: T): T {
  const coerced = toI32(value);
  if (coerced < 0 || coerced > maximum) {
    throw new Error(INVALID_ENUM_VALUE_MESSAGE);
  }
  return coerced as T;
}

/** Reproduce wasm-bindgen's `Option<Enum>` null and one-past-end sentinel. */
export function coerceOptionalWasmEnum<T extends number>(
  value: T | undefined,
  maximum: T,
): T | undefined {
  if (isWasmNullish(value)) {
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

/** Match wasm-bindgen's public wrapper instance check and error text. */
export function assertWasmClass<T extends object>(
  value: unknown,
  expected: WasmClass<T>,
): asserts value is T {
  if (!(value instanceof expected)) {
    throw new Error(`expected instance of ${expected.name}`);
  }
}
