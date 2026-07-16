import { Board } from "./board.js";
import {
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
  type Event,
  type Input,
  type Item,
  type Mana,
  type Mon,
  type NextInput,
  type Output,
} from "./domain.js";
import {
  DEFAULT_GAME_VARIANT,
  GameVariant,
  parseGameVariant,
} from "./config.js";
import { BOARD_CELLS, BOARD_SIZE, type Location } from "./geometry.js";
import { parseI32Strict, toU32 } from "./numerics.js";
import {
  normalizeRustString,
  rustUtf8ByteLength,
  sliceRustStringByUtf8Bytes,
  splitRustWhitespace,
} from "./rust-string.js";

/** The portion of game state serialized by the stable game FEN format. */
export type GameFenState = {
  board: Board;
  whiteScore: number;
  blackScore: number;
  activeColor: Color;
  actionsUsedCount: number;
  manaMovesCount: number;
  monsMovesCount: number;
  whitePotionsCount: number;
  blackPotionsCount: number;
  turnNumber: number;
};

/** Rust's `str::parse::<i32>()`, restricted to the ASCII grammar it accepts. */
export function parseI32(text: string): number | undefined {
  return parseI32Strict(text);
}

export function colorFen(color: Color): string {
  return color === Color.White ? "w" : "b";
}

export function parseColorFen(fen: string): Color | undefined {
  switch (fen) {
    case "w":
      return Color.White;
    case "b":
      return Color.Black;
    default:
      return undefined;
  }
}

export function monFen(mon: Mon): string {
  const kind = (() => {
    switch (mon.kind) {
      case MonKind.Demon:
        return "e";
      case MonKind.Drainer:
        return "d";
      case MonKind.Angel:
        return "a";
      case MonKind.Spirit:
        return "s";
      case MonKind.Mystic:
        return "y";
    }
  })();
  const colorKind = mon.color === Color.White ? kind.toUpperCase() : kind;
  return `${colorKind}${mon.cooldown % 10}`;
}

export function parseMonFen(fen: string): Mon | undefined {
  const normalized = normalizeRustString(fen);
  if (rustUtf8ByteLength(normalized) !== 2) {
    return undefined;
  }

  const characters = Array.from(normalized);
  const kindCharacter = characters[0];
  const cooldownCharacter = characters[1];
  if (kindCharacter === undefined || cooldownCharacter === undefined) {
    return undefined;
  }

  const kind = (() => {
    switch (kindCharacter.toLowerCase()) {
      case "e":
        return MonKind.Demon;
      case "d":
        return MonKind.Drainer;
      case "a":
        return MonKind.Angel;
      case "s":
        return MonKind.Spirit;
      case "y":
        return MonKind.Mystic;
      default:
        return undefined;
    }
  })();
  if (kind === undefined || !/^[0-9]$/u.test(cooldownCharacter)) {
    return undefined;
  }

  return {
    kind,
    color:
      kindCharacter === kindCharacter.toUpperCase() ? Color.White : Color.Black,
    cooldown: cooldownCharacter.charCodeAt(0) - 48,
  };
}

export function manaFen(mana: Mana): string {
  if (mana.kind === "supermana") {
    return "U";
  }
  return mana.color === Color.White ? "M" : "m";
}

export function parseManaFen(fen: string): Mana | undefined {
  switch (fen) {
    case "M":
      return { kind: "regular", color: Color.White };
    case "m":
      return { kind: "regular", color: Color.Black };
    case "U":
      return { kind: "supermana" };
    default:
      return undefined;
  }
}

export function consumableFen(consumable: Consumable): string {
  switch (consumable) {
    case Consumable.Potion:
      return "P";
    case Consumable.Bomb:
      return "B";
    case Consumable.BombOrPotion:
      return "Q";
  }
}

export function parseConsumableFen(fen: string): Consumable | undefined {
  switch (fen) {
    case "P":
      return Consumable.Potion;
    case "B":
      return Consumable.Bomb;
    case "Q":
      return Consumable.BombOrPotion;
    default:
      return undefined;
  }
}

