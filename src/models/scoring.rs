use crate::*;
use std::cell::{OnceCell, RefCell};
use std::mem::MaybeUninit;

const PROTECTED_HIGH_VALUE_CARRIER_SAFE_DANGER_MIN: i32 = 3;
const PROTECTED_HIGH_VALUE_CARRIER_SUPERMANA_SCALE_BP: i32 = 2_500;
const PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_MANA_SCALE_BP: i32 = 2_500;
const PROTECTED_HIGH_VALUE_CARRIER_VIRTUAL_SCORE_BP_MAX: i32 = 9_200;
const PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_SCORE_MARGIN: i32 = 2;
const SCORING_MAX_MANA_ENTRIES: usize = 11;
const SCORING_MAX_LIVE_MONS_PER_COLOR: usize = 5;
const SCORING_MAX_DRAINERS_PER_COLOR: usize = 1;
const SCORING_MAX_ANGELS_PER_COLOR: usize = 1;
const SCORING_MAX_DANGER_SOURCES_PER_COLOR: usize = 5;
const SCORING_MAX_LOOSE_CONSUMABLES: usize = 2;

#[derive(Default)]
struct AttackReachSummaryMemo {
    entries: Vec<(
        ScoringAttackReachSummaryKey,
        crate::models::automove_exact::AttackReachSummary,
    )>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScoringDangerSource {
    location: Location,
    legacy_plain_threat: bool,
    exact_action_threat: bool,
    exact_bomb_threat: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScoringManaEntry {
    location: Location,
    mana: Mana,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScoringManaCarrierEntry {
    location: Location,
    mana: Mana,
}

struct InlineCopyList<T: Copy, const N: usize> {
    len: usize,
    items: [MaybeUninit<T>; N],
    spill: Option<Vec<T>>,
}

impl<T: Copy, const N: usize> InlineCopyList<T, N> {
    #[inline]
    fn push(&mut self, value: T) {
        if let Some(spill) = &mut self.spill {
            spill.push(value);
            self.len += 1;
            return;
        }

        if self.len < N {
            self.items[self.len].write(value);
            self.len += 1;
            return;
        }

        let mut spill = Vec::with_capacity(N.saturating_mul(2).max(N + 1));
        spill.extend_from_slice(self.inline_slice());
        spill.push(value);
        self.len += 1;
        self.spill = Some(spill);
    }

    #[inline]
    fn as_slice(&self) -> &[T] {
        self.spill.as_deref().unwrap_or_else(|| self.inline_slice())
    }

    #[inline]
    fn iter(&self) -> std::slice::Iter<'_, T> {
        self.as_slice().iter()
    }

    #[inline]
    fn inline_slice(&self) -> &[T] {
        unsafe { std::slice::from_raw_parts(self.items.as_ptr() as *const T, self.len) }
    }
}

impl<T: Copy, const N: usize> Default for InlineCopyList<T, N> {
    fn default() -> Self {
        Self {
            len: 0,
            items: std::array::from_fn(|_| MaybeUninit::uninit()),
            spill: None,
        }
    }
}

impl<T: Copy + std::fmt::Debug, const N: usize> std::fmt::Debug for InlineCopyList<T, N> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_list().entries(self.iter()).finish()
    }
}

impl<T: Copy + PartialEq, const N: usize> PartialEq for InlineCopyList<T, N> {
    fn eq(&self, other: &Self) -> bool {
        self.as_slice() == other.as_slice()
    }
}

impl<T: Copy + Eq, const N: usize> Eq for InlineCopyList<T, N> {}

impl<'a, T: Copy, const N: usize> IntoIterator for &'a InlineCopyList<T, N> {
    type Item = &'a T;
    type IntoIter = std::slice::Iter<'a, T>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

#[inline]
fn scoring_danger_source_flags(item: &Item, mon: Mon) -> (bool, bool, bool) {
    let legacy_plain_threat = !matches!(item, Item::MonWithMana { .. })
        && (mon.kind == MonKind::Mystic
            || mon.kind == MonKind::Demon
            || matches!(item, Item::MonWithConsumable { .. }));
    let exact_action_threat = mon.kind == MonKind::Mystic || mon.kind == MonKind::Demon;
    let exact_bomb_threat = matches!(
        item,
        Item::MonWithConsumable {
            consumable: Consumable::Bomb,
            ..
        }
    );
    (legacy_plain_threat, exact_action_threat, exact_bomb_threat)
}

#[derive(Debug, PartialEq, Eq, Default)]
struct ScoringBoardSummary {
    mana_entries: InlineCopyList<ScoringManaEntry, SCORING_MAX_MANA_ENTRIES>,
    live_mana_carriers:
        [InlineCopyList<ScoringManaCarrierEntry, SCORING_MAX_LIVE_MONS_PER_COLOR>; 2],
    live_mon_locations: [InlineCopyList<Location, SCORING_MAX_LIVE_MONS_PER_COLOR>; 2],
    live_drainer_locations: [InlineCopyList<Location, SCORING_MAX_DRAINERS_PER_COLOR>; 2],
    live_angel_locations: [InlineCopyList<Location, SCORING_MAX_ANGELS_PER_COLOR>; 2],
    danger_sources: [InlineCopyList<ScoringDangerSource, SCORING_MAX_DANGER_SOURCES_PER_COLOR>; 2],
    loose_consumable_locations: InlineCopyList<Location, SCORING_MAX_LOOSE_CONSUMABLES>,
    regular_mana_move_scores: [i32; 2],
    regular_mana_score_path_steps: [Option<i32>; 2],
}

impl ScoringBoardSummary {
    fn from_board(board: &Board) -> Self {
        let mut summary = Self::default();

        for (index, item) in board.items.iter().enumerate() {
            let Some(item) = *item else { continue };
            let location = Location::from_index(index);
            match item {
                Item::Mana { mana } => {
                    let score_steps = distance(location, Destination::AnyClosestPool) - 1;
                    summary
                        .mana_entries
                        .push(ScoringManaEntry { location, mana });
                    if let Mana::Regular(color) = mana {
                        let slot = color_slot(color);
                        summary.regular_mana_score_path_steps[slot] = Some(
                            summary.regular_mana_score_path_steps[slot]
                                .map_or(score_steps + 1, |best| best.min(score_steps + 1)),
                        );
                        if score_steps <= 1 {
                            summary.regular_mana_move_scores[slot] = mana.score(color);
                        }
                    }
                }
                Item::Mon { mon }
                | Item::MonWithMana { mon, .. }
                | Item::MonWithConsumable { mon, .. } => {
                    if mon.is_fainted() {
                        continue;
                    }
                    let color_slot = color_slot(mon.color);
                    if let Item::MonWithMana { mana, .. } = item {
                        summary.live_mana_carriers[color_slot]
                            .push(ScoringManaCarrierEntry { location, mana });
                    }
                    summary.live_mon_locations[color_slot].push(location);
                    if mon.kind == MonKind::Drainer {
                        summary.live_drainer_locations[color_slot].push(location);
                    }
                    if mon.kind == MonKind::Angel {
                        summary.live_angel_locations[color_slot].push(location);
                    }

                    let (legacy_plain_threat, exact_action_threat, exact_bomb_threat) =
                        scoring_danger_source_flags(&item, mon);
                    let danger = ScoringDangerSource {
                        location,
                        legacy_plain_threat,
                        exact_action_threat,
                        exact_bomb_threat,
                    };
                    if danger.legacy_plain_threat
                        || danger.exact_action_threat
                        || danger.exact_bomb_threat
                    {
                        summary.danger_sources[color_slot].push(danger);
                    }
                }
                Item::Consumable { .. } => {
                    summary.loose_consumable_locations.push(location);
                }
            }
        }

        summary
    }

    #[inline]
    fn regular_mana_move_score(&self, color: Color) -> i32 {
        self.regular_mana_move_scores[color_slot(color)]
    }

    #[inline]
    fn regular_mana_score_path_steps(&self, color: Color) -> Option<i32> {
        self.regular_mana_score_path_steps[color_slot(color)]
    }
}

#[derive(Debug, Clone, Copy)]
struct DrainerSafetySnapshot {
    risk_danger: i32,
    min_mana: i32,
    angel_nearby: bool,
    exact_danger_threat: bool,
    walk_threat: bool,
}

impl DrainerSafetySnapshot {
    #[inline]
    fn exact_safe(self) -> bool {
        !self.exact_danger_threat && !self.walk_threat
    }

