// prettier-ignore
export function winner(fen_w: string, fen_b: string, flat_moves_string_w: string, flat_moves_string_b: string): string;

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

export enum Consumable {
  Potion = 0,
  Bomb = 1,
  BombOrPotion = 2,
}

export enum SquareModelKind {
  Regular = 0,
  ConsumableBase = 1,
  SupermanaBase = 2,
  ManaBase = 3,
  ManaPool = 4,
  MonBase = 5,
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

export enum OutputModelKind {
  InvalidInput = 0,
  LocationsToStartFrom = 1,
  NextInputOptions = 2,
  Events = 3,
}

export enum ManaKind {
  Regular = 0,
  Supermana = 1,
}

export enum AvailableMoveKind {
  MonMove = 0,
  ManaMove = 1,
  Action = 2,
  Potion = 3,
}

export enum MonKind {
  Demon = 0,
  Drainer = 1,
  Angel = 2,
  Spirit = 3,
  Mystic = 4,
}

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

export enum ItemModelKind {
  Mon = 0,
  Mana = 1,
  MonWithMana = 2,
  MonWithConsumable = 3,
  Consumable = 4,
}

export enum Modifier {
  SelectPotion = 0,
  SelectBomb = 1,
  Cancel = 2,
}

export enum Color {
  White = 0,
  Black = 1,
}

export class EventModel {
  free(): void;
  color?: Color;
  item?: ItemModel;
  kind: EventModelKind;
  loc1?: Location;
  loc2?: Location;
  mana?: ManaModel;
  mon?: Mon;
}

export class ItemModel {
  free(): void;
  consumable?: Consumable;
  kind: ItemModelKind;
  mana?: ManaModel;
  mon?: Mon;
}

export class Location {
  free(): void;
  constructor(i: number, j: number);
  i: number;
  j: number;
}

export class ManaModel {
  free(): void;
  color: Color;
  kind: ManaKind;
}

export class Mon {
  free(): void;
  is_fainted(): boolean;
  decrease_cooldown(): void;
  static new(kind: MonKind, color: Color, cooldown: number): Mon;
  faint(): void;
  color: Color;
  cooldown: number;
  kind: MonKind;
}

// prettier-ignore
export class MonsGameModel {
  free(): void;
  black_score(): number;
  remove_item(location: Location): void;
  turn_number(): number;
  white_score(): number;
  active_color(): Color;
  can_takeback(color: Color): boolean;
  // prettier-ignore
  verify_moves(flat_moves_string_w: string, flat_moves_string_b: string): boolean;
  winner_color(): Color | undefined;
  is_later_than(other_fen: string): boolean;
  process_input(locations: (Location)[], modifier?: Modifier): OutputModel;
  takeback_fens(): (string)[];
  clearTracking(): void;
  smartAutomove(preference: string): OutputModel;
  is_moves_verified(): boolean;
  process_input_fen(input_fen: string): OutputModel;
  without_last_turn(takeback_fens: (string)[]): MonsGameModel | undefined;
  static newForSimulation(variant: GameVariant): MonsGameModel;
  available_move_kinds(): Int32Array;
  setVerboseTracking(enabled: boolean): void;
  locations_with_content(): (Location)[];
  static fromFenForSimulation(fen: string): MonsGameModel | undefined;
  verbose_tracking_entities(): (VerboseTrackingEntityModel)[];
  inactive_player_items_counters(): Int32Array;
  fen(): string;
  static new(variant: GameVariant): MonsGameModel;
  item(at: Location): ItemModel | undefined;
  square(at: Location): SquareModel;
  automove(): OutputModel;
  static from_fen(fen: string): MonsGameModel | undefined;
  takeback(): OutputModel;
}

export class NextInputModel {
  free(): void;
  actor_mon_item?: ItemModel;
  kind: NextInputKind;
  location?: Location;
  modifier?: Modifier;
}

// prettier-ignore
export class OutputModel {
  free(): void;
  next_inputs(): (NextInputModel)[];
  events(): (EventModel)[];
  input_fen(): string;
  locations(): (Location)[];
  kind: OutputModelKind;
}

export class SquareModel {
  free(): void;
  color?: Color;
  kind: SquareModelKind;
  mon_kind?: MonKind;
}

// prettier-ignore
export class VerboseTrackingEntityModel {
  free(): void;
  events_fen(): string;
  fen(): string;
  color(): Color;
  events(): (EventModel)[];
}
