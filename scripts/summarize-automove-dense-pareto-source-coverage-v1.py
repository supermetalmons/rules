#!/usr/bin/env python3
"""Validate the frozen three-duel dense-Pareto source-coverage pilot.

This is deliberately a source-only gate.  It authenticates the prospectively
fixed all-variant cells, provenance, color schedule, first-complete-prefix
chronology, and cross-duel disjointness.  It does not consume alternative-root
ranks, scores, features, or rollout labels.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import secrets
import stat
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence


SCHEMA_VERSION = 1
ARCHITECTURE_ID = "automove_dense_pareto_pairnet_v1"
SEED_FAMILY_ID = "automove_dense_pareto_pairnet_v1_source_coverage_20260712"
PROBE_DATA_ROLE = "coverage_only_never_model_data"
REPORT_ID = "automove_dense_pareto_source_coverage_family_v1"
MAX_INPUT_BYTES = 64 * 1024 * 1024

NAMESPACE = "DENSE_PARETO_SOURCE_COVERAGE_V1_"
SCHEMA_PREFIX = f"{NAMESPACE}SCHEMA "
PREFIX_PREFIX = f"{NAMESPACE}PREFIX "
SOURCE_PREFIX = f"{NAMESPACE}SOURCE "
SUMMARY_PREFIX = f"{NAMESPACE}SUMMARY "
DECISION_PREFIX = f"{NAMESPACE}DECISION "

VARIANTS = (
    "classic",
    "swapped_mana_rows",
    "offset_arc_mana_rows",
    "center_spoke_mana_rows",
    "alternating_mana_rows",
    "inner_wedge_mana_rows",
    "outer_wedge_mana_rows",
    "bent_center_mana_rows",
    "outer_edge_mana_rows",
    "split_flank_mana_rows",
    "forward_bridge_mana_rows",
    "corner_chain_mana_rows",
)
PANELS = ("guarded_loss", "guarded_save")
COLORS = ("black", "white")

ROLE_CONFIG = {
    "pro": {
        "duel": "vs_shipping_pro",
        "duel_index": 0,
        "color_phase": 0,
        "seed_suffix": "",
    },
    "normal": {
        "duel": "vs_shipping_normal",
        "duel_index": 1,
        "color_phase": 1,
        "seed_suffix": "_vs_normal",
    },
    "fast": {
        "duel": "vs_shipping_fast",
        "duel_index": 2,
        "color_phase": 0,
        "seed_suffix": "_vs_fast",
    },
}

SOURCE_FIELDS = (
    "schema_version",
    "architecture_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "seed_family_id",
    "source_duel_id",
    "duel_index",
    "variant",
    "variant_index",
    "source_panel",
    "source_result_audit_only",
    "panel_index",
    "color_phase",
    "required_color",
    "actual_color",
    "state_id",
    "source_fen",
    "guarded_move",
    "guarded_move_legal",
    "candidate_branch",
    "repeat_index",
    "opening_index",
    "opening_cluster_id",
    "side_sibling_id",
    "source_ply",
    "max_plies",
    "remaining_horizon",
    "source_candidate_turn_count",
    "eligible_frontier_execute_count",
    "cell_candidate_count",
    "source_identity_fnv64",
    "pair_distinct_cluster",
)

PREFIX_FIELDS = (
    "schema_version",
    "architecture_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "source_duel_id",
    "duel_index",
    "color_phase",
    "repeats_scanned",
    "candidate_count",
    "collapsed_candidate_count",
    "selected_sources",
    "selected_unique_clusters",
    "missing_buckets",
    "candidate_universe_digest_fnv64",
    "selection_digest_fnv64",
    "structurally_complete",
)

SCHEMA_FIELDS = (
    "schema_version",
    "architecture_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "probe_data_role",
    "record_prefix",
    "prefix_record_prefix",
    "selection_priority",
    "fixed_variants",
    "source_fields",
    "prefix_fields",
    "allowed_selection_inputs",
    "forbidden_inputs",
)

SUMMARY_FIELDS = (
    "schema_version",
    "architecture_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "probe_data_role",
    "seed_family_id",
    "source_duel_id",
    "duel_index",
    "color_phase",
    "repeat_offset",
    "min_scan_repeats",
    "max_scan_repeats",
    "repeats_scanned",
    "games_per_repeat",
    "max_plies",
    "expected_sources",
    "selected_sources",
    "source_rows_emitted",
    "candidate_count",
    "collapsed_candidate_count",
    "unique_source_fens",
    "unique_state_ids",
    "unique_clusters",
    "expected_clusters",
    "split_cluster_variants",
    "variant_counts",
    "panel_counts",
    "color_counts",
    "panel_color_counts",
    "missing_buckets",
    "violations",
    "selection_digest_fnv64",
    "coverage_pass",
    "root_pool_permission",
    "alternative_root_outcome_permission",
    "next_action",
)

DECISION_FIELDS = (
    "schema_version",
    "architecture_id",
    "source_duel_id",
    "coverage_pass",
    "decision",
    "authorization",
    "root_pool_permission",
    "alternative_root_outcome_permission",
)

ALLOWED_SELECTION_INPUTS = (
    "fixed_variant_registry",
    "fixed_color_phase",
    "source_duel",
    "source_panel",
    "source_result_to_panel_only",
    "candidate_color",
    "seed_family_id",
    "repeat_index",
    "opening_index",
    "opening_cluster_id",
    "source_ply",
    "source_fen",
    "guarded_move",
    "frontier_execute_eligibility",
)

FORBIDDEN_INPUTS = (
    "alternative_root_move",
    "root_pool",
    "root_rank",
    "root_score",
    "root_features",
    "forced_root_outcome",
    "forced_root_points",
    "outcome_delta",
    "save_violation",
    "model_output",
    "oracle_label",
)

HEX16 = re.compile(r"^[0-9a-f]{16}$")
STRUCTURED_RECORD = re.compile(r"^[A-Z][A-Z0-9_]*[ \t]+[\[{]")
HARNESS_OK = re.compile(
    r"^test result: ok\. 1 passed; 0 failed; 0 ignored; 0 measured; "
    r"[0-9]+ filtered out; finished in [0-9]+(?:\.[0-9]+)?s$"
)
FIXTURE_BOARD_FEN = (
    "n03y0xs0xd0xa0xe0xn03/n11/n11/n04xxmn01xxmn04/"
    "n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/"
    "n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n11/n11/"
    "n03E0xA0xD0xS0xY0xn03"
)


class CoverageError(ValueError):
    """A frozen input, provenance, or filesystem contract failed."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise CoverageError(message)


def is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def reject_json_constant(value: str) -> None:
    raise CoverageError(f"non-finite JSON constant {value!r} is forbidden")


