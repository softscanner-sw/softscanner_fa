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

## Expected output files

Each run writes the following files to the specified `outputDir`:

| File | Contents |
|------|---------|
| `phase1-bundle.json` | Full `Phase1AnalysisBundle` (all sections, deterministic JSON) |
| `graph.json` | `AppNavigation` — nodes and edges of the multigraph |
| `routes.json` | `RouteMap` — all extracted routes |
| `components.json` | `ComponentRegistry` — all extracted components + widget IDs |
| `modules.json` | `ModuleRegistry` — all Angular modules |
| `widgetEventMaps.json` | `WidgetEventMap[]` — widget → handler event mappings |
| `config.json` | `AnalyzerConfig` used for the run |
| `stats.json` | `Phase1Stats` — counts of modules/routes/components/widgets/edges |

---

## Observed output (last validated run)

### Subject 1 — posts-users-ui-ng

| Metric | Value |
|--------|-------|
| modules | 2 |
| routes | 8 |
| components | 11 |
| widgets | 35 |
| edges | 22 |
| transitions | 22 |

**graph.json node types:** `Virtual: 1, Route: 8, Component: 11` (total 20)

**graph.json edge kinds:**
- UI_EFFECT (Route→Component): 7
- NAVIGATE_ROUTE: 9 (entry + routerLink + programmatic)
- REDIRECT: 1
- External: 0 (no external hrefs detected)

---

### Subject 2 — spring-petclinic-angular

| Metric | Value |
|--------|-------|
| modules | 16 |
| routes | 22 |
| components | 23 |
| widgets | 119 |
| edges | 48 |
| transitions | 48 |

**graph.json node types:** `Virtual: 1, Route: 22, Component: 23` (total 46)

**graph.json edge kinds:**
- UI_EFFECT (Route→Component): 19
- NAVIGATE_ROUTE: 28 (entry + routerLink + programmatic)
- REDIRECT: 1
- External: 0

---

### Subject 3 — heroes-angular

| Metric | Value |
|--------|-------|
| modules | 5 |
| routes | 12 |
| components | 17 |
| widgets | 28 |
| edges | 28 |
| transitions | 28 |

**graph.json node types:** `Virtual: 1, External: 10, Route: 12, Component: 17` (total 40)

**graph.json edge kinds:**
- UI_EFFECT (Route→Component): 4
- NAVIGATE_ROUTE: 11
- REDIRECT: 2
- NAVIGATE_EXTERNAL: 11

**Note:** Run with `src/tsconfig.app.json` (not the root `tsconfig.json`, which is a
solution-style config with `"files": []` that yields zero source files).

**Route extraction note:** heroes-angular defines its routes in `src/app/router.ts`
and passes the variable to `RouterModule.forRoot(routes)`. Phase A1 resolves
cross-file identifier references via `RouteParser._resolveArgToArray()`, so routes
are extracted correctly when the correct tsconfig is supplied.

---

## Structural invariants checklist

Use these checks to spot-validate `graph.json` and `phase1-bundle.json` after
any significant change.

### graph.json

- [ ] `nodes` array is present and non-empty
- [ ] Exactly one node has `"type": "Virtual"` and `"id": "__entry__"`
- [ ] For every route of kind `ComponentRoute` in `routes.json`, a node exists
      with `"type": "Route"` and the corresponding `id`
- [ ] For every component in `components.json`, a node exists with
      `"type": "Component"` and `id` equal to `ComponentInfo.id`
- [ ] `nodes` array is sorted lexicographically by `id`
- [ ] `edges` array is sorted lexicographically by `id`
- [ ] Each edge ID follows the format:
      `<from>::<signature>::<to>::<stableIndex>`
      where signature is a 12-field pipe-delimited string and stableIndex is a digit
- [ ] Each edge has exactly one element in its `transitions` array
- [ ] At least one edge per `ComponentRoute` has `"kind": "UI_EFFECT"`,
      with `from` = Route node id and `to` = Component node id
- [ ] External node IDs match the pattern `__ext__[0-9a-f]{8}` (FNV-1a hash)
- [ ] All `from`/`to` in edges reference ids that exist in `nodes`

### phase1-bundle.json

- [ ] File is valid JSON (parseable)
- [ ] Top-level keys: `config`, `componentRegistry`, `moduleRegistry`,
      `routeMap`, `widgetEventMaps`, `navigation`, `stats`
- [ ] `stats.routes` equals `routeMap.routes.length`
- [ ] `stats.components` equals `componentRegistry.components.length`
- [ ] `stats.edges` equals `navigation.edges.length`
- [ ] `stats.transitions` equals sum of `transitions.length` across all edges
      (equals `stats.edges` since each edge has one transition)

---

## Re-running validation

After any change to `NavigationGraphBuilder`, `RouteMapBuilder`, or
`ComponentRegistryBuilder`, re-run all three subjects and compare stats
to the expected values above. Differences must be explained before merging.

```bash
# Quick re-validation (all three subjects)
npm run phase1 -- "C:/Users/basha/git/github/posts-users-ui-ng" "C:/Users/basha/git/github/posts-users-ui-ng/tsconfig.json" "output/posts-users-ui-ng"
npm run phase1 -- "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular" "C:/Users/basha/git/github/autoe2e/benchmark/pet-clinic/spring-petclinic-angular/tsconfig.json" "output/spring-petclinic-angular"
npm run phase1 -- "C:/Users/basha/git/github/heroes-angular" "C:/Users/basha/git/github/heroes-angular/src/tsconfig.app.json" "output/heroes-angular"

# Determinism check (uses posts-users-ui-ng)
npm run verify:determinism -- "C:/Users/basha/git/github/posts-users-ui-ng" "C:/Users/basha/git/github/posts-users-ui-ng/tsconfig.json"
```
