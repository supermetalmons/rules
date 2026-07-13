#!/usr/bin/env python3
"""Validate and jointly match the frozen dense-Pareto PairNet v2 pilot.

The three input logs are source-only candidate universes.  This program is the
only component allowed to select the 72 pilot sources.  It authenticates each
universe, solves one deterministic paired-slot CSP, and stress-tests the
solution by deleting every selected resource bundle in turn.  Passing this
gate grants only permission to freeze a fresh-corpus precommit; pilot rows are
never model data.
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
from typing import Any, Iterable, Sequence


SCHEMA_VERSION = 2
ARCHITECTURE_ID = "automove_dense_pareto_pairnet_v2_joint_source_matching"
SEED_FAMILY_ID = (
    "automove_dense_pareto_pairnet_v2_joint_source_matching_pilot_20260712_fresh01"
)
PROBE_DATA_ROLE = "coverage_only_never_model_data"
REPORT_ID = "automove_dense_pareto_joint_source_matching_v2"

FIXED_REPEATS = 16
GAMES_PER_REPEAT = 12
MAX_PLIES = 96
EXPECTED_CELLS_PER_DUEL = 24
EXPECTED_SELECTED = 72
PRIMARY_PAIR_TRIAL_CAP = 10_000_000
RESILIENCE_PAIR_TRIAL_CAP = 2_000_000
MAX_INPUT_BYTES = 64 * 1024 * 1024

V1_VIEWED_REPORT_SHA256 = "07de37c13a4c203e6a6b3e16e8c404e3c66a60495969f6f5ba62f0d45ef9c37e"
V1_VIEWED_REPORT_ROWS = 72
V1_VIEWED_UNIQUE_RAW_SOURCE_FENS = 70
V1_VIEWED_UNIQUE_CANONICAL_SOURCE_FENS = 70
V1_VIEWED_CONTENT_HASH_COUNT = 106
V1_VIEWED_CONTENT_SET_DIGEST_SHA256 = (
    "fa04b66cc0dc3a263339ff96e356a9b92cc4ff32cd49efdb3dd7898e20b60618"
)
V1_VIEWED_CONTENT_SHA256_BLACKLIST = (
    "0249c3df35799d32eec54b1c31d963e207ca11029ae67e43942c65608a68740c",
    "02f6885c5a0393d3c92f7d52ea5491ce3b7b281437794daabd1ac7d2aac41cfb",
    "03316c127d94593a2fa8a81d5e61cd71e2a79d2c8cd36ff7231fae40fa5ac9a7",
    "04aef24c3abadcf8a8c8b24def37245d81bbe0f43dd088fcf0c0c21673ac9a74",
    "0c799a0448fb04cbba5462e56f01826e5ed1608a17f8cf550c36583a7dd3b86a",
    "0f913a13dab9a154699d6169af82903de934b063d34a839c10c8307f6a3847fe",
    "10ad36cbffdee62a5d75125362f5bf0b85676c07c25a6d0686a99b2660368a34",
    "13ba93c766dffff561179ee963e94474fa7e0ca3d0a040fb52f95e6631cba2a8",
    "14285820fbb610600013bc8b6602ced4b6b2792334c03c339b217e21b2d63469",
    "1508201de223c884535a0c70c9c0fcad2e6f3d782e65ef76ef87f1b15439f755",
    "16855192f92481d8236947b4ba7ca1d6c113f397441b8a5ac87b11bb077a3c35",
    "19a1d2c3b656cf8605b8f78ef339991465ce40b994a2029795d0fc1fd206d56b",
    "1b3cfad3a4ee196ebf7790012a689163890f39ae4158bccc30b04b52bb4d3e0b",
    "1bc9d53d1dcf7fa927fe67b073c0ead28e146c3e34790ae998cbf8be4e5bfc1b",
    "1f8188cfe5bf8480745360d0155690ff3a2c64eb97d35d7d57b563dc6040c5bf",
    "2043b10415084d56670528d1d50d299109ce05c6ddd553959f654cc41b2f9b6a",
    "21c8e509bc17e6f9be4efcd2b9ad5c5cc9ed307826e80500a9c4fb4ba8946152",
    "2521b43ebb822bb4d16a5d0e84a8f61096872ee3e3bde0b34186eb4e67e69e45",
    "25873928100e021b9b5f9649db2f00aa2c5d3d2dded3089aa6664a160a5bd0b4",
    "25f1cdf38d8e55639a25c0dda73ab56aff66fcf2185d2db6aa53a5c9d53aa729",
    "262737a8303263d5f7ea2cb3ccceed12d5836535644a3fa1a72d317ed7d99060",
    "26442b1eb67adb3741a06b287d560287a03753b9c06597586892cfca388b3d5b",
    "31d95a2df8039e50b2085e42239e5348d899380462538f4c81ef804e6527caec",
    "36012fb6384a568d2fbfb8174e0a2d8c3ca37f78ac5ba3e3139aeb334c886033",
    "3626c13a861961528db9dff71a2f088dc133332c9e7bf7d8adf478d1c7def338",
    "36e3526ae8e0b37e5722ca634fa57218b76f1d29b87ee964e3de5bcada4e957a",
    "425c10f6462badc49ad4dab8893639fc6ddf4a38b7dfb08411a28455ffdb7b45",
    "440b5abe61e4a4a41f24863fbf352fb33f136a0b848dad2799b18932e6f9b757",
    "4580e3e2edff2b68344c368c335349f9666a258baba8941b231c7ee56c56c427",
    "46014b3eda816436680dba9a1718087a653aa8939e7bd38c0193e54f2449e535",
    "47240d1c9abfef27eab7e4a524d5c517f18cf82fbbae2773e30b1be08e3af370",
    "4d043ca44afca1a0ad03fa05a9720f88be51cb70d89cefe0724bc54eafce9d23",
    "4e6834ee22f3cf8ce298ef3c8b99a8dde8d82e6e0f0922341b9274441cbf30f1",
    "50dd0ade5b48342c64e9914fc49fd887894f9a3c216b04548f2eea770999d638",
    "51be8874a04fc9afe2a6a2819f214310a0f22a7e18ccd1d0c03e1eadb3f2b94f",
    "531a892040fec3d89719528147ad7514077789b543dd99e56839682b12ddd038",
    "533eab9fe66e1be4b5936575e5937590721718f7379522ddbf736df95c51adaf",
    "53bc1f11fa1bdb38bd5f3e00c80a1899158e707e2f9bc6cda0071baec53234e7",
    "58be9020107fd9629ff6c9a535be3ff52f2dc9054c7a6403e0adc3bd2da40d6c",
    "5a9ce730bd2bd338900a32d2dd0c7a539b66e4559f017561352c1579cc58601d",
    "5af678a7125d983aede37f284c81df9c23929a8b60da48ca67be9df54b837699",
    "5be973d592550562f0ecc90c60e13713f629b602a29bc20933390c5fcbcdff02",
    "5c3715294e4f0aab297381f7507288ae918d938a3613d4e5aa91e7fa452d2d36",
    "5faa9f1a295e1d7154eb24ac734c099aece3edd96c444eae021b6901eca33ace",
    "649a89362d7717210a076193726ef4b1e36850dcf3eab14bac5d7c734aec56c0",
    "688953fa81cbb0c94bea949d40af930fe7dec628578471b4264e1ddd547fd61a",
    "68a365cd3c8701e2a431eb380be3acc9e612e1d0573006d6b8598606ac1e35e7",
    "6d28994ceffe64e15b905cffb92b86195416373fb0699bd329ce41f167948e18",
    "6f51751eb70f8719491fed85da466c043c11cb8572e1fae8832164a651c2ca9d",
    "7868cd14639bba521fc3b869ef58d96fd65f9288f6bc297d626e65ea0787bc9c",
    "7c7695fa889de3c54a408e3521615b28f8c25e63e60cba29e86e73348ed326fc",
    "7c9599ce24f21974ea88d0b63c61df2faddd6c915c9eae6abe8f0b4565f55458",
    "7cfa55afccba23a7b75edfafb1f716a76a1a9b91170ba5931f467cbff77e970c",
    "7e9c6a47d5b145f3addf2cadf78a32fd9c2f11434dc6eb5bb451c89d750a4c3a",
    "85d2aeb61810df7197c5cb7b8e443ba310e975cc015877afda9b1cbefc4ab392",
    "87e3441f9bdae00a261beb59394b42dbf4147a9141250deb2e7843f8f535bd02",
    "8897eb19db52888f985eb094e16bf215695aed74198dd44724f303eada4afdcb",
    "89932175f6413ae372eb21ed08a00fb62d9864d87a47bd90289fbd4ccd563ce8",
    "8b4e7e5674c8abb6ed237ce2969c39f4508311c8a3242fdd41d5d9f15b9b88b8",
    "8c2b6a3f1532cf5c7991436883f600318c5e38b9676441a72663d9bab2ffa8dc",
    "8c9188bcfff11d0ed2349e464525f464586b0271f5121e49e57f87e040a958b8",
    "8dc52b45592a4fc7cdcc7b7b2eaaed90477f50c46ba59c3794c041174d7c3380",
    "8de73fb958237366886a61de3531c221e4af2c2162205b15e64a9212750ca1b9",
    "8f3a9e0a34dab0e27fc077ff0a21bd1a8f15de8641fcdfc4c4b2e6bbc06768da",
    "93cf923a5620e414d49ff6629b2bd72330fa3f3a0684a3e8d9e8695320112d51",
    "950b5fc3e147b6eb58ee7c83384f9a21c4e10fe251c1d651bb9336ca4baf20bf",
    "98854bcaea318b1ae3730aa99aed2c03e397f747485307a3077624f5728ead58",
    "98a7c3cdfa02ceed1ae7b12055b905d0d3bfaf0cdfdfa8287d1a8f69d292e279",
    "994991501e19f1532bfe8a356c7bcd89cfb3109997a07b75afeebc763cf951b8",
    "9ce228197bfd17151caa0f98473632b169a06a36f6b7175200eb2aa38fb3ff9f",
    "9de13f2a16be828c2fa89e0d2a2e2ec6a8b4463a2293bfc9aaf9211716a42092",
    "aaccc530764c64e92b34f42d21b4ee47d61f3f019e3cf4736ea614d25428da27",
    "ab7c79ea59112f6d0d08e10ad65ca19b22794b31cae25e751058df02a5fbdfcf",
    "ac8848e6e8a6e8f1828707d83006ad1fe13c0cadedf6533b94c36fb419a0d971",
    "af615b17670f6213766d48d8c148598e3a289c2f2e247758eaabd47020a47b46",
    "b049c2e37f51cb555c6a8df38206c409888411be7d4acbd5b1c84cf9adf1f6dc",
    "b0edf4e822f03330e36be6c86079b09e37bad3eebcc8b79de6cf573fdebfd861",
    "b64747233540d54b123fd2f6132d30141b0202cca43d077ae4e99574ea0f17ff",
    "b9a6dc7deecf68beb0c8ff22d44c30a99daaef6d2794e52b8e8d2369092f8e35",
    "ba187be3290ce79d5dbdb4988c937b58e6d29ad04e7818e3c7e929b7801c3de8",
    "c05c0e7b29a51ba29c1c7a808f846c79917f668d3a4c110a19991e87bf37b892",
    "c169391355155d67c7568e32df6cdb7cfa695983604506813d2a30c194415337",
    "c1c31c90f5eb4f59911b8036379f7913dce148fb5ef09ebc0e9b0ee47bdbe363",
    "c3c19ea669f56b17bf73aa20a96e6f9656868554e6c599b4a54d07992bfd30c0",
    "c453286f98b5a439f9e01da8b3e4f598616407dea3768fff18c8ec5f85330e77",
    "c4db4f89f6b7208af83127827c8b01fa2fb8e4f5bfc85943ed7420de000f7469",
    "cb62aff00b6f888973797dcf3ca74d4ef91d9678116d5ee753ea59d1a5486dca",
    "cd938345db6276d91c99c4e8939132d681de9ef8b7cab6b19cd757ad3a924881",
    "ce02db55871b7cbd93920b0da981ff4b28de2c481aa04a4efc60eb5b2241182f",
    "d27332b2b5b2c6be199fb5942dc9769e65fb33641f651d74bd246800da60810d",
    "d43ddaba0a0f36c8de66ce8e3393eb76da18b83002b8b0bf2f1a4dc4be8650a1",
    "d5e4aa27469f752d3aa726c05b1d7e0bee3b7b241a0bd1c5e65262782a68b261",
    "d68c92059076373a6b3eb191f3efc177c33d56a1da0cc952feee11b1abf21285",
    "da911e5a0790c563abfe2cea1684a442b776400f6e5848303808ee67a7a5e76a",
    "dc3185c6f1eae858bf1f87f850dae87c40d5c926fc4997678ce1a88350feb044",
    "ddfb7e655e064b8c336ddf3a97bab0e59d528dd6a125b6ddefe952c1266e0c72",
    "de2bf9dd586881a10ad147e3ea5214b201b3850cc312550a653819245b2258e0",
    "e00453f30556b23301801c07c4b968b72c920a63c20b0ded3d6bd239d1977991",
    "e01f727c3efd1350fd6f0449ff1934f58099d3fceed4e578b5d168890266fa6e",
    "e052da2a6ea995d74a45407655be7a775f064e12b131d5af576ea1f737e67c61",
    "e0ef0c71b5d7fdf006858ba1e01f697f7c0677c29566184af8d3e9a90fea5aec",
    "e301297f329b736937a6263a3bef66e23918725a880946b9e5e0d881f6cd0fec",
    "efb219708622d509b61c7c1a57cac6e1b6fe379cb2db35a84e6da2ed764c0da6",
    "f2c3c06d6c9a0358fdea5847157a7fbc7c0619f414e13a7c8581595555420dd5",
    "fa6d22b5dfadff6709750f8a3dbc45499e9a800ab95d763204c5914d1c42b321",
    "fe2b26402b6df1e5423f0c393247ca2528f254c9e13f4232cbc3249ef7e63dd2",
)
V1_VIEWED_CONTENT_SHA256_SET = frozenset(V1_VIEWED_CONTENT_SHA256_BLACKLIST)

NAMESPACE = "DENSE_PARETO_JOINT_SOURCE_"
SCHEMA_PREFIX = f"{NAMESPACE}SCHEMA_V2 "
CANDIDATE_PREFIX = f"{NAMESPACE}CANDIDATE_V2 "
SUMMARY_PREFIX = f"{NAMESPACE}SUMMARY_V2 "

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
        "seed_suffix": "",
    },
    "normal": {
        "duel": "vs_shipping_normal",
        "duel_index": 1,
        "seed_suffix": "_vs_normal",
    },
    "fast": {
        "duel": "vs_shipping_fast",
        "duel_index": 2,
        "seed_suffix": "_vs_fast",
    },
}

CANDIDATE_FIELDS = (
    "schema_version",
    "architecture_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "probe_data_role",
    "seed_family_id",
    "source_duel_id",
    "duel_index",
    "variant",
    "variant_index",
    "source_panel",
    "source_result_audit_only",
    "panel_index",
    "required_color",
    "actual_color",
    "source_fen",
    "canonical_source_fen",
    "opening_fen",
    "guarded_move",
    "guarded_move_legal",
    "candidate_branch",
    "repeat_index",
    "opening_index",
    "generation_seed_tag",
    "opening_cluster_id",
    "side_sibling_id",
    "source_ply",
    "max_plies",
    "remaining_horizon",
    "source_candidate_turn_count",
    "eligible_frontier_execute_count",
    "cell_candidate_count",
    "resource_bucket_multiplicity",
    "source_identity_fnv64",
    "candidate_index",
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
    "repeat_offset",
    "repeats",
    "games_per_repeat",
    "max_plies",
    "expected_cells",
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

# Filled in once the Rust emitter's schema record is frozen.  Keeping this
# centralized makes any final field-name reconciliation auditable.
SCHEMA_FIELDS = (
    "schema_version",
    "architecture_id",
    "candidate_independent",
    "alternative_root_labels_used",
    "probe_data_role",
    "candidate_record_prefix",
    "summary_record_prefix",
    "selection_location",
    "collapse_key",
    "selection_priority",
    "fixed_variants",
    "candidate_fields",
    "summary_fields",
    "resource_keys",
    "primary_pair_trial_cap",
    "resilience_pair_trial_cap",
    "forbidden_inputs",
)

RESOURCE_KEYS = (
    "raw_source_fen",
    "raw_source_fen_plus_horizon",
    "raw_cluster_provenance",
    "perspective_canonical_source_fen",
    "raw_opening_fen",
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
HEX64 = re.compile(r"^[0-9a-f]{64}$")
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


class JointSourceError(ValueError):
    """A frozen input, matching, provenance, or filesystem contract failed."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise JointSourceError(message)


