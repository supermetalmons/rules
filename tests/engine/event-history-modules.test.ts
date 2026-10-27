import { describe, expect, it } from "vitest";

import { GameVariant } from "../../src/engine/board/config.js";
import { Color, type Event } from "../../src/engine/model/domain.js";
import { applyRulesEvents } from "../../src/engine/rules/event-reducer.js";
import type { MutableRulesState } from "../../src/engine/rules/state.js";
import { parseGameFen } from "../../src/engine/codec/game-board.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";
import { GameHistory } from "../../src/engine/game/history.js";
import type { Location } from "../../src/engine/board/geometry.js";

function monMove(
  state: MutableRulesState,
  from: Location,
  to: Location,
): Extract<Event, { readonly kind: "mon-move" }> {
  const item = state.board.get(from);
  if (item === undefined) {
    throw new Error(`expected a board item at ${from.i},${from.j}`);
  }
  return { kind: "mon-move", item, from, to };
}

function stateSnapshot(game: MonsGame): {
  readonly fen: string;
  readonly takebackFens: readonly string[];
  readonly tracking: readonly {
    readonly fen: string;
    readonly color: Color;
    readonly events: readonly Event[];
  }[];
} {
  return {
    fen: game.fen(),
    takebackFens: [...game.takebackFens],
    tracking: game.verboseTrackingEntities.map((entry) => ({
      fen: entry.fen,
      color: entry.color,
      events: [...entry.events],
    })),
  };
}

function bombExplosion(
  i: number,
  j: number,
): Extract<Event, { readonly kind: "bomb-explosion" }> {
  return { kind: "bomb-explosion", at: { i, j } };
}

function requireBombExplosion(
  entries: readonly { readonly events: readonly Event[] }[],
  entryIndex = 0,
): Extract<Event, { readonly kind: "bomb-explosion" }> {
  const event = entries[entryIndex]?.events[0];
  if (event?.kind !== "bomb-explosion") {
    throw new Error("tracking entry must contain a bomb explosion");
  }
  return event;
}

describe("rules event reducer", () => {
  it("preserves input event order and appends turn advancement", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const parsed = parseGameFen(game.fen());
    if (parsed === undefined) {
      throw new Error("initial game must have a parseable FEN");
    }
    const state: MutableRulesState = {
      ...parsed,
      board: parsed.board.fork(),
    };
    const moves = [
      monMove(state, { i: 10, j: 3 }, { i: 9, j: 2 }),
      monMove(state, { i: 10, j: 4 }, { i: 9, j: 3 }),
      monMove(state, { i: 10, j: 5 }, { i: 9, j: 4 }),
      monMove(state, { i: 10, j: 6 }, { i: 9, j: 5 }),
      monMove(state, { i: 10, j: 7 }, { i: 9, j: 6 }),
    ] satisfies readonly Event[];

    const reduction = applyRulesEvents(state, moves);

    expect(reduction).toMatchObject({
      turnAdvanced: true,
      winner: undefined,
    });
    expect(reduction.events).toEqual([
      ...moves,
      { kind: "next-turn", color: Color.Black },
    ]);
    expect(state.activeColor).toBe(Color.Black);
    expect(state.turnNumber).toBe(2);
    expect(state.monsMovesCount).toBe(0);
    expect(state.manaMovesCount).toBe(0);
    expect(state.actionsUsedCount).toBe(0);
  });
});

