import {
  spawn,
  spawnSync,
  type ChildProcess,
  type SpawnSyncReturns,
} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PACKAGE_NAMES = ["mons-rules"] as const;
type PackageName = (typeof PACKAGE_NAMES)[number];

const REGISTRY_NOT_FOUND = Object.freeze({
  error: Object.freeze({ code: "E404" }),
});

type PublishHarnessOptions = {
  readonly version?: string;
  readonly versions?: Partial<Record<PackageName, readonly unknown[]>>;
  readonly distTags?: Partial<Record<PackageName, readonly unknown[]>>;
  readonly existingLockOid?: string;
  readonly lockReleaseStatus?: number;
  readonly publishStatuses?: Partial<Record<PackageName, number>>;
};

type AsyncPublishResult = {
  readonly status: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
};

type PublishHarness = {
  gitLogPath: string;
  logPath: string;
  root: string;
  calls: () => string;
  gitCalls: () => string;
  run: (args: string[], whoamiStatus?: number) => SpawnSyncReturns<string>;
  start: (
    args: string[],
    environment?: Readonly<Record<string, string>>,
  ) => {
    child: ChildProcess;
    completed: Promise<AsyncPublishResult>;
  };
};

const OTHER_LOCK_OID = "2222222222222222222222222222222222222222";

function writeExecutable(filePath: string, source: string): void {
  fs.writeFileSync(filePath, source);
  fs.chmodSync(filePath, 0o755);
}

function writeRegistryResponses(
  responseDir: string,
  kind: "versions" | "dist-tags",
  packageName: PackageName,
  responses: readonly unknown[] | undefined,
): void {
  const defaultResponse = kind === "versions" ? [] : { latest: "0.1.0" };
  fs.writeFileSync(
    path.join(responseDir, `${kind}-${packageName}-default`),
    `${JSON.stringify(defaultResponse)}\n`,
  );
  responses?.forEach((response, index) => {
    fs.writeFileSync(
      path.join(responseDir, `${kind}-${packageName}-${index + 1}`),
      `${JSON.stringify(response)}\n`,
    );
  });
}

function createPublishHarness(
  options: PublishHarnessOptions = {},
): PublishHarness {
  const releaseVersion = options.version ?? "0.2.0";
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mons-publish-test-"));
  const binDir = path.join(root, "bin");
  const scriptsDir = path.join(root, "scripts");
  const responseDir = path.join(root, "registry-responses");
  const logPath = path.join(root, "npm-calls.log");
  const gitLogPath = path.join(root, "git-calls.log");
  const lockDir = path.join(root, "remote-publish-lock");

  fs.mkdirSync(binDir);
  fs.mkdirSync(scriptsDir);
  fs.mkdirSync(responseDir);
  fs.copyFileSync(
    path.resolve("scripts/publish.sh"),
    path.join(scriptsDir, "publish.sh"),
  );
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ name: "mons-rules", version: releaseVersion })}\n`,
  );

  for (const packageName of PACKAGE_NAMES) {
    writeRegistryResponses(
      responseDir,
      "versions",
      packageName,
      options.versions?.[packageName],
    );
    writeRegistryResponses(
      responseDir,
      "dist-tags",
      packageName,
      options.distTags?.[packageName],
    );
  }

  if (options.existingLockOid !== undefined) {
    fs.mkdirSync(lockDir);
    fs.writeFileSync(path.join(lockDir, "oid"), options.existingLockOid);
  }

  writeExecutable(
    path.join(binDir, "git"),
    `#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >> "\${PUBLISH_TEST_GIT_LOG}"

lock_ref="refs/tags/mons-npm-publish-lock"

if [ "\${1:-}" = "diff" ] || [ "\${1:-}" = "ls-files" ] || [ "\${1:-}" = "check-ref-format" ]; then
    exit 0
fi
if [ "\${1:-}" = "rev-parse" ]; then
    printf '%s\n' "1111111111111111111111111111111111111111"
    exit 0
fi
if [ "\${1:-}" = "-c" ]; then
    printf '%040d\n' "\${PPID}"
    exit 0
