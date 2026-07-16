import { Color } from "../engine/domain.js";
import { colorFen, parseInputArrayFen } from "../engine/fen.js";
import { MonsGame } from "../engine/game.js";
import { toWellFormedString } from "../engine/text.js";

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
  let whiteIndex = 0;
  let blackIndex = 0;
  while (whiteIndex < movesW.length || blackIndex < movesB.length) {
    if (game.activeColor === Color.White) {
      const move = movesW[whiteIndex];
      if (move === undefined) {
        return "x";
      }
      game.processInput(parseInputArrayFen(move), false, false);
      whiteIndex += 1;
    } else {
      const move = movesB[blackIndex];
      if (move === undefined) {
        return "x";
      }
      game.processInput(parseInputArrayFen(move), false, false);
      blackIndex += 1;
    }

    const winnerColor = game.winnerColor();
    if (winnerColor === Color.White) {
      return whiteIndex === movesW.length && normalizedFenW === game.fen()
        ? colorFen(winnerColor)
        : "x";
    }
    if (winnerColor === Color.Black) {
      return blackIndex === movesB.length && normalizedFenB === game.fen()
        ? colorFen(winnerColor)
        : "x";
    }
  }

  return "x";
}