def parse_json(text: str, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            text,
            object_pairs_hook=strict_object,
            parse_constant=reject_json_constant,
        )
    except json.JSONDecodeError as error:
        raise CoverageError(f"{label}: malformed JSON: {error}") from error
    require(isinstance(value, dict), f"{label}: JSON value must be an object")
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
        allow_nan=False,
    )


def fnv64(value: str) -> int:
    digest = 14_695_981_039_346_656_037
    for byte in value.encode("utf-8"):
        digest ^= byte
        digest = (digest * 1_099_511_628_211) & ((1 << 64) - 1)
    return digest


def fnv_hex(value: str) -> str:
    return f"{fnv64(value):016x}"


def require_keys(value: dict[str, Any], fields: Sequence[str], label: str) -> None:
    actual = set(value)
    expected = set(fields)
    extra = sorted(actual - expected)
    missing = sorted(expected - actual)
    require(not extra and not missing, f"{label}: field drift; extra={extra}, missing={missing}")


def require_text(value: Any, label: str) -> str:
    require(isinstance(value, str) and value, f"{label}: expected nonempty string")
    require(value == value.strip(), f"{label}: surrounding whitespace is forbidden")
    require(not any(ord(character) < 32 for character in value), f"{label}: control character")
    return value


def require_hex16(value: Any, label: str) -> str:
    require(isinstance(value, str) and HEX16.fullmatch(value) is not None, f"{label}: lowercase hex16 required")
    return value


def require_common(value: dict[str, Any], label: str) -> None:
    require(is_int(value["schema_version"]) and value["schema_version"] == SCHEMA_VERSION, f"{label}: schema version drift")
    require(value["architecture_id"] == ARCHITECTURE_ID, f"{label}: architecture drift")
    require(value["candidate_independent"] is True, f"{label}: candidate independence required")
    require(value["alternative_root_labels_used"] is False, f"{label}: alternative-root labels forbidden")


@dataclass(frozen=True)
class CapturedInput:
    path: Path
    raw: bytes
    size: int
    sha256: str
    device: int
    inode: int


@dataclass(frozen=True)
class ParsedLog:
    role: str
    capture: CapturedInput
    schema: dict[str, Any]
    prefixes: tuple[dict[str, Any], ...]
    sources: tuple[dict[str, Any], ...]
    summary: dict[str, Any]
    decision: dict[str, Any]


def read_stable_bytes(path: Path, label: str) -> CapturedInput:
    descriptor = -1
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        before = os.fstat(descriptor)
        require(stat.S_ISREG(before.st_mode), f"{label}: regular file required")
        require(before.st_size <= MAX_INPUT_BYTES, f"{label}: input exceeds fixed 64 MiB cap")
        chunks: list[bytes] = []
        while True:
            chunk = os.read(descriptor, 1 << 20)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(descriptor)
        require(
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
            == (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns),
            f"{label}: file changed during capture",
        )
        raw = b"".join(chunks)
        require(len(raw) == after.st_size, f"{label}: short or growing read")
        return CapturedInput(
            path=path,
            raw=raw,
            size=len(raw),
            sha256=hashlib.sha256(raw).hexdigest(),
            device=after.st_dev,
            inode=after.st_ino,
        )
    except OSError as error:
        raise CoverageError(f"{label}: unsafe or unreadable input {path}") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def parse_events(capture: CapturedInput, role: str) -> ParsedLog:
    label = f"{role} log"
    try:
        text = capture.raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise CoverageError(f"{label}: input is not UTF-8") from error

    schemas: list[dict[str, Any]] = []
    prefixes: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    harness_results: list[str] = []
    event_order: list[str] = []
    recognized = (
        (SCHEMA_PREFIX, "schema", schemas),
        (PREFIX_PREFIX, "prefix", prefixes),
        (SOURCE_PREFIX, "source", sources),
        (SUMMARY_PREFIX, "summary", summaries),
        (DECISION_PREFIX, "decision", decisions),
    )
    for line_number, line in enumerate(text.splitlines(), 1):
        left_stripped = line.lstrip(" \t")
        if line != left_stripped and (
            left_stripped.startswith(NAMESPACE)
            or STRUCTURED_RECORD.match(left_stripped)
        ):
            raise CoverageError(
                f"{label}:{line_number}: whitespace-prefixed structured record"
            )
        if line.startswith("test result:"):
            harness_results.append(line)
            continue
        matched = False
        for prefix, kind, destination in recognized:
            if line.startswith(prefix):
                payload = line[len(prefix) :]
                require(payload and payload == payload.strip(), f"{label}:{line_number}: noncanonical record spacing")
                destination.append(parse_json(payload, f"{label}:{line_number} {kind}"))
                event_order.append(kind)
                matched = True
                break
        if matched:
            continue
        if line.startswith(NAMESPACE) or STRUCTURED_RECORD.match(line):
            raise CoverageError(f"{label}:{line_number}: unexpected structured record or prefix")

    require(len(schemas) == 1, f"{label}: exactly one schema record required")
    require(len(prefixes) >= 1, f"{label}: at least one prefix record required")
    require(len(sources) == 24, f"{label}: exactly 24 source records required")
    require(len(summaries) == 1, f"{label}: exactly one summary record required")
    require(len(decisions) == 1, f"{label}: exactly one decision record required")
    require(
        len(harness_results) == 1 and HARNESS_OK.fullmatch(harness_results[0]) is not None,
        f"{label}: exactly one successful one-test Cargo harness result required",
    )
    require(
        event_order
        == ["schema"] + ["prefix"] * len(prefixes) + ["source"] * 24 + ["summary", "decision"],
        f"{label}: record chronology differs from frozen protocol",
    )
    parsed = ParsedLog(
        role=role,
        capture=capture,
        schema=schemas[0],
        prefixes=tuple(prefixes),
        sources=tuple(sources),
        summary=summaries[0],
        decision=decisions[0],
    )
    validate_log(parsed)
    return parsed


def validate_schema(value: dict[str, Any], label: str) -> None:
    require_keys(value, SCHEMA_FIELDS, label)
    require_common(value, label)
    require(value["probe_data_role"] == PROBE_DATA_ROLE, f"{label}: data role drift")
    require(value["record_prefix"] == SOURCE_PREFIX.rstrip(), f"{label}: source prefix drift")
    require(value["prefix_record_prefix"] == PREFIX_PREFIX.rstrip(), f"{label}: prefix prefix drift")
    require(
        value["selection_priority"] == "source_ply,repeat_index,opening_index,source_fen,guarded_move",
        f"{label}: selection priority drift",
    )
    require(value["fixed_variants"] == list(VARIANTS), f"{label}: variant registry drift")
    require(value["source_fields"] == list(SOURCE_FIELDS), f"{label}: source allowlist drift")
    require(value["prefix_fields"] == list(PREFIX_FIELDS), f"{label}: prefix allowlist drift")
    require(value["allowed_selection_inputs"] == list(ALLOWED_SELECTION_INPUTS), f"{label}: selection-input drift")
    require(value["forbidden_inputs"] == list(FORBIDDEN_INPUTS), f"{label}: forbidden-input declaration drift")


