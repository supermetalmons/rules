# Automove Archive

This file keeps only short summaries of retired automove waves.

Everything here is archive-only context. Use `HOW_TO_ITERATE_ON_AUTOMOVE.md` for the live workflow and `docs/automove-knowledge.md` for durable rules that still matter.

## 2026-06-25 Source-Start Option-Profile No-Source

- Retained change is diagnostic-only. `pro_policy_matrix_mechanism_axes_for_moves` now emits `axis=source_start_option_profile`, a source-time bucket for legal first start locations on the first-divergence board before either compared move is applied.
- The feature counts total legal starts, active-color mon starts, active-color regular-mana starts, and a coarse mon/mana mix flag. It does not use policy id, branch id, exact move strings, variant, or post-root rollout state.
- A focused one-state active Fast probe over the reset portfolio compiled the harness and emitted `axis=source_start_option_profile total=start5_8 mon=start5_8 mana=start0 mix=mon_only` in mechanism axes.
- The active Fast structural-scout slice (`20260625-022801`, dashboard `20260625-022605`) ran with `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER=source_start_option`, `panel=active_blockers`, and `duel=vs_shipping_fast`. It stayed no-source: dashboard `not_promising`, `promotion_decision=do_not_promote`, `source_decision=no_runtime_source`, `corpus_decision=postprocess_only`, `source_candidate_rollups=0`, and `clean_low_fragmentation_routes=0`.
- The source-start row matched all seven filtered corpus records, including six candidate-better records across two states, but it remained `fragmented_no_source`: four candidate policies, four branch transitions, seven first-move pairs, and one same-outcome record.
- Durable outcome: source-start option shape is useful for corpus visibility, but the active Fast repairs still do not separate below policy/branch/pair. Do not promote or write runtime selectors from source-start option-profile buckets.

## 2026-06-25 Post-Diff Initiative-Debt Timing No-Source

- Retained change is diagnostic-only. `pro_policy_matrix_timing_continuation_axes` now emits `axis=post_diff_initiative_debt`, a trace bucket for how many post-divergence candidate turns each side needs before it next has both action and mana.
- A focused one-state active Fast probe compiled the harness and emitted the new axis with `delta=candidate_faster` on the initial sampled record.
- The active Fast structural-scout slice (`20260625-021138`, dashboard `20260625-020916`) ran with `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER=post_diff_initiative_debt`, `panel=active_blockers`, and `duel=vs_shipping_fast`. It stayed no-source: dashboard `not_promising`, `promotion_decision=do_not_promote`, `source_decision=no_runtime_source`, `corpus_decision=postprocess_only`, `source_candidate_rollups=0`, and `clean_low_fragmentation_routes=0`.
- The `post_diff_initiative_debt` filter matched all seven corpus records, including six candidate-better records across two states. The route still fragmented across four candidate policies, four branch transitions, seven first-move pairs, and one same-outcome record.
- The top exact bucket, `axis=post_diff_initiative_debt baseline=ready_followup1 candidate=ready_followup3_plus delta=baseline_faster`, was repeated but not source: two candidate-better states, one same-outcome state, two candidate policies, two branch transitions, and three first-move pairs.
- Durable outcome: initiative-debt timing can describe post-divergence recovery shape, but it did not separate active Fast repairs from guarded saves or same-outcome rows. Do not promote or write runtime selectors from post-diff initiative-debt buckets.

## 2026-06-25 Save-Aware Utility Calibration ProV4 No-Go

- A temporary test-only `frontier_pro_v4_save_aware_utility_calibration` scout was built and pruned from the active sweep surface in the same session.
- The candidate preserved guarded fallback unless the guarded branch was `frontier_execute`, then scored top ProV2 roots with reply-risk/save-aware vetoes and a hand-calibrated utility delta over selected-override utility, root score, reply floor, rank, and progress signals.
- The structural scout dashboard killed it on the sampled panel: log `target/experiment-runs/frontier_pro_v4_save_aware_utility_calibration/20260625-015146_pro_promotion_dashboard_frontier_pro_v4_save_aware_utility_calibration.log` ended `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, min shipping win rate `0.4167`, confidence `0.0000`, max candidate average `240.31ms`, and two weak variant rows.
- The follow-on policy-corpus step was stopped after the dashboard kill, because the candidate had already failed the promotion gate.
- Durable outcome: hand-calibrated save-aware utility over existing root score/utility/reply fields is not a promotable Pro mode. Do not reopen this shape without corpus-trained weights or a new below-fragmented discriminator that is not just another shallow root-policy comparator.

## 2026-06-25 Decision-Effort Timing No-Source

- Retained change is diagnostic-only. `pro_policy_matrix_timing_continuation_axes` now emits `axis=decision_effort` and `axis=decision_effort_stage`, using per-candidate selector, exact-query, and turn-engine diagnostic deltas captured around the candidate decision.
- The focused active Fast structural-scout slice (`20260625-014317`, dashboard `20260625-014120`) ran with `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER=decision_effort`, `panel=active_blockers`, and `duel=vs_shipping_fast`. It stayed no-source: dashboard `not_promising`, `promotion_decision=do_not_promote`, `source_decision=no_runtime_source`, `corpus_decision=postprocess_only`, `source_candidate_rollups=0`, and `clean_low_fragmentation_routes=0`.
- The `decision_effort` filter matched 14 corpus records, including six candidate-better records across two states, but permission was `fragmented_no_source`: seven candidate policies, five branch transitions, eight first-move pairs, and eight same-outcome records.
- Detailed `axis=decision_effort ...` bucket rollups existed in workbench JSONL, but each candidate-bearing rollup was singleton non-regressing; the remaining rows were shared/no-candidate-signal.
- Durable outcome: decision-effort counters are useful corpus diagnostics, but they did not separate active Fast repairs from guarded saves or same-outcome rows. Do not promote or write runtime selectors from decision-effort timing buckets.

## 2026-06-25 Pre-Diff Entry Timing No-Source

- Retained change is diagnostic-only. `pro_policy_matrix_timing_continuation_axes` now emits `axis=pre_diff_entry`, a coarse trace bucket for whether baseline and candidate traces had hidden same-move branch/path disagreement before the first visible move divergence.
- The active Fast structural-scout slice (`20260625-012426`) ran with `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER=pre_diff_entry`, `panel=active_blockers`, `duel=vs_shipping_fast`, and one state. It stayed no-source: dashboard `not_promising`, `corpus_decision=singleton_no_source`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=134`, and `source_candidate_rollups=0`.
- In that active Fast slice, `axis=pre_diff_entry lead=same_turn hidden_same_move=true first_diff=present` had two candidate-better records in one state but was `fragmented_no_source` by candidate policy, branch, and first-move pair. `lead=none hidden_same_move=false first_diff=present` was only a singleton non-regressing route.
- The sampled Pro follow-up (`20260625-012712`) ran direct `pro-policy-outcome-corpus` with two sampled `vs_shipping_pro` states and the same record filter. It also stayed no-source: `corpus_decision=no_source`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=100`, and `source_candidate_rollups=0`.
- In sampled Pro, `axis=pre_diff_entry lead=same_turn hidden_same_move=true first_diff=present` repeated across two joined states but mixed one candidate-better state with two same-outcome states and remained fragmented by candidate policy, branch, and first-move pair. `lead=same_turn hidden_same_move=false first_diff=present` was also fragmented.
- Durable outcome: pre-diff entry timing supports the reset hypothesis that hidden policy entry can precede visible move divergence, but it did not separate wins from guarded saves. Do not promote or write runtime selectors from pre-diff timing buckets.

## 2026-06-25 Root Class-Vector And Root-Budget Stability No-Source

- Retained changes are diagnostic/postprocess only. Root-pool rows now emit move-class buckets (`class_vector`, `class_family`, `class_priority`) and root-level budget-stability buckets over Pro/Normal/Fast eval, reply floor, and combined value/reply shape. Workbench sample roots now show class, root-budget, and canonical `root_input_goal` values.
- The cross-budget class-vector corpus (`20260624-235530`) stayed no-source: `source_candidate_axis_count=0`, `blocked_candidate_axis_count=193`, `root_pool_decision=singleton_root_pool_signal`, `low_fragmentation_repeated_candidate_signal_count=0`, and class-vector field rollups were `contaminated_no_source`.
- A focused sampled Fast validation slice (`20260625-010417`) verified the new fields emitted into JSONL, but it had `corpus_decision=no_candidate_route` and no candidate-only root-pool roots, so it was validation-only.
- The focused sampled Pro candidate-bearing root-budget slice (`20260625-010722`) also stayed no-source: `corpus_decision=singleton_no_source`, `source_candidate_axis_count=0`, `root_pool_decision=contaminated_root_pool_signals`, `guarded_delta_decision=fragmented_repeated_root_pool_guarded_delta`, and `root_budget_stability` had `rollup_status=contaminated_no_source` with `candidate_state_count=2`, `blocker_root_count=85`, `guarded_blocker_root_count=70`, `same_state_blocker_root_count=38`, and zero low-fragmentation repeated signals.
- Durable outcome: do not promote or write selectors from root class-vector, root-budget stability, or their current compounds. They are retained only to make future corpus/root-pool work less blind.

## 2026-06-18 Budget/Reply Corpus And Move-Goal Workbench No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code is diagnostic/postprocess only: sampled policy-matrix skip offsets, cross-budget skip offsets, gated post-move budget/reply/value-reply axes, and workbench JSONL alignment for first-move goal axes.
- `SMART_PRO_POLICY_MATRIX_SKIP_STATES` and `SMART_PRO_POLICY_CROSS_BUDGET_SKIP_STATES` were added so later generated opening-side states can be inspected without widening the whole corpus. The sampled skip slices found center-spoke and split-flank guarded shared wins or baseline-save pressure; forward-bridge slices stayed baseline-save risk or singleton pressure.
- Gated `post_move_budget`, `post_move_reply_budget`, and `post_move_value_reply_budget` axes measured post-divergence value and reply-risk stability across Pro, Normal, and Fast budgets. Focused sampled Pro slices still had `source_candidate_axis_count=0` and `source_candidate_rollups=0`; repeated reply-threat rows mixed five candidate repairs with six baseline-save states, and the only all-budget value/reply lift was a singleton forward-bridge shipping-control repair.
- Workbench JSONL now emits the already-computed `first_move_goal` axes in `policy_axis` rows, matching `corpus_axis_summary`. Reprocessing the latest sampled Pro skip-6 log stayed no-source (`blocked_candidate_axis_count=58`), and aggregating the 2026-06-18 logs with corrected rows still had no source candidates; move-goal rows were singleton-heavy or baseline-save contaminated.
- Temporary direct candidates were pruned. Broad guarded budget/width tuning failed sampled Pro at `6-6`; the deeper guarded search variant reached sampled Pro `10-2`, then a black danger-window fallback moved Pro to `11-1` but failed sampled Normal `7-5`; post-move budget-lift and unified-root-pool scouts failed sampled dashboards or cost gates; the inner-wedge black shipping bridge and spirit-reply-lift scouts only reached `8-4`.
- Batch dashboarding the reset portfolio did not reveal a promotion base. `frontier_pro_v3_alternating_white_edge_mana` was best at sampled Pro `8-4` but still lost both inner-wedge games; the other reset candidates stayed at or below `7-5` except `frontier_pro_v3_full_scored_reply_guard`, which remained `1-11`.
- Durable outcome: keep the new skip controls and gated budget/reply axes as feature-discovery tools, and keep first-move goal rows visible in workbench output. Do not promote or write runtime selectors from current post-move budget/reply/value-reply, move-goal, root-pool, exact-pressure, policy, branch, first-move, or singleton-heavy rows.

## 2026-06-11 Targeted Arbitration ProV4 No-Go

- A test-only `frontier_pro_v4_targeted_arbitration` scout was built and pruned from the active sweep surface. It preserved the guarded Pro wrapper by default, then stitched in measured sampled-row repairs: an inner-wedge early-white raw repair, black/white shipping-save turn-shape gates, a forward-bridge Pro oracle root, and three sampled Normal oracle roots.
- The initial shipping/raw version reached only sampled Pro `9-3`; narrowing raw to inner-wedge and adding the alternating white shipping repair moved it to `10-2`. Replacing the forward-bridge white turn-5 shipping fallback with the oracle root `l10,0;l9,1` moved sampled Pro to `11-1`, with forward-bridge `4-0`.
- That Pro-fixed version failed sampled Normal at `9-3`. Decision records showed three singleton nonwins across corner-chain white turn 3, forward-bridge white turn 3, and outer-edge black turn 2, with max branch/context/pair counts of `1`. Forced-root oracle showed winners in each row, but they split across top-rank SpiritImpact, adjacent ManaTempo tie-breaks, and top-rank early black ManaTempo.
- A stitched version with those three Normal oracle roots fixed sampled Normal to `12-0`, while preserving sampled Pro `11-1`. It then failed sampled Fast hard: `5-7`, `win_rate=0.4167`, `confidence=0.0000`, candidate average `255.29ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`.
- Fast weaknesses were broad: `center_spoke_mana_rows` `0-2`, `corner_chain_mana_rows` `0-2`, and split rows in `offset_arc_mana_rows`, `inner_wedge_mana_rows`, and `forward_bridge_mana_rows`.
- Durable outcome: direct sampled-row stitching can force Pro and Normal dashboard passes, but it is not promotable and rotates failures into Fast. Do not promote or reopen targeted arbitration, sampled oracle first-move patches, or approved-vs-ordered root tie-break patches without a new below-fragmented measured root feature.

## 2026-06-11 Adaptive Reply-Progress ProV4 No-Go

- A test-only `frontier_pro_v4_adaptive_reply_progress` probe was built and pruned from the active sweep surface. It preserved the guarded wrapper and only considered overrides after `frontier_execute`.
- The probe compared the guarded selected root against scored roots using reply floor, spirit follow-up floor, safety, setup gain, root rank, score, and primary utility. It had two branches: safe mana-progress over unsafe or over-eager roots, and SpiritImpact over safe progress when setup evidence and reply floor competed.
- The sampled dashboard killed it immediately: Pro vs shipping Pro was `6-6`, `win_rate=0.5000`, `confidence=0.0000`, candidate average `229.66ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`.
- Branch counts showed the mechanism was too broad: `adaptive_reply_progress_safety` fired `148` times, while `adaptive_reply_progress_spirit` fired only `3` times. Weak sampled rows were `inner_wedge_mana_rows` `0-2`, plus split `center_spoke_mana_rows`, `alternating_mana_rows`, and `forward_bridge_mana_rows`.
- Durable outcome: the active-Fast exact-pressure conflict is not a simple safe-progress-vs-SpiritImpact balancing rule. Broad safety overrides swamp sampled Pro; any future attempt needs a new discriminator before this family is worth source work.

## 2026-06-11 Active Fast Outcome-Corpus No-Source Refresh

- The documented bounded active-blocker structural scout was rerun over `frontier_pro_v2_guarded` against `vs_shipping_fast`. The sampled dashboard remained weak: `7-5`, `win_rate=0.5833`, `confidence=0.6128`, candidate average `136.82ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`.
- Outcome postprocess over the bounded scout ended `corpus_decision=postprocess_only`, `source_decision=no_runtime_source`, `source_candidate_rollups=0`, and `source_blocker kind=fragmented_routes` with `clean_fragmented_routes=7` and `clean_low_fragmentation_routes=0`.
- The active Fast corpus was widened to eight reset policies with state and aggregate limits. It had oracle coverage (`total_games=6`, `candidate_any_wins=6`, `candidate_only_wins=4`, `baseline_wins=2`, `no_policy_wins=0`) but still ended `postprocess_only` with `source_candidate_rollups=0`, `blocked_candidate_rollups=8`, `clean_fragmented_routes=12`, and `clean_low_fragmentation_routes=0`.
- The previously tempting exact-pressure class repeated more strongly in the widened run (`class=candidate_only_win axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`), but the same class also carried baseline-better saves, so it is a baseline-save-risk route.
- The best clean rows were route/role labels such as selected/pre-accept/legacy transitions and no-selected-followup lower-considered progress. They stayed fragmented by candidate policy, branch, or first-move pair, so they remain diagnostics only.
- Durable outcome: active Fast still has reset-portfolio oracle coverage, but not source permission. The next serious attempt needs a new below-policy measured root feature; do not promote from exact-pressure, role, policy, branch, or first-move labels.

## 2026-06-11 Sampled Normal Outcome-Corpus No-Source

- A bounded sampled Normal outcome corpus over the reset portfolio also had oracle coverage but no source permission: `total_games=6`, `candidate_any_wins=6`, `candidate_only_wins=4`, `shared_wins=2`, `baseline_wins=2`, and `no_policy_wins=0`.
- The global stoplight repeated one mechanism class, `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons0 can_action=true can_mana=true opp_win=false`, with four candidate-only games. Postprocess still recommended more outcome corpus work rather than source because the best clean route covered only two states and fragmented across two candidate policies and two first-move pairs.
- Workbench source permission stayed `no_source`. Source status counts were dominated by `no_candidate_signal=251`, `fragmented_no_source=115`, `singleton_non_regressing=99`, `baseline_save_risk=38`, and `future_only_no_source=16`.
- The strongest baseline-save risk came from advisor/reply-guard rows, and active Fast already showed nearby exact-timing/exact-pressure baseline-save risk. This rules out a broad early-white fallback disable or exact-timing selector.
- Durable outcome: sampled Normal adds confirmation that reset portfolio candidates can find wins, but not a low-fragmentation runtime rule. Exact timing, early-white fallback labels, policy labels, and first-move pairs remain archive-only diagnostics.

## 2026-06-11 Root-Pool Snapshot And Cross-Budget Refresh

- Combining the fresh active Fast and sampled Normal outcome-corpus logs still produced no runtime source: `source_candidate_axis_count=0`, `source_candidate_rollups=0`, `workbench_source_permission=no_source`, and blockers were `singleton_non_regressing`, `baseline_save_risk`, `fragmented_no_source`, or `future_only_no_source`.
- A bounded active Fast run with `SMART_PRO_POLICY_MATRIX_INCLUDE_PROV4_ROOT_POOL=true` was stopped for cost after partial evidence. Postprocess still reported `root_pool_decision=fragmented_repeated_root_pool_signal`, `root_pool_source_permission=no_source`, `guarded_delta_decision=fragmented_repeated_root_pool_guarded_delta`, and `guarded_delta_source_permission=no_source`.
- Root-pool counts confirmed no low-fragmentation candidate signal: `low_fragmentation_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `candidate_only_winning_policy_root_count=12`, `blocker_root_count=14`, and `same_state_blocker_root_count=3`.
- The repeated root-pool rows were broad safe/lower-unlisted progress shapes such as `family_root_origin_profile=ManaTempo|guarded_scored+policy`, `path_legal_fanout_delta=lower_unlisted|...gain_2_plus`, and `path_step_threat_delta=lower_unlisted|...gain_2_plus`. This overlaps the failed adaptive safe-progress family, not a new sourceable mechanism.
- A sampled cross-budget check over the reset portfolio was also stopped for cost. Its only emitted record was a one-state `candidate_nonregressing_repair` for `frontier_pro_v3_full_scored_reply_guard` that repaired Fast while Pro still lost, so it did not justify source work.
- Direct structural-scout dashboard for `frontier_pro_v3_full_scored_reply_guard` killed that hint immediately: sampled Pro was `1-11`, `win_rate=0.0833`, `confidence=0.0000`, candidate average `178.25ms`, and stoplight `not_promising`.
- Durable outcome: current root-pool and cross-budget surfaces still do not produce a promotable candidate or source permission. Do not retry root-pool safe-progress/lower-unlisted fanout rows or full-scored reply guard as direct candidates without a genuinely new below-fragmented feature.

## 2026-06-11 Safe-Progress Root-Policy ProV4 No-Go

- A test-only `frontier_pro_v4_safe_progress_root_policy` scout was built and pruned from the active sweep surface. It preserved guarded by default, then layered the retained alternating white edge-mana move, a white opening spirit-root override, a black rank-0 mana override, and finally a direct black `forward_bridge_mana_rows` weak-window shipping fallback.
- The conservative version improved sampled Pro but failed the first gate at `10-2` (`win_rate=0.8333`, `confidence=0.9807`) with `forward_bridge_mana_rows` still split `2-2`.
- Loosening the forward-bridge weak-window fallback fired once and moved sampled Pro to a strict pass: `11-1`, `win_rate=0.9167`, `confidence=0.9968`, candidate average `196.24ms`. The remaining Pro weak row was still `forward_bridge_mana_rows` at `3-1`.
- The same sampled dashboard then failed against `shipping_normal`: `8-4`, `win_rate=0.6667`, `confidence=0.8062`, candidate average `252.73ms`. Weak rows were `inner_wedge_mana_rows`, `outer_edge_mana_rows`, `forward_bridge_mana_rows`, and `corner_chain_mana_rows`.
- Normal decision records stayed fragmented: four regressions across different variants, colors, turns, branches, and first-move pairs. The only repeated axis with more than two games was the broad exact-pressure bucket `window=0 deny=0 attack=false drainer_safety=safe`, which is already retired as source material.
- Durable outcome: direct root-policy stitching can force a sampled Pro pass, but it is not a promotable Pro mode. Do not promote or reopen this candidate as a variant-scoped weak-window/early-opening selector; a future attempt needs a lower-fragmentation measured root feature before runtime source changes.

## 2026-05-31 Phase-Gated Context Composite No-Go

- A test-only `frontier_pro_v4_phase_gated_context` probe was built and then pruned from the active sweep surface. It combined existing reset policies behind variant/side/phase gates and a small number of exact FEN gates to test whether the reset portfolio could cover sampled and active dashboard rows at all.
- The probe eventually reached dashboard scout shape: structural scout log `target/experiment-runs/frontier_pro_v4_phase_gated_context/20260531-181454_pro_promotion_dashboard_frontier_pro_v4_phase_gated_context.log` ended `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=promotable_shape classification=promotable_scout panels=2 max_candidate_avg_ms=211.16` and `AUTOMOVE_STRUCTURAL_SCOUT_DECISION promotion_decision=confirm_before_promotion`.
- The unfiltered dashboard evidence before confirm was strong but not source permission: sampled shipping duels passed strict gates (`vs_shipping_pro 11-1`, `vs_shipping_normal 11-1`, `vs_shipping_fast 12-0`) and active blockers passed directional gates (`6-0` in Pro, Normal, and Fast), with max dashboard average around `205-213ms`.
- Confirmation failed all-variant breadth. Confirm log `target/experiment-runs/frontier_pro_v4_phase_gated_context/20260531-183319_pro_profile_sweep_frontier_pro_v4_phase_gated_context.log` had `duel_passes=false` for all budgets: Pro `15-9` (`win_rate=0.6250`), Normal `13-11` (`0.5417`), and Fast `19-5` (`0.7917`).
- The all-variant failures were broad, not a single residual row: Pro missed swapped, offset, center-spoke, alternating, inner-wedge, outer-wedge, and bent-center; Normal missed offset, center-spoke, alternating, inner-wedge, outer-wedge, bent-center, outer-edge, split-flank, and corner-chain; Fast missed Classic, swapped, center-spoke, outer-wedge, and bent-center.
- Durable outcome: a static phase/variant/exact-FEN selector can synthesize a dashboard `promotable_scout` from the reset portfolio, but it does not produce a promotable Pro mode. Dashboard shape alone is insufficient; all-variant confirm must pass, and exact-FEN/policy-label composites remain diagnostic-only no-source evidence.

## 2026-05-31 Root-Input-Goal And Sampled/Active Corpus No-Source

- Retained postprocess-only tooling now emits first-divergence move-goal axes and a root-pool `root_input_goal` field with `family`/`progress`/`path` compounds. These fields describe move intent by target emptiness, home-row progress, center progress, row band, and lane bucket.
- Active Fast root-pool structural scout over `frontier_pro_v2_guarded` stayed no-source: dashboard was `not_promising`, outcome postprocess ended `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `root_pool_decision=fragmented_repeated_root_pool_signal`, `guarded_delta_decision=fragmented_repeated_root_pool_guarded_delta`, and `workbench_source_permission=no_source`.
- Root-input-goal did not repair the root-pool blocker. The only clean repeated root-input vector was `path=lower_unlisted` with `empty_target|away_home1|closer_center1`, and it was the same active Fast no-selected-followup shape that failed sampled dashboards.
- Full sampled Pro outcome corpus over the reset portfolio produced oracle coverage but no source: `total_games=12`, `candidate_any_wins=12`, `candidate_only_wins=5`, `baseline_wins=7`, `no_policy_wins=0`, `corpus_decision=no_source`, `root_pool_decision=singleton_root_pool_signal`, and `guarded_delta_decision=fragmented_repeated_root_pool_guarded_delta`.
- Widened active Fast corpus also stayed no-source: `total_games=6`, `candidate_only_wins=4`, `baseline_wins=2`, `corpus_decision=no_source`, `route_permission=missing_recommendation`, `source_candidate_rollups=0`, and candidate-bearing axes were blocked by baseline-save risk, fragmentation, singleton pressure, or future-only evidence.
- Sampled Fast corpus briefly produced two inspect-only rollups (`axis=decision_timing ply_bucket=ply0_7 color=black turn_bucket=turn0_2 mons_moves=mons1 can_action=false can_mana=true` and one matching baseline-goal row), but cross-checking Pro showed a center-spoke black baseline-save risk for the same raw early-black shape. It is not runtime source.
- Failed temporary candidates `frontier_pro_v4_lower_safe_mana_tempo` and `frontier_pro_v4_guarded_lower_safe_mana_tempo` were pruned. The former sampled Pro result was `7-5` with weak confidence and the guarded version collapsed to `1-11`.
- Durable outcome: keep move-goal/root-input-goal fields as diagnostics, not source. The reset portfolio has enough oracle coverage to build exact composites, but no repeated low-fragmentation mechanism currently separates wins from guarded saves across sampled, active, and all-variant evidence.

## Drainer-Pressure ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- Two guarded-wrapper variants were tried. `frontier_pro_v4_conditional_drainer_attack` made forced drainer-attack filtering apply only when tied or behind. `frontier_pro_v4_drainer_attack_minimax` kept forced drainer pressure but searched within forced attack roots instead of accepting the tactical prepass attack immediately.
- Both variants cleared the one-game sampled Fast smoke on `split_flank_mana_rows` at `2-0`; conditional attack averaged `202.77ms`, and minimax attack averaged `315.04ms`.
- Both sampled dashboards fast-failed on the first Pro duel with the same shape: sampled Pro `7-5`, win rate `0.5833`, confidence `0.6128`, inner-wedge `0-2`, alternating split `1-1`, and forward-bridge split `2-2`. Candidate averages stayed below the ceiling at `140.77ms` and `142.09ms`.
- Durable outcome: score-aware forced drainer attack and drainer-attack minimax selection are not promotable guarded ProV2 modes in this shape. They preserve cost but do not repair the sampled Pro floor, so future drainer-pressure work needs corpus evidence below attack forcing before source changes.

## Depth-Consensus ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the normal guarded root-selection snapshot, and only overrode `frontier_execute` roots when a strategic root stayed close at full depth and became materially stronger in a cheap shallower-depth check.
- A one-game sampled Fast smoke compiled, fired `depth_consensus` once, won `2-0` on `split_flank_mana_rows`, and averaged `242.36ms` per candidate move.
- The sampled dashboard killed it on the first completed duel before Normal/Fast or active spend: sampled Pro `6-6`, win rate `0.5000`, confidence `0.0000`, candidate average `168.25ms`. Weak rows included `inner_wedge_mana_rows` `0-2`, `forward_bridge_mana_rows` `1-3`, and `alternating_mana_rows` split `1-1`; the candidate fired `13` depth-consensus overrides across the Pro duel.
- Durable outcome: shallow-vs-full root depth stability is not a sufficient ProV4 discriminator in this shape. It is affordable enough to test, but it does not preserve the sampled Pro floor and should not be reopened without corpus evidence that depth-instability separates candidate wins from guarded saves.

## PVS Search-Ordering ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved the guarded wrapper and enabled `enable_pvs`, `enable_killer_move_ordering`, `enable_history_heuristic`, and `enable_tt_depth_preferred_replacement` inside the guarded ProV2 runtime to test whether search traversal/order quality, rather than root policy, was suppressing broad Pro strength or cost.
- A one-game sampled Fast smoke compiled and split `1-1` on `split_flank_mana_rows`, averaging `192.18ms` per candidate move.
- The sampled-only dashboard killed it before Fast or active-panel spend: sampled Pro `6-6`, win rate `0.5000`, confidence `0.0000`, candidate average `136.27ms`; sampled Normal `9-3`, win rate `0.7500`, confidence `0.9270`, candidate average `166.73ms`. Weak rows included Pro `inner_wedge_mana_rows` `0-2`, Pro `center_spoke_mana_rows` / `alternating_mana_rows` split `1-1`, Pro `forward_bridge_mana_rows` split `2-2`, Normal `forward_bridge_mana_rows` `0-2`, and Normal `outer_edge_mana_rows` split `1-1`.
- Durable outcome: PVS plus killer/history/TT ordering is not a promotable guarded ProV2 mode in this shape. It did not create a strength floor and rotated Pro into a flat sampled result despite staying below the move-time ceiling.

## Child-Ordering Shortlist ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved the guarded wrapper and enabled `enable_child_eval_bundle`, `enable_two_stage_child_ordering`, `child_ordering_shortlist_multiplier=1`, and `child_ordering_tactical_reserve=1` inside the guarded ProV2 runtime to test whether deeper child ordering quality/cost, rather than root policy, was suppressing broad Pro strength.
- A one-game sampled Fast smoke compiled and split `1-1` on `split_flank_mana_rows`, averaging `159.25ms` per candidate move.
- The sampled-only dashboard killed it before Fast or active-panel spend: sampled Pro `8-4`, win rate `0.6667`, confidence `0.8062`, candidate average `106.52ms`; sampled Normal `8-4`, win rate `0.6667`, confidence `0.8062`, candidate average `168.69ms`. Weak rows included Pro `center_spoke_mana_rows`, `alternating_mana_rows`, and `inner_wedge_mana_rows` split `1-1`, plus Normal `alternating_mana_rows` `0-2`, `forward_bridge_mana_rows` split `1-1`, and `corner_chain_mana_rows` split `1-1`.
- Durable outcome: child eval bundles plus two-stage child ordering are not a promotable guarded ProV2 mode in this shape. The Pro bucket got cheaper but still failed strength gates, and Normal rotated into a hard alternating regression.

## Targeted Exact-Narrowing ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved the guarded wrapper and enabled `enable_targeted_exact_turn_summary_memo` plus `enable_targeted_score_window_narrowing` inside the guarded ProV2 runtime to test whether targeted exact plausibility reduced unsafe same-turn score-window candidates without policy routing.
- A one-game sampled Fast smoke compiled and won `2-0` on `split_flank_mana_rows`, averaging `204.77ms` per candidate move; the tiny sample still had insufficient confidence by design.
- The sampled-only dashboard killed it before Fast or active-panel spend: sampled Pro `7-5`, win rate `0.5833`, confidence `0.6128`, candidate average `141.28ms`; sampled Normal `7-5`, win rate `0.5833`, confidence `0.6128`, candidate average `173.17ms`. Weak rows included Pro `inner_wedge_mana_rows` `0-2`, Pro `alternating_mana_rows` split `1-1`, Pro `forward_bridge_mana_rows` split `2-2`, Normal `forward_bridge_mana_rows` `0-2`, and Normal `alternating_mana_rows` / `inner_wedge_mana_rows` / `corner_chain_mana_rows` split `1-1`.
- Durable outcome: targeted exact-turn memo plus score-window narrowing is not a promotable guarded ProV2 config mode. It worsened sampled Pro/Normal relative to the retained shape and should not be reopened without corpus evidence that the narrowed score-window candidates separate wins from guarded saves.

## Root-Breadth Rebalance ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved the guarded wrapper, widened root focus from `3` to `4`, shifted root focus share down to `6_500`, raised turn-engine seed/per-family/opponent/reply breadth to `16 / 5 / 7 / 4`, and raised expansion cap to `184`.
- A one-game sampled Fast smoke compiled and won `2-0` on `split_flank_mana_rows`, averaging `151.84ms` per candidate move; the tiny sample still had insufficient confidence by design.
- The sampled-only dashboard killed it before Fast or active-panel spend: sampled Pro `9-3`, win rate `0.7500`, confidence `0.9270`, candidate average `146.04ms`; sampled Normal `8-4`, win rate `0.6667`, confidence `0.8062`, candidate average `183.57ms`. Weak rows included Pro `inner_wedge_mana_rows` split `1-1`, Pro `forward_bridge_mana_rows` split `2-2`, Normal `forward_bridge_mana_rows` `0-2`, and Normal `alternating_mana_rows` / `inner_wedge_mana_rows` split `1-1`.
- Durable outcome: widening guarded ProV2 root/followup breadth is not a promotable ProV4 mode in this shape. It rotates sampled weaknesses instead of clearing Pro/Normal floors, so root-focus and seed-cap breadth should not be reopened as direct config tuning without a new corpus-discovered root feature.

## Bounded Followup/Reply ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved the guarded wrapper and kept selected-followup projection enabled, but narrowed reply-risk margin, shortlist, reply limit, node share, opponent seed cap, reply seed cap, and expansion cap to test whether Pro was overpaying for unstable follow-up detail.
- A one-game sampled Fast smoke compiled and split `1-1` on `split_flank_mana_rows`, averaging `224.74ms` per candidate move.
- The sampled-only promotion dashboard killed it without active-panel or corpus spend: Pro `7-5`, Normal `7-5`, Fast `4-8`, max candidate average `234.13ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`.
- Durable outcome: narrowing selected-followup/reply breadth is not a promotable cost/strength tradeoff. It did not improve Pro or Normal enough and sharply regressed sampled Fast.

## Policy-Root-Pool ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the guarded root-selection snapshot only inside `frontier_execute`, then pooled live outputs from raw, selected-followup-disabled, full-scored reply-guard, and shipping-control policies. Candidate roots were ranked by source agreement, `TurnEngineUtility`, bounded reply floor, progress value, score, and rank.
- The one-game sampled Fast smoke compiled and fired the candidate `11` times in `96` candidate turns, but lost `0-2` on `split_flank_mana_rows` and averaged `597.78ms` per candidate move.
- The line was killed before sampled-dashboard spend because it was both weaker than the recent root comparators and close to the Pro move-time ceiling on a tiny smoke.
- Durable outcome: live policy-output root pooling is not a practical ProV4 mode in this shape. It reintroduces policy-output overfit and high selector cost without evidence that it separates candidate wins from guarded saves.

## Reply-Floor Progress ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the root-selection snapshot only inside `frontier_execute`, and compared top scored roots with a bounded worst-reply floor plus concrete progress/setup value. The first cut was inert on the smoke slice; the loosened cut admitted quiet safe reply-floor roots.
- A one-game sampled Fast smoke compiled and fired the candidate `2` times in `96` candidate turns, splitting `1-1` and averaging `203.64ms` per candidate move.
- The sampled-only promotion dashboard killed it without active-panel or corpus spend: Pro `7-5`, Normal `9-3`, Fast `6-6`, max candidate average `189.53ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`. The probe fired `21 / 21 / 21` times across Pro/Normal/Fast and still split inner-wedge, alternating, center-spoke, corner-chain, offset-arc, split-flank, and forward-bridge rows.
- Durable outcome: bounded reply-floor plus progress/setup reranking over existing root fields is another non-promotable ProV4 selector. It improved Normal relative to some recent probes but regressed Fast to flat and did not separate wins from guarded saves.

## Objective-Latency ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the root-selection snapshot only inside `frontier_execute`, and compared top scored roots by a cheap concrete-objective timing score covering scoring, pickup, drainer pressure, safe progress, and spirit setup, with safety and `TurnEngineUtility` guards.
- A one-game sampled Fast smoke compiled and fired the candidate `6` times in `88` candidate turns, splitting `1-1` and averaging `191.85ms` per candidate move.
- The sampled-only promotion dashboard killed it without active-panel or corpus spend: Pro `6-6`, Normal `8-4`, Fast `8-4`, max candidate average `196.21ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`. The probe fired `12 / 25 / 20` times across Pro/Normal/Fast and still split inner-wedge, center-spoke, alternating, forward-bridge, split-flank, and corner-chain rows.
- Durable outcome: objective latency over existing root fields is another timing/root-ordering selector, not a promotable ProV4 mode. It does not separate candidate wins from guarded saves and should not be retried without a corpus-discovered timing discriminator.

## Scoring-Context Robustness ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the root-selection snapshot only inside `frontier_execute`, and compared top scored roots across exact-on/off plus local/no-local static scoring contexts, with a safety filter and `TurnEngineUtility` guard.
- A one-game sampled Fast smoke compiled and fired the candidate `8` times in `96` candidate turns, splitting `1-1` and averaging `235.99ms` per candidate move.
- The sampled-only promotion dashboard killed it without active-panel or corpus spend: Pro `6-6`, Normal `8-4`, Fast `8-4`, max candidate average `198.50ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`. The probe fired `82 / 71 / 68` times across Pro/Normal/Fast and still split center-spoke, inner-wedge, forward-bridge, split-flank, and corner-chain rows.
- Durable outcome: exact/local scoring-context robustness is another static root-ordering signal, not a promotable ProV4 mode. It adds cost without separating candidate wins from guarded saves.

## Move-Efficiency Delta ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the root-selection snapshot only inside `frontier_execute`, and compared top scored roots by cached move-efficiency delta versus the guarded root, with a safety filter and `TurnEngineUtility` guard.
- A one-game sampled Fast smoke compiled and fired the candidate `3` times in `96` candidate turns, winning `2-0` but averaging `201.01ms` per candidate move.
- The sampled-only promotion dashboard killed it without active-panel or corpus spend: Pro `7-5`, Normal `10-2`, Fast `6-6`, max candidate average `189.17ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`. The probe fired `16 / 24 / 21` times across Pro/Normal/Fast and still split inner-wedge, forward-bridge, center-spoke, and corner-chain rows.
- Durable outcome: selector-time move-efficiency delta is another root-ordering feature, not a promotable ProV4 mode. It does not separate candidate wins from guarded saves and is weaker than guarded on sampled Fast.

## Two-Turn Resilience ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the root-selection snapshot only inside `frontier_execute`, and compared top scored roots with a bounded self-opponent-self continuation probe using a very cheap depth-1 config.
- A one-game sampled Fast smoke compiled and fired the candidate `4` times in `96` candidate turns, winning `2-0` but already averaging `216.68ms` per candidate move.
- The sampled-only promotion dashboard killed it without active-panel or corpus spend: Pro `8-4`, Normal `8-4`, Fast `7-5`, max candidate average `211.65ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`. The probe fired `31 / 25 / 47` times across Pro/Normal/Fast and rotated weak rows across alternating, inner-wedge, split-flank, forward-bridge, center-spoke, and corner-chain slices.
- Durable outcome: bounded two-turn online resilience is not the missing ProV4 feature. It is slower than guarded, weaker than the prior same-turn continuation line on sampled Normal/Fast, and overlaps the retired continuation/reply-spectrum family without producing promotion shape.

## Turn-Completion Stability ProV4 Probe

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate preserved guarded fallbacks, captured the root-selection snapshot only inside `frontier_execute`, and used a cheap same-turn continuation rollout to compare root completion stability against the guarded root.
- The first structural scout killed it before active-panel spend. `frontier_pro_v4_turn_completion_stability` failed the sampled Pro dashboard at `7-5` versus `shipping_pro_search`, `win_rate=0.5833`, `confidence=0.6128`, candidate average `149.61ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`. The follow-on policy corpus had global baseline wins `5`, policy wins `7`, no-policy wins `0`, but the candidate never appeared as a winning policy.
- A looser cut increased sampled-dashboard overrides and improved lower-budget rows, but still did not become promotable: Pro `8-4`, Normal `10-2`, Fast `11-1`, max candidate average `220.67ms`, and stoplight `not_promising`. Weak rows kept rotating across alternating, inner-wedge, split-flank, and corner-chain slices.
- Durable outcome: cheap same-turn continuation completion is useful diagnostic evidence, but not a promotable ProV4 root selector by itself. It overlaps the old followup/reply-floor lines, stays sampled-only, and does not produce a repeated policy-corpus mechanism.

## Cross-Budget Static-Eval ProV4 Consensus

- Temporary test-only candidate source was cut and removed in the same session.
- The candidate ranked the ProV2 scored root pool with a new Fast/Normal/Pro static-eval consensus feature, safety guards, and guarded utility checks. The first smoke version was too loose because it overrode `early_white_fallback` and `late_black_shipping_fallback`, losing the tiny sampled Fast slice `0-2`; the tightened version preserved non-`frontier_execute` guarded fallbacks and matched guarded on that tiny attribution slice.
- The structural scout still killed it before active-panel spend. `frontier_pro_v4_cross_budget_consensus` fast-failed the sampled dashboard at Pro `6-6` versus `shipping_pro_search`, `win_rate=0.5000`, `confidence=0.0000`, max candidate average `187.31ms`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`.
- The follow-on policy corpus did not expose the candidate as source evidence. With the candidate added to the reset portfolio, the corpus had global baseline wins `5`, policy wins `7`, no-policy wins `0`, but winner policies remained old fragmented routes and `frontier_pro_v4_cross_budget_consensus` never appeared as a winning policy.
- Durable outcome: cross-budget static eval over root states is another shallow selector signal, not a promotable ProV4 root feature. Do not retry it without a new measured utility component below existing static scoring, guarded fallback preservation, root rank, and `TurnEngineUtility`.

## Iterative-Deepening Recheck And Advisor Reply-Floor Policy

- Temporary test-only candidate source was cut and removed in the same session.
- Recreating the sampled-pass guarded iterative-deepening row composite reconfirmed the old active-blocker failure: Pro `3-3`, Normal `3-3`, Fast `5-1`. Active Normal still had `outer_edge_mana_rows` at `0-2`, while active Pro split `outer_edge_mana_rows`, `alternating_mana_rows`, and `forward_bridge_mana_rows`.
- Narrow outer-edge shipping fallbacks did not rescue it. The white-opening shipping branch was mostly inert, and the combined white-opening plus black weak-window shipping branch only moved the active dashboard to Pro `3-3`, Normal `4-2`, Fast `5-1`.
- Active decision records for the repaired row composite stayed singleton-heavy: remaining Pro misses split across an `outer_edge` flat, an `alternating` flat, and a `forward_bridge` early-white fallback regression.
- A test-only snapshot-based advisor reply-floor policy then preserved guarded selection, captured the already-computed root-selection snapshot, and reranked only advisor/top roots by primary utility, progress/setup value, and reply floor. It failed the sampled dashboard before active spend: Pro `5-7`, Normal `9-3`, Fast `8-4`, with override counts `104 / 127 / 162` and max average move time `190.26ms`.
- Durable outcome: the root-selection snapshot is cheap enough for sampled-dashboard scouts, but advisor/top-root reply-floor plus progress reranking is still too broad. Do not retry this as another hand-tuned comparator; it needs a corpus-trained feature or a repeated mechanism below the current root fields.

## Policy-Winner Mechanism-Class and Legacy-Preaccept Head Veto

- This wave kept a harness improvement and removed the test-only runtime scout before ending.
- `pro-policy-corpus` / `smart_automove_pro_policy_winner_probe` now emits `PRO_POLICY_WINNER_MECHANISM_CLASS` when mechanism tracing is enabled. These are coarse axes over stage/head state, baseline-vs-winner role, family, advisor status, rank, safety/progress, and winner-root shape, printed next to exact `PRO_POLICY_WINNER_MECHANISM` records.
- The first sampled Pro mechanism-class corpus over the full reset portfolio still had exact singleton mechanisms: baseline wins `7`, policy wins `5`, no-policy wins `0`, `max_mechanism_games=1`, `max_mechanism_class_games=2`. The only repeated class was a broad safe-step-progress shape, which is not enough for runtime code.
- The active Fast corpus also stayed exact-singleton with oracle coverage: baseline wins `2`, policy wins `4`, no-policy wins `0`, `max_mechanism_games=1`, `max_mechanism_class_games=2`. Its repeated class was selected accepted-head baseline roots losing to pre-accept/legacy winner roots.
- A temporary test-only `frontier_pro_v4_legacy_preaccept_head_veto` candidate vetoed an accepted head only when the guarded selected move was exactly the head and the pre-accept root matched the legacy or legacy-full-pool selection. It fired `26` times in sampled Pro and failed the quick dashboard at `8-4` (`0.6667`, confidence `0.8062`, avg `195.76ms`), with weak rows in `center_spoke_mana_rows`, `alternating_mana_rows`, `inner_wedge_mana_rows`, and `forward_bridge_mana_rows`.
- Durable outcome: coarse mechanism classes are useful routing evidence, but a repeated selected-head/pre-accept class is still not a promotable head-veto feature by itself. Future head work needs a new discriminator below pre-accept/legacy status and must pass sampled plus active panels before runtime source is retained.

## Shallow ProV4 Unified Root-Value Comparator

- Temporary test-only candidate source was cut and removed in the same session.
- The structural scout reconfirmed retained guarded as non-promotable: sampled Pro/Normal/Fast `7-5 / 7-5 / 6-6`, active blockers `3-3 / 5-1 / 2-4`, and `PRO_PROMOTION_DASHBOARD_STOPLIGHT` `not_promising`.
- The policy corpus again had oracle coverage without selector evidence: every sampled and active Pro/Normal/Fast duel had `no_policy_wins=0`, `max_policy_games=1`, `max_mechanism_games=1`, and `PRO_POLICY_WINNER_STOPLIGHT` `singleton_residue`.
- A test-only shallow ProV4 comparator ranked scored roots by existing tactical value, `TurnEngineUtility`, safety, progress, family priority, score, and root rank while preserving guarded as the incumbent. The loose version improved sampled Pro to `9-3`, fixed `inner_wedge_mana_rows` and `forward_bridge_mana_rows`, but rotated losses into `center_spoke_mana_rows`, `alternating_mana_rows`, and `split_flank_mana_rows`.
- A score-drop-tightened version reduced overrides from `139` to `116` and fixed `split_flank_mana_rows`, but still failed sampled Pro at `9-3`; `center_spoke_mana_rows` fell to `0-2`, `alternating_mana_rows` stayed split, and the sampled Pro nonwin probe emitted `singleton_regression_pressure` with max branch/context/pair counts of `1`.
- Durable outcome: do not retry a single shallow root-value tuple over existing root fields. The next ProV4 attempt needs a new corpus-trained feature, preserved/omitted/root-timing evidence, or a harness change that finds repeated mechanisms below the current singleton records.

## Policy-Rollout and Dormant-Toggle Quick Kill

- Temporary test-only candidates were cut and removed in the same session.
- The online policy-rollout scout preserved guarded fallbacks, gathered guarded, shipping-control, raw, no-selected-followup, and full-scored reply-guard outputs on early `frontier_execute` turns, and tried short continuation rollouts before switching. It was killed on cost: the broad version did not complete sampled Pro-only validation after several minutes, and the tightened two-ply Pro/Fast version remained too slow for a practical quick gate.
- Two wrapper-preserving dormant toggle checks were also killed on sampled Pro-only promotion dashboard. Enabling `enable_turn_engine_mid_turn_progress_guard` reproduced `7-5`, `inner_wedge_mana_rows` `0-2`, candidate average `141.61ms`; enabling `enable_turn_engine_late_black_setup_progress_rescue` reproduced `7-5`, `inner_wedge_mana_rows` `0-2`, candidate average `142.20ms`.
- Durable outcome: do not use online rollout over the current policy portfolio without a cheaper precomputed feature, and do not reopen mid-turn progress guard or late-black setup-progress rescue as direct Pro challengers.

## Forced-Root FEN and Policy-Portfolio Selector Refresh

- This diagnostic wave fixed a harness bug and kept the fix: `SMART_PRO_FORCED_ROOT_ORACLE_FEN` now uses a raw env string helper so case-sensitive FEN payloads are not lowercased.
- The fix invalidated the earlier sampled Fast `corner_chain_mana_rows` white zero-root no-go. With case preserved, the forced-root oracle found `16` scored roots and `13` winning first roots; `frontier_pro_v3_white_opening_utility_mana` was kept as a test-only policy component that selects `l10,5;l9,4` over the shipped losing `l10,3;l9,4` on that board.
- The expanded policy portfolio reached oracle coverage on the checked sampled and active panels, but a context selector over those labels was discarded. Its best dashboard shape was sampled `11-1 / 11-1 / 11-1` and active Pro/Normal/Fast `6-0 / 6-0 / 5-1`, so active Fast remained below directional promotion shape.
- A wider `outer_edge_mana_rows` delta check killed the selector line rather than just the single dashboard miss: the same white turn-three `window=0/deny=0/drainer_safety=2` context was a Pro improvement in one opening and a Fast regression in another, and the wider Pro slice exposed a separate black regression.
- Durable outcome: keep the FEN raw-env harness fix and the narrow white-opening policy component for future matrices, but do not retain the `frontier_pro_v3_context_policy_portfolio` selector or replace it with guarded-selected-move/FEN gates.

## Iterative-Deepening Row-Composite Wave

- Temporary test-only sweep candidates were cut and removed in the same session. The wave tested guarded ProV2 with iterative deepening, alpha-window variants, node compensation, lazy-oracle projection, and row composites across the promotion dashboard.
- Plain iterative deepening was directionally useful but not broad enough: sampled Pro passed at `11-1`, while sampled Normal failed at `9-3`. Offset-1 plus `1.25x` nodes inverted that shape, passing sampled Normal at `11-1` while failing sampled Pro at `8-4`.
- Search-order tuning did not solve sampled Fast by itself. The best standalone Fast tuning was iterative deepening with alpha margin `320` and `1.25x` nodes, which reached `10-2` but still split `offset_arc_mana_rows` and `corner_chain_mana_rows`; other node and offset variants stayed at `7-5` to `9-3`.
- The best sampled-only row composite used guarded iterative deepening by default, raw ProV2 only for `offset_arc_mana_rows`, alpha-window iterative deepening plus `1.25x` nodes only for `inner_wedge_mana_rows`, and offset-1 plus `1.25x` nodes for `outer_edge_mana_rows`, `forward_bridge_mana_rows`, and `corner_chain_mana_rows`. It passed the sampled dashboard in all three duels: Pro `11-1`, Normal `11-1`, Fast `11-1`; max average move time was `183.71ms`.
- The active-blocker dashboard killed the composite before promotion: Pro `3-3`, Normal `3-3`, Fast `5-1`. Active Normal `outer_edge_mana_rows` fell to `0-2`, active Pro split `outer_edge_mana_rows`, `alternating_mana_rows`, and `forward_bridge_mana_rows`, and active Fast still split `outer_edge_mana_rows`.
- Follow-up active checks on older profiles exposed the underlying conflict. Raw ProV2 fixes active Normal `outer_edge_mana_rows` at `2-0`, but loses active Pro and Fast `outer_edge_mana_rows` at `0-2`; no-late-black fallback also loses active Pro/Fast `outer_edge_mana_rows` while improving Normal.
- Durable outcome: do not promote sampled-only row composites or variant-only raw fallbacks. A viable next candidate needs a below-variant `outer_edge_mana_rows` feature that distinguishes the active Normal contexts from the active Pro/Fast contexts without relying on opponent mode.

## ProV3 Utility Selector/Switch Wave

- A temporary test-only ProV3 utility wave was cut and removed in the same session. It tried selecting roots by `TurnEngineUtility` order and switching away from retained guarded only when a utility candidate was not worse on primary axes.
- Pure utility root selection failed the active blocker panel. Candidate-set utility scored Pro `3-3`, Normal `3-3`, Fast `4-2`; full-pool utility scored Pro `3-3`, Normal `4-2`, Fast `4-2`.
- Full-pool utility switches were not promotable. The dominant-primary switch failed Pro at `1-5`; the nonstrict switch reached Pro `5-1`, but Normal and Fast only reached `4-2`.
- Candidate-set nonstrict utility switching was the best shape on active blockers: Pro `5-1`, Normal `5-1`, Fast `5-1`. Attribution versus retained guarded showed candidate saves in several black/full-turn and mana-only contexts, one Pro candidate regression on an early white quiet turn, and shared Normal/Fast misses that guarding back to retained would not solve.
- Follow-up tuning did not rescue it. Score tolerance `64` fell to Pro `3-3`; score tolerance `128` fell to Pro `4-2`; utility eval tolerance `64` fell to Pro `3-3`; an early-white quiet-turn guard fell to Pro `4-2` and introduced an `alternating_mana_rows` split.
- Canonical sampled Pro killed the line before Normal/Fast spend: `5-7`, with `alternating_mana_rows` `0-2`, `inner_wedge_mana_rows` `0-2`, and `forward_bridge_mana_rows` `3-1`.
- Durable outcome: do not retry shallow root-level utility ordering or guarded utility switching as the next ProV3 spend. A viable ProV3 candidate needs new utility features or a dashboard-driven mechanism that is strong on both sampled variants and active blockers.

## Decision-Record Aggregation Wave

- A diagnostic-only decision-record aggregator was added and kept. It replays Pro, Normal, and Fast shipping duels and classifies each first divergence by runtime branch, selector stage, pre-accept/head family, head acceptance, approved advisor root, exact context, and baseline-root status.
- Delta-scope records showed that many promotion misses are not frontier-worse-than-shipping deltas. On the active blockers, Pro had `0` regressions / `2` improvements / `4` flat, Normal had `1` / `2` / `3`, and Fast had `2` / `2` / `2`; canonical sampled Pro had no regressions.
- Nonwin-scope records exposed why a simple shipping-root selector is unsafe. Active nonwins split across alternating black recovery-vs-mana flat loss, forward-bridge white SpiritImpact-vs-ManaTempo regression, outer-edge white SpiritImpact-vs-DrainerSafetyRecovery regression, and forward-bridge white safe-progress-vs-spirit regression. Canonical sampled nonwins added outer-edge black same-family ManaTempo flat loss plus the archived forward-bridge white accepted-head spirit regression.
- A temporary test-only live-root shipping meta-selector was cut and removed in the same session. Routing to shipping when the shipping root was candidate-live at rank `0` failed the active Pro panel at `1-5`; broader top-2 and advisor-live variants also failed at `2-4`, with `outer_edge_mana_rows` and `forward_bridge_mana_rows` both `0-2`.
- Durable outcome: do not use candidate-live, top-ranked, or advisor-live shipping status as the next meta-selector by itself. The status is useful evidence for records, but the mechanisms are still split; the next runtime spend needs a true ProV3 utility change or another aggregate that collapses the split below advisor/head/final-selection status.

## Attribution-Informed Context Gate Wave

- A test-only context-gated sweep candidate was cut and killed in this wave, then removed before ending the session.
- The wave first refreshed canonical sampled guarded-vs-raw attribution. Guarded still had sampled Pro saves and regressions under the same coarse fallback branches: Pro raw-better `2`, guarded-better `4`, same `6`; Normal raw-better `3`, guarded-better `0`, same `9`; Fast raw-better `4`, guarded-better `0`, same `8`.
- The active-blocker attribution and direct profile refresh confirmed there was no hidden raw challenger on the current harness. On `outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows`, retained guarded scored Pro `3-3`, Normal `5-1`, Fast `2-4`, while raw scored Pro `2-4`, Normal `6-0`, Fast `4-2`.
- The broader exact-context gate switched to raw on observed raw-better white opening and black unsafe-context surfaces. It failed structural scout: canonical sampled Pro `9-3`, Normal `8-4`, Fast `6-6`; active blockers Pro `3-3`, Normal `5-1`, Fast `3-3`.
- The narrowed gate removed the riskiest white forward-bridge and inner-wedge opening switches. It also failed structural scout: canonical sampled Pro `8-4`, Normal `8-4`, Fast `6-6`; active blockers Pro `3-3`, Normal `5-1`, Fast `3-3`.
- Durable outcome: do not retry context gates built only from variant/color/turn/resource/exact-opportunity fields. The next useful spend needs a decision record below the context label, including candidate-live/shortlist-live status, advisor reason, head acceptance, final selector stage, and baseline-root position.

## Profile-Level ProV2 Ablation Wave

- Runtime challengers were cut and killed in this wave; each was reverted before ending the session.
- Enabling `enable_turn_head_rerank` inside `frontier_pro_v2_guarded` passed guardrails, variant-smoke, triage, and runtime-preflight, then failed sampled `pro-reliability`: Pro `1.0000`, Normal `0.8333`, Fast `0.7500`. It added Normal `outer_wedge_mana_rows` and Fast `corner_chain_mana_rows` blockers.
- Disabling `turn_engine_enable_spirit_family` passed early gates, then failed sampled `pro-reliability`: Pro `0.6667`, Normal `0.8333`, Fast `0.7500`. It broadened Pro losses across `outer_edge_mana_rows`, `outer_wedge_mana_rows`, and `corner_chain_mana_rows`.
- Disabling `enable_turn_engine_mid_turn_tactical_guard` passed early gates, then failed sampled `pro-reliability` at the baseline-shaped Pro `1.0000`, Normal `0.9167`, Fast `0.8333`; it cleaned sampled Fast `corner_chain_mana_rows` but left Normal `outer_edge_mana_rows` and Fast `alternating_mana_rows` / `forward_bridge_mana_rows`.
- Raising only `turn_engine_expansion_cap` from `176` to `224` passed early gates, then failed sampled `pro-reliability` at Pro `1.0000`, Normal `0.9167`, Fast `0.8333`; the extra capacity was strength-inert on the live blockers.
- Disabling `enable_turn_engine_low_budget_guard` passed early gates, then failed sampled `pro-reliability`: Pro `0.7500`, Normal `0.9167`, Fast `0.8333`. It improved sampled Fast `forward_bridge_mana_rows` but broadened Pro losses across `outer_wedge_mana_rows`, `outer_edge_mana_rows`, and `corner_chain_mana_rows`, and Fast `alternating_mana_rows` fell to `0.0000`.
- Durable outcome: do not reopen broad ProV2 profile toggles without a new trace tying the toggle to the live blocker mechanism. The sampled blockers did not respond as one guard/capacity problem, and guard removals can broaden variant losses while staying under the time budget.

## Reply-Risk Recovery Scope Wave

- A runtime challenger was cut and killed in this wave.
- The candidate restricted `pro_v2_root_advisor_black_turn_four_weak_window_recovery_override` so it could only promote `DrainerSafetyRecovery` roots that were already present in the reply-risk shortlist.
- Focused retained Fast controls still passed: `frontier_pro_v2_guarded_profile_prefers_shipping_black_recovery_duel_fast_root` and `frontier_pro_v2_guarded_profile_prefers_shipping_black_branch_duel_sampled_fast_root`.
- The local signal moved but did not promote. The full isolated `alternating_mana_rows` Fast trace improved from the archived `7` nonwins to `6`, and the repeated `l2,7;l1,6` vs `l2,7;l1,8` pair disappeared, but mixed singleton residue remained.
- Canonical sampled `pro-reliability` then failed: Pro `1.0000` / confidence `0.9998` / `143.32ms`, Normal `0.8333` / `0.9807` / `186.18ms`, Fast `0.8333` / `0.9807` / `165.40ms`.
- The failure rotated Normal down to `center_spoke_mana_rows` and `outer_edge_mana_rows` at `0.5000` each, while Fast still had `alternating_mana_rows` and `forward_bridge_mana_rows` at `0.5000` each.
- Durable outcome: do not keep or retry reply-risk-shortlist scoping for the black turn-four weak-window recovery override by itself. It can remove one repeated `alternating` seam, but it is not a promotable multi-variant strength mechanism.

## Root Advisor Trace Refresh Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave ran `smart_automove_pro_root_advisor_trace_probe` against retained footholds and duel-trace boards near the current sampled blocker families.
- The trace did not expose one shared advisor-layer failure. Blocker-adjacent boards split across `ApprovedReplyRiskGuard`, `ApprovedFamilyCompetition`, omitted-root reentry, preserved representatives, and rejected injected macro roots.
- Several cases also showed injected macro roots being admitted on unrelated retained controls while nearby blocker boards rejected injection or selected through preserved/reentry paths, so a broad metadata or injection change would be another speculative churn source.
- Durable outcome: do not spend on a shared advisor-label, preserved-representative, omitted-root reentry, or injected-root admission patch from this trace. The remaining sampled blockers still require a narrower mechanism than "advisor trace differs from shipping."

## Canonical Sampled Gate Refresh Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave ran the canonical `runtime-preflight` stage for `frontier_pro_v2_guarded`; both stage-1 CPU advisory and exact-lite diagnostics passed, and the runtime-preflight stamp was written.
- The follow-up canonical sampled `pro-reliability` gate still failed promotion. Pro passed at `1.0000` with confidence `0.9998` and `143.82ms` frontier average move time, but Normal stayed at `0.9167` with confidence `0.9968`, and Fast stayed at `0.8333` with confidence `0.9807`; both failed the `0.90` win-rate / `0.99` confidence requirement.
- The variant failures matched the targeted refreshes rather than revealing a new mechanism: Normal `outer_edge_mana_rows` was `0.5000`, Fast `alternating_mana_rows` was `0.5000`, and Fast `forward_bridge_mana_rows` was `0.5000`; sampled `classic`, `corner_chain_mana_rows`, `offset_arc_mana_rows`, `outer_wedge_mana_rows`, `split_flank_mana_rows`, `swapped_mana_rows`, and `center_spoke_mana_rows` were clean in this gate sample.
- Durable outcome: public Pro remains on `frontier_pro_v2_guarded`, but there is no promotable automove candidate from this wave. The next spend still needs a focused mechanism below the mixed `outer_edge` Normal plus `alternating`/`forward_bridge` Fast residue.

## Fast Blocker Refresh Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave reran `SMART_AUTOMOVE_VARIANTS=alternating_mana_rows,forward_bridge_mana_rows` on `smart_automove_pro_reliability_nonwin_trace_probe` with `duel_filter=vs_shipping_fast`, `repeats=4`, and `games=3`.
- The refreshed Fast replay logged `9` nonwins. It did not improve on the archived shape: the only repeated pair was still the white `forward_bridge` accepted-head miss `l9,6;l7,4;l7,3` vs shipping `l9,6;l7,6;l7,7` (`2x`).
- Every other Fast miss stayed singleton, including archived copied-board classes: black `l0,10;l0,9` vs `l4,0;l5,0;mb`, white `l9,6;l8,7` vs `l9,6;l7,7;l8,8`, black `l0,6;l1,6` vs `l2,3;l3,4`, black `l2,5;l0,5;l1,6` vs `l2,5;l4,7;l3,8`, white `l8,5;l10,5;l9,4` vs `l8,5;l6,3;l7,2`, black `l2,7;l1,6` vs `l2,7;l1,8`, and black `l2,4;l1,5` vs `l2,4;l1,3`.
- Durable outcome: do not reopen the isolated Fast head-accept or alternating mana-sibling patches from this refresh. The trace is still mixed and mostly replays already-killed copied-board or retained-extension no-go surfaces.

## Outer-Edge Normal Refresh Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave reran `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows` on `smart_automove_pro_reliability_nonwin_trace_probe` with `duel_filter=vs_shipping_normal`, `repeats=6`, and `games=3`.
- The refreshed replay again logged `10` Normal nonwins. The distribution still matched the archived mixed bucket instead of collapsing to one local patch target.
- The only repeated move pair was still black `l2,7;l3,8` vs shipping `l1,5;l0,3;l1,3` (`3x`). The rest remained singleton drift across late black same-family mana, early white post-search mana, early black copied-board recovery, and white `search_only_forced_prepass`.
- The head-accept source review did not reveal a clean general rule worth cutting: blocking the repeated black miss would require another special-case head guard, while the sampled blocker set still includes unrelated pre-accept and forced-prepass surfaces.
- Durable outcome: do not reopen `outer_edge_mana_rows` from the refreshed Normal trace alone. It is still mixed residue with one repeated accepted-head pair, not a promotable Pro automove hypothesis.

## Alternating Singleton Copied Board Replay Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave reran `SMART_AUTOMOVE_VARIANTS=alternating_mana_rows` on `smart_automove_pro_reliability_nonwin_trace_probe` with `duel_filter=vs_shipping_fast`, `repeats=4`, and `games=3`.
- The replay again logged `7` Fast nonwins and recovered the two previously unverified singleton pairs: white `l8,5;l10,5;l9,4` vs shipping `l8,5;l6,3;l7,2`, and black `l2,4;l1,5` vs shipping `l2,4;l1,3`.
- The follow-up direct replay killed both as stable local targets. The white copied board collapsed to shared engine-disabled `l8,5;l6,3;l7,3` for both profiles, which was neither traced side. The black copied board collapsed to shared `search_only_forced_prepass` `l2,4;l1,5`.
- Durable outcome: do not spend runtime code or retained coverage on those copied `alternating` singleton boards until they reproduce cleanly. They are trace artifacts, not stable local seams.

## Black Forward-Bridge Followup Spirit Repro Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave continued the Fast `forward_bridge_mana_rows` replay after the copied post-search board failed clean reproduction.
- The current replay recovered a black spirit/setup copied seam where frontier drifted to `l0,3;l1,3` while shipping stayed on `l1,5;l3,4;l3,3`.
- The follow-up direct structure probe compared that copied board against the nearby retained black followup-spirit control.
- The copied board did not replay the traced drift. On a clean direct probe, both frontier and shipping collapsed to shared engine-disabled `l0,3;l1,3`, with no head or advisor residue left as a stable target.
- Durable outcome: do not extend retained black followup-spirit controls from that copied board. Shared spirit/setup geometry is not enough when the copied board does not reproduce the shipping-selected root.

## Black Forward-Bridge Post-Search Repro Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave first widened `SMART_AUTOMOVE_VARIANTS=forward_bridge_mana_rows` on `smart_automove_pro_reliability_nonwin_trace_probe` with `duel_filter=vs_shipping_fast`, `repeats=4`, and `games=3`.
- That replay still logged `10` Fast nonwins and recovered a black copied seam where frontier drifted to `l0,6;l1,6` while shipping stayed on `l2,3;l3,4`.
- The follow-up direct structure probe compared that copied board against the nearby retained `BLACK_POST_SEARCH_DUEL_PRO` control.
- The copied board did not replay the traced seam. On a clean direct probe, both frontier and shipping collapsed to shared engine-disabled `l2,3;l3,4`, with no head or advisor residue left to compare against the retained post-search control.
- Durable outcome: do not extend `BLACK_POST_SEARCH_DUEL_PRO` or any other retained black post-search control from that copied board. Shared frontier move shape was a false lead; the copied board is another nonreproducible local artifact.

## Black Alternating Retained Recovery Search-Only Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave recovered the singleton Fast `alternating_mana_rows` seam `l1,6;l1,7` vs shipping `l1,6;l0,5` and compared it directly against the nearby retained `BLACK_RECOVERY_DUEL_FAST` control.
- The coarse lane looked close: both boards touch the same black recovery move `l1,6;l0,5`, and both are black weak-window Fast surfaces.
- The selector/advisor path still diverged. On the live seam, frontier keeps approved `ManaTempo l1,6;l1,7` through `ApprovedReplyRiskGuard`, shipping only wins through `search_only_engine_allowed_head`, and there is no accepted recovery head.
- Retained `BLACK_RECOVERY_DUEL_FAST` is different: it approves `DrainerSafetyRecovery l1,6;l0,5`, accepts that head, and then both frontier and shipping collapse to engine-disabled mana `l4,1;l5,0;mb`.
- Durable outcome: do not extend `BLACK_RECOVERY_DUEL_FAST` into the singleton `alternating` search-only seam. Shared recovery geometry was a false lead; the approved family, shipping win path, and final runtime stage are different.

## Black Alternating Retained Fast Spirit Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave compared the repeated Fast `alternating_mana_rows` seam `l2,7;l1,6` vs shipping `l2,7;l1,8` directly against the last nearby retained black Fast spirit controls: `BLACK_FAST_FLAT_NONWIN` and `BLACK_SPIRIT_BRIDGE_DUEL_FAST`.
- `BLACK_FAST_FLAT_NONWIN` did not match. It is `window=0/deny=0`, pure `SpiritImpact`, and frontier already matches shipping through `ApprovedReplyRiskGuard`.
- `BLACK_SPIRIT_BRIDGE_DUEL_FAST` also did not match. It accepts a `SpiritImpact` head through `ApprovedLegacySelector` and still collapses to engine-disabled mana `l4,9;l5,10;mb`.
- The live repeated seam is different. It is a turn-four black `window=1/deny=1` board where frontier approves outside-shortlist `DrainerSafetyRecovery l2,7;l1,6` through `ApprovedFamilyCompetition`, shipping stays on `ManaTempo l2,7;l1,8`, and the shortlist contains only the two `ManaTempo` siblings beneath rejected head `l2,7;l2,8`.
- Durable outcome: do not extend the nearby retained black Fast spirit package into the repeated `alternating` seam. Shared Fast/black proximity was a false lead; the family, approval path, shortlist shape, and final runtime stage still diverge.

## White Forward-Bridge Retained Fast-Ply10 Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave compared the singleton Fast `forward_bridge_mana_rows` fallback seam `l9,7;l8,6` vs shipping `l9,7;l7,6;l7,7` directly against the nearby retained `WHITE_FAST_PLY10` control, which already ships the same spirit root.
- The coarse surface looked close: both boards are white turn-three `window=1/deny=1` positions, shipping selects `SpiritImpact l9,7;l7,6;l7,7`, and frontier considers the same rejected head `l8,5;l7,6`.
- The approval layer still diverged. On the live seam, frontier approves `SafeSupermanaProgress l9,7;l8,6` through `ApprovedReplyRiskGuard` and keeps the spirit root only shortlist-live, with a preserved safe-progress representative.
- On retained `WHITE_FAST_PLY10`, frontier keeps shipping `SpiritImpact l9,7;l7,6;l7,7` through `ApprovedFamilyCompetition` and preserves the safe-progress root only as a representative.
- Durable outcome: do not extend `WHITE_FAST_PLY10` into the singleton `forward_bridge` fallback seam. Shared shipping root and rejected head were not enough; the live board is a different safe-progress-vs-spirit approval surface.

## White Forward-Bridge Retained Spirit Head Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave reran the narrow Fast nonwin trace on `SMART_AUTOMOVE_VARIANTS=forward_bridge_mana_rows` only far enough to recover the exact repeated white head-accept board.
- On that live board, frontier keeps shipped `SpiritImpact l9,6;l7,6;l7,7` as pre-accept, then accepts same-family head `l9,6;l7,4;l7,3` out of `engine_post_search`; shipping stays on `l9,6;l7,6;l7,7`.
- The follow-up structure probe compared that live board against the nearby retained white head/spirit controls `WHITE_HEAD_FLAT_NONWIN` and `WHITE_TURN_FIVE_SPIRIT_SETUP_PRE_ACCEPT_FAST`.
- `WHITE_HEAD_FLAT_NONWIN` still did not match. It is also a spirit accepted-head surface, but it runs on `window=1/deny=1`, the advisor path is `ApprovedReplyRiskGuard`, and shipping already matches the accepted head.
- `WHITE_TURN_FIVE_SPIRIT_SETUP_PRE_ACCEPT_FAST` also did not match. It is another `window=1/deny=1` spirit setup surface, but frontier keeps shipping and rejects a `ManaTempo` head instead of accepting a same-family spirit head.
- Durable outcome: do not extend the nearby retained white head/spirit package into the repeated Fast `forward_bridge` seam. Shared white spirit setup shape was a false lead; the live board is a different accepted-head mechanism.

## Outer-Edge Widened Normal Replay Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave widened `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows` on `smart_automove_pro_reliability_nonwin_trace_probe` with `duel_filter=vs_shipping_normal`, `repeats=6`, and `games=3`.
- That replay logged `10` Normal nonwins, so `outer_edge` is no longer just the old late-black plus early-white pair.
- The only repeated pair was black `l2,7;l3,8` vs shipping `l1,5;l0,3;l1,3` (`3x`). The other nonwins stayed singleton, including late black `l1,6;l1,5` vs `l2,6;l3,7`, early white `l10,4;l9,5` vs `l9,4;l8,3`, white `l7,4;l6,4` vs `l9,4;l8,3`, black `l1,4;l2,5` vs `l1,4;l1,6;l2,7`, black `l1,4;l2,4` vs `l0,5;l1,6`, and white `l9,3;l8,3` vs `l7,2;l6,1`.
- The follow-up structure probe compared that repeated black seam directly against the nearby retained `BLACK_HEAD_DUEL_SAMPLED_NORMAL` control, which already ships `l1,5;l0,3;l1,3`.
- The retained control still did not match. It is also `window=0/deny=0`, but it keeps the shipped `SpiritImpact` root and rejects head `l0,5;l1,6`; its advisor approves the shipped root through `ApprovedFamilyCompetition`.
- The live repeated seam is different. It already has the shipped `SpiritImpact l1,5;l0,3;l1,3` approved through `ApprovedReplyRiskGuard`, then later accepts head `ManaTempo l2,7;l3,8` out of `engine_post_search`.
- Durable outcome: do not reopen `outer_edge_mana_rows` as a late-black-only spend, and do not extend `BLACK_HEAD_DUEL_SAMPLED_NORMAL` into the new repeated black seam. The widened Normal replay is still mixed, and the only repeated black seam has a different head-accept mechanism from the retained control.

## Black Alternating Retained Fast-Recovery Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave compared the repeated Fast `alternating` seam directly against the retained `BLACK_RECOVERY_DUEL_FAST` control.
- The overlap was only at frontier pre-accept/head family. On the retained control, frontier pre-accept and head both land on `DrainerSafetyRecovery l1,6;l0,5`, but final selected and shipping both collapse to engine-disabled mana `l4,1;l5,0;mb`.
- The retained control is therefore a different surface: `window=0/deny=0`, singleton shortlist, and accepted head into an engine-disabled mana finish.
- The repeated `alternating` seam is different. It is a turn-four black `window=1/deny=1` board where frontier approves `DrainerSafetyRecovery l2,7;l1,6` through `ApprovedFamilyCompetition`, shipping stays on `ManaTempo l2,7;l1,8`, and the shortlist contains only the two `ManaTempo` siblings beneath rejected head `l2,7;l2,8`.
- Durable outcome: do not extend `BLACK_RECOVERY_DUEL_FAST` into the repeated `alternating` seam. Shared `DrainerSafetyRecovery` at pre-accept was a false lead; the runtime stage, final selected root, shortlist shape, and exact-opportunity context are different.

## Black Alternating Retained Branch Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave first reran `smart_automove_pro_reliability_nonwin_trace_probe` on `SMART_AUTOMOVE_VARIANTS=alternating_mana_rows` with `duel_filter=vs_shipping_fast` to recover the exact repeated black board on the current corpus.
- The repeated seam still reproduced cleanly: on the recovered turn-four board, frontier played `l2,7;l1,6` while shipping stayed on `l2,7;l1,8`.
- The follow-up structure probe compared that board against the nearby retained black fast/pro controls: `BLACK_BRANCH_DUEL_SAMPLED_FAST`, `BLACK_SIBLING_DUEL_SAMPLED_PRO`, and `BLACK_FOLLOWUP_DUEL_SAMPLED_NORMAL`.
- None of them matched. The live repeated seam is a `window=1/deny=1` board where frontier approves `DrainerSafetyRecovery l2,7;l1,6` through `ApprovedFamilyCompetition`, shipping stays on `ManaTempo l2,7;l1,8`, and the reply-risk shortlist contains only the two `ManaTempo` siblings beneath a rejected head `l2,7;l2,8`.
- `BLACK_BRANCH_DUEL_SAMPLED_FAST` is different: it is a wide-shortlist `SpiritImpact` own-setup board approved through `ApprovedLegacySelector`.
- `BLACK_SIBLING_DUEL_SAMPLED_PRO` is different again: it is `SpiritImpact` through `ApprovedFamilyCompetition` with one preserved `ManaTempo` representative.
- `BLACK_FOLLOWUP_DUEL_SAMPLED_NORMAL` is also different: it is a `window=0/deny=0` `ManaTempo` family-competition board that still keeps shipping.
- Durable outcome: do not extend the retained black branch/followup package into the repeated `alternating` seam. Shared black-early labels were not enough; the family, context, shortlist density, and approval path still diverge.

## Black Outer-Edge Retained Late Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave first reran `smart_automove_pro_reliability_nonwin_trace_probe` on `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows` with `duel_filter=vs_shipping_normal` to recover the exact late black board on the current corpus.
- The clean late seam still reproduced: on the recovered turn-eight board, frontier played `l1,6;l1,5` while shipping stayed on `l2,6;l3,7`.
- The follow-up structure probe compared that board against the retained sampled black late package: `BLACK_LATE_MANA_DUEL_SAMPLED_NORMAL`, `BLACK_LATE_HEAD_ACCEPT_DUEL_SAMPLED_NORMAL`, and `BLACK_HEAD_ACCEPT_SEARCH_ONLY_DUEL_SAMPLED_NORMAL`.
- The closest retained control still did not match. `BLACK_LATE_MANA_DUEL_SAMPLED_NORMAL` is also late black `ManaTempo` on `window=1/deny=1`, but it keeps shipping `l0,7;l1,6` through `ApprovedFamilyCompetition` on a smaller shortlist that mixes `SafeOpponentManaProgress`; frontier does not drift off shipping there.
- The other retained controls are further away: `BLACK_LATE_HEAD_ACCEPT_DUEL_SAMPLED_NORMAL` is a `SafeSupermanaProgress` preserved-root board, and `BLACK_HEAD_ACCEPT_SEARCH_ONLY_DUEL_SAMPLED_NORMAL` is a `DrainerSafetyRecovery` search-order board.
- The live `outer_edge` seam is different. Shipping `l2,6;l3,7` stays inside a dense reply-risk shortlist with several spirit siblings, frontier still approves lower-ranked `l1,6;l1,5` through `ApprovedReplyRiskGuard`, and the head is rejected.
- Durable outcome: do not extend the retained sampled black late package into the clean late `outer_edge` seam. Shared “late black” labeling was not enough; the approval path, shortlist shape, and family mix still diverge.

## White Forward-Bridge Retained Sampled Head-Accept Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave compared the repeated white `forward_bridge` seam directly against the retained sampled white head-accept controls in Pro, Normal, and Fast.
- The retained sampled controls did not collapse to one reusable package.
- The retained Pro control is a pure `ManaTempo` `ApprovedReplyRiskGuard` board on `window=0/deny=0`; frontier and shipping both stay on `l9,6;l8,5`, and the head is rejected.
- The retained Normal control is closer but still different: it is `SpiritImpact` on `window=1/deny=1`, shipping `l9,5;l7,4;l8,3` is advisor-approved through `ApprovedFamilyCompetition`, and frontier still keeps shipping while rejecting a lower-ranked spirit head.
- The retained Fast control is different again: it is `SpiritImpact` through `ApprovedReplyRiskGuard` with a singleton shortlist, one preserved sibling representative, and a rejected vulnerable `ManaTempo` head.
- The repeated `forward_bridge` seam is none of those. It is a `window=0/deny=0` `SpiritImpact` own-setup board where shipping `l9,6;l7,6;l7,7` is advisor-approved through `ApprovedFamilyCompetition`, the shortlist stays full of spirit own-setup siblings, and frontier only loses later by accepting head `l9,6;l7,4;l7,3`.
- Durable outcome: do not extend the retained sampled white head-accept package into the repeated `forward_bridge` seam. Matching “head-accept” labels were not enough; the family mix, context, shortlist density, and approval path still diverge.

## White Forward-Bridge Head Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave first reran `smart_automove_pro_reliability_nonwin_trace_probe` on `SMART_AUTOMOVE_VARIANTS=forward_bridge_mana_rows` with `duel_filter=vs_shipping_fast`, `repeats=4`, and `games=3` to recover the live board on the current corpus.
- The repeated white seam still reproduced cleanly: `l9,6;l7,4;l7,3` vs shipping `l9,6;l7,6;l7,7` appeared `3x` inside `10` Fast nonwins.
- The follow-up structure probe then compared that board against the retained white turn-five head-reject controls.
- The retained controls did not match. They are `window=1/deny=1` pure `ManaTempo` boards approved through `ApprovedReplyRiskGuard`, and frontier keeps shipping while rejecting a weaker head.
- The repeated `forward_bridge` seam is different. It is a `window=0/deny=0` `SpiritImpact` board where shipping `l9,6;l7,6;l7,7` is advisor-approved through `ApprovedFamilyCompetition`, the shortlist stays full of spirit own-setup siblings, and frontier only loses later by accepting head `l9,6;l7,4;l7,3`.
- Durable outcome: do not extend the retained white turn-five head-reject package into the repeated `forward_bridge` seam. Matching head labels were a false lead; the family, context, advisor path, and shortlist shape are different.

## White Forward-Bridge Search-Order Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave tested the last plausible white reuse path by comparing the `forward_bridge` safe-progress seam directly against the retained early-white engine-disabled/search-only controls.
- The retained boards did not match. `white_early_engine_disabled_normal` still approved `ManaTempo l8,5;l7,6` through `ApprovedReplyRiskGuard`, while shipping `SpiritImpact l9,5;l8,3;l7,4` stayed candidate-live but outside shortlist alongside many other spirit roots. `white_negative_deny_search_only_selected_rank_normal` was different again: it approved `ManaTempo l9,4;l8,3` through `ApprovedReplyRiskGuard` and had no spirit candidates live at all.
- The `forward_bridge` seam is different from both. It approves `SafeSupermanaProgress l9,6;l8,7`, while shipping `SpiritImpact l9,6;l7,7;l8,8` stays candidate-live and shortlist-live with other spirit siblings.
- Durable outcome: do not extend the retained white engine-disabled/search-only package into `forward_bridge`. Matching stage labels were a false lead; the approved family and spirit-candidate shape are different.

## White Safe-Progress Retained Extension Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave tested the only plausible retained white reuse path left on the `forward_bridge` safe-progress seam by comparing it directly against the retained Pro board that already ships `l9,6;l8,7`.
- The overlap was only the final move. The retained `WHITE_POST_SEARCH_DUEL_PRO` board is a quiet `ManaTempo` approval on `window=0/deny=0`; frontier and shipping both select `l9,6;l8,7`, and there are no shortlist-live `SpiritImpact` roots at all.
- The `forward_bridge` seam is different. It is a `window=1/deny=1` board where frontier approves `SafeSupermanaProgress l9,6;l8,7`, while shipping `SpiritImpact l9,6;l7,7;l8,8` stays candidate-live and shortlist-live with several spirit siblings.
- Durable outcome: do not extend the retained white `l9,6;l8,7` post-search control into the `forward_bridge` seam. Matching final moves were a false lead; the family mix and shortlist shape are different.

## White-Black Safe-Progress Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave tested the only plausible cross-color follow-up left after the black safe-progress split: whether the white `forward_bridge` safe-progress seam `l9,6;l8,7` vs shipping `l9,6;l7,7;l8,8` and the Pro black setup-lane seam `l1,6;l2,7` vs shipping `l1,5;l2,3;l1,2` were really the same `SafeSupermanaProgress`-over-`SpiritImpact` mechanism.
- They matched only at the approved family. On both boards, frontier still approved `SafeSupermanaProgress` through `ApprovedReplyRiskGuard`.
- Under that, they split again. On the white seam, shipping `SpiritImpact l9,6;l7,7;l8,8` stayed candidate-live and shortlist-live, and several other spirit siblings stayed live with it. On the Pro black seam, the entire `SpiritImpact` family was filtered out before shortlist, and shipping `l1,5;l2,3;l1,2` survived only as a preserved outside-candidate representative.
- Durable outcome: do not reopen a shared cross-color safe-progress-vs-spirit runtime spend across these two seams. Shared `ApprovedReplyRiskGuard` approval was a false lead; the candidate-set failure modes are different.

## Black Safe-Progress Setup Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave tested the only plausible shared black follow-up left after the Pro black recurrence split: whether the old black progress residue `l7,1;l9,3` vs shipping `l1,5;l2,7;l1,8` and the newer Pro black setup-lane seam `l1,6;l2,7` vs shipping `l1,5;l2,3;l1,2` were really the same `SafeSupermanaProgress`-over-`SpiritImpact` mechanism.
- They matched only at the approved family. On both boards, frontier still approved `SafeSupermanaProgress` through `ApprovedReplyRiskGuard`.
- Under that, they split again. On `black_progress_vs_setup_residue`, the shipping root `l1,5;l2,7;l1,8` was still inside the candidate set but outside the shortlist, and a stronger full-pool own-setup `SpiritImpact l1,5;l3,7;l2,8` was also candidate-live above it. On the Pro setup-lane seam, shipped `SpiritImpact l1,5;l2,3;l1,2` was already a preserved rank-2 representative outside the candidate set, and the whole `SpiritImpact` family was filtered out before shortlist.
- Durable outcome: do not reopen a shared black safe-progress-vs-spirit runtime spend across these two seams. Shared `ApprovedReplyRiskGuard` approval was a false lead; the candidate-set failure modes are different.

## Pro Black Recurrence Structure Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave tested the only plausible shared Pro follow-up left after the widened blocker replay by comparing the two repeated black seams directly: repeated `alternating_mana_rows` black `l2,7;l1,6` vs `l2,7;l1,8`, and repeated Pro black `l1,6;l2,7` vs shipping `l1,5;l2,3;l1,2`.
- The seams only matched on the surface. Both boards were `window=1/deny=1`, frontier still returned through `engine_post_search`, and shipping still stayed `engine_disabled`.
- Under that, they split again. The `alternating` board still approved outside-shortlist `DrainerSafetyRecovery l2,7;l1,6` through `ApprovedFamilyCompetition` while the shortlist itself stayed on `ManaTempo`. The `l1,6;l2,7` board instead approved shortlisted `SafeSupermanaProgress l1,6;l2,7` through `ApprovedReplyRiskGuard`, while shipping `SpiritImpact l1,5;l2,3;l1,2` survived only as a preserved family representative outside the candidate set.
- Durable outcome: do not reopen a shared Pro-only black runtime spend across these two repeated seams. Shared stage/context was a false lead; the advisor and candidate-set failure modes are different.

## Pro-Only Blocker Replay Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave widened the Pro-only replay over the active blocker set instead of probing one seam at a time: `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows` with `smart_automove_pro_reliability_nonwin_trace_probe`, `duel_filter=vs_shipping_pro`, `repeats=6`, and `games=3`.
- The replay logged `11` Pro nonwins across `36` games. It did not promote the new white seams: `l9,7;l8,8` vs `l9,7;l8,7` and `l6,7;l7,6` vs `l6,7;l7,7` each appeared once.
- Instead, the Pro surface broadened into mixed black residue. Black `l2,7;l1,6` vs `l2,7;l1,8` repeated twice, black `l1,6;l2,7` vs shipping `l1,5;l2,3;l1,2` repeated twice, and the rest stayed singleton across both colors and across `engine_post_search` plus `engine_disabled` surfaces.
- Durable outcome: do not reopen the new white Pro seams as standalone spends. The widened Pro-only blocker surface is still mixed, and the repeated recurrence is on the black side rather than the white side.

## White Late Mana Sibling Surface Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave tested the only nearby retained extension candidate for the new Pro white `l6,7;l7,6` vs `l6,7;l7,7` seam by comparing it directly against the retained late white mana sibling duel-normal board.
- They were not the same surface. The retained board ships and frontier-aligns on `l7,7;l6,5;l6,6` through `engine_post_search`, keeps a live head plan, and mixes `SpiritImpact` against `SafeSupermanaProgress` under `window=2/deny=2`.
- The new seam is different. It still ships `l6,7;l7,7`, frontier drifts to `l6,7;l7,6`, the selector is already `engine_disabled`, there is no head plan, and the whole top root pool stays pure `ManaTempo` under `window=0/deny=0`.
- Durable outcome: do not reopen the retained late white mana sibling path as an extension candidate for `l6,7;l7,6` vs `l6,7;l7,7`. The retained board is a late spirit/setup surface, and the new seam is an early pure-ManaTempo ordering surface.

## Same-Family Late Mana Residual Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave tested the only plausible shared scoring angle left inside the current same-family `ManaTempo` drifts: late black `outer_edge` plus the new Pro white `l9,7;l8,8` vs `l9,7;l8,7` and `l6,7;l7,6` vs `l6,7;l7,7` seams.
- The black `outer_edge` seam and the white `l9,7;l8,8` vs `l9,7;l8,7` seam both came back as exact ties at the scoring layer. They had zero residual delta, zero `search_eval` delta, and identical `TurnEngineUtility` despite different selected roots.
- The white `l6,7;l7,6` vs `l6,7;l7,7` seam did not match that shape. It carried a real residual delta (`-112`) concentrated in `spirit_action_utility` and `mana_close_to_same_pool`.
- Durable outcome: do not reopen a shared same-family late mana scoring spend. Two seams are tie-order surfaces and the third is a different residual-scoring surface, so there is still no common mechanism.

## All-Blocker Recurrence Trace Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave widened recurrence tracing over the full active blocker set instead of probing one blocker at a time: `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows` with `smart_automove_pro_reliability_duel_trace_probe`, `repeats=4`, and `games=3`.
- The broader trace did not collapse the residue. Across `24` games per duel, Pro logged `3` regressions, Normal `3`, and Fast `7`.
- Every per-duel `repeated_move_pairs` entry stayed singleton. The isolated repeated white head-accept seam and isolated black mana sibling seam stopped dominating once the full blocker set was traced together.
- The widened trace also broadened the blocker surface instead of shrinking it. Alongside the known `alternating` and `forward_bridge` misses, it exposed extra singleton Pro/Normal seams such as `l9,7;l8,8` vs `l9,7;l8,7`, `l6,7;l7,6` vs `l6,7;l7,7`, and `l9,6;l9,4;l8,4` vs `l9,6;l7,8;l8,8`.
- Durable outcome: do not reopen a shared spend across `outer_edge_mana_rows`, `alternating_mana_rows`, and `forward_bridge_mana_rows`. Keep the broadened recurrence counts and no-go lesson, discard the logs.

## Blocker Hotspot Fingerprint Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave first reran bounded nonwin traces only to recover the current black blocker boards on clean logs: `outer_edge_mana_rows` on `vs_shipping_normal` still logged `2` nonwins, including late black `l1,6;l1,5` vs shipping `l2,6;l3,7`, and `alternating_mana_rows` on `vs_shipping_fast` logged `4` nonwins, including black `l2,7;l1,6` vs shipping `l2,7;l1,8`.
- A temporary three-board hotspot fingerprint probe then compared late black `outer_edge`, black `alternating`, and the repeated white `forward_bridge` head-accept board.
- The commonality was only the expected frontier-vs-search-only cost shape. On all three boards, frontier and shipping enumerated the same selector pool sizes, while frontier paid extra exact/pickup/secure-mana/tactical-spirit work on top of the shipping search-only baseline.
- That was not a shared runtime mechanism. `outer_edge` still drifted at `pre_accept` into lower-ranked same-family `ManaTempo`, `alternating` still drifted at `pre_accept` into outside-family `DrainerSafetyRecovery`, and repeated white `forward_bridge` still kept shipping at `pre_accept` and only flipped at head acceptance. The exact contexts also stayed split between `window=1/deny=1` and `window=0/deny=0`.
- Durable outcome: do not reopen a shared exact/selector hotspot spend across the remaining repeated seams. Keep the clean-board FEN recovery and the no-go lesson, discard the temporary probe code.

## White Forward-Bridge Structure Probe Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave targeted the only plausible shared white runtime angle left after the isolated Fast traces: whether the repeated `forward_bridge_mana_rows` white seam and its sibling white misses were really one late spirit/setup mechanism.
- They were not. On the repeated seam, shipping `l9,6;l7,6;l7,7` was both legacy-selected and advisor-approved as `SpiritImpact`, and frontier only lost later by accepting head `l9,6;l7,4;l7,3`.
- The `l9,6;l8,7` seam was different. Shipping `l9,6;l7,7;l8,8` stayed in the shortlist, but frontier approved `SafeSupermanaProgress l9,6;l8,7` through `ApprovedReplyRiskGuard`.
- The `l9,7;l8,6` seam was different again. It routed through `score_window_tactical_fallback`, preserved a safe-progress representative, and did not even stay on the same runtime path as the repeated head-accept seam.
- Durable outcome: do not reopen a shared white `forward_bridge_mana_rows` spend. The white seams look related from the move list, but they split across head acceptance, reply-risk approval, and runtime fallback layers, so there is still no common runtime mechanism.

## Black Late-Mana Structure Probe Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The wave targeted the only plausible shared black runtime angle left after the isolated Fast traces: whether the unresolved Normal `outer_edge_mana_rows` black seam and the repeated Fast `alternating_mana_rows` black seam were really the same late-mana mechanism.
- They were not. On `outer_edge_mana_rows` black, shipping `l2,6;l3,7` was still the legacy-selected, reply-risk-shortlisted `ManaTempo` root, and frontier still drifted to lower-ranked `ManaTempo l1,6;l1,5` through `ApprovedReplyRiskGuard`.
- On the repeated `alternating_mana_rows` black seam, shipping `l2,7;l1,8` was also the legacy-selected `ManaTempo` root, but frontier did not lose to another shortlisted `ManaTempo`. It approved outside-shortlist `DrainerSafetyRecovery l2,7;l1,6` through `ApprovedFamilyCompetition`, while the ordered shortlist itself stayed on `ManaTempo`.
- Durable outcome: do not reopen a shared black late-mana spend across `outer_edge_mana_rows` and `alternating_mana_rows`. The move pairs look related, but the advisor/shortlist failure modes are different, so there is still no common runtime mechanism.

## Fast Variant-Isolation Trace Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- `forward_bridge_mana_rows` was isolated first with `smart_automove_pro_reliability_duel_trace_probe`. Across `24` Fast games it logged `8` regressions, `4` improvements, and `12` flat games. The repeated pair did get stronger: the white head-accept seam `l9,6;l7,4;l7,3` vs shipping `l9,6;l7,6;l7,7` appeared `3` times.
- That still was not one-variant collapse. The same `forward_bridge_mana_rows` trace kept five singleton seams behind the repeated pair, including black mana/progress misses (`l0,6;l1,6` vs `l2,3;l3,4`, `l7,1;l9,3` vs `l1,5;l3,4;l2,3`) and extra white spirit/setup siblings (`l9,6;l8,7` vs `l9,6;l7,7;l8,8`, `l9,7;l8,6` vs `l9,7;l7,6;l7,7`, `l9,5;l9,6` vs `l7,3;l6,2`).
- `alternating_mana_rows` was then isolated with `smart_automove_pro_reliability_nonwin_trace_probe` on `vs_shipping_fast`. It logged `7` Fast nonwins. The black mana sibling seam `l2,7;l1,6` vs `l2,7;l1,8` repeated `2` times, but the rest of the variant still stayed singleton: `l0,10;l0,9` vs `l4,0;l5,0;mb`, `l1,6;l1,7` vs `l1,6;l0,5`, `l2,5;l0,5;l1,6` vs `l2,5;l4,7;l3,8`, `l8,5;l10,5;l9,4` vs `l8,5;l6,3;l7,2`, and `l2,4;l1,5` vs `l2,4;l1,3`.
- Durable outcome: do not spend isolated `forward_bridge_mana_rows` or `alternating_mana_rows` runtime code yet. Each variant now has one repeated pair, but neither variant collapsed to a single runtime mechanism.

## Fast Recurrence Trace Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The widened `smart_automove_pro_reliability_duel_trace_probe` reran `alternating_mana_rows,forward_bridge_mana_rows` against `vs_shipping_fast` with `repeats=4` and `games=3`, for `24` Fast games total. The result was still mixed: `8` regressions, `7` improvements, and `9` flat games.
- Only one move pair repeated more than once: the already-archived white branch head-accept seam `l9,6;l7,4;l7,3` vs shipping `l9,6;l7,6;l7,7`, which appeared `2` times.
- Every other Fast regression pair stayed singleton, including the black `alternating_mana_rows` mana/recovery misses, the black `forward_bridge_mana_rows` mana sibling misses, and the white `l9,6;l8,7` vs `l9,6;l7,7;l8,8` spirit/setup seam.
- Durable outcome: do not reopen a standalone white late head-accept blocker from this trace alone. The repeated pair is real, but the wider Fast blocker set still does not collapse to one runtime mechanism.

## Late Black Outer-Edge Probe Wave

- No runtime challenger was cut in this wave. The spend stayed diagnostic-only.
- The remaining Normal `outer_edge_mana_rows` miss narrowed to one late black turn-eight advisor seam. Shipping `l2,6;l3,7` was already the legacy-selected, reply-risk-shortlisted `ManaTempo` root, while frontier still approved lower-ranked `l1,6;l1,5` through `ApprovedReplyRiskGuard`.
- That seam is real but still too local to spend on by itself. It only explains one remaining Normal board and does not collapse the sampled Fast residue.
- Explicit Fast replay on `alternating_mana_rows,forward_bridge_mana_rows` still logged `5` nonwins across both colors. The residue mixed `engine_post_search` divergences with head-accepted divergences and included bomb/setup-style misses, so it still does not support one shared runtime hypothesis.
- Durable outcome: do not spend a direct late-black same-family legacy-alignment override yet. Keep the lesson, discard the probe code, and clean logs/stamps.

## White Mana-Only Legacy-Progress Wave

- No runtime challenger survived this wave. The local candidate added a narrow `ApprovedLegacySelector` carve-out inside the white turn-three legacy-alignment advisor path for mana-only, `window=0`, `deny=0`, positive-safety boards where legacy already preferred a vulnerable safe-progress root over approved non-vulnerable `ManaTempo`.
- The line did move the clean local seam. On the explicit `outer_edge_mana_rows` white board, frontier aligned from `l10,4;l9,5` to shipping `l9,4;l8,3`, and the explicit `vs_shipping_normal` outer-edge trace dropped from `2` nonwins to `1`, leaving only the late black miss.
- That still was not promotable. The canonical loop cleared `guardrails`, `variant-smoke`, `pro-triage`, and `runtime-preflight`, then sampled `pro-reliability` still failed at Pro `1.0000`, Normal `0.9167`, Fast `0.8333`; confidence `0.9998 / 0.9968 / 0.9807`; frontier average move times stayed below `200ms`.
- The remaining sampled blockers on that line were still broad enough to kill it: Normal `outer_edge_mana_rows` stayed at `0.5000`, and Fast `alternating_mana_rows` plus `forward_bridge_mana_rows` stayed at `0.5000`; `classic` and `corner_chain_mana_rows` were clean on that sample.
- Durable outcome: do not reopen the direct white turn-three mana-only legacy-progress override on the positive-safety `window=0/deny=0` surface. Keep the lesson that it only removed the clean white half of `outer_edge_mana_rows`, discard the runtime code and temporary retained board.

## Variant-Blocker Trace Wave

- No runtime challenger was cut in this wave. The spend was diagnostic-only: explicit-variant `smart_automove_pro_reliability_nonwin_trace_probe` replays against the current sampled blockers on the kept `frontier_pro_v2_guarded` tree.
- Normal `outer_edge_mana_rows` did reproduce, but not as one seam. The bounded `vs_shipping_normal` replay logged `2` nonwins: a late black turn-eight `engine_post_search` miss (`l1,6;l1,5` vs shipping `l2,6;l3,7`) and an early white turn-three action+mana `engine_post_search` miss (`l10,4;l9,5` vs shipping `l9,4;l8,3`).
- Fast explicit `classic,forward_bridge_mana_rows,corner_chain_mana_rows` also stayed mixed. The bounded `vs_shipping_fast` replay logged `5` nonwins, all on `forward_bridge_mana_rows` and `corner_chain_mana_rows`; `forward_bridge` stayed mainly `engine_post_search`, while `corner_chain` also exposed an `engine_disabled` ordering miss.
- Standalone Fast `classic` explicit replay produced `0` nonwins in the same bounded probe, so the sampled `classic` miss is not yet a stable direct target.
- Durable outcome: do not spend runtime code on the mixed `outer_edge_mana_rows` plus Fast `forward_bridge_mana_rows` / `corner_chain_mana_rows` residue until a later clean probe collapses it to one shared mechanism. Keep the trace counts and stage split, discard the logs and stamps.

## Late Black Shipping-Fallback Expansion Wave

- No runtime challenger survived this wave. The local candidate extended `select_late_black_search_fallback_inputs` into late weak-window black turn-start and mana-only states.
- The line did fix the traced sampled black boards directly. The turn-eight weak-window Normal board aligned to shipping mana `l2,6;l3,7`, and the turn-ten weak-window Fast board aligned to shipping recovery `l1,6;l0,5`.
- That still was not promotable. The canonical loop cleared `guardrails`, `variant-smoke`, `pro-triage`, and `runtime-preflight`, then sampled `pro-reliability` failed at Pro `1.0000`, Normal `0.9167`, Fast `0.7500`; confidence `0.9998 / 0.9968 / 0.9270`; frontier average move times stayed below `200ms`.
- The sampled failure rotated instead of shrinking. `alternating_mana_rows` recovered, but Fast residue moved to `classic`, `corner_chain_mana_rows`, and `forward_bridge_mana_rows`, while Normal `outer_edge_mana_rows` still failed at `0.5000`.
- Durable outcome: do not reopen a broad late-black shipping-fallback expansion just because it fixes the currently traced black sampled boards. Keep the lesson, discard the runtime code and temporary retained boards.

## Sampled-Pass Late-Ply Override Wave

- No runtime challenger survived this wave. The local candidate paired a white late spirit-setup branch-head reject with black weak-window mana-lane advisor overrides and a weak-window carve-out in black followup competition.
- The line did move the targeted sampled late boards. Two new retained boards were briefly promoted locally, and sampled `pro-reliability` passed at Pro `1.0000`, Normal `0.9167`, Fast `0.9167`, with confidence `0.9998 / 0.9968 / 0.9968`.
- All-variant `pro-reliability-confirm` killed it hard: Pro `0.6667`, Normal `0.7292`, Fast `0.6667`, with confidence `0.9853 / 0.9990 / 0.9853`. Frontier average move times stayed below `200ms`, so the failure was duel strength, not runtime cost.
- Follow-up `smart_automove_pro_reliability_nonwin_trace_probe` on the confirm corpus logged `16` Pro nonwins across multiple variants and both colors, with repeated late `engine_post_search` / head-accept divergences from shipping. That was broad enough to kill the line instead of stacking more local exceptions.
- Durable outcome: do not reopen this combined late white head-block plus black weak-window mana-lane package. Keep the confirm metrics and lesson, discard the runtime code and temporary retained boards.

## Black Progress Material Plus Rank Wave

- No runtime challenger survived this wave. The local candidate combined frontier-only scoped material/cooldown dampening on the black turn-six weak-window residue with a higher-scoring setup-rank exception in the advisor path.
- The focused probe moved the local target: frontier aligned from safe progress `l7,1;l9,3` to shipping setup `l1,5;l2,7;l1,8`, and the retained turn-ten setup-control board stayed aligned.
- Cheap gates were clean enough to spend the sampled duel: `guardrails`, `variant-smoke`, `pro-triage`, and `runtime-preflight` all passed.
- Sampled retained reliability killed it hard: Pro `0.5000`, Normal `0.5000`, Fast `0.8333`, with confidence `0.0000 / 0.0000 / 0.9807`. Frontier average move times were `148.34ms / 179.83ms / 161.71ms`, so cost was not the failure.
- Durable outcome: even a mechanism that both removes the material gap and moves advisor approval is only local board repair. Do not reopen this residue with scoped material-plus-rank advisor changes unless there is new evidence for retained multi-variant duel strength.

## Black Progress Selector-Layer Probe

- No runtime challenger was cut in this wave. The retained change is diagnostic-only: `black_progress_residual_weight_attribution_probe` now also replays the target under material-dampened weights and reports the advisor/selector layer.
- The replay kept selecting frontier safe progress `l7,1;l9,3` through `frontier_execute` / `engine_post_search` even with `fainted_mon` and `fainted_cooldown_step` zeroed. The advisor approved that same root as `SafeSupermanaProgress:ApprovedReplyRiskGuard:rank0`.
- The shipping setup root `l1,5;l2,7;l1,8` was not missing; it appeared in the reply-risk shortlist at rank `10`.
- Durable outcome: after the material/cooldown gap is removed, this residue is an advisor reply-risk approval problem, not a final-selector mystery. Do not spend on final-selector-only or material-only changes; any future spend must prove why the reply-risk guard should prefer the setup root while preserving retained setup-control boards.

## Black Progress Material Dampening Wave

- No runtime challenger survived this wave. The target was the black Fast progress-vs-setup residue where frontier keeps safe progress `l7,1;l9,3` and shipping chooses the setup root `l1,5;l2,7;l1,8`.
- The existing attribution probe confirmed the local residual score story: on the target, safe progress beat setup mostly through `fainted_mon` and `fainted_cooldown_step`.
- A narrow scoring cut zeroed those two material/cooldown terms only for the scoped black turn-six action+mana window/deny state. It did reduce the target residual deltas from `843/778` after-root to `83/18`, and from `862/797` at worst reply to `102/37`.
- The line was still behaviorally inert. Final frontier selection stayed on `l7,1;l9,3`, while the retained turn-ten setup-control board stayed on shipping/setup as intended. Because `target_changed=0`, the runtime code was discarded before canonical gate spend.
- Durable outcome: material/cooldown explains the local residual valuation, but material-only scoring is not a live challenger. Future work must explain the selector layer that keeps safe progress after the residual gap is mostly removed.

## Black Recovery Static-Exact Wave

- No runtime challenger survived this wave. The target was the remaining `black_recovery_branch` seam where pairwise attribution showed static exact evaluation could flip the local reply-floor ordering toward shipping.
- A broad scoped static-exact cut was killed before canonical spend because it did not recover shipping; on the local retained board it selected the new spirit sibling `l1,5;l2,6` instead of shipping `l6,0;l6,1`.
- A narrower reply-floor-only exact cut did align that board to shipping and passed `guardrails`, `variant-smoke`, retained `pro-triage`, and `runtime-preflight`.
- Retained sampled duel strength killed it. `pro-reliability` failed at Pro `0.5000`, Normal `0.5000`, Fast `0.9167`, with confidence `0.0000 / 0.0000 / 0.9968`; frontier average move times were `153.71ms / 180.61ms / 159.35ms`, so cost was acceptable but strength was not.
- Durable outcome: static exact remains useful as an attribution signal but not as a direct `black_recovery_branch` runtime patch. Do not reopen broad static exact or reply-floor-only exact without a new mechanism that improves retained multi-variant duel strength.

## Promoted Retained Package And Residual Classification Wave

- On `2026-04-23`, the retained package around `frontier_pro_v2_guarded` was refreshed and promoted as the only shipped Pro path.
- The promoted package kept the narrow white and black repairs that survived retained and confirm gates: white turn-three no-action recovery, early-white engine-disabled wrapper fallback, nonnegative-deny and selected-rank search-only fallbacks, white turn-five head guards, white confirm ProV1 tiebreaks, black late safe-mana/setup advisor repairs, and the black turn-six guarded legacy mana override.
- Release verification passed with public Pro still wired through `select_frontier_pro_v2_guarded_inputs`; experimentation stayed gated behind `#[cfg(test)]`.
- The full canonical confirm loop passed with Pro `0.9688`, Normal `1.0000`, Fast `0.9688`, confidence `1.0000`, and average move times below `200ms`.
- The remaining residuals were classified as no-go at the current selection layer:
  - `black_recovery_branch` is only reopened by a scoped static-exact cost/reliability hypothesis; local legacy and shipping-mirror fallbacks were killed.
  - The black Fast progress-vs-setup residue is explained by residual material/cooldown valuation; shortlist, advisor, and wrapper mirrors were killed.
  - White search-order residue is not solved by root reachability, root rank, broad ProV1 reroute, wrapper config mirroring, or rerank-cap clamps; future work must separate unresolved siblings from retained vulnerable guards below the current shortlist/reply-risk surface.
- Durable outcome: the live board was compressed back to one retained frontier, one baseline, one next-hypothesis slot, and explicit no-go notes. Detailed probe diaries remain in git history, not in the live operator flow.

## Reference Frontier Wave

- Early retained turn-engine work established the shared infrastructure that later made guarded `ProV2` possible.
- `runtime_pro_turn_engine_v1` belongs to this wave. It is archive-only reference history now, not an active experiment target.

## Replay-Diary Wave

- Many Apr 8-9 duel replays (`v7` through `v75`) were useful for classification but not for direct code spend.
- The common stop reason was the same: exact move pairs stayed count `1`, or the repeated pair had no retained Pro foothold.
- Durable outcome: keep the retained probes, compress the diary, and let git history hold the seed-by-seed detail.

## Wrapper And Fallback Wave

- Several opening-book, early-white, and forced-prepass wrapper cuts were tried after promotion work stalled.
- Some narrow guards survived as part of the shipping guarded path.
- The broader lesson from this wave is negative: wrapper-only repairs were rarely promotable on their own and often failed to move the direct `vs shipping Normal` wall.

## Retained Seam-Mapping Wave

- This wave produced the durable retained fixtures that future work still uses: black action+mana, black mana bridge, black spirit bridge, negative-deny, white safe-progress, and the closed regression seams.
- Most production cuts from this wave were killed because they solved only one local family.
- Durable outcome: keep the fixtures and the probes, not the abandoned production branches.

## Unified Root-Advisor Promotion Wave

- The winning structural change was the unified `ProV2` root advisor that centralized shortlist shaping, family preservation, omitted-root handling, macro-root injection, and conservative post-search verification.
- The final promotable cut was narrow: on quiet early-black boards, advisor approval had to stop preferring a weaker plain-spirit sibling over a stronger own-setup `SpiritImpact` root already in the shortlist.
- Durable outcome: `frontier_pro_v2_guarded` survived as the retained guarded frontier, but shipping stayed on the separate search-only path.

## Pro-Only Surface Cleanup Wave

- After promotion, the active experiment surface was shrunk to two selectable profiles: `shipping_pro_search` and `frontier_pro_v2_guarded`.
- Calibration/reference profiles, curated-pool smoke plumbing, and compatibility-only docs were archived.
- Legacy flat experiment logs and the old `target/experiment-runs/runtime_preflight_*.stamp` compatibility path were removed.
- Durable outcome: future work starts from a smaller Pro-only workflow; archived profiles and stages stay documented here, not in the live runbook.

## Closed-Surface Archive Cleanup Wave

- On `2026-04-21`, the archived regression seams `primary_spirit_setup`, `primary_pvs_sensitive_search`, and `primary_black_reliability_opening_3_ply4` were removed from the live `primary_pro` pack and from the default retained probes.
- Their history stays here only. They are no longer part of the live retained experiment surface or the default operator diagnostics.
- Durable outcome: `primary_pro` now means current live retained seams only, and closed-surface history no longer leaks into the active workflow.

## Quiet-Guarded Challenger Wave

- `frontier_pro_v3_quiet_guarded` tried to spend on live non-win seams around quiet mana acceptance and vulnerable plain-spirit reentry.
- The cut only passed `pro-triage` after 2 duel-derived live non-win boards were promoted into retained `primary_pro`.
- Direct evidence killed it: `pro-reliability` vs shipped `frontier_pro_v2_guarded` came back `0.3333 / 0.8333 / 0.8333`, so the candidate code was discarded.
- Durable outcome: keep the new retained seams and the live non-win root probe, but require direct frontier-vs-shipping wins before reopening this hypothesis family.

## White-Guarded Challenger Wave

- `frontier_pro_v3_white_guarded` spent on three white-only live seams: late quiet head acceptance, safe mana sibling selection on the exact split trace, and turn-3 vulnerable-window recovery.
- The cut really did fix the first two probe boards: `vs_shipping_pro_opening_reply_white` and `vs_shipping_pro_white_split_trace` matched shipping after the local guards landed.
- It was still not promotable because `vs_shipping_normal_white_head_acceptance` never left `search_only_engine_allowed_head`; shipping still reached `search_only_forced_prepass` on the same board.
- Durable outcome: keep the probe improvements and the lesson that the unresolved turn-3 search-only handoff is the real remaining seam. Discard the candidate code.

## Live-Seam Override Wave

- `frontier_pro_v3_live_seam_override` explicitly aligned the four known live seam boards to shipping behavior while keeping the white turn-3 vulnerable-window recovery.
- The cut did what it was supposed to do locally: retained `primary_pro` moved cleanly by `2 / 62` with `off_target_changed=0`, and `runtime-preflight` passed.
- Direct evidence still killed it: `pro-reliability` vs shipped `frontier_pro_v2_guarded` only reached `0.5000 / 0.7500 / 0.8333`, so even exact seam coverage was nowhere near promotable.
- Durable outcome: treat exact live-seam alignment as a dead end for Pro promotion. Keep the knowledge, discard the candidate code.

## Quiet-Score-Guarded Wave

- `frontier_pro_v3_quiet_score_guarded` tried a candidate-only quiet lower-scored root guard aimed at live non-win mana-head acceptance.
- The cut really did move the retained surface: `primary_pro` changed by `5 / 62` with `off_target_changed=0`, `guardrails` passed, and `runtime-preflight` passed.
- It fixed `vs_shipping_pro_opening_reply_white`, but the other live probe walls still stood: `vs_shipping_pro_black_recovery_branch`, `vs_shipping_pro_white_split_trace`, `vs_shipping_normal_black_bridge_nonwin`, and `vs_shipping_normal_white_head_acceptance`.
- Direct evidence still killed it: `pro-reliability` vs shipped `frontier_pro_v2_guarded` only reached `0.5833 / 0.7500 / 0.9167`, so the candidate code was discarded.
- Durable outcome: quiet-score suppression alone is not a promotable Pro frontier. Keep the lesson, discard the candidate code.

## Progress-Rescue Probe Wave

- `frontier_pro_v3_progress_rescue_guarded` first turned on the dormant mid-turn white progress guard and late-black setup-progress rescue, then added a candidate-only unsafe plain-spirit floor guard.
- The probe-only result was negative: the live non-win root probe remained unchanged on `vs_shipping_pro_opening_reply_white`, `vs_shipping_pro_black_recovery_branch`, `vs_shipping_pro_white_split_trace`, `vs_shipping_normal_black_bridge_nonwin`, and `vs_shipping_normal_white_head_acceptance`.
- Because the candidate never changed the intended live walls, it never earned `guardrails`, `pro-triage`, or `runtime-preflight`.
- Durable outcome: when the live non-win root probe does not move, kill the line immediately and keep the codebase clean.

## Forced-Prepass Priority Wave

- `frontier_pro_v3_forced_prepass_priority` tried to prioritize `forced_tactical_prepass` ahead of search-only head acceptance and was explicitly threaded through the white scoring-window fallback.
- The probe-only result was still negative: `vs_shipping_normal_white_head_acceptance` stayed on `search_only_engine_allowed_head`, and the other live probe walls also stayed unchanged.
- Because the candidate never changed the intended live walls, it never earned `guardrails`, `pro-triage`, or `runtime-preflight`.
- Durable outcome: if the exact search-only handoff stage does not move, the missing spend is deeper than prepass ordering. Kill the line and keep the codebase clean.

## White Reply-Head Guarded Wave

- `frontier_pro_v3_white_reply_head_guarded` tried a candidate-only white vulnerable-window head reject plus a quiet-mana reply-score guard, and the candidate config was explicitly threaded through the white scoring-window fallback.
- The probe-only result was still negative on the targeted white walls: `vs_shipping_pro_opening_reply_white`, `vs_shipping_pro_white_split_trace`, and `vs_shipping_normal_white_head_acceptance` all kept the same selected roots as shipping misses.
- The only visible movement was metadata-level: `vs_shipping_pro_white_split_trace` changed the approved reason label to `ApprovedFamilyCompetition` without changing the selected root.
- Because the candidate never changed the intended live walls, it never earned `guardrails`, `pro-triage`, or `runtime-preflight`.
- Durable outcome: if a white candidate only changes advisor reason labels or leaves `search_only_engine_allowed_head` intact, the real spend is deeper than generic quiet-mana score guards. Kill the line and keep the codebase clean.

## White Presearch-Reentry Guarded Wave

- `frontier_pro_v3_white_presearch_reentry_guarded` tried three white-only spends together: a vulnerable-window presearch approval path, a late quiet-mana head reject, and a stricter white mana-sibling same-lane gap.
- The probe result was mixed but still not promotable. It did fix `vs_shipping_pro_white_split_trace`, moving the selected root from `l8,0;l7,1` to shipping `l10,8;l9,7`.
- The other white walls did not move: `vs_shipping_pro_opening_reply_white` still kept `l10,10;l10,9`, and `vs_shipping_normal_white_head_acceptance` still stayed on `search_only_engine_allowed_head` instead of shipping `search_only_forced_prepass`.
- Because the candidate only repaired one white seam and left the opening-reply plus search-only handoff walls intact, it never earned `guardrails`, `pro-triage`, or `runtime-preflight`.
- Durable outcome: `white_split_trace` is a real white sibling reentry seam, but fixing it alone is not enough. Keep the lesson, discard the candidate code, and keep the worktree clean.

## White Head And Search-Only Guarded Wave

- `frontier_pro_v3_white_head_search_only_guarded` tried three narrow spends together: a late-white low-budget selector exception, a late quiet-mana head reject, and a search-only white vulnerable-window top-head conflict.
- The probe-only result was fully negative. `vs_shipping_pro_opening_reply_white` still stayed `engine_disabled`, `vs_shipping_pro_white_split_trace` still kept `l8,0;l7,1`, and `vs_shipping_normal_white_head_acceptance` still stayed on `search_only_engine_allowed_head`.
- Because the candidate never changed the intended white walls, it never earned `guardrails`, `pro-triage`, or `runtime-preflight`.
- Durable outcome: the remaining white spend is deeper than the guessed low-budget selector gate or a simple search-only top-head conflict. Kill the line and keep the codebase clean.

## Selector-PreDisabled Probe Wave

- `frontier_pro_v3_selector_predisabled_probe` did not cut a new challenger. The spend for this wave was diagnostic-only: the retained live non-win probe now records the actual frontier wrapper branch and the selector disable reason.
- That first reading was later found to be contaminated by an unconditional extra shipping-search fallback on non-black boards. The corrected probe residue from the next wave kept the useful top-level selector fields, but the specific `frontier_execute + pre_disabled` conclusion from this entry should no longer be treated as ground truth on the white boards.
- Durable outcome: keep the improved probe instrumentation, but do not reopen the old `pre_disabled` interpretation without first verifying that no extra fallback search is overwriting the top-level selector diagnostics.

## Advisor-Window Guarded Wave

- `frontier_pro_v3_advisor_window_guarded` was cut after correcting the live probe contamination from the late-black shipping fallback. Once the probe was truthful, the two active white walls split cleanly: `opening_reply_white` was a post-search head-over-advisor seam and `normal_white_head_acceptance` was an early-white vulnerable-window recovery miss.
- The candidate fixed both of those walls together. `opening_reply_white` stayed on the advisor-approved `l9,5;l8,6`, and `normal_white_head_acceptance` stayed on the safe recovery root `l9,4;l8,5` with the risky window head rejected.
- It earned the smaller gates: `guardrails` passed, retained `primary_pro` moved by `5 / 62` with `off_target_changed=0`, exact-lite passed, and stage-1 CPU stayed advisory-only even though the Pro ratios drifted to about `1.65x`, `1.70x`, and `1.90x`.
- Direct retained evidence still killed it. `pro-reliability` vs `shipping_pro_search` failed uniformly at `0.6667 / 0.6667 / 0.6667` with confidence `0.8062 / 0.8062 / 0.8062`, so the candidate code was discarded.
- Durable outcome: even fixing both corrected white live walls and moving retained `primary_pro` cleanly is still not enough. Keep the corrected probe residue and the lesson; discard the candidate code.

## Reply-Risk Injection Guarded Wave

- `frontier_pro_v3_reply_risk_injection_guarded` widened reply-risk shortlist coverage, enabled lazy score-window projection, and allowed two injected roots under the existing Pro V2 selector path.
- The probe result was negative on every real live wall. `opening_reply_white` still accepted the same head over the advisor-approved mana continuation, `black_recovery_branch` still approved the preserved spirit reentry even after the shipping `l6,0;l6,1` mana root entered the reply-risk shortlist, `normal_black_bridge_nonwin` still stayed on the spirit-impact root, and `normal_white_head_acceptance` still stayed on the risky vulnerable-window root.
- Root injection was not the missing mechanism on those boards: `injected_root` stayed `None` through the live probe, so the extra root budget did not translate into a changed approved root.
- The only visible movement was diagnostic-only and not promotable. A white plain-spirit split board changed root ordering, but the real live non-win walls stayed unchanged.
- Durable outcome: shortlist width, lazy score-window projection, and small root injection are not the bottleneck. If the black recovery fallback can already appear inside the shortlist and still not win approval, the next spend has to land inside approval or head logic rather than coverage.

## Approval-Escape Guarded Wave

- `frontier_pro_v3_approval_escape_guarded` turned on lazy score-window projection and spent on candidate-only approval escapes in white followup-mana competition, white mana sibling competition, black legacy alignment, a turn-3 white recovery override, and a late-white head reject.
- The cut did move two real seams. `vs_shipping_pro_white_split_trace` finally approved shipping `l10,8;l9,7`, and `vs_shipping_normal_black_bridge_nonwin` moved off the spirit-own-mana setup onto shipping `l6,1;l5,0;mb`.
- It was still not promotable because the remaining blockers stayed unchanged. `vs_shipping_pro_opening_reply_white` still accepted `l10,10;l10,9` over the advisor-approved `l9,5;l8,6`, `vs_shipping_pro_black_recovery_branch` still approved the preserved spirit reentry instead of shortlist legacy mana `l6,0;l6,1`, and `vs_shipping_normal_white_head_acceptance` still stayed on the vulnerable window root `l9,4;l8,3` instead of the safe recovery root.
- Because those surviving live walls never moved together, the candidate did not earn `guardrails`, `pro-triage`, or `runtime-preflight`. The code was discarded and only the lesson was kept.

## Reply-Risk Reentry Guarded Wave

- `frontier_pro_v3_reply_risk_reentry_guarded` enabled lazy score-window projection, widened the late-white post-search reject so it could also block vulnerable heads over safe-recovery preaccept roots, and relaxed the black vulnerable-spirit escape so vulnerable mana challengers could win approval.
- The white result was still negative. `vs_shipping_pro_opening_reply_white` stayed on `l10,10;l10,9`, and `vs_shipping_normal_white_head_acceptance` still finished on vulnerable `l9,4;l8,3` even though advisor approval had already moved to safe recovery `l9,4;l8,5`.
- The black result was worse, not better. `vs_shipping_pro_black_recovery_branch` flipped onto legacy mana `l6,0;l6,1` while shipping still stayed on spirit `l1,5;l3,3;l2,3`, so removing the safety requirement overcorrected the wrong wall.
- Because the surviving white walls did not move and the black recovery wall moved away from shipping, the candidate never earned `guardrails`, `pro-triage`, or `runtime-preflight`. The code was discarded and only the lesson was kept.

## Safe-Progress Head-Guarded Wave

- `frontier_pro_v3_safe_progress_head_guarded` added family-specific white safe-progress head rejects plus a turn-3 vulnerable-window recovery override, and it was cut only after the live probe gained `head_family` and `goal_family` output.
- The probe confirmed the targeted white walls precisely. `vs_shipping_pro_opening_reply_white` is a `SafeSupermanaProgress -> DrainerSafetyRecovery` post-search head-over-advisor seam, and `vs_shipping_normal_white_head_acceptance` is a `SafeSupermanaProgress -> ImmediateScore` vulnerable-window head-over-recovery seam.
- The candidate did move the intended walls. It fixed both white seams, kept `vs_shipping_pro_black_recovery_branch` aligned with shipping spirit `l1,5;l3,3;l2,3`, passed `smart_automove_tactical_selected_profile`, moved retained `primary_pro` by `5 / 62` with `off_target_changed=0`, and passed exact-lite.
- Retained duel strength still killed it. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.8333 / 0.7500 / 0.9167`, so the candidate code was discarded.
- Durable outcome: even precise `SafeSupermanaProgress` family-specific white head guards plus the turn-3 recovery override are still not promotable. Keep the probe-family diagnostics and the lesson; do not reopen the candidate code.

## Live Nonwin Family Guarded Wave

- `frontier_pro_v3_live_nonwin_family_guarded` extended the family-aware white package with a tighter black turn-6 spirit-reentry filter aimed at the retained vulnerable-spirit seam.
- The candidate did move the intended live walls together. It fixed `vs_shipping_pro_opening_reply_white`, `vs_shipping_normal_white_head_acceptance`, and `vs_shipping_pro_black_recovery_branch`, passed `smart_automove_tactical_selected_profile`, moved retained `primary_pro` by `4 / 62` with `off_target_changed=0`, and passed exact-lite.
- Runtime cost was still weak: `smart_automove_pool_stage1_cpu_non_regression_gate` only cleared in advisory mode at `1.502x`, `1.548x`, and `1.608x` vs `shipping_pro_search`.
- Retained duel strength still killed it. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.8333 / 0.7500 / 0.7500` with confidence `0.9807 / 0.9270 / 0.9270`, so the candidate code was discarded.
- Durable outcome: even fixing both white live walls and the black spirit-reentry wall together is still not enough. Keep the lesson; do not reopen the candidate code.

## White Window Recovery Guarded Wave

- `frontier_pro_v3_white_window_recovery_guarded` tried a narrower white-only spend: a turn-3 no-action vulnerable-window recovery redirect plus a late white weak-window recovery override on action+mana boards.
- The candidate did move the vulnerable-window seam at the advisor layer. On `vs_shipping_normal_white_head_acceptance`, `pre_accept_input_fen` and advisor approval changed from vulnerable `l9,4;l8,3` to safe `DrainerSafetyRecovery l9,4;l8,5`.
- That movement never reached the actual frontier output. Final selected roots on all live walls stayed unchanged against active `frontier_pro_v2_guarded`, because post-search head acceptance still snapped `vs_shipping_normal_white_head_acceptance` back to vulnerable `l9,4;l8,3`.
- Direct challenger evidence killed it immediately: retained `pro-triage` vs active `frontier_pro_v2_guarded` returned `target_changed=0 off_target_changed=0`, so the line was behaviorally inert and never earned `runtime-preflight` or retained reliability.
- Durable outcome: approval-only white recovery is not enough if the final head step still wins. Do not spend canonical gates on candidates that only improve advisor or `pre_accept` metadata.

## Reply-Order Guarded Wave

- `frontier_pro_v3_reply_order_guarded` tried two shared comparator changes together: a stricter risky-recovery progress sibling override and a bounded late-black vulnerable non-spirit followup escape.
- The line stayed fully inert. The live non-win probe left `vs_shipping_pro_opening_reply_white`, `vs_shipping_pro_black_recovery_branch`, and `vs_shipping_normal_white_head_acceptance` unchanged, and the retained live seams `primary_white_safe_progress_rerank_ply27` plus `primary_live_nonwin_black_vulnerable_spirit_reentry` also stayed unchanged.
- Direct challenger evidence killed it immediately: retained `pro-triage` vs active `frontier_pro_v2_guarded` returned `target_changed=0 off_target_changed=0`, so the line never earned `runtime-preflight` or retained reliability.
- Durable outcome: tightening those shared reply-order thresholds alone is not the missing spend. Keep the lesson, discard the candidate code, and keep the worktree clean.

## Family-Competition Guarded Wave

- `frontier_pro_v3_family_competition_guarded` paired a tighter black turn-6 spirit-reentry filter with a tighter white turn-3 mana sibling competition and a candidate-only turn-3 white recovery override.
- The package did move two real live seams together. `vs_shipping_pro_black_recovery_branch` aligned to shipping `l6,0;l6,1`, and `vs_shipping_pro_white_split_trace` aligned to shipping `l10,8;l9,7`.
- The surviving white seams still blocked promotion. `vs_shipping_pro_opening_reply_white` stayed on `l10,10;l10,9`, and `vs_shipping_normal_white_head_acceptance` again only moved at the advisor layer: `pre_accept_input_fen` changed to safe `DrainerSafetyRecovery l9,4;l8,5`, but the final selected root still snapped back to vulnerable `l9,4;l8,3`.
- Because one surviving wall stayed completely unchanged and the other still failed at final head acceptance, the line never earned `pro-triage`, `runtime-preflight`, or retained reliability. The code was discarded and only the lesson was kept.

## Live Wall Combo Guarded Wave

- `frontier_pro_v3_live_wall_combo_guarded` combined a late-white quiet head reject, a turn-3 white weak-window recovery redirect, a tighter black turn-6 spirit-reentry filter, and a safer white split-trace mana competition.
- The package did align all four active live walls together. `vs_shipping_pro_opening_reply_white`, `vs_shipping_pro_black_recovery_branch`, `vs_shipping_pro_white_split_trace`, and `vs_shipping_normal_white_head_acceptance` all moved onto the intended shipping roots in the live probe.
- The smaller gates also stayed clean. `smart_automove_tactical_selected_profile` passed, exact-lite passed, and retained `primary_pro` triage stayed at `target_changed=2 / off_target_changed=0`.
- Canonical cost killed it immediately anyway. Against `shipping_pro_search`, `smart_automove_pool_pro_reliability_gate` failed on `stage1_cpu_v1` at `1.687 / 1.696 / 1.732`, with median ratio `1.696x` versus the `1.300x` limit, so the candidate code was discarded.
- Durable outcome: even perfect live-wall alignment plus clean retained triage is not promotion evidence if canonical CPU cost regresses this hard.

## Retained Surface Guarded Wave

- `frontier_pro_v3_retained_surface_guarded` combined a late-white quiet mana head reject, a turn-3 white vulnerable-window recovery override, and a black vulnerable plain-spirit reentry override.
- The package did move the intended retained live seams. It fixed `vs_shipping_pro_opening_reply_white`, `vs_shipping_pro_black_recovery_branch`, and `vs_shipping_normal_white_head_acceptance`, while retained `primary_pro` triage stayed clean at `target_changed=2 / off_target_changed=0`.
- The cheap gates also stayed clean. `smart_automove_tactical_selected_profile` passed, exact-lite passed, and no off-target retained churn appeared.
- Canonical cost still killed it immediately. `smart_automove_pool_stage1_cpu_non_regression_gate` only cleared in advisory mode at `1.617 / 1.763 / 1.624`, and retained `smart_automove_pool_pro_reliability_gate` died on its embedded `stage1_cpu` precheck at `1.611855221929612 / 1.621475467583131 / 1.6299568403679077`, with median ratio `1.621x` against the `1.300x` limit.
- Durable outcome: even a narrower retained-surface package that fixes three real live walls and keeps retained churn clean is still not promotable if runtime cost regresses back into the `1.6x+` range. Candidate code should be discarded and only the lesson kept.

## Opening Reentry Guarded Wave

- `frontier_pro_v3_opening_reentry_guarded` kept only the two retained live-seam spends from the broader retained-surface package: a late-white quiet mana head reject and a black vulnerable plain-spirit reentry override.
- The package moved the intended retained seams and nothing broader. It fixed `vs_shipping_pro_opening_reply_white` and `vs_shipping_pro_black_recovery_branch`, intentionally left `vs_shipping_normal_white_head_acceptance` unchanged, and retained `primary_pro` triage stayed clean at `target_changed=2 / off_target_changed=0`.
- The cheap gates still stayed clean. `smart_automove_tactical_selected_profile` passed, exact-lite passed, and no off-target retained churn appeared.
- Canonical cost still killed it immediately. `smart_automove_pool_stage1_cpu_non_regression_gate` only cleared in advisory mode at `1.586 / 1.619 / 1.625`, and retained `smart_automove_pool_pro_reliability_gate` died on its embedded `stage1_cpu` precheck at `1.5837620164231196 / 1.5857045402338734 / 1.6051744579914184`, with median ratio `1.586x` against the `1.300x` limit.
- Durable outcome: removing the turn-3 white vulnerable-window recovery override did not fix the runtime-cost regression. The expensive part is at least the late-white opening head reject plus black reentry combo, so candidate code should be discarded and only the lesson kept.

## Retained Gate Alignment Wave

- No new frontier challenger was cut from this wave. The useful code change landed in the retained harness instead: frontier Pro stage-1 CPU is now advisory by default, matching the runbook instead of requiring an explicit env override.
- That harness correction exposed the deeper blocker immediately. On the default retained `pro_turn_planner_reliability_v1` corpus, shipped `frontier_pro_v2_guarded` itself now reaches the duel stage and fails retained `pro-reliability` at `0.7500 / 0.8333 / 1.0000` with confidence `0.9270 / 0.9807 / 0.9998`.
- Durable outcome at that point: keep the harness fix, but the exact retained duel surface still needed to be traced before cutting another challenger.

## White Mid-Turn Recovery Broadening Wave

- This wave tried to spend directly on the remaining white Fast search-only split `l9,4;l8,3` vs shipping `l9,4;l8,5`.
- The runtime cut widened `pro_v2_root_advisor_white_turn_three_no_action_recovery_override` from `mons_moves_count == 0` to `<= 1` and paired it with a post-search head reject for same-lane vulnerable `ManaTempo -> DrainerSafetyRecovery` pairs.
- Locally, the line was real: it fixed the white Fast `ply9` seam, aligned the older vulnerable white mana-only board `l8,4;l7,3` to shipping `l8,4;l8,5`, passed `guardrails`, retained `pro-triage` at `target_changed=4 / off_target_changed=0`, exact-lite, and advisory stage-1 CPU at `1.551 / 1.527 / 1.365`.
- Retained duel strength still killed it. `pro-reliability` failed at `0.9167 / 0.7500 / 0.9167`, and the Normal non-win trace rotated onto engine-disabled early-white boards such as `l8,5;l7,6` vs shipping `l8,7;l7,8`, `l9,4;l8,5` vs `l9,4;l9,3`, and `l8,5;l7,6` vs `l9,5;l8,3;l7,4`. The code was discarded.

## Default Non-Win Surface Alignment Wave

- No new frontier challenger was cut from this wave either. The useful spend was replaying the full default retained duel corpus on shipped `frontier_pro_v2_guarded` and collapsing the exact non-win openings.
- The shipped frontier miss is now fully mapped to the existing live non-win probe surface. `vs_shipping_pro` only loses on `opening_reply_white`, `black_recovery_branch`, and `white_split_trace`; `vs_shipping_normal` only loses on `black_bridge_nonwin` and `white_head_acceptance`; `vs_shipping_fast` is clean at `0` non-wins.
- The live root probe was cleaned to match that exact five-board retained duel surface by dropping the stale extra Pro split board that is not part of the current default non-win pack.
- Durable outcome: the next credible Pro challenger should target those five boards directly. The retained duel boundary is no longer an unexplained seed-mismatch story; it is a concrete five-wall frontier problem.

## Partial Three-Wall Guarded Wave

- No new named frontier challenger survived this wave. The local candidate combined a late-white quiet head reject, a turn-3 white vulnerable-window recovery override, and a black turn-6 preserved-spirit reentry override against active `frontier_pro_v2_guarded`.
- The live probe did move the intended three walls. It fixed `vs_shipping_pro_opening_reply_white`, `vs_shipping_pro_black_recovery_branch`, and `vs_shipping_normal_white_head_acceptance`; retained `primary_pro` triage stayed clean at `target_changed=3 / off_target_changed=0`, and `runtime-preflight` passed with advisory stage-1 CPU at `1.554 / 1.522 / 1.379`.
- Retained duel strength still killed it. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.8333 / 0.7500 / 0.7500` with confidence `0.9807 / 0.9270 / 0.9270`, so the package still was not promotable even before the untouched `white_split_trace` and `black_bridge_nonwin` seams moved.
- It also regressed duel packs that were clean before the edit. `vs_shipping_fast` picked up three non-wins, including a late white post-search snap from shipping `l8,6;l6,5;l6,4` to `l8,7;l9,8` and a repeated late black tail mismatch `l1,8;l1,9` vs shipping `l1,8;l0,8`; `vs_shipping_normal` also reintroduced a white post-search miss (`l8,5;l7,6` vs shipping `l9,5;l8,3;l7,4`).
- Durable outcome: do not reopen partial three-wall approval/head packages. If `white_split_trace` and `black_bridge_nonwin` stay untouched, the retained duel can still fail and previously clean fast/normal packs can regress, so discard the candidate code and keep only the lesson.

## Black Spirit Safety-Gate Wave

- No new frontier challenger survived this wave. The local candidate only tightened `pro_v2_black_turn_six_spirit_reentry` so unsafe preserved-spirit reentry could not beat the available shipping mana root on `black_recovery_branch`.
- The local board and the small gates both looked real. `vs_shipping_pro_black_recovery_branch` aligned to shipping `l6,0;l6,1`, retained `primary_pro` triage stayed clean at `target_changed=4 / off_target_changed=0`, and `runtime-preflight` passed with advisory stage-1 CPU at `1.563 / 1.531 / 1.368`.
- Retained duel strength still killed it. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.9167 / 0.9167 / 0.8333`, so the candidate code was discarded.
- Durable outcome: `black_recovery_branch` is not solved by a blunt unsafe-spirit ban. Keep the lesson, discard the candidate code, and keep the worktree clean.

## Black Legacy-Path Probe Wave

- No new frontier challenger survived this wave either. The useful spend was diagnostic-only on `black_recovery_branch`.
- The ignored probe `black_recovery_branch_legacy_alignment_probe` shows that a direct call to `pro_v2_root_advisor_black_legacy_alignment_override` already returns shipping `l6,0;l6,1` on the live black seam.
- The same probe also captured the path mismatch: a local ProV1 candidate replay on the board resolved to `l1,5;l2,7;l1,8`, while `pro_v2_legacy_selector_probe` still reported `l6,0;l6,1`.
- A naive fallback that scanned qualifying mana roots picked the wrong sibling `l6,0;l7,0`, so the candidate code was discarded before any canonical gate spend.
- Durable outcome: treat `black_recovery_branch` as a legacy-selector plumbing mismatch, not another score-threshold problem. Keep the diagnostic probe and the lesson; discard the production attempt.

## Black Legacy-Selector Config-Swap Wave

- No new frontier challenger survived this wave either. The local candidate changed one line in `pro_v2_root_advisor_select_root`: the ProV1 legacy selector stopped inheriting `shortlist_config` and instead reused the full runtime `config`, which re-enabled the root reply-risk guard for that selector.
- The local board movement was real. The live non-win probe aligned `vs_shipping_pro_black_recovery_branch` to shipping `l6,0;l6,1` through `ApprovedLegacySelector`, while the earlier white turn-three retained fixes stayed intact.
- The small gates also stayed clean enough to justify the spend. `guardrails` passed, retained `pro-triage` stayed at `target_changed=4 / off_target_changed=0`, exact-lite passed, and advisory stage-1 CPU came back at `1.566 / 1.534 / 1.364`.
- Retained duel strength still killed it. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.8333 / 0.9167 / 0.8333`, so the code was discarded.
- Durable outcome: the black legacy-selector mismatch is real, but globally re-enabling reply-risk for that selector is too broad. Keep the lesson, discard the code, and do not reopen this exact config swap.

## Black Reply-Risk-Shortlist Fallback Wave

- No new frontier challenger survived this wave either. The local candidate left the legacy selector alone and only tightened `pro_v2_root_advisor_black_legacy_alignment_override` so the weak plain-spirit black seam could choose the best-ranked vulnerable mana root from the current `reply_risk_shortlist`.
- The local board movement was real. The retained black seam assertion and the live non-win probe both aligned `vs_shipping_pro_black_recovery_branch` to shipping `l6,0;l6,1`, while nearby retained checks for the white confirm board and the black post-search spirit-reentry board still passed.
- The cheap gates also stayed clean enough to justify the duel spend. `guardrails` passed, retained `pro-triage` stayed at `target_changed=4 / off_target_changed=0`, exact-lite passed, and advisory stage-1 CPU came back at `1.561 / 1.522 / 1.367`.
- Retained duel strength still killed it in the same place as the broader black-only lines. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.9167 / 0.9167 / 0.8333`, with Fast still below the floor.
- The follow-up trace showed that Fast loss was not a new collateral surface from the shortlist fallback. Replaying `smart_automove_pro_reliability_nonwin_trace_probe` with `duel_filter=vs_shipping_fast` produced exactly two non-wins, and both were the already-pinned late black head-accept seam on `3 1 b 1 0 2 0 0 14 ...`, where frontier accepts `l1,8;l1,9` and shipping stays on `l1,8;l0,8`.
- Durable outcome: even the shortlist-local black fallback is too broad to keep. Aligning `black_recovery_branch` alone is still not enough; keep the lesson, discard the code, and do not reopen this exact shortlist fallback.

## White Search-Only Recovery Fallback Wave

- No new frontier challenger survived this wave. The local candidate tried the remaining white search-only split `l9,4;l8,3` vs shipping `l9,4;l8,5` in two runtime-variant forms: first by re-querying shipping locally after frontier execution, then by choosing the same nearby safe `DrainerSafetyRecovery` challenger directly from frontier's own ranked roots.
- The local board movement was real. Both variants fixed the retained white `ply9` board and kept the nearby white confirm, white Fast, and black late-fast retained checks clean.
- The cheap gates also stayed clean enough to justify the duel spend. `guardrails` passed, retained `pro-triage` stayed at `target_changed=5 / off_target_changed=0`, exact-lite passed, and advisory stage-1 CPU stayed in the same band at `1.563 / 1.527 / 1.363`.
- Retained duel strength still killed both versions in the same place. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.9167 / 0.8333 / 0.9167`, with Normal below the floor.
- The follow-up Normal non-win trace showed why the direct fallback is not enough. The pack still included the engine-disabled early-white split `l8,5;l7,6` vs shipping `l9,5;l8,3;l7,4`, so fixing the earlier `ply9` recovery board in isolation still leaves the retained Normal blocker alive.
- Durable outcome: do not reopen direct runtime-variant white search-only recovery fallbacks for `l9,4;l8,3`. Keep the lesson, discard the code, and move the next white spend onto the remaining engine-disabled early-white seam instead.

## Black Residue Shipping Fallback Wave

- No new frontier challenger survived this wave. The local candidate added `select_black_progress_setup_engine_disabled_fallback_inputs`, mirroring shipping on the exact black turn-six action+mana weak-window residue board where frontier keeps `l7,1;l9,3` and shipping disables engine selection to play `l1,5;l2,7;l1,8`.
- The local board movement was real. The new retained assertion aligned that residue board to shipping, while the nearby retained white engine-disabled, late black Fast, and late black reply-risk setup walls all stayed clean.
- The cheap gates and the smaller retained duel also stayed clean enough to justify confirm. `guardrails` passed, retained `pro-triage` stayed at `target_changed=5 / off_target_changed=0`, exact-lite passed, advisory stage-1 CPU came back at `1.555 / 1.526 / 1.369`, and retained `pro-reliability` passed at `0.9167 / 0.9167 / 1.0000`.
- The larger confirm duel killed it. `smart_automove_pool_pro_reliability_gate` vs `shipping_pro_search` failed at `0.9375 / 0.9062 / 0.8750`, with Fast below the floor.
- The confirm-sized Fast non-win trace showed why the wrapper is too shallow. The pack still included the old white search-only split `l9,4;l8,3` vs shipping `l9,4;l8,5`, and it also rotated onto two later black engine-disabled seams: `l0,0;l1,1` vs shipping `l7,1;l8,0`, and `l0,5;l1,5` vs shipping `l2,5;l3,7;l2,8`.
- Durable outcome: do not keep or reopen the direct black engine-disabled shipping fallback on `l7,1;l9,3`. Preserve the improved residue probe and move the next black spend onto the later Fast seams instead of mirroring shipping on the earlier turn-six board.

## Black Residue Full-Pool Advisor Probe Wave

- No new runtime challenger survived this wave either. The only kept change is a stronger ignored `black_progress_vs_setup_residue_probe` that now reports shortlist membership plus utility, reply-floor, and followup metrics for the competing `SpiritImpact` own-setup progress roots on `l7,1;l9,3` vs shipping `l1,5;l2,7;l1,8`.
- The useful lesson is that the remaining black residue is not a safe “promote the shipping root from the full pool” advisor fix.
- The probe confirms the shipping root is still absent from `reply_risk_shortlist`, but it also shows the strongest full-pool own-setup progress challenger under frontier's current metrics is `l1,5;l3,7;l2,8`, not shipping `l1,5;l2,7;l1,8`.
- Durable outcome: do not reopen this board with another blind advisor family-competition override. Any future black spend here has to explain the engine-disabled ordering that makes shipping choose `l1,5;l2,7;l1,8` instead of the stronger full-pool spirit candidate first.

## Black Recovery Shortlist Revisit Wave

- No new runtime challenger survived this revisit either. The local candidate reinstated the shortlist-local vulnerable-mana fallback inside `pro_v2_root_advisor_black_legacy_alignment_override`, choosing the best-ranked vulnerable `ManaTempo` root already present in `reply_risk_shortlist` on `black_recovery_branch`.
- The local seam movement was real on the cleaned promoted package. `black_recovery_branch` aligned to shipping `l6,0;l6,1`, and the five-board live nonwin root probe collapsed back to the older white seams.
- The refreshed ignored `black_recovery_branch_legacy_alignment_probe` is worth keeping: it now prints shortlist root details and confirms why the local fallback picks shipping `l6,0;l6,1` instead of the earlier wrong score-leader `l6,0;l7,0`.
- The broader retained duel still killed the line. The canonical loop passed `guardrails`, `pro-triage`, exact-lite, and advisory stage-1 CPU, then failed retained `pro-reliability` at `0.9167 / 0.9167 / 0.8333`.
- The failure surface also changed enough to rule out keeping the runtime cut as a live challenger. The new `pro` miss rotated to a later black lane split `l1,6;l1,7` vs shipping `l1,6;l1,5`, `normal` stayed on the old white `ply9` search-only split `l9,4;l8,3` vs `l9,4;l8,5`, and the two Fast non-wins had `first_diff=none`.
- Durable outcome: even after the earlier late-Fast blocker was repaired, the shortlist-local black legacy fallback is still not promotable. Keep the stronger diagnostic, discard the runtime/test change, and do not reopen this exact line again without explaining the later black lane split plus the no-diff Fast failure.

## Black Later Lane Probe Wave

- No new runtime challenger survived this wave either. The only kept change is a focused ignored `black_pro_lane_split_probe` for the later black `pro` miss `l1,6;l1,7` vs shipping `l1,6;l1,5`.
- The useful lesson is that this seam is not another shortlist omission and not another head-acceptance miss.
- The probe shows shipping `l1,6;l1,5` is already in the frontier `reply_risk_shortlist` beside frontier `l1,6;l1,7` and the rejected head `l2,6;l1,5`. All three are the same safe-progress family.
- It also shows shipping's root loses on frontier's own selector metrics: the reply floor is tied, `shipping_vs_frontier=false`, and frontier keeps better local utility because it preserves `drainer_safety=2` while shipping drops to `-1`.
- Durable outcome: do not reopen the later black lane split with another advisor or reply-risk ordering tweak. Shipping only reaches `l1,6;l1,5` because it disables the turn-engine selector on that board, so this is another shipping-disabled lower-safety ordering mismatch rather than a live frontier bug.

## Fast Hotspot Trace Wave

- No new runtime challenger survived this wave either. The only kept change is a focused ignored `fast_hotspot_trace_probe` for the retained Fast hotspot opening `0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/...`.
- The main value of that probe is that it killed the lazy “Fast is still failing only on no-diff gate noise” read for the current promoted package.
- On the current promoted tree, the hotspot opening really does diverge when frontier is white. The first drift is at `ply=57` on `1 1 w 0 0 1 0 0 9 n04s1xn06/...`, where frontier plays `l9,5;l8,6` from `engine_post_search` and shipping plays `l8,5;l7,7;l8,8` from `engine_disabled`. Frontier's head is rejected, so this is not another head-acceptance issue.
- The same opening with frontier as black is not a fresh target. It rotates back onto the known `black_recovery_branch` split `l1,5;l3,3;l2,3` vs shipping `l6,0;l6,1`.
- Durable outcome: do not spend the next wave treating the retained Fast hotspot as identical-behavior noise. The efficient next step is to classify that late white engine-disabled divergence board before reopening any older black or white no-go seam.

## White Late Fast Hotspot Wave

- No new runtime challenger survived this wave either. The only kept change is a focused ignored `white_late_fast_hotspot_probe` for the late white Fast hotspot board `1 1 w 0 0 1 0 0 9 n04s1xn06/...`.
- The useful lesson is that this board does not admit the obvious shipping mirror.
- Frontier's approved root `l9,5;l8,6` is the only reply-risk-shortlisted root and preserves the stronger reply floor (`921` vs shipping `651`).
- Shipping's move `l8,5;l7,7;l8,8` is outside the frontier shortlist, loses under frontier's own reply-risk comparator (`shipping_vs_frontier=false`), and is not even the strongest spirit-progress candidate in the full pool.
- Durable outcome: treat this as another shipping-only search ordering mismatch, not a live wrapper-fallback or advisor omission. Do not reopen it with direct shipping mirroring, shortlist widening, or a simple spirit-family override without a new explanation for shipping's search-only ordering.

## White Ply9 Search Ordering Wave

- No new runtime challenger survived this wave either. The only kept result is the stronger read from the existing ignored `white_fast_ply9_search_only_split_probe` on `l9,4;l8,3` vs shipping `l9,4;l8,5`.
- The useful lesson is that the remaining white `ply9` seam is not just “previously disproved” in aggregate; it is locally another shipping-only ordering mismatch.
- Frontier's approved `l9,4;l8,3` is the only reply-risk-shortlisted root and keeps the stronger floor (`1191` vs shipping `730`).
- Shipping's `l9,4;l8,5` is a full-pool `DrainerSafetyRecovery` root outside the frontier shortlist and still loses under frontier's own reply-risk comparator (`shipping_vs_frontier=false`).
- Durable outcome: do not reopen that `ply9` seam with direct shipping mirroring, shortlist widening, or another simple recovery override without a new explanation for shipping's `search_only_engine_allowed_head` ordering.

## White Ordering Config Wave

- No new runtime challenger survived this wave either. The only kept change is a focused ignored `white_profile_config_ordering_probe` for the two remaining white ordering boards: `white_ply9_search_ordering` and `white_late_fast_hotspot`.
- The useful lesson is that there is no hidden per-board config branch separating those seams from the promoted package.
- On both boards, shipping and frontier use the same depth (`4`), node budget (`15774`), reply-risk shortlist budget (`9 / 24 / 2000`), and scoring weights.
- The remaining difference is structural and profile-level: shipping stays `selector=false`, `head_rerank=true`, `mode=ProV1`, while frontier stays `selector=true`, `head_rerank=false`, `mode=ProV2` with the extra ProV2 guards.
- Durable outcome: treat the remaining white seams as search-profile semantics, not board-local config misses. Do not reopen them with another board-local wrapper or guard tweak unless there is a brand-new shared hypothesis.

## White Rerank Semantics Wave

- No new runtime challenger survived this wave either. The kept diagnostic is `white_ordering_rerank_semantics_probe`, and the discarded runtime cut was a frontier-local rerank-semantics fallback for `white_ply9_search_ordering`.
- The probe usefully split the two remaining white ordering boards instead of merging them. On `white_ply9_search_ordering`, shipping `l9,4;l8,5` is rank `0` on both the shipping and frontier root sets, is `Accepted` by `classify_turn_engine_rerank_override`, is allowed by `turn_engine_allowed_rerank_override_candidate`, and does not conflict with the ProV2 advisor.
- The late Fast hotspot is not the same class. On `white_late_fast_hotspot`, shipping `l8,5;l7,7;l8,8` is rejected by `ProgressGate` and is not an allowed rerank candidate even on shipping's own root set.
- The runtime cut was real but still too shallow. It fixed `l9,4;l8,3` vs shipping `l9,4;l8,5`, passed `guardrails`, `pro-triage` at `target_changed=5 / off_target_changed=0`, exact-lite, and advisory stage-1 CPU at `1.551 / 1.523 / 1.363`, then failed retained `pro-reliability` at `0.9167 / 0.8333 / 0.9167`.
- The retained Normal trace showed why it cannot stay live: instead of stopping at `ply9`, the pack rotated onto other early-white engine-disabled seams, including `l8,5;l7,6` vs shipping `l8,7;l7,8` and `l8,5;l7,6` vs shipping `l8,5;l7,4`.
- Durable outcome: do not reopen `white_ply9_search_ordering` with another narrow rerank-semantics wrapper fallback. Even when the shipping root is rerank-admissible and advisor-compatible on frontier, the local repair still is not enough to promote.

## White Normal Residue Wave

- No new runtime challenger survived this wave. The kept additions are a fresh retained `vs_shipping_normal` non-win trace on the cleaned promoted package and the new ignored `white_normal_ply11_search_only_split_probe`.
- The useful result is that the discarded rerank fallback's rotated engine-disabled boards are not the live retained Normal surface on the clean tree.
- Replaying `smart_automove_pro_reliability_nonwin_trace_probe` with `SMART_PRO_RELIABILITY_DUEL_FILTER=vs_shipping_normal` produced `total_nonwins=1`, and the sole drift was a sibling of the white search-order family: `0 0 w 1 0 1 0 0 3 n06a0xn04/...`, first diff at `ply=11`, frontier `l9,4;l8,3`, shipping `l9,4;l8,5`.
- The new board-local probe shows the same structural shape as the earlier Fast probe. Frontier's shortlist is still just `l9,4;l8,3`; shipping still reaches `l9,4;l8,5` through `search_only_engine_allowed_head`; the shipping recovery root is still outside the frontier shortlist; and `shipping_vs_frontier=false` under frontier's own reply-risk comparator.
- Durable outcome: until a future challenger changes the clean retained trace, treat current Normal residue as the white `l9,4;l8,3` vs `l9,4;l8,5` search-order family, not as the rotated early-white engine-disabled boards from the discarded rerank fallback.

## White Allowed-Head Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_search_order_allowed_head_probe`.
- The useful result is that the live white search-order family is not blocked by root-set reachability. On both `white_ply9_search_ordering` and `white_normal_ply11_search_ordering`, shipping's rerank engine still chooses `l9,4;l8,5` when it is fed the frontier root set.
- Frontier's own rerank engine config on the same allowed heads still prefers `l9,4;l8,3`, with `l9,4;l8,5` only appearing as a lower-ranked rerank plan.
- Durable outcome: treat the current white residue as a rerank-engine profile split (`shipping` ProV1 rerank vs `frontier` ProV2 rerank), not as a selector-disabled root omission. Another wrapper fallback that only patches root choice is not a real explanation.

## White Rerank Mode Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_search_order_rerank_mode_probe`.
- The useful result is that the white rerank split is narrower than “ProV2 everywhere is wrong” but stronger than a pure root-set or admissibility issue.
- On both white search-order siblings, forcing only the frontier rerank engine mode from `ProV2` to `ProV1` already flips the best allowed-head plan to shipping `l9,4;l8,5`.
- Shipping still chooses `l9,4;l8,5` even when its rerank mode is forced to `ProV2`, so the mismatch is not a generic mode-only story either.
- Durable outcome: treat the live white residue as a frontier-`ProV2` rerank semantics split. Do not jump straight from that fact to another narrow runtime mode-swap fallback without fresh retained-duel evidence.

## White Rerank Budget Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_search_order_rerank_budget_probe`.
- The useful result is that the live white rerank split is not spread across all of frontier's rerank budget knobs.
- On both white search-order siblings, swapping only frontier's rerank own-search caps (`own_seed_cap`, `own_beam`, `per_node_family_cap`, `step_cap`) to the shipping `ProV2` values already flips the best allowed-head plan from `l9,4;l8,3` to shipping `l9,4;l8,5`.
- Swapping only frontier's reply caps (`opponent_seed_cap`, `opponent_beam`, `reply_seed_cap`, `reply_beam`) does nothing, and swapping only the expansion cap does nothing.
- Durable outcome: treat the current white residue as a frontier-`ProV2` rerank own-search-breadth split. If there is ever a runtime spend here, it should be justified against that exact surface rather than against generic reply breadth or expansion arguments.

## White Own-Cap Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_search_order_rerank_own_cap_probe`.
- The useful result is that the frontier-side rerank own-search split is not spread evenly across the four own caps.
- `step_cap` alone flips both white search-order siblings from `l9,4;l8,3` to shipping `l9,4;l8,5`, and it reproduces the shipping rerank utility on both boards.
- `own_seed_cap` alone also flips both siblings to `l9,4;l8,5`, but it does not reproduce the same rerank utility on the Fast board, so it is a weaker explanation than `step_cap`.
- `own_beam` alone and `per_node_family_cap` alone do nothing; frontier stays on `l9,4;l8,3`.
- Durable outcome: treat frontier `ProV2` rerank `step_cap` as the cleanest single-cap explanation for the live white residue seen so far. Do not jump from that directly to a runtime patch on an already promotable package without fresh duel evidence.

## White Seed-Step Scope Wave

- No new runtime challenger survived this wave either. The kept diagnostic is `white_search_order_seed_step_scope_probe`.
- The useful result is that the two remaining “active” white rerank caps are still too broad to spend directly.
- On the two live white search-order siblings, shrinking either frontier rerank `own_seed_cap` or frontier rerank `step_cap` still flips the allowed-head plan from `l9,4;l8,3` to shipping `l9,4;l8,5`.
- On the late white Fast hotspot, though, the same broad cap shrink does not leave the board stable and does not reproduce shipping. `own_seed_cap` shrink moves frontier to `l8,5;l6,5;l5,4`, `step_cap` shrink moves it to `l8,5;l6,5;l6,4`, and shipping's rerank on the frontier head set still stays on `l9,5;l8,6`.
- Durable outcome: broad white rerank `own_seed_cap` or `step_cap` shrink is not a safe runtime answer. Any future white rerank spend has to gate more tightly than “lower frontier rerank seed/step breadth.”

## White Runtime Step Clamp Wave

- No new runtime challenger survived this wave. The attempted cut was the narrowest live follow-up to the seed/step probes: clamp frontier `ProV2` rerank `step_cap` to `1` only on the exact white `turn=3 / mons_moves=1 / no-action / mana-only / window=1 / deny=1 / drainer_safety<0` board class.
- The useful result is that the live white search-order residue is not controlled by `turn_engine_rerank_config` alone.
- The focused retained slice failed immediately. On both white siblings, frontier still selected `l9,4;l8,3` instead of shipping `l9,4;l8,5`.
- The runtime shape did not budge: selector stage stayed `engine_post_search`, the accepted head stayed `l9,4;l8,3`, and the approved shortlist stayed a singleton on that same root.
- Durable outcome: do not reopen the white search-order family with another board-local rerank-cap runtime tweak unless a future probe first shows how that tweak can move shortlist or approved-root behavior instead of only changing allowed-head rerank plans in isolation.

## White Shortlist Gate Wave

- No new runtime challenger survived this wave either. The kept diagnostic is `white_search_order_shortlist_gate_probe`.
- The useful result is that the remaining white search-order seam is not blocked by candidate focus and is not waiting on the current safe-progress shortlist extension.
- On both white siblings, shipping `l9,4;l8,5` is already present in frontier `candidate_indices`.
- It still never reaches the approved shortlist. The shortlist stays a singleton on vulnerable `l9,4;l8,3` because that root's score is about `809k` above shipping's, far beyond the `165` shortlist margin, and `pro_v2_safe_progress_sibling_shortlist_extension` returns `None`.
- Durable outcome: do not reopen the white search-order family with another simple shortlist tweak or another rerank-cap tweak. Any future white spend has to explain a new shortlist/approved-root reentry theory, or a deeper root-scoring normalization, instead of assuming the current focus/extension machinery just missed `l9,4;l8,5`.

## White Selector-Disable Wrapper Probe Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_search_order_selector_disable_probe`.
- The useful result is that shallow config mirroring does not actually test selector-disabled white semantics through the guarded frontier wrapper.
- On both white search-order siblings and on `white_late_fast_hotspot`, forcing the incoming frontier runtime config to `selector=false`, `head_rerank=true`, shipping-like own caps, or even `TurnEngineMode::ProV1` still leaves the live decision unchanged on frontier `engine_post_search`.
- The code path explains why: `select_frontier_pro_v2_guarded_inputs` always routes frontier execution back through `apply_frontier_pro_v2_guarded_config`, so those config-only selector-disable toggles are reapplied away before search runs.
- Durable outcome: do not reopen the white search-order family with another wrapper-local config-only selector-disable or head-rerank mirror. Any future white wrapper spend has to change wrapper branching itself, or move deeper into shortlist/root-scoring behavior.

## White Raw Search-Only ProV1 Scope Wave

- No new runtime challenger survived this wave. The kept diagnostics are `white_search_order_wrapper_branch_probe` and `white_search_order_raw_prov1_scope_probe`.
- The useful result is that once the guarded wrapper is truly bypassed, raw search-only branch choices become locally meaningful.
- Raw `search-only + ProV2` still keeps frontier `l9,4;l8,3` on the two white search-order siblings and keeps frontier `l9,5;l8,6` on the late Fast hotspot.
- Raw `search-only + shipping own caps + ProV2` fixes the two `ply9/ply11` siblings but still leaves the hotspot on frontier.
- Raw `search-only + ProV1` matches shipping on all three local white seams, so search-only `ProV1` semantics are a real explanation rather than a dead config artifact.
- That broad line is still not safe enough to keep. The scope probe shows the same raw `search-only + ProV1` reroute also flips the retained vulnerable white turn-three guard from `l8,4;l7,3` to shipping `l8,4;l8,5`, even though it shares the same coarse `turn=3 / mons_moves=1 / no-action / mana-only / window=1 / deny=1 / drainer_safety<0` context as the unresolved white siblings.
- Durable outcome: do not reopen the white search-order family with a broad wrapper-level search-only `ProV1` gate on that coarse white context. Any future white wrapper spend has to distinguish the retained vulnerable guard from the unresolved siblings with a narrower theory than “use shipping-like search-only semantics here.”

## White Vulnerable-Guard Search-Order Comparison Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_vulnerable_guard_search_order_probe`.
- The useful result is that the retained vulnerable white turn-three guard is not a different class from the unresolved white search-order siblings at the current shortlist/reply-risk layer.
- On the retained guard board, frontier still keeps a singleton vulnerable `ManaTempo` shortlist and shipping still only wins through `search_only_engine_allowed_head` on an outside-shortlist rank-0 `DrainerSafetyRecovery` root, just like the unresolved sibling boards.
- `shipping_vs_frontier` is still `false` there too, and there is still no projection or advisor reentry signal that would justify a simple wrapper-local split between the guard board and the unresolved siblings.
- Durable outcome: do not reopen the white search-order family with another wrapper-level gate based on the current reply-risk/shortlist surface. Any future white spend has to distinguish boards below that surface or change the root scoring that makes both boards disagree in the same way.

## White Negative-Deny Rank Surface Wave

- No new runtime challenger survived this wave. Two narrow negative-deny white wrapper cuts were tried and both died in the focused retained slice before any canonical gate spend.
- The first cut replayed the remaining Normal sibling through raw `search-only + shipping own caps + ProV2` and tried to keep it only when that replayed move was `root_rank=0`.
- The second cut used direct shipping fallback on the same board and tried to keep it only when the shipping move was `root_rank=0` in the shipping search.
- Both cuts still reopened the retained vulnerable guard `l8,4;l7,3` to shipping `l8,4;l8,5`, so both runtime changes were discarded.
- The kept diagnostic is `white_search_order_rank_surface_probe`.
- Its useful result is that root rank is fake separation for the negative-deny white seam.
- On the then-unresolved Normal sibling, shipping `l9,4;l8,5` is both `selected_rank=0` and `root_rank=0`.
- On the retained vulnerable guard, shipping `l8,4;l8,5` still shows `selected_rank=4` under the shipping runtime, but its underlying `root_rank` is already `0`; the raw shipping-own-caps replay also gives that same guard move `root_rank=0`.
- Later supersession: selected rank under the raw shipping-own-caps replay, not root rank, did become a safe separator. The promoted follow-up only keeps that replay when the move is the top scored focused candidate; the Normal sibling is `selected_rank=0`, while the retained vulnerable guard stays `selected_rank=4`.
- Durable outcome: do not reopen the negative-deny white search-order family with another runtime gate based on `root_rank == 0`. The useful layer is the scored focused selected rank after the exact capped replay, not the underlying root rank.

## Sampled Late-Ply Repair Wave

- No promotable challenger came out of this wave. The kept runtime package repaired several stable retained late Normal/Fast seams around `frontier_pro_v2_guarded`, but sampled `pro-reliability` still failed at Pro `1.0000`, Normal `0.9167`, Fast `0.8333`, with confidence `0.9998 / 0.9968 / 0.9807`; frontier average move times were `151.76ms / 190.31ms / 170.39ms`.
- The useful local repairs that survived retained replay were narrow: black late search/head-accept Normal guards, a black turn-six vulnerable-progress mana override, an early black setup-branch legacy spirit override, and a white turn-start spirit-setup head blocker. Those changes fixed the sampled retained boards they were derived from.
- Promotion still died on rotated late-ply sampled boards. The remaining sampled blockers at the end of the wave were Normal `outer_edge_mana_rows` and Fast `alternating_mana_rows` plus `forward_bridge_mana_rows`.
- The clean reproducible live blockers were deeper late-ply search/head splits, not the earlier retained seams:
  - Normal black late search board: frontier approved quiet `l1,6;l1,5` while shipping stayed on `l2,6;l3,7`.
  - Fast white branch head-accept board: frontier accepted `l9,6;l7,4;l7,3` over the advisor-approved shipping root `l9,6;l7,6;l7,7`.
- One traced Fast black nonwin was not safe to keep as retained coverage. The copied board snapshot did not reproduce the live shipping-selected root on a clean retained replay and collapsed back to frontier instead.
- Durable outcome: when sampled losses rotate into late-ply boards, keep only the stable retained repairs and archive the reproducibility rule. Do not retain copied `first_diff_ply` boards unless the retained harness reproduces the same final shipping-selected root.

## Black Alternating Retained Engine-Disabled Structure Wave

- No new runtime challenger survived this wave. The kept diagnostic is `black_alternating_vs_retained_engine_disabled_fast_structure_probe`.
- The useful result is that the singleton Fast `alternating_mana_rows` seam `l0,10;l0,9` vs shipping `l4,0;l5,0;mb` is not covered by the nearby retained black engine-disabled package.
- `BLACK_BRIDGE_NONWIN_DUEL_FAST` only matches at the coarse `window=0/deny=0` singleton-shortlist `ManaTempo` surface. On that retained board, frontier accepts `l1,6;l2,7` and still collapses to engine-disabled mana `l4,1;l5,0;mb`, matching shipping in the final selector.
- `BLACK_ENGINE_DISABLED_DUEL_FAST` is different again: it is a dense-shortlist `SpiritImpact` preserved-representative board where frontier and shipping both keep `l1,5;l2,3;l1,2` and no accepted head survives.
- Durable outcome: do not extend the retained black bridge or engine-disabled Fast controls into `alternating_mana_rows` just because they share `window=0/deny=0` or an engine-disabled shipping finish. The live seam is a pure `ManaTempo` `ApprovedReplyRiskGuard` board where frontier never collapses off the approved root.

## Outer Edge Forward Bridge Shared Head Surface Wave

- No new runtime challenger survived this wave. The kept diagnostics are the direct widened replays:
  - `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows` with `smart_automove_pro_reliability_nonwin_trace_probe`, `duel_filter=vs_shipping_normal`, `repeats=6`, `games=3`
  - `SMART_AUTOMOVE_VARIANTS=forward_bridge_mana_rows` with `smart_automove_pro_reliability_nonwin_trace_probe`, `duel_filter=vs_shipping_fast`, `repeats=4`, `games=3`
- The useful result is that the remaining Normal `outer_edge` and Fast `forward_bridge` residue do not share one head-accept mechanism.
- `outer_edge` widened back to `10` Normal nonwins and split across several surfaces:
  - rejected-head post-search drift: late black `l1,6;l1,5` vs shipping `l2,6;l3,7`
  - rejected-head post-search drift: early white `l10,4;l9,5` vs shipping `l9,4;l8,3`
  - rejected-head post-search drift: early black `l1,4;l2,5` vs shipping `l1,4;l1,6;l2,7`
  - accepted-head post-search drift: repeated black `l2,7;l3,8` vs shipping `l1,5;l0,3;l1,3`
  - accepted-head `search_only_forced_prepass`: white `l9,3;l8,3` vs shipping `l7,2;l6,1`
- `forward_bridge` also logged `10` Fast nonwins, but it stayed a different mixed spirit/setup bucket:
  - repeated white accepted-head pair `l9,6;l7,4;l7,3` vs shipping `l9,6;l7,6;l7,7`
  - safe-progress approval seam `l9,6;l8,7` vs shipping `l9,6;l7,7;l8,8`
  - fallback/setup seam `l9,7;l8,6` vs shipping `l9,7;l7,6;l7,7`
  - extra white setup drift `l9,5;l9,6` vs shipping `l7,3;l6,2`
  - black setup drift `l7,1;l9,3` vs shipping `l1,5;l3,4;l2,3`
- Durable outcome: do not reopen a shared `outer_edge` plus `forward_bridge` head-accept patch. One repeated accepted-head pair still exists inside `forward_bridge`, but the widened `outer_edge` replay no longer supports a single shared head surface.

## White Outer Edge Harvest Structure Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_outer_edge_forced_prepass_vs_retained_harvest_structure_probe`.
- The useful result is that retained `primary_white_harvest_loss_c_ply24` is not an extension candidate for the white `outer_edge_mana_rows` forced-prepass seam.
- The traced live board had looked adjacent because the trace logged shipping `l7,2;l6,1`. On a clean direct probe, that exact move only survived at `pre_accept`: both frontier and shipping collapsed to `search_only_forced_prepass` with final selected `l9,3;l8,3`, no head, and no advisor decision.
- The retained harvest board is a different surface entirely: Pro mode, `window=2/deny=2`, attack-enabled, shortlist-live `SafeSupermanaProgress l7,2;l6,1` approved through `ApprovedReplyRiskGuard`, with frontier rejecting non-progress head `l8,5;l7,4`.
- Durable outcome: do not spend on the white `outer_edge` forced-prepass seam by extending the retained harvest control. The exact move overlap was only a `pre_accept` coincidence, not a stable shared selector surface.

## Black Outer Edge Early Recovery Repro Wave

- No new runtime challenger survived this wave. The kept diagnostic is `black_outer_edge_early_recovery_structure_probe`.
- The useful result is that the copied singleton early-black `outer_edge` boards are not stable local seams.
- The copied `l1,4;l2,4` vs `l0,5;l1,6` board did not replay the traced drift. On a clean direct probe, both frontier and shipping collapsed to engine-disabled `l0,5;l1,6`.
- The copied `l1,4;l2,5` vs `l1,4;l1,6;l2,7` board also failed reproduction. On a clean direct probe, both frontier and shipping instead collapsed to engine-disabled `l1,5;l2,7;l3,8`, so even the traced shipping final did not survive.
- Durable outcome: do not spend on copied singleton early-black `outer_edge` seams until they reproduce cleanly. If the copied board collapses to shared shipping or to a different shared final, it is not a defensible local runtime target and it is not a good retained-extension anchor.

## Black Alternating Late Fast Recovery Repro Wave

- No new runtime challenger survived this wave. The kept diagnostics were:
  - `SMART_AUTOMOVE_VARIANTS=alternating_mana_rows` with `smart_automove_pro_reliability_nonwin_trace_probe`, `duel_filter=vs_shipping_fast`, `repeats=4`, `games=3`
  - `black_alternating_late_fast_recovery_structure_probe`
- The useful result is that the old Fast `alternating` late-fast recovery singleton still exists in the live trace, but its copied board is not stable enough to spend on.
- The replay still logged the seam `l2,5;l0,5;l1,6` vs shipping `l2,5;l4,7;l3,8` on the current Fast corpus.
- The copied board did not replay that seam on a clean direct probe. Both frontier and shipping instead collapsed to shared engine-disabled `l2,5;l4,5;l3,4`, with no head or advisor residue left to compare against retained `BLACK_LATE_FAST_RECOVERY_TRACE`.
- Durable outcome: do not extend the retained late-fast recovery trace into the Fast `alternating` singleton and do not spend runtime code on that copied board until it reproduces cleanly.

## White Forward Bridge Setup Repro Wave

- No new runtime challenger survived this wave. The kept diagnostic is `white_forward_bridge_setup_structure_probe`.
- The useful result is that the copied Fast `forward_bridge` white setup singleton is not a stable local seam.
- The archived singleton had looked like a plausible retained-extension candidate because the widened Fast trace logged `l9,5;l9,6` vs shipping `l7,3;l6,2` and the nearby retained white setup controls live on similar spirit/setup territory.
- On a clean direct probe, that copied board did not replay the traced drift. Both frontier and shipping collapsed to shared engine-disabled `l7,3;l6,2`, with no head or advisor residue left to compare against `WHITE_TURN_FIVE_SPIRIT_SETUP_PRE_ACCEPT_FAST` or `WHITE_LATE_CLUSTER_NONWIN`.
- Durable outcome: do not extend the retained white setup controls into the copied `forward_bridge` singleton and do not spend runtime code on that board until it reproduces cleanly.

## Forward Bridge Low-Budget Guard Scope Wave

- No new runtime challenger survived this wave. The attempted cut disabled `enable_turn_engine_low_budget_guard` only when `game.variant() == GameVariant::ForwardBridgeManaRows`.
- The useful result is that the low-budget guard can be a sampled Fast forward-bridge lever without being a promotable strength lever.
- The candidate passed focused checks and canonical sampled `pro-reliability`: Pro `1.0000`, Normal `0.9167`, Fast `0.9167`; sampled Fast `forward_bridge_mana_rows` moved to `1.0000`, while Normal `outer_edge_mana_rows` and Fast `alternating_mana_rows` remained the sampled weak rows.
- All-variant `pro-reliability-confirm` failed broadly: Pro `0.6458`, Normal `0.7083`, Fast `0.6667`; average move times stayed well below the `700ms` cap, so the failure was strength rather than cost.
- Durable outcome: do not reopen a variant-scoped low-budget guard disable for `ForwardBridgeManaRows`. It overfits sampled forward-bridge and broadens all-variant losses.

## Alternate-Seed All-Blocker Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic was `smart_automove_pro_reliability_duel_trace_probe` with `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows`, `SMART_PRO_RELIABILITY_SEED_TAG=pro_turn_planner_reliability_alt_v1`, `SMART_PRO_RELIABILITY_REPEATS=2`, and `SMART_PRO_RELIABILITY_GAMES=3`.
- The useful result is that the active blocker set still does not hide one repeated move-pair mechanism under a different deterministic seed.
- Pro produced `1` regression, `2` improvements, and `9` flat results; the only regression pair was `l8,8;l7,7` vs `l9,4;l8,3`.
- Normal produced `2` regressions, `5` improvements, and `5` flat results; both regression pairs were singletons: `l10,7;l9,8` vs `l9,6;l10,4;l9,5`, and `l9,6;l8,7` vs `l9,6;l10,5`.
- Fast produced `4` regressions, `3` improvements, and `5` flat results; all four regression pairs were singletons, including the known `forward_bridge` head-accept pair `l9,6;l7,4;l7,3` vs `l9,6;l7,6;l7,7`.
- Durable outcome: do not spend runtime code on alternate-seed singleton pairs from the current blocker variants. Use alternate seeds to prove recurrence, not to chase one-off seams.

## Focused Fast-Blocker Alternate-Seed Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic was `smart_automove_pro_reliability_duel_trace_probe` with `SMART_AUTOMOVE_VARIANTS=alternating_mana_rows,forward_bridge_mana_rows`, `SMART_PRO_RELIABILITY_SEED_TAG=pro_turn_planner_reliability_alt_v2`, `SMART_PRO_RELIABILITY_REPEATS=2`, and `SMART_PRO_RELIABILITY_GAMES=3`.
- The useful result is that narrowing the alternate seed to the two sampled Fast blocker variants still did not recover one stable Fast mechanism.
- Pro produced `3` regressions, `1` improvement, and `8` flat results; all three regression pairs were singletons, including the known `alternating` black `l2,7;l1,6` vs `l2,7;l1,8` pair.
- Normal produced `5` regressions, `3` improvements, and `4` flat results; all five regression pairs were singleton and split across black and white, head-accepted and engine-disabled surfaces.
- Fast produced only `1` regression, `5` improvements, and `6` flat results; its single regression was `l10,5;l9,5` vs `l8,1;l7,0`.
- Durable outcome: do not reopen the sampled Fast blockers from this alternate seed. The focused run argues against a stable `alternating_mana_rows` or `forward_bridge_mana_rows` runtime spend.

## Outer Edge Alt-V2 Normal Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic was `smart_automove_pro_reliability_nonwin_trace_probe` with `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows`, `SMART_PRO_RELIABILITY_DUEL_FILTER=vs_shipping_normal`, `SMART_PRO_RELIABILITY_SEED_TAG=pro_turn_planner_reliability_alt_v2`, `SMART_PRO_RELIABILITY_REPEATS=4`, and `SMART_PRO_RELIABILITY_GAMES=3`.
- The useful result is that the Normal `outer_edge_mana_rows` blocker still does not collapse to one mechanism under a different seed.
- The trace logged `9` nonwins. Two black pairs repeated: late black `l1,6;l1,5` vs shipping `l2,6;l3,7`, and early black accepted-spirit `l1,5;l0,3;l1,3` vs shipping `l1,6;l2,7`.
- The same run also logged singleton white post-search drift, black accepted-head drift, white accepted-head drift, early black engine-disabled drift, and a white safe-progress ordering seam.
- Durable outcome: do not spend on either repeated `outer_edge` black pair as a standalone patch. Repetition inside a trace that still spans colors and selector stages is not promotable evidence.

## Alt-V3 All-Blocker Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic was `smart_automove_pro_reliability_duel_trace_probe` with `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows`, `SMART_PRO_RELIABILITY_SEED_TAG=pro_turn_planner_reliability_alt_v3`, `SMART_PRO_RELIABILITY_REPEATS=3`, and `SMART_PRO_RELIABILITY_GAMES=3`.
- The useful result is that raising the alternate-seed sample to `18` games per duel bucket still did not collapse the active blockers into a shared runtime mechanism.
- Pro produced `5` regressions, `5` improvements, and `8` flat results. Every Pro regression pair was singleton: `l2,5;l3,5` vs `l1,6;l1,5`, `l9,2;l8,2` vs `l9,2;l8,1`, `l9,4;l8,3` vs `l7,5;l6,4`, `l9,3;l8,2` vs `l7,2;l6,1`, and `l0,5;l1,4` vs `l0,5;l1,5`.
- Normal produced `4` regressions, `3` improvements, and `11` flat results. Only one pair repeated, black `l2,3;l3,3` vs shipping `l2,3;l3,2` (`2x`), while `l8,5;l7,3;l6,4` vs `l8,5;l6,5;l6,4` and `l1,6;l2,5` vs `l1,6;l2,6` stayed singleton.
- Fast produced `2` regressions, `4` improvements, and `12` flat results. Both Fast regression pairs were singleton: white `l10,4;l9,3` vs shipping `l9,5;l7,6;l8,7` and black `l2,4;l4,5;l3,6` vs shipping `l2,4;l3,2;l2,2`.
- Durable outcome: do not spend on the Normal black `l2,3;l3,3` pair as a standalone patch. The broader trace still balances regressions with improvements and keeps Pro/Fast singleton-only, so the blocker set remains mixed rather than promotable.

## Alt-V3 Normal Hotspot Follow-Up

- No runtime challenger survived this wave. A temporary diagnostic case was added to `smart_automove_pro_reliability_hotspot_probe` for the repeated Normal black board from the alt-v3 trace, then removed before commit.
- The useful result is that the repeated pair `l2,3;l3,3` vs shipping `l2,3;l3,2` is not a root-pool availability seam. Frontier and shipping both enumerated `10,941` selector children with identical shortlist/full-pass counts.
- The actual split was the known frontier-extra-work shape: frontier selected `l2,3;l3,3` through `engine_post_search`, shipping selected `l2,3;l3,2` through `engine_disabled`, and frontier paid extra exact/engine work (`payload_calls +163,990`, `pickup_calls +6,177`, `secure_mana_calls +1,784`, `tactical_spirit_calls +2,914`, engine accepted `6` vs `1`).
- Durable outcome: do not reopen the alt-v3 Normal black pair through root-pool widening, shortlist widening, or generic exact-cost reduction. The board reproduces a known hotspot false lead inside an already mixed all-blocker trace.

## Env-Driven Hotspot Probe Hook

- No runtime challenger was attempted in this wave. The kept code is diagnostic-only under the ignored test harness.
- `smart_automove_pro_reliability_hotspot_probe` now accepts one extra ad-hoc board through `SMART_PRO_RELIABILITY_HOTSPOT_FEN`, with optional `SMART_PRO_RELIABILITY_HOTSPOT_LABEL` and `SMART_PRO_RELIABILITY_HOTSPOT_MODE`.
- The hook was validated by rerunning the alt-v3 Normal black board without a temporary source case. It reproduced the previous no-go: frontier `l2,3;l3,3`, shipping `l2,3;l3,2`, identical `10,941` selector children, and frontier-only extra `engine_post_search`/exact work.
- Durable outcome: use the env hook for future one-off hotspot inspections instead of adding and later removing ad-hoc probe cases.

## Alt-V4 All-Blocker Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic was `smart_automove_pro_reliability_duel_trace_probe` with `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows`, `SMART_PRO_RELIABILITY_SEED_TAG=pro_turn_planner_reliability_alt_v4`, `SMART_PRO_RELIABILITY_REPEATS=3`, and `SMART_PRO_RELIABILITY_GAMES=3`.
- The useful result is that another fresh deterministic seed still did not collapse the active blockers into one promotable mechanism.
- Pro produced `3` regressions, `3` improvements, and `12` flat results. One pair repeated, black `l2,7;l3,8` vs shipping `l1,5;l0,3;l1,3` (`2x`), while white `l8,7;l7,7` vs shipping `l5,10;l4,10` stayed singleton.
- Normal produced `5` regressions, `2` improvements, and `11` flat results. One pair repeated, the already-archived black `l2,7;l1,6` vs shipping `l2,7;l1,8` recovery jump (`2x`), while `l0,5;l1,4` vs `l1,6;l0,6`, `l2,3;l3,3` vs `l2,3;l3,2`, and `l9,4;l9,3` vs `l9,4;l8,3` stayed singleton.
- Fast produced `4` regressions, `3` improvements, and `11` flat results. Every Fast regression pair was singleton.
- The env-driven hotspot hook was used on the repeated Pro black pair. Frontier selected `l2,7;l3,8` through `engine_post_search`, shipping stayed engine-disabled on `l1,5;l0,3;l1,3`, frontier accepted `23` engine heads vs shipping `0`, and frontier expanded more selector children (`12,473` vs `11,612`). That is extra frontier search/selector work inside a balanced mixed trace, not a clean root-pool or shortlist repair.
- Kept code outcome: `smart_automove_pro_reliability_duel_trace_probe` now accepts `SMART_PRO_RELIABILITY_DUEL_FILTER`, matching the existing nonwin trace filter and avoiding full three-bucket runs when only one duel bucket needs recurrence evidence.
- Durable outcome: do not reopen either alt-v4 repeated pair as a standalone patch. Use filtered duel traces for future focused recurrence checks, then hotspot only the repeated board if the surrounding bucket is also promotable-looking.

## Alt-V5 Focused Fast-Blocker Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic used the filtered duel trace path: `smart_automove_pro_reliability_duel_trace_probe` with `SMART_AUTOMOVE_VARIANTS=alternating_mana_rows,forward_bridge_mana_rows`, `SMART_PRO_RELIABILITY_DUEL_FILTER=vs_shipping_fast`, `SMART_PRO_RELIABILITY_SEED_TAG=pro_turn_planner_reliability_alt_v5_fast_focus`, `SMART_PRO_RELIABILITY_REPEATS=4`, and `SMART_PRO_RELIABILITY_GAMES=3`.
- The useful result is that the focused Fast blocker bucket still did not produce one repeated mechanism. Across `24` Fast games, the trace produced `4` regressions, `6` improvements, and `14` flat results.
- Every regression move pair was singleton: white `l10,3;l9,2` vs `l10,3;l9,3`, white `l10,4;l9,4` vs `l9,3;l8,2`, black `l2,5;l4,3;l3,2` vs `l2,5;l4,3;l3,3`, and white `l9,4;l8,4` vs `l9,4;l8,3`.
- The printed regressions split across white safe-progress/mana ordering and black spirit/setup surfaces. There was no repeated board worth sending to the hotspot probe and no runtime code was changed.
- Durable outcome: do not spend on the alt-v5 focused Fast singleton pairs. The filtered trace path is useful for cheap recurrence checks, but this seed gives no promotable Fast repair.

## Alt-V5 Focused Normal Outer-Edge Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic used `smart_automove_pro_reliability_duel_trace_probe` with `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows`, `SMART_PRO_RELIABILITY_DUEL_FILTER=vs_shipping_normal`, `SMART_PRO_RELIABILITY_SEED_TAG=pro_turn_planner_reliability_alt_v5_normal_focus`, `SMART_PRO_RELIABILITY_REPEATS=4`, and `SMART_PRO_RELIABILITY_GAMES=3`.
- The useful result is that the focused Normal `outer_edge_mana_rows` bucket still did not produce one repeated mechanism. Across `24` Normal games, the trace produced `3` regressions, `5` improvements, and `16` flat results.
- Every regression move pair was singleton: black `l1,4;l2,5` vs `l1,4;l1,6;l2,7`, black `l1,5;l0,3;l1,3` vs `l1,6;l2,7`, and white `l9,4;l8,3` vs `l9,6;l9,8;l8,8`.
- The printed regressions split across white safe-progress over spirit setup, black spirit head-accept over mana, and early black mana-vs-spirit setup ordering. There was no repeated board worth hotspotting and no runtime code was changed.
- Durable outcome: do not spend on the alt-v5 focused Normal singleton pairs. This seed again argues that `outer_edge_mana_rows` is not currently exposing a promotable standalone repair.

## Sampled Gate Refresh After Alt-V5 Focused Traces

- No runtime challenger was attempted in this wave. A clean `runtime-preflight` passed, then sampled `pro-reliability` was rerun for retained `frontier_pro_v2_guarded` against `shipping_pro_search`.
- Promotion failed. Pro passed at win rate `1.0000`, confidence `0.9998`, and frontier average `154.74ms`; Normal was below the confidence target at `0.9167`, `0.9968`, `192.00ms`; Fast failed at `0.8333`, `0.9807`, `172.51ms`.
- The weak variant rows were the same as before: Normal `outer_edge_mana_rows` at `0.5000`, Fast `alternating_mana_rows` at `0.5000`, and Fast `forward_bridge_mana_rows` at `0.5000`.
- Durable outcome: the focused alt-v5 singleton-only traces did not make the retained frontier promotable. Keep runtime code untouched until a focused probe exposes a repeated mechanism under one of those three weak rows.

## Focused Fast Nonwin Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic was `smart_automove_pro_reliability_nonwin_trace_probe` with `SMART_AUTOMOVE_VARIANTS=alternating_mana_rows,forward_bridge_mana_rows`, `SMART_PRO_RELIABILITY_DUEL_FILTER=vs_shipping_fast`, `SMART_PRO_RELIABILITY_REPEATS=3`, and `SMART_PRO_RELIABILITY_GAMES=2`.
- The useful result is that targeting the exact failed Fast rows by frontier nonwins still did not collapse to one mechanism. The trace logged `5` nonwins and all printed move pairs were singleton.
- The nonwins were black `l0,10;l0,9` vs shipping `l4,0;l5,0;mb`, white `l9,6;l8,7` vs shipping `l9,6;l7,7;l8,8`, black `l0,6;l1,6` vs shipping `l2,3;l3,4`, black `l2,5;l0,5;l1,6` vs shipping `l2,5;l4,7;l3,8`, and white `l9,6;l7,4;l7,3` vs shipping `l9,6;l7,6;l7,7`.
- Durable outcome: do not spend runtime code on this focused Fast nonwin set. It spans already-known singleton black bridge/mana, black setup, black late recovery, white safe-progress, and white head-accept surfaces.

## Focused Normal Nonwin Trace Wave

- No runtime challenger was attempted in this wave. The diagnostic was `smart_automove_pro_reliability_nonwin_trace_probe` with `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows`, `SMART_PRO_RELIABILITY_DUEL_FILTER=vs_shipping_normal`, `SMART_PRO_RELIABILITY_REPEATS=3`, and `SMART_PRO_RELIABILITY_GAMES=2`.
- The useful result is that the exact failed Normal row still did not produce one repair mechanism. The trace logged only `2` nonwins, both singleton and different.
- The nonwins were late black `l1,6;l1,5` vs shipping `l2,6;l3,7`, and early white `l10,4;l9,5` vs shipping `l9,4;l8,3`. In both games, shipping also lost, so these are not direct frontier-only win blockers.
- Durable outcome: do not spend runtime code on this focused Normal nonwin set. It is too small, split across different first-diff surfaces, and not enough to explain the sampled gate failure by one local repair.

## Active Context-Shipping Row Gate Wave

- No runtime challenger survived this wave. Temporary test-only sweep candidates were removed before commit.
- The diagnostics compared `frontier_pro_v2_guarded`, `frontier_pro_v2_raw`, and `shipping_pro_search_control` through `smart_automove_pro_profile_attribution_probe` on the active-blocker seed with `SMART_AUTOMOVE_VARIANTS=outer_edge_mana_rows,alternating_mana_rows,forward_bridge_mana_rows`, then checked candidates through `smart_automove_pro_promotion_dashboard_probe` with `SMART_PRO_DASHBOARD_PANEL_FILTER=active_blockers`.
- Guarded-vs-raw attribution on isolated `outer_edge_mana_rows` produced only one outcome split: a raw-better Normal white turn-three move with action unavailable, mana available, `window=0`, `deny=0`, and `drainer_safety=-1`. It did not explain why raw later loses active Pro/Fast `outer_edge_mana_rows`.
- Shipping-control-vs-raw attribution over the full active blockers showed raw harms active `outer_edge_mana_rows` in Pro/Fast on action-plus-mana states with `window=0`, `deny=0`, and `drainer_safety=2`, while raw's useful Normal evidence was not isolated by the same feature.
- A row composite using raw ProV2 for `outer_edge_mana_rows` was not promotable: active Pro `2-4`, active Normal `5-1`, active Fast `4-2`. The exact-context shipping fallback variant repaired active Fast to `6-0`, but active Pro stayed at `3-3` and active Normal stayed at `5-1`.
- Broadening the `forward_bridge_mana_rows` white turn-three shipping fallback to the full mana-available `window=0` / `deny=0` / `drainer_safety=-1` context did not move active Pro; it remained `3-3`.
- Durable outcome: do not continue first-divergence context-shipping gates on the sampled-pass row composite. They can align individual early moves and clean up active Fast, but they have not improved the active Pro outcome. The next spend needs either arbitrary-candidate decision-record/nonwin tracing or a genuinely new utility feature that clears active Pro and sampled Pro together.

## Sweep-Candidate Decision Record Harness Wave

- No runtime challenger survived this wave. The retained work is diagnostic-only under the ignored test harness.
- `smart_automove_pro_sweep_decision_record_probe` now compares any registered `ProProfileSweepCandidate` against a same-seed `shipping_pro_search_control` replay and aggregates either nonwins or outcome deltas. The runner exposes it as `./scripts/run-automove-experiment.sh pro-sweep-decision-record <candidate>`.
- The probe was smoke-validated on `frontier_pro_v2_guarded` with a tiny Fast `alternating_mana_rows` slice, then used on the active-blocker panel for guarded. Active guarded remained mixed: Pro had `3/6` candidate nonwins, Normal had `1/6`, and Fast had `4/6`. Fast had two `outer_edge_mana_rows` regressions on action-plus-mana `window=0` / `deny=0` / `drainer_safety=2`, plus one `forward_bridge_mana_rows` regression and one `alternating_mana_rows` flat nonwin.
- The same harness checked raw ProV2's canonical sampled Pro failure. Raw produced `7/12` nonwins across `alternating_mana_rows`, `center_spoke_mana_rows`, `forward_bridge_mana_rows`, `split_flank_mana_rows`, and `inner_wedge_mana_rows`. The two regressions were singleton contexts: `forward_bridge_mana_rows` white turn one and `inner_wedge_mana_rows` black turn two.
- Durable outcome: raw's sampled Pro failure is still not a one-feature rescue target, and active guarded still does not justify another context-shipping patch. Use the new sweep-candidate decision record stage to kill singleton-heavy candidates before writing runtime code.

## ProV3 Utility Switch Active Fast No-Go

- No runtime challenger survived this wave. A temporary test-only sweep candidate preserved guarded wrapper branches and only overrode `frontier_execute` roots when a safe candidate had non-worse primary utility axes inside a guarded score window of `96`.
- The active Fast dashboard killed the candidate before sampled validation. Against shipping Fast it scored `4-2`, but `outer_edge_mana_rows` was `0-2`, so it did not solve the active blocker set.
- The same active panel against current guarded scored only `2-4`. It improved `outer_edge_mana_rows` to `2-0`, but lost `alternating_mana_rows` and `forward_bridge_mana_rows` at `0-2` each.
- The tighter guard variants (`no_alt_inner`, stable-openings) were not run because the base failure already showed the tradeoff: the score-window switch helps active `outer_edge` against guarded, still loses active `outer_edge` against shipping, and harms the two other active Fast rows against guarded.
- Durable outcome: do not retry score-window utility switches, surface-gain tie breakers, or guarded-wrapper-preserved utility overrides as the next Pro challenger. The next utility feature must explain this row tradeoff before any runtime edit is worth keeping.

## No-Late-Black Fallback Active Dashboard Refresh

- No runtime challenger survived this wave. The existing test-only `frontier_pro_v2_no_late_black_fallback` candidate was rerun through `smart_automove_pro_promotion_dashboard_probe` with `SMART_PRO_DASHBOARD_PANEL_FILTER=active_blockers`.
- The refreshed active shipping panel failed broadly: Pro `3-3`, Normal `5-1`, Fast `3-3`. Pro and Fast both had `outer_edge_mana_rows` at `0-2`; Normal split `alternating_mana_rows` at `1-1`.
- Candidate-vs-guarded was also only a mixed tradeoff: `4-2` overall, with `outer_edge_mana_rows` and `forward_bridge_mana_rows` both split `1-1`, and only `alternating_mana_rows` at `2-0`.
- Durable outcome: do not use no-late-black fallback as a current structural baseline or near-promotion scaffold. It no longer has an active panel shape worth tracing further unless a new decision-record aggregate exposes a repeated mechanism under the active `outer_edge` losses.

## Iterdeep Row Composite Active Refresh

- No runtime challenger survived this refresh. The sampled-pass guarded iterative-deepening row composite was recreated only as a test-only diagnostic scaffold: guarded iterative deepening by default, raw ProV2 for `offset_arc_mana_rows`, alpha-window iterative deepening plus `1.25x` nodes for `inner_wedge_mana_rows`, and offset-1 plus `1.25x` nodes for `outer_edge_mana_rows`, `forward_bridge_mana_rows`, and `corner_chain_mana_rows`.
- The active-blocker dashboard killed the recreated composite again: vs shipping Pro `3-3`, Normal `3-3`, Fast `5-1`; vs guarded `5-1`. All active Pro variants split `1-1`, active Normal `outer_edge_mana_rows` stayed `0-2`, and active Fast still split `outer_edge_mana_rows`.
- A narrow outer-edge context-shipping repair did not make the line promotable. It improved active Normal to `4-2`, but active Pro stayed `3-3` and Fast stayed `5-1`.
- Decision-record follow-up showed no single repair surface: active Pro nonwins split across `outer_edge_mana_rows` flat, `alternating_mana_rows` flat, and a `forward_bridge_mana_rows` early-white-fallback regression.
- Durable outcome: do not spend another iteration on the sampled-pass iterative-deepening row composite or outer-edge context-shipping repair. The next challenger needs a new ProV3 utility feature or structural selector that clears sampled Pro and active Pro together rather than rotating the active blocker rows across opponent modes.

## Exact Evidence And Portfolio Scout No-Go

- No runtime challenger survived this wave. Temporary test-only sweep candidates were removed before commit.
- Full exact static evaluation and root exact tactics were stopped as cost failures before producing useful active-panel evidence.
- Broad exact-lite checks did finish the active Pro row but failed immediately: `4-2` overall, with `outer_edge_mana_rows` and `forward_bridge_mana_rows` both split `1-1`.
- Guarded/raw/shipping portfolio majority was too expensive and still failed active Pro: `3-3` overall, `outer_edge_mana_rows` `0-2`, average candidate move time `356.18ms`.
- Raw-on-divergence was also killed on active Pro: `2-4` overall, `outer_edge_mana_rows` `0-2`, average candidate move time `255.32ms`.
- Durable outcome: do not continue exact-evidence toggles or multi-search guarded/raw/shipping agreement portfolios as the next challenger. They either hit cost before strength or reproduce the active Pro `outer_edge_mana_rows` failure before sampled validation is worth running.

## ProV3 Reply-Risk Selector Scout No-Go

- No runtime challenger survived this wave. Temporary test-only sweep candidates were removed before commit.
- `frontier_pro_v3_reply_floor_utility` preserved guarded wrapper branches and only reconsidered `frontier_execute` roots with better reply-floor safety plus comparable `TurnEngineUtility`. The active Pro dashboard killed it immediately: `3-3` overall, `outer_edge_mana_rows` `0-2`, `alternating_mana_rows` `1-1`, `forward_bridge_mana_rows` `2-0`, average `212.86ms`.
- The active Pro decision record showed the reply-floor scout did not address the sharp opening regression. The remaining `outer_edge_mana_rows` loss still diverged on black turn two through `frontier_execute` / `engine_post_search`, `l0,5;l1,6` vs shipping `l0,4;l1,5`.
- `frontier_pro_v3_ranked_reply_guard` only changed roots when the advisor approved guarded through `ApprovedReplyRiskGuard` and a safer, better-ranked shortlist root had comparable utility. It improved active Pro to `4-2`, removed candidate regressions against shipping on that slice, and moved `outer_edge_mana_rows` from `0-2` to `1-1`.
- The ranked reply-guard line still failed the full active dashboard: Pro `4-2`, Normal `5-1`, Fast `2-4`. Fast `outer_edge_mana_rows` remained `0-2`, while Pro still had flat losses on `outer_edge_mana_rows` and `alternating_mana_rows` where shipping also lost.
- Durable outcome: do not retry reply-floor-only switching or generic ranked `ApprovedReplyRiskGuard` deference. Rank deference is a useful diagnostic signal for the active Pro `outer_edge` regression, but by itself it rotates the active panel and does not supply the missing winning policy for flat Pro/Fast losses.

## ProV3 Pressure And Dirty Reply-Risk No-Go

- No runtime challenger survived this wave. Temporary test-only sweep candidates were removed before commit.
- `frontier_pro_v3_pressure_blend` treated advisor ordered and preserved roots as one pool, then tried to override `ApprovedReplyRiskGuard` selections when a safe root had stronger concrete pressure features: scoring windows, mana progress, pickups, or spirit setup. The active Pro dashboard killed it at `3-3`, with `outer_edge_mana_rows` still `0-2`, `alternating_mana_rows` `1-1`, and `forward_bridge_mana_rows` `2-0`.
- `frontier_pro_v3_dirty_reply_roots` disabled `prefer_clean_reply_risk_roots` under the guarded ProV2 config. It made the active Pro panel worse: `2-4` overall, `outer_edge_mana_rows` `0-2`, `alternating_mana_rows` `1-1`, and `forward_bridge_mana_rows` `1-1`.
- Durable outcome: do not retry pressure-blend scoring over advisor ordered/preserved roots or dirty reply-risk root preference toggles. They fail before sampled validation and do not address the active Pro `outer_edge_mana_rows` blocker.

## Black Turn-Two And White Head Active Scout No-Go

- No runtime challenger survived this wave. Temporary test-only sweep candidates were removed before commit.
- `frontier_pro_v3_black_t2_action_mana_fallback` preserved guarded ProV2 except for black turn two with one mon move already spent and both action and mana available, where it mirrored retained shipping search.
- The active Pro dashboard improved but still failed: `4-2` overall, `outer_edge_mana_rows` `1-1`, `alternating_mana_rows` `1-1`, and `forward_bridge_mana_rows` `2-0`.
- Sweep decision records on the same active Pro seed showed no remaining candidate regressions. The two remaining nonwins were flat losses where shipping also lost: white turn five `outer_edge_mana_rows`, `window=1`, `deny=1`, rejected `SpiritImpact` head; and white turn three `alternating_mana_rows`, mana-only, `window=0`, `deny=0`, rejected `SafeOpponentManaProgress` head.
- `frontier_pro_v3_black_t2_plus_white_head` kept the black turn-two fallback and returned the retained ProV2 rejected head on those two white flat-loss shapes. It improved active Pro to `5-1` and active Normal to `5-1`, with active Pro `outer_edge_mana_rows` fixed to `2-0`.
- The same head scout collapsed active Fast to `1-5`: `outer_edge_mana_rows` `0-2`, `alternating_mana_rows` `0-2`, and `forward_bridge_mana_rows` `1-1`. Fast decision records split across white and black `frontier_execute` contexts, including regressions where shipping control won and flat losses where shipping also lost.
- Durable outcome: black turn-two shipping fallback and scoped white rejected-head acceptance are useful diagnostic signals but not promotable mechanisms. They rotate the active panel across opponent modes and still lack a winning policy for active Fast flats, so do not spend runtime code on these gates without a broader selector feature that clears Fast at the same time.

## Variant-Scoped White Head Scout No-Go

- No runtime challenger survived this wave. Temporary test-only sweep candidates were removed before commit.
- The rerun first measured `frontier_pro_v3_black_t2_action_mana_fallback` across the full active dashboard instead of only Pro. It failed at Pro `4-2`, Normal `5-1`, and Fast `2-4`; Fast `outer_edge_mana_rows` was still `0-2`.
- `frontier_pro_v3_black_t2_plus_outer_edge_head` added only the outer-edge white turn-five rejected-head case. It was behaviorally identical on the active dashboard: Pro `4-2`, Normal `5-1`, Fast `2-4`.
- `frontier_pro_v3_black_t2_plus_alternating_head` added only the alternating white turn-three mana-only rejected-head case. It was also behaviorally identical: Pro `4-2`, Normal `5-1`, Fast `2-4`.
- Durable outcome: narrowing the white-head layer by variant does not recover the previous broad-head Pro/Normal improvement and does not help active Fast. Do not keep spending on variant-scoped rejected-head gates in this family.

## Guarded Preaccept Utility Floor No-Go

- No runtime challenger survived this wave. A temporary test-only sweep candidate preserved guarded wrapper branches, then only on `frontier_execute` replaced an accepted head with the preaccept root when that preaccept root was legacy-selected or legacy-full-pool-selected, non-vulnerable, and not worse on primary `TurnEngineUtility` axes.
- The retained decision-record aggregate before the candidate stayed mixed. Sampled retained decisions had no Pro regressions but still showed a Normal nonwin and Fast regressions split across `outer_edge_mana_rows`, `alternating_mana_rows`, and `forward_bridge_mana_rows`. The active-blocker aggregate split across rejected-head, accepted-head, advisor-approved, legacy, and candidate-live statuses, so there was no single preaccept mechanism.
- The active dashboard killed the candidate before sampled validation: vs shipping Pro `3-3`, Normal `5-1`, Fast `2-4`; vs guarded `3-3`. Pro and Fast both left `outer_edge_mana_rows` at `0-2`, while active Fast also split `alternating_mana_rows` and `forward_bridge_mana_rows` at `1-1`.
- Average move time rose to roughly `217ms` Pro, `295ms` Normal, and `282ms` Fast on the active dashboard, so the candidate added cost without creating a promotable row.
- Durable outcome: do not retry generic head/root utility-floor or legacy preaccept vetoes. The remaining blocker requires a new utility feature that explains when head acceptance, reply-risk approval, and preaccept preservation are one-sided across sampled and active Pro/Normal/Fast; replaying legacy preaccept roots is not that feature.

## Expanded Policy-Winner Active Refresh No-Go

- No runtime challenger survived this wave. The run was diagnostic-only through `smart_automove_pro_policy_winner_probe` with the expanded portfolio: retained guarded, alternating-white edge mana, white-opening utility mana, shipping-control, raw ProV2, no-selected-followup, full-scored reply guard, and no-low-budget.
- The active-blocker panel still showed oracle coverage but not selector shape: Pro had `3` guarded baseline wins and `3` policy wins, Normal `5` / `1`, and Fast `2` / `4`, with `no_policy_wins=0` in all three duels.
- The policy wins conflict by opponent mode. Active Pro wants full-scored reply guard for white `outer_edge_mana_rows` turn three under action+mana, `window=0`, `deny=0`, and `drainer_safety=2`; active Fast wants shipping-control on a matching white `outer_edge_mana_rows` context. Fast also needs shipping-control for black outer-edge and white forward-bridge, plus raw ProV2 only for a black alternating late-fallback row.
- Durable outcome: the expanded policy portfolio is an oracle diagnostic, not a promotable selector. Do not build another static active policy-winner selector over these labels; add a new utility/root-evaluation feature first, then use panel-filtered policy-winner runs to check whether the new policy separates Pro/Normal/Fast instead of memorizing row openings.

## Dual-Progress Spirit Feature No-Go

- No runtime challenger survived this wave. Temporary test-only candidates were removed before commit.
- Forced-root oracles on the active white `outer_edge_mana_rows` Pro/Fast conflict were later corrected for full-opening horizon. The original unadjusted probe granted a fresh 96 plies from first-diff boards and overstated wins at `12/16` Pro and `15/16` Fast. With `SMART_PRO_FORCED_ROOT_ORACLE_START_PLY` set to the recorded first-diff ply, the same boards are `8/16` Pro and `9/16` Fast, and the guarded-selected roots reproduce the full-opening losses.
- A direct dual-progress SpiritImpact preference selected safe `SpiritImpact` roots with both `supermana_progress` and `opponent_mana_progress` plus short safe paths. It failed the active dashboard at Pro `3-3`, Normal `5-1`, Fast `3-3`; Pro `outer_edge_mana_rows` stayed `0-2`, while Fast split every blocker variant at `1-1`.
- A dual-progress-triggered shipping fallback was worse on Pro and still not promotable: active Pro `2-4`, Normal `5-1`, Fast `3-3`. It improved the guarded delta on `outer_edge_mana_rows`, but not the shipping-strength gate.
- Durable outcome: do not use dual-progress SpiritImpact as the next shared utility feature or as a shipping-fallback trigger. It is another active Normal/guarded-delta repair that leaves active Pro and Fast blocker strength unresolved.

## Policy Matrix Mechanism-Class And Fallback Relaxation No-Go

- No runtime challenger survived this wave. The retained source change is harness-only: `smart_automove_pro_policy_matrix_probe` can now emit `PRO_POLICY_MATRIX_MECHANISM_CLASS` when `SMART_PRO_POLICY_MATRIX_INCLUDE_MECHANISM_CLASS=true`.
- A broad active Fast full-portfolio matrix with mechanism classes was stopped for cost after printing only the first record. Keep this flag on filtered panel/duel/candidate slices until a cheap run shows a mechanism worth widening.
- The first completed narrow run used the active-blocker Fast slice with guarded as baseline and `shipping_pro_search_control` plus raw ProV2 as candidates. Shipping control was mixed (`candidate_better=3`, `baseline_better=1`), while raw ProV2 was non-regressing on the slice (`candidate_better=2`, `baseline_better=0`).
- The raw gains came from bypassing guarded wrapper fallbacks: one early-white fallback and one late-black shipping fallback. That made fallback relaxation look plausible but also matched a historically risky selector family.
- A temporary test-only candidate relaxed only those two surfaces: white turn-one start used a safe quiet mana-utility root, and black turn-four weak-window action+mana used raw guarded-config frontier. The sampled dashboard killed it immediately against shipping Pro at `7-5` (`0.5833`, confidence `0.6128`), with weak rows spread across `center_spoke_mana_rows`, `alternating_mana_rows`, `inner_wedge_mana_rows`, and `forward_bridge_mana_rows`. The remaining Normal/Fast sampled work was stopped and the source candidate was discarded.
- Durable outcome: `PRO_POLICY_MATRIX_MECHANISM_CLASS` is useful for narrowing which candidate deltas deserve a focused probe, but active Fast raw fallback wins are not enough to relax guarded fallbacks. Do not retry early-white or late-black fallback removal unless a new utility/root-evaluation feature first clears sampled Pro/Normal/Fast.

## Live Board Compression And Sweep Surface Prune

- The live board was compressed back to current reset state, reset portfolio, next commands, stoplight rules, and a short no-go summary. Historical probe diaries remain in this archive and in `docs/automove-knowledge.md`.
- No runtime behavior changed. Public Pro still routes through `frontier_pro_v2_guarded`, and `shipping_pro_search` remains the retained search-only baseline.
- Stale test-only sweep candidates were removed from the active experiment runner: `frontier_pro_v2_no_late_black_fallback`, `frontier_pro_v2_head_rerank`, `frontier_pro_v2_no_spirit_family`, `frontier_pro_v2_no_mid_tactical_guard`, and `frontier_pro_v2_expansion_224`.
- The retained reset portfolio remains guarded, alternating-white edge mana, white-opening utility mana, shipping-control, raw ProV2, no-selected-followup, full-scored reply guard, and no-low-budget.
- Durable outcome: future agents should treat removed candidate IDs as archived evidence only. Recreate a pruned surface only as a new, named test-only candidate after outcome-corpus or ProV4 evidence shows a clean mechanism that the old ablation could not provide.

## Outcome Corpus Route Coverage Scout

- No runtime challenger survived this iteration. The retained source change is harness-only: `smart_automove_pro_policy_matrix_probe` now emits `PRO_POLICY_MATRIX_GLOBAL_MECHANISM_ROUTE` next to global mechanism separation lines, including route labels and the panels/duels behind candidate-only wins and baseline-better saves.
- The structural scout dashboard for retained guarded was `not_promising`: sampled vs shipping measured Pro `7-5`, Normal `7-5`, Fast `6-6`; active blockers measured Pro `3-3`, Normal `5-1`, Fast `2-4`.
- The bounded global outcome corpus over the reset portfolio still had oracle coverage but not source permission: `total_games=12`, guarded baseline wins `5`, candidate-any wins `12`, candidate-only wins `7`, no-policy wins `0`, and stoplight `repeated_mechanism_class`.
- Route coverage confirmed the broad safe zero-window pressure key is contaminated: `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` had `candidate_only_games=10`, `baseline_better_games=5`, and route label `baseline_save_risk` across both sampled and active panels.
- The cleanest remaining signals are timing/stage diagnostics, not selectors. White `exact_timing color=white turn_bucket=turn3_4 mons_moves=mons0` was `cross_panel_clean` at `3` candidate-only games; rejected-head `engine_post_search` stage classes also reached cross-panel or cross-budget clean at `3`; black early timing and ManaTempo-to-SpiritImpact stage classes were active-only cross-budget clean at `3`.
- Durable outcome: do not implement a selector from broad exact pressure or from policy labels. The next useful step is a narrow corpus-record plus decision-probe rerun over sampled/active Normal/Fast slices to see whether the clean timing/stage routes collapse to exact boards or point to a below-branch timing/continuation feature.

## State-Aware Outcome Route Rerun

- No runtime challenger survived the state-aware rerun. The retained source change is harness-only: route coverage now deduplicates mechanism evidence by portfolio state before assigning route labels.
- The focused reset portfolio outcome corpus over sampled and active Normal/Fast slices still had oracle coverage: `total_games=8`, guarded baseline wins `5`, candidate-any wins `8`, candidate-only wins `3`, no-policy wins `0`, and global stoplight `repeated_mechanism_class`.
- State-aware route coverage confirmed that broad exact pressure is worse than the raw emission count implied. `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` had candidate-only games `6`, baseline-better games `5`, candidate-only states `2`, baseline-better states `3`, and label `baseline_save_risk`.
- The only route that stayed clean across deduplicated states was coarse white timing: `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons0 can_action=true can_mana=true opp_win=false` had candidate-only games `3`, baseline-better games `0`, candidate-only states `2`, and label `cross_panel_clean`.
- Raw timing/stage repeats collapsed after deduplication. The white timing records split between sampled Normal `inner_wedge_mana_rows` and active Fast `outer_edge_mana_rows`, with different pressure windows, first moves, and winning policies, so this is not source permission.
- Durable outcome: state counts trump mechanism emission counts. Future reset work should either run a broad state-aware global scan or build Outcome Corpus V2 persistent records with explicit timing, continuation, pressure-window, and root-feature fields before adding another selector.

## Mechanism-Axis Record Output

- No runtime challenger survived this iteration. The retained source change is harness-only: `PRO_POLICY_MATRIX_RECORD` and `PRO_POLICY_MATRIX_CORPUS_RECORD` now include `mechanism_axes` and `baseline_better_mechanism_axes` when mechanism classification is enabled.
- The broad reset-portfolio global scan had oracle coverage but no promotion permission: `total_games=12`, guarded baseline wins `5`, candidate-any wins `12`, candidate-only wins `7`, no-policy wins `0`, and stoplight `repeated_mechanism_class`.
- Broad exact pressure remained contaminated. `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` had candidate-only games `10`, baseline-better games `5`, candidate-only states `5`, baseline-better states `3`, and label `baseline_save_risk`.
- The strongest clean route was active-only: `axis=stage baseline_stage=engine_post_search head_accepted=false head_primary=Some("equal") pre_family=ManaTempo head_family=Some(SpiritImpact)` had candidate-only games `3`, baseline-better games `0`, candidate-only states `3`, and label `cross_budget_clean` across active Pro/Fast only.
- A focused active Pro/Fast rerun with decision probes showed the route is still diagnostic. Candidate-only wins were all `outer_edge_mana_rows` active blockers and split by color, turn, winning policy, branch, and advisor status; the records did not identify one source feature below the existing policy labels.
- Durable outcome: do not write runtime code for this route. The next useful step is to rerun the focused route with the new record-level mechanism axes, then either retire it or build a small Outcome Corpus V2 postprocessor that groups records by mechanism axes, policy, branch, color, and first move automatically.

## Route Fragmentation Counts

- No runtime challenger survived the follow-up active Pro/Fast rerun. The retained source change is harness-only: `PRO_POLICY_MATRIX_GLOBAL_MECHANISM_ROUTE` now reports candidate-only and baseline-better fragmentation counts for policy, variant, color, branch, and first-move pair.
- Record-level mechanism axes confirmed that the active-only `engine_post_search` route is not source-ready. The `pre_family=ManaTempo head_family=Some(SpiritImpact)` route still had candidate-only games `3`, baseline-better games `0`, and candidate-only states `3`, but the matching records split across three winning policies, both colors, two branch transitions, and three first-move pairs.
- The focused slice had no baseline-better saves, but it was active-blocker-only and all candidate-only states were `outer_edge_mana_rows`; broad exact-pressure remains killed by the earlier sampled/active baseline-save evidence.
- Durable outcome: use route fragmentation counts before opening raw records. A clean state route with multiple policies, branches, or first-move pairs is routing evidence only; do not write runtime code until a lower-level shared feature survives this fragmentation check.

## Broad Route Recommendation Scan

- No runtime challenger survived this iteration. The retained source change is harness-only: `smart_automove_pro_policy_matrix_probe` now emits `PRO_POLICY_MATRIX_GLOBAL_ROUTE_RECOMMENDATION` whenever portfolio mechanism-class route coverage is enabled.
- The broad global reset scan over the retained portfolio still had oracle coverage but no source permission: `total_games=12`, guarded baseline wins `5`, candidate-any wins `12`, candidate-only wins `7`, no-policy wins `0`, and stoplight `repeated_mechanism_class`.
- Broad exact pressure stayed contaminated. `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` had candidate-only games `10`, baseline-better games `5`, candidate-only states `5`, and baseline-better states `3`.
- There were zero clean low-fragmentation routes. The top clean route remained the active-only `engine_post_search` stage route with candidate-only states `3`, but it split across three policies, two branch transitions, and three first-move pairs. Other clean timing/stage routes were similarly fragmented or singleton/pair evidence.
- Durable outcome: the next useful work is Outcome Corpus V2/postprocessor output that ranks and joins mechanism records automatically. Do not write runtime selectors from the current broad route scan unless a future recommendation line reports `narrow_low_fragmentation_route`.

## Route Bucket Shortlist Output

- No runtime challenger survived this iteration. The retained source change is harness-only: `smart_automove_pro_policy_matrix_probe` now emits `PRO_POLICY_MATRIX_GLOBAL_ROUTE_BUCKET` lines that shortlist top routes by `clean_low_fragmentation`, `clean_fragmented`, `baseline_risk`, and `singleton_candidate` buckets.
- The broad scan result that motivated the change was `build_outcome_corpus_v2`: `candidate_signal_routes=109`, `clean_low_fragmentation_routes=0`, `clean_fragmented_routes=8`, `baseline_risk_routes=14`, best clean route `axis=stage baseline_stage=engine_post_search head_accepted=false head_primary=Some("equal") pre_family=ManaTempo head_family=Some(SpiritImpact)`, and best baseline risk `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`.
- The bucket output was smoke-validated on a bounded active Fast global-only slice with `SMART_PRO_POLICY_MATRIX_ROUTE_BUCKET_LIMIT=2`; it emitted `singleton_candidate` bucket rows and preserved the global recommendation output.
- Durable outcome: future broad route scans should read the recommendation line and bucket shortlist first. If the recommendation stays `build_outcome_corpus_v2`, preserve postprocessor/harness work and skip runtime source selection.

## Outcome Corpus Record Axis Filter

- No runtime challenger survived this iteration. The retained source change is harness-only: `smart_automove_pro_policy_matrix_probe` now accepts `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER`, a comma-separated list of mechanism-axis substrings used to filter printed `PRO_POLICY_MATRIX_CORPUS_RECORD` and `PRO_POLICY_MATRIX_RECORD` lines.
- The filter computes mechanism axes for printed records even when the aggregate mechanism-class flags are off, but it does not change outcome totals, route aggregation, or stoplight labels.
- The filter was smoke-validated on the active Fast `engine_post_search` route with `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER='axis=stage baseline_stage=engine_post_search'`. The run emitted only the matching `PRO_POLICY_MATRIX_CORPUS_RECORD` and `PRO_POLICY_MATRIX_RECORD` pair plus the normal summaries.
- Durable outcome: use route bucket output to pick an axis, then use the record-axis filter for focused corpus inspection. The filtered records are Outcome Corpus V2 input, not runtime source permission.

## Record Filter Summary Output

- No runtime challenger survived this iteration. The retained source change is harness-only: filtered matrix runs now emit `PRO_POLICY_MATRIX_RECORD_FILTER_SUMMARY`, summarizing matching corpus and trace records by panel, duel, policy, outcome, portfolio class, variant, color, branch transition, and first-move pair count.
- The focused active Pro/Fast query for `axis=stage baseline_stage=engine_post_search head_accepted=false head_primary=Some("equal") pre_family=ManaTempo head_family=Some(SpiritImpact)` still returned `build_outcome_corpus_v2`: `total_games=6`, guarded baseline wins `1`, candidate-any wins `6`, candidate-only wins `5`, no-policy wins `0`, and `clean_low_fragmentation_routes=0`.
- The selected route remained no-source. It matched four corpus records across `vs_shipping_pro` and `vs_shipping_fast`, black and white, policies `frontier_pro_v2_no_selected_followup_projection`, `frontier_pro_v3_full_scored_reply_guard`, and `shipping_pro_search_control`, two branch transitions, and four first-move pairs.
- The summary output was smoke-validated on a one-state active Fast slice. It reported one corpus record, one trace record, and one policy/branch/pair for the filtered route, preserving the normal recommendation output.
- Durable outcome: `engine_post_search` remains an Outcome Corpus V2 fixture, not source permission. Use `PRO_POLICY_MATRIX_RECORD_FILTER_SUMMARY` to retire or prioritize future bucket axes without manually counting raw filtered records.

## Record Filter Detail Output

- No runtime challenger survived this iteration. The retained source change is harness-only: filtered matrix runs now emit capped `PRO_POLICY_MATRIX_RECORD_FILTER_DETAIL` rows for the filtered population by duel, candidate policy, outcome, portfolio class, variant, color, branch transition, and first-move pair.
- The focused active Pro/Fast query for `axis=safety_progress baseline_safety=safe baseline_progress=safe_step_progress winner_safety=safe winner_progress=spirit_development` returned `build_outcome_corpus_v2`: `total_games=6`, guarded baseline wins `1`, candidate-any wins `6`, candidate-only wins `5`, no-policy wins `0`, and `clean_low_fragmentation_routes=0`.
- The top clean route was no-source despite zero baseline-better saves. It matched four candidate-only corpus records across `vs_shipping_pro` and `vs_shipping_fast`, black and white, policies `frontier_pro_v2_no_selected_followup_projection`, `frontier_pro_v3_full_scored_reply_guard`, and `shipping_pro_search_control`, two branch transitions, and four first-move pairs.
- The detail output was smoke-validated on a one-state active Fast slice. It reported one corpus record, one trace record, and detail rows for duel, candidate policy, outcome, portfolio class, variant, color, branch, and first-move pair.
- Durable outcome: the safety/progress route joins `engine_post_search` as an Outcome Corpus V2 fixture. Use detail rows to identify fragmentation before opening raw filtered records; do not write runtime selectors unless a future route recommendation reports `narrow_low_fragmentation_route`.

## Policy Matrix Log Summarizer

- No runtime challenger survived this iteration. The retained source change is a postprocess script: `scripts/summarize-automove-policy-matrix-log.py` reads logged `PRO_POLICY_MATRIX_*` JSON lines and emits one digest containing event counts, global summary, stoplight, route recommendation, route buckets, and filtered-record permissions.
- The focused active Pro/Fast safety/progress detail rerun still returned `build_outcome_corpus_v2`: `total_games=6`, guarded baseline wins `1`, candidate-any wins `6`, candidate-only wins `5`, no-policy wins `0`, `clean_low_fragmentation_routes=0`, `clean_fragmented_routes=9`, and `baseline_risk_routes=6`.
- The summarizer classified the route as `postprocess_only` and the filtered records as `fragmented_no_source`. The filtered details were candidate policies `shipping_pro_search_control=2`, `frontier_pro_v2_no_selected_followup_projection=1`, `frontier_pro_v3_full_scored_reply_guard=1`; duels `vs_shipping_pro=3`, `vs_shipping_fast=1`; variants `outer_edge_mana_rows=3`, `alternating_mana_rows=1`; colors `black=2`, `white=2`; branches `frontier_execute->candidate_execute=3`, `frontier_execute->frontier_execute=1`; and four singleton first-move pairs.
- Durable outcome: keep the safety/progress route as a postprocessor fixture and use the summarizer on the next bounded global-only outcome-corpus run before opening raw route records.

## Policy Matrix Total State Cap

- No runtime challenger survived this iteration. The retained source change is harness-only: `smart_automove_pro_policy_matrix_probe` now accepts `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT`, a true global cap across panels and duels.
- The attempted all-panel/all-budget reset digest with only `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=2` was stopped after about fourteen minutes. That cap is per panel/duel, so the broad reset portfolio still fans out across sampled and active panels plus Pro/Normal/Fast duels.
- The total cap was smoke-validated with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=1`, where global summary reported exactly `total_games=1` and `state_limit_hit=true`.
- A focused active Fast full-portfolio digest with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=2`, `SMART_PRO_POLICY_MATRIX_GLOBAL_ONLY=true`, `SMART_PRO_POLICY_MATRIX_INCLUDE_CORPUS_RECORDS=false`, and `SMART_PRO_POLICY_MATRIX_MAX_PLIES=56` completed successfully. It stayed no-source: `baseline_save_risk_only`, `candidate_signal_routes=19`, `clean_low_fragmentation_routes=0`, `clean_fragmented_routes=0`, and `baseline_risk_routes=1`.
- Durable outcome: use total-capped, panel/duel-filtered digests to rank reset routes before any raw record inspection. The next slice should be active blockers vs shipping Pro with the same total cap and summarizer workflow.

## Policy Matrix Corpus Decision

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now emits `corpus_decision`, which combines global summary, stoplight, and route recommendation into a first-read decision such as `coverage_gap`, `baseline_save_risk`, `singleton_no_source`, `postprocess_only`, or `inspect_for_source`.
- The total-capped active Pro full-portfolio digest completed successfully with two total states and stayed no-source: global stoplight `coverage_gap`, `candidate_only_wins=1`, `no_policy_wins=1`, route recommendation `singleton_candidate_routes`, zero clean routes, and summarizer `corpus_decision=coverage_gap`.
- The top active Pro route was broad zero-window safe exact pressure as singleton evidence only: one candidate-only state, two candidate policies (`frontier_pro_v3_full_scored_reply_guard` and `shipping_pro_search_control`), one branch transition, and two first-move pairs. The other checked state was a no-policy win, so current policy labels cannot cover the slice.
- Durable outcome: the next bounded digest should check active blockers vs shipping Normal with the same total cap and summarizer workflow. Do not write runtime selectors from active Pro singleton routes.

## Policy Matrix Next Action Digest

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now emits `next_action`, derived from `corpus_decision`, so the first-read digest names the operator action instead of only the no-source label.
- The total-capped active Normal full-portfolio digest completed successfully with two total states and stayed no-source: global stoplight `shared_only`, `candidate_only_wins=0`, `no_policy_wins=0`, route recommendation `no_candidate_route`, `candidate_signal_routes=0`, summarizer `corpus_decision=no_candidate_route`, and `next_action=try_next_slice`.
- Guarded shared both checked wins. The only route pressure came from full-scored reply guard baseline-better rows on one active outer-edge white state, so this slice provides no runtime source permission and no route to inspect.
- Durable outcome: total-capped active Fast, Pro, and Normal slices all stayed no-source for different reasons. Keep the reset work in Outcome Corpus V2/postprocess and use the next sampled Normal digest to validate whether the sampled false-positive surface still reports save risk or singleton residue under the retained summarizer.

## Sampled Normal Singleton Digest

- No runtime challenger survived this iteration. No source code was retained; the useful artifact is the sampled Normal no-go captured in the live board and durable knowledge.
- The total-capped sampled Normal full-portfolio digest completed successfully with two total states and stayed no-source: global stoplight `singleton_selector_pressure`, `candidate_only_wins=1`, `no_policy_wins=0`, route recommendation `singleton_candidate_routes`, summarizer `corpus_decision=singleton_no_source`, and `next_action=widen_or_archive_singleton`.
- The top route was a single white `inner_wedge_mana_rows` state. Its strongest class was `axis=advisor baseline_advisor=approved:ApprovedReplyRiskGuard:SpiritImpact winner_advisor=ordered:ReplyRiskShortlist:SpiritImpact`, but the route split across `frontier_pro_v2_no_selected_followup_projection` and `shipping_pro_search_control`, `frontier_execute->frontier_execute` and `frontier_execute->candidate_execute`, and two first-move pairs.
- Durable outcome: archive this as sampled Normal singleton residue. Do not write a SpiritImpact advisor/order selector from this slice; the next low-cost refresh is sampled Fast with the same total cap and summarizer workflow.

## Sampled Fast Shared-Only Digest

- No runtime challenger survived this iteration. No source code was retained; the useful artifact is the sampled Fast shared-only no-go captured in the live board and durable knowledge.
- The total-capped sampled Fast full-portfolio digest completed successfully with two total states and stayed no-source: global stoplight `shared_only`, `candidate_only_wins=0`, `no_policy_wins=0`, route recommendation `no_candidate_route`, summarizer `corpus_decision=no_candidate_route`, and `next_action=try_next_slice`.
- Guarded shared both checked wins. Existing policy components only added baseline-better pressure on sampled `split_flank_mana_rows`, including `frontier_pro_v2_no_selected_followup_projection`, `frontier_pro_v2_raw`, and `frontier_pro_v3_full_scored_reply_guard` rows across black late-shipping and white early-fallback branches.
- Durable outcome: keep sampled Fast as guarded-covered save-risk evidence for the current portfolio. The next low-cost refresh is sampled Pro with the same total cap and summarizer workflow, after which the standardized sampled/active reset digest set should be complete enough to move back to Outcome Corpus V2/postprocess design.

## Sampled Pro Shared-Only Digest

- No runtime challenger survived this iteration. No source code was retained; the useful artifact is the sampled Pro shared-only no-go captured in the live board and durable knowledge.
- The total-capped sampled Pro full-portfolio digest completed successfully with two total states and stayed no-source: global stoplight `shared_only`, `candidate_only_wins=0`, `no_policy_wins=0`, route recommendation `no_candidate_route`, summarizer `corpus_decision=no_candidate_route`, and `next_action=try_next_slice`.
- Guarded shared both checked `inner_wedge_mana_rows` wins. Existing policy components only added baseline-better pressure, led by `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` with `baseline_better_games=5` and `baseline_better_states=2` across raw, no-selected-followup, full-scored, and shipping-control rows.
- Durable outcome: the standardized two-state sampled Pro/Normal/Fast and active Pro/Normal/Fast reset refresh stayed no-source in every slice. Use the next true-global capped digest to consolidate the route picture, then move the work back to Outcome Corpus V2/postprocess design rather than runtime selectors.

## True-Global Source Blocker Digest

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now emits `source_blocker`, a compact reason to keep runtime source untouched for the summarizer's `corpus_decision`.
- The true-global full-portfolio digest with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=6` completed successfully and stayed no-source: total games `6`, guarded baseline wins `5`, candidate-only wins `1`, no-policy wins `0`, stoplight `singleton_selector_pressure`, route recommendation `baseline_save_risk_only`, summarizer `corpus_decision=baseline_save_risk`, and `next_action=avoid_selector`.
- `source_blocker` identified baseline-save risk on `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`: candidate-only states `1`, baseline-better states `3`. The matching bucket had candidate-only evidence only in sampled `vs_shipping_pro` split-flank black, while baseline-better saves spanned center-spoke and inner-wedge plus raw, no-selected-followup, full-scored, and shipping-control rows.
- Durable outcome: broad zero-window safe exact pressure remains a source-work kill. The next work should stay in Outcome Corpus V2/postprocess; do not widen or encode exact-pressure selectors unless a future corpus feature separates candidate wins from guarded saves below policy, branch, and first-move labels.

## Policy Matrix Multi-Log Rollup

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now emits `log_rollup` when more than one log is passed, including per-log summaries plus decision, next-action, and source-blocker counts.
- The current true-global full-portfolio digest was rerun with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=6`, `SMART_PRO_POLICY_MATRIX_GLOBAL_ONLY=true`, corpus records disabled, portfolio mechanism classes enabled, route buckets capped at five, and max plies capped at `56`. It completed successfully and stayed no-source: total games `6`, guarded baseline wins `5`, candidate-any wins `6`, candidate-only wins `1`, no-policy wins `0`, stoplight `singleton_selector_pressure`, and route recommendation `baseline_save_risk_only`.
- The summarizer reported `corpus_decision=baseline_save_risk`, `next_action=avoid_selector`, and `source_blocker.kind=baseline_save_risk` on `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`, with candidate-only states `1` versus baseline-better states `3`.
- The multi-log rollup was smoke-validated by passing the same capped log twice. It reported `decision_counts=[baseline_save_risk: 2]`, `next_action_counts=[avoid_selector: 2]`, and one repeated source blocker for the exact-pressure baseline-save-risk route.
- Durable outcome: the next Outcome Corpus V2 iteration should compare fresh small slice logs with one summarizer invocation and read `log_rollup` before raw buckets. Runtime source remains untouched unless a future rollup shows a repeated source blocker has cleared baseline-save risk and fragmentation.

## Pro-Budget Coverage-Gap Rollup

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now adds `log_rollup.rollup_decision`, `rollup_next_action`, and `rollup_permission` so mixed multi-log no-source outcomes do not require manual interpretation from counts.
- The sampled and active Pro-budget reset slices were run with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=2`, `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_pro`, global-only output, corpus records disabled, portfolio mechanism classes enabled, route buckets capped at five, and max plies capped at `56`.
- The combined rollup stayed no-source: sampled Pro was `corpus_decision=no_candidate_route`, `next_action=try_next_slice`, guarded baseline wins `2`, candidate-only wins `0`, and no-policy wins `0`; active Pro was `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, guarded baseline wins `0`, candidate-only wins `1`, and no-policy wins `1`. The rollup reported `rollup_decision=coverage_gap`, `rollup_next_action=add_policy_or_root_feature`, and `rollup_permission=no_source`.
- A focused active Pro rerun with corpus records enabled confirmed the gap shape. The candidate-only state was active `outer_edge_mana_rows`, candidate black, opening `0 0 b 0 0 1 0 0 2 n03y0xs0xd0xa0xn04/n08e0xn02/n11/n11/xxmxxmn07xxmxxm/xxQxxmn03xxUn03xxMxxQ/xxMxxMn07xxMxxM/n11/n07Y0xn03/n04A0xn06/n03E0xn01D0xS0xn04 8`, with `shipping_pro_search_control` and `frontier_pro_v3_full_scored_reply_guard` winning. The same opening as candidate white was a true no-policy state: every current portfolio policy lost.
- Durable outcome: active Pro coverage now points below the current policy portfolio. Keep runtime source untouched; the next useful work is an Outcome Corpus V2 postprocess view that compacts `portfolio_class=no_policy_win` corpus records into per-state coverage-gap entries before designing a new policy/root feature.

## Coverage Gap Entries

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now emits `coverage_gap_entry_count` and `coverage_gap_entries`, compacting `PRO_POLICY_MATRIX_CORPUS_RECORD` rows with `portfolio_class=no_policy_win` by panel, duel, seed tag, repeat, opening index, variant, and side.
- The focused active Pro record-bearing slice was rerun with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=2`, `SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers`, `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_pro`, `SMART_PRO_POLICY_MATRIX_GLOBAL_ONLY=false`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, and max plies capped at `56`. The run stayed `corpus_decision=coverage_gap` and `next_action=add_policy_or_root_feature`.
- The summarizer emitted `coverage_gap_entry_count=1`. The compact entry identified the active `outer_edge_mana_rows` candidate-white no-policy state from opening `0 0 b 0 0 1 0 0 2 n03y0xs0xd0xa0xn04/n08e0xn02/n11/n11/xxmxxmn07xxmxxm/xxQxxmn03xxUn03xxMxxQ/xxMxxMn07xxMxxM/n11/n07Y0xn03/n04A0xn06/n03E0xn01D0xS0xn04 8`: all seven current portfolio policies lost, `record_count=7`, `candidate_count=7`, `first_diff_count=3`, `pair_count=4`, and `branch_count=3`.
- The top compact mechanism axes were `none` for four non-divergent same-outcome records and `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` for two divergent records. The earliest listed divergence was `frontier_pro_v3_full_scored_reply_guard` at first-diff ply `7`, board `0 0 w 0 0 1 0 0 3 n05d0xa0xn04/n08e0xn02/n06s0xn04/n04y0xn03xxmn02/xxmxxmn08xxm/xxQxxmn03xxUn03xxMxxQ/xxMxxMn07xxMxxM/n11/n07Y0xn03/n04A0xS0xn05/n03E0xn01D0xn05 8`.
- Durable outcome: the no-policy gap is now visible without raw corpus inspection. The next useful diagnostic is a forced-root oracle on the earliest compact divergence board with `SMART_PRO_FORCED_ROOT_ORACLE_START_PLY=7`; keep runtime source untouched unless that root-set probe finds a repeated below-policy feature.

## Active Pro Forced-Root Root Source Oracle

- No runtime challenger survived this iteration. The retained source change is harness-only: `smart_automove_pro_forced_root_oracle_probe` now accepts `SMART_PRO_FORCED_ROOT_ORACLE_ROOT_SOURCE`, letting scored roots come from a runtime profile while a test-only continuation policy plays out the forced root.
- The first forced-root pass on the active Pro coverage-gap board was discarded as horizon-inflated. It used the oracle default `SMART_PRO_FORCED_ROOT_ORACLE_MAX_PLIES=96` even though the source outcome corpus used `56` plies. After setting `SMART_PRO_FORCED_ROOT_ORACLE_START_PLY` to the first-diff ply and `SMART_PRO_FORCED_ROOT_ORACLE_MAX_PLIES=56`, the tempting rank-0 ply-7 root `l9,5;l8,5` correctly remained a loss.
- The corrected ply-7 active `outer_edge_mana_rows` board with guarded continuation had `7/16` winning roots, while the same guarded root source continued by `frontier_pro_v3_full_scored_reply_guard` had `4/16` winning roots. The full-scored reply-guard continuation is weaker on this board, but both runs show the current root set contains winning choices beneath the selected losing root.
- Two later compact no-policy divergence boards were also root-covered under the corrected horizon. The ply-20 board had `4/16` winning roots, all printed winners in `SpiritImpact`; the ply-40 board had `1/17`, a rank-9 `ManaTempo` root. Across the three checked boards, winners were low/mid ranked and did not collapse to one family, rank, or source-selector rule.
- Durable outcome: the active Pro coverage gap is not a missing-root ceiling; it is root-ranking or feature-design pressure. Keep runtime source untouched until a postprocess or ProV4 root-feature pass finds a repeated below-policy feature across corrected-horizon winning roots.

## Forced-Root Oracle Log Summarizer

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-forced-root-oracle-log.py` reads `FORCED_ROOT_ORACLE_*` JSON lines and emits a compact digest with root coverage, per-board winner summaries, repeated winner axes, and winner-vs-nonwinner separability.
- The summarizer was validated on fresh corrected-horizon active Pro oracle logs for the three compact `outer_edge_mana_rows` no-policy boards. The ignored release harness passed for all three board probes, and the digest reported `summary_count=3`, `tested_roots=49`, `wins=12`, `losses=37`, and `groups_with_wins=3`.
- The digest decision stayed no-source: `oracle_decision=fragmented_root_features`, `next_action=return_to_outcome_corpus_feature_extraction`, and `promising_repeated_axes=[]`. Broad repeats were contaminated by losing roots: `rank_band=rank8_plus` covered all three winner groups but also `16` nonwinner roots, and the all-group utility/safety axes had `37` nonwinner roots.
- Durable outcome: do not build a ProV4/root comparator from current forced-root rank, family, same-window, safety, or `TurnEngineUtility` axes alone. The next useful work returns to Outcome Corpus V2 feature extraction for a discriminator not already visible in the forced-root rows.

## Coverage Gap Sibling State Summaries

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now adds `same_opening_sibling_states` to each `coverage_gap_entries` item, summarizing other candidate-side states from the same panel, duel, seed tag, repeat, opening index, and variant.
- The active Pro outcome-corpus command from the live board was rerun with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=2`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, and max plies capped at `56`. The run passed and stayed `corpus_decision=coverage_gap`: total games `2`, guarded baseline wins `0`, candidate-only wins `1`, no-policy wins `1`, route recommendation `singleton_candidate_routes`.
- The old compact coverage-gap entry showed only the candidate-white no-policy state. With sibling summaries, the same entry now reports one same-opening sibling: candidate black on the same `outer_edge_mana_rows` opening, with `portfolio_class_counts=[candidate_only_win: 7]`, winning policies `shipping_pro_search_control,frontier_pro_v3_full_scored_reply_guard`, top axes led by zero-window safe exact pressure, and four first divergences.
- Durable outcome: the active Pro gap is a cross-side asymmetry hypothesis, not source permission. Widen only enough to see whether this same-opening candidate-only/no-policy pairing repeats before adding any runtime or ProV4 comparator logic.

## Active Pro Sibling Pairing Widening

- No runtime challenger survived this iteration. No source or harness code was retained; the useful artifact is the no-source result from the wider active Pro same-opening pairing check.
- The active Pro outcome-corpus command was rerun with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=4`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, and max plies capped at `56`. The run passed and stayed `corpus_decision=coverage_gap`: total games `4`, guarded baseline wins `1`, candidate-any wins `3`, candidate-only wins `2`, no-policy wins `1`, shared wins `1`, and route recommendation `build_outcome_corpus_v2`.
- The widened compact view still emitted `coverage_gap_entry_count=1`. The only no-policy entry was the same active `outer_edge_mana_rows` candidate-white state, and it still had one same-opening candidate-black sibling with `portfolio_class_counts=[candidate_only_win: 7]` and winning policies `shipping_pro_search_control,frontier_pro_v3_full_scored_reply_guard`.
- The extra checked states added candidate-only and shared evidence but did not add a second same-opening no-policy/candidate-only pair. The best clean route was still postprocess-only exact pressure: `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`, with candidate-only states `2`, two candidate policies, and three first-move pairs.
- Durable outcome: archive the cross-side pairing as singleton evidence. The next useful work is broader record-bearing Outcome Corpus V2 feature extraction that ranks lower-level axes across candidate-only wins, baseline saves, shared wins, and no-policy gaps before any runtime or ProV4 selector work.

## Corpus Axis Summary

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now emits `corpus_axis_summary`, a compact record-level axis report built from `PRO_POLICY_MATRIX_CORPUS_RECORD` rows.
- The new report groups record axes into `candidate_better`, `baseline_better`, `no_policy`, and `same_outcome` classes, deduplicates by corpus state, and labels each axis as `baseline_save_risk`, `coverage_gap_axis`, `repeated_candidate_axis`, `singleton_candidate_axis`, `baseline_better_only`, or `shared_or_neutral`.
- The unfiltered record-bearing Outcome Corpus V2 slice was run with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=8`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at eight, and max plies capped at `56`. It completed successfully but the true global cap was consumed by sampled `vs_shipping_pro` states: total games `8`, guarded baseline wins `6`, candidate-only wins `2`, shared wins `6`, no-policy wins `0`, and route recommendation `baseline_save_risk_only`.
- The digest stayed no-source: `corpus_decision=baseline_save_risk`, `next_action=avoid_selector`, and `source_blocker.kind=baseline_save_risk`. The new `corpus_axis_summary` showed the same blocker without raw records: `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` had candidate-better states `2` but baseline-better states `4`, with `branch_count=4`, `pair_count=13`, and all four sampled variants represented.
- Durable outcome: exact zero-window safe pressure remains a selector kill. Use `corpus_axis_summary` before raw records on the next explicit active-blocker Pro slice; runtime source remains untouched unless the summarizer reports `inspect_for_source`.

## Active Pro Corpus Axis Decision View

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now adds `corpus_axis_summary.axis_decision_counts` and `corpus_axis_summary.top_axes_by_decision`, so coverage-gap, repeated-candidate, baseline-better, and save-risk axes can be read without manually scanning separate top lists.
- The explicit active-blocker Pro record-bearing slice was run with `SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers`, `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_pro`, `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=8`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at eight, and max plies capped at `56`. It completed all available states and stayed no-source: total games `6`, guarded baseline wins `2`, candidate-only wins `3`, shared wins `2`, no-policy wins `1`, and route recommendation `build_outcome_corpus_v2`.
- The digest stayed `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `route_permission=postprocess_only`, and `clean_low_fragmentation_routes=0`. The remaining no-policy entry is still the active `outer_edge_mana_rows` candidate-white state with all seven policies losing and one same-opening candidate-black sibling.
- The top `coverage_gap_axis` was broad exact pressure: `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe`, with candidate-better states `3`, no-policy states `1`, baseline-better states `0`, branch count `3`, and pair count `13`. It is active-clean but fragmented and already sampled-killed as baseline-save risk, so it is not source permission.
- The only `repeated_candidate_axis` rows were active-only leads: `axis=safety_progress baseline_safety=safe baseline_progress=safe_step_progress winner_safety=safe winner_progress=spirit_development` with candidate-better states `2`, and `axis=role baseline_role=selected baseline_live=top3_live winner_role=pre_accept+legacy+legacy_full_pool winner_live=top3_live` with candidate-better states `2`. Both had zero active baseline-better and zero no-policy states but still split by branch/pair.
- Durable outcome: keep runtime source untouched. The next useful check is a focused sampled Pro record-axis run for those two repeated active candidate axes; if either shows sampled baseline saves, archive the axis and return to ProV4/root-feature or continuation-stability feature work.

## Sampled Pro Axis Filter Match Split

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now adds `axis_filter_matches` to each summarized `record_filters` entry, splitting comma-separated `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER` tokens into separate corpus-axis summaries.
- The focused sampled Pro run checked the two active-only repeated candidate axes together with `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=8`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at eight, max plies capped at `56`, and the full reset portfolio.
- The global sampled result stayed no-source: `corpus_decision=baseline_save_risk`, `next_action=avoid_selector`, route recommendation `baseline_save_risk_only`, guarded baseline wins `6`, candidate-any wins `8`, candidate-only wins `2`, shared wins `6`, no-policy wins `0`, and zero clean low-fragmentation routes. The source blocker remained broad zero-window safe exact pressure, with candidate-only states `2` versus baseline-better states `4`.
- Per-token filter matches split the active leads cleanly. The safety/progress token `axis=safety_progress baseline_safety=safe baseline_progress=safe_step_progress winner_safety=safe winner_progress=spirit_development` was `baseline_save_risk` with record count `4`, state count `2`, candidate-better states `1`, baseline-better states `1`, and same-outcome states `2`. The role token `axis=role baseline_role=selected baseline_live=top3_live winner_role=pre_accept+legacy+legacy_full_pool winner_live=top3_live` was only `singleton_candidate_axis` with record count `1`, state count `1`, and candidate-better states `1`.
- Durable outcome: retire both active repeated-candidate axes as runtime selector leads. The safety/progress axis has sampled save contamination, and the role axis is singleton evidence. The next useful work is Outcome Corpus V2 decision-stage timing and continuation-stability feature extraction before any ProV4/root-feature comparator or runtime selector.

## Timing Continuation Axis Records

- No runtime challenger survived this iteration. The retained source change is harness/postprocess-only: policy-matrix corpus and trace records now emit `timing_continuation_axes`, and the summarizer includes those axes in `corpus_axis_summary`, `axis_filter_matches`, and coverage-gap state summaries.
- The one-state active Pro validation passed through the ignored `smart_automove_pro_policy_matrix_probe` harness and printed timing axes on `PRO_POLICY_MATRIX_CORPUS_RECORD` / `PRO_POLICY_MATRIX_RECORD`. A focused filter on `axis=decision_timing ply_bucket=ply0_7` printed exactly one matching corpus record and one matching trace record, proving `SMART_PRO_POLICY_MATRIX_RECORD_AXIS_FILTER` can now target timing axes.
- The wider active Pro timing run completed all six available states and stayed no-source: `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, guarded baseline wins `2`, candidate-only wins `3`, shared wins `2`, no-policy wins `1`, route permission `postprocess_only`, and one coverage-gap entry. Repeated timing axes either included the no-policy state, baseline-better saves, or only singleton candidate evidence.
- The matching sampled Pro timing run stayed no-source: `corpus_decision=baseline_save_risk`, `next_action=avoid_selector`, guarded baseline wins `6`, candidate-only wins `2`, shared wins `6`, no-policy wins `0`, and source blocker `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` with candidate-only states `2` versus baseline-better states `4`.
- The combined sampled/active timing rollup reported `rollup_decision=baseline_save_risk`, `rollup_next_action=avoid_selector`, and `rollup_permission=no_source`. Top timing axes were save-contaminated or coverage-gap axes: no-rejoin/different-final continuation had candidate-better, baseline-better, same-outcome, and no-policy states; `frontier_execute->candidate_execute`, early-white fallback, late-black fallback, and black ply-0-to-7 decision timing all picked up sampled baseline-better saves.
- Durable outcome: timing/continuation axes are useful corpus features, but they are not source permission in their first sampled/active Pro pass. The next useful work is a cross-budget axis view that joins these axes across Pro/Normal/Fast before any ProV4 comparator or runtime selector.

## Cross-Budget Axis Summary

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now emits `cross_budget_axis_summary`, joining `PRO_POLICY_MATRIX_CORPUS_RECORD` axes by panel, normalized seed family, repeat, opening index, variant, and side across Pro/Normal/Fast duels.
- The active-blocker validation used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1` with Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `171.64s`.
- The digest stayed no-source: `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `route_permission=no_source`, and `source_blocker.kind=coverage_gap`. The new cross-budget view reported `record_count=21`, `joined_state_count=1`, `axis_state_group_count=106`, and decision counts `shared_or_neutral=39`, `coverage_gap=33`, `non_regressing_repair=20`, `baseline_save_risk=9`, `partial_repair_coverage_gap=3`, and `budget_conflict=2`.
- The two budget-conflicted axes were broad zero-window safe exact pressure and no-rejoin/different-final continuation stability. Both joined the same active `outer_edge_mana_rows` candidate-white opening side across all three budgets: Fast had candidate-better evidence, Normal had baseline-better save evidence, and Pro carried no-policy pressure.
- Durable outcome: the first cross-budget view confirms the current timing/continuation and exact-pressure leads are not source candidates. The next useful check is a two-state active-blocker cross-budget widening through the same summarizer; runtime source stays untouched unless `cross_budget_axis_summary` shows repeated all-budget or non-regressing repairs with no baseline-save and no coverage-gap contamination.

## Cross-Budget Axis Widening

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `cross_budget_axis_summary` rollups now include candidate, branch, and first-move pair fragmentation, plus `source_status_counts`, `source_candidate_rollups`, and `blocked_candidate_rollups`.
- The two-state active-blocker widening used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=2` across Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `312.27s`.
- The digest stayed no-source: total games `6`, guarded baseline wins `3`, candidate-any wins `5`, candidate-only wins `2`, shared wins `3`, no-policy wins `1`, `corpus_decision=coverage_gap`, and route recommendation `baseline_save_risk_only`. The route blocker remained zero-window safe exact pressure.
- The cross-budget digest reported `record_count=42`, `joined_state_count=2`, `axis_state_group_count=217`, and decision counts `shared_or_neutral=115`, `non_regressing_repair=42`, `coverage_gap=33`, `baseline_save_risk=20`, `budget_conflict=4`, and `partial_repair_coverage_gap=3`.
- After applying the source-status gate, `source_candidate_rollups=[]`. Blocked candidates were explicit: zero-window safe exact pressure and no-rejoin/different-final continuation were `baseline_save_risk`, while later-rejoin/different-final continuation had two candidate-better joined states and no baseline/no-policy joined states but stayed `fragmented_no_source` across three policies, four branch transitions, and four first-move pairs.
- Durable outcome: do not widen active cross-budget axes again without a new below-policy feature. The next useful corpus spend is a sampled cross-budget source-status pass for feature discovery, not runtime source work from the current active axes.

## Sampled Cross-Budget Source Status

- No runtime challenger survived this iteration. No source code was retained; the useful artifact is the sampled no-source result under the source-status summarizer.
- The sampled cross-budget pass used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=2` across Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `271.59s`.
- The digest stayed no-source: total games `6`, guarded baseline wins `5`, candidate-any wins `6`, candidate-only wins `1`, shared wins `5`, no-policy wins `0`, `corpus_decision=singleton_no_source`, and route recommendation `singleton_candidate_routes`.
- The cross-budget digest reported `record_count=42`, `joined_state_count=4`, `axis_state_group_count=226`, and decision counts `shared_or_neutral=113`, `baseline_save_risk=95`, `non_regressing_repair=15`, and `budget_conflict=3`.
- `source_candidate_rollups=[]`. Source statuses were `no_candidate_signal=171`, `fragmented_no_source=10`, `singleton_non_regressing=5`, and `baseline_save_risk=3`. The top blocked row was no-rejoin/different-final continuation with one candidate-better joined state, three baseline-better joined states, four policies, four branch transitions, and eighteen first-move pairs.
- Durable outcome: sampled and active cross-budget source-status passes both failed to produce a source-candidate rollup from current timing, continuation, pressure, stage, advisor, family, role, and root axes. The next useful work is adding a new below-policy corpus feature, not rerunning or encoding current axes.

## Root Preservation Feature Axis

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: policy-matrix mechanism axes now include `axis=root_preservation`, classifying the winner move under guarded's root pool as top-three/lower/omitted, selected-path/off-path, broad advisor bucket, preservation signal, and rank delta against guarded's selected root.
- The smoke validation used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1` on sampled and active-blocker panels across Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `295.83s`.
- The digest stayed no-source: `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `source_blocker.kind=coverage_gap`, `route_permission=no_source`, and `source_candidate_rollups=[]`.
- The cross-budget source-status counts were `no_candidate_signal=152`, `singleton_non_regressing=20`, `fragmented_no_source=14`, `baseline_save_risk=7`, and `coverage_gap=4`. The visible preservation leads were blocked: `top3_considered / selected_path / ordered` mixed candidate-better with baseline-better and same-outcome rows and was `baseline_save_risk`, while `lower_considered / off_selected_path / unlisted` carried one candidate-better joined state but also no-policy pressure and branch/pair fragmentation.
- A cheap replay over the completed log tested coarser root-preservation groupings (`winner_signal`, presence+path, presence+path+advisor, and considered/off-path). None produced a `source_candidate_rollups` entry; they remained baseline-save risk, coverage-gap, or fragmented no-source.
- Durable outcome: keep `axis=root_preservation` as corpus evidence, but do not build a runtime selector from root presence, selected-path status, advisor preservation/order, or omitted-root labels. The next useful feature family is reply-risk / followup-floor evidence crossed with progress/setup, not another preservation rerun.

## Reply-Floor Feature Axis

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: policy-matrix mechanism axes now include `axis=reply_floor_progress` and `axis=winner_reply_floor`, classifying baseline and winner roots by reply-risk floor, followup-floor bucket, progress class, and floor deltas.
- The smoke validation used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1` on sampled and active-blocker panels across Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `295.63s`.
- The digest stayed no-source: `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `source_blocker.kind=coverage_gap`, `route_permission=no_source`, and `source_candidate_rollups=[]`.
- The cross-budget source-status counts were `no_candidate_signal=183`, `singleton_non_regressing=28`, `fragmented_no_source=14`, `baseline_save_risk=7`, and `coverage_gap=4`. The exact reply/followup axes had no candidate-bearing source rows in the top digest; the only top visible reply row was shared/neutral.
- A cheap replay over the completed log tested coarser reply/followup groupings: winner reply/followup, reply-only, reply deltas, reply tradeoffs, broad reply-progress, reply-progress deltas, and reply-risk-only. None produced a `source_candidate_rollups` entry. Candidate-bearing rows were either baseline-save risk, coverage-gap, or fragmented by candidate policy, branch, or first-move pair.
- Durable outcome: keep reply-floor axes as corpus evidence, but do not build a runtime selector from reply floor, followup floor, or winner progress/floor tradeoffs. The next useful feature family is a more detailed post-root safety delta below the broad `safety_progress` bucket, not another reply-floor rerun.

## Root Safety Detail Feature Axis

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: policy-matrix mechanism axes now include `axis=root_safety_detail` and `axis=winner_safety_signal`, splitting handoff, roundtrip, walk-vulnerability, vulnerable, and safe roots before crossing the result with progress/setup class and safety delta.
- The smoke validation used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1` on sampled and active-blocker panels across Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `299.17s`.
- The digest stayed no-source: total games `6`, guarded baseline wins `3`, candidate-only wins `2`, shared wins `3`, no-policy wins `1`, `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `source_blocker.kind=coverage_gap`, `route_permission=no_source`, and `source_candidate_rollups=[]`.
- The global route recommendation stayed `baseline_save_risk_only`. The best baseline-risk key remained broad zero-window safe exact pressure, with candidate-only states `1` and baseline-better states `2`; no detailed safety route became a clean low-fragmentation source.
- The cross-budget source-status counts were `no_candidate_signal=200`, `singleton_non_regressing=32`, `fragmented_no_source=17`, `baseline_save_risk=8`, and `coverage_gap=4`. The visible exact safety lead was `axis=winner_safety_signal detail=vulnerable progress=spirit_development signal=vulnerable_progress safety_delta=same_safety`, but it was `baseline_save_risk` and fragmented across policy, branch, and first-move pair.
- A cheap replay over the completed log tested coarser safety-delta and safety-signal groupings. None produced a `source_candidate_rollups` entry. Repeated `same_safety` rows were baseline-save risk or fragmented, `safe_progress` rows mixed baseline saves and no-policy pressure, and `axis=safety_delta safety_delta=winner_safer` was only a singleton non-regressing row.
- Durable outcome: keep detailed root-safety axes as corpus evidence, but do not build a runtime selector from handoff, roundtrip, walk-vulnerability, vulnerable-progress, safety delta, or winner-safer rows. The next useful feature work is a root-pool or forced-root diagnostic view with richer winner-vs-nonwinner per-root axes, not another cross-budget rerun of current mechanism axes.

## Forced-Root Feature Axis Digest

- No runtime challenger survived this iteration. The retained changes are harness/postprocess-only: forced-root oracle rows now include detailed safety, progress, reply/followup floors, advisor class/bucket, and root path, and the forced-root summarizer includes those fields in root axes, first-winning-root summaries, and promising repeated-axis dimensions.
- The compact active Pro refresh passed through `smart_automove_pro_policy_matrix_probe` in `128.44s` and stayed `corpus_decision=coverage_gap`, recovering the three corrected no-policy divergence boards at plies `7`, `20`, and `40`.
- The three corrected forced-root boards were rerun with guarded continuation and guarded root source, `SMART_PRO_FORCED_ROOT_ORACLE_MAX_PLIES=56`, starts `7`/`20`/`40`, and root limit `24`. The digest stayed root-covered but fragmented: `3` groups, `49` tested roots, `12` wins, `37` losses, `oracle_decision=fragmented_root_features`, and `promising_repeated_axes=[]`.
- First winning roots did not share a sourceable signature. Ply `7` won with ordered rank-3 `SpiritImpact`, good/stable reply and followup floors, and advisor path `advisor_ordered`; ply `20` won with unlisted rank-3 `SpiritImpact`, very-bad/bad floors, and path `lower_unlisted`; ply `40` won with unlisted rank-9 `ManaTempo`, very-bad/bad floors, and path `lower_unlisted`.
- Repeated axes were contaminated by losing roots. `rank_band=rank8_plus` had `8` wins and `16` losses, `path_safety=lower_unlisted|safe` had `8` wins and `21` losses, `advisor_bucket=unlisted` had `8` wins and `24` losses, and broad safe/utility axes appeared on all `37` losing roots.
- Durable outcome: keep the enriched oracle fields as diagnostics, but do not build a runtime or ProV4 comparator from current safety, reply/followup, advisor, path, rank, family, or utility axes. The next useful work is an Outcome Corpus V2 workbench/queryable JSONL export, not another forced-root axis rerun.

## Outcome Corpus JSONL Workbench Export

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-policy-matrix-log.py` now supports `--jsonl-out` and `--jsonl-only` to write normalized Outcome Corpus V2 workbench rows while preserving the existing digest output by default.
- The export row types are `policy_decision`, `policy_axis`, `corpus_axis_summary`, `cross_budget_axis_state`, `cross_budget_axis_rollup`, and `coverage_gap_state`. Rows include stable corpus and cross-budget state ids so candidate-better, baseline-better, no-policy, shared, cross-budget, and coverage-gap evidence can be queried without rereading raw stdout.
- Validation used the sampled+active one-state cross-budget reset slice with Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `295.06s`.
- The exported workbench contained `1341` JSONL rows: `42` `policy_decision`, `471` `policy_axis`, `261` `corpus_axis_summary`, `305` `cross_budget_axis_state`, `261` `cross_budget_axis_rollup`, and one `coverage_gap_state`. `--jsonl-only` was smoke-checked and produced the same row count with no stdout digest.
- The digest stayed no-source: total games `6`, guarded baseline wins `3`, candidate-any wins `5`, candidate-only wins `2`, no-policy wins `1`, `corpus_decision=coverage_gap`, `route_permission=no_source`, `coverage_gap_entry_count=1`, and `source_candidate_rollups=[]`.
- JSONL rollup queries made the blockers explicit. Candidate-bearing cross-budget rollups were led by no-rejoin/different-final continuation and zero-window safe exact pressure, both `baseline_save_risk`, while lower-considered off-selected-path root preservation stayed `coverage_gap`; candidate-bearing rollups remained save-contaminated, gap-contaminated, or fragmented.
- Durable outcome: keep the JSONL workbench export and do not retain runtime source. The next useful step is a JSONL-driven query/report that ranks blocked candidate-bearing axes by candidate states, baseline/no-policy contamination, cross-budget status, and fragmentation before adding any new below-policy feature.

## Outcome Corpus JSONL Blocked-Axis Report

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now consumes normalized Outcome Corpus V2 JSONL exports and ranks source candidates, blocked candidate-bearing axes, blocker counts, and blocked axis-family rollups without rereading raw policy-matrix stdout.
- A synthetic JSONL smoke verified baseline-save ranking and policy-axis aggregation. The sampled+active one-state cross-budget reset slice was then rerun with Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `295.32s`.
- The log summarizer again exported `1341` JSONL rows. The log digest stayed no-source: `corpus_decision=coverage_gap`, `route_permission=no_source`, and `source_candidate_rollups=[]`.
- The JSONL workbench report found `source_candidate_axis_count=0`, `blocked_candidate_axis_count=61`, `workbench_decision=blocked_candidate_axes`, and `source_permission=no_source`. Candidate-bearing blockers were `32` singleton non-regressing axes, `17` fragmented no-source axes, `8` baseline-save-risk axes, and `4` coverage-gap axes.
- The only candidate count-2 exact axes were still unusable: same-branch decision stage was baseline-save/gap contaminated and no-rejoin/different-final continuation was baseline-save/gap contaminated with policy, branch, and pair fragmentation.
- Clean-looking blocked families were aggregate hints, not source permission. `reply_floor_progress`, `role`, and `winner_reply_floor` each had four candidate joined states and no baseline/no-policy joined states, but only as exact singleton axes. `root_safety_detail` and `safety_progress` had similar aggregate counts but included fragmentation.
- Durable outcome: keep the JSONL blocked-axis report and do not retain runtime source. The next useful work is a family-overlap drilldown that checks whether those clean singleton family rollups share the same candidate states or represent independent one-off repairs before adding any new below-policy feature.

## Outcome Corpus JSONL Family Overlap

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now includes a default family-overlap drilldown for `reply_floor_progress`, `role`, `winner_reply_floor`, `root_safety_detail`, and `safety_progress`, plus a `--families` override.
- A synthetic JSONL smoke verified that shared candidate state overlap is detected. The sampled+active one-state cross-budget reset slice was then rerun with Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `294.64s`.
- The log summarizer again exported `1341` JSONL rows. The log digest stayed no-source: `corpus_decision=coverage_gap`, `route_permission=no_source`, and `source_candidate_rollups=[]`.
- The JSONL workbench stayed no-source: `source_candidate_axis_count=0`, `blocked_candidate_axis_count=61`, `workbench_decision=blocked_candidate_axes`, and `source_permission=no_source`.
- The five default overlap families all pointed to the same two candidate state ids: active `outer_edge_mana_rows` candidate-white and sampled `inner_wedge_mana_rows` candidate-white. Every pairwise overlap had Jaccard `1.0`; each family had four candidate exact axes, three policies, three branches, and four first-move pairs.
- The overlap was not source permission because both candidate states were contaminated by baseline/no-policy evidence, yielding `clean_candidate_state_count=0` for every family and `family_overlap_decision=shared_contaminated_family_states`.
- Durable outcome: keep the family-overlap drilldown and do not retain runtime source. The next useful work is a JSONL state-level discriminator drilldown inside those two shared contaminated states before adding any new below-policy feature.

## Outcome Corpus JSONL State Discriminator

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now includes a `state_discriminator` section that defaults to the family-overlap shared contaminated states, plus `--states` and `--state-axis-limit` overrides for focused workbench reruns.
- A synthetic JSONL smoke verified default state targeting and the CLI state override. The sampled+active one-state cross-budget reset slice was then rerun with Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `294.60s`.
- The log summarizer again exported `1341` JSONL rows. The log digest stayed no-source: `corpus_decision=coverage_gap`, `route_permission=no_source`, `source_candidate_rollups=[]`, and `jsonl_export.rows=1341`.
- The JSONL workbench stayed no-source: `source_candidate_axis_count=0`, `blocked_candidate_axis_count=61`, `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, and `family_overlap_decision=shared_contaminated_family_states`.
- The discriminator targeted the expected two states: active `outer_edge_mana_rows` candidate-white and sampled `inner_wedge_mana_rows` candidate-white. It reported `state_discriminator_decision=no_state_family_discriminator` and `next_action=archive_current_families_or_add_new_feature_axis`.
- State-level exact-axis differences were not a source signal. Active `outer_edge_mana_rows` had `candidate_axis_count=35`, `candidate_unique_axis_count=29`, `candidate_unique_family_count=0`, and `candidate_contaminated_family_count=18`; sampled `inner_wedge_mana_rows` had `candidate_axis_count=28`, `candidate_unique_axis_count=25`, `candidate_unique_family_count=0`, and `candidate_contaminated_family_count=18`.
- Durable outcome: archive the current family-overlap lead as contaminated at family level. The next useful work is token-level discrimination inside these contaminated family axes, then a new below-policy feature only if a token repeats across both target states without baseline-save or no-policy contamination.

## Outcome Corpus JSONL Axis-Token Discriminator

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now includes an `axis_token_discriminator` section that tokenizes axis key/value fields inside target states and families, plus `--token-families` for focused reruns.
- A synthetic JSONL smoke verified that repeated clean candidate tokens are detected. The sampled+active one-state cross-budget reset slice was then rerun with Pro, Normal, and Fast duels, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `294.59s`.
- The log summarizer again exported `1341` JSONL rows. The log digest stayed no-source: `corpus_decision=coverage_gap`, `route_permission=no_source`, `source_candidate_rollups=[]`, and `jsonl_export.rows=1341`.
- The JSONL workbench stayed no-source at the axis level: `source_candidate_axis_count=0`, `blocked_candidate_axis_count=61`, `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `family_overlap_decision=shared_contaminated_family_states`, and `state_discriminator_decision=no_state_family_discriminator`.
- The token discriminator reported `axis_token_decision=inspect_repeated_candidate_tokens`, `candidate_token_count=156`, `clean_repeated_candidate_token_count=3`, `clean_singleton_candidate_token_count=21`, `contaminated_candidate_token_count=132`, and `target_family_count=18`.
- The three clean repeated tokens all describe vulnerable guarded/baseline safety or progress: `baseline_detail=vulnerable`, `baseline_safety=vulnerable`, and `baseline_signal=vulnerable_progress`. Each covered the active `outer_edge_mana_rows` candidate-white state and sampled `inner_wedge_mana_rows` candidate-white state, with `3` candidate records, `2` policies (`frontier_pro_v2_no_selected_followup_projection` and `shipping_pro_search_control`), `2` branches, and `3` first-move pairs.
- A focused `--token-families root_safety_detail,safety_progress` replay over the same JSONL export preserved those three repeated clean tokens.
- Durable outcome: keep the vulnerable-baseline token lead as routing evidence only. The next useful work is a widened focused token pass over `root_safety_detail` and `safety_progress`; runtime source remains untouched unless the token survives widening and later cross-budget source gates clear baseline-save, coverage-gap, singleton, and fragmentation blockers.

## Vulnerable Baseline Token Widening

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now distinguishes low-fragmentation repeated candidate tokens from repeated tokens that are clean from baseline/no-policy rows but still fragmented by policy, branch, first-move pair, or same-outcome evidence.
- The widened focused validation used sampled plus active-blocker panels, Pro/Normal/Fast duels, `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=2`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `582.90s`.
- The log summarizer exported `2594` JSONL rows. The digest stayed no-source: `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `route_permission=postprocess_only`, and `source_candidate_rollups=[]`.
- The JSONL workbench stayed no-source with `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=89`. Family overlap remained shared but contaminated, and state-level discrimination still found no unique candidate family.
- The focused token report over `root_safety_detail` and `safety_progress` changed from an ambiguous repeated-token lead to `axis_token_decision=fragmented_repeated_candidate_tokens`: `clean_repeated_candidate_token_count=3`, `low_fragmentation_clean_repeated_candidate_token_count=0`, `fragmented_clean_repeated_candidate_token_count=3`, `clean_singleton_candidate_token_count=4`, and `contaminated_candidate_token_count=15`.
- The same three vulnerable-baseline tokens repeated: `baseline_detail=vulnerable`, `baseline_safety=vulnerable`, and `baseline_signal=vulnerable_progress`. Each had candidate-better evidence but also `candidate_fragmented_dimensions=policy|branch|pair|same_outcome`, so the lead remained a routing hint rather than source permission.
- A focused token-pair check did not rescue the lead. The only clean repeated pair was `baseline_detail=vulnerable && baseline_signal=vulnerable_progress`, and it carried the same two-state, three-record fragmentation across policies, branches, first-move pairs, and axes.
- Durable outcome: archive vulnerable-baseline safety/progress as no-source. The next useful feature source should come from utility/root-evaluation component deltas below current safety/progress labels, not another vulnerable/safety/progress token selector.

## Utility Component Feature Axis

- No runtime challenger survived this iteration. The retained changes are diagnostics-only: `TurnEngineUtility` has test-only component accessors, and policy-matrix mechanism axes now include `axis=utility_component_delta`, bucketing winner-vs-baseline utility component deltas together with rank and root-score margin shape.
- The smoke validation used sampled plus active-blocker panels, Pro/Normal/Fast duels, `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=2`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `583.33s`.
- The log summarizer exported `2764` JSONL rows: `84` `policy_decision`, `988` `policy_axis`, `510` `corpus_axis_summary`, `671` `cross_budget_axis_state`, `510` `cross_budget_axis_rollup`, and one `coverage_gap_state`. The digest stayed no-source: `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `route_permission=postprocess_only`, `route_recommendation=build_outcome_corpus_v2`, and `source_candidate_rollups=[]`.
- The JSONL workbench stayed no-source with `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=94`.
- Focused `utility_component_delta,rank_score_delta` family overlap found shared contaminated evidence, not source permission. `utility_component_delta` had `5` candidate-bearing exact axes, `5` candidate-better joined states, zero baseline/no-policy joined states, and source statuses `singleton_non_regressing=4` plus `fragmented_no_source=1`; `rank_score_delta` had `5` candidate-bearing exact axes, `5` candidate-better joined states, one baseline-better joined state, and source statuses `fragmented_no_source=2`, `singleton_non_regressing=2`, and `baseline_save_risk=1`.
- State-level discrimination did not rescue the utility family. The focused families had `3` candidate states, `0` clean candidate states, `3` contaminated candidate states, `0` repeated candidate exact axes, and `5` singleton candidate exact axes per family.
- Focused utility/rank token scanning found only one clean repeated candidate token: `eval_score=winner_better_1_95`. It covered two active `outer_edge_mana_rows` candidate states, but remained `fragmented_repeated_candidate_tokens` with policy, branch, first-move-pair, and same-outcome fragmentation. There were zero low-fragmentation repeated tokens.
- Durable outcome: keep `axis=utility_component_delta` as corpus evidence, but do not build a runtime selector from shallow utility component deltas, rank deltas, score deltas, or small eval-score improvement. The next useful work is a postprocess-only token-pair discriminator for focused families; if that also fragments, move away from current policy-corpus axes toward a deeper root-pool/ProV4 diagnostic.

## Utility Token-Pair Discriminator

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now includes `axis_token_pair_discriminator`, which builds cross-field token conjunctions from focused axis families and classifies repeated pairs by baseline/no-policy contamination and fragmentation.
- Validation reused the sampled plus active-blocker two-state utility-component smoke shape across Pro/Normal/Fast duels, with corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `581.70s`.
- The log summarizer exported `2764` JSONL rows: `84` `policy_decision`, `988` `policy_axis`, `510` `corpus_axis_summary`, `671` `cross_budget_axis_state`, `510` `cross_budget_axis_rollup`, and one `coverage_gap_state`. The digest stayed no-source with `corpus_decision=coverage_gap`, `next_action=add_policy_or_root_feature`, `route_permission=postprocess_only`, `route_recommendation=build_outcome_corpus_v2`, and `source_candidate_rollups=[]`.
- The JSONL workbench stayed no-source with `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=94`. Focused `utility_component_delta` / `rank_score_delta` family overlap remained shared but contaminated: each family had `3` candidate states, `0` clean candidate states, `3` contaminated candidate states, `0` repeated candidate exact axes, and `5` singleton candidate exact axes.
- The focused token-pair report over `utility_component_delta,rank_score_delta` reported `axis_token_pair_decision=fragmented_repeated_candidate_tokens`, `candidate_token_pair_count=184`, `clean_repeated_candidate_token_pair_count=9`, `low_fragmentation_clean_repeated_candidate_token_pair_count=0`, `fragmented_clean_repeated_candidate_token_pair_count=9`, `clean_singleton_candidate_token_pair_count=52`, and `contaminated_candidate_token_pair_count=123`.
- The repeated clean pairs were not source permission. Top pairs such as `avoid_loss=same && eval_score=winner_better_1_95`, `deny_gain=same && eval_score=winner_better_1_95`, `drainer_attack=same && eval_score=winner_better_1_95`, `drainer_safety=same && eval_score=winner_better_1_95`, and `eval_score=winner_better_1_95 && score_delta=winner_worse_1_95` were fragmented by policy, branch, first-move pair, and/or same-outcome evidence.
- Durable outcome: keep the token-pair discriminator as Outcome Corpus V2 workbench infrastructure, but archive utility/rank token conjunctions as no-source. The next useful work should move away from current policy-corpus exact axes/tokens/pairs and toward diagnostics-only root-pool/ProV4 provenance before any runtime selector or comparator is written.

## Forced-Root Pool Provenance Workbench

- No runtime challenger survived this iteration. The retained change is postprocess-only: `scripts/summarize-automove-forced-root-oracle-log.py` now emits `root_pool_provenance` in the compact digest and supports `--jsonl-out` / `--jsonl-only` for normalized `forced_root_pool_summary`, `forced_root_pool_root`, and `forced_root_pool_axis` rows.
- A synthetic forced-root log smoke validated the new JSONL writer. The focused active Pro ply-7 coverage-gap board was then rerun with guarded continuation/source, `SMART_PRO_FORCED_ROOT_ORACLE_START_PLY=7`, `SMART_PRO_FORCED_ROOT_ORACLE_MAX_PLIES=56`, and root limit `24`. The ignored `smart_automove_pro_forced_root_oracle_probe` harness passed in `96.47s`.
- The compact digest stayed no-source: `oracle_decision=fragmented_root_features`, `next_action=return_to_outcome_corpus_feature_extraction`, `tested_roots=16`, `wins=7`, `draws=0`, `losses=9`, and `printed_all_tested_roots=true`.
- The JSONL export contained `641` rows: `1` `forced_root_pool_summary`, `16` `forced_root_pool_root`, and `624` `forced_root_pool_axis` rows. This is enough for queryable root-pool analysis without reading raw `FORCED_ROOT_ORACLE_ROOT` lines.
- Provenance did not create source permission. `clean_repeated_winner_provenance_count=0`; winning roots split across `ManaTempo` (`4`) and `SpiritImpact` (`3`), `advisor_ordered` (`4`) and `lower_unlisted` (`3`). The top perfect-looking provenance rows were all single-board single-root rows such as `advisor_family_rank=ordered|SpiritImpact|rank2_3`.
- Durable outcome: keep the forced-root pool JSONL/provenance workbench, but do not build a ProV4 comparator from the single ply-7 smoke. The next useful diagnostic is a multi-board provenance refresh over all three corrected active Pro coverage-gap divergence boards, then only source work if a repeated winner feature separates from losing roots across boards.

## Multi-Board Forced-Root Pool Provenance

- No runtime challenger survived this iteration. No runtime source was changed; the useful result is the refreshed three-board root-pool provenance no-go using the retained forced-root JSONL workbench.
- The active Pro coverage-gap recovery used the full reset portfolio, `SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers`, `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_pro`, `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=2`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, and max plies capped at `56`. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `117.99s` and recovered the expected ply-7, ply-20, and ply-40 boards from one `coverage_gap` entry.
- The three guarded forced-root oracle probes used guarded continuation/source, source max plies `56`, root limit `24`, and start plies `7`, `20`, and `40`. They passed in `96.38s`, `72.15s`, and `49.16s`.
- The combined forced-root digest stayed no-source: `oracle_decision=fragmented_root_features`, `next_action=return_to_outcome_corpus_feature_extraction`, `groups=3`, `groups_with_wins=3`, `tested_roots=49`, `wins=12`, `draws=0`, `losses=37`, and `printed_all_tested_roots=true`.
- The JSONL export contained `1963` rows: `3` `forced_root_pool_summary`, `49` `forced_root_pool_root`, and `1911` `forced_root_pool_axis` rows.
- Root-pool provenance did not separate winners from losers. `clean_repeated_winner_provenance_count=0`; repeated all-board winner rows were contaminated by losing roots: `rank_band=rank8_plus` had `8` wins and `16` losses, `path=lower_unlisted` had `8` wins and `21` losses, `advisor_bucket=unlisted` had `8` wins and `24` losses, and `safety_detail=safe` appeared on all `37` losing roots. Narrower multi-board rows such as `SpiritImpact|rank2_3|safe` and `ManaTempo|rank8_plus|safe` were also loser-contaminated.
- The retained postprocess script `scripts/summarize-automove-forced-root-pool-jsonl.py` then scanned the `forced_root_pool_root` / `forced_root_pool_axis` rows for exact-axis, token, and root-level token-pair winner signals. It stayed no-source with `workbench_decision=fragmented_or_singleton_winner_signals`, `source_permission=no_source`, and zero clean repeated winner signals in every section. Exact axes had `91` winner signals, `0` clean repeated, `2` clean singleton, and `89` nonwinner-contaminated; tokens had `153 / 0 / 2 / 151`; token pairs had `7924 / 0 / 324 / 7600`.
- Durable outcome: archive current forced-root provenance fields as no-source. The JSONL discriminator is retained infrastructure, but do not write a ProV4 comparator from current path, advisor, family, rank, safety, progress, reply/followup, score, utility, exact-axis, token, or token-pair fields alone. The next useful work needs a genuinely new root feature.

## Forced-Root Race Geometry

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: forced-root oracle rows now print `score_path_steps`, immediate mana scoring/pickup flags, and the forced-root summarizer exports coarse `score_path_steps`, `safe_super_steps`, `safe_opp_steps`, `root_race_shape`, `family_rank_race_shape`, and `mana_score_now` axes.
- The same three active Pro coverage-gap boards were replayed directly because the policy-matrix recovery code was unchanged. The ignored `smart_automove_pro_forced_root_oracle_probe` harness passed for ply `7`, `20`, and `40` in `101.35s`, `75.66s`, and `52.63s`.
- Root coverage did not move: `groups=3`, `groups_with_wins=3`, `tested_roots=49`, `wins=12`, `draws=0`, `losses=37`, and `oracle_decision=fragmented_root_features`.
- The race-geometry JSONL export contained `2257` rows: `3` `forced_root_pool_summary`, `49` `forced_root_pool_root`, and `2205` `forced_root_pool_axis` rows.
- Race geometry did not separate winners from losers. `clean_repeated_winner_provenance_count=0`; `score_path_steps=unreachable` had `12` wins and `36` losses, `mana_score_now=super_score_false|opp_score_false|super_pickup_false|opp_pickup_false` had `12` wins and `37` losses, and `family_rank_race_shape=SpiritImpact|rank2_3|unreachable|five_twelve|five_twelve` still had a losing root.
- The forced-root pool JSONL discriminator stayed no-source with `workbench_decision=fragmented_or_singleton_winner_signals`, `source_permission=no_source`, and zero clean repeated winner signals in every section. Exact axes had `104` winner signals, `0` clean repeated, `2` clean singleton, and `102` nonwinner-contaminated; tokens had `184 / 0 / 2 / 182`; token pairs had `11811 / 0 / 401 / 11410`.
- Durable outcome: keep the race-geometry instrumentation as diagnostics, but archive absolute after-root race buckets as no-source. The next useful work in this area is a true before/after root-race delta feature; do not build a comparator from absolute post-root score-path or mana-race shape.

## Forced-Root Race Delta

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: forced-root oracle rows now print one `race_delta` feature that compares pre-root and post-root score path, safe supermana path, safe opponent-mana path, and immediate score-window posture.
- The same three active Pro coverage-gap boards were replayed directly because the policy-matrix recovery code was unchanged. The ignored `smart_automove_pro_forced_root_oracle_probe` harness passed for ply `7`, `20`, and `40` in `97.86s`, `73.39s`, and `51.37s`.
- Root coverage did not move: `groups=3`, `groups_with_wins=3`, `tested_roots=49`, `wins=12`, `draws=0`, `losses=37`, and `oracle_decision=fragmented_root_features`.
- The race-delta JSONL export contained `2306` rows: `3` `forced_root_pool_summary`, `49` `forced_root_pool_root`, and `2254` `forced_root_pool_axis` rows.
- Race deltas did not separate winners from losers. `clean_repeated_winner_provenance_count=0`; `race_delta=score_lost_reachable|super_new_reachable|opp_new_reachable|window_same_zero` had `8` wins and `24` losses, while `race_delta=score_lost_reachable|super_new_reachable|opp_new_reachable|window_lost_window` had `4` wins and `12` losses.
- The forced-root pool JSONL discriminator stayed no-source with `workbench_decision=fragmented_or_singleton_winner_signals`, `source_permission=no_source`, and zero clean repeated winner signals in every section. Exact axes had `106` winner signals, `0` clean repeated, `2` clean singleton, and `104` nonwinner-contaminated; tokens had `191 / 0 / 2 / 189`; token pairs had `12919 / 0 / 413 / 12506`.
- Durable outcome: keep `race_delta` as diagnostics, but archive before/after race deltas as no-source. The following root-trajectory pass handled the immediate non-race event-geometry idea; do not return to race deltas as source evidence.

## Forced-Root Root Trajectory

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: forced-root oracle rows now print `root_trajectory`, a coarse primary-event signature with action, actor, payload, from/to zone, forward/center movement, input count, event count, and score/pickup/faint/special flags.
- The same three active Pro coverage-gap boards were replayed directly because the policy-matrix recovery code was unchanged. The ignored `smart_automove_pro_forced_root_oracle_probe` harness passed for ply `7`, `20`, and `40` in `100.30s`, `75.64s`, and `52.32s`.
- Root coverage did not move: `groups=3`, `groups_with_wins=3`, `tested_roots=49`, `wins=12`, `draws=0`, `losses=37`, `oracle_decision=fragmented_root_features`, and `clean_repeated_winner_provenance_count=0`.
- The trajectory JSONL export contained `2404` rows: `3` `forced_root_pool_summary`, `49` `forced_root_pool_root`, and `2352` `forced_root_pool_axis` rows.
- Trajectory geometry did not separate winners from losers. The top repeated trajectory, `action_spirit_target|actor_spirit|payload_no_payload|from_own_side|to_own_mid|forward_advance|center_toward_center|inputs3|count1|score_false|pickup_false|faint_false|special_true`, had `2` wins and `2` losses; broad tokens such as `from_own_side`, `to_own_mid`, and `forward_advance` appeared on losing roots across all three labels.
- The forced-root pool JSONL discriminator stayed no-source with `workbench_decision=fragmented_or_singleton_winner_signals`, `source_permission=no_source`, and zero clean repeated winner signals in every section. Exact axes had `129` winner signals, `0` clean repeated, `15` clean singleton, and `114` nonwinner-contaminated; tokens had `269 / 0 / 15 / 254`; token pairs had `24451 / 0 / 2174 / 22277`.
- Durable outcome: keep `root_trajectory` as diagnostics, but archive root action, actor, payload, board-zone, movement, input-count, and event-count geometry as no-source. The next root-pool iteration should add a postprocess contrast report comparing each winning root against nearest losing siblings before inventing another feature family.

## Forced-Root Root-Pool Contrast Report

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-forced-root-pool-jsonl.py --contrast-report` now compares each winning root with its nearest losing sibling within the same label and summarizes differing fields plus winner-only signals.
- The same three active Pro coverage-gap boards were replayed directly because the policy-matrix recovery code was unchanged. The ignored `smart_automove_pro_forced_root_oracle_probe` harness passed for ply `7`, `20`, and `40` in `103.20s`, `74.58s`, and `49.12s`.
- Root coverage did not move: `groups=3`, `groups_with_wins=3`, `tested_roots=49`, `wins=12`, `draws=0`, `losses=37`, and `oracle_decision=fragmented_root_features`. The JSONL export again contained `2404` rows: `3` `forced_root_pool_summary`, `49` `forced_root_pool_root`, and `2352` `forced_root_pool_axis` rows.
- The existing exact/token/token-pair discriminator stayed no-source: exact axes had `129` winner signals, `0` clean repeated, `15` clean singleton, and `114` nonwinner-contaminated; tokens had `269 / 0 / 15 / 254`; token pairs had `24451 / 0 / 2174 / 22277`.
- The new contrast report also stayed no-source. It compared all `12` winning roots against nearest losing siblings across all `3` labels, but found `repeated_field_delta_count=0` and `repeated_winner_field_count=0`. Exact field deltas such as `advisor_bucket:ordered->unlisted`, `path:advisor_ordered->lower_unlisted`, `rank_band:rank2_3->rank4_7`, and specific `root_trajectory` swaps were all singleton-label.
- The only repeated contrast rows were winner-only token signals, with `repeated_winner_only_signal_count=14`; the top rows were archived trajectory atoms such as `root_trajectory:atom=forward_advance` and `family_rank_trajectory:atom=forward_advance` at `4` winner roots across `2` labels, plus `center_away_center`, `center_toward_center`, `forward_retreat`, and `from_own_side` at `3` winner roots across `2` labels.
- Durable outcome: keep the contrast report as a diagnostic lens, but do not build a root comparator from current contrast output. The next useful work should return to Outcome Corpus V2 and add an outcome-level contrast report over normalized rows, excluding archived root-pool/race/trajectory families before selecting another feature family.

## Outcome Corpus Contrast Report

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py --contrast-report` now reconstructs policy records from normalized `policy_decision` / `policy_axis` rows, compares each `candidate_better` record with nearest same-state `baseline_better`, `no_policy`, and `same_outcome` blockers, and summarizes candidate-only signals and families. The report supports `--exclude-families` so archived root-pool/race/trajectory families can be removed from contrast output.
- The first unfiltered smoke used `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=2`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `84.38s`.
- That unfiltered smoke was guarded-covered and did not exercise candidate contrast: `total_games=2`, `baseline_wins=2`, `shared_wins=2`, `candidate_only_wins=0`, `no_policy_wins=0`, `corpus_decision=no_candidate_route`, and `route_permission=no_source`. The JSONL export contained `484` rows: `14` `policy_decision`, `154` `policy_axis`, `103` `corpus_axis_summary`, `110` `cross_budget_axis_state`, and `103` `cross_budget_axis_rollup`. The contrast report had `candidate_record_count=0` and `contrast_decision=no_outcome_contrast_available`.
- The focused active Pro validation used `SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers`, `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_pro`, `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=4`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored harness passed in `220.45s`.
- The focused active Pro slice stayed no-source: `total_games=4`, `baseline_wins=1`, `candidate_any_wins=3`, `candidate_only_wins=2`, `no_policy_wins=1`, `shared_wins=1`, `corpus_decision=coverage_gap`, `route_permission=postprocess_only`, and `route_recommendation=build_outcome_corpus_v2`. The JSONL export contained `1029` rows: `28` `policy_decision`, `340` `policy_axis`, `202` `corpus_axis_summary`, `256` `cross_budget_axis_state`, `202` `cross_budget_axis_rollup`, and `1` `coverage_gap_state`.
- The existing JSONL workbench still had no source candidates on that active slice: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=47`. Token reports also stayed fragmented: `axis_token_decision=fragmented_repeated_candidate_tokens` with `36` candidate tokens, `21` clean repeated, `0` low-fragmentation repeated, and `15` clean singleton; token pairs had `144` candidate pairs, `61` clean repeated, `0` low-fragmentation repeated, and `83` clean singleton.
- The new outcome contrast report found active-only pressure but no source permission. It reported `contrast_decision=fragmented_repeated_outcome_contrast`, `candidate_record_count=3`, `contrast_count=3`, `candidate_only_signal_count=112`, `repeated_candidate_only_signal_count=13`, `low_fragmentation_repeated_signal_count=0`, `fragmented_repeated_signal_count=13`, `candidate_only_family_count=54`, `repeated_candidate_only_family_count=28`, `low_fragmentation_repeated_family_count=0`, and `fragmented_repeated_family_count=28`.
- The repeated contrast signals were fragmented by first-move pair and often by policy. Top rows included `candidate_branch=candidate_execute`, the exact `decision_stage` branch-change axis, `root_score_delta=winner_score_same_or_close_better`, `transition=branch_changed`, `winner_score_delta=winner_score_same_or_close_better`, `winner_vs_baseline_score=equal`, `reply_delta=winner_floor_better_96_256`, `followup_delta=winner_floor_better_96_256`, `role:atom=legacy`, and `winner_reply_floor` spirit-development rows. Top repeated families included `advisor`, `primary`, `root_safety_detail`, `safety_progress`, `score_delta`, and `winner_vs_baseline_primary` at two states but pair-fragmented, while broader families such as `candidate_branch`, `decision_stage`, `family`, `followup_delta`, and `rank` were pair/policy fragmented.
- The retained follow-up change adds `--contrast-families` to `scripts/summarize-automove-outcome-jsonl.py`, filtering contrast signals to a caller-supplied family set while preserving the default all-family contrast report. This lets active-only contrast leads be validated without rereading broad noisy families.
- The focused sampled Pro validation used `SMART_PRO_POLICY_MATRIX_PANEL_FILTER=sampled`, `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_pro`, `SMART_PRO_POLICY_MATRIX_TOTAL_STATE_LIMIT=8`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at eight, max plies capped at `56`, and the full reset portfolio. The ignored harness passed in `356.31s`.
- The sampled slice killed the active contrast-family lead. It stayed `corpus_decision=baseline_save_risk`, `next_action=avoid_selector`, and `route_permission=no_source`: `total_games=8`, `baseline_wins=6`, `candidate_any_wins=8`, `candidate_only_wins=2`, `no_policy_wins=0`, and `shared_wins=6`. The source blocker was broad zero-window safe exact pressure with `candidate_only_states=2` and `baseline_better_states=4`.
- The sampled JSONL export contained `1717` rows: `56` `policy_decision`, `632` `policy_axis`, `283` `corpus_axis_summary`, `463` `cross_budget_axis_state`, and `283` `cross_budget_axis_rollup`. The JSONL workbench stayed `blocked_candidate_axes` with `source_candidate_axis_count=0`, `blocked_candidate_axis_count=53`, and record classes `same_outcome=42`, `baseline_better=11`, `candidate_better=3`.
- The focused contrast report over `advisor,primary,root_safety_detail,safety_progress,score_delta,winner_vs_baseline_primary,candidate_branch,decision_stage,family,followup_delta,rank,role,winner_reply_floor` returned `contrast_decision=singleton_outcome_contrast_only`, `source_permission=no_source`, `candidate_record_count=3`, `contrast_count=3`, `candidate_only_signal_count=35`, `repeated_candidate_only_signal_count=0`, `candidate_only_family_count=13`, and `repeated_candidate_only_family_count=0`.
- Durable outcome: keep the Outcome Corpus V2 contrast report and focused `--contrast-families` filter as workbench infrastructure, but archive the active contrast-family shortlist as source evidence. The next useful work must add a genuinely new below-policy/root feature family or build the first test-only ProV4 unified root-pool snapshot before running another outcome slice.

## Outcome Corpus Root Ordering Profile

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: Outcome Corpus mechanism axes now emit `root_ordering_profile` and `winner_root_ordering`, comparing or recording root efficiency, spirit setup gain, interview soft priority, awake-spirit retention, progress, rank delta, and score delta.
- The bounded sampled+active cross-budget smoke used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1`, corpus records enabled, portfolio mechanism classes enabled, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `276.54s`.
- The run stayed no-source: `corpus_decision=coverage_gap`, `route_permission=no_source`, `total_games=6`, `baseline_wins=3`, `candidate_any_wins=5`, `candidate_only_wins=2`, `no_policy_wins=1`, `shared_wins=3`, and `route_recommendation=baseline_save_risk_only`. The best baseline-risk route was exact zero-window safe pressure with `candidate_only_states=1` and `baseline_better_states=2`.
- The JSONL export contained `1592` rows: `42` `policy_decision`, `540` `policy_axis`, `321` `corpus_axis_summary`, `367` `cross_budget_axis_state`, `321` `cross_budget_axis_rollup`, and `1` `coverage_gap_state`. Cross-budget source status still had no source rollups: `source_candidate_rollups=[]`, with statuses `no_candidate_signal=249`, `singleton_non_regressing=40`, `fragmented_no_source=19`, `baseline_save_risk=9`, and `coverage_gap=4`.
- Root ordering did not separate the candidate repairs. The top candidate-bearing exact root-ordering row was `axis=winner_root_ordering efficiency=eff_bad_1_95 setup_gain=setup_high_80_plus soft_priority=soft_zero keeps_awake=false progress=spirit_development rank=rank1_2`, but it had both `candidate_better_states=1` and `baseline_better_states=1`.
- The focused contrast report over `root_ordering_profile,winner_root_ordering` also stayed no-source: `contrast_decision=fragmented_repeated_outcome_contrast`, `candidate_record_count=4`, `contrast_count=10`, `candidate_only_signal_count=8`, `repeated_candidate_only_signal_count=0`, `candidate_only_family_count=2`, and `repeated_candidate_only_family_count=2`. Both repeated families were fragmented by `branch|duel|pair|policy`.
- Durable outcome: keep root-ordering profile axes as Outcome Corpus diagnostics, but do not build a runtime selector from efficiency, setup-gain, soft-priority, awake-spirit, progress, rank, or score buckets. The next useful work is a diagnostics-only ProV4 unified root-pool snapshot that joins guarded selected, pre-accept, head, advisor, and portfolio policy roots before any comparator is written.

## Outcome Corpus ProV4 Root-Pool Snapshot

- No runtime challenger survived this iteration. The retained source change is diagnostics-only: `smart_automove_pro_policy_matrix_probe` now accepts `SMART_PRO_POLICY_MATRIX_INCLUDE_PROV4_ROOT_POOL=true` and emits capped `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_SUMMARY` / `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. The rows join to Outcome Corpus V2 by panel, duel, seed, repeat, opening, variant, side, candidate, first-diff board, and first-move pair.
- The policy-matrix summarizer now exports those rows as `pro_v4_root_pool_summary` and `pro_v4_root_pool_root` JSONL records and includes a compact `pro_v4_root_pool_summary` aggregate with origin, policy-output, and winning-root feature counts.
- The bounded sampled+active cross-budget smoke used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1`, corpus records enabled, portfolio mechanism classes enabled, ProV4 root-pool rows enabled, root-pool record/root caps `12/12`, route buckets capped at five, max plies capped at `56`, and the full reset portfolio. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `284.45s`.
- The outcome gate did not improve: `corpus_decision=coverage_gap`, `route_permission=no_source`, `total_games=6`, `baseline_wins=3`, `candidate_any_wins=5`, `candidate_only_wins=2`, `no_policy_wins=1`, `shared_wins=3`, `source_candidate_rollups=[]`, and `route_recommendation=baseline_save_risk_only`. The best baseline-risk route remained exact zero-window safe pressure with `candidate_only_states=1` and `baseline_better_states=2`.
- The JSONL export contained `1745` rows: `42` `policy_decision`, `540` `policy_axis`, `12` `pro_v4_root_pool_summary`, `141` `pro_v4_root_pool_root`, `321` `corpus_axis_summary`, `367` `cross_budget_axis_state`, `321` `cross_budget_axis_rollup`, and `1` `coverage_gap_state`.
- The root-pool snapshot points away from missing-root recovery. Across the capped rows, `20/20` winning policy-output roots were live in the guarded scored pool, `28/28` policy-output roots were live, and `omitted_policy_root_count=0`.
- Candidate-only winning roots were not clean enough for a comparator: all `6` were advisor-ordered with stable reply floor, but they split by family (`4` `SpiritImpact`, `2` `ManaTempo`), path (`4` `advisor_ordered`, `2` `injected_forced`), progress (`2` each safe-step, spirit-development, spirit-setup), rank (`2` each rank0, rank1_2, rank3_5), and safety (`4` vulnerable, `2` safe).
- Durable outcome: keep the ProV4 root-pool snapshot rows and JSONL export as workbench infrastructure. Do not write a ProV4 comparator from the first snapshot or from missing-root assumptions; the next useful work is a postprocess discriminator over `pro_v4_root_pool_root` rows that compares candidate-only winning policy roots with guarded selected/pre-accept/head roots and same-state blockers.

## Outcome Corpus ProV4 Root-Pool Discriminator

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now emits `pro_v4_root_pool_discriminator`, comparing candidate-only winning policy-output root signals against guarded selected/pre-accept/head roots and same-state blocker roots from normalized `pro_v4_root_pool_root` rows.
- The bounded sampled+active cross-budget smoke used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1`, corpus records enabled, portfolio mechanism classes enabled, ProV4 root-pool rows enabled, root-pool record/root caps `12/12`, route buckets capped at five, and max plies capped at `56`. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `118.16s`.
- The outcome gate stayed no-source: `corpus_decision=coverage_gap`, `route_permission=no_source`, `total_games=6`, `baseline_wins=3`, `candidate_any_wins=5`, `candidate_only_wins=2`, `no_policy_wins=1`, `shared_wins=3`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=60`.
- The JSONL export contained `1067` rows: `12` `policy_decision`, `252` `policy_axis`, `12` `pro_v4_root_pool_summary`, `150` `pro_v4_root_pool_root`, `208` `corpus_axis_summary`, `224` `cross_budget_axis_state`, `208` `cross_budget_axis_rollup`, and `1` `coverage_gap_state`.
- The discriminator did not find source permission. It saw `6` candidate-only winning policy roots across `2` cross-budget states, `92` blocker roots (`24` guarded selected/pre-accept/head roots and `82` same-state blockers), and `79` candidate-bearing root-pool signals. It reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `fragmented_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=8`, `contaminated_candidate_signal_count=71`, `discriminator_decision=singleton_root_pool_signal`, and `source_permission=no_source`.
- The only clean rows were singletons: `root_pool:family_path=SafeSupermanaProgress|top3_unlisted`, `root_pool:family_path=SpiritImpact|lower_unlisted`, and exact `reply_floor` / `followup_floor` values `508`, `626`, and `640`. Repeated candidate rows were blocker-contaminated and fragmented; examples include `root_pool:setup_progress=setup_high_80_plus|spirit_development`, `root_pool:reply_progress=stable_floor|spirit_development`, `root_pool:family_progress=SpiritImpact|spirit_development`, `root_pool:progress=spirit_development`, `root_pool:family_reply=SpiritImpact|stable_floor`, and `root_pool:rank_bucket=rank1_2`.
- Durable outcome: keep the ProV4 root-pool discriminator as a source gate, but archive current root-pool fields as no-source. Do not write a comparator from family, path, progress, rank, safety, advisor, reply/followup floors, efficiency, setup gain, soft priority, or the current compound root-pool fields. The next useful root-pool work needs a genuinely new measured root feature or a root-vs-guarded-blocker delta, not a rerun of the same discriminator.

## Outcome Corpus ProV4 Guarded-Delta Discriminator

- No runtime challenger survived this iteration. The retained source change is postprocess-only: `scripts/summarize-automove-outcome-jsonl.py` now emits `pro_v4_root_pool_guarded_delta_discriminator`, comparing candidate-only winning policy roots against same-snapshot guarded selected/pre-accept/head roots and rejecting deltas that also appear on same-state policy-output blocker roots.
- The bounded sampled+active cross-budget smoke used `SMART_PRO_POLICY_MATRIX_STATE_LIMIT=1`, corpus records enabled, portfolio mechanism classes enabled, ProV4 root-pool rows enabled, root-pool record/root caps `12/12`, route buckets capped at five, and max plies capped at `56`. The ignored `smart_automove_pro_policy_matrix_probe` harness passed in `118.23s`.
- The outcome gate stayed no-source: `corpus_decision=coverage_gap`, `route_permission=no_source`, `total_games=6`, `baseline_wins=3`, `candidate_any_wins=5`, `candidate_only_wins=2`, `no_policy_wins=1`, `shared_wins=3`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=60`.
- The JSONL export contained `1067` rows: `12` `policy_decision`, `252` `policy_axis`, `12` `pro_v4_root_pool_summary`, `150` `pro_v4_root_pool_root`, `208` `corpus_axis_summary`, `224` `cross_budget_axis_state`, `208` `cross_budget_axis_rollup`, and `1` `coverage_gap_state`.
- The guarded-delta discriminator did not find source permission. It compared `6` candidate-only winning policy roots across `2` cross-budget states, producing `14` candidate guarded-delta comparisons. Same-state policy-output blockers produced `24` blocker guarded-delta comparisons from `15` blocker roots. It reported `candidate_delta_signal_count=140`, `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `fragmented_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=35`, `contaminated_candidate_delta_signal_count=105`, `discriminator_decision=singleton_root_pool_guarded_delta`, and `source_permission=no_source`.
- The only clean rows were singleton deltas, including guarded-selected `reply_floor_delta` / `followup_floor_delta=candidate_worse_1_95`, guarded pre-accept/selected `progress=spirit_setup->spirit_development`, guarded pre-accept/selected `rank_bucket=rank3_5->rank1_2`, and guarded-head `rank_delta=candidate_better_6_plus`. Repeated deltas were blocker-contaminated and fragmented; examples include guarded-selected `progress_change=different`, guarded-head `advisor_bucket_change=different`, guarded-head `score_delta=candidate_worse_1_95`, guarded pre-accept `family_change=different`, and guarded pre-accept `efficiency=eff_good_1_95->eff_bad_1_95`.
- Durable outcome: keep the guarded-delta discriminator as a diagnostic gate, but archive current root-vs-guarded deltas as no-source. Do not write a comparator from current guarded selected/pre-accept/head deltas over family, rank, advisor, path, safety, progress, ordering buckets, score, reply floor, or followup floor. The next useful work needs a genuinely new measured root feature, not another rerun of current root-pool fields or current guarded deltas.

## Outcome Corpus Post-Root Feature Family Cleanup

- No runtime challenger survived this cleanup wave. The retained source changes were diagnostics and workflow only: outcome-corpus postprocessing, structural-scout routing, candidate metadata, and scratch cleanup affordances. Public Pro remained `frontier_pro_v2_guarded`; `shipping_pro_search` remained the retained search-only baseline.
- The latest sampled structural scout with dashboard fast-fail plus sampled `vs_shipping_fast` outcome corpus stayed no-source. The dashboard stopped at `not_promising` after guarded went `7-5` versus shipping Pro on sampled variants (`win_rate=0.5833`, `confidence=0.6128`, `candidate_avg_ms=135.34`). The postprocessed corpus saw one sampled `split_flank_mana_rows` joined state as shared-only guarded coverage: `baseline_wins=1`, `candidate_any_wins=1`, `shared_wins=1`, `candidate_only_wins=0`, `no_policy_wins=0`, `corpus_decision=no_candidate_route`, `route_permission=no_source`, `source_candidate_rollups=0`, and `blocked_candidate_rollups=0`.
- The previous active-blocker structural scout also stayed no-source. The dashboard stopped at `not_promising` after guarded went `3-3` versus shipping Pro on active blockers (`win_rate=0.50`, `confidence=0.00`, `candidate_avg_ms=143.03`). The postprocessed corpus completed one joined state with `corpus_decision=singleton_no_source`, `route_permission=no_source`, `source_candidate_rollups=0`, `blocked_candidate_rollups=8`, and `blocked_candidate_axes=60`; blocked families were singleton or fragmented residue led by advisor, decision-stage/timing, exact-timing, family, rank, rank-score, reply-floor-progress, role, and root-ordering profile.
- The Outcome Corpus V2 workbench now emits ProV4 root-pool `signal_field_rollups`, `signal_family_rollups`, `delta_field_rollups`, and `delta_family_rollups`. The bounded sampled+active run stayed no-source: `coverage_gap`, `0` source-candidate axes, `150` root rows, `6` candidate-only winning policy roots, root-pool discriminator `singleton_root_pool_signal` with `0` low-fragmentation repeated families, `32` clean singleton signals, and `395` contaminated signals; guarded-delta discriminator `singleton_root_pool_guarded_delta` with `0` low-fragmentation repeated families, `153` clean singleton deltas, and `316` contaminated deltas.
- Root-pool family rollups archived these current feature families as no-source: board-resource, root-transition/event-footprint, lane-shape, exact-pressure, worst-reply/event-footprint, consumable, mana-path, role-state, support-guard, territory, and turn-status were fully contaminated; core-root, base-recovery, engagement, attack-exposure, action-threat, mobility, legal-fanout, and scoreboard/turn-budget remained singleton-plus-contaminated.
- The post-root feature sequence did not produce source permission. Exact-pressure, board-resource custody/material, scoreboard/turn-budget, legal-transition fanout, attack-exposure, support-guard, territory, mana-path, consumable, engagement, mobility, action-threat, role-state/loadout, base-recovery, lane-shape, root-transition/event footprint, and worst-reply event footprint values were repeated but blocker-contaminated, shared with non-candidate wins, clean singleton-only, or present only on a no-candidate-route slice.
- The immediate reply-spectrum feature added post-root opponent reply counts for reply wins, score gains/drops, and turn-return shape. The bounded sampled `vs_shipping_fast` smoke passed but stayed no-source before any candidate-only root rows appeared: global stoplight `shared_only`, postprocess `corpus_decision=no_candidate_route`, `route_permission=no_source`, `0` source-candidate axes, `0` source-candidate rollups, root-pool discriminator `no_candidate_only_winning_policy_roots`, guarded-delta discriminator `no_candidate_guarded_delta_comparisons`, and `29` root rows.
- Durable outcome: keep the postprocess/workbench infrastructure, but do not use current root-pool families, guarded deltas, exact-pressure, coarse resource/outcome/legal/attack/support/territory/mana/consumable/engagement/mobility/action-threat/role/base/lane/transition/worst-reply/reply-spectrum features as source evidence. The next useful root-pool work needs a genuinely new measured feature that creates repeated low-fragmentation candidate-only separation and survives baseline-save, coverage-gap, singleton, policy/branch/pair, and same-outcome blocker checks.

## Active Fast Root-Pool Structural Scout

- No runtime or test-only Pro challenger survived this iteration. Runtime source stayed unchanged; the retained output is knowledge only.
- Hygiene passed before the scouts: `python3 -m py_compile` succeeded for the automove summarizers, and `./scripts/cleanup-automove-iteration-artifacts.sh --dry-run` reported no matching scratch artifacts.
- The bounded sampled Fast scout used `SMART_PRO_POLICY_MATRIX_PANEL_FILTER=sampled` and `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_fast` through `./scripts/run-automove-structural-scout.sh --outcome-corpus frontier_pro_v2_guarded`. The dashboard fast-failed as `not_promising` after guarded went `7-5` versus shipping Pro on sampled variants (`win_rate=0.5833`, `confidence=0.6128`, candidate average about `135ms`). The outcome postprocess was `corpus_decision=no_candidate_route`, `route_permission=no_source`, `source_candidate_rollups=0`, `blocked_candidate_rollups=0`, and workbench `decision=no_candidate_axis`.
- The bounded active Fast scout used `SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers` and `SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_fast`. It also dashboarded as `not_promising`; the outcome postprocess found candidate signal but no source permission: `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `source_blocker.kind=fragmented_routes`, `clean_fragmented_routes=7`, `clean_low_fragmentation_routes=0`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=105`, and workbench `decision=blocked_candidate_axes`.
- The active Fast root-pool rerun added `SMART_PRO_POLICY_MATRIX_INCLUDE_PROV4_ROOT_POOL=true`, `SMART_PRO_POLICY_MATRIX_PROV4_ROOT_POOL_RECORD_LIMIT=8`, and `SMART_PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT_LIMIT=12`. It did not change the source decision: `root_pool_decision=fragmented_repeated_root_pool_signal`, `guarded_delta_decision=fragmented_repeated_root_pool_guarded_delta`, and both source permissions were `no_source`.
- The repeated active Fast repair shape was the already-dangerous lower-live safe ManaTempo / safe-step progress family: examples included `axis=winner_root role=other live=lower_live family=ManaTempo advisor=advisor_unlisted safety=safe safety_detail=safe progress=safe_step_progress rank=rank6_plus`, zero-window safe exact pressure, and no-rejoin/different-final continuation. Every repeated row was still split by first move pair, and broader rows also split by candidate policy or branch.
- Durable outcome: do not build a new Pro mode from active Fast lower-live safe-step roots, zero-window safe exact pressure, no-rejoin continuation, current root-pool fields, or current guarded-delta fields. The next ProV4 attempt needs a genuinely new measured root feature before another candidate or comparator is worth registering.

## ProV4 Root-Aspiration Windowing No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_root_aspiration` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and restored `enable_root_aspiration=true` inside the guarded frontier runtime.
- The tiny sampled Fast smoke ran successfully but did not meet the sweep pass threshold: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=217.54`, and `opponent_avg_ms=4.17`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `5-7` across `12` games (`win_rate=0.4167`, `confidence=0.0000`), with `candidate_avg_ms=169.68` versus shipping `61.10`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: root aspiration windowing is archived as another direct ProV4 config no-go. Do not reopen root-window or aspiration toggles unless a future corpus/root feature first separates candidate wins from guarded saves and quiet-save regressions.

## ProV4 Walk-Threat Safety No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_walk_threat_safety` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and enabled `enable_walk_threat_prefilter=true` inside the guarded frontier runtime with `root_walk_threat_score_margin=1800`.
- The tiny sampled Fast smoke ran successfully but did not meet the sweep pass threshold: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=209.81`, and `opponent_avg_ms=4.55`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=143.94` versus shipping `92.10`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: drainer walk-threat safety filtering is archived as another direct ProV4 config no-go. Do not reopen walk-threat root filters or walk-threat safety margins unless a future corpus/root feature first separates quiet saves from quiet-progress regressions.

## ProV4 No-Quiescence No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_quiescence` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled tactical quiescence leaf extension inside the guarded frontier runtime (`enable_quiescence_search=false`, `quiescence_node_budget=0`, `quiescence_tactical_enum_limit=0`).
- The tiny sampled Fast smoke ran successfully but did not meet the sweep pass threshold: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=166.49`, and `opponent_avg_ms=4.61`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `8-4` across `12` games (`win_rate=0.6667`, `confidence=0.8062`), with `candidate_avg_ms=154.89` versus shipping `75.45`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: tactical quiescence toggling is archived as another direct ProV4 config no-go. Do not reopen quiescence leaf-extension toggles unless a future corpus/root feature first separates tactical-leaf wins from quiet-save losses.

## ProV4 Tactical-Prepass No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_tactical_prepass` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and restored `enable_forced_tactical_prepass=true` inside the guarded frontier runtime.
- The tiny sampled Fast smoke ran successfully but did not meet the sweep pass threshold: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=195.01`, and `opponent_avg_ms=3.86`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `6-6` across `12` games (`win_rate=0.5000`, `confidence=0.0000`), with `candidate_avg_ms=121.98` versus shipping `62.46`; weakest variant was `alternating_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: forced tactical prepass is archived as another direct ProV4 config no-go. Do not reopen tactical-prepass toggles unless a future corpus/root feature first separates tactical saves from quiet-save losses without drainer-pressure contamination.

## ProV4 No-Futility No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_futility` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled futility pruning inside the guarded frontier runtime (`enable_futility_pruning=false`).
- The tiny sampled Fast smoke ran successfully but did not meet the sweep pass threshold: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=233.58`, and `opponent_avg_ms=4.37`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `8-4` across `12` games (`win_rate=0.6667`, `confidence=0.8062`), with `candidate_avg_ms=171.62` versus shipping `61.13`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: futility-pruning toggling is archived as another direct ProV4 config no-go. Do not reopen futility-pruning toggles unless a future corpus/root feature first separates pruned tactical wins from quiet-save losses.

## ProV4 No-Quiet-Reductions No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_quiet_reductions` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled quiet move reductions inside the guarded frontier runtime (`enable_quiet_reductions=false`).
- The tiny sampled Fast smoke ran successfully but failed the sweep pass threshold: `wins=1`, `losses=1`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=330.17`, and `opponent_avg_ms=4.13`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=340.12` versus shipping `64.73`; variant rows were balanced except forward-bridge `3-1`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: quiet-reduction toggling is archived as another direct ProV4 config no-go. Do not reopen quiet-reduction toggles unless a future corpus/root feature first separates quiet-save wins from baseline saves and cost pressure.

## ProV4 Allocation And Tiebreak Toggle No-Go

- No runtime or test-only Pro challenger survived this iteration. Temporary sweep candidates for disabling selective extensions, disabling two-pass root allocation, and disabling deterministic interview tiebreak were removed after validation; the retained output is knowledge only.
- `frontier_pro_v4_no_selective_extensions` preserved the public `frontier_pro_v2_guarded` wrapper but disabled selective extensions (`enable_selective_extensions=false`, `max_extensions_per_path=0`, `selective_extension_node_share_bp=0`). The tiny sampled Fast smoke failed immediately: `wins=0`, `losses=2`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=131.64`, and `opponent_avg_ms=4.46`.
- `frontier_pro_v4_single_pass_root_allocation` preserved the guarded wrapper but disabled two-pass root allocation (`enable_two_pass_root_allocation=false`). The tiny sampled Fast smoke reached `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=160.84`, and `opponent_avg_ms=4.48`, but the sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=122.46` versus shipping `61.09`; weakest variant was `inner_wedge_mana_rows=0-2`.
- `frontier_pro_v4_no_deterministic_tiebreak` preserved the guarded wrapper but disabled deterministic interview tiebreak (`enable_interview_deterministic_tiebreak=false`). The tiny sampled Fast smoke reached `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=212.51`, and `opponent_avg_ms=4.32`, but the sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=141.74` versus shipping `60.50`; weakest variant was again `inner_wedge_mana_rows=0-2`.
- The sampled dashboard stoplight was `not_promising` / `partial_dashboard` for both dashboarded candidates, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: direct selective-extension, root-allocation, and deterministic interview-tiebreak toggles are archived as ProV4 config no-gos. Do not reopen them unless a future corpus/root feature first separates stable sampled roots from inner-wedge regressions and baseline saves.

## ProV4 No-Event-Ordering No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_event_ordering_bonus` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled the guarded Pro event-ordering bonus (`enable_event_ordering_bonus=false`).
- The tiny sampled Fast smoke ran successfully but did not meet the sweep pass threshold: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=195.48`, and `opponent_avg_ms=4.22`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=139.02` versus shipping `61.48`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: event-ordering bonus toggling is archived as another direct ProV4 config no-go. Do not reopen event-ordering toggles unless a future corpus/root feature first separates stable sampled roots from inner-wedge regressions and baseline saves.

## ProV4 No-Node-Uplift No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_node_uplift` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and reversed only the final guarded Pro node-budget uplift (`max_visited_nodes = max_visited_nodes * 8 / 9` after Pro tuning).
- The tiny sampled Fast smoke ran successfully but did not meet the sweep pass threshold: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=199.36`, and `opponent_avg_ms=4.58`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `8-4` across `12` games (`win_rate=0.6667`, `confidence=0.8062`), with `candidate_avg_ms=145.31` versus shipping `60.42`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: final Pro node-budget uplift toggling is archived as another direct ProV4 config no-go. Do not reopen node-budget uplift toggles unless a future corpus/root feature first separates stable sampled roots from inner-wedge regressions and baseline saves.

## ProV4 No-Attacker-Proximity-Scoring No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_attacker_proximity_scoring` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and reverted only the final guarded Pro attacker-proximity scoring weights to regular runtime scoring weights.
- The tiny sampled Fast smoke failed immediately: `wins=1`, `losses=1`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=203.43`, and `opponent_avg_ms=3.72` on `split_flank_mana_rows`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=7`, and `early_white_fallback=6`.
- Because the cheap smoke failed the hard threshold, no sampled dashboard or active panel spend was earned.
- Durable outcome: attacker-proximity scoring toggling is archived as another direct ProV4 config no-go. Do not reopen final scoring-weight ablations unless a future corpus/root feature first separates stable sampled roots from scoring-context, utility/rank, and baseline-save contamination.

## ProV4 No-Branch-Uplift No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_branch_uplift` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and reversed only the final guarded Pro root/node branch-limit uplift, recomputing root and node enum limits from the reduced branch limits.
- The tiny sampled Fast smoke reached only weak evidence: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=145.68`, and `opponent_avg_ms=4.21` on `split_flank_mana_rows`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `6-6` across `12` games (`win_rate=0.5000`, `confidence=0.0000`), with `candidate_avg_ms=125.08` versus shipping `54.01`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: final branch-limit uplift toggling is archived as another direct ProV4 config no-go. Do not reopen branch-limit uplift or nearby breadth-reduction toggles unless a future corpus/root feature first separates stable sampled roots from inner-wedge regressions and baseline saves.

## ProV4 No-Opponent-Mana-Bonus-Uplift No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_opponent_mana_bonus_uplift` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and reverted only the final guarded Pro opponent-mana soft-priority bonus bump (`progress=320->280`, `score=400->340`).
- The tiny sampled Fast smoke reached only weak evidence: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=210.87`, and `opponent_avg_ms=4.47` on `split_flank_mana_rows`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=140.38` versus shipping `60.01`; weakest variant was `inner_wedge_mana_rows=0-2`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: final opponent-mana bonus uplift toggling is archived as another direct ProV4 config no-go. Do not reopen opponent-mana soft-priority bonus tuning unless a future corpus/root feature first separates stable sampled roots from utility/rank, race-delta, scoring-context, and baseline-save contamination.

## ProV4 No-Reply-Risk-Guard No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_reply_risk_guard` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled only the guarded Pro root reply-risk guard (`enable_root_reply_risk_guard=false`).
- The tiny sampled Fast smoke reached only weak evidence: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=197.43`, and `opponent_avg_ms=3.93` on `split_flank_mana_rows`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `8-4` across `12` games (`win_rate=0.6667`, `confidence=0.8062`), with `candidate_avg_ms=146.58` versus shipping `60.41`.
- Variant rows showed local repair without promotion shape: `inner_wedge_mana_rows=2-0`, `forward_bridge_mana_rows=3-1`, but `center_spoke_mana_rows=1-1`, `alternating_mana_rows=1-1`, and `split_flank_mana_rows=1-1`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling the root reply-risk guard is archived as another direct ProV4 config no-go. Do not reopen reply-risk guard removal unless a future corpus/root feature first separates reply-risk-blocked wins from split-variant regressions and baseline saves.

## ProV4 No-Normal-Root-Safety No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_normal_root_safety` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled the guarded Pro normal-root-safety rerank and deep floor (`enable_normal_root_safety_rerank=false`, `enable_normal_root_safety_deep_floor=false`).
- The tiny sampled Fast smoke reached only weak evidence: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=209.75`, and `opponent_avg_ms=4.47` on `split_flank_mana_rows`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=139.63` versus shipping `60.42`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling normal-root-safety rerank/deep-floor is archived as another direct ProV4 config no-go. Do not reopen normal-root-safety toggles unless a future corpus/root feature first separates safety-filtered wins from inner-wedge regressions and baseline saves.

## ProV4 No-Root-Mana-Handoff-Guard No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_root_mana_handoff_guard` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled the guarded Pro root mana-handoff guard (`enable_root_mana_handoff_guard=false`).
- The tiny sampled Fast smoke reached only weak evidence: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=210.76`, and `opponent_avg_ms=4.51` on `split_flank_mana_rows`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=140.72` versus shipping `59.98`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling the root mana-handoff guard is archived as another direct ProV4 config no-go. Do not reopen root mana-handoff guard removal unless a future corpus/root feature first separates handoff-penalized wins from inner-wedge regressions and baseline saves.

## ProV4 No-Strict-Anti-Help No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_strict_anti_help` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled the guarded Pro strict root anti-help filter (`enable_strict_anti_help_filter=false`).
- The tiny sampled Fast smoke reached only weak evidence: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=211.73`, and `opponent_avg_ms=4.51` on `split_flank_mana_rows`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=141.16` versus shipping `60.57`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling the strict root anti-help filter is archived as another direct ProV4 config no-go. Do not reopen anti-help filter removal unless a future corpus/root feature first separates anti-help-pruned wins from inner-wedge regressions and baseline saves.

## ProV4 No-Hard-Spirit-Deploy No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_hard_spirit_deploy` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled the guarded Pro hard spirit-deploy interview preference (`enable_interview_hard_spirit_deploy=false`).
- The tiny sampled Fast smoke reached only weak evidence: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=209.97`, and `opponent_avg_ms=4.52` on `split_flank_mana_rows`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=141.06` versus shipping `60.35`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling hard spirit-deploy interview preference is archived as another direct ProV4 config no-go. Do not reopen hard spirit-deploy toggles unless a future corpus/root feature first separates spirit-deploy wins from inner-wedge regressions and baseline saves.

## ProV4 No-Move-Class-Coverage No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_move_class_coverage` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled guarded root/child move-class coverage plus strict tactical class coverage (`enable_move_class_coverage=false`, `enable_child_move_class_coverage=false`, `enable_strict_tactical_class_coverage=false`).
- The tiny sampled Fast smoke failed immediately on `split_flank_mana_rows`: `wins=1`, `losses=1`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=177.00`, and `opponent_avg_ms=3.90`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=84` turns, `late_black_shipping_fallback=6`, and `early_white_fallback=6`.
- Because the cheap smoke failed the hard threshold, no sampled dashboard or active panel spend was earned.
- Durable outcome: root/child move-class coverage removal is archived as another direct ProV4 config no-go. Do not reopen move-class coverage toggles unless a future corpus/root feature first separates class-covered tactical wins from split-flank regressions and baseline saves.

## ProV4 No-Potion-Mix No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_potion_mix` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled potion-action root mixing plus potion progress compensation (`enable_mana_start_mix_with_potion_actions=false`, `enable_potion_progress_compensation=false`).
- The tiny sampled Fast smoke failed immediately on `split_flank_mana_rows`: `wins=1`, `losses=1`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=223.21`, and `opponent_avg_ms=4.82`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=83` turns, `late_black_shipping_fallback=6`, and `early_white_fallback=6`.
- Because the cheap smoke failed the hard threshold, no sampled dashboard or active panel spend was earned.
- Durable outcome: potion-action root mixing and potion progress compensation removal is archived as another direct ProV4 config no-go. Do not reopen potion-mix toggles unless a future corpus/root feature first separates potion-root wins from split-flank regressions, archived consumable-feature contamination, and baseline saves.

## ProV4 No-Interview-Soft-Priors No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_interview_soft_priors` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled all interview soft root priors (`enable_interview_soft_root_priors=false`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=158.06`, and `opponent_avg_ms=4.99`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=147.81` versus shipping `59.32`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `center_spoke_mana_rows=1-1`, `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=3-1`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling interview soft root priors is archived as another direct ProV4 config no-go. Do not reopen interview soft-prior toggles unless a future corpus/root feature first separates soft-prior-blocked wins from inner-wedge regressions and baseline saves.

## ProV4 No-Root-Spirit-Development-Pref No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_root_spirit_development_pref` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled the root spirit-development preference (`enable_root_spirit_development_pref=false`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=211.03`, and `opponent_avg_ms=4.47`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=140.84` versus shipping `60.06`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling root spirit-development preference is archived as another direct ProV4 config no-go. Do not reopen root spirit-development toggles unless a future corpus/root feature first separates spirit-development-pref-blocked wins from inner-wedge regressions and baseline saves.

## ProV4 No-Enhanced-Drainer-Vulnerability No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_enhanced_drainer_vulnerability` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled enhanced drainer vulnerability handling (`enable_enhanced_drainer_vulnerability=false`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=204.36`, and `opponent_avg_ms=4.37`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=137.20` versus shipping `59.18`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling enhanced drainer vulnerability handling is archived as another direct ProV4 config no-go. Do not reopen enhanced drainer vulnerability toggles unless a future corpus/root feature first separates vulnerable-root wins from inner-wedge regressions and baseline saves.

## ProV4 No-Backtrack-Penalty No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_backtrack_penalty` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled the root-efficiency backtrack penalty (`enable_backtrack_penalty=false`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=204.56`, and `opponent_avg_ms=4.37`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=138.59` versus shipping `58.94`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling the root-efficiency backtrack penalty is archived as another direct ProV4 config no-go. Do not reopen backtrack-penalty toggles unless a future corpus/root feature first separates backtrack-penalized wins from inner-wedge regressions and baseline saves.

## ProV4 Child-Vulnerability-Plausibility No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_child_vulnerability_plausibility` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and enabled child vulnerability plausibility screening (`enable_child_vulnerability_attack_plausibility_screen=true`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=212.83`, and `opponent_avg_ms=4.47`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=142.92` versus shipping `60.62`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: enabling child vulnerability plausibility screening is archived as another direct ProV4 config no-go. Do not reopen child vulnerability plausibility toggles unless a future corpus/root feature first separates false-vulnerability child-order wins from inner-wedge regressions and baseline saves.

## ProV4 No-Two-Pass-Volatility-Focus No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_two_pass_volatility_focus` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled two-pass root volatility focus (`enable_two_pass_volatility_focus=false`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=213.79`, and `opponent_avg_ms=5.26`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `6-6` across `12` games (`win_rate=0.5000`, `confidence=0.0000`), with `candidate_avg_ms=148.48` versus shipping `62.29`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `center_spoke_mana_rows=1-1`, `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling two-pass root volatility focus is archived as another direct ProV4 config no-go. Do not reopen two-pass volatility-focus toggles unless a future corpus/root feature first separates volatility-selected wins from inner-wedge regressions and baseline saves.

## ProV4 Root-Injection No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_root_injection` and `frontier_pro_v4_emergency_root_injection` sweep candidates were removed after validation; the retained output is knowledge only.
- The broad candidate preserved the public `frontier_pro_v2_guarded` wrapper and enabled bounded turn-engine root injection into the scored root pool (`enable_turn_engine_root_injection=true`, `turn_engine_root_injection_limit=4`, `turn_engine_root_max_heuristic_gap=260`, `turn_engine_root_injection_emergency_only=false`).
- The emergency-only candidate used the same wrapper but only allowed crisis-gated injected roots (`turn_engine_root_injection_limit=3`, `turn_engine_root_max_heuristic_gap=420`, `turn_engine_root_injection_emergency_only=true`).
- Both tiny sampled Fast smokes reached only weak evidence on `split_flank_mana_rows`: broad injection went `2-0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=223.01`; emergency-only went `2-0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=205.79`.
- The broad sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=147.46` versus shipping `60.20`; weakest variant was `forward_bridge_mana_rows=1-3`.
- The emergency-only sampled dashboard also fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=141.39` versus shipping `60.32`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows stayed split rather than promotable: broad injection had `alternating_mana_rows=1-1`, `inner_wedge_mana_rows=1-1`, `center_spoke_mana_rows=2-0`, `split_flank_mana_rows=2-0`; emergency-only had `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, `split_flank_mana_rows=2-0`.
- Both stoplights were `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: turn-engine root injection is archived as another direct ProV4 config no-go. Do not reopen broad or emergency-only root-injection toggles unless a future corpus/root feature first separates injected tactical/progress roots from forward-bridge and inner-wedge regressions plus guarded baseline saves.

## ProV4 Exact-Lite-Progress No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_exact_lite_progress` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and enabled budgeted exact-lite progress and spirit-window root analysis (`enable_exact_lite_progress_checks=true`, `enable_exact_lite_spirit_window_checks=true`, `exact_lite_root_call_budget=2`, `exact_lite_static_call_budget=1`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=195.03`, and `opponent_avg_ms=5.07`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=83` turns, `late_black_shipping_fallback=7`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=142.88` versus shipping `59.49`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: budgeted exact-lite progress/spirit-window root analysis is archived as another direct ProV4 config no-go. Do not reopen exact-lite progress toggles unless a future corpus/root feature first separates exact-lite-selected progress/setup wins from inner-wedge regressions and baseline saves.

## ProV4 Eligibility-Guard No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_eligibility_guard` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and enabled the dormant turn-engine eligibility guard (`enable_turn_engine_eligibility_guard=true`) inside the guarded frontier runtime.
- The tiny sampled Fast smoke failed immediately on `split_flank_mana_rows`: `wins=1`, `losses=1`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=175.86`, and `opponent_avg_ms=4.09`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=83` turns, `late_black_shipping_fallback=6`, and `early_white_fallback=6`.
- No sampled promotion dashboard was run because the candidate missed the cheapest Fast gate.
- Durable outcome: turn-engine eligibility guarding is archived as another direct ProV4 config no-go. Do not reopen eligibility-guard toggles unless a future corpus/root feature first separates ineligible turn-engine regressions from guarded fallback saves across sampled and active panels.

## ProV4 Pre-Exact-Policy No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_pre_exact_policy` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled root exact tactics, child exact tactics, static exact evaluation, and exact-lite budgets inside the guarded frontier runtime (`enable_root_exact_tactics=false`, `enable_child_exact_tactics=false`, `enable_static_exact_evaluation=false`, `enable_exact_lite_progress_checks=false`, `enable_exact_lite_spirit_window_checks=false`, `exact_lite_root_call_budget=0`, `exact_lite_static_call_budget=0`).
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=215.27`, and `opponent_avg_ms=4.56`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=143.20` versus shipping `61.02`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- Dashboard branch coverage stayed mostly ordinary guarded execution: `frontier_execute=502`, `late_black_shipping_fallback=43`, `early_white_fallback=25`, and `score_window_tactical_fallback=1`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: disabling exact tactics is archived as another direct ProV4 config no-go. Do not reopen pre-exact policy toggles unless a future corpus/root feature first separates exact-overfit losses from guarded baseline saves across sampled and active panels.

## ProV4 No-Drainer-Safety-Prefilter No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_drainer_safety_prefilter` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled root drainer-safety prefiltering (`enable_root_drainer_safety_prefilter=false`) inside the guarded frontier runtime.
- The tiny sampled Fast smoke failed immediately on `split_flank_mana_rows`: `wins=1`, `losses=1`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=220.63`, and `opponent_avg_ms=4.68`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=83` turns, `late_black_shipping_fallback=7`, and `early_white_fallback=6`.
- No sampled promotion dashboard was run because the candidate missed the cheapest Fast gate.
- Durable outcome: root drainer-safety prefilter disabling is archived as another direct ProV4 config no-go. Do not reopen it unless a future corpus/root feature first separates vulnerable-root wins from guarded baseline saves across sampled and active panels.

## ProV4 No-Root-Efficiency No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_no_root_efficiency` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and disabled root efficiency snapshots and deltas (`enable_root_efficiency=false`) inside the guarded frontier runtime.
- The tiny sampled Fast smoke failed immediately on `split_flank_mana_rows`: `wins=1`, `losses=1`, `confidence=0.0000`, `duel_passes=false`, `candidate_avg_ms=150.82`, and `opponent_avg_ms=3.65`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=83` turns, `late_black_shipping_fallback=6`, and `early_white_fallback=6`.
- No sampled promotion dashboard was run because the candidate missed the cheapest Fast gate.
- Durable outcome: root-efficiency disabling is archived as another direct ProV4 config no-go. Do not reopen it unless a future corpus/root feature first separates root-efficiency overfitting from guarded baseline saves across sampled and active panels.

## ProV4 Drainer-Attack-Priority-Enum No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_drainer_attack_priority_enum` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and enabled drainer-attack-prioritized root enumeration with a small root enum boost (`enable_drainer_attack_priority_enum=true`, `drainer_attack_priority_enum_boost=16`) inside the guarded frontier runtime.
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=201.88`, and `opponent_avg_ms=4.34`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=136.13` versus shipping `58.83`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- Dashboard branch coverage stayed mostly ordinary guarded execution: `frontier_execute=502`, `late_black_shipping_fallback=43`, `early_white_fallback=25`, and `score_window_tactical_fallback=1`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: drainer-attack-prioritized root enumeration is archived as another direct ProV4 config no-go. Do not reopen drainer-attack priority enumeration toggles unless a future corpus/root feature first separates drainer-attack ordering wins from inner-wedge regressions and guarded baseline saves.

## ProV4 Targeted-Drainer-Full-Pool No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_targeted_drainer_full_pool` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper, enabled targeted drainer-attack fallback roots, and kept them in the full root pool instead of forcing attack selection (`enable_targeted_drainer_attack_fallback=true`, `enable_drainer_attack_full_pool=true`) inside the guarded frontier runtime.
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=190.10`, and `opponent_avg_ms=4.96`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `8-4` across `12` games (`win_rate=0.6667`, `confidence=0.8062`), with `candidate_avg_ms=143.25` versus shipping `56.55`; weakest rows were `inner_wedge_mana_rows=1-1`, `split_flank_mana_rows=1-1`, and `forward_bridge_mana_rows=2-2`.
- Other sampled rows showed partial upside but not promotion shape: `center_spoke_mana_rows=2-0` and `alternating_mana_rows=2-0`.
- Dashboard branch coverage stayed mostly ordinary guarded execution: `frontier_execute=492`, `late_black_shipping_fallback=43`, `early_white_fallback=25`, and `score_window_tactical_fallback=1`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, and `reason=shipping_gate_failed`.
- Durable outcome: targeted drainer fallback roots in the full pool are archived as another direct ProV4 config no-go. Do not reopen targeted/full-pool drainer fallback toggles unless a future corpus/root feature first separates useful added drainer roots from split sampled rows and guarded baseline saves.

## ProV4 Scoring-Context-Narrowing No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_scoring_ctx_narrowing` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and enabled local scoring context, attack-reach summaries, attack/drainer target narrowing, child vulnerability context reuse, and tactical score-window narrowing for move-efficiency snapshots (`enable_local_scoring_eval_ctx=true`, `enable_scoring_attack_reach_summary=true`, `enable_scoring_attack_reach_target_narrowing=true`, `enable_scoring_drainer_attack_reach_target_narrowing=true`, `enable_child_vulnerability_scoring_ctx_reuse=true`, `enable_move_efficiency_tactical_score_window_narrowing=true`) inside the guarded frontier runtime.
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=221.39`, and `opponent_avg_ms=4.43`.
- Branch coverage in the smoke was ordinary guarded execution, not a new route: `frontier_execute=82` turns, `late_black_shipping_fallback=8`, and `early_white_fallback=6`.
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=146.16` versus shipping `61.14`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- Dashboard branch coverage stayed mostly ordinary guarded execution: `frontier_execute=502`, `late_black_shipping_fallback=43`, `early_white_fallback=25`, and `score_window_tactical_fallback=1`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, `weak_variant_rows=1`, and `reason=shipping_gate_failed`.
- Durable outcome: local scoring-context narrowing is archived as another direct ProV4 config no-go. Do not reopen scoring-context / attack-reach narrowing toggles unless a future corpus/root feature first separates target-narrowed evaluation wins from inner-wedge regressions and guarded baseline saves.

## ProV4 Safe-Mana-Prepass No-Go

- No runtime or test-only Pro challenger survived this iteration. The temporary `frontier_pro_v4_safe_mana_prepass` sweep candidate was removed after validation; the retained output is knowledge only.
- The candidate preserved the public `frontier_pro_v2_guarded` wrapper and allowed safe immediate mana scoring or pickup roots to preempt from the guarded scored root pool when within a small root-score margin. This was narrower than restoring broad forced tactical prepass, but still selected from current root safety/progress fields.
- The tiny sampled Fast smoke reached only weak evidence on `split_flank_mana_rows`: `wins=2`, `losses=0`, `confidence=0.7500`, `duel_passes=false`, `candidate_avg_ms=394.81`, and `opponent_avg_ms=4.46`.
- Branch coverage in the smoke showed only one new route: `safe_mana_tactical_prepass=1` turn, with ordinary guarded coverage otherwise (`frontier_execute=81`, `late_black_shipping_fallback=8`, and `early_white_fallback=6`).
- The sampled promotion dashboard fast-failed before Normal/Fast spend. Against shipping Pro it went `7-5` across `12` games (`win_rate=0.5833`, `confidence=0.6128`), with `candidate_avg_ms=260.09` versus shipping `60.91`; weakest variant was `inner_wedge_mana_rows=0-2`.
- Other sampled rows showed split pressure rather than promotion shape: `alternating_mana_rows=1-1`, `forward_bridge_mana_rows=2-2`, `center_spoke_mana_rows=2-0`, and `split_flank_mana_rows=2-0`.
- Dashboard branch coverage stayed ordinary guarded execution without a safe-mana route: `frontier_execute=502`, `late_black_shipping_fallback=43`, `early_white_fallback=25`, and `score_window_tactical_fallback=1`.
- The stoplight was `not_promising` / `partial_dashboard`, with `shipping_strict_passes=0`, `shipping_directional_passes=0`, `weak_variant_rows=1`, and `reason=shipping_gate_failed`.
- Durable outcome: safe-mana tactical prepass is archived as another direct ProV4 selector no-go. Do not reopen it unless a future corpus/root feature first separates safe immediate mana roots from active Fast safe-step contamination, mana-path no-source rows, and guarded baseline saves.

## Root-Pool Step-Threat Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_step_threat` and `post_step_threat_delta`, measuring one-step latent action pressure after a root, and the JSONL workbench includes those fields in root-pool signal and guarded-delta discriminators.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The sampled+active one-state cross-budget outcome-corpus run used the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=16`, `contaminated_candidate_signal_count=271`, and `source_permission=no_source`.
- Guarded-delta checks were no better: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=97`, `contaminated_candidate_delta_signal_count=216`, and `source_permission=no_source`.
- Step-threat-specific rows did not justify a comparator. Exact `post_step_threat` / `post_step_threat_delta` and compound family/progress/path step-threat signals were either blocker-contaminated or clean singletons; no repeated low-fragmentation candidate-only step-threat signal appeared.
- Durable outcome: keep `post_step_threat` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from one-step latent action-pressure projection unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Carrier-Route Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_carrier_route` and `post_carrier_route_delta`, measuring carried-mana route posture by side and payload class: carrier count, one-step score route, forward route, and stuck carriers.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=16`, `contaminated_candidate_signal_count=280`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=97`, `contaminated_candidate_delta_signal_count=222`, and `source_permission=no_source`.
- Carrier-route-specific rows did not justify a comparator. All carrier-route field rollups were `contaminated_no_source`: root-pool exact and compound fields had `0` clean singleton, repeated, or low-fragmentation candidate-only signals, and guarded-delta carrier-route fields were similarly contaminated.
- Durable outcome: keep `post_carrier_route` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from carrier payload routing unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Mana-Contest Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_mana_contest` and `post_mana_contest_delta`, measuring free-mana proximity contest after each root.
- The feature buckets free Supermana, own regular mana, and opponent regular mana by whether the active perspective side is closer, the opponent is closer, both are tied, or neither side can contest. The delta field compares those buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried `post_mana_contest`, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=16`, `contaminated_candidate_signal_count=292`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=111`, `contaminated_candidate_delta_signal_count=228`, and `source_permission=no_source`.
- Mana-contest-specific root-pool rows did not justify a comparator. `family_mana_contest`, `progress_mana_contest_delta`, `path_mana_contest_delta`, `post_mana_contest`, and `post_mana_contest_delta` were all `contaminated_no_source`; exact `post_mana_contest` had `18` blocker roots and exact `post_mana_contest_delta` had `55` blocker roots.
- Guarded-delta mana-contest rows did not justify a comparator either. Exact `post_mana_contest` and `post_mana_contest_delta` were `singleton_no_source` with `5` clean singleton signals each, while their change fields were `singleton_and_contaminated_no_source`.
- Durable outcome: keep `post_mana_contest` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from free-mana proximity contest unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Pool-Access Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_pool_access` and `post_pool_access_delta`, measuring scoring-pool staging and denial after each root.
- The feature buckets each side's ready scoring carriers near its own pool, friendly support near that pool, enemy denial near that pool, and enemy blockers standing on that pool. The delta field compares those buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried `post_pool_access`, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=16`, `contaminated_candidate_signal_count=301`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=111`, `contaminated_candidate_delta_signal_count=234`, and `source_permission=no_source`.
- Pool-access-specific root-pool rows did not justify a comparator. `family_pool_access`, `progress_pool_access_delta`, `path_pool_access_delta`, `post_pool_access`, and `post_pool_access_delta` were all `contaminated_no_source`; exact `post_pool_access` had `33` blocker roots and exact `post_pool_access_delta` had `61` blocker roots.
- Guarded-delta pool-access rows did not justify a comparator either. `post_pool_access_change` and `post_pool_access_delta_change` were both `contaminated_no_source` with `3` contaminated signals each.
- Durable outcome: keep `post_pool_access` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from scoring-pool access unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Root-Sequence Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `root_sequence`, measuring ordered root input tokens before the root is applied.
- The feature buckets each input by source item role or empty square, coarse board zone, modifier use, first/last token, all touched zones, repeated-token shape, and full coarse input order. This captures input order separately from the existing root-transition event footprint.
- A one-state sampled Fast smoke compiled the harness and confirmed the new field appears in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried `root_sequence`, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=17`, `contaminated_candidate_signal_count=312`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=117`, `contaminated_candidate_delta_signal_count=238`, and `source_permission=no_source`.
- Root-sequence-specific rows did not justify a comparator. `root_sequence`, `family_root_sequence`, and `progress_root_sequence` were `contaminated_no_source`; `path_root_sequence`, `root_sequence`, and `root_sequence_change` in guarded-delta rollups were only `singleton_and_contaminated_no_source`.
- Durable outcome: keep `root_sequence` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from root input sequence/order unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Follow-Up-Shape Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_followup_shape` and `post_followup_effect`, measuring immediate same-turn legal continuation shape after each root.
- The feature reuses the existing legal fanout enumeration and buckets first-event primary classes (mon, mana, action, score, pickup, turn, terminal, special) plus follow-up effects (score, pickup, faint, special, terminal, turn end). It is inactive when the root ends the turn or the game.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both follow-up fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=18`, `contaminated_candidate_signal_count=323`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=117`, `contaminated_candidate_delta_signal_count=244`, and `source_permission=no_source`.
- Follow-up-specific rows did not justify a comparator. `post_followup_shape`, `post_followup_effect`, `family_followup_shape`, and `progress_followup_effect` were `contaminated_no_source`; `path_followup_effect` was only `singleton_and_contaminated_no_source`; guarded-delta `post_followup_shape_change` and `post_followup_effect_change` were contaminated.
- Durable outcome: keep `post_followup_shape` and `post_followup_effect` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from same-turn follow-up transition shape unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Mana-Base Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_mana_base` and `post_mana_base_delta`, measuring regular mana-base and Supermana-base access/control after each root.
- The feature buckets own/opponent regular mana bases by free base mana, live own/opponent occupation, and adjacent own/opponent live mons. It also buckets the Supermana base by free Supermana, live own/opponent occupation, and adjacent own/opponent live mons.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both mana-base fields, including `32` candidate-only-win root rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=18`, `contaminated_candidate_signal_count=335`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=123`, `contaminated_candidate_delta_signal_count=252`, and `source_permission=no_source`.
- Mana-base-specific rows did not justify a comparator. Root-pool `post_mana_base`, `post_mana_base_delta`, `family_mana_base`, `progress_mana_base_delta`, and `path_mana_base_delta` were all `contaminated_no_source`; exact guarded-delta `post_mana_base` and `post_mana_base_delta` were only `singleton_no_source`, and their change fields were `singleton_and_contaminated_no_source`.
- Durable outcome: keep `post_mana_base` and `post_mana_base_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from regular/Supermana base access unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Pickup-Access Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_pickup_access` and `post_pickup_access_delta`, measuring one-step legal pickup access to free mana after each root.
- The feature buckets free high-value, own-regular, opponent-regular, and Supermana pickup access by side, whether a drainer has access, whether a free mana is contested by both sides, and whether it is unclaimed by any legal one-step pickup.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both pickup-access fields, including `32` candidate-only-win root rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=18`, `contaminated_candidate_signal_count=345`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=123`, `contaminated_candidate_delta_signal_count=258`, and `source_permission=no_source`.
- Pickup-access-specific rows did not justify a comparator. Root-pool `post_pickup_access`, `post_pickup_access_delta`, `family_pickup_access`, `progress_pickup_access_delta`, and `path_pickup_access_delta` were all `contaminated_no_source`; guarded-delta `post_pickup_access_change` and `post_pickup_access_delta_change` were contaminated.
- Durable outcome: keep `post_pickup_access` and `post_pickup_access_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from free-mana pickup access unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Cooldown-Tempo Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_cooldown_tempo` and `post_cooldown_tempo_delta`, measuring cooldown tempo after each root.
- The feature buckets role-specific fainted mons by side into cooldown-1 "next" and later-cooldown groups, preserving whether a root changes near-term material recovery without treating generic fainted material as source permission.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both cooldown-tempo fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=18`, `contaminated_candidate_signal_count=355`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=123`, `contaminated_candidate_delta_signal_count=264`, and `source_permission=no_source`.
- Cooldown-tempo-specific rows did not justify a comparator. Root-pool `post_cooldown_tempo`, `post_cooldown_tempo_delta`, `family_cooldown_tempo`, `progress_cooldown_tempo_delta`, and `path_cooldown_tempo_delta` were all `contaminated_no_source`; guarded-delta `post_cooldown_tempo_change` and `post_cooldown_tempo_delta_change` were also contaminated.
- Durable outcome: keep `post_cooldown_tempo` and `post_cooldown_tempo_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from cooldown-tempo buckets unless a future slice first separates them from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Drainer-Geometry Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_drainer_geometry` and `post_drainer_geometry_delta`, measuring drainer-duel geometry after each root.
- The feature buckets each drainer's awake/fainted/missing state, inter-drainer distance, own/opponent forwardness, own/opponent board zone, and carried payload class. The delta field compares those buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both drainer-geometry fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=19`, `contaminated_candidate_signal_count=366`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=130`, `contaminated_candidate_delta_signal_count=271`, and `source_permission=no_source`.
- Drainer-geometry-specific rows did not justify a comparator. Root-pool `post_drainer_geometry` and `post_drainer_geometry_delta` were both `contaminated_no_source`; the drainer-geometry family rollup had `1` clean singleton signal, `11` contaminated signals, and `0` low-fragmentation repeated signals. Guarded-delta drainer geometry was only `singleton_and_contaminated_no_source`, with `7` clean singleton and `7` contaminated signals across the family.
- Durable outcome: keep `post_drainer_geometry` and `post_drainer_geometry_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from drainer-duel geometry unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Role-Coordination Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_role_coordination` and `post_role_coordination_delta`, measuring support spacing after each root.
- The feature buckets drainer-to-angel, drainer-to-spirit, high-value-carrier-to-angel, and regular-carrier-to-angel distances for each side. The delta field compares those spacing buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both role-coordination fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=20`, `contaminated_candidate_signal_count=377`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=138`, `contaminated_candidate_delta_signal_count=277`, and `source_permission=no_source`.
- Role-coordination-specific rows did not justify a comparator. Root-pool `post_role_coordination` and `post_role_coordination_delta` were both `contaminated_no_source`; the role-coordination family rollup had `1` clean singleton signal, `11` contaminated signals, and `0` low-fragmentation repeated signals. Guarded-delta role coordination was only `singleton_and_contaminated_no_source`, with `8` clean singleton and `6` contaminated signals across the family.
- Durable outcome: keep `post_role_coordination` and `post_role_coordination_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from role-coordination spacing unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Formation-Balance Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_formation_balance` and `post_formation_balance_delta`, measuring side-level formation shape after each root.
- The feature buckets each side's live formation width, side-relative depth, closest center distance, front/back balance, and front/back counts. The delta field compares those compact-vs-stretched formation buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both formation-balance fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=20`, `contaminated_candidate_signal_count=387`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=138`, `contaminated_candidate_delta_signal_count=283`, and `source_permission=no_source`.
- Formation-balance-specific rows did not justify a comparator. The root-pool formation-balance family rollup was `contaminated_no_source` with `10` contaminated signals, `30` candidate roots, `153` blocker roots, and `0` low-fragmentation repeated signals; exact `post_formation_balance` and `post_formation_balance_delta` were also contaminated. Guarded-delta formation balance was also `contaminated_no_source`, with `6` contaminated signals across `post_formation_balance_change` and `post_formation_balance_delta_change`.
- Durable outcome: keep `post_formation_balance` and `post_formation_balance_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from formation balance unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Role-Deployment Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_role_deployment` and `post_role_deployment_delta`, measuring side-relative forward deployment for each live role after a root.
- The feature buckets each side's angel, drainer, mystic, demon, and spirit by forward band: home, back, mid, front, deep, or absent. The delta field compares those role-depth buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both role-deployment fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=21`, `contaminated_candidate_signal_count=398`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=144`, `contaminated_candidate_delta_signal_count=291`, and `source_permission=no_source`.
- Role-deployment-specific rows did not justify a comparator. The root-pool role-deployment family rollup was `singleton_and_contaminated_no_source` with `1` clean singleton signal, `11` contaminated signals, `30` candidate roots, `49` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_role_deployment` and `post_role_deployment_delta` were `contaminated_no_source`; guarded-delta role deployment was also `singleton_and_contaminated_no_source` with `6` clean singleton and `8` contaminated signals across the family.
- Durable outcome: keep `post_role_deployment` and `post_role_deployment_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from role deployment unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Role-Pressure Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_role_pressure` and `post_role_pressure_delta`, measuring role-specific nearest-enemy pressure after a root.
- The feature buckets each side's angel, drainer, mystic, demon, and spirit by nearest live enemy distance: contact `0..1`, near `2`, mid `3..4`, far `5+`, or absent. The delta field compares those nearest-enemy distances before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both role-pressure fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=22`, `contaminated_candidate_signal_count=409`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=147`, `contaminated_candidate_delta_signal_count=298`, and `source_permission=no_source`.
- Role-pressure-specific rows did not justify a comparator. The root-pool role-pressure family rollup was `singleton_and_contaminated_no_source` with `1` clean singleton signal, `11` contaminated signals, `30` candidate roots, `147` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_role_pressure` and `post_role_pressure_delta` were both `contaminated_no_source`.
- Guarded-delta role pressure was also `singleton_and_contaminated_no_source`, with `3` clean singleton and `7` contaminated signals across `post_role_pressure_change`, `post_role_pressure_delta`, and `post_role_pressure_delta_change`. Exact guarded-delta `post_role_pressure_change` was contaminated, while `post_role_pressure_delta_change` remained singleton-and-contaminated.
- Durable outcome: keep `post_role_pressure` and `post_role_pressure_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from nearest-enemy role pressure unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Role-Mobility Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_role_mobility` and `post_role_mobility_delta`, measuring role-specific legal step shape after a root.
- The feature buckets each side's angel, drainer, mystic, demon, and spirit by legal step count, forward-step count, own-pool-step count, and pickup-step count. The delta field compares those per-role mobility buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both role-mobility fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=23`, `contaminated_candidate_signal_count=423`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=159`, `contaminated_candidate_delta_signal_count=306`, and `source_permission=no_source`.
- Role-mobility-specific rows did not justify a comparator. The root-pool role-mobility family rollup was `singleton_and_contaminated_no_source` with `1` clean singleton signal, `14` contaminated signals, `30` candidate roots, `30` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_role_mobility` and `post_role_mobility_delta` were both `contaminated_no_source`.
- Guarded-delta role mobility was also `singleton_and_contaminated_no_source`, with `12` clean singleton and `8` contaminated signals across `post_role_mobility`, `post_role_mobility_change`, `post_role_mobility_delta`, and `post_role_mobility_delta_change`. Exact change fields were only singleton-and-contaminated.
- Durable outcome: keep `post_role_mobility` and `post_role_mobility_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from per-role mobility unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Reach Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_reach` and `post_action_reach_delta`, measuring action-role reach occupancy after each root.
- The feature buckets each side's Mystic/Demon/Spirit actor count, unblocked reachable target squares, enemy/ally/item/empty occupancy, and demon blockers. This is separate from `post_action_threat`, which only counts immediately actionable threat targets.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-reach fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=433`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=171`, `contaminated_candidate_delta_signal_count=314`, and `source_permission=no_source`.
- Action-reach-specific rows did not justify a comparator. The root-pool action-reach family rollup was `singleton_and_contaminated_no_source` with `5` clean singleton signals, `10` contaminated signals, `30` candidate roots, `26` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_reach` and `post_action_reach_delta` were each `singleton_and_contaminated_no_source` with `1` clean singleton signal and `2` contaminated signals.
- Guarded-delta action reach was also `singleton_and_contaminated_no_source`, with `12` clean singleton and `8` contaminated signals across `post_action_reach`, `post_action_reach_change`, `post_action_reach_delta`, and `post_action_reach_delta_change`. Exact `post_action_reach_change` was contaminated; `post_action_reach_delta_change` was singleton-and-contaminated.
- Durable outcome: keep `post_action_reach` and `post_action_reach_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action reach unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Role-Contact Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_role_contact` and `post_role_contact_delta`, measuring adjacent opposing role-pair topology after each root.
- The feature counts total adjacent enemy pairs, contacted roles on the perspective side, contacted roles on the opponent side, and the perspective-normalized role-pair matrix. The delta field compares total pairs, per-side role contacts, and gained/lost role-pair buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both role-contact fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=442`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=171`, `contaminated_candidate_delta_signal_count=320`, and `source_permission=no_source`.
- Role-contact-specific rows did not justify a comparator. The root-pool role-contact family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `312` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_role_contact` and `post_role_contact_delta` were both `contaminated_no_source`, with `71` and `73` blocker roots respectively.
- Guarded-delta role contact was also `contaminated_no_source`, with `6` contaminated signals across `post_role_contact_change` and `post_role_contact_delta_change`; each exact change field had `3` contaminated signals and `0` clean singleton signals.
- Durable outcome: keep `post_role_contact` and `post_role_contact_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from adjacent role-contact topology unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Cohesion Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_cohesion` and `post_cohesion_delta`, measuring friendly adjacency topology after each root.
- The feature buckets each side's live count, friendly adjacent edge count, connected component count, largest friendly component, isolated live mon count, and isolated roles. The delta field compares all of those buckets before and after the root.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both cohesion fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=454`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=179`, `contaminated_candidate_delta_signal_count=326`, and `source_permission=no_source`.
- Cohesion-specific rows did not justify a comparator. The root-pool cohesion family rollup was `contaminated_no_source` with `12` contaminated signals, `30` candidate roots, `100` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_cohesion` and `post_cohesion_delta` were both `contaminated_no_source`, with `8` and `47` blocker roots respectively.
- Guarded-delta cohesion was only `singleton_and_contaminated_no_source`, with `8` clean singleton and `6` contaminated signals across `post_cohesion`, `post_cohesion_change`, `post_cohesion_delta`, and `post_cohesion_delta_change`. Exact `post_cohesion_change` and `post_cohesion_delta_change` each had `2` clean singleton signals and `3` contaminated signals.
- Durable outcome: keep `post_cohesion` and `post_cohesion_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from friendly cohesion unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Objective-Screen Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_objective_screen` and `post_objective_screen_delta`, measuring protective adjacency around carried and free mana objectives after each root.
- The feature buckets carried high-value and own-regular mana by side, whether those carriers have adjacent live friendly screens, and whether free high-value or own-regular mana has adjacent live own/opponent control. This is separate from angel-only support guard, legal pickup access, mana-base control, and mana-contest distance.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both objective-screen fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=469`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=189`, `contaminated_candidate_delta_signal_count=336`, and `source_permission=no_source`.
- Objective-screen-specific rows did not justify a comparator. The root-pool objective-screen family rollup was `contaminated_no_source` with `15` contaminated signals, `30` candidate roots, `109` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_objective_screen` and `post_objective_screen_delta` were both `contaminated_no_source`, with `7` and `65` blocker roots respectively.
- Guarded-delta objective screen was also `singleton_and_contaminated_no_source`, with `10` clean singleton and `10` contaminated signals across `post_objective_screen`, `post_objective_screen_change`, `post_objective_screen_delta`, and `post_objective_screen_delta_change`. Exact change fields each had `1` clean singleton signal and `4` contaminated signals.
- Durable outcome: keep `post_objective_screen` and `post_objective_screen_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from objective screening unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Consumable-Base Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_consumable_base` and `post_consumable_base_delta`, measuring neutral consumable-base access/control after each root.
- The feature buckets the two consumable bases by free choice item, live own/opponent occupation, live carriers occupying the base, adjacent own/opponent control, one-step own/opponent access, and contested access. This is separate from `post_consumable`, which measures inventory, free consumables, carrier readiness, and immediate threat/target status.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both consumable-base fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=479`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=189`, `contaminated_candidate_delta_signal_count=342`, and `source_permission=no_source`.
- Consumable-base-specific rows did not justify a comparator. The root-pool consumable-base family rollup was `contaminated_no_source` with `10` contaminated signals, `30` candidate roots, `294` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_consumable_base` and `post_consumable_base_delta` were both `contaminated_no_source`, with `69` and `73` blocker roots respectively.
- Guarded-delta consumable-base rows were also `contaminated_no_source`. `post_consumable_base_change` and `post_consumable_base_delta_change` each had `3` contaminated signals, `14` candidate roots, `14` blocker roots, and `0` clean singleton or low-fragmentation repeated signals.
- Durable outcome: keep `post_consumable_base` and `post_consumable_base_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from consumable-base access/control unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Carrier-Contact Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_carrier_contact` and `post_carrier_contact_delta`, measuring mana-carrier contact and guard state after each root.
- The feature buckets each side's high-value and regular mana carriers by adjacent enemy contact, adjacent friendly guard, and contested contact. This is separate from carrier route, which measures score/forward/stuck mobility, and objective screen, which measures friendly screens around carried/free objectives without adjacent enemy contact.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both carrier-contact fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=488`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=189`, `contaminated_candidate_delta_signal_count=348`, and `source_permission=no_source`.
- Carrier-contact-specific rows did not justify a comparator. The root-pool carrier-contact family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `308` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_carrier_contact` and `post_carrier_contact_delta` were both `contaminated_no_source`, with `71` blocker roots each.
- Guarded-delta carrier-contact rows were also `contaminated_no_source`. `post_carrier_contact_change` and `post_carrier_contact_delta_change` each had `3` contaminated signals, `14` candidate roots, `14` blocker roots, and `0` clean singleton or low-fragmentation repeated signals.
- Durable outcome: keep `post_carrier_contact` and `post_carrier_contact_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from carrier contact/vulnerability unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Carrier-Escape Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_carrier_escape` and `post_carrier_escape_delta`, measuring one-step escape routes available to mana carriers after each root.
- The feature buckets each side's high-value and regular mana carriers by legal adjacent moves that leave the carrier uncontacted, legally guarded, immediately scoring on the side's mana pool, or with no escape route. This is separate from carrier route, which measures forward/scoring/stuck payload mobility, and carrier contact, which measures current adjacent enemy contact and guard state.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both carrier-escape fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=497`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=189`, `contaminated_candidate_delta_signal_count=354`, and `source_permission=no_source`.
- Carrier-escape-specific rows did not justify a comparator. The root-pool carrier-escape family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `308` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_carrier_escape` and `post_carrier_escape_delta` were both `contaminated_no_source`, with `71` blocker roots each.
- Guarded-delta carrier-escape rows were also `contaminated_no_source`. `post_carrier_escape_change` and `post_carrier_escape_delta_change` each had `3` contaminated signals, `14` candidate roots, `14` blocker roots, and `0` clean singleton or low-fragmentation repeated signals.
- Durable outcome: keep `post_carrier_escape` and `post_carrier_escape_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from carrier escape routing unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Role-Escape Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_role_escape` and `post_role_escape_delta`, measuring contact-conditioned role escape routes after each root.
- The feature buckets live roles currently adjacent to an enemy by side, whether each contacted role has a legal one-step uncontacted exit, guarded exit, own-base exit, or no escape route. This is separate from role mobility, which counts all legal steps per role, and role contact, which only reports current adjacent opposing role-pair topology.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both role-escape fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=28`, `contaminated_candidate_signal_count=506`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=189`, `contaminated_candidate_delta_signal_count=360`, and `source_permission=no_source`.
- Role-escape-specific rows did not justify a comparator. The root-pool role-escape family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `312` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_role_escape` and `post_role_escape_delta` were both `contaminated_no_source`, with `71` and `73` blocker roots respectively.
- Guarded-delta role-escape rows were also `contaminated_no_source`. `post_role_escape_change` and `post_role_escape_delta_change` each had `3` contaminated signals, `14` candidate roots, `14` blocker roots, and `0` clean singleton or low-fragmentation repeated signals.
- Durable outcome: keep `post_role_escape` and `post_role_escape_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from role escape routing unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Target-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_target_profile` and `post_action_target_profile_delta`, measuring immediate action target role/payload shape after each root.
- The feature buckets each side's immediate unguarded Mystic/Demon/Spirit targets by live enemy mon, Drainer, high-value carrier, own-regular carrier, actor-kind hit count, Spirit enemy-mon hits, and Spirit item targets. This is separate from `post_action_threat`, which counts total immediate targets, and `post_action_reach`, which counts raw reachable occupancy and demon blockers.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-target-profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=32`, `contaminated_candidate_signal_count=517`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=195`, `contaminated_candidate_delta_signal_count=372`, and `source_permission=no_source`.
- Action-target-profile-specific rows did not justify a comparator. The root-pool action-target-profile family rollup was `singleton_and_contaminated_no_source` with `4` clean singleton signals, `11` contaminated signals, `30` candidate roots, `151` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_target_profile` was contaminated; `post_action_target_profile_delta` was singleton-and-contaminated with `1` clean singleton signal and `2` contaminated signals.
- Guarded-delta action-target-profile rows were also `singleton_and_contaminated_no_source`, with `6` clean singleton and `12` contaminated signals across `post_action_target_profile`, `post_action_target_profile_change`, `post_action_target_profile_delta`, and `post_action_target_profile_delta_change`. Exact change fields were contaminated only.
- Durable outcome: keep `post_action_target_profile` and `post_action_target_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action target profile unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Spirit-Item-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_spirit_item_profile` and `post_spirit_item_profile_delta`, measuring immediate Spirit-action access to free item values after each root.
- The feature buckets each side's live Spirit actors with free item targets, total free item targets, Supermana, own regular mana, opponent regular mana, choice consumables, bombs, and potions. This is separate from action reach, which only counts raw item occupancy, and action-target-profile, which only counts Spirit item targets generically.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both Spirit item profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=36`, `contaminated_candidate_signal_count=528`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=201`, `contaminated_candidate_delta_signal_count=384`, and `source_permission=no_source`.
- Spirit-item-profile-specific rows did not justify a comparator. The root-pool spirit-item-profile family rollup was `singleton_and_contaminated_no_source` with `4` clean singleton signals, `11` contaminated signals, `30` candidate roots, `149` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_spirit_item_profile` was contaminated; `post_spirit_item_profile_delta` was singleton-and-contaminated with `1` clean singleton signal and `2` contaminated signals.
- Guarded-delta spirit-item-profile rows were also `singleton_and_contaminated_no_source`, with `6` clean singleton and `12` contaminated signals across `post_spirit_item_profile`, `post_spirit_item_profile_change`, `post_spirit_item_profile_delta`, and `post_spirit_item_profile_delta_change`. Exact change fields were contaminated only.
- Durable outcome: keep `post_spirit_item_profile` and `post_spirit_item_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from Spirit item access unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Role-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_role_profile` and `post_action_role_profile_delta`, measuring immediate Mystic/Demon/Spirit target roles after each root.
- The feature buckets each side's immediate unguarded Mystic/Demon/Spirit mon targets by ally/enemy role: Angel, Drainer, Mystic, Demon, and Spirit. This is separate from action-target-profile, which focuses on generic mon/payload/action-kind target shape, and Spirit-item-profile, which focuses on free item targets.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-role-profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=36`, `contaminated_candidate_signal_count=540`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=205`, `contaminated_candidate_delta_signal_count=394`, and `source_permission=no_source`.
- Action-role-profile-specific rows did not justify a comparator. The root-pool action-role-profile family rollup was `contaminated_no_source` with `12` contaminated signals, `30` candidate roots, `114` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_role_profile` and `post_action_role_profile_delta` were both `contaminated_no_source`, with `25` and `51` blocker roots respectively.
- Guarded-delta action-role-profile rows were `singleton_and_contaminated_no_source` at the family level, with `4` clean singleton and `10` contaminated signals across `post_action_role_profile`, `post_action_role_profile_change`, `post_action_role_profile_delta`, and `post_action_role_profile_delta_change`. Exact change fields were contaminated only: `post_action_role_profile_change` and `post_action_role_profile_delta_change` each had `5` contaminated signals, `14` candidate roots, and `10` blocker roots.
- Durable outcome: keep `post_action_role_profile` and `post_action_role_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action target roles unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Guard-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_guard_profile` and `post_action_guard_profile_delta`, measuring immediate action-target guard state after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy mon targets into angel-guarded versus unguarded enemy, Drainer, high-value carrier, and own-regular carrier counts. This is separate from support-guard, which measures all currently angel-guarded mons, and action-target/action-role profiles, which only measure reachable target payload or role shape.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-guard-profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=36`, `contaminated_candidate_signal_count=549`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=205`, `contaminated_candidate_delta_signal_count=400`, and `source_permission=no_source`.
- Action-guard-profile-specific rows did not justify a comparator. The root-pool action-guard-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `306` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_guard_profile` and `post_action_guard_profile_delta` were both `contaminated_no_source`, with `71` blocker roots each.
- Guarded-delta action-guard-profile rows were also `contaminated_no_source`, with `6` contaminated signals and no clean singleton or repeated signals across `post_action_guard_profile_change` and `post_action_guard_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_action_guard_profile` and `post_action_guard_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action target guard state unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Actor-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_actor_profile` and `post_action_actor_profile_delta`, measuring action-ready actor posture after each root.
- The feature buckets each side's Mystic, Demon, and Spirit actors by whether each actor has any guarded enemy target, any unguarded enemy target, and, for Spirit, any free item target. This is separate from action target/role/guard profiles, which count reachable target payloads; action-actor-profile counts actors once per posture class.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-actor-profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=39`, `contaminated_candidate_signal_count=559`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=211`, `contaminated_candidate_delta_signal_count=412`, and `source_permission=no_source`.
- Action-actor-profile-specific rows did not justify a comparator. The root-pool action-actor-profile family rollup was `singleton_and_contaminated_no_source` with `3` clean singleton signals, `10` contaminated signals, `30` candidate roots, `227` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_actor_profile` was contaminated; `post_action_actor_profile_delta` was singleton-and-contaminated with `1` clean singleton signal and `1` contaminated signal.
- Guarded-delta action-actor-profile rows were also `singleton_and_contaminated_no_source`, with `6` clean singleton and `12` contaminated signals across `post_action_actor_profile`, `post_action_actor_profile_change`, `post_action_actor_profile_delta`, and `post_action_actor_profile_delta_change`. The exact change fields were contaminated only.
- Durable outcome: keep `post_action_actor_profile` and `post_action_actor_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action actor posture unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Zone-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_zone_profile` and `post_action_zone_profile_delta`, measuring immediate action target geography after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy targets and Spirit free-item targets by actor-relative home, mid, deep, and special-square zones. This is separate from action target/role/guard/actor profiles, which measure target payload, target role, guard state, and actor readiness rather than where action pressure lands.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-zone-profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=44`, `contaminated_candidate_signal_count=569`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=223`, `contaminated_candidate_delta_signal_count=420`, and `source_permission=no_source`.
- Action-zone-profile-specific rows did not justify a comparator. The root-pool action-zone-profile family rollup was `singleton_and_contaminated_no_source` with `5` clean singleton signals, `10` contaminated signals, `30` candidate roots, `134` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_zone_profile` and `post_action_zone_profile_delta` were both singleton-and-contaminated, each with `1` clean singleton signal and `2` contaminated signals.
- Guarded-delta action-zone-profile rows were also `singleton_and_contaminated_no_source`, with `12` clean singleton and `8` contaminated signals across `post_action_zone_profile`, `post_action_zone_profile_change`, `post_action_zone_profile_delta`, and `post_action_zone_profile_delta_change`. Exact change fields were singleton-and-contaminated only.
- Durable outcome: keep `post_action_zone_profile` and `post_action_zone_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action target geography unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Payload-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_payload_profile` and `post_action_payload_profile_delta`, measuring immediate action target payloads after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy targets by no payload, Supermana, own regular mana, opponent regular mana, and consumable, and buckets Spirit free-item targets by Supermana, own regular mana, opponent regular mana, and consumable. This is separate from action-zone-profile, which measures target geography, and action-target-profile, which coarsely measures target role/payload without opponent-regular or consumable splits.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-payload-profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=48`, `contaminated_candidate_signal_count=580`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=229`, `contaminated_candidate_delta_signal_count=432`, and `source_permission=no_source`.
- Action-payload-profile-specific rows did not justify a comparator. The root-pool action-payload-profile family rollup was `singleton_and_contaminated_no_source` with `4` clean singleton signals, `11` contaminated signals, `30` candidate roots, `147` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_payload_profile` was contaminated; `post_action_payload_profile_delta` was singleton-and-contaminated with `1` clean singleton signal and `2` contaminated signals.
- Guarded-delta action-payload-profile rows were also `singleton_and_contaminated_no_source`, with `6` clean singleton and `12` contaminated signals across `post_action_payload_profile`, `post_action_payload_profile_change`, `post_action_payload_profile_delta`, and `post_action_payload_profile_delta_change`. Exact change fields were contaminated only.
- Durable outcome: keep `post_action_payload_profile` and `post_action_payload_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from immediate action payloads unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Escape-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_escape_profile` and `post_action_escape_profile_delta`, measuring escape routes for enemy mons under immediate action pressure after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy mon targets by whether the target can step uncontacted, step adjacent to friendly guard, step to its mon base, score carried mana, or has no escape. This is separate from role-escape, which is contact-conditioned across all roles, and carrier-escape, which only considers mana carriers independent of action pressure.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-escape-profile fields, including `22` winning-policy candidate rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=48`, `contaminated_candidate_signal_count=589`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=229`, `contaminated_candidate_delta_signal_count=438`, and `source_permission=no_source`.
- Action-escape-profile-specific rows did not justify a comparator. The root-pool action-escape-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `306` blocker roots, and `0` low-fragmentation repeated or clean singleton signals. Exact `post_action_escape_profile` and `post_action_escape_profile_delta` were each contaminated with `1` signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta action-escape-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_action_escape_profile_change` and `post_action_escape_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_action_escape_profile` and `post_action_escape_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from immediate action-target escape routing unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Actor-Safety-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_actor_safety_profile` and `post_action_actor_safety_profile_delta`, measuring safety posture for immediate action-ready Mystic/Demon/Spirit actors after each root.
- The feature buckets each side's action-ready actors by guard state, adjacent enemy contact, trapped state, uncontacted/guard/base/scoring step access, no-escape status, high-value mana, own regular mana, and consumable payload. This is separate from action-actor-profile, which only counts actor readiness by target class, and from action-escape-profile, which measures the enemy targets' escape routes.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-actor-safety-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=53`, `contaminated_candidate_signal_count=599`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=239`, `contaminated_candidate_delta_signal_count=448`, and `source_permission=no_source`.
- Action-actor-safety-profile-specific rows did not justify a comparator. The root-pool action-actor-safety-profile family rollup was `singleton_and_contaminated_no_source` with `5` clean singleton signals, `10` contaminated signals, `30` candidate roots, `97` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_actor_safety_profile` and `post_action_actor_safety_profile_delta` were both singleton-and-contaminated.
- Guarded-delta action-actor-safety-profile rows were also `singleton_and_contaminated_no_source`, with `10` clean singleton and `10` contaminated signals across `post_action_actor_safety_profile`, `post_action_actor_safety_profile_change`, `post_action_actor_safety_profile_delta`, and `post_action_actor_safety_profile_delta_change`. Exact change fields were contaminated only.
- Durable outcome: keep `post_action_actor_safety_profile` and `post_action_actor_safety_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action-ready actor safety unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Counter-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_counter_profile` and `post_action_counter_profile_delta`, measuring reciprocal action pressure from immediate enemy action targets back to the actor after each root.
- The feature buckets each side's immediate unguarded Mystic/Demon/Spirit enemy mon targets by total target count, counter reach to the actor, counter reach to an angel-guarded actor, Mystic/Demon/Spirit counter kind, and no-counter targets. This is separate from action-target/role/guard profiles, which measure target payload and guard posture, and action-escape-profile, which measures the target's escape options rather than its ability to retaliate.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-counter-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=53`, `contaminated_candidate_signal_count=608`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=239`, `contaminated_candidate_delta_signal_count=454`, and `source_permission=no_source`.
- Action-counter-profile-specific rows did not justify a comparator. The root-pool action-counter-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `306` blocker roots, and `0` low-fragmentation repeated or clean singleton signals. Exact `post_action_counter_profile` and `post_action_counter_profile_delta` were each contaminated with `1` signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta action-counter-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_action_counter_profile_change` and `post_action_counter_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_action_counter_profile` and `post_action_counter_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from reciprocal action-counter pressure unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Target-Safety-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_target_safety_profile` and `post_action_target_safety_profile_delta`, measuring current contact, support, and trap posture for immediate enemy action targets after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy mon targets by target count, adjacent actor-side contact, target-side support, contested contact, isolation, angel guard, legal mobility, trapped state, Drainer role, high-value mana, own regular mana, and consumable payload. This is separate from action-target/role/payload profiles, which measure what can be hit, action-escape-profile, which measures future escape routes, and action-counter-profile, which measures reciprocal action reach.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-target-safety-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=53`, `contaminated_candidate_signal_count=617`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=239`, `contaminated_candidate_delta_signal_count=460`, and `source_permission=no_source`.
- Action-target-safety-profile-specific rows did not justify a comparator. The root-pool action-target-safety-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `306` blocker roots, and `0` low-fragmentation repeated or clean singleton signals. Exact `post_action_target_safety_profile` and `post_action_target_safety_profile_delta` were each contaminated with `1` signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta action-target-safety-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_action_target_safety_profile_change` and `post_action_target_safety_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_action_target_safety_profile` and `post_action_target_safety_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from immediate action-target contact/support/trap posture unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Score-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_score_profile` and `post_action_score_profile_delta`, measuring immediate action pressure on scoring carriers after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy targets by total target count, carrier count, high-value versus regular carried mana, one-step scoring access, and match-step threat. This is separate from carrier-route, which measures every carrier's mobility independent of action pressure, and action-target-safety-profile, which measures contact/support/trap posture rather than scoring race.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-score-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=53`, `contaminated_candidate_signal_count=626`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=239`, `contaminated_candidate_delta_signal_count=466`, and `source_permission=no_source`.
- Action-score-profile-specific rows did not justify a comparator. The root-pool action-score-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `306` blocker roots, and `0` low-fragmentation repeated or clean singleton signals. Exact `post_action_score_profile` and `post_action_score_profile_delta` were each contaminated with `1` signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta action-score-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_action_score_profile_change` and `post_action_score_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_action_score_profile` and `post_action_score_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from immediate action pressure on scoring carriers unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Denial-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_denial_profile` and `post_action_denial_profile_delta`, measuring whether immediate action targets are themselves live threats after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy targets by target count, target action capability, threats to actor-side mons, Drainers, high-value carriers, regular carriers, one-step scoring carriers, and no-threat targets. This is separate from action-counter-profile, which measures reciprocal reach to the actor, and action-score-profile, which measures pressure on targets that can score.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-denial-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=53`, `contaminated_candidate_signal_count=635`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=239`, `contaminated_candidate_delta_signal_count=472`, and `source_permission=no_source`.
- Action-denial-profile-specific rows did not justify a comparator. The root-pool action-denial-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `306` blocker roots, and `0` low-fragmentation repeated or clean singleton signals. Exact `post_action_denial_profile` and `post_action_denial_profile_delta` were each contaminated with `1` signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta action-denial-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_action_denial_profile_change` and `post_action_denial_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_action_denial_profile` and `post_action_denial_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from immediate threat-denial targets unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Pickup-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_pickup_profile` and `post_action_pickup_profile_delta`, measuring whether immediate action targets have one-step item pickup access after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy targets by target count, high-value mana pickup, regular mana pickup, Supermana pickup, consumable pickup, choice/bomb/potion pickup, and no-pickup targets. This is separate from pickup-access, which measures all free mana access by side, and action-denial-profile, which measures what the target threatens rather than what it can collect next.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-pickup-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=53`, `contaminated_candidate_signal_count=644`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=239`, `contaminated_candidate_delta_signal_count=478`, and `source_permission=no_source`.
- Action-pickup-profile-specific rows did not justify a comparator. The root-pool action-pickup-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `306` blocker roots, and `0` low-fragmentation repeated or clean singleton signals. Exact `post_action_pickup_profile` and `post_action_pickup_profile_delta` were each contaminated with `1` signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta action-pickup-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_action_pickup_profile_change` and `post_action_pickup_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_action_pickup_profile` and `post_action_pickup_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from immediate target pickup access unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Square-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_square_profile` and `post_action_square_profile_delta`, measuring the square occupancy underneath immediate action targets after each root.
- The feature buckets each side's immediate Mystic/Demon/Spirit enemy targets and Spirit item targets by regular square, consumable base, Supermana base, acting-side mana base, enemy mana base, acting-side mana pool, enemy mana pool, and mon base. This is separate from action-zone-profile, which measures actor-relative board band, and action-payload-profile, which measures what the target carries.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-square-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=58`, `contaminated_candidate_signal_count=654`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=245`, `contaminated_candidate_delta_signal_count=490`, and `source_permission=no_source`.
- Action-square-profile-specific rows did not justify a comparator. The root-pool action-square-profile family rollup was `singleton_and_contaminated_no_source` with `5` clean singleton signals, `10` contaminated signals, `30` candidate roots, `140` blocker roots, and `0` low-fragmentation repeated signals across `5` fields. Exact `post_action_square_profile` and `post_action_square_profile_delta` were each singleton-and-contaminated with `1` clean singleton signal, `2` contaminated signals, and `6` candidate roots; their blocker roots were `13` and `58`, respectively.
- Guarded-delta action-square-profile rows were also no-source. The guarded family rollup was `singleton_and_contaminated_no_source` with `6` clean singleton signals, `12` contaminated signals, `40` candidate roots, `28` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_square_profile` and `post_action_square_profile_delta` were singleton-only, while their change fields were contaminated with `6` signals, `14` candidate roots, and `14` blocker roots each.
- Durable outcome: keep `post_action_square_profile` and `post_action_square_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from immediate action-target square occupancy unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Vector-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_vector_profile` and `post_action_vector_profile_delta`, preserving action actor kind while measuring immediate reach occupancy after each root.
- The feature buckets each side's Mystic, Demon, and Spirit actors plus each kind's reachable enemy, ally, item, and empty targets; Demon lanes also record blocked jump targets. This is separate from action-reach, which aggregates all action kinds, and action-target-profile, which focuses on actual unguarded enemy/item targets.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-vector-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=63`, `contaminated_candidate_signal_count=664`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=259`, `contaminated_candidate_delta_signal_count=496`, and `source_permission=no_source`.
- Action-vector-profile-specific rows did not justify a comparator. The root-pool action-vector-profile family rollup was `singleton_and_contaminated_no_source` with `5` clean singleton signals, `10` contaminated signals, `30` candidate roots, `26` blocker roots, and `0` low-fragmentation repeated signals across `5` fields. Exact `post_action_vector_profile` and `post_action_vector_profile_delta` were each singleton-and-contaminated with `1` clean singleton signal, `2` contaminated signals, `6` candidate roots, and `6` blocker roots.
- Guarded-delta action-vector-profile rows were also no-source. The guarded family rollup was `singleton_and_contaminated_no_source` with `14` clean singleton signals, `6` contaminated signals, `48` candidate roots, `24` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_vector_profile` and `post_action_vector_profile_delta` were singleton-only, while their change fields were singleton-and-contaminated with `5` signals each.
- Durable outcome: keep `post_action_vector_profile` and `post_action_vector_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from kind-specific action reach unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Action-Fork-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_action_fork_profile` and `post_action_fork_profile_delta`, preserving action actor kind while measuring whether action pressure is concentrated into forks.
- The feature buckets each side's Mystic and Demon actors by guarded-filtered enemy target availability, multi-enemy forks, and no-enemy posture. Spirit actors additionally bucket free-item access, multi-item forks, mixed enemy/item forks, and no-target posture. This is separate from action-vector-profile, which counts every reachable occupancy square, and action-actor-profile, which only records whether an actor has any guarded or unguarded enemy target.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both action-fork-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=68`, `contaminated_candidate_signal_count=673`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=265`, `contaminated_candidate_delta_signal_count=508`, and `source_permission=no_source`.
- Action-fork-profile-specific rows did not justify a comparator. The root-pool action-fork-profile family rollup was `singleton_and_contaminated_no_source` with `5` clean singleton signals, `9` contaminated signals, `30` candidate roots, `135` blocker roots, and `0` low-fragmentation repeated signals across `5` fields. Exact `post_action_fork_profile` and `post_action_fork_profile_delta` were both singleton-and-contaminated.
- Guarded-delta action-fork-profile rows were also no-source. The guarded family rollup was `singleton_and_contaminated_no_source` with `6` clean singleton signals, `12` contaminated signals, `40` candidate roots, `28` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_action_fork_profile` and `post_action_fork_profile_delta` were singleton-only, while their change fields were contaminated.
- Durable outcome: keep `post_action_fork_profile` and `post_action_fork_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from action fork posture unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Carrier-Score-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_carrier_score_profile` and `post_carrier_score_profile_delta`, measuring scoring proximity and match-value posture for carried mana after each root.
- The feature buckets each side's high-value and regular mana carriers by whether the carried payload can meet the current score need and whether the carrier is near scoring range versus still far. This is separate from carrier-route, which measures one-step carrier mobility, and from action-score-profile, which measures immediate action pressure on scoring carriers rather than carrier score geometry itself.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both carrier-score-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=68`, `contaminated_candidate_signal_count=682`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=265`, `contaminated_candidate_delta_signal_count=514`, and `source_permission=no_source`.
- Carrier-score-profile-specific rows did not justify a comparator. The root-pool carrier-score-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `308` blocker roots, and `0` low-fragmentation repeated or clean singleton signals across `5` fields. Exact `post_carrier_score_profile` and `post_carrier_score_profile_delta` were each contaminated with `1` signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta carrier-score-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_carrier_score_profile_change` and `post_carrier_score_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_carrier_score_profile` and `post_carrier_score_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from carried-mana score-distance or match-value posture unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Spirit-Handoff-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_spirit_handoff_profile` and `post_spirit_handoff_profile_delta`, measuring whether live Spirit actions can convert reachable mana or mana carriers into own Drainer pickups or own scoring-pool deliveries after each root.
- The feature buckets each side's Spirit actors, reachable mana targets, reachable Drainer pickup targets, reachable carrier scoring targets, pickup and score handoff counts, high-value and regular mana flags, and match-score handoff flags. This is separate from spirit-item-profile, which only records immediate Spirit access to free items, and carrier-score-profile, which only describes current carried payload score geometry.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both spirit-handoff-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=68`, `contaminated_candidate_signal_count=692`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=265`, `contaminated_candidate_delta_signal_count=520`, and `source_permission=no_source`.
- Spirit-handoff-profile-specific rows did not justify a comparator. The root-pool spirit-handoff-profile family rollup was `contaminated_no_source` with `10` contaminated signals, `30` candidate roots, `232` blocker roots, and `0` low-fragmentation repeated or clean singleton signals across `5` fields. Exact `post_spirit_handoff_profile` had `2` contaminated signals, `6` candidate roots, and `42` blocker roots; exact `post_spirit_handoff_profile_delta` had `1` contaminated signal, `6` candidate roots, and `71` blocker roots.
- Guarded-delta spirit-handoff-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_spirit_handoff_profile_change` and `post_spirit_handoff_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_spirit_handoff_profile` and `post_spirit_handoff_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from Spirit handoff access unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Potion-Stock Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_potion_stock` and `post_potion_stock_delta`, measuring side-relative potion inventory, whether the post-root active side can still use an action, and whether that access is specifically a potion-extension action.
- The feature buckets own and opponent potion stock, own/opponent active-action availability, and own/opponent potion-extension availability after each root. This is separate from `post_consumable`, which measures board-carried and free consumables, and from turn-budget, which does not split potion stock by side.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both potion-stock fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=68`, `contaminated_candidate_signal_count=704`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=265`, `contaminated_candidate_delta_signal_count=526`, and `source_permission=no_source`.
- Potion-stock-specific rows did not justify a comparator. The root-pool potion-stock family rollup was `contaminated_no_source` with `12` contaminated signals, `30` candidate roots, `137` blocker roots, and `0` low-fragmentation repeated or clean singleton signals across `5` fields. Exact `post_potion_stock` had `2` contaminated signals, `6` candidate roots, and `72` blocker roots; exact `post_potion_stock_delta` had `2` contaminated signals, `6` candidate roots, and `21` blocker roots.
- Guarded-delta potion-stock rows were also `contaminated_no_source`, with `6` contaminated signals across `post_potion_stock_change` and `post_potion_stock_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_potion_stock` and `post_potion_stock_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from potion inventory or potion-extension posture unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Bomb-Threat-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_bomb_threat_profile` and `post_bomb_threat_profile_delta`, measuring bomb-capable carrier target posture after each root.
- The feature buckets each side's bomb-capable carriers, live enemy targets reachable by bomb, Drainer targets, high-value and regular carried-mana targets, angel-guarded versus unguarded targets, multi-target carriers, and no-target carriers. This is separate from `post_consumable`, which only records bomb carriers and whether they can target any mon.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both bomb-threat-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=68`, `contaminated_candidate_signal_count=713`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=265`, `contaminated_candidate_delta_signal_count=532`, and `source_permission=no_source`.
- Bomb-threat-profile-specific rows did not justify a comparator. The root-pool bomb-threat-profile family rollup was `contaminated_no_source` with `9` contaminated signals, `30` candidate roots, `316` blocker roots, and `0` low-fragmentation repeated or clean singleton signals across `5` fields. Exact `post_bomb_threat_profile` and `post_bomb_threat_profile_delta` each had `1` contaminated signal, `6` candidate roots, and `73` blocker roots.
- Guarded-delta bomb-threat-profile rows were also `contaminated_no_source`, with `6` contaminated signals across `post_bomb_threat_profile_change` and `post_bomb_threat_profile_delta_change`. Each exact change field had `3` contaminated signals, `14` candidate roots, and `14` blocker roots.
- Durable outcome: keep `post_bomb_threat_profile` and `post_bomb_threat_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from bomb-threat target posture unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Exact-Score-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained source change is harness/postprocess-only: ProV4 root-pool rows now emit `post_exact_score_profile` and `post_exact_score_profile_delta`, measuring exact-state score pressure after each root.
- The feature buckets each side's exact score-path steps and multi-pressure, immediate score-window value and multi-pressure, Drainer pickup path/value, carrier steps to score, Drainer-to-mana steps, and Spirit exact score/denial/Supermana/opponent-mana progress posture. This is separate from `post_exact_pressure`, which only preserves broad same-turn window, denial, attack, and Drainer-safety context.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows. In the sampled+active outcome JSONL, all `194` root-pool rows carried both exact-score-profile fields, including `32` candidate-only winning-policy rows.
- The sampled+active one-state cross-budget outcome-corpus run reused the full reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, route bucket limit `5`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=coverage_gap`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=72`, `coverage_gap_entry_count=1`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source. The root-pool discriminator saw `6` candidate-only winning policy roots and `77` blocker roots, but reported `clean_repeated_candidate_signal_count=0`, `low_fragmentation_repeated_candidate_signal_count=0`, `clean_singleton_candidate_signal_count=69`, `contaminated_candidate_signal_count=724`, and `source_permission=no_source`.
- Guarded-delta checks were also no-source: `14` candidate guarded-delta comparisons and `18` blocker comparisons produced `clean_repeated_candidate_delta_signal_count=0`, `low_fragmentation_repeated_candidate_delta_signal_count=0`, `clean_singleton_candidate_delta_signal_count=273`, `contaminated_candidate_delta_signal_count=538`, and `source_permission=no_source`.
- Exact-score-profile-specific rows did not justify a comparator. The root-pool exact-score-profile family rollup was `singleton_and_contaminated_no_source` with `1` clean singleton signal, `11` contaminated signals, `30` candidate roots, `30` blocker roots, and `0` low-fragmentation repeated signals across `5` fields. Exact `post_exact_score_profile` and `post_exact_score_profile_delta` were each contaminated, with `6` candidate roots and `6` or `8` blocker roots respectively.
- Guarded-delta exact-score-profile rows were also no-source. The guarded family rollup was `singleton_and_contaminated_no_source` with `8` clean singleton signals, `6` contaminated signals, `36` candidate roots, `16` blocker roots, and `0` low-fragmentation repeated signals. Exact `post_exact_score_profile` and `post_exact_score_profile_delta` were singleton-only, while their change fields were singleton-and-contaminated.
- Durable outcome: keep `post_exact_score_profile` and `post_exact_score_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from exact score-path or immediate-window posture unless a future slice first separates it from blocker roots and coverage gaps with repeated low-fragmentation candidate-only evidence.

## Root-Pool Control-Map Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_control_map` and `post_control_map_delta`, measuring side-relative control coverage after each root.
- The feature buckets unique step-control squares, unique action-control squares, contested step/action control, own and opponent live mons standing inside opposing step/action control, and free high-value mana covered by own or opponent step/action control. This is separate from action-reach, which measures reachable action occupancy, and from territory, which only buckets broad positional occupation.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=singleton_no_source`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=41`, `coverage_gap_entry_count=0`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source: root-pool reported `singleton_root_pool_signal`, guarded-delta reported `singleton_root_pool_guarded_delta`, and both source permissions were `no_source`.
- Control-map-specific rows did not justify a comparator. The `core_root` family rollup was `singleton_and_contaminated_no_source` with `candidate_root_count=270`, `blocker_root_count=542`, `clean_singleton_signal_count=33`, and `contaminated_signal_count=125`. Exact and compound control-map fields were singleton-and-contaminated or contaminated: `path_control_map_delta` and `progress_control_map_delta` each had `candidate_root_count=5`, `blocker_root_count=2`, `clean_singleton_signal_count=3`, and `contaminated_signal_count=2`; `post_control_map_delta` had `candidate_root_count=5`, `blocker_root_count=4`, `clean_singleton_signal_count=2`, and `contaminated_signal_count=2`; `family_control_map` and `post_control_map` were contaminated.
- Durable outcome: keep `post_control_map` and `post_control_map_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from control-map coverage unless a future slice first separates it from guarded blockers with repeated low-fragmentation candidate-only evidence.

## Root-Pool Demon-Line-Blocker Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_demon_line_blocker` and `post_demon_line_blocker_delta`, measuring what blocks Demon action lanes after each root.
- The feature buckets each side's Demon lanes, blocked lanes, ally-mon blockers, enemy-mon blockers, enemy Drainer blockers, high-value and own-regular mana blockers, consumable blockers, special-square blockers, and open versus guarded enemy targets. This extends action-vector-profile by preserving obstruction identity instead of only counting a blocked Demon ray.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=singleton_no_source`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=41`, `coverage_gap_entry_count=0`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source: root-pool reported `singleton_root_pool_signal`, guarded-delta reported `singleton_root_pool_guarded_delta`, and both source permissions were `no_source`.
- Demon-line-blocker-specific rows did not justify a comparator. Exact root-pool fields and compounds were all contaminated: `family_demon_line_blocker` had `candidate_root_count=5`, `blocker_root_count=6`, `contaminated_signal_count=3`; `path_demon_line_blocker_delta` had `candidate_root_count=5`, `blocker_root_count=9`, `contaminated_signal_count=3`; `progress_demon_line_blocker_delta` had `candidate_root_count=5`, `blocker_root_count=14`, `contaminated_signal_count=3`; `post_demon_line_blocker` had `candidate_root_count=5`, `blocker_root_count=6`, `contaminated_signal_count=1`; `post_demon_line_blocker_delta` had `candidate_root_count=5`, `blocker_root_count=15`, `contaminated_signal_count=1`.
- Guarded-delta line-blocker rows were also contaminated: `post_demon_line_blocker_change` and `post_demon_line_blocker_delta_change` each had `candidate_root_count=10`, `blocker_root_count=3`, `contaminated_signal_count=3`, and no clean singleton or repeated low-fragmentation signal.
- Durable outcome: keep `post_demon_line_blocker` and `post_demon_line_blocker_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from Demon line obstruction identity unless a future slice first separates it from guarded blockers with repeated low-fragmentation candidate-only evidence.

## Root-Pool Mana-Identity-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_mana_identity_profile` and `post_mana_identity_profile_delta`, splitting post-root mana custody into Supermana, own regular, and opponent regular payloads with Drainer/Spirit carrier role detail.
- This feature is distinct from broad high-value custody because it does not collapse Supermana with opponent regular mana, and it adds role detail for current carriers instead of only free-mana proximity or base access.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=singleton_no_source`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=41`, `coverage_gap_entry_count=0`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source: root-pool reported `singleton_root_pool_signal`, guarded-delta reported `singleton_root_pool_guarded_delta`, and both source permissions were `no_source`.
- Mana-identity-specific rows did not justify a comparator. Root-pool exact and compound fields were all contaminated: `family_mana_identity_profile` had `candidate_root_count=5`, `blocker_root_count=14`, `contaminated_signal_count=3`; `path_mana_identity_profile_delta` had `candidate_root_count=5`, `blocker_root_count=8`, `contaminated_signal_count=3`; `progress_mana_identity_profile_delta` had `candidate_root_count=5`, `blocker_root_count=13`, `contaminated_signal_count=3`; `post_mana_identity_profile` and `post_mana_identity_profile_delta` each had `candidate_root_count=5`, `blocker_root_count=14`, and `contaminated_signal_count=1`.
- Guarded-delta mana-identity rows were also contaminated: `post_mana_identity_profile_change` and `post_mana_identity_profile_delta_change` each had `candidate_root_count=10`, `blocker_root_count=3`, `contaminated_signal_count=3`, and no clean singleton or repeated low-fragmentation signal.
- Durable outcome: keep `post_mana_identity_profile` and `post_mana_identity_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from mana payload identity unless a future slice first separates it from guarded blockers with repeated low-fragmentation candidate-only evidence.

## Root-Pool Edge-Anchor-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_edge_anchor_profile` and `post_edge_anchor_profile_delta`, measuring post-root edge, corner, near-edge, and center anchoring after each root.
- The feature buckets live own and opponent mons by board band, edge Drainer and Spirit posture, edge-held high-value/own-regular mana, edge-held consumables, and free edge objectives. This is distinct from territory, which buckets forward/center occupation, and from mana-identity, which ignores where the payload sits.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=singleton_no_source`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=41`, `coverage_gap_entry_count=0`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source: root-pool reported `singleton_root_pool_signal`, guarded-delta reported `singleton_root_pool_guarded_delta`, and both source permissions were `no_source`.
- The outcome JSONL had `97` ProV4 root-pool rows and all `97` carried both edge-anchor fields; `17` rows were policy-output roots, and only `5` candidate-only winning roots contributed edge-anchor field counts.
- Edge-anchor-specific rows did not justify a comparator. The root-pool discriminator had `178` clean singleton candidate signals and `826` contaminated candidate signals overall, but `source_permission=no_source`. Its visible edge-anchor rollup was `family_edge_anchor_profile`, with `candidate_root_count=1`, `blocker_root_count=1`, `guarded_blocker_root_count=1`, `candidate_repeated_across_states=false`, and `candidate_clean_from_blockers=false`.
- Durable outcome: keep `post_edge_anchor_profile` and `post_edge_anchor_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from edge anchoring unless a future slice first separates it from guarded blockers with repeated low-fragmentation candidate-only evidence.

## Root-Pool Item-Zone-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_item_zone_profile` and `post_item_zone_profile_delta`, measuring post-root item and carried-payload distribution by active-side board zone.
- The feature buckets Supermana, own regular mana, opponent regular mana, and consumables by free, own-carrier, or opponent-carrier custody across active-side home, mid, and deep bands. This is distinct from mana-identity, which ignores where the payload sits, and edge-anchor, which only tracks edge/corner anchoring.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `56`.
- The postprocess stayed no-source: `corpus_decision=singleton_no_source`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=41`, `coverage_gap_entry_count=0`, and `route_permission=no_source`.
- Root-pool source checks also stayed no-source: root-pool reported `singleton_root_pool_signal`, guarded-delta reported `singleton_root_pool_guarded_delta`, and both source permissions were `no_source`.
- The outcome JSONL had `97` ProV4 root-pool rows and all `97` carried both item-zone fields; `17` rows were policy-output roots, and `13` live winning-policy roots were present in the root-pool summary.
- Item-zone-specific rows did not justify a comparator. `post_item_zone_profile` and `post_item_zone_profile_delta` each had only `5` candidate-only winning-root field counts in the root-pool summary, while the workbench still had zero source-candidate axes. The root-pool discriminator had `178` clean singleton candidate signals and `837` contaminated candidate signals overall, with `source_permission=no_source`; guarded-delta had `482` clean singleton candidate delta signals and `459` contaminated candidate delta signals, also `no_source`.
- Durable outcome: keep `post_item_zone_profile` and `post_item_zone_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from item-zone distribution unless a future slice first separates it from guarded blockers with repeated low-fragmentation candidate-only evidence.

## Root-Pool Objective-Proximity-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_objective_proximity_profile` and `post_objective_proximity_profile_delta`, measuring non-carrier support and pressure near item objectives after each root.
- The feature buckets Supermana, own regular mana, opponent regular mana, and consumables by each side's nearest non-carrier adjacent/near/closer/tied/isolated posture. This is distinct from item-zone, which measures where an objective sits, and from carrier-contact, which only records adjacent contact around current carriers.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `96`.
- The postprocess stayed no-source: `corpus_decision=baseline_save_risk`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=60`, `coverage_gap_entry_count=0`, and `route_permission=no_source`. The blocker was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons1 can_action=true can_mana=true opp_win=false`, with one candidate-only state and one baseline-better state.
- Root-pool source checks also stayed no-source: root-pool reported `singleton_root_pool_signal`, guarded-delta reported `singleton_root_pool_guarded_delta`, and both source permissions were `no_source`.
- The outcome JSONL had `97` ProV4 root-pool rows and all `97` carried both objective-proximity fields; `17` rows were policy-output roots, and `12` live winning-policy roots were present in the root-pool summary.
- Objective-proximity-specific rows did not justify a comparator. Exact and compound root-pool fields were singleton or contaminated: `path_objective_proximity_profile_delta` had `candidate_root_count=6`, `blocker_root_count=4`, `clean_singleton_signal_count=4`, and `contaminated_signal_count=2`; `progress_objective_proximity_profile_delta` had `6` candidate roots, `7` blocker roots, `3` clean singleton signals, and `3` contaminated signals; `family_objective_proximity_profile` had `6` candidate roots, `3` blocker roots, `2` clean singleton signals, and `3` contaminated signals. Exact `post_objective_proximity_profile` and `post_objective_proximity_profile_delta` were also singleton/contaminated.
- Guarded-delta objective-proximity rows were no-source too. Exact change fields had `candidate_root_count=12`, `blocker_root_count=1`, `clean_singleton_signal_count=3`, and `contaminated_signal_count=1`, while exact guarded fields were clean singleton-only and not repeated source evidence.
- Durable outcome: keep `post_objective_proximity_profile` and `post_objective_proximity_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from objective proximity unless a future slice first separates it from guarded blockers and baseline saves with repeated low-fragmentation candidate-only evidence.

## Root-Pool Objective-Control-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_objective_control_profile` and `post_objective_control_profile_delta`, measuring whether item objective squares sit under own/opponent step control, action control, or either-control after each root.
- The feature buckets Supermana, own regular mana, opponent regular mana, and consumables separately. This is distinct from objective-proximity, which measures nearest non-carrier support, and from control-map, which only records global unique control counts and free high-value coverage.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `96`.
- The postprocess stayed no-source: `corpus_decision=baseline_save_risk`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=60`, `coverage_gap_entry_count=0`, and `route_permission=no_source`. The blocker was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons1 can_action=true can_mana=true opp_win=false`, with one candidate-only state and one baseline-better state.
- Root-pool source checks also stayed no-source: root-pool reported `singleton_root_pool_signal`, guarded-delta reported `singleton_root_pool_guarded_delta`, and both source permissions were `no_source`. The root-pool discriminator had `230` clean singleton candidate signals and `957` contaminated candidate signals; guarded-delta had `927` clean singleton candidate delta signals and `168` contaminated candidate delta signals.
- The outcome JSONL had `97` ProV4 root-pool rows and all `97` carried both objective-control fields; `17` rows were policy-output roots, and `12` live winning-policy roots were present in the root-pool summary.
- Objective-control-specific rows did not justify a comparator. Exact and compound root-pool fields were singleton or contaminated: `path_objective_control_profile_delta` had `candidate_root_count=6`, `blocker_root_count=7`, `clean_singleton_signal_count=2`, and `contaminated_signal_count=2`; `family_objective_control_profile` had `6` candidate roots, `5` blocker roots, `0` clean singleton signals, and `3` contaminated signals; `progress_objective_control_profile_delta` had `6` candidate roots, `10` blocker roots, `0` clean singleton signals, and `3` contaminated signals. Exact `post_objective_control_profile` and `post_objective_control_profile_delta` were contaminated.
- Guarded-delta objective-control rows were no-source too. `post_objective_control_profile_change` and `post_objective_control_profile_delta_change` each had `candidate_root_count=12`, `blocker_root_count=1`, `clean_singleton_signal_count=2`, and `contaminated_signal_count=1`, which is singleton-and-contaminated evidence rather than source permission.
- Durable outcome: keep `post_objective_control_profile` and `post_objective_control_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from objective control unless a future slice first separates it from guarded blockers and baseline saves with repeated low-fragmentation candidate-only evidence.

## Root-Pool Objective-Square-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_objective_square_profile` and `post_objective_square_profile_delta`, measuring the square-type occupancy of item objectives after each root.
- The feature buckets Supermana, own regular mana, opponent regular mana, and consumables separately across regular squares, own/opponent regular mana bases, Supermana bases, consumable bases, own/opponent mana pools, and own/opponent mon bases. This is distinct from objective-control, which measures control coverage, and objective-proximity, which measures nearest non-carrier support.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `96`.
- The postprocess stayed no-source: `corpus_decision=baseline_save_risk`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=60`, `coverage_gap_entry_count=0`, and `route_permission=no_source`. The blocker was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons1 can_action=true can_mana=true opp_win=false`, with one candidate-only state and one baseline-better state.
- Root-pool source checks also stayed no-source. The root-pool summary had `97` roots, `94` live roots, `12` winning-policy roots, and `12` live winning-policy roots, but only diagnostic permission. The root-pool discriminator reported `source_permission=no_source`, `clean_singleton_candidate_signal_count=230`, and `contaminated_candidate_signal_count=969`; guarded-delta reported `source_permission=no_source`, `clean_singleton_candidate_delta_signal_count=931`, and `contaminated_candidate_delta_signal_count=170`.
- The outcome JSONL had `97` ProV4 root-pool rows and all `97` carried both objective-square fields; `17` rows were policy-output roots.
- Objective-square-specific rows did not justify a comparator. Exact and compound root-pool fields were contaminated or singleton-and-contaminated: `path_objective_square_profile_delta` had `candidate_root_count=6`, `blocker_root_count=11`, and `contaminated_signal_count=4`; `family_objective_square_profile` had `6` candidate roots, `5` blocker roots, and `3` contaminated signals; `progress_objective_square_profile_delta` had `6` candidate roots, `13` blocker roots, and `3` contaminated signals. Exact `post_objective_square_profile` had `6` candidate roots, `5` blocker roots, and `1` contaminated signal; exact `post_objective_square_profile_delta` had `6` candidate roots, `14` blocker roots, and `1` contaminated signal.
- Guarded-delta objective-square rows were no-source too. `post_objective_square_profile_change` and `post_objective_square_profile_delta_change` each had `candidate_root_count=12`, `blocker_root_count=1`, `clean_singleton_signal_count=2`, and `contaminated_signal_count=1`, which is singleton-and-contaminated evidence rather than source permission.
- Durable outcome: keep `post_objective_square_profile` and `post_objective_square_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from objective square occupancy unless a future slice first separates it from guarded blockers and baseline saves with repeated low-fragmentation candidate-only evidence.

## Root-Pool Carrier-Action-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_carrier_action_profile` and `post_carrier_action_profile_delta`, measuring immediate enemy action reach into mana carriers after each root.
- The feature buckets high-value and regular mana carriers by side, whether each carrier is in Mystic, Demon, or Spirit action reach, whether that reach is unguarded or Angel-guarded, and whether multiple action kinds reach the same carrier. This is distinct from carrier contact/escape, which measure adjacent pressure and step exits, and from action-score-profile, which only records immediate action targets that are carriers or scoring threats.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `96`.
- The postprocess stayed no-source: `corpus_decision=baseline_save_risk`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=60`, `coverage_gap_entry_count=0`, and `route_permission=no_source`. The blocker was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons1 can_action=true can_mana=true opp_win=false`, with one candidate-only state and one baseline-better state.
- Root-pool source checks also stayed no-source. The root-pool summary had `97` roots, `94` live roots, `12` winning-policy roots, and `12` live winning-policy roots, but only diagnostic permission. The root-pool discriminator reported `source_permission=no_source`, `clean_singleton_candidate_signal_count=230`, and `contaminated_candidate_signal_count=981`; guarded-delta reported `source_permission=no_source`, `clean_singleton_candidate_delta_signal_count=935`, and `contaminated_candidate_delta_signal_count=172`.
- The outcome JSONL had `97` ProV4 root-pool rows and all `97` carried both carrier-action fields; `17` rows were policy-output roots.
- Carrier-action-specific rows did not justify a comparator. Exact and compound root-pool fields were contaminated: `path_carrier_action_profile_delta` had `candidate_root_count=6`, `blocker_root_count=10`, and `contaminated_signal_count=4`; `family_carrier_action_profile` had `6` candidate roots, `13` blocker roots, and `3` contaminated signals; `progress_carrier_action_profile_delta` had `6` candidate roots, `12` blocker roots, and `3` contaminated signals. Exact `post_carrier_action_profile` and `post_carrier_action_profile_delta` each had `6` candidate roots, `13` blocker roots, and `1` contaminated signal.
- Guarded-delta carrier-action rows were no-source too. `post_carrier_action_profile_change` and `post_carrier_action_profile_delta_change` each had `candidate_root_count=12`, `blocker_root_count=1`, `clean_singleton_signal_count=2`, and `contaminated_signal_count=1`, which is singleton-and-contaminated evidence rather than source permission.
- Durable outcome: keep `post_carrier_action_profile` and `post_carrier_action_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from carrier action vulnerability unless a future slice first separates it from guarded blockers and baseline saves with repeated low-fragmentation candidate-only evidence.

## Root-Pool Score-Term-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_score_term_profile` and `post_score_term_profile_delta`, measuring dominant residual scoring-term leaders and scoring-term deltas after each root.
- The feature uses the active Pro scoring weights to bucket the post-root search eval, top positive residual term, top negative residual term, changed residual term count, and largest positive/negative residual term deltas. This is distinct from root score, utility, and geometry features because it exposes which scoring field actually dominates the root state.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `96`.
- The postprocess stayed no-source: `corpus_decision=baseline_save_risk`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=60`, `coverage_gap_entry_count=0`, and `route_permission=no_source`. The blocker was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons1 can_action=true can_mana=true opp_win=false`, with one candidate-only state and one baseline-better state.
- Root-pool source checks also stayed no-source. The root-pool summary had `97` roots, `94` live roots, `12` winning-policy roots, and `12` live winning-policy roots, but only diagnostic permission. The root-pool discriminator reported `source_permission=no_source`, `clean_singleton_candidate_signal_count=244`, and `contaminated_candidate_signal_count=994`; guarded-delta reported `source_permission=no_source`, `clean_singleton_candidate_delta_signal_count=963`, and `contaminated_candidate_delta_signal_count=174`.
- The outcome JSONL had `97` ProV4 root-pool rows and all `97` carried both score-term fields; `17` rows were policy-output roots.
- Score-term-specific rows did not justify a comparator. Exact and compound root-pool fields were singleton or contaminated: `path_score_term_profile_delta` had `candidate_root_count=6`, `blocker_root_count=2`, `clean_singleton_signal_count=4`, and `contaminated_signal_count=2`; `post_score_term_profile_delta` had the same root-pool counts; `progress_score_term_profile_delta` had the same counts; `family_score_term_profile` had `6` candidate roots, `6` blocker roots, `1` clean singleton signal, and `4` contaminated signals; exact `post_score_term_profile` had `6` candidate roots, `6` blocker roots, `1` clean singleton signal, and `3` contaminated signals.
- Guarded-delta score-term rows were no-source too. Exact guarded fields were clean singleton-only, while `post_score_term_profile_change` had `candidate_root_count=12`, `blocker_root_count=1`, `clean_singleton_signal_count=3`, and `contaminated_signal_count=1`; `post_score_term_profile_delta_change` had `12` candidate roots, `1` blocker root, `2` clean singleton signals, and `1` contaminated signal.
- Durable outcome: keep `post_score_term_profile` and `post_score_term_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from scoring-term leaders unless a future slice first separates them from guarded blockers and baseline saves with repeated low-fragmentation candidate-only evidence.

## Root-Pool Followup-Role-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_followup_role_profile` and `post_followup_role_profile_delta`, measuring same-turn legal follow-up role availability after each root.
- The feature extends the existing capped legal-transition fanout pass, so it does not add a second transition enumeration. It buckets primary actor roles, primary action actor roles, primary pickup actor roles, and fainted roles; inactive post-root states remain marked inactive.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `96`.
- The dashboard was not promotable: `partial_dashboard`, `not_promising`, one sampled panel, and max candidate average `128.86ms`.
- The postprocess stayed no-source: `corpus_decision=baseline_save_risk`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=60`, `coverage_gap_entry_count=0`, and `route_permission=no_source`. The blocker was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons1 can_action=true can_mana=true opp_win=false`, with one candidate-only state and one baseline-better state.
- Root-pool source checks stayed no-source. The root-pool summary had `97` roots, `94` live roots, `12` winning-policy roots, and `12` live winning-policy roots, but only diagnostic permission. The root-pool discriminator reported `source_permission=no_source`, `clean_singleton_candidate_signal_count=263`, and `contaminated_candidate_signal_count=1004`; guarded-delta reported `source_permission=no_source`, `clean_singleton_candidate_delta_signal_count=991`, and `contaminated_candidate_delta_signal_count=176`.
- Followup-role-specific rows did not justify a comparator. Root-pool exact and compound fields were singleton or contaminated: `family_followup_role_profile`, `path_followup_role_profile_delta`, `progress_followup_role_profile_delta`, and exact `post_followup_role_profile` had `candidate_root_count=6`, `blocker_root_count=2`, `clean_singleton_signal_count=4`, and `contaminated_signal_count=2`; exact `post_followup_role_profile_delta` had `candidate_root_count=6`, `blocker_root_count=2`, `clean_singleton_signal_count=3`, and `contaminated_signal_count=2`.
- Guarded-delta followup-role rows were no-source too. Exact guarded fields were clean singleton-only, while `post_followup_role_profile_change` and `post_followup_role_profile_delta_change` each had `candidate_root_count=12`, `blocker_root_count=1`, `clean_singleton_signal_count=2`, and `contaminated_signal_count=1`.
- Durable outcome: keep `post_followup_role_profile` and `post_followup_role_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from same-turn follow-up role availability unless a future slice first separates it from guarded blockers and baseline saves with repeated low-fragmentation candidate-only evidence.

## Root-Pool Followup-Payload-Profile Feature No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is harness/postprocess-only: ProV4 root-pool rows now emit `post_followup_payload_profile` and `post_followup_payload_profile_delta`, measuring same-turn legal follow-up payload availability after each root.
- The feature extends the existing capped legal-transition fanout pass, so it does not add a second transition enumeration. It buckets primary payloads, target-square payloads, score payloads, and pickup payloads as empty, mon, Supermana, own regular mana, opponent regular mana, or consumable.
- A one-state sampled Fast smoke compiled the harness and confirmed the new fields appear in `PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT` rows.
- The capped sampled+active Fast outcome-corpus run reused the reset portfolio with corpus records, portfolio mechanism classes, ProV4 root-pool export, root-pool record limit `16`, root limit `12`, total state limit `4`, and max plies `96`.
- The dashboard was not promotable: `partial_dashboard`, `not_promising`, one sampled panel, and max candidate average `135.18ms`.
- The postprocess stayed no-source: `corpus_decision=baseline_save_risk`, `workbench_decision=blocked_candidate_axes`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=60`, `coverage_gap_entry_count=0`, and `route_permission=no_source`. The blocker was `axis=exact_timing color=white turn_bucket=turn3_4 mons_moves=mons1 can_action=true can_mana=true opp_win=false`, with one candidate-only state and one baseline-better state.
- Root-pool source checks stayed no-source. The root-pool summary had `97` roots, `94` live roots, `12` winning-policy roots, and `12` live winning-policy roots, but only diagnostic permission. The root-pool discriminator reported `source_permission=no_source`, `clean_singleton_candidate_signal_count=280`, and `contaminated_candidate_signal_count=1016`; guarded-delta reported `source_permission=no_source`, `clean_singleton_candidate_delta_signal_count=1019`, and `contaminated_candidate_delta_signal_count=178`.
- Followup-payload-specific rows did not justify a comparator. Root-pool exact and compound fields were singleton or contaminated: `path_followup_payload_profile_delta` and `progress_followup_payload_profile_delta` had `candidate_root_count=6`, `blocker_root_count=2`, `clean_singleton_signal_count=4`, and `contaminated_signal_count=2`; `family_followup_payload_profile` had `6` candidate roots, `3` blocker roots, `3` clean singleton signals, and `3` contaminated signals; exact `post_followup_payload_profile` had `6` candidate roots, `4` blocker roots, `3` clean singleton signals, and `3` contaminated signals; exact `post_followup_payload_profile_delta` had `6` candidate roots, `2` blocker roots, `3` clean singleton signals, and `2` contaminated signals.
- Guarded-delta followup-payload rows were no-source too. Exact guarded fields were clean singleton-only, while `post_followup_payload_profile_change` and `post_followup_payload_profile_delta_change` each had `candidate_root_count=12`, `blocker_root_count=1`, `clean_singleton_signal_count=2`, and `contaminated_signal_count=1`.
- Durable outcome: keep `post_followup_payload_profile` and `post_followup_payload_profile_delta` as reusable Outcome Corpus V2 / ProV4 root-pool evidence, but do not build a Pro mode from same-turn follow-up payload availability unless a future slice first separates it from guarded blockers and baseline saves with repeated low-fragmentation candidate-only evidence.

## Active Fast Outcome-Corpus Fragmented No-Source

- No runtime or test-only Pro challenger survived this iteration. The run followed the reset board's smallest current diagnostic: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded` over the retained reset portfolio.
- The dashboard rejected promotion shape for the shipped guarded path on the sampled panel: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `139.73ms`.
- The outcome corpus had oracle coverage but no source permission: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, and `source_blocker.kind=fragmented_routes`.
- The apparent repeated class was still not a runtime mechanism. `axis=exact_pressure window=window0 deny=deny0 attack=false drainer_safety=safe` reached `candidate_only_games=6` and `candidate_only_states=2`, but it fragmented across `3` candidate policies, `3` branch transitions, and `6` first-move pairs.
- The workbench had no source candidates: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `blocked_candidate_axis_count=105`, `source_candidate_axis_count=0`, `source_status_counts=singleton_non_regressing:93, no_candidate_signal:24, fragmented_no_source:12`.
- Top blocked axes were diagnostic only: same-branch `decision_stage`, lower-considered `root_preservation`, lower-live `winner_root`, lower-live `winner_root_ordering`, and `winner_safety_signal` each repaired two joined states but were blocked by first-move-pair fragmentation; branch-changed `decision_stage`, `stage`, and `continuation_stability` additionally fragmented by candidate policy or branch.
- Durable outcome: do not rerun the same unmodified active Fast outcome-corpus slice as source work, and do not encode the active-Fast exact-pressure, continuation-stability, root-preservation, or decision-stage labels. The next useful work needs a new below-policy measured feature in Outcome Corpus V2 / root-pool postprocess, or a new registered test-only root-policy candidate, before another scout spend.

## Root-Pool Origin-Profile Postprocess No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is postprocess-only: normalized ProV4 root-pool rows now expose `root_origin_profile`, and the outcome workbench includes exact and `family`/`progress`/`path` root-origin compounds in root-pool discriminator evidence.
- The active Fast structural scout used the reset board's smallest current diagnostic with root-pool export enabled: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded`.
- The dashboard rejected promotion shape again: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `129.91ms`.
- The outcome corpus stayed postprocess-only: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, and `source_blocker.kind=fragmented_routes`.
- The root-pool discriminator also stayed no-source: `root_count=93`, `candidate_only_winning_policy_root_count=12`, `candidate_cross_budget_state_count=2`, `blocker_root_count=14`, `guarded_blocker_root_count=14`, `same_state_blocker_root_count=3`, `candidate_signal_count=2137`, `low_fragmentation_repeated_candidate_signal_count=0`, `fragmented_repeated_candidate_signal_count=22`, `clean_singleton_candidate_signal_count=410`, `contaminated_candidate_signal_count=1705`, `discriminator_decision=fragmented_repeated_root_pool_signal`, and `source_permission=no_source`.
- Root-origin-specific evidence did not justify a comparator. Exact `root_origin_profile` had `candidate_root_count=12`, `candidate_state_count=2`, `candidate_snapshot_signal_count=11`, `blocker_root_count=9`, `guarded_blocker_root_count=9`, `same_state_blocker_root_count=3`, `fragmented_repeated_signal_count=2`, `contaminated_signal_count=4`, and `low_fragmentation_repeated_signal_count=0`; `family_root_origin_profile`, `progress_root_origin_profile`, and `path_root_origin_profile` were also fragmented or contaminated with zero low-fragmentation repeated signals.
- The normalized root provenance distribution was mostly guarded/advisor/scored evidence: `guarded_scored` dominated, followed by `advisor+guarded_scored`, `advisor`, and policy-bearing guarded/advisor blends. That overlap explains why root-origin provenance is useful for debugging saved or omitted roots but not a runtime selector by itself.
- Durable outcome: keep `root_origin_profile` as Outcome Corpus V2 / ProV4 root-pool workbench evidence, but do not build a Pro mode from root provenance or guarded/advisor/scored overlap. The next useful work needs a below-fragmented root feature or a newly registered root-policy candidate before another scout spend.

## First-Move Shape Corpus Postprocess No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is postprocess-only: policy-matrix log summarization now derives coarse first-divergence move-shape axes from baseline and candidate move FENs.
- The derived axes bucket candidate shape, baseline shape, candidate-vs-baseline span delta, coarse shape pair, and preferred-shape fields. A shape records location input count, modifier count, takebacks, first-to-last span, and coarse board-zone flow, so it tests whether exact first-move-pair fragmentation hides a broader move-input mechanism.
- The active Fast structural scout used the reset board's smallest current diagnostic: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded`.
- The dashboard rejected promotion shape again: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `129.80ms`.
- The outcome corpus stayed postprocess-only: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, and `source_blocker.kind=fragmented_routes`.
- The workbench had no source candidates: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_candidate_axis_count=0`, `blocked_candidate_axis_count=131`, `source_status_counts=singleton_non_regressing:108, no_candidate_signal:26, fragmented_no_source:23`, and `source_permission_counts=no_source:131, postprocess_only:26`.
- Move-shape evidence reduced the exact move strings into repeated candidate-shape buckets but still did not justify source. `first_move_candidate_shape shape=loc2;mod0:none;z0;span1;flow=near_edge->mid` and `first_move_candidate_shape shape=loc2;mod0:none;z0;span2;flow=edge->near_edge` each reached `candidate_better_joined_states=2`, but both had `source_status=fragmented_no_source` with `candidate_count=2`, `branch_count=2`, `pair_count=2`, and `fragmented_dimensions=candidate_policy|branch|first_move_pair`.
- Durable outcome: keep first-divergence move-shape axes as Outcome Corpus V2 postprocess evidence, but do not build a Pro mode from move-shape, span delta, or coarse first-move flow. The next useful work needs a below-fragmented root/corpus feature or a newly registered root-policy candidate before another scout spend.

## First-Move Board-Intent Corpus Postprocess No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is postprocess-only: policy-matrix log summarization now derives board-aware first-divergence intent axes from the full game FEN, active color, and baseline/candidate move inputs.
- The derived axes bucket candidate intent, baseline intent, intent delta, preferred intent, and preferred intent focus. Intent records source content, target content, and coarse zone flow, with mon color normalized to own/opponent and payloads bucketed as empty, regular mana, high-value mana, consumable, bomb, or none.
- The active Fast structural scout used the reset board's smallest current diagnostic: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded`.
- The dashboard rejected promotion shape again: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `129.46ms`.
- The outcome corpus stayed postprocess-only: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, `source_blocker.kind=fragmented_routes`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=148`.
- The workbench had no source candidates: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_status_counts=singleton_non_regressing:119, fragmented_no_source:29, no_candidate_signal:28`, and `source_permission_counts=no_source:148, postprocess_only:28`.
- Board-intent evidence exposed repeated own-Spirit-to-empty buckets but still did not justify source. `first_move_preferred_intent source=own_spirit_carry_none;target=empty;flow=near_edge->near_edge` reached `candidate_better_joined_states=2`, but had `source_status=fragmented_no_source`, `candidate_count=1`, `branch_count=1`, `pair_count=2`, and `fragmented_dimensions=first_move_pair`.
- The sibling mid-flow bucket also fragmented: `first_move_candidate_intent source=own_spirit_carry_none;target=empty;flow=near_edge->mid` reached `candidate_better_joined_states=2`, but had `candidate_count=2`, `branch_count=2`, `pair_count=2`, and `fragmented_dimensions=candidate_policy|branch|first_move_pair`. The broader `first_move_preferred_intent_focus empty_target` and `first_move_intent_delta same_focus_empty_target` buckets repeated, but spread across three policies, three branches, and five to six exact first-move pairs.
- Durable outcome: keep board-aware first-divergence intent axes as Outcome Corpus V2 postprocess evidence, but do not build a Pro mode from own-Spirit empty-target moves, intent focus, or intent delta. The next useful work needs a below-fragmented root/corpus feature or a newly registered root-policy candidate before another scout spend.

## Terminal-Swing Outcome Corpus Postprocess No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is postprocess-only: policy-matrix log summarization now derives terminal outcome axes from `baseline_final` and `candidate_final` FENs.
- The derived axes bucket candidate-side score margin, baseline-side score margin, candidate-vs-baseline score swing, resource-custody swing, material swing, preferred margin, and preferred score gap. These axes are explicitly future-only because they depend on rollout terminal states, so cross-budget rollups classify candidate-bearing terminal rows as `future_only_no_source`.
- The active Fast structural scout used the reset board's smallest current diagnostic: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded`.
- The dashboard rejected promotion shape again: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `129.66ms`.
- The outcome corpus stayed postprocess-only: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, `source_blocker.kind=fragmented_routes`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=162`.
- The workbench had no source candidates: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_status_counts=singleton_non_regressing:119, no_candidate_signal:31, fragmented_no_source:29, future_only_no_source:14`, and `source_permission_counts=no_source:148, postprocess_only:45`.
- Terminal evidence exposed end-state shape but not source. `terminal_candidate_margin lead1` and `terminal_preferred_margin lead1` each reached `candidate_better_joined_states=2`, but they were `future_only_no_source` with `candidate_count=3`, `branch_count=2`, `pair_count=5`, and `fragmented_dimensions=candidate_policy|branch|first_move_pair`.
- Resource swing was also diagnostic only. `terminal_resource_swing custody=minus1 material=same` reached `candidate_better_joined_states=2`, but remained `future_only_no_source` with `candidate_count=2`, `branch_count=2`, `pair_count=2`, and `fragmented_dimensions=candidate_policy|branch|first_move_pair`. Terminal score-swing buckets `plus1` and `plus2plus` were singleton candidate axes.
- Durable outcome: keep terminal-swing axes as Outcome Corpus V2 evidence for describing what the rollout eventually achieved, but never build runtime source from terminal margin, terminal score swing, terminal resource swing, or preferred terminal gap. The next useful work needs a source-time root/corpus feature or a newly registered root-policy candidate before another scout spend.

## Source-Board Balance Corpus Postprocess No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is postprocess-only: policy-matrix log summarization now derives first-divergence source-board balance axes from the corpus record `board` FEN when a first-divergence board is present.
- The derived axes bucket candidate-side score margin, candidate-side resource custody/material balance, active actor relative to the candidate side, and a margin/custody compound. Missing first-divergence boards emit no source-board axes, so same-final/no-divergence records do not add missing-board noise.
- The active Fast structural scout used the reset board's smallest current diagnostic: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded`.
- The dashboard rejected promotion shape again: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `131.43ms`.
- The outcome corpus stayed postprocess-only: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, `source_blocker.kind=fragmented_routes`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=166`.
- The workbench had no source candidates: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_status_counts=singleton_non_regressing:119, fragmented_no_source:33, no_candidate_signal:31, future_only_no_source:14`, and `source_permission_counts=no_source:152, postprocess_only:45`.
- Source-board evidence exposed broad repeated source-time states but still did not justify source. `source_board_actor own_to_move`, `source_board_margin even`, `source_board_margin_resource margin=even custody=even`, and `source_board_resource_balance custody=even material=even` each reached `candidate_better_joined_states=2`, but all were `fragmented_no_source` with `candidate_count=4`, `branch_count=4`, `pair_count=7`, `same_outcome_joined_states=1`, and `fragmented_dimensions=candidate_policy|branch|first_move_pair`.
- Durable outcome: keep first-divergence source-board balance axes as Outcome Corpus V2 postprocess evidence, but do not build a Pro mode from even-score/even-custody, own-to-move, or broad source-board balance buckets. The next useful work needs a lower-fragmentation root/corpus feature or a newly registered root-policy candidate before another scout spend.

## Portfolio-Support Outcome Corpus Postprocess No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is postprocess-only: policy-matrix log summarization now derives `portfolio_*` support axes from outcome-corpus `policy_results` and `winning_policies`, then marks all portfolio axes as future-only for cross-budget source checks.
- The derived axes bucket total winning-policy count, candidate-side winning-policy count, whether the candidate policy itself was among the winners, and a baseline/candidate result shape with candidate-winner-count breadth.
- The active Fast structural scout used the reset board's smallest current diagnostic: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded`.
- The dashboard rejected promotion shape again: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `141.21ms`.
- The outcome corpus stayed postprocess-only: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, `source_blocker.kind=fragmented_routes`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=170`.
- The workbench had no source candidates: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_status_counts=singleton_non_regressing:119, fragmented_no_source:33, no_candidate_signal:33, future_only_no_source:18`, and `source_permission_counts=no_source:152, postprocess_only:51`.
- Portfolio support exposed oracle breadth but not source. `portfolio_candidate_supported true` and `portfolio_support_shape baseline=loss candidate=win candidate_winners=count3plus` each reached `candidate_better_joined_states=2`, but both were `future_only_no_source` with `candidate_count=3`, `branch_count=3`, `pair_count=6`, and `fragmented_dimensions=candidate_policy|branch|first_move_pair`.
- Broader winner-count rows were mixed evidence. `portfolio_winner_count count3plus` and `portfolio_candidate_winner_count count3plus` each had `candidate_better_joined_states=2` plus `same_outcome_joined_states=2`, with `candidate_count=7`, `branch_count=5`, `pair_count=8`, and `future_only_no_source`.
- Neutral portfolio rows correctly stayed diagnostic: `portfolio_candidate_supported false` and `portfolio_support_shape baseline=loss candidate=loss candidate_winners=count3plus` had only same-outcome joined states and were classified `no_candidate_signal`.
- Durable outcome: keep portfolio-support axes as Outcome Corpus V2 evidence for whether the policy set has multiple agreeing winners, but never build runtime source from `policy_results`, `winning_policies`, winner counts, or candidate-supported rows. The next useful work needs a source-time root/corpus feature or a newly registered root-policy candidate before another scout spend.

## First-Move Local-Pressure Corpus Postprocess No-Source

- No runtime or test-only Pro challenger survived this iteration. The retained code change is postprocess-only: policy-matrix log summarization now derives first-divergence local-pressure axes from the divergence board and baseline/candidate move endpoints.
- The derived axes bucket orthogonal own/opponent adjacency around each move endpoint, source/target pressure focus, target own/opponent count buckets, source-to-target zone flow, preferred-pressure rows for candidate/baseline wins, and a candidate-vs-baseline target-pressure delta.
- The active Fast structural scout used the reset board's smallest current diagnostic: active-blocker panel, `vs_shipping_fast`, structural scout `--outcome-corpus frontier_pro_v2_guarded`.
- The dashboard rejected promotion shape again: `PRO_PROMOTION_DASHBOARD_STOPLIGHT label=not_promising`, `partial_dashboard`, one panel, `7-5`, `win_rate=0.5833`, `confidence=0.6128`, and max candidate average `129.45ms`.
- The outcome corpus stayed postprocess-only: `total_games=2`, `candidate_only_wins=2`, `baseline_only_wins=0`, `no_policy_wins=0`, `state_limit_hit=true`, `corpus_decision=postprocess_only`, `route_permission=postprocess_only`, `next_action=build_outcome_corpus_v2`, `source_blocker.kind=fragmented_routes`, `source_candidate_axis_count=0`, and `blocked_candidate_axis_count=193`.
- The workbench had no source candidates: `workbench_decision=blocked_candidate_axes`, `source_permission=no_source`, `source_status_counts=singleton_non_regressing:136, fragmented_no_source:39, no_candidate_signal:34, future_only_no_source:18`, and `source_permission_counts=no_source:175, postprocess_only:52`.
- Local-pressure evidence exposed a plausible source-time pattern but still did not justify source. `first_move_candidate_target_pressure focus=empty_target target=supported;own=count1;opp=count0` reached `candidate_better_joined_states=2`, but also had `same_outcome_joined_states=1`, `candidate_count=4`, `branch_count=3`, `pair_count=6`, and `fragmented_dimensions=candidate_policy|branch|first_move_pair`.
- The cleaner preferred target-pressure row was still fragmented. `first_move_preferred_target_pressure focus=empty_target target=supported;own=count1;opp=count0` reached `candidate_better_joined_states=2` with no same-outcome state, but had `candidate_count=3`, `branch_count=2`, `pair_count=5`, and `source_status=fragmented_no_source`.
- Endpoint shape and pressure delta did not separate either. `first_move_preferred_pressure source=isolated;target=supported;flow=near_edge->near_edge` had one candidate policy and one branch, but still fragmented by two first-move pairs; `first_move_pressure_delta candidate_less_pressured` reached two candidate-better joined states but fragmented across two policies, two branches, and four first-move pairs.
- Durable outcome: keep local-pressure axes as Outcome Corpus V2 source-time evidence, but do not build a Pro mode from supported empty targets, isolated-source-to-supported-target flows, or less-pressured target deltas unless a future sampled+active slice first makes them low-fragmentation and clean from same-outcome or baseline-save contamination.