fi
if [ "\${1:-}" = "ls-remote" ]; then
    if [ -f "\${PUBLISH_TEST_LOCK_DIR}/oid" ]; then
        printf '%s\t%s\n' "$(cat "\${PUBLISH_TEST_LOCK_DIR}/oid")" "\${lock_ref}"
    fi
    exit 0
fi
if [ "\${1:-}" = "push" ]; then
    last_argument="\${!#}"
    if [ "\${last_argument}" = ":\${lock_ref}" ]; then
        if [ "\${PUBLISH_TEST_LOCK_RELEASE_STATUS:-0}" -ne 0 ]; then
            exit "\${PUBLISH_TEST_LOCK_RELEASE_STATUS}"
        fi
        expected_oid=""
        for argument in "$@"; do
            case "\${argument}" in
                --force-with-lease=\${lock_ref}:*)
                    expected_oid="\${argument#--force-with-lease=\${lock_ref}:}"
                    ;;
            esac
        done
        if [ ! -f "\${PUBLISH_TEST_LOCK_DIR}/oid" ] ||
            [ "$(cat "\${PUBLISH_TEST_LOCK_DIR}/oid")" != "\${expected_oid}" ]; then
            exit 1
        fi
        mv "\${PUBLISH_TEST_LOCK_DIR}/oid" "\${PUBLISH_TEST_LOCK_DIR}.released-\${PPID}"
        rmdir "\${PUBLISH_TEST_LOCK_DIR}"
        exit 0
    fi

    lock_oid="\${last_argument%%:*}"
    if ! mkdir "\${PUBLISH_TEST_LOCK_DIR}" 2>/dev/null; then
        exit 1
    fi
    printf '%s\n' "\${lock_oid}" > "\${PUBLISH_TEST_LOCK_DIR}/oid"
    exit 0
fi

exit 0
`,
  );
  writeExecutable(
    path.join(binDir, "npm"),
    `#!/bin/bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${PUBLISH_TEST_LOG}"

next_registry_response() {
    local kind="$1"
    local package_name="$2"
    local counter_path="\${PUBLISH_TEST_RESPONSE_DIR}/\${kind}-\${package_name}.count"
    local count=0
    if [ -f "\${counter_path}" ]; then
        count="$(cat "\${counter_path}")"
    fi
    count=$((count + 1))
    printf '%s\\n' "\${count}" > "\${counter_path}"

    local response_path="\${PUBLISH_TEST_RESPONSE_DIR}/\${kind}-\${package_name}-\${count}"
    if [ ! -f "\${response_path}" ]; then
        response_path="\${PUBLISH_TEST_RESPONSE_DIR}/\${kind}-\${package_name}-default"
    fi
    response="$(cat "\${response_path}")"
    printf '%s\n' "\${response}"
    if node -e '
        const response = JSON.parse(process.argv[1]);
        const code = response?.error?.code;
        if (code) {
            console.error("npm error code " + code);
            process.exit(0);
        }
        process.exit(1);
    ' "\${response}"; then
        return 1
    fi
}

if [ "\${1:-}" = "whoami" ]; then
    exit "\${PUBLISH_TEST_WHOAMI_STATUS:-0}"
fi
if [ "\${1:-}" = "view" ] && [ "\${3:-}" = "versions" ]; then
    next_registry_response versions "$2"
fi
if [ "\${1:-}" = "view" ] && [ "\${3:-}" = "dist-tags" ]; then
    next_registry_response dist-tags "$2"
fi
if [ "\${1:-}" = "publish" ]; then
    if [ "$PWD" != "\${PUBLISH_TEST_PACKAGE_DIR}" ]; then
        printf 'npm publish ran from %s instead of %s\n' \
            "$PWD" "\${PUBLISH_TEST_PACKAGE_DIR}" >&2
        exit 91
    fi
    package_name="$(node -p "require('./package.json').name" 2>/dev/null)" || {
        printf 'npm publish could not read the package manifest\n' >&2
        exit 92
    }
    if [ "\${package_name}" != "mons-rules" ]; then
        printf 'npm publish received package %s instead of mons-rules\n' \
            "\${package_name}" >&2
        exit 93
    fi