def expected_color(variant_index: int, panel_index: int, phase: int) -> str:
    return "white" if (variant_index + panel_index + phase) % 2 == 1 else "black"


def generation_seed_tag(role: str) -> str:
    return SEED_FAMILY_ID + str(ROLE_CONFIG[role]["seed_suffix"])


def opening_ids(role: str, repeat_index: int, opening_index: int, variant: str) -> tuple[str, str]:
    provenance = (
        f"generation_seed_tag={generation_seed_tag(role)}|repeat_index={repeat_index}"
        f"|opening_index={opening_index}|variant={variant}"
    )
    return (fnv_hex(f"cluster|{provenance}"), fnv_hex(f"side_pair|{provenance}"))


def state_id(source_fen: str, remaining_horizon: int) -> str:
    return fnv_hex(
        f"schema_version={SCHEMA_VERSION}|architecture={ARCHITECTURE_ID}"
        f"|source_fen={source_fen}|remaining_horizon={remaining_horizon}"
    )


def validate_source_fen(
    source_fen: str,
    actual_color: str,
    variant_index: int,
    label: str,
) -> None:
    fields = source_fen.split()
    require(source_fen == " ".join(fields), f"{label}: source FEN whitespace is not canonical")
    expected_token = "w" if actual_color == "white" else "b"
    if variant_index == 0:
        require(len(fields) == 10, f"{label}: Classic source FEN must have exactly 10 fields")
    else:
        require(len(fields) == 11, f"{label}: non-Classic source FEN must have exactly 11 fields")
        require(fields[10] == str(variant_index), f"{label}: source FEN variant ID mismatch")
    require(fields[2] == expected_token, f"{label}: source FEN active color mismatch")
    for index in (0, 1, 3, 4, 5, 6, 7, 8):
        require(
            re.fullmatch(r"0|[1-9][0-9]*", fields[index]) is not None,
            f"{label}: numeric field {index} is not canonical nonnegative decimal",
        )


def source_identity(value: dict[str, Any]) -> str:
    return fnv_hex(
        f"pairnet_source_coverage_v1|seed_family={SEED_FAMILY_ID}"
        f"|duel={value['source_duel_id']}|repeat={value['repeat_index']}"
        f"|opening={value['opening_index']}|ply={value['source_ply']}"
        f"|source_fen={value['source_fen']}|guarded_move={value['guarded_move']}"
    )


def selection_digest(sources: Sequence[dict[str, Any]]) -> str:
    ordered = sorted(sources, key=lambda row: (row["variant_index"], row["panel_index"]))
    canonical = "\n".join(
        f"{row['variant_index']}|{row['panel_index']}|{row['state_id']}"
        f"|{row['opening_cluster_id']}|{row['repeat_index']}|{row['opening_index']}"
        f"|{row['source_ply']}|{row['source_identity_fnv64']}"
        for row in ordered
    )
    return fnv_hex(f"dense_pareto_source_selection_v1\n{canonical}")


def validate_source(value: dict[str, Any], role: str, label: str) -> None:
    require_keys(value, SOURCE_FIELDS, label)
    require(not (set(value) & set(FORBIDDEN_INPUTS)), f"{label}: forbidden alternative-root key")
    require_common(value, label)
    config = ROLE_CONFIG[role]
    require(value["seed_family_id"] == SEED_FAMILY_ID, f"{label}: seed family drift")
    require(value["source_duel_id"] == config["duel"], f"{label}: duel drift")
    require(is_int(value["duel_index"]) and value["duel_index"] == config["duel_index"], f"{label}: duel index drift")
    require(is_int(value["variant_index"]) and 0 <= value["variant_index"] < len(VARIANTS), f"{label}: variant index")
    variant_index = value["variant_index"]
    require(value["variant"] == VARIANTS[variant_index], f"{label}: variant registry mismatch")
    require(value["source_panel"] in PANELS, f"{label}: panel")
    panel_index = PANELS.index(value["source_panel"])
    require(is_int(value["panel_index"]) and value["panel_index"] == panel_index, f"{label}: panel index")
    result = value["source_result_audit_only"]
    require(result in ("loss", "win", "draw"), f"{label}: source-result audit token")
    require(
        (panel_index == 0 and result == "loss") or (panel_index == 1 and result in ("win", "draw")),
        f"{label}: source-result audit disagrees with panel",
    )
    require(is_int(value["color_phase"]) and value["color_phase"] == config["color_phase"], f"{label}: color phase drift")
    color = expected_color(variant_index, panel_index, value["color_phase"])
    require(value["required_color"] == color and value["actual_color"] == color, f"{label}: checkerboard color mismatch")
    require_hex16(value["state_id"], f"{label}.state_id")
    source_fen = require_text(value["source_fen"], f"{label}.source_fen")
    validate_source_fen(source_fen, value["actual_color"], variant_index, f"{label}.source_fen")
    guarded_move = require_text(value["guarded_move"], f"{label}.guarded_move")
    require(value["guarded_move_legal"] is True, f"{label}: guarded move must be legal")
    require(value["candidate_branch"] == "frontier_execute", f"{label}: candidate branch drift")
    require(is_int(value["repeat_index"]) and value["repeat_index"] >= 0, f"{label}: repeat index")
    require(is_int(value["opening_index"]) and value["opening_index"] == variant_index, f"{label}: opening/variant mismatch")
    expected_cluster, expected_sibling = opening_ids(role, value["repeat_index"], value["opening_index"], value["variant"])
    require_hex16(value["opening_cluster_id"], f"{label}.opening_cluster_id")
    require(value["opening_cluster_id"] == expected_cluster, f"{label}: opening-cluster provenance mismatch")
    require_hex16(value["side_sibling_id"], f"{label}.side_sibling_id")
    require(value["side_sibling_id"] == expected_sibling, f"{label}: side-sibling provenance mismatch")
    require(is_int(value["source_ply"]) and 0 <= value["source_ply"] < 96, f"{label}: source ply")
    require(is_int(value["max_plies"]) and value["max_plies"] == 96, f"{label}: max plies drift")
    remaining = 96 - value["source_ply"]
    require(is_int(value["remaining_horizon"]) and value["remaining_horizon"] == remaining, f"{label}: remaining horizon")
    require(value["state_id"] == state_id(source_fen, remaining), f"{label}: state digest mismatch")
    require(is_int(value["source_candidate_turn_count"]) and value["source_candidate_turn_count"] >= 1, f"{label}: source turn count")
    require(is_int(value["eligible_frontier_execute_count"]) and 1 <= value["eligible_frontier_execute_count"] <= value["source_candidate_turn_count"], f"{label}: eligible turn count")
    require(is_int(value["cell_candidate_count"]) and value["cell_candidate_count"] >= 1, f"{label}: cell candidate count")
    require_hex16(value["source_identity_fnv64"], f"{label}.source_identity_fnv64")
    require(value["source_identity_fnv64"] == source_identity(value), f"{label}: source identity digest mismatch")
    require(value["pair_distinct_cluster"] is True, f"{label}: split-cluster pair required")
    del guarded_move


