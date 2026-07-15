use crate::*;
use std::collections::HashMap;
use std::hash::Hash;

#[cfg(any(target_arch = "wasm32", test))]
#[derive(Debug, Clone)]
pub(crate) struct VerboseTrackingEntity {
    pub(crate) fen: String,
    pub(crate) color: Color,
    pub(crate) events: Vec<Event>,
}

const START_SUGGESTIONS_CACHE_CAPACITY: usize = 8;
const SECOND_INPUT_OPTIONS_CACHE_CAPACITY: usize = 4_096;
const SECOND_STAGE_CACHE_CAPACITY: usize = 8_192;
const THIRD_STAGE_CACHE_CAPACITY: usize = 8_192;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct SecondInputOptionsCacheKey {
    start_location: Location,
    start_item: Item,
    only_one: bool,
    specific_next: Option<Input>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct SecondStageCacheKey {
    kind: NextInputKind,
    start_item: Item,
    start_location: Location,
    target_location: Location,
    specific_next: Option<Input>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct ThirdStageCacheKey {
    third_input: Input,
    third_input_kind: NextInputKind,
    third_actor_mon_item: Option<Item>,
    start_item: Item,
    start_location: Location,
    target_location: Location,
}

type ProcessInputStageResult = Option<(Vec<Event>, Vec<NextInput>)>;

#[derive(Debug, Clone, Default)]
struct ProcessInputCache {
    start_suggestions: HashMap<SuggestedStartInputOptions, Output>,
    second_input_options: HashMap<SecondInputOptionsCacheKey, Vec<NextInput>>,
    second_stage: HashMap<SecondStageCacheKey, ProcessInputStageResult>,
    third_stage: HashMap<ThirdStageCacheKey, ProcessInputStageResult>,
}

#[derive(Debug)]
pub(crate) struct MonsGame {
    pub(crate) board: Board,
    pub(crate) white_score: i32,
    pub(crate) black_score: i32,
    pub(crate) active_color: Color,
    pub(crate) actions_used_count: i32,
    pub(crate) mana_moves_count: i32,
    pub(crate) mons_moves_count: i32,
    pub(crate) white_potions_count: i32,
    pub(crate) black_potions_count: i32,
    pub(crate) turn_number: i32,
    pub(crate) takeback_fens: Vec<String>,
    pub(crate) is_moves_verified: bool,
    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) with_verbose_tracking: bool,
    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) verbose_tracking_entities: Vec<VerboseTrackingEntity>,
    track_takeback_history: bool,
    process_input_cache: ProcessInputCache,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub(crate) struct SuggestedStartInputOptions {
    pub(crate) include_mana_starts_with_potion_action: bool,
}

impl SuggestedStartInputOptions {
    #[cfg(any(target_arch = "wasm32", test))]
    pub const fn for_automove() -> Self {
        Self {
            include_mana_starts_with_potion_action: true,
        }
    }
}

impl Clone for MonsGame {
    fn clone(&self) -> Self {
        Self {
            board: self.board.clone(),
            white_score: self.white_score,
            black_score: self.black_score,
            active_color: self.active_color,
            actions_used_count: self.actions_used_count,
            mana_moves_count: self.mana_moves_count,
            mons_moves_count: self.mons_moves_count,
            white_potions_count: self.white_potions_count,
            black_potions_count: self.black_potions_count,
            turn_number: self.turn_number,
            takeback_fens: self.takeback_fens.clone(),
            is_moves_verified: self.is_moves_verified,
            #[cfg(any(target_arch = "wasm32", test))]
            with_verbose_tracking: self.with_verbose_tracking,
            #[cfg(any(target_arch = "wasm32", test))]
            verbose_tracking_entities: self.verbose_tracking_entities.clone(),
            track_takeback_history: self.track_takeback_history,
            process_input_cache: ProcessInputCache::default(),
        }
    }
}

impl MonsGame {
    pub fn new(with_verbose_tracking: bool, variant: GameVariant) -> Self {
        #[cfg(not(any(target_arch = "wasm32", test)))]
        let _ = with_verbose_tracking;
        Self {
            board: Board::new_with_variant(variant),
            white_score: 0,
            black_score: 0,
            active_color: Color::White,
            actions_used_count: 0,
            mana_moves_count: 0,
            mons_moves_count: 0,
            white_potions_count: 0,
            black_potions_count: 0,
            turn_number: 1,
            takeback_fens: vec![],
            is_moves_verified: true,
            #[cfg(any(target_arch = "wasm32", test))]
            with_verbose_tracking,
            #[cfg(any(target_arch = "wasm32", test))]
            verbose_tracking_entities: vec![],
            track_takeback_history: true,
            process_input_cache: ProcessInputCache::default(),
        }
    }

    #[allow(clippy::too_many_arguments)]
    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn new_simulation_state(
        board: Board,
        white_score: i32,
        black_score: i32,
        active_color: Color,
        actions_used_count: i32,
        mana_moves_count: i32,
        mons_moves_count: i32,
        white_potions_count: i32,
        black_potions_count: i32,
        turn_number: i32,
    ) -> Self {
        Self {
            board,
            white_score,
            black_score,
            active_color,
            actions_used_count,
            mana_moves_count,
            mons_moves_count,
            white_potions_count,
            black_potions_count,
            turn_number,
            takeback_fens: vec![],
            is_moves_verified: true,
            with_verbose_tracking: false,
            verbose_tracking_entities: vec![],
            track_takeback_history: false,
            process_input_cache: ProcessInputCache::default(),
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub fn clone_for_simulation(&self) -> Self {
        let mut simulation = Self::new_simulation_state(
            self.board.clone(),
            self.white_score,
            self.black_score,
            self.active_color,
            self.actions_used_count,
            self.mana_moves_count,
            self.mons_moves_count,
            self.white_potions_count,
            self.black_potions_count,
            self.turn_number,
        );
        simulation.is_moves_verified = self.is_moves_verified;
        simulation
    }

    #[inline]
    pub fn variant(&self) -> GameVariant {
        self.board.variant()
    }

    #[cfg(test)]
    pub fn replace_board_items<I>(&mut self, items: I)
    where
        I: IntoIterator<Item = (Location, Item)>,
    {
        let mut item_array = [None; BOARD_CELLS];
        for (location, item) in items {
            item_array[location.index()] = Some(item);
        }
        self.board = Board::from_items_array(item_array, self.variant());
        self.takeback_fens.clear();
        self.verbose_tracking_entities.clear();
        self.is_moves_verified = false;
        self.invalidate_process_input_cache();
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub(crate) fn set_takeback_history_tracking(&mut self, enabled: bool) {
        self.track_takeback_history = enabled;
        if !enabled {
            self.takeback_fens.clear();
        }
        self.invalidate_process_input_cache();
    }

    pub(crate) fn invalidate_process_input_cache(&mut self) {
        self.process_input_cache = ProcessInputCache::default();
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub fn set_verbose_tracking(&mut self, enabled: bool) {
        self.with_verbose_tracking = enabled;
        if !enabled {
            self.verbose_tracking_entities.clear();
            self.verbose_tracking_entities.shrink_to_fit();
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub fn clear_tracking(&mut self) {
        self.takeback_fens.clear();
        self.takeback_fens.shrink_to_fit();
        self.verbose_tracking_entities.clear();
        self.verbose_tracking_entities.shrink_to_fit();
        self.invalidate_process_input_cache();
    }

    fn update_with(&mut self, other_game: &MonsGame) {
        self.board = other_game.board.clone();
        self.white_score = other_game.white_score;
        self.black_score = other_game.black_score;
        self.active_color = other_game.active_color;
        self.actions_used_count = other_game.actions_used_count;
        self.mana_moves_count = other_game.mana_moves_count;
        self.mons_moves_count = other_game.mons_moves_count;
        self.white_potions_count = other_game.white_potions_count;
        self.black_potions_count = other_game.black_potions_count;
        self.turn_number = other_game.turn_number;
        self.invalidate_process_input_cache();
    }

    #[inline]
    fn bounded_cache_insert<K, V>(cache: &mut HashMap<K, V>, key: K, value: V, max_entries: usize)
    where
        K: Eq + Hash,
    {
        if cache.len() >= max_entries && !cache.contains_key(&key) {
            cache.clear();
        }
        cache.insert(key, value);
    }

    // MARK: - process input

    pub fn can_takeback(&self, color: Color) -> bool {
        self.track_takeback_history && self.takeback_fens.len() > 1 && self.active_color == color
    }

    pub fn process_input(
        &mut self,
        input: Vec<Input>,
        do_not_apply_events: bool,
        one_option_enough: bool,
    ) -> Output {
        self.process_input_slice(input.as_slice(), do_not_apply_events, one_option_enough)
    }

    #[cfg(test)]
    pub fn process_input_with_start_options(
        &mut self,
        input: Vec<Input>,
        do_not_apply_events: bool,
        one_option_enough: bool,
        suggested_start_options: Option<SuggestedStartInputOptions>,
    ) -> Output {
        self.process_input_with_start_options_slice(
            input.as_slice(),
            do_not_apply_events,
            one_option_enough,
            suggested_start_options,
        )
    }

    pub(crate) fn process_input_slice(
        &mut self,
        input: &[Input],
        do_not_apply_events: bool,
        one_option_enough: bool,
    ) -> Output {
        self.process_input_with_start_options_slice(
            input,
            do_not_apply_events,
            one_option_enough,
            None,
        )
    }

    pub(crate) fn process_input_with_start_options_slice(
        &mut self,
        input: &[Input],
        do_not_apply_events: bool,
        one_option_enough: bool,
        suggested_start_options: Option<SuggestedStartInputOptions>,
    ) -> Output {
        self.process_input_internal(
            input,
            do_not_apply_events,
            one_option_enough,
            suggested_start_options.unwrap_or_default(),
        )
    }

    fn process_input_internal(
        &mut self,
        input: &[Input],
        do_not_apply_events: bool,
        one_option_enough: bool,
        suggested_start_options: SuggestedStartInputOptions,
    ) -> Output {
        if self.winner_color().is_some() {
            return Output::InvalidInput;
        }
        if input.is_empty() {
            if let Some(cached) = self
                .process_input_cache
                .start_suggestions
                .get(&suggested_start_options)
            {
                return cached.clone();
            }
            let output = self.suggested_input_to_start_with(suggested_start_options);
            Self::bounded_cache_insert(
                &mut self.process_input_cache.start_suggestions,
                suggested_start_options,
                output.clone(),
                START_SUGGESTIONS_CACHE_CAPACITY,
            );
            return output;
        }

        if input.len() == 1 && input[0] == Input::Takeback {
            if self.can_takeback(self.active_color) {
                self.takeback_fens.pop();
                #[cfg(target_arch = "wasm32")]
                self.verbose_tracking_entities.pop();
                let fen = self.takeback_fens.last().cloned();
                if let Some(fen) = fen {
                    let fen_game = MonsGame::from_fen(fen.as_str(), false);
                    if let Some(fen_game) = fen_game {
                        self.update_with(&fen_game);
                    }
                } else {
                    return Output::InvalidInput;
                }
                self.invalidate_process_input_cache();
                return Output::Events(vec![Event::Takeback]);
            } else {
                return Output::InvalidInput;
            }
        }

        let start_location = match input.first() {
            Some(Input::Location(location)) => *location,
            _ => return Output::InvalidInput,
        };
        let start_item = match self.board.item(start_location) {
            Some(item) => *item,
            None => return Output::InvalidInput,
        };
        let specific_second_input = input.get(1).copied();
        let second_input_options = self.second_input_options(
            start_location,
            &start_item,
            one_option_enough,
            specific_second_input,
        );

        let second_input = if let Some(second_input) = specific_second_input {
            second_input
        } else if second_input_options.is_empty() {
            return Output::InvalidInput;
        } else {
            return Output::NextInputOptions(second_input_options);
        };

        let target_location = match second_input {
            Input::Location(location) => location,
            _ => return Output::InvalidInput,
        };
        let second_input_kind = match second_input_options
            .iter()
            .find(|option| option.input == second_input)
        {
            Some(option) => option.kind,
            None => return Output::InvalidInput,
        };

        let specific_third_input = input.get(2).copied();
        let (mut events, third_input_options) = match self.process_second_input(
            second_input_kind,
            start_item,
            start_location,
            target_location,
            specific_third_input,
        ) {
            Some((events, options)) => (events, options),
            None => (vec![], vec![]),
        };

        if specific_third_input.is_none() {
            if !third_input_options.is_empty() {
                return Output::NextInputOptions(third_input_options);
            } else if !events.is_empty() {
                return Output::Events(if do_not_apply_events {
                    events
                } else {
                    self.apply_and_add_resulting_events(events)
                });
            } else {
                return Output::InvalidInput;
            }
        }

        let specific_third_input = specific_third_input.unwrap();

        let third_input = match third_input_options
            .iter()
            .find(|option| option.input == specific_third_input)
        {
            Some(option) => option,
            None => return Output::InvalidInput,
        };

        let specific_forth_input = input.get(3).copied();
        let (forth_events, forth_input_options) = match self.process_third_input(
            third_input,
            start_item,
            start_location,
            target_location,
        ) {
            Some((events, options)) => (events, options),
            None => (vec![], vec![]),
        };
        events.extend(forth_events);

        if specific_forth_input.is_none() {
            if !forth_input_options.is_empty() {
                return Output::NextInputOptions(forth_input_options);
            } else if !events.is_empty() {
                return Output::Events(if do_not_apply_events {
                    events
                } else {
                    self.apply_and_add_resulting_events(events)
                });
            } else {
                return Output::InvalidInput;
            }
        }

        let specific_forth_input = specific_forth_input.unwrap();

        match specific_forth_input {
            Input::Modifier(modifier) => {
                let destination_location = match third_input.input {
                    Input::Location(location) => location,
                    _ => return Output::InvalidInput,
                };
                let forth_input = match forth_input_options
                    .iter()
                    .find(|option| option.input == specific_forth_input)
                {
                    Some(option) => option,
                    None => return Output::InvalidInput,
                };
                if let Some(actor_mon_item) = forth_input.actor_mon_item {
                    if let Some(actor_mon) = actor_mon_item.mon() {
                        match modifier {
                            Modifier::SelectBomb => events.push(Event::PickupBomb {
                                by: *actor_mon,
                                at: destination_location,
                            }),
                            Modifier::SelectPotion => events.push(Event::PickupPotion {
                                by: actor_mon_item,
                                at: destination_location,
                            }),
                            Modifier::Cancel => return Output::InvalidInput,
                        }
                        return Output::Events(if do_not_apply_events {
                            events
                        } else {
                            self.apply_and_add_resulting_events(events)
                        });
                    }
                }
                Output::InvalidInput
            }
            _ => Output::InvalidInput,
        }
    }

    // MARK: - process step by step

    fn suggested_input_to_start_with(
        &mut self,
        suggested_start_options: SuggestedStartInputOptions,
    ) -> Output {
        let mut suggested_locations: Vec<Location> = Vec::new();
        let mut seen_locations = [false; BOARD_CELLS];

        for location in self.board.all_mons_locations(self.active_color) {
            let start_input = [Input::Location(location)];
            let output =
                self.process_input_internal(&start_input, true, true, suggested_start_options);
            if matches!(output, Output::NextInputOptions(options) if !options.is_empty()) {
                let index = location.index();
                if !seen_locations[index] {
                    seen_locations[index] = true;
                    suggested_locations.push(location);
                }
            }
        }

        let should_add_regular_mana_starts = self.player_can_move_mana()
            && ((!self.player_can_move_mon() && !self.player_can_use_action())
                || suggested_locations.is_empty()
                || (suggested_start_options.include_mana_starts_with_potion_action
                    && !self.player_can_move_mon()
                    && self.actions_used_count >= Config::ACTIONS_PER_TURN
                    && self.player_potions_count() > 0));

        if should_add_regular_mana_starts {
            for location in self
                .board
                .all_free_regular_mana_locations(self.active_color)
            {
                let start_input = [Input::Location(location)];
                let output =
                    self.process_input_internal(&start_input, true, true, suggested_start_options);
                if matches!(output, Output::NextInputOptions(options) if !options.is_empty()) {
                    let index = location.index();
                    if !seen_locations[index] {
                        seen_locations[index] = true;
                        suggested_locations.push(location);
                    }
                }
            }
        }

        if suggested_locations.is_empty() {
            Output::InvalidInput
        } else {
            Output::LocationsToStartFrom(suggested_locations)
        }
    }

    fn second_input_options(
        &mut self,
        start_location: Location,
        start_item: &Item,
        only_one: bool,
        specific_next: Option<Input>,
    ) -> Vec<NextInput> {
        let cache_key = SecondInputOptionsCacheKey {
            start_location,
            start_item: *start_item,
            only_one,
            specific_next,
        };
        if let Some(cached) = self
            .process_input_cache
            .second_input_options
            .get(&cache_key)
        {
            return cached.clone();
        }

        let specific_location = match specific_next {
            Some(Input::Location(location)) => Some(location),
            _ => None,
        };
        let opponents_angel_location = self.board.find_awake_angel(self.active_color.other());
        let start_square = self.board.square(start_location);
        let mut second_input_options = Vec::new();
        match start_item {
            Item::Mon { mon } if mon.color == self.active_color && !mon.is_fainted() => {
                if self.player_can_move_mon() {
                    second_input_options.extend(self.next_inputs_from_slice(
                        start_location.nearby_locations_ref(),
                        NextInputKind::MonMove,
                        only_one,
                        specific_next.map(|input| match input {
                            Input::Location(loc) => loc,
                            _ => start_location,
                        }),
                        |location| {
                            let item = self.board.item(location);
                            let square = self.board.square(location);

                            let item_allows = match item {
                                Some(Item::Mon { .. })
                                | Some(Item::MonWithMana { .. })
                                | Some(Item::MonWithConsumable { .. }) => false,
                                Some(Item::Mana { .. }) => mon.kind == MonKind::Drainer,
                                Some(Item::Consumable { .. }) => true,
                                None => true,
                            };

                            item_allows
                                && match square {
                                    Square::Regular
                                    | Square::ConsumableBase
                                    | Square::ManaBase { .. }
                                    | Square::ManaPool { .. } => true,
                                    Square::SupermanaBase => {
                                        matches!(
                                            item,
                                            Some(Item::Mana {
                                                mana: Mana::Supermana
                                            }) | None
                                        ) && mon.kind == MonKind::Drainer
                                    }
                                    Square::MonBase { kind, color } => {
                                        kind == mon.kind && color == mon.color
                                    }
                                }
                        },
                    ));
                }

                if !matches!(start_square, Square::MonBase { .. }) && self.player_can_use_action() {
                    match mon.kind {
                        MonKind::Angel | MonKind::Drainer => (),
                        MonKind::Mystic => {
                            second_input_options.extend(self.next_inputs_from_slice(
                                start_location.reachable_by_mystic_action_ref(),
                                NextInputKind::MysticAction,
                                only_one,
                                specific_location,
                                |location| {
                                    if let Some(item) = self.board.item(location) {
                                        if Self::is_location_guarded_by_angel_location(
                                            opponents_angel_location,
                                            location,
                                        ) {
                                            return false;
                                        }

                                        match item {
                                            Item::Mon { mon: target_mon }
                                            | Item::MonWithMana {
                                                mon: target_mon, ..
                                            }
                                            | Item::MonWithConsumable {
                                                mon: target_mon, ..
                                            } => {
                                                mon.color != target_mon.color
                                                    && !target_mon.is_fainted()
                                            }
                                            _ => false,
                                        }
                                    } else {
                                        false
                                    }
                                },
                            ));
                        }
                        MonKind::Demon => {
                            second_input_options.extend(self.next_inputs_from_slice(
                                start_location.reachable_by_demon_action_ref(),
                                NextInputKind::DemonAction,
                                only_one,
                                specific_location,
                                |location| {
                                    if let Some(item) = self.board.item(location) {
                                        if Self::is_location_guarded_by_angel_location(
                                            opponents_angel_location,
                                            location,
                                        ) || self
                                            .board
                                            .item(start_location.location_between(&location))
                                            .is_some()
                                            || matches!(
                                                self.board.square(
                                                    start_location.location_between(&location)
                                                ),
                                                Square::SupermanaBase | Square::MonBase { .. }
                                            )
                                        {
                                            return false;
                                        }

                                        match item {
                                            Item::Mon { mon: target_mon }
                                            | Item::MonWithMana {
                                                mon: target_mon, ..
                                            }
                                            | Item::MonWithConsumable {
                                                mon: target_mon, ..
                                            } => {
                                                mon.color != target_mon.color
                                                    && !target_mon.is_fainted()
                                            }
                                            _ => false,
                                        }
                                    } else {
                                        false
                                    }
                                },
                            ));
                        }
                        MonKind::Spirit => {
                            second_input_options.extend(self.next_inputs_from_slice(
                                start_location.reachable_by_spirit_action_ref(),
                                NextInputKind::SpiritTargetCapture,
                                only_one,
                                specific_location,
                                |location| {
                                    if let Some(item) = self.board.item(location) {
                                        match item {
                                            Item::Mon { mon: target_mon }
                                            | Item::MonWithMana {
                                                mon: target_mon, ..
                                            }
                                            | Item::MonWithConsumable {
                                                mon: target_mon, ..
                                            } => !target_mon.is_fainted(),
                                            _ => true,
                                        }
                                    } else {
                                        false
                                    }
                                },
                            ));
                        }
                    }
                }
            }

            Item::Mana { mana }
                if matches!(mana, Mana::Regular(color) if color == &self.active_color)
                    && self.player_can_move_mana() =>
            {
                second_input_options.extend(self.next_inputs_from_slice(
                    start_location.nearby_locations_ref(),
                    NextInputKind::ManaMove,
                    only_one,
                    specific_location,
                    |location| {
                        let item = self.board.item(location);
                        let square = self.board.square(location);
                        match item {
                            Some(Item::Mon { mon }) => match square {
                                Square::Regular
                                | Square::ConsumableBase
                                | Square::ManaBase { .. }
                                | Square::ManaPool { .. } => mon.kind == MonKind::Drainer,
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
                    },
                ));
            }
            Item::MonWithMana { mon, mana }
                if mon.color == self.active_color && self.player_can_move_mon() =>
            {
                second_input_options.extend(self.next_inputs_from_slice(
                    start_location.nearby_locations_ref(),
                    NextInputKind::MonMove,
                    only_one,
                    specific_location,
                    |location| {
                        let item = self.board.item(location);
                        let square = self.board.square(location);

                        match item {
                            Some(Item::Mon { .. })
                            | Some(Item::MonWithMana { .. })
                            | Some(Item::MonWithConsumable { .. }) => false,
                            Some(Item::Consumable { .. }) | Some(Item::Mana { .. }) => true,
                            None => match square {
                                Square::Regular
                                | Square::ConsumableBase
                                | Square::ManaBase { .. }
                                | Square::ManaPool { .. } => true,
                                Square::SupermanaBase => *mana == Mana::Supermana,
                                Square::MonBase { .. } => false,
                            },
                        }
                    },
                ));
            }
            Item::MonWithConsumable { mon, consumable } if mon.color == self.active_color => {
                if self.player_can_move_mon() {
                    second_input_options.extend(self.next_inputs_from_slice(
                        start_location.nearby_locations_ref(),
                        NextInputKind::MonMove,
                        only_one,
                        specific_location,
                        |location| {
                            let item = self.board.item(location);
                            let square = self.board.square(location);

                            match item {
                                Some(Item::Mon { .. })
                                | Some(Item::Mana { .. })
                                | Some(Item::MonWithMana { .. })
                                | Some(Item::MonWithConsumable { .. }) => false,
                                Some(Item::Consumable { .. }) => true,
                                None => matches!(
                                    square,
                                    Square::Regular
                                        | Square::ConsumableBase
                                        | Square::ManaBase { .. }
                                        | Square::ManaPool { .. }
                                ),
                            }
                        },
                    ));
                }

                if matches!(consumable, Consumable::Bomb) {
                    second_input_options.extend(self.next_inputs_from_slice(
                        start_location.reachable_by_bomb_ref(),
                        NextInputKind::BombAttack,
                        only_one,
                        specific_location,
                        |location| {
                            self.board.item(location).is_some_and(|item| match item {
                                Item::Mon { mon: target_mon }
                                | Item::MonWithMana {
                                    mon: target_mon, ..
                                }
                                | Item::MonWithConsumable {
                                    mon: target_mon, ..
                                } => mon.color != target_mon.color && !target_mon.is_fainted(),
                                _ => false,
                            })
                        },
                    ));
                }
            }
            _ => (),
        }

        Self::bounded_cache_insert(
            &mut self.process_input_cache.second_input_options,
            cache_key,
            second_input_options.clone(),
            SECOND_INPUT_OPTIONS_CACHE_CAPACITY,
        );

        second_input_options
    }

    fn process_second_input(
        &mut self,
        kind: NextInputKind,
        start_item: Item,
        start_location: Location,
        target_location: Location,
        specific_next: Option<Input>,
    ) -> Option<(Vec<Event>, Vec<NextInput>)> {
        let cache_key = SecondStageCacheKey {
            kind,
            start_item,
            start_location,
            target_location,
            specific_next,
        };
        if let Some(cached) = self.process_input_cache.second_stage.get(&cache_key) {
            return cached.clone();
        }

        let computed = self.process_second_input_uncached(
            kind,
            start_item,
            start_location,
            target_location,
            specific_next,
        );
        Self::bounded_cache_insert(
            &mut self.process_input_cache.second_stage,
            cache_key,
            computed.clone(),
            SECOND_STAGE_CACHE_CAPACITY,
        );
        computed
    }

    fn process_second_input_uncached(
        &mut self,
        kind: NextInputKind,
        start_item: Item,
        start_location: Location,
        target_location: Location,
        specific_next: Option<Input>,
    ) -> Option<(Vec<Event>, Vec<NextInput>)> {
        let _specific_location = match specific_next {
            Some(Input::Location(location)) => Some(location),
            _ => None,
        };

        let mut third_input_options = Vec::with_capacity(4);
        let mut events = Vec::with_capacity(6);
        let target_square = self.board.square(target_location);
        let target_item = self.board.item(target_location);

        match kind {
            NextInputKind::MonMove => {
                start_item.mon()?;
                events.push(Event::MonMove {
                    item: start_item,
                    from: start_location,
                    to: target_location,
                });

                if let Some(target_item) = self.board.item(target_location).cloned() {
                    match target_item {
                        Item::Mon { .. }
                        | Item::MonWithMana { .. }
                        | Item::MonWithConsumable { .. } => return None,
                        Item::Mana { mana } => {
                            if let Some(start_mana) = start_item.mana() {
                                events.push(Event::ManaDropped {
                                    mana: *start_mana,
                                    at: start_location,
                                });
                            }
                            if let Some(mon) = start_item.mon() {
                                events.push(Event::PickupMana {
                                    mana,
                                    by: *mon,
                                    at: target_location,
                                });
                            }
                        }
                        Item::Consumable { consumable } => match consumable {
                            Consumable::Bomb | Consumable::Potion => return None,
                            Consumable::BombOrPotion => {
                                if start_item.consumable().is_some() || start_item.mana().is_some()
                                {
                                    events.push(Event::PickupPotion {
                                        by: start_item,
                                        at: target_location,
                                    });
                                } else {
                                    third_input_options.push(NextInput::new(
                                        Input::Modifier(Modifier::SelectBomb),
                                        NextInputKind::SelectConsumable,
                                        Some(start_item),
                                    ));
                                    third_input_options.push(NextInput::new(
                                        Input::Modifier(Modifier::SelectPotion),
                                        NextInputKind::SelectConsumable,
                                        Some(start_item),
                                    ));
                                }
                            }
                        },
                    }
                }

                if let Square::ManaPool { .. } = target_square {
                    if let Some(mana_in_hand) = start_item.mana() {
                        events.push(Event::ManaScored {
                            mana: *mana_in_hand,
                            at: target_location,
                        });
                    }
                }
            }
            NextInputKind::ManaMove => {
                let mana = match start_item {
                    Item::Mana { mana } => mana,
                    _ => return None,
                };
                events.push(Event::ManaMove {
                    mana,
                    from: start_location,
                    to: target_location,
                });

                if let Some(target_item) = self.board.item(target_location) {
                    match target_item {
                        Item::Mon { mon } => {
                            events.push(Event::PickupMana {
                                mana,
                                by: *mon,
                                at: target_location,
                            });
                        }
                        Item::Mana { .. }
                        | Item::Consumable { .. }
                        | Item::MonWithMana { .. }
                        | Item::MonWithConsumable { .. } => return None,
                    }
                }

                match target_square {
                    Square::ManaBase { .. } | Square::ConsumableBase | Square::Regular => (),
                    Square::ManaPool { color: _ } => {
                        events.push(Event::ManaScored {
                            mana,
                            at: target_location,
                        });
                    }
                    Square::MonBase { .. } | Square::SupermanaBase => return None,
                }
            }
            NextInputKind::MysticAction => {
                let start_mon = match start_item {
                    Item::Mon { mon } => mon,
                    _ => return None,
                };
                events.push(Event::MysticAction {
                    mystic: start_mon,
                    from: start_location,
                    to: target_location,
                });

                if let Some(target_item) = self.board.item(target_location) {
                    match target_item {
                        Item::Mon { mon: target_mon }
                        | Item::MonWithMana {
                            mon: target_mon, ..
                        }
                        | Item::MonWithConsumable {
                            mon: target_mon, ..
                        } => {
                            events.push(Event::MonFainted {
                                mon: *target_mon,
                                from: target_location,
                                to: self.board.base(Mon {
                                    kind: target_mon.kind,
                                    color: target_mon.color,
                                    cooldown: target_mon.cooldown,
                                }),
                            });

                            if let Item::MonWithMana { mana, .. } = target_item {
                                match mana {
                                    Mana::Regular(_) => events.push(Event::ManaDropped {
                                        mana: *mana,
                                        at: target_location,
                                    }),
                                    Mana::Supermana => events.push(Event::SupermanaBackToBase {
                                        from: target_location,
                                        to: self.board.supermana_base(),
                                    }),
                                }
                            }

                            if let Item::MonWithConsumable { consumable, .. } = target_item {
                                match consumable {
                                    Consumable::Bomb => {
                                        events.push(Event::BombExplosion {
                                            at: target_location,
                                        });
                                    }
                                    Consumable::Potion | Consumable::BombOrPotion => return None,
                                }
                            }
                        }
                        Item::Consumable { .. } | Item::Mana { .. } => return None,
                    }
                }
            }
            NextInputKind::DemonAction => {
                let start_mon = match start_item {
                    Item::Mon { mon } => mon,
                    _ => return None,
                };
                events.push(Event::DemonAction {
                    demon: start_mon,
                    from: start_location,
                    to: target_location,
                });
                let mut requires_additional_step = false;

                if let Some(target_item) = self.board.item(target_location) {
                    match target_item {
                        Item::Mana { .. } | Item::Consumable { .. } => return None,
                        Item::Mon { mon: target_mon }
                        | Item::MonWithMana {
                            mon: target_mon, ..
                        }
                        | Item::MonWithConsumable {
                            mon: target_mon, ..
                        } => {
                            events.push(Event::MonFainted {
                                mon: *target_mon,
                                from: target_location,
                                to: self.board.base(Mon {
                                    kind: target_mon.kind,
                                    color: target_mon.color,
                                    cooldown: target_mon.cooldown,
                                }),
                            });

                            if let Item::MonWithMana { mana, .. } = target_item {
                                match mana {
                                    Mana::Regular(_) => {
                                        requires_additional_step = true;
                                        events.push(Event::ManaDropped {
                                            mana: *mana,
                                            at: target_location,
                                        });
                                    }
                                    Mana::Supermana => events.push(Event::SupermanaBackToBase {
                                        from: target_location,
                                        to: self.board.supermana_base(),
                                    }),
                                }
                            }

                            if let Item::MonWithConsumable { consumable, .. } = target_item {
                                match consumable {
                                    Consumable::Bomb => {
                                        events.push(Event::BombExplosion {
                                            at: target_location,
                                        });
                                        events.push(Event::MonFainted {
                                            mon: start_mon,
                                            from: target_location,
                                            to: self.board.base(Mon {
                                                kind: start_mon.kind,
                                                color: start_mon.color,
                                                cooldown: start_mon.cooldown,
                                            }),
                                        });
                                    }
                                    Consumable::Potion | Consumable::BombOrPotion => return None,
                                }
                            }
                        }
                    }
                }

                match target_square {
                    Square::Regular
                    | Square::ConsumableBase
                    | Square::ManaBase { .. }
                    | Square::ManaPool { .. } => (),
                    Square::SupermanaBase | Square::MonBase { .. } => {
                        requires_additional_step = true
                    }
                }

                if requires_additional_step {
                    for &location in target_location.nearby_locations_ref() {
                        let item = self.board.item(location);
                        let square = self.board.square(location);

                        let is_valid_location =
                            item.is_none() || matches!(item, Some(Item::Consumable { .. }));

                        if is_valid_location {
                            match square {
                                Square::Regular
                                | Square::ConsumableBase
                                | Square::ManaBase { .. }
                                | Square::ManaPool { .. } => {
                                    third_input_options.push(NextInput {
                                        input: Input::Location(location),
                                        kind: NextInputKind::DemonAdditionalStep,
                                        actor_mon_item: None,
                                    });
                                }
                                Square::MonBase { kind, color } => {
                                    if start_mon.kind == kind && start_mon.color == color {
                                        third_input_options.push(NextInput {
                                            input: Input::Location(location),
                                            kind: NextInputKind::DemonAdditionalStep,
                                            actor_mon_item: None,
                                        });
                                    }
                                }
                                Square::SupermanaBase => (),
                            }
                        }
                    }
                }
            }

            NextInputKind::SpiritTargetCapture => {
                target_item?;
                let target_mon = target_item.as_ref().and_then(|item| item.mon());
                let target_mana = target_item.as_ref().and_then(|item| item.mana());
                third_input_options.extend(self.next_inputs_from_slice(
                    target_location.nearby_locations_ref(),
                    NextInputKind::SpiritTargetMove,
                    false,
                    None,
                    |location| {
                        let destination_item = self.board.item(location);
                        let destination_square = self.board.square(location);

                        let valid_destination = match destination_item {
                            Some(Item::Mon {
                                mon: destination_mon,
                            }) => match target_item {
                                Some(Item::Mon { .. })
                                | Some(Item::MonWithMana { .. })
                                | Some(Item::MonWithConsumable { .. }) => false,
                                Some(Item::Mana { .. }) => {
                                    destination_mon.kind == MonKind::Drainer
                                        && !destination_mon.is_fainted()
                                }
                                Some(Item::Consumable {
                                    consumable: target_consumable,
                                }) => *target_consumable == Consumable::BombOrPotion,
                                None => false,
                            },
                            Some(Item::Mana { .. }) => {
                                matches!(target_mon, Some(mon) if mon.kind == MonKind::Drainer && !mon.is_fainted())
                            }
                            Some(Item::MonWithMana { .. }) | Some(Item::MonWithConsumable { .. }) => {
                                match target_item {
                                    Some(Item::Mon { .. })
                                    | Some(Item::MonWithMana { .. })
                                    | Some(Item::MonWithConsumable { .. }) => false,
                                    Some(Item::Mana { .. }) => false,
                                    Some(Item::Consumable {
                                        consumable: target_consumable,
                                    }) => *target_consumable == Consumable::BombOrPotion,
                                    None => false,
                                }
                            }
                            Some(Item::Consumable {
                                consumable: destination_consumable,
                            }) => matches!(target_item, Some(Item::Mon { .. }) | Some(Item::MonWithMana { .. }) | Some(Item::MonWithConsumable { .. }) if *destination_consumable == Consumable::BombOrPotion),
                            None => true,
                        };

                        if valid_destination {
                            match destination_square {
                                Square::Regular
                                | Square::ConsumableBase
                                | Square::ManaBase { .. }
                                | Square::ManaPool { .. } => true,
                                Square::SupermanaBase => {
                                    target_mana == Some(&Mana::Supermana)
                                        || (target_mana.is_none()
                                            && matches!(
                                                target_mon.map(|mon| mon.kind),
                                                Some(MonKind::Drainer)
                                            )
                                            && (destination_item.is_none()
                                                || matches!(
                                                    destination_item,
                                                    Some(Item::Mana {
                                                        mana: Mana::Supermana
                                                    })
                                                )))
                                        || (matches!(
                                            target_mon.map(|mon| mon.kind),
                                            Some(MonKind::Drainer)
                                        ) && matches!(
                                            destination_item,
                                            Some(Item::Mana {
                                                mana: Mana::Supermana
                                            })
                                        ))
                                }
                                Square::MonBase { kind, color } => {
                                    if let Some(mon) = target_mon {
                                        mon.kind == kind
                                            && mon.color == color
                                            && target_mana.is_none()
                                            && target_item
                                                .as_ref()
                                                .and_then(|item| item.consumable())
                                                .is_none()
                                    } else {
                                        false
                                    }
                                }
                            }
                        } else {
                            false
                        }
                    },
                ));
            }

            NextInputKind::BombAttack => {
                let start_mon = start_item.mon().unwrap();

                events.push(Event::BombAttack {
                    by: *start_mon,
                    from: start_location,
                    to: target_location,
                });

                if let Some(target_item) = target_item {
                    match target_item {
                        Item::Mon { mon }
                        | Item::MonWithMana { mon, .. }
                        | Item::MonWithConsumable { mon, .. } => {
                            events.push(Event::MonFainted {
                                mon: *mon,
                                from: target_location,
                                to: self.board.base(*mon),
                            });

                            if let Item::MonWithMana { mana, .. } = target_item {
                                match mana {
                                    Mana::Regular(_) => events.push(Event::ManaDropped {
                                        mana: *mana,
                                        at: target_location,
                                    }),
                                    Mana::Supermana => events.push(Event::SupermanaBackToBase {
                                        from: target_location,
                                        to: self.board.supermana_base(),
                                    }),
                                }
                            }

                            if let Item::MonWithConsumable { consumable, .. } = target_item {
                                match consumable {
                                    Consumable::Bomb => {
                                        events.push(Event::BombExplosion {
                                            at: target_location,
                                        });
                                    }
                                    Consumable::Potion | Consumable::BombOrPotion => return None,
                                }
                            }
                        }
                        Item::Mana { .. } | Item::Consumable { .. } => return None,
                    }
                }
            }
            _ => (),
        }

        Some((events, third_input_options))
    }

    fn process_third_input(
        &mut self,
        third_input: &NextInput,
        start_item: Item,
        _start_location: Location,
        target_location: Location,
    ) -> Option<(Vec<Event>, Vec<NextInput>)> {
        let cache_key = ThirdStageCacheKey {
            third_input: third_input.input,
            third_input_kind: third_input.kind,
            third_actor_mon_item: third_input.actor_mon_item,
            start_item,
            start_location: _start_location,
            target_location,
        };
        if let Some(cached) = self.process_input_cache.third_stage.get(&cache_key) {
            return cached.clone();
        }

        let computed = self.process_third_input_uncached(
            third_input,
            start_item,
            _start_location,
            target_location,
        );
        Self::bounded_cache_insert(
            &mut self.process_input_cache.third_stage,
            cache_key,
            computed.clone(),
            THIRD_STAGE_CACHE_CAPACITY,
        );
        computed
    }

    fn process_third_input_uncached(
        &mut self,
        third_input: &NextInput,
        start_item: Item,
        _start_location: Location,
        target_location: Location,
    ) -> Option<(Vec<Event>, Vec<NextInput>)> {
        let target_item = self.board.item(target_location);
        let mut forth_input_options = Vec::with_capacity(2);
        let mut events = Vec::with_capacity(6);

        match third_input.kind {
            NextInputKind::SpiritTargetMove => {
                if let Input::Location(destination_location) = third_input.input {
                    if let Some(target_item) = target_item {
                        let destination_item = self.board.item(destination_location);
                        let destination_square = self.board.square(destination_location);

                        events.push(Event::SpiritTargetMove {
                            item: *target_item,
                            from: target_location,
                            to: destination_location,
                            by: _start_location,
                        });

                        if let Some(destination_item) = destination_item {
                            match target_item {
                                Item::Mon {
                                    mon: travelling_mon,
                                } => match destination_item {
                                    Item::Mon { .. }
                                    | Item::MonWithMana { .. }
                                    | Item::MonWithConsumable { .. } => return None,
                                    Item::Mana {
                                        mana: destination_mana,
                                    } => {
                                        events.push(Event::PickupMana {
                                            mana: *destination_mana,
                                            by: *travelling_mon,
                                            at: destination_location,
                                        });
                                    }
                                    Item::Consumable {
                                        consumable: destination_consumable,
                                    } => match destination_consumable {
                                        Consumable::Potion | Consumable::Bomb => return None,
                                        Consumable::BombOrPotion => {
                                            forth_input_options.push(NextInput::new(
                                                Input::Modifier(Modifier::SelectBomb),
                                                NextInputKind::SelectConsumable,
                                                Some(*target_item),
                                            ));
                                            forth_input_options.push(NextInput::new(
                                                Input::Modifier(Modifier::SelectPotion),
                                                NextInputKind::SelectConsumable,
                                                Some(*target_item),
                                            ));
                                        }
                                    },
                                },
                                Item::Mana {
                                    mana: travelling_mana,
                                } => match destination_item {
                                    Item::Mana { .. }
                                    | Item::MonWithMana { .. }
                                    | Item::MonWithConsumable { .. }
                                    | Item::Consumable { .. } => return None,
                                    Item::Mon {
                                        mon: destination_mon,
                                    } => {
                                        events.push(Event::PickupMana {
                                            mana: *travelling_mana,
                                            by: *destination_mon,
                                            at: destination_location,
                                        });
                                    }
                                },
                                Item::MonWithMana { mon, mana } => match destination_item {
                                    Item::Mon { .. }
                                    | Item::MonWithMana { .. }
                                    | Item::MonWithConsumable { .. } => return None,
                                    Item::Mana {
                                        mana: destination_mana,
                                    } => {
                                        events.push(Event::ManaDropped {
                                            mana: *mana,
                                            at: target_location,
                                        });
                                        events.push(Event::PickupMana {
                                            mana: *destination_mana,
                                            by: *mon,
                                            at: destination_location,
                                        });
                                    }
                                    Item::Consumable {
                                        consumable: destination_consumable,
                                    } => match destination_consumable {
                                        Consumable::Potion | Consumable::Bomb => return None,
                                        Consumable::BombOrPotion => {
                                            events.push(Event::PickupPotion {
                                                by: *target_item,
                                                at: destination_location,
                                            });
                                        }
                                    },
                                },
                                Item::MonWithConsumable { .. } => match destination_item {
                                    Item::Mon { .. }
                                    | Item::Mana { .. }
                                    | Item::MonWithMana { .. }
                                    | Item::MonWithConsumable { .. } => return None,
                                    Item::Consumable {
                                        consumable: destination_consumable,
                                    } => match destination_consumable {
                                        Consumable::Potion | Consumable::Bomb => return None,
                                        Consumable::BombOrPotion => {
                                            events.push(Event::PickupPotion {
                                                by: *target_item,
                                                at: destination_location,
                                            });
                                        }
                                    },
                                },
                                Item::Consumable {
                                    consumable: travelling_consumable,
                                } => match destination_item {
                                    Item::Mana { .. } | Item::Consumable { .. } => return None,
                                    Item::Mon { .. } => {
                                        forth_input_options.push(NextInput::new(
                                            Input::Modifier(Modifier::SelectBomb),
                                            NextInputKind::SelectConsumable,
                                            Some(*destination_item),
                                        ));
                                        forth_input_options.push(NextInput::new(
                                            Input::Modifier(Modifier::SelectPotion),
                                            NextInputKind::SelectConsumable,
                                            Some(*destination_item),
                                        ));
                                    }
                                    Item::MonWithMana { .. } | Item::MonWithConsumable { .. } => {
                                        match travelling_consumable {
                                            Consumable::Potion | Consumable::Bomb => return None,
                                            Consumable::BombOrPotion => {
                                                events.push(Event::PickupPotion {
                                                    by: *destination_item,
                                                    at: destination_location,
                                                });
                                            }
                                        }
                                    }
                                },
                            }
                        }

                        if matches!(destination_square, Square::ManaPool { .. }) {
                            if let Some(mana) = target_item.mana() {
                                events.push(Event::ManaScored {
                                    mana: *mana,
                                    at: destination_location,
                                });
                            }
                        }
                    } else {
                        return None;
                    }
                } else {
                    return None;
                }
            }
            NextInputKind::DemonAdditionalStep => {
                if let Input::Location(destination_location) = third_input.input {
                    if let Some(demon) = start_item.mon() {
                        events.push(Event::DemonAdditionalStep {
                            demon: *demon,
                            from: target_location,
                            to: destination_location,
                        });

                        if let Some(Item::Consumable { consumable }) =
                            self.board.item(destination_location).copied()
                        {
                            match consumable {
                                Consumable::Potion | Consumable::Bomb => return None,
                                Consumable::BombOrPotion => {
                                    forth_input_options.push(NextInput::new(
                                        Input::Modifier(Modifier::SelectBomb),
                                        NextInputKind::SelectConsumable,
                                        Some(start_item),
                                    ));
                                    forth_input_options.push(NextInput::new(
                                        Input::Modifier(Modifier::SelectPotion),
                                        NextInputKind::SelectConsumable,
                                        Some(start_item),
                                    ));
                                }
                            }
                        }
                    } else {
                        return None;
                    }
                } else {
                    return None;
                }
            }
            NextInputKind::SelectConsumable => {
                if let Input::Modifier(modifier) = third_input.input {
                    if let Some(mon) = start_item.mon() {
                        match modifier {
                            Modifier::SelectBomb => {
                                events.push(Event::PickupBomb {
                                    by: *mon,
                                    at: target_location,
                                });
                            }
                            Modifier::SelectPotion => {
                                events.push(Event::PickupPotion {
                                    by: start_item,
                                    at: target_location,
                                });
                            }
                            Modifier::Cancel => return None,
                        }
                    } else {
                        return None;
                    }
                } else {
                    return None;
                }
            }
            _ => return None,
        }

        Some((events, forth_input_options))
    }

    // MARK: - apply events

    pub fn apply_and_add_resulting_events(&mut self, events: Vec<Event>) -> Vec<Event> {
        self.invalidate_process_input_cache();

        if self.track_takeback_history && self.takeback_fens.is_empty() {
            let initial_fen = self.fen();
            #[cfg(target_arch = "wasm32")]
            let tracked_initial_fen = initial_fen.clone();
            self.takeback_fens.push(initial_fen);
            #[cfg(target_arch = "wasm32")]
            if self.with_verbose_tracking && self.verbose_tracking_entities.is_empty() {
                self.verbose_tracking_entities.push(VerboseTrackingEntity {
                    fen: tracked_initial_fen,
                    color: self.active_color,
                    events: vec![],
                });
            }
        }

        let mut extra_events = Vec::new();
        for event in &events {
            match event {
                Event::MonMove { item, from, to } => {
                    self.mons_moves_count += 1;
                    self.board.remove_item(*from);
                    self.board.put(*item, *to);
                }
                Event::ManaMove { mana, from, to } => {
                    self.mana_moves_count += 1;
                    self.board.remove_item(*from);
                    self.board.put(Item::Mana { mana: *mana }, *to);
                }
                Event::ManaScored { mana, at } => {
                    let score = mana.score(self.active_color);
                    if self.active_color == Color::White {
                        self.white_score += score;
                    } else {
                        self.black_score += score;
                    }
                    if let Some(item) = self.board.item(*at) {
                        if let Some(mon) = item.mon() {
                            self.board.put(Item::Mon { mon: *mon }, *at);
                        } else {
                            self.board.remove_item(*at);
                        }
                    }
                }
                Event::MysticAction {
                    mystic: _,
                    from,
                    to,
                } => {
                    if self.actions_used_count >= Config::ACTIONS_PER_TURN {
                        if self.active_color == Color::White {
                            self.white_potions_count -= 1;
                        } else {
                            self.black_potions_count -= 1;
                        }
                        extra_events.push(Event::UsePotion {
                            from: *from,
                            to: *to,
                        });
                    } else {
                        self.actions_used_count += 1;
                    }
                    self.board.remove_item(*to);
                }
                Event::DemonAction { demon, from, to } => {
                    self.board.remove_item(*from);
                    let demon_additional_to = events.iter().find_map(|e| match e {
                        Event::DemonAdditionalStep { to, .. } => Some(*to),
                        _ => None,
                    });
                    if demon_additional_to.is_none() {
                        self.board.put(Item::Mon { mon: *demon }, *to);
                    } else {
                        self.board.remove_item(*to);
                    }

                    if self.actions_used_count >= Config::ACTIONS_PER_TURN {
                        if self.active_color == Color::White {
                            self.white_potions_count -= 1;
                        } else {
                            self.black_potions_count -= 1;
                        }
                        let use_potion_to = demon_additional_to.unwrap_or(*to);
                        extra_events.push(Event::UsePotion {
                            from: use_potion_to,
                            to: use_potion_to,
                        });
                    } else {
                        self.actions_used_count += 1;
                    }
                }
                Event::DemonAdditionalStep { demon, from: _, to } => {
                    self.board.put(Item::Mon { mon: *demon }, *to);
                }
                Event::SpiritTargetMove { item, from, to, by } => {
                    if self.actions_used_count >= Config::ACTIONS_PER_TURN {
                        if self.active_color == Color::White {
                            self.white_potions_count -= 1;
                        } else {
                            self.black_potions_count -= 1;
                        }
                        extra_events.push(Event::UsePotion { from: *by, to: *to });
                    } else {
                        self.actions_used_count += 1;
                    }
                    self.board.remove_item(*from);
                    self.board.put(*item, *to);
                }
                Event::PickupBomb { by, at } => {
                    self.board.put(
                        Item::MonWithConsumable {
                            mon: *by,
                            consumable: Consumable::Bomb,
                        },
                        *at,
                    );
                }
                Event::PickupPotion { by, at } => {
                    let mon_color = if let Some(mon) = by.mon() {
                        mon.color
                    } else {
                        continue;
                    };
                    if mon_color == Color::White {
                        self.white_potions_count += 1;
                    } else {
                        self.black_potions_count += 1;
                    }
                    self.board.put(*by, *at);
                }
                Event::PickupMana { mana, by, at } => {
                    self.board.put(
                        Item::MonWithMana {
                            mon: *by,
                            mana: *mana,
                        },
                        *at,
                    );
                }
                Event::MonFainted { mon, from: _, to } => {
                    let mut fainted_mon = *mon;
                    fainted_mon.faint();
                    self.board.put(Item::Mon { mon: fainted_mon }, *to);
                }
                Event::ManaDropped { mana, at } => {
                    self.board.put(Item::Mana { mana: *mana }, *at);
                }
                Event::SupermanaBackToBase { from: _, to } => {
                    if let Some(Item::Mon { mon }) = self.board.item(*to) {
                        self.board.put(
                            Item::MonWithMana {
                                mon: *mon,
                                mana: Mana::Supermana,
                            },
                            *to,
                        );
                    } else {
                        self.board.put(
                            Item::Mana {
                                mana: Mana::Supermana,
                            },
                            *to,
                        );
                    }
                }
                Event::BombAttack { by, from, to } => {
                    self.board.remove_item(*to);
                    self.board.put(Item::Mon { mon: *by }, *from);
                }
                Event::BombExplosion { at } => {
                    self.board.remove_item(*at);
                }
                Event::MonAwake { .. } | Event::GameOver { .. } | Event::NextTurn { .. } => {}
                Event::Takeback => {}
                Event::UsePotion { .. } => {}
            }
        }

        if let Some(winner) = self.winner_color() {
            extra_events.push(Event::GameOver { winner });
            if self.track_takeback_history {
                self.takeback_fens.clear();
            }
        } else if self.is_first_turn() && !self.player_can_move_mon()
            || !self.is_first_turn() && !self.player_can_move_mana()
            || !self.is_first_turn()
                && !self.player_can_move_mon()
                && self.board.find_mana(self.active_color).is_none()
        {
            self.active_color = self.active_color.other();
            self.turn_number += 1;
            self.reset_turn_state();
            extra_events.push(Event::NextTurn {
                color: self.active_color,
            });

            for mon_location in self.board.fainted_mons_locations(self.active_color) {
                if let Some(item) = self.board.item(mon_location) {
                    if let Some(mut mon) = item.mon().copied() {
                        mon.decrease_cooldown();
                        if !mon.is_fainted() {
                            extra_events.push(Event::MonAwake {
                                mon,
                                at: mon_location,
                            });
                        }
                        self.board.put(Item::Mon { mon }, mon_location);
                    }
                }
            }
            if self.track_takeback_history {
                self.takeback_fens = vec![self.fen()];
            }
        } else if self.track_takeback_history {
            self.takeback_fens.push(self.fen());
        }

        let updated_events: Vec<Event> = events.into_iter().chain(extra_events).collect();
        #[cfg(target_arch = "wasm32")]
        if self.with_verbose_tracking {
            let fen_now = self.fen();
            self.verbose_tracking_entities.push(VerboseTrackingEntity {
                fen: fen_now,
                color: self.active_color,
                events: updated_events.clone(),
            });
        }

        updated_events
    }

    fn reset_turn_state(&mut self) {
        self.actions_used_count = 0;
        self.mana_moves_count = 0;
        self.mons_moves_count = 0;
    }

    // MARK: - helpers
    #[inline]
    fn is_location_guarded_by_angel_location(
        angel_location: Option<Location>,
        location: Location,
    ) -> bool {
        angel_location.is_some_and(|angel| angel.distance(&location) == 1)
    }

    pub fn next_inputs_from_slice<F>(
        &self,
        locations: &[Location],
        kind: NextInputKind,
        only_one: bool,
        specific: Option<Location>,
        filter: F,
    ) -> Vec<NextInput>
    where
        F: Fn(Location) -> bool,
    {
        if let Some(specific_location) = specific {
            if locations.contains(&specific_location) && filter(specific_location) {
                vec![NextInput {
                    input: Input::Location(specific_location),
                    kind,
                    actor_mon_item: None,
                }]
            } else {
                vec![]
            }
        } else if only_one {
            if let Some(one) = locations.iter().copied().find(|&loc| filter(loc)) {
                vec![NextInput {
                    input: Input::Location(one),
                    kind,
                    actor_mon_item: None,
                }]
            } else {
                vec![]
            }
        } else {
            locations
                .iter()
                .copied()
                .filter_map(|loc| {
                    if filter(loc) {
                        Some(NextInput {
                            input: Input::Location(loc),
                            kind,
                            actor_mon_item: None,
                        })
                    } else {
                        None
                    }
                })
                .collect()
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub fn available_move_kinds(&self) -> HashMap<AvailableMoveKind, i32> {
        let mut moves = HashMap::new();
        moves.insert(
            AvailableMoveKind::MonMove,
            Config::MONS_MOVES_PER_TURN - self.mons_moves_count,
        );
        moves.insert(AvailableMoveKind::Action, 0);
        moves.insert(AvailableMoveKind::Potion, 0);
        moves.insert(AvailableMoveKind::ManaMove, 0);

        if self.turn_number == 1 {
            return moves;
        }

        moves.insert(
            AvailableMoveKind::Action,
            Config::ACTIONS_PER_TURN - self.actions_used_count,
        );
        moves.insert(AvailableMoveKind::Potion, self.player_potions_count());
        moves.insert(
            AvailableMoveKind::ManaMove,
            Config::MANA_MOVES_PER_TURN - self.mana_moves_count,
        );

        moves
    }

    pub fn winner_color(&self) -> Option<Color> {
        if self.white_score >= Config::TARGET_SCORE {
            Some(Color::White)
        } else if self.black_score >= Config::TARGET_SCORE {
            Some(Color::Black)
        } else {
            None
        }
    }

    #[cfg(any(target_arch = "wasm32", test))]
    pub fn is_later_than(&self, game: &MonsGame) -> bool {
        if self.variant() != game.variant() {
            false
        } else if self.turn_number > game.turn_number {
            true
        } else if self.turn_number == game.turn_number {
            self.player_potions_count() < game.player_potions_count()
                || self.actions_used_count > game.actions_used_count
                || self.mana_moves_count > game.mana_moves_count
                || self.mons_moves_count > game.mons_moves_count
                || self
                    .board
                    .fainted_mons_locations(self.active_color.other())
                    .len()
                    > game
                        .board
                        .fainted_mons_locations(game.active_color.other())
                        .len()
        } else {
            false
        }
    }

    pub fn is_first_turn(&self) -> bool {
        self.turn_number == 1
    }

    pub fn player_potions_count(&self) -> i32 {
        match self.active_color {
            Color::White => self.white_potions_count,
            Color::Black => self.black_potions_count,
        }
    }

    pub fn player_can_move_mon(&self) -> bool {
        self.mons_moves_count < Config::MONS_MOVES_PER_TURN
    }

    pub fn player_can_move_mana(&self) -> bool {
        !self.is_first_turn() && self.mana_moves_count < Config::MANA_MOVES_PER_TURN
    }

    pub fn player_can_use_action(&self) -> bool {
        !self.is_first_turn()
            && (self.player_potions_count() > 0
                || self.actions_used_count < Config::ACTIONS_PER_TURN)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn assert_regular_api_matches_default_start_options(
        game: &MonsGame,
        input: Vec<Input>,
        do_not_apply_events: bool,
        one_option_enough: bool,
    ) -> Output {
        let mut regular = game.clone_for_simulation();
        let mut none_options = game.clone_for_simulation();
        let mut default_options = game.clone_for_simulation();

        let regular_output =
            regular.process_input(input.clone(), do_not_apply_events, one_option_enough);
        let none_output = none_options.process_input_with_start_options(
            input.clone(),
            do_not_apply_events,
            one_option_enough,
            None,
        );
        let default_output = default_options.process_input_with_start_options(
            input,
            do_not_apply_events,
            one_option_enough,
            Some(SuggestedStartInputOptions::default()),
        );

        assert_eq!(regular_output, none_output);
        assert_eq!(regular_output, default_output);
        assert_eq!(regular.fen(), none_options.fen());
        assert_eq!(regular.fen(), default_options.fen());
        assert_eq!(regular.takeback_fens, none_options.takeback_fens);
        assert_eq!(regular.takeback_fens, default_options.takeback_fens);
        assert_eq!(
            regular.verbose_tracking_entities.len(),
            none_options.verbose_tracking_entities.len()
        );
        assert_eq!(
            regular.verbose_tracking_entities.len(),
            default_options.verbose_tracking_entities.len()
        );

        regular_output
    }

    fn first_chain_from_state(game: &MonsGame) -> Option<Vec<Input>> {
        let starts =
            match assert_regular_api_matches_default_start_options(game, vec![], true, false) {
                Output::LocationsToStartFrom(starts) => starts,
                _ => return None,
            };
        let start = *starts.first()?;
        let prefix = vec![Input::Location(start)];
        let second_options = match assert_regular_api_matches_default_start_options(
            game,
            prefix.clone(),
            true,
            false,
        ) {
            Output::NextInputOptions(options) => options,
            _ => return None,
        };
        let second = second_options.first()?.input;
        let pair = vec![Input::Location(start), second];
        let result =
            assert_regular_api_matches_default_start_options(game, pair.clone(), true, false);
        match result {
            Output::Events(_) => Some(pair),
            Output::NextInputOptions(third_options) => third_options
                .first()
                .map(|third| vec![Input::Location(start), second, third.input]),
            _ => None,
        }
    }

    fn potion_action_only_turn_game() -> MonsGame {
        let mut game = MonsGame::new(false, GameVariant::Classic);
        game.replace_board_items([
            (
                Location::new(9, 6),
                Item::Mon {
                    mon: Mon::new(MonKind::Spirit, Color::White, 0),
                },
            ),
            (
                Location::new(7, 6),
                Item::Mana {
                    mana: Mana::Regular(Color::White),
                },
            ),
            (
                Location::new(6, 5),
                Item::Mana {
                    mana: Mana::Regular(Color::White),
                },
            ),
            (
                Location::new(0, 5),
                Item::Mon {
                    mon: Mon::new(MonKind::Drainer, Color::Black, 0),
                },
            ),
        ]);
        game.actions_used_count = Config::ACTIONS_PER_TURN;
        game.mons_moves_count = Config::MONS_MOVES_PER_TURN;
        game.white_potions_count = 1;
        game.turn_number = 2;
        game
    }

    #[test]
    fn default_suggestions_keep_player_facing_potion_prompt_priority() {
        let mut game = potion_action_only_turn_game();
        let output = game.process_input(vec![], true, false);
        let locations = match output {
            Output::LocationsToStartFrom(locations) => locations,
            _ => panic!("expected locations to start from"),
        };

        assert!(!locations.is_empty());
        assert!(locations.iter().any(|location| {
            matches!(
                game.board.item(*location),
                Some(Item::Mon { .. })
                    | Some(Item::MonWithMana { .. })
                    | Some(Item::MonWithConsumable { .. })
            )
        }));
        assert!(locations
            .iter()
            .all(|location| { !matches!(game.board.item(*location), Some(Item::Mana { .. })) }));
    }

    #[test]
    fn regular_player_api_matches_default_start_options_across_states() {
        let mut states = vec![
            MonsGame::new(false, GameVariant::Classic),
            potion_action_only_turn_game(),
        ];
        let mut progressed = MonsGame::new(false, GameVariant::Classic);

        for _ in 0..6 {
            states.push(progressed.clone_for_simulation());
            let Some(chain) = first_chain_from_state(&progressed) else {
                break;
            };
            let output = progressed.process_input(chain, false, false);
            if !matches!(output, Output::Events(_)) || progressed.winner_color().is_some() {
                break;
            }
        }

        for game in states {
            let start_output =
                assert_regular_api_matches_default_start_options(&game, vec![], true, false);
            let starts = match start_output {
                Output::LocationsToStartFrom(starts) => starts,
                _ => continue,
            };
            let Some(start) = starts.first().copied() else {
                continue;
            };
            let first_input = vec![Input::Location(start)];
            let second_output = assert_regular_api_matches_default_start_options(
                &game,
                first_input.clone(),
                true,
                false,
            );
            let second_options = match second_output {
                Output::NextInputOptions(options) => options,
                _ => continue,
            };
            let Some(second) = second_options.first().map(|option| option.input) else {
                continue;
            };
            let second_input = vec![Input::Location(start), second];
            let third_output = assert_regular_api_matches_default_start_options(
                &game,
                second_input.clone(),
                true,
                false,
            );
            if let Output::NextInputOptions(third_options) = third_output {
                if let Some(third) = third_options.first().map(|option| option.input) {
                    let full_input = vec![Input::Location(start), second, third];
                    let _ = assert_regular_api_matches_default_start_options(
                        &game, full_input, false, false,
                    );
                }
            }
        }
    }

    #[test]
    fn process_input_cache_matches_cold_recomputation() {
        let game = MonsGame::new(false, GameVariant::Classic);
        let chain = first_chain_from_state(&game).expect("expected at least one legal input chain");

        let mut queries = vec![Vec::<Input>::new()];
        let mut prefix = Vec::<Input>::new();
        for input in chain {
            prefix.push(input);
            queries.push(prefix.clone());
        }

        let mut warm = game.clone_for_simulation();
        let mut cold = game.clone_for_simulation();
        for query in queries {
            let warm_output = warm.process_input(query.clone(), true, false);
            cold.invalidate_process_input_cache();
            let cold_output = cold.process_input(query, true, false);
            assert_eq!(warm_output, cold_output);
            assert_eq!(warm.fen(), cold.fen());
        }
    }

    #[test]
    fn process_input_bomb_explosion_removes_carrier_and_faints_target() {
        let mystic_location = Location::new(4, 4);
        let target_location = Location::new(6, 6);
        let mystic = Mon::new(MonKind::Mystic, Color::White, 0);
        let target = Mon::new(MonKind::Demon, Color::Black, 0);
        let mut game = MonsGame::new(false, GameVariant::Classic);
        game.replace_board_items([
            (mystic_location, Item::Mon { mon: mystic }),
            (
                target_location,
                Item::MonWithConsumable {
                    mon: target,
                    consumable: Consumable::Bomb,
                },
            ),
        ]);
        game.turn_number = 2;

        let output = game.process_input(
            vec![
                Input::Location(mystic_location),
                Input::Location(target_location),
            ],
            false,
            false,
        );
        let events = match output {
            Output::Events(events) => events,
            other => panic!("expected resolved mystic action, got {other:?}"),
        };

        assert!(events.contains(&Event::BombExplosion {
            at: target_location
        }));
        assert_eq!(game.board.item(target_location), None);
        assert_eq!(
            game.board.item(mystic_location),
            Some(&Item::Mon { mon: mystic })
        );
        assert_eq!(
            game.board.item(game.board.base(target)),
            Some(&Item::Mon {
                mon: Mon::new(MonKind::Demon, Color::Black, 2),
            })
        );
        assert_eq!(game.actions_used_count, 1);
    }

    #[test]
    fn process_input_takeback_restores_previous_state_and_emits_event() {
        let source = Location::new(5, 3);
        let destination = Location::new(5, 4);
        let mon = Mon::new(MonKind::Drainer, Color::White, 0);
        let mut game = MonsGame::new(false, GameVariant::Classic);
        game.replace_board_items([(source, Item::Mon { mon })]);
        game.turn_number = 2;
        let before = game.fen();

        let move_output = game.process_input(
            vec![Input::Location(source), Input::Location(destination)],
            false,
            false,
        );
        assert!(matches!(move_output, Output::Events(_)));
        assert_ne!(game.fen(), before);
        assert_eq!(game.takeback_fens.len(), 2);

        assert_eq!(
            game.process_input(vec![Input::Takeback], false, false),
            Output::Events(vec![Event::Takeback])
        );
        assert_eq!(game.fen(), before);
        assert_eq!(game.board.item(source), Some(&Item::Mon { mon }));
        assert_eq!(game.board.item(destination), None);
        assert_eq!(game.takeback_fens, vec![before]);
    }

    #[test]
    fn process_input_cancel_rejects_consumable_choice_without_mutating_state() {
        let source = Location::new(5, 3);
        let destination = Location::new(5, 4);
        let mon = Mon::new(MonKind::Drainer, Color::White, 0);
        let mut game = MonsGame::new(false, GameVariant::Classic);
        game.replace_board_items([
            (source, Item::Mon { mon }),
            (
                destination,
                Item::Consumable {
                    consumable: Consumable::BombOrPotion,
                },
            ),
        ]);
        game.turn_number = 2;
        let before = game.fen();

        let prompt = game.process_input(
            vec![Input::Location(source), Input::Location(destination)],
            false,
            false,
        );
        assert!(matches!(
            prompt,
            Output::NextInputOptions(ref options)
                if options.iter().any(|option| {
                    option.input == Input::Modifier(Modifier::SelectBomb)
                }) && options.iter().any(|option| {
                    option.input == Input::Modifier(Modifier::SelectPotion)
                })
        ));
        assert_eq!(game.fen(), before);

        assert_eq!(
            game.process_input(
                vec![
                    Input::Location(source),
                    Input::Location(destination),
                    Input::Modifier(Modifier::Cancel),
                ],
                false,
                false,
            ),
            Output::InvalidInput
        );
        assert_eq!(game.fen(), before);
        assert!(game.takeback_fens.is_empty());
    }

    #[test]
    fn is_later_than_rejects_cross_variant_games() {
        let mut classic = MonsGame::new(false, GameVariant::Classic);
        classic.turn_number = 3;
        classic.actions_used_count = 1;

        let mut swapped = MonsGame::new(false, GameVariant::SwappedManaRows);
        swapped.turn_number = 1;

        assert!(!classic.is_later_than(&swapped));
        assert!(!swapped.is_later_than(&classic));
    }
}
