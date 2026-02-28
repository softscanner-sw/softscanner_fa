# SoftScanner — Frontend Analyzer

> Phase 1 static extractor: derives a deterministic **navigation-interaction multigraph** from Angular (and future framework) frontend source code.

---

## Overview

SoftScanner Frontend Analyzer performs **pure static extraction** — no runtime execution, no browser launch, no test generation. Given a TypeScript/Angular project it reads source code and produces a single `Phase1Bundle`: a deterministic navigation-interaction multigraph of all routes, components, widgets, services, and the structural and executable edges that connect them.

The bundle is the stable input contract for downstream phases (Phase 2: workflow enumeration; Phase 3: workflow classification).

```
Source code (TypeScript + Angular templates)
    |
    v
+------------------------------------------------+
|             Phase 1 Static Extractor           |
|                                                |
|  Parsers (thin AST adapters)                   |
|  +--------------+  +------------------------+  |
|  | TsProjectFct |  |AngularTemplateParser   |  |
|  | TsAstUtils   |  |TemplateAstUtils        |  |
|  | RouteParser  |  |DecoratorParser         |  |
|  +------+-------+  +----------+-------------+  |
|         |                     |                |
|  Analyzers (orchestration)                     |
|  +---------------+  +---------v------------+  |
|  | RouteAnalyzer |  |  TemplateAnalyzer    |  |
|  | LogicAnalyzer |  |  ConstraintExtractor |  |
|  | GuardSummarizer| |  WidgetProcessor     |  |
|  +-------+-------+  +----------+-----------+  |
|          +----------+----------+               |
|                     v                          |
|         Navigation-Interaction Multigraph      |
+------------------------------------------------+
    |
    v
Phase1Bundle  (deterministic, JSON-serializable)
```

---

## Design invariants

| Invariant | Description |
|---|---|
| **Deterministic** | Same codebase + config -> identical output (stable IDs, stable ordering). |
| **Traceable** | Every node and edge carries `SourceRef` pointers back to source file + char offset. |
| **Bounded** | Constraints are summaries only. Template snippets are length-capped. |
| **Minimal** | Only fields needed for Phase 1 extraction and Phase 2 inputs are included. |

---

## Project structure