def validate_prefix(value: dict[str, Any], role: str, label: str) -> None:
    require_keys(value, PREFIX_FIELDS, label)
    require_common(value, label)
    config = ROLE_CONFIG[role]
    require(value["source_duel_id"] == config["duel"], f"{label}: duel drift")
    require(is_int(value["duel_index"]) and value["duel_index"] == config["duel_index"], f"{label}: duel index")
    require(is_int(value["color_phase"]) and value["color_phase"] == config["color_phase"], f"{label}: color phase")
    for field in ("repeats_scanned", "candidate_count", "collapsed_candidate_count", "selected_sources", "selected_unique_clusters"):
        require(is_int(value[field]) and value[field] >= 0, f"{label}: invalid {field}")
    require(4 <= value["repeats_scanned"] <= 32, f"{label}: repeat prefix outside fixed scan")
    require(value["candidate_count"] >= value["collapsed_candidate_count"] >= value["selected_sources"], f"{label}: impossible candidate/selection counts")
    require(value["selected_sources"] <= 24 and value["selected_sources"] % 2 == 0, f"{label}: selected source count")
    require(value["selected_unique_clusters"] == value["selected_sources"], f"{label}: selected clusters must be unique")
    missing = value["missing_buckets"]
    require(isinstance(missing, list) and all(isinstance(item, str) and item for item in missing), f"{label}: missing buckets")
    require(missing == sorted(set(missing)), f"{label}: missing buckets must be sorted and unique")
    require_hex16(value["candidate_universe_digest_fnv64"], f"{label}.candidate_universe_digest_fnv64")
    require_hex16(value["selection_digest_fnv64"], f"{label}.selection_digest_fnv64")
    require(type(value["structurally_complete"]) is bool, f"{label}: structurally_complete must be boolean")
    structural = value["selected_sources"] == 24 and value["selected_unique_clusters"] == 24 and not missing
    require(value["structurally_complete"] is structural, f"{label}: structural-completeness flag mismatch")


def count_entries(counter: Counter[str]) -> list[str]:
    return [f"{key}={counter[key]}" for key in sorted(counter)]


def validate_log(parsed: ParsedLog) -> None:
    role = parsed.role
    label = f"{role} log"
    require(role in ROLE_CONFIG, f"{label}: unknown role")
    validate_schema(parsed.schema, f"{label} schema")
    for index, prefix in enumerate(parsed.prefixes):
        validate_prefix(prefix, role, f"{label} prefix[{index}]")
    repetitions = [prefix["repeats_scanned"] for prefix in parsed.prefixes]
    require(repetitions == list(range(4, repetitions[-1] + 1)), f"{label}: prefix chronology must be consecutive from repeat 4")
    require(all(not prefix["structurally_complete"] for prefix in parsed.prefixes[:-1]), f"{label}: only final prefix may be structurally complete")
    require(parsed.prefixes[-1]["structurally_complete"] is True, f"{label}: final prefix must be first structurally complete prefix")
    for left, right in zip(parsed.prefixes, parsed.prefixes[1:]):
        require(right["candidate_count"] >= left["candidate_count"], f"{label}: candidate count decreased")
        require(right["collapsed_candidate_count"] >= left["collapsed_candidate_count"], f"{label}: collapsed count decreased")
        require(right["selected_sources"] >= left["selected_sources"], f"{label}: selected count decreased")
        if right["candidate_count"] == left["candidate_count"]:
            require(right["candidate_universe_digest_fnv64"] == left["candidate_universe_digest_fnv64"], f"{label}: unchanged candidate count changed universe digest")

    for index, source in enumerate(parsed.sources):
        validate_source(source, role, f"{label} source[{index}]")
    expected_order = [(variant_index, panel_index) for variant_index in range(12) for panel_index in range(2)]
    actual_order = [(row["variant_index"], row["panel_index"]) for row in parsed.sources]
    require(actual_order == expected_order, f"{label}: source rows are not in canonical cell order")
    require(len(set(actual_order)) == 24, f"{label}: duplicate or missing variant/panel cell")

    fens = {row["source_fen"] for row in parsed.sources}
    states = {row["state_id"] for row in parsed.sources}
    clusters = {row["opening_cluster_id"] for row in parsed.sources}
    require(len(fens) == 24, f"{label}: source FENs must be unique")
    require(len(states) == 24, f"{label}: state IDs must be unique")
    require(len(clusters) == 24, f"{label}: opening clusters must be exactly 24 unique values")
    for variant_index in range(12):
        pair = [row for row in parsed.sources if row["variant_index"] == variant_index]
        require(len({row["opening_cluster_id"] for row in pair}) == 2, f"{label}: variant {variant_index} is not split-cluster")

    variant_counts = Counter(row["variant"] for row in parsed.sources)
    panel_counts = Counter(row["source_panel"] for row in parsed.sources)
    color_counts = Counter(row["actual_color"] for row in parsed.sources)
    panel_color_counts = Counter(f"{row['source_panel']}|{row['actual_color']}" for row in parsed.sources)
    require(all(variant_counts[name] == 2 for name in VARIANTS), f"{label}: each variant must occur twice")
    require(panel_counts == Counter({"guarded_loss": 12, "guarded_save": 12}), f"{label}: panel balance")
    require(color_counts == Counter({"black": 12, "white": 12}), f"{label}: color balance")
    require(all(panel_color_counts[f"{panel}|{color}"] == 6 for panel in PANELS for color in COLORS), f"{label}: panel/color balance")

    summary = parsed.summary
    require_keys(summary, SUMMARY_FIELDS, f"{label} summary")
    require_common(summary, f"{label} summary")
    config = ROLE_CONFIG[role]
    exact_summary = {
        "probe_data_role": PROBE_DATA_ROLE,
        "seed_family_id": SEED_FAMILY_ID,
        "source_duel_id": config["duel"],
        "duel_index": config["duel_index"],
        "color_phase": config["color_phase"],
        "repeat_offset": 0,
        "min_scan_repeats": 4,
        "max_scan_repeats": 32,
        "games_per_repeat": 12,
        "max_plies": 96,
        "expected_sources": 24,
        "selected_sources": 24,
        "source_rows_emitted": 24,
        "unique_source_fens": 24,
        "unique_state_ids": 24,
        "unique_clusters": 24,
        "expected_clusters": 24,
        "split_cluster_variants": 12,
        "missing_buckets": [],
        "violations": [],
        "coverage_pass": True,
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
        "next_action": "freeze_pilot_manifest_and_precommit_fresh_source_family",
    }
    for field, expected in exact_summary.items():
        require(
            type(summary[field]) is type(expected) and summary[field] == expected,
            f"{label} summary: {field} drift",
        )
    require(is_int(summary["repeats_scanned"]) and summary["repeats_scanned"] == repetitions[-1], f"{label} summary: repeat prefix mismatch")
    require(is_int(summary["candidate_count"]) and summary["candidate_count"] >= 24, f"{label} summary: candidate count")
    require(is_int(summary["collapsed_candidate_count"]) and 24 <= summary["collapsed_candidate_count"] <= summary["candidate_count"], f"{label} summary: collapsed count")
    require(summary["candidate_count"] == parsed.prefixes[-1]["candidate_count"], f"{label} summary: final candidate count mismatch")
    require(summary["collapsed_candidate_count"] == parsed.prefixes[-1]["collapsed_candidate_count"], f"{label} summary: final collapsed count mismatch")
    require(summary["variant_counts"] == count_entries(variant_counts), f"{label} summary: variant counts mismatch")
    require(summary["panel_counts"] == count_entries(panel_counts), f"{label} summary: panel counts mismatch")
    require(summary["color_counts"] == count_entries(color_counts), f"{label} summary: color counts mismatch")
    require(summary["panel_color_counts"] == count_entries(panel_color_counts), f"{label} summary: panel/color counts mismatch")
    digest = selection_digest(parsed.sources)
    require(summary["selection_digest_fnv64"] == digest, f"{label} summary: selection digest mismatch")
    require(parsed.prefixes[-1]["selection_digest_fnv64"] == digest, f"{label}: final prefix selection digest mismatch")
    require(sum(row["cell_candidate_count"] for row in parsed.sources) <= summary["candidate_count"], f"{label}: cell candidate counts exceed candidate universe")
    require(summary["collapsed_candidate_count"] <= sum(row["cell_candidate_count"] for row in parsed.sources), f"{label}: collapsed count exceeds selected-cell candidates")
    require(all(row["repeat_index"] < summary["repeats_scanned"] for row in parsed.sources), f"{label}: selected source lies beyond frozen prefix")

    decision = parsed.decision
    require_keys(decision, DECISION_FIELDS, f"{label} decision")
    require(is_int(decision["schema_version"]) and decision["schema_version"] == SCHEMA_VERSION, f"{label} decision: schema drift")
    require(decision["architecture_id"] == ARCHITECTURE_ID, f"{label} decision: architecture drift")
    require(decision["source_duel_id"] == config["duel"], f"{label} decision: duel drift")
    require(decision["coverage_pass"] is True, f"{label} decision: passing coverage required")
    require(decision["decision"] == "go_freeze_pilot_source_manifest", f"{label} decision: route drift")
    require(decision["authorization"] == "freeze_pilot_manifest_only", f"{label} decision: authorization drift")
    require(decision["root_pool_permission"] is False, f"{label} decision: root-pool permission forbidden")
    require(decision["alternative_root_outcome_permission"] is False, f"{label} decision: alternative-root permission forbidden")


