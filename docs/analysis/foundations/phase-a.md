# Phase A — System Foundation
Current-state description of Phase A (A1 extraction + A2 enumeration).

---

## A1 — Static Multigraph Extraction
A1 extracts a deterministic navigation-interaction multigraph from Angular source code.

**Inputs:** Angular project source (TypeScript + templates)
**Outputs:** `a1-multigraph.json` — `A1Multigraph { multigraph: { nodes, edges }, stats }`

### Node taxonomy (6 kinds)
Module, Route, Component, Widget, Service, External

### Widget taxonomy (13 spec kinds)
Button, Link, Form, Input, Select, Option, RadioGroup, Radio, Checkbox, TextArea, OtherInteractive

Composite widgets: `RadioGroup` contains `Radio` children; `Select` contains `Option` children via `WIDGET_CONTAINS_WIDGET`.

### Edge taxonomy (18 kinds)
- **11 structural:** MODULE_DECLARES_*, MODULE_IMPORTS/EXPORTS_MODULE, MODULE_PROVIDES_SERVICE, ROUTE_HAS_CHILD, ROUTE_ACTIVATES_COMPONENT, COMPONENT_CONTAINS_WIDGET, WIDGET_CONTAINS_WIDGET, COMPONENT_COMPOSES_COMPONENT
- **7 executable:** WIDGET_NAVIGATES_ROUTE/EXTERNAL, WIDGET_TRIGGERS_HANDLER, WIDGET_SUBMITS_FORM, COMPONENT_CALLS_SERVICE, COMPONENT_NAVIGATES_ROUTE, ROUTE_REDIRECTS_TO_ROUTE

### Identity and ordering invariants
- Edge ID: `${from}::${kind}::${to ?? '__null__'}::${stableIndex}`
- Nodes sorted by id; edges sorted by (from, kind, to, id)
- Deterministic: same source code produces byte-identical output

---

## A2 — TaskWorkflow Enumeration
A2 enumerates one TaskWorkflow per trigger edge (WTH/WSF/WNR/WNE).

**Inputs:** Serialized A1 bundle JSON (immutable)
**Outputs:** `a2-workflows.json` — `A2WorkflowSet { workflows, input, stats }`

### Enumeration rules
- Handler-scoped effect closure (CCS by effectGroupId/callsiteOrdinal + optional CNR)
- Deterministic redirect closure with cycle detection
- Entry route aggregation: same trigger on N routes = 1 TaskWorkflow with multiple startRouteIds
- Classification: PRUNED (infeasible) | CONDITIONAL (constraints present) | FEASIBLE (no constraints)

### Current stats (6 subjects, 257 TaskWorkflows)
| Subject | TaskWorkflows | FEASIBLE | CONDITIONAL |
|---|---|---|---|
| posts-users-ui-ng | 18 | 12 | 6 |
| heroes-angular | 19 | 19 | 0 |
| softscanner-cqa-frontend | 16 | 15 | 1 |
| spring-petclinic-angular | 74 | 40 | 34 |
| ever-traduora | 109 | 46 | 63 |
| airbus-inventory | 21 | 13 | 8 |

---

## Ground Truth
257 GT entries across 6 subjects. Full-application scope: all user-distinguishable TaskWorkflows.

**Dedup rule:** 1 TaskWorkflow per unique triggerEdgeId, shared across routes via startRouteIds.

**GT validation:** 257/257 matched (100% recall). 1 surplus traduora trigger (UI feedback, non-blocking).

---

## Stabilization Gate Results
All 5 gates pass: typecheck, typecheck:tests, test, lint, verify:determinism.
Phase A is complete and frozen.
