use super::harness::*;
use super::profiles::*;
use super::*;
use crate::models::automove_deadline;
use crate::models::automove_exact::{
    clear_exact_query_diagnostics, clear_exact_state_analysis_cache,
    exact_query_diagnostics_snapshot, ExactQueryDiagnostics,
};
use crate::models::automove_turn_engine::{
    clear_turn_engine_diagnostics, clear_turn_engine_plan_cache, turn_engine_cached_step,
    turn_engine_candidate_plan, turn_engine_diagnostics_snapshot, TurnEngineConfig,
    TurnEngineDiagnostics, TurnEngineMode,
};
use crate::models::mons_game_model::automove_runtime_variants::{
    apply_frontier_pro_v2_guarded_config, clear_frontier_runtime_variant_branch,
    frontier_runtime_variant_branch_snapshot,
    turn_engine_config_from_search_config as shared_turn_engine_config_from_search_config,
};
use crate::models::mons_game_model::{
    clear_turn_engine_selector_diagnostics, pro_v2_root_advisor_decision_snapshot,
    turn_engine_selector_diagnostics_snapshot, TurnEngineSelectorDiagnostics,
};
use std::env;

fn stage1_cpu_budgets(profile_name: &str) -> Vec<SearchBudget> {
    if profile_name.starts_with("frontier_pro_") {
        return vec![pro_budget()];
    }

    let mut budgets = client_budgets().to_vec();
    if env_bool("SMART_STAGE1_INCLUDE_PRO").unwrap_or(false) {
        budgets.push(pro_budget());
    }
    budgets
}

fn assert_turn_engine_configs_match(left: TurnEngineConfig, right: TurnEngineConfig) {
    assert_eq!(left.mode, right.mode);
    assert_eq!(left.own_seed_cap, right.own_seed_cap);
    assert_eq!(left.own_beam, right.own_beam);
    assert_eq!(left.per_node_family_cap, right.per_node_family_cap);
    assert_eq!(left.step_cap, right.step_cap);
    assert_eq!(left.opponent_seed_cap, right.opponent_seed_cap);
    assert_eq!(left.opponent_beam, right.opponent_beam);
    assert_eq!(left.reply_seed_cap, right.reply_seed_cap);
    assert_eq!(left.reply_beam, right.reply_beam);
    assert_eq!(left.expansion_cap, right.expansion_cap);
    assert_eq!(left.enable_spirit_family, right.enable_spirit_family);
    assert!(std::ptr::eq(left.scoring_weights, right.scoring_weights));
    assert_eq!(
        left.allow_exact_static_evaluation,
        right.allow_exact_static_evaluation
    );
    assert_eq!(
        left.enable_lazy_oracle_score_window_projection,
        right.enable_lazy_oracle_score_window_projection
    );
}

fn stage1_cpu_ratio_limit(mode: &str) -> f64 {
    match mode {
        "fast" => SMART_STAGE1_CPU_RATIO_MAX_FAST,
        "normal" => SMART_STAGE1_CPU_RATIO_MAX_NORMAL,
        "pro" => SMART_STAGE1_CPU_RATIO_MAX_PRO,
        _ => SMART_STAGE1_CPU_RATIO_MAX_PRO,
    }
}

