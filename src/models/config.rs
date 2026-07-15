use crate::models::location::BOARD_CELLS;
use crate::*;
use std::collections::HashMap;
#[cfg(target_arch = "wasm32")]
use std::collections::HashSet;
use std::sync::LazyLock;

#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum GameVariant {
    #[default]
    Classic = 0,
    SwappedManaRows = 1,
    OffsetArcManaRows = 2,
    CenterSpokeManaRows = 3,
    AlternatingManaRows = 4,
    InnerWedgeManaRows = 5,
    OuterWedgeManaRows = 6,
    BentCenterManaRows = 7,
    OuterEdgeManaRows = 8,
    SplitFlankManaRows = 9,
    ForwardBridgeManaRows = 10,
    CornerChainManaRows = 11,
}

impl GameVariant {
    pub const DEFAULT: Self = Self::Classic;

    pub const fn id(self) -> i32 {
        match self {
            Self::Classic => 0,
            Self::SwappedManaRows => 1,
            Self::OffsetArcManaRows => 2,
            Self::CenterSpokeManaRows => 3,
            Self::AlternatingManaRows => 4,
            Self::InnerWedgeManaRows => 5,
            Self::OuterWedgeManaRows => 6,
            Self::BentCenterManaRows => 7,
            Self::OuterEdgeManaRows => 8,
            Self::SplitFlankManaRows => 9,
            Self::ForwardBridgeManaRows => 10,
            Self::CornerChainManaRows => 11,
        }
    }

    pub const fn from_id(id: i32) -> Option<Self> {
        match id {
            0 => Some(Self::Classic),
            1 => Some(Self::SwappedManaRows),
            2 => Some(Self::OffsetArcManaRows),
            3 => Some(Self::CenterSpokeManaRows),
            4 => Some(Self::AlternatingManaRows),
            5 => Some(Self::InnerWedgeManaRows),
            6 => Some(Self::OuterWedgeManaRows),
            7 => Some(Self::BentCenterManaRows),
            8 => Some(Self::OuterEdgeManaRows),
            9 => Some(Self::SplitFlankManaRows),
            10 => Some(Self::ForwardBridgeManaRows),
            11 => Some(Self::CornerChainManaRows),
            _ => None,
        }
    }

    pub fn from_fen(fen: &str) -> Option<Self> {
        fen.parse::<i32>().ok().and_then(Self::from_id)
    }
}

static CLASSIC_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::Classic));
static CLASSIC_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in CLASSIC_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static CLASSIC_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::Classic));
static SWAPPED_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::SwappedManaRows));
static SWAPPED_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in SWAPPED_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static SWAPPED_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::SwappedManaRows));
static OFFSET_ARC_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::OffsetArcManaRows));
static OFFSET_ARC_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in OFFSET_ARC_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static OFFSET_ARC_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::OffsetArcManaRows));
static CENTER_SPOKE_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::CenterSpokeManaRows));
static CENTER_SPOKE_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> =
    LazyLock::new(|| {
        let mut arr = [Square::Regular; BOARD_CELLS];
        for (&loc, &sq) in CENTER_SPOKE_MANA_ROWS_SQUARES_MAP.iter() {
            arr[loc.index()] = sq;
        }
        arr
    });
static CENTER_SPOKE_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::CenterSpokeManaRows));
static ALTERNATING_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::AlternatingManaRows));
static ALTERNATING_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in ALTERNATING_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static ALTERNATING_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::AlternatingManaRows));
static INNER_WEDGE_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::InnerWedgeManaRows));
static INNER_WEDGE_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in INNER_WEDGE_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static INNER_WEDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::InnerWedgeManaRows));
static OUTER_WEDGE_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::OuterWedgeManaRows));
static OUTER_WEDGE_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in OUTER_WEDGE_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static OUTER_WEDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::OuterWedgeManaRows));
static BENT_CENTER_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::BentCenterManaRows));
static BENT_CENTER_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in BENT_CENTER_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static BENT_CENTER_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::BentCenterManaRows));
static OUTER_EDGE_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::OuterEdgeManaRows));
static OUTER_EDGE_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in OUTER_EDGE_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static OUTER_EDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::OuterEdgeManaRows));
static SPLIT_FLANK_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::SplitFlankManaRows));
static SPLIT_FLANK_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> = LazyLock::new(|| {
    let mut arr = [Square::Regular; BOARD_CELLS];
    for (&loc, &sq) in SPLIT_FLANK_MANA_ROWS_SQUARES_MAP.iter() {
        arr[loc.index()] = sq;
    }
    arr
});
static SPLIT_FLANK_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::SplitFlankManaRows));
static FORWARD_BRIDGE_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::ForwardBridgeManaRows));
static FORWARD_BRIDGE_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> =
    LazyLock::new(|| {
        let mut arr = [Square::Regular; BOARD_CELLS];
        for (&loc, &sq) in FORWARD_BRIDGE_MANA_ROWS_SQUARES_MAP.iter() {
            arr[loc.index()] = sq;
        }
        arr
    });