def build_report(logs: Sequence[ParsedLog]) -> dict[str, Any]:
    require([log.role for log in logs] == ["pro", "normal", "fast"], "combined audit requires pro, normal, fast order")
    sources = [row for log in logs for row in log.sources]
    sources.sort(key=lambda row: (row["duel_index"], row["variant_index"], row["panel_index"]))
    violations: list[str] = []

    cells = {(row["source_duel_id"], row["variant"], row["source_panel"]) for row in sources}
    fens = {row["source_fen"] for row in sources}
    states = {row["state_id"] for row in sources}
    clusters = {row["opening_cluster_id"] for row in sources}
    duel_counts = Counter(row["source_duel_id"] for row in sources)
    variant_counts = Counter(row["variant"] for row in sources)
    panel_counts = Counter(row["source_panel"] for row in sources)
    color_counts = Counter(row["actual_color"] for row in sources)
    if len(sources) != 72:
        violations.append(f"source_count={len(sources)}")
    if len(cells) != 72:
        violations.append(f"unique_cells={len(cells)}")
    if len(fens) != 72:
        violations.append(f"unique_source_fens={len(fens)}")
    if len(states) != 72:
        violations.append(f"unique_state_ids={len(states)}")
    if len(clusters) != 72:
        violations.append(f"unique_clusters={len(clusters)}")
    expected_duels = Counter({str(ROLE_CONFIG[role]["duel"]): 24 for role in ("pro", "normal", "fast")})
    if duel_counts != expected_duels:
        violations.append("duel_counts")
    if any(variant_counts[variant] != 6 for variant in VARIANTS):
        violations.append("variant_counts")
    if panel_counts != Counter({"guarded_loss": 36, "guarded_save": 36}):
        violations.append("panel_counts")
    if color_counts != Counter({"black": 36, "white": 36}):
        violations.append("color_counts")

    variant_panel_colors = []
    for variant in VARIANTS:
        for panel in PANELS:
            colors = sorted({row["actual_color"] for row in sources if row["variant"] == variant and row["source_panel"] == panel})
            variant_panel_colors.append({"variant": variant, "panel": panel, "colors": colors})
            if colors != ["black", "white"]:
                violations.append(f"missing_cross-duel_color={variant}|{panel}")

    for left_index, left in enumerate(logs):
        for right in logs[left_index + 1 :]:
            for field in ("source_fen", "state_id", "opening_cluster_id"):
                left_values = {row[field] for row in left.sources}
                right_values = {row[field] for row in right.sources}
                if left_values & right_values:
                    violations.append(f"cross_duel_overlap={left.role}|{right.role}|{field}")
    violations = sorted(set(violations))
    decision = "go_precommit_fresh_source_family" if not violations else "fail_source_coverage_family"
    return {
        "schema_version": SCHEMA_VERSION,
        "report_id": REPORT_ID,
        "architecture_id": ARCHITECTURE_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "probe_data_role": PROBE_DATA_ROLE,
        "inputs": [
            {
                "role": log.role,
                "source_duel_id": ROLE_CONFIG[log.role]["duel"],
                "path": log.capture.path.as_posix(),
                "sha256": log.capture.sha256,
                "size_bytes": log.capture.size,
                "repeats_scanned": log.summary["repeats_scanned"],
                "candidate_universe_digest_fnv64": log.prefixes[-1]["candidate_universe_digest_fnv64"],
                "selection_digest_fnv64": log.summary["selection_digest_fnv64"],
            }
            for log in logs
        ],
        "source_manifest": sources,
        "combined_counts": {
            "sources": len(sources),
            "unique_cells": len(cells),
            "unique_source_fens": len(fens),
            "unique_state_ids": len(states),
            "unique_clusters": len(clusters),
            "duel_counts": dict(sorted(duel_counts.items())),
            "variant_counts": dict(sorted(variant_counts.items())),
            "panel_counts": dict(sorted(panel_counts.items())),
            "color_counts": dict(sorted(color_counts.items())),
            "variant_panel_colors": variant_panel_colors,
        },
        "requirements": {
            "sources": 72,
            "unique_cells": 72,
            "unique_source_fens": 72,
            "unique_state_ids": 72,
            "unique_clusters": 72,
            "sources_per_duel": 24,
            "sources_per_variant": 6,
            "sources_per_panel": 36,
            "sources_per_color": 36,
            "both_colors_per_variant_panel": True,
            "cross_duel_overlap_allowed": False,
        },
        "violations": violations,
        "coverage_pass": not violations,
        "decision": decision,
        "authorization": "fresh_source_family_precommit_only" if not violations else "none",
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
    }


