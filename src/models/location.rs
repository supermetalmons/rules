use crate::*;
use std::sync::LazyLock;

#[wasm_bindgen]
#[derive(Debug, PartialEq, Eq, Hash, Clone, Copy, PartialOrd, Ord)]
pub struct Location {
    pub i: i32,
    pub j: i32,
}

pub const BOARD_CELLS: usize = 121; // 11 * 11

static NEARBY_LOCATIONS_CACHE: LazyLock<Vec<Vec<Location>>> =
    LazyLock::new(|| build_nearby_cache(1));
static BOMB_REACHABILITY_CACHE: LazyLock<Vec<Vec<Location>>> =
    LazyLock::new(|| build_nearby_cache(3));
static MYSTIC_REACHABILITY_CACHE: LazyLock<Vec<Vec<Location>>> = LazyLock::new(build_mystic_cache);
static DEMON_REACHABILITY_CACHE: LazyLock<Vec<Vec<Location>>> = LazyLock::new(build_demon_cache);
static SPIRIT_REACHABILITY_CACHE: LazyLock<Vec<Vec<Location>>> = LazyLock::new(build_spirit_cache);

#[wasm_bindgen]
impl Location {
    #[wasm_bindgen(constructor)]
    pub fn new(i: i32, j: i32) -> Self {
        Self { i, j }
    }
}

impl Location {
    #[inline]
    pub fn is_valid(&self) -> bool {
        let r = Self::valid_range();
        r.contains(&self.i) && r.contains(&self.j)
    }

    #[inline]
    pub fn index(&self) -> usize {
        (self.i * 11 + self.j) as usize
    }

    #[inline]
    pub fn from_index(idx: usize) -> Self {
        Self {
            i: (idx / 11) as i32,
            j: (idx % 11) as i32,
        }
    }

    #[inline]
    pub fn valid_range() -> std::ops::Range<i32> {
        0..Config::BOARD_SIZE
    }

    #[inline]
    pub fn nearby_locations_ref(&self) -> &'static [Location] {
        &NEARBY_LOCATIONS_CACHE[self.index()]
    }

    #[inline]
    pub fn reachable_by_bomb_ref(&self) -> &'static [Location] {
        &BOMB_REACHABILITY_CACHE[self.index()]
    }

    #[inline]
    pub fn reachable_by_mystic_action_ref(&self) -> &'static [Location] {
        &MYSTIC_REACHABILITY_CACHE[self.index()]
    }

    #[inline]
    pub fn reachable_by_demon_action_ref(&self) -> &'static [Location] {
        &DEMON_REACHABILITY_CACHE[self.index()]
    }

    #[inline]
    pub fn reachable_by_spirit_action_ref(&self) -> &'static [Location] {
        &SPIRIT_REACHABILITY_CACHE[self.index()]
    }

    #[inline]
    pub fn location_between(&self, another: &Location) -> Location {
        Location::new((self.i + another.i) / 2, (self.j + another.j) / 2)
    }

    #[inline]
    pub fn distance(&self, to: &Location) -> i32 {
        ((to.i - self.i).abs()).max((to.j - self.j).abs())
    }
}

fn build_nearby_cache(distance: i32) -> Vec<Vec<Location>> {
    (0..BOARD_CELLS)
        .map(|idx| nearby_locations_for(Location::from_index(idx), distance))
        .collect()
}

fn build_mystic_cache() -> Vec<Vec<Location>> {
    let deltas = [(-2, -2), (2, 2), (-2, 2), (2, -2)];
    (0..BOARD_CELLS)
        .map(|idx| directional_reachability_for(Location::from_index(idx), &deltas))
        .collect()
}

fn build_demon_cache() -> Vec<Vec<Location>> {
    let deltas = [(-2, 0), (2, 0), (0, 2), (0, -2)];
    (0..BOARD_CELLS)
        .map(|idx| directional_reachability_for(Location::from_index(idx), &deltas))
        .collect()
}

fn build_spirit_cache() -> Vec<Vec<Location>> {
    (0..BOARD_CELLS)
        .map(|idx| spirit_reachability_for(Location::from_index(idx)))
        .collect()
}

fn nearby_locations_for(location: Location, distance: i32) -> Vec<Location> {
    let mut locations = Vec::new();
    for x in (location.i - distance)..=(location.i + distance) {
        for y in (location.j - distance)..=(location.j + distance) {
            if Location::valid_range().contains(&x)
                && Location::valid_range().contains(&y)
                && (x != location.i || y != location.j)
            {
                locations.push(Location::new(x, y));
            }
        }
    }
    locations
}

fn directional_reachability_for(location: Location, deltas: &[(i32, i32)]) -> Vec<Location> {
    deltas
        .iter()
        .filter_map(|&(dx, dy)| {
            let (new_i, new_j) = (location.i + dx, location.j + dy);
            if Location::valid_range().contains(&new_i) && Location::valid_range().contains(&new_j)
            {
                Some(Location::new(new_i, new_j))
            } else {
                None
            }
        })
        .collect()
}

fn spirit_reachability_for(location: Location) -> Vec<Location> {
    let mut locations = Vec::new();
    for x in -2i32..=2 {
        for y in -2i32..=2 {
            if x.abs().max(y.abs()) == 2
                && Location::valid_range().contains(&(location.i + x))
                && Location::valid_range().contains(&(location.j + y))
            {
                locations.push(Location::new(location.i + x, location.j + y));
            }
        }
    }
    locations
}
