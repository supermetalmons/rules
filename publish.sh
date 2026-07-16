#!/bin/bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${script_dir}"

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

registry_version_state() {
    local package_name="$1"
    local versions_json
    local state

    if ! versions_json="$(npm view "${package_name}" versions --json)"; then
        echo "Could not read published versions for ${package_name}." >&2
        return 1
    fi

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
    local normalized_tags

    if ! tags_json="$(npm view "${package_name}" dist-tags --json)"; then
        echo "Could not read dist-tags for ${package_name}." >&2
        return 1
    fi

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

latest_from_dist_tags() {
    node -e '
        const tags = JSON.parse(process.argv[1]);
        if (Object.prototype.hasOwnProperty.call(tags, "latest")) {
            process.stdout.write(tags.latest);
        }
    ' "$1"
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

for package_name in mons-web mons-rust; do
    if ! require_release_missing "${package_name}"; then
        exit 1
    fi
    if ! package_dist_tags="$(registry_dist_tags "${package_name}")"; then
        exit 1
    fi
    if ! require_release_newer_than_latest "${package_name}" "${package_dist_tags}"; then
        exit 1
    fi
done

echo "Checking TypeScript formatting, lint, and types..."
npm run format:check
npm run lint
npm run typecheck
npm run assert:pure

echo "Running focused tests..."
npm test

echo "Checking deterministic automove parity..."
npm run test:automove-parity

echo "Replaying the canonical rules corpus..."
./scripts/run-rules-tests.sh

echo "Checking and replaying the complete-games corpus..."
node ./scripts/check-complete-games.cjs
npm run test:complete-games

echo "Building and checking npm packages for ${release_version}..."
npm run build
node ./scripts/assert-release-npm-package.cjs pkg/web web
node ./scripts/assert-release-npm-package.cjs pkg/node node

echo "Running npm publication dry runs..."
(
    cd pkg/web
    npm publish --dry-run --access public --tag latest
)
(
    cd pkg/node
    npm publish --dry-run --access public --tag latest
)

if [ "${check_only}" = true ]; then
    echo "Release checks passed; --check-only skipped npm publish."
    exit 0
fi

publish_lock_remote="${MONS_PUBLISH_LOCK_REMOTE:-origin}"
publish_lock_ref="refs/tags/mons-npm-publish-lock"
publish_lock_oid=""
publish_lock_acquired=false
mons_web_dist_tags=""
mons_web_previous_latest=""
mons_rust_dist_tags=""
mons_rust_previous_latest=""
mons_web_publish_started=false
mons_web_publish_completed=false
mons_rust_publish_started=false
mons_rust_publish_completed=false

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
The packages' registry state is unaffected, but future releases will remain blocked.
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

print_latest_recovery() {
    local package_name="$1"
    local previous_latest="$2"
    local dist_tags="$3"

    printf '\n%s dist-tags before this publication attempt:\n  %s\n' "${package_name}" "${dist_tags}"
    printf 'If its current latest tag still points to %s, run:\n' "${release_version}"
    if [ -n "${previous_latest}" ]; then
        printf '  if [ "$(npm view %s dist-tags.latest)" = "%s" ]; then npm dist-tag add "%s@%s" latest; fi\n' \
            "${package_name}" "${release_version}" "${package_name}" "${previous_latest}"
    else
        printf '  if [ "$(npm view %s dist-tags.latest)" = "%s" ]; then npm dist-tag rm %s latest; fi\n' \
            "${package_name}" "${release_version}" "${package_name}"
    fi
}

publication_failed() {
    local status="$1"
    trap - EXIT HUP INT TERM
    set +e
    {
        cat <<EOF
Publication did not complete. Inspect the registry before retrying:
  npm view mons-web@${release_version} version
  npm view mons-rust@${release_version} version
  npm view mons-web dist-tags.latest
  npm view mons-rust dist-tags.latest

Retry a missing package to latest only if ${release_version} is still newer than
that package's current latest tag. Never retry to latest when the current latest is equal or newer;
prepare a new, higher release version instead.
EOF
        if [ "${mons_web_publish_completed}" = true ]; then
            print_latest_recovery mons-web "${mons_web_previous_latest}" "${mons_web_dist_tags}"
        elif [ "${mons_web_publish_started}" = true ]; then
            printf '\nThe mons-web publish command started but npm did not confirm completion.\n'
            printf 'No automatic dist-tag recovery is shown because registry changes cannot be safely attributed.\n'
        fi
        if [ "${mons_rust_publish_completed}" = true ]; then
            print_latest_recovery mons-rust "${mons_rust_previous_latest}" "${mons_rust_dist_tags}"
        elif [ "${mons_rust_publish_started}" = true ]; then
            printf '\nThe mons-rust publish command started but npm did not confirm completion.\n'
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

echo "Rechecking both package registry states and snapshotting their dist-tags..."
if ! require_release_missing mons-web; then
    exit 1
fi
if ! mons_web_dist_tags="$(registry_dist_tags mons-web)"; then
    exit 1
fi
if ! require_release_newer_than_latest mons-web "${mons_web_dist_tags}"; then
    exit 1
fi
mons_web_previous_latest="$(latest_from_dist_tags "${mons_web_dist_tags}")"

if ! require_release_missing mons-rust; then
    exit 1
fi
if ! mons_rust_dist_tags="$(registry_dist_tags mons-rust)"; then
    exit 1
fi
if ! require_release_newer_than_latest mons-rust "${mons_rust_dist_tags}"; then
    exit 1
fi
mons_rust_previous_latest="$(latest_from_dist_tags "${mons_rust_dist_tags}")"

echo "Publishing mons-web@${release_version} to latest..."
mons_web_publish_started=true
(
    cd pkg/web
    npm publish --access public --tag latest
)
mons_web_publish_completed=true

echo "Rechecking mons-rust registry state and refreshing its dist-tags..."
if ! require_release_missing mons-rust; then
    exit 1
fi
if ! mons_rust_dist_tags="$(registry_dist_tags mons-rust)"; then
    exit 1
fi
if ! require_release_newer_than_latest mons-rust "${mons_rust_dist_tags}"; then
    exit 1
fi
mons_rust_previous_latest="$(latest_from_dist_tags "${mons_rust_dist_tags}")"

echo "Publishing mons-rust@${release_version} to latest..."
mons_rust_publish_started=true
(
    cd pkg/node
    npm publish --access public --tag latest
)
mons_rust_publish_completed=true

trap - EXIT HUP INT TERM

if ! release_publish_lock; then
    echo "Both packages were published, but the npm publication lock requires manual cleanup." >&2
    exit 1
fi

echo "Published mons-web@${release_version} and mons-rust@${release_version} to latest."
