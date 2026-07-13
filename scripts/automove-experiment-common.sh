#!/usr/bin/env bash

retained_profiles=(
  shipping_pro_search
  frontier_pro_v2_guarded
  frontier_pro_v10_bounded_tactical
)

sweep_candidates=(
  shipping_pro_search_control
  frontier_pro_v2_guarded
  frontier_pro_v2_raw
  frontier_pro_v2_no_selected_followup_projection
  frontier_pro_v3_full_scored_reply_guard
  frontier_pro_v2_no_low_budget_guard
  frontier_pro_v3_alternating_white_edge_mana
  frontier_pro_v3_white_opening_utility_mana
  frontier_pro_v10_bounded_tactical
)

reset_portfolio=(
  frontier_pro_v10_bounded_tactical
  frontier_pro_v2_guarded
  frontier_pro_v3_alternating_white_edge_mana
  frontier_pro_v3_white_opening_utility_mana
  shipping_pro_search_control
  frontier_pro_v2_raw
  frontier_pro_v2_no_selected_followup_projection
  frontier_pro_v3_full_scored_reply_guard
  frontier_pro_v2_no_low_budget_guard
)

reset_portfolio_csv() {
  local old_ifs="${IFS}"
  IFS=','
  printf '%s\n' "${reset_portfolio[*]}"
  IFS="${old_ifs}"
}

default_policy_corpus_portfolio="$(reset_portfolio_csv)"

default_shipping_profile_for_stage() {
  echo "shipping_pro_search"
}

sweep_candidate_metadata() {
  local candidate_id="$1"
  case "${candidate_id}" in
    shipping_pro_search_control)
      metadata_mechanism="search-only shipping baseline as a policy candidate"
      metadata_expected_invariant="expose where retained search saves guarded without implying source routing"
      metadata_risk_rows="shipping-control repairs have been singleton or budget-conflicted"
      metadata_kill_condition="no repeated non-regressing mechanism below policy label"
      ;;
    frontier_pro_v2_guarded)
      metadata_mechanism="retained previous-production guarded Pro comparator"
      metadata_expected_invariant="anchor historical corpus comparisons to the pre-v10 production route"
      metadata_risk_rows="self-scouts can only report promotion shape or no-source evidence"
      metadata_kill_condition="dashboard not_promising or corpus source_permission no_source"
      ;;
    frontier_pro_v10_bounded_tactical)
      metadata_mechanism="guarded ProV2 with targeted drainer fallback, exact bounded lexicographic attack generation, the root reply-risk veto disabled, a 550ms frontier outer deadline, and a 200ms Fast-bank child deadline; shipping modes retain 650ms"
      metadata_expected_invariant="preserve completed lexical fallback selection, bank an unchanged completed Fast move or deterministic emergency move, clear timeout caches, and keep every whole-selector original/cold call at or below 700ms"
      metadata_risk_rows="at most two below-0.50 variants are tolerated per all-variant confirmation panel"
      metadata_kill_condition="aggregate point rate below 7/12 or confidence below 0.60 in any matchup, more than two below-0.50 confirmation variants, any functional failure, replay mismatch rate above 3% for either profile, or either profile above 700ms on an independently cold call"
      ;;
    frontier_pro_v2_raw)
      metadata_mechanism="direct ProV2 turn-engine path without guarded wrapper fallback routing"
      metadata_expected_invariant="test whether guarded fallback routing is suppressing active-blocker strength"
      metadata_risk_rows="sampled Pro and guarded-save regressions"
      metadata_kill_condition="sampled dashboard miss or baseline-save contamination"
      ;;
    frontier_pro_v2_no_selected_followup_projection)
      metadata_mechanism="guarded runtime with selected followup projection disabled"
      metadata_expected_invariant="separate selected-root overcommit from durable root utility"
      metadata_risk_rows="active Fast only repairs and cross-budget conflicts"
      metadata_kill_condition="mixed cross-budget or fragmented route evidence"
      ;;
    frontier_pro_v3_full_scored_reply_guard)
      metadata_mechanism="reply-risk guard over the full scored root shortlist"
      metadata_expected_invariant="recover roots hidden by selected shortlist timing"
      metadata_risk_rows="guarded white saves and timing-specific baseline-better rows"
      metadata_kill_condition="coverage gap, baseline-save risk, or branch-pair fragmentation"
      ;;
    frontier_pro_v2_no_low_budget_guard)
      metadata_mechanism="guarded runtime with low-budget guard disabled"
      metadata_expected_invariant="test whether low-budget gating blocks active forward repairs"
      metadata_risk_rows="local active forward gains without sampled or budget stability"
      metadata_kill_condition="no-policy help or mixed cross-budget result"
      ;;
    frontier_pro_v3_alternating_white_edge_mana)
      metadata_mechanism="test-only alternating white opening edge-mana root preference"
      metadata_expected_invariant="cover the known alternating white sampled opening class"
      metadata_risk_rows="variant and opening scoped selector pressure"
      metadata_kill_condition="dashboard miss or singleton mechanism evidence"
      ;;
    frontier_pro_v3_white_opening_utility_mana)
      metadata_mechanism="test-only white opening quiet-mana utility selector"
      metadata_expected_invariant="cover the sampled Fast white corner-chain selected-root miss"
      metadata_risk_rows="narrow white opening utility gate and sampled-only overfit"
      metadata_kill_condition="dashboard miss, cost pressure, or fragmented corpus evidence"
      ;;
    *)
      metadata_mechanism="unknown"
      metadata_expected_invariant="unknown"
      metadata_risk_rows="unknown"
      metadata_kill_condition="unknown"
      ;;
  esac
}

