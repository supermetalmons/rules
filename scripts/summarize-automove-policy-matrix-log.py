#!/usr/bin/env python3
"""Summarize policy-matrix experiment logs into one JSON decision digest."""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


POLICY_MATRIX_PREFIX = "PRO_POLICY_MATRIX_"
NO_SOURCE_DECISIONS = {
    "baseline_save_risk",
    "coverage_gap",
    "no_candidate_route",
    "postprocess_only",
    "singleton_no_source",
}
CORPUS_STATE_FIELDS = [
    "panel",
    "duel",
    "seed_tag",
    "repeat",
    "opening_index",
    "variant",
    "candidate_is_white",
]
CROSS_BUDGET_STATE_FIELDS = [
    "panel",
    "seed_family",
    "repeat",
    "opening_index",
    "variant",
    "candidate_is_white",
]


def parse_policy_matrix_lines(paths):
    events = []
    for path in paths:
        events.extend(parse_policy_matrix_log(path))
    return events


def parse_policy_matrix_log(path):
    events = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.rstrip("\n")
            if not line.startswith(POLICY_MATRIX_PREFIX):
                continue
            try:
                event_type, payload = line.split(" ", 1)
            except ValueError:
                continue
            try:
                data = json.loads(payload)
            except json.JSONDecodeError as error:
                raise SystemExit(
                    f"{path}:{line_number}: invalid JSON after {event_type}: {error}"
                ) from error
            events.append(
                {
                    "event_type": event_type,
                    "source_log": str(path),
                    "source_line": line_number,
                    "data": data,
                }
            )
    return events


def stable_id_value(value):
    if isinstance(value, bool):
        return str(value).lower()
    return str(value)


def state_id_from_pairs(pairs):
    return "|".join(f"{field}={stable_id_value(value)}" for field, value in pairs)


def corpus_state_id(record):
    return state_id_from_pairs(
        (field, record.get(field, "")) for field in CORPUS_STATE_FIELDS
    )


def cross_budget_state_id_from_key(state_key):
    return state_id_from_pairs(zip(CROSS_BUDGET_STATE_FIELDS, state_key))


def cross_budget_state_id(record):
    return cross_budget_state_id_from_key(cross_budget_axis_state_key(record))


def permission_from_recommendation(recommendation):
    if not recommendation:
        return "missing_recommendation"
    label = recommendation.get("label", "")
    if label == "narrow_low_fragmentation_route":
        return "inspect_for_source"
    if label == "build_outcome_corpus_v2":
        return "postprocess_only"
    return "no_source"


def corpus_decision(summary, stoplight, recommendation):
    stoplight_label = stoplight.get("label", "")
    recommendation_label = recommendation.get("label", "")
    no_policy_wins = int(summary.get("no_policy_wins", 0))
    baseline_only_wins = int(summary.get("baseline_only_wins", 0))

    if recommendation_label == "narrow_low_fragmentation_route":
        return "inspect_for_source"
    if no_policy_wins > 0 or stoplight_label == "coverage_gap":
        return "coverage_gap"
    if (
        baseline_only_wins > 0
        or stoplight_label == "baseline_save_risk"
        or recommendation_label == "baseline_save_risk_only"
    ):
        return "baseline_save_risk"
    if recommendation_label == "build_outcome_corpus_v2":
        return "postprocess_only"
    if recommendation_label == "singleton_candidate_routes":
        return "singleton_no_source"
    if recommendation_label == "no_candidate_route":
        return "no_candidate_route"
    return "no_source"


def next_action_for_decision(decision):
    if decision == "inspect_for_source":
        return "inspect_filtered_records"
    if decision == "coverage_gap":
        return "add_policy_or_root_feature"
    if decision == "baseline_save_risk":
        return "avoid_selector"
    if decision == "postprocess_only":
        return "build_outcome_corpus_v2"
    if decision == "singleton_no_source":
        return "widen_or_archive_singleton"
    if decision == "no_candidate_route":
        return "try_next_slice"
    return "keep_postprocess"


def source_blocker_for_decision(decision, summary, stoplight, recommendation):
    if decision == "inspect_for_source":
        return {"kind": "none"}
    if decision == "coverage_gap":
        return {
            "kind": "coverage_gap",
            "no_policy_wins": int(summary.get("no_policy_wins", 0)),
            "stoplight": stoplight.get("label", ""),
        }
    if decision == "baseline_save_risk":
        return {
            "kind": "baseline_save_risk",
            "route_key": recommendation.get("best_baseline_risk_key", ""),
            "candidate_only_states": int(
                recommendation.get("best_baseline_risk_candidate_only_states", 0)
            ),
            "baseline_better_states": int(
                recommendation.get("best_baseline_risk_baseline_better_states", 0)
            ),
        }
    if decision == "postprocess_only":
        return {
            "kind": "fragmented_routes",
            "clean_fragmented_routes": int(
                recommendation.get("clean_fragmented_routes", 0)
            ),
            "clean_low_fragmentation_routes": int(
                recommendation.get("clean_low_fragmentation_routes", 0)
            ),
        }
    if decision == "singleton_no_source":
        return {
            "kind": "singleton_candidate_routes",
            "candidate_signal_routes": int(
                recommendation.get("candidate_signal_routes", 0)
            ),
        }
    if decision == "no_candidate_route":
        return {
            "kind": "no_candidate_route",
            "candidate_signal_routes": int(
                recommendation.get("candidate_signal_routes", 0)
            ),
        }
    return {"kind": "unknown"}


def permission_from_filter_summary(summary):
    if not summary:
        return "missing_summary"
    records = int(summary.get("breakdown_records", 0))
    if records == 0:
        return "no_matching_records"
    fragmented_dimensions = []
    for field, dimension in [
        ("candidate_count", "candidate_policy"),
        ("branch_count", "branch"),
        ("pair_count", "first_move_pair"),
    ]:
        if int(summary.get(field, 0)) > 1:
            fragmented_dimensions.append(dimension)
    if fragmented_dimensions:
        return "fragmented_no_source"
    return "focused_candidate"


def sorted_details(details):
    return sorted(
        details,
        key=lambda item: (
            item.get("dimension", ""),
            int(item.get("rank", 0)),
            item.get("key", ""),
        ),
    )


def summarized_global_counts(summary):
    fields = [
        "total_games",
        "baseline_wins",
        "candidate_any_wins",
        "candidate_only_wins",
        "baseline_only_wins",
        "no_policy_wins",
    ]
    return {field: int(summary.get(field, 0)) for field in fields}


def summarized_recommendation_counts(recommendation):
    fields = [
        "candidate_signal_routes",
        "clean_low_fragmentation_routes",
        "clean_fragmented_routes",
        "baseline_risk_routes",
        "best_clean_candidate_only_states",
        "best_baseline_risk_candidate_only_states",
        "best_baseline_risk_baseline_better_states",
    ]
    return {field: int(recommendation.get(field, 0)) for field in fields}


def source_blocker_count_key(blocker):
    kind = blocker.get("kind", "unknown")
    if kind == "baseline_save_risk":
        route_key = blocker.get("route_key", "")
        return f"{kind}:{route_key}" if route_key else kind
    return kind


def sorted_count_rows(counter):
    return [
        {"key": key, "count": count}
        for key, count in sorted(counter.items(), key=lambda item: (-item[1], item[0]))
    ]


def limited_count_rows(counter, limit=8):
    return sorted_count_rows(counter)[:limit]


def count_keys(counter):
    return {key for key, count in counter.items() if count > 0}


def rollup_decision_from_counts(decision_counts):
    decisions = count_keys(decision_counts)
    if not decisions:
        return "no_source"
    if decisions == {"inspect_for_source"}:
        return "inspect_for_source"
    if decisions.issubset(NO_SOURCE_DECISIONS):
        for decision in [
            "baseline_save_risk",
            "coverage_gap",
            "postprocess_only",
            "singleton_no_source",
            "no_candidate_route",
        ]:
            if decision in decisions:
                return decision
    return "mixed_review_required"


def rollup_permission_from_decision(decision):
    if decision == "inspect_for_source":
        return "inspect_for_source"
    if decision in NO_SOURCE_DECISIONS:
        return "no_source"
    return "mixed_review_required"


def log_summary(source_log, digest):
    recommendation = digest.get("route_recommendation", {})
    stoplight = digest.get("global_stoplight", {})
    return {
        "source_log": source_log,
        "event_counts": digest.get("event_counts", {}),
        "corpus_decision": digest.get("corpus_decision", ""),
        "next_action": digest.get("next_action", ""),
        "source_blocker": digest.get("source_blocker", {}),
        "route_permission": digest.get("route_permission", ""),
        "global_counts": summarized_global_counts(digest.get("global_summary", {})),
        "stoplight_label": stoplight.get("label", ""),
        "route_recommendation_label": recommendation.get("label", ""),
        "route_counts": summarized_recommendation_counts(recommendation),
        "coverage_gap_entry_count": digest.get("coverage_gap_entry_count", 0),
    }


def add_log_rollup(digest, per_log_digests):
    if len(per_log_digests) <= 1:
        return digest

    decision_counts = defaultdict(int)
    next_action_counts = defaultdict(int)
    source_blocker_counts = defaultdict(int)
    log_summaries = []

    for source_log, per_log_digest in per_log_digests:
        summary = log_summary(source_log, per_log_digest)
        log_summaries.append(summary)
        decision_counts[summary["corpus_decision"]] += 1
        next_action_counts[summary["next_action"]] += 1
        source_blocker_counts[
            source_blocker_count_key(summary["source_blocker"])
        ] += 1

    rollup_decision = rollup_decision_from_counts(decision_counts)
    digest["log_rollup"] = {
        "log_count": len(log_summaries),
        "rollup_decision": rollup_decision,
        "rollup_next_action": next_action_for_decision(rollup_decision),
        "rollup_permission": rollup_permission_from_decision(rollup_decision),
        "decision_counts": sorted_count_rows(decision_counts),
        "next_action_counts": sorted_count_rows(next_action_counts),
        "source_blocker_counts": sorted_count_rows(source_blocker_counts),
        "log_summaries": log_summaries,
    }
    return digest


def coverage_gap_group_key(record):
    return tuple(
        record.get(field, "")
        for field in [
            "panel",
            "duel",
            "seed_tag",
            "repeat",
            "opening_index",
            "variant",
            "candidate_is_white",
        ]
    )


def corpus_axis_record_class(record):
    outcome = record.get("outcome", "")
    portfolio_class = record.get("portfolio_class", "")
    if outcome == "candidate_better":
        return "candidate_better"
    if outcome == "baseline_better":
        return "baseline_better"
    if portfolio_class == "no_policy_win":
        return "no_policy"
    if outcome == "same_outcome":
        return "same_outcome"
    return portfolio_class or outcome or "unknown"


def split_axis_field(value):
    return [axis for axis in value.split("|") if axis]