describe("game history", () => {
  it("owns snapshot and verbose tracking lifecycles", () => {
    const history = new GameHistory(true);
    const events = [{ kind: "next-turn", color: Color.Black }] as const;

    history.beginEventApplication(() => "before", Color.White);
    history.completeEventApplication({
      snapshotFen: () => "after",
      color: Color.Black,
      events,
      turnAdvanced: true,
      winner: undefined,
    });

    expect(history.takebackFens).toEqual(["after"]);
    expect(history.trackingEntries).toEqual([
      { fen: "before", color: Color.White, events: [] },
      { fen: "after", color: Color.Black, events },
    ]);
  });

  it("prepares takeback without mutation and commits it explicitly", () => {
    const history = new GameHistory(true);
    const firstTracking = {
      fen: "first",
      color: Color.White,
      events: [] as readonly Event[],
    };
    const secondTracking = {
      fen: "second",
      color: Color.White,
      events: [] as readonly Event[],
    };
    history.replace({
      takebackFens: ["first", "second"],
      trackingEntries: [firstTracking, secondTracking],
    });

    const prepared = history.prepareTakeback(Color.White, Color.White);

    expect(prepared).toEqual({
      previousFen: "first",
      takebackFens: ["first"],
      trackingEntries: [firstTracking],
    });
    expect(history.takebackFens).toEqual(["first", "second"]);
    expect(history.trackingEntries).toEqual([firstTracking, secondTracking]);
    if (prepared === undefined) return;
    history.commitTakeback(prepared);
    expect(history.takebackFens).toEqual(["first"]);
    expect(history.trackingEntries).toEqual([firstTracking]);
  });

  it("detaches replacement inputs, getter snapshots, and copied histories", () => {
    const history = new GameHistory(true);
    const incomingEvent = bombExplosion(4, 3);
    const incomingEntry = {
      fen: "after",
      color: Color.White,
      events: [incomingEvent],
    };
    const expected = [
      {
        fen: "after",
        color: Color.White,
        events: [bombExplosion(4, 3)],
      },
    ];

    history.replace({ trackingEntries: [incomingEntry] });
    expect(Reflect.set(incomingEvent.at, "i", 99)).toBe(true);
    expect(Reflect.set(incomingEvent, "at", { i: 99, j: 99 })).toBe(true);
    expect(Reflect.set(incomingEntry, "events", [])).toBe(true);
    expect(history.trackingEntries).toEqual(expected);

    const firstSnapshot = history.trackingEntries;
    const firstEntry = firstSnapshot[0];
    if (firstEntry === undefined) {
      throw new Error("history must contain a tracking entry");
    }
    const firstEvent = requireBombExplosion(firstSnapshot);
    expect(Reflect.set(firstEvent.at, "j", 99)).toBe(true);
    expect(Reflect.set(firstEvent, "at", { i: 99, j: 99 })).toBe(true);
    expect(Reflect.set(firstEntry, "events", [])).toBe(true);
    expect(history.trackingEntries).toEqual(expected);

    const copy = history.copy();
    const sourceSnapshot = history.trackingEntries;
    const copySnapshot = copy.trackingEntries;
    const sourceEvent = requireBombExplosion(sourceSnapshot);
    const copyEvent = requireBombExplosion(copySnapshot);
    expect(copySnapshot[0]).not.toBe(sourceSnapshot[0]);
    expect(copyEvent).not.toBe(sourceEvent);
    expect(copyEvent.at).not.toBe(sourceEvent.at);
    expect(Reflect.set(copyEvent.at, "i", 99)).toBe(true);
    expect(Reflect.set(copyEvent, "at", { i: 99, j: 99 })).toBe(true);
    expect(copy.trackingEntries).toEqual(expected);
    expect(history.trackingEntries).toEqual(expected);
  });

  it("detaches prepared takebacks on output and commit on input", () => {
    const history = new GameHistory(true);
    const firstTracking = {
      fen: "first",
      color: Color.White,
      events: [bombExplosion(2, 3)],
    };
    const secondTracking = {
      fen: "second",
      color: Color.White,
      events: [bombExplosion(3, 4)],
    };
    history.replace({
      takebackFens: ["first", "second"],
      trackingEntries: [firstTracking, secondTracking],
    });
    const expectedSourceTracking = [
      {
        fen: "first",
        color: Color.White,
        events: [bombExplosion(2, 3)],
      },
      {
        fen: "second",
        color: Color.White,
        events: [bombExplosion(3, 4)],
      },
    ];

    const prepared = history.prepareTakeback(Color.White, Color.White);
    if (prepared === undefined) {
      throw new Error("history must prepare a takeback");
    }
    const preparedEvent = requireBombExplosion(prepared.trackingEntries);
    expect(Reflect.set(preparedEvent.at, "i", 99)).toBe(true);
    expect(Reflect.set(preparedEvent, "at", { i: 99, j: 99 })).toBe(true);
    prepared.trackingEntries.length = 0;
    expect(history.trackingEntries).toEqual(expectedSourceTracking);

    const preparedForCommit = history.prepareTakeback(Color.White, Color.White);
    if (preparedForCommit === undefined) {
      throw new Error("history must prepare a takeback for commit");
    }
    const committed = new GameHistory(true);
    committed.commitTakeback(preparedForCommit);
    const committedExpected = [
      {
        fen: "first",
        color: Color.White,
        events: [bombExplosion(2, 3)],
      },
    ];
    const preparedForCommitEvent = requireBombExplosion(
      preparedForCommit.trackingEntries,
    );
    expect(Reflect.set(preparedForCommitEvent.at, "j", 99)).toBe(true);
    expect(Reflect.set(preparedForCommitEvent, "at", { i: 99, j: 99 })).toBe(true);
    preparedForCommit.trackingEntries.length = 0;

    expect(committed.takebackFens).toEqual(["first"]);
    expect(committed.trackingEntries).toEqual(committedExpected);
  });

  it("detaches completed event applications from caller-owned events", () => {
    const history = new GameHistory(true);
    const event = bombExplosion(6, 5);
    const events: Event[] = [event];

    history.completeEventApplication({
      snapshotFen: () => "after",
      color: Color.Black,
      events,
      turnAdvanced: false,
      winner: undefined,
    });
    expect(Reflect.set(event.at, "i", 99)).toBe(true);
    expect(Reflect.set(event, "at", { i: 99, j: 99 })).toBe(true);
    events.length = 0;

    expect(history.trackingEntries).toEqual([
      {
        fen: "after",
        color: Color.Black,
        events: [bombExplosion(6, 5)],
      },
    ]);
  });

  it("skips FEN snapshots when history tracking is disabled", () => {
    const history = new GameHistory().fork();
    let snapshots = 0;
    const snapshotFen = (): string => {
      snapshots += 1;
      return "unused";
    };

    history.beginEventApplication(snapshotFen, Color.White);
    history.completeEventApplication({
      snapshotFen,
      color: Color.White,
      events: [],
      turnAdvanced: false,
      winner: undefined,
    });

    expect(snapshots).toBe(0);
  });

  it("previews a prepared takeback without mutating the game", () => {
    const game = new MonsGame(true, GameVariant.Classic);
    expect(
      game.processInput(
        [
          { kind: "location", location: { i: 10, j: 3 } },
          { kind: "location", location: { i: 9, j: 2 } },
        ],
        false,
        false,
      ).kind,
    ).toBe("events");
    const before = stateSnapshot(game);

    expect(game.processInput([{ kind: "takeback" }], true, false)).toEqual({
      kind: "events",
      events: [{ kind: "takeback" }],
    });
    expect(stateSnapshot(game)).toEqual(before);
  });
});

