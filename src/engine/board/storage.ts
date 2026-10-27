import {
  Color,
  MonKind,
  immutableItem,
  isMonFainted,
  itemMon,
  type Item,
  type Mon,
  type Square,
} from "../model/domain.js";
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
  assertValidLocation,
  isValidLocation,
  locationIndex,
  type Location,
} from "./geometry.js";

type BoardEntry = readonly [Location, Item];

function detachedLocation(at: Location | undefined): Location | undefined {
  return at === undefined ? undefined : { i: at.i, j: at.j };
}

function detachedLocations(locations: readonly Location[]): Location[] {
  const result = new Array<Location>(locations.length);
  for (let index = 0; index < locations.length; index += 1) {
    const at = locations[index];
    if (at !== undefined) {
      result[index] = { i: at.i, j: at.j };
    }
  }
  return result;
}

function boardColorIndex(color: Color): 0 | 1 | undefined {
  const runtimeColor: unknown = color;
  return runtimeColor === Color.White
    ? 0
    : runtimeColor === Color.Black
      ? 1
      : undefined;
}

type BoardCategoryDerived = {
  readonly monsLocations: readonly [readonly Location[], readonly Location[]];
  readonly freeRegularManaLocations: readonly [
    readonly Location[],
    readonly Location[],
  ];
  readonly faintedMonsLocations: readonly [readonly Location[], readonly Location[]];
  readonly awakeAngelLocations: readonly [Location | undefined, Location | undefined];
};

type BoardStorage = {
  readonly itemSlots: (Item | undefined)[];
  occupiedEntries: readonly BoardEntry[] | undefined;
  categoryDerived: BoardCategoryDerived | undefined;
};

export class Board {
  protected readonly storage: BoardStorage;

  public constructor(
    public readonly variant: GameVariant = DEFAULT_GAME_VARIANT,
    items?: readonly (Item | undefined)[],
    sharedStorage?: BoardStorage,
    itemsAreImmutable = false,
  ) {
    if (sharedStorage !== undefined) {
      this.storage = sharedStorage;
      return;
    }
    const initialItems = items ?? initialItemsForVariant(variant);
    if (initialItems.length !== BOARD_CELLS) {
      throw new RangeError(`board requires exactly ${BOARD_CELLS} item slots`);
    }
    this.storage = {
      itemSlots:
        items === undefined || itemsAreImmutable
          ? [...initialItems]
          : initialItems.map((item) =>
              item === undefined ? undefined : immutableItem(item),
            ),
      occupiedEntries: undefined,
      categoryDerived: undefined,
    };
  }

  public get items(): readonly (Item | undefined)[] {
    return [...this.storage.itemSlots];
  }

  public static fromItems(
    items: readonly (Item | undefined)[],
    variant: GameVariant,
  ): MutableBoard {
    return new MutableBoard(variant, items);
  }

  /** Create an independently mutable board with shared immutable values. */
  public fork(): MutableBoard {
    const fork = new MutableBoard(
      this.variant,
      this.storage.itemSlots,
      undefined,
      true,
    );
    fork.storage.occupiedEntries = this.storage.occupiedEntries;
    fork.storage.categoryDerived = this.storage.categoryDerived;
    return fork;
  }

  public get(at: Location): Item | undefined {
    if (!isValidLocation(at)) {
      return undefined;
    }
    return this.storage.itemSlots[locationIndex(at)];
  }

  /** @internal Read a slot whose index has already been validated. */
  public itemAtIndex(index: number): Item | undefined {
    return this.storage.itemSlots[index];
  }

  public squareAt(at: Location): Square {
    assertValidLocation(at);
    return squareAtForVariant(at, this.variant);
  }

  public allMonsBases(): readonly Location[] {
    return MON_BASE_LOCATIONS;
  }

  public supermanaBase(): Location {
    return SUPERMANA_BASE;
  }

  public allMonsLocations(color: Color): Location[] {
    const colorIndex = boardColorIndex(color);
    if (colorIndex === undefined) return [];
    return detachedLocations(this.getCategoryDerived().monsLocations[colorIndex]);
  }

  public allFreeRegularManaLocations(color: Color): Location[] {
    const colorIndex = boardColorIndex(color);
    if (colorIndex === undefined) return [];
    return detachedLocations(
      this.getCategoryDerived().freeRegularManaLocations[colorIndex],
    );
  }

  public base(mon: Mon): Location {
    return monBase(mon.kind, mon.color);
  }

  public faintedMonsLocations(color: Color): Location[] {
    const colorIndex = boardColorIndex(color);
    if (colorIndex === undefined) return [];
    return detachedLocations(
      this.getCategoryDerived().faintedMonsLocations[colorIndex],
    );
  }