LOCATION_INPUT_RE = re.compile(r"^l(-?\d+),(-?\d+)$")
BOARD_MAX_INDEX = 10


def move_shape_location(token):
    match = LOCATION_INPUT_RE.match(token)
    if not match:
        return None
    return int(match.group(1)), int(match.group(2))


def move_shape_zone(location):
    i, j = location
    if i in {0, BOARD_MAX_INDEX} and j in {0, BOARD_MAX_INDEX}:
        return "corner"
    if i in {0, BOARD_MAX_INDEX} or j in {0, BOARD_MAX_INDEX}:
        return "edge"
    if i <= 1 or i >= BOARD_MAX_INDEX - 1 or j <= 1 or j >= BOARD_MAX_INDEX - 1:
        return "near_edge"
    if 4 <= i <= 6 and 4 <= j <= 6:
        return "center"
    return "mid"


def move_shape_span_bucket(locations):
    if len(locations) < 2:
        return "span0"
    start = locations[0]
    end = locations[-1]
    distance = abs(start[0] - end[0]) + abs(start[1] - end[1])
    if distance <= 1:
        return "span1"
    if distance <= 2:
        return "span2"
    if distance <= 4:
        return "span3_4"
    return "span5plus"


def move_input_shape(move_fen):
    value = str(move_fen or "")
    if not value or value == "none":
        return "none"
    tokens = [token for token in value.split(";") if token]
    locations = [
        location
        for token in tokens
        for location in [move_shape_location(token)]
        if location is not None
    ]
    modifiers = sorted(
        token[1:] for token in tokens if token.startswith("m") and len(token) > 1
    )
    takebacks = sum(1 for token in tokens if token == "z")
    location_count = len(locations)
    modifier_key = "+".join(modifiers) if modifiers else "none"
    flow = "no_location"
    if locations:
        flow = f"{move_shape_zone(locations[0])}->{move_shape_zone(locations[-1])}"
    return (
        f"loc{location_count};mod{len(modifiers)}:{modifier_key};"
        f"z{takebacks};{move_shape_span_bucket(locations)};flow={flow}"
    )


def move_shape_span_rank(shape):
    if "span5plus" in shape:
        return 5
    if "span3_4" in shape:
        return 3
    if "span2" in shape:
        return 2
    if "span1" in shape:
        return 1
    return 0


def move_shape_delta(left_shape, right_shape, left_label):
    if not left_shape or not right_shape:
        return "missing"
    if left_shape == right_shape:
        return "same_shape"
    left_span = move_shape_span_rank(left_shape)
    right_span = move_shape_span_rank(right_shape)
    if left_span > right_span:
        return f"{left_label}_longer"
    if left_span < right_span:
        return f"{left_label}_shorter"
    return "same_span_different_shape"


def game_board_tokens(game_fen):
    fields = str(game_fen or "").split()
    if len(fields) not in {10, 11}:
        return {}
    board_fen = fields[9]
    tokens = {}
    for i, row in enumerate(board_fen.split("/")):
        j = 0
        index = 0
        while index < len(row):
            if row[index] == "n" and index + 2 < len(row):
                try:
                    j += int(row[index + 1 : index + 3])
                except ValueError:
                    return tokens
                index += 3
                continue
            item = row[index : index + 3]
            if len(item) == 3:
                tokens[(i, j)] = item
            j += 1
            index += 3
    return tokens


def relative_color(color, active_color):
    if color not in {"white", "black"} or active_color not in {"white", "black"}:
        return "unknown"
    return "own" if color == active_color else "opp"


def active_color_name(record):
    value = str(record.get("active_color", ""))
    if value == "white":
        return "white"
    if value == "black":
        return "black"
    board_fields = str(record.get("board", "")).split()
    if len(board_fields) >= 3:
        if board_fields[2] == "w":
            return "white"
        if board_fields[2] == "b":
            return "black"
    return "unknown"


def payload_profile(payload, active_color):
    if payload == "x" or payload == "":
        return "none"
    if payload == "U":
        return "high"
    if payload == "M":
        return f"{relative_color('white', active_color)}_regular"
    if payload == "m":
        return f"{relative_color('black', active_color)}_regular"
    if payload == "P":
        return "potion"
    if payload == "B":
        return "bomb"
    if payload == "Q":
        return "consumable"
    return "unknown"


def item_intent_profile(item, active_color):
    if not item:
        return "empty"
    mon = item[:2]
    payload = payload_profile(item[2:], active_color)
    if mon == "xx":
        return f"free_{payload}"
    role_map = {
        "e": "demon",
        "d": "drainer",
        "a": "angel",
        "s": "spirit",
        "y": "mystic",
    }
    role = role_map.get(mon[:1].lower(), "unknown")
    color = "white" if mon[:1].isupper() else "black"
    side = relative_color(color, active_color)
    return f"{side}_{role}_carry_{payload}"


def move_locations(move_fen):
    return [
        location
        for token in str(move_fen or "").split(";")
        for location in [move_shape_location(token)]
        if location is not None
    ]


def adjacent_locations(location):
    i, j = location
    return [(i - 1, j), (i + 1, j), (i, j - 1), (i, j + 1)]


def mon_side(item, active_color):
    if not item:
        return "empty"
    mon = item[:2]
    if mon == "xx":
        return "empty"
    color = "white" if mon[:1].isupper() else "black"
    return relative_color(color, active_color)


def adjacency_count_bucket(value):
    if value <= 0:
        return "count0"
    if value == 1:
        return "count1"
    return "count2plus"


def pressure_focus(own_count, opp_count):
    if own_count == 0 and opp_count == 0:
        return "isolated"
    if own_count > 0 and opp_count == 0:
        return "supported"
    if own_count == 0 and opp_count > 0:
        return "exposed"
    if own_count > opp_count:
        return "supported_contested"
    if own_count < opp_count:
        return "pressured"
    return "contested_even"


def endpoint_pressure(board, location, active_color):
    own_count = 0
    opp_count = 0
    for neighbor in adjacent_locations(location):
        side = mon_side(board.get(neighbor), active_color)
        if side == "own":
            own_count += 1
        elif side == "opp":
            opp_count += 1
    return {
        "own_count": own_count,
        "opp_count": opp_count,
        "focus": pressure_focus(own_count, opp_count),
    }


def move_local_pressure_values(record, move_fen):
    locations = move_locations(move_fen)
    if not locations:
        return None
    board = game_board_tokens(record.get("board", ""))
    active_color = active_color_name(record)
    source = endpoint_pressure(board, locations[0], active_color)
    target = endpoint_pressure(board, locations[-1], active_color)
    return {
        "source_focus": source["focus"],
        "target_focus": target["focus"],
        "target_own": target["own_count"],
        "target_opp": target["opp_count"],
        "flow": f"{move_shape_zone(locations[0])}->{move_shape_zone(locations[-1])}",
    }


def move_local_pressure_shape(values):
    if not values:
        return "none"
    return (
        f"source={values['source_focus']};"
        f"target={values['target_focus']};"
        f"flow={values['flow']}"
    )


def move_target_pressure_shape(values):
    if not values:
        return "none"
    return (
        f"target={values['target_focus']};"
        f"own={adjacency_count_bucket(values['target_own'])};"
        f"opp={adjacency_count_bucket(values['target_opp'])}"
    )


def move_target_pressure_delta(candidate_values, baseline_values, candidate_label):
    if not candidate_values or not baseline_values:
        return "missing"
    candidate_pressure = candidate_values["target_opp"] - candidate_values["target_own"]
    baseline_pressure = baseline_values["target_opp"] - baseline_values["target_own"]
    if candidate_pressure == baseline_pressure:
        return "same_target_pressure"
    if candidate_pressure < baseline_pressure:
        return f"{candidate_label}_less_pressured"
    return f"{candidate_label}_more_pressured"


def home_row_for_color(color):
    if color == "white":
        return BOARD_MAX_INDEX
    if color == "black":
        return 0
    return None


def center_distance(location):
    if location is None:
        return None
    center = BOARD_MAX_INDEX // 2
    return max(abs(location[0] - center), abs(location[1] - center))


def home_distance(location, active_color):
    home_row = home_row_for_color(active_color)
    if location is None or home_row is None:
        return None
    return abs(location[0] - home_row)


def row_band_from_home(location, active_color):
    distance = home_distance(location, active_color)
    if distance is None:
        return "unknown"
    if distance == 0:
        return "home_base"
    if distance <= 2:
        return "near_home"
    if distance <= 5:
        return "midfield"
    if distance <= 8:
        return "near_opp"
    return "opp_base"


def lane_bucket(location):
    if location is None:
        return "unknown"
    column = location[1]
    if column <= 1:
        return "left_flank"
    if column <= 3:
        return "left_inner"
    if column <= 6:
        return "center_lane"
    if column <= 8:
        return "right_inner"
    return "right_flank"


def signed_delta_bucket(value, positive_label, negative_label):
    if value is None:
        return "missing"
    if value >= 2:
        return f"{positive_label}2plus"
    if value == 1:
        return f"{positive_label}1"
    if value == 0:
        return "same"
    if value == -1:
        return f"{negative_label}1"
    return f"{negative_label}2plus"


def optional_delta(left, right):
    if left is None or right is None:
        return None
    return left - right


def move_goal_values(record, move_fen):
    locations = move_locations(move_fen)
    if not locations:
        return None
    active_color = active_color_name(record)
    source = locations[0]
    target = locations[-1]
    source_home_distance = home_distance(source, active_color)
    target_home_distance = home_distance(target, active_color)
    source_center_distance = center_distance(source)
    target_center_distance = center_distance(target)
    home_delta = None
    center_delta = None
    if source_home_distance is not None and target_home_distance is not None:
        home_delta = source_home_distance - target_home_distance
    if source_center_distance is not None and target_center_distance is not None:
        center_delta = source_center_distance - target_center_distance
    return {
        "intent_focus": intent_focus(move_intent_shape(record, move_fen)),
        "home_delta": home_delta,
        "center_delta": center_delta,
        "source_band": row_band_from_home(source, active_color),
        "target_band": row_band_from_home(target, active_color),
        "source_lane": lane_bucket(source),
        "target_lane": lane_bucket(target),
    }


def move_goal_shape(values):
    if not values:
        return "none"
    return (
        f"intent={values['intent_focus']};"
        f"home={signed_delta_bucket(values['home_delta'], 'closer_home', 'away_home')};"
        f"center={signed_delta_bucket(values['center_delta'], 'closer_center', 'away_center')};"
        f"band={values['source_band']}->{values['target_band']};"
        f"lane={values['source_lane']}->{values['target_lane']}"
    )


