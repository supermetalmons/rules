# How To Iterate On Automove

This is the canonical automove runbook.

Archived profiles, archived seams, and archived stages are not valid experiment targets. New work stays on the retained Pro surface below.

## Quick Reference

1. Default to Pro work.
2. Optimize for reliable strength across all game variants, not only Classic.
3. Treat `frontier_pro_v2_guarded` as both the shipped Pro path and the only retained frontier.
4. Treat `shipping_pro_search` as the retained search-only baseline.
5. Use `./scripts/run-automove-canonical-loop.sh` for the default loop.
6. Pick exactly one live hypothesis before editing runtime code.
7. Probe first when the mechanism is unclear.
8. When there is no live hypothesis, read `docs/automove-major-reset-plan.md` and switch to the structural reset instead of running another seam loop.
9. In structural reset mode, run a filtered `pro-policy-outcome-corpus` or build the test-only ProV4 root-policy path before writing any selector from policy labels.
10. If decision-record output is singleton by context/pair but still tempting, rerun it with `SMART_PRO_SWEEP_DECISION_RECORD_INCLUDE_MECHANISM_CLASS=true`.
11. Archive or kill the line before starting another.
12. Run `./scripts/check-automove-hygiene.sh` before ending the session.

## Variant Policy

- Quick iteration uses deterministic seeded variant samples. A failed sampled-variant gate is enough to kill a line.
- Final promotion confirmation uses all current `GameVariant`s by default.
- Retained `primary_pro` fixtures are Classic regression controls only. They are not broad variant evidence.
- Use `SMART_AUTOMOVE_VARIANTS=classic,swapped_mana_rows` for a targeted variant rerun.
- Use `SMART_AUTOMOVE_VARIANT_POLICY=classic`, `sampled`, or `all` only when you need to override the stage default.
- Variant randomness is seeded and reproducible from logs.

## Retained Surface

- Retained profiles: `shipping_pro_search`, `frontier_pro_v2_guarded`
- Canonical stages: `guardrails`, `variant-smoke`, `pro-triage`, `runtime-preflight`, `pro-reliability`, `pro-reliability-confirm`
- Canonical triage surface: retained Classic `primary_pro`

## Canonical Loop

```sh
CANDIDATE=<retained_profile_id>
./scripts/run-automove-canonical-loop.sh "$CANDIDATE"
```

- Default shipping profile: `shipping_pro_search`
- Default quick duel variant policy: seeded `sampled`
- Default triage surface inside the loop: retained Classic `primary_pro`
- Add `--confirm` only after `pro-reliability` earns the spend:

```sh
./scripts/run-automove-canonical-loop.sh --confirm "$CANDIDATE"
```

## Single-Stage Runs

Use `./scripts/run-automove-experiment.sh` when you need one stage at a time or a targeted rerun.

```sh
./scripts/run-automove-experiment.sh guardrails frontier_pro_v2_guarded
./scripts/run-automove-experiment.sh variant-smoke frontier_pro_v2_guarded
./scripts/run-automove-experiment.sh pro-triage frontier_pro_v2_guarded
./scripts/run-automove-experiment.sh runtime-preflight frontier_pro_v2_guarded
./scripts/run-automove-experiment.sh pro-reliability frontier_pro_v2_guarded
./scripts/run-automove-experiment.sh pro-reliability-confirm frontier_pro_v2_guarded
./scripts/run-automove-experiment.sh pro-profile-sweep frontier_pro_v2_raw
./scripts/run-automove-experiment.sh pro-promotion-dashboard frontier_pro_v2_raw
./scripts/run-automove-experiment.sh pro-sweep-decision-record frontier_pro_v2_guarded
./scripts/run-automove-experiment.sh pro-policy-matrix frontier_pro_v2_guarded,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard
./scripts/run-automove-experiment.sh pro-policy-outcome-corpus frontier_pro_v2_guarded,frontier_pro_v3_alternating_white_edge_mana,frontier_pro_v3_white_opening_utility_mana,shipping_pro_search_control,frontier_pro_v2_raw,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard,frontier_pro_v2_no_low_budget_guard
./scripts/run-automove-experiment.sh pro-policy-cross-budget frontier_pro_v2_guarded,shipping_pro_search_control,frontier_pro_v2_raw
./scripts/run-automove-experiment.sh pro-policy-winner frontier_pro_v2_guarded,frontier_pro_v3_alternating_white_edge_mana,shipping_pro_search_control
./scripts/run-automove-experiment.sh pro-policy-corpus frontier_pro_v2_guarded,frontier_pro_v3_alternating_white_edge_mana,frontier_pro_v3_white_opening_utility_mana,shipping_pro_search_control,frontier_pro_v2_raw,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard,frontier_pro_v2_no_low_budget_guard
```

Add `SMART_PRO_SWEEP_DECISION_RECORD_INCLUDE_MECHANISM_CLASS=true` to `pro-sweep-decision-record` when the broad branch label repeats but context and move-pair aggregates are singleton. The output adds `PRO_SWEEP_DECISION_RECORD_MECHANISM_CLASS` plus `max_mechanism_class_games`; treat count-2 repeats as routing evidence only, not runtime permission.

## Structural Reset

