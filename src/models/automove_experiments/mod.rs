#![cfg(test)]

use super::*;
use crate::models::scoring::{evaluate_preferability_with_weights, DEFAULT_SCORING_WEIGHTS};
use rand::rngs::StdRng;
use rand::{Rng, SeedableRng};
use std::env;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

type AutomoveSelector = fn(&MonsGame, AutomoveSearchConfig) -> Vec<Input>;

const OPENING_RANDOM_PLIES_MAX: usize = 6;
pub(super) const SMART_PRO_RELIABILITY_WIN_RATE_MIN: f64 = 0.90;
pub(super) const SMART_PRO_RELIABILITY_CONFIDENCE_MIN: f64 = 0.99;
pub(super) const SMART_PRO_RELIABILITY_MOVE_AVG_MS_MAX: f64 = 700.0;
pub(super) const SMART_PRO_RELIABILITY_VARIANT_WIN_RATE_FLOOR: f64 = 0.50;
// Stronger pro candidates may also be cheaper than the current runtime; keep a
// floor that preserves a meaningful pro budget without blocking genuinely stronger
// but cheaper search configurations (e.g. breadth-over-depth wins).
pub(super) const SMART_PRO_CPU_RATIO_TARGET_MIN: f64 = 0.50;
// The shipped guarded ProV2 runtime spends materially more budget than the
// legacy search-only Pro path on mixed boards, but still stays well inside the
// absolute per-move cap. Keep this high enough to avoid rejecting that shipped
// profile on machine-local timing noise while still catching runaway CPU growth.
pub(super) const SMART_PRO_CPU_RATIO_TARGET_MAX: f64 = 15.00;
pub(super) const SMART_STAGE1_CPU_RATIO_MAX_FAST: f64 = 1.30;
pub(super) const SMART_STAGE1_CPU_RATIO_MAX_NORMAL: f64 = 1.30;
pub(super) const SMART_STAGE1_CPU_RATIO_MAX_PRO: f64 = 1.30;
pub(super) const SMART_EXACT_LITE_CACHE_HIT_RATE_MIN: f64 = 0.20;

#[derive(Debug, Clone, Copy)]
struct SearchBudget {
    label: &'static str,
    depth: i32,
    max_nodes: i32,
}

impl SearchBudget {
    fn from_preference(preference: SmartAutomovePreference) -> Self {
        let (depth, max_nodes) = preference.depth_and_max_nodes();
        Self {
            label: preference.as_api_value(),
            depth,
            max_nodes,
        }
    }

    pub(super) fn key(self) -> &'static str {
        self.label
    }

    fn runtime_config_for_game(self, game: &MonsGame) -> AutomoveSearchConfig {
        if let Some(preference) = SmartAutomovePreference::from_api_value(self.label) {
            MonsGameModel::shipping_search_config_for_game(game, preference)
        } else {
            MonsGameModel::with_runtime_scoring_weights(
                game,
                AutomoveSearchConfig::from_budget(self.depth, self.max_nodes).for_runtime(),
            )
        }
    }
}

fn client_budgets() -> [SearchBudget; 2] {
    [
        SearchBudget::from_preference(SmartAutomovePreference::Fast),
        SearchBudget::from_preference(SmartAutomovePreference::Normal),
    ]
}

fn pro_budget() -> SearchBudget {
    SearchBudget::from_preference(SmartAutomovePreference::Pro)
}

#[derive(Clone, Copy)]
struct AutomoveModel {
    select_inputs: AutomoveSelector,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
struct MatchupStats {
    wins: usize,
    losses: usize,
    draws: usize,
}

impl MatchupStats {
    fn record(&mut self, result: MatchResult) {
        match result {
            MatchResult::ProfileAWin => self.wins += 1,
            MatchResult::ProfileBWin => self.losses += 1,
            MatchResult::Draw => self.draws += 1,
        }
    }

    fn merge(&mut self, other: MatchupStats) {
        self.wins += other.wins;
        self.losses += other.losses;
        self.draws += other.draws;
    }

    fn total_games(&self) -> usize {
        self.wins + self.losses + self.draws
    }

    fn decisive_games(&self) -> usize {
        self.wins + self.losses
    }

