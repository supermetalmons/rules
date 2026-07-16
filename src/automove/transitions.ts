import { cancelled, checkpoint } from "./deadline.js";
import {
  FOR_AUTOMOVE_START_INPUT_OPTIONS,
  MonsGame,
  type SuggestedStartInputOptions,
} from "../engine/game.js";
import { cloneInput, type Event, type Input } from "../engine/domain.js";
import {
  BOARD_CELLS,
  locationIndex,
  type Location,
} from "../engine/geometry.js";

export const SMART_MAX_INPUT_CHAIN = 8;

export type LegalInputTransition = {
  readonly inputs: readonly Input[];
  readonly game: MonsGame;
  readonly events: readonly Event[];
};

function compareNumber(left: number, right: number): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Stable input order: Takeback, Location(i,j), then Modifier. */
export function compareInputs(left: Input, right: Input): number {
  const tag = (value: Input): number => {
    switch (value.kind) {
      case "takeback":
        return 0;
      case "location":
        return 1;
      case "modifier":
        return 2;
    }
  };
  const tagOrder = compareNumber(tag(left), tag(right));
  if (tagOrder !== 0) return tagOrder;
  if (left.kind === "location" && right.kind === "location") {
    return (
      compareNumber(left.location.i, right.location.i) ||
      compareNumber(left.location.j, right.location.j)
    );
  }
  if (left.kind === "modifier" && right.kind === "modifier") {
    return compareNumber(left.modifier, right.modifier);
  }
  return 0;
}

export function compareInputChains(
  left: readonly Input[],
  right: readonly Input[],
): number {
  const sharedLength = Math.min(left.length, right.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftInput = left[index];
    const rightInput = right[index];
    if (leftInput === undefined || rightInput === undefined) break;
    const order = compareInputs(leftInput, rightInput);
    if (order !== 0) return order;
  }
  return compareNumber(left.length, right.length);
}

function collectLegalTransitions(
  game: MonsGame,
  partialInputs: Input[],
  transitions: LegalInputTransition[],
  maxMoves: number,
  startOptions: SuggestedStartInputOptions,
): void {
  if (checkpoint()) {
    transitions.length = 0;
    return;
  }
  if (
    transitions.length >= maxMoves ||
    partialInputs.length > SMART_MAX_INPUT_CHAIN
  )
    return;

  const output = game.processInputWithStartOptions(
    partialInputs,
    true,
    false,
    startOptions,
  );
  switch (output.kind) {
    case "invalid-input":
      return;
    case "events": {
      const afterGame = game.cloneForSimulation();
      const appliedEvents = afterGame.applyAndAddResultingEvents(output.events);
      transitions.push({
        inputs: partialInputs.map(cloneInput),
        game: afterGame,
        events: appliedEvents,
      });
      return;
    }
    case "locations-to-start-from":
      for (const at of output.locations) {
        if (transitions.length >= maxMoves) break;
        partialInputs.push({
          kind: "location",
          location: { i: at.i, j: at.j },
        });
        collectLegalTransitions(
          game,
          partialInputs,
          transitions,
          maxMoves,
          startOptions,
        );
        partialInputs.pop();
      }
      return;
    case "next-input-options":
      for (const option of output.nextInputs) {
        if (transitions.length >= maxMoves) break;
        partialInputs.push(cloneInput(option.input));
        collectLegalTransitions(
          game,
          partialInputs,
          transitions,
          maxMoves,
          startOptions,
        );
        partialInputs.pop();
      }
  }
}

export function enumerateLegalTransitions(
  game: MonsGame,
  maxMoves: number,
  startOptions: SuggestedStartInputOptions = FOR_AUTOMOVE_START_INPUT_OPTIONS,
): LegalInputTransition[] {
  if (checkpoint() || maxMoves <= 0) return [];
  const transitions: LegalInputTransition[] = [];
  collectLegalTransitions(
    game.cloneForSimulation(),
    [],
    transitions,
    maxMoves,
    startOptions,
  );
  if (cancelled()) return [];
  transitions.sort((left, right) =>
    compareInputChains(left.inputs, right.inputs),
  );
  return transitions;
}