Use this path when `AUTOMOVE_IDEAS.md` says there is no live challenger or when recent work keeps passing narrow sampled slices and failing broader promotion gates.

```sh
./scripts/run-automove-structural-scout.sh <sweep-candidate[,candidate...]>
```

- Read `docs/automove-major-reset-plan.md` first.
- Read `docs/automove-strategy.md` for the older operational reset map.
- Read `docs/automove-structural-review.md` when deciding whether the next move is corpus work, ProV4 unified policy work, or utility calibration.
- Read `docs/automove-reset-review.md` when the work feels stuck or when no single runtime hypothesis is live.
- The scout is diagnostic-only and starts with `pro-promotion-dashboard` across canonical sampled and active-blocker panels.
- When the candidate is exactly `frontier_pro_v2_guarded`, the structural scout skips the guarded-delta self-comparison by default. Set `SMART_PRO_DASHBOARD_INCLUDE_GUARDED=true` only if you explicitly need the redundant self-delta.
- `pro-promotion-dashboard` now emits `PRO_PROMOTION_DASHBOARD_STOPLIGHT` with labels such as `promotable_shape`, `sampled_only`, `active_only`, `broad_pressure`, `cost_blocked`, and `not_promising`.
- `pro-promotion-dashboard` skips the guarded-delta comparison by default after a panel fails all shipping-direction gates, and emits `PRO_PROMOTION_DASHBOARD_GUARDED_SKIPPED`. Set `SMART_PRO_DASHBOARD_SKIP_GUARDED_AFTER_SHIPPING_FAIL=false` only when the guarded delta is the explicit diagnostic target.
- Structural scout defaults to `SMART_PRO_DASHBOARD_PROMOTION_FAST_FAIL=true`. It emits `PRO_PROMOTION_DASHBOARD_FAST_FAIL` and stops the candidate after the first sampled strict gate or active directional gate failure, so a known-bad candidate does not spend on later duels or panels. Set `SMART_PRO_DASHBOARD_PROMOTION_FAST_FAIL=false` only when a full dashboard is the explicit diagnostic target.
- Do not edit runtime code for a broad Pro change unless the candidate is strong on both panels.
- If no candidate is strong on both panels, use `pro-policy-corpus` to look for repeated root/advisor/head/utility mechanisms across the existing policy portfolio before designing another selector.
- Sweep, dashboard, policy-matrix, policy-corpus, outcome-corpus, cross-budget, winner, and attribution stages print `AUTOMOVE_SWEEP_CANDIDATE_METADATA` before the logged test run. Read the mechanism, expected invariant, risk rows, and kill condition before interpreting any candidate as new evidence.
- Use `./scripts/run-automove-candidate-metadata-smoke.sh` to run the capped sampled structural-scout outcome-corpus smoke and validate candidate metadata output through one stable command path.
- Use `--corpus` on the structural scout when the repo is in reset mode:

```sh
./scripts/run-automove-structural-scout.sh --corpus frontier_pro_v2_guarded
```

- The scout corpus is bounded by default (`SMART_PRO_POLICY_WINNER_STATE_LIMIT=2`, `SMART_PRO_POLICY_WINNER_CANDIDATE_TRACE_LIMIT=64`) so reset-mode runs produce routing stoplights instead of spending on an uncapped mechanism corpus. Override those env vars only when the bounded corpus shows a repeated mechanism worth widening.
- Use `--outcome-corpus` when policy-winner coverage is complete but singleton-heavy and you need matrix stoplights before source work. Keep it filtered first because the full portfolio is intentionally more expensive:

```sh
SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers \
SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_fast \
./scripts/run-automove-structural-scout.sh --outcome-corpus frontier_pro_v2_guarded
```

