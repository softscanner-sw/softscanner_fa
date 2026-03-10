# Phase A — Manual Validation Subjects

This document records the six local regression subjects used to validate
Phase A1 and A2 output. All commands are run from the `softscanner_fa` project root.

---

> **tsconfig must include source files.**
> A solution-style tsconfig with `"files": []` and only `"references"` entries yields
> zero source files in ts-morph and therefore empty extraction by design.
> Always supply a tsconfig that directly includes source files (e.g. `tsconfig.app.json`
> for Angular CLI projects).

---

## Subject metadata

| # | Name | Local path | Framework |
|---|------|-----------|-----------|
| 1 | posts-users-ui-ng | `C:/Users/basha/git/github/posts-users-ui-ng` | Angular 18 |
| 2 | spring-petclinic-angular | `C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular` | Angular 14 |
| 3 | heroes-angular | `C:/Users/basha/git/github/heroes-angular` | Angular 14 (NgRx) — use `src/tsconfig.app.json` |
| 4 | softscanner-cqa-frontend | `C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend` | Angular 17.3 |
| 5 | ever-traduora | `C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp` | Angular 12.2 |
| 6 | airbus-inventory | `C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory` | Angular 12.2 |

---

## Exact phase1 commands

```bash
# Subject 1 — posts-users-ui-ng
npm run phase1 -- "C:/Users/basha/git/github/posts-users-ui-ng" "C:/Users/basha/git/github/posts-users-ui-ng/tsconfig.json" "output/posts-users-ui-ng" --debug

# Subject 2 — spring-petclinic-angular
npm run phase1 -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular/tsconfig.json" "output/spring-petclinic-angular" --debug

# Subject 3 — heroes-angular
# NOTE: the root tsconfig.json is a solution-style config with "files": [].
# Use src/tsconfig.app.json to include source files.
npm run phase1 -- "C:/Users/basha/git/github/heroes-angular" "C:/Users/basha/git/github/heroes-angular/src/tsconfig.app.json" "output/heroes-angular" --debug

# Subject 4 — softscanner-cqa-frontend
npm run phase1 -- "C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend" "C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend/tsconfig.app.json" "output/softscanner-cqa-frontend" --debug

# Subject 5 — ever-traduora
npm run phase1 -- "C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp" "C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp/src/tsconfig.app.json" "output/ever-traduora" --debug

# Subject 6 — airbus-inventory
npm run phase1 -- "C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory" "C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory/tsconfig.app.json" "output/airbus-inventory" --debug
```

---

## Phase A2 commands

```bash
npm run phase2 -- output/posts-users-ui-ng/json/phase1-bundle.json output/posts-users-ui-ng/json
npm run phase2 -- output/spring-petclinic-angular/json/phase1-bundle.json output/spring-petclinic-angular/json
npm run phase2 -- output/heroes-angular/json/phase1-bundle.json output/heroes-angular/json
npm run phase2 -- output/softscanner-cqa-frontend/json/phase1-bundle.json output/softscanner-cqa-frontend/json
npm run phase2 -- output/ever-traduora/json/phase1-bundle.json output/ever-traduora/json
npm run phase2 -- output/airbus-inventory/json/phase1-bundle.json output/airbus-inventory/json

```

## Visualization commands

```bash
npm run viz -- output/posts-users-ui-ng
npm run viz -- output/spring-petclinic-angular
npm run viz -- output/heroes-angular
npm run viz -- output/softscanner-cqa-frontend
npm run viz -- output/ever-traduora
npm run viz -- output/airbus-inventory
```

## Run all subjects (A1 + A2 task + viz)

```bash
npm run run:all              # A1 + A2 task + viz
npm run run:all -- --skip-a1 # reuse existing A1 bundles
```

---

## Expected output files

### A1 output (`<outputDir>/json/`)

| File | Contents |
|------|---------|
| `phase1-bundle.json` | Full `Phase1Bundle` (multigraph + stats, deterministic JSON) |
| `graph.json` | `Multigraph` — all nodes and edges |
| `routes.json` | `RouteMap` — all extracted routes |
| `components.json` | `ComponentRegistry` — all extracted components + widget IDs |
| `modules.json` | `ModuleRegistry` — all Angular modules |
| `widgetEventMaps.json` | `WidgetEventMap[]` — widget-to-handler event mappings |
| `config.json` | `AnalyzerConfig` used for the run |
| `stats.json` | Summary counts (nodeCount, edgeCount, structural, executable) |

