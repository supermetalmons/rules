import { beforeEach, describe, expect, it, vi } from "vitest";

const initialBoardCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("../../src/engine/config.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../src/engine/config.js")>();
  return {
    ...actual,
    initialItemsForVariant(
      ...args: Parameters<typeof actual.initialItemsForVariant>
    ): ReturnType<typeof actual.initialItemsForVariant> {
      initialBoardCalls.count += 1;
      return actual.initialItemsForVariant(...args);
    },
  };
});

import { MonsGameModel } from "../../src/api/mons-game-model.js";
import { Board, boardEquals } from "../../src/engine/board.js";
import { GameVariant } from "../../src/engine/config.js";
import { MonsGame } from "../../src/engine/game.js";

beforeEach(() => {
  initialBoardCalls.count = 0;
});

describe("direct state construction", () => {
  it("retains the public constructor arities", () => {
    expect(Board.length).toBe(0);
    expect(MonsGame.length).toBe(0);
    expect(MonsGameModel.length).toBe(0);
  });

  it("copies populated boards without creating a default layout first", () => {
    const source = new Board(GameVariant.InnerWedgeManaRows);
    initialBoardCalls.count = 0;

    const copy = source.clone();

    expect(initialBoardCalls.count).toBe(0);
    expect(copy).not.toBe(source);
    expect(copy.items).not.toBe(source.items);
    expect(boardEquals(copy, source)).toBe(true);
  });

  it("hydrates parsed and cloned games without throwaway boards", () => {
    const source = new MonsGame(false, GameVariant.OffsetArcManaRows);
    const fen = source.fen();
    initialBoardCalls.count = 0;

    const parsed = MonsGame.fromFen(fen);
    const clone = source.clone();
    const simulation = source.cloneForSimulation();

    expect(initialBoardCalls.count).toBe(0);
    expect(parsed?.fen()).toBe(fen);
    expect(clone.fen()).toBe(fen);
    expect(simulation.fen()).toBe(fen);
    expect(clone.board).not.toBe(source.board);
    expect(simulation.board).not.toBe(source.board);
  });

  it("hydrates API factories without constructing a discarded Classic game", () => {
    const variant = GameVariant.CornerChainManaRows;

    const fresh = MonsGameModel.new(variant);

    expect(initialBoardCalls.count).toBe(1);
    expect(fresh.fen().endsWith(` ${variant}`)).toBe(true);

    const fen = fresh.fen();
    initialBoardCalls.count = 0;
    const parsed = MonsGameModel.from_fen(fen);

    expect(initialBoardCalls.count).toBe(0);
    expect(parsed).toBeInstanceOf(MonsGameModel);
    expect(parsed?.fen()).toBe(fen);
  });
});