    fn win_rate_points(&self) -> f64 {
        let total = self.total_games();
        if total == 0 {
            0.5
        } else {
            (self.wins as f64 + 0.5 * self.draws as f64) / total as f64
        }
    }

    fn confidence_better_than_even(&self) -> f64 {
        let decisive_games = self.decisive_games();
        if decisive_games == 0 || self.wins <= self.losses {
            return 0.0;
        }
        let p_value = one_sided_binomial_p_value(self.wins, decisive_games);
        (1.0_f64 - p_value).clamp(0.0, 1.0)
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq)]
struct DuelTimingStats {
    profile_a_total_ms: f64,
    profile_b_total_ms: f64,
    profile_a_turns: usize,
    profile_b_turns: usize,
}

impl DuelTimingStats {
    fn record_profile_a_turn(&mut self, elapsed_ms: f64) {
        self.profile_a_total_ms += elapsed_ms;
        self.profile_a_turns += 1;
    }

    fn record_profile_b_turn(&mut self, elapsed_ms: f64) {
        self.profile_b_total_ms += elapsed_ms;
        self.profile_b_turns += 1;
    }

    fn merge(&mut self, other: DuelTimingStats) {
        self.profile_a_total_ms += other.profile_a_total_ms;
        self.profile_b_total_ms += other.profile_b_total_ms;
        self.profile_a_turns += other.profile_a_turns;
        self.profile_b_turns += other.profile_b_turns;
    }

    fn profile_a_avg_ms(&self) -> f64 {
        self.profile_a_total_ms / self.profile_a_turns.max(1) as f64
    }

    fn profile_b_avg_ms(&self) -> f64 {
        self.profile_b_total_ms / self.profile_b_turns.max(1) as f64
    }
}

#[derive(Debug, Clone, Default)]
struct VariantTimedMatchupStats {
    variant: GameVariant,
    matchup: MatchupStats,
    timing: DuelTimingStats,
}

impl VariantTimedMatchupStats {
    fn merge(&mut self, other: VariantTimedMatchupStats) {
        self.matchup.merge(other.matchup);
        self.timing.merge(other.timing);
    }
}

#[derive(Debug, Clone, Default)]
struct TimedMatchupStats {
    matchup: MatchupStats,
    timing: DuelTimingStats,
    per_variant: Vec<VariantTimedMatchupStats>,
}

impl TimedMatchupStats {
    fn record_for_variant(
        &mut self,
        variant: GameVariant,
        result: MatchResult,
        timing: DuelTimingStats,
    ) {
        self.matchup.record(result);
        self.timing.merge(timing);
        let variant_stats = self.variant_stats_mut(variant);
        variant_stats.matchup.record(result);
        variant_stats.timing.merge(timing);
    }

    fn merge(&mut self, other: TimedMatchupStats) {
        self.matchup.merge(other.matchup);
        self.timing.merge(other.timing);
        for variant_stats in other.per_variant {
            self.variant_stats_mut(variant_stats.variant)
                .merge(variant_stats);
        }
    }

    fn variant_stats_mut(&mut self, variant: GameVariant) -> &mut VariantTimedMatchupStats {
        if let Some(index) = self
            .per_variant
            .iter()
            .position(|variant_stats| variant_stats.variant == variant)
        {
            return &mut self.per_variant[index];
        }
        self.per_variant.push(VariantTimedMatchupStats {
            variant,
            matchup: MatchupStats::default(),
            timing: DuelTimingStats::default(),
        });
        self.per_variant
            .last_mut()
            .expect("just pushed variant stats")
    }

    fn per_variant_stats(&self) -> Vec<&VariantTimedMatchupStats> {
        let mut stats = self.per_variant.iter().collect::<Vec<_>>();
        stats.sort_by_key(|variant_stats| variant_stats.variant.id());
        stats
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MatchResult {
    ProfileAWin,
    ProfileBWin,
    Draw,
}

#[derive(Clone, Copy)]
struct ModeSpeedStat {
    budget: SearchBudget,
    avg_ms: f64,
}

mod harness;
mod profiles;
#[cfg(test)]
mod tests;

use self::harness::one_sided_binomial_p_value;
