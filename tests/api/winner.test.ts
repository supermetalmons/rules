import { describe, expect, it } from "vitest";

import { randomAutomove } from "../../src/automove/runtime.js";
import { GameVariant } from "../../src/engine/config.js";
import { Color } from "../../src/engine/domain.js";
import { MonsGame } from "../../src/engine/game.js";
import { MonsGameModel } from "../../src/api/mons-game-model.js";
import { winner } from "../../src/api/winner.js";

const CLASSIC_FEN =
  "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";

const SYNTHETIC_WHITE_WIN_FEN = CLASSIC_FEN.replace(/^0 0/u, "5 0");
const SYNTHETIC_GAME_SEED = 22;
const SYNTHETIC_GAME_MAX_INPUTS = 1_000;

type WinningSubmission = {
  readonly fen: string;
  readonly whiteMoves: string;
  readonly blackMoves: string;
};

let cachedWinningSubmission: WinningSubmission | undefined;

// Generate this in memory so no complete-game-derived state or history is committed.
function syntheticWinningSubmission(): WinningSubmission {
  if (cachedWinningSubmission !== undefined) {
    return cachedWinningSubmission;
  }

  let randomState = SYNTHETIC_GAME_SEED;
  const random = {
    nextU32(): number {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return randomState >>> 0;
    },
  };
  const game = new MonsGame(false, GameVariant.Classic);
  const moves: [string[], string[]] = [[], []];

  for (let index = 0; index < SYNTHETIC_GAME_MAX_INPUTS; index += 1) {
    const activeColor = game.activeColor;
    const result = randomAutomove(game, random);
    if (result.output.kind !== "events" || result.inputFen === "") {
      throw new Error("synthetic winner game must produce a legal input");
    }
    moves[activeColor].push(result.inputFen);

    const winningColor = game.winnerColor();
    if (winningColor === undefined) continue;
    if (winningColor !== Color.White) {
      throw new Error("synthetic winner game must end with a white win");
    }
    cachedWinningSubmission = {
      fen: game.fen(),
      whiteMoves: moves[Color.White].join("-"),
      blackMoves: moves[Color.Black].join("-"),
    };
    return cachedWinningSubmission;
  }

  throw new Error("synthetic winner game exceeded its deterministic bound");
}

describe("winner", () => {
  it("retains its browser-facing function identity and arity", () => {
    expect(winner.name).toBe("winner");
    expect(winner.length).toBe(4);
  });

  it("returns stable sentinels for nonterminal and invalid submissions", () => {
    expect(winner(CLASSIC_FEN, CLASSIC_FEN, "", "")).toBe("");
    expect(winner("bad", "bad", "", "")).toBe("x");
    expect(winner("bad", CLASSIC_FEN, "", "")).toBe("b");
    expect(winner(CLASSIC_FEN, "bad", "", "")).toBe("w");
    expect(
      winner(
        CLASSIC_FEN,
        MonsGameModel.new(GameVariant.SwappedManaRows).fen(),
        "",
        "",
      ),
    ).toBe("x");

    const nelFen = CLASSIC_FEN.replaceAll(" ", "\u0085");
    const bomFen = CLASSIC_FEN.replaceAll(" ", "\ufeff");
    expect(winner(nelFen, nelFen, "", "")).toBe("");
    expect(winner(bomFen, bomFen, "", "")).toBe("x");
    expect(winner(bomFen, nelFen, "", "")).toBe("b");
  });

  it("reports winner_color directly from terminal scores", () => {
    expect(
      MonsGameModel.from_fen(SYNTHETIC_WHITE_WIN_FEN)?.winner_color(),
    ).toBe(Color.White);
    expect(MonsGameModel.from_fen(CLASSIC_FEN)?.winner_color()).toBeUndefined();
  });

  it("replays a synthetic valid game and validates the winning snapshot", () => {
    const submission = syntheticWinningSubmission();

    expect(
      winner(
        submission.fen,
        submission.fen,
        submission.whiteMoves,
        submission.blackMoves,
      ),
    ).toBe("w");
  });

  it("rejects corrupted, incomplete, or mismatched winning histories", () => {
    const submission = syntheticWinningSubmission();
    const incompleteWhiteMoves = submission.whiteMoves
      .split("-")
      .slice(0, -1)
      .join("-");
    const corruptedWhiteMoves = submission.whiteMoves
      .split("-")
      .map((move, index, moves) => (index === moves.length - 1 ? "z" : move))
      .join("-");
    const mismatchedScoreFen = submission.fen.replace(/^([0-9]+)/u, (score) =>
      String(Number(score) + 1),
    );

    expect(
      winner(
        submission.fen,
        submission.fen,
        corruptedWhiteMoves,
        submission.blackMoves,
      ),
    ).toBe("x");
    expect(
      winner(
        submission.fen,
        submission.fen,
        incompleteWhiteMoves,
        submission.blackMoves,
      ),
    ).toBe("x");
    expect(winner(submission.fen, submission.fen, "", "")).toBe("x");
    expect(
      winner(
        mismatchedScoreFen,
        submission.fen,
        submission.whiteMoves,
        submission.blackMoves,
      ),
    ).toBe("x");
  });
});
