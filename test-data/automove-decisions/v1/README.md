# Automove decision parity corpus v1

This directory is an immutable public-behavior capture of `mons-rust` at
commit `55c9e97f8643e3edba7249a1daff1f2b83fccad9` (package version `0.1.135`).
It is the release oracle for deterministic, non-timeout `smartAutomove`
decisions during the pure TypeScript migration.

The capture ran the detached Node/Wasm package with `performance.now()` fixed
at `0`. Each state records Fast, Normal, and Pro decisions, the source FEN
after selection, and the result of replaying the selected input. The capture
validated that selection did not mutate its source and that every selected
input replayed to an Events output.

`decisions.jsonl` contains, in pinned order:

- every initial state for all 12 variants;
- the pre-existing release regression fixture.

It contains no rows selected or replayed from the immutable complete-game
source corpus. Rows with `sourceGame`, `turnsApplied`, record/action indices,
or any other complete-game provenance are excluded. Complete-game-derived data
must remain transient under `target/` or `/tmp` rather than being committed
here.

`manifest.json` pins the baseline identity, selection, record counts, file
sizes, corpus SHA-256 values, and ordered-ID SHA-256. The tests recompute these
values before executing any decisions. Do not regenerate, normalize, reorder,
or edit this v1 corpus. A materially different source or selection belongs in
a new version directory.

No capture program or legacy runtime is checked in. The one-time capture ran
from `/tmp` against the detached baseline package, and neither it nor the test
requires Rust, Cargo, Wasm, or network access.

`internal-selector-observations.txt` is a data-only capture from a test-only
probe in that detached baseline. It pins the shipping configuration summary,
the first 12 ranked roots for Fast/Normal/Pro, and the Fast search score,
cumulative visited-node count, and selected root for initial, release, and
tactical states. Its line grammar is:

- `CONFIG preference depth maxNodes rootEnum rootBranch nodeEnum nodeBranch quietReductionDepth`;
- `ROOT scenario preference inputs heuristic efficiency wins attacksDrainer ownDrainerVulnerable immediateScore carrierProgress material`;
- `SEARCH_SCORE scenario inputs score cumulativeVisitedNodes`; and
- `SELECT scenario preference inputs`.

The public corpus remains the authoritative end-to-end decision and replay
contract. Focused component tests cover branch-specific search extensions,
root focusing, advisor reasons, reply-risk projections, runtime fallbacks, and
timeout cleanup.
