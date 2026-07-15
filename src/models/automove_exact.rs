use crate::models::automove_deadline::{cache_write_allowed, checkpoint, checkpoint_with_reserve};
use crate::*;
use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::hash::{BuildHasherDefault, Hasher};

const EXACT_ANALYSIS_CACHE_MAX_ENTRIES: usize = 512;
const EXACT_ATTACK_REACH_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_CARRIER_DISTANCE_MAP_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_CARRIER_STEPS_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_DRAINER_SAFETY_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_DRAINER_TO_MANA_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_DRAINER_PICKUP_WINDOW_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_IMMEDIATE_TACTICAL_WINDOW_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_PICKUP_PATH_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_SPIRIT_REACH_CACHE_MAX_ENTRIES: usize = 4096;
const EXACT_SPIRIT_SUMMARY_CACHE_MAX_ENTRIES: usize = 2048;
const EXACT_WALK_THREAT_CACHE_MAX_ENTRIES: usize = 8192;
const EXACT_SECURE_MANA_CACHE_MAX_ENTRIES: usize = 4096;
const EXACT_SPIRIT_UTILITY_CAP: i32 = 6;
const EXACT_BFS_CAPACITY: usize = 128;
const EXACT_LOCATION_STATE_CAPACITY: usize =
    (Config::BOARD_SIZE as usize) * (Config::BOARD_SIZE as usize);
const EXACT_CARRIER_MANA_VARIANTS: usize = 3;
const EXACT_PAYLOAD_VARIANTS: usize = 5;
const EXACT_CARRIER_MANA_STATE_CAPACITY: usize =
    EXACT_LOCATION_STATE_CAPACITY * EXACT_CARRIER_MANA_VARIANTS;
const EXACT_PAYLOAD_STATE_CAPACITY: usize = EXACT_LOCATION_STATE_CAPACITY * EXACT_PAYLOAD_VARIANTS;
const EXACT_SECURE_TOUCHED_ITEMS_CAPACITY: usize = 12;
const EXACT_CARRIER_DISTANCE_UNKNOWN: u8 = u8::MAX;
const EXACT_CARRIER_MANA_VALUES: [Mana; EXACT_CARRIER_MANA_VARIANTS] = [
    Mana::Regular(Color::White),
    Mana::Regular(Color::Black),
    Mana::Supermana,
];

#[derive(Default)]
struct ExactFastHasher(u64);

impl Hasher for ExactFastHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        let mut hash = if self.0 == 0 {
            0xcbf29ce484222325u64
        } else {
            self.0
        };
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100000001b3);
        }
        self.0 = hash;
    }

    fn write_u64(&mut self, value: u64) {
        self.write(&value.to_le_bytes());
    }
}

type ExactBuildHasher = BuildHasherDefault<ExactFastHasher>;
type ExactHashMap<K, V> = HashMap<K, V, ExactBuildHasher>;
type ExactHashSet<K> = std::collections::HashSet<K, ExactBuildHasher>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum ExactActorPayload {
    None,
    Mana(Mana),
    Bomb,
}

#[derive(Clone)]
struct ExactLocationSeen([bool; EXACT_LOCATION_STATE_CAPACITY]);

impl ExactLocationSeen {
    #[inline]
    fn new() -> Self {
        Self([false; EXACT_LOCATION_STATE_CAPACITY])
    }

    #[inline]
    fn contains(&self, location: Location) -> bool {
        self.0[location.index()]
    }

    #[inline]
    fn insert(&mut self, location: Location) -> bool {
        let slot = location.index();
        if self.0[slot] {
            false
        } else {
            self.0[slot] = true;
            true
        }
    }
}

#[derive(Clone)]
struct ExactPayloadSeen([bool; EXACT_PAYLOAD_STATE_CAPACITY]);

impl ExactPayloadSeen {
    #[inline]
    fn new() -> Self {
        Self([false; EXACT_PAYLOAD_STATE_CAPACITY])
    }

    #[inline]
    fn insert(&mut self, location: Location, payload: ExactActorPayload) -> bool {
        let slot = exact_payload_state_slot(location, payload);
        if self.0[slot] {
            false
        } else {
            self.0[slot] = true;
            true
        }
    }
}

#[inline]
fn exact_payload_state_slot(location: Location, payload: ExactActorPayload) -> usize {
    location.index() * EXACT_PAYLOAD_VARIANTS + exact_payload_variant_index(payload)
}

#[inline]
fn exact_payload_variant_index(payload: ExactActorPayload) -> usize {
    match payload {
        ExactActorPayload::None => 0,
        ExactActorPayload::Mana(Mana::Regular(Color::White)) => 1,
        ExactActorPayload::Mana(Mana::Regular(Color::Black)) => 2,
        ExactActorPayload::Mana(Mana::Supermana) => 3,
        ExactActorPayload::Bomb => 4,
    }
}

#[inline]
fn exact_carrier_mana_index(mana: Mana) -> usize {
    match mana {
        Mana::Regular(Color::White) => 0,
        Mana::Regular(Color::Black) => 1,
        Mana::Supermana => 2,
    }
}

#[inline]
fn exact_carrier_distance_slot(location: Location, mana: Mana) -> usize {
    location.index() * EXACT_CARRIER_MANA_VARIANTS + exact_carrier_mana_index(mana)
}

const EXACT_ACTOR_MOVE_MEMO_UNKNOWN: u8 = u8::MAX;
const EXACT_ACTOR_MOVE_MEMO_CAPACITY: usize = EXACT_LOCATION_STATE_CAPACITY * 2 * 5 * 5 * 2;
const EXACT_DRAINER_MOVE_MEMO_PAYLOAD_VARIANTS: usize = 4;
const EXACT_DRAINER_MOVE_MEMO_CAPACITY: usize =
    EXACT_LOCATION_STATE_CAPACITY * 2 * EXACT_DRAINER_MOVE_MEMO_PAYLOAD_VARIANTS;

struct ExactActorMoveMemo {
    entries: [u8; EXACT_ACTOR_MOVE_MEMO_CAPACITY],
}

impl ExactActorMoveMemo {
    #[inline]
    fn new(_board_hash: u64) -> Self {
        Self {
            entries: [EXACT_ACTOR_MOVE_MEMO_UNKNOWN; EXACT_ACTOR_MOVE_MEMO_CAPACITY],
        }
    }

    #[inline]
    fn payload_after_move(
        &mut self,
        board: &Board,
        mon_kind: MonKind,
        color: Color,
        payload: ExactActorPayload,
        destination: Location,
        allow_pick_bomb: bool,
    ) -> Option<ExactActorPayload> {
        let slot =
            exact_actor_move_memo_slot(mon_kind, color, payload, destination, allow_pick_bomb);
        let cached = self.entries[slot];
        if cached != EXACT_ACTOR_MOVE_MEMO_UNKNOWN {
            return exact_actor_move_memo_decode(cached);
        }

        let result = actor_payload_after_move_compute(
            board,
            mon_kind,
            color,
            payload,
            destination,
            allow_pick_bomb,
        );
        let encoded = exact_actor_move_memo_encode(result);
        self.entries[slot] = encoded;
        result
    }
}

struct ExactDrainerMoveMemo {
    entries: [u8; EXACT_DRAINER_MOVE_MEMO_CAPACITY],
}

impl ExactDrainerMoveMemo {
    #[inline]
    fn new() -> Self {
        Self {
            entries: [EXACT_ACTOR_MOVE_MEMO_UNKNOWN; EXACT_DRAINER_MOVE_MEMO_CAPACITY],
        }
    }

    #[inline]
    fn payload_after_move(
        &mut self,
        board: &Board,
        color: Color,
        payload: ExactActorPayload,
        destination: Location,
    ) -> Option<ExactActorPayload> {
        let slot = exact_drainer_move_memo_slot(color, payload, destination);
        let cached = self.entries[slot];
        if cached != EXACT_ACTOR_MOVE_MEMO_UNKNOWN {
            return exact_drainer_move_memo_decode(cached);
        }

        let result = actor_payload_after_move_compute(
            board,
            MonKind::Drainer,
            color,
            payload,
            destination,
            false,
        );
        let encoded = exact_drainer_move_memo_encode(result);
        self.entries[slot] = encoded;
        result
    }
}

#[inline]
fn exact_actor_move_memo_slot(
    mon_kind: MonKind,
    color: Color,
    payload: ExactActorPayload,
    destination: Location,
    allow_pick_bomb: bool,
) -> usize {
    let allow_index = usize::from(allow_pick_bomb);
    let payload_index = exact_payload_variant_index(payload);
    let color_index = if color == Color::White { 0 } else { 1 };
    let mon_kind_index = (exact_hash_mon_kind(mon_kind) - 1) as usize;
    ((((allow_index * EXACT_PAYLOAD_VARIANTS + payload_index) * 2 + color_index) * 5
        + mon_kind_index)
        * EXACT_LOCATION_STATE_CAPACITY)
        + destination.index()
}

#[inline]
fn exact_drainer_move_memo_slot(
    color: Color,
    payload: ExactActorPayload,
    destination: Location,
) -> usize {
    let color_index = if color == Color::White { 0 } else { 1 };
    ((color_index * EXACT_DRAINER_MOVE_MEMO_PAYLOAD_VARIANTS
        + exact_drainer_move_payload_variant_index(payload))
        * EXACT_LOCATION_STATE_CAPACITY)
        + destination.index()
}

#[inline]
fn exact_actor_move_memo_encode(result: Option<ExactActorPayload>) -> u8 {
    match result {
        None => 0,
        Some(ExactActorPayload::None) => 1,
        Some(ExactActorPayload::Mana(Mana::Regular(Color::White))) => 2,
        Some(ExactActorPayload::Mana(Mana::Regular(Color::Black))) => 3,
        Some(ExactActorPayload::Mana(Mana::Supermana)) => 4,
        Some(ExactActorPayload::Bomb) => 5,
    }
}

#[inline]
fn exact_actor_move_memo_decode(value: u8) -> Option<ExactActorPayload> {
    match value {
        0 => None,
        1 => Some(ExactActorPayload::None),
        2 => Some(ExactActorPayload::Mana(Mana::Regular(Color::White))),
        3 => Some(ExactActorPayload::Mana(Mana::Regular(Color::Black))),
        4 => Some(ExactActorPayload::Mana(Mana::Supermana)),
        5 => Some(ExactActorPayload::Bomb),
        _ => unreachable!("unexpected actor move memo value"),
    }
}

#[inline]
fn exact_drainer_move_payload_variant_index(payload: ExactActorPayload) -> usize {
    match payload {
        ExactActorPayload::None => 0,
        ExactActorPayload::Mana(Mana::Regular(Color::White)) => 1,
        ExactActorPayload::Mana(Mana::Regular(Color::Black)) => 2,
        ExactActorPayload::Mana(Mana::Supermana) => 3,
        ExactActorPayload::Bomb => unreachable!("drainer pickup path should never carry bomb"),
    }
}

#[inline]
fn exact_drainer_move_memo_encode(result: Option<ExactActorPayload>) -> u8 {
    match result {
        None => 0,
        Some(ExactActorPayload::None) => 1,
        Some(ExactActorPayload::Mana(Mana::Regular(Color::White))) => 2,
        Some(ExactActorPayload::Mana(Mana::Regular(Color::Black))) => 3,
        Some(ExactActorPayload::Mana(Mana::Supermana)) => 4,
        Some(ExactActorPayload::Bomb) => {
            unreachable!("drainer pickup path should never produce bomb")
        }
    }
}

