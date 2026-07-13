pub mod models;
pub use models::*;

#[wasm_bindgen]
pub fn winner(
    fen_w: &str,
    fen_b: &str,
    flat_moves_string_w: &str,
    flat_moves_string_b: &str,
) -> String {
    let moves_w: Vec<&str> = flat_moves_string_w.split("-").collect();
    let moves_b: Vec<&str> = flat_moves_string_b.split("-").collect();

    let game_w = MonsGame::from_fen(fen_w, false);
    let game_b = MonsGame::from_fen(fen_b, false);

    if game_w.is_none() || game_b.is_none() {
        if game_w.is_none() && game_b.is_none() {
            return "x".to_string();
        } else if game_w.is_none() {
            return Color::Black.fen();
        } else {
            return Color::White.fen();
        }
    }

    let game_w = game_w.unwrap();
    let game_b = game_b.unwrap();
    if game_w.variant() != game_b.variant() {
        return "x".to_string();
    }

    let normalized_fen_w = game_w.fen();
    let normalized_fen_b = game_b.fen();
    let winner_color_game_w = game_w.winner_color();
    let winner_color_game_b = game_b.winner_color();

    if winner_color_game_w.is_none() && winner_color_game_b.is_none() {
        return "".to_string();
    }

    let mut game = MonsGame::new(false, game_w.variant());

    let mut w_index = 0;
    let mut b_index = 0;

    while w_index < moves_w.len() || b_index < moves_b.len() {
        if game.active_color == Color::White {
            if w_index >= moves_w.len() {
                return "x".to_string();
            }
            let inputs = Input::array_from_fen(moves_w[w_index]);
            _ = game.process_input(inputs, false, false);
            w_index += 1;
        } else {
            if b_index >= moves_b.len() {
                return "x".to_string();
            }
            let inputs = Input::array_from_fen(moves_b[b_index]);
            _ = game.process_input(inputs, false, false);
            b_index += 1;
        }

        if let Some(winner) = game.winner_color() {
            if winner == Color::White {
                if w_index == moves_w.len() && normalized_fen_w == game.fen() {
                    return winner.fen();
                } else {
                    return "x".to_string();
                }
            } else {
                if b_index == moves_b.len() && normalized_fen_b == game.fen() {
                    return winner.fen();
                } else {
                    return "x".to_string();
                }
            }
        }
    }

    // TODO: "x" stands for corrupted game data. see if there was cheating.
    "x".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::io::{self};

    #[test]
    fn automove_till_end() -> io::Result<()> {
        let mut game = MonsGameModel::new(GameVariant::Classic);
        loop {
            _ = game.automove();
            if let Some(winner) = game.winner_color() {
                println!("Winner: {:?}", winner);
                break;
            }
        }
        Ok(())
    }

    #[test]
    fn automove() -> io::Result<()> {
        let mut game = MonsGameModel::new(GameVariant::Classic);
        let output = game.automove();
        println!("{:?}", game.fen());
        match output.kind {
            OutputModelKind::Events => (),
            _ => panic!("Expected Events"),
        }
        Ok(())
    }

    #[test]
    fn check_initial_fen() -> io::Result<()> {
        let game = MonsGame::new(false, GameVariant::Classic);
        let fen = game.fen();
        assert!(
            fen == "0 0 w 0 0 0 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/n03E0xA0xD0xS0xY0xn03"
        );
        Ok(())
    }

    #[test]
    fn simulation_clone_discards_tracking_buffers() -> io::Result<()> {
        let mut game = MonsGame::new(true, GameVariant::Classic);
        game.takeback_fens = vec!["f0".to_string(), "f1".to_string()];
        game.verbose_tracking_entities = vec![VerboseTrackingEntity {
            fen: game.fen(),
            color: Color::White,
            events: vec![Event::Takeback],
        }];

        let simulation_game = game.clone_for_simulation();
        assert!(simulation_game.takeback_fens.is_empty());
        assert!(simulation_game.verbose_tracking_entities.is_empty());
        assert!(!simulation_game.with_verbose_tracking);
        Ok(())
    }

    #[test]
    fn clear_tracking_releases_history_buffers() -> io::Result<()> {
        let mut game = MonsGame::new(true, GameVariant::Classic);
        for i in 0..128 {
            let fen = format!("fen-{i}");
            game.takeback_fens.push(fen.clone());
            game.verbose_tracking_entities.push(VerboseTrackingEntity {
                fen,
                color: Color::White,
                events: vec![Event::Takeback],
            });
        }

        let takeback_capacity_before = game.takeback_fens.capacity();
        let verbose_capacity_before = game.verbose_tracking_entities.capacity();
        game.clear_tracking();

        assert!(game.takeback_fens.is_empty());
        assert!(game.verbose_tracking_entities.is_empty());
        assert!(game.takeback_fens.capacity() <= takeback_capacity_before);
        assert!(game.verbose_tracking_entities.capacity() <= verbose_capacity_before);
        Ok(())
    }

    #[test]
    fn simulation_model_avoids_verbose_tracking_growth() -> io::Result<()> {
        let mut game = MonsGameModel::new_for_simulation(GameVariant::Classic);
        let output = game.automove();
        assert_eq!(output.kind, OutputModelKind::Events);
        assert!(game.verbose_tracking_entities().is_empty());
        assert!(game.takeback_fens().is_empty());
        Ok(())
    }

    #[test]
    fn tracked_and_simulation_modes_stay_in_sync_when_replaying_inputs() -> io::Result<()> {
        let mut tracked = MonsGameModel::new(GameVariant::Classic);
        let mut simulation = MonsGameModel::new_for_simulation(GameVariant::Classic);

        for _ in 0..512 {
            let tracked_output = tracked.automove();
            assert_eq!(tracked_output.kind, OutputModelKind::Events);

            let input_fen = tracked_output.input_fen();
            let simulation_output = simulation.process_input_fen(input_fen.as_str());
            assert_eq!(simulation_output.kind, OutputModelKind::Events);

            assert_eq!(tracked.fen(), simulation.fen());
            assert_eq!(tracked.active_color(), simulation.active_color());
            assert_eq!(tracked.turn_number(), simulation.turn_number());

            if tracked.winner_color().is_some() {
                break;
            }
        }

        assert_eq!(tracked.winner_color(), simulation.winner_color());
        Ok(())
    }

    #[test]
    fn model_is_later_than_rejects_cross_variant_fens() -> io::Result<()> {
        let model = MonsGameModel::new(GameVariant::Classic);
        let other = MonsGame::new(false, GameVariant::SwappedManaRows);
        assert!(!model.is_later_than(other.fen().as_str()));
        Ok(())
    }
}
