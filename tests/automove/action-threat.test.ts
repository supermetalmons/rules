import { describe, expect, it } from "vitest";

import { tryLoadPosition } from "../../src/automove/bridge.js";
import { evaluateWithTables } from "../../src/automove/evaluation.js";
import {
  DEFAULT_WEIGHTS,
  createEvalTables,
  normalizeEvalWeights,
} from "../../src/automove/evaluation-weights.js";
import { MAX_MOVES, generateMoves } from "../../src/automove/moves.js";
import {
  FastPosition,
  MOVE_BOMB,
  MOVE_DEMON,
  MOVE_MYSTIC,
  moveFrom,
  moveTo,
  moveType,
} from "../../src/automove/state.js";
import { Board } from "../../src/engine/board/storage.js";
import {
  BOARD_CELLS,
  location,
  locationIndex,
  type Location,
} from "../../src/engine/board/geometry.js";
import {
  gameFen,
  parseGameFen,
  type GameFenState,
} from "../../src/engine/codec/game-board.js";
import { MonsGame } from "../../src/engine/game/mons-game.js";
import {
  Color,
  Consumable,
  MonKind,
  createMon,
  monItem,
  monWithConsumableItem,
  type Input,
  type Item,
} from "../../src/engine/model/domain.js";

const THREAT_VALUE = 2_100;
const THREAT_TABLES = createEvalTables(
  normalizeEvalWeights({
    ...Object.fromEntries(Object.keys(DEFAULT_WEIGHTS).map((key) => [key, 0])),
    drainerThreatImmediate: THREAT_VALUE,
    threatMoverScaleSpare: 100,
    threatMoverScaleFew: 100,
  }),
);

const ACTION_ATTACKS = [
  { name: "Mystic", kind: MonKind.Mystic, column: 3, moveType: MOVE_MYSTIC },
  { name: "Demon", kind: MonKind.Demon, column: 7, moveType: MOVE_DEMON },
] as const;
const BOMB_ATTACK = {
  name: "Bomb",
  kind: MonKind.Demon,
  column: 7,
  moveType: MOVE_BOMB,
} as const;
type Attack = (typeof ACTION_ATTACKS)[number] | typeof BOMB_ATTACK;

function locationInput(at: Location): Input {
  return { kind: "location", location: at };
}

function attackFixture(
  attack: Attack,
  attacker: Color,
  overrides: Partial<Omit<GameFenState, "board">> = {},
) {
  const defender = attacker === Color.White ? Color.Black : Color.White;
  const orient = (row: number, column: number): Location =>
    attacker === Color.Black ? location(row, column) : location(10 - row, 10 - column);
  const from = orient(4, attack.column);
  const target = orient(2, attack.name === "Mystic" ? 5 : 7);
  const spirit = orient(7, 5);
  const spiritTarget = orient(7, 7);
  const spiritDestination = orient(8, 8);
  const initial = parseGameFen(new MonsGame(false).fen());
  if (initial === undefined) throw new Error("initial game FEN must parse");
  const items: (Item | undefined)[] = Array.from(
    { length: BOARD_CELLS },
    () => undefined,
  );
  const mon = createMon(attack.kind, attacker, 0);
  items[locationIndex(from)] =
    attack.name === "Bomb" ? monWithConsumableItem(mon, Consumable.Bomb) : monItem(mon);
  items[locationIndex(target)] = monItem(createMon(MonKind.Drainer, defender, 0));
  items[locationIndex(spirit)] = monItem(createMon(MonKind.Spirit, attacker, 0));
  items[locationIndex(spiritTarget)] = monItem(createMon(MonKind.Angel, defender, 0));
  const game = MonsGame.fromFen(
    gameFen({
      ...initial,
      activeColor: attacker,
      turnNumber: 2,
      ...overrides,
      board: Board.fromItems(items, initial.board.variant),
    }),
    false,
  );
  if (game === undefined) throw new Error("attack fixture FEN must parse");
  return {
    game,
    from,
    target,
    attack,
    inputs: [locationInput(from), locationInput(target)],
    spendActionInputs: [
      locationInput(spirit),
      locationInput(spiritTarget),
      locationInput(spiritDestination),
    ],
  };
}