def move_goal_delta(candidate_values, baseline_values):
    if not candidate_values or not baseline_values:
        return "missing"
    home_delta = optional_delta(candidate_values["home_delta"], baseline_values["home_delta"])
    center_delta = optional_delta(candidate_values["center_delta"], baseline_values["center_delta"])
    return (
        f"home={signed_delta_bucket(home_delta, 'candidate_more_home', 'candidate_less_home')} "
        f"center={signed_delta_bucket(center_delta, 'candidate_more_center', 'candidate_less_center')}"
    )


def move_intent_shape(record, move_fen):
    locations = move_locations(move_fen)
    if not locations:
        return "none"
    board = game_board_tokens(record.get("board", ""))
    active_color = active_color_name(record)
    source = item_intent_profile(board.get(locations[0]), active_color)
    target = item_intent_profile(board.get(locations[-1]), active_color)
    flow = f"{move_shape_zone(locations[0])}->{move_shape_zone(locations[-1])}"
    return f"source={source};target={target};flow={flow}"


def intent_focus(intent):
    if intent in {"", "none"}:
        return "none"
    parts = {
        key: value
        for item in intent.split(";")
        if "=" in item
        for key, value in [item.split("=", 1)]
    }
    source = parts.get("source", "")
    target = parts.get("target", "")
    if "carry_high" in source or target == "free_high":
        return "high_value"
    if "regular" in source or "regular" in target:
        return "regular_mana"
    if "bomb" in source or "bomb" in target:
        return "bomb"
    if (
        "potion" in source
        or "potion" in target
        or "consumable" in source
        or "consumable" in target
    ):
        return "consumable"
    if target.startswith("opp_"):
        return "contact"
    if target == "empty":
        return "empty_target"
    return "other"


def move_intent_delta(candidate_intent, baseline_intent):
    if not candidate_intent or not baseline_intent:
        return "missing"
    if candidate_intent == baseline_intent:
        return "same_intent"
    candidate_focus = intent_focus(candidate_intent)
    baseline_focus = intent_focus(baseline_intent)
    if candidate_focus == baseline_focus:
        return f"same_focus_{candidate_focus}"
    return f"candidate_{candidate_focus}_baseline_{baseline_focus}"


def candidate_color_name(record):
    value = record.get("candidate_is_white", False)
    if isinstance(value, bool):
        return "white" if value else "black"
    return "white" if str(value).lower() == "true" else "black"


def game_score_pair(game_fen):
    fields = str(game_fen or "").split()
    if len(fields) not in {10, 11}:
        return None
    try:
        return {"white": int(fields[0]), "black": int(fields[1])}
    except ValueError:
        return None


def score_margin(game_fen, perspective_color):
    scores = game_score_pair(game_fen)
    if not scores or perspective_color not in {"white", "black"}:
        return None
    opponent = "black" if perspective_color == "white" else "white"
    return scores[perspective_color] - scores[opponent]


def margin_bucket(value):
    if value is None:
        return "missing"
    if value >= 2:
        return "lead2plus"
    if value == 1:
        return "lead1"
    if value == 0:
        return "even"
    if value == -1:
        return "trail1"
    return "trail2plus"


def swing_bucket(value):
    if value is None:
        return "missing"
    if value >= 2:
        return "plus2plus"
    if value == 1:
        return "plus1"
    if value == 0:
        return "same"
    if value == -1:
        return "minus1"
    return "minus2plus"


def balance_bucket(value):
    if value is None:
        return "missing"
    if value >= 3:
        return "own3plus"
    if value >= 1:
        return "own1_2"
    if value == 0:
        return "even"
    if value <= -3:
        return "opp3plus"
    return "opp1_2"


def item_carrier_side(item, perspective_color):
    if not item:
        return "empty"
    mon = item[:2]
    if mon == "xx":
        return "free"
    color = "white" if mon[:1].isupper() else "black"
    return relative_color(color, perspective_color)


def terminal_resource_scores(game_fen, perspective_color):
    custody = 0
    material = 0
    for item in game_board_tokens(game_fen).values():
        side = item_carrier_side(item, perspective_color)
        payload = item[2:]
        if side == "own":
            material += 1
        elif side == "opp":
            material -= 1
        if payload == "U":
            if side == "own":
                custody += 2
            elif side == "opp":
                custody -= 2
        elif payload in {"M", "m"}:
            if side == "own":
                custody += 1
            elif side == "opp":
                custody -= 1
    return {"custody": custody, "material": material}


def terminal_swing_values(record):
    perspective_color = candidate_color_name(record)
    baseline_final = record.get("baseline_final", "")
    candidate_final = record.get("candidate_final", "")
    baseline_margin = score_margin(baseline_final, perspective_color)
    candidate_margin = score_margin(candidate_final, perspective_color)
    score_swing = None
    if baseline_margin is not None and candidate_margin is not None:
        score_swing = candidate_margin - baseline_margin
    baseline_resources = terminal_resource_scores(baseline_final, perspective_color)
    candidate_resources = terminal_resource_scores(candidate_final, perspective_color)
    return {
        "baseline_margin": baseline_margin,
        "candidate_margin": candidate_margin,
        "score_swing": score_swing,
        "custody_swing": candidate_resources["custody"]
        - baseline_resources["custody"],
        "material_swing": candidate_resources["material"]
        - baseline_resources["material"],
    }


def source_board_values(record):
    perspective_color = candidate_color_name(record)
    board_fen = record.get("board", "")
    if not game_score_pair(board_fen):
        return None
    resources = terminal_resource_scores(board_fen, perspective_color)
    return {
        "margin": score_margin(board_fen, perspective_color),
        "custody": resources["custody"],
        "material": resources["material"],
        "actor": relative_color(active_color_name(record), perspective_color),
    }


def source_board_axes(record):
    values = source_board_values(record)
    if not values:
        return []
    return [
        f"source_board_margin {margin_bucket(values['margin'])}",
        (
            "source_board_resource_balance "
            f"custody={balance_bucket(values['custody'])} "
            f"material={balance_bucket(values['material'])}"
        ),
        f"source_board_actor {values['actor']}_to_move",
        (
            "source_board_margin_resource "
            f"margin={margin_bucket(values['margin'])} "
            f"custody={balance_bucket(values['custody'])}"
        ),
    ]


def split_policy_results(policy_results):
    results = {}
    for item in str(policy_results or "").split("|"):
        if "=" not in item:
            continue
        key, value = item.split("=", 1)
        if key:
            results[key] = value
    return results


def split_winning_policies(record):
    return [
        item
        for item in str(record.get("winning_policies", "") or "").split(",")
        if item
    ]


def count_bucket(value):
    if value <= 0:
        return "count0"
    if value == 1:
        return "count1"
    if value == 2:
        return "count2"
    return "count3plus"


def portfolio_support_axes(record):
    policy_results = split_policy_results(record.get("policy_results", ""))
    winners = split_winning_policies(record)
    baseline = record.get("baseline", "")
    candidate = record.get("candidate", "")
    candidate_winners = [winner for winner in winners if winner != baseline]
    baseline_result = policy_results.get(baseline, record.get("baseline_result", ""))
    candidate_result = policy_results.get(candidate, record.get("candidate_result", ""))
    candidate_supported = candidate in winners
    return [
        f"portfolio_winner_count {count_bucket(len(winners))}",
        f"portfolio_candidate_winner_count {count_bucket(len(candidate_winners))}",
        f"portfolio_candidate_supported {str(candidate_supported).lower()}",
        (
            "portfolio_support_shape "
            f"baseline={baseline_result} "
            f"candidate={candidate_result} "
            f"candidate_winners={count_bucket(len(candidate_winners))}"
        ),
    ]


def terminal_swing_axes(record, record_class):
    values = terminal_swing_values(record)
    axes = [
        f"terminal_score_swing {swing_bucket(values['score_swing'])}",
        f"terminal_candidate_margin {margin_bucket(values['candidate_margin'])}",
        f"terminal_baseline_margin {margin_bucket(values['baseline_margin'])}",
        (
            "terminal_resource_swing "
            f"custody={swing_bucket(values['custody_swing'])} "
            f"material={swing_bucket(values['material_swing'])}"
        ),
    ]
    if record_class not in {"candidate_better", "baseline_better"}:
        return axes

    preferred_margin = (
        values["baseline_margin"]
        if record_class == "baseline_better"
        else values["candidate_margin"]
    )
    preferred_score_swing = (
        None if values["score_swing"] is None else abs(values["score_swing"])
    )
    axes.extend(
        [
            f"terminal_preferred_margin {margin_bucket(preferred_margin)}",
            f"terminal_preferred_score_gap {swing_bucket(preferred_score_swing)}",
        ]
    )
    return axes


def corpus_move_shape_axes(record, record_class):
    baseline_shape = move_input_shape(record.get("baseline_move", ""))
    candidate_shape = move_input_shape(record.get("candidate_move", ""))
    if baseline_shape == "none" and candidate_shape == "none":
        return []

    axes = [
        f"first_move_candidate_shape shape={candidate_shape}",
        f"first_move_baseline_shape shape={baseline_shape}",
        f"first_move_shape_delta {move_shape_delta(candidate_shape, baseline_shape, 'candidate')}",
        f"first_move_shape_pair candidate={candidate_shape} baseline={baseline_shape}",
    ]
    if record_class not in {"candidate_better", "baseline_better"}:
        return axes

    if record_class == "baseline_better":
        preferred_shape = baseline_shape
        other_shape = candidate_shape
    else:
        preferred_shape = candidate_shape
        other_shape = baseline_shape

    axes.extend(
        [
            f"first_move_preferred_shape shape={preferred_shape}",
            f"first_move_preferred_delta {move_shape_delta(preferred_shape, other_shape, 'preferred')}",
        ]
    )
    return axes


def corpus_move_intent_axes(record, record_class):
    baseline_intent = move_intent_shape(record, record.get("baseline_move", ""))
    candidate_intent = move_intent_shape(record, record.get("candidate_move", ""))
    if baseline_intent == "none" and candidate_intent == "none":
        return []

    axes = [
        f"first_move_candidate_intent {candidate_intent}",
        f"first_move_baseline_intent {baseline_intent}",
        f"first_move_intent_delta {move_intent_delta(candidate_intent, baseline_intent)}",
    ]
    if record_class not in {"candidate_better", "baseline_better"}:
        return axes

    preferred_intent = baseline_intent if record_class == "baseline_better" else candidate_intent
    axes.extend(
        [
            f"first_move_preferred_intent {preferred_intent}",
            f"first_move_preferred_intent_focus {intent_focus(preferred_intent)}",
        ]
    )
    return axes


