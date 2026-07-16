import {
  Color,
  Consumable,
  type Event,
  type Item,
  type Mana,
  type Mon as EngineMon,
  MonKind,
  Modifier,
  type NextInput,
  NextInputKind,
  type Output,
  type Square,
  cloneItem,
  cloneMon,
  decreaseMonCooldown,
  faintMon,
  isMonFainted,
} from "../engine/domain.js";
import {
  type Location as EngineLocation,
  cloneLocation,
  location,
} from "../engine/geometry.js";
import { toI32 } from "../engine/numerics.js";
import {
  assertModelInstance,
  coerceEnum,
  coerceOptionalEnum,
  isNullish,
} from "./coercion.js";
import { ModelStateMap } from "./model-state-map.js";

export enum OutputModelKind {
  InvalidInput = 0,
  LocationsToStartFrom = 1,
  NextInputOptions = 2,
  Events = 3,
}

export enum SquareModelKind {
  Regular = 0,
  ConsumableBase = 1,
  SupermanaBase = 2,
  ManaBase = 3,
  ManaPool = 4,
  MonBase = 5,
}

export enum ItemModelKind {
  Mon = 0,
  Mana = 1,
  MonWithMana = 2,
  MonWithConsumable = 3,
  Consumable = 4,
}

export enum ManaKind {
  Regular = 0,
  Supermana = 1,
}

export enum EventModelKind {
  MonMove = 0,
  ManaMove = 1,
  ManaScored = 2,
  MysticAction = 3,
  DemonAction = 4,
  DemonAdditionalStep = 5,
  SpiritTargetMove = 6,
  PickupBomb = 7,
  PickupPotion = 8,
  PickupMana = 9,
  MonFainted = 10,
  ManaDropped = 11,
  SupermanaBackToBase = 12,
  BombAttack = 13,
  MonAwake = 14,
  BombExplosion = 15,
  NextTurn = 16,
  GameOver = 17,
  Takeback = 18,
  UsePotion = 19,
}

Object.freeze(OutputModelKind);
Object.freeze(SquareModelKind);
Object.freeze(ItemModelKind);
Object.freeze(ManaKind);
Object.freeze(EventModelKind);

type LocationState = { i: number; j: number };
const locationStates = new ModelStateMap<Location, LocationState>();

function locationState(value: Location): LocationState {
  return locationStates.getOrInsert(value, () => ({ i: 0, j: 0 }));
}