#[inline]
fn exact_drainer_move_memo_decode(value: u8) -> Option<ExactActorPayload> {
    match value {
        0 => None,
        1 => Some(ExactActorPayload::None),
        2 => Some(ExactActorPayload::Mana(Mana::Regular(Color::White))),
        3 => Some(ExactActorPayload::Mana(Mana::Regular(Color::Black))),
        4 => Some(ExactActorPayload::Mana(Mana::Supermana)),
        _ => unreachable!("unexpected drainer move memo value"),
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactScorePathWindow {
    pub best_steps: Option<i32>,
    pub multi_pressure: i32,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactImmediateScoreWindow {
    pub best_score: i32,
    pub multi_pressure: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ExactDrainerPickupPath {
    pub path_steps: i32,
    pub total_moves: i32,
    pub mana_value: i32,
    pub mana: Mana,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct ExactSpiritSummary {
    pub utility: i32,
    pub same_turn_score: bool,
    pub same_turn_score_value: i32,
    pub same_turn_opponent_mana_score: bool,
    pub same_turn_opponent_mana_score_value: i32,
    pub supermana_progress: bool,
    pub opponent_mana_progress: bool,
    pub next_turn_setup_gain: i32,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactColorSummary {
    pub score_path_window: ExactScorePathWindow,
    pub immediate_window: ExactImmediateScoreWindow,
    pub best_drainer_pickup: Option<ExactDrainerPickupPath>,
    pub best_carrier_steps: Option<i32>,
    pub best_drainer_to_mana_steps: Option<i32>,
    pub spirit: ExactSpiritSummary,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactTurnSummary {
    pub can_attack_opponent_drainer: bool,
    pub safe_supermana_progress: bool,
    pub safe_supermana_progress_steps: Option<i32>,
    pub safe_opponent_mana_progress: bool,
    pub safe_opponent_mana_progress_steps: Option<i32>,
    pub spirit_assisted_supermana_progress: bool,
    pub spirit_assisted_opponent_mana_progress: bool,
    pub spirit_assisted_score: bool,
    pub spirit_assisted_denial: bool,
    pub same_turn_score_window_value: i32,
    pub score_path_best_steps: Option<i32>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub(crate) struct ExactTurnTacticalProjection {
    pub safe_supermana_progress: bool,
    pub safe_supermana_progress_steps: Option<i32>,
    pub safe_opponent_mana_progress: bool,
    pub safe_opponent_mana_progress_steps: Option<i32>,
    pub spirit_assisted_score: bool,
    pub spirit_assisted_score_value: i32,
    pub spirit_assisted_denial: bool,
    pub spirit_assisted_denial_value: i32,
    pub same_turn_score_window_value: i32,
}

pub(crate) const EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS: u8 = 1 << 0;
pub(crate) const EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS: u8 = 1 << 1;
pub(crate) const EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE: u8 = 1 << 2;
pub(crate) const EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL: u8 = 1 << 3;
pub(crate) const EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW: u8 = 1 << 4;
const EXACT_TURN_TACTICAL_ALL_FLAGS: u8 = EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS
    | EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS
    | EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE
    | EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL
    | EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW;
const EXACT_TACTICAL_SPIRIT_NEED_SCORE: u8 = 1 << 0;
const EXACT_TACTICAL_SPIRIT_NEED_DENIAL: u8 = 1 << 1;
const EXACT_TACTICAL_SPIRIT_NEED_PROGRESS: u8 = 1 << 2;
const EXACT_TACTICAL_SPIRIT_ALL_FIELDS: u8 = EXACT_TACTICAL_SPIRIT_NEED_SCORE
    | EXACT_TACTICAL_SPIRIT_NEED_DENIAL
    | EXACT_TACTICAL_SPIRIT_NEED_PROGRESS;

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactOpportunityBudget {
    pub remaining_mon_moves: i32,
    pub can_use_action: bool,
    pub can_move_mana: bool,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactOpportunityDelta {
    pub same_turn_score_window_value: i32,
    pub spirit_gain: i32,
    pub opponent_window_deny_gain: i32,
    pub drainer_attack_available: bool,
    pub drainer_safety: i32,
    pub safe_supermana_progress_steps: Option<i32>,
    pub safe_opponent_mana_progress_steps: Option<i32>,
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactOpportunityContext {
    pub budget: ExactOpportunityBudget,
    pub turn: ExactTurnTacticalProjection,
    pub delta: ExactOpportunityDelta,
    pub opponent_can_win_immediately: bool,
}

#[inline]
fn exact_tactical_spirit_summary_for_fields(
    summary: ExactSpiritSummary,
    fields: u8,
) -> ExactSpiritSummary {
    ExactSpiritSummary {
        same_turn_score: if fields & EXACT_TACTICAL_SPIRIT_NEED_SCORE != 0 {
            summary.same_turn_score
        } else {
            false
        },
        same_turn_score_value: if fields & EXACT_TACTICAL_SPIRIT_NEED_SCORE != 0 {
            summary.same_turn_score_value
        } else {
            0
        },
        same_turn_opponent_mana_score: if fields & EXACT_TACTICAL_SPIRIT_NEED_DENIAL != 0 {
            summary.same_turn_opponent_mana_score
        } else {
            false
        },
        same_turn_opponent_mana_score_value: if fields & EXACT_TACTICAL_SPIRIT_NEED_DENIAL != 0 {
            summary.same_turn_opponent_mana_score_value
        } else {
            0
        },
        supermana_progress: if fields & EXACT_TACTICAL_SPIRIT_NEED_PROGRESS != 0 {
            summary.supermana_progress
        } else {
            false
        },
        opponent_mana_progress: if fields & EXACT_TACTICAL_SPIRIT_NEED_PROGRESS != 0 {
            summary.opponent_mana_progress
        } else {
            false
        },
        ..ExactSpiritSummary::default()
    }
}

#[inline]
fn exact_tactical_spirit_superset_fields(fields: u8) -> &'static [u8] {
    match fields {
        EXACT_TACTICAL_SPIRIT_NEED_SCORE => &[
            EXACT_TACTICAL_SPIRIT_NEED_SCORE | EXACT_TACTICAL_SPIRIT_NEED_DENIAL,
            EXACT_TACTICAL_SPIRIT_NEED_SCORE | EXACT_TACTICAL_SPIRIT_NEED_PROGRESS,
            EXACT_TACTICAL_SPIRIT_ALL_FIELDS,
        ],
        EXACT_TACTICAL_SPIRIT_NEED_DENIAL => &[
            EXACT_TACTICAL_SPIRIT_NEED_SCORE | EXACT_TACTICAL_SPIRIT_NEED_DENIAL,
            EXACT_TACTICAL_SPIRIT_NEED_DENIAL | EXACT_TACTICAL_SPIRIT_NEED_PROGRESS,
            EXACT_TACTICAL_SPIRIT_ALL_FIELDS,
        ],
        EXACT_TACTICAL_SPIRIT_NEED_PROGRESS => &[
            EXACT_TACTICAL_SPIRIT_NEED_SCORE | EXACT_TACTICAL_SPIRIT_NEED_PROGRESS,
            EXACT_TACTICAL_SPIRIT_NEED_DENIAL | EXACT_TACTICAL_SPIRIT_NEED_PROGRESS,
            EXACT_TACTICAL_SPIRIT_ALL_FIELDS,
        ],
        3 | 5 | 6 => &[EXACT_TACTICAL_SPIRIT_ALL_FIELDS],
        7 => &[],
        _ => &[],
    }
}

#[inline]
fn exact_immediate_tactical_window_for_axes(
    window: ExactImmediateTacticalWindow,
    need_score: bool,
    need_denial: bool,
) -> ExactImmediateTacticalWindow {
    ExactImmediateTacticalWindow {
        best_score: if need_score { window.best_score } else { 0 },
        best_opponent_mana_score: if need_denial {
            window.best_opponent_mana_score
        } else {
            0
        },
    }
}

#[inline]
fn exact_immediate_tactical_window_for_min_score(
    window: ExactImmediateTacticalWindow,
    min_score: u8,
) -> ExactImmediateTacticalWindow {
    if min_score <= 1 {
        return window;
    }

    ExactImmediateTacticalWindow {
        best_score: if window.best_score >= i32::from(min_score) {
            window.best_score
        } else {
            0
        },
        ..window
    }
}

#[inline]
fn exact_drainer_pickup_window_for_axes(
    window: ExactDrainerPickupWindow,
    need_score: bool,
    need_denial: bool,
) -> ExactDrainerPickupWindow {
    ExactDrainerPickupWindow {
        any: if need_score { window.any } else { None },
        opponent: if need_denial { window.opponent } else { None },
    }
}

#[inline]
fn exact_drainer_pickup_window_for_min_any_score(
    window: ExactDrainerPickupWindow,
    min_any_score: u8,
) -> ExactDrainerPickupWindow {
    if min_any_score <= 1 {
        return window;
    }

    ExactDrainerPickupWindow {
        any: window
            .any
            .filter(|path| path.mana_value >= i32::from(min_any_score)),
        ..window
    }
}

#[inline]
fn exact_turn_tactical_projection_for_flags(
    projection: ExactTurnTacticalProjection,
    flags: u8,
) -> ExactTurnTacticalProjection {
    let need_supermana = flags & EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS != 0;
    let need_opponent_mana = flags & EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS != 0;
    let need_spirit_score = flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE != 0;
    let need_spirit_denial = flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL != 0;
    let need_score_window = flags & EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW != 0;
    let include_score_window_denial =
        need_score_window && (need_opponent_mana || need_spirit_denial);
    let include_spirit_score = need_spirit_score || need_score_window;
    let include_spirit_denial = need_spirit_denial || include_score_window_denial;
    let safe_supermana_progress_steps = need_supermana
        .then_some(())
        .and(projection.safe_supermana_progress_steps);
    let safe_opponent_mana_progress_steps = need_opponent_mana
        .then_some(())
        .and(projection.safe_opponent_mana_progress_steps);
    let spirit_assisted_denial = include_spirit_denial && projection.spirit_assisted_denial;

    ExactTurnTacticalProjection {
        safe_supermana_progress: safe_supermana_progress_steps.is_some(),
        safe_supermana_progress_steps,
        safe_opponent_mana_progress: safe_opponent_mana_progress_steps.is_some()
            || spirit_assisted_denial,
        safe_opponent_mana_progress_steps,
        spirit_assisted_score: include_spirit_score && projection.spirit_assisted_score,
        spirit_assisted_score_value: if include_spirit_score {
            projection.spirit_assisted_score_value
        } else {
            0
        },
        spirit_assisted_denial,
        spirit_assisted_denial_value: if include_spirit_denial {
            projection.spirit_assisted_denial_value
        } else {
            0
        },
        same_turn_score_window_value: if need_score_window {
            projection.same_turn_score_window_value
        } else {
            0
        },
    }
}

#[derive(Debug, Clone, Copy, Default)]
pub(crate) struct ExactStrategicAnalysis {
    pub white: ExactColorSummary,
    pub black: ExactColorSummary,
}

impl ExactStrategicAnalysis {
    #[inline]
    pub(crate) fn color_summary(self, color: Color) -> ExactColorSummary {
        if color == Color::White {
            self.white
        } else {
            self.black
        }
    }
}

#[derive(Default)]
struct ExactTurnSummaryCache {
    entries: ExactHashMap<u64, ExactTurnSummary>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactTurnTacticalProjectionKey {
    state_hash: u64,
    color: Color,
    remaining_mon_moves: i32,
    can_use_action: bool,
    flags: u8,
}

#[derive(Default)]
struct ExactTurnTacticalProjectionCache {
    entries: ExactHashMap<ExactTurnTacticalProjectionKey, ExactTurnTacticalProjection>,
}

#[derive(Default)]
pub(crate) struct ExactStrategicAnalysisCache {
    entries: ExactHashMap<u64, ExactStrategicAnalysis>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) struct AttackReachSummaryKey {
    pub board_hash: u64,
    pub attacker_color: Color,
    pub target_color: Color,
    pub remaining_moves: i32,
    pub can_use_action: bool,
}

#[derive(Debug, Clone, Copy)]
pub(crate) struct AttackReachSummary {
    action_threat_counts: [u8; BOARD_CELLS],
    bomb_threat_counts: [u8; BOARD_CELLS],
    guarded_targets: [bool; BOARD_CELLS],
}

impl Default for AttackReachSummary {
    fn default() -> Self {
        Self {
            action_threat_counts: [0; BOARD_CELLS],
            bomb_threat_counts: [0; BOARD_CELLS],
            guarded_targets: [false; BOARD_CELLS],
        }
    }
}

impl AttackReachSummary {
    #[inline]
    pub(crate) fn can_attack_target(self, target: Location) -> bool {
        let slot = target.index();
        self.bomb_threat_counts[slot] > 0
            || (!self.guarded_targets[slot] && self.action_threat_counts[slot] > 0)
    }

    #[inline]
    pub(crate) fn immediate_threats(self, target: Location) -> (i32, i32) {
        let slot = target.index();
        (
            self.action_threat_counts[slot] as i32,
            self.bomb_threat_counts[slot] as i32,
        )
    }

    #[inline]
    fn mark_guarded(&mut self, target: Location, guarded: bool) {
        self.guarded_targets[target.index()] = guarded;
    }

    #[inline]
    fn add_action_threat(&mut self, target: Location) {
        let slot = target.index();
        self.action_threat_counts[slot] = self.action_threat_counts[slot].saturating_add(1);
    }

    #[inline]
    fn add_bomb_threat(&mut self, target: Location) {
        let slot = target.index();
        self.bomb_threat_counts[slot] = self.bomb_threat_counts[slot].saturating_add(1);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactAttackQueryKey {
    board_hash: u64,
    attacker_color: Color,
    target_color: Color,
    target: Location,
    remaining_moves: i32,
    can_use_action: bool,
}

#[derive(Default)]
struct ExactAttackReachCache {
    entries: ExactHashMap<ExactAttackQueryKey, bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactDrainerSafetyQueryKey {
    board_hash: u64,
    color: Color,
}

#[derive(Default)]
struct ExactDrainerSafetyCache {
    entries: ExactHashMap<ExactDrainerSafetyQueryKey, i32>,
}

#[derive(Clone)]
struct ExactCarrierDistanceMap {
    entries: [u8; EXACT_CARRIER_MANA_STATE_CAPACITY],
}

impl ExactCarrierDistanceMap {
    #[inline]
    fn new() -> Self {
        Self {
            entries: [EXACT_CARRIER_DISTANCE_UNKNOWN; EXACT_CARRIER_MANA_STATE_CAPACITY],
        }
    }

    #[inline]
    fn insert(&mut self, location: Location, mana: Mana, steps: u8) -> bool {
        let slot = exact_carrier_distance_slot(location, mana);
        if self.entries[slot] != EXACT_CARRIER_DISTANCE_UNKNOWN {
            false
        } else {
            self.entries[slot] = steps;
            true
        }
    }

    #[inline]
    fn steps(&self, location: Location, mana: Mana) -> Option<i32> {
        let steps = self.entries[exact_carrier_distance_slot(location, mana)];
        (steps != EXACT_CARRIER_DISTANCE_UNKNOWN).then_some(i32::from(steps))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactCarrierDistanceMapQueryKey {
    board_hash: u64,
    max_steps: i32,
}

#[derive(Default)]
struct ExactCarrierDistanceMapCache {
    entries: ExactHashMap<ExactCarrierDistanceMapQueryKey, ExactCarrierDistanceMap>,
}

#[derive(Default)]
struct ExactCarrierDistanceMapWarmupCache {
    entries: ExactHashMap<ExactCarrierDistanceMapQueryKey, u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactCarrierStepsQueryKey {
    board_hash: u64,
    start: Location,
    mana: Mana,
}

#[derive(Default)]
struct ExactCarrierStepsCache {
    entries: ExactHashMap<ExactCarrierStepsQueryKey, Option<i32>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactDrainerToManaQueryKey {
    board_hash: u64,
    color: Color,
    start: Location,
}

#[derive(Default)]
struct ExactDrainerToManaCache {
    entries: ExactHashMap<ExactDrainerToManaQueryKey, Option<i32>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactPickupPathQueryKey {
    board_hash: u64,
    color: Color,
    start: Location,
    max_steps: Option<i32>,
}

#[derive(Default)]
struct ExactPickupPathCache {
    entries: ExactHashMap<ExactPickupPathQueryKey, Option<ExactDrainerPickupPath>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactDrainerPickupWindowQueryKey {
    board_hash: u64,
    color: Color,
    start: Location,
    max_steps: Option<i32>,
    min_any_score: u8,
    need_score: bool,
    need_denial: bool,
    opponent_mana: Mana,
}

#[derive(Default)]
struct ExactDrainerPickupWindowCache {
    entries: ExactHashMap<ExactDrainerPickupWindowQueryKey, ExactDrainerPickupWindow>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactTacticalSpiritSummaryKey {
    board_hash: u64,
    color: Color,
    remaining_mon_moves: i32,
    can_use_action: bool,
    fields: u8,
}

#[derive(Default)]
struct ExactSpiritTacticalSummaryCache {
    entries: ExactHashMap<ExactTacticalSpiritSummaryKey, ExactSpiritSummary>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactTacticalSpiritAfterWindowKey {
    board_hash: u64,
    remaining_mon_moves: i32,
    min_score: u8,
    need_score: bool,
    need_denial: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactImmediateTacticalWindowQueryKey {
    board_hash: u64,
    color: Color,
    move_budget: i32,
    min_score: u8,
    need_score: bool,
    need_denial: bool,
}

#[derive(Default)]
struct ExactImmediateTacticalWindowCache {
    entries: ExactHashMap<ExactImmediateTacticalWindowQueryKey, ExactImmediateTacticalWindow>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactSpiritReachQueryKey {
    board_hash: u64,
    start: Location,
    color: Color,
    remaining_mon_moves: i32,
}

#[derive(Default)]
struct ExactSpiritReachCache {
    entries: ExactHashMap<ExactSpiritReachQueryKey, Vec<(Location, i32)>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactWalkThreatQueryKey {
    board_hash: u64,
    color: Color,
    location: Location,
    angel_nearby: bool,
}

#[derive(Default)]
struct ExactWalkThreatCache {
    entries: ExactHashMap<ExactWalkThreatQueryKey, bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactSecureManaStateKey {
    board_hash: u64,
    active_color: Color,
    mons_moves_count: i32,
    white_regular_mana_count: u8,
    black_regular_mana_count: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ExactSecureManaQueryKey {
    state: ExactSecureManaStateKey,
    color: Color,
    wanted: Mana,
}

#[derive(Default)]
struct ExactSecureManaCache {
    entries: ExactHashMap<ExactSecureManaQueryKey, Option<i32>>,
    visiting: ExactHashSet<ExactSecureManaQueryKey>,
}

thread_local! {
    static EXACT_TURN_SUMMARY_CACHE: RefCell<ExactTurnSummaryCache> =
        RefCell::new(ExactTurnSummaryCache::default());
    static EXACT_TURN_TACTICAL_PROJECTION_CACHE: RefCell<ExactTurnTacticalProjectionCache> =
        RefCell::new(ExactTurnTacticalProjectionCache::default());
    static EXACT_STRATEGIC_ANALYSIS_CACHE: RefCell<ExactStrategicAnalysisCache> =
        RefCell::new(ExactStrategicAnalysisCache::default());
    static EXACT_ATTACK_REACH_CACHE: RefCell<ExactAttackReachCache> =
        RefCell::new(ExactAttackReachCache::default());
    static EXACT_DRAINER_SAFETY_CACHE: RefCell<ExactDrainerSafetyCache> =
        RefCell::new(ExactDrainerSafetyCache::default());
    static EXACT_CARRIER_DISTANCE_MAP_CACHE: RefCell<ExactCarrierDistanceMapCache> =
        RefCell::new(ExactCarrierDistanceMapCache::default());
    static EXACT_CARRIER_DISTANCE_MAP_WARMUP_CACHE: RefCell<ExactCarrierDistanceMapWarmupCache> =
        RefCell::new(ExactCarrierDistanceMapWarmupCache::default());
    static EXACT_CARRIER_STEPS_CACHE: RefCell<ExactCarrierStepsCache> =
        RefCell::new(ExactCarrierStepsCache::default());
    static EXACT_DRAINER_TO_MANA_CACHE: RefCell<ExactDrainerToManaCache> =
        RefCell::new(ExactDrainerToManaCache::default());
    static EXACT_DRAINER_PICKUP_WINDOW_CACHE: RefCell<ExactDrainerPickupWindowCache> =
        RefCell::new(ExactDrainerPickupWindowCache::default());
    static EXACT_IMMEDIATE_TACTICAL_WINDOW_CACHE: RefCell<ExactImmediateTacticalWindowCache> =
        RefCell::new(ExactImmediateTacticalWindowCache::default());
    static EXACT_PICKUP_PATH_CACHE: RefCell<ExactPickupPathCache> =
        RefCell::new(ExactPickupPathCache::default());
    static EXACT_SPIRIT_REACH_CACHE: RefCell<ExactSpiritReachCache> =
        RefCell::new(ExactSpiritReachCache::default());
    static EXACT_SPIRIT_TACTICAL_SUMMARY_CACHE: RefCell<ExactSpiritTacticalSummaryCache> =
        RefCell::new(ExactSpiritTacticalSummaryCache::default());
    static EXACT_WALK_THREAT_CACHE: RefCell<ExactWalkThreatCache> =
        RefCell::new(ExactWalkThreatCache::default());
    static EXACT_SECURE_MANA_CACHE: RefCell<ExactSecureManaCache> =
        RefCell::new(ExactSecureManaCache::default());
}

#[inline]
pub(crate) fn clear_exact_state_analysis_cache() {
    EXACT_TURN_SUMMARY_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_TURN_TACTICAL_PROJECTION_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_STRATEGIC_ANALYSIS_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_ATTACK_REACH_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_DRAINER_SAFETY_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_CARRIER_DISTANCE_MAP_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_CARRIER_DISTANCE_MAP_WARMUP_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_CARRIER_STEPS_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_DRAINER_TO_MANA_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_DRAINER_PICKUP_WINDOW_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_IMMEDIATE_TACTICAL_WINDOW_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_PICKUP_PATH_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_SPIRIT_REACH_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_SPIRIT_TACTICAL_SUMMARY_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_WALK_THREAT_CACHE.with(|cache| cache.borrow_mut().entries.clear());
    EXACT_SECURE_MANA_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        cache.entries.clear();
        cache.visiting.clear();
    });
}

pub(crate) fn exact_strategic_analysis(game: &MonsGame) -> ExactStrategicAnalysis {
    let key = exact_search_state_hash(game);
    exact_strategic_analysis_with_search_hash(game, key)
}

pub(crate) fn exact_strategic_analysis_with_search_hash(
    game: &MonsGame,
    key: u64,
) -> ExactStrategicAnalysis {
    if checkpoint_with_reserve(20.0) {
        return ExactStrategicAnalysis::default();
    }
    EXACT_STRATEGIC_ANALYSIS_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(cached) = cache.entries.get(&key).copied() {
            return cached;
        }
        let built = build_exact_strategic_analysis(game);
        if cache_write_allowed() {
            if cache.entries.len() >= EXACT_ANALYSIS_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, built);
            built
        } else {
            ExactStrategicAnalysis::default()
        }
    })
}

#[inline]
pub(crate) fn exact_turn_summary(game: &MonsGame, color: Color) -> ExactTurnSummary {
    let key = exact_search_state_hash(game);
    exact_turn_summary_with_search_hash(game, color, key)
}

#[inline]
pub(crate) fn exact_turn_summary_with_search_hash(
    game: &MonsGame,
    color: Color,
    key: u64,
) -> ExactTurnSummary {
    if game.active_color != color || checkpoint_with_reserve(20.0) {
        ExactTurnSummary {
            ..ExactTurnSummary::default()
        }
    } else {
        EXACT_TURN_SUMMARY_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if let Some(cached) = cache.entries.get(&key).copied() {
                return cached;
            }
            let built = build_exact_turn_summary(game);
            if cache_write_allowed() {
                if cache.entries.len() >= EXACT_ANALYSIS_CACHE_MAX_ENTRIES
                    && !cache.entries.contains_key(&key)
                {
                    cache.entries.clear();
                }
                cache.entries.insert(key, built);
                built
            } else {
                ExactTurnSummary::default()
            }
        })
    }
}

#[inline]
pub(crate) fn exact_turn_tactical_projection_with_search_hash(
    game: &MonsGame,
    color: Color,
    key: u64,
    flags: u8,
) -> ExactTurnTacticalProjection {
    if flags == 0 || game.active_color != color || checkpoint_with_reserve(20.0) {
        return ExactTurnTacticalProjection::default();
    }

    let remaining_mon_moves = (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0);
    let can_use_action = game.player_can_use_action();
    let cache_key = ExactTurnTacticalProjectionKey {
        state_hash: key,
        color,
        remaining_mon_moves,
        can_use_action,
        flags,
    };
    EXACT_TURN_TACTICAL_PROJECTION_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(cached) = cache.entries.get(&cache_key).copied() {
            return cached;
        }
        for superset_flags in 1..=EXACT_TURN_TACTICAL_ALL_FLAGS {
            if superset_flags == flags || superset_flags & flags != flags {
                continue;
            }
            let superset_key = ExactTurnTacticalProjectionKey {
                flags: superset_flags,
                ..cache_key
            };
            if let Some(cached) = cache.entries.get(&superset_key).copied() {
                let derived = exact_turn_tactical_projection_for_flags(cached, flags);
                return if cache_write_allowed() {
                    cache.entries.insert(cache_key, derived);
                    derived
                } else {
                    ExactTurnTacticalProjection::default()
                };
            }
        }
        let built = build_exact_turn_tactical_projection(game, flags);
        if cache_write_allowed() {
            if cache.entries.len() >= EXACT_ANALYSIS_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&cache_key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(cache_key, built);
            built
        } else {
            ExactTurnTacticalProjection::default()
        }
    })
}

#[inline]
pub(crate) fn exact_same_turn_score_window_with_search_hash(
    game: &MonsGame,
    color: Color,
    key: u64,
) -> i32 {
    exact_turn_tactical_projection_with_search_hash(
        game,
        color,
        key,
        EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
    )
    .same_turn_score_window_value
}

#[inline]
fn exact_opportunity_turn_tactical_projection_with_search_hash(
    game: &MonsGame,
    color: Color,
    key: u64,
) -> ExactTurnTacticalProjection {
    exact_turn_tactical_projection_with_search_hash(
        game,
        color,
        key,
        EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS
            | EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS
            | EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE
            | EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL
            | EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW,
    )
}

pub(crate) fn can_attack_opponent_drainer_this_turn(game: &MonsGame, color: Color) -> bool {
    exact_turn_summary(game, color).can_attack_opponent_drainer
}

pub(crate) fn exact_opportunity_context(game: &MonsGame, color: Color) -> ExactOpportunityContext {
    let key = exact_search_state_hash(game);
    exact_opportunity_context_with_search_hash(game, color, key)
}

pub(crate) fn exact_opportunity_context_with_search_hash(
    game: &MonsGame,
    color: Color,
    key: u64,
) -> ExactOpportunityContext {
    if game.active_color != color || checkpoint_with_reserve(20.0) {
        return ExactOpportunityContext::default();
    }

    let budget = ExactOpportunityBudget {
        remaining_mon_moves: (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0),
        can_use_action: game.player_can_use_action(),
        can_move_mana: game.player_can_move_mana(),
    };
    let board_hash = exact_board_hash(&game.board);
    let turn = exact_opportunity_turn_tactical_projection_with_search_hash(game, color, key);
    if checkpoint_with_reserve(20.0) {
        return ExactOpportunityContext::default();
    }
    let drainer_safety = exact_own_drainer_safety_score_with_hash(&game.board, board_hash, color);
    if checkpoint_with_reserve(20.0) {
        return ExactOpportunityContext::default();
    }
    let opponent = color.other();
    let opponent_score = if opponent == Color::White {
        game.white_score
    } else {
        game.black_score
    };
    let opponent_needed = Config::TARGET_SCORE.saturating_sub(opponent_score);
    let opponent_immediate = exact_strategic_analysis_with_search_hash(game, key)
        .color_summary(opponent)
        .immediate_window
        .best_score;
    if checkpoint_with_reserve(20.0) {
        return ExactOpportunityContext::default();
    }
    let opponent_can_win_immediately = opponent_needed > 0 && opponent_immediate >= opponent_needed;
    let opponent_window_deny_gain = if opponent_needed > 0 && turn.same_turn_score_window_value > 0
    {
        turn.same_turn_score_window_value.min(opponent_needed)
    } else {
        0
    };

    let context = ExactOpportunityContext {
        budget,
        turn,
        delta: ExactOpportunityDelta {
            same_turn_score_window_value: turn.same_turn_score_window_value,
            spirit_gain: turn
                .spirit_assisted_score_value
                .max(turn.spirit_assisted_denial_value),
            opponent_window_deny_gain,
            drainer_attack_available: can_attack_opponent_drainer_exact_with_hash(
                game, color, board_hash,
            ),
            drainer_safety,
            safe_supermana_progress_steps: turn.safe_supermana_progress_steps,
            safe_opponent_mana_progress_steps: turn.safe_opponent_mana_progress_steps,
        },
        opponent_can_win_immediately,
    };
    if checkpoint_with_reserve(20.0) {
        ExactOpportunityContext::default()
    } else {
        context
    }
}

pub(crate) fn exact_own_drainer_safety_score_with_hash(
    board: &Board,
    board_hash: u64,
    color: Color,
) -> i32 {
    if checkpoint() {
        return 0;
    }
    let key = ExactDrainerSafetyQueryKey { board_hash, color };
    if let Some(cached) =
        EXACT_DRAINER_SAFETY_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached;
    }

    let result = if let Some(drainer_location) = find_awake_drainer(board, color) {
        let angel_nearby = board
            .find_awake_angel(color)
            .is_some_and(|angel| angel.distance(&drainer_location) == 1);
        let (action_threats, bomb_threats) =
            drainer_immediate_threats_with_hash(board, color, drainer_location, board_hash);
        let immediate = if angel_nearby {
            bomb_threats > 0
        } else {
            action_threats + bomb_threats > 0
        };
        let walk = is_drainer_under_walk_threat_with_hash(
            board,
            board_hash,
            color,
            drainer_location,
            angel_nearby,
        );
        let exact_safe = is_drainer_exactly_safe_next_turn_on_board_with_hash(
            board,
            board_hash,
            color,
            drainer_location,
        );

        if exact_safe && !immediate && !walk {
            2
        } else if exact_safe {
            1
        } else if immediate || walk {
            -2
        } else {
            -1
        }
    } else {
        0
    };

    if cache_write_allowed() {
        EXACT_DRAINER_SAFETY_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_DRAINER_SAFETY_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, result);
        });
        result
    } else {
        0
    }
}

pub(crate) fn can_attack_target_on_board(
    board: &Board,
    attacker_color: Color,
    target_color: Color,
    target: Location,
    remaining_moves: i32,
    can_use_action: bool,
) -> bool {
    can_attack_target_on_board_with_hash(
        board,
        exact_board_hash(board),
        attacker_color,
        target_color,
        target,
        remaining_moves,
        can_use_action,
    )
}

fn exact_attack_target_plausible_on_board(
    board: &Board,
    attacker_color: Color,
    target_color: Color,
    target: Location,
    remaining_moves: i32,
    can_use_action: bool,
) -> bool {
    if remaining_moves < 0 || !can_use_action || board.item(target).is_none() || checkpoint() {
        return false;
    }

    let target_guarded = exact_is_location_guarded_by_angel(board, target_color, target);
    let bomb_pickup_locations = board
        .occupied()
        .filter_map(|(location, item)| match item {
            Item::Consumable {
                consumable: Consumable::BombOrPotion,
            } => Some(location),
            _ => None,
        })
        .collect::<Vec<_>>();

    for (location, item) in board.occupied() {
        if checkpoint() {
            return false;
        }
        let Some(mon) = item.mon() else {
            continue;
        };
        if mon.color != attacker_color || mon.is_fainted() {
            continue;
        }
        if exact_attack_target_plausible_for_attacker(
            board,
            target,
            remaining_moves,
            target_guarded,
            location,
            *item,
            *mon,
            &bomb_pickup_locations,
        ) {
            return true;
        }
    }

    false
}

#[inline]
#[allow(clippy::too_many_arguments)]
fn exact_attack_target_plausible_for_attacker(
    board: &Board,
    target: Location,
    remaining_moves: i32,
    target_guarded: bool,
    location: Location,
    item: Item,
    mon: Mon,
    bomb_pickup_locations: &[Location],
) -> bool {
    if checkpoint() {
        return false;
    }
    if matches!(
        item,
        Item::MonWithConsumable {
            consumable: Consumable::Bomb,
            ..
        }
    ) && location.distance(&target) <= remaining_moves + 3
    {
        return true;
    }

    if !target_guarded {
        let action_distance =
            exact_attack_action_steps_lower_bound(board, mon.kind, location, target)
                .unwrap_or(i32::MAX);
        if action_distance <= remaining_moves {
            return true;
        }
    }

    if matches!(item, Item::MonWithMana { .. }) {
        return false;
    }

    for bomb_location in bomb_pickup_locations {
        if checkpoint() {
            return false;
        }
        let to_bomb = location.distance(bomb_location);
        if to_bomb > remaining_moves {
            continue;
        }
        let moves_after_pickup = remaining_moves - to_bomb;
        if bomb_location.distance(&target) <= moves_after_pickup + 3 {
            return true;
        }
    }

    false
}

pub(crate) fn attack_reach_summary_with_hash(
    board: &Board,
    board_hash: u64,
    attacker_color: Color,
    target_color: Color,
    remaining_moves: i32,
    can_use_action: bool,
) -> AttackReachSummary {
    let targets = attack_reach_summary_target_locations(board, target_color);
    attack_reach_summary_for_targets_with_hash(
        board,
        board_hash,
        attacker_color,
        remaining_moves,
        can_use_action,
        targets.as_slice(),
    )
}

pub(crate) fn attack_reach_summary_target_locations(
    board: &Board,
    target_color: Color,
) -> Vec<Location> {
    board
        .occupied()
        .filter_map(|(location, item)| {
            item.mon()
                .filter(|mon| mon.color == target_color)
                .map(|_| location)
        })
        .collect()
}

pub(crate) fn attack_reach_summary_for_targets_with_hash(
    board: &Board,
    board_hash: u64,
    attacker_color: Color,
    remaining_moves: i32,
    can_use_action: bool,
    targets: &[Location],
) -> AttackReachSummary {
    let mut summary = AttackReachSummary::default();
    if remaining_moves < 0 || !can_use_action || targets.is_empty() || checkpoint() {
        return summary;
    }

    for &target in targets {
        if checkpoint() {
            return AttackReachSummary::default();
        }
        let Some(target_mon) = board.item(target).and_then(|item| item.mon()) else {
            continue;
        };
        summary.mark_guarded(
            target,
            exact_is_location_guarded_by_angel(board, target_mon.color, target),
        );
    }

    for (start, item) in board.occupied() {
        if checkpoint() {
            return AttackReachSummary::default();
        }
        let mon = match item {
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => mon,
            Item::Mana { .. } | Item::Consumable { .. } => continue,
        };
        if mon.color != attacker_color || mon.is_fainted() {
            continue;
        }

        let allow_pick_bomb = !matches!(item, Item::MonWithMana { .. });
        let start_payload = match item {
            Item::MonWithConsumable {
                consumable: Consumable::Bomb,
                ..
            } => ExactActorPayload::Bomb,
            _ => ExactActorPayload::None,
        };
        let mut actor_move_memo = ExactActorMoveMemo::new(board_hash);
        let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);
        let mut seen = ExactPayloadSeen::new();
        queue.push_back((start, start_payload, 0));
        seen.insert(start, start_payload);

        while let Some((location, payload, steps)) = queue.pop_front() {
            if checkpoint() {
                return AttackReachSummary::default();
            }
            if steps > remaining_moves {
                continue;
            }

            if payload == ExactActorPayload::Bomb {
                for &target in targets {
                    if location.distance(&target) <= 3 {
                        summary.add_bomb_threat(target);
                    }
                }
            }

            if !matches!(board.square(location), Square::MonBase { .. }) {
                match mon.kind {
                    MonKind::Mystic => {
                        for &target in targets {
                            if (location.i - target.i).abs() == 2
                                && (location.j - target.j).abs() == 2
                            {
                                summary.add_action_threat(target);
                            }
                        }
                    }
                    MonKind::Demon => {
                        for &target in targets {
                            if demon_has_line_attack(board, location, target) {
                                summary.add_action_threat(target);
                            }
                        }
                    }
                    MonKind::Drainer | MonKind::Angel | MonKind::Spirit => {}
                }
            }

            if steps == remaining_moves {
                continue;
            }

            for &next in location.nearby_locations_ref() {
                if let Some(next_payload) = exact_attack_payload_after_move(
                    &mut actor_move_memo,
                    board,
                    mon.kind,
                    mon.color,
                    payload,
                    next,
                    allow_pick_bomb,
                ) {
                    if seen.insert(next, next_payload) {
                        queue.push_back((next, next_payload, steps + 1));
                    }
                }
            }
        }
    }

    let _ = board_hash;
    if checkpoint() {
        AttackReachSummary::default()
    } else {
        summary
    }
}

pub(crate) fn can_attack_target_on_board_with_hash(
    board: &Board,
    board_hash: u64,
    attacker_color: Color,
    target_color: Color,
    target: Location,
    remaining_moves: i32,
    can_use_action: bool,
) -> bool {
    if remaining_moves < 0 || !can_use_action || board.item(target).is_none() || checkpoint() {
        return false;
    }

    let key = ExactAttackQueryKey {
        board_hash,
        attacker_color,
        target_color,
        target,
        remaining_moves,
        can_use_action,
    };
    if let Some(cached) =
        EXACT_ATTACK_REACH_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached;
    }

    if !exact_attack_target_plausible_on_board(
        board,
        attacker_color,
        target_color,
        target,
        remaining_moves,
        can_use_action,
    ) {
        if cache_write_allowed() {
            EXACT_ATTACK_REACH_CACHE.with(|cache| {
                let mut cache = cache.borrow_mut();
                if cache.entries.len() >= EXACT_ATTACK_REACH_CACHE_MAX_ENTRIES
                    && !cache.entries.contains_key(&key)
                {
                    cache.entries.clear();
                }
                cache.entries.insert(key, false);
            });
        }
        return false;
    }

    let result = can_attack_target_on_board_uncached(
        board,
        board_hash,
        attacker_color,
        target_color,
        target,
        remaining_moves,
        can_use_action,
    );
    if cache_write_allowed() {
        EXACT_ATTACK_REACH_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_ATTACK_REACH_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, result);
        });
        result
    } else {
        false
    }
}

fn can_attack_target_on_board_uncached(
    board: &Board,
    board_hash: u64,
    attacker_color: Color,
    target_color: Color,
    target: Location,
    remaining_moves: i32,
    _can_use_action: bool,
) -> bool {
    if checkpoint() {
        return false;
    }
    let target_guarded = exact_is_location_guarded_by_angel(board, target_color, target);
    let bomb_pickup_locations = board
        .occupied()
        .filter_map(|(location, item)| match item {
            Item::Consumable {
                consumable: Consumable::BombOrPotion,
            } => Some(location),
            _ => None,
        })
        .collect::<Vec<_>>();
    let mut actor_move_memo = ExactActorMoveMemo::new(board_hash);

    for (start, item) in board.occupied() {
        if checkpoint() {
            return false;
        }
        let mon = match item {
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => mon,
            Item::Mana { .. } | Item::Consumable { .. } => continue,
        };
        if mon.color != attacker_color || mon.is_fainted() {
            continue;
        }
        if !exact_attack_target_plausible_for_attacker(
            board,
            target,
            remaining_moves,
            target_guarded,
            start,
            *item,
            *mon,
            &bomb_pickup_locations,
        ) {
            continue;
        }
        let allow_pick_bomb = !matches!(item, Item::MonWithMana { .. });
        let start_payload = match item {
            Item::MonWithConsumable {
                consumable: Consumable::Bomb,
                ..
            } => ExactActorPayload::Bomb,
            _ => ExactActorPayload::None,
        };
        let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);
        let mut seen = ExactPayloadSeen::new();
        queue.push_back((start, start_payload, 0));
        seen.insert(start, start_payload);

        while let Some((location, payload, steps)) = queue.pop_front() {
            if checkpoint() {
                return false;
            }
            if steps > remaining_moves {
                continue;
            }
            if payload == ExactActorPayload::Bomb
                && board.item(target).is_some()
                && location.distance(&target) <= 3
            {
                return true;
            }
            if !matches!(board.square(location), Square::MonBase { .. }) && !target_guarded {
                if mon.kind == MonKind::Mystic
                    && (location.i - target.i).abs() == 2
                    && (location.j - target.j).abs() == 2
                {
                    return true;
                }
                if mon.kind == MonKind::Demon && demon_has_line_attack(board, location, target) {
                    return true;
                }
            }
            if steps == remaining_moves {
                continue;
            }
            if exact_attack_remaining_steps_lower_bound(
                board,
                target,
                target_guarded,
                &bomb_pickup_locations,
                location,
                payload,
                mon.kind,
                allow_pick_bomb,
            )
            .is_some_and(|lower_bound| steps.saturating_add(lower_bound) > remaining_moves)
            {
                continue;
            }
            for &next in location.nearby_locations_ref() {
                if let Some(next_payload) = exact_attack_payload_after_move(
                    &mut actor_move_memo,
                    board,
                    mon.kind,
                    mon.color,
                    payload,
                    next,
                    allow_pick_bomb,
                ) {
                    if seen.insert(next, next_payload) {
                        queue.push_back((next, next_payload, steps + 1));
                    }
                }
            }
        }
    }
    false
}

#[inline]
#[allow(clippy::too_many_arguments)]
fn exact_attack_remaining_steps_lower_bound(
    board: &Board,
    target: Location,
    target_guarded: bool,
    bomb_pickup_locations: &[Location],
    location: Location,
    payload: ExactActorPayload,
    mon_kind: MonKind,
    allow_pick_bomb: bool,
) -> Option<i32> {
    match payload {
        ExactActorPayload::Bomb => Some(location.distance(&target).saturating_sub(3)),
        ExactActorPayload::None => {
            let mut best = if target_guarded {
                None
            } else {
                exact_attack_action_steps_lower_bound(board, mon_kind, location, target)
            };
            if allow_pick_bomb {
                for &bomb_location in bomb_pickup_locations {
                    let pickup_steps = location.distance(&bomb_location);
                    let post_pickup_steps = bomb_location.distance(&target).saturating_sub(3);
                    let candidate = pickup_steps.saturating_add(post_pickup_steps);
                    best = Some(best.map_or(candidate, |current| current.min(candidate)));
                }
            }
            best
        }
        ExactActorPayload::Mana(_) => None,
    }
}

#[inline]
fn exact_attack_action_steps_lower_bound(
    board: &Board,
    mon_kind: MonKind,
    location: Location,
    target: Location,
) -> Option<i32> {
    match mon_kind {
        MonKind::Mystic => target
            .reachable_by_mystic_action_ref()
            .iter()
            .copied()
            .filter(|&source| exact_attack_action_source_available(board, location, source))
            .map(|source| location.distance(&source))
            .min(),
        MonKind::Demon => target
            .reachable_by_demon_action_ref()
            .iter()
            .copied()
            .filter(|&source| {
                exact_attack_action_source_available(board, location, source)
                    && board.item(source.location_between(&target)).is_none()
            })
            .map(|source| location.distance(&source))
            .min(),
        MonKind::Drainer | MonKind::Angel | MonKind::Spirit => None,
    }
}

#[inline]
fn exact_attack_action_source_available(
    board: &Board,
    current_location: Location,
    source: Location,
) -> bool {
    !matches!(board.square(source), Square::MonBase { .. })
        && (source == current_location || board.item(source).is_none())
}

#[inline]
fn exact_attack_payload_after_move(
    actor_move_memo: &mut ExactActorMoveMemo,
    board: &Board,
    mon_kind: MonKind,
    color: Color,
    payload: ExactActorPayload,
    destination: Location,
    allow_pick_bomb: bool,
) -> Option<ExactActorPayload> {
    if matches!(payload, ExactActorPayload::Mana(_))
        || matches!(board.items[destination.index()], Some(Item::Mana { .. }))
    {
        return None;
    }

    actor_move_memo.payload_after_move(
        board,
        mon_kind,
        color,
        payload,
        destination,
        allow_pick_bomb,
    )
}

pub(crate) fn exact_board_hash(board: &Board) -> u64 {
    let mut state = 0x6a09e667f3bcc909u64 ^ exact_board_variant_hash(board.variant());
    for (index, item) in board.items.iter().enumerate() {
        let Some(item) = item else { continue };
        state ^= exact_board_entry_hash(index, *item);
    }
    state
}

#[inline]
fn exact_board_entry_hash(index: usize, item: Item) -> u64 {
    let entry = ((index as u64)
        .wrapping_add(1)
        .wrapping_mul(0x9e3779b185ebca87))
        ^ exact_hash_item(item).wrapping_mul(0x94d049bb133111eb);
    exact_mix_u64(entry)
}

#[inline]
fn exact_board_variant_hash(variant: GameVariant) -> u64 {
    exact_mix_u64((variant.id() as i64 as u64).wrapping_add(0x243f6a8885a308d3))
}

fn exact_search_state_hash(game: &MonsGame) -> u64 {
    let mut state = 0x6a09e667f3bcc909u64;
    for (idx, item) in game.board.items.iter().enumerate() {
        let Some(item) = item else { continue };
        let entry = ((idx as u64)
            .wrapping_add(1)
            .wrapping_mul(0x9e3779b185ebca87))
            ^ exact_search_hash_item(*item);
        state ^= exact_search_mix_u64(entry);
        state = state.rotate_left(17).wrapping_mul(0x94d049bb133111eb);
    }

    state ^= exact_search_mix_u64(game.white_score as i64 as u64 ^ 0x11);
    state ^= exact_search_mix_u64(game.black_score as i64 as u64 ^ 0x23);
    state ^= exact_search_mix_u64(exact_search_hash_color(game.active_color) ^ 0x35);
    state ^= exact_search_mix_u64(game.actions_used_count as i64 as u64 ^ 0x47);
    state ^= exact_search_mix_u64(game.mana_moves_count as i64 as u64 ^ 0x59);
    state ^= exact_search_mix_u64(game.mons_moves_count as i64 as u64 ^ 0x6b);
    state ^= exact_search_mix_u64(game.white_potions_count as i64 as u64 ^ 0x7d);
    state ^= exact_search_mix_u64(game.black_potions_count as i64 as u64 ^ 0x8f);
    state ^= exact_search_mix_u64(game.turn_number as i64 as u64 ^ 0xa1);
    state ^= exact_search_mix_u64(game.variant().id() as i64 as u64 ^ 0xb3);
    exact_search_mix_u64(state)
}

#[inline]
fn exact_walk_destination_plausible(board: &Board, actor: Location, destination: Location) -> bool {
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

#[inline]
fn exact_search_hash_item(item: Item) -> u64 {
    match item {
        Item::Mon { mon } => 0x100 | exact_search_hash_mon(mon),
        Item::Mana { mana } => 0x200 | exact_search_hash_mana(mana),
        Item::MonWithMana { mon, mana } => {
            0x300 | exact_search_hash_mon(mon) | (exact_search_hash_mana(mana) << 16)
        }
        Item::MonWithConsumable { mon, consumable } => {
            0x400 | exact_search_hash_mon(mon) | (exact_search_hash_consumable(consumable) << 16)
        }
        Item::Consumable { consumable } => 0x500 | exact_search_hash_consumable(consumable),
    }
}

#[inline]
fn exact_search_hash_mon(mon: Mon) -> u64 {
    exact_search_hash_mon_kind(mon.kind)
        | (exact_search_hash_color(mon.color) << 4)
        | (((mon.cooldown as i64 as u64) & 0xff) << 8)
}

#[inline]
fn exact_search_hash_mon_kind(kind: MonKind) -> u64 {
    match kind {
        MonKind::Demon => 1,
        MonKind::Drainer => 2,
        MonKind::Angel => 3,
        MonKind::Spirit => 4,
        MonKind::Mystic => 5,
    }
}

#[inline]
fn exact_search_hash_color(color: Color) -> u64 {
    match color {
        Color::White => 1,
        Color::Black => 2,
    }
}

#[inline]
fn exact_search_hash_mana(mana: Mana) -> u64 {
    match mana {
        Mana::Regular(color) => 0x10 | exact_search_hash_color(color),
        Mana::Supermana => 0x20,
    }
}

#[inline]
fn exact_search_hash_consumable(consumable: Consumable) -> u64 {
    match consumable {
        Consumable::Potion => 1,
        Consumable::Bomb => 2,
        Consumable::BombOrPotion => 3,
    }
}

#[inline]
fn exact_search_mix_u64(mut value: u64) -> u64 {
    value = value.wrapping_add(0x9e3779b97f4a7c15);
    value = (value ^ (value >> 30)).wrapping_mul(0xbf58476d1ce4e5b9);
    value = (value ^ (value >> 27)).wrapping_mul(0x94d049bb133111eb);
    value ^ (value >> 31)
}

#[inline]
fn exact_secure_board_entry_hash(index: usize, item: Item) -> u64 {
    let entry = ((index as u64)
        .wrapping_add(1)
        .wrapping_mul(0x94d049bb133111eb))
        ^ exact_search_hash_item(item).wrapping_mul(0x9e3779b185ebca87);
    exact_search_mix_u64(entry)
}

fn exact_secure_board_state(board: &Board) -> (u64, u8, u8) {
    let mut state = 0xa0761d6478bd642fu64 ^ exact_secure_board_variant_hash(board.variant());
    let mut white_regular = 0u8;
    let mut black_regular = 0u8;
    for (index, item) in board.items.iter().enumerate() {
        let Some(item) = item else { continue };
        state ^= exact_secure_board_entry_hash(index, *item);
        if let Item::Mana {
            mana: Mana::Regular(color),
        } = item
        {
            match color {
                Color::White => white_regular = white_regular.saturating_add(1),
                Color::Black => black_regular = black_regular.saturating_add(1),
            }
        }
    }
    (state, white_regular, black_regular)
}

#[inline]
fn exact_secure_board_variant_hash(variant: GameVariant) -> u64 {
    exact_search_mix_u64((variant.id() as i64 as u64).wrapping_add(0x13198a2e03707344))
}

#[inline]
fn exact_adjust_regular_mana_counts(white: &mut u8, black: &mut u8, mana: Mana, delta: i8) {
    let count = match mana {
        Mana::Regular(Color::White) => white,
        Mana::Regular(Color::Black) => black,
        Mana::Supermana => return,
    };

    if delta < 0 {
        *count = count.saturating_sub((-delta) as u8);
    } else if delta > 0 {
        *count = count.saturating_add(delta as u8);
    }
}

#[inline]
fn exact_secure_mana_state_key(game: &MonsGame) -> ExactSecureManaStateKey {
    exact_secure_mana_state_key_from_board(&game.board, game.active_color, game.mons_moves_count)
}

#[inline]
fn exact_secure_mana_state_key_from_board(
    board: &Board,
    active_color: Color,
    mons_moves_count: i32,
) -> ExactSecureManaStateKey {
    let (board_hash, white_regular_mana_count, black_regular_mana_count) =
        exact_secure_board_state(board);
    ExactSecureManaStateKey {
        board_hash,
        active_color,
        mons_moves_count,
        white_regular_mana_count,
        black_regular_mana_count,
    }
}

#[inline]
fn exact_hash_item(item: Item) -> u64 {
    match item {
        Item::Mon { mon } => 0x100 | exact_hash_mon(mon),
        Item::Mana { mana } => 0x200 | exact_hash_mana(mana),
        Item::MonWithMana { mon, mana } => {
            0x300 | exact_hash_mon(mon) | (exact_hash_mana(mana) << 16)
        }
        Item::MonWithConsumable { mon, consumable } => {
            0x400 | exact_hash_mon(mon) | (exact_hash_consumable(consumable) << 16)
        }
        Item::Consumable { consumable } => 0x500 | exact_hash_consumable(consumable),
    }
}

#[inline]
fn exact_hash_mon(mon: Mon) -> u64 {
    exact_hash_mon_kind(mon.kind)
        | (exact_hash_color(mon.color) << 4)
        | (((mon.cooldown as i64 as u64) & 0xff) << 8)
}

#[inline]
fn exact_hash_mon_kind(kind: MonKind) -> u64 {
    match kind {
        MonKind::Demon => 1,
        MonKind::Drainer => 2,
        MonKind::Angel => 3,
        MonKind::Spirit => 4,
        MonKind::Mystic => 5,
    }
}

#[inline]
fn exact_hash_color(color: Color) -> u64 {
    match color {
        Color::White => 1,
        Color::Black => 2,
    }
}

#[inline]
fn exact_hash_mana(mana: Mana) -> u64 {
    match mana {
        Mana::Regular(color) => 1 | (exact_hash_color(color) << 4),
        Mana::Supermana => 2,
    }
}

#[inline]
fn exact_hash_consumable(consumable: Consumable) -> u64 {
    match consumable {
        Consumable::Bomb => 1,
        Consumable::Potion => 2,
        Consumable::BombOrPotion => 3,
    }
}

#[inline]
fn exact_mix_u64(value: u64) -> u64 {
    let mut mixed = value;
    mixed ^= mixed >> 30;
    mixed = mixed.wrapping_mul(0xbf58476d1ce4e5b9);
    mixed ^= mixed >> 27;
    mixed = mixed.wrapping_mul(0x94d049bb133111eb);
    mixed ^= mixed >> 31;
    mixed
}

pub(crate) fn drainer_immediate_threats(
    board: &Board,
    color: Color,
    location: Location,
) -> (i32, i32) {
    if checkpoint() {
        return (1, 1);
    }
    let threats =
        drainer_immediate_threats_with_hash(board, color, location, exact_board_hash(board));
    if checkpoint() {
        (1, 1)
    } else {
        threats
    }
}

pub(crate) fn drainer_immediate_threats_with_hash(
    board: &Board,
    color: Color,
    location: Location,
    _board_hash: u64,
) -> (i32, i32) {
    if checkpoint() {
        return (1, 1);
    }
    let threats = drainer_immediate_threats_uncached(board, color, location);
    if checkpoint() {
        (1, 1)
    } else {
        threats
    }
}

fn drainer_immediate_threats_uncached(
    board: &Board,
    color: Color,
    location: Location,
) -> (i32, i32) {
    if checkpoint() {
        return (1, 1);
    }
    let mut action_threats = 0;
    let mut bomb_threats = 0;
    for &threat_location in location.reachable_by_mystic_action_ref() {
        if checkpoint() {
            return (1, 1);
        }
        let Some(item) = board.item(threat_location) else {
            continue;
        };
        let mon = match item {
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => mon,
            Item::Mana { .. } | Item::Consumable { .. } => continue,
        };
        if mon.kind == MonKind::Mystic
            && mon.color != color
            && !mon.is_fainted()
            && !matches!(board.square(threat_location), Square::MonBase { .. })
        {
            action_threats += 1;
        }
    }

    for &threat_location in location.reachable_by_demon_action_ref() {
        if checkpoint() {
            return (1, 1);
        }
        let Some(item) = board.item(threat_location) else {
            continue;
        };
        let mon = match item {
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => mon,
            Item::Mana { .. } | Item::Consumable { .. } => continue,
        };
        if mon.kind == MonKind::Demon
            && mon.color != color
            && !mon.is_fainted()
            && !matches!(board.square(threat_location), Square::MonBase { .. })
            && demon_has_line_attack(board, threat_location, location)
        {
            action_threats += 1;
        }
    }

    for &threat_location in location.reachable_by_bomb_ref() {
        if checkpoint() {
            return (1, 1);
        }
        let Some(item) = board.item(threat_location) else {
            continue;
        };
        if matches!(
            item,
            Item::MonWithConsumable {
                mon,
                consumable: Consumable::Bomb,
            } if mon.color != color
                && !mon.is_fainted()
                && !matches!(board.square(threat_location), Square::MonBase { .. })
        ) {
            bomb_threats += 1;
        }
    }
    (action_threats, bomb_threats)
}

pub(crate) fn is_drainer_under_immediate_threat(
    board: &Board,
    color: Color,
    location: Location,
    angel_nearby: bool,
) -> bool {
    if checkpoint() {
        return true;
    }
    let (action_threats, bomb_threats) = drainer_immediate_threats(board, color, location);
    if checkpoint() {
        return true;
    }
    if angel_nearby {
        bomb_threats > 0
    } else {
        action_threats + bomb_threats > 0
    }
}

pub(crate) fn is_drainer_under_walk_threat(
    board: &Board,
    color: Color,
    location: Location,
    angel_nearby: bool,
) -> bool {
    if checkpoint() {
        return true;
    }
    let threatened = is_drainer_under_walk_threat_with_hash(
        board,
        exact_board_hash(board),
        color,
        location,
        angel_nearby,
    );
    threatened || checkpoint()
}

pub(crate) fn is_drainer_under_walk_threat_with_hash(
    board: &Board,
    board_hash: u64,
    color: Color,
    location: Location,
    angel_nearby: bool,
) -> bool {
    if checkpoint() {
        return true;
    }
    let key = ExactWalkThreatQueryKey {
        board_hash,
        color,
        location,
        angel_nearby,
    };
    if let Some(cached) =
        EXACT_WALK_THREAT_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached || checkpoint();
    }

    let result = is_drainer_under_walk_threat_uncached(board, color, location, angel_nearby);
    if cache_write_allowed() {
        EXACT_WALK_THREAT_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_WALK_THREAT_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, result);
        });
        result
    } else {
        true
    }
}

fn is_drainer_under_walk_threat_uncached(
    board: &Board,
    color: Color,
    location: Location,
    angel_nearby: bool,
) -> bool {
    if checkpoint() {
        return false;
    }
    if angel_nearby {
        return board.occupied().any(|(threat_location, item)| {
            matches!(
                item,
                Item::MonWithConsumable {
                    mon,
                    consumable: Consumable::Bomb,
                } if mon.color != color
                    && !mon.is_fainted()
                    && !matches!(board.square(threat_location), Square::MonBase { .. })
                    && threat_location.distance(&location) <= 4
            )
        });
    }

    let valid = Location::valid_range();
    for (threat_location, item) in board.occupied() {
        if checkpoint() {
            return false;
        }
        let mon = match item {
            Item::Mon { mon }
            | Item::MonWithMana { mon, .. }
            | Item::MonWithConsumable { mon, .. } => mon,
            Item::Mana { .. } | Item::Consumable { .. } => continue,
        };
        if mon.color == color || mon.is_fainted() {
            continue;
        }
        if matches!(board.square(threat_location), Square::MonBase { .. }) {
            continue;
        }
        if mon.kind == MonKind::Mystic || mon.kind == MonKind::Demon {
            for dx in -1i32..=1 {
                for dy in -1i32..=1 {
                    if dx == 0 && dy == 0 {
                        continue;
                    }
                    let ni = threat_location.i + dx;
                    let nj = threat_location.j + dy;
                    if !valid.contains(&ni) || !valid.contains(&nj) {
                        continue;
                    }
                    let neighbor = Location::new(ni, nj);
                    if board.item(neighbor).is_some() {
                        continue;
                    }
                    if matches!(
                        board.square(neighbor),
                        Square::MonBase { .. } | Square::SupermanaBase
                    ) {
                        continue;
                    }
                    if mon.kind == MonKind::Mystic
                        && (neighbor.i - location.i).abs() == 2
                        && (neighbor.j - location.j).abs() == 2
                    {
                        return true;
                    }
                    if mon.kind == MonKind::Demon
                        && demon_has_line_attack(board, neighbor, location)
                    {
                        return true;
                    }
                }
            }
        }
        if matches!(
            item,
            Item::MonWithConsumable {
                consumable: Consumable::Bomb,
                ..
            }
        ) && threat_location.distance(&location) <= 4
        {
            return true;
        }
    }
    false
}

pub(crate) fn is_drainer_exactly_safe_next_turn_on_board(
    board: &Board,
    color: Color,
    location: Location,
) -> bool {
    is_drainer_exactly_safe_next_turn_on_board_with_hash(
        board,
        exact_board_hash(board),
        color,
        location,
    )
}

pub(crate) fn is_drainer_exactly_safe_next_turn_on_board_with_hash(
    board: &Board,
    board_hash: u64,
    color: Color,
    location: Location,
) -> bool {
    if checkpoint() {
        return false;
    }
    let angel_nearby = exact_is_location_guarded_by_angel(board, color, location);
    let can_attack = can_attack_target_on_board_with_hash(
        board,
        board_hash,
        color.other(),
        color,
        location,
        Config::MONS_MOVES_PER_TURN,
        true,
    );
    if checkpoint() {
        return false;
    }
    !can_attack
        && !is_drainer_under_walk_threat_with_hash(board, board_hash, color, location, angel_nearby)
        && !checkpoint()
}

fn exact_is_location_guarded_by_angel(board: &Board, color: Color, location: Location) -> bool {
    board
        .find_awake_angel(color)
        .is_some_and(|angel_location| angel_location.distance(&location) == 1)
}

fn build_exact_strategic_analysis(game: &MonsGame) -> ExactStrategicAnalysis {
    if checkpoint_with_reserve(20.0) {
        return ExactStrategicAnalysis::default();
    }
    let white = build_color_summary(game, Color::White);
    if checkpoint_with_reserve(20.0) {
        return ExactStrategicAnalysis::default();
    }
    let black = build_color_summary(game, Color::Black);
    if checkpoint_with_reserve(20.0) {
        ExactStrategicAnalysis::default()
    } else {
        ExactStrategicAnalysis { white, black }
    }
}

fn build_color_summary(game: &MonsGame, color: Color) -> ExactColorSummary {
    if checkpoint_with_reserve(20.0) {
        return ExactColorSummary::default();
    }
    let (full_turn_moves, can_use_action) = if game.active_color == color {
        (
            (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0),
            game.player_can_use_action(),
        )
    } else {
        (Config::MONS_MOVES_PER_TURN, true)
    };

    let board_hash = exact_board_hash(&game.board);
    let mut carrier_steps = Vec::new();
    let mut best_carrier_steps = None;
    for (location, item) in game.board.occupied() {
        if checkpoint() {
            return ExactColorSummary::default();
        }
        let Item::MonWithMana { mon, mana } = item else {
            continue;
        };
        if mon.color != color || mon.is_fainted() {
            continue;
        }
        if let Some(steps) =
            exact_carrier_steps_to_any_pool_with_hash(&game.board, location, *mana, board_hash)
        {
            best_carrier_steps =
                Some(best_carrier_steps.map_or(steps, |best: i32| best.min(steps)));
            carrier_steps.push(steps);
        }
    }

    let best_drainer_pickup = find_awake_drainer(&game.board, color).and_then(|location| {
        exact_best_drainer_pickup_path_with_hash(&game.board, color, location, None, board_hash)
    });
    if checkpoint_with_reserve(20.0) {
        return ExactColorSummary::default();
    }
    let best_drainer_to_mana_steps = find_awake_drainer(&game.board, color)
        .and_then(|location| exact_drainer_to_any_mana_steps(&game.board, color, location));

    if let Some(path) = best_drainer_pickup {
        carrier_steps.push(path.total_moves);
    }
    carrier_steps.sort_unstable();
    carrier_steps.dedup();

    let score_path_window = ExactScorePathWindow {
        best_steps: carrier_steps.first().copied(),
        multi_pressure: exact_multi_pressure_from_steps(carrier_steps.as_slice()),
    };

    let mut immediate_scores = Vec::new();
    for (location, item) in game.board.occupied() {
        if checkpoint() {
            return ExactColorSummary::default();
        }
        let Item::MonWithMana { mon, mana } = item else {
            continue;
        };
        if mon.color != color || mon.is_fainted() {
            continue;
        }
        if let Some(steps) = exact_carrier_steps_to_any_pool_with_hash_bounded(
            &game.board,
            location,
            *mana,
            full_turn_moves,
            board_hash,
        ) {
            if steps <= full_turn_moves {
                immediate_scores.push(mana.score(color));
            }
        }
    }
    if let Some(path) = best_drainer_pickup {
        if path.total_moves <= full_turn_moves {
            immediate_scores.push(path.mana_value);
        }
    }
    let spirit = exact_passive_spirit_summary(&game.board, color, full_turn_moves, can_use_action);
    if checkpoint_with_reserve(20.0) {
        return ExactColorSummary::default();
    }
    immediate_scores.sort_unstable_by(|a, b| b.cmp(a));
    let immediate_window = ExactImmediateScoreWindow {
        best_score: immediate_scores.first().copied().unwrap_or(0),
        multi_pressure: exact_multi_pressure_from_scores(immediate_scores.as_slice()),
    };

    ExactColorSummary {
        score_path_window,
        immediate_window,
        best_drainer_pickup,
        best_carrier_steps,
        best_drainer_to_mana_steps,
        spirit,
    }
}

fn build_exact_turn_summary(game: &MonsGame) -> ExactTurnSummary {
    if checkpoint_with_reserve(20.0) {
        return ExactTurnSummary::default();
    }

    let color = game.active_color;
    let remaining_moves = (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0);
    let can_use_action = game.player_can_use_action();
    let tactical_spirit = exact_tactical_spirit_summary(
        &game.board,
        color,
        remaining_moves,
        can_use_action,
        EXACT_TACTICAL_SPIRIT_NEED_SCORE
            | EXACT_TACTICAL_SPIRIT_NEED_DENIAL
            | EXACT_TACTICAL_SPIRIT_NEED_PROGRESS,
    );
    if checkpoint_with_reserve(20.0) {
        return ExactTurnSummary::default();
    }
    let safe_supermana_progress_steps =
        exact_secure_specific_mana_steps_this_turn(game, color, Mana::Supermana);
    if checkpoint_with_reserve(20.0) {
        return ExactTurnSummary::default();
    }
    let safe_opponent_mana_progress_steps =
        exact_secure_specific_mana_steps_this_turn(game, color, Mana::Regular(color.other()));
    if checkpoint_with_reserve(20.0) {
        return ExactTurnSummary::default();
    }
    let same_turn_score_window_value =
        exact_best_immediate_score_on_board(&game.board, color, remaining_moves)
            .max(tactical_spirit.same_turn_score_value)
            .max(tactical_spirit.same_turn_opponent_mana_score_value);
    if checkpoint_with_reserve(20.0) {
        return ExactTurnSummary::default();
    }

    let board_hash = exact_board_hash(&game.board);
    if checkpoint_with_reserve(20.0) {
        return ExactTurnSummary::default();
    }

    let summary = ExactTurnSummary {
        can_attack_opponent_drainer: can_attack_opponent_drainer_exact_with_hash(
            game, color, board_hash,
        ),
        safe_supermana_progress: safe_supermana_progress_steps.is_some(),
        safe_supermana_progress_steps,
        safe_opponent_mana_progress: safe_opponent_mana_progress_steps.is_some()
            || tactical_spirit.same_turn_opponent_mana_score,
        safe_opponent_mana_progress_steps,
        spirit_assisted_supermana_progress: tactical_spirit.supermana_progress,
        spirit_assisted_opponent_mana_progress: tactical_spirit.opponent_mana_progress,
        spirit_assisted_score: tactical_spirit.same_turn_score,
        spirit_assisted_denial: tactical_spirit.same_turn_opponent_mana_score,
        same_turn_score_window_value,
        score_path_best_steps: exact_best_score_steps_on_board(&game.board, color),
    };
    if checkpoint_with_reserve(20.0) {
        ExactTurnSummary::default()
    } else {
        summary
    }
}

fn build_exact_turn_tactical_projection(game: &MonsGame, flags: u8) -> ExactTurnTacticalProjection {
    if checkpoint_with_reserve(20.0) {
        return ExactTurnTacticalProjection::default();
    }
    let color = game.active_color;
    let remaining_moves = (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0);
    let can_use_action = game.player_can_use_action();
    let need_supermana = flags & EXACT_TURN_TACTICAL_NEED_SUPERMANA_PROGRESS != 0;
    let need_opponent_mana = flags & EXACT_TURN_TACTICAL_NEED_OPPONENT_MANA_PROGRESS != 0;
    let need_spirit_score = flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_SCORE != 0;
    let need_spirit_denial = flags & EXACT_TURN_TACTICAL_NEED_SPIRIT_DENIAL != 0;
    let need_score_window = flags & EXACT_TURN_TACTICAL_NEED_SCORE_WINDOW != 0;
    let include_score_window_denial =
        need_score_window && (need_opponent_mana || need_spirit_denial);
    let mut tactical_spirit_fields = 0;
    if need_spirit_score || need_score_window {
        tactical_spirit_fields |= EXACT_TACTICAL_SPIRIT_NEED_SCORE;
    }
    if need_spirit_denial || include_score_window_denial {
        tactical_spirit_fields |= EXACT_TACTICAL_SPIRIT_NEED_DENIAL;
    }
    let tactical_spirit = if tactical_spirit_fields != 0 {
        exact_tactical_spirit_summary(
            &game.board,
            color,
            remaining_moves,
            can_use_action,
            tactical_spirit_fields,
        )
    } else {
        ExactSpiritSummary::default()
    };
    if checkpoint_with_reserve(20.0) {
        return ExactTurnTacticalProjection::default();
    }
    let safe_supermana_progress_steps = if need_supermana {
        exact_secure_specific_mana_steps_this_turn(game, color, Mana::Supermana)
    } else {
        None
    };
    if checkpoint_with_reserve(20.0) {
        return ExactTurnTacticalProjection::default();
    }
    let safe_opponent_mana_progress_steps = if need_opponent_mana {
        exact_secure_specific_mana_steps_this_turn(game, color, Mana::Regular(color.other()))
    } else {
        None
    };
    if checkpoint_with_reserve(20.0) {
        return ExactTurnTacticalProjection::default();
    }
    let same_turn_score_window_value = if need_score_window {
        exact_best_immediate_score_on_board(&game.board, color, remaining_moves)
            .max(tactical_spirit.same_turn_score_value)
            .max(if include_score_window_denial {
                tactical_spirit.same_turn_opponent_mana_score_value
            } else {
                0
            })
    } else {
        0
    };

    if checkpoint_with_reserve(20.0) {
        return ExactTurnTacticalProjection::default();
    }

    ExactTurnTacticalProjection {
        safe_supermana_progress: safe_supermana_progress_steps.is_some(),
        safe_supermana_progress_steps,
        safe_opponent_mana_progress: safe_opponent_mana_progress_steps.is_some()
            || tactical_spirit.same_turn_opponent_mana_score,
        safe_opponent_mana_progress_steps,
        spirit_assisted_score: tactical_spirit.same_turn_score,
        spirit_assisted_score_value: tactical_spirit.same_turn_score_value,
        spirit_assisted_denial: tactical_spirit.same_turn_opponent_mana_score,
        spirit_assisted_denial_value: tactical_spirit.same_turn_opponent_mana_score_value,
        same_turn_score_window_value,
    }
}

fn exact_multi_pressure_from_steps(steps: &[i32]) -> i32 {
    let mut pressure = 0;
    if let Some(step) = steps.get(1) {
        pressure += 70 / (*step).max(1);
    }
    if let Some(step) = steps.get(2) {
        pressure += 40 / (*step).max(1);
    }
    pressure
}

fn exact_multi_pressure_from_scores(scores: &[i32]) -> i32 {
    let second = scores.get(1).copied().unwrap_or(0);
    let third = scores.get(2).copied().unwrap_or(0);
    second * 70 + third * 35
}

#[derive(Debug, Clone, Copy)]
struct ExactStateResult {
    steps: i32,
}

#[allow(clippy::too_many_arguments)]
fn exact_shortest_payload_state<F>(
    board: &Board,
    start: Location,
    mon_kind: MonKind,
    color: Color,
    start_payload: ExactActorPayload,
    allow_pick_bomb: bool,
    max_steps: Option<i32>,
    mut goal: F,
) -> Option<ExactStateResult>
where
    F: FnMut(Location, ExactActorPayload) -> bool,
{
    if checkpoint() {
        return None;
    }
    let mut actor_move_memo = ExactActorMoveMemo::new(0);
    let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);
    let mut seen = ExactPayloadSeen::new();
    queue.push_back((start, start_payload, 0));
    seen.insert(start, start_payload);

    while let Some((location, payload, steps)) = queue.pop_front() {
        if checkpoint() {
            return None;
        }
        if goal(location, payload) {
            return Some(ExactStateResult { steps });
        }
        if max_steps.is_some_and(|limit| steps >= limit) {
            continue;
        }
        for &next in location.nearby_locations_ref() {
            if let Some(next_payload) = actor_move_memo.payload_after_move(
                board,
                mon_kind,
                color,
                payload,
                next,
                allow_pick_bomb,
            ) {
                if seen.insert(next, next_payload) {
                    queue.push_back((next, next_payload, steps + 1));
                }
            }
        }
    }

    None
}

#[allow(clippy::too_many_arguments)]
fn exact_shortest_payload_state_bounded_with_lower_bound<F, L>(
    board: &Board,
    start: Location,
    mon_kind: MonKind,
    color: Color,
    start_payload: ExactActorPayload,
    allow_pick_bomb: bool,
    max_steps: i32,
    mut goal: F,
    mut lower_bound: L,
) -> Option<ExactStateResult>
where
    F: FnMut(Location, ExactActorPayload) -> bool,
    L: FnMut(Location, ExactActorPayload) -> i32,
{
    if checkpoint() {
        return None;
    }
    let mut actor_move_memo = ExactActorMoveMemo::new(0);
    let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);
    let mut seen = ExactPayloadSeen::new();
    queue.push_back((start, start_payload, 0));
    seen.insert(start, start_payload);

    while let Some((location, payload, steps)) = queue.pop_front() {
        if checkpoint() {
            return None;
        }
        if goal(location, payload) {
            return Some(ExactStateResult { steps });
        }
        if steps >= max_steps {
            continue;
        }
        if steps.saturating_add(lower_bound(location, payload)) > max_steps {
            continue;
        }
        for &next in location.nearby_locations_ref() {
            if let Some(next_payload) = actor_move_memo.payload_after_move(
                board,
                mon_kind,
                color,
                payload,
                next,
                allow_pick_bomb,
            ) {
                if seen.insert(next, next_payload) {
                    queue.push_back((next, next_payload, steps + 1));
                }
            }
        }
    }

    None
}

fn actor_payload_after_move_with_hash(
    board: &Board,
    _board_hash: u64,
    mon_kind: MonKind,
    color: Color,
    payload: ExactActorPayload,
    destination: Location,
    allow_pick_bomb: bool,
) -> Option<ExactActorPayload> {
    actor_payload_after_move_compute(
        board,
        mon_kind,
        color,
        payload,
        destination,
        allow_pick_bomb,
    )
}

fn actor_payload_after_move_compute(
    board: &Board,
    mon_kind: MonKind,
    color: Color,
    payload: ExactActorPayload,
    destination: Location,
    allow_pick_bomb: bool,
) -> Option<ExactActorPayload> {
    let item = board.items[destination.index()];
    match payload {
        ExactActorPayload::None => match item {
            Some(Item::Mon { .. })
            | Some(Item::MonWithMana { .. })
            | Some(Item::MonWithConsumable { .. }) => None,
            Some(Item::Mana { mana }) => {
                if mon_kind == MonKind::Drainer {
                    Some(ExactActorPayload::Mana(mana))
                } else {
                    None
                }
            }
            Some(Item::Consumable {
                consumable: Consumable::BombOrPotion,
            }) => {
                if allow_pick_bomb {
                    Some(ExactActorPayload::Bomb)
                } else {
                    Some(ExactActorPayload::None)
                }
            }
            Some(Item::Consumable { .. }) => None,
            None => {
                let square = board.square(destination);
                if square_allows_empty_mon(square, mon_kind, color) {
                    Some(ExactActorPayload::None)
                } else {
                    None
                }
            }
        },
        ExactActorPayload::Mana(_) => match item {
            Some(Item::Mon { .. })
            | Some(Item::MonWithMana { .. })
            | Some(Item::MonWithConsumable { .. }) => None,
            Some(Item::Mana { mana }) => Some(ExactActorPayload::Mana(mana)),
            Some(Item::Consumable {
                consumable: Consumable::BombOrPotion,
            }) => Some(payload),
            Some(Item::Consumable { .. }) => None,
            None => {
                let square = board.square(destination);
                if square_allows_mana_carrier(square, payload.mana().unwrap()) {
                    Some(payload)
                } else {
                    None
                }
            }
        },
        ExactActorPayload::Bomb => match item {
            Some(Item::Mon { .. })
            | Some(Item::Mana { .. })
            | Some(Item::MonWithMana { .. })
            | Some(Item::MonWithConsumable { .. }) => None,
            Some(Item::Consumable {
                consumable: Consumable::BombOrPotion,
            }) => Some(ExactActorPayload::Bomb),
            Some(Item::Consumable { .. }) => None,
            None => {
                let square = board.square(destination);
                if matches!(
                    square,
                    Square::Regular
                        | Square::ConsumableBase
                        | Square::ManaBase { .. }
                        | Square::ManaPool { .. }
                ) {
                    Some(ExactActorPayload::Bomb)
                } else {
                    None
                }
            }
        },
    }
}

impl ExactActorPayload {
    fn mana(self) -> Option<Mana> {
        match self {
            ExactActorPayload::Mana(mana) => Some(mana),
            ExactActorPayload::None | ExactActorPayload::Bomb => None,
        }
    }
}

fn square_allows_empty_mon(square: Square, mon_kind: MonKind, color: Color) -> bool {
    match square {
        Square::Regular
        | Square::ConsumableBase
        | Square::ManaBase { .. }
        | Square::ManaPool { .. } => true,
        Square::SupermanaBase => mon_kind == MonKind::Drainer,
        Square::MonBase {
            kind: base_kind,
            color: base_color,
        } => base_kind == mon_kind && base_color == color,
    }
}

fn square_allows_mana_carrier(square: Square, mana: Mana) -> bool {
    match square {
        Square::Regular
        | Square::ConsumableBase
        | Square::ManaBase { .. }
        | Square::ManaPool { .. } => true,
        Square::SupermanaBase => mana == Mana::Supermana,
        Square::MonBase { .. } => false,
    }
}

#[inline]
fn exact_distance_to_any_pool_steps_lower_bound(location: Location) -> i32 {
    let max_index = Config::MAX_LOCATION_INDEX;
    let i = location.i;
    let j = location.j;
    i32::max(i32::min(i, max_index - i), i32::min(j, max_index - j))
}

fn exact_drainer_pickup_steps_lower_bound(
    board: &Board,
    color: Color,
    start: Location,
    min_any_score: u8,
    need_score: bool,
    need_denial: bool,
    opponent_mana: Mana,
) -> Option<i32> {
    if !need_score && !need_denial {
        return None;
    }

    board
        .occupied()
        .filter_map(|(location, item)| {
            let Item::Mana { mana } = item else {
                return None;
            };
            let relevant_for_score = need_score && mana.score(color) >= i32::from(min_any_score);
            let relevant_for_denial = need_denial && *mana == opponent_mana;
            if !relevant_for_score && !relevant_for_denial {
                return None;
            }
            Some(start.distance(&location) + exact_distance_to_any_pool_steps_lower_bound(location))
        })
        .min()
}

#[allow(clippy::too_many_arguments)]
fn exact_drainer_pickup_remaining_steps_lower_bound(
    board: &Board,
    color: Color,
    location: Location,
    payload: ExactActorPayload,
    min_any_score: u8,
    need_score: bool,
    need_denial: bool,
    opponent_mana: Mana,
) -> Option<i32> {
    match payload {
        ExactActorPayload::None => exact_drainer_pickup_steps_lower_bound(
            board,
            color,
            location,
            min_any_score,
            need_score,
            need_denial,
            opponent_mana,
        ),
        ExactActorPayload::Mana(mana) => {
            let relevant_for_score = need_score && mana.score(color) >= i32::from(min_any_score);
            let relevant_for_denial = need_denial && mana == opponent_mana;
            if relevant_for_score || relevant_for_denial {
                Some(exact_distance_to_any_pool_steps_lower_bound(location))
            } else {
                None
            }
        }
        ExactActorPayload::Bomb => None,
    }
}

#[inline]
fn exact_any_drainer_pickup_remaining_steps_lower_bound(
    board: &Board,
    location: Location,
    payload: ExactActorPayload,
) -> Option<i32> {
    match payload {
        ExactActorPayload::None => board
            .occupied()
            .filter_map(|(mana_location, item)| {
                let Item::Mana { .. } = item else {
                    return None;
                };
                Some(
                    location.distance(&mana_location)
                        + exact_distance_to_any_pool_steps_lower_bound(mana_location),
                )
            })
            .min(),
        ExactActorPayload::Mana(_) => Some(exact_distance_to_any_pool_steps_lower_bound(location)),
        ExactActorPayload::Bomb => None,
    }
}

#[inline]
fn exact_location_is_mana_pool(board: &Board, location: Location) -> bool {
    matches!(board.square(location), Square::ManaPool { .. })
}

#[inline]
fn exact_carrier_state_can_continue(board: &Board, location: Location, mana: Mana) -> bool {
    match board.items[location.index()] {
        Some(Item::Mon { .. })
        | Some(Item::MonWithMana { .. })
        | Some(Item::MonWithConsumable { .. }) => false,
        Some(Item::Mana { mana: item_mana }) => item_mana == mana,
        Some(Item::Consumable {
            consumable: Consumable::BombOrPotion,
        }) => true,
        Some(Item::Consumable { .. }) => false,
        None => square_allows_mana_carrier(board.square(location), mana),
    }
}

#[inline]
fn exact_push_carrier_predecessor(
    board: &Board,
    predecessor: Location,
    mana: Mana,
    steps: u8,
    distances: &mut ExactCarrierDistanceMap,
    queue: &mut VecDeque<(Location, Mana)>,
) {
    if distances.insert(predecessor, mana, steps)
        && exact_carrier_state_can_continue(board, predecessor, mana)
    {
        queue.push_back((predecessor, mana));
    }
}

fn exact_build_carrier_distance_map(board: &Board, max_steps: i32) -> ExactCarrierDistanceMap {
    let mut distances = ExactCarrierDistanceMap::new();
    let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);

    for index in 0..board.items.len() {
        if checkpoint() {
            return ExactCarrierDistanceMap::new();
        }
        let location = Location::from_index(index);
        if !exact_location_is_mana_pool(board, location) {
            continue;
        }
        for mana in EXACT_CARRIER_MANA_VALUES {
            distances.insert(location, mana, 0);
            if exact_carrier_state_can_continue(board, location, mana) {
                queue.push_back((location, mana));
            }
        }
    }

    while let Some((location, next_mana)) = queue.pop_front() {
        if checkpoint() {
            return ExactCarrierDistanceMap::new();
        }
        let current_steps = distances
            .steps(location, next_mana)
            .expect("queued carrier state should have a distance");
        if current_steps >= max_steps {
            continue;
        }
        let next_steps = current_steps.saturating_add(1) as u8;

        for &predecessor in location.nearby_locations_ref() {
            match board.items[location.index()] {
                Some(Item::Mon { .. })
                | Some(Item::MonWithMana { .. })
                | Some(Item::MonWithConsumable { .. }) => {}
                Some(Item::Mana { mana }) => {
                    if mana != next_mana {
                        continue;
                    }
                    for predecessor_mana in EXACT_CARRIER_MANA_VALUES {
                        exact_push_carrier_predecessor(
                            board,
                            predecessor,
                            predecessor_mana,
                            next_steps,
                            &mut distances,
                            &mut queue,
                        );
                    }
                }
                Some(Item::Consumable {
                    consumable: Consumable::BombOrPotion,
                }) => {
                    exact_push_carrier_predecessor(
                        board,
                        predecessor,
                        next_mana,
                        next_steps,
                        &mut distances,
                        &mut queue,
                    );
                }
                Some(Item::Consumable { .. }) => {}
                None => {
                    if square_allows_mana_carrier(board.square(location), next_mana) {
                        exact_push_carrier_predecessor(
                            board,
                            predecessor,
                            next_mana,
                            next_steps,
                            &mut distances,
                            &mut queue,
                        );
                    }
                }
            }
        }
    }

    distances
}

fn exact_carrier_steps_from_distance_map(
    board: &Board,
    start: Location,
    mana: Mana,
    board_hash: u64,
    max_steps: i32,
) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    EXACT_CARRIER_DISTANCE_MAP_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let key = ExactCarrierDistanceMapQueryKey {
            board_hash,
            max_steps,
        };
        if let Some(distances) = cache.entries.get(&key) {
            return distances.steps(start, mana);
        }

        let distances = exact_build_carrier_distance_map(board, max_steps);
        let result = distances.steps(start, mana);
        if cache_write_allowed() {
            if cache.entries.len() >= EXACT_CARRIER_DISTANCE_MAP_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, distances);
            result
        } else {
            None
        }
    })
}

