# Automove Ideas

This is the live decision board for automove work. Keep it short and decision-oriented.

Use `HOW_TO_ITERATE_ON_AUTOMOVE.md` for workflow, `docs/automove-major-reset-plan.md` for the reset handoff, `docs/automove-knowledge.md` for durable rules, and `docs/automove-archive.md` for retired wave detail.

## Current State

- Public Pro routes through `frontier_pro_v2_guarded`.
- `shipping_pro_search` remains the retained search-only baseline.
- Retained profiles are only `shipping_pro_search` and `frontier_pro_v2_guarded`.
- The live experiment surface is Pro-only and multi-variant.
- The current mode is `structural-reset`.
- There is no live runtime hypothesis and no promotable challenger.
- Runtime source stays untouched until a new measured root feature or a test-only ProV4/root-policy candidate separates candidate wins from guarded saves across sampled and active evidence with low fragmentation.

## Latest No-Source Summary

- 2026-06-25 pre-diff entry timing work stayed no-source. The retained change is diagnostic only: `timing_continuation_axes` now emits `axis=pre_diff_entry ...`, which buckets hidden same-move branch/path disagreement before the first visible move divergence without policy ids, exact boards, or move pairs in the axis key.
- The focused active Fast slice (`20260625-012426`) ended `corpus_decision=singleton_no_source`, `source_candidate_axis_count=0`, and no root-pool rows. Its candidate-bearing pre-diff rows were either singleton or fragmented by candidate policy, branch, and first-move pair. The focused sampled Pro slice (`20260625-012712`) ended `corpus_decision=no_source`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=100`; `axis=pre_diff_entry lead=same_turn hidden_same_move=true first_diff=present` repeated across two states but mixed one candidate-better state with two same-outcome states and remained fragmented by candidate policy, branch, and first-move pair. Do not promote or write selectors from pre-diff entry timing buckets.
- 2026-06-25 root class-vector and root-budget stability work stayed no-source. The retained changes are diagnostic/postprocess only: root-pool `class_vector`/`class_family`/`class_priority`, root-level Pro/Normal/Fast eval/reply/value-reply stability buckets, and workbench sample-root visibility for class/root-budget/root-input-goal fields.
- The focused sampled Pro candidate-bearing root-budget slice (`20260625-010722`) ended `corpus_decision=singleton_no_source`, `source_candidate_axis_count=0`, `root_pool_decision=contaminated_root_pool_signals`, and `low_fragmentation_repeated_candidate_signal_count=0`. The `root_budget_stability` family had `rollup_status=contaminated_no_source` with `candidate_state_count=2`, `blocker_root_count=85`, `guarded_blocker_root_count=70`, and `same_state_blocker_root_count=38`. Do not promote or write selectors from root class-vector or root-budget stability buckets.
- 2026-06-18 reset work stayed no-source. The retained changes are diagnostic/postprocess only: policy-matrix and cross-budget skip offsets, gated post-move budget/reply/value-reply axes, and workbench JSONL coverage for `first_move_goal` axes.
- Reprocessed focused and aggregate 2026-06-18 logs still had `source_candidate_axis_count=0` and `source_candidate_rollups=0`. Post-move reply/value-reply and move-goal rows were singleton-heavy, fragmented by policy/branch/first-move pair, or contaminated by guarded baseline saves.
- Temporary budget/width/root-pool/root-policy scouts were pruned. The strongest sampled Pro repair (`11-1`) immediately rotated into sampled Normal failure (`7-5`), while other candidates stayed at `8-4` or worse, failed cost, or failed sampled dashboards.
- Current skip controls and gated axes are retained only as feature-discovery tools. Do not rerun `pre_diff_entry`, `post_move_budget`, `post_move_reply_budget`, `post_move_value_reply_budget`, current root-pool slices, or first-move goal rows as source work.
- 2026-06-11 `frontier_pro_v4_targeted_arbitration` was built as a test-only stitched arbitration scout and pruned. It combined an inner-wedge early-white raw repair, measured shipping-save turn shapes, one forward-bridge Pro oracle root, and three sampled Normal oracle roots. The best version fixed sampled Pro to `11-1` and sampled Normal to `12-0`, but sampled Fast collapsed to `5-7` (`win_rate=0.4167`, `confidence=0.0000`, max dashboard average `257.23ms`) with `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`.
- This confirms direct sampled-row stitching still rotates the failure into another budget. Do not promote or reopen targeted arbitration, approved-vs-ordered root patches, or sampled Pro/Normal oracle first moves as source; Fast losses remained broad across center-spoke, corner-chain, offset-arc, inner-wedge, and forward-bridge.
- 2026-06-11 `frontier_pro_v4_adaptive_reply_progress` was built as a test-only frontier-execute root override and pruned. It tried to balance safe mana-progress roots against SpiritImpact roots using reply-floor, follow-up floor, safety, setup, rank, and utility evidence, but sampled Pro collapsed to `6-6` (`win_rate=0.5000`, `confidence=0.0000`, `229.66ms`). It fired `148` safety overrides and only `3` spirit overrides, damaging `inner_wedge_mana_rows`, `center_spoke_mana_rows`, `alternating_mana_rows`, and `forward_bridge_mana_rows`.
- This confirms the active-Fast exact-pressure conflict is not solved by a broad safe-progress override. Do not reopen this shape without a new discriminator that prevents the safety branch from overwhelming sampled Pro.
- 2026-06-11 bounded and widened active Fast outcome corpora over the reset portfolio stayed `postprocess_only` with zero runtime source candidates. The bounded structural scout for `frontier_pro_v2_guarded` reproduced dashboard weakness (`7-5`, `win_rate=0.5833`, `confidence=0.6128`) and postprocess ended with `clean_low_fragmentation_routes=0`, `clean_fragmented_routes=7`, and `source_candidate_rollups=0`.
- The widened active Fast corpus raised repeated mechanism coverage but confirmed the blocker: the tempting `exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` route had candidate-only wins across four states while also carrying baseline-better saves across two states, so it is `baseline_save_risk`, not source. The remaining clean routes were still fragmented by policy, branch, or first-move pair; do not promote or hand-code role/policy route selectors from this evidence.
- 2026-06-11 sampled Normal outcome corpus over the reset portfolio also stayed postprocess-only. It had oracle coverage (`total_games=6`, `candidate_any_wins=6`, `candidate_only_wins=4`, `baseline_wins=2`) but the best clean route was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons0 can_action=true can_mana=true opp_win=false`, with only two states and fragmentation across two policies and two first-move pairs. Workbench source permission was `no_source`, with blockers dominated by `fragmented_no_source`, `singleton_non_regressing`, and `baseline_save_risk`; do not promote an early-white exact-timing or fallback-disable selector.
- 2026-06-11 active Fast + sampled Normal combined postprocess still had `source_candidate_axis_count=0` and `source_candidate_rollups=0`. A bounded active Fast run with ProV4 root-pool snapshots was stopped for cost after partial evidence, but postprocess still reported `root_pool_source_permission=no_source`, `guarded_delta_source_permission=no_source`, `low_fragmentation_repeated_candidate_signal_count=0`, and `low_fragmentation_repeated_candidate_delta_signal_count=0`. The repeated root-pool rows were the already-failed broad safe/lower-unlisted progress family.
- 2026-06-11 `frontier_pro_v3_full_scored_reply_guard` was checked directly after a one-state sampled cross-budget hint. It failed sampled Pro immediately at `1-11` (`win_rate=0.0833`, `confidence=0.0000`, `178.25ms`) with stoplight `not_promising`, so it remains portfolio evidence only and must not be promoted.
- 2026-06-11 `frontier_pro_v4_safe_progress_root_policy` was built as a test-only root-policy scout and pruned. A direct black `forward_bridge_mana_rows` weak-window shipping fallback moved sampled Pro to a strict pass (`11-1`, `win_rate=0.9167`, `confidence=0.9968`, `196.24ms`), but sampled Normal immediately failed (`8-4`, `win_rate=0.6667`, `confidence=0.8062`, `252.73ms`) with weak rows across `inner_wedge_mana_rows`, `outer_edge_mana_rows`, `forward_bridge_mana_rows`, and `corner_chain_mana_rows`.
- The Normal follow-up decision records were fragmented across four singleton contexts and move pairs; the broadest repeated class was only `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`. This remains no-source evidence and must not be promoted or reopened as a variant/exact-context selector.
- 2026-05-31 `frontier_pro_v4_phase_gated_context` was built as a test-only exact phase/context composite and then pruned. It reached `promotable_scout` dashboard shape (`sampled`: Pro `11-1`, Normal `11-1`, Fast `12-0`; `active_blockers`: Pro/Normal/Fast all `6-0`; max dashboard average `~213ms`) but failed `--confirm` all-variant breadth: Pro `15-9`, Normal `13-11`, Fast `19-5`, all `duel_passes=false`.
- The phase-gated composite is not runtime source and must not be reopened as a direct target. It proved the reset portfolio can be stitched into sampled/active dashboard coverage, but exact FEN / policy-label routing did not generalize to all current variants.
- 2026-05-31 move-goal and root-input-goal postprocess fields were added as diagnostics. Active Fast, full sampled Pro, widened active Fast, sampled Normal, sampled Fast, and active Pro outcome corpora still produced no runtime source permission: decisions stayed `no_source`, `postprocess_only`, `baseline_save_risk`, `coverage_gap`, singleton root-pool pressure, or fragmented/contaminated root-pool signals.
- The only sampled Fast inspect-only source candidate (`decision_timing ply0_7 black turn0_2 mons1 can_action=false can_mana=true`, plus a matching baseline-goal row) became unsafe after Pro cross-check because the same early-black raw shape had a center-spoke black baseline-save risk.
- 2026-05-18 first-divergence local-pressure postprocess over the active Fast outcome-corpus produced no source permission. The dashboard stayed `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `129.45ms`), and postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=193`, `source_permission=no_source`.
- Local-pressure axes are retained as source-time corpus evidence only: `first_move_candidate_target_pressure focus=empty_target target=supported;own=count1;opp=count0` repeated across two candidate-better states but also had one same-outcome joined state and fragmented across four policies, three branches, and six first-move pairs. The cleaner `first_move_preferred_target_pressure` and `first_move_pressure_delta candidate_less_pressured` buckets still fragmented by policy, branch, and first-move pair.
- 2026-05-18 portfolio-support outcome postprocess over the active Fast outcome-corpus produced no source permission. The dashboard stayed `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `141.21ms`), and postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=170`, `source_permission=no_source`.
- Portfolio-support axes are retained as future-only corpus evidence: `portfolio_candidate_supported true` and `portfolio_support_shape baseline=loss candidate=win candidate_winners=count3plus` repeated across two candidate-better states, while `portfolio_winner_count count3plus` and `portfolio_candidate_winner_count count3plus` mixed two candidate-better joined states with two same-outcome joined states. Candidate-bearing portfolio rows were `future_only_no_source`, fragmented by policy, branch, and first-move pair, and cannot become runtime source.
- 2026-05-18 source-board balance postprocess over the active Fast outcome-corpus produced no source permission. The dashboard stayed `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `131.43ms`), and postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=166`, `source_permission=no_source`.
- First-divergence source-board axes are retained as corpus evidence only: `source_board_actor own_to_move`, `source_board_margin even`, `source_board_margin_resource margin=even custody=even`, and `source_board_resource_balance custody=even material=even` repeated across two candidate-better states, but each was `fragmented_no_source` across four policies, four branches, seven first-move pairs, and one same-outcome joined state.
- 2026-05-18 terminal-swing outcome postprocess over the active Fast outcome-corpus produced no source permission. The dashboard stayed `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `129.66ms`), and postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=162`, `source_permission=no_source`.
- Terminal outcome axes are retained as future-only corpus evidence: `terminal_candidate_margin lead1` and `terminal_preferred_margin lead1` repeated across two candidate-better states, and `terminal_resource_swing custody=minus1 material=same` also repeated, but all terminal rows are `future_only_no_source` and remain fragmented by policy, branch, or first-move pair.
- 2026-05-18 first-divergence board-intent postprocess over the active Fast outcome-corpus produced no source permission. The dashboard stayed `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `129.46ms`), and postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=148`, `source_permission=no_source`.
- Board-aware intent axes are retained as corpus evidence only: repeated own-Spirit-to-empty intent buckets appeared across two candidate-better states, but the top buckets were fragmented by first-move pair or by candidate policy, branch, and pair; the near-edge empty-target intent also had same-outcome contamination.
- 2026-05-18 first-divergence move-shape postprocess over the active Fast outcome-corpus produced no source permission. The dashboard stayed `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `129.80ms`), and postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=131`, `source_permission=no_source`.
- Coarse move-shape axes are retained as corpus evidence only: repeated candidate shapes `loc2;mod0:none;z0;span1;flow=near_edge->mid` and `loc2;mod0:none;z0;span2;flow=edge->near_edge` each appeared across two candidate-better states, but both were `fragmented_no_source` by candidate policy, branch, and exact first-move pair.
- 2026-05-18 root-origin postprocess over the active Fast outcome-corpus produced no source permission. The dashboard stayed `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `129.91ms`), and postprocess ended `corpus_decision=postprocess_only`, `root_pool_decision=fragmented_repeated_root_pool_signal`, `guarded_delta_decision=fragmented_repeated_root_pool_guarded_delta`, `route_permission=postprocess_only`, `source_permission=no_source`.
- Root-origin provenance is retained as workbench evidence only: the root pool had `root_count=93`, `candidate_only_winning_policy_root_count=12`, `blocker_root_count=14`, `guarded_blocker_root_count=14`, and `same_state_blocker_root_count=3`, but root-origin exact and compound rollups had zero low-fragmentation repeated signals and remained fragmented or contaminated by blockers.
- 2026-05-18 active Fast outcome-corpus over the reset portfolio produced no source permission. The dashboard was `not_promising` for `frontier_pro_v2_guarded` (`7-5`, `win_rate=0.5833`, `confidence=0.6128`, `139.73ms`), and the postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_permission=no_source`.
- The only repeated class was active-Fast `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` with `candidate_only_games=6` over two states, but it fragmented across `3` policies, `3` branch transitions, and `6` first-move pairs. Workbench had `blocked_candidate_axis_count=105`, `source_candidate_axis_count=0`, and top blockers were `fragmented_no_source` or `singleton_non_regressing`.
- Recent sampled/active outcome-corpus and root-pool work produced no source permission: routes stayed `coverage_gap`, `baseline_save_risk`, `singleton_no_source`, `no_candidate_route`, or fragmented by policy, branch, first move, budget, or guarded baseline saves.
- Recent ProV4/root-policy scouts were not promotable. They preserved guarded fallbacks but failed sampled dashboards or tiny Fast smokes, usually rotating weaknesses across Pro, Normal, Fast, and active blockers rather than creating a stable floor.
- Existing corpus and root-pool feature families are retained as diagnostic fields only. Do not write runtime selectors from pre-diff entry timing axes, first-divergence local-pressure axes, portfolio-support axes, first-divergence source-board balance axes, terminal outcome axes, coarse first-divergence move-shape axes, board-aware first-divergence intent axes, current root-pool fields, guarded deltas, root-origin provenance, exact contexts, score terms, follow-up profiles, action profiles, carrier profiles, objective profiles, role/formation/mobility profiles, policy labels, branch labels, first moves, or singleton-heavy corpus rows.
- Detailed run notes live in `docs/automove-archive.md`; durable rules and grouped retired evidence live in `docs/automove-knowledge.md`.

