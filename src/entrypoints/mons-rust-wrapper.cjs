"use strict";

const api = require("./mons-rust-internal.cjs");

exports.AvailableMoveKind = api.AvailableMoveKind;
exports.Color = api.Color;
exports.Consumable = api.Consumable;
exports.EventModel = api.EventModel;
exports.EventModelKind = api.EventModelKind;
exports.GameVariant = api.GameVariant;
exports.ItemModel = api.ItemModel;
exports.ItemModelKind = api.ItemModelKind;
exports.Location = api.Location;
exports.ManaKind = api.ManaKind;
exports.ManaModel = api.ManaModel;
exports.Modifier = api.Modifier;
exports.Mon = api.Mon;
exports.MonKind = api.MonKind;
exports.MonsGameModel = api.MonsGameModel;
exports.NextInputKind = api.NextInputKind;
exports.NextInputModel = api.NextInputModel;
exports.OutputModel = api.OutputModel;
exports.OutputModelKind = api.OutputModelKind;
exports.SquareModel = api.SquareModel;
exports.SquareModelKind = api.SquareModelKind;
exports.VerboseTrackingEntityModel = api.VerboseTrackingEntityModel;
exports.winner = function (
  fen_w,
  fen_b,
  flat_moves_string_w,
  flat_moves_string_b,
) {
  return api.winner(fen_w, fen_b, flat_moves_string_w, flat_moves_string_b);
};
