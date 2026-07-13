#!/usr/bin/env python3
"""Read-only stage-zero preflight for the Full170 factorized DeepSets candidate."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import stat
import sys
import types
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence


ROOT = Path(__file__).resolve().parent.parent
SCRIPTS = ROOT / "scripts"
PRECOMMIT_SIZE = 16_771
PRECOMMIT_SHA = "3b69d1c81fffba62d228b3585751a044d4afe99f005fb4366ae4e3c9c52be567"
SOURCE_MANIFEST_SIZE = 24_984
SOURCE_MANIFEST_SHA = "40c8a438f40e8d3959fe3d36f5d5f4765eb43a21739429843201dcad908f40ec"
PROVENANCE_SIZE = 123_173
PROVENANCE_SHA = "fac221ad91036326ead7bfa6971d007f356dc1dca0f76cccaac2bdbd6282a6f4"
V4_SIZE = 86_891
V4_SHA = "c578b13580e2a9c8db3dcfc1ebb9a741e21eabc28601e1cd4ef95d68f4fb0512"
V2_SIZE = 105_198
V2_SHA = "3243ad0b69a617c18a8cb8cfb2155c6c92c1b0f364d81b86132d1dc0c91ddb54"
V3_SIZE = 89_572
V3_SHA = "b0b9495235f5b5a1815a87c8af9724be5328623c4a74f762cec9f4693e28fb15"
MAX_BYTES = 64 * 1024 * 1024

PROVENANCE_ITEM = "FULL170_DEEPSETS_PROVENANCE_ITEM "
PROVENANCE_SCHEMA = "FULL170_DEEPSETS_PROVENANCE_SCHEMA "
PROVENANCE_SUMMARY = "FULL170_DEEPSETS_PROVENANCE_SUMMARY "

SCALARS = (
    "root_score", "efficiency", "wins_immediately", "attacks_opponent_drainer",
    "own_drainer_vulnerable", "own_drainer_walk_vulnerable", "spirit_development",
    "keeps_awake_spirit_on_base", "mana_handoff_to_opponent", "has_roundtrip",
    "scores_supermana_this_turn", "scores_opponent_mana_this_turn",
    "safe_supermana_pickup_now", "safe_opponent_mana_pickup_now",
    "safe_supermana_progress_steps", "safe_opponent_mana_progress_steps",
    "score_path_best_steps", "same_turn_score_window_value", "spirit_setup_gain",
    "spirit_same_turn_score_setup_now", "spirit_own_mana_setup_now",
    "supermana_progress", "opponent_mana_progress", "interview_soft_priority",
)
FAMILIES = (
    "ImmediateScore", "DenyOpponentWindow", "DrainerKill", "SafeSupermanaProgress",
    "SafeOpponentManaProgress", "DrainerSafetyRecovery", "SpiritImpact", "ManaTempo",
)
DENY = frozenset(
    (
        "10c2c38fbc153021", "37b63e23e3b020a2", "4342261578d7cdf1",
        "c1e94e2c5bd6889c", "de5093ba75772d46", "f6fd5efd9b59e97b",
    )
)


class AuditError(ValueError):
    pass


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AuditError(message)


def strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def reject_constant(value: str) -> None:
    raise AuditError(f"non-finite JSON constant {value!r}")


def parse_json(text: str, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            text, object_pairs_hook=strict_object, parse_constant=reject_constant
        )
    except (json.JSONDecodeError, AuditError) as error:
        raise AuditError(f"{label}: invalid strict JSON: {error}") from error
    require(isinstance(value, dict), f"{label}: object required")
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=True, allow_nan=False
    )


def sha_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode()).hexdigest()


@dataclass(frozen=True)
class Capture:
    path: Path
    raw: bytes
    size: int
    sha256: str
    device: int
    inode: int


def resolve(relative: str, label: str) -> Path:
    require(isinstance(relative, str) and relative, f"{label}: path required")
    path = Path(relative)
    require(not path.is_absolute() and ".." not in path.parts, f"{label}: unsafe path")
    absolute = (ROOT / path).resolve()
    try:
        absolute.relative_to(ROOT)
    except ValueError as error:
        raise AuditError(f"{label}: path escapes repository") from error
    return absolute


def capture(path: Path, label: str) -> Capture:
    descriptor = -1
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
        before = os.fstat(descriptor)
        require(stat.S_ISREG(before.st_mode), f"{label}: regular file required")
        require(before.st_size <= MAX_BYTES, f"{label}: exceeds byte cap")
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
            f"{label}: changed during capture",
        )
        raw = b"".join(chunks)
        require(len(raw) == after.st_size, f"{label}: short read")
        return Capture(
            path, raw, len(raw), hashlib.sha256(raw).hexdigest(), after.st_dev, after.st_ino
        )
    except OSError as error:
        raise AuditError(f"{label}: {error}") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def pinned(path: Path, size: int, digest: str, label: str) -> Capture:
    result = capture(path, label)
    require(
        result.size == size and result.sha256 == digest,
        f"{label}: pin drift size={result.size} sha={result.sha256}",
    )
    return result


def authenticate(contract: dict[str, Any], label: str) -> Capture:
    require(set(contract) == {"path", "size_bytes", "sha256"}, f"{label}: file contract")
    return pinned(
        resolve(contract["path"], label), contract["size_bytes"], contract["sha256"], label
    )


def text(value: Capture, label: str) -> str:
    try:
        return value.raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise AuditError(f"{label}: not UTF-8") from error


def load_module(value: Capture, name: str) -> types.ModuleType:
    module = types.ModuleType(name)
    module.__file__ = str(value.path)
    module.__package__ = ""
    sys.modules[name] = module
    try:
        exec(compile(value.raw, str(value.path), "exec"), module.__dict__)
    except SystemExit as error:
        raise AuditError(f"{value.path.name}: dependency exited {error}") from error
    return module


def pairnet_capture(pairnet: types.ModuleType, value: Capture) -> Any:
    return pairnet.CapturedInput(
        path=value.path, raw=value.raw, size=value.size, sha256=value.sha256,
        device=value.device, inode=value.inode
    )


def load_v4_rows(values: Sequence[Capture], v4: types.ModuleType) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    samples: set[str] = set()
    for value in values:
        schemas: list[dict[str, Any]] = []
        for line_number, line in enumerate(text(value, str(value.path)).splitlines(), 1):
            if line.startswith(v4.SCHEMA_PREFIX):
                schemas.append(parse_json(line[len(v4.SCHEMA_PREFIX):], f"{value.path}:{line_number}"))
            elif line.startswith(v4.PREFIX):
                row = parse_json(line[len(v4.PREFIX):], f"{value.path}:{line_number}")
                v4.validate_row(row, f"{value.path}:{line_number}")
                require(row["sample_id"] not in samples, "duplicate v4 sample")
                samples.add(row["sample_id"])
                rows.append(row)
        require(len(schemas) == 1, f"{value.path}: one v4 schema required")
        v4.validate_schema_event(schemas[0], str(value.path))
    require(rows, "no v4 rows")
    return rows


def spatial_names() -> list[str]:
    names: list[str] = []
    for side in ("own", "opp"):
        for mon in ("demon", "drainer", "angel", "spirit", "mystic"):
            for field in (
                "i", "j", "delta_i", "delta_j", "cooldown", "payload_none",
                "payload_own_mana", "payload_opp_mana", "payload_super",
                "payload_potion", "payload_bomb", "payload_either",
            ):
                names.append(f"spatial_{side}_{mon}_{field}")
    for mana in ("own_mana", "opp_mana", "supermana"):
        for field in ("present", "i", "j"):
            names.append(f"spatial_free_{mana}_{field}")
    names.extend(
        (
            "spatial_perspective_own_score", "spatial_perspective_opp_score",
            "spatial_perspective_score_margin", "spatial_perspective_controls_turn",
            "spatial_perspective_remaining_mon_moves", "spatial_perspective_can_use_action",
            "spatial_perspective_can_move_mana", "spatial_perspective_own_potions",
            "spatial_perspective_opp_potions",
        )
    )
    return names


def feature_vector(root: dict[str, Any]) -> tuple[int, ...]:
    features = root["features"]
    values: list[int] = []
    for name in SCALARS:
        value = features[name]
        require(isinstance(value, (int, bool)) and not isinstance(value, float), f"feature {name}")
        values.append(int(value))
    family = features["family"]
    require(family in FAMILIES, f"unknown family {family!r}")
    values.extend(int(family == expected) for expected in FAMILIES)
    spatial = features["spatial"]
    require(isinstance(spatial, list) and len(spatial) == 138, "spatial length")
    require(all(isinstance(item, int) and not isinstance(item, bool) for item in spatial), "spatial integer")
    values.extend(spatial)
    require(len(values) == 170, "full170 width")
    return tuple(values)


def provenance(value: Capture) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    schemas: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    item_raw: list[str] = []
    summaries: list[dict[str, Any]] = []
    for line_number, line in enumerate(text(value, "provenance").splitlines(), 1):
        if line.startswith(PROVENANCE_SCHEMA):
            schemas.append(parse_json(line[len(PROVENANCE_SCHEMA):], f"schema:{line_number}"))
        elif line.startswith(PROVENANCE_ITEM):
            raw = line[len(PROVENANCE_ITEM):]
            item_raw.append(raw)
            items.append(parse_json(raw, f"item:{line_number}"))
        elif line.startswith(PROVENANCE_SUMMARY):
            summaries.append(parse_json(line[len(PROVENANCE_SUMMARY):], f"summary:{line_number}"))
    require(len(schemas) == 1 and len(summaries) == 1 and len(items) == 108, "provenance framing")
    schema, summary = schemas[0], summaries[0]
    require(schema["fit_permission"] is False and schema["runtime_permission"] is False, "schema permission")
    candidate_raw = [raw for raw, item in zip(item_raw, items) if item["domain"] == "candidate_schema_v4"]
    v1_raw = [raw for raw, item in zip(item_raw, items) if item["domain"] == "pairnet_v1_selected_source"]
    require(len(candidate_raw) == 36 and len(v1_raw) == 72, "provenance domains")
    digest = lambda rows: hashlib.sha256("\n".join(rows).encode()).hexdigest()
    require(digest(candidate_raw) == summary["candidate_digest_sha256"], "candidate provenance digest")
    require(digest(v1_raw) == summary["v1_digest_sha256"], "v1 provenance digest")
    require(digest(candidate_raw + v1_raw) == summary["combined_digest_sha256"], "combined provenance digest")
    require(summary["violations"] == [] and summary["fit_permission"] is False, "summary permission")
    return items, summary


def prefixed_objects(value: Capture, prefix: str, label: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(text(value, label).splitlines(), 1):
        if line.startswith(prefix):
            rows.append(parse_json(line[len(prefix):], f"{label}:{line_number}"))
    return rows


def v1_selected_rows(values: Sequence[Capture]) -> list[dict[str, Any]]:
    require(len(values) == 3, "three V1 selected-source logs required")
    rows: list[dict[str, Any]] = []
    for role, value in zip(("pro", "normal", "fast"), values):
        schemas = prefixed_objects(
            value, "DENSE_PARETO_SOURCE_COVERAGE_V1_SCHEMA ", f"v1_{role}"
        )
        selected = prefixed_objects(
            value, "DENSE_PARETO_SOURCE_COVERAGE_V1_SOURCE ", f"v1_{role}"
        )
        require(len(schemas) == 1 and len(selected) == 24, f"v1 {role}: framing")
        require(
            schemas[0].get("architecture_id") == "automove_dense_pareto_pairnet_v1"
            and schemas[0].get("alternative_root_labels_used") is False,
            f"v1 {role}: schema drift",
        )
        rows.extend(selected)
    keys = {
        (
            row["source_duel_id"], row["variant"], row["source_panel"],
            row["actual_color"], row["state_id"],
        )
        for row in rows
    }
    require(len(rows) == len(keys) == 72, "V1 selected-source uniqueness")
    return rows


def exact_five_inventory(
    fixture: Capture, source_log: Capture, pairnet: types.ModuleType
) -> dict[str, frozenset[str]]:
    fixture_text = text(fixture, "exact-five fixture")
    marker = "pub(super) const GUARDED_LOSS_BOARDS: [GuardedLossBoard; 5] = ["
    require(fixture_text.count(marker) == 1, "exact-five fixture marker")
    body = fixture_text.split(marker, 1)[1].split("\n];", 1)[0]
    blocks = re.findall(r"GuardedLossBoard\s*\{(.*?)\n\s*\},", body, flags=re.S)
    require(len(blocks) == 5, "exact-five fixture block count")

    def rust_int(block: str, field: str) -> int:
        matches = re.findall(rf"\b{re.escape(field)}:\s*(\d+)\s*,", block)
        require(len(matches) == 1, f"exact-five fixture {field}")
        return int(matches[0])

    def rust_string(block: str, field: str) -> str:
        matches = re.findall(rf'\b{re.escape(field)}:\s*"([^"\\]*)"\s*,', block)
        require(len(matches) == 1, f"exact-five fixture {field}")
        return matches[0]

    frozen = {
        (
            rust_int(block, "repeat"), rust_int(block, "opening_index"),
            rust_string(block, "variant"), rust_string(block, "board"),
            rust_string(block, "guarded_move"), rust_string(block, "shipping_move"),
        )
        for block in blocks
    }
    require(len(frozen) == 5, "exact-five fixture uniqueness")
    records = prefixed_objects(
        source_log, "PRO_POLICY_MATRIX_CORPUS_RECORD ", "exact-five source"
    )
    selected = [
        row for row in records
        if row.get("baseline") == "frontier_pro_v2_guarded"
        and row.get("candidate") == "shipping_pro_search_control"
        and row.get("duel") == "vs_shipping_pro"
        and row.get("baseline_result") == "loss"
    ]
    observed = {
        (
            row["repeat"], row["opening_index"], row["variant"], row["board"],
            row["baseline_move"], row["candidate_move"],
        )
        for row in selected
    }
    require(len(selected) == len(observed) == 5 and observed == frozen, "exact-five source/fixture mismatch")
    raw = frozenset(row["board"] for row in selected)
    openings = frozenset(row["opening"] for row in selected)
    canonical = frozenset(
        pairnet.V2.perspective_canonical_fen(
            row["board"], row["active_color"], 0 if len(row["board"].split()) == 10 else 1
        )
        for row in selected
    )
    require(len(raw) == 5 and len(openings) == 4 and len(canonical) == 5, "exact-five inventory counts")
    return {"raw": raw, "canonical": canonical, "openings": openings}


def retired_inventory(
    values: Sequence[Capture], pairnet: types.ModuleType
) -> dict[str, frozenset[str] | int]:
    rows = [
        row
        for index, value in enumerate(values)
        for row in prefixed_objects(
            value, "CROSS_BUDGET_ROOT_CORPUS_ROOT ", f"retired[{index}]"
        )
    ]
    require(len(rows) == 447, "retired root-row count")
    root_keys = {
        (row["state_id"]["digest"], row["audit"]["root_inputs"])
        for row in rows
    }
    state_sources: dict[str, tuple[str, str]] = {}
    for row in rows:
        digest = row["state_id"]["digest"]
        source = row["source_fen"]
        canonical_source = pairnet.V2.perspective_canonical_fen(
            source, row["metadata"]["source_side"],
            0 if len(source.split()) == 10 else 1,
        )
        prior = state_sources.setdefault(digest, (source, canonical_source))
        require(prior == (source, canonical_source), "retired state metadata drift")
    raw = frozenset(row["source_fen"] for row in rows)
    canonical = frozenset(value[1] for value in state_sources.values())
    require(
        len(root_keys) == 447 and len(state_sources) == len(raw) == 104
        and 0 < len(canonical) <= 104,
        "retired inventory counts",
    )
    return {"raw": raw, "canonical": canonical, "roots": len(root_keys)}


class DSU:
    def __init__(self, values: Iterable[str]):
        self.parent = {value: value for value in values}

    def find(self, value: str) -> str:
        parent = self.parent[value]
        if parent != value:
            self.parent[value] = self.find(parent)
        return self.parent[value]

    def union(self, left: str, right: str) -> None:
        a, b = self.find(left), self.find(right)
        if a != b:
            self.parent[max(a, b)] = min(a, b)


def component_resources(item: dict[str, Any]) -> tuple[Any, ...]:
    required = (
        "source_fen", "remaining_horizon", "opening_cluster_id", "side_sibling_id",
        "perspective_canonical_source_fen", "raw_opening_fen",
    )
    require(all(key in item for key in required), "component provenance fields")
    require(
        isinstance(item["source_fen"], str)
        and isinstance(item["remaining_horizon"], int)
        and not isinstance(item["remaining_horizon"], bool)
        and all(
            isinstance(item[key], str) and item[key]
            for key in (
                "opening_cluster_id", "side_sibling_id",
                "perspective_canonical_source_fen", "raw_opening_fen",
            )
        ),
        "component provenance types",
    )
    return (
        item["source_fen"],
        (item["source_fen"], item["remaining_horizon"]),
        item["opening_cluster_id"],
        item["side_sibling_id"],
        item["perspective_canonical_source_fen"],
        item["raw_opening_fen"],
    )


def state_components(
    items: dict[str, dict[str, Any]], resource_count: int = 6
) -> list[set[str]]:
    require(1 <= resource_count <= 6, "component resource count")
    dsu = DSU(items)
    domains: list[dict[Any, str]] = [dict() for _ in range(resource_count)]
    for state_id in sorted(items):
        for index, resource in enumerate(component_resources(items[state_id])[:resource_count]):
            prior = domains[index].setdefault(resource, state_id)
            dsu.union(prior, state_id)
    groups: dict[str, set[str]] = defaultdict(set)
    for state_id in items:
        groups[dsu.find(state_id)].add(state_id)
    return sorted(groups.values(), key=lambda group: (min(group), len(group)))


def safe_improving(root: dict[str, Any], budgets: Sequence[str]) -> bool:
    return (
        all(root["deltas"][budget] >= 0 for budget in budgets)
        and any(root["deltas"][budget] > 0 for budget in budgets)
        and all(not root["rows_by_budget"][budget]["save_violation"] for budget in budgets)
    )


def support(states: dict[str, list[dict[str, Any]]], selected: set[str], budgets: Sequence[str]) -> dict[str, Any]:
    roots = [root for state_id in selected for root in states[state_id]]
    safe_states = {
        root["state_id"] for root in roots
        if safe_improving(root, budgets)
    }
    return {
        "states": len(selected),
        "roots": len(roots),
        "positive": {budget: sum(root["deltas"][budget] > 0 for root in roots) for budget in budgets},
        "negative": {budget: sum(root["deltas"][budget] < 0 for root in roots) for budget in budgets},
        "safe_improving_states": len(safe_states),
    }


def report(precommit_path: Path, provenance_path: Path) -> dict[str, Any]:
    precommit_cap = pinned(precommit_path, PRECOMMIT_SIZE, PRECOMMIT_SHA, "precommit")
    precommit_doc = parse_json(text(precommit_cap, "precommit"), "precommit")
    require(precommit_doc["candidate_id"] == "frontier_pro_v6_full170_factorized_deepsets_guarded_pareto_v1", "candidate ID")
    deny_contract = precommit_doc["prospective_six_state_quarantine"]
    require(DENY == frozenset(deny_contract["state_ids"]), "local quarantine set drift")
    require(
        hashlib.sha256(("\n".join(sorted(DENY)) + "\n").encode()).hexdigest()
        == deny_contract["sorted_newline_sha256"],
        "local quarantine digest drift",
    )
    feature_contract = precommit_doc["exact_170_input_contract"]
    require(tuple(feature_contract["scalar_order"]) == SCALARS, "local scalar order drift")
    require(tuple(feature_contract["family_one_hot_order"]) == FAMILIES, "local family order drift")
    source_spec = precommit_doc["immutable_input_manifest"]
    source_cap = pinned(
        resolve(source_spec["source_contract_path"], "source manifest"),
        SOURCE_MANIFEST_SIZE, SOURCE_MANIFEST_SHA, "source manifest",
    )
    source = parse_json(text(source_cap, "source manifest"), "source manifest")
    provenance_cap = pinned(provenance_path, PROVENANCE_SIZE, PROVENANCE_SHA, "provenance log")

    v4_cap = pinned(SCRIPTS / "summarize-automove-guarded-root-corpus-v4.py", V4_SIZE, V4_SHA, "v4 parser")
    v2_cap = pinned(SCRIPTS / "summarize-automove-dense-pareto-joint-source-v2.py", V2_SIZE, V2_SHA, "v2 parser")
    v3_cap = pinned(SCRIPTS / "summarize-automove-dense-pareto-dual-reserve-v3.py", V3_SIZE, V3_SHA, "v3 parser")
    v4 = load_module(v4_cap, "_full170_v4")
    pairnet = load_module(v3_cap, "_full170_v3")
    require(
        tuple(v4.BUDGETS) == tuple(precommit_doc["distinct_architecture"]["heads"]),
        "budget/head order drift",
    )

    corpus_caps = [authenticate(item, f"corpus[{index}]") for index, item in enumerate(source["allowlisted_corpus_logs"])]
    rows = load_v4_rows(corpus_caps, v4)
    states = v4.attested_state_roots(rows)
    require((len(states), sum(map(len, states.values())), len(rows)) == (36, 208, 624), "discovery counts")

    items, provenance_summary = provenance(provenance_cap)
    candidate_items = {item["state_id"]: item for item in items if item["domain"] == "candidate_schema_v4"}
    require(len(candidate_items) == 36 and set(candidate_items) == set(states), "candidate provenance join")
    v1_items = [item for item in items if item["domain"] == "pairnet_v1_selected_source"]

    quarantine = source["viewed_resource_quarantine"]
    v1_report_cap = authenticate(quarantine["pairnet_v1_report"], "v1_report")
    exact_five_fixture_cap = authenticate(
        quarantine["exact_five_inventory"]["fixture"], "exact_five_fixture"
    )
    exact_five_source_cap = authenticate(
        quarantine["exact_five_inventory"]["source_log"], "exact_five_source"
    )
    retired_caps = [
        authenticate(contract, f"retired_inventory[{index}]")
        for index, contract in enumerate(quarantine["retired_104_state_447_root_inventory"])
    ]
    auxiliary_caps = [v1_report_cap, exact_five_fixture_cap, exact_five_source_cap, *retired_caps]
    # Reauthenticate V1 source bytes even though their data enter through the audited provenance log.
    v1_source_caps = []
    for index, contract in enumerate(quarantine["pairnet_v1_selected_source_logs"]):
        v1_source_caps.append(authenticate(contract, f"v1_source[{index}]"))
    v2_logs = []
    for role, contract in zip(("pro", "normal", "fast"), quarantine["pairnet_v2_candidate_logs"]):
        value = authenticate(contract, f"v2_{role}")
        v2_logs.append(pairnet.V2.parse_events(pairnet_capture(pairnet, value), role))
    v2_inventory = pairnet.inventory_from_v2_logs(v2_logs)
    v3_logs = []
    for role, contract in zip(("pro", "normal", "fast"), quarantine["pairnet_v3_candidate_logs"]):
        value = authenticate(contract, f"v3_{role}")
        v3_logs.append(pairnet.parse_events(pairnet_capture(pairnet, value), role))
    v3_inventory = pairnet.ResourceInventory.from_bundles(
        candidate.bundle for parsed in v3_logs for candidate in parsed.candidates
    )

    def bundle(item: dict[str, Any]) -> Any:
        cluster = (
            item["generation_seed_tag"], item["repeat_index"],
            item["opening_index"], item["variant"],
        )
        return pairnet.ResourceBundle(
            item["source_fen"], (item["source_fen"], item["remaining_horizon"]),
            cluster, item["perspective_canonical_source_fen"], item["raw_opening_fen"],
        )

    v1_inventory = pairnet.ResourceInventory.from_bundles(bundle(item) for item in v1_items)
    v1_report, v1_report_inventory = pairnet.read_frozen_v1_report(
        pairnet_capture(pairnet, v1_report_cap)
    )
    v1_rows = v1_selected_rows(v1_source_caps)
    require(
        {canonical_json(row) for row in v1_rows}
        == {canonical_json(row) for row in v1_report["source_manifest"]},
        "V1 selected logs/report mismatch",
    )

    def v1_row_projection(row: dict[str, Any]) -> tuple[Any, ...]:
        return (
            row["state_id"], row["source_fen"], row["remaining_horizon"],
            pairnet._v1_generation_seed_tag(row), row["source_duel_id"],
            row["repeat_index"], row["opening_index"], row["variant"],
            row["actual_color"], row["opening_cluster_id"], row["side_sibling_id"],
            row["source_panel"],
        )

    def v1_item_projection(item: dict[str, Any]) -> tuple[Any, ...]:
        return (
            item["state_id"], item["source_fen"], item["remaining_horizon"],
            item["generation_seed_tag"], item["source_duel_id"],
            item["repeat_index"], item["opening_index"], item["variant"],
            item["color"], item["opening_cluster_id"], item["side_sibling_id"],
            item["source_panel"],
        )

    require(
        {v1_row_projection(row) for row in v1_rows}
        == {v1_item_projection(item) for item in v1_items},
        "V1 selected logs/provenance mismatch",
    )
    require(
        v1_report_inventory.source_fens == v1_inventory.source_fens
        and v1_report_inventory.states == v1_inventory.states
        and v1_report_inventory.clusters == v1_inventory.clusters
        and v1_report_inventory.canonical_source_fens == v1_inventory.canonical_source_fens,
        "V1 report/provenance four-domain inventory mismatch",
    )
    viewed = v1_inventory.union(v2_inventory).union(v3_inventory)
    candidate_bundles = {state_id: bundle(item) for state_id, item in candidate_items.items()}
    hit_details = {
        state_id: list(pairnet.bundle_hits(value, viewed))
        for state_id, value in candidate_bundles.items()
        if pairnet.bundle_hits(value, viewed)
    }
    observed_hits = frozenset(hit_details)

    blockers: list[str] = []
    checks: dict[str, Any] = {}

    def check(name: str, passed: bool, detail: Any) -> None:
        checks[name] = {"pass": bool(passed), "detail": detail}
        if not passed:
            blockers.append(name)

    check(
        "exact_six_state_five_domain_quarantine",
        observed_hits == DENY,
        {"expected": sorted(DENY), "observed": sorted(observed_hits), "hits": hit_details},
    )
    admitted = {state_id: roots for state_id, roots in states.items() if state_id not in DENY}
    check(
        "exact_admitted_counts",
        (len(admitted), sum(map(len, admitted.values())), sum(map(len, admitted.values())) * 3)
        == (30, 172, 516),
        {"states": len(admitted), "roots": sum(map(len, admitted.values())), "rows": sum(map(len, admitted.values())) * 3},
    )

    exact_five = exact_five_inventory(
        exact_five_fixture_cap, exact_five_source_cap, pairnet
    )
    retired = retired_inventory(retired_caps, pairnet)
    admitted_raw = {
        candidate_items[state_id]["source_fen"] for state_id in admitted
    } | {
        candidate_items[state_id]["raw_opening_fen"] for state_id in admitted
    }
    admitted_canonical = {
        candidate_items[state_id]["perspective_canonical_source_fen"]
        for state_id in admitted
    }
    historical_raw = set(exact_five["raw"]) | set(exact_five["openings"]) | set(retired["raw"])
    historical_canonical = set(exact_five["canonical"]) | set(retired["canonical"])
    raw_hits = sorted(admitted_raw & historical_raw)
    canonical_hits = sorted(admitted_canonical & historical_canonical)
    check(
        "zero_exact_five_and_retired_raw_canonical_overlap",
        not raw_hits and not canonical_hits,
        {
            "exact_five_states": len(exact_five["raw"]),
            "exact_five_openings": len(exact_five["openings"]),
            "retired_states": len(retired["raw"]),
            "retired_roots": retired["roots"],
            "raw_hits": raw_hits,
            "canonical_hits": canonical_hits,
        },
    )

    names = spatial_names()
    check(
        "exact_full170_feature_order",
        len(SCALARS) == 24 and len(FAMILIES) == 8 and len(names) == 138
        and hashlib.sha256(("\n".join(names) + "\n").encode()).hexdigest()
        == precommit_doc["exact_170_input_contract"]["spatial_name_newline_SHA256"],
        {"scalar_count": len(SCALARS), "family_count": len(FAMILIES), "spatial_count": len(names)},
    )
    vector_labels: dict[tuple[int, ...], set[tuple[int, int, int]]] = defaultdict(set)
    all_vectors: list[tuple[int, ...]] = []
    state_vectors: dict[str, list[tuple[int, ...]]] = {}
    budgets = tuple(v4.BUDGETS)
    for state_id, roots in admitted.items():
        vectors = []
        for root in roots:
            vector = feature_vector(root)
            vectors.append(vector)
            all_vectors.append(vector)
            vector_labels[vector].add(tuple(root["deltas"][budget] for budget in budgets))
        state_vectors[state_id] = vectors
    global_varying = sum(len({vector[index] for vector in all_vectors}) > 1 for index in range(170))
    within_varying = sum(
        any(len({vector[index] for vector in vectors}) > 1 for vectors in state_vectors.values())
        for index in range(170)
    )
    conflicts = sum(len(labels) > 1 for labels in vector_labels.values())
    check(
        "full170_uniqueness_variance_and_labels",
        len(vector_labels) == 172 and conflicts == 0 and global_varying == 55 and within_varying == 37,
        {"unique_vectors": len(vector_labels), "conflicts": conflicts, "global_varying": global_varying, "within_state_varying": within_varying},
    )

    admitted_items = {state_id: candidate_items[state_id] for state_id in admitted}
    pre_opening_components = state_components(admitted_items, resource_count=5)
    check(
        "provisional_component_count_before_raw_opening",
        len(pre_opening_components) == 19,
        {"components": len(pre_opening_components)},
    )
    components = state_components(admitted_items)
    component_sizes = sorted(len(group) for group in components)
    component_root_sizes = sorted(sum(len(admitted[state_id]) for state_id in group) for group in components)
    all_ids = set(admitted)
    loco = [support(admitted, all_ids - group, budgets) for group in components]
    component_gate = (
        len(components) >= 12 and max(component_sizes) <= 10 and max(component_root_sizes) <= 60
        and all(item["states"] >= 18 and item["roots"] >= 100 for item in loco)
        and all(min(item["positive"].values()) >= 8 and min(item["negative"].values()) >= 8 for item in loco)
        and all(item["safe_improving_states"] >= 10 for item in loco)
    )
    check(
        "frozen_component_LOCO_support",
        component_gate,
        {"component_count": len(components), "state_sizes": component_sizes, "root_sizes": component_root_sizes, "minimum_training": {"states": min(item["states"] for item in loco), "roots": min(item["roots"] for item in loco), "positive": {budget: min(item["positive"][budget] for item in loco) for budget in budgets}, "negative": {budget: min(item["negative"][budget] for item in loco) for budget in budgets}, "safe_improving_states": min(item["safe_improving_states"] for item in loco)}},
    )

    family_of = {
        state_id: roots[0]["rows_by_budget"][budgets[0]]["seed_family_id"]
        for state_id, roots in admitted.items()
    }
    families = sorted(set(family_of.values()))
    lofo = [
        support(admitted, {state_id for state_id in admitted if family_of[state_id] != family}, budgets)
        for family in families
    ]
    lofo_gate = len(families) == 3 and all(
        item["states"] >= 18 and item["roots"] >= 106
        and min(item["positive"].values()) >= 9 and min(item["negative"].values()) >= 13
        for item in lofo
    )
    check("LOFO_support", lofo_gate, {"families": families, "folds": lofo})

    safe = [
        root for roots in admitted.values() for root in roots
        if safe_improving(root, budgets)
    ]
    label_summary = {
        "safe_roots": len(safe), "safe_states": len({root["state_id"] for root in safe}),
        "safe_clusters": len({root["opening_cluster_id"] for root in safe}),
        "safe_positive": {budget: sum(root["deltas"][budget] > 0 for root in safe) for budget in budgets},
    }
    check(
        "frozen_label_support",
        label_summary == {"safe_roots": 38, "safe_states": 18, "safe_clusters": 15, "safe_positive": {"pro": 21, "normal": 10, "fast": 17}},
        label_summary,
    )

    admitted_roots = [root for roots in admitted.values() for root in roots]
    discovery_summary = {
        "opening_clusters": len({root["opening_cluster_id"] for root in admitted_roots}),
        "seed_families": sorted(
            {root["rows_by_budget"][budgets[0]]["seed_family_id"] for root in admitted_roots}
        ),
        "colors": sorted({root["color"] for root in admitted_roots}),
        "source_duels": sorted({root["source_duel_id"] for root in admitted_roots}),
        "source_panels": sorted({root["source_panel"] for root in admitted_roots}),
        "variants": sorted({root["variant"] for root in admitted_roots}),
        "any_regression_or_save_violation_roots": sum(
            any(root["deltas"][budget] < 0 for budget in budgets)
            or any(root["rows_by_budget"][budget]["save_violation"] for budget in budgets)
            for root in admitted_roots
        ),
        "all_zero_roots": sum(
            all(root["deltas"][budget] == 0 for budget in budgets)
            for root in admitted_roots
        ),
        "positive": {
            budget: sum(root["deltas"][budget] > 0 for root in admitted_roots)
            for budget in budgets
        },
        "negative": {
            budget: sum(root["deltas"][budget] < 0 for root in admitted_roots)
            for budget in budgets
        },
    }
    check(
        "frozen_discovery_metadata_and_raw_label_support",
        discovery_summary["opening_clusters"] == 19
        and len(discovery_summary["seed_families"]) == 3
        and discovery_summary["colors"] == ["black", "white"]
        and discovery_summary["source_duels"]
        == ["vs_shipping_fast", "vs_shipping_normal", "vs_shipping_pro"]
        and discovery_summary["source_panels"] == ["guarded_loss", "guarded_save"]
        and len(discovery_summary["variants"]) == 7
        and discovery_summary["any_regression_or_save_violation_roots"] == 61
        and discovery_summary["all_zero_roots"] == 73
        and discovery_summary["positive"] == {"pro": 32, "normal": 21, "fast": 28}
        and discovery_summary["negative"] == {"pro": 22, "normal": 30, "fast": 31},
        discovery_summary,
    )

    return {
        "schema_version": 1,
        "audit": "full170_factorized_deepsets_v1_read_only_prefit",
        "candidate_id": precommit_doc["candidate_id"],
        "precommit": {"path": str(precommit_path), "size_bytes": precommit_cap.size, "sha256": precommit_cap.sha256},
        "provenance": {"path": str(provenance_path), "size_bytes": provenance_cap.size, "sha256": provenance_cap.sha256, "summary": provenance_summary},
        "authenticated_auxiliary_input_count": len(auxiliary_caps),
        "viewed_inventory_counts": viewed.counts(),
        "checks": checks,
        "blockers": blockers,
        "decision": "GO_authorize_single_use_fit_freeze_only" if not blockers else "NO_GO_kill_without_retry",
        "fit_authorized": False,
        "fit_freeze_authorized": not blockers,
        "model_emitted": False,
        "runtime_modified": False,
    }


def expect_failure(action: Any, phrase: str) -> None:
    try:
        action()
    except (AuditError, ValueError) as error:
        require(phrase in str(error), f"unexpected failure {error}")
    else:
        raise AuditError(f"expected failure containing {phrase!r}")


def self_test() -> None:
    expect_failure(lambda: parse_json('{"x":1,"x":2}', "dup"), "duplicate JSON key")
    require(len(spatial_names()) == 138, "spatial names fixture")
    def record(prefix: str) -> dict[str, Any]:
        return {
            "source_fen": f"source-{prefix}", "remaining_horizon": 1,
            "opening_cluster_id": f"cluster-{prefix}",
            "side_sibling_id": f"sibling-{prefix}",
            "perspective_canonical_source_fen": f"canonical-{prefix}",
            "raw_opening_fen": f"opening-{prefix}",
        }

    for domain_index, domain_name in enumerate(
        ("source", "state", "cluster", "sibling", "canonical", "opening")
    ):
        left, right, isolated = record("left"), record("right"), record("isolated")
        if domain_index == 0:
            right["source_fen"] = left["source_fen"]
            right["remaining_horizon"] = 2
        elif domain_index == 1:
            right["source_fen"] = left["source_fen"]
            right["remaining_horizon"] = left["remaining_horizon"]
            left["source_fen"] = "state-only-left"
            right["source_fen"] = "state-only-left"
            left["remaining_horizon"] = 1
            right["remaining_horizon"] = 1
        elif domain_index == 2:
            right["opening_cluster_id"] = left["opening_cluster_id"]
        elif domain_index == 3:
            right["side_sibling_id"] = left["side_sibling_id"]
        elif domain_index == 4:
            right["perspective_canonical_source_fen"] = left["perspective_canonical_source_fen"]
        else:
            right["raw_opening_fen"] = left["raw_opening_fen"]
        groups = state_components({"a": left, "b": right, "c": isolated})
        require(sorted(map(len, groups)) == [1, 2], f"{domain_name} component merge")
    require(sha_json(["a", "b"]) == "0473ef2dc0d324ab659d3580c1134e9d812035905c4781fdd6d529b0c6860e13", "canonical digest")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--self-test", action="store_true")
    group.add_argument("--preflight", type=Path)
    parser.add_argument("--provenance-log", type=Path)
    args = parser.parse_args()
    try:
        if args.self_test:
            require(args.provenance_log is None, "self-test takes no provenance")
            self_test()
            print(canonical_json({"schema_version": 1, "self_test": "pass", "fit_code_present": False, "write_path_present": False}))
            return 0
        require(args.preflight is not None and args.provenance_log is not None, "preflight and provenance log required")
        precommit_path = args.preflight if args.preflight.is_absolute() else (Path.cwd() / args.preflight).resolve()
        provenance_path = args.provenance_log if args.provenance_log.is_absolute() else (Path.cwd() / args.provenance_log).resolve()
        result = report(precommit_path, provenance_path)
        print(canonical_json(result))
        return 0 if result["fit_freeze_authorized"] else 1
    except (AuditError, OSError, KeyError, TypeError, ValueError, IndexError) as error:
        print(f"full170 prefit error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
