import { describe, expect, it } from "vitest";

import {
  HASH64_ZERO,
  Hash64Set,
  Hash64Table,
  hash64,
  hash64Add,
  hash64And,
  hash64Bucket,
  hash64CompareUnsigned,
  hash64Equals,
  hash64FromBigIntForTesting,
  hash64FromI32,
  hash64FromIntegerNumber,
  hash64FromU32,
  hash64IsZero,
  hash64Mul,
  hash64Or,
  hash64RotateLeft,
  hash64ShiftLeft,
  hash64ShiftRight,
  hash64ToBigIntForTesting,
  hash64Xor,
  type Hash64,
} from "../../src/automove/hash64.js";

const U64_MASK = (1n << 64n) - 1n;

function fromBigInt(value: bigint): Hash64 {
  return hash64FromBigIntForTesting(value);
}

function toBigInt(value: Hash64): bigint {
  return hash64ToBigIntForTesting(value);
}

function rotateLeftReference(value: bigint, bits: number): bigint {
  const shift = BigInt((bits >>> 0) & 63);
  const normalized = value & U64_MASK;
  if (shift === 0n) return normalized;
  return ((normalized << shift) | (normalized >> (64n - shift))) & U64_MASK;
}

describe("Hash64 arithmetic", () => {
  const vectors = [
    0n,
    1n,
    0xffff_ffffn,
    0x1_0000_0000n,
    0x8000_0000_0000_0000n,
    0xffff_ffff_ffff_ffffn,
    0x9e37_79b9_7f4a_7c15n,
    0xbf58_476d_1ce4_e5b9n,
  ] as const;

  it("normalizes words and converts deterministic BigInt vectors", () => {
    expect(hash64(-1, -2)).toEqual({ hi: 0xffff_ffff, lo: 0xffff_fffe });
    expect(hash64FromU32(-1)).toEqual({ hi: 0, lo: 0xffff_ffff });
    expect(hash64FromI32(-1)).toEqual({
      hi: 0xffff_ffff,
      lo: 0xffff_ffff,
    });
    expect(hash64FromI32(-0x8000_0000)).toEqual({
      hi: 0xffff_ffff,
      lo: 0x8000_0000,
    });
    expect(hash64FromI32(0x7fff_ffff)).toEqual({
      hi: 0,
      lo: 0x7fff_ffff,
    });
    for (const vector of vectors) {
      expect(toBigInt(fromBigInt(vector))).toBe(vector & U64_MASK);
    }
    expect(toBigInt(fromBigInt(-1n))).toBe(U64_MASK);
  });

  it("preserves legacy Number-to-u64 conversion semantics", () => {
    for (const value of [0, -1, 0x1_0000_0000, -0x1_0000_0000]) {
      expect(toBigInt(hash64FromIntegerNumber(value))).toBe(
        BigInt.asUintN(64, BigInt(value)),
      );
    }
  });

  it("rejects non-integral and non-finite Numbers like BigInt", () => {
    for (const value of [
      0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      -Infinity,
    ]) {
      expect(() => hash64FromIntegerNumber(value)).toThrow(RangeError);
    }
  });

  it("matches wrapped BigInt add, multiply, xor, or, and", () => {
    for (const leftValue of vectors) {
      for (const rightValue of vectors) {
        const left = fromBigInt(leftValue);
        const right = fromBigInt(rightValue);
        expect(toBigInt(hash64Add(left, right))).toBe(
          (leftValue + rightValue) & U64_MASK,
        );
        expect(toBigInt(hash64Mul(left, right))).toBe(
          (leftValue * rightValue) & U64_MASK,
        );
        expect(toBigInt(hash64Xor(left, right))).toBe(
          (leftValue ^ rightValue) & U64_MASK,
        );
        expect(toBigInt(hash64Or(left, right))).toBe(
          (leftValue | rightValue) & U64_MASK,
        );
        expect(toBigInt(hash64And(left, right))).toBe(
          leftValue & rightValue & U64_MASK,
        );
      }
    }
  });

  it("matches wrapped rotations and logical shifts at word boundaries", () => {
    const shifts = [-1, 0, 1, 17, 31, 32, 33, 63, 64, 65] as const;
    for (const value of vectors) {
      for (const bits of shifts) {
        const normalizedBits = BigInt((bits >>> 0) & 63);
        const hash = fromBigInt(value);
        expect(toBigInt(hash64RotateLeft(hash, bits))).toBe(
          rotateLeftReference(value, bits),
        );
        expect(toBigInt(hash64ShiftLeft(hash, bits))).toBe(
          (value << normalizedBits) & U64_MASK,
        );
        expect(toBigInt(hash64ShiftRight(hash, bits))).toBe(
          (value & U64_MASK) >> normalizedBits,
        );
      }
    }
  });

  it("compares unsigned words and recognizes zero", () => {
    expect(hash64IsZero(HASH64_ZERO)).toBe(true);
    expect(hash64IsZero(hash64FromU32(1))).toBe(false);
    expect(hash64Equals(hash64(-1, -1), fromBigInt(U64_MASK))).toBe(true);
    expect(
      hash64CompareUnsigned(
        fromBigInt(0x8000_0000_0000_0000n),
        fromBigInt(0x7fff_ffff_ffff_ffffn),
      ),
    ).toBe(1);
    expect(hash64CompareUnsigned(fromBigInt(1n), fromBigInt(2n))).toBe(-1);
    expect(hash64CompareUnsigned(fromBigInt(2n), fromBigInt(2n))).toBe(0);
  });
});