```
softscanner_fa/
+-- src/
|   +-- models/                         # Phase 1 data model (type-only)
|   |   +-- index.ts                    # Barrel export
|   |   +-- multigraph.ts              # Phase1Bundle, Multigraph, Node, Edge, ConstraintSurface
|   |   +-- analysis-bundle.ts          # A1InternalBundle (debug registries; re-exports Phase1Bundle)
|   |   +-- origin.ts                   # Origin -- source provenance pointer
|   |   +-- constraints.ts              # ConstraintSummary, Predicate
|   |   +-- analyzer-config.ts          # AnalyzerConfig, BackendGranularity
|   |   +-- module.ts                   # ModuleInfo, ModuleRegistry
|   |   +-- routes.ts                   # Route, RouteMap, ComponentRouteMap
|   |   +-- components.ts               # ComponentInfo, ComponentRegistry
|   |   +-- widgets.ts                  # WidgetInfo, WidgetKind, WidgetBinding
|   |   +-- events.ts                   # WidgetEvent, EventHandlerCallContext
|   |
|   +-- parsers/                        # Thin, deterministic AST adapters
|   |   +-- ts/
|   |   |   +-- ts-project-factory.ts   # ts-morph Project factory
|   |   |   +-- ts-ast-utils.ts         # Node->Origin, symbol resolution, literals
|   |   +-- angular/
|   |       +-- decorator-parser.ts     # @Component metadata extraction
|   |       +-- route-parser.ts         # Routes array -> ParsedRouteRecord[]
|   |       +-- template-parser.ts      # @angular/compiler adapter -> TemplateAstNode
|   |       +-- template-ast-utils.ts   # Structural directives, bindings, spans->Origin
|   |
|   +-- analyzers/                      # Domain analyzers (use parsers, emit model objects)
|   |   +-- routes/
|   |   |   +-- route-analyzer.ts       # Route extraction, lazy recursion, usage counts
|   |   |   +-- route-utils.ts          # Path normalisation, ID generation, dedup
|   |   +-- template/
|   |   |   +-- template-analyzer.ts    # Per-component template pipeline
|   |   |   +-- template-utils.ts       # resolve -> parse -> extract glue functions
|   |   |   +-- widgets/
|   |   |   |   +-- widget-processor.ts # AST walk -> WidgetInfo[]
|   |   |   |   +-- widget-utils.ts     # Classification, ID gen, attribute helpers
|   |   |   +-- constraints/
|   |   |       +-- template-constraint-extractor.ts  # Visibility/enablement predicates
|   |   +-- business-logic/
|   |   |   +-- logic-analyzer.ts       # Widget events -> handler call contexts
|   |   |   +-- logic-utils.ts          # Event type normalisation, call-context heuristics
|   |   +-- guards/
|   |       +-- guard-constraint-summarizer.ts  # Guard body -> ConstraintSummary
|   |
|   +-- builders/                       # Aggregate analyzer outputs into model registries
|   |   +-- index.ts
|   |   +-- ts-project-builder.ts       # AnalyzerConfig -> ts-morph Project
|   |   +-- component-registry-builder.ts  # Project -> ComponentRegistry + WidgetInfo map
|   |   +-- module-registry-builder.ts  # Project -> ModuleRegistry
|   |   +-- route-map-builder.ts        # Project + ComponentRegistry -> ComponentRouteMap
|   |   +-- widget-event-map-builder.ts # Project + registry + widgets -> WidgetEventMap[]
|   |   +-- navigation-graph-builder.ts # All registries -> Multigraph (spec-compliant)
|   |
|   +-- orchestrator/                   # End-to-end pipeline
|   |   +-- index.ts
|   |   +-- phase1-orchestrator.ts      # Phase1Orchestrator.run() -> Phase1Bundle
|   |
|   +-- services/                       # Utility services (I/O, cache, validate, export)
|   |   +-- index.ts
|   |   +-- file-service.ts             # Sandboxed file reads within projectRoot
|   |   +-- analysis-cache.ts           # In-memory memoization
|   |   +-- analysis-validator.ts       # Phase 1 invariant checks (fail-fast)
|   |   +-- analysis-exporter.ts        # Deterministic JSON serialization
|   |   +-- logger.ts                   # ConsoleLogger, FileLogger, TeeLogger, SilentLogger
|   |
|   +-- visualization/                  # Pure consumer of A1 artifacts for debugging
|   |   +-- types.ts                    # VizData contract
|   |   +-- data-extractor.ts           # extractVizData(Phase1Bundle, paths) -> VizData
|   |   +-- path-finder.ts             # Bounded DFS exemplar path finder
|   |   +-- pruning-policy.ts          # Demo pruning policy (mock A3)
|   |   +-- generators.ts             # 3 HTML generators (a1-graph, a2-mock, a3-mock)
|   |   +-- viz-palette.ts            # Node/edge color constants
|   |
|   +-- cli.ts                          # Phase 1 extraction CLI entry point
|   +-- viz-cli.ts                      # Visualization CLI entry point
|
+-- .github/
|   +-- workflows/ci.yml                # CI: typecheck + test (Node 18/20/22) + build + lint + determinism
|   +-- ISSUE_TEMPLATE/
|   |   +-- bug_report.yml
|   |   +-- model_proposal.yml
|   |   +-- feature_request.yml
|   +-- pull_request_template.md
|   +-- CONTRIBUTING.md
|
+-- tsconfig.json                       # Solution-style root (references src + test)
+-- tsconfig.src.json                   # Source typecheck config (strict, NodeNext)
+-- tsconfig.test.json                  # Test typecheck config (types: node, jest)
+-- tsconfig.build.json                 # Emit config (rootDir ./src -> dist/)
+-- package.json
```

---

## Getting started

### Prerequisites

- Node.js >= 18
- npm >= 9 (or pnpm / yarn)

### Install

```bash
npm install
```

### Typecheck (no emit)

```bash
npm run typecheck        # source files (tsconfig.src.json)
npm run typecheck:tests  # test files (tsconfig.test.json)
```

### Build (emits to `dist/`)

```bash
npm run build
```

### Test

```bash
npm test
```

### Lint

```bash
npm run lint
```

---

## CLI

Run Phase 1 extraction on any Angular project:

```bash
npm run phase1 -- <projectRoot> <tsConfigPath> [outputDir] [--debug]
```

| Argument | Required | Description |
|---|---|---|
| `projectRoot` | yes | Absolute or relative path to the target project root |
| `tsConfigPath` | yes | Path to the tsconfig that **includes source files** |
| `outputDir` | no | Directory to write JSON artifacts (default: `output/<basename(projectRoot)>`) |
| `--debug` | no | Writes the 7 auxiliary JSON artifacts in addition to `phase1-bundle.json` (8 total) |

