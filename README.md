# SoftScanner — Frontend Analyzer

> Phase 1 static extractor: derives a deterministic **navigation–interaction multigraph** from Angular (and future framework) frontend source code.

---

## Overview

SoftScanner Frontend Analyzer performs **pure static extraction** — no runtime execution, no browser launch, no test generation. Given a TypeScript/Angular project it reads source code and produces a single `Phase1AnalysisBundle`: a richly typed data model describing every route, component, widget, event handler, and the directed multigraph that connects them.

The bundle is the stable input contract for downstream phases (Phase 2: feasibility checking; Phase 3: scenario generation).

```
Source code (TypeScript + Angular templates)
    │
    ▼
┌────────────────────────────────────────────────┐
│             Phase 1 Static Extractor           │
│                                                │
│  Parsers (thin AST adapters)                   │
│  ┌──────────────┐  ┌────────────────────────┐  │
│  │ TsProjectFct │  │AngularTemplateParser   │  │
│  │ TsAstUtils   │  │TemplateAstUtils        │  │
│  │ RouteParser  │  │DecoratorParser         │  │
│  └──────┬───────┘  └──────────┬─────────────┘  │
│         │                     │                │
│  Analyzers (orchestration)                     │
│  ┌───────────────┐  ┌─────────▼────────────┐  │
│  │ RouteAnalyzer │  │  TemplateAnalyzer    │  │
│  │ LogicAnalyzer │  │  ConstraintExtractor │  │
│  │ GuardSummarizer│ │  WidgetProcessor     │  │
│  └───────┬───────┘  └──────────┬───────────┘  │
│          └──────────┬──────────┘               │
│                     ▼                          │
│         Navigation–Interaction Multigraph      │
└────────────────────────────────────────────────┘
    │
    ▼
Phase1AnalysisBundle  (deterministic, JSON-serializable)
```

---

## Design invariants

| Invariant | Description |
|---|---|
| **Deterministic** | Same codebase + config → identical output (stable IDs, stable ordering). |
| **Traceable** | Every entity carries an `Origin` pointer back to source file + line. |
| **Bounded** | Constraints are summaries only. Template snippets are length-capped. |
| **Minimal** | Only fields needed for Phase 1 extraction and Phase 2 inputs are included. |

---

## Project structure

```
softscanner_fa/
├── src/
│   ├── models/                         # Phase 1 data model (type-only)
│   │   ├── index.ts                    # Barrel export
│   │   ├── origin.ts                   # Origin — source provenance pointer
│   │   ├── constraints.ts              # ConstraintSummary, Predicate
│   │   ├── analyzer-config.ts          # AnalyzerConfig, BackendGranularity
│   │   ├── module.ts                   # ModuleInfo, ModuleRegistry
│   │   ├── routes.ts                   # Route, RouteMap, ComponentRouteMap
│   │   ├── components.ts               # ComponentInfo, ComponentRegistry
│   │   ├── widgets.ts                  # WidgetInfo, WidgetKind, WidgetBinding
│   │   ├── events.ts                   # WidgetEvent, EventHandlerCallContext
│   │   ├── navigation-graph.ts         # GraphNode, GraphEdge, AppNavigation
│   │   └── analysis-bundle.ts          # Phase1AnalysisBundle (top-level DTO)
│   │
│   ├── parsers/                        # Thin, deterministic AST adapters
│   │   ├── ts/
│   │   │   ├── ts-project-factory.ts   # ts-morph Project factory
│   │   │   └── ts-ast-utils.ts         # Node→Origin, symbol resolution, literals
│   │   └── angular/
│   │       ├── decorator-parser.ts     # @Component metadata extraction
│   │       ├── route-parser.ts         # Routes array → ParsedRouteRecord[]
│   │       ├── template-parser.ts      # @angular/compiler adapter → TemplateAstNode
│   │       └── template-ast-utils.ts   # Structural directives, bindings, spans→Origin
│   │
│   ├── analyzers/                      # Domain analyzers (use parsers, emit model objects)
│   │   ├── routes/
│   │   │   ├── route-analyzer.ts       # Route extraction, lazy recursion, usage counts
│   │   │   └── route-utils.ts          # Path normalisation, ID generation, dedup
│   │   ├── template/
│   │   │   ├── template-analyzer.ts    # Per-component template pipeline
│   │   │   ├── template-utils.ts       # resolve → parse → extract glue functions
│   │   │   ├── widgets/
│   │   │   │   ├── widget-processor.ts # AST walk → WidgetInfo[]
│   │   │   │   └── widget-utils.ts     # Classification, ID gen, attribute helpers
│   │   │   └── constraints/
│   │   │       └── template-constraint-extractor.ts  # Visibility/enablement predicates
│   │   ├── business-logic/
│   │   │   ├── logic-analyzer.ts       # Widget events → handler call contexts
│   │   │   └── logic-utils.ts          # Event type normalisation, call-context heuristics
│   │   └── guards/
│   │       └── guard-constraint-summarizer.ts  # Guard body → ConstraintSummary
│   │
│   ├── builders/                       # Aggregate analyzer outputs into model registries
│   │   ├── index.ts
│   │   ├── ts-project-builder.ts       # AnalyzerConfig → ts-morph Project
│   │   ├── component-registry-builder.ts  # Project → ComponentRegistry + WidgetInfo map
│   │   ├── module-registry-builder.ts  # Project → ModuleRegistry
│   │   ├── route-map-builder.ts        # Project + ComponentRegistry → ComponentRouteMap
│   │   ├── widget-event-map-builder.ts # Project + registry + widgets → WidgetEventMap[]
│   │   └── navigation-graph-builder.ts # All registries → AppNavigation multigraph
│   │
│   ├── orchestrator/                   # End-to-end pipeline
│   │   ├── index.ts
│   │   └── phase1-orchestrator.ts      # Phase1Orchestrator.run() → Phase1AnalysisBundle
│   │
│   └── services/                       # Utility services (I/O, cache, validate, export)
│       ├── index.ts
│       ├── file-service.ts             # Sandboxed file reads within projectRoot
│       ├── analysis-cache.ts           # In-memory memoization
│       ├── analysis-validator.ts       # Phase 1 invariant checks (fail-fast)
│       └── analysis-exporter.ts        # Deterministic JSON serialization
│
├── .github/
│   ├── workflows/ci.yml                # CI: typecheck + test (Node 18/20/22) + build + lint
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml
│   │   ├── model_proposal.yml
│   │   └── feature_request.yml
│   ├── pull_request_template.md
│   └── CONTRIBUTING.md
│
├── tsconfig.json                       # Base config (strict, NodeNext, rootDir .)
├── tsconfig.build.json                 # Emit config (rootDir ./src → dist/)
└── package.json
```