static FORWARD_BRIDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::ForwardBridgeManaRows));
static CORNER_CHAIN_MANA_ROWS_SQUARES_MAP: LazyLock<HashMap<Location, Square>> =
    LazyLock::new(|| Config::build_squares(GameVariant::CornerChainManaRows));
static CORNER_CHAIN_MANA_ROWS_SQUARES_ARRAY: LazyLock<[Square; BOARD_CELLS]> =
    LazyLock::new(|| {
        let mut arr = [Square::Regular; BOARD_CELLS];
        for (&loc, &sq) in CORNER_CHAIN_MANA_ROWS_SQUARES_MAP.iter() {
            arr[loc.index()] = sq;
        }
        arr
    });
static CORNER_CHAIN_MANA_ROWS_INITIAL_ITEMS_ARRAY: LazyLock<[Option<Item>; BOARD_CELLS]> =
    LazyLock::new(|| Config::build_initial_items_array(GameVariant::CornerChainManaRows));
#[cfg(target_arch = "wasm32")]
static MONS_BASES_SET: LazyLock<HashSet<Location>> =
    LazyLock::new(|| Config::MONS_BASE_LOCATIONS.iter().copied().collect());

pub(crate) struct Config;

impl Config {
    pub const BOARD_SIZE: i32 = 11;
    pub const TARGET_SCORE: i32 = 5;

    pub const MONS_MOVES_PER_TURN: i32 = 5;
    pub const MANA_MOVES_PER_TURN: i32 = 1;
    pub const ACTIONS_PER_TURN: i32 = 1;

