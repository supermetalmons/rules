import {
  Color,
  Consumable,
  MonKind,
  SUPERMANA,
  cloneItem,
  consumableItem,
  createMon,
  manaItem,
  monItem,
  regularMana,
  type Item,
  type Square,
} from "./domain.js";
import {
  BOARD_CELLS,
  BOARD_SIZE,
  isValidLocation,
  location,
  locationIndex,
  type Location,
} from "./geometry.js";
import { parseI32Strict } from "./numerics.js";

export enum GameVariant {
  Classic = 0,
  SwappedManaRows = 1,
  OffsetArcManaRows = 2,
  CenterSpokeManaRows = 3,
  AlternatingManaRows = 4,
  InnerWedgeManaRows = 5,
  OuterWedgeManaRows = 6,
  BentCenterManaRows = 7,
  OuterEdgeManaRows = 8,
  SplitFlankManaRows = 9,
  ForwardBridgeManaRows = 10,
  CornerChainManaRows = 11,
}

Object.freeze(GameVariant);

export const DEFAULT_GAME_VARIANT = GameVariant.Classic;
export const TARGET_SCORE = 5;
export const MONS_MOVES_PER_TURN = 5;
export const MANA_MOVES_PER_TURN = 1;
export const ACTIONS_PER_TURN = 1;

export const ALL_GAME_VARIANTS: readonly GameVariant[] = [
  GameVariant.Classic,
  GameVariant.SwappedManaRows,
  GameVariant.OffsetArcManaRows,
  GameVariant.CenterSpokeManaRows,
  GameVariant.AlternatingManaRows,
  GameVariant.InnerWedgeManaRows,
  GameVariant.OuterWedgeManaRows,
  GameVariant.BentCenterManaRows,
  GameVariant.OuterEdgeManaRows,
  GameVariant.SplitFlankManaRows,
  GameVariant.ForwardBridgeManaRows,
  GameVariant.CornerChainManaRows,
];

type ManaLayout = Readonly<{
  [Color.White]: readonly Location[];
  [Color.Black]: readonly Location[];
}>;

function locations(
  ...pairs: readonly (readonly [number, number])[]
): readonly Location[] {
  return pairs.map(([i, j]) => location(i, j));
}

const MANA_LAYOUTS: readonly ManaLayout[] = [
  {
    [Color.Black]: locations([3, 4], [3, 6], [4, 3], [4, 5], [4, 7]),
    [Color.White]: locations([7, 4], [7, 6], [6, 3], [6, 5], [6, 7]),
  },
  {
    [Color.Black]: locations([3, 3], [3, 5], [3, 7], [4, 4], [4, 6]),
    [Color.White]: locations([7, 3], [7, 5], [7, 7], [6, 4], [6, 6]),
  },
  {
    [Color.Black]: locations([3, 4], [3, 6], [4, 2], [4, 5], [4, 8]),
    [Color.White]: locations([6, 2], [6, 5], [6, 8], [7, 4], [7, 6]),
  },
  {
    [Color.Black]: locations([3, 5], [4, 2], [4, 4], [4, 6], [4, 8]),
    [Color.White]: locations([6, 2], [6, 4], [6, 6], [6, 8], [7, 5]),
  },
  {
    [Color.Black]: locations([4, 1], [4, 3], [4, 5], [4, 7], [4, 9]),
    [Color.White]: locations([6, 1], [6, 3], [6, 5], [6, 7], [6, 9]),
  },
  {
    [Color.Black]: locations([3, 4], [3, 6], [4, 4], [4, 5], [4, 6]),
    [Color.White]: locations([6, 4], [6, 5], [6, 6], [7, 4], [7, 6]),
  },
  {
    [Color.Black]: locations([3, 4], [3, 5], [3, 6], [4, 3], [4, 7]),
    [Color.White]: locations([6, 3], [6, 7], [7, 4], [7, 5], [7, 6]),
  },
  {
    [Color.Black]: locations([3, 5], [4, 4], [4, 5], [4, 6], [5, 3]),
    [Color.White]: locations([5, 7], [6, 4], [6, 5], [6, 6], [7, 5]),
  },
  {
    [Color.Black]: locations([4, 0], [4, 1], [4, 9], [4, 10], [5, 1]),
    [Color.White]: locations([5, 9], [6, 0], [6, 1], [6, 9], [6, 10]),
  },
  {
    [Color.Black]: locations([3, 4], [3, 6], [4, 2], [4, 3], [5, 2]),
    [Color.White]: locations([5, 8], [6, 7], [6, 8], [7, 4], [7, 6]),
  },
  {
    [Color.Black]: locations([3, 4], [3, 6], [4, 3], [4, 5], [5, 4]),
    [Color.White]: locations([5, 6], [6, 5], [6, 7], [7, 4], [7, 6]),
  },
  {
    [Color.Black]: locations([3, 5], [3, 6], [4, 6], [4, 7], [5, 7]),
    [Color.White]: locations([5, 3], [6, 3], [6, 4], [7, 4], [7, 5]),
  },
];