def corpus_move_local_pressure_axes(record, record_class):
    baseline_values = move_local_pressure_values(record, record.get("baseline_move", ""))
    candidate_values = move_local_pressure_values(record, record.get("candidate_move", ""))
    if not baseline_values and not candidate_values:
        return []

    baseline_intent = move_intent_shape(record, record.get("baseline_move", ""))
    candidate_intent = move_intent_shape(record, record.get("candidate_move", ""))
    baseline_target = move_target_pressure_shape(baseline_values)
    candidate_target = move_target_pressure_shape(candidate_values)
    axes = [
        f"first_move_candidate_pressure {move_local_pressure_shape(candidate_values)}",
        f"first_move_baseline_pressure {move_local_pressure_shape(baseline_values)}",
        (
            "first_move_candidate_target_pressure "
            f"focus={intent_focus(candidate_intent)} {candidate_target}"
        ),
        (
            "first_move_pressure_delta "
            f"{move_target_pressure_delta(candidate_values, baseline_values, 'candidate')}"
        ),
    ]
    if record_class not in {"candidate_better", "baseline_better"}:
        return axes

    if record_class == "baseline_better":
        preferred_values = baseline_values
        preferred_intent = baseline_intent
    else:
        preferred_values = candidate_values
        preferred_intent = candidate_intent
    axes.extend(
        [
            f"first_move_preferred_pressure {move_local_pressure_shape(preferred_values)}",
            (
                "first_move_preferred_target_pressure "
                f"focus={intent_focus(preferred_intent)} "
                f"{move_target_pressure_shape(preferred_values)}"
            ),
        ]
    )
    return axes


def corpus_move_goal_axes(record, record_class):
    baseline_values = move_goal_values(record, record.get("baseline_move", ""))
    candidate_values = move_goal_values(record, record.get("candidate_move", ""))
    if not baseline_values and not candidate_values:
        return []

    baseline_shape = move_goal_shape(baseline_values)
    candidate_shape = move_goal_shape(candidate_values)
    axes = [
        f"first_move_candidate_goal {candidate_shape}",
        f"first_move_baseline_goal {baseline_shape}",
        f"first_move_goal_delta {move_goal_delta(candidate_values, baseline_values)}",
    ]
    if record_class not in {"candidate_better", "baseline_better"}:
        return axes

    preferred_shape = baseline_shape if record_class == "baseline_better" else candidate_shape
    axes.append(f"first_move_preferred_goal {preferred_shape}")
    return axes


def corpus_record_axes(record, record_class):
    axes = []
    if record_class == "baseline_better":
        axes.extend(split_axis_field(record.get("baseline_better_mechanism_axes", "")))
    else:
        axes.extend(split_axis_field(record.get("mechanism_axes", "")))
    axes.extend(split_axis_field(record.get("timing_continuation_axes", "")))
    axes.extend(corpus_move_shape_axes(record, record_class))
    axes.extend(corpus_move_intent_axes(record, record_class))
    axes.extend(corpus_move_local_pressure_axes(record, record_class))
    axes.extend(corpus_move_goal_axes(record, record_class))
    axes.extend(source_board_axes(record))
    axes.extend(portfolio_support_axes(record))
    axes.extend(terminal_swing_axes(record, record_class))
    return axes or ["none"]


def corpus_axis_summary_state_key(record):
    return coverage_gap_group_key(record)


def cross_budget_seed_family(seed_tag, duel):
    seed_suffixes = {
        "vs_shipping_normal": "_vs_normal",
        "vs_shipping_fast": "_vs_fast",
    }
    suffix = seed_suffixes.get(duel, "")
    if suffix and seed_tag.endswith(suffix):
        return seed_tag[: -len(suffix)]
    return seed_tag


def cross_budget_axis_state_key(record):
    seed_family = cross_budget_seed_family(
        record.get("seed_tag", ""), record.get("duel", "")
    )
    return tuple(
        [
            record.get("panel", ""),
            seed_family,
            record.get("repeat", ""),
            record.get("opening_index", ""),
            record.get("variant", ""),
            record.get("candidate_is_white", ""),
        ]
    )


def cross_budget_axis_state_label(state_key):
    fields = [
        "panel",
        "seed_family",
        "repeat",
        "opening_index",
        "variant",
        "candidate_is_white",
    ]
    return " ".join(
        f"{field}={value}" for field, value in zip(fields, state_key)
    )


def corpus_record_branch(record):
    return f"{record.get('baseline_branch', '')}->{record.get('candidate_branch', '')}"


def corpus_record_pair(record):
    return f"{record.get('baseline_move', '')}->{record.get('candidate_move', '')}"


def new_corpus_axis_group(axis):
    return {
        "key": axis,
        "record_count": 0,
        "states": set(),
        "class_records": defaultdict(int),
        "class_states": defaultdict(set),
        "candidates": set(),
        "branches": set(),
        "pairs": set(),
        "panels": set(),
        "duels": set(),
        "variants": set(),
        "source_logs": set(),
    }


def add_corpus_axis_record(groups, event):
    record = event["data"]
    record_class = corpus_axis_record_class(record)
    state_key = corpus_axis_summary_state_key(record)
    for axis in corpus_record_axes(record, record_class):
        group = groups.setdefault(axis, new_corpus_axis_group(axis))
        group["record_count"] += 1
        group["states"].add(state_key)
        group["class_records"][record_class] += 1
        group["class_states"][record_class].add(state_key)
        group["candidates"].add(record.get("candidate", ""))
        group["branches"].add(corpus_record_branch(record))
        group["pairs"].add(corpus_record_pair(record))
        group["panels"].add(record.get("panel", ""))
        group["duels"].add(record.get("duel", ""))
        group["variants"].add(record.get("variant", ""))
        group["source_logs"].add(event["source_log"])


def corpus_axis_decision(row):
    candidate_states = row.get("candidate_better_states", 0)
    baseline_states = row.get("baseline_better_states", 0)
    no_policy_states = row.get("no_policy_states", 0)
    if no_policy_states > 0:
        return "coverage_gap_axis"
    if candidate_states > 0 and baseline_states > 0:
        return "baseline_save_risk"
    if candidate_states > 1:
        return "repeated_candidate_axis"
    if candidate_states == 1:
        return "singleton_candidate_axis"
    if baseline_states > 0:
        return "baseline_better_only"
    return "shared_or_neutral"


def summarize_corpus_axis_group(group):
    row = {
        "key": group["key"],
        "record_count": group["record_count"],
        "state_count": len(group["states"]),
        "candidate_count": len(group["candidates"]),
        "branch_count": len(group["branches"]),
        "pair_count": len(group["pairs"]),
        "panel_count": len(group["panels"]),
        "duel_count": len(group["duels"]),
        "variant_count": len(group["variants"]),
        "source_log_count": len(group["source_logs"]),
    }
    for record_class in [
        "candidate_better",
        "baseline_better",
        "no_policy",
        "same_outcome",
    ]:
        row[f"{record_class}_records"] = int(
            group["class_records"].get(record_class, 0)
        )
        row[f"{record_class}_states"] = len(
            group["class_states"].get(record_class, set())
        )
    row["axis_decision"] = corpus_axis_decision(row)
    return row


def top_corpus_axis_rows(rows, record_class, limit=8):
    state_field = f"{record_class}_states"
    record_field = f"{record_class}_records"
    return sorted(
        [row for row in rows if row.get(record_field, 0) > 0],
        key=lambda row: (
            -int(row.get(state_field, 0)),
            -int(row.get(record_field, 0)),
            row.get("key", ""),
        ),
    )[:limit]


def top_corpus_axis_decision_rows(rows, decision, limit=8):
    return sorted(
        [row for row in rows if row.get("axis_decision") == decision],
        key=lambda row: (
            -int(row.get("no_policy_states", 0)),
            -int(row.get("candidate_better_states", 0)),
            -int(row.get("baseline_better_states", 0)),
            -int(row.get("same_outcome_states", 0)),
            -int(row.get("state_count", 0)),
            row.get("key", ""),
        ),
    )[:limit]


def collect_corpus_axis_groups(events):
    groups = {}
    record_count = 0
    state_keys = set()
    class_records = defaultdict(int)
    class_states = defaultdict(set)
    for event in events:
        if event["event_type"] != "PRO_POLICY_MATRIX_CORPUS_RECORD":
            continue
        record = event["data"]
        record_count += 1
        state_key = corpus_axis_summary_state_key(record)
        state_keys.add(state_key)
        record_class = corpus_axis_record_class(record)
        class_records[record_class] += 1
        class_states[record_class].add(state_key)
        add_corpus_axis_record(groups, event)
    return groups, record_count, state_keys, class_records, class_states


def sorted_corpus_axis_rows(groups):
    rows = [summarize_corpus_axis_group(group) for group in groups.values()]
    return sorted(rows, key=lambda row: (-row["state_count"], row["key"]))


def corpus_axis_rows(events):
    groups, _, _, _, _ = collect_corpus_axis_groups(events)
    return sorted_corpus_axis_rows(groups)


def summarize_corpus_axes(events, limit=8):
    (
        groups,
        record_count,
        state_keys,
        class_records,
        class_states,
    ) = collect_corpus_axis_groups(events)
    rows = sorted_corpus_axis_rows(groups)
    axis_decision_counts = defaultdict(int)
    for row in rows:
        axis_decision_counts[row["axis_decision"]] += 1
    return {
        "record_count": record_count,
        "state_count": len(state_keys),
        "class_record_counts": sorted_count_rows(class_records),
        "class_state_counts": sorted_count_rows(
            {key: len(value) for key, value in class_states.items()}
        ),
        "axis_decision_counts": sorted_count_rows(axis_decision_counts),
        "top_axes_by_decision": {
            decision: top_corpus_axis_decision_rows(rows, decision, limit)
            for decision in sorted(axis_decision_counts)
        },
        "top_candidate_better_axes": top_corpus_axis_rows(
            rows, "candidate_better", limit
        ),
        "top_baseline_better_axes": top_corpus_axis_rows(
            rows, "baseline_better", limit
        ),
        "top_no_policy_axes": top_corpus_axis_rows(rows, "no_policy", limit),
        "top_same_outcome_axes": top_corpus_axis_rows(rows, "same_outcome", limit),
    }


def new_cross_budget_axis_group(axis, state_key, record):
    return {
        "key": axis,
        "state_key": state_key,
        "state_label": cross_budget_axis_state_label(state_key),
        "panel": record.get("panel", ""),
        "seed_family": state_key[1],
        "repeat": int(record.get("repeat", 0)),
        "opening_index": int(record.get("opening_index", 0)),
        "variant": record.get("variant", ""),
        "candidate_is_white": bool(record.get("candidate_is_white", False)),
        "record_count": 0,
        "class_records": defaultdict(int),
        "class_duels": defaultdict(set),
        "seed_tags": set(),
        "candidates": set(),
        "branches": set(),
        "pairs": set(),
        "duels": set(),
        "source_logs": set(),
    }


