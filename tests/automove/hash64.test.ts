import { describe, expect, it } from "vitest";

import {
  HASH64_ZERO,
  Hash64Set,
  Hash64Table,
  hash64,
  hash64Add,
  hash64And,
  hash64Bucket,
  hash64FromI32,
  hash64FromIntegerNumber,
  hash64FromU32,
  hash64Mul,
  hash64Or,
  hash64RotateLeft,
  hash64ShiftLeft,
  hash64ShiftRight,
  hash64Xor,
  type Hash64,
} from "../../src/automove/hash64.js";

const U64_BITS = 64n;
const U64_MASK = (1n << U64_BITS) - 1n;

function asBigInt(value: Hash64): bigint {
  return (BigInt(value.hi) << 32n) | BigInt(value.lo);
}

function asHash64(value: bigint): Hash64 {
  const normalized = BigInt.asUintN(64, value);
  return hash64(
    Number((normalized >> 32n) & 0xffff_ffffn),
    Number(normalized & 0xffff_ffffn),
  );
}

function normalizedShift(bits: number): number {
  return (bits >>> 0) & 63;
}

describe("Hash64 arithmetic", () => {
  const values = [
    hash64(0, 0),
    hash64(0, 1),
    hash64(0x0123_4567, 0x89ab_cdef),
    hash64(0x8000_0000, 0),
    hash64(0xffff_ffff, 0xffff_ffff),
  ] as const;

  it("matches wrapped BigInt arithmetic and bitwise operations", () => {
    for (const left of values) {
      for (const right of values) {
        const leftBig = asBigInt(left);
        const rightBig = asBigInt(right);
        expect(hash64Add(left, right)).toEqual(asHash64(leftBig + rightBig));
        expect(hash64Mul(left, right)).toEqual(asHash64(leftBig * rightBig));
        expect(hash64Xor(left, right)).toEqual(asHash64(leftBig ^ rightBig));
        expect(hash64Or(left, right)).toEqual(asHash64(leftBig | rightBig));
        expect(hash64And(left, right)).toEqual(asHash64(leftBig & rightBig));
      }
    }
  });

  it("preserves rotate and shift behavior at word and u64 boundaries", () => {
    const value = hash64(0x0123_4567, 0x89ab_cdef);
    for (const bits of [0, 1, 31, 32, 33, 63, 64, 65, -1]) {
      const shift = normalizedShift(bits);
      const distance = BigInt(shift);
      const source = asBigInt(value);
      const rotated =
        shift === 0
          ? source
          : ((source << distance) | (source >> BigInt(64 - shift))) & U64_MASK;
      expect(hash64RotateLeft(value, bits)).toEqual(asHash64(rotated));
      expect(hash64ShiftLeft(value, bits)).toEqual(
        asHash64(source << distance),
      );
      expect(hash64ShiftRight(value, bits)).toEqual(
        asHash64(source >> distance),
      );
    }
  });

  it("matches signed and integral Number conversion semantics", () => {
    expect(hash64FromU32(-1)).toEqual(hash64(0, 0xffff_ffff));
    expect(hash64FromI32(-1)).toEqual(hash64(0xffff_ffff, 0xffff_ffff));
    expect(hash64FromI32(0x8000_0000)).toEqual(
      hash64(0xffff_ffff, 0x8000_0000),
    );

    for (const value of [
      0,
      -1,
      0x1_0000_0001,
      -0x1_0000_0001,
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ]) {
      expect(hash64FromIntegerNumber(value)).toEqual(asHash64(BigInt(value)));
    }
    expect(() => hash64FromIntegerNumber(1.5)).toThrow(RangeError);
    expect(() => hash64FromIntegerNumber(Number.POSITIVE_INFINITY)).toThrow(
      RangeError,
    );
  });
});

