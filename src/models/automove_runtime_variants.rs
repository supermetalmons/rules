#![cfg(any(target_arch = "wasm32", test))]

use crate::models::automove_deadline;

use super::*;

const EMERGENCY_MAX_INPUT_CHAIN: usize = 8;
const FRONTIER_FAST_BANK_BUDGET_MS: f64 = 200.0;
const FRONTIER_PRO_START_RESERVE_MS: f64 = 100.0;
const FRONTIER_SELECTOR_BUDGET_MS: f64 = 550.0;

#[cfg(test)]
pub(crate) const SHIPPING_PRO_SEARCH_PROFILE_ID: &str = "shipping_pro_search";
#[cfg(test)]
pub(crate) const FRONTIER_PRO_V2_GUARDED_PROFILE_ID: &str = "frontier_pro_v2_guarded";
#[cfg(test)]
pub(crate) const FRONTIER_PRO_V10_BOUNDED_TACTICAL_PROFILE_ID: &str =
    "frontier_pro_v10_bounded_tactical";

#[cfg(test)]
thread_local! {
    static FRONTIER_RUNTIME_VARIANT_BRANCH: std::cell::RefCell<&'static str> =
        const { std::cell::RefCell::new("unset") };
}

#[cfg(test)]
pub(crate) fn clear_frontier_runtime_variant_branch() {
    FRONTIER_RUNTIME_VARIANT_BRANCH.with(|branch| *branch.borrow_mut() = "unset");
}

#[cfg(test)]
pub(crate) fn frontier_runtime_variant_branch_snapshot() -> &'static str {
    FRONTIER_RUNTIME_VARIANT_BRANCH.with(|branch| *branch.borrow())
}

#[cfg(test)]
fn set_frontier_runtime_variant_branch(branch: &'static str) {
    FRONTIER_RUNTIME_VARIANT_BRANCH.with(|last_branch| *last_branch.borrow_mut() = branch);
}

fn shipping_search_config_for_game(
    game: &MonsGame,
    preference: SmartAutomovePreference,
) -> AutomoveSearchConfig {
    MonsGameModel::shipping_search_config_for_game(game, preference)
}