def add_cross_budget_axis_record(groups, event):
    record = event["data"]
    record_class = corpus_axis_record_class(record)
    state_key = cross_budget_axis_state_key(record)
    for axis in corpus_record_axes(record, record_class):
        group_key = (axis, state_key)
        group = groups.setdefault(
            group_key, new_cross_budget_axis_group(axis, state_key, record)
        )
        duel = record.get("duel", "")
        group["record_count"] += 1
        group["class_records"][record_class] += 1
        group["class_duels"][record_class].add(duel)
        group["seed_tags"].add(record.get("seed_tag", ""))
        group["candidates"].add(record.get("candidate", ""))
        group["branches"].add(corpus_record_branch(record))
        group["pairs"].add(corpus_record_pair(record))
        group["duels"].add(duel)
        group["source_logs"].add(event["source_log"])


def cross_budget_axis_decision(row):
    candidate_duels = row.get("candidate_better_duel_count", 0)
    baseline_duels = row.get("baseline_better_duel_count", 0)
    no_policy_duels = row.get("no_policy_duel_count", 0)
    if candidate_duels > 0 and baseline_duels > 0:
        return "budget_conflict"
    if no_policy_duels > 0 and candidate_duels > 0:
        return "partial_repair_coverage_gap"
    if no_policy_duels > 0:
        return "coverage_gap"
    if candidate_duels >= 3:
        return "all_budget_repair"
    if candidate_duels > 0:
        return "non_regressing_repair"
    if baseline_duels > 0:
        return "baseline_save_risk"
    return "shared_or_neutral"


def summarize_cross_budget_axis_group(group):
    row = {
        "key": group["key"],
        "state_key": group["state_key"],
        "state_label": group["state_label"],
        "panel": group["panel"],
        "seed_family": group["seed_family"],
        "seed_tag_count": len(group["seed_tags"]),
        "seed_tags": "|".join(sorted(group["seed_tags"])),
        "repeat": group["repeat"],
        "opening_index": group["opening_index"],
        "variant": group["variant"],
        "candidate_is_white": group["candidate_is_white"],
        "record_count": group["record_count"],
        "candidate_count": len(group["candidates"]),
        "candidates": "|".join(sorted(group["candidates"])),
        "branch_count": len(group["branches"]),
        "branches": "|".join(sorted(group["branches"])),
        "pair_count": len(group["pairs"]),
        "pairs": "|".join(sorted(group["pairs"])),
        "duel_count": len(group["duels"]),
        "duels": "|".join(sorted(group["duels"])),
        "source_log_count": len(group["source_logs"]),
        "source_logs": sorted(group["source_logs"]),
    }
    for record_class in [
        "candidate_better",
        "baseline_better",
        "no_policy",
        "same_outcome",
    ]:
        duels = group["class_duels"].get(record_class, set())
        row[f"{record_class}_records"] = int(
            group["class_records"].get(record_class, 0)
        )
        row[f"{record_class}_duel_count"] = len(duels)
        row[f"{record_class}_duels"] = "|".join(sorted(duels))
    row["cross_budget_decision"] = cross_budget_axis_decision(row)
    row["fragmented_dimensions"] = cross_budget_fragmented_dimensions(row)
    return row


def cross_budget_fragmented_dimensions(row):
    dimensions = []
    for field, dimension in [
        ("candidate_count", "candidate_policy"),
        ("branch_count", "branch"),
        ("pair_count", "first_move_pair"),
    ]:
        if int(row.get(field, 0)) > 1:
            dimensions.append(dimension)
    return "|".join(dimensions)


def future_only_axis(axis):
    value = str(axis or "")
    return value.startswith("terminal_") or value.startswith("portfolio_")


def cross_budget_source_status(row):
    if int(row.get("candidate_better_joined_states", 0)) <= 0:
        return "no_candidate_signal"
    if int(row.get("baseline_better_joined_states", 0)) > 0:
        return "baseline_save_risk"
    if int(row.get("no_policy_joined_states", 0)) > 0:
        return "coverage_gap"
    if future_only_axis(row.get("key", "")):
        return "future_only_no_source"
    if row.get("fragmented_dimensions", ""):
        return "fragmented_no_source"
    if int(row.get("all_budget_repair_joined_states", 0)) > 0:
        return "source_candidate_all_budget"
    if int(row.get("non_regressing_repair_joined_states", 0)) > 0:
        if int(row.get("candidate_better_joined_states", 0)) > 1:
            return "source_candidate_non_regressing"
        return "singleton_non_regressing"
    if int(row.get("candidate_better_joined_states", 0)) == 1:
        return "singleton_candidate"
    return "no_source"


def cross_budget_source_permission(status):
    if status.startswith("source_candidate_"):
        return "inspect_for_source"
    if status in {
        "baseline_save_risk",
        "coverage_gap",
        "fragmented_no_source",
        "future_only_no_source",
        "singleton_candidate",
        "singleton_non_regressing",
    }:
        return "no_source"
    return "postprocess_only"


def cross_budget_source_action(status):
    if status == "source_candidate_all_budget":
        return "inspect_all_budget_records"
    if status == "source_candidate_non_regressing":
        return "inspect_non_regressing_records"
    if status == "fragmented_no_source":
        return "keep_postprocess"
    if status == "baseline_save_risk":
        return "avoid_selector"
    if status == "coverage_gap":
        return "add_policy_or_root_feature"
    if status == "future_only_no_source":
        return "keep_outcome_diagnostic"
    if status in {"singleton_candidate", "singleton_non_regressing"}:
        return "widen_or_archive_singleton"
    return "try_next_slice"


def cross_budget_axis_row_sort_key(row):
    return (
        -int(row.get("duel_count", 0)),
        -int(row.get("candidate_better_duel_count", 0)),
        -int(row.get("baseline_better_duel_count", 0)),
        -int(row.get("no_policy_duel_count", 0)),
        -int(row.get("record_count", 0)),
        row.get("key", ""),
        row.get("state_label", ""),
    )


def top_cross_budget_axis_decision_rows(rows, decision, limit=8):
    return sorted(
        [row for row in rows if row.get("cross_budget_decision") == decision],
        key=cross_budget_axis_row_sort_key,
    )[:limit]


def new_cross_budget_axis_rollup(axis):
    return {
        "key": axis,
        "record_count": 0,
        "joined_states": set(),
        "duels": set(),
        "source_logs": set(),
        "candidates": set(),
        "branches": set(),
        "pairs": set(),
        "decisions": defaultdict(int),
        "decision_states": defaultdict(set),
        "class_states": defaultdict(set),
    }


def summarize_cross_budget_axis_rollups(rows):
    groups = {}
    for row in rows:
        group = groups.setdefault(row["key"], new_cross_budget_axis_rollup(row["key"]))
        state_key = tuple(row["state_key"])
        group["record_count"] += int(row.get("record_count", 0))
        group["joined_states"].add(state_key)
        for source_log in row.get("source_logs", []):
            group["source_logs"].add(source_log)
        for duel in row.get("duels", "").split("|"):
            if duel:
                group["duels"].add(duel)
        for candidate in row.get("candidates", "").split("|"):
            if candidate:
                group["candidates"].add(candidate)
        for branch in row.get("branches", "").split("|"):
            if branch:
                group["branches"].add(branch)
        for pair in row.get("pairs", "").split("|"):
            if pair:
                group["pairs"].add(pair)
        decision = row.get("cross_budget_decision", "")
        group["decisions"][decision] += 1
        group["decision_states"][decision].add(state_key)
        for record_class in [
            "candidate_better",
            "baseline_better",
            "no_policy",
            "same_outcome",
        ]:
            if int(row.get(f"{record_class}_duel_count", 0)) > 0:
                group["class_states"][record_class].add(state_key)

    rollups = []
    for group in groups.values():
        row = {
            "key": group["key"],
            "record_count": group["record_count"],
            "joined_state_count": len(group["joined_states"]),
            "duel_count": len(group["duels"]),
            "candidate_count": len(group["candidates"]),
            "branch_count": len(group["branches"]),
            "pair_count": len(group["pairs"]),
            "source_log_count": len(group["source_logs"]),
            "decision_counts": sorted_count_rows(group["decisions"]),
        }
        row["fragmented_dimensions"] = cross_budget_fragmented_dimensions(row)
        for decision, states in group["decision_states"].items():
            row[f"{decision}_joined_states"] = len(states)
        for record_class in [
            "candidate_better",
            "baseline_better",
            "no_policy",
            "same_outcome",
        ]:
            row[f"{record_class}_joined_states"] = len(
                group["class_states"].get(record_class, set())
            )
        row["source_status"] = cross_budget_source_status(row)
        row["source_permission"] = cross_budget_source_permission(
            row["source_status"]
        )
        row["source_action"] = cross_budget_source_action(row["source_status"])
        rollups.append(row)
    return rollups


def top_cross_budget_axis_rollups_by_decision(rollups, decision, limit=8):
    decision_field = f"{decision}_joined_states"
    return sorted(
        [row for row in rollups if int(row.get(decision_field, 0)) > 0],
        key=lambda row: (
            -int(row.get(decision_field, 0)),
            -int(row.get("joined_state_count", 0)),
            -int(row.get("record_count", 0)),
            row.get("key", ""),
        ),
    )[:limit]


def cross_budget_source_candidate_rows(rollups, limit=8):
    return sorted(
        [
            row
            for row in rollups
            if row.get("source_status", "").startswith("source_candidate_")
        ],
        key=lambda row: (
            -int(row.get("all_budget_repair_joined_states", 0)),
            -int(row.get("non_regressing_repair_joined_states", 0)),
            -int(row.get("candidate_better_joined_states", 0)),
            -int(row.get("joined_state_count", 0)),
            row.get("key", ""),
        ),
    )[:limit]


def blocked_cross_budget_candidate_rows(rollups, limit=8):
    return sorted(
        [
            row
            for row in rollups
            if int(row.get("candidate_better_joined_states", 0)) > 0
            and not row.get("source_status", "").startswith("source_candidate_")
        ],
        key=lambda row: (
            -int(row.get("candidate_better_joined_states", 0)),
            row.get("source_status", ""),
            -int(row.get("baseline_better_joined_states", 0)),
            -int(row.get("no_policy_joined_states", 0)),
            -int(row.get("pair_count", 0)),
            row.get("key", ""),
        ),
    )[:limit]


def collect_cross_budget_axis_groups(events):
    groups = {}
    record_count = 0
    joined_state_keys = set()
    class_records = defaultdict(int)
    class_joined_states = defaultdict(set)
    for event in events:
        if event["event_type"] != "PRO_POLICY_MATRIX_CORPUS_RECORD":
            continue
        record = event["data"]
        record_count += 1
        state_key = cross_budget_axis_state_key(record)
        joined_state_keys.add(state_key)
        record_class = corpus_axis_record_class(record)
        class_records[record_class] += 1
        class_joined_states[record_class].add(state_key)
        add_cross_budget_axis_record(groups, event)
    return groups, record_count, joined_state_keys, class_records, class_joined_states


def sorted_cross_budget_axis_state_rows(groups):
    rows = [summarize_cross_budget_axis_group(group) for group in groups.values()]
    return sorted(rows, key=cross_budget_axis_row_sort_key)


