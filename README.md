# mons-rust

`cargo add mons-rust`

or

`npm install mons-rust`

## Automove

Docs:

- runbook: `HOW_TO_ITERATE_ON_AUTOMOVE.md`
- next mechanism: `AUTOMOVE_IDEAS.md`
- durable evidence and lessons: `docs/automove-knowledge.md`

Shipping surface:

- Fast and Normal retain shipping search; Pro uses the promoted bounded tactical policy
- complete independently cold selector calls must remain below `700ms`

Experiments use a small candidate-specific `#[cfg(test)]` harness:

- `cargo test --release --lib <test_name> -- --ignored --nocapture --test-threads=1`
- `./scripts/check-automove-hygiene.sh`

## Real-player complete games

The immutable, move-only corpus of 1,527 complete games played by real players is
documented in [test-data/complete-games/v1](https://github.com/supermetalmons/mons-rust/tree/main/test-data/complete-games/v1).
It is repository research data, not part of the Rust or npm package surface. Run
`node ./scripts/check-complete-games.cjs` to verify its pinned bytes and schema.

## Rules Tests

Runner:

- `./scripts/run-rules-tests.sh`
- `./scripts/run-rules-tests.sh --limit 100`
- `./scripts/run-rules-tests.sh --log /tmp/rules-tests.log`

The checked-in corpus is `test-data/rules-regressions.jsonl.gz`. Its manifest records
the deterministic 10,000-case selection policy, source archive hashes, coverage, and
artifact hashes. The runner verifies the complete stream even when `--limit` executes
only a prefix.

## Publishing

- Set the release version in `Cargo.toml` and regenerate `Cargo.lock`, then commit the
  complete release change set. Publishing requires a clean worktree.
- Run `./publish.sh --check-only` for the complete rules, Rust, release-gate, Wasm,
  public-surface, cold-route, and npm-size validation without publishing.
- Run `./publish.sh` only after the check-only path passes and the release commit is clean.
