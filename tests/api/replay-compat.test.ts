import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { replayInterleavedMoves } from "../../src/api/replay.js";
import { GameVariant } from "../../src/engine/config.js";
import {
  Color,
  Consumable,
  MonKind,
  consumableItem,
  createMon,
  monItem,
  monWithManaItem,
  regularMana,
} from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import { MonsGameModel, winner } from "../../src/entrypoints/mons-rules.js";

const WHITE_TURN = [
  "l10,5;l9,5",
  "l9,5;l8,5",
  "l8,5;l7,5",
  "l10,6;l9,6",
  "l9,6;l8,7",
] as const;

const BLACK_TURN = [
  "l0,5;l1,5",
  "l1,5;l2,5",
  "l2,5;l3,5",
  "l3,5;l4,5",
  "l4,5;l5,5",
  "l4,3;l3,2",
] as const;

const FOUR_INPUT_MOVE = "l5,3;l5,5;l5,6;mb";

type CompleteGame = {
  readonly gameVariant: string;
  readonly turns: readonly (readonly string[])[];
};

type TrackingSnapshot = {
  readonly color: Color;
  readonly eventsFen: string;
  readonly fen: string;
};

function firstCompleteGame(): CompleteGame {
  const corpusPath = fileURLToPath(
    new URL(
      "../../test-data/complete-games/v1/complete-games.jsonl",
      import.meta.url,
    ),
  );
  const firstLine = readFileSync(corpusPath, "utf8").split("\n", 1)[0];
  if (firstLine === undefined || firstLine.trim() === "") {
    throw new Error("complete-game corpus must contain at least one game");
  }
  return JSON.parse(firstLine) as CompleteGame;
}

function trackingSnapshot(game: MonsGameModel): TrackingSnapshot[] {
  return game.verbose_tracking_entities().map((entity) => ({
    color: entity.color(),
    eventsFen: entity.events_fen(),
    fen: entity.fen(),
  }));
}

function fourInputReplayGame(): MonsGame {
  const game = new MonsGame(false, GameVariant.Classic);
  game.replaceBoardItems([
    [{ i: 5, j: 3 }, monItem(createMon(MonKind.Demon, Color.White, 0))],
    [
      { i: 5, j: 5 },
      monWithManaItem(
        createMon(MonKind.Mystic, Color.Black, 0),
        regularMana(Color.Black),
      ),
    ],
    [{ i: 5, j: 6 }, consumableItem(Consumable.BombOrPotion)],
  ]);
  game.turnNumber = 2;
  return game;
}

function replayCompleteGame(completeGame: CompleteGame): {
  readonly game: MonsGameModel;
  readonly movesByColor: [string[], string[]];
} {
  const game = MonsGameModel.new(GameVariant.Classic);
  const movesByColor: [string[], string[]] = [[], []];
  for (const turn of completeGame.turns) {
    for (const move of turn) {
      movesByColor[game.active_color()].push(move);
      game.process_input_fen(move);
    }
  }
  return { game, movesByColor };
}

