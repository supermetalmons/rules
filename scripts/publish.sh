#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
cd "${repo_root}"

check_only=false
if [ "$#" -eq 1 ] && [ "$1" = "--check-only" ]; then
    check_only=true
elif [ "$#" -ne 0 ]; then
    echo "usage: $0 [--check-only]"
    exit 2
fi

if [ "${check_only}" = false ] && \
    { ! git diff --quiet || ! git diff --cached --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; }; then
    echo "Publish requires a clean worktree. Commit or remove all changes first."
    exit 1
fi

release_version="$(node -p "require('./package.json').version")"
if [ -z "${release_version}" ]; then
    echo "Could not read the root npm package version."
    exit 1
fi

validate_release_version() {
    node -e '
        const semver = require("semver");
        const version = process.argv[1];
        if (semver.valid(version) !== version) {
            console.error(`Release version ${JSON.stringify(version)} is not canonical SemVer.`);
            process.exit(1);
        }
        if (semver.prerelease(version) !== null) {
            console.error(`Release version ${version} is a prerelease and cannot be published to latest.`);
            process.exit(1);
        }
    ' "${release_version}"
}

if ! validate_release_version; then
    exit 1
fi

if [ "${check_only}" = false ]; then
    echo "Checking npm authentication..."
    npm whoami >/dev/null
fi

release_package_name="mons-rules"

registry_response_is_not_found() {
    node -e '
        try {
            const response = JSON.parse(process.argv[1]);
            if (response?.error?.code === "E404") {
                process.exit(0);
            }
        } catch {
            // The caller reports malformed or unavailable registry data.
        }
        process.exit(1);
    ' "$1"
}

print_registry_failure_details() {
    local response="$1"
    local stderr_file="$2"

    if [ -s "${stderr_file}" ]; then
        cat "${stderr_file}" >&2
    fi
    if [ -n "${response}" ]; then
        printf '%s\n' "${response}" >&2
    fi
}

registry_version_state() {
    local package_name="$1"
    local versions_json
    local stderr_file
    local state

    if ! stderr_file="$(mktemp "${TMPDIR:-/tmp}/mons-rules-npm-view.XXXXXX")"; then
        echo "Could not create temporary storage for the ${package_name} registry response." >&2
        return 1
    fi

    if ! versions_json="$(npm view "${package_name}" versions --json 2>"${stderr_file}")"; then
        if registry_response_is_not_found "${versions_json}"; then
            rm -f "${stderr_file}"
            printf '%s\n' "missing"
            return 0
        fi
        print_registry_failure_details "${versions_json}" "${stderr_file}"
        rm -f "${stderr_file}"
        echo "Could not read published versions for ${package_name}." >&2
        return 1
    fi
    if [ -s "${stderr_file}" ]; then
        cat "${stderr_file}" >&2
    fi
    rm -f "${stderr_file}"

    if ! state="$(node -e '
        try {
            const parsed = JSON.parse(process.argv[1]);
            const versions = typeof parsed === "string" ? [parsed] : parsed;
            if (!Array.isArray(versions) || !versions.every((version) => typeof version === "string")) {
                throw new Error("expected a version string or an array of version strings");
            }
            process.stdout.write(versions.includes(process.argv[2]) ? "published" : "missing");
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
    ' "${versions_json}" "${release_version}")"; then
        echo "Registry returned invalid version data for ${package_name}." >&2
        return 1
    fi

    case "${state}" in
        published|missing)
            printf '%s\n' "${state}"
            ;;
        *)
            echo "Registry returned an invalid version state for ${package_name}: ${state}" >&2
            return 1
            ;;
    esac
}

require_release_missing() {
    local package_name="$1"
    local state

    if ! state="$(registry_version_state "${package_name}")"; then
        return 1
    fi

    if [ "${state}" = "published" ]; then
        echo "${package_name}@${release_version} is already published." >&2
        return 1
    fi
}