    #[inline]
    fn guarded_against_exact_attack(self) -> bool {
        self.angel_nearby && !self.exact_danger_threat
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ScoringAttackReachSummaryKey {
    query: crate::models::automove_exact::AttackReachSummaryKey,
    drainer_targets_only: bool,
}

pub(crate) struct ScoringEvalContext {
    board_hash: u64,
    allow_exact_strategic: bool,
    board_summary: OnceCell<ScoringBoardSummary>,
    mana_path_snapshot: OnceCell<ManaPathSnapshot>,
    exact_analysis: OnceCell<ExactStrategicAnalysis>,
    enable_attack_reach_summary: bool,
    enable_attack_reach_target_narrowing: bool,
    enable_attack_reach_drainer_target_narrowing: bool,
    attack_reach_targets: OnceCell<[Vec<Location>; 2]>,
    drainer_attack_targets: OnceCell<[Vec<Location>; 2]>,
    drainer_immediate_threat_memo: RefCell<[Option<(i32, i32)>; BOARD_CELLS * 2]>,
    attack_reach_summary_memo: RefCell<AttackReachSummaryMemo>,
}

impl ScoringEvalContext {
    pub(crate) fn new(game: &MonsGame, allow_exact_strategic: bool) -> Self {
        Self::new_with_flags(game, allow_exact_strategic, false, false, false)
    }

    pub(crate) fn new_with_flags(
        game: &MonsGame,
        allow_exact_strategic: bool,
        enable_attack_reach_summary: bool,
        enable_attack_reach_target_narrowing: bool,
        enable_attack_reach_drainer_target_narrowing: bool,
    ) -> Self {
        Self {
            board_hash: crate::models::automove_exact::exact_board_hash(&game.board),
            allow_exact_strategic,
            board_summary: OnceCell::new(),
            mana_path_snapshot: OnceCell::new(),
            exact_analysis: OnceCell::new(),
            enable_attack_reach_summary,
            enable_attack_reach_target_narrowing,
            enable_attack_reach_drainer_target_narrowing,
            attack_reach_targets: OnceCell::new(),
            drainer_attack_targets: OnceCell::new(),
            drainer_immediate_threat_memo: RefCell::new([None; BOARD_CELLS * 2]),
            attack_reach_summary_memo: RefCell::new(AttackReachSummaryMemo::default()),
        }
    }

    #[inline]
    fn board_hash(&self) -> u64 {
        self.board_hash
    }

    #[inline]
    fn board_summary(&self, board: &Board) -> &ScoringBoardSummary {
        self.board_summary
            .get_or_init(|| ScoringBoardSummary::from_board(board))
    }

    #[inline]
    fn board_summary_if_enabled(&self, board: &Board) -> Option<&ScoringBoardSummary> {
        Some(self.board_summary(board))
    }

    #[inline]
    fn mana_path_snapshot(&self, board: &Board) -> &ManaPathSnapshot {
        let board_summary = self.board_summary(board);
        self.mana_path_snapshot
            .get_or_init(|| ManaPathSnapshot::from_summary(board_summary))
    }

    #[inline]
    fn exact_analysis(&self, game: &MonsGame) -> Option<ExactStrategicAnalysis> {
        self.allow_exact_strategic.then(|| {
            *self
                .exact_analysis
                .get_or_init(|| exact_strategic_analysis(game))
        })
    }

    #[inline]
    fn attack_reach_targets(&self, board: &Board, target_color: Color) -> &[Location] {
        let targets = self.attack_reach_targets.get_or_init(|| {
            [
                crate::models::automove_exact::attack_reach_summary_target_locations(
                    board,
                    Color::White,
                ),
                crate::models::automove_exact::attack_reach_summary_target_locations(
                    board,
                    Color::Black,
                ),
            ]
        });
        if target_color == Color::White {
            targets[0].as_slice()
        } else {
            targets[1].as_slice()
        }
    }

    #[inline]
    fn drainer_attack_targets(&self, board: &Board, target_color: Color) -> &[Location] {
        let targets = self.drainer_attack_targets.get_or_init(|| {
            [
                board
                    .occupied()
                    .filter_map(|(location, item)| {
                        item.mon()
                            .filter(|mon| mon.color == Color::White && mon.kind == MonKind::Drainer)
                            .map(|_| location)
                    })
                    .collect(),
                board
                    .occupied()
                    .filter_map(|(location, item)| {
                        item.mon()
                            .filter(|mon| mon.color == Color::Black && mon.kind == MonKind::Drainer)
                            .map(|_| location)
                    })
                    .collect(),
            ]
        });
        if target_color == Color::White {
            targets[0].as_slice()
        } else {
            targets[1].as_slice()
        }
    }

    fn attack_reach_summary(
        &self,
        board: &Board,
        attacker_color: Color,
        target_color: Color,
        remaining_moves: i32,
        can_use_action: bool,
        drainer_targets_only: bool,
    ) -> crate::models::automove_exact::AttackReachSummary {
        let key = ScoringAttackReachSummaryKey {
            query: crate::models::automove_exact::AttackReachSummaryKey {
                board_hash: self.board_hash,
                attacker_color,
                target_color,
                remaining_moves,
                can_use_action,
            },
            drainer_targets_only,
        };
        if let Some((_, summary)) = self
            .attack_reach_summary_memo
            .borrow()
            .entries
            .iter()
            .find(|(cached_key, _)| *cached_key == key)
        {
            return *summary;
        }

        let summary = if drainer_targets_only {
            crate::models::automove_exact::attack_reach_summary_for_targets_with_hash(
                board,
                self.board_hash,
                attacker_color,
                remaining_moves,
                can_use_action,
                self.drainer_attack_targets(board, target_color),
            )
        } else if self.enable_attack_reach_target_narrowing {
            crate::models::automove_exact::attack_reach_summary_for_targets_with_hash(
                board,
                self.board_hash,
                attacker_color,
                remaining_moves,
                can_use_action,
                self.attack_reach_targets(board, target_color),
            )
        } else {
            crate::models::automove_exact::attack_reach_summary_with_hash(
                board,
                self.board_hash,
                attacker_color,
                target_color,
                remaining_moves,
                can_use_action,
            )
        };
        self.attack_reach_summary_memo
            .borrow_mut()
            .entries
            .push((key, summary));
        summary
    }

    fn drainer_immediate_threats(
        &self,
        board: &Board,
        color: Color,
        location: Location,
    ) -> (i32, i32) {
        if self.enable_attack_reach_summary {
            return self
                .attack_reach_summary(
                    board,
                    color.other(),
                    color,
                    0,
                    true,
                    self.enable_attack_reach_drainer_target_narrowing,
                )
                .immediate_threats(location);
        }

        let memo_index = location.index()
            + if color == Color::Black {
                BOARD_CELLS
            } else {
                0
            };
        if let Some(cached) = self.drainer_immediate_threat_memo.borrow()[memo_index] {
            return cached;
        }

        let threats = crate::models::automove_exact::drainer_immediate_threats_with_hash(
            board,
            color,
            location,
            self.board_hash,
        );
        self.drainer_immediate_threat_memo.borrow_mut()[memo_index] = Some(threats);
        threats
    }

    pub(crate) fn can_attack_target_on_board(
        &self,
        board: &Board,
        attacker_color: Color,
        target_color: Color,
        target: Location,
        remaining_moves: i32,
        can_use_action: bool,
    ) -> bool {
        if self.enable_attack_reach_summary {
            let use_drainer_targets_only = self.enable_attack_reach_drainer_target_narrowing
                && board
                    .item(target)
                    .and_then(|item| item.mon())
                    .is_some_and(|mon| mon.color == target_color && mon.kind == MonKind::Drainer);
            if use_drainer_targets_only {
                return self
                    .attack_reach_summary(
                        board,
                        attacker_color,
                        target_color,
                        remaining_moves,
                        can_use_action,
                        true,
                    )
                    .can_attack_target(target);
            }
            if !self.enable_attack_reach_drainer_target_narrowing {
                return self
                    .attack_reach_summary(
                        board,
                        attacker_color,
                        target_color,
                        remaining_moves,
                        can_use_action,
                        false,
                    )
                    .can_attack_target(target);
            }
        }

        crate::models::automove_exact::can_attack_target_on_board_with_hash(
            board,
            self.board_hash,
            attacker_color,
            target_color,
            target,
            remaining_moves,
            can_use_action,
        )
    }
}

#[derive(Debug, Clone, Copy)]
pub struct ScoringWeights {
    pub use_legacy_formula: bool,
    pub include_regular_mana_move_windows: bool,
    pub include_match_point_window: bool,
    pub next_turn_window_scale_bp: i32,
    pub double_confirmed_score: bool,
    pub confirmed_score: i32,
    pub fainted_mon: i32,
    pub fainted_drainer: i32,
    pub fainted_cooldown_step: i32,
    pub drainer_at_risk: i32,
    pub mana_close_to_same_pool: i32,
    pub mon_with_mana_close_to_any_pool: i32,
    pub extra_for_supermana: i32,
    pub extra_for_opponents_mana: i32,
    pub drainer_close_to_mana: i32,
    pub drainer_holding_mana: i32,
    pub drainer_close_to_own_pool: i32,
    pub drainer_close_to_supermana: i32,
    pub mon_close_to_center: i32,
    pub spirit_close_to_enemy: i32,
    pub spirit_on_own_base_penalty: i32,
    pub angel_guarding_drainer: i32,
    pub angel_close_to_friendly_drainer: i32,
    pub has_consumable: i32,
    pub active_mon: i32,
    pub regular_mana_to_owner_pool: i32,
    pub regular_mana_drainer_control: i32,
    pub supermana_drainer_control: i32,
    pub supermana_race_control: i32,
    pub opponent_mana_denial: i32,
    pub mana_carrier_at_risk: i32,
    pub mana_carrier_guarded: i32,
    pub mana_carrier_one_step_from_pool: i32,
    pub supermana_carrier_one_step_from_pool_extra: i32,
    pub immediate_winning_carrier: i32,
    pub drainer_best_mana_path: i32,
    pub drainer_pickup_score_this_turn: i32,
    pub mana_carrier_score_this_turn: i32,
    pub drainer_immediate_threat: i32,
    pub score_race_path_progress: i32,
    pub opponent_score_race_path_progress: i32,
    pub score_race_multi_path: i32,
    pub opponent_score_race_multi_path: i32,
    pub immediate_score_window: i32,
    pub opponent_immediate_score_window: i32,
    pub immediate_score_multi_window: i32,
    pub opponent_immediate_score_multi_window: i32,
    pub spirit_action_utility: i32,
    pub drainer_danger_boolean: i32,
    pub mana_carrier_danger_boolean: i32,
    pub drainer_walk_threat_boolean: i32,
    pub mana_carrier_walk_threat_boolean: i32,
    pub opponent_drainer_attack_bonus: i32,
    pub attacker_close_to_opponent_drainer: i32,
}

pub const DEFAULT_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    use_legacy_formula: true,
    include_regular_mana_move_windows: false,
    include_match_point_window: false,
    next_turn_window_scale_bp: 5_000,
    double_confirmed_score: true,
    confirmed_score: 1000,
    fainted_mon: -500,
    fainted_drainer: -800,
    fainted_cooldown_step: 0,
    drainer_at_risk: -350,
    mana_close_to_same_pool: 500,
    mon_with_mana_close_to_any_pool: 800,
    extra_for_supermana: 120,
    extra_for_opponents_mana: 100,
    drainer_close_to_mana: 300,
    drainer_holding_mana: 350,
    drainer_close_to_own_pool: 180,
    drainer_close_to_supermana: 120,
    mon_close_to_center: 210,
    spirit_close_to_enemy: 160,
    spirit_on_own_base_penalty: 180,
    angel_guarding_drainer: 180,
    angel_close_to_friendly_drainer: 120,
    has_consumable: 110,
    active_mon: 50,
    regular_mana_to_owner_pool: 0,
    regular_mana_drainer_control: 0,
    supermana_drainer_control: 0,
    supermana_race_control: 0,
    opponent_mana_denial: 0,
    mana_carrier_at_risk: 0,
    mana_carrier_guarded: 0,
    mana_carrier_one_step_from_pool: 0,
    supermana_carrier_one_step_from_pool_extra: 0,
    immediate_winning_carrier: 0,
    drainer_best_mana_path: 0,
    drainer_pickup_score_this_turn: 0,
    mana_carrier_score_this_turn: 0,
    drainer_immediate_threat: 0,
    score_race_path_progress: 0,
    opponent_score_race_path_progress: 0,
    score_race_multi_path: 0,
    opponent_score_race_multi_path: 0,
    immediate_score_window: 0,
    opponent_immediate_score_window: 0,
    immediate_score_multi_window: 0,
    opponent_immediate_score_multi_window: 0,
    spirit_action_utility: 0,
    drainer_danger_boolean: 0,
    mana_carrier_danger_boolean: 0,
    drainer_walk_threat_boolean: 0,
    mana_carrier_walk_threat_boolean: 0,
    opponent_drainer_attack_bonus: 0,
    attacker_close_to_opponent_drainer: 0,
};

pub const BALANCED_DISTANCE_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    use_legacy_formula: true,
    include_regular_mana_move_windows: false,
    include_match_point_window: false,
    next_turn_window_scale_bp: 5_000,
    double_confirmed_score: true,
    confirmed_score: 1000,
    fainted_mon: -520,
    fainted_drainer: -900,
    fainted_cooldown_step: -80,
    drainer_at_risk: -420,
    mana_close_to_same_pool: 520,
    mon_with_mana_close_to_any_pool: 820,
    extra_for_supermana: 130,
    extra_for_opponents_mana: 120,
    drainer_close_to_mana: 330,
    drainer_holding_mana: 370,
    drainer_close_to_own_pool: 280,
    drainer_close_to_supermana: 180,
    mon_close_to_center: 180,
    spirit_close_to_enemy: 220,
    spirit_on_own_base_penalty: 180,
    angel_guarding_drainer: 280,
    angel_close_to_friendly_drainer: 180,
    has_consumable: 105,
    active_mon: 45,
    regular_mana_to_owner_pool: 0,
    regular_mana_drainer_control: 0,
    supermana_drainer_control: 0,
    supermana_race_control: 0,
    opponent_mana_denial: 0,
    mana_carrier_at_risk: 0,
    mana_carrier_guarded: 0,
    mana_carrier_one_step_from_pool: 160,
    supermana_carrier_one_step_from_pool_extra: 80,
    immediate_winning_carrier: 0,
    drainer_best_mana_path: 0,
    drainer_pickup_score_this_turn: 0,
    mana_carrier_score_this_turn: 0,
    drainer_immediate_threat: 0,
    score_race_path_progress: 0,
    opponent_score_race_path_progress: 0,
    score_race_multi_path: 0,
    opponent_score_race_multi_path: 0,
    immediate_score_window: 0,
    opponent_immediate_score_window: 0,
    immediate_score_multi_window: 0,
    opponent_immediate_score_multi_window: 0,
    spirit_action_utility: 0,
    drainer_danger_boolean: 0,
    mana_carrier_danger_boolean: 0,
    drainer_walk_threat_boolean: 0,
    mana_carrier_walk_threat_boolean: 0,
    opponent_drainer_attack_bonus: 0,
    attacker_close_to_opponent_drainer: 0,
};

pub const MANA_RACE_LITE_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    regular_mana_to_owner_pool: 150,
    regular_mana_drainer_control: 15,
    supermana_drainer_control: 26,
    mana_carrier_at_risk: -150,
    mana_carrier_guarded: 70,
    drainer_close_to_own_pool: 290,
    drainer_close_to_supermana: 200,
    angel_guarding_drainer: 290,
    mana_close_to_same_pool: 420,
    fainted_cooldown_step: -70,
    mana_carrier_one_step_from_pool: 220,
    supermana_carrier_one_step_from_pool_extra: 120,
    immediate_winning_carrier: 0,
    ..BALANCED_DISTANCE_SCORING_WEIGHTS
};