describe("interleaved API move replay", () => {
  it("consumes each color history according to the active player", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const observedProgress: string[] = [];
    const result = replayInterleavedMoves(
      game,
      WHITE_TURN,
      BLACK_TURN,
      (_replayedGame, progress) => {
        observedProgress.push(
          `${progress.whiteMovesProcessed}:${progress.blackMovesProcessed}`,
        );
        return true;
      },
    );

    expect(result).toEqual({
      status: "complete",
      whiteMovesProcessed: WHITE_TURN.length,
      blackMovesProcessed: BLACK_TURN.length,
    });
    expect(observedProgress.at(-1)).toBe(
      `${WHITE_TURN.length}:${BLACK_TURN.length}`,
    );
    expect(game.activeColor).toBe(Color.White);
  });

  it("reports exact progress when replay is stopped after an applied move", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const initialFen = game.fen();
    const observedProgress: {
      readonly whiteMovesProcessed: number;
      readonly blackMovesProcessed: number;
      readonly fen: string;
    }[] = [];

    const result = replayInterleavedMoves(
      game,
      WHITE_TURN,
      BLACK_TURN,
      (replayedGame, progress) => {
        observedProgress.push({ ...progress, fen: replayedGame.fen() });
        return false;
      },
    );

    expect(result).toEqual({
      status: "stopped",
      whiteMovesProcessed: 1,
      blackMovesProcessed: 0,
    });
    expect(observedProgress).toEqual([
      {
        whiteMovesProcessed: 1,
        blackMovesProcessed: 0,
        fen: game.fen(),
      },
    ]);
    expect(game.fen()).not.toBe(initialFen);
  });

  it("reports the consumed side when the active history is exhausted", () => {
    const game = new MonsGame(false, GameVariant.Classic);
    const result = replayInterleavedMoves(
      game,
      [WHITE_TURN[0]],
      [BLACK_TURN[0]],
    );

    expect(result).toEqual({
      status: "missing-move",
      whiteMovesProcessed: 1,
      blackMovesProcessed: 0,
    });
  });

  it("rejects invalid consumed records before progress or callbacks", () => {
    const invalidMoves = [
      "",
      "garbage",
      "l10,5",
      "l10,5;l0,0",
      "garbage;l10,5;l9,5",
      "zjunk",
    ] as const;

    for (const move of invalidMoves) {
      const game = new MonsGame(false, GameVariant.Classic);
      const initialFen = game.fen();
      let callbackCount = 0;
      const result = replayInterleavedMoves(game, [move], [], () => {
        callbackCount += 1;
        return true;
      });

      expect(result, move).toEqual({
        status: "invalid-move",
        whiteMovesProcessed: 0,
        blackMovesProcessed: 0,
      });
      expect(callbackCount, move).toBe(0);
      expect(game.fen(), move).toBe(initialFen);
    }
  });

  it("rejects parsed suffixes after a complete four-input record", () => {
    const validGame = fourInputReplayGame();
    const validInitialFen = validGame.fen();
    expect(replayInterleavedMoves(validGame, [FOUR_INPUT_MOVE], [])).toEqual({
      status: "complete",
      whiteMovesProcessed: 1,
      blackMovesProcessed: 0,
    });
    expect(validGame.fen()).not.toBe(validInitialFen);

    for (const suffix of ["l0,0", "z"]) {
      const game = fourInputReplayGame();
      const initialFen = game.fen();
      let callbackCount = 0;
      const result = replayInterleavedMoves(
        game,
        [`${FOUR_INPUT_MOVE};${suffix}`],
        [],
        () => {
          callbackCount += 1;
          return true;
        },
      );

      expect(result, suffix).toEqual({
        status: "invalid-move",
        whiteMovesProcessed: 0,
        blackMovesProcessed: 0,
      });
      expect(callbackCount, suffix).toBe(0);
      expect(game.fen(), suffix).toBe(initialFen);
    }
  });

  it("accepts complete parseable records and exact legal takeback", () => {
    const moved = MonsGameModel.new(GameVariant.Classic);
    moved.process_input_fen(WHITE_TURN[0]);
    expect(moved.verify_moves("l010,05;l09,05", "")).toBe(true);

    const initial = MonsGameModel.new(GameVariant.Classic);
    expect(initial.verify_moves(`${WHITE_TURN[0]}-z`, "")).toBe(true);
  });

  it("rejects malformed or no-op records hidden in a matching history", () => {
    const game = MonsGameModel.new(GameVariant.Classic);
    game.process_input_fen(WHITE_TURN[0]);

    const invalidHistories = [
      `${WHITE_TURN[0]}-`,
      `${WHITE_TURN[0]}-garbage`,
      `${WHITE_TURN[0]}-l9,5`,
      `${WHITE_TURN[0]}-l9,5;l0,0`,
      `garbage;${WHITE_TURN[0]}`,
      `${WHITE_TURN[0]}-zjunk`,
    ] as const;
    for (const history of invalidHistories) {
      expect(game.verify_moves(history, ""), history).toBe(false);
    }
  });

  it("preserves verify_moves empty-history and failure semantics", () => {
    const initial = MonsGameModel.new(GameVariant.Classic);
    expect(initial.verify_moves("", "")).toBe(true);

    const game = MonsGameModel.new(GameVariant.Classic);
    for (const move of WHITE_TURN) game.process_input_fen(move);
    for (const move of BLACK_TURN) game.process_input_fen(move);

    const before = game.fen();
    expect(game.verify_moves(WHITE_TURN.join("-"), BLACK_TURN.join("-"))).toBe(
      true,
    );
    const takebackFensBeforeFailure = game.takeback_fens();
    const trackingBeforeFailure = trackingSnapshot(game);
    expect(takebackFensBeforeFailure.length).toBeGreaterThan(0);
    expect(trackingBeforeFailure.length).toBeGreaterThan(0);
    expect(
      trackingBeforeFailure.some(
        ({ eventsFen, fen }) => eventsFen !== "" && fen !== "",
      ),
    ).toBe(true);

    expect(game.verify_moves("l10,4;l9,3", BLACK_TURN.join("-"))).toBe(false);
    expect(game.fen()).toBe(before);
    expect(game.is_moves_verified()).toBe(true);
    expect(game.takeback_fens()).toEqual(takebackFensBeforeFailure);
    expect(trackingSnapshot(game)).toEqual(trackingBeforeFailure);
  });

  it("validates a terminal complete-game submission through winner", () => {
    const completeGame = firstCompleteGame();
    expect(completeGame.gameVariant).toBe("Classic");

    const { game, movesByColor } = replayCompleteGame(completeGame);
    const winningColor = game.winner_color();
    expect(winningColor).toBeDefined();
    if (winningColor === undefined) {
      throw new Error("complete game must have a winner");
    }

    const initialFen = MonsGameModel.new(GameVariant.Classic).fen();
    const finalFen = game.fen();
    const submittedFens: [string, string] =
      winningColor === Color.White
        ? [finalFen, initialFen]
        : [initialFen, finalFen];
    const histories: [string, string] = [
      movesByColor[Color.White].join("-"),
      movesByColor[Color.Black].join("-"),
    ];
    const expectedWinner = winningColor === Color.White ? "w" : "b";

    expect(winner(...submittedFens, ...histories)).toBe(expectedWinner);
    expect(winner(submittedFens[1], submittedFens[0], ...histories)).toBe("x");

    const invalidConsumedHistories: [string[], string[]] = [
      [...movesByColor[Color.White]],
      [...movesByColor[Color.Black]],
    ];
    invalidConsumedHistories[winningColor].splice(-1, 0, "garbage");
    expect(
      winner(
        ...submittedFens,
        invalidConsumedHistories[Color.White].join("-"),
        invalidConsumedHistories[Color.Black].join("-"),
      ),
    ).toBe("x");

    const trailingLosingHistories: [string[], string[]] = [
      [...movesByColor[Color.White]],
      [...movesByColor[Color.Black]],
    ];
    const losingColor =
      winningColor === Color.White ? Color.Black : Color.White;
    trailingLosingHistories[losingColor].push("garbage");
    expect(
      winner(
        ...submittedFens,
        trailingLosingHistories[Color.White].join("-"),
        trailingLosingHistories[Color.Black].join("-"),
      ),
    ).toBe(expectedWinner);
  });
});
