import { describe, expect, it } from "vitest";

import {
  ALL_LOCATIONS,
  BOARD_CELLS,
  bombReachableLocations,
  checkedWrappedLocationIndex,
  demonReachableLocations,
  fromLocationIndex,
  isValidLocation,
  location,
  locationBetween,
  locationDistance,
  locationIndex,
  mysticReachableLocations,
  nearbyLocations,
  spiritReachableLocations,
  wrappedLocationIndex,
} from "../../src/engine/geometry.js";

function pairs(
  values: readonly { readonly i: number; readonly j: number }[],
): number[][] {
  return values.map(({ i, j }) => [i, j]);
}

describe("board geometry", () => {
  it("uses the exact 11x11 row-major indexing order", () => {
    expect(ALL_LOCATIONS).toHaveLength(BOARD_CELLS);
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const value = fromLocationIndex(index);
      expect(locationIndex(value)).toBe(index);
      expect(ALL_LOCATIONS[index]).toEqual(value);
    }
    expect(ALL_LOCATIONS[0]).toEqual(location(0, 0));
    expect(ALL_LOCATIONS[120]).toEqual(location(10, 10));
  });

  it("validates board bounds", () => {
    expect(isValidLocation(location(0, 0))).toBe(true);
    expect(isValidLocation(location(10, 10))).toBe(true);
    expect(isValidLocation(location(-1, 0))).toBe(false);
    expect(isValidLocation(location(0, 11))).toBe(false);
  });

  it("reproduces wasm32 wrapped mutation indices", () => {
    expect(wrappedLocationIndex(location(-1, 14))).toBe(3);
    expect(wrappedLocationIndex(location(1, -8))).toBe(3);
    expect(wrappedLocationIndex(location(11, -118))).toBe(3);
    expect(wrappedLocationIndex(location(0, 120))).toBe(120);
    expect(wrappedLocationIndex(location(0x7fff_ffff, -2_147_483_634))).toBe(3);
    expect(wrappedLocationIndex(location(-0x8000_0000, -2_147_483_645))).toBe(
      3,
    );

    expect(checkedWrappedLocationIndex(location(-1, 14))).toBe(3);
    expect(() => checkedWrappedLocationIndex(location(-1, 0))).toThrow(
      new RangeError("location index is out of bounds"),
    );
    expect(() => checkedWrappedLocationIndex(location(0, -1))).toThrow(
      new RangeError("location index is out of bounds"),
    );
    expect(() => checkedWrappedLocationIndex(location(11, 0))).toThrow(
      new RangeError("location index is out of bounds"),
    );
  });

  it("preserves nearby and bomb iteration order", () => {
    expect(pairs(nearbyLocations(location(5, 5)))).toEqual([
      [4, 4],
      [4, 5],
      [4, 6],
      [5, 4],
      [5, 6],
      [6, 4],
      [6, 5],
      [6, 6],
    ]);
    expect(pairs(nearbyLocations(location(0, 0)))).toEqual([
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
    expect(bombReachableLocations(location(0, 0))).toHaveLength(15);
    expect(bombReachableLocations(location(5, 5))).toHaveLength(48);
  });

  it("preserves directional action order", () => {
    expect(pairs(mysticReachableLocations(location(5, 5)))).toEqual([
      [3, 3],
      [7, 7],
      [3, 7],
      [7, 3],
    ]);
    expect(pairs(demonReachableLocations(location(5, 5)))).toEqual([
      [3, 5],
      [7, 5],
      [5, 7],
      [5, 3],
    ]);
    expect(pairs(spiritReachableLocations(location(5, 5)))).toEqual([
      [3, 3],
      [3, 4],
      [3, 5],
      [3, 6],
      [3, 7],
      [4, 3],
      [4, 7],
      [5, 3],
      [5, 7],
      [6, 3],
      [6, 7],
      [7, 3],
      [7, 4],
      [7, 5],
      [7, 6],
      [7, 7],
    ]);
  });

  it("uses midpoint truncation and Chebyshev distance", () => {
    expect(locationBetween(location(1, 1), location(4, 6))).toEqual(
      location(2, 3),
    );
    expect(locationDistance(location(1, 1), location(4, 6))).toBe(5);
  });
});
