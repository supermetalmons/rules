import fs from "node:fs";
import path from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const sourceRoot = path.join(repositoryRoot, "src");
const maximumSourceFiles = 43;
const maximumSourceLines = 12_000;
const preferredMaximumModuleLines = 600;
const maximumModuleLines = 800;

const largeModuleReasons = new Map<string, string>([
  [
    "automove/evaluation.ts",
    "One allocation-free scoring pass shares accumulators and attack tables.",
  ],
  [
    "automove/moves.ts",
    "Complete packed move generation shares one ordered move buffer.",
  ],
  [
    "automove/search.ts",
    "Iterative deepening and selective PVS share timeout, node, and cache state.",
  ],
  [
    "automove/state.ts",
    "Packed mutation, undo, and incremental hashing share state ownership.",
  ],
  [
    "engine/game/event-compilation.ts",
    "Staged event compilation stays cohesive to preserve emitted event order.",
  ],
]);

const engineAreaDependencies = new Map<string, ReadonlySet<string>>([
  ["model", new Set(["model"])],
  ["board", new Set(["board", "model"])],
  ["rules", new Set(["rules", "board", "model"])],
  ["codec", new Set(["codec", "board", "model"])],
  ["game", new Set(["game", "board", "codec", "model", "rules"])],
]);

type Edge = {
  readonly target: string;
  readonly typeOnly: boolean;
};

type ParsedModule = {
  readonly edges: readonly Edge[];
  readonly directReexports: readonly string[];
};

type SourceGraph = ReadonlyMap<string, readonly Edge[]>;

function sourceFiles(directory = sourceRoot): string[] {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(entryPath)
        : entryPath.endsWith(".ts")
          ? [entryPath]
          : [];
    })
    .sort();
}

function relativeSourcePath(filePath: string): string {
  return path.relative(sourceRoot, filePath).split(path.sep).join("/");
}

function resolveSourceImport(from: string, specifier: string): string | undefined {
  const unresolved = path.resolve(path.dirname(from), specifier);
  const candidates = specifier.endsWith(".js")
    ? [`${unresolved.slice(0, -3)}.ts`]
    : [unresolved, `${unresolved}.ts`, path.join(unresolved, "index.ts")];
  const resolved = candidates.find((candidate) => fs.existsSync(candidate));
  if (resolved === undefined) {
    throw new Error(`${relativeSourcePath(from)} imports missing ${specifier}`);
  }
  const relative = relativeSourcePath(resolved);
  return relative.startsWith("../") || !resolved.endsWith(".ts") ? undefined : relative;
}

function typeOnlyDeclaration(
  declaration: ts.ImportDeclaration | ts.ExportDeclaration,
): boolean {
  if (ts.isImportDeclaration(declaration)) {
    const clause = declaration.importClause;
    if (clause?.phaseModifier === ts.SyntaxKind.TypeKeyword) return true;
    const bindings = clause?.namedBindings;
    return (
      clause?.name === undefined &&
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly)
    );
  }
  if (declaration.isTypeOnly) return true;
  return (
    declaration.exportClause !== undefined &&
    ts.isNamedExports(declaration.exportClause) &&
    declaration.exportClause.elements.length > 0 &&
    declaration.exportClause.elements.every((element) => element.isTypeOnly)
  );
}

function parseModule(filePath: string): ParsedModule {
  const sourcePath = relativeSourcePath(filePath);
  const source = ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const edges: Edge[] = [];
  const directReexports: string[] = [];

  for (const statement of source.statements) {
    if (
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier !== undefined &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const specifier = statement.moduleSpecifier.text;
      if (specifier.startsWith(".")) {
        const target = resolveSourceImport(filePath, specifier);
        if (target !== undefined) {
          edges.push({ target, typeOnly: typeOnlyDeclaration(statement) });
          if (ts.isExportDeclaration(statement)) {
            directReexports.push(`${sourcePath} -> ${target}`);
          }
        }
      }
    }
  }
  return { edges, directReexports };
}

function topLevelArea(filePath: string): string {
  return filePath.split("/")[0] ?? filePath;
}

function subarea(filePath: string): string | undefined {
  return filePath.split("/")[1];
}

function cycleIn(graph: SourceGraph): string[] | undefined {
  const complete = new Set<string>();
  const active = new Map<string, number>();
  const stack: string[] = [];
  const visit = (filePath: string): string[] | undefined => {
    if (complete.has(filePath)) return undefined;
    const cycleStart = active.get(filePath);
    if (cycleStart !== undefined) return [...stack.slice(cycleStart), filePath];
    active.set(filePath, stack.length);
    stack.push(filePath);
    for (const { target } of graph.get(filePath) ?? []) {
      const cycle = visit(target);
      if (cycle !== undefined) return cycle;
    }
    stack.pop();
    active.delete(filePath);
    complete.add(filePath);
    return undefined;
  };
  for (const filePath of graph.keys()) {
    const cycle = visit(filePath);
    if (cycle !== undefined) return cycle;
  }
  return undefined;
}