fi
if [ "$*" = "publish --access public --tag latest --ignore-scripts" ]; then
    if [ -n "\${PUBLISH_TEST_PUBLISH_GATE:-}" ]; then
        : > "\${PUBLISH_TEST_PUBLISH_GATE}.started"
        while [ ! -f "\${PUBLISH_TEST_PUBLISH_GATE}.release" ]; do
            sleep 0.01
        done
    fi
    exit "\${PUBLISH_TEST_PUBLISH_STATUS:-0}"
fi
`,
  );

  const environment = (
    whoamiStatus: number,
    overrides: Readonly<Record<string, string>> = {},
  ): NodeJS.ProcessEnv => ({
    ...process.env,
    NODE_PATH: path.resolve("node_modules"),
    PATH: `${binDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
    PUBLISH_TEST_GIT_LOG: gitLogPath,
    PUBLISH_TEST_LOCK_DIR: lockDir,
    PUBLISH_TEST_LOCK_RELEASE_STATUS: String(options.lockReleaseStatus ?? 0),
    PUBLISH_TEST_LOG: logPath,
    PUBLISH_TEST_PACKAGE_DIR: root,
    PUBLISH_TEST_RESPONSE_DIR: responseDir,
    PUBLISH_TEST_PUBLISH_STATUS: String(
      options.publishStatuses?.["mons-rules"] ?? 0,
    ),
    PUBLISH_TEST_WHOAMI_STATUS: String(whoamiStatus),
    ...overrides,
  });

  return {
    gitLogPath,
    logPath,
    root,
    calls: () =>
      fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "",
    gitCalls: () =>
      fs.existsSync(gitLogPath) ? fs.readFileSync(gitLogPath, "utf8") : "",
    run: (args, whoamiStatus = 0) =>
      spawnSync("/bin/bash", [path.join(scriptsDir, "publish.sh"), ...args], {
        cwd: root,
        encoding: "utf8",
        env: environment(whoamiStatus),
      }),
    start: (args, environmentOverrides = {}) => {
      const child = spawn(
        "/bin/bash",
        [path.join(scriptsDir, "publish.sh"), ...args],
        {
          cwd: root,
          env: environment(0, environmentOverrides),
        },
      );
      let stderr = "";
      let stdout = "";
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdout += chunk;
      });
      const completed = new Promise<AsyncPublishResult>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", (status, signal) => {
          resolve({ signal, status, stderr, stdout });
        });
      });
      return { child, completed };
    },
  };
}

function realPublishCalls(calls: string): string[] {
  return calls
    .split("\n")
    .filter(
      (call) =>
        call === "publish --access public --tag latest --ignore-scripts",
    );
}

