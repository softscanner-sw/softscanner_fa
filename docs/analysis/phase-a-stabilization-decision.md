# Phase A Stabilization Decision

Generated: 2026-03-10
Branch: `feat/a2-bounded-workflows`

---

## 1. Decision

**Phase A is stabilized and ready for Phase B planning.**

All 5 acceptance gates pass. All 6 subjects produce deterministic, byte-identical output across repeated runs. Full-application recall is 100% (256/256 trigger identity match). 1 surplus trigger, 1 wrong-constraint — neither blocking.

---

## 2. Gate Status

| Gate | Status |
|------|--------|
| `npm run typecheck` | PASS |
| `npm run typecheck:tests` | PASS |
| `npm test` (133 tests) | PASS |
| `npm run lint` | PASS |
| `npm run verify:determinism` (6 subjects) | PASS |

---

## 3. Recall Summary

| Metric | Value |
|--------|------:|
| GT unique triggers | 256 |
| Extracted TaskWorkflows | 257 |
| Matched | 255 |
| Surplus | 1 |
| Wrong-constraint | 1 |
| Trigger identity recall | 100% |

---

## 4. Per-Subject Status

| Subject | Extracted/GT | Recall | Status |
|---------|-------------|--------|--------|
| posts-users-ui-ng | 18/18 | 100% (17 match + 1 wrong-constraint) | Stable |
| heroes-angular | 19/19 | 100% | Stable |
| softscanner-cqa | 16/16 | 100% | Stable |
| airbus-inventory | 21/21 | 100% | Stable |
| spring-petclinic | 74/74 | 100% | Stable |
| ever-traduora | 109/108 | 100% (1 surplus) | Stable |

---

## 5. Fixes Applied in This Stabilization Pass

### Fix 1: GT JSON structural defect
The `task-workflow-ground-truth.json` file had invalid JSON (premature array close at line 627). Fixed by removing the stray `]` delimiter.

### Fix 2: Parent-route component inclusion (A2)
`computeActiveComponentIds()` in `graph-index.ts` now walks up ROUTE_HAS_CHILD ancestry to include parent route components. In Angular, parent route components are co-rendered with child route components via `<router-outlet>`. This recovered 9 traduora entry-route-accessible triggers from `ProjectContainerComponent`.

### Fix 3: Child-route enumeration extension (spec + A2)
Updated `approach.md` to define "enumerable routes" as all component-bearing routes (not just entry routes). A2 now iterates all routes with ROUTE_ACTIVATES_COMPONENT edges. This recovered 68 traduora triggers and 3 petclinic triggers.

**Spec changes:**
- Section 3: "Entry Routes" → "Enumerable Routes" (all component-bearing routes)
- Section 4: Algorithm iterates component-bearing routes, not entry routes
- Section 2.1: Active component closure includes parent route ancestry via ROUTE_HAS_CHILD
- §9 Edge interface: added `effectGroupId?` and `callsiteOrdinal?` (already referenced normatively in A2.1 §5)
- TaskWorkflowBundle.stats: `entryRouteCount` → `enumeratedRouteCount`

### Fix 4: Document alignment
- ROADMAP.md: removed stale "mock workflow page" language
- CLAUDE.md: added `src/workflows/` and `src/a2-cli.ts` to structure listing
- All analysis docs updated with final numbers

---

## 6. Remaining Issues (not blocking Phase B)

| # | Issue | Class | Impact |
|---|-------|-------|--------|
| 1 | GT-14 ancestor *ngIf priority | A1 precision limitation | 1 wrong expression text; verdict correct |
| 2 | GT-64 petclinic VisitAddComponent missing CNR in async callback | A1 extraction limitation | Known; no impact on trigger identity |
| 3 | GT-18 traduora unresolved dynamic navigation | A1 extraction limitation | Known; dynamic expression |
| 4 | 1 surplus traduora `(hovered)` trigger | A1 over-extraction | GT §0.2 excludes as UI feedback |
| 5 | Widget kind Option/RadioGroup never emitted | A1 spec boundary | No subjects affected |

---

## 7. A2 Final Stats

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

## 8. Conclusion

Phase A extraction and enumeration are stable, deterministic, and validated across all 6 subjects. Full-application recall is 100% (256/256 trigger identity match). The remaining issues are precision-level (wrong expression text, missing async CNR, 1 surplus UI-feedback trigger) and do not affect Phase B readiness. Phase B planning may proceed.
