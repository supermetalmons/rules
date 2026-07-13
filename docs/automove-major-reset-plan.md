# Automove Major Reset Plan

Review date: 2026-04-27. Current-runtime refresh: 2026-07-13.

This document is the current handoff for escaping the stalled Pro automove loop. Use it before starting another `frontier_pro_v10_bounded_tactical` iteration; `frontier_pro_v2_guarded` is retained only as the previous-production comparator.

## Executive Decision

The project is no longer blocked by lack of a local fix. It is blocked by a feedback loop where local selectors are cheap to invent and broad Pro/Normal/Fast strength is expensive to prove. Future work should move from seam repair to one of two larger implementation tracks:

- build a full outcome corpus that can rank mechanisms before source work;
- build a test-only ProV4 root policy that ranks all root sources with one calibrated comparator.

Do not start from another variant, exact-context, policy-label, branch-label, or first-move selector unless the corpus first shows a repeated mechanism with clean baseline-save separation.

## Project Review

### Runtime

The public Pro path is `frontier_pro_v10_bounded_tactical`, built on the guarded v2 runtime and implemented across:

- `src/models/automove_runtime_variants.rs`: bounded tactical delta, complete-selector deadline/fallback, guarded wrapper chain, and retained fallbacks;
- `src/models/mons_game_model.rs`: root scoring, advisor/reply-risk logic, head acceptance, and final selection;
- `src/models/automove_turn_engine.rs`: turn-engine planning, utility comparison, reply search, and plan cache;
- `src/models/automove_exact.rs` and `src/models/scoring.rs`: exact opportunity and scoring support.

The promoted runtime is layered: targeted drainer fallback, wrapper fallback, root advisor, head acceptance, and final root selection, under the public v10 deadline. Recent evidence shows no inherited layer is globally wrong. Raw ProV2, no-selected-followup, full-scored reply guard, no-late fallback, alternating-white, and white-opening utility policies each repair some openings and regress others.

### Harness

The harness is strong at killing candidates:

- `pro-promotion-dashboard` exposes sampled-vs-active shape and cost;
- `pro-policy-corpus` exposes first-winning policy coverage and mechanism classes;
- `pro-policy-outcome-corpus` exposes candidate deltas, baseline saves, and portfolio stoplights;
- `pro-policy-cross-budget` exposes Pro/Normal/Fast budget conflicts on identical openings;
- decision-record probes expose whether residual failures repeat below branch labels.

The harness is still weak at forcing an architectural choice. Most diagnostics can still be read as "try one more narrow selector" unless future agents follow the stoplight rules. In reset mode, stoplights are routing decisions, not commentary.

### Documentation

The durable lessons are mostly present in `docs/automove-knowledge.md`, `docs/automove-reset-review.md`, and `docs/automove-structural-review.md`. The live board in `AUTOMOVE_IDEAS.md` is too long to be an effective next-action surface. Treat this document as the current major-direction summary and keep future `AUTOMOVE_IDEAS.md` additions short.

## Major Implementation Directions

### 1. Full Outcome Corpus V2

Build the next diagnostic as an outcome table, not another selector.

Required record fields:

- panel, duel, seed tag, repeat, opening index, variant, side, ply;
- baseline result and every candidate result;
- baseline move, candidate move, shipping-control move, and first-divergence board;
- branch, selector stage, pre-accept family, head family, head acceptance;
- selected, pre-accept, head, legacy, preserved, injected, advisor-approved, advisor-ordered, and omitted status for both compared roots;
- root rank, score, family, safety/progress bucket, reply-risk summary, and utility axes;
- outcome class: candidate-only win, baseline-only save, shared win, no-policy win, candidate-better, baseline-better, same outcome;
- cross-budget class for the same opening: all-budget win, non-regressing repair, budget conflict, no help.

Implementation shape:

- Extend `smart_automove_pro_policy_matrix_probe` or add a sibling diagnostic that emits one normalized corpus record per candidate decision.
- Current status: `pro-policy-outcome-corpus` now defaults `SMART_PRO_POLICY_MATRIX_INCLUDE_CORPUS_RECORDS=true`, which emits `PRO_POLICY_MATRIX_CORPUS_RECORD` for every baseline-vs-candidate decision with the full policy result vector, portfolio class, first-divergence board/moves when present, and baseline/candidate final states. Treat this as the raw Outcome Corpus V2 feed.
- Add aggregate stoplights over mechanism keys that include both candidate-only wins and baseline saves.
- Current status: the matrix now emits corpus-wide `PRO_POLICY_MATRIX_GLOBAL_SUMMARY` and `PRO_POLICY_MATRIX_GLOBAL_STOPLIGHT`; set `SMART_PRO_POLICY_MATRIX_GLOBAL_ONLY=true` for broad reset scans that need only the global routing answer. The stoplight reports the max mechanism-class keys so broad `axis=exact_pressure` repeats are visible without printing every aggregate record.
- Current status: with portfolio mechanism classes enabled, the matrix also emits `PRO_POLICY_MATRIX_GLOBAL_MECHANISM_SEPARATION`, which normalizes candidate-only and baseline-better classes to the same `axis=...` key and prints candidate-only, baseline-better, and net counts.
- The current policy-matrix corpus already emits exact-pressure and exact-timing mechanism axes; use those before trying another root-origin or continuation selector.
- Make repeated classes count only when they repeat across at least two panels or opponent budgets.
- Keep state caps and aggregate limits as defaults; widen only after a bounded run reports a non-singleton mechanism.

Promotion value:

- This path should answer "what feature separates wins from saves?" before any runtime code is written.
- If the corpus stays singleton-heavy, preserve the no-go and do not implement a selector.

### 2. Test-Only ProV4 Unified Root Policy

Build a test-only candidate that treats all root sources as one ranked pool:

- guarded selected, pre-accept, and head roots;
- advisor ordered and preserved roots;
- raw ProV2 roots;
- shipping-control roots;
- no-selected-followup and full-scored reply-guard outputs;
- omitted roots recovered from policy components when they remain legal and safe.

Implementation shape:

- Introduce a small `ProV4RootCandidate` record in the diagnostic harness first, with origin labels, root evaluation, utility, reply-risk, and liveness fields.
- Score candidates with one comparator instead of wrapper-specific exceptions.
- Make wrapper branch output a root origin, not a direct routing decision.
- Use cheap cached root-selection snapshots where possible; do not run online rollouts inside the selector.
- Register the policy only as a sweep candidate until dashboard evidence is promotable.

Features to prioritize:

- continuation stability after the selected root;
- preserved/omitted root status as a soft feature;
- reply-risk floor combined with setup/progress value;
- budget-invariant safety/progress deltas;
- timing features for when the winning policy must enter before the printed first divergence.

Kill condition:

- If a ProV4 comparator only reorders existing score, rank, family, safety, and `TurnEngineUtility` fields, it is the already-killed shallow ProV4 path. It needs a new measured feature or corpus-trained weight.

### 3. Corpus-Calibrated Utility Feature

If the outcome corpus finds a repeated win-vs-save split, implement the smallest shared utility feature that explains that split. This should happen below policy labels, not as a selector over policy outputs.

Candidate feature families:

- reply-risk floor adjusted by progress/setup class;
- budget-stable safety delta rather than single-budget score;
- continuation stability from a cached short plan;
- root-origin prior for preserved or omitted roots when utility and safety agree;
- timing penalty or bonus for roots that must enter before head acceptance.

Validation order:

1. Add the feature to a test-only sweep candidate.
2. Run `pro-promotion-dashboard`.
3. If both panels are directionally strong with one explainable miss, run decision records.
4. Only then consider retained runtime code.

### 4. Live-Board and Harness Discipline

Future iterations should start from one of these commands:

```sh
./scripts/run-automove-structural-scout.sh --outcome-corpus frontier_pro_v10_bounded_tactical
```