**Default output directory:** when `outputDir` is omitted, the CLI writes to
`output/<basename(projectRoot)>` relative to the current working directory.

**Example:**

```bash
npm run phase1 -- "/path/to/my-app" "/path/to/my-app/tsconfig.app.json"
# -> writes to output/my-app/json/phase1-bundle.json  (+ 7 debug files)
```

### tsconfig requirement

> **The tsconfig must directly include source files.**
> Angular CLI projects generate a solution-style root `tsconfig.json` with `"files": []`
> that only references other configs via `"references": [...]`.
> Passing such a tsconfig yields zero source files and therefore empty extraction.
>
> **Always use `tsconfig.app.json`** (or whichever config has `include`/`files` pointing
> to your TypeScript sources).

```bash
# Correct -- tsconfig.app.json includes src/**/*.ts
npm run phase1 -- /path/to/app /path/to/app/tsconfig.app.json

# Wrong -- solution-style tsconfig has "files": [], yields nothing
npm run phase1 -- /path/to/app /path/to/app/tsconfig.json  # <- if files:[]
```

---

## Output artifacts

Every run writes `phase1-bundle.json` to `<outputDir>/json/`.
With `--debug`, the 7 auxiliary files are also written:

| File | Contents |
|------|----------|
| `phase1-bundle.json` | Full `Phase1Bundle` (multigraph + stats, deterministic JSON) |
| `graph.json` | `Multigraph` -- all nodes and edges |
| `routes.json` | `RouteMap` -- all extracted routes |
| `components.json` | `ComponentRegistry` -- all extracted components + widget IDs |
| `modules.json` | `ModuleRegistry` -- all Angular modules |
| `widgetEventMaps.json` | `WidgetEventMap[]` -- widget-to-handler event mappings |
| `config.json` | `AnalyzerConfig` used for the run |
| `stats.json` | Summary counts: nodeCount, edgeCount, structuralEdgeCount, executableEdgeCount |

---

## Determinism guarantee

Phase 1 output is **byte-identical across runs** on the same source code.
Verify this with:

```bash
npm run verify:determinism -- "<projectRoot>" "<tsConfigPath>"
```

The script runs extraction twice into temp directories and diffs
`phase1-bundle.json`. Exit code 0 = identical; exit code 1 = diverged.

---

## Visualization

Generate interactive HTML visualizations from A1 outputs:

```bash
npm run viz -- <outputDir>
```

| Argument | Required | Description |
|---|---|---|
| `outputDir` | yes | Base output directory (same one passed to `npm run phase1`) |

The command reads `<outputDir>/json/phase1-bundle.json` and writes to `<outputDir>/vis/`:

| File | Contents |
|------|----------|
| `data.js` | `VizData` JSON blob for browser consumption |
| `a1-graph.html` | Interactive navigation graph (Canvas 2D + force simulation) |
| `a2-mock-workflows.html` | Exemplar workflow cards (mock -- real A2 not yet implemented) |
| `a3-mock-pruning.html` | Pruning decision view (mock -- real A3 not yet implemented) |

**Example:**

```bash
npm run phase1 -- "/path/to/my-app" "/path/to/my-app/tsconfig.app.json" "output/my-app"
npm run viz -- output/my-app
# -> writes to output/my-app/vis/
```

---

## Validation

Three regression subjects are tracked in [`docs/validation/subjects.md`](docs/validation/subjects.md).
Re-run them after any change to extraction or graph-building code and confirm the expected stats match.

---

## Acceptance gates

The following gates must pass before merging to `main`:

```bash
npm run typecheck        # source typecheck (tsconfig.src.json)
npm run typecheck:tests  # test typecheck (tsconfig.test.json)
npm test                 # unit + integration tests
npm run lint             # ESLint
npm run verify:determinism -- "<projectRoot>" "<tsConfigPath>"  # determinism
```

### CI checks (branch protection)

| Check name | Job |
|---|---|
| `Typecheck & Test (Node 18)` | typecheck-and-test matrix |
| `Typecheck & Test (Node 20)` | typecheck-and-test matrix |
| `Typecheck & Test (Node 22)` | typecheck-and-test matrix |
| `Build` | build |
| `Lint` | lint |
| `Determinism` | determinism |

---

## The model at a glance

### `Phase1Bundle` -- top-level output

```ts
import type { Phase1Bundle } from '@softscanner/frontend-analyzer';

const bundle: Phase1Bundle = new Phase1Orchestrator(cfg, options).run();

bundle.multigraph.nodes;              // all graph vertices (6 node kinds)
bundle.multigraph.edges;              // all edges (structural + executable)
bundle.stats.nodeCount;               // quick count summary
bundle.stats.edgeCount;
bundle.stats.structuralEdgeCount;
bundle.stats.executableEdgeCount;
```

