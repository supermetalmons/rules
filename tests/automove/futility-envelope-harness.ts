import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import type { AutomovePreference } from "../../src/automove/selector.js";
import type { SearchTuning } from "../../src/automove/search-tuning.js";

export type ProbeReply = {
  score?: number;
  selective?: number;
  stop?: boolean;
  unsupported?: boolean;
};
export type ProbePhase = {
  depth?: number;
  alpha?: number;
  beta?: number;
  active?: number;
  replies?: ProbeReply[];
  stopBefore?: boolean;
};
export type ProbeOptions = ProbePhase & {
  staticScore?: number;
  fillScore?: number;
  maxNodes?: number;
  startNodes?: number;
  timeout?: boolean;
  tt?: { flag: number; score: number; depth: number; tagged?: boolean };
  next?: ProbePhase;
};

type ProbeResult = {
  score: number;
  flag: number | null;
  tagged: boolean;
  storedScore: number;
  storedDepth: number;
  storedGeneration: number;
  nodes: number;
  selectiveEpoch: number;
  addedSelectivity: number;
  stopped: boolean;
  unsupported: boolean;
  probes: { depth: number; alpha: number; beta: number }[];
  staticCalls: number;
};
type Harness = {
  probe: (
    options?: ProbeOptions & {
      mode?: AutomovePreference;
      equalCustom?: boolean;
      tuning?: Partial<SearchTuning>;
    },
  ) => { first: ProbeResult; next: ProbeResult | undefined };
  lifecycle: (
    mode: AutomovePreference,
    equalCustom?: boolean,
  ) => { during: boolean; after: boolean; nodes: number };
};

const TYPE_DECLARATIONS = String.raw`export type ProbeReply = { score?: number; selective?: number; stop?: boolean; unsupported?: boolean };
export type ProbePhase = { depth?: number; alpha?: number; beta?: number; active?: number; replies?: ProbeReply[]; stopBefore?: boolean };
export type ProbeOptions = ProbePhase & { staticScore?: number; fillScore?: number; maxNodes?: number; startNodes?: number; timeout?: boolean; tt?: {flag:number;score:number;depth:number;tagged?:boolean}; next?: ProbePhase };
`;
const TEST_MEMBERS = String.raw`  #futilityModeBeforeReset = false;

  public futilityLifecycleProbe(weights: EvalWeights, limits: SearchLimits) {
    this.#futilityModeBeforeReset = false;
    const result = this.search({ ...limits, maxDepth: 0, maxNodes: 0 }, () => false, weights);
    return { during: this.#futilityModeBeforeReset, after: this.#cacheFutilityUpper, nodes: result.nodes };
  }

  #scriptedReplies: ProbeReply[] | undefined;
  #scriptedFillScore = 0;
  #scriptedStatic: number | undefined;
  #scriptedTrace: { depth: number; alpha: number; beta: number }[] = [];
  #scriptedStaticCalls = 0;

  public futilityProbe(options: ProbeOptions, weights: EvalWeights, limits: SearchLimits) {
    const mode = this.futilityLifecycleProbe(weights, limits);
    this.#tables = memoizedEvalTables(weights);
    this.#cacheFutilityUpper = mode.during;
    this.#tuning = memoizedSearchLimits(limits).tuning;
    this.#windowThreat = 0;
    this.#nodes = options.startNodes ?? 0;
    this.#nodeLimit = options.maxNodes ?? 10_000;
    this.#stopped = options.stopBefore ?? false;
    this.#unsupported = false;
    this.#selectiveEpoch = 0;
    this.#turnEpoch = 0;
    this.#checkTimeout = () => options.timeout === true;
    this.#scriptedStatic = options.staticScore;
    this.#scriptedReplies = [...(options.replies ?? [])];
    this.#scriptedFillScore = options.fillScore ?? 0;
    this.#scriptedTrace = [];
    this.#scriptedStaticCalls = 0;
    if (options.active !== undefined) (this.root as unknown as {active:number}).active = options.active;
    this.#table.keyLo = new Int32Array(64);
    this.#table.keyHi = new Int32Array(64);
    this.#table.score = new Int32Array(64);
    this.#table.info = new Int32Array(64);
    this.#table.move = new Int32Array(64);
    this.#table.mask = 63;
    this.#table.generation = 1;
    this.#table.entries = 0;
    const key = () => {
      const scalar = scalarIndex(this.root);
      const lo = stateKeyLo(this.root, scalar);
      const hi = stateKeyHi(this.root, scalar);
      return {lo, hi, slot:(lo ^ hi * 3) & this.#table.mask};
    };
    if (options.tt !== undefined) {
      const {lo,hi,slot} = key();
      this.#table.keyLo[slot] = lo;
      this.#table.keyHi[slot] = hi;
      this.#table.score[slot] = options.tt.score * 2;
      this.#table.info[slot] = (options.tt.tagged ? FUTILITY_UPPER_TAG : 0) | (1 << 8) | (options.tt.depth << 2) | options.tt.flag;
    }
    const run = (phase: ProbePhase) => {
      this.#scriptedReplies = [...(phase.replies ?? options.replies ?? [])];
      this.#scriptedTrace = [];
      this.#scriptedStaticCalls = 0;
      if (phase.active !== undefined) (this.root as unknown as {active:number}).active = phase.active;
      if (phase.stopBefore) this.#stopped = true;
      const beforeNodes = this.#nodes;
      const beforeSelective = this.#selectiveEpoch;
      const score = this.#negamax(phase.depth ?? options.depth ?? 1, 0, phase.alpha ?? options.alpha ?? 10, phase.beta ?? options.beta ?? 20);
      const {slot} = key();
      const info = this.#table.info[slot] ?? 0;
      return {
        score,
        flag: info === 0 ? null : info & 3,
        tagged: (info & FUTILITY_UPPER_TAG) !== 0,
        storedScore: (this.#table.score[slot] ?? 0) / 2,
        storedDepth: (info >> 2) & 63,
        storedGeneration: (info >>> 8) & TABLE_GENERATION_MASK,
        nodes: this.#nodes - beforeNodes,
        selectiveEpoch: this.#selectiveEpoch,
        addedSelectivity: this.#selectiveEpoch - beforeSelective,
        stopped: this.#stopped,
        unsupported: this.#unsupported,
        probes: [...this.#scriptedTrace],
        staticCalls: this.#scriptedStaticCalls,
      };
    };
    const first = run(options);
    const next = options.next === undefined ? undefined : run(options.next);
    return { first, next };
  }
`;
const TEST_ENTRY = String.raw`import { MonsGame } from "./src/engine/game/mons-game.js";
import { tryLoadPosition } from "./src/automove/bridge.js";
import { FastSearcher, type ProbeOptions } from "./src/automove/search.js";
import { PACKED_SELECTION_PROFILES, type AutomovePreference } from "./src/automove/selector.js";
import { normalizeEvalWeights } from "./src/automove/evaluation-weights.js";
import type { SearchTuning } from "./src/automove/search-tuning.js";
export function lifecycle(mode: AutomovePreference, equalCustom = false) {
 const searcher = new FastSearcher(); if (!tryLoadPosition(searcher.root,new MonsGame(false),40)) throw Error("unsupported");
 const profile=PACKED_SELECTION_PROFILES[mode];
 const weights=equalCustom ? normalizeEvalWeights({...profile.weights}) : profile.weights;
 return searcher.futilityLifecycleProbe(weights, profile.limits);
}
export function probe(options: ProbeOptions & {mode?:AutomovePreference;equalCustom?:boolean;tuning?:Partial<SearchTuning>} = {}) {
 const searcher = new FastSearcher(); if (!tryLoadPosition(searcher.root,new MonsGame(false),40)) throw Error("unsupported");
 const profile=PACKED_SELECTION_PROFILES[options.mode ?? "normal"];
 const weights=options.equalCustom ? normalizeEvalWeights({...profile.weights}) : profile.weights;
 return searcher.futilityProbe(options,weights,{...profile.limits,maxNodes:options.maxNodes ?? 10000,tuning:{...profile.limits.tuning,lateMoveReduction:false,moveCountPruning:false,futilityMargin:10,...options.tuning}});
}
`;
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const searchPath = path.join(repositoryRoot, "src/automove/search.ts");
const childHook = String.raw`    if (this.#scriptedReplies !== undefined) {
      const reply = this.#scriptedReplies.shift() ?? {score:this.#scriptedFillScore};
      this.#scriptedTrace.push({depth,alpha,beta});
      this.#selectiveEpoch += reply.selective ?? 0;
      if (reply.stop || reply.unsupported) this.#stopped = true;
      if (reply.unsupported) this.#unsupported = true;
      return reply.score ?? 0;
    }
`;
const staticHook = String.raw`    this.#scriptedStaticCalls += 1;
    if (this.#scriptedStatic !== undefined) return this.#scriptedStatic;
`;