- Structural-scout `--outcome-corpus` is bounded by default (`SMART_PRO_POLICY_MATRIX_STATE_LIMIT=2`, `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=6`) and emits portfolio mechanism classes by default (`SMART_PRO_POLICY_MATRIX_INCLUDE_PORTFOLIO_MECHANISM_CLASS=true`). It postprocesses the logged policy-matrix run into `.summary.json`, `.jsonl`, and `.workbench.json` artifacts, prints `AUTOMOVE_OUTCOME_CORPUS_POSTPROCESS`, and ends every successful scout with `AUTOMOVE_STRUCTURAL_SCOUT_DECISION` that joins the dashboard stoplight with any outcome-corpus/workbench decision; set `SMART_AUTOMOVE_SCOUT_POSTPROCESS_OUTCOME=false` only when raw log generation is the sole goal. This prints candidate-only winner classes as `PRO_POLICY_MATRIX_PORTFOLIO_WINNER_MECHANISM_CLASS` and baseline-better classes as `PRO_POLICY_MATRIX_PORTFOLIO_BASELINE_BETTER_MECHANISM_CLASS`. `SMART_PRO_POLICY_MATRIX_STATE_LIMIT` is per panel/duel, while `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT` is the true global cap for broad reset digests. Use `SMART_PRO_POLICY_MATRIX_SKIP_STATES=<n>` to skip earlier generated opening-side states when inspecting later sampled pairs without widening the whole corpus. Widen either cap only after bounded stoplights show repeated winner context, winner pair, or portfolio mechanism-class evidence with no baseline-save risk. Use the older `SMART_PRO_POLICY_MATRIX_INCLUDE_MECHANISM_CLASS=true` only for narrow follow-ups; it classifies every candidate delta and can be too slow for all active duels. Corpus records now also emit `timing_continuation_axes`; treat them as postprocess feature-discovery axes, not runtime selectors, until they separate candidate wins from saves across sampled and active evidence. Set `SMART_PRO_POLICY_MATRIX_INCLUDE_POST_MOVE_BUDGET_AXES=true` only for focused budget-stability slices; `post_move_budget` record filters enable those axes automatically. Set `SMART_PRO_POLICY_MATRIX_INCLUDE_POST_MOVE_REPLY_BUDGET_AXES=true` only for focused reply-risk budget-stability slices; `post_move_reply_budget` record filters enable those axes automatically. Set `SMART_PRO_POLICY_MATRIX_INCLUDE_POST_MOVE_VALUE_REPLY_BUDGET_AXES=true` only for focused joint value/reply budget-stability slices; `post_move_value_reply_budget` record filters enable those axes automatically. When using `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER`, read `PRO_POLICY_MATRIX_RECORD_FILTER_SUMMARY`, per-token `axis_filter_matches`, and the capped `PRO_POLICY_MATRIX_RECORD_FILTER_DETAIL` rows before raw records; raise `SMART_PRO_POLICY_MATRIX_RECORD_FILTER_DETAIL_LIMIT` only when the default shortlist hides a relevant split. After a logged policy-matrix run, use `scripts/postprocess-automove-outcome-corpus-log.sh <log>` or `scripts/summarize-automove-policy-matrix-log.py <log>` and read `corpus_decision`, `next_action`, `source_blocker`, `corpus_axis_summary`, `cross_budget_axis_summary`, and `coverage_gap_entries` before opening raw records; `corpus_axis_summary` ranks record-level candidate-better, baseline-better, no-policy, and same-outcome axes, groups them under `top_axes_by_decision`, and marks save-contaminated axes as `baseline_save_risk`. `cross_budget_axis_summary` joins corpus axes by panel, seed family, repeat, opening index, variant, and side across Pro/Normal/Fast duels; read `source_status_counts`, `source_candidate_rollups`, and `blocked_candidate_rollups` before raw rows. `source_candidate_rollups=[]`, `budget_conflict`, `partial_repair_coverage_gap`, `coverage_gap`, `baseline_save_risk`, `fragmented_no_source`, and singleton statuses keep runtime source untouched. For `coverage_gap_entries`, check `same_opening_sibling_states` before raw records to see whether a no-policy side has an opposite-side candidate-only sibling in the same opening. Pass multiple logs together when comparing slices and read `log_rollup.rollup_decision`, `rollup_next_action`, `rollup_permission`, `decision_counts`, `next_action_counts`, `source_blocker_counts`, and `log_summaries` first. `coverage_gap`, `baseline_save_risk`, `singleton_no_source`, `no_candidate_route`, and `postprocess_only` are no-source decisions.
- Add `--confirm` only after the default scout panels look promotable.

## Gate Rules

- `guardrails`: run first; kill the line on tactical or interview-policy regressions.
- `variant-smoke`: cheap all-variant legality check for public Fast, Normal, and Pro paths.
- `pro-triage`: cheap deterministic retained Classic surface gate; pass only when the target surface moves with `off_target_changed <= 1`, or when the shipped `frontier_pro_v2_guarded` surface is intentionally stable on the probed target.
- `runtime-preflight`: required before duel stages unless you are doing diagnostics only; exact-lite is hard, stage-1 CPU is advisory for Pro, and openings use sampled variants.
- `pro-reliability`: sampled-variant frontier-vs-`shipping_pro_search` duels in Pro, Normal, and Fast; pass only with `win_rate >= 0.90`, `confidence >= 0.99`, and frontier average move time `<= 700ms` in all three matchups.
- `pro-reliability-confirm`: all-variant confirmation. Run only after the sampled duel gate earns the spend; it also enforces a per-variant non-regression floor.
- `pro-profile-sweep` and `pro-profile-attribution`: diagnostic-only stages for test-only Pro candidates. They do not add retained profiles and are not promotion stages.

## Iteration Lifecycle

1. Read `AUTOMOVE_IDEAS.md` and select the single current hypothesis.
2. If there is no current hypothesis, use `docs/automove-reset-review.md` to choose a major path before touching runtime code.
3. If the mechanism is not already proven, run one targeted diagnostic before editing runtime code.
4. Make the narrowest runtime or test-only change that can falsify the hypothesis.
5. Run the canonical stages in order; stop immediately on a failed hard gate.
6. If the line fails, discard runtime code and record the no-go in `docs/automove-archive.md` or `docs/automove-knowledge.md`.
7. If the line passes, promote retained Classic regression coverage before confirm.
8. End by compressing `AUTOMOVE_IDEAS.md` back to current state plus one next hypothesis.
9. Run `./scripts/check-automove-hygiene.sh`; clean scratch artifacts and target logs only after their dry-runs show disposable evidence you no longer need.

## Diagnostic Toolbox

Use diagnostics only after the canonical loop shows what is still missing.