export function enumerateLegalTransitionsWithPriority(
  game: MonsGame,
  maxMoves: number,
  startOptions: SuggestedStartInputOptions,
  priorityLocations: readonly Location[],
): LegalInputTransition[] {
  if (priorityLocations.length === 0) {
    return enumerateLegalTransitions(game, maxMoves, startOptions);
  }

  const priorityMask = new Uint8Array(BOARD_CELLS);
  for (const at of priorityLocations) priorityMask[locationIndex(at)] = 1;
  const priorityBudget = Math.max(
    Math.floor(maxMoves / 2),
    Math.max(0, maxMoves - 60),
  );
  const remainingBudget = Math.max(0, maxMoves - priorityBudget);
  const priority: LegalInputTransition[] = [];
  const others: LegalInputTransition[] = [];
  for (const transition of enumerateLegalTransitions(
    game,
    maxMoves,
    startOptions,
  )) {
    const first = transition.inputs[0];
    const isPriority =
      first?.kind === "location" &&
      priorityMask[locationIndex(first.location)] === 1;
    if (isPriority) {
      if (priority.length < priorityBudget) priority.push(transition);
    } else if (others.length < remainingBudget) {
      others.push(transition);
    }
    if (
      priority.length >= priorityBudget &&
      (remainingBudget === 0 || others.length >= remainingBudget)
    ) {
      break;
    }
  }
  return [...priority, ...others];
}

function collectLexicographicBounded(
  game: MonsGame,
  partialInputs: Input[],
  transitions: LegalInputTransition[],
  maxMoves: number,
  startOptions: SuggestedStartInputOptions,
  allowedFirstLocations: Uint8Array | undefined,
): void {
  if (checkpoint()) {
    transitions.length = 0;
    return;
  }
  if (
    transitions.length >= maxMoves ||
    partialInputs.length > SMART_MAX_INPUT_CHAIN
  )
    return;

  const output = game.processInputWithStartOptions(
    partialInputs,
    true,
    false,
    startOptions,
  );
  if (output.kind === "invalid-input") return;
  if (output.kind === "events") {
    if (allowedFirstLocations !== undefined && partialInputs.length === 0)
      return;
    const afterGame = game.cloneForSimulation();
    const events = afterGame.applyAndAddResultingEvents(output.events);
    transitions.push({
      inputs: partialInputs.map(cloneInput),
      game: afterGame,
      events,
    });
    return;
  }

  const childInputs: Input[] =
    output.kind === "locations-to-start-from"
      ? output.locations.map((at) => ({
          kind: "location",
          location: { i: at.i, j: at.j },
        }))
      : output.nextInputs.map((next) => cloneInput(next.input));
  childInputs.sort(compareInputs);
  for (const input of childInputs) {
    if (transitions.length >= maxMoves) break;
    if (
      partialInputs.length === 0 &&
      allowedFirstLocations !== undefined &&
      (input.kind !== "location" ||
        allowedFirstLocations[locationIndex(input.location)] !== 1)
    ) {
      continue;
    }
    partialInputs.push(input);
    collectLexicographicBounded(
      game,
      partialInputs,
      transitions,
      maxMoves,
      startOptions,
      allowedFirstLocations,
    );
    partialInputs.pop();
  }
}

export function enumerateLegalTransitionsLexicographicBounded(
  game: MonsGame,
  maxMoves: number,
  startOptions: SuggestedStartInputOptions = FOR_AUTOMOVE_START_INPUT_OPTIONS,
  allowedFirstLocations?: readonly Location[],
): LegalInputTransition[] {
  if (maxMoves <= 0 || checkpoint()) return [];
  let mask: Uint8Array | undefined;
  if (allowedFirstLocations !== undefined) {
    mask = new Uint8Array(BOARD_CELLS);
    for (const at of allowedFirstLocations) mask[locationIndex(at)] = 1;
  }
  const transitions: LegalInputTransition[] = [];
  collectLexicographicBounded(
    game.cloneForSimulation(),
    [],
    transitions,
    maxMoves,
    startOptions,
    mask,
  );
  return checkpoint() ? [] : transitions;
}

export function applyInputsForSearch(
  game: MonsGame,
  inputs: readonly Input[],
): MonsGame | undefined {
  return applyInputsForSearchWithEvents(game, inputs)?.game;
}

export function applyInputsForSearchWithEvents(
  game: MonsGame,
  inputs: readonly Input[],
): { game: MonsGame; events: readonly Event[] } | undefined {
  const simulatedGame = game.cloneForSimulation();
  const output = simulatedGame.processInput(inputs, false, false);
  return output.kind === "events"
    ? { game: simulatedGame, events: output.events }
    : undefined;
}

export function hasMaterialEvent(events: readonly Event[]): boolean {
  return events.some((event) =>
    [
      "mana-scored",
      "pickup-mana",
      "mon-fainted",
      "use-potion",
      "pickup-bomb",
      "pickup-potion",
      "bomb-attack",
      "bomb-explosion",
    ].includes(event.kind),
  );
}

export function isQuiescenceTacticalTransition(
  events: readonly Event[],
): boolean {
  return events.some((event) =>
    [
      "mana-scored",
      "pickup-mana",
      "mon-fainted",
      "use-potion",
      "bomb-attack",
      "bomb-explosion",
      "spirit-target-move",
      "supermana-back-to-base",
    ].includes(event.kind),
  );
}