function instrument(original: string): string {
  const classMarker = "export class FastSearcher {";
  assert.equal(original.split(classMarker).length, 2);
  let source = original.replace(
    classMarker,
    TYPE_DECLARATIONS + "\n" + classMarker + "\n" + TEST_MEMBERS,
  );
  const childStart = source.indexOf("  #searchPreparedChild(");
  const childBody = source.indexOf("    const child =", childStart);
  assert(childStart >= 0 && childBody > childStart);
  source = source.slice(0, childBody) + childHook + source.slice(childBody);
  const evalStart = source.indexOf("  #evaluateStatic(");
  const evalBody = source.indexOf("    let keyLo", evalStart);
  assert(evalStart >= 0 && evalBody > evalStart);
  source = source.slice(0, evalBody) + staticHook + source.slice(evalBody);
  const finalReset = source.indexOf(
    "      this.#cacheFutilityUpper = false;",
    source.indexOf("    } finally {"),
  );
  assert(finalReset >= 0);
  source =
    source.slice(0, finalReset) +
    "      this.#futilityModeBeforeReset = this.#cacheFutilityUpper;\n" +
    source.slice(finalReset);
  const body = (text: string) =>
    text.slice(text.indexOf("  #negamax("), text.indexOf("  #commutingMonMoveContext"));
  assert.equal(body(source), body(original));
  return source;
}

let transformedModules = 0;
const result = await build({
  stdin: {
    contents: TEST_ENTRY,
    resolveDir: repositoryRoot,
    sourcefile: "futility-envelope-entry.ts",
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  target: "node22",
  plugins: [
    {
      name: "futility-envelope-test-harness",
      setup(api) {
        api.onLoad({ filter: /[/\\]automove[/\\]search\.ts$/ }, (args) => {
          assert.equal(path.resolve(args.path), searchPath);
          transformedModules++;
          return {
            contents: instrument(readFileSync(args.path, "utf8")),
            loader: "ts",
            resolveDir: path.dirname(args.path),
          };
        });
      },
    },
  ],
});
assert.equal(transformedModules, 1);
const output = result.outputFiles[0];
assert(output !== undefined);
const moduleUrl =
  "data:text/javascript;base64," + Buffer.from(output.contents).toString("base64");
const harness = (await import(/* @vite-ignore */ moduleUrl)) as Harness;
export const probe = harness.probe;
export const lifecycle = harness.lifecycle;
