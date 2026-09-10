import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { Game, GameVariant } from "../../src/entrypoints/mons-rules.js";

const PREFERENCES = ["fast", "normal", "pro"] as const;
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
  readonly source:
    | { readonly kind: "initial-variant"; readonly variant: string }
    | { readonly kind: "retained-fixture"; readonly label: string };
  readonly fen: string;
  readonly decisions: Readonly<Record<Preference, DecisionObservation>>;
};

type CorpusManifest = {
  readonly schemaVersion: number;
  readonly corpusVersion: string;
  readonly description: string;
  readonly fixedClockNowMs: number;
  readonly corpusFile: string;
  readonly corpusSha256: string;
  readonly corpusBytes: number;
  readonly orderedIdsSha256: string;
  readonly stateCount: number;
  readonly decisionCount: number;
  readonly preferenceOrder: readonly string[];
  readonly variantOrder: readonly string[];
  readonly selection: {
    readonly initialVariantStates: number;
    readonly retainedRegressionStates: number;
  };
  readonly changesFromV18: {
    readonly fastObservations: number;
    readonly normalObservations: number;
    readonly proObservations: number;
  };
  readonly candidate: {
    readonly sourceTreeSha256: string;
    readonly publicBundleSha256: string;
    readonly finalCandidateVerdictSha256: string;
    readonly independentResultAuditSha256: string;
  };
};

const EXPECTED_CHANGED_IDS = Object.freeze({
  fast: [],
  normal: ["initial-InnerWedgeManaRows", "initial-BentCenterManaRows"],
  pro: [],
} satisfies Readonly<Record<Preference, readonly string[]>>);

function archivedSuggestionKind(suggestion: ReturnType<Game["suggestMove"]>): number {
  return suggestion === undefined ? 0 : 3;
}

function archivedPlayResultKind(result: ReturnType<Game["playFen"]>): number {
  return result.kind === "invalid" ? 0 : 3;
}

