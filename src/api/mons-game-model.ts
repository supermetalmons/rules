import { GameVariant } from "../engine/config.js";
import {
  AvailableMoveKind,
  Color,
  Modifier,
  type Input,
  type Output,
} from "../engine/domain.js";
import {
  eventArrayFen,
  inputArrayFen,
  parseInputArrayFen,
} from "../engine/fen.js";
import { MonsGame } from "../engine/game.js";
import { fromLocationIndex } from "../engine/geometry.js";
import { toI32 } from "../engine/numerics.js";
import { toWellFormedString, trimParserWhitespace } from "../engine/text.js";
import type { SmartAutomovePreference } from "../automove/selector-types.js";
import {
  type ItemModel,
  Location,
  type OutputModel,
  type SquareModel,
  type VerboseTrackingEntityModel,
  itemModelFrom,
  locationModelFrom,
  locationModelToEngine,
  outputModelFrom,
  squareModelFrom,
  verboseTrackingEntityModelFrom,
} from "./models.js";
import { ModelStateMap } from "./model-state-map.js";
import { coerceEnum, coerceOptionalEnum } from "./coercion.js";
import { replayInterleavedMoves } from "./replay.js";

export type AutomoveFacadeResult = {
  readonly output: Output;
  readonly inputFen: string;
};

/** Runtime seam installed by the automove layer without introducing an API cycle. */
export type MonsGameAutomoveDelegate = {
  automove(game: MonsGame): AutomoveFacadeResult;
  smartAutomove(
    game: MonsGame,
    preference: SmartAutomovePreference,
  ): AutomoveFacadeResult;
};

let automoveDelegate: MonsGameAutomoveDelegate | undefined;

/** Internal integration hook. Entrypoints must not re-export this function. */
export function setMonsGameAutomoveDelegate(
  delegate: MonsGameAutomoveDelegate | undefined,
): void {
  automoveDelegate = delegate;
}

const gameStates = new ModelStateMap<MonsGameModel, MonsGame>();
const MONS_GAME_MODEL_INITIALIZATION = Symbol();

type MonsGameModelInitialization = {
  readonly [MONS_GAME_MODEL_INITIALIZATION]: MonsGame;
};

function gameState(model: MonsGameModel): MonsGame {
  return gameStates.getOrInsert(
    model,
    () => new MonsGame(true, GameVariant.Classic),
  );
}

function modelFromGame(game: MonsGame): MonsGameModel {
  return new MonsGameModel({ [MONS_GAME_MODEL_INITIALIZATION]: game });
}

export class MonsGameModel {
  public constructor();
  /** @internal Direct initialization for an already-created engine game. */
  public constructor(
    // eslint-disable-next-line @typescript-eslint/unified-signatures -- This internal overload is stripped from declarations, preserving the public zero-argument constructor.
    initialization: MonsGameModelInitialization,
  );
  public constructor(
    // eslint-disable-next-line @typescript-eslint/no-useless-default-assignment -- The default preserves the zero constructor arity at runtime.
    initialization: MonsGameModelInitialization | undefined = undefined,
  ) {
    gameStates.set(
      this,
      initialization?.[MONS_GAME_MODEL_INITIALIZATION] ??
        new MonsGame(true, GameVariant.Classic),
    );
  }

  public free(): void {
    // Pure TypeScript state does not own an external allocation.
  }

  public black_score(): number {
    return gameState(this).blackScore;
  }

  public remove_item(location: Location): void {
    const game = gameState(this);
    game.board.removeItem(locationModelToEngine(location));
    game.invalidateProcessInputCache();
  }

  public turn_number(): number {
    return gameState(this).turnNumber;
  }

  public white_score(): number {
    return gameState(this).whiteScore;
  }

  public active_color(): Color {
    return gameState(this).activeColor;
  }

  public can_takeback(color: Color): boolean {
    return gameState(this).canTakeback(toColor(color));
  }