fn exact_carrier_steps_to_any_pool_bounded_uncached(
    board: &Board,
    start: Location,
    mana: Mana,
    max_steps: i32,
) -> Option<i32> {
    exact_shortest_payload_state_bounded_with_lower_bound(
        board,
        start,
        MonKind::Drainer,
        Color::White,
        ExactActorPayload::Mana(mana),
        false,
        max_steps,
        |location, payload| {
            matches!(payload, ExactActorPayload::Mana(_))
                && matches!(board.square(location), Square::ManaPool { .. })
        },
        |location, _| exact_distance_to_any_pool_steps_lower_bound(location),
    )
    .map(|result| result.steps)
}

#[inline]
fn exact_carrier_steps_to_any_pool_with_hash(
    board: &Board,
    start: Location,
    mana: Mana,
    board_hash: u64,
) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    let key = ExactCarrierStepsQueryKey {
        board_hash,
        start,
        mana,
    };
    if let Some(cached) =
        EXACT_CARRIER_STEPS_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached;
    }

    let result = exact_shortest_payload_state(
        board,
        start,
        MonKind::Drainer,
        Color::White,
        ExactActorPayload::Mana(mana),
        false,
        None,
        |location, payload| {
            matches!(payload, ExactActorPayload::Mana(_))
                && matches!(board.square(location), Square::ManaPool { .. })
        },
    )
    .map(|result| result.steps);

    if cache_write_allowed() {
        EXACT_CARRIER_STEPS_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_CARRIER_STEPS_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, result);
        });
        result
    } else {
        None
    }
}