def is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def strict_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key {key!r}")
        result[key] = value
    return result


def reject_json_constant(value: str) -> None:
    raise JointSourceError(f"non-finite JSON constant {value!r} is forbidden")


def parse_json(text: str, label: str) -> dict[str, Any]:
    try:
        value = json.loads(
            text,
            object_pairs_hook=strict_object,
            parse_constant=reject_json_constant,
        )
    except json.JSONDecodeError as error:
        raise JointSourceError(f"{label}: malformed JSON: {error}") from error
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


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def validate_v1_viewed_content_blacklist() -> None:
    values = V1_VIEWED_CONTENT_SHA256_BLACKLIST
    require(
        HEX64.fullmatch(V1_VIEWED_REPORT_SHA256) is not None
        and HEX64.fullmatch(V1_VIEWED_CONTENT_SET_DIGEST_SHA256) is not None,
        "v1 viewed-content provenance digest drift",
    )
    require(
        (
            V1_VIEWED_REPORT_ROWS,
            V1_VIEWED_UNIQUE_RAW_SOURCE_FENS,
            V1_VIEWED_UNIQUE_CANONICAL_SOURCE_FENS,
            V1_VIEWED_CONTENT_HASH_COUNT,
        )
        == (72, 70, 70, 106),
        "v1 viewed-content frozen count drift",
    )
    require(
        len(values) == V1_VIEWED_CONTENT_HASH_COUNT,
        "v1 viewed-content blacklist count drift",
    )
    require(
        all(HEX64.fullmatch(value) is not None for value in values),
        "v1 viewed-content blacklist contains a non-SHA256 token",
    )
    require(
        values == tuple(sorted(set(values))),
        "v1 viewed-content blacklist must be sorted and duplicate-free",
    )
    digest = hashlib.sha256(("\n".join(values) + "\n").encode("ascii")).hexdigest()
    require(
        digest == V1_VIEWED_CONTENT_SET_DIGEST_SHA256,
        "v1 viewed-content blacklist set digest drift",
    )
    require(
        V1_VIEWED_CONTENT_SHA256_SET == frozenset(values),
        "v1 viewed-content immutable set drift",
    )


def candidate_v1_viewed_content_hits(candidate: Candidate) -> tuple[str, ...]:
    fields = (
        ("source_fen", candidate.bundle.source_fen),
        ("canonical_source_fen", candidate.bundle.canonical_source_fen),
        ("opening_fen", candidate.bundle.opening_fen),
    )
    return tuple(
        field
        for field, content in fields
        if sha256_text(content) in V1_VIEWED_CONTENT_SHA256_SET
    )


def require_keys(value: dict[str, Any], fields: Sequence[str], label: str) -> None:
    actual = set(value)
    expected = set(fields)
    extra = sorted(actual - expected)
    missing = sorted(expected - actual)
    require(
        not extra and not missing,
        f"{label}: field drift; extra={extra}, missing={missing}",
    )


def require_text(value: Any, label: str, *, delimiter_safe: bool = False) -> str:
    require(isinstance(value, str) and value, f"{label}: expected nonempty string")
    require(value == value.strip(), f"{label}: surrounding whitespace is forbidden")
    require(
        not any(ord(character) < 32 for character in value),
        f"{label}: control character",
    )
    if delimiter_safe:
        require("|" not in value, f"{label}: digest delimiter is forbidden")
    return value