def report_exit_code(report: dict[str, Any]) -> int:
    return 0 if report.get("coverage_pass") is True else 1


def validate_output_path(path: Path) -> tuple[str, ...]:
    text = path.as_posix()
    require(text and not path.is_absolute() and "\\" not in text, "output must be a relative POSIX path")
    parts = path.parts
    require(len(parts) >= 3 and parts[:2] == ("target", "experiment-runs"), "output must be within target/experiment-runs")
    require(path == Path(text) and all(part not in ("", ".", "..") for part in parts), "output path must be normalized and contained")
    return parts


def exclusive_atomic_write(path: Path, raw: bytes) -> None:
    parts = validate_output_path(path)
    root_fd = os.open(".", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    parent_fd = os.dup(root_fd)
    temporary_name: str | None = None
    temporary_fd = -1
    try:
        for part in parts[:-1]:
            next_fd = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=parent_fd)
            os.close(parent_fd)
            parent_fd = next_fd
        try:
            os.stat(parts[-1], dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise CoverageError(f"refusing existing or symlink output {path}")
        temporary_name = f".{parts[-1]}.tmp.{os.getpid()}.{secrets.token_hex(8)}"
        temporary_fd = os.open(
            temporary_name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
            0o600,
            dir_fd=parent_fd,
        )
        offset = 0
        while offset < len(raw):
            written = os.write(temporary_fd, raw[offset:])
            require(written > 0, "short output write")
            offset += written
        os.fsync(temporary_fd)
        os.close(temporary_fd)
        temporary_fd = -1
        os.link(
            temporary_name,
            parts[-1],
            src_dir_fd=parent_fd,
            dst_dir_fd=parent_fd,
            follow_symlinks=False,
        )
        os.fsync(parent_fd)
        os.unlink(temporary_name, dir_fd=parent_fd)
        temporary_name = None
        os.fsync(parent_fd)
    except CoverageError:
        raise
    except OSError as error:
        raise CoverageError(f"refusing unsafe, missing-parent, or existing output {path}") from error
    finally:
        if temporary_fd >= 0:
            os.close(temporary_fd)
        if temporary_name is not None:
            try:
                os.unlink(temporary_name, dir_fd=parent_fd)
            except OSError:
                pass
        os.close(parent_fd)
        os.close(root_fd)


def fixture_source(role: str, variant_index: int, panel_index: int, namespace: str) -> dict[str, Any]:
    config = ROLE_CONFIG[role]
    variant = VARIANTS[variant_index]
    panel = PANELS[panel_index]
    color = expected_color(variant_index, panel_index, int(config["color_phase"]))
    repeat_index = panel_index
    source_ply = variant_index * 2 + panel_index
    active_color = "w" if color == "white" else "b"
    namespace_turn = {"pro": 100, "normal": 200, "fast": 300}[namespace]
    turn_number = namespace_turn + variant_index * 2 + panel_index
    source_fen = f"0 0 {active_color} 0 0 0 0 0 {turn_number} {FIXTURE_BOARD_FEN}"
    if variant_index != 0:
        source_fen += f" {variant_index}"
    guarded_move = f"m{variant_index}-{panel_index}"
    cluster, sibling = opening_ids(role, repeat_index, variant_index, variant)
    remaining = 96 - source_ply
    row: dict[str, Any] = {
        "schema_version": 1,
        "architecture_id": ARCHITECTURE_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "seed_family_id": SEED_FAMILY_ID,
        "source_duel_id": config["duel"],
        "duel_index": config["duel_index"],
        "variant": variant,
        "variant_index": variant_index,
        "source_panel": panel,
        "source_result_audit_only": "loss" if panel_index == 0 else "win",
        "panel_index": panel_index,
        "color_phase": config["color_phase"],
        "required_color": color,
        "actual_color": color,
        "state_id": state_id(source_fen, remaining),
        "source_fen": source_fen,
        "guarded_move": guarded_move,
        "guarded_move_legal": True,
        "candidate_branch": "frontier_execute",
        "repeat_index": repeat_index,
        "opening_index": variant_index,
        "opening_cluster_id": cluster,
        "side_sibling_id": sibling,
        "source_ply": source_ply,
        "max_plies": 96,
        "remaining_horizon": remaining,
        "source_candidate_turn_count": 1,
        "eligible_frontier_execute_count": 1,
        "cell_candidate_count": 1,
        "source_identity_fnv64": "0" * 16,
        "pair_distinct_cluster": True,
    }
    row["source_identity_fnv64"] = source_identity(row)
    return row


def fixture_schema() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "architecture_id": ARCHITECTURE_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "probe_data_role": PROBE_DATA_ROLE,
        "record_prefix": SOURCE_PREFIX.rstrip(),
        "prefix_record_prefix": PREFIX_PREFIX.rstrip(),
        "selection_priority": "source_ply,repeat_index,opening_index,source_fen,guarded_move",
        "fixed_variants": list(VARIANTS),
        "source_fields": list(SOURCE_FIELDS),
        "prefix_fields": list(PREFIX_FIELDS),
        "allowed_selection_inputs": list(ALLOWED_SELECTION_INPUTS),
        "forbidden_inputs": list(FORBIDDEN_INPUTS),
    }