registry_dist_tags() {
    local package_name="$1"
    local tags_json
    local stderr_file
    local normalized_tags

    if ! stderr_file="$(mktemp "${TMPDIR:-/tmp}/mons-rules-npm-view.XXXXXX")"; then
        echo "Could not create temporary storage for the ${package_name} registry response." >&2
        return 1
    fi

    if ! tags_json="$(npm view "${package_name}" dist-tags --json 2>"${stderr_file}")"; then
        if registry_response_is_not_found "${tags_json}"; then
            rm -f "${stderr_file}"
            printf '%s\n' "{}"
            return 0
        fi
        print_registry_failure_details "${tags_json}" "${stderr_file}"
        rm -f "${stderr_file}"
        echo "Could not read dist-tags for ${package_name}." >&2
        return 1
    fi
    if [ -s "${stderr_file}" ]; then
        cat "${stderr_file}" >&2
    fi
    rm -f "${stderr_file}"

    if ! normalized_tags="$(node -e '
        try {
            const tags = JSON.parse(process.argv[1]);
            if (tags === null || Array.isArray(tags) || typeof tags !== "object") {
                throw new Error("expected an object");
            }
            if (!Object.values(tags).every((version) => typeof version === "string" && version.length > 0)) {
                throw new Error("expected every dist-tag value to be a non-empty version string");
            }
            process.stdout.write(JSON.stringify(tags));
        } catch (error) {
            console.error(error.message);
            process.exit(1);
        }
    ' "${tags_json}")"; then
        echo "Registry returned invalid dist-tag data for ${package_name}." >&2
        return 1
    fi

    printf '%s\n' "${normalized_tags}"
}

require_release_newer_than_latest() {
    local package_name="$1"
    local dist_tags="$2"

    node -e '
        const semver = require("semver");
        const packageName = process.argv[1];
        const releaseVersion = process.argv[2];
        const tags = JSON.parse(process.argv[3]);

        for (const [tag, version] of Object.entries(tags)) {
            if (semver.valid(version) !== version) {
                console.error(
                    `${packageName} dist-tag ${JSON.stringify(tag)} has a noncanonical SemVer value: ${JSON.stringify(version)}.`,
                );
                process.exit(1);
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(tags, "latest") &&
            !semver.gt(releaseVersion, tags.latest)
        ) {
            console.error(
                `${packageName}@${releaseVersion} must be newer than its current latest version ${tags.latest}.`,
            );
            process.exit(1);
        }
    ' "${package_name}" "${release_version}" "${dist_tags}"
}

if ! require_release_missing "${release_package_name}"; then
    exit 1
fi
if ! package_dist_tags="$(registry_dist_tags "${release_package_name}")"; then
    exit 1
fi
if ! require_release_newer_than_latest "${release_package_name}" "${package_dist_tags}"; then
    exit 1
fi

echo "Running the complete project validation..."
npm run check

echo "Running the npm publication dry run..."
# The package script is intentionally named "publish", which is also an npm
# lifecycle hook. Skip lifecycle scripts here so npm does not re-enter this script.
npm publish --dry-run --access public --tag latest --ignore-scripts

if [ "${check_only}" = true ]; then
    echo "Release checks passed; --check-only skipped npm publish."
    exit 0
fi

publish_lock_remote="${MONS_PUBLISH_LOCK_REMOTE:-origin}"
publish_lock_ref="refs/tags/mons-npm-publish-lock"
publish_lock_oid=""
publish_lock_acquired=false
release_dist_tags=""
release_publish_started=false

print_stale_lock_recovery() {
    local lock_oid="$1"

    cat <<EOF
Another release may still be running. Inspect the lock owner with:
  git fetch --no-tags ${publish_lock_remote} ${publish_lock_ref}
  git show --no-patch FETCH_HEAD

Only after confirming that no release is active, remove this exact unchanged lock with:
  git push --force-with-lease=${publish_lock_ref}:${lock_oid} ${publish_lock_remote} :${publish_lock_ref}
EOF
}

release_publish_lock() {
    if [ "${publish_lock_acquired}" = false ]; then
        return 0
    fi

    if git push --porcelain \
        --force-with-lease="${publish_lock_ref}:${publish_lock_oid}" \
        "${publish_lock_remote}" ":${publish_lock_ref}"; then
        publish_lock_acquired=false
        return 0
    fi

    cat >&2 <<EOF
Could not release the npm publication lock ${publish_lock_ref} on ${publish_lock_remote}.
The package's registry state is unaffected, but future releases will remain blocked.
EOF
    print_stale_lock_recovery "${publish_lock_oid}" >&2
    return 1
}

acquire_publish_lock() {
    local head_oid
    local tree_oid
    local lock_nonce
    local remote_line
    local remote_oid
    local push_succeeded=false

    if ! git check-ref-format "${publish_lock_ref}" >/dev/null; then
        echo "Invalid npm publication lock ref: ${publish_lock_ref}" >&2
        return 1
    fi
    if ! head_oid="$(git rev-parse --verify HEAD)" || \
        ! tree_oid="$(git rev-parse --verify 'HEAD^{tree}')"; then
        echo "Could not resolve HEAD for the npm publication lock." >&2
        return 1
    fi
    if ! lock_nonce="$(node -p "require('node:crypto').randomUUID()")"; then
        echo "Could not create a unique npm publication lock owner." >&2
        return 1
    fi
    if ! publish_lock_oid="$(
        printf 'Temporary mons npm publication lock\n\nrelease: %s\nowner: %s\n' \
            "${release_version}" "${lock_nonce}" |
            git -c user.name='mons npm publisher' \
                -c user.email='npm-publisher@invalid' \
                commit-tree "${tree_oid}" -p "${head_oid}"
    )"; then
        echo "Could not create the npm publication lock object." >&2
        return 1
    fi

    # npm dist-tags do not offer compare-and-swap. Creating this fixed remote ref
    # with an empty expected value is the cross-host CAS used by every compliant
    # publisher. MONS_PUBLISH_LOCK_REMOTE may name another shared clone remote,
    # but every publisher must use the same repository and lock ref.
    if git push --porcelain \
        --force-with-lease="${publish_lock_ref}:" \
        "${publish_lock_remote}" "${publish_lock_oid}:${publish_lock_ref}"; then
        push_succeeded=true
        publish_lock_acquired=true
    fi

    if ! remote_line="$(git ls-remote --refs "${publish_lock_remote}" "${publish_lock_ref}")"; then
        echo "Could not verify the npm publication lock on ${publish_lock_remote}." >&2
        if [ "${push_succeeded}" = true ]; then
            release_publish_lock || true
        fi
        return 1
    fi
    read -r remote_oid _ <<< "${remote_line}"

    if [ "${remote_oid:-}" = "${publish_lock_oid}" ]; then
        publish_lock_acquired=true
        return 0
    fi

    if [ "${push_succeeded}" = true ]; then
        echo "The npm publication lock changed while it was being verified." >&2
        release_publish_lock || true
    else
        echo "Could not acquire the npm publication lock ${publish_lock_ref} on ${publish_lock_remote}." >&2
    fi
    if [ -n "${remote_oid:-}" ]; then
        print_stale_lock_recovery "${remote_oid}" >&2
    else
        echo "No lock owner could be read; inspect the remote before retrying." >&2
    fi
    return 1
}

