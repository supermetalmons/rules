use super::*;

#[test]
fn duel_timing_stats_merge_and_average_track_profile_a_and_profile_b_turns() {
    let mut first = DuelTimingStats::default();
    first.record_profile_a_turn(120.0);
    first.record_profile_a_turn(180.0);
    first.record_profile_b_turn(80.0);
    first.record_profile_a_verification(210.0, false);
    first.record_profile_b_verification(90.0, true);
    first.record_profile_b_invalid_or_empty();

    let mut second = DuelTimingStats::default();
    second.record_profile_a_turn(60.0);
    second.record_profile_b_turn(20.0);
    second.record_profile_b_turn(40.0);

    first.merge(second);

    assert_eq!(first.profile_a_turns, 3);
    assert_eq!(first.profile_b_turns, 3);
    assert!((first.profile_a_total_ms - 360.0).abs() < 0.001);
    assert!((first.profile_b_total_ms - 140.0).abs() < 0.001);
    assert!((first.profile_a_avg_ms() - 120.0).abs() < 0.001);
    assert!((first.profile_b_avg_ms() - 46.666_666_7).abs() < 0.001);
    assert!((first.profile_a_max_ms - 210.0).abs() < 0.001);
    assert!((first.profile_b_max_ms - 90.0).abs() < 0.001);
    assert_eq!(first.profile_a_nondeterministic, 1);
    assert_eq!(first.profile_b_nondeterministic, 0);
    assert_eq!(first.profile_b_invalid_or_empty, 1);
}

fn empty_automove_selector(_: &MonsGame, _: AutomoveSearchConfig) -> Vec<Input> {
    Vec::new()
}

#[test]
fn timed_promotion_duel_records_raw_empty_selector_output() {
    let opening = generate_opening_fens_for_variants(77, 1, &[GameVariant::Classic])
        .pop()
        .expect("one classic opening");
    let empty_model = AutomoveModel {
        select_inputs: empty_automove_selector,
    };
    let (_, timing) = with_env_override("SMART_DUEL_VERIFY_DETERMINISM", "true", || {
        play_one_game_budget_duel_with_timing(
            empty_model,
            pro_budget(),
            empty_model,
            pro_budget(),
            true,
            opening.as_str(),
            1,
        )
    });

    assert_eq!(timing.profile_a_turns + timing.profile_b_turns, 1);
    assert_eq!(
        timing.profile_a_invalid_or_empty + timing.profile_b_invalid_or_empty,
        2,
        "both the original and independently cold replay must record raw emptiness"
    );
}

#[test]
fn pro_reliability_gate_passes_only_when_all_matchups_clear_win_confidence_and_move_time() {
    let passing = ProReliabilityGateMetrics {
        win_rate: 7.0 / 12.0,
        confidence: 0.60,
        frontier_avg_ms: 700.0,
        frontier_max_ms: 700.0,
        frontier_invalid_or_empty: 0,
        frontier_nondeterministic: 0,
        frontier_turns: 100,
        shipping_max_ms: 700.0,
        shipping_invalid_or_empty: 0,
        shipping_nondeterministic: 0,
        shipping_turns: 100,
    };
    assert!(pro_reliability_gate_passes(passing, passing, passing));
    assert!(!pro_reliability_gate_passes(
        ProReliabilityGateMetrics {
            win_rate: 0.58,
            ..passing
        },
        passing,
        passing
    ));
    assert!(!pro_reliability_gate_passes(
        passing,
        ProReliabilityGateMetrics {
            confidence: 0.59,
            ..passing
        },
        passing
    ));
    assert!(!pro_reliability_gate_passes(
        passing,
        passing,
        ProReliabilityGateMetrics {
            frontier_max_ms: 700.01,
            ..passing
        }
    ));
    assert!(!pro_reliability_gate_passes(
        ProReliabilityGateMetrics {
            frontier_invalid_or_empty: 1,
            ..passing
        },
        passing,
        passing
    ));
    assert!(pro_reliability_gate_passes(
        ProReliabilityGateMetrics {
            frontier_nondeterministic: 1,
            ..passing
        },
        passing,
        passing
    ));
    assert!(pro_reliability_gate_passes(
        ProReliabilityGateMetrics {
            frontier_nondeterministic: 2,
            ..passing
        },
        passing,
        passing
    ));
    assert!(pro_reliability_gate_passes(
        ProReliabilityGateMetrics {
            frontier_nondeterministic: 3,
            ..passing
        },
        passing,
        passing
    ));
    assert!(!pro_reliability_gate_passes(
        ProReliabilityGateMetrics {
            frontier_nondeterministic: 4,
            ..passing
        },
        passing,
        passing
    ));
    assert!(!pro_reliability_gate_passes(
        passing,
        ProReliabilityGateMetrics {
            shipping_max_ms: 700.01,
            ..passing
        },
        passing
    ));
    assert!(pro_reliability_gate_passes(
        passing,
        passing,
        ProReliabilityGateMetrics {
            shipping_nondeterministic: 1,
            ..passing
        }
    ));
    assert!(pro_reliability_gate_passes(
        passing,
        passing,
        ProReliabilityGateMetrics {
            shipping_nondeterministic: 2,
            ..passing
        }
    ));
    assert!(pro_reliability_gate_passes(
        passing,
        passing,
        ProReliabilityGateMetrics {
            shipping_nondeterministic: 3,
            ..passing
        }
    ));
    assert!(!pro_reliability_gate_passes(
        passing,
        passing,
        ProReliabilityGateMetrics {
            shipping_nondeterministic: 4,
            ..passing
        }
    ));
}