fn select_shipping_search_inputs_internal(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<Input> {
    if automove_deadline::checkpoint() {
        return Vec::new();
    }

    let inputs = MonsGameModel::smart_search_best_inputs(game, config);
    if !inputs.is_empty() {
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }

    let mut simulated = game.clone_for_simulation();
    let output = MonsGameModel::automove_game(&mut simulated);
    if output.kind == OutputModelKind::Events {
        Input::array_from_fen(output.input_fen().as_str())
    } else {
        Vec::new()
    }
}

fn select_frontier_shipping_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<Input> {
    // The bounded v10 route already has an outer frontier deadline, while the
    // retained v2 comparator intentionally has none. Inherit whichever state
    // the caller established instead of starting a fresh shipping deadline.
    select_shipping_search_inputs_internal(game, config)
}

fn select_search_inputs_with_fresh_frontier_cache(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<Input> {
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if config.enable_turn_engine_selector {
        crate::models::automove_turn_engine::clear_turn_engine_plan_cache();
        crate::models::automove_turn_engine::clear_turn_engine_diagnostics();
    }
    select_shipping_search_inputs_internal(game, config)
}

fn clear_selector_caches_after_timeout() {
    crate::models::automove_exact::clear_exact_state_analysis_cache();
    crate::models::automove_turn_engine::clear_turn_engine_plan_cache();
    clear_turn_engine_selector_followup_floor_cache();
}

fn select_frontier_fast_bank_inputs(
    select_fast: impl FnOnce() -> Vec<Input>,
) -> Option<Vec<Input>> {
    let selected =
        automove_deadline::with_cooperative_subdeadline(FRONTIER_FAST_BANK_BUDGET_MS, select_fast);
    if selected.is_none() {
        clear_selector_caches_after_timeout();
    }
    selected
}

pub(crate) fn deterministic_legal_fallback_inputs(game: &MonsGame) -> Vec<Input> {
    let mut simulated = game.clone_for_simulation();
    let mut inputs = Vec::new();
    let start_options = Some(SuggestedStartInputOptions::for_automove());

    loop {
        if inputs.len() > EMERGENCY_MAX_INPUT_CHAIN {
            return Vec::new();
        }
        let output = simulated.process_input_with_start_options_slice(
            inputs.as_slice(),
            true,
            false,
            start_options,
        );
        match output {
            Output::InvalidInput => return Vec::new(),
            Output::LocationsToStartFrom(locations) => {
                let Some(location) = locations.into_iter().min() else {
                    return Vec::new();
                };
                inputs.push(Input::Location(location));
            }
            Output::NextInputOptions(options) => {
                let Some(input) = options.into_iter().map(|option| option.input).min() else {
                    return Vec::new();
                };
                inputs.push(input);
            }
            Output::Events(_) => {
                return if inputs.is_empty() {
                    Vec::new()
                } else {
                    inputs
                };
            }
        }
    }
}

fn select_with_shared_deadline(game: &MonsGame, select: impl FnOnce() -> Vec<Input>) -> Vec<Input> {
    let clear_warm_caches = automove_deadline::take_previous_timeout();
    automove_deadline::with_deadline_if_absent(
        automove_deadline::AUTOMOVE_SELECTOR_BUDGET_MS,
        || {
            let fallback_inputs = deterministic_legal_fallback_inputs(game);
            if clear_warm_caches {
                clear_selector_caches_after_timeout();
            }
            if automove_deadline::checkpoint() {
                return fallback_inputs;
            }

            let selected_inputs = select();
            if selected_inputs.is_empty() || automove_deadline::checkpoint() {
                fallback_inputs
            } else {
                selected_inputs
            }
        },
    )
}

fn select_frontier_with_shared_deadline(
    game: &MonsGame,
    select: impl FnOnce() -> Vec<Input>,
) -> Vec<Input> {
    let clear_warm_caches = automove_deadline::take_previous_timeout();
    automove_deadline::with_deadline_if_absent(FRONTIER_SELECTOR_BUDGET_MS, || {
        let emergency_inputs = deterministic_legal_fallback_inputs(game);
        if clear_warm_caches {
            clear_selector_caches_after_timeout();
        }
        if automove_deadline::checkpoint() {
            return emergency_inputs;
        }

        let fast_runtime = shipping_search_config_for_game(game, SmartAutomovePreference::Fast);
        let fast_inputs = select_frontier_fast_bank_inputs(|| {
            MonsGameModel::smart_search_best_inputs(game, fast_runtime)
        })
        .unwrap_or_default();
        let timeout_inputs = if !fast_inputs.is_empty() && !automove_deadline::checkpoint() {
            fast_inputs
        } else {
            emergency_inputs
        };
        if automove_deadline::checkpoint_with_reserve(FRONTIER_PRO_START_RESERVE_MS) {
            return timeout_inputs;
        }

        let selected_inputs = select();
        if selected_inputs.is_empty() || automove_deadline::checkpoint() {
            timeout_inputs
        } else {
            selected_inputs
        }
    })
}

pub(crate) fn select_shipping_search_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<Input> {
    select_with_shared_deadline(game, || {
        select_shipping_search_inputs_internal(game, config)
    })
}

#[cfg(test)]
pub(crate) fn select_shipping_pro_search_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<Input> {
    select_shipping_search_inputs(game, config)
}

pub(crate) fn apply_frontier_pro_v2_guarded_config(
    config: AutomoveSearchConfig,
) -> AutomoveSearchConfig {
    let mut runtime = config;
    if runtime.depth >= SMART_AUTOMOVE_PRO_DEPTH as usize
        && runtime.enable_normal_root_safety_deep_floor
    {
        runtime.enable_turn_head_rerank = false;
        runtime.enable_turn_engine_selector = true;
        runtime.turn_engine_mode = TurnEngineMode::ProV2;
        runtime.turn_engine_seed_cap = 14;
        runtime.turn_engine_beam_width = 5;
        runtime.turn_engine_per_node_family_cap = 4;
        runtime.turn_engine_step_cap = 6;
        runtime.turn_engine_opponent_seed_cap = 6;
        runtime.turn_engine_opponent_beam_width = 2;
        runtime.turn_engine_reply_seed_cap = 3;
        runtime.turn_engine_reply_beam_width = 1;
        runtime.turn_engine_expansion_cap = 176;
        runtime.turn_engine_enable_spirit_family = true;
        runtime.root_reply_risk_reply_limit = runtime.root_reply_risk_reply_limit.min(24);
        runtime.root_reply_risk_node_share_bp = runtime.root_reply_risk_node_share_bp.min(2_000);
        runtime.enable_turn_engine_low_budget_guard = true;
        runtime.enable_turn_engine_mid_turn_tactical_guard = true;
        runtime.enable_turn_engine_late_safe_mana_root_preference = true;
    }
    runtime
}

pub(crate) fn apply_frontier_pro_v10_bounded_tactical_config(
    config: AutomoveSearchConfig,
) -> AutomoveSearchConfig {
    let mut runtime = apply_frontier_pro_v2_guarded_config(config);
    if runtime.depth >= SMART_AUTOMOVE_PRO_DEPTH as usize
        && runtime.enable_normal_root_safety_deep_floor
    {
        runtime.enable_targeted_drainer_attack_fallback = true;
        runtime.enable_drainer_attack_full_pool = false;
        runtime.enable_root_reply_risk_guard = false;
    }
    runtime
}

fn select_early_white_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Option<Vec<Input>> {
    let early_white_turn_start = game.active_color == Color::White
        && game.turn_number <= 3
        && !game.player_can_use_action()
        && !game.player_can_move_mana()
        && matches!(game.mons_moves_count, 0 | 3);
    let white_turn_one_late_opening_tail = game.active_color == Color::White
        && game.turn_number == 1
        && game.mons_moves_count == 2
        && !game.player_can_use_action()
        && !game.player_can_move_mana();
    let white_turn_three_turn_start_action_mana = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count == 0
        && game.player_can_use_action()
        && game.player_can_move_mana();
    let white_turn_three_mid_turn_full_resources = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count >= 3
        && game.player_can_use_action()
        && game.player_can_move_mana();

    if early_white_turn_start
        || white_turn_one_late_opening_tail
        || white_turn_three_turn_start_action_mana
        || white_turn_three_mid_turn_full_resources
    {
        let shipping_runtime = shipping_search_config_for_game(game, SmartAutomovePreference::Pro);
        return Some(select_frontier_shipping_fallback_inputs(
            game,
            shipping_runtime,
        ));
    }

    let white_turn_three_mana_only = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count == 1
        && !game.player_can_use_action()
        && game.player_can_move_mana();
    let white_turn_three_mid_turn = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count > 0
        && !white_turn_three_mana_only
        && (game.player_can_use_action() || game.player_can_move_mana());
    if !white_turn_three_mid_turn {
        return None;
    }

    let drainer_vulnerable = MonsGameModel::is_own_drainer_vulnerable_next_turn(
        game,
        game.active_color,
        config.enable_enhanced_drainer_vulnerability,
    );
    let drainer_walk_vulnerable = MonsGameModel::is_own_drainer_walk_vulnerable_next_turn(
        game,
        game.active_color,
        config.enable_enhanced_drainer_vulnerability,
    );
    if !drainer_vulnerable && !drainer_walk_vulnerable {
        return None;
    }

    let fast_runtime = shipping_search_config_for_game(game, SmartAutomovePreference::Fast);
    Some(select_frontier_shipping_fallback_inputs(
        game,
        MonsGameModel::with_pre_exact_runtime_policy(fast_runtime),
    ))
}

fn select_score_window_tactical_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Option<Vec<Input>> {
    let white_turn_three_mid_turn_scoring_action_mana = game.active_color == Color::White
        && game.turn_number == 3
        && matches!(game.mons_moves_count, 1 | 2)
        && game.player_can_use_action()
        && game.player_can_move_mana();
    if !white_turn_three_mid_turn_scoring_action_mana {
        return None;
    }

    let context = crate::models::automove_exact::exact_opportunity_context(game, game.active_color);
    if context.delta.same_turn_score_window_value <= 0 {
        return None;
    }

    Some(select_search_inputs_with_fresh_frontier_cache(
        game,
        apply_frontier_pro_v2_guarded_config(config),
    ))
}

fn select_white_early_engine_disabled_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
    frontier_inputs: &[Input],
) -> Option<Vec<Input>> {
    let white_turn_five_turn_start_action_mana = game.active_color == Color::White
        && game.turn_number == 5
        && game.mons_moves_count == 0
        && game.player_can_use_action()
        && game.player_can_move_mana();
    if !white_turn_five_turn_start_action_mana || frontier_inputs.is_empty() {
        return None;
    }

    let context = crate::models::automove_exact::exact_opportunity_context(game, game.active_color);
    if context.opponent_can_win_immediately
        || context.delta.same_turn_score_window_value != 1
        || context.delta.opponent_window_deny_gain != 1
        || context.delta.drainer_attack_available
        || context.delta.drainer_safety >= 0
    {
        return None;
    }

    let frontier_runtime = apply_frontier_pro_v2_guarded_config(config);
    let frontier_roots =
        MonsGameModel::ranked_root_moves(game, game.active_color, frontier_runtime);
    let frontier_selected = frontier_roots
        .iter()
        .find(|root| root.inputs.as_slice() == frontier_inputs)?;
    if frontier_selected.wins_immediately
        || frontier_selected.attacks_opponent_drainer
        || frontier_selected.spirit_development
        || frontier_selected.spirit_same_turn_score_setup_now
        || frontier_selected.spirit_own_mana_setup_now
        || frontier_selected.scores_supermana_this_turn
        || frontier_selected.scores_opponent_mana_this_turn
        || frontier_selected.safe_supermana_pickup_now
        || frontier_selected.safe_opponent_mana_pickup_now
        || frontier_selected.supermana_progress
        || frontier_selected.opponent_mana_progress
        || !frontier_selected.own_drainer_vulnerable
        || frontier_selected.own_drainer_walk_vulnerable
        || frontier_selected.mana_handoff_to_opponent
        || frontier_selected.has_roundtrip
        || frontier_selected.same_turn_score_window_value != 1
    {
        return None;
    }

    let shipping_runtime = shipping_search_config_for_game(game, SmartAutomovePreference::Pro);
    let shipping_inputs = select_frontier_shipping_fallback_inputs(game, shipping_runtime);
    if shipping_inputs.is_empty() || shipping_inputs == frontier_inputs {
        return None;
    }

    let shipping_roots =
        MonsGameModel::ranked_root_moves(game, game.active_color, shipping_runtime);
    let shipping_selected = shipping_roots
        .iter()
        .find(|root| root.inputs.as_slice() == shipping_inputs.as_slice())?;
    if !shipping_selected.spirit_development
        || shipping_selected.spirit_same_turn_score_setup_now
        || !MonsGameModel::turn_engine_root_move_has_progress_surface(shipping_selected)
        || shipping_selected.wins_immediately
        || shipping_selected.attacks_opponent_drainer
        || shipping_selected.scores_supermana_this_turn
        || shipping_selected.scores_opponent_mana_this_turn
        || shipping_selected.safe_supermana_pickup_now
        || shipping_selected.safe_opponent_mana_pickup_now
        || shipping_selected.mana_handoff_to_opponent
        || shipping_selected.has_roundtrip
        || !shipping_selected.own_drainer_vulnerable
        || shipping_selected.own_drainer_walk_vulnerable
        || shipping_selected.same_turn_score_window_value != 0
    {
        return None;
    }

    Some(shipping_inputs)
}

fn select_white_nonnegative_deny_search_only_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
    frontier_inputs: &[Input],
) -> Option<Vec<Input>> {
    let white_turn_three_mana_only = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count == 1
        && !game.player_can_use_action()
        && game.player_can_move_mana();
    if !white_turn_three_mana_only || frontier_inputs.is_empty() {
        return None;
    }

    let context = crate::models::automove_exact::exact_opportunity_context(game, game.active_color);
    if context.opponent_can_win_immediately
        || context.delta.same_turn_score_window_value != 1
        || context.delta.opponent_window_deny_gain != 1
        || context.delta.drainer_attack_available
        || context.delta.drainer_safety >= 0
    {
        return None;
    }

    let frontier_runtime = apply_frontier_pro_v2_guarded_config(config);
    let frontier_roots =
        MonsGameModel::ranked_root_moves(game, game.active_color, frontier_runtime);
    let frontier_selected = frontier_roots
        .iter()
        .find(|root| root.inputs.as_slice() == frontier_inputs)?;
    let frontier_family = MonsGameModel::turn_engine_root_move_family(frontier_selected);
    let frontier_utility = MonsGameModel::turn_engine_scored_root_utility(
        game,
        frontier_selected,
        game.active_color,
        frontier_runtime,
        frontier_family,
    );
    if !frontier_utility.has_nonnegative_deny_gain() {
        return None;
    }

    let mut search_only_runtime = frontier_runtime;
    search_only_runtime.enable_turn_engine_selector = false;
    search_only_runtime.enable_turn_head_rerank = true;
    search_only_runtime.turn_engine_mode = TurnEngineMode::ProV1;

    let search_only_inputs = select_frontier_shipping_fallback_inputs(game, search_only_runtime);
    if search_only_inputs.is_empty() || search_only_inputs == frontier_inputs {
        return None;
    }

    Some(search_only_inputs)
}

