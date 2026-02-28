# Phase A1 — Manual Validation Subjects

This document records the three local regression subjects used to validate
Phase A1 output. All commands are run from the `softscanner_fa` project root.

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
```

---

## Visualization commands

```bash
npm run viz -- output/posts-users-ui-ng
npm run viz -- output/spring-petclinic-angular
npm run viz -- output/heroes-angular
```

---

## Expected output files

Each run writes the following files under `<outputDir>/json/`:

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

The `npm run viz` command writes to `<outputDir>/vis/`:

| File | Contents |
|------|---------|
| `data.js` | `VizData` JSON blob for browser consumption |
| `a1-graph.html` | Interactive navigation graph (Canvas 2D + force sim) |
| `a2-mock-workflows.html` | Exemplar workflow cards |
| `a3-mock-pruning.html` | Pruning decision view |

---

## Observed output (last validated run)

### Subject 1 — posts-users-ui-ng

| Metric | Value |
|--------|-------|
| nodeCount | 58 |
| edgeCount | 115 |
| structuralEdgeCount | 68 |
| executableEdgeCount | 47 |

**Node kinds:** `Module: 2, Route: 8, Component: 11, Widget: 35, Service: 2`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 11 |
| MODULE_DECLARES_ROUTE | 8 |
| MODULE_IMPORTS_MODULE | 1 |
| MODULE_PROVIDES_SERVICE | 2 |
| ROUTE_ACTIVATES_COMPONENT | 7 |
| COMPONENT_CONTAINS_WIDGET | 35 |
| COMPONENT_COMPOSES_COMPONENT | 4 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| ROUTE_REDIRECTS_TO_ROUTE | 1 |
| WIDGET_NAVIGATES_ROUTE | 6 |
| WIDGET_TRIGGERS_HANDLER | 16 |
| COMPONENT_CALLS_SERVICE | 22 |
| COMPONENT_NAVIGATES_ROUTE | 2 |

**Viz stats:** 10 exemplar paths (9 feasible, 1 conditional, 0 pruned)

---

### Subject 2 — spring-petclinic-angular

| Metric | Value |
|--------|-------|
| nodeCount | 190 |
| edgeCount | 371 |
| structuralEdgeCount | 220 |
| executableEdgeCount | 151 |

**Node kinds:** `Module: 16, Route: 24, Component: 22, Widget: 119, Service: 9`

**Edge kinds (structural):**

| Kind | Count |
|------|-------|
| MODULE_DECLARES_COMPONENT | 22 |
| MODULE_DECLARES_ROUTE | 24 |
| MODULE_IMPORTS_MODULE | 17 |
| MODULE_PROVIDES_SERVICE | 9 |
| ROUTE_ACTIVATES_COMPONENT | 22 |
| ROUTE_HAS_CHILD | 2 |
| COMPONENT_CONTAINS_WIDGET | 119 |
| COMPONENT_COMPOSES_COMPONENT | 5 |

**Edge kinds (executable):**

| Kind | Count |
|------|-------|
| ROUTE_REDIRECTS_TO_ROUTE | 1 |
| WIDGET_NAVIGATES_ROUTE | 8 |
| WIDGET_TRIGGERS_HANDLER | 75 |
| COMPONENT_CALLS_SERVICE | 42 |
| COMPONENT_NAVIGATES_ROUTE | 25 |

**Viz stats:** 38 exemplar paths (23 feasible, 15 conditional, 0 pruned)

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
| edgeCount | 105 |
| structuralEdgeCount | 68 |
| executableEdgeCount | 37 |

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
| WIDGET_TRIGGERS_HANDLER | 19 |
| COMPONENT_CALLS_SERVICE | 3 |

**Viz stats:** 3 exemplar paths (3 feasible, 0 conditional, 0 pruned)

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

## Change log (stat deltas from previous baseline)

| Subject | Metric | Old | New | Delta | Reason |
|---------|--------|-----|-----|-------|--------|
| posts-users-ui-ng | edgeCount | 114 | 115 | +1 | +1 MODULE_IMPORTS_MODULE (AppModule→MaterialModule) |
| posts-users-ui-ng | structuralEdgeCount | 67 | 68 | +1 | Same |
| spring-petclinic-angular | edgeCount | 354 | 371 | +17 | +17 MODULE_IMPORTS_MODULE edges |
| spring-petclinic-angular | structuralEdgeCount | 203 | 220 | +17 | Same |
| heroes-angular | nodeCount | 69 | 67 | -2 | Route dedup (removed dup `/heroes`, `/villains`) |
| heroes-angular | edgeCount | 102 | 105 | +3 | +3 MODULE_IMPORTS_MODULE, +2 MODULE_PROVIDES_SERVICE, +2 ROUTE_ACTIVATES_COMPONENT (dedup retains component), -2 MODULE_DECLARES_ROUTE (dedup), -2 (removed dup routes) |
| heroes-angular | structuralEdgeCount | 65 | 68 | +3 | Same |

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
- [ ] Every edge has `id`, `kind`, `from`, `to` (null only for unresolved), `constraints`, `refs`
- [ ] All `from`/`to` in edges reference ids that exist in `nodes`
      (except `to === null` for unresolved navigation)
- [ ] External node IDs match the pattern `__ext__[0-9a-f]{8}` (FNV-1a hash)

### Module structural edges

- [ ] Every module has `MODULE_DECLARES_COMPONENT` edges for each declared component
- [ ] Every module has `MODULE_DECLARES_ROUTE` edges for each owned route
- [ ] Modules with non-empty `providers` have `MODULE_PROVIDES_SERVICE` edges
- [ ] Modules with `imports` referencing other project modules have `MODULE_IMPORTS_MODULE` edges
- [ ] Services with `providedIn: 'root'` have `MODULE_PROVIDES_SERVICE` from root module

---

## Re-running validation

After any change to graph-emitting code, re-run all three subjects and compare
stats to the expected values above. Differences must be explained before merging.

```bash
# Quick re-validation (all three subjects)
npm run phase1 -- "C:/Users/basha/git/github/posts-users-ui-ng" "C:/Users/basha/git/github/posts-users-ui-ng/tsconfig.json" "output/posts-users-ui-ng"
npm run phase1 -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular/tsconfig.json" "output/spring-petclinic-angular"
npm run phase1 -- "C:/Users/basha/git/github/heroes-angular" "C:/Users/basha/git/github/heroes-angular/src/tsconfig.app.json" "output/heroes-angular"

# Determinism check (run for each subject)
npm run verify:determinism -- "C:/Users/basha/git/github/posts-users-ui-ng" "C:/Users/basha/git/github/posts-users-ui-ng/tsconfig.json"
npm run verify:determinism -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular/tsconfig.json"
npm run verify:determinism -- "C:/Users/basha/git/github/heroes-angular" "C:/Users/basha/git/github/heroes-angular/src/tsconfig.app.json"
```