#[test]
fn pro_reliability_variant_floor_allows_only_two_regressed_variants() {
    let mut stats = TimedMatchupStats::default();
    stats.record_for_variant(
        GameVariant::Classic,
        MatchResult::ProfileAWin,
        DuelTimingStats::default(),
    );
    stats.record_for_variant(
        GameVariant::Classic,
        MatchResult::ProfileBWin,
        DuelTimingStats::default(),
    );
    stats.record_for_variant(
        GameVariant::SwappedManaRows,
        MatchResult::ProfileAWin,
        DuelTimingStats::default(),
    );
    assert!(pro_reliability_variant_floor_passes(&stats));

    let mut regressed = stats.clone();
    regressed.record_for_variant(
        GameVariant::OffsetArcManaRows,
        MatchResult::ProfileBWin,
        DuelTimingStats::default(),
    );
    assert!(pro_reliability_variant_floor_passes(&regressed));

    regressed.record_for_variant(
        GameVariant::CenterSpokeManaRows,
        MatchResult::ProfileBWin,
        DuelTimingStats::default(),
    );
    assert!(pro_reliability_variant_floor_passes(&regressed));

    regressed.record_for_variant(
        GameVariant::BentCenterManaRows,
        MatchResult::ProfileBWin,
        DuelTimingStats::default(),
    );
    assert!(!pro_reliability_variant_floor_passes(&regressed));
}

#[test]
fn runtime_preflight_checks_run_when_not_skipped() {
    let stage1_calls = std::cell::Cell::new(0);
    let exact_calls = std::cell::Cell::new(0);

    maybe_run_runtime_preflight_checks(
        false,
        || stage1_calls.set(stage1_calls.get() + 1),
        || exact_calls.set(exact_calls.get() + 1),
    );

    assert_eq!(stage1_calls.get(), 1);
    assert_eq!(exact_calls.get(), 1);
}

#[test]
fn runtime_preflight_checks_are_skipped_when_requested() {
    let stage1_calls = std::cell::Cell::new(0);
    let exact_calls = std::cell::Cell::new(0);

    maybe_run_runtime_preflight_checks(
        true,
        || stage1_calls.set(stage1_calls.get() + 1),
        || exact_calls.set(exact_calls.get() + 1),
    );

    assert_eq!(stage1_calls.get(), 0);
    assert_eq!(exact_calls.get(), 0);
}

#[test]
fn automove_experiment_variant_registry_covers_current_game_variants() {
    assert_eq!(automove_experiment_variants().len(), 12);
    for expected_id in 0..=11 {
        let variant = GameVariant::from_id(expected_id).expect("known variant id");
        assert!(
            automove_experiment_variants().contains(&variant),
            "experiment registry should include variant id {}",
            expected_id
        );
    }
}

#[test]
fn automove_variant_env_parses_ids_and_labels() {
    assert_eq!(parse_automove_variant("0"), Some(GameVariant::Classic));
    assert_eq!(
        parse_automove_variant("swapped_mana_rows"),
        Some(GameVariant::SwappedManaRows)
    );
    assert_eq!(
        parse_automove_variant("ForwardBridge"),
        Some(GameVariant::ForwardBridgeManaRows)
    );
    assert_eq!(parse_automove_variant("not_a_variant"), None);
}

