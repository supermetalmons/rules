# Automove Reset Review

This is the reset document for escaping the failed seam-iteration loop. For the current actionable major-reset plan, read `docs/automove-major-reset-plan.md` first; for the broader architecture map, read `docs/automove-structural-review.md`.

Use it when `AUTOMOVE_IDEAS.md` says there is no live challenger, when recent work keeps producing sampled-only false positives, or when a candidate clears one variant row by rotating another row down.

## Bottom Line

The project is not mainly blocked by lack of another local automove rule. It is blocked by an architecture/harness loop that makes local rules cheap to invent and global strength expensive to prove.

The next stronger automove should come from one of two broad paths:

- a new Pro policy architecture that ranks all candidate roots through one calibrated utility model;
- a stronger evidence harness that mines repeated mechanisms and candidate labels before any runtime selector is written.

Do not start the next iteration by adding another variant, turn, family, or move-context gate around `frontier_pro_v10_bounded_tactical`; use v2 only as the retained previous-production control.

## Current Shape

- Public Pro ships through `frontier_pro_v10_bounded_tactical`.
- `frontier_pro_v2_guarded` and `shipping_pro_search` remain the previous-production comparator and search-only baseline.
- Test-only candidates live under `#[cfg(test)]` in the automove experiments diagnostics.
- The promoted runtime is bounded tactical v10 over the ProV2 turn-engine selector plus wrapper fallbacks. Those inherited fallbacks are mixed: the same branch labels can be saves or regressions.
- The live blocker surface is multi-variant and multi-budget. Candidates that fix Pro-vs-Pro often fail Normal, Fast, active blockers, or all-variant confirmation.
- The existing promotion dashboard and decision-record probes are useful, but older structural workflows still let agents spend time on profile-sweep or local first-diff evidence before asking whether a candidate has promotion shape.

## Failed Pattern

The failed loop has a recognizable sequence:

1. Find one or two losing openings.
2. Build a local runtime or test-only selector that fixes those openings.
3. Run a sampled panel and see one row improve.
4. Hit a different weak row, budget conflict, active-blocker failure, or all-variant collapse.
5. Record another no-go without gaining a stronger next mechanism.

This is a dead end because most remaining misses are singleton-heavy below `frontier_execute`. Branch labels, variant labels, and first-diff move pairs are too coarse to support runtime code.

## Positions And Counterpositions

### Position: Stop Writing More Static Selectors

Static selectors over policy labels, branch labels, exact contexts, or first moves have repeatedly overfit sampled Pro and rotated Normal/Fast or active blockers.

Counterposition: selectors are still useful as diagnostics.

Resolution: use selectors only to prove oracle coverage or expose timing conflicts. Do not retain selector source unless the promotion dashboard classifies it as broadly promising across sampled and active panels.

### Position: Do Not Delete The Guarded Wrapper Chain Wholesale

Raw ProV2 and no-late-black variants can improve active blockers, but they fail sampled Pro or rotate Normal/Fast. Guarded branches are not globally bad.

Counterposition: the wrapper chain is clearly part of the problem.

Resolution: treat wrapper branches as training labels and ablation evidence, not as direct deletion targets. Delete or replace wrapper behavior only after a mechanism below the branch label is one-sided across sampled and active panels.

### Position: The Harness Must Rank Mechanisms, Not Just Report Failures

The current probes produce enough output to kill candidates, but not enough structured pressure to identify the next feature.

Counterposition: the dashboard and decision-record probes already exist.

Resolution: structural work must run the promotion dashboard first, then decision-record aggregation only for a globally promising candidate with one explainable miss. A candidate with singleton-heavy sampled or active misses dies immediately.

### Position: ProV3 Needs A New Utility Model, Not More Utility Gates

Shallow `TurnEngineUtility` ordering, score floors, reply-risk shortlist ordering, recovery-rank demotion, and quiet-mana utility selectors all moved rows without promoting.

Counterposition: utility is still the right abstraction.

Resolution: the next utility work must add new features or calibration, not another gate around the existing axes. It must explain why a policy sometimes needs to enter before or after the printed first divergence.

## Major Paths

### Path 1: Outcome Corpus First

Build a corpus diagnostic that records every candidate decision across sampled and active panels, then aggregates by mechanism before any runtime code is changed.

Minimum useful record:

- panel, seed, variant, color, turn, ply, budget matchup;
- selected root, shipping root, guarded root, candidate roots;
- branch, advisor reason, pre-accept family, head family, final family;
- shortlist size, root rank, selected/head/advisor/legacy/preserved/injected status;
- `TurnEngineUtility`, search eval, exact context, reply-risk snapshot;
- outcome delta and whether both sides lost.

Promotion criterion for spending runtime code:

- one mechanism repeats across more than one variant or budget panel;
- baseline saves and candidate wins separate cleanly;
- the candidate has dashboard strength before attribution starts.

### Path 2: ProV4 Unified Root Policy

Create a test-only policy that treats all roots, preserved roots, omitted shipping roots, head candidates, and fallback roots as one ranked pool.

Key design points:

- use one comparator instead of late exceptions spread across wrapper fallback, advisor approval, head acceptance, and final selection;
- make reply-risk and continuation value first-class root features;
- keep wrapper branch outputs as candidates, not direct routing decisions;
- retain `frontier_pro_v10_bounded_tactical` as public/default frontier and v2 as the previous-production baseline until a later dashboard passes.

This is a larger implementation, but it addresses the current failure mode directly: the winning policy label often needs to enter at a different time than the first divergence printed by policy-winner.

### Path 3: Utility Calibration From Existing Candidate Portfolio

Use the existing portfolio as supervision:

- guarded;
- raw ProV2;
- no-selected-followup;
- full-scored reply guard;
- alternating-white utility;
- white-opening utility;
- shipping-control;
- any new ProV3 component.

For each first divergence, record which candidate policies win and which baseline decisions are saves. Then fit or hand-derive utility features that separate those classes before writing runtime code.

Good feature families to investigate:

- continuation stability after the selected root, not just immediate root score;
- candidate-set preservation and omission status;
- reply-risk floor plus progress/setup interaction;
- budget-invariant safety/progress features;
- root timing: when the policy must enter before first printed divergence.

### Path 4: Harness-Level Candidate Triage

Make structural scout the default gate for test-only candidates. The first question should be "does this candidate have promotion shape?", not "which single row did it repair?"

Required order:

1. `./scripts/run-automove-structural-scout.sh <candidate>`
2. If both panels are directional and there is one explainable miss, run `pro-sweep-decision-record`.
3. If records are not singleton-heavy, run attribution or forced-root oracle.
4. Only then retain runtime or profile source.

The structural scout now starts with `pro-promotion-dashboard`, because that is the diagnostic that exposes sampled-vs-active classification, weak rows, guarded deltas, cost, and Pro/Normal/Fast shape in one place.

### Path 5: Reduce The Live Board To Decisions

`AUTOMOVE_IDEAS.md` is too long to be an effective next-action surface. It should contain:

- current retained profiles;
- one live hypothesis or "no live hypothesis";
- the latest no-go only if it changes the next decision;
- the next required command sequence.

Move historical probe diaries to `docs/automove-archive.md` or this reset review. Future iterations should not add another long no-go bullet unless it changes a rule.

## Stronger Next Candidate Requirements

A candidate is worth broad runtime work only if all of these are true:

- It is not a static selector over existing policy labels.
- It is not scoped primarily by variant, exact move, or first-diff FEN.
- It changes a shared utility/root-evaluation mechanism.
- It is first evaluated on the promotion dashboard.
- Its misses are not singleton-heavy below branch label.
- It has a plausible reason to hold across Pro, Normal, and Fast opponents.
- It does not exceed the Pro move-time ceiling.

## Suggested Next Iteration

Do not create another runtime patch first. In reset mode, start with:

```sh
./scripts/run-automove-structural-scout.sh --corpus frontier_pro_v10_bounded_tactical
```

Implement or extend a corpus-style diagnostic that can compare the existing policy portfolio and emit one aggregate table keyed by mechanism:

- advisor reason;
- selected, head, preserved, omitted, and legacy root family;
- root rank and shortlist membership;
- exact opportunity context;
- reply-risk summary;
- utility axes;
- outcome class across sampled and active panels.

The current first runner entrypoint for this is the policy-winner corpus subset:

```sh
./scripts/run-automove-experiment.sh pro-policy-corpus frontier_pro_v2_guarded,frontier_pro_v3_alternating_white_edge_mana,frontier_pro_v3_white_opening_utility_mana,shipping_pro_search_control,frontier_pro_v2_raw,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard,frontier_pro_v2_no_low_budget_guard
```

It records the first winning policy for baseline losses and ties that win back to guarded root/advisor/head/utility status. Then use that aggregate to choose between ProV4 unified root policy work and utility calibration work. If the aggregate remains singleton-heavy, the correct next move is extending the full matrix/corpus harness, not a runtime selector.

When the first-winning corpus has oracle coverage but singleton-heavy winners, use the outcome-corpus wrapper before source edits:

```sh
SMART_PRO_POLICY_MATRIX_PANEL_FILTER=active_blockers \
SMART_PRO_POLICY_MATRIX_DUEL_FILTER=vs_shipping_fast \
./scripts/run-automove-experiment.sh pro-policy-outcome-corpus frontier_pro_v2_guarded,frontier_pro_v3_alternating_white_edge_mana,frontier_pro_v3_white_opening_utility_mana,shipping_pro_search_control,frontier_pro_v2_raw,frontier_pro_v2_no_selected_followup_projection,frontier_pro_v3_full_scored_reply_guard,frontier_pro_v2_no_low_budget_guard
```

This emits `PRO_POLICY_MATRIX_CANDIDATE_STOPLIGHT` and `PRO_POLICY_MATRIX_PORTFOLIO_STOPLIGHT`. A `singleton_selector_pressure` label is a kill for static selectors over the current portfolio; only repeated winner context or pair labels justify expensive decision probes or attribution.