- `smart_automove_pro_reliability_duel_trace_probe`
- `smart_automove_pro_reliability_nonwin_trace_probe`
- `smart_automove_pro_reliability_hotspot_probe`
- `smart_automove_pro_profile_sweep_probe`
- `smart_automove_pro_profile_attribution_probe`
- `smart_automove_pro_sweep_decision_record_probe`
- `smart_automove_pro_policy_matrix_probe`
- `smart_automove_pro_policy_winner_probe`
- `smart_automove_pro_promotion_dashboard_probe`
- `smart_automove_pro_decision_record_aggregation_probe`
- `smart_automove_pro_forced_root_oracle_probe`
- `smart_automove_pro_triage_retained_churn_probe`
- `smart_automove_pro_forced_turn_engine_retained_churn_probe`
- `smart_automove_pro_root_advisor_trace_probe`
- `black_recovery_branch_reply_floor_attribution_probe`
- `black_progress_residual_weight_attribution_probe`

`smart_automove_pro_reliability_hotspot_probe` can take one extra ad-hoc board without a source edit:

```sh
SMART_PRO_RELIABILITY_HOTSPOT_LABEL=<label> \
SMART_PRO_RELIABILITY_HOTSPOT_MODE=pro \
SMART_PRO_RELIABILITY_HOTSPOT_FEN='<fen>' \
cargo test --release --lib smart_automove_pro_reliability_hotspot_probe -- --ignored --nocapture
```

`smart_automove_pro_reliability_duel_trace_probe` and `smart_automove_pro_reliability_nonwin_trace_probe` can focus on one duel bucket:

```sh
SMART_PRO_RELIABILITY_DUEL_FILTER=vs_shipping_fast \
cargo test --release --lib smart_automove_pro_reliability_duel_trace_probe -- --ignored --nocapture
```

`smart_automove_pro_profile_sweep_probe` compares test-only Pro candidates against the retained shipping baseline without adding them to the retained profile registry. It prints structured `PRO_PROFILE_SWEEP_RESULT`, `PRO_PROFILE_SWEEP_VARIANT`, and guarded-branch `PRO_PROFILE_SWEEP_BRANCH` lines.

```sh
SMART_PRO_SWEEP_CANDIDATES=frontier_pro_v2_guarded,frontier_pro_v2_raw \
SMART_PRO_SWEEP_DUEL_FILTER=vs_shipping_fast \
SMART_AUTOMOVE_VARIANTS=alternating_mana_rows,forward_bridge_mana_rows \
cargo test --release --lib smart_automove_pro_profile_sweep_probe -- --ignored --nocapture
```

The same sweep is available through the experiment runner:

```sh
SMART_PRO_SWEEP_DUEL_FILTER=vs_shipping_fast \
SMART_AUTOMOVE_VARIANTS=alternating_mana_rows,forward_bridge_mana_rows \
./scripts/run-automove-experiment.sh pro-profile-sweep frontier_pro_v2_raw
```

`smart_automove_pro_promotion_dashboard_probe` summarizes a sweep candidate on both canonical sampled and active-blocker panels. It prints `PRO_PROMOTION_DASHBOARD_RESULT`, weakness-sorted `PRO_PROMOTION_DASHBOARD_VARIANT`, per-panel `PRO_PROMOTION_DASHBOARD_PANEL`, and final `PRO_PROMOTION_DASHBOARD_CANDIDATE` lines. Use it before cutting runtime code when a candidate might be active-blocker-only, sampled-only, or broadly promising.

```sh
./scripts/run-automove-experiment.sh pro-promotion-dashboard frontier_pro_v2_raw
```

For expensive or high-risk scouts, kill quickly on the sampled panel before spending guarded deltas or active blockers:

```sh
SMART_PRO_DASHBOARD_PANEL_FILTER=sampled \
SMART_PRO_DASHBOARD_INCLUDE_GUARDED=false \
./scripts/run-automove-experiment.sh pro-promotion-dashboard <candidate>
```

`smart_automove_pro_profile_attribution_probe` replays the same opening seeds with two sweep candidates against the same shipping opponent, then prints outcome-changing first divergences as `PRO_PROFILE_SWEEP_ATTRIBUTION`, `PRO_PROFILE_SWEEP_ATTRIBUTION_SUMMARY`, `PRO_PROFILE_SWEEP_ATTRIBUTION_BRANCH`, and `PRO_PROFILE_SWEEP_ATTRIBUTION_PAIR` lines. It defaults to `frontier_pro_v2_guarded` vs `frontier_pro_v2_raw`; override with `SMART_PRO_SWEEP_ATTRIBUTION_LEFT` and `SMART_PRO_SWEEP_ATTRIBUTION_RIGHT`.

```sh
SMART_PRO_SWEEP_ATTRIBUTION_LEFT=frontier_pro_v2_guarded \
SMART_PRO_SWEEP_ATTRIBUTION_RIGHT=frontier_pro_v2_raw \
SMART_PRO_SWEEP_DUEL_FILTER=all \
SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows \
cargo test --release --lib smart_automove_pro_profile_attribution_probe -- --ignored --nocapture
```

The attribution wrapper sets the left candidate from the stage argument and reads the right candidate from `SMART_PRO_SWEEP_ATTRIBUTION_RIGHT`:

```sh
SMART_PRO_SWEEP_ATTRIBUTION_RIGHT=frontier_pro_v2_raw \
SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows \
./scripts/run-automove-experiment.sh pro-profile-attribution frontier_pro_v2_guarded
```

`smart_automove_pro_sweep_decision_record_probe` aggregates nonwins or outcome deltas for any registered sweep candidate against a same-seed `shipping_pro_search_control` replay. Use it when a test-only candidate is not a retained profile and the retained-profile decision recorder cannot inspect it.

It emits `PRO_SWEEP_DECISION_RECORD_STOPLIGHT` after each duel summary. Treat `repeated_pair` or `repeated_context` as attribution-worthy, `branch_only` or `branch_only_with_regressions` as too coarse for runtime code, and `singleton_residue` or `singleton_regression_pressure` as a kill for static selectors. `missing_first_diff` means rerun narrower or inspect trace capture before making a source decision.

```sh
SMART_PRO_SWEEP_DECISION_RECORD_SCOPE=nonwins \
SMART_PRO_SWEEP_DECISION_RECORD_DUEL_FILTER=vs_shipping_pro \
./scripts/run-automove-experiment.sh pro-sweep-decision-record frontier_pro_v2_raw
```

`smart_automove_pro_policy_matrix_probe` compares multiple registered sweep policies on identical openings across the sampled and active-blocker panels. The first candidate is the baseline. Use it before writing another policy selector when two ablations each fix one active row but rotate sampled or Fast/Normal losses elsewhere; it prints per-candidate outcome summaries plus first-divergence branch, context, and move-pair aggregates.

`pro-policy-outcome-corpus` is the same policy-matrix diagnostic with a reset-mode name. Use it when the next decision is whether the existing policy portfolio has coverage, baseline save risk, mixed deltas, or a repeated winner context. It is diagnostic-only and does not promote profiles.

`pro-policy-outcome-corpus` enables `SMART_PRO_POLICY_MATRIX_INCLUDE_CORPUS_RECORDS=true` by default. This adds `PRO_POLICY_MATRIX_CORPUS_RECORD` for every baseline-vs-candidate decision, including the full policy result vector, portfolio class, first-divergence board/moves when present, and baseline/candidate finals. Use these records as the starting point for outcome-corpus V2 feature work before enabling expensive decision probes or writing a selector. Set `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER` to a comma-separated list of mechanism-axis substrings from `PRO_POLICY_MATRIX_GLOBAL_ROUTE_BUCKET` when you need only records matching one route bucket.

The matrix also prints `PRO_POLICY_MATRIX_PORTFOLIO` for each panel/duel, followed by weakness buckets as `PRO_POLICY_MATRIX_PORTFOLIO_CLASS`. Read these before designing a context selector: `candidate_only_wins` is the selector opportunity, `baseline_only_wins` is the regression risk, and `no_policy_wins` means the current candidate set cannot solve those openings by selection alone.

It also emits `PRO_POLICY_MATRIX_CANDIDATE_STOPLIGHT` and `PRO_POLICY_MATRIX_PORTFOLIO_STOPLIGHT`. Treat `coverage_gap`, `baseline_save_risk`, `mixed_delta`, and `regression_only` as kills for static selector work; `singleton_selector_pressure` means the portfolio has oracle coverage but no repeated selector mechanism; `repeated_winner_policy` is still too coarse by itself; `repeated_winner_context` or `repeated_winner_pair` is the only matrix label that earns deeper attribution.

The matrix emits `PRO_POLICY_MATRIX_GLOBAL_SUMMARY` and `PRO_POLICY_MATRIX_GLOBAL_STOPLIGHT` across the selected panels and duels. Use `SMART_PRO_POLICY_MATRIX_GLOBAL_ONLY=true` for broad reset scans when you need the corpus-wide routing answer without long record and aggregate output. The stoplights include `max_mechanism_class_key` and `max_baseline_better_mechanism_class_key`; a repeated broad key such as `axis=exact_pressure` with `max_winner_context_games=1` and `max_winner_pair_games=1` is feature-design pressure, not runtime permission.

When `SMART_PRO_POLICY_MATRIX_INCLUDE_PORTFOLIO_MECHANISM_CLASS=true`, the matrix also emits `PRO_POLICY_MATRIX_GLOBAL_MECHANISM_SEPARATION`. This normalizes candidate-only and baseline-better mechanism-class keys to the same `axis=...` text, then prints candidate-only, baseline-better, and net counts. Treat a repeated key with comparable baseline-better counts as contaminated; only a repeated key with clean separation across sampled and active or cross-budget checks can justify a utility-feature experiment.

The same setting also emits `PRO_POLICY_MATRIX_GLOBAL_MECHANISM_ROUTE` for each separated axis. Read its `label` before opening raw records: `baseline_save_risk` kills selector work for that axis, `single_scope_repeat` is routing evidence only, and `cross_panel_clean` / `cross_budget_clean` earns a narrow corpus-record plus decision-probe rerun before source work. The route line includes both mechanism-class emission counts (`candidate_only_games`, `baseline_better_games`) and deduplicated portfolio state counts (`candidate_only_states`, `baseline_better_states`), plus the exact panels and duels behind those counts, so global-only reset scans no longer require manually reconstructing panel/budget coverage from raw logs. Trust route labels based on state counts over raw mechanism-class repeat counts; one state can emit the same axis through several winning policies. The same route line also prints fragmentation counts for policies, variants, colors, branches, and first-move pairs; a clean route with multiple policies, branches, or pairs is still diagnostic rather than source permission.

