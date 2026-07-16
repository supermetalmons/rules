import { describe, expect, it } from "vitest";

import {
  isRustWhitespaceCodePoint,
  normalizeRustString,
  rustUtf8ByteLength,
  sliceRustStringByUtf8Bytes,
  splitRustWhitespace,
} from "../../src/engine/rust-string.js";

describe("Rust string compatibility", () => {
  it("uses the retained Rust whitespace code-point set", () => {
    const whitespace = [
      ...Array.from({ length: 5 }, (_, index) => 0x0009 + index),
      0x0020,
      0x0085,
      0x00a0,
      0x1680,
      ...Array.from({ length: 11 }, (_, index) => 0x2000 + index),
      0x2028,
      0x2029,
      0x202f,
      0x205f,
      0x3000,
    ];
    for (const codePoint of whitespace) {
      expect(isRustWhitespaceCodePoint(codePoint)).toBe(true);
      expect(
        splitRustWhitespace(`a${String.fromCodePoint(codePoint)}b`),
      ).toEqual(["a", "b"]);
    }
    for (const codePoint of [
      0xfeff, 0x180e, 0x200b, 0x2060, 0x001c, 0x001d, 0x001e, 0x001f,
    ]) {
      expect(isRustWhitespaceCodePoint(codePoint)).toBe(false);
      expect(
        splitRustWhitespace(`a${String.fromCodePoint(codePoint)}b`),
      ).toEqual([`a${String.fromCodePoint(codePoint)}b`]);
    }
  });

  it("replaces only unpaired UTF-16 surrogates", () => {
    expect(normalizeRustString("plain\0\ufeff")).toBe("plain\0\ufeff");
    expect(normalizeRustString("a\ud83d\ude00b")).toBe("a😀b");
    expect(normalizeRustString("a\ud800b\udc00c")).toBe("a�b�c");
    expect(normalizeRustString("\udc00\ud800")).toBe("��");
    expect(normalizeRustString("😀\ud800")).toBe("😀�");
  });

  it("counts and slices UTF-8 bytes at scalar boundaries", () => {
    expect(rustUtf8ByteLength("Aé€😀")).toBe(10);
    expect(rustUtf8ByteLength("\ud800")).toBe(3);
    expect(sliceRustStringByUtf8Bytes("Aé€😀", 1, 3)).toBe("é");
    expect(sliceRustStringByUtf8Bytes("Aé€😀", 3, 6)).toBe("€");
    expect(sliceRustStringByUtf8Bytes("Aé€😀", 6, 10)).toBe("😀");
    expect(() => sliceRustStringByUtf8Bytes("eé", 0, 2)).toThrow(
      new RangeError("UTF-8 byte index is not a scalar boundary"),
    );
    expect(() => sliceRustStringByUtf8Bytes("€", 0, 2)).toThrow(
      new RangeError("UTF-8 byte index is not a scalar boundary"),
    );
  });
});