export function itemFen(item: Item): string {
  switch (item.kind) {
    case "mon":
      return `${monFen(item.mon)}x`;
    case "mana":
      return `xx${manaFen(item.mana)}`;
    case "mon-with-mana":
      return `${monFen(item.mon)}${manaFen(item.mana)}`;
    case "mon-with-consumable":
      return `${monFen(item.mon)}${consumableFen(item.consumable)}`;
    case "consumable":
      return `xx${consumableFen(item.consumable)}`;
  }
}

export function parseItemFen(fen: string): Item | undefined {
  const normalized = normalizeRustString(fen);
  if (rustUtf8ByteLength(normalized) !== 3) {
    return undefined;
  }

  const monCode = sliceRustStringByUtf8Bytes(normalized, 0, 2);
  const contentCode = sliceRustStringByUtf8Bytes(normalized, 2, 3);
  if (monCode === "xx") {
    const mana = parseManaFen(contentCode);
    if (mana !== undefined) {
      return { kind: "mana", mana };
    }
    const consumable = parseConsumableFen(contentCode);
    return consumable === undefined
      ? undefined
      : { kind: "consumable", consumable };
  }

  const mon = parseMonFen(monCode);
  if (mon === undefined) {
    return undefined;
  }
  const mana = parseManaFen(contentCode);
  if (mana !== undefined) {
    return { kind: "mon-with-mana", mon, mana };
  }
  const consumable = parseConsumableFen(contentCode);
  if (consumable !== undefined) {
    return { kind: "mon-with-consumable", mon, consumable };
  }
  return { kind: "mon", mon };
}

export function locationFen(location: Location): string {
  return `${location.i},${location.j}`;
}

export function parseLocationFen(fen: string): Location | undefined {
  const parts = fen.split(",");
  if (parts.length !== 2) {
    return undefined;
  }
  const iText = parts[0];
  const jText = parts[1];
  if (iText === undefined || jText === undefined) {
    return undefined;
  }
  const i = parseI32(iText);
  const j = parseI32(jText);
  return i === undefined || j === undefined ? undefined : { i, j };
}

export function boardFen(board: Board): string {
  const lines: string[] = [];
  for (let i = 0; i < BOARD_SIZE; i += 1) {
    let line = "";
    let emptySpaceCount = 0;
    for (let j = 0; j < BOARD_SIZE; j += 1) {
      const item = board.item({ i, j });
      if (item === undefined) {
        emptySpaceCount += 1;
        continue;
      }
      if (emptySpaceCount > 0) {
        line += emptyRunFen(emptySpaceCount);
        emptySpaceCount = 0;
      }
      line += itemFen(item);
    }
    if (emptySpaceCount > 0) {
      line += emptyRunFen(emptySpaceCount);
    }
    lines.push(line);
  }
  return lines.join("/");
}

/**
 * Parses the legacy board grammar, including its intentionally permissive row
 * handling. Rows need not total eleven cells; invalid item triples merely
 * consume one cell, and an oversized run can place a later item in another row.
 */
export function parseBoardFen(
  fen: string,
  variant: GameVariant,
): Board | undefined {
  const lines = normalizeRustString(fen).split("/");
  if (lines.length !== BOARD_SIZE) {
    return undefined;
  }

  const items: (Item | undefined)[] = Array.from(
    { length: BOARD_CELLS },
    () => undefined,
  );
  for (const [i, line] of lines.entries()) {
    const characters = Array.from(line);
    let characterIndex = 0;
    let j = 0;
    while (characterIndex < characters.length) {
      if (characters[characterIndex] === "n") {
        const countCode = characters
          .slice(characterIndex + 1, characterIndex + 3)
          .join("");
        characterIndex +=
          1 + Math.min(2, characters.length - characterIndex - 1);
        if (/^\+?[0-9]+$/u.test(countCode)) {
          const count = Number(countCode);
          if (Number.isSafeInteger(count)) {
            j = toU32(j + count);
          }
        }
        continue;
      }

      const itemCode = characters
        .slice(characterIndex, characterIndex + 3)
        .join("");
      characterIndex += Math.min(3, characters.length - characterIndex);
      const item = parseItemFen(itemCode);
      if (item !== undefined) {
        const itemIndex = toU32(i * BOARD_SIZE + j);
        if (itemIndex >= BOARD_CELLS) {
          throw new RangeError("board FEN item index is out of bounds");
        }
        items[itemIndex] = item;
      }
      j = toU32(j + 1);
    }
  }

  return Board.fromItems(items, variant);
}

