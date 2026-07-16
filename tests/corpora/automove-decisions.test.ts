import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { MonsGameModel } from "../../src/entrypoints/mons-rules.js";

const PREFERENCES = ["fast", "normal", "pro"] as const;
const VARIANTS = [
  "Classic",
  "SwappedManaRows",
  "OffsetArcManaRows",
  "CenterSpokeManaRows",
  "AlternatingManaRows",
  "InnerWedgeManaRows",
  "OuterWedgeManaRows",
  "BentCenterManaRows",
  "OuterEdgeManaRows",
  "SplitFlankManaRows",
  "ForwardBridgeManaRows",
  "CornerChainManaRows",
] as const;

type Preference = (typeof PREFERENCES)[number];

type DecisionObservation = {
  readonly inputFen: string;
  readonly outputKind: number;
  readonly sourceFenAfterSmartAutomove: string;
  readonly replayOutputKind: number;
  readonly fenAfter: string;
};

type CorpusState = {
  readonly schemaVersion: number;
  readonly id: string;
  readonly variant: string;
  readonly fen: string;
  readonly decisions: Readonly<Record<Preference, DecisionObservation>>;
};

type CorpusManifest = {
  readonly schemaVersion: number;
  readonly corpusVersion: string;
  readonly fixedClockNowMs: number;
  readonly corpusFile: string;
  readonly corpusSha256: string;
  readonly corpusBytes: number;
  readonly orderedIdsSha256: string;
  readonly stateCount: number;
  readonly decisionCount: number;
  readonly internalObservations: {
    readonly file: string;
    readonly sha256: string;
    readonly bytes: number;
    readonly lineCount: number;
    readonly archivalOnly: boolean;
  };
  readonly preferenceOrder: readonly string[];
  readonly variantOrder: readonly string[];
  readonly selection: {
    readonly initialVariantStates: number;
    readonly retainedRegressionStates: number;
  };
};

const corpusDirectory = fileURLToPath(
  new URL("../../test-data/automove-decisions/v1/", import.meta.url),
);
const manifest = JSON.parse(
  readFileSync(join(corpusDirectory, "manifest.json"), "utf8"),
) as CorpusManifest;
const corpusBytes = readFileSync(join(corpusDirectory, manifest.corpusFile));
const states = corpusBytes
  .toString("utf8")
  .trimEnd()
  .split("\n")
  .map((line) => JSON.parse(line) as CorpusState);
const internalObservationBytes = readFileSync(
  join(corpusDirectory, manifest.internalObservations.file),
);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("automove decision corpus", () => {
  beforeAll(() => {
    vi.spyOn(globalThis.performance, "now").mockReturnValue(
      manifest.fixedClockNowMs,
    );
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("pins the public decisions and archived observation payload", () => {
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      corpusVersion: "automove-decisions-v1",
      fixedClockNowMs: 0,
      stateCount: 13,
      decisionCount: 39,
      selection: { initialVariantStates: 12, retainedRegressionStates: 1 },
    });
    expect(manifest.preferenceOrder).toEqual(PREFERENCES);
    expect(manifest.variantOrder).toEqual(VARIANTS);
    expect(corpusBytes.byteLength).toBe(manifest.corpusBytes);
    expect(sha256(corpusBytes)).toBe(manifest.corpusSha256);
    expect(states).toHaveLength(manifest.stateCount);
    expect(
      states.slice(0, VARIANTS.length).map(({ variant }) => variant),
    ).toEqual(VARIANTS);

    const ids = states.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sha256(`${ids.join("\n")}\n`)).toBe(manifest.orderedIdsSha256);
    expect(
      states.reduce<number>(
        (count: number, state: CorpusState) =>
          count + Object.keys(state.decisions).length,
        0,
      ),
    ).toBe(manifest.decisionCount);
    for (const state of states) {
      expect(state.schemaVersion, state.id).toBe(manifest.schemaVersion);
      expect(Object.keys(state.decisions), state.id).toEqual(PREFERENCES);
    }

    expect(manifest.internalObservations.archivalOnly).toBe(true);
    expect(internalObservationBytes.byteLength).toBe(
      manifest.internalObservations.bytes,
    );
    expect(sha256(internalObservationBytes)).toBe(
      manifest.internalObservations.sha256,
    );
    expect(
      internalObservationBytes.toString("utf8").trimEnd().split("\n"),
    ).toHaveLength(manifest.internalObservations.lineCount);
  });

  it("replays all 39 decisions through the public API", () => {
    let decisionCount = 0;
    for (const state of states) {
      for (const preference of PREFERENCES) {
        decisionCount += 1;
        const expected = state.decisions[preference];
        const game = MonsGameModel.from_fen(state.fen);
        expect(game, `${state.id} ${preference}: source FEN`).toBeDefined();
        if (game === undefined) continue;

        const before = game.fen();
        const output = game.smartAutomove(preference);
        expect(output.kind, `${state.id} ${preference}: output kind`).toBe(
          expected.outputKind,
        );
        expect(output.input_fen(), `${state.id} ${preference}: input`).toBe(
          expected.inputFen,
        );
        expect(game.fen(), `${state.id} ${preference}: source mutation`).toBe(
          before,
        );
        expect(game.fen(), `${state.id} ${preference}: source state`).toBe(
          expected.sourceFenAfterSmartAutomove,
        );

        const replay = MonsGameModel.from_fen(state.fen);
        expect(replay, `${state.id} ${preference}: replay FEN`).toBeDefined();
        if (replay === undefined) continue;
        const replayOutput = replay.process_input_fen(expected.inputFen);
        expect(
          replayOutput.kind,
          `${state.id} ${preference}: replay output kind`,
        ).toBe(expected.replayOutputKind);
        expect(replay.fen(), `${state.id} ${preference}: replay state`).toBe(
          expected.fenAfter,
        );
      }
    }
    expect(decisionCount).toBe(manifest.decisionCount);
  }, 300_000);
});
