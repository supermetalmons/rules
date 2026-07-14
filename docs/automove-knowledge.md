# Automove Knowledge

This is the compact durable record for shipping automove work. It preserves decisions,
measurements, and reusable failure lessons; it is not an experiment diary. Use
`HOW_TO_ITERATE_ON_AUTOMOVE.md` for the workflow and `AUTOMOVE_IDEAS.md` for the one
next mechanism. The verified `2026-07-13` v10 promotion receipt remains available at
commit `96020462be` as
`docs/automove-frontier-pro-v10-bounded-tactical-promotion-result.json`.

## Current Shipping Truth

Public Fast and Normal retain their shipping search configurations. Public Pro routes
through the behavior promoted as `frontier_pro_v10_bounded_tactical`, built on the
guarded Pro machinery with targeted drainer fallback. The profile name is historical;
production internals may be renamed or flattened as long as the public behavior and
tests remain stable.

Public selection is protected by cooperative deadlines:

- shipping selector outer deadline: `650ms`;
- promoted Pro frontier deadline: `550ms`;
- unchanged shipping-Fast bank inside Pro: `200ms` child deadline;
- immutable measured ceiling: `<700ms` for each independently cold complete call.

When stronger Pro work cancels, selection returns the completed Fast-bank result or a
deterministic legal emergency input. Timeout paths suppress partial cache writes and
clear selector caches. Forced and targeted drainer fallbacks generate the same bounded
lexical prefix formerly obtained by full enumeration, sorting, filtering, and
truncation. These behaviors are part of the reliability contract.

Deadlines are cooperative rather than preemptive. They cannot stop checkpoint-free
enumeration, browser suspension, or scheduler delay. The measured whole-call ceiling
therefore remains authoritative even when internal timers and counters pass.

The public release-route fixture is deliberately discriminating. For its frozen FEN,
public Pro must return `l10,5;l9,4`; retained guarded-v2 and shipping search returned
`l10,6;l9,6`. This is a route regression check, not a position to optimize against.

## Promoted v10 Evidence

The final sampled reliability panels scored:

| Opponent budget | Score | Candidate maximum |
|---|---:|---:|
| Shipping Pro | `7-5` | `550.43ms` |
| Shipping Normal | `7-5` | `550.05ms` |
| Shipping Fast | `10-2` | `551.31ms` |

The all-variant confirmation covered all 12 variants and 48 mirrored games per panel:

| Opponent budget | Score | Candidate maximum | Replay mismatch |
|---|---:|---:|---:|
| Shipping Pro | `33-15` | `550.23ms` | `6/2299` |
| Shipping Normal | `32-16` | `550.05ms` | `0/2288` |
| Shipping Fast | `40-8` | `550.03ms` | `5/2311` |

All panels had zero invalid or empty moves. Corner Chain was the sole below-target
variant against Pro and Normal; no variant was below target against Fast.

The direct all-variant replacement duel against historical guarded v2 scored `16-8`
over 24 mirrored games. Promoted v10 averaged `244.33ms`, reached `562.10ms` maximum,
produced zero invalid moves, and had `4/1139` (`0.35%`) replay mismatches. The historical
unwrapped comparator reached `5,016.97ms`; it is evidence only, not an acceptable
runtime. The direct result proves a Pro replacement. It does not claim that Fast or
Normal were replaced.

The final black-turn-eight tail regression observed promoted repetitions around
`530ms`, with a native maximum of `539.185ms`; the generated Node/Wasm cold measurements
on that fixture were approximately Fast `246.86ms`, Normal `412.364ms`, and Pro
`532.25ms`. A prior `703.067ms` failure was not excused: the frontier deadline was
reduced, the Fast bank bounded, and fallback generation structurally limited before
final evidence was accepted.

## Durable Failed-Direction Lessons

### Static selectors and policy stitching

