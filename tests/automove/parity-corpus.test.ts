import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { MonsGameModel } from "../../src/api/mons-game-model.js";
import {
  AUTOMOVE_SELECTOR_BUDGET_MS,
  resetDeadlineStateForTesting,
  withAutomoveClock,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";
import { clearReplyRiskCache } from "../../src/automove/reply-risk.js";
import {
  rankRootCandidates,
  searchConfigForPreference,
} from "../../src/automove/root-candidates.js";
import { installAutomoveRuntime } from "../../src/automove/runtime.js";
import {
  clearSearchCaches,
  searchRootCandidates,
} from "../../src/automove/search.js";
import { clearTurnEnginePlanCache } from "../../src/automove/turn-engine.js";
import { GameVariant } from "../../src/engine/config.js";
import { inputArrayFen } from "../../src/engine/fen.js";
import { MonsGame } from "../../src/engine/game.js";

const PREFERENCES = ["fast", "normal", "pro"] as const;
const EXPECTED_MANIFEST_SHA256 =
  "bb5a72ee45b0c558ee28ec2ef7901eec3268ec57bd3c1dd163b7a0747a940bb2";
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
  readonly source: Readonly<Record<string, unknown>>;
  readonly fen: string;
  readonly decisions: Readonly<Record<Preference, DecisionObservation>>;
};

type CorpusManifest = {
  readonly schemaVersion: number;
  readonly corpusVersion: string;
  readonly baselineCommit: string;
  readonly baselinePackage: {
    readonly name: string;
    readonly version: string;
  };
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
    readonly configCount: number;
    readonly rootCount: number;
    readonly searchScoreCount: number;
    readonly selectionCount: number;
    readonly scenarioOrder: readonly string[];
  };
  readonly preferenceOrder: readonly string[];
  readonly variantOrder: readonly string[];
  readonly selection: {
    readonly initialVariantStates: number;
    readonly retainedReleaseAndCuratedStates: number;
    readonly classicRecord0FirstThreeTurns: boolean;
    readonly nonClassicFirstRecordMidpointAndLate: boolean;
  };
};

const corpusDirectory = fileURLToPath(
  new URL("../../test-data/automove-decisions/v1/", import.meta.url),
);
const manifestBytes = readFileSync(join(corpusDirectory, "manifest.json"));
const manifest = JSON.parse(manifestBytes.toString("utf8")) as CorpusManifest;
const corpusBytes = readFileSync(join(corpusDirectory, manifest.corpusFile));
const corpusText = corpusBytes.toString("utf8");
const states = corpusText
  .trimEnd()
  .split("\n")
  .map((line) => JSON.parse(line) as CorpusState);
const internalObservationBytes = readFileSync(
  join(corpusDirectory, manifest.internalObservations.file),
);
const internalObservationLines = internalObservationBytes
  .toString("utf8")
  .trimEnd()
  .split("\n");

const INTERNAL_ROOT_LIMIT = 12;
const TACTICAL_FIXTURE_FEN =
  "0 0 w 0 0 0 0 0 2 n11/n11/n11/n11/n04y0xn04/n05E0xn05/n06D0xn04/n11/n11/n11/n11";
const INTERNAL_PREFERENCES = [
  { preference: "fast", label: "Fast" },
  { preference: "normal", label: "Normal" },
  { preference: "pro", label: "Pro" },
] as const;

function corpusStateFen(id: string): string {
  const state = states.find((candidate) => candidate.id === id);
  if (state === undefined) {
    throw new Error(`missing automove parity corpus state: ${id}`);
  }
  return state.fen;
}

function gameFromFen(fen: string, scenario: string): MonsGame {
  const game = MonsGame.fromFen(fen);
  if (game === undefined) {
    throw new Error(`internal selector scenario FEN must parse: ${scenario}`);
  }
  return game;
}

const internalScenarios = [
  {
    name: "initial",
    createGame: () => new MonsGame(false, GameVariant.Classic),
  },
  {
    name: "release",
    createGame: () =>
      gameFromFen(corpusStateFen("retained-release"), "release"),
  },
  {
    name: "tactical",
    createGame: () => gameFromFen(TACTICAL_FIXTURE_FEN, "tactical"),
  },
] as const;

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function resetAutomoveState(): void {
  resetDeadlineStateForTesting();
  clearSearchCaches();
  clearReplyRiskCache();
  clearTurnEnginePlanCache();
}

function observationFlag(value: boolean): number {
  return value ? 1 : 0;
}