export function gameFen(game: GameFenState): string {
  const fields = [
    game.whiteScore,
    game.blackScore,
    colorFen(game.activeColor),
    game.actionsUsedCount,
    game.manaMovesCount,
    game.monsMovesCount,
    game.whitePotionsCount,
    game.blackPotionsCount,
    game.turnNumber,
    boardFen(game.board),
  ].map(String);
  const variant = game.board.variant();
  if (variant !== DEFAULT_GAME_VARIANT) {
    fields.push(String(variant));
  }
  return fields.join(" ");
}

export function parseGameFen(fen: string): GameFenState | undefined {
  const fields = splitRustWhitespace(fen);
  if (fields.length !== 10 && fields.length !== 11) {
    return undefined;
  }

  const variant =
    fields.length === 10
      ? DEFAULT_GAME_VARIANT
      : parseGameVariant(fields[10] ?? "");
  if (variant === undefined) {
    return undefined;
  }

  const boardCode = fields[9];
  const colorCode = fields[2];
  if (boardCode === undefined || colorCode === undefined) {
    return undefined;
  }
  const board = parseBoardFen(boardCode, variant);
  const activeColor = parseColorFen(colorCode);
  if (board === undefined || activeColor === undefined) {
    return undefined;
  }

  const numbers = [
    fields[0],
    fields[1],
    fields[3],
    fields[4],
    fields[5],
    fields[6],
    fields[7],
    fields[8],
  ].map((field) => parseI32(field ?? ""));
  if (numbers.some((number) => number === undefined)) {
    return undefined;
  }
  const [
    whiteScore,
    blackScore,
    actionsUsedCount,
    manaMovesCount,
    monsMovesCount,
    whitePotionsCount,
    blackPotionsCount,
    turnNumber,
  ] = numbers;
  if (
    whiteScore === undefined ||
    blackScore === undefined ||
    actionsUsedCount === undefined ||
    manaMovesCount === undefined ||
    monsMovesCount === undefined ||
    whitePotionsCount === undefined ||
    blackPotionsCount === undefined ||
    turnNumber === undefined
  ) {
    return undefined;
  }

  return {
    board,
    whiteScore,
    blackScore,
    activeColor,
    actionsUsedCount,
    manaMovesCount,
    monsMovesCount,
    whitePotionsCount,
    blackPotionsCount,
    turnNumber,
  };
}

export function modifierFen(modifier: Modifier): string {
  switch (modifier) {
    case Modifier.SelectPotion:
      return "p";
    case Modifier.SelectBomb:
      return "b";
    case Modifier.Cancel:
      return "c";
  }
}

export function parseModifierFen(fen: string): Modifier | undefined {
  switch (fen) {
    case "p":
      return Modifier.SelectPotion;
    case "b":
      return Modifier.SelectBomb;
    case "c":
      return Modifier.Cancel;
    default:
      return undefined;
  }
}

export function inputFen(input: Input): string {
  switch (input.kind) {
    case "takeback":
      return "z";
    case "location":
      return `l${locationFen(input.location)}`;
    case "modifier":
      return `m${modifierFen(input.modifier)}`;
  }
}

export function parseInputFen(fen: string): Input | undefined {
  switch (fen[0]) {
    case "l": {
      const parsed = parseLocationFen(fen.slice(1));
      return parsed === undefined
        ? undefined
        : { kind: "location", location: parsed };
    }
    case "m": {
      const parsed = parseModifierFen(fen.slice(1));
      return parsed === undefined
        ? undefined
        : { kind: "modifier", modifier: parsed };
    }
    case "z":
      return { kind: "takeback" };
    default:
      return undefined;
  }
}