publication_failed() {
    local status="$1"
    trap - EXIT HUP INT TERM
    set +e
    {
        cat <<EOF
Publication did not complete. Inspect the registry before retrying:
  npm view ${release_package_name}@${release_version} version
  npm view ${release_package_name} dist-tags.latest

Retry the missing package to latest only if ${release_version} is still newer than
its current latest tag. Never retry to latest when the current latest is equal or
newer; prepare a new, higher release version instead.
EOF
        if [ "${release_publish_started}" = true ]; then
            printf '\nThe %s publish command started but npm did not confirm completion.\n' \
                "${release_package_name}"
            printf 'No automatic dist-tag recovery is shown because registry changes cannot be safely attributed.\n'
        fi
    } >&2
    release_publish_lock || true
    exit "${status}"
}

echo "Acquiring the cross-host npm publication lock..."
if ! acquire_publish_lock; then
    exit 1
fi

trap 'status=$?; publication_failed "${status}"' EXIT
trap 'publication_failed 129' HUP
trap 'publication_failed 130' INT
trap 'publication_failed 143' TERM

echo "Rechecking the package registry state and validating its dist-tags..."
if ! require_release_missing "${release_package_name}"; then
    exit 1
fi
if ! release_dist_tags="$(registry_dist_tags "${release_package_name}")"; then
    exit 1
fi
if ! require_release_newer_than_latest "${release_package_name}" "${release_dist_tags}"; then
    exit 1
fi
echo "Publishing ${release_package_name}@${release_version} to latest..."
release_publish_started=true
npm publish --access public --tag latest --ignore-scripts

trap - EXIT HUP INT TERM

if ! release_publish_lock; then
    echo "${release_package_name}@${release_version} was published, but the npm publication lock requires manual cleanup." >&2
    exit 1
fi

echo "Published ${release_package_name}@${release_version} to latest."