The matrix also emits `PRO_POLICY_MATRIX_GLOBAL_ROUTE_RECOMMENDATION` when portfolio mechanism classes are enabled. Read this before selecting the next work item: `narrow_low_fragmentation_route` means a clean repeated route has low policy/branch/pair fragmentation and can earn a narrow record/probe rerun; `build_outcome_corpus_v2` means repeated clean routes exist but are too fragmented for runtime code; `baseline_save_risk_only` and `singleton_candidate_routes` are no-source labels; `no_candidate_route` means the portfolio did not expose candidate route signal in the selected slice.

The same mode emits `PRO_POLICY_MATRIX_GLOBAL_ROUTE_BUCKET` as a compact shortlist of the top routes in each bucket: `clean_low_fragmentation`, `clean_fragmented`, `baseline_risk`, and `singleton_candidate`. The default bucket limit is `3`; override with `SMART_PRO_POLICY_MATRIX_ROUTE_BUCKET_LIMIT` when you need a wider shortlist. Read the bucket lines before opening raw route output.

When mechanism-class output is enabled, printed `PRO_POLICY_MATRIX_RECORD` and `PRO_POLICY_MATRIX_CORPUS_RECORD` lines include `mechanism_axes` for the baseline-to-candidate divergence and `baseline_better_mechanism_axes` for reversed baseline-save deltas. Use these fields to connect a clean route axis back to exact records before designing any source change.

`SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER` also filters printed `PRO_POLICY_MATRIX_RECORD` trace lines. When a filter is set, mechanism axes are computed for records even if the broader mechanism-class aggregate flags are off; the filter is for printed record inspection only and does not change outcome counts or route aggregates.

Filtered record runs emit `PRO_POLICY_MATRIX_RECORD_FILTER_SUMMARY` after the global stoplight. Read it before raw records: it reports matching corpus/trace record counts plus distinct panels, duels, policies, outcomes, variants, colors, branch transitions, and first-move pairs. Multiple policies, branches, or pairs in this summary keep the route in Outcome Corpus V2/postprocess territory.

Set `SMART_PRO_POLICY_MATRIX_INCLUDE_DECISION_PROBE=true` on a narrow run when a first divergence needs deeper root evidence. This adds guarded root rank, family, score, selected/advisor status, and full-vs-no-selected-followup utility for both divergent moves. Keep this off for broad matrix runs because it reruns root scoring for printed records.

Set `SMART_PRO_POLICY_MATRIX_INCLUDE_MECHANISM_CLASS=true` only on narrow matrix runs when the stoplights show a policy delta worth classifying. This adds `PRO_POLICY_MATRIX_MECHANISM_CLASS` records keyed by candidate, outcome, and coarse guarded mechanism class, and the portfolio stoplight reports `max_mechanism_class_games`, so candidate wins can be compared against baseline saves/regressions without reading every exact divergence. It reruns root/advisor probes for every nonzero first divergence, so do not enable it for a broad reset portfolio until a filtered run finishes cheaply.

```sh
SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers \
SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_fast \
SMART_PRO_POLICY_MATRIX_REPEATS=1 \
SMART_PRO_POLICY_MATRIX_GAMES=1 \
SMART_PRO_POLICY_MATRIX_INCLUDE_MECHANISM_CLASS=true \
./scripts/run-automove-experiment.sh pro-policy-matrix frontier_pro_v2_guarded,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard
```

`smart_automove_pro_policy_winner_probe` is the faster selector-design companion for a policy matrix with good oracle coverage. It plays the baseline first; when the baseline loses, it tries candidate policies in the provided order until one wins, then prints `PRO_POLICY_WINNER_POLICY`, `PRO_POLICY_WINNER_CONTEXT`, and `PRO_POLICY_WINNER_PAIR`. Use it before writing a selector over an already-viable policy set, but validate the resulting selector with `pro-promotion-dashboard`; first-winning context alone can hide policy-entry timing conflicts.

Set `SMART_PRO_POLICY_WINNER_INCLUDE_MECHANISM=true`, or use the `pro-policy-corpus` wrapper, when the reset path needs mechanism evidence. This adds exact `PRO_POLICY_WINNER_MECHANISM` aggregates keyed by guarded root status, advisor ordered/preserved/approved state, head acceptance, exact context, and utility/root-evaluation axes for the baseline and winning policy moves. It also emits coarser `PRO_POLICY_WINNER_MECHANISM_CLASS` records over stage/head state, baseline-vs-winner role, family, advisor status, rank, safety/progress, and winner-root shape. Use repeated classes to choose the next focused probe; do not treat a class repeat alone as promotion evidence.

Read `PRO_POLICY_WINNER_GLOBAL_STOPLIGHT` and `PRO_POLICY_WINNER_GLOBAL_MECHANISM_CLASS` before long per-duel output. For broad portfolios, keep mechanism-enabled runs filtered by panel, duel, repeats, games, and candidate set. Use `SMART_PRO_POLICY_WINNER_STATE_LIMIT=<n>` to sample each selected panel/duel and `SMART_PRO_POLICY_WINNER_CANDIDATE_TRACE_LIMIT` to cap candidate replay. Summaries include `state_limit_hit=true` or `candidate_trace_limit_hit=true` when the duel was intentionally partial.

