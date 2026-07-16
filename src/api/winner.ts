import { Color } from "../engine/domain.js";
import { colorFen, parseInputArrayFen } from "../engine/fen.js";
import { MonsGame } from "../engine/game.js";
import { normalizeRustString } from "../engine/rust-string.js";

/** Validate two submitted end states and their independent move histories. */
export function winner(
  fen_w: string,
  fen_b: string,
  flat_moves_string_w: string,
  flat_moves_string_b: string,
): string {
  const rustFenW = normalizeRustString(fen_w);
  const rustFenB = normalizeRustString(fen_b);
  const rustMovesW = normalizeRustString(flat_moves_string_w);
  const rustMovesB = normalizeRustString(flat_moves_string_b);
  // Unlike verify_moves, the legacy winner route deliberately keeps one empty
  // move when passed an empty string.
  const movesW = rustMovesW.split("-");
  const movesB = rustMovesB.split("-");
  const gameW = MonsGame.fromFen(rustFenW, false);
  const gameB = MonsGame.fromFen(rustFenB, false);

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
