# Automove Knowledge

This file keeps durable automove rules and reusable heuristics only.

Use `HOW_TO_ITERATE_ON_AUTOMOVE.md` for workflow, `AUTOMOVE_IDEAS.md` for the live state, and `docs/automove-archive.md` for retired wave detail.

## Stable Runtime Truths

- Public Pro routes through `frontier_pro_v2_guarded`.
- `shipping_pro_search` is the retained search-only baseline.
- Release wiring is intentionally narrower than the experiment surface: public `Pro` dispatch goes through `MonsGameModel::public_runtime_inputs` to `select_frontier_pro_v2_guarded_inputs`, while `automove_experiments` and experiment profile selectors are included only under `#[cfg(test)]`.
- Probe paths are diagnostics only; they do not describe shipping behavior.
- Promotion evidence comes from direct frontier-vs-baseline duels, not fixture churn alone.
- Automove users can play any current `GameVariant`; promotion evidence must cover variant breadth, not just Classic.
- Retained `primary_pro` fixtures are Classic regression controls. They are not broad variant evidence.
- Publish builds should run `scripts/assert-release-package-surface.sh` against generated web and node Wasm packages so test-only diagnostic identifiers and `SMART_PRO_*` / `PRO_*` corpus logs cannot silently ship.

## Experiment Rules

- Pick one hypothesis before editing runtime code.
- Probe first when the mechanism is unclear. Do not spend canonical gates on a guess.
- When the live board has no challenger, read `docs/automove-major-reset-plan.md` and use structural reset mode instead of continuing the seam-fix loop.
- Do not write another selector over existing policy labels, branch labels, exact contexts, first moves, variants, or singleton-heavy corpus rows unless a corpus first shows repeated low-fragmentation evidence with clean baseline-save separation.
- Use `./scripts/run-automove-structural-scout.sh <candidate>` before retaining any broad Pro runtime change. A candidate must look strong on both canonical sampled and active-blocker panels.
- Use seeded sampled variants for quick kill/pass evidence, then all-variant confirmation for promotion.
- Separate `pre_accept` search choice from final `engine_post_search` output before changing shared heuristics.
- A seam can move while the duel gate still fails; local seam coverage is not duel strength.
- Config-toggle sweep candidates should preserve the public `frontier_pro_v2_guarded` wrapper unless the candidate is explicitly a raw-control profile.
- Read `AUTOMOVE_SWEEP_CANDIDATE_METADATA` before sweep, dashboard, policy-matrix, policy-corpus, outcome-corpus, cross-budget, winner, or attribution logs.
- Run `./scripts/check-automove-hygiene.sh` before ending an automove session. Clean target logs/stamps only after the dry-run shows disposable evidence you no longer need.

## Structural Reset Rules

- Start reset work from one of these paths:
  - bounded `pro-policy-outcome-corpus` over the retained portfolio;
  - a test-only ProV4/root-policy candidate registered as a sweep candidate with metadata;
  - a new measured root feature that can be emitted into the outcome corpus before source work.