With `--debug`, a log file is written to `logs/<subject>/<timestamp>/phase1.log`.

### A2 output (`<outputDir>/json/`)

| File | Contents |
|------|----------|
| `phaseA2-taskworkflows.final.json` | `TaskWorkflowBundle` (single-trigger task workflows, classified) |

### Visualization output (`<outputDir>/vis/`)

| File | Contents |
|------|----------|
| `data.js` | `VizData` JSON blob for browser consumption |
| `a1-graph.html` | Interactive navigation graph (Canvas 2D + force sim) |
| `a2-task-workflows.html` | A2 task workflow explorer (single-trigger tasks with effect closure, route tags, step badges) |

---

## Observed output (last validated run)

### Subject 1 — posts-users-ui-ng

| Metric | Value |
|--------|-------|
| nodeCount | 64 |
| edgeCount | 131 |
| structuralEdgeCount | 100 |
| executableEdgeCount | 31 |

**Node kinds:** `Module: 2, Route: 8, Component: 11, Widget: 41, Service: 2`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 11 |
| MODULE_DECLARES_ROUTE | 8 |
| MODULE_IMPORTS_MODULE | 1 |
| MODULE_PROVIDES_SERVICE | 2 |
| ROUTE_ACTIVATES_COMPONENT | 7 |
| COMPONENT_CONTAINS_WIDGET | 41 |
| WIDGET_CONTAINS_WIDGET | 26 |
| COMPONENT_COMPOSES_COMPONENT | 4 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| ROUTE_REDIRECTS_TO_ROUTE | 1 |
| WIDGET_NAVIGATES_ROUTE | 6 |
| WIDGET_TRIGGERS_HANDLER | 9 |
| WIDGET_SUBMITS_FORM | 3 |
| COMPONENT_CALLS_SERVICE | 9 |
| COMPONENT_NAVIGATES_ROUTE | 3 |

**A2 stats:**

| Metric | Value |
|--------|-------|
| task workflows | 18 |
| FEASIBLE | 12 |
| CONDITIONAL | 6 |
| PRUNED | 0 |
| trigger edges | 18 |
| enumerated routes | 7 |

---

### Subject 2 — spring-petclinic-angular

| Metric | Value |
|--------|-------|
| nodeCount | 191 |
| edgeCount | 422 |
| structuralEdgeCount | 294 |
| executableEdgeCount | 128 |

**Node kinds:** `Module: 16, Route: 24, Component: 22, Widget: 120, Service: 9`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 22 |
| MODULE_DECLARES_ROUTE | 24 |
| MODULE_IMPORTS_MODULE | 17 |
| MODULE_PROVIDES_SERVICE | 9 |
| ROUTE_ACTIVATES_COMPONENT | 22 |
| ROUTE_HAS_CHILD | 2 |
| COMPONENT_CONTAINS_WIDGET | 120 |
| WIDGET_CONTAINS_WIDGET | 73 |
| COMPONENT_COMPOSES_COMPONENT | 5 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| ROUTE_REDIRECTS_TO_ROUTE | 1 |
| WIDGET_NAVIGATES_ROUTE | 8 |
| WIDGET_TRIGGERS_HANDLER | 54 |
| WIDGET_SUBMITS_FORM | 12 |
| COMPONENT_CALLS_SERVICE | 19 |
| COMPONENT_NAVIGATES_ROUTE | 34 |

**A2 stats:**

| Metric | Value |
|--------|-------|
| task workflows | 74 |
| FEASIBLE | 40 |
| CONDITIONAL | 34 |
| PRUNED | 0 |
| trigger edges | 74 |
| enumerated routes | 22 |

**Note:** The `/**` wildcard route activates `PageNotFoundComponent` via a
`ROUTE_ACTIVATES_COMPONENT` edge.

**Note:** Unresolved navigation edges: 0 (down from 26 before array navigation
resolution, then from 2 to 0 via interpolation resolution and deterministic
tie-breaking for ambiguous array targets like `['/owners/add']`).

---

### Subject 3 — heroes-angular

| Metric | Value |
|--------|-------|
| nodeCount | 67 |
| edgeCount | 88 |
| structuralEdgeCount | 68 |
| executableEdgeCount | 20 |