    const CLASSIC_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 4 },
        Location { i: 3, j: 6 },
        Location { i: 4, j: 3 },
        Location { i: 4, j: 5 },
        Location { i: 4, j: 7 },
    ];

    const CLASSIC_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 7, j: 4 },
        Location { i: 7, j: 6 },
        Location { i: 6, j: 3 },
        Location { i: 6, j: 5 },
        Location { i: 6, j: 7 },
    ];

    const SWAPPED_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 3 },
        Location { i: 3, j: 5 },
        Location { i: 3, j: 7 },
        Location { i: 4, j: 4 },
        Location { i: 4, j: 6 },
    ];

    const SWAPPED_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 7, j: 3 },
        Location { i: 7, j: 5 },
        Location { i: 7, j: 7 },
        Location { i: 6, j: 4 },
        Location { i: 6, j: 6 },
    ];

    const OFFSET_ARC_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 4 },
        Location { i: 3, j: 6 },
        Location { i: 4, j: 2 },
        Location { i: 4, j: 5 },
        Location { i: 4, j: 8 },
    ];

    const OFFSET_ARC_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 6, j: 2 },
        Location { i: 6, j: 5 },
        Location { i: 6, j: 8 },
        Location { i: 7, j: 4 },
        Location { i: 7, j: 6 },
    ];

    const CENTER_SPOKE_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 5 },
        Location { i: 4, j: 2 },
        Location { i: 4, j: 4 },
        Location { i: 4, j: 6 },
        Location { i: 4, j: 8 },
    ];

    const CENTER_SPOKE_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 6, j: 2 },
        Location { i: 6, j: 4 },
        Location { i: 6, j: 6 },
        Location { i: 6, j: 8 },
        Location { i: 7, j: 5 },
    ];

    const ALTERNATING_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 4, j: 1 },
        Location { i: 4, j: 3 },
        Location { i: 4, j: 5 },
        Location { i: 4, j: 7 },
        Location { i: 4, j: 9 },
    ];

    const ALTERNATING_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 6, j: 1 },
        Location { i: 6, j: 3 },
        Location { i: 6, j: 5 },
        Location { i: 6, j: 7 },
        Location { i: 6, j: 9 },
    ];

    const INNER_WEDGE_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 4 },
        Location { i: 3, j: 6 },
        Location { i: 4, j: 4 },
        Location { i: 4, j: 5 },
        Location { i: 4, j: 6 },
    ];

    const INNER_WEDGE_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 6, j: 4 },
        Location { i: 6, j: 5 },
        Location { i: 6, j: 6 },
        Location { i: 7, j: 4 },
        Location { i: 7, j: 6 },
    ];

    const OUTER_WEDGE_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 4 },
        Location { i: 3, j: 5 },
        Location { i: 3, j: 6 },
        Location { i: 4, j: 3 },
        Location { i: 4, j: 7 },
    ];

    const OUTER_WEDGE_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 6, j: 3 },
        Location { i: 6, j: 7 },
        Location { i: 7, j: 4 },
        Location { i: 7, j: 5 },
        Location { i: 7, j: 6 },
    ];

    const BENT_CENTER_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 5 },
        Location { i: 4, j: 4 },
        Location { i: 4, j: 5 },
        Location { i: 4, j: 6 },
        Location { i: 5, j: 3 },
    ];

    const BENT_CENTER_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 5, j: 7 },
        Location { i: 6, j: 4 },
        Location { i: 6, j: 5 },
        Location { i: 6, j: 6 },
        Location { i: 7, j: 5 },
    ];

    const OUTER_EDGE_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 4, j: 0 },
        Location { i: 4, j: 1 },
        Location { i: 4, j: 9 },
        Location { i: 4, j: 10 },
        Location { i: 5, j: 1 },
    ];

    const OUTER_EDGE_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 5, j: 9 },
        Location { i: 6, j: 0 },
        Location { i: 6, j: 1 },
        Location { i: 6, j: 9 },
        Location { i: 6, j: 10 },
    ];

    const SPLIT_FLANK_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 4 },
        Location { i: 3, j: 6 },
        Location { i: 4, j: 2 },
        Location { i: 4, j: 3 },
        Location { i: 5, j: 2 },
    ];

    const SPLIT_FLANK_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 5, j: 8 },
        Location { i: 6, j: 7 },
        Location { i: 6, j: 8 },
        Location { i: 7, j: 4 },
        Location { i: 7, j: 6 },
    ];

    const FORWARD_BRIDGE_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 4 },
        Location { i: 3, j: 6 },
        Location { i: 4, j: 3 },
        Location { i: 4, j: 5 },
        Location { i: 5, j: 4 },
    ];

    const FORWARD_BRIDGE_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 5, j: 6 },
        Location { i: 6, j: 5 },
        Location { i: 6, j: 7 },
        Location { i: 7, j: 4 },
        Location { i: 7, j: 6 },
    ];

    const CORNER_CHAIN_BLACK_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 3, j: 5 },
        Location { i: 3, j: 6 },
        Location { i: 4, j: 6 },
        Location { i: 4, j: 7 },
        Location { i: 5, j: 7 },
    ];

    const CORNER_CHAIN_WHITE_MANA_BASE_LOCATIONS: [Location; 5] = [
        Location { i: 5, j: 3 },
        Location { i: 6, j: 3 },
        Location { i: 6, j: 4 },
        Location { i: 7, j: 4 },
        Location { i: 7, j: 5 },
    ];

    fn build_squares(variant: GameVariant) -> HashMap<Location, Square> {
        use Square::*;
        let mut squares = HashMap::new();
        squares.insert(
            Location::new(0, 0),
            ManaPool {
                color: Color::Black,
            },
        );
        squares.insert(
            Location::new(0, 10),
            ManaPool {
                color: Color::Black,
            },
        );
        squares.insert(
            Location::new(10, 0),
            ManaPool {
                color: Color::White,
            },
        );
        squares.insert(
            Location::new(10, 10),
            ManaPool {
                color: Color::White,
            },
        );

        squares.insert(
            Location::new(0, 3),
            MonBase {
                kind: MonKind::Mystic,
                color: Color::Black,
            },
        );
        squares.insert(
            Location::new(0, 4),
            MonBase {
                kind: MonKind::Spirit,
                color: Color::Black,
            },
        );
        squares.insert(
            Location::new(0, 5),
            MonBase {
                kind: MonKind::Drainer,
                color: Color::Black,
            },
        );
        squares.insert(
            Location::new(0, 6),
            MonBase {
                kind: MonKind::Angel,
                color: Color::Black,
            },
        );
        squares.insert(
            Location::new(0, 7),
            MonBase {
                kind: MonKind::Demon,
                color: Color::Black,
            },
        );

        squares.insert(
            Location::new(10, 3),
            MonBase {
                kind: MonKind::Demon,
                color: Color::White,
            },
        );
        squares.insert(
            Location::new(10, 4),
            MonBase {
                kind: MonKind::Angel,
                color: Color::White,
            },
        );
        squares.insert(
            Location::new(10, 5),
            MonBase {
                kind: MonKind::Drainer,
                color: Color::White,
            },
        );
        squares.insert(
            Location::new(10, 6),
            MonBase {
                kind: MonKind::Spirit,
                color: Color::White,
            },
        );
        squares.insert(
            Location::new(10, 7),
            MonBase {
                kind: MonKind::Mystic,
                color: Color::White,
            },
        );

        for &location in Self::mana_base_locations(variant, Color::Black) {
            squares.insert(
                location,
                ManaBase {
                    color: Color::Black,
                },
            );
        }
        for &location in Self::mana_base_locations(variant, Color::White) {
            squares.insert(
                location,
                ManaBase {
                    color: Color::White,
                },
            );
        }

        squares.insert(Location::new(5, 0), ConsumableBase);
        squares.insert(Location::new(5, 10), ConsumableBase);
        squares.insert(Location::new(5, 5), SupermanaBase);

        squares
    }

    fn mana_base_locations(variant: GameVariant, color: Color) -> &'static [Location; 5] {
        match (variant, color) {
            (GameVariant::Classic, Color::Black) => &Self::CLASSIC_BLACK_MANA_BASE_LOCATIONS,
            (GameVariant::Classic, Color::White) => &Self::CLASSIC_WHITE_MANA_BASE_LOCATIONS,
            (GameVariant::SwappedManaRows, Color::Black) => {
                &Self::SWAPPED_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::SwappedManaRows, Color::White) => {
                &Self::SWAPPED_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::OffsetArcManaRows, Color::Black) => {
                &Self::OFFSET_ARC_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::OffsetArcManaRows, Color::White) => {
                &Self::OFFSET_ARC_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::CenterSpokeManaRows, Color::Black) => {
                &Self::CENTER_SPOKE_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::CenterSpokeManaRows, Color::White) => {
                &Self::CENTER_SPOKE_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::AlternatingManaRows, Color::Black) => {
                &Self::ALTERNATING_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::AlternatingManaRows, Color::White) => {
                &Self::ALTERNATING_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::InnerWedgeManaRows, Color::Black) => {
                &Self::INNER_WEDGE_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::InnerWedgeManaRows, Color::White) => {
                &Self::INNER_WEDGE_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::OuterWedgeManaRows, Color::Black) => {
                &Self::OUTER_WEDGE_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::OuterWedgeManaRows, Color::White) => {
                &Self::OUTER_WEDGE_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::BentCenterManaRows, Color::Black) => {
                &Self::BENT_CENTER_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::BentCenterManaRows, Color::White) => {
                &Self::BENT_CENTER_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::OuterEdgeManaRows, Color::Black) => {
                &Self::OUTER_EDGE_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::OuterEdgeManaRows, Color::White) => {
                &Self::OUTER_EDGE_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::SplitFlankManaRows, Color::Black) => {
                &Self::SPLIT_FLANK_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::SplitFlankManaRows, Color::White) => {
                &Self::SPLIT_FLANK_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::ForwardBridgeManaRows, Color::Black) => {
                &Self::FORWARD_BRIDGE_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::ForwardBridgeManaRows, Color::White) => {
                &Self::FORWARD_BRIDGE_WHITE_MANA_BASE_LOCATIONS
            }
            (GameVariant::CornerChainManaRows, Color::Black) => {
                &Self::CORNER_CHAIN_BLACK_MANA_BASE_LOCATIONS
            }
            (GameVariant::CornerChainManaRows, Color::White) => {
                &Self::CORNER_CHAIN_WHITE_MANA_BASE_LOCATIONS
            }
        }
    }

    fn initial_item_for_square(square: Square) -> Option<Item> {
        match square {
            Square::MonBase { kind, color } => Some(Item::Mon {
                mon: Mon::new(kind, color, 0),
            }),
            Square::ManaBase { color } => Some(Item::Mana {
                mana: Mana::Regular(color),
            }),
            Square::SupermanaBase => Some(Item::Mana {
                mana: Mana::Supermana,
            }),
            Square::ConsumableBase => Some(Item::Consumable {
                consumable: Consumable::BombOrPotion,
            }),
            Square::Regular | Square::ManaPool { .. } => None,
        }
    }

    fn build_initial_items_array(variant: GameVariant) -> [Option<Item>; BOARD_CELLS] {
        let mut arr: [Option<Item>; BOARD_CELLS] = [None; BOARD_CELLS];
        for (&location, &square) in Self::squares_ref_for_variant(variant).iter() {
            arr[location.index()] = Self::initial_item_for_square(square);
        }
        arr
    }

    pub fn squares_ref_for_variant(variant: GameVariant) -> &'static HashMap<Location, Square> {
        match variant {
            GameVariant::Classic => &CLASSIC_SQUARES_MAP,
            GameVariant::SwappedManaRows => &SWAPPED_MANA_ROWS_SQUARES_MAP,
            GameVariant::OffsetArcManaRows => &OFFSET_ARC_MANA_ROWS_SQUARES_MAP,
            GameVariant::CenterSpokeManaRows => &CENTER_SPOKE_MANA_ROWS_SQUARES_MAP,
            GameVariant::AlternatingManaRows => &ALTERNATING_MANA_ROWS_SQUARES_MAP,
            GameVariant::InnerWedgeManaRows => &INNER_WEDGE_MANA_ROWS_SQUARES_MAP,
            GameVariant::OuterWedgeManaRows => &OUTER_WEDGE_MANA_ROWS_SQUARES_MAP,
            GameVariant::BentCenterManaRows => &BENT_CENTER_MANA_ROWS_SQUARES_MAP,
            GameVariant::OuterEdgeManaRows => &OUTER_EDGE_MANA_ROWS_SQUARES_MAP,
            GameVariant::SplitFlankManaRows => &SPLIT_FLANK_MANA_ROWS_SQUARES_MAP,
            GameVariant::ForwardBridgeManaRows => &FORWARD_BRIDGE_MANA_ROWS_SQUARES_MAP,
            GameVariant::CornerChainManaRows => &CORNER_CHAIN_MANA_ROWS_SQUARES_MAP,
        }
    }

    #[cfg(target_arch = "wasm32")]
    pub fn squares_ref() -> &'static HashMap<Location, Square> {
        Self::squares_ref_for_variant(GameVariant::DEFAULT)
    }

    #[inline]
    pub fn square_at_for_variant(location: Location, variant: GameVariant) -> Square {
        match variant {
            GameVariant::Classic => CLASSIC_SQUARES_ARRAY[location.index()],
            GameVariant::SwappedManaRows => SWAPPED_MANA_ROWS_SQUARES_ARRAY[location.index()],
            GameVariant::OffsetArcManaRows => OFFSET_ARC_MANA_ROWS_SQUARES_ARRAY[location.index()],
            GameVariant::CenterSpokeManaRows => {
                CENTER_SPOKE_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
            GameVariant::AlternatingManaRows => {
                ALTERNATING_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
            GameVariant::InnerWedgeManaRows => {
                INNER_WEDGE_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
            GameVariant::OuterWedgeManaRows => {
                OUTER_WEDGE_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
            GameVariant::BentCenterManaRows => {
                BENT_CENTER_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
            GameVariant::OuterEdgeManaRows => OUTER_EDGE_MANA_ROWS_SQUARES_ARRAY[location.index()],
            GameVariant::SplitFlankManaRows => {
                SPLIT_FLANK_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
            GameVariant::ForwardBridgeManaRows => {
                FORWARD_BRIDGE_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
            GameVariant::CornerChainManaRows => {
                CORNER_CHAIN_MANA_ROWS_SQUARES_ARRAY[location.index()]
            }
        }
    }

    #[inline]
    pub fn square_at(location: Location) -> Square {
        Self::square_at_for_variant(location, GameVariant::DEFAULT)
    }

    pub fn initial_items_array_for_variant(variant: GameVariant) -> [Option<Item>; BOARD_CELLS] {
        match variant {
            GameVariant::Classic => *CLASSIC_INITIAL_ITEMS_ARRAY,
            GameVariant::SwappedManaRows => *SWAPPED_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::OffsetArcManaRows => *OFFSET_ARC_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::CenterSpokeManaRows => *CENTER_SPOKE_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::AlternatingManaRows => *ALTERNATING_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::InnerWedgeManaRows => *INNER_WEDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::OuterWedgeManaRows => *OUTER_WEDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::BentCenterManaRows => *BENT_CENTER_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::OuterEdgeManaRows => *OUTER_EDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::SplitFlankManaRows => *SPLIT_FLANK_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::ForwardBridgeManaRows => *FORWARD_BRIDGE_MANA_ROWS_INITIAL_ITEMS_ARRAY,
            GameVariant::CornerChainManaRows => *CORNER_CHAIN_MANA_ROWS_INITIAL_ITEMS_ARRAY,
        }
    }

    #[cfg(target_arch = "wasm32")]
    pub const BOARD_CENTER_INDEX: i32 = Self::BOARD_SIZE / 2;
    #[cfg(target_arch = "wasm32")]
    pub const MAX_LOCATION_INDEX: i32 = Self::BOARD_SIZE - 1;

    pub const SUPERMANA_BASE: Location = Location { i: 5, j: 5 };

    pub const MONS_BASE_LOCATIONS: [Location; 10] = [
        Location { i: 0, j: 3 },
        Location { i: 0, j: 4 },
        Location { i: 0, j: 5 },
        Location { i: 0, j: 6 },
        Location { i: 0, j: 7 },
        Location { i: 10, j: 3 },
        Location { i: 10, j: 4 },
        Location { i: 10, j: 5 },
        Location { i: 10, j: 6 },
        Location { i: 10, j: 7 },
    ];

    pub fn mon_base(kind: MonKind, color: Color) -> Location {
        for &loc in &Self::MONS_BASE_LOCATIONS {
            if let Square::MonBase { kind: k, color: c } = Self::square_at(loc) {
                if k == kind && c == color {
                    return loc;
                }
            }
        }
        panic!("Expected at least one base for the given mon");
    }

    #[cfg(target_arch = "wasm32")]
    pub fn mons_bases_ref() -> &'static HashSet<Location> {
        &MONS_BASES_SET
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn assert_regular_mana(board: &Board, location: Location, color: Color) {
        assert_eq!(board.square(location), Square::ManaBase { color });
        assert_eq!(
            board.item(location).copied(),
            Some(Item::Mana {
                mana: Mana::Regular(color),
            })
        );
    }

    fn mana_base_locations_for_board(board: &Board, color: Color) -> HashSet<Location> {
        let mut locations = HashSet::new();
        for i in 0..Config::BOARD_SIZE {
            for j in 0..Config::BOARD_SIZE {
                let location = Location::new(i, j);
                if board.square(location) == (Square::ManaBase { color }) {
                    locations.insert(location);
                }
            }
        }
        locations
    }

    fn regular_mana_item_locations_for_board(board: &Board, color: Color) -> HashSet<Location> {
        board
            .occupied()
            .filter_map(|(location, item)| match item {
                Item::Mana {
                    mana: Mana::Regular(mana_color),
                } if *mana_color == color => Some(location),
                _ => None,
            })
            .collect()
    }

    fn hash_set_from_locations(locations: &[Location; 5]) -> HashSet<Location> {
        locations.iter().copied().collect()
    }

    fn assert_variant_mana_layout(
        variant: GameVariant,
        black_locations: &[Location; 5],
        white_locations: &[Location; 5],
    ) {
        let board = Board::new_with_variant(variant);
        let expected_black = hash_set_from_locations(black_locations);
        let expected_white = hash_set_from_locations(white_locations);

        assert_eq!(
            mana_base_locations_for_board(&board, Color::Black),
            expected_black,
            "{variant:?} should have the expected black mana-base squares"
        );
        assert_eq!(
            mana_base_locations_for_board(&board, Color::White),
            expected_white,
            "{variant:?} should have the expected white mana-base squares"
        );
        assert_eq!(
            regular_mana_item_locations_for_board(&board, Color::Black),
            expected_black,
            "{variant:?} should have initial black mana on every black mana base"
        );
        assert_eq!(
            regular_mana_item_locations_for_board(&board, Color::White),
            expected_white,
            "{variant:?} should have initial white mana on every white mana base"
        );
    }

    #[test]
    fn swapped_mana_rows_variant_swaps_mana_base_rows_and_initial_mana() {
        let classic = Board::new_with_variant(GameVariant::Classic);
        let swapped = Board::new_with_variant(GameVariant::SwappedManaRows);

        for location in [Location::new(3, 4), Location::new(3, 6)] {
            assert_regular_mana(&classic, location, Color::Black);
            assert_eq!(swapped.square(location), Square::Regular);
            assert_eq!(swapped.item(location), None);
        }
        for location in [
            Location::new(4, 3),
            Location::new(4, 5),
            Location::new(4, 7),
        ] {
            assert_regular_mana(&classic, location, Color::Black);
            assert_eq!(swapped.square(location), Square::Regular);
            assert_eq!(swapped.item(location), None);
        }
        for location in [
            Location::new(3, 3),
            Location::new(3, 5),
            Location::new(3, 7),
        ] {
            assert_eq!(classic.square(location), Square::Regular);
            assert_eq!(classic.item(location), None);
            assert_regular_mana(&swapped, location, Color::Black);
        }
        for location in [Location::new(4, 4), Location::new(4, 6)] {
            assert_eq!(classic.square(location), Square::Regular);
            assert_eq!(classic.item(location), None);
            assert_regular_mana(&swapped, location, Color::Black);
        }

        for location in [Location::new(7, 4), Location::new(7, 6)] {
            assert_regular_mana(&classic, location, Color::White);
            assert_eq!(swapped.square(location), Square::Regular);
            assert_eq!(swapped.item(location), None);
        }
        for location in [
            Location::new(6, 3),
            Location::new(6, 5),
            Location::new(6, 7),
        ] {
            assert_regular_mana(&classic, location, Color::White);
            assert_eq!(swapped.square(location), Square::Regular);
            assert_eq!(swapped.item(location), None);
        }
        for location in [
            Location::new(7, 3),
            Location::new(7, 5),
            Location::new(7, 7),
        ] {
            assert_eq!(classic.square(location), Square::Regular);
            assert_eq!(classic.item(location), None);
            assert_regular_mana(&swapped, location, Color::White);
        }
        for location in [Location::new(6, 4), Location::new(6, 6)] {
            assert_eq!(classic.square(location), Square::Regular);
            assert_eq!(classic.item(location), None);
            assert_regular_mana(&swapped, location, Color::White);
        }
    }

    #[test]
    fn new_variants_use_expected_mana_base_layouts_and_initial_mana() {
        assert_variant_mana_layout(
            GameVariant::OffsetArcManaRows,
            &Config::OFFSET_ARC_BLACK_MANA_BASE_LOCATIONS,
            &Config::OFFSET_ARC_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::CenterSpokeManaRows,
            &Config::CENTER_SPOKE_BLACK_MANA_BASE_LOCATIONS,
            &Config::CENTER_SPOKE_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::AlternatingManaRows,
            &Config::ALTERNATING_BLACK_MANA_BASE_LOCATIONS,
            &Config::ALTERNATING_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::InnerWedgeManaRows,
            &Config::INNER_WEDGE_BLACK_MANA_BASE_LOCATIONS,
            &Config::INNER_WEDGE_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::OuterWedgeManaRows,
            &Config::OUTER_WEDGE_BLACK_MANA_BASE_LOCATIONS,
            &Config::OUTER_WEDGE_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::BentCenterManaRows,
            &Config::BENT_CENTER_BLACK_MANA_BASE_LOCATIONS,
            &Config::BENT_CENTER_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::OuterEdgeManaRows,
            &Config::OUTER_EDGE_BLACK_MANA_BASE_LOCATIONS,
            &Config::OUTER_EDGE_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::SplitFlankManaRows,
            &Config::SPLIT_FLANK_BLACK_MANA_BASE_LOCATIONS,
            &Config::SPLIT_FLANK_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::ForwardBridgeManaRows,
            &Config::FORWARD_BRIDGE_BLACK_MANA_BASE_LOCATIONS,
            &Config::FORWARD_BRIDGE_WHITE_MANA_BASE_LOCATIONS,
        );
        assert_variant_mana_layout(
            GameVariant::CornerChainManaRows,
            &Config::CORNER_CHAIN_BLACK_MANA_BASE_LOCATIONS,
            &Config::CORNER_CHAIN_WHITE_MANA_BASE_LOCATIONS,
        );
    }
}
