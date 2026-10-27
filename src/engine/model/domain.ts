import {
  Color,
  Consumable,
  Modifier,
  MonKind,
  type InputAction,
  type Mana,
  type Mon,
} from "../../api/types.js";
import type { Location } from "../board/geometry.js";

export { Color, Consumable, Modifier, MonKind };
export type { Mana, Mon, Square } from "../../api/types.js";

export const COLOR_IDS = Object.freeze({
  [Color.White]: 0,
  [Color.Black]: 1,
} as const satisfies Readonly<Record<Color, number>>);

export function colorId(color: Color): number {
  return COLOR_IDS[color];
}

export const MON_KIND_IDS = Object.freeze({
  [MonKind.Demon]: 0,
  [MonKind.Drainer]: 1,
  [MonKind.Angel]: 2,
  [MonKind.Spirit]: 3,
  [MonKind.Mystic]: 4,
} as const satisfies Readonly<Record<MonKind, number>>);

export const AvailableMoveKind = Object.freeze({
  MonMove: "mon-move",
  ManaMove: "mana-move",
  Action: "action",
  Potion: "potion",
} as const);
export type AvailableMoveKind =
  (typeof AvailableMoveKind)[keyof typeof AvailableMoveKind];

export const MODIFIER_RANK = Object.freeze({
  [Modifier.SelectPotion]: 0,
  [Modifier.SelectBomb]: 1,
} as const satisfies Readonly<Record<Modifier, number>>);

export const NextInputKind = Object.freeze({
  MonMove: "mon-move",
  ManaMove: "mana-move",
  MysticAction: "mystic-action",
  DemonAction: "demon-action",
  DemonAdditionalStep: "demon-additional-step",
  SpiritTargetCapture: "spirit-target-capture",
  SpiritTargetMove: "spirit-target-move",
  SelectConsumable: "select-consumable",
  BombAttack: "bomb-attack",
} as const satisfies Readonly<Record<string, InputAction>>);
export type NextInputKind = InputAction;

type RegularMana = Extract<Mana, { readonly kind: "regular" }>;

type Supermana = Extract<Mana, { readonly kind: "supermana" }>;

type MonItem = {
  readonly kind: "mon";
  readonly mon: Mon;
};

type ManaItem = {
  readonly kind: "mana";
  readonly mana: Mana;
};

type MonWithManaItem = {
  readonly kind: "mon-with-mana";
  readonly mon: Mon;
  readonly mana: Mana;
};

type MonWithConsumableItem = {
  readonly kind: "mon-with-consumable";
  readonly mon: Mon;
  readonly consumable: Consumable;
};

type ConsumableItem = {
  readonly kind: "consumable";
  readonly consumable: Consumable;
};

export type Item =
  MonItem | ManaItem | MonWithManaItem | MonWithConsumableItem | ConsumableItem;

export type Input =
  | { readonly kind: "takeback" }
  | { readonly kind: "location"; readonly location: Location }
  | { readonly kind: "modifier"; readonly modifier: Modifier };

/** Maximum number of semantic inputs consumed by one complete move. */
export const MAX_INPUTS_PER_MOVE = 4;

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
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 2) {
    throw new RangeError("mon cooldown must be an integer from 0 through 2");
  }
  return Object.freeze({ kind, color, cooldown });
}

export function isMonFainted(mon: Mon): boolean {
  return mon.cooldown > 0;
}

export function faintMon(mon: Mon): Mon {
  return createMon(mon.kind, mon.color, 2);
}

export function decreaseMonCooldown(mon: Mon): Mon {
  return mon.cooldown > 0
    ? createMon(mon.kind, mon.color, mon.cooldown - 1)
    : immutableMon(mon);
}

export function regularMana(color: Color): RegularMana {
  return Object.freeze({ kind: "regular", color });
}

export function manaScoreForOwnership(
  isSupermana: boolean,
  ownedByPlayer: boolean,
): number {
  return isSupermana || !ownedByPlayer ? 2 : 1;
}

export function manaScore(mana: Mana, player: Color): number {
  return manaScoreForOwnership(
    mana.kind === "supermana",
    mana.kind === "regular" && mana.color === player,
  );
}

export function monItem(mon: Mon): MonItem {
  return Object.freeze({ kind: "mon", mon: immutableMon(mon) });
}

export function manaItem(mana: Mana): ManaItem {
  return Object.freeze({ kind: "mana", mana: immutableMana(mana) });
}

export function monWithManaItem(mon: Mon, mana: Mana): MonWithManaItem {
  return Object.freeze({
    kind: "mon-with-mana",
    mon: immutableMon(mon),
    mana: immutableMana(mana),
  });
}

export function monWithConsumableItem(
  mon: Mon,
  consumable: Consumable,
): MonWithConsumableItem {
  return Object.freeze({
    kind: "mon-with-consumable",
    mon: immutableMon(mon),
    consumable,
  });
}

export function consumableItem(consumable: Consumable): ConsumableItem {
  return Object.freeze({ kind: "consumable", consumable });
}

function immutableMon(mon: Mon): Mon {
  return Object.isFrozen(mon) ? mon : createMon(mon.kind, mon.color, mon.cooldown);
}

function immutableMana(mana: Mana): Mana {
  if (mana.kind === "supermana") return SUPERMANA;
  return Object.isFrozen(mana) ? mana : regularMana(mana.color);
}