def fixture_log(role: str, namespace: str | None = None) -> bytes:
    namespace = role if namespace is None else namespace
    sources = [fixture_source(role, variant_index, panel_index, namespace) for variant_index in range(12) for panel_index in range(2)]
    digest = selection_digest(sources)
    config = ROLE_CONFIG[role]
    prefix = {
        "schema_version": 1,
        "architecture_id": ARCHITECTURE_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "source_duel_id": config["duel"],
        "duel_index": config["duel_index"],
        "color_phase": config["color_phase"],
        "repeats_scanned": 4,
        "candidate_count": 24,
        "collapsed_candidate_count": 24,
        "selected_sources": 24,
        "selected_unique_clusters": 24,
        "missing_buckets": [],
        "candidate_universe_digest_fnv64": fnv_hex(f"fixture-universe-{role}-{namespace}"),
        "selection_digest_fnv64": digest,
        "structurally_complete": True,
    }
    variant_counts = Counter(row["variant"] for row in sources)
    panel_counts = Counter(row["source_panel"] for row in sources)
    color_counts = Counter(row["actual_color"] for row in sources)
    panel_color_counts = Counter(f"{row['source_panel']}|{row['actual_color']}" for row in sources)
    summary = {
        "schema_version": 1,
        "architecture_id": ARCHITECTURE_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "probe_data_role": PROBE_DATA_ROLE,
        "seed_family_id": SEED_FAMILY_ID,
        "source_duel_id": config["duel"],
        "duel_index": config["duel_index"],
        "color_phase": config["color_phase"],
        "repeat_offset": 0,
        "min_scan_repeats": 4,
        "max_scan_repeats": 32,
        "repeats_scanned": 4,
        "games_per_repeat": 12,
        "max_plies": 96,
        "expected_sources": 24,
        "selected_sources": 24,
        "source_rows_emitted": 24,
        "candidate_count": 24,
        "collapsed_candidate_count": 24,
        "unique_source_fens": 24,
        "unique_state_ids": 24,
        "unique_clusters": 24,
        "expected_clusters": 24,
        "split_cluster_variants": 12,
        "variant_counts": count_entries(variant_counts),
        "panel_counts": count_entries(panel_counts),
        "color_counts": count_entries(color_counts),
        "panel_color_counts": count_entries(panel_color_counts),
        "missing_buckets": [],
        "violations": [],
        "selection_digest_fnv64": digest,
        "coverage_pass": True,
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
        "next_action": "freeze_pilot_manifest_and_precommit_fresh_source_family",
    }
    decision = {
        "schema_version": 1,
        "architecture_id": ARCHITECTURE_ID,
        "source_duel_id": config["duel"],
        "coverage_pass": True,
        "decision": "go_freeze_pilot_source_manifest",
        "authorization": "freeze_pilot_manifest_only",
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
    }
    lines = [
        SCHEMA_PREFIX + canonical_json(fixture_schema()),
        PREFIX_PREFIX + canonical_json(prefix),
        *(SOURCE_PREFIX + canonical_json(source) for source in sources),
        SUMMARY_PREFIX + canonical_json(summary),
        DECISION_PREFIX + canonical_json(decision),
    ]
    return (
        "running 1 test\n"
        + "\n".join(lines)
        + "\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 999 filtered out; finished in 0.01s\n"
    ).encode("utf-8")


def synthetic_capture(role: str, raw: bytes) -> CapturedInput:
    return CapturedInput(
        path=Path(f"{role}.log"),
        raw=raw,
        size=len(raw),
        sha256=hashlib.sha256(raw).hexdigest(),
        device=1,
        inode={"pro": 1, "normal": 2, "fast": 3}[role],
    )


def expect_error(action: Any, message: str) -> None:
    try:
        action()
    except CoverageError:
        return
    raise CoverageError(message)


def mutate_first_source(raw: bytes, mutation: Any) -> bytes:
    lines = raw.decode("utf-8").splitlines()
    index = next(index for index, line in enumerate(lines) if line.startswith(SOURCE_PREFIX))
    value = parse_json(lines[index][len(SOURCE_PREFIX) :], "fixture source mutation")
    mutation(value)
    lines[index] = SOURCE_PREFIX + canonical_json(value)
    return ("\n".join(lines) + "\n").encode("utf-8")


def mutate_first_source_with_consistent_digests(raw: bytes, mutation: Any) -> bytes:
    lines = raw.decode("utf-8").splitlines()
    source_entries = [
        (index, parse_json(line[len(SOURCE_PREFIX) :], "coherent fixture source"))
        for index, line in enumerate(lines)
        if line.startswith(SOURCE_PREFIX)
    ]
    require(len(source_entries) == 24, "coherent fixture needs 24 sources")
    first_index, first = source_entries[0]
    mutation(first)
    first["state_id"] = state_id(first["source_fen"], first["remaining_horizon"])
    first["source_identity_fnv64"] = source_identity(first)
    lines[first_index] = SOURCE_PREFIX + canonical_json(first)
    sources = [value for _, value in source_entries]
    digest = selection_digest(sources)

    prefix_indices = [
        index for index, line in enumerate(lines) if line.startswith(PREFIX_PREFIX)
    ]
    require(len(prefix_indices) == 1, "coherent fixture expects one prefix")
    prefix_index = prefix_indices[0]
    prefix = parse_json(
        lines[prefix_index][len(PREFIX_PREFIX) :], "coherent fixture prefix"
    )
    prefix["selection_digest_fnv64"] = digest
    lines[prefix_index] = PREFIX_PREFIX + canonical_json(prefix)

    summary_index = next(
        index for index, line in enumerate(lines) if line.startswith(SUMMARY_PREFIX)
    )
    summary = parse_json(
        lines[summary_index][len(SUMMARY_PREFIX) :], "coherent fixture summary"
    )
    summary["selection_digest_fnv64"] = digest
    lines[summary_index] = SUMMARY_PREFIX + canonical_json(summary)
    return ("\n".join(lines) + "\n").encode("utf-8")


