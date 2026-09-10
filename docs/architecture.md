# Architecture

This is the maintainer contract for the source tree, automove behavior, and
immutable test data.

## Dependency direction

The published entrypoint exports the public API. The API adapts the rules
engine and requests automove suggestions; automove operates directly on engine
state. CLI programs exercise the engine without depending on the public façade.

```text
entrypoints -> api -> automove -> engine
                  \------------> engine
cli ---------------------------> engine
```

`api/types.ts` is the shared leaf used to preserve public and internal enum and
value identity. Engine and automove code may depend on that leaf, but neither
may depend on the API façade. Internal modules import implementations directly;
only the published entrypoint and the deliberate API-type identity boundaries
reexport another module.

The engine has five directed areas:

```text
game -> rules -> board -> model
  \----> codec ----^       ^
  \----> board ------------/
```

- `model` owns domain values, copying, equality, and stable keys.
- `board` owns geometry, variant configuration, and storage.
- `rules` owns legality, counters, and event application.
- `codec` translates between canonical serialized and in-memory values.
- `game` owns orchestration, staged input, history, and query caches.

`engine/model/domain.ts` has one type-only geometry dependency for the shared
location shape. The architecture test enforces all other engine direction,
acyclic imports, a flat automove directory, direct-import rules, at most 43
source files and 12,000 lines total, and an 800-line per-module ceiling. Modules
over the preferred 600-line limit must have a current cohesion reason in that
test.

## Automove

Automove is one flat packed-search implementation:

| Modules                                    | Responsibility                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------- |
| `allocation`, `board`, `state`             | Allocation failures, packed board values, mutable position state, undo, and hashing |
| `bridge`                                   | Lossless conversion between engine state, packed moves, and public inputs           |
| `moves`                                    | Deterministic complete-move generation and ordering                                 |
| `evaluation-weights`, `evaluation`         | Validated weights, lookup tables, attack data, and position scoring                 |
| `search-tuning`, `transposition`, `search` | Search limits, bounded caches, iterative deepening, and selective PVS/negamax       |
| `selector`                                 | Public preference profiles, deadlines, and optional searcher reuse                  |
| `suggestion`                               | Source-pure application checks and deterministic legal fallback                     |

The public profiles are fixed:

| Preference | Wall-clock budget | Fixed-clock node ceiling | Threat spare scale | Learned residual |
| ---------- | ----------------: | -----------------------: | -----------------: | ---------------- |
| Fast       |             50 ms |                   39,936 |                25% | None             |
| Normal     |            150 ms |                  184,000 |                35% | None             |
| Pro        |            650 ms |                2,000,000 |                25% | Frozen mon PST   |

Search is cooperative, so runtime, JIT, cache, and garbage-collection timing
can change a live selection. Reaching the deadline normally retains the
supported nonzero move from the last completed iteration. Pro may instead adopt
a strictly better root challenger from the interrupted iteration, but only
after that challenger displaced the prior incumbent in a completed full-window
re-search. Fast and Normal do not use this rule. If no supported move is
available, the packed state is unsupported, allocation fails, or a selected
move cannot be applied, `suggestion` returns the first deterministic complete
legal move. Suggestions must remain legal and leave the source game
byte-for-byte unchanged.

A completed winning scout with no turn handoff or selective pruning ends
search immediately in every mode. It skips the full-window re-search and
aspiration widening that would only refine the winning score. Static
evaluations and stored nonterminal bounds cannot reach the terminal score
band. The handoff guard excludes cross-turn claims whose suggestion tree
may omit a legal early mana defense.

The shipped search keeps aspiration windows for Fast and Normal, bounded
transposition data for selective nodes, deterministic ordering for commuting
mon sub-moves, stable preselection of the two highest-priority moves, cached
evaluation and attack tables, and a winning regular-mana step at any point in a
turn. Quiet spirit pushes use ordinary quiet-move ordering while tactical
pushes retain reduction and pruning exemptions. Evaluation models score shape,
mana delivery, one- and two-point drainer trips, attack exposure, and relative
scoring tempo. Selective subtree transpositions carry move ordering only when
their score-bound direction is not known. Pro adds a frozen two-endpoint mon
piece-square residual behind its own weight identity; Fast, Normal, and
equal-valued custom weights never allocate or run it. Transposition scores use
doubled fixed-point Int32 units so the residual's half-point values retain exact
bounds.

Static evaluation keys exclude the previous commuting mon move, allowing
interior nodes and leaves to share evaluations of the same position.
Transposition keys retain that context because it changes the moves searched.
Each evaluation-cache entry packs both key words, its epoch, and a doubled
score into 16 bytes. Symmetric nonterminal clamping before storage preserves
custom-weight saturation and Pro's half-point scores while reducing cache
storage by 20%.
Mystic and Demon threat estimates respect an active attacker's remaining
actions and potions; carried bombs retain their independent availability.

Normal also stores a tagged heuristic upper estimate after its own futility
pruning omits a quiet tail. Reuse requires the same depth and an alpha at least
as high as that estimate. The tag separates these entries from verified bounds
and preserves selectivity on every hit.

