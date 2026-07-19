import { afterEach, describe, expect, it, vi } from "vitest";

import {
  Color,
  Modifier,
  type Event,
  type Input,
  type Output,
} from "../../src/engine/domain.js";
import { GameVariant } from "../../src/engine/config.js";
import { inputArrayFen } from "../../src/engine/fen.js";
import {
  FOR_AUTOMOVE_START_INPUT_OPTIONS,
  MonsGame,
} from "../../src/engine/game.js";
import {
  compareInputChains,
  compareInputs,
  enumerateLegalTransitions,
  enumerateLegalTransitionsLexicographicBounded,
  enumerateLegalTransitionsWithPriority,
  hasMaterialEvent,
  isQuiescenceTacticalTransition,
} from "../../src/automove/transitions.js";
import {
  takePreviousTimeout,
  withDeadlineIfAbsent,
} from "../../src/automove/deadline.js";

const FIRST_ENGINE_LOCATION = { i: 1, j: 0 };
const SECOND_ENGINE_LOCATION = { i: 0, j: 0 };
const EVENT_CLASSIFICATION = {
  "mon-move": [false, false],
  "mana-move": [false, false],
  "mana-scored": [true, true],
  "mystic-action": [false, false],
  "demon-action": [false, false],
  "demon-additional-step": [false, false],
  "spirit-target-move": [false, true],
  "pickup-bomb": [true, false],
  "pickup-potion": [true, false],
  "use-potion": [true, true],
  "pickup-mana": [true, true],
  "mon-fainted": [true, true],
  "mana-dropped": [false, false],
  "supermana-back-to-base": [false, true],
  "bomb-attack": [true, true],
  "mon-awake": [false, false],
  "bomb-explosion": [true, true],
  "next-turn": [false, false],
  "game-over": [false, false],
  takeback: [false, false],
} as const satisfies Record<
  Event["kind"],
  readonly [material: boolean, tactical: boolean]
>;

function locationInput(i: number, j: number): Input {
  return { kind: "location", location: { i, j } };
}

function branchingGame(onApplyEvents?: () => void): MonsGame {
  const terminalEvents: readonly Event[] = [
    { kind: "next-turn", color: Color.Black },
  ];
  const game = {
    cloneForSimulation(): MonsGame {
      return game as unknown as MonsGame;
    },
    processInputWithStartOptions(inputs: readonly Input[]): Output {
      const first = inputs[0];
      if (first === undefined) {
        return {
          kind: "locations-to-start-from",
          locations: [FIRST_ENGINE_LOCATION, SECOND_ENGINE_LOCATION],
        };
      }
      if (inputs.length === 1 && first.kind === "location") {
        return {
          kind: "next-input-options",
          nextInputs: [
            {
              kind: 0,
              input: locationInput(first.location.i, 2),
            },
            {
              kind: 0,
              input: locationInput(first.location.i, 1),
            },
          ],
        };
      }
      return { kind: "events", events: terminalEvents };
    },
    applyAndAddResultingEvents(events: readonly Event[]): readonly Event[] {
      onApplyEvents?.();
      return events;
    },
  };
  return game as unknown as MonsGame;
}

function inputFens(
  transitions: ReturnType<typeof enumerateLegalTransitions>,
): string[] {
  return transitions.map(({ inputs }) => inputArrayFen(inputs));
}

afterEach(() => {
  vi.restoreAllMocks();
  takePreviousTimeout();
});

