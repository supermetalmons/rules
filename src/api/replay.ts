import { Color, type Input } from "../engine/domain.js";
import { parseInputFen } from "../engine/fen.js";
import type { MonsGame } from "../engine/game.js";

// The engine grammar consumes at most start, target, destination, and modifier.
const MAX_INPUTS_PER_REPLAY_MOVE = 4;

export type ReplayProgress = {
  readonly whiteMovesProcessed: number;
  readonly blackMovesProcessed: number;
};

export type InterleavedReplayResult = ReplayProgress & {
  readonly status: "complete" | "invalid-move" | "missing-move" | "stopped";
};

type AfterReplayMove = (game: MonsGame, progress: ReplayProgress) => boolean;

function parseReplayMove(move: string): Input[] | undefined {
  if (move === "") return undefined;

  const parts = move.split(";");
  if (parts.length > MAX_INPUTS_PER_REPLAY_MOVE) return undefined;

  const inputs: Input[] = [];
  for (const part of parts) {
    const input = parseInputFen(part);
    if (input === undefined || (input.kind === "takeback" && part !== "z")) {
      return undefined;
    }
    inputs.push(input);
  }
  return inputs;
}

/** Replay color-partitioned move histories in the game's active-color order. */
export function replayInterleavedMoves(
  game: MonsGame,
  whiteMoves: readonly string[],
  blackMoves: readonly string[],
  afterMove?: AfterReplayMove,
): InterleavedReplayResult {
  let whiteMovesProcessed = 0;
  let blackMovesProcessed = 0;

  while (
    whiteMovesProcessed < whiteMoves.length ||
    blackMovesProcessed < blackMoves.length
  ) {
    const whiteTurn = game.activeColor === Color.White;
    const moves = whiteTurn ? whiteMoves : blackMoves;
    const moveIndex = whiteTurn ? whiteMovesProcessed : blackMovesProcessed;
    const move = moves[moveIndex];
    if (move === undefined) {
      return {
        status: "missing-move",
        whiteMovesProcessed,
        blackMovesProcessed,
      };
    }

    const inputs = parseReplayMove(move);
    if (inputs === undefined) {
      return {
        status: "invalid-move",
        whiteMovesProcessed,
        blackMovesProcessed,
      };
    }
    const output = game.processInput(inputs, false, false);
    if (output.kind !== "events" || output.events.length === 0) {
      return {
        status: "invalid-move",
        whiteMovesProcessed,
        blackMovesProcessed,
      };
    }
    if (whiteTurn) {
      whiteMovesProcessed += 1;
    } else {
      blackMovesProcessed += 1;
    }

    const progress = { whiteMovesProcessed, blackMovesProcessed };
    if (afterMove?.(game, progress) === false) {
      return { status: "stopped", ...progress };
    }
  }

  return {
    status: "complete",
    whiteMovesProcessed,
    blackMovesProcessed,
  };
}