const files = sourceFiles();
const parsedModules = new Map(
  files.map((filePath) => [relativeSourcePath(filePath), parseModule(filePath)]),
);
const productionSourceGraph: SourceGraph = new Map(
  [...parsedModules].map(([filePath, parsed]) => [filePath, parsed.edges]),
);

describe("source architecture", () => {
  it("keeps the production import graph acyclic", () => {
    expect(cycleIn(productionSourceGraph)?.join(" -> ")).toBeUndefined();
  });

  it("keeps top-level dependencies directed and api/types as the shared leaf", () => {
    const violations: string[] = [];
    for (const [source, edges] of productionSourceGraph) {
      const sourceArea = topLevelArea(source);
      for (const { target } of edges) {
        const targetArea = topLevelArea(target);
        const allowed =
          sourceArea === targetArea ||
          (sourceArea === "entrypoints" && targetArea === "api") ||
          (sourceArea === "api" && ["automove", "engine"].includes(targetArea)) ||
          (sourceArea === "automove" && targetArea === "engine") ||
          (["automove", "engine"].includes(sourceArea) && target === "api/types.ts") ||
          (sourceArea === "cli" && targetArea === "engine");
        if (!allowed) violations.push(`${source} -> ${target}`);
      }
    }
    expect(violations).toEqual([]);
    expect(productionSourceGraph.get("api/types.ts")).toEqual([]);
  });

  it("keeps engine subareas directed and automove flat", () => {
    const violations: string[] = [];
    for (const [source, edges] of productionSourceGraph) {
      if (topLevelArea(source) !== "engine") continue;
      for (const edge of edges) {
        if (topLevelArea(edge.target) !== "engine") continue;
        if (
          source === "engine/model/domain.ts" &&
          edge.target === "engine/board/geometry.ts"
        ) {
          if (!edge.typeOnly)
            violations.push(`${source} -> ${edge.target} is not type-only`);
          continue;
        }
        const sourceArea = subarea(source);
        const targetArea = subarea(edge.target);
        if (
          sourceArea === undefined ||
          targetArea === undefined ||
          !engineAreaDependencies.get(sourceArea)?.has(targetArea)
        ) {
          violations.push(`${source} -> ${edge.target}`);
        }
      }
    }
    const nestedAutomove = [...productionSourceGraph.keys()].filter(
      (filePath) =>
        topLevelArea(filePath) === "automove" && filePath.split("/").length !== 2,
    );
    expect(violations).toEqual([]);
    expect(nestedAutomove).toEqual([]);
  });

  it("uses direct implementation imports outside deliberate boundaries", () => {
    const directViolations = [...parsedModules].flatMap(([source, parsed]) =>
      parsed.directReexports.filter(
        (reexport) =>
          source !== "entrypoints/mons-rules.ts" &&
          reexport !== "engine/model/domain.ts -> api/types.ts",
      ),
    );
    expect(directViolations).toEqual([]);
  });

  it("keeps the source tree within its physical size limits", () => {
    const modules = files.map((filePath) => {
      const contents = fs.readFileSync(filePath, "utf8");
      const lines =
        contents.length === 0
          ? 0
          : contents.split("\n").length - (contents.endsWith("\n") ? 1 : 0);
      return { filePath: relativeSourcePath(filePath), lines };
    });
    const oversized = modules
      .filter(({ lines }) => lines > maximumModuleLines)
      .map(({ filePath, lines }) => `${filePath}: ${lines}`);
    const undocumentedLarge = modules
      .filter(
        ({ filePath, lines }) =>
          lines > preferredMaximumModuleLines && !largeModuleReasons.has(filePath),
      )
      .map(({ filePath, lines }) => `${filePath}: ${lines}`);
    const staleReasons = [...largeModuleReasons]
      .filter(([filePath, reason]) => {
        const module = modules.find((candidate) => candidate.filePath === filePath);
        return reason.length === 0 || module === undefined || module.lines <= 600;
      })
      .map(([filePath]) => filePath);

    expect(modules.length).toBeLessThanOrEqual(maximumSourceFiles);
    expect(oversized).toEqual([]);
    expect(undocumentedLarge).toEqual([]);
    expect(staleReasons).toEqual([]);
    expect(
      modules.reduce((total, module) => total + module.lines, 0),
    ).toBeLessThanOrEqual(maximumSourceLines);
  });
});