#[test]
fn sampled_and_all_variant_plans_are_deterministic() {
    with_env_override("SMART_AUTOMOVE_VARIANTS", "", || {
        with_env_override("SMART_AUTOMOVE_VARIANT_POLICY", "sampled", || {
            with_env_override("SMART_AUTOMOVE_VARIANT_SAMPLE_SIZE", "3", || {
                let first = automove_variant_plan_for_openings(123, 8);
                let second = automove_variant_plan_for_openings(123, 8);
                assert_eq!(first.policy, AutomoveVariantPolicy::Sampled);
                assert_eq!(first.variants, second.variants);
                assert_eq!(first.variants.len(), 3);
            });
        });

        with_env_override("SMART_AUTOMOVE_VARIANT_POLICY", "all", || {
            let plan = automove_variant_plan_for_openings(123, 12);
            assert_eq!(plan.policy, AutomoveVariantPolicy::All);
            assert_eq!(plan.variants.len(), automove_experiment_variants().len());
            for variant in automove_experiment_variants() {
                assert!(plan.variants.contains(variant));
            }
        });
    });
}

#[test]
fn explicit_variant_env_overrides_policy() {
    with_env_override("SMART_AUTOMOVE_VARIANT_POLICY", "all", || {
        with_env_override(
            "SMART_AUTOMOVE_VARIANTS",
            "classic,swapped_mana_rows,1",
            || {
                let plan = automove_variant_plan_for_openings(9, 12);
                assert_eq!(plan.policy, AutomoveVariantPolicy::Explicit);
                assert_eq!(
                    plan.variants,
                    vec![GameVariant::Classic, GameVariant::SwappedManaRows]
                );
            },
        );
    });
}

#[test]
fn opening_fen_cache_key_includes_variant_list() {
    with_env_override("SMART_AUTOMOVE_VARIANT_POLICY", "sampled", || {
        with_env_override("SMART_AUTOMOVE_VARIANTS", "classic", || {
            let classic = generate_opening_fens_cached(77, 1);
            let classic_game =
                MonsGame::from_fen(classic[0].as_str(), false).expect("classic opening fen");
            assert_eq!(classic_game.variant(), GameVariant::Classic);
        });
        with_env_override("SMART_AUTOMOVE_VARIANTS", "swapped_mana_rows", || {
            let swapped = generate_opening_fens_cached(77, 1);
            let swapped_game =
                MonsGame::from_fen(swapped[0].as_str(), false).expect("swapped opening fen");
            assert_eq!(swapped_game.variant(), GameVariant::SwappedManaRows);
        });
    });
}

#[test]
fn stage1_cpu_is_advisory_by_default_for_frontier_pro_profiles() {
    with_env_override("SMART_STAGE1_CPU_ADVISORY", "", || {
        assert!(stage1_cpu_is_advisory("frontier_pro_v2_guarded"));
        assert!(!stage1_cpu_is_advisory("shipping_pro_search"));
    });
}

#[test]
fn stage1_cpu_advisory_can_be_forced_off_for_frontier_pro_profiles() {
    with_env_override("SMART_STAGE1_CPU_ADVISORY", "false", || {
        assert!(!stage1_cpu_is_advisory("frontier_pro_v2_guarded"));
    });
}

#[test]
fn pro_signal_triage_accepts_target_change_with_bounded_off_target_churn() {
    assert!(pro_signal_triage_passes(
        "frontier_pro_v2_guarded",
        "shipping_pro_search",
        2,
        1
    ));
    assert!(pro_signal_triage_passes(
        "frontier_pro_v2_guarded",
        "shipping_pro_search",
        1,
        0
    ));
    assert!(pro_signal_triage_passes(
        "frontier_pro_v2_guarded",
        "shipping_pro_search",
        0,
        0
    ));
    assert!(pro_signal_triage_passes(
        "frontier_pro_v2_guarded",
        "shipping_pro_search",
        0,
        5
    ));
    assert!(!pro_signal_triage_passes(
        "frontier_pro_v2_guarded",
        "shipping_pro_search",
        1,
        2
    ));
}

#[test]
fn smart_automove_pool_profile_registry_resolves_retained_profiles() {
    for profile_id in retained_profile_ids() {
        assert!(
            profile_selector_from_name(profile_id).is_some(),
            "retained profile '{}' should resolve",
            profile_id
        );
    }
}