const corpusDirectory = fileURLToPath(
  new URL("../../test-data/automove-decisions/v19/", import.meta.url),
);
const previousCorpusDirectory = fileURLToPath(
  new URL("../../test-data/automove-decisions/v18/", import.meta.url),
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
const previousStates = readFileSync(
  join(previousCorpusDirectory, "decisions.jsonl"),
  "utf8",
)
  .trimEnd()
  .split("\n")
  .map((line) => JSON.parse(line) as CorpusState);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

describe("automove decision corpus", () => {
  beforeAll(() => {
    vi.spyOn(globalThis.performance, "now").mockReturnValue(manifest.fixedClockNowMs);
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it("validates the v19 manifest and corpus identity", () => {
    const ids = states.map((state) => state.id);
    const initialStates = states.filter(
      (state) => state.source.kind === "initial-variant",
    );
    const retainedStates = states.filter(
      (state) => state.source.kind === "retained-fixture",
    );

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      corpusVersion: "automove-decisions-v19",
      description: expect.any(String),
      fixedClockNowMs: 0,
      corpusFile: "decisions.jsonl",
      preferenceOrder: PREFERENCES,
      variantOrder: Object.values(GameVariant),
      selection: {
        initialVariantStates: 12,
        retainedRegressionStates: 1,
      },
      changesFromV18: {
        fastObservations: 0,
        normalObservations: 2,
        proObservations: 0,
      },
      candidate: {
        sourceTreeSha256:
          "618a9f4fdb8edad0314eb3839bfc004eaafcb2c0f0d951728e8d994f627f5095",
        publicBundleSha256:
          "c0b48f0d6852325b0b25692a4fbedf1202f37b1f6df82a14d8952e578ac50314",
        finalCandidateVerdictSha256:
          "fc8e524ea875182cb9cabd60a4da64d40e9df029e5a5f1abf1d9807452e1bf8f",
        independentResultAuditSha256:
          "8143f11c6155bae8bfb5b7c935e3e5bb4b5d3175116a38294dab8e2d2a56785b",
      },
    });
    expect(corpusBytes.byteLength).toBe(manifest.corpusBytes);
    expect(sha256(corpusBytes)).toBe(manifest.corpusSha256);
    expect(states).toHaveLength(manifest.stateCount);
    expect(ids).toEqual([
      ...manifest.variantOrder.map((variant) => `initial-${variant}`),
      "retained-release",
    ]);
    expect(new Set(ids).size).toBe(states.length);
    expect(sha256(`${ids.join("\n")}\n`)).toBe(manifest.orderedIdsSha256);
    expect(initialStates).toHaveLength(manifest.selection.initialVariantStates);
    expect(initialStates.map((state) => state.variant)).toEqual(manifest.variantOrder);
    expect(retainedStates).toHaveLength(manifest.selection.retainedRegressionStates);
    expect(
      states.reduce((count, state) => count + Object.keys(state.decisions).length, 0),
    ).toBe(manifest.decisionCount);
    expect(
      states.every(
        (state) =>
          state.schemaVersion === manifest.schemaVersion &&
          isDeepStrictEqual(Object.keys(state.decisions), PREFERENCES),
      ),
    ).toBe(true);
  });

  it("pins the exact v18-to-v19 observation delta", () => {
    expect(
      states.map(({ id, variant, source, fen }) => ({
        id,
        variant,
        source,
        fen,
      })),
    ).toEqual(
      previousStates.map(({ id, variant, source, fen }) => ({
        id,
        variant,
        source,
        fen,
      })),
    );

    const previousById = new Map(previousStates.map((state) => [state.id, state]));
    const changedIds = Object.fromEntries(
      PREFERENCES.map((preference) => [
        preference,
        states
          .filter((state) => {
            const previous = previousById.get(state.id);
            return (
              previous === undefined ||
              !isDeepStrictEqual(
                state.decisions[preference],
                previous.decisions[preference],
              )
            );
          })
          .map((state) => state.id),
      ]),
    );

    expect(changedIds).toEqual(EXPECTED_CHANGED_IDS);
    expect(Object.values(changedIds).map((ids) => ids.length)).toEqual([
      manifest.changesFromV18.fastObservations,
      manifest.changesFromV18.normalObservations,
      manifest.changesFromV18.proObservations,
    ]);
  });

  it("replays all 39 decisions through the public API", () => {
    let decisionCount = 0;
    for (const state of states) {
      for (const preference of PREFERENCES) {
        decisionCount += 1;
        const expected = state.decisions[preference];
        const game = Game.fromFen(state.fen);
        expect(game, `${state.id} ${preference}: source FEN`).toBeDefined();
        if (game === undefined) continue;

        const before = game.toFen();
        const suggestion = game.suggestMove(preference);
        expect(
          archivedSuggestionKind(suggestion),
          `${state.id} ${preference}: output kind`,
        ).toBe(expected.outputKind);
        expect(suggestion?.inputFen, `${state.id} ${preference}: input`).toBe(
          expected.inputFen,
        );
        if (suggestion !== undefined) {
          expect(
            game.preview(suggestion.inputs),
            `${state.id} ${preference}: suggestion preview`,
          ).toEqual({
            kind: "complete",
            inputFen: suggestion.inputFen,
            events: suggestion.events,
          });
        }
        expect(game.toFen(), `${state.id} ${preference}: source mutation`).toBe(before);
        expect(game.toFen(), `${state.id} ${preference}: source state`).toBe(
          expected.sourceFenAfterSmartAutomove,
        );

        const replay = Game.fromFen(state.fen);
        expect(replay, `${state.id} ${preference}: replay FEN`).toBeDefined();
        if (replay === undefined) continue;
        const replayOutput = replay.playFen(expected.inputFen);
        expect(
          archivedPlayResultKind(replayOutput),
          `${state.id} ${preference}: replay output kind`,
        ).toBe(expected.replayOutputKind);
        expect(replay.toFen(), `${state.id} ${preference}: replay state`).toBe(
          expected.fenAfter,
        );
      }
    }
    expect(decisionCount).toBe(manifest.decisionCount);
  }, 300_000);
});