function captureInternalSelectorObservationLines(): string[] {
  return withAutomoveClock({ now: () => manifest.fixedClockNowMs }, () =>
    withDeadlineIfAbsent(AUTOMOVE_SELECTOR_BUDGET_MS, () => {
      const observations: string[] = [];

      for (const scenario of internalScenarios) {
        const game = scenario.createGame();
        const sourceFen = game.fen();

        for (const { preference, label } of INTERNAL_PREFERENCES) {
          const config = searchConfigForPreference(game, preference);
          observations.push(
            `CONFIG ${label} ${config.depth} ${config.maxVisitedNodes} ${config.rootEnumLimit} ${config.rootBranchLimit} ${config.nodeEnumLimit} ${config.nodeBranchLimit} ${config.quietReductionDepthThreshold}`,
          );

          const rankedRoots = rankRootCandidates(
            game,
            game.activeColor,
            config,
          );
          expect(
            rankedRoots.length,
            `${scenario.name} ${label}: ranked root count`,
          ).toBeGreaterThanOrEqual(INTERNAL_ROOT_LIMIT);
          const observedRoots = rankedRoots.slice(0, INTERNAL_ROOT_LIMIT);

          for (const root of observedRoots) {
            observations.push(
              `ROOT ${scenario.name} ${label} ${inputArrayFen(root.inputs)} ${root.heuristic} ${root.efficiency} ${observationFlag(root.winsImmediately)} ${observationFlag(root.attacksOpponentDrainer)} ${observationFlag(root.ownDrainerVulnerable)} ${observationFlag(root.classes.immediateScore)} ${observationFlag(root.classes.carrierProgress)} ${observationFlag(root.classes.material)}`,
            );
          }

          if (preference === "fast") {
            const result = searchRootCandidates(
              game,
              game.activeColor,
              config,
              observedRoots,
            );
            expect(
              result.timedOut,
              `${scenario.name} Fast: selector timed out`,
            ).toBe(false);
            expect(
              result.evaluations,
              `${scenario.name} Fast: searched root count`,
            ).toHaveLength(INTERNAL_ROOT_LIMIT);

            for (const evaluation of result.evaluations) {
              observations.push(
                `SEARCH_SCORE ${scenario.name} ${inputArrayFen(evaluation.candidate.inputs)} ${evaluation.score} ${evaluation.nodesAfter}`,
              );
            }

            expect(
              result.best,
              `${scenario.name} Fast: selected root`,
            ).toBeDefined();
            if (result.best === undefined) {
              throw new Error(
                `internal selector did not select a root: ${scenario.name}`,
              );
            }
            observations.push(
              `SELECT ${scenario.name} Fast ${inputArrayFen(result.best.candidate.inputs)}`,
            );
          }

          expect(game.fen(), `${scenario.name} ${label}: source mutation`).toBe(
            sourceFen,
          );
        }
      }

      return observations;
    }),
  );
}