pub const FINISHER_BALANCED_SOFT_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    mana_carrier_one_step_from_pool: 220,
    supermana_carrier_one_step_from_pool_extra: 110,
    immediate_winning_carrier: 360,
    ..BALANCED_DISTANCE_SCORING_WEIGHTS
};

pub const FINISHER_BALANCED_SOFT_AGGRESSIVE_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    mana_carrier_one_step_from_pool: 250,
    supermana_carrier_one_step_from_pool_extra: 130,
    immediate_winning_carrier: 540,
    ..BALANCED_DISTANCE_SCORING_WEIGHTS
};

pub const MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    regular_mana_to_owner_pool: 170,
    regular_mana_drainer_control: 18,
    mana_close_to_same_pool: 380,
    drainer_close_to_own_pool: 320,
    mana_carrier_at_risk: -210,
    mana_carrier_guarded: 95,
    mana_carrier_one_step_from_pool: 260,
    supermana_carrier_one_step_from_pool_extra: 150,
    immediate_winning_carrier: 300,
    ..MANA_RACE_LITE_SCORING_WEIGHTS
};

pub const TACTICAL_BALANCED_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    fainted_cooldown_step: -120,
    spirit_close_to_enemy: 230,
    angel_guarding_drainer: 300,
    mana_carrier_at_risk: -200,
    mana_carrier_guarded: 110,
    mana_carrier_one_step_from_pool: 240,
    supermana_carrier_one_step_from_pool_extra: 150,
    ..BALANCED_DISTANCE_SCORING_WEIGHTS
};

pub const TACTICAL_BALANCED_AGGRESSIVE_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    fainted_cooldown_step: -160,
    mana_carrier_at_risk: -260,
    mana_carrier_guarded: 140,
    mana_carrier_one_step_from_pool: 320,
    supermana_carrier_one_step_from_pool_extra: 220,
    spirit_close_to_enemy: 250,
    angel_guarding_drainer: 320,
    ..TACTICAL_BALANCED_SCORING_WEIGHTS
};

pub const RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    use_legacy_formula: false,
    confirmed_score: 920,
    drainer_best_mana_path: 250,
    drainer_pickup_score_this_turn: 210,
    mana_carrier_score_this_turn: 290,
    drainer_immediate_threat: -220,
    score_race_path_progress: 165,
    opponent_score_race_path_progress: 150,
    score_race_multi_path: 60,
    opponent_score_race_multi_path: 90,
    immediate_score_window: 240,
    opponent_immediate_score_window: 220,
    immediate_score_multi_window: 80,
    opponent_immediate_score_multi_window: 120,
    spirit_action_utility: 56,
    drainer_close_to_mana: 360,
    drainer_holding_mana: 430,
    mana_carrier_at_risk: -285,
    mana_carrier_guarded: 145,
    mana_carrier_one_step_from_pool: 320,
    supermana_carrier_one_step_from_pool_extra: 210,
    immediate_winning_carrier: 520,
    ..MANA_RACE_LITE_D2_TUNED_SCORING_WEIGHTS
};

pub const RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS_POTION_PREF: ScoringWeights =
    ScoringWeights {
        has_consumable: 320,
        spirit_action_utility: 72,
        ..RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS
    };

pub const RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS: ScoringWeights = ScoringWeights {
    drainer_danger_boolean: -400,
    mana_carrier_danger_boolean: -300,
    supermana_race_control: 30,
    ..RUNTIME_FAST_DRAINER_CONTEXT_SCORING_WEIGHTS
};

pub const RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS_POTION_PREF: ScoringWeights =
    ScoringWeights {
        has_consumable: 320,
        spirit_action_utility: 72,
        ..RUNTIME_FAST_BOOLEAN_DRAINER_SCORING_WEIGHTS
    };

pub(crate) fn evaluate_preferability_with_weights_and_exact_policy(
    game: &MonsGame,
    color: Color,
    weights: &ScoringWeights,
    allow_exact_strategic: bool,
) -> i32 {
    let context = ScoringEvalContext::new(game, allow_exact_strategic);
    evaluate_preferability_with_context(game, color, weights, allow_exact_strategic, &context)
}