def cross_budget_axis_state_rows(events):
    groups, _, _, _, _ = collect_cross_budget_axis_groups(events)
    return sorted_cross_budget_axis_state_rows(groups)


def summarize_cross_budget_axes(events, limit=8):
    (
        groups,
        record_count,
        joined_state_keys,
        class_records,
        class_joined_states,
    ) = collect_cross_budget_axis_groups(events)
    rows = sorted_cross_budget_axis_state_rows(groups)
    decision_counts = defaultdict(int)
    for row in rows:
        decision_counts[row["cross_budget_decision"]] += 1
    rollups = summarize_cross_budget_axis_rollups(rows)
    source_status_counts = defaultdict(int)
    for row in rollups:
        source_status_counts[row["source_status"]] += 1

    return {
        "record_count": record_count,
        "joined_state_count": len(joined_state_keys),
        "axis_state_group_count": len(rows),
        "class_record_counts": sorted_count_rows(class_records),
        "class_joined_state_counts": sorted_count_rows(
            {key: len(value) for key, value in class_joined_states.items()}
        ),
        "cross_budget_decision_counts": sorted_count_rows(decision_counts),
        "source_status_counts": sorted_count_rows(source_status_counts),
        "source_candidate_rollups": cross_budget_source_candidate_rows(
            rollups, limit
        ),
        "blocked_candidate_rollups": blocked_cross_budget_candidate_rows(
            rollups, limit
        ),
        "top_axes_by_decision": {
            decision: top_cross_budget_axis_decision_rows(rows, decision, limit)
            for decision in sorted(decision_counts)
        },
        "top_axis_rollups_by_decision": {
            decision: top_cross_budget_axis_rollups_by_decision(
                rollups, decision, limit
            )
            for decision in sorted(decision_counts)
        },
    }


def record_axis_filter_tokens(record_axis_filter):
    if not record_axis_filter or record_axis_filter == "all":
        return []
    return [token.strip() for token in record_axis_filter.split(",") if token.strip()]


def record_axis_filter_text(record):
    return "|".join(
        value
        for value in [
            record.get("mechanism_axes", ""),
            record.get("baseline_better_mechanism_axes", ""),
            record.get("timing_continuation_axes", ""),
        ]
        if value
    )


def new_axis_filter_match_group(token):
    group = new_corpus_axis_group(token)
    group["axis_filter"] = token
    return group


def add_axis_filter_match_record(group, record, event):
    record_class = corpus_axis_record_class(record)
    state_key = corpus_axis_summary_state_key(record)
    group["record_count"] += 1
    group["states"].add(state_key)
    group["class_records"][record_class] += 1
    group["class_states"][record_class].add(state_key)
    group["candidates"].add(record.get("candidate", ""))
    group["branches"].add(corpus_record_branch(record))
    group["pairs"].add(corpus_record_pair(record))
    group["panels"].add(record.get("panel", ""))
    group["duels"].add(record.get("duel", ""))
    group["variants"].add(record.get("variant", ""))
    group["source_logs"].add(event["source_log"])


def summarize_record_axis_filter_matches(events, record_axis_filter):
    tokens = record_axis_filter_tokens(record_axis_filter)
    if not tokens:
        return []
    groups = {token: new_axis_filter_match_group(token) for token in tokens}
    for event in events:
        if event["event_type"] != "PRO_POLICY_MATRIX_CORPUS_RECORD":
            continue
        record = event["data"]
        axis_text = record_axis_filter_text(record)
        for token, group in groups.items():
            if token in axis_text:
                add_axis_filter_match_record(group, record, event)
    return [summarize_corpus_axis_group(groups[token]) for token in tokens]


def opening_state_group_key(record):
    return tuple(
        record.get(field, "")
        for field in [
            "panel",
            "duel",
            "seed_tag",
            "repeat",
            "opening_index",
            "variant",
        ]
    )


def new_corpus_state_group(record):
    return {
        "key": coverage_gap_group_key(record),
        "panel": record.get("panel", ""),
        "duel": record.get("duel", ""),
        "seed_tag": record.get("seed_tag", ""),
        "repeat": int(record.get("repeat", 0)),
        "opening_index": int(record.get("opening_index", 0)),
        "variant": record.get("variant", ""),
        "candidate_is_white": bool(record.get("candidate_is_white", False)),
        "opening": record.get("opening", ""),
        "policy_results": record.get("policy_results", ""),
        "winning_policies": record.get("winning_policies", ""),
        "source_logs": set(),
        "candidates": set(),
        "outcomes": defaultdict(int),
        "portfolio_classes": defaultdict(int),
        "branches": defaultdict(int),
        "pairs": defaultdict(int),
        "mechanism_axes": defaultdict(int),
        "timing_continuation_axes": defaultdict(int),
        "divergences": {},
        "record_count": 0,
    }


def add_record_to_state_group(group, record, event):
    group["record_count"] += 1
    group["source_logs"].add(event["source_log"])
    group["candidates"].add(record.get("candidate", ""))
    group["outcomes"][record.get("outcome", "")] += 1
    group["portfolio_classes"][record.get("portfolio_class", "")] += 1

    branch = corpus_record_branch(record)
    pair = corpus_record_pair(record)
    group["branches"][branch] += 1
    group["pairs"][pair] += 1
    mechanism_axes = record.get("mechanism_axes", "")
    if mechanism_axes:
        for axis in mechanism_axes.split("|"):
            if axis:
                group["mechanism_axes"][axis] += 1
    else:
        group["mechanism_axes"]["none"] += 1
    timing_continuation_axes = record.get("timing_continuation_axes", "")
    if timing_continuation_axes:
        for axis in timing_continuation_axes.split("|"):
            if axis:
                group["timing_continuation_axes"][axis] += 1
    else:
        group["timing_continuation_axes"]["none"] += 1

    first_diff_ply = int(record.get("first_diff_ply", -1))
    if first_diff_ply < 0:
        return

    divergence_key = (
        record.get("candidate", ""),
        first_diff_ply,
        branch,
        pair,
    )
    group["divergences"].setdefault(
        divergence_key,
        {
            "candidate": record.get("candidate", ""),
            "outcome": record.get("outcome", ""),
            "portfolio_class": record.get("portfolio_class", ""),
            "first_diff_ply": first_diff_ply,
            "branch": branch,
            "pair": pair,
            "active_color": record.get("active_color", ""),
            "turn": int(record.get("turn", -1)),
            "mons_moves": int(record.get("mons_moves", -1)),
            "can_action": bool(record.get("can_action", False)),
            "can_mana": bool(record.get("can_mana", False)),
            "exact_context": record.get("exact_context", ""),
            "board": record.get("board", ""),
            "baseline_move": record.get("baseline_move", ""),
            "candidate_move": record.get("candidate_move", ""),
            "mechanism_axes": record.get("mechanism_axes", ""),
            "timing_continuation_axes": record.get("timing_continuation_axes", ""),
        },
    )


def add_corpus_state_record(groups, event):
    record = event["data"]
    key = coverage_gap_group_key(record)
    group = groups.setdefault(key, new_corpus_state_group(record))
    add_record_to_state_group(group, record, event)


def add_coverage_gap_record(groups, event):
    record = event["data"]
    if record.get("portfolio_class") != "no_policy_win":
        return

    key = coverage_gap_group_key(record)
    group = groups.setdefault(
        key,
        {
            "key": key,
            "panel": record.get("panel", ""),
            "duel": record.get("duel", ""),
            "seed_tag": record.get("seed_tag", ""),
            "repeat": int(record.get("repeat", 0)),
            "opening_index": int(record.get("opening_index", 0)),
            "variant": record.get("variant", ""),
            "candidate_is_white": bool(record.get("candidate_is_white", False)),
            "opening": record.get("opening", ""),
            "policy_results": record.get("policy_results", ""),
            "winning_policies": record.get("winning_policies", ""),
            "source_logs": set(),
            "candidates": set(),
            "outcomes": defaultdict(int),
            "portfolio_classes": defaultdict(int),
            "branches": defaultdict(int),
            "pairs": defaultdict(int),
            "mechanism_axes": defaultdict(int),
            "timing_continuation_axes": defaultdict(int),
            "divergences": {},
            "record_count": 0,
        },
    )

    add_record_to_state_group(group, record, event)


def sorted_divergences(group):
    return sorted(
        group["divergences"].values(),
        key=lambda item: (
            item["first_diff_ply"],
            item["candidate"],
            item["branch"],
            item["pair"],
        ),
    )


def summarize_corpus_state_group(group, divergence_limit=3):
    branches = dict(group["branches"])
    pairs = dict(group["pairs"])
    divergences = sorted_divergences(group)
    return {
        "candidate_is_white": group["candidate_is_white"],
        "opening": group["opening"],
        "policy_results": group["policy_results"],
        "winning_policies": group["winning_policies"],
        "source_logs": sorted(group["source_logs"]),
        "record_count": group["record_count"],
        "candidate_count": len(group["candidates"]),
        "candidates": "|".join(sorted(group["candidates"])),
        "portfolio_class_counts": sorted_count_rows(group["portfolio_classes"]),
        "outcome_counts": sorted_count_rows(group["outcomes"]),
        "branch_count": len(branches),
        "branches": limited_count_rows(branches),
        "pair_count": len(pairs),
        "pairs": limited_count_rows(pairs),
        "top_mechanism_axes": limited_count_rows(group["mechanism_axes"], 5),
        "top_timing_continuation_axes": limited_count_rows(
            group["timing_continuation_axes"], 5
        ),
        "first_diff_count": len(divergences),
        "divergences": divergences[:divergence_limit],
    }


def coverage_gap_sibling_states(group, corpus_state_groups):
    opening_key = opening_state_group_key(group)
    siblings = []
    for key, state_group in corpus_state_groups.items():
        if opening_state_group_key(state_group) != opening_key:
            continue
        if key == group["key"]:
            continue
        siblings.append(summarize_corpus_state_group(state_group))
    return sorted(
        siblings,
        key=lambda item: (
            str(item["candidate_is_white"]),
            item["winning_policies"],
            item["record_count"],
        ),
    )


def sorted_coverage_gap_entries(groups, corpus_state_groups):
    entries = []
    for group in groups.values():
        entry = summarize_corpus_state_group(group, divergence_limit=5)
        sibling_states = coverage_gap_sibling_states(group, corpus_state_groups)
        entry.update(
            {
                "panel": group["panel"],
                "duel": group["duel"],
                "seed_tag": group["seed_tag"],
                "repeat": group["repeat"],
                "opening_index": group["opening_index"],
                "variant": group["variant"],
                "same_opening_sibling_state_count": len(sibling_states),
                "same_opening_sibling_states": sibling_states,
            }
        )
        entries.append(entry)

    return sorted(
        entries,
        key=lambda item: (
            item["panel"],
            item["duel"],
            item["seed_tag"],
            item["repeat"],
            item["opening_index"],
            item["variant"],
            str(item["candidate_is_white"]),
        ),
    )


