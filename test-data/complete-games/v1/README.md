# Complete real-player games v1

This directory contains the immutable v1 snapshot of complete games played by real
players. `complete-games.jsonl` is the canonical source artifact. Do not rewrite,
normalize, deduplicate, reorder, or replace it; publish future source revisions in a
new version directory. Derived states, features, splits, and experiment outputs belong
under `target/` or `/tmp`, not beside the source corpus.

The corpus is published under the repository's CC0-1.0 terms. It is move-only: source
game IDs and direct player identifiers are omitted, and there are no names, ratings,
timestamps, chat messages, IP addresses, or device fields. Exact game trajectories can
still act as quasi-identifiers if matched against an external game log, so downstream
exports should preserve the same data-minimization boundary.

## Corpus summary

- 1,527 complete games, 25,185 turns, and 169,480 input strings.
- All 12 current `GameVariant` values occur.
- 1,486 games (97.3%) are `Classic`; the other variants are too sparse for balanced
  all-variant conclusions.
- Human actions are observations, not optimal-move labels. The corpus contains no
  player-strength metadata.

Exact counts and the approved artifact hash are recorded in `manifest.json` and are
independently enforced by `scripts/check-complete-games.cjs`.

## JSONL format

`complete-games.jsonl` is UTF-8 JSON Lines: one compact game object per line, with a
trailing newline and no enclosing array. Line order has no game meaning. Identical
lines may represent distinct games because source IDs are intentionally omitted.

### Record

```text
{"gameVariant":"Classic","turns":[["l10,5;l9,5","l9,5;l8,5","l8,5;l7,5","l7,5;l6,5","l6,5;l5,5"],["l0,4;l1,5","l1,5;l2,5","l2,5;l3,5","l3,5;l5,5;l4,4","l0,5;l1,4","l1,4;l2,4","l3,4;l2,3"],["l4,4;l3,3","l3,3;l2,2","l2,2;l1,1","l1,1;l0,0","l0,0;l1,1","l7,4;l8,3"],["l3,5;l2,3;l2,2","l2,2;l1,1"],["l10,6;l9,5","l9,5;l8,3;l9,2","l1,1;l0,0","l9,2;l10,1"],["l4,3;l3,3"],["l10,1;l10,0"]]}
```

- `gameVariant` is a `GameVariant` name and selects the initial board.
- `turns` is a chronological array of complete turns. Each turn is a non-empty array
  of input strings exported for `MonsGameModel.process_input_fen()`.
- Acting colors are derived from the game model.
- Every non-final turn ends with a `NextTurn` event. The final turn ends with
  `GameOver` and a winning score of at least 5; a two-point score can produce 6.

The integrity checker validates the canonical JSONL shape and input-token grammar. It
does not replay games against the current engine, so this historical corpus is not a
rules regression contract.

## Future automove research

Replay inputs in order and retain the game and turn grouping when deriving positions.
Useful discovery measurements include human-action recall in a bounded root pool,
mandatory-family coverage, root-cap pressure, and positions where public automove
disagrees with the observed action. Split train, discovery, and validation data by a
stable hash of the whole game to prevent adjacent positions from leaking across sets.

The corpus can identify mechanisms and witnesses, but it cannot replace public causal
reach, independently cold timing below 700 ms, seeded duels, or balanced all-variant
confirmation required by `HOW_TO_ITERATE_ON_AUTOMOVE.md`.

## Validation

From the repository root:

```sh
node ./scripts/check-complete-games.cjs
./scripts/check-automove-hygiene.sh
```
