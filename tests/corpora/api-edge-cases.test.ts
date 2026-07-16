import { createHash, type BinaryLike } from "node:crypto";
import { readFileSync } from "node:fs";
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
} from "../../src/entrypoints/mons-rules.js";

type ArtifactManifest = {
  readonly path: string;
  readonly recordCount: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly orderedIdsSha256: string;
  readonly firstId: string;
  readonly lastId: string;
};

type EdgeManifest = {
  readonly schemaVersion: number;
  readonly corpusVersion: string;
  readonly constants: {
    readonly classicInitialFen: string;
    readonly parserWhitespaceCodePoints: readonly number[];
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

type Operation =
  | "MonsGameModel.from_fen"
  | "MonsGameModel.item/square/remove_item"
  | "MonsGameModel.process_input_fen";

type ThrowObservation = {
  readonly kind: "throw";
  readonly errorName: string;
  readonly message: string;
};

type EdgeRecord = {
  readonly id: string;
  readonly category: string;
  readonly operation: Operation;
  readonly expectedParserWhitespace?: boolean | undefined;
  readonly inputSpec?:
    | {
        readonly replaceAsciiFieldSeparatorsWithCodePoint?: number;
      }
    | undefined;
  readonly inputFen?: string | undefined;
  readonly inputCodeUnits?: readonly number[] | undefined;
  readonly constructorArgs?:
    | {
        readonly iExpression: string;
        readonly jExpression: string;
      }
    | undefined;
  readonly expected: Readonly<Record<string, unknown>>;
  readonly policy: "exception" | "matching";
};

/* The immutable v1 payload keeps these stored field and category names. */
type StoredEdgeRecord = {
  readonly id: string;
  readonly category: string;
  readonly operation: Operation;
  readonly expectedRustWhitespace?: boolean;
  readonly inputSpec?: EdgeRecord["inputSpec"];
  readonly inputFen?: string;
  readonly inputCodeUnits?: readonly number[];
  readonly constructorArgs?: EdgeRecord["constructorArgs"];
  readonly legacy: Readonly<Record<string, unknown>>;
  readonly typescriptPolicy: {
    readonly kind: "approved-exception" | "match-legacy";
    readonly expected?: ThrowObservation;
  };
};

function adaptStoredRecord(record: StoredEdgeRecord): EdgeRecord {
  const category =
    record.category === "rust-whitespace"
      ? "parser-whitespace"
      : record.category === "wasm-string-normalization"
        ? "string-normalization"
        : record.category;
  const exception = record.typescriptPolicy.kind === "approved-exception";
  const exceptionObservation = record.typescriptPolicy.expected;
  if (exception && exceptionObservation === undefined) {
    throw new Error(`${record.id} is missing its approved exception`);
  }
  const expected = exception
    ? record.operation === "MonsGameModel.item/square/remove_item"
      ? { ...record.legacy, remove: exceptionObservation }
      : exceptionObservation
    : record.legacy;
  return {
    id: record.id,
    category,
    operation: record.operation,
    expectedParserWhitespace: record.expectedRustWhitespace,
    inputSpec: record.inputSpec,
    inputFen: record.inputFen,
    inputCodeUnits: record.inputCodeUnits,
    constructorArgs: record.constructorArgs,
    expected: expected ?? {},
    policy: exception ? "exception" : "matching",
  };
}

const corpusDirectory = path.resolve("test-data/compatibility-edge-cases/v1");
const manifest = JSON.parse(
  readFileSync(path.join(corpusDirectory, "manifest.json"), "utf8"),
) as EdgeManifest;

function sha256(value: BinaryLike): string {
  return createHash("sha256").update(value).digest("hex");
}

function readArtifact(artifact: ArtifactManifest): readonly EdgeRecord[] {
  const bytes = readFileSync(path.resolve(artifact.path));
  expect(bytes.byteLength).toBe(artifact.bytes);
  expect(sha256(bytes)).toBe(artifact.sha256);

  const text = bytes.toString("utf8");
  expect(text.endsWith("\n")).toBe(true);
  const lines = text.slice(0, -1).split("\n");
  expect(lines).toHaveLength(artifact.recordCount);
  const stored = lines.map((line) => {
    const record = JSON.parse(line) as StoredEdgeRecord;
    expect(JSON.stringify(record)).toBe(line);
    return record;
  });
  const ids = stored.map(({ id }) => id);
  expect(ids[0]).toBe(artifact.firstId);
  expect(ids.at(-1)).toBe(artifact.lastId);
  expect(sha256(`${ids.join("\n")}\n`)).toBe(artifact.orderedIdsSha256);
  return stored.map(adaptStoredRecord);
}

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

describe("public API edge-case corpus", () => {
  const records = manifest.artifacts.flatMap(readArtifact);

  it("pins artifact bytes, record order, and aggregate metadata", () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.corpusVersion).toBe("api-edge-cases-v1");
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
    expect(records.filter(({ policy }) => policy === "matching")).toHaveLength(
      manifest.statistics.matchingCaseCount,
    );
    expect(records.filter(({ policy }) => policy === "exception")).toHaveLength(
      manifest.statistics.approvedExceptionCount,
    );
  });

  it("pins the parser whitespace set and explicit exclusions", () => {
    const whitespaceRecords = records.filter(
      ({ category }) => category === "parser-whitespace",
    );
    const codePoints = (expected: boolean) =>
      whitespaceRecords
        .filter(({ expectedParserWhitespace }) =>
          expected
            ? expectedParserWhitespace
            : expectedParserWhitespace === false,
        )
        .map(
          ({ inputSpec }) =>
            inputSpec?.replaceAsciiFieldSeparatorsWithCodePoint,
        );

    expect(codePoints(true)).toEqual(
      manifest.constants.parserWhitespaceCodePoints,
    );
    expect(codePoints(false)).toEqual(
      manifest.constants.explicitNonWhitespaceCodePoints,
    );
  });

  describe("public API replay", () => {
    for (const record of records) {
      it(record.id, () => {
        expect(executeRecord(record)).toEqual(record.expected);
      });
    }
  });
});