**Node kinds:** `Module: 5, Route: 5, Component: 17, Widget: 28, Service: 2, External: 10`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 8 |
| MODULE_DECLARES_ROUTE | 5 |
| MODULE_IMPORTS_MODULE | 3 |
| MODULE_PROVIDES_SERVICE | 2 |
| ROUTE_ACTIVATES_COMPONENT | 4 |
| COMPONENT_CONTAINS_WIDGET | 28 |
| COMPONENT_COMPOSES_COMPONENT | 18 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| ROUTE_REDIRECTS_TO_ROUTE | 1 |
| WIDGET_NAVIGATES_ROUTE | 3 |
| WIDGET_NAVIGATES_EXTERNAL | 11 |
| WIDGET_TRIGGERS_HANDLER | 5 |

**A2 stats:**

| Metric | Value |
|--------|-------|
| task workflows | 19 |
| FEASIBLE | 19 |
| CONDITIONAL | 0 |
| PRUNED | 0 |
| trigger edges | 19 |
| enumerated routes | 4 |

**Note:** Run with `src/tsconfig.app.json` (not the root `tsconfig.json`, which is a
solution-style config with `"files": []` that yields zero source files).

**Note:** HeroService and VillainService use `@Injectable({ providedIn: 'root' })`.
They now have `MODULE_PROVIDES_SERVICE` edges from `AppModule` (resolved as root module).

**Note:** Route dedup eliminates duplicate `/heroes` and `/villains` routes that
appeared from both `app.module.ts` (lazy-load placeholder with `__unknown__` componentId)
and feature modules (with actual component). The canonical selection prefers the route
with a resolved component. Route count: 5 (`/`, `/**`, `/about`, `/heroes`, `/villains`).
All 4 component-bearing routes have `ROUTE_ACTIVATES_COMPONENT` edges.

---

### Subject 4 — softscanner-cqa-frontend

| Metric | Value |
|--------|-------|
| nodeCount | 37 |
| edgeCount | 74 |
| structuralEdgeCount | 57 |
| executableEdgeCount | 17 |

**Node kinds:** `Module: 3, Route: 1, Component: 10, Widget: 21, Service: 2`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 10 |
| MODULE_DECLARES_ROUTE | 1 |
| MODULE_IMPORTS_MODULE | 2 |
| MODULE_PROVIDES_SERVICE | 2 |
| ROUTE_ACTIVATES_COMPONENT | 1 |
| COMPONENT_CONTAINS_WIDGET | 21 |
| WIDGET_CONTAINS_WIDGET | 6 |
| COMPONENT_COMPOSES_COMPONENT | 14 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| WIDGET_TRIGGERS_HANDLER | 15 |
| WIDGET_SUBMITS_FORM | 1 |
| COMPONENT_CALLS_SERVICE | 1 |

**A2 stats:**

| Metric | Value |
|--------|-------|
| task workflows | 16 |
| FEASIBLE | 15 |
| CONDITIONAL | 1 |
| PRUNED | 0 |
| trigger edges | 16 |
| enumerated routes | 1 |

**Note:** Single entry route (`/`). Angular 17.3 standalone components.

---

### Subject 5 — ever-traduora

| Metric | Value |
|--------|-------|
| nodeCount | 247 |
| edgeCount | 499 |
| structuralEdgeCount | 384 |
| executableEdgeCount | 115 |

**Node kinds:** `Module: 4, Route: 20, Component: 45, Widget: 152, Service: 26`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 45 |
| MODULE_DECLARES_ROUTE | 20 |
| MODULE_IMPORTS_MODULE | 4 |
| MODULE_PROVIDES_SERVICE | 24 |
| ROUTE_ACTIVATES_COMPONENT | 18 |
| ROUTE_HAS_CHILD | 10 |
| COMPONENT_CONTAINS_WIDGET | 152 |
| WIDGET_CONTAINS_WIDGET | 51 |
| COMPONENT_COMPOSES_COMPONENT | 60 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| ROUTE_REDIRECTS_TO_ROUTE | 3 |
| WIDGET_NAVIGATES_ROUTE | 21 |
| WIDGET_TRIGGERS_HANDLER | 75 |
| WIDGET_SUBMITS_FORM | 13 |
| COMPONENT_CALLS_SERVICE | 2 |
| COMPONENT_NAVIGATES_ROUTE | 1 |

**A2 stats:**

