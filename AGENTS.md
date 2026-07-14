# Agent Instructions

- Use `./scripts/run-rules-tests.sh` for the canonical compressed rules regression corpus; do not unpack or regenerate it during unrelated work.
- For automove experimentation, read `HOW_TO_ITERATE_ON_AUTOMOVE.md` first — start with the Quick Reference section, then execute the single hypothesis in `AUTOMOVE_IDEAS.md`.
- All experiments use a candidate-specific `#[cfg(test)]` harness; run via `cargo test --release --lib <test_name> -- --ignored --nocapture --test-threads=1`.
