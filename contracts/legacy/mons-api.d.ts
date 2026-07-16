/* tslint:disable */
/* eslint-disable */
/**
* @param {string} fen_w
* @param {string} fen_b
* @param {string} flat_moves_string_w
* @param {string} flat_moves_string_b
* @returns {string}
*/
export function winner(fen_w: string, fen_b: string, flat_moves_string_w: string, flat_moves_string_b: string): string;
/**
*/
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
/**
*/
export enum Consumable {
  Potion = 0,
  Bomb = 1,
  BombOrPotion = 2,
}
/**
*/
export enum SquareModelKind {
  Regular = 0,
  ConsumableBase = 1,
  SupermanaBase = 2,
  ManaBase = 3,
  ManaPool = 4,
  MonBase = 5,
}
/**
*/
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
/**
*/
export enum OutputModelKind {
  InvalidInput = 0,
  LocationsToStartFrom = 1,
  NextInputOptions = 2,
  Events = 3,
}
/**
*/
export enum ManaKind {
  Regular = 0,
  Supermana = 1,
}
/**
*/
export enum AvailableMoveKind {
  MonMove = 0,
  ManaMove = 1,
  Action = 2,
  Potion = 3,
}
/**
*/
export enum MonKind {
  Demon = 0,
  Drainer = 1,
  Angel = 2,
  Spirit = 3,
  Mystic = 4,
}
/**
*/
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
/**
*/
export enum ItemModelKind {
  Mon = 0,
  Mana = 1,
  MonWithMana = 2,
  MonWithConsumable = 3,
  Consumable = 4,
}
/**
*/
export enum Modifier {
  SelectPotion = 0,
  SelectBomb = 1,
  Cancel = 2,
}
/**
*/
export enum Color {
  White = 0,
  Black = 1,
}
/**
*/
export class EventModel {
  free(): void;
/**
*/
  color?: Color;
/**
*/
  item?: ItemModel;
/**
*/
  kind: EventModelKind;
/**
*/
  loc1?: Location;
/**
*/
  loc2?: Location;
/**
*/
  mana?: ManaModel;
/**
*/
  mon?: Mon;
}
/**
*/
export class ItemModel {
  free(): void;
/**
*/
  consumable?: Consumable;
/**
*/
  kind: ItemModelKind;
/**
*/
  mana?: ManaModel;
/**
*/
  mon?: Mon;
}
/**
*/
export class Location {
  free(): void;
/**
* @param {number} i
* @param {number} j
*/
  constructor(i: number, j: number);
/**
*/
  i: number;
/**
*/
  j: number;
}
/**
*/
export class ManaModel {
  free(): void;
/**
*/
  color: Color;
/**
*/
  kind: ManaKind;
}
/**
*/
export class Mon {
  free(): void;
/**
* @returns {boolean}
*/
  is_fainted(): boolean;
/**
*/
  decrease_cooldown(): void;
/**
* @param {MonKind} kind
* @param {Color} color
* @param {number} cooldown
* @returns {Mon}
*/
  static new(kind: MonKind, color: Color, cooldown: number): Mon;
/**
*/
  faint(): void;
/**
*/
  color: Color;
/**
*/
  cooldown: number;
/**
*/
  kind: MonKind;
}
/**
*/
export class MonsGameModel {
  free(): void;
/**
* @returns {number}
*/
  black_score(): number;
/**
* @param {Location} location
*/
  remove_item(location: Location): void;
/**
* @returns {number}
*/
  turn_number(): number;
/**
* @returns {number}
*/
  white_score(): number;
/**
* @returns {Color}
*/
  active_color(): Color;
/**
* @param {Color} color
* @returns {boolean}
*/
  can_takeback(color: Color): boolean;
/**
* @param {string} flat_moves_string_w
* @param {string} flat_moves_string_b
* @returns {boolean}
*/
  verify_moves(flat_moves_string_w: string, flat_moves_string_b: string): boolean;
/**
* @returns {Color | undefined}
*/
  winner_color(): Color | undefined;
/**
* @param {string} other_fen
* @returns {boolean}
*/
  is_later_than(other_fen: string): boolean;
/**
* @param {(Location)[]} locations
* @param {Modifier | undefined} [modifier]
* @returns {OutputModel}
*/
  process_input(locations: (Location)[], modifier?: Modifier): OutputModel;
/**
* @returns {(string)[]}
*/
  takeback_fens(): (string)[];
/**
*/
  clearTracking(): void;
/**
* @param {string} preference
* @returns {OutputModel}
*/
  smartAutomove(preference: string): OutputModel;
/**
* @returns {boolean}
*/
  is_moves_verified(): boolean;
/**
* @param {string} input_fen
* @returns {OutputModel}
*/
  process_input_fen(input_fen: string): OutputModel;
/**
* @param {(string)[]} takeback_fens
* @returns {MonsGameModel | undefined}
*/
  without_last_turn(takeback_fens: (string)[]): MonsGameModel | undefined;
/**
* @param {GameVariant} variant
* @returns {MonsGameModel}
*/
  static newForSimulation(variant: GameVariant): MonsGameModel;
/**
* @returns {Int32Array}
*/
  available_move_kinds(): Int32Array;
/**
* @param {boolean} enabled
*/
  setVerboseTracking(enabled: boolean): void;
/**
* @returns {(Location)[]}
*/
  locations_with_content(): (Location)[];
/**
* @param {string} fen
* @returns {MonsGameModel | undefined}
*/
  static fromFenForSimulation(fen: string): MonsGameModel | undefined;
/**
* @returns {(VerboseTrackingEntityModel)[]}
*/
  verbose_tracking_entities(): (VerboseTrackingEntityModel)[];
/**
* @returns {Int32Array}
*/
  inactive_player_items_counters(): Int32Array;
/**
* @returns {string}
*/
  fen(): string;
/**
* @param {GameVariant} variant
* @returns {MonsGameModel}
*/
  static new(variant: GameVariant): MonsGameModel;
/**
* @param {Location} at
* @returns {ItemModel | undefined}
*/
  item(at: Location): ItemModel | undefined;
/**
* @param {Location} at
* @returns {SquareModel}
*/
  square(at: Location): SquareModel;
/**
* @returns {OutputModel}
*/
  automove(): OutputModel;
/**
* @param {string} fen
* @returns {MonsGameModel | undefined}
*/
  static from_fen(fen: string): MonsGameModel | undefined;
/**
* @returns {OutputModel}
*/
  takeback(): OutputModel;
}
/**
*/
export class NextInputModel {
  free(): void;
/**
*/
  actor_mon_item?: ItemModel;
/**
*/
  kind: NextInputKind;
/**
*/
  location?: Location;
/**
*/
  modifier?: Modifier;
}
/**
*/
export class OutputModel {
  free(): void;
/**
* @returns {(NextInputModel)[]}
*/
  next_inputs(): (NextInputModel)[];
/**
* @returns {(EventModel)[]}
*/
  events(): (EventModel)[];
/**
* @returns {string}
*/
  input_fen(): string;
/**
* @returns {(Location)[]}
*/
  locations(): (Location)[];
/**
*/
  kind: OutputModelKind;
}
/**
*/
export class SquareModel {
  free(): void;
/**
*/
  color?: Color;
/**
*/
  kind: SquareModelKind;
/**
*/
  mon_kind?: MonKind;
}
/**
*/
export class VerboseTrackingEntityModel {
  free(): void;
/**
* @returns {string}
*/
  events_fen(): string;
/**
* @returns {string}
*/
  fen(): string;
/**
* @returns {Color}
*/
  color(): Color;
/**
* @returns {(EventModel)[]}
*/
  events(): (EventModel)[];
}