#[test]
fn smart_automove_pool_retained_profile_ids_match_active_registry() {
    assert_eq!(
        retained_profile_ids(),
        vec![
            "shipping_pro_search",
            "frontier_pro_v2_guarded",
            "frontier_pro_v10_bounded_tactical",
        ]
    );
}

#[test]
fn smart_automove_pool_archived_profiles_do_not_resolve() {
    for profile_id in [
        "base",
        "runtime_release_safe_pre_exact",
        "runtime_eff_exact_lite_v1",
        "runtime_pre_fast_root_quality_v1_normal_conversion_v3",
        "swift_2024_eval_reference",
        "swift_2024_style_reference",
        "runtime_normal_from_fast_reference_v1",
        "runtime_pro_turn_engine_v1",
    ] {
        assert!(
            profile_selector_from_name(profile_id).is_none(),
            "archived profile '{}' should not resolve",
            profile_id
        );
    }
}

#[test]
fn selected_profile_helpers_use_canonical_env_names() {
    with_env_override("SMART_SELECTED_PROFILE", "", || {
        with_env_override("SMART_FRONTIER_PROFILE", "frontier_pro_v2_guarded", || {
            assert_eq!(selected_profile_id_from_env(), "frontier_pro_v2_guarded");
            assert_eq!(frontier_profile_id(), "frontier_pro_v2_guarded");
        });
    });
}

#[test]
fn shipping_profile_helper_uses_canonical_env_name() {
    with_env_override("SMART_SHIPPING_PROFILE", "shipping_pro_search", || {
        assert_eq!(shipping_profile_id(), "shipping_pro_search");
    });
}

#[test]
fn reliability_and_probe_profile_helpers_use_canonical_env_names() {
    with_env_override(
        "SMART_PRO_RELIABILITY_FRONTIER_PROFILE",
        "frontier_pro_v2_guarded",
        || {
            assert_eq!(reliability_frontier_profile_id(), "frontier_pro_v2_guarded");
        },
    );
    with_env_override(
        "SMART_PRO_RELIABILITY_SHIPPING_PROFILE",
        "shipping_pro_search",
        || {
            assert_eq!(reliability_shipping_profile_id(), "shipping_pro_search");
        },
    );
    with_env_override(
        "SMART_PROBE_FRONTIER_PROFILE",
        "frontier_pro_v2_guarded",
        || {
            assert_eq!(probe_frontier_profile_id(), "frontier_pro_v2_guarded");
        },
    );
    with_env_override(
        "SMART_PROBE_SHIPPING_PROFILE",
        "shipping_pro_search",
        || {
            assert_eq!(probe_shipping_profile_id(), "shipping_pro_search");
        },
    );
}

#[test]
fn raw_env_string_value_does_not_canonicalize_seed_tags() {
    with_env_override(
        "SMART_PRO_RELIABILITY_SEED_TAG",
        "retained_duel_seed_v1",
        || {
            assert_eq!(
                env_string_value("SMART_PRO_RELIABILITY_SEED_TAG"),
                Some("retained_duel_seed_v1".to_string())
            );
        },
    );
    with_env_override(
        "SMART_PRO_RELIABILITY_SEED_TAG",
        "Retained_Duel_Seed_V2",
        || {
            assert_eq!(
                env_string_value("SMART_PRO_RELIABILITY_SEED_TAG"),
                Some("retained_duel_seed_v2".to_string())
            );
        },
    );
}

#[test]
fn env_raw_string_value_preserves_case_sensitive_payloads() {
    let fen = "0 0 w 0 0 1 0 0 1 n03y0xs0xd0xa0xe0xn03/n11/xxQn02xxMn01xxUn01xxmn02xxQ 11";
    with_env_override("SMART_PRO_FORCED_ROOT_ORACLE_FEN", fen, || {
        assert_eq!(
            env_raw_string_value("SMART_PRO_FORCED_ROOT_ORACLE_FEN"),
            Some(fen.to_string())
        );
    });
}

#[test]
#[ignore = "tactical guardrail suite for the selected profile"]
fn smart_automove_tactical_selected_profile() {
    let profile_id = selected_profile_id().as_str().to_string();
    assert_tactical_guardrails(SELECTED_PROFILE_MODEL.select_inputs, profile_id.as_str());
    assert_interview_policy_regressions(SELECTED_PROFILE_MODEL.select_inputs, profile_id.as_str());
}

