import { Board } from "../../src/engine/board/storage.js";
import {
  BOARD_CELLS,
  locationIndex,
  type Location,
} from "../../src/engine/board/geometry.js";
import {
  gameFen,
  parseGameFen,
  type GameFenState,
} from "../../src/engine/codec/game-board.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";
import type { Item } from "../../src/engine/model/domain.js";

export function gameWith(
  entries: readonly (readonly [Location, Item])[],
  overrides: Partial<Omit<GameFenState, "board">> = {},
): MonsGame {
  const initial = parseGameFen(new MonsGame(false).fen());
  if (initial === undefined) throw new Error("initial game FEN must parse");
  const items: (Item | undefined)[] = Array.from(
    { length: BOARD_CELLS },
    () => undefined,
  );
  for (const [at, item] of entries) items[locationIndex(at)] = item;
  const game = MonsGame.fromFen(
    gameFen({
      ...initial,
      turnNumber: 2,
      ...overrides,
      board: Board.fromItems(items, initial.board.variant),
    }),
    false,
  );
  if (game === undefined) throw new Error("test game FEN must parse");
  return game;
}
