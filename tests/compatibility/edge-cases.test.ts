import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  GameVariant,
  type ItemModel,
  Location,
  type ManaModel,
  type Mon,
  MonsGameModel,
  type SquareModel,
} from "../../src/entrypoints/mons-rust.js";

const EXPECTED_MANIFEST_SHA256 =
  "d926b6a258b2690db4b1649d49cf2d1253abd074bad5c1688c09ce5894937448";

type ArtifactManifest = {
  readonly path: string;
  readonly recordCount: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly orderedIdsSha256: string;
  readonly firstId: string;
  readonly lastId: string;
};

type CompatibilityManifest = {
  readonly schemaVersion: number;
  readonly corpusVersion: string;
  readonly source: {
    readonly baselineCommit: string;
    readonly packageName: string;
    readonly packageVersion: string;
  };
  readonly constants: {
    readonly classicInitialFen: string;
    readonly rustWhitespaceCodePoints: readonly number[];
    readonly explicitNonWhitespaceCodePoints: readonly number[];
  };
  readonly statistics: {
    readonly recordCount: number;
    readonly matchingCaseCount: number;
    readonly approvedExceptionCount: number;
    readonly categoryCounts: Readonly<Record<string, number>>;
  };
  readonly artifacts: readonly ArtifactManifest[];
  readonly aggregate: {
    readonly artifactBytes: number;
    readonly recordCount: number;
    readonly orderedIdsSha256: string;
  };
};

type EdgeRecord = {
  readonly id: string;
  readonly category: string;
  readonly operation:
    | "MonsGameModel.from_fen"
    | "MonsGameModel.item/square/remove_item"
    | "MonsGameModel.process_input_fen";
  readonly expectedRustWhitespace?: boolean;
  readonly inputSpec?: {
    readonly replaceAsciiFieldSeparatorsWithCodePoint?: number;
  };
  readonly inputFen?: string;
  readonly inputCodeUnits?: readonly number[];
  readonly constructorArgs?: {
    readonly iExpression: string;
    readonly jExpression: string;
  };
  readonly legacy: Readonly<Record<string, unknown>>;
  readonly typescriptPolicy: {
    readonly kind: "approved-exception" | "match-legacy";
    readonly expected?: {
      readonly kind: "throw";
      readonly errorName: string;
      readonly message: string;
    };
  };
};

const corpusDirectory = path.resolve("test-data/compatibility-edge-cases/v1");
const manifestBytes = fs.readFileSync(
  path.join(corpusDirectory, "manifest.json"),
);
const manifest = JSON.parse(
  manifestBytes.toString("utf8"),
) as CompatibilityManifest;

function sha256(value: crypto.BinaryLike): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readArtifact(artifact: ArtifactManifest): readonly EdgeRecord[] {
  const bytes = fs.readFileSync(path.resolve(artifact.path));
  expect(bytes.byteLength).toBe(artifact.bytes);
  expect(sha256(bytes)).toBe(artifact.sha256);

  const text = bytes.toString("utf8");
  expect(text.endsWith("\n")).toBe(true);
  const lines = text.slice(0, -1).split("\n");
  expect(lines).toHaveLength(artifact.recordCount);
  const records = lines.map((line) => {
    const record = JSON.parse(line) as EdgeRecord;
    expect(JSON.stringify(record)).toBe(line);
    return record;
  });
  const ids = records.map(({ id }) => id);
  expect(ids[0]).toBe(artifact.firstId);
  expect(ids.at(-1)).toBe(artifact.lastId);
  expect(sha256(`${ids.join("\n")}\n`)).toBe(artifact.orderedIdsSha256);
  return records;
}

type ThrowObservation = {
  readonly kind: "throw";
  readonly errorName: string;
  readonly message: string;
};

function throwObservation(error: unknown): ThrowObservation {
  if (error instanceof Error) {
    return { kind: "throw", errorName: error.name, message: error.message };
  }
  return {
    kind: "throw",
    errorName: typeof error,
    message: String(error),
  };
}

function monObservation(
  mon: Mon | undefined,
): Readonly<Record<string, unknown>> | null {
  return mon === undefined
    ? null
    : { kind: mon.kind, color: mon.color, cooldown: mon.cooldown };
}

