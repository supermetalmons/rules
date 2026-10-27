# Automove promotion history

This archive preserves promotion results and provenance corrections for v16–v19.
The results describe the workloads and baselines used at each promotion. Current
behavior and validation requirements are documented in [architecture](../architecture.md).

## v16: quiet-spirit ordering

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

## v17: Fast ceiling and Normal threat scale

The current Fast ceiling and Normal threat scale were accepted with fresh,
record-disjoint, colour-swapped fixed-node self-play. Every one of the 36,296
recorded moves was independently replayed:

| Mode   | Pairs | Pair wins | Splits | Pair losses | Exact sign p | Invalids / cutoffs |
| ------ | ----: | --------: | -----: | ----------: | -----------: | -----------------: |
| Fast   |   128 |         6 |    122 |           0 |     0.015625 |              0 / 0 |
| Normal |   192 |        24 |    156 |          12 |     0.032623 |              0 / 0 |

Provenance erratum: the v17 README's statement that Fast and Normal kept their
previous identities is accurate only for the 13 recorded decision
observations. The v17 implementation also raised Fast's node ceiling from
38,400 to 39,936 and gave Normal its distinct 35% threat-spare weight identity;
neither change altered those 13 observations.

## v18: Pro residual and verified root challenger

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

## v19: Normal futility estimates

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
