# Automove: One Active Hypothesis

Baseline: current public Pro; every cold complete public call must be `<700ms`.

## Bounded/lazy root generation

ID: `bounded-lazy-root-v1`.

Before exact or turn-engine work, admit roots to one fixed-cap pool. In the harness,
freeze the cap, mandatory-family list/order, one reserved slot per present family,
deterministic within-family/overflow order, and fixed-cap dedup storage. Fill the rest
in stable order; downstream sees only admitted roots. Kill if the present
mandatory-family count exceeds the cap. Never sweep it.

Keep discovery, sampled-gate, and all-variant confirmation offsets mutually disjoint.
First prove public reach, all-variant legal replay, bounded-work counters, and two cold
calls per witness below `700ms`; only then duel shipping Pro, Normal, and Fast.

Kill on absent reach, hidden work, family loss, unstable overflow, or a cold call
`>=700ms`. Do not revive node/depth/tactical-pool budgets, selector stitching, or a
current-corpus evaluator.