Selectors assembled from existing policy labels repeatedly rotated losses rather than
creating strength. Candidate-only wins were mixed with baseline-save cases, fragmented
by context and move pair, or reversed across Pro/Normal/Fast budgets. Singleton or
low-frequency axes are routing clues only. Do not install a runtime rule until the same
mechanism repeats on disjoint states without baseline-save contamination.

Opponent-specific continuation planners also exposed a structural trap: a policy can
perfectly exploit the continuation it simulates and lose against another shipping
budget. Cross-budget conflict cannot be repaired by stitching opponent labels into the
public selector without fresh, stable causal evidence.

### More depth, work, or nodes

Guarded depth-five work with a completed iterative depth-three pass changed common-root
scores on all five retained losses but changed only one public move, on White. This was
a reach failure, not a reason to raise the budget.

Completed-depth median and tactical-pool variants had attractive aggregate or
per-variant averages (`187.84/225.64ms` and `151.72/200.06ms`) yet each produced an
individual cold or replay call above `700ms`. Halving tactical nodes merely moved the
failure to another repeat. A centralized visited-node ledger still allowed a
`6,118.820ms` candidate-Black call while its accounting invariants passed. Node budgets
do not bound root generation, turn-engine enumeration, exact analysis, or other
uncharged work. Future cost control must bound the whole computation by construction.

Completed-depth consensus and tactical-pool tweaks are exhausted families. Do not
revive them through a different percentage, completed-depth statistic, cumulative
budget, or selector wrapper.

### Recursive tactics and terminal planning

The frozen two-ply recursive-quiescence candidate was active and contract-correct but
found no nonterminal second-ply chains, return-score changes, or public changes on the
five retained losses. Widening its depth or tactical predicate would spend more on an
unreached seam.

Terminal-plan search appeared acceptable at a `540.53ms` full-match average because an
expensive plan was cached across many calls. A separately frozen cold two-run-per-board
gate measured `3.57–26.73s` on every retained witness. Cached or stateful mechanisms
must pass cold first-call timing before match duels.

Deterministic transposition PUCT used a sound shared state/horizon graph, cycle
exhaustion, proof fixpoint, checked integer arithmetic, and the full `14,022` work cap.
Full calls still averaged `1.836s`, and no witness met `700ms`. Do not retune its
horizon, widening, priors, coefficients, proof rules, or the same work formula. A
future planner must avoid generating expensive nodes rather than redistribute them.

### Learned evaluators and ordering oracles

Fresh offsets exposed selection fit: a model portfolio that scored `22-2`/`23-1` on
calibrated repeats fell to `11-13` on unseen offset 2. Another provenance audit found a
discovery opening reused by an apparently fresh corpus. Four identical 42-feature
vectors also carried conflicting three-budget labels. Current-corpus PairNet, grouped
Pareto, factorized DeepSets, and related evaluator lines are retired until genuinely
fresh data and non-aliasing representations exist.

A learned transition-priority oracle reordered hundreds of dynamically evaluated
children under thousands of dual-teacher consensus edges while leaving all five
guarded public moves unchanged. Ordering quality without admission/depth-plan or public
root reach has no product value. Require a public oracle reach check before collecting
another residual dataset.

### Internal reach is not public reach

Several mechanisms were proven active only by counters. Rank consensus required an
equalized-only shadow before its own contribution could be separated from the search
substrate. Root-policy probes found candidate wins but also same-state blockers and
opposite-side saves. The reusable rule is simple: preserve branch/accounting parity,
change one mechanism, and inspect the actual public move before any expensive duel.

## Maintenance Rule

Keep this document at most 12 KiB. Add only promoted evidence, a changed shipping contract,
or a lesson that rules out a meaningful class of future work. Replace stale detail
instead of appending a diary. Raw logs, command transcripts, per-position traces, and
prospective mechanisms do not belong here. Candidate harnesses and logs are deleted
when the line ends; permanent tests cover shipping behavior and release gates.
