import {
  Color,
  MonKind,
  cloneItem,
  isMonFainted,
  itemEquals,
  itemMon,
  type Item,
  type Mon,
  type Square,
} from "./domain.js";
import {
  DEFAULT_GAME_VARIANT,
  GameVariant,
  MON_BASE_LOCATIONS,
  SUPERMANA_BASE,
  initialItemsForVariant,
  monBase,
  squareAtForVariant,
} from "./config.js";
import {
  ALL_LOCATIONS,
  BOARD_CELLS,
  checkedWrappedLocationIndex,
  cloneLocation,
  fromLocationIndex,
  isValidLocation,
  locationIndex,
  type Location,
} from "./geometry.js";

const BOARD_ITEMS_INITIALIZATION = Symbol();

type OccupiedBoardEntry = readonly [Location, Item];

type BoardItemsInitialization = {
  readonly [BOARD_ITEMS_INITIALIZATION]:
    | {
        readonly kind: "deep";
        readonly items: readonly (Item | undefined)[];
      }
    | {
        readonly kind: "simulation";
        readonly items: readonly (Item | undefined)[];
        readonly occupiedEntries: readonly OccupiedBoardEntry[];
      };
};

function cloneBoardItems(
  items: readonly (Item | undefined)[],
): (Item | undefined)[] {
  return Array.from({ length: BOARD_CELLS }, (_, index) => {
    const item = items[index];
    return item === undefined ? undefined : cloneItem(item);
  });
}

export class Board {
  private readonly itemSlots: (Item | undefined)[];
  private occupiedEntries: readonly OccupiedBoardEntry[] | undefined;
  readonly #gameVariant: GameVariant;

  public constructor(variant?: GameVariant);
  /** @internal Direct initialization for value-preserving board copies. */
  public constructor(
    variant: GameVariant,
    // eslint-disable-next-line @typescript-eslint/unified-signatures -- This internal overload is stripped from declarations, preserving the public constructor signature.
    initialization: BoardItemsInitialization,
  );
  public constructor(
    variant: GameVariant = DEFAULT_GAME_VARIANT,
    initialization?: BoardItemsInitialization,
  ) {
    const value = initialization?.[BOARD_ITEMS_INITIALIZATION];
    this.itemSlots =
      value === undefined
        ? initialItemsForVariant(variant)
        : value.kind === "deep"
          ? cloneBoardItems(value.items)
          : [...value.items];
    this.#gameVariant = variant;
    this.occupiedEntries =
      value?.kind === "simulation" ? value.occupiedEntries : undefined;
  }

  public get items(): readonly (Item | undefined)[] {
    return [...this.itemSlots];
  }

  public static fromItems(
    items: readonly (Item | undefined)[],
    variant: GameVariant,
  ): Board {
    return new Board(variant, {
      [BOARD_ITEMS_INITIALIZATION]: { kind: "deep", items },
    });
  }

  public clone(): Board {
    return Board.fromItems(this.itemSlots, this.#gameVariant);
  }

  /** @internal Shallow value copy for trusted simulation paths. */
  public cloneForSimulation(): Board {
    return new Board(this.#gameVariant, {
      [BOARD_ITEMS_INITIALIZATION]: {
        kind: "simulation",
        items: this.itemSlots,
        occupiedEntries: this.getOccupiedEntries(),
      },
    });
  }

  public removeItem(at: Location): void {
    this.itemSlots[checkedWrappedLocationIndex(at)] = undefined;
    this.occupiedEntries = undefined;
  }

  /** Store a value-copy, mirroring Rust's Copy item argument. */
  public put(item: Item, at: Location): void {
    this.itemSlots[checkedWrappedLocationIndex(at)] = cloneItem(item);
    this.occupiedEntries = undefined;
  }

  /** Internal live item reference. Public wrappers must clone before returning it. */
  public item(at: Location): Item | undefined {
    if (!isValidLocation(at)) {
      return undefined;
    }
    return this.itemSlots[locationIndex(at)];
  }

  public square(at: Location): Square {
    return isValidLocation(at)
      ? squareAtForVariant(at, this.#gameVariant)
      : { kind: "regular" };
  }

  public variant(): GameVariant {
    return this.#gameVariant;
  }

  public allMonsBases(): Location[] {
    return MON_BASE_LOCATIONS.map(cloneLocation);
  }

  public supermanaBase(): Location {
    return cloneLocation(SUPERMANA_BASE);
  }

  public allMonsLocations(color: Color): Location[] {
    const result: Location[] = [];
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.itemSlots[index];
      if (item !== undefined && itemMon(item)?.color === color) {
        result.push(fromLocationIndex(index));
      }
    }
    return result;
  }

  public allFreeRegularManaLocations(color: Color): Location[] {
    const result: Location[] = [];
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.itemSlots[index];
      if (
        item?.kind === "mana" &&
        item.mana.kind === "regular" &&
        item.mana.color === color
      ) {
        result.push(fromLocationIndex(index));
      }
    }
    return result;
  }

  public base(mon: Mon): Location {
    return cloneLocation(monBase(mon.kind, mon.color));
  }

  public faintedMonsLocations(color: Color): Location[] {
    const result: Location[] = [];
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.itemSlots[index];
      if (
        item?.kind === "mon" &&
        item.mon.color === color &&
        isMonFainted(item.mon)
      ) {
        result.push(fromLocationIndex(index));
      }
    }
    return result;
  }

  public findMana(color: Color): Location | undefined {
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.itemSlots[index];
      if (
        item?.kind === "mana" &&
        item.mana.kind === "regular" &&
        item.mana.color === color
      ) {
        return fromLocationIndex(index);
      }
    }
    return undefined;
  }

  public findAwakeAngel(color: Color): Location | undefined {
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.itemSlots[index];
      const mon = item === undefined ? undefined : itemMon(item);
      if (
        mon?.color === color &&
        mon.kind === MonKind.Angel &&
        !isMonFainted(mon)
      ) {
        return fromLocationIndex(index);
      }
    }
    return undefined;
  }

  /** @internal Compare board storage without allocating public snapshots. */
  public itemsEqual(other: Board): boolean {
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const leftItem = this.itemSlots[index];
      const rightItem = other.itemSlots[index];
      if (leftItem === undefined || rightItem === undefined) {
        if (leftItem !== rightItem) {
          return false;
        }
      } else if (!itemEquals(leftItem, rightItem)) {
        return false;
      }
    }
    return true;
  }

  private getOccupiedEntries(): readonly OccupiedBoardEntry[] {
    if (this.occupiedEntries !== undefined) {
      return this.occupiedEntries;
    }
    const occupiedEntries: OccupiedBoardEntry[] = [];
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.itemSlots[index];
      if (item !== undefined) {
        const at = ALL_LOCATIONS[index];
        if (at !== undefined) {
          occupiedEntries.push([at, item]);
        }
      }
    }
    this.occupiedEntries = occupiedEntries;
    return occupiedEntries;
  }

  /** Iterate a snapshot of the board's occupied locations in row-major order. */
  public occupied(): IterableIterator<readonly [Location, Item]> {
    return this.getOccupiedEntries().values();
  }
}

export function boardEquals(left: Board, right: Board): boolean {
  if (left.variant() !== right.variant()) {
    return false;
  }
  return left.itemsEqual(right);
}
