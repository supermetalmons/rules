# Agent Instructions

- Use `./scripts/run-rules-tests.sh` for the canonical compressed rules regression corpus; do not unpack or regenerate it during unrelated work.
- Treat `test-data/complete-games/v1/` as an immutable source corpus. Never delete, regenerate, normalize, deduplicate, reorder, replace, or otherwise rewrite it during cleanup or unrelated work. Put new source revisions in a new version directory and keep derived data under `target/` or `/tmp`.