print_one_sweep_candidate_metadata() {
  local role="$1"
  local candidate_id="$2"
  sweep_candidate_metadata "${candidate_id}"
  printf 'AUTOMOVE_SWEEP_CANDIDATE_METADATA {"role":"%s","id":"%s","mechanism":"%s","expected_invariant":"%s","risk_rows":"%s","kill_condition":"%s"}\n' \
    "${role}" \
    "${candidate_id}" \
    "${metadata_mechanism}" \
    "${metadata_expected_invariant}" \
    "${metadata_risk_rows}" \
    "${metadata_kill_condition}"
}

print_sweep_candidate_metadata() {
  local role="$1"
  local value="$2"
  local old_ifs="${IFS}"
  local token
  local supported
  IFS=','
  for token in ${value}; do
    IFS="${old_ifs}"
    token="$(printf '%s' "${token}" | xargs)"
    IFS=','
    if [ -z "${token}" ]; then
      continue
    fi
    if [ "${token}" = "all" ]; then
      for supported in "${sweep_candidates[@]}"; do
        print_one_sweep_candidate_metadata "${role}" "${supported}"
      done
      continue
    fi
    print_one_sweep_candidate_metadata "${role}" "${token}"
  done
  IFS="${old_ifs}"
}

profile_is_supported() {
  local profile="$1"
  local supported
  for supported in "${retained_profiles[@]}"; do
    if [ "${supported}" = "${profile}" ]; then
      return 0
    fi
  done
  return 1
}

require_supported_profile() {
  local role="$1"
  local profile="$2"
  if profile_is_supported "${profile}"; then
    return 0
  fi
  echo "unsupported ${role} profile: '${profile}'" >&2
  echo "supported profiles: ${retained_profiles[*]}" >&2
  exit 2
}

profile_is_sweep_candidate() {
  local profile="$1"
  local supported
  for supported in "${sweep_candidates[@]}"; do
    if [ "${supported}" = "${profile}" ]; then
      return 0
    fi
  done
  return 1
}

require_supported_sweep_candidate() {
  local role="$1"
  local profile="$2"
  if profile_is_sweep_candidate "${profile}"; then
    return 0
  fi
  echo "unsupported ${role} sweep candidate: '${profile}'" >&2
  echo "supported sweep candidates: all ${sweep_candidates[*]}" >&2
  exit 2
}

require_supported_sweep_filter() {
  local role="$1"
  local value="$2"
  local old_ifs="${IFS}"
  local token
  IFS=','
  for token in ${value}; do
    IFS="${old_ifs}"
    token="$(printf '%s' "${token}" | xargs)"
    IFS=','
    if [ -z "${token}" ] || [ "${token}" = "all" ]; then
      continue
    fi
    require_supported_sweep_candidate "${role}" "${token}"
  done
  IFS="${old_ifs}"
}
