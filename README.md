# mons-rust

The Mons rules engine is distributed as two npm packages backed by the same Rust/Wasm
implementation:

- `mons-web` for browsers and ES modules
- `mons-rust` for Node.js

Install the package for your runtime with `npm install mons-web` or
`npm install mons-rust`. The generated TypeScript declarations define the public API;
the Rust crate is an internal build artifact and is not a supported package surface.

## Validation

Run `./scripts/run-rules-tests.sh` with no options to replay the deterministic
compressed stream of 699,994 canonical unique rules transitions recovered from
699,999 historical raw fixtures. The command validates and streams the corpus without
unpacking or rewriting it. The source covers Classic only; variants 1 through 11
remain covered by focused Rust tests.

Run `node ./scripts/check-complete-games.cjs` to validate the immutable public corpus
of 1,527 complete real-player games.

## Release

Run `./publish.sh --check-only` to execute the Rust, Wasm, corpus, and npm-package
checks without publishing. Run `./publish.sh` from a clean worktree to perform the
same checks and publish both npm packages.