/** Normalize an item to a deeply frozen value safe to share between forks. */
export function immutableItem(item: Item): Item {
  switch (item.kind) {
    case "mon":
      return Object.isFrozen(item) && Object.isFrozen(item.mon)
        ? item
        : monItem(item.mon);
    case "mana":
      return Object.isFrozen(item) && Object.isFrozen(item.mana)
        ? item
        : manaItem(item.mana);
    case "mon-with-mana":
      return Object.isFrozen(item) &&
        Object.isFrozen(item.mon) &&
        Object.isFrozen(item.mana)
        ? item
        : monWithManaItem(item.mon, item.mana);
    case "mon-with-consumable":
      return Object.isFrozen(item) && Object.isFrozen(item.mon)
        ? item
        : monWithConsumableItem(item.mon, item.consumable);
    case "consumable":
      return Object.isFrozen(item) ? item : consumableItem(item.consumable);
  }
}

function copyLocation(value: Location): Location {
  return { i: value.i, j: value.j };
}

/**
 * Copy an engine input's mutable wrapper and location layers.
 *
 * Frozen scalar domain values are normalized and shared by the related copy
 * helpers below; callers remain free to mutate returned wrappers and locations.
 */
function copyInput(input: Input): Input {
  switch (input.kind) {
    case "takeback":
      return { kind: "takeback" };
    case "location":
      return { kind: "location", location: copyLocation(input.location) };
    case "modifier":
      return { kind: "modifier", modifier: input.modifier };
  }
}

export function copyNextInput(nextInput: NextInput): NextInput {
  const input = copyInput(nextInput.input);
  if (nextInput.actorMonItem === undefined) {
    return { input, kind: nextInput.kind };
  }
  return {
    input,
    kind: nextInput.kind,
    actorMonItem: immutableItem(nextInput.actorMonItem),
  };
}

export function copyEvent(event: Event): Event {
  switch (event.kind) {
    case "mon-move":
      return {
        kind: "mon-move",
        item: immutableItem(event.item),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "mana-move":
      return {
        kind: "mana-move",
        mana: immutableMana(event.mana),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "mana-scored":
      return {
        kind: "mana-scored",
        mana: immutableMana(event.mana),
        at: copyLocation(event.at),
      };
    case "mystic-action":
      return {
        kind: "mystic-action",
        mystic: immutableMon(event.mystic),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "demon-action":
      return {
        kind: "demon-action",
        demon: immutableMon(event.demon),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "demon-additional-step":
      return {
        kind: "demon-additional-step",
        demon: immutableMon(event.demon),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "spirit-target-move":
      return {
        kind: "spirit-target-move",
        item: immutableItem(event.item),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
        by: copyLocation(event.by),
      };
    case "pickup-bomb":
      return {
        kind: "pickup-bomb",
        by: immutableMon(event.by),
        at: copyLocation(event.at),
      };
    case "pickup-potion":
      return {
        kind: "pickup-potion",
        by: immutableItem(event.by),
        at: copyLocation(event.at),
      };
    case "use-potion":
      return {
        kind: "use-potion",
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "pickup-mana":
      return {
        kind: "pickup-mana",
        mana: immutableMana(event.mana),
        by: immutableMon(event.by),
        at: copyLocation(event.at),
      };
    case "mon-fainted":
      return {
        kind: "mon-fainted",
        mon: immutableMon(event.mon),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "mana-dropped":
      return {
        kind: "mana-dropped",
        mana: immutableMana(event.mana),
        at: copyLocation(event.at),
      };
    case "supermana-back-to-base":
      return {
        kind: "supermana-back-to-base",
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "bomb-attack":
      return {
        kind: "bomb-attack",
        by: immutableMon(event.by),
        from: copyLocation(event.from),
        to: copyLocation(event.to),
      };
    case "mon-awake":
      return {
        kind: "mon-awake",
        mon: immutableMon(event.mon),
        at: copyLocation(event.at),
      };
    case "bomb-explosion":
      return { kind: "bomb-explosion", at: copyLocation(event.at) };
    case "next-turn":
      return { kind: "next-turn", color: event.color };
    case "game-over":
      return { kind: "game-over", winner: event.winner };
    case "takeback":
      return { kind: "takeback" };
  }
}

export function copyOutput(output: Output): Output {
  switch (output.kind) {
    case "invalid-input":
      return { kind: "invalid-input" };
    case "locations-to-start-from":
      return {
        kind: "locations-to-start-from",
        locations: output.locations.map(copyLocation),
      };
    case "next-input-options":
      return {
        kind: "next-input-options",
        nextInputs: output.nextInputs.map(copyNextInput),
      };
    case "events":
      return { kind: "events", events: output.events.map(copyEvent) };
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

export function isSpiritTargetAllowed(item: Item): boolean {
  const mon = itemMon(item);
  return mon === undefined || !isMonFainted(mon);
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

/** Stable value key for maps and caches; never use object identity for engine values. */
function monKey(mon: Mon): string {
  return `${mon.kind}:${mon.color}:${mon.cooldown}`;
}

function manaKey(mana: Mana): string {
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
  switch (left.kind) {
    case "takeback":
      return right.kind === "takeback";
    case "location":
      return (
        right.kind === "location" &&
        left.location.i === right.location.i &&
        left.location.j === right.location.j
      );
    case "modifier":
      return right.kind === "modifier" && left.modifier === right.modifier;
  }
}
