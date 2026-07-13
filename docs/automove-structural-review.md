# Automove Structural Review

Review date: 2026-04-26.

This review is the architecture map for breaking out of the automove dead end. For the current actionable reset plan and handoff rules, read `docs/automove-major-reset-plan.md` first.

## Executive Position

The current blocker is structural, not local. The repo has enough machinery to invent narrow selectors, and the docs contain enough no-go evidence to show that those selectors are the wrong default. The missing piece is a decision process that converts broad panel evidence into either a new root-policy architecture or a calibrated utility feature before runtime code is written.

Do not start the next serious iteration by editing `frontier_pro_v10_bounded_tactical`, adding another turn/color/variant gate, or composing existing policy labels. Start with corpus evidence; v2 is the previous-production control.

## Project Map

- Public runtime: `src/models/mons_game_model.rs`, `src/models/automove_runtime_variants.rs`, `src/models/automove_turn_engine.rs`, `src/models/automove_exact.rs`, and `src/models/scoring.rs`.
- Retained automove profiles: `src/models/automove_experiments/profiles.rs`. `shipping_pro_search`, previous-production `frontier_pro_v2_guarded`, and promoted `frontier_pro_v10_bounded_tactical` are retained.
- Test harness: `src/models/automove_experiments/harness/runner.rs`, `fixtures.rs`, and `tests/mod.rs`.
- Diagnostic harness: `src/models/automove_experiments/tests/diagnostics/mod.rs`.
- Gate tests: `src/models/automove_experiments/tests/gates.rs`.
- Operator scripts: `scripts/run-automove-experiment.sh`, `scripts/run-automove-canonical-loop.sh`, `scripts/run-automove-structural-scout.sh`, and `scripts/run-experiment-logged.sh`.
- Live docs: `HOW_TO_ITERATE_ON_AUTOMOVE.md`, `AUTOMOVE_IDEAS.md`, `docs/automove-strategy.md`, `docs/automove-reset-review.md`, `docs/automove-knowledge.md`, and `docs/automove-archive.md`.

## Findings

### Runtime Architecture

`frontier_pro_v10_bounded_tactical` is a bounded tactical delta over the layered `frontier_pro_v2_guarded` system:

- guarded ProV2 turn-engine configuration;
- pre-search/root advisor logic;
- post-search head acceptance;
- retained wrapper fallbacks around the turn engine;
- search-only shipping fallback behavior in selected contexts.

The failed iterations show that no single layer is globally bad. Raw ProV2, no-selected-followup, no-late-black fallback, full-scored reply guard, and opening utility policies each repair some boards and damage others. Therefore broad deletion of a layer is not the next path.

### Harness Architecture

The harness is strong at killing candidates but weak at forcing the next decision.

- Promotion gates are clear: sampled Pro/Normal/Fast point rate must be at least `7/12` with confidence at least `0.60`; all-variant confirmation allows at most two rows below `0.50` per panel; invalid output and any independently cold whole-selector call above `700ms` remain hard failures.
- The promotion dashboard correctly exposes sampled-vs-active false positives.
- Policy matrix, policy winner, cross-budget, decision-record, and forced-root probes cover most of the needed evidence.
- The stoplight operator affordance now exists in the diagnostics: after a dashboard or corpus run, the harness prints compact labels that should push future agents toward mechanism corpus or architecture work instead of another local selector.

`scripts/run-automove-structural-scout.sh --corpus <candidate>` is now the preferred stuck-mode entrypoint. It runs the dashboard, then runs the default policy corpus portfolio unless `SMART_PRO_POLICY_CORPUS_PORTFOLIO` overrides it.

### Documentation State

The durable docs contain the right lessons, but the live board is still overloaded. `AUTOMOVE_IDEAS.md` should remain a decision board, not a diary. Historical details belong in `docs/automove-archive.md`; stable rules belong in `docs/automove-knowledge.md`; strategic choices belong here and in `docs/automove-reset-review.md`.

Future iterations should add one short live-board note only when the note changes the next decision.

## Why Current Iteration Loops Stall

The repeated pattern is:

1. A narrow board or variant row is found.
2. A context selector or policy-label selector fixes that row.
3. Sampled Pro improves or active blockers improve.
4. Normal, Fast, another sampled row, active blockers, or all-variant confirm fails.
5. The retained knowledge improves, but the next implementation still starts from another local selector.

The accumulated evidence says the current misses are mostly policy-entry timing and root-evaluation conflicts. Existing policies often contain a winning line, but the winning policy may need to enter before or after the printed first divergence. A move table or exact-context gate memorizes the dashboard instead of improving automove.

## Major Paths Still Worth Pursuing

### Path A: Full Outcome Corpus

