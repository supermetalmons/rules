/** The bounds of a signed 32-bit integer. */
export const I32_MIN = -0x8000_0000;
export const I32_MAX = 0x7fff_ffff;
export const U32_MAX = 0xffff_ffff;

const I32_PATTERN = /^[+-]?\d+/u;
const U64_MASK = (1n << 64n) - 1n;

/**
 * Apply JavaScript's signed 32-bit integer conversion.
 * Fractions truncate, non-finite values become zero, and large values wrap.
 */
export function toI32(value: number): number {
  return value | 0;
}

export function toU32(value: number): number {
  return value >>> 0;
}

export function addI32(left: number, right: number): number {
  return (left + right) | 0;
}

export function subI32(left: number, right: number): number {
  return (left - right) | 0;
}

export function mulI32(left: number, right: number): number {
  return Math.imul(left, right);
}

export function divI32(left: number, right: number): number {
  if (right === 0) {
    throw new RangeError("attempt to divide by zero");
  }
  if (left === I32_MIN && right === -1) {
    throw new RangeError("attempt to divide with overflow");
  }
  return toI32(Math.trunc(left / right));
}

export function remI32(left: number, right: number): number {
  if (right === 0) {
    throw new RangeError(
      "attempt to calculate the remainder with a divisor of zero",
    );
  }
  if (left === I32_MIN && right === -1) {
    throw new RangeError("attempt to calculate the remainder with overflow");
  }
  return toI32(left % right);
}

export function absI32(value: number): number {
  return value === I32_MIN ? I32_MIN : Math.abs(value);
}

export function saturatingAddI32(left: number, right: number): number {
  return clampI32(left + right);
}

export function saturatingSubI32(left: number, right: number): number {
  return clampI32(left - right);
}

export function saturatingMulI32(left: number, right: number): number {
  const result = BigInt(toI32(left)) * BigInt(toI32(right));
  if (result < BigInt(I32_MIN)) {
    return I32_MIN;
  }
  if (result > BigInt(I32_MAX)) {
    return I32_MAX;
  }
  return Number(result);
}

export function clampI32(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  if (value <= I32_MIN) {
    return I32_MIN;
  }
  if (value >= I32_MAX) {
    return I32_MAX;
  }
  return Math.trunc(value);
}

/** Strict signed 32-bit integer parsing. */
export function parseI32Strict(value: string): number | undefined {
  const match = I32_PATTERN.exec(value);
  if (match?.[0] !== value) {
    return undefined;
  }
  try {
    const parsed = BigInt(value);
    if (parsed < BigInt(I32_MIN) || parsed > BigInt(I32_MAX)) {
      return undefined;
    }
    return Number(parsed);
  } catch {
    return undefined;
  }
}

/** A wrapped unsigned 64-bit value, represented behind a replaceable abstraction. */
export type U64 = bigint;

export function u64(value: bigint | number): U64 {
  return BigInt.asUintN(64, BigInt(value));
}

export function addU64(left: U64, right: U64): U64 {
  return (left + right) & U64_MASK;
}

export function subU64(left: U64, right: U64): U64 {
  return (left - right) & U64_MASK;
}

export function mulU64(left: U64, right: U64): U64 {
  return (left * right) & U64_MASK;
}

export function xorU64(left: U64, right: U64): U64 {
  return (left ^ right) & U64_MASK;
}

export function rotateLeftU64(value: U64, bits: number): U64 {
  const shift = BigInt(toU32(bits) & 63);
  if (shift === 0n) {
    return value & U64_MASK;
  }
  return ((value << shift) | (value >> (64n - shift))) & U64_MASK;
}

export function wrappingShlU64(value: U64, bits: number): U64 {
  return (value << BigInt(toU32(bits) & 63)) & U64_MASK;
}

export function wrappingShrU64(value: U64, bits: number): U64 {
  return (value & U64_MASK) >> BigInt(toU32(bits) & 63);
}

export function u64ToHex(value: U64): string {
  return (value & U64_MASK).toString(16).padStart(16, "0");
}