export function inputArrayFen(inputs: readonly Input[]): string {
  return inputs.map(inputFen).join(";");
}

export function parseInputArrayFen(fen: string): Input[] {
  if (fen === "") {
    return [];
  }
  const result: Input[] = [];
  for (const part of fen.split(";")) {
    const input = parseInputFen(part);
    if (input !== undefined) {
      result.push(input);
    }
  }
  return result;
}

export function nextInputKindFen(kind: NextInputKind): string {
  switch (kind) {
    case NextInputKind.MonMove:
      return "mm";
    case NextInputKind.ManaMove:
      return "mma";
    case NextInputKind.MysticAction:
      return "ma";
    case NextInputKind.DemonAction:
      return "da";
    case NextInputKind.DemonAdditionalStep:
      return "das";
    case NextInputKind.SpiritTargetCapture:
      return "stc";
    case NextInputKind.SpiritTargetMove:
      return "stm";
    case NextInputKind.SelectConsumable:
      return "sc";
    case NextInputKind.BombAttack:
      return "ba";
  }
}

export function nextInputFen(nextInput: NextInput): string {
  return `${inputFen(nextInput.input)} ${nextInputKindFen(nextInput.kind)} ${
    nextInput.actorMonItem === undefined ? "o" : itemFen(nextInput.actorMonItem)
  }`;
}

export function eventFen(event: Event): string {
  switch (event.kind) {
    case "mon-move":
      return `mm ${itemFen(event.item)} ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "mana-move":
      return `mma ${manaFen(event.mana)} ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "mana-scored":
      return `ms ${manaFen(event.mana)} ${locationFen(event.at)}`;
    case "mystic-action":
      return `ma ${monFen(event.mystic)} ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "demon-action":
      return `da ${monFen(event.demon)} ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "demon-additional-step":
      return `das ${monFen(event.demon)} ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "spirit-target-move":
      return `stm ${itemFen(event.item)} ${locationFen(event.from)} ${locationFen(event.to)} ${locationFen(event.by)}`;
    case "pickup-bomb":
      return `pb ${monFen(event.by)} ${locationFen(event.at)}`;
    case "pickup-potion":
      return `pp ${itemFen(event.by)} ${locationFen(event.at)}`;
    case "use-potion":
      return `up ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "pickup-mana":
      return `pm ${manaFen(event.mana)} ${monFen(event.by)} ${locationFen(event.at)}`;
    case "mon-fainted":
      return `mf ${monFen(event.mon)} ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "mana-dropped":
      return `md ${manaFen(event.mana)} ${locationFen(event.at)}`;
    case "supermana-back-to-base":
      return `sb ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "bomb-attack":
      return `ba ${monFen(event.by)} ${locationFen(event.from)} ${locationFen(event.to)}`;
    case "mon-awake":
      return `maw ${monFen(event.mon)} ${locationFen(event.at)}`;
    case "bomb-explosion":
      return `be ${locationFen(event.at)}`;
    case "next-turn":
      return `nt ${colorFen(event.color)}`;
    case "game-over":
      return `go ${colorFen(event.winner)}`;
    case "takeback":
      return "z";
  }
}

/** Tracking entities retain event application order rather than sorting it. */
export function eventArrayFen(events: readonly Event[]): string {
  return events.map(eventFen).join(" ");
}

export function outputFen(output: Output): string {
  switch (output.kind) {
    case "invalid-input":
      return "i";
    case "locations-to-start-from":
      return `l${output.locations
        .map(locationFen)
        .sort(compareAscii)
        .join("/")}`;
    case "next-input-options":
      return `n${output.nextInputs
        .map(nextInputFen)
        .sort(compareAscii)
        .join("/")}`;
    case "events":
      return `e${output.events.map(eventFen).sort(compareAscii).join("/")}`;
  }
}

function emptyRunFen(count: number): string {
  return `n${String(count).padStart(2, "0")}`;
}

function compareAscii(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
}
