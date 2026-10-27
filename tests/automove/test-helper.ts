import { expect } from "vitest";

import {
  COLOR_COUNT,
  MON_ID_COUNT,
  OCC_MANA,
  OCC_MON,
  cellHashHi,
  cellHashLo,
  cellMana,
  cellMonColor,
  cellMonKind,
  cellOccupancy,
  monId,
} from "../../src/automove/board.js";
import type { FastPosition, FastPositionSnapshot } from "../../src/automove/state.js";
import type { Input } from "../../src/engine/model/domain.js";
import { BOARD_CELLS, type Location } from "../../src/engine/board/geometry.js";
export { gameWith } from "../helpers/game.js";

export function locationInput(at: Location): Input {
  return { kind: "location", location: at };
}

function fastPositionResetSnapshot(position: FastPosition) {
  return {
    cells: [...position.cells],
    squares: [...position.squares],
    whiteScore: position.whiteScore,
    blackScore: position.blackScore,
    active: position.active,
    monsMoves: position.monsMoves,
    manaMoves: position.manaMoves,
    actionsUsed: position.actionsUsed,
    potions: [...position.potions],
    firstTurn: position.firstTurn,
  };
}

export function fastPositionSnapshot(position: FastPosition) {
  return {
    ...fastPositionResetSnapshot(position),
    monLocations: [...position.monLocations],
    freeMana: [...position.freeMana],
    manaIndices: [...position.manaIndices],
    manaCount: position.manaCount,
    hashLo: position.hashLo,
    hashHi: position.hashHi,
  };
}

export function resetFastPosition(
  position: FastPosition,
  overrides: Partial<FastPositionSnapshot>,
): void {
  position.reset({ ...fastPositionResetSnapshot(position), ...overrides });
}

export function expectFastPositionInvariants(
  position: FastPosition,
  label?: string,
): void {
  const expectedMonLocations = new Int32Array(MON_ID_COUNT).fill(-1);
  const expectedFreeMana = new Int32Array(COLOR_COUNT);
  const looseManaIndices: number[] = [];
  const expectedManaIndices = new Int32Array(position.manaIndices.length);
  let hashLo = 0;
  let hashHi = 0;

  for (let index = 0; index < BOARD_CELLS; index += 1) {
    const cell = position.cells[index] ?? 0;
    if (cell === 0) continue;
    hashLo ^= cellHashLo(index, cell);
    hashHi ^= cellHashHi(index, cell);
    const occupancy = cellOccupancy(cell);
    if (occupancy === OCC_MON) {
      expectedMonLocations[monId(cellMonKind(cell), cellMonColor(cell))] = index;
    } else if (occupancy === OCC_MANA) {
      const mana = cellMana(cell);
      if (mana === 1 || mana === 2) {
        expectedFreeMana[mana - 1] = (expectedFreeMana[mana - 1] ?? 0) + 1;
      }
      looseManaIndices.push(index);
      if (looseManaIndices.length <= expectedManaIndices.length) {
        expectedManaIndices[looseManaIndices.length - 1] = index;
      }
    }
  }

  expect([...position.monLocations], label).toEqual([...expectedMonLocations]);
  expect([...position.freeMana], label).toEqual([...expectedFreeMana]);
  expect(looseManaIndices.length, label).toBeLessThanOrEqual(
    expectedManaIndices.length,
  );
  expect(position.manaCount, label).toBe(looseManaIndices.length);
  expect([...position.manaIndices], label).toEqual([...expectedManaIndices]);
  expect(position.hashLo, label).toBe(hashLo);
  expect(position.hashHi, label).toBe(hashHi);
}