pub(crate) fn evaluate_preferability_with_context(
    game: &MonsGame,
    color: Color,
    weights: &ScoringWeights,
    allow_exact_strategic: bool,
    context: &ScoringEvalContext,
) -> i32 {
    let mut effective_weights = *weights;
    if !allow_exact_strategic {
        effective_weights.use_legacy_formula = true;
    }
    let weights = &effective_weights;
    let use_legacy_formula = weights.use_legacy_formula;
    let include_regular_mana_move_windows =
        weights.include_regular_mana_move_windows && !use_legacy_formula;
    let include_match_point_window = weights.include_match_point_window && !use_legacy_formula;
    let next_turn_window_scale_bp = weights.next_turn_window_scale_bp.clamp(0, 20_000);
    let supermana_base = game.board.supermana_base();
    let remaining_mon_moves_for_active =
        (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0);
    let exact_analysis = if use_legacy_formula {
        None
    } else {
        context.exact_analysis(game)
    };
    let my_exact_summary = exact_analysis.map(|analysis| analysis.color_summary(color));
    let opponent_exact_summary =
        exact_analysis.map(|analysis| analysis.color_summary(color.other()));

    let mons_bases = Config::mons_bases_ref();
    let my_score_now = if color == Color::White {
        game.white_score
    } else {
        game.black_score
    };
    let opponent_score_now = if color == Color::White {
        game.black_score
    } else {
        game.white_score
    };
    let offense_scale_bp = 10_000;
    let defense_scale_bp = 10_000;

    let mut score = match color {
        Color::White => {
            (game.white_score - game.black_score) * weights.confirmed_score
                + (game.white_potions_count - game.black_potions_count) * weights.has_consumable
        }
        Color::Black => {
            (game.black_score - game.white_score) * weights.confirmed_score
                + (game.black_potions_count - game.white_potions_count) * weights.has_consumable
        }
    };

    if weights.double_confirmed_score {
        score *= weights.confirmed_score;
    }

    for (location, item) in game.board.occupied() {
        match item {
            Item::Mon { mon } => {
                let my_mon_multiplier = if mon.color == color { 1 } else { -1 };
                let is_drainer = mon.kind == MonKind::Drainer;

                if mon.is_fainted() {
                    score += my_mon_multiplier
                        * (if is_drainer {
                            weights.fainted_drainer
                        } else {
                            weights.fainted_mon
                        });
                    score += my_mon_multiplier * weights.fainted_cooldown_step * mon.cooldown;
                } else if is_drainer {
                    let safety = drainer_safety_snapshot_with_context(
                        &game.board,
                        mon.color,
                        location,
                        use_legacy_formula,
                        weights.drainer_walk_threat_boolean != 0,
                        Some(context),
                    );
                    score += my_mon_multiplier * weights.drainer_close_to_mana / safety.min_mana;
                    score += my_mon_multiplier * weights.drainer_close_to_own_pool
                        / distance(location, Destination::ClosestPool(mon.color));
                    score += my_mon_multiplier * weights.drainer_close_to_supermana
                        / distance_to_location(location, supermana_base);
                    if !safety.guarded_against_exact_attack() {
                        score += my_mon_multiplier * weights.drainer_at_risk / safety.risk_danger;
                    } else {
                        score += my_mon_multiplier * weights.angel_guarding_drainer;
                    }

                    if let Some(path) = if use_legacy_formula {
                        best_drainer_pickup_path_with_snapshot(
                            context.mana_path_snapshot(&game.board),
                            mon.color,
                            location,
                        )
                        .map(|(path_steps, mana_value)| (path_steps, path_steps + 1, mana_value))
                    } else {
                        exact_analysis
                            .expect("exact strategic analysis should be available")
                            .color_summary(mon.color)
                            .best_drainer_pickup
                            .map(|path| (path.path_steps, path.total_moves, path.mana_value))
                    } {
                        let (path_steps, total_moves, mana_value) = path;
                        score += my_mon_multiplier * weights.drainer_best_mana_path * mana_value
                            / (path_steps + 1);
                        if mon.color == game.active_color
                            && total_moves <= remaining_mon_moves_for_active
                        {
                            score += my_mon_multiplier
                                * weights.drainer_pickup_score_this_turn
                                * mana_value;
                        }
                    }

                    if weights.drainer_immediate_threat != 0 {
                        let (action_threats, bomb_threats) = drainer_immediate_threats_with_context(
                            &game.board,
                            mon.color,
                            location,
                            use_legacy_formula,
                            Some(context),
                        );
                        let immediate_threats = if safety.angel_nearby {
                            bomb_threats
                        } else {
                            action_threats + bomb_threats
                        };
                        if immediate_threats > 0 {
                            score += my_mon_multiplier
                                * weights.drainer_immediate_threat
                                * immediate_threats;
                        }
                    }

                    let evaluate_drainer_danger = weights.drainer_danger_boolean != 0
                        || weights.drainer_walk_threat_boolean != 0;
                    let drainer_under_danger_threat =
                        evaluate_drainer_danger && safety.exact_danger_threat;
                    if weights.drainer_danger_boolean != 0 && drainer_under_danger_threat {
                        score += my_mon_multiplier * weights.drainer_danger_boolean;
                        if my_mon_multiplier == -1 {
                            score += weights.opponent_drainer_attack_bonus;
                        }
                    }

                    if weights.drainer_walk_threat_boolean != 0
                        && !drainer_under_danger_threat
                        && safety.walk_threat
                    {
                        score += my_mon_multiplier * weights.drainer_walk_threat_boolean;
                    }
                } else if mon.kind == MonKind::Spirit {
                    let enemy_distance = nearest_enemy_mon_distance_with_context(
                        &game.board,
                        mon.color,
                        location,
                        Some(context),
                    );
                    score += my_mon_multiplier * weights.spirit_close_to_enemy / enemy_distance;
                    score -= my_mon_multiplier
                        * spirit_on_own_base_penalty(
                            &game.board,
                            *mon,
                            location,
                            weights.spirit_on_own_base_penalty,
                        );
                    let spirit_utility_cap = if use_legacy_formula { 4 } else { 6 };
                    let (spirit_utility, spirit_pressure_bonus) = if use_legacy_formula {
                        (
                            spirit_action_utility(&game.board, mon.color, location, true),
                            0,
                        )
                    } else {
                        let spirit = exact_summary_for_scoring(
                            my_exact_summary.expect("exact strategic analysis should be available"),
                            opponent_exact_summary
                                .expect("exact strategic analysis should be available"),
                            mon.color,
                            color,
                        )
                        .spirit;
                        (spirit.utility, exact_spirit_pressure_bonus(spirit, weights))
                    };
                    let spirit_utility = spirit_utility.min(spirit_utility_cap);
                    score += my_mon_multiplier * weights.spirit_action_utility * spirit_utility;
                    score += my_mon_multiplier * spirit_pressure_bonus;
                } else if mon.kind == MonKind::Angel {
                    let friendly_drainer_distance = nearest_friendly_drainer_distance_with_context(
                        &game.board,
                        mon.color,
                        location,
                        Some(context),
                    );
                    score += my_mon_multiplier * weights.angel_close_to_friendly_drainer
                        / friendly_drainer_distance;
                } else if mon.kind != MonKind::Angel {
                    score += my_mon_multiplier * weights.mon_close_to_center
                        / distance(location, Destination::Center);
                }

                if weights.attacker_close_to_opponent_drainer != 0
                    && !mon.is_fainted()
                    && (mon.kind == MonKind::Demon || mon.kind == MonKind::Mystic)
                {
                    let opp_drainer_dist = nearest_friendly_drainer_distance_with_context(
                        &game.board,
                        mon.color.other(),
                        location,
                        Some(context),
                    );
                    score += my_mon_multiplier * weights.attacker_close_to_opponent_drainer
                        / opp_drainer_dist;
                }

                if !mons_bases.contains(&location) {
                    score += my_mon_multiplier * weights.active_mon;
                }
            }
            Item::MonWithConsumable { mon, .. } => {
                let my_mon_multiplier = if mon.color == color { 1 } else { -1 };
                let is_drainer = mon.kind == MonKind::Drainer;
                score += my_mon_multiplier * weights.has_consumable;

                if is_drainer {
                    let safety = drainer_safety_snapshot_with_context(
                        &game.board,
                        mon.color,
                        location,
                        use_legacy_formula,
                        weights.drainer_walk_threat_boolean != 0,
                        Some(context),
                    );
                    score += my_mon_multiplier * weights.drainer_close_to_mana / safety.min_mana;
                    score += my_mon_multiplier * weights.drainer_close_to_own_pool
                        / distance(location, Destination::ClosestPool(mon.color));
                    score += my_mon_multiplier * weights.drainer_close_to_supermana
                        / distance_to_location(location, supermana_base);
                    if !safety.guarded_against_exact_attack() {
                        score += my_mon_multiplier * weights.drainer_at_risk / safety.risk_danger;
                    } else {
                        score += my_mon_multiplier * weights.angel_guarding_drainer;
                    }

                    if weights.drainer_immediate_threat != 0 {
                        let (action_threats, bomb_threats) = drainer_immediate_threats_with_context(
                            &game.board,
                            mon.color,
                            location,
                            use_legacy_formula,
                            Some(context),
                        );
                        let immediate_threats = if safety.angel_nearby {
                            bomb_threats
                        } else {
                            action_threats + bomb_threats
                        };
                        if immediate_threats > 0 {
                            score += my_mon_multiplier
                                * weights.drainer_immediate_threat
                                * immediate_threats;
                        }
                    }

                    let evaluate_drainer_danger = weights.drainer_danger_boolean != 0
                        || weights.drainer_walk_threat_boolean != 0;
                    let drainer_under_danger_threat =
                        evaluate_drainer_danger && safety.exact_danger_threat;
                    if weights.drainer_danger_boolean != 0 && drainer_under_danger_threat {
                        score += my_mon_multiplier * weights.drainer_danger_boolean;
                        if my_mon_multiplier == -1 {
                            score += weights.opponent_drainer_attack_bonus;
                        }
                    }

                    if weights.drainer_walk_threat_boolean != 0
                        && !drainer_under_danger_threat
                        && safety.walk_threat
                    {
                        score += my_mon_multiplier * weights.drainer_walk_threat_boolean;
                    }
                    if !use_legacy_formula {
                        if let Some(path) = exact_analysis
                            .expect("exact strategic analysis should be available")
                            .color_summary(mon.color)
                            .best_drainer_pickup
                            .map(|path| (path.path_steps, path.total_moves, path.mana_value))
                        {
                            let (path_steps, total_moves, mana_value) = path;
                            score +=
                                my_mon_multiplier * weights.drainer_best_mana_path * mana_value
                                    / (path_steps + 1);
                            if mon.color == game.active_color
                                && total_moves <= remaining_mon_moves_for_active
                            {
                                score += my_mon_multiplier
                                    * weights.drainer_pickup_score_this_turn
                                    * mana_value;
                            }
                        }
                    }
                } else if mon.kind == MonKind::Spirit {
                    let enemy_distance = nearest_enemy_mon_distance_with_context(
                        &game.board,
                        mon.color,
                        location,
                        Some(context),
                    );
                    score += my_mon_multiplier * weights.spirit_close_to_enemy / enemy_distance;
                    score -= my_mon_multiplier
                        * spirit_on_own_base_penalty(
                            &game.board,
                            *mon,
                            location,
                            weights.spirit_on_own_base_penalty,
                        );
                    let spirit_utility_cap = if use_legacy_formula { 4 } else { 6 };
                    let (spirit_utility, spirit_pressure_bonus) = if use_legacy_formula {
                        (
                            spirit_action_utility(&game.board, mon.color, location, true),
                            0,
                        )
                    } else {
                        let spirit = exact_summary_for_scoring(
                            my_exact_summary.expect("exact strategic analysis should be available"),
                            opponent_exact_summary
                                .expect("exact strategic analysis should be available"),
                            mon.color,
                            color,
                        )
                        .spirit;
                        (spirit.utility, exact_spirit_pressure_bonus(spirit, weights))
                    };
                    let spirit_utility = spirit_utility.min(spirit_utility_cap);
                    score += my_mon_multiplier * weights.spirit_action_utility * spirit_utility;
                    score += my_mon_multiplier * spirit_pressure_bonus;
                } else if mon.kind == MonKind::Angel {
                    let friendly_drainer_distance = nearest_friendly_drainer_distance_with_context(
                        &game.board,
                        mon.color,
                        location,
                        Some(context),
                    );
                    score += my_mon_multiplier * weights.angel_close_to_friendly_drainer
                        / friendly_drainer_distance;
                } else if mon.kind != MonKind::Angel {
                    score += my_mon_multiplier * weights.mon_close_to_center
                        / distance(location, Destination::Center);
                }

                if weights.attacker_close_to_opponent_drainer != 0 && !mon.is_fainted() {
                    let is_attacker = mon.kind == MonKind::Demon
                        || mon.kind == MonKind::Mystic
                        || matches!(
                            item,
                            Item::MonWithConsumable {
                                consumable: Consumable::Bomb,
                                ..
                            }
                        );
                    if is_attacker {
                        let opp_drainer_dist = nearest_friendly_drainer_distance_with_context(
                            &game.board,
                            mon.color.other(),
                            location,
                            Some(context),
                        );
                        score += my_mon_multiplier * weights.attacker_close_to_opponent_drainer
                            / opp_drainer_dist;
                    }
                }

                if !use_legacy_formula && !mons_bases.contains(&location) {
                    score += my_mon_multiplier * weights.active_mon;
                }
            }
            Item::Mana { mana } => {
                score += weights.mana_close_to_same_pool
                    / distance(location, Destination::ClosestPool(color));
                let mana_bonus = match mana {
                    Mana::Regular(mana_color) => {
                        let owner_multiplier = if *mana_color == color { 1 } else { -1 };
                        let owner_pool_distance =
                            distance(location, Destination::ClosestPool(*mana_color));
                        let owner_drainer_distance = nearest_friendly_drainer_distance_with_context(
                            &game.board,
                            *mana_color,
                            location,
                            Some(context),
                        );
                        let enemy_drainer_distance = nearest_friendly_drainer_distance_with_context(
                            &game.board,
                            mana_color.other(),
                            location,
                            Some(context),
                        );
                        let drainer_control =
                            (enemy_drainer_distance - owner_drainer_distance).clamp(-4, 4);
                        let mut regular_bonus = owner_multiplier
                            * (weights.regular_mana_to_owner_pool / owner_pool_distance
                                + weights.regular_mana_drainer_control * drainer_control);
                        if !use_legacy_formula && *mana_color == color.other() {
                            regular_bonus += weights.opponent_mana_denial * (-drainer_control);
                        }
                        regular_bonus
                    }
                    Mana::Supermana => {
                        let my_drainer_distance = nearest_friendly_drainer_distance_with_context(
                            &game.board,
                            color,
                            location,
                            Some(context),
                        );
                        let enemy_drainer_distance = nearest_friendly_drainer_distance_with_context(
                            &game.board,
                            color.other(),
                            location,
                            Some(context),
                        );
                        let drainer_control =
                            (enemy_drainer_distance - my_drainer_distance).clamp(-4, 4);
                        weights.supermana_drainer_control * drainer_control
                            + if use_legacy_formula {
                                0
                            } else {
                                weights.supermana_race_control * drainer_control
                            }
                    }
                };
                score += mana_bonus;
            }
            Item::MonWithMana { mon, mana } => {
                let my_mon_multiplier = if mon.color == color { 1 } else { -1 };
                let nearest_pool_distance = distance(location, Destination::AnyClosestPool);
                let mana_extra = match mana {
                    Mana::Regular(mana_color) => {
                        if *mana_color == color {
                            0
                        } else {
                            weights.extra_for_opponents_mana
                        }
                    }
                    Mana::Supermana => weights.extra_for_supermana,
                };

                score += my_mon_multiplier * weights.drainer_holding_mana;
                score += my_mon_multiplier * (weights.mon_with_mana_close_to_any_pool + mana_extra)
                    / nearest_pool_distance;

                if nearest_pool_distance <= 2 {
                    let immediate_bonus = match mana {
                        Mana::Supermana => {
                            weights.mana_carrier_one_step_from_pool
                                + weights.supermana_carrier_one_step_from_pool_extra
                        }
                        Mana::Regular(_) => weights.mana_carrier_one_step_from_pool,
                    };
                    score += my_mon_multiplier * immediate_bonus;

                    let carrier_score = if mon.color == Color::White {
                        game.white_score
                    } else {
                        game.black_score
                    };
                    let score_if_scored_now = carrier_score + mana.score(mon.color);
                    if score_if_scored_now >= Config::TARGET_SCORE {
                        score += my_mon_multiplier * weights.immediate_winning_carrier;
                    }
                }

                let carries_high_value_mana = !use_legacy_formula
                    && mon.kind == MonKind::Drainer
                    && (matches!(mana, Mana::Supermana)
                        || matches!(mana, Mana::Regular(owner) if *owner != mon.color));
                let safety = drainer_safety_snapshot_with_context(
                    &game.board,
                    mon.color,
                    location,
                    use_legacy_formula,
                    weights.mana_carrier_walk_threat_boolean != 0 || carries_high_value_mana,
                    Some(context),
                );
                score += my_mon_multiplier * weights.mana_carrier_at_risk / safety.risk_danger;
                if safety.guarded_against_exact_attack() {
                    score += my_mon_multiplier * weights.mana_carrier_guarded;
                }

                if !use_legacy_formula && mon.kind == MonKind::Drainer && carries_high_value_mana {
                    let virtual_score_bp = match mana {
                        Mana::Supermana => weights
                            .supermana_race_control
                            .saturating_mul(PROTECTED_HIGH_VALUE_CARRIER_SUPERMANA_SCALE_BP),
                        Mana::Regular(owner) if *owner != mon.color => weights
                            .opponent_mana_denial
                            .saturating_mul(PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_MANA_SCALE_BP),
                        Mana::Regular(_) => 0,
                    }
                    .clamp(0, PROTECTED_HIGH_VALUE_CARRIER_VIRTUAL_SCORE_BP_MAX);
                    let carrier_opponent_score = if mon.color == Color::White {
                        game.black_score
                    } else {
                        game.white_score
                    };
                    let opponent_score_limit = (Config::TARGET_SCORE
                        - PROTECTED_HIGH_VALUE_CARRIER_OPPONENT_SCORE_MARGIN)
                        .max(0);
                    let protected = if use_legacy_formula {
                        safety.angel_nearby
                            || safety.risk_danger >= PROTECTED_HIGH_VALUE_CARRIER_SAFE_DANGER_MIN
                    } else {
                        safety.exact_safe()
                    };
                    if virtual_score_bp > 0
                        && protected
                        && carrier_opponent_score <= opponent_score_limit
                    {
                        let virtual_two_point_score = weights.confirmed_score.saturating_mul(2);
                        let virtual_bonus = scale_by_bp(virtual_two_point_score, virtual_score_bp);
                        score += my_mon_multiplier * virtual_bonus;
                    }
                }

                if mon.color == game.active_color {
                    let pool_steps = nearest_pool_distance - 1;
                    if pool_steps <= remaining_mon_moves_for_active {
                        score += my_mon_multiplier * weights.mana_carrier_score_this_turn;
                    }
                }

                if mon.kind == MonKind::Drainer {
                    score += my_mon_multiplier * weights.drainer_close_to_own_pool
                        / distance(location, Destination::ClosestPool(mon.color));

                    let (action_threats, bomb_threats) = drainer_immediate_threats_with_context(
                        &game.board,
                        mon.color,
                        location,
                        use_legacy_formula,
                        Some(context),
                    );
                    let immediate_threats = if safety.angel_nearby {
                        bomb_threats
                    } else {
                        action_threats + bomb_threats
                    };
                    if immediate_threats > 0 {
                        score += my_mon_multiplier
                            * weights.drainer_immediate_threat
                            * immediate_threats;
                    }

                    let evaluate_carrier_danger = weights.mana_carrier_danger_boolean != 0
                        || weights.mana_carrier_walk_threat_boolean != 0;
                    let drainer_under_danger_threat =
                        evaluate_carrier_danger && safety.exact_danger_threat;
                    if weights.mana_carrier_danger_boolean != 0 && drainer_under_danger_threat {
                        score += my_mon_multiplier * weights.mana_carrier_danger_boolean;
                        if my_mon_multiplier == -1 {
                            score += weights.opponent_drainer_attack_bonus;
                        }
                    }

                    if weights.mana_carrier_walk_threat_boolean != 0
                        && !drainer_under_danger_threat
                        && safety.walk_threat
                    {
                        score += my_mon_multiplier * weights.mana_carrier_walk_threat_boolean;
                    }
                } else if mon.kind == MonKind::Spirit {
                    score -= my_mon_multiplier
                        * spirit_on_own_base_penalty(
                            &game.board,
                            *mon,
                            location,
                            weights.spirit_on_own_base_penalty,
                        );
                    let spirit_utility_cap = if use_legacy_formula { 4 } else { 6 };
                    let (spirit_utility, spirit_pressure_bonus) = if use_legacy_formula {
                        (
                            spirit_action_utility(&game.board, mon.color, location, true),
                            0,
                        )
                    } else {
                        let spirit = exact_summary_for_scoring(
                            my_exact_summary.expect("exact strategic analysis should be available"),
                            opponent_exact_summary
                                .expect("exact strategic analysis should be available"),
                            mon.color,
                            color,
                        )
                        .spirit;
                        (spirit.utility, exact_spirit_pressure_bonus(spirit, weights))
                    };
                    let spirit_utility = spirit_utility.min(spirit_utility_cap);
                    score += my_mon_multiplier * weights.spirit_action_utility * spirit_utility;
                    score += my_mon_multiplier * spirit_pressure_bonus;
                }

                if !use_legacy_formula && !mons_bases.contains(&location) {
                    score += my_mon_multiplier * weights.active_mon;
                }
            }
            Item::Consumable { .. } => {}
        }
    }

    let my_score_path_window = if use_legacy_formula {
        score_path_window_to_any_pool_for_context(
            &game.board,
            context,
            color,
            false,
            include_regular_mana_move_windows,
        )
    } else {
        exact_score_path_window_for_context(
            &game.board,
            context,
            color,
            my_exact_summary.expect("exact strategic analysis should be available"),
            include_regular_mana_move_windows,
        )
    };
    let opponent_score_path_window = if use_legacy_formula {
        score_path_window_to_any_pool_for_context(
            &game.board,
            context,
            color.other(),
            false,
            include_regular_mana_move_windows,
        )
    } else {
        exact_score_path_window_for_context(
            &game.board,
            context,
            color.other(),
            opponent_exact_summary.expect("exact strategic analysis should be available"),
            include_regular_mana_move_windows,
        )
    };
    if let Some(steps) = my_score_path_window.best_steps {
        score += scale_by_bp(
            weights.score_race_path_progress / steps.max(1),
            offense_scale_bp,
        );
        if !use_legacy_formula {
            score += scale_by_bp(
                weights.score_race_multi_path * my_score_path_window.multi_pressure / 100,
                offense_scale_bp,
            );
        }
    }
    if let Some(steps) = opponent_score_path_window.best_steps {
        score -= scale_by_bp(
            weights.opponent_score_race_path_progress / steps.max(1),
            defense_scale_bp,
        );
        if !use_legacy_formula {
            score -= scale_by_bp(
                weights.opponent_score_race_multi_path * opponent_score_path_window.multi_pressure
                    / 100,
                defense_scale_bp,
            );
        }
    }

    if game.active_color == color {
        let immediate_window = if use_legacy_formula {
            immediate_score_window_summary_for_context(
                &game.board,
                context,
                color,
                remaining_mon_moves_for_active,
                false,
                include_regular_mana_move_windows,
                include_regular_mana_move_windows && game.player_can_move_mana(),
            )
        } else {
            exact_immediate_score_window_for_context(
                &game.board,
                context,
                color,
                my_exact_summary.expect("exact strategic analysis should be available"),
                include_regular_mana_move_windows && game.player_can_move_mana(),
            )
        };
        score += scale_by_bp(
            weights.immediate_score_window * immediate_window.best_score,
            offense_scale_bp,
        );
        if !use_legacy_formula {
            score += scale_by_bp(
                weights.immediate_score_multi_window * immediate_window.multi_pressure / 100,
                offense_scale_bp,
            );

            let opponent_next_turn_window = if use_legacy_formula {
                immediate_score_window_summary_for_context(
                    &game.board,
                    context,
                    color.other(),
                    Config::MONS_MOVES_PER_TURN,
                    true,
                    include_regular_mana_move_windows,
                    include_regular_mana_move_windows,
                )
            } else {
                exact_immediate_score_window_for_context(
                    &game.board,
                    context,
                    color.other(),
                    opponent_exact_summary.expect("exact strategic analysis should be available"),
                    include_regular_mana_move_windows,
                )
            };
            score -= scale_by_bp(
                (weights.opponent_immediate_score_window
                    * opponent_next_turn_window.best_score
                    * next_turn_window_scale_bp)
                    / 10_000,
                defense_scale_bp,
            );
            score -= scale_by_bp(
                (weights.opponent_immediate_score_multi_window
                    * opponent_next_turn_window.multi_pressure
                    * next_turn_window_scale_bp)
                    / 1_000_000,
                defense_scale_bp,
            );
            if include_match_point_window {
                if my_score_now + immediate_window.best_score >= Config::TARGET_SCORE {
                    score += weights.immediate_winning_carrier;
                }
                if opponent_score_now + opponent_next_turn_window.best_score >= Config::TARGET_SCORE
                {
                    score -= weights.immediate_winning_carrier;
                }
            }
        }
    } else {
        let opponent_immediate_window = if use_legacy_formula {
            immediate_score_window_summary_for_context(
                &game.board,
                context,
                color.other(),
                remaining_mon_moves_for_active,
                false,
                include_regular_mana_move_windows,
                include_regular_mana_move_windows && game.player_can_move_mana(),
            )
        } else {
            exact_immediate_score_window_for_context(
                &game.board,
                context,
                color.other(),
                opponent_exact_summary.expect("exact strategic analysis should be available"),
                include_regular_mana_move_windows && game.player_can_move_mana(),
            )
        };
        score -= scale_by_bp(
            weights.opponent_immediate_score_window * opponent_immediate_window.best_score,
            defense_scale_bp,
        );
        if !use_legacy_formula {
            score -= scale_by_bp(
                weights.opponent_immediate_score_multi_window
                    * opponent_immediate_window.multi_pressure
                    / 100,
                defense_scale_bp,
            );

            let my_next_turn_window = if use_legacy_formula {
                immediate_score_window_summary_for_context(
                    &game.board,
                    context,
                    color,
                    Config::MONS_MOVES_PER_TURN,
                    true,
                    include_regular_mana_move_windows,
                    include_regular_mana_move_windows,
                )
            } else {
                exact_immediate_score_window_for_context(
                    &game.board,
                    context,
                    color,
                    my_exact_summary.expect("exact strategic analysis should be available"),
                    include_regular_mana_move_windows,
                )
            };
            score += scale_by_bp(
                (weights.immediate_score_window
                    * my_next_turn_window.best_score
                    * next_turn_window_scale_bp)
                    / 10_000,
                offense_scale_bp,
            );
            score += scale_by_bp(
                (weights.immediate_score_multi_window
                    * my_next_turn_window.multi_pressure
                    * next_turn_window_scale_bp)
                    / 1_000_000,
                offense_scale_bp,
            );
            if include_match_point_window {
                if opponent_score_now + opponent_immediate_window.best_score >= Config::TARGET_SCORE
                {
                    score -= weights.immediate_winning_carrier;
                }
                if my_score_now + my_next_turn_window.best_score >= Config::TARGET_SCORE {
                    score += weights.immediate_winning_carrier;
                }
            }
        }
    }

    score
}