  public verify_moves(
    flat_moves_string_w: string,
    flat_moves_string_b: string,
  ): boolean {
    const game = gameState(this);
    const normalizedMovesW = toWellFormedString(flat_moves_string_w);
    const normalizedMovesB = toWellFormedString(flat_moves_string_b);
    const movesW = normalizedMovesW === "" ? [] : normalizedMovesW.split("-");
    const movesB = normalizedMovesB === "" ? [] : normalizedMovesB.split("-");
    const verificationGame = new MonsGame(
      game.withVerboseTracking,
      game.variant(),
    );

    const replay = replayInterleavedMoves(verificationGame, movesW, movesB);
    if (replay.status !== "complete" || verificationGame.fen() !== game.fen()) {
      return false;
    }

    game.takebackFens = [...verificationGame.takebackFens];
    game.verboseTrackingEntities = game.withVerboseTracking
      ? [...verificationGame.verboseTrackingEntities]
      : [];
    game.isMovesVerified = true;
    return true;
  }

  public winner_color(): Color | undefined {
    return gameState(this).winnerColor();
  }

  public is_later_than(other_fen: string): boolean {
    const other = MonsGame.fromFen(toWellFormedString(other_fen), false);
    return other === undefined ? true : gameState(this).isLaterThan(other);
  }

  public process_input(
    locations: Location[],
    modifier?: Modifier,
  ): OutputModel {
    const inputs: Input[] = locations.map((at) => ({
      kind: "location",
      location: locationModelToEngine(at),
    }));
    const optionalModifier = coerceOptionalEnum(modifier, Modifier.Cancel);
    if (optionalModifier !== undefined) {
      inputs.push({
        kind: "modifier",
        modifier: optionalModifier,
      });
    }
    const inputFen = inputArrayFen(inputs);
    const output = gameState(this).processInput(inputs, false, false);
    return outputModelFrom(output, inputFen);
  }

  public takeback_fens(): string[] {
    return [...gameState(this).takebackFens];
  }

  public clearTracking(): void {
    gameState(this).clearTracking();
  }

  public smartAutomove(preference: string): OutputModel {
    const normalized = normalizeSmartAutomovePreference(preference);
    const delegate = requireAutomoveDelegate();
    const result = delegate.smartAutomove(
      gameState(this).cloneForSimulation(),
      normalized,
    );
    return outputModelFrom(result.output, result.inputFen);
  }

  public is_moves_verified(): boolean {
    return gameState(this).isMovesVerified;
  }

  public process_input_fen(input_fen: string): OutputModel {
    const normalizedInputFen = toWellFormedString(input_fen);
    const output = gameState(this).processInput(
      parseInputArrayFen(normalizedInputFen),
      false,
      false,
    );
    return outputModelFrom(output, normalizedInputFen);
  }

  public without_last_turn(takeback_fens: string[]): MonsGameModel | undefined {
    const game = gameState(this);
    if (game.verboseTrackingEntities.length <= 1) {
      return undefined;
    }

    const verboseTrackingEntities = game.verboseTrackingEntities.slice(0, -1);
    const latest = verboseTrackingEntities[verboseTrackingEntities.length - 1];
    const restored = MonsGame.fromFen(latest?.fen ?? game.fen(), true);
    if (restored === undefined) {
      return undefined;
    }
    restored.takebackFens = takeback_fens.map(toWellFormedString);
    restored.verboseTrackingEntities = [...verboseTrackingEntities];
    restored.withVerboseTracking = game.withVerboseTracking;
    restored.isMovesVerified = game.isMovesVerified;
    return modelFromGame(restored);
  }

  public static newForSimulation(variant: GameVariant): MonsGameModel {
    const game = new MonsGame(false, toGameVariant(variant));
    game.setTakebackHistoryTracking(false);
    return modelFromGame(game);
  }