def require_hex16(value: Any, label: str) -> str:
    require(
        isinstance(value, str) and HEX16.fullmatch(value) is not None,
        f"{label}: lowercase hex16 required",
    )
    return value


def require_common(value: dict[str, Any], label: str) -> None:
    require(
        is_int(value["schema_version"])
        and value["schema_version"] == SCHEMA_VERSION,
        f"{label}: schema version drift",
    )
    require(value["architecture_id"] == ARCHITECTURE_ID, f"{label}: architecture drift")
    require(value["candidate_independent"] is True, f"{label}: candidate independence required")
    require(
        value["alternative_root_labels_used"] is False,
        f"{label}: alternative-root labels forbidden",
    )


@dataclass(frozen=True)
class CapturedInput:
    path: Path
    raw: bytes
    size: int
    sha256: str
    device: int
    inode: int


@dataclass(frozen=True)
class ResourceBundle:
    source_fen: str
    state: tuple[str, int]
    cluster: tuple[str, int, int, str]
    canonical_source_fen: str
    opening_fen: str

    def overlaps(self, other: "ResourceBundle") -> bool:
        return (
            self.source_fen == other.source_fen
            or self.state == other.state
            or self.cluster == other.cluster
            or self.canonical_source_fen == other.canonical_source_fen
            or self.opening_fen == other.opening_fen
        )

    def report_value(self) -> dict[str, Any]:
        return {
            "source_fen": self.source_fen,
            "state": [self.state[0], self.state[1]],
            "cluster": list(self.cluster),
            "canonical_source_fen": self.canonical_source_fen,
            "opening_fen": self.opening_fen,
        }


