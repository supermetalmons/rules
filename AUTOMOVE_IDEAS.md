# Automove: Next Idea

Baseline: Pro uses promoted bounded tactical; Fast and Normal retain shipping search.
The hard limit is `700ms` per independently cold complete public call.

## Deterministic bounded/lazy root generation

Generate roots incrementally into a fixed-cap pool *before* exact analysis and the
turn engine. Always admit mandatory tactical families, then fill remaining slots in a
stable order. Stop generation at the cap so downstream work is bounded by construction.

First proof: demonstrate a changed public root choice, legal replay across all 12
variants, and two cold calls per witness below `700ms`. Then run sampled and all-variant
direct duels against the current Pro baseline.

Kill if mandatory roots can be omitted, work escapes the cap, public outputs never
change, or a cold call exceeds `700ms`. Do not turn it into another node-budget,
completed-depth, tactical-pool, static-selector, policy-stitching, or current-corpus
evaluator tweak.