describe("Hash64Table", () => {
  // These differ as full hashes but feed the same pre-avalanche bucket value.
  const collisionA = hash64(0, 0);
  const collisionB = hash64(1, 0x0001_0000);

  it("isolates full keys, tags, secondary keys, and qualifiers", () => {
    expect(hash64Bucket(collisionA)).toBe(hash64Bucket(collisionB));
    const table = new Hash64Table<string | undefined>(16);
    const secondaryA = hash64(2, 3);
    const secondaryB = hash64(2, 4);

    table.set(collisionA, undefined, 7, secondaryA, "left");
    table.set(collisionB, "collision", 7, secondaryA, "left");
    table.set(collisionA, "tag", 8, secondaryA, "left");
    table.set(collisionA, "secondary", 7, secondaryB, "left");
    table.set(collisionA, "qualifier", 7, secondaryA, "right");
    table.set(collisionA, "no-secondary", 7, undefined, "left");

    expect(table.size).toBe(6);
    expect(table.has(collisionA, 7, secondaryA, "left")).toBe(true);
    expect(table.get(collisionA, 7, secondaryA, "left")).toBeUndefined();
    expect(table.get(collisionB, 7, secondaryA, "left")).toBe("collision");
    expect(table.get(collisionA, 8, secondaryA, "left")).toBe("tag");
    expect(table.get(collisionA, 7, secondaryB, "left")).toBe("secondary");
    expect(table.get(collisionA, 7, secondaryA, "right")).toBe("qualifier");
    expect(table.get(collisionA, 7, undefined, "left")).toBe("no-secondary");
    expect(table.has(collisionA, 7, secondaryA, "missing")).toBe(false);
  });

  it("retains full safe-integer tags and uses SameValueZero qualifiers", () => {
    const table = new Hash64Table<string>(4);
    const wideTag = 0x1_0000_0001;
    table.set(collisionA, "wide", wideTag, undefined, Number.NaN);
    table.set(collisionA, "narrow", 1, undefined, Number.NaN);
    expect(table.get(collisionA, wideTag, undefined, Number.NaN)).toBe("wide");
    expect(table.get(collisionA, 1, undefined, Number.NaN)).toBe("narrow");
  });

  it("replaces in place and clears only for a new key at capacity", () => {
    const table = new Hash64Table<string>(2);
    table.set(fromBigInt(1n), "one");
    table.set(fromBigInt(2n), "two");
    table.set(fromBigInt(1n), "updated");
    expect(table.size).toBe(2);
    expect(table.get(fromBigInt(1n))).toBe("updated");

    table.set(fromBigInt(3n), "three");
    expect(table.size).toBe(1);
    expect(table.has(fromBigInt(1n))).toBe(false);
    expect(table.has(fromBigInt(2n))).toBe(false);
    expect(table.get(fromBigInt(3n))).toBe("three");
  });

  it("deletes exact entries and validates capacity", () => {
    const table = new Hash64Table<number>(2);
    table.set(collisionA, 1);
    table.set(collisionB, 2);
    expect(table.delete(collisionA)).toBe(true);
    expect(table.delete(collisionA)).toBe(false);
    expect(table.size).toBe(1);
    expect(table.get(collisionB)).toBe(2);
    table.clear();
    expect(table.size).toBe(0);
    expect(() => new Hash64Table(0)).toThrow(RangeError);
  });
});

describe("Hash64Set", () => {
  it("uses the same compound-key and capacity semantics", () => {
    const set = new Hash64Set(2);
    const first = hash64(1, 2);
    const second = hash64(3, 4);
    const third = hash64(5, 6);
    set.add(first, 9, second, false).add(first, 9, second, false);
    expect(set.size).toBe(1);
    expect(set.has(first, 9, second, false)).toBe(true);
    set.add(second);
    set.add(third);
    expect(set.size).toBe(1);
    expect(set.has(first, 9, second, false)).toBe(false);
    expect(set.delete(third)).toBe(true);
    expect(set.size).toBe(0);
  });
});
