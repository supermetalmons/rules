# mons-rust

`cargo add mons-rust`

or

`npm install mons-rust`

## Automove

Docs:

- runbook: `HOW_TO_ITERATE_ON_AUTOMOVE.md`
- live board: `AUTOMOVE_IDEAS.md`
- structural review: `docs/automove-structural-review.md`
- durable rules: `docs/automove-knowledge.md`
- archive: `docs/automove-archive.md`

Live surface:

- retained profiles: `shipping_pro_search`, previous-production `frontier_pro_v2_guarded`, promoted `frontier_pro_v10_bounded_tactical`
- canonical stages: `guardrails`, `pro-triage`, `runtime-preflight`, `pro-reliability`, `pro-reliability-confirm`

Quickstart:

- `./scripts/run-automove-canonical-loop.sh frontier_pro_v10_bounded_tactical`
- `./scripts/run-automove-canonical-loop.sh --confirm frontier_pro_v10_bounded_tactical`
- `./scripts/run-automove-experiment.sh <stage> frontier_pro_v10_bounded_tactical`
- `./scripts/run-automove-experiment.sh pro-profile-sweep frontier_pro_v2_raw`
- `./scripts/check-automove-hygiene.sh`
- `./scripts/clean-experiment-artifacts.sh --dry-run`
- `./scripts/clean-experiment-artifacts.sh --dry-run --all-target`

Artifacts:

- selected-profile logs: `target/experiment-runs/<profile>/`
- workflow-only logs: `target/experiment-runs/misc/`
- runtime-preflight stamps: `target/experiment-stamps/`
- full local build/artifact cache: `target/` via `--all-target`

## Rules Tests

Runner:

- `./scripts/run-rules-tests.sh`
- `./scripts/run-rules-tests.sh --limit 100`
- `./scripts/run-rules-tests.sh --log /tmp/rules-tests.log`

Generator:

- `./scripts/generate-rules-tests.sh --target-new 100`
- `./scripts/generate-rules-tests.sh --dir /tmp/rules-tests-work`
- `./scripts/pack-rules-tests.sh --dir /tmp/rules-tests-work --chunks-dir ./rules-tests-chunks --chunk-size 100000`

## Repo Cleanup

- `./repo-clean.sh`
- `./repo-clean.sh --local-only`

Use `keep/<name>` for any branch that should survive repo cleanup.

## Publishing

- Set the release version in `Cargo.toml` and `Cargo.lock`, then commit the complete release change set. `publish.sh` refuses a dirty worktree and no longer mutates the version after validation.
- `./publish.sh`
- Confirm public Pro routes through `frontier_pro_v10_bounded_tactical`.
- Confirm `frontier_pro_v2_guarded` and `shipping_pro_search` remain available as the previous-production comparator and search-only baseline.
- Run `cargo test`.
- Run `cargo test --release --lib smart_automove_pro_matches_frontier_bounded_tactical_selector_on_release_fixture`.
- Run `cargo test --release --lib automove_runtime_black_turn_eight_deadline_tail_probe -- --ignored --nocapture` to enforce the whole-call `700ms` ceiling.
- Run `./scripts/check-automove-hygiene.sh`.
- Run `./scripts/assert-release-package-surface.sh pkg/web pkg/node` after the Wasm packages are built.
- Run `node ./scripts/assert-release-automove-route.cjs pkg/node/mons_rust.js` to verify the generated package routes public Pro through bounded tactical v10 on a fixture that differs from both retained v2 and shipping search.
- Clean disposable experiment artifacts after validation with `./scripts/clean-experiment-artifacts.sh`.
