#!/usr/bin/env python3
"""Validate and summarize candidate-independent guarded root-corpus v4 logs."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import tempfile
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


PREFIX = "GUARDED_STRATIFIED_ROOT_CORPUS_V4_ROOT "
SCHEMA_PREFIX = "GUARDED_STRATIFIED_ROOT_CORPUS_V4_SCHEMA "
ATTESTATION_PREFIX = "GUARDED_STRATIFIED_ROOT_CORPUS_V4_ATTESTATION "
SELECTION_PREFIX = "GUARDED_STRATIFIED_ROOT_CORPUS_V4_SELECTION "
BUDGETS = ("pro", "normal", "fast")
ROLES = ("discovery", "validation", "locked")
ATTESTED_ROLES = ("validation", "locked")
EXPECTED_MANIFEST_SHA256 = (
    "7bd0a572ac7034ddc8dcfd48004ddb76c229eebf4f03e732ba63af66115fbde9"
)
EXPECTED_RULE_SHA256 = (
    "78f67a791b70a1a19a107b3ed4c1c5397e20b168ecf89a4cb6f8329f5b33fed6"
)
ATTESTATION_FIELDS = {
    "attestation_version",
    "manifest_id",
    "manifest_sha256",
    "rule_id",
    "rule_sha256",
    "split_role",
    "seed_family_id",
    "shard_id",
    "run_config",
}
RUN_CONFIG_FIELDS = {
    "source_duel_filter",
    "repeat_offset",
    "repeats",
    "games",
    "state_cap",
    "root_limit",
    "max_plies",
}
SELECTION_FIELDS = {
    "attestation_version",
    "manifest_sha256",
    "rule_sha256",
    "state_id",
    "guarded_root_id",
    "selected_root_id",
    "decision",
    "eligible_count",
    "guarded_efficiency",
    "selected_efficiency",
    "efficiency_delta",
    "surplus",
    "selected_root_rank",
    "tie_break_root_id",
}
POINTS_BY_OUTCOME = {"loss": 0, "draw": 1, "win": 2}
SOURCE_DUEL_BUDGET = {
    "vs_shipping_pro": "pro",
    "vs_shipping_normal": "normal",
    "vs_shipping_fast": "fast",
}

BOOL_MODEL_FEATURES = {
    "wins_immediately",
    "attacks_opponent_drainer",
    "own_drainer_vulnerable",
    "own_drainer_walk_vulnerable",
    "spirit_development",
    "keeps_awake_spirit_on_base",
    "mana_handoff_to_opponent",
    "has_roundtrip",
    "scores_supermana_this_turn",
    "scores_opponent_mana_this_turn",
    "safe_supermana_pickup_now",
    "safe_opponent_mana_pickup_now",
    "spirit_same_turn_score_setup_now",
    "spirit_own_mana_setup_now",
    "supermana_progress",
    "opponent_mana_progress",
    "allows_immediate_opponent_win",
    "opponent_reaches_match_point",
}
INT_MODEL_FEATURES = {
    "root_score",
    "efficiency",
    "safe_supermana_progress_steps",
    "safe_opponent_mana_progress_steps",
    "score_path_best_steps",
    "same_turn_score_window_value",
    "spirit_setup_gain",
    "interview_soft_priority",
    "reply_floor",
    "followup_floor",
    "utility_win_state",
    "utility_avoid_immediate_loss",
    "utility_score_delta",
    "utility_deny_gain",
    "utility_drainer_attack",
    "utility_drainer_safety",
    "utility_eval_score",
}
MODEL_FEATURES = BOOL_MODEL_FEATURES | INT_MODEL_FEATURES | {"family", "spatial"}
TURN_PLAN_FAMILIES = {
    "ImmediateScore",
    "DenyOpponentWindow",
    "DrainerKill",
    "SafeSupermanaProgress",
    "SafeOpponentManaProgress",
    "DrainerSafetyRecovery",
    "SpiritImpact",
    "ManaTempo",
}

FIELDS = {
    "schema_version",
    "candidate_independent",
    "sample_id",
    "state_id",
    "root_id",
    "source_fen",
    "source_duel_id",
    "source_panel",
    "color",
    "variant",
    "seed_family_id",
    "generation_seed_tag",
    "repeat_index",
    "opening_index",
    "opening_cluster_id",
    "side_sibling_id",
    "source_ply",
    "max_plies",
    "remaining_horizon",
    "frontier_execute",
    "guarded_move",
    "guarded_move_legal",
    "guarded_root_included",
    "root_move",
    "root_rank",
    "root_score",
    "model_features",
    "root_pool_size",
    "root_limit",
    "root_move_legal",
    "budget",
    "control_profile",
    "guarded_points",
    "guarded_outcome",
    "root_points",
    "root_outcome",
    "save_violation",
    "guarded_terminal",
    "root_terminal",
    "guarded_plies_played",
    "root_plies_played",
    "source_candidate_turn_count",
    "eligible_frontier_execute_count",
    "state_cap",
    "stable_score_order",
}

IDENTITY_AUDIT_ONLY = sorted(
    {
        "sample_id",
        "state_id",
        "root_id",
        "source_fen",
        "source_duel_id",
        "source_panel",
        "color",
        "variant",
        "seed_family_id",
        "generation_seed_tag",
        "repeat_index",
        "opening_index",
        "opening_cluster_id",
        "side_sibling_id",
        "guarded_move",
        "root_move",
    }
)


class CorpusError(ValueError):
    pass


def fail(message: str) -> None:
    raise CorpusError(message)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def canonical_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def guarded_digest(value: str) -> str:
    digest = 14_695_981_039_346_656_037
    for byte in value.encode("utf-8"):
        digest ^= byte
        digest = (digest * 1_099_511_628_211) & ((1 << 64) - 1)
    return f"{digest:016x}"


def validate_schema_event(schema: Any, where: str) -> None:
    if (
        not isinstance(schema, dict)
        or set(schema)
        != {
            "schema_version",
            "candidate_independent",
            "record_grain",
            "source",
            "root_pool",
            "labels",
            "fields",
        }
        or schema.get("schema_version") != 4
        or schema.get("candidate_independent") is not True
        or schema.get("record_grain") != "state_root_budget"
        or schema.get("source") != "guarded_trace.candidate_turns/frontier_execute"
        or schema.get("root_pool")
        != "stable_guarded_scored_roots_total_capped_with_exact_guarded_root"
        or schema.get("labels") != "offline_only"
        or not isinstance(schema.get("fields"), list)
        or set(schema["fields"]) != FIELDS
    ):
        fail(f"{where}: schema event does not match the strict v4 contract")


def load_rows(
    paths: Iterable[Path], *, reject_attested_roles: set[str] | None = None
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    sample_ids: set[str] = set()
    for path in paths:
        schema_events: list[dict[str, Any]] = []
        attestation_roles: list[str] = []
        for line_number, line in enumerate(path.read_text().splitlines(), 1):
            if line.startswith(SCHEMA_PREFIX):
                try:
                    schema_events.append(json.loads(line[len(SCHEMA_PREFIX) :]))
                except json.JSONDecodeError as exc:
                    fail(f"{path}:{line_number}: invalid v4 schema JSON: {exc}")
                continue
            if line.startswith(ATTESTATION_PREFIX):
                try:
                    attestation = json.loads(line[len(ATTESTATION_PREFIX) :])
                except json.JSONDecodeError as exc:
                    fail(f"{path}:{line_number}: invalid v4 attestation JSON: {exc}")
                if isinstance(attestation, dict) and isinstance(
                    attestation.get("split_role"), str
                ):
                    attestation_roles.append(attestation["split_role"])
                continue
            if not line.startswith(PREFIX):
                continue
            try:
                row = json.loads(line[len(PREFIX) :])
            except json.JSONDecodeError as exc:
                fail(f"{path}:{line_number}: invalid v4 JSON: {exc}")
            validate_row(row, f"{path}:{line_number}")
            sample_id = row["sample_id"]
            if sample_id in sample_ids:
                fail(f"{path}:{line_number}: duplicate sample_id {sample_id}")
            sample_ids.add(sample_id)
            rows.append(row)
        if len(schema_events) != 1:
            fail(f"{path}: expected exactly one v4 schema event, found {len(schema_events)}")
        validate_schema_event(schema_events[0], str(path))
        if reject_attested_roles:
            rejected = sorted(set(attestation_roles) & reject_attested_roles)
            if rejected:
                fail(
                    f"{path}: attested {','.join(rejected)} logs are not discovery input"
                )
    if not rows:
        fail("no GUARDED_STRATIFIED_ROOT_CORPUS_V4_ROOT rows found")
    return rows


def validate_row(row: Any, where: str) -> None:
    if not isinstance(row, dict):
        fail(f"{where}: row must be an object")
    missing = FIELDS - set(row)
    extra = set(row) - FIELDS
    if missing or extra:
        fail(f"{where}: schema keys differ; missing={sorted(missing)} extra={sorted(extra)}")
    if row["schema_version"] != 4 or row["candidate_independent"] is not True:
        fail(f"{where}: requires schema_version=4 and candidate_independent=true")
    for field in (
        "sample_id",
        "state_id",
        "root_id",
        "source_fen",
        "source_duel_id",
        "source_panel",
        "color",
        "variant",
        "seed_family_id",
        "generation_seed_tag",
        "opening_cluster_id",
        "side_sibling_id",
        "guarded_move",
        "root_move",
        "budget",
        "control_profile",
        "guarded_outcome",
        "root_outcome",
    ):
        if not isinstance(row[field], str) or not row[field]:
            fail(f"{where}: {field} must be a nonempty string")
    for field in (
        "repeat_index",
        "opening_index",
        "source_ply",
        "max_plies",
        "remaining_horizon",
        "root_rank",
        "root_score",
        "root_pool_size",
        "root_limit",
        "guarded_points",
        "root_points",
        "guarded_plies_played",
        "root_plies_played",
        "source_candidate_turn_count",
        "eligible_frontier_execute_count",
        "state_cap",
    ):
        if isinstance(row[field], bool) or not isinstance(row[field], int):
            fail(f"{where}: {field} must be an integer")
    for field in ("save_violation", "guarded_terminal", "root_terminal"):
        if not isinstance(row[field], bool):
            fail(f"{where}: {field} must be boolean")
    for field in (
        "repeat_index",
        "opening_index",
        "source_ply",
        "remaining_horizon",
        "guarded_plies_played",
        "root_plies_played",
        "source_candidate_turn_count",
        "eligible_frontier_execute_count",
        "state_cap",
    ):
        if row[field] < 0:
            fail(f"{where}: {field} must be nonnegative")
    if row["max_plies"] <= 0:
        fail(f"{where}: max_plies must be positive")
    for field in (
        "frontier_execute",
        "guarded_move_legal",
        "guarded_root_included",
        "root_move_legal",
        "stable_score_order",
    ):
        if row[field] is not True:
            fail(f"{where}: required audit invariant {field}=true")
    if row["budget"] not in BUDGETS:
        fail(f"{where}: unsupported budget {row['budget']!r}")
    if row["color"] not in ("white", "black"):
        fail(f"{where}: unsupported color {row['color']!r}")
    if row["source_panel"] not in ("guarded_loss", "guarded_save"):
        fail(f"{where}: unsupported source_panel {row['source_panel']!r}")
    if row["source_duel_id"] not in SOURCE_DUEL_BUDGET:
        fail(f"{where}: unsupported source_duel_id {row['source_duel_id']!r}")
    if row["control_profile"] != "shipping_pro_search":
        fail(f"{where}: control_profile must be shipping_pro_search")
    if row["remaining_horizon"] != row["max_plies"] - row["source_ply"]:
        fail(f"{where}: remaining_horizon mismatch")
    if row["state_cap"] > 12 or row["state_cap"] < 0:
        fail(f"{where}: schema-v4 role state cap must be within 0..12")
    if row["root_limit"] > 6 or row["root_limit"] <= 0:
        fail(f"{where}: schema-v4 root limit must be within 1..6")
    if row["root_pool_size"] > row["root_limit"] or row["root_pool_size"] <= 0:
        fail(f"{where}: invalid total root cap")
    if row["root_rank"] <= 0:
        fail(f"{where}: invalid original scored-root rank")
    features = row["model_features"]
    if not isinstance(features, dict) or not features:
        fail(f"{where}: model_features must be a nonempty object")
    if set(features) != MODEL_FEATURES:
        fail(
            f"{where}: model feature keys differ; "
            f"missing={sorted(MODEL_FEATURES - set(features))} "
            f"extra={sorted(set(features) - MODEL_FEATURES)}"
        )
    for field in BOOL_MODEL_FEATURES:
        if not isinstance(features[field], bool):
            fail(f"{where}: model feature {field} must be boolean")
    for field in INT_MODEL_FEATURES:
        if isinstance(features[field], bool) or not isinstance(features[field], int):
            fail(f"{where}: model feature {field} must be integer")
    if features["family"] not in TURN_PLAN_FAMILIES:
        fail(f"{where}: model feature family is not a known TurnPlanFamily")
    if (
        not isinstance(features["spatial"], list)
        or len(features["spatial"]) != 138
        or any(isinstance(value, bool) or not isinstance(value, int) for value in features["spatial"])
    ):
        fail(f"{where}: model feature spatial must be 138 integers")
    if features.get("root_score") != row["root_score"]:
        fail(f"{where}: model_features.root_score must match root_score")
    if not str(row["generation_seed_tag"]).startswith(str(row["seed_family_id"])):
        fail(f"{where}: generation seed tag is outside base seed family")
    for prefix in ("guarded", "root"):
        points = row[f"{prefix}_points"]
        outcome = row[f"{prefix}_outcome"]
        if isinstance(points, bool) or points not in (0, 1, 2):
            fail(f"{where}: invalid {prefix}_points")
        if POINTS_BY_OUTCOME.get(outcome) != points:
            fail(f"{where}: {prefix} outcome/points disagree")
    expected_save_violation = row["guarded_points"] > 0 and row["root_points"] == 0
    if row["save_violation"] is not expected_save_violation:
        fail(f"{where}: save_violation disagrees with non-loss-to-loss definition")
    if row["budget"] == SOURCE_DUEL_BUDGET[row["source_duel_id"]]:
        source_was_loss = row["guarded_points"] == 0
        if source_was_loss != (row["source_panel"] == "guarded_loss"):
            fail(f"{where}: matching-budget guarded result disagrees with source_panel")


def load_attested_manifest(path: Path) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict):
        fail("attested manifest must be a JSON object")
    digest = canonical_sha256(payload)
    if digest != EXPECTED_MANIFEST_SHA256:
        fail(
            "attested manifest digest mismatch; "
            f"expected={EXPECTED_MANIFEST_SHA256} actual={digest}"
        )
    rule = payload.get("rule")
    if canonical_sha256(rule) != EXPECTED_RULE_SHA256:
        fail("attested manifest canonical rule digest mismatch")
    if payload.get("rule_sha256") != EXPECTED_RULE_SHA256:
        fail("attested manifest rule_sha256 mismatch")
    if payload.get("schema_version") != 1:
        fail("attested manifest requires schema_version=1")
    if payload.get("permission_contract", {}).get("discovery_can_grant_permission") is not False:
        fail("attested manifest must forbid discovery permission")
    if set(payload.get("roles", {})) != set(ATTESTED_ROLES):
        fail("attested manifest must define exactly validation and locked roles")
    for role in ATTESTED_ROLES:
        role_spec = payload["roles"].get(role)
        if not isinstance(role_spec, dict):
            fail(f"attested manifest role {role} must be an object")
        if not isinstance(role_spec.get("seed_family_id"), str):
            fail(f"attested manifest role {role} needs a seed_family_id")
        shards = role_spec.get("shards")
        if not isinstance(shards, list) or not shards:
            fail(f"attested manifest role {role} needs planned shards")
        shard_ids = [shard.get("shard_id") for shard in shards if isinstance(shard, dict)]
        if len(shard_ids) != len(shards) or len(set(shard_ids)) != len(shards):
            fail(f"attested manifest role {role} has invalid or duplicate shard ids")
        for shard in shards:
            if set(shard) != RUN_CONFIG_FIELDS | {"shard_id"}:
                fail(f"attested manifest shard {shard.get('shard_id')} has wrong fields")
            if shard["source_duel_filter"] not in SOURCE_DUEL_BUDGET.values():
                fail(f"attested manifest shard {shard['shard_id']} has invalid duel filter")
            for field in RUN_CONFIG_FIELDS - {"source_duel_filter"}:
                if isinstance(shard[field], bool) or not isinstance(shard[field], int):
                    fail(f"attested manifest shard {shard['shard_id']} {field} must be integer")
            if any(shard[field] <= 0 for field in ("repeats", "games", "state_cap", "root_limit", "max_plies")):
                fail(f"attested manifest shard {shard['shard_id']} has nonpositive config")
            if shard["repeat_offset"] < 0:
                fail(f"attested manifest shard {shard['shard_id']} has negative repeat offset")
    return payload


def verify_discovery_artifacts(
    manifest: dict[str, Any], assignments: list[str]
) -> dict[str, dict[str, str]]:
    provided: dict[str, Path] = {}
    for assignment in assignments:
        if "=" not in assignment:
            fail(
                f"invalid --discovery-artifact {assignment!r}; expected MANIFEST_NAME=PATH"
            )
        name, raw_path = assignment.split("=", 1)
        if not name or not raw_path:
            fail(f"invalid --discovery-artifact {assignment!r}")
        if name in provided:
            fail(f"duplicate discovery artifact assignment for {name}")
        provided[name] = Path(raw_path)
    expected = {
        artifact["name"]: artifact["sha256"]
        for artifact in manifest["discovery"]["artifacts"]
    }
    if set(provided) != set(expected):
        fail(
            "discovery artifact set differs from manifest; "
            f"missing={sorted(set(expected) - set(provided))} "
            f"extra={sorted(set(provided) - set(expected))}"
        )
    verified: dict[str, dict[str, str]] = {}
    for name in sorted(expected):
        path = provided[name]
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual != expected[name]:
            fail(
                f"discovery artifact {name} digest mismatch; "
                f"expected={expected[name]} actual={actual}"
            )
        verified[name] = {"path": str(path), "sha256": actual}
    return verified


def planned_shards(manifest: dict[str, Any], role: str) -> dict[str, dict[str, Any]]:
    return {
        shard["shard_id"]: shard
        for shard in manifest["roles"][role]["shards"]
    }


def validate_attestation(
    event: Any, manifest: dict[str, Any], allowed_roles: set[str], where: str
) -> tuple[str, dict[str, Any]]:
    if not isinstance(event, dict) or set(event) != ATTESTATION_FIELDS:
        fail(f"{where}: attestation fields differ from the strict contract")
    if event["attestation_version"] != 1:
        fail(f"{where}: attestation_version must be 1")
    for field in (
        "manifest_id",
        "manifest_sha256",
        "rule_id",
        "rule_sha256",
        "split_role",
        "seed_family_id",
        "shard_id",
    ):
        if not isinstance(event[field], str) or not event[field]:
            fail(f"{where}: attestation {field} must be a nonempty string")
    if event["manifest_id"] != manifest["manifest_id"]:
        fail(f"{where}: manifest_id mismatch")
    if event["manifest_sha256"] != EXPECTED_MANIFEST_SHA256:
        fail(f"{where}: manifest_sha256 mismatch")
    if event["rule_id"] != manifest["rule_id"]:
        fail(f"{where}: rule_id mismatch")
    if event["rule_sha256"] != EXPECTED_RULE_SHA256:
        fail(f"{where}: rule_sha256 mismatch")
    role = event["split_role"]
    if role not in allowed_roles:
        fail(f"{where}: attested role {role!r} is not allowed in this phase")
    role_spec = manifest["roles"][role]
    if event["seed_family_id"] != role_spec["seed_family_id"]:
        fail(f"{where}: seed family does not match precommitted role")
    shard = planned_shards(manifest, role).get(event["shard_id"])
    if shard is None:
        fail(f"{where}: unplanned shard_id {event['shard_id']!r}")
    expected_config = {field: shard[field] for field in RUN_CONFIG_FIELDS}
    if event["run_config"] != expected_config:
        fail(f"{where}: run_config differs from the precommitted shard")
    return role, shard


def validate_selection_event(event: Any, where: str) -> None:
    if not isinstance(event, dict) or set(event) != SELECTION_FIELDS:
        fail(f"{where}: selection fields differ from the strict contract")
    if event["attestation_version"] != 1:
        fail(f"{where}: selection attestation_version must be 1")
    if event["manifest_sha256"] != EXPECTED_MANIFEST_SHA256:
        fail(f"{where}: selection manifest digest mismatch")
    if event["rule_sha256"] != EXPECTED_RULE_SHA256:
        fail(f"{where}: selection rule digest mismatch")
    for field in ("state_id", "guarded_root_id", "selected_root_id", "decision", "tie_break_root_id"):
        if not isinstance(event[field], str) or not event[field]:
            fail(f"{where}: selection {field} must be a nonempty string")
    if event["decision"] not in ("override", "guarded_abstention"):
        fail(f"{where}: unsupported selection decision")
    for field in (
        "eligible_count",
        "guarded_efficiency",
        "selected_efficiency",
        "efficiency_delta",
        "selected_root_rank",
    ):
        if isinstance(event[field], bool) or not isinstance(event[field], int):
            fail(f"{where}: selection {field} must be integer")
    if event["eligible_count"] < 0 or event["selected_root_rank"] <= 0:
        fail(f"{where}: invalid selection count or rank")
    surplus = event["surplus"]
    if surplus is not None and (
        isinstance(surplus, bool) or not isinstance(surplus, int) or surplus < 0
    ):
        fail(f"{where}: selection surplus must be null or a nonnegative integer")


def expected_source_duel(filter_name: str) -> str:
    return f"vs_shipping_{filter_name}"


def expected_generation_seed_tag(seed_family_id: str, filter_name: str) -> str:
    return seed_family_id if filter_name == "pro" else f"{seed_family_id}_vs_{filter_name}"


def validate_row_against_shard(
    row: dict[str, Any], attestation: dict[str, Any], shard: dict[str, Any], where: str
) -> None:
    if row["seed_family_id"] != attestation["seed_family_id"]:
        fail(f"{where}: row seed family differs from attestation")
    duel_filter = shard["source_duel_filter"]
    if row["source_duel_id"] != expected_source_duel(duel_filter):
        fail(f"{where}: row source duel differs from shard")
    if row["generation_seed_tag"] != expected_generation_seed_tag(
        attestation["seed_family_id"], duel_filter
    ):
        fail(f"{where}: row generation seed tag differs from shard")
    if not (
        shard["repeat_offset"]
        <= row["repeat_index"]
        < shard["repeat_offset"] + shard["repeats"]
    ):
        fail(f"{where}: row repeat index is outside shard")
    if row["opening_index"] >= shard["games"]:
        fail(f"{where}: row opening index is outside shard")
    for row_field, config_field in (
        ("state_cap", "state_cap"),
        ("root_limit", "root_limit"),
        ("max_plies", "max_plies"),
    ):
        if row[row_field] != shard[config_field]:
            fail(f"{where}: row {row_field} differs from shard")
    expected_state_id = guarded_digest(
        f"v4|source_fen={row['source_fen']}|remaining_horizon={row['remaining_horizon']}"
    )
    if row["state_id"] != expected_state_id:
        fail(f"{where}: state_id does not match source FEN and horizon")
    expected_root_id = guarded_digest(
        f"state_id={row['state_id']}|root_move={row['root_move']}"
    )
    if row["root_id"] != expected_root_id:
        fail(f"{where}: root_id does not match state and root move")
    expected_sample_id = guarded_digest(
        f"root_id={row['root_id']}|budget={row['budget']}"
    )
    if row["sample_id"] != expected_sample_id:
        fail(f"{where}: sample_id does not match root and budget")


def load_attested_corpus(
    paths: Iterable[Path], manifest: dict[str, Any], phase: str
) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]], dict[str, dict[str, Any]]]:
    if phase not in ATTESTED_ROLES:
        fail(f"unsupported attested phase {phase!r}")
    allowed_roles = {"validation"} if phase == "validation" else set(ATTESTED_ROLES)
    rows: list[dict[str, Any]] = []
    selections: dict[str, dict[str, Any]] = {}
    state_context: dict[str, dict[str, Any]] = {}
    sample_ids: set[str] = set()
    seen_shards: dict[tuple[str, str], Path] = {}

    for path in paths:
        schema_events: list[dict[str, Any]] = []
        attestation: dict[str, Any] | None = None
        role: str | None = None
        shard: dict[str, Any] | None = None
        local_selections: dict[str, dict[str, Any]] = {}
        local_states_with_rows: set[str] = set()
        for line_number, line in enumerate(path.read_text().splitlines(), 1):
            where = f"{path}:{line_number}"
            if line.startswith(SCHEMA_PREFIX):
                try:
                    schema_events.append(json.loads(line[len(SCHEMA_PREFIX) :]))
                except json.JSONDecodeError as exc:
                    fail(f"{where}: invalid v4 schema JSON: {exc}")
                continue
            if line.startswith(ATTESTATION_PREFIX):
                if attestation is not None:
                    fail(f"{where}: duplicate attestation event")
                try:
                    candidate = json.loads(line[len(ATTESTATION_PREFIX) :])
                except json.JSONDecodeError as exc:
                    fail(f"{where}: invalid v4 attestation JSON: {exc}")
                role, shard = validate_attestation(candidate, manifest, allowed_roles, where)
                attestation = candidate
                shard_key = (role, candidate["shard_id"])
                if shard_key in seen_shards:
                    fail(f"{where}: duplicate planned shard {shard_key}")
                seen_shards[shard_key] = path
                continue
            if line.startswith(SELECTION_PREFIX):
                if attestation is None or role is None:
                    fail(f"{where}: selection appeared before attestation")
                try:
                    selection = json.loads(line[len(SELECTION_PREFIX) :])
                except json.JSONDecodeError as exc:
                    fail(f"{where}: invalid v4 selection JSON: {exc}")
                validate_selection_event(selection, where)
                state_id = selection["state_id"]
                if state_id in local_selections or state_id in selections:
                    fail(f"{where}: duplicate selection for state {state_id}")
                local_selections[state_id] = selection
                selections[state_id] = selection
                state_context[state_id] = {
                    "role": role,
                    "shard_id": attestation["shard_id"],
                    "path": str(path),
                }
                continue
            if not line.startswith(PREFIX):
                continue
            if attestation is None or role is None or shard is None:
                fail(f"{where}: root row appeared before attestation")
            try:
                row = json.loads(line[len(PREFIX) :])
            except json.JSONDecodeError as exc:
                fail(f"{where}: invalid v4 root JSON: {exc}")
            validate_row(row, where)
            state_id = row["state_id"]
            if state_id not in local_selections:
                fail(f"{where}: state's selection must precede its first root row")
            if state_context[state_id]["shard_id"] != attestation["shard_id"]:
                fail(f"{where}: state crossed attested shards")
            validate_row_against_shard(row, attestation, shard, where)
            if row["sample_id"] in sample_ids:
                fail(f"{where}: duplicate sample_id {row['sample_id']}")
            sample_ids.add(row["sample_id"])
            rows.append(row)
            local_states_with_rows.add(state_id)

        if len(schema_events) != 1:
            fail(f"{path}: expected exactly one v4 schema event, found {len(schema_events)}")
        validate_schema_event(schema_events[0], str(path))
        if attestation is None or role is None or shard is None:
            fail(f"{path}: expected exactly one attestation event")
        if set(local_selections) != local_states_with_rows:
            fail(f"{path}: selections and rooted states differ")
        if len(local_selections) != shard["state_cap"]:
            fail(
                f"{path}: shard produced {len(local_selections)} states; "
                f"expected exactly {shard['state_cap']}"
            )

    for role_name in allowed_roles:
        expected = set(planned_shards(manifest, role_name))
        actual = {shard_id for role, shard_id in seen_shards if role == role_name}
        if actual != expected:
            fail(
                f"attested {role_name} shard set differs; "
                f"missing={sorted(expected - actual)} extra={sorted(actual - expected)}"
            )
    if not rows:
        fail("no attested root rows found")
    return rows, selections, state_context


def load_split_map(path: Path | None, assignments: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    if path is not None:
        payload = json.loads(path.read_text())
        if not isinstance(payload, dict):
            fail("split map must be a JSON object of seed_family_id -> role")
        mapping.update(payload)
    for assignment in assignments:
        if "=" not in assignment:
            fail(f"invalid --assign {assignment!r}; expected FAMILY=ROLE")
        family, role = assignment.split("=", 1)
        if family in mapping and mapping[family] != role:
            fail(f"conflicting roles for family {family}")
        mapping[family] = role
    if not mapping:
        fail("a --split-map or at least one --assign FAMILY=ROLE is required")
    for family, role in mapping.items():
        if not isinstance(family, str) or not family or role not in ROLES:
            fail(f"invalid split mapping {family!r}: {role!r}")
    return mapping


def split_map_digest(mapping: dict[str, str]) -> str:
    canonical = json.dumps(mapping, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


STABLE_ROOT_FIELDS = FIELDS - {
    "sample_id",
    "budget",
    "guarded_points",
    "guarded_outcome",
    "root_points",
    "root_outcome",
    "save_violation",
    "guarded_terminal",
    "root_terminal",
    "guarded_plies_played",
    "root_plies_played",
}
STABLE_STATE_FIELDS = (
    "schema_version",
    "candidate_independent",
    "state_id",
    "source_fen",
    "source_duel_id",
    "source_panel",
    "color",
    "variant",
    "seed_family_id",
    "generation_seed_tag",
    "repeat_index",
    "opening_index",
    "opening_cluster_id",
    "side_sibling_id",
    "source_ply",
    "max_plies",
    "remaining_horizon",
    "frontier_execute",
    "guarded_move",
    "guarded_move_legal",
    "guarded_root_included",
    "root_pool_size",
    "root_limit",
    "control_profile",
    "source_candidate_turn_count",
    "eligible_frontier_execute_count",
    "state_cap",
    "stable_score_order",
)


def attested_state_roots(
    rows: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row["root_id"]].append(row)
    states: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for root_id, group in grouped.items():
        if len(group) != len(BUDGETS) or {row["budget"] for row in group} != set(BUDGETS):
            fail(f"root {root_id}: requires exactly one Pro/Normal/Fast row")
        anchor = group[0]
        for row in group[1:]:
            drift = [field for field in STABLE_ROOT_FIELDS if row[field] != anchor[field]]
            if drift:
                fail(f"root {root_id}: cross-budget metadata drift: {sorted(drift)}")
        by_budget = {row["budget"]: row for row in group}
        states[anchor["state_id"]].append(
            {
                "root_id": root_id,
                "state_id": anchor["state_id"],
                "root_move": anchor["root_move"],
                "guarded_move": anchor["guarded_move"],
                "root_rank": anchor["root_rank"],
                "root_pool_size": anchor["root_pool_size"],
                "features": anchor["model_features"],
                "opening_cluster_id": anchor["opening_cluster_id"],
                "variant": anchor["variant"],
                "color": anchor["color"],
                "source_duel_id": anchor["source_duel_id"],
                "source_panel": anchor["source_panel"],
                "source_fen": anchor["source_fen"],
                "side_sibling_id": anchor["side_sibling_id"],
                "generation_seed_tag": anchor["generation_seed_tag"],
                "repeat_index": anchor["repeat_index"],
                "opening_index": anchor["opening_index"],
                "remaining_horizon": anchor["remaining_horizon"],
                "state_metadata": tuple(anchor[field] for field in STABLE_STATE_FIELDS),
                "rows_by_budget": by_budget,
                "deltas": {
                    budget: by_budget[budget]["root_points"]
                    - by_budget[budget]["guarded_points"]
                    for budget in BUDGETS
                },
            }
        )
    for state_id, roots in states.items():
        if len(roots) > 6:
            fail(f"state {state_id}: more than six roots")
        if {root["root_pool_size"] for root in roots} != {len(roots)}:
            fail(f"state {state_id}: observed roots differ from declared root_pool_size")
        if len({root["state_metadata"] for root in roots}) != 1:
            fail(f"state {state_id}: cross-root state metadata drift")
        for field in (
            "guarded_move",
            "opening_cluster_id",
            "variant",
            "color",
            "source_duel_id",
            "source_panel",
            "source_fen",
            "side_sibling_id",
            "generation_seed_tag",
            "repeat_index",
            "opening_index",
        ):
            if len({root[field] for root in roots}) != 1:
                fail(f"state {state_id}: root metadata drift for {field}")
        if len({root["root_id"] for root in roots}) != len(roots):
            fail(f"state {state_id}: duplicate root ids")
        if len({root["root_move"] for root in roots}) != len(roots):
            fail(f"state {state_id}: duplicate root moves")
        if len({root["root_rank"] for root in roots}) != len(roots):
            fail(f"state {state_id}: duplicate root ranks")
        guarded = [root for root in roots if root["root_move"] == root["guarded_move"]]
        if len(guarded) != 1:
            fail(f"state {state_id}: requires exactly one exact guarded root")
        guarded_root = guarded[0]
        for budget in BUDGETS:
            controls = {
                (
                    root["rows_by_budget"][budget]["guarded_points"],
                    root["rows_by_budget"][budget]["guarded_outcome"],
                    root["rows_by_budget"][budget]["guarded_terminal"],
                    root["rows_by_budget"][budget]["guarded_plies_played"],
                )
                for root in roots
            }
            if len(controls) != 1:
                fail(f"state {state_id}: guarded control drift for budget {budget}")
        if any(delta != 0 for delta in guarded_root["deltas"].values()):
            fail(f"state {state_id}: exact guarded root must reproduce every control")
        for budget, row in guarded_root["rows_by_budget"].items():
            for suffix in ("points", "outcome", "terminal", "plies_played"):
                if row[f"root_{suffix}"] != row[f"guarded_{suffix}"]:
                    fail(f"state {state_id}: guarded {budget} {suffix} mismatch")
    return dict(states)


def recompute_selection_event(
    state_id: str, roots: list[dict[str, Any]], threshold: int
) -> dict[str, Any]:
    guarded = next(root for root in roots if root["root_move"] == root["guarded_move"])
    guarded_efficiency = guarded["features"]["efficiency"]
    eligible: list[tuple[int, int, str, dict[str, Any]]] = []
    for root in roots:
        if root is guarded:
            continue
        delta = root["features"]["efficiency"] - guarded_efficiency
        if delta >= threshold:
            eligible.append((delta - threshold, root["root_rank"], root["root_id"], root))
    selected = min(eligible, default=(0, 0, "", guarded))[-1]
    override = selected is not guarded
    selected_efficiency = selected["features"]["efficiency"]
    delta = selected_efficiency - guarded_efficiency
    return {
        "attestation_version": 1,
        "manifest_sha256": EXPECTED_MANIFEST_SHA256,
        "rule_sha256": EXPECTED_RULE_SHA256,
        "state_id": state_id,
        "guarded_root_id": guarded["root_id"],
        "selected_root_id": selected["root_id"],
        "decision": "override" if override else "guarded_abstention",
        "eligible_count": len(eligible),
        "guarded_efficiency": guarded_efficiency,
        "selected_efficiency": selected_efficiency,
        "efficiency_delta": delta,
        "surplus": delta - threshold if override else None,
        "selected_root_rank": selected["root_rank"],
        "tie_break_root_id": selected["root_id"],
    }


def validate_attested_split_leakage(
    states: dict[str, list[dict[str, Any]]], state_context: dict[str, dict[str, Any]]
) -> None:
    roles_by_fen: dict[str, str] = {}
    identity_by_fen: dict[str, tuple[str, int]] = {}
    cluster_provenance: dict[str, tuple[Any, ...]] = {}
    provenance_clusters: dict[tuple[Any, ...], str] = {}
    sibling_provenance: dict[str, tuple[Any, ...]] = {}
    provenance_siblings: dict[tuple[Any, ...], str] = {}
    roles_by_cluster: dict[str, str] = {}
    roles_by_sibling: dict[str, str] = {}
    for state_id, roots in states.items():
        root = roots[0]
        role = state_context[state_id]["role"]
        prior_fen_role = roles_by_fen.setdefault(root["source_fen"], role)
        if prior_fen_role != role:
            fail(f"split leakage: source_fen appears in both {prior_fen_role} and {role}")
        source_identity = (state_id, root["remaining_horizon"])
        prior_source_identity = identity_by_fen.setdefault(root["source_fen"], source_identity)
        if prior_source_identity != source_identity:
            fail("one raw source FEN maps to multiple state ids or horizons")
        provenance = (
            root["generation_seed_tag"],
            root["repeat_index"],
            root["opening_index"],
            root["variant"],
        )
        provenance_text = (
            f"generation_seed_tag={provenance[0]}|repeat_index={provenance[1]}|"
            f"opening_index={provenance[2]}|variant={provenance[3]}"
        )
        for field, prefix, forward, reverse, roles in (
            (
                "opening_cluster_id",
                "cluster",
                cluster_provenance,
                provenance_clusters,
                roles_by_cluster,
            ),
            (
                "side_sibling_id",
                "side_pair",
                sibling_provenance,
                provenance_siblings,
                roles_by_sibling,
            ),
        ):
            key = root[field]
            expected = guarded_digest(f"{prefix}|{provenance_text}")
            if key != expected:
                fail(f"{field} does not match deterministic generation provenance")
            prior_provenance = forward.setdefault(key, provenance)
            if prior_provenance != provenance:
                fail(f"{field} maps to multiple generation provenances")
            prior_key = reverse.setdefault(provenance, key)
            if prior_key != key:
                fail(f"generation provenance maps to multiple {field} values")
            prior_role = roles.setdefault(key, role)
            if prior_role != role:
                fail(f"split leakage: {field} appears in both {prior_role} and {role}")


def attested_role_summary(
    role: str,
    states: dict[str, list[dict[str, Any]]],
    selections: dict[str, dict[str, Any]],
    state_context: dict[str, dict[str, Any]],
    manifest: dict[str, Any],
) -> dict[str, Any]:
    selected_records: list[dict[str, Any]] = []
    role_state_ids = sorted(
        state_id for state_id, context in state_context.items() if context["role"] == role
    )
    threshold = manifest["rule"]["threshold"]
    for state_id in role_state_ids:
        roots = states.get(state_id)
        if roots is None:
            fail(f"selection state {state_id} has no roots")
        expected = recompute_selection_event(state_id, roots, threshold)
        if selections[state_id] != expected:
            differing = sorted(
                field
                for field in SELECTION_FIELDS
                if selections[state_id].get(field) != expected.get(field)
            )
            fail(f"state {state_id}: emitted selection disagrees with frozen rule: {differing}")
        selected = next(
            root for root in roots if root["root_id"] == expected["selected_root_id"]
        )
        deltas = selected["deltas"]
        budget_regressions = sum(delta < 0 for delta in deltas.values())
        save_violations = sum(
            bool(row["save_violation"])
            for row in selected["rows_by_budget"].values()
        )
        repair = budget_regressions == 0 and any(delta > 0 for delta in deltas.values())
        override_no_op = (
            expected["decision"] == "override" and all(delta == 0 for delta in deltas.values())
        )
        selected_records.append(
            {
                "state_id": state_id,
                "selected_root_id": selected["root_id"],
                "decision": expected["decision"],
                "repair": repair,
                "budget_regression_count": budget_regressions,
                "save_violation_count": save_violations,
                "override_no_op": override_no_op,
                "opening_cluster_id": selected["opening_cluster_id"],
                "variant": selected["variant"],
                "color": selected["color"],
                "source_duel_id": selected["source_duel_id"],
                "source_panel": selected["source_panel"],
                "deltas": deltas,
            }
        )
    repairs = [record for record in selected_records if record["repair"]]
    summary = {
        "seed_family_id": manifest["roles"][role]["seed_family_id"],
        "planned_shard_count": len(planned_shards(manifest, role)),
        "observed_shard_count": len(
            {state_context[state_id]["shard_id"] for state_id in role_state_ids}
        ),
        "state_count": len(role_state_ids),
        "opening_cluster_count": len(
            {roots[0]["opening_cluster_id"] for state_id, roots in states.items() if state_id in role_state_ids}
        ),
        "selected_override_count": sum(
            record["decision"] == "override" for record in selected_records
        ),
        "selected_abstention_count": sum(
            record["decision"] == "guarded_abstention" for record in selected_records
        ),
        "selected_repair_state_count": len(repairs),
        "selected_repair_opening_cluster_count": len(
            {record["opening_cluster_id"] for record in repairs}
        ),
        "selected_repair_variants": sorted({record["variant"] for record in repairs}),
        "selected_repair_colors": sorted({record["color"] for record in repairs}),
        "selected_repair_source_duels": sorted(
            {record["source_duel_id"] for record in repairs}
        ),
        "selected_repair_source_panels": sorted(
            {record["source_panel"] for record in repairs}
        ),
        "selected_budget_regression_count": sum(
            record["budget_regression_count"] for record in selected_records
        ),
        "selected_save_violation_count": sum(
            record["save_violation_count"] for record in selected_records
        ),
        "selected_override_no_op_count": sum(
            record["override_no_op"] for record in selected_records
        ),
        "selected_records": selected_records,
    }
    return summary


def attested_gate_blockers(
    role: str, summary: dict[str, Any], manifest: dict[str, Any]
) -> list[str]:
    common = manifest["gates"]["common"]
    gate = manifest["gates"][role]
    checks = (
        (
            summary["planned_shard_count"] == common["planned_shards_exact"]
            and summary["observed_shard_count"] == common["planned_shards_exact"],
            "planned_shards_not_exact",
        ),
        (summary["state_count"] == common["state_count_exact"], "state_count_not_exact"),
        (
            summary["opening_cluster_count"] >= common["opening_cluster_count_min"],
            "opening_cluster_count_below_min",
        ),
        (
            summary["selected_budget_regression_count"]
            <= common["selected_budget_regression_count_max"],
            "selected_budget_regression",
        ),
        (
            summary["selected_save_violation_count"]
            <= common["selected_save_violation_count_max"],
            "selected_save_violation",
        ),
        (
            summary["selected_override_no_op_count"]
            <= common["selected_override_no_op_count_max"],
            "selected_override_no_op_count_above_max",
        ),
        (
            summary["selected_repair_state_count"]
            >= gate["selected_repair_state_count_min"],
            "selected_repair_state_count_below_min",
        ),
        (
            summary["selected_repair_opening_cluster_count"]
            >= gate["selected_repair_opening_cluster_count_min"],
            "selected_repair_opening_cluster_count_below_min",
        ),
        (
            len(summary["selected_repair_variants"])
            >= gate["selected_repair_variant_count_min"],
            "selected_repair_variant_count_below_min",
        ),
        (
            len(summary["selected_repair_source_duels"])
            >= gate["selected_repair_source_duel_count_min"],
            "selected_repair_source_duel_count_below_min",
        ),
        (
            summary["selected_repair_colors"]
            == sorted(gate["selected_repair_colors_exact"]),
            "selected_repair_colors_not_exact",
        ),
    )
    return [f"{role}_{label}" for passed, label in checks if not passed]


def aggregate_attested(
    rows: list[dict[str, Any]],
    selections: dict[str, dict[str, Any]],
    state_context: dict[str, dict[str, Any]],
    manifest: dict[str, Any],
    phase: str,
) -> dict[str, Any]:
    states = attested_state_roots(rows)
    if set(states) != set(selections) or set(states) != set(state_context):
        fail("attested rooted states, selections, and contexts differ")
    validate_attested_split_leakage(states, state_context)
    roles = ("validation",) if phase == "validation" else ATTESTED_ROLES
    role_summaries: dict[str, dict[str, Any]] = {}
    blockers: list[str] = []
    for role in roles:
        summary = attested_role_summary(
            role, states, selections, state_context, manifest
        )
        role_blockers = attested_gate_blockers(role, summary, manifest)
        summary["gate_pass"] = not role_blockers
        summary["gate_blockers"] = role_blockers
        role_summaries[role] = summary
        blockers.extend(role_blockers)
    validation_pass = role_summaries["validation"]["gate_pass"]
    locked_pass = phase == "locked" and role_summaries["locked"]["gate_pass"]
    if phase == "locked" and not validation_pass:
        blockers.append("locked_not_authorized_without_validation_pass")
    permission = bool(phase == "locked" and validation_pass and locked_pass)
    return {
        "schema_version": 4,
        "attestation_version": 1,
        "phase": phase,
        "candidate_independent": True,
        "permission_source": "validation_and_locked_only",
        "manifest_attestation": {
            "manifest_id": manifest["manifest_id"],
            "canonical_sha256": EXPECTED_MANIFEST_SHA256,
            "precommitted_match": True,
        },
        "rule_attestation": {
            "rule_id": manifest["rule_id"],
            "canonical_rule": manifest["rule"],
            "canonical_sha256": EXPECTED_RULE_SHA256,
            "retuned": False,
        },
        "selection_contract": {
            "eligibility": "candidate.efficiency-guarded.efficiency>=56",
            "tie_break": ["surplus", "root_rank", "root_id"],
            "abstention": "exact_guarded_root",
            "outcome_grain": "selected_state_once_across_pro_normal_fast",
            "unselected_oracle_roots_can_grant_permission": False,
        },
        "record_count": len(rows),
        "root_count": sum(len(roots) for roots in states.values()),
        "state_count": len(states),
        "role_summaries": role_summaries,
        "validation_pass": validation_pass,
        "locked_pass": locked_pass,
        "permission": permission,
        "decision": (
            "inspect_for_source"
            if permission
            else "validation_pass"
            if phase == "validation" and validation_pass
            else "no_source"
        ),
        "next_action": (
            "run_precommitted_locked"
            if phase == "validation" and validation_pass
            else "source_candidate_earned"
            if permission
            else "kill_frozen_rule"
        ),
        "blockers": blockers,
    }


def aggregate(
    rows: list[dict[str, Any]],
    split_map: dict[str, str],
    frozen_rule_id: str | None = None,
    locked_rule_id: str | None = None,
    expected_split_digest: str | None = None,
) -> dict[str, Any]:
    actual_split_digest = split_map_digest(split_map)
    families = {row["seed_family_id"] for row in rows}
    if families != set(split_map):
        fail(
            "split-map families differ from corpus; "
            f"corpus={sorted(families)} map={sorted(split_map)}"
        )

    cluster_roles: dict[str, str] = {}
    sibling_roles: dict[str, str] = {}
    source_fen_roles: dict[str, str] = {}
    cluster_provenance: dict[str, tuple[Any, ...]] = {}
    provenance_clusters: dict[tuple[Any, ...], str] = {}
    sibling_provenance: dict[str, tuple[Any, ...]] = {}
    provenance_siblings: dict[tuple[Any, ...], str] = {}
    source_state_ids: dict[str, tuple[str, int]] = {}
    state_budget_controls: dict[tuple[str, str], tuple[Any, ...]] = {}
    state_metadata: dict[str, tuple[Any, ...]] = {}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        role = split_map[row["seed_family_id"]]
        prior_fen_role = source_fen_roles.setdefault(row["source_fen"], role)
        if prior_fen_role != role:
            fail(f"split leakage: source FEN appears in both {prior_fen_role} and {role}")
        provenance = (
            row["generation_seed_tag"],
            row["repeat_index"],
            row["opening_index"],
            row["variant"],
        )
        for key, forward, reverse, label in (
            (
                row["opening_cluster_id"],
                cluster_provenance,
                provenance_clusters,
                "opening cluster",
            ),
            (
                row["side_sibling_id"],
                sibling_provenance,
                provenance_siblings,
                "side sibling",
            ),
        ):
            prior_provenance = forward.setdefault(key, provenance)
            if prior_provenance != provenance:
                fail(f"{label} {key} maps to multiple generation provenances")
            prior_key = reverse.setdefault(provenance, key)
            if prior_key != key:
                fail(f"generation provenance maps to multiple {label} ids")
        for key, table in (
            (row["opening_cluster_id"], cluster_roles),
            (row["side_sibling_id"], sibling_roles),
        ):
            prior = table.setdefault(key, role)
            if prior != role:
                fail(f"split leakage: {key} appears in both {prior} and {role}")
        state_key = (
            row["source_fen"],
            row["remaining_horizon"],
            row["opening_cluster_id"],
            row["side_sibling_id"],
            row["color"],
            row["variant"],
            role,
            row["source_duel_id"],
            row["source_panel"],
            row["generation_seed_tag"],
            row["repeat_index"],
            row["opening_index"],
            row["source_ply"],
            row["max_plies"],
            row["guarded_move"],
            row["root_pool_size"],
            row["root_limit"],
        )
        prior_state = state_metadata.setdefault(row["state_id"], state_key)
        if prior_state != state_key:
            fail(f"state metadata drift for {row['state_id']}")
        source_identity = (row["state_id"], row["remaining_horizon"])
        prior_source_identity = source_state_ids.setdefault(
            row["source_fen"], source_identity
        )
        if prior_source_identity != source_identity:
            fail("one raw source FEN maps to multiple state ids or horizons")
        control_key = (row["state_id"], row["budget"])
        control_value = (
            row["guarded_points"],
            row["guarded_outcome"],
            row["guarded_terminal"],
            row["guarded_plies_played"],
        )
        prior_control = state_budget_controls.setdefault(control_key, control_value)
        if prior_control != control_value:
            fail(f"guarded control drift within state/budget {control_key}")
        grouped[row["root_id"]].append(row)

    root_records: list[dict[str, Any]] = []
    for root_id, group in grouped.items():
        if len(group) != len(BUDGETS) or {row["budget"] for row in group} != set(BUDGETS):
            fail(f"root {root_id}: requires exactly one Pro/Normal/Fast row")
        anchor = group[0]
        for row in group[1:]:
            drift = [field for field in STABLE_ROOT_FIELDS if row[field] != anchor[field]]
            if drift:
                fail(f"root {root_id}: cross-budget metadata drift: {sorted(drift)}")
        by_budget = {row["budget"]: row for row in group}
        deltas = {
            budget: by_budget[budget]["root_points"] - by_budget[budget]["guarded_points"]
            for budget in BUDGETS
        }
        regressions = sum(delta < 0 for delta in deltas.values())
        improvements = sum(delta > 0 for delta in deltas.values())
        save_violations = sum(bool(row["save_violation"]) for row in group)
        root_records.append(
            {
                "root_id": root_id,
                "state_id": anchor["state_id"],
                "role": split_map[anchor["seed_family_id"]],
                "opening_cluster_id": anchor["opening_cluster_id"],
                "variant": anchor["variant"],
                "color": anchor["color"],
                "source_duel_id": anchor["source_duel_id"],
                "source_panel": anchor["source_panel"],
                "root_rank": anchor["root_rank"],
                "root_score": anchor["root_score"],
                "root_pool_size": anchor["root_pool_size"],
                "model_features": anchor["model_features"],
                "root_move": anchor["root_move"],
                "guarded_move": anchor["guarded_move"],
                "deltas": deltas,
                "worst_budget_delta": min(deltas.values()),
                "improved_budget_count": improvements,
                "budget_regression_count": regressions,
                "save_violation_count": save_violations,
                "budget_results": {
                    budget: {
                        "guarded_points": by_budget[budget]["guarded_points"],
                        "guarded_outcome": by_budget[budget]["guarded_outcome"],
                        "guarded_terminal": by_budget[budget]["guarded_terminal"],
                        "guarded_plies_played": by_budget[budget]["guarded_plies_played"],
                        "root_points": by_budget[budget]["root_points"],
                        "root_outcome": by_budget[budget]["root_outcome"],
                        "root_terminal": by_budget[budget]["root_terminal"],
                        "root_plies_played": by_budget[budget]["root_plies_played"],
                    }
                    for budget in BUDGETS
                },
                "positive": regressions == 0 and improvements > 0,
            }
        )

    roots_by_state: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in root_records:
        roots_by_state[record["state_id"]].append(record)
    for state_id, state_roots in roots_by_state.items():
        if len(state_roots) > 6:
            fail(f"state {state_id}: more than six roots")
        declared_pool_sizes = {record["root_pool_size"] for record in state_roots}
        if declared_pool_sizes != {len(state_roots)}:
            fail(f"state {state_id}: observed roots differ from declared root_pool_size")
        if len({record["root_id"] for record in state_roots}) != len(state_roots):
            fail(f"state {state_id}: duplicate root ids")
        if len({record["root_move"] for record in state_roots}) != len(state_roots):
            fail(f"state {state_id}: duplicate root moves")
        if len({record["root_rank"] for record in state_roots}) != len(state_roots):
            fail(f"state {state_id}: duplicate original root ranks")
        guarded_roots = [
            record
            for record in state_roots
            if record["root_move"] == record["guarded_move"]
        ]
        if len(guarded_roots) != 1:
            fail(f"state {state_id}: requires exactly one exact guarded root")
        guarded_record = guarded_roots[0]
        if any(delta != 0 for delta in guarded_record["deltas"].values()):
            fail(f"state {state_id}: exact guarded root must reproduce every control")
        for budget, result in guarded_record["budget_results"].items():
            for suffix in ("points", "outcome", "terminal", "plies_played"):
                if result[f"root_{suffix}"] != result[f"guarded_{suffix}"]:
                    fail(
                        f"state {state_id}: exact guarded root {budget} {suffix} mismatch"
                    )

    role_summaries: dict[str, dict[str, Any]] = {}
    for role in ROLES:
        role_roots = [record for record in root_records if record["role"] == role]
        role_rows = [row for row in rows if split_map[row["seed_family_id"]] == role]
        positive_roots = [record for record in role_roots if record["positive"]]
        positive_states = {record["state_id"] for record in positive_roots}
        positive_clusters = {record["opening_cluster_id"] for record in positive_roots}
        positive_variants = {record["variant"] for record in positive_roots}
        positive_colors = {record["color"] for record in positive_roots}
        positive_source_duels = {record["source_duel_id"] for record in positive_roots}
        positive_source_panels = {record["source_panel"] for record in positive_roots}
        positive_regressions = sum(
            record["budget_regression_count"] for record in positive_roots
        )
        positive_save_violations = sum(
            record["save_violation_count"] for record in positive_roots
        )
        role_summaries[role] = {
            "row_count": len(role_rows),
            "root_count": len(role_roots),
            "state_count": len({row["state_id"] for row in role_rows}),
            "opening_cluster_count": len(
                {row["opening_cluster_id"] for row in role_rows}
            ),
            "seed_families": sorted({row["seed_family_id"] for row in role_rows}),
            "variants": sorted({row["variant"] for row in role_rows}),
            "colors": sorted({row["color"] for row in role_rows}),
            "source_duels": sorted({row["source_duel_id"] for row in role_rows}),
            "source_panels": sorted({row["source_panel"] for row in role_rows}),
            "positive_root_count": len(positive_roots),
            "positive_state_count": len(positive_states),
            "positive_opening_cluster_count": len(positive_clusters),
            "positive_variants": sorted(positive_variants),
            "positive_colors": sorted(positive_colors),
            "positive_source_duels": sorted(positive_source_duels),
            "positive_source_panels": sorted(positive_source_panels),
            "positive_budget_regression_count": positive_regressions,
            "positive_save_violation_count": positive_save_violations,
            "all_root_budget_regression_count": sum(
                record["budget_regression_count"] for record in role_roots
            ),
            "all_root_save_violation_count": sum(
                record["save_violation_count"] for record in role_roots
            ),
        }

    validation = role_summaries["validation"]
    locked = role_summaries["locked"]
    blockers: list[str] = []
    checks = (
        (validation["positive_state_count"] >= 4, "validation_positive_states_lt_4"),
        (
            validation["positive_opening_cluster_count"] >= 4,
            "validation_positive_clusters_lt_4",
        ),
        (len(validation["positive_variants"]) >= 2, "validation_positive_variants_lt_2"),
        (
            set(validation["positive_colors"]) == {"white", "black"},
            "validation_positive_missing_color",
        ),
        (
            len(validation["positive_source_duels"]) >= 2,
            "validation_positive_source_duels_lt_2",
        ),
        (
            validation["positive_budget_regression_count"] == 0,
            "validation_positive_budget_regression",
        ),
        (
            validation["positive_save_violation_count"] == 0,
            "validation_positive_save_violation",
        ),
        (locked["positive_state_count"] >= 2, "locked_positive_states_lt_2"),
        (
            locked["positive_opening_cluster_count"] >= 2,
            "locked_positive_clusters_lt_2",
        ),
        (
            locked["positive_budget_regression_count"] == 0,
            "locked_positive_budget_regression",
        ),
        (
            locked["positive_save_violation_count"] == 0,
            "locked_positive_save_violation",
        ),
    )
    blockers.extend(label for passed, label in checks if not passed)
    for role in ROLES:
        role_summary = role_summaries[role]
        if role_summary["state_count"] == 0:
            blockers.append(f"missing_{role}_role")
        if role_summary["state_count"] > 12:
            blockers.append(f"{role}_state_cap_exceeded")
        if len(role_summary["seed_families"]) != 1:
            blockers.append(f"{role}_seed_family_count_not_one")
    if not frozen_rule_id:
        blockers.append("missing_frozen_rule_id")
    if not locked_rule_id:
        blockers.append("missing_locked_rule_id")
    elif frozen_rule_id != locked_rule_id:
        blockers.append("locked_rule_retuned")
    if not expected_split_digest:
        blockers.append("missing_expected_split_digest")
    elif expected_split_digest != actual_split_digest:
        blockers.append("split_map_digest_mismatch")
    # Oracle-positive roots are labels, not a deployable selection policy. Keep
    # permission closed until a canonical frozen rule is applied to exactly one
    # selected root (or guarded abstention) per validation and locked state and
    # the rule/split digests are embedded by the sampler before those runs.
    blockers.append("selected_rule_evaluation_not_implemented")
    if role_summaries["discovery"]["row_count"] > 0 and not blockers:
        # Discovery is evidence only; validation+locked are the permission source.
        pass
    decision = "inspect_for_source" if not blockers else "no_source"
    return {
        "schema_version": 4,
        "candidate_independent": True,
        "label_contract": {
            "budgets": list(BUDGETS),
            "delta": "root_points-guarded_points",
            "positive": "worst_budget_delta>=0 && improved_budget_count>=1",
            "repair_count_grain": "state_once",
        },
        "model_feature_policy": {
            "identity_audit_only": IDENTITY_AUDIT_ONLY,
            "forbidden": [
                "policy",
                "challenger",
                "branch",
                "fen",
                "variant",
                "routing",
                "all_ids",
            ],
        },
        "rule_attestation": {
            "frozen_rule_id": frozen_rule_id,
            "locked_rule_id": locked_rule_id,
            "locked_without_retuning": bool(
                frozen_rule_id and frozen_rule_id == locked_rule_id
            ),
        },
        "split_attestation": {
            "actual_sha256": actual_split_digest,
            "expected_sha256": expected_split_digest,
            "precommitted_match": bool(
                expected_split_digest and expected_split_digest == actual_split_digest
            ),
        },
        "record_count": len(rows),
        "root_count": len(root_records),
        "state_count": len(state_metadata),
        "model_feature_names": sorted(
            {name for row in rows for name in row["model_features"]}
        ),
        "role_summaries": role_summaries,
        "positive_roots": [record for record in root_records if record["positive"]],
        "decision": decision,
        "blockers": blockers,
    }


def synthetic_row(
    *,
    family: str,
    role_tag: str,
    state: str,
    root: str,
    budget: str,
    delta: int,
    guarded: bool = False,
) -> dict[str, Any]:
    guarded_points = 1
    root_points = guarded_points + delta
    model_features: dict[str, Any] = {field: False for field in BOOL_MODEL_FEATURES}
    model_features.update({field: 0 for field in INT_MODEL_FEATURES})
    model_features.update(
        {"root_score": 10, "family": "ManaTempo", "spatial": [0] * 138}
    )
    row: dict[str, Any] = {field: 0 for field in FIELDS}
    row.update(
        {
            "schema_version": 4,
            "candidate_independent": True,
            "sample_id": f"{root}-{budget}",
            "state_id": state,
            "root_id": root,
            "source_fen": f"fen-{state}",
            "source_duel_id": (
                "vs_shipping_pro" if role_tag.startswith("a") else "vs_shipping_fast"
            ),
            "source_panel": "guarded_save",
            "color": "white" if role_tag.endswith("w") else "black",
            "variant": "classic" if role_tag.startswith("a") else "swapped",
            "seed_family_id": family,
            "generation_seed_tag": f"{family}_vs_pro",
            "opening_index": sum(ord(character) for character in state),
            "opening_cluster_id": f"cluster-{state}",
            "side_sibling_id": f"sibling-{state}",
            "source_ply": 1,
            "max_plies": 4,
            "remaining_horizon": 3,
            "frontier_execute": True,
            "guarded_move": "g",
            "guarded_move_legal": True,
            "guarded_root_included": True,
            "root_move": "g" if guarded else f"m-{root}",
            "root_rank": 1 if guarded else 2,
            "root_score": 10,
            "model_features": model_features,
            "root_pool_size": 2,
            "root_limit": 2,
            "root_move_legal": True,
            "budget": budget,
            "control_profile": "shipping_pro_search",
            "guarded_points": guarded_points,
            "guarded_outcome": "draw",
            "root_points": root_points,
            "root_outcome": {0: "loss", 1: "draw", 2: "win"}[root_points],
            "save_violation": guarded_points > 0 and root_points == 0,
            "guarded_terminal": False,
            "root_terminal": False,
            "guarded_plies_played": 3,
            "root_plies_played": 3,
            "source_candidate_turn_count": 1,
            "eligible_frontier_execute_count": 1,
            "state_cap": 12,
            "stable_score_order": True,
        }
    )
    return row


def self_test() -> None:
    rows: list[dict[str, Any]] = []
    split = {"discovery_f": "discovery", "validation_f": "validation", "locked_f": "locked"}
    specs = [
        ("discovery_f", "d1", "d1", "aw"),
        ("validation_f", "v1", "v1", "aw"),
        ("validation_f", "v2", "v2", "ab"),
        ("validation_f", "v3", "v3", "bw"),
        ("validation_f", "v4", "v4", "bb"),
        ("locked_f", "l1", "l1", "aw"),
        ("locked_f", "l2", "l2", "bb"),
    ]
    for family, state, root, role_tag in specs:
        for budget in BUDGETS:
            delta = 1 if budget == "pro" else 0
            rows.append(
                synthetic_row(
                    family=family,
                    role_tag=role_tag,
                    state=state,
                    root=f"{root}-guard",
                    budget=budget,
                    delta=0,
                    guarded=True,
                )
            )
            rows.append(
                synthetic_row(
                    family=family,
                    role_tag=role_tag,
                    state=state,
                    root=root,
                    budget=budget,
                    delta=delta,
                )
            )
    for index, row in enumerate(rows):
        validate_row(row, f"synthetic:{index}")
    digest = split_map_digest(split)
    summary = aggregate(rows, split, "rule-v1", "rule-v1", digest)
    assert summary["decision"] == "no_source", summary
    assert "selected_rule_evaluation_not_implemented" in summary["blockers"]

    missing = rows[:-1]
    try:
        aggregate(missing, split, "rule-v1", "rule-v1", digest)
    except CorpusError as exc:
        assert "exactly one Pro/Normal/Fast" in str(exc)
    else:
        raise AssertionError("missing budget was accepted")

    duplicate = rows + [dict(rows[0])]
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "duplicate.log"
        path.write_text("\n".join(PREFIX + json.dumps(row) for row in duplicate))
        try:
            load_rows([path])
        except CorpusError as exc:
            assert "duplicate sample_id" in str(exc)
        else:
            raise AssertionError("duplicate sample was accepted")

    leaked = [dict(row) for row in rows]
    leaked[-1]["opening_cluster_id"] = leaked[1]["opening_cluster_id"]
    try:
        aggregate(leaked, split, "rule-v1", "rule-v1", digest)
    except CorpusError as exc:
        assert (
            "split leakage" in str(exc)
            or "multiple generation provenances" in str(exc)
        )
    else:
        raise AssertionError("cluster split leakage was accepted")

    no_locked = {"discovery_f": "discovery", "validation_f": "validation", "locked_f": "validation"}
    summary = aggregate(
        rows,
        no_locked,
        "rule-v1",
        "rule-v1",
        split_map_digest(no_locked),
    )
    assert summary["decision"] == "no_source"
    assert "locked_positive_states_lt_2" in summary["blockers"]

    manifest_path = Path(__file__).resolve().parent.parent / (
        "docs/automove-guarded-root-efficiency-56-v1-manifest.json"
    )
    manifest = load_attested_manifest(manifest_path)
    assert canonical_sha256(manifest) == EXPECTED_MANIFEST_SHA256
    assert canonical_sha256(manifest["rule"]) == EXPECTED_RULE_SHA256

    def selection_root(
        root_id: str,
        move: str,
        rank: int,
        efficiency: int,
        deltas: dict[str, int] | None = None,
    ) -> dict[str, Any]:
        return {
            "root_id": root_id,
            "root_move": move,
            "guarded_move": "guarded",
            "root_rank": rank,
            "features": {"efficiency": efficiency},
            "opening_cluster_id": f"cluster-{root_id}",
            "variant": "classic" if rank % 2 else "swapped",
            "color": "white" if rank % 2 else "black",
            "source_duel_id": "vs_shipping_pro" if rank % 2 else "vs_shipping_fast",
            "source_panel": "guarded_loss",
            "source_fen": f"fen-{root_id}",
            "side_sibling_id": f"sibling-{root_id}",
            "deltas": deltas or {budget: 0 for budget in BUDGETS},
            "rows_by_budget": {
                budget: {"save_violation": False} for budget in BUDGETS
            },
        }

    guard = selection_root("guard", "guarded", 1, 100)
    below = selection_root("below", "below", 2, 155)
    boundary_rank5 = selection_root("z-boundary", "b1", 5, 156)
    boundary_rank4_z = selection_root("z-tie", "b2", 4, 156)
    boundary_rank4_a = selection_root("a-tie", "b3", 4, 156)
    farther = selection_root("farther", "far", 2, 157)
    abstention = recompute_selection_event("s-abstain", [guard, below], 56)
    assert abstention["decision"] == "guarded_abstention"
    assert abstention["selected_root_id"] == "guard"
    assert abstention["eligible_count"] == 0
    assert abstention["surplus"] is None
    tied = recompute_selection_event(
        "s-tie",
        [guard, below, boundary_rank5, boundary_rank4_z, boundary_rank4_a, farther],
        56,
    )
    assert tied["selected_root_id"] == "a-tie"
    assert tied["eligible_count"] == 4
    assert tied["surplus"] == 0
    validate_selection_event(tied, "synthetic-selection")
    bad_selection = dict(tied, manifest_sha256="0" * 64)
    try:
        validate_selection_event(bad_selection, "synthetic-selection")
    except CorpusError as exc:
        assert "manifest digest mismatch" in str(exc)
    else:
        raise AssertionError("selection with spoofed manifest digest was accepted")

    validation_spec = manifest["roles"]["validation"]
    first_shard = validation_spec["shards"][0]
    attestation = {
        "attestation_version": 1,
        "manifest_id": manifest["manifest_id"],
        "manifest_sha256": EXPECTED_MANIFEST_SHA256,
        "rule_id": manifest["rule_id"],
        "rule_sha256": EXPECTED_RULE_SHA256,
        "split_role": "validation",
        "seed_family_id": validation_spec["seed_family_id"],
        "shard_id": first_shard["shard_id"],
        "run_config": {field: first_shard[field] for field in RUN_CONFIG_FIELDS},
    }
    role, shard = validate_attestation(
        attestation, manifest, {"validation"}, "synthetic-attestation"
    )
    assert role == "validation" and shard == first_shard
    bad_attestation = json.loads(json.dumps(attestation))
    bad_attestation["run_config"]["state_cap"] = 3
    try:
        validate_attestation(
            bad_attestation, manifest, {"validation"}, "synthetic-attestation"
        )
    except CorpusError as exc:
        assert "run_config differs" in str(exc)
    else:
        raise AssertionError("retuned shard config was accepted")

    # An unselected oracle-positive root cannot count. The frozen selector
    # overrides to the boundary root, whose all-zero outcome is one no-op.
    selected_no_op = selection_root("selected", "selected", 2, 156)
    unselected_oracle = selection_root(
        "oracle", "oracle", 3, 155, {"pro": 1, "normal": 1, "fast": 1}
    )
    state_roots = {"s-oracle": [guard, selected_no_op, unselected_oracle]}
    state_selection = {
        "s-oracle": recompute_selection_event(
            "s-oracle", state_roots["s-oracle"], 56
        )
    }
    state_context = {
        "s-oracle": {
            "role": "validation",
            "shard_id": first_shard["shard_id"],
            "path": "synthetic",
        }
    }
    selected_summary = attested_role_summary(
        "validation", state_roots, state_selection, state_context, manifest
    )
    assert selected_summary["selected_repair_state_count"] == 0
    assert selected_summary["selected_override_no_op_count"] == 1
    selected_no_op["deltas"] = {"pro": -1, "normal": 0, "fast": 0}
    selected_summary = attested_role_summary(
        "validation", state_roots, state_selection, state_context, manifest
    )
    assert selected_summary["selected_budget_regression_count"] == 1

    passing_gate_summary = {
        "planned_shard_count": 6,
        "observed_shard_count": 6,
        "state_count": 12,
        "opening_cluster_count": 6,
        "selected_budget_regression_count": 0,
        "selected_save_violation_count": 0,
        "selected_override_no_op_count": 1,
        "selected_repair_state_count": 4,
        "selected_repair_opening_cluster_count": 4,
        "selected_repair_variants": ["classic", "swapped"],
        "selected_repair_source_duels": ["vs_shipping_fast", "vs_shipping_pro"],
        "selected_repair_colors": ["black", "white"],
    }
    assert not attested_gate_blockers("validation", passing_gate_summary, manifest)
    failing_gate_summary = dict(passing_gate_summary, selected_budget_regression_count=1)
    assert "validation_selected_budget_regression" in attested_gate_blockers(
        "validation", failing_gate_summary, manifest
    )

    control_rows: list[dict[str, Any]] = []
    for budget in BUDGETS:
        control_rows.append(
            synthetic_row(
                family="validation_f",
                role_tag="aw",
                state="control-state",
                root="control-guard",
                budget=budget,
                delta=0,
                guarded=True,
            )
        )
        control_rows.append(
            synthetic_row(
                family="validation_f",
                role_tag="aw",
                state="control-state",
                root="control-candidate",
                budget=budget,
                delta=0,
            )
        )
    drifted_control_rows = [json.loads(json.dumps(row)) for row in control_rows]
    drifted = next(
        row
        for row in drifted_control_rows
        if row["root_id"] == "control-candidate" and row["budget"] == "pro"
    )
    drifted.update(
        {
            "guarded_points": 0,
            "guarded_outcome": "loss",
            "root_points": 1,
            "root_outcome": "draw",
            "save_violation": False,
        }
    )
    try:
        attested_state_roots(drifted_control_rows)
    except CorpusError as exc:
        assert "guarded control drift" in str(exc)
    else:
        raise AssertionError("cross-root guarded control drift was accepted")
    drifted_metadata_rows = [json.loads(json.dumps(row)) for row in control_rows]
    for row in drifted_metadata_rows:
        if row["root_id"] == "control-candidate":
            row["source_ply"] = 2
            row["remaining_horizon"] = 2
    try:
        attested_state_roots(drifted_metadata_rows)
    except CorpusError as exc:
        assert "cross-root state metadata drift" in str(exc)
    else:
        raise AssertionError("cross-root horizon drift was accepted")

    provenance_text = (
        "generation_seed_tag=family|repeat_index=0|opening_index=0|variant=classic"
    )
    cluster_id = guarded_digest(f"cluster|{provenance_text}")
    sibling_id = guarded_digest(f"side_pair|{provenance_text}")
    provenance_root = {
        "source_fen": "fen-one",
        "remaining_horizon": 95,
        "generation_seed_tag": "family",
        "repeat_index": 0,
        "opening_index": 0,
        "variant": "classic",
        "opening_cluster_id": cluster_id,
        "side_sibling_id": sibling_id,
    }
    spoofed_provenance = dict(provenance_root, source_fen="fen-two")
    spoofed_provenance["opening_cluster_id"] = "0" * 16
    try:
        validate_attested_split_leakage(
            {"p1": [provenance_root], "p2": [spoofed_provenance]},
            {
                "p1": {"role": "validation"},
                "p2": {"role": "validation"},
            },
        )
    except CorpusError as exc:
        assert "does not match deterministic" in str(exc)
    else:
        raise AssertionError("spoofed provenance cluster id was accepted")
    duplicate_fen_other_horizon = dict(
        provenance_root,
        remaining_horizon=94,
        generation_seed_tag="family2",
    )
    second_provenance_text = (
        "generation_seed_tag=family2|repeat_index=0|opening_index=0|variant=classic"
    )
    duplicate_fen_other_horizon["opening_cluster_id"] = guarded_digest(
        f"cluster|{second_provenance_text}"
    )
    duplicate_fen_other_horizon["side_sibling_id"] = guarded_digest(
        f"side_pair|{second_provenance_text}"
    )
    try:
        validate_attested_split_leakage(
            {"f1": [provenance_root], "f2": [duplicate_fen_other_horizon]},
            {
                "f1": {"role": "validation"},
                "f2": {"role": "validation"},
            },
        )
    except CorpusError as exc:
        assert "multiple state ids or horizons" in str(exc)
    else:
        raise AssertionError("duplicate source FEN under another horizon was accepted")

    schema_payload = {
        "schema_version": 4,
        "candidate_independent": True,
        "record_grain": "state_root_budget",
        "source": "guarded_trace.candidate_turns/frontier_execute",
        "root_pool": "stable_guarded_scored_roots_total_capped_with_exact_guarded_root",
        "labels": "offline_only",
        "fields": sorted(FIELDS),
    }
    early_row = synthetic_row(
        family=validation_spec["seed_family_id"],
        role_tag="aw",
        state="early",
        root="early-guard",
        budget="pro",
        delta=0,
        guarded=True,
    )
    early_row.update(
        {
            "source_duel_id": "vs_shipping_pro",
            "generation_seed_tag": validation_spec["seed_family_id"],
            "repeat_index": 0,
            "opening_index": 0,
            "max_plies": 96,
            "remaining_horizon": 95,
            "root_limit": 6,
            "state_cap": 2,
        }
    )
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory) / "selection-after-root.log"
        path.write_text(
            "\n".join(
                (
                    SCHEMA_PREFIX + json.dumps(schema_payload),
                    ATTESTATION_PREFIX + json.dumps(attestation),
                    PREFIX + json.dumps(early_row),
                )
            )
        )
        try:
            load_attested_corpus([path], manifest, "validation")
        except CorpusError as exc:
            assert "selection must precede" in str(exc)
        else:
            raise AssertionError("root row before selection was accepted")
        try:
            load_rows([path], reject_attested_roles={"validation", "locked"})
        except CorpusError as exc:
            assert "not discovery input" in str(exc)
        else:
            raise AssertionError("scanner-facing loader accepted validation log")
    print("guarded-root-corpus-v4 self-test: ok")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("logs", nargs="*", type=Path)
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--phase", choices=ATTESTED_ROLES)
    parser.add_argument(
        "--discovery-artifact",
        action="append",
        default=[],
        metavar="MANIFEST_NAME=PATH",
    )
    parser.add_argument("--split-map", type=Path)
    parser.add_argument("--assign", action="append", default=[], metavar="FAMILY=ROLE")
    parser.add_argument("--frozen-rule-id")
    parser.add_argument("--locked-rule-id")
    parser.add_argument("--expected-split-digest")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    try:
        if args.self_test:
            self_test()
            if not args.logs:
                return 0
        if not args.logs:
            fail("at least one log path is required")
        if args.phase:
            if args.manifest is None:
                fail("--manifest is required with --phase")
            if (
                args.split_map is not None
                or args.assign
                or args.frozen_rule_id
                or args.locked_rule_id
                or args.expected_split_digest
            ):
                fail("legacy split/rule CLI authority is forbidden in attested mode")
            manifest = load_attested_manifest(args.manifest)
            discovery_artifacts = verify_discovery_artifacts(
                manifest, args.discovery_artifact
            )
            rows, selections, state_context = load_attested_corpus(
                args.logs, manifest, args.phase
            )
            summary = aggregate_attested(
                rows, selections, state_context, manifest, args.phase
            )
            summary["discovery_provenance"] = {
                "seed_family_id": manifest["discovery"]["seed_family_id"],
                "status": manifest["discovery"]["status"],
                "verified": True,
                "artifacts": discovery_artifacts,
                "can_grant_permission": False,
            }
        else:
            if args.manifest is not None or args.discovery_artifact:
                fail("--manifest/--discovery-artifact require an attested --phase")
            split_map = load_split_map(args.split_map, args.assign)
            summary = aggregate(
                load_rows(args.logs),
                split_map,
                args.frozen_rule_id,
                args.locked_rule_id,
                args.expected_split_digest,
            )
        rendered = json.dumps(summary, indent=2, sort_keys=True) + "\n"
        if args.output:
            args.output.write_text(rendered)
        sys.stdout.write(rendered)
        return 0
    except (CorpusError, OSError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