fn scale_by_bp(value: i32, basis_points: i32) -> i32 {
    ((value as i64 * basis_points as i64) / 10_000) as i32
}

fn exact_summary_for_scoring(
    my_summary: ExactColorSummary,
    opponent_summary: ExactColorSummary,
    actor_color: Color,
    perspective: Color,
) -> ExactColorSummary {
    if actor_color == perspective {
        my_summary
    } else {
        opponent_summary
    }
}

fn spirit_on_own_base_penalty(board: &Board, mon: Mon, location: Location, penalty: i32) -> i32 {
    if mon.kind == MonKind::Spirit && !mon.is_fainted() && location == board.base(mon) {
        penalty
    } else {
        0
    }
}

fn exact_score_path_window_from_board_summary(
    board_summary: &ScoringBoardSummary,
    color: Color,
    exact_summary: ExactColorSummary,
) -> ScorePathWindow {
    let exact = exact_summary.score_path_window;
    let mut best_steps = exact.best_steps;
    if let Some(candidate_steps) = board_summary.regular_mana_score_path_steps(color) {
        best_steps = Some(best_steps.map_or(candidate_steps, |best| best.min(candidate_steps)));
    }
    ScorePathWindow {
        best_steps,
        multi_pressure: exact.multi_pressure,
    }
}

