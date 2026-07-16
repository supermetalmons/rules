import { toI32 } from "./numerics.js";
import type { Location } from "./geometry.js";

export enum Color {
  White = 0,
  Black = 1,
}

export enum MonKind {
  Demon = 0,
  Drainer = 1,
  Angel = 2,
  Spirit = 3,
  Mystic = 4,
}

export enum Consumable {
  Potion = 0,
  Bomb = 1,
  BombOrPotion = 2,
}

export enum AvailableMoveKind {
  MonMove = 0,
  ManaMove = 1,
  Action = 2,
  Potion = 3,
}

export enum Modifier {
  SelectPotion = 0,
  SelectBomb = 1,
  Cancel = 2,
}

export enum NextInputKind {
  MonMove = 0,
  ManaMove = 1,
  MysticAction = 2,
  DemonAction = 3,
  DemonAdditionalStep = 4,
  SpiritTargetCapture = 5,
  SpiritTargetMove = 6,
  SelectConsumable = 7,
  BombAttack = 8,
}

Object.freeze(Color);
Object.freeze(MonKind);
Object.freeze(Consumable);
Object.freeze(AvailableMoveKind);
Object.freeze(Modifier);
Object.freeze(NextInputKind);

export type Mon = {
  kind: MonKind;
  color: Color;
  cooldown: number;
};

export type RegularMana = {
  readonly kind: "regular";
  readonly color: Color;
};

export type Supermana = {
  readonly kind: "supermana";
};

export type Mana = RegularMana | Supermana;

export type MonItem = {
  readonly kind: "mon";
  mon: Mon;
};

export type ManaItem = {
  readonly kind: "mana";
  readonly mana: Mana;
};

export type MonWithManaItem = {
  readonly kind: "mon-with-mana";
  mon: Mon;
  readonly mana: Mana;
};

export type MonWithConsumableItem = {
  readonly kind: "mon-with-consumable";
  mon: Mon;
  readonly consumable: Consumable;
};

export type ConsumableItem = {
  readonly kind: "consumable";
  readonly consumable: Consumable;
};

export type Item =
  MonItem | ManaItem | MonWithManaItem | MonWithConsumableItem | ConsumableItem;

export type Square =
  | { readonly kind: "regular" }
  | { readonly kind: "consumable-base" }
  | { readonly kind: "supermana-base" }
  | { readonly kind: "mana-base"; readonly color: Color }
  | { readonly kind: "mana-pool"; readonly color: Color }
  | {
      readonly kind: "mon-base";
      readonly monKind: MonKind;
      readonly color: Color;
    };

export type Input =
  | { readonly kind: "takeback" }
  | { readonly kind: "location"; readonly location: Location }
  | { readonly kind: "modifier"; readonly modifier: Modifier };

export type NextInput = {
  readonly input: Input;
  readonly kind: NextInputKind;
  readonly actorMonItem?: Item;
};

export type Event =
  | {
      readonly kind: "mon-move";
      readonly item: Item;
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "mana-move";
      readonly mana: Mana;
      readonly from: Location;
      readonly to: Location;
    }
  | { readonly kind: "mana-scored"; readonly mana: Mana; readonly at: Location }
  | {
      readonly kind: "mystic-action";
      readonly mystic: Mon;
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "demon-action";
      readonly demon: Mon;
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "demon-additional-step";
      readonly demon: Mon;
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "spirit-target-move";
      readonly item: Item;
      readonly from: Location;
      readonly to: Location;
      readonly by: Location;
    }
  | { readonly kind: "pickup-bomb"; readonly by: Mon; readonly at: Location }
  | { readonly kind: "pickup-potion"; readonly by: Item; readonly at: Location }
  | {
      readonly kind: "use-potion";
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "pickup-mana";
      readonly mana: Mana;
      readonly by: Mon;
      readonly at: Location;
    }
  | {
      readonly kind: "mon-fainted";
      readonly mon: Mon;
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "mana-dropped";
      readonly mana: Mana;
      readonly at: Location;
    }
  | {
      readonly kind: "supermana-back-to-base";
      readonly from: Location;
      readonly to: Location;
    }
  | {
      readonly kind: "bomb-attack";
      readonly by: Mon;
      readonly from: Location;
      readonly to: Location;
    }
  | { readonly kind: "mon-awake"; readonly mon: Mon; readonly at: Location }
  | { readonly kind: "bomb-explosion"; readonly at: Location }
  | { readonly kind: "next-turn"; readonly color: Color }
  | { readonly kind: "game-over"; readonly winner: Color }
  | { readonly kind: "takeback" };

export type Output =
  | { readonly kind: "invalid-input" }
  | {
      readonly kind: "locations-to-start-from";
      readonly locations: readonly Location[];
    }
  | {
      readonly kind: "next-input-options";
      readonly nextInputs: readonly NextInput[];
    }
  | { readonly kind: "events"; readonly events: readonly Event[] };

export const SUPERMANA: Supermana = Object.freeze({ kind: "supermana" });

export function otherColor(color: Color): Color {
  return color === Color.Black ? Color.White : Color.Black;
}

export function createMon(kind: MonKind, color: Color, cooldown: number): Mon {
  return { kind, color, cooldown: toI32(cooldown) };
}

export function cloneMon(mon: Mon): Mon {
  return { kind: mon.kind, color: mon.color, cooldown: mon.cooldown };
}

export function monEquals(left: Mon, right: Mon): boolean {
  return (
    left.kind === right.kind &&
    left.color === right.color &&
    left.cooldown === right.cooldown
  );
}