| Metric | Value |
|--------|-------|
| task workflows | 109 |
| FEASIBLE | 46 |
| CONDITIONAL | 63 |
| PRUNED | 0 |
| trigger edges | 109 |
| enumerated routes | 18 |

**Note:** Largest graph (247 nodes, 499 edges). 18 enumerable routes (all component-bearing).
109 task workflows after child-route enumeration extension (was 41 entry-route-only, then
+9 from parent-route component inclusion, then +68 from non-entry child-route enumeration).
1 surplus trigger: `(hovered)` on drag-drop area in ImportLocaleComponent (GT policy §0.2 excludes as UI feedback).

---

### Subject 6 — airbus-inventory

| Metric | Value |
|--------|-------|
| nodeCount | 59 |
| edgeCount | 131 |
| structuralEdgeCount | 90 |
| executableEdgeCount | 41 |

**Node kinds:** `Module: 1, Route: 7, Component: 10, Widget: 36, Service: 5`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 10 |
| MODULE_DECLARES_ROUTE | 7 |
| MODULE_PROVIDES_SERVICE | 5 |
| ROUTE_ACTIVATES_COMPONENT | 6 |
| COMPONENT_CONTAINS_WIDGET | 36 |
| COMPONENT_COMPOSES_COMPONENT | 9 |
| WIDGET_CONTAINS_WIDGET | 17 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| ROUTE_REDIRECTS_TO_ROUTE | 1 |
| WIDGET_NAVIGATES_ROUTE | 5 |
| WIDGET_TRIGGERS_HANDLER | 12 |
| WIDGET_SUBMITS_FORM | 4 |
| COMPONENT_CALLS_SERVICE | 19 |

**A2 stats:**

| Metric | Value |
|--------|-------|
| task workflows | 21 |
| FEASIBLE | 13 |
| CONDITIONAL | 8 |
| PRUNED | 0 |
| trigger edges | 21 |
| enumerated routes | 6 |

**Note:** 7 entry routes (6 enumerable — `/` redirects to `/dashboard`) (all top-level routes including `/`, `/add`, `/dashboard`,
`/getAllProducts`, `/login`, `/productByCategory`, `/update`). Single module (flat architecture).

---

## Change log

**Current baseline** — Phase A stabilized. Stats reflect all A1+A2 work: spec alignment,
gap fixes (GAP A–D), post-audit patches, bounded transitive following, form-gate
containment fix, *ngIf expression/elementSpan fixes, parent-route component inclusion
fix, and child-route enumeration extension. All 6 subjects benchmark-stable and
deterministic. Full-application recall: 256/256 = 100% trigger identity match
(1 surplus, 1 wrong-constraint). See `docs/analysis/phase-a-stabilization-decision.md`.

---

## A2 Task Workflow Summary (current baseline)

| Subject | Task WFs | FEASIBLE | CONDITIONAL | PRUNED | Triggers | Enum Routes |
|---------|----------|----------|-------------|--------|----------|-------------|
| posts-users-ui-ng | 18 | 12 | 6 | 0 | 18 | 7 |
| spring-petclinic-angular | 74 | 40 | 34 | 0 | 74 | 22 |
| heroes-angular | 19 | 19 | 0 | 0 | 19 | 4 |
| softscanner-cqa-frontend | 16 | 15 | 1 | 0 | 16 | 1 |
| ever-traduora | 109 | 46 | 63 | 0 | 109 | 18 |
| airbus-inventory | 21 | 13 | 8 | 0 | 21 | 6 |


---

## Structural invariants checklist

Use these checks to spot-validate `phase1-bundle.json` and `graph.json` after
any significant change.

### phase1-bundle.json

- [ ] File is valid JSON (parseable)
- [ ] Top-level keys: `multigraph`, `stats`
- [ ] `stats.nodeCount` equals `multigraph.nodes.length`
- [ ] `stats.edgeCount` equals `multigraph.edges.length`
- [ ] `stats.structuralEdgeCount + stats.executableEdgeCount` equals `stats.edgeCount`

### graph.json (= multigraph)

- [ ] `nodes` array is present and non-empty
- [ ] 6 node kinds: `Module`, `Route`, `Component`, `Widget`, `Service`, `External`
- [ ] No node has kind `Virtual` (removed)
- [ ] For every `ComponentRoute` and `WildcardRoute` (with component) in routes,
      a `ROUTE_ACTIVATES_COMPONENT` edge exists
