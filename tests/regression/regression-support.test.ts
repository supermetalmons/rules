import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { forEachByteLine } from "../../src/cli/byte-lines.js";
import {
  fnv1a64,
  parseCanonicalRuleTestCase,
  terminalEventMembershipError,
} from "../../src/cli/regression-support.js";

describe("fnv1a64", () => {
  it.each([
    ["", "cbf29ce484222325"],
    ["a", "af63dc4c8601ec8c"],
    ["hello", "a430d84680aabd0b"],
  ])("matches the standard vector for %j", (input, expected) => {
    expect(fnv1a64(Buffer.from(input)).toString(16).padStart(16, "0")).toBe(
      expected,
    );
  });
});

describe("parseCanonicalRuleTestCase", () => {
  const canonical =
    '{"fenAfter":"after","fenBefore":"before","inputFen":"l1,2","outputFen":"i"}';

  it("accepts the exact compact field order", () => {
    expect(parseCanonicalRuleTestCase(canonical)).toEqual({
      fenAfter: "after",
      fenBefore: "before",
      inputFen: "l1,2",
      outputFen: "i",
    });
  });

  it("rejects reordered or non-string fields", () => {
    expect(() =>
      parseCanonicalRuleTestCase(
        '{"fenBefore":"before","fenAfter":"after","inputFen":"","outputFen":"i"}',
      ),
    ).toThrow(/keys/u);
    expect(() =>
      parseCanonicalRuleTestCase(
        '{"fenAfter":"after","fenBefore":"before","inputFen":1,"outputFen":"i"}',
      ),
    ).toThrow(/strings/u);
  });
});

describe("forEachByteLine", () => {
  it("preserves split byte lines and reports artifact metrics", async () => {
    const chunks = [Buffer.from("alpha\nbe"), Buffer.from("ta\n")];
    const lines: string[] = [];
    const summary = await forEachByteLine(Readable.from(chunks), (line) => {
      lines.push(line.toString("utf8"));
    });

    expect(lines).toEqual(["alpha", "beta"]);
    expect(summary).toEqual({
      bytes: 11,
      containsCarriageReturn: false,
      endsWithLf: true,
      lineCount: 2,
      sha256: createHash("sha256").update("alpha\nbeta\n").digest("hex"),
    });
  });
});

describe("terminalEventMembershipError", () => {
  it("allows MonAwake after NextTurn", () => {
    expect(
      terminalEventMembershipError(
        [{ kind: "next-turn" }, { kind: "mon-awake" }],
        "next-turn",
      ),
    ).toBeUndefined();
  });

  it("rejects terminal events on non-final inputs", () => {
    expect(
      terminalEventMembershipError([{ kind: "game-over" }], undefined),
    ).toMatch(/non-final/u);
  });
});