- A complete policy portfolio with `no_policy_wins=0` is oracle coverage, not source permission. If repeated mechanisms remain singleton-heavy or contaminated by baseline saves, improve the corpus instead of writing source.
- `coverage_gap`, `baseline_save_risk`, `singleton_no_source`, `no_candidate_route`, `fragmented_no_source`, `budget_conflict`, `partial_repair_coverage_gap`, `singleton_selector_pressure`, and `postprocess_only` are no-source decisions.
- `repeated_mechanism_class` at count 2 is routing evidence only. It is not permission to encode a runtime selector.
- A repeated active-Fast `exact_pressure window0/deny0/safe` class is still no-source when it fragments by policy, branch transition, or first-move pair. The 2026-05-18 bounded outcome-corpus slice had candidate-only wins and no baseline-only wins, but `source_candidate_axis_count=0` and all candidate-bearing axes were `singleton_non_regressing` or `fragmented_no_source`.
- Root-origin provenance is diagnostic only. The 2026-05-18 root-origin postprocess exposed `root_origin_profile` and `family`/`progress`/`path` compounds, but candidate roots still overlapped guarded/advisor/scored provenance, blockers, or same-state guarded saves; exact and compound root-origin rollups had zero low-fragmentation repeated signals and no source permission.
- Coarse first-divergence move-shape axes are diagnostic only. The 2026-05-18 move-shape postprocess exposed repeated candidate shapes, but the repeated buckets were still fragmented by candidate policy, branch, and exact first-move pair; no low-fragmentation source candidate survived.
- Board-aware first-divergence intent axes are diagnostic only. The 2026-05-18 intent postprocess exposed repeated own-Spirit-to-empty intent buckets, but they fragmented by first-move pair or by candidate policy, branch, and pair; one near-edge empty-target intent also appeared in same-outcome evidence, so no low-fragmentation source candidate survived.
- First-divergence local-pressure axes are diagnostic only. The 2026-05-18 local-pressure postprocess exposed repeated supported empty-target and less-pressured-target buckets, but the repeated rows were still fragmented by candidate policy, branch, and first-move pair, and one candidate target-pressure bucket also appeared in same-outcome evidence.
- First-divergence move-goal axes are diagnostic only. The workbench JSONL `policy_axis` rows include these axes so they match `corpus_axis_summary`; the 2026-06-18 aggregate still produced `source_candidate_axis_count=0`, with move-goal blockers either singleton-heavy or baseline-save contaminated.
- Source-move interference axes are diagnostic only. The 2026-06-25 active Fast slice exposed whether each compared move stayed legal after applying the other move first, but the main `both_legal` row stayed `fragmented_no_source` across four candidate policies, four branch transitions, and six first-move pairs, with one same-outcome state.
- Source-move order commutation axes are diagnostic only. The 2026-06-25 active Fast and sampled Pro slices applied both first-divergence moves in both orders on the source board, but the only concrete active candidate row was `same_state` and singleton with same-outcome evidence; sampled Pro had no candidate route.
- Source-remaining budget axes are diagnostic only. The 2026-06-25 active Fast and sampled Pro slices exposed same-turn action, mana, and mon-move budget left after each compared first-divergence move, but candidate-bearing rows were singleton or mixed with same-outcome evidence, and the only concrete active candidate row spent more budget than guarded; source permission stayed `no_source`.
- Post-reply reversal root-pool fields are diagnostic only. The 2026-06-25 active Fast ProV4 root-pool slices exposed `post_reply_reversal_profile`, but root rows were almost entirely same-active/no-reply buckets; the two-state follow-up still ended `baseline_save_risk`, `root_pool_decision=singleton_root_pool_signal`, and `source_candidate_rollups=0`.
- Color/rotation-equivariance disagreement is not a direct selector. The 2026-06-25 sampled Pro scout mapped guarded output from a 180-degree color-rotated board back onto the source board, but it failed at `2-2`, lost `inner_wedge_mana_rows` `0-2`, and ran about 5x slower than shipping Pro.
- Source-residual agency axes are diagnostic only. The 2026-06-25 sampled Pro slice exposed same-turn legal continuation fanout after each first-divergence move, but candidate-bearing rows were singleton and mixed with same-outcome evidence; route permission stayed `no_source`.
- Source-handoff opponent-mobility axes are diagnostic only. The 2026-06-25 active Fast and sampled Pro slices exposed opponent response fanout only when a compared first-divergence move handed over the turn, but candidate-bearing rows were merely `same_turn -> same_turn`, with same-outcome contamination and fragmentation by candidate policy, branch transition, and first-move pair; source permission stayed `no_source`.
- Source-mana corridor topology axes are diagnostic only. The 2026-06-25 sampled Pro slice exposed source-board mana pool/base/superbase layout by active-perspective corridor, but candidate-bearing corridor rows were either mixed with same-outcome evidence or baseline-better heavy; route permission stayed `no_source` with an exact-pressure baseline-save blocker.
- Source-prefix completion axes are diagnostic only. The 2026-06-25 active Fast slice exposed source-board legal completion fanout after the compared move prefixes, but the token-level route was `fragmented_no_source` across seven candidate policies, five branch transitions, and eight first-move pairs, with eight same-outcome records.
- Source-prompt topology axes are diagnostic only. The 2026-06-25 active Fast slice exposed coarse first-divergence prompt depth, prompt count, and max-option buckets, but the token-level route was `fragmented_no_source` across seven candidate policies, five branch transitions, and eight first-move pairs, with eight same-outcome records.
- Source-start option-profile axes are diagnostic only. The 2026-06-25 active Fast slice exposed legal source-start count buckets before either compared move was applied, but the repeated `mon_only` row still fragmented across four candidate policies, four branch transitions, and seven first-move pairs, with one same-outcome row.
- Post-diff initiative-debt timing axes are diagnostic only. The 2026-06-25 active Fast slice exposed recovery buckets for how quickly each trace next had both action and mana after first divergence, but the matching rows were fragmented across four candidate policies, four branch transitions, and seven first-move pairs, with one same-outcome row.
- Decision-effort timing axes are diagnostic only. The 2026-06-25 active Fast slice exposed selector/exact/engine decision-work buckets around first divergent candidate turns, but the token-level route was `fragmented_no_source` across seven policies, five branch transitions, and eight first-move pairs, while detailed bucket rollups were singleton non-regressing or shared/no-candidate-signal.
- Pre-diff entry timing axes are diagnostic only. The 2026-06-25 active Fast and sampled Pro slices exposed `axis=pre_diff_entry` buckets for hidden same-move branch/path disagreement before visible move divergence, but the candidate-bearing rows were singleton, mixed with same-outcome evidence, or fragmented by candidate policy, branch, and first-move pair.
- Terminal outcome axes are future-only diagnostics. The 2026-05-18 terminal-swing postprocess exposed repeated candidate/preferred lead margins and one repeated resource-custody swing, but those features come from `baseline_final`/`candidate_final` rollout states and must stay `future_only_no_source` even when repeated.
- Portfolio-support axes are future-only diagnostics. The 2026-05-18 portfolio-support postprocess exposed repeated candidate-supported and candidate-winner-count rows, but those features come from outcome-corpus `policy_results` and `winning_policies`; they measure oracle breadth after rollout and must stay `future_only_no_source` even when candidate support repeats.
- First-divergence source-board balance axes are diagnostic only. The 2026-05-18 source-board postprocess exposed repeated even-score/even-custody and own-to-move buckets, but they were broad, shared with same-outcome evidence, and fragmented by policy, branch, and first-move pair.
- `promotable_shape` earns confirm spend; `sampled_only` and `active_only` require decision-record proof before more source work; `cost_blocked` kills or narrows the line; `not_promising` kills the candidate unless it exposed a harness issue.
- A `promotable_scout` dashboard is not promotion by itself. The 2026-05-31 phase-gated context composite cleared sampled strict gates and active directional gates, but all-variant confirmation failed Pro `15-9`, Normal `13-11`, and Fast `19-5`; confirm breadth remains mandatory.
- Runtime source stays untouched unless a candidate separates wins from guarded saves across sampled and active evidence with low fragmentation and acceptable cost.