or, for a new ProV4 candidate:

```sh
./scripts/run-automove-structural-scout.sh --corpus <candidate>
```

Do not run a long full matrix first. Use panel/duel/state filters until one bounded result earns widening.

## Stoplight Rules

- `promotable_shape`: run confirm, then consider runtime retention.
- `sampled_only` or `active_only`: no runtime retention; use decision records only if one miss is explainable.
- `cost_blocked`: kill or redesign the candidate; do not tune strength before cost.
- `coverage_gap`: add a policy/root feature before selector work.
- `baseline_save_risk`: do not encode a selector until baseline saves separate from candidate wins by mechanism.
- `mixed_delta` or `regression_only`: kill the candidate as a direct source path.
- `singleton_selector_pressure`: oracle coverage exists, but there is no selector mechanism.
- `repeated_winner_policy`: too coarse; require repeated context, pair, or mechanism with clean saves.
- `repeated_mechanism_class` at count 2: routing evidence only, not source permission.

## Current No-Go Summary

- The current expanded portfolio has oracle coverage on important sampled and active slices, but the winning labels remain singleton-heavy.
- Active Fast lower-live `ManaTempo` evidence widened into `baseline_save_risk`.
- Sampled outcome-corpus smoke on 2026-04-27 was stopped after the sampled Pro slice because it was too slow for a side diagnostic; the partial result was still `singleton_selector_pressure`, not promotion evidence.
- Static policy selectors, exact context gates, row composites, broad wrapper deletion, shallow ProV4 comparators, online policy rollouts, and broad utility gates are all retired paths unless a new corpus feature changes the evidence.
- Root-origin plus continuation-probe ProV4 selectors are also retired without a new discriminator: the sampled Pro smoke repaired inner-wedge while regressing center-spoke, stayed `2-2` overall, and was materially slower than guarded.
- Alternating-only full-scored reply guard is retired too: active cross-budget with all three active openings widened the apparent clean repair into `partial_repair_coverage_gap`, and the test-only alternating-scoped candidate stayed active Pro `3-3`.
- Active forward-bridge policy-portfolio reuse is retired as a direct source path: isolated `forward_bridge_mana_rows` made no-low-budget look best at only `4-2`, exact active cross-budget over guarded/no-low-budget was pure `coverage_gap` (`6` no-help states), and full-scored reply guard lost two guarded white zero-window safe boards while saving only one black board.
- Sampled Normal repeated-mechanism-class evidence is also retired as direct selector permission: exact cross-budget over the same Normal-seeded states produced `mixed_cross_budget`, with a clean no-selected inner-wedge repair paired with a corner-chain black budget conflict. Sampled Fast's corresponding bounded outcome slice was `shared_only` with guarded winning every checked state and existing policies only adding save risk.
- Sampled Pro's bounded outcome continuation is now retired for the same existing-policy route: the two-state cap was enough to show `shared_only` guarded wins on `inner_wedge_mana_rows`, while shipping-control, raw, no-selected, and full-scored were regression-only or no-delta.
- The first global outcome-corpus stoplight over one state per sampled/active duel showed full current-portfolio oracle coverage but only broad pressure: `candidate_only_wins=4`, `baseline_only_wins=0`, `no_policy_wins=0`, `max_winner_context_games=1`, `max_winner_pair_games=1`, and max class `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`. Do not implement a selector from that class; it needs a narrower corpus-calibrated feature.
- A focused active Fast separation check with three states showed why that broad class is not source-ready: the same `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` key had `candidate_only_games=6` but `baseline_better_games=5`. The apparent lower-live safe-step residue remains active-Fast-only and overlaps the killed lower-live route.

## Required Future Handoff

At the end of each reset iteration, leave exactly one of these:

- a promotable candidate plus confirm instructions;
- a repeated mechanism and the next focused validation command;
- a corpus or harness improvement that reduces singleton ambiguity;
- a documented no-go and no retained source.

If none of those exists, do not commit runtime changes.