  public findMana(color: Color): Location | undefined {
    const colorIndex = boardColorIndex(color);
    if (colorIndex === undefined) return undefined;
    return detachedLocation(
      this.getCategoryDerived().freeRegularManaLocations[colorIndex][0],
    );
  }

  public findAwakeAngel(color: Color): Location | undefined {
    const colorIndex = boardColorIndex(color);
    if (colorIndex === undefined) return undefined;
    return detachedLocation(this.getCategoryDerived().awakeAngelLocations[colorIndex]);
  }

  private getOccupiedEntries(): readonly BoardEntry[] {
    if (this.storage.occupiedEntries !== undefined) {
      return this.storage.occupiedEntries;
    }
    const occupiedEntries: BoardEntry[] = [];
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.storage.itemSlots[index];
      const at = ALL_LOCATIONS[index];
      if (item !== undefined && at !== undefined) {
        occupiedEntries.push([at, item]);
      }
    }
    this.storage.occupiedEntries = occupiedEntries;
    return occupiedEntries;
  }

  private getCategoryDerived(): BoardCategoryDerived {
    if (this.storage.categoryDerived !== undefined) {
      return this.storage.categoryDerived;
    }
    const whiteMons: Location[] = [];
    const blackMons: Location[] = [];
    const whiteFreeMana: Location[] = [];
    const blackFreeMana: Location[] = [];
    const whiteFaintedMons: Location[] = [];
    const blackFaintedMons: Location[] = [];
    let whiteAwakeAngel: Location | undefined;
    let blackAwakeAngel: Location | undefined;
    for (let index = 0; index < BOARD_CELLS; index += 1) {
      const item = this.storage.itemSlots[index];
      if (item !== undefined) {
        const at = ALL_LOCATIONS[index];
        if (at !== undefined) {
          const mon = itemMon(item);
          if (mon !== undefined) {
            const colorIndex = boardColorIndex(mon.color);
            if (colorIndex === undefined) continue;
            const mons = colorIndex === 0 ? whiteMons : blackMons;
            mons.push(at);
            if (item.kind === "mon" && isMonFainted(mon)) {
              const faintedMons =
                colorIndex === 0 ? whiteFaintedMons : blackFaintedMons;
              faintedMons.push(at);
            } else if (mon.kind === MonKind.Angel && !isMonFainted(mon)) {
              if (colorIndex === 0 && whiteAwakeAngel === undefined) {
                whiteAwakeAngel = at;
              } else if (colorIndex === 1 && blackAwakeAngel === undefined) {
                blackAwakeAngel = at;
              }
            }
          } else if (item.kind === "mana" && item.mana.kind === "regular") {
            const colorIndex = boardColorIndex(item.mana.color);
            if (colorIndex !== undefined) {
              const freeMana = colorIndex === 0 ? whiteFreeMana : blackFreeMana;
              freeMana.push(at);
            }
          }
        }
      }
    }
    const derived: BoardCategoryDerived = {
      monsLocations: [whiteMons, blackMons],
      freeRegularManaLocations: [whiteFreeMana, blackFreeMana],
      faintedMonsLocations: [whiteFaintedMons, blackFaintedMons],
      awakeAngelLocations: [whiteAwakeAngel, blackAwakeAngel],
    };
    this.storage.categoryDerived = derived;
    return derived;
  }

  /** Iterate a snapshot of the board's occupied locations in row-major order. */
  public entries(): IterableIterator<BoardEntry> {
    return this.getOccupiedEntries().values();
  }
}

/**
 * Mutable board storage for rules reducers and isolated simulations.
 *
 * Games expose {@link readonlyView} instead, so mutations cannot bypass their
 * revisioned query-cache and history boundaries.
 */
export class MutableBoard extends Board {
  #readonlyView: Board | undefined;

  public delete(at: Location): void {
    assertValidLocation(at);
    this.storage.itemSlots[locationIndex(at)] = undefined;
    this.storage.occupiedEntries = undefined;
    this.storage.categoryDerived = undefined;
  }

  public set(at: Location, item: Item): void {
    assertValidLocation(at);
    this.storage.itemSlots[locationIndex(at)] = immutableItem(item);
    this.storage.occupiedEntries = undefined;
    this.storage.categoryDerived = undefined;
  }

  /** A stable, live view that intentionally has no mutating methods. */
  public readonlyView(): Board {
    this.#readonlyView ??= new Board(this.variant, undefined, this.storage);
    return this.#readonlyView;
  }
}