describe("automove parity corpus integrity", () => {
  it("pins the baseline, bytes, hashes, counts, order, and selected fixtures", () => {
    expect(sha256(manifestBytes)).toBe(EXPECTED_MANIFEST_SHA256);
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      corpusVersion: "v1",
      baselineCommit: "55c9e97f8643e3edba7249a1daff1f2b83fccad9",
      baselinePackage: { name: "mons-rust", version: "0.1.135" },
      fixedClockNowMs: 0,
      stateCount: 13,
      decisionCount: 39,
      selection: {
        initialVariantStates: 12,
        retainedReleaseAndCuratedStates: 1,
        classicRecord0FirstThreeTurns: false,
        nonClassicFirstRecordMidpointAndLate: false,
      },
    });
    expect(corpusBytes.byteLength).toBe(manifest.corpusBytes);
    expect(sha256(corpusBytes)).toBe(manifest.corpusSha256);
    expect(states).toHaveLength(manifest.stateCount);
    expect(manifest.preferenceOrder).toEqual(PREFERENCES);
    expect(manifest.variantOrder).toEqual(VARIANTS);

    const ids = states.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(sha256(`${ids.join("\n")}\n`)).toBe(manifest.orderedIdsSha256);
    expect(
      states.reduce(
        (count, state) => count + Object.keys(state.decisions).length,
        0,
      ),
    ).toBe(manifest.decisionCount);

    const internal = manifest.internalObservations;
    expect(internalObservationBytes.byteLength).toBe(internal.bytes);
    expect(sha256(internalObservationBytes)).toBe(internal.sha256);
    expect(internalObservationLines).toHaveLength(internal.lineCount);
    expect(
      internalObservationLines.filter((line) => line.startsWith("CONFIG ")),
    ).toHaveLength(internal.configCount);
    expect(
      internalObservationLines.filter((line) => line.startsWith("ROOT ")),
    ).toHaveLength(internal.rootCount);
    expect(
      internalObservationLines.filter((line) =>
        line.startsWith("SEARCH_SCORE "),
      ),
    ).toHaveLength(internal.searchScoreCount);
    expect(
      internalObservationLines.filter((line) => line.startsWith("SELECT ")),
    ).toHaveLength(internal.selectionCount);
    expect(
      internalObservationLines
        .filter((line) => line.startsWith("SELECT "))
        .map((line) => line.split(" ")[1]),
    ).toEqual(internal.scenarioOrder);

    for (const state of states) {
      expect(state.schemaVersion, state.id).toBe(manifest.schemaVersion);
      expect(Object.keys(state.decisions), state.id).toEqual(PREFERENCES);
      expect(state.fen, state.id).not.toBe("");
      expect(state.source, state.id).toBeTypeOf("object");
      expect(
        [
          "sourceGame",
          "turnsApplied",
          "recordIndex",
          "turnIndex",
          "actionIndex",
          "selection",
        ].filter((key) => Object.hasOwn(state.source, key)),
        `${state.id}: complete-game provenance`,
      ).toEqual([]);
      if (state.source["kind"] === "initial-variant") {
        expect(state.source, `${state.id}: initial provenance`).toEqual({
          kind: "initial-variant",
          variant: state.variant,
        });
      } else {
        expect(state.source, `${state.id}: retained provenance`).toEqual({
          kind: "retained-fixture",
          label: "release",
        });
      }
    }

    const initialVariants = states
      .filter(({ source }) => source["kind"] === "initial-variant")
      .map(({ variant }) => variant);
    expect(initialVariants).toEqual(VARIANTS);
    expect(
      states.filter(({ source }) => source["kind"] === "retained-fixture"),
    ).toHaveLength(manifest.selection.retainedReleaseAndCuratedStates);
    expect(
      states.filter(({ source }) => source["kind"] === "complete-game"),
    ).toHaveLength(0);
  });
});

describe("automove internal selector parity", () => {
  beforeAll(() => {
    resetAutomoveState();
  });

  afterAll(() => {
    resetAutomoveState();
  });

  it("replays the complete frozen internal selector observation stream", () => {
    expect(internalScenarios.map(({ name }) => name)).toEqual(
      manifest.internalObservations.scenarioOrder,
    );

    const actualLines = captureInternalSelectorObservationLines();
    expect(actualLines).toHaveLength(156);
    expect(actualLines).toHaveLength(internalObservationLines.length);
    for (const [index, expectedLine] of internalObservationLines.entries()) {
      expect(
        actualLines[index],
        `internal selector observation line ${index + 1}`,
      ).toBe(expectedLine);
    }
  }, 300_000);
});

describe("automove public decision parity", () => {
  beforeAll(() => {
    resetAutomoveState();
    installAutomoveRuntime();
  });

  afterAll(() => {
    resetAutomoveState();
    installAutomoveRuntime();
  });

  for (const state of states) {
    it(
      state.id,
      () => {
        for (const preference of PREFERENCES) {
          const expected = state.decisions[preference];
          const game = MonsGameModel.from_fen(state.fen);
          expect(game, `${preference}: source FEN must parse`).toBeDefined();
          if (game === undefined) continue;

          const before = game.fen();
          const output = withAutomoveClock(
            { now: () => manifest.fixedClockNowMs },
            () => game.smartAutomove(preference),
          );
          expect(output.kind, `${preference}: output kind`).toBe(
            expected.outputKind,
          );
          expect(output.input_fen(), `${preference}: selected input`).toBe(
            expected.inputFen,
          );
          expect(game.fen(), `${preference}: source mutation`).toBe(before);
          expect(game.fen(), `${preference}: captured source state`).toBe(
            expected.sourceFenAfterSmartAutomove,
          );

          const replay = MonsGameModel.from_fen(state.fen);
          expect(
            replay,
            `${preference}: replay source FEN must parse`,
          ).toBeDefined();
          if (replay === undefined) continue;
          const replayOutput = replay.process_input_fen(expected.inputFen);
          expect(replayOutput.kind, `${preference}: replay output kind`).toBe(
            expected.replayOutputKind,
          );
          expect(replay.fen(), `${preference}: replay FEN`).toBe(
            expected.fenAfter,
          );
        }
      },
      // The frozen oracle clock deliberately disables cooperative wall-clock
      // cutoffs so deterministic selector decisions can be compared in full.
      300_000,
    );
  }
});
