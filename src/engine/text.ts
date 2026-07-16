/**
 * Convert a JavaScript UTF-16 string to a well-formed Unicode scalar sequence.
 * Valid surrogate pairs and every non-surrogate code unit are preserved;
 * unpaired surrogates are replaced individually with U+FFFD.
 */
export function toWellFormedString(value: string): string {
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

/** The parser's stable Unicode whitespace set. */
export function isParserWhitespaceCodePoint(codePoint: number): boolean {
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

export function splitParserWhitespace(value: string): string[] {
  const normalized = toWellFormedString(value);
  const result: string[] = [];
  let field = "";

  for (const scalar of normalized) {
    const codePoint = scalar.codePointAt(0);
    if (codePoint !== undefined && isParserWhitespaceCodePoint(codePoint)) {
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

export function utf8ByteLength(value: string): number {
  let length = 0;
  for (const scalar of toWellFormedString(value)) {
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

export function sliceByUtf8Bytes(
  value: string,
  start: number,
  end: number,
): string {
  if (end < start) {
    throw new RangeError("UTF-8 byte index is not a scalar boundary");
  }
  const normalized = toWellFormedString(value);
  return normalized.slice(
    utf16IndexAtUtf8Offset(normalized, start),
    utf16IndexAtUtf8Offset(normalized, end),
  );
}

export function trimParserWhitespace(value: string): string {
  const scalars = Array.from(toWellFormedString(value));
  let start = 0;
  let end = scalars.length;

  while (
    start < end &&
    isParserWhitespaceCodePoint(scalars[start]?.codePointAt(0) ?? -1)
  ) {
    start += 1;
  }
  while (
    end > start &&
    isParserWhitespaceCodePoint(scalars[end - 1]?.codePointAt(0) ?? -1)
  ) {
    end -= 1;
  }
  return scalars.slice(start, end).join("");
}