function manaObservation(
  mana: ManaModel | undefined,
): Readonly<Record<string, unknown>> | null {
  return mana === undefined ? null : { kind: mana.kind, color: mana.color };
}

function itemObservation(
  item: ItemModel | undefined,
): Readonly<Record<string, unknown>> | null {
  if (item === undefined) return null;
  return {
    kind: item.kind,
    mon: monObservation(item.mon),
    mana: manaObservation(item.mana),
    consumable: item.consumable ?? null,
  };
}

function squareObservation(
  square: SquareModel,
): Readonly<Record<string, unknown>> {
  return {
    kind: square.kind,
    color: square.color ?? null,
    monKind: square.mon_kind ?? null,
  };
}

function required<T>(value: T | undefined, description: string): T {
  if (value === undefined) throw new Error(`missing ${description}`);
  return value;
}

function fromFenInput(record: EdgeRecord): string {
  if (record.inputFen !== undefined) return record.inputFen;
  const codePoint = required(
    record.inputSpec?.replaceAsciiFieldSeparatorsWithCodePoint,
    `${record.id} whitespace code point`,
  );
  return manifest.constants.classicInitialFen.replaceAll(
    " ",
    String.fromCodePoint(codePoint),
  );
}

function executeFromFen(record: EdgeRecord): Readonly<Record<string, unknown>> {
  try {
    const game = MonsGameModel.from_fen(fromFenInput(record));
    return game === undefined
      ? { kind: "undefined" }
      : { kind: "accepted", normalizedFen: game.fen() };
  } catch (error) {
    return throwObservation(error);
  }
}

function executeProcessInputFen(
  record: EdgeRecord,
): Readonly<Record<string, unknown>> {
  const input = String.fromCharCode(
    ...required(record.inputCodeUnits, `${record.id} input code units`),
  );
  const game = MonsGameModel.new(GameVariant.Classic);
  const before = game.fen();
  const output = game.process_input_fen(input);
  const echoedInput = output.input_fen();
  return {
    outputKind: output.kind,
    echoedInput,
    echoedCodePoints: Array.from(
      echoedInput,
      (character) => character.codePointAt(0) ?? 0,
    ),
    stateChanged: game.fen() !== before,
  };
}

const SPECIAL_CONSTRUCTOR_VALUES: Readonly<Record<string, number>> =
  Object.freeze({
    "2**31": 2 ** 31,
    "2**32": 2 ** 32,
    "-(2**32)": -(2 ** 32),
    INT_MAX: 2_147_483_647,
    INT_MIN: -2_147_483_648,
    MAX_ALIAS_J: -2_147_483_634,
    MIN_ALIAS_J: -2_147_483_645,
    "Number.MAX_VALUE": Number.MAX_VALUE,
  });

function constructorValue(expression: string): number {
  if (Object.hasOwn(SPECIAL_CONSTRUCTOR_VALUES, expression)) {
    return required(
      SPECIAL_CONSTRUCTOR_VALUES[expression],
      `constructor value ${expression}`,
    );
  }
  if (!/^-?(?:\d+(?:\.\d+)?|Infinity|NaN)$/u.test(expression)) {
    throw new Error(`unsupported constructor expression: ${expression}`);
  }
  return Number(expression);
}

function executeCoordinateCase(
  record: EdgeRecord,
): Readonly<Record<string, unknown>> {
  const constructorArgs = required(
    record.constructorArgs,
    `${record.id} constructor arguments`,
  );
  const location = new Location(
    constructorValue(constructorArgs.iExpression),
    constructorValue(constructorArgs.jExpression),
  );
  const signedLinearIndex = (Math.imul(location.i, 11) + location.j) | 0;
  const unsignedLinearIndex = signedLinearIndex >>> 0;
  const game = MonsGameModel.new(GameVariant.Classic);
  const item = itemObservation(game.item(location));
  const square = squareObservation(game.square(location));
  const targetItemBeforeRemove =
    unsignedLinearIndex <= 120
      ? itemObservation(
          game.item(
            new Location(
              Math.trunc(unsignedLinearIndex / 11),
              unsignedLinearIndex % 11,
            ),
          ),
        )
      : null;
  const fenBeforeRemove = game.fen();
  let remove: Readonly<Record<string, unknown>>;
  try {
    game.remove_item(location);
    remove = {
      kind: "returned",
      stateChanged: game.fen() !== fenBeforeRemove,
      fenAfter: game.fen(),
    };
  } catch (error) {
    remove = throwObservation(error);
    expect(game.fen(), `${record.id}: failed write mutated state`).toBe(
      fenBeforeRemove,
    );
  }

  return {
    coercedLocation: { i: location.i, j: location.j },
    signedLinearIndex,
    unsignedLinearIndex,
    item,
    square,
    targetItemBeforeRemove,
    remove,
  };
}

