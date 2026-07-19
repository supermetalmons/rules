import { Board } from "./board.js";
import {
  AvailableMoveKind,
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
  SUPERMANA,
  cloneInput,
  cloneItem,
  cloneMana,
  cloneMon,
  decreaseMonCooldown,
  faintMon,
  inputEquals,
  inputKey,
  isMonFainted,
  isSpiritTargetAllowed,
  itemConsumable,
  itemKey,
  itemMana,
  itemMon,
  manaItem,
  manaScore,
  monItem,
  monWithConsumableItem,
  monWithManaItem,
  otherColor,
  type Event,
  type Input,
  type Item,
  type NextInput,
  type Output,
  type Square,
} from "./domain.js";
import {
  ACTIONS_PER_TURN,
  DEFAULT_GAME_VARIANT,
  GameVariant,
  MANA_MOVES_PER_TURN,
  MONS_MOVES_PER_TURN,
  TARGET_SCORE,
} from "./config.js";
import { gameFen, parseGameFen, type GameFenState } from "./fen.js";
import {
  BOARD_CELLS,
  bombReachableLocations,
  cloneLocation,
  demonReachableLocations,
  locationBetween,
  locationDistance,
  locationEquals,
  locationIndex,
  mysticReachableLocations,
  nearbyLocations,
  spiritReachableLocations,
  type Location,
} from "./geometry.js";
import { addI32, subI32 } from "./numerics.js";

const START_SUGGESTIONS_CACHE_CAPACITY = 8;
const SECOND_INPUT_OPTIONS_CACHE_CAPACITY = 4_096;
const SECOND_STAGE_CACHE_CAPACITY = 8_192;
const THIRD_STAGE_CACHE_CAPACITY = 8_192;

export type VerboseTrackingEntity = {
  readonly fen: string;
  readonly color: Color;
  readonly events: readonly Event[];
};

export type SuggestedStartInputOptions = {
  readonly includeManaStartsWithPotionAction: boolean;
};

export const DEFAULT_SUGGESTED_START_INPUT_OPTIONS: SuggestedStartInputOptions =
  Object.freeze({
    includeManaStartsWithPotionAction: false,
  });

export const FOR_AUTOMOVE_START_INPUT_OPTIONS: SuggestedStartInputOptions =
  Object.freeze({
    includeManaStartsWithPotionAction: true,
  });

type StageResult =
  readonly [readonly Event[], readonly NextInput[]] | undefined;

type ProcessInputCache = {
  readonly startSuggestions: Map<string, Output>;
  readonly secondInputOptions: Map<string, readonly NextInput[]>;
  readonly secondStage: Map<string, StageResult>;
  readonly thirdStage: Map<string, StageResult>;
};

function createProcessInputCache(): ProcessInputCache {
  return {
    startSuggestions: new Map(),
    secondInputOptions: new Map(),
    secondStage: new Map(),
    thirdStage: new Map(),
  };
}

function cloneNextInput(nextInput: NextInput): NextInput {
  const base = {
    input: cloneInput(nextInput.input),
    kind: nextInput.kind,
  };
  return nextInput.actorMonItem === undefined
    ? base
    : { ...base, actorMonItem: cloneItem(nextInput.actorMonItem) };
}

function cloneEvent(event: Event): Event {
  switch (event.kind) {
    case "mon-move":
      return {
        kind: event.kind,
        item: cloneItem(event.item),
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
      };
    case "mana-move":
      return {
        kind: event.kind,
        mana: cloneMana(event.mana),
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
      };
    case "mana-scored":
    case "mana-dropped":
      return {
        kind: event.kind,
        mana: cloneMana(event.mana),
        at: cloneLocation(event.at),
      };
    case "mystic-action":
      return {
        kind: event.kind,
        mystic: cloneMon(event.mystic),
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
      };
    case "demon-action":
    case "demon-additional-step":
      return {
        kind: event.kind,
        demon: cloneMon(event.demon),
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
      };
    case "spirit-target-move":
      return {
        kind: event.kind,
        item: cloneItem(event.item),
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
        by: cloneLocation(event.by),
      };
    case "pickup-bomb":
      return {
        kind: event.kind,
        by: cloneMon(event.by),
        at: cloneLocation(event.at),
      };
    case "pickup-potion":
      return {
        kind: event.kind,
        by: cloneItem(event.by),
        at: cloneLocation(event.at),
      };
    case "use-potion":
    case "supermana-back-to-base":
      return {
        kind: event.kind,
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
      };
    case "pickup-mana":
      return {
        kind: event.kind,
        mana: cloneMana(event.mana),
        by: cloneMon(event.by),
        at: cloneLocation(event.at),
      };
    case "mon-fainted":
      return {
        kind: event.kind,
        mon: cloneMon(event.mon),
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
      };
    case "bomb-attack":
      return {
        kind: event.kind,
        by: cloneMon(event.by),
        from: cloneLocation(event.from),
        to: cloneLocation(event.to),
      };
    case "mon-awake":
      return {
        kind: event.kind,
        mon: cloneMon(event.mon),
        at: cloneLocation(event.at),
      };
    case "bomb-explosion":
      return { kind: event.kind, at: cloneLocation(event.at) };
    case "next-turn":
      return { kind: event.kind, color: event.color };
    case "game-over":
      return { kind: event.kind, winner: event.winner };
    case "takeback":
      return { kind: event.kind };
  }
}

function cloneOutput(output: Output): Output {
  switch (output.kind) {
    case "invalid-input":
      return { kind: output.kind };
    case "locations-to-start-from":
      return {
        kind: output.kind,
        locations: output.locations.map(cloneLocation),
      };
    case "next-input-options":
      return {
        kind: output.kind,
        nextInputs: output.nextInputs.map(cloneNextInput),
      };
    case "events":
      return { kind: output.kind, events: output.events.map(cloneEvent) };
  }
}

function boundedCacheInsert<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  capacity: number,
): void {
  if (cache.size >= capacity && !cache.has(key)) {
    cache.clear();
  }
  cache.set(key, value);
}

function nextInput(
  input: Input,
  kind: NextInputKind,
  actorMonItem?: Item,
): NextInput {
  const base = { input: cloneInput(input), kind };
  return actorMonItem === undefined
    ? base
    : { ...base, actorMonItem: cloneItem(actorMonItem) };
}

function regularSquareForMovement(square: Square): boolean {
  switch (square.kind) {
    case "regular":
    case "consumable-base":
    case "mana-base":
    case "mana-pool":
      return true;
    case "supermana-base":
    case "mon-base":
      return false;
  }
}

const MONS_GAME_BOARD_INITIALIZATION = Symbol();

type MonsGameBoardInitialization = {
  readonly [MONS_GAME_BOARD_INITIALIZATION]: Board;
};

export class MonsGame {
  public board: Board;
  public whiteScore: number;
  public blackScore: number;
  public activeColor: Color;
  public actionsUsedCount: number;
  public manaMovesCount: number;
  public monsMovesCount: number;
  public whitePotionsCount: number;
  public blackPotionsCount: number;
  public turnNumber: number;
  public takebackFens: string[];
  public isMovesVerified: boolean;
  public withVerboseTracking: boolean;
  public verboseTrackingEntities: VerboseTrackingEntity[];
  #trackTakebackHistory: boolean;
  #processInputCache: ProcessInputCache;