def coverage_gap_entries_from_events(events):
    coverage_gap_groups = {}
    corpus_state_groups = {}
    for event in events:
        if event["event_type"] != "PRO_POLICY_MATRIX_CORPUS_RECORD":
            continue
        add_corpus_state_record(corpus_state_groups, event)
        add_coverage_gap_record(coverage_gap_groups, event)
    return sorted_coverage_gap_entries(coverage_gap_groups, corpus_state_groups)


def normalized_policy_decision_row(event):
    record = event["data"]
    record_class = corpus_axis_record_class(record)
    return {
        **record,
        "row_type": "policy_decision",
        "source_log": event["source_log"],
        "source_line": event["source_line"],
        "state_id": corpus_state_id(record),
        "cross_budget_state_id": cross_budget_state_id(record),
        "record_class": record_class,
        "active_axes": corpus_record_axes(record, record_class),
        "mechanism_axes": split_axis_field(record.get("mechanism_axes", "")),
        "baseline_better_mechanism_axes": split_axis_field(
            record.get("baseline_better_mechanism_axes", "")
        ),
        "timing_continuation_axes": split_axis_field(
            record.get("timing_continuation_axes", "")
        ),
        "branch": corpus_record_branch(record),
        "pair": corpus_record_pair(record),
    }


def policy_axis_items(record, record_class):
    mechanism_axes = split_axis_field(record.get("mechanism_axes", ""))
    baseline_better_axes = split_axis_field(
        record.get("baseline_better_mechanism_axes", "")
    )
    timing_axes = split_axis_field(record.get("timing_continuation_axes", ""))
    primary_axes = (
        baseline_better_axes if record_class == "baseline_better" else mechanism_axes
    )
    primary_source = (
        "baseline_better_mechanism"
        if record_class == "baseline_better"
        else "mechanism"
    )
    items = [(axis, primary_source) for axis in primary_axes]
    items.extend((axis, "timing_continuation") for axis in timing_axes)
    items.extend(
        (axis, "first_move_shape")
        for axis in corpus_move_shape_axes(record, record_class)
    )
    items.extend(
        (axis, "first_move_intent")
        for axis in corpus_move_intent_axes(record, record_class)
    )
    items.extend(
        (axis, "first_move_local_pressure")
        for axis in corpus_move_local_pressure_axes(record, record_class)
    )
    items.extend(
        (axis, "first_move_goal")
        for axis in corpus_move_goal_axes(record, record_class)
    )
    items.extend((axis, "source_board") for axis in source_board_axes(record))
    items.extend((axis, "portfolio_support") for axis in portfolio_support_axes(record))
    items.extend(
        (axis, "terminal_outcome")
        for axis in terminal_swing_axes(record, record_class)
    )
    return items or [("none", "missing")]


def normalized_policy_axis_rows(event):
    record = event["data"]
    record_class = corpus_axis_record_class(record)
    base = {
        "row_type": "policy_axis",
        "source_log": event["source_log"],
        "source_line": event["source_line"],
        "state_id": corpus_state_id(record),
        "cross_budget_state_id": cross_budget_state_id(record),
        "record_class": record_class,
        "panel": record.get("panel", ""),
        "duel": record.get("duel", ""),
        "seed_tag": record.get("seed_tag", ""),
        "seed_family": cross_budget_seed_family(
            record.get("seed_tag", ""), record.get("duel", "")
        ),
        "repeat": int(record.get("repeat", 0)),
        "opening_index": int(record.get("opening_index", 0)),
        "variant": record.get("variant", ""),
        "candidate_is_white": bool(record.get("candidate_is_white", False)),
        "baseline": record.get("baseline", ""),
        "candidate": record.get("candidate", ""),
        "portfolio_class": record.get("portfolio_class", ""),
        "outcome": record.get("outcome", ""),
        "branch": corpus_record_branch(record),
        "pair": corpus_record_pair(record),
        "first_diff_ply": int(record.get("first_diff_ply", -1)),
    }
    return [
        {
            **base,
            "axis": axis,
            "axis_source": axis_source,
        }
        for axis, axis_source in policy_axis_items(record, record_class)
    ]


def normalized_cross_budget_axis_row(row):
    return {
        "row_type": "cross_budget_axis_state",
        "cross_budget_state_id": cross_budget_state_id_from_key(row["state_key"]),
        **row,
    }


def normalized_cross_budget_rollup_row(row):
    return {
        "row_type": "cross_budget_axis_rollup",
        **row,
    }


def normalized_corpus_axis_summary_row(row):
    return {
        "row_type": "corpus_axis_summary",
        **row,
    }


def normalized_coverage_gap_state_row(entry):
    state_record = {
        field: entry.get(field, "") for field in CORPUS_STATE_FIELDS
    }
    return {
        "row_type": "coverage_gap_state",
        "state_id": corpus_state_id(state_record),
        **entry,
    }


def root_origin_profile(record):
    kinds = {
        item
        for item in str(record.get("origin_kinds", "") or "").split("|")
        if item
    }
    source_kinds = sorted(kinds - {"policy_output", "winning_policy_output"})
    has_policy_output = "policy_output" in kinds or "winning_policy_output" in kinds
    live_value = record.get("live", False)
    live = live_value if isinstance(live_value, bool) else str(live_value).lower() == "true"
    if source_kinds:
        parts = source_kinds.copy()
        if has_policy_output:
            parts.append("policy")
        return "+".join(parts)
    if has_policy_output:
        return "policy_only" if live else "omitted_policy"
    return "other"


def normalized_pro_v4_root_pool_row(event, row_type):
    record = event["data"]
    state_record = {field: record.get(field, "") for field in CORPUS_STATE_FIELDS}
    root_input_values = move_goal_values(record, record.get("inputs", ""))
    return {
        **record,
        "row_type": row_type,
        "source_log": event["source_log"],
        "source_line": event["source_line"],
        "state_id": corpus_state_id(state_record),
        "cross_budget_state_id": cross_budget_state_id(state_record),
        "root_origin_profile": root_origin_profile(record),
        "root_input_goal": move_goal_shape(root_input_values),
    }


def build_jsonl_rows(events):
    rows = []
    for event in events:
        if event["event_type"] != "PRO_POLICY_MATRIX_CORPUS_RECORD":
            continue
        rows.append(normalized_policy_decision_row(event))
        rows.extend(normalized_policy_axis_rows(event))
    for event in events:
        if event["event_type"] == "PRO_POLICY_MATRIX_PROV4_ROOT_POOL_SUMMARY":
            rows.append(normalized_pro_v4_root_pool_row(event, "pro_v4_root_pool_summary"))
        elif event["event_type"] == "PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT":
            rows.append(normalized_pro_v4_root_pool_row(event, "pro_v4_root_pool_root"))

    rows.extend(
        normalized_corpus_axis_summary_row(row) for row in corpus_axis_rows(events)
    )
    cross_budget_rows = cross_budget_axis_state_rows(events)
    rows.extend(normalized_cross_budget_axis_row(row) for row in cross_budget_rows)
    rows.extend(
        normalized_cross_budget_rollup_row(row)
        for row in summarize_cross_budget_axis_rollups(cross_budget_rows)
    )
    rows.extend(
        normalized_coverage_gap_state_row(entry)
        for entry in coverage_gap_entries_from_events(events)
    )
    return rows


