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

const PACKAGE_NAMES = ["mons-web", "mons-rust"] as const;
type PackageName = (typeof PACKAGE_NAMES)[number];

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
  fs.mkdirSync(path.join(root, "pkg", "web"), { recursive: true });
  fs.mkdirSync(path.join(root, "pkg", "node"), { recursive: true });
  fs.copyFileSync(path.resolve("publish.sh"), path.join(root, "publish.sh"));
  fs.writeFileSync(
    path.join(root, "package.json"),
    `${JSON.stringify({ version: options.version ?? "0.2.0" })}\n`,
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

  for (const script of [
    "assert-pure-typescript-repository.mjs",
    "check-complete-games.cjs",
    "assert-release-npm-package.cjs",
  ]) {
    fs.writeFileSync(path.join(scriptsDir, script), "");
  }
  writeExecutable(
    path.join(scriptsDir, "run-rules-tests.sh"),
    "#!/bin/bash\nexit 0\n",
  );
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
    cat "\${response_path}"
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
if [ "$*" = "publish --access public --tag latest" ]; then
    if [ "$(basename "$PWD")" = "web" ]; then
        if [ -n "\${PUBLISH_TEST_WEB_PUBLISH_GATE:-}" ]; then
            : > "\${PUBLISH_TEST_WEB_PUBLISH_GATE}.started"
            while [ ! -f "\${PUBLISH_TEST_WEB_PUBLISH_GATE}.release" ]; do
                sleep 0.01
            done
        fi
        exit "\${PUBLISH_TEST_WEB_PUBLISH_STATUS:-0}"
    fi
    exit "\${PUBLISH_TEST_RUST_PUBLISH_STATUS:-0}"
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
    PUBLISH_TEST_RESPONSE_DIR: responseDir,
    PUBLISH_TEST_RUST_PUBLISH_STATUS: String(
      options.publishStatuses?.["mons-rust"] ?? 0,
    ),
    PUBLISH_TEST_WEB_PUBLISH_STATUS: String(
      options.publishStatuses?.["mons-web"] ?? 0,
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
      spawnSync("/bin/bash", [path.join(root, "publish.sh"), ...args], {
        cwd: root,
        encoding: "utf8",
        env: environment(whoamiStatus),
      }),
    start: (args, environmentOverrides = {}) => {
      const child = spawn(
        "/bin/bash",
        [path.join(root, "publish.sh"), ...args],
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
    .filter((call) => call === "publish --access public --tag latest");
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

describe("publish.sh", () => {
  it("runs check-only registry, validation, and dry-run steps without npm credentials", () => {
    const harness = createPublishHarness();
    try {
      const result = harness.run(["--check-only"], 73);
      expect(result.status, result.stderr).toBe(0);

      const calls = harness.calls();
      expect(calls).not.toContain("whoami");
      expect(calls).toContain("view mons-web versions --json");
      expect(calls).toContain("view mons-web dist-tags --json");
      expect(calls).toContain("view mons-rust versions --json");
      expect(calls).toContain("view mons-rust dist-tags --json");
      expect(calls).toContain("run typecheck");
      expect(calls).toContain("run build");
      expect(
        calls.match(/publish --dry-run --access public --tag latest/g),
      ).toHaveLength(2);
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
      expect(realPublishCalls(harness.calls())).toHaveLength(2);
      expect(
        harness.calls().match(/view mons-rust dist-tags --json/g),
      ).toHaveLength(3);

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
    const publishGate = path.join(harness.root, "web-publish-gate");
    const first = harness.start([], {
      PUBLISH_TEST_WEB_PUBLISH_GATE: publishGate,
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
      distTags: { "mons-web": [{ latest }] },
    });
    try {
      const result = harness.run(["--check-only"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        `mons-web@0.2.0 must be newer than its current latest version ${latest}.`,
      );
      expect(harness.calls()).not.toContain("run typecheck");
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

  it("allows packages that do not have a latest tag", () => {
    const harness = createPublishHarness({
      distTags: {
        "mons-web": [{ next: "0.3.0-beta.1" }],
        "mons-rust": [{}],
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
        "mons-web": [{ latest: "0.1.0", next: "v0.3.0" }],
      },
    });
    try {
      const result = harness.run(["--check-only"]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'mons-web dist-tag "next" has a noncanonical SemVer value: "v0.3.0".',
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("snapshots and validates both fresh latest tags before either real publish", () => {
    const harness = createPublishHarness({
      distTags: {
        "mons-rust": [{ latest: "0.1.0" }, { latest: "0.2.0" }],
      },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "mons-rust@0.2.0 must be newer than its current latest version 0.2.0.",
      );
      expect(realPublishCalls(harness.calls())).toHaveLength(0);
      expect(harness.gitCalls()).toMatch(
        /--force-with-lease=refs\/tags\/mons-npm-publish-lock:[0-9]{40} origin :refs\/tags\/mons-npm-publish-lock/,
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("revalidates the second latest tag after publishing the first package", () => {
    const harness = createPublishHarness({
      distTags: {
        "mons-rust": [
          { latest: "0.1.0" },
          { latest: "0.1.0" },
          { latest: "0.2.0" },
        ],
      },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "mons-rust@0.2.0 must be newer than its current latest version 0.2.0.",
      );
      expect(realPublishCalls(harness.calls())).toHaveLength(1);
      expect(result.stderr).toContain(
        "mons-web dist-tags before this publication attempt",
      );
      expect(result.stderr).toContain(
        "Never retry to latest when the current latest is equal or newer",
      );
      expect(result.stderr).not.toContain(
        "npm publish --access public --tag latest",
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("retains the second-package exact-version recheck", () => {
    const harness = createPublishHarness({
      versions: {
        "mons-rust": [[], [], ["0.2.0"]],
      },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("mons-rust@0.2.0 is already published.");
      expect(realPublishCalls(harness.calls())).toHaveLength(1);
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("does not attribute registry changes when npm fails to confirm a publish", () => {
    const harness = createPublishHarness({
      publishStatuses: { "mons-web": 73 },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(73);
      expect(result.stderr).toContain(
        "The mons-web publish command started but npm did not confirm completion.",
      );
      expect(result.stderr).toContain(
        "registry changes cannot be safely attributed",
      );
      expect(result.stderr).not.toContain(
        "mons-web dist-tags before this publication attempt",
      );
      expect(harness.gitCalls()).toMatch(
        /--force-with-lease=refs\/tags\/mons-npm-publish-lock:[0-9]{40} origin :refs\/tags\/mons-npm-publish-lock/,
      );
    } finally {
      fs.rmSync(harness.root, { force: true, recursive: true });
    }
  });

  it("reports only the confirmed package when the second publish is uncertain", () => {
    const harness = createPublishHarness({
      publishStatuses: { "mons-rust": 74 },
    });
    try {
      const result = harness.run([]);
      expect(result.status).toBe(74);
      expect(result.stderr).toContain(
        "mons-web dist-tags before this publication attempt",
      );
      expect(result.stderr).toContain(
        "The mons-rust publish command started but npm did not confirm completion.",
      );
      expect(result.stderr).not.toContain(
        "mons-rust dist-tags before this publication attempt",
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
      expect(realPublishCalls(harness.calls())).toHaveLength(2);
      expect(result.stderr).toContain(
        "Both packages were published, but the npm publication lock requires manual cleanup.",
      );
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