## Retired Evidence Groups

Do not reopen these as direct runtime source paths without new corpus evidence below the retired label:

- Static selectors over policy labels, branch labels, exact contexts, exact or coarse first-divergence moves, post-reply reversal buckets, source-move order commutation buckets, source-remaining budget buckets, source-handoff opponent-mobility buckets, source-residual agency buckets, source-mana corridor topology buckets, source-move interference buckets, source-prefix completion buckets, source-prompt topology buckets, source-start option-profile buckets, post-diff initiative-debt timing, decision-effort timing, pre-diff entry timing, first-divergence move-shape, board-intent, local-pressure, source-board balance buckets, terminal outcome buckets, portfolio-support and winner-count buckets, variants, guarded-selected moves, color/rotation-equivariance disagreement, copied FENs, or singleton-heavy move pairs.
- Phase-gated composites over existing reset policies, including exact-FEN patches. They can demonstrate oracle coverage on sampled/active dashboards but do not generalize to all variants and remain no-source unless a below-policy mechanism explains the separation.
- Broad ProV2 wrapper or config toggles: raw ProV2 routing, no selected-followup projection, full-scored reply guard, no low-budget guard, no late fallback, head rerank, spirit-family removal, mid-turn tactical-guard removal, expansion-cap tuning, root/node/branch uplifts, reply-risk guard toggles, normal-root-safety toggles, strict anti-help filters, and interview soft-prior toggles.
- Search-ordering and root-ordering toggles: PVS, killer/history ordering, TT replacement tuning, root aspiration, child-ordering shortlist tuning, futility/quiescence/quiet-reduction/selective-extension changes, deterministic tiebreaks, event ordering, root allocation, depth consensus, and shallow root-value tuples over existing score/rank/family/utility fields.
- ProV4 selector experiments over existing root fields: unified root-policy comparators over current family/rank/score/utility/reply-floor fields, reply-floor/progress, bounded followup/reply breadth, objective latency, scoring-context robustness, move-efficiency delta, static-eval consensus, turn-completion stability, two-turn resilience, online policy rollout, policy-root-pool, forced drainer pressure, drainer walk-threat filtering, targeted exact narrowing, root-breadth rebalancing, and shallow utility switching.
- Root injection and eligibility paths: turn-engine root injection, eligibility guards, exact-lite progress/spirit-window toggles, pre-exact/exact-tactics disabling, safe-mana tactical prepass selectors, root drainer-safety prefilters, enhanced drainer vulnerability toggles, child-vulnerability plausibility screens, and backtrack penalties.
- Current ProV4 root-pool fields and guarded deltas, including root-origin provenance, exact pressure, exact score, score-term leaders, board resource custody/material, mana identity/base/path/contest/pool/pickup access, objective proximity/control/square/screen, carrier route/contact/action/escape/score profiles, consumable/potion/bomb profiles, drainer geometry, demon-line blockers, role coordination/deployment/pressure/contact/escape/mobility/state/base/lane/cohesion/formation/territory/control-map, action threat/reach/target/role/guard/actor/safety/zone/payload/escape/counter/score/denial/pickup/square/vector/fork, Spirit item/handoff, legal fanout, follow-up shape/role/payload, root sequence/transition, worst-reply transition, reply-spectrum fields, and post-reply reversal fields.
- Root class-vector and root-budget stability fields. The 2026-06-25 focused sampled Pro slice exposed `class_vector`/`class_family`/`class_priority` and root-level Pro/Normal/Fast eval/reply/value-reply stability, but root class-vector stayed contaminated and the `root_budget_stability` family had zero low-fragmentation repeated candidate signals with guarded and same-state blockers. Keep these as diagnostics only.