def write_jsonl_rows(path, rows):
    row_type_counts = defaultdict(int)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            row_type_counts[row.get("row_type", "unknown")] += 1
            json.dump(row, handle, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
    return {
        "path": str(path),
        "rows": sum(row_type_counts.values()),
        "row_type_counts": sorted_count_rows(row_type_counts),
    }


def split_pipe_field(value):
    return [item for item in str(value or "").split("|") if item]


def summarize_pro_v4_root_pool(events, limit=8):
    summaries = [
        event["data"]
        for event in events
        if event["event_type"] == "PRO_POLICY_MATRIX_PROV4_ROOT_POOL_SUMMARY"
    ]
    roots = [
        event["data"]
        for event in events
        if event["event_type"] == "PRO_POLICY_MATRIX_PROV4_ROOT_POOL_ROOT"
    ]
    if not summaries and not roots:
        return {
            "summary_count": 0,
            "root_count": 0,
            "source_permission": "not_run",
        }

    origin_kind_counts = defaultdict(int)
    origin_counts = defaultdict(int)
    policy_counts = defaultdict(int)
    portfolio_class_counts = defaultdict(int)
    outcome_counts = defaultdict(int)
    winning_root_field_counts = defaultdict(lambda: defaultdict(int))
    candidate_only_winning_root_field_counts = defaultdict(lambda: defaultdict(int))
    live_count = 0
    omitted_policy_root_count = 0
    winning_policy_root_count = 0
    winning_policy_live_root_count = 0
    for root in roots:
        kinds = split_pipe_field(root.get("origin_kinds", ""))
        origins = split_pipe_field(root.get("origins", ""))
        policies = split_pipe_field(root.get("policies", ""))
        for kind in kinds:
            origin_kind_counts[kind] += 1
        for origin in origins:
            origin_counts[origin] += 1
        for policy in policies:
            policy_counts[policy] += 1
        portfolio_class_counts[root.get("portfolio_class", "")] += 1
        outcome_counts[root.get("outcome", "")] += 1
        live = bool(root.get("live", False))
        if live:
            live_count += 1
        if "policy_output" in kinds and not live:
            omitted_policy_root_count += 1
        if "winning_policy_output" in kinds:
            winning_policy_root_count += 1
            if live:
                winning_policy_live_root_count += 1
            for field in [
                "family",
                "rank_bucket",
                "advisor_bucket",
                "path",
                "progress",
                "safety_detail",
                "reply_risk",
                "post_turn_status",
                "post_exact_pressure",
                "post_exact_delta",
                "post_exact_score_profile",
                "post_exact_score_profile_delta",
                "post_mana_identity_profile",
                "post_mana_identity_profile_delta",
                "post_edge_anchor_profile",
                "post_edge_anchor_profile_delta",
                "post_item_zone_profile",
                "post_item_zone_profile_delta",
                "post_objective_proximity_profile",
                "post_objective_proximity_profile_delta",
                "post_objective_control_profile",
                "post_objective_control_profile_delta",
                "post_objective_square_profile",
                "post_objective_square_profile_delta",
                "post_high_value_custody",
                "post_high_value_delta",
                "post_own_regular_custody",
                "post_own_regular_delta",
                "post_mon_material",
                "post_mon_material_delta",
                "post_cooldown_tempo",
                "post_cooldown_tempo_delta",
                "post_scoreboard",
                "post_score_delta",
                "post_turn_budget",
                "post_turn_budget_delta",
                "post_score_term_profile",
                "post_score_term_profile_delta",
                "post_legal_fanout",
                "post_legal_fanout_delta",
                "post_followup_shape",
                "post_followup_effect",
                "post_followup_role_profile",
                "post_followup_role_profile_delta",
                "post_followup_payload_profile",
                "post_followup_payload_profile_delta",
                "post_attack_exposure",
                "post_attack_exposure_delta",
                "post_support_guard",
                "post_support_guard_delta",
                "post_objective_screen",
                "post_objective_screen_delta",
                "post_drainer_geometry",
                "post_drainer_geometry_delta",
                "post_role_coordination",
                "post_role_coordination_delta",
                "post_formation_balance",
                "post_formation_balance_delta",
                "post_role_deployment",
                "post_role_deployment_delta",
                "post_role_pressure",
                "post_role_pressure_delta",
                "post_role_contact",
                "post_role_contact_delta",
                "post_cohesion",
                "post_cohesion_delta",
                "post_territory",
                "post_territory_delta",
                "post_control_map",
                "post_control_map_delta",
                "post_mana_path",
                "post_mana_path_delta",
                "post_mana_contest",
                "post_mana_contest_delta",
                "post_pickup_access",
                "post_pickup_access_delta",
                "post_mana_base",
                "post_mana_base_delta",
                "post_pool_access",
                "post_pool_access_delta",
                "post_carrier_route",
                "post_carrier_route_delta",
                "post_carrier_score_profile",
                "post_carrier_score_profile_delta",
                "post_carrier_contact",
                "post_carrier_contact_delta",
                "post_carrier_action_profile",
                "post_carrier_action_profile_delta",
                "post_carrier_escape",
                "post_carrier_escape_delta",
                "post_consumable",
                "post_consumable_delta",
                "post_bomb_threat_profile",
                "post_bomb_threat_profile_delta",
                "post_potion_stock",
                "post_potion_stock_delta",
                "post_consumable_base",
                "post_consumable_base_delta",
                "post_engagement",
                "post_engagement_delta",
                "post_mobility",
                "post_mobility_delta",
                "post_role_mobility",
                "post_role_mobility_delta",
                "post_role_escape",
                "post_role_escape_delta",
                "post_action_threat",
                "post_action_threat_delta",
                "post_action_target_profile",
                "post_action_target_profile_delta",
                "post_spirit_item_profile",
                "post_spirit_item_profile_delta",
                "post_spirit_handoff_profile",
                "post_spirit_handoff_profile_delta",
                "post_action_role_profile",
                "post_action_role_profile_delta",
                "post_action_guard_profile",
                "post_action_guard_profile_delta",
                "post_action_actor_profile",
                "post_action_actor_profile_delta",
                "post_action_actor_safety_profile",
                "post_action_actor_safety_profile_delta",
                "post_action_zone_profile",
                "post_action_zone_profile_delta",
                "post_action_payload_profile",
                "post_action_payload_profile_delta",
                "post_action_escape_profile",
                "post_action_escape_profile_delta",
                "post_action_counter_profile",
                "post_action_counter_profile_delta",
                "post_action_target_safety_profile",
                "post_action_target_safety_profile_delta",
                "post_action_score_profile",
                "post_action_score_profile_delta",
                "post_action_denial_profile",
                "post_action_denial_profile_delta",
                "post_action_pickup_profile",
                "post_action_pickup_profile_delta",
                "post_action_square_profile",
                "post_action_square_profile_delta",
                "post_action_vector_profile",
                "post_action_vector_profile_delta",
                "post_demon_line_blocker",
                "post_demon_line_blocker_delta",
                "post_action_fork_profile",
                "post_action_fork_profile_delta",
                "post_action_reach",
                "post_action_reach_delta",
                "post_step_threat",
                "post_step_threat_delta",
                "post_role_state",
                "post_role_state_delta",
                "post_base_recovery",
                "post_base_recovery_delta",
                "post_lane_shape",
                "post_lane_shape_delta",
                "root_sequence",
                "root_transition",
                "root_transition_effect",
                "worst_reply_transition",
                "worst_reply_effect",
                "post_reply_reversal_profile",
            ]:
                winning_root_field_counts[field][root.get(field, "")] += 1
                if root.get("portfolio_class", "") == "candidate_only_win":
                    candidate_only_winning_root_field_counts[field][
                        root.get(field, "")
                    ] += 1

    return {
        "summary_count": len(summaries),
        "root_count": len(roots),
        "source_permission": "diagnostic_only",
        "live_root_count": live_count,
        "omitted_policy_root_count": omitted_policy_root_count,
        "winning_policy_root_count": winning_policy_root_count,
        "winning_policy_live_root_count": winning_policy_live_root_count,
        "summary_root_counts": {
            "root_count": sum(int(row.get("root_count", 0)) for row in summaries),
            "live_root_count": sum(int(row.get("live_root_count", 0)) for row in summaries),
            "policy_root_count": sum(int(row.get("policy_root_count", 0)) for row in summaries),
            "winning_policy_root_count": sum(
                int(row.get("winning_policy_root_count", 0)) for row in summaries
            ),
            "omitted_policy_root_count": sum(
                int(row.get("omitted_policy_root_count", 0)) for row in summaries
            ),
        },
        "portfolio_class_counts": sorted_count_rows(portfolio_class_counts),
        "outcome_counts": sorted_count_rows(outcome_counts),
        "origin_kind_counts": sorted_count_rows(origin_kind_counts),
        "winning_root_field_counts": {
            field: sorted_count_rows(counts)
            for field, counts in sorted(winning_root_field_counts.items())
        },
        "candidate_only_winning_root_field_counts": {
            field: sorted_count_rows(counts)
            for field, counts in sorted(candidate_only_winning_root_field_counts.items())
        },
        "top_origins": sorted_count_rows(origin_counts)[:limit],
        "top_policy_outputs": sorted_count_rows(policy_counts)[:limit],
    }


def summarize(events):
    latest = {}
    route_buckets = defaultdict(list)
    filter_summaries = {}
    filter_details = defaultdict(list)
    coverage_gap_groups = {}
    corpus_state_groups = {}
    event_counts = defaultdict(int)

    for event in events:
        event_type = event["event_type"]
        data = event["data"]
        event_counts[event_type] += 1
        if event_type in {
            "PRO_POLICY_MATRIX_GLOBAL_SUMMARY",
            "PRO_POLICY_MATRIX_GLOBAL_STOPLIGHT",
            "PRO_POLICY_MATRIX_GLOBAL_ROUTE_RECOMMENDATION",
        }:
            latest[event_type] = data
        elif event_type == "PRO_POLICY_MATRIX_GLOBAL_ROUTE_BUCKET":
            route_buckets[data.get("bucket", "unknown")].append(data)
        elif event_type == "PRO_POLICY_MATRIX_RECORD_FILTER_SUMMARY":
            filter_summaries[data.get("record_axis_filter", "")] = data
        elif event_type == "PRO_POLICY_MATRIX_RECORD_FILTER_DETAIL":
            filter_details[data.get("record_axis_filter", "")].append(data)
        elif event_type == "PRO_POLICY_MATRIX_CORPUS_RECORD":
            add_corpus_state_record(corpus_state_groups, event)
            add_coverage_gap_record(coverage_gap_groups, event)

    recommendation = latest.get("PRO_POLICY_MATRIX_GLOBAL_ROUTE_RECOMMENDATION", {})
    global_summary = latest.get("PRO_POLICY_MATRIX_GLOBAL_SUMMARY", {})
    stoplight = latest.get("PRO_POLICY_MATRIX_GLOBAL_STOPLIGHT", {})
    filters = []
    for record_axis_filter, filter_summary in sorted(filter_summaries.items()):
        details = sorted_details(filter_details.get(record_axis_filter, []))
        filters.append(
            {
                "record_axis_filter": record_axis_filter,
                "permission": permission_from_filter_summary(filter_summary),
                "summary": filter_summary,
                "details": details,
                "axis_filter_matches": summarize_record_axis_filter_matches(
                    events, record_axis_filter
                ),
            }
        )

    decision = corpus_decision(global_summary, stoplight, recommendation)
    coverage_gap_entries = sorted_coverage_gap_entries(
        coverage_gap_groups,
        corpus_state_groups,
    )

    return {
        "event_counts": dict(sorted(event_counts.items())),
        "global_summary": global_summary,
        "global_stoplight": stoplight,
        "route_recommendation": recommendation,
        "route_permission": permission_from_recommendation(recommendation),
        "corpus_decision": decision,
        "next_action": next_action_for_decision(decision),
        "source_blocker": source_blocker_for_decision(
            decision, global_summary, stoplight, recommendation
        ),
        "route_buckets": {
            bucket: sorted(rows, key=lambda row: int(row.get("rank", 0)))
            for bucket, rows in sorted(route_buckets.items())
        },
        "record_filters": filters,
        "corpus_axis_summary": summarize_corpus_axes(events),
        "cross_budget_axis_summary": summarize_cross_budget_axes(events),
        "pro_v4_root_pool_summary": summarize_pro_v4_root_pool(events),
        "coverage_gap_entry_count": len(coverage_gap_entries),
        "coverage_gap_entries": coverage_gap_entries,
    }


def main():
    parser = argparse.ArgumentParser(
        description=(
            "Read one or more experiment logs and summarize PRO_POLICY_MATRIX_* "
            "JSON lines into a compact decision digest."
        )
    )
    parser.add_argument("logs", nargs="+", type=Path)
    parser.add_argument(
        "--compact",
        action="store_true",
        help="emit compact JSON instead of pretty-printed JSON",
    )
    parser.add_argument(
        "--jsonl-out",
        type=Path,
        help="write normalized Outcome Corpus V2 workbench rows to this JSONL file",
    )
    parser.add_argument(
        "--jsonl-only",
        action="store_true",
        help="write --jsonl-out without printing the summary digest",
    )
    args = parser.parse_args()

    if args.jsonl_only and not args.jsonl_out:
        raise SystemExit("--jsonl-only requires --jsonl-out")

    missing = [str(path) for path in args.logs if not path.is_file()]
    if missing:
        raise SystemExit(f"missing log file(s): {', '.join(missing)}")

    per_log_events = [(path, parse_policy_matrix_log(path)) for path in args.logs]
    events = [
        event
        for _source_log, source_events in per_log_events
        for event in source_events
    ]
    digest = summarize(events)
    digest = add_log_rollup(
        digest,
        [(str(source_log), summarize(events)) for source_log, events in per_log_events],
    )
    if args.jsonl_out:
        digest["jsonl_export"] = write_jsonl_rows(
            args.jsonl_out,
            build_jsonl_rows(events),
        )
    if args.jsonl_only:
        return
    if args.compact:
        json.dump(digest, sys.stdout, sort_keys=True, separators=(",", ":"))
    else:
        json.dump(digest, sys.stdout, indent=2, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
