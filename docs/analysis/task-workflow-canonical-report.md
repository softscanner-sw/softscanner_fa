# TaskWorkflow Canonical Reconciliation Report

Generated: 2026-03-10
Branch: `feat/a2-bounded-workflows`
GT source: `docs/analysis/task-workflow-ground-truth.json`
GT report: `docs/analysis/task-workflow-ground-truth-report.md`

---

## 0. GT Authoring Policy (Definition A — Full Application GT)

Ground truth is a property of the application, not the tool. GT enumerates **all user-distinguishable TaskWorkflows** in each subject, regardless of whether A2 can currently reach them.

### 0.1 What counts as a GT TaskWorkflow

A GT entry exists for each distinct user-visible event binding site in a component template that produces a separate trigger edge under the A1 schema:

- `(click)`, `(submit)`, `(ngSubmit)`, `(change)`, `(input)`, `(dblclick)`, `(keyup.*)`, `(keydown.*)`, `(blur)`, `(focus)`, `(select)`, `(selectionChange)`, `(opened)`, `(closed)`, `(drop)`, `(dateChange)` on native or Material elements
- `[routerLink]`, `routerLink`, `href` navigation bindings
- Form `(ngSubmit)`/`(submit)` handlers

### 0.2 What is excluded from GT

- `[(ngModel)]` two-way bindings (framework data binding, not user triggers)
- `(ngModelChange)`, `(valuechange)` (framework-internal events)
- `@Output()` event bindings on **child component selector tags** (EventEmitter plumbing in the parent template — but the actual click/submit handler inside the child component's own template IS a GT entry)
- CDK/Material directive-only interactions with no explicit handler (e.g., `matTreeNodeToggle`, `ngbDropdownToggle`)
- `(hovered)` on drag-drop areas (UI feedback, not user action)

### 0.3 Shared-trigger dedup policy

A1 emits one trigger edge per widget binding site in the component template. If a shared component (e.g., `ListHeaderComponent`) is activated on N routes, its trigger edges are the same — A2 produces 1 TaskWorkflow per trigger with `startRouteIds` listing all N routes. Raw GT lists the trigger once per route context for audit clarity, then deduplicates to unique trigger edges.

### 0.4 Dual-trigger same-element policy

When an element has both `routerLink` and `(click)`, A1 emits 2 trigger edges (WNR + WTH). Each is a separate GT entry and a separate TaskWorkflow. This is architecturally correct.

### 0.5 Non-entry child-route triggers

GT includes triggers on non-entry child routes. A2 now enumerates TaskWorkflows for all component-bearing routes (not just entry routes), so these are fully reachable.

### 0.6 Dynamic/unresolved navigation triggers

Trigger edges whose navigation target is unresolved (dynamic expression) are GT entries. `"terminal"` records the unresolved pattern.

### 0.7 Dialog/modal triggers

Triggers inside dynamically-opened dialog/modal components (e.g., via `NgbModal.open()`, `MatDialog.open()`) are GT entries on the route of the component that opens them.

### 0.8 Raw GT count vs unique trigger count

The GT report lists both: raw GT count (one entry per trigger per route context, for audit) and unique trigger count (after dedup). The unique trigger count is the benchmark denominator.

### 0.9 Relationship between the 3 kept analysis artifacts

| File | Role |
|------|------|
| `task-workflow-ground-truth.json` | Machine-readable GT: per-subject arrays of trigger entries |
| `task-workflow-ground-truth-report.md` | Human-readable GT ledger: component-by-component audit tables |
| `task-workflow-canonical-report.md` | Reconciliation: GT vs extracted, policy, readiness assessment |

---

## 1. Cross-Subject Reconciliation Summary

| Subject | GT (unique) | Extracted TW | Matched | Missing | Surplus | Wrong-Constraint |
|---------|------------:|-------------:|--------:|--------:|--------:|-----------------:|
| posts-users-ui-ng | 18 | 18 | 17 | 0 | 0 | 1 |
| heroes-angular | 19 | 19 | 19 | 0 | 0 | 0 |
| softscanner-cqa | 16 | 16 | 16 | 0 | 0 | 0 |
| airbus-inventory | 21 | 21 | 21 | 0 | 0 | 0 |
| spring-petclinic | 74 | 74 | 74 | 0 | 0 | 0 |
| ever-traduora | 108 | 109 | 108 | 0 | 1 | 0 |
| **Total** | **256** | **257** | **255** | **0** | **1** | **1** |

**Recall (full application GT):** 256/256 = 100% trigger identity match
**Surplus:** 1 (traduora `(hovered)` on drag-drop area — GT policy §0.2 excludes as UI feedback)
**Wrong-constraint:** 1 remaining (ancestor *ngIf expression imprecision, non-blocking)

---

## 2. Per-Subject Detail

### 2.1 posts-users-ui-ng (18/18 identity match)

All 18 GT entries have 1:1 trigger match. Zero missing, zero surplus.

**Wrong-constraint (1):**

| GT ID | Issue | Class | Status |
|-------|-------|-------|--------|
| GT-14 | visibleExprText is `"user"` (ancestor *ngIf) instead of `"user.bio.length > 150"` (button's own *ngIf) | Ancestor *ngIf priority | Non-blocking; verdict correct (CONDITIONAL) |

**Fixed in this pass (3):**
- GT-11: Spurious `enabledExpr(userForm.invalid)` on file input — RESOLVED (form-gate containment fix)
- GT-16: Missing `visibleExpr(searchEntry)` on clearSearch — RESOLVED (*ngIf extraction + elementSpan fix)
- GT-02/GT-10 equivalent form-gate false positives — RESOLVED

### 2.2 heroes-angular (19/19 PERFECT)

27 raw GT entries deduplicate to 19 unique trigger edges (shared components). All 19 perfectly matched.

### 2.3 softscanner-cqa-frontend (16/16 PERFECT)

All 16 GT entries perfectly matched.

### 2.4 airbus-inventory (21/21 PERFECT)

GT corrected to 21 entries (dual-trigger logout elements: GT-06/GT-07 routerLink + click → 2 TW each). All 21 matched.

### 2.5 spring-petclinic-angular (74/74 PERFECT)

74 unique GT entries, all matched. GT-75..77 (VisitAddComponent on `/pets/:id/visits/add`) are dedup duplicates of GT-64..66 — VisitAddComponent is activated on both entry route `/visits/add` and child route `/pets/:id/visits/add`, producing the same trigger edges. Child-route enumeration adds the child route to `startRouteIds` but does not create duplicate TaskWorkflows.

**Fixed in this pass (1+3):**
- GT-58: VetEditComponent back button spurious `enabledExpr(vetEditForm.invalid)` — RESOLVED (form-gate containment fix)
- GT-72..74: PetEditComponent on `/pets/:id/edit` — NOW EXTRACTED (child-route enumeration)
- GT-75..77: VisitAddComponent on `/pets/:id/visits/add` — dedup of GT-64..66 (same trigger edges, additional startRouteId)

### 2.6 ever-traduora (109/108 — 1 surplus)

109 extracted TaskWorkflows against 108 GT entries. All 108 GT entries matched. 1 surplus: `(hovered)` event on a drag-drop div in ImportLocaleComponent — GT policy §0.2 explicitly excludes this as "UI feedback, not user action."

**Fixed in this pass (2 constraint + 9 parent-route + 68 child-route):**
- GT-02: ForgotPasswordComponent routerLink spurious `enabledExpr` from form — RESOLVED
- GT-10: SignupComponent routerLink spurious `enabledExpr` from form — RESOLVED
- GT-33..41: ProjectContainerComponent sidebar triggers (9) — RESOLVED via parent-route component inclusion fix
- GT-42..108: All 67 non-entry child-route triggers — NOW EXTRACTED via child-route enumeration extension

---

## 3. Mismatch Classification

### 3a. Wrong-Constraint: ancestor *ngIf priority (1 remaining)

GT-14 (posts-users-ui-ng): the toggleBio button has its own `*ngIf="user.bio.length > 150"` AND an ancestor div has `*ngIf="user"`. A1 captures the ancestor expression first. Verdict is correctly CONDITIONAL in either case. This is a precision limitation, not a semantic error.

### 3b. Missing: None

All GT entries are now extracted. Child-route enumeration extension resolved all 73 previously-missing triggers.

### 3c. Surplus: 1

| Subject | Count | Root Cause |
|---------|------:|------------|
| ever-traduora | 1 | `(hovered)` on drag-drop div in ImportLocaleComponent — GT policy §0.2 excludes as UI feedback |

Airbus dual-trigger elements are correctly modeled as 21 GT entries (not 19 + 2 surplus).

---

## 4. Dedup Audit

All 257 extracted TaskWorkflows across 6 subjects are unique:
- Zero duplicate triggerEdgeIds
- Zero identical step sequences
- Zero un-aggregated shared-trigger duplicates
- Entry-route and child-route aggregation operating correctly
- Petclinic VisitAddComponent: same trigger edges on `/visits/add` and `/pets/:id/visits/add` → 1 TW each with 2 startRouteIds

---

## 5. A2 TaskWorkflow Stats (final)

| Subject | Total | FEASIBLE | CONDITIONAL | Trigger Edges | Enum Routes |
|---------|------:|--------:|-----------:|---------:|-------:|
| posts-users-ui-ng | 18 | 12 | 6 | 18 | 7 |
| heroes-angular | 19 | 19 | 0 | 19 | 4 |
| softscanner-cqa | 16 | 15 | 1 | 16 | 1 |
| airbus-inventory | 21 | 13 | 8 | 21 | 6 |
| spring-petclinic | 74 | 40 | 34 | 74 | 22 |
| ever-traduora | 109 | 46 | 63 | 109 | 18 |
| **Total** | **257** | **145** | **112** | **257** | **58** |

---

## 6. A1 Graph Stats (unchanged)

| Subject | Nodes | Edges | Structural | Executable |
|---------|------:|------:|-----------:|---------:|
| posts-users-ui-ng | 64 | 131 | 100 | 31 |
| heroes-angular | 67 | 88 | 68 | 20 |
| softscanner-cqa | 37 | 74 | 57 | 17 |
| airbus-inventory | 59 | 131 | 90 | 41 |
| spring-petclinic | 191 | 422 | 294 | 128 |
| ever-traduora | 247 | 499 | 384 | 115 |

---

## 7. Fixes Applied in This Pass

### Bug A: Form-gate containment fix (4 cases resolved)
**Files:** `src/analyzers/template/constraints/template-constraint-extractor.ts`
**Root cause:** `_matchPredicates()` compared predicate span (char offset) against widget position (line*10000+col). Units were incompatible, causing every `[disabled]` binding to attach to every widget.
**Fix:** Convert widget line/col to char offset via `_buildLineStarts()` + `_lineColToCharOffset()`. Check containment: widget char offset must fall within predicate element span.

### Bug B: *ngIf expression recovery (2 cases resolved)
**Files:** `src/parsers/angular/template-parser.ts`
**Root cause:** `_convertAttr()` dropped `*ngIf` expressions when the value was an AST object (from `@angular/compiler`), not a string.
**Fix:** When `a['value']` is a non-null object, use `_astToString()` and emit as `boundAttr` instead of `attr`.

### Bug C: *ngIf elementSpan for containment
**Files:** `src/parsers/angular/template-ast-utils.ts`, `src/analyzers/template/constraints/template-constraint-extractor.ts`
**Root cause:** Structural directive spans covered only the `*ngIf` attribute (e.g., chars 9-26), not the host element (chars 0-87). Widgets inside the element fell outside the attribute span.
**Fix:** `extractStructuralDirectives()` now returns `elementSpan` (the structural node's full span). Constraint extractor uses `elementSpan` for containment matching.

### Bug D: Parent-route component inclusion (9 cases resolved)
**Files:** `src/workflows/graph-index.ts`
**Root cause:** `computeActiveComponentIds()` seeded only from the final resolved route after redirect closure. When entry route `/projects/:projectId` redirected to child route `/projects/:projectId/translations`, the parent route's `ProjectContainerComponent` was lost. In Angular, parent route components are co-rendered with child route components via `<router-outlet>`.
**Fix:** Added `routeParentOf` reverse index (from ROUTE_HAS_CHILD edges). `computeActiveComponentIds()` now walks up the route ancestry and includes components from all parent routes.

### Spec Change E: Child-route enumeration extension (71 cases resolved)
**Files:** `docs/paper/approach.md`, `src/workflows/graph-index.ts`, `src/workflows/task-enumerator.ts`, `src/models/workflow.ts`
**Root cause:** A2 spec restricted enumeration to entry routes only. 73 GT triggers on non-entry child routes (67 traduora + 6 petclinic) were unreachable.
**Fix:** Updated spec §3 from "entry routes" to "enumerable routes" (all routes with ROUTE_ACTIVATES_COMPONENT edges). Added `enumerableRouteIds` to GraphIndex. Changed enumerator loop. 3 petclinic GT entries (GT-75..77) turned out to be dedup duplicates of GT-64..66, so net unique GT = 256.
**Impact:** +68 traduora triggers, +3 petclinic triggers. Full-application recall: 71.4% → 100%.

---

## 8. Readiness Assessment

| Criterion | Status |
|-----------|--------|
| All 5 gates green | YES |
| All 6 subjects validated | YES |
| Determinism (A1 + A2 byte-identical) | YES |
| Zero wrong-closure | YES |
| Zero dedup issues | YES |
| Full-application recall | 256/256 = 100% trigger identity match |
| Wrong-constraint count | 1 (ancestor *ngIf precision, non-blocking) |
| Surplus count | 1 (traduora `(hovered)` — GT §0.2 exclusion) |

### Per-Subject Phase B Readiness

| Subject | GT Complete? | Benchmark-stable? | Phase B ready? |
|---------|-------------|-------------------|---------------|
| posts-users-ui-ng | YES (18) | YES (18 extracted) | YES |
| heroes-angular | YES (19) | YES (19 extracted) | YES |
| softscanner-cqa | YES (16) | YES (16 extracted) | YES |
| airbus-inventory | YES (21) | YES (21 extracted) | YES |
| spring-petclinic | YES (74 unique) | YES (74 extracted) | YES |
| ever-traduora | YES (108) | YES (109 extracted, 1 surplus) | YES |

### Remaining Issues

| # | Issue | Class | Impact |
|---|-------|-------|--------|
| 1 | GT-14 ancestor *ngIf priority | A1 precision limitation | Non-blocking; correct verdict |
| 2 | GT-64 petclinic VisitAddComponent missing CNR in async callback | A1 extraction limitation | Known; no impact on trigger identity |
| 3 | GT-18 traduora unresolved dynamic navigation | A1 extraction limitation | Known; dynamic expression |
| 4 | 1 surplus traduora `(hovered)` trigger | A1 over-extraction | Known; GT §0.2 excludes as UI feedback |

### Phase B Verdict

**All 6 subjects are benchmark-stable for Phase B.** GT is frozen under Definition A (full application GT). Full-application recall is 100% (256/256 trigger identity match). Phase A is sufficient to begin Phase B.
