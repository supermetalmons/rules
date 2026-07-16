/** An unsigned 64-bit value stored as two normalized 32-bit words. */
export type Hash64 = {
  readonly hi: number;
  readonly lo: number;
};

export type Hash64Qualifier =
  string | number | bigint | boolean | null | undefined;

export const HASH64_ZERO: Hash64 = Object.freeze({ hi: 0, lo: 0 });

/** Construct a hash while normalizing both words to unsigned 32-bit values. */
export function hash64(hi: number, lo: number): Hash64 {
  return { hi: hi >>> 0, lo: lo >>> 0 };
}

export function hash64FromU32(value: number): Hash64 {
  return hash64(0, value);
}

/** Convert with the same sign extension as an i32-to-u64 cast. */
export function hash64FromI32(value: number): Hash64 {
  const signed = value | 0;
  return hash64(signed < 0 ? 0xffff_ffff : 0, signed);
}

/**
 * Convert an integral Number with the same wrapping semantics as
 * `BigInt.asUintN(64, BigInt(value))`.
 *
 * Engine-generated values take the i32 fast path. The BigInt fallback is only
 * used for unusual integral values outside that range; non-integral and
 * non-finite Numbers retain BigInt's RangeError behavior.
 */
export function hash64FromIntegerNumber(value: number): Hash64 {
  const signed = value | 0;
  if (value === signed) {
    return hash64(signed < 0 ? 0xffff_ffff : 0, signed);
  }
  return hash64FromBigInt(BigInt(value));
}

export function hash64Add(left: Hash64, right: Hash64): Hash64 {
  const lo = (left.lo + right.lo) >>> 0;
  const carry = lo < left.lo >>> 0 ? 1 : 0;
  return hash64(left.hi + right.hi + carry, lo);
}

/** Exact wrapped 64-bit multiplication using 16-bit limbs. */
export function hash64Mul(left: Hash64, right: Hash64): Hash64 {
  const leftLoLow = left.lo & 0xffff;
  const leftLoHigh = left.lo >>> 16;
  const rightLoLow = right.lo & 0xffff;
  const rightLoHigh = right.lo >>> 16;

  const lowProduct = leftLoLow * rightLoLow;
  const middle =
    (lowProduct >>> 16) + leftLoHigh * rightLoLow + leftLoLow * rightLoHigh;
  const lo = ((lowProduct & 0xffff) | ((middle & 0xffff) << 16)) >>> 0;
  const hi =
    leftLoHigh * rightLoHigh +
    Math.floor(middle / 0x1_0000) +
    (Math.imul(left.hi, right.lo) >>> 0) +
    (Math.imul(left.lo, right.hi) >>> 0);
  return hash64(hi, lo);
}

export function hash64Xor(left: Hash64, right: Hash64): Hash64 {
  return hash64(left.hi ^ right.hi, left.lo ^ right.lo);
}

export function hash64Or(left: Hash64, right: Hash64): Hash64 {
  return hash64(left.hi | right.hi, left.lo | right.lo);
}

export function hash64And(left: Hash64, right: Hash64): Hash64 {
  return hash64(left.hi & right.hi, left.lo & right.lo);
}

export function hash64RotateLeft(value: Hash64, bits: number): Hash64 {
  const shift = (bits >>> 0) & 63;
  if (shift === 0) return hash64(value.hi, value.lo);
  if (shift === 32) return hash64(value.lo, value.hi);
  if (shift < 32) {
    return hash64(
      (value.hi << shift) | (value.lo >>> (32 - shift)),
      (value.lo << shift) | (value.hi >>> (32 - shift)),
    );
  }
  const wordShift = shift - 32;
  return hash64(
    (value.lo << wordShift) | (value.hi >>> (32 - wordShift)),
    (value.hi << wordShift) | (value.lo >>> (32 - wordShift)),
  );
}

export function hash64ShiftLeft(value: Hash64, bits: number): Hash64 {
  const shift = (bits >>> 0) & 63;
  if (shift === 0) return hash64(value.hi, value.lo);
  if (shift === 32) return hash64(value.lo, 0);
  if (shift < 32) {
    return hash64(
      (value.hi << shift) | (value.lo >>> (32 - shift)),
      value.lo << shift,
    );
  }
  return hash64(value.lo << (shift - 32), 0);
}

export function hash64ShiftRight(value: Hash64, bits: number): Hash64 {
  const shift = (bits >>> 0) & 63;
  if (shift === 0) return hash64(value.hi, value.lo);
  if (shift === 32) return hash64(0, value.hi);
  if (shift < 32) {
    return hash64(
      value.hi >>> shift,
      (value.lo >>> shift) | (value.hi << (32 - shift)),
    );
  }
  return hash64(0, value.hi >>> (shift - 32));
}

export function hash64Equals(left: Hash64, right: Hash64): boolean {
  return left.hi === right.hi && left.lo === right.lo;
}

export function hash64IsZero(value: Hash64): boolean {
  return value.hi === 0 && value.lo === 0;
}

/** Compare as unsigned u64 values, returning -1, 0, or 1. */
export function hash64CompareUnsigned(left: Hash64, right: Hash64): number {
  if (left.hi !== right.hi) return left.hi < right.hi ? -1 : 1;
  if (left.lo !== right.lo) return left.lo < right.lo ? -1 : 1;
  return 0;
}