fn select_white_negative_deny_search_only_selected_rank_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
    frontier_inputs: &[Input],
) -> Option<Vec<Input>> {
    let white_turn_three_mana_only = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count == 1
        && !game.player_can_use_action()
        && game.player_can_move_mana();
    if !white_turn_three_mana_only || frontier_inputs.is_empty() {
        return None;
    }

    let context = crate::models::automove_exact::exact_opportunity_context(game, game.active_color);
    if context.opponent_can_win_immediately
        || context.delta.same_turn_score_window_value != 1
        || context.delta.opponent_window_deny_gain != 1
        || context.delta.drainer_attack_available
        || context.delta.drainer_safety >= 0
    {
        return None;
    }

    let frontier_runtime = apply_frontier_pro_v2_guarded_config(config);
    let frontier_roots =
        MonsGameModel::ranked_root_moves(game, game.active_color, frontier_runtime);
    let frontier_selected = frontier_roots
        .iter()
        .find(|root| root.inputs.as_slice() == frontier_inputs)?;
    let frontier_family = MonsGameModel::turn_engine_root_move_family(frontier_selected);
    let frontier_utility = MonsGameModel::turn_engine_scored_root_utility(
        game,
        frontier_selected,
        game.active_color,
        frontier_runtime,
        frontier_family,
    );
    if frontier_utility.has_nonnegative_deny_gain() {
        return None;
    }

    let mut search_only_runtime = frontier_runtime;
    search_only_runtime.enable_turn_engine_selector = false;
    search_only_runtime.enable_turn_head_rerank = true;
    let shipping_runtime = shipping_search_config_for_game(game, SmartAutomovePreference::Pro);
    search_only_runtime.turn_engine_seed_cap = shipping_runtime.turn_engine_seed_cap;
    search_only_runtime.turn_engine_beam_width = shipping_runtime.turn_engine_beam_width;
    search_only_runtime.turn_engine_per_node_family_cap =
        shipping_runtime.turn_engine_per_node_family_cap;
    search_only_runtime.turn_engine_step_cap = shipping_runtime.turn_engine_step_cap;

    let search_only_inputs = select_frontier_shipping_fallback_inputs(game, search_only_runtime);
    if search_only_inputs.is_empty() || search_only_inputs == frontier_inputs {
        return None;
    }

    let selected_rank = MonsGameModel::focused_candidate_rank_for_runtime_inputs(
        game,
        game.active_color,
        search_only_runtime,
        search_only_inputs.as_slice(),
    )?;
    if selected_rank != 0 {
        return None;
    }

    Some(search_only_inputs)
}