## Reset Portfolio

Use this retained portfolio for policy-corpus and outcome-corpus reset work:

```text
frontier_pro_v2_guarded,
frontier_pro_v3_alternating_white_edge_mana,
frontier_pro_v3_white_opening_utility_mana,
shipping_pro_search_control,
frontier_pro_v2_raw,
frontier_pro_v2_no_selected_followup_projection,
frontier_pro_v3_full_scored_reply_guard,
frontier_pro_v2_no_low_budget_guard
```

These stale test-only sweep candidates are pruned from the active runner surface and must not be reopened as direct targets:

```text
frontier_pro_v2_no_late_black_fallback,
frontier_pro_v2_head_rerank,
frontier_pro_v2_no_spirit_family,
frontier_pro_v2_no_mid_tactical_guard,
frontier_pro_v2_expansion_224,
frontier_pro_v4_phase_gated_context
```

## Next Command Sequence

First validate local hygiene:

```sh
./scripts/check-automove-hygiene.sh
```

Then continue only after adding or exposing another new below-fragmented measured corpus/root feature that is not already in the retired evidence list. Do not rerun `pre_diff_entry`, `post_move_budget`, `post_move_reply_budget`, `post_move_value_reply_budget`, root class-vector, root-budget stability, or current root-pool slices as source work:

```sh
SMART_PRO_POLICY_MATRIX_PANEL_FILTER=<focused_panel> \
SMART_PRO_POLICY_MATRIX_DUEL_FILTER=<focused_duel> \
SMART_PRO_POLICY_MATRIX_SKIP_STATES=<opening_pair_offset_or_0> \
SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER=<new_feature_token> \
./scripts/run-automove-structural-scout.sh --outcome-corpus frontier_pro_v2_guarded
```

For a new test-only ProV4/root-policy candidate, register it as a sweep candidate with metadata first, then use:

```sh
./scripts/run-automove-structural-scout.sh --corpus <candidate>
```

Do not rerun archived root-pool slices or toggle scouts as source work. If continuing without a new candidate, first add or expose a genuinely new measured root feature that is not in the retired evidence list, then run the smallest outcome-corpus scout that emits that feature.

## Session End

1. Leave this file with one current state and one next command sequence.
2. Move durable lessons to `docs/automove-knowledge.md`.
3. Move probe diaries and failed wave detail to `docs/automove-archive.md`.
4. Run `./scripts/check-automove-hygiene.sh`.
5. Clean target logs/stamps separately with `./scripts/clean-experiment-artifacts.sh --dry-run` only when disposable evidence is no longer needed.