  public available_move_kinds(): Int32Array {
    const counts = gameState(this).availableMoveKinds();
    return new Int32Array([
      counts.get(AvailableMoveKind.MonMove) ?? 0,
      counts.get(AvailableMoveKind.ManaMove) ?? 0,
      counts.get(AvailableMoveKind.Action) ?? 0,
      counts.get(AvailableMoveKind.Potion) ?? 0,
    ]);
  }

  public setVerboseTracking(enabled: boolean): void {
    gameState(this).setVerboseTracking(toI32(Number(enabled)) !== 0);
  }

  public locations_with_content(): Location[] {
    const game = gameState(this);
    const indices = new Set<number>();
    for (const [at] of game.board.occupied()) {
      indices.add(at.i * 11 + at.j);
    }
    for (const at of game.board.allMonsBases()) {
      indices.add(at.i * 11 + at.j);
    }
    return [...indices]
      .sort((left, right) => left - right)
      .map((index) => locationModelFrom(fromLocationIndex(index)));
  }

  public static fromFenForSimulation(fen: string): MonsGameModel | undefined {
    const game = MonsGame.fromFen(toWellFormedString(fen), false);
    if (game === undefined) {
      return undefined;
    }
    game.setTakebackHistoryTracking(false);
    return modelFromGame(game);
  }

  public verbose_tracking_entities(): VerboseTrackingEntityModel[] {
    return gameState(this).verboseTrackingEntities.map((entity) =>
      verboseTrackingEntityModelFrom(
        entity.fen,
        entity.color,
        entity.events,
        eventArrayFen(entity.events),
      ),
    );
  }

  public inactive_player_items_counters(): Int32Array {
    const game = gameState(this);
    const inactivePotions =
      game.activeColor === Color.White
        ? game.blackPotionsCount
        : game.whitePotionsCount;
    return new Int32Array([0, 0, 0, inactivePotions]);
  }

  public fen(): string {
    return gameState(this).fen();
  }

  public static new(variant: GameVariant): MonsGameModel {
    return modelFromGame(new MonsGame(true, toGameVariant(variant)));
  }

  public item(at: Location): ItemModel | undefined {
    const item = gameState(this).board.item(locationModelToEngine(at));
    return item === undefined ? undefined : itemModelFrom(item);
  }

  public square(at: Location): SquareModel {
    return squareModelFrom(
      gameState(this).board.square(locationModelToEngine(at)),
    );
  }

  public automove(): OutputModel {
    const result = requireAutomoveDelegate().automove(gameState(this));
    return outputModelFrom(result.output, result.inputFen);
  }

  public static from_fen(fen: string): MonsGameModel | undefined {
    const game = MonsGame.fromFen(toWellFormedString(fen), true);
    return game === undefined ? undefined : modelFromGame(game);
  }

  public takeback(): OutputModel {
    const inputs: Input[] = [{ kind: "takeback" }];
    const output = gameState(this).processInput(inputs, false, false);
    return outputModelFrom(output, inputArrayFen(inputs));
  }
}

function toGameVariant(value: GameVariant): GameVariant {
  return coerceEnum(value, GameVariant.CornerChainManaRows);
}

function toColor(value: Color): Color {
  return coerceEnum(value, Color.Black);
}

function normalizeSmartAutomovePreference(
  preference: string,
): SmartAutomovePreference {
  const normalized = asciiLowercase(trimParserWhitespace(preference));
  if (
    normalized === "fast" ||
    normalized === "normal" ||
    normalized === "pro"
  ) {
    return normalized;
  }
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- This public API error is intentionally a primitive string.
  throw "invalid smart automove mode; expected 'fast', 'normal', or 'pro'";
}

function asciiLowercase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 0x20),
  );
}

function requireAutomoveDelegate(): MonsGameAutomoveDelegate {
  if (automoveDelegate === undefined) {
    throw new Error("automove runtime is not configured");
  }
  return automoveDelegate;
}