Those paths produced no source permission because evidence stayed `coverage_gap`, `baseline_save_risk`, `no_candidate_route`, singleton-only, fragmented by policy/branch/pair/budget, shared with blockers, or contaminated by guarded baseline saves. Detailed wave notes are archived in `docs/automove-archive.md`.

## Useful Diagnostics

- Use `smart_automove_pro_reliability_hotspot_probe` with `SMART_PRO_RELIABILITY_HOTSPOT_FEN` for one-off board inspection. Do not add temporary source cases just to inspect a copied trace board.
- Use `SMART_PRO_RELIABILITY_DUEL_FILTER` on duel/nonwin trace probes when only one duel bucket needs recurrence evidence.
- Use `pro-promotion-dashboard` before spending runtime code on a broad Pro candidate. Read `PRO_PROMOTION_DASHBOARD_STOPLIGHT` first.
- Use `pro-policy-outcome-corpus` when policy-winner coverage exists but selector evidence is singleton-heavy.
- Use `scripts/postprocess-automove-outcome-corpus-log.sh <log>` or `scripts/summarize-automove-policy-matrix-log.py <log>` after logged policy-matrix runs, then read `corpus_decision`, `next_action`, `source_blocker`, `corpus_axis_summary`, `cross_budget_axis_summary`, and coverage gaps before opening raw records.
- Pass multiple logs to the outcome summarizer when comparing slices; read `rollup_decision`, `rollup_next_action`, `rollup_permission`, and source/blocker counts first.

## Handoff Rule

End each reset iteration with exactly one of:

- a promotable candidate plus confirm instructions;
- a repeated mechanism and the next focused validation command;
- a corpus or harness improvement that reduces singleton ambiguity;
- a documented no-go and no retained runtime source.

If none of those exists, do not commit runtime changes.