#[inline]
fn exact_carrier_steps_to_any_pool_with_hash_bounded(
    board: &Board,
    start: Location,
    mana: Mana,
    max_steps: i32,
    board_hash: u64,
) -> Option<i32> {
    if max_steps < 0 || checkpoint() {
        return None;
    }
    if max_steps == 0 {
        return exact_location_is_mana_pool(board, start).then_some(0);
    }
    if exact_distance_to_any_pool_steps_lower_bound(start) > max_steps {
        return None;
    }

    let key = ExactCarrierStepsQueryKey {
        board_hash,
        start,
        mana,
    };
    if let Some(cached) =
        EXACT_CARRIER_STEPS_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached.filter(|&steps| steps <= max_steps);
    }

    let map_key = ExactCarrierDistanceMapQueryKey {
        board_hash,
        max_steps,
    };
    let should_use_distance_map = EXACT_CARRIER_DISTANCE_MAP_CACHE
        .with(|cache| cache.borrow().entries.contains_key(&map_key))
        || (cache_write_allowed()
            && EXACT_CARRIER_DISTANCE_MAP_WARMUP_CACHE.with(|cache| {
                let mut cache = cache.borrow_mut();
                let count = cache.entries.get(&map_key).copied().unwrap_or(0);
                if count >= 1 {
                    cache.entries.remove(&map_key);
                    true
                } else {
                    cache.entries.insert(map_key, count + 1);
                    false
                }
            }));

    let result = if should_use_distance_map {
        exact_carrier_steps_from_distance_map(board, start, mana, board_hash, max_steps)
    } else {
        exact_carrier_steps_to_any_pool_bounded_uncached(board, start, mana, max_steps)
    };
    if !cache_write_allowed() {
        return None;
    }
    if let Some(steps) = result {
        EXACT_CARRIER_STEPS_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_CARRIER_STEPS_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, Some(steps));
        });
    }

    result
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct ExactDrainerPickupWindow {
    any: Option<ExactDrainerPickupPath>,
    opponent: Option<ExactDrainerPickupPath>,
}

