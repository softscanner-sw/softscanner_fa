# SoftScanner — Frontend Analyzer

> Static extraction pipeline for Angular frontends: derives a deterministic **navigation-interaction multigraph** (Phase A1) and enumerates **single-trigger TaskWorkflows** (Phase A2) from source code alone.

---

## Overview

SoftScanner Frontend Analyzer performs **pure static extraction** — no runtime execution, no browser launch, no test generation. Given a TypeScript/Angular project it reads source code and produces:

1. **Phase A1** — a deterministic `Phase1Bundle`: a navigation-interaction multigraph of all routes, components, widgets, services, and the structural and executable edges that connect them.
2. **Phase A2** — a `TaskWorkflowBundle`: single-trigger TaskWorkflows enumerated from the A1 multigraph, with deterministic effect closure and feasibility classification.

```
Source code (TypeScript + Angular templates)
    |
    v
+------------------------------------------------+
|           Phase A1 — Static Extractor          |
|                                                |
|  Parsers  -> Analyzers -> NavigationGraphBuilder|
|                                                |
+------------------------------------------------+
    |
    v
Phase1Bundle  (deterministic multigraph JSON)
    |
    v
+------------------------------------------------+
|      Phase A2 — TaskWorkflow Enumeration       |
|                                                |
|  GraphIndex -> TaskEnumerator -> Classifier    |
|                                                |
+------------------------------------------------+
    |
    v
TaskWorkflowBundle  (classified workflows JSON)
```

---

## Design invariants

| Invariant | Description |
|---|---|
| **Deterministic** | Same codebase + config -> identical output (stable IDs, stable ordering). |
| **Traceable** | Every node and edge carries `SourceRef` pointers back to source file + char offset. |
| **Bounded** | Constraints are summaries only. Template snippets are length-capped. |
| **Phase-isolated** | A2 consumes only serialized A1 JSON. No AST, parser, or analyzer access. |

---

## Project structure

```
softscanner_fa/
+-- src/
|   +-- models/                         # Data model (type-only)
|   |   +-- multigraph.ts              # Phase1Bundle, Multigraph, Node, Edge, ConstraintSurface
|   |   +-- workflow.ts               # TaskWorkflow, TaskWorkflowBundle, WorkflowVerdict
|   |   +-- analysis-bundle.ts          # A1InternalBundle (debug registries)
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
|   |   +-- routes/route-analyzer.ts    # Route extraction, lazy recursion, usage counts
|   |   +-- template/                   # Per-component template pipeline
|   |   |   +-- widgets/               # AST walk -> WidgetInfo[]
|   |   |   +-- constraints/           # Visibility/enablement predicates
|   |   +-- business-logic/            # Widget events -> handler call contexts
|   |   +-- guards/                    # Guard body -> ConstraintSummary
|   |
|   +-- builders/                       # Aggregate analyzer outputs into model registries
|   |   +-- navigation-graph-builder.ts # All registries -> Multigraph (spec-compliant)
|   |   +-- component-registry-builder.ts
|   |   +-- module-registry-builder.ts
|   |   +-- route-map-builder.ts
|   |   +-- widget-event-map-builder.ts
|   |
|   +-- orchestrator/                   # End-to-end A1 pipeline
|   |   +-- phase1-orchestrator.ts      # Phase1Orchestrator.run() -> Phase1Bundle
|   |
|   +-- workflows/                      # A2: TaskWorkflow enumeration (Phase1Bundle only)
|   |   +-- graph-index.ts             # Graph indexing, active-component computation
|   |   +-- task-enumerator.ts         # Single-trigger TaskWorkflow enumeration
|   |   +-- classifier.ts             # Shared constraint merge utility
|   |   +-- pipeline.ts               # runTaskWorkflowPipeline() entry point
|   |
|   +-- visualization/                  # Pure consumer of A1/A2 artifacts
|   |   +-- data-extractor.ts           # extractVizData(Phase1Bundle) -> VizData
|   |   +-- generators.ts             # HTML generators (a1-graph, a2-task-workflows)
|   |   +-- viz-palette.ts            # Dynamic hash-based HSL palette
|   |
|   +-- services/                       # Utility services (I/O, cache, validate, export)
|   |
|   +-- cli.ts                          # Phase A1 extraction CLI
|   +-- a2-cli.ts                       # Phase A2 TaskWorkflow CLI
|   +-- viz-cli.ts                      # Visualization CLI
|
+-- scripts/
|   +-- verify-determinism.mjs          # A1 + A2 determinism checker
|   +-- run-all-subjects.mjs            # Run all 6 subjects (A1 + A2 + viz)
|
+-- docs/
|   +-- paper/approach.md               # Normative spec (frozen)
|   +-- ROADMAP.md                      # Work sequencing and gates
|   +-- validation/subjects.md          # 6 validation subjects with expected stats
|   +-- analysis/                       # GT and reconciliation artifacts
|
+-- .github/workflows/ci.yml           # CI: typecheck + test + build + lint + determinism
```

---

## Getting started

### Prerequisites

- Node.js >= 18
- npm >= 9

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

### Phase A1 — Extract multigraph

```bash
npm run phase1 -- <projectRoot> <tsConfigPath> [outputDir] [--debug]
```

| Argument | Required | Description |
|---|---|---|
| `projectRoot` | yes | Path to the target Angular project root |
| `tsConfigPath` | yes | Path to the tsconfig that **includes source files** |
| `outputDir` | no | Output directory (default: `output/<basename(projectRoot)>`) |
| `--debug` | no | Writes 7 auxiliary JSON artifacts in addition to `phase1-bundle.json` |