describe("failed engine input application", () => {
  it("forks and applies simulation events without history ownership", () => {
    const source = new MonsGame(true, GameVariant.Classic);
    const parsed = parseGameFen(source.fen());
    if (parsed === undefined) {
      throw new Error("initial game must have a parseable FEN");
    }
    const event = monMove(
      { ...parsed, board: parsed.board.fork() },
      { i: 10, j: 3 },
      { i: 9, j: 2 },
    );
    const before = stateSnapshot(source);
    const simulation = source.fork();
    const events = simulation.applyAndAddResultingEvents([event]);

    expect(events).toEqual([event]);
    expect(simulation.board.get(event.from)).toBeUndefined();
    expect(simulation.board.get(event.to)).toEqual(event.item);
    expect(simulation.monsMovesCount).toBe(1);
    expect(simulation.takebackFens).toEqual([]);
    expect(simulation.verboseTrackingEntities).toEqual([]);
    expect(stateSnapshot(source)).toEqual(before);
  });

  it("leaves gameplay and history state unchanged", () => {
    const game = new MonsGame(true, GameVariant.Classic);
    const invalidMove = [
      { kind: "location", location: { i: 10, j: 3 } },
      { kind: "location", location: { i: 0, j: 0 } },
    ] as const;
    const beforeMove = stateSnapshot(game);

    expect(game.processInput(invalidMove, false, false)).toEqual({
      kind: "invalid-input",
    });
    expect(stateSnapshot(game)).toEqual(beforeMove);

    game.replaceHistory({
      takebackFens: ["not-a-fen", game.fen()],
      trackingEntries: [
        { fen: "not-a-fen", color: Color.White, events: [] },
        { fen: game.fen(), color: Color.White, events: [] },
      ],
    });
    const beforeTakeback = stateSnapshot(game);

    expect(game.processInput([{ kind: "takeback" }], false, false)).toEqual({
      kind: "invalid-input",
    });
    expect(stateSnapshot(game)).toEqual(beforeTakeback);
  });

  it("rejects unsafe potion growth before mutating board or history", () => {
    const fields = new MonsGame(true, GameVariant.Classic).fen().split(" ");
    fields[6] = String(Number.MAX_SAFE_INTEGER);
    const game = MonsGame.fromFen(fields.join(" "), true);
    expect(game).toBeDefined();
    if (game === undefined) return;
    const item = game.board.get({ i: 10, j: 3 });
    expect(item).toBeDefined();
    if (item === undefined) return;
    const before = stateSnapshot(game);

    expect(
      game.applyAndAddResultingEvents([
        { kind: "pickup-potion", by: item, at: { i: 10, j: 3 } },
      ]),
    ).toBeUndefined();
    expect(stateSnapshot(game)).toEqual(before);
  });
});