#[inline]
fn exact_pickup_path_beats(
    candidate: ExactDrainerPickupPath,
    current: Option<ExactDrainerPickupPath>,
) -> bool {
    match current {
        None => true,
        Some(current) => {
            let candidate_metric = candidate.path_steps * 3 - candidate.mana_value;
            let current_metric = current.path_steps * 3 - current.mana_value;
            candidate_metric < current_metric
                || (candidate_metric == current_metric && candidate.mana_value > current.mana_value)
        }
    }
}

#[inline]
fn exact_pickup_path_metric(path: ExactDrainerPickupPath) -> i32 {
    path.path_steps
        .saturating_mul(3)
        .saturating_sub(path.mana_value)
}

#[inline]
fn exact_pickup_path_metric_from_total_moves(total_moves: i32, mana_value: i32) -> i32 {
    total_moves
        .saturating_sub(1)
        .saturating_mul(3)
        .saturating_sub(mana_value)
}

#[inline]
fn exact_pickup_path_future_can_beat_best(
    best: ExactDrainerPickupPath,
    total_moves_lower_bound: i32,
    max_mana_value: i32,
) -> bool {
    let future_metric =
        exact_pickup_path_metric_from_total_moves(total_moves_lower_bound, max_mana_value);
    let best_metric = exact_pickup_path_metric(best);
    future_metric < best_metric
        || (future_metric == best_metric && best.mana_value < max_mana_value)
}

#[allow(clippy::too_many_arguments)]
fn exact_update_drainer_pickup_window_candidate(
    board: &Board,
    best: &mut ExactDrainerPickupWindow,
    color: Color,
    min_any_score: u8,
    need_score: bool,
    need_denial: bool,
    opponent_mana: Mana,
    location: Location,
    payload: ExactActorPayload,
    steps: i32,
) -> bool {
    let ExactActorPayload::Mana(mana) = payload else {
        return false;
    };
    if !matches!(board.square(location), Square::ManaPool { .. }) {
        return false;
    }

    let candidate = ExactDrainerPickupPath {
        path_steps: steps.saturating_sub(1),
        total_moves: steps,
        mana_value: mana.score(color),
        mana,
    };
    if need_score
        && candidate.mana_value >= i32::from(min_any_score)
        && exact_pickup_path_beats(candidate, best.any)
    {
        best.any = Some(candidate);
    }
    if need_denial && mana == opponent_mana && exact_pickup_path_beats(candidate, best.opponent) {
        best.opponent = Some(candidate);
    }

    let max_score = Mana::Supermana.score(color);
    let max_opponent_score = opponent_mana.score(color);
    let score_done = !need_score || best.any.is_some_and(|path| path.mana_value >= max_score);
    let denial_done = !need_denial
        || best
            .opponent
            .is_some_and(|path| path.mana_value >= max_opponent_score);
    score_done && denial_done
}

#[allow(clippy::too_many_arguments)]
fn exact_drainer_pickup_window_small_budget_with_hash(
    board: &Board,
    color: Color,
    start: Location,
    max_steps: i32,
    min_any_score: u8,
    need_score: bool,
    need_denial: bool,
    opponent_mana: Mana,
    _board_hash: u64,
) -> ExactDrainerPickupWindow {
    debug_assert!((0..=3).contains(&max_steps));
    if checkpoint() {
        return ExactDrainerPickupWindow::default();
    }

    let mut best = ExactDrainerPickupWindow::default();
    let mut actor_move_memo = ExactDrainerMoveMemo::new();
    let mut frontier = vec![(start, ExactActorPayload::None)];

    for steps in 0..=max_steps {
        if checkpoint() {
            return ExactDrainerPickupWindow::default();
        }
        for &(location, payload) in &frontier {
            if checkpoint() {
                return ExactDrainerPickupWindow::default();
            }
            if exact_update_drainer_pickup_window_candidate(
                board,
                &mut best,
                color,
                min_any_score,
                need_score,
                need_denial,
                opponent_mana,
                location,
                payload,
                steps,
            ) {
                return best;
            }
        }
        if steps >= max_steps {
            break;
        }

        let mut next_frontier = Vec::with_capacity(frontier.len() * 6);
        for &(location, payload) in &frontier {
            if checkpoint() {
                return ExactDrainerPickupWindow::default();
            }
            if exact_drainer_pickup_remaining_steps_lower_bound(
                board,
                color,
                location,
                payload,
                min_any_score,
                need_score,
                need_denial,
                opponent_mana,
            )
            .is_none_or(|lower_bound| steps.saturating_add(lower_bound) > max_steps)
            {
                continue;
            }
            for &next in location.nearby_locations_ref() {
                if let Some(next_payload) =
                    actor_move_memo.payload_after_move(board, color, payload, next)
                {
                    next_frontier.push((next, next_payload));
                }
            }
        }
        frontier = next_frontier;
    }

    best
}

#[allow(clippy::too_many_arguments)]
fn exact_drainer_pickup_window_uncached_with_hash(
    board: &Board,
    color: Color,
    start: Location,
    max_steps: Option<i32>,
    min_any_score: u8,
    need_score: bool,
    need_denial: bool,
    opponent_mana: Mana,
    _board_hash: u64,
) -> ExactDrainerPickupWindow {
    if (!need_score && !need_denial) || checkpoint() {
        return ExactDrainerPickupWindow::default();
    }

    let mut actor_move_memo = ExactDrainerMoveMemo::new();
    let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);
    let mut seen = ExactPayloadSeen::new();
    queue.push_back((start, ExactActorPayload::None, 0));
    seen.insert(start, ExactActorPayload::None);
    let mut best = ExactDrainerPickupWindow::default();

    while let Some((location, payload, steps)) = queue.pop_front() {
        if checkpoint() {
            return ExactDrainerPickupWindow::default();
        }
        if max_steps.is_some_and(|limit| steps > limit) {
            continue;
        }
        if exact_update_drainer_pickup_window_candidate(
            board,
            &mut best,
            color,
            min_any_score,
            need_score,
            need_denial,
            opponent_mana,
            location,
            payload,
            steps,
        ) {
            return best;
        }
        if max_steps.is_some_and(|limit| {
            exact_drainer_pickup_remaining_steps_lower_bound(
                board,
                color,
                location,
                payload,
                min_any_score,
                need_score,
                need_denial,
                opponent_mana,
            )
            .is_none_or(|lower_bound| steps.saturating_add(lower_bound) > limit)
        }) {
            continue;
        }

        for &next in location.nearby_locations_ref() {
            if let Some(next_payload) =
                actor_move_memo.payload_after_move(board, color, payload, next)
            {
                if seen.insert(next, next_payload) {
                    queue.push_back((next, next_payload, steps + 1));
                }
            }
        }
    }

    best
}

#[allow(clippy::too_many_arguments)]
fn exact_drainer_pickup_window_with_hash_min_any_score(
    board: &Board,
    color: Color,
    start: Location,
    max_steps: Option<i32>,
    min_any_score: u8,
    need_score: bool,
    need_denial: bool,
    opponent_mana: Mana,
    board_hash: u64,
) -> ExactDrainerPickupWindow {
    if (!need_score && !need_denial) || checkpoint() {
        return ExactDrainerPickupWindow::default();
    }
    let min_any_score = if need_score { min_any_score.max(1) } else { 0 };
    if max_steps == Some(0) {
        return ExactDrainerPickupWindow::default();
    }
    if max_steps == Some(1) {
        return exact_drainer_pickup_window_small_budget_with_hash(
            board,
            color,
            start,
            1,
            min_any_score,
            need_score,
            need_denial,
            opponent_mana,
            board_hash,
        );
    }
    if max_steps.is_some_and(|limit| {
        exact_drainer_pickup_steps_lower_bound(
            board,
            color,
            start,
            min_any_score,
            need_score,
            need_denial,
            opponent_mana,
        )
        .is_some_and(|lower_bound| lower_bound > limit)
    }) {
        return ExactDrainerPickupWindow::default();
    }
    if let Some(limit @ 2..=3) = max_steps {
        return exact_drainer_pickup_window_small_budget_with_hash(
            board,
            color,
            start,
            limit,
            min_any_score,
            need_score,
            need_denial,
            opponent_mana,
            board_hash,
        );
    }

    let key = ExactDrainerPickupWindowQueryKey {
        board_hash,
        color,
        start,
        max_steps,
        min_any_score,
        need_score,
        need_denial,
        opponent_mana,
    };
    if let Some(cached) = EXACT_DRAINER_PICKUP_WINDOW_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(cached) = cache.entries.get(&key).copied() {
            return Some(cached);
        }
        if need_score && min_any_score > 1 {
            let base_key = ExactDrainerPickupWindowQueryKey {
                min_any_score: 1,
                ..key
            };
            if let Some(cached) = cache.entries.get(&base_key).copied() {
                let derived = exact_drainer_pickup_window_for_min_any_score(cached, min_any_score);
                return if cache_write_allowed() {
                    cache.entries.insert(key, derived);
                    Some(derived)
                } else {
                    Some(ExactDrainerPickupWindow::default())
                };
            }
        }
        if need_score ^ need_denial {
            let superset_key = ExactDrainerPickupWindowQueryKey {
                need_score: true,
                need_denial: true,
                ..key
            };
            if let Some(cached) = cache.entries.get(&superset_key).copied() {
                let derived = exact_drainer_pickup_window_for_axes(cached, need_score, need_denial);
                return if cache_write_allowed() {
                    cache.entries.insert(key, derived);
                    Some(derived)
                } else {
                    Some(ExactDrainerPickupWindow::default())
                };
            }
            if need_score && min_any_score > 1 {
                let superset_base_key = ExactDrainerPickupWindowQueryKey {
                    min_any_score: 1,
                    ..superset_key
                };
                if let Some(cached) = cache.entries.get(&superset_base_key).copied() {
                    let derived = exact_drainer_pickup_window_for_axes(
                        exact_drainer_pickup_window_for_min_any_score(cached, min_any_score),
                        need_score,
                        need_denial,
                    );
                    return if cache_write_allowed() {
                        cache.entries.insert(key, derived);
                        Some(derived)
                    } else {
                        Some(ExactDrainerPickupWindow::default())
                    };
                }
            }
        }
        None
    }) {
        return cached;
    }

    let result = exact_drainer_pickup_window_uncached_with_hash(
        board,
        color,
        start,
        max_steps,
        min_any_score,
        need_score,
        need_denial,
        opponent_mana,
        board_hash,
    );
    if cache_write_allowed() {
        EXACT_DRAINER_PICKUP_WINDOW_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_DRAINER_PICKUP_WINDOW_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, result);
        });
        result
    } else {
        ExactDrainerPickupWindow::default()
    }
}

#[inline]
fn exact_best_drainer_pickup_path_with_hash(
    board: &Board,
    color: Color,
    start: Location,
    max_steps: Option<i32>,
    board_hash: u64,
) -> Option<ExactDrainerPickupPath> {
    if checkpoint() {
        return None;
    }
    let key = ExactPickupPathQueryKey {
        board_hash,
        color,
        start,
        max_steps,
    };
    if let Some(cached) =
        EXACT_PICKUP_PATH_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached;
    }

    if max_steps.is_some_and(|limit| {
        exact_any_drainer_pickup_remaining_steps_lower_bound(board, start, ExactActorPayload::None)
            .is_some_and(|lower_bound| lower_bound > limit)
    }) {
        if cache_write_allowed() {
            EXACT_PICKUP_PATH_CACHE.with(|cache| {
                let mut cache = cache.borrow_mut();
                if cache.entries.len() >= EXACT_PICKUP_PATH_CACHE_MAX_ENTRIES
                    && !cache.entries.contains_key(&key)
                {
                    cache.entries.clear();
                }
                cache.entries.insert(key, None);
            });
        }
        return None;
    }

    let mut actor_move_memo = ExactDrainerMoveMemo::new();
    let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);
    let mut seen = ExactPayloadSeen::new();
    let start_state = (start, ExactActorPayload::None, 0);
    queue.push_back(start_state);
    seen.insert(start, ExactActorPayload::None);
    let mut best: Option<ExactDrainerPickupPath> = None;
    let max_mana_value = Mana::Supermana.score(color);

    while let Some((location, payload, steps)) = queue.pop_front() {
        if checkpoint() {
            return None;
        }
        if max_steps.is_some_and(|limit| steps > limit) {
            continue;
        }
        if let Some(best_path) = best {
            if !exact_pickup_path_future_can_beat_best(best_path, steps, max_mana_value) {
                break;
            }
        }
        if let ExactActorPayload::Mana(mana) = payload {
            if matches!(board.square(location), Square::ManaPool { .. }) {
                let candidate = ExactDrainerPickupPath {
                    path_steps: steps.saturating_sub(1),
                    total_moves: steps,
                    mana_value: mana.score(color),
                    mana,
                };
                if exact_pickup_path_beats(candidate, best) {
                    best = Some(candidate);
                }
            }
        }
        if max_steps.is_some() || best.is_some() {
            if let Some(lower_bound) =
                exact_any_drainer_pickup_remaining_steps_lower_bound(board, location, payload)
            {
                if max_steps.is_some_and(|limit| steps.saturating_add(lower_bound) > limit) {
                    continue;
                }
                if let Some(best_path) = best {
                    if !exact_pickup_path_future_can_beat_best(
                        best_path,
                        steps.saturating_add(lower_bound),
                        max_mana_value,
                    ) {
                        continue;
                    }
                }
            }
        }

        for &next in location.nearby_locations_ref() {
            if let Some(next_payload) =
                actor_move_memo.payload_after_move(board, color, payload, next)
            {
                if seen.insert(next, next_payload) {
                    queue.push_back((next, next_payload, steps + 1));
                }
            }
        }
    }

    if cache_write_allowed() {
        EXACT_PICKUP_PATH_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_PICKUP_PATH_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, best);
        });
        best
    } else {
        None
    }
}

