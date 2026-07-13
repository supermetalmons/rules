#!/bin/bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
    set -- pkg/web pkg/node
fi

if [ ! -f Cargo.toml ]; then
    echo "release package surface check must run from the repo root"
    exit 1
fi

cargo_version=$(sed -n 's/^version = "\(.*\)"/\1/p' Cargo.toml | head -n 1)
if [ -z "${cargo_version}" ]; then
    echo "could not read Cargo.toml package version"
    exit 1
fi

for package_dir in "$@"; do
    if [ ! -d "${package_dir}" ]; then
        echo "release package directory missing: ${package_dir}"
        exit 1
    fi

    package_json="${package_dir}/package.json"
    if [ ! -f "${package_json}" ]; then
        echo "package.json missing from ${package_dir}"
        exit 1
    fi

    package_version=$(sed -n 's/.*"version": "\([^"]*\)".*/\1/p' "${package_json}" | head -n 1)
    if [ "${package_version}" != "${cargo_version}" ]; then
        echo "${package_dir} version ${package_version} does not match Cargo.toml ${cargo_version}"
        exit 1
    fi

    case "$(basename "${package_dir}")" in
        web)
            expected_name="mons-web"
            ;;
        node)
            expected_name="mons-rust"
            ;;
        *)
            expected_name=""
            ;;
    esac

    if [ -n "${expected_name}" ]; then
        package_name=$(sed -n 's/.*"name": "\([^"]*\)".*/\1/p' "${package_json}" | head -n 1)
        if [ "${package_name}" != "${expected_name}" ]; then
            echo "${package_dir} package name ${package_name} does not match ${expected_name}"
            exit 1
        fi
    fi

    package_files=()
    while IFS= read -r package_file; do
        package_files+=("${package_file}")
    done < <(
        find "${package_dir}" -type f \( \
            -name '*.js' -o \
            -name '*.ts' -o \
            -name '*.wasm' -o \
            -name '*.json' \
        \)
    )

    if [ "${#package_files[@]}" -eq 0 ]; then
        echo "no release package files found under ${package_dir}"
        exit 1
    fi

    if ! find "${package_dir}" -maxdepth 1 -type f -name '*.wasm' | grep -q .; then
        echo "no wasm artifact found in ${package_dir}"
        exit 1
    fi

    if ! grep -aEq 'smartAutomove' "${package_files[@]}"; then
        echo "smartAutomove export missing from ${package_dir}"
        exit 1
    fi

    forbidden_pattern='automove_experiments|smart_automove_pool_tests|PRO_POLICY_|PRO_PROFILE_|PRO_PROMOTION_|PRO_V4_ROOT_POOL|SMART_PRO_|AUTOMOVE_OUTCOME_CORPUS|post_followup_payload_profile|post_followup_role_profile|post_score_term_profile'
    leaked_files=$(grep -aEl "${forbidden_pattern}" "${package_files[@]}" || true)
    if [ -n "${leaked_files}" ]; then
        echo "test-only automove diagnostics leaked into ${package_dir}:"
        echo "${leaked_files}"
        exit 1
    fi

    case "$(basename "${package_dir}")" in
        web)
            package_target="web"
            ;;
        node)
            package_target="node"
            ;;
        *)
            echo "unsupported package directory: ${package_dir}"
            exit 1
            ;;
    esac

    node ./scripts/assert-release-npm-package.cjs "${package_dir}" "${package_target}"
done

echo "release package surface check passed for: $*"