fn exact_score_path_window_from_snapshot(
    mana_snapshot: &ManaPathSnapshot,
    color: Color,
    exact_summary: ExactColorSummary,
) -> ScorePathWindow {
    let exact = exact_summary.score_path_window;
    let mut best_steps = exact.best_steps;
    for candidate in &mana_snapshot.candidates {
        if candidate.mana == Mana::Regular(color) {
            let candidate_steps = candidate.score_steps + 1;
            best_steps = Some(best_steps.map_or(candidate_steps, |best| best.min(candidate_steps)));
        }
    }
    ScorePathWindow {
        best_steps,
        multi_pressure: exact.multi_pressure,
    }
}

fn exact_immediate_score_window_from_board_summary(
    board_summary: &ScoringBoardSummary,
    color: Color,
    exact_summary: ExactColorSummary,
) -> ImmediateScoreWindow {
    let exact = exact_summary.immediate_window;
    let best_score = exact
        .best_score
        .max(board_summary.regular_mana_move_score(color));
    ImmediateScoreWindow {
        best_score,
        multi_pressure: exact.multi_pressure,
    }
}

fn exact_immediate_score_window_from_snapshot(
    mana_snapshot: &ManaPathSnapshot,
    color: Color,
    exact_summary: ExactColorSummary,
) -> ImmediateScoreWindow {
    let exact = exact_summary.immediate_window;
    let best_score = exact
        .best_score
        .max(best_regular_mana_move_score_window_with_snapshot(
            mana_snapshot,
            color,
        ));
    ImmediateScoreWindow {
        best_score,
        multi_pressure: exact.multi_pressure,
    }
}

fn exact_score_path_window_for_context(
    board: &Board,
    context: &ScoringEvalContext,
    color: Color,
    exact_summary: ExactColorSummary,
    include_regular_mana_move_windows: bool,
) -> ScorePathWindow {
    if !include_regular_mana_move_windows {
        let exact = exact_summary.score_path_window;
        return ScorePathWindow {
            best_steps: exact.best_steps,
            multi_pressure: exact.multi_pressure,
        };
    }
    if let Some(board_summary) = context.board_summary_if_enabled(board) {
        exact_score_path_window_from_board_summary(board_summary, color, exact_summary)
    } else {
        exact_score_path_window_from_snapshot(
            context.mana_path_snapshot(board),
            color,
            exact_summary,
        )
    }
}

fn score_path_window_to_any_pool_from_summary(
    board_summary: &ScoringBoardSummary,
    mana_snapshot: Option<&ManaPathSnapshot>,
    color: Color,
    include_drainer_pickups: bool,
    include_regular_mana_move_windows: bool,
) -> ScorePathWindow {
    let mut top_steps = [i32::MAX; 3];

    for carrier in &board_summary.live_mana_carriers[color_slot(color)] {
        insert_lowest_step(
            &mut top_steps,
            distance(carrier.location, Destination::AnyClosestPool),
        );
    }

    if include_drainer_pickups {
        let mana_snapshot =
            mana_snapshot.expect("mana snapshot should be available for drainer pickup windows");
        for location in &board_summary.live_drainer_locations[color_slot(color)] {
            if let Some((path_steps, _)) =
                best_drainer_pickup_path_with_snapshot(mana_snapshot, color, *location)
            {
                insert_lowest_step(&mut top_steps, path_steps + 1);
            }
        }
    }

    if include_regular_mana_move_windows {
        if let Some(candidate_steps) = board_summary.regular_mana_score_path_steps(color) {
            insert_lowest_step(&mut top_steps, candidate_steps);
        }
    }

    let best_steps = (top_steps[0] != i32::MAX).then_some(top_steps[0]);
    let mut multi_pressure = 0i32;
    if top_steps[1] != i32::MAX {
        multi_pressure += 70 / top_steps[1].max(1);
    }
    if top_steps[2] != i32::MAX {
        multi_pressure += 40 / top_steps[2].max(1);
    }

    ScorePathWindow {
        best_steps,
        multi_pressure,
    }
}

fn score_path_window_to_any_pool_for_context(
    board: &Board,
    context: &ScoringEvalContext,
    color: Color,
    include_drainer_pickups: bool,
    include_regular_mana_move_windows: bool,
) -> ScorePathWindow {
    if let Some(board_summary) = context.board_summary_if_enabled(board) {
        let mana_snapshot = include_drainer_pickups.then(|| context.mana_path_snapshot(board));
        score_path_window_to_any_pool_from_summary(
            board_summary,
            mana_snapshot,
            color,
            include_drainer_pickups,
            include_regular_mana_move_windows,
        )
    } else {
        score_path_window_to_any_pool_with_snapshot(
            board,
            context.mana_path_snapshot(board),
            color,
            include_drainer_pickups,
            include_regular_mana_move_windows,
        )
    }
}

fn exact_immediate_score_window_for_context(
    board: &Board,
    context: &ScoringEvalContext,
    color: Color,
    exact_summary: ExactColorSummary,
    allow_mana_move: bool,
) -> ImmediateScoreWindow {
    if !allow_mana_move {
        let exact = exact_summary.immediate_window;
        return ImmediateScoreWindow {
            best_score: exact.best_score,
            multi_pressure: exact.multi_pressure,
        };
    }
    if let Some(board_summary) = context.board_summary_if_enabled(board) {
        exact_immediate_score_window_from_board_summary(board_summary, color, exact_summary)
    } else {
        exact_immediate_score_window_from_snapshot(
            context.mana_path_snapshot(board),
            color,
            exact_summary,
        )
    }
}

