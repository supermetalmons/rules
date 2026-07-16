# Mons rules engine

`mons-rules` is the dependency-free TypeScript rules engine for Super Metal Mons.
Its single ES module works in browsers, Web Workers, Node.js, and Firebase Cloud
Functions.

```ts
import { GameVariant, MonsGameModel } from "mons-rules";

const game = MonsGameModel.new(GameVariant.Classic);
const output = game.process_input_fen("l10,5;l9,4");
```

```js
const { GameVariant, MonsGameModel } = require("mons-rules");

const game = MonsGameModel.new(GameVariant.Classic);
```

Published JavaScript targets ES2020 and uses the Web-standard `performance` and
`crypto` globals. Node.js 22.13 through 22.x, or Node.js 24 or newer, is required for
Node consumers and repository tooling.

## Validation

Install dependencies and run the complete local gate:

```sh
npm ci --engine-strict
npm run check
```

The check streams and replays 699,994 canonical rules transitions without unpacking
the compressed corpus. It also validates 89 public API edge cases, 39 deterministic
automove decisions, and 1,527 complete real-player games containing 25,185 turns and
169,480 inputs across all 12 variants.

Run `node ./scripts/check-complete-games.cjs` to validate the immutable public corpus
without replaying it. Run `npm run test:complete-games` for the full engine replay.

## Release

Run `./publish.sh --check-only` to validate an unpublished version and perform an npm
dry run. Run `./publish.sh` from a clean worktree to publish that version to `latest`.

A real publish uses the transient `mons-npm-publish-lock` tag on `origin`, or the
shared remote named by `MONS_PUBLISH_LOCK_REMOTE`, to serialize releases across
hosts. The script prints lease-protected recovery instructions if cleanup fails.
