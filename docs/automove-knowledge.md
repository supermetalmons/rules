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

Fresh offsets exposed selection fit: a `22-2`/`23-1` portfolio fell to `11-13` on
unseen offset 2, and a discovery opening leaked into a nominally fresh corpus. The
42-feature representation had conflicting labels. Exact full states do not rescue it:
`98.77%` are singletons, repeats are opening-only, and `579` repeated keys conflict on
the winner. PairNet, Pareto, DeepSets, outcome residuals, and exact-state priors retire.

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

### Fixed-cap root-family admission

Mandatory-family reservation inside the 40-root cap raised human-action recall from
`294/318` to `298/318` but reached Fast/Normal, not Pro, on the frozen panel. Recall is
not shared public reach; reservation, cap/order, and selector rescues retire.

### Phase-complete regular-mana roots

Training had `961` states in `645` games with an omitted observed regular-mana start.
Bounded completion (`5` sources, `40` transitions) reached Fast/Normal/Pro `5/5/2`
times below `550.25ms`, then lost Fast `4-8`. Admission/routing rescues retire; human
coverage is structural evidence, not an optimality label.

### Exact plain-move commutativity

Strict disjoint plain moves were swap-equivalent on `5,070/5,070` Train and
`1,413/1,413` validation observations. Canonicalization reached every mode/color below
`550.28ms` but scored Fast `6-6`; alternate keys, routing, and order variants retire.

### Exact active-turn win cutoff

The exact score-window oracle found `2,320` Train and `683` validation win states, but
its first proof exceeded the frozen `250,000`-transition cap. It died before runtime;
do not install an online cutoff or relax the cap.

### Carrier scoring corrections

Carrier ownership reached `30,629/9,141` states but no Fast move. An exact gate found
`1,038` false windows; Pro Shadow made `20,734` queries/`11,979` maps, timed out, and
broke D/S parity. Ownership, route, scaling, cache, and selector variants retire.

### Budget-complete TT provenance

A node cap can deny depth-one expansion and let an ancestor cache a partial value, but
depth-zero static horizons are complete. Across `192` frozen Training Fast states,
Shadow saw zero denied leaves, invalid ancestor writes, or accepted poisoned values.
The line failed reach; do not relabel horizons, widen the window, or add budget.

### Cheap-scoring and TT reach filters

Held-Bomb distance adjusted `816/415` Training/validation evals but changed none of
`64` Fast moves. Payload deployment reached `82,497` Fast evals yet changed none of
`128` moves. Both lines, wider panels, retuning, and selector rescues are retired.

Restored cheap modern Supermana race control changed one Fast White move below
`6.1ms`, but Normal evaluated the residual zero times on `64` frozen states. The
shared-route premise failed; residual, routing, and weight rescues are retired.

Correcting the cheap Drainer pickup move boundary changed every public mode/color and
stayed below `550.3ms`, but lost the Fast sample `5-7` (White `1-5`, Black `4-2`).
Boundary, denominator, residual, and routing rescues are retired.

Separating bare Spirit activity from physical base exit also reached every mode/color
below `530.3ms`, but frozen Fast manifest `7b1d4b51…bf8ca3` scored `6-6`. Its `2,304`
public calls had zero invalids/mismatches and a `441.80ms` maximum. Physical-only `+24`,
plain-root, and development-preference splits are retired; broad activity remains.

Owner-window cooldown changed `19,767` Fast-White leaf evaluations but `0/64` public
moves; `192` D/S/C calls stayed legal below `20.12ms`. Packed cooldown bits repair a
`706`-item/`326`-key identity collision, but numeric hash tie-order changed a Normal
witness. Both lines retire; any future hash repair must preserve order.

No loose Potion/Bomb or Mystic/Demon mana carriers appeared in `62,917` Train states.
Keep their exact carrier paths: they can score and act later; `BombOrPotion` also has a
real pickup-to-Bomb threat. Revisit only with observed payload-aware states.

Beneficiary-aware pickup semantics replayed `84,618` Train inputs without error and
found `2,035` applicable positions in `450` games. On the frozen 64-game panel, Fast
was legal/repeatable below `30.194ms` but changed `0/32` White moves. Recipient-aware
pickup progress/order, weights, routing, and witness rescues retire for absent shared
public reach.

## Maintenance Rule

Keep this document at most 12 KiB. Add only promoted evidence, a changed shipping contract,
or a lesson that rules out a meaningful class of future work. Replace stale detail
instead of appending a diary. Raw logs, command transcripts, per-position traces, and
prospective mechanisms do not belong here. Candidate harnesses and logs are deleted
when the line ends; permanent tests cover shipping behavior and release gates.
