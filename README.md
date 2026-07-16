# Mons TypeScript engine

The Mons rules engine is implemented in strict TypeScript and distributed as two
dependency-free npm packages:

- `mons-web` is an ES module for browsers and bundlers.
- `mons-rust` is the existing CommonJS package for Node.js. Its historical package
  name is unchanged for compatibility.

Both packages expose the same 23 named game APIs and the same TypeScript declarations.

```ts
import { GameVariant, MonsGameModel } from "mons-web";

const game = MonsGameModel.new(GameVariant.Classic);
const output = game.process_input_fen("l10,5;l9,4");
```

```js
const { GameVariant, MonsGameModel } = require("mons-rust");

const game = MonsGameModel.new(GameVariant.Classic);
```

## Migrating `mons-web` initialization

`mons-web` no longer has a default initializer or an `initSync` export. Remove the
default import and initialization call; named imports are ready to use immediately.
The generated `InitInput`, `SyncInitInput`, and `InitOutput` TypeScript types are
removed with those loaders.

```diff
-import initMonsWeb, { MonsGameModel } from "mons-web";
-await initMonsWeb();
+import { MonsGameModel } from "mons-web";
```

The named API is otherwise preserved, including enum values, FEN formats, model
classes, event ordering, random automoves, and smart-automove preferences.

Incoming strings retain the previous runtime normalization: unpaired UTF-16
surrogates become U+FFFD before parsing or echoing. One intentional error-policy
change applies to malformed data: native `RuntimeError("unreachable")` traps from
invalid UTF-8 slice boundaries or genuine board/location bounds failures are
deterministic TypeScript `RangeError`s. Wrapped location indices that resolve inside
the board remain compatible aliases.

Published JavaScript targets ES2020. The Node package uses Node's built-in performance
and cryptographic-random services directly; the browser package uses the corresponding
`globalThis` APIs. Node.js 22.13 through 22.x, or Node.js 24 or newer, is required
only for repository development and release tooling.

## Validation

Install the workspace with Node.js 22.13 through 22.x, or Node.js 24 or newer, and
run the standard checks:

```sh
npm ci --engine-strict
npm run format:check
npm run lint
npm run typecheck
npm run build
npm test
npm run test:automove-parity
```

Run `./scripts/run-rules-tests.sh` with no options to replay the deterministic
compressed stream of 699,994 canonical unique rules transitions recovered from
699,999 historical raw fixtures. The command validates and streams the corpus without
unpacking or rewriting it.

Run `node ./scripts/check-complete-games.cjs` to validate the immutable public corpus
of 1,527 complete real-player games. Run `npm run test:complete-games` to replay all
25,185 turns and 169,480 inputs through the TypeScript engine across all 12 variants.

## Release

Run `./publish.sh --check-only` to execute the complete Node-only validation, build
both package tarballs, and perform npm dry runs without publishing. Publishing is an
explicit release operation: run `./publish.sh` from a clean worktree only when both
packages should be released to the `latest` tag.

A real publish acquires the transient `mons-npm-publish-lock` tag on `origin`, or on
the shared remote named by `MONS_PUBLISH_LOCK_REMOTE`. All publishers must use this
script and the same remote for the lock to serialize releases across hosts. If a
process terminates without releasing the tag, the script prints inspection and
lease-protected stale-lock recovery commands.
