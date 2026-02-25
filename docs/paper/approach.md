# Approach — Operational Specification (Normative)
This document defines the executable contract for implementing the paper’s Approach pipeline.
If code conflicts with this file, this file wins.

**Current active scope: Phase A1 only.**
A2, A3, and Phase B are blocked until A1 is complete, tested, deterministic, and tagged.

---

## 0. Phase A1 outputs and hard boundaries

### 0.1 A1 output bundle (frozen)

A1 MUST emit a deterministic `Phase1AnalysisBundle` containing:

- `componentRegistry: ComponentRegistry`
- `moduleRegistry: ModuleRegistry`
- `componentRouteMap: ComponentRouteMap` (contains `routeMap: RouteMap`)
- `widgetEventMaps: WidgetEventMap[]`
- `navigation: AppNavigation` (navigation–interaction multigraph G)
- `stats: Phase1Stats`

A1 MUST NOT:
- enumerate workflows/paths (A2)
- aggregate constraints across paths (A3)
- perform feasibility/SAT checks (A3)
- generate Selenium code or run browsers (Phase B)

---

## 1. Formal Definitions

### 1.1 Navigation–interaction multigraph

Let:

**G = (N, E)**

- **N** = set of graph nodes (UI contexts)
- **E** = set of directed graph edges
- Graph is a multigraph: a single edge (from,to) may carry multiple labeled transitions.

This is the `AppNavigation` model: nodes/edges sorted deterministically by id.

---

### 1.2 Node set (N): Route + Component + External + Virtual

A node is a `GraphNode` with `type ∈ {Route, Component, External, Virtual}`.

**Node ID convention (frozen by model):**
- Route node id → `Route.id`
- Component node id → `ComponentInfo.id`
- External node id → stable hash of URL
- Virtual node id → well-known strings (at least `__entry__`) 

A node must set exactly one of:
- `routeId` when type=Route
- `componentId` when type=Component
- `url` when type=External
Virtual nodes may set none.

**Traceability rule:**
- Route/Component/External nodes MUST carry `origin` where applicable (Virtual exempt).

---

### 1.3 Edge set (E): GraphEdge + GraphTransition

A directed edge is a `GraphEdge`:

- `id` (stable; see 1.4)
- `from: GraphNode.id`
- `to: GraphNode.id`
- `transitions: GraphTransition[]` (multigraph labels)

A transition is a `GraphTransition` containing:

- `kind: TransitionKind` (includes at least `NAVIGATE_ROUTE`, `NAVIGATE_EXTERNAL`, `REDIRECT`, `SUBMIT_FORM`, `SERVICE_CALL`, `UI_EFFECT`, `UNKNOWN`){index=5}
- `origin: Origin` (mandatory; template element, handler, or route declaration)
- optional `trigger`:
  - `widgetId`
  - `eventType`
  - `navType`
- optional `handler` metadata
- optional element `selectors`
- `uiPreconditions: Predicate[]` (copied from widget visibility + enablement predicates)
- optional `constraintSummary?: ConstraintSummary` (Phase 1 post-pass; optional in A1)

---

### 1.4 Determinism (hard gate)

Given identical:
- source code
- tsconfig
- AnalyzerConfig

the exported `Phase1AnalysisBundle` MUST be byte-identical across runs.

Determinism includes:
- stable IDs
- stable ordering of every array documented as “sorted”
- stable truncation/bounding of extracted strings
- no nondeterministic iteration over maps/sets

If determinism fails: feature work stops until fixed.

---

## 2. Constraint surfaces in A1 (extract + attach only)

A1 does not “solve” constraints. It extracts and attaches them to surfaces so A3 can aggregate later.

### 2.1 Route-level constraints
- guards (`canActivate`, `canLoad`, etc.)
- resolvers
- route params implied by path
- `Route.constraintSummary` may be populated by `GuardConstraintSummarizer` (bounded). (Rollup allowed, but must remain bounded and traceable.)

### 2.2 Widget-level predicates
Each `WidgetInfo` stores:
- `visibilityPredicates: Predicate[]`
- `enablementPredicates: Predicate[]`