fn stage1_seed_tags() -> Vec<String> {
    let from_env = env::var("SMART_STAGE1_SEED_TAGS")
        .ok()
        .map(|value| {
            value
                .split(',')
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if !from_env.is_empty() {
        assert!(
            from_env.len() >= 3,
            "stage-1 cpu gate requires at least 3 seeds; got {}",
            from_env.len()
        );
        return from_env;
    }
    vec![
        "stage1_cpu_v1".to_string(),
        "stage1_cpu_v2".to_string(),
        "stage1_cpu_v3".to_string(),
    ]
}

fn stage1_cpu_measurement_repeats() -> usize {
    env_usize("SMART_STAGE1_MEASUREMENT_REPEATS")
        .unwrap_or(3)
        .max(1)
}

fn median_f64(values: &mut [f64]) -> f64 {
    values.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let mid = values.len() / 2;
    if values.len().is_multiple_of(2) {
        (values[mid - 1] + values[mid]) / 2.0
    } else {
        values[mid]
    }
}

fn env_f64(name: &str) -> Option<f64> {
    env::var(name)
        .ok()
        .and_then(|value| value.trim().parse::<f64>().ok())
}

fn env_override_mutex() -> &'static Mutex<()> {
    static ENV_OVERRIDE_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();
    ENV_OVERRIDE_MUTEX.get_or_init(|| Mutex::new(()))
}

thread_local! {
    static ENV_OVERRIDE_DEPTH: std::cell::Cell<usize> = const { std::cell::Cell::new(0) };
}

fn with_env_override_unlocked<T>(name: &str, value: &str, f: impl FnOnce() -> T) -> T {
    let previous = env::var(name).ok();
    env::set_var(name, value);
    let result = f();
    if let Some(previous) = previous {
        env::set_var(name, previous);
    } else {
        env::remove_var(name);
    }
    result
}

fn with_env_override<T>(name: &str, value: &str, f: impl FnOnce() -> T) -> T {
    if ENV_OVERRIDE_DEPTH.with(|depth| depth.get()) > 0 {
        return with_env_override_unlocked(name, value, f);
    }

    let _guard = env_override_mutex()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    ENV_OVERRIDE_DEPTH.with(|depth| depth.set(1));
    let result = with_env_override_unlocked(name, value, f);
    ENV_OVERRIDE_DEPTH.with(|depth| depth.set(0));
    result
}

fn calibration_runtime_config(
    profile_name: &str,
    game: &MonsGame,
    mode: SmartAutomovePreference,
) -> AutomoveSearchConfig {
    let base = SearchBudget::from_preference(mode).runtime_config_for_game(game);
    profile_runtime_config_for_name(profile_name, game, base).unwrap_or_else(|| {
        panic!(
            "profile '{}' does not expose a runtime config",
            profile_name
        )
    })
}

fn calibration_turn_engine_config(config: AutomoveSearchConfig) -> TurnEngineConfig {
    shared_turn_engine_config_from_search_config(config)
}

#[test]
fn frontier_pro_v2_guarded_config_applies_expected_tuning() {
    let game = MonsGame::new(false, GameVariant::Classic);
    let base = MonsGameModel::with_game(game.clone())
        .shipping_search_config_for_preference(SmartAutomovePreference::Pro);
    let frontier = apply_frontier_pro_v2_guarded_config(base);

    assert!(!frontier.enable_turn_head_rerank);
    assert!(frontier.enable_turn_engine_selector);
    assert_eq!(frontier.turn_engine_mode, TurnEngineMode::ProV2);
    assert_eq!(frontier.turn_engine_seed_cap, 14);
    assert_eq!(frontier.turn_engine_beam_width, 5);
    assert_eq!(frontier.turn_engine_per_node_family_cap, 4);
    assert_eq!(frontier.turn_engine_step_cap, 6);
    assert_eq!(frontier.turn_engine_opponent_seed_cap, 6);
    assert_eq!(frontier.turn_engine_opponent_beam_width, 2);
    assert_eq!(frontier.turn_engine_reply_seed_cap, 3);
    assert_eq!(frontier.turn_engine_reply_beam_width, 1);
    assert_eq!(frontier.turn_engine_expansion_cap, 176);
    assert!(frontier.turn_engine_enable_spirit_family);
    assert_eq!(frontier.root_reply_risk_reply_limit, 24);
    assert_eq!(frontier.root_reply_risk_node_share_bp, 2_000);
    assert!(frontier.enable_turn_engine_low_budget_guard);
    assert!(frontier.enable_turn_engine_mid_turn_tactical_guard);
    assert!(frontier.enable_turn_engine_late_safe_mana_root_preference);
}

#[test]
fn shared_turn_engine_projection_matches_model_and_harness_helpers() {
    let game = MonsGame::new(false, GameVariant::Classic);
    let config = apply_frontier_pro_v2_guarded_config(
        MonsGameModel::with_game(game)
            .shipping_search_config_for_preference(SmartAutomovePreference::Pro),
    );
    let shared = shared_turn_engine_config_from_search_config(config);
    let model = MonsGameModel::turn_engine_config_from_search_config(config);
    let harness = calibration_turn_engine_config(config);

    assert_turn_engine_configs_match(shared, model);
    assert_turn_engine_configs_match(shared, harness);
}

fn profile_decision_inputs(
    profile_name: &str,
    mode: SmartAutomovePreference,
    game: &MonsGame,
) -> Vec<Input> {
    clear_turn_engine_selector_diagnostics();
    // Retained move-choice fixtures verify search behavior, not scheduler timing. Freeze the
    // cooperative clock here so a busy test runner cannot turn an exact-choice assertion into a
    // deadline-fallback assertion. Deadline/fallback behavior has dedicated real-clock tests and
    // the canonical reliability gate measures every original and cold-replay selector call.
    automove_deadline::with_test_clock(0.0, || profile_runtime_inputs(profile_name, mode, game))
}

fn profile_decision_move_fen(
    profile_name: &str,
    mode: SmartAutomovePreference,
    game: &MonsGame,
) -> String {
    Input::fen_from_array(&profile_decision_inputs(profile_name, mode, game))
}

fn profile_runtime_inputs(
    profile_name: &str,
    mode: SmartAutomovePreference,
    game: &MonsGame,
) -> Vec<Input> {
    let selector = profile_selector_from_name(profile_name)
        .unwrap_or_else(|| panic!("profile '{}' not found", profile_name));
    let config = calibration_runtime_config(profile_name, game, mode);
    select_inputs_with_runtime_fallback(selector, game, config)
}

fn primary_pro_fixture_by_id(id: &str) -> TriageFixture {
    primary_pro_triage_fixtures()
        .into_iter()
        .find(|fixture| fixture.id == id)
        .unwrap_or_else(|| panic!("primary_pro fixture '{}' not found", id))
}

fn profile_scored_roots(
    profile_name: &str,
    mode: SmartAutomovePreference,
    game: &MonsGame,
) -> (AutomoveSearchConfig, Vec<RootEvaluation>) {
    let config = calibration_runtime_config(profile_name, game, mode);
    (config, scored_roots_for_runtime_config(game, config))
}

fn scored_roots_for_runtime_config(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Vec<RootEvaluation> {
    let perspective = game.active_color;
    let root_moves = MonsGameModel::ranked_root_moves(game, perspective, config);
    let (root_moves, scout_visited_nodes) =
        MonsGameModel::focused_root_candidates(game, perspective, root_moves, config, true);
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
        scored_roots.push(RootEvaluation {
            root_rank: candidate.root_rank,
            score: candidate_score,
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
        });
    }

    scored_roots
}

fn format_root_probe(root: Option<&RootEvaluation>) -> String {
    root.map(|root| {
        format!(
            "score={} rank={} family={:?} win={} attack={} window={} same_turn_setup={} own_setup={} spirit={} supermana_progress={} super_steps={} opponent_progress={} opp_steps={} score_path_steps={} setup_gain={} pickup_super={} pickup_opp={} vulnerable={} handoff={} roundtrip={}",
            root.score,
            root.root_rank,
            MonsGameModel::turn_engine_root_evaluation_family(root),
            root.wins_immediately,
            root.attacks_opponent_drainer,
            root.same_turn_score_window_value,
            root.spirit_same_turn_score_setup_now,
            root.spirit_own_mana_setup_now,
            root.spirit_development,
            root.supermana_progress,
            root.safe_supermana_progress_steps,
            root.opponent_mana_progress,
            root.safe_opponent_mana_progress_steps,
            root.score_path_best_steps,
            root.spirit_setup_gain,
            root.safe_supermana_pickup_now,
            root.safe_opponent_mana_pickup_now,
            root.own_drainer_vulnerable,
            root.mana_handoff_to_opponent,
            root.has_roundtrip,
        )
    })
    .unwrap_or_else(|| "none".to_string())
}

fn format_root_advisor_entry_probe(
    entry: &crate::models::mons_game_model::ProV2RootAdvisorEntry,
) -> String {
    format!(
        "{}:{:?}:{:?}:rank{}",
        Input::fen_from_array(&entry.inputs),
        entry.family,
        entry.reason,
        entry.root_rank,
    )
}

fn format_normal_safety_probe(snapshot: Option<NormalRootSafetySnapshot>) -> String {
    snapshot
        .map(|snapshot| {
            format!(
                "imm_loss={} match_point={} opp_gain={} my_gain={} worst_reply={}",
                snapshot.allows_immediate_opponent_win,
                snapshot.opponent_reaches_match_point,
                snapshot.opponent_max_score_gain,
                snapshot.my_score_gain,
                snapshot.worst_reply_score,
            )
        })
        .unwrap_or_else(|| "none".to_string())
}

fn format_turn_engine_utility_probe(utility: TurnEngineUtility) -> String {
    format!("{:?}", utility)
}

fn format_ordering_probe(ordering: std::cmp::Ordering) -> &'static str {
    match ordering {
        std::cmp::Ordering::Less => "less",
        std::cmp::Ordering::Equal => "equal",
        std::cmp::Ordering::Greater => "greater",
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct RuntimeDecisionProbe {
    selected_input_fen: String,
    selected_rank: Option<usize>,
    pre_accept_input_fen: String,
    pre_accept_rank: Option<usize>,
    legacy_selected_input_fen: String,
    legacy_full_pool_selected_input_fen: String,
    top_root_fens: Vec<String>,
    selector_last_stage: &'static str,
    selector_top_level_last_stage: &'static str,
    selector_head_calls: usize,
    selector_head_hits: usize,
    selector_disable_reason: &'static str,
    selector_top_level_disable_reason: &'static str,
    runtime_variant_branch: &'static str,
    profile_turn_engine_selector: bool,
    profile_turn_head_rerank: bool,
    low_budget_guard_live: bool,
    skip_low_budget_state: bool,
    mid_turn_progress_guard_live: bool,
    disable_mid_turn_progress_engine: bool,
    mid_turn_tactical_guard_live: bool,
    disable_mid_turn_tactical_engine: bool,
    head_family: Option<TurnPlanFamily>,
    goal_family: Option<TurnPlanFamily>,
    head_input_fen: Option<String>,
    head_rank: Option<usize>,
    pre_accept_family: TurnPlanFamily,
    pre_accept_score: i32,
    head_score: Option<i32>,
    pre_accept_utility: String,
    head_plan_utility: Option<String>,
    head_plan_head_utility: Option<String>,
    head_plan_primary_axes_vs_pre_accept: Option<&'static str>,
    head_accepted: bool,
    exact_context: String,
    selected_root: String,
    head_root: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DuelTraceTurn {
    ply: usize,
    board_fen: String,
    move_fen: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct DuelTraceGame {
    result: MatchResult,
    final_fen: String,
    profile_a_turns: Vec<DuelTraceTurn>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct FirstDivergence {
    ply: usize,
    board_fen: String,
    profile_a_move_fen: String,
    profile_b_move_fen: String,
}

fn runtime_decision_probe(
    profile_name: &str,
    mode: SmartAutomovePreference,
    game: &MonsGame,
) -> RuntimeDecisionProbe {
    clear_exact_state_analysis_cache();
    clear_exact_query_diagnostics();
    clear_turn_engine_plan_cache();
    clear_turn_engine_diagnostics();
    clear_turn_engine_selector_diagnostics();
    clear_frontier_runtime_variant_branch();

    let selected = profile_runtime_inputs(profile_name, mode, game);
    let selected_input_fen = Input::fen_from_array(&selected);
    let selector_diag = turn_engine_selector_diagnostics_snapshot();
    let runtime_variant_branch = frontier_runtime_variant_branch_snapshot();

    clear_exact_state_analysis_cache();
    clear_exact_query_diagnostics();
    clear_turn_engine_plan_cache();
    clear_turn_engine_diagnostics();
    clear_turn_engine_selector_diagnostics();

    let (config, scored_roots, head_plan, _) =
        profile_runtime_scored_roots_with_forced_engine_inputs(profile_name, mode, game);
    let (legacy_selected_input_fen, legacy_full_pool_selected_input_fen, _, _) =
        pro_v2_legacy_selector_probe(game, mode);
    let pre_accept_selected = MonsGameModel::pick_root_move_with_exploration(
        game,
        scored_roots.as_slice(),
        game.active_color,
        config,
    );
    let pre_accept_index = scored_roots
        .iter()
        .position(|root| root.inputs == pre_accept_selected)
        .expect("pre-accept selected root should be present in scored roots");
    let pre_accept_root = &scored_roots[pre_accept_index];
    let pre_accept_input_fen = Input::fen_from_array(&pre_accept_selected);
    let selected_rank = scored_roots.iter().position(|root| root.inputs == selected);
    let pre_accept_rank = Some(pre_accept_index);
    let head_rank = head_plan.as_ref().and_then(|plan| {
        plan.compiled_chunks.first().and_then(|chunk| {
            scored_roots
                .iter()
                .position(|root| root.inputs.as_slice() == chunk.as_slice())
        })
    });
    let pre_accept_family = MonsGameModel::turn_engine_root_evaluation_family(pre_accept_root);
    let pre_accept_utility = MonsGameModel::turn_engine_selected_override_utility(
        game,
        pre_accept_root,
        game.active_color,
        config,
        pre_accept_family,
    );
    let head_score = head_rank
        .and_then(|index| scored_roots.get(index))
        .map(|root| root.score);
    let head_plan_primary_axes_vs_pre_accept = head_plan.as_ref().map(|plan| {
        format_ordering_probe(
            crate::models::automove_turn_engine::compare_utility_primary_axes(
                plan.utility,
                pre_accept_utility,
            ),
        )
    });
    let head_accepted = head_plan.as_ref().is_some_and(|plan| {
        MonsGameModel::accept_turn_engine_head_after_search(
            game,
            game.active_color,
            config,
            scored_roots.as_slice(),
            pre_accept_selected.as_slice(),
            plan,
        )
    });
    let selected_root = format_root_probe(scored_roots.iter().find(|root| root.inputs == selected));
    let head_root = format_root_probe(head_rank.and_then(|index| scored_roots.get(index)));

    RuntimeDecisionProbe {
        selected_input_fen,
        selected_rank,
        pre_accept_input_fen,
        pre_accept_rank,
        legacy_selected_input_fen,
        legacy_full_pool_selected_input_fen,
        top_root_fens: scored_roots
            .iter()
            .take(TRIAGE_TOP_ROOT_DIGEST_SIZE)
            .map(|root| Input::fen_from_array(&root.inputs))
            .collect(),
        selector_last_stage: selector_diag.last_return_stage,
        selector_top_level_last_stage: selector_diag.top_level_last_return_stage,
        selector_head_calls: selector_diag.head_plan_calls,
        selector_head_hits: selector_diag.head_plan_hits,
        selector_disable_reason: selector_diag.selector_disable_reason,
        selector_top_level_disable_reason: selector_diag.top_level_selector_disable_reason,
        runtime_variant_branch,
        profile_turn_engine_selector: config.enable_turn_engine_selector,
        profile_turn_head_rerank: config.enable_turn_head_rerank,
        low_budget_guard_live: MonsGameModel::pro_v2_low_budget_guard_live(config),
        skip_low_budget_state: MonsGameModel::should_skip_pro_v2_low_budget_state(game),
        mid_turn_progress_guard_live: MonsGameModel::pro_v2_mid_turn_progress_guard_live(config),
        disable_mid_turn_progress_engine:
            MonsGameModel::should_disable_pro_v2_mid_turn_progress_engine(game),
        mid_turn_tactical_guard_live: MonsGameModel::pro_v2_mid_turn_tactical_guard_live(config),
        disable_mid_turn_tactical_engine:
            MonsGameModel::should_disable_pro_v2_mid_turn_tactical_engine(game),
        head_family: head_plan.as_ref().map(|plan| plan.head_family),
        goal_family: head_plan.as_ref().map(|plan| plan.goal_family),
        head_input_fen: head_plan
            .as_ref()
            .and_then(|plan| plan.compiled_chunks.first())
            .map(|chunk| Input::fen_from_array(chunk)),
        head_rank,
        pre_accept_family,
        pre_accept_score: pre_accept_root.score,
        head_score,
        pre_accept_utility: format_turn_engine_utility_probe(pre_accept_utility),
        head_plan_utility: head_plan
            .as_ref()
            .map(|plan| format_turn_engine_utility_probe(plan.utility)),
        head_plan_head_utility: head_plan
            .as_ref()
            .map(|plan| format_turn_engine_utility_probe(plan.head_utility)),
        head_plan_primary_axes_vs_pre_accept,
        head_accepted,
        exact_context: exact_opportunity_context_probe(game),
        selected_root,
        head_root,
    }
}

fn exact_opportunity_context_probe(game: &MonsGame) -> String {
    let context = crate::models::automove_exact::exact_opportunity_context(game, game.active_color);
    format!(
        "turn={} mons_moves={} can_action={} can_mana={} opp_win={} window={} deny={} attack={} super_steps={:?} opp_steps={:?} drainer_safety={}",
        game.turn_number,
        game.mons_moves_count,
        game.player_can_use_action(),
        game.player_can_move_mana(),
        context.opponent_can_win_immediately,
        context.delta.same_turn_score_window_value,
        context.delta.opponent_window_deny_gain,
        context.delta.drainer_attack_available,
        context.delta.safe_supermana_progress_steps,
        context.delta.safe_opponent_mana_progress_steps,
        context.delta.drainer_safety,
    )
}

fn pro_v2_legacy_selector_probe(
    game: &MonsGame,
    mode: SmartAutomovePreference,
) -> (String, String, Vec<String>, Vec<String>) {
    let (mut config, scored_roots, _, _) = profile_runtime_scored_roots_with_forced_engine_inputs(
        "frontier_pro_v2_guarded",
        mode,
        game,
    );
    let candidate_indices = MonsGameModel::filtered_root_candidate_indices(
        game,
        scored_roots.as_slice(),
        game.active_color,
        config,
    );
    let all_indices = (0..scored_roots.len()).collect::<Vec<_>>();
    config.turn_engine_mode = TurnEngineMode::ProV1;
    let selected_from_candidates =
        MonsGameModel::pick_root_move_with_exploration_from_candidate_indices(
            game,
            scored_roots.as_slice(),
            candidate_indices.as_slice(),
            game.active_color,
            config,
        );
    let selected_from_full_pool =
        MonsGameModel::pick_root_move_with_exploration_from_candidate_indices(
            game,
            scored_roots.as_slice(),
            all_indices.as_slice(),
            game.active_color,
            config,
        );
    (
        Input::fen_from_array(&selected_from_candidates),
        Input::fen_from_array(&selected_from_full_pool),
        candidate_indices
            .iter()
            .map(|index| Input::fen_from_array(&scored_roots[*index].inputs))
            .collect(),
        all_indices
            .iter()
            .map(|index| Input::fen_from_array(&scored_roots[*index].inputs))
            .collect(),
    )
}

fn assert_frontier_pro_v2_guarded_prefers_shipping_root_on_board(
    label: &str,
    fen: &str,
    expected_selected: &str,
) {
    let game = MonsGame::from_fen(fen, false).expect("probe fen should be valid");

    clear_turn_engine_selector_diagnostics();
    let probe = automove_deadline::with_test_clock(0.0, || {
        runtime_decision_probe(
            "frontier_pro_v2_guarded",
            SmartAutomovePreference::Pro,
            &game,
        )
    });
    let advisor = pro_v2_root_advisor_decision_snapshot();
    let (legacy_selected, legacy_full_pool_selected, legacy_candidates, legacy_full_pool) =
        pro_v2_legacy_selector_probe(&game, SmartAutomovePreference::Pro);
    let (_, scored_roots, _, _) = profile_runtime_scored_roots_with_forced_engine_inputs(
        "frontier_pro_v2_guarded",
        SmartAutomovePreference::Pro,
        &game,
    );
    let (_, shipping_scored_roots, _, _) = profile_runtime_scored_roots_with_forced_engine_inputs(
        "shipping_pro_search",
        SmartAutomovePreference::Pro,
        &game,
    );

    let shipping_selected =
        profile_decision_move_fen("shipping_pro_search", SmartAutomovePreference::Pro, &game);
    let shipping_root = format_root_probe(
        shipping_scored_roots
            .iter()
            .find(|root| Input::fen_from_array(&root.inputs) == shipping_selected),
    );
    let frontier_expected_root = format_root_probe(
        scored_roots
            .iter()
            .find(|root| Input::fen_from_array(&root.inputs) == expected_selected),
    );
    let frontier_top_root_details = scored_roots
        .iter()
        .take(8)
        .map(|root| {
            format!(
                "{}:{}",
                Input::fen_from_array(&root.inputs),
                format_root_probe(Some(root))
            )
        })
        .collect::<Vec<_>>();
    let shipping_top_root_details = shipping_scored_roots
        .iter()
        .take(8)
        .map(|root| {
            format!(
                "{}:{}",
                Input::fen_from_array(&root.inputs),
                format_root_probe(Some(root))
            )
        })
        .collect::<Vec<_>>();

    println!(
        "{} shipping_selected={} shipping_root=\"{}\" frontier_expected_root=\"{}\" context={} legacy_selected={} legacy_full_pool_selected={} legacy_candidates={:?} legacy_full_pool={:?} frontier_top_root_details={:?} shipping_top_root_details={:?} probe={:?} advisor={:?}",
        label,
        shipping_selected,
        shipping_root,
        frontier_expected_root,
        exact_opportunity_context_probe(&game),
        legacy_selected,
        legacy_full_pool_selected,
        legacy_candidates,
        legacy_full_pool,
        frontier_top_root_details,
        shipping_top_root_details,
        probe,
        advisor
    );
    assert_eq!(shipping_selected, expected_selected);
    assert_eq!(probe.selected_input_fen, expected_selected);
}

fn profile_duel_turn_inputs(
    game: &MonsGame,
    profile_a: &str,
    profile_b: &str,
    profile_b_mode: SmartAutomovePreference,
    profile_a_is_white: bool,
) -> Result<(bool, Vec<Input>), MatchResult> {
    if let Some(winner_color) = game.winner_color() {
        return Err(match_result_from_winner(winner_color, profile_a_is_white));
    }

    let profile_a_to_move = if profile_a_is_white {
        game.active_color == Color::White
    } else {
        game.active_color == Color::Black
    };
    let (profile_name, mode) = if profile_a_to_move {
        (profile_a, SmartAutomovePreference::Pro)
    } else {
        (profile_b, profile_b_mode)
    };
    Ok((
        profile_a_to_move,
        profile_runtime_inputs(profile_name, mode, game),
    ))
}

fn play_profile_duel_trace(
    profile_a: &str,
    profile_b: &str,
    profile_b_mode: SmartAutomovePreference,
    opening_fen: &str,
    profile_a_is_white: bool,
    max_plies: usize,
) -> DuelTraceGame {
    let mut game = MonsGame::from_fen(opening_fen, false).expect("valid opening fen");
    clear_exact_state_analysis_cache();
    clear_exact_query_diagnostics();
    clear_turn_engine_plan_cache();
    clear_turn_engine_diagnostics();
    clear_turn_engine_selector_diagnostics();

    let mut profile_a_turns = Vec::new();
    for ply in 0..max_plies {
        if let Some(winner_color) = game.winner_color() {
            return DuelTraceGame {
                result: match_result_from_winner(winner_color, profile_a_is_white),
                final_fen: game.fen(),
                profile_a_turns,
            };
        }

        let board_fen = game.fen();
        let (profile_a_to_move, inputs) = match profile_duel_turn_inputs(
            &game,
            profile_a,
            profile_b,
            profile_b_mode,
            profile_a_is_white,
        ) {
            Ok(turn) => turn,
            Err(result) => {
                return DuelTraceGame {
                    result,
                    final_fen: game.fen(),
                    profile_a_turns,
                };
            }
        };
        if profile_a_to_move {
            profile_a_turns.push(DuelTraceTurn {
                ply,
                board_fen,
                move_fen: Input::fen_from_array(&inputs),
            });
        }

        if inputs.is_empty() {
            return DuelTraceGame {
                result: if profile_a_to_move {
                    MatchResult::ProfileBWin
                } else {
                    MatchResult::ProfileAWin
                },
                final_fen: game.fen(),
                profile_a_turns,
            };
        }
        if !matches!(game.process_input(inputs, false, false), Output::Events(_)) {
            return DuelTraceGame {
                result: if profile_a_to_move {
                    MatchResult::ProfileBWin
                } else {
                    MatchResult::ProfileAWin
                },
                final_fen: game.fen(),
                profile_a_turns,
            };
        }
    }

    DuelTraceGame {
        result: match adjudicate_non_terminal_game(&game) {
            Some(winner_color) => match_result_from_winner(winner_color, profile_a_is_white),
            None => MatchResult::Draw,
        },
        final_fen: game.fen(),
        profile_a_turns,
    }
}

fn first_duel_trace_divergence(
    profile_a: &DuelTraceGame,
    profile_b: &DuelTraceGame,
) -> Option<FirstDivergence> {
    profile_a
        .profile_a_turns
        .iter()
        .zip(profile_b.profile_a_turns.iter())
        .find_map(|(profile_a_turn, profile_b_turn)| {
            if profile_a_turn.board_fen == profile_b_turn.board_fen
                && profile_a_turn.move_fen != profile_b_turn.move_fen
            {
                Some(FirstDivergence {
                    ply: profile_a_turn.ply,
                    board_fen: profile_a_turn.board_fen.clone(),
                    profile_a_move_fen: profile_a_turn.move_fen.clone(),
                    profile_b_move_fen: profile_b_turn.move_fen.clone(),
                })
            } else {
                None
            }
        })
}

fn match_result_points(result: MatchResult) -> i32 {
    match result {
        MatchResult::ProfileAWin => 2,
        MatchResult::Draw => 1,
        MatchResult::ProfileBWin => 0,
    }
}

fn format_match_result(result: MatchResult) -> &'static str {
    match result {
        MatchResult::ProfileAWin => "win",
        MatchResult::ProfileBWin => "loss",
        MatchResult::Draw => "draw",
    }
}

fn profile_runtime_scored_roots_with_forced_engine_inputs(
    profile_name: &str,
    mode: SmartAutomovePreference,
    game: &MonsGame,
) -> (
    AutomoveSearchConfig,
    Vec<RootEvaluation>,
    Option<TurnPlan>,
    Option<Vec<Input>>,
) {
    let config = calibration_runtime_config(profile_name, game, mode);
    runtime_scored_roots_with_config(game, config)
}

fn runtime_scored_roots_with_config(
    game: &MonsGame,
    config: AutomoveSearchConfig,
) -> (
    AutomoveSearchConfig,
    Vec<RootEvaluation>,
    Option<TurnPlan>,
    Option<Vec<Input>>,
) {
    let perspective = game.active_color;
    let mut root_moves = MonsGameModel::ranked_root_moves(game, perspective, config);
    let engine_plan = if config.enable_turn_engine_selector {
        turn_engine_candidate_plan(
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
    let forced_engine_inputs = advisor_decision.as_ref().and_then(|decision| {
        decision
            .injected_root
            .as_ref()
            .filter(|root| root.admitted)
            .map(|root| root.inputs.clone())
    });
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
        scored_roots.push(RootEvaluation {
            root_rank: candidate.root_rank,
            score: candidate_score,
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
        });
    }

    (config, scored_roots, engine_plan, forced_engine_inputs)
}

#[derive(Debug, Clone, Copy)]
struct ProReliabilityGateMetrics {
    win_rate: f64,
    confidence: f64,
    frontier_avg_ms: f64,
    frontier_max_ms: f64,
    frontier_invalid_or_empty: usize,
    frontier_nondeterministic: usize,
    frontier_turns: usize,
    shipping_max_ms: f64,
    shipping_invalid_or_empty: usize,
    shipping_nondeterministic: usize,
    shipping_turns: usize,
}

fn pro_reliability_metrics(stats: &TimedMatchupStats) -> ProReliabilityGateMetrics {
    ProReliabilityGateMetrics {
        win_rate: stats.matchup.win_rate_points(),
        confidence: stats.matchup.confidence_better_than_even(),
        frontier_avg_ms: stats.timing.profile_a_avg_ms(),
        frontier_max_ms: stats.timing.profile_a_max_ms,
        frontier_invalid_or_empty: stats.timing.profile_a_invalid_or_empty,
        frontier_nondeterministic: stats.timing.profile_a_nondeterministic,
        frontier_turns: stats.timing.profile_a_turns,
        shipping_max_ms: stats.timing.profile_b_max_ms,
        shipping_invalid_or_empty: stats.timing.profile_b_invalid_or_empty,
        shipping_nondeterministic: stats.timing.profile_b_nondeterministic,
        shipping_turns: stats.timing.profile_b_turns,
    }
}

fn replay_mismatch_rate(mismatches: usize, turns: usize) -> f64 {
    mismatches as f64 / turns.max(1) as f64
}

fn pro_reliability_replay_rate_passes(mismatches: usize, turns: usize) -> bool {
    replay_mismatch_rate(mismatches, turns) <= SMART_PRO_RELIABILITY_REPLAY_MISMATCH_RATE_MAX
}

fn pro_reliability_duel_passes(metrics: ProReliabilityGateMetrics) -> bool {
    metrics.win_rate >= SMART_PRO_RELIABILITY_WIN_RATE_MIN
        && metrics.confidence >= SMART_PRO_RELIABILITY_CONFIDENCE_MIN
        && metrics.frontier_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS
        && metrics.frontier_invalid_or_empty == 0
        && pro_reliability_replay_rate_passes(
            metrics.frontier_nondeterministic,
            metrics.frontier_turns,
        )
        && metrics.shipping_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS
        && metrics.shipping_invalid_or_empty == 0
        && pro_reliability_replay_rate_passes(
            metrics.shipping_nondeterministic,
            metrics.shipping_turns,
        )
}

fn pro_reliability_gate_passes(
    vs_shipping_pro: ProReliabilityGateMetrics,
    vs_shipping_normal: ProReliabilityGateMetrics,
    vs_shipping_fast: ProReliabilityGateMetrics,
) -> bool {
    pro_reliability_duel_passes(vs_shipping_pro)
        && pro_reliability_duel_passes(vs_shipping_normal)
        && pro_reliability_duel_passes(vs_shipping_fast)
}

fn assert_pro_reliability_duel_passes(label: &str, metrics: ProReliabilityGateMetrics) {
    assert!(
        metrics.win_rate >= SMART_PRO_RELIABILITY_WIN_RATE_MIN,
        "{} failed: win_rate {:.4} < {:.2}",
        label,
        metrics.win_rate,
        SMART_PRO_RELIABILITY_WIN_RATE_MIN
    );
    assert!(
        metrics.confidence >= SMART_PRO_RELIABILITY_CONFIDENCE_MIN,
        "{} confidence failed: {:.4} < {:.2}",
        label,
        metrics.confidence,
        SMART_PRO_RELIABILITY_CONFIDENCE_MIN
    );
    assert!(
        metrics.frontier_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS,
        "{} hard move-time failed: frontier_max_ms {:.2}ms > {:.2}ms",
        label,
        metrics.frontier_max_ms,
        SMART_PRO_RELIABILITY_MOVE_MAX_MS
    );
    assert_eq!(
        metrics.frontier_invalid_or_empty, 0,
        "{} frontier produced invalid/empty moves",
        label
    );
    assert!(
        pro_reliability_replay_rate_passes(
            metrics.frontier_nondeterministic,
            metrics.frontier_turns,
        ),
        "{} frontier replay mismatch rate {:.4} ({}/{}) exceeded {:.4}",
        label,
        replay_mismatch_rate(metrics.frontier_nondeterministic, metrics.frontier_turns),
        metrics.frontier_nondeterministic,
        metrics.frontier_turns,
        SMART_PRO_RELIABILITY_REPLAY_MISMATCH_RATE_MAX,
    );
    assert!(
        metrics.shipping_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS,
        "{} shipping hard move-time failed: shipping_max_ms {:.2}ms > {:.2}ms",
        label,
        metrics.shipping_max_ms,
        SMART_PRO_RELIABILITY_MOVE_MAX_MS
    );
    assert_eq!(
        metrics.shipping_invalid_or_empty, 0,
        "{} shipping produced invalid/empty moves",
        label
    );
    assert!(
        pro_reliability_replay_rate_passes(
            metrics.shipping_nondeterministic,
            metrics.shipping_turns,
        ),
        "{} shipping replay mismatch rate {:.4} ({}/{}) exceeded {:.4}",
        label,
        replay_mismatch_rate(metrics.shipping_nondeterministic, metrics.shipping_turns),
        metrics.shipping_nondeterministic,
        metrics.shipping_turns,
        SMART_PRO_RELIABILITY_REPLAY_MISMATCH_RATE_MAX,
    );
}

fn pro_reliability_variant_floor_passes(stats: &TimedMatchupStats) -> bool {
    let per_variant = stats.per_variant_stats();
    !per_variant.is_empty()
        && per_variant
            .iter()
            .filter(|variant_stats| {
                variant_stats.matchup.win_rate_points()
                    < SMART_PRO_RELIABILITY_VARIANT_WIN_RATE_FLOOR
            })
            .count()
            <= SMART_PRO_RELIABILITY_VARIANT_REGRESSION_LIMIT
        && per_variant.iter().all(|variant_stats| {
            variant_stats.timing.profile_a_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS
                && variant_stats.timing.profile_a_invalid_or_empty == 0
                && variant_stats.timing.profile_b_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS
                && variant_stats.timing.profile_b_invalid_or_empty == 0
        })
}

fn assert_pro_reliability_variant_floor_passes(label: &str, stats: &TimedMatchupStats) {
    let mut regressed_variants = Vec::new();
    for variant_stats in stats.per_variant_stats() {
        let win_rate = variant_stats.matchup.win_rate_points();
        let frontier_avg_ms = variant_stats.timing.profile_a_avg_ms();
        let frontier_max_ms = variant_stats.timing.profile_a_max_ms;
        if win_rate < SMART_PRO_RELIABILITY_VARIANT_WIN_RATE_FLOOR {
            regressed_variants.push((automove_variant_label(variant_stats.variant), win_rate));
        }
        assert!(
            frontier_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS,
            "{} variant hard move-time failed for {}: frontier_max_ms {:.2}ms > {:.2}ms (avg {:.2}ms)",
            label,
            automove_variant_label(variant_stats.variant),
            frontier_max_ms,
            SMART_PRO_RELIABILITY_MOVE_MAX_MS,
            frontier_avg_ms,
        );
        assert_eq!(variant_stats.timing.profile_a_invalid_or_empty, 0);
        assert!(
            variant_stats.timing.profile_b_max_ms <= SMART_PRO_RELIABILITY_MOVE_MAX_MS,
            "{} variant shipping hard move-time failed for {}: shipping_max_ms {:.2}ms > {:.2}ms",
            label,
            automove_variant_label(variant_stats.variant),
            variant_stats.timing.profile_b_max_ms,
            SMART_PRO_RELIABILITY_MOVE_MAX_MS,
        );
        assert_eq!(variant_stats.timing.profile_b_invalid_or_empty, 0);
    }
    assert!(
        regressed_variants.len() <= SMART_PRO_RELIABILITY_VARIANT_REGRESSION_LIMIT,
        "{} variant floor failed: {:?} fell below {:.2}; at most {} regressed variant is allowed",
        label,
        regressed_variants,
        SMART_PRO_RELIABILITY_VARIANT_WIN_RATE_FLOOR,
        SMART_PRO_RELIABILITY_VARIANT_REGRESSION_LIMIT,
    );
}

fn print_pro_reliability_stats(
    label: &str,
    frontier_profile: &str,
    shipping_profile: &str,
    stats: &TimedMatchupStats,
) -> ProReliabilityGateMetrics {
    let metrics = pro_reliability_metrics(stats);
    println!(
        "{}: frontier={} shipping={} total_games={} win_rate={:.4} confidence={:.4} frontier_avg_ms={:.2} frontier_max_ms={:.2} shipping_avg_ms={:.2} shipping_max_ms={:.2} frontier_invalid_or_empty={} frontier_nondeterministic={} frontier_replay_mismatch_rate={:.4} shipping_invalid_or_empty={} shipping_nondeterministic={} shipping_replay_mismatch_rate={:.4} frontier_turns={} shipping_turns={}",
        label,
        frontier_profile,
        shipping_profile,
        stats.matchup.total_games(),
        metrics.win_rate,
        metrics.confidence,
        metrics.frontier_avg_ms,
        metrics.frontier_max_ms,
        stats.timing.profile_b_avg_ms(),
        metrics.shipping_max_ms,
        metrics.frontier_invalid_or_empty,
        metrics.frontier_nondeterministic,
        replay_mismatch_rate(metrics.frontier_nondeterministic, metrics.frontier_turns),
        metrics.shipping_invalid_or_empty,
        metrics.shipping_nondeterministic,
        replay_mismatch_rate(metrics.shipping_nondeterministic, metrics.shipping_turns),
        stats.timing.profile_a_turns,
        stats.timing.profile_b_turns
    );
    for variant_stats in stats.per_variant_stats() {
        println!(
            "{} variant={} total_games={} win_rate={:.4} confidence={:.4} frontier_avg_ms={:.2} frontier_max_ms={:.2} shipping_avg_ms={:.2} shipping_max_ms={:.2} frontier_invalid_or_empty={} frontier_nondeterministic={} shipping_invalid_or_empty={} shipping_nondeterministic={} frontier_turns={} shipping_turns={}",
            label,
            automove_variant_label(variant_stats.variant),
            variant_stats.matchup.total_games(),
            variant_stats.matchup.win_rate_points(),
            variant_stats.matchup.confidence_better_than_even(),
            variant_stats.timing.profile_a_avg_ms(),
            variant_stats.timing.profile_a_max_ms,
            variant_stats.timing.profile_b_avg_ms(),
            variant_stats.timing.profile_b_max_ms,
            variant_stats.timing.profile_a_invalid_or_empty,
            variant_stats.timing.profile_a_nondeterministic,
            variant_stats.timing.profile_b_invalid_or_empty,
            variant_stats.timing.profile_b_nondeterministic,
            variant_stats.timing.profile_a_turns,
            variant_stats.timing.profile_b_turns
        );
    }
    metrics
}

fn pro_signal_triage_passes(
    frontier_profile_name: &str,
    shipping_profile_name: &str,
    target_changed: usize,
    off_target_changed: usize,
) -> bool {
    if target_changed > 0 {
        return off_target_changed <= 1;
    }

    matches!(
        frontier_profile_name,
        "frontier_pro_v2_guarded" | "frontier_pro_v10_bounded_tactical"
    ) && shipping_profile_name == "shipping_pro_search"
        && target_changed == 0
}

const TRIAGE_TOP_ROOT_DIGEST_SIZE: usize = 5;

fn maybe_run_runtime_preflight_checks(
    skip_runtime_preflight: bool,
    run_stage1: impl FnOnce(),
    run_exact: impl FnOnce(),
) {
    if skip_runtime_preflight {
        return;
    }
    run_stage1();
    run_exact();
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ProTriageSnapshot {
    selected_rank: usize,
    selected_input_fen: String,
    top_root_fens: Vec<String>,
}

fn pro_triage_fixture_snapshot(
    profile_name: &str,
    selector: AutomoveSelector,
    fixture: &TriageFixture,
) -> ProTriageSnapshot {
    let base_config = fixture
        .config_tweak
        .map(|tweak| {
            tweak(
                SearchBudget::from_preference(fixture.mode).runtime_config_for_game(&fixture.game),
            )
        })
        .unwrap_or_else(|| {
            SearchBudget::from_preference(fixture.mode).runtime_config_for_game(&fixture.game)
        });
    let resolved_config = profile_runtime_config_for_name(profile_name, &fixture.game, base_config)
        .unwrap_or(base_config);
    let inputs = select_inputs_with_runtime_fallback(selector, &fixture.game, base_config);
    assert!(
        !inputs.is_empty(),
        "triage fixture '{}' produced no legal move for mode {}",
        fixture.id,
        fixture.mode.as_api_value()
    );
    MonsGameModel::apply_inputs_for_search_with_events(&fixture.game, &inputs).unwrap_or_else(
        || {
            panic!(
                "triage fixture '{}' selected illegal move in mode {}",
                fixture.id,
                fixture.mode.as_api_value()
            )
        },
    );
    let input_fen = Input::fen_from_array(&inputs);
    let ranked_roots =
        MonsGameModel::ranked_root_moves(&fixture.game, fixture.game.active_color, resolved_config);
    let selected_rank = ranked_roots
        .iter()
        .position(|root| Input::fen_from_array(&root.inputs) == input_fen)
        .unwrap_or(ranked_roots.len());

    ProTriageSnapshot {
        selected_rank,
        selected_input_fen: input_fen,
        top_root_fens: ranked_roots
            .iter()
            .take(TRIAGE_TOP_ROOT_DIGEST_SIZE)
            .map(|root| Input::fen_from_array(&root.inputs))
            .collect(),
    }
}

fn pro_triage_surface_signal_changed(
    candidate: &ProTriageSnapshot,
    baseline: &ProTriageSnapshot,
) -> bool {
    candidate.selected_input_fen != baseline.selected_input_fen
        || candidate.selected_rank != baseline.selected_rank
        || candidate.top_root_fens != baseline.top_root_fens
}

fn pro_triage_fixture_changed(
    surface: TriageSurface,
    fixture: &TriageFixture,
    candidate: &ProTriageSnapshot,
    baseline: &ProTriageSnapshot,
) -> bool {
    match surface {
        TriageSurface::PrimaryPro => {
            if let Some(expected) = fixture.expected_selected_input_fen {
                candidate.selected_input_fen == expected && baseline.selected_input_fen != expected
            } else {
                pro_triage_surface_signal_changed(candidate, baseline)
            }
        }
    }
}

fn compare_pro_triage_fixture_pack(
    surface: TriageSurface,
    frontier_profile: &str,
    frontier_selector: AutomoveSelector,
    shipping_profile: &str,
    shipping_selector: AutomoveSelector,
    fixtures: &[TriageFixture],
) -> usize {
    let mut changed = 0;
    for fixture in fixtures {
        let frontier_snapshot =
            pro_triage_fixture_snapshot(frontier_profile, frontier_selector, fixture);
        let shipping_snapshot =
            pro_triage_fixture_snapshot(shipping_profile, shipping_selector, fixture);
        let fixture_changed =
            pro_triage_fixture_changed(surface, fixture, &frontier_snapshot, &shipping_snapshot);
        if fixture_changed {
            changed += 1;
        }
        println!(
            "pro triage surface={} fixture={} mode={} expected={:?} changed={} frontier_profile={} frontier={:?} shipping_profile={} shipping={:?}",
            surface.as_str(),
            fixture.id,
            fixture.mode.as_api_value(),
            fixture.expected_selected_input_fen,
            fixture_changed,
            frontier_profile,
            frontier_snapshot,
            shipping_profile,
            shipping_snapshot
        );
    }
    println!(
        "pro triage surface={} summary frontier={} shipping={} changed={}/{}",
        surface.as_str(),
        frontier_profile,
        shipping_profile,
        changed,
        fixtures.len()
    );
    changed
}

fn exact_lite_cache_totals() -> (usize, usize) {
    let diagnostics = exact_query_diagnostics_snapshot();
    let calls = diagnostics.exact_spirit_summary_calls as usize
        + diagnostics.tactical_spirit_summary_calls as usize
        + diagnostics.exact_followup_summary_calls as usize
        + diagnostics.exact_secure_mana_calls as usize
        + diagnostics.pickup_path_calls as usize;
    let hits = diagnostics.exact_spirit_summary_cache_hits as usize
        + diagnostics.tactical_spirit_summary_cache_hits as usize
        + diagnostics.exact_followup_summary_cache_hits as usize
        + diagnostics.exact_secure_mana_cache_hits as usize
        + diagnostics.pickup_path_cache_hits as usize;
    (calls, hits)
}

fn assert_exact_lite_diagnostics_gate_if_enabled(
    frontier_profile_name: &str,
    frontier_selector: AutomoveSelector,
) {
    let budgets = stage1_cpu_budgets(frontier_profile_name);
    let positions = env_usize("SMART_EXACT_LITE_DIAGNOSTIC_POSITIONS")
        .unwrap_or(8)
        .max(1);
    let exact_lite_seed = seed_for_pairing("exact_lite_diag", frontier_profile_name);
    let openings = generate_opening_fens_cached(exact_lite_seed, positions);
    let cache_repeats = env_usize("SMART_EXACT_LITE_CACHE_REPEATS")
        .unwrap_or(2)
        .max(2);
    let min_cache_calls = env_usize("SMART_EXACT_LITE_CACHE_MIN_CALLS")
        .unwrap_or(12)
        .max(1);
    let min_cache_hit_rate = env_f64("SMART_EXACT_LITE_CACHE_HIT_RATE_MIN")
        .unwrap_or(SMART_EXACT_LITE_CACHE_HIT_RATE_MIN)
        .clamp(0.0, 1.0);

    let mut any_exact_lite_budget = false;
    let variant_plan = automove_variant_plan_for_openings(exact_lite_seed, positions);
    println!(
        "exact-lite variants frontier={} policy={} sample_size={} variants={}",
        frontier_profile_name,
        variant_plan.policy.as_str(),
        variant_plan.variants.len(),
        variant_plan.variant_label_csv()
    );
    for budget in budgets.iter().copied() {
        for opening in openings.iter() {
            let game = MonsGame::from_fen(opening, false).expect("valid opening fen");
            let config = budget.runtime_config_for_game(&game);
            let Some(limits) = profile_exact_lite_budgets(frontier_profile_name, &game, config)
            else {
                continue;
            };
            any_exact_lite_budget = true;
            clear_exact_state_analysis_cache();
            clear_exact_query_diagnostics();
            let _ = select_inputs_with_runtime_fallback(frontier_selector, &game, config);
            let diagnostics = exact_query_diagnostics_snapshot();
            let root_calls = diagnostics.exact_turn_summary_builds as usize;
            let static_calls = (diagnostics.passive_strategic_summary_builds as usize).div_ceil(2);

            assert!(
                root_calls <= limits.root_call_budget,
                "exact-lite root budget exceeded for profile={} mode={} opening={} calls={} budget={}",
                frontier_profile_name,
                budget.key(),
                opening,
                root_calls,
                limits.root_call_budget
            );
            assert!(
                static_calls <= limits.static_call_budget,
                "exact-lite static budget exceeded for profile={} mode={} opening={} calls={} budget={}",
                frontier_profile_name,
                budget.key(),
                opening,
                static_calls,
                limits.static_call_budget
            );
        }
    }

    if !any_exact_lite_budget {
        return;
    }

    for budget in budgets.iter().copied() {
        clear_exact_state_analysis_cache();
        clear_exact_query_diagnostics();
        let mut budget_uses_exact_lite = false;
        for _ in 0..cache_repeats {
            for opening in openings.iter() {
                let game = MonsGame::from_fen(opening, false).expect("valid opening fen");
                let config = budget.runtime_config_for_game(&game);
                if profile_exact_lite_budgets(frontier_profile_name, &game, config).is_none() {
                    continue;
                }
                budget_uses_exact_lite = true;
                let _ = select_inputs_with_runtime_fallback(frontier_selector, &game, config);
            }
        }

        if !budget_uses_exact_lite {
            continue;
        }
        let (cache_calls, cache_hits) = exact_lite_cache_totals();
        if cache_calls < min_cache_calls {
            continue;
        }
        let cache_hit_rate = cache_hits as f64 / cache_calls as f64;
        assert!(
            cache_hit_rate >= min_cache_hit_rate,
            "exact-lite cache-hit gate failed for profile={} mode={} rate={:.3} < {:.3} (hits={}, calls={})",
            frontier_profile_name,
            budget.key(),
            cache_hit_rate,
            min_cache_hit_rate,
            cache_hits,
            cache_calls
        );
    }
    clear_exact_state_analysis_cache();
    clear_exact_query_diagnostics();
}

fn stage1_cpu_is_advisory(frontier_profile_name: &str) -> bool {
    frontier_profile_name.starts_with("frontier_pro_")
        && env_bool("SMART_STAGE1_CPU_ADVISORY").unwrap_or(true)
}

fn assert_stage1_cpu_non_regression(
    frontier_profile_name: &str,
    frontier_selector: AutomoveSelector,
) {
    let advisory_only = stage1_cpu_is_advisory(frontier_profile_name);
    let shipping_selector = profile_selector_from_name("shipping_pro_search")
        .expect("shipping_pro_search selector should exist for stage-1 cpu gate");
    let budgets = stage1_cpu_budgets(frontier_profile_name);
    let repeats = stage1_cpu_measurement_repeats();
    let speed_positions = env_usize("SMART_STAGE1_SPEED_POSITIONS")
        .unwrap_or(16)
        .max(12);

    for seed_tag in stage1_seed_tags() {
        let speed_seed = seed_for_pairing(
            "stage1_cpu_gate",
            format!("{}:{}", frontier_profile_name, seed_tag).as_str(),
        );
        let variant_plan = automove_variant_plan_for_openings(speed_seed, speed_positions);
        println!(
            "stage-1 cpu variants seed={} frontier={} policy={} sample_size={} variants={}",
            seed_tag,
            frontier_profile_name,
            variant_plan.policy.as_str(),
            variant_plan.variants.len(),
            variant_plan.variant_label_csv()
        );
        let speed_openings = generate_opening_fens_cached(speed_seed, speed_positions);
        let mut ratio_samples = std::collections::HashMap::<&'static str, Vec<f64>>::new();

        for _ in 0..repeats {
            let shipping_speed = profile_speed_by_mode_ms(
                shipping_selector,
                speed_openings.as_slice(),
                budgets.as_slice(),
            );
            let frontier_speed = profile_speed_by_mode_ms(
                frontier_selector,
                speed_openings.as_slice(),
                budgets.as_slice(),
            );
            let shipping_map = shipping_speed
                .iter()
                .map(|stat| (stat.budget.key(), stat.avg_ms))
                .collect::<std::collections::HashMap<_, _>>();

            for stat in frontier_speed {
                let shipping_ms = shipping_map
                    .get(stat.budget.key())
                    .copied()
                    .unwrap_or(1.0)
                    .max(0.001);
                let ratio = stat.avg_ms / shipping_ms;
                ratio_samples
                    .entry(stat.budget.key())
                    .or_default()
                    .push(ratio);
            }
        }

        for budget in &budgets {
            let mode = budget.key();
            let mut samples = ratio_samples.remove(mode).unwrap_or_default();
            assert_eq!(
                samples.len(),
                repeats,
                "stage-1 cpu gate expected {} samples for mode {}",
                repeats,
                mode
            );
            let ratio = median_f64(samples.as_mut_slice());
            let ratio_limit = stage1_cpu_ratio_limit(mode);
            println!(
                "stage-1 cpu seed={} mode={} frontier={} shipping=shipping_pro_search ratio={:.3} limit={:.3} samples={:?}",
                seed_tag, mode, frontier_profile_name, ratio, ratio_limit, samples
            );
            if advisory_only && ratio > ratio_limit {
                println!(
                    "stage-1 cpu advisory: seed={} mode={} frontier={} ratio={:.3} > {:.3}; continuing because stage-1 CPU is advisory for frontier Pro profiles",
                    seed_tag,
                    mode,
                    frontier_profile_name,
                    ratio,
                    ratio_limit
                );
            } else {
                assert!(
                    ratio <= ratio_limit,
                    "stage-1 cpu gate failed for seed={} mode={} frontier={} shipping=shipping_pro_search median_ratio={:.3} > {:.3} samples={:?}",
                    seed_tag,
                    mode,
                    frontier_profile_name,
                    ratio,
                    ratio_limit,
                    samples
                );
            }
        }
    }
}

fn assert_runtime_preflight_if_required(
    frontier_profile_name: &str,
    frontier_selector: AutomoveSelector,
) {
    let skip_runtime_preflight = env_bool("SMART_SKIP_RUNTIME_PREFLIGHT").unwrap_or(false);
    if skip_runtime_preflight {
        println!(
            "runtime preflight skipped for duel stage frontier={}",
            frontier_profile_name
        );
    }
    maybe_run_runtime_preflight_checks(
        skip_runtime_preflight,
        || assert_stage1_cpu_non_regression(frontier_profile_name, frontier_selector),
        || assert_exact_lite_diagnostics_gate_if_enabled(frontier_profile_name, frontier_selector),
    );
}

mod diagnostics;
mod gates;
mod retained;
