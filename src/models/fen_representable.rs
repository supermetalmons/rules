use crate::*;

pub(crate) trait FenRepresentable {
    fn fen(&self) -> String;
}

impl FenRepresentable for MonsGame {
    fn fen(&self) -> String {
        let mut fields = vec![
            self.white_score.to_string(),
            self.black_score.to_string(),
            self.active_color.fen(),
            self.actions_used_count.to_string(),
            self.mana_moves_count.to_string(),
            self.mons_moves_count.to_string(),
            self.white_potions_count.to_string(),
            self.black_potions_count.to_string(),
            self.turn_number.to_string(),
            self.board.fen(),
        ];
        if self.variant() != GameVariant::DEFAULT {
            fields.push(self.variant().id().to_string());
        }
        fields.join(" ")
    }
}

impl MonsGame {
    pub fn from_fen(fen: &str, with_verbose_tracking: bool) -> Option<Self> {
        let fields: Vec<&str> = fen.split_whitespace().collect();
        let variant = match fields.len() {
            10 => GameVariant::DEFAULT,
            11 => GameVariant::from_fen(fields[10])?,
            _ => return None,
        };
        let mut game = Self::new(with_verbose_tracking, variant);
        game.board = Board::from_fen(fields[9], variant)?;
        game.white_score = fields[0].parse().ok()?;
        game.black_score = fields[1].parse().ok()?;
        game.active_color = Color::from_fen(fields[2])?;
        game.actions_used_count = fields[3].parse().ok()?;
        game.mana_moves_count = fields[4].parse().ok()?;
        game.mons_moves_count = fields[5].parse().ok()?;
        game.white_potions_count = fields[6].parse().ok()?;
        game.black_potions_count = fields[7].parse().ok()?;
        game.turn_number = fields[8].parse().ok()?;
        game.takeback_fens.clear();
        game.is_moves_verified = false;
        #[cfg(any(target_arch = "wasm32", test))]
        game.verbose_tracking_entities.clear();
        game.invalidate_process_input_cache();
        Some(game)
    }
}

impl FenRepresentable for Item {
    fn fen(&self) -> String {
        match self {
            Item::Mon { mon } => format!("{}x", mon.fen()),
            Item::Mana { mana } => format!("xx{}", mana.fen()),
            Item::MonWithMana { mon, mana } => format!("{}{}", mon.fen(), mana.fen()),
            Item::MonWithConsumable { mon, consumable } => {
                format!("{}{}", mon.fen(), consumable.fen())
            }
            Item::Consumable { consumable } => format!("xx{}", consumable.fen()),
        }
    }
}

impl Item {
    fn from_fen(fen: &str) -> Option<Self> {
        if fen.len() != 3 {
            return None;
        }

        let mon_fen = &fen[0..2];
        let item_fen = &fen[2..];

        match mon_fen {
            "xx" => match Mana::from_fen(item_fen) {
                Some(mana) => Some(Item::Mana { mana }),
                None => {
                    Consumable::from_fen(item_fen).map(|consumable| Item::Consumable { consumable })
                }
            },
            _ => {
                let mon = Mon::from_fen(mon_fen)?;
                if let Some(mana) = Mana::from_fen(item_fen) {
                    Some(Item::MonWithMana { mon, mana })
                } else if let Some(consumable) = Consumable::from_fen(item_fen) {
                    Some(Item::MonWithConsumable { mon, consumable })
                } else {
                    Some(Item::Mon { mon })
                }
            }
        }
    }
}

impl FenRepresentable for Board {
    fn fen(&self) -> String {
        let mut result = String::with_capacity(200);
        for i in 0..Config::BOARD_SIZE {
            if i > 0 {
                result.push('/');
            }
            let mut empty_space_count = 0u32;
            for j in 0..Config::BOARD_SIZE {
                let idx = (i * 11 + j) as usize;
                match &self.items[idx] {
                    Some(item) => {
                        if empty_space_count > 0 {
                            use std::fmt::Write;
                            let _ = write!(result, "n{:02}", empty_space_count);
                            empty_space_count = 0;
                        }
                        result.push_str(&item.fen());
                    }
                    None => {
                        empty_space_count += 1;
                    }
                }
            }
            if empty_space_count > 0 {
                use std::fmt::Write;
                let _ = write!(result, "n{:02}", empty_space_count);
            }
        }
        result
    }
}

