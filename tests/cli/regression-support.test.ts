import { describe, expect, it } from "vitest";

import {
  decodeUtf8Strict,
  errorMessage,
  fail,
  parseCanonicalRuleTestCase,
  terminalEventMembershipError,
} from "../../src/cli/regression-support.js";

describe("CLI failure and UTF-8 support", () => {
  it("preserves Error messages and stringifies other thrown values", () => {
    expect(errorMessage(new RangeError("out of range"))).toBe("out of range");
    expect(errorMessage("plain failure")).toBe("plain failure");
    expect(errorMessage(17)).toBe("17");
  });

  it("throws ordinary errors with the supplied diagnostic", () => {
    expect(() => fail("corpus mismatch")).toThrow(new Error("corpus mismatch"));
  });

  it("strictly decodes independent complete UTF-8 records", () => {
    const bom = [0xef, 0xbb, 0xbf];
    expect(decodeUtf8Strict(Uint8Array.from([...bom, 0x61]))).toBe("a");
    expect(decodeUtf8Strict(Uint8Array.from([...bom, 0x62]))).toBe("b");
    expect(() => decodeUtf8Strict(Uint8Array.from([0xc3]))).toThrow(TypeError);
    expect(decodeUtf8Strict(Uint8Array.from([0x63]))).toBe("c");
  });
});

describe("canonical rules records", () => {
  const canonical =
    '{"fenAfter":"after","fenBefore":"before","inputFen":"l1,2","outputFen":"i"}';

  it("accepts only the exact compact key order and string fields", () => {
    expect(parseCanonicalRuleTestCase(canonical)).toEqual({
      fenAfter: "after",
      fenBefore: "before",
      inputFen: "l1,2",
      outputFen: "i",
    });
    expect(() =>
      parseCanonicalRuleTestCase(
        '{"fenBefore":"before","fenAfter":"after","inputFen":"l1,2","outputFen":"i"}',
      ),
    ).toThrow(
      'fixture keys must be ["fenAfter","fenBefore","inputFen","outputFen"]',
    );
    expect(() =>
      parseCanonicalRuleTestCase(
        '{"fenAfter":"after","fenBefore":"before","inputFen":1,"outputFen":"i"}',
      ),
    ).toThrow("all fixture fields must be JSON strings");
    expect(() =>
      parseCanonicalRuleTestCase(
        '{ "fenAfter":"after","fenBefore":"before","inputFen":"l1,2","outputFen":"i" }',
      ),
    ).toThrow("fixture is not canonical minified JSON");
  });

  it("wraps JSON parser diagnostics without changing their message", () => {
    let parserMessage = "";
    try {
      JSON.parse("{");
    } catch (error) {
      parserMessage = errorMessage(error);
    }
    expect(() => parseCanonicalRuleTestCase("{")).toThrow(
      `invalid JSON: ${parserMessage}`,
    );
  });
});

describe("terminal event membership", () => {
  it("allows nonterminal events around the one expected terminal event", () => {
    expect(
      terminalEventMembershipError(
        [{ kind: "mon-move" }, { kind: "next-turn" }, { kind: "mon-awake" }],
        "next-turn",
      ),
    ).toBeUndefined();
    expect(
      terminalEventMembershipError(
        [{ kind: "mana-scored" }, { kind: "game-over" }],
        "game-over",
      ),
    ).toBeUndefined();
  });

  it("returns the established diagnostics for missing or extra terminals", () => {
    expect(
      terminalEventMembershipError([{ kind: "game-over" }], undefined),
    ).toBe("a non-final input emitted a turn-terminal event");
    expect(
      terminalEventMembershipError(
        [{ kind: "next-turn" }, { kind: "next-turn" }],
        "next-turn",
      ),
    ).toBe(
      "expected exactly one next-turn and no game-over; got 2 next-turn and 0 game-over",
    );
    expect(terminalEventMembershipError([], "game-over")).toBe(
      "expected exactly one game-over and no next-turn; got 0 game-over and 0 next-turn",
    );
  });
});