fn find_awake_drainer(board: &Board, color: Color) -> Option<Location> {
    board.occupied().find_map(|(location, item)| {
        let mon = item.mon()?;
        (mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted())
            .then_some(location)
    })
}

fn exact_drainer_to_any_mana_steps(board: &Board, color: Color, start: Location) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    let key = ExactDrainerToManaQueryKey {
        board_hash: exact_board_hash(board),
        color,
        start,
    };
    if let Some(cached) =
        EXACT_DRAINER_TO_MANA_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached;
    }

    let result = exact_shortest_payload_state(
        board,
        start,
        MonKind::Drainer,
        color,
        ExactActorPayload::None,
        false,
        None,
        |_, payload| matches!(payload, ExactActorPayload::Mana(_)),
    )
    .map(|result| result.steps);

    if cache_write_allowed() {
        EXACT_DRAINER_TO_MANA_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_DRAINER_TO_MANA_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, result);
        });
        result
    } else {
        None
    }
}

#[inline]
fn exact_distance_to_wanted_mana_steps_lower_bound(
    board: &Board,
    wanted: Mana,
    start: Location,
) -> Option<i32> {
    board
        .occupied()
        .filter_map(|(location, item)| match item {
            Item::Mana { mana } if *mana == wanted => Some(start.distance(&location)),
            _ => None,
        })
        .min()
}

fn exact_secure_specific_mana_steps_this_turn(
    game: &MonsGame,
    color: Color,
    wanted: Mana,
) -> Option<i32> {
    let remaining_moves = if game.active_color == color {
        (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0)
    } else {
        Config::MONS_MOVES_PER_TURN
    };
    exact_secure_specific_mana_steps_on_board(&game.board, color, wanted, remaining_moves)
}

fn can_secure_specific_mana_on_board(
    board: &Board,
    color: Color,
    wanted: Mana,
    remaining_moves: i32,
) -> bool {
    exact_secure_specific_mana_steps_on_board(board, color, wanted, remaining_moves).is_some()
}

pub(crate) fn exact_secure_specific_mana_steps_on_board(
    board: &Board,
    color: Color,
    wanted: Mana,
    remaining_moves: i32,
) -> Option<i32> {
    if remaining_moves < 0 || checkpoint() {
        return None;
    }
    let drainer_location = find_awake_drainer(board, color)?;
    let holding_wanted = matches!(
        board.item(drainer_location),
        Some(Item::MonWithMana { mana, .. }) if *mana == wanted
    );
    if !holding_wanted
        && exact_distance_to_wanted_mana_steps_lower_bound(board, wanted, drainer_location)
            .is_none_or(|lower_bound| lower_bound > remaining_moves)
    {
        return None;
    }

    let mons_moves_count =
        (Config::MONS_MOVES_PER_TURN - remaining_moves).clamp(0, Config::MONS_MOVES_PER_TURN);
    let state = exact_secure_mana_state_key_from_board(board, color, mons_moves_count);
    let key = ExactSecureManaQueryKey {
        state,
        color,
        wanted,
    };
    if let Some(cached) =
        EXACT_SECURE_MANA_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached;
    }

    let game = MonsGame::new_simulation_state(
        board.clone(),
        0,
        0,
        color,
        Config::ACTIONS_PER_TURN,
        0,
        mons_moves_count,
        0,
        0,
        2,
    );
    // Non-terminal same-turn states still have the mana move available; exhausting it here
    // would make the synthetic game auto-end after one mon move and miss multi-step drainer paths.
    exact_secure_specific_mana_steps_in_game_with_key(&game, color, wanted, state)
}

fn exact_secure_specific_mana_steps_in_game_with_key(
    game: &MonsGame,
    color: Color,
    wanted: Mana,
    state: ExactSecureManaStateKey,
) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    let mut game = game.clone_for_simulation();
    EXACT_SECURE_MANA_CACHE.with(|cache| {
        exact_secure_specific_mana_steps_in_game_with_key_mut(
            &mut game,
            color,
            wanted,
            state,
            &mut cache.borrow_mut(),
        )
    })
}

fn exact_secure_specific_mana_steps_in_game_with_key_mut(
    game: &mut MonsGame,
    color: Color,
    wanted: Mana,
    state: ExactSecureManaStateKey,
    cache: &mut ExactSecureManaCache,
) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    let drainer_location = find_awake_drainer(&game.board, color)?;
    exact_secure_specific_mana_steps_in_game_with_key_at_mut(
        game,
        color,
        drainer_location,
        wanted,
        state,
        cache,
    )
}

fn exact_secure_specific_mana_steps_in_game_with_key_at_mut(
    game: &mut MonsGame,
    color: Color,
    drainer_location: Location,
    wanted: Mana,
    state: ExactSecureManaStateKey,
    cache: &mut ExactSecureManaCache,
) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    let key = ExactSecureManaQueryKey {
        state,
        color,
        wanted,
    };
    if let Some(cached) = cache.entries.get(&key).copied() {
        return cached;
    }

    if !cache.visiting.insert(key) {
        return None;
    }

    let result = exact_secure_specific_mana_steps_in_game_uncached_at_mut(
        game,
        color,
        drainer_location,
        wanted,
        state,
        cache,
    );
    cache.visiting.remove(&key);
    if cache_write_allowed() {
        if cache.entries.len() >= EXACT_SECURE_MANA_CACHE_MAX_ENTRIES
            && !cache.entries.contains_key(&key)
        {
            cache.entries.clear();
            cache.visiting.clear();
        }
        cache.entries.insert(key, result);
        result
    } else {
        None
    }
}

fn exact_secure_specific_mana_steps_in_game_uncached_at_mut(
    game: &mut MonsGame,
    color: Color,
    drainer_location: Location,
    wanted: Mana,
    state_key: ExactSecureManaStateKey,
    cache: &mut ExactSecureManaCache,
) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    let holding_wanted = matches!(
        game.board.item(drainer_location),
        Some(Item::MonWithMana { mana, .. }) if *mana == wanted
    );
    if holding_wanted
        && is_drainer_exactly_safe_next_turn_on_board(&game.board, color, drainer_location)
    {
        return Some(0);
    }
    if checkpoint() {
        return None;
    }

    if game.active_color != color || !game.player_can_move_mon() {
        return None;
    }
    let remaining_moves = (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0);
    if !holding_wanted
        && exact_distance_to_wanted_mana_steps_lower_bound(&game.board, wanted, drainer_location)
            .is_none_or(|lower_bound| lower_bound > remaining_moves)
    {
        return None;
    }

    let mut best = None;
    for &next in drainer_location.nearby_locations_ref() {
        if checkpoint() {
            return None;
        }
        if !holding_wanted {
            let next_picks_wanted = matches!(
                game.board.item(next),
                Some(Item::Mana { mana }) if *mana == wanted
            );
            let remaining_after_step = remaining_moves.saturating_sub(1);
            if !next_picks_wanted
                && exact_distance_to_wanted_mana_steps_lower_bound(&game.board, wanted, next)
                    .is_none_or(|lower_bound| lower_bound > remaining_after_step)
            {
                continue;
            }
        }
        let Some(transition) =
            exact_apply_secure_drainer_walk_in_place(game, state_key, drainer_location, next)
        else {
            if checkpoint() {
                return None;
            }
            continue;
        };
        if checkpoint() {
            exact_undo_secure_drainer_walk(game, transition.undo);
            return None;
        }
        let candidate = if transition.scored_mana == Some(wanted) {
            Some(1)
        } else {
            let child = exact_secure_specific_mana_steps_in_game_with_key_at_mut(
                game,
                color,
                next,
                wanted,
                transition.after_key,
                cache,
            );
            if child.is_none() && checkpoint() {
                exact_undo_secure_drainer_walk(game, transition.undo);
                return None;
            }
            child.map(|next_steps| next_steps.saturating_add(1))
        };
        exact_undo_secure_drainer_walk(game, transition.undo);
        if checkpoint() {
            return None;
        }
        if let Some(candidate) = candidate {
            best = Some(best.map_or(candidate, |current: i32| current.min(candidate)));
            if candidate == 1 {
                break;
            }
        }
    }

    best
}

pub(crate) fn exact_secure_specific_mana_path_from(
    game: &MonsGame,
    color: Color,
    start: Location,
    wanted: Mana,
) -> Option<Vec<Location>> {
    if checkpoint() {
        return None;
    }
    let mut visiting =
        ExactHashSet::with_capacity_and_hasher(EXACT_BFS_CAPACITY, ExactBuildHasher::default());
    exact_secure_specific_mana_path_from_uncached(
        game,
        color,
        start,
        wanted,
        exact_secure_mana_state_key(game),
        &mut visiting,
    )
}

fn exact_secure_specific_mana_path_from_uncached(
    game: &MonsGame,
    color: Color,
    start: Location,
    wanted: Mana,
    state_key: ExactSecureManaStateKey,
    visiting: &mut ExactHashSet<ExactSecureManaStateKey>,
) -> Option<Vec<Location>> {
    if checkpoint() {
        return None;
    }
    if !visiting.insert(state_key) {
        return None;
    }

    let result = if matches!(
        game.board.item(start),
        Some(Item::MonWithMana { mana, .. }) if *mana == wanted
    ) && is_drainer_exactly_safe_next_turn_on_board(&game.board, color, start)
    {
        Some(Vec::new())
    } else if game.active_color != color || !game.player_can_move_mon() {
        None
    } else {
        let mut best_path: Option<Vec<Location>> = None;

        for &next in start.nearby_locations_ref() {
            if checkpoint() {
                visiting.remove(&state_key);
                return None;
            }
            let Some(transition) = exact_apply_secure_drainer_walk(game, state_key, start, next)
            else {
                if checkpoint() {
                    visiting.remove(&state_key);
                    return None;
                }
                continue;
            };

            let candidate_path = if transition.scored_mana == Some(wanted) {
                Some(vec![next])
            } else if exact_secure_specific_mana_steps_in_game_with_key(
                &transition.after,
                color,
                wanted,
                transition.after_key,
            )
            .is_some()
            {
                let Some(next_start) = find_awake_drainer(&transition.after.board, color) else {
                    continue;
                };
                let Some(mut suffix) = exact_secure_specific_mana_path_from_uncached(
                    &transition.after,
                    color,
                    next_start,
                    wanted,
                    transition.after_key,
                    visiting,
                ) else {
                    if checkpoint() {
                        visiting.remove(&state_key);
                        return None;
                    }
                    continue;
                };
                let mut path = Vec::with_capacity(suffix.len() + 1);
                path.push(next);
                path.append(&mut suffix);
                Some(path)
            } else {
                None
            };

            if checkpoint() {
                visiting.remove(&state_key);
                return None;
            }

            let Some(candidate_path) = candidate_path else {
                continue;
            };
            let replace = match &best_path {
                None => true,
                Some(current) => candidate_path.len() < current.len(),
            };
            if replace {
                best_path = Some(candidate_path);
            }
        }

        best_path
    };

    visiting.remove(&state_key);
    result
}

#[derive(Debug, Clone)]
struct ExactSecureDrainerWalkTransition {
    after: MonsGame,
    after_key: ExactSecureManaStateKey,
    scored_mana: Option<Mana>,
}

#[derive(Debug, Clone, Copy)]
struct ExactSecureGameSnapshot {
    white_score: i32,
    black_score: i32,
    active_color: Color,
    actions_used_count: i32,
    mana_moves_count: i32,
    mons_moves_count: i32,
    white_potions_count: i32,
    black_potions_count: i32,
    turn_number: i32,
}

impl ExactSecureGameSnapshot {
    #[inline]
    fn capture(game: &MonsGame) -> Self {
        Self {
            white_score: game.white_score,
            black_score: game.black_score,
            active_color: game.active_color,
            actions_used_count: game.actions_used_count,
            mana_moves_count: game.mana_moves_count,
            mons_moves_count: game.mons_moves_count,
            white_potions_count: game.white_potions_count,
            black_potions_count: game.black_potions_count,
            turn_number: game.turn_number,
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct ExactSecureTouchedItem {
    location: Location,
    before: Option<Item>,
}

#[derive(Debug, Clone, Copy)]
struct ExactSecureTouchedItems {
    items: [Option<ExactSecureTouchedItem>; EXACT_SECURE_TOUCHED_ITEMS_CAPACITY],
    len: usize,
    seen_mask: u128,
}

impl ExactSecureTouchedItems {
    #[inline]
    fn new() -> Self {
        Self {
            items: [None; EXACT_SECURE_TOUCHED_ITEMS_CAPACITY],
            len: 0,
            seen_mask: 0,
        }
    }

    #[inline]
    fn push_once(&mut self, board: &Board, location: Location) {
        let seen_bit = 1u128 << location.index();
        if self.seen_mask & seen_bit != 0 {
            return;
        }

        assert!(self.len < EXACT_SECURE_TOUCHED_ITEMS_CAPACITY);
        self.items[self.len] = Some(ExactSecureTouchedItem {
            location,
            before: board.item(location).copied(),
        });
        self.len += 1;
        self.seen_mask |= seen_bit;
    }
}

#[derive(Debug, Clone, Copy)]
struct ExactSecureDrainerWalkUndo {
    snapshot: ExactSecureGameSnapshot,
    touched_items: ExactSecureTouchedItems,
}

#[derive(Debug, Clone, Copy)]
struct ExactSecureDrainerWalkMutation {
    after_key: ExactSecureManaStateKey,
    scored_mana: Option<Mana>,
    undo: ExactSecureDrainerWalkUndo,
}

#[inline]
fn exact_secure_board_hash_after_touched_items(
    before_hash: u64,
    board: &Board,
    touched_items: ExactSecureTouchedItems,
) -> u64 {
    let mut after_hash = before_hash;
    for idx in 0..touched_items.len {
        let entry = touched_items.items[idx].unwrap();
        let index = entry.location.index();
        if let Some(item) = entry.before {
            after_hash ^= exact_secure_board_entry_hash(index, item);
        }
        if let Some(item) = board.items[index] {
            after_hash ^= exact_secure_board_entry_hash(index, item);
        }
    }
    after_hash
}

#[inline]
fn exact_undo_secure_drainer_walk(game: &mut MonsGame, undo: ExactSecureDrainerWalkUndo) {
    game.white_score = undo.snapshot.white_score;
    game.black_score = undo.snapshot.black_score;
    game.active_color = undo.snapshot.active_color;
    game.actions_used_count = undo.snapshot.actions_used_count;
    game.mana_moves_count = undo.snapshot.mana_moves_count;
    game.mons_moves_count = undo.snapshot.mons_moves_count;
    game.white_potions_count = undo.snapshot.white_potions_count;
    game.black_potions_count = undo.snapshot.black_potions_count;
    game.turn_number = undo.snapshot.turn_number;

    for idx in 0..undo.touched_items.len {
        let entry = undo.touched_items.items[idx].unwrap();
        match entry.before {
            Some(item) => game.board.put(item, entry.location),
            None => game.board.remove_item(entry.location),
        }
    }
}

fn exact_apply_secure_drainer_walk_in_place(
    game: &mut MonsGame,
    state_key: ExactSecureManaStateKey,
    from: Location,
    to: Location,
) -> Option<ExactSecureDrainerWalkMutation> {
    if checkpoint() || !exact_walk_destination_plausible(&game.board, from, to) {
        return None;
    }

    let start_item = game.board.item(from).copied()?;
    let start_mon = start_item.mon().copied()?;
    if start_mon.kind != MonKind::Drainer || start_mon.is_fainted() {
        return None;
    }

    let target_item = game.board.item(to).copied();
    match target_item {
        Some(Item::Mon { .. })
        | Some(Item::MonWithMana { .. })
        | Some(Item::MonWithConsumable { .. })
        | Some(Item::Consumable {
            consumable: Consumable::Bomb | Consumable::Potion,
        }) => return None,
        Some(Item::Consumable {
            consumable: Consumable::BombOrPotion,
        }) if start_item.consumable().is_none() && start_item.mana().is_none() => return None,
        Some(Item::Mana { .. }) | Some(Item::Consumable { .. }) | None => {}
    }

    let snapshot = ExactSecureGameSnapshot::capture(game);
    let mut touched_items = ExactSecureTouchedItems::new();
    let mut white_regular_mana_count = state_key.white_regular_mana_count;
    let mut black_regular_mana_count = state_key.black_regular_mana_count;
    touched_items.push_once(&game.board, from);
    touched_items.push_once(&game.board, to);

    game.mons_moves_count += 1;
    game.board.remove_item(from);
    game.board.put(start_item, to);

    match target_item {
        Some(Item::Mon { .. })
        | Some(Item::MonWithMana { .. })
        | Some(Item::MonWithConsumable { .. }) => {
            unreachable!("occupied mon destination should be rejected before mutation")
        }
        Some(Item::Mana { mana }) => {
            exact_adjust_regular_mana_counts(
                &mut white_regular_mana_count,
                &mut black_regular_mana_count,
                mana,
                -1,
            );
            if let Some(start_mana) = start_item.mana() {
                exact_adjust_regular_mana_counts(
                    &mut white_regular_mana_count,
                    &mut black_regular_mana_count,
                    *start_mana,
                    1,
                );
                game.board.put(Item::Mana { mana: *start_mana }, from);
            }
            game.board.put(
                Item::MonWithMana {
                    mon: start_mon,
                    mana,
                },
                to,
            );
        }
        Some(Item::Consumable { consumable }) => match consumable {
            Consumable::Bomb | Consumable::Potion => {
                unreachable!("resolved consumable destination should be rejected before mutation")
            }
            Consumable::BombOrPotion => {
                if start_item.consumable().is_some() || start_item.mana().is_some() {
                    if start_mon.color == Color::White {
                        game.white_potions_count += 1;
                    } else {
                        game.black_potions_count += 1;
                    }
                    game.board.put(start_item, to);
                } else {
                    unreachable!("empty drainer pickup should be rejected before mutation")
                }
            }
        },
        None => {}
    }

    let scored_mana = match game.board.square(to) {
        Square::ManaPool { .. } => start_item.mana().copied(),
        Square::Regular
        | Square::ConsumableBase
        | Square::ManaBase { .. }
        | Square::SupermanaBase
        | Square::MonBase { .. } => None,
    };
    if let Some(mana) = scored_mana {
        let score = mana.score(game.active_color);
        if game.active_color == Color::White {
            game.white_score += score;
        } else {
            game.black_score += score;
        }
        match game.board.item(to).copied() {
            Some(Item::Mon { mon })
            | Some(Item::MonWithMana { mon, .. })
            | Some(Item::MonWithConsumable { mon, .. }) => {
                game.board.put(Item::Mon { mon }, to);
            }
            Some(Item::Mana { .. }) | Some(Item::Consumable { .. }) | None => {
                game.board.remove_item(to);
            }
        }
    }

    let first_turn = game.turn_number == 1;
    let player_can_move_mon = game.mons_moves_count < Config::MONS_MOVES_PER_TURN;
    let player_can_move_mana = !first_turn && game.mana_moves_count < Config::MANA_MOVES_PER_TURN;
    let active_regular_mana_count = if game.active_color == Color::White {
        white_regular_mana_count
    } else {
        black_regular_mana_count
    };
    let should_end_turn = game.white_score < Config::TARGET_SCORE
        && game.black_score < Config::TARGET_SCORE
        && if first_turn {
            !player_can_move_mon
        } else {
            !player_can_move_mana || (!player_can_move_mon && active_regular_mana_count == 0)
        };
    if should_end_turn {
        let next_active_color = game.active_color.other();
        game.active_color = next_active_color;
        game.turn_number += 1;
        game.actions_used_count = 0;
        game.mana_moves_count = 0;
        game.mons_moves_count = 0;

        for index in 0..game.board.items.len() {
            if checkpoint() {
                exact_undo_secure_drainer_walk(
                    game,
                    ExactSecureDrainerWalkUndo {
                        snapshot,
                        touched_items,
                    },
                );
                return None;
            }
            let Some(Item::Mon { mon }) = game.board.items[index] else {
                continue;
            };
            if mon.color != next_active_color || !mon.is_fainted() {
                continue;
            }
            let mon_location = Location::from_index(index);
            touched_items.push_once(&game.board, mon_location);
            let mut mon = mon;
            mon.decrease_cooldown();
            game.board.items[index] = Some(Item::Mon { mon });
        }
    }

    let after_key = ExactSecureManaStateKey {
        board_hash: exact_secure_board_hash_after_touched_items(
            state_key.board_hash,
            &game.board,
            touched_items,
        ),
        active_color: game.active_color,
        mons_moves_count: game.mons_moves_count,
        white_regular_mana_count,
        black_regular_mana_count,
    };
    if checkpoint() {
        exact_undo_secure_drainer_walk(
            game,
            ExactSecureDrainerWalkUndo {
                snapshot,
                touched_items,
            },
        );
        return None;
    }
    Some(ExactSecureDrainerWalkMutation {
        after_key,
        scored_mana,
        undo: ExactSecureDrainerWalkUndo {
            snapshot,
            touched_items,
        },
    })
}

fn exact_apply_secure_drainer_walk(
    game: &MonsGame,
    state_key: ExactSecureManaStateKey,
    from: Location,
    to: Location,
) -> Option<ExactSecureDrainerWalkTransition> {
    let mut after = game.clone_for_simulation();
    let mutation = exact_apply_secure_drainer_walk_in_place(&mut after, state_key, from, to)?;
    Some(ExactSecureDrainerWalkTransition {
        after,
        after_key: mutation.after_key,
        scored_mana: mutation.scored_mana,
    })
}

fn can_attack_opponent_drainer_exact_with_hash(
    game: &MonsGame,
    color: Color,
    board_hash: u64,
) -> bool {
    let Some(target) = find_awake_drainer(&game.board, color.other()) else {
        return false;
    };
    can_attack_target_on_board_with_hash(
        &game.board,
        board_hash,
        color,
        color.other(),
        target,
        if game.active_color == color {
            (Config::MONS_MOVES_PER_TURN - game.mons_moves_count).max(0)
        } else {
            Config::MONS_MOVES_PER_TURN
        },
        if game.active_color == color {
            game.player_can_use_action()
        } else {
            true
        },
    )
}

fn demon_has_line_attack(board: &Board, from: Location, target: Location) -> bool {
    let di = (from.i - target.i).abs();
    let dj = (from.j - target.j).abs();
    if !((di == 2 && dj == 0) || (di == 0 && dj == 2)) {
        return false;
    }
    let middle = from.location_between(&target);
    board.item(middle).is_none()
        && !matches!(
            board.square(middle),
            Square::SupermanaBase | Square::MonBase { .. }
        )
}

fn exact_tactical_spirit_summary(
    board: &Board,
    color: Color,
    remaining_mon_moves: i32,
    can_use_action: bool,
    fields: u8,
) -> ExactSpiritSummary {
    if remaining_mon_moves < 0 || fields == 0 || checkpoint() {
        return ExactSpiritSummary::default();
    }
    let key = ExactTacticalSpiritSummaryKey {
        board_hash: exact_board_hash(board),
        color,
        remaining_mon_moves,
        can_use_action,
        fields,
    };
    if let Some(cached) =
        EXACT_SPIRIT_TACTICAL_SUMMARY_CACHE.with(|cache| cache.borrow().entries.get(&key).copied())
    {
        return cached;
    }
    if let Some(cached) = EXACT_SPIRIT_TACTICAL_SUMMARY_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        for &superset_fields in exact_tactical_spirit_superset_fields(fields) {
            let superset_key = ExactTacticalSpiritSummaryKey {
                fields: superset_fields,
                ..key
            };
            if let Some(cached) = cache.entries.get(&superset_key).copied() {
                let derived = exact_tactical_spirit_summary_for_fields(cached, fields);
                return if cache_write_allowed() {
                    cache.entries.insert(key, derived);
                    Some(derived)
                } else {
                    Some(ExactSpiritSummary::default())
                };
            }
        }
        None
    }) {
        return cached;
    }

    let summary = exact_tactical_spirit_summary_uncached(
        board,
        color,
        remaining_mon_moves,
        can_use_action,
        fields,
        key.board_hash,
    );
    if cache_write_allowed() {
        EXACT_SPIRIT_TACTICAL_SUMMARY_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_SPIRIT_SUMMARY_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, summary);
        });
        summary
    } else {
        ExactSpiritSummary::default()
    }
}

