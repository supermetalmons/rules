# Mons rules engine

The Mons rules engine is implemented in strict TypeScript and distributed as the
dependency-free `mons-rules` npm package. Its single ES module works in browser
bundles, Web Workers, Node.js, and Firebase Cloud Functions.

The module exposes 23 named game APIs with matching TypeScript declarations.

```ts
import { GameVariant, MonsGameModel } from "mons-rules";

const game = MonsGameModel.new(GameVariant.Classic);
const output = game.process_input_fen("l10,5;l9,4");
```

```js
const { GameVariant, MonsGameModel } = require("mons-rules");

const game = MonsGameModel.new(GameVariant.Classic);
```

## Migrating from the legacy packages

Replace either legacy dependency with `mons-rules` and update the module specifier:

```diff
-import * as Mons from "mons-web";
+import * as Mons from "mons-rules";
```

```diff
-const Mons = require("mons-rust");
+const Mons = require("mons-rules");
```

The module has no default initializer or `initSync` export. Remove the default
import and initialization call; named imports are ready to use immediately. The
generated `InitInput`, `SyncInitInput`, and `InitOutput` TypeScript types are removed
with those loaders.

```diff
-import initMonsWeb, { MonsGameModel } from "mons-web";
-await initMonsWeb();
+import { MonsGameModel } from "mons-rules";
```

The named API is otherwise preserved, including enum values, FEN formats, model
classes, event ordering, random automoves, and smart-automove preferences.

Incoming strings retain the previous runtime normalization: unpaired UTF-16
surrogates become U+FFFD before parsing or echoing. One intentional error-policy
change applies to malformed data: native `RuntimeError("unreachable")` traps from
invalid UTF-8 slice boundaries or genuine board/location bounds failures are
deterministic TypeScript `RangeError`s. Wrapped location indices that resolve inside
the board remain compatible aliases.

Published JavaScript targets ES2020 and uses the Web-standard
`globalThis.performance` and `globalThis.crypto` APIs in every runtime. Node.js 22.13
through 22.x, or Node.js 24 or newer, is required for Node consumers, repository
development, and release tooling. These versions support loading the same ES module
through either `import` or `require`.

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

Run `./publish.sh --check-only` to execute the complete validation, build the
`mons-rules` tarball, verify its ES module through browser and Node consumers, and
perform an npm dry run without publishing. Publishing is an explicit release
operation: run `./publish.sh` from a clean worktree to release `mons-rules` to the
`latest` tag.

A real publish acquires the transient `mons-npm-publish-lock` tag on `origin`, or on
the shared remote named by `MONS_PUBLISH_LOCK_REMOTE`. All publishers must use this
script and the same remote for the lock to serialize releases across hosts. If a
process terminates without releasing the tag, the script prints inspection and
lease-protected stale-lock recovery commands.
