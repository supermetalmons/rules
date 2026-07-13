use super::*;
use crate::models::mons_game_model::automove_runtime_variants::{
    apply_frontier_pro_v10_bounded_tactical_config, apply_frontier_pro_v2_guarded_config,
    select_frontier_pro_v10_bounded_tactical_inputs, select_frontier_pro_v2_guarded_inputs,
    select_shipping_pro_search_inputs, FRONTIER_PRO_V10_BOUNDED_TACTICAL_PROFILE_ID,
    FRONTIER_PRO_V2_GUARDED_PROFILE_ID, SHIPPING_PRO_SEARCH_PROFILE_ID,
};

const DEFAULT_SHIPPING_PROFILE_ID: &str = SHIPPING_PRO_SEARCH_PROFILE_ID;
const DEFAULT_FRONTIER_PROFILE_ID: &str = FRONTIER_PRO_V10_BOUNDED_TACTICAL_PROFILE_ID;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct ExactLiteBudgets {
    pub root_call_budget: usize,
    pub static_call_budget: usize,
}

#[derive(Clone, Copy)]
struct AutomoveProfile {
    id: &'static str,
    selector: AutomoveSelector,
}

const RETAINED_PROFILES: [AutomoveProfile; 3] = [
    AutomoveProfile {
        id: SHIPPING_PRO_SEARCH_PROFILE_ID,
        selector: select_shipping_pro_search_inputs,
    },
    AutomoveProfile {
        id: FRONTIER_PRO_V2_GUARDED_PROFILE_ID,
        selector: select_frontier_pro_v2_guarded_inputs,
    },
    AutomoveProfile {
        id: FRONTIER_PRO_V10_BOUNDED_TACTICAL_PROFILE_ID,
        selector: select_frontier_pro_v10_bounded_tactical_inputs,
    },
];

pub(super) const SELECTED_PROFILE_MODEL: AutomoveModel = AutomoveModel {
    select_inputs: selected_profile_model,
};

pub(super) fn profile_runtime_config_for_name(
    profile_name: &str,
    _game: &MonsGame,
    config: AutomoveSearchConfig,
) -> Option<AutomoveSearchConfig> {
    let resolved = match profile_name {
        SHIPPING_PRO_SEARCH_PROFILE_ID => config,
        FRONTIER_PRO_V2_GUARDED_PROFILE_ID => apply_frontier_pro_v2_guarded_config(config),
        FRONTIER_PRO_V10_BOUNDED_TACTICAL_PROFILE_ID => {
            apply_frontier_pro_v10_bounded_tactical_config(config)
        }
        _ => return None,
    };
    Some(resolved)
}

pub(super) fn profile_exact_lite_budgets(
    _profile_name: &str,
    _game: &MonsGame,
    _config: AutomoveSearchConfig,
) -> Option<ExactLiteBudgets> {
    None
}

pub(super) fn selected_profile_model(game: &MonsGame, config: AutomoveSearchConfig) -> Vec<Input> {
    let profile_id = selected_profile_id().as_str();
    let selector = profile_selector_from_name(profile_id)
        .unwrap_or_else(|| panic!("selected profile '{}' not found", profile_id));
    selector(game, config)
}

fn retained_profiles() -> &'static [AutomoveProfile] {
    &RETAINED_PROFILES
}

pub(super) fn retained_profile_ids() -> Vec<&'static str> {
    retained_profiles()
        .iter()
        .map(|profile| profile.id)
        .collect()
}

pub(super) fn profile_selector_from_name(profile_name: &str) -> Option<AutomoveSelector> {
    retained_profiles()
        .iter()
        .find(|profile| profile.id == profile_name)
        .map(|profile| profile.selector)
}

fn env_profile_name_from_aliases(names: &[&str]) -> Option<String> {
    names.iter().find_map(|name| env_profile_name(name))
}

pub(super) fn env_string_value(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty())
}

pub(super) fn env_raw_string_value(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub(super) fn selected_profile_id_from_env() -> String {
    // Direct selected-profile diagnostics retain the search-only control as their neutral
    // default. Canonical frontier stages use `frontier_profile_id()` and DEFAULT_FRONTIER_PROFILE_ID.
    env_profile_name_from_aliases(&["SMART_SELECTED_PROFILE", "SMART_FRONTIER_PROFILE"])
        .unwrap_or_else(|| SHIPPING_PRO_SEARCH_PROFILE_ID.to_string())
}

pub(super) fn selected_profile_id() -> &'static String {
    static PROFILE: OnceLock<String> = OnceLock::new();
    PROFILE.get_or_init(selected_profile_id_from_env)
}

pub(super) fn env_profile_name(name: &str) -> Option<String> {
    env_string_value(name)
}

pub(super) fn frontier_profile_id() -> String {
    env_profile_name("SMART_FRONTIER_PROFILE")
        .unwrap_or_else(|| DEFAULT_FRONTIER_PROFILE_ID.to_string())
}

pub(super) fn shipping_profile_id() -> String {
    env_profile_name("SMART_SHIPPING_PROFILE")
        .unwrap_or_else(|| DEFAULT_SHIPPING_PROFILE_ID.to_string())
}

pub(super) fn reliability_frontier_profile_id() -> String {
    env_profile_name_from_aliases(&[
        "SMART_PRO_RELIABILITY_FRONTIER_PROFILE",
        "SMART_FRONTIER_PROFILE",
    ])
    .unwrap_or_else(|| DEFAULT_FRONTIER_PROFILE_ID.to_string())
}

pub(super) fn reliability_shipping_profile_id() -> String {
    env_profile_name_from_aliases(&[
        "SMART_PRO_RELIABILITY_SHIPPING_PROFILE",
        "SMART_SHIPPING_PROFILE",
    ])
    .unwrap_or_else(|| DEFAULT_SHIPPING_PROFILE_ID.to_string())
}

pub(super) fn probe_frontier_profile_id() -> String {
    env_profile_name_from_aliases(&["SMART_PROBE_FRONTIER_PROFILE", "SMART_FRONTIER_PROFILE"])
        .unwrap_or_else(|| DEFAULT_FRONTIER_PROFILE_ID.to_string())
}

pub(super) fn probe_shipping_profile_id() -> String {
    env_profile_name_from_aliases(&["SMART_PROBE_SHIPPING_PROFILE", "SMART_SHIPPING_PROFILE"])
        .unwrap_or_else(|| DEFAULT_SHIPPING_PROFILE_ID.to_string())
}