The Normal-only v19 promotion retained the 184,000-work-unit cap and 150 ms
budget. A single planned validation on 512 baseline-generated opening positions
finished 533–491 over 1,024 colour-swapped games: 84 pair wins, 365 splits, and
63 pair losses (exact one-sided paired sign p = 0.04935036). Independent replay
verified all 58,831 plies with zero invalid, cutoff, or unfinished games.
Four balanced timing blocks on 32 states gave Normal fixed/public mean latency
ratios of 0.94436/0.94651 and p95 ratios of 0.96694/0.95942 against the original
v18 implementation. Pro's fixed p95 ratio of 1.000347 failed the overall timing
gate; this promotion establishes Normal's improvement. The Pro exploration
was closed without a strength or no-slowdown claim; see the
[automove closeout](automove-experiments.md) for retained results and findings.

The active deterministic contract is
[automove decisions v19](../test-data/automove-decisions/v19/README.md): 13
states across all three preferences, or 39 decisions, with
`performance.now()` fixed at zero. The READMEs and manifests beside every
protected automove corpus contain the historical provenance; do not duplicate
or rewrite that history here.

Provenance erratum: the v17 README's statement that Fast and Normal kept their
previous identities is accurate only for the 13 recorded decision
observations. The v17 implementation also raised Fast's node ceiling from
38,400 to 39,936 and gave Normal its distinct 35% threat-spare weight identity;
neither change altered those 13 observations.

The final quiet-spirit ordering change was accepted using held-out,
colour-swapped, fixed-node self-play before v16 was recorded:

| Mode   | Pairs |   Elo |   95% interval | Invalids / cutoffs |
| ------ | ----: | ----: | -------------: | -----------------: |
| Fast   | 1,280 | +21.5 |  +9.1 to +33.9 |              0 / 0 |
| Normal | 1,280 | +25.3 | +12.2 to +38.5 |              0 / 0 |
| Pro    |   320 | +50.3 | +24.6 to +76.5 |              0 / 0 |

An eight-block ABBA latency run over 64 midpoint states measured
candidate/baseline mean ratios of 0.997 for Fast, 0.998 for Normal, and 1.000
for Pro. These are historical rationale; the immutable decision corpus and
current repository checks are the executable contract.

The current Fast ceiling and Normal threat scale were accepted with fresh,
record-disjoint, colour-swapped fixed-node self-play. Every one of the 36,296
recorded moves was independently replayed:

| Mode   | Pairs | Pair wins | Splits | Pair losses | Exact sign p | Invalids / cutoffs |
| ------ | ----: | --------: | -----: | ----------: | -----------: | -----------------: |
| Fast   |   128 |         6 |    122 |           0 |     0.015625 |              0 / 0 |
| Normal |   192 |        24 |    156 |          12 |     0.032623 |              0 / 0 |

The Pro residual and verified-root-challenger combination then passed a fresh
held-out campaign whose outcomes were unavailable during candidate selection:

| Mode | Pairs | Pair wins | Splits | Pair losses | Exact sign p | One-sided Elo lower bound | Invalid / unfinished |
| ---- | ----: | --------: | -----: | ----------: | -----------: | ------------------------: | -------------------: |
| Pro  |   384 |        91 |    242 |          51 |     0.000497 |                     +48.5 |                0 / 0 |

All 768 Pro games terminated normally. The first- and second-half pair margins
were +13 and +27. An independent result audit replayed every recorded trace
through both rules bundles and reconstructed the same outcomes and exact
statistics.

At the v18 promotion, the public bundle was byte-identical to the audited candidate bundle.
A 425-case trace audit found identical node, evaluation, allocation, legality,
and timeout lifecycles; Fast and Normal decisions were exact, while all 39
verified-challenger activations were Pro-only and authenticated. The final
eight-block no-slow campaign produced these favourable ratios against the
previous implementation (values above one favour the promoted candidate):

| Mode   | Candidate/current fixed throughput | Candidate/current fixed CPU | Current/candidate public mean latency | Current/candidate public p95 latency | Current/candidate public CPU |
| ------ | ---------------------------------: | --------------------------: | ------------------------------------: | -----------------------------------: | ---------------------------: |
| Fast   |                             1.0199 |                      1.0358 |                                1.0154 |                               1.0199 |                       1.0143 |
| Normal |                             1.0133 |                      1.0119 |                                1.0185 |                               1.0164 |                       1.0191 |
| Pro    |                             1.0104 |                      1.0100 |                                1.0055 |                               1.0040 |                       1.0058 |

All fixed-work and public latency gates passed in every mode. Stable top-two
ordering removes redundant selection scans, and the Pro challenger rule only
changes which already-computed, fully verified result is retained; it adds no
search nodes, evaluations, or allocations.

## Validation, release, and data

`npm run check` is the canonical repository gate. It formats, lints,
type-checks, runs unit and corpus tests, replays complete games, verifies
protected data, builds the package, and validates its Node, browser, worker,
runtime, declaration, and tarball surfaces. The compressed rules regression
corpus is run through `./scripts/run-rules-tests.sh`; an integrity-only
complete-games check is available as
`node ./scripts/run-complete-games.mjs --check-only`.

Release preparation uses `npm run bump`, followed by
`npm run publish -- --check-only`; `npm run publish` performs the validated
publish from a clean worktree.

All existing payloads under `test-data/complete-games/v1/`,
`test-data/automove-decisions/`, and `test-data/compatibility-edge-cases/v1/`,
plus `test-data/rules-regressions.jsonl.gz`, are immutable. Never normalize,
deduplicate, reorder, regenerate, or replace them. Put a changed source corpus
in a new version directory and put derived reports under `target/` or the OS
temporary directory.
