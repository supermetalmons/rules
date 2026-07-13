#!/usr/bin/env python3
"""Authenticate and jointly select the frozen dense-Pareto PairNet v3 pilot.

The v3 source universe is fresh, but selection is allowed only after removing
every raw resource exposed by the complete v1 selection and by the complete v2
emitted candidate universe.  The solver chooses two complete 72-row lanes in
one assignment.  Its counted trial is exactly one legal ordered four-row
choice for a base ``(variant, duel)`` slot: A-loss, A-save, B-loss, B-save.

Passing grants only permission to freeze a fresh model-family precommit.  No
pilot row is model, pairability, tensor, runtime, dashboard, or promotion data.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import stat
import sys
import tempfile
import types
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


V2_MATCHER_NAME = "summarize-automove-dense-pareto-joint-source-v2.py"
V2_MATCHER_SHA256 = "3243ad0b69a617c18a8cb8cfb2155c6c92c1b0f364d81b86132d1dc0c91ddb54"
V2_MATCHER_SIZE = 105_198


def _load_frozen_v2_module() -> types.ModuleType:
    """Execute the exact final v2 matcher bytes as the parsing foundation."""

    path = Path(__file__).with_name(V2_MATCHER_NAME)
    descriptor = -1
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode) or before.st_size != V2_MATCHER_SIZE:
            raise RuntimeError("frozen v2 matcher is not the exact regular file")
        chunks: list[bytes] = []
        remaining = V2_MATCHER_SIZE + 1
        while remaining:
            chunk = os.read(descriptor, min(1 << 20, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(descriptor)
        raw = b"".join(chunks)
        if (
            len(raw) != V2_MATCHER_SIZE
            or before.st_dev != after.st_dev
            or before.st_ino != after.st_ino
            or before.st_size != after.st_size
            or before.st_mtime_ns != after.st_mtime_ns
            or hashlib.sha256(raw).hexdigest() != V2_MATCHER_SHA256
        ):
            raise RuntimeError("frozen v2 matcher hash, size, or stable-read contract drift")
    finally:
        if descriptor >= 0:
            os.close(descriptor)
    name = "_automove_dense_pareto_frozen_v2_matcher"
    module = types.ModuleType(name)
    module.__file__ = str(path)
    module.__package__ = ""
    sys.modules[name] = module
    exec(compile(raw, str(path), "exec"), module.__dict__)
    return module


try:
    V2 = _load_frozen_v2_module()
except (OSError, RuntimeError, UnicodeError) as error:
    print(f"automove dense-Pareto dual-reserve v3 error: {error}", file=sys.stderr)
    raise SystemExit(2)


DualReserveError = V2.JointSourceError
require = V2.require
is_int = V2.is_int
parse_json = V2.parse_json
canonical_json = V2.canonical_json
fnv_hex = V2.fnv_hex
sha256_json = V2.sha256_json
require_keys = V2.require_keys
require_text = V2.require_text
require_hex16 = V2.require_hex16
CapturedInput = V2.CapturedInput
ResourceBundle = V2.ResourceBundle
Candidate = V2.Candidate
UsedResources = V2.UsedResources
read_stable_bytes = V2.read_stable_bytes
exclusive_atomic_write = V2.exclusive_atomic_write
validate_output_path = V2.validate_output_path


SCHEMA_VERSION = 3
ARCHITECTURE_ID = "automove_dense_pareto_pairnet_v3_dual_reserve_joint_matching"
SEED_FAMILY_ID = (
    "automove_dense_pareto_pairnet_v3_dual_reserve_joint_matching_"
    "pilot_20260712_fresh01"
)
PROBE_DATA_ROLE = "coverage_only_never_model_data"
REPORT_ID = "automove_dense_pareto_dual_reserve_joint_matching_v3"

FIXED_REPEATS = 16
GAMES_PER_REPEAT = 12
MAX_PLIES = 96
EXPECTED_CELLS_PER_DUEL = 24
REQUIRED_ASSIGNMENTS = 2
ROWS_PER_ASSIGNMENT = 72
REQUIRED_TOTAL_SELECTED = 144
DUAL_SLOT_BUNDLE_TRIAL_CAP = 10_000_000
SOLVER_TRIAL_UNIT = "one_complete_ordered_four_row_base_slot_choice"

V1_REPORT_SHA256 = "07de37c13a4c203e6a6b3e16e8c404e3c66a60495969f6f5ba62f0d45ef9c37e"
V1_REPORT_SIZE = 84_645
V2_LOG_CONTRACT = {
    "pro": (
        13_286_476,
        "854bc5af22b047ba27a5e479fefbd08b4d56cb7e3b7ece4b629de30099e2f369",
    ),
    "normal": (
        13_325_471,
        "a8275d193fcc247453852ddfbb3ba1ac21f21f8419b9467355941e33fbe18f85",
    ),
    "fast": (
        14_453_367,
        "14d5ffd495e8430b1872a6a56dc92c16069f477a01bafd7ea143445497b61680",
    ),
}

NAMESPACE = "DENSE_PARETO_DUAL_RESERVE_SOURCE_"
SCHEMA_PREFIX = f"{NAMESPACE}SCHEMA_V3 "
CANDIDATE_PREFIX = f"{NAMESPACE}CANDIDATE_V3 "
SUMMARY_PREFIX = f"{NAMESPACE}SUMMARY_V3 "

VARIANTS = V2.VARIANTS
PANELS = V2.PANELS
COLORS = V2.COLORS
ROLE_CONFIG = V2.ROLE_CONFIG
RESOURCE_KEYS = V2.RESOURCE_KEYS
FORBIDDEN_INPUTS = V2.FORBIDDEN_INPUTS

CANDIDATE_FIELDS = V2.CANDIDATE_FIELDS
SUMMARY_FIELDS = (
    "schema_version",
    "architecture_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "probe_data_role",
    "seed_family_id",
    "source_duel_id",
    "duel_index",
    "repeat_offset",
    "repeats",
    "games_per_repeat",
    "max_plies",
    "expected_cells",
    "required_assignments",
    "rows_per_assignment",
    "required_total_selected",
    "candidate_count",
    "collapsed_candidate_count",
    "emitted_candidates",
    "eligible_cells",
    "min_cell_candidate_count",
    "max_cell_candidate_count",
    "unique_source_fens",
    "unique_states",
    "unique_canonical_source_fens",
    "unique_opening_fens",
    "unique_clusters",
    "variant_counts",
    "panel_counts",
    "color_counts",
    "per_cell_candidate_counts",
    "violations",
    "candidate_universe_digest_fnv64",
    "universe_complete",
    "root_pool_permission",
    "alternative_root_outcome_permission",
    "corpus_label_permission",
    "model_data_permission",
    "tensor_extraction_permission",
    "runtime_permission",
    "dashboard_permission",
    "promotion_permission",
    "next_action",
)
SCHEMA_FIELDS = (
    "schema_version",
    "architecture_id",
    "seed_family_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "probe_data_role",
    "candidate_record_prefix",
    "summary_record_prefix",
    "required_assignments",
    "rows_per_assignment",
    "required_total_selected",
    "selection_location",
    "collapse_key",
    "selection_priority",
    "fixed_variants",
    "candidate_fields",
    "summary_fields",
    "resource_keys",
    "dual_slot_bundle_trial_cap",
    "solver_trial_unit",
    "forbidden_inputs",
)

STRUCTURED_RECORD = V2.STRUCTURED_RECORD
HARNESS_OK = V2.HARNESS_OK


@dataclass(frozen=True)
class ParsedLog:
    role: str
    capture: CapturedInput
    schema: dict[str, Any]
    candidates: tuple[Candidate, ...]
    summary: dict[str, Any]


@dataclass(frozen=True)
class PairSlot:
    key: tuple[int, int]
    losses: tuple[Candidate, ...]
    saves: tuple[Candidate, ...]
    conflicting_save_indices: tuple[frozenset[int], ...]


@dataclass(frozen=True)
class DualChoice:
    a_loss: Candidate
    a_save: Candidate
    b_loss: Candidate
    b_save: Candidate

    def ordered(self) -> tuple[Candidate, Candidate, Candidate, Candidate]:
        return (self.a_loss, self.a_save, self.b_loss, self.b_save)


@dataclass(frozen=True)
class DualSolveResult:
    status: str
    selected: tuple[tuple[tuple[int, int], DualChoice], ...]
    dual_slot_bundle_trials: int
    trial_cap: int


@dataclass(frozen=True)
class ResourceInventory:
    source_fens: frozenset[str]
    states: frozenset[tuple[str, int]]
    clusters: frozenset[tuple[str, int, int, str]]
    canonical_source_fens: frozenset[str]
    opening_fens: frozenset[str]

    @classmethod
    def empty(cls) -> "ResourceInventory":
        return cls(frozenset(), frozenset(), frozenset(), frozenset(), frozenset())

    @classmethod
    def from_bundles(cls, bundles: Iterable[ResourceBundle]) -> "ResourceInventory":
        values = tuple(bundles)
        return cls(
            frozenset(bundle.source_fen for bundle in values),
            frozenset(bundle.state for bundle in values),
            frozenset(bundle.cluster for bundle in values),
            frozenset(bundle.canonical_source_fen for bundle in values),
            frozenset(bundle.opening_fen for bundle in values),
        )

    def union(self, other: "ResourceInventory") -> "ResourceInventory":
        return ResourceInventory(
            self.source_fens | other.source_fens,
            self.states | other.states,
            self.clusters | other.clusters,
            self.canonical_source_fens | other.canonical_source_fens,
            self.opening_fens | other.opening_fens,
        )

    def counts(self) -> dict[str, int]:
        return {
            "raw_source_fens": len(self.source_fens),
            "raw_source_fen_plus_horizon_states": len(self.states),
            "raw_cluster_provenance": len(self.clusters),
            "perspective_canonical_source_fens": len(self.canonical_source_fens),
            "raw_opening_fens": len(self.opening_fens),
        }


def require_common(value: dict[str, Any], label: str) -> None:
    require(
        is_int(value["schema_version"]) and value["schema_version"] == SCHEMA_VERSION,
        f"{label}: schema version drift",
    )
    require(value["architecture_id"] == ARCHITECTURE_ID, f"{label}: architecture drift")
    require(value["candidate_independent"] is True, f"{label}: candidate independence required")
    require(
        value["alternative_root_labels_used"] is False,
        f"{label}: alternative-root labels forbidden",
    )


def generation_seed_tag(role: str) -> str:
    return SEED_FAMILY_ID + str(ROLE_CONFIG[role]["seed_suffix"])


def opening_ids(
    role: str, repeat_index: int, opening_index: int, variant: str
) -> tuple[str, str]:
    provenance = (
        f"generation_seed_tag={generation_seed_tag(role)}|repeat_index={repeat_index}"
        f"|opening_index={opening_index}|variant={variant}"
    )
    return (fnv_hex(f"cluster|{provenance}"), fnv_hex(f"side_pair|{provenance}"))


def expected_color(variant_index: int, panel_index: int, duel_index: int) -> str:
    return "white" if (variant_index + panel_index + duel_index) % 2 == 1 else "black"


def source_identity(value: dict[str, Any]) -> str:
    return fnv_hex(
        f"pairnet_dual_reserve_source_v3|seed_family={SEED_FAMILY_ID}"
        f"|duel={value['source_duel_id']}|repeat={value['repeat_index']}"
        f"|opening={value['opening_index']}|ply={value['source_ply']}"
        f"|source_fen={value['source_fen']}"
        f"|canonical_source_fen={value['canonical_source_fen']}"
        f"|opening_fen={value['opening_fen']}|guarded_move={value['guarded_move']}"
        f"|resource_bucket_multiplicity={value['resource_bucket_multiplicity']}"
    )


def candidate_universe_digest(candidates: Sequence[Candidate]) -> str:
    rows = sorted(candidates, key=lambda candidate: candidate.row["candidate_index"])
    canonical = "\n".join(
        f"{row['duel_index']}|{row['variant_index']}|{row['panel_index']}"
        f"|{row['required_color']}|{row['source_fen']}"
        f"|{row['canonical_source_fen']}|{row['opening_fen']}"
        f"|{row['guarded_move']}|{row['source_ply']}|{row['remaining_horizon']}"
        f"|{row['repeat_index']}|{row['opening_index']}"
        f"|{row['generation_seed_tag']}|{row['opening_cluster_id']}"
        f"|{row['side_sibling_id']}|{row['resource_bucket_multiplicity']}"
        f"|{row['source_identity_fnv64']}"
        for row in (candidate.row for candidate in rows)
    )
    return fnv_hex(f"dense_pareto_dual_reserve_source_universe_v3\n{canonical}")


def validate_candidate(value: dict[str, Any], role: str, label: str) -> Candidate:
    require_keys(value, CANDIDATE_FIELDS, label)
    require(not (set(value) & set(FORBIDDEN_INPUTS)), f"{label}: forbidden alternative-root key")
    require_common(value, label)
    config = ROLE_CONFIG[role]
    require(value["probe_data_role"] == PROBE_DATA_ROLE, f"{label}: data role drift")
    require(value["seed_family_id"] == SEED_FAMILY_ID, f"{label}: seed family drift")
    require(value["source_duel_id"] == config["duel"], f"{label}: duel drift")
    require(
        is_int(value["duel_index"]) and value["duel_index"] == config["duel_index"],
        f"{label}: duel index drift",
    )
    require(
        is_int(value["variant_index"]) and 0 <= value["variant_index"] < len(VARIANTS),
        f"{label}: variant index",
    )
    variant_index = value["variant_index"]
    require(value["variant"] == VARIANTS[variant_index], f"{label}: variant registry mismatch")
    require(value["source_panel"] in PANELS, f"{label}: panel")
    panel_index = PANELS.index(value["source_panel"])
    require(
        is_int(value["panel_index"]) and value["panel_index"] == panel_index,
        f"{label}: panel index",
    )
    result = value["source_result_audit_only"]
    require(result in ("loss", "win", "draw"), f"{label}: source-result audit token")
    require(
        (panel_index == 0 and result == "loss")
        or (panel_index == 1 and result in ("win", "draw")),
        f"{label}: source-result audit disagrees with panel",
    )
    color = expected_color(variant_index, panel_index, int(config["duel_index"]))
    require(
        value["required_color"] == color and value["actual_color"] == color,
        f"{label}: checkerboard color mismatch",
    )

    source_fen = require_text(value["source_fen"], f"{label}.source_fen", delimiter_safe=True)
    canonical_fen = require_text(
        value["canonical_source_fen"], f"{label}.canonical_source_fen", delimiter_safe=True
    )
    opening_fen = require_text(value["opening_fen"], f"{label}.opening_fen", delimiter_safe=True)
    color_token = "w" if color == "white" else "b"
    V2.validate_fen(source_fen, variant_index, f"{label}.source_fen", expected_color_token=color_token)
    V2.validate_fen(
        canonical_fen,
        variant_index,
        f"{label}.canonical_source_fen",
        expected_color_token="w",
    )
    V2.validate_fen(opening_fen, variant_index, f"{label}.opening_fen")
    expected_canonical = V2.perspective_canonical_fen(source_fen, color, variant_index)
    require(canonical_fen == expected_canonical, f"{label}: perspective-canonical source FEN mismatch")

    require_text(value["guarded_move"], f"{label}.guarded_move", delimiter_safe=True)
    require(value["guarded_move_legal"] is True, f"{label}: guarded move must be legal")
    require(value["candidate_branch"] == "frontier_execute", f"{label}: candidate branch drift")
    require(
        is_int(value["repeat_index"]) and 0 <= value["repeat_index"] < FIXED_REPEATS,
        f"{label}: repeat index outside fixed repeats",
    )
    require(
        is_int(value["opening_index"]) and value["opening_index"] == variant_index,
        f"{label}: opening/variant mismatch",
    )
    require(value["generation_seed_tag"] == generation_seed_tag(role), f"{label}: generation seed tag drift")
    expected_cluster, expected_sibling = opening_ids(
        role, value["repeat_index"], value["opening_index"], value["variant"]
    )
    require_hex16(value["opening_cluster_id"], f"{label}.opening_cluster_id")
    require(value["opening_cluster_id"] == expected_cluster, f"{label}: opening-cluster provenance mismatch")
    require_hex16(value["side_sibling_id"], f"{label}.side_sibling_id")
    require(value["side_sibling_id"] == expected_sibling, f"{label}: side-sibling provenance mismatch")
    require(is_int(value["source_ply"]) and 0 <= value["source_ply"] < MAX_PLIES, f"{label}: source ply")
    require(is_int(value["max_plies"]) and value["max_plies"] == MAX_PLIES, f"{label}: max plies drift")
    require(
        is_int(value["remaining_horizon"])
        and value["remaining_horizon"] == MAX_PLIES - value["source_ply"],
        f"{label}: remaining horizon drift",
    )
    require(
        is_int(value["source_candidate_turn_count"])
        and value["source_candidate_turn_count"] >= 1,
        f"{label}: source candidate-turn count",
    )
    require(
        is_int(value["eligible_frontier_execute_count"])
        and 1 <= value["eligible_frontier_execute_count"] <= value["source_candidate_turn_count"],
        f"{label}: eligible frontier-execute count",
    )
    require(is_int(value["cell_candidate_count"]) and value["cell_candidate_count"] >= 1, f"{label}: cell candidate count")
    require(
        is_int(value["resource_bucket_multiplicity"])
        and value["resource_bucket_multiplicity"] >= 1,
        f"{label}: resource bucket multiplicity",
    )
    require_hex16(value["source_identity_fnv64"], f"{label}.source_identity_fnv64")
    require(value["source_identity_fnv64"] == source_identity(value), f"{label}: source identity digest mismatch")
    require(is_int(value["candidate_index"]) and value["candidate_index"] >= 0, f"{label}: candidate index")
    bundle = ResourceBundle(
        source_fen=source_fen,
        state=(source_fen, value["remaining_horizon"]),
        cluster=(
            value["generation_seed_tag"],
            value["repeat_index"],
            value["opening_index"],
            value["variant"],
        ),
        canonical_source_fen=canonical_fen,
        opening_fen=opening_fen,
    )
    return Candidate(role=role, row=value, bundle=bundle)


def count_entries(counter: Counter[str], order: Sequence[str]) -> list[str]:
    return [f"{key}={counter[key]}" for key in order]


def cell_count_entries(counter: Counter[tuple[int, int]]) -> list[str]:
    return [
        f"{VARIANTS[variant_index]}|{PANELS[panel_index]}={counter[(variant_index, panel_index)]}"
        for variant_index in range(len(VARIANTS))
        for panel_index in range(len(PANELS))
    ]


def summary_violations(cell_counts: Counter[tuple[int, int]]) -> list[str]:
    return sorted(
        f"cell_resource_bundles={VARIANTS[variant_index]}|{PANELS[panel_index]}"
        f":actual={cell_counts[(variant_index, panel_index)]}:required=2"
        for variant_index in range(len(VARIANTS))
        for panel_index in range(len(PANELS))
        if cell_counts[(variant_index, panel_index)] < 2
    )


def validate_schema(value: dict[str, Any], label: str) -> None:
    require_keys(value, SCHEMA_FIELDS, label)
    require_common(value, label)
    exact = {
        "seed_family_id": SEED_FAMILY_ID,
        "probe_data_role": PROBE_DATA_ROLE,
        "candidate_record_prefix": CANDIDATE_PREFIX.rstrip(),
        "summary_record_prefix": SUMMARY_PREFIX.rstrip(),
        "required_assignments": REQUIRED_ASSIGNMENTS,
        "rows_per_assignment": ROWS_PER_ASSIGNMENT,
        "required_total_selected": REQUIRED_TOTAL_SELECTED,
        "selection_location": "external_strict_dual_reserve_matcher_only",
        "collapse_key": "cell,raw_source_fen,raw_source_fen_plus_horizon,raw_cluster_provenance,canonical_source_fen,raw_opening_fen",
        "selection_priority": "source_ply,repeat_index,opening_index,source_fen,guarded_move,generation_seed_tag,opening_cluster_id,side_sibling_id,canonical_source_fen,opening_fen",
        "fixed_variants": list(VARIANTS),
        "candidate_fields": list(CANDIDATE_FIELDS),
        "summary_fields": list(SUMMARY_FIELDS),
        "resource_keys": list(RESOURCE_KEYS),
        "dual_slot_bundle_trial_cap": DUAL_SLOT_BUNDLE_TRIAL_CAP,
        "solver_trial_unit": SOLVER_TRIAL_UNIT,
        "forbidden_inputs": list(FORBIDDEN_INPUTS),
    }
    for field, expected in exact.items():
        require(type(value[field]) is type(expected) and value[field] == expected, f"{label}: {field} drift")


def parse_events(capture: CapturedInput, role: str) -> ParsedLog:
    label = f"v3 {role} log"
    try:
        text = capture.raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise DualReserveError(f"{label}: input is not UTF-8") from error
    schemas: list[dict[str, Any]] = []
    candidate_values: list[dict[str, Any]] = []
    summaries: list[dict[str, Any]] = []
    harness_results: list[str] = []
    event_order: list[str] = []
    recognized = (
        (SCHEMA_PREFIX, "schema", schemas),
        (CANDIDATE_PREFIX, "candidate", candidate_values),
        (SUMMARY_PREFIX, "summary", summaries),
    )
    for line_number, line in enumerate(text.splitlines(), 1):
        left_stripped = line.lstrip(" \t")
        if line != left_stripped and (
            left_stripped.startswith(NAMESPACE) or STRUCTURED_RECORD.match(left_stripped)
        ):
            raise DualReserveError(f"{label}:{line_number}: whitespace-prefixed structured record")
        if line.startswith("test result:"):
            harness_results.append(line)
            continue
        matched = False
        for prefix, kind, destination in recognized:
            if line.startswith(prefix):
                payload = line[len(prefix) :]
                require(
                    payload and payload == payload.strip(),
                    f"{label}:{line_number}: noncanonical record spacing",
                )
                destination.append(parse_json(payload, f"{label}:{line_number} {kind}"))
                event_order.append(kind)
                matched = True
                break
        if matched:
            continue
        if line.startswith(NAMESPACE) or STRUCTURED_RECORD.match(line):
            raise DualReserveError(f"{label}:{line_number}: unexpected structured record or prefix")
    require(len(schemas) == 1, f"{label}: exactly one schema record required")
    require(candidate_values, f"{label}: at least one candidate record required")
    require(len(summaries) == 1, f"{label}: exactly one summary record required")
    require(
        len(harness_results) == 1 and HARNESS_OK.fullmatch(harness_results[0]) is not None,
        f"{label}: exactly one successful one-test Cargo harness result required",
    )
    require(
        event_order == ["schema"] + ["candidate"] * len(candidate_values) + ["summary"],
        f"{label}: record chronology differs from frozen protocol",
    )
    validate_schema(schemas[0], f"{label} schema")
    candidates = tuple(
        validate_candidate(value, role, f"{label} candidate[{index}]")
        for index, value in enumerate(candidate_values)
    )
    parsed = ParsedLog(role, capture, schemas[0], candidates, summaries[0])
    validate_log(parsed)
    return parsed


def validate_log(parsed: ParsedLog) -> None:
    role = parsed.role
    label = f"v3 {role} log"
    require(role in ROLE_CONFIG, f"{label}: unknown role")
    candidates = parsed.candidates
    indices = [candidate.row["candidate_index"] for candidate in candidates]
    require(indices == list(range(len(candidates))), f"{label}: candidate indices must be contiguous")
    canonical_order = sorted(
        candidates,
        key=lambda candidate: (
            candidate.row["variant_index"],
            candidate.row["panel_index"],
            candidate.priority,
        ),
    )
    require(
        [candidate.row["source_identity_fnv64"] for candidate in candidates]
        == [candidate.row["source_identity_fnv64"] for candidate in canonical_order],
        f"{label}: candidate emission order is not canonical",
    )
    collapse_keys = [
        (
            candidate.cell,
            candidate.bundle.source_fen,
            candidate.bundle.state,
            candidate.bundle.cluster,
            candidate.bundle.canonical_source_fen,
            candidate.bundle.opening_fen,
        )
        for candidate in candidates
    ]
    require(len(set(collapse_keys)) == len(collapse_keys), f"{label}: collapsed duplicate remains")
    identities = [candidate.row["source_identity_fnv64"] for candidate in candidates]
    require(len(set(identities)) == len(identities), f"{label}: duplicate source identity")

    cell_counts: Counter[tuple[int, int]] = Counter(
        (candidate.row["variant_index"], candidate.row["panel_index"])
        for candidate in candidates
    )
    for candidate in candidates:
        require(
            candidate.row["cell_candidate_count"]
            == cell_counts[(candidate.row["variant_index"], candidate.row["panel_index"])],
            f"{label}: cell candidate count mismatch",
        )
    variant_counts = Counter(candidate.row["variant"] for candidate in candidates)
    panel_counts = Counter(candidate.row["source_panel"] for candidate in candidates)
    color_counts = Counter(candidate.row["actual_color"] for candidate in candidates)
    eligible_cells = sum(count > 0 for count in cell_counts.values())
    cell_values = [
        cell_counts[(variant_index, panel_index)]
        for variant_index in range(len(VARIANTS))
        for panel_index in range(len(PANELS))
    ]
    min_cell = min(cell_values)
    max_cell = max(cell_values)
    violations = summary_violations(cell_counts)
    universe_complete = (
        eligible_cells == EXPECTED_CELLS_PER_DUEL and min_cell >= 2 and violations == []
    )
    summary = parsed.summary
    require_keys(summary, SUMMARY_FIELDS, f"{label} summary")
    require_common(summary, f"{label} summary")
    config = ROLE_CONFIG[role]
    exact_summary = {
        "probe_data_role": PROBE_DATA_ROLE,
        "seed_family_id": SEED_FAMILY_ID,
        "source_duel_id": config["duel"],
        "duel_index": config["duel_index"],
        "repeat_offset": 0,
        "repeats": FIXED_REPEATS,
        "games_per_repeat": GAMES_PER_REPEAT,
        "max_plies": MAX_PLIES,
        "expected_cells": EXPECTED_CELLS_PER_DUEL,
        "required_assignments": REQUIRED_ASSIGNMENTS,
        "rows_per_assignment": ROWS_PER_ASSIGNMENT,
        "required_total_selected": REQUIRED_TOTAL_SELECTED,
        "collapsed_candidate_count": len(candidates),
        "emitted_candidates": len(candidates),
        "eligible_cells": eligible_cells,
        "min_cell_candidate_count": min_cell,
        "max_cell_candidate_count": max_cell,
        "unique_source_fens": len({candidate.bundle.source_fen for candidate in candidates}),
        "unique_states": len({candidate.bundle.state for candidate in candidates}),
        "unique_canonical_source_fens": len(
            {candidate.bundle.canonical_source_fen for candidate in candidates}
        ),
        "unique_opening_fens": len({candidate.bundle.opening_fen for candidate in candidates}),
        "unique_clusters": len({candidate.bundle.cluster for candidate in candidates}),
        "variant_counts": count_entries(variant_counts, VARIANTS),
        "panel_counts": count_entries(panel_counts, PANELS),
        "color_counts": count_entries(color_counts, COLORS),
        "per_cell_candidate_counts": cell_count_entries(cell_counts),
        "violations": violations,
        "candidate_universe_digest_fnv64": candidate_universe_digest(candidates),
        "universe_complete": universe_complete,
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
        "corpus_label_permission": False,
        "model_data_permission": False,
        "tensor_extraction_permission": False,
        "runtime_permission": False,
        "dashboard_permission": False,
        "promotion_permission": False,
        "next_action": "run_strict_dual_reserve_matcher_only",
    }
    for field, expected in exact_summary.items():
        require(
            type(summary[field]) is type(expected) and summary[field] == expected,
            f"{label} summary: {field} drift",
        )
    require(
        is_int(summary["candidate_count"])
        and summary["candidate_count"]
        == sum(candidate.row["resource_bucket_multiplicity"] for candidate in candidates),
        f"{label} summary: pre-collapse candidate count",
    )


def make_pair_slots_for_keys(
    candidates: Sequence[Candidate], slot_keys: Sequence[tuple[int, int]]
) -> tuple[PairSlot, ...]:
    by_cell: dict[tuple[int, int, int], list[Candidate]] = {}
    for candidate in candidates:
        by_cell.setdefault(candidate.cell, []).append(candidate)
    slots: list[PairSlot] = []
    for variant_index, duel_index in slot_keys:
        losses = tuple(
            sorted(by_cell.get((duel_index, variant_index, 0), []), key=lambda item: item.priority)
        )
        saves = tuple(
            sorted(by_cell.get((duel_index, variant_index, 1), []), key=lambda item: item.priority)
        )
        conflicts = tuple(
            frozenset(
                save_index
                for save_index, save in enumerate(saves)
                if loss.bundle.overlaps(save.bundle)
            )
            for loss in losses
        )
        slots.append(PairSlot((variant_index, duel_index), losses, saves, conflicts))
    return tuple(slots)


def make_pair_slots(candidates: Sequence[Candidate]) -> tuple[PairSlot, ...]:
    return make_pair_slots_for_keys(
        candidates,
        [
            (variant_index, duel_index)
            for variant_index in range(len(VARIANTS))
            for duel_index in range(3)
        ],
    )


def available_indices(slot: PairSlot, used: UsedResources) -> tuple[list[int], set[int]]:
    return (
        [index for index, candidate in enumerate(slot.losses) if used.allows(candidate)],
        {index for index, candidate in enumerate(slot.saves) if used.allows(candidate)},
    )


def legal_pair_bound(slot: PairSlot, used: UsedResources) -> int:
    losses, saves = available_indices(slot, used)
    if not losses or not saves:
        return 0
    return sum(
        len(saves) - len(saves.intersection(slot.conflicting_save_indices[loss_index]))
        for loss_index in losses
    )


def iter_legal_pairs(
    slot: PairSlot, used: UsedResources
) -> Iterable[tuple[Candidate, Candidate]]:
    loss_indices, save_indices = available_indices(slot, used)
    for loss_index in loss_indices:
        loss = slot.losses[loss_index]
        conflicts = slot.conflicting_save_indices[loss_index]
        for save_index, save in enumerate(slot.saves):
            if save_index not in save_indices or save_index in conflicts:
                continue
            yield loss, save


def slot_has_dual_choice(slot: PairSlot, used: UsedResources) -> bool:
    """Cheap deterministic feasibility probe; it does not consume solver trials."""

    if legal_pair_bound(slot, used) < 2:
        return False
    for a_loss, a_save in iter_legal_pairs(slot, used):
        used.add(a_loss)
        used.add(a_save)
        found = next(iter_legal_pairs(slot, used), None) is not None
        used.remove(a_save)
        used.remove(a_loss)
        if found:
            return True
    return False


def solve_dual_slots(slots: Sequence[PairSlot], trial_cap: int) -> DualSolveResult:
    require(is_int(trial_cap) and trial_cap >= 0, "solver trial cap must be nonnegative")
    ordered_slots = tuple(sorted(slots, key=lambda slot: slot.key))
    require(
        len({slot.key for slot in ordered_slots}) == len(ordered_slots),
        "solver slots must be unique",
    )
    used = UsedResources.empty()
    selected: dict[tuple[int, int], DualChoice] = {}
    trials = 0
    exhausted = False

    def search(remaining: tuple[PairSlot, ...]) -> bool:
        nonlocal trials, exhausted
        if not remaining:
            return True
        # Exact quadruple counting can be quadratic in the already-large pair
        # domain.  The prospectively frozen MRV key therefore uses the exact
        # legal single-pair count as a deterministic availability bound.
        bounds = [(legal_pair_bound(slot, used), slot.key, slot) for slot in remaining]
        bound, _, chosen = min(bounds, key=lambda item: (item[0], item[1]))
        if bound < 2 or not slot_has_dual_choice(chosen, used):
            return False
        rest = tuple(slot for slot in remaining if slot.key != chosen.key)
        for a_loss, a_save in iter_legal_pairs(chosen, used):
            used.add(a_loss)
            used.add(a_save)
            for b_loss, b_save in iter_legal_pairs(chosen, used):
                # A trial is counted only here, after all four rows have passed
                # mutual and global five-domain resource legality.
                if trials >= trial_cap:
                    exhausted = True
                    used.remove(a_save)
                    used.remove(a_loss)
                    return False
                trials += 1
                used.add(b_loss)
                used.add(b_save)
                selected[chosen.key] = DualChoice(a_loss, a_save, b_loss, b_save)
                forward_ok = all(slot_has_dual_choice(slot, used) for slot in rest)
                if forward_ok and search(rest):
                    return True
                del selected[chosen.key]
                used.remove(b_save)
                used.remove(b_loss)
                if exhausted:
                    used.remove(a_save)
                    used.remove(a_loss)
                    return False
            used.remove(a_save)
            used.remove(a_loss)
        return False

    solved = search(ordered_slots)
    status = "solved" if solved else ("cap_exhausted" if exhausted else "proven_infeasible")
    return DualSolveResult(
        status,
        tuple(sorted(selected.items())) if solved else (),
        trials,
        trial_cap,
    )


def flatten_lane(result: DualSolveResult, lane: str) -> list[Candidate]:
    require(result.status == "solved", "cannot flatten an unsolved assignment")
    require(lane in ("A", "B"), "lane must be A or B")
    rows: list[Candidate] = []
    for _, choice in result.selected:
        rows.extend(
            (choice.a_loss, choice.a_save) if lane == "A" else (choice.b_loss, choice.b_save)
        )
    return sorted(
        rows,
        key=lambda candidate: (
            candidate.row["variant_index"],
            candidate.row["duel_index"],
            candidate.row["panel_index"],
        ),
    )


def flatten_dual(result: DualSolveResult) -> list[Candidate]:
    return flatten_lane(result, "A") + flatten_lane(result, "B")


def bundle_hits(bundle: ResourceBundle, inventory: ResourceInventory) -> tuple[str, ...]:
    hits: list[str] = []
    if bundle.source_fen in inventory.source_fens:
        hits.append("raw_source_fen")
    if bundle.state in inventory.states:
        hits.append("raw_source_fen_plus_horizon")
    if bundle.cluster in inventory.clusters:
        hits.append("raw_cluster_provenance")
    if bundle.canonical_source_fen in inventory.canonical_source_fens:
        hits.append("perspective_canonical_source_fen")
    if bundle.opening_fen in inventory.opening_fens:
        hits.append("raw_opening_fen")
    return tuple(hits)


def inventory_from_v2_logs(logs: Sequence[Any]) -> ResourceInventory:
    require(
        [log.role for log in logs] == ["pro", "normal", "fast"],
        "v2 quarantine logs require pro, normal, fast order",
    )
    candidates = [candidate for log in logs for candidate in log.candidates]
    require(len(candidates) == 24_268, "v2 full candidate-universe count drift")
    return ResourceInventory.from_bundles(candidate.bundle for candidate in candidates)


def _v1_generation_seed_tag(row: dict[str, Any]) -> str:
    suffix_by_duel = {
        "vs_shipping_pro": "",
        "vs_shipping_normal": "_vs_normal",
        "vs_shipping_fast": "_vs_fast",
    }
    require(row["source_duel_id"] in suffix_by_duel, "v1 report duel drift")
    return row["seed_family_id"] + suffix_by_duel[row["source_duel_id"]]


def recover_v1_inventory(value: dict[str, Any]) -> ResourceInventory:
    require(value.get("schema_version") == 1, "v1 report schema drift")
    require(value.get("architecture_id") == "automove_dense_pareto_pairnet_v1", "v1 architecture drift")
    require(value.get("report_id") == "automove_dense_pareto_source_coverage_family_v1", "v1 report id drift")
    require(value.get("coverage_pass") is False, "v1 report unexpectedly passes")
    require(value.get("decision") == "fail_source_coverage_family", "v1 decision drift")
    require(value.get("authorization") == "none", "v1 authorization drift")
    manifest = value.get("source_manifest")
    require(isinstance(manifest, list) and len(manifest) == 72, "v1 source manifest must contain 72 rows")
    bundles: list[ResourceBundle] = []
    for index, row in enumerate(manifest):
        label = f"v1 source_manifest[{index}]"
        require(isinstance(row, dict), f"{label}: object required")
        required = (
            "source_fen",
            "remaining_horizon",
            "seed_family_id",
            "source_duel_id",
            "repeat_index",
            "opening_index",
            "variant",
            "variant_index",
            "actual_color",
        )
        require(all(field in row for field in required), f"{label}: recoverable resource field missing")
        variant_index = row["variant_index"]
        require(
            is_int(variant_index)
            and 0 <= variant_index < len(VARIANTS)
            and row["variant"] == VARIANTS[variant_index],
            f"{label}: variant drift",
        )
        source_fen = require_text(row["source_fen"], f"{label}.source_fen", delimiter_safe=True)
        require(row["actual_color"] in COLORS, f"{label}: color drift")
        V2.validate_fen(
            source_fen,
            variant_index,
            f"{label}.source_fen",
            expected_color_token="w" if row["actual_color"] == "white" else "b",
        )
        require(
            is_int(row["remaining_horizon"]) and 1 <= row["remaining_horizon"] <= MAX_PLIES,
            f"{label}: remaining horizon",
        )
        require(
            is_int(row["repeat_index"])
            and is_int(row["opening_index"])
            and row["opening_index"] == variant_index,
            f"{label}: cluster provenance",
        )
        canonical = V2.perspective_canonical_fen(
            source_fen, row["actual_color"], variant_index
        )
        # Opening FEN was not present in the immutable v1 report, so it is not
        # invented.  The other four raw domains are exactly recoverable.
        bundles.append(
            ResourceBundle(
                source_fen,
                (source_fen, row["remaining_horizon"]),
                (
                    _v1_generation_seed_tag(row),
                    row["repeat_index"],
                    row["opening_index"],
                    row["variant"],
                ),
                canonical,
                f"__v1_opening_unrecoverable_{index}",
            )
        )
    inventory = ResourceInventory.from_bundles(bundles)
    # Explicitly represent the unrecoverable domain as empty, rather than
    # allowing synthetic sentinels to participate in equality filtering.
    return ResourceInventory(
        inventory.source_fens,
        inventory.states,
        inventory.clusters,
        inventory.canonical_source_fens,
        frozenset(),
    )


def read_frozen_v1_report(capture: CapturedInput) -> tuple[dict[str, Any], ResourceInventory]:
    require(
        capture.size == V1_REPORT_SIZE and capture.sha256 == V1_REPORT_SHA256,
        "v1 combined report hash or size drift",
    )
    try:
        text = capture.raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise DualReserveError("v1 combined report is not UTF-8") from error
    require(text.endswith("\n") and "\n" not in text[:-1], "v1 combined report must be canonical one-line JSON")
    value = parse_json(text[:-1], "v1 combined report")
    require(canonical_json(value) + "\n" == text, "v1 combined report JSON is not canonical")
    return value, recover_v1_inventory(value)


def authenticate_v2_logs(captures: Sequence[CapturedInput]) -> list[Any]:
    require(len(captures) == 3, "exactly three v2 quarantine logs required")
    logs: list[Any] = []
    for role, capture in zip(("pro", "normal", "fast"), captures):
        expected_size, expected_sha = V2_LOG_CONTRACT[role]
        require(
            capture.size == expected_size and capture.sha256 == expected_sha,
            f"v2 {role} quarantine log hash or size drift",
        )
        logs.append(V2.parse_events(capture, role))
    return logs


def normalized_universe(candidates: Sequence[Candidate]) -> list[dict[str, Any]]:
    return [
        {
            "duel_index": candidate.row["duel_index"],
            "variant_index": candidate.row["variant_index"],
            "panel_index": candidate.row["panel_index"],
            "priority": list(candidate.priority),
            "resources": candidate.bundle.report_value(),
            "source_identity_fnv64": candidate.row["source_identity_fnv64"],
        }
        for candidate in sorted(candidates, key=lambda item: (item.cell, item.priority))
    ]


def lane_manifest(result: DualSolveResult, lane: str) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for candidate in flatten_lane(result, lane):
        row = candidate.row
        manifest.append(
            {
                "lane": lane,
                "duel": row["source_duel_id"],
                "duel_index": row["duel_index"],
                "variant": row["variant"],
                "variant_index": row["variant_index"],
                "panel": row["source_panel"],
                "panel_index": row["panel_index"],
                "color": row["actual_color"],
                "source_fen": row["source_fen"],
                "canonical_source_fen": row["canonical_source_fen"],
                "opening_fen": row["opening_fen"],
                "remaining_horizon": row["remaining_horizon"],
                "generation_seed_tag": row["generation_seed_tag"],
                "repeat_index": row["repeat_index"],
                "opening_index": row["opening_index"],
                "opening_cluster_id": row["opening_cluster_id"],
                "side_sibling_id": row["side_sibling_id"],
                "source_ply": row["source_ply"],
                "guarded_move": row["guarded_move"],
                "resource_bucket_multiplicity": row["resource_bucket_multiplicity"],
                "source_identity_fnv64": row["source_identity_fnv64"],
            }
        )
    return manifest


def dual_selection_manifest(result: DualSolveResult) -> list[dict[str, Any]]:
    return lane_manifest(result, "A") + lane_manifest(result, "B")


def dual_selection_digest(result: DualSolveResult) -> str:
    return sha256_json(dual_selection_manifest(result))


def resource_uniqueness(candidates: Sequence[Candidate]) -> dict[str, int]:
    return {
        "raw_source_fens": len({candidate.bundle.source_fen for candidate in candidates}),
        "raw_source_fen_plus_horizon_states": len({candidate.bundle.state for candidate in candidates}),
        "raw_clusters": len({candidate.bundle.cluster for candidate in candidates}),
        "perspective_canonical_source_fens": len(
            {candidate.bundle.canonical_source_fen for candidate in candidates}
        ),
        "raw_opening_fens": len({candidate.bundle.opening_fen for candidate in candidates}),
    }


def lane_balance_violations(rows: Sequence[Candidate], lane: str) -> list[str]:
    violations: list[str] = []
    if len(rows) != ROWS_PER_ASSIGNMENT:
        violations.append(f"lane_{lane}:sources={len(rows)}:expected={ROWS_PER_ASSIGNMENT}")
    variants = Counter(row.row["variant"] for row in rows)
    panels = Counter(row.row["source_panel"] for row in rows)
    colors = Counter(row.row["actual_color"] for row in rows)
    duels = Counter(row.row["source_duel_id"] for row in rows)
    if variants != Counter({variant: 6 for variant in VARIANTS}):
        violations.append(f"lane_{lane}:variant_balance_failed")
    if panels != Counter({panel: 36 for panel in PANELS}):
        violations.append(f"lane_{lane}:panel_balance_failed")
    if colors != Counter({color: 36 for color in COLORS}):
        violations.append(f"lane_{lane}:color_balance_failed")
    if duels != Counter(
        {str(ROLE_CONFIG[role]["duel"]): 24 for role in ("pro", "normal", "fast")}
    ):
        violations.append(f"lane_{lane}:duel_balance_failed")
    return violations


def deletion_witnesses(result: DualSolveResult) -> tuple[list[dict[str, Any]], list[str]]:
    require(result.status == "solved", "deletion witnesses require a solved assignment")
    lanes = {lane: flatten_lane(result, lane) for lane in ("A", "B")}
    lane_digests = {lane: sha256_json(lane_manifest(result, lane)) for lane in lanes}
    lane_complete = {
        lane: (
            not lane_balance_violations(rows, lane)
            and all(count == ROWS_PER_ASSIGNMENT for count in resource_uniqueness(rows).values())
        )
        for lane, rows in lanes.items()
    }
    witnesses: list[dict[str, Any]] = []
    violations: list[str] = []
    for removed_lane, intact_lane in (("A", "B"), ("B", "A")):
        intact = lanes[intact_lane]
        for selected_index, removed in enumerate(lanes[removed_lane]):
            hit_counts = {
                "raw_source_fen": sum(
                    removed.bundle.source_fen == candidate.bundle.source_fen
                    for candidate in intact
                ),
                "raw_source_fen_plus_horizon": sum(
                    removed.bundle.state == candidate.bundle.state for candidate in intact
                ),
                "raw_cluster_provenance": sum(
                    removed.bundle.cluster == candidate.bundle.cluster for candidate in intact
                ),
                "perspective_canonical_source_fen": sum(
                    removed.bundle.canonical_source_fen
                    == candidate.bundle.canonical_source_fen
                    for candidate in intact
                ),
                "raw_opening_fen": sum(
                    removed.bundle.opening_fen == candidate.bundle.opening_fen
                    for candidate in intact
                ),
            }
            overlap_count = sum(hit_counts.values())
            passed = overlap_count == 0 and lane_complete[intact_lane]
            witnesses.append(
                {
                    "removed_lane": removed_lane,
                    "removed_index": selected_index,
                    "removed_source_identity_fnv64": removed.row["source_identity_fnv64"],
                    "intact_lane": intact_lane,
                    "intact_lane_rows": len(intact),
                    "intact_lane_digest_sha256": lane_digests[intact_lane],
                    "intact_lane_complete": lane_complete[intact_lane],
                    "deleted_resource_hit_counts_in_opposite_lane": hit_counts,
                    "deleted_resource_hits_in_opposite_lane": overlap_count,
                    "pass": passed,
                }
            )
            if not passed:
                violations.append(
                    f"deletion_witness:{removed_lane}:{selected_index}:overlaps={overlap_count}"
                )
    require(len(witnesses) == REQUIRED_TOTAL_SELECTED, "deletion witness count drift")
    return witnesses, violations


def build_report(
    logs: Sequence[ParsedLog],
    quarantine: ResourceInventory,
    *,
    v1_capture: CapturedInput | None = None,
    v1_inventory: ResourceInventory | None = None,
    v2_logs: Sequence[Any] | None = None,
    v2_inventory: ResourceInventory | None = None,
) -> dict[str, Any]:
    require(
        [log.role for log in logs] == ["pro", "normal", "fast"],
        "combined audit requires v3 pro, normal, fast order",
    )
    candidates = [candidate for log in logs for candidate in log.candidates]
    quarantined: list[tuple[Candidate, tuple[str, ...]]] = []
    surviving: list[Candidate] = []
    for candidate in candidates:
        hits = bundle_hits(candidate.bundle, quarantine)
        if hits:
            quarantined.append((candidate, hits))
        else:
            surviving.append(candidate)

    violations: list[str] = []
    for log in logs:
        if log.summary["universe_complete"] is not True:
            violations.append(f"{log.role}:universe_incomplete")
    post_cell_counts = Counter(candidate.cell for candidate in surviving)
    for duel_index in range(3):
        for variant_index in range(len(VARIANTS)):
            for panel_index in range(len(PANELS)):
                count = len(
                    {
                        candidate.bundle
                        for candidate in surviving
                        if candidate.cell == (duel_index, variant_index, panel_index)
                    }
                )
                if count < 2:
                    violations.append(
                        f"insufficient_post_quarantine_cell_bundles:duel={duel_index}"
                        f":variant={variant_index}:panel={panel_index}:actual={count}:required=2"
                    )

    slots = make_pair_slots(surviving)
    primary = solve_dual_slots(slots, DUAL_SLOT_BUNDLE_TRIAL_CAP)
    if primary.status != "solved":
        violations.append(f"dual_solver:{primary.status}")

    lane_manifests: dict[str, list[dict[str, Any]]] = {"A": [], "B": []}
    selection_digest: str | None = None
    selected_rows: list[Candidate] = []
    uniqueness = {
        "raw_source_fens": 0,
        "raw_source_fen_plus_horizon_states": 0,
        "raw_clusters": 0,
        "perspective_canonical_source_fens": 0,
        "raw_opening_fens": 0,
    }
    witnesses: list[dict[str, Any]] = []
    lane_rows: dict[str, list[Candidate]] = {"A": [], "B": []}
    if primary.status == "solved":
        lane_rows = {lane: flatten_lane(primary, lane) for lane in ("A", "B")}
        selected_rows = lane_rows["A"] + lane_rows["B"]
        lane_manifests = {lane: lane_manifest(primary, lane) for lane in ("A", "B")}
        selection_digest = dual_selection_digest(primary)
        require(
            len(selected_rows) == REQUIRED_TOTAL_SELECTED,
            "solved assignment did not select exactly 144 rows",
        )
        uniqueness = resource_uniqueness(selected_rows)
        for resource_name, count in uniqueness.items():
            if count != REQUIRED_TOTAL_SELECTED:
                violations.append(
                    f"combined_selected_resource_not_unique:{resource_name}"
                    f":actual={count}:expected={REQUIRED_TOTAL_SELECTED}"
                )
        for lane in ("A", "B"):
            violations.extend(lane_balance_violations(lane_rows[lane], lane))
        witnesses, witness_violations = deletion_witnesses(primary)
        violations.extend(witness_violations)
        if len(witnesses) != REQUIRED_TOTAL_SELECTED or not all(
            witness["pass"] for witness in witnesses
        ):
            violations.append("direct_deletion_witness_gate_failed")
        selected_quarantine_overlap = sum(
            bool(bundle_hits(candidate.bundle, quarantine)) for candidate in selected_rows
        )
        if selected_quarantine_overlap:
            violations.append(f"selected_quarantine_overlap={selected_quarantine_overlap}")
    else:
        selected_quarantine_overlap = 0

    universe_digest = sha256_json(normalized_universe(candidates))
    post_quarantine_digest = sha256_json(normalized_universe(surviving))
    reversed_candidates = list(reversed(candidates))
    reversed_surviving = [
        candidate
        for candidate in reversed_candidates
        if not bundle_hits(candidate.bundle, quarantine)
    ]
    reversed_universe_digest = sha256_json(normalized_universe(reversed_candidates))
    reversed_post_digest = sha256_json(normalized_universe(reversed_surviving))
    reversed_result = solve_dual_slots(
        make_pair_slots(reversed_surviving), DUAL_SLOT_BUNDLE_TRIAL_CAP
    )
    reversed_selection_digest = (
        dual_selection_digest(reversed_result) if reversed_result.status == "solved" else None
    )
    reversal_pass = (
        universe_digest == reversed_universe_digest
        and post_quarantine_digest == reversed_post_digest
        and primary.status == reversed_result.status
        and primary.dual_slot_bundle_trials == reversed_result.dual_slot_bundle_trials
        and selection_digest == reversed_selection_digest
    )
    if not reversal_pass:
        violations.append("input_reversal_determinism_failed")

    hit_counts = Counter()
    hit_rows = Counter()
    excluded_per_duel = Counter()
    for candidate, hits in quarantined:
        multiplicity = candidate.row["resource_bucket_multiplicity"]
        excluded_per_duel[candidate.role] += 1
        for hit in hits:
            hit_counts[hit] += 1
            hit_rows[hit] += multiplicity
    post_cell_entries = [
        f"{ROLE_CONFIG[role]['duel']}|{VARIANTS[variant_index]}|{PANELS[panel_index]}="
        f"{post_cell_counts[(int(ROLE_CONFIG[role]['duel_index']), variant_index, panel_index)]}"
        for role in ("pro", "normal", "fast")
        for variant_index in range(len(VARIANTS))
        for panel_index in range(len(PANELS))
    ]
    post_min = min(
        (
            post_cell_counts[(duel_index, variant_index, panel_index)]
            for duel_index in range(3)
            for variant_index in range(len(VARIANTS))
            for panel_index in range(len(PANELS))
        ),
        default=0,
    )
    lane_counts: dict[str, Any] = {}
    for lane in ("A", "B"):
        rows = lane_rows[lane]
        lane_counts[lane] = {
            "sources": len(rows),
            "variant_counts": count_entries(Counter(row.row["variant"] for row in rows), VARIANTS),
            "panel_counts": count_entries(Counter(row.row["source_panel"] for row in rows), PANELS),
            "color_counts": count_entries(Counter(row.row["actual_color"] for row in rows), COLORS),
            "duel_counts": count_entries(
                Counter(row.row["source_duel_id"] for row in rows),
                tuple(str(ROLE_CONFIG[role]["duel"]) for role in ("pro", "normal", "fast")),
            ),
        }

    violations = sorted(set(violations))
    pilot_pass = not violations
    report: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "architecture_id": ARCHITECTURE_ID,
        "report_id": REPORT_ID,
        "probe_data_role": PROBE_DATA_ROLE,
        "seed_family_id": SEED_FAMILY_ID,
        "v3_inputs": [
            {
                "role": log.role,
                "path": str(log.capture.path),
                "size": log.capture.size,
                "sha256": log.capture.sha256,
                "candidate_count": log.summary["candidate_count"],
                "collapsed_candidate_count": len(log.candidates),
                "universe_digest_fnv64": log.summary["candidate_universe_digest_fnv64"],
            }
            for log in logs
        ],
        "protocol": {
            "fixed_repeats": FIXED_REPEATS,
            "games_per_repeat": GAMES_PER_REPEAT,
            "max_plies": MAX_PLIES,
            "duels": 3,
            "variants": len(VARIANTS),
            "panels": len(PANELS),
            "base_variant_duel_slots": len(slots),
            "required_assignments": REQUIRED_ASSIGNMENTS,
            "rows_per_assignment": ROWS_PER_ASSIGNMENT,
            "required_total_selected": REQUIRED_TOTAL_SELECTED,
            "resource_keys": list(RESOURCE_KEYS),
            "dual_slot_bundle_trial_cap": DUAL_SLOT_BUNDLE_TRIAL_CAP,
            "solver_trial_unit": SOLVER_TRIAL_UNIT,
            "mrv_key": "exact_legal_single_pair_count_availability_bound_then_variant_duel",
            "forward_check": "deterministic_first_complete_four_row_choice_exists",
            "input_order_independent": True,
            "pilot_rows_never_model_data": True,
        },
        "combined_candidate_count": len(candidates),
        "combined_universe_digest_sha256": universe_digest,
        "post_quarantine_candidate_count": len(surviving),
        "post_quarantine_universe_digest_sha256": post_quarantine_digest,
        "quarantine": {
            "comparison": "raw_equality_within_each_of_five_domains_hashes_audit_only",
            "v1_recoverable_domains": [
                "raw_source_fen",
                "raw_source_fen_plus_horizon",
                "raw_cluster_provenance",
                "perspective_canonical_source_fen",
            ],
            "v1_unrecoverable_domains": ["raw_opening_fen"],
            "union_resource_counts": quarantine.counts(),
            "excluded_candidate_bundles": len(quarantined),
            "excluded_pre_collapse_rows": sum(
                candidate.row["resource_bucket_multiplicity"]
                for candidate, _ in quarantined
            ),
            "excluded_bundles_per_duel": [
                f"{role}={excluded_per_duel[role]}" for role in ("pro", "normal", "fast")
            ],
            "resource_hit_bundles": [
                f"{resource}={hit_counts[resource]}" for resource in RESOURCE_KEYS
            ],
            "resource_hit_pre_collapse_rows": [
                f"{resource}={hit_rows[resource]}" for resource in RESOURCE_KEYS
            ],
            "post_quarantine_eligible_cells": sum(count > 0 for count in post_cell_counts.values()),
            "post_quarantine_min_cell_candidate_count": post_min,
            "post_quarantine_cell_counts": post_cell_entries,
            "selected_overlap": selected_quarantine_overlap,
        },
        "dual_solver": {
            "status": primary.status,
            "dual_slot_bundle_trials": primary.dual_slot_bundle_trials,
            "trial_cap": primary.trial_cap,
            "trial_unit": SOLVER_TRIAL_UNIT,
        },
        "selection_digest_sha256": selection_digest,
        "lane_selection_digests_sha256": {
            lane: sha256_json(lane_manifests[lane]) if lane_manifests[lane] else None
            for lane in ("A", "B")
        },
        "lane_manifests": lane_manifests,
        "lane_counts": lane_counts,
        "combined_selected_resource_counts": uniqueness,
        "direct_deletion_witnesses": {
            "required": REQUIRED_TOTAL_SELECTED,
            "attempted": len(witnesses),
            "passed": sum(witness["pass"] for witness in witnesses),
            "witnesses": witnesses,
        },
        "input_reversal_audit": {
            "original_universe_digest_sha256": universe_digest,
            "reversed_universe_digest_sha256": reversed_universe_digest,
            "original_post_quarantine_digest_sha256": post_quarantine_digest,
            "reversed_post_quarantine_digest_sha256": reversed_post_digest,
            "original_solver_status": primary.status,
            "reversed_solver_status": reversed_result.status,
            "original_dual_slot_bundle_trials": primary.dual_slot_bundle_trials,
            "reversed_dual_slot_bundle_trials": reversed_result.dual_slot_bundle_trials,
            "original_selection_digest_sha256": selection_digest,
            "reversed_selection_digest_sha256": reversed_selection_digest,
            "pass": reversal_pass,
        },
        "violations": violations,
        "pilot_pass": pilot_pass,
        "decision": (
            "go_freeze_fresh_model_family_precommit_only"
            if pilot_pass
            else "kill_automove_dense_pareto_pairnet_v3_dual_reserve_joint_matching_no_v4"
        ),
        "authorization": "fresh_model_family_precommit_only" if pilot_pass else "none",
        "fresh_model_family_precommit_permission": pilot_pass,
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
        "corpus_label_permission": False,
        "pairability_data_permission": False,
        "model_data_permission": False,
        "tensor_extraction_permission": False,
        "runtime_permission": False,
        "dashboard_permission": False,
        "promotion_permission": False,
        "next_action": (
            "freeze_report_and_write_fresh_model_family_precommit"
            if pilot_pass
            else "archive_no_go_without_seed_repeat_source_retry_or_v4"
        ),
    }
    if v1_capture is not None:
        report["quarantine"]["v1_combined_report"] = {
            "path": str(v1_capture.path),
            "size": v1_capture.size,
            "sha256": v1_capture.sha256,
            "resource_counts": (v1_inventory or ResourceInventory.empty()).counts(),
        }
    if v2_logs is not None:
        report["quarantine"]["v2_complete_logs"] = [
            {
                "role": log.role,
                "path": str(log.capture.path),
                "size": log.capture.size,
                "sha256": log.capture.sha256,
                "emitted_candidates": len(log.candidates),
            }
            for log in v2_logs
        ]
        report["quarantine"]["v2_resource_counts"] = (
            v2_inventory or ResourceInventory.empty()
        ).counts()
    return report


def report_exit_code(report: dict[str, Any]) -> int:
    return 0 if report.get("pilot_pass") is True else 1


def fixture_fen(variant_index: int, active_color: str, serial: int) -> str:
    return V2.fixture_fen(variant_index, active_color, serial)


def fixture_candidate_values(role: str) -> list[dict[str, Any]]:
    config = ROLE_CONFIG[role]
    role_base = {"pro": 110_000, "normal": 120_000, "fast": 130_000}[role]
    values: list[dict[str, Any]] = []
    for variant_index, variant in enumerate(VARIANTS):
        for panel_index, panel in enumerate(PANELS):
            color = expected_color(variant_index, panel_index, int(config["duel_index"]))
            active = "w" if color == "white" else "b"
            for repeat_index in range(5):
                serial = role_base + variant_index * 100 + panel_index * 10 + repeat_index
                source_fen = fixture_fen(variant_index, active, serial)
                opening_fen = fixture_fen(
                    variant_index,
                    "w",
                    role_base + 50_000 + variant_index * 100 + repeat_index,
                )
                canonical_fen = V2.perspective_canonical_fen(source_fen, color, variant_index)
                cluster, sibling = opening_ids(role, repeat_index, variant_index, variant)
                source_ply = repeat_index * 2 + panel_index
                row: dict[str, Any] = {
                    "schema_version": SCHEMA_VERSION,
                    "architecture_id": ARCHITECTURE_ID,
                    "candidate_independent": True,
                    "alternative_root_labels_used": False,
                    "probe_data_role": PROBE_DATA_ROLE,
                    "seed_family_id": SEED_FAMILY_ID,
                    "source_duel_id": config["duel"],
                    "duel_index": config["duel_index"],
                    "variant": variant,
                    "variant_index": variant_index,
                    "source_panel": panel,
                    "source_result_audit_only": "loss" if panel_index == 0 else "win",
                    "panel_index": panel_index,
                    "required_color": color,
                    "actual_color": color,
                    "source_fen": source_fen,
                    "canonical_source_fen": canonical_fen,
                    "opening_fen": opening_fen,
                    "guarded_move": f"g-{role}-{variant_index}-{panel_index}-{repeat_index}",
                    "guarded_move_legal": True,
                    "candidate_branch": "frontier_execute",
                    "repeat_index": repeat_index,
                    "opening_index": variant_index,
                    "generation_seed_tag": generation_seed_tag(role),
                    "opening_cluster_id": cluster,
                    "side_sibling_id": sibling,
                    "source_ply": source_ply,
                    "max_plies": MAX_PLIES,
                    "remaining_horizon": MAX_PLIES - source_ply,
                    "source_candidate_turn_count": 6,
                    "eligible_frontier_execute_count": 5,
                    "cell_candidate_count": 5,
                    "resource_bucket_multiplicity": 1,
                    "source_identity_fnv64": "0" * 16,
                    "candidate_index": 0,
                }
                row["source_identity_fnv64"] = source_identity(row)
                values.append(row)
    values.sort(
        key=lambda row: (
            row["variant_index"],
            row["panel_index"],
            row["source_ply"],
            row["repeat_index"],
            row["opening_index"],
            row["source_fen"],
            row["guarded_move"],
            row["generation_seed_tag"],
            row["opening_cluster_id"],
            row["side_sibling_id"],
            row["canonical_source_fen"],
            row["opening_fen"],
        )
    )
    for index, row in enumerate(values):
        row["candidate_index"] = index
    return values


def fixture_schema() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "architecture_id": ARCHITECTURE_ID,
        "seed_family_id": SEED_FAMILY_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "probe_data_role": PROBE_DATA_ROLE,
        "candidate_record_prefix": CANDIDATE_PREFIX.rstrip(),
        "summary_record_prefix": SUMMARY_PREFIX.rstrip(),
        "required_assignments": REQUIRED_ASSIGNMENTS,
        "rows_per_assignment": ROWS_PER_ASSIGNMENT,
        "required_total_selected": REQUIRED_TOTAL_SELECTED,
        "selection_location": "external_strict_dual_reserve_matcher_only",
        "collapse_key": "cell,raw_source_fen,raw_source_fen_plus_horizon,raw_cluster_provenance,canonical_source_fen,raw_opening_fen",
        "selection_priority": "source_ply,repeat_index,opening_index,source_fen,guarded_move,generation_seed_tag,opening_cluster_id,side_sibling_id,canonical_source_fen,opening_fen",
        "fixed_variants": list(VARIANTS),
        "candidate_fields": list(CANDIDATE_FIELDS),
        "summary_fields": list(SUMMARY_FIELDS),
        "resource_keys": list(RESOURCE_KEYS),
        "dual_slot_bundle_trial_cap": DUAL_SLOT_BUNDLE_TRIAL_CAP,
        "solver_trial_unit": SOLVER_TRIAL_UNIT,
        "forbidden_inputs": list(FORBIDDEN_INPUTS),
    }


def fixture_summary(role: str, values: Sequence[dict[str, Any]]) -> dict[str, Any]:
    candidates = tuple(
        validate_candidate(dict(value), role, f"{role} fixture candidate[{index}]")
        for index, value in enumerate(values)
    )
    cell_counts = Counter(
        (candidate.row["variant_index"], candidate.row["panel_index"])
        for candidate in candidates
    )
    variant_counts = Counter(candidate.row["variant"] for candidate in candidates)
    panel_counts = Counter(candidate.row["source_panel"] for candidate in candidates)
    color_counts = Counter(candidate.row["actual_color"] for candidate in candidates)
    all_cells = [
        cell_counts[(variant_index, panel_index)]
        for variant_index in range(len(VARIANTS))
        for panel_index in range(len(PANELS))
    ]
    config = ROLE_CONFIG[role]
    return {
        "schema_version": SCHEMA_VERSION,
        "architecture_id": ARCHITECTURE_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "probe_data_role": PROBE_DATA_ROLE,
        "seed_family_id": SEED_FAMILY_ID,
        "source_duel_id": config["duel"],
        "duel_index": config["duel_index"],
        "repeat_offset": 0,
        "repeats": FIXED_REPEATS,
        "games_per_repeat": GAMES_PER_REPEAT,
        "max_plies": MAX_PLIES,
        "expected_cells": EXPECTED_CELLS_PER_DUEL,
        "required_assignments": REQUIRED_ASSIGNMENTS,
        "rows_per_assignment": ROWS_PER_ASSIGNMENT,
        "required_total_selected": REQUIRED_TOTAL_SELECTED,
        "candidate_count": len(candidates),
        "collapsed_candidate_count": len(candidates),
        "emitted_candidates": len(candidates),
        "eligible_cells": sum(count > 0 for count in all_cells),
        "min_cell_candidate_count": min(all_cells),
        "max_cell_candidate_count": max(all_cells),
        "unique_source_fens": len({candidate.bundle.source_fen for candidate in candidates}),
        "unique_states": len({candidate.bundle.state for candidate in candidates}),
        "unique_canonical_source_fens": len(
            {candidate.bundle.canonical_source_fen for candidate in candidates}
        ),
        "unique_opening_fens": len({candidate.bundle.opening_fen for candidate in candidates}),
        "unique_clusters": len({candidate.bundle.cluster for candidate in candidates}),
        "variant_counts": count_entries(variant_counts, VARIANTS),
        "panel_counts": count_entries(panel_counts, PANELS),
        "color_counts": count_entries(color_counts, COLORS),
        "per_cell_candidate_counts": cell_count_entries(cell_counts),
        "violations": summary_violations(cell_counts),
        "candidate_universe_digest_fnv64": candidate_universe_digest(candidates),
        "universe_complete": True,
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
        "corpus_label_permission": False,
        "model_data_permission": False,
        "tensor_extraction_permission": False,
        "runtime_permission": False,
        "dashboard_permission": False,
        "promotion_permission": False,
        "next_action": "run_strict_dual_reserve_matcher_only",
    }


def fixture_log(role: str, candidate_mutation: Any | None = None) -> bytes:
    values = fixture_candidate_values(role)
    if candidate_mutation is not None:
        candidate_mutation(values)
        for row in values:
            row["source_identity_fnv64"] = source_identity(row)
        values.sort(
            key=lambda row: (
                row["variant_index"],
                row["panel_index"],
                row["source_ply"],
                row["repeat_index"],
                row["opening_index"],
                row["source_fen"],
                row["guarded_move"],
                row["generation_seed_tag"],
                row["opening_cluster_id"],
                row["side_sibling_id"],
                row["canonical_source_fen"],
                row["opening_fen"],
            )
        )
        for index, row in enumerate(values):
            row["candidate_index"] = index
    lines = [
        SCHEMA_PREFIX + canonical_json(fixture_schema()),
        *(CANDIDATE_PREFIX + canonical_json(value) for value in values),
        SUMMARY_PREFIX + canonical_json(fixture_summary(role, values)),
    ]
    return (
        "running 1 test\n"
        + "\n".join(lines)
        + "\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; "
        "999 filtered out; finished in 0.01s\n"
    ).encode("utf-8")


def synthetic_capture(role: str, raw: bytes) -> CapturedInput:
    return CapturedInput(
        path=Path(f"v3-{role}.log"),
        raw=raw,
        size=len(raw),
        sha256=hashlib.sha256(raw).hexdigest(),
        device=31,
        inode={"pro": 31, "normal": 32, "fast": 33}[role],
    )


def expect_error(action: Any, message: str) -> None:
    try:
        action()
    except DualReserveError:
        return
    raise DualReserveError(message)


def mutate_first_record(raw: bytes, prefix: str, mutation: Any) -> bytes:
    lines = raw.decode("utf-8").splitlines()
    index = next(index for index, line in enumerate(lines) if line.startswith(prefix))
    value = parse_json(lines[index][len(prefix) :], "fixture mutation")
    mutation(value)
    lines[index] = prefix + canonical_json(value)
    return ("\n".join(lines) + "\n").encode("utf-8")


def solver_bundle(label: str) -> ResourceBundle:
    return ResourceBundle(
        f"fen-{label}",
        (f"fen-{label}", 1),
        (f"seed-{label}", 0, 0, f"variant-{label}"),
        f"canonical-{label}",
        f"opening-{label}",
    )


def solver_candidate(
    variant_index: int,
    duel_index: int,
    panel_index: int,
    priority: int,
    bundle_label: str,
    identity: str,
) -> Candidate:
    row = {
        "duel_index": duel_index,
        "variant_index": variant_index,
        "panel_index": panel_index,
        "source_ply": priority,
        "repeat_index": priority,
        "opening_index": variant_index,
        "source_fen": f"priority-fen-{identity}",
        "guarded_move": f"move-{identity}",
        "generation_seed_tag": f"generation-{identity}",
        "opening_cluster_id": f"cluster-{identity}",
        "side_sibling_id": f"sibling-{identity}",
        "canonical_source_fen": f"priority-canonical-{identity}",
        "opening_fen": f"priority-opening-{identity}",
        "remaining_horizon": MAX_PLIES - priority,
        "source_identity_fnv64": fnv_hex(identity),
    }
    return Candidate("synthetic", row, solver_bundle(bundle_label))


def self_test_solver_protocol() -> None:
    # The two old loss candidates reproduce the v2 articulation resource; a
    # prospectively present fresh reserve makes a simultaneous dual choice
    # possible without post-viewed substitution.
    articulation = [
        solver_candidate(0, 0, 0, 0, "articulation", "old-loss-0"),
        solver_candidate(0, 0, 0, 1, "articulation", "old-loss-1"),
        solver_candidate(0, 0, 0, 2, "fresh-reserve", "fresh-loss"),
        solver_candidate(0, 0, 1, 0, "save-0", "save-0"),
        solver_candidate(0, 0, 1, 1, "save-1", "save-1"),
        solver_candidate(0, 0, 1, 2, "save-2", "save-2"),
    ]
    articulation_result = solve_dual_slots(
        make_pair_slots_for_keys(articulation, [(0, 0)]), 100
    )
    require(articulation_result.status == "solved", "v2 articulation fixture not recovered")
    articulation_rows = flatten_dual(articulation_result)
    require(
        len({row.bundle for row in articulation_rows}) == 4
        and any(row.bundle == solver_bundle("fresh-reserve") for row in articulation_rows),
        "simultaneous reserve construction did not use the fresh reserve",
    )

    # Slot 0 has the lower MRV bound. Its first complete four-row choices use
    # X, but slot 1 needs both X and P as its two loss rows. The solver must
    # backtrack to slot 0's W/Z dual choice.
    hall = [
        solver_candidate(0, 0, 0, 0, "x", "a-loss-x"),
        solver_candidate(0, 0, 0, 1, "w", "a-loss-w"),
        solver_candidate(0, 0, 0, 2, "z", "a-loss-z"),
        solver_candidate(0, 0, 1, 0, "a", "a-save-a"),
        solver_candidate(0, 0, 1, 1, "b", "a-save-b"),
        solver_candidate(1, 0, 0, 0, "x", "b-loss-x"),
        solver_candidate(1, 0, 0, 1, "p", "b-loss-p"),
        solver_candidate(1, 0, 1, 0, "q", "b-save-q"),
        solver_candidate(1, 0, 1, 1, "r", "b-save-r"),
        solver_candidate(1, 0, 1, 2, "s", "b-save-s"),
        solver_candidate(1, 0, 1, 3, "t", "b-save-t"),
    ]
    hall_result = solve_dual_slots(
        make_pair_slots_for_keys(hall, [(0, 0), (1, 0)]), 1_000
    )
    require(hall_result.status == "solved", "dual Hall/backtracking fixture did not solve")
    require(hall_result.dual_slot_bundle_trials > 2, "dual Hall fixture did not backtrack")
    first_slot = dict(hall_result.selected)[(0, 0)].ordered()
    require(
        not any(row.bundle == solver_bundle("x") for row in first_slot),
        "dual Hall solver retained the greedy conflicting resource",
    )

    one_slot_candidates = [
        solver_candidate(0, 0, 0, 0, "cap-l0", "cap-l0"),
        solver_candidate(0, 0, 0, 1, "cap-l1", "cap-l1"),
        solver_candidate(0, 0, 1, 0, "cap-s0", "cap-s0"),
        solver_candidate(0, 0, 1, 1, "cap-s1", "cap-s1"),
    ]
    one_slot = make_pair_slots_for_keys(one_slot_candidates, [(0, 0)])
    require(solve_dual_slots(one_slot, 0).status == "cap_exhausted", "cap exhaustion conflated")
    require(solve_dual_slots(one_slot, 1).status == "solved", "one exact quadruple trial did not solve")
    impossible = make_pair_slots_for_keys(
        [
            solver_candidate(0, 0, 0, 0, "only-loss", "only-loss"),
            solver_candidate(0, 0, 1, 0, "save-left", "save-left"),
            solver_candidate(0, 0, 1, 1, "save-right", "save-right"),
        ],
        [(0, 0)],
    )
    require(
        solve_dual_slots(impossible, 100).status == "proven_infeasible",
        "proven infeasibility was not distinguished from cap exhaustion",
    )


def self_test_quarantine(candidates: Sequence[Candidate]) -> None:
    candidate = candidates[0]
    bundle = candidate.bundle
    inventories = (
        ("raw_source_fen", ResourceInventory(frozenset({bundle.source_fen}), frozenset(), frozenset(), frozenset(), frozenset())),
        ("raw_source_fen_plus_horizon", ResourceInventory(frozenset(), frozenset({bundle.state}), frozenset(), frozenset(), frozenset())),
        ("raw_cluster_provenance", ResourceInventory(frozenset(), frozenset(), frozenset({bundle.cluster}), frozenset(), frozenset())),
        ("perspective_canonical_source_fen", ResourceInventory(frozenset(), frozenset(), frozenset(), frozenset({bundle.canonical_source_fen}), frozenset())),
        ("raw_opening_fen", ResourceInventory(frozenset(), frozenset(), frozenset(), frozenset(), frozenset({bundle.opening_fen}))),
    )
    for expected, inventory in inventories:
        require(bundle_hits(bundle, inventory) == (expected,), f"raw quarantine domain {expected} failed")

    # The complete synthetic v2 universe, not merely a selected manifest,
    # excludes every one of its emitted rows.
    v2_full = ResourceInventory.from_bundles(row.bundle for row in candidates)
    require(
        all(bundle_hits(row.bundle, v2_full) for row in candidates),
        "v2 full emitted universe was not wholly excluded",
    )

    # A self-contained 72-row v1-shaped manifest recovers four exact domains.
    v1_rows = [dict(row.row) for row in candidates[:72]]
    synthetic_v1 = {
        "schema_version": 1,
        "architecture_id": "automove_dense_pareto_pairnet_v1",
        "report_id": "automove_dense_pareto_source_coverage_family_v1",
        "coverage_pass": False,
        "decision": "fail_source_coverage_family",
        "authorization": "none",
        "source_manifest": v1_rows,
    }
    recovered = recover_v1_inventory(synthetic_v1)
    require(not recovered.opening_fens, "unrecoverable v1 opening FENs were invented")
    for row in candidates[:72]:
        hits = bundle_hits(row.bundle, recovered)
        require(
            hits
            == (
                "raw_source_fen",
                "raw_source_fen_plus_horizon",
                "raw_cluster_provenance",
                "perspective_canonical_source_fen",
            ),
            "v1 recoverable full-manifest exclusion failed",
        )


def self_test() -> None:
    require(V2_MATCHER_SHA256 == hashlib.sha256(Path(__file__).with_name(V2_MATCHER_NAME).read_bytes()).hexdigest(), "v2 matcher pin drift")
    expect_error(lambda: parse_json('{"a":', "malformed fixture"), "malformed JSON accepted")
    expect_error(lambda: parse_json('{"a":1,"a":2}', "duplicate fixture"), "duplicate key accepted")
    expect_error(lambda: parse_json('{"a":NaN}', "nonfinite fixture"), "NaN accepted")

    logs = [
        parse_events(synthetic_capture(role, fixture_log(role)), role)
        for role in ("pro", "normal", "fast")
    ]
    candidates = [candidate for log in logs for candidate in log.candidates]
    report = build_report(logs, ResourceInventory.empty())
    require(report["pilot_pass"] is True, "passing dual-reserve fixture did not pass")
    require(report_exit_code(report) == 0, "passing fixture exit code")
    require(report["dual_solver"]["status"] == "solved", "passing fixture solver")
    require(
        report["lane_counts"]["A"]["sources"]
        == report["lane_counts"]["B"]["sources"]
        == ROWS_PER_ASSIGNMENT,
        "per-lane row balance failed",
    )
    require(
        report["direct_deletion_witnesses"]["passed"] == REQUIRED_TOTAL_SELECTED,
        "direct opposite-lane deletion witnesses failed",
    )
    require(
        all(count == REQUIRED_TOTAL_SELECTED for count in report["combined_selected_resource_counts"].values()),
        "combined 144-row resource uniqueness failed",
    )
    require(report["input_reversal_audit"]["pass"] is True, "reversal fixture failed")

    self_test_quarantine(candidates)
    self_test_solver_protocol()

    # Mutate one B row to share A's complete bundle and prove that the direct
    # witness validator fails even though both lane row counts remain 72.
    solved = solve_dual_slots(make_pair_slots(candidates), DUAL_SLOT_BUNDLE_TRIAL_CAP)
    selected = list(solved.selected)
    key, choice = selected[0]
    bad_b_loss = Candidate(choice.b_loss.role, choice.b_loss.row, choice.a_loss.bundle)
    selected[0] = (
        key,
        DualChoice(choice.a_loss, choice.a_save, bad_b_loss, choice.b_save),
    )
    bad_result = DualSolveResult("solved", tuple(selected), solved.dual_slot_bundle_trials, solved.trial_cap)
    bad_witnesses, bad_violations = deletion_witnesses(bad_result)
    require(
        bad_violations and sum(not witness["pass"] for witness in bad_witnesses) >= 2,
        "opposite-lane witness failure was not detected",
    )

    # Raw quarantine equality is applied after full log authentication. One
    # exhausted cell must therefore fail the >=2 post-filter bundle gate.
    target_cell = (0, 0, 0)
    exhausted_inventory = ResourceInventory.from_bundles(
        candidate.bundle for candidate in candidates if candidate.cell == target_cell
    )
    exhausted = build_report(logs, exhausted_inventory)
    require(exhausted["pilot_pass"] is False, "quarantine-exhausted cell passed")
    require(
        any(violation.startswith("insufficient_post_quarantine_cell_bundles:duel=0:variant=0:panel=0") for violation in exhausted["violations"]),
        "post-quarantine cell gate did not fail closed",
    )

    harness = (
        "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; "
        "999 filtered out; finished in 0.01s"
    )
    missing_harness = fixture_log("pro").decode().replace(harness + "\n", "").encode()
    expect_error(lambda: parse_events(synthetic_capture("pro", missing_harness), "pro"), "missing harness accepted")
    failed_harness = fixture_log("pro").decode().replace(harness, "test result: FAILED. 0 passed; 1 failed").encode()
    expect_error(lambda: parse_events(synthetic_capture("pro", failed_harness), "pro"), "failed harness accepted")
    duplicate_harness = fixture_log("pro") + (harness + "\n").encode()
    expect_error(lambda: parse_events(synthetic_capture("pro", duplicate_harness), "pro"), "duplicate harness accepted")
    unknown = fixture_log("pro") + b"DENSE_PARETO_DUAL_RESERVE_SOURCE_UNKNOWN_V3 {}\n"
    expect_error(lambda: parse_events(synthetic_capture("pro", unknown), "pro"), "unknown prefix accepted")
    duplicate_key = fixture_log("pro").replace(b'"schema_version":3', b'"schema_version":3,"schema_version":3', 1)
    expect_error(lambda: parse_events(synthetic_capture("pro", duplicate_key), "pro"), "duplicate structured key accepted")
    extra_field = mutate_first_record(
        fixture_log("pro"), CANDIDATE_PREFIX, lambda row: row.__setitem__("root_rank", 1)
    )
    expect_error(lambda: parse_events(synthetic_capture("pro", extra_field), "pro"), "unknown candidate field accepted")
    wrong_schema = mutate_first_record(
        fixture_log("pro"), SCHEMA_PREFIX, lambda row: row.__setitem__("required_assignments", 3)
    )
    expect_error(lambda: parse_events(synthetic_capture("pro", wrong_schema), "pro"), "three-assignment schema accepted")
    wrong_canonical = mutate_first_record(
        fixture_log("pro"),
        CANDIDATE_PREFIX,
        lambda row: row.__setitem__(
            "canonical_source_fen", fixture_fen(row["variant_index"], "w", 999_999)
        ),
    )
    expect_error(lambda: parse_events(synthetic_capture("pro", wrong_canonical), "pro"), "wrong canonical FEN accepted")
    reordered_lines = fixture_log("pro").decode().splitlines()
    indices = [index for index, line in enumerate(reordered_lines) if line.startswith(CANDIDATE_PREFIX)]
    reordered_lines[indices[0]], reordered_lines[indices[1]] = reordered_lines[indices[1]], reordered_lines[indices[0]]
    reordered = ("\n".join(reordered_lines) + "\n").encode()
    expect_error(lambda: parse_events(synthetic_capture("pro", reordered), "pro"), "noncanonical emission order accepted")

    previous = Path.cwd()
    with tempfile.TemporaryDirectory() as directory:
        os.chdir(directory)
        try:
            Path("target/experiment-runs").mkdir(parents=True)
            Path("real.log").write_bytes(b"fixture")
            os.symlink("real.log", "linked.log")
            expect_error(lambda: read_stable_bytes(Path("linked.log"), "symlink fixture"), "symlink input accepted")
            os.mkfifo("fifo.log")
            expect_error(lambda: read_stable_bytes(Path("fifo.log"), "FIFO fixture"), "FIFO input accepted")
            exclusive_atomic_write(Path("target/experiment-runs/report.json"), b"{}\n")
            expect_error(
                lambda: exclusive_atomic_write(Path("target/experiment-runs/report.json"), b"{}\n"),
                "existing output overwritten",
            )
            os.symlink("report.json", "target/experiment-runs/linked-output.json")
            expect_error(
                lambda: exclusive_atomic_write(Path("target/experiment-runs/linked-output.json"), b"{}\n"),
                "symlink output accepted",
            )
            expect_error(
                lambda: exclusive_atomic_write(Path("target/experiment-runs/../escape.json"), b"{}\n"),
                "non-normalized output accepted",
            )
        finally:
            os.chdir(previous)
    print("automove dense-Pareto dual-reserve v3 summarizer self-test: ok")


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--pro-log", action="append")
    parser.add_argument("--normal-log", action="append")
    parser.add_argument("--fast-log", action="append")
    parser.add_argument("--v2-pro-log", action="append")
    parser.add_argument("--v2-normal-log", action="append")
    parser.add_argument("--v2-fast-log", action="append")
    parser.add_argument("--v1-report", action="append")
    parser.add_argument("--output", action="append")
    args = parser.parse_args(argv)
    supplied = (
        args.pro_log,
        args.normal_log,
        args.fast_log,
        args.v2_pro_log,
        args.v2_normal_log,
        args.v2_fast_log,
        args.v1_report,
        args.output,
    )
    if args.self_test:
        require(not any(supplied), "--self-test takes no input or output arguments")
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
        "exactly one of every v3 log, v2 quarantine log, v1 report, and output is required",
    )
    (
        pro_log,
        normal_log,
        fast_log,
        v2_pro_log,
        v2_normal_log,
        v2_fast_log,
        v1_report,
        output,
    ) = (value[0] for value in supplied)
    input_paths = [
        Path(pro_log),
        Path(normal_log),
        Path(fast_log),
        Path(v2_pro_log),
        Path(v2_normal_log),
        Path(v2_fast_log),
        Path(v1_report),
    ]
    lexical_inputs = [os.path.abspath(os.fspath(path)) for path in input_paths]
    require(len(set(lexical_inputs)) == len(input_paths), "all seven input paths must be distinct")
    output_path = Path(output)
    validate_output_path(output_path)
    require(
        os.path.abspath(os.fspath(output_path)) not in set(lexical_inputs),
        "output path must differ from every input",
    )
    captures = [
        read_stable_bytes(path, label)
        for path, label in zip(
            input_paths,
            (
                "v3 pro log",
                "v3 normal log",
                "v3 fast log",
                "v2 pro quarantine log",
                "v2 normal quarantine log",
                "v2 fast quarantine log",
                "v1 combined report",
            ),
        )
    ]
    require(
        len({(capture.device, capture.inode) for capture in captures}) == len(captures),
        "input paths must not name the same file or hardlink",
    )
    v3_logs = [
        parse_events(capture, role)
        for role, capture in zip(("pro", "normal", "fast"), captures[:3])
    ]
    v2_logs = authenticate_v2_logs(captures[3:6])
    _, v1_inventory = read_frozen_v1_report(captures[6])
    v2_inventory = inventory_from_v2_logs(v2_logs)
    quarantine = v1_inventory.union(v2_inventory)
    report = build_report(
        v3_logs,
        quarantine,
        v1_capture=captures[6],
        v1_inventory=v1_inventory,
        v2_logs=v2_logs,
        v2_inventory=v2_inventory,
    )
    raw = (canonical_json(report) + "\n").encode("utf-8")
    exclusive_atomic_write(output_path, raw)
    sys.stdout.buffer.write(raw)
    return report_exit_code(report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except DualReserveError as error:
        print(f"automove dense-Pareto dual-reserve v3 error: {error}", file=sys.stderr)
        raise SystemExit(2)