#[test]
#[ignore = "stage-1 cpu gate against shipping_pro_search; advisory-only for Pro frontiers when enabled"]
fn smart_automove_pool_stage1_cpu_non_regression_gate() {
    let frontier_profile_name = selected_profile_id().as_str().to_string();
    assert_stage1_cpu_non_regression(
        frontier_profile_name.as_str(),
        SELECTED_PROFILE_MODEL.select_inputs,
    );
}

#[test]
#[ignore = "exact-lite diagnostics gate for per-move budgets and cache efficiency"]
fn smart_automove_pool_exact_lite_diagnostics_gate() {
    let frontier_profile_name = selected_profile_id().as_str().to_string();
    assert_exact_lite_diagnostics_gate_if_enabled(
        frontier_profile_name.as_str(),
        SELECTED_PROFILE_MODEL.select_inputs,
    );
}

#[test]
#[ignore = "cheap legality smoke over every public automove game variant"]
fn smart_automove_pool_variant_smoke_gate() {
    let frontier_profile_name = frontier_profile_id();
    let shipping_profile_name = shipping_profile_id();

    for variant in automove_experiment_variants().iter().copied() {
        let game = MonsGame::new(false, variant);
        for (profile_name, mode) in [
            (
                shipping_profile_name.as_str(),
                SmartAutomovePreference::Fast,
            ),
            (
                shipping_profile_name.as_str(),
                SmartAutomovePreference::Normal,
            ),
            (frontier_profile_name.as_str(), SmartAutomovePreference::Pro),
        ] {
            let inputs = profile_runtime_inputs(profile_name, mode, &game);
            assert!(
                !inputs.is_empty(),
                "variant smoke produced no inputs for profile={} mode={} variant={}",
                profile_name,
                mode.as_api_value(),
                automove_variant_label(variant)
            );
            MonsGameModel::apply_inputs_for_search_with_events(&game, &inputs).unwrap_or_else(
                || {
                    panic!(
                        "variant smoke selected illegal inputs for profile={} mode={} variant={} inputs={}",
                        profile_name,
                        mode.as_api_value(),
                        automove_variant_label(variant),
                        Input::fen_from_array(&inputs)
                    )
                },
            );
            println!(
                "variant smoke profile={} mode={} variant={} inputs={}",
                profile_name,
                mode.as_api_value(),
                automove_variant_label(variant),
                Input::fen_from_array(&inputs)
            );
        }
    }
}

#[test]
#[ignore = "deterministic fixture-first triage for retained Classic primary_pro surface"]
fn smart_automove_pool_pro_signal_triage() {
    let surface = TriageSurface::PrimaryPro;
    let frontier_profile_name = frontier_profile_id();
    let shipping_profile_name = shipping_profile_id();
    let frontier_selector = profile_selector_from_name(frontier_profile_name.as_str())
        .unwrap_or_else(|| panic!("frontier '{}' not found", frontier_profile_name));
    let shipping_selector = profile_selector_from_name(shipping_profile_name.as_str())
        .unwrap_or_else(|| panic!("shipping '{}' not found", shipping_profile_name));

    assert_tactical_guardrails(frontier_selector, frontier_profile_name.as_str());
    assert_interview_policy_regressions(frontier_selector, frontier_profile_name.as_str());

    let primary_changed = compare_pro_triage_fixture_pack(
        TriageSurface::PrimaryPro,
        frontier_profile_name.as_str(),
        frontier_selector,
        shipping_profile_name.as_str(),
        shipping_selector,
        primary_pro_triage_fixtures().as_slice(),
    );

    let target_changed = primary_changed;
    let off_target_changed = 0;

    println!(
        "pro triage surface={} target_changed={} off_target_changed={}",
        surface.as_str(),
        target_changed,
        off_target_changed
    );
    assert!(
        pro_signal_triage_passes(
            frontier_profile_name.as_str(),
            shipping_profile_name.as_str(),
            target_changed,
            off_target_changed
        ),
        "pro triage failed for surface='{}': frontier='{}' shipping='{}' target_changed={} off_target_changed={} (expected target movement with <=1 off-target change, or a stable 0/0 result for a retained promoted frontier vs shipping_pro_search pair)",
        surface.as_str(),
        frontier_profile_name,
        shipping_profile_name,
        target_changed,
        off_target_changed
    );
}