describe("Hash64 collections", () => {
  it("keeps colliding primary hashes distinct", () => {
    const left = hash64(2_184_130_051, 1_647_364_404);
    const right = hash64(3_713_505_163, 3_686_307_404);
    expect(hash64Bucket(left)).toBe(hash64Bucket(right));

    const table = new Hash64Table<string>(4);
    table.set(left, "left");
    table.set(right, "right");

    expect(table.size).toBe(2);
    expect(table.get(left)).toBe("left");
    expect(table.get(right)).toBe("right");
    expect(table.delete(left)).toBe(true);
    expect(table.get(left)).toBeUndefined();
    expect(table.get(right)).toBe("right");
  });

  it("matches tags, secondary hashes, and qualifiers exactly", () => {
    const primary = hash64(1, 2);
    const table = new Hash64Table<string>(8);

    table.set(primary, "nan", Number.NaN, undefined, Number.NaN);
    table.set(primary, "without-secondary", 7, undefined, "qualified");
    table.set(primary, "with-zero-secondary", 7, HASH64_ZERO, "qualified");
    table.set(primary, "negative-zero", 8, undefined, -0);

    expect(table.get(primary, Number.NaN, undefined, Number.NaN)).toBe("nan");
    expect(table.get(primary, 7, undefined, "qualified")).toBe(
      "without-secondary",
    );
    expect(table.get(primary, 7, HASH64_ZERO, "qualified")).toBe(
      "with-zero-secondary",
    );
    expect(table.get(primary, 8, undefined, 0)).toBe("negative-zero");

    table.set(primary, "updated", Number.NaN, undefined, Number.NaN);
    expect(table.size).toBe(4);
    expect(table.get(primary, Number.NaN, undefined, Number.NaN)).toBe(
      "updated",
    );
  });

  it("clears the whole table before inserting beyond capacity", () => {
    const first = hash64FromU32(1);
    const second = hash64FromU32(2);
    const third = hash64FromU32(3);
    const table = new Hash64Table<string>(2);

    table.set(first, "first");
    table.set(second, "second");
    table.set(first, "updated");
    expect(table.size).toBe(2);

    table.set(third, "third");
    expect(table.size).toBe(1);
    expect(table.get(first)).toBeUndefined();
    expect(table.get(second)).toBeUndefined();
    expect(table.get(third)).toBe("third");
  });

  it("replaces a same-bucket entry cleanly when capacity is reached", () => {
    const first = hash64(2_184_130_051, 1_647_364_404);
    const second = hash64(3_713_505_163, 3_686_307_404);
    expect(hash64Bucket(first)).toBe(hash64Bucket(second));
    const table = new Hash64Table<string>(1);

    table.set(first, "first");
    table.set(second, "second");

    expect(table.size).toBe(1);
    expect(table.get(first)).toBeUndefined();
    expect(table.get(second)).toBe("second");
  });

  it("copies key words instead of retaining caller-owned hash objects", () => {
    const primary = hash64(0x0123_4567, 0x89ab_cdef);
    const secondary = hash64(0xfedc_ba98, 0x7654_3210);
    const originalPrimary = hash64(primary.hi, primary.lo);
    const originalSecondary = hash64(secondary.hi, secondary.lo);
    const table = new Hash64Table<string>(2);
    table.set(primary, "stored", 9, secondary, "qualified");

    Object.assign(primary, hash64(1, 2));
    Object.assign(secondary, hash64(3, 4));

    expect(table.get(originalPrimary, 9, originalSecondary, "qualified")).toBe(
      "stored",
    );
    expect(table.get(primary, 9, secondary, "qualified")).toBeUndefined();
  });

  it("delegates the same key semantics through Hash64Set", () => {
    const primary = hash64(9, 10);
    const secondary = hash64(11, 12);
    const set = new Hash64Set(2);

    expect(set.add(primary, Number.NaN, secondary, Number.NaN)).toBe(set);
    expect(set.has(primary, Number.NaN, secondary, Number.NaN)).toBe(true);
    expect(set.delete(primary, Number.NaN, secondary, Number.NaN)).toBe(true);
    expect(set.has(primary, Number.NaN, secondary, Number.NaN)).toBe(false);
  });

  it("rejects invalid capacities", () => {
    for (const capacity of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new Hash64Table(capacity)).toThrow(RangeError);
      expect(() => new Hash64Set(capacity)).toThrow(RangeError);
    }
  });
});
