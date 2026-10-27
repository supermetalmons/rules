import { Board, MutableBoard } from "../board/storage.js";
import {
  AvailableMoveKind,
  Color,
  NextInputKind,
  MAX_INPUTS_PER_MOVE,
  inputChainKey,
  inputKey,
  itemKey,
  otherColor,
  type Event,
  type Input,
  type Item,
  type NextInput,
  type Output,
} from "../model/domain.js";
import {
  ACTIONS_PER_TURN,
  DEFAULT_GAME_VARIANT,
  GameVariant,
  MANA_MOVES_PER_TURN,
  MONS_MOVES_PER_TURN,
} from "../board/config.js";
import { gameFen, parseGameFen, type GameFenState } from "../codec/game-board.js";
import { applyRulesEvents, canApplyRulesEvents } from "../rules/event-reducer.js";
import type { MutableRulesState } from "../rules/state.js";
import { locationIndex, type Location } from "../board/geometry.js";
import { CACHE_MISS, RulesQueryCache, type InputStageResult } from "./query-cache.js";
import {
  GameHistory,
  type HistoryReplacement,
  type VerboseTrackingEntity,
} from "./history.js";
import {
  canPlayerMoveMana,
  canPlayerMoveMon,
  canPlayerUseAction,
  currentPlayerPotions,
  isFirstTurnState,
  winnerForState,
} from "../rules/legality.js";
import {
  DEFAULT_SUGGESTED_START_INPUT_OPTIONS,
  nextInputsFromLocations,
  type SuggestedStartInputOptions,
} from "./input-support.js";
import { generateSecondInputOptions } from "./input-options.js";
import { compileSecondInput, compileThirdInput } from "./event-compilation.js";
import { suggestedInputToStartWith } from "./start-inputs.js";
import { dispatchStagedInput } from "./staged-input.js";

export class MonsGame {
  #state: MutableRulesState;
  #history: GameHistory;
  readonly #queryCache: RulesQueryCache;
  readonly #stagedInputContext: Parameters<typeof dispatchStagedInput>[0];