const REGULAR_SQUARE: Square = Object.freeze({ kind: "regular" });
const CONSUMABLE_BASE_SQUARE: Square = Object.freeze({
  kind: "consumable-base",
});
const SUPERMANA_BASE_SQUARE: Square = Object.freeze({ kind: "supermana-base" });

export const SUPERMANA_BASE: Location = location(5, 5);

export const MON_BASE_LOCATIONS: readonly Location[] = locations(
  [0, 3],
  [0, 4],
  [0, 5],
  [0, 6],
  [0, 7],
  [10, 3],
  [10, 4],
  [10, 5],
  [10, 6],
  [10, 7],
);

export function gameVariantFromId(id: number): GameVariant | undefined {
  switch (id) {
    case 0:
      return GameVariant.Classic;
    case 1:
      return GameVariant.SwappedManaRows;
    case 2:
      return GameVariant.OffsetArcManaRows;
    case 3:
      return GameVariant.CenterSpokeManaRows;
    case 4:
      return GameVariant.AlternatingManaRows;
    case 5:
      return GameVariant.InnerWedgeManaRows;
    case 6:
      return GameVariant.OuterWedgeManaRows;
    case 7:
      return GameVariant.BentCenterManaRows;
    case 8:
      return GameVariant.OuterEdgeManaRows;
    case 9:
      return GameVariant.SplitFlankManaRows;
    case 10:
      return GameVariant.ForwardBridgeManaRows;
    case 11:
      return GameVariant.CornerChainManaRows;
    default:
      return undefined;
  }
}

export function parseGameVariant(value: string): GameVariant | undefined {
  const id = parseI32Strict(value);
  return id === undefined ? undefined : gameVariantFromId(id);
}

export function manaBaseLocations(
  variant: GameVariant,
  color: Color,
): readonly Location[] {
  const layout = MANA_LAYOUTS[variant] ?? MANA_LAYOUTS[GameVariant.Classic];
  return layout?.[color] ?? [];
}