export class Location {
  public constructor(i: number, j: number) {
    locationStates.set(this, { i: toI32(i), j: toI32(j) });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public get i(): number {
    return locationState(this).i;
  }

  public set i(value: number) {
    locationState(this).i = toI32(value);
  }

  public get j(): number {
    return locationState(this).j;
  }

  public set j(value: number) {
    locationState(this).j = toI32(value);
  }
}

export function locationModelFrom(value: EngineLocation): Location {
  return new Location(value.i, value.j);
}

export function locationModelToEngine(value: Location): EngineLocation {
  assertModelInstance(value, Location);
  return location(value.i, value.j);
}

type MonState = EngineMon;
const monStates = new ModelStateMap<Mon, MonState>();

function monState(value: Mon): MonState {
  return monStates.getOrInsert(value, () => ({
    kind: 0,
    color: 0,
    cooldown: 0,
  }));
}

export class Mon {
  public constructor() {
    monStates.set(this, { kind: 0, color: 0, cooldown: 0 });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public get kind(): EngineMon["kind"] {
    return monState(this).kind;
  }

  public set kind(value: EngineMon["kind"]) {
    monState(this).kind = coerceEnum(value, MonKind.Mystic);
  }

  public get color(): Color {
    return monState(this).color;
  }

  public set color(value: Color) {
    monState(this).color = coerceEnum(value, Color.Black);
  }

  public get cooldown(): number {
    return monState(this).cooldown;
  }

  public set cooldown(value: number) {
    monState(this).cooldown = toI32(value);
  }

  public is_fainted(): boolean {
    return isMonFainted(monState(this));
  }

  public decrease_cooldown(): void {
    decreaseMonCooldown(monState(this));
  }

  public static new(kind: MonKind, color: Color, cooldown: number): Mon {
    const coercedKind = coerceEnum(kind, MonKind.Mystic);
    const coercedColor = coerceEnum(color, Color.Black);
    const result = new Mon();
    monStates.set(result, {
      kind: coercedKind,
      color: coercedColor,
      cooldown: toI32(cooldown),
    });
    return result;
  }

  public faint(): void {
    faintMon(monState(this));
  }
}

export function monModelFrom(value: EngineMon): Mon {
  const result = new Mon();
  monStates.set(result, cloneMon(value));
  return result;
}

export function monModelToEngine(value: Mon): EngineMon {
  assertModelInstance(value, Mon);
  return cloneMon(monState(value));
}

type ManaModelState = { kind: ManaKind; color: Color };
const manaModelStates = new ModelStateMap<ManaModel, ManaModelState>();

function manaModelState(value: ManaModel): ManaModelState {
  return manaModelStates.getOrInsert(value, () => ({
    kind: ManaKind.Regular,
    color: Color.White,
  }));
}

export class ManaModel {
  public constructor() {
    manaModelStates.set(this, {
      kind: ManaKind.Regular,
      color: Color.White,
    });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public get kind(): ManaKind {
    return manaModelState(this).kind;
  }

  public set kind(value: ManaKind) {
    manaModelState(this).kind = coerceEnum(value, ManaKind.Supermana);
  }

  public get color(): Color {
    return manaModelState(this).color;
  }

  public set color(value: Color) {
    manaModelState(this).color = coerceEnum(value, Color.Black);
  }
}

function cloneManaModelState(value: ManaModelState): ManaModelState {
  return { kind: value.kind, color: value.color };
}

function manaModelStateFromEngine(value: Mana): ManaModelState {
  return value.kind === "regular"
    ? { kind: ManaKind.Regular, color: value.color }
    : { kind: ManaKind.Supermana, color: Color.White };
}

function manaModelFromState(value: ManaModelState): ManaModel {
  const result = new ManaModel();
  manaModelStates.set(result, cloneManaModelState(value));
  return result;
}

function manaModelStateFromModel(value: ManaModel): ManaModelState {
  assertModelInstance(value, ManaModel);
  return cloneManaModelState(manaModelState(value));
}

export function manaModelFrom(value: Mana): ManaModel {
  return manaModelFromState(manaModelStateFromEngine(value));
}

type ItemModelState = {
  kind: ItemModelKind;
  mon?: EngineMon;
  mana?: ManaModelState;
  consumable?: Consumable;
};
const itemModelStates = new ModelStateMap<ItemModel, ItemModelState>();

function itemModelState(value: ItemModel): ItemModelState {
  return itemModelStates.getOrInsert(value, () => ({
    kind: ItemModelKind.Mon,
  }));
}

export class ItemModel {
  public constructor() {
    itemModelStates.set(this, { kind: ItemModelKind.Mon });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public get kind(): ItemModelKind {
    return itemModelState(this).kind;
  }

  public set kind(value: ItemModelKind) {
    itemModelState(this).kind = coerceEnum(value, ItemModelKind.Consumable);
  }

  public get mon(): Mon | undefined {
    const value = itemModelState(this).mon;
    return value === undefined ? undefined : monModelFrom(value);
  }

  public set mon(value: Mon | undefined) {
    const state = itemModelState(this);
    if (isNullish(value)) {
      delete state.mon;
    } else {
      state.mon = monModelToEngine(value);
    }
  }

  public get mana(): ManaModel | undefined {
    const value = itemModelState(this).mana;
    return value === undefined ? undefined : manaModelFromState(value);
  }

  public set mana(value: ManaModel | undefined) {
    const state = itemModelState(this);
    if (isNullish(value)) {
      delete state.mana;
    } else {
      state.mana = manaModelStateFromModel(value);
    }
  }

  public get consumable(): Consumable | undefined {
    return itemModelState(this).consumable;
  }

  public set consumable(value: Consumable | undefined) {
    const state = itemModelState(this);
    const coerced = coerceOptionalEnum(value, Consumable.BombOrPotion);
    if (coerced === undefined) {
      delete state.consumable;
    } else {
      state.consumable = coerced;
    }
  }
}

function cloneItemModelState(value: ItemModelState): ItemModelState {
  const result: ItemModelState = { kind: value.kind };
  if (value.mon !== undefined) {
    result.mon = cloneMon(value.mon);
  }
  if (value.mana !== undefined) {
    result.mana = cloneManaModelState(value.mana);
  }
  if (value.consumable !== undefined) {
    result.consumable = value.consumable;
  }
  return result;
}

function itemModelStateFromEngine(value: Item): ItemModelState {
  switch (value.kind) {
    case "mon":
      return { kind: ItemModelKind.Mon, mon: cloneMon(value.mon) };
    case "mana":
      return {
        kind: ItemModelKind.Mana,
        mana: manaModelStateFromEngine(value.mana),
      };
    case "mon-with-mana":
      return {
        kind: ItemModelKind.MonWithMana,
        mon: cloneMon(value.mon),
        mana: manaModelStateFromEngine(value.mana),
      };
    case "mon-with-consumable":
      return {
        kind: ItemModelKind.MonWithConsumable,
        mon: cloneMon(value.mon),
        consumable: value.consumable,
      };
    case "consumable":
      return { kind: ItemModelKind.Consumable, consumable: value.consumable };
  }
}

function itemModelFromState(value: ItemModelState): ItemModel {
  const result = new ItemModel();
  itemModelStates.set(result, cloneItemModelState(value));
  return result;
}

function itemModelStateFromModel(value: ItemModel): ItemModelState {
  assertModelInstance(value, ItemModel);
  return cloneItemModelState(itemModelState(value));
}

export function itemModelFrom(value: Item): ItemModel {
  return itemModelFromState(itemModelStateFromEngine(value));
}

type NextInputModelState = {
  location?: EngineLocation;
  modifier?: Modifier;
  kind: NextInputKind;
  actorMonItem?: ItemModelState;
};
const nextInputModelStates = new ModelStateMap<
  NextInputModel,
  NextInputModelState
>();

function nextInputModelState(value: NextInputModel): NextInputModelState {
  return nextInputModelStates.getOrInsert(value, () => ({
    kind: NextInputKind.MonMove,
  }));
}

export class NextInputModel {
  public constructor() {
    nextInputModelStates.set(this, { kind: NextInputKind.MonMove });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public get location(): Location | undefined {
    const value = nextInputModelState(this).location;
    return value === undefined ? undefined : locationModelFrom(value);
  }

  public set location(value: Location | undefined) {
    const state = nextInputModelState(this);
    if (isNullish(value)) {
      delete state.location;
    } else {
      state.location = locationModelToEngine(value);
    }
  }

  public get modifier(): Modifier | undefined {
    return nextInputModelState(this).modifier;
  }

  public set modifier(value: Modifier | undefined) {
    const state = nextInputModelState(this);
    const coerced = coerceOptionalEnum(value, Modifier.Cancel);
    if (coerced === undefined) {
      delete state.modifier;
    } else {
      state.modifier = coerced;
    }
  }

  public get kind(): NextInputKind {
    return nextInputModelState(this).kind;
  }

  public set kind(value: NextInputKind) {
    nextInputModelState(this).kind = coerceEnum(
      value,
      NextInputKind.BombAttack,
    );
  }

  public get actor_mon_item(): ItemModel | undefined {
    const value = nextInputModelState(this).actorMonItem;
    return value === undefined ? undefined : itemModelFromState(value);
  }

  public set actor_mon_item(value: ItemModel | undefined) {
    const state = nextInputModelState(this);
    if (isNullish(value)) {
      delete state.actorMonItem;
    } else {
      state.actorMonItem = itemModelStateFromModel(value);
    }
  }
}

export function nextInputModelFrom(value: NextInput): NextInputModel {
  const result = new NextInputModel();
  const state: NextInputModelState = { kind: value.kind };
  if (value.input.kind === "location") {
    state.location = cloneLocation(value.input.location);
  } else if (value.input.kind === "modifier") {
    state.modifier = value.input.modifier;
  }
  if (value.actorMonItem !== undefined) {
    state.actorMonItem = itemModelStateFromEngine(value.actorMonItem);
  }
  nextInputModelStates.set(result, state);
  return result;
}

type EventModelState = {
  kind: EventModelKind;
  item?: ItemModelState;
  mon?: EngineMon;
  mana?: ManaModelState;
  loc1?: EngineLocation;
  loc2?: EngineLocation;
  color?: Color;
};
const eventModelStates = new ModelStateMap<EventModel, EventModelState>();

function eventModelState(value: EventModel): EventModelState {
  return eventModelStates.getOrInsert(value, () => ({
    kind: EventModelKind.MonMove,
  }));
}

export class EventModel {
  public constructor() {
    eventModelStates.set(this, { kind: EventModelKind.MonMove });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public get kind(): EventModelKind {
    return eventModelState(this).kind;
  }

  public set kind(value: EventModelKind) {
    eventModelState(this).kind = coerceEnum(value, EventModelKind.UsePotion);
  }

  public get item(): ItemModel | undefined {
    const value = eventModelState(this).item;
    return value === undefined ? undefined : itemModelFromState(value);
  }

  public set item(value: ItemModel | undefined) {
    const state = eventModelState(this);
    if (isNullish(value)) delete state.item;
    else state.item = itemModelStateFromModel(value);
  }

  public get mon(): Mon | undefined {
    const value = eventModelState(this).mon;
    return value === undefined ? undefined : monModelFrom(value);
  }

  public set mon(value: Mon | undefined) {
    const state = eventModelState(this);
    if (isNullish(value)) delete state.mon;
    else state.mon = monModelToEngine(value);
  }

  public get mana(): ManaModel | undefined {
    const value = eventModelState(this).mana;
    return value === undefined ? undefined : manaModelFromState(value);
  }

  public set mana(value: ManaModel | undefined) {
    const state = eventModelState(this);
    if (isNullish(value)) delete state.mana;
    else state.mana = manaModelStateFromModel(value);
  }

  public get loc1(): Location | undefined {
    const value = eventModelState(this).loc1;
    return value === undefined ? undefined : locationModelFrom(value);
  }

  public set loc1(value: Location | undefined) {
    const state = eventModelState(this);
    if (isNullish(value)) delete state.loc1;
    else state.loc1 = locationModelToEngine(value);
  }

  public get loc2(): Location | undefined {
    const value = eventModelState(this).loc2;
    return value === undefined ? undefined : locationModelFrom(value);
  }

  public set loc2(value: Location | undefined) {
    const state = eventModelState(this);
    if (isNullish(value)) delete state.loc2;
    else state.loc2 = locationModelToEngine(value);
  }

  public get color(): Color | undefined {
    return eventModelState(this).color;
  }

  public set color(value: Color | undefined) {
    const state = eventModelState(this);
    const coerced = coerceOptionalEnum(value, Color.Black);
    if (coerced === undefined) delete state.color;
    else state.color = coerced;
  }
}

function eventStateFrom(value: Event): EventModelState {
  switch (value.kind) {
    case "mon-move":
      return {
        kind: EventModelKind.MonMove,
        item: itemModelStateFromEngine(value.item),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "mana-move":
      return {
        kind: EventModelKind.ManaMove,
        mana: manaModelStateFromEngine(value.mana),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "mana-scored":
      return {
        kind: EventModelKind.ManaScored,
        mana: manaModelStateFromEngine(value.mana),
        loc1: cloneLocation(value.at),
      };
    case "mystic-action":
      return {
        kind: EventModelKind.MysticAction,
        mon: cloneMon(value.mystic),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "demon-action":
      return {
        kind: EventModelKind.DemonAction,
        mon: cloneMon(value.demon),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "demon-additional-step":
      return {
        kind: EventModelKind.DemonAdditionalStep,
        mon: cloneMon(value.demon),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "spirit-target-move":
      return {
        kind: EventModelKind.SpiritTargetMove,
        item: itemModelStateFromEngine(value.item),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "pickup-bomb":
      return {
        kind: EventModelKind.PickupBomb,
        mon: cloneMon(value.by),
        loc1: cloneLocation(value.at),
      };
    case "pickup-potion":
      return {
        kind: EventModelKind.PickupPotion,
        item: itemModelStateFromEngine(value.by),
        loc1: cloneLocation(value.at),
      };
    case "pickup-mana":
      return {
        kind: EventModelKind.PickupMana,
        mon: cloneMon(value.by),
        mana: manaModelStateFromEngine(value.mana),
        loc1: cloneLocation(value.at),
      };
    case "mon-fainted":
      return {
        kind: EventModelKind.MonFainted,
        mon: cloneMon(value.mon),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "mana-dropped":
      return {
        kind: EventModelKind.ManaDropped,
        mana: manaModelStateFromEngine(value.mana),
        loc1: cloneLocation(value.at),
      };
    case "supermana-back-to-base":
      return {
        kind: EventModelKind.SupermanaBackToBase,
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "bomb-attack":
      return {
        kind: EventModelKind.BombAttack,
        mon: cloneMon(value.by),
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
    case "mon-awake":
      return {
        kind: EventModelKind.MonAwake,
        mon: cloneMon(value.mon),
        loc1: cloneLocation(value.at),
      };
    case "bomb-explosion":
      return {
        kind: EventModelKind.BombExplosion,
        loc1: cloneLocation(value.at),
      };
    case "next-turn":
      return { kind: EventModelKind.NextTurn, color: value.color };
    case "game-over":
      return { kind: EventModelKind.GameOver, color: value.winner };
    case "takeback":
      return { kind: EventModelKind.Takeback };
    case "use-potion":
      return {
        kind: EventModelKind.UsePotion,
        loc1: cloneLocation(value.from),
        loc2: cloneLocation(value.to),
      };
  }
}

export function eventModelFrom(value: Event): EventModel {
  const result = new EventModel();
  eventModelStates.set(result, eventStateFrom(value));
  return result;
}

type SquareModelState = {
  kind: SquareModelKind;
  color?: Color;
  monKind?: MonKind;
};
const squareModelStates = new ModelStateMap<SquareModel, SquareModelState>();

function squareModelState(value: SquareModel): SquareModelState {
  return squareModelStates.getOrInsert(value, () => ({
    kind: SquareModelKind.Regular,
  }));
}

export class SquareModel {
  public constructor() {
    squareModelStates.set(this, { kind: SquareModelKind.Regular });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public get kind(): SquareModelKind {
    return squareModelState(this).kind;
  }

  public set kind(value: SquareModelKind) {
    squareModelState(this).kind = coerceEnum(value, SquareModelKind.MonBase);
  }

  public get color(): Color | undefined {
    return squareModelState(this).color;
  }

  public set color(value: Color | undefined) {
    const state = squareModelState(this);
    const coerced = coerceOptionalEnum(value, Color.Black);
    if (coerced === undefined) delete state.color;
    else state.color = coerced;
  }

  public get mon_kind(): MonKind | undefined {
    return squareModelState(this).monKind;
  }

  public set mon_kind(value: MonKind | undefined) {
    const state = squareModelState(this);
    const coerced = coerceOptionalEnum(value, MonKind.Mystic);
    if (coerced === undefined) delete state.monKind;
    else state.monKind = coerced;
  }
}

export function squareModelFrom(value: Square): SquareModel {
  const result = new SquareModel();
  switch (value.kind) {
    case "regular":
      squareModelStates.set(result, { kind: SquareModelKind.Regular });
      break;
    case "consumable-base":
      squareModelStates.set(result, { kind: SquareModelKind.ConsumableBase });
      break;
    case "supermana-base":
      squareModelStates.set(result, { kind: SquareModelKind.SupermanaBase });
      break;
    case "mana-base":
      squareModelStates.set(result, {
        kind: SquareModelKind.ManaBase,
        color: value.color,
      });
      break;
    case "mana-pool":
      squareModelStates.set(result, {
        kind: SquareModelKind.ManaPool,
        color: value.color,
      });
      break;
    case "mon-base":
      squareModelStates.set(result, {
        kind: SquareModelKind.MonBase,
        color: value.color,
        monKind: value.monKind,
      });
      break;
  }
  return result;
}

type OutputModelState = {
  locations: readonly EngineLocation[];
  nextInputs: readonly NextInput[];
  events: readonly Event[];
  inputFen: string;
};
const outputModelStates = new ModelStateMap<OutputModel, OutputModelState>();

function outputModelState(value: OutputModel): OutputModelState {
  return (
    outputModelStates.get(value) ?? {
      locations: [],
      nextInputs: [],
      events: [],
      inputFen: "",
    }
  );
}

export class OutputModel {
  public constructor() {
    outputModelStates.set(this, {
      locations: [],
      nextInputs: [],
      events: [],
      inputFen: "",
    });
    outputKinds.set(this, OutputModelKind.InvalidInput);
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public next_inputs(): NextInputModel[] {
    return outputModelState(this).nextInputs.map(nextInputModelFrom);
  }

  public events(): EventModel[] {
    return outputModelState(this).events.map(eventModelFrom);
  }

  public input_fen(): string {
    return outputModelState(this).inputFen;
  }

  public locations(): Location[] {
    return outputModelState(this).locations.map(locationModelFrom);
  }

  public get kind(): OutputModelKind {
    return outputKinds.get(this) ?? OutputModelKind.InvalidInput;
  }

  public set kind(value: OutputModelKind) {
    outputKinds.set(this, coerceEnum(value, OutputModelKind.Events));
  }
}

const outputKinds = new ModelStateMap<OutputModel, OutputModelKind>();

export function outputModelFrom(value: Output, inputFen: string): OutputModel {
  const result = new OutputModel();
  const state: OutputModelState = {
    locations:
      value.kind === "locations-to-start-from"
        ? value.locations.map(cloneLocation)
        : [],
    nextInputs:
      value.kind === "next-input-options"
        ? value.nextInputs.map((next) => ({
            ...next,
            input:
              next.input.kind === "location"
                ? {
                    kind: "location",
                    location: cloneLocation(next.input.location),
                  }
                : { ...next.input },
            ...(next.actorMonItem === undefined
              ? {}
              : { actorMonItem: cloneItem(next.actorMonItem) }),
          }))
        : [],
    events: value.kind === "events" ? [...value.events] : [],
    inputFen,
  };
  outputModelStates.set(result, state);
  const kind = (() => {
    switch (value.kind) {
      case "invalid-input":
        return OutputModelKind.InvalidInput;
      case "locations-to-start-from":
        return OutputModelKind.LocationsToStartFrom;
      case "next-input-options":
        return OutputModelKind.NextInputOptions;
      case "events":
        return OutputModelKind.Events;
    }
  })();
  outputKinds.set(result, kind);
  return result;
}

type VerboseTrackingState = {
  fen: string;
  color: Color;
  events: readonly Event[];
  eventsFen: string;
};
const verboseTrackingStates = new ModelStateMap<
  VerboseTrackingEntityModel,
  VerboseTrackingState
>();

function verboseTrackingState(
  value: VerboseTrackingEntityModel,
): VerboseTrackingState {
  return (
    verboseTrackingStates.get(value) ?? {
      fen: "",
      color: Color.White,
      events: [],
      eventsFen: "",
    }
  );
}

export class VerboseTrackingEntityModel {
  public constructor() {
    verboseTrackingStates.set(this, {
      fen: "",
      color: Color.White,
      events: [],
      eventsFen: "",
    });
  }

  public free(): void {
    // Pure TypeScript values do not own an external allocation.
  }

  public events_fen(): string {
    return verboseTrackingState(this).eventsFen;
  }

  public fen(): string {
    return verboseTrackingState(this).fen;
  }

  public color(): Color {
    return verboseTrackingState(this).color;
  }

  public events(): EventModel[] {
    return verboseTrackingState(this).events.map(eventModelFrom);
  }
}

export function verboseTrackingEntityModelFrom(
  fen: string,
  color: Color,
  events: readonly Event[],
  eventsFen: string,
): VerboseTrackingEntityModel {
  const result = new VerboseTrackingEntityModel();
  verboseTrackingStates.set(result, {
    fen,
    color,
    events: [...events],
    eventsFen,
  });
  return result;
}
