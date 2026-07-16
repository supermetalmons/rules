import { installAutomoveRuntime } from "../automove/runtime.js";

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