fn exact_passive_spirit_summary(
    board: &Board,
    color: Color,
    remaining_mon_moves: i32,
    can_use_action: bool,
) -> ExactSpiritSummary {
    if remaining_mon_moves < 0 || !can_use_action || checkpoint() {
        return ExactSpiritSummary::default();
    }

    let mut best = ExactSpiritSummary::default();

    for (location, item) in board.occupied() {
        if checkpoint() {
            return ExactSpiritSummary::default();
        }
        let Some(mon) = item.mon() else {
            continue;
        };
        if mon.color != color || mon.kind != MonKind::Spirit || mon.is_fainted() {
            continue;
        }

        for (spirit_pos, _) in
            reachable_spirit_positions(board, location, color, remaining_mon_moves)
        {
            if checkpoint() {
                return ExactSpiritSummary::default();
            }
            if matches!(board.square(spirit_pos), Square::MonBase { .. }) {
                continue;
            }

            let mut reachable_targets = 0;
            let mut setup_gain = 0;
            let mut supermana_progress = false;
            let mut opponent_mana_progress = false;

            for &target in spirit_pos.reachable_by_spirit_action_ref() {
                if checkpoint() {
                    return ExactSpiritSummary::default();
                }
                let Some(target_item) = board.item(target).copied() else {
                    continue;
                };
                if !spirit_target_allowed(target_item) {
                    continue;
                }
                if !target
                    .nearby_locations_ref()
                    .iter()
                    .copied()
                    .any(|destination| {
                        spirit_destination_allowed(board, target, target_item, destination)
                    })
                {
                    continue;
                }

                reachable_targets += 1;
                match target_item {
                    Item::Mana {
                        mana: Mana::Supermana,
                    } => {
                        supermana_progress = true;
                        setup_gain = setup_gain.max(2);
                    }
                    Item::Mana {
                        mana: Mana::Regular(mana_color),
                    } if mana_color == color.other() => {
                        opponent_mana_progress = true;
                        setup_gain = setup_gain.max(2);
                    }
                    Item::Mon { mon }
                    | Item::MonWithMana { mon, .. }
                    | Item::MonWithConsumable { mon, .. } => {
                        if mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted() {
                            setup_gain = setup_gain.max(2);
                        } else if mon.color != color && !mon.is_fainted() {
                            setup_gain = setup_gain.max(1);
                        }
                    }
                    Item::Mana { .. } | Item::Consumable { .. } => {}
                }
            }

            if supermana_progress {
                best.supermana_progress = true;
            }
            if opponent_mana_progress {
                best.opponent_mana_progress = true;
            }

            let utility = reachable_targets
                .min(EXACT_SPIRIT_UTILITY_CAP)
                .max((1 + setup_gain).min(EXACT_SPIRIT_UTILITY_CAP));
            if utility > best.utility {
                best.utility = utility;
                best.next_turn_setup_gain = setup_gain;
            } else if utility == best.utility {
                best.next_turn_setup_gain = best.next_turn_setup_gain.max(setup_gain);
            }
        }
    }

    if checkpoint() {
        ExactSpiritSummary::default()
    } else {
        best
    }
}

fn exact_tactical_spirit_summary_uncached(
    board: &Board,
    color: Color,
    remaining_mon_moves: i32,
    can_use_action: bool,
    fields: u8,
    board_hash: u64,
) -> ExactSpiritSummary {
    if !can_use_action || checkpoint() {
        return ExactSpiritSummary::default();
    }

    let need_score = fields & EXACT_TACTICAL_SPIRIT_NEED_SCORE != 0;
    let need_denial = fields & EXACT_TACTICAL_SPIRIT_NEED_DENIAL != 0;
    let need_progress = fields & EXACT_TACTICAL_SPIRIT_NEED_PROGRESS != 0;
    let before_window = exact_best_immediate_tactical_window_on_board_with_hash(
        board,
        color,
        remaining_mon_moves,
        need_score,
        need_denial,
        board_hash,
    );
    if checkpoint() {
        return ExactSpiritSummary::default();
    }
    let before_same_turn_score = before_window.best_score;
    let before_same_turn_opponent_score = before_window.best_opponent_mana_score;
    let max_same_turn_score = if need_score {
        Mana::Supermana.score(color)
    } else {
        0
    };
    let max_same_turn_opponent_score = if need_denial {
        Mana::Regular(color.other()).score(color)
    } else {
        0
    };
    let mut best = ExactSpiritSummary::default();
    let mut after_window_cache: ExactHashMap<
        ExactTacticalSpiritAfterWindowKey,
        ExactImmediateTacticalWindow,
    > = ExactHashMap::default();
    let base_zero_move_counts = exact_zero_move_tactical_counts(board, color);
    if checkpoint() {
        return ExactSpiritSummary::default();
    }

    for (location, item) in board.occupied() {
        if checkpoint() {
            return ExactSpiritSummary::default();
        }
        let Some(mon) = item.mon() else {
            continue;
        };
        if mon.color != color || mon.kind != MonKind::Spirit || mon.is_fainted() {
            continue;
        }

        for (spirit_pos, spirit_steps) in
            reachable_spirit_positions(board, location, color, remaining_mon_moves)
        {
            if checkpoint() {
                return ExactSpiritSummary::default();
            }
            if matches!(board.square(spirit_pos), Square::MonBase { .. }) {
                continue;
            }
            let mut action_board = board.clone();
            let action_board_hash = if spirit_pos != location {
                let spirit_destination_before = board.item(spirit_pos).copied();
                action_board.remove_item(location);
                action_board.put(*item, spirit_pos);
                exact_board_hash_after_touched_items(
                    board_hash,
                    &action_board,
                    &[
                        ExactTouchedBoardItem {
                            location,
                            before: Some(*item),
                        },
                        ExactTouchedBoardItem {
                            location: spirit_pos,
                            before: spirit_destination_before,
                        },
                    ],
                )
            } else {
                board_hash
            };
            let remaining_after_action = remaining_mon_moves.saturating_sub(spirit_steps);
            let mut action_budget_one_summary: Option<ExactBudgetOneTacticalSummary> = None;
            let action_reach_mask = if remaining_after_action > 1 {
                Some(exact_immediate_tactical_reach_mask(
                    &action_board,
                    color,
                    remaining_after_action,
                ))
            } else {
                None
            };
            if checkpoint() {
                return ExactSpiritSummary::default();
            }

            for &target in spirit_pos.reachable_by_spirit_action_ref() {
                if checkpoint() {
                    return ExactSpiritSummary::default();
                }
                let Some(target_item) = action_board.item(target).copied() else {
                    continue;
                };
                if !spirit_target_allowed(target_item) {
                    continue;
                }
                for &dest in target.nearby_locations_ref() {
                    if checkpoint() {
                        return ExactSpiritSummary::default();
                    }
                    if !spirit_destination_allowed(&action_board, target, target_item, dest) {
                        continue;
                    }
                    if remaining_after_action == 1 && action_budget_one_summary.is_none() {
                        action_budget_one_summary = Some(exact_budget_one_tactical_summary(
                            &action_board,
                            color,
                            action_board_hash,
                        ));
                        if checkpoint() {
                            return ExactSpiritSummary::default();
                        }
                    }
                    let (undo, score_delta, opponent_mana_score_delta) =
                        apply_spirit_move_preview_in_place(
                            &mut action_board,
                            target,
                            target_item,
                            dest,
                            color,
                        );
                    if checkpoint() {
                        undo_spirit_move_preview(&mut action_board, undo);
                        return ExactSpiritSummary::default();
                    }
                    let score_floor = best
                        .same_turn_score_value
                        .max(before_same_turn_score)
                        .max(score_delta);
                    let denial_floor = best
                        .same_turn_opponent_mana_score_value
                        .max(before_same_turn_opponent_score)
                        .max(opponent_mana_score_delta);
                    let need_after_score = need_score && score_floor < max_same_turn_score;
                    let need_after_denial =
                        need_denial && denial_floor < max_same_turn_opponent_score;
                    let use_base_action_board = remaining_after_action > 1
                        && action_reach_mask.as_ref().is_some_and(|mask| {
                            !mask.contains(undo.from) && !mask.contains(undo.to)
                        });
                    if use_base_action_board {
                        undo_spirit_move_preview(&mut action_board, undo);
                    }
                    let after_window = if need_after_score || need_after_denial {
                        let min_score = if need_after_score {
                            (score_floor + 1).clamp(1, max_same_turn_score) as u8
                        } else {
                            0
                        };
                        if remaining_after_action == 0 {
                            let zero_move_counts =
                                exact_zero_move_tactical_counts_after_touched_items(
                                    base_zero_move_counts,
                                    &action_board,
                                    color,
                                    &[
                                        ExactTouchedBoardItem {
                                            location: undo.from,
                                            before: undo.from_item,
                                        },
                                        ExactTouchedBoardItem {
                                            location: undo.to,
                                            before: undo.to_item,
                                        },
                                    ],
                                );
                            exact_zero_move_tactical_window_from_counts(
                                zero_move_counts,
                                min_score,
                                need_after_score,
                                need_after_denial,
                            )
                        } else if remaining_after_action == 1 {
                            let after_board_hash = exact_board_hash_after_touched_items(
                                action_board_hash,
                                &action_board,
                                &[
                                    ExactTouchedBoardItem {
                                        location: undo.from,
                                        before: undo.from_item,
                                    },
                                    ExactTouchedBoardItem {
                                        location: undo.to,
                                        before: undo.to_item,
                                    },
                                ],
                            );
                            let one_move_summary = action_budget_one_summary
                                .as_ref()
                                .expect("budget-one summary should be prepared before preview");
                            let one_move_counts =
                                exact_budget_one_tactical_counts_after_touched_locations(
                                    one_move_summary,
                                    &action_board,
                                    color,
                                    after_board_hash,
                                    &[undo.from, undo.to],
                                );
                            exact_zero_move_tactical_window_from_counts(
                                one_move_counts,
                                min_score,
                                need_after_score,
                                need_after_denial,
                            )
                        } else {
                            let after_board_hash = if use_base_action_board {
                                action_board_hash
                            } else {
                                exact_board_hash_after_touched_items(
                                    action_board_hash,
                                    &action_board,
                                    &[
                                        ExactTouchedBoardItem {
                                            location: undo.from,
                                            before: undo.from_item,
                                        },
                                        ExactTouchedBoardItem {
                                            location: undo.to,
                                            before: undo.to_item,
                                        },
                                    ],
                                )
                            };
                            let cached_need_score = need_after_score;
                            let cached_need_denial = need_after_denial;
                            let key = ExactTacticalSpiritAfterWindowKey {
                                board_hash: after_board_hash,
                                remaining_mon_moves: remaining_after_action,
                                min_score,
                                need_score: cached_need_score,
                                need_denial: cached_need_denial,
                            };
                            if let Some(cached) = after_window_cache.get(&key).copied() {
                                cached
                            } else {
                                let window = if min_score > 1 {
                                    exact_best_immediate_tactical_window_on_board_with_hash_min_score(
                                        &action_board,
                                        color,
                                        remaining_after_action,
                                        min_score,
                                        cached_need_score,
                                        cached_need_denial,
                                        after_board_hash,
                                    )
                                } else {
                                    exact_best_immediate_tactical_window_on_board_with_hash(
                                        &action_board,
                                        color,
                                        remaining_after_action,
                                        cached_need_score,
                                        cached_need_denial,
                                        after_board_hash,
                                    )
                                };
                                if checkpoint() {
                                    ExactImmediateTacticalWindow::default()
                                } else {
                                    after_window_cache.insert(key, window);
                                    window
                                }
                            }
                        }
                    } else {
                        ExactImmediateTacticalWindow::default()
                    };
                    if checkpoint() {
                        if !use_base_action_board {
                            undo_spirit_move_preview(&mut action_board, undo);
                        }
                        return ExactSpiritSummary::default();
                    }
                    let after_same_turn_score = if need_score {
                        let mut best_score = best.same_turn_score_value.max(score_delta);
                        if need_after_score {
                            best_score = best_score.max(after_window.best_score);
                        }
                        best_score
                    } else {
                        best.same_turn_score_value
                    };
                    let after_same_turn_opponent_score = if need_denial {
                        let mut best_score = best
                            .same_turn_opponent_mana_score_value
                            .max(opponent_mana_score_delta);
                        if need_after_denial {
                            best_score = best_score.max(after_window.best_opponent_mana_score);
                        }
                        best_score
                    } else {
                        best.same_turn_opponent_mana_score_value
                    };

                    if need_score
                        && best.same_turn_score_value < max_same_turn_score
                        && (score_delta > 0 || after_same_turn_score > before_same_turn_score)
                    {
                        best.same_turn_score = true;
                        best.same_turn_score_value =
                            best.same_turn_score_value.max(after_same_turn_score);
                    }
                    if need_denial
                        && best.same_turn_opponent_mana_score_value < max_same_turn_opponent_score
                        && (opponent_mana_score_delta > 0
                            || after_same_turn_opponent_score > before_same_turn_opponent_score)
                    {
                        best.same_turn_opponent_mana_score = true;
                        best.same_turn_opponent_mana_score_value = best
                            .same_turn_opponent_mana_score_value
                            .max(after_same_turn_opponent_score);
                    }
                    if need_progress
                        && !best.supermana_progress
                        && ((matches!(
                            target_item,
                            Item::Mana {
                                mana: Mana::Supermana,
                            }
                        ) && score_delta > 0)
                            || can_secure_specific_mana_on_board(
                                &action_board,
                                color,
                                Mana::Supermana,
                                remaining_after_action,
                            ))
                    {
                        best.supermana_progress = true;
                    }
                    if need_progress
                        && !best.opponent_mana_progress
                        && (opponent_mana_score_delta > 0
                            || can_secure_specific_mana_on_board(
                                &action_board,
                                color,
                                Mana::Regular(color.other()),
                                remaining_after_action,
                            ))
                    {
                        best.opponent_mana_progress = true;
                    }
                    if !use_base_action_board {
                        undo_spirit_move_preview(&mut action_board, undo);
                    }
                    if checkpoint() {
                        return ExactSpiritSummary::default();
                    }
                    if (!need_score || best.same_turn_score_value >= max_same_turn_score)
                        && (!need_denial
                            || best.same_turn_opponent_mana_score_value
                                >= max_same_turn_opponent_score)
                        && (!need_progress
                            || (best.supermana_progress && best.opponent_mana_progress))
                    {
                        return best;
                    }
                }
            }
        }
    }

    if checkpoint() {
        ExactSpiritSummary::default()
    } else {
        best
    }
}

fn reachable_spirit_positions(
    board: &Board,
    start: Location,
    color: Color,
    remaining_mon_moves: i32,
) -> Vec<(Location, i32)> {
    if remaining_mon_moves < 0 || checkpoint() {
        return Vec::new();
    }

    let key = ExactSpiritReachQueryKey {
        board_hash: exact_board_hash(board),
        start,
        color,
        remaining_mon_moves,
    };
    if let Some(cached) =
        EXACT_SPIRIT_REACH_CACHE.with(|cache| cache.borrow().entries.get(&key).cloned())
    {
        return cached;
    }

    let mut queue = VecDeque::with_capacity(EXACT_BFS_CAPACITY);
    let mut seen = ExactLocationSeen::new();
    queue.push_back((start, 0));
    seen.insert(start);
    let mut positions = Vec::new();

    while let Some((location, steps)) = queue.pop_front() {
        if checkpoint() {
            return Vec::new();
        }
        positions.push((location, steps));
        if steps >= remaining_mon_moves {
            continue;
        }
        for &next in location.nearby_locations_ref() {
            if seen.contains(next) {
                continue;
            }
            let item = board.item(next);
            let square = board.square(next);
            let passable = match item {
                Some(Item::Mon { .. })
                | Some(Item::MonWithMana { .. })
                | Some(Item::MonWithConsumable { .. })
                | Some(Item::Mana { .. }) => false,
                Some(Item::Consumable {
                    consumable: Consumable::BombOrPotion,
                }) => true,
                Some(Item::Consumable { .. }) => false,
                None => match square {
                    Square::Regular
                    | Square::ConsumableBase
                    | Square::ManaBase { .. }
                    | Square::ManaPool { .. } => true,
                    Square::MonBase {
                        kind: MonKind::Spirit,
                        color: base_color,
                    } => base_color == color,
                    Square::SupermanaBase | Square::MonBase { .. } => false,
                },
            };
            if passable {
                seen.insert(next);
                queue.push_back((next, steps + 1));
            }
        }
    }

    if cache_write_allowed() {
        EXACT_SPIRIT_REACH_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_SPIRIT_REACH_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, positions.clone());
        });
        positions
    } else {
        Vec::new()
    }
}

fn spirit_target_allowed(item: Item) -> bool {
    match item {
        Item::Mon { mon } | Item::MonWithMana { mon, .. } | Item::MonWithConsumable { mon, .. } => {
            !mon.is_fainted()
        }
        Item::Mana { .. } | Item::Consumable { .. } => true,
    }
}