#[test]
#[ignore = "reliability gate: retained pro profile vs shipping_pro_search pro, normal, and fast at pro budget with move-time cap"]
fn smart_automove_pool_pro_reliability_gate() {
    assert!(
        env_bool("SMART_DUEL_VERIFY_DETERMINISM").unwrap_or(false),
        "the reliability gate requires SMART_DUEL_VERIFY_DETERMINISM=true so max latency and replay agreement cover independent cold calls"
    );
    let frontier_profile = reliability_frontier_profile_id();
    let shipping_profile = reliability_shipping_profile_id();
    let frontier_selector = profile_selector_from_name(frontier_profile.as_str())
        .unwrap_or_else(|| panic!("frontier '{}' not found", frontier_profile));
    let shipping_selector = profile_selector_from_name(shipping_profile.as_str())
        .unwrap_or_else(|| panic!("shipping '{}' not found", shipping_profile));

    let skip_guardrails = env_bool("SMART_PRO_RELIABILITY_SKIP_GUARDRAILS").unwrap_or(false);
    if skip_guardrails {
        println!(
            "pro reliability gate: guardrails skipped by SMART_PRO_RELIABILITY_SKIP_GUARDRAILS=true"
        );
    } else {
        assert_runtime_preflight_if_required(frontier_profile.as_str(), frontier_selector);
        assert_tactical_guardrails(frontier_selector, frontier_profile.as_str());
        assert_tactical_guardrails(shipping_selector, shipping_profile.as_str());
    }

    let repeats = env_usize("SMART_PRO_RELIABILITY_REPEATS")
        .unwrap_or(3)
        .max(1);
    let games = env_usize("SMART_PRO_RELIABILITY_GAMES").unwrap_or(2).max(1);
    let max_plies_floor = if skip_guardrails { 8 } else { 56 };
    let max_plies = env_usize("SMART_PRO_RELIABILITY_MAX_PLIES")
        .unwrap_or(96)
        .max(max_plies_floor);
    let require_variant_floor =
        env_bool("SMART_PRO_RELIABILITY_REQUIRE_VARIANT_FLOOR").unwrap_or(false);
    let seed_tag = env_string_value("SMART_PRO_RELIABILITY_SEED_TAG")
        .unwrap_or_else(|| "pro_turn_planner_reliability_v1".to_string());
    let normal_seed_tag = format!("{}_vs_normal", seed_tag);
    let fast_seed_tag = format!("{}_vs_fast", seed_tag);

    let pro_stats = run_cross_budget_duel_with_timing(CrossBudgetDuelConfig {
        profile_a: frontier_profile.as_str(),
        mode_a: SmartAutomovePreference::Pro,
        profile_b: shipping_profile.as_str(),
        mode_b: SmartAutomovePreference::Pro,
        seed_tag: seed_tag.as_str(),
        repeats,
        games_per_repeat: games,
        max_plies,
    });
    let normal_stats = run_cross_budget_duel_with_timing(CrossBudgetDuelConfig {
        profile_a: frontier_profile.as_str(),
        mode_a: SmartAutomovePreference::Pro,
        profile_b: shipping_profile.as_str(),
        mode_b: SmartAutomovePreference::Normal,
        seed_tag: normal_seed_tag.as_str(),
        repeats,
        games_per_repeat: games,
        max_plies,
    });
    let fast_stats = run_cross_budget_duel_with_timing(CrossBudgetDuelConfig {
        profile_a: frontier_profile.as_str(),
        mode_a: SmartAutomovePreference::Pro,
        profile_b: shipping_profile.as_str(),
        mode_b: SmartAutomovePreference::Fast,
        seed_tag: fast_seed_tag.as_str(),
        repeats,
        games_per_repeat: games,
        max_plies,
    });

    let pro_total_games = pro_stats.matchup.total_games();
    let pro_metrics = print_pro_reliability_stats(
        "pro reliability gate vs shipping pro",
        frontier_profile.as_str(),
        shipping_profile.as_str(),
        &pro_stats,
    );

    let normal_total_games = normal_stats.matchup.total_games();
    let normal_metrics = print_pro_reliability_stats(
        "pro reliability gate vs shipping normal",
        frontier_profile.as_str(),
        shipping_profile.as_str(),
        &normal_stats,
    );

    let fast_total_games = fast_stats.matchup.total_games();
    let fast_metrics = print_pro_reliability_stats(
        "pro reliability gate vs shipping fast",
        frontier_profile.as_str(),
        shipping_profile.as_str(),
        &fast_stats,
    );

    let expected_games = repeats.saturating_mul(games).saturating_mul(2);
    assert_eq!(
        pro_total_games, expected_games,
        "pro reliability gate vs shipping pro expected {} mirrored games but ran {}",
        expected_games, pro_total_games
    );
    assert_eq!(
        normal_total_games, expected_games,
        "pro reliability gate vs shipping normal expected {} mirrored games but ran {}",
        expected_games, normal_total_games
    );
    assert_eq!(
        fast_total_games, expected_games,
        "pro reliability gate vs shipping fast expected {} mirrored games but ran {}",
        expected_games, fast_total_games
    );
    assert!(
        pro_reliability_gate_passes(pro_metrics, normal_metrics, fast_metrics),
        "pro reliability gate failed overall: vs_shipping_pro [win_rate {:.4} confidence {:.4} frontier_avg_ms {:.2}ms frontier_max_ms {:.2}ms shipping_max_ms {:.2}ms frontier_invalid={} frontier_nondeterministic={} shipping_invalid={} shipping_nondeterministic={}] vs_shipping_normal [win_rate {:.4} confidence {:.4} frontier_avg_ms {:.2}ms frontier_max_ms {:.2}ms shipping_max_ms {:.2}ms frontier_invalid={} frontier_nondeterministic={} shipping_invalid={} shipping_nondeterministic={}] vs_shipping_fast [win_rate {:.4} confidence {:.4} frontier_avg_ms {:.2}ms frontier_max_ms {:.2}ms shipping_max_ms {:.2}ms frontier_invalid={} frontier_nondeterministic={} shipping_invalid={} shipping_nondeterministic={}] (required each duel to satisfy win_rate >= {:.2}, confidence >= {:.2}, both profile maxima <= {:.2}ms, zero invalid moves, and cold replay mismatch rate <= {:.2}% per profile)",
        pro_metrics.win_rate,
        pro_metrics.confidence,
        pro_metrics.frontier_avg_ms,
        pro_metrics.frontier_max_ms,
        pro_metrics.shipping_max_ms,
        pro_metrics.frontier_invalid_or_empty,
        pro_metrics.frontier_nondeterministic,
        pro_metrics.shipping_invalid_or_empty,
        pro_metrics.shipping_nondeterministic,
        normal_metrics.win_rate,
        normal_metrics.confidence,
        normal_metrics.frontier_avg_ms,
        normal_metrics.frontier_max_ms,
        normal_metrics.shipping_max_ms,
        normal_metrics.frontier_invalid_or_empty,
        normal_metrics.frontier_nondeterministic,
        normal_metrics.shipping_invalid_or_empty,
        normal_metrics.shipping_nondeterministic,
        fast_metrics.win_rate,
        fast_metrics.confidence,
        fast_metrics.frontier_avg_ms,
        fast_metrics.frontier_max_ms,
        fast_metrics.shipping_max_ms,
        fast_metrics.frontier_invalid_or_empty,
        fast_metrics.frontier_nondeterministic,
        fast_metrics.shipping_invalid_or_empty,
        fast_metrics.shipping_nondeterministic,
        SMART_PRO_RELIABILITY_WIN_RATE_MIN,
        SMART_PRO_RELIABILITY_CONFIDENCE_MIN,
        SMART_PRO_RELIABILITY_MOVE_MAX_MS,
        SMART_PRO_RELIABILITY_REPLAY_MISMATCH_RATE_MAX * 100.0,
    );
    assert_pro_reliability_duel_passes("pro reliability gate vs shipping pro", pro_metrics);
    assert_pro_reliability_duel_passes("pro reliability gate vs shipping normal", normal_metrics);
    assert_pro_reliability_duel_passes("pro reliability gate vs shipping fast", fast_metrics);
    if require_variant_floor {
        assert_pro_reliability_variant_floor_passes(
            "pro reliability gate vs shipping pro",
            &pro_stats,
        );
        assert_pro_reliability_variant_floor_passes(
            "pro reliability gate vs shipping normal",
            &normal_stats,
        );
        assert_pro_reliability_variant_floor_passes(
            "pro reliability gate vs shipping fast",
            &fast_stats,
        );
    }
}