Extend `pro-policy-corpus` from first winning policy records into a real outcome table across sampled and active panels.

Required fields:

- panel, duel, seed, repeat, opening index, variant, color, turn, ply;
- baseline move, policy move, shipping move, and final outcome;
- selected, pre-accept, head, legacy, preserved, injected, omitted, and advisor status;
- root rank, family, score, reply-risk summary, exact context, and utility axes;
- baseline save, policy win, policy regression, no-policy win, and both-lose labels.

The first retained entrypoint is `pro-policy-outcome-corpus`, which reuses the policy-matrix probe to emit candidate and portfolio stoplights. Run it with panel/duel filters first; enable expensive decision probes only after the stoplight reports a repeated winner context or pair.

Spend runtime code only after this table shows a repeated mechanism across more than one panel or budget. If it stays singleton-heavy, improve the corpus instead of writing runtime code.

### Path B: Test-Only ProV4 Unified Root Policy

Build a test-only policy that ranks all available roots through one comparator:

- guarded selected/pre-accept/head roots;
- advisor ordered and preserved roots;
- raw ProV2 roots;
- shipping-control roots;
- omitted roots that can be recovered safely;
- future ProV3 policy component roots.

Wrapper branches should become candidate labels, not direct routing decisions. The comparator should make reply risk, continuation stability, progress/setup value, and budget-invariant safety first-class features.

This path is larger but matches the failure mode: the same branch or exact context can be a save in one panel and a regression in another.

### Path C: Utility Calibration From Portfolio Outcomes

Use the existing policy portfolio as supervision. For each corpus record, ask what feature separates baseline saves from policy wins.

Feature families still worth investigating:

- continuation stability after the selected root;
- preserved-root and omitted-root status as a feature, not a gate;
- reply-risk floor combined with setup/progress value;
- budget-invariant safety deltas;
- timing features that explain when a policy must enter before the first printed divergence.

Do not add another shallow `TurnEngineUtility` gate unless it introduces a new measured feature and survives the promotion dashboard.

### Path D: Harness Stoplight

The diagnostics now emit compact dashboard, corpus, and sweep-decision-record stoplights:

- `promotable_shape`: every sampled and active Pro/Normal/Fast row is directionally strong;
- `sampled_only`: sampled passes but active fails;
- `active_only`: active passes but sampled fails;
- `budget_conflict`: one policy helps one opponent budget and regresses another;
- `singleton_residue`: records do not repeat below branch/context labels;
- `singleton_regression_pressure`: regressions exist, but no exact context or move pair repeats;
- `branch_only_with_regressions`: branch-only repetition exists while regressions are present;
- `coverage_gap`: the compared policy set does not contain winning lines for every checked opening;
- `baseline_save_risk`: some openings are saved only by the baseline, so selector gates are regression-prone;
- `singleton_selector_pressure`: the policy matrix has oracle coverage but no repeated winner context;
- `repeated_winner_policy`: one policy repeats, but context evidence is still needed before attribution;
- `cost_blocked`: average move time approaches or exceeds the ceiling.

Treat these labels as routing instructions. `promotable_shape` earns confirm spend, `sampled_only` and `active_only` send the candidate to decision records, `cost_blocked` kills or narrows the line, and singleton or branch-only labels kill selectors over the current policy labels.

### Path E: Live Board Reduction

After each iteration, compress `AUTOMOVE_IDEAS.md` to:

- retained profiles;
- current mode, such as `structural-reset`;
- one live hypothesis or `no live runtime hypothesis`;
- the one required next command sequence;
- at most one recent no-go if it changes the next decision.

Everything else should move to `docs/automove-archive.md` or `docs/automove-knowledge.md`.

## Required Next Command Sequence

When there is no live runtime hypothesis:

```sh
./scripts/run-automove-structural-scout.sh --corpus frontier_pro_v10_bounded_tactical
```

For a new test-only candidate:

```sh
./scripts/run-automove-structural-scout.sh --corpus <candidate>
```

If the dashboard is not strong on both sampled and active panels, do not edit runtime code. Read the `PRO_POLICY_WINNER_MECHANISM` corpus output and decide whether to extend the corpus, implement a test-only ProV4 unified policy, or add a new utility feature.

## Promotion Spend Checklist

A candidate earns runtime or retained-profile work only when all are true:

- It changes a shared policy, utility, or root-evaluation mechanism.
- It is not primarily a selector over existing policy labels.
- It is not keyed by exact board, first-diff move, or guarded-selected move.
- It is first measured on the promotion dashboard.
- It is not sampled-only or active-only.
- It does not rotate Normal/Fast down while improving Pro.
- Its nonwins are not singleton-heavy below branch/context labels.
- It stays under the move-time ceiling.

If any item fails, preserve only the durable lesson and discard the source.