fn immediate_score_window_summary_from_summary(
    board_summary: &ScoringBoardSummary,
    mana_snapshot: Option<&ManaPathSnapshot>,
    color: Color,
    remaining_mon_moves: i32,
    include_drainer_pickups: bool,
    include_regular_mana_move_windows: bool,
    allow_mana_move: bool,
) -> ImmediateScoreWindow {
    if remaining_mon_moves <= 0 {
        return ImmediateScoreWindow::default();
    }

    let mut top_scores = [0i32; 3];

    for carrier in &board_summary.live_mana_carriers[color_slot(color)] {
        let pool_steps = distance(carrier.location, Destination::AnyClosestPool) - 1;
        if pool_steps <= remaining_mon_moves {
            insert_top_score(&mut top_scores, carrier.mana.score(color));
        }
    }

    if include_drainer_pickups {
        let mana_snapshot =
            mana_snapshot.expect("mana snapshot should be available for drainer pickup windows");
        for location in &board_summary.live_drainer_locations[color_slot(color)] {
            let mut best_pickup_score = 0;
            for candidate in &mana_snapshot.candidates {
                let pickup_steps = location.distance(&candidate.location);
                if pickup_steps + candidate.score_steps <= remaining_mon_moves {
                    best_pickup_score = best_pickup_score.max(candidate.mana.score(color));
                }
            }
            if best_pickup_score > 0 {
                insert_top_score(&mut top_scores, best_pickup_score);
            }
        }
    }

    if include_regular_mana_move_windows && allow_mana_move {
        let mana_move_immediate = board_summary.regular_mana_move_score(color);
        if mana_move_immediate > 0 {
            insert_top_score(&mut top_scores, mana_move_immediate);
        }
    }

    ImmediateScoreWindow {
        best_score: top_scores[0],
        multi_pressure: top_scores[1] * 70 + top_scores[2] * 35,
    }
}

fn immediate_score_window_summary_for_context(
    board: &Board,
    context: &ScoringEvalContext,
    color: Color,
    remaining_mon_moves: i32,
    include_drainer_pickups: bool,
    include_regular_mana_move_windows: bool,
    allow_mana_move: bool,
) -> ImmediateScoreWindow {
    if let Some(board_summary) = context.board_summary_if_enabled(board) {
        let mana_snapshot = include_drainer_pickups.then(|| context.mana_path_snapshot(board));
        immediate_score_window_summary_from_summary(
            board_summary,
            mana_snapshot,
            color,
            remaining_mon_moves,
            include_drainer_pickups,
            include_regular_mana_move_windows,
            allow_mana_move,
        )
    } else {
        immediate_score_window_summary_with_snapshot(
            board,
            context.mana_path_snapshot(board),
            color,
            remaining_mon_moves,
            include_drainer_pickups,
            include_regular_mana_move_windows,
            allow_mana_move,
        )
    }
}

fn exact_spirit_pressure_bonus(spirit: ExactSpiritSummary, weights: &ScoringWeights) -> i32 {
    let setup_gain = spirit.next_turn_setup_gain.clamp(0, 4);
    let mut bonus: i32 = 0;

    if setup_gain > 0 {
        bonus = bonus.saturating_add(
            weights
                .score_race_path_progress
                .max(0)
                .saturating_mul(setup_gain)
                / 4,
        );
        bonus = bonus.saturating_add(
            weights
                .opponent_score_race_path_progress
                .max(0)
                .saturating_mul(setup_gain)
                / 6,
        );
        bonus = bonus.saturating_add(
            weights
                .score_race_multi_path
                .max(0)
                .saturating_mul(setup_gain)
                / 8,
        );
        bonus = bonus.saturating_add(
            weights
                .opponent_score_race_multi_path
                .max(0)
                .saturating_mul(setup_gain)
                / 10,
        );
    }

    if spirit.supermana_progress && !spirit.same_turn_score {
        bonus = bonus
            .saturating_add(weights.supermana_race_control.max(0).saturating_mul(3))
            .saturating_add(weights.drainer_best_mana_path.max(0) / 4);
    }

    if spirit.opponent_mana_progress && !spirit.same_turn_opponent_mana_score {
        bonus = bonus
            .saturating_add(weights.opponent_mana_denial.max(0).saturating_mul(3))
            .saturating_add(weights.drainer_best_mana_path.max(0) / 4)
            .saturating_add(weights.score_race_path_progress.max(0) / 5);
    }

    bonus
}