### 2.3 Handler-level summaries
Each `WidgetEvent` may carry bounded summaries of handler checks / call contexts (best-effort; still A1).

### 2.4 Transition-level merged view (optional in A1)
`GraphTransition.constraintSummary` is optional in A1 and may remain unset until the Phase 1 constraint post-pass is implemented.

---

## 3. Phase A1 — Multigraph extraction (ACTIVE)

### 3.1 Objective

Construct G such that:
- all routes exist as Route nodes
- all extracted components exist as Component nodes
- all external destinations exist as External nodes (stable hashed ids)
- a Virtual `__entry__` exists
- transitions are attached to correct origin contexts:
  - structural rendering: Route → Component
  - user/program actions: Component → Route/External (or Component → Component when relevant)

No path enumeration.
No feasibility pruning.
No workflow aggregation.

Only structural extraction + local annotations.

---

### 3.2 Required node construction rules

A1 MUST create:

1) Virtual node:
- `__entry__` (type=Virtual)

2) Route nodes:
- one per `Route` in `RouteMap`
- type=Route, id=Route.id, origin=route.origin, routeId=Route.id 

3) Component nodes:
- one per `ComponentInfo` in `ComponentRegistry`
- type=Component, id=ComponentInfo.id, origin=component.symbol.origin (or component origin), componentId=ComponentInfo.id 

4) External nodes:
- one per distinct external URL encountered from templates or handlers
- type=External, id=stableHash(url), url=url 

All nodes sorted by id lexicographically.

---

### 3.3 Required transition construction rules

A1 MUST create these transitions:

#### (A) Entry transitions
- `__entry__ → <route>` for each entry route
- `kind = NAVIGATE_ROUTE`
- origin points to route declaration (or a synthetic origin with documented provenance)

#### (B) Route → Component structural transitions
For each ComponentRoute:
- `routeNode(Route.id) → componentNode(ComponentInfo.id)`
- `kind = UI_EFFECT`
- origin points to the route declaration
- rationale: this establishes the UI context where widgets/events live

This is the mechanism that makes component nodes meaningful in G.

#### (C) Redirect transitions
For each RedirectRoute:
- `routeNode(from) → routeNode(to)`
- `kind = REDIRECT`
- origin points to redirect route declaration

#### (D) UI-triggered navigation transitions (from components)
For each WidgetInfo with navigation binding:
- `componentNode(ownerComponentId) → routeNode(targetRouteId)` for routerLink
- `kind = NAVIGATE_ROUTE`
- trigger.widgetId set
- origin points to template element
- uiPreconditions = widget.visibilityPredicates ∪ widget.enablementPredicates 

For external href:
- `componentNode(ownerComponentId) → externalNode(url)`
- `kind = NAVIGATE_EXTERNAL`
- same trigger/origin/uiPreconditions rules

#### (E) Handler-triggered navigation transitions (from components)
For each handler call-context that implies navigation:
- `componentNode(ownerComponentId) → routeNode(targetRouteId)` for navigate/navigateByUrl (when resolvable)
- `kind = NAVIGATE_ROUTE`
- handler.name and handler.origin populated when available
- origin points to handler call-site or method
- uiPreconditions inherited from triggering widget if a widget-trigger is known; otherwise empty list

External navigate:
- `componentNode(ownerComponentId) → externalNode(url)`
- `kind = NAVIGATE_EXTERNAL`

---

### 3.4 Edge IDs + transition signature + ordering (determinism)

#### 3.4.1 GraphEdge id convention (normative)

Each `GraphEdge` MUST have a stable id derived from its (from,to) pair and the
ordered transitions it contains.

**Edge id format (frozen):**

edge.id = `${from}::${transition.signature}::${to}::${stableIndex}`

- `from` = GraphNode.id
- `to` = GraphNode.id
- `transition.signature` = defined in 3.4.2 (computed per transition)
- `stableIndex` = 0-based index of this transition among transitions that share the
  same (from,to) pair AFTER sorting (see 3.4.3)