def self_test() -> None:
    expect_error(lambda: parse_json('{"a":', "malformed fixture"), "malformed JSON was accepted")
    expect_error(lambda: parse_json('{"a":1,"a":2}', "duplicate fixture"), "duplicate JSON key was accepted")
    expect_error(lambda: parse_json('{"a":NaN}', "nonfinite fixture"), "nonfinite JSON was accepted")

    parsed = [parse_events(synthetic_capture(role, fixture_log(role)), role) for role in ("pro", "normal", "fast")]
    report = build_report(parsed)
    require(report["decision"] == "go_precommit_fresh_source_family", "passing fixture did not pass")
    require(report_exit_code(report) == 0, "passing fixture exit status")
    require(len(report["source_manifest"]) == 72, "passing fixture manifest size")

    harness_line = (
        "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; "
        "999 filtered out; finished in 0.01s"
    )
    missing_harness_raw = fixture_log("pro").decode("utf-8").replace(
        harness_line + "\n", ""
    ).encode("utf-8")
    expect_error(
        lambda: parse_events(synthetic_capture("pro", missing_harness_raw), "pro"),
        "missing Cargo harness result was accepted",
    )
    failed_harness_raw = fixture_log("pro").decode("utf-8").replace(
        harness_line, "test result: FAILED. 0 passed; 1 failed"
    ).encode("utf-8")
    expect_error(
        lambda: parse_events(synthetic_capture("pro", failed_harness_raw), "pro"),
        "failed Cargo harness result was accepted",
    )
    duplicate_harness_raw = fixture_log("pro") + (harness_line + "\n").encode("utf-8")
    expect_error(
        lambda: parse_events(synthetic_capture("pro", duplicate_harness_raw), "pro"),
        "duplicate Cargo harness result was accepted",
    )
    whitespace_record_raw = fixture_log("pro") + (
        "  " + SOURCE_PREFIX + canonical_json(fixture_source("pro", 0, 0, "pro")) + "\n"
    ).encode("utf-8")
    expect_error(
        lambda: parse_events(synthetic_capture("pro", whitespace_record_raw), "pro"),
        "whitespace-prefixed structured record was accepted",
    )

    missing_lines = fixture_log("pro").decode("utf-8").splitlines()
    removed = False
    kept = []
    for line in missing_lines:
        if line.startswith(SOURCE_PREFIX) and not removed:
            removed = True
            continue
        kept.append(line)
    missing_raw = ("\n".join(kept) + "\n").encode("utf-8")
    expect_error(lambda: parse_events(synthetic_capture("pro", missing_raw), "pro"), "missing source cell was accepted")

    forbidden_raw = mutate_first_source(fixture_log("pro"), lambda row: row.__setitem__("root_rank", 1))
    expect_error(lambda: parse_events(synthetic_capture("pro", forbidden_raw), "pro"), "forbidden source key was accepted")
    phase_raw = mutate_first_source(fixture_log("normal"), lambda row: row.__setitem__("color_phase", 0))
    expect_error(lambda: parse_events(synthetic_capture("normal", phase_raw), "normal"), "phase drift was accepted")
    wrong_color_raw = mutate_first_source_with_consistent_digests(
        fixture_log("pro"),
        lambda row: row.__setitem__("source_fen", row["source_fen"].replace(" b ", " w ", 1)),
    )
    expect_error(lambda: parse_events(synthetic_capture("pro", wrong_color_raw), "pro"), "source FEN color drift was accepted")
    wrong_variant_raw = mutate_first_source_with_consistent_digests(
        fixture_log("pro"),
        lambda row: row.__setitem__("source_fen", row["source_fen"] + " 1"),
    )
    expect_error(lambda: parse_events(synthetic_capture("pro", wrong_variant_raw), "pro"), "source FEN variant drift was accepted")

    overlap = [
        parse_events(synthetic_capture("pro", fixture_log("pro")), "pro"),
        parse_events(synthetic_capture("normal", fixture_log("normal")), "normal"),
        parse_events(synthetic_capture("fast", fixture_log("fast", namespace="pro")), "fast"),
    ]
    overlap_report = build_report(overlap)
    require(overlap_report["decision"] == "fail_source_coverage_family", "cross-duel overlap did not fail")
    require(report_exit_code(overlap_report) == 1, "failed family must return a failing gate status")
    require(any("cross_duel_overlap" in item for item in overlap_report["violations"]), "overlap reason missing")

    previous = Path.cwd()
    with tempfile.TemporaryDirectory() as directory:
        os.chdir(directory)
        try:
            Path("target/experiment-runs").mkdir(parents=True)
            Path("real.log").write_bytes(b"fixture")
            os.symlink("real.log", "linked.log")
            expect_error(lambda: read_stable_bytes(Path("linked.log"), "symlink fixture"), "symlink input was accepted")
            os.mkfifo("fifo.log")
            expect_error(lambda: read_stable_bytes(Path("fifo.log"), "FIFO fixture"), "FIFO input was accepted")
            exclusive_atomic_write(Path("target/experiment-runs/report.json"), b"{}\n")
            expect_error(lambda: exclusive_atomic_write(Path("target/experiment-runs/report.json"), b"{}\n"), "existing output was overwritten")
            os.symlink("report.json", "target/experiment-runs/linked-output.json")
            expect_error(lambda: exclusive_atomic_write(Path("target/experiment-runs/linked-output.json"), b"{}\n"), "symlink output was accepted")
        finally:
            os.chdir(previous)
    print("automove dense-Pareto source coverage v1 summarizer self-test: ok")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--pro-log", action="append")
    parser.add_argument("--normal-log", action="append")
    parser.add_argument("--fast-log", action="append")
    parser.add_argument("--output", action="append")
    args = parser.parse_args(argv)
    supplied = (args.pro_log, args.normal_log, args.fast_log, args.output)
    if args.self_test:
        require(not any(supplied), "--self-test takes no log or output arguments")
        self_test()
        return 0
    require(
        all(
            isinstance(value, list)
            and len(value) == 1
            and isinstance(value[0], str)
            and value[0]
            for value in supplied
        ),
        "exactly one each of --pro-log, --normal-log, --fast-log, and --output is required",
    )
    pro_log, normal_log, fast_log, output = (value[0] for value in supplied)

    input_paths = [Path(pro_log), Path(normal_log), Path(fast_log)]
    lexical_inputs = [os.path.abspath(os.fspath(path)) for path in input_paths]
    require(len(set(lexical_inputs)) == 3, "input paths must be distinct")
    output_path = Path(output)
    validate_output_path(output_path)
    output_absolute = os.path.abspath(os.fspath(output_path))
    require(output_absolute not in set(lexical_inputs), "output path must differ from every input")

    captures = [read_stable_bytes(path, f"{role} log") for role, path in zip(("pro", "normal", "fast"), input_paths)]
    identities = {(capture.device, capture.inode) for capture in captures}
    require(len(identities) == 3, "input paths must not name the same file or hardlink")
    logs = [parse_events(capture, role) for role, capture in zip(("pro", "normal", "fast"), captures)]
    report = build_report(logs)
    raw = (canonical_json(report) + "\n").encode("utf-8")
    exclusive_atomic_write(output_path, raw)
    sys.stdout.buffer.write(raw)
    return report_exit_code(report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except CoverageError as error:
        print(f"automove dense-Pareto source coverage v1 error: {error}", file=sys.stderr)
        raise SystemExit(2)
