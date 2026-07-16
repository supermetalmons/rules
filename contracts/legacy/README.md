# Legacy 0.1.135 contract

`runtime-contract.json` is a byte-stable observation of the 0.1.135 Node Wasm
package built from commit `55c9e97f8643e3edba7249a1daff1f2b83fccad9`.
It captures the high-level API that the TypeScript implementation must retain;
raw Wasm exports and generated pointer-ownership behavior are intentionally not
part of this contract. The string `__undefined__` represents a JavaScript
`undefined` value in the JSON fixture.

`mons-api.d.ts` is the exact high-level declaration emitted by the Node build.
The browser build has the same high-level declarations followed by its generated
Wasm initializer declarations; those initializer declarations are the explicitly
accepted clean-break exception and are not copied here.

These checked-in files are immutable compatibility observations; the temporary
oracle and capture tooling were removed during the final TypeScript cutover.
The timing observation is informational: compatibility uses exact decisions
under the fixed clock and a separate real-clock latency ceiling. Automove
fixtures derived from the complete-game source corpus are intentionally not
checked in.