impl Board {
    pub fn from_fen(fen: &str, variant: GameVariant) -> Option<Self> {
        let lines: Vec<&str> = fen.split('/').collect();
        if lines.len() != Config::BOARD_SIZE as usize {
            return None;
        }
        let mut items = [None; crate::models::location::BOARD_CELLS];
        for (i, line) in lines.iter().enumerate() {
            let mut j = 0;
            let mut chars = line.chars().peekable();

            while let Some(ch) = chars.peek() {
                match ch {
                    'n' => {
                        chars.next();
                        let num_chars: String = chars.by_ref().take(2).collect();
                        if let Ok(num) = num_chars.parse::<usize>() {
                            j += num;
                        }
                    }
                    _ => {
                        let item_fen: String = chars.by_ref().take(3).collect();
                        if let Some(item) = Item::from_fen(&item_fen) {
                            items[i * 11 + j] = Some(item);
                        }
                        j += 1;
                    }
                }
            }
        }
        Some(Self::from_items_array(items, variant))
    }
}

impl FenRepresentable for Mon {
    fn fen(&self) -> String {
        let kind_char = match self.kind {
            MonKind::Demon => 'e',
            MonKind::Drainer => 'd',
            MonKind::Angel => 'a',
            MonKind::Spirit => 's',
            MonKind::Mystic => 'y',
        };
        let kind_char = if self.color == Color::White {
            kind_char.to_uppercase().to_string()
        } else {
            kind_char.to_string()
        };
        format!("{}{}", kind_char, self.cooldown % 10)
    }
}

impl Mon {
    fn from_fen(fen: &str) -> Option<Self> {
        if fen.len() != 2 {
            return None;
        }
        let chars: Vec<char> = fen.chars().collect();
        let kind = match chars[0].to_ascii_lowercase() {
            'e' => MonKind::Demon,
            'd' => MonKind::Drainer,
            'a' => MonKind::Angel,
            's' => MonKind::Spirit,
            'y' => MonKind::Mystic,
            _ => return None,
        };
        let color = if chars[0].is_uppercase() {
            Color::White
        } else {
            Color::Black
        };
        let cooldown = chars[1].to_digit(10)?;
        Some(Mon {
            kind,
            color,
            cooldown: cooldown as i32,
        })
    }
}

impl FenRepresentable for Mana {
    fn fen(&self) -> String {
        match *self {
            Mana::Regular(Color::White) => "M".to_string(),
            Mana::Regular(Color::Black) => "m".to_string(),
            Mana::Supermana => "U".to_string(),
        }
    }
}

impl Mana {
    fn from_fen(fen: &str) -> Option<Self> {
        match fen {
            "U" => Some(Mana::Supermana),
            "M" => Some(Mana::Regular(Color::White)),
            "m" => Some(Mana::Regular(Color::Black)),
            _ => None,
        }
    }
}

impl FenRepresentable for Color {
    fn fen(&self) -> String {
        match self {
            Color::White => "w".to_string(),
            Color::Black => "b".to_string(),
        }
    }
}

impl Color {
    fn from_fen(fen: &str) -> Option<Self> {
        match fen {
            "w" => Some(Color::White),
            "b" => Some(Color::Black),
            _ => None,
        }
    }
}

impl FenRepresentable for Consumable {
    fn fen(&self) -> String {
        match self {
            Consumable::Potion => "P".to_string(),
            Consumable::Bomb => "B".to_string(),
            Consumable::BombOrPotion => "Q".to_string(),
        }
    }
}

impl Consumable {
    fn from_fen(fen: &str) -> Option<Self> {
        match fen {
            "P" => Some(Consumable::Potion),
            "B" => Some(Consumable::Bomb),
            "Q" => Some(Consumable::BombOrPotion),
            _ => None,
        }
    }
}