fn is_safe_quiet_mana_tempo_root(root: &RootEvaluation) -> bool {
    !root.wins_immediately
        && !root.attacks_opponent_drainer
        && !root.own_drainer_vulnerable
        && !root.own_drainer_walk_vulnerable
        && !root.spirit_development
        && !root.spirit_same_turn_score_setup_now
        && !root.spirit_own_mana_setup_now
        && !root.mana_handoff_to_opponent
        && !root.has_roundtrip
        && !root.scores_supermana_this_turn
        && !root.scores_opponent_mana_this_turn
        && !root.safe_supermana_pickup_now
        && !root.safe_opponent_mana_pickup_now
        && root.same_turn_score_window_value == 0
        && !root.supermana_progress
        && !root.opponent_mana_progress
        && !root.classes.is_tactical_priority()
        && !root.classes.carrier_progress
        && !root.classes.material
        && root.classes.quiet
        && matches!(
            MonsGameModel::turn_engine_root_evaluation_family(root),
            TurnPlanFamily::ManaTempo
        )
}

fn root_evaluation_from_scored_root(candidate: ScoredRootMove, score: i32) -> RootEvaluation {
    RootEvaluation {
        root_rank: candidate.root_rank,
        score,
        efficiency: candidate.efficiency,
        inputs: candidate.inputs,
        game: candidate.game,
        wins_immediately: candidate.wins_immediately,
        attacks_opponent_drainer: candidate.attacks_opponent_drainer,
        own_drainer_vulnerable: candidate.own_drainer_vulnerable,
        own_drainer_walk_vulnerable: candidate.own_drainer_walk_vulnerable,
        spirit_development: candidate.spirit_development,
        keeps_awake_spirit_on_base: candidate.keeps_awake_spirit_on_base,
        mana_handoff_to_opponent: candidate.mana_handoff_to_opponent,
        has_roundtrip: candidate.has_roundtrip,
        scores_supermana_this_turn: candidate.scores_supermana_this_turn,
        scores_opponent_mana_this_turn: candidate.scores_opponent_mana_this_turn,
        safe_supermana_pickup_now: candidate.safe_supermana_pickup_now,
        safe_opponent_mana_pickup_now: candidate.safe_opponent_mana_pickup_now,
        safe_supermana_progress_steps: candidate.safe_supermana_progress_steps,
        safe_opponent_mana_progress_steps: candidate.safe_opponent_mana_progress_steps,
        score_path_best_steps: candidate.score_path_best_steps,
        same_turn_score_window_value: candidate.same_turn_score_window_value,
        spirit_setup_gain: candidate.spirit_setup_gain,
        spirit_same_turn_score_setup_now: candidate.spirit_same_turn_score_setup_now,
        spirit_own_mana_setup_now: candidate.spirit_own_mana_setup_now,
        supermana_progress: candidate.supermana_progress,
        opponent_mana_progress: candidate.opponent_mana_progress,
        interview_soft_priority: candidate.interview_soft_priority,
        classes: candidate.classes,
    }
}

