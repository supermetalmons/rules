# How to Iterate on Automove

This is the operational runbook for improving the shipping automove. Durable results
and failed-direction lessons live in `docs/automove-knowledge.md`; the single next
hypothesis lives in `AUTOMOVE_IDEAS.md`. Raw experiment receipts are disposable and
remain recoverable from Git history when historical detail is needed.

## Quick Reference

1. Read `AUTOMOVE_IDEAS.md` and work on its one hypothesis only.
2. Treat public Fast, Normal, and Pro calls as the product boundary. An internal
   counter or changed score is not evidence until the returned public move changes.
3. Preserve the current public contract: all variants, legal/replayable inputs,
   deterministic emergency fallback, and the existing deadline hierarchy.
4. Add the smallest candidate-specific `#[cfg(test)]` harness beside the mechanism.
   Do not restore the retired generic profile, runner, or receipt framework.
5. Prove causal reach and cold timing before running games.
6. Kill a failed line completely. Keep only its reusable lesson in the knowledge file.
7. Promote only after sampled and all-variant evidence, direct replacement proof,
   public package verification, and independently cold calls below `700ms`.

Run an ignored experiment with the repository-standard command:

```sh
cargo test --release --lib <test_name> -- --ignored --nocapture --test-threads=1
```

## Shipping Baseline

- Fast and Normal use their shipping search configurations.
- Pro uses the bounded tactical policy promoted as
  `frontier_pro_v10_bounded_tactical`; names may be neutralized in production code,
  but its behavior is the comparison baseline.
- Shipping selection has a cooperative `650ms` outer deadline. Pro has a `550ms`
  frontier deadline and first banks the unchanged Fast result under a `200ms` child
  deadline. Cancellation returns the banked result or a deterministic legal fallback.
- The immutable empirical limit is `700ms` for every independently cold, complete
  public selector call. A node count, average, warm cache, or nominal deadline is not
  a substitute.
- The discriminating public Pro fixture must keep returning `l10,5;l9,4`.

The promotion baseline is recorded in `docs/automove-knowledge.md`. Do not spend a
new iteration merely reproducing it, and do not tune against the fixture that asserts
the current route.

## Define the Experiment First

In the candidate test, freeze one hypothesis, insertion point, baseline, causal path to
the public root, complete-work bound, disjoint discovery/confirmation sets, and pass or
kill conditions. Use a new ID for a new mechanism; do not reactivate a retired profile
or retune a failed family.

## Evidence Ladder

### 1. Compile and correctness

Run formatting and focused tests. Replay every candidate input and require a non-empty
legal result. Cover both colors, public preferences, cancellation, expired deadlines,
and affected fallbacks.

### 2. Public causal reach

On frozen positions compare the public baseline, substrate without the new layer, and
complete candidate. Continue only if the layer changes a public input for the intended
reason. Internal score/order/depth/counter changes with identical inputs fail reach.

### 3. Cold complete-selector timing

Time the whole public call after a fresh process or complete cache reset, including
generation, exact/turn-engine work, fallback, and cleanup. Run two cold calls per
witness and stop on any call above `700ms`. Bound work by construction because a
cooperative deadline cannot interrupt checkpoint-free work or scheduler suspension.

### 4. Sampled strength

Use seeded openings across variants and mirrored colors against the public baseline,
with confirmation offsets excluded from discovery. The floor is `7/12` with confidence
at least `0.60`; `6-6` fails. Sampling authorizes confirmation, not promotion.

### 5. All-variant confirmation

Cover all 12 current `GameVariant` values and Pro against the shipping Pro, Normal,
and Fast opponent budgets. Require:

- aggregate strength at or above the frozen promotion floor;
- no more than two variants below `0.50` in a panel;
- zero invalid or empty candidate moves;
- at most `3%` replay mismatch per profile and panel;
- every original and independently cold replay call below `700ms`.

Use fresh repeat offsets and report per-variant results.

### 6. Direct replacement and release proof

Duel the selector it would replace. Then run the active suite, legality, cold runtime,
deadline-tail, generated Node/Wasm route, and package-surface gates. Native success
does not waive Wasm timing or legality.

## Recording Results

Logs under `target/` or `/tmp` are disposable. When a line ends:

- promote only the minimum production delta and permanent regression tests;
- add a compact evidence row or reusable lesson to `docs/automove-knowledge.md`;
- replace `AUTOMOVE_IDEAS.md` with the one next hypothesis;
- remove the candidate harness if the mechanism is killed;
- delete logs, generated receipts, profiles, analyzers, and unused branches.

Record variant policy, offsets, opponent, games, legality/replay counts, cold maximum,
and source revision. A bare score is not reusable evidence.

## Stop Rules

Kill on absent public reach, a cold call above `700ms`, work that cannot be bounded,
sampled failure, fresh-offset or opponent-budget reversal, baseline-save/variant
contamination, feature aliasing or data leakage, or an unintended contract change.

Do not rescue a killed line with fixture selection, a relaxed timer, another static
selector, or a larger budget. Return to the mechanism question.

## Session End

1. Run focused tests plus `./scripts/check-automove-hygiene.sh`.
2. Confirm no experiment-only symbol, environment switch, log, or receipt is tracked.
3. Update the knowledge file only with durable information.
4. Leave exactly one next hypothesis in `AUTOMOVE_IDEAS.md`.
5. Leave the worktree free of generated package and experiment artifacts.