impl FenRepresentable for Event {
    fn fen(&self) -> String {
        match self {
            Event::MonMove { item, from, to } => {
                format!("mm {} {} {}", item.fen(), from.fen(), to.fen())
            }
            Event::ManaMove { mana, from, to } => {
                format!("mma {} {} {}", mana.fen(), from.fen(), to.fen())
            }
            Event::ManaScored { mana, at } => format!("ms {} {}", mana.fen(), at.fen()),
            Event::MysticAction { mystic, from, to } => {
                format!("ma {} {} {}", mystic.fen(), from.fen(), to.fen())
            }
            Event::DemonAction { demon, from, to } => {
                format!("da {} {} {}", demon.fen(), from.fen(), to.fen())
            }
            Event::DemonAdditionalStep { demon, from, to } => {
                format!("das {} {} {}", demon.fen(), from.fen(), to.fen())
            }
            Event::SpiritTargetMove { item, from, to, by } => format!(
                "stm {} {} {} {}",
                item.fen(),
                from.fen(),
                to.fen(),
                by.fen()
            ),
            Event::PickupBomb { by, at } => format!("pb {} {}", by.fen(), at.fen()),
            Event::PickupPotion { by, at } => format!("pp {} {}", by.fen(), at.fen()),
            Event::PickupMana { mana, by, at } => {
                format!("pm {} {} {}", mana.fen(), by.fen(), at.fen())
            }
            Event::MonFainted { mon, from, to } => {
                format!("mf {} {} {}", mon.fen(), from.fen(), to.fen())
            }
            Event::ManaDropped { mana, at } => format!("md {} {}", mana.fen(), at.fen()),
            Event::SupermanaBackToBase { from, to } => format!("sb {} {}", from.fen(), to.fen()),
            Event::BombAttack { by, from, to } => {
                format!("ba {} {} {}", by.fen(), from.fen(), to.fen())
            }
            Event::MonAwake { mon, at } => format!("maw {} {}", mon.fen(), at.fen()),
            Event::BombExplosion { at } => format!("be {}", at.fen()),
            Event::NextTurn { color } => format!("nt {}", color.fen()),
            Event::GameOver { winner } => format!("go {}", winner.fen()),
            Event::Takeback => "z".to_string(),
            Event::UsePotion { from, to } => format!("up {} {}", from.fen(), to.fen()),
        }
    }
}

impl FenRepresentable for NextInput {
    fn fen(&self) -> String {
        format!(
            "{} {} {}",
            self.input.fen(),
            self.kind.fen(),
            self.actor_mon_item
                .as_ref()
                .map_or("o".to_string(), |item| item.fen())
        )
    }
}

impl FenRepresentable for NextInputKind {
    fn fen(&self) -> String {
        match self {
            NextInputKind::MonMove => "mm".to_string(),
            NextInputKind::ManaMove => "mma".to_string(),
            NextInputKind::MysticAction => "ma".to_string(),
            NextInputKind::DemonAction => "da".to_string(),
            NextInputKind::DemonAdditionalStep => "das".to_string(),
            NextInputKind::SpiritTargetCapture => "stc".to_string(),
            NextInputKind::SpiritTargetMove => "stm".to_string(),
            NextInputKind::SelectConsumable => "sc".to_string(),
            NextInputKind::BombAttack => "ba".to_string(),
        }
    }
}

impl FenRepresentable for Location {
    fn fen(&self) -> String {
        format!("{},{}", self.i, self.j)
    }
}

impl Location {
    fn from_fen(fen: &str) -> Option<Self> {
        let parts: Vec<&str> = fen.split(',').collect();
        if parts.len() != 2 {
            return None;
        }
        let i = parts[0].parse().ok()?;
        let j = parts[1].parse().ok()?;
        Some(Self { i, j })
    }
}

impl FenRepresentable for Modifier {
    fn fen(&self) -> String {
        match self {
            Modifier::SelectPotion => "p",
            Modifier::SelectBomb => "b",
            Modifier::Cancel => "c",
        }
        .to_string()
    }
}

impl Modifier {
    fn from_fen(fen: &str) -> Option<Self> {
        match fen {
            "p" => Some(Modifier::SelectPotion),
            "b" => Some(Modifier::SelectBomb),
            "c" => Some(Modifier::Cancel),
            _ => None,
        }
    }
}

impl FenRepresentable for Input {
    fn fen(&self) -> String {
        match self {
            Input::Location(location) => format!("l{}", location.fen()),
            Input::Modifier(modifier) => format!("m{}", modifier.fen()),
            Input::Takeback => "z".to_string(),
        }
    }
}

impl Input {
    #[cfg(any(target_arch = "wasm32", test))]
    pub fn fen_from_array(inputs: &[Input]) -> String {
        inputs
            .iter()
            .map(|input| input.fen())
            .collect::<Vec<_>>()
            .join(";")
    }

    pub fn from_fen(fen: &str) -> Option<Self> {
        fen.chars().next().and_then(|prefix| match prefix {
            'l' => Location::from_fen(&fen[1..]).map(Input::Location),
            'm' => Modifier::from_fen(&fen[1..]).map(Input::Modifier),
            'z' => Some(Input::Takeback),
            _ => None,
        })
    }

    pub fn array_from_fen(fen: &str) -> Vec<Self> {
        if fen.is_empty() {
            vec![]
        } else {
            fen.split(';').filter_map(Input::from_fen).collect()
        }
    }
}