Rationale:
- Edge ids must not depend on iteration order of maps/sets.
- Edge ids must be stable across runs given identical inputs.

#### 3.4.2 Transition signature definition (normative)

A transition signature is a canonical, pipe-delimited string computed from a
`GraphTransition` and its resolved target.

It MUST include only deterministic, already-extracted fields (no random ids, no
object identity, no memory addresses).

**Signature fields (in this exact order):**

1) kind
2) trigger.navType
3) trigger.eventType
4) trigger.widgetId
5) handler.name
6) handler.origin.file
7) handler.origin.startLine
8) handler.origin.startCol
9) origin.file
10) origin.startLine
11) origin.startCol
12) normalizedTarget

Where:

- `normalizedTarget` is:
  - for NAVIGATE_ROUTE / REDIRECT: the target `Route.id`
  - for NAVIGATE_EXTERNAL: the normalized URL string used to compute the External node id
  - otherwise: `to` (GraphNode.id)

**Null / missing handling (normative):**
- Any missing/undefined field is treated as empty string `""`.
- Numeric fields missing are treated as `0`.
- All fields are trimmed.
- `normalizedTarget` MUST be non-empty (fallback to `to`).

**Signature string format (normative):**

signature =
  `${kind}|${navType}|${eventType}|${widgetId}|${handlerName}|` +
  `${handlerFile}|${handlerLine}|${handlerCol}|` +
  `${originFile}|${originLine}|${originCol}|${normalizedTarget}`

This signature is used only for determinism and stable ids; it is not a semantic claim.

#### 3.4.3 Ordering rules (normative)

- `AppNavigation.nodes` sorted by `id` lexicographically.
- `AppNavigation.edges` sorted by `id` lexicographically.

Within each `(from,to)` edge accumulator:

**Transition sort key (normative):**
1) kind (lexicographic)
2) trigger.eventType (lexicographic; fallback `""` when trigger absent)
3) origin.file (lexicographic)
4) origin.startLine (ascending)
5) origin.startCol (ascending)
6) trigger.widgetId (lexicographic; fallback `""`)
7) handler.name (lexicographic; fallback `""`)

Notes:
- This explicitly defines behavior when `trigger` is absent (eventType/widgetId fallback to "").
- This ordering MUST be applied before computing `stableIndex` for edge ids.

**Current implementation status**:
Component nodes and Route→Component UI_EFFECT transitions are required by the model
and must be implemented in NavigationGraphBuilder before A1 is considered complete.

---

### 3.5 A1 Definition of Done (blocking gate)

A1 is complete only if:

1) All Angular routes are extracted and normalized.
2) Lazy-loaded modules are resolved.
3) Component registry + widgets extraction is complete and deterministic.
4) Graph nodes include: Virtual `__entry__`, all Routes, all Components, all External destinations.
5) Route → Component structural UI_EFFECT transitions exist for every ComponentRoute.
6) routerLink + href transitions exist as Component → Route/External transitions.
7) router.navigate()/navigateByUrl transitions exist as Component → Route transitions where resolvable.
8) Widget → handler mapping exists (`WidgetEventMaps`).
9) `uiPreconditions` are copied to UI-triggered transitions.
10) Every GraphTransition has a valid Origin (Virtual nodes exempt).
11) `AnalysisValidator.validatePhase1(bundle)` passes.
12) Determinism passes (byte-identical).

If any item fails: A2 is blocked.

---

## 4. A2 — Bounded path enumeration (BLOCKED)

Not to be implemented until A1 is complete and pushed.

Paths(G, k) = all entry-to-terminal paths with:
- max length k
- restricted repeated visits
- deterministic traversal order

Consumes exported G only. No AST re-read.

---

## 5. A3 — Constraint aggregation + pruning (BLOCKED)

C(w) = union of constraint summaries across transitions along w.
Normalize into atomic schema and prune unsatisfiable workflows.

---

## 6. Phase B — Realization + execution + coverage (BLOCKED)

Coverage = |E| / |W| with fixed denominator W.

---