/** A deterministic 32-bit bucket hash. Full keys must still be compared. */
export function hash64Bucket(value: Hash64): number {
  let mixed = (value.hi ^ ((value.lo << 16) | (value.lo >>> 16))) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb_352d) >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846c_a68b) >>> 0;
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function hash64FromBigInt(value: bigint): Hash64 {
  const normalized = BigInt.asUintN(64, value);
  return hash64(
    Number((normalized >> 32n) & 0xffff_ffffn),
    Number(normalized & 0xffff_ffffn),
  );
}

type Hash64Entry<V> = {
  readonly primaryHi: number;
  readonly primaryLo: number;
  readonly tag: number;
  readonly hasSecondary: boolean;
  readonly secondaryHi: number;
  readonly secondaryLo: number;
  readonly qualifier: Hash64Qualifier;
  value: V;
};

function sameValueZero(left: Hash64Qualifier, right: Hash64Qualifier): boolean {
  return left === right || (left !== left && right !== right);
}

function entryMatches<V>(
  entry: Hash64Entry<V>,
  primary: Hash64,
  tag: number,
  secondary: Hash64 | undefined,
  qualifier: Hash64Qualifier,
): boolean {
  return (
    entry.primaryHi === primary.hi &&
    entry.primaryLo === primary.lo &&
    (entry.tag === tag || (entry.tag !== entry.tag && tag !== tag)) &&
    entry.hasSecondary === (secondary !== undefined) &&
    (secondary === undefined ||
      (entry.secondaryHi === secondary.hi &&
        entry.secondaryLo === secondary.lo)) &&
    sameValueZero(entry.qualifier, qualifier)
  );
}

function validateCapacity(capacity: number): number {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new RangeError(
      "Hash64 table capacity must be a positive safe integer",
    );
  }
  return capacity;
}

/** Collision-safe bounded table keyed without composite string allocation. */
export class Hash64Table<V> {
  readonly #buckets = new Map<number, Hash64Entry<V>[]>();
  readonly #capacity: number;
  #size = 0;

  public constructor(capacity: number) {
    this.#capacity = validateCapacity(capacity);
  }

  public get capacity(): number {
    return this.#capacity;
  }

  public get size(): number {
    return this.#size;
  }

  public clear(): void {
    this.#buckets.clear();
    this.#size = 0;
  }

  public has(
    primary: Hash64,
    tag = 0,
    secondary?: Hash64,
    qualifier?: Hash64Qualifier,
  ): boolean {
    return this.#find(primary, tag, secondary, qualifier) !== undefined;
  }

  public get(
    primary: Hash64,
    tag = 0,
    secondary?: Hash64,
    qualifier?: Hash64Qualifier,
  ): V | undefined {
    return this.#find(primary, tag, secondary, qualifier)?.value;
  }

  public set(
    primary: Hash64,
    value: V,
    tag = 0,
    secondary?: Hash64,
    qualifier?: Hash64Qualifier,
  ): this {
    let bucketKey = hash64Bucket(primary);
    let bucket = this.#buckets.get(bucketKey);
    const existing = bucket?.find((entry) =>
      entryMatches(entry, primary, tag, secondary, qualifier),
    );
    if (existing !== undefined) {
      existing.value = value;
      return this;
    }

    if (this.#size >= this.#capacity) {
      this.clear();
      bucketKey = hash64Bucket(primary);
      bucket = undefined;
    }
    if (bucket === undefined) {
      bucket = [];
      this.#buckets.set(bucketKey, bucket);
    }
    bucket.push({
      primaryHi: primary.hi,
      primaryLo: primary.lo,
      tag,
      hasSecondary: secondary !== undefined,
      secondaryHi: secondary?.hi ?? 0,
      secondaryLo: secondary?.lo ?? 0,
      qualifier,
      value,
    });
    this.#size += 1;
    return this;
  }

  public delete(
    primary: Hash64,
    tag = 0,
    secondary?: Hash64,
    qualifier?: Hash64Qualifier,
  ): boolean {
    const bucketKey = hash64Bucket(primary);
    const bucket = this.#buckets.get(bucketKey);
    if (bucket === undefined) return false;
    const index = bucket.findIndex((entry) =>
      entryMatches(entry, primary, tag, secondary, qualifier),
    );
    if (index < 0) return false;
    bucket.splice(index, 1);
    this.#size -= 1;
    if (bucket.length === 0) this.#buckets.delete(bucketKey);
    return true;
  }

  #find(
    primary: Hash64,
    tag: number,
    secondary: Hash64 | undefined,
    qualifier: Hash64Qualifier,
  ): Hash64Entry<V> | undefined {
    return this.#buckets
      .get(hash64Bucket(primary))
      ?.find((entry) =>
        entryMatches(entry, primary, tag, secondary, qualifier),
      );
  }
}

export class Hash64Set {
  readonly #table: Hash64Table<true>;

  public constructor(capacity: number) {
    this.#table = new Hash64Table(capacity);
  }

  public get capacity(): number {
    return this.#table.capacity;
  }

  public get size(): number {
    return this.#table.size;
  }

  public clear(): void {
    this.#table.clear();
  }

  public has(
    primary: Hash64,
    tag = 0,
    secondary?: Hash64,
    qualifier?: Hash64Qualifier,
  ): boolean {
    return this.#table.has(primary, tag, secondary, qualifier);
  }

  public add(
    primary: Hash64,
    tag = 0,
    secondary?: Hash64,
    qualifier?: Hash64Qualifier,
  ): this {
    this.#table.set(primary, true, tag, secondary, qualifier);
    return this;
  }

  public delete(
    primary: Hash64,
    tag = 0,
    secondary?: Hash64,
    qualifier?: Hash64Qualifier,
  ): boolean {
    return this.#table.delete(primary, tag, secondary, qualifier);
  }
}