impl FenRepresentable for Output {
    fn fen(&self) -> String {
        match self {
            Output::InvalidInput => "i".to_string(),
            Output::LocationsToStartFrom(locations) => {
                let mut sorted_locations: Vec<_> =
                    locations.iter().map(|location| location.fen()).collect();
                sorted_locations.sort();
                "l".to_owned() + &sorted_locations.join("/")
            }
            Output::NextInputOptions(next_inputs) => {
                let mut sorted_next_inputs: Vec<_> = next_inputs
                    .iter()
                    .map(|next_input| next_input.fen())
                    .collect();
                sorted_next_inputs.sort();
                "n".to_owned() + &sorted_next_inputs.join("/")
            }
            Output::Events(events) => {
                let mut sorted_events: Vec<_> = events.iter().map(|event| event.fen()).collect();
                sorted_events.sort();
                "e".to_owned() + &sorted_events.join("/")
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LEGACY_CLASSIC_INITIAL_FEN: &str =
        "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03";

    #[test]
    fn legacy_game_fen_without_variant_defaults_to_classic() {
        let game = MonsGame::from_fen(LEGACY_CLASSIC_INITIAL_FEN, false)
            .expect("legacy classic FEN should stay supported");
        assert_eq!(game.variant(), GameVariant::Classic);
        assert_eq!(game.fen(), LEGACY_CLASSIC_INITIAL_FEN);
    }

    #[test]
    fn classic_game_fen_round_trips_without_variant_field() {
        let game = MonsGame::new(false, GameVariant::Classic);
        let fen = game.fen();
        assert_eq!(fen, LEGACY_CLASSIC_INITIAL_FEN);
        let roundtrip =
            MonsGame::from_fen(fen.as_str(), false).expect("classic game FEN should round-trip");
        assert_eq!(roundtrip.variant(), GameVariant::Classic);
        assert_eq!(roundtrip.fen(), fen);
    }

    #[test]
    fn classic_game_fen_accepts_explicit_variant_field_and_normalizes() {
        let fen = format!("{LEGACY_CLASSIC_INITIAL_FEN} 0");
        let roundtrip = MonsGame::from_fen(fen.as_str(), false)
            .expect("classic game FEN with explicit variant should round-trip");
        assert_eq!(roundtrip.variant(), GameVariant::Classic);
        assert_eq!(roundtrip.fen(), LEGACY_CLASSIC_INITIAL_FEN);
    }

    #[test]
    fn non_classic_variant_game_fens_round_trip() {
        let cases = [
            (GameVariant::SwappedManaRows, 1, Location::new(3, 3)),
            (GameVariant::OffsetArcManaRows, 2, Location::new(4, 2)),
            (GameVariant::CenterSpokeManaRows, 3, Location::new(3, 5)),
            (GameVariant::AlternatingManaRows, 4, Location::new(4, 1)),
            (GameVariant::InnerWedgeManaRows, 5, Location::new(4, 5)),
            (GameVariant::OuterWedgeManaRows, 6, Location::new(3, 5)),
            (GameVariant::BentCenterManaRows, 7, Location::new(3, 5)),
            (GameVariant::OuterEdgeManaRows, 8, Location::new(4, 0)),
            (GameVariant::SplitFlankManaRows, 9, Location::new(4, 2)),
            (GameVariant::ForwardBridgeManaRows, 10, Location::new(5, 4)),
            (GameVariant::CornerChainManaRows, 11, Location::new(3, 5)),
        ];

        for (variant, id, mana_location) in cases {
            let game = MonsGame::new(false, variant);
            let fen = game.fen();
            assert!(
                fen.ends_with(format!(" {id}").as_str()),
                "{variant:?} FEN should include its explicit variant id"
            );
            let roundtrip = MonsGame::from_fen(fen.as_str(), false)
                .expect("non-classic game FEN should round-trip");
            assert_eq!(roundtrip.variant(), variant);
            assert_eq!(roundtrip.fen(), fen);
            assert_eq!(
                roundtrip.board.square(mana_location),
                Square::ManaBase {
                    color: Color::Black,
                }
            );
            assert_eq!(
                roundtrip.board.item(mana_location).copied(),
                Some(Item::Mana {
                    mana: Mana::Regular(Color::Black),
                })
            );
        }
    }

    #[test]
    fn game_fen_rejects_unknown_variant_ids() {
        let fen = format!("{LEGACY_CLASSIC_INITIAL_FEN} 99");
        assert!(MonsGame::from_fen(fen.as_str(), false).is_none());
    }
}