fn focused_scored_roots_for_frontier_runtime(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<RootEvaluation> {
    let perspective = game.active_color;
    let mut root_moves = MonsGameModel::ranked_root_moves(game, perspective, config);
    let engine_plan = if config.enable_turn_engine_selector {
        crate::models::automove_turn_engine::turn_engine_candidate_plan(
            game,
            perspective,
            MonsGameModel::turn_engine_config_for_game(game, config),
        )
    } else {
        None
    };
    let advisor_decision = MonsGameModel::pro_v2_root_advisor_presearch(
        game,
        perspective,
        config,
        &mut root_moves,
        engine_plan.as_ref(),
    );
    let advisor_priority_inputs = advisor_decision
        .as_ref()
        .map(MonsGameModel::pro_v2_root_advisor_priority_inputs)
        .unwrap_or_default();
    let (root_moves, scout_visited_nodes) =
        MonsGameModel::focused_root_candidates_with_priority_inputs(
            game,
            perspective,
            root_moves,
            config,
            true,
            (!advisor_priority_inputs.is_empty()).then_some(advisor_priority_inputs.as_slice()),
            None,
        );

    let mut visited_nodes = scout_visited_nodes;
    let mut alpha = i32::MIN;
    let mut scored_roots = Vec::with_capacity(root_moves.len());
    let mut transposition_table = U64HashMap::default();
    let extension_node_budget = if config.enable_selective_extensions
        && config.selective_extension_node_share_bp > 0
    {
        ((config.max_visited_nodes * config.selective_extension_node_share_bp as usize) / 10_000)
            .max(1)
    } else {
        0
    };
    let mut extension_nodes_used = 0usize;
    let mut killer_table: KillerTable = [[0u64; 2]; MAX_SMART_SEARCH_DEPTH + 2];
    let mut history_table: HistoryTable = HistoryTable::default();
    let mut quiescence_nodes_used = 0usize;

    for candidate in root_moves {
        if visited_nodes >= config.max_visited_nodes {
            break;
        }
        visited_nodes += 1;
        let candidate_score = MonsGameModel::evaluate_root_candidate_score(
            &candidate,
            perspective,
            alpha,
            &mut visited_nodes,
            config,
            &mut transposition_table,
            &mut extension_nodes_used,
            extension_node_budget,
            true,
            &mut killer_table,
            &mut history_table,
            &mut quiescence_nodes_used,
        );
        if candidate_score > alpha {
            alpha = candidate_score;
        }
        scored_roots.push(root_evaluation_from_scored_root(candidate, candidate_score));
    }

    scored_roots
}

fn select_white_confirm_prov1_search_only_tiebreak_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
    frontier_inputs: &[Input],
) -> Option<Vec<Input>> {
    let white_turn_three_mons2_mana_only = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count == 2
        && !game.player_can_use_action()
        && game.player_can_move_mana();
    if !white_turn_three_mons2_mana_only || frontier_inputs.is_empty() {
        return None;
    }

    let context = crate::models::automove_exact::exact_opportunity_context(game, game.active_color);
    if context.opponent_can_win_immediately
        || context.delta.same_turn_score_window_value != 0
        || context.delta.spirit_gain != 0
        || context.delta.opponent_window_deny_gain != 0
        || context.delta.drainer_attack_available
        || context.delta.safe_supermana_progress_steps.is_some()
        || context.delta.safe_opponent_mana_progress_steps.is_some()
        || context.delta.drainer_safety < 0
    {
        return None;
    }

    let frontier_runtime = apply_frontier_pro_v2_guarded_config(config);
    let frontier_roots = focused_scored_roots_for_frontier_runtime(game, frontier_runtime);
    let frontier_index = frontier_roots
        .iter()
        .position(|root| root.inputs.as_slice() == frontier_inputs)?;
    let candidate_indices = MonsGameModel::filtered_root_candidate_indices(
        game,
        frontier_roots.as_slice(),
        game.active_color,
        frontier_runtime,
    );
    if candidate_indices.len() != 2 || !candidate_indices.contains(&frontier_index) {
        return None;
    }
    let shortlist = MonsGameModel::reply_risk_guard_shortlist_indices(
        frontier_roots.as_slice(),
        candidate_indices.as_slice(),
        frontier_runtime,
    );
    if shortlist.len() != candidate_indices.len() || !shortlist.contains(&frontier_index) {
        return None;
    }

    let mut search_only_runtime = frontier_runtime;
    search_only_runtime.enable_turn_engine_selector = false;
    search_only_runtime.enable_turn_head_rerank = true;
    search_only_runtime.turn_engine_mode = TurnEngineMode::ProV1;

    let search_only_inputs = select_frontier_shipping_fallback_inputs(game, search_only_runtime);
    if search_only_inputs.is_empty() || search_only_inputs == frontier_inputs {
        return None;
    }

    let search_only_index = frontier_roots
        .iter()
        .position(|root| root.inputs.as_slice() == search_only_inputs.as_slice())?;
    if !candidate_indices.contains(&search_only_index) || !shortlist.contains(&search_only_index) {
        return None;
    }

    let frontier_selected = &frontier_roots[frontier_index];
    let search_only_selected = &frontier_roots[search_only_index];
    if frontier_selected.score != search_only_selected.score
        || frontier_selected.spirit_setup_gain != search_only_selected.spirit_setup_gain
        || frontier_selected.safe_supermana_progress_steps
            != search_only_selected.safe_supermana_progress_steps
        || frontier_selected.safe_opponent_mana_progress_steps
            != search_only_selected.safe_opponent_mana_progress_steps
        || frontier_selected.score_path_best_steps != search_only_selected.score_path_best_steps
        || !is_safe_quiet_mana_tempo_root(frontier_selected)
        || !is_safe_quiet_mana_tempo_root(search_only_selected)
    {
        return None;
    }

    Some(search_only_inputs)
}

fn select_white_confirm_prov1_better_ordered_search_only_fallback_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
    frontier_inputs: &[Input],
) -> Option<Vec<Input>> {
    let white_turn_three_late_mana_only = game.active_color == Color::White
        && game.turn_number == 3
        && game.mons_moves_count >= 3
        && !game.player_can_use_action()
        && game.player_can_move_mana();
    if !white_turn_three_late_mana_only || frontier_inputs.is_empty() {
        return None;
    }

    let context = crate::models::automove_exact::exact_opportunity_context(game, game.active_color);
    if context.opponent_can_win_immediately
        || context.delta.same_turn_score_window_value != 0
        || context.delta.spirit_gain != 0
        || context.delta.opponent_window_deny_gain != 0
        || context.delta.drainer_attack_available
        || context.delta.safe_supermana_progress_steps.is_some()
        || context.delta.safe_opponent_mana_progress_steps.is_some()
        || context.delta.drainer_safety < 0
    {
        return None;
    }

    let frontier_runtime = apply_frontier_pro_v2_guarded_config(config);
    let frontier_roots = focused_scored_roots_for_frontier_runtime(game, frontier_runtime);
    let frontier_index = frontier_roots
        .iter()
        .position(|root| root.inputs.as_slice() == frontier_inputs)?;
    let candidate_indices = MonsGameModel::filtered_root_candidate_indices(
        game,
        frontier_roots.as_slice(),
        game.active_color,
        frontier_runtime,
    );
    if !candidate_indices.contains(&frontier_index) {
        return None;
    }
    let shortlist = MonsGameModel::reply_risk_guard_shortlist_indices(
        frontier_roots.as_slice(),
        candidate_indices.as_slice(),
        frontier_runtime,
    );
    if !shortlist.contains(&frontier_index) {
        return None;
    }

    let mut search_only_runtime = frontier_runtime;
    search_only_runtime.enable_turn_engine_selector = false;
    search_only_runtime.enable_turn_head_rerank = true;
    search_only_runtime.turn_engine_mode = TurnEngineMode::ProV1;

    let search_only_inputs = select_frontier_shipping_fallback_inputs(game, search_only_runtime);
    if search_only_inputs.is_empty() || search_only_inputs == frontier_inputs {
        return None;
    }

    let search_only_index = frontier_roots
        .iter()
        .position(|root| root.inputs.as_slice() == search_only_inputs.as_slice())?;
    if !candidate_indices.contains(&search_only_index) || !shortlist.contains(&search_only_index) {
        return None;
    }

    let frontier_selected = &frontier_roots[frontier_index];
    let search_only_selected = &frontier_roots[search_only_index];
    if search_only_selected.score < frontier_selected.score
        || search_only_selected.root_rank >= frontier_selected.root_rank
        || frontier_selected.spirit_setup_gain != search_only_selected.spirit_setup_gain
        || frontier_selected.safe_supermana_progress_steps
            != search_only_selected.safe_supermana_progress_steps
        || frontier_selected.safe_opponent_mana_progress_steps
            != search_only_selected.safe_opponent_mana_progress_steps
        || frontier_selected.score_path_best_steps != search_only_selected.score_path_best_steps
        || !is_safe_quiet_mana_tempo_root(frontier_selected)
        || !is_safe_quiet_mana_tempo_root(search_only_selected)
    {
        return None;
    }

    Some(search_only_inputs)
}