type AttackFixture = ReturnType<typeof attackFixture>;

function loadedPosition(game: MonsGame): FastPosition {
  const position = new FastPosition();
  expect(tryLoadPosition(position, game, 40)).toBe(true);
  return position;
}

function threatValue(game: MonsGame): number {
  return evaluateWithTables(loadedPosition(game), THREAT_TABLES);
}

function spendAction(fixture: AttackFixture): void {
  expect(fixture.game.processInput(fixture.spendActionInputs, false, false).kind).toBe(
    "events",
  );
  expect(fixture.game.actionsUsedCount).toBe(1);
}

function expectAttackAllowed(fixture: AttackFixture, allowed: boolean): void {
  const moves = new Int32Array(MAX_MOVES);
  const count = generateMoves(loadedPosition(fixture.game), moves);
  const from = locationIndex(fixture.from);
  const target = locationIndex(fixture.target);
  const generated = [...moves.subarray(0, count)].some(
    (move) =>
      moveType(move) === fixture.attack.moveType &&
      moveFrom(move) === from &&
      moveTo(move) === target,
  );
  expect(generated).toBe(allowed);
  const before = fixture.game.fen();
  expect(fixture.game.processInput(fixture.inputs, false, false).kind).toBe(
    allowed ? "events" : "invalid-input",
  );
  if (!allowed) expect(fixture.game.fen()).toBe(before);
}

describe.each([Color.White, Color.Black])(
  "%s attack availability in evaluation",
  (color) => {
    const signedThreat = color === Color.White ? THREAT_VALUE : -THREAT_VALUE;
    const potionCounter =
      color === Color.White ? "whitePotionsCount" : "blackPotionsCount";

    describe.each(ACTION_ATTACKS)("$name", (attack) => {
      it("counts an immediate attack while the free action remains", () => {
        const fixture = attackFixture(attack, color);

        expect(threatValue(fixture.game)).toBe(signedThreat);
        expectAttackAllowed(fixture, true);
      });

      it("removes the threat after a legal action consumes the final action", () => {
        const fixture = attackFixture(attack, color);

        spendAction(fixture);

        expect(threatValue(fixture.game)).toBe(0);
        expectAttackAllowed(fixture, false);
      });

      it("retains the threat when a potion can pay for another action", () => {
        const fixture = attackFixture(attack, color, { [potionCounter]: 1 });

        spendAction(fixture);

        expect(fixture.game[potionCounter]).toBe(1);
        expect(threatValue(fixture.game)).toBe(signedThreat);
        expectAttackAllowed(fixture, true);
        expect(fixture.game[potionCounter]).toBe(0);
      });

      it.each([0, 1])("ignores first-turn actions with %i potions", (potions) => {
        const fixture = attackFixture(attack, color, {
          turnNumber: 1,
          [potionCounter]: potions,
        });

        expect(threatValue(fixture.game)).toBe(0);
        expectAttackAllowed(fixture, false);
      });

      it("keeps next-turn threats independent of the current player's spent action", () => {
        const fixture = attackFixture(attack, color, {
          activeColor: color === Color.White ? Color.Black : Color.White,
          actionsUsedCount: 1,
        });

        expect(threatValue(fixture.game)).toBe(signedThreat);
      });
    });

    it("keeps a Bomb attack after the final action is spent", () => {
      const fixture = attackFixture(BOMB_ATTACK, color);

      spendAction(fixture);

      expect(threatValue(fixture.game)).toBe(signedThreat);
      expectAttackAllowed(fixture, true);
      expect(fixture.game.actionsUsedCount).toBe(1);
    });

    it("keeps Bomb attacks available on the first turn", () => {
      const fixture = attackFixture(BOMB_ATTACK, color, { turnNumber: 1 });

      expect(threatValue(fixture.game)).toBe(signedThreat);
      expectAttackAllowed(fixture, true);
      expect(fixture.game.actionsUsedCount).toBe(0);
    });
  },
);