### Node kinds

| Kind | Description |
|---|---|
| `Module` | Angular NgModule or standalone root |
| `Route` | Canonical route context (path + params + guards) |
| `Component` | Angular component class |
| `Widget` | Interactive element in a component template |
| `Service` | `@Injectable` class |
| `External` | Static external URL target |

### ID conventions

| Entity | ID format |
|---|---|
| Route | `"<normalizedFullPath>@<moduleId>"` |
| Component | `"<file>#<ClassName>"` |
| Widget | `"<componentId>\|<file>:<line>:<col>\|<kind>\|<stableIndex>"` |
| Node | equals underlying entity ID (or `__ext__<hex8>` for External via FNV-1a hash) |
| Edge | `"<from>::<kind>::<to \| '__null__'>::<stableIndex>"` |

### Ordering rules (determinism)

| Collection | Sort key |
|---|---|
| Nodes | `id` lexicographic |
| Edges | `(from, kind, to ?? '', id)` composite |
| Routes (internal) | `fullPath` lexicographic |
| Components (internal) | `symbol.canonicalName` |
| Widgets (internal) | `origin.file` -> `startLine` -> `startCol` -> `stableIndex` |

---

## Pipeline (Phase1Orchestrator)

```
Phase1Orchestrator.run(cfg)
    |
    +- 1. TsProjectBuilder.build(cfg)
    |         +- TsProjectFactory.create(tsConfigPath)
    |         +- -> Project
    |
    +- 2. ComponentRegistryBuilder.build(project)
    |         +- DecoratorParser.extractComponentMeta  (per @Component)
    |         +- AngularTemplateParser.parse(template)
    |         +- WidgetProcessor.process(ast)
    |         +- TemplateConstraintExtractor.extract(...) <- attaches predicates
    |         +- -> ComponentRegistry  +  widgetsByComponentId (internal)
    |
    +- 3. ModuleRegistryBuilder.build(project)
    |         +- Two-pass: discover @NgModule -> determine roles + lazy boundaries
    |         +- -> ModuleRegistry
    |
    +- 4. RouteMapBuilder.build(project, componentRegistry)
    |         +- RouteAnalyzer.analyzeRoutes(componentRegistry)
    |         +- GuardConstraintSummarizer.summarize(project, routeMap)
    |         +- -> ComponentRouteMap  (includes enriched RouteMap)
    |
    +- 5. WidgetEventMapBuilder.build(project, componentRegistry, routeMap, widgets)
    |         +- LogicAnalyzer.analyze(file, widgets, routeMap)  (per component)
    |         +- -> WidgetEventMap[]
    |
    +- 6. Service extraction (scan @Injectable classes)
    |         +- -> ServiceInfo[]
    |
    +- 7. NavigationGraphBuilder.build(componentRouteMap, componentRegistry,
    |                                   widgetEventMaps, moduleRegistry, widgets, services)
    |         +- Module nodes + Route nodes (isEntry computed) + Component nodes
    |         +- Widget nodes + Service nodes + External nodes
    |         +- Structural edges (11 kinds)
    |         +- Executable edges (7 kinds)
    |         +- -> Multigraph
    |
    +- 8. Assemble Phase1Bundle (multigraph + stats)
    |
    +- 9. AnalysisValidator.validatePhase1(bundle)  <- fail-fast
    |
    +- 10. Return bundle  (optionally write JSON via AnalysisExporter)
```

---

## Validation rules

Any valid `Phase1Bundle` must satisfy:

1. Every node has a non-empty `refs` array.
2. Every edge has a non-empty `refs` array.
3. Every `Edge.from` references an existing `Node.id`.
4. Every `Edge.to` (when non-null) references an existing `Node.id`.
5. Unresolved navigation: `to === null` iff `targetRouteId === null`.
6. Nodes are sorted by `id` lexicographically.
7. Edges are sorted by `(from, kind, to ?? '', id)`.
8. No duplicate node IDs.
9. `stats` counts match actual array lengths.

---

## Explicit non-goals (Phase 1)

The following are **never produced** by this package:

- `UserJourney`, `Scenario`, `WorkflowResult`
- `Screenshot`, `Execution`, `CoverageResult`
- Satisfiability / feasibility results
- LLM-based refinement artifacts

These belong to Phase 2 and Phase 3.

---

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

---

## License

MIT