export function isMonFainted(mon: Mon): boolean {
  return mon.cooldown > 0;
}

export function faintMon(mon: Mon): void {
  mon.cooldown = 2;
}

export function decreaseMonCooldown(mon: Mon): void {
  if (mon.cooldown > 0) {
    mon.cooldown = toI32(mon.cooldown - 1);
  }
}

export function regularMana(color: Color): RegularMana {
  return { kind: "regular", color };
}

export function cloneMana(mana: Mana): Mana {
  return mana.kind === "regular" ? regularMana(mana.color) : SUPERMANA;
}

export function manaEquals(left: Mana, right: Mana): boolean {
  return (
    left.kind === right.kind &&
    (left.kind === "supermana" || left.color === (right as RegularMana).color)
  );
}

export function manaScore(mana: Mana, player: Color): number {
  if (mana.kind === "supermana") {
    return 2;
  }
  return mana.color === player ? 1 : 2;
}

export function monItem(mon: Mon): MonItem {
  return { kind: "mon", mon: cloneMon(mon) };
}

export function manaItem(mana: Mana): ManaItem {
  return { kind: "mana", mana: cloneMana(mana) };
}

export function monWithManaItem(mon: Mon, mana: Mana): MonWithManaItem {
  return { kind: "mon-with-mana", mon: cloneMon(mon), mana: cloneMana(mana) };
}

export function monWithConsumableItem(
  mon: Mon,
  consumable: Consumable,
): MonWithConsumableItem {
  return { kind: "mon-with-consumable", mon: cloneMon(mon), consumable };
}

export function consumableItem(consumable: Consumable): ConsumableItem {
  return { kind: "consumable", consumable };
}

export function cloneItem(item: Item): Item {
  switch (item.kind) {
    case "mon":
      return monItem(item.mon);
    case "mana":
      return manaItem(item.mana);
    case "mon-with-mana":
      return monWithManaItem(item.mon, item.mana);
    case "mon-with-consumable":
      return monWithConsumableItem(item.mon, item.consumable);
    case "consumable":
      return consumableItem(item.consumable);
  }
}

export function itemMon(item: Item): Mon | undefined {
  switch (item.kind) {
    case "mon":
    case "mon-with-mana":
    case "mon-with-consumable":
      return item.mon;
    case "mana":
    case "consumable":
      return undefined;
  }
}

export function itemMana(item: Item): Mana | undefined {
  switch (item.kind) {
    case "mana":
    case "mon-with-mana":
      return item.mana;
    case "mon":
    case "mon-with-consumable":
    case "consumable":
      return undefined;
  }
}

export function itemConsumable(item: Item): Consumable | undefined {
  switch (item.kind) {
    case "mon-with-consumable":
    case "consumable":
      return item.consumable;
    case "mon":
    case "mana":
    case "mon-with-mana":
      return undefined;
  }
}

export function itemEquals(left: Item, right: Item): boolean {
  if (left.kind !== right.kind) {
    return false;
  }
  switch (left.kind) {
    case "mon":
      return monEquals(left.mon, (right as MonItem).mon);
    case "mana":
      return manaEquals(left.mana, (right as ManaItem).mana);
    case "mon-with-mana": {
      const typedRight = right as MonWithManaItem;
      return (
        monEquals(left.mon, typedRight.mon) &&
        manaEquals(left.mana, typedRight.mana)
      );
    }
    case "mon-with-consumable": {
      const typedRight = right as MonWithConsumableItem;
      return (
        monEquals(left.mon, typedRight.mon) &&
        left.consumable === typedRight.consumable
      );
    }
    case "consumable":
      return left.consumable === (right as ConsumableItem).consumable;
  }
}

/** Stable value key for maps and caches; never use object identity for engine values. */
export function monKey(mon: Mon): string {
  return `${mon.kind}:${mon.color}:${mon.cooldown}`;
}

export function manaKey(mana: Mana): string {
  return mana.kind === "supermana" ? "s" : `r:${mana.color}`;
}

export function itemKey(item: Item): string {
  switch (item.kind) {
    case "mon":
      return `m:${monKey(item.mon)}`;
    case "mana":
      return `a:${manaKey(item.mana)}`;
    case "mon-with-mana":
      return `mm:${monKey(item.mon)}:${manaKey(item.mana)}`;
    case "mon-with-consumable":
      return `mc:${monKey(item.mon)}:${item.consumable}`;
    case "consumable":
      return `c:${item.consumable}`;
  }
}

export function cloneInput(input: Input): Input {
  switch (input.kind) {
    case "takeback":
      return { kind: "takeback" };
    case "location":
      return {
        kind: "location",
        location: { i: input.location.i, j: input.location.j },
      };
    case "modifier":
      return { kind: "modifier", modifier: input.modifier };
  }
}

export function cloneInputs(inputs: readonly Input[]): Input[] {
  return inputs.map(cloneInput);
}

export function inputKey(input: Input): string {
  switch (input.kind) {
    case "takeback":
      return "t";
    case "location":
      return `l:${input.location.i}:${input.location.j}`;
    case "modifier":
      return `m:${input.modifier}`;
  }
}

export function inputChainKey(inputs: readonly Input[]): string {
  return inputs.map(inputKey).join(";");
}

export function inputEquals(left: Input, right: Input): boolean {
  return inputKey(left) === inputKey(right);
}

export function inputChainsEqual(
  left: readonly Input[],
  right: readonly Input[],
): boolean {
  return (
    left.length === right.length &&
    left.every((input, index) => {
      const other = right[index];
      return other !== undefined && inputEquals(input, other);
    })
  );
}