fn spirit_action_utility(
    board: &Board,
    spirit_color: Color,
    location: Location,
    use_legacy_formula: bool,
) -> i32 {
    if use_legacy_formula {
        return location
            .reachable_by_spirit_action_ref()
            .iter()
            .copied()
            .filter(|target| {
                let Some(item) = board.item(*target) else {
                    return false;
                };
                match item {
                    Item::Mon { mon }
                    | Item::MonWithMana { mon, .. }
                    | Item::MonWithConsumable { mon, .. } => !mon.is_fainted(),
                    Item::Mana { .. } | Item::Consumable { .. } => true,
                }
            })
            .count() as i32;
    }

    let utility = board
        .occupied()
        .find_map(|(occupied, item)| {
            let mon = item.mon()?;
            (occupied == location
                && mon.kind == MonKind::Spirit
                && mon.color == spirit_color
                && !mon.is_fainted())
            .then_some(())
        })
        .map(|_| {
            let mut game = MonsGame::new(false, board.variant());
            game.board = board.clone();
            game.active_color = spirit_color;
            game.turn_number = 2;
            exact_strategic_analysis(&game)
                .color_summary(spirit_color)
                .spirit
                .utility
        })
        .unwrap_or(0);
    utility.max(
        location
            .reachable_by_spirit_action_ref()
            .iter()
            .filter(|target| board.item(**target).is_some())
            .count() as i32,
    )
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct ScorePathWindow {
    best_steps: Option<i32>,
    multi_pressure: i32,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct ImmediateScoreWindow {
    best_score: i32,
    multi_pressure: i32,
}

#[derive(Clone, Copy)]
struct ManaPathCandidate {
    location: Location,
    score_steps: i32,
    mana: Mana,
}

#[derive(Default)]
struct ManaPathSnapshot {
    candidates: InlineCopyList<ManaPathCandidate, SCORING_MAX_MANA_ENTRIES>,
    regular_mana_move_scores: [i32; 2],
}

impl ManaPathSnapshot {
    fn from_summary(summary: &ScoringBoardSummary) -> Self {
        let mut snapshot = Self {
            regular_mana_move_scores: summary.regular_mana_move_scores,
            ..Self::default()
        };
        for entry in &summary.mana_entries {
            let score_steps = distance(entry.location, Destination::AnyClosestPool) - 1;
            snapshot.candidates.push(ManaPathCandidate {
                location: entry.location,
                score_steps,
                mana: entry.mana,
            });
        }
        snapshot
    }

    #[inline]
    fn regular_mana_move_score(&self, color: Color) -> i32 {
        self.regular_mana_move_scores[color_slot(color)]
    }
}

#[inline]
fn color_slot(color: Color) -> usize {
    if color == Color::White {
        0
    } else {
        1
    }
}

fn score_path_window_to_any_pool_with_snapshot(
    board: &Board,
    mana_snapshot: &ManaPathSnapshot,
    color: Color,
    include_drainer_pickups: bool,
    include_regular_mana_move_windows: bool,
) -> ScorePathWindow {
    let mut top_steps = [i32::MAX; 3];

    for (location, item) in board.occupied() {
        let Item::MonWithMana { mon, .. } = item else {
            continue;
        };
        if mon.color != color || mon.is_fainted() {
            continue;
        }
        insert_lowest_step(
            &mut top_steps,
            distance(location, Destination::AnyClosestPool),
        );
    }

    if include_drainer_pickups {
        for (location, item) in board.occupied() {
            let Some(mon) = item.mon() else {
                continue;
            };
            if mon.color != color || mon.kind != MonKind::Drainer || mon.is_fainted() {
                continue;
            }
            if let Some((path_steps, _)) =
                best_drainer_pickup_path_with_snapshot(mana_snapshot, color, location)
            {
                insert_lowest_step(&mut top_steps, path_steps + 1);
            }
        }
    }

    if include_regular_mana_move_windows {
        for candidate in &mana_snapshot.candidates {
            if candidate.mana == Mana::Regular(color) {
                insert_lowest_step(&mut top_steps, candidate.score_steps + 1);
            }
        }
    }

    let best_steps = (top_steps[0] != i32::MAX).then_some(top_steps[0]);
    let mut multi_pressure = 0i32;
    if top_steps[1] != i32::MAX {
        multi_pressure += 70 / top_steps[1].max(1);
    }
    if top_steps[2] != i32::MAX {
        multi_pressure += 40 / top_steps[2].max(1);
    }

    ScorePathWindow {
        best_steps,
        multi_pressure,
    }
}

fn immediate_score_window_summary_with_snapshot(
    board: &Board,
    mana_snapshot: &ManaPathSnapshot,
    color: Color,
    remaining_mon_moves: i32,
    include_drainer_pickups: bool,
    include_regular_mana_move_windows: bool,
    allow_mana_move: bool,
) -> ImmediateScoreWindow {
    if remaining_mon_moves <= 0 {
        return ImmediateScoreWindow::default();
    }

    let mut top_scores = [0i32; 3];

    for (location, item) in board.occupied() {
        let Item::MonWithMana { mon, mana } = item else {
            continue;
        };
        if mon.color != color || mon.is_fainted() {
            continue;
        }
        let pool_steps = distance(location, Destination::AnyClosestPool) - 1;
        if pool_steps <= remaining_mon_moves {
            insert_top_score(&mut top_scores, mana.score(color));
        }
    }

    if include_drainer_pickups {
        for (location, item) in board.occupied() {
            let Some(mon) = item.mon() else {
                continue;
            };
            if mon.color != color || mon.kind != MonKind::Drainer || mon.is_fainted() {
                continue;
            }
            let mut best_pickup_score = 0;
            for candidate in &mana_snapshot.candidates {
                let pickup_steps = location.distance(&candidate.location);
                if pickup_steps + candidate.score_steps <= remaining_mon_moves {
                    best_pickup_score = best_pickup_score.max(candidate.mana.score(color));
                }
            }
            if best_pickup_score > 0 {
                insert_top_score(&mut top_scores, best_pickup_score);
            }
        }
    }

    if include_regular_mana_move_windows && allow_mana_move {
        let mana_move_immediate =
            best_regular_mana_move_score_window_with_snapshot(mana_snapshot, color);
        if mana_move_immediate > 0 {
            insert_top_score(&mut top_scores, mana_move_immediate);
        }
    }

    ImmediateScoreWindow {
        best_score: top_scores[0],
        multi_pressure: top_scores[1] * 70 + top_scores[2] * 35,
    }
}

fn best_regular_mana_move_score_window_with_snapshot(
    mana_snapshot: &ManaPathSnapshot,
    color: Color,
) -> i32 {
    mana_snapshot.regular_mana_move_score(color)
}

fn insert_lowest_step(top_steps: &mut [i32; 3], step: i32) {
    if step >= top_steps[2] {
        return;
    }

    if step < top_steps[0] {
        top_steps[2] = top_steps[1];
        top_steps[1] = top_steps[0];
        top_steps[0] = step;
    } else if step < top_steps[1] {
        top_steps[2] = top_steps[1];
        top_steps[1] = step;
    } else {
        top_steps[2] = step;
    }
}

fn insert_top_score(top_scores: &mut [i32; 3], score: i32) {
    if score <= top_scores[2] {
        return;
    }

    if score > top_scores[0] {
        top_scores[2] = top_scores[1];
        top_scores[1] = top_scores[0];
        top_scores[0] = score;
    } else if score > top_scores[1] {
        top_scores[2] = top_scores[1];
        top_scores[1] = score;
    } else {
        top_scores[2] = score;
    }
}

enum Destination {
    Center,
    AnyClosestPool,
    ClosestPool(Color),
}

fn drainer_distances_with_context(
    board: &Board,
    color: Color,
    location: Location,
    use_legacy_formula: bool,
    context: Option<&ScoringEvalContext>,
) -> (i32, i32, bool) {
    if let Some(summary) = context.and_then(|context| context.board_summary_if_enabled(board)) {
        let mut min_mana = Config::BOARD_SIZE;
        let mut min_danger = Config::BOARD_SIZE;

        for entry in &summary.mana_entries {
            let delta = entry.location.distance(&location);
            if delta < min_mana {
                min_mana = delta;
            }
        }

        for danger in &summary.danger_sources[color_slot(color.other())] {
            if use_legacy_formula {
                if !danger.legacy_plain_threat {
                    continue;
                }
                let delta = danger.location.distance(&location);
                if delta < min_danger {
                    min_danger = delta;
                }
                continue;
            }

            let mut delta = i32::MAX;
            if danger.exact_action_threat {
                delta = danger.location.distance(&location);
            }
            if danger.exact_bomb_threat {
                let bomb_delta = (danger.location.distance(&location) - 2).max(1);
                delta = delta.min(bomb_delta);
            }
            if delta < min_danger {
                min_danger = delta;
            }
        }

        if use_legacy_formula {
            for consumable in &summary.loose_consumable_locations {
                let delta = consumable.distance(&location);
                if delta < min_danger {
                    min_danger = delta;
                }
            }
        }

        let angel_nearby = summary.live_angel_locations[color_slot(color)]
            .iter()
            .any(|angel| angel.distance(&location) == 1);

        if use_legacy_formula {
            return (min_danger, min_mana, angel_nearby);
        }
        return (min_danger.max(1), min_mana.max(1), angel_nearby);
    }

    let mut min_mana = Config::BOARD_SIZE;
    let mut min_danger = Config::BOARD_SIZE;
    let mut angel_nearby = false;

    for (item_location, item) in board.occupied() {
        match item {
            Item::Mana { .. } => {
                let delta = item_location.distance(&location);
                if delta < min_mana {
                    min_mana = delta;
                }
            }
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => {
                if use_legacy_formula && matches!(item, Item::MonWithMana { .. }) {
                    continue;
                }
                if mon.color != color && !mon.is_fainted() {
                    let mut delta = None;
                    if use_legacy_formula {
                        if mon.kind == MonKind::Mystic
                            || mon.kind == MonKind::Demon
                            || matches!(item, Item::MonWithConsumable { .. })
                        {
                            delta = Some(item_location.distance(&location));
                        }
                    } else {
                        if mon.kind == MonKind::Mystic || mon.kind == MonKind::Demon {
                            delta = Some(item_location.distance(&location));
                        }
                        if matches!(
                            item,
                            Item::MonWithConsumable {
                                consumable: Consumable::Bomb,
                                ..
                            }
                        ) {
                            let bomb_delta = (item_location.distance(&location) - 2).max(1);
                            delta = Some(delta.map_or(bomb_delta, |base| base.min(bomb_delta)));
                        }
                    }
                    if let Some(delta) = delta {
                        if delta < min_danger {
                            min_danger = delta;
                        }
                    }
                } else if mon.color == color
                    && !mon.is_fainted()
                    && mon.kind == MonKind::Angel
                    && item_location.distance(&location) == 1
                {
                    angel_nearby = true;
                }
            }
            Item::Consumable { .. } => {
                if use_legacy_formula {
                    let delta = item_location.distance(&location);
                    if delta < min_danger {
                        min_danger = delta;
                    }
                }
            }
        }
    }

    if use_legacy_formula {
        (min_danger, min_mana, angel_nearby)
    } else {
        (min_danger.max(1), min_mana.max(1), angel_nearby)
    }
}

fn drainer_safety_snapshot_with_context(
    board: &Board,
    color: Color,
    location: Location,
    use_legacy_formula: bool,
    include_walk_threat: bool,
    context: Option<&ScoringEvalContext>,
) -> DrainerSafetySnapshot {
    let (raw_danger, min_mana, angel_nearby) =
        drainer_distances_with_context(board, color, location, use_legacy_formula, context);
    let exact_danger_threat = is_drainer_under_danger_threat_with_context(
        board,
        color,
        location,
        angel_nearby,
        use_legacy_formula,
        context,
    );
    let walk_threat = include_walk_threat
        && !exact_danger_threat
        && is_drainer_under_walk_threat_with_context(board, color, location, angel_nearby, context);
    let risk_danger = if use_legacy_formula {
        raw_danger.max(1)
    } else if exact_danger_threat {
        1
    } else {
        raw_danger.max(1)
    };

    DrainerSafetySnapshot {
        risk_danger,
        min_mana,
        angel_nearby,
        exact_danger_threat,
        walk_threat,
    }
}

fn best_drainer_pickup_path_with_snapshot(
    mana_snapshot: &ManaPathSnapshot,
    color: Color,
    from: Location,
) -> Option<(i32, i32)> {
    let mut best: Option<(i32, i32)> = None;
    for candidate in &mana_snapshot.candidates {
        let pickup_steps = from.distance(&candidate.location);
        let score_steps = candidate.score_steps;
        let total_steps = pickup_steps + score_steps;
        let mana_value = candidate.mana.score(color);

        let replace = match best {
            None => true,
            Some((best_steps, best_mana_value)) => {
                let total_metric = total_steps * 3 - mana_value;
                let best_metric = best_steps * 3 - best_mana_value;
                total_metric < best_metric
                    || (total_metric == best_metric && mana_value > best_mana_value)
            }
        };
        if replace {
            best = Some((total_steps, mana_value));
        }
    }
    best
}

fn drainer_immediate_threats_with_context(
    board: &Board,
    color: Color,
    location: Location,
    _use_legacy_formula: bool,
    context: Option<&ScoringEvalContext>,
) -> (i32, i32) {
    if let Some(context) = context {
        context.drainer_immediate_threats(board, color, location)
    } else {
        crate::models::automove_exact::drainer_immediate_threats(board, color, location)
    }
}

fn is_drainer_under_walk_threat_with_context(
    board: &Board,
    color: Color,
    location: Location,
    angel_nearby: bool,
    context: Option<&ScoringEvalContext>,
) -> bool {
    let board_hash = context.map_or_else(
        || crate::models::automove_exact::exact_board_hash(board),
        ScoringEvalContext::board_hash,
    );
    crate::models::automove_exact::is_drainer_under_walk_threat_with_hash(
        board,
        board_hash,
        color,
        location,
        angel_nearby,
    )
}

fn is_drainer_under_danger_threat_with_context(
    board: &Board,
    color: Color,
    location: Location,
    angel_nearby: bool,
    use_legacy_formula: bool,
    context: Option<&ScoringEvalContext>,
) -> bool {
    if use_legacy_formula {
        return is_drainer_under_immediate_threat(board, color, location, angel_nearby);
    }

    let board_hash = context.map_or_else(
        || crate::models::automove_exact::exact_board_hash(board),
        ScoringEvalContext::board_hash,
    );
    if let Some(context) = context {
        context.can_attack_target_on_board(
            board,
            color.other(),
            color,
            location,
            Config::MONS_MOVES_PER_TURN,
            true,
        )
    } else {
        crate::models::automove_exact::can_attack_target_on_board_with_hash(
            board,
            board_hash,
            color.other(),
            color,
            location,
            Config::MONS_MOVES_PER_TURN,
            true,
        )
    }
}

fn is_drainer_under_immediate_threat(
    board: &Board,
    color: Color,
    location: Location,
    angel_nearby: bool,
) -> bool {
    crate::models::automove_exact::is_drainer_under_immediate_threat(
        board,
        color,
        location,
        angel_nearby,
    )
}

fn nearest_enemy_mon_distance_with_context(
    board: &Board,
    color: Color,
    location: Location,
    context: Option<&ScoringEvalContext>,
) -> i32 {
    if let Some(summary) = context.and_then(|context| context.board_summary_if_enabled(board)) {
        let best = summary.live_mon_locations[color_slot(color.other())]
            .iter()
            .map(|occupied| occupied.distance(&location))
            .min()
            .unwrap_or(Config::BOARD_SIZE);
        return best.max(1);
    }

    let mut best = Config::BOARD_SIZE;
    for (item_location, item) in board.occupied() {
        if let Some(mon) = item.mon() {
            if mon.color != color && !mon.is_fainted() {
                let delta = item_location.distance(&location);
                if delta < best {
                    best = delta;
                }
            }
        }
    }
    best.max(1)
}

fn nearest_friendly_drainer_distance_with_context(
    board: &Board,
    color: Color,
    location: Location,
    context: Option<&ScoringEvalContext>,
) -> i32 {
    if let Some(summary) = context.and_then(|context| context.board_summary_if_enabled(board)) {
        let best = summary.live_drainer_locations[color_slot(color)]
            .iter()
            .map(|occupied| occupied.distance(&location))
            .min()
            .unwrap_or(Config::BOARD_SIZE);
        return best.max(1);
    }

    let mut best = Config::BOARD_SIZE;
    for (item_location, item) in board.occupied() {
        if let Some(mon) = item.mon() {
            if mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted() {
                let delta = item_location.distance(&location);
                if delta < best {
                    best = delta;
                }
            }
        }
    }
    best.max(1)
}

fn distance_to_location(location: Location, destination: Location) -> i32 {
    location.distance(&destination) + 1
}

fn distance(location: Location, destination: Destination) -> i32 {
    let distance = match destination {
        Destination::Center => {
            // Once within 1 step from center, extra centralization is not rewarded further.
            (Config::BOARD_CENTER_INDEX - location.i).abs().max(1)
        }
        Destination::AnyClosestPool => {
            let max_index = Config::MAX_LOCATION_INDEX;
            let i = location.i;
            let j = location.j;
            i32::max(
                i32::min(i, (max_index - i).abs()),
                i32::min(j, (max_index - j).abs()),
            )
        }
        Destination::ClosestPool(color) => {
            let pool_row = if color == Color::White {
                Config::MAX_LOCATION_INDEX
            } else {
                0
            };
            let i = location.i;
            let j = location.j;
            i32::max(
                (pool_row - i).abs(),
                i32::min(j, (Config::MAX_LOCATION_INDEX - j).abs()),
            )
        }
    };
    distance + 1
}