---

## Getting started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9 (or pnpm / yarn)

### Install

```bash
npm install
```

### Typecheck (no emit)

```bash
npm run typecheck
```

### Build (emits to `dist/`)

```bash
npm run build
```

### Test

```bash
npm test
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
# → writes to output/my-app/phase1-bundle.json  (+ 7 debug files)
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
# Correct — tsconfig.app.json includes src/**/*.ts
npm run phase1 -- /path/to/app /path/to/app/tsconfig.app.json

# Wrong — solution-style tsconfig has "files": [], yields nothing
npm run phase1 -- /path/to/app /path/to/app/tsconfig.json  # ← if files:[]
```

---

## Output artifacts

Every run writes the following files to `outputDir`:

| File | Contents |
|------|----------|
| `phase1-bundle.json` | Full `Phase1AnalysisBundle` — all sections, deterministic JSON |
| `graph.json` | `AppNavigation` — nodes and edges of the multigraph |
| `routes.json` | `RouteMap` — all extracted routes |
| `components.json` | `ComponentRegistry` — all extracted components + widget IDs |
| `modules.json` | `ModuleRegistry` — all Angular modules |
| `widgetEventMaps.json` | `WidgetEventMap[]` — widget → handler event mappings |
| `config.json` | `AnalyzerConfig` used for the run |
| `stats.json` | `Phase1Stats` — counts of modules / routes / components / widgets / edges |

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

## Validation

Three regression subjects are tracked in [`docs/validation/subjects.md`](docs/validation/subjects.md).
Re-run them after any change to `NavigationGraphBuilder`, `RouteMapBuilder`, or
`ComponentRegistryBuilder` and confirm the expected stats match.

---

## Branch protection (main)

The following CI checks are required to pass before merging to `main`:

| Check name | Job |
|---|---|
| `Typecheck & Test (Node 18)` | typecheck-and-test matrix |
| `Typecheck & Test (Node 20)` | typecheck-and-test matrix |
| `Typecheck & Test (Node 22)` | typecheck-and-test matrix |
| `Build` | build |
| `Lint` | lint |
| `Determinism` | determinism |

Configure in **Settings → Branches → Branch protection rules → Require status checks to pass**.

---

## Release v0.1-a1 procedure

1. Run all acceptance gates locally and confirm they pass:
   ```bash
   npm run typecheck
   npm test
   npm run lint
   npm run verify:determinism -- "<projectRoot>" "<tsConfigPath>"
   ```