  public constructor(withVerboseTracking?: boolean, variant?: GameVariant);
  /** @internal Direct initialization for an already-created board. */
  public constructor(
    withVerboseTracking: boolean,
    variant: GameVariant,
    // eslint-disable-next-line @typescript-eslint/unified-signatures -- This internal overload is stripped from declarations, preserving the public constructor signature.
    initialization: MonsGameBoardInitialization,
  );
  public constructor(
    withVerboseTracking = false,
    variant: GameVariant = DEFAULT_GAME_VARIANT,
    initialization?: MonsGameBoardInitialization,
  ) {
    this.board =
      initialization?.[MONS_GAME_BOARD_INITIALIZATION] ?? new Board(variant);
    this.whiteScore = 0;
    this.blackScore = 0;
    this.activeColor = Color.White;
    this.actionsUsedCount = 0;
    this.manaMovesCount = 0;
    this.monsMovesCount = 0;
    this.whitePotionsCount = 0;
    this.blackPotionsCount = 0;
    this.turnNumber = 1;
    this.takebackFens = [];
    this.isMovesVerified = true;
    this.withVerboseTracking = withVerboseTracking;
    this.verboseTrackingEntities = [];
    this.#trackTakebackHistory = true;
    this.#processInputCache = createProcessInputCache();
  }

