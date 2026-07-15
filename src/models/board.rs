use crate::models::location::BOARD_CELLS;
use crate::*;

#[derive(Clone)]
pub(crate) struct Board {
    pub(crate) items: [Option<Item>; BOARD_CELLS],
    variant: GameVariant,
}

impl std::fmt::Debug for Board {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let occupied: Vec<(Location, &Item)> = self
            .items
            .iter()
            .enumerate()
            .filter_map(|(idx, opt)| opt.as_ref().map(|item| (Location::from_index(idx), item)))
            .collect();
        f.debug_struct("Board")
            .field("variant", &self.variant)
            .field("items", &occupied)
            .finish()
    }
}

impl PartialEq for Board {
    fn eq(&self, other: &Self) -> bool {
        self.items == other.items && self.variant == other.variant
    }
}

impl Eq for Board {}

impl Default for Board {
    fn default() -> Self {
        Self::new()
    }
}

impl Board {
    pub fn new() -> Self {
        Self::new_with_variant(GameVariant::DEFAULT)
    }

    pub fn new_with_variant(variant: GameVariant) -> Self {
        Self::from_items_array(Config::initial_items_array_for_variant(variant), variant)
    }

    pub(crate) fn from_items_array(
        items: [Option<Item>; BOARD_CELLS],
        variant: GameVariant,
    ) -> Self {
        Self { items, variant }
    }

    #[inline]
    pub fn remove_item(&mut self, location: Location) {
        self.items[location.index()] = None;
    }

    #[inline]
    pub fn put(&mut self, item: Item, location: Location) {
        self.items[location.index()] = Some(item);
    }

    #[inline]
    pub fn item(&self, location: Location) -> Option<&Item> {
        if !location.is_valid() {
            return None;
        }
        self.items[location.index()].as_ref()
    }

    #[inline]
    pub fn square(&self, location: Location) -> Square {
        if !location.is_valid() {
            return Square::Regular;
        }
        Config::square_at_for_variant(location, self.variant)
    }

    #[inline]
    pub fn variant(&self) -> GameVariant {
        self.variant
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub fn all_mons_bases(&self) -> Vec<Location> {
        Config::MONS_BASE_LOCATIONS.to_vec()
    }

    #[inline]
    pub fn supermana_base(&self) -> Location {
        Config::SUPERMANA_BASE
    }

    pub fn all_mons_locations(&self, color: Color) -> Vec<Location> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(idx, opt)| {
                if let Some(item) = opt {
                    if let Some(mon) = item.mon() {
                        if mon.color == color {
                            return Some(Location::from_index(idx));
                        }
                    }
                }
                None
            })
            .collect()
    }

    pub fn all_free_regular_mana_locations(&self, color: Color) -> Vec<Location> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(idx, opt)| match opt {
                Some(Item::Mana {
                    mana: Mana::Regular(mana_color),
                }) if *mana_color == color => Some(Location::from_index(idx)),
                _ => None,
            })
            .collect()
    }

    pub fn base(&self, mon: Mon) -> Location {
        Config::mon_base(mon.kind, mon.color)
    }

    pub fn fainted_mons_locations(&self, color: Color) -> Vec<Location> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(idx, opt)| match opt {
                Some(Item::Mon { mon }) if mon.color == color && mon.is_fainted() => {
                    Some(Location::from_index(idx))
                }
                _ => None,
            })
            .collect()
    }

    pub fn find_mana(&self, color: Color) -> Option<Location> {
        self.items
            .iter()
            .enumerate()
            .find_map(|(idx, opt)| match opt {
                Some(Item::Mana {
                    mana: Mana::Regular(mana_color),
                }) if *mana_color == color => Some(Location::from_index(idx)),
                _ => None,
            })
    }

    pub fn find_awake_angel(&self, color: Color) -> Option<Location> {
        self.items.iter().enumerate().find_map(|(idx, opt)| {
            if let Some(item) = opt {
                if let Some(mon) = item.mon() {
                    if mon.color == color && mon.kind == MonKind::Angel && !mon.is_fainted() {
                        return Some(Location::from_index(idx));
                    }
                }
            }
            None
        })
    }

    /// Iterate over occupied cells: yields (Location, &Item)
    #[inline]
    #[cfg(any(target_arch = "wasm32", test))]
    pub fn occupied(&self) -> impl Iterator<Item = (Location, &Item)> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(idx, opt)| opt.as_ref().map(|item| (Location::from_index(idx), item)))
    }
}