@dataclass(frozen=True)
class Candidate:
    role: str
    row: dict[str, Any]
    bundle: ResourceBundle

    @property
    def cell(self) -> tuple[int, int, int]:
        return (
            self.row["duel_index"],
            self.row["variant_index"],
            self.row["panel_index"],
        )

    @property
    def slot(self) -> tuple[int, int]:
        return (self.row["variant_index"], self.row["duel_index"])

    @property
    def priority(self) -> tuple[Any, ...]:
        row = self.row
        return (
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
class PairChoice:
    loss: Candidate
    save: Candidate


@dataclass(frozen=True)
class SolveResult:
    status: str
    selected: tuple[tuple[tuple[int, int], PairChoice], ...]
    pair_trials: int
    trial_cap: int


@dataclass
class UsedResources:
    source_fens: set[str]
    states: set[tuple[str, int]]
    clusters: set[tuple[str, int, int, str]]
    canonical_source_fens: set[str]
    opening_fens: set[str]

    @classmethod
    def empty(cls) -> "UsedResources":
        return cls(set(), set(), set(), set(), set())

    def allows(self, candidate: Candidate) -> bool:
        bundle = candidate.bundle
        return (
            bundle.source_fen not in self.source_fens
            and bundle.state not in self.states
            and bundle.cluster not in self.clusters
            and bundle.canonical_source_fen not in self.canonical_source_fens
            and bundle.opening_fen not in self.opening_fens
        )

    def add(self, candidate: Candidate) -> None:
        bundle = candidate.bundle
        self.source_fens.add(bundle.source_fen)
        self.states.add(bundle.state)
        self.clusters.add(bundle.cluster)
        self.canonical_source_fens.add(bundle.canonical_source_fen)
        self.opening_fens.add(bundle.opening_fen)

    def remove(self, candidate: Candidate) -> None:
        bundle = candidate.bundle
        self.source_fens.remove(bundle.source_fen)
        self.states.remove(bundle.state)
        self.clusters.remove(bundle.cluster)
        self.canonical_source_fens.remove(bundle.canonical_source_fen)
        self.opening_fens.remove(bundle.opening_fen)


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
        raise JointSourceError(f"{label}: unsafe or unreadable input {path}") from error
    finally:
        if descriptor >= 0:
            os.close(descriptor)


def generation_seed_tag(role: str) -> str:
    return SEED_FAMILY_ID + str(ROLE_CONFIG[role]["seed_suffix"])


def opening_ids(
    role: str,
    repeat_index: int,
    opening_index: int,
    variant: str,
) -> tuple[str, str]:
    provenance = (
        f"generation_seed_tag={generation_seed_tag(role)}|repeat_index={repeat_index}"
        f"|opening_index={opening_index}|variant={variant}"
    )
    return (fnv_hex(f"cluster|{provenance}"), fnv_hex(f"side_pair|{provenance}"))


def expected_color(variant_index: int, panel_index: int, duel_index: int) -> str:
    return "white" if (variant_index + panel_index + duel_index) % 2 == 1 else "black"


def parse_board_fen(board_fen: str, label: str) -> tuple[tuple[str | None, ...], ...]:
    rows = board_fen.split("/")
    require(len(rows) == 11, f"{label}: board must have exactly 11 rows")
    parsed: list[tuple[str | None, ...]] = []
    for row_index, row in enumerate(rows):
        require(row, f"{label}: empty board row {row_index}")
        cells: list[str | None] = []
        offset = 0
        while offset < len(row):
            token = row[offset : offset + 3]
            require(len(token) == 3, f"{label}: truncated token in row {row_index}")
            if token[0] == "n":
                require(
                    token[1:].isdigit() and token[1:] == f"{int(token[1:]):02}",
                    f"{label}: noncanonical empty run {token!r}",
                )
                run = int(token[1:])
                require(1 <= run <= 11, f"{label}: invalid empty run {token!r}")
                cells.extend([None] * run)
            else:
                mon = token[:2]
                item = token[2]
                if mon == "xx":
                    require(item in "MmUPBQ", f"{label}: invalid item token {token!r}")
                else:
                    require(
                        mon[0] in "eEdDaAsSyY" and mon[1].isdigit(),
                        f"{label}: invalid mon token {token!r}",
                    )
                    require(item in "xMmUPBQ", f"{label}: invalid carried item {token!r}")
                cells.append(token)
            offset += 3
        require(len(cells) == 11, f"{label}: row {row_index} does not cover 11 cells")
        parsed.append(tuple(cells))
    return tuple(parsed)


def serialize_board(cells: Sequence[Sequence[str | None]]) -> str:
    require(len(cells) == 11 and all(len(row) == 11 for row in cells), "internal board shape")
    encoded_rows: list[str] = []
    for row in cells:
        pieces: list[str] = []
        empty = 0
        for item in row:
            if item is None:
                empty += 1
                continue
            if empty:
                pieces.append(f"n{empty:02}")
                empty = 0
            pieces.append(item)
        if empty:
            pieces.append(f"n{empty:02}")
        encoded_rows.append("".join(pieces))
    return "/".join(encoded_rows)


def swap_item_colors(item: str) -> str:
    require(len(item) == 3, "internal item token width")
    mon = item[:2]
    suffix = item[2]
    if mon != "xx":
        kind = mon[0].lower() if mon[0].isupper() else mon[0].upper()
        mon = kind + mon[1]
    if suffix == "M":
        suffix = "m"
    elif suffix == "m":
        suffix = "M"
    return mon + suffix


def rotate_and_swap_fen(source_fen: str, variant_index: int, label: str) -> str:
    fields = source_fen.split()
    require(len(fields) in (10, 11), f"{label}: invalid source field count")
    board = parse_board_fen(fields[9], f"{label}.board")
    transformed_board = tuple(
        tuple(
            None if item is None else swap_item_colors(item)
            for item in reversed(row)
        )
        for row in reversed(board)
    )
    result = [
        fields[1],
        fields[0],
        "w" if fields[2] == "b" else "b",
        fields[3],
        fields[4],
        fields[5],
        fields[7],
        fields[6],
        fields[8],
        serialize_board(transformed_board),
    ]
    if variant_index != 0:
        result.append(fields[10])
    return " ".join(result)


def perspective_canonical_fen(source_fen: str, actual_color: str, variant_index: int) -> str:
    if actual_color == "white":
        return source_fen
    return rotate_and_swap_fen(source_fen, variant_index, "candidate canonicalization")


def validate_fen(
    fen: str,
    variant_index: int,
    label: str,
    *,
    expected_color_token: str | None = None,
) -> None:
    fields = fen.split()
    require(fen == " ".join(fields), f"{label}: FEN whitespace is not canonical")
    if variant_index == 0:
        require(len(fields) == 10, f"{label}: Classic FEN must have exactly 10 fields")
    else:
        require(len(fields) == 11, f"{label}: non-Classic FEN must have exactly 11 fields")
        require(fields[10] == str(variant_index), f"{label}: FEN variant ID mismatch")
    require(fields[2] in ("b", "w"), f"{label}: invalid active-color token")
    if expected_color_token is not None:
        require(fields[2] == expected_color_token, f"{label}: active color mismatch")
    for index in (0, 1, 3, 4, 5, 6, 7, 8):
        require(
            re.fullmatch(r"0|[1-9][0-9]*", fields[index]) is not None,
            f"{label}: numeric field {index} is not canonical nonnegative decimal",
        )
    require_text(fields[9], f"{label}.board")
    parsed_board = parse_board_fen(fields[9], f"{label}.board")
    require(
        serialize_board(parsed_board) == fields[9],
        f"{label}: board encoding is not canonical",
    )


def source_identity(value: dict[str, Any]) -> str:
    return fnv_hex(
        f"pairnet_joint_source_v2|seed_family={SEED_FAMILY_ID}"
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
    return fnv_hex(f"dense_pareto_joint_source_universe_v2\n{canonical}")


def validate_candidate(value: dict[str, Any], role: str, label: str) -> Candidate:
    require_keys(value, CANDIDATE_FIELDS, label)
    require(not (set(value) & set(FORBIDDEN_INPUTS)), f"{label}: forbidden alternative-root key")
    require_common(value, label)
    config = ROLE_CONFIG[role]
    require(value["probe_data_role"] == PROBE_DATA_ROLE, f"{label}: data role drift")
    require(value["seed_family_id"] == SEED_FAMILY_ID, f"{label}: seed family drift")
    require(value["source_duel_id"] == config["duel"], f"{label}: duel drift")
    require(
        is_int(value["duel_index"])
        and value["duel_index"] == config["duel_index"],
        f"{label}: duel index drift",
    )
    require(
        is_int(value["variant_index"])
        and 0 <= value["variant_index"] < len(VARIANTS),
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
        value["canonical_source_fen"],
        f"{label}.canonical_source_fen",
        delimiter_safe=True,
    )
    opening_fen = require_text(value["opening_fen"], f"{label}.opening_fen", delimiter_safe=True)
    color_token = "w" if color == "white" else "b"
    validate_fen(source_fen, variant_index, f"{label}.source_fen", expected_color_token=color_token)
    validate_fen(canonical_fen, variant_index, f"{label}.canonical_source_fen", expected_color_token="w")
    validate_fen(opening_fen, variant_index, f"{label}.opening_fen")
    expected_canonical = perspective_canonical_fen(source_fen, color, variant_index)
    require(
        canonical_fen == expected_canonical,
        f"{label}: perspective-canonical source FEN mismatch",
    )

    guarded_move = require_text(value["guarded_move"], f"{label}.guarded_move", delimiter_safe=True)
    require(value["guarded_move_legal"] is True, f"{label}: guarded move must be legal")
    require(value["candidate_branch"] == "frontier_execute", f"{label}: candidate branch drift")
    require(
        is_int(value["repeat_index"])
        and 0 <= value["repeat_index"] < FIXED_REPEATS,
        f"{label}: repeat index outside fixed 16 repeats",
    )
    require(
        is_int(value["opening_index"])
        and value["opening_index"] == variant_index,
        f"{label}: opening/variant mismatch",
    )
    expected_generation = generation_seed_tag(role)
    require(
        value["generation_seed_tag"] == expected_generation,
        f"{label}: generation seed tag drift",
    )
    expected_cluster, expected_sibling = opening_ids(
        role,
        value["repeat_index"],
        value["opening_index"],
        value["variant"],
    )
    require_hex16(value["opening_cluster_id"], f"{label}.opening_cluster_id")
    require(
        value["opening_cluster_id"] == expected_cluster,
        f"{label}: opening-cluster provenance mismatch",
    )
    require_hex16(value["side_sibling_id"], f"{label}.side_sibling_id")
    require(
        value["side_sibling_id"] == expected_sibling,
        f"{label}: side-sibling provenance mismatch",
    )
    require(
        is_int(value["source_ply"]) and 0 <= value["source_ply"] < MAX_PLIES,
        f"{label}: source ply",
    )
    require(
        is_int(value["max_plies"]) and value["max_plies"] == MAX_PLIES,
        f"{label}: max plies drift",
    )
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
        and 1
        <= value["eligible_frontier_execute_count"]
        <= value["source_candidate_turn_count"],
        f"{label}: eligible frontier-execute count",
    )
    require(
        is_int(value["cell_candidate_count"]) and value["cell_candidate_count"] >= 1,
        f"{label}: cell candidate count",
    )
    require(
        is_int(value["resource_bucket_multiplicity"])
        and value["resource_bucket_multiplicity"] >= 1,
        f"{label}: resource bucket multiplicity",
    )
    require_hex16(value["source_identity_fnv64"], f"{label}.source_identity_fnv64")
    require(
        value["source_identity_fnv64"] == source_identity(value),
        f"{label}: source identity digest mismatch",
    )
    require(
        is_int(value["candidate_index"]) and value["candidate_index"] >= 0,
        f"{label}: candidate index",
    )
    del guarded_move
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
    violations: list[str] = []
    for variant_index, variant in enumerate(VARIANTS):
        for panel_index, panel in enumerate(PANELS):
            count = cell_counts[(variant_index, panel_index)]
            if count < 2:
                violations.append(
                    f"cell_resource_bundles={variant}|{panel}:actual={count}:required=2"
                )
    return sorted(violations)


def validate_schema(value: dict[str, Any], label: str) -> None:
    require_keys(value, SCHEMA_FIELDS, label)
    require_common(value, label)
    require(value["probe_data_role"] == PROBE_DATA_ROLE, f"{label}: data role drift")
    require(
        value["candidate_record_prefix"] == CANDIDATE_PREFIX.rstrip(),
        f"{label}: candidate prefix drift",
    )
    require(
        value["summary_record_prefix"] == SUMMARY_PREFIX.rstrip(),
        f"{label}: summary prefix drift",
    )
    require(
        value["selection_location"] == "external_strict_joint_matcher_only",
        f"{label}: selection location drift",
    )
    require(
        value["collapse_key"]
        == "cell,raw_source_fen,raw_source_fen_plus_horizon,raw_cluster_provenance,canonical_source_fen,raw_opening_fen",
        f"{label}: collapse key drift",
    )
    require(
        value["selection_priority"]
        == "source_ply,repeat_index,opening_index,source_fen,guarded_move,generation_seed_tag,opening_cluster_id,side_sibling_id,canonical_source_fen,opening_fen",
        f"{label}: selection priority drift",
    )
    require(value["fixed_variants"] == list(VARIANTS), f"{label}: variant registry drift")
    require(value["candidate_fields"] == list(CANDIDATE_FIELDS), f"{label}: candidate allowlist drift")
    require(value["summary_fields"] == list(SUMMARY_FIELDS), f"{label}: summary allowlist drift")
    require(value["resource_keys"] == list(RESOURCE_KEYS), f"{label}: resource-key drift")
    require(
        is_int(value["primary_pair_trial_cap"])
        and value["primary_pair_trial_cap"] == PRIMARY_PAIR_TRIAL_CAP,
        f"{label}: primary trial cap drift",
    )
    require(
        is_int(value["resilience_pair_trial_cap"])
        and value["resilience_pair_trial_cap"] == RESILIENCE_PAIR_TRIAL_CAP,
        f"{label}: resilience trial cap drift",
    )
    require(value["forbidden_inputs"] == list(FORBIDDEN_INPUTS), f"{label}: forbidden-input drift")


def parse_events(capture: CapturedInput, role: str) -> ParsedLog:
    label = f"{role} log"
    try:
        text = capture.raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as error:
        raise JointSourceError(f"{label}: input is not UTF-8") from error

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
            left_stripped.startswith(NAMESPACE)
            or STRUCTURED_RECORD.match(left_stripped)
        ):
            raise JointSourceError(
                f"{label}:{line_number}: whitespace-prefixed structured record"
            )
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
            raise JointSourceError(
                f"{label}:{line_number}: unexpected structured record or prefix"
            )

    require(len(schemas) == 1, f"{label}: exactly one schema record required")
    require(candidate_values, f"{label}: at least one candidate record required")
    require(len(summaries) == 1, f"{label}: exactly one summary record required")
    require(
        len(harness_results) == 1
        and HARNESS_OK.fullmatch(harness_results[0]) is not None,
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
    parsed = ParsedLog(
        role=role,
        capture=capture,
        schema=schemas[0],
        candidates=candidates,
        summary=summaries[0],
    )
    validate_log(parsed)
    return parsed


def validate_log(parsed: ParsedLog) -> None:
    role = parsed.role
    label = f"{role} log"
    require(role in ROLE_CONFIG, f"{label}: unknown role")
    candidates = parsed.candidates

    indices = [candidate.row["candidate_index"] for candidate in candidates]
    require(
        indices == list(range(len(candidates))),
        f"{label}: candidate indices must be emitted contiguously from zero in log order",
    )
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
        f"{label}: candidate emission order is not canonical variant/panel/priority order",
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
    require(
        len(set(collapse_keys)) == len(collapse_keys),
        f"{label}: exact collapsed-resource duplicate remains",
    )
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
        eligible_cells == EXPECTED_CELLS_PER_DUEL
        and min_cell >= 2
        and violations == []
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
        "candidate_universe_digest_fnv64": candidate_universe_digest(candidates),
        "violations": violations,
        "universe_complete": universe_complete,
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
        "corpus_label_permission": False,
        "model_data_permission": False,
        "tensor_extraction_permission": False,
        "runtime_permission": False,
        "dashboard_permission": False,
        "promotion_permission": False,
        "next_action": "run_strict_joint_source_matcher_only",
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
    candidates: Sequence[Candidate],
    slot_keys: Sequence[tuple[int, int]],
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
            slots.append(
                PairSlot(
                    key=(variant_index, duel_index),
                    losses=losses,
                    saves=saves,
                    conflicting_save_indices=conflicts,
                )
            )
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


def candidate_available(
    candidate: Candidate,
    used: UsedResources,
    forbidden: ResourceBundle | None,
) -> bool:
    return used.allows(candidate) and (
        forbidden is None or not candidate.bundle.overlaps(forbidden)
    )


def legal_candidate_indices(
    slot: PairSlot,
    used: UsedResources,
    forbidden: ResourceBundle | None,
) -> tuple[list[int], set[int]]:
    losses = [
        index
        for index, candidate in enumerate(slot.losses)
        if candidate_available(candidate, used, forbidden)
    ]
    saves = {
        index
        for index, candidate in enumerate(slot.saves)
        if candidate_available(candidate, used, forbidden)
    }
    return losses, saves


def legal_pair_count(
    slot: PairSlot,
    used: UsedResources,
    forbidden: ResourceBundle | None,
) -> int:
    losses, saves = legal_candidate_indices(slot, used, forbidden)
    if not losses or not saves:
        return 0
    return sum(
        len(saves) - len(saves.intersection(slot.conflicting_save_indices[loss_index]))
        for loss_index in losses
    )


def solve_slots(
    slots: Sequence[PairSlot],
    trial_cap: int,
    forbidden: ResourceBundle | None = None,
) -> SolveResult:
    require(is_int(trial_cap) and trial_cap >= 0, "solver trial cap must be nonnegative")
    ordered_slots = tuple(sorted(slots, key=lambda slot: slot.key))
    require(
        len({slot.key for slot in ordered_slots}) == len(ordered_slots),
        "solver slots must be unique",
    )
    used = UsedResources.empty()
    selected: dict[tuple[int, int], PairChoice] = {}
    trials = 0
    exhausted = False

    def search(remaining: tuple[PairSlot, ...]) -> bool:
        nonlocal trials, exhausted
        if not remaining:
            return True

        counts = [
            (legal_pair_count(slot, used, forbidden), slot.key, slot)
            for slot in remaining
        ]
        count, _, chosen = min(counts, key=lambda item: (item[0], item[1]))
        if count == 0:
            return False
        rest = tuple(slot for slot in remaining if slot.key != chosen.key)
        loss_indices, save_indices = legal_candidate_indices(chosen, used, forbidden)
        for loss_index in loss_indices:
            loss = chosen.losses[loss_index]
            conflicts = chosen.conflicting_save_indices[loss_index]
            for save_index, save in enumerate(chosen.saves):
                if save_index not in save_indices or save_index in conflicts:
                    continue
                if trials >= trial_cap:
                    exhausted = True
                    return False
                trials += 1
                used.add(loss)
                used.add(save)
                selected[chosen.key] = PairChoice(loss=loss, save=save)
                forward_ok = all(
                    legal_pair_count(slot, used, forbidden) > 0 for slot in rest
                )
                if forward_ok and search(rest):
                    return True
                del selected[chosen.key]
                used.remove(save)
                used.remove(loss)
                if exhausted:
                    return False
        return False

    solved = search(ordered_slots)
    status = "solved" if solved else ("cap_exhausted" if exhausted else "proven_infeasible")
    selected_rows = tuple(sorted(selected.items())) if solved else ()
    return SolveResult(
        status=status,
        selected=selected_rows,
        pair_trials=trials,
        trial_cap=trial_cap,
    )


def flatten_selection(result: SolveResult) -> list[Candidate]:
    require(result.status == "solved", "cannot flatten an unsolved assignment")
    candidates: list[Candidate] = []
    for _, pair in result.selected:
        candidates.extend((pair.loss, pair.save))
    return sorted(
        candidates,
        key=lambda candidate: (
            candidate.row["variant_index"],
            candidate.row["duel_index"],
            candidate.row["panel_index"],
        ),
    )


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
        for candidate in sorted(
            candidates,
            key=lambda item: (item.cell, item.priority),
        )
    ]


