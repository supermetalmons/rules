import { randomFillSync } from "node:crypto";
import { performance } from "node:perf_hooks";

import { installAutomoveRuntime } from "../automove/runtime.js";
import { configureAutomovePlatformServices } from "../automove/types.js";

configureAutomovePlatformServices({
  clock: Object.freeze({
    now: () => performance.now(),
  }),
  randomSource: Object.freeze({
    nextU32(): number {
      const values = new Uint32Array(1);
      randomFillSync(values);
      return values[0] ?? 0;
    },
  }),
});

installAutomoveRuntime();

export {
  AvailableMoveKind,
  Color,
  Consumable,
  Modifier,
  MonKind,
  NextInputKind,
} from "../engine/domain.js";
export { GameVariant } from "../engine/config.js";
export {
  EventModel,
  EventModelKind,
  ItemModel,
  ItemModelKind,
  Location,
  ManaKind,
  ManaModel,
  Mon,
  NextInputModel,
  OutputModel,
  OutputModelKind,
  SquareModel,
  SquareModelKind,
  VerboseTrackingEntityModel,
} from "../api/models.js";
export { MonsGameModel } from "../api/mons-game-model.js";
export { winner } from "../api/winner.js";
