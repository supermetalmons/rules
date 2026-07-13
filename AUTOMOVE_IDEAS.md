# Automove Ideas

This is the live decision board for automove work. Keep it short and decision-oriented.

Use `HOW_TO_ITERATE_ON_AUTOMOVE.md` for workflow, `docs/automove-major-reset-plan.md` for the reset handoff, and `docs/automove-knowledge.md` for durable rules. Retired waves and their evidence receipts are indexed in `docs/automove-archive.md`.

## Current State

- Public Pro routes through `frontier_pro_v10_bounded_tactical`. Public Fast and Normal retain their existing shipping search configurations.
- Retained profiles are `shipping_pro_search`, previous-production comparator `frontier_pro_v2_guarded`, and promoted frontier `frontier_pro_v10_bounded_tactical`.
- Shipping selectors use a cooperative `650ms` outer deadline. Frontier Pro uses `550ms`, first banks the unchanged shipping-Fast search under a `200ms` child deadline, and otherwise returns a deterministic legal emergency move. Independently cold whole-selector calls above `700ms` remain hard failures.
- The relaxed promotion floor is a `7/12` aggregate point rate with confidence at least `0.60`; `6-6` still fails. Confirmation permits at most two variants below `0.50` per panel, replay mismatches at most `3%` per profile/panel, and zero invalid or empty moves.
- Final sampled results were Pro `7-5`, Normal `7-5`, and Fast `10-2`. All-variant confirmation was Pro `33-15`, Normal `32-16`, and Fast `40-8`; every candidate and shipping maximum remained below `700ms`.
- The direct all-variant replacement proof was `16-8` over `frontier_pro_v2_guarded`, with a `562.10ms` candidate maximum, zero invalid output, and `0.35%` cold replay mismatch. The historical unwrapped v2 comparator reached `5,016.97ms` and remains evidence-only.
- No Fast- or Normal-specific candidate completed promotable evidence. This release honestly promotes one Pro policy and retains the validated Fast and Normal policies with complete-selector deadline protection.
- The live experiment surface remains Pro-only and multi-variant. There is no active challenger after the v10 promotion; the next mechanism must be prospectively distinct from the retired node-budget, completed-depth, tactical-pool, policy-stitching, PairNet, and current-corpus evaluator families.

## Reset Portfolio

Use this retained portfolio for policy-corpus and outcome-corpus reset work:

```text
frontier_pro_v10_bounded_tactical,
frontier_pro_v2_guarded,
frontier_pro_v3_alternating_white_edge_mana,
frontier_pro_v3_white_opening_utility_mana,
shipping_pro_search_control,
frontier_pro_v2_raw,
frontier_pro_v2_no_selected_followup_projection,
frontier_pro_v3_full_scored_reply_guard,
frontier_pro_v2_no_low_budget_guard
```

## Next Command Sequence

Read the structural-reset handoff before specifying another mechanism:

```sh
sed -n '1,240p' docs/automove-major-reset-plan.md
./scripts/run-automove-structural-scout.sh --corpus frontier_pro_v10_bounded_tactical
```

Do not rerun or patch a retired candidate. Freeze a new mechanism before implementation and require public-boundary causal reach, independently cold `700ms` timing, fresh direct evidence, cross-budget safety, and release proof before promotion.

## Session End

1. Leave this file with one current state and one next command sequence.
2. Move durable lessons to `docs/automove-knowledge.md`.
3. Move probe diaries and failed-wave detail to `docs/automove-archive.md`.
4. Run `./scripts/check-automove-hygiene.sh`.
5. Clean target logs and stamps only after `./scripts/clean-experiment-artifacts.sh --dry-run` shows that their durable receipt has been preserved.