fn select_unconditional_black_search_fallback_inputs(game: &MonsGame) -> Option<Vec<Input>> {
    let black_turn_two_turn_start_action_mana = game.active_color == Color::Black
        && game.turn_number == 2
        && game.mons_moves_count == 0
        && game.player_can_use_action()
        && game.player_can_move_mana();
    let black_turn_two_mana_only = game.active_color == Color::Black
        && game.turn_number == 2
        && game.mons_moves_count > 0
        && !game.player_can_use_action()
        && game.player_can_move_mana();
    let black_turn_four_turn_start_action_mana = game.active_color == Color::Black
        && game.turn_number == 4
        && game.mons_moves_count == 0
        && game.player_can_use_action()
        && game.player_can_move_mana();
    if black_turn_two_turn_start_action_mana
        || black_turn_two_mana_only
        || black_turn_four_turn_start_action_mana
    {
        let shipping_runtime = shipping_search_config_for_game(game, SmartAutomovePreference::Pro);
        return Some(select_frontier_shipping_fallback_inputs(
            game,
            shipping_runtime,
        ));
    }

    None
}

fn select_late_black_search_fallback_inputs(
    game: &MonsGame,
    frontier_inputs: &[Input],
) -> Option<Vec<Input>> {
    if frontier_inputs.is_empty() {
        return None;
    }

    let black_turn_four_bridge_shipping_fallback = game.active_color == Color::Black
        && game.turn_number == 4
        && game.mons_moves_count == 2
        && game.player_can_use_action()
        && game.player_can_move_mana();
    let black_mid_turn_action_mana_shipping_fallback = game.active_color == Color::Black
        && game.turn_number >= 4
        && game.mons_moves_count >= 3
        && game.player_can_use_action()
        && game.player_can_move_mana();
    if black_turn_four_bridge_shipping_fallback || black_mid_turn_action_mana_shipping_fallback {
        let shipping_runtime = shipping_search_config_for_game(game, SmartAutomovePreference::Pro);
        let shipping_inputs = select_frontier_shipping_fallback_inputs(game, shipping_runtime);

        if black_turn_four_bridge_shipping_fallback
            && !shipping_inputs.is_empty()
            && shipping_inputs != frontier_inputs
            && shipping_inputs.len() == 3
            && Input::fen_from_array(&shipping_inputs).ends_with(";mb")
        {
            return Some(shipping_inputs);
        }

        if black_mid_turn_action_mana_shipping_fallback
            && !shipping_inputs.is_empty()
            && shipping_inputs != frontier_inputs
        {
            return Some(shipping_inputs);
        }
    }

    None
}

fn execute_frontier_candidate_inputs_with_runtime(
    game: &MonsGame,
    runtime: AutomoveSearchConfig,
) -> Vec<Input> {
    select_search_inputs_with_fresh_frontier_cache(game, runtime)
}