function buildSquares(variant: GameVariant): readonly Square[] {
  const squares = Array.from<Square>({ length: BOARD_CELLS }).fill(
    REGULAR_SQUARE,
  );
  const put = (at: Location, square: Square): void => {
    squares[locationIndex(at)] = square;
  };

  put(location(0, 0), { kind: "mana-pool", color: Color.Black });
  put(location(0, 10), { kind: "mana-pool", color: Color.Black });
  put(location(10, 0), { kind: "mana-pool", color: Color.White });
  put(location(10, 10), { kind: "mana-pool", color: Color.White });

  put(location(0, 3), {
    kind: "mon-base",
    monKind: MonKind.Mystic,
    color: Color.Black,
  });
  put(location(0, 4), {
    kind: "mon-base",
    monKind: MonKind.Spirit,
    color: Color.Black,
  });
  put(location(0, 5), {
    kind: "mon-base",
    monKind: MonKind.Drainer,
    color: Color.Black,
  });
  put(location(0, 6), {
    kind: "mon-base",
    monKind: MonKind.Angel,
    color: Color.Black,
  });
  put(location(0, 7), {
    kind: "mon-base",
    monKind: MonKind.Demon,
    color: Color.Black,
  });

  put(location(10, 3), {
    kind: "mon-base",
    monKind: MonKind.Demon,
    color: Color.White,
  });
  put(location(10, 4), {
    kind: "mon-base",
    monKind: MonKind.Angel,
    color: Color.White,
  });
  put(location(10, 5), {
    kind: "mon-base",
    monKind: MonKind.Drainer,
    color: Color.White,
  });
  put(location(10, 6), {
    kind: "mon-base",
    monKind: MonKind.Spirit,
    color: Color.White,
  });
  put(location(10, 7), {
    kind: "mon-base",
    monKind: MonKind.Mystic,
    color: Color.White,
  });

  for (const at of manaBaseLocations(variant, Color.Black)) {
    put(at, { kind: "mana-base", color: Color.Black });
  }
  for (const at of manaBaseLocations(variant, Color.White)) {
    put(at, { kind: "mana-base", color: Color.White });
  }

  put(location(5, 0), CONSUMABLE_BASE_SQUARE);
  put(location(5, 10), CONSUMABLE_BASE_SQUARE);
  put(SUPERMANA_BASE, SUPERMANA_BASE_SQUARE);
  return squares;
}

const SQUARES_BY_VARIANT: readonly (readonly Square[])[] =
  ALL_GAME_VARIANTS.map(buildSquares);

export function squaresForVariant(variant: GameVariant): readonly Square[] {
  return (
    SQUARES_BY_VARIANT[variant] ?? SQUARES_BY_VARIANT[GameVariant.Classic] ?? []
  );
}

export function squareAtForVariant(at: Location, variant: GameVariant): Square {
  if (!isValidLocation(at)) {
    return REGULAR_SQUARE;
  }
  return squaresForVariant(variant)[locationIndex(at)] ?? REGULAR_SQUARE;
}

export function squareAt(at: Location): Square {
  return squareAtForVariant(at, DEFAULT_GAME_VARIANT);
}

function initialItemForSquare(square: Square): Item | undefined {
  switch (square.kind) {
    case "mon-base":
      return monItem(createMon(square.monKind, square.color, 0));
    case "mana-base":
      return manaItem(regularMana(square.color));
    case "supermana-base":
      return manaItem(SUPERMANA);
    case "consumable-base":
      return consumableItem(Consumable.BombOrPotion);
    case "regular":
    case "mana-pool":
      return undefined;
  }
}

function buildInitialItems(
  variant: GameVariant,
): readonly (Item | undefined)[] {
  return squaresForVariant(variant).map(initialItemForSquare);
}

const INITIAL_ITEMS_BY_VARIANT: readonly (readonly (Item | undefined)[])[] =
  ALL_GAME_VARIANTS.map(buildInitialItems);

/** A value-copy of the initial board. */
export function initialItemsForVariant(
  variant: GameVariant,
): (Item | undefined)[] {
  const initial =
    INITIAL_ITEMS_BY_VARIANT[variant] ??
    INITIAL_ITEMS_BY_VARIANT[GameVariant.Classic] ??
    [];
  return initial.map((item) =>
    item === undefined ? undefined : cloneItem(item),
  );
}

export function monBase(kind: MonKind, color: Color): Location {
  for (const at of MON_BASE_LOCATIONS) {
    const square = squareAt(at);
    if (
      square.kind === "mon-base" &&
      square.monKind === kind &&
      square.color === color
    ) {
      return at;
    }
  }
  throw new Error("Expected at least one base for the given mon");
}

export { BOARD_SIZE };
