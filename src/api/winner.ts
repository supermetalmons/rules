import { Color } from "../engine/domain.js";
import { colorFen } from "../engine/fen.js";
import { MonsGame } from "../engine/game.js";
import { toWellFormedString } from "../engine/text.js";
import { replayInterleavedMoves } from "./replay.js";

/** Validate two submitted end states and their independent move histories. */
export function winner(
  fen_w: string,
  fen_b: string,
  flat_moves_string_w: string,
  flat_moves_string_b: string,
): string {
  const inputFenW = toWellFormedString(fen_w);
  const inputFenB = toWellFormedString(fen_b);
  const normalizedMovesW = toWellFormedString(flat_moves_string_w);
  const normalizedMovesB = toWellFormedString(flat_moves_string_b);
  // Unlike verify_moves, the winner route deliberately keeps one empty
  // move when passed an empty string.
  const movesW = normalizedMovesW.split("-");
  const movesB = normalizedMovesB.split("-");
  const gameW = MonsGame.fromFen(inputFenW, false);
  const gameB = MonsGame.fromFen(inputFenB, false);

  if (gameW === undefined || gameB === undefined) {
    if (gameW === undefined && gameB === undefined) {
      return "x";
    }
    return gameW === undefined ? "b" : "w";
  }
  if (gameW.variant() !== gameB.variant()) {
    return "x";
  }

  const normalizedFenW = gameW.fen();
  const normalizedFenB = gameB.fen();
  if (gameW.winnerColor() === undefined && gameB.winnerColor() === undefined) {
    return "";
  }

  const game = new MonsGame(false, gameW.variant());
  let winnerResult: string | undefined;
  replayInterleavedMoves(
    game,
    movesW,
    movesB,
    (replayedGame, { whiteMovesProcessed, blackMovesProcessed }) => {
      const winnerColor = replayedGame.winnerColor();
      if (winnerColor === undefined) return true;

      const submittedAllWinnerMoves =
        winnerColor === Color.White
          ? whiteMovesProcessed === movesW.length
          : blackMovesProcessed === movesB.length;
      const submittedWinnerFen =
        winnerColor === Color.White ? normalizedFenW : normalizedFenB;
      winnerResult =
        submittedAllWinnerMoves && submittedWinnerFen === replayedGame.fen()
          ? colorFen(winnerColor)
          : "x";
      return false;
    },
  );
  if (winnerResult !== undefined) return winnerResult;

  return "x";
}
