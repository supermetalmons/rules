/**
 * Convert a JavaScript UTF-16 string to the well-formed scalar sequence that
 * wasm-bindgen would have encoded for a Rust `&str`.
 *
 * Valid surrogate pairs and every non-surrogate code unit are preserved.
 * Unpaired surrogates are replaced individually with U+FFFD.
 */
export function normalizeRustString(value: string): string {
  let result = "";
  let unchangedStart = 0;

  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        index += 1;
        continue;
      }
    } else if (codeUnit < 0xdc00 || codeUnit > 0xdfff) {
      continue;
    }

    result += `${value.slice(unchangedStart, index)}\ufffd`;
    unchangedStart = index + 1;
  }

  return unchangedStart === 0 ? value : result + value.slice(unchangedStart);
}

/** Rust's frozen Unicode `char::is_whitespace` set for the retained baseline. */
export function isRustWhitespaceCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0009 && codePoint <= 0x000d) ||
    codePoint === 0x0020 ||
    codePoint === 0x0085 ||
    codePoint === 0x00a0 ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000
  );
}

export function splitRustWhitespace(value: string): string[] {
  const normalized = normalizeRustString(value);
  const result: string[] = [];
  let field = "";

  for (const scalar of normalized) {
    const codePoint = scalar.codePointAt(0);
    if (codePoint !== undefined && isRustWhitespaceCodePoint(codePoint)) {
      if (field !== "") {
        result.push(field);
        field = "";
      }
    } else {
      field += scalar;
    }
  }
  if (field !== "") {
    result.push(field);
  }
  return result;
}

function utf8ScalarLength(codePoint: number): number {
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

export function rustUtf8ByteLength(value: string): number {
  let length = 0;
  for (const scalar of normalizeRustString(value)) {
    length += utf8ScalarLength(scalar.codePointAt(0) ?? 0);
  }
  return length;
}

function utf16IndexAtUtf8Offset(value: string, offset: number): number {
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError("UTF-8 byte index is not a scalar boundary");
  }
  let byteOffset = 0;
  let utf16Index = 0;
  for (const scalar of value) {
    if (byteOffset === offset) return utf16Index;
    byteOffset += utf8ScalarLength(scalar.codePointAt(0) ?? 0);
    utf16Index += scalar.length;
    if (byteOffset > offset) {
      throw new RangeError("UTF-8 byte index is not a scalar boundary");
    }
  }
  if (byteOffset === offset) return utf16Index;
  throw new RangeError("UTF-8 byte index is not a scalar boundary");
}

export function sliceRustStringByUtf8Bytes(
  value: string,
  start: number,
  end: number,
): string {
  if (end < start) {
    throw new RangeError("UTF-8 byte index is not a scalar boundary");
  }
  const normalized = normalizeRustString(value);
  return normalized.slice(
    utf16IndexAtUtf8Offset(normalized, start),
    utf16IndexAtUtf8Offset(normalized, end),
  );
}