describe("deterministic transition ordering", () => {
  it("orders input kinds, locations, modifiers, and chain prefixes", () => {
    const takeback: Input = { kind: "takeback" };
    const location00 = locationInput(0, 0);
    const location01 = locationInput(0, 1);
    const modifier: Input = {
      kind: "modifier",
      modifier: Modifier.SelectPotion,
    };

    expect(compareInputs(takeback, location00)).toBeLessThan(0);
    expect(compareInputs(location00, modifier)).toBeLessThan(0);
    expect(compareInputs(location00, location01)).toBeLessThan(0);
    expect(
      compareInputChains([location00], [location00, location01]),
    ).toBeLessThan(0);
  });

  it("bounds ordinary traversal before sorting and lexicographic traversal after per-level sorting", () => {
    const game = branchingGame();

    expect(inputFens(enumerateLegalTransitions(game, 2))).toEqual([
      "l1,0;l1,1",
      "l1,0;l1,2",
    ]);
    expect(
      inputFens(enumerateLegalTransitionsLexicographicBounded(game, 2)),
    ).toEqual(["l0,0;l0,1", "l0,0;l0,2"]);
  });

  it("partitions an already-bounded ordinary traversal by priority budget", () => {
    const game = branchingGame();
    const transitions = enumerateLegalTransitionsWithPriority(
      game,
      4,
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
      [FIRST_ENGINE_LOCATION],
    );

    expect(inputFens(transitions)).toEqual([
      "l1,0;l1,1",
      "l1,0;l1,2",
      "l0,0;l0,1",
      "l0,0;l0,2",
    ]);
  });

  it("filters allowed first locations before lexicographic bounding", () => {
    const game = branchingGame();
    const transitions = enumerateLegalTransitionsLexicographicBounded(
      game,
      2,
      FOR_AUTOMOVE_START_INPUT_OPTIONS,
      [FIRST_ENGINE_LOCATION],
    );

    expect(inputFens(transitions)).toEqual(["l1,0;l1,1", "l1,0;l1,2"]);
  });

  it("does not mutate a real source game", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const before = game.fen();

    const ordinary = enumerateLegalTransitions(game, 12);
    const lexicographic = enumerateLegalTransitionsLexicographicBounded(
      game,
      12,
    );

    expect(ordinary).toHaveLength(12);
    expect(lexicographic).toHaveLength(12);
    expect(game.fen()).toBe(before);
    expect(inputFens(ordinary)).toEqual(
      inputFens(
        [...ordinary].sort((left, right) =>
          compareInputChains(left.inputs, right.inputs),
        ),
      ),
    );
    expect(inputFens(lexicographic)).toEqual(
      inputFens(
        [...lexicographic].sort((left, right) =>
          compareInputChains(left.inputs, right.inputs),
        ),
      ),
    );
  });

  it("isolates real transition games under further event application", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const sourceFen = game.fen();
    const transitions = enumerateLegalTransitions(game, 2);
    const first = transitions[0];
    const second = transitions[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;

    const firstFen = first.game.fen();
    const secondFen = second.game.fen();
    const continuation = enumerateLegalTransitions(first.game, 1)[0];
    expect(continuation).toBeDefined();
    if (continuation === undefined) return;

    const output = first.game.processInput(continuation.inputs, false, false);
    expect(output.kind).toBe("events");
    expect(first.game.fen()).not.toBe(firstFen);
    expect(second.game.fen()).toBe(secondFen);
    expect(game.fen()).toBe(sourceFen);
  });

  it("clears partial ordinary and lexicographic results after timeout", () => {
    let currentTime = 0;
    vi.spyOn(globalThis.performance, "now").mockImplementation(
      () => currentTime,
    );
    const game = branchingGame(() => {
      currentTime = 10;
    });

    const ordinary = withDeadlineIfAbsent(10, () =>
      enumerateLegalTransitions(game, 4),
    );
    expect(ordinary).toEqual([]);
    expect(takePreviousTimeout()).toBe(true);

    currentTime = 20;
    const lexicographic = withDeadlineIfAbsent(10, () => {
      const nextGame = branchingGame(() => {
        currentTime = 30;
      });
      return enumerateLegalTransitionsLexicographicBounded(nextGame, 4);
    });
    expect(lexicographic).toEqual([]);
    expect(takePreviousTimeout()).toBe(true);
  });
});

describe("transition event classes", () => {
  it("preserves the complete material and quiescence truth table", () => {
    for (const kind of Object.keys(EVENT_CLASSIFICATION) as Event["kind"][]) {
      const [material, tactical] = EVENT_CLASSIFICATION[kind];
      const event = { kind } as Event;
      expect(hasMaterialEvent([event]), `${kind}: material`).toBe(material);
      expect(isQuiescenceTacticalTransition([event]), `${kind}: tactical`).toBe(
        tactical,
      );
    }
  });
});