fn select_frontier_pro_v2_guarded_inputs_with_runtime(
    game: &MonsGame,
    config: AutomoveSearchConfig,
    frontier_runtime: AutomoveSearchConfig,
) -> Vec<Input> {
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_early_white_fallback_inputs(game, config) {
        #[cfg(test)]
        set_frontier_runtime_variant_branch("early_white_fallback");
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_score_window_tactical_fallback_inputs(game, config) {
        #[cfg(test)]
        set_frontier_runtime_variant_branch("score_window_tactical_fallback");
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_unconditional_black_search_fallback_inputs(game) {
        #[cfg(test)]
        set_frontier_runtime_variant_branch("late_black_shipping_fallback");
        return inputs;
    }

    let frontier_inputs = execute_frontier_candidate_inputs_with_runtime(game, frontier_runtime);
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) =
        select_white_early_engine_disabled_fallback_inputs(game, config, frontier_inputs.as_slice())
    {
        #[cfg(test)]
        set_frontier_runtime_variant_branch("white_early_engine_disabled_fallback");
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_white_nonnegative_deny_search_only_fallback_inputs(
        game,
        config,
        frontier_inputs.as_slice(),
    ) {
        #[cfg(test)]
        set_frontier_runtime_variant_branch("white_nonnegative_deny_search_only_fallback");
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_white_negative_deny_search_only_selected_rank_fallback_inputs(
        game,
        config,
        frontier_inputs.as_slice(),
    ) {
        #[cfg(test)]
        set_frontier_runtime_variant_branch(
            "white_negative_deny_search_only_selected_rank_fallback",
        );
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_white_confirm_prov1_search_only_tiebreak_fallback_inputs(
        game,
        config,
        frontier_inputs.as_slice(),
    ) {
        #[cfg(test)]
        set_frontier_runtime_variant_branch("white_confirm_prov1_search_only_tiebreak_fallback");
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_white_confirm_prov1_better_ordered_search_only_fallback_inputs(
        game,
        config,
        frontier_inputs.as_slice(),
    ) {
        #[cfg(test)]
        set_frontier_runtime_variant_branch(
            "white_confirm_prov1_better_ordered_search_only_fallback",
        );
        return inputs;
    }
    if automove_deadline::checkpoint() {
        return Vec::new();
    }
    if let Some(inputs) = select_late_black_search_fallback_inputs(game, frontier_inputs.as_slice())
    {
        #[cfg(test)]
        set_frontier_runtime_variant_branch("late_black_shipping_fallback");
        return inputs;
    }
    #[cfg(test)]
    set_frontier_runtime_variant_branch("frontier_execute");
    frontier_inputs
}

#[cfg(test)]
pub(crate) fn select_frontier_pro_v2_guarded_inputs_with_frontier_runtime(
    game: &MonsGame,
    config: AutomoveSearchConfig,
    frontier_runtime: AutomoveSearchConfig,
) -> Vec<Input> {
    select_frontier_with_shared_deadline(game, || {
        select_frontier_pro_v2_guarded_inputs_with_runtime(game, config, frontier_runtime)
    })
}

#[cfg(test)]
pub(crate) fn select_frontier_pro_v2_guarded_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<Input> {
    select_frontier_pro_v2_guarded_inputs_with_runtime(
        game,
        config,
        apply_frontier_pro_v2_guarded_config(config),
    )
}

pub(crate) fn select_frontier_pro_v10_bounded_tactical_inputs(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<Input> {
    select_frontier_with_shared_deadline(game, || {
        select_frontier_pro_v2_guarded_inputs_with_runtime(
            game,
            config,
            apply_frontier_pro_v10_bounded_tactical_config(config),
        )
    })
}

pub(crate) fn turn_engine_config_from_search_config(
    config: AutomoveSearchConfig,
) -> TurnEngineConfig {
    TurnEngineConfig {
        mode: config.turn_engine_mode,
        own_seed_cap: config.turn_engine_seed_cap.max(1),
        own_beam: config.turn_engine_beam_width.max(1),
        per_node_family_cap: config.turn_engine_per_node_family_cap.max(1),
        step_cap: config.turn_engine_step_cap.max(1),
        opponent_seed_cap: config.turn_engine_opponent_seed_cap.max(1),
        opponent_beam: config.turn_engine_opponent_beam_width.max(1),
        reply_seed_cap: config.turn_engine_reply_seed_cap.max(1),
        reply_beam: config.turn_engine_reply_beam_width.max(1),
        expansion_cap: config.turn_engine_expansion_cap.max(1),
        enable_spirit_family: config.turn_engine_enable_spirit_family,
        scoring_weights: config.scoring_weights,
        allow_exact_static_evaluation: config.enable_static_exact_evaluation,
        enable_lazy_oracle_score_window_projection: config
            .enable_turn_engine_lazy_oracle_score_window_projection,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_inputs_yield_events(game: &MonsGame, inputs: &[Input]) {
        assert!(!inputs.is_empty());
        let mut simulated = game.clone_for_simulation();
        assert!(matches!(
            simulated.process_input(inputs.to_vec(), false, false),
            Output::Events(_)
        ));
    }

    #[test]
    fn automove_runtime_deterministic_fallback_is_nonempty_and_legal() {
        let game = MonsGame::new(false, GameVariant::Classic);
        let first = deterministic_legal_fallback_inputs(&game);
        let second = deterministic_legal_fallback_inputs(&game);

        assert_eq!(first, second);
        assert_inputs_yield_events(&game, first.as_slice());
    }

    #[test]
    fn automove_runtime_expired_outer_deadline_returns_shared_fallback_for_all_public_modes_and_variants(
    ) {
        for variant_id in 0..=11 {
            let variant = GameVariant::from_id(variant_id).expect("known game variant");
            let game = MonsGame::new(false, variant);
            let expected = deterministic_legal_fallback_inputs(&game);

            automove_deadline::with_test_clock(0.0, || {
                for preference in [
                    SmartAutomovePreference::Fast,
                    SmartAutomovePreference::Normal,
                ] {
                    let config = shipping_search_config_for_game(&game, preference);
                    let selected = automove_deadline::with_deadline_if_absent(0.0, || {
                        select_shipping_search_inputs(&game, config)
                    });
                    assert_eq!(
                        selected, expected,
                        "variant={variant_id} mode={preference:?}"
                    );
                    assert_inputs_yield_events(&game, selected.as_slice());
                }

                let pro_config =
                    shipping_search_config_for_game(&game, SmartAutomovePreference::Pro);
                let selected = automove_deadline::with_deadline_if_absent(0.0, || {
                    select_frontier_pro_v10_bounded_tactical_inputs(&game, pro_config)
                });
                assert_eq!(selected, expected, "variant={variant_id} mode=Pro");
                assert_inputs_yield_events(&game, selected.as_slice());
            });
        }
    }

    #[test]
    fn automove_runtime_frontier_timeout_returns_completed_fast_fallback() {
        let game = MonsGame::new(false, GameVariant::Classic);
        let fast_config = shipping_search_config_for_game(&game, SmartAutomovePreference::Fast);
        let expected = MonsGameModel::smart_search_best_inputs(&game, fast_config);
        assert_inputs_yield_events(&game, expected.as_slice());

        automove_deadline::with_test_clock(0.0, || {
            let selected = select_frontier_with_shared_deadline(&game, || {
                automove_deadline::set_test_now_ms(FRONTIER_SELECTOR_BUDGET_MS + 1.0);
                Vec::new()
            });
            assert_eq!(selected, expected);
            assert_inputs_yield_events(&game, selected.as_slice());
        });
    }

    #[test]
    fn automove_runtime_timed_out_fast_bank_clears_caches_and_restores_outer() {
        let game = MonsGame::new(false, GameVariant::Classic);
        let emergency_inputs = deterministic_legal_fallback_inputs(&game);
        clear_turn_engine_selector_followup_floor_cache();

        automove_deadline::with_test_clock(0.0, || {
            automove_deadline::with_deadline_if_absent(
                automove_deadline::AUTOMOVE_SELECTOR_BUDGET_MS,
                || {
                    let selected = select_frontier_fast_bank_inputs(|| {
                        let _ = MonsGameModel::move_efficiency_snapshot(
                            &game,
                            game.active_color,
                            false,
                            false,
                        );
                        assert!(move_efficiency_snapshot_cache_len() > 0);
                        automove_deadline::set_test_now_ms(FRONTIER_FAST_BANK_BUDGET_MS + 1.0);
                        emergency_inputs.clone()
                    });

                    assert_eq!(selected, None);
                    assert_eq!(move_efficiency_snapshot_cache_len(), 0);
                    assert!(!automove_deadline::cancelled());
                    assert_eq!(
                        automove_deadline::remaining_ms(),
                        Some(
                            automove_deadline::AUTOMOVE_SELECTOR_BUDGET_MS
                                - FRONTIER_FAST_BANK_BUDGET_MS
                                - 1.0
                        )
                    );
                    assert!(!automove_deadline::checkpoint_with_reserve(
                        FRONTIER_PRO_START_RESERVE_MS
                    ));
                },
            );
            assert!(!automove_deadline::take_previous_timeout());
        });
    }

    #[test]
    fn automove_runtime_discards_warm_selector_caches_after_timeout() {
        let game = MonsGame::new(false, GameVariant::Classic);
        clear_turn_engine_selector_followup_floor_cache();
        let _ = MonsGameModel::move_efficiency_snapshot(&game, game.active_color, false, false);
        assert!(move_efficiency_snapshot_cache_len() > 0);

        automove_deadline::with_test_clock(0.0, || {
            automove_deadline::with_deadline_if_absent(0.0, || {
                assert!(automove_deadline::checkpoint());
            });
            let selected = select_with_shared_deadline(&game, || {
                assert_eq!(move_efficiency_snapshot_cache_len(), 0);
                deterministic_legal_fallback_inputs(&game)
            });
            assert_inputs_yield_events(&game, selected.as_slice());
        });
    }

    #[test]
    fn frontier_pro_v10_bounded_tactical_isolates_promoted_runtime_delta() {
        let game = MonsGame::new(false, GameVariant::Classic);
        let config = shipping_search_config_for_game(&game, SmartAutomovePreference::Pro);
        let guarded = apply_frontier_pro_v2_guarded_config(config);
        let promoted = apply_frontier_pro_v10_bounded_tactical_config(config);

        assert!(!guarded.enable_targeted_drainer_attack_fallback);
        assert!(guarded.enable_root_reply_risk_guard);
        assert!(promoted.enable_targeted_drainer_attack_fallback);
        assert!(!promoted.enable_drainer_attack_full_pool);
        assert!(!promoted.enable_root_reply_risk_guard);
        assert_eq!(promoted.depth, guarded.depth);
        assert_eq!(promoted.max_visited_nodes, guarded.max_visited_nodes);
    }

    #[test]
    #[ignore = "diagnostic: cold replay the Black turn-8 whole-selector deadline tail"]
    fn automove_runtime_black_turn_eight_deadline_tail_probe() {
        let game = MonsGame::from_fen(
            "1 0 b 0 0 0 0 0 8 n11/n02y0xn01s0xn01a0xxxmn03/n02xxmn02d0xn05/n03xxmn02xxmn04/n04e0xn02xxmn03/xxQn03S0xxxUn04xxQ/n03xxMY0xn06/n04xxMn03xxMn02/n11/n04E0xA0xn02xxMn02/n09D0xn01",
            false,
        )
        .expect("valid Black turn-8 deadline-tail fixture");
        let config = shipping_search_config_for_game(&game, SmartAutomovePreference::Pro);
        let fast_config = shipping_search_config_for_game(&game, SmartAutomovePreference::Fast);
        let emergency_inputs = deterministic_legal_fallback_inputs(&game);
        clear_selector_caches_after_timeout();
        let fast_inputs = MonsGameModel::smart_search_best_inputs(&game, fast_config);
        clear_selector_caches_after_timeout();
        let shipping_pro_inputs = select_shipping_search_inputs(&game, config);
        println!(
            "AUTOMOVE_BLACK_TURN_EIGHT_DEADLINE_TAIL_BASELINES emergency={} fast={} shipping_pro={}",
            Input::fen_from_array(emergency_inputs.as_slice()),
            Input::fen_from_array(fast_inputs.as_slice()),
            Input::fen_from_array(shipping_pro_inputs.as_slice()),
        );

        let guarded_runtime = apply_frontier_pro_v2_guarded_config(config);
        let bounded_tactical_runtime = apply_frontier_pro_v10_bounded_tactical_config(config);
        let mut per_mon_runtime = bounded_tactical_runtime;
        per_mon_runtime.enable_targeted_drainer_attack_fallback = false;
        per_mon_runtime.enable_per_mon_drainer_attack_fallback = true;
        for (label, runtime) in [
            ("guarded", guarded_runtime),
            ("targeted", bounded_tactical_runtime),
            ("per_mon", per_mon_runtime),
        ] {
            for repeat in 0..2 {
                clear_selector_caches_after_timeout();
                clear_frontier_runtime_variant_branch();
                let start = std::time::Instant::now();
                let inputs = select_frontier_pro_v2_guarded_inputs_with_frontier_runtime(
                    &game, config, runtime,
                );
                let elapsed_ms = start.elapsed().as_secs_f64() * 1_000.0;
                println!(
                    "AUTOMOVE_BLACK_TURN_EIGHT_DEADLINE_TAIL_RUNTIME label={} repeat={} elapsed_ms={:.3} branch={} inputs={}",
                    label,
                    repeat,
                    elapsed_ms,
                    frontier_runtime_variant_branch_snapshot(),
                    Input::fen_from_array(inputs.as_slice()),
                );
                assert!(
                    elapsed_ms <= 700.0,
                    "Black turn-8 {label} selector exceeded hard limit: repeat={repeat} elapsed_ms={elapsed_ms:.3}"
                );
                assert_inputs_yield_events(&game, inputs.as_slice());
            }
        }

        for repeat in 0..8 {
            clear_selector_caches_after_timeout();
            clear_frontier_runtime_variant_branch();
            let start = std::time::Instant::now();
            let inputs = select_frontier_pro_v10_bounded_tactical_inputs(&game, config);
            let elapsed_ms = start.elapsed().as_secs_f64() * 1_000.0;
            println!(
                "AUTOMOVE_BLACK_TURN_EIGHT_DEADLINE_TAIL repeat={} elapsed_ms={:.3} branch={} inputs={}",
                repeat,
                elapsed_ms,
                frontier_runtime_variant_branch_snapshot(),
                Input::fen_from_array(inputs.as_slice()),
            );
            assert!(
                elapsed_ms <= 700.0,
                "Black turn-8 promoted selector exceeded hard limit: repeat={repeat} elapsed_ms={elapsed_ms:.3}"
            );
            assert_inputs_yield_events(&game, inputs.as_slice());
        }
    }
}