  /**
   * Copy only the scalar state represented by game FEN. Callers keep board,
   * history, tracking, and cache ownership explicit.
   */
  #copyFenFieldsFrom(state: GameFenState): void {
    this.whiteScore = state.whiteScore;
    this.blackScore = state.blackScore;
    this.activeColor = state.activeColor;
    this.actionsUsedCount = state.actionsUsedCount;
    this.manaMovesCount = state.manaMovesCount;
    this.monsMovesCount = state.monsMovesCount;
    this.whitePotionsCount = state.whitePotionsCount;
    this.blackPotionsCount = state.blackPotionsCount;
    this.turnNumber = state.turnNumber;
  }

  static #fromBoard(withVerboseTracking: boolean, board: Board): MonsGame {
    return new MonsGame(withVerboseTracking, board.variant(), {
      [MONS_GAME_BOARD_INITIALIZATION]: board,
    });
  }

  public static new(
    withVerboseTracking: boolean,
    variant: GameVariant,
  ): MonsGame {
    return new MonsGame(withVerboseTracking, variant);
  }

  public static newSimulationState(state: GameFenState): MonsGame {
    const game = MonsGame.#fromBoard(false, state.board);
    game.#copyFenFieldsFrom(state);
    game.#trackTakebackHistory = false;
    return game;
  }

  public static fromFen(
    fen: string,
    withVerboseTracking = false,
  ): MonsGame | undefined {
    const state = parseGameFen(fen);
    if (state === undefined) {
      return undefined;
    }
    const game = MonsGame.#fromBoard(withVerboseTracking, state.board);
    game.#copyFenFieldsFrom(state);
    game.takebackFens = [];
    game.isMovesVerified = false;
    game.verboseTrackingEntities = [];
    return game;
  }

  public fen(): string {
    return gameFen(this);
  }

  public clone(): MonsGame {
    const game = MonsGame.#fromBoard(
      this.withVerboseTracking,
      this.board.clone(),
    );
    game.#copyFenFieldsFrom(this);
    game.takebackFens = [...this.takebackFens];
    game.isMovesVerified = this.isMovesVerified;
    game.verboseTrackingEntities = this.verboseTrackingEntities.map(
      (entity) => ({
        fen: entity.fen,
        color: entity.color,
        events: entity.events.map(cloneEvent),
      }),
    );
    game.#trackTakebackHistory = this.#trackTakebackHistory;
    return game;
  }

  public cloneForSimulation(): MonsGame {
    const simulation = MonsGame.#fromBoard(
      false,
      this.board.cloneForSimulation(),
    );
    simulation.#copyFenFieldsFrom(this);
    simulation.#trackTakebackHistory = false;
    simulation.isMovesVerified = this.isMovesVerified;
    return simulation;
  }

  public variant(): GameVariant {
    return this.board.variant();
  }

  public replaceBoardItems(items: Iterable<readonly [Location, Item]>): void {
    const itemArray: (Item | undefined)[] = Array.from(
      { length: BOARD_CELLS },
      () => undefined,
    );
    for (const [at, item] of items) {
      itemArray[locationIndex(at)] = cloneItem(item);
    }
    this.board = Board.fromItems(itemArray, this.variant());
    this.takebackFens = [];
    this.verboseTrackingEntities = [];
    this.isMovesVerified = false;
    this.invalidateProcessInputCache();
  }

  public setTakebackHistoryTracking(enabled: boolean): void {
    this.#trackTakebackHistory = enabled;
    if (!enabled) {
      this.takebackFens = [];
    }
    this.invalidateProcessInputCache();
  }

  public invalidateProcessInputCache(): void {
    this.#processInputCache = createProcessInputCache();
  }

  public setVerboseTracking(enabled: boolean): void {
    this.withVerboseTracking = enabled;
    if (!enabled) {
      this.verboseTrackingEntities = [];
    }
  }

  public clearTracking(): void {
    this.takebackFens = [];
    this.verboseTrackingEntities = [];
    this.invalidateProcessInputCache();
  }

  #updateWith(otherGame: MonsGame): void {
    this.board = otherGame.board.clone();
    this.#copyFenFieldsFrom(otherGame);
    this.invalidateProcessInputCache();
  }

  public canTakeback(color: Color): boolean {
    return (
      this.#trackTakebackHistory &&
      this.takebackFens.length > 1 &&
      this.activeColor === color
    );
  }

  public processInput(
    input: readonly Input[],
    doNotApplyEvents: boolean,
    oneOptionEnough: boolean,
  ): Output {
    return this.processInputWithStartOptions(
      input,
      doNotApplyEvents,
      oneOptionEnough,
      undefined,
    );
  }

  public processInputWithStartOptions(
    input: readonly Input[],
    doNotApplyEvents: boolean,
    oneOptionEnough: boolean,
    suggestedStartOptions: SuggestedStartInputOptions | undefined,
  ): Output {
    return this.#processInputInternal(
      input,
      doNotApplyEvents,
      oneOptionEnough,
      suggestedStartOptions ?? DEFAULT_SUGGESTED_START_INPUT_OPTIONS,
    );
  }

  #processInputInternal(
    input: readonly Input[],
    doNotApplyEvents: boolean,
    oneOptionEnough: boolean,
    suggestedStartOptions: SuggestedStartInputOptions,
  ): Output {
    if (this.winnerColor() !== undefined) {
      return { kind: "invalid-input" };
    }
    if (input.length === 0) {
      const key = suggestedStartOptions.includeManaStartsWithPotionAction
        ? "1"
        : "0";
      const cached = this.#processInputCache.startSuggestions.get(key);
      if (cached !== undefined) {
        return cloneOutput(cached);
      }
      const output = this.#suggestedInputToStartWith(suggestedStartOptions);
      boundedCacheInsert(
        this.#processInputCache.startSuggestions,
        key,
        cloneOutput(output),
        START_SUGGESTIONS_CACHE_CAPACITY,
      );
      return output;
    }

    const firstInput = input[0];
    if (input.length === 1 && firstInput?.kind === "takeback") {
      if (!this.canTakeback(this.activeColor)) {
        return { kind: "invalid-input" };
      }
      this.takebackFens.pop();
      this.verboseTrackingEntities.pop();
      const previousFen = this.takebackFens[this.takebackFens.length - 1];
      if (previousFen === undefined) {
        return { kind: "invalid-input" };
      }
      const previousGame = MonsGame.fromFen(previousFen, false);
      if (previousGame !== undefined) {
        this.#updateWith(previousGame);
      }
      this.invalidateProcessInputCache();
      return { kind: "events", events: [{ kind: "takeback" }] };
    }

    if (firstInput?.kind !== "location") {
      return { kind: "invalid-input" };
    }
    const startLocation = firstInput.location;
    const boardStartItem = this.board.item(startLocation);
    if (boardStartItem === undefined) {
      return { kind: "invalid-input" };
    }
    const startItem = cloneItem(boardStartItem);
    const specificSecondInput = input[1];
    const secondInputOptions = this.#secondInputOptions(
      startLocation,
      startItem,
      oneOptionEnough,
      specificSecondInput,
    );

    if (specificSecondInput === undefined) {
      return secondInputOptions.length === 0
        ? { kind: "invalid-input" }
        : { kind: "next-input-options", nextInputs: secondInputOptions };
    }
    if (specificSecondInput.kind !== "location") {
      return { kind: "invalid-input" };
    }
    const targetLocation = specificSecondInput.location;
    const secondOption = secondInputOptions.find((option) =>
      inputEquals(option.input, specificSecondInput),
    );
    if (secondOption === undefined) {
      return { kind: "invalid-input" };
    }

    const specificThirdInput = input[2];
    const secondResult = this.#processSecondInput(
      secondOption.kind,
      startItem,
      startLocation,
      targetLocation,
    );
    const events = secondResult?.[0].map(cloneEvent) ?? [];
    const thirdInputOptions = secondResult?.[1].map(cloneNextInput) ?? [];

    if (specificThirdInput === undefined) {
      if (thirdInputOptions.length !== 0) {
        return { kind: "next-input-options", nextInputs: thirdInputOptions };
      }
      if (events.length !== 0) {
        return {
          kind: "events",
          events: doNotApplyEvents
            ? events
            : this.applyAndAddResultingEvents(events),
        };
      }
      return { kind: "invalid-input" };
    }

    const thirdInput = thirdInputOptions.find((option) =>
      inputEquals(option.input, specificThirdInput),
    );
    if (thirdInput === undefined) {
      return { kind: "invalid-input" };
    }
    const specificFourthInput = input[3];
    const thirdResult = this.#processThirdInput(
      thirdInput,
      startItem,
      startLocation,
      targetLocation,
    );
    events.push(...(thirdResult?.[0].map(cloneEvent) ?? []));
    const fourthInputOptions = thirdResult?.[1].map(cloneNextInput) ?? [];

    if (specificFourthInput === undefined) {
      if (fourthInputOptions.length !== 0) {
        return { kind: "next-input-options", nextInputs: fourthInputOptions };
      }
      if (events.length !== 0) {
        return {
          kind: "events",
          events: doNotApplyEvents
            ? events
            : this.applyAndAddResultingEvents(events),
        };
      }
      return { kind: "invalid-input" };
    }

    if (
      specificFourthInput.kind !== "modifier" ||
      thirdInput.input.kind !== "location"
    ) {
      return { kind: "invalid-input" };
    }
    const fourthInput = fourthInputOptions.find((option) =>
      inputEquals(option.input, specificFourthInput),
    );
    const actorMonItem = fourthInput?.actorMonItem;
    const actorMon =
      actorMonItem === undefined ? undefined : itemMon(actorMonItem);
    if (actorMonItem === undefined || actorMon === undefined) {
      return { kind: "invalid-input" };
    }
    switch (specificFourthInput.modifier) {
      case Modifier.SelectBomb:
        events.push({
          kind: "pickup-bomb",
          by: cloneMon(actorMon),
          at: cloneLocation(thirdInput.input.location),
        });
        break;
      case Modifier.SelectPotion:
        events.push({
          kind: "pickup-potion",
          by: cloneItem(actorMonItem),
          at: cloneLocation(thirdInput.input.location),
        });
        break;
      case Modifier.Cancel:
        return { kind: "invalid-input" };
    }
    return {
      kind: "events",
      events: doNotApplyEvents
        ? events
        : this.applyAndAddResultingEvents(events),
    };
  }

  #suggestedInputToStartWith(
    suggestedStartOptions: SuggestedStartInputOptions,
  ): Output {
    const suggestedLocations: Location[] = [];
    const seenLocations = Array.from({ length: BOARD_CELLS }, () => false);

    for (const at of this.board.allMonsLocations(this.activeColor)) {
      const output = this.#processInputInternal(
        [{ kind: "location", location: at }],
        true,
        true,
        suggestedStartOptions,
      );
      if (
        output.kind === "next-input-options" &&
        output.nextInputs.length !== 0
      ) {
        const index = locationIndex(at);
        if (!seenLocations[index]) {
          seenLocations[index] = true;
          suggestedLocations.push(at);
        }
      }
    }

    const shouldAddRegularManaStarts =
      this.playerCanMoveMana() &&
      ((!this.playerCanMoveMon() && !this.playerCanUseAction()) ||
        suggestedLocations.length === 0 ||
        (suggestedStartOptions.includeManaStartsWithPotionAction &&
          !this.playerCanMoveMon() &&
          this.actionsUsedCount >= ACTIONS_PER_TURN &&
          this.playerPotionsCount() > 0));

    if (shouldAddRegularManaStarts) {
      for (const at of this.board.allFreeRegularManaLocations(
        this.activeColor,
      )) {
        const output = this.#processInputInternal(
          [{ kind: "location", location: at }],
          true,
          true,
          suggestedStartOptions,
        );
        if (
          output.kind === "next-input-options" &&
          output.nextInputs.length !== 0
        ) {
          const index = locationIndex(at);
          if (!seenLocations[index]) {
            seenLocations[index] = true;
            suggestedLocations.push(at);
          }
        }
      }
    }

    return suggestedLocations.length === 0
      ? { kind: "invalid-input" }
      : { kind: "locations-to-start-from", locations: suggestedLocations };
  }

  #secondInputOptions(
    startLocation: Location,
    startItem: Item,
    onlyOne: boolean,
    specificNext: Input | undefined,
  ): NextInput[] {
    const cacheKey = `${locationIndex(startLocation)}|${itemKey(startItem)}|${onlyOne ? 1 : 0}|${
      specificNext === undefined ? "" : inputKey(specificNext)
    }`;
    const cached = this.#processInputCache.secondInputOptions.get(cacheKey);
    if (cached !== undefined) {
      return cached.map(cloneNextInput);
    }

    const specificLocation =
      specificNext?.kind === "location" ? specificNext.location : undefined;
    const opponentsAngelLocation = this.board.findAwakeAngel(
      otherColor(this.activeColor),
    );
    const startSquare = this.board.square(startLocation);
    const options: NextInput[] = [];

    switch (startItem.kind) {
      case "mon": {
        const mon = startItem.mon;
        if (mon.color !== this.activeColor || isMonFainted(mon)) {
          break;
        }
        if (this.playerCanMoveMon()) {
          options.push(
            ...this.nextInputsFromLocations(
              nearbyLocations(startLocation),
              NextInputKind.MonMove,
              onlyOne,
              specificNext === undefined
                ? undefined
                : specificNext.kind === "location"
                  ? specificNext.location
                  : startLocation,
              (at) => {
                const item = this.board.item(at);
                const square = this.board.square(at);
                let itemAllows: boolean;
                switch (item?.kind) {
                  case "mon":
                  case "mon-with-mana":
                  case "mon-with-consumable":
                    itemAllows = false;
                    break;
                  case "mana":
                    itemAllows = mon.kind === MonKind.Drainer;
                    break;
                  case "consumable":
                  case undefined:
                    itemAllows = true;
                    break;
                }
                if (!itemAllows) {
                  return false;
                }
                switch (square.kind) {
                  case "regular":
                  case "consumable-base":
                  case "mana-base":
                  case "mana-pool":
                    return true;
                  case "supermana-base":
                    return (
                      mon.kind === MonKind.Drainer &&
                      (item === undefined ||
                        (item.kind === "mana" &&
                          item.mana.kind === "supermana"))
                    );
                  case "mon-base":
                    return (
                      square.monKind === mon.kind && square.color === mon.color
                    );
                }
              },
            ),
          );
        }

        if (startSquare.kind !== "mon-base" && this.playerCanUseAction()) {
          switch (mon.kind) {
            case MonKind.Angel:
            case MonKind.Drainer:
              break;
            case MonKind.Mystic:
              options.push(
                ...this.nextInputsFromLocations(
                  mysticReachableLocations(startLocation),
                  NextInputKind.MysticAction,
                  onlyOne,
                  specificLocation,
                  (at) => {
                    const item = this.board.item(at);
                    if (
                      item === undefined ||
                      MonsGame.#isLocationGuardedByAngelLocation(
                        opponentsAngelLocation,
                        at,
                      )
                    ) {
                      return false;
                    }
                    const targetMon = itemMon(item);
                    return (
                      targetMon !== undefined &&
                      mon.color !== targetMon.color &&
                      !isMonFainted(targetMon)
                    );
                  },
                ),
              );
              break;
            case MonKind.Demon:
              options.push(
                ...this.nextInputsFromLocations(
                  demonReachableLocations(startLocation),
                  NextInputKind.DemonAction,
                  onlyOne,
                  specificLocation,
                  (at) => {
                    const item = this.board.item(at);
                    const between = locationBetween(startLocation, at);
                    const betweenSquare = this.board.square(between);
                    if (
                      item === undefined ||
                      MonsGame.#isLocationGuardedByAngelLocation(
                        opponentsAngelLocation,
                        at,
                      ) ||
                      this.board.item(between) !== undefined ||
                      betweenSquare.kind === "supermana-base" ||
                      betweenSquare.kind === "mon-base"
                    ) {
                      return false;
                    }
                    const targetMon = itemMon(item);
                    return (
                      targetMon !== undefined &&
                      mon.color !== targetMon.color &&
                      !isMonFainted(targetMon)
                    );
                  },
                ),
              );
              break;
            case MonKind.Spirit:
              options.push(
                ...this.nextInputsFromLocations(
                  spiritReachableLocations(startLocation),
                  NextInputKind.SpiritTargetCapture,
                  onlyOne,
                  specificLocation,
                  (at) => {
                    const item = this.board.item(at);
                    if (item === undefined) {
                      return false;
                    }
                    return isSpiritTargetAllowed(item);
                  },
                ),
              );
              break;
          }
        }
        break;
      }
      case "mana":
        if (
          startItem.mana.kind === "regular" &&
          startItem.mana.color === this.activeColor &&
          this.playerCanMoveMana()
        ) {
          options.push(
            ...this.nextInputsFromLocations(
              nearbyLocations(startLocation),
              NextInputKind.ManaMove,
              onlyOne,
              specificLocation,
              (at) => {
                const item = this.board.item(at);
                const square = this.board.square(at);
                if (item?.kind === "mon") {
                  return (
                    regularSquareForMovement(square) &&
                    item.mon.kind === MonKind.Drainer
                  );
                }
                if (item !== undefined) {
                  return false;
                }
                return regularSquareForMovement(square);
              },
            ),
          );
        }
        break;
      case "mon-with-mana":
        if (
          startItem.mon.color === this.activeColor &&
          this.playerCanMoveMon()
        ) {
          options.push(
            ...this.nextInputsFromLocations(
              nearbyLocations(startLocation),
              NextInputKind.MonMove,
              onlyOne,
              specificLocation,
              (at) => {
                const item = this.board.item(at);
                const square = this.board.square(at);
                switch (item?.kind) {
                  case "mon":
                  case "mon-with-mana":
                  case "mon-with-consumable":
                    return false;
                  case "mana":
                  case "consumable":
                    return true;
                  case undefined:
                    if (regularSquareForMovement(square)) {
                      return true;
                    }
                    return (
                      square.kind === "supermana-base" &&
                      startItem.mana.kind === "supermana"
                    );
                }
              },
            ),
          );
        }
        break;
      case "mon-with-consumable": {
        const mon = startItem.mon;
        if (mon.color !== this.activeColor) {
          break;
        }
        if (this.playerCanMoveMon()) {
          options.push(
            ...this.nextInputsFromLocations(
              nearbyLocations(startLocation),
              NextInputKind.MonMove,
              onlyOne,
              specificLocation,
              (at) => {
                const item = this.board.item(at);
                const square = this.board.square(at);
                switch (item?.kind) {
                  case "mon":
                  case "mana":
                  case "mon-with-mana":
                  case "mon-with-consumable":
                    return false;
                  case "consumable":
                    return true;
                  case undefined:
                    return regularSquareForMovement(square);
                }
              },
            ),
          );
        }
        if (startItem.consumable === Consumable.Bomb) {
          options.push(
            ...this.nextInputsFromLocations(
              bombReachableLocations(startLocation),
              NextInputKind.BombAttack,
              onlyOne,
              specificLocation,
              (at) => {
                const item = this.board.item(at);
                const targetMon =
                  item === undefined ? undefined : itemMon(item);
                return (
                  targetMon !== undefined &&
                  mon.color !== targetMon.color &&
                  !isMonFainted(targetMon)
                );
              },
            ),
          );
        }
        break;
      }
      case "consumable":
        break;
    }

    boundedCacheInsert(
      this.#processInputCache.secondInputOptions,
      cacheKey,
      options.map(cloneNextInput),
      SECOND_INPUT_OPTIONS_CACHE_CAPACITY,
    );
    return options;
  }

  #processSecondInput(
    kind: NextInputKind,
    startItem: Item,
    startLocation: Location,
    targetLocation: Location,
  ): StageResult {
    const cacheKey = `${kind}|${itemKey(startItem)}|${locationIndex(startLocation)}|${locationIndex(
      targetLocation,
    )}`;
    if (this.#processInputCache.secondStage.has(cacheKey)) {
      return this.#processInputCache.secondStage.get(cacheKey);
    }
    const computed = this.#processSecondInputUncached(
      kind,
      startItem,
      startLocation,
      targetLocation,
    );
    boundedCacheInsert(
      this.#processInputCache.secondStage,
      cacheKey,
      computed,
      SECOND_STAGE_CACHE_CAPACITY,
    );
    return computed;
  }

  #processSecondInputUncached(
    kind: NextInputKind,
    startItem: Item,
    startLocation: Location,
    targetLocation: Location,
  ): StageResult {
    const thirdInputOptions: NextInput[] = [];
    const events: Event[] = [];
    const targetSquare = this.board.square(targetLocation);
    const targetItem = this.board.item(targetLocation);

    switch (kind) {
      case NextInputKind.MonMove: {
        const movingMon = itemMon(startItem);
        if (movingMon === undefined) {
          return undefined;
        }
        events.push({
          kind: "mon-move",
          item: cloneItem(startItem),
          from: cloneLocation(startLocation),
          to: cloneLocation(targetLocation),
        });

        if (targetItem !== undefined) {
          switch (targetItem.kind) {
            case "mon":
            case "mon-with-mana":
            case "mon-with-consumable":
              return undefined;
            case "mana": {
              const startMana = itemMana(startItem);
              if (startMana !== undefined) {
                events.push({
                  kind: "mana-dropped",
                  mana: cloneMana(startMana),
                  at: cloneLocation(startLocation),
                });
              }
              events.push({
                kind: "pickup-mana",
                mana: cloneMana(targetItem.mana),
                by: cloneMon(movingMon),
                at: cloneLocation(targetLocation),
              });
              break;
            }
            case "consumable":
              switch (targetItem.consumable) {
                case Consumable.Bomb:
                case Consumable.Potion:
                  return undefined;
                case Consumable.BombOrPotion:
                  if (
                    itemConsumable(startItem) !== undefined ||
                    itemMana(startItem) !== undefined
                  ) {
                    events.push({
                      kind: "pickup-potion",
                      by: cloneItem(startItem),
                      at: cloneLocation(targetLocation),
                    });
                  } else {
                    thirdInputOptions.push(
                      nextInput(
                        { kind: "modifier", modifier: Modifier.SelectBomb },
                        NextInputKind.SelectConsumable,
                        startItem,
                      ),
                    );
                    thirdInputOptions.push(
                      nextInput(
                        { kind: "modifier", modifier: Modifier.SelectPotion },
                        NextInputKind.SelectConsumable,
                        startItem,
                      ),
                    );
                  }
                  break;
              }
              break;
          }
        }

        if (targetSquare.kind === "mana-pool") {
          const manaInHand = itemMana(startItem);
          if (manaInHand !== undefined) {
            events.push({
              kind: "mana-scored",
              mana: cloneMana(manaInHand),
              at: cloneLocation(targetLocation),
            });
          }
        }
        break;
      }
      case NextInputKind.ManaMove: {
        if (startItem.kind !== "mana") {
          return undefined;
        }
        const mana = startItem.mana;
        events.push({
          kind: "mana-move",
          mana: cloneMana(mana),
          from: cloneLocation(startLocation),
          to: cloneLocation(targetLocation),
        });
        if (targetItem !== undefined) {
          if (targetItem.kind !== "mon") {
            return undefined;
          }
          events.push({
            kind: "pickup-mana",
            mana: cloneMana(mana),
            by: cloneMon(targetItem.mon),
            at: cloneLocation(targetLocation),
          });
        }
        switch (targetSquare.kind) {
          case "regular":
          case "mana-base":
          case "consumable-base":
            break;
          case "mana-pool":
            events.push({
              kind: "mana-scored",
              mana: cloneMana(mana),
              at: cloneLocation(targetLocation),
            });
            break;
          case "mon-base":
          case "supermana-base":
            return undefined;
        }
        break;
      }
      case NextInputKind.MysticAction: {
        if (startItem.kind !== "mon") {
          return undefined;
        }
        events.push({
          kind: "mystic-action",
          mystic: cloneMon(startItem.mon),
          from: cloneLocation(startLocation),
          to: cloneLocation(targetLocation),
        });
        if (targetItem !== undefined) {
          const targetMon = itemMon(targetItem);
          if (targetMon === undefined) {
            return undefined;
          }
          events.push({
            kind: "mon-fainted",
            mon: cloneMon(targetMon),
            from: cloneLocation(targetLocation),
            to: this.board.base(targetMon),
          });
          if (targetItem.kind === "mon-with-mana") {
            if (targetItem.mana.kind === "regular") {
              events.push({
                kind: "mana-dropped",
                mana: cloneMana(targetItem.mana),
                at: cloneLocation(targetLocation),
              });
            } else {
              events.push({
                kind: "supermana-back-to-base",
                from: cloneLocation(targetLocation),
                to: this.board.supermanaBase(),
              });
            }
          }
          if (targetItem.kind === "mon-with-consumable") {
            switch (targetItem.consumable) {
              case Consumable.Bomb:
                events.push({
                  kind: "bomb-explosion",
                  at: cloneLocation(targetLocation),
                });
                break;
              case Consumable.Potion:
              case Consumable.BombOrPotion:
                return undefined;
            }
          }
        }
        break;
      }
      case NextInputKind.DemonAction: {
        if (startItem.kind !== "mon") {
          return undefined;
        }
        const startMon = startItem.mon;
        events.push({
          kind: "demon-action",
          demon: cloneMon(startMon),
          from: cloneLocation(startLocation),
          to: cloneLocation(targetLocation),
        });
        let requiresAdditionalStep = false;
        if (targetItem !== undefined) {
          const targetMon = itemMon(targetItem);
          if (targetMon === undefined) {
            return undefined;
          }
          events.push({
            kind: "mon-fainted",
            mon: cloneMon(targetMon),
            from: cloneLocation(targetLocation),
            to: this.board.base(targetMon),
          });
          if (targetItem.kind === "mon-with-mana") {
            if (targetItem.mana.kind === "regular") {
              requiresAdditionalStep = true;
              events.push({
                kind: "mana-dropped",
                mana: cloneMana(targetItem.mana),
                at: cloneLocation(targetLocation),
              });
            } else {
              events.push({
                kind: "supermana-back-to-base",
                from: cloneLocation(targetLocation),
                to: this.board.supermanaBase(),
              });
            }
          }
          if (targetItem.kind === "mon-with-consumable") {
            switch (targetItem.consumable) {
              case Consumable.Bomb:
                events.push({
                  kind: "bomb-explosion",
                  at: cloneLocation(targetLocation),
                });
                events.push({
                  kind: "mon-fainted",
                  mon: cloneMon(startMon),
                  from: cloneLocation(targetLocation),
                  to: this.board.base(startMon),
                });
                break;
              case Consumable.Potion:
              case Consumable.BombOrPotion:
                return undefined;
            }
          }
        }
        if (
          targetSquare.kind === "supermana-base" ||
          targetSquare.kind === "mon-base"
        ) {
          requiresAdditionalStep = true;
        }
        if (requiresAdditionalStep) {
          for (const at of nearbyLocations(targetLocation)) {
            const item = this.board.item(at);
            const square = this.board.square(at);
            if (item !== undefined && item.kind !== "consumable") {
              continue;
            }
            if (regularSquareForMovement(square)) {
              thirdInputOptions.push(
                nextInput(
                  { kind: "location", location: at },
                  NextInputKind.DemonAdditionalStep,
                ),
              );
            } else if (
              square.kind === "mon-base" &&
              square.monKind === startMon.kind &&
              square.color === startMon.color
            ) {
              thirdInputOptions.push(
                nextInput(
                  { kind: "location", location: at },
                  NextInputKind.DemonAdditionalStep,
                ),
              );
            }
          }
        }
        break;
      }
      case NextInputKind.SpiritTargetCapture: {
        if (targetItem === undefined) {
          return undefined;
        }
        const targetMon = itemMon(targetItem);
        const targetMana = itemMana(targetItem);
        thirdInputOptions.push(
          ...this.nextInputsFromLocations(
            nearbyLocations(targetLocation),
            NextInputKind.SpiritTargetMove,
            false,
            undefined,
            (at) => {
              const destinationItem = this.board.item(at);
              const destinationSquare = this.board.square(at);
              let validDestination: boolean;
              switch (destinationItem?.kind) {
                case "mon":
                  switch (targetItem.kind) {
                    case "mon":
                    case "mon-with-mana":
                    case "mon-with-consumable":
                      validDestination = false;
                      break;
                    case "mana":
                      validDestination =
                        destinationItem.mon.kind === MonKind.Drainer &&
                        !isMonFainted(destinationItem.mon);
                      break;
                    case "consumable":
                      validDestination =
                        targetItem.consumable === Consumable.BombOrPotion;
                      break;
                  }
                  break;
                case "mana":
                  validDestination =
                    targetMon?.kind === MonKind.Drainer &&
                    !isMonFainted(targetMon);
                  break;
                case "mon-with-mana":
                case "mon-with-consumable":
                  validDestination =
                    targetItem.kind === "consumable" &&
                    targetItem.consumable === Consumable.BombOrPotion;
                  break;
                case "consumable":
                  validDestination =
                    destinationItem.consumable === Consumable.BombOrPotion &&
                    (targetItem.kind === "mon" ||
                      targetItem.kind === "mon-with-mana" ||
                      targetItem.kind === "mon-with-consumable");
                  break;
                case undefined:
                  validDestination = true;
                  break;
              }
              if (!validDestination) {
                return false;
              }
              switch (destinationSquare.kind) {
                case "regular":
                case "consumable-base":
                case "mana-base":
                case "mana-pool":
                  return true;
                case "supermana-base": {
                  const destinationHasSupermana =
                    destinationItem?.kind === "mana" &&
                    destinationItem.mana.kind === "supermana";
                  return (
                    targetMana?.kind === "supermana" ||
                    (targetMana === undefined &&
                      targetMon?.kind === MonKind.Drainer &&
                      (destinationItem === undefined ||
                        destinationHasSupermana)) ||
                    (targetMon?.kind === MonKind.Drainer &&
                      destinationHasSupermana)
                  );
                }
                case "mon-base":
                  return (
                    targetMon?.kind === destinationSquare.monKind &&
                    targetMon.color === destinationSquare.color &&
                    targetMana === undefined &&
                    itemConsumable(targetItem) === undefined
                  );
              }
            },
          ),
        );
        break;
      }
      case NextInputKind.BombAttack: {
        const startMon = itemMon(startItem);
        if (startMon === undefined) {
          return undefined;
        }
        events.push({
          kind: "bomb-attack",
          by: cloneMon(startMon),
          from: cloneLocation(startLocation),
          to: cloneLocation(targetLocation),
        });
        if (targetItem !== undefined) {
          const targetMon = itemMon(targetItem);
          if (targetMon === undefined) {
            return undefined;
          }
          events.push({
            kind: "mon-fainted",
            mon: cloneMon(targetMon),
            from: cloneLocation(targetLocation),
            to: this.board.base(targetMon),
          });
          if (targetItem.kind === "mon-with-mana") {
            if (targetItem.mana.kind === "regular") {
              events.push({
                kind: "mana-dropped",
                mana: cloneMana(targetItem.mana),
                at: cloneLocation(targetLocation),
              });
            } else {
              events.push({
                kind: "supermana-back-to-base",
                from: cloneLocation(targetLocation),
                to: this.board.supermanaBase(),
              });
            }
          }
          if (targetItem.kind === "mon-with-consumable") {
            switch (targetItem.consumable) {
              case Consumable.Bomb:
                events.push({
                  kind: "bomb-explosion",
                  at: cloneLocation(targetLocation),
                });
                break;
              case Consumable.Potion:
              case Consumable.BombOrPotion:
                return undefined;
            }
          }
        }
        break;
      }
      case NextInputKind.DemonAdditionalStep:
      case NextInputKind.SpiritTargetMove:
      case NextInputKind.SelectConsumable:
        break;
    }

    return [events, thirdInputOptions];
  }

  #processThirdInput(
    thirdInput: NextInput,
    startItem: Item,
    startLocation: Location,
    targetLocation: Location,
  ): StageResult {
    const cacheKey = `${inputKey(thirdInput.input)}|${thirdInput.kind}|${
      thirdInput.actorMonItem === undefined
        ? ""
        : itemKey(thirdInput.actorMonItem)
    }|${itemKey(startItem)}|${locationIndex(startLocation)}|${locationIndex(targetLocation)}`;
    if (this.#processInputCache.thirdStage.has(cacheKey)) {
      return this.#processInputCache.thirdStage.get(cacheKey);
    }
    const computed = this.#processThirdInputUncached(
      thirdInput,
      startItem,
      startLocation,
      targetLocation,
    );
    boundedCacheInsert(
      this.#processInputCache.thirdStage,
      cacheKey,
      computed,
      THIRD_STAGE_CACHE_CAPACITY,
    );
    return computed;
  }

  #processThirdInputUncached(
    thirdInput: NextInput,
    startItem: Item,
    startLocation: Location,
    targetLocation: Location,
  ): StageResult {
    const targetItem = this.board.item(targetLocation);
    const fourthInputOptions: NextInput[] = [];
    const events: Event[] = [];

    switch (thirdInput.kind) {
      case NextInputKind.SpiritTargetMove: {
        if (thirdInput.input.kind !== "location" || targetItem === undefined) {
          return undefined;
        }
        const destinationLocation = thirdInput.input.location;
        const destinationItem = this.board.item(destinationLocation);
        const destinationSquare = this.board.square(destinationLocation);
        events.push({
          kind: "spirit-target-move",
          item: cloneItem(targetItem),
          from: cloneLocation(targetLocation),
          to: cloneLocation(destinationLocation),
          by: cloneLocation(startLocation),
        });

        if (destinationItem !== undefined) {
          switch (targetItem.kind) {
            case "mon":
              switch (destinationItem.kind) {
                case "mon":
                case "mon-with-mana":
                case "mon-with-consumable":
                  return undefined;
                case "mana":
                  events.push({
                    kind: "pickup-mana",
                    mana: cloneMana(destinationItem.mana),
                    by: cloneMon(targetItem.mon),
                    at: cloneLocation(destinationLocation),
                  });
                  break;
                case "consumable":
                  switch (destinationItem.consumable) {
                    case Consumable.Potion:
                    case Consumable.Bomb:
                      return undefined;
                    case Consumable.BombOrPotion:
                      fourthInputOptions.push(
                        nextInput(
                          { kind: "modifier", modifier: Modifier.SelectBomb },
                          NextInputKind.SelectConsumable,
                          targetItem,
                        ),
                      );
                      fourthInputOptions.push(
                        nextInput(
                          { kind: "modifier", modifier: Modifier.SelectPotion },
                          NextInputKind.SelectConsumable,
                          targetItem,
                        ),
                      );
                      break;
                  }
                  break;
              }
              break;
            case "mana":
              if (destinationItem.kind !== "mon") {
                return undefined;
              }
              events.push({
                kind: "pickup-mana",
                mana: cloneMana(targetItem.mana),
                by: cloneMon(destinationItem.mon),
                at: cloneLocation(destinationLocation),
              });
              break;
            case "mon-with-mana":
              switch (destinationItem.kind) {
                case "mon":
                case "mon-with-mana":
                case "mon-with-consumable":
                  return undefined;
                case "mana":
                  events.push({
                    kind: "mana-dropped",
                    mana: cloneMana(targetItem.mana),
                    at: cloneLocation(targetLocation),
                  });
                  events.push({
                    kind: "pickup-mana",
                    mana: cloneMana(destinationItem.mana),
                    by: cloneMon(targetItem.mon),
                    at: cloneLocation(destinationLocation),
                  });
                  break;
                case "consumable":
                  switch (destinationItem.consumable) {
                    case Consumable.Potion:
                    case Consumable.Bomb:
                      return undefined;
                    case Consumable.BombOrPotion:
                      events.push({
                        kind: "pickup-potion",
                        by: cloneItem(targetItem),
                        at: cloneLocation(destinationLocation),
                      });
                      break;
                  }
                  break;
              }
              break;
            case "mon-with-consumable":
              if (
                destinationItem.kind !== "consumable" ||
                destinationItem.consumable !== Consumable.BombOrPotion
              ) {
                return undefined;
              }
              events.push({
                kind: "pickup-potion",
                by: cloneItem(targetItem),
                at: cloneLocation(destinationLocation),
              });
              break;
            case "consumable":
              switch (destinationItem.kind) {
                case "mana":
                case "consumable":
                  return undefined;
                case "mon":
                  fourthInputOptions.push(
                    nextInput(
                      { kind: "modifier", modifier: Modifier.SelectBomb },
                      NextInputKind.SelectConsumable,
                      destinationItem,
                    ),
                  );
                  fourthInputOptions.push(
                    nextInput(
                      { kind: "modifier", modifier: Modifier.SelectPotion },
                      NextInputKind.SelectConsumable,
                      destinationItem,
                    ),
                  );
                  break;
                case "mon-with-mana":
                case "mon-with-consumable":
                  switch (targetItem.consumable) {
                    case Consumable.Potion:
                    case Consumable.Bomb:
                      return undefined;
                    case Consumable.BombOrPotion:
                      events.push({
                        kind: "pickup-potion",
                        by: cloneItem(destinationItem),
                        at: cloneLocation(destinationLocation),
                      });
                      break;
                  }
                  break;
              }
              break;
          }
        }

        if (destinationSquare.kind === "mana-pool") {
          const mana = itemMana(targetItem);
          if (mana !== undefined) {
            events.push({
              kind: "mana-scored",
              mana: cloneMana(mana),
              at: cloneLocation(destinationLocation),
            });
          }
        }
        break;
      }
      case NextInputKind.DemonAdditionalStep: {
        if (thirdInput.input.kind !== "location") {
          return undefined;
        }
        const demon = itemMon(startItem);
        if (demon === undefined) {
          return undefined;
        }
        const destinationLocation = thirdInput.input.location;
        events.push({
          kind: "demon-additional-step",
          demon: cloneMon(demon),
          from: cloneLocation(targetLocation),
          to: cloneLocation(destinationLocation),
        });
        const destinationItem = this.board.item(destinationLocation);
        if (destinationItem?.kind === "consumable") {
          switch (destinationItem.consumable) {
            case Consumable.Potion:
            case Consumable.Bomb:
              return undefined;
            case Consumable.BombOrPotion:
              fourthInputOptions.push(
                nextInput(
                  { kind: "modifier", modifier: Modifier.SelectBomb },
                  NextInputKind.SelectConsumable,
                  startItem,
                ),
              );
              fourthInputOptions.push(
                nextInput(
                  { kind: "modifier", modifier: Modifier.SelectPotion },
                  NextInputKind.SelectConsumable,
                  startItem,
                ),
              );
              break;
          }
        }
        break;
      }
      case NextInputKind.SelectConsumable: {
        if (thirdInput.input.kind !== "modifier") {
          return undefined;
        }
        const mon = itemMon(startItem);
        if (mon === undefined) {
          return undefined;
        }
        switch (thirdInput.input.modifier) {
          case Modifier.SelectBomb:
            events.push({
              kind: "pickup-bomb",
              by: cloneMon(mon),
              at: cloneLocation(targetLocation),
            });
            break;
          case Modifier.SelectPotion:
            events.push({
              kind: "pickup-potion",
              by: cloneItem(startItem),
              at: cloneLocation(targetLocation),
            });
            break;
          case Modifier.Cancel:
            return undefined;
        }
        break;
      }
      case NextInputKind.MonMove:
      case NextInputKind.ManaMove:
      case NextInputKind.MysticAction:
      case NextInputKind.DemonAction:
      case NextInputKind.SpiritTargetCapture:
      case NextInputKind.BombAttack:
        return undefined;
    }

    return [events, fourthInputOptions];
  }

  public applyAndAddResultingEvents(events: readonly Event[]): Event[] {
    this.invalidateProcessInputCache();

    if (this.#trackTakebackHistory && this.takebackFens.length === 0) {
      const initialFen = this.fen();
      this.takebackFens.push(initialFen);
      if (
        this.withVerboseTracking &&
        this.verboseTrackingEntities.length === 0
      ) {
        this.verboseTrackingEntities.push({
          fen: initialFen,
          color: this.activeColor,
          events: [],
        });
      }
    }

    const extraEvents: Event[] = [];
    for (const event of events) {
      switch (event.kind) {
        case "mon-move":
          this.monsMovesCount = addI32(this.monsMovesCount, 1);
          this.board.removeItem(event.from);
          this.board.put(event.item, event.to);
          break;
        case "mana-move":
          this.manaMovesCount = addI32(this.manaMovesCount, 1);
          this.board.removeItem(event.from);
          this.board.put(manaItem(event.mana), event.to);
          break;
        case "mana-scored": {
          const score = manaScore(event.mana, this.activeColor);
          if (this.activeColor === Color.White) {
            this.whiteScore = addI32(this.whiteScore, score);
          } else {
            this.blackScore = addI32(this.blackScore, score);
          }
          const item = this.board.item(event.at);
          if (item !== undefined) {
            const mon = itemMon(item);
            if (mon === undefined) {
              this.board.removeItem(event.at);
            } else {
              this.board.put(monItem(mon), event.at);
            }
          }
          break;
        }
        case "mystic-action":
          if (this.actionsUsedCount >= ACTIONS_PER_TURN) {
            if (this.activeColor === Color.White) {
              this.whitePotionsCount = subI32(this.whitePotionsCount, 1);
            } else {
              this.blackPotionsCount = subI32(this.blackPotionsCount, 1);
            }
            extraEvents.push({
              kind: "use-potion",
              from: cloneLocation(event.from),
              to: cloneLocation(event.to),
            });
          } else {
            this.actionsUsedCount = addI32(this.actionsUsedCount, 1);
          }
          this.board.removeItem(event.to);
          break;
        case "demon-action": {
          this.board.removeItem(event.from);
          const additionalDestination = events.find(
            (
              candidate,
            ): candidate is Extract<
              Event,
              { readonly kind: "demon-additional-step" }
            > => candidate.kind === "demon-additional-step",
          )?.to;
          if (additionalDestination === undefined) {
            this.board.put(monItem(event.demon), event.to);
          } else {
            this.board.removeItem(event.to);
          }
          if (this.actionsUsedCount >= ACTIONS_PER_TURN) {
            if (this.activeColor === Color.White) {
              this.whitePotionsCount = subI32(this.whitePotionsCount, 1);
            } else {
              this.blackPotionsCount = subI32(this.blackPotionsCount, 1);
            }
            const potionLocation = additionalDestination ?? event.to;
            extraEvents.push({
              kind: "use-potion",
              from: cloneLocation(potionLocation),
              to: cloneLocation(potionLocation),
            });
          } else {
            this.actionsUsedCount = addI32(this.actionsUsedCount, 1);
          }
          break;
        }
        case "demon-additional-step":
          this.board.put(monItem(event.demon), event.to);
          break;
        case "spirit-target-move":
          if (this.actionsUsedCount >= ACTIONS_PER_TURN) {
            if (this.activeColor === Color.White) {
              this.whitePotionsCount = subI32(this.whitePotionsCount, 1);
            } else {
              this.blackPotionsCount = subI32(this.blackPotionsCount, 1);
            }
            extraEvents.push({
              kind: "use-potion",
              from: cloneLocation(event.by),
              to: cloneLocation(event.to),
            });
          } else {
            this.actionsUsedCount = addI32(this.actionsUsedCount, 1);
          }
          this.board.removeItem(event.from);
          this.board.put(event.item, event.to);
          break;
        case "pickup-bomb":
          this.board.put(
            monWithConsumableItem(event.by, Consumable.Bomb),
            event.at,
          );
          break;
        case "pickup-potion": {
          const mon = itemMon(event.by);
          if (mon === undefined) {
            break;
          }
          if (mon.color === Color.White) {
            this.whitePotionsCount = addI32(this.whitePotionsCount, 1);
          } else {
            this.blackPotionsCount = addI32(this.blackPotionsCount, 1);
          }
          this.board.put(event.by, event.at);
          break;
        }
        case "pickup-mana":
          this.board.put(monWithManaItem(event.by, event.mana), event.at);
          break;
        case "mon-fainted": {
          const faintedMon = cloneMon(event.mon);
          faintMon(faintedMon);
          this.board.put(monItem(faintedMon), event.to);
          break;
        }
        case "mana-dropped":
          this.board.put(manaItem(event.mana), event.at);
          break;
        case "supermana-back-to-base": {
          const item = this.board.item(event.to);
          if (item?.kind === "mon") {
            this.board.put(monWithManaItem(item.mon, SUPERMANA), event.to);
          } else {
            this.board.put(manaItem(SUPERMANA), event.to);
          }
          break;
        }
        case "bomb-attack":
          this.board.removeItem(event.to);
          this.board.put(monItem(event.by), event.from);
          break;
        case "bomb-explosion":
          this.board.removeItem(event.at);
          break;
        case "mon-awake":
        case "game-over":
        case "next-turn":
        case "takeback":
        case "use-potion":
          break;
      }
    }

    const winner = this.winnerColor();
    if (winner !== undefined) {
      extraEvents.push({ kind: "game-over", winner });
      if (this.#trackTakebackHistory) {
        this.takebackFens = [];
      }
    } else if (
      (this.isFirstTurn() && !this.playerCanMoveMon()) ||
      (!this.isFirstTurn() && !this.playerCanMoveMana()) ||
      (!this.isFirstTurn() &&
        !this.playerCanMoveMon() &&
        this.board.findMana(this.activeColor) === undefined)
    ) {
      this.activeColor = otherColor(this.activeColor);
      this.turnNumber = addI32(this.turnNumber, 1);
      this.#resetTurnState();
      extraEvents.push({ kind: "next-turn", color: this.activeColor });

      for (const monLocation of this.board.faintedMonsLocations(
        this.activeColor,
      )) {
        const item = this.board.item(monLocation);
        const mon = item === undefined ? undefined : itemMon(item);
        if (mon !== undefined) {
          const updatedMon = cloneMon(mon);
          decreaseMonCooldown(updatedMon);
          if (!isMonFainted(updatedMon)) {
            extraEvents.push({
              kind: "mon-awake",
              mon: cloneMon(updatedMon),
              at: cloneLocation(monLocation),
            });
          }
          this.board.put(monItem(updatedMon), monLocation);
        }
      }
      if (this.#trackTakebackHistory) {
        this.takebackFens = [this.fen()];
      }
    } else if (this.#trackTakebackHistory) {
      this.takebackFens.push(this.fen());
    }

    const updatedEvents = [...events, ...extraEvents].map(cloneEvent);
    if (this.withVerboseTracking) {
      this.verboseTrackingEntities.push({
        fen: this.fen(),
        color: this.activeColor,
        events: updatedEvents.map(cloneEvent),
      });
    }
    return updatedEvents;
  }

  #resetTurnState(): void {
    this.actionsUsedCount = 0;
    this.manaMovesCount = 0;
    this.monsMovesCount = 0;
  }

  static #isLocationGuardedByAngelLocation(
    angelLocation: Location | undefined,
    targetLocation: Location,
  ): boolean {
    return (
      angelLocation !== undefined &&
      locationDistance(angelLocation, targetLocation) === 1
    );
  }

  public nextInputsFromLocations(
    locations: readonly Location[],
    kind: NextInputKind,
    onlyOne: boolean,
    specific: Location | undefined,
    filter: (location: Location) => boolean,
  ): NextInput[] {
    if (specific !== undefined) {
      if (
        locations.some((candidate) => locationEquals(candidate, specific)) &&
        filter(specific)
      ) {
        return [nextInput({ kind: "location", location: specific }, kind)];
      }
      return [];
    }
    if (onlyOne) {
      const one = locations.find(filter);
      return one === undefined
        ? []
        : [nextInput({ kind: "location", location: one }, kind)];
    }
    return locations
      .filter(filter)
      .map((at) => nextInput({ kind: "location", location: at }, kind));
  }

  public availableMoveKinds(): Map<AvailableMoveKind, number> {
    const moves = new Map<AvailableMoveKind, number>();
    moves.set(
      AvailableMoveKind.MonMove,
      subI32(MONS_MOVES_PER_TURN, this.monsMovesCount),
    );
    moves.set(AvailableMoveKind.Action, 0);
    moves.set(AvailableMoveKind.Potion, 0);
    moves.set(AvailableMoveKind.ManaMove, 0);
    if (this.turnNumber === 1) {
      return moves;
    }
    moves.set(
      AvailableMoveKind.Action,
      subI32(ACTIONS_PER_TURN, this.actionsUsedCount),
    );
    moves.set(AvailableMoveKind.Potion, this.playerPotionsCount());
    moves.set(
      AvailableMoveKind.ManaMove,
      subI32(MANA_MOVES_PER_TURN, this.manaMovesCount),
    );
    return moves;
  }

  public winnerColor(): Color | undefined {
    if (this.whiteScore >= TARGET_SCORE) {
      return Color.White;
    }
    return this.blackScore >= TARGET_SCORE ? Color.Black : undefined;
  }

  public isLaterThan(game: MonsGame): boolean {
    if (this.variant() !== game.variant()) {
      return false;
    }
    if (this.turnNumber > game.turnNumber) {
      return true;
    }
    if (this.turnNumber !== game.turnNumber) {
      return false;
    }
    return (
      this.playerPotionsCount() < game.playerPotionsCount() ||
      this.actionsUsedCount > game.actionsUsedCount ||
      this.manaMovesCount > game.manaMovesCount ||
      this.monsMovesCount > game.monsMovesCount ||
      this.board.faintedMonsLocations(otherColor(this.activeColor)).length >
        game.board.faintedMonsLocations(otherColor(game.activeColor)).length
    );
  }

  public isFirstTurn(): boolean {
    return this.turnNumber === 1;
  }

  public playerPotionsCount(): number {
    return this.activeColor === Color.White
      ? this.whitePotionsCount
      : this.blackPotionsCount;
  }

  public playerCanMoveMon(): boolean {
    return this.monsMovesCount < MONS_MOVES_PER_TURN;
  }

  public playerCanMoveMana(): boolean {
    return !this.isFirstTurn() && this.manaMovesCount < MANA_MOVES_PER_TURN;
  }

  public playerCanUseAction(): boolean {
    return (
      !this.isFirstTurn() &&
      (this.playerPotionsCount() > 0 ||
        this.actionsUsedCount < ACTIONS_PER_TURN)
    );
  }
}
