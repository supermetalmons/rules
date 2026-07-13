#![cfg(any(target_arch = "wasm32", test))]

use crate::models::automove_deadline::{cache_write_allowed, cancelled, checkpoint};
#[cfg(test)]
use crate::models::scoring::DEFAULT_SCORING_WEIGHTS;
use crate::models::scoring::{
    evaluate_preferability_with_weights_and_exact_policy, ScoringWeights,
};
use crate::*;
use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

const TURN_ENGINE_CACHE_MAX_ENTRIES: usize = 4096;
const TURN_ENGINE_COMPILE_LIMIT_MAX: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum TurnEngineMode {
    ProV1,
    CurrentPro,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct TurnEngineConfig {
    pub mode: TurnEngineMode,
    pub own_seed_cap: usize,
    pub own_beam: usize,
    pub per_node_family_cap: usize,
    pub step_cap: usize,
    pub opponent_seed_cap: usize,
    pub opponent_beam: usize,
    pub reply_seed_cap: usize,
    pub reply_beam: usize,
    pub expansion_cap: usize,
    pub enable_spirit_family: bool,
    pub scoring_weights: &'static ScoringWeights,
    pub enable_lazy_oracle_score_window_projection: bool,
}

#[derive(Debug, Clone)]
pub(crate) struct TurnSnapshot {
    pub state_hash: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum TurnAction {
    Walk {
        actor: Location,
        to: Location,
    },
    Attack {
        actor: Location,
        target: Location,
    },
    SpiritShift {
        actor: Location,
        target: Location,
        destination: Location,
    },
    Bomb {
        actor: Location,
        target: Location,
    },
    MoveMana {
        from: Location,
        to: Location,
    },
    ScoreCarry {
        actor: Location,
        wanted: Mana,
        step: Location,
    },
    SafetyRetreat {
        actor: Location,
        to: Location,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) enum TurnPlanFamily {
    ImmediateScore,
    DenyOpponentWindow,
    DrainerKill,
    SafeSupermanaProgress,
    SafeOpponentManaProgress,
    DrainerSafetyRecovery,
    SpiritImpact,
    ManaTempo,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct TurnEngineUtility {
    win_state: i32,
    avoid_immediate_loss: i32,
    score_delta: i32,
    deny_gain: i32,
    drainer_attack: i32,
    drainer_safety: i32,
    eval_score: i32,
}

impl Ord for TurnEngineUtility {
    fn cmp(&self, other: &Self) -> Ordering {
        (
            self.win_state,
            self.avoid_immediate_loss,
            self.score_delta,
            self.deny_gain,
            self.drainer_attack,
            self.drainer_safety,
            self.eval_score,
        )
            .cmp(&(
                other.win_state,
                other.avoid_immediate_loss,
                other.score_delta,
                other.deny_gain,
                other.drainer_attack,
                other.drainer_safety,
                other.eval_score,
            ))
    }
}

impl PartialOrd for TurnEngineUtility {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl TurnEngineUtility {
    pub(crate) fn has_nonnegative_deny_gain(self) -> bool {
        self.deny_gain >= 0
    }

    pub(crate) fn supports_temporary_risk_recovery(self) -> bool {
        self.drainer_safety > 0 || self.avoid_immediate_loss > 0
    }

    pub(crate) fn strictly_dominates_override_axes(self, other: Self) -> bool {
        let not_worse = self.win_state >= other.win_state
            && self.avoid_immediate_loss >= other.avoid_immediate_loss
            && self.score_delta >= other.score_delta
            && self.deny_gain >= other.deny_gain
            && self.drainer_attack >= other.drainer_attack
            && self.drainer_safety >= other.drainer_safety;
        let strictly_better = self.win_state > other.win_state
            || self.avoid_immediate_loss > other.avoid_immediate_loss
            || self.score_delta > other.score_delta
            || self.deny_gain > other.deny_gain
            || self.drainer_attack > other.drainer_attack
            || self.drainer_safety > other.drainer_safety;
        not_worse && strictly_better
    }

    pub(crate) fn passes_override_guard(self, other: Self) -> bool {
        const OVERRIDE_EVAL_DROP_MAX: i32 = 192;
        const OVERRIDE_SCORE_DELTA_FORCE: i32 = 220;

        if !self.strictly_dominates_override_axes(other) {
            return false;
        }

        let strategic_axis_gain = self.win_state > other.win_state
            || self.avoid_immediate_loss > other.avoid_immediate_loss
            || self.deny_gain > other.deny_gain
            || self.drainer_attack > other.drainer_attack
            || self.drainer_safety > other.drainer_safety;
        let score_delta_force = self.score_delta >= other.score_delta + OVERRIDE_SCORE_DELTA_FORCE;

        self.eval_score + OVERRIDE_EVAL_DROP_MAX >= other.eval_score
            || strategic_axis_gain
            || score_delta_force
    }

    pub(crate) fn supports_family_fallback(self, other: Self) -> bool {
        const FAMILY_FALLBACK_EVAL_DROP_MAX: i32 = 192;
        self >= other && self.eval_score + FAMILY_FALLBACK_EVAL_DROP_MAX >= other.eval_score
    }

    pub(crate) fn improves_non_score_override_axes(self, other: Self) -> bool {
        self.win_state > other.win_state
            || self.avoid_immediate_loss > other.avoid_immediate_loss
            || self.deny_gain > other.deny_gain
            || self.drainer_attack > other.drainer_attack
            || self.drainer_safety > other.drainer_safety
    }

    pub(crate) fn has_score_delta_force(self, other: Self, min_gain: i32) -> bool {
        self.score_delta >= other.score_delta + min_gain
    }

    pub(crate) fn supports_primary_axes_eval_tolerance(
        self,
        other: Self,
        eval_drop_max: i32,
    ) -> bool {
        compare_utility_primary_axes(self, other) != Ordering::Less
            && self.eval_score + eval_drop_max >= other.eval_score
    }
}

#[cfg(test)]
impl TurnEngineUtility {
    pub(crate) fn from_eval_score_for_test(eval_score: i32) -> Self {
        Self {
            win_state: 0,
            avoid_immediate_loss: 0,
            score_delta: 0,
            deny_gain: 0,
            drainer_attack: 0,
            drainer_safety: 0,
            eval_score,
        }
    }

    pub(crate) fn from_components_for_test(
        win_state: i32,
        avoid_immediate_loss: i32,
        score_delta: i32,
        deny_gain: i32,
        drainer_attack: i32,
        drainer_safety: i32,
        eval_score: i32,
    ) -> Self {
        Self {
            win_state,
            avoid_immediate_loss,
            score_delta,
            deny_gain,
            drainer_attack,
            drainer_safety,
            eval_score,
        }
    }
}

#[derive(Debug, Clone)]
pub(crate) struct TurnPlan {
    pub actions: Vec<TurnAction>,
    pub compiled_chunks: Vec<Vec<Input>>,
    pub end_game: MonsGame,
    #[cfg(test)]
    pub end_snapshot: TurnSnapshot,
    pub utility: TurnEngineUtility,
    pub head_utility: TurnEngineUtility,
    pub head_family: TurnPlanFamily,
    pub goal_family: TurnPlanFamily,
    pub package_meta: TurnPackageMeta,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) struct TurnPackageMeta {
    pub score_gain: i32,
    pub deny_gain: i32,
    pub drainer_safety_delta: i32,
    pub spirit_only_setup: bool,
    pub ends_nonnegative_drainer_safety: bool,
    pub opponent_immediate_window_after: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct TurnEngineContinuationCacheKey {
    state_hash: u64,
    mode: TurnEngineMode,
    config_fingerprint: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct TurnEnginePlanCacheKey {
    state_hash: u64,
    mode: TurnEngineMode,
    config_fingerprint: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct TurnOracleCacheKey {
    state_hash: u64,
    perspective: Color,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct TurnEngineUtilityCacheKey {
    state_hash: u64,
    start_hash: u64,
    perspective: Color,
    config_fingerprint: u64,
}

#[derive(Debug, Clone, Copy, Default)]
struct TurnOracleContext {
    opportunity: ExactOpportunityContext,
    strategic: ExactColorSummary,
    opponent_immediate_window: i32,
}

#[derive(Debug, Clone)]
struct ActionSeed {
    family: TurnPlanFamily,
    action: TurnAction,
    priority: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum TurnEngineProjectionProfile {
    SafeProgressOnly,
    OpponentProgressOnly,
    DrainerOpportunity,
    SpiritScoreOnly,
    SpiritOpportunity,
    SelectorWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct TurnEngineProjectionMemoKey {
    state_hash: u64,
    color: Color,
    profile: TurnEngineProjectionProfile,
}

#[derive(Default)]
struct TurnEngineProjectionMemo {
    entries: HashMap<TurnEngineProjectionMemoKey, ExactTurnTacticalProjection>,
}

impl TurnEngineProjectionMemo {
    fn projection(
        &mut self,
        game: &MonsGame,
        color: Color,
        state_hash: u64,
        profile: TurnEngineProjectionProfile,
    ) -> ExactTurnTacticalProjection {
        if checkpoint() {
            return ExactTurnTacticalProjection::default();
        }
        let key = TurnEngineProjectionMemoKey {
            state_hash,
            color,
            profile,
        };
        if let Some(cached) = self.entries.get(&key).copied() {
            return cached;
        }
        let projection = exact_turn_tactical_projection_with_search_hash(
            game,
            color,
            state_hash,
            tactical_projection_profile_flags(profile),
        );
        if cache_write_allowed() {
            self.entries.insert(key, projection);
        }
        projection
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub(crate) enum OpportunityKind {
    ImmediateScore,
    TacticalDeny,
    DrainerKill,
    SafeSupermanaProgress,
    SafeOpponentManaProgress,
    DrainerSafetyRecovery,
    SpiritImpact,
    ManaTempo,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash)]
pub(crate) struct OpportunityBudget {
    pub mon_moves_needed: i32,
    pub needs_action: bool,
    pub needs_mana_move: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct OpportunityDelta {
    pub same_turn_score_window_gain: i32,
    pub spirit_gain: i32,
    pub opponent_window_deny_gain: i32,
    pub drainer_attack: bool,
    pub drainer_safety_delta: i32,
    pub supermana_progress_gain: i32,
    pub opponent_mana_progress_gain: i32,
}

#[derive(Debug, Clone)]
pub(crate) struct TurnOpportunity {
    pub kind: OpportunityKind,
    pub family: TurnPlanFamily,
    pub action: TurnAction,
    pub priority: i32,
    pub budget: OpportunityBudget,
    pub delta: OpportunityDelta,
}

#[derive(Debug, Clone)]
struct MacroOpportunity {
    head_family: TurnPlanFamily,
    goal_family: TurnPlanFamily,
    priority: i32,
    delta: OpportunityDelta,
    actions: Vec<TurnAction>,
    compiled_chunks: Vec<Vec<Input>>,
    end_game: MonsGame,
    end_snapshot: TurnSnapshot,
    head_utility: TurnEngineUtility,
    signature: u64,
}

#[derive(Debug, Clone)]
struct PlanNode {
    game: MonsGame,
    actions: Vec<TurnAction>,
    compiled_chunks: Vec<Vec<Input>>,
    head_utility: TurnEngineUtility,
    head_family: TurnPlanFamily,
    goal_family: TurnPlanFamily,
}

#[derive(Debug, Clone)]
struct MacroPlanNode {
    game: MonsGame,
    actions: Vec<TurnAction>,
    compiled_chunks: Vec<Vec<Input>>,
    head_utility: TurnEngineUtility,
    head_family: TurnPlanFamily,
    goal_family: TurnPlanFamily,
    signature: u64,
}

#[derive(Clone)]
struct TransitionCompilePool {
    transitions: Vec<LegalInputTransition>,
    limit: usize,
    priority_locations: Vec<Location>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PlanBuildStatus {
    NoPlan,
    BudgetExceeded,
}

thread_local! {
    static TURN_ENGINE_CONTINUATION_CACHE: RefCell<HashMap<TurnEngineContinuationCacheKey, Vec<Input>>> =
        RefCell::new(HashMap::new());
    static TURN_ENGINE_ORACLE_CACHE: RefCell<HashMap<TurnOracleCacheKey, TurnOracleContext>> =
        RefCell::new(HashMap::new());
    static TURN_ENGINE_UTILITY_CACHE: RefCell<HashMap<TurnEngineUtilityCacheKey, TurnEngineUtility>> =
        RefCell::new(HashMap::new());
    static TURN_ENGINE_BEST_PLAN_CACHE: RefCell<HashMap<TurnEnginePlanCacheKey, TurnPlan>> =
        RefCell::new(HashMap::new());
    static TURN_ENGINE_NO_PLAN_CACHE: RefCell<HashSet<TurnEnginePlanCacheKey>> =
        RefCell::new(HashSet::new());
}

#[cfg(any(target_arch = "wasm32", test))]
pub(crate) fn clear_turn_engine_plan_cache() {
    TURN_ENGINE_CONTINUATION_CACHE.with(|cache| cache.borrow_mut().clear());
    TURN_ENGINE_ORACLE_CACHE.with(|cache| cache.borrow_mut().clear());
    TURN_ENGINE_UTILITY_CACHE.with(|cache| cache.borrow_mut().clear());
    TURN_ENGINE_BEST_PLAN_CACHE.with(|cache| cache.borrow_mut().clear());
    TURN_ENGINE_NO_PLAN_CACHE.with(|cache| cache.borrow_mut().clear());
}

impl TurnSnapshot {
    pub(crate) fn from_game(game: &MonsGame) -> Self {
        Self {
            state_hash: MonsGameModel::search_state_hash(game),
        }
    }
}

#[cfg(test)]
pub(crate) fn turn_engine_next_inputs(
    game: &MonsGame,
    perspective: Color,
    mode: TurnEngineMode,
    config: TurnEngineConfig,
) -> Option<Vec<Input>> {
    if checkpoint() || game.active_color != perspective {
        return None;
    }

    if let Some(cached) = turn_engine_cached_step(game, config) {
        return Some(cached);
    }
    let best_plan = turn_engine_candidate_plan(game, perspective, config)?;
    if checkpoint() {
        return None;
    }

    register_plan_continuations(game, perspective, mode, &best_plan, config);
    if cancelled() {
        return None;
    }
    best_plan.compiled_chunks.first().cloned()
}

pub(crate) fn turn_engine_next_inputs_from_allowed_heads(
    game: &MonsGame,
    perspective: Color,
    mode: TurnEngineMode,
    config: TurnEngineConfig,
    allowed_first_steps: &[Vec<Input>],
) -> Option<Vec<Input>> {
    if checkpoint() || game.active_color != perspective || allowed_first_steps.is_empty() {
        return None;
    }

    let allowed_set = allowed_first_steps
        .iter()
        .cloned()
        .collect::<HashSet<Vec<Input>>>();
    if let Some(cached) = turn_engine_cached_step(game, config) {
        if allowed_set.contains(&cached) {
            return Some(cached);
        }
    }

    let best_plan = turn_engine_candidate_plan_from_allowed_heads(
        game,
        perspective,
        config,
        allowed_first_steps,
    )?;
    if checkpoint() {
        return None;
    }
    register_plan_continuations(game, perspective, mode, &best_plan, config);
    if cancelled() {
        return None;
    }
    best_plan.compiled_chunks.first().cloned()
}

#[cfg(test)]
pub(crate) fn turn_engine_best_plan_for_test(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Option<TurnPlan> {
    turn_engine_candidate_plan_live(game, perspective, config)
}

#[cfg(test)]
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct TurnEnginePlanDigest {
    pub head_inputs_fen: String,
    pub head_family: TurnPlanFamily,
    pub goal_family: TurnPlanFamily,
    pub utility: TurnEngineUtility,
    pub head_utility: TurnEngineUtility,
    pub chunk_count: usize,
}

#[cfg(test)]
pub(crate) fn turn_engine_ranked_plan_digests_for_test(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    limit: usize,
) -> Vec<TurnEnginePlanDigest> {
    ranked_candidate_plans(game, perspective, config)
        .into_iter()
        .take(limit.max(1))
        .filter_map(|plan| {
            let head_chunk = plan.compiled_chunks.first()?;
            Some(TurnEnginePlanDigest {
                head_inputs_fen: Input::fen_from_array(head_chunk.as_slice()),
                head_family: plan.head_family,
                goal_family: plan.goal_family,
                utility: plan.utility,
                head_utility: plan.head_utility,
                chunk_count: plan.compiled_chunks.len(),
            })
        })
        .collect()
}

pub(crate) fn turn_engine_cached_step(
    game: &MonsGame,
    config: TurnEngineConfig,
) -> Option<Vec<Input>> {
    if checkpoint() {
        return None;
    }
    let cached = cached_step_if_legal(game, config);
    if checkpoint() {
        return None;
    }
    cached
}

pub(crate) fn turn_engine_candidate_plan(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Option<TurnPlan> {
    if checkpoint() || game.active_color != perspective {
        return None;
    }
    let no_plan_key = TurnEnginePlanCacheKey {
        state_hash: MonsGameModel::search_state_hash(game),
        mode: config.mode,
        config_fingerprint: turn_engine_config_fingerprint(config),
    };
    if TURN_ENGINE_NO_PLAN_CACHE.with(|cache| cache.borrow().contains(&no_plan_key)) {
        if checkpoint() {
            return None;
        }
        return None;
    }
    if let Some(plan) = cached_best_plan_if_legal(game, no_plan_key) {
        return (!checkpoint()).then_some(plan);
    }
    let result = build_best_plan(game, perspective, config);
    if checkpoint() {
        return None;
    }
    match result {
        Ok(Some(plan)) => {
            if !cache_write_allowed() {
                return None;
            }
            TURN_ENGINE_BEST_PLAN_CACHE.with(|cache| {
                let mut cache = cache.borrow_mut();
                if cache.len() >= TURN_ENGINE_CACHE_MAX_ENTRIES && !cache.contains_key(&no_plan_key)
                {
                    cache.clear();
                }
                cache.insert(no_plan_key, plan.clone());
            });
            Some(plan)
        }
        Ok(None) | Err(PlanBuildStatus::NoPlan) => {
            if cache_write_allowed() {
                TURN_ENGINE_NO_PLAN_CACHE.with(|cache| {
                    let mut cache = cache.borrow_mut();
                    if cache.len() >= TURN_ENGINE_CACHE_MAX_ENTRIES && !cache.contains(&no_plan_key)
                    {
                        cache.clear();
                    }
                    cache.insert(no_plan_key);
                });
            }
            None
        }
        Err(PlanBuildStatus::BudgetExceeded) => None,
    }
}

pub(crate) fn turn_engine_candidate_plan_live(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Option<TurnPlan> {
    if checkpoint() || game.active_color != perspective {
        return None;
    }
    let result = build_best_plan(game, perspective, config);
    if checkpoint() {
        return None;
    }
    match result {
        Ok(Some(plan)) => Some(plan),
        Ok(None) | Err(PlanBuildStatus::NoPlan) | Err(PlanBuildStatus::BudgetExceeded) => None,
    }
}

pub(crate) fn turn_engine_candidate_plan_from_allowed_heads(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    allowed_first_steps: &[Vec<Input>],
) -> Option<TurnPlan> {
    if checkpoint() || game.active_color != perspective || allowed_first_steps.is_empty() {
        return None;
    }

    let cache_key = TurnEnginePlanCacheKey {
        state_hash: MonsGameModel::search_state_hash(game),
        mode: config.mode,
        config_fingerprint: turn_engine_config_fingerprint(config),
    };
    if let Some(plan) = cached_best_plan_if_legal(game, cache_key) {
        if checkpoint() {
            return None;
        }
        if plan_has_allowed_head(&plan, allowed_first_steps) {
            return Some(plan);
        }
    }

    let result = build_best_plan_from_allowed_heads(game, perspective, config, allowed_first_steps);
    if checkpoint() {
        return None;
    }
    match result {
        Ok(Some(plan)) => Some(plan),
        Ok(None) | Err(PlanBuildStatus::NoPlan) | Err(PlanBuildStatus::BudgetExceeded) => None,
    }
}

fn cached_best_plan_if_legal(game: &MonsGame, key: TurnEnginePlanCacheKey) -> Option<TurnPlan> {
    if checkpoint() {
        return None;
    }
    TURN_ENGINE_BEST_PLAN_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let cached = cache.get(&key).cloned();
        match cached {
            Some(plan) => {
                let legal = plan
                    .compiled_chunks
                    .first()
                    .map(|inputs| {
                        MonsGameModel::apply_inputs_for_search(game, inputs.as_slice()).is_some()
                    })
                    .unwrap_or(false);
                if checkpoint() {
                    return None;
                }
                if legal {
                    Some(plan)
                } else {
                    if cache_write_allowed() {
                        cache.remove(&key);
                    }
                    None
                }
            }
            None => None,
        }
    })
}

pub(crate) fn turn_engine_commit_plan(
    game: &MonsGame,
    perspective: Color,
    mode: TurnEngineMode,
    plan: &TurnPlan,
    config: TurnEngineConfig,
) {
    if checkpoint() {
        return;
    }
    register_plan_continuations(game, perspective, mode, plan, config);
}

pub(crate) fn turn_engine_store_cached_step(
    game: &MonsGame,
    mode: TurnEngineMode,
    config: TurnEngineConfig,
    inputs: &[Input],
) {
    if checkpoint() || !cache_write_allowed() {
        return;
    }
    let key = TurnEngineContinuationCacheKey {
        state_hash: MonsGameModel::search_state_hash(game),
        mode,
        config_fingerprint: turn_engine_config_fingerprint(config),
    };
    TURN_ENGINE_CONTINUATION_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.len() >= TURN_ENGINE_CACHE_MAX_ENTRIES && !cache.contains_key(&key) {
            cache.clear();
        }
        cache.insert(key, inputs.to_vec());
    });
}

pub(crate) fn turn_engine_compare_plans(left: &TurnPlan, right: &TurnPlan) -> Ordering {
    compare_plans(left, right)
}

pub(crate) fn turn_engine_evaluate_state_utility(
    game: &MonsGame,
    start: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> TurnEngineUtility {
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    let utility = evaluate_state_utility(game, start, perspective, config);
    if checkpoint() {
        TurnEngineUtility::default()
    } else {
        utility
    }
}

pub(crate) fn turn_engine_evaluate_plan_with_replies(
    root: &MonsGame,
    plan: &TurnPlan,
    perspective: Color,
    config: TurnEngineConfig,
) -> TurnEngineUtility {
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    let utility = evaluate_plan_with_replies(root, plan, perspective, config);
    if checkpoint() {
        TurnEngineUtility::default()
    } else {
        utility
    }
}

fn build_best_plan(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Result<Option<TurnPlan>, PlanBuildStatus> {
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let result = match config.mode {
        TurnEngineMode::ProV1 => build_best_plan_v1(game, perspective, config),
        TurnEngineMode::CurrentPro => build_best_opportunity_plan(game, perspective, config),
    };
    if checkpoint() {
        Err(PlanBuildStatus::BudgetExceeded)
    } else {
        result
    }
}

#[cfg(test)]
fn ranked_candidate_plans(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Vec<TurnPlan> {
    if checkpoint() || game.active_color != perspective {
        return Vec::new();
    }

    let mut plans = match generate_plans_for_mode(
        game,
        perspective,
        config,
        config.own_seed_cap.max(1),
        config.own_beam.max(1),
        config.step_cap.max(1),
        config.expansion_cap.max(1),
    ) {
        Ok(plans) => {
            if matches!(config.mode, TurnEngineMode::CurrentPro) {
                shortlist_macro_plans_for_reply(plans, config)
            } else {
                plans
            }
        }
        Err(_) => Vec::new(),
    };
    if checkpoint() {
        return Vec::new();
    }

    if plans.is_empty() {
        if let Some(plan) = fallback_single_action_plan(game, perspective, config) {
            plans.push(plan);
        }
    }
    if checkpoint() {
        return Vec::new();
    }

    for plan in plans.iter_mut() {
        if checkpoint() {
            return Vec::new();
        }
        plan.utility = evaluate_plan_with_replies(game, plan, perspective, config);
        if cancelled() {
            return Vec::new();
        }
    }
    plans.sort_by(|a, b| compare_plans(b, a));
    plans
}

fn build_best_plan_from_allowed_heads(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    allowed_first_steps: &[Vec<Input>],
) -> Result<Option<TurnPlan>, PlanBuildStatus> {
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let plans = match generate_plans_for_mode(
        game,
        perspective,
        config,
        config.own_seed_cap.max(1),
        config.own_beam.max(1),
        config.step_cap.max(1),
        config.expansion_cap.max(1),
    ) {
        Ok(plans) if !plans.is_empty() => plans,
        Ok(_) | Err(PlanBuildStatus::NoPlan) => {
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            let fallback = fallback_single_action_plan_from_allowed_heads(
                game,
                perspective,
                config,
                allowed_first_steps,
            );
            return if checkpoint() {
                Err(PlanBuildStatus::BudgetExceeded)
            } else {
                Ok(fallback)
            };
        }
        Err(PlanBuildStatus::BudgetExceeded) => return Err(PlanBuildStatus::BudgetExceeded),
    };
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }

    let best_plan =
        best_plan_from_allowed_heads(game, perspective, config, plans, allowed_first_steps);
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    if best_plan.is_some() {
        return Ok(best_plan);
    }

    let fallback = fallback_single_action_plan_from_allowed_heads(
        game,
        perspective,
        config,
        allowed_first_steps,
    );
    if checkpoint() {
        Err(PlanBuildStatus::BudgetExceeded)
    } else {
        Ok(fallback)
    }
}

fn build_best_plan_v1(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Result<Option<TurnPlan>, PlanBuildStatus> {
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let plans = match generate_turn_plans(
        game,
        perspective,
        config,
        config.own_seed_cap.max(1),
        config.own_beam.max(1),
        config.step_cap.max(1),
        config.expansion_cap.max(1),
    ) {
        Ok(plans) if !plans.is_empty() => plans,
        Ok(_) | Err(PlanBuildStatus::NoPlan) => {
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            let fallback = fallback_single_action_plan(game, perspective, config);
            return if checkpoint() {
                Err(PlanBuildStatus::BudgetExceeded)
            } else {
                Ok(fallback)
            };
        }
        Err(PlanBuildStatus::BudgetExceeded) => return Err(PlanBuildStatus::BudgetExceeded),
    };
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }

    let mut best_plan: Option<TurnPlan> = None;
    for mut plan in plans {
        if checkpoint() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        plan.utility = evaluate_plan_with_replies(game, &plan, perspective, config);
        if cancelled() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let replace = best_plan
            .as_ref()
            .is_none_or(|current| compare_plans(&plan, current) == Ordering::Greater);
        if replace {
            best_plan = Some(plan);
        }
    }

    Ok(best_plan)
}

fn best_plan_from_allowed_heads(
    root: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    plans: Vec<TurnPlan>,
    allowed_first_steps: &[Vec<Input>],
) -> Option<TurnPlan> {
    if checkpoint() {
        return None;
    }
    let allowed_rank = allowed_first_steps
        .iter()
        .enumerate()
        .map(|(rank, inputs)| (inputs.clone(), rank))
        .collect::<HashMap<Vec<Input>, usize>>();
    let allowed_len = allowed_first_steps.len();
    let mut best_plan: Option<(TurnPlan, AllowedHeadSelectionMeta)> = None;

    for mut plan in plans {
        if checkpoint() {
            return None;
        }
        let Some(rank) = plan_allowed_head_rank(&plan, &allowed_rank) else {
            continue;
        };
        plan.utility = evaluate_plan_with_replies(root, &plan, perspective, config);
        if cancelled() {
            return None;
        }
        let meta = allowed_head_selection_meta(root, &plan, perspective, rank, allowed_len);
        if checkpoint() {
            return None;
        }
        let replace = best_plan.as_ref().is_none_or(|(current, current_meta)| {
            compare_allowed_head_plans(&plan, meta, current, *current_meta) == Ordering::Greater
        });
        if replace {
            best_plan = Some((plan, meta));
        }
    }

    best_plan.map(|(plan, _)| plan)
}

fn fallback_single_action_plan(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Option<TurnPlan> {
    if checkpoint() {
        return None;
    }
    let mut seeds = generate_action_seeds(
        game,
        perspective,
        config,
        config
            .own_seed_cap
            .max(1)
            .saturating_mul(2)
            .min(TURN_ENGINE_COMPILE_LIMIT_MAX),
    );
    if checkpoint() {
        return None;
    }
    if seeds.is_empty() {
        seeds = fallback_walk_seeds(game, perspective);
    }
    if checkpoint() || seeds.is_empty() {
        return None;
    }

    let mut compile_pool = TransitionCompilePool::new(game, seeds.as_slice(), config);
    if checkpoint() {
        return None;
    }
    let mut best_plan: Option<TurnPlan> = None;
    for seed in seeds {
        if checkpoint() {
            return None;
        }
        let Some((after, chunk)) =
            compile_action_from_pool(game, perspective, seed.action, &mut compile_pool)
        else {
            continue;
        };
        if checkpoint() {
            return None;
        }
        let mut plan = TurnPlan {
            actions: vec![seed.action],
            compiled_chunks: vec![chunk],
            end_game: after.clone_for_simulation(),
            #[cfg(test)]
            end_snapshot: TurnSnapshot::from_game(&after),
            utility: evaluate_state_utility(&after, game, perspective, config),
            head_utility: evaluate_state_utility(&after, game, perspective, config),
            head_family: seed.family,
            goal_family: seed.family,
            package_meta: TurnPackageMeta::default(),
        };
        if cancelled() {
            return None;
        }
        plan.utility = evaluate_plan_with_replies(game, &plan, perspective, config);
        if cancelled() {
            return None;
        }
        let replace = best_plan
            .as_ref()
            .is_none_or(|current| compare_plans(&plan, current) == Ordering::Greater);
        if replace {
            best_plan = Some(plan);
        }
    }
    (!checkpoint()).then_some(best_plan).flatten()
}

fn fallback_single_action_plan_from_allowed_heads(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    allowed_first_steps: &[Vec<Input>],
) -> Option<TurnPlan> {
    if checkpoint() {
        return None;
    }
    let mut seeds = generate_action_seeds(
        game,
        perspective,
        config,
        config
            .own_seed_cap
            .max(1)
            .saturating_mul(2)
            .min(TURN_ENGINE_COMPILE_LIMIT_MAX),
    );
    if checkpoint() {
        return None;
    }
    if seeds.is_empty() {
        seeds = fallback_walk_seeds(game, perspective);
    }
    if checkpoint() || seeds.is_empty() {
        return None;
    }

    let allowed_rank = allowed_first_steps
        .iter()
        .enumerate()
        .map(|(rank, inputs)| (inputs.clone(), rank))
        .collect::<HashMap<Vec<Input>, usize>>();
    let mut compile_pool = TransitionCompilePool::new(game, seeds.as_slice(), config);
    if checkpoint() {
        return None;
    }
    let allowed_len = allowed_first_steps.len();
    let mut best_plan: Option<(TurnPlan, AllowedHeadSelectionMeta)> = None;
    for seed in seeds {
        if checkpoint() {
            return None;
        }
        let Some((after, chunk)) =
            compile_action_from_pool(game, perspective, seed.action, &mut compile_pool)
        else {
            continue;
        };
        if checkpoint() {
            return None;
        }
        let Some(rank) = allowed_rank.get(&chunk).copied() else {
            continue;
        };
        let mut plan = TurnPlan {
            actions: vec![seed.action],
            compiled_chunks: vec![chunk],
            end_game: after.clone_for_simulation(),
            #[cfg(test)]
            end_snapshot: TurnSnapshot::from_game(&after),
            utility: evaluate_state_utility(&after, game, perspective, config),
            head_utility: evaluate_state_utility(&after, game, perspective, config),
            head_family: seed.family,
            goal_family: seed.family,
            package_meta: TurnPackageMeta::default(),
        };
        if cancelled() {
            return None;
        }
        plan.utility = evaluate_plan_with_replies(game, &plan, perspective, config);
        if cancelled() {
            return None;
        }
        let meta = AllowedHeadSelectionMeta {
            rank,
            allowed_len,
            first_step_opponent_immediate_loss: opponent_can_win_immediately(&after, perspective),
            first_step_drainer_safety: own_drainer_safety_score(&after.board, perspective),
        };
        let replace = best_plan.as_ref().is_none_or(|(current, current_meta)| {
            compare_allowed_head_plans(&plan, meta, current, *current_meta) == Ordering::Greater
        });
        if replace {
            best_plan = Some((plan, meta));
        }
    }

    let best_plan = best_plan.map(|(plan, _)| plan);
    if checkpoint() {
        None
    } else {
        best_plan
    }
}

fn plan_allowed_head_rank(
    plan: &TurnPlan,
    allowed_rank: &HashMap<Vec<Input>, usize>,
) -> Option<usize> {
    let first_chunk = plan.compiled_chunks.first()?;
    allowed_rank.get(first_chunk).copied()
}

fn plan_has_allowed_head(plan: &TurnPlan, allowed_first_steps: &[Vec<Input>]) -> bool {
    let Some(first_chunk) = plan.compiled_chunks.first() else {
        return false;
    };
    allowed_first_steps
        .iter()
        .any(|inputs| inputs == first_chunk)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct AllowedHeadSelectionMeta {
    rank: usize,
    allowed_len: usize,
    first_step_opponent_immediate_loss: bool,
    first_step_drainer_safety: i32,
}

fn allowed_head_selection_meta(
    root: &MonsGame,
    plan: &TurnPlan,
    perspective: Color,
    rank: usize,
    allowed_len: usize,
) -> AllowedHeadSelectionMeta {
    let after = plan
        .compiled_chunks
        .first()
        .and_then(|chunk| MonsGameModel::apply_inputs_for_search(root, chunk.as_slice()));

    AllowedHeadSelectionMeta {
        rank,
        allowed_len,
        first_step_opponent_immediate_loss: after
            .as_ref()
            .is_some_and(|game| opponent_can_win_immediately(game, perspective)),
        first_step_drainer_safety: after.as_ref().map_or(i32::MIN / 4, |game| {
            own_drainer_safety_score(&game.board, perspective)
        }),
    }
}

fn compare_allowed_head_plans(
    left: &TurnPlan,
    left_meta: AllowedHeadSelectionMeta,
    right: &TurnPlan,
    right_meta: AllowedHeadSelectionMeta,
) -> Ordering {
    compare_utility_primary_axes(left.utility, right.utility)
        .then_with(|| {
            (
                i32::from(!left_meta.first_step_opponent_immediate_loss),
                left_meta.first_step_drainer_safety,
            )
                .cmp(&(
                    i32::from(!right_meta.first_step_opponent_immediate_loss),
                    right_meta.first_step_drainer_safety,
                ))
        })
        .then_with(|| {
            allowed_head_rank_adjusted_eval(left.utility, left_meta)
                .cmp(&allowed_head_rank_adjusted_eval(right.utility, right_meta))
        })
        .then_with(|| compare_plans(left, right))
        .then_with(|| right_meta.rank.cmp(&left_meta.rank))
}

fn allowed_head_rank_adjusted_eval(
    utility: TurnEngineUtility,
    meta: AllowedHeadSelectionMeta,
) -> i32 {
    utility.eval_score.saturating_add(
        (meta.allowed_len.saturating_sub(meta.rank).min(96) as i32).saturating_mul(12),
    )
}

fn compare_plans(left: &TurnPlan, right: &TurnPlan) -> Ordering {
    compare_plan_rank(
        left.utility,
        left.head_utility,
        left.head_family,
        right.utility,
        right.head_utility,
        right.head_family,
    )
    .then_with(|| compare_package_meta(left.package_meta, right.package_meta))
    .then_with(|| family_rank(right.goal_family).cmp(&family_rank(left.goal_family)))
    .then_with(|| family_rank(right.head_family).cmp(&family_rank(left.head_family)))
    .then_with(|| right.actions.len().cmp(&left.actions.len()))
    .then_with(|| left.compiled_chunks.cmp(&right.compiled_chunks))
}

fn compare_package_meta(left: TurnPackageMeta, right: TurnPackageMeta) -> Ordering {
    (
        i32::from(left.score_gain > 0),
        left.score_gain,
        i32::from(left.deny_gain > 0),
        left.deny_gain,
        i32::from(left.drainer_safety_delta > 0),
        left.drainer_safety_delta,
        i32::from(left.ends_nonnegative_drainer_safety),
        i32::from(!left.spirit_only_setup),
        -left.opponent_immediate_window_after,
    )
        .cmp(&(
            i32::from(right.score_gain > 0),
            right.score_gain,
            i32::from(right.deny_gain > 0),
            right.deny_gain,
            i32::from(right.drainer_safety_delta > 0),
            right.drainer_safety_delta,
            i32::from(right.ends_nonnegative_drainer_safety),
            i32::from(!right.spirit_only_setup),
            -right.opponent_immediate_window_after,
        ))
}

fn opportunity_reply_shortlist_len(total: usize, beam: usize) -> usize {
    total.min(beam.saturating_mul(2).clamp(6, 12))
}

fn compare_plan_rank(
    left_utility: TurnEngineUtility,
    left_head_utility: TurnEngineUtility,
    left_head_family: TurnPlanFamily,
    right_utility: TurnEngineUtility,
    right_head_utility: TurnEngineUtility,
    right_head_family: TurnPlanFamily,
) -> Ordering {
    compare_utility_primary_axes(left_utility, right_utility)
        .then_with(|| {
            if left_head_family == right_head_family
                && should_compare_head_opening_utility(
                    left_head_family,
                    left_head_utility,
                    right_head_utility,
                )
            {
                compare_utility_primary_axes(left_head_utility, right_head_utility).then_with(
                    || {
                        left_head_utility
                            .eval_score
                            .cmp(&right_head_utility.eval_score)
                    },
                )
            } else {
                Ordering::Equal
            }
        })
        .then_with(|| left_utility.eval_score.cmp(&right_utility.eval_score))
}

pub(crate) fn compare_utility_primary_axes(
    left: TurnEngineUtility,
    right: TurnEngineUtility,
) -> Ordering {
    (
        left.win_state,
        left.avoid_immediate_loss,
        left.score_delta,
        left.deny_gain,
        left.drainer_attack,
        left.drainer_safety,
    )
        .cmp(&(
            right.win_state,
            right.avoid_immediate_loss,
            right.score_delta,
            right.deny_gain,
            right.drainer_attack,
            right.drainer_safety,
        ))
}

fn should_compare_head_opening_utility(
    family: TurnPlanFamily,
    left: TurnEngineUtility,
    right: TurnEngineUtility,
) -> bool {
    matches!(
        family,
        TurnPlanFamily::SafeSupermanaProgress | TurnPlanFamily::SafeOpponentManaProgress
    ) && head_opening_risk_class(left) != head_opening_risk_class(right)
}

fn head_opening_risk_class(utility: TurnEngineUtility) -> i32 {
    if utility.avoid_immediate_loss < 0 {
        0
    } else if utility.drainer_safety < 0 || utility.score_delta < 0 {
        1
    } else {
        2
    }
}

fn merge_plan_family(current: TurnPlanFamily, next: TurnPlanFamily) -> TurnPlanFamily {
    if family_rank(next) < family_rank(current) {
        next
    } else {
        current
    }
}

fn build_best_opportunity_plan(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Result<Option<TurnPlan>, PlanBuildStatus> {
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let plans = match generate_macro_plans(
        game,
        perspective,
        config,
        config.own_seed_cap.max(1),
        config.own_beam.max(1),
        bundle_plan_cap_for_config(config),
        config.expansion_cap.max(1),
    ) {
        Ok(plans) if !plans.is_empty() => plans,
        Ok(_) | Err(PlanBuildStatus::NoPlan) => {
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            let fallback = fallback_single_action_plan(game, perspective, config);
            return if checkpoint() {
                Err(PlanBuildStatus::BudgetExceeded)
            } else {
                Ok(fallback)
            };
        }
        Err(PlanBuildStatus::BudgetExceeded) => return Err(PlanBuildStatus::BudgetExceeded),
    };
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let plans = shortlist_macro_plans_for_reply(plans, config);
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }

    let mut best_plan: Option<TurnPlan> = None;
    for mut plan in plans {
        if checkpoint() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        plan.utility = evaluate_plan_with_replies(game, &plan, perspective, config);
        if cancelled() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let replace = best_plan
            .as_ref()
            .is_none_or(|current| compare_plans(&plan, current) == Ordering::Greater);
        if replace {
            best_plan = Some(plan);
        }
    }

    if checkpoint() {
        Err(PlanBuildStatus::BudgetExceeded)
    } else {
        Ok(best_plan)
    }
}

fn macro_plan_into_turn_plan(
    root: &MonsGame,
    node: MacroPlanNode,
    perspective: Color,
    config: TurnEngineConfig,
) -> TurnPlan {
    TurnPlan {
        actions: node.actions,
        compiled_chunks: node.compiled_chunks,
        end_game: node.game.clone_for_simulation(),
        #[cfg(test)]
        end_snapshot: TurnSnapshot::from_game(&node.game),
        utility: evaluate_state_utility(&node.game, root, perspective, config),
        head_utility: node.head_utility,
        head_family: node.head_family,
        goal_family: node.goal_family,
        package_meta: TurnPackageMeta::default(),
    }
}

fn shortlist_macro_plans_for_reply(
    mut plans: Vec<TurnPlan>,
    config: TurnEngineConfig,
) -> Vec<TurnPlan> {
    if plans.len() <= 1 {
        return plans;
    }

    plans.sort_by(|a, b| compare_plans(b, a));
    let shortlist_len = opportunity_reply_shortlist_len(plans.len(), config.own_beam);
    let per_signature_cap = if config.own_beam >= 4 { 2 } else { 1 };
    let mut kept = Vec::with_capacity(shortlist_len);
    let mut per_signature = HashMap::<(Vec<Input>, TurnPlanFamily, TurnPlanFamily), usize>::new();

    for plan in plans.into_iter() {
        let signature = (
            plan.compiled_chunks.first().cloned().unwrap_or_default(),
            plan.head_family,
            plan.goal_family,
        );
        let count = per_signature.entry(signature).or_insert(0);
        if *count >= per_signature_cap {
            continue;
        }
        *count += 1;
        kept.push(plan);
        if kept.len() >= shortlist_len {
            break;
        }
    }

    kept
}

fn macro_followup_family_allowed(
    head_family: TurnPlanFamily,
    goal_family: TurnPlanFamily,
    candidate_family: TurnPlanFamily,
) -> bool {
    if candidate_family == goal_family || candidate_family == head_family {
        return true;
    }

    match head_family {
        TurnPlanFamily::ImmediateScore => matches!(
            candidate_family,
            TurnPlanFamily::ImmediateScore
                | TurnPlanFamily::DrainerSafetyRecovery
                | TurnPlanFamily::SafeSupermanaProgress
                | TurnPlanFamily::SafeOpponentManaProgress
        ),
        TurnPlanFamily::DenyOpponentWindow | TurnPlanFamily::DrainerKill => matches!(
            candidate_family,
            TurnPlanFamily::ImmediateScore
                | TurnPlanFamily::DenyOpponentWindow
                | TurnPlanFamily::DrainerKill
                | TurnPlanFamily::DrainerSafetyRecovery
                | TurnPlanFamily::SafeSupermanaProgress
                | TurnPlanFamily::SafeOpponentManaProgress
        ),
        TurnPlanFamily::DrainerSafetyRecovery => matches!(
            candidate_family,
            TurnPlanFamily::ImmediateScore
                | TurnPlanFamily::DrainerSafetyRecovery
                | TurnPlanFamily::SafeSupermanaProgress
                | TurnPlanFamily::SafeOpponentManaProgress
                | TurnPlanFamily::ManaTempo
        ),
        TurnPlanFamily::SpiritImpact => matches!(
            candidate_family,
            TurnPlanFamily::ImmediateScore
                | TurnPlanFamily::DenyOpponentWindow
                | TurnPlanFamily::SpiritImpact
                | TurnPlanFamily::SafeSupermanaProgress
                | TurnPlanFamily::SafeOpponentManaProgress
                | TurnPlanFamily::DrainerSafetyRecovery
        ),
        TurnPlanFamily::SafeSupermanaProgress | TurnPlanFamily::SafeOpponentManaProgress => {
            matches!(
                candidate_family,
                TurnPlanFamily::ImmediateScore
                    | TurnPlanFamily::DrainerSafetyRecovery
                    | TurnPlanFamily::SafeSupermanaProgress
                    | TurnPlanFamily::SafeOpponentManaProgress
                    | TurnPlanFamily::DenyOpponentWindow
                    | TurnPlanFamily::SpiritImpact
            )
        }
        TurnPlanFamily::ManaTempo => matches!(
            candidate_family,
            TurnPlanFamily::ImmediateScore
                | TurnPlanFamily::DrainerSafetyRecovery
                | TurnPlanFamily::SafeSupermanaProgress
                | TurnPlanFamily::SafeOpponentManaProgress
                | TurnPlanFamily::SpiritImpact
                | TurnPlanFamily::ManaTempo
        ),
    }
}

fn macro_followup_family_bonus(
    head_family: TurnPlanFamily,
    goal_family: TurnPlanFamily,
    candidate_family: TurnPlanFamily,
) -> i32 {
    let mut bonus = 0i32;
    if candidate_family == goal_family {
        bonus += 420;
    }
    if candidate_family == head_family {
        bonus += 220;
    }
    if matches!(candidate_family, TurnPlanFamily::ImmediateScore) {
        bonus += 640;
    }
    if matches!(head_family, TurnPlanFamily::SpiritImpact)
        && matches!(
            candidate_family,
            TurnPlanFamily::SpiritImpact
                | TurnPlanFamily::ImmediateScore
                | TurnPlanFamily::SafeSupermanaProgress
                | TurnPlanFamily::SafeOpponentManaProgress
        )
    {
        bonus += 180;
    }
    if matches!(
        head_family,
        TurnPlanFamily::SafeSupermanaProgress | TurnPlanFamily::SafeOpponentManaProgress
    ) && matches!(
        candidate_family,
        TurnPlanFamily::SafeSupermanaProgress
            | TurnPlanFamily::SafeOpponentManaProgress
            | TurnPlanFamily::ImmediateScore
    ) {
        bonus += 180;
    }
    if matches!(head_family, TurnPlanFamily::DrainerSafetyRecovery)
        && matches!(
            candidate_family,
            TurnPlanFamily::DrainerSafetyRecovery
                | TurnPlanFamily::SafeSupermanaProgress
                | TurnPlanFamily::SafeOpponentManaProgress
                | TurnPlanFamily::ImmediateScore
        )
    {
        bonus += 160;
    }
    bonus
}

fn macro_followup_families(
    head_family: TurnPlanFamily,
    goal_family: TurnPlanFamily,
) -> Vec<TurnPlanFamily> {
    [
        TurnPlanFamily::ImmediateScore,
        TurnPlanFamily::DenyOpponentWindow,
        TurnPlanFamily::DrainerKill,
        TurnPlanFamily::DrainerSafetyRecovery,
        TurnPlanFamily::SpiritImpact,
        TurnPlanFamily::SafeSupermanaProgress,
        TurnPlanFamily::SafeOpponentManaProgress,
        TurnPlanFamily::ManaTempo,
    ]
    .into_iter()
    .filter(|family| macro_followup_family_allowed(head_family, goal_family, *family))
    .collect()
}

fn macro_followup_seed_candidates(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    head_family: TurnPlanFamily,
    goal_family: TurnPlanFamily,
    used_actions: &[TurnAction],
) -> Vec<TurnOpportunity> {
    let oracle = turn_oracle_context(game, perspective);
    let emergency = oracle.opportunity.opponent_can_win_immediately
        || oracle.opportunity.delta.drainer_safety < 0;
    let allowed_families = macro_followup_families(head_family, goal_family);
    let mut candidates = discover_turn_opportunities(
        game,
        perspective,
        config,
        config
            .own_seed_cap
            .max(config.per_node_family_cap.saturating_mul(3))
            .max(8),
        Some(allowed_families.as_slice()),
    );
    candidates.retain(|opportunity| !used_actions.contains(&opportunity.action));
    candidates.sort_by(|left, right| {
        let left_score = opportunity_score(left, emergency)
            + i64::from(macro_followup_family_bonus(
                head_family,
                goal_family,
                left.family,
            ));
        let right_score = opportunity_score(right, emergency)
            + i64::from(macro_followup_family_bonus(
                head_family,
                goal_family,
                right.family,
            ));
        right_score
            .cmp(&left_score)
            .then_with(|| action_key(left.action).cmp(&action_key(right.action)))
    });
    candidates.truncate(config.per_node_family_cap.max(1).saturating_mul(2).max(4));
    candidates
}

fn build_macro_from_head_opportunity(
    root: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    opportunity: TurnOpportunity,
) -> Option<MacroOpportunity> {
    if checkpoint() {
        return None;
    }
    let start_oracle = turn_oracle_context(root, perspective);
    if cancelled() {
        return None;
    }
    let (mut current, first_chunk) = compile_action(root, perspective, opportunity.action, config)?;
    if checkpoint() {
        return None;
    }
    let head_utility = evaluate_state_utility(&current, root, perspective, config);
    if cancelled() {
        return None;
    }
    let mut actions = vec![opportunity.action];
    let mut compiled_chunks = vec![first_chunk];
    let mut goal_family = opportunity.family;
    let mut visited_states = HashSet::new();
    visited_states.insert(MonsGameModel::search_state_hash(root));
    visited_states.insert(MonsGameModel::search_state_hash(&current));

    while current.active_color == perspective
        && current.winner_color().is_none()
        && compiled_chunks.len() < bundle_chunk_cap_for_config(config)
    {
        if checkpoint() {
            return None;
        }
        let current_oracle = turn_oracle_context(&current, perspective);
        if cancelled() {
            return None;
        }
        let current_utility = evaluate_state_utility(&current, root, perspective, config);
        if cancelled() {
            return None;
        }
        let risky_temporary_state = current_oracle.opportunity.delta.drainer_safety < 0
            || current_utility.drainer_safety < 0
            || own_drainer_safety_score(&current.board, perspective) < 0;
        let mut best_followup: Option<(
            i32,
            TurnOpportunity,
            MonsGame,
            Vec<Input>,
            TurnPlanFamily,
        )> = None;

        for followup in macro_followup_seed_candidates(
            &current,
            perspective,
            config,
            opportunity.family,
            goal_family,
            actions.as_slice(),
        ) {
            if checkpoint() {
                return None;
            }
            let Some((after, chunk)) =
                compile_action(&current, perspective, followup.action, config)
            else {
                continue;
            };
            if checkpoint() {
                return None;
            }
            let after_hash = MonsGameModel::search_state_hash(&after);
            if visited_states.contains(&after_hash) {
                continue;
            }
            let delta = macro_opportunity_delta(&current, &after, perspective, current_oracle);
            let next_goal_family = merge_plan_family(goal_family, followup.family);
            let next_utility = evaluate_state_utility(&after, root, perspective, config);
            if cancelled() {
                return None;
            }
            let improvement_signal = delta.same_turn_score_window_gain
                + delta.spirit_gain
                + delta.opponent_window_deny_gain
                + delta.drainer_safety_delta.max(0)
                + delta.supermana_progress_gain
                + delta.opponent_mana_progress_gain
                + if delta.drainer_attack { 2 } else { 0 };
            let temporary_recovery_followup = risky_temporary_state
                && matches!(
                    followup.family,
                    TurnPlanFamily::DrainerSafetyRecovery
                        | TurnPlanFamily::ImmediateScore
                        | TurnPlanFamily::SafeSupermanaProgress
                        | TurnPlanFamily::SafeOpponentManaProgress
                );
            if improvement_signal <= 0
                && next_utility <= current_utility
                && after.active_color == perspective
                && !temporary_recovery_followup
            {
                continue;
            }

            let score = macro_priority_from_state(
                root,
                &after,
                perspective,
                next_goal_family,
                compiled_chunks.len() + 1,
                followup
                    .priority
                    .saturating_add(macro_followup_family_bonus(
                        opportunity.family,
                        goal_family,
                        followup.family,
                    )),
                config,
            )
            .saturating_add(if risky_temporary_state {
                match followup.family {
                    TurnPlanFamily::DrainerSafetyRecovery => 960,
                    TurnPlanFamily::ImmediateScore => 820,
                    TurnPlanFamily::SafeSupermanaProgress
                    | TurnPlanFamily::SafeOpponentManaProgress => 360,
                    TurnPlanFamily::DenyOpponentWindow | TurnPlanFamily::DrainerKill => 220,
                    TurnPlanFamily::SpiritImpact | TurnPlanFamily::ManaTempo => 0,
                }
            } else {
                0
            })
            .saturating_add(delta.same_turn_score_window_gain.saturating_mul(280))
            .saturating_add(delta.spirit_gain.saturating_mul(220))
            .saturating_add(delta.opponent_window_deny_gain.saturating_mul(240))
            .saturating_add(delta.drainer_safety_delta.max(0).saturating_mul(200))
            .saturating_add(delta.supermana_progress_gain.saturating_mul(120))
            .saturating_add(delta.opponent_mana_progress_gain.saturating_mul(112))
            .saturating_add(if delta.drainer_attack { 820 } else { 0 });

            if best_followup
                .as_ref()
                .is_none_or(|(best_score, _, _, _, best_goal)| {
                    score > *best_score
                        || (score == *best_score
                            && family_rank(next_goal_family) < family_rank(*best_goal))
                })
            {
                best_followup = Some((score, followup, after, chunk, next_goal_family));
            }
        }

        let Some((_, followup, after, chunk, next_goal_family)) = best_followup else {
            break;
        };
        actions.push(followup.action);
        compiled_chunks.push(chunk);
        goal_family = next_goal_family;
        current = after;
        visited_states.insert(MonsGameModel::search_state_hash(&current));
    }

    if checkpoint() {
        return None;
    }
    let end_snapshot = TurnSnapshot::from_game(&current);
    let delta = macro_opportunity_delta(root, &current, perspective, start_oracle);
    if cancelled() {
        return None;
    }
    let signature = macro_signature_for_actions(&actions);
    Some(MacroOpportunity {
        head_family: opportunity.family,
        goal_family,
        priority: macro_priority_from_state(
            root,
            &current,
            perspective,
            goal_family,
            compiled_chunks.len(),
            opportunity.priority,
            config,
        ),
        delta,
        actions,
        compiled_chunks,
        end_game: current.clone_for_simulation(),
        end_snapshot,
        head_utility,
        signature,
    })
}

fn discover_macro_opportunities(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    opportunity_cap: usize,
    allowed_families: Option<&[TurnPlanFamily]>,
) -> Vec<MacroOpportunity> {
    if checkpoint() {
        return Vec::new();
    }
    let mut macros = Vec::new();
    let mut seen = HashSet::<(u64, u64)>::new();
    let root_opportunities = discover_turn_opportunities(
        game,
        perspective,
        config,
        opportunity_cap
            .max(config.per_node_family_cap.saturating_mul(3))
            .max(8),
        allowed_families,
    );
    if checkpoint() {
        return Vec::new();
    }
    for opportunity in root_opportunities {
        if checkpoint() {
            return Vec::new();
        }
        let Some(bundle) =
            build_macro_from_head_opportunity(game, perspective, config, opportunity)
        else {
            if cancelled() {
                return Vec::new();
            }
            continue;
        };
        let key = (bundle.end_snapshot.state_hash, bundle.signature);
        if !seen.insert(key) {
            continue;
        }
        macros.push(bundle);
        if macros.len() >= opportunity_cap.max(1) {
            break;
        }
    }

    if checkpoint() {
        return Vec::new();
    }
    macros.sort_by(|left, right| {
        let left_score = i64::from(left.priority)
            + i64::from(left.delta.same_turn_score_window_gain) * 280
            + i64::from(left.delta.spirit_gain) * 220
            + i64::from(left.delta.opponent_window_deny_gain) * 240
            + i64::from(left.delta.drainer_safety_delta) * 220
            + i64::from(left.delta.supermana_progress_gain) * 120
            + i64::from(left.delta.opponent_mana_progress_gain) * 112
            + if left.delta.drainer_attack { 820 } else { 0 }
            + bundle_chunk_cap_for_config(config).saturating_sub(left.compiled_chunks.len()) as i64
                * 8;
        let right_score = i64::from(right.priority)
            + i64::from(right.delta.same_turn_score_window_gain) * 280
            + i64::from(right.delta.spirit_gain) * 220
            + i64::from(right.delta.opponent_window_deny_gain) * 240
            + i64::from(right.delta.drainer_safety_delta) * 220
            + i64::from(right.delta.supermana_progress_gain) * 120
            + i64::from(right.delta.opponent_mana_progress_gain) * 112
            + if right.delta.drainer_attack { 820 } else { 0 }
            + bundle_chunk_cap_for_config(config).saturating_sub(right.compiled_chunks.len())
                as i64
                * 8;
        right_score
            .cmp(&left_score)
            .then_with(|| family_rank(left.goal_family).cmp(&family_rank(right.goal_family)))
            .then_with(|| left.compiled_chunks.cmp(&right.compiled_chunks))
    });
    macros.truncate(opportunity_cap.max(1));
    if checkpoint() {
        Vec::new()
    } else {
        macros
    }
}

fn generate_macro_plans(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    opportunity_cap: usize,
    beam_width: usize,
    bundle_cap: usize,
    expansion_cap: usize,
) -> Result<Vec<TurnPlan>, PlanBuildStatus> {
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let mut expansions = 0usize;
    let mut budget_exhausted = false;
    let bundle_cap = bundle_cap.max(1).min(bundle_plan_cap_for_config(config));
    let opportunities =
        discover_macro_opportunities(game, perspective, config, opportunity_cap, None);
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    if opportunities.is_empty() {
        return Err(PlanBuildStatus::NoPlan);
    }

    let mut frontier = Vec::<(i64, MacroPlanNode)>::new();
    let mut seen = HashMap::<(u64, u64), i64>::new();
    for opportunity in opportunities {
        if checkpoint() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        expansions += 1;
        if expansions > expansion_cap {
            budget_exhausted = true;
            break;
        }
        let order = quick_order_score(
            game,
            &opportunity.end_game,
            perspective,
            opportunity.goal_family,
            opportunity.compiled_chunks.len(),
            config,
        );
        if cancelled() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let key = (opportunity.end_snapshot.state_hash, opportunity.signature);
        let should_keep = seen.get(&key).is_none_or(|existing| order > *existing);
        if !should_keep {
            continue;
        }
        seen.insert(key, order);
        frontier.push((
            order,
            MacroPlanNode {
                game: opportunity.end_game,
                actions: opportunity.actions,
                compiled_chunks: opportunity.compiled_chunks,
                head_utility: opportunity.head_utility,
                head_family: opportunity.head_family,
                goal_family: opportunity.goal_family,
                signature: opportunity.signature,
            },
        ));
    }

    if frontier.is_empty() {
        return if budget_exhausted {
            Err(PlanBuildStatus::BudgetExceeded)
        } else {
            Err(PlanBuildStatus::NoPlan)
        };
    }

    frontier.sort_by(|a, b| {
        b.0.cmp(&a.0).then_with(|| {
            compare_chunks(
                a.1.compiled_chunks.as_slice(),
                b.1.compiled_chunks.as_slice(),
            )
        })
    });
    let mut frontier = frontier
        .into_iter()
        .take(beam_width.max(1))
        .map(|(_, node)| node)
        .collect::<Vec<_>>();
    let mut terminal = Vec::new();

    for _ in 1..bundle_cap {
        if checkpoint() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let mut candidates = Vec::<(i64, MacroPlanNode)>::new();
        let mut expanded_any = false;
        let mut stop_expansion = false;
        let current_frontier = std::mem::take(&mut frontier);

        for node in current_frontier {
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            if node.game.winner_color().is_some() || node.game.active_color != perspective {
                terminal.push(node);
                continue;
            }

            let allowed_families = macro_followup_families(node.head_family, node.goal_family);
            let opportunities = discover_macro_opportunities(
                &node.game,
                perspective,
                config,
                opportunity_cap,
                Some(allowed_families.as_slice()),
            );
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            if opportunities.is_empty() {
                terminal.push(node);
                continue;
            }

            let mut node_expanded = false;
            for opportunity in opportunities {
                if checkpoint() {
                    return Err(PlanBuildStatus::BudgetExceeded);
                }
                expansions += 1;
                if expansions > expansion_cap {
                    terminal.push(node.clone());
                    budget_exhausted = true;
                    stop_expansion = true;
                    break;
                }

                let mut actions = node.actions.clone();
                actions.extend(opportunity.actions.iter().copied());
                let mut compiled_chunks = node.compiled_chunks.clone();
                compiled_chunks.extend(opportunity.compiled_chunks.iter().cloned());
                let goal_family = merge_plan_family(node.goal_family, opportunity.goal_family);
                let signature = macro_plan_signature(node.signature, &opportunity);
                let order = quick_order_score(
                    game,
                    &opportunity.end_game,
                    perspective,
                    goal_family,
                    compiled_chunks.len(),
                    config,
                );
                if cancelled() {
                    return Err(PlanBuildStatus::BudgetExceeded);
                }
                let key = (opportunity.end_snapshot.state_hash, signature);
                let should_keep = seen.get(&key).is_none_or(|existing| order > *existing);
                if !should_keep {
                    continue;
                }
                seen.insert(key, order);
                candidates.push((
                    order,
                    MacroPlanNode {
                        game: opportunity.end_game,
                        actions,
                        compiled_chunks,
                        head_utility: node.head_utility,
                        head_family: node.head_family,
                        goal_family,
                        signature,
                    },
                ));
                expanded_any = true;
                node_expanded = true;
            }

            if stop_expansion {
                break;
            }
            if !node_expanded {
                terminal.push(node);
            }
        }

        if stop_expansion {
            if !candidates.is_empty() {
                candidates.sort_by(|a, b| {
                    b.0.cmp(&a.0).then_with(|| {
                        compare_chunks(
                            a.1.compiled_chunks.as_slice(),
                            b.1.compiled_chunks.as_slice(),
                        )
                    })
                });
                frontier = candidates
                    .into_iter()
                    .take(beam_width.max(1))
                    .map(|(_, node)| node)
                    .collect();
            }
            break;
        }

        if !expanded_any || candidates.is_empty() {
            break;
        }

        candidates.sort_by(|a, b| {
            b.0.cmp(&a.0).then_with(|| {
                compare_chunks(
                    a.1.compiled_chunks.as_slice(),
                    b.1.compiled_chunks.as_slice(),
                )
            })
        });
        frontier = candidates
            .into_iter()
            .take(beam_width.max(1))
            .map(|(_, node)| node)
            .collect();
    }

    terminal.extend(frontier);
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    if terminal.is_empty() {
        return if budget_exhausted {
            Err(PlanBuildStatus::BudgetExceeded)
        } else {
            Err(PlanBuildStatus::NoPlan)
        };
    }

    let mut plans = terminal
        .into_iter()
        .map(|node| macro_plan_into_turn_plan(game, node, perspective, config))
        .collect::<Vec<_>>();
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    plans.sort_by(|a, b| compare_plans(b, a));
    Ok(plans)
}

fn generate_turn_plans(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    seed_cap: usize,
    beam_width: usize,
    step_cap: usize,
    expansion_cap: usize,
) -> Result<Vec<TurnPlan>, PlanBuildStatus> {
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let mut expansions = 0usize;
    let mut frontier = Vec::new();
    let seeds = generate_action_seeds(game, perspective, config, seed_cap);
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    if seeds.is_empty() {
        return Err(PlanBuildStatus::NoPlan);
    }
    let mut compile_pool = TransitionCompilePool::new(game, seeds.as_slice(), config);
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }

    let mut seen = HashMap::<u64, i64>::new();
    for seed in seeds {
        if checkpoint() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let Some((after, chunk)) =
            compile_action_from_pool(game, perspective, seed.action, &mut compile_pool)
        else {
            continue;
        };
        if checkpoint() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        expansions += 1;
        if expansions > expansion_cap {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let order = quick_order_score(game, &after, perspective, seed.family, 1, config);
        let snapshot = TurnSnapshot::from_game(&after);
        let head_utility = evaluate_state_utility(&after, game, perspective, config);
        if cancelled() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let should_keep = seen
            .get(&snapshot.state_hash)
            .is_none_or(|existing| order > *existing);
        if !should_keep {
            continue;
        }
        seen.insert(snapshot.state_hash, order);
        frontier.push((
            order,
            PlanNode {
                game: after,
                actions: vec![seed.action],
                compiled_chunks: vec![chunk],
                head_utility,
                head_family: seed.family,
                goal_family: seed.family,
            },
        ));
    }

    if frontier.is_empty() {
        return Err(PlanBuildStatus::NoPlan);
    }

    frontier.sort_by(|a, b| {
        b.0.cmp(&a.0).then_with(|| {
            compare_chunks(
                a.1.compiled_chunks.as_slice(),
                b.1.compiled_chunks.as_slice(),
            )
        })
    });
    let mut frontier = frontier
        .into_iter()
        .take(beam_width.max(1))
        .map(|(_, node)| node)
        .collect::<Vec<_>>();
    let mut terminal = Vec::new();

    for _ in 1..step_cap.max(1) {
        if checkpoint() {
            return Err(PlanBuildStatus::BudgetExceeded);
        }
        let mut candidates = Vec::<(i64, PlanNode)>::new();
        let mut expanded_any = false;
        let current_frontier = std::mem::take(&mut frontier);

        for node in current_frontier {
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            if node.game.winner_color().is_some() || node.game.active_color != perspective {
                terminal.push(node);
                continue;
            }

            let seeds = generate_action_seeds(&node.game, perspective, config, seed_cap);
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            if seeds.is_empty() {
                terminal.push(node);
                continue;
            }
            let mut compile_pool = TransitionCompilePool::new(&node.game, seeds.as_slice(), config);
            if checkpoint() {
                return Err(PlanBuildStatus::BudgetExceeded);
            }
            let mut node_expanded = false;

            for seed in seeds {
                if checkpoint() {
                    return Err(PlanBuildStatus::BudgetExceeded);
                }
                let Some((after, chunk)) = compile_action_from_pool(
                    &node.game,
                    perspective,
                    seed.action,
                    &mut compile_pool,
                ) else {
                    continue;
                };
                if checkpoint() {
                    return Err(PlanBuildStatus::BudgetExceeded);
                }
                expansions += 1;
                if expansions > expansion_cap {
                    return Err(PlanBuildStatus::BudgetExceeded);
                }
                let mut actions = node.actions.clone();
                actions.push(seed.action);
                let mut compiled_chunks = node.compiled_chunks.clone();
                compiled_chunks.push(chunk);
                let order = quick_order_score(
                    game,
                    &after,
                    perspective,
                    node.goal_family,
                    actions.len(),
                    config,
                );
                if cancelled() {
                    return Err(PlanBuildStatus::BudgetExceeded);
                }
                let snapshot = TurnSnapshot::from_game(&after);
                let should_keep = seen
                    .get(&snapshot.state_hash)
                    .is_none_or(|existing| order > *existing);
                if !should_keep {
                    continue;
                }
                seen.insert(snapshot.state_hash, order);
                candidates.push((
                    order,
                    PlanNode {
                        game: after,
                        actions,
                        compiled_chunks,
                        head_utility: node.head_utility,
                        head_family: node.head_family,
                        goal_family: node.goal_family,
                    },
                ));
                expanded_any = true;
                node_expanded = true;
            }

            if !node_expanded {
                terminal.push(node);
            }
        }

        if !expanded_any || candidates.is_empty() {
            break;
        }

        candidates.sort_by(|a, b| {
            b.0.cmp(&a.0).then_with(|| {
                compare_chunks(
                    a.1.compiled_chunks.as_slice(),
                    b.1.compiled_chunks.as_slice(),
                )
            })
        });
        frontier = candidates
            .into_iter()
            .take(beam_width.max(1))
            .map(|(_, node)| node)
            .collect();
    }

    terminal.extend(frontier);
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    if terminal.is_empty() {
        return Err(PlanBuildStatus::NoPlan);
    }

    let mut plans = terminal
        .into_iter()
        .map(|node| TurnPlan {
            actions: node.actions,
            compiled_chunks: node.compiled_chunks,
            end_game: node.game.clone_for_simulation(),
            #[cfg(test)]
            end_snapshot: TurnSnapshot::from_game(&node.game),
            utility: evaluate_state_utility(&node.game, game, perspective, config),
            head_utility: node.head_utility,
            head_family: node.head_family,
            goal_family: node.goal_family,
            package_meta: TurnPackageMeta::default(),
        })
        .collect::<Vec<_>>();
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    plans.sort_by(|a, b| compare_plans(b, a));
    Ok(plans)
}

fn generate_plans_for_mode(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    seed_cap: usize,
    beam_width: usize,
    step_cap: usize,
    expansion_cap: usize,
) -> Result<Vec<TurnPlan>, PlanBuildStatus> {
    if checkpoint() {
        return Err(PlanBuildStatus::BudgetExceeded);
    }
    let result = match config.mode {
        TurnEngineMode::CurrentPro => generate_macro_plans(
            game,
            perspective,
            config,
            seed_cap,
            beam_width,
            step_cap.min(bundle_plan_cap_for_config(config)),
            expansion_cap,
        ),
        TurnEngineMode::ProV1 => generate_turn_plans(
            game,
            perspective,
            config,
            seed_cap,
            beam_width,
            step_cap,
            expansion_cap,
        ),
    };
    if checkpoint() {
        Err(PlanBuildStatus::BudgetExceeded)
    } else {
        result
    }
}

fn evaluate_plan_with_replies(
    root: &MonsGame,
    plan: &TurnPlan,
    perspective: Color,
    config: TurnEngineConfig,
) -> TurnEngineUtility {
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    let after = &plan.end_game;

    if after.winner_color().is_some() || after.active_color != perspective.other() {
        return evaluate_state_utility(after, root, perspective, config);
    }

    let opponent_config = TurnEngineConfig {
        mode: config.mode,
        own_seed_cap: config.opponent_seed_cap.max(1),
        own_beam: config.opponent_beam.max(1),
        per_node_family_cap: config.per_node_family_cap.max(1),
        step_cap: config.step_cap.clamp(1, 4),
        opponent_seed_cap: config.reply_seed_cap.max(1),
        opponent_beam: config.reply_beam.max(1),
        reply_seed_cap: 0,
        reply_beam: 0,
        expansion_cap: (config.expansion_cap / 2).max(24),
        enable_spirit_family: config.enable_spirit_family,
        scoring_weights: config.scoring_weights,
        enable_lazy_oracle_score_window_projection: config
            .enable_lazy_oracle_score_window_projection,
    };
    let opponent_result = generate_plans_for_mode(
        after,
        perspective.other(),
        opponent_config,
        opponent_config.own_seed_cap,
        opponent_config.own_beam,
        opponent_config.step_cap,
        opponent_config.expansion_cap,
    );
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    let opponent_plans = match opponent_result {
        Ok(plans) if !plans.is_empty() => plans,
        _ => return evaluate_state_utility(after, root, perspective, config),
    };

    let opponent_shortlist = reply_shortlist_len(opponent_plans.len(), opponent_config.own_beam);
    let mut best_opponent = &opponent_plans[0];
    let mut best_opponent_utility = evaluate_state_utility(
        &best_opponent.end_game,
        after,
        perspective.other(),
        opponent_config,
    );
    if cancelled() {
        return TurnEngineUtility::default();
    }
    for opponent_plan in opponent_plans.iter().take(opponent_shortlist).skip(1) {
        if checkpoint() {
            return TurnEngineUtility::default();
        }
        let utility = evaluate_state_utility(
            &opponent_plan.end_game,
            after,
            perspective.other(),
            opponent_config,
        );
        if cancelled() {
            return TurnEngineUtility::default();
        }
        if utility > best_opponent_utility
            || (utility == best_opponent_utility
                && compare_chunks(
                    opponent_plan.compiled_chunks.as_slice(),
                    best_opponent.compiled_chunks.as_slice(),
                ) == Ordering::Less)
        {
            best_opponent = opponent_plan;
            best_opponent_utility = utility;
        }
    }

    let after_opponent = &best_opponent.end_game;

    if after_opponent.winner_color().is_some()
        || after_opponent.active_color != perspective
        || config.reply_seed_cap == 0
    {
        return evaluate_state_utility(after_opponent, root, perspective, config);
    }

    let reply_config = TurnEngineConfig {
        mode: config.mode,
        own_seed_cap: config.reply_seed_cap.max(1),
        own_beam: config.reply_beam.max(1),
        per_node_family_cap: config.per_node_family_cap.max(1),
        step_cap: config.step_cap.clamp(1, 3),
        opponent_seed_cap: 0,
        opponent_beam: 0,
        reply_seed_cap: 0,
        reply_beam: 0,
        expansion_cap: (config.expansion_cap / 3).max(16),
        enable_spirit_family: config.enable_spirit_family,
        scoring_weights: config.scoring_weights,
        enable_lazy_oracle_score_window_projection: config
            .enable_lazy_oracle_score_window_projection,
    };
    let reply_result = generate_plans_for_mode(
        after_opponent,
        perspective,
        reply_config,
        reply_config.own_seed_cap,
        reply_config.own_beam,
        reply_config.step_cap,
        reply_config.expansion_cap,
    );
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    let reply_plans = match reply_result {
        Ok(plans) if !plans.is_empty() => plans,
        _ => return evaluate_state_utility(after_opponent, root, perspective, config),
    };
    let reply_shortlist = reply_shortlist_len(reply_plans.len(), reply_config.own_beam);
    let mut best_reply_utility: Option<TurnEngineUtility> = None;
    for plan in reply_plans.into_iter().take(reply_shortlist) {
        if checkpoint() {
            return TurnEngineUtility::default();
        }
        let utility = evaluate_state_utility(&plan.end_game, root, perspective, config);
        if cancelled() {
            return TurnEngineUtility::default();
        }
        best_reply_utility = Some(best_reply_utility.map_or(utility, |best| best.max(utility)));
    }
    best_reply_utility
        .unwrap_or_else(|| evaluate_state_utility(after_opponent, root, perspective, config))
}

fn reply_shortlist_len(total: usize, beam: usize) -> usize {
    total.min(beam.saturating_mul(2).clamp(4, 8))
}

fn evaluate_state_utility(
    game: &MonsGame,
    start: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> TurnEngineUtility {
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    let key = TurnEngineUtilityCacheKey {
        state_hash: MonsGameModel::search_state_hash(game),
        start_hash: MonsGameModel::search_state_hash(start),
        perspective,
        config_fingerprint: turn_engine_config_fingerprint(config),
    };
    if let Some(cached) = TURN_ENGINE_UTILITY_CACHE.with(|cache| cache.borrow().get(&key).copied())
    {
        return if checkpoint() {
            TurnEngineUtility::default()
        } else {
            cached
        };
    }

    let built = evaluate_state_utility_uncached(game, start, perspective, config);
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    if cache_write_allowed() {
        TURN_ENGINE_UTILITY_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.len() >= TURN_ENGINE_CACHE_MAX_ENTRIES && !cache.contains_key(&key) {
                cache.clear();
            }
            cache.insert(key, built);
        });
    }
    built
}

fn evaluate_state_utility_uncached(
    game: &MonsGame,
    start: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> TurnEngineUtility {
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    let my_score = score_for_color(game, perspective);
    let start_score = score_for_color(start, perspective);
    let score_delta = my_score.saturating_sub(start_score);
    let oracle = turn_oracle_context(game, perspective);
    if cancelled() {
        return TurnEngineUtility::default();
    }
    let strategic = oracle.strategic;
    let path_bonus = strategic
        .score_path_window
        .best_steps
        .map(|steps| (Config::BOARD_SIZE * 3 - steps).max(0) * 22)
        .unwrap_or(0);
    let immediate_bonus = strategic.immediate_window.best_score.saturating_mul(110)
        + strategic.immediate_window.multi_pressure.saturating_mul(18);
    let safe_supermana_bonus =
        if own_drainer_carries_safe_mana(&game.board, perspective, Mana::Supermana) {
            380
        } else {
            0
        };
    let safe_opponent_mana_bonus = if own_drainer_carries_safe_mana(
        &game.board,
        perspective,
        Mana::Regular(perspective.other()),
    ) {
        300
    } else {
        0
    };
    let opponent = perspective.other();
    let opponent_window_before = active_turn_score_window(start, opponent);
    if cancelled() {
        return TurnEngineUtility::default();
    }
    let opponent_window_after = if game.active_color == opponent {
        active_turn_score_window(game, opponent)
    } else {
        oracle.opponent_immediate_window
    };
    if cancelled() {
        return TurnEngineUtility::default();
    }
    let deny_gain = opponent_window_before.saturating_sub(opponent_window_after);
    let drainer_safety = own_drainer_safety_score(&game.board, perspective);
    let unsafe_progress_penalty = if drainer_safety < 0 {
        drainer_safety.saturating_abs().saturating_mul(900)
    } else {
        0
    };
    let opponent_needed_before =
        Config::TARGET_SCORE.saturating_sub(score_for_color(start, opponent));
    let opponent_needed_after =
        Config::TARGET_SCORE.saturating_sub(score_for_color(game, opponent));
    let denied_immediate_window = opponent_needed_before > 0
        && opponent_window_before >= opponent_needed_before
        && (opponent_needed_after <= 0 || opponent_window_after < opponent_needed_after);
    let drainer_attack = if find_awake_drainer_location(&game.board, opponent).is_none() {
        1
    } else {
        0
    };
    let eval_score = evaluate_preferability_with_weights_and_exact_policy(
        game,
        perspective,
        config.scoring_weights,
        false,
    );
    if checkpoint() {
        return TurnEngineUtility::default();
    }
    TurnEngineUtility {
        win_state: winner_state(game, perspective),
        avoid_immediate_loss: if opponent_can_win_immediately(game, perspective) {
            -1
        } else {
            1
        },
        score_delta: score_delta
            .saturating_mul(2_400)
            .saturating_add(path_bonus)
            .saturating_add(immediate_bonus)
            .saturating_add(safe_supermana_bonus)
            .saturating_add(safe_opponent_mana_bonus)
            .saturating_sub(unsafe_progress_penalty),
        deny_gain: deny_gain
            .saturating_mul(220)
            .saturating_add(if denied_immediate_window { 1_500 } else { 0 }),
        drainer_attack,
        drainer_safety,
        eval_score,
    }
}

fn quick_order_score(
    root: &MonsGame,
    game: &MonsGame,
    perspective: Color,
    family: TurnPlanFamily,
    step_len: usize,
    config: TurnEngineConfig,
) -> i64 {
    let utility = evaluate_state_utility(game, root, perspective, config);
    let family_bonus = match family {
        TurnPlanFamily::ImmediateScore => 1_000,
        TurnPlanFamily::DenyOpponentWindow => 960,
        TurnPlanFamily::DrainerKill => 920,
        TurnPlanFamily::DrainerSafetyRecovery => 860,
        TurnPlanFamily::SpiritImpact => 820,
        TurnPlanFamily::SafeSupermanaProgress => 760,
        TurnPlanFamily::SafeOpponentManaProgress => 720,
        TurnPlanFamily::ManaTempo => 560,
    };
    i64::from(utility.win_state) * 10_000_000
        + i64::from(utility.avoid_immediate_loss) * 5_000_000
        + i64::from(utility.score_delta)
        + i64::from(utility.deny_gain)
        + i64::from(utility.drainer_attack) * 3_500
        + i64::from(utility.drainer_safety) * 2_200
        + i64::from(utility.eval_score / 8)
        + i64::from(family_bonus) * 2_000
        - step_len as i64 * 350
}

fn turn_oracle_context(game: &MonsGame, perspective: Color) -> TurnOracleContext {
    if checkpoint() {
        return TurnOracleContext::default();
    }
    let state_hash = MonsGameModel::search_state_hash(game);
    let key = TurnOracleCacheKey {
        state_hash,
        perspective,
    };
    if let Some(cached) = TURN_ENGINE_ORACLE_CACHE.with(|cache| cache.borrow().get(&key).copied()) {
        return if checkpoint() {
            TurnOracleContext::default()
        } else {
            cached
        };
    }

    let strategic_analysis = exact_strategic_analysis_with_search_hash(game, state_hash);
    if checkpoint() {
        return TurnOracleContext::default();
    }
    let opportunity = exact_opportunity_context_with_search_hash(game, perspective, state_hash);
    if checkpoint() {
        return TurnOracleContext::default();
    }
    let built = TurnOracleContext {
        opportunity,
        strategic: strategic_analysis.color_summary(perspective),
        opponent_immediate_window: strategic_analysis
            .color_summary(perspective.other())
            .immediate_window
            .best_score,
    };
    if cache_write_allowed() {
        TURN_ENGINE_ORACLE_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.len() >= TURN_ENGINE_CACHE_MAX_ENTRIES && !cache.contains_key(&key) {
                cache.clear();
            }
            cache.insert(key, built);
        });
    }
    built
}

#[inline]
fn active_turn_score_window_with_search_hash(
    game: &MonsGame,
    color: Color,
    state_hash: u64,
) -> i32 {
    if checkpoint() {
        return 0;
    }
    let window = exact_same_turn_score_window_with_search_hash(game, color, state_hash);
    if checkpoint() {
        0
    } else {
        window
    }
}

#[inline]
fn active_turn_score_window(game: &MonsGame, color: Color) -> i32 {
    active_turn_score_window_with_search_hash(game, color, MonsGameModel::search_state_hash(game))
}

fn bundle_chunk_cap_for_config(config: TurnEngineConfig) -> usize {
    config.step_cap.clamp(1, 6)
}

fn bundle_plan_cap_for_config(config: TurnEngineConfig) -> usize {
    config.step_cap.clamp(1, 4)
}

fn saturating_i64_to_i32(value: i64) -> i32 {
    value.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

fn progress_step_gain(before: Option<i32>, after: Option<i32>) -> i32 {
    let unknown_steps = Config::BOARD_SIZE * 3;
    let before = before.unwrap_or(unknown_steps);
    let after = after.unwrap_or(unknown_steps);
    before.saturating_sub(after).max(0)
}

fn macro_signature_mix(mut hash: u64, value: u64) -> u64 {
    hash ^= value;
    hash = hash.wrapping_mul(1099511628211);
    hash.rotate_left(11)
}

fn macro_signature_for_actions(actions: &[TurnAction]) -> u64 {
    let mut hash = 1469598103934665603_u64;
    for action in actions {
        let (tag, a, b, c) = action_key(*action);
        hash = macro_signature_mix(hash, tag as u64);
        hash = macro_signature_mix(hash, a.index() as u64);
        hash = macro_signature_mix(hash, b.map_or(u64::MAX, |location| location.index() as u64));
        hash = macro_signature_mix(
            hash,
            c.map_or(u64::MAX - 1, |location| location.index() as u64),
        );
    }
    hash
}

fn macro_plan_signature(previous: u64, opportunity: &MacroOpportunity) -> u64 {
    macro_signature_mix(
        macro_signature_mix(previous, opportunity.end_snapshot.state_hash),
        opportunity.signature,
    )
}

fn macro_opportunity_delta(
    game: &MonsGame,
    end_game: &MonsGame,
    perspective: Color,
    start_oracle: TurnOracleContext,
) -> OpportunityDelta {
    if checkpoint() {
        return OpportunityDelta::default();
    }
    let end_oracle = turn_oracle_context(end_game, perspective);
    if cancelled() {
        return OpportunityDelta::default();
    }

    OpportunityDelta {
        same_turn_score_window_gain: end_oracle
            .strategic
            .immediate_window
            .best_score
            .saturating_sub(start_oracle.strategic.immediate_window.best_score)
            .max(0),
        spirit_gain: end_oracle
            .strategic
            .spirit
            .next_turn_setup_gain
            .saturating_sub(start_oracle.strategic.spirit.next_turn_setup_gain)
            .max(
                end_oracle
                    .strategic
                    .spirit
                    .utility
                    .saturating_sub(start_oracle.strategic.spirit.utility),
            )
            .max(0),
        opponent_window_deny_gain: start_oracle
            .opponent_immediate_window
            .saturating_sub(end_oracle.opponent_immediate_window)
            .max(0),
        drainer_attack: end_oracle.opportunity.delta.drainer_attack_available,
        drainer_safety_delta: own_drainer_safety_score(&end_game.board, perspective)
            .saturating_sub(own_drainer_safety_score(&game.board, perspective)),
        supermana_progress_gain: progress_step_gain(
            start_oracle.opportunity.delta.safe_supermana_progress_steps,
            end_oracle.opportunity.delta.safe_supermana_progress_steps,
        ),
        opponent_mana_progress_gain: progress_step_gain(
            start_oracle
                .opportunity
                .delta
                .safe_opponent_mana_progress_steps,
            end_oracle
                .opportunity
                .delta
                .safe_opponent_mana_progress_steps,
        ),
    }
}

fn macro_priority_from_state(
    root: &MonsGame,
    end_game: &MonsGame,
    perspective: Color,
    family: TurnPlanFamily,
    chunk_count: usize,
    priority_hint: i32,
    config: TurnEngineConfig,
) -> i32 {
    priority_hint.saturating_add(saturating_i64_to_i32(
        quick_order_score(root, end_game, perspective, family, chunk_count, config) / 1024,
    ))
}

fn opportunity_kind_for_family(family: TurnPlanFamily) -> OpportunityKind {
    match family {
        TurnPlanFamily::ImmediateScore => OpportunityKind::ImmediateScore,
        TurnPlanFamily::DenyOpponentWindow => OpportunityKind::TacticalDeny,
        TurnPlanFamily::DrainerKill => OpportunityKind::DrainerKill,
        TurnPlanFamily::SafeSupermanaProgress => OpportunityKind::SafeSupermanaProgress,
        TurnPlanFamily::SafeOpponentManaProgress => OpportunityKind::SafeOpponentManaProgress,
        TurnPlanFamily::DrainerSafetyRecovery => OpportunityKind::DrainerSafetyRecovery,
        TurnPlanFamily::SpiritImpact => OpportunityKind::SpiritImpact,
        TurnPlanFamily::ManaTempo => OpportunityKind::ManaTempo,
    }
}

fn opportunity_budget_for_action(action: TurnAction) -> OpportunityBudget {
    match action {
        TurnAction::Walk { .. }
        | TurnAction::SafetyRetreat { .. }
        | TurnAction::ScoreCarry { .. } => OpportunityBudget {
            mon_moves_needed: 1,
            needs_action: false,
            needs_mana_move: false,
        },
        TurnAction::Attack { .. } | TurnAction::Bomb { .. } | TurnAction::SpiritShift { .. } => {
            OpportunityBudget {
                mon_moves_needed: 0,
                needs_action: true,
                needs_mana_move: false,
            }
        }
        TurnAction::MoveMana { .. } => OpportunityBudget {
            mon_moves_needed: 0,
            needs_action: false,
            needs_mana_move: true,
        },
    }
}

fn budget_allows_opportunity(
    available: ExactOpportunityBudget,
    required: OpportunityBudget,
) -> bool {
    required.mon_moves_needed <= available.remaining_mon_moves
        && (!required.needs_action || available.can_use_action)
        && (!required.needs_mana_move || available.can_move_mana)
}

fn opportunity_delta_for_seed(
    seed: &ActionSeed,
    context: ExactOpportunityContext,
) -> OpportunityDelta {
    let super_gain = matches!(seed.family, TurnPlanFamily::SafeSupermanaProgress)
        .then_some(
            context
                .delta
                .safe_supermana_progress_steps
                .map_or(0, |steps| (Config::BOARD_SIZE * 3 - steps).max(0)),
        )
        .unwrap_or(0);
    let opponent_gain = matches!(seed.family, TurnPlanFamily::SafeOpponentManaProgress)
        .then_some(
            context
                .delta
                .safe_opponent_mana_progress_steps
                .map_or(0, |steps| (Config::BOARD_SIZE * 3 - steps).max(0)),
        )
        .unwrap_or(0);
    OpportunityDelta {
        same_turn_score_window_gain: context.delta.same_turn_score_window_value,
        spirit_gain: if matches!(seed.family, TurnPlanFamily::SpiritImpact) {
            context.delta.spirit_gain.max(1)
        } else {
            0
        },
        opponent_window_deny_gain: if matches!(
            seed.family,
            TurnPlanFamily::DenyOpponentWindow | TurnPlanFamily::DrainerKill
        ) {
            context.delta.opponent_window_deny_gain.max(1)
        } else {
            0
        },
        drainer_attack: matches!(
            seed.family,
            TurnPlanFamily::DrainerKill | TurnPlanFamily::DenyOpponentWindow
        ) && context.delta.drainer_attack_available,
        drainer_safety_delta: if matches!(seed.family, TurnPlanFamily::DrainerSafetyRecovery) {
            (-context.delta.drainer_safety).max(0)
        } else {
            0
        },
        supermana_progress_gain: super_gain,
        opponent_mana_progress_gain: opponent_gain,
    }
}

fn opportunity_score(opportunity: &TurnOpportunity, emergency: bool) -> i64 {
    let kind_bonus = match opportunity.kind {
        OpportunityKind::ImmediateScore => 12_000,
        OpportunityKind::TacticalDeny => 11_400,
        OpportunityKind::DrainerKill => 11_200,
        OpportunityKind::DrainerSafetyRecovery => 10_400,
        OpportunityKind::SpiritImpact => 9_800,
        OpportunityKind::SafeSupermanaProgress => 9_400,
        OpportunityKind::SafeOpponentManaProgress => 9_200,
        OpportunityKind::ManaTempo => 8_000,
    };
    let emergency_bonus = if emergency
        && matches!(
            opportunity.kind,
            OpportunityKind::ImmediateScore
                | OpportunityKind::TacticalDeny
                | OpportunityKind::DrainerKill
                | OpportunityKind::DrainerSafetyRecovery
        ) {
        4_000
    } else {
        0
    };
    i64::from(opportunity.priority)
        + i64::from(kind_bonus + emergency_bonus)
        + i64::from(opportunity.delta.same_turn_score_window_gain) * 280
        + i64::from(opportunity.delta.spirit_gain) * 220
        + i64::from(opportunity.delta.opponent_window_deny_gain) * 260
        + i64::from(opportunity.delta.drainer_safety_delta) * 240
        + i64::from(opportunity.delta.supermana_progress_gain) * 40
        + i64::from(opportunity.delta.opponent_mana_progress_gain) * 36
        + if opportunity.delta.drainer_attack {
            800
        } else {
            0
        }
        - i64::from(opportunity.budget.mon_moves_needed.max(0)) * 120
        - if opportunity.budget.needs_action {
            80
        } else {
            0
        }
        - if opportunity.budget.needs_mana_move {
            40
        } else {
            0
        }
}

fn turn_opportunity_from_seed(
    seed: ActionSeed,
    context: ExactOpportunityContext,
) -> TurnOpportunity {
    TurnOpportunity {
        kind: opportunity_kind_for_family(seed.family),
        family: seed.family,
        action: seed.action,
        priority: seed.priority,
        budget: opportunity_budget_for_action(seed.action),
        delta: opportunity_delta_for_seed(&seed, context),
    }
}

fn family_allowed(allowed_families: Option<&[TurnPlanFamily]>, family: TurnPlanFamily) -> bool {
    allowed_families
        .map(|families| families.contains(&family))
        .unwrap_or(true)
}

fn discover_turn_opportunities(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    opportunity_cap: usize,
    allowed_families: Option<&[TurnPlanFamily]>,
) -> Vec<TurnOpportunity> {
    if checkpoint() || game.active_color != perspective {
        return Vec::new();
    }

    let state_hash = MonsGameModel::search_state_hash(game);
    let context = exact_opportunity_context_with_search_hash(game, perspective, state_hash);
    if checkpoint() {
        return Vec::new();
    }
    let emergency = context.opponent_can_win_immediately || context.delta.drainer_safety < 0;
    let mut seeds = Vec::new();
    if family_allowed(allowed_families, TurnPlanFamily::ImmediateScore) {
        seeds.extend(immediate_score_seeds(game, perspective));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::DenyOpponentWindow) {
        seeds.extend(deny_window_seeds(game, perspective));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::DrainerKill) {
        seeds.extend(drainer_kill_seeds(game, perspective));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::SafeSupermanaProgress) {
        seeds.extend(safe_supermana_progress_seeds(game, perspective));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::SafeOpponentManaProgress) {
        seeds.extend(safe_opponent_mana_progress_seeds(game, perspective));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::DrainerSafetyRecovery) {
        seeds.extend(safety_recovery_seeds(game, perspective));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::ManaTempo) {
        seeds.extend(risky_recovery_setup_seeds(game, perspective, config));
    }
    if [
        TurnPlanFamily::SafeSupermanaProgress,
        TurnPlanFamily::SafeOpponentManaProgress,
        TurnPlanFamily::DrainerSafetyRecovery,
        TurnPlanFamily::SpiritImpact,
    ]
    .into_iter()
    .any(|family| family_allowed(allowed_families, family))
    {
        seeds.extend(oracle_walk_seeds(
            game,
            perspective,
            context,
            allowed_families,
            config,
        ));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::SpiritImpact) {
        seeds.extend(spirit_impact_seeds(game, perspective, config));
    }
    if checkpoint() {
        return Vec::new();
    }
    if family_allowed(allowed_families, TurnPlanFamily::ManaTempo) {
        seeds.extend(mana_tempo_seeds(game, perspective));
    }
    if [
        TurnPlanFamily::ManaTempo,
        TurnPlanFamily::DrainerSafetyRecovery,
    ]
    .into_iter()
    .any(|family| family_allowed(allowed_families, family))
    {
        seeds.extend(
            fallback_walk_seeds(game, perspective)
                .into_iter()
                .filter(|seed| family_allowed(allowed_families, seed.family)),
        );
    }

    let mut per_family = HashMap::<TurnPlanFamily, Vec<TurnOpportunity>>::new();
    for seed in seeds {
        if checkpoint() {
            return Vec::new();
        }
        let opportunity = turn_opportunity_from_seed(seed, context);
        if !budget_allows_opportunity(context.budget, opportunity.budget) {
            continue;
        }
        if emergency
            && matches!(opportunity.kind, OpportunityKind::ManaTempo)
            && !opportunity.delta.drainer_attack
            && opportunity.delta.drainer_safety_delta <= 0
        {
            continue;
        }
        per_family
            .entry(opportunity.family)
            .or_default()
            .push(opportunity);
    }
    for family_opportunities in per_family.values_mut() {
        family_opportunities.sort_by(|a, b| {
            opportunity_score(b, emergency)
                .cmp(&opportunity_score(a, emergency))
                .then_with(|| action_key(a.action).cmp(&action_key(b.action)))
        });
    }

    let family_order = [
        TurnPlanFamily::ImmediateScore,
        TurnPlanFamily::DenyOpponentWindow,
        TurnPlanFamily::DrainerKill,
        TurnPlanFamily::DrainerSafetyRecovery,
        TurnPlanFamily::SpiritImpact,
        TurnPlanFamily::SafeSupermanaProgress,
        TurnPlanFamily::SafeOpponentManaProgress,
        TurnPlanFamily::ManaTempo,
    ];
    let mut dedup = HashSet::<TurnAction>::new();
    let mut filtered = Vec::new();
    let mut family_indices = HashMap::<TurnPlanFamily, usize>::new();
    for _round in 0..config.per_node_family_cap.max(1) {
        if checkpoint() {
            return Vec::new();
        }
        let mut added_any = false;
        for family in family_order {
            let Some(family_opportunities) = per_family.get(&family) else {
                continue;
            };
            let start_index = *family_indices.get(&family).unwrap_or(&0);
            let mut selected = None;
            for (offset, opportunity) in family_opportunities.iter().enumerate().skip(start_index) {
                if dedup.insert(opportunity.action) {
                    selected = Some((offset + 1, opportunity.clone()));
                    break;
                }
            }
            if let Some((next_index, opportunity)) = selected {
                family_indices.insert(family, next_index);
                filtered.push(opportunity);
                added_any = true;
                if filtered.len() >= opportunity_cap.max(1) {
                    return filtered;
                }
            } else {
                family_indices.insert(family, family_opportunities.len());
            }
        }
        if !added_any {
            break;
        }
    }

    filtered
}

fn generate_action_seeds(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    seed_cap: usize,
) -> Vec<ActionSeed> {
    if checkpoint() {
        return Vec::new();
    }
    match config.mode {
        TurnEngineMode::CurrentPro => {
            let seeds = discover_turn_opportunities(game, perspective, config, seed_cap, None)
                .into_iter()
                .map(|opportunity| ActionSeed {
                    family: opportunity.family,
                    action: opportunity.action,
                    priority: opportunity.priority,
                })
                .collect();
            return if checkpoint() { Vec::new() } else { seeds };
        }
        TurnEngineMode::ProV1 => {}
    }
    generate_action_seeds_v1(game, perspective, config, seed_cap)
}

fn generate_action_seeds_v1(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
    seed_cap: usize,
) -> Vec<ActionSeed> {
    if checkpoint() || game.active_color != perspective {
        return Vec::new();
    }

    let mut seeds = Vec::new();
    seeds.extend(immediate_score_seeds(game, perspective));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(deny_window_seeds(game, perspective));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(drainer_kill_seeds(game, perspective));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(safe_supermana_progress_seeds(game, perspective));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(safe_opponent_mana_progress_seeds(game, perspective));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(safety_recovery_seeds(game, perspective));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(oracle_walk_seeds(
        game,
        perspective,
        exact_opportunity_context_with_search_hash(
            game,
            perspective,
            MonsGameModel::search_state_hash(game),
        ),
        None,
        config,
    ));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(spirit_impact_seeds(game, perspective, config));
    if checkpoint() {
        return Vec::new();
    }
    seeds.extend(mana_tempo_seeds(game, perspective));

    let mut dedup = HashSet::<TurnAction>::new();
    let mut per_family = HashMap::<TurnPlanFamily, Vec<ActionSeed>>::new();
    for seed in seeds {
        if checkpoint() {
            return Vec::new();
        }
        per_family.entry(seed.family).or_default().push(seed);
    }
    for family_seeds in per_family.values_mut() {
        family_seeds.sort_by(|a, b| {
            b.priority
                .cmp(&a.priority)
                .then_with(|| action_key(a.action).cmp(&action_key(b.action)))
        });
    }

    let family_order = [
        TurnPlanFamily::ImmediateScore,
        TurnPlanFamily::DenyOpponentWindow,
        TurnPlanFamily::DrainerKill,
        TurnPlanFamily::DrainerSafetyRecovery,
        TurnPlanFamily::SpiritImpact,
        TurnPlanFamily::SafeSupermanaProgress,
        TurnPlanFamily::SafeOpponentManaProgress,
        TurnPlanFamily::ManaTempo,
    ];
    let mut filtered = Vec::new();
    let mut family_indices = HashMap::<TurnPlanFamily, usize>::new();
    for _round in 0..config.per_node_family_cap.max(1) {
        if checkpoint() {
            return Vec::new();
        }
        let mut added_any = false;
        for family in family_order {
            let Some(family_seeds) = per_family.get(&family) else {
                continue;
            };
            let start_index = *family_indices.get(&family).unwrap_or(&0);
            let mut selected = None;
            for (offset, seed) in family_seeds.iter().enumerate().skip(start_index) {
                if dedup.insert(seed.action) {
                    selected = Some((offset + 1, seed.clone()));
                    break;
                }
            }
            if let Some((next_index, seed)) = selected {
                family_indices.insert(family, next_index);
                filtered.push(seed);
                added_any = true;
                if filtered.len() >= seed_cap.max(1) {
                    return filtered;
                }
            } else {
                family_indices.insert(family, family_seeds.len());
            }
        }
        if !added_any {
            break;
        }
    }
    filtered
}

fn family_rank(family: TurnPlanFamily) -> i32 {
    match family {
        TurnPlanFamily::ImmediateScore => 0,
        TurnPlanFamily::DenyOpponentWindow => 1,
        TurnPlanFamily::DrainerKill => 2,
        TurnPlanFamily::DrainerSafetyRecovery => 3,
        TurnPlanFamily::SpiritImpact => 4,
        TurnPlanFamily::SafeSupermanaProgress => 5,
        TurnPlanFamily::SafeOpponentManaProgress => 6,
        TurnPlanFamily::ManaTempo => 7,
    }
}

fn action_key(action: TurnAction) -> (i32, Location, Option<Location>, Option<Location>) {
    match action {
        TurnAction::Walk { actor, to } => (0, actor, Some(to), None),
        TurnAction::Attack { actor, target } => (1, actor, Some(target), None),
        TurnAction::SpiritShift {
            actor,
            target,
            destination,
        } => (2, actor, Some(target), Some(destination)),
        TurnAction::Bomb { actor, target } => (3, actor, Some(target), None),
        TurnAction::MoveMana { from, to } => (4, from, Some(to), None),
        TurnAction::ScoreCarry { actor, step, .. } => (5, actor, Some(step), None),
        TurnAction::SafetyRetreat { actor, to } => (6, actor, Some(to), None),
    }
}

fn immediate_score_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    let mut seeds = Vec::new();
    for (location, item) in game.board.occupied() {
        let Item::MonWithMana { mon, mana } = item else {
            continue;
        };
        if mon.color != perspective || mon.is_fainted() {
            continue;
        }
        let before_dist = distance_to_nearest_pool(location, perspective);
        for &next in location.nearby_locations_ref() {
            let after_dist = distance_to_nearest_pool(next, perspective);
            if after_dist > before_dist {
                continue;
            }
            let priority = 9_800
                + before_dist.saturating_sub(after_dist).saturating_mul(180)
                + mana.score(perspective).saturating_mul(120);
            seeds.push(ActionSeed {
                family: TurnPlanFamily::ImmediateScore,
                action: TurnAction::ScoreCarry {
                    actor: location,
                    wanted: *mana,
                    step: next,
                },
                priority,
            });
        }
    }
    seeds
}

fn deny_window_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    let opponent = perspective.other();
    let deny_pressure = active_turn_score_window_with_search_hash(
        game,
        opponent,
        MonsGameModel::search_state_hash(game),
    );
    if deny_pressure <= 0 && !opponent_can_win_immediately(game, perspective) {
        return Vec::new();
    }

    let mut seeds = attack_family_seeds(
        game,
        perspective,
        TurnPlanFamily::DenyOpponentWindow,
        9_400 + deny_pressure.saturating_mul(240),
    );
    if let Some(drainer) = find_awake_drainer_location(&game.board, perspective) {
        for &next in drainer.nearby_locations_ref() {
            let before_safety = own_drainer_safety_score(&game.board, perspective);
            let before_dist = distance_to_nearest_pool(drainer, perspective);
            let after_dist = distance_to_nearest_pool(next, perspective);
            if after_dist > before_dist.saturating_add(1) && before_safety >= 0 {
                continue;
            }
            seeds.push(ActionSeed {
                family: TurnPlanFamily::DenyOpponentWindow,
                action: TurnAction::SafetyRetreat {
                    actor: drainer,
                    to: next,
                },
                priority: 9_100 + before_safety.saturating_abs().saturating_mul(220),
            });
        }
    }
    seeds
}

fn drainer_kill_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    let Some(target) = find_awake_drainer_location(&game.board, perspective.other()) else {
        return Vec::new();
    };
    if !opponent_drainer_kill_is_high_value(game, perspective, target) {
        return Vec::new();
    }
    attack_family_seeds(game, perspective, TurnPlanFamily::DrainerKill, 9_000)
}

fn attack_family_seeds(
    game: &MonsGame,
    perspective: Color,
    family: TurnPlanFamily,
    base_priority: i32,
) -> Vec<ActionSeed> {
    let Some(target) = find_awake_drainer_location(&game.board, perspective.other()) else {
        return Vec::new();
    };
    let mut seeds = Vec::new();
    let can_use_action = game.player_can_use_action();
    let remaining_moves = remaining_moves_for_color(game, perspective);
    for (location, item) in game.board.occupied() {
        match item {
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => {
                if mon.color != perspective || mon.is_fainted() {
                    continue;
                }
            }
            Item::Mana { .. } | Item::Consumable { .. } => continue,
        }

        let can_attack = can_use_action && actor_can_attack_from_item(item);
        let can_bomb = can_use_action && actor_can_bomb_from_item(item);

        if can_attack
            && actor_can_attack_target_now(&game.board, location, target, item, perspective)
        {
            seeds.push(ActionSeed {
                family,
                action: TurnAction::Attack {
                    actor: location,
                    target,
                },
                priority: base_priority,
            });
        }

        if can_bomb && actor_can_bomb_target_now(&game.board, location, target, item, perspective) {
            seeds.push(ActionSeed {
                family,
                action: TurnAction::Bomb {
                    actor: location,
                    target,
                },
                priority: base_priority.saturating_sub(80),
            });
        }

        if remaining_moves <= 0 || !(can_attack || can_bomb) {
            continue;
        }
        for &next in location.nearby_locations_ref() {
            if next.distance(&target) >= location.distance(&target) {
                continue;
            }
            if family == TurnPlanFamily::DrainerKill {
                let Some(mon) = item.mon().copied() else {
                    continue;
                };
                let moved_item = match item {
                    Item::Mon { .. } => Item::Mon { mon },
                    Item::MonWithMana { mana, .. } => Item::MonWithMana { mon, mana: *mana },
                    Item::MonWithConsumable { consumable, .. } => Item::MonWithConsumable {
                        mon,
                        consumable: *consumable,
                    },
                    Item::Mana { .. } | Item::Consumable { .. } => continue,
                };
                let mut preview = game.board.clone();
                preview.remove_item(location);
                preview.put(moved_item, next);
                let threatens_now = (can_attack
                    && actor_can_attack_target_now(
                        &preview,
                        next,
                        target,
                        &moved_item,
                        perspective,
                    ))
                    || (can_bomb
                        && actor_can_bomb_target_now(
                            &preview,
                            next,
                            target,
                            &moved_item,
                            perspective,
                        ));
                if !threatens_now {
                    continue;
                }
            }
            seeds.push(ActionSeed {
                family,
                action: TurnAction::Walk {
                    actor: location,
                    to: next,
                },
                priority: base_priority.saturating_sub(200).saturating_add(
                    location
                        .distance(&target)
                        .saturating_sub(next.distance(&target))
                        * 80,
                ),
            });
        }
    }
    seeds
}

fn safe_supermana_progress_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    safe_progress_seeds(
        game,
        perspective,
        Mana::Supermana,
        TurnPlanFamily::SafeSupermanaProgress,
        8_900,
    )
}

fn safe_opponent_mana_progress_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    safe_progress_seeds(
        game,
        perspective,
        Mana::Regular(perspective.other()),
        TurnPlanFamily::SafeOpponentManaProgress,
        8_600,
    )
}

fn safe_progress_seeds(
    game: &MonsGame,
    perspective: Color,
    wanted: Mana,
    family: TurnPlanFamily,
    base_priority: i32,
) -> Vec<ActionSeed> {
    if checkpoint() {
        return Vec::new();
    }
    #[derive(Clone, Copy, Default)]
    struct SafeProgressExactSnapshot {
        progress_steps: Option<i32>,
        score_path_best_steps: Option<i32>,
        same_turn_score_window_value: i32,
    }

    fn safe_progress_exact_snapshot(
        game: &MonsGame,
        perspective: Color,
        wanted: Mana,
        state_hash: u64,
    ) -> SafeProgressExactSnapshot {
        if checkpoint() {
            return SafeProgressExactSnapshot::default();
        }
        let tactical_flags = match wanted {
            Mana::Supermana => {
                EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS | EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW
            }
            Mana::Regular(color) if color == perspective.other() => {
                EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS
            }
            Mana::Regular(_) => 0,
        };
        let projection = exact_turn_tactical_projection_with_search_hash(
            game,
            perspective,
            state_hash,
            tactical_flags,
        );
        if checkpoint() {
            return SafeProgressExactSnapshot::default();
        }
        let progress_steps = match wanted {
            Mana::Supermana => projection.safe_supermana_progress_steps,
            Mana::Regular(color) if color == perspective.other() => {
                projection.safe_opponent_mana_progress_steps
            }
            Mana::Regular(_) => None,
        };

        let score_path_best_steps = crate::models::automove_exact::exact_best_score_steps_on_board(
            &game.board,
            perspective,
        );
        if checkpoint() {
            return SafeProgressExactSnapshot::default();
        }
        SafeProgressExactSnapshot {
            progress_steps,
            score_path_best_steps,
            same_turn_score_window_value: projection.same_turn_score_window_value,
        }
    }

    let Some(drainer) = find_awake_drainer_location(&game.board, perspective) else {
        return Vec::new();
    };
    let mut seeds = Vec::new();
    let before_state_hash = MonsGameModel::search_state_hash(game);
    let before_exact = safe_progress_exact_snapshot(game, perspective, wanted, before_state_hash);
    if cancelled() {
        return Vec::new();
    }
    let before_safety = own_drainer_safety_score(&game.board, perspective);
    if let Some(path) = exact_secure_specific_mana_path_from(game, perspective, drainer, wanted) {
        if let Some(step) = path.first().copied() {
            seeds.push(ActionSeed {
                family,
                action: TurnAction::ScoreCarry {
                    actor: drainer,
                    wanted,
                    step,
                },
                priority: base_priority
                    .saturating_add((Config::BOARD_SIZE * 2 - path.len() as i32).max(0) * 120),
            });
        }
    }
    if checkpoint() {
        return Vec::new();
    }
    if remaining_moves_for_color(game, perspective) > 0 {
        if let Some(target_mana) = nearest_wanted_mana_location(&game.board, wanted) {
            let before_dist = drainer.distance(&target_mana);
            let before_exact_steps = before_exact
                .progress_steps
                .unwrap_or(Config::BOARD_SIZE * 3);
            let before_score_path = before_exact
                .score_path_best_steps
                .unwrap_or(Config::BOARD_SIZE * 3);
            for &next in drainer.nearby_locations_ref() {
                if checkpoint() {
                    return Vec::new();
                }
                if !walk_destination_plausible(&game.board, drainer, next) {
                    continue;
                }
                let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
                    game,
                    &[Input::Location(drainer), Input::Location(next)],
                ) else {
                    continue;
                };
                if opponent_can_win_immediately(&after, perspective) {
                    continue;
                }
                let after_exact = safe_progress_exact_snapshot(
                    &after,
                    perspective,
                    wanted,
                    MonsGameModel::search_state_hash(&after),
                );
                if cancelled() {
                    return Vec::new();
                }
                let after_safety = own_drainer_safety_score(&after.board, perspective);
                let after_exact_steps =
                    after_exact.progress_steps.unwrap_or(Config::BOARD_SIZE * 3);
                let after_score_path = after_exact
                    .score_path_best_steps
                    .unwrap_or(Config::BOARD_SIZE * 3);
                let exact_improved = after_exact_steps < before_exact_steps
                    || (after_exact_steps <= before_exact_steps
                        && after_score_path < before_score_path);
                if !exact_improved && after_safety < before_safety {
                    continue;
                }
                let mut priority = base_priority
                    .saturating_sub(180)
                    .saturating_add(
                        before_dist
                            .saturating_sub(next.distance(&target_mana))
                            .max(0)
                            * 110,
                    )
                    .saturating_add(after_safety.saturating_sub(before_safety) * 120);
                if exact_improved {
                    priority = priority.saturating_add(
                        before_exact_steps
                            .saturating_sub(after_exact_steps)
                            .saturating_mul(220),
                    );
                    priority = priority.saturating_add(
                        before_score_path
                            .saturating_sub(after_score_path)
                            .saturating_mul(180),
                    );
                }
                if wanted == Mana::Supermana && after_exact.same_turn_score_window_value > 0 {
                    priority = priority.saturating_add(
                        after_exact.same_turn_score_window_value.saturating_mul(260),
                    );
                }
                seeds.push(ActionSeed {
                    family,
                    action: TurnAction::Walk {
                        actor: drainer,
                        to: next,
                    },
                    priority,
                });
            }
        }
    }
    if let Some(Item::MonWithMana { mana, .. }) = game.board.item(drainer) {
        if *mana == wanted {
            let before_dist = distance_to_nearest_pool(drainer, perspective);
            for &next in drainer.nearby_locations_ref() {
                let after_dist = distance_to_nearest_pool(next, perspective);
                if after_dist > before_dist {
                    continue;
                }
                seeds.push(ActionSeed {
                    family,
                    action: TurnAction::ScoreCarry {
                        actor: drainer,
                        wanted,
                        step: next,
                    },
                    priority: base_priority
                        .saturating_add(before_dist.saturating_sub(after_dist).saturating_mul(150)),
                });
            }
        }
    }
    seeds
}

fn safety_recovery_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    let Some(drainer) = find_awake_drainer_location(&game.board, perspective) else {
        return Vec::new();
    };
    let before_safety = own_drainer_safety_score(&game.board, perspective);

    let mut seeds = Vec::new();
    for &next in drainer.nearby_locations_ref() {
        let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
            game,
            &[Input::Location(drainer), Input::Location(next)],
        ) else {
            continue;
        };
        let safety_after = own_drainer_safety_score(&after.board, perspective);
        if safety_after <= before_safety {
            continue;
        }
        seeds.push(ActionSeed {
            family: TurnPlanFamily::DrainerSafetyRecovery,
            action: TurnAction::SafetyRetreat {
                actor: drainer,
                to: next,
            },
            priority: 8_300
                + before_safety.saturating_abs().saturating_mul(220)
                + safety_after
                    .saturating_sub(before_safety)
                    .saturating_mul(260),
        });
    }
    seeds
}

fn fallback_walk_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    if remaining_moves_for_color(game, perspective) <= 0 {
        return Vec::new();
    }

    let mut seeds = Vec::new();
    let before_safety = own_drainer_safety_score(&game.board, perspective);
    if let Some(drainer) = find_awake_drainer_location(&game.board, perspective) {
        let before_pool_dist = distance_to_nearest_pool(drainer, perspective);
        for &next in drainer.nearby_locations_ref() {
            if !walk_destination_plausible(&game.board, drainer, next) {
                continue;
            }
            let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
                game,
                &[Input::Location(drainer), Input::Location(next)],
            ) else {
                continue;
            };
            if opponent_can_win_immediately(&after, perspective) {
                continue;
            }
            let after_safety = own_drainer_safety_score(&after.board, perspective);
            if after_safety < before_safety {
                continue;
            }
            let after_pool_dist = distance_to_nearest_pool(next, perspective);
            let family = if after_safety > before_safety {
                TurnPlanFamily::DrainerSafetyRecovery
            } else {
                TurnPlanFamily::ManaTempo
            };
            let priority = 7_200
                + before_pool_dist
                    .saturating_sub(after_pool_dist)
                    .max(0)
                    .saturating_mul(140)
                + after_safety
                    .saturating_sub(before_safety)
                    .saturating_mul(240);
            seeds.push(ActionSeed {
                family,
                action: TurnAction::Walk {
                    actor: drainer,
                    to: next,
                },
                priority,
            });
        }
    }

    if seeds.is_empty() {
        for (actor, item) in game.board.occupied() {
            let Some(mon) = item.mon().copied() else {
                continue;
            };
            if mon.color != perspective || mon.is_fainted() {
                continue;
            }
            for &to in actor.nearby_locations_ref() {
                if !walk_destination_plausible(&game.board, actor, to) {
                    continue;
                }
                let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
                    game,
                    &[Input::Location(actor), Input::Location(to)],
                ) else {
                    continue;
                };
                if opponent_can_win_immediately(&after, perspective) {
                    continue;
                }
                seeds.push(ActionSeed {
                    family: TurnPlanFamily::ManaTempo,
                    action: TurnAction::Walk { actor, to },
                    priority: 6_800,
                });
            }
        }
    }

    seeds
}

fn best_follow_up_safety_recovery_priority(game: &MonsGame, perspective: Color) -> Option<i32> {
    let drainer = find_awake_drainer_location(&game.board, perspective)?;
    let before_safety = own_drainer_safety_score(&game.board, perspective);
    let mut best_priority = None;
    for &next in drainer.nearby_locations_ref() {
        if !walk_destination_plausible(&game.board, drainer, next) {
            continue;
        }
        let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
            game,
            &[Input::Location(drainer), Input::Location(next)],
        ) else {
            continue;
        };
        let safety_after = own_drainer_safety_score(&after.board, perspective);
        if safety_after <= before_safety {
            continue;
        }
        let priority = 8_300
            + before_safety.saturating_abs().saturating_mul(220)
            + safety_after
                .saturating_sub(before_safety)
                .saturating_mul(260);
        best_priority = Some(best_priority.unwrap_or(i32::MIN).max(priority));
    }
    best_priority
}

fn risky_recovery_setup_seeds(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Vec<ActionSeed> {
    if !matches!(config.mode, TurnEngineMode::CurrentPro)
        || remaining_moves_for_color(game, perspective) <= 0
    {
        return Vec::new();
    }

    let Some(drainer) = find_awake_drainer_location(&game.board, perspective) else {
        return Vec::new();
    };
    let before_safety = own_drainer_safety_score(&game.board, perspective);
    let before_pool_dist = distance_to_nearest_pool(drainer, perspective);
    let mut seeds = Vec::new();

    for &next in drainer.nearby_locations_ref() {
        if !walk_destination_plausible(&game.board, drainer, next) {
            continue;
        }
        let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
            game,
            &[Input::Location(drainer), Input::Location(next)],
        ) else {
            continue;
        };
        if opponent_can_win_immediately(&after, perspective) {
            continue;
        }
        let after_safety = own_drainer_safety_score(&after.board, perspective);
        if after_safety >= before_safety {
            continue;
        }
        let after_pool_dist = distance_to_nearest_pool(next, perspective);
        if after_pool_dist >= before_pool_dist {
            continue;
        }
        let Some(recovery_priority) = best_follow_up_safety_recovery_priority(&after, perspective)
        else {
            continue;
        };
        let safety_drop = before_safety.saturating_sub(after_safety).max(0);
        seeds.push(ActionSeed {
            family: TurnPlanFamily::ManaTempo,
            action: TurnAction::Walk {
                actor: drainer,
                to: next,
            },
            priority: 8_000
                + before_pool_dist
                    .saturating_sub(after_pool_dist)
                    .max(0)
                    .saturating_mul(260)
                + recovery_priority / 20
                - safety_drop.saturating_mul(120),
        });
    }

    seeds
}

fn oracle_walk_seeds(
    game: &MonsGame,
    perspective: Color,
    context: ExactOpportunityContext,
    allowed_families: Option<&[TurnPlanFamily]>,
    config: TurnEngineConfig,
) -> Vec<ActionSeed> {
    oracle_walk_seeds_with_projection_mode(
        game,
        perspective,
        context,
        allowed_families,
        config.enable_lazy_oracle_score_window_projection,
    )
}

fn oracle_walk_seeds_with_projection_mode(
    game: &MonsGame,
    perspective: Color,
    context: ExactOpportunityContext,
    allowed_families: Option<&[TurnPlanFamily]>,
    use_lazy_score_window_projection: bool,
) -> Vec<ActionSeed> {
    if checkpoint() || remaining_moves_for_color(game, perspective) <= 0 {
        return Vec::new();
    }

    let allow_supermana = family_allowed(allowed_families, TurnPlanFamily::SafeSupermanaProgress);
    let allow_opponent_mana =
        family_allowed(allowed_families, TurnPlanFamily::SafeOpponentManaProgress);
    let allow_safety = family_allowed(allowed_families, TurnPlanFamily::DrainerSafetyRecovery);
    let allow_spirit = family_allowed(allowed_families, TurnPlanFamily::SpiritImpact);
    if !allow_supermana && !allow_opponent_mana && !allow_safety && !allow_spirit {
        return Vec::new();
    }

    let before_turn = context.turn;
    let before_state_hash = MonsGameModel::search_state_hash(game);
    let before_spirit = if allow_spirit {
        strategic_spirit_signal_with_search_hash(game, perspective, before_state_hash)
    } else {
        (0, 0)
    };
    if checkpoint() {
        return Vec::new();
    }
    let before_safety = if allow_supermana || allow_safety {
        own_drainer_safety_score(&game.board, perspective)
    } else {
        0
    };
    let before_super_steps = before_turn
        .safe_supermana_progress_steps
        .unwrap_or(Config::BOARD_SIZE * 3);
    let before_opponent_steps = before_turn
        .safe_opponent_mana_progress_steps
        .unwrap_or(Config::BOARD_SIZE * 3);
    let own_drainer = find_awake_drainer_location(&game.board, perspective);
    let mut seeds = Vec::new();
    let mut projection_memo = TurnEngineProjectionMemo::default();

    for (actor, item) in game.board.occupied() {
        if checkpoint() {
            return Vec::new();
        }
        let Some(mon) = item.mon().copied() else {
            continue;
        };
        if mon.color != perspective || mon.is_fainted() {
            continue;
        }
        if own_drainer == Some(actor) {
            continue;
        }
        let actor_capabilities = oracle_walk_actor_capabilities(
            mon.kind,
            allow_supermana,
            allow_opponent_mana,
            allow_safety,
            allow_spirit,
        );
        if !actor_capabilities.any_seed() {
            continue;
        }
        for &to in actor.nearby_locations_ref() {
            if checkpoint() {
                return Vec::new();
            }
            if !walk_destination_plausible(&game.board, actor, to) {
                continue;
            }
            let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
                game,
                &[Input::Location(actor), Input::Location(to)],
            ) else {
                continue;
            };
            if opponent_can_win_immediately(&after, perspective) {
                continue;
            }

            let need_after_spirit = actor_capabilities.can_emit_spirit;
            let need_after_turn = if use_lazy_score_window_projection {
                actor_capabilities.projection_profile.is_some()
            } else {
                actor_capabilities.tactical_flags != 0
            };
            let need_after_score_window =
                use_lazy_score_window_projection && actor_capabilities.needs_score_window;
            let after_state_hash =
                if need_after_turn || need_after_score_window || need_after_spirit {
                    Some(MonsGameModel::search_state_hash(&after))
                } else {
                    None
                };
            let after_turn = if use_lazy_score_window_projection {
                actor_capabilities.projection_profile.map(|profile| {
                    projection_memo.projection(
                        &after,
                        perspective,
                        after_state_hash.expect(
                            "after_state_hash present when lazy oracle projection is needed",
                        ),
                        profile,
                    )
                })
            } else if need_after_turn {
                Some(exact_turn_tactical_projection_with_search_hash(
                    &after,
                    perspective,
                    after_state_hash.expect("after_state_hash present when after_turn is needed"),
                    actor_capabilities.tactical_flags,
                ))
            } else {
                None
            };
            if cancelled() {
                return Vec::new();
            }
            let after_spirit = if need_after_spirit {
                strategic_spirit_signal_with_search_hash(
                    &after,
                    perspective,
                    after_state_hash.expect("after_state_hash present when after_spirit is needed"),
                )
            } else {
                (0, 0)
            };
            let after_safety =
                if actor_capabilities.can_emit_supermana || actor_capabilities.can_emit_safety {
                    own_drainer_safety_score(&after.board, perspective)
                } else {
                    before_safety
                };
            let after_super_steps = after_turn
                .map(|summary| {
                    summary
                        .safe_supermana_progress_steps
                        .unwrap_or(Config::BOARD_SIZE * 3)
                })
                .unwrap_or(before_super_steps);
            let after_opponent_steps = after_turn
                .map(|summary| {
                    summary
                        .safe_opponent_mana_progress_steps
                        .unwrap_or(Config::BOARD_SIZE * 3)
                })
                .unwrap_or(before_opponent_steps);
            let mut after_score_window_value = None;
            let mut load_after_score_window = || {
                *after_score_window_value.get_or_insert_with(|| {
                    if use_lazy_score_window_projection {
                        projection_memo
                            .projection(
                                &after,
                                perspective,
                                after_state_hash.expect(
                                    "after_state_hash present when score-window projection is needed",
                                ),
                                TurnEngineProjectionProfile::SelectorWindow,
                            )
                            .same_turn_score_window_value
                    } else {
                        after_turn
                            .map(|summary| summary.same_turn_score_window_value)
                            .unwrap_or(0)
                    }
                })
            };

            if actor_capabilities.can_emit_supermana && after_super_steps < before_super_steps {
                seeds.push(ActionSeed {
                    family: TurnPlanFamily::SafeSupermanaProgress,
                    action: TurnAction::Walk { actor, to },
                    priority: 8_250
                        + before_super_steps
                            .saturating_sub(after_super_steps)
                            .saturating_mul(240)
                        + after_safety
                            .saturating_sub(before_safety)
                            .saturating_mul(100)
                        + load_after_score_window().saturating_mul(160),
                });
            }

            let opponent_progress_improved = actor_capabilities.can_emit_opponent_mana
                && after_opponent_steps < before_opponent_steps;
            let spirit_denial_improved = allow_spirit
                && (actor_capabilities.can_emit_spirit
                    || actor_capabilities.can_emit_opponent_mana)
                && after_turn.is_some_and(|summary| {
                    summary.spirit_assisted_denial_value > before_turn.spirit_assisted_denial_value
                });
            if opponent_progress_improved || spirit_denial_improved {
                let family = if mon.kind == MonKind::Spirit {
                    TurnPlanFamily::SpiritImpact
                } else {
                    TurnPlanFamily::SafeOpponentManaProgress
                };
                if family_allowed(allowed_families, family) {
                    let mut priority = 8_000;
                    if opponent_progress_improved {
                        priority += before_opponent_steps
                            .saturating_sub(after_opponent_steps)
                            .saturating_mul(240);
                    }
                    if spirit_denial_improved {
                        priority += after_turn
                            .map(|summary| summary.spirit_assisted_denial_value)
                            .unwrap_or(0)
                            .saturating_sub(before_turn.spirit_assisted_denial_value)
                            .saturating_mul(180);
                    }
                    seeds.push(ActionSeed {
                        family,
                        action: TurnAction::Walk { actor, to },
                        priority,
                    });
                }
            }

            let spirit_setup_gain_delta = after_spirit.0.saturating_sub(before_spirit.0);
            let spirit_utility_delta = after_spirit.1.saturating_sub(before_spirit.1);
            let spirit_setup_improved = spirit_setup_gain_delta > 0 || spirit_utility_delta > 0;
            let spirit_score_base_improved = actor_capabilities.can_emit_spirit
                && after_turn.is_some_and(|summary| {
                    summary.spirit_assisted_score_value > before_turn.spirit_assisted_score_value
                });
            let spirit_score_window_improved = actor_capabilities.can_emit_spirit
                && if use_lazy_score_window_projection {
                    !spirit_score_base_improved
                        && !spirit_setup_improved
                        && load_after_score_window() > before_turn.same_turn_score_window_value
                } else {
                    after_turn.is_some_and(|summary| {
                        summary.same_turn_score_window_value
                            > before_turn.same_turn_score_window_value
                    })
                };
            if actor_capabilities.can_emit_spirit
                && (spirit_score_base_improved
                    || spirit_score_window_improved
                    || spirit_setup_improved)
            {
                seeds.push(ActionSeed {
                    family: TurnPlanFamily::SpiritImpact,
                    action: TurnAction::Walk { actor, to },
                    priority: 8_100
                        + after_turn
                            .map(|summary| summary.spirit_assisted_score_value)
                            .unwrap_or(0)
                            .saturating_sub(before_turn.spirit_assisted_score_value)
                            .saturating_mul(200)
                        + load_after_score_window()
                            .saturating_sub(before_turn.same_turn_score_window_value)
                            .saturating_mul(220)
                        + spirit_setup_gain_delta.saturating_mul(320)
                        + spirit_utility_delta.saturating_mul(180),
                });
            }

            if actor_capabilities.can_emit_safety && after_safety > before_safety {
                seeds.push(ActionSeed {
                    family: TurnPlanFamily::DrainerSafetyRecovery,
                    action: TurnAction::Walk { actor, to },
                    priority: 8_050
                        + after_safety
                            .saturating_sub(before_safety)
                            .saturating_mul(260),
                });
            }
        }
    }

    seeds
}

fn strategic_spirit_signal_with_search_hash(
    game: &MonsGame,
    perspective: Color,
    state_hash: u64,
) -> (i32, i32) {
    let spirit = exact_strategic_analysis_with_search_hash(game, state_hash)
        .color_summary(perspective)
        .spirit;
    (spirit.next_turn_setup_gain, spirit.utility)
}

fn spirit_impact_seeds(
    game: &MonsGame,
    perspective: Color,
    config: TurnEngineConfig,
) -> Vec<ActionSeed> {
    if checkpoint() || !config.enable_spirit_family {
        return Vec::new();
    }
    if !game.player_can_use_action() {
        return Vec::new();
    }
    let tactical_flags = tactical_projection_flags(true, true, true, true, true);
    let mut seeds = Vec::new();
    let before_turn = exact_turn_tactical_projection_with_search_hash(
        game,
        perspective,
        MonsGameModel::search_state_hash(game),
        tactical_flags,
    );
    if checkpoint() {
        return Vec::new();
    }
    let before_safety = own_drainer_safety_score(&game.board, perspective);
    for (spirit_location, item) in game.board.occupied() {
        if checkpoint() {
            return Vec::new();
        }
        let Some(mon) = item.mon().copied() else {
            continue;
        };
        if mon.color != perspective || mon.kind != MonKind::Spirit || mon.is_fainted() {
            continue;
        }
        if matches!(game.board.square(spirit_location), Square::MonBase { .. }) {
            continue;
        }

        for &target in spirit_location.reachable_by_spirit_action_ref() {
            if checkpoint() {
                return Vec::new();
            }
            let Some(target_item) = game.board.item(target).copied() else {
                continue;
            };
            if !spirit_target_allowed(target_item) {
                continue;
            }
            for &destination in target.nearby_locations_ref() {
                if checkpoint() {
                    return Vec::new();
                }
                if !spirit_destination_allowed(&game.board, target_item, destination) {
                    continue;
                }
                let Some((after, _)) = MonsGameModel::apply_inputs_for_search_with_events(
                    game,
                    &[
                        Input::Location(spirit_location),
                        Input::Location(target),
                        Input::Location(destination),
                    ],
                ) else {
                    continue;
                };
                let mut priority = 7_600;
                if let Some(mon) = target_item.mon() {
                    if mon.color == perspective.other() {
                        priority += 400;
                    }
                }
                if matches!(target_item, Item::Mana { mana } if mana == Mana::Supermana) {
                    priority += 600;
                }
                if matches!(target_item, Item::Mana { mana } if mana == Mana::Regular(perspective.other()))
                {
                    priority += 460;
                }
                let after_turn = exact_turn_tactical_projection_with_search_hash(
                    &after,
                    perspective,
                    MonsGameModel::search_state_hash(&after),
                    tactical_flags,
                );
                if checkpoint() {
                    return Vec::new();
                }
                if after_turn.same_turn_score_window_value
                    > before_turn.same_turn_score_window_value
                {
                    priority += after_turn
                        .same_turn_score_window_value
                        .saturating_sub(before_turn.same_turn_score_window_value)
                        .saturating_mul(280);
                }
                if after_turn.spirit_assisted_score {
                    priority += 900 + after_turn.spirit_assisted_score_value.saturating_mul(120);
                }
                if after_turn.safe_supermana_progress {
                    priority += 700
                        + progress_priority_bonus(
                            before_turn.safe_supermana_progress_steps,
                            after_turn.safe_supermana_progress_steps,
                        );
                }
                if after_turn.safe_opponent_mana_progress {
                    priority += 760
                        + progress_priority_bonus(
                            before_turn.safe_opponent_mana_progress_steps,
                            after_turn.safe_opponent_mana_progress_steps,
                        );
                }
                if after_turn.spirit_assisted_denial {
                    priority += 820 + after_turn.spirit_assisted_denial_value.saturating_mul(140);
                }
                let after_safety = own_drainer_safety_score(&after.board, perspective);
                if after_safety > before_safety {
                    priority += after_safety
                        .saturating_sub(before_safety)
                        .saturating_mul(160);
                }
                priority += (Config::BOARD_SIZE - destination.distance(&target)).max(0) * 20;
                seeds.push(ActionSeed {
                    family: TurnPlanFamily::SpiritImpact,
                    action: TurnAction::SpiritShift {
                        actor: spirit_location,
                        target,
                        destination,
                    },
                    priority,
                });
            }
        }
    }
    seeds.sort_by(|a, b| {
        b.priority
            .cmp(&a.priority)
            .then_with(|| action_key(a.action).cmp(&action_key(b.action)))
    });
    seeds.truncate(12);
    seeds
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct OracleWalkActorCapabilities {
    can_emit_supermana: bool,
    can_emit_opponent_mana: bool,
    can_emit_safety: bool,
    can_emit_spirit: bool,
    tactical_flags: u8,
    projection_profile: Option<TurnEngineProjectionProfile>,
    needs_score_window: bool,
}

impl OracleWalkActorCapabilities {
    #[inline]
    fn any_seed(self) -> bool {
        self.can_emit_supermana
            || self.can_emit_opponent_mana
            || self.can_emit_safety
            || self.can_emit_spirit
    }
}

fn tactical_projection_flags(
    need_supermana_progress: bool,
    need_opponent_mana_progress: bool,
    need_spirit_score: bool,
    need_spirit_denial: bool,
    need_score_window: bool,
) -> u8 {
    let mut flags = 0u8;
    if need_supermana_progress {
        flags |= EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS;
    }
    if need_opponent_mana_progress {
        flags |= EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS;
    }
    if need_spirit_score {
        flags |= EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE;
    }
    if need_spirit_denial {
        flags |= EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL;
    }
    if need_score_window {
        flags |= EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW;
    }
    flags
}

fn tactical_projection_profile_flags(profile: TurnEngineProjectionProfile) -> u8 {
    match profile {
        TurnEngineProjectionProfile::SafeProgressOnly => {
            tactical_projection_flags(true, false, false, false, false)
        }
        TurnEngineProjectionProfile::OpponentProgressOnly => {
            tactical_projection_flags(false, true, false, false, false)
        }
        TurnEngineProjectionProfile::DrainerOpportunity => {
            tactical_projection_flags(false, true, false, true, false)
        }
        TurnEngineProjectionProfile::SpiritScoreOnly => {
            tactical_projection_flags(false, false, true, false, false)
        }
        TurnEngineProjectionProfile::SpiritOpportunity => {
            tactical_projection_flags(true, false, true, false, false)
        }
        TurnEngineProjectionProfile::SelectorWindow => {
            tactical_projection_flags(false, false, false, false, true)
        }
    }
}

fn oracle_walk_actor_capabilities(
    mon_kind: MonKind,
    allow_supermana: bool,
    allow_opponent_mana: bool,
    allow_safety: bool,
    allow_spirit: bool,
) -> OracleWalkActorCapabilities {
    let can_emit_supermana = allow_supermana;
    let can_emit_opponent_mana = allow_opponent_mana && mon_kind != MonKind::Spirit;
    let can_emit_safety = allow_safety;
    let can_emit_spirit = allow_spirit && mon_kind == MonKind::Spirit;
    let projection_profile = if can_emit_supermana && can_emit_spirit {
        Some(TurnEngineProjectionProfile::SpiritOpportunity)
    } else if can_emit_supermana {
        Some(TurnEngineProjectionProfile::SafeProgressOnly)
    } else if can_emit_opponent_mana && allow_spirit {
        Some(TurnEngineProjectionProfile::DrainerOpportunity)
    } else if can_emit_opponent_mana {
        Some(TurnEngineProjectionProfile::OpponentProgressOnly)
    } else if can_emit_spirit {
        Some(TurnEngineProjectionProfile::SpiritScoreOnly)
    } else {
        None
    };
    let tactical_flags = tactical_projection_flags(
        can_emit_supermana,
        can_emit_opponent_mana,
        can_emit_spirit,
        allow_spirit && can_emit_opponent_mana,
        can_emit_supermana || can_emit_spirit,
    );

    OracleWalkActorCapabilities {
        can_emit_supermana,
        can_emit_opponent_mana,
        can_emit_safety,
        can_emit_spirit,
        tactical_flags,
        projection_profile,
        needs_score_window: can_emit_supermana || can_emit_spirit,
    }
}

fn progress_priority_bonus(before: Option<i32>, after: Option<i32>) -> i32 {
    let before = before.unwrap_or(Config::BOARD_SIZE * 3);
    let after = after.unwrap_or(Config::BOARD_SIZE * 3);
    if after >= before {
        0
    } else {
        before.saturating_sub(after).saturating_mul(220)
    }
}

fn mana_tempo_seeds(game: &MonsGame, perspective: Color) -> Vec<ActionSeed> {
    if !game.player_can_move_mana() {
        return Vec::new();
    }
    if find_awake_drainer_location(&game.board, perspective).is_some() {
        return Vec::new();
    }
    let mut seeds = Vec::new();
    for (from, item) in game.board.occupied() {
        let Item::Mana { mana } = item else {
            continue;
        };
        if *mana != Mana::Regular(perspective) {
            continue;
        }
        for &to in from.nearby_locations_ref() {
            if !mana_move_destination_allowed(&game.board, to) {
                continue;
            }
            let own_before = distance_to_nearest_pool(from, perspective);
            let own_after = distance_to_nearest_pool(to, perspective);
            let opp_before = distance_to_nearest_pool(from, perspective.other());
            let opp_after = distance_to_nearest_pool(to, perspective.other());
            let own_gain = own_before.saturating_sub(own_after);
            let opp_gain = opp_before.saturating_sub(opp_after);
            if own_gain <= 0 || opp_gain > 0 {
                continue;
            }
            seeds.push(ActionSeed {
                family: TurnPlanFamily::ManaTempo,
                action: TurnAction::MoveMana { from, to },
                priority: 6_900 + own_gain.saturating_mul(200)
                    - opp_gain.max(0).saturating_mul(200),
            });
        }
    }
    seeds
}

impl TransitionCompilePool {
    fn new(game: &MonsGame, seeds: &[ActionSeed], config: TurnEngineConfig) -> Self {
        let limit = compile_limit_for_config(config);
        if checkpoint() {
            return Self {
                transitions: Vec::new(),
                limit,
                priority_locations: Vec::new(),
            };
        }
        let mut seen = HashSet::new();
        let mut priority_locations = Vec::new();
        for seed in seeds {
            for location in action_priority_locations(seed.action) {
                if seen.insert(location) {
                    priority_locations.push(location);
                }
            }
        }
        let mut transitions = MonsGameModel::enumerate_legal_transitions_with_priority(
            game,
            limit,
            SuggestedStartInputOptions::for_automove(),
            priority_locations.as_slice(),
        );
        if checkpoint() {
            transitions.clear();
        }
        Self {
            transitions,
            limit,
            priority_locations,
        }
    }

    fn expand(&mut self, game: &MonsGame) -> bool {
        if checkpoint()
            || self.transitions.len() < self.limit
            || self.limit >= TURN_ENGINE_COMPILE_LIMIT_MAX
        {
            return false;
        }
        let next_limit = (self.limit.saturating_mul(2)).min(TURN_ENGINE_COMPILE_LIMIT_MAX);
        if next_limit <= self.limit {
            return false;
        }
        let transitions = MonsGameModel::enumerate_legal_transitions_with_priority(
            game,
            next_limit,
            SuggestedStartInputOptions::for_automove(),
            self.priority_locations.as_slice(),
        );
        if checkpoint() {
            return false;
        }
        self.transitions = transitions;
        self.limit = next_limit;
        true
    }
}

fn compile_limit_for_config(config: TurnEngineConfig) -> usize {
    (config
        .own_seed_cap
        .max(config.opponent_seed_cap)
        .saturating_mul(12))
    .clamp(24, 96)
}

fn direct_inputs_for_action(action: TurnAction) -> Vec<Input> {
    match action {
        TurnAction::Walk { actor, to } | TurnAction::SafetyRetreat { actor, to } => {
            vec![Input::Location(actor), Input::Location(to)]
        }
        TurnAction::Attack { actor, target } | TurnAction::Bomb { actor, target } => {
            vec![Input::Location(actor), Input::Location(target)]
        }
        TurnAction::SpiritShift {
            actor,
            target,
            destination,
        } => vec![
            Input::Location(actor),
            Input::Location(target),
            Input::Location(destination),
        ],
        TurnAction::MoveMana { from, to } => vec![Input::Location(from), Input::Location(to)],
        TurnAction::ScoreCarry { actor, step, .. } => {
            vec![Input::Location(actor), Input::Location(step)]
        }
    }
}

fn compile_action_direct(
    game: &MonsGame,
    perspective: Color,
    action: TurnAction,
) -> Option<(MonsGame, Vec<Input>)> {
    if checkpoint() {
        return None;
    }
    let inputs = direct_inputs_for_action(action);
    let (after, events) =
        MonsGameModel::apply_inputs_for_search_with_events(game, inputs.as_slice())?;
    if checkpoint() {
        return None;
    }
    if !transition_matches_action(game, &after, events.as_slice(), perspective, action) {
        return None;
    }
    Some((after, inputs))
}

fn best_transition_for_action(
    game: &MonsGame,
    perspective: Color,
    action: TurnAction,
    transitions: &[LegalInputTransition],
) -> Option<(i32, usize)> {
    if checkpoint() {
        return None;
    }
    let mut best: Option<(i32, usize)> = None;
    for (index, transition) in transitions.iter().enumerate() {
        if checkpoint() {
            return None;
        }
        if !transition_matches_action(
            game,
            &transition.game,
            transition.events.as_slice(),
            perspective,
            action,
        ) {
            continue;
        }
        let score = transition_score(
            game,
            &transition.game,
            transition.events.as_slice(),
            perspective,
            action,
        );
        if best.as_ref().is_none_or(|(best_score, best_index)| {
            score > *best_score
                || (score == *best_score && transition.inputs < transitions[*best_index].inputs)
        }) {
            best = Some((score, index));
        }
    }
    best
}

fn compile_action_from_pool_fallback(
    game: &MonsGame,
    perspective: Color,
    action: TurnAction,
    compile_pool: &mut TransitionCompilePool,
) -> Option<(MonsGame, Vec<Input>)> {
    if checkpoint() {
        return None;
    }
    let mut best = best_transition_for_action(game, perspective, action, &compile_pool.transitions);
    if best.is_none() && compile_pool.expand(game) {
        best = best_transition_for_action(game, perspective, action, &compile_pool.transitions);
    }
    if checkpoint() {
        return None;
    }

    let (_, best_index) = best?;
    let best_transition = &compile_pool.transitions[best_index];

    Some((
        best_transition.game.clone_for_simulation(),
        best_transition.inputs.clone(),
    ))
}

fn compile_action_from_pool(
    game: &MonsGame,
    perspective: Color,
    action: TurnAction,
    compile_pool: &mut TransitionCompilePool,
) -> Option<(MonsGame, Vec<Input>)> {
    if checkpoint() {
        return None;
    }

    if let Some(compiled) = compile_action_direct(game, perspective, action) {
        return Some(compiled);
    }
    if cancelled() {
        return None;
    }

    let compiled = compile_action_from_pool_fallback(game, perspective, action, compile_pool)?;

    Some(compiled)
}

fn compile_action(
    game: &MonsGame,
    perspective: Color,
    action: TurnAction,
    config: TurnEngineConfig,
) -> Option<(MonsGame, Vec<Input>)> {
    if checkpoint() {
        return None;
    }

    if let Some(compiled) = compile_action_direct(game, perspective, action) {
        return Some(compiled);
    }
    if cancelled() {
        return None;
    }

    let seed = ActionSeed {
        family: TurnPlanFamily::ManaTempo,
        action,
        priority: 0,
    };
    let mut compile_pool = TransitionCompilePool::new(game, std::slice::from_ref(&seed), config);
    let compiled = compile_action_from_pool_fallback(game, perspective, action, &mut compile_pool)?;
    Some(compiled)
}

fn action_priority_locations(action: TurnAction) -> Vec<Location> {
    match action {
        TurnAction::Walk { actor, to } => vec![actor, to],
        TurnAction::Attack { actor, target } => vec![actor, target],
        TurnAction::SpiritShift {
            actor,
            target,
            destination,
        } => vec![actor, target, destination],
        TurnAction::Bomb { actor, target } => vec![actor, target],
        TurnAction::MoveMana { from, to } => vec![from, to],
        TurnAction::ScoreCarry { actor, step, .. } => vec![actor, step],
        TurnAction::SafetyRetreat { actor, to } => vec![actor, to],
    }
}

fn transition_matches_action(
    before: &MonsGame,
    after: &MonsGame,
    events: &[Event],
    perspective: Color,
    action: TurnAction,
) -> bool {
    match action {
        TurnAction::Walk { actor, to } => moved_actor_to(events, actor, to) && !events_include_non_walk_action(events),
        TurnAction::Attack { actor, target } => attack_events_match(events, actor, target, perspective),
        TurnAction::SpiritShift {
            actor,
            target,
            destination,
        } => events.iter().any(|event| {
            matches!(
                event,
                Event::SpiritTargetMove { by, from, to, .. }
                    if *by == actor && *from == target && *to == destination
            )
        }),
        TurnAction::Bomb { actor, target } => events.iter().any(|event| {
            matches!(
                event,
                Event::BombAttack { from, to, .. } if *from == actor && *to == target
            )
        }),
        TurnAction::MoveMana { from, to } => events.iter().any(|event| {
            matches!(event, Event::ManaMove { from: event_from, to: event_to, .. } if *event_from == from && *event_to == to)
        }),
        TurnAction::ScoreCarry { actor, wanted, step } => {
            moved_actor_to(events, actor, step)
                && (events.iter().any(|event| {
                    matches!(event, Event::ManaScored { mana, .. } if *mana == wanted)
                }) || actor_or_successor_carries(after, perspective, wanted))
        }
        TurnAction::SafetyRetreat { actor, to } => {
            moved_actor_to(events, actor, to)
                && own_drainer_safety_score(&after.board, perspective)
                    > own_drainer_safety_score(&before.board, perspective)
        }
    }
}

fn transition_score(
    before: &MonsGame,
    after: &MonsGame,
    events: &[Event],
    perspective: Color,
    action: TurnAction,
) -> i32 {
    let mut score = score_for_color(after, perspective)
        .saturating_sub(score_for_color(before, perspective))
        * 500;
    score += own_drainer_safety_score(&after.board, perspective).saturating_mul(180);
    if !opponent_can_win_immediately(before, perspective)
        && opponent_can_win_immediately(after, perspective)
    {
        score -= 2_200;
    }
    match action {
        TurnAction::Walk { actor, to } => {
            score += actor.distance(&to).saturating_mul(-20);
        }
        TurnAction::Attack { .. } => {
            if events_include_opponent_drainer_faint(events, perspective) {
                score += 1_600;
            }
            if events_include_any_faint(events, perspective) {
                score += 800;
            }
        }
        TurnAction::SpiritShift { .. } => {
            if events
                .iter()
                .any(|event| matches!(event, Event::ManaScored { .. }))
            {
                score += 1_000;
            }
            if events
                .iter()
                .any(|event| matches!(event, Event::SpiritTargetMove { .. }))
            {
                score += 600;
            }
        }
        TurnAction::Bomb { .. } => {
            if events_include_any_faint(events, perspective) {
                score += 1_000;
            }
        }
        TurnAction::MoveMana { from, to } => {
            score += distance_to_nearest_pool(from, perspective)
                .saturating_sub(distance_to_nearest_pool(to, perspective))
                .saturating_mul(160);
        }
        TurnAction::ScoreCarry { wanted, .. } => {
            score += wanted.score(perspective).saturating_mul(200);
        }
        TurnAction::SafetyRetreat { .. } => {
            score += own_drainer_safety_score(&after.board, perspective).saturating_mul(260);
        }
    }
    score
}

fn moved_actor_to(events: &[Event], actor: Location, to: Location) -> bool {
    events.iter().any(|event| match event {
        Event::MonMove {
            from, to: event_to, ..
        } => *from == actor && *event_to == to,
        Event::DemonAdditionalStep {
            from, to: event_to, ..
        } => *from == actor && *event_to == to,
        _ => false,
    })
}

fn attack_events_match(
    events: &[Event],
    actor: Location,
    target: Location,
    perspective: Color,
) -> bool {
    events.iter().any(|event| match event {
        Event::MysticAction { from, to, .. } | Event::DemonAction { from, to, .. } => {
            *from == actor && *to == target
        }
        Event::MonFainted { mon, to, .. } => mon.color == perspective.other() && *to == target,
        _ => false,
    })
}

fn actor_or_successor_carries(after: &MonsGame, perspective: Color, wanted: Mana) -> bool {
    after.board.occupied().any(|(_, item)| {
        matches!(
            item,
            Item::MonWithMana { mon, mana }
                if mon.color == perspective && !mon.is_fainted() && *mana == wanted
        )
    })
}

fn actor_can_attack_from_item(item: &Item) -> bool {
    match item {
        Item::Mon { mon } | Item::MonWithMana { mon, .. } | Item::MonWithConsumable { mon, .. } => {
            matches!(mon.kind, MonKind::Mystic | MonKind::Demon)
        }
        Item::Mana { .. } | Item::Consumable { .. } => false,
    }
}

fn actor_can_bomb_from_item(item: &Item) -> bool {
    matches!(
        item,
        Item::MonWithConsumable {
            mon,
            consumable: Consumable::Bomb,
        } if !mon.is_fainted()
    )
}

fn actor_can_attack_target_now(
    board: &Board,
    actor: Location,
    target: Location,
    item: &Item,
    perspective: Color,
) -> bool {
    if matches!(board.square(actor), Square::MonBase { .. }) {
        return false;
    }
    let Some(target_item) = board.item(target) else {
        return false;
    };
    let Some(target_mon) = target_item.mon() else {
        return false;
    };
    if target_mon.color != perspective.other() || target_mon.is_fainted() {
        return false;
    }
    if location_guarded_by_angel(board.find_awake_angel(perspective.other()), target) {
        return false;
    }
    match item {
        Item::Mon { mon } | Item::MonWithMana { mon, .. } | Item::MonWithConsumable { mon, .. } => {
            match mon.kind {
                MonKind::Mystic => actor.reachable_by_mystic_action_ref().contains(&target),
                MonKind::Demon => {
                    actor.reachable_by_demon_action_ref().contains(&target)
                        && demon_attack_path_clear(board, actor, target)
                }
                _ => false,
            }
        }
        Item::Mana { .. } | Item::Consumable { .. } => false,
    }
}

fn actor_can_bomb_target_now(
    board: &Board,
    actor: Location,
    target: Location,
    item: &Item,
    perspective: Color,
) -> bool {
    if !actor.reachable_by_bomb_ref().contains(&target) {
        return false;
    }
    let Item::MonWithConsumable {
        mon,
        consumable: Consumable::Bomb,
    } = item
    else {
        return false;
    };
    if mon.color != perspective || mon.is_fainted() {
        return false;
    }
    matches!(
        board.item(target),
        Some(
            Item::Mon { mon: target_mon }
            | Item::MonWithMana { mon: target_mon, .. }
            | Item::MonWithConsumable {
                mon: target_mon,
                ..
            }
        ) if target_mon.color == perspective.other() && !target_mon.is_fainted()
    )
}

fn location_guarded_by_angel(angel_location: Option<Location>, location: Location) -> bool {
    angel_location.is_some_and(|angel| angel.distance(&location) == 1)
}

fn demon_attack_path_clear(board: &Board, from: Location, target: Location) -> bool {
    let middle = from.location_between(&target);
    board.item(middle).is_none()
        && !matches!(
            board.square(middle),
            Square::SupermanaBase | Square::MonBase { .. }
        )
}

fn spirit_target_allowed(item: Item) -> bool {
    match item {
        Item::Mon { mon } | Item::MonWithMana { mon, .. } | Item::MonWithConsumable { mon, .. } => {
            !mon.is_fainted()
        }
        Item::Mana { .. } | Item::Consumable { .. } => true,
    }
}

fn spirit_destination_allowed(board: &Board, target_item: Item, destination: Location) -> bool {
    let destination_item = board.item(destination).copied();
    let destination_square = board.square(destination);
    let target_mon = target_item.mon().copied();
    let target_mana = target_item.mana().copied();

    let valid_destination = match destination_item {
        Some(Item::Mon {
            mon: destination_mon,
        }) => match target_item {
            Item::Mon { .. } | Item::MonWithMana { .. } | Item::MonWithConsumable { .. } => false,
            Item::Mana { .. } => {
                destination_mon.kind == MonKind::Drainer && !destination_mon.is_fainted()
            }
            Item::Consumable {
                consumable: Consumable::BombOrPotion,
            } => true,
            Item::Consumable { .. } => false,
        },
        Some(Item::Mana { .. }) => {
            matches!(target_mon, Some(mon) if mon.kind == MonKind::Drainer && !mon.is_fainted())
        }
        Some(Item::MonWithMana { .. }) | Some(Item::MonWithConsumable { .. }) => {
            matches!(
                target_item,
                Item::Consumable {
                    consumable: Consumable::BombOrPotion,
                }
            )
        }
        Some(Item::Consumable {
            consumable: Consumable::BombOrPotion,
        }) => matches!(
            target_item,
            Item::Mon { .. } | Item::MonWithMana { .. } | Item::MonWithConsumable { .. }
        ),
        Some(Item::Consumable { .. }) => false,
        None => true,
    };
    if !valid_destination {
        return false;
    }

    match destination_square {
        Square::Regular
        | Square::ConsumableBase
        | Square::ManaBase { .. }
        | Square::ManaPool { .. } => true,
        Square::SupermanaBase => {
            target_mana == Some(Mana::Supermana)
                || (target_mana.is_none()
                    && matches!(target_mon.map(|mon| mon.kind), Some(MonKind::Drainer)))
        }
        Square::MonBase { kind, color } => {
            matches!(target_mon, Some(mon) if mon.kind == kind && mon.color == color)
                && target_mana.is_none()
                && target_item.consumable().is_none()
        }
    }
}

fn mana_move_destination_allowed(board: &Board, destination: Location) -> bool {
    let item = board.item(destination);
    let square = board.square(destination);
    match item {
        Some(Item::Mon { mon }) => match square {
            Square::Regular
            | Square::ConsumableBase
            | Square::ManaBase { .. }
            | Square::ManaPool { .. } => mon.kind == MonKind::Drainer && !mon.is_fainted(),
            Square::SupermanaBase | Square::MonBase { .. } => false,
        },
        Some(Item::MonWithConsumable { .. })
        | Some(Item::Consumable { .. })
        | Some(Item::MonWithMana { .. })
        | Some(Item::Mana { .. }) => false,
        None => matches!(
            square,
            Square::Regular
                | Square::ConsumableBase
                | Square::ManaBase { .. }
                | Square::ManaPool { .. }
        ),
    }
}

fn nearest_wanted_mana_location(board: &Board, wanted: Mana) -> Option<Location> {
    board.occupied().find_map(|(location, item)| {
        matches!(item, Item::Mana { mana } if *mana == wanted).then_some(location)
    })
}

fn walk_destination_plausible(board: &Board, actor: Location, destination: Location) -> bool {
    let Some(actor_mon) = board.item(actor).and_then(|item| item.mon()).copied() else {
        return false;
    };
    match board.item(destination) {
        Some(Item::Mon { .. })
        | Some(Item::MonWithMana { .. })
        | Some(Item::MonWithConsumable { .. }) => false,
        Some(Item::Mana { .. }) | Some(Item::Consumable { .. }) | None => {
            match board.square(destination) {
                Square::Regular
                | Square::ConsumableBase
                | Square::ManaBase { .. }
                | Square::ManaPool { .. } => true,
                Square::SupermanaBase => actor_mon.kind == MonKind::Drainer,
                Square::MonBase { kind, color } => {
                    actor_mon.kind == kind && actor_mon.color == color
                }
            }
        }
    }
}

fn events_include_non_walk_action(events: &[Event]) -> bool {
    events.iter().any(|event| {
        matches!(
            event,
            Event::MysticAction { .. }
                | Event::DemonAction { .. }
                | Event::BombAttack { .. }
                | Event::SpiritTargetMove { .. }
        )
    })
}

fn events_include_any_faint(events: &[Event], perspective: Color) -> bool {
    events.iter().any(
        |event| matches!(event, Event::MonFainted { mon, .. } if mon.color == perspective.other()),
    )
}

fn events_include_opponent_drainer_faint(events: &[Event], perspective: Color) -> bool {
    events.iter().any(|event| {
        matches!(
            event,
            Event::MonFainted { mon, .. }
                if mon.color == perspective.other() && mon.kind == MonKind::Drainer
        )
    })
}

fn cached_step_if_legal(game: &MonsGame, config: TurnEngineConfig) -> Option<Vec<Input>> {
    if checkpoint() {
        return None;
    }
    let key = TurnEngineContinuationCacheKey {
        state_hash: MonsGameModel::search_state_hash(game),
        mode: config.mode,
        config_fingerprint: turn_engine_config_fingerprint(config),
    };
    TURN_ENGINE_CONTINUATION_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let cached = cache.get(&key).cloned();
        match cached {
            Some(inputs) => {
                let legal =
                    MonsGameModel::apply_inputs_for_search(game, inputs.as_slice()).is_some();
                if checkpoint() {
                    return None;
                }
                if legal {
                    Some(inputs)
                } else {
                    if cache_write_allowed() {
                        cache.remove(&key);
                    }
                    None
                }
            }
            None => None,
        }
    })
}

fn turn_engine_config_fingerprint(config: TurnEngineConfig) -> u64 {
    let mut hash = 1469598103934665603_u64;
    let mode_id = match config.mode {
        TurnEngineMode::ProV1 => 1_u64,
        TurnEngineMode::CurrentPro => 2_u64,
    };
    for value in [
        config.own_seed_cap as u64,
        config.own_beam as u64,
        config.per_node_family_cap as u64,
        config.step_cap as u64,
        config.opponent_seed_cap as u64,
        config.opponent_beam as u64,
        config.reply_seed_cap as u64,
        config.reply_beam as u64,
        config.expansion_cap as u64,
        config.enable_spirit_family as u64,
        mode_id,
        config.scoring_weights as *const ScoringWeights as usize as u64,
    ] {
        hash ^= value;
        hash = hash.wrapping_mul(1099511628211);
    }
    hash
}

fn register_plan_continuations(
    game: &MonsGame,
    perspective: Color,
    mode: TurnEngineMode,
    plan: &TurnPlan,
    config: TurnEngineConfig,
) {
    if checkpoint() || plan.compiled_chunks.is_empty() {
        return;
    }
    let mut state = game.clone_for_simulation();
    let start_color = game.active_color;
    for (chunk_index, chunk) in plan.compiled_chunks.iter().enumerate() {
        if checkpoint() {
            return;
        }
        if chunk_index > 0 && matches!(mode, TurnEngineMode::CurrentPro) {
            let Some(fresh_plan) = turn_engine_candidate_plan(&state, perspective, config) else {
                break;
            };
            if checkpoint() {
                return;
            }
            if fresh_plan.compiled_chunks.first() != Some(chunk) {
                break;
            }
        }
        let key = TurnEngineContinuationCacheKey {
            state_hash: MonsGameModel::search_state_hash(&state),
            mode,
            config_fingerprint: turn_engine_config_fingerprint(config),
        };
        if cache_write_allowed() {
            TURN_ENGINE_CONTINUATION_CACHE.with(|cache| {
                let mut cache = cache.borrow_mut();
                if cache.len() >= TURN_ENGINE_CACHE_MAX_ENTRIES && !cache.contains_key(&key) {
                    cache.clear();
                }
                cache.insert(key, chunk.clone());
            });
        } else {
            return;
        }
        let Some(next) = MonsGameModel::apply_inputs_for_search(&state, chunk.as_slice()) else {
            break;
        };
        if next.active_color != start_color {
            break;
        }
        state = next;
    }
}

fn compare_chunks(left: &[Vec<Input>], right: &[Vec<Input>]) -> Ordering {
    left.len().cmp(&right.len()).then_with(|| left.cmp(right))
}

fn winner_state(game: &MonsGame, perspective: Color) -> i32 {
    match game.winner_color() {
        Some(winner) if winner == perspective => 2,
        Some(_) => -2,
        None => 0,
    }
}

fn opponent_can_win_immediately(game: &MonsGame, perspective: Color) -> bool {
    if game.winner_color().is_some() || game.active_color != perspective.other() {
        return false;
    }
    let opponent = perspective.other();
    let needed = Config::TARGET_SCORE.saturating_sub(score_for_color(game, opponent));
    if needed <= 0 {
        return true;
    }
    active_turn_score_window(game, opponent) >= needed
}

fn score_for_color(game: &MonsGame, color: Color) -> i32 {
    if color == Color::White {
        game.white_score
    } else {
        game.black_score
    }
}

fn remaining_moves_for_color(game: &MonsGame, color: Color) -> i32 {
    if game.active_color == color {
        (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0)
    } else {
        Config::MONS_MOVES_PER_TURN
    }
}

fn distance_to_nearest_pool(location: Location, color: Color) -> i32 {
    Config::squares_ref()
        .iter()
        .filter_map(|(loc, square)| match square {
            Square::ManaPool { color: pool_color } if *pool_color == color => {
                Some(location.distance(loc))
            }
            _ => None,
        })
        .min()
        .unwrap_or(Config::BOARD_SIZE)
}

fn find_awake_drainer_location(board: &Board, color: Color) -> Option<Location> {
    board.occupied().find_map(|(location, item)| {
        let mon = item.mon()?;
        (mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted())
            .then_some(location)
    })
}

fn own_drainer_safety_score(board: &Board, color: Color) -> i32 {
    crate::models::automove_exact::exact_own_drainer_safety_score_with_hash(
        board,
        crate::models::automove_exact::exact_board_hash(board),
        color,
    )
}

fn opponent_drainer_kill_is_high_value(
    game: &MonsGame,
    perspective: Color,
    target_drainer: Location,
) -> bool {
    let opponent = perspective.other();
    if own_drainer_safety_score(&game.board, perspective) < 0 {
        return true;
    }
    if active_turn_score_window(game, opponent) > 0 {
        return true;
    }
    if score_for_color(game, opponent) >= Config::TARGET_SCORE - 2 {
        return true;
    }
    if matches!(
        game.board.item(target_drainer),
        Some(Item::MonWithMana { .. })
    ) {
        return true;
    }
    distance_to_nearest_pool(target_drainer, opponent) <= 3
}

fn own_drainer_carries_safe_mana(board: &Board, color: Color, wanted: Mana) -> bool {
    let Some(drainer_location) = find_awake_drainer_location(board, color) else {
        return false;
    };
    matches!(
        board.item(drainer_location),
        Some(Item::MonWithMana { mana, .. }) if *mana == wanted
    ) && is_drainer_exactly_safe_next_turn_on_board(board, color, drainer_location)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn game_with_items(
        items: Vec<(Location, Item)>,
        active_color: Color,
        turn_number: i32,
    ) -> MonsGame {
        let mut game = MonsGame::new(false, GameVariant::Classic);
        game.replace_board_items(items);
        game.active_color = active_color;
        game.actions_used_count = 0;
        game.mana_moves_count = 0;
        game.mons_moves_count = 0;
        game.turn_number = turn_number;
        game.white_score = 0;
        game.black_score = 0;
        game.white_potions_count = 0;
        game.black_potions_count = 0;
        game
    }

    fn engine_config() -> TurnEngineConfig {
        TurnEngineConfig {
            mode: TurnEngineMode::ProV1,
            own_seed_cap: 16,
            own_beam: 6,
            per_node_family_cap: 4,
            step_cap: 6,
            opponent_seed_cap: 8,
            opponent_beam: 3,
            reply_seed_cap: 4,
            reply_beam: 2,
            expansion_cap: 192,
            enable_spirit_family: true,
            scoring_weights: &DEFAULT_SCORING_WEIGHTS,
            enable_lazy_oracle_score_window_projection: false,
        }
    }

    fn current_pro_engine_config() -> TurnEngineConfig {
        TurnEngineConfig {
            mode: TurnEngineMode::CurrentPro,
            own_seed_cap: 14,
            own_beam: 5,
            per_node_family_cap: 4,
            step_cap: 6,
            opponent_seed_cap: 6,
            opponent_beam: 2,
            reply_seed_cap: 3,
            reply_beam: 1,
            expansion_cap: 176,
            enable_spirit_family: true,
            scoring_weights: &DEFAULT_SCORING_WEIGHTS,
            enable_lazy_oracle_score_window_projection: false,
        }
    }

    #[test]
    fn oracle_walk_actor_capabilities_skip_non_spirit_spirit_only_work() {
        let capabilities =
            oracle_walk_actor_capabilities(MonKind::Mystic, false, false, false, true);
        assert!(!capabilities.any_seed());
        assert_eq!(capabilities.tactical_flags, 0);
        assert_eq!(capabilities.projection_profile, None);
        assert!(!capabilities.needs_score_window);
    }

    #[test]
    fn oracle_walk_actor_capabilities_skip_spirit_only_opponent_progress_family() {
        let capabilities =
            oracle_walk_actor_capabilities(MonKind::Spirit, false, true, false, false);
        assert!(!capabilities.any_seed());
        assert_eq!(capabilities.tactical_flags, 0);
        assert_eq!(capabilities.projection_profile, None);
        assert!(!capabilities.needs_score_window);
    }

    #[test]
    fn oracle_walk_actor_capabilities_keep_non_spirit_spirit_denial_when_progress_allowed() {
        let capabilities =
            oracle_walk_actor_capabilities(MonKind::Mystic, false, true, false, true);
        assert!(capabilities.any_seed());
        assert!(!capabilities.can_emit_spirit);
        assert!(capabilities.can_emit_opponent_mana);
        assert_eq!(
            capabilities.tactical_flags,
            EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS
                | EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL
        );
        assert_eq!(
            capabilities.projection_profile,
            Some(TurnEngineProjectionProfile::DrainerOpportunity)
        );
        assert!(!capabilities.needs_score_window);
    }

    #[test]
    fn oracle_walk_actor_capabilities_keep_spirit_walks_score_only() {
        let capabilities = oracle_walk_actor_capabilities(MonKind::Spirit, true, true, false, true);
        assert!(capabilities.any_seed());
        assert!(capabilities.can_emit_spirit);
        assert!(!capabilities.can_emit_opponent_mana);
        assert_eq!(
            capabilities.tactical_flags,
            EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS
                | EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE
                | EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW
        );
        assert_eq!(
            capabilities.projection_profile,
            Some(TurnEngineProjectionProfile::SpiritOpportunity)
        );
        assert!(capabilities.needs_score_window);
    }

    #[test]
    fn oracle_walk_lazy_score_window_preserves_primary_spirit_setup_fixture() {
        let game = primary_spirit_setup_fixture();
        let eager = turn_engine_ranked_plan_digests_for_test(
            &game,
            Color::White,
            current_pro_engine_config(),
            8,
        );
        let mut lazy_config = current_pro_engine_config();
        lazy_config.enable_lazy_oracle_score_window_projection = true;
        let lazy = turn_engine_ranked_plan_digests_for_test(&game, Color::White, lazy_config, 8);

        assert!(!eager.is_empty());
        assert_eq!(lazy, eager);
    }

    #[test]
    fn oracle_walk_lazy_score_window_preserves_primary_pvs_fixture() {
        let game = primary_pvs_sensitive_search_fixture();
        let eager = turn_engine_ranked_plan_digests_for_test(
            &game,
            Color::Black,
            current_pro_engine_config(),
            8,
        );
        let mut lazy_config = current_pro_engine_config();
        lazy_config.enable_lazy_oracle_score_window_projection = true;
        let lazy = turn_engine_ranked_plan_digests_for_test(&game, Color::Black, lazy_config, 8);

        assert!(!eager.is_empty());
        assert_eq!(lazy, eager);
    }

    fn exhaustive_same_turn_reachable<F>(game: &MonsGame, color: Color, predicate: F) -> bool
    where
        F: Fn(&MonsGame, &[Event]) -> bool,
    {
        fn visit<F>(game: &MonsGame, color: Color, seen: &mut HashSet<u64>, predicate: &F) -> bool
        where
            F: Fn(&MonsGame, &[Event]) -> bool,
        {
            if game.active_color != color {
                return false;
            }
            let state_hash = MonsGameModel::search_state_hash(game);
            if !seen.insert(state_hash) {
                return false;
            }
            for transition in MonsGameModel::enumerate_legal_transitions(
                game,
                usize::MAX,
                SuggestedStartInputOptions::for_automove(),
            ) {
                if predicate(&transition.game, &transition.events) {
                    return true;
                }
                if transition.game.active_color == color
                    && visit(&transition.game, color, seen, predicate)
                {
                    return true;
                }
            }
            false
        }

        if predicate(game, &[]) {
            return true;
        }
        let mut seen = HashSet::new();
        visit(game, color, &mut seen, &predicate)
    }

    fn immediate_score_fixture() -> MonsGame {
        game_with_items(
            vec![
                (
                    Location::new(9, 1),
                    Item::MonWithMana {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                        mana: Mana::Regular(Color::White),
                    },
                ),
                (
                    Location::new(0, 10),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        )
    }

    fn safe_supermana_fixture() -> MonsGame {
        game_with_items(
            vec![
                (
                    Location::new(6, 5),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                    },
                ),
                (
                    Location::new(5, 5),
                    Item::Mana {
                        mana: Mana::Supermana,
                    },
                ),
                (
                    Location::new(0, 10),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        )
    }

    fn safe_opponent_mana_fixture() -> MonsGame {
        game_with_items(
            vec![
                (
                    Location::new(6, 5),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                    },
                ),
                (
                    Location::new(5, 4),
                    Item::Mana {
                        mana: Mana::Regular(Color::Black),
                    },
                ),
                (
                    Location::new(0, 10),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        )
    }

    fn spirit_impact_fixture() -> MonsGame {
        let mut game = game_with_items(
            vec![
                (
                    Location::new(5, 1),
                    Item::Mon {
                        mon: Mon::new(MonKind::Spirit, Color::White, 0),
                    },
                ),
                (
                    Location::new(7, 1),
                    Item::Mana {
                        mana: Mana::Regular(Color::Black),
                    },
                ),
                (
                    Location::new(0, 10),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        );
        game.mons_moves_count = Config::MONS_MOVES_PER_TURN - 2;
        game
    }

    fn primary_spirit_setup_fixture() -> MonsGame {
        game_with_items(
            vec![
                (
                    Location::new(9, 7),
                    Item::Mon {
                        mon: Mon::new(MonKind::Spirit, Color::White, 0),
                    },
                ),
                (
                    Location::new(9, 5),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                    },
                ),
                (
                    Location::new(7, 8),
                    Item::Mana {
                        mana: Mana::Regular(Color::Black),
                    },
                ),
                (
                    Location::new(0, 5),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        )
    }

    fn primary_pvs_sensitive_search_fixture() -> MonsGame {
        MonsGame::from_fen(
            "0 0 b 1 0 0 0 0 4 n05d0xa0xn04/n02xxmn01s0xn03e0xn02/n02y0xn08/n06xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMxxMxxMn01xxMn03/n11/n01E0xn03D0xxxMS0xn03/n04A0xn01Y0xn04/n11",
            false,
        )
        .expect("primary_pvs_sensitive_search_fixture: valid fen")
    }

    fn drainer_kill_fixture() -> MonsGame {
        let mut game = game_with_items(
            vec![
                (
                    Location::new(3, 2),
                    Item::Mon {
                        mon: Mon::new(MonKind::Mystic, Color::White, 0),
                    },
                ),
                (
                    Location::new(10, 5),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                    },
                ),
                (
                    Location::new(1, 0),
                    Item::MonWithMana {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                        mana: Mana::Regular(Color::Black),
                    },
                ),
            ],
            Color::White,
            2,
        );
        game.black_score = Config::TARGET_SCORE - 1;
        game
    }

    fn safety_recovery_fixture() -> MonsGame {
        let drainer = Location::new(5, 5);
        let probe_locations = [
            Location::new(6, 6),
            Location::new(6, 7),
            Location::new(7, 6),
            Location::new(7, 5),
            Location::new(5, 7),
            Location::new(4, 7),
            Location::new(7, 4),
            Location::new(6, 4),
        ];
        for kind in [MonKind::Mystic, MonKind::Demon] {
            for location in probe_locations {
                let game = game_with_items(
                    vec![
                        (
                            drainer,
                            Item::Mon {
                                mon: Mon::new(MonKind::Drainer, Color::White, 0),
                            },
                        ),
                        (
                            location,
                            Item::Mon {
                                mon: Mon::new(kind, Color::Black, 0),
                            },
                        ),
                        (
                            Location::new(0, 10),
                            Item::Mon {
                                mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                            },
                        ),
                    ],
                    Color::White,
                    2,
                );
                let before_safety = own_drainer_safety_score(&game.board, Color::White);
                if before_safety >= 0 {
                    continue;
                }
                let has_improving_move = MonsGameModel::enumerate_legal_transitions(
                    &game,
                    usize::MAX,
                    SuggestedStartInputOptions::for_automove(),
                )
                .into_iter()
                .any(|transition| {
                    transition.events.iter().any(
                        |event| matches!(event, Event::MonMove { from, .. } if *from == drainer),
                    ) && own_drainer_safety_score(&transition.game.board, Color::White)
                        > before_safety
                });
                if has_improving_move {
                    return game;
                }
            }
        }
        panic!("expected at least one deterministic safety-recovery fixture");
    }

    fn assert_plan_roundtrip(game: &MonsGame, plan: &TurnPlan) -> MonsGame {
        let mut state = game.clone_for_simulation();
        for chunk in plan.compiled_chunks.iter() {
            state = MonsGameModel::apply_inputs_for_search(&state, chunk.as_slice())
                .expect("compiled chunk should stay legal");
        }
        assert_eq!(
            plan.end_snapshot.state_hash,
            MonsGameModel::search_state_hash(&state)
        );
        state
    }

    #[test]
    fn turn_engine_finds_immediate_score_plan() {
        let game = immediate_score_fixture();
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("immediate score plan");
        assert_eq!(plan.goal_family, TurnPlanFamily::ImmediateScore);
        assert!(!plan.compiled_chunks.is_empty());
        let state = assert_plan_roundtrip(&game, &plan);
        assert!(state.white_score > game.white_score);
    }

    #[test]
    fn turn_engine_finds_safe_supermana_progress_plan() {
        let game = safe_supermana_fixture();
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("supermana progress plan");
        assert!(
            matches!(
                plan.head_family,
                TurnPlanFamily::SafeSupermanaProgress | TurnPlanFamily::ImmediateScore
            ),
            "family={:?}",
            plan.head_family
        );
        let state = assert_plan_roundtrip(&game, &plan);
        assert!(
            state.white_score > 0
                || state.board.occupied().any(|(_, item)| {
                    matches!(
                        item,
                        Item::MonWithMana { mon, mana }
                            if mon.color == Color::White
                                && mon.kind == MonKind::Drainer
                                && *mana == Mana::Supermana
                    )
                })
        );
    }

    #[test]
    fn turn_engine_finds_safe_opponent_mana_progress_plan() {
        let game = safe_opponent_mana_fixture();
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("opponent mana progress plan");
        assert!(
            matches!(
                plan.head_family,
                TurnPlanFamily::SafeOpponentManaProgress | TurnPlanFamily::ImmediateScore
            ),
            "family={:?}",
            plan.head_family
        );
        let state = assert_plan_roundtrip(&game, &plan);
        assert!(
            state.white_score >= Mana::Regular(Color::Black).score(Color::White)
                || state.board.occupied().any(|(_, item)| {
                    matches!(
                        item,
                        Item::MonWithMana { mon, mana }
                            if mon.color == Color::White
                                && mon.kind == MonKind::Drainer
                                && *mana == Mana::Regular(Color::Black)
                    )
                })
        );
    }

    #[test]
    fn turn_engine_finds_spirit_impact_plan() {
        let game = spirit_impact_fixture();
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("spirit impact plan");
        assert_eq!(plan.head_family, TurnPlanFamily::SpiritImpact);
        assert!(plan
            .actions
            .iter()
            .any(|action| matches!(action, TurnAction::SpiritShift { .. })));
    }

    #[test]
    fn turn_engine_matches_primary_spirit_setup_fixture() {
        let game = primary_spirit_setup_fixture();
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("primary spirit setup plan");
        assert_eq!(plan.head_family, TurnPlanFamily::SpiritImpact);
        assert_eq!(
            plan.compiled_chunks.first(),
            Some(&vec![
                Input::Location(Location::new(9, 7)),
                Input::Location(Location::new(7, 8)),
                Input::Location(Location::new(7, 7)),
            ]),
        );
        assert_plan_roundtrip(&game, &plan);
    }

    #[test]
    fn turn_engine_generate_turn_plans_retains_leaf_nodes_on_pvs_fixture() {
        let game = primary_pvs_sensitive_search_fixture();
        let plans = generate_turn_plans(&game, Color::Black, engine_config(), 16, 6, 7, 192)
            .expect("pvs fixture should produce at least one multi-step or terminal leaf plan");
        assert!(
            !plans.is_empty(),
            "pvs fixture should not collapse to no-plan inside the main generator"
        );
    }

    #[test]
    fn turn_engine_finds_drainer_kill_or_deny_plan() {
        let game = drainer_kill_fixture();
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("drainer kill or deny plan");
        assert!(
            matches!(
                plan.head_family,
                TurnPlanFamily::DenyOpponentWindow | TurnPlanFamily::DrainerKill
            ),
            "family={:?}",
            plan.head_family
        );
        let state = assert_plan_roundtrip(&game, &plan);
        let opponent_drainer_alive =
            find_awake_drainer_location(&state.board, Color::Black).is_some();
        assert!(
            !opponent_drainer_alive
                || active_turn_score_window(&state, Color::Black)
                    < active_turn_score_window(&game, Color::Black),
            "plan should either remove the drainer or reduce the immediate scoring window"
        );
    }

    #[test]
    fn turn_engine_finds_drainer_safety_recovery_plan() {
        let game = safety_recovery_fixture();
        let before_safety = own_drainer_safety_score(&game.board, Color::White);
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("safety recovery plan");
        assert!(
            matches!(
                plan.head_family,
                TurnPlanFamily::DrainerSafetyRecovery | TurnPlanFamily::DenyOpponentWindow
            ),
            "family={:?}",
            plan.head_family
        );
        let state = assert_plan_roundtrip(&game, &plan);
        assert!(own_drainer_safety_score(&state.board, Color::White) > before_safety);
    }

    #[test]
    fn turn_engine_oracle_matches_safe_supermana_progress_fixture() {
        let game = safe_supermana_fixture();
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config());
        let exhaustive = exhaustive_same_turn_reachable(&game, Color::White, |state, events| {
            events.iter().any(
                |event| matches!(event, Event::ManaScored { mana, .. } if *mana == Mana::Supermana),
            ) || state.board.occupied().any(|(_, item)| {
                matches!(
                    item,
                    Item::MonWithMana { mon, mana }
                        if mon.color == Color::White
                            && mon.kind == MonKind::Drainer
                            && *mana == Mana::Supermana
                )
            })
        });
        assert_eq!(plan.is_some(), exhaustive);
    }

    #[test]
    fn turn_engine_compiled_chunks_roundtrip_to_planned_snapshot() {
        for game in [
            immediate_score_fixture(),
            safe_supermana_fixture(),
            safe_opponent_mana_fixture(),
            spirit_impact_fixture(),
            drainer_kill_fixture(),
            safety_recovery_fixture(),
        ] {
            let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
                .expect("fixture should yield a plan");
            assert_plan_roundtrip(&game, &plan);
        }
    }

    #[test]
    fn turn_engine_direct_compile_walk_roundtrips() {
        let game = safe_supermana_fixture();
        let action = TurnAction::Walk {
            actor: Location::new(6, 5),
            to: Location::new(5, 5),
        };
        let (after, inputs) = compile_action_direct(&game, Color::White, action)
            .expect("walk should compile directly");
        assert_eq!(
            inputs,
            vec![
                Input::Location(Location::new(6, 5)),
                Input::Location(Location::new(5, 5)),
            ]
        );
        let roundtrip = MonsGameModel::apply_inputs_for_search(&game, inputs.as_slice())
            .expect("compiled walk should stay legal");
        assert_eq!(
            MonsGameModel::search_state_hash(&after),
            MonsGameModel::search_state_hash(&roundtrip)
        );
    }

    #[test]
    fn turn_engine_direct_compile_spirit_shift_roundtrips() {
        let game = primary_spirit_setup_fixture();
        let action = TurnAction::SpiritShift {
            actor: Location::new(9, 7),
            target: Location::new(7, 8),
            destination: Location::new(7, 7),
        };
        let (after, inputs) = compile_action_direct(&game, Color::White, action)
            .expect("spirit shift should compile directly");
        assert_eq!(
            inputs,
            vec![
                Input::Location(Location::new(9, 7)),
                Input::Location(Location::new(7, 8)),
                Input::Location(Location::new(7, 7)),
            ]
        );
        let roundtrip = MonsGameModel::apply_inputs_for_search(&game, inputs.as_slice())
            .expect("compiled spirit shift should stay legal");
        assert_eq!(
            MonsGameModel::search_state_hash(&after),
            MonsGameModel::search_state_hash(&roundtrip)
        );
    }

    #[test]
    fn current_pro_builds_multi_chunk_black_opening_macro_plan() {
        let game = MonsGame::from_fen(
            "1 0 b 1 0 0 0 0 4 n07e0xn03/n03y0xn01s0xa0xn04/n05d0mn01xxmn03/n02xxmn08/n05xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n11/n05S0xn01xxMn03/n05A0xn02Y0xn02/D0xn01E0xn08",
            false,
        )
        .expect("primary black opening ply19 fen should be valid");
        let plan = turn_engine_best_plan_for_test(&game, Color::Black, current_pro_engine_config())
            .expect("current Pro macro plan");
        assert_eq!(
            plan.compiled_chunks.first(),
            Some(&vec![
                Input::Location(Location::new(2, 5)),
                Input::Location(Location::new(2, 6)),
            ]),
        );
        assert!(
            plan.compiled_chunks.len() >= 4,
            "expected a whole-turn macro bundle"
        );
        assert_eq!(plan.goal_family, TurnPlanFamily::ImmediateScore);
        assert_plan_roundtrip(&game, &plan);
    }

    #[test]
    fn current_pro_plan_cache_replays_remaining_chunks() {
        clear_turn_engine_plan_cache();
        let game = game_with_items(
            vec![
                (
                    Location::new(8, 2),
                    Item::MonWithMana {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                        mana: Mana::Regular(Color::White),
                    },
                ),
                (
                    Location::new(0, 10),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        );
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("cacheable plan");
        assert!(plan.compiled_chunks.len() >= 2, "need multi-step plan");
        let first =
            turn_engine_next_inputs(&game, Color::White, TurnEngineMode::ProV1, engine_config())
                .expect("first chunk");
        assert_eq!(first, plan.compiled_chunks[0]);
        let after_first = MonsGameModel::apply_inputs_for_search(&game, first.as_slice())
            .expect("first chunk legal");
        let second = turn_engine_next_inputs(
            &after_first,
            Color::White,
            TurnEngineMode::ProV1,
            engine_config(),
        )
        .expect("second chunk");
        assert_eq!(second, plan.compiled_chunks[1]);
    }

    #[test]
    fn turn_engine_allowed_heads_selects_matching_subset_head() {
        clear_turn_engine_plan_cache();
        let game = primary_pvs_sensitive_search_fixture();
        let config = engine_config();
        let mut plans = generate_plans_for_mode(
            &game,
            Color::Black,
            config,
            config.own_seed_cap,
            config.own_beam,
            config.step_cap,
            config.expansion_cap,
        )
        .expect("pvs fixture should produce plans");
        for plan in plans.iter_mut() {
            plan.utility = evaluate_plan_with_replies(&game, plan, Color::Black, config);
        }
        plans.sort_by(|a, b| compare_plans(b, a));

        let mut unique_heads = Vec::<Vec<Input>>::new();
        for plan in plans.iter() {
            let Some(head) = plan.compiled_chunks.first() else {
                continue;
            };
            if !unique_heads.iter().any(|existing| existing == head) {
                unique_heads.push(head.clone());
            }
            if unique_heads.len() >= 2 {
                break;
            }
        }
        assert!(
            unique_heads.len() >= 2,
            "expected at least two distinct first chunks on the pvs fixture"
        );

        let allowed = vec![unique_heads[1].clone()];
        let plan = turn_engine_candidate_plan_from_allowed_heads(
            &game,
            Color::Black,
            config,
            allowed.as_slice(),
        )
        .expect("allowed-head constrained plan");
        assert_eq!(plan.compiled_chunks.first(), Some(&allowed[0]));
        assert_plan_roundtrip(&game, &plan);
    }

    #[test]
    fn allowed_head_compare_prefers_safe_first_step_over_better_rank() {
        let game = safe_supermana_fixture();
        let make_plan = |eval_score: i32, inputs: Vec<Input>| TurnPlan {
            actions: vec![],
            compiled_chunks: vec![inputs],
            end_game: game.clone_for_simulation(),
            #[cfg(test)]
            end_snapshot: TurnSnapshot::from_game(&game),
            utility: TurnEngineUtility::from_components_for_test(0, 0, 0, 0, 0, 0, eval_score),
            head_utility: TurnEngineUtility::from_components_for_test(0, 0, 0, 0, 0, 0, eval_score),
            head_family: TurnPlanFamily::ManaTempo,
            goal_family: TurnPlanFamily::ManaTempo,
            package_meta: TurnPackageMeta::default(),
        };

        let safer = make_plan(
            100,
            vec![
                Input::Location(Location::new(6, 5)),
                Input::Location(Location::new(5, 5)),
            ],
        );
        let riskier = make_plan(
            100,
            vec![
                Input::Location(Location::new(6, 5)),
                Input::Location(Location::new(6, 4)),
            ],
        );

        let safer_meta = AllowedHeadSelectionMeta {
            rank: 2,
            allowed_len: 4,
            first_step_opponent_immediate_loss: false,
            first_step_drainer_safety: 1,
        };
        let riskier_meta = AllowedHeadSelectionMeta {
            rank: 0,
            allowed_len: 4,
            first_step_opponent_immediate_loss: true,
            first_step_drainer_safety: -2,
        };

        assert_eq!(
            compare_allowed_head_plans(&safer, safer_meta, &riskier, riskier_meta),
            Ordering::Greater
        );
    }

    #[test]
    fn allowed_head_compare_prefers_earlier_rank_when_other_axes_tie() {
        let game = safe_supermana_fixture();
        let make_plan = |inputs: Vec<Input>| TurnPlan {
            actions: vec![],
            compiled_chunks: vec![inputs],
            end_game: game.clone_for_simulation(),
            #[cfg(test)]
            end_snapshot: TurnSnapshot::from_game(&game),
            utility: TurnEngineUtility::from_components_for_test(0, 0, 0, 0, 0, 0, 100),
            head_utility: TurnEngineUtility::from_components_for_test(0, 0, 0, 0, 0, 0, 100),
            head_family: TurnPlanFamily::ManaTempo,
            goal_family: TurnPlanFamily::ManaTempo,
            package_meta: TurnPackageMeta::default(),
        };

        let earlier = make_plan(vec![
            Input::Location(Location::new(6, 5)),
            Input::Location(Location::new(6, 4)),
        ]);
        let later = make_plan(vec![
            Input::Location(Location::new(6, 5)),
            Input::Location(Location::new(5, 5)),
        ]);

        let earlier_meta = AllowedHeadSelectionMeta {
            rank: 0,
            allowed_len: 4,
            first_step_opponent_immediate_loss: false,
            first_step_drainer_safety: 0,
        };
        let later_meta = AllowedHeadSelectionMeta {
            rank: 2,
            allowed_len: 4,
            first_step_opponent_immediate_loss: false,
            first_step_drainer_safety: 0,
        };

        assert_eq!(
            compare_allowed_head_plans(&earlier, earlier_meta, &later, later_meta),
            Ordering::Greater
        );
    }

    #[test]
    fn turn_engine_allowed_heads_replay_cached_continuation() {
        clear_turn_engine_plan_cache();
        let game = game_with_items(
            vec![
                (
                    Location::new(8, 2),
                    Item::MonWithMana {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                        mana: Mana::Regular(Color::White),
                    },
                ),
                (
                    Location::new(0, 10),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        );
        let plan = turn_engine_best_plan_for_test(&game, Color::White, engine_config())
            .expect("cacheable plan");
        assert!(plan.compiled_chunks.len() >= 2, "need multi-step plan");

        let first = turn_engine_next_inputs_from_allowed_heads(
            &game,
            Color::White,
            TurnEngineMode::ProV1,
            engine_config(),
            &[plan.compiled_chunks[0].clone()],
        )
        .expect("first chunk");
        assert_eq!(first, plan.compiled_chunks[0]);
        let after_first = MonsGameModel::apply_inputs_for_search(&game, first.as_slice())
            .expect("first chunk legal");
        let second = turn_engine_next_inputs_from_allowed_heads(
            &after_first,
            Color::White,
            TurnEngineMode::ProV1,
            engine_config(),
            &[plan.compiled_chunks[1].clone()],
        )
        .expect("second chunk");
        assert_eq!(second, plan.compiled_chunks[1]);
    }

    #[test]
    fn turn_engine_cache_invalidates_on_diverged_state() {
        clear_turn_engine_plan_cache();
        let game = game_with_items(
            vec![
                (
                    Location::new(8, 2),
                    Item::MonWithMana {
                        mon: Mon::new(MonKind::Drainer, Color::White, 0),
                        mana: Mana::Regular(Color::White),
                    },
                ),
                (
                    Location::new(4, 4),
                    Item::Mon {
                        mon: Mon::new(MonKind::Mystic, Color::Black, 0),
                    },
                ),
                (
                    Location::new(0, 10),
                    Item::Mon {
                        mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                    },
                ),
            ],
            Color::White,
            2,
        );

        let first =
            turn_engine_next_inputs(&game, Color::White, TurnEngineMode::ProV1, engine_config())
                .expect("first chunk");
        let after_first = MonsGameModel::apply_inputs_for_search(&game, first.as_slice())
            .expect("first chunk legal");

        let mut diverged = after_first.clone_for_simulation();
        let diverged_items = diverged
            .board
            .occupied()
            .filter_map(|(location, item)| {
                if location == Location::new(4, 4) {
                    None
                } else {
                    Some((location, *item))
                }
            })
            .chain(std::iter::once((
                Location::new(4, 5),
                Item::Mon {
                    mon: Mon::new(MonKind::Mystic, Color::Black, 0),
                },
            )))
            .collect::<Vec<_>>();
        diverged.replace_board_items(diverged_items);

        assert!(turn_engine_cached_step(&diverged, engine_config()).is_none());
        let _ = turn_engine_next_inputs(
            &diverged,
            Color::White,
            TurnEngineMode::ProV1,
            engine_config(),
        );
    }

    #[test]
    fn turn_engine_expired_deadline_discards_plans_and_frontiers() {
        clear_turn_engine_plan_cache();
        let game = immediate_score_fixture();
        let config = engine_config();

        crate::models::automove_deadline::with_test_clock(0.0, || {
            crate::models::automove_deadline::with_deadline_if_absent(0.0, || {
                assert!(turn_engine_candidate_plan(&game, Color::White, config).is_none());
                assert!(turn_engine_candidate_plan_live(&game, Color::White, config).is_none());
                assert!(matches!(
                    generate_turn_plans(&game, Color::White, config, 8, 4, 4, 64),
                    Err(PlanBuildStatus::BudgetExceeded)
                ));
            });
        });

        assert!(TURN_ENGINE_BEST_PLAN_CACHE.with(|cache| cache.borrow().is_empty()));
        assert!(TURN_ENGINE_NO_PLAN_CACHE.with(|cache| cache.borrow().is_empty()));
    }

    #[test]
    fn turn_engine_expired_deadline_blocks_every_runtime_cache_write() {
        clear_turn_engine_plan_cache();
        let game = immediate_score_fixture();
        let config = engine_config();

        crate::models::automove_deadline::with_test_clock(0.0, || {
            crate::models::automove_deadline::with_deadline_if_absent(0.0, || {
                assert_eq!(
                    evaluate_state_utility(&game, &game, Color::White, config),
                    TurnEngineUtility::default()
                );
                let _ = turn_oracle_context(&game, Color::White);
                turn_engine_store_cached_step(
                    &game,
                    TurnEngineMode::ProV1,
                    config,
                    &[Input::Location(Location::new(0, 0))],
                );
                let mut memo = TurnEngineProjectionMemo::default();
                let _ = memo.projection(
                    &game,
                    Color::White,
                    MonsGameModel::search_state_hash(&game),
                    TurnEngineProjectionProfile::SpiritScoreOnly,
                );
                assert!(memo.entries.is_empty());
            });
        });

        assert!(TURN_ENGINE_CONTINUATION_CACHE.with(|cache| cache.borrow().is_empty()));
        assert!(TURN_ENGINE_ORACLE_CACHE.with(|cache| cache.borrow().is_empty()));
        assert!(TURN_ENGINE_UTILITY_CACHE.with(|cache| cache.borrow().is_empty()));
        assert!(TURN_ENGINE_BEST_PLAN_CACHE.with(|cache| cache.borrow().is_empty()));
        assert!(TURN_ENGINE_NO_PLAN_CACHE.with(|cache| cache.borrow().is_empty()));
    }
}