A complete policy-winner corpus with `no_policy_wins=0` is still selector evidence, not promotion evidence. If `PRO_POLICY_WINNER_POLICY` and `PRO_POLICY_WINNER_MECHANISM` aggregates remain singleton-heavy, do not write a static policy-label selector; move to outcome-corpus stoplight work, ProV4 unified root policy, or a new measured utility feature.

`pro-policy-corpus` now emits `PRO_POLICY_WINNER_STOPLIGHT` per panel and duel. Treat `singleton_residue` as a kill for selectors over the current policy labels; `coverage_gap` means add a policy/root feature first; `repeated_mechanism` is the corpus label that earns deeper runtime design work; `repeated_mechanism_class` is weaker routing evidence that must be narrowed before source work.

```sh
SMART_PRO_POLICY_WINNER_PANEL_FILTER=sampled \
SMART_PRO_POLICY_WINNER_DUEL_FILTER=vs_shipping_pro \
./scripts/run-automove-experiment.sh pro-policy-winner frontier_pro_v2_guarded,frontier_pro_v3_alternating_white_edge_mana,shipping_pro_search_control,frontier_pro_v2_raw,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard,frontier_pro_v2_no_low_budget_guard
```

Structural reset corpus run:

```sh
SMART_PRO_POLICY_WINNER_PANEL_FILTER=all \
SMART_PRO_POLICY_WINNER_DUEL_FILTER=all \
SMART_PRO_POLICY_WINNER_STATE_LIMIT=2 \
./scripts/run-automove-experiment.sh pro-policy-corpus frontier_pro_v2_guarded,frontier_pro_v3_alternating_white_edge_mana,frontier_pro_v3_white_opening_utility_mana,shipping_pro_search_control,frontier_pro_v2_raw,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard,frontier_pro_v2_no_low_budget_guard
```

`smart_automove_pro_policy_cross_budget_probe` checks whether one policy choice is stable for the same opening side against Pro, Normal, and Fast shipping opponents. It defaults to the sampled panel with one repeat and one opening, then prints `PRO_POLICY_CROSS_BUDGET_SUMMARY`, `PRO_POLICY_CROSS_BUDGET_STOPLIGHT`, `PRO_POLICY_CROSS_BUDGET_CLASS`, and policy lists for all-budget wins and non-regressing repairs. Use it before building a selector from policy-winner data; `coverage_gap`, `partial_repair_coverage_gap`, `baseline_save_risk`, `budget_conflict`, or `mixed_cross_budget` means the policy set is not a source candidate yet. Those labels mean the next spend needs either another root feature or a shared utility discriminator, not another static gate.

Keep cross-budget runs narrow. Start with the smallest policy set that explains the conflict, then widen only if the summary shows clean repairs. To replay openings from a specific policy-winner duel, set `SMART_PRO_POLICY_CROSS_BUDGET_SEED_OPPONENT_MODE=pro|normal|fast` and the matching `SMART_PRO_POLICY_CROSS_BUDGET_SEED_TAG`; use `SMART_PRO_POLICY_CROSS_BUDGET_STATE_LIMIT=<n>` for small exact follow-ups and `SMART_PRO_POLICY_CROSS_BUDGET_SKIP_STATES=<n>` to skip earlier generated opening-side states. Keep `SMART_PRO_POLICY_CROSS_BUDGET_REPEATS` and `SMART_PRO_POLICY_CROSS_BUDGET_GAMES` aligned with the source matrix or winner run; otherwise the same skip offset can replay a different opening.
`PRO_POLICY_WINNER_SUMMARY`, `PRO_POLICY_WINNER_STOPLIGHT`, `PRO_POLICY_CROSS_BUDGET_RECORD`, and `PRO_POLICY_CROSS_BUDGET_SUMMARY` print the effective `seed_tag`; copy that value directly into `SMART_PRO_POLICY_CROSS_BUDGET_SEED_TAG` for exact seed-aligned follow-ups.

Set `SMART_PRO_POLICY_CROSS_BUDGET_INCLUDE_MECHANISM_CLASS=true` when a narrow cross-budget run has clean or non-regressing repairs and you need root/advisor/utility classes below the policy label. The default `SMART_PRO_POLICY_CROSS_BUDGET_MECHANISM_CLASS_FILTER=stable` classifies only clean all-budget and non-regressing repairs; use `conflicts` or `all` only for focused follow-ups. Keep `SMART_PRO_POLICY_CROSS_BUDGET_MECHANISM_CLASS_LIMIT` low because each classified divergence reruns guarded root/advisor probes.

Broad cross-budget portfolios are intentionally expensive. Prefer one candidate family at a time; a comma-separated reset portfolio should only be run after smaller checks find a repeated stable mechanism worth widening.