fn spirit_destination_allowed(
    board: &Board,
    _target_location: Location,
    target_item: Item,
    destination: Location,
) -> bool {
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

#[derive(Debug, Clone, Copy)]
struct SpiritPreviewUndo {
    from: Location,
    from_item: Option<Item>,
    to: Location,
    to_item: Option<Item>,
}

#[derive(Debug, Clone, Copy)]
struct ExactTouchedBoardItem {
    location: Location,
    before: Option<Item>,
}

#[inline]
fn exact_board_hash_after_touched_items(
    before_hash: u64,
    board: &Board,
    touched_items: &[ExactTouchedBoardItem],
) -> u64 {
    let mut after_hash = before_hash;
    for touched in touched_items {
        let index = touched.location.index();
        if let Some(item) = touched.before {
            after_hash ^= exact_board_entry_hash(index, item);
        }
        if let Some(item) = board.items[index] {
            after_hash ^= exact_board_entry_hash(index, item);
        }
    }
    after_hash
}

fn apply_spirit_move_preview_known_items_in_place(
    board: &mut Board,
    from: Location,
    target_item: Item,
    to: Location,
    destination_item: Option<Item>,
    perspective: Color,
) -> (SpiritPreviewUndo, i32, i32) {
    let undo = SpiritPreviewUndo {
        from,
        from_item: Some(target_item),
        to,
        to_item: destination_item,
    };
    let destination_square = board.square(to);
    board.remove_item(from);

    let mut placed_item = target_item;
    let mut score_delta = 0;
    let mut opponent_mana_score_delta = 0;

    match (target_item, destination_item) {
        (Item::Mon { mon }, Some(Item::Mana { mana })) => {
            placed_item = Item::MonWithMana { mon, mana };
        }
        (Item::Mana { mana }, Some(Item::Mon { mon })) => {
            placed_item = Item::MonWithMana { mon, mana };
        }
        (Item::MonWithMana { mon, mana: old }, Some(Item::Mana { mana: new })) => {
            board.put(Item::Mana { mana: old }, from);
            placed_item = Item::MonWithMana { mon, mana: new };
        }
        (Item::Consumable { .. }, Some(Item::Mon { mon })) => {
            placed_item = Item::Mon { mon };
        }
        (Item::Mon { mon }, Some(Item::Consumable { .. })) => {
            placed_item = Item::Mon { mon };
        }
        (Item::MonWithMana { mon, mana }, Some(Item::Consumable { .. })) => {
            placed_item = Item::MonWithMana { mon, mana };
        }
        (Item::MonWithConsumable { mon, .. }, Some(Item::Consumable { .. })) => {
            placed_item = Item::MonWithConsumable {
                mon,
                consumable: Consumable::Bomb,
            };
        }
        _ => {}
    }

    if matches!(destination_square, Square::ManaPool { .. }) {
        if let Some(mana) = placed_item.mana().copied() {
            score_delta = mana.score(perspective);
            if mana == Mana::Regular(perspective.other()) {
                opponent_mana_score_delta = score_delta;
            }
            if let Some(mon) = placed_item.mon().copied() {
                placed_item = Item::Mon { mon };
            } else {
                board.remove_item(to);
                return (undo, score_delta, opponent_mana_score_delta);
            }
        }
    }

    board.put(placed_item, to);
    (undo, score_delta, opponent_mana_score_delta)
}

fn apply_spirit_move_preview_in_place(
    board: &mut Board,
    from: Location,
    target_item: Item,
    to: Location,
    perspective: Color,
) -> (SpiritPreviewUndo, i32, i32) {
    apply_spirit_move_preview_known_items_in_place(
        board,
        from,
        target_item,
        to,
        board.item(to).copied(),
        perspective,
    )
}

fn undo_spirit_move_preview(board: &mut Board, undo: SpiritPreviewUndo) {
    if let Some(item) = undo.from_item {
        board.put(item, undo.from);
    } else {
        board.remove_item(undo.from);
    }
    if let Some(item) = undo.to_item {
        board.put(item, undo.to);
    } else {
        board.remove_item(undo.to);
    }
}

pub(crate) fn exact_best_score_steps_on_board(board: &Board, color: Color) -> Option<i32> {
    exact_best_score_steps_on_board_with_hash(board, color, exact_board_hash(board))
}

fn exact_best_score_steps_on_board_with_hash(
    board: &Board,
    color: Color,
    board_hash: u64,
) -> Option<i32> {
    if checkpoint() {
        return None;
    }
    let mut best = None;
    for (location, item) in board.occupied() {
        if checkpoint() {
            return None;
        }
        match item {
            Item::MonWithMana { mon, mana } if mon.color == color && !mon.is_fainted() => {
                if let Some(steps) =
                    exact_carrier_steps_to_any_pool_with_hash(board, location, *mana, board_hash)
                {
                    best = Some(best.map_or(steps, |current: i32| current.min(steps)));
                }
            }
            Item::Mon { mon } | Item::MonWithConsumable { mon, .. }
                if mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted() =>
            {
                if let Some(path) = exact_best_drainer_pickup_path_with_hash(
                    board, color, location, None, board_hash,
                ) {
                    best = Some(best.map_or(path.total_moves, |current: i32| {
                        current.min(path.total_moves)
                    }));
                }
            }
            _ => {}
        }
    }
    if checkpoint() {
        None
    } else {
        best
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct ExactImmediateTacticalWindow {
    best_score: i32,
    best_opponent_mana_score: i32,
}

type ExactImmediateTacticalCounts = ExactZeroMoveTacticalCounts;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct ExactZeroMoveTacticalCounts {
    score_one: u32,
    score_two: u32,
    opponent_two: u32,
}

#[derive(Debug, Clone, Default)]
struct ExactBudgetOneTacticalSummary {
    counts: ExactImmediateTacticalCounts,
    by_location: ExactHashMap<Location, ExactImmediateTacticalCounts>,
}

#[inline]
fn exact_immediate_tactical_counts_for_mana(
    mana: Mana,
    color: Color,
) -> ExactImmediateTacticalCounts {
    match mana.score(color) {
        1 => ExactImmediateTacticalCounts {
            score_one: 1,
            ..ExactImmediateTacticalCounts::default()
        },
        2 => ExactImmediateTacticalCounts {
            score_two: 1,
            opponent_two: u32::from(mana == Mana::Regular(color.other())),
            ..ExactImmediateTacticalCounts::default()
        },
        _ => ExactImmediateTacticalCounts::default(),
    }
}

#[inline]
fn exact_zero_move_tactical_counts_for_item(
    board: &Board,
    location: Location,
    item: Option<Item>,
    color: Color,
) -> ExactZeroMoveTacticalCounts {
    let Some(Item::MonWithMana { mon, mana }) = item else {
        return ExactZeroMoveTacticalCounts::default();
    };
    if mon.color != color || mon.is_fainted() {
        return ExactZeroMoveTacticalCounts::default();
    }
    if !matches!(board.square(location), Square::ManaPool { .. }) {
        return ExactZeroMoveTacticalCounts::default();
    }

    exact_immediate_tactical_counts_for_mana(mana, color)
}

fn exact_zero_move_tactical_counts(board: &Board, color: Color) -> ExactZeroMoveTacticalCounts {
    if checkpoint() {
        return ExactZeroMoveTacticalCounts::default();
    }
    let mut counts = ExactZeroMoveTacticalCounts::default();
    for (location, item) in board.occupied() {
        if checkpoint() {
            return ExactZeroMoveTacticalCounts::default();
        }
        let contribution =
            exact_zero_move_tactical_counts_for_item(board, location, Some(*item), color);
        counts.score_one += contribution.score_one;
        counts.score_two += contribution.score_two;
        counts.opponent_two += contribution.opponent_two;
    }
    counts
}

#[inline]
fn exact_zero_move_tactical_window_from_counts(
    counts: ExactZeroMoveTacticalCounts,
    min_score: u8,
    need_score: bool,
    need_denial: bool,
) -> ExactImmediateTacticalWindow {
    ExactImmediateTacticalWindow {
        best_score: if need_score {
            if counts.score_two > 0 && min_score <= 2 {
                2
            } else if counts.score_one > 0 && min_score <= 1 {
                1
            } else {
                0
            }
        } else {
            0
        },
        best_opponent_mana_score: if need_denial && counts.opponent_two > 0 {
            2
        } else {
            0
        },
    }
}

fn exact_zero_move_tactical_counts_after_touched_items(
    base: ExactZeroMoveTacticalCounts,
    board: &Board,
    color: Color,
    touched_items: &[ExactTouchedBoardItem],
) -> ExactZeroMoveTacticalCounts {
    let mut counts = base;
    for touched in touched_items {
        let before = exact_zero_move_tactical_counts_for_item(
            board,
            touched.location,
            touched.before,
            color,
        );
        let after = exact_zero_move_tactical_counts_for_item(
            board,
            touched.location,
            board.item(touched.location).copied(),
            color,
        );
        debug_assert!(counts.score_one >= before.score_one);
        debug_assert!(counts.score_two >= before.score_two);
        debug_assert!(counts.opponent_two >= before.opponent_two);
        counts.score_one = counts.score_one - before.score_one + after.score_one;
        counts.score_two = counts.score_two - before.score_two + after.score_two;
        counts.opponent_two = counts.opponent_two - before.opponent_two + after.opponent_two;
    }
    counts
}

#[inline]
fn exact_budget_one_tactical_counts_for_location(
    board: &Board,
    color: Color,
    location: Location,
    board_hash: u64,
) -> ExactImmediateTacticalCounts {
    let Some(item) = board.item(location).copied() else {
        return ExactImmediateTacticalCounts::default();
    };
    match item {
        Item::MonWithMana { mon, mana } if mon.color == color && !mon.is_fainted() => {
            if exact_carrier_steps_to_any_pool_with_hash_bounded(
                board, location, mana, 1, board_hash,
            )
            .is_some()
            {
                exact_immediate_tactical_counts_for_mana(mana, color)
            } else {
                ExactImmediateTacticalCounts::default()
            }
        }
        Item::Mon { mon } | Item::MonWithConsumable { mon, .. }
            if mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted() =>
        {
            exact_budget_one_drainer_tactical_counts(board, color, location, board_hash)
        }
        _ => ExactImmediateTacticalCounts::default(),
    }
}

#[inline]
fn exact_budget_one_drainer_tactical_counts(
    board: &Board,
    color: Color,
    start: Location,
    _board_hash: u64,
) -> ExactImmediateTacticalCounts {
    if checkpoint() {
        return ExactImmediateTacticalCounts::default();
    }
    let opponent_mana = Mana::Regular(color.other());
    let mut best_any_score = 0;
    let mut best_opponent_score = 0;

    for &next in start.nearby_locations_ref() {
        if checkpoint() {
            return ExactImmediateTacticalCounts::default();
        }
        let Some(ExactActorPayload::Mana(mana)) = actor_payload_after_move_with_hash(
            board,
            0,
            MonKind::Drainer,
            color,
            ExactActorPayload::None,
            next,
            false,
        ) else {
            continue;
        };
        if !matches!(board.square(next), Square::ManaPool { .. }) {
            continue;
        }

        let mana_score = mana.score(color);
        best_any_score = best_any_score.max(mana_score);
        if mana == opponent_mana {
            best_opponent_score = best_opponent_score.max(mana_score);
        }
        if best_any_score >= 2 && best_opponent_score >= 2 {
            break;
        }
    }

    let mut counts = ExactImmediateTacticalCounts::default();
    if best_any_score >= 2 {
        counts.score_two = 1;
    } else if best_any_score == 1 {
        counts.score_one = 1;
    }
    if best_opponent_score >= 2 {
        counts.score_one = 0;
        counts.score_two = 1;
        counts.opponent_two = 1;
    }
    counts
}

fn exact_budget_one_tactical_summary(
    board: &Board,
    color: Color,
    board_hash: u64,
) -> ExactBudgetOneTacticalSummary {
    if checkpoint() {
        return ExactBudgetOneTacticalSummary::default();
    }
    let mut summary = ExactBudgetOneTacticalSummary::default();
    for (location, _) in board.occupied() {
        if checkpoint() {
            return ExactBudgetOneTacticalSummary::default();
        }
        let contribution =
            exact_budget_one_tactical_counts_for_location(board, color, location, board_hash);
        summary.counts.score_one += contribution.score_one;
        summary.counts.score_two += contribution.score_two;
        summary.counts.opponent_two += contribution.opponent_two;
        if contribution != ExactImmediateTacticalCounts::default() {
            summary.by_location.insert(location, contribution);
        }
    }
    if checkpoint() {
        ExactBudgetOneTacticalSummary::default()
    } else {
        summary
    }
}

#[inline]
fn exact_push_unique_location(locations: &mut Vec<Location>, location: Location) {
    if !locations.contains(&location) {
        locations.push(location);
    }
}

fn exact_budget_one_tactical_counts_after_touched_locations(
    base: &ExactBudgetOneTacticalSummary,
    board: &Board,
    color: Color,
    board_hash: u64,
    touched_locations: &[Location],
) -> ExactImmediateTacticalCounts {
    if checkpoint() {
        return ExactImmediateTacticalCounts::default();
    }
    let mut affected_locations = Vec::with_capacity(touched_locations.len() * 5);
    for &location in touched_locations {
        if checkpoint() {
            return ExactImmediateTacticalCounts::default();
        }
        exact_push_unique_location(&mut affected_locations, location);
        for &nearby in location.nearby_locations_ref() {
            exact_push_unique_location(&mut affected_locations, nearby);
        }
    }

    let mut counts = base.counts;
    for location in affected_locations {
        if checkpoint() {
            return ExactImmediateTacticalCounts::default();
        }
        let before = base.by_location.get(&location).copied().unwrap_or_default();
        let after =
            exact_budget_one_tactical_counts_for_location(board, color, location, board_hash);
        debug_assert!(counts.score_one >= before.score_one);
        debug_assert!(counts.score_two >= before.score_two);
        debug_assert!(counts.opponent_two >= before.opponent_two);
        counts.score_one = counts.score_one - before.score_one + after.score_one;
        counts.score_two = counts.score_two - before.score_two + after.score_two;
        counts.opponent_two = counts.opponent_two - before.opponent_two + after.opponent_two;
    }
    counts
}

fn exact_mark_locations_within_mon_budget(
    mask: &mut ExactLocationSeen,
    start: Location,
    move_budget: i32,
) {
    if checkpoint() {
        return;
    }
    let mut frontier = vec![start];
    mask.insert(start);

    for _ in 0..move_budget {
        if checkpoint() {
            return;
        }
        let mut next_frontier = Vec::with_capacity(frontier.len() * 6);
        for &location in &frontier {
            if checkpoint() {
                return;
            }
            for &next in location.nearby_locations_ref() {
                if mask.insert(next) {
                    next_frontier.push(next);
                }
            }
        }
        if next_frontier.is_empty() {
            break;
        }
        frontier = next_frontier;
    }
}

fn exact_immediate_tactical_reach_mask(
    board: &Board,
    color: Color,
    move_budget: i32,
) -> ExactLocationSeen {
    let mut mask = ExactLocationSeen::new();
    if move_budget < 0 || checkpoint() {
        return mask;
    }

    for (location, item) in board.occupied() {
        if checkpoint() {
            return ExactLocationSeen::new();
        }
        match item {
            Item::MonWithMana { mon, .. } if mon.color == color && !mon.is_fainted() => {
                exact_mark_locations_within_mon_budget(&mut mask, location, move_budget);
                if checkpoint() {
                    return ExactLocationSeen::new();
                }
            }
            Item::Mon { mon } | Item::MonWithConsumable { mon, .. }
                if mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted() =>
            {
                exact_mark_locations_within_mon_budget(&mut mask, location, move_budget);
                if checkpoint() {
                    return ExactLocationSeen::new();
                }
            }
            _ => {}
        }
    }

    mask
}

fn exact_zero_move_immediate_tactical_window_on_board_with_hash(
    board: &Board,
    color: Color,
    need_score: bool,
    need_denial: bool,
    board_hash: u64,
) -> ExactImmediateTacticalWindow {
    if checkpoint() {
        return ExactImmediateTacticalWindow::default();
    }
    let mut best = ExactImmediateTacticalWindow::default();
    let opponent_mana = Mana::Regular(color.other());
    for (location, item) in board.occupied() {
        if checkpoint() {
            return ExactImmediateTacticalWindow::default();
        }
        let Item::MonWithMana { mon, mana } = item else {
            continue;
        };
        if mon.color != color || mon.is_fainted() {
            continue;
        }
        if exact_carrier_steps_to_any_pool_with_hash_bounded(board, location, *mana, 0, board_hash)
            != Some(0)
        {
            continue;
        }
        let mana_value = mana.score(color);
        if need_score {
            best.best_score = best.best_score.max(mana_value);
        }
        if need_denial && *mana == opponent_mana {
            best.best_opponent_mana_score = best.best_opponent_mana_score.max(mana_value);
        }
    }
    best
}

fn exact_best_immediate_tactical_window_on_board_with_hash(
    board: &Board,
    color: Color,
    move_budget: i32,
    need_score: bool,
    need_denial: bool,
    board_hash: u64,
) -> ExactImmediateTacticalWindow {
    exact_best_immediate_tactical_window_on_board_with_hash_min_score(
        board,
        color,
        move_budget,
        1,
        need_score,
        need_denial,
        board_hash,
    )
}

fn exact_best_immediate_tactical_window_on_board_with_hash_min_score(
    board: &Board,
    color: Color,
    move_budget: i32,
    min_score: u8,
    need_score: bool,
    need_denial: bool,
    board_hash: u64,
) -> ExactImmediateTacticalWindow {
    if move_budget < 0 || (!need_score && !need_denial) || checkpoint() {
        return ExactImmediateTacticalWindow::default();
    }
    let min_score = if need_score { min_score.max(1) } else { 0 };

    let key = ExactImmediateTacticalWindowQueryKey {
        board_hash,
        color,
        move_budget,
        min_score,
        need_score,
        need_denial,
    };
    if let Some(cached) = EXACT_IMMEDIATE_TACTICAL_WINDOW_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if let Some(cached) = cache.entries.get(&key).copied() {
            return Some(cached);
        }
        if need_score && min_score > 1 {
            let base_key = ExactImmediateTacticalWindowQueryKey {
                min_score: 1,
                ..key
            };
            if let Some(cached) = cache.entries.get(&base_key).copied() {
                let derived = exact_immediate_tactical_window_for_min_score(cached, min_score);
                return if cache_write_allowed() {
                    cache.entries.insert(key, derived);
                    Some(derived)
                } else {
                    Some(ExactImmediateTacticalWindow::default())
                };
            }
        }
        if need_score ^ need_denial {
            let superset_key = ExactImmediateTacticalWindowQueryKey {
                need_score: true,
                need_denial: true,
                ..key
            };
            if let Some(cached) = cache.entries.get(&superset_key).copied() {
                let derived =
                    exact_immediate_tactical_window_for_axes(cached, need_score, need_denial);
                return if cache_write_allowed() {
                    cache.entries.insert(key, derived);
                    Some(derived)
                } else {
                    Some(ExactImmediateTacticalWindow::default())
                };
            }
            if need_score && min_score > 1 {
                let superset_base_key = ExactImmediateTacticalWindowQueryKey {
                    min_score: 1,
                    ..superset_key
                };
                if let Some(cached) = cache.entries.get(&superset_base_key).copied() {
                    let derived = exact_immediate_tactical_window_for_axes(
                        exact_immediate_tactical_window_for_min_score(cached, min_score),
                        need_score,
                        need_denial,
                    );
                    return if cache_write_allowed() {
                        cache.entries.insert(key, derived);
                        Some(derived)
                    } else {
                        Some(ExactImmediateTacticalWindow::default())
                    };
                }
            }
        }
        None
    }) {
        return cached;
    }

    let result = exact_best_immediate_tactical_window_on_board_with_hash_uncached(
        board,
        color,
        move_budget,
        min_score,
        need_score,
        need_denial,
        board_hash,
    );
    if cache_write_allowed() {
        EXACT_IMMEDIATE_TACTICAL_WINDOW_CACHE.with(|cache| {
            let mut cache = cache.borrow_mut();
            if cache.entries.len() >= EXACT_IMMEDIATE_TACTICAL_WINDOW_CACHE_MAX_ENTRIES
                && !cache.entries.contains_key(&key)
            {
                cache.entries.clear();
            }
            cache.entries.insert(key, result);
        });
        result
    } else {
        ExactImmediateTacticalWindow::default()
    }
}

fn exact_best_immediate_tactical_window_on_board_with_hash_uncached(
    board: &Board,
    color: Color,
    move_budget: i32,
    min_score: u8,
    need_score: bool,
    need_denial: bool,
    board_hash: u64,
) -> ExactImmediateTacticalWindow {
    if move_budget < 0 || (!need_score && !need_denial) || checkpoint() {
        return ExactImmediateTacticalWindow::default();
    }
    if move_budget == 0 {
        return exact_immediate_tactical_window_for_min_score(
            exact_zero_move_immediate_tactical_window_on_board_with_hash(
                board,
                color,
                need_score,
                need_denial,
                board_hash,
            ),
            min_score,
        );
    }

    let opponent_mana = Mana::Regular(color.other());
    let max_score = if need_score {
        Mana::Supermana.score(color)
    } else {
        0
    };
    let max_opponent_mana_score = if need_denial {
        opponent_mana.score(color)
    } else {
        0
    };
    let mut best = ExactImmediateTacticalWindow::default();
    for (location, item) in board.occupied() {
        if checkpoint() {
            return ExactImmediateTacticalWindow::default();
        }
        match item {
            Item::MonWithMana { mon, mana } if mon.color == color && !mon.is_fainted() => {
                let mana_value = mana.score(color);
                let relevant_for_score = need_score && mana_value >= i32::from(min_score);
                let relevant_for_denial = need_denial && *mana == opponent_mana;
                if !relevant_for_score && !relevant_for_denial {
                    continue;
                }
                if exact_carrier_steps_to_any_pool_with_hash_bounded(
                    board,
                    location,
                    *mana,
                    move_budget,
                    board_hash,
                )
                .is_some()
                {
                    if relevant_for_score {
                        best.best_score = best.best_score.max(mana_value);
                    }
                    if relevant_for_denial {
                        best.best_opponent_mana_score =
                            best.best_opponent_mana_score.max(mana_value);
                    }
                }
            }
            Item::Mon { mon } | Item::MonWithConsumable { mon, .. }
                if mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted() =>
            {
                let pickup = exact_drainer_pickup_window_with_hash_min_any_score(
                    board,
                    color,
                    location,
                    Some(move_budget),
                    min_score,
                    need_score,
                    need_denial,
                    opponent_mana,
                    board_hash,
                );
                if need_score {
                    if let Some(path) = pickup.any {
                        best.best_score = best.best_score.max(path.mana_value);
                    }
                }
                if need_denial {
                    if let Some(path) = pickup.opponent {
                        best.best_opponent_mana_score =
                            best.best_opponent_mana_score.max(path.mana_value);
                    }
                }
            }
            _ => {}
        }

        if checkpoint() {
            return ExactImmediateTacticalWindow::default();
        }

        let score_done = !need_score || best.best_score >= max_score;
        let denial_done = !need_denial || best.best_opponent_mana_score >= max_opponent_mana_score;
        if score_done && denial_done {
            return best;
        }
    }
    best
}

fn exact_best_immediate_score_on_board(board: &Board, color: Color, move_budget: i32) -> i32 {
    exact_best_immediate_score_on_board_with_hash(
        board,
        color,
        move_budget,
        exact_board_hash(board),
    )
}

fn exact_best_immediate_score_on_board_with_hash(
    board: &Board,
    color: Color,
    move_budget: i32,
    board_hash: u64,
) -> i32 {
    if move_budget < 0 || checkpoint() {
        return 0;
    }

    let max_score = Mana::Supermana.score(color);
    let mut best = 0;
    for (location, item) in board.occupied() {
        if checkpoint() {
            return 0;
        }
        match item {
            Item::MonWithMana { mon, mana } if mon.color == color && !mon.is_fainted() => {
                if exact_carrier_steps_to_any_pool_with_hash_bounded(
                    board,
                    location,
                    *mana,
                    move_budget,
                    board_hash,
                )
                .is_some()
                {
                    best = best.max(mana.score(color));
                }
            }
            Item::Mon { mon } | Item::MonWithConsumable { mon, .. }
                if mon.color == color && mon.kind == MonKind::Drainer && !mon.is_fainted() =>
            {
                if let Some(path) = exact_best_drainer_pickup_path_with_hash(
                    board,
                    color,
                    location,
                    Some(move_budget),
                    board_hash,
                ) {
                    best = best.max(path.mana_value);
                }
            }
            _ => {}
        }

        if checkpoint() {
            return 0;
        }

        if best >= max_score {
            return best;
        }
    }
    best
}