async function waitForFile(filePath: string): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (!fs.existsSync(filePath)) {
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for ${filePath}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("release npm scripts", () => {
  it("exposes bump and relocated publish commands", () => {
    const manifest = JSON.parse(fs.readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(manifest.scripts?.["bump"]).toBe(
      "npm version patch --no-git-tag-version",
    );
    expect(manifest.scripts?.["publish"]).toBe("./scripts/publish.sh");
    expect(fs.existsSync("publish.sh")).toBe(false);
    expect(fs.existsSync("scripts/publish.sh")).toBe(true);
  });
});

describe("scripts/publish.sh", () => {
  it("runs check-only registry, validation, and dry-run steps without npm credentials", () => {
    const harness = createPublishHarness();
    try {
      const result = harness.run(["--check-only"], 73);
      expect(result.status, result.stderr).toBe(0);

      const calls = harness.calls();
      expect(calls).not.toContain("whoami");
      expect(calls).toContain("view mons-rules versions --json");
      expect(calls).toContain("view mons-rules dist-tags --json");
      expect(calls).toContain("run check");
      expect(
        calls.match(
          /publish --dry-run --access public --tag latest --ignore-scripts/g,
        ),
      ).toHaveLength(1);
      expect(harness.gitCalls()).not.toContain("commit-tree");
      expect(harness.gitCalls()).not.toContain(
        "refs/tags/mons-npm-publish-lock",
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("holds a leased remote lock while publishing a stable version", () => {
    const harness = createPublishHarness();
    try {
      const result = harness.run([]);
      expect(result.status, result.stderr).toBe(0);
      expect(realPublishCalls(harness.calls())).toHaveLength(1);
      expect(
        harness.calls().match(/view mons-rules dist-tags --json/g),
      ).toHaveLength(2);

      const gitCalls = harness.gitCalls();
      const acquiredOid =
        /--force-with-lease=refs\/tags\/mons-npm-publish-lock: origin ([0-9]{40}):refs\/tags\/mons-npm-publish-lock/u.exec(
          gitCalls,
        )?.[1];
      expect(acquiredOid).toBeDefined();
      expect(gitCalls).toContain(
        `--force-with-lease=refs/tags/mons-npm-publish-lock:${acquiredOid} origin :refs/tags/mons-npm-publish-lock`,
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("rejects publication while another host owns the remote lock", () => {
    const harness = createPublishHarness({ existingLockOid: OTHER_LOCK_OID });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(1);
      expect(realPublishCalls(harness.calls())).toHaveLength(0);
      expect(result.stderr).toContain(
        "Could not acquire the npm publication lock",
      );
      expect(result.stderr).toContain(
        `git fetch --no-tags origin refs/tags/mons-npm-publish-lock`,
      );
      expect(result.stderr).toContain(
        `--force-with-lease=refs/tags/mons-npm-publish-lock:${OTHER_LOCK_OID}`,
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("serializes concurrent publication processes with the shared lock", async () => {
    const harness = createPublishHarness();
    const publishGate = path.join(harness.root, "rules-publish-gate");
    const first = harness.start([], {
      PUBLISH_TEST_PUBLISH_GATE: publishGate,
    });
    try {
      await waitForFile(`${publishGate}.started`);

      const second = harness.run([]);
      expect(second.status).toBe(1);
      expect(second.stderr).toContain(
        "Could not acquire the npm publication lock",
      );

      fs.writeFileSync(`${publishGate}.release`, "");
      const firstResult = await first.completed;
      expect(firstResult.status, firstResult.stderr).toBe(0);
      expect(firstResult.signal).toBeNull();
    } finally {
      fs.writeFileSync(`${publishGate}.release`, "");
      if (first.child.exitCode === null && first.child.signalCode === null) {
        first.child.kill("SIGTERM");
      }
      await first.completed.catch(() => undefined);
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it.each([
    { label: "equal to", latest: "0.2.0" },
    { label: "older than", latest: "0.3.0" },
  ])("rejects a release $label the current latest", ({ latest }) => {
    const harness = createPublishHarness({
      distTags: { "mons-rules": [{ latest }] },
    });
    try {
      const result = harness.run(["--check-only"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `mons-rules@0.2.0 must be newer than its current latest version ${latest}.`,
      );
      expect(harness.calls()).not.toContain("run check");
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it.each([
    { label: "prerelease", version: "0.3.0-beta.1", message: "prerelease" },
    {
      label: "noncanonical version",
      version: "v0.3.0",
      message: "not canonical SemVer",
    },
  ])("rejects a $label before accessing npm", ({ version, message }) => {
    const harness = createPublishHarness({ version });
    try {
      const result = harness.run(["--check-only"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(harness.calls()).toBe("");
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("allows a package that does not have a latest tag", () => {
    const harness = createPublishHarness({
      distTags: {
        "mons-rules": [{ next: "0.3.0-beta.1" }],
      },
    });
    try {
      const result = harness.run(["--check-only"]);
      expect(result.status, result.stderr).toBe(0);
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("rejects malformed registry dist-tag versions", () => {
    const harness = createPublishHarness({
      distTags: {
        "mons-rules": [{ latest: "0.1.0", next: "v0.3.0" }],
      },
    });
    try {
      const result = harness.run(["--check-only"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'mons-rules dist-tag "next" has a noncanonical SemVer value: "v0.3.0".',
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("revalidates the latest tag after acquiring the publish lock", () => {
    const harness = createPublishHarness({
      distTags: {
        "mons-rules": [{ latest: "0.1.0" }, { latest: "0.2.0" }],
      },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "mons-rules@0.2.0 must be newer than its current latest version 0.2.0.",
      );
      expect(realPublishCalls(harness.calls())).toHaveLength(0);
      expect(harness.gitCalls()).toMatch(
        /--force-with-lease=refs\/tags\/mons-npm-publish-lock:[0-9]{40} origin :refs\/tags\/mons-npm-publish-lock/,
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("rechecks the exact version after acquiring the publish lock", () => {
    const harness = createPublishHarness({
      versions: {
        "mons-rules": [[], ["0.2.0"]],
      },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("mons-rules@0.2.0 is already published.");
      expect(realPublishCalls(harness.calls())).toHaveLength(0);
      expect(harness.gitCalls()).toMatch(
        /--force-with-lease=refs\/tags\/mons-npm-publish-lock:[0-9]{40} origin :refs\/tags\/mons-npm-publish-lock/,
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("publishes a package that is not yet present in the registry", () => {
    const harness = createPublishHarness({
      versions: {
        "mons-rules": [REGISTRY_NOT_FOUND, REGISTRY_NOT_FOUND],
      },
      distTags: {
        "mons-rules": [REGISTRY_NOT_FOUND, REGISTRY_NOT_FOUND],
      },
    });
    try {
      const result = harness.run([]);
      expect(result.status, result.stderr).toBe(0);
      expect(result.stderr).not.toContain("npm error code E404");
      expect(realPublishCalls(harness.calls())).toHaveLength(1);
      expect(
        harness.calls().match(/view mons-rules versions --json/g),
      ).toHaveLength(2);
      expect(
        harness.calls().match(/view mons-rules dist-tags --json/g),
      ).toHaveLength(2);
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("does not treat non-E404 registry failures as an unpublished package", () => {
    const harness = createPublishHarness({
      versions: {
        "mons-rules": [{ error: { code: "E500" } }],
      },
    });
    try {
      const result = harness.run(["--check-only"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "Could not read published versions for mons-rules.",
      );
      expect(result.stderr).toContain("npm error code E500");
      expect(harness.calls()).not.toContain("run check");
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("does not attribute registry changes when npm fails to confirm a publish", () => {
    const harness = createPublishHarness({
      publishStatuses: { "mons-rules": 73 },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(73);
      expect(result.stderr).toContain(
        "The mons-rules publish command started but npm did not confirm completion.",
      );
      expect(result.stderr).toContain(
        "registry changes cannot be safely attributed",
      );
      expect(result.stderr).not.toContain(
        "mons-rules dist-tags before this publication attempt",
      );
      expect(result.stderr).not.toContain("npm dist-tag");
      expect(harness.gitCalls()).toMatch(
        /--force-with-lease=refs\/tags\/mons-npm-publish-lock:[0-9]{40} origin :refs\/tags\/mons-npm-publish-lock/,
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("fails safely when the remote lock cannot be released", () => {
    const harness = createPublishHarness({ lockReleaseStatus: 75 });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(1);
      expect(realPublishCalls(harness.calls())).toHaveLength(1);
      expect(result.stderr).toContain(
        "mons-rules@0.2.0 was published, but the npm publication lock requires manual cleanup.",
      );
      expect(result.stderr).not.toContain("Publication did not complete");
      expect(result.stderr).not.toContain("npm dist-tag");
      expect(result.stderr).toContain("future releases will remain blocked");
      expect(result.stderr).toContain(
        "git fetch --no-tags origin refs/tags/mons-npm-publish-lock",
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("fails a real publish immediately when npm authentication fails", () => {
    const harness = createPublishHarness();
    try {
      const result = harness.run([], 73);
      expect(result.status).toBe(73);
      expect(harness.calls()).toBe("whoami\n");
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });
});
