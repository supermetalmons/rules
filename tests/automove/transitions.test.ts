import { describe, expect, it } from "vitest";

import {
  applyInputsForSearch,
  compareInputChains,
  enumerateLegalTransitions,
} from "../../src/automove/transitions.js";
import { GameVariant } from "../../src/engine/config.js";
import { MonsGame } from "../../src/engine/game.js";
import { inputArrayFen } from "../../src/engine/fen.js";

describe("legal transition enumeration", () => {
  it("uses Rust's derived lexicographic input ordering", () => {
    const chains = [
      [{ kind: "modifier" as const, modifier: 0 }],
      [{ kind: "location" as const, location: { i: 10, j: 4 } }],
      [{ kind: "takeback" as const }],
      [{ kind: "location" as const, location: { i: 9, j: 4 } }],
    ];
    chains.sort(compareInputChains);
    expect(chains.map(inputArrayFen)).toEqual(["z", "l9,4", "l10,4", "mp"]);
  });

  it("enumerates sorted legal non-mutating opening transitions", () => {
    const game = new MonsGame(true, GameVariant.Classic);
    const before = game.fen();
    const transitions = enumerateLegalTransitions(game, 256);
    expect(transitions.length).toBeGreaterThan(0);
    expect(game.fen()).toBe(before);
    const inputFens = transitions.map((transition) =>
      inputArrayFen(transition.inputs),
    );
    expect(inputFens[0]).toBe("l10,3;l9,2");
    expect(inputFens.at(-1)).toBe("l10,7;l10,8");
    for (let index = 1; index < transitions.length; index += 1) {
      const previous = transitions[index - 1];
      const current = transitions[index];
      if (previous === undefined || current === undefined) continue;
      expect(
        compareInputChains(previous.inputs, current.inputs),
      ).toBeLessThanOrEqual(0);
    }
    for (const transition of transitions) {
      expect(transition.game.fen()).not.toBe(before);
      expect(applyInputsForSearch(game, transition.inputs)?.fen()).toBe(
        transition.game.fen(),
      );
    }
  });
});
