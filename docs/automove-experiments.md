# Automove closeout — September 2026

This effort ended on September 10 with the accepted Fast/shared fixes and
Normal v19 improvement retained. No later Pro candidate was integrated. Pro
strength and no-slowdown qualification remain unproved; further experiments
were stopped at the user's request.

## Retained implementation

- Mystic and Demon threat estimates respect spent actions and available
  potions; carried bombs keep their independent availability.
- Static evaluation keys omit commuting-move context, while transposition
  keys retain it. A compact cache stores clamped, doubled scores, preserving
  Pro's half-point values with 20% less cache storage.
- Winning scouts terminate search only after an unselective search without a
  turn handoff. Interrupted Pro challenger adoption requires a strict
  improvement over the completed incumbent.
- Normal alone reuses tagged futility upper estimates at the same depth and
  a compatible alpha, preserving their heuristic/selective status.

Public APIs are unchanged. Fast/Normal/Pro retain 39,936/184,000/2,000,000 work
units, 50/150/650 ms budgets, and maximum depth 40. The new tests cover threat
availability, cache saturation and half-points, search certificates, and
futility-cache boundaries and lifecycle. The immutable v19 corpus changes
two Normal observations; its Fast and Pro observations match v18.

## Retained evidence

| Mode   | Strength result                                                                      | Final composition mean latency ratio, fixed/public |
| ------ | ------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Fast   | 143–113 games; 26 pair wins, 91 splits, 11 losses; exact paired sign p = 0.01003693  | 0.92293 / 0.92772                                  |
| Normal | 533–491 games; 84 pair wins, 365 splits, 63 losses; exact paired sign p = 0.04935036 | 0.94436 / 0.94651                                  |

Fast used 128 held-out human-record positions. All 6,799 candidate choices
from that campaign were subsequently reproduced with the safer winning-scout
guard. Normal used one planned look at 512 fresh baseline-generated opening
positions. Both campaigns swapped colors and independently replayed every
recorded ply through both rules versions: 13,543 Fast and 58,831 Normal plies,
with no invalid, cutoff, or unfinished games.

Timing used four balanced blocks on 32 states against the original v18
implementation. Fast and Normal passed their fixed/public mean, p95, and CPU
median gates. Pro's fixed p95 ratio of 1.000347 failed the overall gate. These
are workload-specific historical results, not a universal speed guarantee or
an all-mode success claim.

[Acceptance evidence](automove-evidence/acceptance.json) retains per-pair
outcomes, ply counts, exact sign statistics, timing block aggregates, source
hashes, and the earlier successful integration checks. It has no runtime
dependency on temporary files. Full traces and raw timing samples were not
retained, so the compact record supports statistical inspection rather than
fresh replay or reproduction of the benchmarks.

## Pro exploration findings

| Approach                                                          | Outcome and useful finding                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tactical extensions, quiescence, evaluation and resource features | Several candidates changed play but failed development or fresh strength gates. Better local predictions did not establish better play.                                           |
| History, piece/destination ordering and continuation heuristics   | Many failed development or opportunity screens; color-specific killers and the tested continuation policy produced no qualifying primary-result change.                           |
| Learned residuals and teacher-based ranking                       | Carrier/score-role and score-pair recipes failed predictive gates; the odd network failed subsequent development strength. Teacher agreement is insufficient by itself.           |
| Work accounting, budgets and low-level optimizations              | Budget and priced-work variants failed strength eligibility. Lookup tables increased cost; direct access and internal iterative reductions failed strict timing bounds.           |
| Reverse futility and suffix changes                               | The tested scout reverse-futility recipe passed warm checks but failed the cold Pro p95 bound. The suffix recipe failed warm timing. Neither established stronger Pro play.       |
| Multi-cut                                                         | Correctness qualification passed, but none of 16 primary results changed; the effect gate failed.                                                                                 |
| Relative history                                                  | Qualification passed: one move and one score changed across 16 roots, with all 53 calls and 102 recorded replays valid. Speed and strength testing never ran; stopped unfinished. |

[Experiment dispositions](automove-evidence/pro-explorations.json) preserve
the specific failed, descriptive, superseded, and unfinished outcomes.
Failure of a confidence bound is not proof of actual slowdown. Synthetic
controls or changed moves establish neither playing strength nor speed.

Keep selective transposition estimates distinct from verified bounds, retain
parent-perspective and turn-handoff guards, preserve raw work and timeout
semantics, and judge playing strength at the real public budget. The discarded
candidate trees, binaries, scratch harnesses and duplicate logs are not
required by the shipped code or regression tests.