  public constructor(
    withVerboseTracking = false,
    variant: GameVariant = DEFAULT_GAME_VARIANT,
    board?: Board,
  ) {
    const ownedBoard = board === undefined ? new MutableBoard(variant) : board.fork();
    this.#state = {
      board: ownedBoard,
      whiteScore: 0,
      blackScore: 0,
      activeColor: Color.White,
      actionsUsedCount: 0,
      manaMovesCount: 0,
      monsMovesCount: 0,
      whitePotionsCount: 0,
      blackPotionsCount: 0,
      turnNumber: 1,
    };
    this.#history = new GameHistory(withVerboseTracking);
    this.#queryCache = new RulesQueryCache();
    this.#stagedInputContext = {
      board: () => this.board,
      requiresCounterCapacityFiltering: () => this.#requiresCounterCapacityFiltering(),
      secondInputOptions: (...args) => this.#secondInputOptions(...args),
      processSecondInput: (...args) => this.#processSecondInput(...args),
      processThirdInput: (...args) => this.#processThirdInput(...args),
      applicableInputOptions: (...args) => this.#applicableInputOptions(...args),
      resolveEvents: (...args) => this.#resolveEvents(...args),
    };
  }

  public get board(): Board {
    return this.#state.board.readonlyView();
  }

  public get whiteScore(): number {
    return this.#state.whiteScore;
  }

  public get blackScore(): number {
    return this.#state.blackScore;
  }

  public get activeColor(): Color {
    return this.#state.activeColor;
  }

  public get actionsUsedCount(): number {
    return this.#state.actionsUsedCount;
  }

  public get manaMovesCount(): number {
    return this.#state.manaMovesCount;
  }

  public get monsMovesCount(): number {
    return this.#state.monsMovesCount;
  }

  public get whitePotionsCount(): number {
    return this.#state.whitePotionsCount;
  }

  public get blackPotionsCount(): number {
    return this.#state.blackPotionsCount;
  }

  public get turnNumber(): number {
    return this.#state.turnNumber;
  }

  public get takebackFens(): readonly string[] {
    return this.#history.takebackFens;
  }

  public get isMovesVerified(): boolean {
    return this.#history.movesVerified;
  }

  public get withVerboseTracking(): boolean {
    return this.#history.verboseTrackingEnabled;
  }

  public get verboseTrackingEntities(): readonly VerboseTrackingEntity[] {
    return this.#history.trackingEntries;
  }

  public replaceHistory(replacement: HistoryReplacement): void {
    this.#history.replace(replacement);
  }

  /**
   * Copy only the scalar state represented by game FEN. Callers keep board,
   * history, tracking, and cache ownership explicit.
   */
  #copyFenFieldsFrom(state: GameFenState): void {
    this.#state.whiteScore = state.whiteScore;
    this.#state.blackScore = state.blackScore;
    this.#state.activeColor = state.activeColor;
    this.#state.actionsUsedCount = state.actionsUsedCount;
    this.#state.manaMovesCount = state.manaMovesCount;
    this.#state.monsMovesCount = state.monsMovesCount;
    this.#state.whitePotionsCount = state.whitePotionsCount;
    this.#state.blackPotionsCount = state.blackPotionsCount;
    this.#state.turnNumber = state.turnNumber;
  }

  static #fromBoard(withVerboseTracking: boolean, board: Board): MonsGame {
    return new MonsGame(withVerboseTracking, board.variant, board);
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
    game.#history.resetForLoadedFen();
    return game;
  }

  public fen(): string {
    return gameFen(this);
  }

  public copy(): MonsGame {
    const game = MonsGame.#fromBoard(this.withVerboseTracking, this.board);
    game.#copyFenFieldsFrom(this);
    game.#history = this.#history.copy();
    return game;
  }

  public fork(): MonsGame {
    const simulation = MonsGame.#fromBoard(false, this.board);
    simulation.#copyFenFieldsFrom(this);
    simulation.#history = this.#history.fork();
    return simulation;
  }

  public variant(): GameVariant {
    return this.board.variant;
  }

  public invalidateProcessInputCache(): void {
    this.#queryCache.invalidate();
  }

  #updateWith(otherGame: MonsGame): void {
    const board = otherGame.board.fork();
    this.#state.board = board;
    this.#copyFenFieldsFrom(otherGame);
    this.invalidateProcessInputCache();
  }

  public canTakeback(color: Color): boolean {
    return this.#history.canTakeback(this.activeColor, color);
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

  /**
   * Resolve only the input grammar, without recursively filtering completions
   * for numeric-capacity failures. Automove's emergency fallback uses this to
   * walk candidates in stable order and stop at the first applicable leaf.
   */
  public inspectInputGrammar(
    input: readonly Input[],
    suggestedStartOptions: SuggestedStartInputOptions,
  ): Output {
    return this.#processInputInternal(input, true, false, suggestedStartOptions, false);
  }

  #processInputInternal(
    input: readonly Input[],
    doNotApplyEvents: boolean,
    oneOptionEnough: boolean,
    suggestedStartOptions: SuggestedStartInputOptions,
    filterCounterCapacityOptions = true,
  ): Output {
    if (input.length > MAX_INPUTS_PER_MOVE || this.winnerColor() !== undefined) {
      return { kind: "invalid-input" };
    }
    if (input.length === 0) {
      const key =
        (filterCounterCapacityOptions ? 2 : 0) |
        (suggestedStartOptions.includeManaStartsWithPotionAction ? 1 : 0);
      const cached = this.#queryCache.getStartSuggestion(key);
      if (cached !== undefined) {
        return cached;
      }
      const output = suggestedInputToStartWith(this, suggestedStartOptions, (inputs) =>
        this.#processInputInternal(
          inputs,
          true,
          true,
          suggestedStartOptions,
          filterCounterCapacityOptions,
        ),
      );
      this.#queryCache.setStartSuggestion(key, output);
      return output;
    }

    const firstInput = input[0];
    if (input.length === 1 && firstInput?.kind === "takeback") {
      const prepared = this.#history.prepareTakeback(
        this.activeColor,
        this.activeColor,
      );
      if (prepared === undefined) {
        return { kind: "invalid-input" };
      }
      const previousGame = MonsGame.fromFen(prepared.previousFen, false);
      if (previousGame === undefined) return { kind: "invalid-input" };
      if (doNotApplyEvents) {
        return { kind: "events", events: [{ kind: "takeback" }] };
      }
      this.#updateWith(previousGame);
      this.#history.commitTakeback(prepared);
      return { kind: "events", events: [{ kind: "takeback" }] };
    }

    return dispatchStagedInput(
      this.#stagedInputContext,
      input,
      doNotApplyEvents,
      oneOptionEnough,
      suggestedStartOptions,
      filterCounterCapacityOptions,
    );
  }

  #requiresCounterCapacityFiltering(): boolean {
    return (
      this.turnNumber === Number.MAX_SAFE_INTEGER ||
      this.whitePotionsCount === Number.MAX_SAFE_INTEGER ||
      this.blackPotionsCount === Number.MAX_SAFE_INTEGER
    );
  }

  #applicableInputOptions(
    prefix: readonly Input[],
    options: NextInput[],
    suggestedStartOptions: SuggestedStartInputOptions,
    required: boolean,
    oneOptionEnough: boolean,
  ): NextInput[] {
    if (!required) return options;
    const applicable = (option: NextInput): boolean =>
      this.#hasApplicableCompletion([...prefix, option.input], suggestedStartOptions);
    if (!oneOptionEnough) return options.filter(applicable);
    const first = options.find(applicable);
    return first === undefined ? [] : [first];
  }

  #hasApplicableCompletion(
    inputs: readonly Input[],
    suggestedStartOptions: SuggestedStartInputOptions,
  ): boolean {
    const cacheKey = `${suggestedStartOptions.includeManaStartsWithPotionAction ? 1 : 0}|${inputChainKey(inputs)}`;
    const cached = this.#queryCache.getCompletionViability(cacheKey);
    if (cached !== undefined) return cached;

    const output = this.#processInputInternal(
      inputs,
      true,
      false,
      suggestedStartOptions,
      false,
    );
    const applicable = (() => {
      switch (output.kind) {
        case "invalid-input":
          return false;
        case "events":
          return canApplyRulesEvents(this.#state, output.events);
        case "locations-to-start-from":
          return output.locations.some((at) =>
            this.#hasApplicableCompletion(
              [...inputs, { kind: "location", location: at }],
              suggestedStartOptions,
            ),
          );
        case "next-input-options":
          return output.nextInputs.some((option) =>
            this.#hasApplicableCompletion(
              [...inputs, option.input],
              suggestedStartOptions,
            ),
          );
      }
    })();
    this.#queryCache.setCompletionViability(cacheKey, applicable);
    return applicable;
  }

  #secondInputOptions(
    startLocation: Location,
    startItem: Item,
    cacheComputed: boolean,
    specificLocation: Location | undefined,
  ): NextInput[] {
    const cacheKey = String(locationIndex(startLocation));
    const cached = this.#queryCache.getSecondInputOptions(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const options = generateSecondInputOptions(
      this,
      startLocation,
      startItem,
      specificLocation,
    );

    if (cacheComputed) {
      this.#queryCache.setSecondInputOptions(cacheKey, options);
    }
    return options;
  }

  #processSecondInput(
    kind: NextInputKind,
    startItem: Item,
    startLocation: Location,
    targetLocation: Location,
    cacheComputed: boolean,
  ): InputStageResult {
    const cacheKey = `${kind}|${itemKey(startItem)}|${locationIndex(startLocation)}|${locationIndex(
      targetLocation,
    )}`;
    const cached = this.#queryCache.lookupSecondStage(cacheKey);
    if (cached !== CACHE_MISS) {
      return cached;
    }
    const computed = compileSecondInput(
      this,
      kind,
      startItem,
      startLocation,
      targetLocation,
    );
    if (cacheComputed) {
      this.#queryCache.setSecondStage(cacheKey, computed);
    }
    return computed;
  }

  #processThirdInput(
    thirdInput: NextInput,
    startItem: Item,
    startLocation: Location,
    targetLocation: Location,
    cacheComputed: boolean,
  ): InputStageResult {
    const cacheKey = `${inputKey(thirdInput.input)}|${thirdInput.kind}|${
      thirdInput.actorMonItem === undefined ? "" : itemKey(thirdInput.actorMonItem)
    }|${itemKey(startItem)}|${locationIndex(startLocation)}|${locationIndex(targetLocation)}`;
    const cached = this.#queryCache.lookupThirdStage(cacheKey);
    if (cached !== CACHE_MISS) {
      return cached;
    }
    const computed = compileThirdInput(
      this.board,
      thirdInput,
      startItem,
      startLocation,
      targetLocation,
    );
    if (cacheComputed) {
      this.#queryCache.setThirdStage(cacheKey, computed);
    }
    return computed;
  }

  #resolveEvents(events: readonly Event[], doNotApplyEvents: boolean): Output {
    if (doNotApplyEvents) {
      return { kind: "events", events };
    }
    const applied = this.applyAndAddResultingEvents(events);
    return applied === undefined
      ? { kind: "invalid-input" }
      : { kind: "events", events: applied };
  }

  public applyAndAddResultingEvents(events: readonly Event[]): Event[] | undefined {
    if (!canApplyRulesEvents(this.#state, events)) {
      return undefined;
    }
    this.invalidateProcessInputCache();
    if (!this.#history.eventApplicationTrackingEnabled) {
      return applyRulesEvents(this.#state, events).events;
    }
    const snapshotFen = (): string => this.fen();
    this.#history.beginEventApplication(snapshotFen, this.activeColor);
    const reduction = applyRulesEvents(this.#state, events);
    this.#history.completeEventApplication({
      snapshotFen,
      color: this.activeColor,
      events: reduction.events,
      turnAdvanced: reduction.turnAdvanced,
      winner: reduction.winner,
    });
    return reduction.events;
  }

  public nextInputsFromLocations(
    locations: readonly Location[],
    kind: NextInputKind,
    specific: Location | undefined,
    filter: (location: Location) => boolean,
  ): NextInput[] {
    return nextInputsFromLocations(locations, kind, specific, filter);
  }

  public availableMoveKinds(): Map<AvailableMoveKind, number> {
    const moves = new Map<AvailableMoveKind, number>();
    moves.set(AvailableMoveKind.MonMove, MONS_MOVES_PER_TURN - this.monsMovesCount);
    moves.set(AvailableMoveKind.Action, 0);
    moves.set(AvailableMoveKind.Potion, 0);
    moves.set(AvailableMoveKind.ManaMove, 0);
    if (this.turnNumber === 1) {
      return moves;
    }
    moves.set(AvailableMoveKind.Action, ACTIONS_PER_TURN - this.actionsUsedCount);
    moves.set(AvailableMoveKind.Potion, this.playerPotionsCount());
    moves.set(AvailableMoveKind.ManaMove, MANA_MOVES_PER_TURN - this.manaMovesCount);
    return moves;
  }

  public winnerColor(): Color | undefined {
    return winnerForState(this);
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
    return isFirstTurnState(this);
  }

  public playerPotionsCount(): number {
    return currentPlayerPotions(this);
  }

  public playerCanMoveMon(): boolean {
    return canPlayerMoveMon(this);
  }

  public playerCanMoveMana(): boolean {
    return canPlayerMoveMana(this);
  }

  public playerCanUseAction(): boolean {
    return canPlayerUseAction(this);
  }
}