### Phase A2 — Enumerate TaskWorkflows

```bash
npm run phase2 -- <phase1BundlePath> [outputDir]
```

Consumes a `Phase1Bundle` JSON (A1 output) and produces `phaseA2-taskworkflows.final.json`.

### Visualization

```bash
npm run viz -- <outputDir>
```

Reads `<outputDir>/json/phase1-bundle.json` (and optional A2 artifact) and writes to `<outputDir>/vis/`:

| File | Contents |
|------|----------|
| `data.js` | `VizData` JSON blob for browser consumption |
| `a1-graph.html` | Interactive navigation graph (Canvas 2D + force simulation) |
| `a2-task-workflows.html` | Task workflow explorer with verdict badges and step details |

### Run all subjects

```bash
npm run run:all              # A1 + A2 + viz for all 6 subjects
npm run run:all -- --skip-a1 # reuse existing A1 bundles
```

### tsconfig requirement

> **The tsconfig must directly include source files.**
> Angular CLI projects generate a solution-style root `tsconfig.json` with `"files": []`.
> Passing such a tsconfig yields zero source files and empty extraction.
> **Always use `tsconfig.app.json`** (or whichever config includes your sources).

---

## Output artifacts

### A1 output (`<outputDir>/json/`)

| File | Contents |
|------|----------|
| `phase1-bundle.json` | Full `Phase1Bundle` (multigraph + stats, deterministic JSON) |
| `graph.json` | `Multigraph` — all nodes and edges (with `--debug`) |
| `routes.json` | `RouteMap` (with `--debug`) |
| `components.json` | `ComponentRegistry` (with `--debug`) |
| `modules.json` | `ModuleRegistry` (with `--debug`) |
| `widgetEventMaps.json` | `WidgetEventMap[]` (with `--debug`) |
| `config.json` | `AnalyzerConfig` (with `--debug`) |
| `stats.json` | Summary counts (with `--debug`) |

### A2 output (`<outputDir>/json/`)

| File | Contents |
|------|----------|
| `phaseA2-taskworkflows.final.json` | `TaskWorkflowBundle` (classified TaskWorkflows) |

---

## Determinism guarantee

Both A1 and A2 output are **byte-identical across runs** on the same source code. Verify with:

```bash
npm run verify:determinism -- "<projectRoot>" "<tsConfigPath>"
```

The script runs A1 + A2 extraction twice into temp directories and diffs both bundles. Exit code 0 = identical.

---

## The model at a glance

### Node kinds (6)

| Kind | Description |
|---|---|
| `Module` | Angular NgModule or standalone root |
| `Route` | Canonical route context (path + params + guards) |
| `Component` | Angular component class |
| `Widget` | Interactive element in a component template |
| `Service` | `@Injectable` class |
| `External` | Static external URL target |

### Edge kinds (18)

**Structural (11):** MODULE_DECLARES_COMPONENT, MODULE_DECLARES_ROUTE, MODULE_IMPORTS_MODULE, MODULE_EXPORTS_MODULE, MODULE_PROVIDES_SERVICE, ROUTE_ACTIVATES_COMPONENT, ROUTE_HAS_CHILD, COMPONENT_CONTAINS_WIDGET, WIDGET_CONTAINS_WIDGET, COMPONENT_COMPOSES_COMPONENT

**Executable (7):** WIDGET_NAVIGATES_ROUTE, WIDGET_NAVIGATES_EXTERNAL, WIDGET_TRIGGERS_HANDLER, WIDGET_SUBMITS_FORM, COMPONENT_CALLS_SERVICE, COMPONENT_NAVIGATES_ROUTE, ROUTE_REDIRECTS_TO_ROUTE

### TaskWorkflow (A2)

Each TaskWorkflow represents one user-trigger edge and its deterministic effect closure:
- **Trigger**: a single WTH/WSF/WNR/WNE edge
- **Steps**: trigger + handler-scoped CCS (by callsiteOrdinal) + optional CNR + redirect closure
- **Verdict**: FEASIBLE / CONDITIONAL / PRUNED
- **Constraint surface**: merged across all step edges

### ID conventions

| Entity | ID format |
|---|---|
| Route | `"<normalizedFullPath>@<moduleId>"` |
| Component | `"<file>#<ClassName>"` |
| Widget | `"<componentId>\|<file>:<line>:<col>\|<kind>\|<stableIndex>"` |
| Edge | `"<from>::<kind>::<to \| '__null__'>::<stableIndex>"` |
| External | `"__ext__<hex8>"` (FNV-1a hash) |

---

## Validation

Six regression subjects are tracked in [`docs/validation/subjects.md`](docs/validation/subjects.md). Re-run them after any change to extraction or graph-building code and confirm expected stats match.

Ground truth and reconciliation artifacts are in `docs/analysis/`.

---

## Acceptance gates

```bash
npm run typecheck        # source typecheck (tsconfig.src.json)
npm run typecheck:tests  # test typecheck (tsconfig.test.json)
npm test                 # unit + integration tests (133 tests)
npm run lint             # ESLint
npm run verify:determinism -- "<projectRoot>" "<tsConfigPath>"  # A1 + A2 determinism
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

## Contributing

See [.github/CONTRIBUTING.md](.github/CONTRIBUTING.md).

---

## License

MIT