```sh
SMART_PRO_POLICY_CROSS_BUDGET_PANEL_FILTER=sampled \
SMART_PRO_POLICY_CROSS_BUDGET_REPEATS=1 \
SMART_PRO_POLICY_CROSS_BUDGET_GAMES=1 \
SMART_PRO_POLICY_CROSS_BUDGET_STATE_LIMIT=2 \
SMART_PRO_POLICY_CROSS_BUDGET_SKIP_STATES=0 \
SMART_PRO_POLICY_CROSS_BUDGET_INCLUDE_MECHANISM_CLASS=true \
./scripts/run-automove-experiment.sh pro-policy-cross-budget frontier_pro_v2_guarded,shipping_pro_search_control,frontier_pro_v2_raw
```

`smart_automove_pro_forced_root_oracle_probe` forces each scored root once from one blocker board, then continues with a registered sweep candidate against retained shipping Pro. Use it when the policy matrix reports `no_policy_wins` for a specific context and you need to know whether the root set already contains winning moves before creating another policy. Override `SMART_PRO_FORCED_ROOT_ORACLE_FEN`, `SMART_PRO_FORCED_ROOT_ORACLE_CONTINUATION`, and `SMART_PRO_FORCED_ROOT_ORACLE_ROOT_LIMIT` for focused boards. Use `SMART_PRO_FORCED_ROOT_ORACLE_ROOT_SOURCE` when the roots must come from a runtime profile but the continuation is a test-only policy without runtime root scoring. When the board comes from a full-opening first divergence, set `SMART_PRO_FORCED_ROOT_ORACLE_START_PLY` to that `first_diff_ply` and set `SMART_PRO_FORCED_ROOT_ORACLE_MAX_PLIES` to the source corpus' max plies; otherwise the oracle grants extra rollout horizon and can turn full-opening losses into false local wins.

```sh
SMART_PRO_FORCED_ROOT_ORACLE_FEN='<fen>' \
SMART_PRO_FORCED_ROOT_ORACLE_CONTINUATION=frontier_pro_v2_guarded \
SMART_PRO_FORCED_ROOT_ORACLE_START_PLY=<first_diff_ply> \
SMART_PRO_FORCED_ROOT_ORACLE_MAX_PLIES=<source_corpus_max_plies> \
cargo test --release --lib smart_automove_pro_forced_root_oracle_probe -- --ignored --nocapture
```

After logging one or more forced-root oracle runs, use `scripts/summarize-automove-forced-root-oracle-log.py <log>` before reading raw roots. Read `oracle_decision`, `next_action`, `root_coverage`, `promising_repeated_axes`, and `repeated_winner_axes`. Winner-only repeats are not enough; the digest reports `nonwinner_count` and `winner_precision`, and axes that also appear on losing roots remain postprocess evidence rather than ProV4 source permission.

`smart_automove_pro_decision_record_aggregation_probe` aggregates first-divergence records against `shipping_pro_search` and reports whether the shipping root was selected, pre-accepted, head-selected, legacy-selected, candidate-live, advisor-approved, ordered, preserved, injected, or omitted. Use `SMART_PRO_DECISION_RECORD_SCOPE=nonwins` when the promotion miss is flat losses rather than frontier-worse-than-shipping deltas.

```sh
SMART_PRO_DECISION_RECORD_SCOPE=nonwins \
SMART_PRO_DECISION_RECORD_DUEL_FILTER=vs_shipping_fast \
SMART_AUTOMOVE_VARIANTS=alternating_mana_rows,forward_bridge_mana_rows \
cargo test --release --lib smart_automove_pro_decision_record_aggregation_probe -- --ignored --nocapture
```

All diagnostics run through the ignored test harness:

```sh
cargo test --release --lib <test_name> -- --ignored --nocapture
```

## Artifacts

- Selected-profile logs: `target/experiment-runs/<profile>/`
- Workflow-only logs: `target/experiment-runs/misc/`
- Runtime-preflight stamps: `target/experiment-stamps/`
- Scratch files: `/tmp/automove-*`, `/private/tmp/automove-*`, `/tmp/mons_rust-*.sample.txt`, `/private/tmp/mons_rust-*.sample.txt`, and repo-local Python `__pycache__` directories used by automove scripts.
- Run metadata records the stage variant policy and any explicit variant override.
- Rust gate logs print resolved variant policy, sample size, and per-variant duel summaries.
- Logs and stamps are disposable evidence, not durable memory.

Scratch cleanup:

```sh
./scripts/check-automove-hygiene.sh
./scripts/cleanup-automove-iteration-artifacts.sh --dry-run
./scripts/cleanup-automove-iteration-artifacts.sh
```

Target log/stamp cleanup:

```sh
./scripts/clean-experiment-artifacts.sh --dry-run
./scripts/clean-experiment-artifacts.sh
```

Full local cache cleanup after validation:

```sh
./scripts/clean-experiment-artifacts.sh --dry-run --all-target
./scripts/clean-experiment-artifacts.sh --all-target
```

## Session End

1. Update `AUTOMOVE_IDEAS.md` with the current live state or next frontier.
2. Move durable lessons into `docs/automove-knowledge.md`.
3. Move retired wave detail into `docs/automove-archive.md`.
4. Run `./scripts/check-automove-hygiene.sh` once validation is complete.
5. Clean target logs/stamps separately only when the disposable evidence is no longer needed.
6. Leave exactly one clear next hypothesis, or explicitly record that there is no live challenger.
7. Do not leave unarchived probe diaries or failed runtime branches in the live board.
