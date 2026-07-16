# Automove decisions v1

This immutable corpus pins deterministic public `smartAutomove` behavior with
`performance.now()` fixed at `0`. It contains the initial state for every game
variant and one retained regression state. Every Fast, Normal, and Pro decision
also records the result of replaying its selected input.

`decisions.jsonl` is the authoritative executable contract. `manifest.json`
pins its byte size, SHA-256, record order, and counts. Do not regenerate,
normalize, reorder, or edit this v1 payload; add a new version directory for a
different selection.

`internal-selector-observations.txt` is preserved only as a hash-checked archive.
Tests intentionally do not replay its internal selector details.