2. Re-run all three validation subjects and confirm stats match `docs/validation/subjects.md`.
3. Confirm working tree is clean (`git status`).
4. Create the tag and push:
   ```bash
   git tag v0.1-a1
   git push origin main --tags
   ```
5. Confirm CI is green on the tag on GitHub.
6. After CI passes, create branch `feat/a2-bounded-paths` — A2 scaffold may begin.

---

## The model at a glance

### `Phase1AnalysisBundle` — top-level output

```ts
import type { Phase1AnalysisBundle } from '@softscanner/frontend-analyzer';

const bundle: Phase1AnalysisBundle = await orchestrator.run(config);

bundle.routeMap.routes;            // all normalised routes, sorted by fullPath
bundle.componentRegistry.byId;    // O(1) component lookup
bundle.widgetEventMaps;            // per-component widget→event→handler mappings
bundle.navigation.nodes;           // graph vertices
bundle.navigation.edges;           // multigraph edges with transitions
bundle.stats;                      // quick count summary
```

### ID conventions

| Entity | ID key |
|---|---|
| `Route` | `"<normalizedFullPath>@<moduleId>"` |
| `ComponentInfo` | `"<file>#<ClassName>"` |
| `WidgetInfo` | `"<componentId>\|<file>:<line>:<col>\|<kind>\|<stableIndex>"` |
| `GraphNode` | equals underlying entity id (or URL hash for External) |
| `GraphEdge` | `from + transition signature + to + stableIndex` |

### Ordering rules (determinism)

| Collection | Sort key |
|---|---|
| Routes | `fullPath` lexicographic |
| Components | `symbol.canonicalName` |
| Widgets | `origin.file` → `startLine` → `startCol` → `stableIndex` |
| Graph nodes / edges | `id` lexicographic |
| All "sorted, unique" arrays | enforced at construction |

---

## Pipeline (Phase1Orchestrator)

```ts
const bundle = new Phase1Orchestrator(cfg, { outputPath: 'out/bundle.json' }).run();
```

```
Phase1Orchestrator.run(cfg)
    │
    ├─ 1. TsProjectBuilder.build(cfg)
    │         └─ TsProjectFactory.create(tsConfigPath)
    │         └─ → Project
    │
    ├─ 2. ComponentRegistryBuilder.build(project)
    │         └─ DecoratorParser.extractComponentMeta  (per @Component)
    │         └─ AngularTemplateParser.parse(template)
    │         └─ WidgetProcessor.process(ast)
    │         └─ TemplateConstraintExtractor.extract(…) ← attaches predicates
    │         └─ → ComponentRegistry  +  widgetsByComponentId (internal)
    │
    ├─ 3. ModuleRegistryBuilder.build(project)
    │         └─ Two-pass: discover @NgModule → determine roles + lazy boundaries
    │         └─ → ModuleRegistry
    │
    ├─ 4. RouteMapBuilder.build(project, componentRegistry)
    │         └─ RouteAnalyzer.analyzeRoutes(componentRegistry)
    │         └─ GuardConstraintSummarizer.summarize(project, routeMap)
    │         └─ → ComponentRouteMap  (includes enriched RouteMap)
    │
    ├─ 5. WidgetEventMapBuilder.build(project, componentRegistry, routeMap, widgets)
    │         └─ LogicAnalyzer.analyze(file, widgets, routeMap)  (per component)
    │         └─ → WidgetEventMap[]
    │
    ├─ 6. NavigationGraphBuilder.build(componentRouteMap, componentRegistry,
    │                                   widgetEventMaps, moduleRegistry, widgets)
    │         └─ Route nodes + External nodes + Virtual entry
    │         └─ REDIRECT edges (RedirectRoute declarations)
    │         └─ NAVIGATE_ROUTE edges (routerLink bindings + navigate() calls)
    │         └─ NAVIGATE_EXTERNAL edges (href + external URL calls)
    │         └─ → AppNavigation
    │
    ├─ 7. Assemble Phase1AnalysisBundle + stats
    │
    ├─ 8. AnalysisValidator.validatePhase1(bundle)  ← fail-fast
    │
    └─ 9. Return bundle  (optionally write JSON via AnalysisExporter)
```

---

## Validation rules

Any valid `Phase1AnalysisBundle` must satisfy:

1. Every `ComponentRoute.componentId` references an existing `ComponentInfo.id`.
2. Every `WidgetEvent.widgetId` exists in the owning component's `widgets` list.
3. Every `GraphEdge.from` / `.to` exists in `navigation.nodes`.
4. For UI-triggered graph transitions, `trigger.widgetId` must exist and `origin` must point to a template.
5. All "sorted, unique" array fields are enforced at construction time.

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