- [ ] For every component in `components.json`, a `Component` node exists
      with `id` equal to `ComponentInfo.id`
- [ ] `nodes` array is sorted lexicographically by `id`
- [ ] `edges` array is sorted by kind, then from, then to
- [ ] Every node has `id`, `kind`, `label`, and `refs` (non-empty array)
- [ ] Every Widget node has `meta.ui` with at minimum `rawAttrsText: {}`
- [ ] Every edge has `id`, `kind`, `from`, `to` (null only for unresolved), `constraints`, `refs`
- [ ] Widget-origin executable edges have `constraints.uiAtoms` (may be empty array)
- [ ] Executable edges have `constraints.evidence` (non-empty for widget-origin and navigation edges)
- [ ] All `from`/`to` in edges reference ids that exist in `nodes`
      (except `to === null` for unresolved navigation)
- [ ] External node IDs match the pattern `__ext__[0-9a-f]{8}` (FNV-1a hash)


### phaseA2-taskworkflows.final.json

- [ ] File is valid JSON (parseable)
- [ ] Top-level keys: `input`, `config`, `workflows`, `partitions`, `stats`
- [ ] `config.mode` equals `"task"`
- [ ] `stats.workflowCount` equals `workflows.length`
- [ ] `stats.feasibleCount + stats.conditionalCount + stats.prunedCount` equals `stats.workflowCount`
- [ ] `stats.triggerEdgeCount` equals `stats.workflowCount`
- [ ] Every workflow has `id`, `triggerEdgeId`, `startRouteIds`, `steps`, `terminalNodeId`, `cw`, `verdict`, `explanation`
- [ ] `verdict` is one of `FEASIBLE`, `CONDITIONAL`, `PRUNED`
- [ ] `workflows` array is sorted by `id`
- [ ] Every workflow `startRouteIds` is a sorted array
- [ ] Every workflow `steps` is a non-empty array of `{ edgeId, kind }`

### Module structural edges

- [ ] Every module has `MODULE_DECLARES_COMPONENT` edges for each declared component
- [ ] Every module has `MODULE_DECLARES_ROUTE` edges for each owned route
- [ ] Modules with non-empty `providers` have `MODULE_PROVIDES_SERVICE` edges
- [ ] Modules with `imports` referencing other project modules have `MODULE_IMPORTS_MODULE` edges
- [ ] Services with `providedIn: 'root'` have `MODULE_PROVIDES_SERVICE` from root module

---

## Re-running validation

After any change to graph-emitting code, re-run all six subjects and compare
stats to the expected values above. Differences must be explained before merging.

```bash
# Quick re-validation (all six subjects: A1 → A2 task → viz)
npm run run:all

# Or individually:
npm run phase1 -- "C:/Users/basha/git/github/posts-users-ui-ng" "C:/Users/basha/git/github/posts-users-ui-ng/tsconfig.json" "output/posts-users-ui-ng"
npm run phase1 -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular/tsconfig.json" "output/spring-petclinic-angular"
npm run phase1 -- "C:/Users/basha/git/github/heroes-angular" "C:/Users/basha/git/github/heroes-angular/src/tsconfig.app.json" "output/heroes-angular"
npm run phase1 -- "C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend" "C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend/tsconfig.app.json" "output/softscanner-cqa-frontend"
npm run phase1 -- "C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp" "C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp/src/tsconfig.app.json" "output/ever-traduora"
npm run phase1 -- "C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory" "C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory/tsconfig.app.json" "output/airbus-inventory"

# Determinism check (A1 + A2 task, run for each subject)
npm run verify:determinism -- "C:/Users/basha/git/github/posts-users-ui-ng" "tsconfig.json"
npm run verify:determinism -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" "tsconfig.json"
npm run verify:determinism -- "C:/Users/basha/git/github/heroes-angular" "src/tsconfig.app.json"
npm run verify:determinism -- "C:/Users/basha/git/softscanner/softscanner-continuous-quality-assessment-frontend" "tsconfig.app.json"
npm run verify:determinism -- "C:/Users/basha/git/github/autoe2e/benchmark/ever-traduora/webapp" "src/tsconfig.app.json"
npm run verify:determinism -- "C:/Users/basha/git/github/Inventory-Management-System/AirbusInventory" "tsconfig.app.json"
```