function expectedObservation(
  record: EdgeRecord,
): Readonly<Record<string, unknown>> {
  if (record.typescriptPolicy.kind === "match-legacy") return record.legacy;
  const expected = required(
    record.typescriptPolicy.expected,
    `${record.id} approved TypeScript exception`,
  );
  return record.operation === "MonsGameModel.item/square/remove_item"
    ? { ...record.legacy, remove: expected }
    : expected;
}

function executeRecord(record: EdgeRecord): Readonly<Record<string, unknown>> {
  switch (record.operation) {
    case "MonsGameModel.from_fen":
      return executeFromFen(record);
    case "MonsGameModel.process_input_fen":
      return executeProcessInputFen(record);
    case "MonsGameModel.item/square/remove_item":
      return executeCoordinateCase(record);
  }
}

describe("compatibility edge-case corpus", () => {
  const recordsByArtifact = manifest.artifacts.map((artifact) => ({
    artifact,
    records: readArtifact(artifact),
  }));
  const records = recordsByArtifact.flatMap(({ records: entries }) => entries);

  it("pins its baseline, artifact bytes, record order, and aggregate metadata", () => {
    expect(sha256(manifestBytes)).toBe(EXPECTED_MANIFEST_SHA256);
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.corpusVersion).toBe("compatibility-edge-cases-v1");
    expect(manifest.source).toMatchObject({
      baselineCommit: "55c9e97f8643e3edba7249a1daff1f2b83fccad9",
      packageName: "mons-rust",
      packageVersion: "0.1.135",
    });
    expect(records).toHaveLength(manifest.statistics.recordCount);
    expect(records).toHaveLength(manifest.aggregate.recordCount);
    expect(
      manifest.artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0),
    ).toBe(manifest.aggregate.artifactBytes);

    const ids = records.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sha256(`${ids.join("\n")}\n`)).toBe(
      manifest.aggregate.orderedIdsSha256,
    );

    const categoryCounts: Record<string, number> = {};
    for (const record of records) {
      categoryCounts[record.category] =
        (categoryCounts[record.category] ?? 0) + 1;
    }
    expect(categoryCounts).toEqual(manifest.statistics.categoryCounts);
  });

  it("freezes the exact Rust whitespace set and important exclusions", () => {
    const whitespaceRecords = records.filter(
      ({ category }) => category === "rust-whitespace",
    );
    const codePoints = (expected: boolean) =>
      whitespaceRecords
        .filter(({ expectedRustWhitespace }) =>
          expected ? expectedRustWhitespace : expectedRustWhitespace === false,
        )
        .map(
          ({ inputSpec }) =>
            inputSpec?.replaceAsciiFieldSeparatorsWithCodePoint,
        );

    expect(codePoints(true)).toEqual(
      manifest.constants.rustWhitespaceCodePoints,
    );
    expect(codePoints(false)).toEqual(
      manifest.constants.explicitNonWhitespaceCodePoints,
    );
    expect(manifest.constants.rustWhitespaceCodePoints).toContain(0x85);
    expect(manifest.constants.rustWhitespaceCodePoints).not.toContain(0xfeff);
    expect(manifest.constants.explicitNonWhitespaceCodePoints).toContain(
      0xfeff,
    );
    for (const record of whitespaceRecords) {
      if (record.expectedRustWhitespace === true) {
        expect(record.legacy).toMatchObject({
          kind: "accepted",
          normalizedFen: manifest.constants.classicInitialFen,
        });
      } else {
        expect(record.legacy).toEqual({ kind: "undefined" });
      }
    }
  });

  it("covers every surrogate normalization class and UTF-8 item boundary", () => {
    const normalizationIds = records
      .filter(({ category }) => category === "wasm-string-normalization")
      .map(({ id }) => id);
    expect(normalizationIds).toEqual([
      "normalization-ascii",
      "normalization-bom",
      "normalization-nel",
      "normalization-valid-pair",
      "normalization-lone-high",
      "normalization-lone-low",
      "normalization-high-then-ascii",
      "normalization-ascii-then-low",
      "normalization-high-high",
      "normalization-low-high",
      "normalization-pair-then-high",
      "normalization-bom-then-high",
    ]);
    expect(
      records.find(({ id }) => id === "normalization-valid-pair")
        ?.inputCodeUnits,
    ).toEqual([0xd83d, 0xde00]);
    expect(
      records.find(({ id }) => id === "normalization-bom-then-high")
        ?.inputCodeUnits,
    ).toEqual([0xfeff, 0xd800]);
    expect(
      records.find(({ id }) => id === "normalization-lone-high")?.legacy,
    ).toMatchObject({ echoedCodePoints: [0xfffd] });
    expect(
      records.find(({ id }) => id === "normalization-valid-pair")?.legacy,
    ).toMatchObject({ echoedCodePoints: [0x1f600] });
    expect(
      records.find(({ id }) => id === "normalization-bom-then-high")?.legacy,
    ).toMatchObject({ echoedCodePoints: [0xfeff, 0xfffd] });

    const utf8Ids = records
      .filter(({ category }) => category === "utf8-item")
      .map(({ id }) => id);
    expect(utf8Ids).toContain("ascii-two-byte-boundary-trap");
    expect(utf8Ids).toContain("two-byte-ascii-safe");
    expect(utf8Ids).toContain("three-byte-boundary-trap");
    expect(utf8Ids).toContain("valid-pair-four-byte");
    expect(utf8Ids).toContain("reversed-surrogates-six-byte");
    expect(utf8Ids).toContain("nul-suffix");
  });

  it("distinguishes matching observations from approved RangeError policy", () => {
    const matching = records.filter(
      ({ typescriptPolicy }) => typescriptPolicy.kind === "match-legacy",
    );
    const exceptions = records.filter(
      ({ typescriptPolicy }) => typescriptPolicy.kind === "approved-exception",
    );
    expect(matching).toHaveLength(manifest.statistics.matchingCaseCount);
    expect(exceptions).toHaveLength(manifest.statistics.approvedExceptionCount);

    const allowedMessages = new Set([
      "board FEN item index is out of bounds",
      "UTF-8 byte index is not a scalar boundary",
      "location index is out of bounds",
    ]);
    for (const record of exceptions) {
      const legacyThrow = record.legacy["remove"] ?? record.legacy;
      expect(legacyThrow).toMatchObject({
        kind: "throw",
        errorName: "RuntimeError",
        message: "unreachable",
      });
      expect(record.typescriptPolicy.expected?.errorName).toBe("RangeError");
      expect(
        allowedMessages.has(record.typescriptPolicy.expected?.message ?? ""),
      ).toBe(true);
    }
  });

  it("covers permissive aliases and both ordinary and overflowed bounds", () => {
    expect(
      records.filter(({ category }) => category === "board-index-alias"),
    ).toHaveLength(3);
    expect(
      records.filter(({ category }) => category === "board-index-oob"),
    ).toHaveLength(2);
    expect(
      records.filter(({ category }) => category === "wrapped-alias"),
    ).toHaveLength(9);
    expect(
      records.filter(({ category }) => category === "wrapped-oob"),
    ).toHaveLength(6);
    expect(records.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "cross-row-11",
        "row0-run99-alias",
        "row2-run99-oob",
        "negative-i-alias",
        "int-max-overflow-alias",
        "int-min-overflow-alias",
        "negative-i-oob",
        "int-max-oob",
        "int-min-oob",
      ]),
    );
  });

  describe("public API parity replay", () => {
    for (const record of records) {
      it(record.id, () => {
        expect(executeRecord(record)).toEqual(expectedObservation(record));
      });
    }
  });
});