def selection_manifest(result: SolveResult) -> list[dict[str, Any]]:
    manifest: list[dict[str, Any]] = []
    for candidate in flatten_selection(result):
        row = candidate.row
        manifest.append(
            {
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


def selection_digest(result: SolveResult) -> str:
    return sha256_json(selection_manifest(result))


def resource_uniqueness(candidates: Sequence[Candidate]) -> dict[str, int]:
    return {
        "source_fens": len({candidate.bundle.source_fen for candidate in candidates}),
        "states": len({candidate.bundle.state for candidate in candidates}),
        "clusters": len({candidate.bundle.cluster for candidate in candidates}),
        "canonical_source_fens": len(
            {candidate.bundle.canonical_source_fen for candidate in candidates}
        ),
        "opening_fens": len({candidate.bundle.opening_fen for candidate in candidates}),
    }


def build_report(logs: Sequence[ParsedLog]) -> dict[str, Any]:
    validate_v1_viewed_content_blacklist()
    require(
        [log.role for log in logs] == ["pro", "normal", "fast"],
        "combined audit requires pro, normal, fast order",
    )
    candidates = [candidate for log in logs for candidate in log.candidates]
    quarantined: list[tuple[Candidate, tuple[str, ...]]] = []
    surviving_candidates: list[Candidate] = []
    for candidate in candidates:
        hits = candidate_v1_viewed_content_hits(candidate)
        if hits:
            quarantined.append((candidate, hits))
        else:
            surviving_candidates.append(candidate)
    slots = make_pair_slots(surviving_candidates)
    violations: list[str] = []

    for log in logs:
        if log.summary["universe_complete"] is not True:
            violations.append(f"{log.role}:universe_incomplete")
    post_quarantine_cell_counts = Counter(candidate.cell for candidate in surviving_candidates)
    for duel_index in range(3):
        for variant_index in range(len(VARIANTS)):
            for panel_index in range(len(PANELS)):
                count = len(
                    {
                        candidate.bundle
                        for candidate in surviving_candidates
                        if candidate.cell == (duel_index, variant_index, panel_index)
                    }
                )
                if count < 2:
                    violations.append(
                        f"insufficient_cell_bundles:duel={duel_index}:variant={variant_index}"
                        f":panel={panel_index}:actual={count}:required=2"
                    )

    primary = solve_slots(slots, PRIMARY_PAIR_TRIAL_CAP)
    if primary.status != "solved":
        violations.append(f"primary_solver:{primary.status}")

    manifest: list[dict[str, Any]] = []
    selected_digest: str | None = None
    uniqueness = {
        "source_fens": 0,
        "states": 0,
        "clusters": 0,
        "canonical_source_fens": 0,
        "opening_fens": 0,
    }
    resilience_attempts: list[dict[str, Any]] = []
    if primary.status == "solved":
        selected = flatten_selection(primary)
        manifest = selection_manifest(primary)
        selected_digest = selection_digest(primary)
        require(len(selected) == EXPECTED_SELECTED, "solved assignment did not select 72 sources")
        uniqueness = resource_uniqueness(selected)
        for resource_name, count in uniqueness.items():
            if count != EXPECTED_SELECTED:
                violations.append(
                    f"selected_resource_not_unique:{resource_name}:actual={count}:expected=72"
                )
        for selected_index, candidate in enumerate(selected):
            rematch = solve_slots(
                slots,
                RESILIENCE_PAIR_TRIAL_CAP,
                forbidden=candidate.bundle,
            )
            resilience_attempts.append(
                {
                    "selected_index": selected_index,
                    "source_identity_fnv64": candidate.row["source_identity_fnv64"],
                    "status": rematch.status,
                    "pair_trials": rematch.pair_trials,
                    "selection_digest_sha256": (
                        selection_digest(rematch) if rematch.status == "solved" else None
                    ),
                }
            )
            if rematch.status != "solved":
                violations.append(
                    f"resilience_rematch:{selected_index}:{candidate.row['source_identity_fnv64']}"
                    f":{rematch.status}"
                )

    universe_digest = sha256_json(normalized_universe(candidates))
    post_quarantine_universe_digest = sha256_json(
        normalized_universe(surviving_candidates)
    )
    reversed_candidates = list(reversed(candidates))
    reversed_universe_digest = sha256_json(normalized_universe(reversed_candidates))
    reversed_surviving_candidates = [
        candidate
        for candidate in reversed_candidates
        if not candidate_v1_viewed_content_hits(candidate)
    ]
    reversed_post_quarantine_digest = sha256_json(
        normalized_universe(reversed_surviving_candidates)
    )
    reversed_result = solve_slots(
        make_pair_slots(reversed_surviving_candidates), PRIMARY_PAIR_TRIAL_CAP
    )
    reversed_selection_digest = (
        selection_digest(reversed_result) if reversed_result.status == "solved" else None
    )
    reversal_pass = (
        universe_digest == reversed_universe_digest
        and post_quarantine_universe_digest == reversed_post_quarantine_digest
        and primary.status == reversed_result.status
        and selected_digest == reversed_selection_digest
        and primary.pair_trials == reversed_result.pair_trials
    )
    if not reversal_pass:
        violations.append("input_reversal_determinism_failed")

    selected_rows = flatten_selection(primary) if primary.status == "solved" else []
    selected_variant_counts = Counter(row.row["variant"] for row in selected_rows)
    selected_panel_counts = Counter(row.row["source_panel"] for row in selected_rows)
    selected_color_counts = Counter(row.row["actual_color"] for row in selected_rows)
    selected_duel_counts = Counter(row.row["source_duel_id"] for row in selected_rows)
    selected_v1_overlap = sum(
        bool(candidate_v1_viewed_content_hits(candidate)) for candidate in selected_rows
    )
    if selected_v1_overlap != 0:
        violations.append(f"selected_v1_viewed_content_overlap={selected_v1_overlap}")
    if primary.status == "solved":
        if selected_variant_counts != Counter({variant: 6 for variant in VARIANTS}):
            violations.append("selected_variant_balance_failed")
        if selected_panel_counts != Counter({panel: 36 for panel in PANELS}):
            violations.append("selected_panel_balance_failed")
        if selected_color_counts != Counter({color: 36 for color in COLORS}):
            violations.append("selected_color_balance_failed")
        if selected_duel_counts != Counter(
            {str(ROLE_CONFIG[role]["duel"]): 24 for role in ("pro", "normal", "fast")}
        ):
            violations.append("selected_duel_balance_failed")

    violations = sorted(set(violations))
    pilot_pass = not violations
    excluded_per_duel = Counter(candidate.role for candidate, _ in quarantined)
    excluded_rows_per_duel = Counter()
    hit_counts = Counter()
    hit_row_counts = Counter()
    hit_counts_per_duel = Counter()
    hit_row_counts_per_duel = Counter()
    for candidate, hits in quarantined:
        multiplicity = candidate.row["resource_bucket_multiplicity"]
        excluded_rows_per_duel[candidate.role] += multiplicity
        for field in hits:
            hit_counts[field] += 1
            hit_row_counts[field] += multiplicity
            hit_counts_per_duel[(candidate.role, field)] += 1
            hit_row_counts_per_duel[(candidate.role, field)] += multiplicity
    post_quarantine_cell_count_entries = [
        f"{ROLE_CONFIG[role]['duel']}|{VARIANTS[variant_index]}|{PANELS[panel_index]}="
        f"{post_quarantine_cell_counts[(int(ROLE_CONFIG[role]['duel_index']), variant_index, panel_index)]}"
        for role in ("pro", "normal", "fast")
        for variant_index in range(len(VARIANTS))
        for panel_index in range(len(PANELS))
    ]
    post_quarantine_counts = list(post_quarantine_cell_counts.values())
    post_quarantine_eligible_cells = sum(count > 0 for count in post_quarantine_counts)
    post_quarantine_min_cell_count = min(
        (
            post_quarantine_cell_counts[(duel_index, variant_index, panel_index)]
            for duel_index in range(3)
            for variant_index in range(len(VARIANTS))
            for panel_index in range(len(PANELS))
        ),
        default=0,
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "architecture_id": ARCHITECTURE_ID,
        "report_id": REPORT_ID,
        "probe_data_role": PROBE_DATA_ROLE,
        "seed_family_id": SEED_FAMILY_ID,
        "inputs": [
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
            "paired_slots": len(slots),
            "expected_selected": EXPECTED_SELECTED,
            "resource_keys": list(RESOURCE_KEYS),
            "primary_pair_trial_cap": PRIMARY_PAIR_TRIAL_CAP,
            "resilience_pair_trial_cap": RESILIENCE_PAIR_TRIAL_CAP,
            "input_order_independent": True,
            "v1_viewed_report_sha256": V1_VIEWED_REPORT_SHA256,
            "v1_viewed_report_rows": V1_VIEWED_REPORT_ROWS,
            "v1_viewed_unique_raw_source_fens": V1_VIEWED_UNIQUE_RAW_SOURCE_FENS,
            "v1_viewed_unique_canonical_source_fens": V1_VIEWED_UNIQUE_CANONICAL_SOURCE_FENS,
            "v1_viewed_content_hash_count": V1_VIEWED_CONTENT_HASH_COUNT,
            "v1_viewed_content_set_digest_sha256": V1_VIEWED_CONTENT_SET_DIGEST_SHA256,
            "v1_viewed_content_filter_location": (
                "after_full_log_authentication_before_bundle_gates_and_matching"
            ),
            "v1_viewed_content_overlap": 0,
        },
        "combined_candidate_count": len(candidates),
        "combined_universe_digest_sha256": universe_digest,
        "post_quarantine_candidate_count": len(surviving_candidates),
        "post_quarantine_universe_digest_sha256": post_quarantine_universe_digest,
        "v1_viewed_content_quarantine": {
            "report_sha256": V1_VIEWED_REPORT_SHA256,
            "report_rows": V1_VIEWED_REPORT_ROWS,
            "unique_raw_source_fens": V1_VIEWED_UNIQUE_RAW_SOURCE_FENS,
            "unique_canonical_source_fens": V1_VIEWED_UNIQUE_CANONICAL_SOURCE_FENS,
            "content_hash_count": V1_VIEWED_CONTENT_HASH_COUNT,
            "content_set_digest_sha256": V1_VIEWED_CONTENT_SET_DIGEST_SHA256,
            "excluded_candidate_bundles": len(quarantined),
            "excluded_pre_collapse_rows": sum(
                candidate.row["resource_bucket_multiplicity"]
                for candidate, _ in quarantined
            ),
            "excluded_bundles_per_duel": [
                f"{role}={excluded_per_duel[role]}"
                for role in ("pro", "normal", "fast")
            ],
            "excluded_rows_per_duel": [
                f"{role}={excluded_rows_per_duel[role]}"
                for role in ("pro", "normal", "fast")
            ],
            "resource_hit_bundles": [
                f"{field}={hit_counts[field]}"
                for field in ("source_fen", "canonical_source_fen", "opening_fen")
            ],
            "resource_hit_pre_collapse_rows": [
                f"{field}={hit_row_counts[field]}"
                for field in ("source_fen", "canonical_source_fen", "opening_fen")
            ],
            "resource_hit_bundles_per_duel": [
                f"{role}|{field}={hit_counts_per_duel[(role, field)]}"
                for role in ("pro", "normal", "fast")
                for field in ("source_fen", "canonical_source_fen", "opening_fen")
            ],
            "resource_hit_rows_per_duel": [
                f"{role}|{field}={hit_row_counts_per_duel[(role, field)]}"
                for role in ("pro", "normal", "fast")
                for field in ("source_fen", "canonical_source_fen", "opening_fen")
            ],
            "excluded_candidates": [
                {
                    "duel": candidate.row["source_duel_id"],
                    "duel_index": candidate.row["duel_index"],
                    "variant": candidate.row["variant"],
                    "variant_index": candidate.row["variant_index"],
                    "panel": candidate.row["source_panel"],
                    "panel_index": candidate.row["panel_index"],
                    "source_identity_fnv64": candidate.row["source_identity_fnv64"],
                    "resource_bucket_multiplicity": candidate.row[
                        "resource_bucket_multiplicity"
                    ],
                    "hit_fields": list(hits),
                }
                for candidate, hits in quarantined
            ],
            "post_quarantine_eligible_cells": post_quarantine_eligible_cells,
            "post_quarantine_min_cell_candidate_count": post_quarantine_min_cell_count,
            "post_quarantine_cell_counts": post_quarantine_cell_count_entries,
            "surviving_overlap": 0,
            "selected_overlap": selected_v1_overlap,
        },
        "v1_viewed_content_overlap": selected_v1_overlap,
        "primary_solver": {
            "status": primary.status,
            "pair_trials": primary.pair_trials,
            "trial_cap": primary.trial_cap,
        },
        "selection_digest_sha256": selected_digest,
        "selection_manifest": manifest,
        "selected_resource_counts": uniqueness,
        "selected_counts": {
            "sources": len(selected_rows),
            "variant_counts": count_entries(selected_variant_counts, VARIANTS),
            "panel_counts": count_entries(selected_panel_counts, PANELS),
            "color_counts": count_entries(selected_color_counts, COLORS),
            "duel_counts": count_entries(
                selected_duel_counts,
                tuple(str(ROLE_CONFIG[role]["duel"]) for role in ("pro", "normal", "fast")),
            ),
        },
        "resilience": {
            "required_rematches": EXPECTED_SELECTED,
            "attempted_rematches": len(resilience_attempts),
            "passed_rematches": sum(
                attempt["status"] == "solved" for attempt in resilience_attempts
            ),
            "attempts": resilience_attempts,
        },
        "input_reversal_audit": {
            "original_universe_digest_sha256": universe_digest,
            "reversed_universe_digest_sha256": reversed_universe_digest,
            "original_post_quarantine_digest_sha256": post_quarantine_universe_digest,
            "reversed_post_quarantine_digest_sha256": reversed_post_quarantine_digest,
            "original_solver_status": primary.status,
            "reversed_solver_status": reversed_result.status,
            "original_pair_trials": primary.pair_trials,
            "reversed_pair_trials": reversed_result.pair_trials,
            "original_selection_digest_sha256": selected_digest,
            "reversed_selection_digest_sha256": reversed_selection_digest,
            "pass": reversal_pass,
        },
        "violations": violations,
        "pilot_pass": pilot_pass,
        "decision": (
            "go_freeze_fresh_corpus_precommit_only"
            if pilot_pass
            else "kill_automove_dense_pareto_pairnet_v2_joint_source_matching"
        ),
        "authorization": "fresh_source_family_precommit_only" if pilot_pass else "none",
        "root_pool_permission": False,
        "alternative_root_outcome_permission": False,
        "corpus_label_permission": False,
        "model_data_permission": False,
        "tensor_extraction_permission": False,
        "runtime_permission": False,
        "dashboard_permission": False,
        "promotion_permission": False,
        "next_action": (
            "freeze_report_and_write_fresh_corpus_precommit"
            if pilot_pass
            else "archive_no_go_without_seed_repeat_or_source_retry"
        ),
    }


def report_exit_code(report: dict[str, Any]) -> int:
    return 0 if report.get("pilot_pass") is True else 1


def validate_output_path(path: Path) -> tuple[str, ...]:
    text = path.as_posix()
    require(text and not path.is_absolute() and "\\" not in text, "output must be a relative POSIX path")
    parts = path.parts
    require(
        len(parts) >= 3 and parts[:2] == ("target", "experiment-runs"),
        "output must be within target/experiment-runs",
    )
    require(
        path == Path(text) and all(part not in ("", ".", "..") for part in parts),
        "output path must be normalized and contained",
    )
    return parts


def exclusive_atomic_write(path: Path, raw: bytes) -> None:
    parts = validate_output_path(path)
    root_fd = os.open(".", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    parent_fd = os.dup(root_fd)
    temporary_name: str | None = None
    temporary_fd = -1
    try:
        for part in parts[:-1]:
            next_fd = os.open(
                part,
                os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                dir_fd=parent_fd,
            )
            os.close(parent_fd)
            parent_fd = next_fd
        try:
            os.stat(parts[-1], dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        else:
            raise JointSourceError(f"refusing existing or symlink output {path}")
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
    except JointSourceError:
        raise
    except OSError as error:
        raise JointSourceError(
            f"refusing unsafe, missing-parent, or existing output {path}"
        ) from error
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


V1_VIEWED_SELF_TEST_SOURCE_FEN = (
    "0 0 b 0 0 1 0 0 2 "
    "n03y0xn01d0xa0xe0xn03/n05s0xn05/n11/n04xxmn01xxmn04/"
    "n03xxmn01xxmn01xxmn03/xxQn04xxUn04xxQ/"
    "n03xxMn01xxMn01xxMn03/n04xxMn01xxMn04/n08Y0xn02/"
    "n04D0xn01S0xn04/n02E0xn01A0xn06"
)


def fixture_fen(variant_index: int, active_color: str, serial: int) -> str:
    fen = f"0 0 {active_color} 0 0 0 0 0 {serial} {FIXTURE_BOARD_FEN}"
    if variant_index != 0:
        fen += f" {variant_index}"
    return fen


def fixture_candidate_values(role: str) -> list[dict[str, Any]]:
    config = ROLE_CONFIG[role]
    role_base = {"pro": 10_000, "normal": 20_000, "fast": 30_000}[role]
    values: list[dict[str, Any]] = []
    for variant_index, variant in enumerate(VARIANTS):
        for panel_index, panel in enumerate(PANELS):
            color = expected_color(variant_index, panel_index, int(config["duel_index"]))
            active = "w" if color == "white" else "b"
            for repeat_index in range(3):
                serial = role_base + variant_index * 100 + panel_index * 10 + repeat_index
                source_fen = fixture_fen(variant_index, active, serial)
                opening_fen = fixture_fen(
                    variant_index,
                    "w",
                    role_base + 5_000 + variant_index * 100 + repeat_index,
                )
                canonical_fen = perspective_canonical_fen(source_fen, color, variant_index)
                cluster, sibling = opening_ids(
                    role,
                    repeat_index,
                    variant_index,
                    variant,
                )
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
                    "source_candidate_turn_count": 4,
                    "eligible_frontier_execute_count": 3,
                    "cell_candidate_count": 3,
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
        )
    )
    for index, row in enumerate(values):
        row["candidate_index"] = index
    return values


def fixture_schema() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "architecture_id": ARCHITECTURE_ID,
        "candidate_independent": True,
        "alternative_root_labels_used": False,
        "probe_data_role": PROBE_DATA_ROLE,
        "candidate_record_prefix": CANDIDATE_PREFIX.rstrip(),
        "summary_record_prefix": SUMMARY_PREFIX.rstrip(),
        "selection_location": "external_strict_joint_matcher_only",
        "collapse_key": (
            "cell,raw_source_fen,raw_source_fen_plus_horizon,raw_cluster_provenance,"
            "canonical_source_fen,raw_opening_fen"
        ),
        "selection_priority": (
            "source_ply,repeat_index,opening_index,source_fen,guarded_move,"
            "generation_seed_tag,opening_cluster_id,side_sibling_id,"
            "canonical_source_fen,opening_fen"
        ),
        "fixed_variants": list(VARIANTS),
        "candidate_fields": list(CANDIDATE_FIELDS),
        "summary_fields": list(SUMMARY_FIELDS),
        "resource_keys": list(RESOURCE_KEYS),
        "primary_pair_trial_cap": PRIMARY_PAIR_TRIAL_CAP,
        "resilience_pair_trial_cap": RESILIENCE_PAIR_TRIAL_CAP,
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
    all_cell_counts = [
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
        "candidate_count": len(candidates),
        "collapsed_candidate_count": len(candidates),
        "emitted_candidates": len(candidates),
        "eligible_cells": sum(count > 0 for count in all_cell_counts),
        "min_cell_candidate_count": min(all_cell_counts),
        "max_cell_candidate_count": max(all_cell_counts),
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
        "next_action": "run_strict_joint_source_matcher_only",
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
    except JointSourceError:
        return
    raise JointSourceError(message)


def mutate_first_record(raw: bytes, prefix: str, mutation: Any) -> bytes:
    lines = raw.decode("utf-8").splitlines()
    index = next(index for index, line in enumerate(lines) if line.startswith(prefix))
    value = parse_json(lines[index][len(prefix) :], "fixture mutation")
    mutation(value)
    lines[index] = prefix + canonical_json(value)
    return ("\n".join(lines) + "\n").encode("utf-8")


def solver_bundle(label: str) -> ResourceBundle:
    return ResourceBundle(
        source_fen=f"fen-{label}",
        state=(f"fen-{label}", 1),
        cluster=(f"seed-{label}", 0, 0, f"variant-{label}"),
        canonical_source_fen=f"canonical-{label}",
        opening_fen=f"opening-{label}",
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
    return Candidate(role="synthetic", row=row, bundle=solver_bundle(bundle_label))


def self_test_v1_collision() -> None:
    candidates = [
        solver_candidate(0, 0, 0, 0, "pro-loss", "pro-loss"),
        solver_candidate(0, 0, 1, 0, "shared", "pro-save-shared"),
        solver_candidate(0, 0, 1, 1, "pro-save-alt", "pro-save-alt"),
        solver_candidate(0, 1, 0, 0, "shared", "normal-loss-shared"),
        solver_candidate(0, 1, 0, 1, "normal-loss-alt", "normal-loss-alt"),
        solver_candidate(0, 1, 1, 0, "normal-save", "normal-save"),
        solver_candidate(0, 2, 0, 0, "fast-loss", "fast-loss"),
        solver_candidate(0, 2, 1, 0, "shared", "fast-save-shared"),
        solver_candidate(0, 2, 1, 1, "fast-save-alt", "fast-save-alt"),
    ]
    slots = make_pair_slots_for_keys(candidates, [(0, 0), (0, 1), (0, 2)])
    result = solve_slots(slots, 100)
    require(result.status == "solved", "v1 triple-collision fixture was not recovered")
    selected = flatten_selection(result)
    require(
        sum(candidate.bundle == solver_bundle("shared") for candidate in selected) == 1,
        "joint solver did not allocate the v1 shared source exactly once",
    )


def self_test_backtracking_and_caps() -> None:
    # Slot A's first pair consumes X and Y.  Slot B can use X or Y, so the
    # first A choice dead-ends; A's second legal pair leaves X available.
    a_loss_x = solver_candidate(0, 0, 0, 0, "x", "a-loss-x")
    a_loss_w = solver_candidate(0, 0, 0, 1, "w", "a-loss-w")
    a_save_y = solver_candidate(0, 0, 1, 0, "y", "a-save-y")
    a_save_v = solver_candidate(0, 0, 1, 1, "v", "a-save-v")
    a_loss_x = Candidate(
        a_loss_x.role,
        a_loss_x.row,
        ResourceBundle("fen-x", ("a-l0", 1), ("a-l0", 0, 0, "a"), "a", "d"),
    )
    a_save_y = Candidate(
        a_save_y.role,
        a_save_y.row,
        ResourceBundle("fen-y", ("a-s0", 1), ("a-s0", 0, 0, "a"), "c", "e"),
    )
    a_loss_w = Candidate(
        a_loss_w.role,
        a_loss_w.row,
        ResourceBundle("fen-w", ("a-l1", 1), ("a-l1", 0, 0, "a"), "c", "f"),
    )
    a_save_v = Candidate(
        a_save_v.role,
        a_save_v.row,
        ResourceBundle("fen-v", ("a-s1", 1), ("a-s1", 0, 0, "a"), "b", "d"),
    )
    b_loss_x = solver_candidate(1, 0, 0, 0, "x", "b-loss-x")
    b_loss_y = solver_candidate(1, 0, 0, 1, "y", "b-loss-y")
    b_save_z = solver_candidate(1, 0, 1, 0, "z", "b-save-z")
    candidates = [
        a_loss_x,
        a_loss_w,
        a_save_y,
        a_save_v,
        b_loss_x,
        b_loss_y,
        b_save_z,
    ]
    slots = make_pair_slots_for_keys(candidates, [(0, 0), (1, 0)])
    result = solve_slots(slots, 100)
    require(result.status == "solved", "backtracking trap did not solve")
    require(result.pair_trials >= 3, "backtracking trap did not exercise a dead-end")

    one_slot = make_pair_slots_for_keys(
        [
            solver_candidate(0, 0, 0, 0, "a", "cap-loss"),
            solver_candidate(0, 0, 1, 0, "b", "cap-save"),
        ],
        [(0, 0)],
    )
    require(solve_slots(one_slot, 0).status == "cap_exhausted", "cap exhaustion conflated")
    require(solve_slots(one_slot, 1).status == "solved", "single allowed trial did not solve")
    impossible = make_pair_slots_for_keys(
        [
            solver_candidate(0, 0, 0, 0, "same", "impossible-loss"),
            solver_candidate(0, 0, 1, 0, "same", "impossible-save"),
        ],
        [(0, 0)],
    )
    require(
        solve_slots(impossible, 100).status == "proven_infeasible",
        "proven infeasibility was not distinguished from cap exhaustion",
    )


def self_test_resource_domains() -> None:
    base = solver_bundle("base")
    canonical_conflict = ResourceBundle(
        "fen-other",
        ("fen-other", 2),
        ("seed-other", 1, 1, "variant-other"),
        base.canonical_source_fen,
        "opening-other",
    )
    opening_conflict = ResourceBundle(
        "fen-third",
        ("fen-third", 3),
        ("seed-third", 2, 2, "variant-third"),
        "canonical-third",
        base.opening_fen,
    )
    require(base.overlaps(canonical_conflict), "canonical resource conflict was ignored")
    require(base.overlaps(opening_conflict), "opening resource conflict was ignored")
    disjoint = solver_bundle("disjoint")
    require(not base.overlaps(disjoint), "disjoint resources collided")


def self_test() -> None:
    validate_v1_viewed_content_blacklist()
    require(
        sha256_text(V1_VIEWED_SELF_TEST_SOURCE_FEN)
        == "0c799a0448fb04cbba5462e56f01826e5ed1608a17f8cf550c36583a7dd3b86a",
        "self-contained v1 viewed source fixture digest drift",
    )
    require(
        sha256_text(V1_VIEWED_SELF_TEST_SOURCE_FEN)
        in V1_VIEWED_CONTENT_SHA256_SET,
        "self-contained v1 viewed source fixture is absent from blacklist",
    )
    v1_fixture_canonical = perspective_canonical_fen(
        V1_VIEWED_SELF_TEST_SOURCE_FEN, "black", 0
    )
    require(
        sha256_text(v1_fixture_canonical) in V1_VIEWED_CONTENT_SHA256_SET,
        "self-contained v1 canonical source fixture is absent from blacklist",
    )
    expect_error(lambda: parse_json('{"a":', "malformed fixture"), "malformed JSON was accepted")
    expect_error(
        lambda: parse_json('{"a":1,"a":2}', "duplicate fixture"),
        "duplicate JSON key was accepted",
    )
    expect_error(lambda: parse_json('{"a":NaN}', "nonfinite fixture"), "NaN was accepted")

    logs = [
        parse_events(synthetic_capture(role, fixture_log(role)), role)
        for role in ("pro", "normal", "fast")
    ]
    report = build_report(logs)
    require(report["pilot_pass"] is True, "passing fixture did not pass")
    require(report_exit_code(report) == 0, "passing fixture exit status")
    require(len(report["selection_manifest"]) == EXPECTED_SELECTED, "fixture manifest size")
    require(report["resilience"]["passed_rematches"] == EXPECTED_SELECTED, "resilience fixture")
    require(report["v1_viewed_content_overlap"] == 0, "clean fixture overlap audit")

    def add_one_viewed_opening(values: list[dict[str, Any]]) -> None:
        target = next(
            row
            for row in values
            if row["variant_index"] == 0
            and row["panel_index"] == 0
            and row["repeat_index"] == 0
        )
        target["opening_fen"] = V1_VIEWED_SELF_TEST_SOURCE_FEN

    quarantined_logs = [
        parse_events(
            synthetic_capture(
                role,
                fixture_log(role, add_one_viewed_opening if role == "pro" else None),
            ),
            role,
        )
        for role in ("pro", "normal", "fast")
    ]
    quarantine_report = build_report(quarantined_logs)
    quarantine = quarantine_report["v1_viewed_content_quarantine"]
    require(quarantine_report["pilot_pass"] is True, "one viewed row with alternatives failed")
    require(quarantine["excluded_candidate_bundles"] == 1, "viewed candidate not excluded")
    require(
        quarantine["resource_hit_bundles"]
        == ["source_fen=0", "canonical_source_fen=0", "opening_fen=1"],
        "opening-FEN quarantine hit audit drift",
    )
    require(
        quarantine["post_quarantine_min_cell_candidate_count"] == 2,
        "post-quarantine alternatives were not retained",
    )
    require(quarantine_report["v1_viewed_content_overlap"] == 0, "selected viewed overlap")

    direct_values = fixture_candidate_values("pro")
    direct_row = next(
        row
        for row in direct_values
        if row["variant_index"] == 0
        and row["panel_index"] == 0
        and row["repeat_index"] == 0
    )
    direct_row["source_fen"] = V1_VIEWED_SELF_TEST_SOURCE_FEN
    direct_row["canonical_source_fen"] = v1_fixture_canonical
    direct_row["source_identity_fnv64"] = source_identity(direct_row)
    direct_candidate = validate_candidate(direct_row, "pro", "v1 direct overlap fixture")
    require(
        candidate_v1_viewed_content_hits(direct_candidate)
        == ("source_fen", "canonical_source_fen"),
        "raw/canonical v1 candidate hits were not both classified",
    )

    def exhaust_one_cell_with_viewed_opening(values: list[dict[str, Any]]) -> None:
        for row in values:
            if row["variant_index"] == 0 and row["panel_index"] == 0:
                row["opening_fen"] = V1_VIEWED_SELF_TEST_SOURCE_FEN

    exhausted_logs = [
        parse_events(
            synthetic_capture(
                role,
                fixture_log(
                    role,
                    exhaust_one_cell_with_viewed_opening if role == "pro" else None,
                ),
            ),
            role,
        )
        for role in ("pro", "normal", "fast")
    ]
    exhausted_report = build_report(exhausted_logs)
    require(exhausted_report["pilot_pass"] is False, "quarantine-exhausted cell passed")
    require(
        exhausted_report["v1_viewed_content_quarantine"]["excluded_candidate_bundles"]
        == 3,
        "quarantine-exhausted fixture exclusion count",
    )
    require(
        any(
            violation
            == "insufficient_cell_bundles:duel=0:variant=0:panel=0:actual=0:required=2"
            for violation in exhausted_report["violations"]
        ),
        "post-quarantine cell exhaustion did not fail closed",
    )

    all_candidates = [candidate for log in logs for candidate in log.candidates]
    forward = solve_slots(make_pair_slots(all_candidates), PRIMARY_PAIR_TRIAL_CAP)
    reversed_result = solve_slots(
        make_pair_slots(list(reversed(all_candidates))),
        PRIMARY_PAIR_TRIAL_CAP,
    )
    require(
        forward.status == reversed_result.status == "solved"
        and selection_digest(forward) == selection_digest(reversed_result)
        and forward.pair_trials == reversed_result.pair_trials,
        "input reversal changed solver output",
    )

    harness = (
        "test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; "
        "999 filtered out; finished in 0.01s"
    )
    missing_harness = fixture_log("pro").decode("utf-8").replace(harness + "\n", "").encode()
    expect_error(
        lambda: parse_events(synthetic_capture("pro", missing_harness), "pro"),
        "missing Cargo harness result was accepted",
    )
    failed_harness = fixture_log("pro").decode("utf-8").replace(
        harness,
        "test result: FAILED. 0 passed; 1 failed",
    ).encode()
    expect_error(
        lambda: parse_events(synthetic_capture("pro", failed_harness), "pro"),
        "failed Cargo harness result was accepted",
    )
    duplicate_harness = fixture_log("pro") + (harness + "\n").encode()
    expect_error(
        lambda: parse_events(synthetic_capture("pro", duplicate_harness), "pro"),
        "duplicate Cargo harness result was accepted",
    )

    unknown = fixture_log("pro") + b"DENSE_PARETO_JOINT_SOURCE_UNKNOWN_V2 {}\n"
    expect_error(
        lambda: parse_events(synthetic_capture("pro", unknown), "pro"),
        "unknown structured record was accepted",
    )
    duplicate_key = fixture_log("pro").replace(
        b'"schema_version":2',
        b'"schema_version":2,"schema_version":2',
        1,
    )
    expect_error(
        lambda: parse_events(synthetic_capture("pro", duplicate_key), "pro"),
        "duplicate structured key was accepted",
    )
    extra_field = mutate_first_record(
        fixture_log("pro"),
        CANDIDATE_PREFIX,
        lambda row: row.__setitem__("root_rank", 1),
    )
    expect_error(
        lambda: parse_events(synthetic_capture("pro", extra_field), "pro"),
        "forbidden/unknown candidate field was accepted",
    )

    reordered_lines = fixture_log("pro").decode("utf-8").splitlines()
    candidate_line_indices = [
        index for index, line in enumerate(reordered_lines) if line.startswith(CANDIDATE_PREFIX)
    ]
    left, right = candidate_line_indices[:2]
    reordered_lines[left], reordered_lines[right] = reordered_lines[right], reordered_lines[left]
    reordered = ("\n".join(reordered_lines) + "\n").encode()
    expect_error(
        lambda: parse_events(synthetic_capture("pro", reordered), "pro"),
        "noncanonical candidate emission order was accepted",
    )

    wrong_canonical = mutate_first_record(
        fixture_log("pro"),
        CANDIDATE_PREFIX,
        lambda row: row.__setitem__(
            "canonical_source_fen",
            fixture_fen(row["variant_index"], "w", 999_999),
        ),
    )
    expect_error(
        lambda: parse_events(synthetic_capture("pro", wrong_canonical), "pro"),
        "plausible but incorrect canonical source board was accepted",
    )

    multiplicity_tamper = mutate_first_record(
        fixture_log("pro"),
        CANDIDATE_PREFIX,
        lambda row: (
            row.__setitem__("resource_bucket_multiplicity", 2),
            row.__setitem__("source_identity_fnv64", source_identity(row)),
        ),
    )
    expect_error(
        lambda: parse_events(synthetic_capture("pro", multiplicity_tamper), "pro"),
        "resource-bucket multiplicity tamper was accepted",
    )

    self_test_v1_collision()
    self_test_backtracking_and_caps()
    self_test_resource_domains()

    # A two-bundle cell passes the local cardinality gate but fails strong
    # deletion resilience when both candidates share the target opening key.
    resilience_candidates = [
        solver_candidate(0, 0, 0, 0, "r0", "resilience-loss-0"),
        solver_candidate(0, 0, 0, 1, "r1", "resilience-loss-1"),
        solver_candidate(0, 0, 1, 0, "r1", "resilience-save-0"),
        solver_candidate(0, 0, 1, 1, "r0", "resilience-save-1"),
    ]
    resilience_slots = make_pair_slots_for_keys(resilience_candidates, [(0, 0)])
    resilience_primary = solve_slots(resilience_slots, 100)
    require(resilience_primary.status == "solved", "resilience-failure fixture primary solve")
    target = flatten_selection(resilience_primary)[0]
    require(
        solve_slots(resilience_slots, 100, forbidden=target.bundle).status
        == "proven_infeasible",
        "resource-bundle deletion resilience failure was not detected",
    )

    previous = Path.cwd()
    with tempfile.TemporaryDirectory() as directory:
        os.chdir(directory)
        try:
            Path("target/experiment-runs").mkdir(parents=True)
            Path("real.log").write_bytes(b"fixture")
            os.symlink("real.log", "linked.log")
            expect_error(
                lambda: read_stable_bytes(Path("linked.log"), "symlink fixture"),
                "symlink input was accepted",
            )
            os.mkfifo("fifo.log")
            expect_error(
                lambda: read_stable_bytes(Path("fifo.log"), "FIFO fixture"),
                "FIFO input was accepted",
            )
            exclusive_atomic_write(Path("target/experiment-runs/report.json"), b"{}\n")
            expect_error(
                lambda: exclusive_atomic_write(
                    Path("target/experiment-runs/report.json"), b"{}\n"
                ),
                "existing output was overwritten",
            )
            os.symlink("report.json", "target/experiment-runs/linked-output.json")
            expect_error(
                lambda: exclusive_atomic_write(
                    Path("target/experiment-runs/linked-output.json"), b"{}\n"
                ),
                "symlink output was accepted",
            )
        finally:
            os.chdir(previous)
    print("automove dense-Pareto joint source v2 summarizer self-test: ok")


def main(argv: Sequence[str] | None = None) -> int:
    validate_v1_viewed_content_blacklist()
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

    captures = [
        read_stable_bytes(path, f"{role} log")
        for role, path in zip(("pro", "normal", "fast"), input_paths)
    ]
    identities = {(capture.device, capture.inode) for capture in captures}
    require(len(identities) == 3, "input paths must not name the same file or hardlink")
    logs = [
        parse_events(capture, role)
        for role, capture in zip(("pro", "normal", "fast"), captures)
    ]
    report = build_report(logs)
    raw = (canonical_json(report) + "\n").encode("utf-8")
    exclusive_atomic_write(output_path, raw)
    sys.stdout.buffer.write(raw)
    return report_exit_code(report)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except JointSourceError as error:
        print(f"automove dense-Pareto joint source v2 error: {error}", file=sys.stderr)
        raise SystemExit(2)
